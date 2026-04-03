import db from '@/lib/db';
import { qdrant } from '@/lib/services/qdrant';
import { ollama } from '@/lib/services/ollama';
import { logUsage } from '@/lib/services/usage-tracker';
import { logger } from '@/lib/logger';
import { createNotification } from '@/lib/services/notifications';
import { executeCatBrain } from './execute-catbrain';
import { executeCatPaw } from './execute-catpaw';
import { executeWebSearch } from './execute-websearch';
// executeTaskWithCycles removed — trigger/listen now operates on canvases
import { sendEmail } from '@/lib/services/email-service';
import { markAsRead, replyToMessage } from '@/lib/services/gmail-reader';
import { GmailConfig, GoogleDriveConfig, TemplateStructure } from '@/lib/types';
import { renderTemplate } from '@/lib/services/template-renderer';
import { resolveAssetsForEmail } from '@/lib/services/template-asset-resolver';
import { createDriveClient } from '@/lib/services/google-drive-auth';
import { listFiles as driveListFiles, downloadFile as driveDownloadFile, uploadFile as driveUploadFile, createFolder as driveCreateFolder } from '@/lib/services/google-drive-service';
import { generateId } from '@/lib/utils';
import { parseOutputToEmailPayload } from './catbrain-connector-executor';
import type { CatBrainInput } from '@/lib/types/catbrain';
import type { CatPawInput } from '@/lib/types/catpaw';
import fs from 'fs';
import path from 'path';

// --- Types ---

export interface CanvasNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: Record<string, unknown>;
}

export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting' | 'skipped';

export interface NodeState {
  status: NodeStatus;
  output?: string;
  tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  duration_ms?: number;
  error?: string;
  started_at?: string;
  completed_at?: string;
  feedback?: string;
}

export type NodeStates = Record<string, NodeState>;

// In-memory map of running executions (for cancel support)
const runningExecutors = new Map<string, { cancelled: boolean }>();

// --- Topological Sort (Kahn's algorithm) ---

export function topologicalSort(nodes: CanvasNode[], edges: CanvasEdge[]): string[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  }

  const queue = nodes.filter(n => inDegree.get(n.id) === 0).map(n => n.id);
  const order: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    order.push(nodeId);
    for (const neighbor of (adj.get(nodeId) || [])) {
      const deg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) queue.push(neighbor);
    }
  }

  return order;
}

// --- Helper: Call LLM via LiteLLM ---

