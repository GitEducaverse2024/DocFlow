import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';

interface UsageEvent {
  event_type: 'process' | 'chat' | 'rag_index' | 'agent_generate' | 'task_step' | 'connector_call' | 'canvas_execution';
  project_id?: string | null;
  task_id?: string | null;
  agent_id?: string | null;
  model?: string | null;
  provider?: string | null;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  duration_ms?: number;
  status?: 'success' | 'failed';
  metadata?: Record<string, unknown> | null;
}

export function getModelPricing(): Array<{ model: string; provider: string; input_price: number; output_price: number }> {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'model_pricing'").get() as { value: string } | undefined;
    return row ? JSON.parse(row.value) : [];
  } catch {
    return [];
  }
}

function calculateCost(model: string | null | undefined, inputTokens: number, outputTokens: number): number {
  if (!model) return 0;
  const pricing = getModelPricing();
  const match = pricing.find(p => model.includes(p.model) || p.model.includes(model));
  if (!match) return 0;
  return (inputTokens * match.input_price + outputTokens * match.output_price) / 1_000_000;
}

export function logUsage(event: UsageEvent): void {
  try {
    const inputTokens = event.input_tokens || 0;
    const outputTokens = event.output_tokens || 0;
    const totalTokens = event.total_tokens || (inputTokens + outputTokens);
    const estimatedCost = calculateCost(event.model, inputTokens, outputTokens);

    db.prepare(`
      INSERT INTO usage_logs (id, event_type, project_id, task_id, agent_id, model, provider, input_tokens, output_tokens, total_tokens, estimated_cost, duration_ms, status, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      event.event_type,
      event.project_id || null,
      event.task_id || null,
      event.agent_id || null,
      event.model || null,
      event.provider || null,
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCost,
      event.duration_ms || 0,
      event.status || 'success',
      event.metadata ? JSON.stringify(event.metadata) : null
    );
  } catch (err) {
    logger.error('system', 'Error logging usage', { error: (err as Error).message });
  }
}
