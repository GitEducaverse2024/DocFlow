# Phase 160: CatBot Self-Service Tools + Skill KB — Research

**Researched:** 2026-04-22
**Domain:** CatBot tool-calling registry + sudo gate + KB-backed skills (DocFlow v30.0)
**Confidence:** HIGH

## Summary

Phase 160 exposes to CatBot three tools (`list_llm_models`, `get_catbot_llm`, `set_catbot_llm`) and a KB skill ("Operador de Modelos") that jointly let it read and mutate its own alias config. Two of the three tools are always-allowed (pure read); `set_catbot_llm` is sudo-gated and re-validates capabilities client-side before calling `PATCH /api/alias-routing` (the heavy validation already lives in the route per Phase 159-03, so this tool is a thin authenticated client — not a reimplementation).

The infrastructure is already in place. Phase 158 added capability columns to `model_intelligence` (`supports_reasoning`, `max_tokens_cap`, `is_local`). Phase 159 shipped `resolveAliasConfig('catbot')` returning `{model, reasoning_effort, max_tokens, thinking_budget}` and the PATCH validator enforcing capabilities. Phase 160 is **wiring work**: register tool schemas in `TOOLS[]`, implement handlers in the `executeTool` switch, plug sudo gate into `/api/catbot/chat/route.ts` (same pattern as the existing `update_alias_routing` block at L333 / L603), and seed the new skill into the `skills` table with `category='system'` so `PromptAssembler` injects it unconditionally.

Three trap points that Claude's training would get wrong: (1) `catboard.json` **does not exist** — the prompt's mention of "catboard.json.skills" is outdated; skills live in the `skills` table in `docflow.db` and the KB file at `.docflow-kb/resources/skills/` is a sync'd projection (not the source). (2) `update_alias_routing` already exists and uses sudo — Phase 160 does NOT replace it; `set_catbot_llm` is the reasoning-aware successor and must coexist without double-dispatch. (3) The namespace-mismatch blocker flagged in STATE.md (LiteLLM returns shortcut ids like `claude-opus`; `model_intelligence.model_key` uses FQNs like `anthropic/claude-opus-4-6`) will cause `supports_reasoning=null` for most models during oracle — tool handlers must degrade gracefully (null = unknown, NOT false).

**Primary recommendation:** Register the three tools inline in `catbot-tools.ts::TOOLS[]` following the exact `get_model_landscape` / `update_alias_routing` pattern. Handler for `list_llm_models` delegates to the existing `GET /api/models` shape (Phase 158-02 enriched). `get_catbot_llm` calls `resolveAliasConfig('catbot')` + joins `model_intelligence` for capabilities. `set_catbot_llm` uses the existing sudo gate pattern at `route.ts:333`/`603` and issues an internal `fetch` call to `PATCH /api/alias-routing` with the extended body (so the server-side validator is the single source of truth). Skill seeded in `db.ts` bootstrap, category `'system'`, id `skill-system-modelos-operador-v1`, injected via `buildModelosProtocolSection()` in `catbot-prompt-assembler.ts` following the `buildCatPawProtocolSection()` pattern at line 748.

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for Phase 160. No `/gsd:discuss-phase` has been run.

### Locked Decisions

None declared for Phase 160 itself. Constraints that carry forward from the milestone:

- **v30.0 requirements (REQUIREMENTS.md § CatBot tools):**
  - TOOL-01: `list_llm_models` devuelve catálogo con capabilities y tier
  - TOOL-02: `get_catbot_llm` devuelve config actual del alias `catbot`
  - TOOL-03: `set_catbot_llm({model, reasoning_effort?, max_tokens?, thinking_budget?})` requiere sudo + valida capabilities
  - TOOL-04: Skill KB "Operador de Modelos" instruye recomendación tarea→modelo
- **Phase 158 schema (locked):** `model_intelligence.supports_reasoning` + `max_tokens_cap` + `is_local`; `model_aliases.reasoning_effort` + `max_tokens` + `thinking_budget`
- **Phase 159 contracts (locked):**
  - `resolveAliasConfig(alias)` signature: `Promise<{model, reasoning_effort, max_tokens, thinking_budget}>`
  - `PATCH /api/alias-routing` accepts extended body (+ 3 fields) and rejects capability conflicts with 400
  - `updateAlias(alias, model_key, opts?)` extended signature
- **CLAUDE.md — CatBot como Oráculo:** Every feature must be verifiable via CatBot. Phase 160 tools ARE the oracle surface for v30.0; Phase 161 runs the full E2E oracle (VER-01..03).
- **MEMORY.md — process.env:** Must use `process['env']['VAR']` (bracket notation) to bypass webpack inlining.
- **MEMORY.md — Docker:** `node:20-slim` base; rebuild after `execute-catpaw.ts` changes (not relevant here, but rebuild required after tool registration for Docker container).

### Claude's Discretion

Everything below is for the planner to decide (flagged with recommended defaults based on existing code patterns):

- **Tool schema fields.** `list_llm_models({tier?, reasoning?})` filters per ROADMAP — recommend also supporting `is_local?: boolean` for symmetry with `is_local` column. `tier?: string` matches existing `list_mid_models` filter (Elite/Pro/Libre). `reasoning?: boolean` filters by `supports_reasoning=1`.
- **`get_catbot_llm` return shape.** Minimum: `{alias: 'catbot', model, reasoning_effort, max_tokens, thinking_budget}`. Recommend enriching with `supports_reasoning` + `max_tokens_cap` of the resolved model (joined from `model_intelligence`) so CatBot can immediately reason about headroom without a second tool call.
- **`set_catbot_llm` dispatcher.** Two viable strategies:
  1. **Direct DB call** — reuses `updateAlias(alias, modelKey, opts)` + manual capability validation in the handler.
  2. **Internal HTTP fetch to PATCH `/api/alias-routing`** — single source of validation, mirrors how internal CatBot tools already call `baseUrl` for side effects.
  Recommendation: strategy 2 (internal fetch to PATCH). Same validator, same error shape, no duplication. Slight latency cost (~5ms local) is negligible.
- **Skill content.** ROADMAP prescribes: `tarea ligera → Gemma local`; `razonamiento → Opus + reasoning_effort=high`; `creativa larga → Gemini 2.5 Pro + thinking moderado`. Planner expands into full instructions following `arquitec-arquitecto-de-agentes.md` + `skill-system-catpaw-protocol-v1` style.
- **Sudo wiring.** Follow existing `update_alias_routing` pattern (L333/L603 of chat/route.ts): explicit `toolName === 'set_catbot_llm' && !sudoActive → SUDO_REQUIRED` branch. Alternative: add to `SUDO_TOOLS[]` in `catbot-sudo-tools.ts` so `isSudoTool()` catches it automatically. Recommend the explicit branch (consistent with `update_alias_routing`).
- **KB projection.** Whether the seed should call `syncResource('skill', 'create', row)` inline (matches Phase 153 hook pattern) OR rely on the next `kb-sync.cjs --db-source` run. Recommend inline `syncResource` for immediate KB availability (search_kb can surface it from first boot).
- **Tool visibility for allowed_actions.** The gate in `getToolsForLLM()` at L1352-L1401 filters by allowed_actions. `list_llm_models` + `get_catbot_llm` are pure reads → add to the `name.startsWith('list_') || name.startsWith('get_')` branch (they match automatically). `set_catbot_llm` needs `allowedActions.includes('manage_models') || !allowedActions.length` (mirror `update_alias_routing` at L1384).

### Deferred Ideas (OUT OF SCOPE)

Per REQUIREMENTS.md v30.0 "Out of Scope":

- CatBot changing models of OTHER aliases (chat-rag, canvas, etc.) — v30.0 only self-service for own alias.
- CatBot managing provider API keys — security; keys stay in Settings UI with browser sudo.
- Dynamic thinking budget per request — premature optimization.
- Cost forecast for thinking — v30.1 with 30 days of real data.
- Reasoning on local/Ollama — Gemma does not support reasoning natively.
- Persisting `reasoning_content` to DB — v30.1 if demand warrants.
- A/B testing between models — pattern not used elsewhere in DocFlow.

Additionally — explicitly NOT part of Phase 160:

- UI for `reasoning_effort`/`max_tokens`/`thinking_budget` in Enrutamiento tab — Phase 161 (UI-01..03).
- Oracle end-to-end verification against live LiteLLM — Phase 161 (VER-01..03). Phase 160 tests the tools via unit tests and manual curl, not against a real model.
- `resolveAliasConfig` return shape changes — Phase 159 locked; consume as-is.
- Extending `getInventory()` / Discovery — out of scope; tool handlers consume the existing `GET /api/models` enriched shape.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TOOL-01 | CatBot tool `list_llm_models` devuelve lista de modelos con capabilities y tier | §Architecture Patterns "Tool registration in TOOLS[]"; §Code Examples `list_llm_models` handler; §Standard Stack `/api/models` enriched shape |
| TOOL-02 | CatBot tool `get_catbot_llm` devuelve config actual del alias `catbot` | §Architecture Patterns "resolveAliasConfig consumer"; §Code Examples `get_catbot_llm` handler |
| TOOL-03 | CatBot tool `set_catbot_llm(...)` cambia config, requiere sudo, valida capabilities | §Architecture Patterns "sudo-gated tool pattern"; §Architecture Patterns "delegate to PATCH for validation"; §Common Pitfalls "double validation"; §Code Examples `set_catbot_llm` handler + sudo branch |
| TOOL-04 | Skill KB "Operador de Modelos" instruye recomendación tarea → modelo | §Architecture Patterns "system skill seed + PromptAssembler injection"; §Standard Stack skills table + KB sync; §Code Examples skill seed + buildModelosProtocolSection |
</phase_requirements>

