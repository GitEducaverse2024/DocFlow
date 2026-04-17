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
  const canvases = new Map<string, { id: string; flow_data: string | null; node_count: number; listen_mode?: number }>();
  const catPaws = new Map<string, { name: string; model?: string; mode?: string }>();
  const skills = new Map<string, { id: string; name: string }>();
  const connectors = new Map<string, { id: string; name: string }>();

  return {
    default: {
      prepare: vi.fn((sql: string) => {
        // SELECT from canvases
        if (sql.includes('SELECT') && sql.includes('canvases')) {
          return {
            run: vi.fn(),
            get: vi.fn((id: string) => {
              const c = canvases.get(id);
              if (!c) return undefined;
              return { ...c, listen_mode: c.listen_mode ?? 0 };
            }),
            all: vi.fn(() => Array.from(canvases.values())),
          };
        }
        // UPDATE canvases SET listen_mode (canvas_set_start_input with listen_mode)
        if (sql.includes('UPDATE') && sql.includes('canvases') && sql.includes('listen_mode')) {
          return {
            run: vi.fn((...params: unknown[]) => {
              // Pattern: UPDATE canvases SET listen_mode = ?, flow_data = ?, node_count = ?, updated_at = ? WHERE id = ?
              // or: UPDATE canvases SET listen_mode = ? WHERE id = ?
              // We detect by number of args
              if (params.length === 5) {
                const [listenMode, flowDataStr, nodeCount, , canvasId] = params as [number, string, number, string, string];
                const existing = canvases.get(canvasId);
                if (existing) {
                  existing.listen_mode = listenMode;
                  existing.flow_data = flowDataStr;
                  existing.node_count = nodeCount;
                }
              } else if (params.length === 2) {
                const [listenMode, canvasId] = params as [number, string];
                const existing = canvases.get(canvasId);
                if (existing) {
                  existing.listen_mode = listenMode;
                }
              }
            }),
            get: vi.fn(),
            all: vi.fn(),
          };
        }
        // UPDATE canvases (flow_data only — no listen_mode in SQL)
        if (sql.includes('UPDATE') && sql.includes('canvases')) {
          return {
            run: vi.fn((...params: unknown[]) => {
              // Pattern A: flow_data, node_count, updated_at, id (4 args)
              // Pattern B: flow_data, updated_at, id (3 args — add_edge)
              if (params.length === 4) {
                const [flowDataStr, nodeCount, , canvasId] = params as [string, number, string, string];
                const existing = canvases.get(canvasId);
                if (existing) {
                  existing.flow_data = flowDataStr;
                  existing.node_count = nodeCount;
                }
              } else if (params.length === 3) {
                const [flowDataStr, , canvasId] = params as [string, string, string];
                const existing = canvases.get(canvasId);
                if (existing) {
                  existing.flow_data = flowDataStr;
                }
              }
            }),
            get: vi.fn(),
            all: vi.fn(),
          };
        }
        // SELECT from skills
        if (sql.includes('skills') && sql.includes('SELECT')) {
          return {
            run: vi.fn(),
            get: vi.fn((id: string) => skills.get(id) || undefined),
            all: vi.fn(() => Array.from(skills.values())),
          };
        }
        // SELECT from connectors (but not canvases — canvases handled above)
        if (sql.includes('connectors') && sql.includes('SELECT')) {
          return {
            run: vi.fn(),
            get: vi.fn((id: string) => connectors.get(id) || undefined),
            all: vi.fn(() => Array.from(connectors.values())),
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
      _skills: skills,
      _connectors: connectors,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbMock: any;

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  dbMock = dbModule.default;
  const tools = await import('@/lib/services/catbot-tools');
  executeTool = tools.executeTool;
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
  dbMock._skills.clear();
  dbMock._connectors.clear();
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

// ---------------------------------------------------------------------------
// Phase 139-01: Canvas tools capabilities (TOOLS-01..04)
//
// TOOLS-01: canvas_update_node acepta model
// TOOLS-02: canvas_set_start_input
// TOOLS-03: extra_skill_ids y extra_connector_ids
// TOOLS-04: respuesta enriquecida en tools de mutacion
// ---------------------------------------------------------------------------

// ─── TOOLS-01: model en canvas_update_node ───

describe('TOOLS-01: canvas_update_node acepta model', () => {
  it('01a: canvas_update_node con model persiste model en node data', async () => {
    seedCanvas('c-t01a', {
      nodes: [{ id: 'n1', type: 'agent', position: { x: 0, y: 0 }, data: { label: 'Agente' } }],
      edges: [],
    });

    await executeTool(
      'canvas_update_node',
      { canvasId: 'c-t01a', nodeId: 'n1', model: 'canvas-classifier' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const fd = getFlowData('c-t01a');
    const node = fd!.nodes.find((n) => n.id === 'n1');
    expect((node!.data as Record<string, unknown>).model).toBe('canvas-classifier');
  });

  it('01b: canvas_update_node con model vacio resetea el override', async () => {
    seedCanvas('c-t01b', {
      nodes: [{ id: 'n1', type: 'agent', position: { x: 0, y: 0 }, data: { label: 'Agente', model: 'old-model' } }],
      edges: [],
    });

    await executeTool(
      'canvas_update_node',
      { canvasId: 'c-t01b', nodeId: 'n1', model: '' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const fd = getFlowData('c-t01b');
    const node = fd!.nodes.find((n) => n.id === 'n1');
    expect((node!.data as Record<string, unknown>).model).toBeUndefined();
  });
});

// ─── TOOLS-02: canvas_set_start_input ───

describe('TOOLS-02: canvas_set_start_input', () => {
  it('02a: persiste initialInput en START node data', async () => {
    seedCanvas('c-t02a', {
      nodes: [{ id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } }],
      edges: [],
    });

    await executeTool(
      'canvas_set_start_input',
      { canvasId: 'c-t02a', initialInput: '3 emails JSON' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const fd = getFlowData('c-t02a');
    const startNode = fd!.nodes.find((n) => n.type === 'start');
    expect((startNode!.data as Record<string, unknown>).initialInput).toBe('3 emails JSON');
  });

  it('02b: devuelve error si no hay nodo START', async () => {
    seedCanvas('c-t02b', {
      nodes: [{ id: 'n1', type: 'agent', position: { x: 0, y: 0 }, data: { label: 'Agente' } }],
      edges: [],
    });

    const result = await executeTool(
      'canvas_set_start_input',
      { canvasId: 'c-t02b', initialInput: 'test input' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const body = result.result as { error?: string };
    expect(body.error).toBeDefined();
    expect(body.error).toContain('START');
  });

  it('02c: con listen_mode=true activa listen_mode=1 en canvases row', async () => {
    seedCanvas('c-t02c', {
      nodes: [{ id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } }],
      edges: [],
    });

    await executeTool(
      'canvas_set_start_input',
      { canvasId: 'c-t02c', initialInput: 'input data', listen_mode: true },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const row = dbMock._canvases.get('c-t02c');
    expect(row.listen_mode).toBe(1);
  });

  it('02d: respuesta incluye initialInput, listen_mode, total_nodes, total_edges', async () => {
    seedCanvas('c-t02d', {
      nodes: [
        { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'n-agent', type: 'agent', position: { x: 250, y: 0 }, data: { label: 'Agente' } },
      ],
      edges: [{ id: 'e1', source: 'start-1', target: 'n-agent', type: 'default' }],
    });

    const result = await executeTool(
      'canvas_set_start_input',
      { canvasId: 'c-t02d', initialInput: 'payload data', listen_mode: false },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const body = result.result as Record<string, unknown>;
    expect(body.error).toBeUndefined();
    expect(body.initialInput).toBe('payload data');
    expect(body.total_nodes).toBe(2);
    expect(body.total_edges).toBe(1);
    expect(body.listen_mode).toBe(false);
  });
});

// ─── TOOLS-03: extra_skill_ids y extra_connector_ids ───

describe('TOOLS-03: extra_skill_ids y extra_connector_ids', () => {
  it('03a: canvas_add_node con extra_skill_ids persiste data.skills', async () => {
    seedCanvas('c-t03a', {
      nodes: [{ id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } }],
      edges: [],
    });
    dbMock._skills.set('sk1', { id: 'sk1', name: 'Skill 1' });
    dbMock._skills.set('sk2', { id: 'sk2', name: 'Skill 2' });

    await executeTool(
      'canvas_add_node',
      { canvasId: 'c-t03a', nodeType: 'AGENT', label: 'Agente Skills', extra_skill_ids: 'sk1,sk2' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const fd = getFlowData('c-t03a');
    const node = fd!.nodes.find((n) => (n.data as Record<string, unknown>).label === 'Agente Skills');
    expect(node).toBeDefined();
    expect((node!.data as Record<string, unknown>).skills).toEqual(['sk1', 'sk2']);
  });

  it('03b: canvas_add_node con extra_connector_ids persiste data.extraConnectors', async () => {
    seedCanvas('c-t03b', {
      nodes: [{ id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } }],
      edges: [],
    });
    dbMock._connectors.set('conn1', { id: 'conn1', name: 'Gmail' });

    await executeTool(
      'canvas_add_node',
      { canvasId: 'c-t03b', nodeType: 'AGENT', label: 'Agente Conns', extra_connector_ids: 'conn1' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const fd = getFlowData('c-t03b');
    const node = fd!.nodes.find((n) => (n.data as Record<string, unknown>).label === 'Agente Conns');
    expect(node).toBeDefined();
    expect((node!.data as Record<string, unknown>).extraConnectors).toEqual(['conn1']);
  });

  it('03c: canvas_add_node con skill ID invalido devuelve error', async () => {
    seedCanvas('c-t03c', {
      nodes: [{ id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } }],
      edges: [],
    });
    dbMock._skills.set('sk1', { id: 'sk1', name: 'Skill 1' });

    const result = await executeTool(
      'canvas_add_node',
      { canvasId: 'c-t03c', nodeType: 'AGENT', label: 'Agente Bad', extra_skill_ids: 'sk1,sk-bad' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const body = result.result as { error?: string };
    expect(body.error).toBeDefined();
    expect(body.error).toContain('sk-bad');
  });

  it('03d: canvas_update_node con extra_skill_ids y extra_connector_ids persiste ambos', async () => {
    seedCanvas('c-t03d', {
      nodes: [{ id: 'n1', type: 'agent', position: { x: 0, y: 0 }, data: { label: 'Agente' } }],
      edges: [],
    });
    dbMock._skills.set('sk1', { id: 'sk1', name: 'Skill 1' });
    dbMock._connectors.set('conn1', { id: 'conn1', name: 'Gmail' });

    await executeTool(
      'canvas_update_node',
      { canvasId: 'c-t03d', nodeId: 'n1', extra_skill_ids: 'sk1', extra_connector_ids: 'conn1' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const fd = getFlowData('c-t03d');
    const node = fd!.nodes.find((n) => n.id === 'n1');
    expect((node!.data as Record<string, unknown>).skills).toEqual(['sk1']);
    expect((node!.data as Record<string, unknown>).extraConnectors).toEqual(['conn1']);
  });
});

// ─── TOOLS-04: respuesta enriquecida ───

describe('TOOLS-04: respuesta enriquecida en tools de mutacion', () => {
  it('04a: canvas_add_node response incluye campos enriquecidos', async () => {
    seedCanvas('c-t04a', {
      nodes: [{ id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } }],
      edges: [],
    });

    const result = await executeTool(
      'canvas_add_node',
      { canvasId: 'c-t04a', nodeType: 'AGENT', label: 'Clasificador', instructions: 'Clasifica correos', model: 'gpt-4o' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const body = result.result as Record<string, unknown>;
    expect(body.error).toBeUndefined();
    expect(body.nodeId).toBeDefined();
    expect(body.label).toBe('Clasificador');
    expect(body.type).toBeDefined();
    expect(body.model).toBe('gpt-4o');
    expect(body.has_instructions).toBe(true);
    expect(body.has_agent).toBe(false);
    expect(body.has_skills).toBe(false);
    expect(body.has_connectors).toBe(false);
    expect(body.total_nodes).toBe(2);
    expect(body.total_edges).toBe(0);
  });

  it('04b: canvas_update_node response incluye campos enriquecidos', async () => {
    seedCanvas('c-t04b', {
      nodes: [{ id: 'n1', type: 'agent', position: { x: 0, y: 0 }, data: { label: 'Agente', instructions: 'old' } }],
      edges: [{ id: 'e1', source: 'n1', target: 'n2', type: 'default' }],
    });

    const result = await executeTool(
      'canvas_update_node',
      { canvasId: 'c-t04b', nodeId: 'n1', instructions: 'new instructions' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const body = result.result as Record<string, unknown>;
    expect(body.error).toBeUndefined();
    expect(body.updated).toBe(true);
    expect(body.nodeId).toBe('n1');
    expect(body.has_instructions).toBe(true);
    expect(body.total_nodes).toBe(1);
    expect(body.total_edges).toBe(1);
  });

  it('04c: canvas_add_edge response incluye total_nodes y total_edges', async () => {
    seedCanvas('c-t04c', {
      nodes: [
        { id: 'n1', type: 'agent', position: { x: 0, y: 0 }, data: { label: 'Agente A' } },
        { id: 'n2', type: 'agent', position: { x: 250, y: 0 }, data: { label: 'Agente B' } },
      ],
      edges: [],
    });

    const result = await executeTool(
      'canvas_add_edge',
      { canvasId: 'c-t04c', sourceNodeId: 'n1', targetNodeId: 'n2' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const body = result.result as Record<string, unknown>;
    expect(body.error).toBeUndefined();
    expect(body.total_nodes).toBe(2);
    expect(body.total_edges).toBe(1);
  });

  it('04d: canvas_set_start_input response incluye initialInput, listen_mode, total_nodes, total_edges', async () => {
    seedCanvas('c-t04d', {
      nodes: [
        { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
      ],
      edges: [],
    });

    const result = await executeTool(
      'canvas_set_start_input',
      { canvasId: 'c-t04d', initialInput: 'test data' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const body = result.result as Record<string, unknown>;
    expect(body.error).toBeUndefined();
    expect(body.initialInput).toBe('test data');
    expect(body.total_nodes).toBe(1);
    expect(body.total_edges).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 144-03: GAP-CLOSURE — canvas_get expone datos completos de nodos
// ---------------------------------------------------------------------------

describe('GAP-CLOSURE: canvas_get expone datos completos de nodos', () => {
  const canvasWithRichNodes = {
    id: 'c-rich',
    name: 'Test Canvas',
    mode: 'mixed',
    status: 'draft',
    flow_data: JSON.stringify({
      nodes: [
        {
          id: 'n-agent',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: {
            label: 'Clasificador',
            instructions: 'Clasifica emails entrantes segun producto. Usa el campo subject y body para determinar la categoria.',
            model: 'canvas-classifier',
            agentId: 'paw-uuid-123',
            agentName: 'Clasificador Inbound',
            skills: ['sk1', 'sk2'],
            connectorId: 'conn-gmail',
          },
        },
        {
          id: 'n-bare',
          type: 'agent',
          position: { x: 250, y: 0 },
          data: {
            label: 'Nodo Sin Config',
          },
        },
      ],
      edges: [{ id: 'e1', source: 'n-agent', target: 'n-bare', type: 'default' }],
    }),
  };

  function mockFetchForCanvas(canvasData: Record<string, unknown>) {
    const originalFetch = global.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/canvas/')) {
        return {
          ok: true,
          json: async () => canvasData,
        };
      }
      if (originalFetch) return originalFetch(url);
      return { ok: false, json: async () => ({}) };
    }));
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('canvas_get includes has_instructions=true when node has instructions', async () => {
    mockFetchForCanvas(canvasWithRichNodes);

    const result = await executeTool(
      'canvas_get',
      { canvasId: 'c-rich' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const body = result.result as Record<string, unknown>;
    expect(body.error).toBeUndefined();
    const nodes = body.nodes as Array<Record<string, unknown>>;
    const agentNode = nodes.find(n => n.id === 'n-agent');
    expect(agentNode).toBeDefined();
    expect(agentNode!.has_instructions).toBe(true);
  });

  it('canvas_get includes instructions_preview truncated to 200 chars', async () => {
    const longInstructions = 'A'.repeat(250);
    const canvasLong = {
      ...canvasWithRichNodes,
      flow_data: JSON.stringify({
        nodes: [{
          id: 'n-long',
          type: 'agent',
          position: { x: 0, y: 0 },
          data: { label: 'Long Node', instructions: longInstructions },
        }],
        edges: [],
      }),
    };
    mockFetchForCanvas(canvasLong);

    const result = await executeTool(
      'canvas_get',
      { canvasId: 'c-rich' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const body = result.result as Record<string, unknown>;
    const nodes = body.nodes as Array<Record<string, unknown>>;
    const node = nodes.find(n => n.id === 'n-long');
    expect(node).toBeDefined();
    expect(node!.instructions_preview).toBeDefined();
    expect((node!.instructions_preview as string).length).toBeLessThanOrEqual(203); // 200 + '...'
    expect((node!.instructions_preview as string).endsWith('...')).toBe(true);
  });

  it('canvas_get includes model when node has explicit model', async () => {
    mockFetchForCanvas(canvasWithRichNodes);

    const result = await executeTool(
      'canvas_get',
      { canvasId: 'c-rich' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const body = result.result as Record<string, unknown>;
    const nodes = body.nodes as Array<Record<string, unknown>>;
    const agentNode = nodes.find(n => n.id === 'n-agent');
    expect(agentNode!.model).toBe('canvas-classifier');
  });

  it('canvas_get includes agentId and agentName when node has agent', async () => {
    mockFetchForCanvas(canvasWithRichNodes);

    const result = await executeTool(
      'canvas_get',
      { canvasId: 'c-rich' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const body = result.result as Record<string, unknown>;
    const nodes = body.nodes as Array<Record<string, unknown>>;
    const agentNode = nodes.find(n => n.id === 'n-agent');
    expect(agentNode!.agentId).toBe('paw-uuid-123');
    expect(agentNode!.agentName).toBe('Clasificador Inbound');
  });

  it('canvas_get includes has_instructions=false when node has no instructions', async () => {
    mockFetchForCanvas(canvasWithRichNodes);

    const result = await executeTool(
      'canvas_get',
      { canvasId: 'c-rich' },
      'http://test',
      { userId: 'u-test', sudoActive: false },
    );

    const body = result.result as Record<string, unknown>;
    const nodes = body.nodes as Array<Record<string, unknown>>;
    const bareNode = nodes.find(n => n.id === 'n-bare');
    expect(bareNode).toBeDefined();
    expect(bareNode!.has_instructions).toBe(false);
    expect(bareNode!.model).toBeNull();
    expect(bareNode!.agentId).toBeNull();
  });
});
