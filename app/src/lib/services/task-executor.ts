import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { logUsage } from '@/lib/services/usage-tracker';
import { logger } from '@/lib/logger';
import { createNotification } from '@/lib/services/notifications';
import { litellm } from '@/lib/services/litellm';
import { executeCatBrain } from './execute-catbrain';
import { executeCatPaw } from './execute-catpaw';
import { executeCanvas, topologicalSort } from '@/lib/services/canvas-executor';
import type { CanvasNode, CanvasEdge } from '@/lib/services/canvas-executor';
import { generateId } from '@/lib/utils';
import { executeWebSearch } from './execute-websearch';
import type { CatBrainInput } from '@/lib/types/catbrain';
import type { CatPawInput } from '@/lib/types/catpaw';

// In-memory map of running task IDs (to support cancel)
const runningTasks = new Map<string, { cancelled: boolean }>();

// --- Helper: Call LLM via LiteLLM ---
async function callLLM(model: string, systemPrompt: string, userContent: string): Promise<{ output: string; tokens: number; input_tokens: number; output_tokens: number }> {
  // Validate model exists in LiteLLM before calling
  model = await litellm.resolveModel(model || 'gemini-main');
  const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
  const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';

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
  };
}

// --- Helper: Get skill instructions ---
function getSkillInstructions(skillIds: string[]): string {
  const instructions: string[] = [];
  for (const sid of skillIds) {
    const skill = db.prepare('SELECT name, instructions FROM skills WHERE id = ?').get(sid) as { name: string; instructions: string } | undefined;
    if (skill) {
      instructions.push(`### ${skill.name}\n${skill.instructions}`);
    }
  }
  return instructions.join('\n\n');
}

// --- Helper: Build context for a step ---
function buildStepContext(step: StepRow, allSteps: StepRow[]): string {
  const previousSteps = allSteps.filter(s => s.order_index < step.order_index && s.status === 'completed' && s.output);

  switch (step.context_mode) {
    case 'previous': {
      const prev = previousSteps[previousSteps.length - 1];
      return prev?.output || '';
    }
    case 'all':
      return previousSteps.map((s, i) => `[Paso ${i + 1}: ${s.name || s.type}]\n${s.output}`).join('\n\n---\n\n');
    case 'manual':
      return step.context_manual || '';
    case 'rag':
      return ''; // RAG context is added separately
    default:
      return previousSteps[previousSteps.length - 1]?.output || '';
  }
}

// Use a simple interface instead of importing the full type
interface StepRow {
  id: string;
  task_id: string;
  order_index: number;
  type: string;
  name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_model: string | null;
  instructions: string | null;
  context_mode: string;
  context_manual: string | null;
  rag_query: string | null;
  use_project_rag: number; // legacy column name, refers to catbrain RAG
  skill_ids: string | null;
  status: string;
  output: string | null;
  tokens_used: number;
  duration_seconds: number;
  started_at: string | null;
  completed_at: string | null;
  human_feedback: string | null;
  connector_config: string | null;
  canvas_id: string | null;
  fork_group: string | null;
  branch_index: number | null;
  branch_label: string | null;
}

