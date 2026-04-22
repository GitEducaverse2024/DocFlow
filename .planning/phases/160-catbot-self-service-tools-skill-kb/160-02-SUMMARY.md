---
phase: 160-catbot-self-service-tools-skill-kb
plan: 02
subsystem: catbot
tags: [catbot, llm-self-service, wave-1, tools, read-only, tdd-green]

requires:
  - phase: 158-model-catalog-capabilities-alias-schema
    provides: model_intelligence columns (supports_reasoning, max_tokens_cap, is_local, tier, cost_tier, provider, display_name, status)
  - phase: 159-backend-passthrough-litellm-reasoning
    provides: resolveAliasConfig('catbot') → {model, reasoning_effort, max_tokens, thinking_budget}
  - phase: 160-01-wave-0-test-scaffolds
    provides: 14 RED Vitest cases — 5 flipped GREEN by this plan (3 TOOL-01 + 1 TOOL-02 + 1 visibility "always visible")
provides:
  - list_llm_models (read-only, always-visible) — enumerates active models from model_intelligence joined with Discovery availability
  - get_catbot_llm (read-only, always-visible) — returns current catbot alias config + capabilities of assigned model
  - resolveAliasConfig consumer pattern — first call-site in catbot-tools.ts (next: Plan 03 set_catbot_llm)
affects: [160-03-set-catbot-llm, 160-04-operador-skill, 161-ui-enrutamiento-oracle]

tech-stack:
  added: []
  patterns:
    - "Read-only CatBot tool registration: TOOLS[] schema + executeTool switch case + zero extra visibility rules (startsWith('list_')/startsWith('get_') auto-allow)"
    - "Graceful degradation on namespace mismatch (Pitfall #3): capRow?.field ?? null + capabilities: capRow ? {...} : null — distinguishes 'unknown' from 'explicit false' so CatBot can phrase 'I don't have capability data for this LiteLLM shortcut id' vs 'this model does not support reasoning'"
    - "SQLite INTEGER → JSON boolean|null coercion via toBoolOrNull helper (mirrors Phase 158-02 /api/models enrichment pattern)"

key-files:
  created: []
  modified:
    - app/src/lib/services/catbot-tools.ts (+115 lines: 2 TOOLS[] entries + 2 executeTool switch cases + 1 import extension)

key-decisions:
  - "Placed list_llm_models + get_catbot_llm schemas IMMEDIATELY AFTER get_model_landscape (L798-L824 schema block) rather than grouped with update_alias_routing (write path) — cohesion by read-intent: all 3 LLM-catalog reads are neighbors, facilitating future changes"
  - "Handler cases follow the same ordering: list_llm_models (L3222) + get_catbot_llm (L3275) before recommend_model_for_task/update_alias_routing (writes). Plan 03's set_catbot_llm will slot after get_catbot_llm (L3312 approximately) to maintain read→write gradient"
  - "Reused the local isModelAvailable helper's semantics via new Set(inventory.models.map(m=>m.id)) in list_llm_models — the helper's prefix/colon logic is NOT needed here because model_intelligence.model_key already stores canonical keys that either match Discovery exactly (post-syncFromDiscovery) or don't at all. Using Set for O(1) lookup keeps the handler fast across 10+ models without calling isModelAvailable per row"
  - "Error handling: try/catch wrapping both handlers returns {error: message} on any throw — matches get_model_landscape/recommend_model_for_task pattern. Prevents a broken model_intelligence read or Discovery timeout from blowing up the tool_call and the whole chat turn"
  - "resolveAliasConfig import added to the existing alias-routing destructure (line 5) — preserving alphabetical-ish ordering with resolveAlias, getAllAliases, updateAlias. No new import line needed, minimizing diff"

requirements-completed: [TOOL-01, TOOL-02]

# Metrics
duration: ~3min
completed: 2026-04-22
---

# Phase 160 Plan 02: list_llm_models + get_catbot_llm Summary

**CatBot gains the LLM-introspection read surface: 2 always-visible tools (list + get current) registered with zero new files and zero new dependencies, flipping 5 RED tests GREEN (3 TOOL-01 filters/full + 1 TOOL-02 + 1 visibility-both).**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-22T10:48:20Z
- **Completed:** 2026-04-22T10:51:43Z
- **Tasks:** 2
- **Files modified:** 1 (catbot-tools.ts, +115 lines net)

## Accomplishments

