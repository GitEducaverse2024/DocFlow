import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { skills } = body;

    if (!Array.isArray(skills) || skills.length === 0) {
      return NextResponse.json({ error: 'Skills array is required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const imported: string[] = [];

    const insert = db.prepare(`
      INSERT INTO skills (id, name, description, category, tags, instructions, output_template, example_input, example_output, constraints, source, source_path, version, author, times_used, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);

    for (const skill of skills) {
      if (!skill.name || !skill.instructions) continue;

      const id = uuidv4();
      insert.run(
        id,
        skill.name,
        skill.description || null,
        skill.category || 'documentation',
        skill.tags ? (typeof skill.tags === 'string' ? skill.tags : JSON.stringify(skill.tags)) : null,
        skill.instructions,
        skill.output_template || null,
        skill.example_input || null,
        skill.example_output || null,
        skill.constraints || null,
        skill.source || 'imported',
        skill.source_path || null,
        skill.version || '1.0',
        skill.author || null,
        now, now
      );
      imported.push(id);
    }

    logger.info('skills', 'Skills importados', { count: imported.length });
    return NextResponse.json({ success: true, imported: imported.length, ids: imported });
  } catch (error) {
    logger.error('skills', 'Error importando skills', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
