import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory fake stores for db (canvases + canvas_runs) and catbotDb (intent_jobs)
// ---------------------------------------------------------------------------
interface CanvasRow { id: string; flow_data: string }
interface CanvasRunRow {
  id: string;
  canvas_id: string;
  status: string;
  metadata: string | null;
  node_states: string | null;
  started_at: string;
}
interface IntentJobRow {
  id: string;
  canvas_id: string;
  user_id: string;
  channel: string;
  channel_ref: string | null;
  created_at: string;
}

const canvases = new Map<string, CanvasRow>();
const canvasRuns: CanvasRunRow[] = [];
const intentJobs: IntentJobRow[] = [];

function resetFakes() {
  canvases.clear();
  canvasRuns.length = 0;
  intentJobs.length = 0;
}

// --- Mock @/lib/db (better-sqlite3 main) ---
vi.mock('@/lib/db', () => {
  const prepare = (sql: string) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    return {
      get: (...args: unknown[]): unknown => {
        if (q.startsWith("SELECT id, metadata, node_states FROM canvas_runs WHERE canvas_id = ? AND status = 'running'")) {
          const canvasId = args[0] as string;
          const running = canvasRuns
            .filter(r => r.canvas_id === canvasId && r.status === 'running')
            .sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
          const r = running[0];
          return r ? { id: r.id, metadata: r.metadata, node_states: r.node_states } : undefined;
        }
        if (q.startsWith('SELECT flow_data FROM canvases WHERE id = ?')) {
          const c = canvases.get(args[0] as string);
          return c ? { flow_data: c.flow_data } : undefined;
        }
        return undefined;
      },
      run: (...args: unknown[]): unknown => {
        if (q.startsWith('UPDATE canvases SET flow_data = ? WHERE id = ?')) {
          const [flow_data, id] = args as [string, string];
          const row = canvases.get(id);
          if (row) row.flow_data = flow_data;
          return { changes: 1 };
        }
        if (q.startsWith('UPDATE canvas_runs SET metadata = ? WHERE id = ?')) {
          const [metadata, id] = args as [string, string];
          const r = canvasRuns.find(r => r.id === id);
          if (r) r.metadata = metadata;
          return { changes: 1 };
        }
        if (q.startsWith('UPDATE canvas_runs SET node_states = ?, status = ? WHERE id = ?')) {
          const [node_states, status, id] = args as [string, string, string];
          const r = canvasRuns.find(r => r.id === id);
          if (r) { r.node_states = node_states; r.status = status; }
          return { changes: 1 };
        }
        return { changes: 0 };
      },
      all: () => [],
    };
  };
  return { default: { prepare } };
});

// --- Mocks needing hoisted refs (vi.mock is hoisted above top-level vars) ---
const { saveKnowledgeGapMock, createNotificationMock } = vi.hoisted(() => ({
  saveKnowledgeGapMock: vi.fn(),
  createNotificationMock: vi.fn(),
}));

// --- Mock @/lib/catbot-db (intent_jobs lookup + saveKnowledgeGap) ---
vi.mock('@/lib/catbot-db', () => {
  const prepare = (sql: string) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    return {
      get: (...args: unknown[]): unknown => {
        if (q.startsWith('SELECT user_id, channel, channel_ref FROM intent_jobs WHERE canvas_id = ?')) {
          const canvasId = args[0] as string;
          const rows = intentJobs
            .filter(j => j.canvas_id === canvasId)
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          return rows[0];
        }
        return undefined;
      },
    };
  };
  return {
    default: { prepare },
    saveKnowledgeGap: saveKnowledgeGapMock,
  };
});

// --- Mock logger ---
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// --- Mock notifications ---
vi.mock('@/lib/services/notifications', () => ({
  createNotification: createNotificationMock,
}));

// --- Mock telegram-bot (dynamic import inside notifyUserIrreparable) ---
const telegramSendMessageMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/services/telegram-bot', () => ({
  telegramBotService: {
    sendMessage: telegramSendMessageMock,
  },
}));