## Standard Stack

### Core (already installed — Phase 160 uses existing infra)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | existing | Read `model_intelligence` + `model_aliases` + `skills` via prepared statements | Only DB driver in repo; consistent with all existing CatBot tool handlers |
| `next` | 14 (App Router) | No new routes — tools proxy to existing `GET /api/models` + `PATCH /api/alias-routing` | Existing framework |
| `vitest` | 4.1.0 | Unit tests with `vi.mock` for DB/services (see `catbot-tools-user-patterns.test.ts`) | Already configured; established test pattern for catbot-tools |

### Supporting (already present in the codebase)

| Library/Service | Purpose | When to Use in Phase 160 |
|-----------------|---------|--------------------------|
| `@/lib/services/alias-routing` → `resolveAliasConfig(alias)` | Get current catbot alias config | Handler of `get_catbot_llm` |
| `@/lib/services/alias-routing` → `getAllAliases()` | List active aliases | Unused by Phase 160 tools (catbot is the only self-service target in v30.0) |
| `@/lib/services/mid` → `getAll({status: 'active'})` | Read MID entries (tier, provider, capabilities JSON, best_use) | Handler of `list_llm_models` (JOIN with capabilities) |
| `@/lib/services/discovery` → `getInventory()` | Check real-time availability of a model at LiteLLM | Handler of `list_llm_models` to include `available: true|false` |
| `@/lib/services/catbot-tools` → `TOOLS[]`, `executeTool`, `getToolsForLLM` | Tool registry + dispatcher | Tool schema + handler + visibility gate |
| `@/lib/services/catbot-prompt-assembler` → `build(ctx)` | System prompt assembly | Inject "Operador de Modelos" skill section (P1) |
| `@/lib/services/catbot-user-profile` → `getSystemSkillInstructions(name)` | Fetch skill instructions by name from `skills` table WHERE category='system' | Injection helper |
| `@/lib/services/knowledge-sync` → `syncResource('skill', 'create', row, ctx)` | DB→KB one-way sync (Phase 153 hook pattern) | After seeding skill into DB, sync to `.docflow-kb/resources/skills/<slug>.md` |
| `@/lib/services/kb-index-cache` → `invalidateKbIndex()` | Invalidate `_index.json` cache so `search_kb` sees the new file | After `syncResource` |
| `@/lib/sudo` → `validateSudoSession(token)` | Session validation (web flow) | Already used by `/api/catbot/chat/route.ts`; no change here |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|-----------|-----------|----------|
| Register tools in `catbot-tools.ts::TOOLS[]` | Create a new `catbot-model-tools.ts` module | **Reject.** `catbot-tools.ts` is the canonical registry (4038 lines, all model-related tools live here already: `get_model_landscape`, `recommend_model_for_task`, `update_alias_routing`, `check_model_health`, `list_mid_models`, `update_mid_model`). Splitting adds indirection without gain. |
| `set_catbot_llm` → internal `fetch` to PATCH | Direct `updateAlias(...)` call + duplicate validation | **Reject.** Two sources of validation truth is the #1 pitfall (see §Common Pitfalls). PATCH is the single validator. |
| Add `set_catbot_llm` to `SUDO_TOOLS[]` | Explicit branch in chat route (like `update_alias_routing`) | **Recommend explicit branch.** Tracks exactly how `update_alias_routing` works today — cohesive with the sibling tool. `SUDO_TOOLS[]` is for host-agent tools (bash, file ops, services). |
| Skill stored in DB `skills` table | Skill stored ONLY in KB markdown | **Reject.** PromptAssembler's `buildCatPawProtocolSection()` reads from DB via `getSystemSkillInstructions(name)` — DB is the SOT per §5.3 PRD KB, file is the sync'd projection. Seed MUST go through DB. |
| Sync skill via `kb-sync.cjs --db-source` post-deploy | Inline `syncResource` at bootstrap seed | **Recommend inline sync.** `kb-sync.cjs` requires manual invocation; inline matches Phase 153 KB-19/KB-20 hook pattern (seed → DB → syncResource → KB file written atomically). |

**Installation:** None. All dependencies present.

## Architecture Patterns

### Recommended File Structure (existing files extended, no new modules)

```
app/src/
├── lib/
│   ├── db.ts                                       # [+] Skill seed block (category='system')
│   └── services/
│       ├── catbot-tools.ts                         # [+] 3 tool schemas in TOOLS[]; 3 switch cases in executeTool; 3 visibility rules in getToolsForLLM
│       └── catbot-prompt-assembler.ts              # [+] buildModelosProtocolSection() + P1 registration in build()
├── app/api/catbot/chat/
│   └── route.ts                                    # [+] sudo branch for 'set_catbot_llm' at L333 + L603 (mirrors 'update_alias_routing')
└── lib/__tests__/
    └── catbot-tools-model-self-service.test.ts     # [NEW] unit tests for 3 tools + sudo gate (Wave 0)
```

### Pattern 1: Tool Registration in `TOOLS[]`

**What:** All CatBot-exposed tools are defined as `{type: 'function', function: {name, description, parameters}}` objects in the `TOOLS: CatBotTool[]` array. The dispatcher in `executeTool(name, args, baseUrl, context)` routes by `name` via a giant `switch`.

**When to use:** Adding ANY user-facing CatBot tool. Phase 160's 3 tools go here.

**Example (verbatim from `catbot-tools.ts:818`):**
```typescript
{
  type: 'function',
  function: {
    name: 'update_alias_routing',
    description: 'Cambia el modelo asignado a un alias de routing. REQUIERE MODO SUDO ACTIVO. Siempre confirma con el usuario antes de ejecutar este cambio.',
    parameters: {
      type: 'object',
      properties: {
        alias: { type: 'string', description: '...' },
        new_model: { type: 'string', description: '...' },
      },
      required: ['alias', 'new_model'],
    },
  },
},
```

### Pattern 2: Always-Allowed vs Permission-Gated in `getToolsForLLM()`

**What:** `getToolsForLLM(allowedActions)` filters `TOOLS[]` by the admin-configured `allowed_actions` array stored in `settings.catbot_config`. Rules in `catbot-tools.ts:1352-1401`:
- `name.startsWith('list_') || name.startsWith('get_')` → always allowed (read-only convention).
- Mutating tools → gated behind specific action keys (`manage_models`, `manage_canvas`, etc.) OR visible when `allowedActions.length === 0` (admin didn't restrict).

**When to use:**
- `list_llm_models` → matches `name.startsWith('list_')` automatically. No rule needed.
- `get_catbot_llm` → matches `name.startsWith('get_')` automatically. No rule needed.
- `set_catbot_llm` → MUST add explicit rule: `if (name === 'set_catbot_llm' && (allowedActions.includes('manage_models') || !allowedActions.length)) return true;` (mirror L1384 for `update_alias_routing`).

### Pattern 3: Sudo Gate via Explicit Branch in Chat Route

**What:** For tools NOT in `SUDO_TOOLS[]` (host agent tools) but that still need sudo, the chat route uses an explicit branch per tool at two mirror points (streaming L333-L341, non-streaming L603-L615). This predates `SUDO_TOOLS[]` and is used for `update_alias_routing`:

**Example (verbatim from `route.ts:333-341` — streaming path):**
```typescript
} else if (toolName === 'update_alias_routing' && !sudoActive) {
  sudoRequired = true;
  const sudoResult = {
    error: 'SUDO_REQUIRED',
    message: 'Cambiar routing de modelos requiere autenticacion sudo. El usuario debe introducir su clave de seguridad.',
  };
  allToolResults.push({ name: toolName, args: toolArgs, result: sudoResult, sudo: true });
  send('tool_call_result', { id: tc.id, name: toolName, result: sudoResult });
  llmMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(sudoResult) });
}
```

**For Phase 160:** Add a parallel branch `toolName === 'set_catbot_llm' && !sudoActive` at both points, identical shape. Consider combining: `(toolName === 'update_alias_routing' || toolName === 'set_catbot_llm') && !sudoActive`.

### Pattern 4: `resolveAliasConfig` Consumer (for `get_catbot_llm`)

**What:** Phase 159 contract — `resolveAliasConfig(alias)` returns `{model, reasoning_effort, max_tokens, thinking_budget}` with full fallback semantics.

**Example:**
```typescript
// Handler for get_catbot_llm
const cfg = await resolveAliasConfig('catbot');
// Join with model_intelligence for capabilities (namespace mismatch = null is ok)
const capRow = db.prepare(
  'SELECT supports_reasoning, max_tokens_cap, is_local, tier FROM model_intelligence WHERE model_key = ?'
).get(cfg.model) as { supports_reasoning: number | null; max_tokens_cap: number | null; is_local: number | null; tier: string | null } | undefined;
return {
  name,
  result: {
    alias: 'catbot',
    model: cfg.model,
    reasoning_effort: cfg.reasoning_effort,
    max_tokens: cfg.max_tokens,
    thinking_budget: cfg.thinking_budget,
    capabilities: capRow ? {
      supports_reasoning: capRow.supports_reasoning === 1,
      max_tokens_cap: capRow.max_tokens_cap,
      is_local: capRow.is_local === 1,
      tier: capRow.tier,
    } : null,
  },
};
```

### Pattern 5: System Skill Seed + PromptAssembler Injection

**What:** System skills (`category='system'`) are seeded in `db.ts` bootstrap and injected into EVERY CatBot prompt by `catbot-prompt-assembler.ts`. Phase 137-03 established this pattern for `'Protocolo de creacion de CatPaw'`.

**Seed location:** `app/src/lib/db.ts` near L4411 (next to the existing `skill-system-catpaw-protocol-v1` block).

**Example seed (verbatim from `db.ts:4446-4461` — adapt for Operador de Modelos):**
```typescript
const MODELOS_SKILL_ID = 'skill-system-modelos-operador-v1';
const MODELOS_INSTRUCTIONS = `PROTOCOLO OPERADOR DE MODELOS...`;
const nowModelos = new Date().toISOString();
db.prepare(
  `INSERT OR IGNORE INTO skills
     (id, name, description, category, tags, instructions, output_template,
      example_input, example_output, constraints, source, version, author,
      is_featured, times_used, created_at, updated_at)
     VALUES (?, ?, ?, 'system', ?, ?, '', '', '', '', 'built-in', '1.0', 'DoCatFlow',
             1, 0, ?, ?)`
).run(
  MODELOS_SKILL_ID,
  'Operador de Modelos',
  'Protocolo de recomendación tarea→modelo. Instruye a CatBot sobre cuándo usar Gemma local, Opus+reasoning, o Gemini 2.5 Pro+thinking.',
  JSON.stringify(['system', 'models', 'routing', 'v30.0']),
  MODELOS_INSTRUCTIONS,
  nowModelos, nowModelos,
);
```

**Injection in PromptAssembler — new helper + build() registration:**
```typescript
function buildModelosProtocolSection(): string {
  try {
    const instructions = getSystemSkillInstructions('Operador de Modelos');
    if (!instructions) return '';
    return `## Protocolo Operador de Modelos (auto-servicio LLM)\n\n${instructions}`;
  } catch { return ''; }
}

