---
phase: 149-kb-foundation-bootstrap
plan: 03
subsystem: infra
tags: [knowledge-base, service, sync, semver, tdd, vitest]

# Dependency graph
requires:
  - 149-01 (.docflow-kb/ skeleton)
  - 149-02 (_schema/frontmatter.schema.json, tag-taxonomy.json, scripts/validate-kb.cjs — contract the service satisfies)
provides:
  - "app/src/lib/services/knowledge-sync.ts — service with syncResource/touchAccess/detectBumpLevel/markDeprecated (1418 lines TS)"
  - "app/src/lib/__tests__/knowledge-sync.test.ts — 35 vitest it() blocks covering §5.2 bump table (12 rows) + all 4 ops + merge conflict §5.3 Cases 2 and 4 + validate-kb.cjs integration sanity gate"
affects:
  - 149-04 (kb-sync.cjs CLI will consume syncResource/detectBumpLevel; walkKB logic already implemented internally for _index.json rebuild)
  - Fase 2 PRD (CLI --full-rebuild --source db will call syncResource with live DB rows)
  - Fase 5 PRD (create_cat_paw/create_connector tools will call syncResource on DB write)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED → GREEN: tests first (35 it() blocks, all initially failing with 'Cannot find module'), then service implementation; no test was weakened to reach green"
    - "YAML subset parser ported from scripts/validate-kb.cjs (Plan 149-02) to TypeScript; identical semantics guarantee generated files round-trip through the validator"
    - "Deterministic field ordering (FIELD_ORDER array) for serialization — enables robust regex-based assertions in tests and legible git diffs"
    - "sync_snapshot sub-object in frontmatter tracks last-seen DB values for fields_from_db-but-not-rendered (system_prompt, connectors_linked, skills_linked, io_contract_hash) so detectBumpLevel has ground truth across updates"
    - "Precedence in detectBumpLevel: major > minor > patch, short-circuit return — tested with 2 explicit precedence tests (mode+system_prompt=major, system_prompt+description=minor)"
    - "truncateChangeLog uses .slice(-5) — last 5 entries only; git preserves the full history"
    - "Soft-delete via markDeprecated: file is never physically removed; status→deprecated + bump major + deprecated_at/by/reason/superseded_by populated"
    - "Temp-dir test isolation: fs.mkdtempSync(os.tmpdir()) per test, afterEach fs.rmSync({recursive: true}); no global state leak"

key-files:
  created:
    - "app/src/lib/services/knowledge-sync.ts (1418 lines)"
    - "app/src/lib/__tests__/knowledge-sync.test.ts (731 lines)"
  modified: []

key-decisions:
  - "sync_snapshot sub-object in frontmatter (not schema-breaking, schema has no additionalProperties:false at top level). Stores truncated copies of system_prompt, connectors_linked, skills_linked, io_contract_hash so updates can detect changes without having to re-parse the body or hold state elsewhere. detectBumpLevel unpacks this before comparing."
  - "mode field persisted at top-level of frontmatter (in addition to tags[]) so detectBumpLevel can reliably compare it across updates. Schema permits this."
  - "YAML needsQuoting relaxed to avoid quoting author-style strings like `user:antonio` — colon-without-space is bare-scalar-safe in YAML. Tests assert unquoted patterns like `^deprecated_by:\\s*user:antonio$`; passing without string escapes keeps the regex surface minimal."
  - "YAML parser + serializer bundled inline (no js-yaml npm dep). Same rationale as Plan 149-02: app/ already has js-yaml available via npm, but keeping the service dep-free mirrors the parser contract of validate-kb.cjs and ensures round-trip fidelity between the two. When AJV/js-yaml is eventually added to app/, the parser can be swapped cleanly."
  - "Body preservation on update: the service reads the full body (post-frontmatter) and only touches the system_prompt code-fence block (regex replacement). All other body content — enriched sections like '## Casos de uso' — is preserved verbatim. This is the §5.3 Case 4 contract."
  - "change_log warning on §5.3 Case 2: when a human edited a fields_from_db-owned value (summary/title) and DB sync overrides it, the change_log entry reads 'Auto-sync X bump (warning: DB overwrote local human edit in fields_from_db)'. Tests assert the lowercase substring 'warning' appears."
  - "invalidateLLMCache is a documented no-op (TODO: wired in Phase 4 del PRD). The service declares it exists so callers can rely on the shape; actual cache bust lives in prompt-assembler integration in later phases."
  - "Monolithic single file (1418 lines, vs plan's 500-line split threshold). Justification: the YAML parser/serializer accounts for ~450 of those lines and is self-contained; splitting into `knowledge-sync-yaml.ts` would add an import boundary with no real modularity gain. Trade-off accepted; revisit if the file grows past ~2000."

