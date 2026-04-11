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
 * 2. scanCanvasResources: Queries the canvas-relevant tables (cat_paws +
 *    join tables, connectors, canvases, canvas_templates) and produces the
 *    **enriched payload** that Phase 134 ARCH-DATA-01/04/05 requires: each
 *    catPaw carries tools_available derived by JOIN of cat_paw_connectors +
 *    getConnectorContracts (no hallucinated field names), skills embedded,
 *    best_for hint. Each connector carries contracts derived from the
 *    declarative contracts module. canvas_similar is top-3 filtered by goal
 *    keywords; templates come from canvas_templates. Per-table try/catch
 *    keeps the scan partially available if a single table misbehaves.
 */

import { getConnectorContracts } from './canvas-connector-contracts';

// All node types the canvas-executor.ts switch actually handles. Must stay
// in sync with canvas-executor.ts — otherwise the architect QA loop can
// produce a canvas that the executor would happily run but validateFlowData
// rejects (e.g. `start`, `merge`, `output`, `storage`, `iterator_end` were
// missing from Phase 130 and surfaced as failures once the Phase 132 QA loop
// started generating richer flows).
export const VALID_NODE_TYPES = [
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
// scanCanvasResources (Phase 134 Plan 03 — enriched)
// ---------------------------------------------------------------------------

type DbStatementLike = { all(...params: unknown[]): unknown };
type DbLike = { prepare(sql: string): DbStatementLike };

export interface CatPawResource {
  paw_id: string;
  paw_name: string;
  paw_mode: string;
  /** Flat list of action names (all connector actions JOINed via cat_paw_connectors). */
  tools_available: string[];
  skills: Array<{ id: string; name: string; description: string }>;
  best_for: string;
}

export interface ConnectorResource {
  connector_id: string;
  connector_name: string;
  connector_type: string;
  /**
   * Per-action contract derived from canvas-connector-contracts.ts. source_line_ref
   * is dropped here to save tokens in the architect prompt — the full ref lives
   * in the contracts module for auditing, not for the LLM.
   */
  contracts: Record<
    string,
    {
      required_fields: readonly string[];
      optional_fields: readonly string[];
      description: string;
    }
  >;
}

export interface CanvasSimilarResource {
  canvas_id: string;
  canvas_name: string;
  node_roles: string[];
  was_executed: boolean;
  note: string;
}

export interface TemplateResource {
  template_id: string;
  name: string;
  mode: string;
  node_types: string[];
}

export interface CanvasResources {
  catPaws: CatPawResource[];
  connectors: ConnectorResource[];
  canvas_similar: CanvasSimilarResource[];
  templates: TemplateResource[];
}

type AnyRow = Record<string, unknown>;

function safePrepareAll(db: DbLike, sql: string, params: unknown[] = []): AnyRow[] {
  try {
    const stmt = db.prepare(sql);
    const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
    return Array.isArray(rows) ? (rows as AnyRow[]) : [];
  } catch {
    return [];
  }
}

const GOAL_STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'para', 'a', 'con', 'vs',
  'un', 'una', 'por', 'que', 'al', 'es', 'se', 'lo', 'su', 'o',
  'the', 'of', 'and', 'to', 'in', 'for', 'on',
]);

