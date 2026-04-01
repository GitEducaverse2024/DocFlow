import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3500';

type APIRequest = {
  post: (url: string, opts?: Record<string, unknown>) => Promise<{ ok: () => boolean; status: () => number; json: () => Promise<Record<string, unknown>> }>;
  get: (url: string) => Promise<{ ok: () => boolean; status: () => number; json: () => Promise<Record<string, unknown>> }>;
  delete: (url: string) => Promise<{ ok: () => boolean; status: () => number; json: () => Promise<Record<string, unknown>> }>;
};

test.describe.serial('Email Templates API', () => {
  let connectorId: string;

  test.afterAll(async ({ request }) => {
    // Cleanup: delete test connector if it was created
    if (connectorId) {
      const req = request as unknown as APIRequest;
      try {
        await req.delete(`${BASE_URL}/api/connectors/${connectorId}`);
      } catch { /* ignore cleanup errors */ }
    }
  });

  test('GET /api/email-templates - lista templates activos', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.get(`${BASE_URL}/api/email-templates`);
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Response is a plain array of templates
    const templates = (Array.isArray(body) ? body : (body.templates || [])) as Record<string, unknown>[];
    expect(Array.isArray(templates)).toBeTruthy();
    expect(templates.length).toBeGreaterThanOrEqual(1);

    // Verify first template has required fields
    const first = templates[0];
    expect(first.id).toBeDefined();
    expect(first.name).toBeDefined();
    expect(first.category).toBeDefined();

    // Verify seed template exists
    const seed = templates.find((t) => t.id === 'seed-template-basic');
    expect(seed).toBeDefined();
  });

  test('GET /api/email-templates/[id] - obtiene estructura con bloques', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.get(`${BASE_URL}/api/email-templates/seed-template-basic`);
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.id).toBe('seed-template-basic');
    expect(body.name).toBeDefined();
    expect(body.structure).toBeDefined();

    // Structure may be returned as JSON string or parsed object
    const structure = (typeof body.structure === 'string' ? JSON.parse(body.structure as string) : body.structure) as Record<string, unknown>;
    const sections = structure.sections as Record<string, unknown>;
    expect(sections.header).toBeDefined();
    expect(sections.body).toBeDefined();
    expect(sections.footer).toBeDefined();

    // Verify at least one instruction block exists in body
    const bodySection = sections.body as { rows: { columns: { block: { type: string; text?: string } }[] }[] };
    const instructions: string[] = [];
    for (const row of bodySection.rows) {
      for (const col of row.columns) {
        if (col.block.type === 'instruction' && col.block.text) {
          instructions.push(col.block.text);
        }
      }
    }
    expect(instructions.length).toBeGreaterThanOrEqual(1);
    expect(instructions).toContain('Contenido principal del email');
  });

  test('POST /api/email-templates/[id]/render - genera HTML final', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.post(`${BASE_URL}/api/email-templates/seed-template-basic/render`, {
      data: {
        variables: {
          'Contenido principal del email': '<p>Hola, este es un test de renderizado.</p>',
        },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    const html = body.html as string;
    expect(html).toBeDefined();
    expect(html).toContain('Hola, este es un test de renderizado');
    expect(html).toContain('<!DOCTYPE html');
    expect(html).toContain('table');
  });

  test('POST /api/connectors - crear conector email_template', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.post(`${BASE_URL}/api/connectors`, {
      data: {
        name: '[TEST] Email Template E2E',
        type: 'email_template',
        emoji: '\uD83C\uDFA8',
        config: {
          tools: ['list_email_templates', 'get_email_template', 'render_email_template'],
        },
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();

    expect(body.id).toBeDefined();
    expect(typeof body.id).toBe('string');
    expect(body.type).toBe('email_template');
    connectorId = body.id as string;
  });

  test('GET /api/connectors - email_template aparece en lista', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.get(`${BASE_URL}/api/connectors`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    const connectors = (Array.isArray(body) ? body : ((body.data || []) as Record<string, unknown>[])) as Record<string, unknown>[];
    const emailTemplateConn = connectors.find((c) => c.type === 'email_template');
    expect(emailTemplateConn).toBeDefined();
  });

  test('DELETE /api/connectors/[id] - cleanup conector test', async ({ request }) => {
    // Skip if connector was not created
    if (!connectorId) {
      test.skip();
      return;
    }

    const req = request as unknown as APIRequest;
    const res = await req.delete(`${BASE_URL}/api/connectors/${connectorId}`);
    expect(res.status()).toBe(200);

    // Mark as cleaned up so afterAll doesn't try again
    connectorId = '';
  });

  test('Seed connectors - seed-email-template existe', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.get(`${BASE_URL}/api/connectors`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    const connectors = (Array.isArray(body) ? body : ((body.data || []) as Record<string, unknown>[])) as Record<string, unknown>[];
    const seed = connectors.find(
      (c) => (c.id as string)?.includes('email-template') || (c.name as string)?.includes('Plantillas Email')
    );
    expect(seed).toBeDefined();
  });

  test('Seed skills - maquetador-email existe', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.get(`${BASE_URL}/api/skills`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    const skills = (Array.isArray(body) ? body : ((body.data || body.skills || []) as Record<string, unknown>[])) as Record<string, unknown>[];
    const maquetador = skills.find(
      (s) => s.id === 'maquetador-email' || (s.name as string)?.includes('Maquetador de Email')
    );
    expect(maquetador).toBeDefined();
  });
});
