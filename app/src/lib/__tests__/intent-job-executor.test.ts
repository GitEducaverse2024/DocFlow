import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ---------------------------------------------------------------------------
// Use a temp DB so tests never touch production catbot.db
// ---------------------------------------------------------------------------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'intent-job-executor-test-'));
const tmpDbPath = path.join(tmpDir, 'catbot-test.db');
process['env']['CATBOT_DB_PATH'] = tmpDbPath;

// ---------------------------------------------------------------------------
// Mocks for heavy transitive deps
// ---------------------------------------------------------------------------

const canvasInsertRun = vi.fn();
const dbPrepareMock = vi.fn((sql: string) => {
  void sql;
  return {
    run: canvasInsertRun,
    get: vi.fn(() => undefined),
    all: vi.fn(() => []),
  };
});

vi.mock('@/lib/db', () => ({
  default: { prepare: dbPrepareMock },
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// Phase 131: notifyProgress targets
const telegramSendMessageMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/services/telegram-bot', () => ({
  telegramBotService: {
    sendMessage: telegramSendMessageMock,
    sendMessageWithInlineKeyboard: vi.fn().mockResolvedValue(undefined),
  },
}));

const createNotificationMock = vi.fn();
vi.mock('@/lib/services/notifications', () => ({
  createNotification: createNotificationMock,
}));

// ---------------------------------------------------------------------------
// Dynamic imports after env var set
// ---------------------------------------------------------------------------
type DbModule = typeof import('@/lib/catbot-db');
type ExecModule = typeof import('@/lib/services/intent-job-executor');

let createIntentJob: DbModule['createIntentJob'];
let getIntentJob: DbModule['getIntentJob'];
let catbotDbRef: DbModule['catbotDb'];
let IntentJobExecutor: ExecModule['IntentJobExecutor'];

beforeAll(async () => {
  const dbMod = await import('@/lib/catbot-db');
  createIntentJob = dbMod.createIntentJob;
  getIntentJob = dbMod.getIntentJob;
  catbotDbRef = dbMod.catbotDb;

  const execMod = await import('@/lib/services/intent-job-executor');
  IntentJobExecutor = execMod.IntentJobExecutor;
});

beforeEach(() => {
  catbotDbRef.prepare('DELETE FROM intent_jobs').run();
  canvasInsertRun.mockClear();
  dbPrepareMock.mockClear();
  // reset singleton guard
  (IntentJobExecutor as unknown as { currentJobId: string | null }).currentJobId = null;
});

