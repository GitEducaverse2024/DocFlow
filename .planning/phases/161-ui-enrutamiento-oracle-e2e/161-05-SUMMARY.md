---
phase: 161-ui-enrutamiento-oracle-e2e
plan: 05
subsystem: ui
tags: [nextjs, react, tailwind, shadcn, i18n, next-intl, model-routing, reasoning, v30.0]

# Dependency graph
requires:
  - phase: 161-02
    provides: "GET /api/aliases enriched shape with flat reasoning_effort + max_tokens + thinking_budget + nested capabilities object (LEFT JOIN model_intelligence)"
  - phase: 158-02
    provides: "GET /api/models flat-root shape with supports_reasoning + max_tokens_cap + is_local per model id"
  - phase: 159-03
    provides: "PATCH /api/alias-routing validator with hasOwnProperty extended-body gate (null = reset semantics)"
  - phase: 161-01
    provides: "LiteLLM shortcut seed in model_intelligence so /api/models returns non-null capabilities for shortcut ids used by the UI cap Map"
provides:
  - "Expand-row panel on each Enrutamiento row with 3 conditional reasoning controls (Inteligencia dropdown, max_tokens input, thinking_budget input)"
  - "Client-side Map<model_id, ModelCaps> built from /api/models on mount — TARGET-model cap source during the dropdown-changed-but-not-saved window"
  - "Auto-save pattern for reasoning_effort (mirrors applyModelChange optimistic + revert)"
  - "Dirty-state + explicit Guardar flow for max_tokens / thinking_budget with null-on-empty reset semantics"
  - "19 new i18n keys in es.json + en.json under settings.modelCenter.enrutamiento"
  - "Zero-regression outer wrapper pattern: row div retains identical classes when collapsed"
