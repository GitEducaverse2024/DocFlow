import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ---------------------------------------------------------------------------
// Use a temp DB so tests never touch production catbot.db
// ---------------------------------------------------------------------------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catbot-intents-test-'));
const tmpDbPath = path.join(tmpDir, 'catbot-test.db');
process['env']['CATBOT_DB_PATH'] = tmpDbPath;

// Mock heavy transitive deps of catbot-tools so we can import executeTool/getToolsForLLM
vi.mock('@/lib/db', () => ({
  default: { prepare: vi.fn(() => ({ all: vi.fn(() => []), get: vi.fn(), run: vi.fn() })) },
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
vi.mock('@/lib/services/catbot-user-profile', () => ({ generateInitialDirectives: vi.fn(() => '') }));
vi.mock('@/lib/services/catbot-learned', () => ({
  saveLearnedEntryWithStaging: vi.fn(() => ({ id: 'x' })),
  promoteIfReady: vi.fn(() => false),
}));

// ---------------------------------------------------------------------------
// Imports (dynamic after env var is set)
// ---------------------------------------------------------------------------
type DbModule = typeof import('@/lib/catbot-db');
type ToolsModule = typeof import('@/lib/services/catbot-tools');

let createIntent: DbModule['createIntent'];
let updateIntentStatus: DbModule['updateIntentStatus'];
let getIntent: DbModule['getIntent'];
let listIntentsByUser: DbModule['listIntentsByUser'];
let getRetryableIntents: DbModule['getRetryableIntents'];
let countUnresolvedIntents: DbModule['countUnresolvedIntents'];
let abandonIntent: DbModule['abandonIntent'];
let catbotDbRef: DbModule['catbotDb'];

let executeTool: ToolsModule['executeTool'];
let getToolsForLLM: ToolsModule['getToolsForLLM'];

beforeAll(async () => {
  const db = await import('@/lib/catbot-db');
  createIntent = db.createIntent;
  updateIntentStatus = db.updateIntentStatus;
  getIntent = db.getIntent;
  listIntentsByUser = db.listIntentsByUser;
  getRetryableIntents = db.getRetryableIntents;
  countUnresolvedIntents = db.countUnresolvedIntents;
  abandonIntent = db.abandonIntent;
  catbotDbRef = db.catbotDb;

  const tools = await import('@/lib/services/catbot-tools');
  executeTool = tools.executeTool;
  getToolsForLLM = tools.getToolsForLLM;
});

beforeEach(() => {
  catbotDbRef.exec('DELETE FROM intents');
});

// ---------------------------------------------------------------------------
// CRUD tests (INTENT-01)
// ---------------------------------------------------------------------------
describe('intents CRUD', () => {
  it('createIntent returns a non-empty id and stores default fields', () => {
    const id = createIntent({ userId: 'test:user', originalRequest: 'hola' });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const row = getIntent(id);
    expect(row).toBeDefined();
    expect(row!.user_id).toBe('test:user');
    expect(row!.status).toBe('pending');
    expect(row!.attempts).toBe(0);
    expect(row!.steps).toBe('[]');
    expect(row!.channel).toBe('web');
    expect(row!.current_step).toBe(0);
    expect(row!.completed_at).toBeNull();
  });

  it('createIntent JSON-stringifies the steps array', () => {
    const id = createIntent({
      userId: 'test:user',
      originalRequest: 'multi',
      steps: [
        { tool: 'foo', description: 'step 1' },
        { tool: 'bar', args: { x: 1 } },
      ],
    });
    const row = getIntent(id);
    expect(row).toBeDefined();
    const parsed = JSON.parse(row!.steps);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].tool).toBe('foo');
    expect(parsed[1].args.x).toBe(1);
  });

  it('updateIntentStatus updates status and current_step; updated_at changes', async () => {
    const id = createIntent({ userId: 'test:user', originalRequest: 'x' });
    const before = getIntent(id)!;
    await new Promise(r => setTimeout(r, 1100));
    updateIntentStatus(id, { status: 'in_progress', currentStep: 1 });
    const after = getIntent(id)!;
    expect(after.status).toBe('in_progress');
    expect(after.current_step).toBe(1);
    expect(after.updated_at).not.toBe(before.updated_at);
  });

  it('updateIntentStatus with status=completed sets completed_at', () => {
    const id = createIntent({ userId: 'test:user', originalRequest: 'x' });
    updateIntentStatus(id, { status: 'completed', result: 'ok' });
    const row = getIntent(id)!;
    expect(row.status).toBe('completed');
    expect(row.result).toBe('ok');
    expect(row.completed_at).not.toBeNull();
  });

  it('updateIntentStatus with status=failed and incrementAttempts bumps attempts', () => {
    const id = createIntent({ userId: 'test:user', originalRequest: 'x' });
    updateIntentStatus(id, { status: 'failed', lastError: 'boom', incrementAttempts: true });
    const row = getIntent(id)!;
    expect(row.status).toBe('failed');
    expect(row.last_error).toBe('boom');
    expect(row.attempts).toBe(1);

    updateIntentStatus(id, { incrementAttempts: true });
    expect(getIntent(id)!.attempts).toBe(2);
  });

  it('listIntentsByUser returns only rows for the requested user (cross-user isolation)', () => {
    createIntent({ userId: 'user-A', originalRequest: 'a1' });
    createIntent({ userId: 'user-A', originalRequest: 'a2' });
    createIntent({ userId: 'user-B', originalRequest: 'b1' });

    const a = listIntentsByUser('user-A');
    expect(a).toHaveLength(2);
    expect(a.every(r => r.user_id === 'user-A')).toBe(true);

    const b = listIntentsByUser('user-B');
    expect(b).toHaveLength(1);
    expect(b[0].user_id).toBe('user-B');
  });

  it('listIntentsByUser respects status filter and limit', () => {
    const id1 = createIntent({ userId: 'u', originalRequest: 'a' });
    const id2 = createIntent({ userId: 'u', originalRequest: 'b' });
    createIntent({ userId: 'u', originalRequest: 'c' });
    updateIntentStatus(id1, { status: 'completed' });
    updateIntentStatus(id2, { status: 'completed' });

    const completed = listIntentsByUser('u', { status: 'completed' });
    expect(completed).toHaveLength(2);

    const limited = listIntentsByUser('u', { limit: 1 });
    expect(limited).toHaveLength(1);
  });

  it('getRetryableIntents returns only failed rows with attempts < max, ordered asc', () => {
    const id1 = createIntent({ userId: 'u', originalRequest: 'a' });
    const id2 = createIntent({ userId: 'u', originalRequest: 'b' });
    const id3 = createIntent({ userId: 'u', originalRequest: 'c' });
    updateIntentStatus(id1, { status: 'failed', incrementAttempts: true });
    updateIntentStatus(id2, { status: 'failed', incrementAttempts: true });
    updateIntentStatus(id2, { incrementAttempts: true });
    updateIntentStatus(id2, { incrementAttempts: true });
    // id2 now has 3 attempts, should be excluded
    updateIntentStatus(id3, { status: 'completed' });

    const retryable = getRetryableIntents(3);
    expect(retryable).toHaveLength(1);
    expect(retryable[0].id).toBe(id1);
  });

  it('countUnresolvedIntents counts failed + abandoned', () => {
    const id1 = createIntent({ userId: 'u', originalRequest: 'a' });
    const id2 = createIntent({ userId: 'u', originalRequest: 'b' });
    createIntent({ userId: 'u', originalRequest: 'c' });
    updateIntentStatus(id1, { status: 'failed' });
    abandonIntent(id2, 'nope');

    expect(countUnresolvedIntents()).toBe(2);
  });

  it('abandonIntent marks as abandoned with reason and completed_at', () => {
    const id = createIntent({ userId: 'u', originalRequest: 'x' });
    abandonIntent(id, 'user cancelled');
    const row = getIntent(id)!;
    expect(row.status).toBe('abandoned');
    expect(row.last_error).toBe('user cancelled');
    expect(row.completed_at).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tool execution tests (INTENT-03)
// ---------------------------------------------------------------------------
describe('intent tools via executeTool', () => {
  it('create_intent uses context.userId (NOT args) and returns intent_id', async () => {
    const res = await executeTool(
      'create_intent',
      { original_request: 'Hazme una cosa' },
      'http://localhost:3500',
      { userId: 'test:user', sudoActive: false, channel: 'web' } as unknown as { userId: string; sudoActive: boolean },
    );
    const r = res.result as Record<string, unknown>;
    expect(r.created).toBe(true);
    expect(typeof r.intent_id).toBe('string');

    const row = getIntent(r.intent_id as string);
    expect(row).toBeDefined();
    expect(row!.user_id).toBe('test:user');
    expect(row!.channel).toBe('web');
    expect(row!.original_request).toBe('Hazme una cosa');
  });

  it('list_my_intents uses context.userId and does NOT leak cross-user intents', async () => {
    createIntent({ userId: 'user-A', originalRequest: 'A1' });
    createIntent({ userId: 'user-B', originalRequest: 'B1' });

    const res = await executeTool(
      'list_my_intents',
      {},
      'http://localhost:3500',
      { userId: 'user-A', sudoActive: false } as { userId: string; sudoActive: boolean },
    );
    const r = res.result as { count: number; intents: Array<{ original_request: string }> };
    expect(r.count).toBe(1);
    expect(r.intents[0].original_request).toBe('A1');
  });

  it('update_intent_status via tool updates the DB row', async () => {
    const id = createIntent({ userId: 'u', originalRequest: 'x' });
    await executeTool(
      'update_intent_status',
      { intent_id: id, status: 'completed', result: 'done' },
      'http://localhost:3500',
      { userId: 'u', sudoActive: false } as { userId: string; sudoActive: boolean },
    );
    const row = getIntent(id)!;
    expect(row.status).toBe('completed');
    expect(row.result).toBe('done');
  });

  it('retry_intent sets status=pending and clears last_error', async () => {
    const id = createIntent({ userId: 'u', originalRequest: 'x' });
    updateIntentStatus(id, { status: 'failed', lastError: 'boom', incrementAttempts: true });
    const res = await executeTool(
      'retry_intent',
      { intent_id: id },
      'http://localhost:3500',
      { userId: 'u', sudoActive: false } as { userId: string; sudoActive: boolean },
    );
    const r = res.result as Record<string, unknown>;
    expect(r.retried).toBe(true);
    const row = getIntent(id)!;
    expect(row.status).toBe('pending');
    expect(row.last_error).toBeNull();
  });

  it('retry_intent returns error when attempts >= 3', async () => {
    const id = createIntent({ userId: 'u', originalRequest: 'x' });
    updateIntentStatus(id, { status: 'failed', incrementAttempts: true });
    updateIntentStatus(id, { incrementAttempts: true });
    updateIntentStatus(id, { incrementAttempts: true });
    const res = await executeTool(
      'retry_intent',
      { intent_id: id },
      'http://localhost:3500',
      { userId: 'u', sudoActive: false } as { userId: string; sudoActive: boolean },
    );
    const r = res.result as { error?: string };
    expect(r.error).toMatch(/limite/i);
  });

  it('abandon_intent marks row as abandoned with reason in last_error', async () => {
    const id = createIntent({ userId: 'u', originalRequest: 'x' });
    await executeTool(
      'abandon_intent',
      { intent_id: id, reason: 'user cancelled' },
      'http://localhost:3500',
      { userId: 'u', sudoActive: false } as { userId: string; sudoActive: boolean },
    );
    const row = getIntent(id)!;
    expect(row.status).toBe('abandoned');
    expect(row.last_error).toBe('user cancelled');
  });
});

// ---------------------------------------------------------------------------
// Permission gate tests
// ---------------------------------------------------------------------------
describe('intent tools permission gate', () => {
  it('create_intent, update_intent_status, list_my_intents are always_allowed', () => {
    const tools = getToolsForLLM([]);
    const names = tools.map(t => t.function.name);
    expect(names).toContain('create_intent');
    expect(names).toContain('update_intent_status');
    expect(names).toContain('list_my_intents');
  });

  it('retry_intent and abandon_intent default-allow when allowedActions is empty', () => {
    const tools = getToolsForLLM([]);
    const names = tools.map(t => t.function.name);
    expect(names).toContain('retry_intent');
    expect(names).toContain('abandon_intent');
  });

  it('retry_intent and abandon_intent appear when manage_intents is granted', () => {
    const tools = getToolsForLLM(['manage_intents']);
    const names = tools.map(t => t.function.name);
    expect(names).toContain('retry_intent');
    expect(names).toContain('abandon_intent');
  });
});
