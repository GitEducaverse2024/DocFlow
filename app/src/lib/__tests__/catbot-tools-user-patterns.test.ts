import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// LEARN-02/03/04 + LEARN-08 oracle: catbot-tools tools for user patterns
// and complexity outcome stats.
// Mirrors the mocking strategy from catbot-intents.test.ts so executeTool /
// getToolsForLLM can be imported without hitting heavy transitive deps.
// ---------------------------------------------------------------------------

vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  const tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'catbot-tools-patterns-test-'));
  process['env']['CATBOT_DB_PATH'] = nodePath.join(tmpDir, 'catbot-test.db');
});

// Mock heavy transitive deps of catbot-tools. db is mocked so skill queries
// return a canned "Protocolo de creacion de CatPaw" row.
vi.mock('@/lib/db', () => {
  const mockPrepare = (query: string) => {
    if (typeof query === 'string' && query.toLowerCase().includes("from skills") && query.toLowerCase().includes("category") && query.toLowerCase().includes('system')) {
      return {
        get: () => ({ instructions: 'PROTOCOLO DE CREACION DE CATPAW\nPASO 1 — identificar funcion\nPASO 5 — plan + create_cat_paw' }),
        all: () => [{ instructions: 'PROTOCOLO DE CREACION DE CATPAW\nPASO 1\nPASO 5' }],
        run: () => ({}),
      };
    }
    return { get: () => undefined, all: () => [], run: () => ({}) };
  };
  return {
    default: { prepare: vi.fn(mockPrepare) },
  };
});
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

// catbot-user-profile re-exports helpers used by catbot-tools. We do NOT
// mock this module — we want to exercise the real getUserPatterns /
// writeUserPattern / getComplexityOutcomeStats against the real catbot.db.

type DbModule = typeof import('@/lib/catbot-db');
type ToolsModule = typeof import('@/lib/services/catbot-tools');

let executeTool: ToolsModule['executeTool'];
let getToolsForLLM: ToolsModule['getToolsForLLM'];
let catbotDbRef: DbModule['catbotDb'];

beforeAll(async () => {
  const dbMod = await import('@/lib/catbot-db');
  catbotDbRef = dbMod.catbotDb;
  const tools = await import('@/lib/services/catbot-tools');
  executeTool = tools.executeTool;
  getToolsForLLM = tools.getToolsForLLM;
});

beforeEach(() => {
  catbotDbRef.exec('DELETE FROM user_interaction_patterns');
  catbotDbRef.exec('DELETE FROM complexity_decisions');
});