affects: [161-06, v30.0 milestone audit, v30.1 resolver layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-side model cap Map built from /api/models once on mount (stable per session)"
    - "getTargetCapabilities priority: Map → row.capabilities → null (unknown caps UX branch)"
    - "Dirty-state tracking with hasOwnProperty gate for CFG-02j reset semantics mirroring Phase 159-03 validator"
    - "Mixed auto-save + explicit-save UX: atomic enums auto-save, numeric inputs need Guardar"

key-files:
  created: []
  modified:
    - "app/src/components/settings/model-center/tab-enrutamiento.tsx (358 → 764 lines)"
    - "app/messages/es.json (+19 keys in enrutamiento block)"
    - "app/messages/en.json (+19 keys in enrutamiento block)"

key-decisions:
  - "Outer wrapper div with ZERO styling preserves collapsed row visuals byte-identical (zero-regression filter from CONTEXT.md satisfied structurally, not by conditional markup)"
  - "Task 2a + 2b committed atomically — 2a standalone would break build (unused-vars are Docker-build errors per MEMORY.md feedback_unused_imports_build.md). Combined commit preserves plan-ordering intent while respecting lint-as-error invariant"
  - "getTargetCapabilities uses useCallback with [aliases, modelCapsMap] deps so row-list changes repopulate the resolver; Map Population happens once on mount (models catalog stable per session)"
  - "saveRow always includes current reasoning_effort in PATCH body — preserves dropdown choice across extended-body writes (Phase 159-03 validator truthiness semantics)"
  - "'max_tokens' in dirty (hasOwnProperty) used instead of truthy check so null values (CFG-02j reset) don't silently fall back to row.max_tokens when reading currentMaxTokens"
  - "ChevronDown added to Tier column flex container instead of a separate 5th column — keeps grid-cols-[...] template byte-identical for zero visual regression"

patterns-established:
  - "modelCapsMap: client-side Map<id, caps> from /api/models — reusable pattern for any future UI that needs TARGET-state before server confirmation"
  - "Dual-fallback capabilities resolution (Map → row → null) with UI branching on null = unknown"
  - "Combined Task 2a+2b commit when intermediate state would violate lint-as-error rule — documented rationale in commit message"

requirements-completed: [UI-01, UI-02, UI-03]

# Metrics
duration: ~7min
completed: 2026-04-22
---

# Phase 161 Plan 05: UI Enrutamiento Expand-Row Panel Summary

**Settings › Centro de Modelos › Enrutamiento ahora expone por fila Inteligencia (off/low/medium/high), max_tokens y thinking_budget con visibilidad condicional por capability del TARGET model, resuelto via Map client-side de /api/models + fallback row.capabilities.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-22T12:42:21Z
- **Completed:** 2026-04-22T12:49:00Z (approx)
- **Tasks:** 3 (Task 1, Task 2a+2b combined)
- **Files modified:** 3

## Accomplishments

- **UI-01 shipped:** Inteligencia dropdown (reasoning_effort) visible cuando TARGET supports_reasoning === true — auto-save on select via optimistic PATCH + loadAliases refetch, mirror de applyModelChange pattern.
- **UI-02 shipped:** max_tokens numeric input siempre visible, placeholder = TARGET max_tokens_cap (o 'sin definir'), helper text con cap inline, border-red visual cuando supera cap.
- **UI-03 shipped:** thinking_budget numeric input visible cuando reasoning soportado, helper referencia max_tokens actual, border-red cuando > max_tokens.
- **Dirty + Guardar flow:** explicit Button enabled solo cuando dirtyRows[alias] tiene entries; PATCH body incluye reasoning_effort actual para preservation; empty string → null (CFG-02j reset).
- **modelCapsMap:** Map<id, caps> construido on-mount desde /api/models — PRIMARY source para getTargetCapabilities durante el "user picked new model, not yet saved" window (< 200ms antes del refetch).
- **Zero-regression:** outer wrapper sin styling; grid div interno preserva idénticas classes border/bg/rounded/items-center para usuarios que no expanden.
- **i18n completo:** 19 keys nuevas en es.json + en.json, incluyendo interpolación `{cap}` / `{current}` / `{model}`.

## Task Commits

Each task committed atomically:

1. **Task 1: Update types + fetch enriched /api/aliases + build /api/models cap map** - `52ec425` (feat)
2. **Task 2a+2b combined: i18n keys + chevron toggle + expand panel with 3 conditional controls + dirty-save handlers** - `a3f2477` (feat)

**Plan metadata:** (to be committed after SUMMARY + STATE updates)

## Files Created/Modified

- `app/src/components/settings/model-center/tab-enrutamiento.tsx` (358 → 764 lines) — AliasRow/ModelCaps interfaces, modelCapsMap state + useEffect fetch, loadAliases callback, applyReasoningEffort + updateDirtyField + saveRow handlers, ChevronDown toggle, expand panel with 3 conditional controls + Guardar button.
- `app/messages/es.json` — 19 new keys: expandir, colapsar, avanzado, inteligencia, inteligenciaOff/Low/Medium/High, maxTokens, maxTokensHelper, maxTokensHelperSinCap, thinkingBudget, thinkingBudgetHelper, thinkingBudgetHelperSinMax, guardar, guardado, guardadoError, sinSoporteReasoning, capabilitiesDesconocidas.
- `app/messages/en.json` — same 19 keys, English translations.

## Decisions Made

- **Atomic 2a+2b commit vs 2-commit split:** Task 2a as planned left `dirtyRows`/`setDirtyRows`/`loadAliases`/`getTargetCapabilities` declared but not consumed until 2b. MEMORY.md `feedback_unused_imports_build.md` makes unused-vars a Docker build error (ESLint no-unused-vars = error in next build). Two options: (a) insert dummy references in 2a to force consumption, (b) combine commits. Chose (b) — combined commit preserves plan ordering intent in the commit message + keeps every commit a build-green state. Documented in the commit body.
- **Chevron placement inside Tier column vs separate 5th column:** the plan template `grid-cols-[minmax(140px,1fr)_minmax(200px,2fr)_120px_100px]` has 4 columns. Adding a 5th would break the zero-regression invariant (column widths change). Placed chevron inside the Tier-cell flex container with `ml-auto` — structural invariant preserved, chevron aligns right.
- **getTargetCapabilities is useCallback not useMemo:** the function takes `alias` as parameter; memoization granularity is per-call, not per-render. Re-creation happens only when `aliases` or `modelCapsMap` change (both stable within a render pass).
- **'max_tokens' in dirty hasOwnProperty check for currentMaxTokens:** `dirty.max_tokens ?? a.max_tokens` would silently fall back when user explicitly typed empty (null dirty value = CFG-02j reset intent). The `in` operator distinguishes "user typed empty string" (field present, value null) from "user hasn't touched field yet" (field absent). This mirrors Phase 159-03 validator's `hasOwnProperty` extended-body gate — same semantic contract, UI side.
- **saveRow includes current reasoning_effort in body unconditionally:** preserves dropdown selection through extended-body write path. Without it the backend validator would ignore reasoning_effort (not in body = unchanged per Phase 159-03), which is actually safe — but including it explicitly makes the PATCH self-describing and defends against future validator changes that might activate extended-body path only when a reasoning field is present.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Combined Task 2a + Task 2b into single atomic commit**
- **Found during:** Task 2a (between Task 2a code completion and its `npm run build` verify)
- **Issue:** Task 2a as planned declares `dirtyRows`/`setDirtyRows`/`loadAliases`/`getTargetCapabilities` (all in Task 1) and Task 2a's chevron plumbing, but does NOT consume them until Task 2b's controls + handlers. Per MEMORY.md `feedback_unused_imports_build.md`, ESLint `no-unused-vars` is a build error in `next build`. Task 2a standalone `npm run build` failed with 4 unused-vars errors in tab-enrutamiento.tsx:
  - `dirtyRows`/`setDirtyRows` (L110) → consumed in Task 2b expand panel IIFE
  - `loadAliases` (L127) → consumed by Task 2b's applyReasoningEffort + saveRow
  - `getTargetCapabilities` (L249) → consumed by Task 2b expand panel IIFE
- **Fix:** Executed Task 2b immediately after Task 2a without intermediate commit, then committed both together as `a3f2477` with commit message documenting both sub-tasks. Preserves commit-per-task INTENT (atomic user-story grouping) while respecting lint-as-error INVARIANT.
- **Files modified:** `app/src/components/settings/model-center/tab-enrutamiento.tsx`, `app/messages/es.json`, `app/messages/en.json` — all in commit `a3f2477`.
- **Verification:** `npm run build` green on post-combined-commit state; no unused-vars errors anywhere in tab-enrutamiento.tsx.
- **Committed in:** `a3f2477`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Deviation was a commit-structure adjustment, NOT a code deviation. All planned code shipped exactly as specified. Task 2a's "Done criteria" (`npm run build` succeeds) could not be met standalone without this adjustment. No scope creep.

## Issues Encountered

- None during planned work. Pre-existing TS errors in unrelated test files (`intent-jobs.test.ts`, `kb-sync-rebuild-determinism.test.ts`, `telegram-callback.test.ts`) were observed via `npx tsc --noEmit` but are OUT OF SCOPE per SCOPE BOUNDARY rule — they are unrelated to this plan's files and would have existed without this change. Full `npm run build` (which uses Next.js's TS integration, not standalone tsc on all `.test.ts` files) succeeds green.

