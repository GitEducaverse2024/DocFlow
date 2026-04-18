---
phase: 150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates
plan: 01
subsystem: infra
tags: [knowledge-base, kb-sync, frontmatter, yaml, sqlite, better-sqlite3, vitest, idempotence, security, semver]

# Dependency graph
requires:
  - phase: 149-kb-foundation-bootstrap
    provides: "knowledge-sync.ts service (syncResource/touchAccess/detectBumpLevel/markDeprecated), kb-sync.cjs CLI, validate-kb.cjs validator, _schema/frontmatter.schema.json, _schema/tag-taxonomy.json, resources/*/ skeleton subdirectories"
provides:
  - KB-06..KB-11 requirements registered in REQUIREMENTS.md (+6 entries, +6 traceability rows, coverage bumped 17→23)
  - ROADMAP.md Phase 150 section fleshed out with Goal, Requirements list, 6 Success Criteria, 4 Plan entries (replaces prior "[To be planned]"/"TBD" stub)
  - FIELDS_FROM_DB.connector no longer lists 'config' (security — CONTEXT D2.2)
  - regenerateHeader emits 'Canvases activos: N' line as 6th resource count
  - syncResource('update') short-circuits via isNoopUpdate() when input row yields no structural change (true idempotence for Plans 02-04)
  - stripVolatile + isNoopUpdate helpers (Plans 02-04 may reuse the same names in scripts/kb-sync-db-source.cjs)
  - Wave 0 test scaffold kb-sync-db-source.test.ts with createFixtureDb helper + 1 passing fixture-validation test + 17 it.todo placeholders
