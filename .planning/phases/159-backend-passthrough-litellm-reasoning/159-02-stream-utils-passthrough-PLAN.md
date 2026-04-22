---
phase: 159-backend-passthrough-litellm-reasoning
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - app/src/lib/services/stream-utils.ts
  - app/src/lib/services/stream-utils.test.ts
autonomous: true
requirements:
  - PASS-01
  - PASS-02
must_haves:
  truths:
    - "StreamOptions interface acepta reasoning_effort opcional (enum 'off'|'low'|'medium'|'high') y thinking opcional ({type:'enabled', budget_tokens:number})"
    - "streamLiteLLM propaga reasoning_effort al body JSON de POST /v1/chat/completions cuando es 'low'|'medium'|'high' (NUNCA envía 'off' al wire)"
    - "streamLiteLLM propaga thinking verbatim al body cuando está presente"
    - "Omisión correcta: reasoning_effort='off' o null/undefined → campo ausente del body; thinking undefined → campo ausente"
    - "Back-compat: callers actuales de streamLiteLLM (sin reasoning_effort/thinking) siguen funcionando byte-identical — los campos son opcionales"
    - "Tests verifican body shape mediante mock de fetch que captura el JSON enviado"
  artifacts:
    - path: "app/src/lib/services/stream-utils.ts"
      provides: "StreamOptions extended con reasoning_effort + thinking + body spread condicional"
      contains: "reasoning_effort"
    - path: "app/src/lib/services/stream-utils.test.ts"
      provides: "Tests PASS-01 + PASS-02 que assert body JSON vía fetch mock"
      min_lines: 80
  key_links:
    - from: "app/src/lib/services/stream-utils.ts (body JSON)"
      to: "LiteLLM /v1/chat/completions request"
      via: "spread condicional: ...(options.reasoning_effort && options.reasoning_effort !== 'off' ? {reasoning_effort: options.reasoning_effort} : {})"
      pattern: "reasoning_effort.*!==.*'off'"
    - from: "app/src/lib/services/stream-utils.ts (body JSON)"
      to: "LiteLLM /v1/chat/completions request (thinking)"
      via: "spread condicional: ...(options.thinking ? {thinking: options.thinking} : {})"
      pattern: "options\\.thinking"
---

