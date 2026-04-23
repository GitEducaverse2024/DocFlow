import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { syncResource } from '@/lib/services/knowledge-sync';
import { invalidateKbIndex } from '@/lib/services/kb-index-cache';
import { markStale } from '@/lib/services/kb-audit';
import { hookCtx, hookSlug } from '@/lib/services/kb-hook-helpers';

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
    const { name, description, emoji, flow_data, thumbnail, status, tags, listen_mode, force_overwrite, rationale_notes } = body;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (emoji !== undefined) { updates.push('emoji = ?'); values.push(emoji); }
    if (flow_data !== undefined) {
      let fdStr = typeof flow_data === 'string' ? flow_data : JSON.stringify(flow_data);

      // Server-side merge: preserve nodes/edges added by CatBot (direct DB writes)
      // that the client doesn't know about, preventing race-condition overwrites.
      // Skip merge when force_overwrite=true (user explicitly deleted nodes from UI).
      if (!force_overwrite) {
        try {
          const incoming = JSON.parse(fdStr);
          if (incoming.nodes && Array.isArray(incoming.nodes)) {
            const current = db.prepare('SELECT flow_data FROM canvases WHERE id = ?').get(params.id) as { flow_data: string | null } | undefined;
            if (current?.flow_data) {
              const currentFd = JSON.parse(current.flow_data);
              if (currentFd.nodes && Array.isArray(currentFd.nodes)) {
                const incomingNodeIds = new Set(incoming.nodes.map((n: Record<string, unknown>) => n.id));
                const missingNodes = currentFd.nodes.filter((n: Record<string, unknown>) => !incomingNodeIds.has(n.id));
                if (missingNodes.length > 0) {
                  incoming.nodes = [...incoming.nodes, ...missingNodes];
                }
              }
              if (currentFd.edges && Array.isArray(currentFd.edges)) {
                const incomingEdgeIds = new Set((incoming.edges || []).map((e: Record<string, unknown>) => e.id));
                const missingEdges = currentFd.edges.filter((e: Record<string, unknown>) => !incomingEdgeIds.has(e.id));
                if (missingEdges.length > 0) {
                  incoming.edges = [...(incoming.edges || []), ...missingEdges];
                }
              }
            }
          }
          fdStr = JSON.stringify(incoming);
        } catch { /* ignore parse errors, save as-is */ }
      }

      // Update node_count
      try {
        const parsed = JSON.parse(fdStr);
        if (parsed.nodes && Array.isArray(parsed.nodes)) {
          updates.push('node_count = ?');
          values.push(parsed.nodes.length);
        }
      } catch { /* ignore */ }

      updates.push('flow_data = ?');
      values.push(fdStr);
    }
    if (thumbnail !== undefined) { updates.push('thumbnail = ?'); values.push(thumbnail); }
    if (status !== undefined) { updates.push('status = ?'); values.push(status); }
    if (tags !== undefined) { updates.push('tags = ?'); values.push(Array.isArray(tags) ? JSON.stringify(tags) : tags); }
    if (listen_mode !== undefined) { updates.push('listen_mode = ?'); values.push(listen_mode); }
    if (rationale_notes !== undefined) {
      const val = typeof rationale_notes === 'string' ? rationale_notes : JSON.stringify(rationale_notes);
      try { JSON.parse(val); } catch { return NextResponse.json({ error: 'rationale_notes must be valid JSON array' }, { status: 400 }); }
      updates.push('rationale_notes = ?'); values.push(val);
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(params.id);

    if (updates.length === 1) {
      // Only updated_at was added, nothing to update
      return NextResponse.json({ success: true });
    }

    db.prepare(`UPDATE canvases SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Phase 156 hook (KB-40): DB → KB sync after successful UPDATE.
    const row = db.prepare('SELECT * FROM canvases WHERE id = ?').get(params.id) as Record<string, unknown> & { id: string; name: string };
    try {
      await syncResource('canvas', 'update', row, hookCtx('api:canvas.PATCH'));
      invalidateKbIndex();
    } catch (err) {
      const errMsg = (err as Error).message;
      logger.error('kb-sync', 'syncResource failed on PATCH /api/canvas/[id]', {
        entity: 'canvas',
        id: params.id,
        err: errMsg,
      });
      markStale(
        `resources/canvases/${params.id.slice(0, 8)}-${hookSlug(String(row.name ?? ''))}.md`,
        'update-sync-failed',
        { entity: 'canvases', db_id: params.id, error: errMsg },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('canvas', 'Error al actualizar canvas', { canvasId: params.id, error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const canvas = db.prepare('SELECT id, name FROM canvases WHERE id = ?').get(params.id) as { id: string; name: string } | undefined;

    if (!canvas) {
      return NextResponse.json({ error: 'Canvas no encontrado' }, { status: 404 });
    }

    // canvas_runs are deleted automatically by CASCADE
    db.prepare('DELETE FROM canvases WHERE id = ?').run(params.id);

    // Phase 156 hook (KB-40): soft-delete via syncResource('delete') — internally
    // calls markDeprecated. NEVER fs.unlink the KB file.
    try {
      await syncResource('canvas', 'delete', { id: params.id }, hookCtx(
        'api:canvas.DELETE',
        { reason: `DB row deleted at ${new Date().toISOString()}` },
      ));
      invalidateKbIndex();
    } catch (err) {
      const errMsg = (err as Error).message;
      logger.error('kb-sync', 'syncResource failed on DELETE /api/canvas/[id]', {
        entity: 'canvas',
        id: params.id,
        err: errMsg,
      });
      markStale(
        `resources/canvases/${params.id.slice(0, 8)}-${hookSlug(String(canvas.name ?? ''))}.md`,
        'delete-sync-failed',
        { entity: 'canvases', db_id: params.id, error: errMsg },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('canvas', 'Error al eliminar canvas', { canvasId: params.id, error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
