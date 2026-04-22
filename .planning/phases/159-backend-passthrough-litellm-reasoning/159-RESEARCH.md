# Phase 159: Backend Passthrough LiteLLM Reasoning — Research

**Researched:** 2026-04-22
**Domain:** Next.js API routes + LiteLLM passthrough + SQLite schema evolution (DocFlow DocFlow v30.0)
**Confidence:** HIGH

## Summary

Phase 158 added the schema and seed data (columns `is_local`, `supports_reasoning`, `max_tokens_cap` on `model_intelligence`; columns `reasoning_effort`, `max_tokens`, `thinking_budget` on `model_aliases`) and enriched `GET /api/models`. Phase 159 wires the runtime: make `resolveAlias()` return the per-alias config object, validate PATCH `/api/alias-routing` against model capabilities, propagate `reasoning_effort` + `thinking.budget_tokens` + `max_tokens` through `streamLiteLLM` into the LiteLLM body, and have `/api/catbot/chat` feed the resolved config to the stream call.

The single biggest risk is **back-compat for `resolveAlias()`**: the current signature returns `Promise<string>` and has **15+ call sites** across routes, services and tests, every single one doing `await resolveAlias('foo')` in a position where a string is expected (assigned to `model`, passed to `litellm.resolveModel`, compared with `.includes`, etc.). A breaking change to return shape would cascade into every caller. The prescriptive answer is a **parallel function** (`resolveAliasConfig()` returns `{model, reasoning_effort, max_tokens, thinking_budget}`) plus keeping `resolveAlias(alias)` as a convenience wrapper that returns the model string for the 14 callers that do not need config. Only `/api/catbot/chat` (the one caller PASS-04 names) is migrated to `resolveAliasConfig`.

LiteLLM body shape for reasoning is authoritative per official docs (2026-04): OpenAI-style `reasoning_effort: "low"|"medium"|"high"` and Anthropic-style `thinking: {type: "enabled", budget_tokens: N}` are both valid request-body fields on `/v1/chat/completions`. LiteLLM internally maps `reasoning_effort` → Anthropic `thinking` on Anthropic models and → OpenAI native `reasoning_effort` on OpenAI models. The gateway emits `reasoning_content` in response `choices[0].message.reasoning_content` across all providers — irrelevant for Phase 159 (Phase 161 VER-03 will consume it), but critical for oracle design.

**Primary recommendation:** Introduce `resolveAliasConfig(alias)` as the new public function that returns `AliasConfig`. Keep `resolveAlias(alias)` unchanged (string return) as a shim implemented as `(await resolveAliasConfig(alias)).model`. This keeps PASS-04 surgical (only catbot route changes) and CFG-03 honored (an alias-config-returning function exists). Validation in PATCH is done by pre-loading the target model row from `model_intelligence` and rejecting 400 when capability conflicts. Propagation through `streamLiteLLM` is two new optional fields in `StreamOptions`, spread conditionally into the body JSON (follows existing `tools` / `max_tokens` pattern).

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for Phase 159. No `/gsd:discuss-phase` has been run.

### Locked Decisions
None declared for Phase 159. All Phase 159 decisions fall under Claude's Discretion. Constraints that carry forward from Phase 158 CONTEXT.md (schema is locked):
- Columns are exactly `is_local` + `supports_reasoning` + `max_tokens_cap` on `model_intelligence` (booleans stored as INTEGER 0/1) and `reasoning_effort` (TEXT with CHECK `off|low|medium|high|NULL`) + `max_tokens` (INTEGER nullable) + `thinking_budget` (INTEGER nullable) on `model_aliases`.
- `reasoning_effort` CHECK constraint at SQL level accepts NULL — **NULL means "preserve current behaviour" and MUST serialize as "don't send the field to LiteLLM"**.
- `/api/models` response shape is **flat root** (not nested `capabilities: {…}`).
- Seed max_tokens_cap for Opus 4.6 is **32000** (user-locked, not the 128000 vendor docs list).

### Claude's Discretion
Everything in Phase 159:
- Whether `resolveAlias` mutates signature or a new `resolveAliasConfig` is added (this research recommends the parallel-function approach).
- PATCH `/api/alias-routing` validation strategy (sync DB read of capabilities vs async lookup, error format, whether to merge or replace missing fields).
- `streamLiteLLM` parameter surface (extend `StreamOptions` with two optional fields; how to serialize `"off"` — recommendation: `reasoning_effort === 'off'` → omit field entirely).
- Whether to propagate `reasoning_effort`/`thinking` through the **non-streaming** path in `/api/catbot/chat` (one fetch call at line 459 bypasses `streamLiteLLM` entirely — recommendation: yes, for symmetry).

### Deferred Ideas (OUT OF SCOPE)
Per `REQUIREMENTS.md` v30.0 "Out of Scope":
- Other aliases (`chat-rag`, `canvas-agent`, `canvas-writer`) consuming `reasoning_effort` — FUT-01 in v30.1.
- UI for reasoning on non-catbot aliases — FUT-02.
- UI to display `reasoning_content` in chat — FUT-03.
- Reasoning tokens dashboard — FUT-04.
- Dynamic thinking budget per request — out of scope.
- Thinking cost forecasting — out of scope.
- Reasoning on Ollama/local — out of scope.
- Persisting `reasoning_content` to DB — out of scope.

**Practical implication:** Phase 159 propagates the params but does NOT surface `reasoning_content` anywhere (neither response logging nor SSE emission) — that's Phase 161 VER-03 oracle work.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CFG-02 | `PATCH /api/alias-routing` valida y persiste los tres campos nuevos | §Architecture Patterns "PATCH validator"; §Code Examples validator snippet; §Don't Hand-Roll row "body-shape validation"; §Common Pitfalls "CHECK constraint vs application validation" |
| CFG-03 | `resolveAlias(alias)` devuelve objeto `{model, reasoning_effort, max_tokens, thinking_budget}` | §Architecture Patterns "resolveAliasConfig parallel function"; §Back-compat contract (15 callers enumerated); §Code Examples resolveAliasConfig snippet |
| PASS-01 | `streamLiteLLM` acepta `reasoning_effort` y lo envía al body | §Architecture Patterns "StreamOptions extension"; §Code Examples streamLiteLLM body; §Common Pitfalls "off vs undefined" |
| PASS-02 | `streamLiteLLM` acepta `thinking: {budget_tokens}` y lo envía al body | §Code Examples streamLiteLLM body; §LiteLLM body shape table |
| PASS-03 | `max_tokens` efectivo desde alias config, fallback default | §Architecture Patterns "max_tokens resolution order"; §Code Examples catbot route |
| PASS-04 | CatBot chat route pasa a `streamLiteLLM` los params resueltos | §Code Examples catbot route "streaming + non-streaming"; §Architecture Patterns "one caller migrates" |
</phase_requirements>

