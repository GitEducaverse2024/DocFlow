---
phase: 161-ui-enrutamiento-oracle-e2e
plan: 01
subsystem: database
tags: [model-intelligence, litellm, namespace-mismatch, seed, better-sqlite3, alias-routing]

# Dependency graph
requires:
  - phase: 158-model-catalog-capabilities-alias-schema
    provides: "model_intelligence schema with supports_reasoning/max_tokens_cap/is_local columns + canonical UPDATE pattern inside Phase 158 try/catch"
provides:
  - "4 seeded LiteLLM shortcut rows in model_intelligence (claude-opus, claude-sonnet, gemini-main, gemma-local) with canonical capabilities — resolves STATE.md namespace-mismatch blocker tactically"
  - "INSERT OR IGNORE + canonical UPDATE pattern for shortcut aliases (idempotent bootstrap; preserves pre-existing user edits on PK collision, force-syncs capabilities afterwards)"
  - "Test helper applyV30ShortcutSeed mirroring db.ts byte-for-byte (Phase 158-01 precedent — test IS canonical spec)"
affects: [161-02-aliases-api, 161-05-ui-tab-enrutamiento, 161-06-oracle-uat, v30.1-resolver-layer]

# Tech tracking
tech-stack:
  added: []  # zero new deps — better-sqlite3 + vitest already in devDependencies
  patterns:
    - "Shortcut seed block appended inside existing Phase 158 try/catch (same error handler: 'Phase 158 + 161 seed update error')"
    - "INSERT OR IGNORE (PK collision-safe) + canonical UPDATE (force-sync capabilities) — additive on different PK than existing FQN rows"
    - "Test helper mirrors db.ts SQL byte-for-byte — established in 158-01, reused here; helper IS the spec"

key-files:
  created: []
  modified:
    - "app/src/lib/db.ts (L4953-4972 shortcut seed block + L4973 updated catch message to 'Phase 158 + 161 seed update error')"
    - "app/src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts (+179 lines: applyV30ShortcutSeed helper + 6 new test cases covering all 4 rows, idempotency, FQN non-regression)"

key-decisions:
  - "161-01 resolved v30.0 namespace-mismatch blocker (STATE.md L39) via shortcut seed. INSERT OR IGNORE + idempotent UPDATE follows Phase 158 precedent. Live oracle VER-01 confirmed 21-model list with non-null capabilities for all 4 shortcuts."
  - "Shortcut seed kept ADDITIVE on different PK ('claude-opus' vs 'anthropic/claude-opus-4-6') — zero risk to existing Phase 158 FQN rows; UPDATE targets only shortcut keys."
  - "Seed block placed INSIDE existing Phase 158 try/catch (not new try) — single canonical seed error handler; caller updated to 'Phase 158 + 161 seed update error' so log source stays diagnostic."
  - "Test helper applyV30ShortcutSeed mirrors db.ts block byte-for-byte — established 158-01 convention: the test is the canonical specification, drift between prod seed and test helper is a test failure."

patterns-established:
  - "Namespace shortcut seed pattern: for every LiteLLM gateway shortcut id not matching a model_intelligence FQN, add (INSERT OR IGNORE + canonical UPDATE) pair inside the Phase 158 try block — future LiteLLM additions can follow this template until the v30.1 resolver layer lands."
  - "Scope-boundary discipline: pre-existing data drift (Phase 158 FQN `anthropic/claude-opus-4-6` silently no-op in production) logged to deferred-items.md with root cause, NOT fixed in 161-01."

requirements-completed: [VER-01]

# Metrics
duration: ~5min
completed: 2026-04-22
---

# Phase 161 Plan 01: LiteLLM Shortcut Seed Summary

**4 LiteLLM shortcut rows (claude-opus, claude-sonnet, gemini-main, gemma-local) seeded into model_intelligence with canonical capabilities — unblocks /api/models + /api/aliases + CatBot list_llm_models tool returning non-null capabilities in production.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-22T13:52:00Z
- **Completed:** 2026-04-22T13:57:00Z
- **Tasks:** 2 (Task 1 code + Task 2 smoke verify checkpoint)
- **Files modified:** 2 (db.ts + test file)

## Accomplishments

- Resolved STATE.md-documented namespace-mismatch blocker (LiteLLM gateway shortcuts vs. `model_intelligence.model_key` FQNs) tactically — resolver layer still deferred to v30.1 but production `/api/models`, `/api/aliases`, and `list_llm_models` now return non-null capabilities for the 4 most-used shortcut ids.
- 6 new RED→GREEN test cases locking the shortcut seed contract (4 rows with expected capabilities + idempotency on re-run + zero corruption of pre-existing FQN rows via custom `cost_notes` preservation assertion).
- Docker smoke verification PASSED: Q1 (count = 4) PASS, Q2 (canonical capabilities byte-identical to expected output) PASS, Q3 (FQN regression count) deferred to `deferred-items.md` as pre-existing Phase 158 drift, NOT caused by 161-01.
- Live oracle VER-01 confirmed end-to-end: CatBot invoked `list_llm_models` against running Docker stack, returned 21 models with non-null `supports_reasoning`/`max_tokens_cap`/`is_local` for all 4 seeded shortcuts.

