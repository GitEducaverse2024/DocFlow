---
phase: 159-backend-passthrough-litellm-reasoning
plan: 03
type: execute
wave: 2
depends_on:
  - 159-01
files_modified:
  - app/src/app/api/alias-routing/route.ts
  - app/src/app/api/alias-routing/__tests__/route.test.ts
autonomous: true
requirements:
  - CFG-02
must_haves:
  truths:
    - "PATCH /api/alias-routing acepta body con reasoning_effort (enum|null), max_tokens (int|null), thinking_budget (int|null) además de alias + model_key"
    - "Validación enum: reasoning_effort ∉ {'off','low','medium','high',null} → 400 con mensaje claro"
    - "Validación numérica: max_tokens y thinking_budget no-positivos o no-enteros → 400"
    - "Validación cross-table: reasoning_effort ≠ null/'off' sobre un modelo con supports_reasoning=0 → 400"
    - "Validación de cap: max_tokens > max_tokens_cap del modelo target → 400"
    - "Validación de orden: thinking_budget > max_tokens (mismo request) → 400; thinking_budget con max_tokens ausente → 400 (research Pitfall #3)"
    - "Happy path: body válido persiste las 3 columnas nuevas via updateAlias(alias, model_key, opts) y devuelve updated row"
    - "Back-compat: PATCH sin los 3 campos nuevos (body legacy {alias, model_key}) sigue funcionando igual que antes (llama updateAlias sin opts)"
    - "Capability lookup ausente (cap === undefined): skip validation, log warn, permitir persist (consistente con Phase 158 null-enriched pattern)"
  artifacts:
    - path: "app/src/app/api/alias-routing/route.ts"
      provides: "PATCH validator extendido con type guards + cross-table capability check + persistencia via updateAlias(alias, model_key, opts)"
      contains: "supports_reasoning"
    - path: "app/src/app/api/alias-routing/__tests__/route.test.ts"
      provides: "8+ tests nuevos cubriendo todos los rechazos de CFG-02 + happy path"
      min_lines: 100
  key_links:
    - from: "app/src/app/api/alias-routing/route.ts (PATCH handler)"
      to: "SELECT supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key = ?"
      via: "db.prepare para capability lookup pre-UPDATE"
      pattern: "SELECT supports_reasoning, max_tokens_cap FROM model_intelligence"
    - from: "app/src/app/api/alias-routing/route.ts (PATCH handler)"
      to: "updateAlias(alias, model_key, opts) del servicio alias-routing (Plan 01)"
      via: "llamada con opts cuando uno o más campos de reasoning están presentes; sin opts cuando body legacy"
      pattern: "updateAlias\\([^,]+,[^,]+,\\s*\\{"
---