## Standard Stack

### Core (already installed — Phase 159 uses existing infra)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | existing | Sync SQLite access — prepared statements for validator reads | Only DB driver in repo; `db.prepare(...).get(key)` is the idiomatic DocFlow read |
| `next` | 14 (App Router) | API routes — `PATCH` in `route.ts` + `NextResponse`/`NextRequest` | Existing framework, no alternative |
| `vitest` | 4.1.0 | Unit tests with `vi.mock` for DB/logger/services | Already configured (`app/package.json` → `test:unit`); patterns established in `alias-routing.test.ts` |
| LiteLLM gateway | production (port 4000) | Passthrough of `reasoning_effort` + `thinking` to Anthropic/Google/OpenAI | Already supports both fields as of 2026-04 per upstream docs |

### Supporting (already present — no new installs)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@/lib/logger` | existing | `logger.info/warn/error` with source | Every route/service — Phase 159 emits `'alias-routing'` and `'catbot'` sources |
| `@/lib/services/discovery` (`getInventory`) | existing | Availability check in `resolveAlias` fallback chain | Reuse in `resolveAliasConfig` — same fallback semantics |
| `@/lib/services/mid` (`getAll`) | existing | Same-tier alternative discovery | Reuse unchanged |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Parallel `resolveAliasConfig()` + shim `resolveAlias()` | Breaking change: `resolveAlias()` now returns object everywhere | 15+ callers would need edits (`.model` everywhere or `const {model} = await resolveAlias(...)` destructuring). **Parallel function costs less** and satisfies CFG-03 literally. |
| Validator library (`zod`) for PATCH body | Inline `if (typeof … === 'string')` checks | Existing PATCH validator (route.ts lines 17-33) uses inline pattern — consistent. Zod not in deps; adding it for 5 fields is overkill. |
| `sqlite` CHECK constraint for capabilities conflict | Application-layer validator in PATCH | CHECK can't do cross-table validation (`supports_reasoning` lives in `model_intelligence`, `reasoning_effort` in `model_aliases`). MUST be application-layer. |
| Separate `/api/alias-routing/:alias/config` endpoint | Extend existing `PATCH /api/alias-routing` | Existing endpoint handles a single alias per call; extend it with optional fields. One endpoint is simpler for the UI in Phase 161. |

**No new packages required.** Phase 159 is pure wiring.

## Architecture Patterns

### Recommended File Touch List
```
app/src/
├── lib/services/
│   ├── alias-routing.ts         # ADD resolveAliasConfig(); keep resolveAlias() as shim
│   └── stream-utils.ts          # EXTEND StreamOptions + body JSON
├── app/api/
│   ├── alias-routing/
│   │   ├── route.ts             # EXTEND PATCH validator (new optional fields + capability check)
│   │   └── __tests__/
│   │       └── route.test.ts    # EXTEND with CFG-02 validator tests
│   └── catbot/chat/
│       └── route.ts             # MIGRATE to resolveAliasConfig + propagate params in BOTH streaming and non-streaming path
├── lib/services/__tests__/
│   ├── alias-routing.test.ts    # EXTEND with resolveAliasConfig tests (CFG-03)
│   └── stream-utils.test.ts     # EXTEND with PASS-01/PASS-02 body-shape tests
└── (no new files strictly required — everything extends)
```

### Pattern 1: Parallel-Function for Shape Evolution (resolveAlias back-compat)
**What:** Add a new function with the extended return shape; keep the old function as a thin wrapper that extracts the previous return value.
**When to use:** When 10+ callers depend on the old signature and only 1 caller needs the new shape.
**Example:**
```typescript
// alias-routing.ts
export interface AliasConfig {
  model: string;
  reasoning_effort: 'off' | 'low' | 'medium' | 'high' | null;
  max_tokens: number | null;
  thinking_budget: number | null;
}

export async function resolveAliasConfig(alias: string): Promise<AliasConfig> {
  // Full existing resolveAlias logic — reads the row, applies Discovery fallback,
  // same-tier MID fallback, env fallback, etc. — but now selects extra columns
  // and returns the whole object. Identical fallback semantics.
  const row = db.prepare(
    'SELECT * FROM model_aliases WHERE alias = ? AND is_active = 1'
  ).get(alias) as AliasRow | undefined;
  // ... same Discovery + MID + env chain as today ...
  // Return object with extra fields (reasoning_effort, max_tokens, thinking_budget
  // read verbatim from the resolved row — NULL preserved as NULL).
}

// Back-compat shim — every existing caller keeps working unchanged.
export async function resolveAlias(alias: string): Promise<string> {
  return (await resolveAliasConfig(alias)).model;
}
```

This matches the v29.1 pattern where `buildBody(subtype, row)` evolved to `buildBody(subtype, row, relations?)` with relations optional (see STATE.md "Phase Phase 157-02 buildBody 3-arg signature"). Additive, not breaking.

### Pattern 2: StreamOptions Additive Extension
**What:** Add optional fields to a TypeScript interface and conditionally spread them into a request body.
**When to use:** Extending a stream/HTTP call without breaking existing callers.
**Example:** Existing body-spread pattern at `stream-utils.ts:50-57`:
```typescript
body: JSON.stringify({
  model: options.model,
  messages: options.messages,
  ...(options.max_tokens ? { max_tokens: options.max_tokens } : {}),
  ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
  stream: true,
  stream_options: { include_usage: true },
})
```
Extend with:
```typescript
body: JSON.stringify({
  model: options.model,
  messages: options.messages,
  ...(options.max_tokens ? { max_tokens: options.max_tokens } : {}),
  ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
  // Phase 159: passthrough reasoning params. When 'off', omit entirely (sentinel for "disable").
  ...(options.reasoning_effort && options.reasoning_effort !== 'off'
    ? { reasoning_effort: options.reasoning_effort }
    : {}),
  ...(options.thinking ? { thinking: options.thinking } : {}),
  stream: true,
  stream_options: { include_usage: true },
})
```
**All current callers still work** because both new fields are optional.

