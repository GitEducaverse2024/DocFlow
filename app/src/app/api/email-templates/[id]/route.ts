import { NextResponse } from 'next/server';
import db from '@/lib/db';
import type { EmailTemplate } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Support lookup by ID or ref_code
  const template = (
    db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id) ||
    db.prepare('SELECT * FROM email_templates WHERE ref_code = ?').get(id)
  ) as EmailTemplate | undefined;
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const assets = db.prepare('SELECT * FROM template_assets WHERE template_id = ? ORDER BY created_at').all(template.id);
  return NextResponse.json({ ...template, assets });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = db.prepare('SELECT id FROM email_templates WHERE id = ?').get(id);
    if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description); }
    if (body.category !== undefined) { updates.push('category = ?'); values.push(body.category); }
    if (body.structure !== undefined) {
      const s = typeof body.structure === 'string' ? body.structure : JSON.stringify(body.structure);
      updates.push('structure = ?'); values.push(s);
    }
    if (body.html_preview !== undefined) { updates.push('html_preview = ?'); values.push(body.html_preview); }
    if (body.is_active !== undefined) { updates.push('is_active = ?'); values.push(body.is_active); }
    if (body.drive_folder_id !== undefined) { updates.push('drive_folder_id = ?'); values.push(body.drive_folder_id); }

    if (updates.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    db.prepare(`UPDATE email_templates SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = db.prepare('SELECT id FROM email_templates WHERE id = ?').get(id);
  if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  db.prepare('DELETE FROM email_templates WHERE id = ?').run(id);
  return NextResponse.json({ deleted: true });
}
