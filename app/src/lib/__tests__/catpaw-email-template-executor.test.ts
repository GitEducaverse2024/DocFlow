/**
 * Phase 137-01 Task 1 — INC-11 + INC-13 regression tests for catpaw-email-template-executor.
 *
 * Covers:
 *   - render_template fails when required variables are missing
 *   - render_template fails when rendered html still contains `{{placeholder}}` residual
 *   - render_template fails when rendered html still contains literal "Contenido principal del email"
 *   - connector_logs.request_payload persists full args (template_id, variables) — not only {operation, pawId}
 *   - connector_logs.response_payload persists real result (html, template_id) — not {ok:true}
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

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

// Mock asset resolver to return structure as-is.
vi.mock('@/lib/services/template-asset-resolver', () => ({
  resolveAssetsForEmail: vi.fn(async (_id: string, structure: unknown) => structure),
}));

// Logger noop
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// generateId stub
vi.mock('@/lib/utils', () => ({
  generateId: () => 'log-id-stub',
}));

import { executeEmailTemplateToolCall } from '@/lib/services/catpaw-email-template-executor';

function makeStructure(instructionTexts: string[]) {
  return {
    sections: {
      header: { rows: [] },
      body: {
        rows: instructionTexts.map((text, idx) => ({
          id: `row-${idx}`,
          columns: [
            {
              id: `col-${idx}`,
              width: '100%',
              block: { type: 'instruction', text },
            },
          ],
        })),
      },
      footer: { rows: [] },
    },
    styles: {
      backgroundColor: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      primaryColor: '#7C3AED',
      textColor: '#333333',
      maxWidth: 600,
    },
  };
}

/**
 * Builds a prepare() router that returns a stub per SQL prefix so the SUT
 * sees a coherent sequence: SELECT template → UPDATE times_used → INSERT connector_logs
 * → UPDATE connectors.times_used.
 */
function setupDbRouter(templateRow: { id: string; name: string; structure: unknown }) {
  const runCalls: unknown[][] = [];
  dbPrepareMock.mockReset();
  dbPrepareMock.mockImplementation((sql: string): PreparedStub => {
    if (/^SELECT id, name, structure FROM email_templates/i.test(sql)) {
      return {
        get: vi.fn().mockReturnValue({
          id: templateRow.id,
          name: templateRow.name,
          structure: JSON.stringify(templateRow.structure),
        }),
        all: vi.fn(),
        run: vi.fn(),
      };
    }
    // UPDATE or INSERT
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

const DISPATCH = {
  connectorId: 'conn-email-tpl-1',
  operation: 'render_template' as const,
};

describe('catpaw-email-template-executor — INC-11 render_template contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1: returns error when required variables are missing', async () => {
    const structure = makeStructure(['resumen', 'detalle']);
    setupDbRouter({ id: 'tpl-1', name: 'Informe', structure });

    const resultStr = await executeEmailTemplateToolCall(
      'paw-1',
      DISPATCH,
      { template_id: 'tpl-1', variables: { resumen: 'hola' } } // detalle missing
    );

    const parsed = JSON.parse(resultStr);
    expect(parsed.error).toBeTruthy();
    expect(String(parsed.error)).toMatch(/variables.*(faltant|obligat|requir)/i);
    expect(String(parsed.error)).toContain('detalle');
    expect(parsed.html).toBeUndefined();
  });

  it('Test 2: success when all required variables are provided (no residual placeholders)', async () => {
    const structure = makeStructure(['resumen']);
    setupDbRouter({ id: 'tpl-2', name: 'Simple', structure });

    const resultStr = await executeEmailTemplateToolCall(
      'paw-1',
      DISPATCH,
      { template_id: 'tpl-2', variables: { resumen: 'Hola mundo' } }
    );

    const parsed = JSON.parse(resultStr);
    expect(parsed.error).toBeUndefined();
    expect(typeof parsed.html).toBe('string');
    expect(parsed.html).toContain('Hola mundo');
    // No residual {{X}}
    expect(parsed.html).not.toMatch(/\{\{[a-z_]/i);
    // Nor the literal default placeholder text.
    expect(parsed.html).not.toContain('Contenido principal del email');
  });

  it('Test 3: returns error when rendered html still contains the literal "Contenido principal del email" placeholder', async () => {
    // Build a template whose instruction block text IS literally "Contenido principal del email".
    // If the wrapper forgets this variable, the renderer emits the default placeholder
    // `[Contenido principal del email]` wrapped in a dashed div — a silent fail INC-11.
    const structure = makeStructure(['Contenido principal del email']);
    setupDbRouter({ id: 'tpl-3', name: 'Informe-default', structure });

    const resultStr = await executeEmailTemplateToolCall(
      'paw-1',
      DISPATCH,
      { template_id: 'tpl-3', variables: {} } // caller forgets everything
    );

    const parsed = JSON.parse(resultStr);
    expect(parsed.error).toBeTruthy();
    expect(String(parsed.error)).toMatch(/Contenido principal del email|placeholder|variables/i);
  });

  it('Test 4 (INC-13): connector_logs.request_payload persists full args including template_id and variables', async () => {
    const structure = makeStructure(['resumen']);
    const runCalls = setupDbRouter({ id: 'tpl-4', name: 'LoggingCheck', structure });

    await executeEmailTemplateToolCall(
      'paw-logging',
      DISPATCH,
      { template_id: 'tpl-4', variables: { resumen: 'payload test' } }
    );

    const logCall = findConnectorLogCall(runCalls);
    expect(logCall).toBeDefined();
    // log call shape: [sql, id, connector_id, request_payload, response_payload, status, duration_ms, created_at]
    const requestPayload = String(logCall![3]);
    expect(requestPayload).toContain('template_id');
    expect(requestPayload).toContain('tpl-4');
    expect(requestPayload).toContain('variables');
    expect(requestPayload).toContain('resumen');
    expect(requestPayload).toContain('payload test');
  });

  it('Test 5 (INC-13): connector_logs.response_payload persists real result (html + template_id), NOT {ok:true}', async () => {
    const structure = makeStructure(['resumen']);
    const runCalls = setupDbRouter({ id: 'tpl-5', name: 'ResponseLog', structure });

    await executeEmailTemplateToolCall(
      'paw-logging',
      DISPATCH,
      { template_id: 'tpl-5', variables: { resumen: 'contenido real' } }
    );

    const logCall = findConnectorLogCall(runCalls);
    expect(logCall).toBeDefined();
    const responsePayload = String(logCall![4]);
    // Must NOT be the old {ok:true} sentinel as the entire payload
    expect(responsePayload).not.toBe('{"ok":true}');
    // Must contain real data
    expect(responsePayload).toContain('template_id');
    expect(responsePayload).toContain('tpl-5');
    expect(responsePayload).toContain('html');
    expect(responsePayload).toContain('contenido real');
  });
});
