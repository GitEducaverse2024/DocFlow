import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { sendEmail } from '@/lib/services/email-service';
import type { EmailTemplate, TemplateStructure, GmailConfig } from '@/lib/types';
import { renderTemplate } from '@/lib/services/template-renderer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Verify template exists
    const template = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id) as EmailTemplate | undefined;
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const to: string = body.to;
    const htmlOverride: string | undefined = body.html;

    if (!to || typeof to !== 'string' || !to.includes('@')) {
      return NextResponse.json({ error: 'Valid email address required' }, { status: 400 });
    }

    // Get HTML — prefer caller-supplied (already rendered client-side) over re-rendering
    let html = htmlOverride;
    if (!html) {
      let structure: TemplateStructure;
      try {
        structure = JSON.parse(template.structure);
      } catch {
        return NextResponse.json({ error: 'Invalid template structure' }, { status: 500 });
      }
      const rendered = renderTemplate(structure, {});
      html = rendered.html;
    }

    // Find first active Gmail connector
    const connector = db.prepare(
      "SELECT id, name, config FROM connectors WHERE type = 'gmail' AND is_active = 1 ORDER BY created_at ASC LIMIT 1"
    ).get() as { id: string; name: string; config: string | null } | undefined;

    if (!connector || !connector.config) {
      return NextResponse.json(
        { error: 'No active Gmail connector found. Configure a Gmail connector first.' },
        { status: 422 }
      );
    }

    let gmailConfig: GmailConfig;
    try {
      gmailConfig = JSON.parse(connector.config);
    } catch {
      return NextResponse.json({ error: 'Invalid Gmail connector config' }, { status: 500 });
    }

    const result = await sendEmail(gmailConfig, {
      to,
      subject: `[Test] ${template.name}`,
      html_body: html,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ sent: true, messageId: result.messageId });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