function extractKeywords(goal: string): string[] {
  return goal
    .toLowerCase()
    .split(/[\s,.:;!?()"'/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !GOAL_STOPWORDS.has(t));
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n);
}

function buildCatPaws(db: DbLike): CatPawResource[] {
  const pawRows = safePrepareAll(
    db,
    'SELECT id, name, mode, description FROM cat_paws WHERE is_active = 1 LIMIT 50',
  );

  const out: CatPawResource[] = [];
  for (const row of pawRows) {
    const pawId = (row.id as string) ?? '';
    if (!pawId) continue;

    const connectorRows = safePrepareAll(
      db,
      'SELECT cn.id, cn.type FROM cat_paw_connectors cpc LEFT JOIN connectors cn ON cn.id = cpc.connector_id WHERE cpc.paw_id = ? AND cpc.is_active = 1',
      [pawId],
    );
    const toolsSet = new Set<string>();
    for (const cr of connectorRows) {
      const ctype = cr.type as string | undefined;
      if (!ctype) continue;
      const contract = getConnectorContracts(ctype);
      if (contract) {
        for (const actionName of Object.keys(contract.contracts)) {
          toolsSet.add(actionName);
        }
      }
    }

    const skillRows = safePrepareAll(
      db,
      'SELECT s.id, s.name, s.description FROM cat_paw_skills cps JOIN skills s ON s.id = cps.skill_id WHERE cps.paw_id = ?',
      [pawId],
    );

    const description = (row.description as string | null | undefined) ?? '';
    const mode = (row.mode as string | null | undefined) ?? 'procesador';
    const best_for = truncate(
      `${description || 'uso general'} (${mode})`,
      200,
    );

    out.push({
      paw_id: pawId,
      paw_name: (row.name as string) ?? '',
      paw_mode: mode,
      tools_available: [...toolsSet],
      skills: skillRows.map((s) => ({
        id: (s.id as string) ?? '',
        name: (s.name as string) ?? '',
        description: (s.description as string) ?? '',
      })),
      best_for,
    });
  }
  return out;
}

function buildConnectors(db: DbLike): ConnectorResource[] {
  const rows = safePrepareAll(
    db,
    'SELECT id, name, type FROM connectors WHERE is_active = 1 LIMIT 50',
  );
  return rows.map((row) => {
    const ctype = (row.type as string) ?? '';
    const contract = getConnectorContracts(ctype);
    const slimContracts: ConnectorResource['contracts'] = {};
    if (contract) {
      for (const [actionName, action] of Object.entries(contract.contracts)) {
        slimContracts[actionName] = {
          required_fields: action.required_fields,
          optional_fields: action.optional_fields,
          description: action.description,
        };
      }
    }
    return {
      connector_id: (row.id as string) ?? '',
      connector_name: (row.name as string) ?? '',
      connector_type: ctype,
      contracts: slimContracts,
    };
  });
}

function buildCanvasSimilar(db: DbLike, goal: string | undefined): CanvasSimilarResource[] {
  if (!goal || goal.trim().length === 0) return [];
  const keywords = extractKeywords(goal);
  if (keywords.length === 0) return [];

  const rows = safePrepareAll(
    db,
    "SELECT id, name, description, flow_data, last_run_at FROM canvases WHERE is_template = 0 AND status != 'archived' ORDER BY updated_at DESC LIMIT 50",
  );

  const scored: Array<{ row: AnyRow; matchCount: number }> = [];
  for (const row of rows) {
    const haystack = `${(row.name as string) ?? ''} ${(row.description as string) ?? ''}`.toLowerCase();
    const matchCount = keywords.filter((k) => haystack.includes(k)).length;
    if (matchCount > 0) scored.push({ row, matchCount });
  }
  scored.sort((a, b) => b.matchCount - a.matchCount);
  const top = scored.slice(0, 3);

  return top.map(({ row }) => {
    let nodeRoles: string[] = [];
    try {
      const fd = JSON.parse((row.flow_data as string) ?? '{}');
      const types = Array.isArray(fd?.nodes)
        ? fd.nodes.map((n: { type?: unknown }) => String(n?.type ?? '')).filter(Boolean)
        : [];
      nodeRoles = [...new Set<string>(types)].slice(0, 20);
    } catch {
      nodeRoles = [];
    }
    const lastRunAt = row.last_run_at as string | null | undefined;
    const desc = (row.description as string) ?? '';
    return {
      canvas_id: (row.id as string) ?? '',
      canvas_name: (row.name as string) ?? '',
      node_roles: nodeRoles,
      was_executed: lastRunAt != null && lastRunAt !== '',
      note: desc.slice(0, 100),
    };
  });
}

function buildTemplates(db: DbLike): TemplateResource[] {
  const rows = safePrepareAll(
    db,
    'SELECT id, name, mode, nodes FROM canvas_templates ORDER BY times_used DESC LIMIT 20',
  );
  return rows.map((row) => {
    let nodeTypes: string[] = [];
    try {
      const parsed = JSON.parse((row.nodes as string) ?? '[]');
      const types = Array.isArray(parsed)
        ? parsed.map((n: { type?: unknown }) => String(n?.type ?? '')).filter(Boolean)
        : [];
      nodeTypes = [...new Set<string>(types)];
    } catch {
      nodeTypes = [];
    }
    return {
      template_id: (row.id as string) ?? '',
      name: (row.name as string) ?? '',
      mode: (row.mode as string) ?? '',
      node_types: nodeTypes,
    };
  });
}

export function scanCanvasResources(
  db: DbLike,
  opts?: { goal?: string },
): CanvasResources {
  let catPaws: CatPawResource[] = [];
  let connectors: ConnectorResource[] = [];
  let canvas_similar: CanvasSimilarResource[] = [];
  let templates: TemplateResource[] = [];

  try {
    catPaws = buildCatPaws(db);
  } catch {
    catPaws = [];
  }
  try {
    connectors = buildConnectors(db);
  } catch {
    connectors = [];
  }
  try {
    canvas_similar = buildCanvasSimilar(db, opts?.goal);
  } catch {
    canvas_similar = [];
  }
  try {
    templates = buildTemplates(db);
  } catch {
    templates = [];
  }

  return { catPaws, connectors, canvas_similar, templates };
}

// ---------------------------------------------------------------------------
// Phase 132 — Side effect classification + automatic guard insertion.
//
// The architect phase produces designs structurally valid but often lacking
// the defensive condition nodes before destructive operations (send email,
// upload file, create invoice, etc.). We inject them as a post-processor so
// the architect can stay focused on the business flow, and we rewrite the
// edges so predecessor → guard → (yes) targetNode | (no) reporter.
//
// See: .planning/phases/132-.../132-RESEARCH.md sections
//   "isSideEffectNode — Diseño Exacto" and "insertSideEffectGuards — Diseño Exacto".
// ---------------------------------------------------------------------------

const SIDE_EFFECT_VERB_RE = /^(send|create|update|delete|upload|invoke|write|execute|publish|post|put|patch|mark|trash|rename|move)/i;
const NON_DESTRUCTIVE_DRIVE_OPS = new Set(['download', 'list', 'read', 'search', 'get']);

export interface SideEffectContext {
  /** Connector type from connectors table if the node is a connector. Optional. */
  connectorType?: string;
}

export function isSideEffectNode(
  node: Record<string, unknown>,
  ctx?: SideEffectContext,
): boolean {
  const type = node.type as string;
  const data = (node.data ?? {}) as Record<string, unknown>;

  // Category 3 + 4: always side effect
  if (type === 'storage') return true;
  if (type === 'multiagent') return true;

  // Category 2: agent with destructive extras
  if (type === 'agent') {
    const extraConnectors = (data.extraConnectors as unknown[]) ?? [];
    if (Array.isArray(extraConnectors) && extraConnectors.length > 0) return true;
    const skills = (data.skills as Array<{ has_side_effects?: boolean } | string>) ?? [];
    if (Array.isArray(skills)) {
      for (const s of skills) {
        if (typeof s === 'object' && s !== null && (s as { has_side_effects?: boolean }).has_side_effects === true) {
          return true;
        }
      }
    }
    return false;
  }

  // Category 1: connector
  if (type === 'connector') {
    const mode = (data.mode as string) ?? '';
    const action = (data.action as string) ?? '';
    if (SIDE_EFFECT_VERB_RE.test(mode) || SIDE_EFFECT_VERB_RE.test(action)) return true;

    // data.mode that is explicitly read-oriented (read_inbox, list_*) returns false via no verb match.
    // We only return true on verb match or other positive signals below.

    const driveOp = data.drive_operation as string | undefined;
    if (driveOp) {
      if (NON_DESTRUCTIVE_DRIVE_OPS.has(driveOp.toLowerCase())) return false;
      return true;
    }

    const toolName = data.tool_name as string | undefined;
    if (toolName && SIDE_EFFECT_VERB_RE.test(toolName)) return true;
    if (toolName && !SIDE_EFFECT_VERB_RE.test(toolName)) {
      // explicit read-shaped MCP tool — caller opted in with a read verb
      return false;
    }

    const ct = ctx?.connectorType;
    if (ct === 'gmail') return true;
    if (ct === 'smtp') return true;
    if (ct === 'n8n_webhook') return true;
    if (ct === 'http_api') {
      const bt = (data.body_template as string) ?? '';
      if (/"method"\s*:\s*"GET"/i.test(bt)) return false;
      return true;
    }
    if (ct === 'mcp_server') {
      return !toolName || SIDE_EFFECT_VERB_RE.test(toolName);
    }

    // Unknown connector with no recognized mode / tool_name / ctx → conservative off
    return false;
  }

  // Everything else: not a side effect (start, checkpoint, condition, iterator,
  // iterator_end, merge, output, catbrain, scheduler)
  return false;
}

interface GuardFlowData {
  nodes: Array<Record<string, unknown>>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
  }>;
}

