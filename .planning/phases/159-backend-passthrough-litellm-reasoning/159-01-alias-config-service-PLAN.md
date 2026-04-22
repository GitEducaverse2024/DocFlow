---
phase: 159-backend-passthrough-litellm-reasoning
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/src/lib/services/alias-routing.ts
  - app/src/lib/services/__tests__/alias-routing.test.ts
autonomous: true
requirements:
  - CFG-03
must_haves:
  truths:
    - "resolveAliasConfig(alias) devuelve objeto {model, reasoning_effort, max_tokens, thinking_budget} con NULL→null preservado para las 3 columnas nuevas"
    - "resolveAlias(alias) sigue devolviendo Promise<string> byte-identical (back-compat: 15+ callers intactos)"
    - "resolveAliasConfig reusa exactamente la misma lógica de fallback (Discovery → same-tier MID → env) que resolveAlias hoy"
    - "updateAlias(alias, model_key, opts?) acepta opcionalmente {reasoning_effort, max_tokens, thinking_budget} sin romper los callers actuales que pasan solo (alias, model_key)"
    - "updateAlias persiste las 3 columnas nuevas en el UPDATE SQL cuando opts está presente (columnas NULL si opts.field es undefined)"
    - "Interface AliasConfig exportada desde alias-routing.ts como contrato público para consumers downstream (Plan 02 + Plan 04)"
    - "Tests Vitest cubren: row→config mapping, NULL→null preservation, fallback carries config, shim retorna solo .model, embed alias unchanged"
  artifacts:
    - path: "app/src/lib/services/alias-routing.ts"
      provides: "resolveAliasConfig() + AliasConfig interface + AliasRowV30 interface + extended updateAlias signature"
      contains: "export async function resolveAliasConfig"
    - path: "app/src/lib/services/alias-routing.ts"
      provides: "resolveAlias() shim preservando back-compat Promise<string>"
      contains: "return (await resolveAliasConfig(alias)).model"
    - path: "app/src/lib/services/__tests__/alias-routing.test.ts"
      provides: "describe('resolveAliasConfig') con 5+ tests verdes (CFG-03)"
      min_lines: 50
  key_links:
    - from: "app/src/lib/services/alias-routing.ts (resolveAliasConfig)"
      to: "SELECT * FROM model_aliases WHERE alias = ? AND is_active = 1"
      via: "db.prepare con casting a AliasRowV30 que incluye reasoning_effort, max_tokens, thinking_budget"
      pattern: "reasoning_effort.*max_tokens.*thinking_budget"
    - from: "app/src/lib/services/alias-routing.ts (resolveAlias shim)"
      to: "resolveAliasConfig (mismo archivo)"
      via: "(await resolveAliasConfig(alias)).model"
      pattern: "await resolveAliasConfig"
    - from: "app/src/lib/services/alias-routing.ts (updateAlias extended)"
      to: "UPDATE model_aliases SET model_key = ?, reasoning_effort = ?, max_tokens = ?, thinking_budget = ?"
      via: "extended SQL con 4 placeholders"
      pattern: "SET model_key.*reasoning_effort.*max_tokens.*thinking_budget"
---

<objective>
Extender el servicio `alias-routing.ts` con una función paralela `resolveAliasConfig(alias)` que devuelve el objeto completo `{model, reasoning_effort, max_tokens, thinking_budget}`, mantener `resolveAlias(alias): Promise<string>` como shim byte-identical para los 15+ callers existentes (back-compat HARD constraint), y extender `updateAlias()` con un parámetro opcional `opts` para persistir las 3 columnas nuevas introducidas por Phase 158.

