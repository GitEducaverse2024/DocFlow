import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface CanvasProgress {
  canvas_run_id: string;
  canvas_name: string;
  total_nodes: number;
  completed_nodes: number;
  current_node_name: string | null;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const task = db.prepare(
      'SELECT id, status, started_at, total_tokens, total_duration, execution_mode, execution_count, run_count FROM tasks WHERE id = ?'
    ).get(params.id) as {
      id: string; status: string; started_at: string | null;
      total_tokens: number; total_duration: number;
      execution_mode: string | null; execution_count: number; run_count: number;
    } | undefined;

    if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });

    const steps = db.prepare(
      `SELECT id, order_index, type, name, agent_name, status, tokens_used, duration_seconds,
              SUBSTR(output, 1, 500) as output_preview,
              canvas_id, fork_group, branch_index, branch_label
       FROM task_steps WHERE task_id = ? ORDER BY order_index ASC`
    ).all(params.id) as {
      id: string; order_index: number; type: string; name: string | null;
      agent_name: string | null; status: string; tokens_used: number;
      duration_seconds: number; output_preview: string | null;
      canvas_id: string | null; fork_group: string | null;
      branch_index: number | null; branch_label: string | null;
    }[];

    // Find current step index
    const runningStep = steps.find(s => s.status === 'running');
    const currentStepIndex = runningStep ? runningStep.order_index : -1;

    // Calculate elapsed time
    const elapsedTime = task.started_at ? Math.round((Date.now() - new Date(task.started_at).getTime()) / 1000) : 0;

    // For running canvas steps, query canvas_runs for progress
    const stepsWithProgress = steps.map(step => {
      if (step.type !== 'canvas' || step.status !== 'running') {
        return step;
      }

      try {
        // Find the running canvas_run linked to this step via metadata
        const canvasRun = db.prepare(
          `SELECT cr.id, cr.status, cr.node_states, cr.current_node_id, cr.execution_order,
                  c.name as canvas_name, c.flow_data
           FROM canvas_runs cr
           JOIN canvases c ON c.id = cr.canvas_id
           WHERE cr.metadata LIKE '%"parent_step_id":"' || ? || '"%'
             AND cr.status = 'running'
           ORDER BY cr.created_at DESC LIMIT 1`
        ).get(step.id) as {
          id: string; status: string; node_states: string | null;
          current_node_id: string | null; execution_order: string | null;
          canvas_name: string; flow_data: string | null;
        } | undefined;

        if (!canvasRun) return step;

        // Parse node_states to count total and completed nodes
        let totalNodes = 0;
        let completedNodes = 0;
        let currentNodeName: string | null = null;

        if (canvasRun.node_states) {
          try {
            const nodeStates = JSON.parse(canvasRun.node_states) as Record<string, { status?: string }>;
            totalNodes = Object.keys(nodeStates).length;
            completedNodes = Object.values(nodeStates).filter(
              ns => ns.status === 'completed' || ns.status === 'success'
            ).length;
          } catch { /* ignore parse errors */ }
        }

        // If no node_states yet, try execution_order for total count
        if (totalNodes === 0 && canvasRun.execution_order) {
          try {
            const order = JSON.parse(canvasRun.execution_order) as string[];
            totalNodes = order.length;
          } catch { /* ignore */ }
        }

        // Get current node name from flow_data
        if (canvasRun.current_node_id && canvasRun.flow_data) {
          try {
            const flowData = JSON.parse(canvasRun.flow_data);
            const nodes = flowData.nodes || [];
            const currentNode = nodes.find((n: { id: string; data?: { label?: string } }) => n.id === canvasRun.current_node_id);
            currentNodeName = currentNode?.data?.label || currentNode?.id || null;
          } catch { /* ignore */ }
        }

        const canvas_progress: CanvasProgress = {
          canvas_run_id: canvasRun.id,
          canvas_name: canvasRun.canvas_name,
          total_nodes: totalNodes,
          completed_nodes: completedNodes,
          current_node_name: currentNodeName,
        };

        return { ...step, canvas_progress };
      } catch {
        return step;
      }
    });

    return NextResponse.json({
      status: task.status,
      current_step_index: currentStepIndex,
      elapsed_time: elapsedTime,
      total_tokens: task.total_tokens,
      total_duration: task.total_duration,
      execution_mode: task.execution_mode,
      execution_count: task.execution_count,
      run_count: task.run_count,
      steps: stepsWithProgress,
    });
  } catch (error) {
    logger.error('tasks', 'Error obteniendo estado de tarea', { taskId: params.id, error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
