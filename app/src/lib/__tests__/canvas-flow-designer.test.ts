import { describe, it, expect, vi } from 'vitest';
import {
  validateFlowData,
  scanCanvasResources,
  VALID_NODE_TYPES,
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
