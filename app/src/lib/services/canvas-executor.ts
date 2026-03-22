import db from '@/lib/db';
import { qdrant } from '@/lib/services/qdrant';
import { ollama } from '@/lib/services/ollama';
import { logUsage } from '@/lib/services/usage-tracker';
import { logger } from '@/lib/logger';
import { createNotification } from '@/lib/services/notifications';
import { executeCatBrain } from './execute-catbrain';
import { executeCatPaw } from './execute-catpaw';
import { executeWebSearch } from './execute-websearch';
import { executeTaskWithCycles } from './task-executor';
import { sendEmail } from '@/lib/services/email-service';
import { GmailConfig } from '@/lib/types';
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

// --- Helper: Get predecessor output for a node ---

function getPredecessorOutput(nodeId: string, edges: CanvasEdge[], nodeStates: NodeStates): string {
  const incomingEdge = edges.find(e => e.target === nodeId);
  if (!incomingEdge) return '';
  return nodeStates[incomingEdge.source]?.output || '';
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
    const incomingEdges = edges.filter(e => e.target === nodeId);
    const hasNonSkippedParent = incomingEdges.some(
      e => e.source !== branchNodeId &&
        !skipped.includes(e.source) &&
        nodeStates[e.source]?.status !== 'skipped'
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
          const pawResult = await executeCatPaw(agentId, pawInput);

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

      // Gmail connector: send email with predecessor output as payload
      if ((connector.type as string) === 'gmail') {
        const gmailConfig: GmailConfig = connector.config ? JSON.parse(connector.config as string) : {};
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

      const connConfig = connector.config ? JSON.parse(connector.config as string) : {};
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
      let output = predecessorOutput;
      const format = data.format as string | undefined;
      if (format === 'json') {
        try {
          output = JSON.stringify(JSON.parse(predecessorOutput), null, 2);
        } catch {
          // Fallback to raw
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

      // Validate target exists and has listen_mode=1
      const target = db.prepare('SELECT id, listen_mode FROM tasks WHERE id = ?').get(targetTaskId) as { id: string; listen_mode: number } | undefined;
      if (!target) {
        return { output: 'ERROR: Target CatFlow not found' };
      }
      if (target.listen_mode !== 1) {
        return { output: 'ERROR: Target CatFlow is not in listen mode' };
      }

      // MA-05: Resolve payload template variables
      const payload = payloadTemplate
        .replace(/\{input\}/g, predecessorOutput)
        .replace(/\{context\}/g, predecessorOutput)
        .replace(/\{run_id\}/g, runId);

      // Get source task ID from canvas
      const canvasRow = db.prepare('SELECT task_id FROM canvases WHERE id = ?').get(canvasId) as { task_id?: string } | undefined;
      const sourceTaskId = canvasRow?.task_id || canvasId;

      // Create trigger directly in DB (CRITICAL: no fetch to own API)
      const triggerId = generateId();
      db.prepare(
        `INSERT INTO catflow_triggers (id, source_task_id, source_run_id, source_node_id, target_task_id, payload, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`
      ).run(triggerId, sourceTaskId, runId, node.id, targetTaskId, payload);

      // Set external_input on target task
      db.prepare('UPDATE tasks SET external_input = ? WHERE id = ?').run(payload, targetTaskId);

      // Update to running
      db.prepare("UPDATE catflow_triggers SET status = 'running' WHERE id = ?").run(triggerId);

      logger.info('canvas', 'MultiAgent node: trigger created', {
        canvasId, runId, nodeId: node.id, triggerId, targetTaskId, mode,
      });

      // MA-07: Async mode -- fire and forget
      if (mode === 'async') {
        executeTaskWithCycles(targetTaskId).catch(err => {
          logger.error('canvas', 'MultiAgent async: target execution failed', {
            triggerId, targetTaskId, error: (err as Error).message,
          });
          db.prepare("UPDATE catflow_triggers SET status = 'failed', response = ?, completed_at = datetime('now') WHERE id = ?")
            .run((err as Error).message, triggerId);
        });
        return { output: JSON.stringify({ trigger_id: triggerId, status: 'running' }) };
      }

      // MA-06: Sync mode -- await execution, then check result
      try {
        const timeoutMs = timeout * 1000;

        // Await the target execution (executeTaskWithCycles resolves when done)
        const execPromise = executeTaskWithCycles(targetTaskId);

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
          logger.warn('canvas', 'MultiAgent sync: timeout', { triggerId, targetTaskId, timeout });
          return { output: `ERROR: Timeout after ${timeout}s waiting for CatFlow response` };
        }

        // MA-09: Check trigger response (target task may have updated it via /complete endpoint)
        // Also check the task's latest run for output
        const trigger = db.prepare('SELECT status, response FROM catflow_triggers WHERE id = ?').get(triggerId) as { status: string; response: string | null } | undefined;

        // If trigger was marked completed/failed by the target
        if (trigger?.status === 'completed') {
          return { output: trigger.response || 'Completed' };
        }
        if (trigger?.status === 'failed') {
          return { output: `ERROR: ${trigger.response || 'Target CatFlow failed'}` };
        }

        // If trigger still shows running, check the task's latest execution for output
        const latestRun = db.prepare(
          "SELECT status, output FROM task_executions WHERE task_id = ? ORDER BY created_at DESC LIMIT 1"
        ).get(targetTaskId) as { status: string; output: string | null } | undefined;

        if (latestRun) {
          const response = latestRun.output || 'Completed';
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

    default: {
      return { output: predecessorOutput };
    }
  }
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

        // Special handling: MULTIAGENT node marks non-chosen branch as skipped
        if (node.type === 'multiagent') {
          const chosenBranch = result.output.startsWith('ERROR:') ? 'output-error' : 'output-response';
          const skippedNodeIds = getSkippedNodes(nodeId, chosenBranch, nodes, edges, nodeStates);
          for (const skippedId of skippedNodeIds) {
            nodeStates[skippedId] = { status: 'skipped' };
          }
        }

        // Mark completed
        const tokens = result.tokens || 0;
        totalTokens += tokens;
        nodeStates[nodeId] = {
          status: 'completed',
          output: result.output,
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
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
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
          message: `Nodo fallido durante la ejecucion: ${errorMsg}`.slice(0, 200),
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
    logger.error('canvas', `Error en run ${runId}`, { error: (err as Error).message });
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
