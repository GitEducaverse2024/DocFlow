import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { generateId } from '@/lib/utils';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = params;

  try {
    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const original = db.prepare(
      'SELECT id, name, description, emoji, mode, flow_data, tags FROM canvases WHERE id = ?'
    ).get(id) as { id: string; name: string; description: string | null; emoji: string; mode: string; flow_data: string | null; tags: string | null } | undefined;

    if (!original) {
      return NextResponse.json({ error: 'Canvas no encontrado' }, { status: 404 });
    }

    // Rewrite node/edge IDs so the fork is fully independent
    let flowData = original.flow_data;
    let nodeCount = 0;
    if (flowData) {
      try {
        const parsed = JSON.parse(flowData);
        const idMap: Record<string, string> = {};

        if (parsed.nodes && Array.isArray(parsed.nodes)) {
          nodeCount = parsed.nodes.length;
          for (const node of parsed.nodes) {
            const newId = generateId();
            idMap[node.id] = newId;
            node.id = newId;
          }
        }

        if (parsed.edges && Array.isArray(parsed.edges)) {
          for (const edge of parsed.edges) {
            edge.id = generateId();
            if (idMap[edge.source]) edge.source = idMap[edge.source];
            if (idMap[edge.target]) edge.target = idMap[edge.target];
          }
        }

        flowData = JSON.stringify(parsed);
      } catch {
        // Keep original flow_data if parse fails
      }
    }

    const newId = generateId();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO canvases (id, name, description, emoji, mode, status, flow_data, tags, is_template, node_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'idle', ?, ?, 0, ?, ?, ?)`
    ).run(
      newId,
      name.trim(),
      original.description,
      original.emoji,
      original.mode,
      flowData,
      original.tags,
      nodeCount,
      now,
      now
    );

    logger.info('canvas', 'Canvas forkeado', { originalId: id, newId });

    const created = db.prepare(
      'SELECT id, name, emoji, description, mode, status, node_count, created_at, updated_at FROM canvases WHERE id = ?'
    ).get(newId);

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    logger.error('canvas', 'Error al forkear canvas', { canvasId: id, error: (error as Error).message });
    return NextResponse.json({ error: 'Error al forkear canvas' }, { status: 500 });
  }
}
