import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { renderTemplate } from '@/lib/services/template-renderer';
import { resolveAssetsForEmail } from '@/lib/services/template-asset-resolver';
import type { EmailTemplate, TemplateStructure } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Support lookup by ID or ref_code
    const template = (
      db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id) ||
      db.prepare('SELECT * FROM email_templates WHERE ref_code = ?').get(id)
    ) as EmailTemplate | undefined;
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const variables = (body.variables as Record<string, string>) || {};

    let structure: TemplateStructure;
    try {
      structure = JSON.parse(template.structure);
    } catch {
      return NextResponse.json({ error: 'Invalid template structure JSON' }, { status: 500 });
    }

    // Resolve local assets to public Drive URLs before rendering
    structure = await resolveAssetsForEmail(id, structure);

    const { html, text } = renderTemplate(structure, variables);

    // Update times_used
    db.prepare('UPDATE email_templates SET times_used = times_used + 1, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);

    return NextResponse.json({ html, text });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