// ---------------------------------------------------------------------------
// Canned LLM responses
// ---------------------------------------------------------------------------
const STRATEGIST_OK = JSON.stringify({
  goal: 'Crear reporte consolidado',
  success_criteria: ['email enviado'],
  estimated_steps: 3,
});
const DECOMPOSER_OK = JSON.stringify({
  tasks: [
    { id: 't1', name: 'Obtener datos', description: 'fetch', depends_on: [], expected_output: 'json' },
    { id: 't2', name: 'Enviar email', description: 'send', depends_on: ['t1'], expected_output: 'ok' },
  ],
});
const ARCHITECT_OK = JSON.stringify({
  name: 'Reporte Diario',
  description: 'Pipeline de reporte',
  flow_data: {
    nodes: [
      { id: 'n1', type: 'agent', data: { agentId: 'cp-1' }, position: { x: 100, y: 100 } },
      { id: 'n2', type: 'connector', data: {}, position: { x: 300, y: 100 } },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
  },
});
const ARCHITECT_NEEDS_PAWS = JSON.stringify({
  name: 'X',
  description: 'Y',
  flow_data: { nodes: [], edges: [] },
  needs_cat_paws: [
    { name: 'PawNuevo', system_prompt: 'SP', reason: 'no existe experto' },
  ],
});

describe('IntentJobExecutor state machine', () => {
  it('happy path: pending job completes 3 phases and ends in awaiting_approval with canvas_id', async () => {
    const jobId = createIntentJob({ userId: 'u1', toolName: 'execute_catflow', toolArgs: { x: 1 } });

    const scanSpy = vi
      .spyOn(IntentJobExecutor as unknown as { scanResources: () => Record<string, unknown> }, 'scanResources')
      .mockReturnValue({ catPaws: [], catBrains: [], skills: [], connectors: [] });

    const callSpy = vi
      .spyOn(IntentJobExecutor as unknown as { callLLM: (p: string, u: string) => Promise<string> }, 'callLLM')
      .mockResolvedValueOnce(STRATEGIST_OK)
      .mockResolvedValueOnce(DECOMPOSER_OK)
      .mockResolvedValueOnce(ARCHITECT_OK);

    await IntentJobExecutor.tick();

    expect(callSpy).toHaveBeenCalledTimes(3);
    const job = getIntentJob(jobId)!;
    expect(job.pipeline_phase).toBe('awaiting_approval');
    expect(job.canvas_id).toBeTruthy();
    scanSpy.mockRestore();
    callSpy.mockRestore();
  });

  it('pause path: architect returns needs_cat_paws → awaiting_user, no canvas', async () => {
    const jobId = createIntentJob({ userId: 'u1', toolName: 'execute_task', toolArgs: {} });

    const scanSpy = vi
      .spyOn(IntentJobExecutor as unknown as { scanResources: () => Record<string, unknown> }, 'scanResources')
      .mockReturnValue({ catPaws: [], catBrains: [], skills: [], connectors: [] });

    const callSpy = vi
      .spyOn(IntentJobExecutor as unknown as { callLLM: (p: string, u: string) => Promise<string> }, 'callLLM')
      .mockResolvedValueOnce(STRATEGIST_OK)
      .mockResolvedValueOnce(DECOMPOSER_OK)
      .mockResolvedValueOnce(ARCHITECT_NEEDS_PAWS);

    await IntentJobExecutor.tick();

    const job = getIntentJob(jobId)!;
    expect(job.pipeline_phase).toBe('awaiting_user');
    expect(job.canvas_id).toBeNull();
    const progress = JSON.parse(job.progress_message);
    expect(progress.cat_paws_needed).toBeDefined();
    expect(progress.cat_paws_needed.length).toBe(1);
    expect(progress.cat_paws_resolved).toBe(false);
    scanSpy.mockRestore();
    callSpy.mockRestore();
  });

  it('resume path (architect_retry): only 1 LLM call, ends in awaiting_approval', async () => {
    // Create job directly in architect_retry state with persisted goal+tasks
    const jobId = 'retry-job-1';
    catbotDbRef.prepare(`
      INSERT INTO intent_jobs (id, user_id, tool_name, tool_args, status, pipeline_phase, progress_message)
      VALUES (?, 'u1', 'execute_catflow', '{}', 'pending', 'architect_retry', ?)
    `).run(
      jobId,
      JSON.stringify({
        goal: 'Crear reporte consolidado',
        tasks: [{ id: 't1', name: 'T1' }],
        cat_paws_resolved: true,
      }),
    );

    const scanSpy = vi
      .spyOn(IntentJobExecutor as unknown as { scanResources: () => Record<string, unknown> }, 'scanResources')
      .mockReturnValue({ catPaws: [{ id: 'cp-new', name: 'Nuevo' }], catBrains: [], skills: [], connectors: [] });

    const callSpy = vi
      .spyOn(IntentJobExecutor as unknown as { callLLM: (p: string, u: string) => Promise<string> }, 'callLLM')
      .mockResolvedValueOnce(ARCHITECT_OK);

    await IntentJobExecutor.tick();

    expect(callSpy).toHaveBeenCalledTimes(1);
    const job = getIntentJob(jobId)!;
    expect(job.pipeline_phase).toBe('awaiting_approval');
    expect(job.canvas_id).toBeTruthy();
    scanSpy.mockRestore();
    callSpy.mockRestore();
  });

  it('resume path fails if cat_paws_resolved is false', async () => {
    const jobId = 'retry-job-2';
    catbotDbRef.prepare(`
      INSERT INTO intent_jobs (id, user_id, tool_name, tool_args, status, pipeline_phase, progress_message)
      VALUES (?, 'u1', 'execute_catflow', '{}', 'pending', 'architect_retry', ?)
    `).run(jobId, JSON.stringify({ goal: 'g', tasks: [], cat_paws_resolved: false }));

    await IntentJobExecutor.tick();

    const job = getIntentJob(jobId)!;
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/cat_paws_resolved/);
  });

  it('error path: strategist LLM fails → job failed with litellm error', async () => {
    const jobId = createIntentJob({ userId: 'u1', toolName: 'execute_catflow' });

    const callSpy = vi
      .spyOn(IntentJobExecutor as unknown as { callLLM: (p: string, u: string) => Promise<string> }, 'callLLM')
      .mockRejectedValueOnce(new Error('litellm 500: upstream timeout'));

    await IntentJobExecutor.tick();

    const job = getIntentJob(jobId)!;
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/litellm/);
    callSpy.mockRestore();
  });

  it('currentJobId guard: skips tick when job already in progress', async () => {
    createIntentJob({ userId: 'u1', toolName: 'execute_catflow' });
    (IntentJobExecutor as unknown as { currentJobId: string | null }).currentJobId = 'some-other-job';

    const callSpy = vi
      .spyOn(IntentJobExecutor as unknown as { callLLM: (p: string, u: string) => Promise<string> }, 'callLLM')
      .mockResolvedValue(STRATEGIST_OK);

    await IntentJobExecutor.tick();
    expect(callSpy).not.toHaveBeenCalled();
    callSpy.mockRestore();
  });

  it('cleanupOrphans: orphan jobs in intermediate phase become failed with Abandoned on restart', async () => {
    const orphanId = 'orphan-1';
    catbotDbRef.prepare(`
      INSERT INTO intent_jobs (id, user_id, tool_name, tool_args, status, pipeline_phase)
      VALUES (?, 'u1', 'execute_catflow', '{}', 'pending', 'strategist')
    `).run(orphanId);

    IntentJobExecutor.cleanupOrphans();

    const job = getIntentJob(orphanId)!;
    expect(job.status).toBe('failed');
    expect(job.error).toBe('Abandoned on restart');
  });

  it('parseJSON fallback: strips markdown fences before failing', async () => {
    const jobId = createIntentJob({ userId: 'u1', toolName: 'execute_catflow' });

    const fenced = '```json\n' + STRATEGIST_OK + '\n```';

    const scanSpy = vi
      .spyOn(IntentJobExecutor as unknown as { scanResources: () => Record<string, unknown> }, 'scanResources')
      .mockReturnValue({ catPaws: [], catBrains: [], skills: [], connectors: [] });

    const callSpy = vi
      .spyOn(IntentJobExecutor as unknown as { callLLM: (p: string, u: string) => Promise<string> }, 'callLLM')
      .mockResolvedValueOnce(fenced)
      .mockResolvedValueOnce(DECOMPOSER_OK)
      .mockResolvedValueOnce(ARCHITECT_OK);

    await IntentJobExecutor.tick();

    const job = getIntentJob(jobId)!;
    expect(job.pipeline_phase).toBe('awaiting_approval');
    scanSpy.mockRestore();
    callSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Phase 131 Plan 03: notifyProgress throttling
// ---------------------------------------------------------------------------

type NotifyProgressFn = (job: unknown, message: string, force?: boolean) => void;

interface ExecutorInternals {
  notifyProgress: NotifyProgressFn;
  lastNotifyAt: Map<string, number>;
}

function getInternals(): ExecutorInternals {
  return IntentJobExecutor as unknown as ExecutorInternals;
}

function resetThrottleMap(): void {
  getInternals().lastNotifyAt = new Map<string, number>();
}

function callNotify(job: unknown, message: string, force?: boolean): void {
  const fn = getInternals().notifyProgress.bind(IntentJobExecutor);
  fn(job, message, force);
}

function telegramJob(id: string, chat: string = '12345'): Record<string, unknown> {
  return { id, channel: 'telegram', channel_ref: chat, tool_name: 'execute_catflow' };
}

function webJob(id: string): Record<string, unknown> {
  return { id, channel: 'web', channel_ref: null, tool_name: 'execute_catflow', canvas_id: 'cv-1' };
}

describe('notifyProgress throttling (Phase 131)', () => {
  let nowMs = 0;
  let dateNowSpy: ReturnType<typeof vi.spyOn>;

  async function flush(): Promise<void> {
    // Drain pending microtasks + a couple of macrotask ticks (dynamic import
    // resolves on a microtask after the module loader walks its dependency
    // tree; concurrent imports may need an extra macrotask tick).
    for (let i = 0; i < 3; i++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      for (let j = 0; j < 20; j++) {
        await Promise.resolve();
      }
    }
  }

  beforeEach(() => {
    telegramSendMessageMock.mockClear();
    createNotificationMock.mockClear();
    resetThrottleMap();
    nowMs = new Date('2026-04-10T00:00:00Z').getTime();
    dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  it('Test 1: first call for a telegram job emits via telegramBotService.sendMessage', async () => {
    callNotify(telegramJob('job-a'), 'first message');
    await flush();
    expect(telegramSendMessageMock).toHaveBeenCalledTimes(1);
    const [chatId, text] = telegramSendMessageMock.mock.calls[0];
    expect(chatId).toBe(12345);
    expect(text).toContain('first message');
  });

  it('Test 2: second call within 60s for same jobId is suppressed', async () => {
    callNotify(telegramJob('job-b'), 'msg 1');
    await flush();
    expect(telegramSendMessageMock).toHaveBeenCalledTimes(1);

    nowMs += 30_000; // +30s
    callNotify(telegramJob('job-b'), 'msg 2');
    await flush();
    expect(telegramSendMessageMock).toHaveBeenCalledTimes(1);
  });

  it('Test 3: force=true emits even within the 60s window', async () => {
    callNotify(telegramJob('job-c'), 'msg 1');
    await flush();
    expect(telegramSendMessageMock).toHaveBeenCalledTimes(1);

    nowMs += 10_000; // +10s
    callNotify(telegramJob('job-c'), 'msg 2 forced', true);
    await flush();
    expect(telegramSendMessageMock).toHaveBeenCalledTimes(2);
  });

  it('Test 4: call after 61s+ re-emits without force', async () => {
    callNotify(telegramJob('job-d'), 'msg 1');
    await flush();
    expect(telegramSendMessageMock).toHaveBeenCalledTimes(1);

    nowMs += 61_000; // +61s
    callNotify(telegramJob('job-d'), 'msg 2');
    await flush();
    expect(telegramSendMessageMock).toHaveBeenCalledTimes(2);
  });

  it('Test 5: different jobIds are tracked independently', async () => {
    callNotify(telegramJob('job-e', '10001'), 'msg 1');
    await flush();
    callNotify(telegramJob('job-f', '10002'), 'msg 1');
    await flush();
    expect(telegramSendMessageMock).toHaveBeenCalledTimes(2);

    // Second hit for each within 60s — both suppressed
    nowMs += 5_000;
    callNotify(telegramJob('job-e', '10001'), 'msg 2');
    await flush();
    callNotify(telegramJob('job-f', '10002'), 'msg 2');
    await flush();
    expect(telegramSendMessageMock).toHaveBeenCalledTimes(2);
  });

  it('Test 6: after terminal status cleanup, subsequent call re-emits', async () => {
    callNotify(telegramJob('job-g'), 'msg 1');
    await flush();
    expect(telegramSendMessageMock).toHaveBeenCalledTimes(1);

    // Simulate terminal cleanup (executor invokes markTerminal helper)
    (IntentJobExecutor as unknown as { markTerminal: (id: string) => void }).markTerminal('job-g');

    // Immediate next call (within 60s) should re-emit because Map entry was cleared
    nowMs += 5_000;
    callNotify(telegramJob('job-g'), 'msg 2');
    await flush();
    expect(telegramSendMessageMock).toHaveBeenCalledTimes(2);
  });

  it('Test 7: web channel invokes createNotification with type=pipeline_progress', async () => {
    callNotify(webJob('job-h'), 'processing');
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
    const arg = createNotificationMock.mock.calls[0][0];
    expect(arg.type).toBe('pipeline_progress');
    expect(arg.title).toMatch(/CatFlow/i);
    expect(arg.message).toBe('processing');
    expect(arg.severity).toBe('info');
    expect(telegramSendMessageMock).not.toHaveBeenCalled();
  });
});
