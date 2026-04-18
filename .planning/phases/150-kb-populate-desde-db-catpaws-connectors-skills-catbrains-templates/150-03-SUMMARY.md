---
phase: 150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates
plan: 03
subsystem: infra
tags: [knowledge-base, kb-sync, cli, idempotence, detectBumpLevel, orphan-detection, stable-equal, better-sqlite3, yaml-parser, vitest]

# Dependency graph
requires:
  - phase: 150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates
    plan: "02"
    provides: "scripts/kb-sync-db-source.cjs populateFromDb with { created, updated, unchanged, orphans, skipped, files } return shape; _internal helpers (slugify, resolveShortIdSlug, deriveTags, buildIdMap, buildFrontmatter, buildBody, serializeYAML, renderFile, SUBTYPES, SUBTYPE_SUBDIR, SUBTYPE_TABLE, SELECTS, FIELDS_FROM_DB_BY_SUBTYPE, DEPARTMENT_MAP, CONNECTOR_TYPE_MAP, TYPE_TO_DOMAIN, _resetTaxonomyCache); 12 it.todo placeholders pending (6 for Plan 03, 6 for Plan 04)"
provides:
  - "scripts/kb-sync.cjs cmdFullRebuild now delegates to kb-sync-db-source.cjs.populateFromDb when --source db is present — Phase 149 reject is gone"
  - "CLI flags: --dry-run, --verbose, --only <subtype> with strict exit codes (0 success, 2 invalid args, 3 module-load or DB-open error)"
  - "canvases_active count added to both _index.json.header.counts (kb-sync.cjs) and the test expectation (kb-sync-cli.test.ts uses arrayContaining so no strict-shape break)"
  - "Stable-equal idempotence layer in writeResourceFile: second run on unchanged DB returns action='unchanged', no byte change, no mtime touch"
  - "Port of detectBumpLevel from app/src/lib/services/knowledge-sync.ts:721-819 to CJS — simplified to operate on the built frontmatter + body; MAJOR=subtype/mode/status-deprecated, MINOR=related[]/system_prompt-body, PATCH=anything else, NULL=stable-equal"
  - "Orphan detection scan pass: walks resources/<subtype>/*.md, WARN per orphan file, increments report.orphans, NEVER modifies or deletes (CONTEXT §D3)"
  - "Change_log tail-5 preservation on updates; reactivation (deprecated→active) clears deprecated_*"
  - "Live DB dry-run smoke: `node scripts/kb-sync.cjs --full-rebuild --source db --dry-run` → `PLAN: 66 to create, 0 to update, 0 unchanged, 0 orphans, 0 skipped` (Plan 04 baseline)"
  - "6 Plan 03 tests converted from it.todo to passing it: dry run reports counts, only subtype filter, exit 2 on invalid args, idempotent second run, detects single row change, orphan WARN, no delete"
  - "KB_SYNC_REPO_ROOT env var: robust better-sqlite3 resolver in kb-sync-db-source.cjs ascends from __dirname with env-override fallback — needed so tests can copy the module to tmpRepo/scripts/ and still resolve app/node_modules/better-sqlite3 from the real repo"
