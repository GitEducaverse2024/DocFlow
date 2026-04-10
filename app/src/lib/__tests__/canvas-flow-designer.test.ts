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
  it('contains the 9 known canvas-executor node types', () => {
    const expected = [
      'agent',
      'catpaw',
      'catbrain',
      'condition',
      'iterator',
      'multiagent',
      'scheduler',
      'checkpoint',
      'connector',
    ];
    for (const t of expected) {
      expect(VALID_NODE_TYPES).toContain(t);
    }
    expect(VALID_NODE_TYPES.length).toBe(9);
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
// scanCanvasResources
// ---------------------------------------------------------------------------
describe('scanCanvasResources', () => {
  it('returns structure {catPaws, catBrains, skills, connectors} with data from mocked db', () => {
    const allMock = vi.fn(() => [{ id: '1', name: 'paw' }]);
    const prepareMock = vi.fn(() => ({ all: allMock }));
    const db = { prepare: prepareMock };

    const result = scanCanvasResources(db);

    expect(result).toHaveProperty('catPaws');
    expect(result).toHaveProperty('catBrains');
    expect(result).toHaveProperty('skills');
    expect(result).toHaveProperty('connectors');
    expect(Array.isArray(result.catPaws)).toBe(true);
    expect(result.catPaws).toEqual([{ id: '1', name: 'paw' }]);
  });

  it('uses LIMIT 50 in all SQL queries', () => {
    const allMock = vi.fn(() => []);
    const prepareMock = vi.fn(() => ({ all: allMock }));
    const db = { prepare: prepareMock };

    scanCanvasResources(db);

    // Every call should contain LIMIT 50
    for (const call of prepareMock.mock.calls) {
      expect(call[0]).toContain('LIMIT 50');
    }
    expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('LIMIT 50'));
  });

  it('returns empty array per-table when db.prepare throws for that table (no crash)', () => {
    let callCount = 0;
    const prepareMock = vi.fn(() => {
      callCount += 1;
      if (callCount === 2) {
        throw new Error('table catbrains does not exist');
      }
      return { all: vi.fn(() => [{ id: '1' }]) };
    });
    const db = { prepare: prepareMock };

    const result = scanCanvasResources(db);

    expect(Array.isArray(result.catBrains)).toBe(true);
    expect(result.catBrains).toEqual([]);
    // Other tables still work
    expect(result.catPaws).toEqual([{ id: '1' }]);
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
