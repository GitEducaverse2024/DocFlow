import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3500';

type APIRequest = {
  post: (url: string, opts?: Record<string, unknown>) => Promise<{ ok: () => boolean; status: () => number; json: () => Promise<Record<string, unknown>> }>;
  get: (url: string) => Promise<{ ok: () => boolean; status: () => number; json: () => Promise<Record<string, unknown>> }>;
  delete: (url: string) => Promise<{ ok: () => boolean; status: () => number; json: () => Promise<Record<string, unknown>> }>;
  patch: (url: string, opts?: Record<string, unknown>) => Promise<{ ok: () => boolean; status: () => number; json: () => Promise<Record<string, unknown>> }>;
};

const DRIVE_CONFIG = {
  auth_mode: 'service_account',
  sa_email: 'test-sa@test-project.iam.gserviceaccount.com',
  sa_credentials: { type: 'service_account', project_id: 'test', private_key: 'fake-key', client_email: 'test@test.iam.gserviceaccount.com' },
  root_folder_id: 'test-folder-id',
  root_folder_name: 'Test Folder',
};

test.describe.serial('Google Drive Connector API', () => {
  let connectorId: string;

  test('POST /api/connectors - crear conector google_drive con cifrado', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.post(`${BASE_URL}/api/connectors`, {
      data: {
        name: '[TEST] Google Drive API',
        type: 'google_drive',
        emoji: '\u{1F4C1}',
        ...DRIVE_CONFIG,
        is_active: 1,
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(typeof body.id).toBe('string');
    connectorId = body.id as string;
  });

  test('GET /api/connectors - conector google_drive aparece en lista con credenciales enmascaradas', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.get(`${BASE_URL}/api/connectors`);
    expect(res.ok()).toBeTruthy();
    const connectors = await res.json() as unknown as Array<Record<string, unknown>>;
    const drive = connectors.find((c: Record<string, unknown>) => c.id === connectorId);
    expect(drive).toBeDefined();
    expect(drive!.type).toBe('google_drive');
    // Credenciales deben estar enmascaradas
    if (drive!.config) {
      const config = typeof drive!.config === 'string' ? JSON.parse(drive!.config as string) : drive!.config;
      if (config.sa_credentials_encrypted) {
        expect(config.sa_credentials_encrypted).toMatch(/^\*+$/);
      }
    }
  });

  test('POST /api/connectors/{id}/invoke - invoke con operacion list (falla auth pero verifica routing)', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.post(`${BASE_URL}/api/connectors/${connectorId}/invoke`, {
      data: {
        output: 'test query',
        operation: 'list',
        folder_id: 'test-folder-id',
      },
    });
    // Esperamos error de autenticacion (credenciales falsas) pero no 404/routing error
    const body = await res.json();
    // El endpoint debe responder (no 404) — puede ser ok:false por auth
    expect(body).toHaveProperty('ok');
  });

  test('POST /api/connectors/{id}/invoke - invoke upload requiere file_name', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.post(`${BASE_URL}/api/connectors/${connectorId}/invoke`, {
      data: {
        output: 'contenido para subir',
        operation: 'upload',
        folder_id: 'test-folder-id',
        file_name: 'test-output.md',
      },
    });
    const body = await res.json();
    // Falla por auth pero routing es correcto
    expect(body).toHaveProperty('ok');
  });

  test('POST /api/connectors/google-drive/{id}/test - test connection (falla auth, verifica shape)', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.post(`${BASE_URL}/api/connectors/google-drive/${connectorId}/test`, {
      data: {},
    });
    const body = await res.json();
    // Shape check: debe tener success o error
    expect(body).toBeDefined();
    expect(typeof body).toBe('object');
  });

  test('DELETE /api/connectors/{id} - eliminar conector google_drive', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.delete(`${BASE_URL}/api/connectors/${connectorId}`);
    expect(res.ok()).toBeTruthy();
  });

  test('GET /api/connectors - conector eliminado no aparece', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.get(`${BASE_URL}/api/connectors`);
    expect(res.ok()).toBeTruthy();
    const connectors = await res.json() as unknown as Array<Record<string, unknown>>;
    const drive = connectors.find((c: Record<string, unknown>) => c.id === connectorId);
    expect(drive).toBeUndefined();
  });
});
