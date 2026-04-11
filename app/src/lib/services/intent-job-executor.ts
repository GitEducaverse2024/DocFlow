/**
 * IntentJobExecutor — Phase 130 async CatFlow pipeline worker.
 *
 * Picks pending jobs from intent_jobs and drives them through the 3-phase
 * pipeline (strategist -> decomposer -> architect) via direct LiteLLM calls.
 * Uses response_format: json_object so each phase returns structured output
 * without a tool loop or /api/catbot/chat re-entry.
 *
 * Concurrency: one job per tick, guarded by currentJobId. BOOT_DELAY=60s
 * staggers after AlertService (30s) and IntentWorker (45s).
 *
 * State machine:
 *  - pending/strategist entry -> full 3-phase run
 *  - architect_retry entry    -> single architect call, reuses persisted
 *                                goal+tasks (resume path after the user
 *                                approves needs_cat_paws via Plan 04 Task 4)
 *  - needs_cat_paws != []     -> pause in awaiting_user, no canvas created
 *  - otherwise                -> INSERT canvases + awaiting_approval
 */

import {
  getNextPendingJob,
  updateIntentJob,
  cleanupOrphanJobs,
  saveKnowledgeGap,
  updateComplexityOutcome,
  catbotDb,
  type IntentJobRow,
} from '@/lib/catbot-db';
import { logger } from '@/lib/logger';
import db from '@/lib/db';
import { generateId } from '@/lib/utils';
import {
  STRATEGIST_PROMPT,
  DECOMPOSER_PROMPT,
  ARCHITECT_PROMPT,
  CANVAS_QA_PROMPT,
} from './catbot-pipeline-prompts';
import {
  validateFlowData,
  scanCanvasResources,
  insertSideEffectGuards,
  validateCanvasDeterministic,
  type CanvasResources,
  type SideEffectContext,
  type ValidateCanvasResult,
} from './canvas-flow-designer';
import { loadRulesIndex, getCanvasRule } from './canvas-rules';
import { createNotification } from './notifications';

const CHECK_INTERVAL = 30 * 1000; // 30s
const BOOT_DELAY = 60_000;         // 60s — staggered after IntentWorker (45s)

interface ArchitectDesign {
  name: string;
  description: string;
  flow_data: { nodes: unknown[]; edges: unknown[] };
  needs_cat_paws?: Array<{ name: string; system_prompt: string; reason: string }>;
  // Phase 132: architect may request expanded detail for specific rule IDs
  // before committing to its final design. Expansion pass happens intra-iteration.
  needs_rule_details?: string[];
}

// Phase 134 Plan 04 (ARCH-DATA-06): data_contract_score is the NEW field
// reviewers are asked to emit (CANVAS_QA_PROMPT in catbot-pipeline-prompts.ts).
// It is optional for retrocompat: if an older reviewer response or a degraded
// LLM output omits it, decideQaOutcome falls back to quality_score.
// Phase 135 Plan 03 (ARCH-PROMPT-12): CANVAS_QA_PROMPT v135 extends the
// reviewer output schema with instruction_quality_score + per-issue scope +
// node_role. All three are optional to preserve backward compat with the
// existing 47 intent-job-executor tests and any Phase 134 mock that still
// emits the 5-field issue shape.
interface QaReport {
  quality_score?: number;
  data_contract_score?: number;
  instruction_quality_score?: number;
  issues?: Array<{
    severity?: string;
    rule_id?: string;
    node_id?: string;
    node_role?: string;
    scope?: string;
    description?: string;
    fix_hint?: string;
  }>;
  data_contract_analysis?: Record<string, string>;
  recommendation?: 'accept' | 'revise' | 'reject' | string;
}

interface ResumeProgress {
  goal?: unknown;
  tasks?: unknown;
  cat_paws_resolved?: boolean;
}

export class IntentJobExecutor {
  private static intervalId: ReturnType<typeof setInterval> | null = null;
  private static timeoutId: ReturnType<typeof setTimeout> | null = null;
  private static currentJobId: string | null = null;

  // Phase 131 Plan 03: progress reporter throttling
  // lastNotifyAt[jobId] = epoch ms of last emitted progress message.
  // Entries are deleted on terminal status transitions (markTerminal).
  private static lastNotifyAt: Map<string, number> = new Map();
  private static readonly NOTIFY_INTERVAL_MS = 60_000;

  // Phase 132 Plan 02: architect + QA review loop hard cap. Each iteration is
  // 2 LLM calls (architect + QA). Max total = 4 LLM calls before giving up.
  private static readonly MAX_QA_ITERATIONS = 2;

  // Phase 133 Plan 03 (FOUND-05): belt-and-braces reaper that kills jobs
  // stuck in a non-terminal pipeline_phase for > 10 min. Second line of
  // defense independent from callLLM's 90s timeout — covers hangs in
  // scanCanvasResources, DB roundtrips, or any await outside the fetch.
  private static reaperStarted = false;
  private static reaperInterval: ReturnType<typeof setInterval> | null = null;
  private static readonly REAPER_INTERVAL_MS = 5 * 60 * 1000;
  private static readonly STALE_THRESHOLD_SQL = "-10 minutes";
  private static readonly STALE_PHASES = ['strategist', 'decomposer', 'architect'] as const;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  static start(): void {
    logger.info('intent-job-executor', 'Starting with boot delay', { delayMs: BOOT_DELAY });
    try {
      this.cleanupOrphans();
    } catch (err) {
      logger.error('intent-job-executor', 'cleanupOrphans failed on start', { error: String(err) });
    }
    // Phase 133 Plan 03 (FOUND-05): belt-and-braces reaper for stale jobs.
    // Runs every 5min, kills anything stuck in strategist|decomposer|architect
    // for > 10min that the callLLM 90s timeout (FOUND-04) didn't catch.
    try {
      this.startReaper();
    } catch (err) {
      logger.error('intent-job-executor', 'startReaper failed', { error: String(err) });
    }
    this.timeoutId = setTimeout(() => {
      this.tick().catch(err =>
        logger.error('intent-job-executor', 'Tick error', { error: String(err) }),
      );
      this.intervalId = setInterval(() => {
        this.tick().catch(err =>
          logger.error('intent-job-executor', 'Tick error', { error: String(err) }),
        );
      }, CHECK_INTERVAL);
    }, BOOT_DELAY);
  }

