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
import {
  validateFlowData,
  scanCanvasResources,
  type CanvasResources,
} from './canvas-flow-designer';
import { createNotification } from './notifications';

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

  // Phase 131 Plan 03: progress reporter throttling
  // lastNotifyAt[jobId] = epoch ms of last emitted progress message.
  // Entries are deleted on terminal status transitions (markTerminal).
  private static lastNotifyAt: Map<string, number> = new Map();
  private static readonly NOTIFY_INTERVAL_MS = 60_000;

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
    const decomposerOut = this.parseJSON(decomposerRaw) as { tasks?: unknown };
    const tasks = decomposerOut.tasks ?? [];
    updateIntentJob(job.id, {
      progressMessage: { phase: 'decomposer', goal, tasks, message: 'Tareas identificadas' },
    });
    const taskCount = Array.isArray(tasks) ? tasks.length : 0;
    this.notifyProgress(job, `${taskCount} tareas identificadas`, true);

    // Phase 3: architect
    updateIntentJob(job.id, { pipeline_phase: 'architect' });
    this.notifyProgress(job, 'Procesando fase=architect...', true);
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
    this.notifyProgress(job, 'Procesando fase=architect...', true);
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

    await this.sendProposal(job, canvasId, goal, tasks);
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

  private static scanResources(): CanvasResources {
    return scanCanvasResources(db);
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

  private static async sendProposal(
    job: IntentJobRow,
    canvasId: string,
    goal: unknown,
    tasks: unknown,
  ): Promise<void> {
    const taskList = Array.isArray(tasks)
      ? (tasks as Array<{ name?: string }>).map(t => `\u{2022} ${t.name ?? '?'}`).join('\n')
      : '';
    const body = `**Objetivo:** ${String(goal)}\n\n**Plan:**\n${taskList}\n\n\u00BFEjecutar este CatFlow?`;

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
            { text: '\u{2705} Ejecutar', callback_data: `pipeline:${job.id}:approve` },
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
