import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const canvas = db.prepare('SELECT * FROM canvases WHERE id = ?').get(params.id);

    if (!canvas) {
      return NextResponse.json({ error: 'Canvas no encontrado' }, { status: 404 });
    }

    return NextResponse.json(canvas);
  } catch (error) {
    logger.error('canvas', 'Error al obtener canvas', { canvasId: params.id, error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const { name, description, emoji, flow_data, thumbnail, status, tags, listen_mode } = body;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (emoji !== undefined) { updates.push('emoji = ?'); values.push(emoji); }
    if (flow_data !== undefined) {
      const fdStr = typeof flow_data === 'string' ? flow_data : JSON.stringify(flow_data);
      updates.push('flow_data = ?');
      values.push(fdStr);
      // Auto-update node_count from flow_data
      try {
        const parsed = JSON.parse(fdStr);
        if (parsed.nodes && Array.isArray(parsed.nodes)) {
          updates.push('node_count = ?');
          values.push(parsed.nodes.length);
        }
      } catch { /* ignore parse errors */ }
    }
    if (thumbnail !== undefined) { updates.push('thumbnail = ?'); values.push(thumbnail); }
    if (status !== undefined) { updates.push('status = ?'); values.push(status); }
    if (tags !== undefined) { updates.push('tags = ?'); values.push(Array.isArray(tags) ? JSON.stringify(tags) : tags); }
    if (listen_mode !== undefined) { updates.push('listen_mode = ?'); values.push(listen_mode); }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(params.id);

    if (updates.length === 1) {
      // Only updated_at was added, nothing to update
      return NextResponse.json({ success: true });
    }

    db.prepare(`UPDATE canvases SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('canvas', 'Error al actualizar canvas', { canvasId: params.id, error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const canvas = db.prepare('SELECT id FROM canvases WHERE id = ?').get(params.id);

    if (!canvas) {
      return NextResponse.json({ error: 'Canvas no encontrado' }, { status: 404 });
    }

    // canvas_runs are deleted automatically by CASCADE
    db.prepare('DELETE FROM canvases WHERE id = ?').run(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('canvas', 'Error al eliminar canvas', { canvasId: params.id, error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
