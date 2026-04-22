---
phase: 159-backend-passthrough-litellm-reasoning
plan: 04
type: execute
wave: 3
depends_on:
  - 159-01
  - 159-02
files_modified:
  - app/src/app/api/catbot/chat/route.ts
  - app/src/app/api/catbot/chat/__tests__/route.test.ts
autonomous: true
requirements:
  - PASS-03
  - PASS-04
must_haves:
  truths:
    - "CatBot chat route migra la línea 119 de resolveAlias('catbot') a resolveAliasConfig('catbot') — única migración de los 15+ callers"
    - "Streaming path (línea 199): streamLiteLLM recibe reasoning_effort, thinking, max_tokens resueltos del AliasConfig"
    - "Non-streaming path (línea 459): el inline fetch body incluye reasoning_effort + thinking + max_tokens con la MISMA serialización que streamLiteLLM (ambos spreads condicionales, 'off' omitido)"
    - "max_tokens resolution order: cfg.max_tokens ?? 2048 (preserva el hardcoded fallback histórico)"
    - "reasoning_effort 'off' o null → NO se envía a LiteLLM (omitido del body)"
    - "thinking_budget null → thinking undefined → NO se envía a LiteLLM"
    - "thinking_budget presente → {type:'enabled', budget_tokens: cfg.thinking_budget}"
    - "Back-compat callers del chat route: el endpoint HTTP no cambia (body IN inchanged, body OUT inchanged). Solo cambia qué envía a LiteLLM."
    - "Wave 0: tests para la chat route SE CREAN en este plan — archivo nuevo app/src/app/api/catbot/chat/__tests__/route.test.ts con mocks de streamLiteLLM, resolveAliasConfig, fetch (non-streaming), db, etc."
    - "CatBot oracle-verifiable (CLAUDE.md): un usuario puede decir 'cambia catbot a opus con reasoning high via sudo' y la siguiente request streamea reasoning — aunque la verificación end-to-end es Phase 161 VER-01..VER-03"
  artifacts:
    - path: "app/src/app/api/catbot/chat/route.ts"
      provides: "Migración resolveAlias → resolveAliasConfig + propagación de reasoning params a ambas call sites (streaming L199, non-streaming L459)"
      contains: "resolveAliasConfig"
    - path: "app/src/app/api/catbot/chat/__tests__/route.test.ts"
      provides: "Tests Vitest para PASS-03 y PASS-04 (streaming + non-streaming param propagation + max_tokens fallback)"
      min_lines: 180
  key_links:
    - from: "app/src/app/api/catbot/chat/route.ts (line 119 post-edit)"
      to: "resolveAliasConfig de @/lib/services/alias-routing (Plan 01)"
      via: "const cfg = await resolveAliasConfig('catbot')"
      pattern: "resolveAliasConfig\\('catbot'\\)"
    - from: "app/src/app/api/catbot/chat/route.ts (line 199 streaming)"
      to: "streamLiteLLM StreamOptions reasoning_effort + thinking + max_tokens (Plan 02)"
      via: "streamLiteLLM({ model, messages, max_tokens, tools, reasoning_effort, thinking }, callbacks)"
      pattern: "streamLiteLLM\\([^)]*reasoning_effort"
    - from: "app/src/app/api/catbot/chat/route.ts (line 459 non-streaming)"
      to: "inline fetch body JSON (symmetric with streamLiteLLM)"
      via: "body: JSON.stringify({..., ...(reasoning_effort && reasoning_effort !== 'off' ? {reasoning_effort} : {}), ...(thinking ? {thinking} : {}), max_tokens})"
      pattern: "reasoning_effort.*!==.*'off'"
---

