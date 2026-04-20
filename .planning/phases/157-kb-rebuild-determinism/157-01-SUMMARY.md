---
phase: 157-kb-rebuild-determinism
plan: 01
subsystem: knowledge-base
tags: [kb-sync, rebuild-determinism, exclusion-list, archived-orphans, populateFromDb, tdd]

# Dependency graph
requires:
  - phase: 150-kb-populate-db
    provides: "populateFromDb skeleton + Pass-1/Pass-2 loops + _internal test surface"
  - phase: 156-kb-runtime-integrity
    provides: ".docflow-legacy/orphans/<subtype>/ archive layout (Phase 156-03)"
provides:
  - "loadArchivedIds(kbRoot) → Set<'<subtype>:<short-id-slug>'>"
  - "populateFromDb Pass-2 exclusion check (O(1)) + report.skipped_archived counter"
  - "CLI PLAN summary line includes 'skipped_archived: N'"
  - "Defensive no-resurrection guard for --full-rebuild --source db"
affects: [157-02-body-sections, 157-03-restore-docs-oracle, kb-audit, knowledge-sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exclusion at upstream layer (populateFromDb), not writer (writeResourceFile) — PRD §5.3 Lifecycle terminal archived"
    - "Cross-test module reuse via named export (createFixtureDb) from kb-sync-db-source.test.ts"
    - "Symlink real app/node_modules/better-sqlite3 into tmpRepo for CLI integration tests"
    - "console.warn → stderr + combined stdout+stderr capture (bash 2>&1) in execFileSync"

key-files:
  created:
    - "app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts"
  modified:
    - "scripts/kb-sync-db-source.cjs"
    - "scripts/kb-sync.cjs"

key-decisions:
  - "loadArchivedIds scans .docflow-legacy/ as SIBLING of kbRoot (path.resolve(kbRoot, '..', '.docflow-legacy', 'orphans')), NOT nested — Phase 157 RESEARCH Pitfall 1"
  - "report.skipped_archived is a NEW field separate from report.skipped (which counts missing id/name); both are tracked independently"
  - "Exclusion check placed in Pass-2 loop BEFORE buildFrontmatter/writeResourceFile — writer (line 1401-1482) remains untouched, matching RESEARCH Anti-Pattern guidance"
  - "Task 4 skipped_archived=0 on live DB is CORRECT: the 10 archived ids were already hard-deleted from DB by Phase 156-03 cleanup, so exclusion is a defensive no-op today. The non-resurrection invariant still holds — 0/10 files came back."
  - "Δ counts vs DB are orthogonal pre-existing gaps (domain/concepts/*.md counted as subtype entries; KB-44 duplicate-mapping on email-templates; 1 canvas orphan) — none from the commit 06d69af7 resurrection pathology"

patterns-established:
  - "Archived-orphan exclusion: scan .docflow-legacy/orphans/<subdir>/*.md at rebuild start; build O(1) Set<'<subtype>:<slug>'>; skip matching rows before frontmatter synthesis"
  - "TDD RED-GREEN discipline for rebuild determinism contracts: 4 tests (helper empty-state, helper multi-subdir, populateFromDb integration, CLI stdout+stderr)"

requirements-completed: [KB-46]

# Metrics
duration: 9min
completed: 2026-04-20
---

# Phase 157 Plan 01: Rebuild Exclusion Summary

**Exclusion-list guard for `kb-sync --full-rebuild --source db`: 10 archived files removed, `loadArchivedIds` helper + Pass-2 skip check + `report.skipped_archived` counter wired end-to-end, 4 new tests GREEN, rebuild confirms 0/10 resurrection.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-04-20T22:13:25Z
- **Completed:** 2026-04-20T22:22:16Z
- **Tasks:** 4
- **Files modified:** 62 (2 source scripts + 1 test file + 59 KB artifacts — the KB artifacts are idempotent rebuild output: 57 patch-bump updates + `_header.md` + `_index.json`)

## Accomplishments

- Removed 10 resurrected files (`git rm`) that commit 06d69af7's post-Phase-156 rebuild had resurrected (`.docflow-legacy/orphans/` copies remain untouched as source of truth).
- Implemented `loadArchivedIds(kbRoot)` helper that scans `.docflow-legacy/orphans/<subtype-subdir>/*.md` (SIBLING of `.docflow-kb/`, not nested) and returns `Set<"<subtype>:<short-id-slug>">`. Empty Set on missing legacy tree.
- Wired Pass-2 exclusion check in `populateFromDb` with O(1) `archivedIds.has(...)` lookup BEFORE `buildFrontmatter` / `writeResourceFile`, plus verbose `[archived-skip] <sub>/<slug>` warnings and a new `report.skipped_archived` counter.
- Extended CLI `PLAN` summary line to surface `skipped_archived: N` without breaking Phase 149 CLI tests.
- TDD discipline: 4 tests RED → GREEN (helper empty-state, helper multi-subdir, populateFromDb exclude integration, CLI `--dry-run --verbose` stdout/stderr).
- Verified rebuild against live DB (`/home/deskmath/docflow-data/docflow.db`): 0/10 files resurrected under `.docflow-kb/resources/` (canonical `source_of_truth.id` check).

## Task Commits

1. **Task 1: git rm 10 resurrected files + atomic cleanup commit** — `81e8893` (chore)
2. **Task 2: Wave-0 RED tests (loadArchivedIds + populateFromDb + CLI integration)** — `f155865` (test — RED)
3. **Task 3: Implement loadArchivedIds + Pass-2 exclude + report.skipped_archived** — `b84d397` (feat — GREEN)
4. **Task 4: --full-rebuild --source db execution + Δ verification** — `ef363df` (feat)

**Plan metadata:** pending (final commit includes SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md).

## Files Created/Modified

- `app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` — 4 tests for the exclusion contract (created, 384 lines).
- `scripts/kb-sync-db-source.cjs` — `loadArchivedIds` helper (40 LOC) + `populateFromDb` archivedIds load + Pass-2 exclude check + `report.skipped_archived` field + `_internal.loadArchivedIds` export. +49 insertions / -1 deletion.
- `scripts/kb-sync.cjs` — PLAN summary line extended with `, skipped_archived: ${report.skipped_archived ?? 0}`. +3 insertions / -1 deletion.
- `.docflow-kb/**` — 59 files regenerated by Task 4 rebuild: `_index.json`, `_header.md`, 57 resource `.md` files with patch-bump updates (idempotent output — second run would be byte-identical).
- `.docflow-kb/resources/{catpaws,canvases,skills,connectors}/` — 10 files DELETED via `git rm` (Task 1): 72ef0fe5, 7af5f0a7, 96c00f37, 98c3f27c, a56c8ee8, a78bb00b (catpaws), 5a56962a, 9366fa92 (canvases), 4f7f5abf (skills), conn-gma-info-educa360 (connectors).

## Counts (Task 4 Rebuild vs DB)

| Entity              | KB header.counts | DB COUNT | Δ    | Notes                                                          |
| ------------------- | ---------------: | -------: | ---: | -------------------------------------------------------------- |
| catpaws_active      |               40 |       39 |  +1  | `domain/concepts/catpaw.md` counted (Phase 152 design)         |
| connectors_active   |               12 |       12 |   0  | ✓                                                              |
| skills_active       |               43 |       43 |   0  | ✓                                                              |
| catbrains_active    |                4 |        3 |  +1  | `domain/concepts/catbrain.md` counted (Phase 152 design)       |
| templates_active    |               16 |       15 |  +1  | KB-44 duplicate-mapping pathology (deferred to v29.2)          |
| canvases_active     |                2 |        1 |  +1  | Pre-existing orphan `e938d979-phase-156-verify.md`             |

**All Δ values are orthogonal to Bug A.** No resurrection of the 10 archived files occurred (canonical `source_of_truth.id ∈ DB` check: only 1 pre-existing orphan in canvases, not in our 10-file target list).

Task 4 log line (live DB): `PLAN: 0 to create, 57 to update, 56 unchanged, 2 orphans, 0 skipped, skipped_archived: 0`. The `0` for `skipped_archived` is the defensive no-op — the 10 archived ids have no matching DB rows because Phase 156-03 already hard-deleted them at archive time. The exclusion stays in place to guard against future re-insertions and against any pre-cleanup DB snapshot.

## Decisions Made

1. **Place `loadArchivedIds` next to `loadCatbrainRelations` (line 286 area), not `slugify`.** All `load*` helpers co-locate naturally; slugify is a different layer.
2. **Use `SUBTYPE_SUBDIR[sub].split('/').pop()` to derive legacy subdir name.** Keeps the legacy→KB mapping in one place (the existing `SUBTYPE_SUBDIR` table) — no duplicated hardcoded list of subdir names.
3. **Keep `writeResourceFile` untouched.** Exclusion lives UPSTREAM in `populateFromDb` per Phase 157 RESEARCH §Architecture Patterns; writer stays a pure byte-writer. Also simpler to reason about: one place to maintain the exclusion list.
4. **New `report.skipped_archived` field, not reuse of `report.skipped`.** Semantic clarity: `skipped` counts missing id/name (data integrity), `skipped_archived` counts archived-by-design (lifecycle).
5. **Test 4 captures stdout+stderr via `bash -c '... 2>&1'`.** Node `console.warn` writes to stderr by default; `execFileSync` needs explicit redirection to catch `[archived-skip]` WARN lines.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] CLI summary line missing `skipped_archived` token**
- **Found during:** Task 3 (Test 4 assertion `/skipped_archived\s*[:=]\s*1/` failed on stdout with exit code 3).
- **Issue:** The plan's Task 3 action spec only added the field to `report` in `kb-sync-db-source.cjs`; `scripts/kb-sync.cjs` still formatted its `PLAN:` log with the Phase-150 field set (`created, updated, unchanged, orphans, skipped`). Test 4 couldn't match `skipped_archived` in the CLI output.
- **Fix:** Extended the PLAN summary format in `scripts/kb-sync.cjs` line 568 (`${report.skipped_archived ?? 0}` suffix) while preserving the Phase 149 prefix the existing `kb-sync-cli.test.ts` asserts against. Phase 149 tests remain 13/13 GREEN.
- **Files modified:** `scripts/kb-sync.cjs`.
- **Verification:** Task 3 `vitest run` 4/4 GREEN; Task 4 manual rebuild shows `... skipped, skipped_archived: 0` in CLI stdout.
- **Committed in:** `b84d397` (Task 3 GREEN commit).