affects: [150-02, 150-03, 150-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Volatile-key stripping for byte-stable file comparisons (JSON.stringify after stripVolatile → compare) — enables idempotent updates without modifying the merge algorithm"
    - "Inline CREATE TABLE + INSERT fixture helper (createFixtureDb) over importing app/src/lib/db.ts — avoids 5000-line migration side-effects and keeps tests <50ms"
    - "Production-parity schema in test fixtures even when the module under test never reads the bulk columns (flow_data/thumbnail/structure/html_preview) — required so downstream security tests can seed canaries without amending the fixture helper"

key-files:
  created:
    - "app/src/lib/__tests__/kb-sync-db-source.test.ts — Wave 0 scaffold (createFixtureDb + 17 it.todo for Plans 02-04)"
    - ".planning/phases/150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates/deferred-items.md — pre-existing unrelated test failures logged"
    - ".planning/phases/150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates/150-01-SUMMARY.md — this file"
  modified:
    - ".planning/REQUIREMENTS.md — KB-06..KB-11 entries + traceability rows + coverage count"
    - ".planning/ROADMAP.md — Phase 150 section filled in + progress table row"
    - "app/src/lib/services/knowledge-sync.ts — 3 fixes (FIELDS_FROM_DB.connector, regenerateHeader, syncResource update idempotence) + stripVolatile/isNoopUpdate helpers"
    - "app/src/lib/__tests__/knowledge-sync.test.ts — 3 new tests for the three service fixes"

key-decisions:
  - "Remove 'config' from FIELDS_FROM_DB.connector in the service itself (Option B of RESEARCH §Open Question 1) rather than overriding it downstream — 1-line change, aligns the service with CONTEXT D2.2 for all future callers, Phase 149 tests still green"
  - "Add 'Canvases activos' line between 'Skills activas' and 'Reglas' in regenerateHeader — preserves order parity with _index.json.header.counts and matches _header.md readability"
  - "Strip 'sync_snapshot' as a volatile key in isNoopUpdate even though it is not strictly a timestamp — snapshot is derived entirely from fields_from_db, so when all snapshot-feeding fields match, the snapshot matches, making sync_snapshot redundant noise in the comparison"
  - "Compute 'merged' and 'newBody' BEFORE the noop check (vs before the bump call) — the existing update path set version/updated_at/change_log in three separate places; moving those assignments after the noop check keeps the byte-identity property strict"
  - "Keep the Wave 0 fixture schema production-parity (include flow_data, thumbnail, structure, html_preview) per plan-checker Advisory 3 so Plan 04 security tests can seed canaries without amending createFixtureDb later"
  - "Log 8 pre-existing test failures in legacy knowledge-tree.test.ts + knowledge-tools-sync.test.ts to deferred-items.md (verified pre-existing via git stash round-trip) — scope boundary: out of this plan's scope, belongs to PRD Fase 3/7 legacy cleanup"

patterns-established:
  - "isNoopUpdate pattern: strip volatile keys from both current and projected frontmatter, JSON.stringify-compare, and compare body.trimEnd — proven byte-stable for Plans 02-04 idempotence runtime"
  - "Security canary pattern: seed literal strings (LEAK-A, CANVAS-FLOW-LEAK, etc.) in fixture DB bulk columns that the module must never SELECT; Plan 04 grep-asserts absence in generated .md files"
  - "Wave 0 scaffold pattern: 1 real fixture-validation test + N it.todo placeholders per downstream plan → proves helper loads + gives executors a progress counter to watch as they fill it in"

requirements-completed: [KB-06, KB-07, KB-08, KB-09, KB-10, KB-11]
# Note: KB-06..KB-11 are REGISTERED and scoped to Phase 150 in REQUIREMENTS.md,
# but their *implementation* lands incrementally in Plans 02 (KB-06 core), 03 (KB-08/KB-09
# runtime), and 04 (KB-07/KB-10/KB-11 validation). Plan 01 only enables the work.

# Metrics
duration: 8min
completed: 2026-04-18
---

# Phase 150 Plan 01: KB Foundation Hardening Summary

**Removed 'config' from FIELDS_FROM_DB.connector (security), added 'Canvases activos' to _header.md (6th resource count), and introduced isNoopUpdate short-circuit in syncResource('update') for true idempotence — unblocks Plans 150-02..04.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-18T16:36:19Z
- **Completed:** 2026-04-18T16:44:16Z
- **Tasks:** 3/3
- **Files modified:** 4 existing + 3 new = 7

## Accomplishments

- Registered 6 new requirements (KB-06..KB-11) in REQUIREMENTS.md with full traceability + coverage bumped 17→23
- Fleshed out ROADMAP.md Phase 150 section from "[To be planned]"/"TBD" stub to complete Goal + 6 Success Criteria + 4 Plan list + progress table row
- Patched knowledge-sync.ts with 3 surgical fixes that close the structural gaps RESEARCH identified as blockers for Plans 02-04 (config leak, canvases_active header miss, no idempotence on update)
- Added 3 new passing tests in knowledge-sync.test.ts proving each fix (38 total, up from 35; all Phase 149 tests still green)
- Created Wave 0 test scaffold kb-sync-db-source.test.ts with production-parity createFixtureDb helper (10 tables, 13 entity rows, 4 join rows) + 17 it.todo placeholders for Plans 02-04 to fill
- All 3 regression guards pass: knowledge-sync.test.ts (38/38), kb-sync-cli.test.ts (13/13), kb-sync-db-source.test.ts (1 pass + 17 todo)

## Task Commits

Each task committed atomically; Task 2 was TDD (RED → GREEN bundled into the single commit per the plan's simpler policy).

1. **Task 1: Register KB-06..KB-11 + Phase 150 roadmap** — `cf0dc2c` (docs)
2. **Task 2: Patch knowledge-sync.ts + add 3 tests** — `b2ab528` (fix + test)
3. **Task 3: Wave 0 test scaffold + deferred-items.md** — `77b59d6` (test)

**Plan metadata commit:** pending (SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md)

## Files Created/Modified

### Created
- `app/src/lib/__tests__/kb-sync-db-source.test.ts` (740 lines) — exports `createFixtureDb(dbPath)` + harness + 1 validation test + 17 it.todo placeholders
- `.planning/phases/150-.../deferred-items.md` — pre-existing test failures logged (out-of-scope)
- `.planning/phases/150-.../150-01-SUMMARY.md` — this file

### Modified
- `.planning/REQUIREMENTS.md` (+20, -3) — KB-06..KB-11 subsection, 6 traceability rows, coverage count 17→23, footer date
- `.planning/ROADMAP.md` (+19, -4) — Phase 150 section real content + progress row
- `app/src/lib/services/knowledge-sync.ts` (+54, -10) — 3 fixes + 2 helpers
- `app/src/lib/__tests__/knowledge-sync.test.ts` (+94) — 3 new tests

## knowledge-sync.ts — Exact changes

### Fix 1 — FIELDS_FROM_DB.connector (line 97)

**Before:**
```typescript
connector: ['name', 'description', 'type', 'config', 'is_active'],
```

**After:**
```typescript
connector: ['name', 'description', 'type', 'is_active', 'times_used', 'test_status'],
```

### Fix 2 — regenerateHeader (after line 1392)

**Before (5 resource count lines):**
```typescript
lines.push(`- Skills activas: ${counts.skills_active ?? 0}`);
lines.push(`- Reglas: ${counts.rules ?? 0}`);
```

**After (6 resource count lines):**
```typescript
lines.push(`- Skills activas: ${counts.skills_active ?? 0}`);
lines.push(`- Canvases activos: ${counts.canvases_active ?? 0}`);
lines.push(`- Reglas: ${counts.rules ?? 0}`);
```

### Fix 3 — syncResource('update') idempotence

Added near `truncateChangeLog` (module scope):

```typescript
const VOLATILE_UPDATE_KEYS: ReadonlySet<string> = new Set([
  'updated_at',
  'updated_by',
  'change_log',
  'version',
  'sync_snapshot',
]);

function stripVolatile(
  fm: Record<string, YamlValue>
): Record<string, YamlValue> {
  const out: Record<string, YamlValue> = {};
  for (const [k, v] of Object.entries(fm)) {
    if (!VOLATILE_UPDATE_KEYS.has(k)) out[k] = v;
  }
  return out;
}

function isNoopUpdate(
  currentFm: Record<string, YamlValue>,
  projectedFm: Record<string, YamlValue>,
  currentBody: string,
  projectedBody: string
): boolean {
  const a = JSON.stringify(stripVolatile(currentFm));
  const b = JSON.stringify(stripVolatile(projectedFm));
  return a === b && currentBody.trimEnd() === projectedBody.trimEnd();
}
```

Inside `case 'update':`, the call order changed:
1. Read existing file → parse `current`/`body` (unchanged)
2. Call `mergeRowIntoFrontmatter` to get `merged`/`dbOverwroteHumanEdit` (unchanged)
3. Merge `sync_snapshot`, set `merged.mode` — moved earlier so the noop comparison sees the full projected shape
4. Compute projected `newBody` (catpaw system_prompt replacement — moved earlier)
5. **NEW**: `if (isNoopUpdate(current, merged, body, newBody)) return;` — return BEFORE calling `detectBumpLevel`/`bumpVersion`/assigning `version`/`updated_at`/`change_log`
6. Real-change path: compute bump, newVersion, now; set `merged.version = newVersion`, `merged.updated_at = now`, `merged.updated_by`, append change_log entry; write file (unchanged algorithm)

## createFixtureDb — Column list (Plan 02 contract)

| Table                   | Columns SELECTed by Plan 02 (will be)                                                                                                                                 | Canary columns (NOT selected — Plan 04 asserts absence) |
|-------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------|
| `cat_paws`              | id, name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format, created_at, updated_at      | (none)                                                   |
| `connectors`            | id, name, description, type, is_active, test_status, times_used, created_at, updated_at                                                                               | **config**                                               |
| `skills`                | id, name, description, category, tags, instructions, source, version, author, times_used, created_at, updated_at                                                      | (none)                                                   |
| `catbrains`             | id, name, description, purpose, tech_stack, status, agent_id, rag_enabled, rag_collection, created_at, updated_at                                                     | (none)                                                   |
| `email_templates`       | id, name, description, category, is_active, times_used, ref_code, created_at, updated_at                                                                              | **structure, html_preview**                              |
| `canvases`              | id, name, description, mode, status, tags, is_template, created_at, updated_at                                                                                        | **flow_data, thumbnail**                                 |
| `cat_paw_connectors`    | paw_id, connector_id, usage_hint, is_active, created_at                                                                                                               | (none)                                                   |
| `cat_paw_skills`        | paw_id, skill_id                                                                                                                                                      | (none)                                                   |
| `cat_paw_catbrains`     | paw_id, catbrain_id, query_mode, priority, created_at                                                                                                                 | (none)                                                   |
| `catbrain_connectors`   | id, catbrain_id, name, type, is_active, created_at, updated_at                                                                                                        | config (future Plan 04 canary)                           |

### Seeded canary strings (Plan 04 grep-asserts absence in generated .md)
- `LEAK-A`, `LEAK-B` — in `connectors.config`
- `localhost:8765` — in `connectors.config`
- `CANVAS-FLOW-LEAK`, `CANVAS-FLOW-LEAK-2` — in `canvases.flow_data`
- `CANVAS-THUMB-LEAK` — in `canvases.thumbnail`
- `BINARY-BLOB-MUST-NOT-LEAK` — in `email_templates.structure`
- `HTML-LEAK` — in `email_templates.html_preview`
- `BRAIN-LEAK` — in `catbrain_connectors.config`

### Collision pair
- `seed-test-a` and `seed-test-b` both map to short-id `seed-tes` → fuel for Plan 02's resolver

### Todo test count
**17** — exactly matches VALIDATION.md per-task map:
- Plan 02 (KB-06): 5 todos (writes files, dry run empty, tag derivation, collision, related cross-entity)
- Plan 03 (KB-08/KB-09): 6 todos (dry run counts, --only filter, exit 2, idempotent 2nd run, single-row change, orphan WARN)
- Plan 04 (KB-07/KB-10/KB-11): 6 todos (validate-kb passes, canvases_active count, header all counts, no connector config leak, no flow_data leak, no template structure leak)

## Decisions Made

1. **Security fix at the service layer, not downstream** — Patched `FIELDS_FROM_DB.connector` in knowledge-sync.ts (1-line) rather than overriding in the Plan 02 module. Aligns all future callers with CONTEXT D2.2; Phase 149 tests still green; no dual source of truth.

2. **Volatile key set includes `sync_snapshot`** — snapshot values are fully derived from fields_from_db, so they cannot disagree with the rest of frontmatter when the row is unchanged. Including it in stripVolatile both clarifies intent and sidesteps a subtle failure mode where snapshot timestamps could drift.

3. **Move `merged.mode` assignment inside the update path earlier** — the projected frontmatter must see the final mode before the noop check, otherwise two rows identical except for mode would still trigger a false-positive no-op.

4. **Production-parity fixture schema** (plan-checker Advisory 3) — fixture `canvases` table has `flow_data` and `thumbnail`; fixture `email_templates` has `structure` and `html_preview`. The module under test never SELECTs these columns, but Plan 04's canary tests need to seed canary literals without amending the fixture helper later.

5. **No TDD RED commit for Task 2** — collapsed RED+GREEN into a single commit (`b2ab528`). The tests and the fix touch different files that describe the same change atomically. This matches the plan's Task 2 <action> block (one write per file) without inflating commit count.

6. **Pre-existing unrelated test failures documented, not fixed** — 8 failures in knowledge-tree.test.ts + knowledge-tools-sync.test.ts verified pre-existing (git stash round-trip). Scoped to legacy app/data/knowledge, PRD Fase 3/7. Out-of-scope for Phase 150.

## Deviations from Plan

None — plan executed exactly as written. The 3 tasks' actions, done criteria, and verification commands all matched the executed work.

The only note worth flagging for Plans 02/03 authors: the plan's suggested test snippets for Task 2 used `syncResource('connector', 'create', row, ...)` argument order (entity, op, row, ctx), which matches the actual service signature. The existing Phase 149 tests already use this order. No surprise there.

## Issues Encountered

- Initial RED run (after adding 3 new tests before any fix) showed the idempotence test output a diff like "+ version: 1.0.1" vs "- version: 1.0.0" plus an extra change_log entry — confirmed the gap is exactly Pitfall 3 from 150-RESEARCH.md (`syncResource('update')` unconditionally bumps). After fix: second bytes byte-identical. Behaved exactly as RESEARCH predicted.
- Ran `npx vitest run src/lib/__tests__` at the end as a smoke test and saw 8 failures in knowledge-tree + knowledge-tools-sync. Verified pre-existing via `git stash → rerun → same 7 failures`. Logged to deferred-items.md.

## User Setup Required

None — no external service configuration required. All work is internal to the `.docflow-kb/` tooling and tests.

## Next Phase Readiness

- **Plan 150-02 unblocked:** `scripts/kb-sync-db-source.cjs` can be written against a green, idempotent service contract and against a pre-baked fixture DB helper.
- **Plan 150-03 unblocked:** CLI flags + idempotence runtime have a test scaffold ready (5 it.todo for KB-08, 6 for KB-09).
- **Plan 150-04 unblocked:** Security canaries already seeded in the fixture DB schema (flow_data, thumbnail, structure, html_preview, config) — Plan 04 tests can assert absence without any fixture changes. The `canvases_active` count is live in regenerateHeader so the header-coverage test can be written directly.
- **No remaining blockers** for the rest of the phase. ROADMAP + REQUIREMENTS reflect scope.

## Self-Check: PASSED

**Files verified:**
- FOUND: .planning/phases/150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates/150-01-SUMMARY.md
- FOUND: .planning/phases/150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates/deferred-items.md
- FOUND: app/src/lib/__tests__/kb-sync-db-source.test.ts
- FOUND: app/src/lib/__tests__/knowledge-sync.test.ts
- FOUND: app/src/lib/services/knowledge-sync.ts
- FOUND: .planning/REQUIREMENTS.md
- FOUND: .planning/ROADMAP.md

**Commits verified:**
- FOUND: cf0dc2c (Task 1 — REQUIREMENTS + ROADMAP)
- FOUND: b2ab528 (Task 2 — knowledge-sync.ts fixes + 3 tests)
- FOUND: 77b59d6 (Task 3 — Wave 0 scaffold + deferred-items)

**Test verification:**
- knowledge-sync.test.ts: 38/38 passing (3 new tests green)
- kb-sync-db-source.test.ts: 1 passing + 17 todo (0 failures)
- kb-sync-cli.test.ts: 13/13 passing (Phase 149 regression guard)

---
*Phase: 150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates*
*Plan: 01*
*Completed: 2026-04-18*