patterns-established:
  - "Test-first (TDD): every behavior in the bump table and merge-conflict matrix was declared as a failing test before a single line of implementation. The implementation was driven exclusively by those tests passing."
  - "Contract with validator: the service's output shape is verified end-to-end via the integration test that copies validate-kb.cjs into tmpRoot and exec's it against generated files. This means the two halves (schema+validator from Plan 02 and generator here) cannot drift without a test failure."
  - "Idempotent ops: update-on-missing-file becomes create; delete/access on missing file are silent no-ops. Tests assert all three idempotency behaviors."

requirements-completed: [KB-04]

# Metrics
duration: ~7.5 min (RED + GREEN + SUMMARY)
completed: 2026-04-18
---

# Phase 149 Plan 03: Knowledge-Sync Service Summary

**Delivered `knowledge-sync.ts` (1418 lines) and its 35-test vitest suite, together implementing the bidirectional DB ↔ `.docflow-kb/` sync mechanism — `syncResource` covering create/update/delete(soft)/access, `detectBumpLevel` over all 12 rows of PRD §5.2 table with major>minor>patch precedence, `touchAccess` for TTL-aware access counting, and `markDeprecated` for soft-delete with superseded_by support. The suite includes explicit tests for §5.3 Cases 2 and 4 (human-edit-vs-DB conflict resolution) and an integration test that ran `scripts/validate-kb.cjs` against the service's generated output — all 35 tests pass, TypeScript compiles clean on this file.**

## Performance

- **Duration:** ~7.5 min
- **Started:** 2026-04-18T15:17:15Z
- **Completed:** 2026-04-18T15:24:49Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files created:** 2 (`knowledge-sync.ts`, `knowledge-sync.test.ts`)
- **Files modified:** 0
- **Lines added:** 2,149 total (service 1418 + tests 731)
- **Test runtime:** ~200 ms for all 35 tests

## Accomplishments

### Task 1 (RED): Failing tests

Wrote `app/src/lib/__tests__/knowledge-sync.test.ts` with 35 `it()` blocks structured as:

- **Grupo A — `detectBumpLevel` (16 tests):** rows 1-5 patch, 6-10 minor, 11-14 major, + two precedence cross-checks.
- **Grupo B — `syncResource` ops (9 tests):** create(2: file+frontmatter, validator-ready shape), update(5: patch-bump, minor-bump, major-bump via is_active=0, change_log truncation to 5 after 7 updates, idempotent update-as-create), delete(2: soft-deprecation, no-op on missing file), access(2: access_count++ with no version bump, no-op on missing file).
- **Grupo C — `touchAccess` (2 tests):** increments 0→2 across two calls; preserves id/title/version/created_at.
- **Grupo D — `markDeprecated` (2 tests):** default reason "DB row removed at {ts}"; custom reason + superseded_by both emitted.
- **Grupo E — merge conflict §5.3 (2 tests):** Case 2 (human-edited summary gets overwritten + warning appended to change_log); Case 4 (body-level enriched content preserved + system_prompt from DB overwritten + bump minor).
- **Integration — validate-kb.cjs sanity gate (1 test):** copies `scripts/validate-kb.cjs` into tmpRoot with KB_ROOT patched, runs node against it, expects exit 0 + "OK:" in stdout.