### Pattern 3: PATCH Validator With Cross-Table Capability Check
**What:** Validate input fields by first reading the target capability row, then rejecting on conflict before persisting.
**When to use:** When validation depends on another table's row (capabilities in `model_intelligence` vs user input in `model_aliases`).
**Example:**
```typescript
// Minimal normalisation: null/undefined → null; keep strings/numbers as-is.
const reasoning_effort = body?.reasoning_effort ?? null;
const max_tokens = body?.max_tokens ?? null;
const thinking_budget = body?.thinking_budget ?? null;

// Read capabilities of TARGET model (post-update state).
const cap = db.prepare(
  `SELECT supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key = ?`
).get(model_key) as { supports_reasoning: number | null; max_tokens_cap: number | null } | undefined;

// Capability violations → 400 BEFORE any write.
if (reasoning_effort && reasoning_effort !== 'off' && cap && cap.supports_reasoning !== 1) {
  return NextResponse.json({
    error: `Model ${model_key} does not support reasoning (reasoning_effort must be 'off' or null)`
  }, { status: 400 });
}
if (typeof max_tokens === 'number' && cap?.max_tokens_cap && max_tokens > cap.max_tokens_cap) {
  return NextResponse.json({
    error: `max_tokens (${max_tokens}) exceeds model cap (${cap.max_tokens_cap})`
  }, { status: 400 });
}
if (typeof thinking_budget === 'number' && typeof max_tokens === 'number' && thinking_budget > max_tokens) {
  return NextResponse.json({
    error: `thinking_budget (${thinking_budget}) cannot exceed max_tokens (${max_tokens})`
  }, { status: 400 });
}
```

### Pattern 4: max_tokens Resolution Order in CatBot Route
**What:** Hierarchical fallback — alias config (if set) → hardcoded default.
**When to use:** For any per-alias override that should defer to a global default when absent.
**Example (in `/api/catbot/chat/route.ts`):**
```typescript
const cfg = await resolveAliasConfig('catbot');
// Respect request-override for model only (as today). Alias config applies when
// the request doesn't override. Hardcoded 2048 stays as the floor for catbot.
const model = requestedModel || catbotConfig.model || cfg.model;
const reasoning_effort = cfg.reasoning_effort; // string | null
const thinking = cfg.thinking_budget
  ? { type: 'enabled' as const, budget_tokens: cfg.thinking_budget }
  : undefined;
const max_tokens = cfg.max_tokens ?? 2048; // preserves today's hardcoded fallback
```

### Anti-Patterns to Avoid
- **Breaking `resolveAlias()` signature:** Don't mutate the return type. 15+ callers will ripple-break.
- **Validating AFTER write:** Validator must short-circuit BEFORE `updateAlias(...)` runs, or a failed validation leaves the row in an invalid state.
- **Sending `reasoning_effort: 'off'` to LiteLLM:** Unknown if all providers accept it. **Omit the field entirely** when effort is `'off'` or `null`. This is the sentinel the schema already uses.
- **Sending `thinking: {budget_tokens: 0}`:** LiteLLM may reject or silently ignore; `thinking` is only included when `thinking_budget` is a positive integer.
- **Touching the non-streaming fetch branch at line 459-470 of catbot/chat/route.ts:** Easy to miss — the file has TWO call sites to LiteLLM (streaming via `streamLiteLLM`, non-streaming via direct `fetch`). Both need the same params for symmetry.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite CHECK validation | Application-layer regex against `['off','low','medium','high']` | Rely on the CHECK constraint added in Phase 158 (`reasoning_effort` column has CHECK). Let `db.prepare().run()` throw `SQLITE_CONSTRAINT_CHECK`, catch, return 400. | DB is already enforcing; reimplementing in app is duplicate logic that drifts. |
| Body validation framework | Zod/Yup schema for PATCH body | Inline `typeof === 'string'` / `typeof === 'number'` checks per the current pattern (`route.ts:20-22`). | 5 fields, 1 endpoint. Zod adds 30KB to the bundle and breaks consistency with the existing validator style. |
| Response fallback for partial enriched rows | Custom "nullability layer" | Native `??` in TypeScript (`row?.reasoning_effort ?? null`) | Already the pattern in `/api/models/route.ts:112-118`. Works for all nullable enriched fields. |
| Reasoning response collection | Parse `reasoning_content` from SSE deltas | **Skip entirely.** Phase 159 does not surface reasoning output. Phase 161 VER-03 does. | Scope-locked (FUT-03 is v30.1). |
| Docker rebuild in tests | Full container rebuild per CI run | Vitest mocks for db/logger/fetch — no container needed. Smoke via Docker only at phase-level manual verify. | Existing test patterns (alias-routing.test.ts, stream-utils.test.ts) use mocks exclusively. |

**Key insight:** Phase 159 is **additive wiring**, not new infrastructure. Every concept (validator style, fallback chain, stream body spread, SQLite prepared statements) has a verbatim precedent in the codebase. Copy the pattern, extend the params, add tests.

## Common Pitfalls

### Pitfall 1: Forgetting the non-streaming catbot fetch branch
**What goes wrong:** You migrate `resolveAlias` → `resolveAliasConfig` and update the `streamLiteLLM(...)` call in the streaming branch. But `/api/catbot/chat/route.ts` has a SECOND call site at lines 459-470 that uses raw `fetch()` directly for non-streaming mode. If you don't add `reasoning_effort` / `thinking` / `max_tokens` there too, non-streaming responses lack reasoning.
**Why it happens:** The file is 740 lines and the non-streaming branch is after the streaming branch's `return` — easy to miss on visual scan.
**How to avoid:** Grep `litellmUrl}/v1/chat/completions` in the file (2 matches: one inside `streamLiteLLM` in stream-utils.ts, one inline in catbot route line 459). Both must be kept symmetric.
**Warning signs:** PASS-04 oracle only works with `stream: true` in request body and fails with `stream: false`.

