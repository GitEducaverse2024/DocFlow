---
phase: 158-model-catalog-capabilities-alias-schema
plan: 02
subsystem: api
tags: [api, nextjs, sqlite, model-intelligence, join, vitest, back-compat, ui-consumers]

# Dependency graph
requires:
  - phase: 158-01
    provides: model_intelligence capability columns (is_local, supports_reasoning, max_tokens_cap) that the API reads via SELECT
provides:
  - GET /api/models enriched shape { models: Array<{id, display_name, provider, tier, cost_tier, supports_reasoning, max_tokens_cap, is_local}> } flat-root
  - Boolean coercion layer (SQLite INTEGER 0/1 -> boolean/null) for supports_reasoning and is_local
  - Graceful-degradation fallback when model_intelligence query fails (null-enriched shape instead of 500)
  - Back-compat extraction pattern `items.map(m => m?.id ?? '').filter(Boolean)` wired into 4 UI consumers
  - Vitest coverage (10 tests, 3 describe blocks) for shape, back-compat, fallback
affects: [159-backend-passthrough, 160-catbot-tools, 161-ui-enrutamiento]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Flat-root response shape (no `capabilities: {...}` nesting) — locked by 158-CONTEXT.md for consumer simplicity
    - `toBoolOrNull` coercion helper — canonicalises SQLite INTEGER to JSON boolean/null
    - Graceful degradation via try/catch returning empty Map (fallback: all fields null) — keeps endpoint live during cold-start before 158-01 schema applied
    - vi.mock dynamic import pattern (lifted from alias-routing.test.ts) — ensures mocks applied before route module evaluation
    - UI consumer extraction pattern `items.map((m: { id?: string }) => m?.id ?? '').filter(Boolean)` — defensive against both old (string[]) and new (object[]) shapes

key-files:
  created:
    - app/src/app/api/models/__tests__/route.test.ts
  modified:
    - app/src/app/api/models/route.ts
    - app/src/app/agents/new/page.tsx
    - app/src/app/agents/[id]/page.tsx
    - app/src/app/tasks/new/page.tsx
    - app/src/components/catbrains/config-panel.tsx

key-decisions:
  - "Response shape flat root — NOT nested under capabilities: {...} — locked by 158-CONTEXT.md; consumers (UI + future CatBot tool) read fields directly"
  - "Enriched fields default to null (not omitted) when model_key is absent from model_intelligence — allows clients to distinguish 'unknown' from 'explicitly false'"
  - "Models present in model_intelligence but NOT in LiteLLM are intentionally dropped — the response list is driven by LiteLLM availability (preserves v8.0 behaviour)"
  - "logger source changed from 'api/models' to 'system' — pre-existing LogSource enum does not include 'api/models' and extending it was out of scope for this plan"
  - "tasks/new/page.tsx pre-existing bug (Array.isArray(mData) always false against object response) fixed inline (Rule 1) — the handler was being rewritten anyway and the current behaviour silently produced an empty availableModels list"
  - "Task 3 test file authored during Task 1 TDD RED phase (same consolidation pattern as 158-01) — the test file IS the canonical spec; splitting into a separate commit would have no independent review value"

patterns-established:
  - "Phase 158 UI consumer pattern: `items.map(m => m?.id ?? '').filter(Boolean)` — adopt verbatim in any new consumer of /api/models"
  - "Phase 158 API fallback pattern: try-catch around capability JOIN with warn-log and empty-Map fallback — any future enrichment JOIN should follow same pattern to avoid endpoint 500s during migrations"

requirements-completed: [CAT-03]

# Metrics
duration: ~7min
completed: 2026-04-21
---

# Phase 158 Plan 02: GET /api/models Enrichment Summary

**Turned `GET /api/models` from `{ models: string[] }` into a flat-root enriched shape `{ models: Array<{id, display_name, provider, tier, cost_tier, supports_reasoning, max_tokens_cap, is_local}> }` via a JOIN against `model_intelligence`, with 4 UI consumers migrated defensively and 10 Vitest tests covering shape + back-compat + fallback.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-21T15:21:15Z
- **Completed:** 2026-04-21T15:28:04Z
- **Tasks:** 3 (Task 3 test file consolidated with Task 1 per TDD RED discipline, same pattern as 158-01)
- **Files modified:** 5 (1 route + 4 UI consumers) + 1 test file created

