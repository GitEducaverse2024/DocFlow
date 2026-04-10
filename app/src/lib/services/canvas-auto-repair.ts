/**
 * Phase 132 Plan 03 — Runtime auto-repair for canvases with failed guards.
 *
 * Triggered from the reporter agent node (auto-inserted by
 * insertSideEffectGuards) via the internal tool `_internal_attempt_node_repair`.
 *
 * Flow:
 * 1. Resolve active canvas_run via canvas_id (most-recent running).
 * 2. Read canvas_runs.metadata.repair_attempts[failedNodeId].
 *    - If >= 1 (second failure): log knowledge gap + notify user, return failure.
 * 3. Load canvas.flow_data, find failed node + upstream nodes, call LLM with
 *    AGENT_AUTOFIX_PROMPT.
 * 4. If LLM returns {status:'fixed', fix_target_node_id, fixed_instructions}:
 *    - Update flow_data.nodes[fix_target].data.instructions
 *    - Persist canvases.flow_data
 *    - Set canvas_runs.metadata.repair_attempts[failedNodeId] = 1
 *    - Delete node_states entries for fix target + failed node (so executor reruns them)
 *    - Set canvas_runs.status = 'running'
 * 5. If LLM returns repair_failed or invalid JSON → return failure (reporter will
 *    fall through to log_knowledge_gap itself).
 *
 * The canvas_run id is NOT part of the input — it's resolved here so the
 * reporter tool only needs (canvas_id, failed_node_id, guard_report, actual_input?).
 */

import db from '@/lib/db';
import catbotDb, { saveKnowledgeGap } from '@/lib/catbot-db';
import { logger } from '@/lib/logger';
import { AGENT_AUTOFIX_PROMPT } from './catbot-pipeline-prompts';
import { createNotification } from './notifications';

export interface RepairInput {
  canvasId: string;
  failedNodeId: string;
  guardReport: string;
  actualInput: string;
}

export interface RepairResult {
  success: boolean;
  reason?: string;
  resolvedCanvasRunId?: string;
  updatedNodeId?: string;
}

interface FlowDataShape {
  nodes: Array<Record<string, unknown>>;
  edges: Array<{ id?: string; source: string; target: string }>;
}

interface LLMRepairResponse {
  status?: string;
  fix_target_node_id?: string;
  fixed_instructions?: string;
  reason?: string;
}

