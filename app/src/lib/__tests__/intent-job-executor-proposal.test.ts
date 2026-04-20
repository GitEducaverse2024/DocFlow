/**
 * Phase 137 Plan 04 (LEARN-07): sendProposal Telegram redesign tests.
 *
 * Verifies the rich proposal body format — title of the canvas, nodes list
 * with role/type emoji, estimated time, inline approve/reject buttons with
 * backward-compatible callback_data, and safety cap at 4000 chars.
 *
 * Phase 155 note: the legacy knowledge-tree assertion was removed when
 * `app/data/knowledge/catboard.json` was deleted; canonical documentation
 * lives in `.docflow-kb/` via `search_kb`.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ---------------------------------------------------------------------------
// Temp DB so tests never touch production catbot.db
// ---------------------------------------------------------------------------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'intent-job-executor-proposal-test-'));
const tmpDbPath = path.join(tmpDir, 'catbot-test.db');
process['env']['CATBOT_DB_PATH'] = tmpDbPath;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const dbGetMock = vi.fn();
const dbPrepareMock = vi.fn((sql: string) => {
  void sql;
  return {
    run: vi.fn(),
    get: dbGetMock,
    all: vi.fn(() => []),
  };
});
vi.mock('@/lib/db', () => ({
  default: { prepare: dbPrepareMock },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const sendMessageWithInlineKeyboardMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/services/telegram-bot', () => ({
  telegramBotService: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendMessageWithInlineKeyboard: sendMessageWithInlineKeyboardMock,
  },
}));

const createNotificationMock = vi.fn();
vi.mock('@/lib/services/notifications', () => ({
  createNotification: createNotificationMock,
}));

vi.mock('@/lib/services/canvas-rules', () => ({
  loadRulesIndex: vi.fn(() => 'MOCK_RULES_INDEX'),
  getCanvasRule: vi.fn(() => null),
}));

// ---------------------------------------------------------------------------
// Dynamic import after env / mocks set
// ---------------------------------------------------------------------------
type ExecModule = typeof import('@/lib/services/intent-job-executor');
let IntentJobExecutor: ExecModule['IntentJobExecutor'];

beforeAll(async () => {
  const mod = await import('@/lib/services/intent-job-executor');
  IntentJobExecutor = mod.IntentJobExecutor;
});

beforeEach(() => {
  sendMessageWithInlineKeyboardMock.mockClear();
  createNotificationMock.mockClear();
  dbGetMock.mockReset();
  dbPrepareMock.mockClear();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    user_id: 'u1',
    intent_id: null,
    channel: 'telegram',
    channel_ref: '12345',
    tool_name: 'execute_catflow',
    tool_args: '{}',
    status: 'pending',
    pipeline_phase: 'architect',
    progress_message: '',
    canvas_id: null,
    error_message: null,
    created_at: '',
    updated_at: '',
    complexity_decision_id: null,
    ...overrides,
  };
}

const HOLDED_Q1_FLOW = {
  nodes: [
    { id: 'n0', type: 'start', data: { label: 'Inicio' }, position: { x: 0, y: 0 } },
    { id: 'n1', type: 'agent', data: { label: 'Extractor Q1 2025', role: 'extractor', instructions: 'Extrae facturas de Holded del Q1 2025' }, position: { x: 1, y: 0 } },
    { id: 'n2', type: 'agent', data: { label: 'Extractor Q1 2026', role: 'extractor', instructions: 'Extrae facturas de Holded del Q1 2026' }, position: { x: 2, y: 0 } },
    { id: 'n3', type: 'merge', data: { label: 'Merge', role: 'transformer', instructions: 'Combina ambos resultados' }, position: { x: 3, y: 0 } },
    { id: 'n4', type: 'agent', data: { label: 'Comparador', role: 'synthesizer', instructions: 'Genera análisis ejecutivo' }, position: { x: 4, y: 0 } },
    { id: 'n5', type: 'agent', data: { label: 'Maquetador', role: 'renderer', instructions: 'Aplica template corporativo' }, position: { x: 5, y: 0 } },
    { id: 'n6', type: 'connector', data: { label: 'Gmail Antonio', role: 'emitter', instructions: 'Envía informe por email' }, position: { x: 6, y: 0 } },
  ],
  edges: [],
};

function mockCanvasRow(name: string, flow: unknown) {
  dbGetMock.mockImplementation(() => ({
    name,
    flow_data: JSON.stringify(flow),
  }));
}

async function callSendProposal(
  job: ReturnType<typeof makeJob>,
  canvasId: string,
  goal: unknown,
  tasks: unknown,
): Promise<void> {
  await (IntentJobExecutor as unknown as {
    sendProposal: (j: unknown, c: string, g: unknown, t: unknown) => Promise<void>;
  }).sendProposal(job, canvasId, goal, tasks);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('sendProposal — LEARN-07 rich Telegram format', () => {
  it('Test 1: includes the canvas name (from canvases.name)', async () => {
    mockCanvasRow('Comparativa Holded Q1', HOLDED_Q1_FLOW);
    await callSendProposal(makeJob(), 'canvas-1', 'Quiero comparar Q1 25 vs Q1 26', [{ name: 't1' }]);
    expect(sendMessageWithInlineKeyboardMock).toHaveBeenCalledTimes(1);
    const [, body] = sendMessageWithInlineKeyboardMock.mock.calls[0];
    expect(body).toContain('Comparativa Holded Q1');
    expect(body).toContain('CatFlow generado');
  });

  it('Test 2: contains "Nodos (N):" with one line per node', async () => {
    mockCanvasRow('Comparativa Holded Q1', HOLDED_Q1_FLOW);
    await callSendProposal(makeJob(), 'canvas-1', 'goal', []);
    const [, body] = sendMessageWithInlineKeyboardMock.mock.calls[0];
    expect(body).toContain('Nodos (7):');
    // One line per node — each node label shows up
    for (const n of HOLDED_Q1_FLOW.nodes) {
      expect(body).toContain((n.data as { label: string }).label);
    }
  });

  it('Test 3: each node line has emoji by role (fallback to type, then default •)', async () => {
    const flow = {
      nodes: [
        { id: 'a', type: 'agent', data: { label: 'Ex', role: 'extractor' } },
        { id: 'b', type: 'agent', data: { label: 'Tr', role: 'transformer' } },
        { id: 'c', type: 'agent', data: { label: 'Sy', role: 'synthesizer' } },
        { id: 'd', type: 'agent', data: { label: 'Re', role: 'renderer' } },
        { id: 'e', type: 'agent', data: { label: 'Em', role: 'emitter' } },
        { id: 'f', type: 'agent', data: { label: 'Gu', role: 'guard' } },
        { id: 'g', type: 'agent', data: { label: 'Rp', role: 'reporter' } },
        { id: 'h', type: 'start', data: { label: 'St' } },
        { id: 'i', type: 'agent', data: { label: 'NoRole' } },
      ],
      edges: [],
    };
    mockCanvasRow('Canvas Emojis', flow);
    await callSendProposal(makeJob(), 'canvas-1', 'goal', []);
    const [, body] = sendMessageWithInlineKeyboardMock.mock.calls[0];
    expect(body).toMatch(/📥[^\n]*Ex/);
    expect(body).toMatch(/🔁[^\n]*Tr/);
    expect(body).toMatch(/🧠[^\n]*Sy/);
    expect(body).toMatch(/🎨[^\n]*Re/);
    expect(body).toMatch(/📤[^\n]*Em/);
    expect(body).toMatch(/🚦[^\n]*Gu/);
    expect(body).toMatch(/📊[^\n]*Rp/);
    expect(body).toMatch(/🚀[^\n]*St/);
    expect(body).toMatch(/•[^\n]*NoRole/);
  });

  it('Test 4: node line contains label or instructions fallback truncated to ~60 chars', async () => {
    const long = 'Instrucciones muy largas que exceden los sesenta caracteres configurados como limite';
    const flow = {
      nodes: [
        { id: 'a', type: 'agent', data: { label: 'L', role: 'extractor', instructions: long } },
        { id: 'b', type: 'agent', data: { id: 'b', role: 'transformer', instructions: long } },
      ],
      edges: [],
    };
    mockCanvasRow('C', flow);
    await callSendProposal(makeJob(), 'canvas-1', 'goal', []);
    const [, body] = sendMessageWithInlineKeyboardMock.mock.calls[0];
    // Truncation marker
    expect(body).toContain('...');
    // Neither full instructions should appear verbatim
    expect(body).not.toContain(long);
  });

  it('Test 5: includes estimated time line "⏱ Tiempo estimado: ~N minuto(s)" clamped [1,10]', async () => {
    mockCanvasRow('Comparativa Holded Q1', HOLDED_Q1_FLOW);
    await callSendProposal(makeJob(), 'canvas-1', 'goal', []);
    const [, body] = sendMessageWithInlineKeyboardMock.mock.calls[0];
    expect(body).toMatch(/⏱ Tiempo estimado: ~\d+ minuto/);
    const match = body.match(/~(\d+) minuto/);
    expect(match).toBeTruthy();
    const n = parseInt(match![1], 10);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(10);
  });

  it('Test 6: buttons preserve callback_data pipeline:{jobId}:approve|reject (backward compat)', async () => {
    mockCanvasRow('C', HOLDED_Q1_FLOW);
    await callSendProposal(makeJob({ id: 'job-xyz' }), 'canvas-1', 'goal', []);
    const [, , keyboard] = sendMessageWithInlineKeyboardMock.mock.calls[0];
    expect(Array.isArray(keyboard)).toBe(true);
    expect(keyboard[0]).toHaveLength(2);
    expect(keyboard[0][0].callback_data).toBe('pipeline:job-xyz:approve');
    expect(keyboard[0][1].callback_data).toBe('pipeline:job-xyz:reject');
    expect(keyboard[0][0].text).toContain('Aprobar');
    expect(keyboard[0][1].text).toContain('Cancelar');
  });

  it('Test 7: if message exceeds 4000 chars, nodes list is truncated to 20 with "... y N más" and total stays <4096', async () => {
    const bigFlow = {
      nodes: Array.from({ length: 80 }, (_, i) => ({
        id: `n${i}`,
        type: 'agent',
        data: {
          label: `Nodo numero ${i} con texto extenso`,
          role: 'transformer',
          instructions: 'Descripcion larga del nodo para forzar longitud ' + 'x'.repeat(40),
        },
      })),
      edges: [],
    };
    mockCanvasRow('Mega Canvas', bigFlow);
    await callSendProposal(makeJob(), 'canvas-1', 'goal', []);
    const [, body] = sendMessageWithInlineKeyboardMock.mock.calls[0];
    expect(body.length).toBeLessThan(4096);
    expect(body).toMatch(/y \d+ (nodos )?m[aá]s/);
    // Header count reflects real total
    expect(body).toContain('Nodos (80):');
  });

  it('Test 8: web channel uses createNotification with the rich body (no telegram send)', async () => {
    mockCanvasRow('Comparativa Holded Q1', HOLDED_Q1_FLOW);
    await callSendProposal(makeJob({ channel: 'web', channel_ref: null }), 'canvas-1', 'goal', []);
    expect(sendMessageWithInlineKeyboardMock).not.toHaveBeenCalled();
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
    const arg = createNotificationMock.mock.calls[0][0];
    expect(arg.message).toContain('CatFlow generado');
    expect(arg.message).toContain('Nodos (7):');
    expect(arg.message).toMatch(/⏱ Tiempo estimado/);
  });

  // Phase 155: legacy knowledge tree (app/data/knowledge/catboard.json) was
  // deleted. LEARN-07 documentation lives in the KB now (`.docflow-kb/`);
  // the CLAUDE.md knowledge-tree protocol is obsolete.
});