// In build(ctx), P1 priority (near buildCatPawProtocolSection call at L867):
try {
  sections.push({ id: 'modelos_protocol', priority: 1, content: buildModelosProtocolSection() });
} catch { /* graceful */ }
```

**Optional: KB projection via `syncResource`** — the skill appears at `.docflow-kb/resources/skills/<short>-operador-de-modelos.md` after first bootstrap, so `search_kb({subtype:'skill', tags:['models']})` surfaces it.

### Pattern 6: Internal HTTP Dispatch to PATCH (for `set_catbot_llm`)

**What:** The tool delegates validation + persistence to `PATCH /api/alias-routing` (Phase 159-03 validator). CatBot tool handlers have access to `baseUrl` from the `executeTool(name, args, baseUrl, context)` signature — already used by other tools that need internal HTTP calls.

**Example:**
```typescript
case 'set_catbot_llm': {
  // Shape normalization
  const body: Record<string, unknown> = {
    alias: 'catbot',
    model_key: args.model as string,
  };
  if ('reasoning_effort' in args) body.reasoning_effort = args.reasoning_effort ?? null;
  if ('max_tokens' in args) body.max_tokens = args.max_tokens ?? null;
  if ('thinking_budget' in args) body.thinking_budget = args.thinking_budget ?? null;

  try {
    const res = await fetch(`${baseUrl}/api/alias-routing`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { name, result: { error: data.error || 'PATCH failed', status: res.status } };
    return {
      name,
      result: {
        success: true,
        alias: 'catbot',
        updated: data.updated,
        message: `Alias catbot actualizado a ${args.model}. Próximo mensaje usará la nueva config.`,
      },
    };
  } catch (e) {
    return { name, result: { error: (e as Error).message } };
  }
}
```

### Anti-Patterns to Avoid

- **Duplicating validation in `set_catbot_llm`.** Phase 159-03 spent real effort on the 400 validator (type guards → cross-field → cross-table capability). Duplicating the check in the tool handler creates two sources of truth that WILL drift. Let the PATCH route own it.
- **Adding `set_catbot_llm` to `SUDO_TOOLS[]`.** That array is for host-agent tools (`bash_execute`, `service_manage`, `file_operation`, `credential_manage`, `mcp_bridge`). Adding a pure-DB tool makes `executeSudoTool()` need a special case, and `settings.page.tsx` surfaces `SUDO_TOOLS[]` to the admin checkbox UI → user confusion. Use the explicit chat-route branch instead.
- **Reading `capabilities` TEXT JSON from `model_intelligence` for reasoning/tokens.** Phase 158-01 CONTEXT explicitly put `supports_reasoning` + `max_tokens_cap` in SEPARATE columns precisely to avoid this. Query the columns directly.
- **Calling `resolveAlias('catbot')` (the string shim) when you need config.** Phase 159 kept `resolveAlias` for back-compat with 14+ callers that only need the model string. For reasoning-aware Phase 160 tools, use `resolveAliasConfig`.
- **Writing the skill ONLY to the KB file.** The DB is SOT; the KB is projection. `PromptAssembler.buildCatPawProtocolSection()` reads from DB via `getSystemSkillInstructions`, not from disk. A KB-only skill would NOT be injected.
- **Assuming `/api/models` returns capabilities for every id.** Per STATE.md "namespace mismatch" blocker, many `enriched` fields are `null` in production (LiteLLM shortcut ids don't match model_intelligence FQN keys). Tool responses must distinguish `supports_reasoning: true | false | null` where null = "unknown, likely ok to pass off/null but don't reject".

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Validate `reasoning_effort` / `max_tokens` / `thinking_budget` against capabilities | Custom validator in tool handler | `PATCH /api/alias-routing` (Phase 159-03) | Single source of truth; 400 error shape already tested |
| Resolve alias → config | Manual SQL + env fallback + Discovery check | `resolveAliasConfig('catbot')` (Phase 159-01) | 260-line service with fallback chain (Discovery → same-tier MID → env); reuse is mandatory |
| List models with capabilities | Compose MID + intelligence + inventory | `GET /api/models` (Phase 158-02 enriched) | Already enriched with flat-root `supports_reasoning`/`max_tokens_cap`/`is_local`/`tier`/`cost_tier` fields |
| Sudo session check | Manual crypto + TTL check | `validateSudoSession(token)` (`lib/sudo.ts`) | Existing scrypt + in-memory session Map with TTL; Telegram flow passes `sudo_active: true` directly |
| Skill injection to prompt | Hard-code in `buildIdentitySection` | `skills` table + `buildXxxProtocolSection()` pattern (PromptAssembler) | Budget-aware section (P0/P1/P2/P3); invalidation-free via runtime DB read |
| KB file sync | Handwrite `.md` file | `syncResource('skill', 'create', row, ctx)` (`knowledge-sync.ts`) | 1464-line service handling frontmatter schema + semver + soft-delete + slug generation |
| KB index invalidation | Rebuild `_index.json` | `invalidateKbIndex()` (`kb-index-cache.ts`) | Single function call; Phase 153 pattern |
| Tool registration + dispatch | New router | Extend `TOOLS[]` + switch in `executeTool` | 73 existing tools follow the same pattern; consistency matters |
| Intercept telegram sudo | Separate flow | `sudo_active: boolean` body param (INT-02) | Route already honors this (route.ts:116) |

**Key insight:** Phase 160 is a thin CatBot-facing façade over infrastructure built in Phases 158 + 159. Every "custom solution" attempt duplicates code that already exists and was tested last week. The entire phase is ~200 LOC of wiring + ~80 lines of skill instructions + unit tests.

## Common Pitfalls

### Pitfall 1: Double Validation (Tool + PATCH)
**What goes wrong:** `set_catbot_llm` handler validates capabilities, THEN PATCH validates again. Both can return 400 with different error messages. If tool validation tightens (e.g., extra check) and PATCH stays lax, a future Phase 161 UI using PATCH directly behaves differently than CatBot.
**Why it happens:** Developer assumes "belt and suspenders" is safer. In practice, belt ≠ suspenders when they have different sensors.
**How to avoid:** Tool handler does ONLY shape normalization (null handling for optional fields, type coercion if needed). All domain validation happens in PATCH. Tool handler surfaces whatever error PATCH returns verbatim.
**Warning signs:** The tool handler contains the string `supports_reasoning` or `max_tokens_cap` (means it's running capability checks — bad). It should only contain `alias: 'catbot'` and spread of user args into body.

### Pitfall 2: `getAll()` from `mid.ts` Missing Phase 158 Columns
**What goes wrong:** `list_llm_models` handler calls `getAll({status: 'active'})` expecting capabilities, but `mid.ts::MidEntry` does NOT include `supports_reasoning` / `max_tokens_cap` / `is_local` (only existed pre-v30.0). Result: tool returns MID-tier data but not reasoning capabilities.
**Why it happens:** `mid.ts::parseRow` was written for v25.1 and doesn't know about Phase 158 columns.
**How to avoid:** Either (a) call `GET /api/models` internally and parse its enriched shape (recommended — has the JOIN built in); OR (b) extend `MidEntry` + `parseRow` to include Phase 158 columns (heavier, but benefits other callers too).
**Warning signs:** You're reading `mid.capabilities: string[]` (the free-text TEXT JSON column) instead of `supports_reasoning: boolean` — you're reading the wrong field. The Phase 158 columns are NOT inside `capabilities`.

### Pitfall 3: Namespace Mismatch Blindness
**What goes wrong:** Oracle test "¿qué modelos piensan?" runs. CatBot calls `list_llm_models`. Result: all 12 LiteLLM models have `supports_reasoning: null`. CatBot says "no modelos soportan reasoning", which is wrong.
**Why it happens:** LiteLLM returns ids like `claude-opus`, `gemini-main`, `gemma-local`. `model_intelligence.model_key` uses FQNs like `anthropic/claude-opus-4-6`, `google/gemini-2.5-pro`. The JOIN on `model_key = id` fails silently → `null`.
**How to avoid:**
1. The tool response must distinguish `null` (unknown) from `false` (known false). In the response shape: `supports_reasoning: true | false | null`.
2. The skill text ("Operador de Modelos") must explicitly tell CatBot how to handle `null` — treat as "probablemente capaz, verifica con el usuario si duda".
3. Document as a known limitation in a `### Known Issues` section of the tool response metadata, OR in the skill instructions.
4. **Does NOT block Phase 160.** STATE.md flagged this for tactical fix before 161 oracle. Phase 160 must ship functional tools; the oracle is Phase 161.

**Warning signs:** Tool response schema shows `supports_reasoning: boolean` (forces false when unknown). Skill instructions say "si no soporta reasoning, no le pases reasoning_effort" without acknowledging unknown case.

### Pitfall 4: Seed Runs But Skill Doesn't Appear
**What goes wrong:** Planner writes the `INSERT OR IGNORE` seed. Deploys. Checks `search_kb`. Skill not there. Spends 30 min debugging.
**Why it happens:** (a) Forgot to call `syncResource` — DB has the row, KB file doesn't exist. (b) Called `syncResource` but forgot to `invalidateKbIndex()` — file exists, but `_index.json` cached. (c) Seed ran at bootstrap but skill row already existed with different content (INSERT OR IGNORE is a no-op) — old row stays.
**How to avoid:**
1. Seed block writes to DB + calls `syncResource('skill', 'create', row, ctx)` + calls `invalidateKbIndex()` in sequence.
2. Use a content-hash check before `INSERT OR IGNORE` — if row exists but `instructions` differs from canonical, UPDATE. (Phase 137-03 uses plain `INSERT OR IGNORE`; that's fine for initial deploy but revisits need UPDATE.)
3. Add a Vitest that asserts after `seedSkills()`: `db.prepare('SELECT instructions FROM skills WHERE id=?').get(MODELOS_SKILL_ID)` contains an expected substring.

**Warning signs:** Bootstrap logs show skill seed success but `search_kb({subtype:'skill', search:'Operador'})` returns 0 results on first boot.

### Pitfall 5: Sudo Branch Placed in Wrong Location
**What goes wrong:** Developer adds `toolName === 'set_catbot_llm' && !sudoActive` branch ONLY in the streaming path (L333) because that's what they were reading. Non-streaming (L603, chat fallback for tests / telegram occasionally) bypasses sudo.
**Why it happens:** Chat route has TWO mirror implementations (streaming SSE path + non-streaming fetch-and-wait path). Phase 159-04 RESEARCH flagged this as Pitfall.
**How to avoid:** Every time you add a sudo branch, grep for the twin occurrence: `grep -n "update_alias_routing" app/src/app/api/catbot/chat/route.ts` should return 2 lines (L333 + L603). Your new branch must also return 2 lines.
**Warning signs:** Non-streaming Vitest for `set_catbot_llm` passes because mock sudoActive=true, but a real non-stream call (curl without sudo) succeeds anyway.

### Pitfall 6: Missing `dynamic = 'force-dynamic'` on `/api/alias-routing`
**What goes wrong:** Tool runs `fetch(baseUrl + '/api/alias-routing', {method: 'PATCH'})`, but Next.js pre-rendered the route at build time because it doesn't accept params. Result: first call after deploy succeeds, subsequent calls fail with stale response.
**Why it happens:** MEMORY.md flagged — Next.js 14 prerendrs API routes as static unless they export `dynamic = 'force-dynamic'`.
**How to avoid:** **Already mitigated.** `/api/alias-routing/route.ts:1` exports `export const dynamic = 'force-dynamic';`. Don't revert.
**Warning signs:** Unreachable here — route file has the export. But verify post-deploy by calling `curl -X PATCH localhost:3500/api/alias-routing -d '{...}'` twice and checking both succeed identically.

### Pitfall 7: Skill KB File Uses `.md` with Wrong Frontmatter Schema
**What goes wrong:** You write a skill file by hand at `.docflow-kb/resources/skills/operador-modelos.md` with made-up frontmatter. `node scripts/validate-kb.cjs` rejects it (13 mandatory fields). `search_kb` doesn't find it (invalid schema → skipped during `_index.json` generation).
**Why it happens:** KB schema is strict per `_manual.md` §3.3 PRD — 13 required frontmatter fields. Hand-writing them is risky.
**How to avoid:** NEVER hand-write KB resource files. Use `syncResource('skill', 'create', row, ctx)` which generates valid frontmatter automatically. Let the DB row drive the KB.
**Warning signs:** The plan mentions "crear archivo `.md` en `.docflow-kb/resources/skills/`". Should be "seed DB skill row + call syncResource".

## Code Examples

Verified patterns from official sources (existing DocFlow code):

### Tool definition (add to `TOOLS[]` in `catbot-tools.ts`)

```typescript
// Source: pattern from catbot-tools.ts:817-829 (update_alias_routing)
{
  type: 'function',
  function: {
    name: 'list_llm_models',
    description: 'Lista modelos LLM disponibles con capabilities (supports_reasoning, max_tokens_cap, tier, is_local). Usa esto cuando el usuario pregunte qué modelos soporta su instalación, qué modelos piensan, o para planificar un cambio de routing.',
    parameters: {
      type: 'object',
      properties: {
        tier: { type: 'string', enum: ['Elite', 'Pro', 'Libre'], description: 'Filtrar por tier MID' },
        reasoning: { type: 'boolean', description: 'Filtrar solo modelos con supports_reasoning=true' },
        is_local: { type: 'boolean', description: 'Filtrar solo modelos locales (is_local=true)' },
      },
    },
  },
},
{
  type: 'function',
  function: {
    name: 'get_catbot_llm',
    description: 'Devuelve la configuración actual del alias de CatBot (modelo + reasoning_effort + max_tokens + thinking_budget + capabilities del modelo asignado). Usa esto cuando el usuario pregunte qué LLM usa CatBot o antes de sugerir un cambio.',
    parameters: { type: 'object', properties: {} },
  },
},
{
  type: 'function',
  function: {
    name: 'set_catbot_llm',
    description: 'Cambia la configuración LLM del alias CatBot. REQUIERE MODO SUDO ACTIVO. Campos: model (obligatorio), reasoning_effort (off|low|medium|high), max_tokens (≤max_tokens_cap del modelo), thinking_budget (≤max_tokens). SIEMPRE confirma con el usuario antes de ejecutar. Valida capabilities contra model_intelligence.',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model key del nuevo modelo (debe existir en model_intelligence + Discovery)' },
        reasoning_effort: { type: 'string', enum: ['off', 'low', 'medium', 'high'], description: 'Opcional. Nivel de razonamiento. Solo aceptado si el modelo tiene supports_reasoning=true (excepto "off" que siempre se acepta).' },
        max_tokens: { type: 'number', description: 'Opcional. Tokens máximos de respuesta. Debe ser ≤ max_tokens_cap del modelo.' },
        thinking_budget: { type: 'number', description: 'Opcional. Presupuesto de tokens de thinking (Anthropic-style). Requiere max_tokens explícito y thinking_budget ≤ max_tokens.' },
      },
      required: ['model'],
    },
  },
},
```

### Handler for `list_llm_models` (add to `executeTool` switch)

```typescript
// Source: pattern from catbot-tools.ts:3166 (get_model_landscape) + /api/models:loadIntelligenceMap()
case 'list_llm_models': {
  const tierFilter = args.tier as string | undefined;
  const reasoningFilter = args.reasoning as boolean | undefined;
  const isLocalFilter = args.is_local as boolean | undefined;

  try {
    const inventory = await getInventory();
    // Pull enriched rows directly from model_intelligence (avoid HTTP roundtrip to /api/models from in-process).
    const rows = db.prepare(
      `SELECT model_key, display_name, provider, tier, cost_tier,
              supports_reasoning, max_tokens_cap, is_local
       FROM model_intelligence
       WHERE status = 'active'`
    ).all() as Array<{
      model_key: string; display_name: string | null; provider: string | null;
      tier: string | null; cost_tier: string | null;
      supports_reasoning: number | null; max_tokens_cap: number | null; is_local: number | null;
    }>;

    const toBoolOrNull = (v: number | null) => (v === null || v === undefined) ? null : v === 1;

    let filtered = rows.map(r => ({
      model_key: r.model_key,
      display_name: r.display_name,
      provider: r.provider,
      tier: r.tier,
      cost_tier: r.cost_tier,
      supports_reasoning: toBoolOrNull(r.supports_reasoning),
      max_tokens_cap: r.max_tokens_cap,
      is_local: toBoolOrNull(r.is_local),
      available: isModelAvailable(r.model_key, inventory),
    }));

    if (tierFilter) filtered = filtered.filter(m => m.tier?.toLowerCase() === tierFilter.toLowerCase());
    if (reasoningFilter !== undefined) filtered = filtered.filter(m => m.supports_reasoning === reasoningFilter);
    if (isLocalFilter !== undefined) filtered = filtered.filter(m => m.is_local === isLocalFilter);

    return {
      name,
      result: {
        count: filtered.length,
        models: filtered,
        filters_applied: { tier: tierFilter ?? null, reasoning: reasoningFilter ?? null, is_local: isLocalFilter ?? null },
        note: 'supports_reasoning/max_tokens_cap/is_local = null significa que el modelo no está catalogado en model_intelligence (namespace mismatch con LiteLLM shortcut ids — degradación graceful).',
      },
    };
  } catch (err) {
    return { name, result: { error: (err as Error).message } };
  }
}
```

### Handler for `get_catbot_llm` (add to `executeTool` switch)

```typescript
// Source: pattern from alias-routing.ts::resolveAliasConfig (Phase 159-01)
case 'get_catbot_llm': {
  try {
    const cfg = await resolveAliasConfig('catbot');

    const capRow = db.prepare(
      `SELECT supports_reasoning, max_tokens_cap, is_local, tier, provider, display_name
       FROM model_intelligence WHERE model_key = ?`
    ).get(cfg.model) as {
      supports_reasoning: number | null; max_tokens_cap: number | null; is_local: number | null;
      tier: string | null; provider: string | null; display_name: string | null;
    } | undefined;

    const toBoolOrNull = (v: number | null | undefined) => (v === null || v === undefined) ? null : v === 1;

    return {
      name,
      result: {
        alias: 'catbot',
        model: cfg.model,
        display_name: capRow?.display_name ?? null,
        provider: capRow?.provider ?? null,
        reasoning_effort: cfg.reasoning_effort,  // 'off'|'low'|'medium'|'high'|null
        max_tokens: cfg.max_tokens,               // number|null
        thinking_budget: cfg.thinking_budget,     // number|null
        capabilities: capRow ? {
          supports_reasoning: toBoolOrNull(capRow.supports_reasoning),
          max_tokens_cap: capRow.max_tokens_cap,
          is_local: toBoolOrNull(capRow.is_local),
          tier: capRow.tier,
        } : null,
      },
    };
  } catch (err) {
    return { name, result: { error: (err as Error).message } };
  }
}
```

### Handler for `set_catbot_llm` (add to `executeTool` switch)

```typescript
// Source: pattern from catbot-tools.ts case 'update_alias_routing' (L3283) + delegation to PATCH /api/alias-routing
case 'set_catbot_llm': {
  const modelKey = args.model as string;
  if (!modelKey) return { name, result: { error: 'Se requiere "model"' } };

  // Build extended PATCH body — only include fields present in args
  // (so explicit null activates extended path per route.ts:40-43 hasOwnProperty gate).
  const body: Record<string, unknown> = {
    alias: 'catbot',
    model_key: modelKey,
  };
  if ('reasoning_effort' in args) body.reasoning_effort = args.reasoning_effort ?? null;
  if ('max_tokens' in args) body.max_tokens = args.max_tokens ?? null;
  if ('thinking_budget' in args) body.thinking_budget = args.thinking_budget ?? null;

  try {
    const res = await fetch(`${baseUrl}/api/alias-routing`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      return {
        name,
        result: { error: data.error || `PATCH failed (${res.status})`, status: res.status },
      };
    }

    return {
      name,
      result: {
        success: true,
        alias: 'catbot',
        applied: {
          model: modelKey,
          reasoning_effort: body.reasoning_effort ?? 'unchanged',
          max_tokens: body.max_tokens ?? 'unchanged',
          thinking_budget: body.thinking_budget ?? 'unchanged',
        },
        message: `Alias catbot actualizado. Próximo mensaje en este chat usará la nueva config.`,
      },
    };
  } catch (err) {
    return { name, result: { error: (err as Error).message } };
  }
}
```

### Sudo gate branch in chat route (extend existing `update_alias_routing` branch)

```typescript
// Source: route.ts:333-341 (streaming) and route.ts:603-615 (non-streaming)
// Extend the predicate to include the new tool.

// BEFORE (L333):
} else if (toolName === 'update_alias_routing' && !sudoActive) {

// AFTER:
} else if ((toolName === 'update_alias_routing' || toolName === 'set_catbot_llm') && !sudoActive) {

// Same change at L603. No other modifications.
```

### Skill seed + KB sync (in `db.ts` bootstrap, after `skill-system-catpaw-protocol-v1` block)

```typescript
// Source: pattern from db.ts:4411-4462 (skill-system-catpaw-protocol-v1)
{
  const MODELOS_SKILL_ID = 'skill-system-modelos-operador-v1';
  const MODELOS_INSTRUCTIONS = `PROTOCOLO OPERADOR DE MODELOS (aplica cuando el usuario pregunte por modelos o quiera cambiar su LLM)

PROTOCOLO DE RECOMENDACION TAREA -> MODELO

1. TAREA LIGERA (clasificar, formatear, extraer, listar):
   RECOMENDAR: Gemma local (ollama/gemma3:12b o similar, is_local=true, sin coste)
   reasoning_effort: null
   max_tokens: 2048-4096
   JUSTIFICACION: sin coste API, suficiente para tareas mecanicas

2. RAZONAMIENTO PROFUNDO (analizar pipeline complejo, resolver problema encadenado, diagnostico multi-factor):
   RECOMENDAR: anthropic/claude-opus-4-6 (supports_reasoning=true, tier=Elite, max_tokens_cap=32000)
   reasoning_effort: high
   max_tokens: 8192-16384
   thinking_budget: 4096-16384
   JUSTIFICACION: reasoning nativo, mejor quality/capacidad de razonamiento

3. CREATIVA LARGA (redactar documento extenso, brainstorming, narrativa, creacion de contenido):
   RECOMENDAR: google/gemini-2.5-pro (supports_reasoning=true, tier=Elite, max_tokens_cap=65536)
   reasoning_effort: medium
   max_tokens: 16384-32768
   thinking_budget: 4096-8192 (moderado)
   JUSTIFICACION: thinking moderado evita overengineering en tareas creativas; 65K tokens para outputs largos

4. BALANCE CALIDAD-COSTE (chat diario, operaciones CRUD, preguntas de plataforma):
   RECOMENDAR: anthropic/claude-sonnet-4-6 o google/gemini-2.5-flash (tier=Pro)
   reasoning_effort: low o null
   max_tokens: 4096-8192
   JUSTIFICACION: default razonable para la mayoria de interacciones

PROTOCOLO DE EJECUCION (cuando el usuario pida un cambio):
PASO 1 - Llamar get_catbot_llm para ver config actual
PASO 2 - Llamar list_llm_models para ver opciones (con filtro adecuado si el usuario lo especifica)
PASO 3 - Proponer al usuario: "Te cambio a [modelo] con reasoning_effort=[X], max_tokens=[Y]. ¿Procedo?"
PASO 4 - Esperar confirmacion explicita
PASO 5 - Si no hay sudo activo, avisar: "Necesito modo sudo para ejecutar el cambio. Introduce tu clave en el chat."
PASO 6 - Llamar set_catbot_llm con los parametros propuestos
PASO 7 - Confirmar al usuario: "Listo. Tu proximo mensaje usara [modelo]."

REGLAS ABSOLUTAS:
- NUNCA llamar set_catbot_llm sin confirmacion explicita del usuario
- NUNCA proponer un modelo Elite para una tarea trivial (protocolo de proporcionalidad - CATBOT-07)
- NUNCA pasar reasoning_effort distinto de "off" o null si capabilities.supports_reasoning=false
- NUNCA pasar thinking_budget sin max_tokens explicito (la PATCH lo rechaza con 400)
- SI supports_reasoning=null (desconocido por namespace mismatch), preguntar al usuario antes de pasar reasoning_effort

LIMITACION CONOCIDA (Phase 160 scope):
Si list_llm_models devuelve supports_reasoning=null para muchos modelos, es por namespace mismatch entre LiteLLM shortcut ids y model_intelligence.model_key FQNs (ver STATE.md v30.0). El modelo puede soportar reasoning aunque la columna diga null. En caso de duda, preguntar al usuario o consultar check_model_health.`;

  const nowModelos = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO skills
       (id, name, description, category, tags, instructions, output_template,
        example_input, example_output, constraints, source, version, author,
        is_featured, times_used, created_at, updated_at)
       VALUES (?, ?, ?, 'system', ?, ?, '', '', '', '', 'built-in', '1.0', 'DoCatFlow',
               1, 0, ?, ?)`
  ).run(
    MODELOS_SKILL_ID,
    'Operador de Modelos',
    'Skill del sistema que protocoliza la recomendacion tarea->modelo y el flujo de cambio de LLM via tools list_llm_models/get_catbot_llm/set_catbot_llm.',
    JSON.stringify(['system', 'models', 'routing', 'reasoning', 'v30.0']),
    MODELOS_INSTRUCTIONS,
    nowModelos, nowModelos,
  );
}