### Pitfall 2: `reasoning_effort = 'off'` propagated instead of omitted
**What goes wrong:** You serialize `reasoning_effort: 'off'` to LiteLLM. LiteLLM's mapper for Anthropic models may interpret `'off'` as the string `'off'`, which is not in its recognised set (`low`/`medium`/`high`). Per the vendor docs, unknown values are silently dropped on some providers.
**Why it happens:** The sentinel `'off'` only has meaning to DocFlow — it means "user explicitly opted out of reasoning". LiteLLM doesn't know the sentinel.
**How to avoid:** At the streamLiteLLM serialization layer, translate `'off'` → omit field. Only `'low'`/`'medium'`/`'high'` ever reach the wire.
**Warning signs:** Oracle for VER-02 ("change to Opus with thinking max") works, but toggling back to `'off'` shows reasoning still happening in response metadata.

### Pitfall 3: `thinking_budget > max_tokens` rejected by provider mid-stream
**What goes wrong:** Per Anthropic's extended-thinking docs, `thinking.budget_tokens` MUST be less than `max_tokens`. If you persist `thinking_budget=32000` with `max_tokens=NULL` (default 2048 from the hardcoded catbot fallback), LiteLLM either errors out or returns degraded response.
**Why it happens:** PATCH validator only checks `thinking_budget <= max_tokens` when BOTH are explicitly set. If user only sets thinking_budget, `max_tokens=NULL`, and the runtime falls back to hardcoded 2048, the invariant breaks at runtime.
**How to avoid:** When resolving `max_tokens` in the catbot route, apply the invariant check at runtime too — or reject `thinking_budget` in PATCH unless `max_tokens` is also set explicitly. Recommendation: the simplest approach is **PATCH-time**: "if `thinking_budget` is set, `max_tokens` must also be set to a value >= thinking_budget". Add as a validator branch.
**Warning signs:** VER-03 oracle: `reasoning_content` is null despite reasoning_effort=high, because the provider rejected `thinking.budget_tokens > max_tokens`.

### Pitfall 4: CHECK constraint error surface leaked as 500
**What goes wrong:** User submits `reasoning_effort: 'extreme'` via PATCH. The application validator doesn't have a regex to reject it; it hits SQLite's CHECK constraint, which throws `SQLITE_CONSTRAINT_CHECK`, which bubbles through `updateAlias` into the route's `catch (e)` block, which returns status 200 with `{ error: "SQLITE_CONSTRAINT..." }`. The oracle sees a 200 but gets a cryptic DB-layer error message.
**Why it happens:** Existing route.ts:29-32 catches ALL errors and returns 200 — that's the existing "graceful degradation" pattern (see Phase 158 tests for aliasRow). But CHECK violations should be 400 with a human-readable message.
**How to avoid:** Validate `reasoning_effort ∈ {'off','low','medium','high',null}` explicitly in the PATCH handler BEFORE hitting DB. Same for numeric ranges of `max_tokens` / `thinking_budget` (reject negative, non-integer).
**Warning signs:** Any PATCH test that expects 400 returns 200 with a DB-layer error message.

### Pitfall 5: Unused imports triggering Docker build failure
**What goes wrong:** You add `import { resolveAliasConfig }` to catbot/chat/route.ts but also leave `import { resolveAlias }` that is no longer referenced. ESLint `no-unused-vars` is set to `error` in Next.js `next build` — Docker build fails.
**Why it happens:** Habitual "leave import until fully migrated" pattern.
**How to avoid:** Per `MEMORY.md feedback_unused_imports_build.md` — strip imports as soon as the last caller is removed. Run `cd app && npm run lint` locally before commit.
**Warning signs:** `npm run build` in Docker fails with `error  'resolveAlias' is defined but never used`.

### Pitfall 6: Config fetched in wrong order for PATCH validation
**What goes wrong:** PATCH body includes `{alias:'catbot', model_key:'ollama/gemma3:4b', reasoning_effort:'high', max_tokens:32000}`. You validate `reasoning_effort` BEFORE reading the TARGET model's capabilities. Since the OLD model was `gemini-main` (reasoning-capable), the validation passes. The UPDATE runs. Now `catbot` alias has `reasoning_effort=high` on `gemma3:4b` (a local model that doesn't support reasoning).
**Why it happens:** Intuition says "validate current state". But PATCH changes state — you must validate the POST-update state.
**How to avoid:** Always read capabilities for the **new `model_key`** from the PATCH body, not the currently-stored row. If `model_key` is unchanged in PATCH, read from it anyway (idempotent).
**Warning signs:** VER-03 oracle receives a 200 from PATCH but CatBot's next LiteLLM call errors out.

## Code Examples

Verified patterns from official sources and existing DocFlow code:

### Example 1: Extended `AliasConfig` + `resolveAliasConfig` with same-tier fallback
```typescript
// app/src/lib/services/alias-routing.ts
// Source: extends existing resolveAlias() logic; same external calls.

export interface AliasConfig {
  model: string;
  reasoning_effort: 'off' | 'low' | 'medium' | 'high' | null;
  max_tokens: number | null;
  thinking_budget: number | null;
}

// New row shape — add the three Phase 158 columns.
export interface AliasRowV30 extends AliasRow {
  reasoning_effort: 'off' | 'low' | 'medium' | 'high' | null;
  max_tokens: number | null;
  thinking_budget: number | null;
}

export async function resolveAliasConfig(alias: string): Promise<AliasConfig> {
  const start = Date.now();
  const row = db.prepare(
    'SELECT * FROM model_aliases WHERE alias = ? AND is_active = 1'
  ).get(alias) as AliasRowV30 | undefined;

  // Fallback config — used when row absent or model unavailable.
  const fallbackCfg = (model: string): AliasConfig => ({
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

  // (Existing Discovery availability check — unchanged)
  const inventory = await getInventory();
  const availableIds = new Set(inventory.models.map((m: { id: string }) => m.id));

  if (availableIds.has(configuredModel) || availableIds.has(`litellm/${configuredModel}`)) {
    logResolution(alias, configuredModel, configuredModel, false, undefined, Date.now() - start);
    return fallbackCfg(configuredModel);
  }

  // (Existing same-tier MID fallback — unchanged, except returns fallbackCfg(alt))
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
        // NOTE: When falling back to a different model, reasoning config may be
        // invalid (e.g. fallback model doesn't support reasoning). Callers that
        // propagate to LiteLLM MUST check the resolved model's capabilities again
        // before sending — OR the validator at PATCH time must have prevented
        // configs that are globally unsafe. Current recommendation: PATCH validates
        // against ORIGINAL model only; runtime lets LiteLLM reject if fallback is
        // incompatible (degraded fallback is acceptable — reasoning disappears
        // silently but chat still works).
        return fallbackCfg(alt);
      }
    }
  }

  // (Existing env fallback — unchanged)
  const envKey = alias === 'embed' ? 'EMBEDDING_MODEL' : 'CHAT_MODEL';
  const envModel = process['env'][envKey] || '';
  if (envModel) {
    logResolution(alias, configuredModel, envModel, true, 'env_fallback', Date.now() - start);
    return fallbackCfg(envModel);
  }

  logResolution(alias, configuredModel, 'NONE', true, 'no_model_available', Date.now() - start);
  throw new Error(`No model available for alias "${alias}". Configured: "${configuredModel}" is down.`);
}

// Back-compat wrapper — 14+ existing callers keep working unchanged.
export async function resolveAlias(alias: string): Promise<string> {
  return (await resolveAliasConfig(alias)).model;
}
```