Purpose: Cubre requirement **CFG-03**. Este plan es el fundamento contractual para Plan 02 (PATCH consume `updateAlias` extendido) y Plan 04 (catbot chat route consume `resolveAliasConfig`). Sin esta capa, los otros plans no tienen ni interfaz ni persistencia. La decisión de **parallel-function** (no breaking change) es locked por el research (Pitfall #1): romper `resolveAlias()` cascade-fallaría los 14 callers de producción + 7 test mocks. Sólo `/api/catbot/chat/route.ts:119` migra a `resolveAliasConfig` (en Plan 04).

Output: `alias-routing.ts` con `AliasConfig` + `AliasRowV30` interfaces, `resolveAliasConfig()` función nueva, `resolveAlias()` shim, `updateAlias()` con opts opcional. Tests Vitest extendiendo `alias-routing.test.ts` con describe "resolveAliasConfig" (~5 tests) + describe "updateAlias with opts" (~2 tests).
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/159-backend-passthrough-litellm-reasoning/159-RESEARCH.md
@.planning/phases/159-backend-passthrough-litellm-reasoning/159-VALIDATION.md
@app/src/lib/services/alias-routing.ts
@app/src/lib/services/__tests__/alias-routing.test.ts

<interfaces>
<!-- Current exports from alias-routing.ts (byte-identical preservation for callers). -->

```typescript
// CURRENT (v29.1) — DO NOT CHANGE these public signatures:
export interface AliasRow {
  alias: string;
  model_key: string;
  description: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}
export function seedAliases(): void;
export function getAllAliases(opts?: { active_only?: boolean }): AliasRow[];
export function updateAlias(alias: string, newModelKey: string): AliasRow;
// resolveAlias MUST remain Promise<string> per back-compat constraint.
export async function resolveAlias(alias: string): Promise<string>;
```

<!-- ADDITIVE in Plan 01 — new exports alongside existing ones: -->

```typescript
// NEW:
export interface AliasConfig {
  model: string;
  reasoning_effort: 'off' | 'low' | 'medium' | 'high' | null;
  max_tokens: number | null;
  thinking_budget: number | null;
}
export interface AliasRowV30 extends AliasRow {
  reasoning_effort: 'off' | 'low' | 'medium' | 'high' | null;
  max_tokens: number | null;
  thinking_budget: number | null;
}
export async function resolveAliasConfig(alias: string): Promise<AliasConfig>;

// EXTENDED signature (back-compat — opts is optional, old callers pass only 2 args):
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

<!-- Phase 158 added 3 columns to model_aliases that this plan reads and writes:
     reasoning_effort TEXT CHECK (reasoning_effort IN ('off','low','medium','high') OR NULL)
     max_tokens INTEGER NULL
     thinking_budget INTEGER NULL
     All default to NULL which preserves byte-identical behavior for 8 existing aliases.
-->

<!-- Existing test pattern (alias-routing.test.ts:1-80) — mocks db/logger/discovery/mid via vi.mock.
     New tests EXTEND this file; do NOT create a separate file. The existing mock harness is correct. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extender tests en alias-routing.test.ts (RED)</name>
  <files>app/src/lib/services/__tests__/alias-routing.test.ts</files>
  <behavior>
    - Añadir describe('resolveAliasConfig', …) con los siguientes tests (todos deben FALLAR inicialmente porque la función aún no existe):
      - Test CFG-03a — "returns config with model + all 3 reasoning fields populated from row":
          Mock db row con {alias:'catbot', model_key:'anthropic/claude-opus-4-6', is_active:1, reasoning_effort:'high', max_tokens:8000, thinking_budget:4000}.
          Mock getInventory para incluir 'anthropic/claude-opus-4-6'.
          `resolveAliasConfig('catbot')` devuelve `{model:'anthropic/claude-opus-4-6', reasoning_effort:'high', max_tokens:8000, thinking_budget:4000}`.
      - Test CFG-03b — "preserves NULL→null for all 3 config fields when DB row has NULLs":
          Mock db row con {reasoning_effort:null, max_tokens:null, thinking_budget:null} (default post-Phase 158).
          Mock getInventory para incluir el model_key.
          `resolveAliasConfig('chat-rag')` devuelve `{model:'gemini-main', reasoning_effort:null, max_tokens:null, thinking_budget:null}`.
      - Test CFG-03c — "fallback to same-tier alternative carries the row's reasoning config":
          Mock db row con {model_key:'gemini-main', reasoning_effort:'medium', max_tokens:4000, thinking_budget:null}.
          Mock getInventory para NO incluir gemini-main (configured model down).
          Mock midModels para incluir alt same-tier 'gpt-4o' disponible.
          `resolveAliasConfig('catbot')` devuelve `{model:'gpt-4o', reasoning_effort:'medium', max_tokens:4000, thinking_budget:null}` — fallback model pero config del row preservado (documented behavior per research §Open Question 1).
      - Test CFG-03d — "env fallback when no row: returns {model:envModel, reasoning_effort:null, max_tokens:null, thinking_budget:null}":
          Mock db para devolver undefined (alias no existe).
          Set `process.env.CHAT_MODEL = 'fallback-model'`.
          `resolveAliasConfig('unknown-alias')` devuelve `{model:'fallback-model', reasoning_effort:null, max_tokens:null, thinking_budget:null}`.
      - Test CFG-03e — "embed alias unchanged: uses EMBEDDING_MODEL env var, reasoning fields null":
          Mock db row con {alias:'embed', model_key:'text-embedding-3-small', is_active:1, reasoning_effort:null, max_tokens:null, thinking_budget:null}.
          Mock getInventory para NO incluirlo.
          Set `process.env.EMBEDDING_MODEL = 'nomic-embed-text'`.
          `resolveAliasConfig('embed')` devuelve `{model:'nomic-embed-text', reasoning_effort:null, max_tokens:null, thinking_budget:null}` (NO same-tier fallback para embed, consistente con resolveAlias).
    - Añadir describe('resolveAlias (shim back-compat)', …) con:
      - Test CFG-03f — "resolveAlias returns Promise<string> (model only), same as before":
          Mock db row con reasoning fields set. `resolveAlias('catbot')` devuelve STRING (no objeto). `typeof result === 'string'` y `result === row.model_key`.
    - Añadir describe('updateAlias with opts', …) con:
      - Test CFG-03g — "updateAlias(alias, model_key) sin opts funciona igual que antes (back-compat)":
          Mock db.prepare para 2 calls: UPDATE (changes=1) y SELECT row post-update.
          `updateAlias('catbot', 'claude-opus')` devuelve el AliasRow de la 2da prepare call.
          Assert que el UPDATE SQL contiene `model_key = ?` y no usa opts.
      - Test CFG-03h — "updateAlias(alias, model_key, opts) persiste los 3 campos opcionales":
          `updateAlias('catbot', 'claude-opus', {reasoning_effort:'high', max_tokens:8000, thinking_budget:4000})`.
          Assert que la UPDATE SQL incluye `reasoning_effort = ?, max_tokens = ?, thinking_budget = ?` y recibe los valores correctos como parámetros.
  </behavior>
  <action>
Extender `app/src/lib/services/__tests__/alias-routing.test.ts` (archivo existente — NO crear nuevo). Añadir los 3 describe blocks listados al final del archivo, manteniendo intactos los tests existentes.

**Imports adicionales (si no están ya):** ninguno — `resolveAliasConfig` y `updateAlias` se importan del mismo módulo ya mockeado.

**Patrón de mocking (seguir el existente en el archivo):**
- `mockDbPrepare` devuelve un objeto con `.get()`, `.run()`, `.all()` — ya configurado en líneas 20-32.
- Para simular SELECT de alias row: `mockDbGet.mockReturnValue(makeAliasRowV30({...}))`.
- Para simular UPDATE+SELECT en updateAlias: usar `mockDbPrepare.mockImplementationOnce` dos veces (1a: prepare UPDATE, 2a: prepare SELECT).
- Para simular Discovery: `mockGetInventory.mockResolvedValue(makeInventory([...]))`.
- Para simular MID: `mockGetAll.mockReturnValue([makeMidEntry({...})])`.

**Helper nuevo a añadir:**
```typescript
function makeAliasRowV30(overrides: Record<string, unknown> = {}) {
  return {
    alias: 'catbot',
    model_key: 'gemini-main',
    description: 'CatBot assistant',
    is_active: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    reasoning_effort: null,
    max_tokens: null,
    thinking_budget: null,
    ...overrides,
  };
}
```

**Estructura esperada (añadir después del último describe existente):**
```typescript
describe('resolveAliasConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['CHAT_MODEL'] = '';
    process.env['EMBEDDING_MODEL'] = '';
  });

  it('CFG-03a — returns config with model + all 3 reasoning fields populated from row', async () => {
    mockDbGet.mockReturnValue(makeAliasRowV30({
      alias: 'catbot',
      model_key: 'anthropic/claude-opus-4-6',
      reasoning_effort: 'high',
      max_tokens: 8000,
      thinking_budget: 4000,
    }));
    mockGetInventory.mockResolvedValue(makeInventory(['anthropic/claude-opus-4-6']));
    const { resolveAliasConfig } = await import('../alias-routing');
    const cfg = await resolveAliasConfig('catbot');
    expect(cfg).toEqual({
      model: 'anthropic/claude-opus-4-6',
      reasoning_effort: 'high',
      max_tokens: 8000,
      thinking_budget: 4000,
    });
  });

  it('CFG-03b — preserves NULL→null for all 3 config fields', async () => {
    mockDbGet.mockReturnValue(makeAliasRowV30({ model_key: 'gemini-main' }));
    mockGetInventory.mockResolvedValue(makeInventory(['gemini-main']));
    const { resolveAliasConfig } = await import('../alias-routing');
    const cfg = await resolveAliasConfig('chat-rag');
    expect(cfg.model).toBe('gemini-main');
    expect(cfg.reasoning_effort).toBeNull();
    expect(cfg.max_tokens).toBeNull();
    expect(cfg.thinking_budget).toBeNull();
  });

  it('CFG-03c — fallback to same-tier alternative carries row reasoning config', async () => {
    mockDbGet.mockReturnValue(makeAliasRowV30({
      model_key: 'gemini-main',
      reasoning_effort: 'medium',
      max_tokens: 4000,
      thinking_budget: null,
    }));
    mockGetInventory.mockResolvedValue(makeInventory(['gpt-4o'])); // gemini-main down
    mockGetAll.mockReturnValue([
      makeMidEntry({ model_key: 'gemini-main', tier: 'Pro' }),
      makeMidEntry({ model_key: 'gpt-4o', tier: 'Pro' }),
    ]);
    const { resolveAliasConfig } = await import('../alias-routing');
    const cfg = await resolveAliasConfig('catbot');
    expect(cfg.model).toBe('gpt-4o');
    expect(cfg.reasoning_effort).toBe('medium');
    expect(cfg.max_tokens).toBe(4000);
    expect(cfg.thinking_budget).toBeNull();
  });

  it('CFG-03d — env fallback when no row returns null for reasoning fields', async () => {
    mockDbGet.mockReturnValue(undefined); // alias not found
    process.env['CHAT_MODEL'] = 'fallback-model';
    const { resolveAliasConfig } = await import('../alias-routing');
    const cfg = await resolveAliasConfig('unknown-alias');
    expect(cfg).toEqual({
      model: 'fallback-model',
      reasoning_effort: null,
      max_tokens: null,
      thinking_budget: null,
    });
  });

  it('CFG-03e — embed alias uses EMBEDDING_MODEL with reasoning fields null', async () => {
    mockDbGet.mockReturnValue(makeAliasRowV30({
      alias: 'embed',
      model_key: 'text-embedding-3-small',
    }));
    mockGetInventory.mockResolvedValue(makeInventory([])); // not available
    process.env['EMBEDDING_MODEL'] = 'nomic-embed-text';
    const { resolveAliasConfig } = await import('../alias-routing');
    const cfg = await resolveAliasConfig('embed');
    expect(cfg.model).toBe('nomic-embed-text');
    expect(cfg.reasoning_effort).toBeNull();
    expect(cfg.max_tokens).toBeNull();
    expect(cfg.thinking_budget).toBeNull();
  });
});