- `list_llm_models` tool: enumerates all rows from `model_intelligence` WHERE status='active', joins Discovery inventory for `available` flag, supports optional filters `tier`/`reasoning`/`is_local` with `filters_applied` echo for CatBot self-narration
- `get_catbot_llm` tool: returns `{alias:'catbot', model, display_name, provider, reasoning_effort, max_tokens, thinking_budget, capabilities:{...}|null}` by calling `resolveAliasConfig('catbot')` (first call-site migration — other 14+ callers stay on `resolveAlias` string shim per Phase 159-01 Pitfall #1)
- Graceful degradation shape: `capabilities=null` when model_key absent from `model_intelligence`; list_llm_models returns `note` field explaining null semantics to CatBot
- Zero new visibility rules needed: both tools auto-allowed by `name.startsWith('list_')` / `name.startsWith('get_')` existing rules at L1358

## Task Commits

Each task was committed atomically:

1. **Task 1: Register list_llm_models in TOOLS[] and add handler case** — `c000914` (feat)
2. **Task 2: Register get_catbot_llm in TOOLS[] and add handler case (consumes resolveAliasConfig)** — `97983d8` (feat)

**Plan metadata:** pending (final commit after STATE/ROADMAP updates)

## Exact Line Ranges

### TOOLS[] Insertions (`app/src/lib/services/catbot-tools.ts`)

| Tool             | Schema lines | Anchor                                      |
| ---------------- | ------------ | ------------------------------------------- |
| `list_llm_models` | L798-L814    | IMMEDIATELY AFTER `get_model_landscape` (L785-L797) |
| `get_catbot_llm`  | L815-L822    | IMMEDIATELY AFTER `list_llm_models` (L798-L814)     |

### executeTool Switch Case Insertions

| Tool             | Case lines | Anchor                                      |
| ---------------- | ---------- | ------------------------------------------- |
| `list_llm_models` | L3222-L3273 | IMMEDIATELY AFTER `get_model_landscape` case (L3166-L3197) |
| `get_catbot_llm`  | L3275-L3311 | IMMEDIATELY AFTER `list_llm_models` case (L3222-L3273)     |

### Import Extensions

| Line | Before                                                              | After                                                                                  |
| ---- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| L5   | `import { resolveAlias, getAllAliases, updateAlias } from ...`       | `import { resolveAlias, resolveAliasConfig, getAllAliases, updateAlias } from ...`      |

No new import lines added (getInventory, db, logger already present).

## Tests RED → GREEN

All 5 transitions validated on `src/lib/__tests__/catbot-tools-model-self-service.test.ts`:

| Test                                                                      | Pre-plan | Post-plan |
| ------------------------------------------------------------------------- | -------- | --------- |
| TOOL-01: list_llm_models > returns all active models with capabilities + availability | RED      | GREEN     |
| TOOL-01: list_llm_models > filters by tier                                | RED      | GREEN     |
| TOOL-01: list_llm_models > filters by reasoning                           | RED      | GREEN     |
| TOOL-02: get_catbot_llm > returns current catbot alias config + capabilities | RED      | GREEN     |
| getToolsForLLM visibility > list_llm_models + get_catbot_llm always visible (read pattern) | RED      | GREEN     |

**Still RED (Plan 03/04 scope, intentional):**
- 2 TOOL-03 `set_catbot_llm` body/error-passthrough tests → Plan 03
- 2 set_catbot_llm visibility tests (`visible with manage_models`, `visible when allowedActions empty`) → Plan 03
- 2 set_catbot_llm chat-route sudo gate tests (streaming + non-streaming) → Plan 03
- 2 `Operador de Modelos skill` seed tests → Plan 04
- 1 PromptAssembler `modelos_protocol injected` test → Plan 04

## Lint / Build Status

- `npm run lint` clean on `catbot-tools.ts` (no errors, no warnings flagged)
- No TS errors — `resolveAliasConfig` import resolves successfully
- Regression baseline: 19 total failures in full suite (10 pre-existing unrelated + 9 remaining Phase 160 not in Plan 02 scope). Plan 01 baseline was 24. Delta: -5, matches GREEN count exactly.

## Decisions Made

- **Isolated Discovery lookup via Set**: In `list_llm_models` built `new Set(inventory.models.map(m => m.id))` and indexed by `availableSet.has(r.model_key)` rather than calling the local `isModelAvailable(modelKey, inventory)` helper per row. The helper's prefix/colon-split logic (lines 39-47) is for matching curated short MID keys against verbose Discovery ids (e.g. `anthropic/claude-sonnet-4` vs `...-20250514`). For Phase 160 the model_intelligence table stores either canonical FQNs that match Discovery exactly OR shortcut ids that won't match anything — the prefix magic is irrelevant. Set keeps the inner loop O(1) and the semantics explicit.

- **Error handling uniformity**: Both handlers wrap their work in try/catch that returns `{error: (err as Error).message}`. Matches the `get_model_landscape` / `recommend_model_for_task` pattern in the same switch. Prevents model_intelligence read failures or Discovery timeouts from crashing the tool_call turn.

- **No new imports beyond resolveAliasConfig**: `db`, `getInventory`, `logger` all already imported at the top of the file. The only diff to the import section is extending the existing `@/lib/services/alias-routing` destructure from 3 names to 4. Minimal surface area, maximum compatibility.

- **Schema parameter typing for filters**: Used `{ type: 'string', enum: ['Elite', 'Pro', 'Libre'] }` for the `tier` parameter instead of a free-form string because the model_intelligence table's `tier` column uses these exact three values. JSON Schema enum lets the LLM constrain its call and gives the user a discoverable API without documentation.

- **get_catbot_llm parameters schema `{ type: 'object', properties: {} }`**: Zero-arg tool. Not using `required: []` or `additionalProperties: false` — follows Phase 140's `get_my_profile` tool pattern (also zero-arg). LLM infers "no args" from the empty properties object.

## Deviations from Plan

None — plan executed exactly as written. Insertion points, exact shapes from RESEARCH.md Code Examples adopted verbatim. No auto-fixes (Rules 1-3) triggered; no architectural choices (Rule 4) needed.

## Issues Encountered

None. Pre-work by Plan 01 (RED tests with well-structured mocks + correct DATABASE_PATH hoist + SSE capture scaffolding) made this a straight "wire the handler" job. The only micro-decision was whether to use `isModelAvailable` helper vs a local Set — resolved by documenting the namespace reasoning in the decision log above.

## Plan 03 Notes (set_catbot_llm)

The `set_catbot_llm` registration must slot:

- **Schema**: IMMEDIATELY AFTER `get_catbot_llm` schema (L822) and BEFORE the `recommend_model_for_task` schema (currently L824+, will shift). Keeps LLM-config read→write gradient intact.
- **Switch case**: IMMEDIATELY AFTER `get_catbot_llm` case (L3311) and BEFORE `recommend_model_for_task` case. Same reasoning.
- **Visibility rule**: Add `if (name === 'set_catbot_llm' && (allowedActions.includes('manage_models') || !allowedActions.length)) return true;` at L1385 (adjacent to `update_alias_routing`). Plan 01 Wave 0 tests assume `manage_models` action key.
- **Sudo branch in chat route**: Plan 01 added the RED tests in `app/src/app/api/catbot/chat/__tests__/route.test.ts`. The route must check `toolName === 'set_catbot_llm' && !sudoActive` on BOTH streaming and non-streaming paths, emitting a `SUDO_REQUIRED` signal identically. Use the existing SSE-capture infrastructure (sseEvents array) to verify streaming; use `choices[0].message.tool_calls` for non-streaming.
- **Shape of outgoing PATCH body**: Plan 01's TOOL-03 delegation test expects `{alias, model_key, reasoning_effort, max_tokens}` only — `thinking_budget` must NOT be added when absent from args. Use `hasOwnProperty`-style gating (mirrors Phase 159-03's extended-body detection in `/api/alias-routing`).

