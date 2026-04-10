import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
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