<objective>
Extender `PATCH /api/alias-routing` con la validación completa de los 3 campos nuevos de Phase 158 (`reasoning_effort`, `max_tokens`, `thinking_budget`) y persistirlos mediante `updateAlias(alias, model_key, opts)` del servicio (extendido en Plan 01). La validación incluye: type guards (enum + integer positivo), cross-table capability check contra `model_intelligence` del modelo TARGET (post-update state per research Pitfall #6), validación de invariantes (`thinking_budget <= max_tokens`, `thinking_budget` requiere `max_tokens`), y graceful-degradation cuando el capability row no existe (skip validation + log warn — consistente con Phase 158 null-enriched pattern per research Open Question 5).

Purpose: Cubre requirement **CFG-02**. Bloquea configs inválidas en el boundary HTTP — si un config malformado llega a la DB, el runtime (Plan 04) lo propagará a LiteLLM y obtendrá respuestas degradadas o errores de provider. Este plan es el último gate antes de que los valores afecten el wire.

Output: `route.ts` con PATCH extendido, `route.test.ts` con 8+ tests nuevos cubriendo cada rechazo. Back-compat HARD: PATCH con body legacy `{alias, model_key}` sigue funcionando (llama `updateAlias` sin `opts`).
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
@app/src/app/api/alias-routing/route.ts
@app/src/app/api/alias-routing/__tests__/route.test.ts

<interfaces>
<!-- From Plan 159-01 (dependency): -->

```typescript
// app/src/lib/services/alias-routing.ts — AVAILABLE after Plan 159-01 merges:
export function updateAlias(
  alias: string,
  newModelKey: string,
  opts?: {
    reasoning_effort?: 'off' | 'low' | 'medium' | 'high' | null;
    max_tokens?: number | null;
    thinking_budget?: number | null;
  }
): AliasRow;
```

<!-- Current PATCH handler (route.ts lines 17-33). Must extend. -->

```typescript
// CURRENT:
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const alias = typeof body?.alias === 'string' ? body.alias.trim() : '';
    const model_key = typeof body?.model_key === 'string' ? body.model_key.trim() : '';
    if (!alias || !model_key) {
      return NextResponse.json({ error: 'Missing alias or model_key' }, { status: 400 });
    }
    const updated = updateAlias(alias, model_key);
    return NextResponse.json({ updated });
  } catch (e) {
    logger.error('alias-routing', 'Error updating alias', { error: (e as Error).message });
    return NextResponse.json({ error: (e as Error).message }, { status: 200 });
  }
}
```

<!-- Phase 158 schema (reference): -->

```sql
-- model_intelligence.supports_reasoning INTEGER (0/1)
-- model_intelligence.max_tokens_cap INTEGER (nullable)
-- model_aliases.reasoning_effort TEXT CHECK (reasoning_effort IN ('off','low','medium','high') OR NULL)
-- model_aliases.max_tokens INTEGER
-- model_aliases.thinking_budget INTEGER
```

<!-- Test pattern: mock alias-routing service (getAllAliases, updateAlias) + mock @/lib/db for the
     supports_reasoning lookup. See existing route.test.ts for the mock pattern (lines 14-21). -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extender tests en route.test.ts con CFG-02 cases (RED)</name>
  <files>app/src/app/api/alias-routing/__tests__/route.test.ts</files>
  <behavior>
    - Añadir describe('PATCH — Phase 159 fields (CFG-02)', ...) con:
      - Test CFG-02a — "persists new fields when body contains valid reasoning config":
          Body: {alias:'catbot', model_key:'anthropic/claude-opus-4-6', reasoning_effort:'high', max_tokens:8000, thinking_budget:4000}.
          Mock capability lookup (db.prepare.get) para devolver {supports_reasoning:1, max_tokens_cap:32000}.
          Mock updateAlias para devolver row extendida.
          Assert: status 200, mockUpdateAlias recibe (alias, model_key, {reasoning_effort:'high', max_tokens:8000, thinking_budget:4000}).
      - Test CFG-02b — "rejects invalid reasoning_effort enum":
          Body: {..., reasoning_effort:'extreme'}. Assert: status 400, message menciona reasoning_effort.
      - Test CFG-02c — "rejects capability conflict (reasoning_effort on non-reasoning model)":
          Body: {..., reasoning_effort:'high'}. Capability lookup devuelve {supports_reasoning:0, max_tokens_cap:8192}.
          Assert: status 400, message menciona "does not support reasoning" o equivalente.
      - Test CFG-02d — "rejects max_tokens cap exceeded":
          Body: {alias, model_key:'opus', max_tokens:99999}. Cap lookup devuelve {supports_reasoning:1, max_tokens_cap:32000}.
          Assert: status 400, message menciona el cap.
      - Test CFG-02e — "rejects thinking_budget > max_tokens (same request)":
          Body: {..., max_tokens:2048, thinking_budget:4000}. Assert: status 400, message menciona relación thinking_budget/max_tokens.
      - Test CFG-02f — "rejects thinking_budget without max_tokens":
          Body: {..., thinking_budget:4000} (sin max_tokens). Assert: status 400, message menciona que max_tokens es requerido.
      - Test CFG-02g — "rejects non-integer max_tokens":
          Body: {..., max_tokens:'abc'} o {..., max_tokens:-5} o {..., max_tokens:1.5}. Assert: status 400.
      - Test CFG-02h — "rejects non-integer thinking_budget":
          Análogo a CFG-02g pero para thinking_budget.
      - Test CFG-02i — "accepts reasoning_effort='off' with non-reasoning model (off is valid)":
          Body: {..., reasoning_effort:'off'}. Cap lookup devuelve {supports_reasoning:0}.
          Assert: status 200 (off no requiere support_reasoning=1).
      - Test CFG-02j — "accepts null fields (explicit null reset)":
          Body: {..., reasoning_effort:null, max_tokens:null, thinking_budget:null}.
          Assert: status 200, updateAlias llamado con opts donde los 3 fields son null.
      - Test CFG-02k — "graceful degradation: cap row missing → skip validation, persist anyway, log warn":
          Body: {..., reasoning_effort:'high'}. Capability lookup devuelve undefined (modelo no en model_intelligence).
          Assert: status 200, updateAlias llamado, logger.warn invocado.
      - Test CFG-02l — "back-compat: legacy body {alias, model_key} calls updateAlias WITHOUT opts":
          Body: {alias:'catbot', model_key:'gpt-4o'} (sin los 3 campos nuevos).
          Assert: status 200, mockUpdateAlias llamado con solo 2 argumentos (o opts undefined).
  </behavior>
  <action>
Extender `app/src/app/api/alias-routing/__tests__/route.test.ts`. El archivo actual tiene mocks de `getAllAliases`/`updateAlias` (líneas 14-21) y `logger` (líneas 5-12). Añadir:

**1. Mock de @/lib/db (nuevo, para capability lookup):**

Añadir después del mock existente de `@/lib/services/alias-routing` (línea ~19):

```typescript
const mockDbGet = vi.fn();
const mockDbPrepare = vi.fn().mockImplementation(() => ({ get: (...a: unknown[]) => mockDbGet(...a) }));
vi.mock('@/lib/db', () => ({
  default: { prepare: (...args: unknown[]) => mockDbPrepare(...args) },
}));
```

**2. Helper nuevo (añadir cerca del `makePatchReq`):**

```typescript
function makeCapRow(overrides: Record<string, unknown> = {}) {
  return {
    supports_reasoning: 1,
    max_tokens_cap: 32000,
    ...overrides,
  };
}
```

**3. Nuevo describe block (añadir al final del archivo):**

```typescript
describe('PATCH — Phase 159 fields (CFG-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default capability lookup: supports_reasoning=1, cap=32000.
    mockDbGet.mockReturnValue(makeCapRow());
  });

  it('CFG-02a — persists new fields when body contains valid reasoning config', async () => {
    const updated = {
      alias: 'catbot', model_key: 'anthropic/claude-opus-4-6',
      description: 'CatBot', is_active: 1, created_at: 't', updated_at: 't',
    };
    mockUpdateAlias.mockReturnValue(updated);
    const res = await PATCH(makePatchReq({
      alias: 'catbot',
      model_key: 'anthropic/claude-opus-4-6',
      reasoning_effort: 'high',
      max_tokens: 8000,
      thinking_budget: 4000,
    }));
    expect(res.status).toBe(200);
    expect(mockUpdateAlias).toHaveBeenCalledWith(
      'catbot',
      'anthropic/claude-opus-4-6',
      { reasoning_effort: 'high', max_tokens: 8000, thinking_budget: 4000 }
    );
  });

  it('CFG-02b — rejects invalid reasoning_effort enum', async () => {
    const res = await PATCH(makePatchReq({
      alias: 'catbot', model_key: 'opus', reasoning_effort: 'extreme',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/reasoning_effort/i);
    expect(mockUpdateAlias).not.toHaveBeenCalled();
  });

  it('CFG-02c — rejects capability conflict (reasoning on non-reasoning model)', async () => {
    mockDbGet.mockReturnValue(makeCapRow({ supports_reasoning: 0, max_tokens_cap: 8192 }));
    const res = await PATCH(makePatchReq({
      alias: 'catbot', model_key: 'ollama/gemma3:4b', reasoning_effort: 'high',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/does not support reasoning|supports_reasoning/i);
    expect(mockUpdateAlias).not.toHaveBeenCalled();
  });

  it('CFG-02d — rejects max_tokens cap exceeded', async () => {
    mockDbGet.mockReturnValue(makeCapRow({ supports_reasoning: 1, max_tokens_cap: 32000 }));
    const res = await PATCH(makePatchReq({
      alias: 'catbot', model_key: 'opus', max_tokens: 99999,
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/max_tokens.*32000|cap/i);
    expect(mockUpdateAlias).not.toHaveBeenCalled();
  });

  it('CFG-02e — rejects thinking_budget > max_tokens (same request)', async () => {
    const res = await PATCH(makePatchReq({
      alias: 'catbot', model_key: 'opus', max_tokens: 2048, thinking_budget: 4000,
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/thinking_budget.*max_tokens|exceed/i);
    expect(mockUpdateAlias).not.toHaveBeenCalled();
  });

  it('CFG-02f — rejects thinking_budget without max_tokens', async () => {
    const res = await PATCH(makePatchReq({
      alias: 'catbot', model_key: 'opus', thinking_budget: 4000,
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/thinking_budget.*requires.*max_tokens|max_tokens.*required/i);
    expect(mockUpdateAlias).not.toHaveBeenCalled();
  });

  it('CFG-02g — rejects non-integer / non-positive max_tokens', async () => {
    // Non-integer
    let res = await PATCH(makePatchReq({ alias: 'catbot', model_key: 'opus', max_tokens: 1.5 }));
    expect(res.status).toBe(400);
    // Negative
    res = await PATCH(makePatchReq({ alias: 'catbot', model_key: 'opus', max_tokens: -5 }));
    expect(res.status).toBe(400);
    // Zero
    res = await PATCH(makePatchReq({ alias: 'catbot', model_key: 'opus', max_tokens: 0 }));
    expect(res.status).toBe(400);
    // String
    res = await PATCH(makePatchReq({ alias: 'catbot', model_key: 'opus', max_tokens: 'abc' as unknown as number }));
    expect(res.status).toBe(400);
  });

  it('CFG-02h — rejects non-integer / non-positive thinking_budget', async () => {
    // Must also satisfy max_tokens present (from CFG-02f rule), so include valid max_tokens.
    let res = await PATCH(makePatchReq({ alias: 'catbot', model_key: 'opus', max_tokens: 8000, thinking_budget: 1.5 }));
    expect(res.status).toBe(400);
    res = await PATCH(makePatchReq({ alias: 'catbot', model_key: 'opus', max_tokens: 8000, thinking_budget: -1 }));
    expect(res.status).toBe(400);
    res = await PATCH(makePatchReq({ alias: 'catbot', model_key: 'opus', max_tokens: 8000, thinking_budget: 0 }));
    expect(res.status).toBe(400);
  });

  it('CFG-02i — accepts reasoning_effort="off" on non-reasoning model', async () => {
    mockDbGet.mockReturnValue(makeCapRow({ supports_reasoning: 0, max_tokens_cap: 8192 }));
    mockUpdateAlias.mockReturnValue({ alias: 'catbot', model_key: 'ollama/gemma3:4b' });
    const res = await PATCH(makePatchReq({
      alias: 'catbot', model_key: 'ollama/gemma3:4b', reasoning_effort: 'off',
    }));
    expect(res.status).toBe(200);
    expect(mockUpdateAlias).toHaveBeenCalled();
  });

  it('CFG-02j — accepts explicit null for all 3 fields (reset)', async () => {
    mockUpdateAlias.mockReturnValue({ alias: 'catbot', model_key: 'opus' });
    const res = await PATCH(makePatchReq({
      alias: 'catbot', model_key: 'opus',
      reasoning_effort: null, max_tokens: null, thinking_budget: null,
    }));
    expect(res.status).toBe(200);
    expect(mockUpdateAlias).toHaveBeenCalledWith(
      'catbot', 'opus',
      { reasoning_effort: null, max_tokens: null, thinking_budget: null }
    );
  });

  it('CFG-02k — graceful degradation when capability row missing', async () => {
    mockDbGet.mockReturnValue(undefined);
    mockUpdateAlias.mockReturnValue({ alias: 'catbot', model_key: 'unknown-model' });
    const res = await PATCH(makePatchReq({
      alias: 'catbot', model_key: 'unknown-model', reasoning_effort: 'high',
    }));
    expect(res.status).toBe(200);
    expect(mockUpdateAlias).toHaveBeenCalled();
  });

  it('CFG-02l — back-compat: legacy body without new fields calls updateAlias WITHOUT opts', async () => {
    mockUpdateAlias.mockReturnValue({ alias: 'catbot', model_key: 'gpt-4o' });
    const res = await PATCH(makePatchReq({ alias: 'catbot', model_key: 'gpt-4o' }));
    expect(res.status).toBe(200);
    // Legacy: updateAlias called with 2 args only (opts undefined).
    expect(mockUpdateAlias).toHaveBeenCalledWith('catbot', 'gpt-4o');
  });
});
```

**Reglas duras:**
1. EXTENDER el archivo existente. Mantener intactos los tests existentes (GET + PATCH legacy).
2. El mock de `@/lib/db` es NUEVO (el archivo actual no lo tiene). Añadir antes del `import { GET, PATCH }`.
3. Usar el helper `makeCapRow` para fixtures consistentes.
4. RED: estos tests fallarán porque la PATCH actual no valida nada de esto. **Commit RED**: `test(159-03): add failing tests for PATCH validator (CFG-02)`.
5. Test CFG-02l (back-compat) assert EXACTO sobre los argumentos de `updateAlias` — verificar que solo se pasan 2 (alias, model_key) para body legacy. Esto asegura que el hot path viejo no rompe.
6. Test CFG-02k verifica el pattern null-enriched: cap missing → proceed + warn.
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm run test:unit -- src/app/api/alias-routing/__tests__/route.test.ts -t "Phase 159 fields"</automated>
  </verify>
  <done>
    - 12 tests nuevos (CFG-02a..l) añadidos.
    - Tests fallan RED (validación no implementada todavía en PATCH).
    - Tests existentes (GET, PATCH legacy) siguen verdes.
    - Commit RED creado con mensaje `test(159-03): add failing tests for PATCH validator (CFG-02)`.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implementar PATCH validator extendido (GREEN)</name>
  <files>app/src/app/api/alias-routing/route.ts</files>
  <behavior>
    - PATCH handler parsea los 3 campos opcionales del body (`reasoning_effort`, `max_tokens`, `thinking_budget`).
    - Type guards: enum, integer positivo. Fail → 400.
    - Cross-table capability lookup: SELECT supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key = ? GET del target.
    - Validaciones cruzadas (capability conflict, cap excedido, thinking_budget rules). Fail → 400.
    - Cap row missing → skip validation + log warn (per research Open Question 5).
    - Persistencia: si alguno de los 3 fields está presente en body (no undefined) → llamar `updateAlias(alias, model_key, opts)`; si ninguno → llamar `updateAlias(alias, model_key)` legacy.
    - Response: 200 con `{ updated }` (match shape actual).
    - Los 12 tests de Task 1 pasan GREEN.
  </behavior>
  <action>
Editar `app/src/app/api/alias-routing/route.ts`. Reemplazar el cuerpo completo del archivo con:

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAllAliases, updateAlias } from '@/lib/services/alias-routing';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const aliases = getAllAliases();
    return NextResponse.json({ aliases });
  } catch (e) {
    logger.error('alias-routing', 'Error listing aliases', { error: (e as Error).message });
    return NextResponse.json({ aliases: [], error: (e as Error).message }, { status: 200 });
  }
}