## User Setup Required

None - this plan is pure UI + i18n. Docker rebuild required to see new UI (per MEMORY.md `feedback_docker_restart.md`): `docker compose build --no-cache docflow-app && docker compose up -d docflow-app && docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && docker restart docflow-app`. Oracle UAT (Plan 06) owns the live smoke + CatBot-verified evidence.

## Next Phase Readiness

- **Plan 161-06 (Oracle UAT VER-02 + VER-03):** UI now exposes the 3 controls CatBot's narrative must reference via its `set_catbot_llm` tool. The live oracle test ("cámbiame a Opus con thinking máximo") should: (1) CatBot invokes set_catbot_llm, (2) UI reflects change if refreshed, (3) next CatBot message logs `reasoning_tokens > 0` in JSONL (already instrumented by Plan 161-03). Plan 06 MUST include a Docker rebuild step per above.
- **v30.0 milestone close:** After Plan 161-06 completion, all 21 requirements satisfied (CAT-01..03, CFG-01..03, PASS-01..04, TOOL-01..04, UI-01..03, VER-01..04).
- **Known issues acknowledged (NOT fixed here):**
  1. `catbot_config.model` can override `alias.model_key` at `route.ts:121` (requestedModel || catbotConfig.model || cfg.model) — UI modifies alias but legacy catbot_config may mask. Phase 160-03 area or v30.1.
  2. `/api/models` reports `available:false` for shortcut rows even with LiteLLM exposing them — cross-match bug between Discovery and catalog, does NOT block UI (capabilities still enrich correctly via Plan 01 shortcut seed).
  Both are documented in the orchestrator's live-state context and explicitly deferred per phase scope.

## Self-Check: PASSED

**Files verified:**
- `app/src/components/settings/model-center/tab-enrutamiento.tsx` — FOUND
- `app/messages/es.json` — FOUND
- `app/messages/en.json` — FOUND
- `.planning/phases/161-ui-enrutamiento-oracle-e2e/161-05-SUMMARY.md` — FOUND

**Commits verified:**
- `52ec425` (Task 1: types + cap Map) — FOUND
- `a3f2477` (Task 2a+2b: expand panel + controls + i18n) — FOUND

**Build verified:** `npm run build` green, zero errors in tab-enrutamiento.tsx.

---
*Phase: 161-ui-enrutamiento-oracle-e2e*
*Completed: 2026-04-22*
