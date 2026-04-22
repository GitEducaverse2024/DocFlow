---
phase: 161-ui-enrutamiento-oracle-e2e
plan: 02
subsystem: api
tags: [api, aliases, sqlite, model-intelligence, enrichment, join, graceful-degradation, vitest]

requires:
  - phase: 158-model-catalog-capabilities-alias-schema
    provides: "model_intelligence columns supports_reasoning/max_tokens_cap/is_local + model_aliases columns reasoning_effort/max_tokens/thinking_budget"
  - phase: 158-model-catalog-capabilities-alias-schema
    provides: "/api/models enrichment pattern (flat-root + toBoolOrNull + null-on-miss) — mimicked by this plan"
  - phase: 159-backend-passthrough-litellm-reasoning
    provides: "AliasRowV30 type shape with reasoning_effort/max_tokens/thinking_budget columns"
provides:
  - "GET /api/aliases enriched flat-root per-row shape (alias, model_key, description, is_active, reasoning_effort, max_tokens, thinking_budget, capabilities)"
  - "capabilities = {supports_reasoning, max_tokens_cap, is_local} | null on JOIN miss"
  - "7 regression tests covering shape, coercion, graceful degradation, legacy fields, DB error path"
affects: ["161-05 (tab-enrutamiento UI consumer)", "v30.0 oracle verification (CatBot introspection)"]

tech-stack:
  added: []
  patterns:
    - "LEFT JOIN shape builder: SELECT + prefix cap_* + discriminator column cap_model_key for NULL-matching"
    - "Enrichment mimicry: Phase 158-02 /api/models pattern replicated for /api/aliases"
    - "Test mocking: vi.mock @/lib/db with dynamic route import to avoid hoisting pitfall"

key-files:
  created:
    - "app/src/app/api/aliases/__tests__/route.test.ts (178 lines, 7 tests)"
  modified:
    - "app/src/app/api/aliases/route.ts (16 → 64 lines; SELECT * → LEFT JOIN shape builder)"

key-decisions:
  - "cap_model_key column used as JOIN-miss discriminator (NULL when LEFT JOIN has no match) — simpler than checking all cap_* for NULL"
  - "Inline toBoolOrNull helper (same as Phase 158-02 /api/models) — not extracted to shared module; keeps each route self-contained per CONTEXT.md"
  - "description defaults to empty string '' when null (legacy consumers expect string, not null) — does not break test seed that passes strings"
  - "Dropped getAllAliases import entirely (ESLint no-unused-vars would break Docker build per MEMORY.md feedback_unused_imports_build.md)"

patterns-established:
  - "Pattern: LEFT JOIN with cap_* prefix + discriminator column for graceful-degradation enrichment routes"
  - "Pattern: per-row shape builder with strict `null` (not nested nulls) on JOIN miss"

requirements-completed: [UI-01, UI-02, UI-03]

duration: 2min
completed: 2026-04-22
---

# Phase 161 Plan 02: Enrich /api/aliases with model_intelligence JOIN Summary

**LEFT JOIN rewrite of GET /api/aliases returning per-row flat-root enriched shape (alias + reasoning config + capabilities or null) to feed Plan 05 UI conditional controls.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-22T11:54:40Z
- **Completed:** 2026-04-22T11:56:46Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2 (1 created, 1 rewritten)

## Accomplishments

- GET /api/aliases now returns enriched per-row shape with capabilities sub-object
- LEFT JOIN + cap_model_key discriminator correctly produces `capabilities: null` on namespace mismatch (real-world case for `gemini-main` / `claude-opus` / `gemma-local` shortcuts not present in model_intelligence as FQNs — STATE.md known blocker)
- Boolean coercion (INTEGER 0/1 → JSON true/false) mirrors Phase 158-02 exactly; `toBoolOrNull` inlined for consistency
- 7 vitest cases covering shape, coercion, graceful degradation, reasoning passthrough, DB error path — all GREEN
- Zero impact on legacy consumers: `.alias` / `.model_key` / `.description` / `.is_active` preserved at top level

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing tests for enriched /api/aliases shape** — `854df31` (test)
2. **Task 2: Rewrite GET /api/aliases with JOIN enrichment** — `1f59ac6` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified

- `app/src/app/api/aliases/__tests__/route.test.ts` — 178 lines, 7 test cases covering enriched shape + graceful degradation + legacy compat + 500 error
- `app/src/app/api/aliases/route.ts` — rewritten (16 → 64 lines); LEFT JOIN query + shape builder + toBoolOrNull; removed `getAllAliases` import

## Decisions Made

