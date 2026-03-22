import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { generateId } from '@/lib/utils';
import { executeCanvas } from '@/lib/services/canvas-executor';
import { topologicalSort } from '@/lib/services/canvas-executor';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { source_canvas_id, source_run_id, source_node_id, target_canvas_id, payload } = body;

    if (!source_canvas_id || !target_canvas_id) {
      return NextResponse.json(
        { error: 'source_canvas_id and target_canvas_id are required' },
        { status: 400 }
      );
    }

    // Validate target canvas exists and has listen_mode=1
    const target = db.prepare(
      'SELECT id, listen_mode, flow_data FROM canvases WHERE id = ?'
    ).get(target_canvas_id) as { id: string; listen_mode: number; flow_data: string | null } | undefined;

    if (!target) {
      return NextResponse.json({ error: 'Target canvas not found' }, { status: 404 });
    }

    if (target.listen_mode !== 1) {
      return NextResponse.json(
        { error: 'Target canvas is not in listen mode' },
        { status: 400 }
      );
    }

    const triggerId = generateId();

    // Serialize payload if it's an object
    const payloadStr = payload != null
      ? (typeof payload === 'string' ? payload : JSON.stringify(payload))
      : null;

    // Insert trigger with status=pending
    db.prepare(
      `INSERT INTO catflow_triggers (id, source_canvas_id, source_run_id, source_node_id, target_canvas_id, payload, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`
    ).run(triggerId, source_canvas_id, source_run_id || null, source_node_id || null, target_canvas_id, payloadStr);

    // Set external_input on target canvas
    db.prepare(
      'UPDATE canvases SET external_input = ? WHERE id = ?'
    ).run(payloadStr, target_canvas_id);

    // Update trigger status to running
    db.prepare(
      "UPDATE catflow_triggers SET status = 'running' WHERE id = ?"
    ).run(triggerId);

    // Fire and forget: execute target canvas
    if (target.flow_data) {
      try {
        const flowData = JSON.parse(target.flow_data) as { nodes: Array<{ id: string; type: string; data: Record<string, unknown>; position: { x: number; y: number } }>; edges: Array<{ id: string; source: string; target: string }> };
        const { nodes, edges } = flowData;
        if (nodes && nodes.length > 0) {
          const executionOrder = topologicalSort(nodes, edges || []);
          const nodeStates: Record<string, { status: string }> = {};
          for (const node of nodes) {
            nodeStates[node.id] = { status: 'pending' };
          }
          const runId = generateId();
          const now = new Date().toISOString();
          db.prepare(`
            INSERT INTO canvas_runs (id, canvas_id, status, node_states, current_node_id, execution_order, total_tokens, total_duration, started_at, created_at, metadata)
            VALUES (?, ?, 'running', ?, NULL, ?, 0, 0, ?, ?, ?)
          `).run(runId, target_canvas_id, JSON.stringify(nodeStates), JSON.stringify(executionOrder), now, now, JSON.stringify({ trigger_id: triggerId }));

          executeCanvas(target_canvas_id, runId).catch(err => {
            logger.error('canvas', 'Error executing triggered catflow', {
              triggerId,
              targetCanvasId: target_canvas_id,
              error: (err as Error).message,
            });
          });
        }
      } catch (err) {
        logger.error('canvas', 'Error parsing target canvas flow_data for trigger', {
          triggerId,
          targetCanvasId: target_canvas_id,
          error: (err as Error).message,
        });
      }
    }

    return NextResponse.json({ id: triggerId, status: 'running' }, { status: 201 });
  } catch (error) {
    console.error('Error creating catflow trigger:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
