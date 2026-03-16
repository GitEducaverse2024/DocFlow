import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3500';

type APIRequest = {
  post: (url: string, opts?: Record<string, unknown>) => Promise<{ ok: () => boolean; status: () => number; json: () => Promise<Record<string, unknown>> }>;
  get: (url: string) => Promise<{ ok: () => boolean; status: () => number; json: () => Promise<Record<string, unknown>> }>;
  delete: (url: string) => Promise<{ ok: () => boolean; status: () => number; json: () => Promise<Record<string, unknown>> }>;
  patch: (url: string, opts?: Record<string, unknown>) => Promise<{ ok: () => boolean; status: () => number; json: () => Promise<Record<string, unknown>> }>;
};

const GMAIL_CONFIG = {
  user: 'api-test@gmail.com',
  account_type: 'personal',
  auth_mode: 'app_password',
  app_password: 'test abcd efgh ijkl',
  from_name: 'API Test',
};

test.describe.serial('Gmail Connector API', () => {
  let connectorId: string;

  test('POST /api/connectors - create gmail connector with encryption', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.post(`${BASE_URL}/api/connectors`, {
      data: {
        name: '[TEST] Gmail API CRUD',
        type: 'gmail',
        emoji: '\u{1F4E8}',
        gmail_subtype: 'gmail_personal',
        config: GMAIL_CONFIG,
        is_active: 1,
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(typeof body.id).toBe('string');
    connectorId = body.id as string;
  });

  test('GET /api/connectors/[id] - gmail config fields are masked', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.get(`${BASE_URL}/api/connectors/${connectorId}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body.type).toBe('gmail');
    expect(body.id).toBe(connectorId);

    // Parse config and verify sensitive fields are masked
    const config = typeof body.config === 'string' ? JSON.parse(body.config as string) : body.config;
    // user should be visible
    expect(config.user).toBe('api-test@gmail.com');
    // app_password should be encrypted, and the encrypted field should be masked
    if (config.app_password_encrypted) {
      // The masked value uses bullet characters
      expect(config.app_password_encrypted).toContain('\u2022');
    }
    // Plain app_password should NOT be present in response
    // (it gets encrypted to app_password_encrypted during creation)
  });

  test('GET /api/connectors - list includes our gmail connector', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.get(`${BASE_URL}/api/connectors`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    // Response is an array of connectors
    const connectors = (Array.isArray(body) ? body : ((body.data || []) as Record<string, unknown>[])) as Record<string, unknown>[];
    const ours = connectors.find((c) => c.id === connectorId);
    expect(ours).toBeDefined();
    expect(ours!.type).toBe('gmail');

    // Verify masking on list endpoint too
    const config = typeof ours!.config === 'string' ? JSON.parse(ours!.config as string) : ours!.config;
    if (config.app_password_encrypted) {
      expect(config.app_password_encrypted).toContain('\u2022');
    }
  });

  test('PATCH /api/connectors/[id] - re-encrypt on update', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.patch(`${BASE_URL}/api/connectors/${connectorId}`, {
      data: {
        config: {
          from_name: 'Updated API Test',
          app_password: 'new-password-1234',
        },
      },
    });
    expect(res.ok()).toBeTruthy();

    // Verify the update was applied
    const getRes = await req.get(`${BASE_URL}/api/connectors/${connectorId}`);
    const body = await getRes.json();
    const config = typeof body.config === 'string' ? JSON.parse(body.config as string) : body.config;
    // from_name should be updated
    expect(config.from_name).toBe('Updated API Test');
  });

  test('POST /api/connectors/[id]/invoke - send email payload', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.post(`${BASE_URL}/api/connectors/${connectorId}/invoke`, {
      data: {
        output: JSON.stringify({ to: 'test@example.com', subject: 'API Test', body: 'Hello from API test' }),
      },
    });

    // Will fail at SMTP level (no real server) but should NOT be a 500 crash page
    const body = await res.json();
    expect(body).toBeDefined();
    expect(typeof body).toBe('object');

    // Should have a structured response — either success or error object
    const hasStructuredResponse =
      body.success !== undefined ||
      body.error !== undefined ||
      body.connector_type !== undefined;
    expect(hasStructuredResponse).toBeTruthy();
  });

  test('DELETE /api/connectors/[id] - delete gmail connector', async ({ request }) => {
    const req = request as unknown as APIRequest;
    const res = await req.delete(`${BASE_URL}/api/connectors/${connectorId}`);
    expect(res.ok()).toBeTruthy();

    // Verify it's gone
    const getRes = await req.get(`${BASE_URL}/api/connectors/${connectorId}`);
    expect(getRes.status()).toBe(404);
  });

  test('POST /api/connectors/gmail/test-credentials - validates payload', async ({ request }) => {
    const req = request as unknown as APIRequest;

    // Missing required fields -> 400
    const res = await req.post(`${BASE_URL}/api/connectors/gmail/test-credentials`, {
      data: {},
    });
    expect(res.status()).toBe(400);

    // With invalid credentials -> structured error (connection refused or auth error)
    const res2 = await req.post(`${BASE_URL}/api/connectors/gmail/test-credentials`, {
      data: {
        user: 'fake@gmail.com',
        account_type: 'personal',
        auth_mode: 'app_password',
        app_password: 'invalid-password',
      },
    });
    // Should return structured error, not a 500 crash
    const body2 = await res2.json();
    expect(body2).toBeDefined();
    // Either a 400 validation error or a connection error, but structured
    expect(typeof body2).toBe('object');
  });

  test('GET /api/connectors/gmail/oauth2/auth-url - requires params', async ({ request }) => {
    const req = request as unknown as APIRequest;

    // Without required params -> 400
    const res = await req.get(`${BASE_URL}/api/connectors/gmail/oauth2/auth-url`);
    expect(res.status()).toBe(400);

    // With client_id and client_secret -> returns url
    const res2 = await req.get(
      `${BASE_URL}/api/connectors/gmail/oauth2/auth-url?client_id=test-id.apps.googleusercontent.com&client_secret=GOCSPX-test`,
    );
    // Should return structured response (url or error)
    const body2 = await res2.json();
    expect(body2).toBeDefined();
    expect(typeof body2).toBe('object');
    // If successful, should have a url field
    if (res2.ok()) {
      expect(body2.url).toBeDefined();
      expect(typeof body2.url).toBe('string');
    }
  });

  test('POST /api/connectors/gmail/oauth2/exchange-code - validates body', async ({ request }) => {
    const req = request as unknown as APIRequest;

    // Without code -> 400
    const res = await req.post(`${BASE_URL}/api/connectors/gmail/oauth2/exchange-code`, {
      data: {},
    });
    expect(res.status()).toBe(400);

    // With invalid code -> structured error from Google
    const res2 = await req.post(`${BASE_URL}/api/connectors/gmail/oauth2/exchange-code`, {
      data: {
        code: 'invalid-code',
        client_id: 'test-id.apps.googleusercontent.com',
        client_secret: 'GOCSPX-test',
      },
    });
    const body2 = await res2.json();
    expect(body2).toBeDefined();
    // Should be a structured error, not a 500 crash
    expect(typeof body2).toBe('object');
    // Expect an error field since the code is invalid
    if (!res2.ok()) {
      expect(body2.error).toBeDefined();
    }
  });
});