// NOTE: syncResource call NOT made at bootstrap (db.ts is init, not async context).
// Alternative: add a scripts/kb-sync.cjs --db-source run to CI, OR expose seed via a one-shot API.
// Recommended pattern: include `await syncResource('skill', 'create', row, ctx)` in a post-init helper
// OR accept that first boot requires `node scripts/kb-sync.cjs --db-source` to generate the KB file.
// Phase 137-03 'skill-system-catpaw-protocol-v1' works without inline sync because kb-sync.cjs is run
// as part of release process. Follow the same pattern for Operador de Modelos.
```

### PromptAssembler injection (add helper + registration)

```typescript
// Source: pattern from catbot-prompt-assembler.ts:748-759 (buildCatPawProtocolSection)
function buildModelosProtocolSection(): string {
  try {
    const instructions = getSystemSkillInstructions('Operador de Modelos');
    if (!instructions) return '';
    return `## Protocolo obligatorio: Operador de Modelos (auto-servicio LLM de CatBot)
Cuando el usuario pregunte por modelos disponibles, solicite cambiar el LLM de CatBot,
o pida recomendacion de modelo para una tarea, aplica ESTE protocolo ANTES de llamar
a list_llm_models / get_catbot_llm / set_catbot_llm:

${instructions}`;
  } catch {
    return '';
  }
}

