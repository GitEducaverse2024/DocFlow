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

// Phase 132 Plan 02: mock canvas-rules for runArchitectQALoop tests
const loadRulesIndexMock = vi.fn(() => 'MOCK_RULES_INDEX\n- R01: ...\n- R10: ...');
const getCanvasRuleMock = vi.fn((id: string) => {
  if (id === 'R99') return null;
  return {
    id: id.toUpperCase(),
    short: `short for ${id}`,
    long: `detail for ${id}`,
    category: 'data_contracts',
  };
});
vi.mock('@/lib/services/canvas-rules', () => ({
  loadRulesIndex: loadRulesIndexMock,
  getCanvasRule: getCanvasRuleMock,
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
      .mockReturnValue({ catPaws: [], connectors: [], canvas_similar: [], templates: [] });

    const callSpy = vi
      .spyOn(IntentJobExecutor as unknown as { callLLM: (p: string, u: string) => Promise<string> }, 'callLLM')
      .mockResolvedValueOnce(STRATEGIST_OK)
      .mockResolvedValueOnce(DECOMPOSER_OK)
      .mockResolvedValueOnce(ARCHITECT_OK)
      // Phase 132 Plan 02: QA loop adds a 4th call after architect.
      .mockResolvedValueOnce(JSON.stringify({ quality_score: 90, issues: [], recommendation: 'accept' }));

    await IntentJobExecutor.tick();

    expect(callSpy).toHaveBeenCalledTimes(4);
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
      .mockReturnValue({ catPaws: [], connectors: [], canvas_similar: [], templates: [] });

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

  it('resume path (architect_retry): goes through QA loop, 2 LLM calls, ends in awaiting_approval', async () => {
    // Create job directly in architect_retry state with persisted goal+tasks.
    // Phase 132 hotfix: resume path is now wrapped in runArchitectQALoop, so
    // it fires architect + QA (2 calls) instead of just architect (1 call).
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
      .mockReturnValue({ catPaws: [{ paw_id: "cp-new", paw_name: "Nuevo", paw_mode: "procesador", tools_available: [], skills: [], best_for: "uso general" }], connectors: [], canvas_similar: [], templates: [] });

    const callSpy = vi
      .spyOn(IntentJobExecutor as unknown as { callLLM: (p: string, u: string) => Promise<string> }, 'callLLM')
      .mockResolvedValueOnce(ARCHITECT_OK)
      .mockResolvedValueOnce(JSON.stringify({ quality_score: 92, issues: [], recommendation: 'accept' }));

    await IntentJobExecutor.tick();

    expect(callSpy).toHaveBeenCalledTimes(2);
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
      .mockReturnValue({ catPaws: [], connectors: [], canvas_similar: [], templates: [] });

    const callSpy = vi
      .spyOn(IntentJobExecutor as unknown as { callLLM: (p: string, u: string) => Promise<string> }, 'callLLM')
      .mockResolvedValueOnce(fenced)
      .mockResolvedValueOnce(DECOMPOSER_OK)
      .mockResolvedValueOnce(ARCHITECT_OK)
      // Phase 132 Plan 02: QA loop adds a 4th call after architect.
      .mockResolvedValueOnce(JSON.stringify({ quality_score: 90, issues: [], recommendation: 'accept' }));

    await IntentJobExecutor.tick();

    const job = getIntentJob(jobId)!;
    expect(job.pipeline_phase).toBe('awaiting_approval');
    scanSpy.mockRestore();
    callSpy.mockRestore();
  });

  // Phase 132 hotfix: ctxResolver injected into insertSideEffectGuards so
  // connector nodes without explicit mode/action/tool_name are still classified
  // by connectorType looked up from the `connectors` table.
  it('buildConnectorCtxResolver: resolves connectorType from DB and caches', () => {
    // Override the shared db mock once to return a gmail connector row.
    dbPrepareMock.mockImplementationOnce(() => ({
      run: canvasInsertRun,
      all: vi.fn(() => []),
      get: () => ({ type: 'gmail' }),
    }));

    const internals = IntentJobExecutor as unknown as {
      buildConnectorCtxResolver: () => (n: Record<string, unknown>) => { connectorType?: string };
    };
    const resolver = internals.buildConnectorCtxResolver();

    const node = { id: 'n5', type: 'connector', data: { connectorId: 'c-gmail-1' } };
    expect(resolver(node)).toEqual({ connectorType: 'gmail' });
    // Second call uses cache — no additional DB hit
    expect(resolver(node)).toEqual({ connectorType: 'gmail' });

    // Non-connector nodes short-circuit to {}
    expect(resolver({ id: 'a', type: 'agent', data: {} })).toEqual({});
    // Connector without connectorId → {}
    expect(resolver({ id: 'x', type: 'connector', data: {} })).toEqual({});
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

// ---------------------------------------------------------------------------
// Phase 132 Plan 02: runArchitectQALoop (QA2-02, QA2-05)
// ---------------------------------------------------------------------------

type CallLLMFn = (systemPrompt: string, userInput: string) => Promise<string>;
interface QAExecutorInternals {
  runArchitectQALoop: (
    job: unknown,
    goal: unknown,
    tasks: unknown,
    resources: unknown,
  ) => Promise<unknown>;
  callLLM: CallLLMFn;
  scanResources: () => unknown;
}

function qaInternals(): QAExecutorInternals {
  return IntentJobExecutor as unknown as QAExecutorInternals;
}

const ARCH_V0_OK = JSON.stringify({
  name: 'Canvas',
  description: 'desc',
  flow_data: {
    nodes: [{ id: 'n1', type: 'agent', data: {}, position: { x: 0, y: 0 } }],
    edges: [],
  },
});
const ARCH_V1_OK = JSON.stringify({
  name: 'Canvas v1',
  description: 'desc v1',
  flow_data: {
    nodes: [{ id: 'n1', type: 'agent', data: {}, position: { x: 0, y: 0 } }],
    edges: [],
  },
});
const ARCH_NEEDS_PAWS = JSON.stringify({
  name: 'X',
  description: 'Y',
  flow_data: { nodes: [], edges: [] },
  needs_cat_paws: [
    { name: 'Paw', system_prompt: 'sp', reason: 'r' },
  ],
});
const ARCH_NEEDS_RULE_DETAILS = JSON.stringify({
  name: 'Draft',
  description: 'd',
  flow_data: {
    nodes: [{ id: 'n1', type: 'agent', data: {}, position: { x: 0, y: 0 } }],
    edges: [],
  },
  needs_rule_details: ['R10', 'R13'],
});
const ARCH_NEEDS_UNKNOWN_RULE = JSON.stringify({
  name: 'Draft',
  description: 'd',
  flow_data: { nodes: [], edges: [] },
  needs_rule_details: ['R99'],
});
const QA_ACCEPT = JSON.stringify({ quality_score: 90, issues: [], recommendation: 'accept' });
const QA_REVISE = JSON.stringify({
  quality_score: 55,
  issues: [{ severity: 'blocker', rule_id: 'R01', node_id: 'n1', description: 'x', fix_hint: 'y' }],
  recommendation: 'revise',
});
const QA_REJECT = JSON.stringify({ quality_score: 20, issues: [], recommendation: 'reject' });

function makeFakeJob(id: string = 'qa-job-1'): unknown {
  return {
    id,
    user_id: 'u1',
    tool_name: 'execute_catflow',
    tool_args: '{}',
    status: 'pending',
    pipeline_phase: 'architect',
    channel: 'web',
    channel_ref: null,
    progress_message: null,
    canvas_id: null,
    error: null,
  };
}

describe('runArchitectQALoop (Phase 132)', () => {
  beforeEach(() => {
    loadRulesIndexMock.mockClear();
    getCanvasRuleMock.mockClear();
    // Ensure job row exists for updateIntentJob calls
    catbotDbRef.prepare(`
      INSERT OR REPLACE INTO intent_jobs (id, user_id, tool_name, tool_args, status, pipeline_phase)
      VALUES ('qa-job-1', 'u1', 'execute_catflow', '{}', 'pending', 'architect')
    `).run();
    catbotDbRef.prepare(`DELETE FROM knowledge_gaps`).run();
  });

  it('accept on iter 0 returns design after 2 LLM calls', async () => {
    const callSpy = vi
      .spyOn(qaInternals(), 'callLLM')
      .mockResolvedValueOnce(ARCH_V0_OK)
      .mockResolvedValueOnce(QA_ACCEPT);

    const result = await qaInternals().runArchitectQALoop(
      makeFakeJob(),
      'goal',
      [],
      { catPaws: [], connectors: [], canvas_similar: [], templates: [] },
    );

    expect(result).toBeTruthy();
    expect((result as { name: string }).name).toBe('Canvas');
    expect(callSpy).toHaveBeenCalledTimes(2);
    expect(loadRulesIndexMock).toHaveBeenCalledTimes(1);
    callSpy.mockRestore();
  });

  it('revise on iter 0, accept on iter 1 returns design after 4 LLM calls', async () => {
    const callSpy = vi
      .spyOn(qaInternals(), 'callLLM')
      .mockResolvedValueOnce(ARCH_V0_OK)
      .mockResolvedValueOnce(QA_REVISE)
      .mockResolvedValueOnce(ARCH_V1_OK)
      .mockResolvedValueOnce(QA_ACCEPT);

    const result = await qaInternals().runArchitectQALoop(
      makeFakeJob(),
      'goal',
      [],
      { catPaws: [], connectors: [], canvas_similar: [], templates: [] },
    );

    expect((result as { name: string }).name).toBe('Canvas v1');
    expect(callSpy).toHaveBeenCalledTimes(4);
    // Third call (index 2) is the second architect call — must contain qa_report
    const secondArchitectCallUserInput = callSpy.mock.calls[2][1];
    expect(secondArchitectCallUserInput).toContain('qa_report');
    callSpy.mockRestore();
  });

  it('revise twice returns null and marks job failed with knowledge gap', async () => {
    const callSpy = vi
      .spyOn(qaInternals(), 'callLLM')
      .mockResolvedValueOnce(ARCH_V0_OK)
      .mockResolvedValueOnce(QA_REVISE)
      .mockResolvedValueOnce(ARCH_V1_OK)
      .mockResolvedValueOnce(QA_REVISE);

    const result = await qaInternals().runArchitectQALoop(
      makeFakeJob(),
      'goal',
      [],
      { catPaws: [], connectors: [], canvas_similar: [], templates: [] },
    );

    expect(result).toBeNull();
    const job = getIntentJob('qa-job-1')!;
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/QA loop exhausted/);
    const gaps = catbotDbRef
      .prepare(`SELECT * FROM knowledge_gaps WHERE knowledge_path = 'catflow/design/quality'`)
      .all() as unknown[];
    expect(gaps.length).toBeGreaterThanOrEqual(1);
    callSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // Phase 133 Plan 02 (FOUND-07): exhaustion persists last_flow_data in gap
  // -----------------------------------------------------------------------
  it('FOUND-07: exhaustion persists last_flow_data from previousDesign in knowledge_gap.context', async () => {
    const ARCH_WITH_NODES = JSON.stringify({
      name: 'Canvas',
      description: 'd',
      flow_data: {
        nodes: [
          { id: 'n1', type: 'agent', data: { agentId: 'cp-1' }, position: { x: 0, y: 0 } },
          { id: 'n2', type: 'connector', data: {}, position: { x: 200, y: 0 } },
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      },
    });
    const callSpy = vi
      .spyOn(qaInternals(), 'callLLM')
      .mockResolvedValueOnce(ARCH_WITH_NODES)
      .mockResolvedValueOnce(QA_REVISE)
      .mockResolvedValueOnce(ARCH_WITH_NODES)
      .mockResolvedValueOnce(QA_REVISE);

    const result = await qaInternals().runArchitectQALoop(
      makeFakeJob(),
      'goal',
      [],
      { catPaws: [], connectors: [], canvas_similar: [], templates: [] },
    );

    expect(result).toBeNull();
    const gaps = catbotDbRef
      .prepare(`SELECT context FROM knowledge_gaps WHERE knowledge_path = 'catflow/design/quality' ORDER BY rowid DESC LIMIT 1`)
      .all() as Array<{ context: string }>;
    expect(gaps.length).toBe(1);
    const ctx = JSON.parse(gaps[0].context) as { last_flow_data: { nodes: unknown[] } | null };
    expect(ctx.last_flow_data).toBeTruthy();
    expect(Array.isArray(ctx.last_flow_data?.nodes)).toBe(true);
    expect(ctx.last_flow_data?.nodes.length).toBe(2);
    callSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // Phase 133 Plan 02 (FOUND-10): exhaustion notifies force=true with top-2 issues
  // -----------------------------------------------------------------------
  it('FOUND-10: exhaustion calls notifyProgress(force=true) with top-2 issues ordered by severity before markTerminal', async () => {
    const QA_REVISE_MULTI = JSON.stringify({
      quality_score: 30,
      issues: [
        { severity: 'minor', rule_id: 'R-MINOR', node_id: 'nx', description: 'minor issue text' },
        { severity: 'blocker', rule_id: 'R-BLOCK', node_id: 'n1', description: 'blocker issue text' },
        { severity: 'major', rule_id: 'R-MAJOR', node_id: 'n2', description: 'major issue text' },
      ],
      recommendation: 'revise',
    });

    // Spy notifyProgress + markTerminal to verify ordering + force=true
    const notifyCalls: Array<{ msg: string; force?: boolean; ts: number }> = [];
    let notifyCounter = 0;
    const notifySpy = vi
      .spyOn(IntentJobExecutor as unknown as { notifyProgress: NotifyProgressFn }, 'notifyProgress')
      .mockImplementation((_job: unknown, message: string, force?: boolean) => {
        notifyCalls.push({ msg: message, force, ts: ++notifyCounter });
      });

    let markTerminalCalledAt = -1;
    const markSpy = vi
      .spyOn(IntentJobExecutor as unknown as { markTerminal: (id: string) => void }, 'markTerminal')
      .mockImplementation(() => {
        markTerminalCalledAt = ++notifyCounter;
      });

    const callSpy = vi
      .spyOn(qaInternals(), 'callLLM')
      .mockResolvedValueOnce(ARCH_V0_OK)
      .mockResolvedValueOnce(QA_REVISE_MULTI)
      .mockResolvedValueOnce(ARCH_V1_OK)
      .mockResolvedValueOnce(QA_REVISE_MULTI);

    const result = await qaInternals().runArchitectQALoop(
      makeFakeJob(),
      'goal',
      [],
      { catPaws: [], connectors: [], canvas_similar: [], templates: [] },
    );

    expect(result).toBeNull();

    // Find the exhaustion notification (force=true with both top-2 ids)
    const exhaustionNotify = notifyCalls.find(
      (c) => c.force === true && c.msg.includes('R-BLOCK') && c.msg.includes('R-MAJOR'),
    );
    expect(exhaustionNotify).toBeDefined();
    // Minor issue must NOT be in the exhaustion message (top-2 only)
    expect(exhaustionNotify!.msg).not.toContain('R-MINOR');
    // Ordering: notifyProgress(force=true exhaustion) must fire before markTerminal
    expect(markTerminalCalledAt).toBeGreaterThan(exhaustionNotify!.ts);

    notifySpy.mockRestore();
    markSpy.mockRestore();
    callSpy.mockRestore();
  });

  it('reject on iter 1 returns null and logs knowledge gap', async () => {
    const callSpy = vi
      .spyOn(qaInternals(), 'callLLM')
      .mockResolvedValueOnce(ARCH_V0_OK)
      .mockResolvedValueOnce(QA_REVISE)
      .mockResolvedValueOnce(ARCH_V1_OK)
      .mockResolvedValueOnce(QA_REJECT);

    const result = await qaInternals().runArchitectQALoop(
      makeFakeJob(),
      'goal',
      [],
      { catPaws: [], connectors: [], canvas_similar: [], templates: [] },
    );

    expect(result).toBeNull();
    const gaps = catbotDbRef
      .prepare(`SELECT * FROM knowledge_gaps WHERE knowledge_path = 'catflow/design/quality'`)
      .all() as unknown[];
    expect(gaps.length).toBeGreaterThanOrEqual(1);
    callSpy.mockRestore();
  });

  it('needs_cat_paws short-circuit skips QA (only 1 LLM call)', async () => {
    const callSpy = vi
      .spyOn(qaInternals(), 'callLLM')
      .mockResolvedValueOnce(ARCH_NEEDS_PAWS);

    const result = await qaInternals().runArchitectQALoop(
      makeFakeJob(),
      'goal',
      [],
      { catPaws: [], connectors: [], canvas_similar: [], templates: [] },
    );

    expect(result).toBeTruthy();
    expect((result as { needs_cat_paws: unknown[] }).needs_cat_paws.length).toBe(1);
    expect(callSpy).toHaveBeenCalledTimes(1);
    callSpy.mockRestore();
  });

  it('loadRulesIndex is called exactly once per invocation', async () => {
    const callSpy = vi
      .spyOn(qaInternals(), 'callLLM')
      .mockResolvedValueOnce(ARCH_V0_OK)
      .mockResolvedValueOnce(QA_ACCEPT);

    loadRulesIndexMock.mockClear();
    await qaInternals().runArchitectQALoop(
      makeFakeJob(),
      'goal',
      [],
      { catPaws: [], connectors: [], canvas_similar: [], templates: [] },
    );

    expect(loadRulesIndexMock).toHaveBeenCalledTimes(1);
    callSpy.mockRestore();
  });

  it('needs_rule_details triggers expansion pass then QA (QA2-02)', async () => {
    getCanvasRuleMock.mockClear();
    const callSpy = vi
      .spyOn(qaInternals(), 'callLLM')
      .mockResolvedValueOnce(ARCH_NEEDS_RULE_DETAILS)
      .mockResolvedValueOnce(ARCH_V1_OK) // expanded architect call
      .mockResolvedValueOnce(QA_ACCEPT);

    const result = await qaInternals().runArchitectQALoop(
      makeFakeJob(),
      'goal',
      [],
      { catPaws: [], connectors: [], canvas_similar: [], templates: [] },
    );

    expect((result as { name: string }).name).toBe('Canvas v1');
    expect(callSpy).toHaveBeenCalledTimes(3);
    expect(getCanvasRuleMock).toHaveBeenCalledTimes(2);
    expect(getCanvasRuleMock).toHaveBeenCalledWith('R10');
    expect(getCanvasRuleMock).toHaveBeenCalledWith('R13');
    // Expansion architect call (index 1) must contain the detail text
    const expandedUserInput = callSpy.mock.calls[1][1];
    expect(expandedUserInput).toContain('detail for R10');
    expect(expandedUserInput).toContain('detail for R13');
    callSpy.mockRestore();
  });

  // ---------------------------------------------------------------------
  // Phase 133 Plan 02 (FOUND-04): callLLM timeout via AbortSignal
  // ---------------------------------------------------------------------
  it('FOUND-04: callLLM passes AbortSignal to fetch and propagates AbortError', async () => {
    interface CallLLMInternals { callLLM: (sp: string, ui: string) => Promise<string> }
    const internals = IntentJobExecutor as unknown as CallLLMInternals;

    // Mock global fetch to capture the signal and abort immediately via
    // an external AbortController wired into the provided signal.
    let capturedInit: RequestInit | undefined;
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedInit = init;
      return new Promise<Response>((_, reject) => {
        const sig = init?.signal;
        if (sig) {
          if (sig.aborted) {
            reject(new DOMException('aborted', 'AbortError'));
            return;
          }
          sig.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }
        // Force abort on next microtask by mutating nothing — rely on the
        // AbortSignal.timeout(90_000) which we will short-circuit via a
        // synthetic AbortController passed through a callLLM wrapper. To
        // keep the test fast we manually trigger abort via a side-channel.
        setTimeout(() => {
          // If somehow signal is a real 90s timer, force rejection path.
          reject(new DOMException('aborted', 'AbortError'));
        }, 0);
      });
    }) as unknown as typeof fetch;

    let err: unknown = null;
    try {
      await internals.callLLM('sys', 'user');
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(Error);
    expect(capturedInit).toBeDefined();
    expect(capturedInit?.signal).toBeDefined();
    // Signal must be an AbortSignal instance
    expect(capturedInit?.signal instanceof AbortSignal).toBe(true);

    global.fetch = originalFetch;
  });

  it('needs_rule_details with unknown id skips missing rule gracefully', async () => {
    getCanvasRuleMock.mockClear();
    const callSpy = vi
      .spyOn(qaInternals(), 'callLLM')
      .mockResolvedValueOnce(ARCH_NEEDS_UNKNOWN_RULE)
      .mockResolvedValueOnce(ARCH_V0_OK) // expanded call returns valid design
      .mockResolvedValueOnce(QA_ACCEPT);

    const result = await qaInternals().runArchitectQALoop(
      makeFakeJob(),
      'goal',
      [],
      { catPaws: [], connectors: [], canvas_similar: [], templates: [] },
    );

    expect(result).toBeTruthy();
    expect(getCanvasRuleMock).toHaveBeenCalledWith('R99');
    // 3 calls: initial architect + expansion + QA
    expect(callSpy).toHaveBeenCalledTimes(3);
    callSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Phase 133 Plan 03 (FOUND-05): reapStaleJobs — belt-and-braces timeout layer
// ---------------------------------------------------------------------------

interface ReaperInternals {
  reapStaleJobs: () => Promise<number>;
  startReaper: () => void;
  stopReaperForTest: () => void;
  currentJobId: string | null;
  notifyProgress: NotifyProgressFn;
}

function reaperInternals(): ReaperInternals {
  return IntentJobExecutor as unknown as ReaperInternals;
}

describe('reapStaleJobs (Phase 133 FOUND-05)', () => {
  beforeEach(() => {
    catbotDbRef.prepare('DELETE FROM intent_jobs').run();
    reaperInternals().currentJobId = null;
  });

  afterEach(() => {
    // Stop any interval the tests may have started to prevent timer leaks
    try {
      reaperInternals().stopReaperForTest();
    } catch {
      /* no-op if helper missing in RED phase */
    }
  });

  it('marks stale architect/strategist/decomposer jobs as failed, notifies, clears currentJobId', async () => {
    const now = Date.now();
    const stale = new Date(now - 11 * 60_000).toISOString().replace('T', ' ').slice(0, 19); // 11 min ago, sqlite datetime format
    const fresh = new Date(now - 2 * 60_000).toISOString().replace('T', ' ').slice(0, 19);  // 2 min ago

    catbotDbRef.prepare(`
      INSERT INTO intent_jobs (id, user_id, tool_name, tool_args, status, pipeline_phase, channel, channel_ref, updated_at, created_at)
      VALUES ('job-stale-1', 'u1', '__description__', '{}', 'pending', 'architect', 'telegram', '999', ?, ?)
    `).run(stale, stale);
    catbotDbRef.prepare(`
      INSERT INTO intent_jobs (id, user_id, tool_name, tool_args, status, pipeline_phase, channel, channel_ref, updated_at, created_at)
      VALUES ('job-stale-2', 'u1', '__description__', '{}', 'pending', 'strategist', 'web', null, ?, ?)
    `).run(stale, stale);
    catbotDbRef.prepare(`
      INSERT INTO intent_jobs (id, user_id, tool_name, tool_args, status, pipeline_phase, channel, channel_ref, updated_at, created_at)
      VALUES ('job-fresh', 'u1', '__description__', '{}', 'pending', 'architect', 'telegram', '888', ?, ?)
    `).run(fresh, fresh);

    reaperInternals().currentJobId = 'job-stale-1';

    const notifySpy = vi
      .spyOn(IntentJobExecutor as unknown as { notifyProgress: NotifyProgressFn }, 'notifyProgress')
      .mockImplementation(() => {});

    const count = await reaperInternals().reapStaleJobs();

    expect(count).toBe(2);
    expect(notifySpy).toHaveBeenCalledTimes(2);
    // force=true on both exhaustion notifications
    for (const call of notifySpy.mock.calls) {
      expect(call[2]).toBe(true);
      expect(String(call[1])).toMatch(/reaper|timeout|colgado/i);
    }

    const s1 = getIntentJob('job-stale-1')!;
    const s2 = getIntentJob('job-stale-2')!;
    const sf = getIntentJob('job-fresh')!;
    expect(s1.status).toBe('failed');
    expect(s1.error).toMatch(/reaper/);
    expect(s2.status).toBe('failed');
    expect(s2.error).toMatch(/reaper/);
    expect(sf.status).toBe('pending'); // untouched
    expect(sf.pipeline_phase).toBe('architect');
    expect(reaperInternals().currentJobId).toBeNull();

    notifySpy.mockRestore();
  });

  it('is a no-op when no stale jobs exist', async () => {
    const count = await reaperInternals().reapStaleJobs();
    expect(count).toBe(0);
  });

  it('does NOT reap awaiting_user or awaiting_approval jobs even if very old', async () => {
    const ancient = new Date(Date.now() - 60 * 60_000).toISOString().replace('T', ' ').slice(0, 19); // 60 min ago

    catbotDbRef.prepare(`
      INSERT INTO intent_jobs (id, user_id, tool_name, tool_args, status, pipeline_phase, channel, updated_at, created_at)
      VALUES ('job-await-user', 'u1', '__description__', '{}', 'pending', 'awaiting_user', 'telegram', ?, ?)
    `).run(ancient, ancient);
    catbotDbRef.prepare(`
      INSERT INTO intent_jobs (id, user_id, tool_name, tool_args, status, pipeline_phase, channel, updated_at, created_at)
      VALUES ('job-await-approval', 'u1', '__description__', '{}', 'pending', 'awaiting_approval', 'web', ?, ?)
    `).run(ancient, ancient);

    const count = await reaperInternals().reapStaleJobs();
    expect(count).toBe(0);

    const j1 = getIntentJob('job-await-user')!;
    const j2 = getIntentJob('job-await-approval')!;
    expect(j1.pipeline_phase).toBe('awaiting_user');
    expect(j1.status).toBe('pending');
    expect(j2.pipeline_phase).toBe('awaiting_approval');
    expect(j2.status).toBe('pending');
  });

  it('startReaper guards against double-init', () => {
    reaperInternals().stopReaperForTest(); // clean baseline
    reaperInternals().startReaper();
    reaperInternals().startReaper();
    // No throw = pass. stopReaperForTest in afterEach clears the interval.
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 133 Plan 04 (FOUND-06): intermediate output persistence
// ---------------------------------------------------------------------------
describe('intermediate output persistence (Phase 133 Plan 04)', () => {
  type StageRow = {
    strategist_output: string | null;
    decomposer_output: string | null;
    architect_iter0: string | null;
    qa_iter0: string | null;
    architect_iter1: string | null;
    qa_iter1: string | null;
  };

  const readStageRow = (id: string): StageRow =>
    catbotDbRef
      .prepare(
        `SELECT strategist_output, decomposer_output, architect_iter0, qa_iter0, architect_iter1, qa_iter1
         FROM intent_jobs WHERE id = ?`,
      )
      .get(id) as StageRow;

  it('full pipeline accept iter0 persists strategist/decomposer/architect_iter0/qa_iter0, iter1 remain NULL', async () => {
    const jobId = createIntentJob({ userId: 'u1', toolName: 'execute_catflow', toolArgs: {} });

    const scanSpy = vi
      .spyOn(IntentJobExecutor as unknown as { scanResources: () => Record<string, unknown> }, 'scanResources')
      .mockReturnValue({ catPaws: [], connectors: [], canvas_similar: [], templates: [] });

    const qaIter0 = JSON.stringify({ quality_score: 90, issues: [], recommendation: 'accept' });
    const callSpy = vi
      .spyOn(IntentJobExecutor as unknown as { callLLM: (p: string, u: string) => Promise<string> }, 'callLLM')
      .mockResolvedValueOnce(STRATEGIST_OK)
      .mockResolvedValueOnce(DECOMPOSER_OK)
      .mockResolvedValueOnce(ARCHITECT_OK)
      .mockResolvedValueOnce(qaIter0);

    await IntentJobExecutor.tick();

    const row = readStageRow(jobId);
    expect(row.strategist_output).toBe(STRATEGIST_OK);
    expect(row.decomposer_output).toBe(DECOMPOSER_OK);
    expect(row.architect_iter0).toBe(ARCHITECT_OK);
    expect(row.qa_iter0).toBe(qaIter0);
    expect(row.architect_iter1).toBeNull();
    expect(row.qa_iter1).toBeNull();

    scanSpy.mockRestore();
    callSpy.mockRestore();
  });

  it('revise iter0 then accept iter1 populates all 4 iter columns', async () => {
    // Seed job directly at architect phase via runArchitectQALoop internal.
    const jobId = 'stage-iter1-job';
    catbotDbRef.prepare(`
      INSERT INTO intent_jobs (id, user_id, tool_name, tool_args, status, pipeline_phase)
      VALUES (?, 'u1', 'execute_catflow', '{}', 'pending', 'architect')
    `).run(jobId);

    const archV0 = JSON.stringify({
      name: 'Canvas',
      description: 'desc',
      flow_data: {
        nodes: [{ id: 'n1', type: 'agent', data: {}, position: { x: 0, y: 0 } }],
        edges: [],
      },
    });
    const archV1 = JSON.stringify({
      name: 'Canvas v1',
      description: 'desc v1',
      flow_data: {
        nodes: [{ id: 'n1', type: 'agent', data: {}, position: { x: 0, y: 0 } }],
        edges: [],
      },
    });
    const qaRevise = JSON.stringify({
      quality_score: 55,
      issues: [{ severity: 'blocker', rule_id: 'R01', node_id: 'n1', description: 'x', fix_hint: 'y' }],
      recommendation: 'revise',
    });
    const qaAccept = JSON.stringify({ quality_score: 90, issues: [], recommendation: 'accept' });

    const callSpy = vi
      .spyOn(qaInternals(), 'callLLM')
      .mockResolvedValueOnce(archV0)
      .mockResolvedValueOnce(qaRevise)
      .mockResolvedValueOnce(archV1)
      .mockResolvedValueOnce(qaAccept);

    const fakeJob = {
      id: jobId,
      user_id: 'u1',
      tool_name: 'execute_catflow',
      tool_args: '{}',
      status: 'pending',
      pipeline_phase: 'architect',
      channel: 'web',
      channel_ref: null,
      progress_message: null,
      canvas_id: null,
      error: null,
    };

    const result = await qaInternals().runArchitectQALoop(
      fakeJob,
      'goal',
      [],
      { catPaws: [], connectors: [], canvas_similar: [], templates: [] },
    );
    expect(result).toBeTruthy();

    const row = readStageRow(jobId);
    expect(row.architect_iter0).toBe(archV0);
    expect(row.qa_iter0).toBe(qaRevise);
    expect(row.architect_iter1).toBe(archV1);
    expect(row.qa_iter1).toBe(qaAccept);
    // strategist/decomposer were NOT run for this seeded architect-only path.
    expect(row.strategist_output).toBeNull();
    expect(row.decomposer_output).toBeNull();

    callSpy.mockRestore();
  });

  it('needs_rule_details expansion persists the final expanded architect output, not the initial draft', async () => {
    const jobId = 'stage-expansion-job';
    catbotDbRef.prepare(`
      INSERT INTO intent_jobs (id, user_id, tool_name, tool_args, status, pipeline_phase)
      VALUES (?, 'u1', 'execute_catflow', '{}', 'pending', 'architect')
    `).run(jobId);

    const archDraft = JSON.stringify({
      name: 'Draft',
      description: 'd',
      flow_data: {
        nodes: [{ id: 'n1', type: 'agent', data: {}, position: { x: 0, y: 0 } }],
        edges: [],
      },
      needs_rule_details: ['R10'],
    });
    const archExpanded = JSON.stringify({
      name: 'Expanded',
      description: 'e',
      flow_data: {
        nodes: [{ id: 'n1', type: 'agent', data: {}, position: { x: 0, y: 0 } }],
        edges: [],
      },
    });
    const qaAccept = JSON.stringify({ quality_score: 92, issues: [], recommendation: 'accept' });

    const callSpy = vi
      .spyOn(qaInternals(), 'callLLM')
      .mockResolvedValueOnce(archDraft)
      .mockResolvedValueOnce(archExpanded)
      .mockResolvedValueOnce(qaAccept);

    await qaInternals().runArchitectQALoop(
      {
        id: jobId,
        user_id: 'u1',
        tool_name: 'execute_catflow',
        tool_args: '{}',
        status: 'pending',
        pipeline_phase: 'architect',
        channel: 'web',
        channel_ref: null,
        progress_message: null,
        canvas_id: null,
        error: null,
      },
      'goal',
      [],
      { catPaws: [], connectors: [], canvas_similar: [], templates: [] },
    );

    const row = readStageRow(jobId);
    // Phase 134 audits architect_iter0: must be the FINAL expanded output,
    // not the draft that was discarded.
    expect(row.architect_iter0).toBe(archExpanded);
    expect(row.qa_iter0).toBe(qaAccept);

    callSpy.mockRestore();
  });
});
