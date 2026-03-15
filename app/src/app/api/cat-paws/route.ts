import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { generateId } from '@/lib/utils';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode');
    const department = searchParams.get('department');
    const active = searchParams.get('active');

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (mode) {
      conditions.push('cp.mode = ?');
      values.push(mode);
    }
    if (active !== null && active !== undefined && active !== '') {
      conditions.push('cp.is_active = ?');
      values.push(parseInt(active));
    }
    if (department) {
      conditions.push('cp.department_tags LIKE ?');
      values.push(`%"${department}"%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT cp.*,
        (SELECT COUNT(*) FROM cat_paw_skills WHERE paw_id = cp.id) as skills_count,
        (SELECT COUNT(*) FROM cat_paw_catbrains WHERE paw_id = cp.id) as catbrains_count,
        (SELECT COUNT(*) FROM cat_paw_connectors WHERE paw_id = cp.id) as connectors_count,
        (SELECT COUNT(*) FROM cat_paw_agents WHERE paw_id = cp.id) as agents_count
      FROM cat_paws cp
      ${whereClause}
      ORDER BY cp.updated_at DESC
    `;

    const rows = db.prepare(sql).all(...values);
    return NextResponse.json(rows);
  } catch (error) {
    logger.error('cat-paws', 'Error obteniendo cat-paws', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const id = generateId();
    const now = new Date().toISOString();

    const avatarEmoji = body.avatar_emoji || '\uD83D\uDC3E';
    const avatarColor = body.avatar_color || '#8B6D8B';
    const tone = body.tone || 'professional';
    const mode = body.mode || 'chat';
    const model = body.model || 'gemini-main';
    const temperature = body.temperature ?? 0.7;
    const maxTokens = body.max_tokens ?? 4096;
    const outputFormat = body.output_format || 'md';
    const isActive = body.is_active ?? 1;

    let departmentTags: string | null = null;
    if (Array.isArray(body.department_tags)) {
      departmentTags = JSON.stringify(body.department_tags);
    } else if (typeof body.department_tags === 'string') {
      departmentTags = body.department_tags;
    }

    const stmt = db.prepare(`
      INSERT INTO cat_paws (
        id, name, description, avatar_emoji, avatar_color, department_tags,
        system_prompt, tone, mode, model, temperature, max_tokens,
        processing_instructions, output_format, openclaw_id, openclaw_synced_at,
        is_active, times_used, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);

    stmt.run(
      id,
      body.name,
      body.description || null,
      avatarEmoji,
      avatarColor,
      departmentTags,
      body.system_prompt || null,
      tone,
      mode,
      model,
      temperature,
      maxTokens,
      body.processing_instructions || null,
      outputFormat,
      body.openclaw_id || null,
      body.openclaw_synced_at || null,
      isActive,
      now,
      now
    );

    const row = db.prepare('SELECT * FROM cat_paws WHERE id = ?').get(id);

    logger.info('cat-paws', 'CatPaw creado', { pawId: id, name: body.name });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    logger.error('cat-paws', 'Error creando cat-paw', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