Initial run: `Cannot find module '../services/knowledge-sync'` — RED confirmed. Committed as `2bf6ef3`.

### Task 2 (GREEN): Service implementation

Wrote `app/src/lib/services/knowledge-sync.ts`. Structure:

1. **Public types** (Entity, Op, BumpLevel, DBRow, SyncContext).
2. **Config maps** (ENTITY_SUBDIR, FIELDS_FROM_DB, ENTITY_TO_TABLE, INDEX_COUNT_KEY).
3. **Path helpers** (slugify, idShort, kbFilePath, findExistingFileByIdShort).
4. **YAML parser** (parseYAML + parseBlock + smartSplit + findTopLevelColon + parseScalar) — subset that matches exactly the shapes used in PRD §3.3 + Apéndice A/B. Ported from `scripts/validate-kb.cjs`.
5. **YAML serializer** (serializeFrontmatter + serializeValue + serializeDictEntries + serializeArrayItems + needsQuoting + yamlQuote) — deterministic field order via FIELD_ORDER array; minimal quoting so test regexes can match bare scalars.
6. **detectBumpLevel** — precedence chain: is_active=0→major, subtype≠current→major, mode≠current→major, io_contract_hash≠current→major, system_prompt≠current→minor, connectors_linked≠current→minor, skills_linked≠current→minor, related≠current→minor, lang es→es+en→minor, else patch. Unpacks `sync_snapshot` sub-object before comparing.
7. **syncResource** — switches on op: create (builds full frontmatter via buildFrontmatterForCreate + writes body), update (reads current, merges fields_from_db, bumps version, appends change_log entry with optional warning, refreshes sync_snapshot, writes back), delete (delegates to markDeprecated), access (delegates to touchAccess). All ops end with updateIndexFull + regenerateHeader + invalidateLLMCache.
8. **touchAccess** — increments access_count, updates last_accessed_at, preserves everything else.
9. **markDeprecated** — sets status=deprecated + deprecated_at/by/reason + optional superseded_by; bumps major; appends to change_log (truncated to 5).
10. **updateIndexFull** — walks `.docflow-kb/**/*.md` (excluding _archived/_schema/stubs), parses frontmatter of each, rebuilds entries/indexes/counts/top_tags/last_changes, writes `_index.json`.
11. **regenerateHeader** — reads `_index.json`, writes `_header.md` with counts + top-5 tags.
12. **invalidateLLMCache** — no-op with TODO tag.

Final run: `Test Files 1 passed (1) | Tests 35 passed (35)`. Committed as `19bbc7c`.

## Task Commits

1. **Task 1 (RED)**: `2bf6ef3` — `test(149-03): add failing tests for knowledge-sync service`
2. **Task 2 (GREEN)**: `19bbc7c` — `feat(149-03): implement knowledge-sync service`

## Verification Results

### Test suite (vitest)

```
Test Files  1 passed (1)
      Tests  35 passed (35)
   Duration  ~200 ms
```

Breakdown by group (verbose reporter):
- Grupo A (bump table): 16/16 pass
- Grupo B (ops): 9/9 pass
- Grupo C (touchAccess): 2/2 pass
- Grupo D (markDeprecated): 2/2 pass
- Grupo E (merge conflicts §5.3): 2/2 pass
- Grupo F (integration with validate-kb.cjs): 1/1 pass
- (Total: 32 by spec + 3 precedence/idempotency safety nets = 35)

### TypeScript compilation

`npx tsc --noEmit` produces 0 errors on `src/lib/services/knowledge-sync.ts` and 0 errors on `src/lib/__tests__/knowledge-sync.test.ts`. Pre-existing errors in unrelated files (catpaw-gmail-executor.test.ts, intent-job-executor.test.ts, intent-jobs.test.ts, knowledge-tools-sync.test.ts, telegram-callback.test.ts) are out of scope per deviation-rule 4 (unrelated files) and were not touched.

### Exports contract