<objective>
Migrar `/api/catbot/chat/route.ts` para consumir el alias config completo de Plan 01 (`resolveAliasConfig`) y propagarlo a **ambas** call sites a LiteLLM: streaming (línea 199 via `streamLiteLLM` de Plan 02) y non-streaming (línea 459 via inline `fetch`). El research es enfático (Pitfall #1) que esta es la **única** migración de los 15+ callers — todos los demás siguen usando `resolveAlias()` shim. `max_tokens` ahora se resuelve del alias config con fallback al hardcoded 2048. `reasoning_effort === 'off'` se omite en la serialización (research Pitfall #2).

Purpose: Cubre requirements **PASS-03 + PASS-04**. Es el punto de convergencia de Plans 01 (config) + 02 (wire) + 03 (validation): los valores que el user configura via PATCH llegan a LiteLLM via esta ruta. Sin este plan, Plans 01-03 son teoría; este plan los hace ejecutables en el chat del usuario.

Output: `route.ts` con:
- Import cambiado (`resolveAlias` → `resolveAliasConfig`).
- Línea 119 migrada a `const cfg = await resolveAliasConfig('catbot')`; model/reasoning_effort/thinking/max_tokens derivados de `cfg` post-`resolveAliasConfig`.
- Línea 199 (streaming): `streamLiteLLM` recibe los 3 nuevos campos.
- Línea 459 (non-streaming): body JSON inline recibe los 3 nuevos campos con la MISMA serialización que stream-utils (research Pitfall #1).

**Wave 0 deliverable**: archivo nuevo `__tests__/route.test.ts` — no existía previamente y es requisito de 159-VALIDATION.md para verificar PASS-03 y PASS-04.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/159-backend-passthrough-litellm-reasoning/159-RESEARCH.md
@.planning/phases/159-backend-passthrough-litellm-reasoning/159-VALIDATION.md
@.planning/phases/159-backend-passthrough-litellm-reasoning/159-01-alias-config-service-PLAN.md
@.planning/phases/159-backend-passthrough-litellm-reasoning/159-02-stream-utils-passthrough-PLAN.md
@app/src/app/api/catbot/chat/route.ts
@app/src/lib/services/alias-routing.ts
@app/src/lib/services/stream-utils.ts

<interfaces>
<!-- FROM Plan 159-01 (available at wave 3): -->

```typescript
export interface AliasConfig {
  model: string;
  reasoning_effort: 'off' | 'low' | 'medium' | 'high' | null;
  max_tokens: number | null;
  thinking_budget: number | null;
}
export async function resolveAliasConfig(alias: string): Promise<AliasConfig>;

// Back-compat shim — OTHER callers keep using this; ONLY chat route migrates:
export async function resolveAlias(alias: string): Promise<string>;  // unchanged
```

<!-- FROM Plan 159-02 (available at wave 3): -->

```typescript
export interface StreamOptions {
  model: string;
  messages: Array<{role, content, tool_calls?, tool_call_id?}>;
  max_tokens?: number;
  tools?: unknown[];
  reasoning_effort?: 'off' | 'low' | 'medium' | 'high';  // Phase 159
  thinking?: { type: 'enabled'; budget_tokens: number };  // Phase 159
}
```

<!-- CURRENT chat route anchors (lines referenced in research): -->

```typescript
// Line 11 — import:
import { resolveAlias } from '@/lib/services/alias-routing';

// Line 119 — resolveAlias call (ONLY caller that migrates):
const model = requestedModel || catbotConfig.model || await resolveAlias('catbot');

// Line 199 — streaming call to streamLiteLLM (propagate reasoning_effort, thinking, max_tokens):
await streamLiteLLM(
  { model, messages: llmMessages, max_tokens: 2048, tools: tools.length > 0 ? tools : undefined },
  { /* callbacks */ }
);

// Line 459 — non-streaming inline fetch (symmetric propagation, serialization must match streamLiteLLM):
const llmResponse = await fetch(`${litellmUrl}/v1/chat/completions`, {
  method: 'POST',
  headers: { ... },
  body: JSON.stringify({
    model, messages: llmMessages, tools: tools.length > 0 ? tools : undefined, max_tokens: 2048,
  }),
});
```

<!-- Current catbot chat route has NO tests file. Wave 0 creates one. Mocks needed:
     streamLiteLLM, resolveAliasConfig, getToolsForLLM, getSudoToolsForLLM, db, logger, fetch,
     buildPrompt, matchRecipe, ensureProfile, deriveUserId, buildConversationWindow,
     parseComplexityPrefix, saveComplexityDecision, executeTool, isHoldedTool, isSudoTool. -->

<!-- Validation/test strategy: the route file is 740+ lines with many responsibilities. The tests
     focus on the NARROW PASS-03/PASS-04 contract — what values are passed to streamLiteLLM / fetch
     — not on end-to-end flow. This is a surgical test, not a flow test. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 (Wave 0): Crear archivo de tests — PASS-03 + PASS-04 (RED)</name>
  <files>app/src/app/api/catbot/chat/__tests__/route.test.ts</files>
  <behavior>
    - Crear archivo NUEVO con 3 describes:
      - describe('POST /api/catbot/chat — resolveAliasConfig migration (PASS-04)') con:
        - Test PASS-04a — "streaming: resolveAliasConfig values reach streamLiteLLM":
            resolveAliasConfig mock devuelve {model:'anthropic/claude-opus-4-6', reasoning_effort:'high', max_tokens:8000, thinking_budget:4000}.
            Enviar POST body {messages:[...], stream:true}.
            Assert: streamLiteLLM mock llamado una vez con options conteniendo `reasoning_effort:'high'`, `thinking:{type:'enabled', budget_tokens:4000}`, `max_tokens:8000`.
        - Test PASS-04b — "streaming: reasoning_effort='off' is passed through as-is (stream-utils handles omission)":
            resolveAliasConfig mock devuelve {..., reasoning_effort:'off', thinking_budget:null}.
            Assert: streamLiteLLM recibe `reasoning_effort:'off'` (stream-utils omite en el body; esta capa solo propaga).
        - Test PASS-04c — "streaming: null reasoning_effort → passes undefined (not null) to streamLiteLLM":
            resolveAliasConfig mock devuelve {..., reasoning_effort:null, thinking_budget:null}.
            Assert: options.reasoning_effort es undefined (ausente) o null — lo que la spread condicional de stream-utils pueda aceptar. (Práctica: pasamos `cfg.reasoning_effort ?? undefined` para compatibilidad con el enum type de StreamOptions que no incluye null).
        - Test PASS-04d — "non-streaming: fetch body includes reasoning_effort + thinking when present":
            POST body con stream:false (non-streaming path). resolveAliasConfig devuelve reasoning+thinking.
            Assert: global.fetch mock recibe una call cuyo body JSON parseado incluye `reasoning_effort:'high'` y `thinking:{type:'enabled', budget_tokens:4000}`.
        - Test PASS-04e — "non-streaming: fetch body OMITS reasoning_effort cuando 'off'":
            resolveAliasConfig devuelve {..., reasoning_effort:'off'}.
            Assert: body JSON NO contiene `reasoning_effort` (sentinel 'off' omitido, simétrico con stream-utils).
      - describe('POST /api/catbot/chat — max_tokens resolution (PASS-03)') con:
        - Test PASS-03a — "max_tokens comes from alias config when set":
            resolveAliasConfig mock devuelve {..., max_tokens:8000}.
            Assert (streaming): streamLiteLLM recibe max_tokens:8000.
            Assert (non-streaming): fetch body contiene max_tokens:8000.
        - Test PASS-03b — "max_tokens falls back to 2048 when alias config is null":
            resolveAliasConfig mock devuelve {..., max_tokens:null}.
            Assert: streamLiteLLM recibe max_tokens:2048 (hardcoded fallback preservado).
            Assert: fetch body max_tokens:2048.
      - describe('POST /api/catbot/chat — back-compat (model override)') con:
        - Test BC-a — "request body.model override wins over cfg.model":
            resolveAliasConfig mock devuelve {model:'claude-opus'}. Request body incluye model:'gpt-4o'.
            Assert: streamLiteLLM recibe model:'gpt-4o' (request override has precedence, preserves existing behavior of line 119).
    - El archivo debe mockear TODAS las dependencias del route (lista en interfaces context). Los mocks pueden ser stubs simples — el foco es el contract de propagación.
  </behavior>
  <action>
Crear `app/src/app/api/catbot/chat/__tests__/route.test.ts`. El archivo NO existe; este es el Wave 0 deliverable.

El test file mockea ~15 dependencias del route. Focus: **what values reach streamLiteLLM and fetch**. Not an end-to-end test of the tool loop.

**Estructura completa:**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Mocks (all resolved BEFORE import of route) ----

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockResolveAliasConfig = vi.fn();
vi.mock('@/lib/services/alias-routing', () => ({
  resolveAliasConfig: (...a: unknown[]) => mockResolveAliasConfig(...a),
  // shim is exported but we don't expect it to be called from this route post-migration.
  resolveAlias: vi.fn().mockResolvedValue('fallback-model'),
}));

const mockStreamLiteLLM = vi.fn();
vi.mock('@/lib/services/stream-utils', () => ({
  streamLiteLLM: (...a: unknown[]) => mockStreamLiteLLM(...a),
  sseHeaders: { 'Content-Type': 'text/event-stream' },
  createSSEStream: (handler: (s: any, c: any) => void) => {
    const events: Array<{ event: string; data: unknown }> = [];
    const send = (event: string, data: unknown) => events.push({ event, data });
    const close = () => {};
    handler(send, close);
    // Return minimal ReadableStream so Response() works.
    return new ReadableStream({ start(c) { c.close(); } });
  },
}));

vi.mock('@/lib/services/catbot-tools', () => ({
  getToolsForLLM: vi.fn().mockReturnValue([]),
  executeTool: vi.fn(),
}));
vi.mock('@/lib/services/catbot-sudo-tools', () => ({
  getSudoToolsForLLM: vi.fn().mockReturnValue([]),
  executeSudoTool: vi.fn(),
  isSudoTool: vi.fn().mockReturnValue(false),
}));
vi.mock('@/lib/services/catbot-holded-tools', () => ({
  isHoldedTool: vi.fn().mockReturnValue(false),
  executeHoldedTool: vi.fn(),
}));
vi.mock('@/lib/sudo', () => ({
  validateSudoSession: vi.fn().mockReturnValue(false),
}));
vi.mock('@/lib/services/usage-tracker', () => ({
  logUsage: vi.fn(),
}));

// DB mock — catbot route reads 'catbot_config' and 'catbot_sudo' settings rows.
const mockDbGet = vi.fn().mockReturnValue(undefined);
vi.mock('@/lib/db', () => ({
  default: { prepare: () => ({ get: (...a: unknown[]) => mockDbGet(...a), run: vi.fn(), all: vi.fn().mockReturnValue([]) }) },
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}));

vi.mock('@/lib/services/catbot-prompt-assembler', () => ({
  build: vi.fn().mockReturnValue('system prompt'),
}));
vi.mock('@/lib/services/catbot-user-profile', () => ({
  deriveUserId: vi.fn().mockReturnValue('user-1'),
  ensureProfile: vi.fn().mockReturnValue({
    display_name: null, initial_directives: null, known_context: null,
    communication_style: null, preferred_format: null,
  }),
  updateProfileAfterConversation: vi.fn(),
}));
vi.mock('@/lib/services/catbot-memory', () => ({
  matchRecipe: vi.fn().mockReturnValue(null),
  autoSaveRecipe: vi.fn(),
  updateRecipeSuccess: vi.fn(),
}));
vi.mock('@/lib/services/catbot-conversation-memory', () => ({
  buildConversationWindow: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/services/catbot-complexity-parser', () => ({
  parseComplexityPrefix: vi.fn().mockReturnValue({
    classification: 'simple', cleanedContent: '', reason: null, estimatedDurationS: null,
  }),
}));
vi.mock('@/lib/catbot-db', () => ({
  saveComplexityDecision: vi.fn().mockReturnValue('decision-1'),
  updateComplexityOutcome: vi.fn(),
  createIntentJob: vi.fn(),
}));

// ---- Helpers ----

function makeReq(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/catbot/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function defaultCfg(overrides: Record<string, unknown> = {}) {
  return {
    model: 'anthropic/claude-opus-4-6',
    reasoning_effort: null,
    max_tokens: null,
    thinking_budget: null,
    ...overrides,
  };
}

// Capture streamLiteLLM options
function getStreamOptions(): any {
  expect(mockStreamLiteLLM).toHaveBeenCalled();
  return mockStreamLiteLLM.mock.calls[0][0];
}

// ---- Tests ----

describe('POST /api/catbot/chat — resolveAliasConfig migration (PASS-04)', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAliasConfig.mockResolvedValue(defaultCfg());
    // Streaming mock: complete immediately with no tokens and no tool calls.
    mockStreamLiteLLM.mockImplementation(async (_opts: any, callbacks: any) => {
      callbacks.onDone({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
    });
    // fetch mock for non-streaming path: return minimal OpenAI-shape response.
    originalFetch = global.fetch;
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi', role: 'assistant' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
      text: async () => '',
    });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('PASS-04a — streaming: resolveAliasConfig values reach streamLiteLLM', async () => {
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({
      reasoning_effort: 'high', max_tokens: 8000, thinking_budget: 4000,
    }));
    const { POST } = await import('../route');
    await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }], stream: true }));
    const opts = getStreamOptions();
    expect(opts.reasoning_effort).toBe('high');
    expect(opts.thinking).toEqual({ type: 'enabled', budget_tokens: 4000 });
    expect(opts.max_tokens).toBe(8000);
  });

  it('PASS-04b — streaming: reasoning_effort="off" passes through (stream-utils handles omission)', async () => {
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({ reasoning_effort: 'off' }));
    const { POST } = await import('../route');
    await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }], stream: true }));
    const opts = getStreamOptions();
    expect(opts.reasoning_effort).toBe('off');
  });

  it('PASS-04c — streaming: null reasoning_effort → undefined to streamLiteLLM (not null)', async () => {
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({ reasoning_effort: null }));
    const { POST } = await import('../route');
    await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }], stream: true }));
    const opts = getStreamOptions();
    // Either undefined key or value undefined — NOT literal null (StreamOptions type forbids null).
    expect(opts.reasoning_effort === undefined || !('reasoning_effort' in opts)).toBe(true);
    // thinking should also be undefined when thinking_budget is null.
    expect(opts.thinking === undefined || !('thinking' in opts)).toBe(true);
  });

  it('PASS-04d — non-streaming: fetch body includes reasoning_effort + thinking when present', async () => {
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({
      reasoning_effort: 'high', max_tokens: 8000, thinking_budget: 4000,
    }));
    const { POST } = await import('../route');
    await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] })); // stream: false (default)
    expect(mockFetch).toHaveBeenCalled();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reasoning_effort).toBe('high');
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 4000 });
    expect(body.max_tokens).toBe(8000);
  });

  it('PASS-04e — non-streaming: fetch body OMITS reasoning_effort when "off" (sentinel symmetry)', async () => {
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({ reasoning_effort: 'off' }));
    const { POST } = await import('../route');
    await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('reasoning_effort');
  });
});