<objective>
Extender `stream-utils.ts` con dos campos opcionales en `StreamOptions` — `reasoning_effort?: 'off'|'low'|'medium'|'high'` y `thinking?: {type:'enabled', budget_tokens:number}` — y propagar ambos al body JSON de la request a LiteLLM `/v1/chat/completions`. **Sentinel 'off'**: se traduce a **omitir el campo entero del wire** (per research Pitfall #2 — LiteLLM no reconoce 'off' como enum válido).

Purpose: Cubre requirements **PASS-01 + PASS-02**. Es la capa de wire donde los parámetros de reasoning cruzan el boundary DocFlow→LiteLLM. Sin este plan, aunque `resolveAliasConfig` (Plan 01) devuelva los valores y el PATCH (Plan 03) los persista, no hay camino para que lleguen al LLM. El plan es ADDITIVE-PURO — ningún caller actual rompe porque los dos nuevos campos son opcionales y el body se construye con spread condicional (patrón ya usado en líneas 53-54 con `max_tokens` y `tools`).

Output: `stream-utils.ts` con interface extendida + body spread condicional; `stream-utils.test.ts` con 4 tests nuevos que mockean `global.fetch` y capturan el JSON enviado (patrón de verificación más robusto que inspección visual).
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
@app/src/lib/services/stream-utils.ts
@app/src/lib/services/stream-utils.test.ts

<interfaces>
<!-- Current StreamOptions interface (lines 3-13 of stream-utils.ts). DO NOT remove existing fields. -->

```typescript
// CURRENT:
export interface StreamOptions {
  model: string;
  messages: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string; }>;
  max_tokens?: number;
  tools?: unknown[];
}
```

<!-- EXTENDED (additive, Plan 159-02): -->

```typescript
// AFTER Plan 159-02:
export interface StreamOptions {
  model: string;
  messages: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string; }>;
  max_tokens?: number;
  tools?: unknown[];
  // Phase 159 (v30.0): reasoning passthrough. Both optional; both omitted when absent or 'off'.
  reasoning_effort?: 'off' | 'low' | 'medium' | 'high';   // 'off' sentinel → omit from wire
  thinking?: { type: 'enabled'; budget_tokens: number };   // Anthropic-native shape (pass-through)
}
```

<!-- Current body JSON (lines 50-57). EXTEND with two conditional spreads. -->

```typescript
// CURRENT:
body: JSON.stringify({
  model: options.model,
  messages: options.messages,
  ...(options.max_tokens ? { max_tokens: options.max_tokens } : {}),
  ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
  stream: true,
  stream_options: { include_usage: true },
}),
```

<!-- Test pattern — mock global.fetch to capture body. Reference existing stream-utils.test.ts for
     the createSSEStream / sseHeaders test patterns; we add NEW describes that mock fetch.
     Key trick: when streamLiteLLM reads the response body stream, we provide a minimal SSE stream
     that emits [DONE] immediately so the function returns cleanly. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extender tests en stream-utils.test.ts con PASS-01 + PASS-02 (RED)</name>
  <files>app/src/lib/services/stream-utils.test.ts</files>
  <behavior>
    - Añadir describe('streamLiteLLM body passthrough (Phase 159)', ...) con los tests:
      - Test PASS-01a — "reasoning_effort:'medium' appears in request body JSON":
          Mock global.fetch. Llamar streamLiteLLM con {model:'claude-opus', messages:[{role:'user',content:'hi'}], reasoning_effort:'medium'}.
          Inspeccionar el body JSON de la fetch call: debe contener `reasoning_effort: 'medium'`.
      - Test PASS-01b — "reasoning_effort:'off' is OMITTED from request body (sentinel)":
          Llamar con reasoning_effort:'off'. Body NO debe contener la key `reasoning_effort` en absoluto.
      - Test PASS-01c — "reasoning_effort undefined omits the field (back-compat)":
          Llamar sin reasoning_effort. Body NO contiene `reasoning_effort`.
      - Test PASS-01d — "reasoning_effort values 'low' and 'high' appear in body":
          Dos sub-assertions verificando que ambos llegan al wire (cubre los otros dos enums).
      - Test PASS-02a — "thinking:{type:'enabled', budget_tokens:10000} appears verbatim in body":
          Body contiene `thinking: {type:'enabled', budget_tokens:10000}`.
      - Test PASS-02b — "thinking undefined omits the field":
          Body NO contiene `thinking`.
      - Test PASS-03-regression — "back-compat: caller sin reasoning/thinking produce el mismo body que hoy":
          Llamar con solo {model, messages}. Body contiene exactamente model + messages + stream:true + stream_options, nada más.
  </behavior>
  <action>
Extender `app/src/lib/services/stream-utils.test.ts`. El archivo existente ya tiene tests de `createSSEStream` y `sseHeaders` (no los toques). Añadir al final un nuevo describe block:

**Helper fetch mock (añadir cerca del top del archivo, después de los mocks del logger):**

```typescript
/**
 * Create a mock fetch that captures the request and responds with a minimal SSE stream
 * that emits [DONE] immediately. Returns { capturedBody, fetchMock } for assertions.
 */
function makeFetchMockCapture() {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const fetchMock = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
    capturedUrl = url;
    capturedInit = init;
    // Minimal SSE response: emit [DONE] then close.
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  });
  return { fetchMock, getCapturedBody: () => JSON.parse((capturedInit?.body as string) ?? '{}') };
}
```

**Nuevo describe block (añadir al final del archivo):**

```typescript
describe('streamLiteLLM body passthrough (Phase 159)', () => {
  const originalFetch = global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;
  let getCapturedBody: () => any;

  beforeEach(() => {
    const { fetchMock, getCapturedBody: gb } = makeFetchMockCapture();
    mockFetch = fetchMock;
    getCapturedBody = gb;
    global.fetch = mockFetch as unknown as typeof fetch;
    // Isolate env so LITELLM_URL / LITELLM_API_KEY are deterministic.
    process.env['LITELLM_URL'] = 'http://mock-litellm:4000';
    process.env['LITELLM_API_KEY'] = 'sk-test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const callbacks = {
    onToken: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  };

  it('PASS-01a — reasoning_effort:"medium" appears in request body JSON', async () => {
    const { streamLiteLLM } = await import('./stream-utils');
    await streamLiteLLM(
      { model: 'claude-opus', messages: [{ role: 'user', content: 'hi' }], reasoning_effort: 'medium' },
      callbacks
    );
    const body = getCapturedBody();
    expect(body.reasoning_effort).toBe('medium');
  });

  it('PASS-01b — reasoning_effort:"off" is OMITTED from request body (sentinel)', async () => {
    const { streamLiteLLM } = await import('./stream-utils');
    await streamLiteLLM(
      { model: 'claude-opus', messages: [{ role: 'user', content: 'hi' }], reasoning_effort: 'off' },
      callbacks
    );
    const body = getCapturedBody();
    expect(body).not.toHaveProperty('reasoning_effort');
  });

  it('PASS-01c — reasoning_effort undefined omits the field (back-compat)', async () => {
    const { streamLiteLLM } = await import('./stream-utils');
    await streamLiteLLM(
      { model: 'claude-opus', messages: [{ role: 'user', content: 'hi' }] },
      callbacks
    );
    const body = getCapturedBody();
    expect(body).not.toHaveProperty('reasoning_effort');
  });

  it('PASS-01d — reasoning_effort values "low" and "high" appear in body', async () => {
    const { streamLiteLLM } = await import('./stream-utils');
    await streamLiteLLM(
      { model: 'm', messages: [{ role: 'user', content: 'x' }], reasoning_effort: 'low' },
      callbacks
    );
    expect(getCapturedBody().reasoning_effort).toBe('low');

    // Reset capture
    const { fetchMock, getCapturedBody: gb2 } = makeFetchMockCapture();
    global.fetch = fetchMock as unknown as typeof fetch;
    await streamLiteLLM(
      { model: 'm', messages: [{ role: 'user', content: 'x' }], reasoning_effort: 'high' },
      callbacks
    );
    expect(gb2().reasoning_effort).toBe('high');
  });

  it('PASS-02a — thinking:{type:"enabled", budget_tokens:10000} appears verbatim in body', async () => {
    const { streamLiteLLM } = await import('./stream-utils');
    await streamLiteLLM(
      {
        model: 'claude-opus',
        messages: [{ role: 'user', content: 'hi' }],
        thinking: { type: 'enabled', budget_tokens: 10000 },
      },
      callbacks
    );
    const body = getCapturedBody();
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 10000 });
  });

  it('PASS-02b — thinking undefined omits the field', async () => {
    const { streamLiteLLM } = await import('./stream-utils');
    await streamLiteLLM(
      { model: 'claude-opus', messages: [{ role: 'user', content: 'hi' }] },
      callbacks
    );
    expect(getCapturedBody()).not.toHaveProperty('thinking');
  });

  it('PASS-regression — back-compat: body without reasoning fields matches legacy shape', async () => {
    const { streamLiteLLM } = await import('./stream-utils');
    await streamLiteLLM(
      { model: 'claude-opus', messages: [{ role: 'user', content: 'hi' }] },
      callbacks
    );
    const body = getCapturedBody();
    expect(body.model).toBe('claude-opus');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('thinking');
    // max_tokens and tools only present when explicitly set (unchanged behavior).
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('tools');
  });

  it('PASS-combined — reasoning_effort + thinking + max_tokens + tools all coexist', async () => {
    const { streamLiteLLM } = await import('./stream-utils');
    await streamLiteLLM(
      {
        model: 'claude-opus',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 2048,
        tools: [{ type: 'function', function: { name: 'x' } }],
        reasoning_effort: 'high',
        thinking: { type: 'enabled', budget_tokens: 5000 },
      },
      callbacks
    );
    const body = getCapturedBody();
    expect(body.reasoning_effort).toBe('high');
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 5000 });
    expect(body.max_tokens).toBe(2048);
    expect(Array.isArray(body.tools)).toBe(true);
  });
});
```

**Reglas duras:**
1. EXTENDER el archivo existente, NO crear uno nuevo.
2. Mock `global.fetch` por test via `afterEach` para restaurar — no contamina otros tests.
3. El mock fetch devuelve un ReadableStream que emite `data: [DONE]\n\n` inmediatamente — cumple el contract de streamLiteLLM sin necesidad de simular deltas completos.
4. Capturar el body con `JSON.parse(init.body as string)` dentro de `getCapturedBody()`.
5. Usar `await import('./stream-utils')` dentro de cada test (patrón del archivo existente con `vi.mock`).
6. RED phase: estos tests FALLAN porque `StreamOptions` no tiene `reasoning_effort` ni `thinking`. **Commit RED**: `test(159-02): add failing tests for streamLiteLLM reasoning passthrough`.
7. `afterEach` restaura `global.fetch = originalFetch` para no filtrar el mock a otros tests.
8. Usar `process.env['...']` (bracket notation per MEMORY.md).
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm run test:unit -- src/lib/services/stream-utils.test.ts -t "streamLiteLLM body passthrough"</automated>
  </verify>
  <done>
    - 8 tests nuevos añadidos al describe "streamLiteLLM body passthrough (Phase 159)".
    - Tests fallan RED (reasoning_effort y thinking no existen en StreamOptions todavía).
    - Tests existentes (createSSEStream, sseHeaders) siguen verdes.
    - Commit RED creado con mensaje `test(159-02): add failing tests for streamLiteLLM reasoning passthrough`.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extender StreamOptions + body spread condicional (GREEN)</name>
  <files>app/src/lib/services/stream-utils.ts</files>
  <behavior>
    - `StreamOptions` gana dos campos opcionales: `reasoning_effort?: 'off'|'low'|'medium'|'high'` y `thinking?: {type:'enabled', budget_tokens:number}`.
    - El body JSON de `streamLiteLLM` spread-condicional-añade `reasoning_effort` (solo cuando presente y `!== 'off'`) y `thinking` (solo cuando presente).
    - Los 8 tests de Task 1 pasan GREEN.
    - Callers existentes de `streamLiteLLM` (catbot/chat, etc.) compilan sin cambios porque ambos campos son opcionales.
  </behavior>
  <action>
Editar `app/src/lib/services/stream-utils.ts`:

**1. Extender la interface `StreamOptions` (líneas 3-13):**

Reemplazar el bloque completo con:
```typescript
export interface StreamOptions {
  model: string;
  messages: Array<{
    role: string;
    content: string;
    tool_calls?: unknown[];
    tool_call_id?: string;
  }>;
  max_tokens?: number;
  tools?: unknown[];
  // Phase 159 (v30.0): reasoning passthrough to LiteLLM.
  // reasoning_effort 'off' is a DocFlow sentinel — omitted from wire (LiteLLM doesn't recognize it).
  reasoning_effort?: 'off' | 'low' | 'medium' | 'high';
  // thinking passes through verbatim to Anthropic-native shape.
  thinking?: { type: 'enabled'; budget_tokens: number };
}
```

**2. Extender el body JSON (líneas 50-57):**

Reemplazar el `body: JSON.stringify({...})` completo con:
```typescript
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        ...(options.max_tokens ? { max_tokens: options.max_tokens } : {}),
        ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
        // Phase 159 (v30.0): reasoning passthrough. 'off' is a DocFlow sentinel — omit from wire.
        ...(options.reasoning_effort && options.reasoning_effort !== 'off'
          ? { reasoning_effort: options.reasoning_effort }
          : {}),
        ...(options.thinking ? { thinking: options.thinking } : {}),
        stream: true,
        stream_options: { include_usage: true },
      }),
```

**Reglas duras:**
1. El resto del archivo (reader loop, tool call accumulation, `createSSEStream`, `sseHeaders`) INTACTO. El cambio es quirúrgico: dos líneas nuevas en interface + dos líneas nuevas en body.
2. NO añadir logging nuevo de reasoning — Phase 159 es additive-puro, sin observabilidad extra (Phase 161 verificará via oracle).
3. NO procesar `reasoning_content` en el reader loop — Phase 159 es solo OUTBOUND (request body); INBOUND (parse `reasoning_content` de la response) es out-of-scope (FUT-03 en v30.1).
4. Omisión del sentinel `'off'`: `options.reasoning_effort && options.reasoning_effort !== 'off'` cubre ambos: `undefined` y `null` son falsy (se omite); `'off'` se omite explícitamente.
5. Commit GREEN: `feat(159-02): propagate reasoning_effort and thinking in streamLiteLLM body`.
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm run test:unit -- src/lib/services/stream-utils.test.ts</automated>
  </verify>
  <done>
    - `StreamOptions` con 2 campos nuevos opcionales.
    - Body JSON con 2 spreads condicionales nuevos.
    - Los 8 tests de Task 1 GREEN.
    - Tests existentes (createSSEStream, sseHeaders) siguen verdes.
    - `cd app && npm run lint` exit 0.
    - `cd app && npm run build` exit 0 (no rompe callers — todos los nuevos fields son opcionales).
    - Commit GREEN creado.
  </done>
</task>

</tasks>

<verification>
## Plan 159-02 verification (ejecutar en orden)

1. **Vitest — unit tests:**
   ```bash
   cd app && npm run test:unit -- src/lib/services/stream-utils.test.ts
   ```
   Esperado: todos los tests verdes (existentes + 8 nuevos).

2. **Regresión — callers existentes de streamLiteLLM:**
   ```bash
   cd app && npm run test:unit -- src/app/api/catbot src/lib/services 2>&1 | tail -20
   ```
   Esperado: 0 failing. Los callers `catbot/chat/route.ts:199` y cualquier otro pasan solo `{model, messages, max_tokens, tools}` — los dos nuevos fields son opcionales y `undefined` → no aparecen en el body.

3. **Type-check + build:**
   ```bash
   cd app && npm run build
   ```
   Esperado: exit 0. Cualquier type error en callers = bug en la extensión (campos deben ser opcionales).

4. **Lint:**
   ```bash
   cd app && npm run lint
   ```
   Esperado: exit 0.
</verification>

<success_criteria>
Medibles:
- [ ] `StreamOptions` exporta `reasoning_effort?: 'off'|'low'|'medium'|'high'` y `thinking?: {type:'enabled', budget_tokens:number}` — **PASS-01 + PASS-02**
- [ ] Body JSON contiene `reasoning_effort` cuando el caller pasa 'low'|'medium'|'high'
- [ ] Body JSON NO contiene `reasoning_effort` cuando el caller pasa 'off' o no lo pasa
- [ ] Body JSON contiene `thinking` verbatim cuando el caller lo pasa
- [ ] Body JSON NO contiene `thinking` cuando el caller no lo pasa
- [ ] 8 tests nuevos (PASS-01a..d + PASS-02a..b + regresión + combined) verdes
- [ ] Callers existentes de streamLiteLLM compilan sin cambios
- [ ] `npm run lint && npm run build` exit 0
</success_criteria>

<output>
After completion, create `.planning/phases/159-backend-passthrough-litellm-reasoning/159-02-SUMMARY.md`
</output>
</content>
</invoke>