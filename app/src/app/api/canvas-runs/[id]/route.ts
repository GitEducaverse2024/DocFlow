import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = await params;

  const run = db.prepare(`
    SELECT cr.id, cr.canvas_id, cr.status, cr.node_states, cr.current_node_id,
           cr.execution_order, cr.total_tokens, cr.total_duration,
           c.name as canvas_name, c.flow_data
    FROM canvas_runs cr
    JOIN canvases c ON c.id = cr.canvas_id
    WHERE cr.id = ?
  `).get(id) as Record<string, unknown> | undefined;

  if (!run) return NextResponse.json({ error: 'Canvas run not found' }, { status: 404 });

  return NextResponse.json({
    id: run.id,
    canvas_name: run.canvas_name,
    status: run.status,
    node_states: JSON.parse(run.node_states as string || '{}'),
    current_node_id: run.current_node_id,
    execution_order: JSON.parse(run.execution_order as string || '[]'),
    flow_data: JSON.parse(run.flow_data as string || '{"nodes":[],"edges":[]}'),
    total_tokens: run.total_tokens,
    total_duration: run.total_duration,
  });
}