/**
 * Walk from each iterator.element handle until reaching the paired iterator_end
 * (via iterator.data.iteratorEndId). All nodes visited in between are "inside
 * the loop body" and should NOT get guards inserted — the iterator's own error
 * capture pattern (Phase 24) handles their failures.
 */
function computeIteratorBodyNodes(fd: GuardFlowData): Set<string> {
  const result = new Set<string>();
  const iterators = fd.nodes.filter(n => n.type === 'iterator');
  for (const it of iterators) {
    const endId = (it.data as Record<string, unknown> | undefined)?.iteratorEndId as string | undefined;
    if (!endId) continue;
    const stack = fd.edges
      .filter(e => e.source === it.id && e.sourceHandle === 'element')
      .map(e => e.target);
    while (stack.length > 0) {
      const cur = stack.pop();
      if (!cur || cur === endId || result.has(cur)) continue;
      result.add(cur);
      for (const e of fd.edges.filter(e => e.source === cur)) {
        stack.push(e.target);
      }
    }
  }
  return result;
}

function buildGuardCondition(targetNode: Record<string, unknown>, instructions: string): string {
  const type = targetNode.type as string;
  const inputMatch = instructions.match(/INPUT\s*:\s*\{([^}]+)\}/);
  const fields = inputMatch ? inputMatch[1].split(',').map(f => f.trim()).filter(f => f.length > 0) : [];
  if (fields.length > 0) {
    return `El input incluye TODOS estos campos no vacios: ${fields.join(', ')}. Responde 'yes' solo si ninguno esta vacio, null o undefined.`;
  }
  if (type === 'connector') {
    return 'El input contiene un payload completo y bien formado para el side effect (no vacio, no null, campos coherentes). Responde yes o no.';
  }
  if (type === 'storage') {
    return 'El input tiene contenido no vacio para guardar. Responde yes o no.';
  }
  if (type === 'multiagent') {
    return 'El input tiene un payload valido para el canvas destino. Responde yes o no.';
  }
  return 'El input es valido y no vacio. Responde yes o no.';
}

