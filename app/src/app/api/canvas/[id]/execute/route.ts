import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { generateId } from '@/lib/utils';
import { topologicalSort, executeCanvas } from '@/lib/services/canvas-executor';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id } = params;

  try {
    // Load canvas
    const canvas = db.prepare('SELECT id, flow_data FROM canvases WHERE id = ?').get(id) as
      | { id: string; flow_data: string | null }
      | undefined;

    if (!canvas) {
      return NextResponse.json({ error: 'Canvas no encontrado' }, { status: 404 });
    }

    if (!canvas.flow_data) {
      return NextResponse.json({ error: 'El canvas no tiene flow_data' }, { status: 400 });
    }

    let flowData: { nodes: Array<{ id: string; type: string; data: Record<string, unknown>; position: { x: number; y: number } }>; edges: Array<{ id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }> };
    try {
      flowData = JSON.parse(canvas.flow_data);
    } catch {
      return NextResponse.json({ error: 'flow_data inválido (JSON malformado)' }, { status: 400 });
    }

    const { nodes, edges } = flowData;

    if (!nodes || nodes.length === 0) {
      return NextResponse.json({ error: 'El canvas no tiene nodos' }, { status: 400 });
    }

    // Compute topological order
    const executionOrder = topologicalSort(nodes, edges || []);

    // Initialize all node states as pending
    const nodeStates: Record<string, { status: string }> = {};
    for (const node of nodes) {
      nodeStates[node.id] = { status: 'pending' };
    }

    // Create canvas_run
    const runId = generateId();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO canvas_runs (id, canvas_id, status, node_states, current_node_id, execution_order, total_tokens, total_duration, started_at, created_at)
      VALUES (?, ?, 'running', ?, NULL, ?, 0, 0, ?, ?)
    `).run(runId, id, JSON.stringify(nodeStates), JSON.stringify(executionOrder), now, now);

    logger.info('canvas', 'Ejecucion de canvas iniciada', { canvasId: id, runId, nodesCount: nodes.length });

    // Fire-and-forget execution
    executeCanvas(id, runId).catch(err => {
      logger.error('canvas', 'Error ejecutando canvas', { canvasId: id, runId, error: (err as Error).message });
    });

    return NextResponse.json({ runId, status: 'running' });
  } catch (err) {
    logger.error('canvas', 'Error iniciando ejecucion de canvas', { canvasId: id, error: (err as Error).message });
    return NextResponse.json({ error: 'Error al iniciar ejecución' }, { status: 500 });
  }
}