## Accomplishments

- `/api/models` now surfaces capability metadata at the root level of each entry — Phase 159 `resolveAlias` return shape, Phase 160 `list_llm_models` CatBot tool, and Phase 161 conditional UI ("Inteligencia" dropdown only for `supports_reasoning=true` models) all unblocked.
- SQLite INTEGER columns coerced to JSON boolean/null so clients never see raw `0`/`1` for `supports_reasoning` or `is_local` — eliminates a latent type-mismatch bug for front-end consumers expecting strict booleans.
- Graceful-degradation path: if `model_intelligence` query fails at runtime (table missing, column missing, cold-start race), route still returns the LiteLLM id list with all enriched fields set to `null` and logs a `warn`. No 500s during v30.0 rollout.
- 4 UI consumers updated in a single atomic commit to extract `.id` from objects with a defensive map+filter pattern; `setAvailableModels`/`setModels` signatures unchanged (still `string[]`), so zero ripple-effect on downstream dropdown components.
- `source-list.tsx` needed zero changes — its existing `(data.models || []).map(m => m.id || m.model_name || '').filter(Boolean)` pattern is forward-compatible with the enriched shape.
- Vitest `route.test.ts` with 10 tests across 3 describe blocks exercises: flat-root field presence (5 tests), back-compat consumer patterns (3 tests), degraded fallback (2 tests).

## Task Commits

1. **Task 1 TDD RED: failing tests for enriched /api/models** — `49caf1d` (test)
2. **Task 1 TDD GREEN: enrich GET /api/models with model_intelligence JOIN** — `141af89` (feat)
3. **Task 2: update 4 UI consumers + inline fixes (Rules 1 and 3)** — `edde3a2` (feat)

**Plan metadata:** (this commit) `docs(158-02): complete api-models-enrichment plan`

_Task 3 test file (route.test.ts) was authored and committed during Task 1's TDD RED phase — Task 1 is `tdd="true"`, which requires failing tests first, and Task 3's spec is exactly that test file. Authoring once avoided an artificial commit split (same pattern documented in 158-01's consolidation deviation)._

## Files Created/Modified

- `app/src/app/api/models/__tests__/route.test.ts` — new Vitest file, 10 tests, mocks for `@/lib/db` (default export), `@/lib/services/litellm`, `@/lib/services/ollama`, `@/lib/logger`. Dynamic `await import('@/app/api/models/route')` inside each test (mock-hoist compatibility).
- `app/src/app/api/models/route.ts` — reshaped default branch: loads `model_intelligence` snapshot via `db.prepare(...).all()`, builds `Map<model_key, ModelRow>`, maps LiteLLM ids to enriched `ModelInfo`. `type=embedding` branch byte-identical. `toBoolOrNull` helper, `loadIntelligenceMap` helper with try/catch fallback.
- `app/src/app/agents/new/page.tsx` — handler updated to `items.map(m => m?.id ?? '').filter(Boolean)` before calling `setAvailableModels`. `gemini-main` default-model logic preserved.
- `app/src/app/agents/[id]/page.tsx` — same extraction pattern; `setAvailableModels(list)` still receives `string[]`.
- `app/src/app/tasks/new/page.tsx` — same extraction pattern + **Rule 1 fix** (see Deviations).
- `app/src/components/catbrains/config-panel.tsx` — same extraction pattern.
- `app/src/components/sources/source-list.tsx` — NOT modified; already forward-compatible.

## Decisions Made

- **Flat-root shape over `capabilities: {...}` nesting** — locked in 158-CONTEXT.md. Rationale: simpler consumer code on both UI and CatBot tool sides; no duplicated logic for "merge display fields + capability fields"; Phase 161 UI can group visually without forcing a structural namespace.
- **`null` for missing enrichment fields (not omission)** — lets clients distinguish "row absent from model_intelligence" from "row exists with explicit `false`". Plan 158-02 spec Test 2 locked this contract; asserted in Vitest.
- **LiteLLM availability drives the response list** — models in `model_intelligence` but missing from LiteLLM do NOT appear. Preserves v8.0 semantics (response is "what can I actually call right now"). Future Phase 160 `list_llm_models` tool must layer its own reconciliation if it wants to expose non-callable rows.
- **`logger` source `'system'` instead of adding `'api/models'` to `LogSource` enum** — extending the enum is cross-cutting (touches type definitions used across 40+ files); for a two-call-sites introduction the string prefix `'api/models: ...'` in the message preserves log-grep UX without the enum churn.
- **tasks/new/page.tsx pre-existing bug fixed inline** — the existing `Array.isArray(mData)` check was always false (API returns `{ models: [...] }` object, not an array); `availableModels` was silently empty. Because the entire handler was being rewritten for Phase 158 anyway, fixing the bug in the same commit was zero-incremental-risk and avoided leaving a documented-broken state in the tree.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] tasks/new/page.tsx handler was always producing empty `availableModels`**
- **Found during:** Task 2 (reading the file before editing per plan guidance)
- **Issue:** Existing code `const mData = await modelsRes.json(); const ids = Array.isArray(mData) ? ... : [];` — `mData` is the response object `{ models: [...] }`, never an array, so `ids` was always `[]`. Pre-existing bug: the wizard model dropdown has been silently empty.
- **Fix:** Rewrote the block to read `mData.models` with the Phase 158 extraction pattern: `const items = Array.isArray(mData?.models) ? mData.models : []; const ids = items.map(m => m?.id ?? '').filter(Boolean);`.
- **Files modified:** app/src/app/tasks/new/page.tsx
- **Commit:** `edde3a2`
- **Scope justification:** The handler was being rewritten anyway for Phase 158; fixing the pre-existing bug in the same commit introduced zero additional risk and avoided leaving a documented-broken state.