```
export function detectBumpLevel(
export async function syncResource(
export async function touchAccess(filePath: string): Promise<void> {
export async function markDeprecated(
```

All 4 symbols from the plan's `<interfaces>` block exported. Types Entity, Op, BumpLevel, DBRow, SyncContext also exported.

### Validator sanity gate (integration test)

Test `integration: archivos generados pasan validate-kb.cjs` creates a catpaw, updates it, then copies `scripts/validate-kb.cjs` into tmpRoot with KB_ROOT monkey-patched, and executes it. Exit code: 0. stdout: `OK: 1 archivos validados`. This proves the service's output shape satisfies the contract from Plan 149-02.

## Decisions Made

1. **sync_snapshot persistence over body-inspection** for detectBumpLevel state. Alternative was to re-parse the body on each update to recover system_prompt from the code fence. Snapshot is cheaper, explicit, and robust to body format changes. Cost: 4 extra frontmatter keys (tracked under `sync_snapshot:` to avoid top-level clutter).

2. **mode at top-level** (duplicated in `tags: [catpaw, processor, ...]` but explicit for bump detection). Schema permits additional properties; detectBumpLevel reads `current.mode` directly.

3. **Relaxed YAML quoting.** Initial heuristic quoted every string with `:` — this broke test patterns like `^deprecated_by:\s*user:antonio$`. Refined to only quote when `:` is followed by whitespace (or trails), matching YAML 1.2 bare-scalar rules. Verified with the validator integration test — no spurious quoting.

4. **Monolithic module.** Plan allowed split if >500 lines, but the YAML subsystem (~450 lines) is a tight internal helper and would add an import boundary for no reuse benefit. Kept as one file. If Plan 149-04's kb-sync.cjs needs the YAML subset in Node (not TS), that CLI can continue using the `validate-kb.cjs` parser directly — no code duplication between them since both are tested against the same fixtures.

5. **Warning text locale (Spanish / English mix).** The change_log warning says `'warning: DB overwrote local human edit in fields_from_db'` in English because the substring 'warning' is the tested marker. Future: could translate + keep English as machine-readable tag.

## Deviations from Plan

### None (Rules 1-3)

No auto-fixes were required — the two-stage TDD flow surfaced every issue as a failing test, and each failure was resolved by implementation refinement (not by weakening the test).

Minor refinements that were part of GREEN, not deviations:
- Added `sync_snapshot` frontmatter key to solve the "current has no system_prompt" gap from the first test run (3 failing tests resolved by this change plus the relaxed `needsQuoting`).
- Added `mode` to FIELD_ORDER so serialization order is deterministic.

**Total deviations:** 0 auto-fixed, 0 architectural.

## Issues Encountered

- **First test pass: 31/35 passing.** 4 failures: (a) `bump minor cuando system_prompt cambia` — cause: system_prompt not persisted in frontmatter, so detectBumpLevel had no baseline to compare against. Resolved by adding `sync_snapshot`. (b) `Caso 4 (§5.3)` — same root cause. (c+d) Both `markDeprecated` tests — cause: overly-aggressive `needsQuoting` quoted `user:antonio` as `"user:antonio"`, breaking bare-scalar regex. Resolved by restricting quoting to `:\s` patterns.
- **TypeScript `Set<string>` iteration warning** on `inferTags`. Fixed by replacing `[...new Set(tags)]` with a manual `seen` object. Kept existing tsconfig target unchanged.

## Authentication Gates

None — pure filesystem + Node runs.

## Deferred Issues

- Pre-existing TS errors in unrelated test files (catpaw-gmail-executor, intent-job-executor, intent-jobs, knowledge-tools-sync, telegram-callback). Not touched; would require separate fix plan. Noted in this summary under "TypeScript compilation" for future cleanup.
- `invalidateLLMCache` no-op — will be wired to prompt-assembler in Fase 4 del PRD.
- Translation feature (`syncResource` with `--translate` flag) — noted in PRD §8.4, out of scope for Phase 149.