// Register in build(), near line 867 (where buildCatPawProtocolSection is pushed):
try {
  sections.push({ id: 'modelos_protocol', priority: 1, content: buildModelosProtocolSection() });
} catch { /* graceful */ }
```

### Visibility gate rule (in `getToolsForLLM`)

```typescript
// Source: catbot-tools.ts:1384 (update_alias_routing rule — mirror for set_catbot_llm)
// list_llm_models + get_catbot_llm auto-match via name.startsWith('list_') / name.startsWith('get_'),
// so no new rule needed for those. Only set_catbot_llm needs an explicit rule.

// Place near L1384 (existing manage_models rule):
if (name === 'set_catbot_llm' && (allowedActions.includes('manage_models') || !allowedActions.length)) return true;
```

### Wave 0 test file skeleton (`catbot-tools-model-self-service.test.ts`)

```typescript
// Source: mocking pattern from catbot-tools-user-patterns.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  const tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'catbot-model-tools-test-'));
  process['env']['CATBOT_DB_PATH'] = nodePath.join(tmpDir, 'catbot-test.db');
});

// Mock transitive deps
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const mockModelIntelligenceRows: Array<{
  model_key: string; display_name: string; provider: string; tier: string;
  cost_tier: string; supports_reasoning: number; max_tokens_cap: number; is_local: number;
  status: string;
}> = [
  { model_key: 'anthropic/claude-opus-4-6', display_name: 'Claude Opus 4.6', provider: 'anthropic',
    tier: 'Elite', cost_tier: 'premium', supports_reasoning: 1, max_tokens_cap: 32000, is_local: 0, status: 'active' },
  { model_key: 'ollama/gemma3:12b', display_name: 'Gemma 3 12B', provider: 'ollama',
    tier: 'Libre', cost_tier: 'free', supports_reasoning: 0, max_tokens_cap: 8192, is_local: 1, status: 'active' },
];

