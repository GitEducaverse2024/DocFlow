/**
 * Phase 137-01 Task 2 — INC-12 + INC-13 regression tests for catpaw-gmail-executor.
 *
 * Covers:
 *   - send_email rejects args missing to / subject / body|html_body
 *   - send_email returns error when sendEmail() response has no messageId
 *   - send_email returns success JSON with messageId when conector OK
 *   - connector_logs.request_payload persists real args (not {operation,pawId})
 *   - connector_logs.response_payload persists messageId in success
 *   - empty-string body is treated as missing
 *   - knowledge tree canvas.json + catflow.json document INC-11/INC-12
 *   - redaction policy doc exists with required sections
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock better-sqlite3 db BEFORE importing the SUT.
type PreparedStub = {
  get: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
};

const dbPrepareMock = vi.fn();
vi.mock('@/lib/db', () => ({
  default: { prepare: (sql: string) => dbPrepareMock(sql) },
}));

// Logger noop
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// generateId stub
vi.mock('@/lib/utils', () => ({
  generateId: () => 'log-id-stub',
}));

// Gmail reader operations mocked (not used by send_email path but imported at module load).
vi.mock('@/lib/services/gmail-reader', () => ({
  listEmails: vi.fn(),
  readEmail: vi.fn(),
  searchEmails: vi.fn(),
  draftEmail: vi.fn(),
  markAsRead: vi.fn(),
  replyToMessage: vi.fn(),
  getThread: vi.fn(),
}));

// Mock sendEmail producer — controlled per test.
const sendEmailMock = vi.fn();
vi.mock('@/lib/services/email-service', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

import { executeGmailToolCall } from '@/lib/services/catpaw-gmail-executor';

/** Set up the db mock to return a valid gmail connector row plus passthrough for logs. */
function setupConnector(): unknown[][] {
  const runCalls: unknown[][] = [];
  dbPrepareMock.mockReset();
  dbPrepareMock.mockImplementation((sql: string): PreparedStub => {
    if (/SELECT \* FROM connectors/i.test(sql)) {
      return {
        get: vi.fn().mockReturnValue({
          id: 'conn-gmail-1',
          type: 'gmail',
          config: JSON.stringify({ oauth_token: 'stub' }),
          is_active: 1,
        }),
        all: vi.fn(),
        run: vi.fn(),
      };
    }
    return {
      get: vi.fn(),
      all: vi.fn(),
      run: vi.fn((...args: unknown[]) => {
        runCalls.push([sql, ...args]);
      }),
    };
  });
  return runCalls;
}

function findConnectorLogCall(runCalls: unknown[][]): unknown[] | undefined {
  return runCalls.find(
    (c) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO connector_logs')
  );
}

const DISPATCH = { connectorId: 'conn-gmail-1', operation: 'send_email' as const };

