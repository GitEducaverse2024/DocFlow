import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { generateId } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode');
    const status = searchParams.get('status');

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (mode) {
      conditions.push('mode = ?');
      values.push(mode);
    }
    if (status) {
      conditions.push('status = ?');
      values.push(status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const canvases = db.prepare(
      `SELECT id, name, emoji, description, mode, status, thumbnail, tags, is_template, node_count, created_at, updated_at
       FROM canvases
       ${where}
       ORDER BY updated_at DESC`
    ).all(...values);

    return NextResponse.json(canvases);
  } catch (error) {
    console.error('Error al obtener canvases:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, emoji, mode, tags } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const id = generateId();
    const startNodeId = generateId();
    const now = new Date().toISOString();

    const defaultFlowData = JSON.stringify({
      nodes: [
        {
          id: startNodeId,
          type: 'start',
          position: { x: 250, y: 200 },
          data: { label: 'Inicio' }
        }
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    });

    db.prepare(
      `INSERT INTO canvases (id, name, description, emoji, mode, status, flow_data, tags, is_template, node_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'idle', ?, ?, 0, 1, ?, ?)`
    ).run(
      id,
      name.trim(),
      description || null,
      emoji || '🔷',
      mode || 'mixed',
      defaultFlowData,
      tags ? JSON.stringify(tags) : null,
      now,
      now
    );

    return NextResponse.json(
      { id, redirectUrl: `/canvas/${id}` },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error al crear canvas:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
