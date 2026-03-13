import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface CanvasNode {
  id: string;
  type?: string;
  data?: { label?: string };
  position?: { x: number; y: number };
}

interface CanvasEdge {
  id: string;
  source: string;
  target: string;
}

interface FlowData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

function detectCycle(nodes: Array<{id: string}>, edges: Array<{source: string; target: string}>): boolean {
  const adj = new Map<string, string[]>();
  nodes.forEach(n => adj.set(n.id, []));
  edges.forEach(e => adj.get(e.source)?.push(e.target));

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    inStack.add(nodeId);
    for (const neighbor of (adj.get(nodeId) || [])) {
      if (inStack.has(neighbor)) return true;
      if (!visited.has(neighbor) && dfs(neighbor)) return true;
    }
    inStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node.id) && dfs(node.id)) return true;
  }
  return false;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const canvas = db.prepare('SELECT flow_data FROM canvases WHERE id = ?').get(params.id) as { flow_data: string | null } | undefined;

    if (!canvas) {
      return NextResponse.json({ error: 'Canvas not found' }, { status: 404 });
    }

    const flowData: FlowData = canvas.flow_data
      ? JSON.parse(canvas.flow_data)
      : { nodes: [], edges: [] };

    const nodes: CanvasNode[] = flowData.nodes || [];
    const edges: CanvasEdge[] = flowData.edges || [];
    const errors: string[] = [];

    // Check START node exists
    const hasStart = nodes.some(n => n.type === 'start');
    if (!hasStart) {
      errors.push('El canvas necesita un nodo Inicio (START)');
    }

    // Check OUTPUT node exists
    const hasOutput = nodes.some(n => n.type === 'output');
    if (!hasOutput) {
      errors.push('El canvas necesita al menos un nodo Salida (OUTPUT)');
    }

    // Check for orphan nodes (non-start nodes with no incoming edges)
    const nodesWithIncoming = new Set(edges.map(e => e.target));
    const orphans = nodes.filter(n => n.type !== 'start' && !nodesWithIncoming.has(n.id));
    if (orphans.length > 0) {
      const orphanLabels = orphans.map(n => n.data?.label || n.id).join(', ');
      errors.push(`Nodos sin conexion de entrada: ${orphanLabels}`);
    }

    // Check for cycles
    if (detectCycle(nodes, edges)) {
      errors.push('El canvas contiene ciclos — solo se permiten DAGs');
    }

    return NextResponse.json({ valid: errors.length === 0, errors });
  } catch (error) {
    logger.error('canvas', 'Error validando canvas', { canvasId: params.id, error: (error as Error).message });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