describe('resolveAlias (shim back-compat)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('CFG-03f — resolveAlias returns Promise<string> equal to resolved .model', async () => {
    mockDbGet.mockReturnValue(makeAliasRowV30({
      model_key: 'anthropic/claude-opus-4-6',
      reasoning_effort: 'high',
      max_tokens: 8000,
    }));
    mockGetInventory.mockResolvedValue(makeInventory(['anthropic/claude-opus-4-6']));
    const { resolveAlias } = await import('../alias-routing');
    const result = await resolveAlias('catbot');
    expect(typeof result).toBe('string');
    expect(result).toBe('anthropic/claude-opus-4-6');
  });
});

describe('updateAlias with opts', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('CFG-03g — updateAlias without opts works unchanged (back-compat)', async () => {
    // First .prepare().run() for UPDATE returns changes=1
    // Second .prepare().get() for SELECT returns updated row
    const updatedRow = makeAliasRowV30({ alias: 'catbot', model_key: 'gpt-4o' });
    let prepareCallCount = 0;
    mockDbPrepare.mockImplementation((sql: string) => {
      prepareCallCount++;
      if (sql.startsWith('UPDATE')) {
        return { run: vi.fn().mockReturnValue({ changes: 1 }) };
      }
      return { get: vi.fn().mockReturnValue(updatedRow) };
    });
    const { updateAlias } = await import('../alias-routing');
    const result = updateAlias('catbot', 'gpt-4o');
    expect(result).toEqual(updatedRow);
    // Assert UPDATE SQL did NOT include reasoning_effort etc.
    const updateCall = (mockDbPrepare as any).mock.calls.find((c: any[]) => String(c[0]).startsWith('UPDATE'));
    expect(updateCall[0]).toContain('model_key = ?');
    // When opts absent, the SQL should be the legacy form (no new columns)
    expect(updateCall[0]).not.toContain('reasoning_effort = ?');
  });

  it('CFG-03h — updateAlias with opts persists reasoning_effort, max_tokens, thinking_budget', async () => {
    const updatedRow = makeAliasRowV30({
      alias: 'catbot',
      model_key: 'anthropic/claude-opus-4-6',
      reasoning_effort: 'high',
      max_tokens: 8000,
      thinking_budget: 4000,
    });
    const runSpy = vi.fn().mockReturnValue({ changes: 1 });
    mockDbPrepare.mockImplementation((sql: string) => {
      if (sql.startsWith('UPDATE')) return { run: runSpy };
      return { get: vi.fn().mockReturnValue(updatedRow) };
    });
    const { updateAlias } = await import('../alias-routing');
    const result = updateAlias('catbot', 'anthropic/claude-opus-4-6', {
      reasoning_effort: 'high',
      max_tokens: 8000,
      thinking_budget: 4000,
    });
    expect(result).toEqual(updatedRow);
    // Assert UPDATE SQL included the new columns
    const updateCall = (mockDbPrepare as any).mock.calls.find((c: any[]) => String(c[0]).startsWith('UPDATE'));
    expect(updateCall[0]).toContain('reasoning_effort = ?');
    expect(updateCall[0]).toContain('max_tokens = ?');
    expect(updateCall[0]).toContain('thinking_budget = ?');
    // Values passed to .run() must include the opts fields
    expect(runSpy).toHaveBeenCalled();
    const runArgs = runSpy.mock.calls[0] as unknown[];
    expect(runArgs).toContain('high');
    expect(runArgs).toContain(8000);
    expect(runArgs).toContain(4000);
  });
});
```

**Reglas duras:**
1. NO crear archivo nuevo de test — EXTENDER el existente `alias-routing.test.ts`.
2. Los tests importan `resolveAliasConfig`, `resolveAlias`, `updateAlias` de `../alias-routing` via `await import(...)` (patrón existente en el archivo; no sé si se usa ahí, revisar — si no, usar import estático al top del archivo).
3. RED phase: estos tests DEBEN fallar antes de Task 2 (función `resolveAliasConfig` no existe todavía; `updateAlias` no acepta opts todavía). **Commit RED**: `test(159-01): add failing tests for resolveAliasConfig and updateAlias opts`.
4. NO tocar los tests existentes — añadir bloques nuevos al final.
5. Usar `process.env['...'] = '...'` (bracket notation obligatoria por MEMORY.md).
6. `beforeEach` clear mocks + reset env vars.
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm run test:unit -- src/lib/services/__tests__/alias-routing.test.ts -t "resolveAliasConfig|resolveAlias (shim|updateAlias with opts"</automated>
  </verify>
  <done>
    - 8 tests nuevos añadidos (CFG-03a..h).
    - Tests fallan en RED (resolveAliasConfig no existe, updateAlias opts no implementado).
    - Tests existentes siguen verdes (no se han tocado).
    - Commit RED creado con mensaje `test(159-01): add failing tests for resolveAliasConfig and updateAlias opts`.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implementar resolveAliasConfig, AliasConfig, AliasRowV30, y updateAlias extendido (GREEN)</name>
  <files>app/src/lib/services/alias-routing.ts</files>
  <behavior>
    - Export `AliasConfig` interface con shape `{model, reasoning_effort, max_tokens, thinking_budget}`.
    - Export `AliasRowV30` interface extendiendo `AliasRow` con las 3 columnas nuevas.
    - Export `resolveAliasConfig(alias): Promise<AliasConfig>` — replica toda la lógica de `resolveAlias` pero devuelve objeto.
    - Refactor `resolveAlias(alias): Promise<string>` para delegar: `return (await resolveAliasConfig(alias)).model`. SIGNATURA PÚBLICA INTACTA.
    - Extend `updateAlias(alias, model_key, opts?)`: si `opts` presente, incluir las 3 columnas en el UPDATE SQL; si ausente, SQL legacy sin las columnas nuevas (preserva behavior de test CFG-03g).
    - Todos los 8 tests de Task 1 pasan GREEN.
  </behavior>
  <action>
Editar `app/src/lib/services/alias-routing.ts` implementando:

**1. Después de la interface `AliasRow` existente (línea 15), añadir:**

```typescript
export interface AliasConfig {
  model: string;
  reasoning_effort: 'off' | 'low' | 'medium' | 'high' | null;
  max_tokens: number | null;
  thinking_budget: number | null;
}