async function callLLM(
  model: string,
  systemPrompt: string,
  userContent: string
): Promise<{ output: string; tokens: number; input_tokens: number; output_tokens: number; duration_ms: number }> {
  const litellmUrl = process['env']['LITELLM_URL'] || 'http://litellm:4000';
  const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
  const start = Date.now();

  const res = await fetch(`${litellmUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${litellmKey}`,
    },
    body: JSON.stringify({
      model: model || 'gemini-main',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.7,
      max_tokens: 8000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error LLM (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    output: data.choices?.[0]?.message?.content || '',
    tokens: data.usage?.total_tokens || 0,
    input_tokens: data.usage?.prompt_tokens || 0,
    output_tokens: data.usage?.completion_tokens || 0,
    duration_ms: Date.now() - start,
  };
}

// --- Helper: Get RAG context for a project ---

async function getRagContext(catbrainId: string, query: string, maxChunks: number = 5): Promise<string> {
  try {
    const catbrain = db.prepare('SELECT rag_collection, rag_enabled, name FROM catbrains WHERE id = ?').get(catbrainId) as
      | { rag_collection: string | null; rag_enabled: number; name: string }
      | undefined;

    if (!catbrain || !catbrain.rag_enabled || !catbrain.rag_collection) return '';

    const collectionInfo = await qdrant.getCollectionInfo(catbrain.rag_collection);
    if (!collectionInfo?.result) return '';

    const vectorSize = collectionInfo.result?.config?.params?.vectors?.size || 768;
    const embModel = ollama.guessModelFromVectorSize(vectorSize);
    const queryVector = await ollama.getEmbedding(query, embModel);
    const searchResults = await qdrant.search(catbrain.rag_collection, queryVector, maxChunks);
    const results = searchResults.result || [];

    return results
      .map((r: { payload: { text: string } }) => r.payload.text)
      .join('\n\n');
  } catch (e) {
    logger.error('canvas', `Error buscando RAG en catbrain ${catbrainId}`, { error: (e as Error).message });
    return '';
  }
}

// --- Helper: Strip markdown code block wrappers from LLM output ---
// Gemini and other models often wrap JSON in ```json ... ``` blocks.
// This must be cleaned before passing to the next node.

function cleanLlmOutput(output: string): string {
  if (!output) return output;
  let cleaned = output.trim();
  // Strip ```json ... ``` or ``` ... ```
  const mdMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```\s*$/);
  if (mdMatch) {
    cleaned = mdMatch[1].trim();
  }
  return cleaned;
}

// --- Helper: Merge predecessor fields into LLM output (anti-teléfono-escacharrado) ---
// If an LLM node receives a JSON object and returns a JSON object,
// ensure all fields from the input are preserved in the output.
// This is a code-level safety net for R10 — LLMs sometimes drop fields.

function mergePreserveFields(predecessorOutput: string, nodeOutput: string): string {
  try {
    const input = JSON.parse(predecessorOutput);
    const output = JSON.parse(nodeOutput);
    // Only merge if both are plain objects (not arrays)
    if (typeof input === 'object' && !Array.isArray(input) &&
        typeof output === 'object' && !Array.isArray(output)) {
      // Merge: input fields as base, output fields override
      const merged = { ...input, ...output };
      return JSON.stringify(merged);
    }
  } catch {
    // Not JSON — skip merge
  }
  return nodeOutput;
}

// --- Helper: Get predecessor output for a node ---

function getPredecessorOutput(nodeId: string, edges: CanvasEdge[], nodeStates: NodeStates): string {
  const incomingEdges = edges.filter(e => e.target === nodeId);
  if (incomingEdges.length === 0) return '';
  // Prefer edge from a completed (non-skipped) source with output
  const completedEdge = incomingEdges.find(
    e => nodeStates[e.source]?.status === 'completed' && nodeStates[e.source]?.output
  );
  if (completedEdge) return nodeStates[completedEdge.source]?.output || '';
  // Fallback to first edge with any output
  const anyEdge = incomingEdges.find(e => nodeStates[e.source]?.output);
  if (anyEdge) return nodeStates[anyEdge.source]?.output || '';
  return '';
}

// --- Helper: Get skipped nodes for non-chosen branches of multi-handle nodes ---

/**
 * Get nodes that should be skipped because they are on non-chosen branches
 * of a multi-handle node (condition, scheduler, etc.).
 *
 * SCHED-08: Uses edges.filter() to find ALL rejected branches, not just one.
 * Works for condition (2 handles: yes/no) and scheduler (3 handles: output-true/output-completed/output-false).
 */
function getSkippedNodes(
  branchNodeId: string,
  chosenBranch: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  nodeStates: NodeStates
): string[] {
  // Find ALL edges from this node that were NOT chosen (handles N branches)
  const rejectedEdges = edges.filter(
    e => e.source === branchNodeId && e.sourceHandle !== chosenBranch
  );
  if (rejectedEdges.length === 0) return [];

  // BFS from ALL rejected edge targets, skip nodes that have another incoming non-skipped source
  const skipped: string[] = [];
  const visited = new Set<string>();
  const queue = rejectedEdges.map(e => e.target);

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    // Check if this node has another incoming edge from a non-skipped node (MERGE convergence)
    // Also: an edge from the branch node itself on the CHOSEN handle counts as non-skipped
    const incomingEdges = edges.filter(e => e.target === nodeId);
    const hasNonSkippedParent = incomingEdges.some(
      e => (e.source === branchNodeId && e.sourceHandle === chosenBranch) ||
        (e.source !== branchNodeId &&
          !skipped.includes(e.source) &&
          nodeStates[e.source]?.status !== 'skipped')
    );
    if (hasNonSkippedParent) continue;

    skipped.push(nodeId);

    // Enqueue children
    const outgoing = edges.filter(e => e.source === nodeId);
    for (const out of outgoing) {
      queue.push(out.target);
    }
  }

  return skipped;
}

// --- Helper: Save node states to DB ---

function saveNodeStates(runId: string, currentNodeId: string | null, nodeStates: NodeStates): void {
  db.prepare('UPDATE canvas_runs SET node_states = ?, current_node_id = ? WHERE id = ?').run(
    JSON.stringify(nodeStates),
    currentNodeId,
    runId
  );
}

// --- Helper: Convert time value to milliseconds ---

function convertToMs(value: number, unit: string): number {
  switch (unit) {
    case 'seconds': return value * 1000;
    case 'minutes': return value * 60 * 1000;
    case 'hours':   return value * 60 * 60 * 1000;
    default:        return value * 60 * 1000; // default minutes
  }
}

function resolveFilenameTemplate(
  template: string,
  runId: string,
  canvasId: string
): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // 2026-03-22
  const time = now.toISOString().slice(11, 19).replace(/:/g, '-'); // 14-30-00

  // Get canvas name for {title}
  const canvas = db.prepare('SELECT name FROM canvases WHERE id = ?').get(canvasId) as
    | { name: string }
    | undefined;
  const title = (canvas?.name || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  let resolved = template
    .replace(/\{date\}/g, date)
    .replace(/\{time\}/g, time)
    .replace(/\{run_id\}/g, runId)
    .replace(/\{title\}/g, title);

  // Sanitize: remove path traversal, use path.basename for safety
  resolved = path.basename(resolved);

  return resolved;
}

function sanitizeSubdir(subdir: string): string {
  // Remove path traversal attempts and leading slashes
  return subdir
    .split(/[/\\]/)
    .filter(segment => segment !== '..' && segment !== '.' && segment.length > 0)
    .join('/');
}

// --- Helper: Check if a node is inside an ITERATOR loop body ---

function isNodeInsideIteratorLoop(
  nodeId: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[]
): { iteratorId: string; iteratorEndId: string } | null {
  // Walk backwards from nodeId to find an ITERATOR ancestor
  const visited = new Set<string>();
  const queue = [nodeId];
  visited.add(nodeId);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const incomingEdges = edges.filter(e => e.target === currentId);
    for (const edge of incomingEdges) {
      const sourceId = edge.source;
      if (visited.has(sourceId)) continue;
      visited.add(sourceId);
      const sourceNode = nodes.find(n => n.id === sourceId);
      if (!sourceNode) continue;
      if (sourceNode.type === 'iterator') {
        const iteratorEndId = (sourceNode.data.iteratorEndId as string) || '';
        if (iteratorEndId) {
          return { iteratorId: sourceId, iteratorEndId };
        }
      }
      // Don't cross other control boundaries
      if (['start', 'iterator_end'].includes(sourceNode.type)) continue;
      queue.push(sourceId);
    }
  }
  return null;
}

// --- Helper: Get nodes between two nodes (for ITERATOR loop body) ---

function getNodesBetween(startId: string, endId: string, nodes: CanvasNode[], edges: CanvasEdge[]): string[] {
  // BFS forward from startId, collecting all nodes reachable before reaching endId
  const between: string[] = [];
  const visited = new Set<string>();
  const queue: string[] = [];

  // Start from startId's outgoing edges
  const startOutgoing = edges.filter(e => e.source === startId);
  for (const e of startOutgoing) {
    if (e.target !== endId && !visited.has(e.target)) {
      queue.push(e.target);
      visited.add(e.target);
    }
  }

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    between.push(currentId);

    const outgoing = edges.filter(e => e.source === currentId);
    for (const e of outgoing) {
      if (e.target === endId || visited.has(e.target)) continue;
      visited.add(e.target);
      queue.push(e.target);
    }
  }

  return between;
}

// --- Helper: Launch a canvas execution (for trigger chain) ---

async function launchCanvasExecution(targetCanvasId: string, triggerId: string): Promise<void> {
  const canvas = db.prepare('SELECT id, flow_data FROM canvases WHERE id = ?').get(targetCanvasId) as
    | { id: string; flow_data: string | null }
    | undefined;

  if (!canvas?.flow_data) {
    throw new Error(`Target canvas ${targetCanvasId} not found or has no flow_data`);
  }

  const flowData = JSON.parse(canvas.flow_data) as { nodes: CanvasNode[]; edges: CanvasEdge[] };
  const { nodes, edges } = flowData;

  if (!nodes || nodes.length === 0) {
    throw new Error(`Target canvas ${targetCanvasId} has no nodes`);
  }

  const executionOrder = topologicalSort(nodes, edges || []);
  const nodeStates: Record<string, { status: string }> = {};
  for (const node of nodes) {
    nodeStates[node.id] = { status: 'pending' };
  }

  const newRunId = generateId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO canvas_runs (id, canvas_id, status, node_states, current_node_id, execution_order, total_tokens, total_duration, started_at, created_at, metadata)
    VALUES (?, ?, 'running', ?, NULL, ?, 0, 0, ?, ?, ?)
  `).run(newRunId, targetCanvasId, JSON.stringify(nodeStates), JSON.stringify(executionOrder), now, now, JSON.stringify({ trigger_id: triggerId }));

  await executeCanvas(targetCanvasId, newRunId);
}

// --- Node Dispatcher ---

async function dispatchNode(
  node: CanvasNode,
  edges: CanvasEdge[],
  nodeStates: NodeStates,
  canvasId: string,
  runId: string
): Promise<{ output: string; tokens?: number; input_tokens?: number; output_tokens?: number; duration_ms?: number }> {
  const predecessorOutput = getPredecessorOutput(node.id, edges, nodeStates);
  const data = node.data as Record<string, unknown>;

  switch (node.type) {
    case 'start': {
      // Check if this canvas has external_input (injected by a trigger from another CatFlow)
      const startCanvas = db.prepare('SELECT external_input FROM canvases WHERE id = ?').get(canvasId) as
        | { external_input: string | null }
        | undefined;
      if (startCanvas?.external_input) {
        // Consume and clear external_input
        db.prepare('UPDATE canvases SET external_input = NULL WHERE id = ?').run(canvasId);
        return { output: startCanvas.external_input };
      }
      return { output: (data.initialInput as string) || '' };
    }

    case 'agent': {
      const agentId = (data.agentId as string) || null;

      // Check if agentId points to a CatPaw (EXEC-05)
      if (agentId) {
        const catPaw = db.prepare('SELECT id FROM cat_paws WHERE id = ? AND is_active = 1').get(agentId) as { id: string } | undefined;
        if (catPaw) {
          const pawInput: CatPawInput = {
            query: (data.instructions as string) || predecessorOutput || 'Procesa la informacion.',
            context: predecessorOutput || undefined,
          };
          // Pass canvas-level extra skills/connectors (don't mutate CatPaw base)
          const extraSkillIds = (data.skills as string[]) || [];
          const extraConnectorIds = (data.extraConnectors as string[]) || [];
          const extraCatBrainIds = (data.extraCatBrains as string[]) || [];
          const pawResult = await executeCatPaw(agentId, pawInput, {
            ...(extraSkillIds.length > 0 ? { extraSkillIds } : {}),
            ...(extraConnectorIds.length > 0 ? { extraConnectorIds } : {}),
            ...(extraCatBrainIds.length > 0 ? { extraCatBrainIds } : {}),
          });

          // Log canvas execution usage
          logUsage({
            event_type: 'canvas_execution',
            agent_id: agentId,
            model: pawResult.model_used || undefined,
            input_tokens: pawResult.input_tokens || 0,
            output_tokens: pawResult.output_tokens || 0,
            total_tokens: pawResult.tokens_used || 0,
            duration_ms: pawResult.duration_ms || 0,
            status: 'success',
            metadata: { canvas_id: canvasId, run_id: runId, node_id: node.id, node_type: 'agent', via: 'executeCatPaw' },
          });

          return {
            output: pawResult.answer,
            tokens: pawResult.tokens_used,
            input_tokens: pawResult.input_tokens,
            output_tokens: pawResult.output_tokens,
            duration_ms: pawResult.duration_ms,
          };
        }
      }

      // Fallback: existing agent logic for custom_agents (no CatPaw match)
      const model = (data.model as string) || 'gemini-main';
      const instructions = (data.instructions as string) || 'Procesa la siguiente información.';

      let userContent = predecessorOutput;

      // Prepend RAG context if configured
      if (data.useRag && data.projectId) {
        const ragQuery = (data.ragQuery as string) || predecessorOutput.substring(0, 200);
        const ragContext = await getRagContext(data.projectId as string, ragQuery, (data.maxChunks as number) || 5);
        if (ragContext) {
          userContent = `--- CONOCIMIENTO DEL PROYECTO ---\n${ragContext}\n--- FIN CONOCIMIENTO ---\n\n${userContent}`;
        }
      }

      const systemPrompt = `Eres un agente especializado. ${instructions}\n\nResponde siempre en español.`;
      const result = await callLLM(model, systemPrompt, userContent);

      // Log usage
      logUsage({
        event_type: 'canvas_execution',
        agent_id: agentId,
        model,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        total_tokens: result.tokens,
        duration_ms: result.duration_ms,
        status: 'success',
        metadata: { canvas_id: canvasId, run_id: runId, node_id: node.id, node_type: 'agent' },
      });

      return result;
    }

    case 'catpaw': {
      const pawId = (data.pawId as string) || (data.agentId as string) || null;
      if (!pawId) return { output: predecessorOutput };

      const pawInput: CatPawInput = {
        query: (data.instructions as string) || predecessorOutput || 'Procesa la informacion.',
        context: predecessorOutput || undefined,
        document_content: (data.documentContent as string) || undefined,
      };
      const pawResult = await executeCatPaw(pawId, pawInput);

      logUsage({
        event_type: 'canvas_execution',
        agent_id: pawId,
        model: pawResult.model_used || undefined,
        input_tokens: pawResult.input_tokens || 0,
        output_tokens: pawResult.output_tokens || 0,
        total_tokens: pawResult.tokens_used || 0,
        duration_ms: pawResult.duration_ms || 0,
        status: 'success',
        metadata: { canvas_id: canvasId, run_id: runId, node_id: node.id, node_type: 'catpaw', via: 'executeCatPaw' },
      });

      return {
        output: pawResult.answer,
        tokens: pawResult.tokens_used,
        input_tokens: pawResult.input_tokens,
        output_tokens: pawResult.output_tokens,
        duration_ms: pawResult.duration_ms,
      };
    }

    case 'catbrain':
    case 'project': { // backward compat for old canvas data
      const catbrainId = (data.catbrainId as string) || (data.projectId as string); // fallback
      if (!catbrainId) return { output: predecessorOutput };

      // WebSearch CatBrain routing (WSCB-06)
      if (catbrainId === 'seed-catbrain-websearch') {
        const searchQuery = (data.ragQuery as string) || predecessorOutput || 'informacion general';
        // Read engine from catbrain row or node data
        const wsRow = db.prepare('SELECT search_engine FROM catbrains WHERE id = ?').get(catbrainId) as { search_engine: string | null } | undefined;
        const engine = (data.searchEngine as string) || wsRow?.search_engine || 'auto';

        const wsResult = await executeWebSearch(searchQuery.slice(0, 500), engine);

        logUsage({
          event_type: 'canvas_execution',
          agent_id: null,
          model: `websearch:${wsResult.engine}`,
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          duration_ms: wsResult.duration_ms,
          status: 'success',
          metadata: { canvas_id: canvasId, run_id: runId, node_id: node.id, node_type: 'websearch' },
        });

        return {
          output: wsResult.answer,
          tokens: 0,
          input_tokens: 0,
          output_tokens: 0,
          duration_ms: wsResult.duration_ms,
        };
      }

      const connectorMode = (data.connector_mode as string) || 'both';

      // Edge mode detection (INT-05): read input_mode from node data
      // Mode A ("independent"): CatBrain does its own RAG query, ignores predecessor output
      // Mode B ("pipeline"): CatBrain receives predecessor output as context
      const inputMode = (data.input_mode as string) || 'independent';

      const cbInput: CatBrainInput = {
        query: (data.ragQuery as string) || (inputMode === 'pipeline' ? predecessorOutput.substring(0, 200) : '') || 'informacion general',
        context: inputMode === 'pipeline' ? predecessorOutput : undefined,
        mode: connectorMode as 'rag' | 'connector' | 'both',
      };

      const result = await executeCatBrain(catbrainId, cbInput);

      // Log usage
      logUsage({
        event_type: 'canvas_execution',
        agent_id: null,
        model: undefined,
        input_tokens: result.input_tokens || 0,
        output_tokens: result.output_tokens || 0,
        total_tokens: result.tokens || 0,
        duration_ms: result.duration_ms || 0,
        status: 'success',
        metadata: { canvas_id: canvasId, run_id: runId, node_id: node.id, node_type: 'catbrain' },
      });

      return {
        output: result.answer,
        tokens: result.tokens,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        duration_ms: result.duration_ms,
      };
    }

    case 'connector': {
      const connectorId = data.connectorId as string;
      if (!connectorId) return { output: predecessorOutput };

      const connector = db.prepare('SELECT * FROM connectors WHERE id = ? AND is_active = 1').get(connectorId) as
        | Record<string, unknown>
        | undefined;
      if (!connector) return { output: predecessorOutput };

      // Gmail connector: deterministic action based on predecessor JSON
      if ((connector.type as string) === 'gmail') {
        const gmailConfig: GmailConfig = connector.config ? JSON.parse(connector.config as string) : {};

        // Try to parse structured action from predecessor (new deterministic pattern)
        let actionData: Record<string, unknown> | null = null;
        try {
          const parsed = JSON.parse(predecessorOutput);
          if (parsed && typeof parsed === 'object' && parsed.accion_final) {
            actionData = parsed;
          }
          // Also detect auto_report: if node has flag and input is array, wrap as send_report
          if (!actionData && data.auto_report && Array.isArray(parsed)) {
            actionData = {
              accion_final: 'send_report',
              report_to: (data.report_to as string) || 'antonio@educa360.com',
              report_template_ref: (data.report_template_ref as string) || null,
              report_subject: `📊 Informe Inbound Diario — ${new Date().toISOString().slice(0, 10)} — ${parsed.length} emails`,
              results: parsed,
            };
          }
        } catch { /* not structured JSON — fall through to legacy behavior */ }

        if (actionData) {
          // === DETERMINISTIC EXECUTION (code decides, not LLM) ===
          const accion = actionData.accion_final as string;
          const messageId = actionData.messageId as string;
          const result: Record<string, unknown> = { ...actionData, ejecutado: false };

          // SAFETY NET: Skip if this email was already processed (prevent re-reply)
          if (messageId && accion !== 'send_report') {
            try {
              const alreadyProcessed = db.prepare(
                'SELECT message_id FROM canvas_processed_emails WHERE canvas_id = ? AND message_id = ?'
              ).get(canvasId, messageId);
              if (alreadyProcessed) {
                logger.info('canvas', `Gmail connector: SKIPPING already-processed email ${messageId}`, { canvasId, accion });
                result.ejecutado = false;
                result.accion_tomada = 'skipped_already_processed';
                return { output: JSON.stringify(result) };
              }
            } catch { /* table may not exist — proceed */ }
          }

          try {
            if (accion === 'mark_read' && messageId) {
              // Just mark as read — spam/system emails
              await markAsRead(gmailConfig, messageId);
              result.ejecutado = true;
              result.accion_tomada = 'marcado_leido';
              // Track processed email
              try { db.prepare('INSERT OR IGNORE INTO canvas_processed_emails (canvas_id, message_id, accion_tomada) VALUES (?, ?, ?)').run(canvasId, messageId, 'marcado_leido'); } catch { /* ignore */ }
              logger.info('canvas', 'Gmail deterministic: mark_read', { nodeId: node.id, messageId });

            } else if (accion === 'forward') {
              // Forward/derive to internal team
              const forwardTo = (actionData.forward_to as string) || 'antonio@educa360.com';
              const forwardSubject = `[DERIVADO] ${actionData.subject || 'Email derivado'}`;
              const forwardBody = (actionData.resumen_derivacion as string) || (actionData.resumen_consulta as string) || String(actionData.body || '');

              await sendEmail(gmailConfig, { to: forwardTo, subject: forwardSubject, text_body: forwardBody });
              if (messageId) await markAsRead(gmailConfig, messageId);
              result.ejecutado = true;
              result.accion_tomada = 'derivado';
              result.destinatario_final = forwardTo;
              try { db.prepare('INSERT OR IGNORE INTO canvas_processed_emails (canvas_id, message_id, accion_tomada) VALUES (?, ?, ?)').run(canvasId, messageId, 'derivado'); } catch { /* ignore */ }
              logger.info('canvas', 'Gmail deterministic: forward', { nodeId: node.id, to: forwardTo });

            } else if (accion === 'send_reply') {
              // Render template + send — the core deterministic flow
              const respuesta = actionData.respuesta as Record<string, unknown> | undefined;
              if (!respuesta) throw new Error('accion_final=send_reply but no "respuesta" block');

              const producto = (respuesta.producto as string) || (actionData.producto_mencionado as string) || 'K12';
              const replyMode = (actionData.reply_mode as string) || 'EMAIL_NUEVO';
              const emailDestino = (respuesta.email_destino as string) || (actionData.reply_to_email as string);
              if (!emailDestino) throw new Error('No email_destino for send_reply');

              // 1. Select template by ref_code, name, or ID (tolerant lookup)
              const refCode = (respuesta.plantilla_ref as string) || null;
              let templateId = 'seed-tpl-respuesta-comercial'; // default fallback

              let tplRow: { id: string; structure: string } | undefined;
              if (refCode) {
                // Try ref_code first, then name (LLM sometimes returns name instead of code), then ID
                tplRow = (
                  db.prepare('SELECT id, structure FROM email_templates WHERE ref_code = ?').get(refCode) ||
                  db.prepare('SELECT id, structure FROM email_templates WHERE name = ?').get(refCode) ||
                  db.prepare('SELECT id, structure FROM email_templates WHERE name LIKE ?').get(`%${refCode}%`) ||
                  db.prepare('SELECT id, structure FROM email_templates WHERE id = ?').get(refCode)
                ) as { id: string; structure: string } | undefined;
              }
              if (!tplRow) {
                tplRow = db.prepare('SELECT id, structure FROM email_templates WHERE id = ?').get(templateId) as { id: string; structure: string } | undefined;
              }
              if (tplRow) templateId = tplRow.id;

              let htmlBody: string;

              if (tplRow) {
                const structure = JSON.parse(tplRow.structure) as TemplateStructure;

                // 3. Build rich HTML for the instruction block
                // Only saludo + cuerpo go here — the template already has CTA and footer
                const saludo = (respuesta.saludo as string) || 'Hola';
                const cuerpo = (respuesta.cuerpo as string) || '';
                // Build rich HTML paragraphs with emphasis
                const cuerpoParagraphs = cuerpo
                  .split(/\n+/)
                  .filter(p => p.trim())
                  .map(p => {
                    // Bold product names and key phrases
                    const html = p.trim()
                      .replace(/(Educa360|K12|REVI|Patrimonio VR|EducaVerse|Campus360|EducaSimulator)/g, '<strong>$1</strong>')
                      .replace(/(experiencias inmersivas|realidad virtual|3D|metaverso educativo)/gi, '<strong>$1</strong>');
                    return `<p style="margin:0 0 14px 0;line-height:1.7;color:#333333">${html}</p>`;
                  })
                  .join('');

                const instructionHtml = [
                  `<p style="margin:0 0 14px 0;line-height:1.7;color:#333333;font-size:15px">`,
                  `✨ <strong>${saludo}</strong></p>`,
                  cuerpoParagraphs,
                ].join('');

                // 4. Find instruction block key — check if template has instruction blocks
                let instructionKey: string | null = null;
                const sections = (structure as unknown as Record<string, unknown>).sections as Record<string, { rows?: Array<{ columns: Array<{ block?: { type: string; text?: string } }> }> }> | undefined;
                if (sections) {
                  for (const sec of Object.values(sections)) {
                    for (const row of (sec.rows || [])) {
                      for (const col of row.columns) {
                        if (col.block?.type === 'instruction' && col.block.text) {
                          instructionKey = col.block.text;
                          break;
                        }
                      }
                    }
                  }
                }

                // Resolve assets first — best-effort
                let finalStructure = structure;
                try {
                  finalStructure = await resolveAssetsForEmail(templateId, structure);
                } catch { /* asset resolution is best-effort */ }

                if (instructionKey) {
                  // Template HAS instruction blocks — render normally with variables
                  const variables: Record<string, string> = {};
                  variables[instructionKey] = instructionHtml;
                  const rendered = renderTemplate(finalStructure, variables);
                  htmlBody = rendered.html;
                } else {
                  // Template has NO instruction blocks (visual-only like Pro-K12, Pro-REVI)
                  // Strategy: render template visual, then inject text body after header
                  const rendered = renderTemplate(finalStructure, {});
                  const visualHtml = rendered.html;

                  // Inject the text content as a styled div after the first </tr> of the body
                  const textBlock = `<tr><td style="padding:24px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#333333">${instructionHtml}</td></tr>`;
                  // Insert before the footer (before the last <!-- Footer --> or before closing </table>)
                  const footerMatch = visualHtml.match(/<!-- Footer -->/i);
                  if (footerMatch && footerMatch.index) {
                    htmlBody = visualHtml.slice(0, footerMatch.index) + textBlock + visualHtml.slice(footerMatch.index);
                  } else {
                    // Fallback: insert before the last </table>
                    const lastTable = visualHtml.lastIndexOf('</table>');
                    if (lastTable > 0) {
                      htmlBody = visualHtml.slice(0, lastTable) + textBlock + visualHtml.slice(lastTable);
                    } else {
                      htmlBody = visualHtml + textBlock;
                    }
                  }
                }
              } else {
                // Fallback: generate minimal professional HTML
                htmlBody = `<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
                  <p>${(respuesta.saludo as string) || 'Hola'},</p>
                  <p>${(respuesta.cuerpo as string) || ''}</p>
                  <p>${(respuesta.cierre as string) || ''}</p>
                  <p style="color:#666;font-size:12px;margin-top:20px">Un saludo,<br><strong>Equipo Comercial</strong></p>
                </body></html>`;
              }

              // 6. Send email
              const asunto = (respuesta.asunto as string) || `Información sobre ${producto} — Educa360`;
              await new Promise(resolve => setTimeout(resolve, 1000)); // anti-spam

              if (replyMode === 'REPLY_HILO' && messageId) {
                const threadId = (actionData.threadId as string) || messageId;
                await replyToMessage(gmailConfig, {
                  messageId,
                  threadId,
                  to: emailDestino,
                  subject: asunto,
                  body: '',
                  html_body: htmlBody,
                });
              } else {
                await sendEmail(gmailConfig, { to: emailDestino, subject: asunto, html_body: htmlBody });
              }

              // 7. Mark as read
              if (messageId) await markAsRead(gmailConfig, messageId);

              result.ejecutado = true;
              result.accion_tomada = 'respondido';
              result.destinatario_final = emailDestino;
              result.plantilla_usada = templateId;
              result.html_body_length = htmlBody.length;
              try { db.prepare('INSERT OR IGNORE INTO canvas_processed_emails (canvas_id, message_id, accion_tomada) VALUES (?, ?, ?)').run(canvasId, messageId, 'respondido'); } catch { /* ignore */ }
              logger.info('canvas', 'Gmail deterministic: send_reply', {
                nodeId: node.id, to: emailDestino, replyMode, producto, templateLen: htmlBody.length,
              });

            } else if (accion === 'send_report') {
              // Build report from accumulated iterator results — 100% deterministic
              const reportTo = (actionData.report_to as string) || 'antonio@educa360.com';
              const reportSubject = (actionData.report_subject as string) || `📊 Informe Inbound Diario — ${new Date().toISOString().slice(0, 10)}`;
              const reportRefCode = (actionData.report_template_ref as string) || null;
              logger.info('canvas', 'send_report: building report', {
                nodeId: node.id, reportRefCode, reportTo,
                itemsCount: Array.isArray(actionData.results) ? (actionData.results as unknown[]).length : 'not-array',
              });

              // Parse results array — items may be strings (from ITERATOR) or objects
              let items: Array<Record<string, unknown>> = [];
              const resultsRaw = actionData.results || actionData.items;
              if (typeof resultsRaw === 'string') {
                try { items = JSON.parse(resultsRaw); } catch { items = []; }
              } else if (Array.isArray(resultsRaw)) {
                items = (resultsRaw as Array<unknown>).map(it => {
                  if (typeof it === 'string') {
                    try { return JSON.parse(it); } catch { return { raw: it }; }
                  }
                  return it as Record<string, unknown>;
                });
              }

              // Build stats
              let respondidos = 0, derivados = 0, leidos = 0, errores = 0;
              items.forEach(it => {
                const at = (it.accion_tomada as string) || '';
                if (at === 'respondido') respondidos++;
                else if (at === 'derivado') derivados++;
                else if (at === 'marcado_leido') leidos++;
                else errores++;
              });

              // Build HTML table
              const tableRows = items.map(it => {
                const nombre = (it.respuesta as Record<string, unknown>)?.nombre_lead || (it.from as string || '').split('<')[0].trim() || 'N/A';
                const email = it.destinatario_final || (it.respuesta as Record<string, unknown>)?.email_destino || '-';
                const prod = (it.respuesta as Record<string, unknown>)?.producto || it.producto_mencionado || '-';
                const cat = it.categoria || '-';
                const accionT = it.accion_tomada || '-';
                return `<tr><td style="padding:8px;border:1px solid #e4e4e7">${nombre}</td><td style="padding:8px;border:1px solid #e4e4e7">${email}</td><td style="padding:8px;border:1px solid #e4e4e7">${prod}</td><td style="padding:8px;border:1px solid #e4e4e7">${cat}</td><td style="padding:8px;border:1px solid #e4e4e7;font-weight:bold">${accionT}</td></tr>`;
              }).join('');

              const reportHtml = [
                '<h2 style="color:#333;margin:0 0 8px 0">📊 Resumen Diario</h2>',
                `<p style="color:#666;margin:0 0 16px 0">${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>`,
                '<ul style="list-style:none;padding:0;margin:0 0 20px 0">',
                `<li style="padding:4px 0">✅ <strong>Respondidos:</strong> ${respondidos}</li>`,
                `<li style="padding:4px 0">↗️ <strong>Derivados:</strong> ${derivados}</li>`,
                `<li style="padding:4px 0">📖 <strong>Marcados leído:</strong> ${leidos}</li>`,
                errores > 0 ? `<li style="padding:4px 0">⚠️ <strong>Errores:</strong> ${errores}</li>` : '',
                '</ul>',
                '<h3 style="color:#333;margin:0 0 12px 0">Detalle de Leads</h3>',
                '<table style="width:100%;border-collapse:collapse;font-size:13px">',
                '<thead><tr style="background:#f4f4f5"><th style="padding:8px;border:1px solid #e4e4e7;text-align:left">Contacto</th><th style="padding:8px;border:1px solid #e4e4e7;text-align:left">Email</th><th style="padding:8px;border:1px solid #e4e4e7;text-align:left">Producto</th><th style="padding:8px;border:1px solid #e4e4e7;text-align:left">Cat.</th><th style="padding:8px;border:1px solid #e4e4e7;text-align:left">Acción</th></tr></thead>',
                `<tbody>${tableRows}</tbody></table>`,
              ].join('');

              // Try to render inside template
              let finalHtml: string;
              let usedTemplateId = '';

              const reportTplRow = reportRefCode
                ? (db.prepare('SELECT id, structure FROM email_templates WHERE ref_code = ?').get(reportRefCode) ||
                   db.prepare('SELECT id, structure FROM email_templates WHERE name LIKE ?').get(`%${reportRefCode}%`)) as { id: string; structure: string } | undefined
                : db.prepare("SELECT id, structure FROM email_templates WHERE id = 'seed-tpl-informe-leads'").get() as { id: string; structure: string } | undefined;

              if (reportTplRow) {
                usedTemplateId = reportTplRow.id;
                let rStruct = JSON.parse(reportTplRow.structure) as TemplateStructure;
                // Resolve local asset URLs to public Drive URLs
                try { rStruct = await resolveAssetsForEmail(usedTemplateId, rStruct); } catch { /* best-effort */ }
                // Find instruction key
                let rInstructionKey: string | null = null;
                const rSections = (rStruct as unknown as Record<string, unknown>).sections as Record<string, { rows?: Array<{ columns: Array<{ block?: { type: string; text?: string } }> }> }> | undefined;
                if (rSections) {
                  for (const sec of Object.values(rSections)) {
                    for (const row of (sec.rows || [])) {
                      for (const col of row.columns) {
                        if (col.block?.type === 'instruction' && col.block.text) {
                          rInstructionKey = col.block.text;
                          break;
                        }
                      }
                    }
                  }
                }
                if (rInstructionKey) {
                  const rVars: Record<string, string> = {};
                  rVars[rInstructionKey] = reportHtml;
                  finalHtml = renderTemplate(rStruct, rVars).html;
                } else {
                  const rendered = renderTemplate(rStruct, {});
                  const textBlock = `<tr><td style="padding:24px">${reportHtml}</td></tr>`;
                  const fm = rendered.html.match(/<!-- Footer -->/i);
                  finalHtml = fm?.index ? rendered.html.slice(0, fm.index) + textBlock + rendered.html.slice(fm.index) : rendered.html + textBlock;
                }
              } else {
                finalHtml = `<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">${reportHtml}<p style="color:#999;font-size:11px;margin-top:30px">Generado por DoCatFlow | Informe automático</p></body></html>`;
              }

              await new Promise(resolve => setTimeout(resolve, 1000));
              await sendEmail(gmailConfig, { to: reportTo, subject: reportSubject, html_body: finalHtml });

              result.ejecutado = true;
              result.accion_tomada = 'informe_enviado';
              result.destinatario_final = reportTo;
              result.plantilla_usada = usedTemplateId;
              result.stats = { respondidos, derivados, leidos, errores, total: items.length };
              logger.info('canvas', 'Gmail deterministic: send_report', {
                nodeId: node.id, to: reportTo, total: items.length, respondidos,
              });
            }
          } catch (err) {
            result.ejecutado = false;
            result.error = (err as Error).message;
            logger.error('canvas', 'Gmail deterministic action failed', {
              nodeId: node.id, accion, error: (err as Error).message,
            });
          }

          return { output: JSON.stringify(result) };
        }

        // === LEGACY BEHAVIOR (simple parseOutputToEmailPayload) ===
        const emailPayload = parseOutputToEmailPayload(predecessorOutput, gmailConfig);

        // Anti-spam delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        const emailResult = await sendEmail(gmailConfig, emailPayload);

        logger.info('canvas', 'Gmail connector sent email', {
          canvasId, nodeId: node.id, ok: emailResult.ok, to: emailPayload.to,
        });

        // Fire-and-forget: pipeline continues with predecessor output
        return { output: predecessorOutput };
      }

      // Google Drive connector: execute Drive operation with predecessor output
      if ((connector.type as string) === 'google_drive') {
        const driveConfig: GoogleDriveConfig = connector.config ? JSON.parse(connector.config as string) : {};
        const operation = (data.drive_operation as string) || 'upload';
        const folderId = (data.drive_folder_id as string) || driveConfig.root_folder_id || 'root';
        const fileName = (data.drive_file_name as string) || `output-${node.id}.md`;
        const fileId = (data.drive_file_id as string) || '';
        const executionStart = Date.now();

        try {
          const drive = createDriveClient(driveConfig);
          let driveResult: string = predecessorOutput;

          switch (operation) {
            case 'upload': {
              const result = await driveUploadFile(drive, fileName, predecessorOutput, folderId);
              logger.info('canvas', 'Drive upload completed', {
                canvasId, nodeId: node.id, fileId: result.id, fileName: result.name, webViewLink: result.webViewLink,
              });
              // Append Drive metadata so downstream nodes (e.g. email redactor) can reference the real URL
              const driveMeta = `\n\n---\n[DRIVE_FILE_INFO]\nArchivo guardado en Google Drive: ${result.name}\nURL: ${result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`}\nID: ${result.id}\n[/DRIVE_FILE_INFO]`;
              driveResult = predecessorOutput + driveMeta;
              break;
            }
            case 'download': {
              if (!fileId) {
                logger.error('canvas', 'Drive download: file_id missing', { nodeId: node.id });
                return { output: predecessorOutput };
              }
              const downloaded = await driveDownloadFile(drive, fileId, (data.drive_mime_type as string) || 'application/octet-stream');
              driveResult = downloaded.content.toString('utf-8');
              logger.info('canvas', 'Drive download completed', {
                canvasId, nodeId: node.id, fileId, bytes: downloaded.content.length,
              });
              break;
            }
            case 'list': {
              const listed = await driveListFiles(drive, folderId);
              driveResult = JSON.stringify(listed.files.map((f: { id: string; name: string; mimeType: string }) => ({ id: f.id, name: f.name, mimeType: f.mimeType })));
              logger.info('canvas', 'Drive list completed', {
                canvasId, nodeId: node.id, folderId, count: listed.files.length,
              });
              break;
            }
            case 'create_folder': {
              const folder = await driveCreateFolder(drive, fileName, folderId);
              driveResult = JSON.stringify({ id: folder.id, name: folder.name });
              logger.info('canvas', 'Drive create_folder completed', {
                canvasId, nodeId: node.id, folderId: folder.id, folderName: folder.name,
              });
              break;
            }
          }

          // Log to connector_logs
          const logId = generateId();
          const now = new Date().toISOString();
          try {
            db.prepare(`INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
              .run(logId, connectorId, JSON.stringify({ operation, folder_id: folderId, file_id: fileId, file_name: fileName, canvas_id: canvasId, node_id: node.id }),
                JSON.stringify({ ok: true }), 'success', Date.now() - executionStart, now);
          } catch (logErr) { logger.error('canvas', 'Error logging Drive invoke', { error: (logErr as Error).message }); }
          try { db.prepare('UPDATE connectors SET times_used = times_used + 1, updated_at = ? WHERE id = ?').run(now, connectorId); } catch { /* ignore */ }

          return { output: driveResult };
        } catch (err) {
          const errMsg = (err as Error).message;
          logger.error('canvas', 'Drive connector error', { nodeId: node.id, operation, error: errMsg });

          const logId = generateId();
          const now = new Date().toISOString();
          try {
            db.prepare(`INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
              .run(logId, connectorId, JSON.stringify({ operation, folder_id: folderId, file_id: fileId, file_name: fileName }),
                JSON.stringify({ ok: false }), 'failed', Date.now() - executionStart, errMsg.substring(0, 5000), now);
          } catch { /* ignore */ }

          return { output: predecessorOutput };
        }
      }

      // Email Template connector: render template with predecessor output as variables
      if ((connector.type as string) === 'email_template') {
        const config = connector.config ? JSON.parse(connector.config as string) : {};
        const templateId = (data.template_id as string) || config.default_template_id;

        if (!templateId) {
          logger.warn('canvas', 'Email template connector: no template_id configured', { canvasId, nodeId: node.id });
          return { output: predecessorOutput };
        }

        try {
          const template = db.prepare('SELECT * FROM email_templates WHERE id = ? AND is_active = 1').get(templateId) as Record<string, unknown> | undefined;
          if (!template) {
            logger.warn('canvas', 'Email template not found or inactive', { canvasId, nodeId: node.id, templateId });
            return { output: predecessorOutput };
          }

          let structure: TemplateStructure = JSON.parse(template.structure as string);

          // Resolve local assets to public Drive URLs
          structure = await resolveAssetsForEmail(templateId, structure);

          // Try to parse predecessor output as JSON variables map
          let variables: Record<string, string> = {};
          try {
            const parsed = JSON.parse(predecessorOutput);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
              variables = parsed as Record<string, string>;
            }
          } catch {
            // Not JSON — use predecessor output as content for first instruction block
            const firstInstruction = findFirstInstructionKey(structure);
            if (firstInstruction) {
              variables = { [firstInstruction]: predecessorOutput };
            }
          }

          const { html } = renderTemplate(structure, variables);

          logger.info('canvas', 'Email template rendered', {
            canvasId, nodeId: node.id, templateId, templateName: template.name,
            htmlLength: html.length, variableCount: Object.keys(variables).length,
          });

          // Pass rendered HTML downstream (next node, e.g. gmail connector, uses it as email body)
          return { output: html };
        } catch (err) {
          logger.error('canvas', 'Email template render failed', {
            canvasId, nodeId: node.id, templateId, error: (err as Error).message,
          });
          return { output: predecessorOutput };
        }
      }

      const connConfig = connector.config ? JSON.parse(connector.config as string) : {};

      // MCP Server connector: invoke tool via JSON-RPC with session support
      if ((connector.type as string) === 'mcp_server' && connConfig.url) {
        const toolName = (data.tool_name as string) || connConfig.tool_name || 'search_people';
        const toolArgs: Record<string, unknown> = { keywords: predecessorOutput };

        // Merge any additional args from node data
        if (data.tool_args && typeof data.tool_args === 'object') {
          Object.assign(toolArgs, data.tool_args as Record<string, unknown>);
        }

        try {
          const mcpHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
          };

          // Step 1: Initialize handshake to get session ID
          const initRes = await fetch(connConfig.url, {
            method: 'POST',
            headers: mcpHeaders,
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: Date.now(),
              method: 'initialize',
              params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'docflow-canvas', version: '1.0' },
              },
            }),
          });

          const sessionId = initRes.headers.get('mcp-session-id');
          if (sessionId) {
            mcpHeaders['Mcp-Session-Id'] = sessionId;
          }

          // Step 2: Call the tool with session
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), (connConfig.timeout || 30) * 1000);

          const mcpRes = await fetch(connConfig.url, {
            method: 'POST',
            headers: mcpHeaders,
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: Date.now() + 1,
              method: 'tools/call',
              params: { name: toolName, arguments: toolArgs },
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (!mcpRes.ok) {
            const errText = await mcpRes.text();
            logger.error('canvas', 'MCP connector error', { nodeId: node.id, status: mcpRes.status, error: errText.substring(0, 500) });
            return { output: predecessorOutput };
          }

          // Parse SSE or JSON response from MCP server
          const mcpBody = await mcpRes.text();
          let rpcResponse;
          if (mcpBody.startsWith('event:') || (mcpRes.headers.get('content-type') || '').includes('text/event-stream')) {
            const dataLine = mcpBody.split('\n').find((l: string) => l.startsWith('data: '));
            rpcResponse = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(mcpBody);
          } else {
            rpcResponse = JSON.parse(mcpBody);
          }
          if (rpcResponse.error) {
            logger.error('canvas', 'MCP RPC error', { nodeId: node.id, error: rpcResponse.error });
            return { output: predecessorOutput };
          }

          // Extract text content from MCP response
          const content = rpcResponse.result?.content;
          let mcpOutput = predecessorOutput;
          if (Array.isArray(content) && content.length > 0 && content[0].text) {
            mcpOutput = content[0].text;
          } else if (rpcResponse.result) {
            mcpOutput = typeof rpcResponse.result === 'string' ? rpcResponse.result : JSON.stringify(rpcResponse.result);
          }

          logger.info('canvas', 'MCP connector executed', {
            canvasId, nodeId: node.id, tool: toolName,
          });

          return { output: mcpOutput };
        } catch (err) {
          logger.error('canvas', 'MCP connector exception', { nodeId: node.id, error: (err as Error).message });
          return { output: predecessorOutput };
        }
      }

      // HTTP API connector: execute GET/POST with params_template/body_template
      if ((connector.type as string) === 'http_api' && connConfig.url) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), (connConfig.timeout || 30) * 1000);

          let apiUrl = connConfig.url;
          const fetchOptions: RequestInit = { signal: controller.signal };
          const method = (connConfig.method || 'GET').toUpperCase();

          if (method === 'GET' && connConfig.params_template) {
            const params = connConfig.params_template.replace(/\{\{output\}\}/g, encodeURIComponent(predecessorOutput.substring(0, 500)));
            apiUrl = `${connConfig.url}?${params}`;
            fetchOptions.method = 'GET';
          } else if (['POST', 'PUT', 'PATCH'].includes(method)) {
            fetchOptions.method = method;
            fetchOptions.headers = { 'Content-Type': 'application/json', ...(connConfig.headers || {}) };
            if (connConfig.body_template) {
              fetchOptions.body = connConfig.body_template.replace(/\{\{output\}\}/g, predecessorOutput.substring(0, 2000));
            } else {
              fetchOptions.body = JSON.stringify({ query: predecessorOutput, input: predecessorOutput });
            }
          } else {
            fetchOptions.method = method;
          }

          const res = await fetch(apiUrl, fetchOptions);
          clearTimeout(timeout);

          if (!res.ok) {
            logger.error('canvas', 'http_api connector error', { nodeId: node.id, status: res.status, url: apiUrl.substring(0, 200) });
            return { output: predecessorOutput };
          }

          const text = await res.text();
          let apiData: unknown;
          try { apiData = JSON.parse(text); } catch { apiData = text; }

          // Extract result_fields and limit max_results if configured
          if (connConfig.result_fields && Array.isArray(connConfig.result_fields) && typeof apiData === 'object' && apiData !== null) {
            const resultsArray = (apiData as Record<string, unknown>).results as Array<Record<string, unknown>> | undefined;
            if (Array.isArray(resultsArray)) {
              const maxResults = connConfig.max_results || 10;
              const filtered = resultsArray.slice(0, maxResults).map((item: Record<string, unknown>) => {
                const picked: Record<string, unknown> = {};
                for (const field of connConfig.result_fields as string[]) {
                  if (item[field] !== undefined) picked[field] = item[field];
                }
                return picked;
              });

              logger.info('canvas', 'http_api connector executed', {
                canvasId, nodeId: node.id, results: filtered.length,
              });

              return { output: JSON.stringify(filtered, null, 2) };
            }
          }

          const apiOutput = typeof apiData === 'string' ? apiData : JSON.stringify(apiData, null, 2);

          logger.info('canvas', 'http_api connector executed', {
            canvasId, nodeId: node.id, method, outputLength: apiOutput.length,
          });

          // Log connector usage
          const logId = generateId();
          const now = new Date().toISOString();
          try {
            db.prepare('INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
              .run(logId, connectorId, JSON.stringify({ method, url: apiUrl.substring(0, 500), node_id: node.id }), apiOutput.substring(0, 5000), 'success', 0, now);
            db.prepare('UPDATE connectors SET times_used = times_used + 1, updated_at = ? WHERE id = ?').run(now, connectorId);
          } catch { /* ignore log errors */ }

          return { output: apiOutput };
        } catch (err) {
          logger.error('canvas', 'http_api connector exception', { nodeId: node.id, error: (err as Error).message });
          return { output: predecessorOutput };
        }
      }

      const mode = (data.mode as string) || 'after';
      const payload = {
        canvas_id: canvasId,
        run_id: runId,
        node_id: node.id,
        input: predecessorOutput,
        metadata: {},
      };

      if (mode === 'before') {
        // Call connector and pass response as context, then return predecessor output
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), (connConfig.timeout || 30) * 1000);
          await fetch(connConfig.url, {
            method: connConfig.method || 'POST',
            headers: { 'Content-Type': 'application/json', ...(connConfig.headers || {}) },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          clearTimeout(timeout);
        } catch (err) {
          logger.error('canvas', 'Error calling connector', { error: (err as Error).message });
        }
      }

      return { output: predecessorOutput };
    }

    case 'checkpoint': {
      // The main loop handles the 'waiting' transition — return predecessor output
      return { output: predecessorOutput };
    }

    case 'merge': {
      // Collect all incoming edges' source outputs
      const incomingEdges = edges.filter(e => e.target === node.id);
      const allInputs = incomingEdges
        .map((e, i) => {
          const sourceOutput = nodeStates[e.source]?.output || '';
          return `## Entrada ${i + 1}\n${sourceOutput}`;
        })
        .join('\n\n---\n\n');

      const agentId = data.agentId as string | undefined;
      if (agentId || data.model) {
        const model = (data.model as string) || 'gemini-main';
        const systemPrompt = `Eres un sintetizador experto. Combina y sintetiza las siguientes entradas en un documento unificado coherente. Responde siempre en español.`;
        const userContent = `${data.instructions ? `## Instrucciones\n${data.instructions}\n\n` : ''}${allInputs}`;

        const result = await callLLM(model, systemPrompt, userContent);

        logUsage({
          event_type: 'canvas_execution',
          agent_id: agentId || null,
          model,
          input_tokens: result.input_tokens,
          output_tokens: result.output_tokens,
          total_tokens: result.tokens,
          duration_ms: result.duration_ms,
          status: 'success',
          metadata: { canvas_id: canvasId, run_id: runId, node_id: node.id, node_type: 'merge' },
        });

        return result;
      }

      // No LLM — concatenate with separators
      return { output: allInputs };
    }

    case 'condition': {
      const conditionText = (data.condition as string) || 'La entrada es válida';
      const model = (data.model as string) || 'gemini-main';
      const systemPrompt = `Eres un evaluador de condiciones. Responde SOLO con 'yes' o 'no'.`;
      const userContent = `Condición: ${conditionText}\n\nContenido a evaluar:\n${predecessorOutput}`;

      const result = await callLLM(model, systemPrompt, userContent);
      const answer = result.output.trim().toLowerCase().startsWith('yes') ? 'yes' : 'no';

      logUsage({
        event_type: 'canvas_execution',
        model,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        total_tokens: result.tokens,
        duration_ms: result.duration_ms,
        status: 'success',
        metadata: { canvas_id: canvasId, run_id: runId, node_id: node.id, node_type: 'condition' },
      });

      return { ...result, output: answer };
    }

    case 'output': {
      // Existing: format output
      let output = predecessorOutput;
      const format = data.format as string | undefined;
      if (format === 'json') {
        try {
          output = JSON.stringify(JSON.parse(predecessorOutput), null, 2);
        } catch {
          // Fallback to raw
        }
      }

      // OUT-03: Create notification if configured
      const notifyOnComplete = data.notify_on_complete as boolean | undefined;
      if (notifyOnComplete) {
        const outputName = (data.outputName as string) || 'OUTPUT';
        createNotification({
          type: 'canvas',
          title: `CatFlow completado: ${outputName}`,
          message: output.slice(0, 200),
          severity: 'success',
          link: `/canvas/${canvasId}`,
        });
      }

      // OUT-04 + OUT-05: Fire trigger chain (fire-and-forget)
      const triggerTargets = data.trigger_targets as Array<{ id: string; name: string }> | undefined;
      if (triggerTargets && triggerTargets.length > 0) {
        for (const target of triggerTargets) {
          try {
            // Validate target canvas exists and has listen_mode=1
            const targetCanvas = db.prepare('SELECT id, listen_mode FROM canvases WHERE id = ?').get(target.id) as { id: string; listen_mode: number } | undefined;
            if (!targetCanvas || targetCanvas.listen_mode !== 1) {
              logger.warn('canvas', `OUTPUT trigger: target ${target.id} (${target.name}) not found or not listening, skipping`);
              continue;
            }

            // Create trigger record
            const triggerId = generateId();
            db.prepare(
              `INSERT INTO catflow_triggers (id, source_canvas_id, source_run_id, source_node_id, target_canvas_id, payload, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`
            ).run(triggerId, canvasId, runId, node.id, target.id, output);

            // Set external_input on target canvas
            db.prepare('UPDATE canvases SET external_input = ? WHERE id = ?').run(output, target.id);

            // Update to running
            db.prepare("UPDATE catflow_triggers SET status = 'running' WHERE id = ?").run(triggerId);

            logger.info('canvas', 'OUTPUT trigger: fired', {
              canvasId, runId, nodeId: node.id, triggerId, targetId: target.id, targetName: target.name,
            });

            // Fire-and-forget: launch target canvas execution
            launchCanvasExecution(target.id, triggerId).catch(err => {
              db.prepare("UPDATE catflow_triggers SET status = 'failed', response = ?, completed_at = ? WHERE id = ?")
                .run((err as Error).message, new Date().toISOString(), triggerId);
              logger.error('canvas', `OUTPUT trigger: execution failed for ${target.name}`, {
                triggerId, targetId: target.id, error: (err as Error).message,
              });
            });
          } catch (err) {
            logger.error('canvas', `OUTPUT trigger: error firing trigger to ${target.name}`, {
              targetId: target.id, error: (err as Error).message,
            });
          }
        }
      }

      return { output };
    }

    case 'scheduler': {
      const scheduleType = (data.schedule_type as string) || 'delay';

      if (scheduleType === 'delay') {
        // SCHED-05: pause for configured time then emit output-true
        const value = (data.delay_value as number) || 5;
        const unit = (data.delay_unit as string) || 'minutes';
        const ms = convertToMs(value, unit);
        await new Promise(resolve => setTimeout(resolve, ms));
        return { output: 'output-true' };
      }

      if (scheduleType === 'count') {
        // SCHED-06: read cycle from canvas_runs.metadata
        const runRow = db.prepare('SELECT metadata FROM canvas_runs WHERE id = ?').get(runId) as
          | { metadata: string | null }
          | undefined;
        const metadata = JSON.parse(runRow?.metadata || '{}');
        const counts = metadata.scheduler_counts || {};
        const currentCycle = (counts[node.id] || 0) + 1;
        const targetCount = (data.count_value as number) || 3;

        // Update metadata with new cycle count
        counts[node.id] = currentCycle;
        metadata.scheduler_counts = counts;
        db.prepare('UPDATE canvas_runs SET metadata = ? WHERE id = ?')
          .run(JSON.stringify(metadata), runId);

        if (currentCycle >= targetCount) {
          return { output: 'output-completed' };
        }
        return { output: 'output-true' };
      }

      if (scheduleType === 'listen') {
        // SCHED-07: checkpoint-style pause, wait for signal API
        // The main executeCanvas loop handles the 'waiting' transition
        return { output: predecessorOutput };
      }

      return { output: predecessorOutput };
    }

    case 'storage': {
      let content = predecessorOutput;

      // STOR-05: Optional LLM formatting before saving
      if (data.use_llm_format && data.format_instructions) {
        try {
          const model = (data.format_model as string) || 'gemini-main';
          const systemPrompt = `Formatea el siguiente contenido segun estas instrucciones: ${data.format_instructions}. Responde SOLO con el contenido formateado, sin explicaciones adicionales.`;
          const llmResult = await callLLM(model, systemPrompt, content);
          content = llmResult.output;

          logUsage({
            event_type: 'canvas_execution',
            model,
            input_tokens: llmResult.input_tokens,
            output_tokens: llmResult.output_tokens,
            total_tokens: llmResult.tokens,
            duration_ms: llmResult.duration_ms,
            status: 'success',
            metadata: { canvas_id: canvasId, run_id: runId, node_id: node.id, node_type: 'storage', via: 'llm_format' },
          });
        } catch (err) {
          logger.error('canvas', 'Error LLM format en storage node, usando contenido sin formato', {
            error: (err as Error).message, nodeId: node.id,
          });
          // Fallback: use unformatted content — do NOT fail the node
        }
      }

      // STOR-04: Resolve filename template
      const template = (data.filename_template as string) || '{title}_{date}.md';
      const resolvedFilename = resolveFilenameTemplate(template, runId, canvasId);

      const storageMode = (data.storage_mode as string) || 'local';

      // STOR-06: Local mode — write file to PROJECTS_PATH/storage/{subdir}/{filename}
      if (storageMode === 'local' || storageMode === 'both') {
        const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');
        const subdir = sanitizeSubdir((data.subdir as string) || '');
        const storageDir = path.join(projectsPath, 'storage', subdir);

        fs.mkdirSync(storageDir, { recursive: true });
        const safeFilename = path.basename(resolvedFilename);
        fs.writeFileSync(path.join(storageDir, safeFilename), content, 'utf-8');

        logger.info('canvas', 'Storage node: archivo guardado', {
          canvasId, runId, nodeId: node.id, path: path.join(storageDir, safeFilename),
        });
      }

      // STOR-07: Connector mode — invoke configured connector with content + filename
      if (storageMode === 'connector' || storageMode === 'both') {
        const connectorId = data.connectorId as string;
        if (connectorId) {
          const connector = db.prepare('SELECT * FROM connectors WHERE id = ? AND is_active = 1').get(connectorId) as
            | Record<string, unknown>
            | undefined;
          if (connector) {
            const connConfig = connector.config ? JSON.parse(connector.config as string) : {};
            const payload = {
              canvas_id: canvasId,
              run_id: runId,
              node_id: node.id,
              input: content,
              filename: resolvedFilename,
              metadata: {},
            };
            try {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), (connConfig.timeout || 30) * 1000);
              await fetch(connConfig.url, {
                method: connConfig.method || 'POST',
                headers: { 'Content-Type': 'application/json', ...(connConfig.headers || {}) },
                body: JSON.stringify(payload),
                signal: controller.signal,
              });
              clearTimeout(timeout);

              logger.info('canvas', 'Storage node: connector invocado', {
                canvasId, runId, nodeId: node.id, connectorId,
              });
            } catch (err) {
              logger.error('canvas', 'Error connector en storage node', {
                error: (err as Error).message, nodeId: node.id, connectorId,
              });
              // Do NOT fail the node — connector errors are non-fatal for storage
            }
          } else {
            logger.warn('canvas', 'Storage node: connector no encontrado o inactivo', {
              nodeId: node.id, connectorId,
            });
          }
        } else {
          logger.warn('canvas', 'Storage node: modo connector/both sin connectorId configurado', {
            nodeId: node.id,
          });
        }
      }

      // STOR-08: Pass content to next node (formatted if LLM was used)
      return { output: content };
    }

    case 'multiagent': {
      const targetTaskId = data.target_task_id as string;
      const mode = (data.execution_mode as string) || 'sync';
      const payloadTemplate = (data.payload_template as string) || '{input}';
      const timeout = (data.timeout as number) || 300;

      if (!targetTaskId) {
        return { output: 'ERROR: No target CatFlow configured' };
      }

      // Validate target canvas exists and has listen_mode=1
      const targetCanvas = db.prepare('SELECT id, listen_mode FROM canvases WHERE id = ?').get(targetTaskId) as { id: string; listen_mode: number } | undefined;
      if (!targetCanvas) {
        return { output: 'ERROR: Target CatFlow not found' };
      }
      if (targetCanvas.listen_mode !== 1) {
        return { output: 'ERROR: Target CatFlow is not in listen mode' };
      }

      // MA-05: Resolve payload template variables
      const payload = payloadTemplate
        .replace(/\{input\}/g, predecessorOutput)
        .replace(/\{context\}/g, predecessorOutput)
        .replace(/\{run_id\}/g, runId);

      // Create trigger directly in DB (CRITICAL: no fetch to own API)
      const triggerId = generateId();
      db.prepare(
        `INSERT INTO catflow_triggers (id, source_canvas_id, source_run_id, source_node_id, target_canvas_id, payload, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`
      ).run(triggerId, canvasId, runId, node.id, targetTaskId, payload);

      // Set external_input on target canvas
      db.prepare('UPDATE canvases SET external_input = ? WHERE id = ?').run(payload, targetTaskId);

      // Update to running
      db.prepare("UPDATE catflow_triggers SET status = 'running' WHERE id = ?").run(triggerId);

      logger.info('canvas', 'MultiAgent node: trigger created', {
        canvasId, runId, nodeId: node.id, triggerId, targetCanvasId: targetTaskId, mode,
      });

      // MA-07: Async mode -- fire and forget
      if (mode === 'async') {
        launchCanvasExecution(targetTaskId, triggerId).catch(err => {
          logger.error('canvas', 'MultiAgent async: target execution failed', {
            triggerId, targetCanvasId: targetTaskId, error: (err as Error).message,
          });
          db.prepare("UPDATE catflow_triggers SET status = 'failed', response = ?, completed_at = datetime('now') WHERE id = ?")
            .run((err as Error).message, triggerId);
        });
        return { output: JSON.stringify({ trigger_id: triggerId, status: 'running' }) };
      }

      // MA-06: Sync mode -- await execution, then check result
      try {
        const timeoutMs = timeout * 1000;

        // Launch target canvas execution and await completion
        const execPromise = launchCanvasExecution(targetTaskId, triggerId);

        // Race between execution and timeout
        const timeoutPromise = new Promise<'timeout'>((resolve) => {
          setTimeout(() => resolve('timeout'), timeoutMs);
        });

        const raceResult = await Promise.race([
          execPromise.then(() => 'done' as const),
          timeoutPromise,
        ]);

        if (raceResult === 'timeout') {
          // MA-08: Timeout
          db.prepare("UPDATE catflow_triggers SET status = 'timeout', response = ?, completed_at = datetime('now') WHERE id = ?")
            .run(`Timeout after ${timeout}s`, triggerId);
          logger.warn('canvas', 'MultiAgent sync: timeout', { triggerId, targetCanvasId: targetTaskId, timeout });
          return { output: `ERROR: Timeout after ${timeout}s waiting for CatFlow response` };
        }

        // MA-09: Check trigger response or latest canvas run output
        const trigger = db.prepare('SELECT status, response FROM catflow_triggers WHERE id = ?').get(triggerId) as { status: string; response: string | null } | undefined;

        if (trigger?.status === 'completed') {
          return { output: trigger.response || 'Completed' };
        }
        if (trigger?.status === 'failed') {
          return { output: `ERROR: ${trigger.response || 'Target CatFlow failed'}` };
        }

        // Check the target canvas's latest run for output
        const latestRun = db.prepare(
          "SELECT status, node_states FROM canvas_runs WHERE canvas_id = ? ORDER BY created_at DESC LIMIT 1"
        ).get(targetTaskId) as { status: string; node_states: string | null } | undefined;

        if (latestRun) {
          // Extract output from the last output node in the run
          let response = 'Completed';
          if (latestRun.node_states) {
            const states: NodeStates = JSON.parse(latestRun.node_states);
            const outputEntry = Object.values(states).find(s => s.status === 'completed' && s.output);
            if (outputEntry?.output) response = outputEntry.output;
          }
          const finalStatus = latestRun.status === 'failed' ? 'failed' : 'completed';
          db.prepare(`UPDATE catflow_triggers SET status = ?, response = ?, completed_at = datetime('now') WHERE id = ?`)
            .run(finalStatus, response, triggerId);

          if (finalStatus === 'failed') {
            return { output: `ERROR: ${response}` };
          }
          return { output: response };
        }

        // Fallback: mark as completed
        db.prepare("UPDATE catflow_triggers SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(triggerId);
        return { output: 'Completed (no output from target)' };

      } catch (err) {
        db.prepare("UPDATE catflow_triggers SET status = 'failed', response = ?, completed_at = datetime('now') WHERE id = ?")
          .run((err as Error).message, triggerId);
        return { output: `ERROR: ${(err as Error).message}` };
      }
    }

    case 'iterator': {
      // ITER-01: Parse input array and init/continue loop context
      const runRow = db.prepare('SELECT metadata FROM canvas_runs WHERE id = ?').get(runId) as
        | { metadata: string | null }
        | undefined;
      const metadata = JSON.parse(runRow?.metadata || '{}');
      const iterState = metadata.iterator_state?.[node.id];

      if (!iterState) {
        // First execution: parse predecessor output into items array
        let items = parseIteratorItems(predecessorOutput, (data.separator as string) || '');

        // Filter out already-processed emails (prevent re-reply across runs)
        // Uses a direct query — NO try/catch on the filter itself to ensure it runs
        {
          let processedIds = new Set<string>();
          try {
            const rows = db.prepare('SELECT message_id FROM canvas_processed_emails WHERE canvas_id = ?').all(canvasId) as Array<{ message_id: string }>;
            processedIds = new Set(rows.map(r => r.message_id));
          } catch (e) {
            logger.error('canvas', 'Iterator: CANNOT READ tracker table', { error: (e as Error).message });
          }
          logger.info('canvas', `Iterator: tracker loaded ${processedIds.size} IDs for ${canvasId}`);
          if (processedIds.size > 0 && items.length > 0) {
            const beforeCount = items.length;
            const kept: string[] = [];
            for (const item of items) {
              let messageId: string | undefined;
              try { messageId = JSON.parse(item).messageId; } catch { /* not JSON */ }
              if (messageId && processedIds.has(messageId)) {
                logger.info('canvas', `Iterator: EXCLUDING already-processed ${messageId}`);
              } else {
                kept.push(item);
              }
            }
            items = kept;
            logger.info('canvas', `Iterator: kept ${items.length} of ${beforeCount} items (excluded ${beforeCount - items.length})`);
          }
        }

        metadata.iterator_state = metadata.iterator_state || {};
        metadata.iterator_state[node.id] = {
          items,
          currentIndex: 0,
          results: [],
          startedAt: new Date().toISOString(),
        };
        db.prepare('UPDATE canvas_runs SET metadata = ? WHERE id = ?')
          .run(JSON.stringify(metadata), runId);

        if (items.length === 0) {
          logger.info('canvas', `Iterator ${node.id}: empty array, skipping to completed`, { runId });
          return { output: '[]' };
        }

        logger.info('canvas', `Iterator ${node.id}: starting loop with ${items.length} items`, { runId });
        return { output: items[0] };
      }

      // Subsequent execution (after ITERATOR_END triggered reset)
      const { items, currentIndex } = iterState;
      if (currentIndex >= items.length) {
        return { output: JSON.stringify(iterState.results) };
      }

      logger.info('canvas', `Iterator ${node.id}: emitting item ${currentIndex + 1}/${items.length}`, { runId });
      return { output: items[currentIndex] };
    }

    case 'iterator_end': {
      // ITER-02: Just pass through the processed element; main loop handles loop logic
      return { output: predecessorOutput };
    }

    default: {
      return { output: predecessorOutput };
    }
  }
}

// --- Helper: Parse iterator input into items array ---

function parseIteratorItems(input: string, separator: string): string[] {
  if (!input || !input.trim()) return [];

  // Try JSON array first
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) {
      return parsed.map(item => typeof item === 'string' ? item : JSON.stringify(item));
    }
  } catch {
    // If input looks like a truncated JSON array, try to repair it
    const trimmed = input.trim();
    if (trimmed.startsWith('[')) {
      // Attempt repair: find last complete object and close the array
      const lastCompleteObj = trimmed.lastIndexOf('}');
      if (lastCompleteObj > 0) {
        const repaired = trimmed.substring(0, lastCompleteObj + 1) + ']';
        try {
          const parsed = JSON.parse(repaired);
          if (Array.isArray(parsed)) {
            logger.warn('canvas', 'Iterator: repaired truncated JSON array', {
              originalLength: input.length, repairedItems: parsed.length,
            });
            return parsed.map(item => typeof item === 'string' ? item : JSON.stringify(item));
          }
        } catch {
          // Repair failed — return empty array, NOT line-split garbage
          logger.error('canvas', 'Iterator: JSON array is truncated and cannot be repaired', {
            length: input.length, firstChars: input.slice(0, 100),
          });
          return [];
        }
      }
      // Starts with [ but no complete object — return empty
      return [];
    }
  }

  // Use custom separator if provided
  if (separator) {
    return input.split(separator).map(s => s.trim()).filter(Boolean);
  }

  // Auto-detect: try newline splitting (only for non-JSON inputs)
  const lines = input.split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length > 1) return lines;

  // Single item
  return [input.trim()];
}

