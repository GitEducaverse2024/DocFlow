import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ---------------------------------------------------------------------------
// Use a temp DB so tests never touch production catbot.db
// ---------------------------------------------------------------------------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'complexity-decisions-test-'));
const tmpDbPath = path.join(tmpDir, 'catbot-test.db');
process['env']['CATBOT_DB_PATH'] = tmpDbPath;

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

type DbModule = typeof import('@/lib/catbot-db');

let saveComplexityDecision: DbModule['saveComplexityDecision'];
let updateComplexityOutcome: DbModule['updateComplexityOutcome'];
let listComplexityDecisionsByUser: DbModule['listComplexityDecisionsByUser'];
let countComplexTimeoutsLast24h: DbModule['countComplexTimeoutsLast24h'];
let catbotDbRef: DbModule['catbotDb'];

beforeAll(async () => {
  const db = await import('@/lib/catbot-db');
  saveComplexityDecision = db.saveComplexityDecision;
  updateComplexityOutcome = db.updateComplexityOutcome;
  listComplexityDecisionsByUser = db.listComplexityDecisionsByUser;
  countComplexTimeoutsLast24h = db.countComplexTimeoutsLast24h;
  catbotDbRef = db.catbotDb;
});

beforeEach(() => {
  catbotDbRef.exec('DELETE FROM complexity_decisions');
});

describe('complexity_decisions CRUD', () => {
  it('saveComplexityDecision inserts a row and returns a non-empty id', () => {
    const id = saveComplexityDecision({
      userId: 'test:user',
      classification: 'simple',
    });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const row = catbotDbRef
      .prepare('SELECT * FROM complexity_decisions WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    expect(row).toBeDefined();
    expect(row!.user_id).toBe('test:user');
  });

  it('saveComplexityDecision persists all fields and truncates messageSnippet to 200 chars', () => {
    const longMsg = 'A'.repeat(500);
    const id = saveComplexityDecision({
      userId: 'test:user',
      channel: 'telegram',
      messageSnippet: longMsg,
      classification: 'complex',
      reason: '4 ops + agregacion temporal',
      estimatedDurationS: 180,
      asyncPathTaken: true,
    });
    const row = catbotDbRef
      .prepare('SELECT * FROM complexity_decisions WHERE id = ?')
      .get(id) as Record<string, unknown>;
    expect(row.classification).toBe('complex');
    expect(row.reason).toBe('4 ops + agregacion temporal');
    expect(row.estimated_duration_s).toBe(180);
    expect(row.async_path_taken).toBe(1);
    expect(row.channel).toBe('telegram');
    expect((row.message_snippet as string).length).toBe(200);
  });

  it("saveComplexityDecision defaults channel='web', async_path_taken=0, outcome=null", () => {
    const id = saveComplexityDecision({
      userId: 'u',
      classification: 'simple',
    });
    const row = catbotDbRef
      .prepare('SELECT * FROM complexity_decisions WHERE id = ?')
      .get(id) as Record<string, unknown>;
    expect(row.channel).toBe('web');
    expect(row.async_path_taken).toBe(0);
    expect(row.outcome).toBeNull();
  });

  it('updateComplexityOutcome sets outcome and optionally flips async_path_taken', () => {
    const id = saveComplexityDecision({ userId: 'u', classification: 'complex' });
    updateComplexityOutcome(id, 'queued', true);
    const row = catbotDbRef
      .prepare('SELECT * FROM complexity_decisions WHERE id = ?')
      .get(id) as Record<string, unknown>;
    expect(row.outcome).toBe('queued');
    expect(row.async_path_taken).toBe(1);

    const id2 = saveComplexityDecision({ userId: 'u', classification: 'complex' });
    updateComplexityOutcome(id2, 'completed');
    const row2 = catbotDbRef
      .prepare('SELECT * FROM complexity_decisions WHERE id = ?')
      .get(id2) as Record<string, unknown>;
    expect(row2.outcome).toBe('completed');
    expect(row2.async_path_taken).toBe(0);
  });

  it('listComplexityDecisionsByUser returns rows in DESC created_at order, honors limit', async () => {
    saveComplexityDecision({ userId: 'u', classification: 'simple', reason: 'first' });
    await new Promise(r => setTimeout(r, 1100));
    saveComplexityDecision({ userId: 'u', classification: 'complex', reason: 'second' });
    await new Promise(r => setTimeout(r, 1100));
    saveComplexityDecision({ userId: 'u', classification: 'ambiguous', reason: 'third' });

    const rows = listComplexityDecisionsByUser('u');
    expect(rows.length).toBe(3);
    expect(rows[0].reason).toBe('third');
    expect(rows[2].reason).toBe('first');

    const limited = listComplexityDecisionsByUser('u', 2);
    expect(limited.length).toBe(2);
  });

  it('listComplexityDecisionsByUser does NOT return rows from other users', () => {
    saveComplexityDecision({ userId: 'user-A', classification: 'simple' });
    saveComplexityDecision({ userId: 'user-A', classification: 'complex' });
    saveComplexityDecision({ userId: 'user-B', classification: 'simple' });

    const a = listComplexityDecisionsByUser('user-A');
    expect(a.length).toBe(2);
    expect(a.every(r => r.user_id === 'user-A')).toBe(true);

    const b = listComplexityDecisionsByUser('user-B');
    expect(b.length).toBe(1);
    expect(b[0].user_id).toBe('user-B');
  });

  it('countComplexTimeoutsLast24h counts only complex + async_path_taken=0 + outcome=timeout', () => {
    const id1 = saveComplexityDecision({ userId: 'u', classification: 'complex' });
    updateComplexityOutcome(id1, 'timeout');

    const id2 = saveComplexityDecision({ userId: 'u', classification: 'complex' });
    updateComplexityOutcome(id2, 'timeout');

    expect(countComplexTimeoutsLast24h()).toBe(2);
  });

  it('countComplexTimeoutsLast24h ignores other classifications, async=1 rows, and non-timeout outcomes', () => {
    // simple + timeout -> ignored (wrong classification)
    const s1 = saveComplexityDecision({ userId: 'u', classification: 'simple' });
    updateComplexityOutcome(s1, 'timeout');

    // complex + async_path_taken=1 + timeout -> ignored
    const c1 = saveComplexityDecision({
      userId: 'u',
      classification: 'complex',
      asyncPathTaken: true,
    });
    updateComplexityOutcome(c1, 'timeout', true);

    // complex + async=0 + outcome=completed -> ignored
    const c2 = saveComplexityDecision({ userId: 'u', classification: 'complex' });
    updateComplexityOutcome(c2, 'completed');

    // valid one
    const c3 = saveComplexityDecision({ userId: 'u', classification: 'complex' });
    updateComplexityOutcome(c3, 'timeout');

    expect(countComplexTimeoutsLast24h()).toBe(1);
  });
});