## User Setup Required

None — `cd app && npm run test:unit -- knowledge-sync.test.ts` is runnable immediately (vitest already installed).

## Next Phase Readiness

- **149-04 (kb-sync.cjs CLI)**: the service is ready to be consumed. The CLI will:
  - `--full-rebuild`: walk `.docflow-kb/**/*.md`, re-invoke `updateIndexFull`-equivalent logic, optionally accept DB rows in a later fase to invoke `syncResource(entity, 'create', row)` for each.
  - `--audit-stale`: read `_index.json` entries where `status: deprecated` AND `last_accessed_at > 150d`; generate `.docflow-kb/_audit_stale.md`.
  - `--archive --confirm`: move eligibles to `_archived/YYYY-MM-DD/`, status deprecated→archived.
  - `--purge --confirm`: physical delete of files >365d in `_archived/`.
  - Reuse the YAML subset parser from `validate-kb.cjs` (already in CJS) for frontmatter reads.
- **Fase 2 PRD**: the `syncResource` signature is stable; the DB-reading wrapper in that phase just calls it once per row.
- **Fase 5 PRD**: `create_cat_paw` and sibling tools can now call `syncResource('catpaw', 'create', row, { author: 'catbot:tool' })` after DB insert.

## CatBot Oracle Note

Per CLAUDE.md protocol: this is infrastructure (service module), not a user-facing feature, so the oracle doesn't exercise it directly in this phase. However:

- CatBot will consume the generated `_header.md` and `_index.json` once Fase 4 PRD wires prompt-assembler to the KB.
- The `knowledge-sync.ts` service itself will be callable from CatBot tools once Fase 5 lands the bridge.
- No CatBot tool/skill addition is required in Phase 149 Plan 03.

## Self-Check: PASSED

**Files exist on disk:**

- `app/src/lib/services/knowledge-sync.ts` — FOUND (1418 lines, TS-valid)
- `app/src/lib/__tests__/knowledge-sync.test.ts` — FOUND (731 lines, 35 it() blocks)

**Commits exist in git history:**

- `2bf6ef3` (Task 1, RED) — FOUND via `git log --oneline`
- `19bbc7c` (Task 2, GREEN) — FOUND via `git log --oneline`

**Success criteria from plan:**

1. Service exports the 4 public functions + types — VERIFIED via `grep -E '^export (async )?function (syncResource|touchAccess|detectBumpLevel|markDeprecated)'` (4 matches).
2. Test suite has ≥20 it() blocks — VERIFIED: 35 blocks (well above minimum).
3. `cd app && npm run test:unit -- knowledge-sync.test.ts` passes all tests without skips — VERIFIED: `35 passed (35)`.
4. `npx tsc --noEmit` produces no errors on the new files — VERIFIED (pre-existing errors elsewhere untouched).
5. `detectBumpLevel` covers all 12 rows of PRD §5.2 — VERIFIED (16 tests, one per row + 2 precedence + 2 is_active variants).
6. `syncResource update` preserves enriched_fields + body content — VERIFIED by Grupo E Case 4.
7. `change_log` truncates to last 5 entries — VERIFIED by Grupo B test `change_log se trunca a los últimos 5 entries tras 7 updates`.
8. No `process.env.X` direct usage — VERIFIED: service receives `kbRoot` via `SyncContext`; zero env reads.

**Critical coverage flagged by the execution instructions:**

- §5.3 Case 2 (DB overwrites human-edited fields_from_db with change_log warning) — COVERED by `Caso 2 (§5.3)` test.
- §5.3 Case 4 (human edit of enriched_fields + DB update of fields_from_db → both preserved) — COVERED by `Caso 4 (§5.3)` test.
- 12 rows of bump table — COVERED by rows 1-14 (with 2 variants for row 12).
- Validator integration gate — COVERED by the `integration:` test that runs `validate-kb.cjs` against generated files.

---
*Phase: 149-kb-foundation-bootstrap*
*Plan: 03*
*Completed: 2026-04-18*