vi.mock('@/lib/db', () => ({
  default: {
    prepare: vi.fn((query: string) => ({
      all: vi.fn(() => query.includes('model_intelligence') ? mockModelIntelligenceRows : []),
      get: vi.fn((key?: string) => {
        if (query.includes('model_intelligence') && key) return mockModelIntelligenceRows.find(r => r.model_key === key);
        return undefined;
      }),
      run: vi.fn(() => ({ changes: 1 })),
    })),
  },
}));

vi.mock('@/lib/services/alias-routing', () => ({
  resolveAlias: vi.fn(),
  resolveAliasConfig: vi.fn().mockResolvedValue({
    model: 'anthropic/claude-opus-4-6',
    reasoning_effort: 'high',
    max_tokens: 16000,
    thinking_budget: 4096,
  }),
  getAllAliases: vi.fn(() => []),
  updateAlias: vi.fn(),
}));

vi.mock('@/lib/services/discovery', () => ({
  getInventory: vi.fn().mockResolvedValue({
    models: [
      { id: 'anthropic/claude-opus-4-6', name: 'opus', provider: 'anthropic', is_local: false },
      { id: 'ollama/gemma3:12b', name: 'gemma', provider: 'ollama', is_local: true },
    ],
    providers: [],
    cached_at: new Date().toISOString(),
    ttl_ms: 60000,
    is_stale: false,
  }),
}));

vi.mock('@/lib/services/mid', () => ({ getAll: vi.fn(() => []), update: vi.fn(), midToMarkdown: vi.fn(() => '') }));
vi.mock('@/lib/services/health', () => ({ checkHealth: vi.fn() }));
vi.mock('@/lib/services/catbot-holded-tools', () => ({ getHoldedTools: vi.fn(() => []), isHoldedTool: vi.fn(() => false) }));
vi.mock('@/lib/services/template-renderer', () => ({ renderTemplate: vi.fn() }));
vi.mock('@/lib/services/template-asset-resolver', () => ({ resolveAssetsForEmail: vi.fn() }));
vi.mock('@/lib/services/catbot-learned', () => ({ saveLearnedEntryWithStaging: vi.fn(() => ({ id: 'x' })), promoteIfReady: vi.fn() }));

// Mock fetch for set_catbot_llm's PATCH dispatch
const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

let executeTool: typeof import('@/lib/services/catbot-tools').executeTool;
let getToolsForLLM: typeof import('@/lib/services/catbot-tools').getToolsForLLM;

beforeAll(async () => {
  const tools = await import('@/lib/services/catbot-tools');
  executeTool = tools.executeTool;
  getToolsForLLM = tools.getToolsForLLM;
});

describe('TOOL-01: list_llm_models', () => {
  it('returns all active models with capabilities + availability', async () => {
    const r = await executeTool('list_llm_models', {}, 'http://localhost:3000');
    expect(r.name).toBe('list_llm_models');
    const result = r.result as { count: number; models: Array<{ model_key: string; supports_reasoning: boolean | null }> };
    expect(result.count).toBe(2);
    expect(result.models.find(m => m.model_key === 'anthropic/claude-opus-4-6')?.supports_reasoning).toBe(true);
    expect(result.models.find(m => m.model_key === 'ollama/gemma3:12b')?.supports_reasoning).toBe(false);
  });

  it('filters by tier', async () => {
    const r = await executeTool('list_llm_models', { tier: 'Elite' }, 'http://localhost:3000');
    const result = r.result as { count: number };
    expect(result.count).toBe(1);
  });

  it('filters by reasoning', async () => {
    const r = await executeTool('list_llm_models', { reasoning: true }, 'http://localhost:3000');
    const result = r.result as { count: number };
    expect(result.count).toBe(1);
  });
});

describe('TOOL-02: get_catbot_llm', () => {
  it('returns current catbot alias config + capabilities', async () => {
    const r = await executeTool('get_catbot_llm', {}, 'http://localhost:3000');
    const result = r.result as {
      alias: string; model: string; reasoning_effort: string; max_tokens: number; thinking_budget: number;
      capabilities: { supports_reasoning: boolean; max_tokens_cap: number } | null;
    };
    expect(result.alias).toBe('catbot');
    expect(result.model).toBe('anthropic/claude-opus-4-6');
    expect(result.reasoning_effort).toBe('high');
    expect(result.capabilities?.supports_reasoning).toBe(true);
    expect(result.capabilities?.max_tokens_cap).toBe(32000);
  });
});

describe('TOOL-03: set_catbot_llm', () => {
  it('delegates to PATCH /api/alias-routing with extended body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ updated: { alias: 'catbot', model_key: 'anthropic/claude-opus-4-6' } }),
    });
    const r = await executeTool('set_catbot_llm', {
      model: 'anthropic/claude-opus-4-6',
      reasoning_effort: 'high',
      max_tokens: 16000,
    }, 'http://localhost:3000');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/alias-routing');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body);
    expect(body.alias).toBe('catbot');
    expect(body.model_key).toBe('anthropic/claude-opus-4-6');
    expect(body.reasoning_effort).toBe('high');
    expect(body.max_tokens).toBe(16000);
    // thinking_budget NOT in args -> NOT in body (hasOwnProperty gate).
    expect('thinking_budget' in body).toBe(false);
  });

  it('surfaces 400 errors from PATCH validator verbatim', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Model X does not support reasoning' }),
    });
    const r = await executeTool('set_catbot_llm', {
      model: 'ollama/gemma3:12b',
      reasoning_effort: 'high',
    }, 'http://localhost:3000');
    const result = r.result as { error: string; status: number };
    expect(result.error).toContain('does not support reasoning');
    expect(result.status).toBe(400);
  });
});