describe('catpaw-gmail-executor — INC-12 send_email strict validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1: missing "to" → error, sendEmail NOT called', async () => {
    setupConnector();
    const res = await executeGmailToolCall('paw-1', DISPATCH, {
      subject: 'x',
      body: 'y',
    });
    const parsed = JSON.parse(res);
    expect(parsed.error).toMatch(/to/i);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('Test 2: missing "subject" → error, sendEmail NOT called', async () => {
    setupConnector();
    const res = await executeGmailToolCall('paw-1', DISPATCH, {
      to: 'a@b.c',
      body: 'y',
    });
    const parsed = JSON.parse(res);
    expect(parsed.error).toMatch(/subject/i);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('Test 3: missing body AND html_body → error (INC-12 core)', async () => {
    setupConnector();
    const res = await executeGmailToolCall('paw-1', DISPATCH, {
      to: 'a@b.c',
      subject: 'hola',
    });
    const parsed = JSON.parse(res);
    expect(parsed.error).toMatch(/body|html_body/i);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('Test 4: sendEmail returns {ok:true} without messageId → error (not silent success)', async () => {
    setupConnector();
    sendEmailMock.mockResolvedValueOnce({ ok: true });
    const res = await executeGmailToolCall('paw-1', DISPATCH, {
      to: 'a@b.c',
      subject: 'hola',
      body: 'contenido',
    });
    const parsed = JSON.parse(res);
    expect(parsed.error).toMatch(/messageId/i);
    expect(parsed.messageId).toBeUndefined();
  });

  it('Test 5: sendEmail returns {ok:true, messageId} → success, result contains messageId', async () => {
    setupConnector();
    sendEmailMock.mockResolvedValueOnce({ ok: true, messageId: '<abc@educa>' });
    const res = await executeGmailToolCall('paw-1', DISPATCH, {
      to: 'a@b.c',
      subject: 'hola',
      body: 'contenido',
    });
    const parsed = JSON.parse(res);
    expect(parsed.error).toBeUndefined();
    expect(parsed.messageId).toBe('<abc@educa>');
  });

  it('Test 6 (INC-13): request_payload persists full args (to, subject, body_len)', async () => {
    const runCalls = setupConnector();
    sendEmailMock.mockResolvedValueOnce({ ok: true, messageId: '<mid@x>' });
    await executeGmailToolCall('paw-logging', DISPATCH, {
      to: 'antonio@example.com',
      subject: 'Informe Q1',
      body: 'Adjunto el informe',
    });
    const logCall = findConnectorLogCall(runCalls);
    expect(logCall).toBeDefined();
    const requestPayload = String(logCall![3]);
    expect(requestPayload).toContain('antonio@example.com');
    expect(requestPayload).toContain('Informe Q1');
    // body may be persisted as body_len OR inline; policy says body_len.
    expect(requestPayload).toMatch(/body_len|"body":/);
    expect(requestPayload).not.toBe('{"operation":"send_email","pawId":"paw-logging"}');
  });

  it('Test 7 (INC-13): response_payload persists messageId', async () => {
    const runCalls = setupConnector();
    sendEmailMock.mockResolvedValueOnce({ ok: true, messageId: '<msg-007@educa>' });
    await executeGmailToolCall('paw-logging', DISPATCH, {
      to: 'a@b.c',
      subject: 's',
      body: 'b',
    });
    const logCall = findConnectorLogCall(runCalls);
    expect(logCall).toBeDefined();
    const responsePayload = String(logCall![4]);
    expect(responsePayload).toContain('<msg-007@educa>');
    expect(responsePayload).not.toBe('{"ok":true}');
  });

  it('Test 8: empty-string body + empty html_body → error', async () => {
    setupConnector();
    const res = await executeGmailToolCall('paw-1', DISPATCH, {
      to: 'a@b.c',
      subject: 's',
      body: '',
      html_body: '',
    });
    const parsed = JSON.parse(res);
    expect(parsed.error).toMatch(/body|html_body/i);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe('Knowledge tree + redaction policy (Task 2 PASO 5-7)', () => {
  const REPO_ROOT = path.resolve(__dirname, '../../../..');

  it('Test 9: canvas.json documents INC-11 and INC-12 as common_errors', () => {
    const canvasJson = fs.readFileSync(
      path.join(REPO_ROOT, 'app/data/knowledge/canvas.json'),
      'utf-8'
    );
    expect(canvasJson).toContain('INC-11');
    expect(canvasJson).toContain('INC-12');
  });

  it('Test 9b: catflow.json documents INC-11 and INC-12 as common_errors', () => {
    const catflowJson = fs.readFileSync(
      path.join(REPO_ROOT, 'app/data/knowledge/catflow.json'),
      'utf-8'
    );
    expect(catflowJson).toContain('INC-11');
    expect(catflowJson).toContain('INC-12');
  });

  it('Test 10: redaction policy doc exists with required sections', () => {
    const policyPath = path.join(REPO_ROOT, '.planning/knowledge/connector-logs-redaction-policy.md');
    expect(fs.existsSync(policyPath)).toBe(true);
    const content = fs.readFileSync(policyPath, 'utf-8');
    expect(content).toMatch(/Campos persistidos/i);
    expect(content).toMatch(/Campos redactados/i);
    expect(content).toMatch(/Debug mode/i);
  });
});