### Example 2: Extended `StreamOptions` and body spread
```typescript
// app/src/lib/services/stream-utils.ts — extended interface + body JSON
// Source: existing file lines 3-13, 50-57.

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
  // Phase 159 (v30.0): reasoning passthrough. Both optional, both omitted when absent/'off'.
  reasoning_effort?: 'low' | 'medium' | 'high' | 'off';  // 'off' === omit
  thinking?: { type: 'enabled'; budget_tokens: number };
}

// In the fetch body (line 50):
body: JSON.stringify({
  model: options.model,
  messages: options.messages,
  ...(options.max_tokens ? { max_tokens: options.max_tokens } : {}),
  ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
  // Phase 159: reasoning passthrough. 'off' is the DocFlow sentinel — omit from wire.
  ...(options.reasoning_effort && options.reasoning_effort !== 'off'
    ? { reasoning_effort: options.reasoning_effort }
    : {}),
  ...(options.thinking ? { thinking: options.thinking } : {}),
  stream: true,
  stream_options: { include_usage: true },
}),
```

### Example 3: PATCH validator (cross-table capability check)
```typescript
// app/src/app/api/alias-routing/route.ts — extended PATCH
// Source: existing file + Pattern 3 above.

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const alias = typeof body?.alias === 'string' ? body.alias.trim() : '';
    const model_key = typeof body?.model_key === 'string' ? body.model_key.trim() : '';

    if (!alias || !model_key) {
      return NextResponse.json({ error: 'Missing alias or model_key' }, { status: 400 });
    }

    // Phase 159 (v30.0): new optional fields.
    const reasoning_effort = body?.reasoning_effort ?? null;  // string | null
    const max_tokens = body?.max_tokens ?? null;              // number | null
    const thinking_budget = body?.thinking_budget ?? null;    // number | null

    // Type guards (defensive — CHECK constraint will catch invalid enum too).
    if (reasoning_effort !== null && !['off','low','medium','high'].includes(reasoning_effort)) {
      return NextResponse.json({
        error: `Invalid reasoning_effort: ${reasoning_effort} (must be one of off|low|medium|high|null)`
      }, { status: 400 });
    }
    if (max_tokens !== null && (typeof max_tokens !== 'number' || max_tokens <= 0 || !Number.isInteger(max_tokens))) {
      return NextResponse.json({ error: `max_tokens must be positive integer or null` }, { status: 400 });
    }
    if (thinking_budget !== null && (typeof thinking_budget !== 'number' || thinking_budget <= 0 || !Number.isInteger(thinking_budget))) {
      return NextResponse.json({ error: `thinking_budget must be positive integer or null` }, { status: 400 });
    }

    // Cross-table capability check on the NEW model_key.
    const cap = db.prepare(
      `SELECT supports_reasoning, max_tokens_cap FROM model_intelligence WHERE model_key = ?`
    ).get(model_key) as { supports_reasoning: number | null; max_tokens_cap: number | null } | undefined;

    if (reasoning_effort && reasoning_effort !== 'off' && cap && cap.supports_reasoning !== 1) {
      return NextResponse.json({
        error: `Model ${model_key} does not support reasoning (reasoning_effort must be 'off' or null)`
      }, { status: 400 });
    }
    if (typeof max_tokens === 'number' && cap?.max_tokens_cap && max_tokens > cap.max_tokens_cap) {
      return NextResponse.json({
        error: `max_tokens (${max_tokens}) exceeds model cap (${cap.max_tokens_cap})`
      }, { status: 400 });
    }
    if (typeof thinking_budget === 'number' && typeof max_tokens === 'number' && thinking_budget > max_tokens) {
      return NextResponse.json({
        error: `thinking_budget (${thinking_budget}) cannot exceed max_tokens (${max_tokens})`
      }, { status: 400 });
    }
    if (typeof thinking_budget === 'number' && max_tokens === null) {
      return NextResponse.json({
        error: `thinking_budget requires max_tokens to be set (cannot exceed implicit default)`
      }, { status: 400 });
    }

    // Persist — extend updateAlias() to accept the new fields, OR write inline here.
    // Recommendation: extend updateAlias() to (alias, model_key, opts?) — one public
    // surface, one service layer, one place for the updated_at timestamp bump.
    const updated = updateAliasWithConfig(alias, model_key, {
      reasoning_effort,
      max_tokens,
      thinking_budget,
    });
    return NextResponse.json({ updated });
  } catch (e) {
    logger.error('alias-routing', 'Error updating alias', { error: (e as Error).message });
    return NextResponse.json({ error: (e as Error).message }, { status: 200 });
  }
}
```

### Example 4: CatBot chat route — both paths migrated
```typescript
// app/src/app/api/catbot/chat/route.ts — migrate line 119 and line 199, 459

// Line 119 — resolve config instead of just model:
const cfg = await resolveAliasConfig('catbot');
const model = requestedModel || catbotConfig.model || cfg.model;
const reasoning_effort = cfg.reasoning_effort;  // string | null
const thinking = cfg.thinking_budget
  ? { type: 'enabled' as const, budget_tokens: cfg.thinking_budget }
  : undefined;
const max_tokens = cfg.max_tokens ?? 2048;  // preserve hardcoded fallback

// Line 199 (streaming) — pass params to streamLiteLLM:
await streamLiteLLM(
  {
    model,
    messages: llmMessages,
    max_tokens,                              // was hardcoded 2048, now alias-aware
    tools: tools.length > 0 ? tools : undefined,
    reasoning_effort: reasoning_effort || undefined,   // null → undefined to omit
    thinking,                                // undefined when thinking_budget null
  },
  { /* callbacks unchanged */ }
);

// Line 459 (non-streaming) — add same fields to the inline fetch body:
const llmResponse = await fetch(`${litellmUrl}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${litellmKey}` },
  body: JSON.stringify({
    model,
    messages: llmMessages,
    tools: tools.length > 0 ? tools : undefined,
    max_tokens,
    // Phase 159: passthrough reasoning (same serialization as streamLiteLLM).
    ...(reasoning_effort && reasoning_effort !== 'off' ? { reasoning_effort } : {}),
    ...(thinking ? { thinking } : {}),
  }),
});
```