// --- Helper: Execute connectors before/after agent steps ---
async function executeConnectors(
  connectorConfigs: Array<{ connector_id: string; mode: string }>,
  mode: 'before' | 'after',
  payload: Record<string, unknown>,
  taskId: string,
  stepId: string,
  agentId: string | null
): Promise<string[]> {
  const results: string[] = [];
  const configs = connectorConfigs.filter(c => c.mode === mode || c.mode === 'both');

  for (const cc of configs) {
    const connector = db.prepare('SELECT * FROM connectors WHERE id = ? AND is_active = 1').get(cc.connector_id) as Record<string, unknown> | undefined;
    if (!connector) continue;

    const config = connector.config ? JSON.parse(connector.config as string) : {};
    const startTime = Date.now();
    let status = 'success';
    let responsePayload = '';
    let errorMessage: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), (config.timeout || 30) * 1000);

      const fetchOptions: RequestInit = {
        method: config.method || 'POST',
        headers: { 'Content-Type': 'application/json', ...(config.headers || {}) },
        body: JSON.stringify(payload),
        signal: controller.signal
      };

      const res = await fetch(config.url, fetchOptions);
      clearTimeout(timeout);

      const text = await res.text();
      responsePayload = text.substring(0, 5000);

      if (!res.ok) {
        status = 'failed';
        errorMessage = `HTTP ${res.status}: ${res.statusText}`;
      } else {
        results.push(responsePayload);
      }
    } catch (err) {
      status = (err as Error).name === 'AbortError' ? 'timeout' : 'failed';
      errorMessage = (err as Error).message;
    }

    const durationMs = Date.now() - startTime;

    // Log invocation (CPIPE-05)
    try {
      db.prepare(`
        INSERT INTO connector_logs (id, connector_id, task_id, task_step_id, agent_id, request_payload, response_payload, status, duration_ms, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(), cc.connector_id, taskId, stepId, agentId,
        JSON.stringify(payload).substring(0, 5000),
        responsePayload,
        status, durationMs, errorMessage
      );
    } catch (logErr) {
      logger.error('tasks', 'Error logging connector invocation', { error: (logErr as Error).message });
    }

    // Increment times_used
    try {
      db.prepare('UPDATE connectors SET times_used = times_used + 1, updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), cc.connector_id);
    } catch (updateErr) {
      logger.error('tasks', 'Error updating connector times_used', { error: (updateErr as Error).message });
    }

    // Log usage (USAGE-06)
    logUsage({
      event_type: 'connector_call',
      task_id: taskId,
      agent_id: agentId || null,
      duration_ms: durationMs,
      status: status === 'success' ? 'success' : 'failed',
      metadata: { connector_id: cc.connector_id, connector_type: (connector.type as string) || 'unknown' }
    });
  }

  return results;
}

// --- Main: Execute a task pipeline ---
export async function executeTask(taskId: string): Promise<void> {
  const state = { cancelled: false };
  runningTasks.set(taskId, state);

  try {
    // Mark task as running
    const now = new Date().toISOString();
    db.prepare("UPDATE tasks SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?").run(now, now, taskId);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as { id: string; name: string; expected_output: string | null; linked_projects: string | null } | undefined;
    if (!task) throw new Error('Tarea no encontrada');

    const linkedProjects: string[] = task.linked_projects ? JSON.parse(task.linked_projects) : []; // legacy column name, stores catbrain IDs
    const steps = db.prepare('SELECT * FROM task_steps WHERE task_id = ? ORDER BY order_index ASC').all(taskId) as StepRow[];

    if (steps.length === 0) throw new Error('La tarea no tiene pasos configurados');

    let totalTokens = 0;
    const startTime = Date.now();
    const processedForkGroups = new Set<string>();

    for (const step of steps) {
      // Skip steps that belong to an already-processed fork group
      if (step.fork_group && processedForkGroups.has(step.fork_group)) {
        continue;
      }

      // Check if cancelled
      if (state.cancelled) {
        db.prepare("UPDATE tasks SET status = 'failed', updated_at = datetime('now') WHERE id = ?").run(taskId);
        return;
      }

      // Skip already completed steps (for retry scenarios)
      if (step.status === 'completed') continue;

      // Mark step as running
      db.prepare("UPDATE task_steps SET status = 'running', started_at = ? WHERE id = ?").run(new Date().toISOString(), step.id);

      try {
        if (step.type === 'agent') {
          await executeAgentStep(step, steps, task, linkedProjects);
        } else if (step.type === 'checkpoint') {
          // Pause execution — the step stays as 'running' (waiting for approval)
          // The approve/reject endpoints will resume execution
          db.prepare("UPDATE tasks SET status = 'paused', updated_at = datetime('now') WHERE id = ?").run(taskId);
          runningTasks.delete(taskId);
          return; // Exit the loop — execution resumes when checkpoint is approved
        } else if (step.type === 'merge') {
          await executeMergeStep(step, steps, task);
        } else if (step.type === 'canvas') {
          await executeCanvasStep(step, steps, taskId);
        } else if (step.type === 'fork') {
          await executeForkJoin(step, steps, task, linkedProjects, taskId, state);
          processedForkGroups.add(step.fork_group!);
        }

        // Accumulate tokens
        const updatedStep = db.prepare('SELECT tokens_used FROM task_steps WHERE id = ?').get(step.id) as { tokens_used: number };
        totalTokens += updatedStep.tokens_used || 0;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        db.prepare("UPDATE task_steps SET status = 'failed', output = ?, completed_at = ? WHERE id = ?")
          .run(`[ERROR] ${errorMsg}`, new Date().toISOString(), step.id);
        db.prepare("UPDATE tasks SET status = 'failed', updated_at = datetime('now') WHERE id = ?").run(taskId);
        createNotification({
          type: 'task',
          title: `Tarea fallida: ${task.name}`,
          message: `Error en paso ${step.name || step.type}: ${errorMsg}`.slice(0, 200),
          severity: 'error',
          link: `/tasks/${taskId}`,
        });
        runningTasks.delete(taskId);
        return;
      }
    }

    // All steps completed
    const lastStep = steps[steps.length - 1];
    const finalOutput = db.prepare('SELECT output FROM task_steps WHERE id = ?').get(lastStep.id) as { output: string | null };
    const totalDuration = Math.round((Date.now() - startTime) / 1000);

    db.prepare("UPDATE tasks SET status = 'completed', result_output = ?, total_tokens = ?, total_duration = ?, completed_at = ?, updated_at = ? WHERE id = ?")
      .run(finalOutput?.output || '', totalTokens, totalDuration, new Date().toISOString(), new Date().toISOString(), taskId);

    createNotification({
      type: 'task',
      title: `Tarea completada: ${task.name}`,
      message: `Se completaron ${steps.length} pasos en ${totalDuration}s`,
      severity: 'success',
      link: `/tasks/${taskId}`,
    });

    logger.info('tasks', `Tarea ${taskId} completada`, { totalTokens, totalDuration });
  } catch (err) {
    logger.error('tasks', `Error en tarea ${taskId}`, { error: (err as Error).message });
    db.prepare("UPDATE tasks SET status = 'failed', updated_at = datetime('now') WHERE id = ?").run(taskId);
    createNotification({
      type: 'task',
      title: `Tarea fallida`,
      message: `Error: ${(err as Error).message}`.slice(0, 200),
      severity: 'error',
      link: `/tasks/${taskId}`,
    });
  } finally {
    runningTasks.delete(taskId);
  }
}

// --- Execute an agent step ---
async function executeAgentStep(
  step: StepRow,
  allSteps: StepRow[],
  task: { name: string; expected_output: string | null; linked_projects: string | null },
  linkedProjects: string[]
): Promise<void> {
  const stepStart = Date.now();

  // 0. Check if agent_id points to a CatPaw (EXEC-04)
  if (step.agent_id) {
    const catPaw = db.prepare('SELECT id FROM cat_paws WHERE id = ? AND is_active = 1').get(step.agent_id) as { id: string } | undefined;
    if (catPaw) {
      // Route through executeCatPaw — it handles RAG, connectors, LLM, usage logging internally
      const previousContext = buildStepContext(step, allSteps);
      const pawInput: CatPawInput = {
        query: step.instructions || step.name || task.name,
        context: previousContext || undefined,
      };
      const pawOutput = await executeCatPaw(step.agent_id, pawInput);

      // Save result (same pattern as existing agent step completion)
      const duration = Math.round((Date.now() - stepStart) / 1000);
      db.prepare("UPDATE task_steps SET status = 'completed', output = ?, tokens_used = ?, duration_seconds = ?, completed_at = ? WHERE id = ?")
        .run(pawOutput.answer, pawOutput.tokens_used || 0, duration, new Date().toISOString(), step.id);
      db.prepare("UPDATE tasks SET updated_at = datetime('now') WHERE id = ?").run(step.task_id);

      // Usage already logged inside executeCatPaw — log task_step event additionally
      logUsage({
        event_type: 'task_step',
        task_id: step.task_id,
        agent_id: step.agent_id,
        model: pawOutput.model_used || step.agent_model || 'unknown',
        input_tokens: pawOutput.input_tokens || 0,
        output_tokens: pawOutput.output_tokens || 0,
        total_tokens: pawOutput.tokens_used || 0,
        duration_ms: Date.now() - stepStart,
        status: 'success',
        metadata: { step_name: step.name, step_index: step.order_index, via: 'executeCatPaw' },
      });

      return; // Skip the rest of executeAgentStep — CatPaw handled everything
    }
    // If not found in cat_paws, fall through to existing custom_agents logic
  }

  // 1. Build context from previous steps
  const previousContext = buildStepContext(step, allSteps);

  // 2. WebSearch CatBrain execution (WSCB-07) — separate websearch from regular catbrains
  let webSearchContext = '';
  const remainingProjects: string[] = [];
  for (const catbrainId of linkedProjects) {
    if (catbrainId === 'seed-catbrain-websearch') {
      try {
        const searchQuery = step.instructions || step.name || task.name || 'informacion general';
        const wsRow = db.prepare('SELECT search_engine FROM catbrains WHERE id = ?').get(catbrainId) as { search_engine: string | null } | undefined;
        const engine = wsRow?.search_engine || 'auto';
        const wsResult = await executeWebSearch(searchQuery.slice(0, 500), engine);
        webSearchContext = wsResult.answer;
        logUsage({
          event_type: 'task_step',
          agent_id: null,
          model: `websearch:${wsResult.engine}`,
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          duration_ms: wsResult.duration_ms,
          status: 'success',
          metadata: { task_id: step.task_id, step_index: step.order_index, node_type: 'websearch' },
        });
      } catch (e) {
        logger.error('websearch', 'WebSearch in task step failed', { error: (e as Error).message });
      }
    } else {
      remainingProjects.push(catbrainId);
    }
  }

  // Execute remaining linked CatBrains via executeCatBrain (handles RAG + connectors + system prompt internally)
  let catbrainContext = '';
  if (remainingProjects.length > 0) {
    for (const catbrainId of remainingProjects) {
      try {
        const cbInput: CatBrainInput = {
          query: step.rag_query || step.instructions?.substring(0, 200) || step.name || task.name,
          mode: step.use_project_rag ? 'both' : 'connector',
        };
        const cbOutput = await executeCatBrain(catbrainId, cbInput);
        if (cbOutput.answer) {
          catbrainContext += (catbrainContext ? '\n\n' : '') + `[CatBrain: ${cbOutput.catbrain_name}]\n${cbOutput.answer}`;
        }
      } catch (err) {
        logger.error('tasks', `Error executing CatBrain ${catbrainId}`, { error: (err as Error).message });
      }
    }
  }

  // 3. Get skill instructions if any
  let skillsText = '';
  if (step.skill_ids) {
    try {
      const skillIds = JSON.parse(step.skill_ids) as string[];
      if (skillIds.length > 0) {
        skillsText = getSkillInstructions(skillIds);
      }
    } catch { /* invalid JSON */ }
  }

  // 4. Build the prompt (PROMPT-01)
  const systemParts: string[] = [];

  // Inject catbrain system_prompts first (personality/context comes before agent identity)
  if (remainingProjects.length > 0) {
    for (const catbrainId of remainingProjects) {
      const cb = db.prepare('SELECT system_prompt FROM catbrains WHERE id = ?').get(catbrainId) as { system_prompt: string | null } | undefined;
      if (cb?.system_prompt) {
        systemParts.push(cb.system_prompt);
      }
    }
  }

  systemParts.push(`Eres ${step.agent_name || 'un asistente experto'}. Responde siempre en espanol.`);

  if (skillsText) {
    systemParts.push(`\n--- SKILLS ---\n${skillsText}\n--- FIN SKILLS ---`);
  }

  const userParts: string[] = [];

  if (step.instructions) {
    userParts.push(`## Instrucciones\n${step.instructions}`);
  }

  if (previousContext) {
    userParts.push(`\n--- CONTEXTO DE PASOS ANTERIORES ---\n${previousContext}\n--- FIN CONTEXTO ---`);
  }

  if (catbrainContext) {
    userParts.push(`\n--- CONOCIMIENTO CATBRAIN ---\n${catbrainContext}\n--- FIN CONOCIMIENTO CATBRAIN ---`);
  }

  if (webSearchContext) {
    userParts.push(`\n--- RESULTADOS BUSQUEDA WEB ---\n${webSearchContext}\n--- FIN BUSQUEDA WEB ---`);
  }

  if (task.expected_output) {
    userParts.push(`\n## Resultado esperado\nEl usuario espera: ${task.expected_output}\nGenera tu aportacion para cumplir ese objetivo.`);
  }

  // 5. Check for human feedback from a rejected checkpoint (PROMPT-02)
  if (step.human_feedback) {
    userParts.push(`\n## FEEDBACK DEL USUARIO\n${step.human_feedback}\nRevisa y mejora tu respuesta teniendo en cuenta este feedback.`);
  }

  // 6. Parse connector_config and execute BEFORE connectors (CPIPE-02)
  const connectorConfigs: Array<{ connector_id: string; mode: string }> = step.connector_config
    ? JSON.parse(step.connector_config) : [];

  if (connectorConfigs.length > 0) {
    try {
      const beforePayload = {
        task_id: task.name ? step.task_id : step.task_id,
        task_name: task.name,
        step_index: step.order_index,
        step_name: step.name || '',
        agent_name: step.agent_name || '',
        output: '',
        metadata: { tokens_used: 0, model: step.agent_model || '', duration_seconds: 0 }
      };
      const beforeResults = await executeConnectors(connectorConfigs, 'before', beforePayload, step.task_id, step.id, step.agent_id);
      if (beforeResults.length > 0) {
        const connectorContext = beforeResults.map((r, i) => `[Connector ${i + 1} response]: ${r}`).join('\n\n');
        userParts.push(`\n--- DATOS DE CONECTORES EXTERNOS ---\n${connectorContext}\n--- FIN DATOS CONECTORES ---`);
      }
    } catch (connErr) {
      logger.error('tasks', 'Error executing BEFORE connectors', { error: (connErr as Error).message });
    }
  }

  // 7. Call LLM
  const model = step.agent_model || 'gemini-main';
  logger.info('tasks', `Paso "${step.name}" iniciado`, { model, stepId: step.id });

  const result = await callLLM(model, systemParts.join('\n'), userParts.join('\n\n'));

  // 8. Execute AFTER connectors (CPIPE-03)
  if (connectorConfigs.length > 0) {
    try {
      const durationSoFar = Math.round((Date.now() - stepStart) / 1000);
      const afterPayload = {
        task_id: step.task_id,
        task_name: task.name,
        step_index: step.order_index,
        step_name: step.name || '',
        agent_name: step.agent_name || '',
        output: result.output,
        metadata: {
          tokens_used: result.tokens,
          model: step.agent_model || model,
          duration_seconds: durationSoFar
        }
      };
      await executeConnectors(connectorConfigs, 'after', afterPayload, step.task_id, step.id, step.agent_id);
    } catch (connErr) {
      logger.error('tasks', 'Error executing AFTER connectors', { error: (connErr as Error).message });
    }
  }

  // 9. Save result
  const duration = Math.round((Date.now() - stepStart) / 1000);
  const durationMs = Date.now() - stepStart;
  db.prepare("UPDATE task_steps SET status = 'completed', output = ?, tokens_used = ?, duration_seconds = ?, completed_at = ? WHERE id = ?")
    .run(result.output, result.tokens, duration, new Date().toISOString(), step.id);

  db.prepare("UPDATE tasks SET updated_at = datetime('now') WHERE id = ?").run(step.task_id);

  // Log usage (USAGE-05)
  logUsage({
    event_type: 'task_step',
    task_id: step.task_id,
    agent_id: step.agent_id || null,
    model: model,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    total_tokens: result.tokens,
    duration_ms: durationMs,
    status: 'success',
    metadata: { step_name: step.name, step_index: step.order_index }
  });
}

