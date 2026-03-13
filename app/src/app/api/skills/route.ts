import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    let query = 'SELECT * FROM skills';
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (category) {
      conditions.push('category = ?');
      values.push(category);
    }
    if (search) {
      conditions.push('(name LIKE ? OR description LIKE ? OR tags LIKE ?)');
      const term = `%${search}%`;
      values.push(term, term, term);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY times_used DESC, created_at DESC';

    const skills = db.prepare(query).all(...values);
    return NextResponse.json(skills);
  } catch (error) {
    logger.error('skills', 'Error obteniendo skills', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, category, tags, instructions, output_template, example_input, example_output, constraints, source, version, author } = body;

    if (!name || !instructions) {
      return NextResponse.json({ error: 'Name and instructions are required' }, { status: 400 });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO skills (id, name, description, category, tags, instructions, output_template, example_input, example_output, constraints, source, version, author, times_used, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      id,
      name,
      description || null,
      category || 'documentation',
      tags ? (typeof tags === 'string' ? tags : JSON.stringify(tags)) : null,
      instructions,
      output_template || null,
      example_input || null,
      example_output || null,
      constraints || null,
      source || 'user',
      version || '1.0',
      author || null,
      now, now
    );

    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
    logger.info('skills', 'Skill creado', { skillId: id, name });
    return NextResponse.json(skill, { status: 201 });
  } catch (error) {
    logger.error('skills', 'Error creando skill', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