export async function attemptNodeRepair(input: RepairInput): Promise<RepairResult> {
  const { canvasId, failedNodeId, guardReport, actualInput } = input;

  // 1. Resolve active canvas_run (most recent running for this canvas)
  const run = db
    .prepare(
      "SELECT id, metadata, node_states FROM canvas_runs WHERE canvas_id = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1",
    )
    .get(canvasId) as
    | { id: string; metadata: string | null; node_states: string | null }
    | undefined;

  if (!run) {
    logger.warn('canvas', 'auto-repair: no active canvas_run', { canvasId, failedNodeId });
    return { success: false, reason: `no active canvas_run for canvas_id=${canvasId}` };
  }

  const canvasRunId = run.id;
  const metadata: Record<string, unknown> = run.metadata ? safeParse(run.metadata, {}) : {};
  const repairAttempts = (metadata.repair_attempts as Record<string, number> | undefined) ?? {};
  const prevAttempts = repairAttempts[failedNodeId] ?? 0;

  // 2. Exhaustion guard (Pitfall 4: infinite loop prevention)
  if (prevAttempts >= 1) {
    logger.warn('canvas', 'auto-repair: exhausted, giving up', {
      canvasId,
      canvasRunId,
      failedNodeId,
      prevAttempts,
    });
    try {
      saveKnowledgeGap({
        knowledgePath: 'catflow/design/data-contract',
        query: `Auto-repair exhausted for node ${failedNodeId} in canvas ${canvasId} after twice failing the guard`,
        context: JSON.stringify({
          canvas_id: canvasId,
          canvas_run_id: canvasRunId,
          failed_node_id: failedNodeId,
          guard_report: guardReport,
          actual_input: actualInput.slice(0, 2000),
        }).slice(0, 4000),
      });
    } catch (err) {
      logger.error('canvas', 'saveKnowledgeGap failed during exhaustion', { error: String(err) });
    }
    await notifyUserIrreparable(canvasId, failedNodeId, guardReport);
    return {
      success: false,
      reason: 'repair_attempts exhausted',
      resolvedCanvasRunId: canvasRunId,
    };
  }

  // 3. Load canvas.flow_data
  const canvas = db
    .prepare('SELECT flow_data FROM canvases WHERE id = ?')
    .get(canvasId) as { flow_data: string } | undefined;
  if (!canvas) {
    return { success: false, reason: 'canvas not found', resolvedCanvasRunId: canvasRunId };
  }

  const flowData = safeParse<FlowDataShape>(canvas.flow_data, { nodes: [], edges: [] });
  const failedNode = flowData.nodes.find(n => n.id === failedNodeId);
  if (!failedNode) {
    return { success: false, reason: 'failed node not in flow_data', resolvedCanvasRunId: canvasRunId };
  }

  const upstreamIds = flowData.edges.filter(e => e.target === failedNodeId).map(e => e.source);
  const upstreamNodes = flowData.nodes.filter(n => upstreamIds.includes(n.id as string));

  // 4. Call LLM
  const llmInput = JSON.stringify({
    failed_node: failedNode,
    upstream_nodes: upstreamNodes,
    guard_report: guardReport,
    actual_input: actualInput.slice(0, 2000),
  });

  let llmRaw: string;
  try {
    llmRaw = await callRepairLLM(llmInput);
  } catch (err) {
    logger.error('canvas', 'auto-repair LLM call failed', { error: String(err) });
    return { success: false, reason: `LLM call failed: ${String(err)}`, resolvedCanvasRunId: canvasRunId };
  }

  let llmOut: LLMRepairResponse;
  try {
    llmOut = JSON.parse(llmRaw);
  } catch {
    return {
      success: false,
      reason: 'invalid LLM JSON response',
      resolvedCanvasRunId: canvasRunId,
    };
  }

  if (llmOut.status !== 'fixed' || !llmOut.fix_target_node_id || !llmOut.fixed_instructions) {
    return {
      success: false,
      reason: llmOut.reason ?? 'LLM declared repair_failed',
      resolvedCanvasRunId: canvasRunId,
    };
  }

  // 5. Apply fix
  const targetNode = flowData.nodes.find(n => n.id === llmOut.fix_target_node_id);
  if (!targetNode) {
    return { success: false, reason: 'fix target node not in flow_data', resolvedCanvasRunId: canvasRunId };
  }
  const targetData = (targetNode.data ?? {}) as Record<string, unknown>;
  targetData.instructions = llmOut.fixed_instructions;
  targetNode.data = targetData;

  db.prepare('UPDATE canvases SET flow_data = ? WHERE id = ?')
    .run(JSON.stringify(flowData), canvasId);

  // Track attempt on the resolved run
  repairAttempts[failedNodeId] = prevAttempts + 1;
  metadata.repair_attempts = repairAttempts;
  db.prepare('UPDATE canvas_runs SET metadata = ? WHERE id = ?')
    .run(JSON.stringify(metadata), canvasRunId);

  // Reset node_states for fix target + failed node so executor re-runs them
  const nodeStates = run.node_states ? safeParse<Record<string, unknown>>(run.node_states, {}) : {};
  delete nodeStates[llmOut.fix_target_node_id];
  delete nodeStates[failedNodeId];
  db.prepare('UPDATE canvas_runs SET node_states = ?, status = ? WHERE id = ?')
    .run(JSON.stringify(nodeStates), 'running', canvasRunId);

  logger.info('canvas', 'auto-repair applied fix', {
    canvasId,
    canvasRunId,
    fix_target: llmOut.fix_target_node_id,
    reason: llmOut.reason,
  });

  return {
    success: true,
    reason: llmOut.reason ?? 'fixed',
    resolvedCanvasRunId: canvasRunId,
    updatedNodeId: llmOut.fix_target_node_id,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function callRepairLLM(userInput: string): Promise<string> {
  const url = process['env']['LITELLM_URL'] || 'http://litellm:4000';
  const key = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
  const model = process['env']['CATBOT_PIPELINE_MODEL'] || 'gemini-main';

  const res = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: AGENT_AUTOFIX_PROMPT },
        { role: 'user', content: userInput },
      ],
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    throw new Error(`litellm ${res.status}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '{}';
}

async function notifyUserIrreparable(
  canvasId: string,
  failedNodeId: string,
  guardReport: string,
): Promise<void> {
  // Look up the most recent intent_job for this canvas to propagate channel_ref
  // (Phase 131 fix: users are notified on the original channel they used).
  const job = catbotDb
    .prepare(
      'SELECT user_id, channel, channel_ref FROM intent_jobs WHERE canvas_id = ? ORDER BY created_at DESC LIMIT 1',
    )
    .get(canvasId) as
    | { user_id: string; channel: string; channel_ref: string | null }
    | undefined;

  if (!job) {
    logger.warn('canvas', 'notifyUserIrreparable: no intent_job for canvas', { canvasId });
    return;
  }

  const shortReport = guardReport.slice(0, 200);
  const body =
    `El nodo ${failedNodeId} del canvas ${canvasId} fallo el guard dos veces. `
    + `Motivo: ${shortReport}.`;

  // 1. Persist to web notifications with first-class channel routing fields
  //    (Phase 132 hotfix). Any future dispatcher can SELECT WHERE channel=?
  //    and replay on the originating surface.
  try {
    createNotification({
      type: 'canvas',
      severity: 'error',
      title: 'Canvas no se pudo reparar automaticamente',
      message: body,
      link: `/canvas/${canvasId}`,
      channel: job.channel,
      channel_ref: job.channel_ref ?? undefined,
    });
  } catch (err) {
    logger.error('canvas', 'notifyUserIrreparable createNotification failed', { error: String(err) });
  }

  // 2. If the pipeline originated on Telegram, also push the alert to the
  //    originating chat immediately — web notifications are asynchronous and
  //    the user may not have the dashboard open.
  if (job.channel === 'telegram' && job.channel_ref) {
    const chatId = parseInt(job.channel_ref, 10);
    if (!Number.isNaN(chatId)) {
      try {
        const { telegramBotService } = await import('./telegram-bot');
        await telegramBotService.sendMessage(chatId, `\u26A0\uFE0F ${body}`);
      } catch (err) {
        logger.warn('canvas', 'notifyUserIrreparable telegram send failed', { error: String(err) });
      }
    }
  }
}
