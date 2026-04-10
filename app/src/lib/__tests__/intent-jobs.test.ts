import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ---------------------------------------------------------------------------
// Use a temp DB so tests never touch production catbot.db
// ---------------------------------------------------------------------------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catbot-intent-jobs-test-'));
const tmpDbPath = path.join(tmpDir, 'catbot-test.db');
process['env']['CATBOT_DB_PATH'] = tmpDbPath;

// ---------------------------------------------------------------------------
// Mock heavy transitive deps of catbot-tools so we can import executeTool cleanly.
// We also mock @/lib/db so that post_execution_decision can observe its calls
// (UPDATE canvases, DELETE FROM canvases).
// ---------------------------------------------------------------------------

const canvasesRun = vi.fn();
const canvasesPrepare = vi.fn((sql: string) => {
  void sql;
  return {
    run: canvasesRun,
    get: vi.fn(() => ({ id: 'canvas-123', is_template: 0 })),
    all: vi.fn(() => []),
  };
});

vi.mock('@/lib/db', () => ({
  default: { prepare: canvasesPrepare },
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/services/catbot-holded-tools', () => ({
  getHoldedTools: vi.fn(() => []),
  isHoldedTool: vi.fn(() => false),
}));
vi.mock('@/lib/services/template-renderer', () => ({ renderTemplate: vi.fn() }));
vi.mock('@/lib/services/template-asset-resolver', () => ({ resolveAssetsForEmail: vi.fn() }));
vi.mock('@/lib/services/alias-routing', () => ({
  resolveAlias: vi.fn(),
  getAllAliases: vi.fn(() => []),
  updateAlias: vi.fn(),
}));
vi.mock('@/lib/services/discovery', () => ({ getInventory: vi.fn() }));
vi.mock('@/lib/services/mid', () => ({
  getAll: vi.fn(() => []),
  update: vi.fn(),
  midToMarkdown: vi.fn(() => ''),
}));
vi.mock('@/lib/services/health', () => ({ checkHealth: vi.fn() }));
vi.mock('@/lib/knowledge-tree', () => ({
  loadKnowledgeArea: vi.fn(),
  getAllKnowledgeAreas: vi.fn(() => []),
}));
vi.mock('@/lib/services/catbot-user-profile', () => ({ generateInitialDirectives: vi.fn(() => '') }));
vi.mock('@/lib/services/catbot-learned', () => ({
  saveLearnedEntryWithStaging: vi.fn(() => ({ id: 'x' })),
  promoteIfReady: vi.fn(() => false),
}));

// Global fetch mock for approve_pipeline canvas execute call
const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
// @ts-expect-error override
global.fetch = fetchMock;

// ---------------------------------------------------------------------------
// Imports (dynamic after env var is set)
// ---------------------------------------------------------------------------
type DbModule = typeof import('@/lib/catbot-db');
type ToolsModule = typeof import('@/lib/services/catbot-tools');

let createIntentJob: DbModule['createIntentJob'];
let updateIntentJob: DbModule['updateIntentJob'];
let getIntentJob: DbModule['getIntentJob'];
let listJobsByUser: DbModule['listJobsByUser'];
let getNextPendingJob: DbModule['getNextPendingJob'];
let countStuckPipelines: DbModule['countStuckPipelines'];
let saveComplexityDecision: DbModule['saveComplexityDecision'];
let catbotDbRef: DbModule['catbotDb'];

let executeTool: ToolsModule['executeTool'];
let getToolsForLLM: ToolsModule['getToolsForLLM'];

beforeAll(async () => {
  const db = await import('@/lib/catbot-db');
  createIntentJob = db.createIntentJob;
  updateIntentJob = db.updateIntentJob;
  getIntentJob = db.getIntentJob;
  listJobsByUser = db.listJobsByUser;
  getNextPendingJob = db.getNextPendingJob;
  countStuckPipelines = db.countStuckPipelines;
  saveComplexityDecision = db.saveComplexityDecision;
  catbotDbRef = db.catbotDb;

  const tools = await import('@/lib/services/catbot-tools');
  executeTool = tools.executeTool;
  getToolsForLLM = tools.getToolsForLLM;
});