## Self-Check: PASSED

**Files modified:**
- FOUND: /home/deskmath/docflow/app/src/lib/services/catbot-tools.ts (list_llm_models @ L801, get_catbot_llm @ L816, list_llm_models case @ L3222, get_catbot_llm case @ L3275, resolveAliasConfig import @ L5)

**Commits:**
- FOUND: c000914 (feat(160-02): register list_llm_models read-only self-service tool)
- FOUND: 97983d8 (feat(160-02): register get_catbot_llm read-only self-service tool)

**GREEN verification:**
- 3 TOOL-01 tests GREEN (`-t "TOOL-01: list_llm_models"` → 3/3 pass, 7 skipped)
- 1 TOOL-02 test GREEN (`-t "TOOL-02: get_catbot_llm"` → 1/1 pass, 9 skipped)
- Full Plan 01 file: 6 pass / 4 fail (remaining 4 = TOOL-03 + 2 set_catbot_llm visibility = Plan 03 scope)

**Regression verification:**
- Full `npm run test:unit` suite: 19 failed / 1129 passed
- Pre-existing baseline: 10 (task-scheduler × 5, alias-routing seedAliases × 3, catbot-holded-tools × 2)
- Phase 160 pending: 9 (4 TOOL-03 + 2 sudo gate + 2 skill seed + 1 modelos_protocol) — all in Plan 03/04 scope
- Delta from Plan 01 end (24 → 19): -5, matches 5 GREEN transitions exactly

## Next Phase Readiness

- **160-03 (set_catbot_llm sudo-gated + PATCH delegation)**: Implementer adds (a) TOOLS[] schema after `get_catbot_llm`, (b) executeTool case with fetch('/api/alias-routing', PATCH) that passes through 400 errors verbatim, (c) visibility rule at L1385 gated on `manage_models`, (d) chat route sudo branch emitting `SUDO_REQUIRED` on both transport paths. 6 RED tests ready.
- **160-04 (Operador de Modelos skill + PromptAssembler P1)**: Implementer adds (a) INSERT OR IGNORE skill row in db.ts bootstrap, (b) `modelos_protocol` P1 section in catbot-prompt-assembler.ts consuming `getSystemSkillInstructions('Operador de Modelos')`. 3 RED tests ready.
- **No blockers for Plan 03**: `set_catbot_llm` slotting point defined above. PATCH /api/alias-routing extended-body validator (Phase 159-03) handles capability validation server-side, so the tool handler only needs thin delegation.

---
*Phase: 160-catbot-self-service-tools-skill-kb*
*Completed: 2026-04-22*