// Phase 159 (v30.0): extended PATCH validator.
// Accepts optional reasoning_effort, max_tokens, thinking_budget. Validates type + cross-table
// capability (supports_reasoning, max_tokens_cap) before persisting via updateAlias(alias, key, opts).
// Back-compat: body without the 3 new fields calls updateAlias(alias, key) — legacy path unchanged.
const REASONING_ENUM = new Set(['off', 'low', 'medium', 'high']);

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v > 0;
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const alias = typeof body?.alias === 'string' ? body.alias.trim() : '';
    const model_key = typeof body?.model_key === 'string' ? body.model_key.trim() : '';

    if (!alias || !model_key) {
      return NextResponse.json({ error: 'Missing alias or model_key' }, { status: 400 });
    }

    // Detect whether the request is using the extended (Phase 159) shape.
    // A field present in the body — even explicit null — activates the extended path.
    const hasReasoningEffort = Object.prototype.hasOwnProperty.call(body, 'reasoning_effort');
    const hasMaxTokens = Object.prototype.hasOwnProperty.call(body, 'max_tokens');
    const hasThinkingBudget = Object.prototype.hasOwnProperty.call(body, 'thinking_budget');
    const isExtended = hasReasoningEffort || hasMaxTokens || hasThinkingBudget;

    if (!isExtended) {
      // Legacy path — preserve byte-identical behavior for pre-Phase 159 clients.
      const updated = updateAlias(alias, model_key);
      return NextResponse.json({ updated });
    }

    // Extended path — normalize + validate.
    const reasoning_effort = hasReasoningEffort ? (body.reasoning_effort ?? null) : null;
    const max_tokens = hasMaxTokens ? (body.max_tokens ?? null) : null;
    const thinking_budget = hasThinkingBudget ? (body.thinking_budget ?? null) : null;

    // Type guard: reasoning_effort enum.
    if (reasoning_effort !== null && !REASONING_ENUM.has(reasoning_effort)) {
      return NextResponse.json({
        error: `Invalid reasoning_effort: ${String(reasoning_effort)} (must be one of off|low|medium|high|null)`,
      }, { status: 400 });
    }

    // Type guard: max_tokens positive integer or null.
    if (max_tokens !== null && !isPositiveInt(max_tokens)) {
      return NextResponse.json({
        error: 'max_tokens must be a positive integer or null',
      }, { status: 400 });
    }

    // Type guard: thinking_budget positive integer or null.
    if (thinking_budget !== null && !isPositiveInt(thinking_budget)) {
      return NextResponse.json({
        error: 'thinking_budget must be a positive integer or null',
      }, { status: 400 });
    }

    // Cross-relation validation (before capability lookup — fast fail).
    if (thinking_budget !== null && max_tokens === null) {
      return NextResponse.json({
        error: 'thinking_budget requires max_tokens to be set (cannot exceed implicit default)',
      }, { status: 400 });
    }
    if (thinking_budget !== null && max_tokens !== null && thinking_budget > max_tokens) {
      return NextResponse.json({
        error: `thinking_budget (${thinking_budget}) cannot exceed max_tokens (${max_tokens})`,
      }, { status: 400 });
    }

    // Cross-table capability lookup for TARGET model_key (post-update state).
    // Phase 158 columns: supports_reasoning INTEGER (0/1), max_tokens_cap INTEGER.
    // Graceful degradation: if row is absent (e.g. namespace mismatch per STATE.md blocker),
    // skip capability validation + log warn. Consistent with Phase 158 null-enriched pattern.
    let cap: { supports_reasoning: number | null; max_tokens_cap: number | null } | undefined;
    try {
      cap = db.prepare(
        'SELECT supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key = ?'
      ).get(model_key) as typeof cap;
    } catch (e) {
      logger.warn('alias-routing', 'capability lookup failed; skipping capability validation', {
        error: (e as Error).message, model_key,
      });
      cap = undefined;
    }

    if (cap === undefined) {
      logger.warn('alias-routing', 'no capability row for model_key; skipping capability validation', {
        model_key, alias,
      });
    } else {
      if (reasoning_effort !== null && reasoning_effort !== 'off' && cap.supports_reasoning !== 1) {
        return NextResponse.json({
          error: `Model ${model_key} does not support reasoning (reasoning_effort must be 'off' or null)`,
        }, { status: 400 });
      }
      if (max_tokens !== null && cap.max_tokens_cap && max_tokens > cap.max_tokens_cap) {
        return NextResponse.json({
          error: `max_tokens (${max_tokens}) exceeds model cap (${cap.max_tokens_cap})`,
        }, { status: 400 });
      }
    }

    // Persist with opts.
    const updated = updateAlias(alias, model_key, { reasoning_effort, max_tokens, thinking_budget });
    return NextResponse.json({ updated });
  } catch (e) {
    logger.error('alias-routing', 'Error updating alias', { error: (e as Error).message });
    return NextResponse.json({ error: (e as Error).message }, { status: 200 });
  }
}
```

**Reglas duras:**
1. `isExtended` detecta si CUALQUIERA de los 3 fields está presente en el body (incluso `null` explícito). Si ninguno → legacy path (preserva back-compat test CFG-02l).
2. `updateAlias(alias, model_key)` SIN tercer argumento en legacy path — assertion exacta del test CFG-02l.
3. `updateAlias(alias, model_key, opts)` CON tercer argumento en extended path — test CFG-02a assertion exacta.
4. Cross-table lookup envuelto en try/catch adicional — si la tabla no existe (cold start raro), degrada a skip.
5. Orden de validación: type guards primero (fast-fail), cross-relation después, capability lookup al final. Esto minimiza queries a DB en el caso común de input inválido.
6. Mensajes de error son cadenas humanas legibles — no JSON/DB error spill (research Pitfall #4).
7. `import db from '@/lib/db'` — default export, consistente con otros routes.
8. `process['env'][...]` NO aplica aquí (no leemos env vars).
9. Commit GREEN: `feat(159-03): extend PATCH /api/alias-routing with capability validation`.
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm run test:unit -- src/app/api/alias-routing/__tests__/route.test.ts</automated>
  </verify>
  <done>
    - PATCH extendido con validación completa.
    - `import db from '@/lib/db'` añadido.
    - Los 12 tests nuevos (CFG-02a..l) GREEN.
    - Tests legacy de PATCH (4 tests existentes) siguen verdes.
    - GET sigue funcional.
    - `cd app && npm run lint` exit 0.
    - Commit GREEN creado.
  </done>
</task>

</tasks>

<verification>
## Plan 159-03 verification (ejecutar en orden)

1. **Vitest — PATCH tests:**
   ```bash
   cd app && npm run test:unit -- src/app/api/alias-routing/__tests__/route.test.ts
   ```
   Esperado: todos verdes (4 GET + 6 PATCH legacy + 12 PATCH nuevos = ~22).

2. **Regresión — servicio alias-routing:**
   ```bash
   cd app && npm run test:unit -- src/lib/services/__tests__/alias-routing.test.ts
   ```
   Esperado: 0 failing — Plan 01 dejó `updateAlias` back-compat, este plan llama con y sin opts.

3. **Type-check:**
   ```bash
   cd app && npm run build
   ```
   Esperado: exit 0.

4. **Lint:**
   ```bash
   cd app && npm run lint
   ```
   Esperado: exit 0.

5. **Docker smoke test (manual, opcional — parte del `/gsd:verify-work` de la fase):**
   ```bash
   # PATCH con invalid enum → 400
   curl -s -o /tmp/r.json -w '%{http_code}' -X PATCH http://localhost:3500/api/alias-routing \
     -H 'Content-Type: application/json' \
     -d '{"alias":"catbot","model_key":"anthropic/claude-opus-4-6","reasoning_effort":"extreme"}'
   # PATCH con valid config → 200
   curl -s -X PATCH http://localhost:3500/api/alias-routing \
     -H 'Content-Type: application/json' \
     -d '{"alias":"catbot","model_key":"anthropic/claude-opus-4-6","reasoning_effort":"high","max_tokens":8000,"thinking_budget":4000}'
   ```
   Esperado: primero 400 con mensaje claro; segundo 200 con `{updated: {...}}`.
</verification>

<success_criteria>
Medibles:
- [ ] PATCH valida enum `reasoning_effort` ∈ {off, low, medium, high, null} — **CFG-02**
- [ ] PATCH valida `max_tokens` positivo entero o null
- [ ] PATCH valida `thinking_budget` positivo entero o null
- [ ] PATCH rechaza `reasoning_effort` ≠ off/null sobre modelo con supports_reasoning=0
- [ ] PATCH rechaza `max_tokens > max_tokens_cap` del modelo target
- [ ] PATCH rechaza `thinking_budget > max_tokens` (mismo request)
- [ ] PATCH rechaza `thinking_budget` con `max_tokens` ausente
- [ ] PATCH persiste los 3 fields cuando válidos (via updateAlias con opts)
- [ ] PATCH sin los 3 fields llama updateAlias SIN opts (back-compat test CFG-02l)
- [ ] PATCH con cap row ausente skip validation + log warn (graceful degradation)
- [ ] 12 tests nuevos + 10 existentes = ~22 tests verdes en route.test.ts
- [ ] `npm run lint && npm run build` exit 0
</success_criteria>

<output>
After completion, create `.planning/phases/159-backend-passthrough-litellm-reasoning/159-03-SUMMARY.md`
</output>
</content>
</invoke>