affects: [150-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stable-equal frontmatter diff via stripVolatile + stableStringify — excludes updated_at, updated_by, version, change_log, sync_snapshot. Keys sorted for order-independent comparison; arrays preserve order (serializer emits stable orders)."
    - "Body-diff for system_prompt detection: catpaw system_prompt is rendered in the Markdown body inside a fenced ```code``` block after `## System Prompt` heading (NOT in frontmatter). The bump detector extracts that block via regex from both cur and new bodies; inequality → minor bump."
    - "Mode change via body scan: catpaw/canvas mode is rendered as `- **Mode:** X` in the body. detectBumpLevel compares those lines — equal → not a major bump; differs → major. Frontmatter-only comparison wouldn't catch mode-as-body-only renders."
    - "Orphan = KB file whose short-id-slug is NOT in maps[subtype].values() for the current rebuild. Respects --only filter: when subtype is filtered out, its orphan scan is skipped too (consistent subset semantic)."
    - "Tail-5 change_log preservation: `[...prev, newEntry].slice(-5)` — matches Phase 149 convention without unbounded growth."
    - "Reactivation clearing: if curFm.status='deprecated' AND mergedFm.status='active', delete deprecated_at/by/reason — per RESEARCH Pitfall 8."
    - "Robust better-sqlite3 resolution via ascending-path lookup with KB_SYNC_REPO_ROOT env override — module stays relocatable when test harnesses copy scripts/ to a tmpdir."

key-files:
  created:
    - ".planning/phases/150-.../150-03-SUMMARY.md — this file"
    - ".planning/phases/150-.../deferred-items.md — log of 8 pre-existing unrelated test failures (knowledge-tree / knowledge-tools-sync)"
  modified:
    - "scripts/kb-sync.cjs (+66 lines, −5 lines) — cmdFullRebuild delegates on --source db, parses --dry-run/--verbose/--only, exit-code discipline, canvases_active in counts"
    - "scripts/kb-sync-db-source.cjs (+555 lines, −20 lines) — inline YAML parser (parseYAML + parseFile), stripVolatile + stableStringify + detectBumpLevel + bumpVersion, writeResourceFile with idempotence path, orphan scan in populateFromDb, exports updated, _resolveBetterSqlite3 function"
    - "app/src/lib/__tests__/kb-sync-db-source.test.ts (+ ~170 lines) — 6 it.todo → it (dry run reports counts, only subtype filter, exit 2 on invalid args, idempotent second run, detects single row change, orphan WARN)"
    - "app/src/lib/__tests__/kb-sync-cli.test.ts (~2 tests updated) — Test 10 / 10b: old Phase-149 reject assertion replaced with new module-load gate assertion (exit 3, `failed to load kb-sync-db-source.cjs`)"

key-decisions:
  - "CLI `--source db` path runs BEFORE the existing walk+index regeneration. In dry-run mode return early (no _index.json rewrite). In non-dry-run the walk runs after populate so _index.json reflects newly written files — matches RESEARCH Architecture Pattern 4 'zero-duplication' design."
  - "When `--only <subtype>` is set we still fall through to the global _index.json walker (not just the filtered subtype). This keeps the index consistent globally; partial-subtype rebuilds that fail to re-index the whole KB would leave stale entries for untouched subtypes — wrong behavior. Cost: one extra walk per invocation; negligible."
  - "detectBumpLevel reads the body as source-of-truth for system_prompt and mode rather than the DB row. Rationale: populateFromDb's inputs are already-computed frontmatter+body — duplicating the DB-row comparison here would require threading row through writeResourceFile. Body scan is self-contained and matches the semantic 'rendered view changed'."
  - "Body comparison uses `trimEnd()` on both sides to tolerate trailing-newline variations without falsely reporting a change. The serializer always terminates with a final newline, so this is a no-op in practice but survives an accidental editor open/save."
  - "stripVolatile key set intentionally does NOT include `related` or `source_of_truth` — those are structural contract fields; a change in them MUST trigger a bump. Only true timestamps/provenance metadata is volatile."
  - "Exit code 3 covers BOTH module-load failure AND DB open error (SQLITE_CANTOPEN / `DB not found`). Plan 04 can split these if needed; for now they're both 'environment/setup not ready' class."
  - "Updated Phase 149 Test 10 / 10b in kb-sync-cli.test.ts rather than adding new assertions. The old tests explicitly asserted `exit 1` + `/Fase 2/` — exactly the behavior Plan 03 removes. Keeping the old tests alongside new ones would require the CLI to emit both 'failed to load' AND 'Fase 2' literals, which is nonsensical. Clean update per plan's `No regression` boundary (regression = breaking an intentional contract; deliberately removing a now-obsolete stub rejection is not a regression)."
  - "Fix attempt count: 1 iteration on Task 1. The initial CLI wiring worked but better-sqlite3 couldn't resolve when the module was copied to tmpRepo/scripts/. Solution: ascending-path lookup + KB_SYNC_REPO_ROOT env var. Did NOT trigger Rule-4 (architectural) because the fix was self-contained in the module loader."

patterns-established:
  - "Idempotence contract: `{ created, updated, unchanged, orphans, skipped }` sum = rows-in-DB + orphan-files. Counts are disjoint per entity-subtype; a DB row produces exactly ONE action in a rebuild."
  - "Change attribution: every non-unchanged action appends exactly one change_log entry with author='kb-sync-bootstrap'. Plan 05/PRD Fase 5 can introduce other authors (human, tool-chain) but the bootstrap signature persists until overwritten."

requirements-completed: []
# KB-06, KB-08, KB-09 are materially progressing but NOT independently
# completable by Plan 03: KB-07 (validate-kb passes on generated files)
# is Plan 04's, and until that test passes the "reads 6 tables AND the
# output is schema-valid" invariant isn't closed. State.md will track.

# Metrics
duration: 6min
completed: 2026-04-18
---

# Phase 150 Plan 03: CLI Delegation + Idempotence + Orphan Detection Summary

**`scripts/kb-sync.cjs --full-rebuild --source db` now delegates to `populateFromDb`, layers stable-equal idempotence and orphan detection, and surfaces counts via a `PLAN:` line — 6 Plan 03 tests green (12/18 total), 6 remaining todo handed to Plan 04.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-18T17:01:03Z
- **Completed:** 2026-04-18T17:07:26Z
- **Tasks:** 2/2
- **Files created/modified:** 2 created + 4 modified = 6

## Accomplishments

- Wired `scripts/kb-sync.cjs` `cmdFullRebuild` to `scripts/kb-sync-db-source.cjs` `populateFromDb`. The Phase 149 `--source db` reject branch is gone; flag parsing (`--dry-run`, `--verbose`, `--only <subtype>`) routes to the module with correct exit-code discipline (0 success, 2 invalid args, 3 module-load or DB-open error).
- Added `canvases_active` to `_index.json.header.counts` (the 6th entity subtype was missing from Phase 149's 5-key shape). Phase 149 `kb-sync-cli.test.ts` used `arrayContaining` so no existing assertion broke.
- Implemented stable-equal idempotence in `writeResourceFile`: an existing file whose structural projection matches the computed frontmatter+body returns `action: 'unchanged'` without touching disk. Second-run-on-unchanged-DB test passes byte-identity assertion.
- Ported `detectBumpLevel` from `app/src/lib/services/knowledge-sync.ts:721-819` to CJS with a simplified rule table — major/minor/patch/null priority. Handles the case the TypeScript service can't: returning `null` when nothing changed.
- Added orphan scan pass after the main write loop. Walks `resources/<subtype>/` directories and emits `WARN orphan <subtype>/<file>.md (no DB row — left untouched)` for each file whose `short-id-slug` isn't in `maps[subtype].values()`. Increments `report.orphans`; NEVER modifies or deletes the file.
- Updated action-based report accounting: `create`/`would-create` → `created++`, `update`/`would-update`/`overwrite` → `updated++`, `unchanged` → `unchanged++`, `orphan` → handled in the scan pass.
- Preserved `created_at`/`created_by` from the existing file on updates (bootstrap re-runs should never alter initial provenance).
- Implemented `deprecated_at/by/reason` clearing when reactivating (deprecated → active transition) per RESEARCH Pitfall 8.
- Made `scripts/kb-sync-db-source.cjs`'s better-sqlite3 resolution robust against test-harness relocation: `_resolveBetterSqlite3()` ascends from `__dirname`, honors `KB_SYNC_REPO_ROOT` env override, and only returns on a `require.resolve`-validated path.
- Live DB dry-run smoke passed: `node scripts/kb-sync.cjs --full-rebuild --source db --dry-run` → `PLAN: 66 to create, 0 to update, 0 unchanged, 0 orphans, 0 skipped`. Plan 04 will layer `validate-kb.cjs` invocation to confirm the 66 would-be-created files are schema-compliant.

## Task Commits

1. **Task 1: CLI surgery — delegate `--source db`, parse flags, exit codes, canvases_active** — `7e3b4d8` (feat)
2. **Task 2: Idempotence + orphan detection — detectBumpLevel port, stable-equal diff, orphan scan** — `134c702` (feat)

**Plan metadata commit:** pending (SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md + deferred-items.md)

## Final `--full-rebuild --source db` command signature

```
node scripts/kb-sync.cjs --full-rebuild --source db [--dry-run] [--verbose] [--only <subtype>]

Flags (Phase 150 Plan 03 additions):
  --source db           Delegate to kb-sync-db-source.cjs.populateFromDb.
                        Without this, --full-rebuild keeps Phase 149 behavior
                        (regenerates _index.json from existing frontmatters).
  --dry-run             Report plan of changes (counts); do NOT write files
                        and do NOT regenerate _index.json. Exits 0.
  --verbose             Log each action: CREATE / UPDATE / UNCHANGED / ORPHAN.
                        Also toggles KB_SYNC_VERBOSE inside the module (Plan 02
                        tag-drop WARNs).
  --only <subtype>      Restrict populate to one of:
                        catpaw | connector | skill | catbrain |
                        email-template | canvas. Global _index.json walk still
                        runs after (index stays consistent KB-wide).

Exit codes:
  0                     Success (including dry-run).
  2                     Invalid args: missing --only value OR unknown subtype.
  3                     Module load failure (kb-sync-db-source.cjs missing or
                        unloadable) OR DB open error (SQLITE_CANTOPEN / "DB
                        not found").
  (1 reserved for Plan 04's validate-kb.cjs failure propagation.)

Output:
  Single line to stdout:
    PLAN: N to create, M to update, K unchanged, O orphans, S skipped
```

## Ported `detectBumpLevel` rule table (CJS, as committed)

Cross-check target for Plan 04's validator. Compared to `knowledge-sync.ts:721-819`, this port:
- Returns `null` (not `'patch'`) when stable-equal — essential for idempotence.
- Compares on the already-built frontmatter + body (Plan 02's outputs).
- Uses body-scan for system_prompt and mode (those fields are rendered in the body, not frontmatter).

| Bump level | Trigger                                                                                 |
|------------|-----------------------------------------------------------------------------------------|
| **null**   | `stripVolatile(curFm) === stripVolatile(newFm)` AND `curBody.trimEnd() === newBody.trimEnd()` |
| **major**  | `curFm.subtype !== newFm.subtype`                                                       |
| **major**  | `curFm.status === 'active'` AND `newFm.status === 'deprecated'`                         |
| **major**  | body `- **Mode:** X` differs between cur and new                                        |
| **minor**  | `stableStringify(curFm.related || []) !== stableStringify(newFm.related || [])`         |
| **minor**  | body `## System Prompt` fenced ```` ``` ```` block differs between cur and new          |
| **patch**  | anything else structural (description, tags, times_used, any non-stable-equal diff)     |

Volatile keys excluded from the structural diff:
```
updated_at, updated_by, version, change_log, sync_snapshot
```

## Live DB dry-run baseline (for Plan 04)

Recorded 2026-04-18T17:07:00Z on dev DB `app/data/docflow.db`:

```
$ node scripts/kb-sync.cjs --full-rebuild --source db --dry-run
PLAN: 66 to create, 0 to update, 0 unchanged, 0 orphans, 0 skipped
```

**Breakdown (by SELECTS[subtype].count on live DB):**
- catpaws: 9 + connectors: 6 + skills: 39 + catbrains: 1 + email-templates: 9 + canvases: 2 = **66**

Plan 04 asserts: after the first real `--full-rebuild --source db` on live DB, `validate-kb.cjs` exits 0 and these 66 files pass schema validation.

## 6 remaining `.todo` tests handed to Plan 04

Per `app/src/lib/__tests__/kb-sync-db-source.test.ts` lines 913-919 (at commit `134c702`):

| Plan 04 test                              | Requirement | What it asserts                                                                         |
|-------------------------------------------|-------------|-----------------------------------------------------------------------------------------|
| `validate-kb passes on generated files`   | KB-07       | After `populateFromDb`, spawn `scripts/validate-kb.cjs` on the generated KB — exit 0.  |
| `canvases_active count`                   | KB-10       | `_index.json.header.counts.canvases_active` populated correctly from generated files.  |
| `header md has all counts`                | KB-10       | `_header.md` regenerated with all 6 resource counts (requires TODO at kb-sync.cjs:526). |
| `no connector config leak`                | KB-11       | `LEAK-A` / `LEAK-B` / `localhost:8765` literals never appear in any generated .md.     |
| `no flow_data leak`                       | KB-11       | `CANVAS-FLOW-LEAK` / `CANVAS-THUMB-LEAK` literals never appear in any generated .md.   |
| `no template structure leak`              | KB-11       | `BINARY-BLOB-MUST-NOT-LEAK` / `HTML-LEAK` literals never appear in any generated .md.  |

## Test progress — 12/18 green, 6 todo

| Plan | Test name                                     | Status |
|------|-----------------------------------------------|--------|
| 01   | createFixtureDb fixture validation            | ✅ Pass |
| 02   | writes files from 6 tables                    | ✅ Pass |
| 02   | dry run empty DB                              | ✅ Pass |
| 02   | tag derivation                                | ✅ Pass |
| 02   | short-id collision resolved                   | ✅ Pass |
| 02   | related cross-entity                          | ✅ Pass |
| **03** | **dry run reports counts**                  | **✅ Pass (7e3b4d8)** |
| **03** | **only subtype filter**                     | **✅ Pass (7e3b4d8)** |
| **03** | **exit 2 on invalid args**                  | **✅ Pass (7e3b4d8)** |
| **03** | **idempotent second run**                   | **✅ Pass (134c702)** |
| **03** | **detects single row change**               | **✅ Pass (134c702)** |
| **03** | **orphan WARN, no delete**                  | **✅ Pass (134c702)** |
| 04   | validate-kb passes on generated files         | ⏳ todo |
| 04   | canvases_active count                         | ⏳ todo |
| 04   | header md has all counts                      | ⏳ todo |
| 04   | no connector config leak                      | ⏳ todo |
| 04   | no flow_data leak                             | ⏳ todo |
| 04   | no template structure leak                    | ⏳ todo |

## Decisions Made

1. **`--only <subtype>` falls through to global `_index.json` walker.** The only way to keep the index consistent with disk state is to re-walk everything. Documented in the CLI inline comment. Cost: one extra `walkKB` per invocation — negligible vs correctness.

2. **Mode/system_prompt diff via body scan, not DB row threading.** The writer receives frontmatter + body — threading the raw row through all call sites just to detect bumps would duplicate code. Regex against the rendered body is self-contained and matches the "rendered view changed" semantic the change_log entry describes.

3. **Phase 149 Tests 10/10b updated in place.** These tests asserted `exit 1` + `/Fase 2/` stderr — precisely the behavior Plan 03 removes. Keeping them would require emitting both the old rejection literal AND the new module-load error, which is incoherent. Updated to assert the new module-load gate (exit 3, `failed to load kb-sync-db-source.cjs`) + explicit negative assertion `.not.toMatch(/Fase 2/)`. Documented in the test file with Phase 150 Plan 03 comment.

4. **KB_SYNC_REPO_ROOT env var over symlink hack.** Alternative was symlinking `tmpRepo/app/node_modules → realRepo/app/node_modules` in `beforeEach`. Symlinks are brittle across OS/filesystems; the env var is explicit and self-documenting. Precedent: Plan 02's `DATABASE_PATH` honors the same override pattern as `app/src/lib/db.ts`.

5. **Exit code 3 for both module-load and DB-open errors.** Plan 04 can split these if validator integration demands finer granularity. For now they're both "setup/environment not ready" — same class from the user's perspective.

6. **`created_at` preservation on updates.** An update that wrote fresh timestamps would violate the "this file was created once, here's when" invariant. The `change_log` already captures per-bump dates; `created_at` stays frozen at initial-write value.

7. **stripVolatile key set excludes structural keys `related` and `source_of_truth`.** Only real timestamps/provenance metadata is considered volatile. A change in `related` (relationship delta) or `source_of_truth.fields_from_db` (schema contract delta) MUST trigger a bump.

## Deviations from Plan

**None structural.** Both tasks executed exactly as the plan's `<action>` blocks specified, modulo two small implementation details the plan didn't spell out:

- **`_resolveBetterSqlite3` helper in `scripts/kb-sync-db-source.cjs`.** The plan assumed the relative `require(path.resolve(__dirname, '..', 'app', 'node_modules', 'better-sqlite3'))` from Plan 02 would still work when the test harness copies the module to `tmpRepo/scripts/`. It doesn't — tmpRepo has no `app/node_modules`. The fix is an ascending-path lookup with `KB_SYNC_REPO_ROOT` env override, documented inline. No scope creep, no architectural impact. (Rule-3 auto-fix: missing path-resolution robustness.)

- **Test 10/10b updates in `app/src/lib/__tests__/kb-sync-cli.test.ts`** (already detailed in Decision 3). The plan listed `kb-sync-cli.test.ts` only as a `canvases_active` regression target (via `arrayContaining` tolerance, which held). It didn't explicitly call out Tests 10/10b needing re-assertion. Caught at the first full-suite run of Task 1; updated in the Task 1 commit.

## Issues Encountered

- **Module load failure in test harness.** First Task 1 run: 3 tests passed → 1 + 2 failed with exit 3. Root cause: copied module couldn't resolve `better-sqlite3`. Fixed in ~5 minutes by making the resolver ascend `__dirname` and honor `KB_SYNC_REPO_ROOT`. 1 fix iteration total.
- **8 pre-existing failures in `knowledge-tree.test.ts` / `knowledge-tools-sync.test.ts`.** Verified pre-existing via `git stash && npx vitest run <those-files>` reproduced the same 8 failures. Logged to `deferred-items.md` per GSD deviation scope boundary — **not Plan 03's responsibility**. Phase 7 PRD territory (old knowledge tree subsystem that `.docflow-kb/` will eventually replace).

## User Setup Required

None — no external service configuration, no npm install, no Docker changes. The CLI runs on bare Node 20+ with `app/node_modules/` already present (Phase 149 set that up).

## Next Phase Readiness

- **Plan 150-04 unblocked:**
  - `populateFromDb` + CLI contract is stable and tested end-to-end on live DB.
  - 6 `.todo` tests are ready to convert: `validate-kb passes on generated files`, `canvases_active count`, `header md has all counts`, `no connector config leak`, `no flow_data leak`, `no template structure leak`.
  - Live DB dry-run baseline recorded: 66 files would be written. Plan 04 asserts the actual run + validator together.
  - `_header.md` regeneration is the one remaining gap (TODO comment at `scripts/kb-sync.cjs:526`). Plan 04 implements this + hooks `validate-kb.cjs` at end of rebuild.
  - Exit code 1 is reserved for Plan 04's validate-kb.cjs failure propagation.
- **Immediate tooling upshot:** `node scripts/kb-sync.cjs --full-rebuild --source db --verbose` will write 66 real files to `.docflow-kb/resources/*/` after Plan 04 confirms schema compliance. CatBot oracle test (CONTEXT §D4 Nivel 2) can then be executed against the populated KB.

## Self-Check: PASSED

**Files verified:**
- FOUND: scripts/kb-sync.cjs
- FOUND: scripts/kb-sync-db-source.cjs
- FOUND: app/src/lib/__tests__/kb-sync-db-source.test.ts
- FOUND: app/src/lib/__tests__/kb-sync-cli.test.ts
- FOUND: .planning/phases/150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates/150-03-SUMMARY.md (this file)
- FOUND: .planning/phases/150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates/deferred-items.md

**Commits verified:**
- FOUND: 7e3b4d8 (Task 1 — CLI surgery + 3 tests)
- FOUND: 134c702 (Task 2 — idempotence + orphan + 3 tests)

**Test verification:**
- kb-sync-db-source.test.ts: 12/18 pass, 6 todo (1 fixture + 5 Plan 02 + 6 Plan 03)
- knowledge-sync.test.ts: 38/38 pass (Phase 149 + 150-01 regression guard)
- kb-sync-cli.test.ts: 13/13 pass (2 tests updated for new delegation behavior)

**Live DB smoke verified:**
- `node scripts/kb-sync.cjs --full-rebuild --source db --dry-run` → exit 0, output `PLAN: 66 to create, 0 to update, 0 unchanged, 0 orphans, 0 skipped`

**Pre-existing failures acknowledged (out of scope):**
- 8 failures in `knowledge-tree.test.ts` / `knowledge-tools-sync.test.ts` — logged to deferred-items.md, verified pre-existing via git stash test.

---
*Phase: 150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates*
*Plan: 03*
*Completed: 2026-04-18*