// --- Execute a merge step ---
async function executeMergeStep(
  step: StepRow,
  allSteps: StepRow[],
  task: { name: string; expected_output: string | null }
): Promise<void> {
  const stepStart = Date.now();

  // Collect all previous outputs
  const previousSteps = allSteps.filter(s => s.order_index < step.order_index && s.status === 'completed' && s.output);
  const allOutputs = previousSteps.map((s, i) => `## Aporte ${i + 1}: ${s.name || s.type}\n${s.output}`).join('\n\n---\n\n');

  const systemPrompt = `Eres ${step.agent_name || 'un sintetizador experto'}. Tu tarea es combinar y sintetizar multiples aportes en un documento unificado y coherente. Responde siempre en espanol.`;

  const userContent = [
    step.instructions || 'Combina los siguientes aportes en un documento unificado coherente.',
    `\n--- APORTES A SINTETIZAR ---\n${allOutputs}\n--- FIN APORTES ---`,
    task.expected_output ? `\n## Resultado esperado\n${task.expected_output}` : '',
  ].filter(Boolean).join('\n\n');

  const model = step.agent_model || 'gemini-main';
  const result = await callLLM(model, systemPrompt, userContent);

  const duration = Math.round((Date.now() - stepStart) / 1000);
  const durationMs = Date.now() - stepStart;
  db.prepare("UPDATE task_steps SET status = 'completed', output = ?, tokens_used = ?, duration_seconds = ?, completed_at = ? WHERE id = ?")
    .run(result.output, result.tokens, duration, new Date().toISOString(), step.id);

  db.prepare("UPDATE tasks SET updated_at = datetime('now') WHERE id = ?").run(step.task_id);

  // Log usage (USAGE-05 - merge step)
  logUsage({
    event_type: 'task_step',
    task_id: step.task_id,
    agent_id: step.agent_id || null,
    model: model,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    total_tokens: result.tokens,
    duration_ms: durationMs,
    status: 'success',
    metadata: { step_name: step.name, step_type: 'merge', step_index: step.order_index }
  });
}