describe('LEARN-03 tools: list_user_patterns + write_user_pattern + get_user_patterns_summary', () => {
  it('write_user_pattern inserts a row and returns success + generated id', async () => {
    const result = await executeTool(
      'write_user_pattern',
      {
        pattern_type: 'delivery_preference',
        pattern_key: 'recipients',
        pattern_value: 'antonio+fen',
        confidence: 4,
      },
      'http://test',
      { userId: 'u-tools-1', sudoActive: false },
    );
    expect(result.result).toMatchObject({ ok: true });
    const row = catbotDbRef
      .prepare("SELECT * FROM user_interaction_patterns WHERE user_id = 'u-tools-1'")
      .get() as { pattern_value: string; confidence: number };
    expect(row.pattern_value).toBe('antonio+fen');
    expect(row.confidence).toBe(4);
  });

  it('list_user_patterns returns rows for the current user only', async () => {
    catbotDbRef
      .prepare(
        `INSERT INTO user_interaction_patterns
           (id, user_id, pattern_type, pattern_key, pattern_value, confidence, last_seen, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .run('p1', 'u-tools-2', 'delivery_preference', 'recipients', 'antonio+fen', 3);
    catbotDbRef
      .prepare(
        `INSERT INTO user_interaction_patterns
           (id, user_id, pattern_type, pattern_key, pattern_value, confidence, last_seen, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .run('p2', 'u-tools-other', 'other', 'k', 'should-not-appear', 1);

    const result = await executeTool(
      'list_user_patterns',
      {},
      'http://test',
      { userId: 'u-tools-2', sudoActive: false },
    );
    const body = result.result as { patterns: Array<{ pattern_value: string }> };
    expect(body.patterns.length).toBe(1);
    expect(body.patterns[0].pattern_value).toBe('antonio+fen');
  });

  it('get_user_patterns_summary returns a text summary of the current user patterns', async () => {
    await executeTool(
      'write_user_pattern',
      { pattern_type: 'frequent_task', pattern_key: 'report', pattern_value: 'Q1 holded', confidence: 5 },
      'http://test',
      { userId: 'u-tools-3', sudoActive: false },
    );
    const result = await executeTool(
      'get_user_patterns_summary',
      {},
      'http://test',
      { userId: 'u-tools-3', sudoActive: false },
    );
    const body = result.result as { summary: string };
    expect(typeof body.summary).toBe('string');
    expect(body.summary).toContain('Q1 holded');
  });
});

describe('LEARN-08 oracle tool: get_complexity_outcome_stats', () => {
  it('returns a histogram with window_days default 30', async () => {
    const result = await executeTool('get_complexity_outcome_stats', {}, 'http://test', {
      userId: 'u-oracle',
      sudoActive: false,
    });
    const body = result.result as {
      window_days: number;
      total: number;
      completed: number;
      failed: number;
      timeout: number;
      pending: number;
      success_rate: number;
    };
    expect(body.window_days).toBe(30);
    expect(body.total).toBe(0);
    expect(body.completed).toBe(0);
    expect(body.success_rate).toBe(0);
  });

  it('reflects outcomes inserted into complexity_decisions', async () => {
    const stmt = catbotDbRef.prepare(
      `INSERT INTO complexity_decisions (id, user_id, classification, outcome, created_at)
       VALUES (?, 'u-oracle', 'complex', ?, datetime('now'))`,
    );
    stmt.run('c1', 'completed');
    stmt.run('c2', 'completed');
    stmt.run('c3', 'failed');
    stmt.run('c4', null);

    const result = await executeTool(
      'get_complexity_outcome_stats',
      { window_days: 7 },
      'http://test',
      { userId: 'u-oracle', sudoActive: false },
    );
    const body = result.result as {
      window_days: number;
      total: number;
      completed: number;
      failed: number;
      pending: number;
      success_rate: number;
    };
    expect(body.window_days).toBe(7);
    expect(body.total).toBe(4);
    expect(body.completed).toBe(2);
    expect(body.failed).toBe(1);
    expect(body.pending).toBe(1);
    expect(body.success_rate).toBeCloseTo(0.5, 5);
  });
});

describe('Permission gate for pattern tools', () => {
  it('list_user_patterns is always_allowed (appears with empty allowedActions)', () => {
    const allowed = getToolsForLLM([]);
    const names = allowed.map((t) => t.function.name);
    expect(names).toContain('list_user_patterns');
  });

  it('get_user_patterns_summary is always_allowed', () => {
    const allowed = getToolsForLLM([]);
    const names = allowed.map((t) => t.function.name);
    expect(names).toContain('get_user_patterns_summary');
  });

  it('get_complexity_outcome_stats is always_allowed', () => {
    const allowed = getToolsForLLM([]);
    const names = allowed.map((t) => t.function.name);
    expect(names).toContain('get_complexity_outcome_stats');
  });

  it('write_user_pattern is permission-gated: gated out without manage_user_patterns', () => {
    const allowed = getToolsForLLM(['manage_canvas']);
    const names = allowed.map((t) => t.function.name);
    expect(names).not.toContain('write_user_pattern');
  });

  it('write_user_pattern is allowed when manage_user_patterns is granted', () => {
    const allowed = getToolsForLLM(['manage_user_patterns']);
    const names = allowed.map((t) => t.function.name);
    expect(names).toContain('write_user_pattern');
  });

  it('write_user_pattern is allowed when allowedActions is empty (default permissive)', () => {
    const allowed = getToolsForLLM([]);
    const names = allowed.map((t) => t.function.name);
    expect(names).toContain('write_user_pattern');
  });
});