**2. [Rule 3 - Blocking] logger source `'api/models'` not in LogSource enum — build failed**
- **Found during:** Task 2 verification (`npm run build`)
- **Issue:** My initial route.ts had `logger.warn('api/models', ...)` and `logger.error('api/models', ...)`, but `LogSource` in `app/src/lib/logger.ts` is a closed union — `'api/models'` is not a member. Next.js build failed with TS type error.
- **Fix:** Changed both calls to `logger.warn('system', 'api/models: ...', ...)` — uses the existing `'system'` source and prefixes the log message for grep compatibility.
- **Files modified:** app/src/app/api/models/route.ts
- **Commit:** `edde3a2` (bundled with Task 2 since it was uncovered during Task 2 build verification)

**3. [Consolidation — same pattern as 158-01 Rule 3] Task 3 test file consolidated into Task 1 TDD RED commit**
- **Reason:** Task 1 is `tdd="true"` — requires failing test FIRST. Task 3's spec was the complete test file verbatim. Authoring the file in Task 1 commit `49caf1d` and letting Task 3's spec be satisfied by that file avoids an artificial commit split with no independent review value.
- **Impact:** Task 3's success criteria are satisfied by the test file created in commit `49caf1d` and verified green in commit `141af89` after the route was enriched. No separate Task 3 commit was needed.

---

**Total deviations:** 3 (2 Rule-driven auto-fixes + 1 consolidation). Zero Rule 4 / architectural escalations.
**Impact on plan:** None on deliverables; all required artifacts present; fixed a pre-existing silent bug as a side-effect benefit.

## Issues Encountered

- **Model namespace mismatch: LiteLLM exposes aliases (`gemini-main`, `claude-opus`, `gemma-local`) while `model_intelligence.model_key` uses fully-qualified names (`google/gemini-2.5-pro`, `anthropic/claude-opus-4`, `ollama/gemma3:4b`, etc.).** At runtime inside the container, all 12 models currently returned by `GET /api/models` have `supports_reasoning=null`, `is_local=null`, `tier=null`, etc. because no LiteLLM id matches any `model_intelligence.model_key`. **This is NOT a Plan 158-02 defect** — the contract ("enriched=null when row absent") is working exactly as specified in the Plan and Tests 2/4 of the Vitest coverage. Fixing the namespace alignment is an upstream data concern (either LiteLLM should expose fully-qualified names, or `model_intelligence` should gain rows for the shortcut aliases, or the route should consult `model_aliases` as a resolver layer). Recommend addressing in Phase 159 or a tactical Plan before Phase 161's oracle depends on real enriched fields. Logged for downstream phases.
- **Pre-existing regression in `alias-routing.test.ts > seedAliases`** (3 failing tests) — already documented in 158-01 `deferred-items.md`. Verified to persist on parent commit; not introduced by Plan 158-02. Out of scope per GSD scope-boundary rule.

