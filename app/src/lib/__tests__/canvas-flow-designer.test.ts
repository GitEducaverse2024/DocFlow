import { describe, it, expect, vi } from 'vitest';
import {
  validateFlowData,
  scanCanvasResources,
  VALID_NODE_TYPES,
  isSideEffectNode,
  insertSideEffectGuards,
} from '@/lib/services/canvas-flow-designer';

// ---------------------------------------------------------------------------
// VALID_NODE_TYPES
// ---------------------------------------------------------------------------
describe('VALID_NODE_TYPES', () => {
  // Phase 133 FOUND-02: drift gate. Must stay in sync with canvas-executor.ts
  // switch handlers. Any add/remove/rename must update this list explicitly,
  // otherwise the test fails loudly (no silent divergence).
  const expected = [
    'start',
    'agent',
    'catpaw',
    'catbrain',
    'condition',
    'iterator',
    'iterator_end',
    'merge',
    'multiagent',
    'scheduler',
    'checkpoint',
    'connector',
    'storage',
    'output',
  ] as const;

  it('contains exactly the 14 canvas-executor node types (FOUND-02 gate)', () => {
    expect(VALID_NODE_TYPES.length).toBe(14);
    for (const t of expected) {
      expect(VALID_NODE_TYPES).toContain(t);
    }
    // Exact-set equality: nothing extra, nothing missing.
    expect([...VALID_NODE_TYPES].slice().sort()).toEqual([...expected].slice().sort());
  });
});