describe('POST /api/catbot/chat — max_tokens resolution (PASS-03)', () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAliasConfig.mockResolvedValue(defaultCfg());
    mockStreamLiteLLM.mockImplementation(async (_o: any, cb: any) => cb.onDone({ prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }));
    originalFetch = global.fetch;
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi', role: 'assistant' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      text: async () => '',
    });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => { global.fetch = originalFetch; });

  it('PASS-03a — max_tokens from alias config propagates to both paths', async () => {
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({ max_tokens: 8000 }));
    const { POST } = await import('../route');
    // Streaming
    await POST(makeReq({ messages: [{ role: 'user', content: 'x' }], stream: true }));
    expect(getStreamOptions().max_tokens).toBe(8000);
    vi.clearAllMocks();
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({ max_tokens: 8000 }));
    // Non-streaming
    await POST(makeReq({ messages: [{ role: 'user', content: 'x' }] }));
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).max_tokens).toBe(8000);
  });

  it('PASS-03b — max_tokens falls back to 2048 when alias config is null', async () => {
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({ max_tokens: null }));
    const { POST } = await import('../route');
    // Streaming
    await POST(makeReq({ messages: [{ role: 'user', content: 'x' }], stream: true }));
    expect(getStreamOptions().max_tokens).toBe(2048);
    vi.clearAllMocks();
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({ max_tokens: null }));
    // Non-streaming
    await POST(makeReq({ messages: [{ role: 'user', content: 'x' }] }));
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).max_tokens).toBe(2048);
  });
});