export interface AliasRowV30 extends AliasRow {
  reasoning_effort: 'off' | 'low' | 'medium' | 'high' | null;
  max_tokens: number | null;
  thinking_budget: number | null;
}
```

**2. Refactor `resolveAlias` (líneas 80-141) para usar `resolveAliasConfig`:**

Reemplazar el cuerpo completo de `resolveAlias` con:
```typescript
// Phase 159 (v30.0): Back-compat shim. Returns Promise<string> for 15+ existing callers.
// New code should use resolveAliasConfig() to access reasoning_effort, max_tokens, thinking_budget.
export async function resolveAlias(alias: string): Promise<string> {
  return (await resolveAliasConfig(alias)).model;
}
```

**3. Añadir `resolveAliasConfig` (nueva función, reusa la lógica de fallback actual pero con AliasConfig shape):**

```typescript
// Phase 159 (v30.0): Full alias resolution with per-alias reasoning config.
// Returns { model, reasoning_effort, max_tokens, thinking_budget }.
// Fallback semantics identical to resolveAlias (Discovery → same-tier MID → env → throw).
// When fallback to a different model occurs, the ORIGINAL row's reasoning config is carried
// (documented behavior — consumer must re-validate capabilities if strict).
export async function resolveAliasConfig(alias: string): Promise<AliasConfig> {
  const start = Date.now();

  // 1. Look up alias in DB (extended to read the 3 new columns).
  const row = db.prepare(
    'SELECT * FROM model_aliases WHERE alias = ? AND is_active = 1'
  ).get(alias) as AliasRowV30 | undefined;

  // Helper: build AliasConfig from a resolved model + row's reasoning config (null-safe).
  const makeCfg = (model: string): AliasConfig => ({
    model,
    reasoning_effort: row?.reasoning_effort ?? null,
    max_tokens: row?.max_tokens ?? null,
    thinking_budget: row?.thinking_budget ?? null,
  });

  if (!row) {
    const envModel = process['env']['CHAT_MODEL'] || '';
    if (envModel) {
      logResolution(alias, 'unknown', envModel, true, 'alias_not_found', Date.now() - start);
      return { model: envModel, reasoning_effort: null, max_tokens: null, thinking_budget: null };
    }
    logResolution(alias, 'unknown', 'NONE', true, 'no_model_available', Date.now() - start);
    throw new Error(`No model available for alias "${alias}". Check alias configuration.`);
  }

  const configuredModel = row.model_key;

  // 2. Check Discovery availability (also check litellm/ prefixed variants).
  const inventory = await getInventory();
  const availableIds = new Set(inventory.models.map((m: { id: string }) => m.id));

  if (availableIds.has(configuredModel) || availableIds.has(`litellm/${configuredModel}`)) {
    logResolution(alias, configuredModel, configuredModel, false, undefined, Date.now() - start);
    return makeCfg(configuredModel);
  }

  // 3. Same-tier MID fallback (chat aliases only, NOT embed).
  if (alias !== 'embed') {
    const midModels = getMidModels({ status: 'active' });
    const configuredMid = midModels.find((m: { model_key: string }) => m.model_key === configuredModel);
    const targetTier = configuredMid?.tier || 'Pro';

    const sameTierAlternatives = midModels
      .filter((m: { tier: string; model_key: string }) => m.tier === targetTier && m.model_key !== configuredModel)
      .map((m: { model_key: string }) => m.model_key);

    for (const alt of sameTierAlternatives) {
      if (availableIds.has(alt) || availableIds.has(`litellm/${alt}`)) {
        logResolution(alias, configuredModel, alt, true, `same_tier_fallback:${targetTier}`, Date.now() - start);
        return makeCfg(alt);
      }
    }
  }

  // 4. Env fallback -- embed uses EMBEDDING_MODEL, chat uses CHAT_MODEL.
  const envKey = alias === 'embed' ? 'EMBEDDING_MODEL' : 'CHAT_MODEL';
  const envModel = process['env'][envKey] || '';
  if (envModel) {
    logResolution(alias, configuredModel, envModel, true, 'env_fallback', Date.now() - start);
    return makeCfg(envModel);
  }

  // 5. Error -- no silent degradation.
  logResolution(alias, configuredModel, 'NONE', true, 'no_model_available', Date.now() - start);
  throw new Error(
    `No model available for alias "${alias}". Configured: "${configuredModel}" is down. Check Discovery status.`
  );
}
```

**4. Extend `updateAlias` (líneas 55-76) con parámetro `opts` opcional:**

Reemplazar el cuerpo completo de `updateAlias` con:
```typescript
export function updateAlias(
  alias: string,
  newModelKey: string,
  opts?: {
    reasoning_effort?: 'off' | 'low' | 'medium' | 'high' | null;
    max_tokens?: number | null;
    thinking_budget?: number | null;
  }
): AliasRow {
  if (!newModelKey || newModelKey.trim() === '') {
    throw new Error('New model key cannot be empty');
  }

  let result;
  if (opts) {
    // Phase 159 (v30.0): extended UPDATE with reasoning config columns.
    result = db.prepare(
      "UPDATE model_aliases SET model_key = ?, reasoning_effort = ?, max_tokens = ?, thinking_budget = ?, updated_at = datetime('now') WHERE alias = ?"
    ).run(
      newModelKey,
      opts.reasoning_effort ?? null,
      opts.max_tokens ?? null,
      opts.thinking_budget ?? null,
      alias,
    );
  } else {
    // Legacy path (14+ existing callers unchanged).
    result = db.prepare(
      "UPDATE model_aliases SET model_key = ?, updated_at = datetime('now') WHERE alias = ?"
    ).run(newModelKey, alias);
  }

  if (result.changes === 0) {
    throw new Error(`Alias "${alias}" not found`);
  }

  const updated = db.prepare('SELECT * FROM model_aliases WHERE alias = ?').get(alias) as AliasRow;

  logger.info('alias-routing', `Alias updated: ${alias} -> ${newModelKey}`, {
    alias,
    new_model: newModelKey,
    reasoning_effort: opts?.reasoning_effort,
    max_tokens: opts?.max_tokens,
    thinking_budget: opts?.thinking_budget,
  });

  return updated;
}
```

**Reglas duras:**
1. `resolveAlias` ahora es un one-liner shim — NO mantener el cuerpo viejo. El cuerpo completo vive en `resolveAliasConfig`.
2. Firma pública `resolveAlias(alias): Promise<string>` INMUTABLE — back-compat HARD constraint del research (Pitfall #1).
3. `updateAlias` con `opts` opcional mantiene back-compat. Si `opts` es undefined → SQL legacy (sin columnas nuevas). Si `opts` presente → SQL extendido.
4. NO renombrar nada. NO quitar comentarios MIGRATION CHECKLIST (líneas 145-180) — son referencia histórica útil.
5. `process['env'][...]` (bracket notation) — MEMORY.md requisito para bypass webpack inline.
6. No añadir imports nuevos — ya están todos disponibles (`db`, `logger`, `getInventory`, `getMidModels`).
7. Commit GREEN: `feat(159-01): implement resolveAliasConfig + extended updateAlias for v30.0`.
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm run test:unit -- src/lib/services/__tests__/alias-routing.test.ts</automated>
  </verify>
  <done>
    - `resolveAliasConfig` exportada y funcional.
    - `resolveAlias` refactor a shim (1 línea).
    - `AliasConfig` y `AliasRowV30` interfaces exportadas.
    - `updateAlias` acepta opcional `opts` con 3 campos.
    - Los 8 tests nuevos de Task 1 GREEN.
    - Tests existentes del archivo (resolveAlias originales) siguen verdes (back-compat verificado).
    - `cd app && npm run lint` exit 0.
    - Commit GREEN creado.
  </done>
</task>

</tasks>

<verification>
## Plan 159-01 verification (ejecutar en orden)

1. **Vitest — unit tests del servicio:**
   ```bash
   cd app && npm run test:unit -- src/lib/services/__tests__/alias-routing.test.ts
   ```
   Esperado: TODOS los tests verdes (existentes + 8 nuevos = ~N).

2. **Regresión — tests que mockean resolveAlias (7 archivos según research):**
   ```bash
   cd app && npm run test:unit -- src/app/api src/lib/services 2>&1 | tail -40
   ```
   Esperado: 0 failing. Cualquier test que mockea `resolveAlias: vi.fn().mockResolvedValue('string')` sigue funcional porque la signatura pública está intacta.

3. **Type-check (compilación TS):**
   ```bash
   cd app && npm run build
   ```
   Esperado: exit 0. Si falla por `resolveAlias` (por ejemplo un caller ahora recibe objeto), revertir Task 2 y reexaminar — la back-compat shim DEBE preservar el tipo.

4. **Lint:**
   ```bash
   cd app && npm run lint
   ```
   Esperado: exit 0. Sin unused vars ni warnings (feedback_unused_imports_build.md).
</verification>

<success_criteria>
Medibles:
- [ ] `resolveAliasConfig(alias)` exportado desde `alias-routing.ts` y devuelve `Promise<AliasConfig>` — **CFG-03**
- [ ] `resolveAlias(alias)` sigue siendo `Promise<string>` (shim back-compat)
- [ ] `AliasConfig` y `AliasRowV30` interfaces exportados
- [ ] `updateAlias(alias, model_key)` sin opts funciona igual que antes (14+ callers intactos)
- [ ] `updateAlias(alias, model_key, opts)` con opts persiste reasoning_effort/max_tokens/thinking_budget en el UPDATE SQL
- [ ] 8 tests nuevos (CFG-03a..h) verdes en `alias-routing.test.ts`
- [ ] Tests existentes del archivo siguen verdes (zero regresión)
- [ ] `npm run build` exit 0 (type-check)
- [ ] `npm run lint` exit 0
</success_criteria>

<output>
After completion, create `.planning/phases/159-backend-passthrough-litellm-reasoning/159-01-SUMMARY.md`
</output>
</content>
</invoke>