## State of the Art — LiteLLM Reasoning Body Shape

| Provider | Client-side field | Translated to | Verified via |
|----------|-------------------|---------------|--------------|
| Anthropic (Claude Opus/Sonnet 4.6) | `reasoning_effort: "low"\|"medium"\|"high"` | `thinking: {type: "adaptive"}` (internal) | docs.litellm.ai/docs/providers/anthropic_effort (2026-04); as of Claude 4.6 GA, effort is no longer beta |
| Anthropic (Claude 3.7 Sonnet, older) | `thinking: {type: "enabled", budget_tokens: N}` | sent verbatim | docs.litellm.ai/docs/reasoning_content |
| OpenAI (gpt-5-mini, o-series) | `reasoning_effort: "low"\|"medium"\|"high"` | OpenAI native field | docs.litellm.ai/docs/reasoning_content |
| Google (Gemini 2.5 Pro/Flash) | `reasoning_effort: "low"\|"medium"\|"high"` | Vertex `thinking_config` (internal) | docs.litellm.ai/docs/reasoning_content |

**Both fields can coexist in a single request** per LiteLLM; `thinking.budget_tokens` takes precedence for Anthropic-native shape, while `reasoning_effort` is the portable cross-provider form.

**DocFlow recommendation per CONTEXT precedent:** Send `reasoning_effort` for all providers (cross-compatible). Send `thinking` only when `thinking_budget` is explicitly set (user wanted an exact token budget, not an effort level). Let LiteLLM handle the provider-specific mapping.

**Response shape** (read-only for Phase 159 — Phase 161 consumes):
- `choices[0].message.reasoning_content` — string (reasoning trace, if provider surfaced it)
- `choices[0].message.thinking_blocks` — array of `{type, thinking, signature}` (Anthropic only)
- `usage.reasoning_tokens` — int (OpenAI) / `usage.completion_tokens_details.reasoning_tokens` (provider-dependent)

**Deprecated/outdated:**
- `thinking: {type: "enabled", budget_tokens: N}` on **Claude Opus 4.6 / Sonnet 4.6** — deprecated per litellm docs 2026-04. Use `reasoning_effort` for adaptive thinking. Phase 158's `thinking_budget` column still has value for legacy/non-Anthropic paths and for provider-native `thinking_config`.

## Back-Compat Contract — resolveAlias() callers

15 call sites of `await resolveAlias(...)` (return type `Promise<string>`). Every one uses the returned value as a string — either assigned to a variable typed `string`, passed to another function expecting string (e.g. `litellm.resolveModel(model)`), or used in a conditional.

| File | Line(s) | Alias | Caller pattern | Migration risk |
|------|---------|-------|---------------|----------------|
| app/src/app/api/catbot/chat/route.ts | 119 | 'catbot' | `const model = requestedModel || catbotConfig.model || await resolveAlias('catbot')` | **MIGRATE — PASS-04 target**: change to `resolveAliasConfig` + pick `.model` |
| app/src/app/api/catbrains/[id]/chat/route.ts | 93 | 'chat-rag' | `const chatModel = catbrain.default_model || await resolveAlias('chat-rag')` | Keep shim — no reasoning for chat-rag in v30.0 |
| app/src/app/api/cat-paws/route.ts | 79 | 'agent-task' | `const model = body.model || await resolveAlias('agent-task')` | Keep shim |
| app/src/app/api/cat-paws/[id]/chat/route.ts | 481 | 'agent-task' | `const rawModel = paw.model || await resolveAlias('agent-task')` | Keep shim |
| app/src/app/api/catbrains/[id]/process/route.ts | 287, 568 | 'process-docs' | `… || await resolveAlias('process-docs')` | Keep shim |
| app/src/app/api/agents/generate/route.ts | 19 | 'generate-content' | `… || await resolveAlias('generate-content')` | Keep shim |
| app/src/app/api/workers/generate/route.ts | 16 | 'generate-content' | idem | Keep shim |
| app/src/app/api/skills/generate/route.ts | 16 | 'generate-content' | idem | Keep shim |
| app/src/app/api/testing/generate/route.ts | 101 | 'generate-content' | `model: await resolveAlias('generate-content')` | Keep shim |
| app/src/lib/services/execute-catbrain.ts | 143 | 'chat-rag' | `catbrain.default_model || await resolveAlias('chat-rag')` | Keep shim |
| app/src/lib/services/execute-catpaw.ts | 466 | 'agent-task' | `paw.model || await resolveAlias('agent-task')` | Keep shim |
| app/src/lib/services/task-executor.ts | 23, 500, 571 | 'agent-task' | chained through `litellm.resolveModel(...)` | Keep shim |
| app/src/lib/services/canvas-executor.ts | 157, 550, 1411, 1438, 1580 | 'canvas-agent' / 'canvas-format' | `(data.model as string) \|\| await resolveAlias(…)` | Keep shim |
| app/src/lib/services/catbot-tools.ts | 1568 | 'agent-task' | `const resolvedModel = (args.model as string) \|\| await resolveAlias('agent-task')` | Keep shim |
| app/src/lib/services/health.ts | 75 | multiple | `const resolved = await resolveAlias(row.alias)` (health dashboard) | Keep shim |
| app/src/lib/services/bundle-importer.ts | 145 | 'generate-content' | `(agent.model as string) \|\| await resolveAlias(...)` | Keep shim |
| **test mocks** | 7 files | — | `resolveAlias: vi.fn()` returning a string | Keep shim; no test changes needed |

**Conclusion:** Keeping `resolveAlias(alias): Promise<string>` unchanged means **zero edits** to 14 of 15 production call sites + 7 test mock files. Only `/api/catbot/chat/route.ts:119` migrates. This is the lowest-risk path to CFG-03 compliance.