- **cap_model_key as discriminator:** LEFT JOIN emits NULL for all `mi.*` columns when no match, but `r.cap_model_key === null` is the clearest signal for the UI contract (avoid checking three columns). Mirrors pattern in 158-02 which used different signal (key not in Map) but same null-on-miss semantics.
- **Inline `toBoolOrNull`:** Plan explicitly called for inlining (not shared module) per the Phase 158-02 precedent — keeps each route self-contained and eliminates cross-file dependency churn.
- **`description ?? ''`:** The column nominally stores strings but has no NOT NULL constraint; defaulting to '' preserves legacy behavior for consumers that destructure `.description` expecting a string.

## Deviations from Plan

### Partial RED (Task 1)

**1. [Note] Plan's RED assertion counted 7 failing tests; actual was 4**
- **Found during:** Task 1 verify step (`grep -qE "Tests[[:space:]]+[7-9]..."`).
- **Issue:** Plan expected all 7 new tests to fail on the legacy route. In reality, 3 tests passed incidentally on the legacy `SELECT *` implementation: (a) reasoning passthrough for `catbot` — legacy shape exposes `reasoning_effort`/`max_tokens`/`thinking_budget` at root because `SELECT *` retrieves all columns; (b) null reasoning config for `chat-rag` — same mechanism; (c) 500 on DB error — pre-existing catch path was already in place.
- **Fix:** Proceeded with TDD intent preserved. The 4 *new-behavior* assertions (shape keys, boolean coercion strict equality, null capabilities, capabilities object construction) correctly failed RED → passed GREEN. The 3 incidental passes provide additional regression protection without lying about TDD intent.
- **Rule:** Informational deviation; not a bug fix. The plan's `grep -qE "[7-9] failed"` would have failed, but the TDD spirit (new behavior is red before green) is intact. Continued to Task 2 on merit.
- **Verification:** Post-implementation: all 7 tests GREEN. Confirms that the 3 incidental passes remained passing (proving legacy compat) and the 4 new-behavior tests flipped RED → GREEN.
- **Committed in:** 854df31 (Task 1 test commit).

---

**Total deviations:** 1 informational (plan RED-count was optimistic; TDD intent preserved).
**Impact on plan:** None. All 7 tests serve their purpose (4 new-behavior + 3 legacy-regression). Zero scope creep, zero code changes induced.

## Issues Encountered

- `npm test` script missing — project uses `npm run test:unit` (vitest run). Plan referenced `npm test -- --run` syntax; adapted to `npm run test:unit -- --run src/...` with paths rooted at `app/src/`. Verified working locally.

## Verification Evidence

- **Unit tests:** `cd app && npm run test:unit -- --run src/app/api/aliases` → **7/7 passed** (108ms)
- **Lint:** `npm run lint | grep -c 'api/aliases'` → **0** violations in changed files
- **TypeScript:** targeted `tsc --noEmit` showed pre-existing unrelated errors; **zero new errors** in `api/aliases/*`
- **CatBot Oracle (deferred):** Plan 161-05 will wire UI + Plan 161-06 will execute the oracle smoke. This plan (161-02) is pure data-shape plumbing; the CatBot `list_llm_models` tool from Phase 160-02 already introspects model_intelligence directly and does not consume /api/aliases. Oracle coverage for this endpoint lives in Plan 05 (UI smoke) + Plan 06 (VER-01/02 CatBot tool paths).

## User Setup Required

None — purely internal API shape change, no external service configuration.

## Next Phase Readiness

- Plan 161-05 (tab-enrutamiento UI) has its single data source ready: `GET /api/aliases` returns 8 documented keys per row with `capabilities` sub-object or null. UI can render conditional dropdown/input based on `row.capabilities?.supports_reasoning`, clamp max_tokens via `row.capabilities?.max_tokens_cap`, etc.
- Namespace mismatch from STATE.md continues to produce `capabilities: null` rows for LiteLLM shortcut aliases — Plan 161-01 (shortcut seed) lands in the same wave to make `capabilities` populated for all 11 seeded aliases.
- Zero coupling to other parallel 161 plans (01 seed, 03 logger, 04 unit test) — file overlap verified zero.

## Self-Check: PASSED

- FOUND: app/src/app/api/aliases/route.ts
- FOUND: app/src/app/api/aliases/__tests__/route.test.ts
- FOUND: .planning/phases/161-ui-enrutamiento-oracle-e2e/161-02-SUMMARY.md
- FOUND commit: 854df31 (test 161-02)
- FOUND commit: 1f59ac6 (feat 161-02)

---
*Phase: 161-ui-enrutamiento-oracle-e2e*
*Completed: 2026-04-22*