// --- Main: Execute Canvas DAG ---

export async function executeCanvas(canvasId: string, runId: string): Promise<void> {
  const state = { cancelled: false };
  runningExecutors.set(runId, state);

  try {
    // Load canvas and run
    const canvas = db.prepare('SELECT flow_data FROM canvases WHERE id = ?').get(canvasId) as
      | { flow_data: string | null }
      | undefined;
    if (!canvas?.flow_data) throw new Error('Canvas sin flow_data');

    const flowData = JSON.parse(canvas.flow_data) as { nodes: CanvasNode[]; edges: CanvasEdge[] };
    const { nodes, edges } = flowData;

    const run = db.prepare('SELECT * FROM canvas_runs WHERE id = ?').get(runId) as
      | { execution_order: string; node_states: string }
      | undefined;
    if (!run) throw new Error('Run no encontrado');

    const executionOrder: string[] = JSON.parse(run.execution_order);
    const nodeStates: NodeStates = JSON.parse(run.node_states);
    let totalTokens = 0;
    const startTime = Date.now();

    for (const nodeId of executionOrder) {
      // Skip already completed/skipped nodes
      if (nodeStates[nodeId]?.status === 'completed' || nodeStates[nodeId]?.status === 'skipped') {
        continue;
      }

      // Check if cancelled
      if (state.cancelled) {
        db.prepare("UPDATE canvas_runs SET status = 'cancelled', completed_at = ? WHERE id = ?").run(
          new Date().toISOString(),
          runId
        );
        return;
      }

      // Find node definition
      const node = nodes.find(n => n.id === nodeId);
      if (!node) continue;

      // Mark as running
      nodeStates[nodeId] = {
        ...nodeStates[nodeId],
        status: 'running',
        started_at: new Date().toISOString(),
      };
      saveNodeStates(runId, nodeId, nodeStates);

      try {
        const result = await dispatchNode(node, edges, nodeStates, canvasId, runId);

        // Special handling: CHECKPOINT node pauses execution
        if (node.type === 'checkpoint') {
          nodeStates[nodeId] = {
            ...nodeStates[nodeId],
            status: 'waiting',
            output: result.output,
          };
          saveNodeStates(runId, nodeId, nodeStates);
          db.prepare("UPDATE canvas_runs SET status = 'waiting' WHERE id = ?").run(runId);
          runningExecutors.delete(runId);
          return; // Pause — resume via approve/reject
        }

        // Special handling: SCHEDULER listen mode pauses execution (SCHED-07)
        if (node.type === 'scheduler' && (node.data.schedule_type as string) === 'listen') {
          nodeStates[nodeId] = {
            ...nodeStates[nodeId],
            status: 'waiting',
            output: result.output,
            started_at: nodeStates[nodeId].started_at,
          };
          // Store waiting_since and listen_timeout in metadata for timeout checking
          const runRow = db.prepare('SELECT metadata FROM canvas_runs WHERE id = ?').get(runId) as
            | { metadata: string | null }
            | undefined;
          const meta = JSON.parse(runRow?.metadata || '{}');
          meta.scheduler_waiting = meta.scheduler_waiting || {};
          meta.scheduler_waiting[nodeId] = {
            waiting_since: new Date().toISOString(),
            listen_timeout: (node.data.listen_timeout as number) || 300,
          };
          db.prepare('UPDATE canvas_runs SET metadata = ? WHERE id = ?')
            .run(JSON.stringify(meta), runId);

          saveNodeStates(runId, nodeId, nodeStates);
          db.prepare("UPDATE canvas_runs SET status = 'waiting' WHERE id = ?").run(runId);
          runningExecutors.delete(runId);
          return; // Pause — resume via signal endpoint
        }

        // Special handling: CONDITION node marks skipped branch
        if (node.type === 'condition') {
          const chosenBranch = result.output; // 'yes' or 'no'
          const skippedNodeIds = getSkippedNodes(nodeId, chosenBranch, nodes, edges, nodeStates);
          for (const skippedId of skippedNodeIds) {
            nodeStates[skippedId] = { status: 'skipped' };
          }
        }

        // Special handling: SCHEDULER node marks non-chosen branches as skipped
        if (node.type === 'scheduler') {
          const chosenBranch = result.output; // 'output-true', 'output-completed', or 'output-false'
          const skippedNodeIds = getSkippedNodes(nodeId, chosenBranch, nodes, edges, nodeStates);
          for (const skippedId of skippedNodeIds) {
            nodeStates[skippedId] = { status: 'skipped' };
          }
        }

        // Special handling: ITERATOR node marks non-chosen branch as skipped (ITER-01)
        if (node.type === 'iterator') {
          const runRowI = db.prepare('SELECT metadata FROM canvas_runs WHERE id = ?').get(runId) as
            | { metadata: string | null }
            | undefined;
          const metaI = JSON.parse(runRowI?.metadata || '{}');
          const iterStateI = metaI.iterator_state?.[nodeId];
          // If items exist → element branch; if empty → completed branch
          const chosenBranch = (iterStateI?.items?.length > 0 && iterStateI.currentIndex < iterStateI.items.length)
            ? 'element'
            : 'completed';
          const skippedNodeIds = getSkippedNodes(nodeId, chosenBranch, nodes, edges, nodeStates);
          for (const skippedId of skippedNodeIds) {
            nodeStates[skippedId] = { status: 'skipped' };
          }
        }

        // Special handling: MULTIAGENT node marks non-chosen branch as skipped
        if (node.type === 'multiagent') {
          const chosenBranch = result.output.startsWith('ERROR:') ? 'output-error' : 'output-response';
          const skippedNodeIds = getSkippedNodes(nodeId, chosenBranch, nodes, edges, nodeStates);
          for (const skippedId of skippedNodeIds) {
            nodeStates[skippedId] = { status: 'skipped' };
          }
        }

        // Mark completed — clean markdown wrappers from LLM output
        let cleanedOutput = (node.type === 'agent' || node.type === 'catbrain')
          ? cleanLlmOutput(result.output)
          : result.output;

        // Safety net R10: preserve predecessor fields in agent nodes (anti-teléfono-escacharrado)
        if (node.type === 'agent') {
          const predOutput = getPredecessorOutput(nodeId, edges, nodeStates);
          if (predOutput) {
            cleanedOutput = mergePreserveFields(predOutput, cleanedOutput);
          }
        }
        const tokens = result.tokens || 0;
        totalTokens += tokens;
        nodeStates[nodeId] = {
          status: 'completed',
          output: cleanedOutput,
          tokens,
          input_tokens: result.input_tokens,
          output_tokens: result.output_tokens,
          duration_ms: result.duration_ms,
          started_at: nodeStates[nodeId].started_at,
          completed_at: new Date().toISOString(),
        };
        saveNodeStates(runId, nodeId, nodeStates);

        // Update total tokens in DB
        db.prepare('UPDATE canvas_runs SET total_tokens = ? WHERE id = ?').run(totalTokens, runId);

        // Special handling: SCHEDULER count mode — re-execute upstream nodes for next cycle (SCHED-06)
        if (
          node.type === 'scheduler' &&
          (node.data.schedule_type as string) === 'count' &&
          result.output === 'output-true'
        ) {
          // Find all nodes between the previous control node (or start) and this scheduler.
          // These are the nodes that need to be re-executed for the next cycle.
          // Strategy: walk backwards from this scheduler through incoming edges,
          // collecting nodes until we hit a start node or another branch/control node.
          const upstreamToReset = new Set<string>();
          const visited = new Set<string>();
          const bfsQueue = [nodeId];
          visited.add(nodeId);

          while (bfsQueue.length > 0) {
            const currentId = bfsQueue.shift()!;
            const incomingEdges = edges.filter(e => e.target === currentId);
            for (const edge of incomingEdges) {
              const sourceId = edge.source;
              if (visited.has(sourceId)) continue;
              visited.add(sourceId);
              const sourceNode = nodes.find(n => n.id === sourceId);
              if (!sourceNode) continue;
              // Stop at start nodes, condition nodes, other scheduler nodes, or checkpoint nodes
              // These are control boundaries — don't re-execute them
              if (['start', 'condition', 'checkpoint'].includes(sourceNode.type)) continue;
              if (sourceNode.type === 'scheduler' && sourceId !== nodeId) continue;
              upstreamToReset.add(sourceId);
              bfsQueue.push(sourceId);
            }
          }

          // Reset the scheduler node itself to pending (so it gets re-dispatched)
          nodeStates[nodeId] = { status: 'pending' };
          // Reset upstream nodes to pending
          for (const resetId of Array.from(upstreamToReset)) {
            nodeStates[resetId] = { status: 'pending' };
          }
          // Also un-skip any nodes on the output-true branch that were skipped
          const trueBranchTargets = edges
            .filter(e => e.source === nodeId && e.sourceHandle === 'output-true')
            .map(e => e.target);
          for (const tbId of trueBranchTargets) {
            if (nodeStates[tbId]?.status === 'skipped') {
              nodeStates[tbId] = { status: 'pending' };
            }
          }

          saveNodeStates(runId, nodeId, nodeStates);
          logger.info('canvas', `Scheduler ciclo: reiniciando nodos para siguiente iteracion`, {
            runId, nodeId, upstreamCount: upstreamToReset.size,
          });

          // Continue the for-loop from the top of executionOrder —
          // the loop will skip completed/skipped nodes and re-process pending ones.
          // Safest approach: recursive call to executeCanvas (same pattern as resumeAfterCheckpoint).
          executeCanvas(canvasId, runId).catch(err => {
            logger.error('canvas', `Error en ciclo de scheduler ${runId}`, { error: (err as Error).message });
          });
          return; // Current invocation ends; recursive call continues execution
        }

        // Special handling: ITERATOR_END — loop control (ITER-02)
        if (node.type === 'iterator_end') {
          const iteratorId = (node.data.iteratorId as string) || '';
          if (iteratorId) {
            const runRowIE = db.prepare('SELECT metadata FROM canvas_runs WHERE id = ?').get(runId) as
              | { metadata: string | null }
              | undefined;
            const metaIE = JSON.parse(runRowIE?.metadata || '{}');
            const iterState = metaIE.iterator_state?.[iteratorId];

            if (iterState) {
              // Accumulate result from this iteration
              iterState.results.push(result.output);
              iterState.currentIndex++;

              // Check limits
              const iteratorNode = nodes.find(n => n.id === iteratorId);
              const iterData = iteratorNode?.data as Record<string, unknown> | undefined;
              const limitMode = (iterData?.limit_mode as string) || 'none';
              let limitReached = false;

              if (limitMode === 'rounds') {
                const maxRounds = (iterData?.max_rounds as number) || 10;
                if (iterState.currentIndex >= maxRounds) limitReached = true;
              } else if (limitMode === 'time') {
                const maxTime = ((iterData?.max_time as number) || 300) * 1000;
                const elapsed = Date.now() - new Date(iterState.startedAt).getTime();
                if (elapsed >= maxTime) limitReached = true;
              }

              const hasMoreItems = iterState.currentIndex < iterState.items.length;

              if (hasMoreItems && !limitReached) {
                // --- Continue loop: reset inner nodes + iterator, re-execute ---
                db.prepare('UPDATE canvas_runs SET metadata = ? WHERE id = ?')
                  .run(JSON.stringify(metaIE), runId);

                // Find all nodes between ITERATOR and ITERATOR_END (the loop body)
                const innerNodes = getNodesBetween(iteratorId, nodeId, nodes, edges);

                // Reset iterator + inner nodes + iterator_end to pending
                nodeStates[iteratorId] = { status: 'pending' };
                for (const innerId of innerNodes) {
                  nodeStates[innerId] = { status: 'pending' };
                }
                nodeStates[nodeId] = { status: 'pending' };

                // Un-skip element branch targets from iterator
                const elementTargets = edges
                  .filter(e => e.source === iteratorId && e.sourceHandle === 'element')
                  .map(e => e.target);
                for (const etId of elementTargets) {
                  if (nodeStates[etId]?.status === 'skipped') {
                    nodeStates[etId] = { status: 'pending' };
                  }
                }

                saveNodeStates(runId, nodeId, nodeStates);
                logger.info('canvas', `Iterator loop: resetting for item ${iterState.currentIndex + 1}/${iterState.items.length}`, {
                  runId, iteratorId, currentIndex: iterState.currentIndex,
                });

                executeCanvas(canvasId, runId).catch(err => {
                  logger.error('canvas', `Error en iteracion ${runId}`, { error: (err as Error).message });
                });
                return; // Current invocation ends; recursive call continues
              }

              // --- Loop finished: set final output on ITERATOR_END ---
              db.prepare('UPDATE canvas_runs SET metadata = ? WHERE id = ?')
                .run(JSON.stringify(metaIE), runId);

              // Override ITERATOR_END output with accumulated results
              nodeStates[nodeId] = {
                ...nodeStates[nodeId],
                status: 'completed',
                output: JSON.stringify(iterState.results),
                completed_at: new Date().toISOString(),
              };

              // Mark ITERATOR as completed with accumulated results too
              nodeStates[iteratorId] = {
                ...nodeStates[iteratorId],
                status: 'completed',
                output: JSON.stringify(iterState.results),
                completed_at: new Date().toISOString(),
              };

              saveNodeStates(runId, nodeId, nodeStates);
              logger.info('canvas', `Iterator loop completed: ${iterState.results.length} results`, {
                runId, iteratorId,
              });

              // Continue execution normally — downstream nodes of ITERATOR_END will run
            }
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error ? err.stack : undefined;
        logger.error('canvas', `Nodo ${nodeId} (${node.type}) fallo en run ${runId}`, {
          error: errorMsg, stack: errorStack, canvasId, nodeId, nodeType: node.type,
        });

        // ITER-03: If this node is inside an iterator loop, capture error and continue to next iteration
        const insideIterator = isNodeInsideIteratorLoop(nodeId, nodes, edges);
        if (insideIterator) {
          const { iteratorId, iteratorEndId } = insideIterator;
          const runRowErr = db.prepare('SELECT metadata FROM canvas_runs WHERE id = ?').get(runId) as
            | { metadata: string | null }
            | undefined;
          const metaErr = JSON.parse(runRowErr?.metadata || '{}');
          const iterState = metaErr.iterator_state?.[iteratorId];

          if (iterState) {
            // Push error result for this iteration
            iterState.results.push(JSON.stringify({
              status: 'error',
              error_detail: errorMsg,
              original_item: iterState.items[iterState.currentIndex],
            }));
            iterState.currentIndex++;

            const hasMoreItems = iterState.currentIndex < iterState.items.length;
            // Check limits
            const iteratorNode = nodes.find(n => n.id === iteratorId);
            const iterData = iteratorNode?.data as Record<string, unknown> | undefined;
            const limitMode = (iterData?.limit_mode as string) || 'none';
            let limitReached = false;
            if (limitMode === 'rounds') {
              const maxRounds = (iterData?.max_rounds as number) || 10;
              if (iterState.currentIndex >= maxRounds) limitReached = true;
            } else if (limitMode === 'time') {
              const maxTime = ((iterData?.max_time as number) || 300) * 1000;
              const elapsed = Date.now() - new Date(iterState.startedAt).getTime();
              if (elapsed >= maxTime) limitReached = true;
            }

            if (hasMoreItems && !limitReached) {
              // Reset loop nodes and continue to next iteration
              db.prepare('UPDATE canvas_runs SET metadata = ? WHERE id = ?')
                .run(JSON.stringify(metaErr), runId);

              const innerNodes = getNodesBetween(iteratorId, iteratorEndId, nodes, edges);
              nodeStates[iteratorId] = { status: 'pending' };
              for (const innerId of innerNodes) {
                nodeStates[innerId] = { status: 'pending' };
              }
              nodeStates[iteratorEndId] = { status: 'pending' };

              saveNodeStates(runId, nodeId, nodeStates);
              logger.info('canvas', `Iterator: error in iteration ${iterState.currentIndex}, continuing to next item`, {
                runId, iteratorId, error: errorMsg,
              });

              executeCanvas(canvasId, runId).catch(e => {
                logger.error('canvas', `Error continuing iterator after failure`, { error: (e as Error).message });
              });
              return;
            }

            // Loop finished (with partial errors) — set accumulated results
            db.prepare('UPDATE canvas_runs SET metadata = ? WHERE id = ?')
              .run(JSON.stringify(metaErr), runId);

            nodeStates[iteratorEndId] = {
              status: 'completed',
              output: JSON.stringify(iterState.results),
              completed_at: new Date().toISOString(),
            };
            nodeStates[iteratorId] = {
              status: 'completed',
              output: JSON.stringify(iterState.results),
              completed_at: new Date().toISOString(),
            };
            // Mark the failed node as failed (but don't abort the run)
            nodeStates[nodeId] = {
              ...nodeStates[nodeId],
              status: 'failed',
              error: errorMsg,
              completed_at: new Date().toISOString(),
            };
            saveNodeStates(runId, nodeId, nodeStates);

            logger.info('canvas', `Iterator loop finished with partial errors, continuing downstream`, { runId, iteratorId });

            executeCanvas(canvasId, runId).catch(e => {
              logger.error('canvas', `Error continuing after iterator completion`, { error: (e as Error).message });
            });
            return;
          }
        }

        // Default: fail the entire run
        nodeStates[nodeId] = {
          ...nodeStates[nodeId],
          status: 'failed',
          error: errorMsg,
          completed_at: new Date().toISOString(),
        };
        saveNodeStates(runId, nodeId, nodeStates);
        db.prepare("UPDATE canvas_runs SET status = 'failed', completed_at = ? WHERE id = ?").run(
          new Date().toISOString(),
          runId
        );
        createNotification({
          type: 'canvas',
          title: `Error en ejecucion de canvas`,
          message: `Nodo ${node.type} fallido: ${errorMsg}`.slice(0, 200),
          severity: 'error',
          link: `/canvas/${canvasId}`,
        });
        runningExecutors.delete(runId);
        return;
      }
    }

    // All nodes completed
    const totalDuration = Date.now() - startTime;
    db.prepare("UPDATE canvas_runs SET status = 'completed', completed_at = ?, total_duration = ?, total_tokens = ? WHERE id = ?").run(
      new Date().toISOString(),
      totalDuration,
      totalTokens,
      runId
    );

    createNotification({
      type: 'canvas',
      title: `Canvas ejecutado correctamente`,
      message: `Ejecucion completada en ${totalDuration}ms con ${totalTokens} tokens`,
      severity: 'success',
      link: `/canvas/${canvasId}`,
    });

    logger.info('canvas', `Canvas run ${runId} completado`, { totalTokens, totalDuration });
  } catch (err) {
    logger.error('canvas', `Error en run ${runId}`, { error: (err as Error).message, stack: (err as Error).stack });
    db.prepare("UPDATE canvas_runs SET status = 'failed', completed_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      runId
    );
    createNotification({
      type: 'canvas',
      title: `Error en ejecucion de canvas`,
      message: `Error: ${(err as Error).message}`.slice(0, 200),
      severity: 'error',
      link: `/canvas/${canvasId}`,
    });
  } finally {
    runningExecutors.delete(runId);
  }
}

// --- Cancel Execution ---

export function cancelExecution(runId: string): void {
  const state = runningExecutors.get(runId);
  if (state) {
    state.cancelled = true;
  }
  // Update DB immediately
  db.prepare("UPDATE canvas_runs SET status = 'cancelled', completed_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    runId
  );
}

// --- Resume After Checkpoint ---

export async function resumeAfterCheckpoint(
  runId: string,
  checkpointNodeId: string,
  approved: boolean,
  feedback?: string
): Promise<void> {
  const run = db.prepare('SELECT canvas_id, node_states, execution_order FROM canvas_runs WHERE id = ?').get(runId) as
    | { canvas_id: string; node_states: string; execution_order: string }
    | undefined;
  if (!run) return;

  const nodeStates: NodeStates = JSON.parse(run.node_states);

  if (approved) {
    // Mark checkpoint as completed
    nodeStates[checkpointNodeId] = {
      ...nodeStates[checkpointNodeId],
      status: 'completed',
      completed_at: new Date().toISOString(),
    };
    db.prepare('UPDATE canvas_runs SET node_states = ?, status = ? WHERE id = ?').run(
      JSON.stringify(nodeStates),
      'running',
      runId
    );
  } else {
    // Find predecessor via incoming edge
    const canvas = db.prepare('SELECT flow_data FROM canvases WHERE id = ?').get(run.canvas_id) as
      | { flow_data: string }
      | undefined;
    if (!canvas) return;

    const flowData = JSON.parse(canvas.flow_data) as { nodes: CanvasNode[]; edges: CanvasEdge[] };
    const incomingEdge = flowData.edges.find(e => e.target === checkpointNodeId);

    if (incomingEdge) {
      // Reset predecessor to pending with feedback
      nodeStates[incomingEdge.source] = {
        status: 'pending',
        feedback: feedback || '',
      };
    }

    // Reset checkpoint to pending
    nodeStates[checkpointNodeId] = { status: 'pending' };

    db.prepare('UPDATE canvas_runs SET node_states = ?, status = ? WHERE id = ?').run(
      JSON.stringify(nodeStates),
      'running',
      runId
    );
  }

  // Resume execution fire-and-forget
  executeCanvas(run.canvas_id, runId).catch(err => {
    logger.error('canvas', `Error resumiendo run ${runId}`, { error: (err as Error).message });
  });
}

// --- Resume After Signal (Scheduler Listen Mode) ---

/**
 * Resume execution after a signal is received for a scheduler node in listen mode.
 * Similar to resumeAfterCheckpoint but for scheduler signal-based flow.
 */
export async function resumeAfterSignal(
  runId: string,
  schedulerNodeId: string,
  signal: boolean
): Promise<void> {
  const run = db.prepare('SELECT canvas_id, node_states, execution_order, metadata FROM canvas_runs WHERE id = ?').get(runId) as
    | { canvas_id: string; node_states: string; execution_order: string; metadata: string | null }
    | undefined;
  if (!run) return;

  const nodeStates: NodeStates = JSON.parse(run.node_states);
  const outputHandle = signal ? 'output-true' : 'output-false';

  // Mark scheduler node as completed with chosen output handle
  nodeStates[schedulerNodeId] = {
    ...nodeStates[schedulerNodeId],
    status: 'completed',
    output: outputHandle,
    completed_at: new Date().toISOString(),
  };

  // Load canvas to get edges for branch skipping
  const canvas = db.prepare('SELECT flow_data FROM canvases WHERE id = ?').get(run.canvas_id) as
    | { flow_data: string }
    | undefined;
  if (canvas) {
    const flowData = JSON.parse(canvas.flow_data) as { nodes: CanvasNode[]; edges: CanvasEdge[] };
    const skippedNodeIds = getSkippedNodes(schedulerNodeId, outputHandle, flowData.nodes, flowData.edges, nodeStates);
    for (const skippedId of skippedNodeIds) {
      nodeStates[skippedId] = { status: 'skipped' };
    }
  }

  // Clean up scheduler_waiting metadata
  const metadata = JSON.parse(run.metadata || '{}');
  if (metadata.scheduler_waiting) {
    delete metadata.scheduler_waiting[schedulerNodeId];
  }

  db.prepare('UPDATE canvas_runs SET node_states = ?, status = ?, metadata = ? WHERE id = ?').run(
    JSON.stringify(nodeStates),
    'running',
    JSON.stringify(metadata),
    runId
  );

  // Resume execution fire-and-forget
  executeCanvas(run.canvas_id, runId).catch(err => {
    logger.error('canvas', `Error resumiendo run ${runId} despues de signal`, { error: (err as Error).message });
  });
}

/** Find the text of the first instruction block in a template structure */
function findFirstInstructionKey(structure: TemplateStructure): string | null {
  for (const section of Object.values(structure.sections)) {
    for (const row of section.rows) {
      for (const col of row.columns) {
        if (col.block.type === 'instruction' && col.block.text) {
          return col.block.text;
        }
      }
    }
  }
  return null;
}