describe('getToolsForLLM visibility', () => {
  it('list_llm_models + get_catbot_llm always visible (read pattern)', () => {
    const tools = getToolsForLLM(['some_unrelated_action']);
    const names = tools.map(t => t.function.name);
    expect(names).toContain('list_llm_models');
    expect(names).toContain('get_catbot_llm');
  });

  it('set_catbot_llm hidden without manage_models + hidden allowedActions non-empty', () => {
    const tools = getToolsForLLM(['some_other_action']);
    const names = tools.map(t => t.function.name);
    expect(names).not.toContain('set_catbot_llm');
  });

  it('set_catbot_llm visible with manage_models', () => {
    const tools = getToolsForLLM(['manage_models']);
    const names = tools.map(t => t.function.name);
    expect(names).toContain('set_catbot_llm');
  });

  it('set_catbot_llm visible when allowedActions empty (default)', () => {
    const tools = getToolsForLLM([]);
    const names = tools.map(t => t.function.name);
    expect(names).toContain('set_catbot_llm');
  });
});
```

### Chat route sudo gate test (extend existing `route.test.ts`)

```typescript
// Source: pattern from route.test.ts (already covers update_alias_routing sudo)
// Add parallel test case for set_catbot_llm SUDO_REQUIRED path.
it('set_catbot_llm without sudo returns SUDO_REQUIRED', async () => {
  // Arrange: mock LLM to emit a set_catbot_llm tool call
  // Assert: response.tool_calls[0].result = { error: 'SUDO_REQUIRED', message: '...' }
  // Assert: response.sudo_required = true
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `knowledge_tree.catboard.json` holds skills | `skills` table in SQLite + `.docflow-kb/resources/skills/` projection via `syncResource` | Phase 155 (2026-04-20 — v29.1) | Skill registration path changed; ROADMAP's "catboard.json.skills" mention is outdated terminology |
| `resolveAlias(alias): Promise<string>` single return | `resolveAliasConfig(alias): Promise<AliasConfig>` (reasoning-aware) + shim for back-compat | Phase 159-01 (2026-04-22) | Phase 160 tools consume the new function; 14+ legacy callers stay on shim |
| `model_intelligence` capabilities in JSON TEXT | Separate columns `supports_reasoning` / `max_tokens_cap` / `is_local` | Phase 158-01 (2026-04-21) | Tool handlers query columns directly (type-safe, indexable); no JSON parsing |
| `PATCH /api/alias-routing` ignores capabilities | Validates against `model_intelligence` + cross-field + graceful degradation | Phase 159-03 (2026-04-22) | `set_catbot_llm` delegates to PATCH; no duplicate validation needed |
| `update_alias_routing` tool only changes model | Phase 160 adds `set_catbot_llm` with reasoning/tokens/thinking | 2026-04-22 (this phase) | Two tools coexist; `update_alias_routing` remains for legacy alias operations on non-catbot aliases |

**Deprecated/outdated:**
- **`catboard.json`** — file does not exist; no code reference in `app/src` (only 2 comment mentions in test files explaining it was deleted in Phase 155).
- **`knowledge-tree.ts` module** — removed Phase 155.
- **`query_knowledge` / `explain_feature` CatBot tools** — removed Phase 155; replaced by `search_kb` + `get_kb_entry`.

## Open Questions

1. **Should `set_catbot_llm` auto-trigger `check_model_health` post-update?**
   - What we know: After a routing change, CatBot doesn't automatically verify the new model answers. User may change to Opus and get a silent failure if the API key lapsed.
   - What's unclear: Whether the protocol should mandate a post-update health check or leave it to the user's next message.
   - Recommendation: Out of scope for Phase 160 functional delivery. Mention as a "buenas prácticas" note in the skill instructions ("después de cambiar, sugiere al usuario probar con un mensaje de prueba O llamar check_model_health"). Implementing auto-invocation in the tool violates the single-responsibility pattern.

2. **How should `list_llm_models` handle models that exist in LiteLLM but NOT in `model_intelligence`?**
   - What we know: STATE.md documents the namespace mismatch (LiteLLM returns `claude-opus`; MID has `anthropic/claude-opus-4-6`). Current `/api/models` returns `null` for enriched fields in that case.
   - What's unclear: Whether `list_llm_models` should surface those orphan LiteLLM entries or hide them.
   - Recommendation: Surface them. Users may have custom LiteLLM models not in MID; hiding them is worse than null capabilities. The skill's "Operador de Modelos" instructions explicitly teach CatBot to handle `supports_reasoning: null` (ask the user if unsure). Phase 161 namespace-unification Plan (suggested in STATE.md) will fix the root cause.

3. **Do we need a `list_aliases` tool alongside `get_catbot_llm`?**
   - What we know: `get_catbot_llm` is scoped to alias `catbot`. REQUIREMENTS.md v30.0 Out of Scope says "CatBot cambia modelos de OTROS alias (chat-rag, canvas) — v30.0 solo self-service para el propio alias `catbot`".
   - What's unclear: Whether READ access to other alias configs should be exposed.
   - Recommendation: **No** — keep Phase 160 to the 3 tools named in ROADMAP/REQUIREMENTS. `get_model_landscape` (existing) already surfaces alias→model mapping for read-only inspection. Adding `list_aliases` in 160 creates scope creep.

4. **Should the skill instructions be invoked unconditionally (always P1) or only when user message keywords match (model/modelo/llm)?**
   - What we know: `buildCatPawProtocolSection()` is always P1 (injected unconditionally). It's short enough that the prompt budget isn't a concern.
   - What's unclear: Whether conditional injection saves enough tokens to matter.
   - Recommendation: **Unconditional P1**. The skill is ~1.2KB; prompt budgets are 16KB–64KB (see `getBudget()` at L68). Cost is negligible and the benefit is CatBot always knows the protocol without keyword-triggered latency.

5. **Where should the user-facing sudo hint for `set_catbot_llm` come from?**
   - What we know: Current `update_alias_routing` hardcodes `'Cambiar routing de modelos requiere autenticacion sudo...'` in route.ts:337.
   - What's unclear: Whether Phase 160 message should be distinct or shared.
   - Recommendation: Share the message string (same phrase works for both). Refactoring to centralize the message in a constant is out of scope — minor duplication acceptable.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | `app/vitest.config.ts` (existing) |
| Quick run command | `cd app && npm run test:unit -- src/lib/__tests__/catbot-tools-model-self-service.test.ts src/app/api/catbot/chat/__tests__/route.test.ts` |
| Full suite command | `cd app && npm run test:unit` |
| Estimated runtime | ~5s quick / ~30s full |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOOL-01 | `list_llm_models` returns models with capabilities (no filter) | unit | `cd app && npm run test:unit -- src/lib/__tests__/catbot-tools-model-self-service.test.ts -t "TOOL-01: list_llm_models"` | ❌ Wave 0 |
| TOOL-01 | `list_llm_models({tier:'Elite'})` filters | unit | `cd app && npm run test:unit -- src/lib/__tests__/catbot-tools-model-self-service.test.ts -t "filters by tier"` | ❌ Wave 0 |
| TOOL-01 | `list_llm_models({reasoning:true})` filters | unit | `cd app && npm run test:unit -- src/lib/__tests__/catbot-tools-model-self-service.test.ts -t "filters by reasoning"` | ❌ Wave 0 |
| TOOL-02 | `get_catbot_llm` returns alias+config+capabilities | unit | `cd app && npm run test:unit -- src/lib/__tests__/catbot-tools-model-self-service.test.ts -t "TOOL-02: get_catbot_llm"` | ❌ Wave 0 |
| TOOL-03 | `set_catbot_llm` issues PATCH with extended body | unit | `cd app && npm run test:unit -- src/lib/__tests__/catbot-tools-model-self-service.test.ts -t "delegates to PATCH"` | ❌ Wave 0 |
| TOOL-03 | `set_catbot_llm` surfaces 400 verbatim from PATCH | unit | `cd app && npm run test:unit -- src/lib/__tests__/catbot-tools-model-self-service.test.ts -t "surfaces 400 errors"` | ❌ Wave 0 |
| TOOL-03 | Sudo gate: `set_catbot_llm` without sudo returns `SUDO_REQUIRED` (streaming) | unit | `cd app && npm run test:unit -- src/app/api/catbot/chat/__tests__/route.test.ts -t "set_catbot_llm without sudo streaming"` | ✅ EXTEND |
| TOOL-03 | Sudo gate: `set_catbot_llm` without sudo returns `SUDO_REQUIRED` (non-streaming) | unit | `cd app && npm run test:unit -- src/app/api/catbot/chat/__tests__/route.test.ts -t "set_catbot_llm without sudo non-streaming"` | ✅ EXTEND |
| TOOL-03 | Visibility: `set_catbot_llm` gated behind `manage_models` in `getToolsForLLM` | unit | `cd app && npm run test:unit -- src/lib/__tests__/catbot-tools-model-self-service.test.ts -t "getToolsForLLM visibility"` | ❌ Wave 0 |
| TOOL-04 | Skill `Operador de Modelos` seeded with category='system' + instructions contain protocol | unit | `cd app && npm run test:unit -- src/lib/__tests__/db-seeds.test.ts -t "Operador de Modelos skill"` | ❌ Wave 0 |
| TOOL-04 | PromptAssembler injects `modelos_protocol` section at P1 | unit | `cd app && npm run test:unit -- src/lib/services/__tests__/catbot-prompt-assembler.test.ts -t "modelos_protocol injected"` | ⚠️ FILE EXISTS, EXTEND |

**Manual-only verifications (CatBot Oracle per CLAUDE.md):**

| Behavior | Requirement | Test Instructions |
|----------|-------------|-------------------|
| CatBot enumerates models with capabilities via `list_llm_models` | TOOL-01 | 1) `docker compose up -d`; 2) In CatBot chat (web): "qué modelos tengo disponibles y cuáles piensan?"; 3) Expect: CatBot calls `list_llm_models({reasoning: true})` and enumerates Opus/Sonnet/Gemini 2.5 Pro with `supports_reasoning=true`. **Paste the response as evidence per CLAUDE.md.** |
| CatBot reports current catbot alias config via `get_catbot_llm` | TOOL-02 | In CatBot chat: "qué modelo estás usando tú ahora mismo?"; Expect: calls `get_catbot_llm`, returns `alias=catbot` + current model + capabilities. **Paste response.** |
| CatBot changes its own LLM with sudo gate via `set_catbot_llm` | TOOL-03 | 1) No sudo active. "cámbiate a Opus con razonamiento alto"; Expect: `SUDO_REQUIRED` message + "introduce tu clave sudo". 2) Enter sudo password. Retry same ask. Expect: CatBot confirms "te cambio a X con reasoning_effort=high, ¿procedo?"; user says "sí"; CatBot calls `set_catbot_llm`; response includes `success: true`. 3) `curl -s localhost:3500/api/alias-routing \| jq '.aliases[] \| select(.alias=="catbot")'` — verify persistence. **Paste entire CatBot response + curl output.** |
| Skill "Operador de Modelos" visible in `search_kb` | TOOL-04 | In CatBot chat: "busca la skill del operador de modelos"; Expect: CatBot calls `search_kb({type:'resource', subtype:'skill', search:'Operador de Modelos'})`; returns the KB entry for `skill-system-modelos-operador-v1`. **Paste response.** |