**2. [Rule 3 - Blocking] CLI integration test — better-sqlite3 native binding resolution in tmpRepo**
- **Found during:** Task 2 (Test 4 RED first run — `cannot locate better-sqlite3. Tried: ...`).
- **Issue:** `_resolveBetterSqlite3` ascends from `__dirname` looking for `app/node_modules/better-sqlite3`. When `kb-sync.cjs` is spawned from `tmpRepo/scripts/`, `__dirname` is `/tmp/kbrebdet-xxx/scripts/` with no sibling `node_modules`. The resolver's `KB_SYNC_REPO_ROOT` env branch still only looks at `<root>/app/node_modules/better-sqlite3`, so `tmpRepo` without an `app/node_modules/` tree can't resolve.
- **Fix:** Symlink the real `app/node_modules/better-sqlite3` into `tmpRepo/app/node_modules/` in `beforeEach`. Self-contained (no mock, no stub), uses the real prebuilt binding.
- **Files modified:** `app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` (fixture harness).
- **Verification:** Test 4 passes with exit code 0 and correct stdout.
- **Committed in:** `b84d397` (Task 3 GREEN commit — fix bundled with the test file change).

**3. [Rule 3 - Blocking] execFileSync stdout capture missed stderr-routed WARN**
- **Found during:** Task 3 (Test 4 `/\[archived-skip\]\s+catpaw\//` still failed after symlink fix).
- **Issue:** `console.warn` writes to stderr; Node's `execFileSync({encoding:'utf8'})` returns only stdout on success. The test failed because `[archived-skip]` lines went to stderr (discarded).
- **Fix:** Invoke via `bash -c '... 2>&1'` so the merged stream is captured as the return value.
- **Files modified:** `app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts`.
- **Verification:** Test 4 GREEN with `[archived-skip]` visible.
- **Committed in:** `b84d397` (Task 3 GREEN commit).

