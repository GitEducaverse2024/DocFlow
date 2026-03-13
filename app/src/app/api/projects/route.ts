import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const projects = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC LIMIT ? OFFSET ?').all(limit, offset);
    const total = db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number };

    return NextResponse.json({
      data: projects,
      pagination: {
        total: total.count,
        page,
        limit,
        totalPages: Math.ceil(total.count / limit)
      }
    });
  } catch (error) {
    logger.error('system', 'Error obteniendo proyectos', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, purpose, tech_stack, agent_id, status = 'draft' } = body;

    if (!name || !purpose) {
      return NextResponse.json({ error: 'Name and purpose are required' }, { status: 400 });
    }

    const id = uuidv4();
    const techStackJson = tech_stack ? JSON.stringify(tech_stack) : null;

    const stmt = db.prepare(`
      INSERT INTO projects (id, name, description, purpose, tech_stack, agent_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, name, description || null, purpose, techStackJson, agent_id || null, status);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);

    logger.info('system', 'Proyecto creado', { projectId: id, name });
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    logger.error('system', 'Error creando proyecto', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