describe('POST /api/catbot/chat — back-compat (model override)', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAliasConfig.mockResolvedValue(defaultCfg({ model: 'claude-opus' }));
    mockStreamLiteLLM.mockImplementation(async (_o: any, cb: any) => cb.onDone({ prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }));
    originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi', role: 'assistant' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      text: async () => '',
    }) as unknown as typeof fetch;
  });

  afterEach(() => { global.fetch = originalFetch; });

  it('BC-a — request body.model override wins over cfg.model', async () => {
    const { POST } = await import('../route');
    await POST(makeReq({
      messages: [{ role: 'user', content: 'x' }],
      stream: true,
      model: 'gpt-4o',
    }));
    expect(getStreamOptions().model).toBe('gpt-4o');
  });
});
```

**Reglas duras:**
1. Este es un archivo NUEVO — Wave 0 deliverable per 159-VALIDATION.md.
2. El foco de los tests es SURGICAL: qué recibe `streamLiteLLM` y qué contiene el body de `fetch`. NO es un test end-to-end del tool loop.
3. Mockear TODAS las dependencias listadas en `import` del route (~15 módulos). Los mocks pueden ser stubs simples — los tests no ejercitan tools, sudo, memory, etc.
4. El mock de `createSSEStream` devuelve un ReadableStream mínimo que cierra inmediatamente — permite `new Response(sseStream, ...)` funcionar sin simular toda la estructura SSE.
5. `mockStreamLiteLLM.mockImplementation` invoca `onDone` inmediatamente — el tool loop sale al iteration 0 (no tool_calls → break).
6. `mockFetch` devuelve una response con `choices[0].message.content='hi'` y `finish_reason='stop'` — el tool loop sale al iteration 0 también.
7. `process['env']['CHAT_MODEL']` no debe aparecer — los tests usan `resolveAliasConfig` mockeado como fuente de truth (aislamiento completo).
8. RED: estos tests fallan porque el route todavía usa `resolveAlias` (no `resolveAliasConfig`) y no propaga reasoning_effort/thinking. **Commit RED**: `test(159-04): add failing tests for catbot chat reasoning propagation`.
9. `afterEach` restaura `global.fetch` — no contamina otros test files.

**Nota operacional:** Si algún mock falla porque el route tiene más imports de los listados, añadir los mocks faltantes. El research enumera los imports exactos del route; si aparece un módulo nuevo, mockear con `vi.fn()` stub.
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm run test:unit -- src/app/api/catbot/chat/__tests__/route.test.ts</automated>
  </verify>
  <done>
    - Archivo `app/src/app/api/catbot/chat/__tests__/route.test.ts` creado con 3 describes.
    - 8 tests nuevos (PASS-04a..e + PASS-03a..b + BC-a) en estado RED (fallando).
    - Mocks de ~15 dependencias configurados (streamLiteLLM, resolveAliasConfig, fetch, etc.).
    - Commit RED creado.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Migrar chat route a resolveAliasConfig + propagar reasoning params (GREEN)</name>
  <files>app/src/app/api/catbot/chat/route.ts</files>
  <behavior>
    - Import cambia: `resolveAlias` → `resolveAliasConfig`.
    - Línea 119: en vez de `await resolveAlias('catbot')`, derivar `model`, `reasoning_effort`, `thinking`, `max_tokens` de `resolveAliasConfig('catbot')` con las reglas:
      - `model = requestedModel || catbotConfig.model || cfg.model` (preserva BC-a assertion).
      - `reasoning_effort = cfg.reasoning_effort ?? undefined` (null → undefined para compatibilidad con StreamOptions type).
      - `thinking = cfg.thinking_budget ? {type:'enabled', budget_tokens: cfg.thinking_budget} : undefined`.
      - `max_tokens = cfg.max_tokens ?? 2048` (hardcoded fallback preservado — PASS-03).
    - Línea 199 (streaming): `streamLiteLLM` llamado con los 4 campos (model, messages, tools, reasoning_effort, thinking, max_tokens).
    - Línea 459 (non-streaming): body JSON incluye los 3 nuevos campos con spread condicional IDÉNTICO a stream-utils (reasoning_effort omitido si 'off' o falsy; thinking omitido si undefined; max_tokens incluido si set).
    - Los 8 tests de Task 1 pasan GREEN.
  </behavior>
  <action>
Editar `app/src/app/api/catbot/chat/route.ts`. Cambios quirúrgicos en 3 zonas:

**1. Línea 11 — cambiar el import:**

DE:
```typescript
import { resolveAlias } from '@/lib/services/alias-routing';
```
A:
```typescript
import { resolveAliasConfig } from '@/lib/services/alias-routing';
```

(⚠ Verificar con `npm run lint`: si `resolveAlias` queda unused causa fallo de build — per MEMORY.md feedback_unused_imports_build.md.)

**2. Línea ~119 — reemplazar la resolución de model:**

DE:
```typescript
    const model = requestedModel || catbotConfig.model || await resolveAlias('catbot');
    const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
    const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
