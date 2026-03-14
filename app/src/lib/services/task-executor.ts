import db from '@/lib/db';
import { qdrant } from '@/lib/services/qdrant';
import { ollama } from '@/lib/services/ollama';
import { v4 as uuidv4 } from 'uuid';
import { logUsage } from '@/lib/services/usage-tracker';
import { logger } from '@/lib/logger';
import { createNotification } from '@/lib/services/notifications';
import { litellm } from '@/lib/services/litellm';

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

// --- Helper: Get RAG context from linked catbrains (legacy column name: linked_projects) ---
async function getRagContext(linkedCatbrainIds: string[], query: string): Promise<string> {
  const ragChunks: string[] = [];

  for (const catbrainId of linkedCatbrainIds) {
    try {
      const catbrain = db.prepare('SELECT rag_collection, rag_enabled, name FROM catbrains WHERE id = ?').get(catbrainId) as { rag_collection: string | null; rag_enabled: number; name: string } | undefined;
      if (!catbrain || !catbrain.rag_enabled || !catbrain.rag_collection) continue;

      const collectionInfo = await qdrant.getCollectionInfo(catbrain.rag_collection);
      if (!collectionInfo?.result) continue;

      const vectorSize = collectionInfo.result?.config?.params?.vectors?.size || 768;
      const embModel = ollama.guessModelFromVectorSize(vectorSize);
      const queryVector = await ollama.getEmbedding(query, embModel);
      const searchResults = await qdrant.search(catbrain.rag_collection, queryVector, 5);
      const results = searchResults.result || [];

      for (const r of results) {
        ragChunks.push(`[${catbrain.name}] ${(r as { payload: { text: string } }).payload.text}`);
      }
    } catch (e) {
      logger.error('tasks', `Error buscando RAG en catbrain ${catbrainId}`, { error: (e as Error).message });
    }
  }

  return ragChunks.join('\n\n');
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

    for (const step of steps) {
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

  // 1. Build context from previous steps
  const previousContext = buildStepContext(step, allSteps);

  // 2. Get RAG context if enabled
  let ragContext = '';
  if (step.use_project_rag && linkedProjects.length > 0) {
    const ragQuery = step.instructions?.substring(0, 200) || step.name || task.name;
    ragContext = await getRagContext(linkedProjects, ragQuery);
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

  if (ragContext) {
    userParts.push(`\n--- CONOCIMIENTO DEL PROYECTO ---\n${ragContext}\n--- FIN CONOCIMIENTO ---`);
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