### Sampling Rate

- **Per task commit:** `cd app && npm run test:unit -- src/lib/__tests__/catbot-tools-model-self-service.test.ts` (Wave 0 file, ~3s).
- **Per wave merge:** `cd app && npm run test:unit -- src/lib/__tests__ src/lib/services/__tests__ src/app/api/catbot` (~15s).
- **Phase gate:** `cd app && npm run lint && npm run build && npm run test:unit` all green; Docker rebuild + oracle manual verification in CatBot chat (4 oracles above).

### Wave 0 Gaps

- [ ] `app/src/lib/__tests__/catbot-tools-model-self-service.test.ts` — NEW file; covers TOOL-01, TOOL-02, TOOL-03 (handler behavior) and visibility gate. Mocks: `@/lib/db`, `alias-routing`, `discovery`, `mid`. ~300 lines based on pattern.
- [ ] `app/src/lib/__tests__/db-seeds.test.ts` — NEW file OR extend existing seed test; asserts `skill-system-modelos-operador-v1` row exists after bootstrap with category='system' and instructions match a known substring.
- [ ] `app/src/lib/services/__tests__/catbot-prompt-assembler.test.ts` — EXTEND existing (or create if absent). Asserts `build(ctx)` includes a `## Protocolo obligatorio: Operador de Modelos` header at P1 when the skill is seeded. Mock `getSystemSkillInstructions('Operador de Modelos')` to return a canned stub.
- [ ] `app/src/app/api/catbot/chat/__tests__/route.test.ts` — EXTEND existing. Add 2 test cases: `set_catbot_llm` without sudo emits `SUDO_REQUIRED` in both streaming and non-streaming paths.
- [ ] Framework install: **none needed** — vitest 4.1.0 already in `app/package.json`.

## Sources

### Primary (HIGH confidence — existing DocFlow code)

- `app/src/lib/services/catbot-tools.ts` (4038 lines) — Tool registry pattern (`TOOLS[]`, `executeTool` switch, `getToolsForLLM` gate). Specifically studied: L79 (TOOLS start), L788 (`get_model_landscape`), L818 (`update_alias_routing` — MODEL for TOOL-03 sudo branch), L1327 (`getTools`/`getToolsForLLM`), L1491 (`executeTool` signature with `baseUrl` + `context`), L3166 (handler pattern), L3283 (`update_alias_routing` handler MODEL).
- `app/src/lib/services/catbot-sudo-tools.ts` (826 lines) — `SUDO_TOOLS[]` + `isSudoTool()` + `executeSudoTool`. Reference for when NOT to use (set_catbot_llm is not a host agent tool).
- `app/src/lib/services/catbot-prompt-assembler.ts` (1000 lines) — Skill injection pattern. Specifically: L748 (`buildCatPawProtocolSection`), L867 (registration in `build()`), L402 (`buildModelIntelligenceSection` — existing inventory surface).
- `app/src/app/api/catbot/chat/route.ts` (762 lines) — Sudo gate implementation. Specifically: L11 (`resolveAliasConfig` import post-Phase 159), L119 (cfg derivation), L333-341 (streaming sudo branch for `update_alias_routing`), L603-615 (non-streaming twin).
- `app/src/lib/services/alias-routing.ts` (260 lines) — Phase 159 contracts. Specifically: L18 (`AliasConfig` interface), L72 (`updateAlias` extended), L125 (`resolveAlias` shim), L134 (`resolveAliasConfig`).
- `app/src/app/api/alias-routing/route.ts` (129 lines) — Phase 159-03 PATCH validator. Specifically: L22 (REASONING_ENUM), L40 (hasOwnProperty gate), L78 (cross-field thinking<=max_tokens), L95 (capability lookup), L105 (graceful degradation when cap null).
- `app/src/app/api/models/route.ts` (129 lines) — Phase 158-02 enriched shape. Specifically: L22 (ModelRow type), L44 (toBoolOrNull), L108 (flat-root shape).
- `app/src/lib/db.ts` L447-465 (skills table schema), L4411-4462 (`skill-system-catpaw-protocol-v1` seed — MODEL for TOOL-04), L4800-4847 (Phase 158 schema columns), L4848-4875 (Phase 158 seed UPDATEs).
- `app/src/lib/services/knowledge-sync.ts` (1464 lines) — `syncResource` function signature and behavior. Specifically: L1178 (syncResource entry point), L81 (kbFilePath for 'skill' subtype).
- `app/src/lib/services/kb-index-cache.ts` — `invalidateKbIndex`, `resolveKbEntry`, `searchKb`, `getKbEntry` exports.
- `app/src/lib/services/catbot-user-profile.ts` L246 (`getSystemSkillInstructions(name)` — existing injection helper).
- `app/src/lib/sudo.ts` (98 lines) — Sudo session mechanics (referenced but unchanged).
- `app/src/lib/__tests__/catbot-tools-user-patterns.test.ts` — Mocking pattern for catbot-tools tests (vi.hoisted for CATBOT_DB_PATH, vi.mock for all transitive deps).
- `app/src/app/api/catbot/chat/__tests__/route.test.ts` — Mocking pattern for the chat route (extends existing test for TOOL-03 sudo gate).
- `.docflow-kb/resources/skills/arquitec-arquitecto-de-agentes.md` — Skill frontmatter schema reference (13 required fields per `_manual.md` §3.3).
- `.docflow-kb/_manual.md` — KB structure + frontmatter schema + DB↔KB SOT rules.
- `.planning/phases/159-backend-passthrough-litellm-reasoning/159-RESEARCH.md` — Pattern reference for this RESEARCH.md structure.
- `.planning/phases/158-model-catalog-capabilities-alias-schema/158-CONTEXT.md` — Phase 158 decisions (locked constraints carried forward).
- `.planning/STATE.md` — Namespace mismatch blocker (Pitfall #3).
- `CLAUDE.md` — CatBot como Oráculo protocol (drives oracle test design).
- `MEMORY.md` — process['env'] bracket notation + Docker rebuild rule.

### Secondary (MEDIUM confidence)

None required — all Phase 160 technical decisions are derivable from existing DocFlow code + locked contracts from Phase 158/159. No external library docs consulted (LiteLLM passthrough validated in Phase 159 RESEARCH).

### Tertiary (LOW confidence)

None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All dependencies exist in the repo; no new installs; patterns exercised in 73+ existing tools.
- Architecture patterns: HIGH — Every pattern has a named source code location (line numbers provided).
- Common pitfalls: HIGH for Pitfalls 1–5 (directly observed in existing code); MEDIUM for Pitfall 3 (namespace mismatch documented in STATE.md but not yet seen in 160 tool output); HIGH for 6–7.
- KB skill projection: HIGH — Phase 153 hook pattern is established; Phase 137-03 catpaw protocol skill is the reference implementation.
- Sudo gate integration: HIGH — Exact code pattern exists in chat/route.ts for `update_alias_routing`; Phase 160 mirrors it.
- Test mocking strategy: HIGH — `catbot-tools-user-patterns.test.ts` and `route.test.ts` provide the two required mock templates.

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (30 days — stable infrastructure; only risk is if Phase 161 UI lands before 160 ships and preempts the tool contracts, which would require re-research).
