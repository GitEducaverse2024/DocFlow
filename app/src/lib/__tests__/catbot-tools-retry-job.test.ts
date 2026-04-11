import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Phase 137-07 Task 3 RED: retry_intent_job CatBot tool.
//
// Behaviour under test:
//   1. retry_intent_job is a new tool in TOOLS[] and requires sudo
//      (appears in gated tool catalog ONLY when allowedActions is empty OR
//      contains 'manage_intent_jobs').
//   2. executeTool('retry_intent_job') WITHOUT sudoActive returns
//      { error: 'SUDO_REQUIRED', ... }.
//   3. With sudoActive + a valid job_id it creates a NEW intent_job with:
//        - Same goal/user/channel/channel_ref/tool_name/tool_args as original
//        - config_overrides JSON including architect_max_tokens when provided
//        - parent_job_id back-link to the original job
//        - status/pipeline_phase reset to pending/pending
//      and returns { new_job_id, overrides_applied }.
//   4. Invalid job_id returns { error: 'not_found' }.
// ---------------------------------------------------------------------------

vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  const tmpDir = nodeFs.mkdtempSync(
    nodePath.join(nodeOs.tmpdir(), 'catbot-tools-retry-test-'),
  );
  process['env']['CATBOT_DB_PATH'] = nodePath.join(tmpDir, 'catbot-test.db');
});

// Mock heavy transitive deps of catbot-tools so the import chain is tractable.
vi.mock('@/lib/db', () => ({
  default: {
    prepare: vi.fn(() => ({
      run: vi.fn(),
      get: vi.fn(() => ({ instructions: 'fake skill' })),
      all: vi.fn(() => []),
    })),
  },
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
vi.mock('@/lib/services/catbot-learned', () => ({
  saveLearnedEntryWithStaging: vi.fn(() => ({ id: 'x' })),
  promoteIfReady: vi.fn(() => false),
}));

type DbModule = typeof import('@/lib/catbot-db');
type ToolsModule = typeof import('@/lib/services/catbot-tools');

let executeTool: ToolsModule['executeTool'];
let getToolsForLLM: ToolsModule['getToolsForLLM'];
let TOOLS: ToolsModule['TOOLS'];
let catbotDbRef: DbModule['catbotDb'];

beforeAll(async () => {
  const dbMod = await import('@/lib/catbot-db');
  catbotDbRef = dbMod.catbotDb;
  const tools = await import('@/lib/services/catbot-tools');
  executeTool = tools.executeTool;
  getToolsForLLM = tools.getToolsForLLM;
  TOOLS = tools.TOOLS;
});

beforeEach(() => {
  catbotDbRef.exec('DELETE FROM intent_jobs');
});

function seedOriginalJob(overrides: Partial<{
  id: string;
  user_id: string;
  channel: string;
  channel_ref: string;
  tool_name: string;
  tool_args: string;
  status: string;
  failure_class: string;
}> = {}) {
  const id = overrides.id ?? 'orig-job-1';
  catbotDbRef
    .prepare(
      `INSERT INTO intent_jobs (id, user_id, channel, channel_ref, tool_name, tool_args, status, failure_class, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
    .run(
      id,
      overrides.user_id ?? 'u-retry',
      overrides.channel ?? 'telegram',
      overrides.channel_ref ?? '12345',
      overrides.tool_name ?? '__description__',
      overrides.tool_args ?? '{"description":"Q1 holded"}',
      overrides.status ?? 'failed',
      overrides.failure_class ?? 'truncated_json',
    );
  return id;
}

describe('retry_intent_job tool registration', () => {
  it('is registered in TOOLS array', () => {
    const names = TOOLS.map((t) => t.function.name);
    expect(names).toContain('retry_intent_job');
  });

  it('is sudo-gated: absent from catalog with non-sudo allowedActions', () => {
    const visible = getToolsForLLM(['manage_canvas']);
    const names = visible.map((t) => t.function.name);
    expect(names).not.toContain('retry_intent_job');
  });

  it('is allowed when manage_intent_jobs is granted', () => {
    const visible = getToolsForLLM(['manage_intent_jobs']);
    const names = visible.map((t) => t.function.name);
    expect(names).toContain('retry_intent_job');
  });
});

describe('retry_intent_job executeTool — auth gate', () => {
  it('returns SUDO_REQUIRED when executed without sudoActive', async () => {
    const origId = seedOriginalJob();
    const result = await executeTool(
      'retry_intent_job',
      { job_id: origId },
      'http://test',
      { userId: 'u-retry', sudoActive: false },
    );
    const body = result.result as { error?: string };
    expect(body.error).toBe('SUDO_REQUIRED');
  });
});

describe('retry_intent_job executeTool — happy path', () => {
  it('creates a new job with parent_job_id back-link and inherited fields', async () => {
    const origId = seedOriginalJob({
      user_id: 'u-retry',
      channel: 'telegram',
      channel_ref: '99',
      tool_name: '__description__',
      tool_args: '{"description":"Holded Q1 2026 vs Q1 2025"}',
    });
    const result = await executeTool(
      'retry_intent_job',
      { job_id: origId },
      'http://test',
      { userId: 'u-retry', sudoActive: true },
    );
    const body = result.result as {
      new_job_id?: string;
      overrides_applied?: Record<string, unknown>;
      error?: string;
    };
    expect(body.error).toBeUndefined();
    expect(typeof body.new_job_id).toBe('string');

    const row = catbotDbRef
      .prepare('SELECT * FROM intent_jobs WHERE id = ?')
      .get(body.new_job_id) as {
        user_id: string;
        channel: string;
        channel_ref: string;
        tool_name: string;
        tool_args: string;
        status: string;
        pipeline_phase: string;
        parent_job_id: string;
        config_overrides: string | null;
      };
    expect(row.user_id).toBe('u-retry');
    expect(row.channel).toBe('telegram');
    expect(row.channel_ref).toBe('99');
    expect(row.tool_name).toBe('__description__');
    expect(JSON.parse(row.tool_args).description).toBe('Holded Q1 2026 vs Q1 2025');
    expect(row.status).toBe('pending');
    expect(row.pipeline_phase).toBe('pending');
    expect(row.parent_job_id).toBe(origId);
  });

  it('applies architect_max_tokens override via config_overrides', async () => {
    const origId = seedOriginalJob();
    const result = await executeTool(
      'retry_intent_job',
      { job_id: origId, architect_max_tokens: 32000 },
      'http://test',
      { userId: 'u-retry', sudoActive: true },
    );
    const body = result.result as {
      new_job_id?: string;
      overrides_applied?: { architect_max_tokens?: number };
    };
    expect(body.overrides_applied?.architect_max_tokens).toBe(32000);

    const row = catbotDbRef
      .prepare('SELECT config_overrides FROM intent_jobs WHERE id = ?')
      .get(body.new_job_id) as { config_overrides: string };
    const overrides = JSON.parse(row.config_overrides);
    expect(overrides.architect_max_tokens).toBe(32000);
  });

  it('returns not_found for unknown job_id', async () => {
    const result = await executeTool(
      'retry_intent_job',
      { job_id: 'does-not-exist' },
      'http://test',
      { userId: 'u-retry', sudoActive: true },
    );
    const body = result.result as { error?: string };
    expect(body.error).toBe('not_found');
  });
});
