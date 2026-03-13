import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { generateId } from '@/lib/utils';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface TemplateNode {
  id: string;
  [key: string]: unknown;
}

interface TemplateEdge {
  id: string;
  source: string;
  target: string;
  [key: string]: unknown;
}

interface CanvasTemplate {
  id: string;
  name: string;
  emoji: string | null;
  mode: string;
  nodes: string | null;
  edges: string | null;
  preview_svg: string | null;
  times_used: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { templateId, name, description, emoji, tags } = body;

    if (!templateId || !name) {
      return NextResponse.json(
        { error: 'templateId and name are required' },
        { status: 400 }
      );
    }

    const template = db.prepare(
      'SELECT * FROM canvas_templates WHERE id = ?'
    ).get(templateId) as CanvasTemplate | undefined;

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Duplicate nodes with new IDs
    const originalNodes: TemplateNode[] = template.nodes ? JSON.parse(template.nodes) : [];
    const originalEdges: TemplateEdge[] = template.edges ? JSON.parse(template.edges) : [];

    const idMap = new Map<string, string>();

    const newNodes = originalNodes.map(node => {
      const newId = generateId();
      idMap.set(node.id, newId);
      return { ...node, id: newId };
    });

    const newEdges = originalEdges.map(edge => {
      const newId = generateId();
      const newSource = idMap.get(edge.source) || edge.source;
      const newTarget = idMap.get(edge.target) || edge.target;
      return { ...edge, id: newId, source: newSource, target: newTarget };
    });

    const flowData = JSON.stringify({
      nodes: newNodes,
      edges: newEdges,
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    const newId = generateId();

    db.prepare(`
      INSERT INTO canvases (id, name, description, emoji, mode, status, flow_data, thumbnail, tags, is_template, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'idle', ?, ?, ?, 0, datetime('now'), datetime('now'))
    `).run(
      newId,
      name,
      description || null,
      emoji || template.emoji,
      template.mode,
      flowData,
      template.preview_svg || null,
      tags ? JSON.stringify(tags) : null
    );

    db.prepare(
      'UPDATE canvas_templates SET times_used = times_used + 1 WHERE id = ?'
    ).run(templateId);

    return NextResponse.json(
      { id: newId, redirectUrl: `/canvas/${newId}` },
      { status: 201 }
    );
  } catch (error) {
    logger.error('canvas', 'Error creando canvas desde template', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