beforeEach(() => {
  catbotDbRef.exec('DELETE FROM intent_jobs');
  catbotDbRef.exec('DELETE FROM complexity_decisions');
  canvasesRun.mockClear();
  canvasesPrepare.mockClear();
  fetchMock.mockClear();
});

// ---------------------------------------------------------------------------
// CRUD tests (PIPE-01)
// ---------------------------------------------------------------------------
describe('intent_jobs CRUD', () => {
  it('createIntentJob returns an id and stores defaults (status=pending, phase=pending)', () => {
    const id = createIntentJob({
      userId: 'test:u',
      toolName: 'execute_catflow',
      toolArgs: { target: 'foo' },
    });
    expect(typeof id).toBe('string');
    const row = getIntentJob(id);
    expect(row).toBeDefined();
    expect(row!.user_id).toBe('test:u');
    expect(row!.tool_name).toBe('execute_catflow');
    expect(row!.status).toBe('pending');
    expect(row!.pipeline_phase).toBe('pending');
    expect(row!.channel).toBe('web');
    expect(row!.progress_message).toBe('{}');
    expect(JSON.parse(row!.tool_args!)).toEqual({ target: 'foo' });
  });

  it('updateIntentJob serializes progressMessage to JSON in progress_message column', () => {
    const id = createIntentJob({ userId: 'u', toolName: 'execute_task' });
    updateIntentJob(id, {
      progressMessage: { phase: 'strategist', goal: 'Construir informe', step: 1 },
    });
    const row = getIntentJob(id)!;
    const parsed = JSON.parse(row.progress_message) as Record<string, unknown>;
    expect(parsed.phase).toBe('strategist');
    expect(parsed.goal).toBe('Construir informe');
    expect(parsed.step).toBe(1);
  });

  it('updateIntentJob sets completed_at when status transitions to completed/failed/cancelled', () => {
    const id1 = createIntentJob({ userId: 'u', toolName: 't' });
    updateIntentJob(id1, { status: 'completed' });
    expect(getIntentJob(id1)!.completed_at).not.toBeNull();

    const id2 = createIntentJob({ userId: 'u', toolName: 't' });
    updateIntentJob(id2, { status: 'failed', error: 'boom' });
    const r2 = getIntentJob(id2)!;
    expect(r2.completed_at).not.toBeNull();
    expect(r2.error).toBe('boom');

    const id3 = createIntentJob({ userId: 'u', toolName: 't' });
    updateIntentJob(id3, { status: 'cancelled' });
    expect(getIntentJob(id3)!.completed_at).not.toBeNull();
  });

  it('listJobsByUser does NOT leak jobs of other users (cross-user isolation)', () => {
    createIntentJob({ userId: 'user-A', toolName: 'a' });
    createIntentJob({ userId: 'user-A', toolName: 'a2' });
    createIntentJob({ userId: 'user-B', toolName: 'b' });
    const a = listJobsByUser('user-A');
    expect(a).toHaveLength(2);
    expect(a.every(r => r.user_id === 'user-A')).toBe(true);
    const b = listJobsByUser('user-B');
    expect(b).toHaveLength(1);
    expect(b[0].user_id).toBe('user-B');
  });

  it('listJobsByUser respects status filter and limit', () => {
    const id1 = createIntentJob({ userId: 'u', toolName: 'a' });
    createIntentJob({ userId: 'u', toolName: 'b' });
    createIntentJob({ userId: 'u', toolName: 'c' });
    updateIntentJob(id1, { status: 'completed' });
    const completed = listJobsByUser('u', { status: 'completed' });
    expect(completed).toHaveLength(1);
    const limited = listJobsByUser('u', { limit: 2 });
    expect(limited).toHaveLength(2);
  });

  it('getNextPendingJob returns the oldest pending row', async () => {
    const id1 = createIntentJob({ userId: 'u', toolName: 'a' });
    await new Promise(r => setTimeout(r, 1100));
    createIntentJob({ userId: 'u', toolName: 'b' });
    const next = getNextPendingJob();
    expect(next).toBeDefined();
    expect(next!.id).toBe(id1);
  });

  it('countStuckPipelines counts running rows older than 30 minutes', () => {
    // Fresh running row — NOT stuck
    const id = createIntentJob({ userId: 'u', toolName: 'x' });
    updateIntentJob(id, { status: 'running' });
    expect(countStuckPipelines()).toBe(0);

    // Force updated_at into the past
    catbotDbRef.prepare(
      `UPDATE intent_jobs SET updated_at = datetime('now', '-45 minutes') WHERE id = ?`
    ).run(id);
    expect(countStuckPipelines()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tool execution tests
// ---------------------------------------------------------------------------
describe('queue_intent_job tool', () => {
  it('queue_intent_job uses context.userId and persists a row', async () => {
    const res = await executeTool(
      'queue_intent_job',
      { tool_name: 'execute_catflow', tool_args: { a: 1 }, original_request: 'Arma un CatFlow' },
      'http://localhost:3500',
      { userId: 'test:u', sudoActive: false, channel: 'web' } as { userId: string; sudoActive: boolean; channel?: string },
    );
    const r = res.result as Record<string, unknown>;
    expect(r.queued).toBe(true);
    expect(typeof r.job_id).toBe('string');
    const row = getIntentJob(r.job_id as string);
    expect(row).toBeDefined();
    expect(row!.user_id).toBe('test:u');
    expect(row!.tool_name).toBe('execute_catflow');
  });
});

describe('list_my_jobs tool', () => {
  it('returns only the requesting user jobs (isolation)', async () => {
    createIntentJob({ userId: 'user-A', toolName: 'a' });
    createIntentJob({ userId: 'user-B', toolName: 'b' });
    const res = await executeTool(
      'list_my_jobs',
      {},
      'http://localhost:3500',
      { userId: 'user-A', sudoActive: false } as { userId: string; sudoActive: boolean },
    );
    const r = res.result as { count: number; jobs: Array<{ tool_name: string }> };
    expect(r.count).toBe(1);
    expect(r.jobs[0].tool_name).toBe('a');
  });

  it('parses progress_message JSON into an object', async () => {
    const id = createIntentJob({ userId: 'u', toolName: 'x' });
    updateIntentJob(id, { progressMessage: { phase: 'architect', goal: 'G' } });
    const res = await executeTool(
      'list_my_jobs',
      {},
      'http://localhost:3500',
      { userId: 'u', sudoActive: false } as { userId: string; sudoActive: boolean },
    );
    const r = res.result as { jobs: Array<{ progress_message: { phase: string; goal: string } }> };
    expect(r.jobs[0].progress_message.phase).toBe('architect');
    expect(r.jobs[0].progress_message.goal).toBe('G');
  });
});

describe('cancel_job tool', () => {
  it('marks status/phase as cancelled and records reason in error', async () => {
    const id = createIntentJob({ userId: 'u', toolName: 'x' });
    await executeTool(
      'cancel_job',
      { job_id: id, reason: 'no quiero' },
      'http://localhost:3500',
      { userId: 'u', sudoActive: false } as { userId: string; sudoActive: boolean },
    );
    const row = getIntentJob(id)!;
    expect(row.status).toBe('cancelled');
    expect(row.pipeline_phase).toBe('cancelled');
    expect(row.error).toBe('no quiero');
  });
});

describe('approve_pipeline tool', () => {
  it('rejects when pipeline_phase != awaiting_approval', async () => {
    const id = createIntentJob({ userId: 'u', toolName: 'x' });
    const res = await executeTool(
      'approve_pipeline',
      { job_id: id },
      'http://localhost:3500',
      { userId: 'u', sudoActive: false } as { userId: string; sudoActive: boolean },
    );
    const r = res.result as { error?: string };
    expect(r.error).toMatch(/phase/i);
  });

  it('accepts when awaiting_approval and calls canvas execute endpoint', async () => {
    const id = createIntentJob({ userId: 'u', toolName: 'x' });
    updateIntentJob(id, { pipeline_phase: 'awaiting_approval', canvas_id: 'canvas-abc' });
    const res = await executeTool(
      'approve_pipeline',
      { job_id: id },
      'http://localhost:3500',
      { userId: 'u', sudoActive: false } as { userId: string; sudoActive: boolean },
    );
    const r = res.result as { approved?: boolean; canvas_id?: string };
    expect(r.approved).toBe(true);
    expect(r.canvas_id).toBe('canvas-abc');
    expect(fetchMock).toHaveBeenCalled();
    const called = fetchMock.mock.calls[0]?.[0] as string;
    expect(called).toContain('/api/canvas/canvas-abc/execute');
    const row = getIntentJob(id)!;
    expect(row.pipeline_phase).toBe('running');
    expect(row.status).toBe('running');
  });
});

describe('post_execution_decision tool', () => {
  it('keep_template updates canvases.is_template = 1', async () => {
    const id = createIntentJob({ userId: 'u', toolName: 'x' });
    updateIntentJob(id, { canvas_id: 'canvas-abc' });
    await executeTool(
      'post_execution_decision',
      { job_id: id, action: 'keep_template' },
      'http://localhost:3500',
      { userId: 'u', sudoActive: false } as { userId: string; sudoActive: boolean },
    );
    const sqlCalls = canvasesPrepare.mock.calls.map(c => c[0] as string);
    expect(sqlCalls.some(s => /UPDATE\s+canvases\s+SET\s+is_template\s*=\s*1/i.test(s))).toBe(true);
  });

  it('save_recipe stores goal as trigger pattern via saveMemory', async () => {
    const id = createIntentJob({ userId: 'u', toolName: 'x' });
    updateIntentJob(id, {
      canvas_id: 'canvas-abc',
      progressMessage: { goal: 'Resumir informe semanal', tasks: [{ step: 1 }] },
    });
    await executeTool(
      'post_execution_decision',
      { job_id: id, action: 'save_recipe' },
      'http://localhost:3500',
      { userId: 'u', sudoActive: false } as { userId: string; sudoActive: boolean },
    );
    // Verify recipe was saved against the real catbot-db user_memory table
    const rows = catbotDbRef.prepare('SELECT * FROM user_memory WHERE user_id = ?').all('u') as Array<{ trigger_patterns: string }>;
    expect(rows.length).toBeGreaterThan(0);
    const triggers = JSON.parse(rows[0].trigger_patterns) as string[];
    expect(triggers).toContain('Resumir informe semanal');
  });

  it('delete issues DELETE FROM canvases WHERE id = ?', async () => {
    const id = createIntentJob({ userId: 'u', toolName: 'x' });
    updateIntentJob(id, { canvas_id: 'canvas-abc' });
    await executeTool(
      'post_execution_decision',
      { job_id: id, action: 'delete' },
      'http://localhost:3500',
      { userId: 'u', sudoActive: false } as { userId: string; sudoActive: boolean },
    );
    const sqlCalls = canvasesPrepare.mock.calls.map(c => c[0] as string);
    expect(sqlCalls.some(s => /DELETE\s+FROM\s+canvases/i.test(s))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ASYNC_TOOLS metadata visibility
// ---------------------------------------------------------------------------
describe('ASYNC_TOOLS metadata', () => {
  it('getToolsForLLM suffixes async tools description with (ASYNC - estimated Ns)', () => {
    const tools = getToolsForLLM([]);
    const catflow = tools.find(t => t.function.name === 'execute_catflow');
    expect(catflow).toBeDefined();
    expect(catflow!.function.description).toMatch(/ASYNC - estimated \d+s/);
  });

  it('non-async tools keep their description unchanged (no ASYNC suffix)', () => {
    const tools = getToolsForLLM([]);
    const listCatBrains = tools.find(t => t.function.name === 'list_catbrains');
    expect(listCatBrains).toBeDefined();
    expect(listCatBrains!.function.description).not.toMatch(/ASYNC - estimated/);
  });
});

// ---------------------------------------------------------------------------
// Permission gate + USER_SCOPED_TOOLS enforcement
// ---------------------------------------------------------------------------
describe('6 new tools permission gate', () => {
  it('queue_intent_job, list_my_jobs, execute_approved_pipeline are always allowed', () => {
    const tools = getToolsForLLM([]);
    const names = tools.map(t => t.function.name);
    expect(names).toContain('queue_intent_job');
    expect(names).toContain('list_my_jobs');
    expect(names).toContain('execute_approved_pipeline');
  });

  it('cancel_job, approve_pipeline, post_execution_decision default-allow when allowedActions empty', () => {
    const tools = getToolsForLLM([]);
    const names = tools.map(t => t.function.name);
    expect(names).toContain('cancel_job');
    expect(names).toContain('approve_pipeline');
    expect(names).toContain('post_execution_decision');
  });

  it('cancel_job, approve_pipeline, post_execution_decision appear with manage_intent_jobs granted', () => {
    const tools = getToolsForLLM(['manage_intent_jobs']);
    const names = tools.map(t => t.function.name);
    expect(names).toContain('cancel_job');
    expect(names).toContain('approve_pipeline');
    expect(names).toContain('post_execution_decision');
  });
});

describe('USER_SCOPED_TOOLS enforcement for new tools', () => {
  it('list_my_jobs with cross-user args returns SUDO_REQUIRED without sudo', async () => {
    const res = await executeTool(
      'list_my_jobs',
      { user_id: 'someone-else' },
      'http://localhost:3500',
      { userId: 'user-A', sudoActive: false } as { userId: string; sudoActive: boolean },
    );
    const r = res.result as { error?: string };
    expect(r.error).toBe('SUDO_REQUIRED');
  });
});

// ---------------------------------------------------------------------------
// approve_catpaw_creation tool (Phase 130 Plan 04 Task 4 — closes BLOCKER 1)
// ---------------------------------------------------------------------------
describe('approve_catpaw_creation tool', () => {
  it('creates CatPaws and flips job from awaiting_user to architect_retry', async () => {
    const jobId = createIntentJob({
      userId: 'user-A',
      toolName: 'execute_catflow',
      toolArgs: { target: 'foo' },
    });
    updateIntentJob(jobId, {
      pipeline_phase: 'awaiting_user',
      progressMessage: {
        goal: 'Generar informe',
        tasks: [{ name: 'step 1' }],
        cat_paws_needed: [{ name: 'ReportWriter', system_prompt: 'Eres un redactor.' }],
        cat_paws_resolved: false,
      },
    });

    const res = await executeTool(
      'approve_catpaw_creation',
      { job_id: jobId },
      'http://localhost:3500',
      { userId: 'user-A', sudoActive: false } as { userId: string; sudoActive: boolean },
    );
    const r = res.result as { ok?: boolean; created?: string[]; next_phase?: string; error?: string };
    expect(r.ok).toBe(true);
    expect(r.next_phase).toBe('architect_retry');
    expect(r.created && r.created.length).toBe(1);

    // db.prepare INSERT INTO cat_paws was invoked
    const sqls = canvasesPrepare.mock.calls.map(c => String(c[0]));
    expect(sqls.some(s => /INSERT INTO cat_paws/i.test(s))).toBe(true);

    // job flipped to architect_retry with cat_paws_resolved=true
    const row = getIntentJob(jobId)!;
    expect(row.pipeline_phase).toBe('architect_retry');
    const progress = JSON.parse(row.progress_message) as { cat_paws_resolved?: boolean; cat_paws_created?: string[] };
    expect(progress.cat_paws_resolved).toBe(true);
    expect(progress.cat_paws_created && progress.cat_paws_created.length).toBe(1);
  });

  it('returns error when job is not in awaiting_user phase', async () => {
    const jobId = createIntentJob({ userId: 'user-A', toolName: 'execute_catflow' });
    updateIntentJob(jobId, { pipeline_phase: 'awaiting_approval' });

    const res = await executeTool(
      'approve_catpaw_creation',
      { job_id: jobId },
      'http://localhost:3500',
      { userId: 'user-A', sudoActive: false } as { userId: string; sudoActive: boolean },
    );
    const r = res.result as { error?: string };
    expect(r.error).toBeDefined();
    expect(r.error).toMatch(/awaiting_approval|phase/);
  });

  it('returns Not authorized when context.userId differs from job owner', async () => {
    const jobId = createIntentJob({ userId: 'user-A', toolName: 'execute_catflow' });
    updateIntentJob(jobId, {
      pipeline_phase: 'awaiting_user',
      progressMessage: {
        cat_paws_needed: [{ name: 'X', system_prompt: 'y' }],
      },
    });

    const res = await executeTool(
      'approve_catpaw_creation',
      { job_id: jobId },
      'http://localhost:3500',
      { userId: 'user-B', sudoActive: false } as { userId: string; sudoActive: boolean },
    );
    const r = res.result as { error?: string };
    expect(r.error).toMatch(/authorized|SUDO_REQUIRED/);
  });
});

// ---------------------------------------------------------------------------
// queue_intent_job description extension (Phase 131)
// ---------------------------------------------------------------------------
describe('queue_intent_job description extension (Phase 131)', () => {
  it('createIntentJob accepts toolName=__description__ and persists tool_args verbatim', () => {
    const id = createIntentJob({
      userId: 'u',
      toolName: '__description__',
      toolArgs: { description: 'entra holded Q1 2026', original_request: 'entra holded Q1 2026' },
    });
    const row = getIntentJob(id)!;
    expect(row.tool_name).toBe('__description__');
    const parsed = JSON.parse(row.tool_args!) as { description?: string; original_request?: string };
    expect(parsed.description).toBe('entra holded Q1 2026');
    expect(parsed.original_request).toBe('entra holded Q1 2026');
  });

  it('queue_intent_job with only {description, original_request} creates __description__ job', async () => {
    const res = await executeTool(
      'queue_intent_job',
      { description: 'resumen Q1 + email', original_request: 'entra holded...' },
      'http://localhost:3500',
      { userId: 'test:u', sudoActive: false, channel: 'web' } as { userId: string; sudoActive: boolean; channel?: string },
    );
    const r = res.result as { queued?: boolean; job_id?: string };
    expect(r.queued).toBe(true);
    const row = getIntentJob(r.job_id as string)!;
    expect(row.tool_name).toBe('__description__');
    const parsed = JSON.parse(row.tool_args!) as { description?: string };
    expect(parsed.description).toBe('resumen Q1 + email');
  });

  it('queue_intent_job with complexityDecisionId flips that row to outcome=queued, async=1', async () => {
    const decisionId = saveComplexityDecision({
      userId: 'test:u',
      channel: 'web',
      messageSnippet: 'entra holded',
      classification: 'complex',
      reason: '4 ops',
      estimatedDurationS: 180,
      asyncPathTaken: false,
    });
    await executeTool(
      'queue_intent_job',
      { description: 'trabajo', original_request: 'orig' },
      'http://localhost:3500',
      { userId: 'test:u', sudoActive: false, channel: 'web', complexityDecisionId: decisionId } as {
        userId: string; sudoActive: boolean; channel?: string; complexityDecisionId?: string;
      },
    );
    const row = catbotDbRef
      .prepare('SELECT async_path_taken, outcome FROM complexity_decisions WHERE id = ?')
      .get(decisionId) as { async_path_taken: number; outcome: string };
    expect(row.async_path_taken).toBe(1);
    expect(row.outcome).toBe('queued');
  });
});
