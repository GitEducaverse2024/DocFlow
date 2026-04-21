---
phase: 158-model-catalog-capabilities-alias-schema
plan: 01
subsystem: database
tags: [sqlite, better-sqlite3, model-catalog, alias-routing, reasoning, migration, vitest]

# Dependency graph
requires:
  - phase: 157-kb-rebuild-determinism
    provides: stable db.ts bootstrap baseline + alias_routing service contracts
provides:
  - model_intelligence columns: is_local (INTEGER DEFAULT 0), supports_reasoning (INTEGER DEFAULT 0), max_tokens_cap (INTEGER nullable)
  - model_aliases columns: reasoning_effort (TEXT CHECK off/low/medium/high/NULL), max_tokens (INTEGER nullable), thinking_budget (INTEGER nullable)
  - Seed UPDATE block marking Opus/Sonnet 4.6 and Gemini 2.5 Pro as reasoning-capable with user-locked max_tokens_cap
  - Seed UPDATE block flipping all provider='ollama' rows to is_local=1
  - Vitest tmpfile DB coverage (16 tests, 4 describe blocks) validating shape, idempotency, CHECK constraint, back-compat
affects: [158-02-api-models-enrichment, 159-backend-passthrough, 160-catbot-tools, 161-ui-enrutamiento]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Idempotent ALTER TABLE via try/catch swallow (already used ~60 times; extended here for capability columns)
    - CHECK constraint added via ALTER TABLE ADD COLUMN with enumerated values + explicit NULL allowance
    - Inline seed UPDATE block wrapped in try/catch with logger.error (consistent with Maquetador skill seed pattern)
    - Self-contained Vitest using tmpfile + better-sqlite3 (no db.ts import — avoids production side effects)

key-files:
  created:
    - app/src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts
    - .planning/phases/158-model-catalog-capabilities-alias-schema/deferred-items.md
  modified:
    - app/src/lib/db.ts

key-decisions:
  - "is_local chosen over adding a new tier CHECK('paid','local') column to avoid regression on existing tier semantics (Elite/Pro/Libre)"
  - "Seed UPDATE runs on every bootstrap (idempotent by design) rather than guarding with WHERE supports_reasoning IS NULL — allows canonical seed to override manual edits per CONTEXT.md"
  - "max_tokens_cap for Claude Opus 4.6 locked at 32000 (below vendor max of 128000) per user decision in 158-CONTEXT.md"
  - "Helper applyV30Schema/applyV30Seed in test file must be byte-identical with db.ts block — duplication documented in JSDoc"
  - "Task 1 and Task 3 consolidated: test file written once (as spec) and committed with Task 1 because the test helpers ARE the canonical spec for the db.ts migration"

patterns-established:
  - "Capability columns additive-only — never modify tier/cost_tier/capabilities(JSON) semantics"
  - "reasoning_effort CHECK enumeration with NULL as default preserves byte-identical behaviour for the 8 existing aliases"
  - "Missing model_key UPDATE is tolerated no-op (0 changes) — upstream mid.ts seed drift does not block bootstrap"

requirements-completed: [CAT-01, CAT-02, CFG-01]

# Metrics
duration: ~5min
completed: 2026-04-21
---

# Phase 158 Plan 01: Schema Migration + Seed Summary

**Added 3 capability columns to model_intelligence and 3 to model_aliases plus a canonical UPDATE seed, all idempotent inline in db.ts bootstrap, covered by 16 Vitest tmpfile tests.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-21T15:12:44Z
- **Completed:** 2026-04-21T15:17:45Z
- **Tasks:** 3 (Task 1 + Task 2 + Task 3 — test file consolidated with Task 1)
- **Files modified:** 2 code + 1 test + 1 deferred-items doc

## Accomplishments

- `model_intelligence` now carries `is_local`, `supports_reasoning`, `max_tokens_cap` — the data shape Phase 159/160/161 will consume to gate reasoning features.
- `model_aliases` gains `reasoning_effort` (with SQLite CHECK constraint enumerating off/low/medium/high/NULL), `max_tokens`, `thinking_budget` — per-alias reasoning config without breaking the 8 existing aliases (all values NULL by default).
- Canonical seed hardcodes reasoning capabilities for claude-opus-4-6 (32000), claude-sonnet-4-6 (64000), gemini-2.5-pro (65536), plus max_tokens_cap defaults for non-reasoning Claude/OpenAI/Gemini/Ollama models.
- All provider='ollama' rows marked `is_local=1`, all others `is_local=0` — orthogonal to the existing `tier` (Elite/Pro/Libre) and `cost_tier` (premium/high/medium/low/free) semantics.
- Vitest tmpfile DB coverage (16 tests across 4 describe blocks) validates schema shape, idempotency, CHECK constraint rejection of invalid values, back-compat no-mutate on pre-existing rows, and alias NULL defaults.

## Task Commits

1. **Task 1: ALTER TABLE migration inline en db.ts bootstrap + Task 3 test file** — `114ac82` (feat)
2. **Task 2: Seed UPDATE inline (reasoning flags + is_local + max_tokens_cap)** — `b94eacc` (feat)

**Plan metadata:** (this commit) `docs(158-01): complete schema migration + seed plan`

_Task 3 (test file) was committed together with Task 1 because the test helpers (`applyV30Schema`, `applyV30Seed`) are the canonical spec for the db.ts block — authoring them separately would have produced two tightly-coupled commits with no independent review value. Documented as a Rule 3 / consolidation deviation below._

## Files Created/Modified

