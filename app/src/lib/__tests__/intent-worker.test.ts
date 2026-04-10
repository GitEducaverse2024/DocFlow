import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ---------------------------------------------------------------------------
// Temp DB so tests never touch production catbot.db
// ---------------------------------------------------------------------------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'intent-worker-test-'));
const tmpDbPath = path.join(tmpDir, 'catbot-test.db');
process['env']['CATBOT_DB_PATH'] = tmpDbPath;

// Logger mock (IntentWorker uses @/lib/logger)
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Dynamic imports so env var is set before module load
// ---------------------------------------------------------------------------
type DbModule = typeof import('@/lib/catbot-db');
type WorkerModule = typeof import('@/lib/services/intent-worker');

let createIntent: DbModule['createIntent'];
let updateIntentStatus: DbModule['updateIntentStatus'];
let getIntent: DbModule['getIntent'];
let catbotDbRef: DbModule['catbotDb'];
let IntentWorker: WorkerModule['IntentWorker'];

beforeAll(async () => {
  const db = await import('@/lib/catbot-db');
  createIntent = db.createIntent;
  updateIntentStatus = db.updateIntentStatus;
  getIntent = db.getIntent;
  catbotDbRef = db.catbotDb;

  const worker = await import('@/lib/services/intent-worker');
  IntentWorker = worker.IntentWorker;
});

beforeEach(() => {
  catbotDbRef.exec('DELETE FROM intents');
});

// ---------------------------------------------------------------------------
// State machine tests (INTENT-04)
// ---------------------------------------------------------------------------

describe('IntentWorker.tick — state machine', () => {
  it('re-queues failed intent with attempts < 2 (pending + attempts+1)', async () => {
    const id = createIntent({ userId: 'test:user', originalRequest: 'foo' });
    updateIntentStatus(id, { status: 'failed', lastError: 'network', incrementAttempts: true });
    // attempts=1, status=failed

    await IntentWorker.tick();

    const intent = getIntent(id)!;
    expect(intent.status).toBe('pending');
    expect(intent.attempts).toBe(2);
  });

  it('abandons intent when next attempt would reach MAX_ATTEMPTS=3', async () => {
    const id = createIntent({ userId: 'test:user', originalRequest: 'bar' });
    updateIntentStatus(id, { status: 'failed', incrementAttempts: true });
    updateIntentStatus(id, { status: 'failed', lastError: 'boom', incrementAttempts: true });
    // attempts=2, status=failed — next retry would be attempt 3 → abandon

    await IntentWorker.tick();

    const intent = getIntent(id)!;
    expect(intent.status).toBe('abandoned');
    expect(intent.completed_at).not.toBeNull();
    expect(intent.last_error).toMatch(/Max retries/);
  });

  it('skips pending intents (not in getRetryableIntents)', async () => {
    const id = createIntent({ userId: 'test:user', originalRequest: 'baz' });
    // Default status=pending, attempts=0

    await IntentWorker.tick();

    const intent = getIntent(id)!;
    expect(intent.status).toBe('pending');
    expect(intent.attempts).toBe(0);
  });

  it('skips completed, in_progress, abandoned intents', async () => {
    const idCompleted = createIntent({ userId: 'test:user', originalRequest: 'a' });
    updateIntentStatus(idCompleted, { status: 'completed' });

    const idInProgress = createIntent({ userId: 'test:user', originalRequest: 'b' });
    updateIntentStatus(idInProgress, { status: 'in_progress' });

    const idAbandoned = createIntent({ userId: 'test:user', originalRequest: 'c' });
    updateIntentStatus(idAbandoned, { status: 'abandoned', lastError: 'user abandoned' });

    await IntentWorker.tick();

    expect(getIntent(idCompleted)!.status).toBe('completed');
    expect(getIntent(idInProgress)!.status).toBe('in_progress');
    expect(getIntent(idAbandoned)!.status).toBe('abandoned');
  });

  it('processes multiple failed intents in one tick', async () => {
    const ids = [1, 2, 3].map(i => {
      const id = createIntent({ userId: 'test:user', originalRequest: `req-${i}` });
      updateIntentStatus(id, { status: 'failed', incrementAttempts: true });
      return id;
    });

    await IntentWorker.tick();

    for (const id of ids) {
      const intent = getIntent(id)!;
      expect(intent.status).toBe('pending');
      expect(intent.attempts).toBe(2);
    }
  });

  it('continues processing remaining intents if one fails', async () => {
    // Create 3 failed intents
    const idA = createIntent({ userId: 'test:user', originalRequest: 'A' });
    updateIntentStatus(idA, { status: 'failed', incrementAttempts: true });
    const idB = createIntent({ userId: 'test:user', originalRequest: 'B' });
    updateIntentStatus(idB, { status: 'failed', incrementAttempts: true });
    const idC = createIntent({ userId: 'test:user', originalRequest: 'C' });
    updateIntentStatus(idC, { status: 'failed', incrementAttempts: true });

    // Spy on catbot-db.updateIntentStatus and throw on middle intent id
    const dbModule = await import('@/lib/catbot-db');
    const original = dbModule.updateIntentStatus;
    const spy = vi.spyOn(dbModule, 'updateIntentStatus').mockImplementation((id, patch) => {
      if (id === idB) throw new Error('simulated failure');
      return original(id, patch);
    });

    await IntentWorker.tick();

    // A and C should be re-queued despite B failing
    expect(getIntent(idA)!.status).toBe('pending');
    expect(getIntent(idC)!.status).toBe('pending');
    // B stays failed (update threw before applying)
    expect(getIntent(idB)!.status).toBe('failed');

    spy.mockRestore();
  });

  it('does not import or reference executeTool (LLM-driven retry, not code)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../services/intent-worker.ts'),
      'utf-8',
    );
    expect(src).not.toMatch(/executeTool/);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle tests
// ---------------------------------------------------------------------------

describe('IntentWorker lifecycle', () => {
  it('exposes start() and stop() as static methods', () => {
    expect(typeof IntentWorker.start).toBe('function');
    expect(typeof IntentWorker.stop).toBe('function');
  });

  it('stop() without start() does not throw', () => {
    expect(() => IntentWorker.stop()).not.toThrow();
  });

  it('after stop(), internal timers are cleared', () => {
    IntentWorker.stop();
    // Access private statics via indexed access for probing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = IntentWorker as any;
    expect(w.intervalId).toBeNull();
    expect(w.timeoutId).toBeNull();
  });
});