// --- Mock catbot-pipeline-prompts so we don't need the full module graph ---
vi.mock('@/lib/services/catbot-pipeline-prompts', () => ({
  AGENT_AUTOFIX_PROMPT: 'Eres el auto-reparador. Responde JSON.',
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks set up)
// ---------------------------------------------------------------------------
import { attemptNodeRepair } from '@/lib/services/canvas-auto-repair';

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------
function seedCanvasAndRun(opts: {
  canvasId: string;
  runId: string;
  metadata?: Record<string, unknown>;
  startedAt?: string;
  status?: string;
  nodeStates?: Record<string, unknown>;
}) {
  const flow = {
    nodes: [
      { id: 'n3', type: 'agent', data: { agentId: 'a', instructions: 'OUTPUT: {html_body}' } },
      { id: 'n5', type: 'connector', data: { mode: 'send_email', instructions: 'INPUT: {html_body}' } },
    ],
    edges: [{ id: 'e1', source: 'n3', target: 'n5' }],
  };
  canvases.set(opts.canvasId, { id: opts.canvasId, flow_data: JSON.stringify(flow) });
  canvasRuns.push({
    id: opts.runId,
    canvas_id: opts.canvasId,
    status: opts.status ?? 'running',
    metadata: JSON.stringify(opts.metadata ?? {}),
    node_states: JSON.stringify(opts.nodeStates ?? { n3: { status: 'completed' }, n5: { status: 'completed' } }),
    started_at: opts.startedAt ?? new Date().toISOString(),
  });
}

function mockFetchOnce(content: string) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as unknown as Response);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('attemptNodeRepair (QA2-07)', () => {
  beforeEach(() => {
    resetFakes();
    saveKnowledgeGapMock.mockReset();
    createNotificationMock.mockReset();
    vi.unstubAllGlobals?.();
  });

  it('first failure: LLM fixes instructions → flow_data updated + repair_attempts=1 + status=running', async () => {
    seedCanvasAndRun({ canvasId: 'c1', runId: 'r1' });
    mockFetchOnce(JSON.stringify({
      status: 'fixed',
      fix_target_node_id: 'n3',
      fixed_instructions: 'INPUT: {invoices}\nOUTPUT: {html_body: string no vacio}',
      reason: 'added explicit contract',
    }));

    const res = await attemptNodeRepair({
      canvasId: 'c1',
      failedNodeId: 'n5',
      guardReport: 'html_body empty',
      actualInput: '{}',
    });

    expect(res.success).toBe(true);
    const row = canvases.get('c1')!;
    const fd = JSON.parse(row.flow_data);
    const n3 = fd.nodes.find((n: { id: string }) => n.id === 'n3');
    expect(n3.data.instructions).toContain('html_body: string no vacio');

    const run = canvasRuns.find(r => r.id === 'r1')!;
    const meta = JSON.parse(run.metadata!);
    expect(meta.repair_attempts.n5).toBe(1);
    expect(run.status).toBe('running');
    const ns = JSON.parse(run.node_states!);
    expect(ns.n3).toBeUndefined();
    expect(ns.n5).toBeUndefined();
  });

  it('LLM returns status:repair_failed → result.success === false, flow_data unchanged', async () => {
    seedCanvasAndRun({ canvasId: 'c1', runId: 'r1' });
    const originalFlow = canvases.get('c1')!.flow_data;
    mockFetchOnce(JSON.stringify({ status: 'repair_failed', reason: 'cannot determine contract' }));

    const res = await attemptNodeRepair({
      canvasId: 'c1',
      failedNodeId: 'n5',
      guardReport: 'empty',
      actualInput: '{}',
    });

    expect(res.success).toBe(false);
    expect(String(res.reason ?? '')).toContain('cannot determine');
    expect(canvases.get('c1')!.flow_data).toBe(originalFlow);
  });

  it("LLM returns invalid JSON → result.success === false with reason containing 'invalid LLM JSON'", async () => {
    seedCanvasAndRun({ canvasId: 'c1', runId: 'r1' });
    mockFetchOnce('not json at all');

    const res = await attemptNodeRepair({
      canvasId: 'c1',
      failedNodeId: 'n5',
      guardReport: 'empty',
      actualInput: '{}',
    });

    expect(res.success).toBe(false);
    expect(String(res.reason ?? '').toLowerCase()).toContain('invalid');
  });
});

describe('attemptNodeRepair exhaustion (QA2-08)', () => {
  beforeEach(() => {
    resetFakes();
    saveKnowledgeGapMock.mockReset();
    createNotificationMock.mockReset();
  });

  it('repair_attempts[failedNodeId] >= 1 on entry → skip repair, call saveKnowledgeGap + notifyUserIrreparable', async () => {
    seedCanvasAndRun({
      canvasId: 'c1',
      runId: 'r1',
      metadata: { repair_attempts: { n5: 1 } },
    });
    intentJobs.push({
      id: 'j1',
      canvas_id: 'c1',
      user_id: 'u1',
      channel: 'telegram',
      channel_ref: '12345',
      created_at: new Date().toISOString(),
    });

    // If LLM is called, test fails
    global.fetch = vi.fn().mockRejectedValue(new Error('LLM should NOT be called on exhaustion'));

    const res = await attemptNodeRepair({
      canvasId: 'c1',
      failedNodeId: 'n5',
      guardReport: 'still empty',
      actualInput: '{}',
    });

    expect(res.success).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(saveKnowledgeGapMock).toHaveBeenCalledTimes(1);
    const gapArgs = saveKnowledgeGapMock.mock.calls[0][0];
    expect(gapArgs.knowledgePath).toBe('catflow/design/data-contract');
    expect(String(gapArgs.query)).toContain('n5');
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('notifyUserIrreparable: first-class channel+channel_ref fields AND Telegram push', async () => {
    seedCanvasAndRun({
      canvasId: 'c1',
      runId: 'r1',
      metadata: { repair_attempts: { n5: 1 } },
    });
    intentJobs.push({
      id: 'j1',
      canvas_id: 'c1',
      user_id: 'u1',
      channel: 'telegram',
      channel_ref: '12345',
      created_at: new Date().toISOString(),
    });
    telegramSendMessageMock.mockClear();

    await attemptNodeRepair({
      canvasId: 'c1',
      failedNodeId: 'n5',
      guardReport: 'still empty',
      actualInput: '{}',
    });

    // Phase 132 hotfix: channel + channel_ref are now first-class params
    // (not embedded in message as [ref:<id>] suffix).
    const call = createNotificationMock.mock.calls[0][0];
    expect(call.channel).toBe('telegram');
    expect(call.channel_ref).toBe('12345');
    expect(call.message).not.toContain('[ref:');

    // And the Telegram bot receives an immediate alert on the originating chat.
    expect(telegramSendMessageMock).toHaveBeenCalledTimes(1);
    expect(telegramSendMessageMock.mock.calls[0][0]).toBe(12345);
    expect(String(telegramSendMessageMock.mock.calls[0][1])).toContain('n5');
  });

  it('notifyUserIrreparable gracefully handles missing intent_job', async () => {
    seedCanvasAndRun({
      canvasId: 'c1',
      runId: 'r1',
      metadata: { repair_attempts: { n5: 1 } },
    });
    // No intent_jobs row seeded

    const res = await attemptNodeRepair({
      canvasId: 'c1',
      failedNodeId: 'n5',
      guardReport: 'still empty',
      actualInput: '{}',
    });

    expect(res.success).toBe(false);
    // Should not crash; createNotification not called since no intent_job
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('multiple running canvas_runs for same canvas_id: picks most recent', async () => {
    canvases.set('c1', { id: 'c1', flow_data: JSON.stringify({
      nodes: [
        { id: 'n3', type: 'agent', data: { instructions: 'x' } },
        { id: 'n5', type: 'connector', data: { mode: 'send_email' } },
      ],
      edges: [{ id: 'e1', source: 'n3', target: 'n5' }],
    }) });
    canvasRuns.push({
      id: 'r_old',
      canvas_id: 'c1',
      status: 'running',
      metadata: '{}',
      node_states: JSON.stringify({ n3: {}, n5: {} }),
      started_at: '2026-04-01T00:00:00Z',
    });
    canvasRuns.push({
      id: 'r_new',
      canvas_id: 'c1',
      status: 'running',
      metadata: '{}',
      node_states: JSON.stringify({ n3: {}, n5: {} }),
      started_at: '2026-04-10T00:00:00Z',
    });

    mockFetchOnce(JSON.stringify({
      status: 'fixed',
      fix_target_node_id: 'n3',
      fixed_instructions: 'INPUT:\nOUTPUT: {html_body}',
      reason: 'ok',
    }));

    const res = await attemptNodeRepair({
      canvasId: 'c1',
      failedNodeId: 'n5',
      guardReport: 'empty',
      actualInput: '{}',
    });

    expect(res.success).toBe(true);
    // r_new should have the repair_attempts updated, r_old untouched
    const rNew = canvasRuns.find(r => r.id === 'r_new')!;
    const rOld = canvasRuns.find(r => r.id === 'r_old')!;
    expect(JSON.parse(rNew.metadata!).repair_attempts.n5).toBe(1);
    expect(rOld.metadata).toBe('{}');
  });
});