## Open Questions

1. **Should `updateAlias()` gain a single-surface extended signature or a parallel `updateAliasWithConfig()`?**
   - What we know: Existing `updateAlias(alias, newModelKey)` is called from one place (the PATCH route). No other callers.
   - What's unclear: Whether tests mock this function (yes — `alias-routing/__tests__/route.test.ts:17`).
   - Recommendation: **Extend** `updateAlias(alias, newModelKey, opts?: {reasoning_effort?, max_tokens?, thinking_budget?})` — single public surface, backward-compatible (opts param is optional). Bump `updated_at` regardless. Update the one existing mock in the test to accept the optional third arg.

2. **Where do we enforce `thinking_budget <= max_tokens` at runtime (not just PATCH)?**
   - What we know: Validated at PATCH time. But alias can be updated independently of model change, and fallback model (same-tier MID) might have different max_tokens_cap.
   - What's unclear: Should the runtime catbot route re-validate before calling LiteLLM, or let the provider reject?
   - Recommendation: **Let the provider reject** — DocFlow validates at PATCH, documents the invariant, and degrades gracefully if fallback resolution produces an incompatible shape. Phase 161 VER-03 oracle explicitly tests reasoning_content — if provider rejects, oracle fails visibly, which is the desired feedback loop.

3. **Are capabilities cached, or read on every PATCH?**
   - What we know: `model_intelligence` has ~18 rows; a prepared statement reads one row in < 1ms; PATCH is rare (UI-driven).
   - Recommendation: **Read on every PATCH.** No caching needed — the source of truth is the DB, and PATCH is infrequent.

4. **Does the Telegram branch of catbot route need updating?**
   - What we know: Lines 115-117 show Telegram uses `sudo_active` directly. The resolveAlias call (line 119) is shared between web and Telegram.
   - Recommendation: **Yes**, by transitive inclusion — migrating line 119 covers both channels since both paths reach the same `streamLiteLLM` / `fetch` call sites below. No Telegram-specific code change required.

5. **Is there a v30.0 model-id namespace mismatch that blocks this phase?**
   - What we know: Per STATE.md "Known blockers flagged for Phase 159+": LiteLLM exposes short aliases (`gemini-main`, `claude-opus`) while `model_intelligence` uses FQNs (`anthropic/claude-opus-4-6`). Phase 158's `/api/models` returns all 12 items with `enriched=null` in production because of this mismatch.
   - What's unclear: Does Phase 159's PATCH validator need to handle this transparently?
   - Recommendation: **Yes** — capability lookup must query `model_intelligence` by `model_key` as the PATCH writes it (short alias). Options:
     - (a) Accept that `cap === undefined` in PATCH means "no capability data available" and allow any config through. Phase 160 or a tactical plan resolves the namespace before oracle VER-03.
     - (b) Add a resolver inside the validator (`lookupCapabilities(litellmId)` that probes both the short alias and FQN).
   - **Locked recommendation:** (a) — consistent with Phase 158's "null-enriched" fallback pattern. If `cap` row is missing, validation is skipped (log a warn). This is already the behavior for unknown model_keys.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | app/vitest.config.ts (existing) |
| Quick run command | `cd app && npm run test:unit -- src/lib/services/__tests__/alias-routing.test.ts` |
| Full suite command | `cd app && npm run test:unit` |
| Location | `__tests__/` directories adjacent to source (established pattern) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CFG-02 | PATCH validates `reasoning_effort` ∈ enum or null, else 400 | unit | `cd app && npm run test:unit -- src/app/api/alias-routing/__tests__/route.test.ts -t "reasoning_effort"` | EXTEND existing |
| CFG-02 | PATCH rejects `reasoning_effort=high` on model with `supports_reasoning=0` (cross-table check) | unit | `cd app && npm run test:unit -- src/app/api/alias-routing/__tests__/route.test.ts -t "capability conflict"` | EXTEND existing |
| CFG-02 | PATCH rejects `max_tokens > max_tokens_cap` | unit | `cd app && npm run test:unit -- src/app/api/alias-routing/__tests__/route.test.ts -t "max_tokens cap"` | EXTEND existing |
| CFG-02 | PATCH rejects `thinking_budget > max_tokens` (same request) and `thinking_budget` without `max_tokens` | unit | `cd app && npm run test:unit -- src/app/api/alias-routing/__tests__/route.test.ts -t "thinking_budget"` | EXTEND existing |
| CFG-02 | PATCH happy path — persists all three fields and returns updated row | unit | `cd app && npm run test:unit -- src/app/api/alias-routing/__tests__/route.test.ts -t "persists new fields"` | EXTEND existing |
| CFG-03 | `resolveAliasConfig('catbot')` returns `{model, reasoning_effort, max_tokens, thinking_budget}` from DB row | unit | `cd app && npm run test:unit -- src/lib/services/__tests__/alias-routing.test.ts -t "resolveAliasConfig"` | EXTEND existing |
| CFG-03 | `resolveAliasConfig` preserves NULL→null for all three config fields when columns absent from DB | unit | idem | EXTEND existing |
| CFG-03 | `resolveAlias()` (shim) still returns `Promise<string>` and all 14 untouched callers compile | static/unit | `cd app && npm run build` (type-check) + `cd app && npm run test:unit -- alias-routing` | EXTEND |
| CFG-03 | Fallback chain (Discovery/MID/env) returns config with fallback model AND row's reasoning config | unit | `cd app && npm run test:unit -- src/lib/services/__tests__/alias-routing.test.ts -t "fallback with config"` | EXTEND existing |
| PASS-01 | `streamLiteLLM` with `reasoning_effort: 'medium'` sends `reasoning_effort: "medium"` in body JSON | unit | `cd app && npm run test:unit -- src/lib/services/stream-utils.test.ts -t "reasoning_effort in body"` | EXTEND existing |
| PASS-01 | `streamLiteLLM` with `reasoning_effort: 'off'` OMITS the field from body JSON | unit | idem | EXTEND existing |
| PASS-02 | `streamLiteLLM` with `thinking: {type:'enabled', budget_tokens: 10000}` sends it verbatim in body | unit | `cd app && npm run test:unit -- src/lib/services/stream-utils.test.ts -t "thinking in body"` | EXTEND existing |
| PASS-02 | `streamLiteLLM` without `thinking` OMITS the field | unit | idem | EXTEND existing |
| PASS-03 | catbot route uses `cfg.max_tokens` when defined, falls back to 2048 when NULL | unit (route or integration) | `cd app && npm run test:unit -- src/app/api/catbot/chat/__tests__/…` | **Wave 0 gap — create** |
| PASS-04 | catbot route streaming path passes resolved reasoning params to `streamLiteLLM` (both call sites) | unit | idem | **Wave 0 gap — create** |
| PASS-04 | catbot route non-streaming path includes `reasoning_effort`/`thinking` in inline fetch body | unit | idem | **Wave 0 gap — create** |
| ALL | Manual oracle — CatBot oracle with `/gsd:verify-work` via CatBot chat (per CLAUDE.md protocol) | manual-oracle | "dame el alias catbot actual" + "cambia catbot a Opus con reasoning high" | Phase 160/161 scope — NOT blocking Phase 159 DoD |

