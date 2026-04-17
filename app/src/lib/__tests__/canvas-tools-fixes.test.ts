import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Phase 138-01: Canvas tools fixes (CANVAS-01, CANVAS-02, CANVAS-03)
//
// CANVAS-01: canvas_add_node debe persistir instructions + model explicito
// CANVAS-02: canvas_add_edge debe validar reglas estructurales
// CANVAS-03: canvas_add_node debe validar label obligatorio (min 3 chars)
// ---------------------------------------------------------------------------

vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  const tmpDir = nodeFs.mkdtempSync(
    nodePath.join(nodeOs.tmpdir(), 'canvas-tools-fixes-test-'),
  );
  process['env']['CATBOT_DB_PATH'] = nodePath.join(tmpDir, 'catbot-test.db');
});

// Mock heavy transitive deps (same pattern as catbot-tools-retry-job.test.ts)
vi.mock('@/lib/db', () => {
  const canvases = new Map<string, { id: string; flow_data: string | null; node_count: number }>();
  const catPaws = new Map<string, { name: string; model?: string; mode?: string }>();

  return {
    default: {
      prepare: vi.fn((sql: string) => {
        // SELECT from canvases
        if (sql.includes('SELECT') && sql.includes('canvases')) {
          return {
            run: vi.fn(),
            get: vi.fn((id: string) => canvases.get(id) || undefined),
            all: vi.fn(() => Array.from(canvases.values())),
          };
        }
        // UPDATE canvases
        if (sql.includes('UPDATE') && sql.includes('canvases')) {
          return {
            run: vi.fn((flowDataStr: string, nodeCount: number, _updatedAt: string, canvasId: string) => {
              const existing = canvases.get(canvasId);
              if (existing) {
                existing.flow_data = flowDataStr;
                existing.node_count = nodeCount;
              }
            }),
            get: vi.fn(),
            all: vi.fn(),
          };
        }
        // SELECT from cat_paws
        if (sql.includes('cat_paws')) {
          return {
            run: vi.fn(),
            get: vi.fn((id: string) => catPaws.get(id) || undefined),
            all: vi.fn(() => []),
          };
        }
        // Default fallback
        return {
          run: vi.fn(),
          get: vi.fn(() => ({ instructions: 'fake skill' })),
          all: vi.fn(() => []),
        };
      }),
      // Expose internal stores for seeding in tests
      _canvases: canvases,
      _catPaws: catPaws,
    },
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

type ToolsModule = typeof import('@/lib/services/catbot-tools');

let executeTool: ToolsModule['executeTool'];
let TOOLS: ToolsModule['TOOLS'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbMock: any;

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  dbMock = dbModule.default;
  const tools = await import('@/lib/services/catbot-tools');
  executeTool = tools.executeTool;
  TOOLS = tools.TOOLS;
});

// Helpers
function seedCanvas(canvasId: string, flowData: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> }) {
  dbMock._canvases.set(canvasId, {
    id: canvasId,
    flow_data: JSON.stringify(flowData),
    node_count: flowData.nodes.length,
  });
}

function getFlowData(canvasId: string): { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> } | null {
  const row = dbMock._canvases.get(canvasId);
  if (!row || !row.flow_data) return null;
  return JSON.parse(row.flow_data);
}

beforeEach(() => {
  dbMock._canvases.clear();
  dbMock._catPaws.clear();
});

// ─── CANVAS-01: Persistir instructions + model ───

describe('CANVAS-01: canvas_add_node persiste instructions y model', () => {
  it('01a: persiste instructions en flow_data node data', async () => {
    seedCanvas('c-01a', { nodes: [{ id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } }], edges: [] });

    await executeTool(
      'canvas_add_node',
      { canvasId: 'c-01a', nodeType: 'AGENT', label: 'Clasificador', instructions: 'Clasifica emails por producto' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const fd = getFlowData('c-01a');
    const agentNode = fd!.nodes.find((n) => (n.data as Record<string, unknown>).label === 'Clasificador');
    expect(agentNode).toBeDefined();
    expect((agentNode!.data as Record<string, unknown>).instructions).toBe('Clasifica emails por producto');
  });

  it('01b: persiste model explicito en flow_data (sin agentId)', async () => {
    seedCanvas('c-01b', { nodes: [{ id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } }], edges: [] });

    await executeTool(
      'canvas_add_node',
      { canvasId: 'c-01b', nodeType: 'AGENT', label: 'Nodo LLM', model: 'canvas-classifier' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const fd = getFlowData('c-01b');
    const node = fd!.nodes.find((n) => (n.data as Record<string, unknown>).label === 'Nodo LLM');
    expect(node).toBeDefined();
    expect((node!.data as Record<string, unknown>).model).toBe('canvas-classifier');
  });

  it('01c: model explicito override el del CatPaw', async () => {
    seedCanvas('c-01c', { nodes: [{ id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } }], edges: [] });
    dbMock._catPaws.set('paw-123', { name: 'MiPaw', model: 'paw-default-model', mode: 'tool' });

    await executeTool(
      'canvas_add_node',
      { canvasId: 'c-01c', nodeType: 'AGENT', label: 'Agente Override', agentId: 'paw-123', model: 'explicit-model' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const fd = getFlowData('c-01c');
    const node = fd!.nodes.find((n) => (n.data as Record<string, unknown>).label === 'Agente Override');
    expect(node).toBeDefined();
    expect((node!.data as Record<string, unknown>).model).toBe('explicit-model');
  });
});

// ─── CANVAS-02: Validar reglas estructurales en canvas_add_edge ───

describe('CANVAS-02: canvas_add_edge valida reglas estructurales', () => {
  it('02a: rechaza edge de salida desde OUTPUT (terminal)', async () => {
    seedCanvas('c-02a', {
      nodes: [
        { id: 'n-out', type: 'output', position: { x: 0, y: 0 }, data: { label: 'Output' } },
        { id: 'n-agent', type: 'agent', position: { x: 250, y: 0 }, data: { label: 'Agent' } },
      ],
      edges: [],
    });

    const result = await executeTool(
      'canvas_add_edge',
      { canvasId: 'c-02a', sourceNodeId: 'n-out', targetNodeId: 'n-agent' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const body = result.result as { error?: string };
    expect(body.error).toBeDefined();
    expect(body.error).toContain('terminal');
  });

  it('02b: rechaza segundo edge de salida desde START', async () => {
    seedCanvas('c-02b', {
      nodes: [
        { id: 'n-start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'n-a', type: 'agent', position: { x: 250, y: 0 }, data: { label: 'A' } },
        { id: 'n-b', type: 'agent', position: { x: 250, y: 100 }, data: { label: 'B' } },
      ],
      edges: [
        { id: 'e-start-a', source: 'n-start', target: 'n-a', type: 'default' },
      ],
    });

    const result = await executeTool(
      'canvas_add_edge',
      { canvasId: 'c-02b', sourceNodeId: 'n-start', targetNodeId: 'n-b' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const body = result.result as { error?: string };
    expect(body.error).toBeDefined();
    expect(body.error).toContain('START');
  });

  it('02c: rechaza CONDITION sin sourceHandle valido', async () => {
    seedCanvas('c-02c', {
      nodes: [
        { id: 'n-cond', type: 'condition', position: { x: 0, y: 0 }, data: { label: 'Cond' } },
        { id: 'n-a', type: 'agent', position: { x: 250, y: 0 }, data: { label: 'A' } },
      ],
      edges: [],
    });

    const result = await executeTool(
      'canvas_add_edge',
      { canvasId: 'c-02c', sourceNodeId: 'n-cond', targetNodeId: 'n-a' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const body = result.result as { error?: string };
    expect(body.error).toBeDefined();
    expect(body.error).toContain('sourceHandle');
  });

  it('02d: rechaza rama duplicada en CONDITION', async () => {
    seedCanvas('c-02d', {
      nodes: [
        { id: 'n-cond', type: 'condition', position: { x: 0, y: 0 }, data: { label: 'Cond' } },
        { id: 'n-a', type: 'agent', position: { x: 250, y: 0 }, data: { label: 'A' } },
        { id: 'n-b', type: 'agent', position: { x: 250, y: 100 }, data: { label: 'B' } },
      ],
      edges: [
        { id: 'e-cond-a', source: 'n-cond', target: 'n-a', sourceHandle: 'yes', type: 'default' },
      ],
    });

    const result = await executeTool(
      'canvas_add_edge',
      { canvasId: 'c-02d', sourceNodeId: 'n-cond', targetNodeId: 'n-b', sourceHandle: 'yes' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const body = result.result as { error?: string };
    expect(body.error).toBeDefined();
    expect(body.error).toContain('yes');
  });
});

// ─── CANVAS-03: Validar label obligatorio ───

describe('CANVAS-03: canvas_add_node valida label obligatorio', () => {
  it('03a: rechaza label vacio', async () => {
    seedCanvas('c-03a', { nodes: [], edges: [] });

    const result = await executeTool(
      'canvas_add_node',
      { canvasId: 'c-03a', nodeType: 'AGENT', label: '' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const body = result.result as { error?: string };
    expect(body.error).toBeDefined();
    expect(body.error).toContain('label');
  });

  it('03b: rechaza label menor a 3 caracteres', async () => {
    seedCanvas('c-03b', { nodes: [], edges: [] });

    const result = await executeTool(
      'canvas_add_node',
      { canvasId: 'c-03b', nodeType: 'AGENT', label: 'AB' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const body = result.result as { error?: string };
    expect(body.error).toBeDefined();
    expect(body.error).toContain('label');
  });
});