/**
 * Post-processor: inserts a condition guard + reporter agent BEFORE every
 * side-effect node in the flow. Preserves existing edges by rewiring through
 * the guard. Skips nodes inside iterator loop bodies (iterator owns its own
 * error-capture contract per Phase 24).
 *
 * The reporter agent is a stateless inline-mode agent (agentId=null) whose
 * only job is to invoke `_internal_attempt_node_repair` with the failing
 * node context. That tool is gated by name prefix in getToolsForLLM so it
 * never leaks into normal chat surfaces (see Plan 03 task 3).
 */
export function insertSideEffectGuards(
  fd: GuardFlowData,
  ctxResolver?: (node: Record<string, unknown>) => SideEffectContext,
): GuardFlowData {
  const newNodes: Array<Record<string, unknown>> = [...fd.nodes];
  const newEdges: GuardFlowData['edges'] = [];
  const insideIterator = computeIteratorBodyNodes(fd);

  for (const edge of fd.edges) {
    const targetNode = fd.nodes.find(n => n.id === edge.target);
    if (
      !targetNode
      || insideIterator.has(edge.target)
      || !isSideEffectNode(targetNode, ctxResolver?.(targetNode))
    ) {
      newEdges.push(edge);
      continue;
    }

    const guardId = `guard-${edge.target}`;
    const reporterId = `reporter-${edge.target}`;

    const existingGuard = newNodes.find(n => n.id === guardId);
    if (!existingGuard) {
      const targetData = (targetNode.data ?? {}) as Record<string, unknown>;
      const targetInstructions = (targetData.instructions as string) ?? '';
      const guardCondition = buildGuardCondition(targetNode, targetInstructions);
      const targetPos = (targetNode.position as { x: number; y: number }) ?? { x: 0, y: 0 };

      newNodes.push({
        id: guardId,
        type: 'condition',
        position: { x: targetPos.x - 250, y: targetPos.y },
        data: {
          condition: guardCondition,
          model: 'gemini-main',
          auto_inserted: true,
          target_node_id: edge.target,
        },
      });

      newNodes.push({
        id: reporterId,
        type: 'agent',
        position: { x: targetPos.x - 250, y: targetPos.y + 160 },
        data: {
          agentId: null,
          agentName: `Auto-Reparador de ${edge.target}`,
          model: 'gemini-main',
          instructions:
            `Un guard condicional ha fallado justo antes del nodo ${edge.target}, `
            + `que ejecuta side effects. Tu trabajo: llamar a _internal_attempt_node_repair `
            + `con { canvas_id: <el id del canvas actual>, failed_node_id: "${edge.target}", `
            + `guard_report: "<resumen del problema>" }. Si el repair tambien falla, llama `
            + `log_knowledge_gap con knowledge_path="catflow/design/data-contract" y detén el flujo.`,
          tools: ['_internal_attempt_node_repair', 'log_knowledge_gap'],
          auto_inserted: true,
          target_node_id: edge.target,
          canvas_id_placeholder: true,
        },
      });
    }

    // Rewire: predecessor → guard, guard.yes → targetNode, guard.no → reporter
    newEdges.push({
      id: `e-${edge.source}-${guardId}`,
      source: edge.source,
      target: guardId,
      sourceHandle: edge.sourceHandle,
    });
    newEdges.push({
      id: `e-${guardId}-yes-${edge.target}-${newEdges.length}`,
      source: guardId,
      target: edge.target,
      sourceHandle: 'yes',
      targetHandle: edge.targetHandle,
    });
    if (!newEdges.some(e => e.source === guardId && e.sourceHandle === 'no')) {
      newEdges.push({
        id: `e-${guardId}-no-${reporterId}`,
        source: guardId,
        target: reporterId,
        sourceHandle: 'no',
      });
    }
  }

  return { nodes: newNodes, edges: newEdges };
}