## Verification Evidence

- `cd app && npm run test:unit -- src/app/api/models/__tests__/route.test.ts` → **10 passed (10)** in 153ms.
- `cd app && npm run test:unit -- src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts src/app/api/models/__tests__/route.test.ts` → **26 passed (26)** in 872ms (Phase 158 full coverage).
- `cd app && npm run test:unit -- alias-routing.test.ts mid.test.ts health.test.ts` → 56 passed / 3 failed (pre-existing in alias-routing `seedAliases`). Zero regressions introduced by Plan 158-02.
- `cd app && npm run lint` → exit 0 on Plan 158-02 changes (only pre-existing warnings in unrelated files).
- `cd app && npm run build` → exit 0; Next.js compilation succeeded; all routes built; `/api/models` listed as dynamic `ƒ`.
- `docker compose build --no-cache && docker compose up -d && docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && docker restart docflow-app` → container up, `✓ Ready in 272ms`, zero errors in last 100 log lines.
- `curl -s http://localhost:3500/api/models` →
  - **12 models returned**; all items are objects with `typeof id === 'string'`.
  - All 12 have the 7 enriched keys present with value `null` (namespace mismatch noted above).
  - Shape check `OK: all 12 items are objects with string id`.
- `curl -s http://localhost:3500/api/models?type=embedding` → `{installed: 2, suggestions: 5}`; no `models` key. Embedding branch unaffected.
- UI route HTTP status: `/agents/new` 307 (expected locale redirect), `/tasks/new` 307, `/api/models` 200.

## CatBot Oracle Readiness

Per CLAUDE.md testing protocol: Plan 158-02 delivers the **API surface** that Phase 160's `list_llm_models` tool will wrap. The tool itself is a Phase 160 deliverable, so direct CatBot oracle verification for this plan is **deferred to Phase 160** (TOOL-01..04). The API surface is validated via Vitest + container smoke test (`curl | python3`) documented above.

**Gap signalled for Phase 160:** the tool wrapping `/api/models` must surface the namespace-mismatch note above — otherwise CatBot will see all models with `supports_reasoning=null` and be unable to recommend reasoning-capable models. Either the tool joins via `model_aliases` internally, or a seed plan aligning the two namespaces must run before the tool ships.

## Next Phase Readiness

- **Phase 159 (backend passthrough):** partially unblocked. `resolveAlias` can now return the enriched shape for PATCH validation, but the namespace mismatch means the validation will see `supports_reasoning=null` for every current alias target. Recommend a data-alignment tactical plan (either rename LiteLLM aliases to FQNs, or seed shortcut rows into `model_intelligence`) before Phase 159 lands validation logic.
- **Phase 160 (CatBot tools + skill KB):** blocked on the namespace fix above. The `list_llm_models` tool will return useless data until alignment lands.
- **Phase 161 (UI enrutamiento + oracle):** blocked until Phase 160 is shippable (the oracle consumes the tool). Also blocked on namespace alignment.
- **Blockers:** one identified — model-id namespace mismatch between LiteLLM and `model_intelligence.model_key`. Does not block Plan 158-02 itself (contract is correct), but WILL block Phases 160/161 oracle verification.

---
*Phase: 158-model-catalog-capabilities-alias-schema*
*Completed: 2026-04-21*

## Self-Check: PASSED

- FOUND: app/src/app/api/models/__tests__/route.test.ts
- FOUND: app/src/app/api/models/route.ts (enriched with model_intelligence JOIN)
- FOUND: app/src/app/agents/new/page.tsx (Phase 158 extraction pattern)
- FOUND: app/src/app/agents/[id]/page.tsx (Phase 158 extraction pattern)
- FOUND: app/src/app/tasks/new/page.tsx (Phase 158 extraction pattern + Rule 1 bug fix)
- FOUND: app/src/components/catbrains/config-panel.tsx (Phase 158 extraction pattern)
- FOUND: .planning/phases/158-model-catalog-capabilities-alias-schema/158-02-SUMMARY.md
- FOUND commit: 49caf1d test(158-02): add failing tests for enriched GET /api/models
- FOUND commit: 141af89 feat(158-02): enrich GET /api/models with model_intelligence JOIN
- FOUND commit: edde3a2 feat(158-02): update 4 UI consumers to read .id from model objects