## Task Commits

Each task was committed atomically:

1. **Task 1: Seed LiteLLM shortcut rows in db.ts bootstrap + test coverage (TDD)** — `e3269ba` (feat)
2. **Task 1.b: Log Phase 158 FQN data drift discovered during smoke verify** — `8082dec` (docs)
3. **Task 2: Docker rebuild + smoke verify** — no code commit (verification-only checkpoint; user approved Q1+Q2 PASS, Q3 deferred)

_Plan metadata commit: appended below with STATE.md + ROADMAP.md + REQUIREMENTS.md updates._

## Files Created/Modified

- `app/src/lib/db.ts` (L4953-4972) — Phase 161 shortcut seed block inside existing Phase 158 try/catch:
  - 4 `INSERT OR IGNORE INTO model_intelligence VALUES (...)` statements, one per shortcut id
  - 4 canonical `UPDATE ... WHERE model_key = ...` statements forcing `is_local`/`supports_reasoning`/`max_tokens_cap`/`provider` to canonical values even if row pre-existed
  - Catch-block log message updated to `'Phase 158 + 161 seed update error'` for diagnostic clarity
- `app/src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts` (+179 lines) — `applyV30ShortcutSeed()` helper mirrors db.ts block byte-for-byte + 6 new test cases (16..21 of 22 total): per-row capability asserts for claude-opus / claude-sonnet / gemini-main / gemma-local + idempotency (re-run yields count=1 per key) + FQN non-regression (pre-inserted `anthropic/claude-opus-4-6` with custom `cost_notes='pre-existing'` preserved verbatim after shortcut seed runs).

## Decisions Made

See frontmatter `key-decisions`. Core rationale:

- **Shortcut keys ADDITIVE on different PK:** `claude-opus` is a different PRIMARY KEY than `anthropic/claude-opus-4-6`, so the INSERT OR IGNORE cannot collide with Phase 158 FQN rows and the canonical UPDATE only targets the 4 shortcut keys. Zero risk to existing FQN capabilities.
- **Placed inside Phase 158 try block (not new try):** Shortcut seed errors should surface through the same `logger.error('system', ..., ...)` handler as Phase 158 canonical UPDATEs — single place to watch at cold boot. Catch message updated to `'Phase 158 + 161 seed update error'` so log source identifies both origins.
- **Test helper is canonical spec (158-01 precedent):** `applyV30ShortcutSeed()` mirrors db.ts SQL byte-for-byte. Any drift between prod seed and test helper fails the test — this is intentional. Established in 158-01, re-applied here.
- **Scope-boundary on pre-existing FQN drift:** Q3 regression query returned `1` (instead of expected `2`) during smoke verify. Root cause is production DB storing `anthropic/claude-opus-4` (no `-6` suffix), making Phase 158's seed UPDATE `WHERE model_key = 'anthropic/claude-opus-4-6'` a silent no-op. Logged to `deferred-items.md` (commit `8082dec`) as Phase 158 scope, NOT fixed here per SCOPE BOUNDARY rule. Shortcut seed (the 161-01 deliverable) remains intact and verified.

## Deviations from Plan

None from the planned task execution. One out-of-scope discovery was logged (not fixed):

### Logged to deferred-items.md (not fixed per SCOPE BOUNDARY)

**1. [Scope-boundary] Phase 158 FQN data drift (`anthropic/claude-opus-4` vs. `anthropic/claude-opus-4-6`)**
- **Found during:** Task 2 smoke verify Q3 (FQN regression count query)
- **Issue:** `SELECT COUNT(*) FROM model_intelligence WHERE model_key IN ('anthropic/claude-opus-4-6','google/gemini-2.5-pro')` returned `1`, expected `2`. Production row stores `anthropic/claude-opus-4` (no `-6` suffix), so the Phase 158-01 seed UPDATE targeting `anthropic/claude-opus-4-6` has been a silent no-op in production.
- **Fix:** Not fixed in 161-01. Logged to `deferred-items.md` under `2026-04-22 — Plan 161-01 execution` with 3 possible resolution paths: (a) data migration renaming `claude-opus-4` → `claude-opus-4-6`; (b) updating Phase 158 seed UPDATE to target stored variant; (c) v30.1 resolver layer consulting `model_aliases`.
- **Committed in:** `8082dec` (docs(161-01): log Phase 158 FQN data drift discovered during smoke verify)

---