```

A:
```typescript
    // Phase 159 (v30.0): resolve full alias config (model + reasoning_effort + max_tokens + thinking_budget).
    const cfg = await resolveAliasConfig('catbot');
    const model = requestedModel || catbotConfig.model || cfg.model;
    // reasoning_effort: cfg value if set; undefined otherwise (StreamOptions expects undefined, not null).
    const reasoning_effort = cfg.reasoning_effort ?? undefined;
    // thinking: build Anthropic-native shape when budget is set; undefined otherwise.
    const thinking = cfg.thinking_budget
      ? { type: 'enabled' as const, budget_tokens: cfg.thinking_budget }
      : undefined;
    // max_tokens: alias config value if set, otherwise preserve historical hardcoded 2048.
    const max_tokens = cfg.max_tokens ?? 2048;
    const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
    const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
```

**3. Línea ~199 — propagar a streamLiteLLM:**

DE:
```typescript
              await streamLiteLLM(
                { model, messages: llmMessages, max_tokens: 2048, tools: tools.length > 0 ? tools : undefined },
                {
```

A:
```typescript
              await streamLiteLLM(
                {
                  model,
                  messages: llmMessages,
                  max_tokens,
                  tools: tools.length > 0 ? tools : undefined,
                  // Phase 159: reasoning passthrough. stream-utils handles 'off' sentinel omission.
                  reasoning_effort,
                  thinking,
                },
                {
```

**4. Línea ~459 — propagar al non-streaming inline fetch body:**

DE:
```typescript
      const llmResponse = await fetch(`${litellmUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${litellmKey}`,
        },
        body: JSON.stringify({
          model,
          messages: llmMessages,
          tools: tools.length > 0 ? tools : undefined,
          max_tokens: 2048,
        }),
      });
```

A:
```typescript
      const llmResponse = await fetch(`${litellmUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${litellmKey}`,
        },
        body: JSON.stringify({
          model,
          messages: llmMessages,
          tools: tools.length > 0 ? tools : undefined,
          max_tokens,
          // Phase 159 (v30.0): reasoning passthrough. Symmetric with streamLiteLLM serialization.
          // 'off' is DocFlow sentinel — omit from wire (LiteLLM doesn't recognize it).
          ...(reasoning_effort && reasoning_effort !== 'off' ? { reasoning_effort } : {}),
          ...(thinking ? { thinking } : {}),
        }),
      });