// --- Execute a canvas step (CANV-01 through CANV-07) ---
async function executeCanvasStep(
  step: StepRow,
  allSteps: StepRow[],
  taskId: string
): Promise<void> {
  const stepStart = Date.now();
  const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes (CANV-07)
  const POLL_INTERVAL_MS = 2000; // 2 seconds (CANV-04)

  if (!step.canvas_id) {
    throw new Error('Paso canvas sin canvas_id configurado');
  }

  // 1. Load the canvas and validate it exists (CANV-01)
  const canvas = db.prepare('SELECT id, flow_data FROM canvases WHERE id = ?').get(step.canvas_id) as
    | { id: string; flow_data: string | null }
    | undefined;

  if (!canvas) {
    throw new Error(`Canvas ${step.canvas_id} no encontrado`);
  }
  if (!canvas.flow_data) {
    throw new Error(`Canvas ${step.canvas_id} no tiene flow_data`);
  }

  // 2. Parse flow_data and inject previous step output as START node input (CANV-02)
  const flowData = JSON.parse(canvas.flow_data) as { nodes: CanvasNode[]; edges: CanvasEdge[] };
  const { nodes, edges } = flowData;

  const previousContext = buildStepContext(step, allSteps);
  if (previousContext) {
    const startNode = nodes.find(n => n.type === 'start');
    if (startNode) {
      startNode.data = { ...startNode.data, initialInput: previousContext };
    }
  }

  // 3. Compute topological order and initialize node states
  const executionOrder = topologicalSort(nodes, edges || []);
  const nodeStates: Record<string, { status: string }> = {};
  for (const node of nodes) {
    nodeStates[node.id] = { status: 'pending' };
  }

  // 4. Create canvas_run with parent metadata (CANV-03)
  const runId = generateId();
  const now = new Date().toISOString();
  const metadata = JSON.stringify({ parent_task_id: taskId, parent_step_id: step.id });

  db.prepare(`
    INSERT INTO canvas_runs (id, canvas_id, status, node_states, current_node_id, execution_order, total_tokens, total_duration, started_at, created_at, metadata)
    VALUES (?, ?, 'running', ?, NULL, ?, 0, 0, ?, ?, ?)
  `).run(runId, step.canvas_id, JSON.stringify(nodeStates), JSON.stringify(executionOrder), now, now, metadata);

  logger.info('tasks', `Canvas step started`, { taskId, stepId: step.id, canvasId: step.canvas_id, runId });

  // 5. Fire canvas execution (same pattern as canvas execute route)
  executeCanvas(step.canvas_id, runId).catch(err => {
    logger.error('tasks', 'Error ejecutando canvas desde tarea', { canvasId: step.canvas_id, runId, error: (err as Error).message });
  });

  // 6. Poll canvas_run.status every 2s until completed/failed (CANV-04)
  const result = await new Promise<{ output: string; tokens: number }>((resolve, reject) => {
    const poll = setInterval(() => {
      try {
        // Check timeout (CANV-07)
        if (Date.now() - stepStart > TIMEOUT_MS) {
          clearInterval(poll);
          try {
            db.prepare("UPDATE canvas_runs SET status = 'failed', completed_at = ? WHERE id = ?")
              .run(new Date().toISOString(), runId);
          } catch { /* best effort */ }
          reject(new Error('Canvas excedio el tiempo limite de 30 minutos'));
          return;
        }

        const run = db.prepare('SELECT status, node_states, total_tokens FROM canvas_runs WHERE id = ?').get(runId) as
          | { status: string; node_states: string; total_tokens: number }
          | undefined;

        if (!run) {
          clearInterval(poll);
          reject(new Error('Canvas run no encontrado'));
          return;
        }

        if (run.status === 'completed') {
          clearInterval(poll);
          // Extract OUTPUT node result (CANV-05)
          const states = JSON.parse(run.node_states) as Record<string, { status: string; output?: string; error?: string }>;
          const outputNode = nodes.find(n => n.type === 'output');
          const outputState = outputNode ? states[outputNode.id] : null;
          const output = outputState?.output || '';
          resolve({ output, tokens: run.total_tokens || 0 });
          return;
        }

        if (run.status === 'failed' || run.status === 'cancelled') {
          clearInterval(poll);
          // Extract error from failed node states (CANV-06)
          const states = JSON.parse(run.node_states) as Record<string, { status: string; output?: string; error?: string }>;
          const failedNode = Object.entries(states).find(([, s]) => s.status === 'failed');
          const errorMsg = failedNode ? (failedNode[1].error || failedNode[1].output || 'Error desconocido en canvas') : 'Canvas fallo';
          reject(new Error(errorMsg));
          return;
        }

        // 'running' or 'waiting' — keep polling
      } catch (pollErr) {
        clearInterval(poll);
        reject(pollErr);
      }
    }, POLL_INTERVAL_MS);
  });

  // 7. Save result
  const duration = Math.round((Date.now() - stepStart) / 1000);
  db.prepare("UPDATE task_steps SET status = 'completed', output = ?, tokens_used = ?, duration_seconds = ?, completed_at = ? WHERE id = ?")
    .run(result.output, result.tokens, duration, new Date().toISOString(), step.id);

  db.prepare("UPDATE tasks SET updated_at = datetime('now') WHERE id = ?").run(taskId);

  logUsage({
    event_type: 'task_step',
    task_id: taskId,
    agent_id: null,
    model: 'canvas',
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: result.tokens,
    duration_ms: Date.now() - stepStart,
    status: 'success',
    metadata: { step_name: step.name, step_type: 'canvas', canvas_id: step.canvas_id, run_id: runId, step_index: step.order_index },
  });
}