- `app/src/lib/db.ts` — Added Phase 158 block after `CREATE TABLE model_aliases`: 6 ALTER TABLE statements (try/catch idempotent) + canonical UPDATE seed block wrapped in try/catch with logger.error fallback
- `app/src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts` — New Vitest file with tmpfile DB; 16 tests across "schema migration" (5), "seed" (7 including idempotency + no-op silent absence), "back-compat no-mutate" (2), "alias defaults preserved" (2)
- `.planning/phases/158-model-catalog-capabilities-alias-schema/deferred-items.md` — Logs pre-existing `alias-routing.test.ts > seedAliases` failures (3) verified to exist on commit `a7297de` BEFORE Phase 158 — out of scope per GSD scope-boundary rule

## Decisions Made

- **Consolidated Task 1 and Task 3 test file authoring** — the plan listed test file creation under Task 3, but Task 1 is marked `tdd="true"` which requires a failing test FIRST. Since the plan spec for Task 3 provided the complete test file verbatim (including helpers that replicate db.ts logic), I authored the test file once and committed it with Task 1's db.ts changes. Splitting the commits would have created artificial boundaries with no semantic value.
- **No code in tests imports db.ts directly** — rationale documented in the test file JSDoc and reinforced here: importing db.ts triggers ~100 table creations on `data/docflow.db` (production), seeds skills, opens file handles. The tmpfile helper is self-contained and the duplication of DDL/seed between db.ts and the test helper is intentional (documented).
- **CHECK constraint on reasoning_effort includes explicit `OR reasoning_effort IS NULL`** — without this, the constraint would reject NULL (SQLite CHECK treats NULL in IN-list as unknown). All 8 existing aliases keep reasoning_effort=NULL by default, so the OR-NULL branch is load-bearing for back-compat.

## Deviations from Plan

### Scope consolidation

**1. [Rule 3 - Blocking] Test file authored as part of Task 1 instead of Task 3**
- **Found during:** Task 1 (TDD RED phase required failing test first, but Task 3's spec was the entire test file)
- **Issue:** Plan structure lists test file under Task 3, but Task 1 requires `tdd="true"` which needs a failing test BEFORE the implementation. The Task 3 spec provides the complete test file (not a partial/RED-only version).
- **Fix:** Authored the full test file (with helpers `applyV30Schema`/`applyV30Seed` that mirror the db.ts blocks from Tasks 1 and 2) as part of Task 1's commit. The helpers serve as the canonical spec. Task 3 is therefore satisfied by the existing test file; no separate commit was needed.
- **Files modified:** app/src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts (created in commit 114ac82)
- **Verification:** 16 tests green across all 4 describe blocks after each of Tasks 1 and 2.
- **Committed in:** `114ac82` (Task 1 commit)

---

**Total deviations:** 1 scope consolidation (Rule 3 — avoided artificial commit split when test file is the unified spec for Tasks 1+2+3).
**Impact on plan:** None on deliverables. All required artifacts present: 6 ALTERs + seed block in db.ts, 16 Vitest tests, lint+build clean.

## Issues Encountered

- **Pre-existing `alias-routing.test.ts > seedAliases` failures (3)** — discovered during Phase 158 regression verification. Verified to exist on commit `a7297de` (pre-Phase-158) by temporarily reverting db.ts and running the test. Out of scope per GSD scope-boundary rule. Logged to `deferred-items.md`. The other 22 tests in `alias-routing.test.ts` (including `resolveAlias`, `upsertAlias`, caching paths) pass — no regression from the new capability columns.

## Verification Evidence

- `cd app && npm run test:unit -- src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts` → **16 passed (16)** in 835ms.
- `cd app && npm run build` → exit 0, Next.js compilation succeeded, all routes built.
- `cd app && npm run lint` → only pre-existing warnings in unrelated files (react-hooks/exhaustive-deps, next/next/no-img-element). Zero lint errors on the Phase 158 changes.
- Regression: `alias-routing.test.ts` 22/25 passing; 3 failures pre-existing (verified on parent commit).

## CatBot Oracle Readiness

Per CLAUDE.md testing protocol: Phase 158 Plan 01 is **schema-only** (data plumbing). CatBot cannot yet verify capability columns end-to-end because the tools `list_llm_models` / `get_catbot_llm` that expose `supports_reasoning` / `max_tokens_cap` / `is_local` are **Phase 160** deliverables. Oracle verification for this plan is deferred to Phase 160 (TOOL-01..04). The schema itself is validated via Vitest + manual PRAGMA in container (step 3 of plan verification).

## Next Phase Readiness

- **Plan 158-02 (api-models-enrichment):** ready to proceed — the 3 new `model_intelligence` columns are the input the API enrichment will project into `GET /api/models` response shape.
- **Phase 159 (backend passthrough):** ready — `model_aliases.reasoning_effort`/`max_tokens`/`thinking_budget` are the columns `resolveAlias` will project, and `PATCH /api/alias-routing` will validate against `model_intelligence.supports_reasoning`.
- **Blockers:** none. Pre-existing `seedAliases` failures logged but do not gate Phase 158 — the schema changes are additive and the production `seedAliases` code path runs at bootstrap regardless of test state.

---
*Phase: 158-model-catalog-capabilities-alias-schema*
*Completed: 2026-04-21*

## Self-Check: PASSED

- FOUND: app/src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts
- FOUND: app/src/lib/db.ts (Phase 158 block injected after `CREATE TABLE model_aliases`)
- FOUND: .planning/phases/158-model-catalog-capabilities-alias-schema/158-01-SUMMARY.md
- FOUND: .planning/phases/158-model-catalog-capabilities-alias-schema/deferred-items.md
- FOUND commit: 114ac82 feat(158-01): add v30.0 capability columns
- FOUND commit: b94eacc feat(158-01): seed reasoning flags and is_local