```

**Reglas duras:**
1. **Symmetry HARD**: el spread condicional del non-streaming DEBE ser byte-equivalent al de stream-utils.ts (Plan 02). Si diverge, `reasoning_effort: 'off'` llegaría al wire por uno de los caminos y el oracle de Phase 161 fallará asimétricamente.
2. `reasoning_effort = cfg.reasoning_effort ?? undefined` — `undefined`, NO `null`. `StreamOptions.reasoning_effort` del Plan 02 es type `'off'|'low'|'medium'|'high'` (no incluye null). Passar null rompería el type check.
3. `as const` en `{type: 'enabled' as const, ...}` preserva el literal type para `StreamOptions.thinking` (que es `{type:'enabled', ...}`, literal).
4. `max_tokens = cfg.max_tokens ?? 2048` — NO usar `|| 2048` porque `cfg.max_tokens = 0` (inválido per PATCH validator) sería pisado por 2048 silenciosamente. `??` solo fallback cuando null/undefined.
5. NO tocar el flujo del tool loop, recipe matching, complexity gate, sudo gates, usage tracking, etc. El cambio es quirúrgico: 4 anchors editados.
6. Verificar post-edit con grep: `grep -n resolveAlias app/src/app/api/catbot/chat/route.ts` debe mostrar SOLO `resolveAliasConfig` (no `resolveAlias` a secas) — si aparece, es unused import y rompe el build Docker.
7. Commit GREEN: `feat(159-04): migrate catbot chat route to resolveAliasConfig and propagate reasoning params`.
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm run test:unit -- src/app/api/catbot/chat/__tests__/route.test.ts</automated>
  </verify>
  <done>
    - Import migrado a `resolveAliasConfig`.
    - Línea 119 refactor: `cfg` + `model` + `reasoning_effort` + `thinking` + `max_tokens` derivados.
    - Línea 199 (streaming): streamLiteLLM recibe los 3 nuevos params.
    - Línea 459 (non-streaming): fetch body con spread condicional IDÉNTICO a stream-utils.
    - 8 tests nuevos (PASS-04a..e, PASS-03a..b, BC-a) GREEN.
    - `cd app && npm run lint` exit 0 (sin unused imports).
    - `cd app && npm run build` exit 0 (type-check limpio, symmetric body).
    - Commit GREEN creado.
  </done>
</task>

</tasks>

<verification>
## Plan 159-04 verification (ejecutar en orden)

1. **Vitest — tests nuevos del chat route:**
   ```bash
   cd app && npm run test:unit -- src/app/api/catbot/chat/__tests__/route.test.ts
   ```
   Esperado: 8 tests verdes (PASS-04a..e + PASS-03a..b + BC-a).

2. **Regresión de la fase completa — todos los tests del plan 159:**
   ```bash
   cd app && npm run test:unit -- \
     src/lib/services/__tests__/alias-routing.test.ts \
     src/lib/services/stream-utils.test.ts \
     src/app/api/alias-routing/__tests__/route.test.ts \
     src/app/api/catbot/chat/__tests__/route.test.ts
   ```
   Esperado: 4 archivos, 0 failing. Combina Plans 01/02/03/04.

3. **Regresión global (sanity):**
   ```bash
   cd app && npm run test:unit 2>&1 | tail -30
   ```
   Esperado: la suite completa pasa. Los 14 callers legacy de `resolveAlias` (shim) siguen funcionales.

4. **Grep check — no unused import:**
   ```bash
   grep -n 'resolveAlias' app/src/app/api/catbot/chat/route.ts
   ```
   Esperado: UNA sola línea con `resolveAliasConfig`. NO debe aparecer `resolveAlias` standalone (sería unused import).

5. **Type-check + lint + build:**
   ```bash
   cd app && npm run lint && npm run build
   ```
   Esperado: exit 0 ambos. Build Docker no rompe.

6. **Docker rebuild + smoke test (manual, parte del `/gsd:verify-work` de la fase):**
   ```bash
   docker compose build --no-cache && docker compose up -d && \
     docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && \
     docker restart docflow-app
   # En CatBot chat (web): "¿qué modelo estás usando?" → debe funcionar sin 500.
   # Si el user ha PATCH-eado reasoning:high sobre opus, la siguiente request incluye
   # reasoning_effort en el body hacia LiteLLM (ver docker logs).
   ```
   Esperado: CatBot responde normalmente (smoke). Full oracle de reasoning flow es Phase 161 VER-03.

7. **CatBot oracle (CLAUDE.md — documentar para Phase 161):**
   Este plan NO cierra el oracle end-to-end. Lo deja IMPLEMENTADO pero no VERIFICADO. Documentar en el SUMMARY que VER-01..03 quedan para Phase 161.
</verification>

<success_criteria>
Medibles:
- [ ] `app/src/app/api/catbot/chat/route.ts` importa `resolveAliasConfig` (no `resolveAlias`)
- [ ] Línea 119 usa `await resolveAliasConfig('catbot')`
- [ ] `max_tokens` en ambas call sites se toma de `cfg.max_tokens ?? 2048` — **PASS-03**
- [ ] Streaming (línea 199): `streamLiteLLM` recibe `reasoning_effort` y `thinking` del cfg — **PASS-04**
- [ ] Non-streaming (línea 459): inline fetch body incluye `reasoning_effort` (omitido si 'off') y `thinking` (omitido si undefined), con serialización simétrica a stream-utils — **PASS-04**
- [ ] 8 tests nuevos (PASS-03a..b + PASS-04a..e + BC-a) verdes en el archivo nuevo `__tests__/route.test.ts`
- [ ] Wave 0 gap cerrado: archivo de tests creado per 159-VALIDATION.md
- [ ] `grep resolveAlias app/src/app/api/catbot/chat/route.ts` muestra solo `resolveAliasConfig`
- [ ] `npm run lint && npm run build` exit 0
- [ ] Suite completa de unit tests pasa (no regresión en los 14 callers legacy del shim)
</success_criteria>

<output>
After completion, create `.planning/phases/159-backend-passthrough-litellm-reasoning/159-04-SUMMARY.md`
</output>
</content>
</invoke>