### Sampling Rate
- **Per task commit:** `cd app && npm run test:unit -- src/lib/services/__tests__/alias-routing.test.ts src/lib/services/stream-utils.test.ts src/app/api/alias-routing/__tests__/route.test.ts` (3 test files, < 5s)
- **Per wave merge:** `cd app && npm run test:unit -- src/lib/services src/app/api/alias-routing src/app/api/catbot src/app/api/models` (domain slice, < 15s)
- **Phase gate:** `cd app && npm run lint && npm run build && npm run test:unit` — full suite green before `/gsd:verify-work`; then smoke via `docker compose build --no-cache && docker compose up -d` + manual curl against `/api/alias-routing` PATCH validating a 400 error and a 200 success.

### Wave 0 Gaps
- [ ] `app/src/app/api/catbot/chat/__tests__/route.test.ts` — covers PASS-03 + PASS-04 (streaming and non-streaming param propagation). **Does not currently exist.** Test mocks `streamLiteLLM`, `resolveAliasConfig`, `getToolsForLLM`, `db`; asserts that both call sites receive the expected shape.
- [ ] Existing `stream-utils.test.ts` — ADD 2 tests: `reasoning_effort` in body + `thinking` in body (covers PASS-01, PASS-02). File exists; extend it.
- [ ] Existing `alias-routing.test.ts` — ADD `describe('resolveAliasConfig')` block with 5+ tests (row → config, NULL → null, fallback carries config, shim returns only .model, embed alias unchanged). File exists; extend it.
- [ ] Existing `alias-routing/__tests__/route.test.ts` — ADD `describe('PATCH — Phase 159 fields')` block with 6+ tests (valid persistence, enum rejection, capability conflict, cap exceeded, thinking_budget > max_tokens, thinking_budget without max_tokens). File exists; extend it.
- [ ] Framework install: none needed (vitest 4.1.0 already in deps).
- [ ] Fixture: `makeMidRow({ model_key, supports_reasoning, max_tokens_cap })` helper — add to `app/src/app/api/alias-routing/__tests__/route.test.ts` or shared test util (inline is fine for 4 call sites).

## Sources

### Primary (HIGH confidence)
- **DocFlow source files (direct read, verified 2026-04-22):**
  - `app/src/lib/services/alias-routing.ts` — current 199 LOC, documents `resolveAlias(alias): Promise<string>`, MIGRATION CHECKLIST comment at lines 145-180 enumerates every caller.
  - `app/src/lib/services/stream-utils.ts` — lines 3-13 define `StreamOptions`; lines 50-57 the body JSON spread.
  - `app/src/app/api/alias-routing/route.ts` — current PATCH at lines 17-33, inline validator pattern.
  - `app/src/app/api/catbot/chat/route.ts` — line 119 resolveAlias call; line 199 streamLiteLLM call; line 459 non-streaming fetch.
  - `app/src/app/api/models/route.ts` — Phase 158's enriched shape, `loadIntelligenceMap` pattern.
  - `app/src/lib/db.ts:4833-4875` — Phase 158 schema + seed block.
  - `app/src/lib/services/__tests__/alias-routing.test.ts` — 150+ LOC reference for vi.mock pattern.
  - `app/src/app/api/alias-routing/__tests__/route.test.ts` — 121 LOC reference for PATCH test patterns.
  - `app/src/lib/services/stream-utils.test.ts` — 297 LOC reference for fetch-mock SSE body-assert pattern.
- **.planning/phases/158-*/158-01-PLAN.md + 158-02-PLAN.md** — verbatim Phase 158 context (columns, seed values, enriched shape).
- **.planning/REQUIREMENTS.md** — CFG-02, CFG-03, PASS-01..04 phrasing verbatim.
- **.planning/STATE.md** — "Known blockers flagged for Phase 159+" (model-id namespace mismatch).
- **docs.litellm.ai/docs/reasoning_content** (fetched 2026-04-22) — exact body shape for `reasoning_effort` + `thinking` + response fields.
- **docs.litellm.ai/docs/providers/anthropic_effort** — Anthropic-specific mapping, 2026-04 adaptive-thinking GA note.

### Secondary (MEDIUM confidence)
- WebSearch summary (Anthropic + LiteLLM passthrough, 2026): verified mapping of `reasoning_effort` → `output_config.effort` in LiteLLM (behaviour confirmed in DeepWiki entry on "Reasoning and Extended Thinking"). Used for the "deprecated budget_tokens on 4.6" caveat.

### Tertiary (LOW confidence)
- None. All Phase 159 claims trace back to either DocFlow source (direct read), Phase 158 plans (locked), or official LiteLLM docs (current).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed; no new selection required.
- Architecture (parallel-function, PATCH validator, StreamOptions extension): HIGH — verified via direct source read; patterns are already used in the codebase.
- LiteLLM body shape (`reasoning_effort`, `thinking`): HIGH — confirmed via official LiteLLM docs (2026-04).
- Back-compat contract (15 callers): HIGH — exhaustive grep run + manual inspection of each call site.
- Pitfalls: HIGH — 5/6 derived from file-specific evidence (line numbers cited); pitfall #3 (thinking_budget > max_tokens) is cross-referenced against Anthropic docs.
- Validation Architecture: HIGH — test patterns verified in existing files; Wave 0 gap list reflects real missing coverage.

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (30 days — LiteLLM reasoning API has shifted once in the last 6 months; re-verify body shape if planning slips past the validity window).
