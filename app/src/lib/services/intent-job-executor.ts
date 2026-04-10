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
  type IntentJobRow,
} from '@/lib/catbot-db';
import { logger } from '@/lib/logger';
import db from '@/lib/db';
import { generateId } from '@/lib/utils';
import {
  STRATEGIST_PROMPT,
  DECOMPOSER_PROMPT,
  ARCHITECT_PROMPT,
} from './catbot-pipeline-prompts';

const CHECK_INTERVAL = 30 * 1000; // 30s
const BOOT_DELAY = 60_000;         // 60s — staggered after IntentWorker (45s)

interface ArchitectDesign {
  name: string;
  description: string;
  flow_data: { nodes: unknown[]; edges: unknown[] };
  needs_cat_paws?: Array<{ name: string; system_prompt: string; reason: string }>;
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
    this.intervalId = null;
    this.timeoutId = null;
  }

  static cleanupOrphans(): void {
    cleanupOrphanJobs();
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
    const strategistRaw = await this.callLLM(STRATEGIST_PROMPT, this.buildStrategistInput(job));
    const strategistOut = this.parseJSON(strategistRaw) as { goal?: unknown };
    const goal = strategistOut.goal ?? '';
    updateIntentJob(job.id, {
      progressMessage: { phase: 'strategist', goal, message: 'Objetivo definido' },
    });
    this.notifyProgress(job, 'Definiendo objetivo...');

    // Phase 2: decomposer
    updateIntentJob(job.id, { pipeline_phase: 'decomposer' });
    const decomposerRaw = await this.callLLM(
      DECOMPOSER_PROMPT,
      JSON.stringify({ goal, original: job.tool_args }),
    );
    const decomposerOut = this.parseJSON(decomposerRaw) as { tasks?: unknown };
    const tasks = decomposerOut.tasks ?? [];
    updateIntentJob(job.id, {
      progressMessage: { phase: 'decomposer', goal, tasks, message: 'Tareas identificadas' },
    });
    const taskCount = Array.isArray(tasks) ? tasks.length : 0;
    this.notifyProgress(job, `${taskCount} tareas identificadas`);

    // Phase 3: architect
    updateIntentJob(job.id, { pipeline_phase: 'architect' });
    const resources = this.scanResources();
    const architectRaw = await this.callLLM(
      ARCHITECT_PROMPT,
      JSON.stringify({ goal, tasks, resources }),
    );
    const design = this.parseJSON(architectRaw) as ArchitectDesign;

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
      return;
    }

    if (!prev.cat_paws_resolved) {
      updateIntentJob(job.id, {
        status: 'failed',
        error: 'architect_retry sin cat_paws_resolved',
      });
      return;
    }

    updateIntentJob(job.id, { pipeline_phase: 'architect' });
    const resources = this.scanResources();
    const architectRaw = await this.callLLM(
      ARCHITECT_PROMPT,
      JSON.stringify({ goal: prev.goal, tasks: prev.tasks, resources }),
    );
    const design = this.parseJSON(architectRaw) as ArchitectDesign;

    await this.finalizeDesign(job, design, prev.goal, prev.tasks, resources);
  }

  // -------------------------------------------------------------------------
  // Shared finalization: either pause for cat_paws or create canvas
  // -------------------------------------------------------------------------

  private static async finalizeDesign(
    job: IntentJobRow,
    design: ArchitectDesign,
    goal: unknown,
    tasks: unknown,
    resources: Record<string, unknown>,
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
          message: `Necesito crear ${design.needs_cat_paws.length} CatPaws nuevos`,
        },
      });
      this.notifyUserCatPawApproval(job, design.needs_cat_paws);
      return;
    }

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

    this.sendProposal(job, canvasId, goal, tasks);
    logger.info('intent-job-executor', 'Proposal sent', { jobId: job.id, canvasId });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private static async callLLM(systemPrompt: string, userInput: string): Promise<string> {
    const litellmUrl = process['env']['LITELLM_URL'] || 'http://litellm:4000';
    const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
    const model = process['env']['CATBOT_PIPELINE_MODEL'] || 'ollama/gemma3:12b';

    const res = await fetch(`${litellmUrl}/v1/chat/completions`, {
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
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`litellm ${res.status}: ${body}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? '{}';
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

  private static scanResources(): Record<string, unknown> {
    try {
      const catPaws = db
        .prepare('SELECT id, name, description, mode, system_prompt FROM cat_paws WHERE is_active = 1 LIMIT 50')
        .all();
      const catBrains = db.prepare('SELECT id, name, description FROM catbrains LIMIT 50').all();
      const skills = db.prepare('SELECT id, name, description FROM skills LIMIT 50').all();
      const connectors = db.prepare('SELECT id, name, type FROM connectors LIMIT 50').all();
      return { catPaws, catBrains, skills, connectors };
    } catch (err) {
      logger.warn('intent-job-executor', 'scanResources fallback to empty', {
        error: String(err),
      });
      return { catPaws: [], catBrains: [], skills: [], connectors: [] };
    }
  }

  // -------------------------------------------------------------------------
  // Notification stubs (Plan 04 will replace these with real channels)
  // -------------------------------------------------------------------------

  private static notifyProgress(job: IntentJobRow, message: string): void {
    logger.info('intent-job-executor', 'Progress', { jobId: job.id, message });
  }

  private static sendProposal(
    job: IntentJobRow,
    canvasId: string,
    goal: unknown,
    tasks: unknown,
  ): void {
    logger.info('intent-job-executor', 'Proposal ready (stub)', {
      jobId: job.id,
      canvasId,
      goal,
      tasks,
    });
  }

  private static notifyUserCatPawApproval(
    job: IntentJobRow,
    needs: Array<{ name: string; system_prompt: string; reason: string }>,
  ): void {
    logger.info('intent-job-executor', 'CatPaw approval requested (stub)', {
      jobId: job.id,
      count: needs.length,
    });
  }
}
