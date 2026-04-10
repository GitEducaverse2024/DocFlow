/**
 * Canvas Flow Designer — Phase 130 async pipeline helpers.
 *
 * Two responsibilities, both extracted from IntentJobExecutor so they can be
 * unit-tested in isolation and reused by future admin tooling:
 *
 * 1. validateFlowData: Enforces the invariant that the LLM architect phase
 *    returns only node types that canvas-executor.ts actually handles. This
 *    is the defense against Pitfall 8 from 130-RESEARCH (LLM inventing
 *    node types like 'pipeline', 'task', 'step' that would crash the
 *    executor switch with an unhandled case).
 *
 * 2. scanCanvasResources: Queries the four canvas-relevant tables from
 *    docflow.db (cat_paws, catbrains, skills, connectors) with consistent
 *    LIMIT 50 caps and per-table try/catch so a missing/unavailable table
 *    yields an empty array instead of crashing the whole scan. Used by the
 *    architect phase to prime the LLM with available resources.
 */

export const VALID_NODE_TYPES = [
  'agent',
  'catpaw',
  'catbrain',
  'condition',
  'iterator',
  'multiagent',
  'scheduler',
  'checkpoint',
  'connector',
] as const;

export type CanvasNodeType = (typeof VALID_NODE_TYPES)[number];

export interface FlowDataValidation {
  valid: boolean;
  errors: string[];
}

export function validateFlowData(fd: unknown): FlowDataValidation {
  const errors: string[] = [];

  if (!fd || typeof fd !== 'object') {
    return { valid: false, errors: ['flow_data is not an object'] };
  }

  const obj = fd as { nodes?: unknown; edges?: unknown };

  if (!Array.isArray(obj.nodes)) errors.push('flow_data.nodes is not an array');
  if (!Array.isArray(obj.edges)) errors.push('flow_data.edges is not an array');
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const nodes = obj.nodes as Array<Record<string, unknown>>;
  const edges = obj.edges as Array<Record<string, unknown>>;

  const nodeIds = new Set<string>();
  for (const n of nodes) {
    if (typeof n.id !== 'string' || n.id.length === 0) {
      errors.push('node missing id');
      continue;
    }
    if (!VALID_NODE_TYPES.includes(n.type as CanvasNodeType)) {
      errors.push(`node ${n.id} has invalid type ${String(n.type)}`);
    }
    nodeIds.add(n.id);
  }

  for (const e of edges) {
    if (typeof e.source !== 'string' || typeof e.target !== 'string') {
      errors.push('edge missing source/target');
      continue;
    }
    if (!nodeIds.has(e.source)) {
      errors.push(`edge source ${e.source} does not reference an existing node`);
    }
    if (!nodeIds.has(e.target)) {
      errors.push(`edge target ${e.target} does not reference an existing node`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// scanCanvasResources
// ---------------------------------------------------------------------------

type DbStatementLike = { all(...params: unknown[]): unknown };
type DbLike = { prepare(sql: string): DbStatementLike };

export interface CanvasResources {
  catPaws: unknown[];
  catBrains: unknown[];
  skills: unknown[];
  connectors: unknown[];
}

export function scanCanvasResources(db: DbLike): CanvasResources {
  const safe = (sql: string): unknown[] => {
    try {
      const rows = db.prepare(sql).all();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };

  return {
    catPaws: safe(
      'SELECT id, name, description, mode, system_prompt FROM cat_paws WHERE is_active = 1 LIMIT 50',
    ),
    catBrains: safe('SELECT id, name, description FROM catbrains LIMIT 50'),
    skills: safe('SELECT id, name, description FROM skills LIMIT 50'),
    connectors: safe('SELECT id, name, type FROM connectors LIMIT 50'),
  };
}