**Total deviations:** 3 auto-fixed (all Rule 3 blocking — test/CLI plumbing, no architectural changes).
**Impact on plan:** All auto-fixes bundled inside Task 3's GREEN commit (they are necessary for the 4 tests to verify the feature). No scope creep; no changes to the exclusion contract itself.

## Issues Encountered

- **skipped_archived=0 on live DB rebuild.** Plan's Task 4 `done` criteria anticipated `skipped_archived: 10` (assuming the 10 orphans still had DB rows). In reality Phase 156-03 already hard-deleted the rows when it archived them, so today there is nothing to exclude. The exclusion machinery is therefore a defensive no-op — correct behavior, not a regression. Non-resurrection invariant holds (0/10 files reappeared under `.docflow-kb/resources/`), which is the real success criterion. Documented in the Task 4 commit.
- **validate-kb.cjs 1 FAIL on pre-existing orphan.** `resources/canvases/e938d979-phase-156-verify.md` has `tag: mixed` which is not in `tag-taxonomy.json`. Non-blocking for Plan 01 (pre-existing Phase 156 residue, not created/modified by this plan). Plan 03 (restore-docs-oracle) can choose to clean this up or move it to `.docflow-legacy/orphans/`.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Ready for Plan 02 (body-sections / KB-47):**
- `populateFromDb` surface stable: no API changes beyond the new `skipped_archived` report field.
- `_internal` exports extended with `loadArchivedIds`, available if Plan 02 tests want to seed a legacy fixture.
- No new dependencies; no schema changes; `writeResourceFile` untouched (Plan 02's `buildBody` extension is a clean orthogonal change).

**Handoff notes for Plan 02:**
- Tests for Plan 02 can `import { createFixtureDb } from './kb-sync-db-source.test'` and `import { createFixtureLegacy }` pattern is inlined in Plan 01's test file (small helper, not yet exported — extract if reuse grows).
- If Plan 02 rebuilds mid-plan, expect another sweep of 57 idempotent patch bumps — that's the `isNoopUpdate` pre-existing Phase 150/153 cosmetic issue (documented in STATE decisions).

**Blockers:** None for Plan 02. KB-44 duplicate-mapping (email-templates +1) and the pre-existing canvas orphan `e938d979` remain as orthogonal v29.2 gaps, not Plan 02 prerequisites.

---
*Phase: 157-kb-rebuild-determinism*
*Completed: 2026-04-20*

## Self-Check: PASSED

- [x] All 4 task commits exist on `main` (`81e8893`, `f155865`, `b84d397`, `ef363df`).
- [x] `app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` created (4 tests GREEN).
- [x] `scripts/kb-sync-db-source.cjs` exports `loadArchivedIds` via `_internal`; `populateFromDb` loads archivedIds and applies Pass-2 exclude with `report.skipped_archived` counter.
- [x] `scripts/kb-sync.cjs` PLAN summary line surfaces `skipped_archived`.
- [x] `.planning/phases/157-kb-rebuild-determinism/157-01-SUMMARY.md` created.
- [x] No resurrection: git ls-files `.docflow-kb/resources/` shows 0 matches for the 10 archived file prefixes.
- [x] `.docflow-legacy/orphans/` copies intact (source of truth preserved).