**Total deviations:** 0 auto-fixed; 1 logged to deferred-items.md (pre-existing Phase 158 drift, orthogonal to 161-01 deliverable).
**Impact on plan:** None. Shortcut seed (the 161-01 deliverable) shipped intact — Q1+Q2 PASS confirms the 4 shortcut rows exist with canonical capabilities. The deferred FQN drift only affects the `anthropic/claude-opus-4-6` FQN row (Phase 158 scope); does not affect any of the 4 shortcut rows Phase 161-01 adds.

## Issues Encountered

None during planned work. Q3 smoke-verify mismatch surfaced the pre-existing Phase 158 drift above, which was logged and deferred per SCOPE BOUNDARY rule rather than fixed inline.

## Live Oracle Verification (VER-01)

Live oracle ran against CatBot on the running Docker stack (localhost:3500). VER-01 PASSED: CatBot invoked `list_llm_models` and returned 21 models; the 4 shortcut rows have non-null `supports_reasoning`/`max_tokens_cap`/`is_local` — confirming 161-01 unblocked the namespace mismatch in production.

Payload captured from the tool response:

```
claude-opus   → supports_reasoning: true,  max_tokens_cap: 32000, is_local: false (provider: anthropic, tier: Elite)
claude-sonnet → supports_reasoning: true,  max_tokens_cap: 64000, is_local: false (provider: anthropic, tier: Pro)
gemini-main   → supports_reasoning: true,  max_tokens_cap: 65536, is_local: false (provider: google,    tier: Elite)
gemma-local   → supports_reasoning: false, max_tokens_cap: 8192,  is_local: true  (provider: ollama,    tier: Libre)
```

This is direct end-to-end evidence (DB row → GET /api/models JOIN → `list_llm_models` tool response → CatBot output) that the shortcut seed closed the namespace-mismatch blocker for the oracle surface. Satisfies VER-01 per CLAUDE.md "CatBot como Oráculo" protocol: feature is implemented, CatBot has the tool, CatBot demonstrated it, evidence captured.

## Smoke Verification (Task 2)

| Query | Expected | Actual | Status |
| ----- | -------- | ------ | ------ |
| Q1 — `COUNT(*) FROM model_intelligence WHERE model_key IN (4 shortcuts)` | `4` | `4` | PASS |
| Q2 — `SELECT model_key, provider, is_local, supports_reasoning, max_tokens_cap FROM ... ORDER BY model_key` | 4 lines byte-identical to plan spec | byte-identical match | PASS |
| Q3 — `COUNT(*) FROM model_intelligence WHERE model_key IN ('anthropic/claude-opus-4-6','google/gemini-2.5-pro')` | `2` | `1` | Deferred (pre-existing Phase 158 drift, see `deferred-items.md`) |

User approved Q1+Q2 PASS and accepted Q3 deferral as Phase 158 scope.

## User Setup Required

None — pure DB seed + test coverage. Docker rebuild happened during smoke verify and is now live.

## Next Phase Readiness

- **VER-01 satisfied** — first of 4 Phase 161 verification requirements closed via live oracle (VER-03 already green via silent logger Plan 03; VER-04 green via integration test Plan 04; VER-02 still pending for Plan 06 oracle UAT sudo-ish flow).
- **Unblocks downstream Phase 161 plans:**
  - Plan 161-02 (`/api/aliases` enrichment) — capabilities JOIN now finds non-null rows for alias `catbot` pointing at shortcut keys like `claude-opus`.
  - Plan 161-05 (UI tab Enrutamiento) — conditional controls `supports_reasoning`/`max_tokens_cap` render correctly instead of always-hidden because capabilities are no longer universally null.
  - Plan 161-06 (Oracle UAT 3/3) — CatBot `list_llm_models` already passing per the evidence above; `set_catbot_llm` flow will also now see canonical caps during validation.
- **Deferred for v30.1:** Resolver layer consulting `model_aliases` remains the strategic fix; 161-01 is explicitly tactical per plan objective. Phase 158 FQN drift (`claude-opus-4` vs `claude-opus-4-6`) logged to `deferred-items.md` — resolution path TBD.

## Self-Check: PASSED

- FOUND: `app/src/lib/db.ts` shortcut seed block at L4953-4972 (27 occurrences of claude-opus/claude-sonnet/gemini-main/gemma-local across the file — plan spec satisfied)
- FOUND: `app/src/lib/services/__tests__/model-catalog-capabilities-v30.test.ts` with `applyV30ShortcutSeed` helper + 6 new test cases
- FOUND: commit `e3269ba` (`feat(161-01): seed LiteLLM shortcut rows in model_intelligence`) on main
- FOUND: commit `8082dec` (`docs(161-01): log Phase 158 FQN data drift discovered during smoke verify`) on main
- VERIFIED: Docker smoke Q1+Q2 PASS (user approved); Q3 deferred to `deferred-items.md`
- VERIFIED: Live oracle VER-01 returned 4 shortcut rows with canonical capabilities via `list_llm_models`

---
*Phase: 161-ui-enrutamiento-oracle-e2e*
*Completed: 2026-04-22*