  static stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.reaperInterval) clearInterval(this.reaperInterval);
    this.intervalId = null;
    this.timeoutId = null;
    this.reaperInterval = null;
    this.reaperStarted = false;
  }

  static cleanupOrphans(): void {
    cleanupOrphanJobs();
  }

  // -------------------------------------------------------------------------
  // Phase 133 Plan 03 (FOUND-05): stale-job reaper
  // -------------------------------------------------------------------------

  /**
   * Schedules `reapStaleJobs()` every 5 minutes. Idempotent — calling twice
   * does NOT create a second interval (guarded by `reaperStarted`). Wired
   * from `start()` so it runs in the same lifecycle as the main tick.
   *
   * NOTE: we deliberately do NOT run `reapStaleJobs()` immediately here;
   * the executor's `start()` already takes BOOT_DELAY (60s) to stagger
   * behind the worker, and the first interval fire at +5min is early enough
   * for a belt-and-braces layer whose threshold is 10min.
   */
  static startReaper(): void {
    if (this.reaperStarted) return;
    this.reaperStarted = true;
    this.reaperInterval = setInterval(() => {
      this.reapStaleJobs().catch((err) =>
        logger.error('intent-job-executor', 'reapStaleJobs failed', { error: String(err) }),
      );
    }, this.REAPER_INTERVAL_MS);
    logger.info('intent-job-executor', 'Reaper started', {
      intervalMs: this.REAPER_INTERVAL_MS,
      staleThreshold: this.STALE_THRESHOLD_SQL,
    });
  }

  /**
   * Selects every `intent_jobs` row where `pipeline_phase` is a non-terminal
   * pipeline stage AND `updated_at` is older than 10 minutes, and marks them
   * failed. For each reaped row:
   *   - force-notifies the user on the original channel (telegram or web)
   *   - writes status=failed with error 'reaper: stale > 10min'
   *   - clears `currentJobId` if it pointed at a reaped row
   *   - calls `markTerminal()` to clean the throttle map
   *
   * Excluded from reaping: `awaiting_user`, `awaiting_approval` (legitimate
   * human-wait phases that can live for hours), and terminal phases.
   *
   * Returns the number of rows reaped (0 on no-op).
   */
  static async reapStaleJobs(): Promise<number> {
    const placeholders = this.STALE_PHASES.map(() => '?').join(',');
    let rows: IntentJobRow[];
    try {
      rows = catbotDb
        .prepare(
          `SELECT * FROM intent_jobs
           WHERE pipeline_phase IN (${placeholders})
             AND status NOT IN ('failed', 'completed', 'cancelled')
             AND updated_at < datetime('now', ?)`,
        )
        .all(...this.STALE_PHASES, this.STALE_THRESHOLD_SQL) as IntentJobRow[];
    } catch (err) {
      logger.error('intent-job-executor', 'reaper query failed', { error: String(err) });
      return 0;
    }

    if (rows.length === 0) return 0;

    for (const row of rows) {
      logger.warn('intent-job-executor', 'Reaping stale job', {
        jobId: row.id,
        pipelinePhase: row.pipeline_phase,
        updatedAt: row.updated_at,
      });
      try {
        this.notifyProgress(
          row,
          `\u23F1\uFE0F Pipeline timeout: job ${row.id.slice(0, 8)} colgado > 10min, marcado failed por el reaper.`,
          true,
        );
      } catch (err) {
        logger.warn('intent-job-executor', 'reaper notify failed', {
          jobId: row.id,
          error: String(err),
        });
      }
      try {
        updateIntentJob(row.id, { status: 'failed', error: 'reaper: stale > 10min' });
      } catch (err) {
        logger.error('intent-job-executor', 'reaper updateIntentJob failed', {
          jobId: row.id,
          error: String(err),
        });
      }
      if (this.currentJobId === row.id) {
        this.currentJobId = null;
      }
      this.markTerminal(row.id);
      // Phase 137 Plan 02 (LEARN-08): reaper kill → outcome='timeout'.
      // `row` already has complexity_decision_id from the SELECT above.
      IntentJobExecutor.closeComplexityOutcome(row, 'timeout');
    }
    return rows.length;
  }

  /**
   * Test helper — stops the reaper interval and resets the init guard so
   * test suites can freely call `startReaper()` without leaking timers.
   * Never called from production code.
   */
  static stopReaperForTest(): void {
    if (this.reaperInterval) {
      clearInterval(this.reaperInterval);
      this.reaperInterval = null;
    }
    this.reaperStarted = false;
  }

  // -------------------------------------------------------------------------
  // Main tick
  // -------------------------------------------------------------------------

  static async tick(): Promise<void> {
    if (this.currentJobId) {
      logger.info('intent-job-executor', 'Skipping tick — job in progress', {
        jobId: this.currentJobId,
      });
      return;
    }

    let job: IntentJobRow | undefined;
    try {
      job = getNextPendingJob();
    } catch (err) {
      logger.error('intent-job-executor', 'getNextPendingJob failed', { error: String(err) });
      return;
    }
    if (!job) return;

    this.currentJobId = job.id;
    logger.info('intent-job-executor', 'Processing job', {
      jobId: job.id,
      phase: job.pipeline_phase,
      toolName: job.tool_name,
    });

    try {
      if (job.pipeline_phase === 'architect_retry') {
        await this.runArchitectRetry(job);
      } else {
        await this.runFullPipeline(job);
      }
    } catch (err) {
      logger.error('intent-job-executor', 'Pipeline failed', {
        jobId: job.id,
        error: String(err),
      });
      updateIntentJob(job.id, { status: 'failed', error: String(err) });
      // Notify user on failure — force=true bypasses 60s throttle
      // so the user is not left waiting for a pipeline that will never finish.
      const errShort = String(err).slice(0, 200);
      try {
        this.notifyProgress(job, `\u274C Pipeline fallo: ${errShort}`, true);
      } catch (notifyErr) {
        logger.warn('intent-job-executor', 'Failed to notify user of pipeline failure', {
          jobId: job.id,
          notifyError: String(notifyErr),
        });
      }
      this.markTerminal(job.id);
    } finally {
      this.currentJobId = null;
    }
  }

  // -------------------------------------------------------------------------
  // Branch: full 3-phase run (pending -> strategist -> decomposer -> architect)
  // -------------------------------------------------------------------------

  private static async runFullPipeline(job: IntentJobRow): Promise<void> {
    // Phase 1: strategist
    updateIntentJob(job.id, { pipeline_phase: 'strategist' });
    this.notifyProgress(job, 'Procesando fase=strategist...');
    const strategistRaw = await this.callLLM(STRATEGIST_PROMPT, this.buildStrategistInput(job));
    // Phase 133 Plan 04 (FOUND-06): persist raw strategist output.
    updateIntentJob(job.id, { strategist_output: strategistRaw });
    const strategistOut = this.parseJSON(strategistRaw) as { goal?: unknown };
    const goal = strategistOut.goal ?? '';
    updateIntentJob(job.id, {
      progressMessage: { phase: 'strategist', goal, message: 'Objetivo definido' },
    });
    this.notifyProgress(job, 'Definiendo objetivo...', true);

    // Phase 2: decomposer
    updateIntentJob(job.id, { pipeline_phase: 'decomposer' });
    this.notifyProgress(job, 'Procesando fase=decomposer...');
    const decomposerRaw = await this.callLLM(
      DECOMPOSER_PROMPT,
      JSON.stringify({ goal, original: job.tool_args }),
    );
    // Phase 133 Plan 04 (FOUND-06): persist raw decomposer output.
    updateIntentJob(job.id, { decomposer_output: decomposerRaw });
    const decomposerOut = this.parseJSON(decomposerRaw) as { tasks?: unknown };
    const tasks = decomposerOut.tasks ?? [];
    updateIntentJob(job.id, {
      progressMessage: { phase: 'decomposer', goal, tasks, message: 'Tareas identificadas' },
    });
    const taskCount = Array.isArray(tasks) ? tasks.length : 0;
    this.notifyProgress(job, `${taskCount} tareas identificadas`, true);

    // Phase 3: architect + QA review loop (Phase 132 Plan 02)
    updateIntentJob(job.id, { pipeline_phase: 'architect' });
    this.notifyProgress(job, 'Procesando fase=architect (iter 0)...', true);
    const resources = this.scanResources(typeof goal === 'string' ? goal : undefined);

    const design = await this.runArchitectQALoop(job, goal, tasks, resources);
    if (!design) {
      // loop exhausted; already marked terminal by runArchitectQALoop
      return;
    }

    await this.finalizeDesign(job, design, goal, tasks, resources);
  }

  // -------------------------------------------------------------------------
  // Branch: architect_retry (resume path after user approves CatPaw creation)
  // -------------------------------------------------------------------------

  private static async runArchitectRetry(job: IntentJobRow): Promise<void> {
    let prev: ResumeProgress;
    try {
      prev = JSON.parse(job.progress_message || '{}') as ResumeProgress;
    } catch {
      updateIntentJob(job.id, {
        status: 'failed',
        error: 'architect_retry con progress_message invalido',
      });
      this.markTerminal(job.id);
      return;
    }

    if (!prev.cat_paws_resolved) {
      updateIntentJob(job.id, {
        status: 'failed',
        error: 'architect_retry sin cat_paws_resolved',
      });
      this.markTerminal(job.id);
      return;
    }

    updateIntentJob(job.id, { pipeline_phase: 'architect' });
    this.notifyProgress(job, 'Procesando fase=architect (retry con QA loop)...', true);
    const resources = this.scanResources(
      typeof prev.goal === 'string' ? prev.goal : undefined,
    );

    // Phase 132 fix: resume path ALSO goes through the full QA review loop so
    // canvases generated after CatPaw approval get the same quality gating as
    // fresh pipelines. This closes the "runArchitectRetry bypasses QA" gap.
    const design = await this.runArchitectQALoop(job, prev.goal, prev.tasks, resources);
    if (!design) {
      // loop exhausted; already marked terminal by runArchitectQALoop
      return;
    }

    await this.finalizeDesign(job, design, prev.goal, prev.tasks, resources);
  }

  // -------------------------------------------------------------------------
  // Phase 132: architect + QA review loop with expansion pass
  // -------------------------------------------------------------------------

  /**
   * Runs up to MAX_QA_ITERATIONS of: architect call -> (optional expansion
   * pass for needs_rule_details) -> QA reviewer call. Returns the ArchitectDesign
   * on accept, short-circuits on needs_cat_paws, or returns null after marking
   * the job failed + logging a knowledge gap on exhaustion.
   */
  private static async runArchitectQALoop(
    job: IntentJobRow,
    goal: unknown,
    tasks: unknown,
    resources: CanvasResources,
  ): Promise<ArchitectDesign | null> {
    const rulesIndex = loadRulesIndex();
    const architectSystem = ARCHITECT_PROMPT.replace('{{RULES_INDEX}}', rulesIndex);
    const qaSystem = CANVAS_QA_PROMPT.replace('{{RULES_INDEX}}', rulesIndex);

    let previousDesign: ArchitectDesign | null = null;
    let previousQaReport: QaReport | null = null;

    for (let iter = 0; iter < this.MAX_QA_ITERATIONS; iter++) {
      // --- Architect call ---
      const architectInputObj: Record<string, unknown> = {
        goal,
        tasks,
        resources,
      };
      if (previousQaReport) architectInputObj.qa_report = previousQaReport;
      if (previousDesign) architectInputObj.previous_design = previousDesign;

      this.notifyProgress(job, `Architect iteracion ${iter}...`, true);

      // Phase 134 Plan 03 (ARCH-DATA-01, BLOCKER 3 closure): emit shape audit
      // BEFORE the callLLM so logs prove the enriched arrays actually reached
      // architectInputObj. We log both counts AND per-item {id,name,*_count}
      // arrays so the auditor can verify presence + shape, not just cardinality.
      logger.info('intent-job-executor', 'architect_input', {
        jobId: job.id,
        iteration: iter,
        resources_summary: {
          catPaws: resources.catPaws.length,
          connectors: resources.connectors.length,
          canvas_similar: resources.canvas_similar.length,
          templates: resources.templates.length,
          has_gmail_contracts: resources.connectors.some(
            (c) => c.connector_type === 'gmail' && Object.keys(c.contracts).length > 0,
          ),
        },
        canvas_similar_shape: resources.canvas_similar.map((c) => ({
          id: c.canvas_id,
          name: c.canvas_name,
          node_roles_count: Array.isArray(c.node_roles) ? c.node_roles.length : 0,
        })),
        templates_shape: resources.templates.map((t) => ({
          id: t.template_id,
          name: t.name,
          node_types_count: Array.isArray(t.node_types) ? t.node_types.length : 0,
        })),
        catPaws_shape: resources.catPaws.map((p) => ({
          id: p.paw_id,
          name: p.paw_name,
          tools_count: Array.isArray(p.tools_available) ? p.tools_available.length : 0,
        })),
      });

      const architectRaw = await this.callLLM(
        architectSystem,
        JSON.stringify(architectInputObj),
      );
      let design = this.parseJSON(architectRaw) as ArchitectDesign;
      // Phase 133 Plan 04 (FOUND-06): track the raw architect output for this
      // iteration. Overwritten below if an expansion pass replaces it.
      let architectRawFinal: string = architectRaw;

      // --- Expansion pass: needs_rule_details ---
      // Intra-iteration, only runs once, does NOT consume a QA iteration slot.
      if (
        design &&
        Array.isArray(design.needs_rule_details) &&
        design.needs_rule_details.length > 0
      ) {
        const expansions: Array<{ id: string; detail: string }> = [];
        for (const ruleId of design.needs_rule_details) {
          try {
            const rule = getCanvasRule(ruleId);
            if (rule) {
              expansions.push({ id: rule.id, detail: rule.long });
            }
            // Missing rules are silently skipped.
          } catch (err) {
            logger.warn('intent-job-executor', 'getCanvasRule failed', {
              jobId: job.id,
              ruleId,
              error: String(err),
            });
          }
        }

        logger.info('intent-job-executor', 'Architect requested rule expansion', {
          jobId: job.id,
          iteration: iter,
          requested: design.needs_rule_details,
          resolved: expansions.length,
        });

        const expandedInputObj: Record<string, unknown> = {
          ...architectInputObj,
          expanded_rules: expansions,
          previous_draft: design.flow_data ?? null,
        };
        this.notifyProgress(job, `Architect expansion pass (iter ${iter})...`, true);
        const expandedRaw = await this.callLLM(
          architectSystem,
          JSON.stringify(expandedInputObj),
        );
        design = this.parseJSON(expandedRaw) as ArchitectDesign;
        // Phase 133 Plan 04 (FOUND-06): the expanded output supersedes the draft.
        architectRawFinal = expandedRaw;
      }

      // Phase 133 Plan 04 (FOUND-06): persist the FINAL architect output for
      // this iteration (post-expansion if it ran). Phase 134 audits this column.
      if (iter === 0) {
        updateIntentJob(job.id, { architect_iter0: architectRawFinal });
      } else if (iter === 1) {
        updateIntentJob(job.id, { architect_iter1: architectRawFinal });
      }

      // --- Short-circuit: architect declares needs_cat_paws → skip QA ---
      if (design && design.needs_cat_paws && design.needs_cat_paws.length > 0) {
        logger.info('intent-job-executor', 'Architect needs cat_paws, skipping QA', {
          jobId: job.id,
          iteration: iter,
        });
        return design;
      }

      // --- Phase 135 Plan 03 (ARCH-PROMPT-13): deterministic pre-LLM gate ---
      // Run the validator BEFORE the QA reviewer. If it rejects, skip the QA
      // call entirely and feed a synthetic QaReport (recommendation:'reject')
      // to the next iteration. Saves tokens on fundamentally broken canvases
      // (unknown agentId, unknown connectorId, cycle, bad node type, etc.).
      const activeSets = IntentJobExecutor.buildActiveSets();
      const flowDataForValidation = (design?.flow_data ?? {
        nodes: [],
        edges: [],
      }) as unknown as Parameters<typeof validateCanvasDeterministic>[0];
      const validation: ValidateCanvasResult = validateCanvasDeterministic(
        flowDataForValidation,
        activeSets,
      );
      if (!validation.ok) {
        logger.info(
          'intent-job-executor',
          'Validator rejected canvas (pre-LLM gate)',
          {
            jobId: job.id,
            iteration: iter,
            issue_count: validation.issues.length,
            first_issue: validation.issues[0]?.description,
          },
        );
        // Synthesize a QaReport so the rest of the loop (decideQaOutcome,
        // persistence, exhaustion notification) behaves identically to an
        // LLM-rejected iteration. data_contract_score=0 + blockers>0 forces
        // decideQaOutcome → 'revise', advancing the loop.
        const syntheticQa: QaReport = {
          quality_score: 0,
          data_contract_score: 0,
          issues: validation.issues.map((i) => ({
            severity: 'blocker',
            scope: 'universal',
            rule_id: i.rule_id,
            node_id: i.node_id ?? undefined,
            node_role: undefined,
            description: i.description,
            fix_hint: `Fix validator issue: ${i.description}`,
          })),
          recommendation: 'reject',
        };

        // Persist as qa_iter{N} raw so FOUND-06 post-mortem still sees the
        // rejection signal even though no LLM call was made.
        const syntheticQaRaw = JSON.stringify(syntheticQa);
        if (iter === 0) {
          updateIntentJob(job.id, { qa_iter0: syntheticQaRaw });
        } else if (iter === 1) {
          updateIntentJob(job.id, { qa_iter1: syntheticQaRaw });
        }

        const qaOutcome = IntentJobExecutor.decideQaOutcome(syntheticQa);
        logger.info('intent-job-executor', 'QA outcome (deterministic)', {
          jobId: job.id,
          iteration: iter,
          score: 0,
          blockers: syntheticQa.issues?.length ?? 0,
          outcome: qaOutcome,
          llm_recommended: 'reject',
          source: 'validator',
        });

        updateIntentJob(job.id, {
          progressMessage: {
            phase: 'architect',
            iteration: iter,
            qa_recommendation: 'reject',
            qa_score: 0,
            qa_outcome: qaOutcome,
            message: `Validator iter ${iter}: ${qaOutcome} (pre-LLM gate)`,
          },
        });

        // Skip QA LLM call; feed synthetic report as feedback for next iter.
        previousDesign = design;
        previousQaReport = syntheticQa;
        continue;
      }

      // --- QA reviewer call ---
      this.notifyProgress(job, `QA review iteracion ${iter}...`, true);
      const qaRaw = await this.callLLM(
        qaSystem,
        JSON.stringify({ canvas_proposal: design, tasks, resources }),
      );
      // Phase 133 Plan 04 (FOUND-06): persist raw QA report for this iteration.
      if (iter === 0) {
        updateIntentJob(job.id, { qa_iter0: qaRaw });
      } else if (iter === 1) {
        updateIntentJob(job.id, { qa_iter1: qaRaw });
      }
      const qaReport = this.parseJSON(qaRaw) as QaReport;

      // Phase 134 Plan 04 (ARCH-DATA-06): the accept/revise decision lives in
      // code (decideQaOutcome), not in qaReport.recommendation. Same scores →
      // same decision, always. We still log llm_recommended for observability.
      const qaOutcome = IntentJobExecutor.decideQaOutcome(qaReport);
      const blockerCount = Array.isArray(qaReport.issues)
        ? qaReport.issues.filter(
            (i) => ((i?.severity ?? '') + '').toLowerCase() === 'blocker',
          ).length
        : 0;
      const decisionScore =
        typeof qaReport.data_contract_score === 'number'
          ? qaReport.data_contract_score
          : qaReport.quality_score;

      logger.info('intent-job-executor', 'QA outcome (deterministic)', {
        jobId: job.id,
        iteration: iter,
        score: decisionScore,
        blockers: blockerCount,
        outcome: qaOutcome,
        llm_recommended: qaReport.recommendation,
      });

      logger.info('intent-job-executor', 'QA review complete', {
        jobId: job.id,
        iteration: iter,
        recommendation: qaReport.recommendation,
        score: qaReport.quality_score,
        data_contract_score: qaReport.data_contract_score,
        outcome: qaOutcome,
        issueCount: Array.isArray(qaReport.issues) ? qaReport.issues.length : 0,
      });

      updateIntentJob(job.id, {
        progressMessage: {
          phase: 'architect',
          iteration: iter,
          qa_recommendation: qaReport.recommendation,
          qa_score: qaReport.quality_score,
          qa_outcome: qaOutcome,
          message: `QA iter ${iter}: ${qaOutcome} (llm: ${String(qaReport.recommendation)})`,
        },
      });

      if (qaOutcome === 'accept') {
        // Phase 137 Plan 02 (LEARN-05): propagate the strategist's refined goal
        // as the start node's initialInput so the first node of the canvas
        // works with purpose context instead of the ambiguous original request.
        // The validator (Phase 135) already guarantees exactly-one start node in
        // the happy path; the try/catch + warn covers pathological outputs that
        // slipped past any future relaxation of that invariant.
        try {
          const flowData = design.flow_data as {
            nodes: Array<Record<string, unknown>>;
          };
          const startNode = flowData.nodes.find(
            (n) => (n as { type?: string }).type === 'start',
          );
          if (startNode) {
            const nodeData =
              ((startNode as { data?: Record<string, unknown> }).data) ?? {};
            (startNode as { data: Record<string, unknown> }).data = {
              ...nodeData,
              initialInput: String(goal),
            };
          } else {
            logger.warn(
              'intent-job-executor',
              'LEARN-05: no start node found in flow_data, skipping goal propagation',
              { jobId: (job as { id?: string }).id },
            );
          }
        } catch (err) {
          logger.warn('intent-job-executor', 'LEARN-05 goal propagation error', {
            error: String(err),
          });
        }
        return design;
      }

      previousDesign = design;
      previousQaReport = qaReport;
    }

    // --- Loop exhausted: log knowledge gap + notify user + mark failed ---
    // Phase 133 Plan 02:
    //   FOUND-07 → persist previousDesign.flow_data in knowledge_gap.context
    //              so Phase 136 post-mortem can inspect what failed without
    //              re-running the pipeline.
    //   FOUND-10 → force-notify the user with top-2 issues BEFORE markTerminal
    //              so they don't see "processing..." for a pipeline that will
    //              never complete.
    logger.warn('intent-job-executor', 'QA loop exhausted without accept', {
      jobId: job.id,
    });
    try {
      saveKnowledgeGap({
        knowledgePath: 'catflow/design/quality',
        query: `Pipeline architect could not produce acceptable canvas for job ${job.id} after ${this.MAX_QA_ITERATIONS} iterations`,
        context: JSON.stringify({
          job_id: job.id,
          goal,
          last_qa_report: previousQaReport,
          last_flow_data: previousDesign?.flow_data ?? null,
        }).slice(0, 8000),
      });
    } catch (err) {
      logger.error('intent-job-executor', 'Failed to log knowledge gap after QA exhaustion', {
        error: String(err),
      });
    }

    // FOUND-10: notify user with top-2 issues by severity before markTerminal.
    // force=true bypasses the 60s throttle — exhaustion is a terminal event,
    // the user must hear about it even if we just sent a "QA review" update.
    try {
      const top2 = this.extractTop2Issues(previousQaReport);
      const exhaustionMsg = top2.length > 0
        ? `\u274C QA agoto iteraciones. Principales problemas:\n${top2.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}`
        : `\u274C QA agoto iteraciones sin issues accionables.`;
      this.notifyProgress(job, exhaustionMsg, true);
    } catch (err) {
      logger.warn('intent-job-executor', 'Failed to notify user of QA exhaustion', {
        error: String(err),
      });
    }

    const lastRecommendation = previousQaReport?.recommendation
      ? String(previousQaReport.recommendation)
      : 'unknown';
    updateIntentJob(job.id, {
      status: 'failed',
      error: `QA loop exhausted after ${this.MAX_QA_ITERATIONS} iterations; last recommendation=${lastRecommendation}`,
    });
    this.markTerminal(job.id);
    // Phase 137 Plan 02 (LEARN-08): close the complexity loop as 'cancelled'
    // (not 'failed' — that value is not in ComplexityDecisionRow['outcome']).
    // The QA exhaustion branch is a deliberate give-up by the architect
    // pipeline, conceptually closer to "cancelled" than "timeout".
    IntentJobExecutor.closeComplexityOutcome(job, 'cancelled');
    return null;
  }

  /**
   * Phase 133 Plan 02 (FOUND-10): rank QA issues by severity and return the
   * top-2 formatted as "[rule_id] description" (truncated to 120 chars) for
   * user-facing exhaustion notifications. Blocker > major/high > minor/medium
   * > other. Unknown severities fall to the bottom.
   */
  private static extractTop2Issues(qa: QaReport | null): string[] {
    if (!qa || !Array.isArray(qa.issues) || qa.issues.length === 0) return [];
    const rank = (sev?: string): number => {
      const s = (sev ?? '').toLowerCase();
      if (s === 'blocker') return 0;
      if (s === 'major' || s === 'high') return 1;
      if (s === 'minor' || s === 'medium') return 2;
      return 3;
    };
    const issues = qa.issues as Array<{ severity?: string; rule_id?: string; description?: string }>;
    const sorted = [...issues].sort((a, b) => rank(a?.severity) - rank(b?.severity));
    return sorted.slice(0, 2).map((i) => {
      const rid = i?.rule_id ? `[${i.rule_id}] ` : '';
      const desc = (i?.description ?? '').slice(0, 120);
      return `${rid}${desc}`.trim();
    }).filter((s) => s.length > 0);
  }

  // -------------------------------------------------------------------------
  // Shared finalization: either pause for cat_paws or create canvas
  // -------------------------------------------------------------------------

  private static async finalizeDesign(
    job: IntentJobRow,
    design: ArchitectDesign,
    goal: unknown,
    tasks: unknown,
    resources: CanvasResources,
  ): Promise<void> {
    if (design.needs_cat_paws && design.needs_cat_paws.length > 0) {
      updateIntentJob(job.id, {
        pipeline_phase: 'awaiting_user',
        progressMessage: {
          phase: 'architect',
          goal,
          tasks,
          cat_paws_needed: design.needs_cat_paws,
          cat_paws_resolved: false,
          message: `Necesito crear ${design.needs_cat_paws.length} CatPaws nuevos. Espero tu aprobacion.`,
        },
      });
      await this.notifyUserCatPawApproval(job, design.needs_cat_paws);
      logger.info('intent-job-executor', 'Paused for CatPaw approval', {
        jobId: job.id,
        count: design.needs_cat_paws.length,
      });
      return;
    }

    const validation = validateFlowData(design.flow_data);
    if (!validation.valid) {
      logger.error('intent-job-executor', 'Architect output invalid', {
        jobId: job.id,
        errors: validation.errors,
      });
      updateIntentJob(job.id, {
        status: 'failed',
        error: `Architect output invalid: ${validation.errors.join('; ')}`,
      });
      this.markTerminal(job.id);
      return;
    }

    // Phase 132 Plan 03: auto-insert condition guards + reporter agents before
    // every side-effect node (storage, multiagent, destructive connectors...).
    // The architect stays focused on the business flow; this post-processor
    // wires the defensive layer so runtime failures trigger auto-repair instead
    // of silent wrong sends.
    //
    // Phase 132 hotfix: ctxResolver looks up the connector table so classifier
    // can resolve Gmail / SMTP / http_api / mcp_server by type when the node
    // doesn't declare an explicit mode/action/tool_name. Cached per-pipeline
    // so we don't hit the DB once per edge.
    const ctxResolver = this.buildConnectorCtxResolver();
    design.flow_data = insertSideEffectGuards(
      design.flow_data as { nodes: Array<Record<string, unknown>>; edges: Array<{ id: string; source: string; target: string }> },
      ctxResolver,
    );

    const canvasId = generateId();
    try {
      db.prepare(`
        INSERT INTO canvases (id, name, description, mode, status, flow_data)
        VALUES (?, ?, ?, 'mixed', 'idle', ?)
      `).run(canvasId, design.name, design.description, JSON.stringify(design.flow_data));
    } catch (err) {
      logger.error('intent-job-executor', 'Canvas insert failed', {
        jobId: job.id,
        error: String(err),
      });
      throw err;
    }

    updateIntentJob(job.id, {
      canvas_id: canvasId,
      pipeline_phase: 'awaiting_approval',
      progressMessage: {
        phase: 'architect',
        goal,
        tasks,
        resources,
        canvas_id: canvasId,
        message: 'Propuesta lista. Esperando aprobacion.',
      },
    });

    await this.sendProposal(job, canvasId, goal);
    logger.info('intent-job-executor', 'Proposal sent', { jobId: job.id, canvasId });

    // Phase 137 Plan 02 (LEARN-08): async pipeline reached awaiting_approval —
    // this is the success terminal for complexity_decisions.outcome from the
    // executor's perspective (the architect produced an acceptable canvas).
    // Runtime success of the canvas itself is evaluated downstream; we only
    // care here that the classification→pipeline path completed as intended.
    IntentJobExecutor.closeComplexityOutcome(job, 'completed');
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Phase 135 Plan 03 (ARCH-PROMPT-13): build active id sets from docflow.db
   * for the deterministic pre-LLM validator. Reads the `cat_paws` and
   * `connectors` tables and returns two Sets of ids. On DB error returns
   * empty sets — the validator will then reject any canvas that references
   * an agent or connector id, surfacing the DB outage loudly instead of
   * letting the architect fabricate slugs unchecked.
   */
  private static buildActiveSets(): {
    activeCatPaws: Set<string>;
    activeConnectors: Set<string>;
  } {
    try {
      const paws = (
        db
          .prepare('SELECT id FROM cat_paws WHERE is_active = 1')
          .all() as Array<{ id: string }>
      ).map((r) => r.id);
      const conns = (
        db
          .prepare('SELECT id FROM connectors WHERE is_active = 1')
          .all() as Array<{ id: string }>
      ).map((r) => r.id);
      return {
        activeCatPaws: new Set(paws),
        activeConnectors: new Set(conns),
      };
    } catch (err) {
      logger.warn(
        'intent-job-executor',
        'buildActiveSets failed — validator will reject everything',
        { error: String(err) },
      );
      return { activeCatPaws: new Set(), activeConnectors: new Set() };
    }
  }

  private static async callLLM(systemPrompt: string, userInput: string): Promise<string> {
    const litellmUrl = process['env']['LITELLM_URL'] || 'http://litellm:4000';
    const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
    const model = process['env']['CATBOT_PIPELINE_MODEL'] || 'gemini-main';

    // Phase 133 Plan 02 (FOUND-04): 90s hard timeout on every pipeline LLM
    // call. Without this, a slow/hanging LiteLLM upstream freezes the single
    // executor slot (currentJobId) indefinitely and no other job can run
    // until the node process restarts. AbortSignal.timeout fires at 90s and
    // the resulting AbortError is rewrapped with a descriptive message so
    // logs and user notifications show "LiteLLM timeout (90s)".
    let res: Response;
    try {
      res = await fetch(`${litellmUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${litellmKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userInput },
          ],
          temperature: 0.3,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
        throw new Error(`litellm timeout (90s): LLM call aborted before response`);
      }
      throw err;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`litellm ${res.status}: ${body}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? '{}';
  }

  /**
   * Phase 134 Plan 04 (ARCH-DATA-06): deterministic QA outcome decision.
   *
   * The accept/revise decision lives HERE in code, NOT in qaReport.recommendation
   * (which is a free-form string emitted by the LLM). Same scores → same decision,
   * always. This makes Phase 136 failure routing reproducible.
   *
   * Rules:
   *   - data_contract_score >= 80 AND no blockers → 'accept'
   *   - everything else → 'revise'
   *
   * Fallback: if data_contract_score is missing (retrocompat with older reviewer
   * output or degraded LLM response), use quality_score. If both are missing
   * (pathological), treat as 0 → 'revise'.
   *
   * Blocker detection is case-insensitive and robust against malformed issues.
   */
  static decideQaOutcome(qa: QaReport | null | undefined): 'accept' | 'revise' {
    const score =
      typeof qa?.data_contract_score === 'number'
        ? qa.data_contract_score
        : typeof qa?.quality_score === 'number'
          ? qa.quality_score
          : 0;
    const issues = Array.isArray(qa?.issues) ? qa!.issues! : [];
    const blockers = issues.filter((i) => {
      const sev = (i?.severity ?? '').toString().toLowerCase();
      return sev === 'blocker';
    });
    if (score >= 80 && blockers.length === 0) return 'accept';
    return 'revise';
  }

  private static parseJSON(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      // Strip markdown fences and retry
      const stripped = raw
        .replace(/^\s*```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      return JSON.parse(stripped);
    }
  }

  private static buildStrategistInput(job: IntentJobRow): string {
    // Phase 131: synthetic tool_name '__description__' means the job was
    // encolado via queue_intent_job({description}) from the complexity gate.
    // The strategist should treat the free-form description as the primary goal.
    if (job.tool_name === '__description__') {
      const parsed = job.tool_args ? this.safeParse(job.tool_args) : {};
      const obj = (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
      const description = (obj.description as string | undefined)
        || (obj.original_request as string | undefined)
        || '';
      return JSON.stringify({
        goal: description,
        description,
        original_request: obj.original_request ?? description,
        channel: job.channel,
      });
    }

    return JSON.stringify({
      tool_name: job.tool_name,
      tool_args: job.tool_args ? this.safeParse(job.tool_args) : {},
      channel: job.channel,
    });
  }

  private static safeParse(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  private static scanResources(goal?: string): CanvasResources {
    return scanCanvasResources(db, { goal });
  }

  /**
   * Phase 132 hotfix: build a connector context resolver that maps a
   * connector-type node to its DB `type` (gmail, smtp, http_api, mcp_server,
   * n8n_webhook, ...). Cached per call to avoid repeated lookups when several
   * edges target the same connector node.
   *
   * This closes the gap where `insertSideEffectGuards` couldn't classify a
   * connector node that lacked an explicit `mode`/`action`/`tool_name` in its
   * data — e.g. a Gmail node whose intent is inferred from the connector type.
   */
  private static buildConnectorCtxResolver(): (node: Record<string, unknown>) => SideEffectContext {
    const cache = new Map<string, string | null>();
    return (node) => {
      if (node.type !== 'connector') return {};
      const data = (node.data ?? {}) as Record<string, unknown>;
      const connectorId = data.connectorId as string | undefined;
      if (!connectorId) return {};
      if (!cache.has(connectorId)) {
        try {
          const row = db
            .prepare('SELECT type FROM connectors WHERE id = ?')
            .get(connectorId) as { type?: string } | undefined;
          cache.set(connectorId, row?.type ?? null);
        } catch (err) {
          logger.warn('intent-job-executor', 'connector ctx lookup failed', {
            connectorId,
            error: String(err),
          });
          cache.set(connectorId, null);
        }
      }
      const type = cache.get(connectorId);
      return type ? { connectorType: type } : {};
    };
  }

  // -------------------------------------------------------------------------
  // Notification stubs (Plan 04 will replace these with real channels)
  // -------------------------------------------------------------------------

  /**
   * Phase 131 Plan 03: progress reporter with 60s throttling.
   *
   * - Suppresses emissions within NOTIFY_INTERVAL_MS per job (unless force=true).
   * - Emits via Telegram sendMessage OR web `pipeline_progress` notification,
   *   depending on job.channel.
   * - Entries in lastNotifyAt are cleaned up when the job reaches a terminal
   *   status via markTerminal().
   */
  private static notifyProgress(job: IntentJobRow, message: string, force: boolean = false): void {
    const now = Date.now();
    const last = this.lastNotifyAt.get(job.id) ?? 0;
    if (!force && now - last < this.NOTIFY_INTERVAL_MS) return;
    this.lastNotifyAt.set(job.id, now);

    logger.info('intent-job-executor', 'Progress', { jobId: job.id, message, force });

    if (job.channel === 'telegram' && job.channel_ref) {
      const chatId = parseInt(job.channel_ref, 10);
      if (!Number.isNaN(chatId)) {
        import('./telegram-bot')
          .then(({ telegramBotService }) => telegramBotService.sendMessage(chatId, `\u{23F3} ${message}`))
          .catch(err => logger.warn('intent-job-executor', 'notifyProgress telegram failed', { error: String(err) }));
      }
      return;
    }

    if (job.channel === 'web') {
      try {
        createNotification({
          type: 'pipeline_progress',
          title: 'CatFlow en progreso',
          message,
          severity: 'info',
          link: `/catflow/${job.canvas_id ?? ''}`,
        });
      } catch (err) {
        logger.warn('intent-job-executor', 'notifyProgress web notification failed', { error: String(err) });
      }
    }
  }

  /**
   * Phase 131 Plan 03: terminal cleanup helper.
   * Called whenever a job transitions to a terminal status
   * (completed/failed/cancelled) so the throttling Map doesn't leak.
   */
  private static markTerminal(jobId: string): void {
    this.lastNotifyAt.delete(jobId);
  }

  /**
   * Phase 137 Plan 02 (LEARN-08): close the complexity_decisions outcome loop
   * for a job that reached a terminal state. Reads complexity_decision_id from
   * the job row and delegates to the existing updateComplexityOutcome helper
   * in catbot-db (do NOT re-implement the UPDATE query). Silently no-ops when
   * the job has no linked decision (pipelines that bypass the classification
   * gate) so callers can invoke it unconditionally on every terminal path.
   *
   * Valid outcomes for the async path:
   *   - 'completed' → architect pipeline reached awaiting_approval
   *   - 'cancelled' → QA loop exhausted, runArchitectQALoop gave up
   *   - 'timeout'   → reaper killed the job (> STALE_THRESHOLD in intermediate phase)
   */
  private static closeComplexityOutcome(
    job: IntentJobRow | { complexity_decision_id?: string | null } | undefined | null,
    outcome: 'completed' | 'cancelled' | 'timeout',
  ): void {
    const decisionId = job
      ? (job as { complexity_decision_id?: string | null }).complexity_decision_id
      : null;
    if (!decisionId) return;
    try {
      updateComplexityOutcome(decisionId, outcome);
    } catch (err) {
      logger.warn('intent-job-executor', 'LEARN-08 closeComplexityOutcome failed', {
        decisionId,
        outcome,
        error: String(err),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Phase 137 Plan 04 (LEARN-07): sendProposal rich format
  //
  // The approval message now shows the canvas title, a node list with an
  // emoji per role (fallback to type, fallback to "•"), an estimated time,
  // and keeps the inline approve/reject buttons with backward-compatible
  // callback_data `pipeline:{jobId}:approve|reject` so the telegram-bot.ts
  // handler does not change.
  // -------------------------------------------------------------------------
  private static readonly ROLE_EMOJI: Record<string, string> = {
    extractor: '\u{1F4E5}',
    transformer: '\u{1F501}',
    synthesizer: '\u{1F9E0}',
    renderer: '\u{1F3A8}',
    emitter: '\u{1F4E4}',
    guard: '\u{1F6A6}',
    reporter: '\u{1F4CA}',
    start: '\u{1F680}',
  };

  // TYPE_EMOJI is a structural fallback for nodes that don't declare a role
  // but have a meaningful type (iterator/condition/merge/start/connector).
  // Generic types like `agent` and `multiagent` are intentionally absent so
  // role-less agents fall through to the default bullet — signaling to the
  // user that the node is missing its role annotation (ARCH-PROMPT-10).
  private static readonly TYPE_EMOJI: Record<string, string> = {
    iterator: '\u{1F501}',
    condition: '\u{1F6A6}',
    connector: '\u{1F50C}',
    merge: '\u{1F500}',
    start: '\u{1F680}',
  };

  private static formatNodeLine(node: {
    id: string;
    type?: string;
    data?: { label?: string; role?: string; instructions?: string; name?: string };
  }): string {
    const role = (node.data?.role ?? '').toLowerCase();
    const type = (node.type ?? '').toLowerCase();
    const emoji = this.ROLE_EMOJI[role] ?? this.TYPE_EMOJI[type] ?? '\u2022';
    const label = node.data?.label ?? node.data?.name ?? node.id;
    const descSrc = node.data?.instructions ?? '';
    const desc = descSrc.length > 60 ? descSrc.slice(0, 57) + '...' : descSrc;
    return `  ${emoji} ${label}${desc ? ' \u2014 ' + desc : ''}`;
  }

  private static estimateMinutes(flowData: { nodes: Array<{ type?: string }> }): number {
    const agentCount = flowData.nodes.filter(
      n => n.type === 'agent' || n.type === 'multiagent',
    ).length;
    const raw = Math.ceil((agentCount * 30) / 60); // 30s avg por agent
    return Math.max(1, Math.min(10, raw));
  }

  private static buildProposalBody(
    canvasName: string,
    flowData: { nodes: Array<Record<string, unknown>> },
    goal: unknown,
  ): string {
    const nodes = flowData.nodes as Array<{
      id: string;
      type?: string;
      data?: { label?: string; role?: string; instructions?: string; name?: string };
    }>;
    const count = nodes.length;
    const MAX_NODES_IN_LIST = 20;
    const visible = nodes.slice(0, MAX_NODES_IN_LIST);
    const lines = visible.map(n => this.formatNodeLine(n));
    const truncationNote =
      count > MAX_NODES_IN_LIST ? `\n  ... y ${count - MAX_NODES_IN_LIST} nodos m\u00e1s` : '';
    const estMin = this.estimateMinutes(flowData);
    const goalStr = typeof goal === 'string' ? goal : JSON.stringify(goal);
    const goalTrunc = goalStr.length > 200 ? goalStr.slice(0, 197) + '...' : goalStr;

    let body = `\u{1F4CB} CatFlow generado: "${canvasName}"\n\n`;
    body += `**Objetivo:** ${goalTrunc}\n\n`;
    body += `Nodos (${count}):\n${lines.join('\n')}${truncationNote}\n\n`;
    body += `\u23F1 Tiempo estimado: ~${estMin} minuto${estMin !== 1 ? 's' : ''}\n\n`;
    body += `\u00BFEjecutar este CatFlow?`;

    // Safety: hard cap at 4000 chars (Telegram limit is 4096; leave headroom).
    if (body.length > 4000) {
      // Rebuild with fewer nodes until we fit, preserving header + footer.
      const header = `\u{1F4CB} CatFlow generado: "${canvasName}"\n\n**Objetivo:** ${goalTrunc}\n\n`;
      const footer = `\n\n\u23F1 Tiempo estimado: ~${estMin} minuto${estMin !== 1 ? 's' : ''}\n\n\u00BFEjecutar este CatFlow?`;
      let kept = visible.length;
      while (kept > 1) {
        kept -= 1;
        const trimmedLines = lines.slice(0, kept);
        const extra = count - kept;
        const note = extra > 0 ? `\n  ... y ${extra} nodos m\u00e1s` : '';
        const candidate = `${header}Nodos (${count}):\n${trimmedLines.join('\n')}${note}${footer}`;
        if (candidate.length <= 4000) {
          body = candidate;
          break;
        }
      }
      if (body.length > 4000) {
        body = body.slice(0, 3990) + '\n... [truncado]';
      }
    }
    return body;
  }

  private static async sendProposal(
    job: IntentJobRow,
    canvasId: string,
    goal: unknown,
  ): Promise<void> {
    // Load canvas (already INSERTed earlier in runArchitectQALoop) to read
    // name + flow_data. The rich proposal body is derived from the real
    // persisted nodes, not the tasks array — that keeps the Telegram message
    // consistent with what the user will see in the canvas UI.
    let canvasName = 'CatFlow';
    let flowData: { nodes: Array<Record<string, unknown>>; edges: unknown[] } = {
      nodes: [],
      edges: [],
    };
    try {
      const row = db
        .prepare('SELECT name, flow_data FROM canvases WHERE id = ?')
        .get(canvasId) as { name: string; flow_data: string } | undefined;
      if (row) {
        canvasName = row.name;
        const parsed = JSON.parse(row.flow_data);
        if (parsed && typeof parsed === 'object') {
          flowData = {
            nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
            edges: Array.isArray(parsed.edges) ? parsed.edges : [],
          };
        }
      }
    } catch (err) {
      logger.warn('intent-job-executor', 'sendProposal canvas load failed', {
        canvasId,
        error: String(err),
      });
    }

    const body = this.buildProposalBody(canvasName, flowData, goal);

    try {
      createNotification({
        type: 'catflow_pipeline',
        title: 'Pipeline listo para aprobar',
        message: body,
        severity: 'info',
        link: `/catflow/${canvasId}`,
      });
    } catch (err) {
      logger.warn('intent-job-executor', 'createNotification sendProposal failed', { error: String(err) });
    }

    if (job.channel === 'telegram' && job.channel_ref) {
      const chatId = parseInt(job.channel_ref, 10);
      if (!Number.isNaN(chatId)) {
        try {
          const { telegramBotService } = await import('./telegram-bot');
          await telegramBotService.sendMessageWithInlineKeyboard(chatId, body, [[
            { text: '\u{2705} Aprobar', callback_data: `pipeline:${job.id}:approve` },
            { text: '\u{274C} Cancelar', callback_data: `pipeline:${job.id}:reject` },
          ]]);
        } catch (err) {
          logger.warn('intent-job-executor', 'sendProposal telegram failed', { error: String(err) });
        }
      }
    }
  }

  private static async notifyUserCatPawApproval(
    job: IntentJobRow,
    needs: Array<{ name: string; system_prompt: string; reason: string }>,
  ): Promise<void> {
    const list = needs
      .map(cp => `\u{2022} **${cp.name}** — ${cp.reason ?? cp.system_prompt.slice(0, 80)}`)
      .join('\n');
    const body = `Para completar el diseno del CatFlow necesito crear estos CatPaws:\n\n${list}\n\n\u00BFLos creo?`;

    try {
      createNotification({
        type: 'catflow_pipeline',
        title: 'Pipeline requiere nuevos CatPaws',
        message: body,
        severity: 'warning',
        link: `/settings/catbot/knowledge?tab=pipelines&job=${job.id}`,
      });
    } catch (err) {
      logger.warn('intent-job-executor', 'createNotification catpaw approval failed', { error: String(err) });
    }

    if (job.channel === 'telegram' && job.channel_ref) {
      const chatId = parseInt(job.channel_ref, 10);
      if (!Number.isNaN(chatId)) {
        try {
          const { telegramBotService } = await import('./telegram-bot');
          await telegramBotService.sendMessageWithInlineKeyboard(chatId, body, [[
            { text: '\u{2705} Crear CatPaws', callback_data: `pipeline:${job.id}:create_catpaws` },
            { text: '\u{274C} Cancelar', callback_data: `pipeline:${job.id}:reject` },
          ]]);
        } catch (err) {
          logger.warn('intent-job-executor', 'notifyUserCatPawApproval telegram failed', { error: String(err) });
        }
      }
    }
  }
}