// --- Execute fork/join parallel branches (FORK-01 through FORK-08) ---
async function executeForkJoin(
  forkStep: StepRow,
  allSteps: StepRow[],
  task: { name: string; expected_output: string | null; linked_projects: string | null },
  linkedProjects: string[],
  taskId: string,
  taskState: { cancelled: boolean }
): Promise<void> {
  const forkGroup = forkStep.fork_group;
  if (!forkGroup) throw new Error('Paso fork sin fork_group configurado');

  // 1. Get pre-fork context — the output from the step before the fork (FORK-04)
  const preForkContext = buildStepContext(forkStep, allSteps);

  // Mark the fork step itself as completed (it's a routing step, no computation)
  db.prepare("UPDATE task_steps SET status = 'completed', output = ?, completed_at = ? WHERE id = ?")
    .run('Fork iniciado', new Date().toISOString(), forkStep.id);

  // 2. Identify branches and join step by fork_group (FORK-03)
  const forkGroupSteps = allSteps.filter(s => s.fork_group === forkGroup && s.id !== forkStep.id);
  const joinStep = forkGroupSteps.find(s => s.type === 'join');
  const branchSteps = forkGroupSteps.filter(s => s.type !== 'join');

  if (!joinStep) throw new Error('Fork sin paso join correspondiente');

  // Group by branch_index (FORK-01: 2 or 3 branches, FORK-02: up to 5 steps per branch)
  const branches = new Map<number, StepRow[]>();
  for (const step of branchSteps) {
    const idx = step.branch_index ?? 0;
    if (!branches.has(idx)) branches.set(idx, []);
    branches.get(idx)!.push(step);
  }

  // Sort each branch's steps by order_index
  Array.from(branches.values()).forEach(steps => {
    steps.sort((a, b) => a.order_index - b.order_index);
  });

  // 3. Execute all branches in parallel (FORK-04)
  const branchEntries = Array.from(branches.entries()).sort(([a], [b]) => a - b);
  const branchResults = await Promise.allSettled(
    branchEntries.map(async ([branchIndex, branchStepList]) => {
      const branchLabel = branchStepList[0]?.branch_label || `Rama ${branchIndex + 1}`;
      let lastOutput = preForkContext; // Each branch starts with pre-fork output

      for (const step of branchStepList) {
        if (taskState.cancelled) throw new Error('Tarea cancelada');

        // Skip already completed steps (retry scenario)
        if (step.status === 'completed') {
          lastOutput = step.output || lastOutput;
          continue;
        }

        // Mark step as running
        db.prepare("UPDATE task_steps SET status = 'running', started_at = ? WHERE id = ?")
          .run(new Date().toISOString(), step.id);

        // Create a synthetic "previous completed step" so buildStepContext works
        const syntheticPrevious: StepRow = {
          ...step,
          id: `synthetic-prev-${step.id}`,
          order_index: step.order_index - 1,
          status: 'completed',
          output: lastOutput,
        };
        const contextSteps = [syntheticPrevious, { ...step, context_mode: 'previous' }];

        try {
          if (step.type === 'agent') {
            await executeAgentStep(
              { ...step, context_mode: 'previous' },
              contextSteps,
              task,
              linkedProjects
            );
            const updated = db.prepare('SELECT output, tokens_used FROM task_steps WHERE id = ?').get(step.id) as { output: string; tokens_used: number };
            lastOutput = updated.output || lastOutput;
          } else if (step.type === 'canvas') {
            await executeCanvasStep({ ...step, context_mode: 'previous' }, contextSteps, taskId);
            const updated = db.prepare('SELECT output FROM task_steps WHERE id = ?').get(step.id) as { output: string };
            lastOutput = updated.output || lastOutput;
          } else if (step.type === 'merge') {
            await executeMergeStep(step, contextSteps, task);
            const updated = db.prepare('SELECT output FROM task_steps WHERE id = ?').get(step.id) as { output: string };
            lastOutput = updated.output || lastOutput;
          } else if (step.type === 'checkpoint') {
            // Checkpoints inside branches are not supported — mark as completed with a note
            db.prepare("UPDATE task_steps SET status = 'completed', output = ?, completed_at = ? WHERE id = ?")
              .run('[Checkpoint omitido en rama fork]', new Date().toISOString(), step.id);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          db.prepare("UPDATE task_steps SET status = 'failed', output = ?, completed_at = ? WHERE id = ?")
            .run(`[ERROR] ${errorMsg}`, new Date().toISOString(), step.id);
          throw new Error(`${branchLabel}: ${errorMsg}`);
        }
      }

      return { branchIndex, branchLabel, output: lastOutput || '' };
    })
  );

  // 4. Process results — build join input (FORK-05, FORK-07, FORK-08)
  const successfulBranches: Array<{ branchLabel: string; output: string }> = [];
  const failedBranches: Array<{ branchLabel: string; error: string }> = [];

  for (const result of branchResults) {
    if (result.status === 'fulfilled') {
      successfulBranches.push({ branchLabel: result.value.branchLabel, output: result.value.output });
    } else {
      const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      failedBranches.push({ branchLabel: errorMsg.split(':')[0] || 'Rama desconocida', error: errorMsg });
    }
  }

  // FORK-08: Task fails only if ALL branches fail
  if (successfulBranches.length === 0) {
    const allErrors = failedBranches.map(f => f.error).join('; ');
    throw new Error(`Todas las ramas fallaron: ${allErrors}`);
  }

  // 5. Build join output with separators (FORK-05)
  const joinParts: string[] = [];
  for (const branch of successfulBranches) {
    joinParts.push(`--- ${branch.branchLabel} ---\n${branch.output}`);
  }
  for (const branch of failedBranches) {
    joinParts.push(`--- ${branch.branchLabel} (ERROR) ---\n${branch.error}`);
  }
  let joinOutput = joinParts.join('\n\n');

  // 6. Optional CatPaw synthesis on join (FORK-06)
  if (joinStep.agent_id) {
    const joinStart = Date.now();
    db.prepare("UPDATE task_steps SET status = 'running', started_at = ? WHERE id = ?")
      .run(new Date().toISOString(), joinStep.id);

    try {
      const pawInput: CatPawInput = {
        query: joinStep.instructions || 'Sintetiza y unifica los siguientes resultados de las ramas paralelas en un documento coherente.',
        context: joinOutput,
      };
      const pawOutput = await executeCatPaw(joinStep.agent_id, pawInput);
      joinOutput = pawOutput.answer;

      const duration = Math.round((Date.now() - joinStart) / 1000);
      db.prepare("UPDATE task_steps SET status = 'completed', output = ?, tokens_used = ?, duration_seconds = ?, completed_at = ? WHERE id = ?")
        .run(joinOutput, pawOutput.tokens_used || 0, duration, new Date().toISOString(), joinStep.id);

      logUsage({
        event_type: 'task_step',
        task_id: taskId,
        agent_id: joinStep.agent_id,
        model: pawOutput.model_used || 'unknown',
        input_tokens: pawOutput.input_tokens || 0,
        output_tokens: pawOutput.output_tokens || 0,
        total_tokens: pawOutput.tokens_used || 0,
        duration_ms: Date.now() - joinStart,
        status: 'success',
        metadata: { step_name: joinStep.name, step_type: 'join', step_index: joinStep.order_index, via: 'executeCatPaw' },
      });
    } catch (err) {
      // If synthesis fails, fall back to raw concatenation
      logger.error('tasks', 'Error en sintesis CatPaw del join', { error: (err as Error).message });
      db.prepare("UPDATE task_steps SET status = 'completed', output = ?, completed_at = ? WHERE id = ?")
        .run(joinOutput, new Date().toISOString(), joinStep.id);
    }
  } else {
    // No synthesis — just save concatenated output
    db.prepare("UPDATE task_steps SET status = 'completed', output = ?, completed_at = ? WHERE id = ?")
      .run(joinOutput, new Date().toISOString(), joinStep.id);
  }

  db.prepare("UPDATE tasks SET updated_at = datetime('now') WHERE id = ?").run(taskId);
}

// --- Resume execution after checkpoint approval ---
export async function resumeAfterCheckpoint(taskId: string, approvedStepId: string): Promise<void> {
  // Mark the checkpoint as completed
  db.prepare("UPDATE task_steps SET status = 'completed', completed_at = ? WHERE id = ?")
    .run(new Date().toISOString(), approvedStepId);

  // Resume execution
  db.prepare("UPDATE tasks SET status = 'running', updated_at = datetime('now') WHERE id = ?").run(taskId);

  // Continue execution (fire and forget — runs in background)
  executeTask(taskId).catch(err => {
    logger.error('tasks', `Error resumiendo tarea ${taskId}`, { error: (err as Error).message });
  });
}

// --- Re-execute previous step after checkpoint rejection ---
export async function rejectCheckpoint(taskId: string, checkpointStepId: string, feedback: string): Promise<void> {
  // Mark checkpoint as pending again
  db.prepare("UPDATE task_steps SET status = 'pending' WHERE id = ?").run(checkpointStepId);

  // Find the step before the checkpoint
  const checkpoint = db.prepare('SELECT order_index FROM task_steps WHERE id = ?').get(checkpointStepId) as { order_index: number };
  const previousStep = db.prepare('SELECT id FROM task_steps WHERE task_id = ? AND order_index < ? ORDER BY order_index DESC LIMIT 1')
    .get(taskId, checkpoint.order_index) as { id: string } | undefined;

  if (previousStep) {
    // Reset previous step to pending, add feedback (PROMPT-02)
    db.prepare("UPDATE task_steps SET status = 'pending', output = NULL, human_feedback = ? WHERE id = ?")
      .run(feedback, previousStep.id);
  }

  // Resume execution from the re-set step
  db.prepare("UPDATE tasks SET status = 'running', updated_at = datetime('now') WHERE id = ?").run(taskId);
  executeTask(taskId).catch(err => {
    logger.error('tasks', `Error re-ejecutando tarea ${taskId}`, { error: (err as Error).message });
  });
}

// --- Helper: Reset all task steps to pending ---
function resetTaskSteps(taskId: string): void {
  db.prepare(`
    UPDATE task_steps
    SET status = 'pending', output = NULL, tokens_used = 0, duration_seconds = 0,
        started_at = NULL, completed_at = NULL, human_feedback = NULL
    WHERE task_id = ?
  `).run(taskId);
}

// --- Execute task with cycle support (variable mode) ---
export async function executeTaskWithCycles(taskId: string): Promise<void> {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as {
    id: string; execution_mode: string; execution_count: number; run_count: number;
  } | undefined;

  if (!task) throw new Error('Tarea no encontrada');

  if (task.execution_mode === 'variable') {
    // Validate: checkpoint steps are incompatible with variable mode
    const hasCheckpoint = db.prepare(
      "SELECT COUNT(*) as c FROM task_steps WHERE task_id = ? AND type = 'checkpoint'"
    ).get(taskId) as { c: number };
    if (hasCheckpoint.c > 0) {
      throw new Error('Las tareas con modo variable no pueden contener pasos de checkpoint');
    }

    const totalCycles = task.execution_count || 1;

    for (let cycle = task.run_count; cycle < totalCycles; cycle++) {
      // Reset steps before each re-run (except first run when steps are already pending)
      if (cycle > 0) {
        resetTaskSteps(taskId);
        db.prepare("UPDATE tasks SET status = 'ready', updated_at = ? WHERE id = ?")
          .run(new Date().toISOString(), taskId);
      }

      await executeTask(taskId);

      // Check if task failed — stop cycling
      const updated = db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskId) as { status: string };
      if (updated.status === 'failed') {
        return; // Stop on failure
      }

      // Increment run_count
      const newRunCount = cycle + 1;
      const now = new Date().toISOString();
      db.prepare('UPDATE tasks SET run_count = ?, last_run_at = ?, updated_at = ? WHERE id = ?')
        .run(newRunCount, now, now, taskId);
    }
  } else {
    // Single or scheduled — run pipeline once, update run_count
    await executeTask(taskId);

    const now = new Date().toISOString();
    db.prepare('UPDATE tasks SET run_count = run_count + 1, last_run_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, taskId);
  }
}

// --- Cancel a running task ---
export function cancelTask(taskId: string): void {
  const state = runningTasks.get(taskId);
  if (state) {
    state.cancelled = true;
  }
  // Also mark in DB immediately
  db.prepare("UPDATE tasks SET status = 'failed', updated_at = datetime('now') WHERE id = ?").run(taskId);
  // Mark any running steps as failed
  db.prepare("UPDATE task_steps SET status = 'failed' WHERE task_id = ? AND status = 'running'").run(taskId);
}

// --- Retry from failed step ---
export async function retryTask(taskId: string): Promise<void> {
  // Reset failed steps to pending
  db.prepare("UPDATE task_steps SET status = 'pending', output = NULL, tokens_used = 0, duration_seconds = 0, started_at = NULL, completed_at = NULL WHERE task_id = ? AND status = 'failed'").run(taskId);

  // Resume execution
  db.prepare("UPDATE tasks SET status = 'running', updated_at = datetime('now') WHERE id = ?").run(taskId);
  executeTask(taskId).catch(err => {
    logger.error('tasks', `Error reintentando tarea ${taskId}`, { error: (err as Error).message });
  });
}