// ---------------------------------------------------------------------------
// validateFlowData
// ---------------------------------------------------------------------------
describe('validateFlowData', () => {
  const validFlow = {
    nodes: [
      { id: 'n1', type: 'agent', data: { agentId: 'a', instructions: 'do' } },
      { id: 'n2', type: 'catbrain', data: { catbrainId: 'cb', ragQuery: 'q' } },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
  };

  it('accepts a valid flow with valid node types and well-formed edges', () => {
    const result = validateFlowData(validFlow);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects flow_data with invalid node type (pipeline)', () => {
    const bad = {
      nodes: [{ id: 'n1', type: 'pipeline', data: {} }],
      edges: [],
    };
    const result = validateFlowData(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('pipeline'))).toBe(true);
  });

  it('rejects node missing id', () => {
    const bad = {
      nodes: [{ type: 'agent', data: {} }],
      edges: [],
    };
    const result = validateFlowData(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('id'))).toBe(true);
  });

  it('rejects edge missing source or target', () => {
    const bad = {
      nodes: [{ id: 'n1', type: 'agent', data: {} }],
      edges: [{ id: 'e1', source: 'n1' }],
    };
    const result = validateFlowData(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('source') || e.toLowerCase().includes('target'))).toBe(true);
  });

  it('rejects edge that references a non-existent node', () => {
    const bad = {
      nodes: [{ id: 'n1', type: 'agent', data: {} }],
      edges: [{ id: 'e1', source: 'n1', target: 'ghost' }],
    };
    const result = validateFlowData(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('ghost'))).toBe(true);
  });

  it('rejects flow_data without nodes array', () => {
    const bad = { edges: [] };
    const result = validateFlowData(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('nodes'))).toBe(true);
  });

  it('rejects flow_data without edges array', () => {
    const bad = { nodes: [] };
    const result = validateFlowData(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('edges'))).toBe(true);
  });

  it('rejects non-object flow_data', () => {
    expect(validateFlowData(null).valid).toBe(false);
    expect(validateFlowData('a string').valid).toBe(false);
    expect(validateFlowData(42).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// scanCanvasResources (Phase 134 Plan 03 — enriched shape)
// ---------------------------------------------------------------------------
//
// Shape DB: the mock receives SQL substring → rows. Each scanCanvasResources
// query fragment is matched uniquely so we can inject per-table behaviour.
type AnyRow = Record<string, unknown>;
function mkDb(responses: Record<string, AnyRow[] | ((params: unknown[]) => AnyRow[])>): {
  prepare: (sql: string) => { all: (...params: unknown[]) => AnyRow[] };
  prepareCalls: string[];
} {
  const prepareCalls: string[] = [];
  return {
    prepareCalls,
    prepare: (sql: string) => {
      prepareCalls.push(sql);
      return {
        all: (...params: unknown[]): AnyRow[] => {
          for (const [key, rows] of Object.entries(responses)) {
            if (sql.includes(key)) {
              return typeof rows === 'function' ? rows(params) : rows;
            }
          }
          return [];
        },
      };
    },
  };
}

describe('scanCanvasResources (Phase 134 enriched shape)', () => {
  it('returns the 4 top-level keys catPaws/connectors/canvas_similar/templates', () => {
    const db = mkDb({});
    const result = scanCanvasResources(db);
    expect(result).toHaveProperty('catPaws');
    expect(result).toHaveProperty('connectors');
    expect(result).toHaveProperty('canvas_similar');
    expect(result).toHaveProperty('templates');
    expect(Array.isArray(result.catPaws)).toBe(true);
    expect(Array.isArray(result.connectors)).toBe(true);
    expect(Array.isArray(result.canvas_similar)).toBe(true);
    expect(Array.isArray(result.templates)).toBe(true);
  });

  it('uses LIMIT 50 for cat_paws + connectors queries', () => {
    const db = mkDb({});
    scanCanvasResources(db);
    const limited = db.prepareCalls.filter(
      (sql) => sql.includes('FROM cat_paws') || sql.includes('FROM connectors WHERE is_active'),
    );
    expect(limited.length).toBeGreaterThanOrEqual(2);
    for (const sql of limited) {
      expect(sql).toContain('LIMIT 50');
    }
  });

  it('returns empty catPaws when the cat_paws query throws (per-table try/catch)', () => {
    const db = {
      prepare: (sql: string) => {
        if (sql.includes('FROM cat_paws')) throw new Error('boom');
        return { all: () => [] };
      },
    };
    const result = scanCanvasResources(db);
    expect(result.catPaws).toEqual([]);
    // Other keys still populate as empty arrays, not missing.
    expect(result.connectors).toEqual([]);
    expect(result.canvas_similar).toEqual([]);
    expect(result.templates).toEqual([]);
  });

  it('Task1.1: each catPaw has {paw_id, paw_name, paw_mode, tools_available, skills, best_for}', () => {
    const db = mkDb({
      'FROM cat_paws': [
        { id: 'p1', name: 'Holded Fetcher', mode: 'procesador', description: 'Busca facturas Holded' },
      ],
      'FROM cat_paw_connectors': [{ id: 'c-gmail', type: 'gmail' }],
      'FROM cat_paw_skills': [{ id: 's1', name: 'HTML Reports', description: 'HTML tables' }],
    });
    const result = scanCanvasResources(db);
    expect(result.catPaws).toHaveLength(1);
    const paw = result.catPaws[0];
    expect(paw.paw_id).toBe('p1');
    expect(paw.paw_name).toBe('Holded Fetcher');
    expect(paw.paw_mode).toBe('procesador');
    expect(Array.isArray(paw.tools_available)).toBe(true);
    expect(Array.isArray(paw.skills)).toBe(true);
    expect(typeof paw.best_for).toBe('string');
  });

  it('Task1.2: tools_available includes gmail action names from getConnectorContracts', () => {
    const db = mkDb({
      'FROM cat_paws': [{ id: 'p1', name: 'Gmailer', mode: 'procesador', description: 'Email' }],
      'FROM cat_paw_connectors': [{ id: 'c-gmail', type: 'gmail' }],
      'FROM cat_paw_skills': [],
    });
    const result = scanCanvasResources(db);
    const paw = result.catPaws[0];
    expect(paw.tools_available).toEqual(
      expect.arrayContaining(['send_report', 'send_reply', 'mark_read', 'forward']),
    );
  });

  it('Task1.3: skills is an array of {id, name, description}', () => {
    const db = mkDb({
      'FROM cat_paws': [{ id: 'p1', name: 'X', mode: 'procesador', description: 'd' }],
      'FROM cat_paw_connectors': [],
      'FROM cat_paw_skills': [
        { id: 's1', name: 'Skill A', description: 'Does A' },
        { id: 's2', name: 'Skill B', description: 'Does B' },
      ],
    });
    const result = scanCanvasResources(db);
    expect(result.catPaws[0].skills).toEqual([
      { id: 's1', name: 'Skill A', description: 'Does A' },
      { id: 's2', name: 'Skill B', description: 'Does B' },
    ]);
  });

  it('Task1.4: best_for derives from description + mode; falls back to "uso general" without description', () => {
    const db = mkDb({
      'FROM cat_paws': [
        { id: 'p1', name: 'A', mode: 'procesador', description: 'Redacta emails' },
        { id: 'p2', name: 'B', mode: 'creador', description: null },
      ],
      'FROM cat_paw_connectors': [],
      'FROM cat_paw_skills': [],
    });
    const result = scanCanvasResources(db);
    expect(result.catPaws[0].best_for).toContain('Redacta emails');
    expect(result.catPaws[0].best_for).toContain('procesador');
    expect(result.catPaws[1].best_for).toContain('uso general');
    expect(result.catPaws[1].best_for).toContain('creador');
  });

  it('Task1.5: each connector has {connector_id, connector_name, connector_type, contracts}', () => {
    const db = mkDb({
      'FROM connectors WHERE is_active': [
        { id: 'cn1', name: 'Work Gmail', type: 'gmail' },
        { id: 'cn2', name: 'Shared Drive', type: 'google_drive' },
      ],
    });
    const result = scanCanvasResources(db);
    expect(result.connectors).toHaveLength(2);
    const gmailConn = result.connectors.find((c) => c.connector_type === 'gmail')!;
    expect(gmailConn.connector_id).toBe('cn1');
    expect(gmailConn.connector_name).toBe('Work Gmail');
    expect(Object.keys(gmailConn.contracts)).toEqual(
      expect.arrayContaining(['send_report', 'send_reply', 'mark_read', 'forward']),
    );
    // Each action in contracts drops source_line_ref (token savings).
    const sendReport = gmailConn.contracts.send_report;
    expect(sendReport).toHaveProperty('required_fields');
    expect(sendReport).toHaveProperty('optional_fields');
    expect(sendReport).toHaveProperty('description');
    expect(sendReport).not.toHaveProperty('source_line_ref');
  });

  it('Task1.6: unknown connector type yields contracts:{} (no crash)', () => {
    const db = mkDb({
      'FROM connectors WHERE is_active': [{ id: 'cnX', name: 'Weird', type: 'foobar' }],
    });
    const result = scanCanvasResources(db);
    expect(result.connectors).toHaveLength(1);
    expect(result.connectors[0].contracts).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// scanCanvasResources — canvas_similar + templates (Task 2, ARCH-DATA-04/05)
// ---------------------------------------------------------------------------
describe('scanCanvasResources canvas_similar + templates (Task 2)', () => {
  const canvasRowsFive = [
    { id: 'cv1', name: 'Inbound Holded Q1 facturación', description: 'Pipeline facturación Q1', flow_data: JSON.stringify({ nodes: [{ type: 'start' }, { type: 'agent' }, { type: 'connector' }] }), last_run_at: '2026-04-10T00:00:00Z' },
    { id: 'cv2', name: 'Drive sync diario', description: 'Sync de drive', flow_data: JSON.stringify({ nodes: [{ type: 'start' }] }), last_run_at: null },
    { id: 'cv3', name: 'Holded reporte Q1', description: 'Reporte Holded de facturación', flow_data: JSON.stringify({ nodes: [{ type: 'start' }, { type: 'agent' }] }), last_run_at: '2026-04-09T00:00:00Z' },
    { id: 'cv4', name: 'Alertas email', description: 'Alertas por email', flow_data: JSON.stringify({ nodes: [{ type: 'start' }] }), last_run_at: null },
    { id: 'cv5', name: 'Holded pago proveedores', description: 'Pagos', flow_data: JSON.stringify({ nodes: [{ type: 'start' }] }), last_run_at: null },
  ];

  it('Task2.1: canvas_similar has length <= 3', () => {
    const db = mkDb({ 'FROM canvases': canvasRowsFive });
    const result = scanCanvasResources(db, { goal: 'facturación Q1 Holded' });
    expect(result.canvas_similar.length).toBeLessThanOrEqual(3);
    expect(result.canvas_similar.length).toBeGreaterThan(0);
  });

  it('Task2.2: canvas_similar ordered by number of keyword matches (desc)', () => {
    const db = mkDb({ 'FROM canvases': canvasRowsFive });
    const result = scanCanvasResources(db, { goal: 'facturación Q1 Holded' });
    // cv1 matches facturación + q1 + holded = 3 ; cv3 = 3 ; cv5 = 1 (holded)
    // The first two must be cv1 and cv3 (in some order), both with 3 matches.
    const topIds = new Set([result.canvas_similar[0].canvas_id, result.canvas_similar[1].canvas_id]);
    expect(topIds.has('cv1')).toBe(true);
    expect(topIds.has('cv3')).toBe(true);
  });

  it('Task2.3: no goal => canvas_similar is empty', () => {
    const db = mkDb({ 'FROM canvases': canvasRowsFive });
    const result = scanCanvasResources(db);
    expect(result.canvas_similar).toEqual([]);
  });

  it('Task2.4: canvas_similar item shape {canvas_id, canvas_name, node_roles, was_executed, note}', () => {
    const db = mkDb({ 'FROM canvases': canvasRowsFive });
    const result = scanCanvasResources(db, { goal: 'facturación Q1 Holded' });
    const item = result.canvas_similar[0];
    expect(item).toHaveProperty('canvas_id');
    expect(item).toHaveProperty('canvas_name');
    expect(Array.isArray(item.node_roles)).toBe(true);
    expect(typeof item.was_executed).toBe('boolean');
    expect(typeof item.note).toBe('string');
    // node_roles derived from JSON.parse(flow_data).nodes[].type
    if (item.canvas_id === 'cv1') {
      expect(item.node_roles).toEqual(expect.arrayContaining(['start', 'agent', 'connector']));
    }
  });

  it('Task2.5: was_executed = (last_run_at != null)', () => {
    const db = mkDb({ 'FROM canvases': canvasRowsFive });
    const result = scanCanvasResources(db, { goal: 'facturación Q1 Holded' });
    const cv1 = result.canvas_similar.find((c) => c.canvas_id === 'cv1');
    const cv3 = result.canvas_similar.find((c) => c.canvas_id === 'cv3');
    expect(cv1?.was_executed).toBe(true);
    expect(cv3?.was_executed).toBe(true);
  });

  it('Task2.6: templates populated with {template_id, name, mode, node_types}', () => {
    const db = mkDb({
      'FROM canvas_templates': [
        {
          id: 't1',
          name: 'Inbound Email',
          mode: 'inbound',
          nodes: JSON.stringify([
            { type: 'start' },
            { type: 'agent' },
            { type: 'agent' },
            { type: 'connector' },
          ]),
        },
      ],
    });
    const result = scanCanvasResources(db);
    expect(result.templates).toHaveLength(1);
    const t = result.templates[0];
    expect(t.template_id).toBe('t1');
    expect(t.name).toBe('Inbound Email');
    expect(t.mode).toBe('inbound');
    // node_types is deduped
    expect(t.node_types.sort()).toEqual(['agent', 'connector', 'start']);
  });

  it('Task2.7: canvases query filters WHERE is_template = 0', () => {
    const db = mkDb({ 'FROM canvases': [] });
    scanCanvasResources(db, { goal: 'foo bar baz' });
    const canvasesCall = db.prepareCalls.find((c) => c.includes('FROM canvases'));
    expect(canvasesCall).toBeDefined();
    expect(canvasesCall).toContain('is_template = 0');
  });

  it('Task2.8: keyword extraction strips stopwords and tokens <3 chars', () => {
    // Goal: "de la facturación y el Q1 en Holded" — stopwords {de,la,y,el,en}
    // should be filtered; tokens under 3 ("q1" has 2 chars -> filtered too,
    // but the plan says q1/q2 are useful — however the 3-char threshold
    // rules them out. So only "facturación" and "holded" survive).
    const db = mkDb({
      'FROM canvases': [
        { id: 'cvA', name: 'Holded importer', description: '', flow_data: '{}', last_run_at: null },
        { id: 'cvB', name: 'aaa bbb', description: 'de la y el en', flow_data: '{}', last_run_at: null }, // no real match after stopword strip
      ],
    });
    const result = scanCanvasResources(db, { goal: 'de la facturación y el Q1 en Holded' });
    // cvA should be in results (matches "holded"), cvB should NOT (only stopwords in its text).
    const ids = result.canvas_similar.map((c) => c.canvas_id);
    expect(ids).toContain('cvA');
    expect(ids).not.toContain('cvB');
  });
});

// ---------------------------------------------------------------------------
// Phase 132 — isSideEffectNode (QA2-06)
// ---------------------------------------------------------------------------
describe('isSideEffectNode (QA2-06)', () => {
  it('storage nodes are always side effects', () => {
    expect(isSideEffectNode({ id: 'n1', type: 'storage', data: {} })).toBe(true);
  });

  it('multiagent nodes are always side effects', () => {
    expect(isSideEffectNode({ id: 'n1', type: 'multiagent', data: {} })).toBe(true);
  });

  it('start/checkpoint/condition/iterator/iterator_end/merge/output/catbrain/scheduler are never side effects', () => {
    for (const t of ['start', 'checkpoint', 'condition', 'iterator', 'iterator_end', 'merge', 'output', 'catbrain', 'scheduler']) {
      expect(isSideEffectNode({ id: 'n', type: t, data: {} })).toBe(false);
    }
  });

  it('agent node without extras is not side effect', () => {
    expect(isSideEffectNode({ id: 'n', type: 'agent', data: { agentId: 'a', instructions: 'x' } })).toBe(false);
  });

  it('agent node with extraConnectors is side effect', () => {
    expect(isSideEffectNode({
      id: 'n', type: 'agent',
      data: { agentId: 'a', extraConnectors: ['c1'] },
    })).toBe(true);
  });

  it('agent node with skill.has_side_effects=true is side effect', () => {
    expect(isSideEffectNode({
      id: 'n', type: 'agent',
      data: { agentId: 'a', skills: [{ has_side_effects: true }] },
    })).toBe(true);
  });

  it("connector with data.mode='send_email' is side effect", () => {
    expect(isSideEffectNode({ id: 'n', type: 'connector', data: { mode: 'send_email' } })).toBe(true);
  });

  it("connector with data.mode='read_inbox' is NOT side effect", () => {
    expect(isSideEffectNode({ id: 'n', type: 'connector', data: { mode: 'read_inbox' } })).toBe(false);
  });

  it("connector with data.drive_operation='upload' is side effect", () => {
    expect(isSideEffectNode({ id: 'n', type: 'connector', data: { drive_operation: 'upload' } })).toBe(true);
  });

  it("connector with data.drive_operation='list' is NOT side effect", () => {
    expect(isSideEffectNode({ id: 'n', type: 'connector', data: { drive_operation: 'list' } })).toBe(false);
  });

  it("connector with data.drive_operation='download' is NOT side effect", () => {
    expect(isSideEffectNode({ id: 'n', type: 'connector', data: { drive_operation: 'download' } })).toBe(false);
  });

  it("connector with MCP tool_name='create_invoice' is side effect", () => {
    expect(isSideEffectNode({ id: 'n', type: 'connector', data: { tool_name: 'create_invoice' } })).toBe(true);
  });

  it("connector with MCP tool_name='search_people' is NOT side effect", () => {
    // search doesn't match the verb regex
    expect(isSideEffectNode({ id: 'n', type: 'connector', data: { tool_name: 'search_people' } })).toBe(false);
  });

  it("connector ctx.connectorType='gmail' is always side effect", () => {
    expect(isSideEffectNode({ id: 'n', type: 'connector', data: {} }, { connectorType: 'gmail' })).toBe(true);
  });

  it("connector ctx.connectorType='http_api' with body_template method=GET is NOT side effect", () => {
    expect(isSideEffectNode(
      { id: 'n', type: 'connector', data: { body_template: '{"method":"GET","url":"..."}' } },
      { connectorType: 'http_api' },
    )).toBe(false);
  });

  it("connector ctx.connectorType='http_api' default method POST is side effect", () => {
    expect(isSideEffectNode(
      { id: 'n', type: 'connector', data: { body_template: '{"method":"POST"}' } },
      { connectorType: 'http_api' },
    )).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 132 — insertSideEffectGuards (QA2-06)
// ---------------------------------------------------------------------------
describe('insertSideEffectGuards (QA2-06)', () => {
  it('Scenario 1: single side-effect node inserts guard+reporter', () => {
    const fd = {
      nodes: [
        { id: 's', type: 'agent', data: { agentId: 'start' }, position: { x: 0, y: 0 } },
        { id: 'a', type: 'agent', data: { agentId: 'redactor' }, position: { x: 100, y: 0 } },
        { id: 'g', type: 'connector', data: { mode: 'send_email' }, position: { x: 300, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'a' },
        { id: 'e2', source: 'a', target: 'g' },
      ],
    };
    const out = insertSideEffectGuards(fd);
    expect(out.nodes.length).toBe(5);
    const guard = out.nodes.find(n => n.id === 'guard-g');
    const reporter = out.nodes.find(n => n.id === 'reporter-g');
    expect(guard).toBeDefined();
    expect(reporter).toBeDefined();
    expect(guard!.type).toBe('condition');
    expect(reporter!.type).toBe('agent');
    // Rewiring: s→a preserved, a→guard-g, guard.yes→g, guard.no→reporter-g
    expect(out.edges.some(e => e.source === 's' && e.target === 'a')).toBe(true);
    expect(out.edges.some(e => e.source === 'a' && e.target === 'guard-g')).toBe(true);
    expect(out.edges.some(e => e.source === 'guard-g' && e.target === 'g' && e.sourceHandle === 'yes')).toBe(true);
    expect(out.edges.some(e => e.source === 'guard-g' && e.target === 'reporter-g' && e.sourceHandle === 'no')).toBe(true);
    // Original a→g edge should NOT exist unchanged
    expect(out.edges.some(e => e.source === 'a' && e.target === 'g')).toBe(false);
  });

  it('Scenario 2: two sequential side effects get two guards', () => {
    const fd = {
      nodes: [
        { id: 's', type: 'agent', data: { agentId: 'a' }, position: { x: 0, y: 0 } },
        { id: 'ag', type: 'agent', data: { agentId: 'b' }, position: { x: 100, y: 0 } },
        { id: 'g1', type: 'connector', data: { mode: 'send_email' }, position: { x: 300, y: 0 } },
        { id: 'st', type: 'storage', data: {}, position: { x: 500, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'ag' },
        { id: 'e2', source: 'ag', target: 'g1' },
        { id: 'e3', source: 'g1', target: 'st' },
      ],
    };
    const out = insertSideEffectGuards(fd);
    expect(out.nodes.length).toBe(8);
    expect(out.nodes.some(n => n.id === 'guard-g1')).toBe(true);
    expect(out.nodes.some(n => n.id === 'reporter-g1')).toBe(true);
    expect(out.nodes.some(n => n.id === 'guard-st')).toBe(true);
    expect(out.nodes.some(n => n.id === 'reporter-st')).toBe(true);
  });

  it('Scenario 3: merge upstream to side-effect: single guard', () => {
    const fd = {
      nodes: [
        { id: 's', type: 'agent', data: { agentId: 'x' }, position: { x: 0, y: 0 } },
        { id: 'a', type: 'agent', data: { agentId: 'a' }, position: { x: 100, y: 0 } },
        { id: 'b', type: 'agent', data: { agentId: 'b' }, position: { x: 100, y: 100 } },
        { id: 'm', type: 'merge', data: {}, position: { x: 200, y: 50 } },
        { id: 'st', type: 'storage', data: {}, position: { x: 400, y: 50 } },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'a' },
        { id: 'e2', source: 's', target: 'b' },
        { id: 'e3', source: 'a', target: 'm' },
        { id: 'e4', source: 'b', target: 'm' },
        { id: 'e5', source: 'm', target: 'st' },
      ],
    };
    const out = insertSideEffectGuards(fd);
    // Only 2 extra nodes: one guard + one reporter for st
    expect(out.nodes.length).toBe(7);
    const guards = out.nodes.filter(n => (n.id as string).startsWith('guard-'));
    const reporters = out.nodes.filter(n => (n.id as string).startsWith('reporter-'));
    expect(guards.length).toBe(1);
    expect(reporters.length).toBe(1);
    expect(out.edges.some(e => e.source === 'm' && e.target === 'guard-st')).toBe(true);
    expect(out.edges.some(e => e.source === 'guard-st' && e.target === 'st' && e.sourceHandle === 'yes')).toBe(true);
    expect(out.edges.some(e => e.source === 'guard-st' && e.target === 'reporter-st' && e.sourceHandle === 'no')).toBe(true);
  });

  it('Scenario 4: side-effect inside iterator body gets NO guard', () => {
    const fd = {
      nodes: [
        { id: 's', type: 'agent', data: { agentId: 'list' }, position: { x: 0, y: 0 } },
        { id: 'it', type: 'iterator', data: { iteratorEndId: 'ite' }, position: { x: 100, y: 0 } },
        { id: 'proc', type: 'agent', data: { agentId: 'p' }, position: { x: 200, y: 0 } },
        { id: 'gm', type: 'connector', data: { mode: 'send_email' }, position: { x: 300, y: 0 } },
        { id: 'ite', type: 'iterator_end', data: {}, position: { x: 400, y: 0 } },
        { id: 'out', type: 'output', data: {}, position: { x: 500, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'it' },
        { id: 'e2', source: 'it', target: 'proc', sourceHandle: 'element' },
        { id: 'e3', source: 'proc', target: 'gm' },
        { id: 'e4', source: 'gm', target: 'ite' },
        { id: 'e5', source: 'it', target: 'out', sourceHandle: 'done' },
      ],
    };
    const out = insertSideEffectGuards(fd);
    expect(out.nodes.some(n => (n.id as string).startsWith('guard-'))).toBe(false);
    expect(out.nodes.some(n => (n.id as string).startsWith('reporter-'))).toBe(false);
    expect(out.nodes.length).toBe(fd.nodes.length);
  });

  it('Scenario 5: read-only connector gets no guard', () => {
    const fd = {
      nodes: [
        { id: 's', type: 'agent', data: { agentId: 'a' }, position: { x: 0, y: 0 } },
        { id: 'c', type: 'connector', data: { drive_operation: 'list' }, position: { x: 100, y: 0 } },
        { id: 'o', type: 'output', data: {}, position: { x: 200, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'c' },
        { id: 'e2', source: 'c', target: 'o' },
      ],
    };
    const out = insertSideEffectGuards(fd);
    expect(out.nodes.length).toBe(fd.nodes.length);
    expect(out.nodes.some(n => (n.id as string).startsWith('guard-'))).toBe(false);
  });

  it('Scenario 6: HTTP GET gets no guard', () => {
    const fd = {
      nodes: [
        { id: 's', type: 'agent', data: { agentId: 'a' }, position: { x: 0, y: 0 } },
        { id: 'c', type: 'connector', data: { body_template: '{"method":"GET"}' }, position: { x: 100, y: 0 } },
        { id: 'o', type: 'output', data: {}, position: { x: 200, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'c' },
        { id: 'e2', source: 'c', target: 'o' },
      ],
    };
    // ctxResolver stubs connectorType so http_api rule kicks in; method=GET => not side effect
    const out = insertSideEffectGuards(fd, (n) => n.id === 'c' ? { connectorType: 'http_api' } : {});
    expect(out.nodes.length).toBe(fd.nodes.length);
    expect(out.nodes.some(n => (n.id as string).startsWith('guard-'))).toBe(false);
  });

  it('reporter has correct shape (tools include _internal_attempt_node_repair)', () => {
    const fd = {
      nodes: [
        { id: 's', type: 'agent', data: { agentId: 'a' }, position: { x: 0, y: 0 } },
        { id: 'g', type: 'connector', data: { mode: 'send_email' }, position: { x: 100, y: 0 } },
      ],
      edges: [{ id: 'e1', source: 's', target: 'g' }],
    };
    const out = insertSideEffectGuards(fd);
    const reporter = out.nodes.find(n => n.id === 'reporter-g') as Record<string, unknown>;
    expect(reporter.type).toBe('agent');
    const rdata = reporter.data as Record<string, unknown>;
    expect(rdata.agentId).toBeNull();
    expect(rdata.auto_inserted).toBe(true);
    expect(rdata.target_node_id).toBe('g');
    const tools = rdata.tools as string[];
    expect(tools).toContain('_internal_attempt_node_repair');
    expect(tools).toContain('log_knowledge_gap');
  });

  it('guard has data-contract-aware condition when instructions declare INPUT', () => {
    const fd = {
      nodes: [
        { id: 's', type: 'agent', data: { agentId: 'a' }, position: { x: 0, y: 0 } },
        {
          id: 'g', type: 'connector',
          data: {
            mode: 'send_email',
            instructions: 'INPUT: {comparison_summary, invoices, period_labels}\nOUTPUT: {sent: boolean}',
          },
          position: { x: 100, y: 0 },
        },
      ],
      edges: [{ id: 'e1', source: 's', target: 'g' }],
    };
    const out = insertSideEffectGuards(fd);
    const guard = out.nodes.find(n => n.id === 'guard-g') as Record<string, unknown>;
    const condition = (guard.data as Record<string, unknown>).condition as string;
    expect(condition).toContain('comparison_summary');
    expect(condition).toContain('invoices');
    expect(condition).toContain('period_labels');
  });
});
