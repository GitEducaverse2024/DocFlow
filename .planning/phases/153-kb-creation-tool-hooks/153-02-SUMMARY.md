---
phase: 153-kb-creation-tool-hooks
plan: 02
subsystem: knowledge-base
tags: [kb, catbot-tools, syncResource, hooks, typescript, vitest]

# Dependency graph
requires:
  - phase: 149-kb-foundation-bootstrap
    provides: syncResource(entity, op, row, ctx) + markDeprecated
  - phase: 152-kb-catbot-consume
    provides: invalidateKbIndex()
  - plan: 153-01
    provides: LogSource 'kb-sync' + markStale(path, reason, details) helper
provides:
  - 6 hooked tool cases in catbot-tools.ts (create_catbrain, create_cat_paw/create_agent, create_connector, create_email_template, update_email_template, delete_email_template)
  - update_cat_paw intentionally NOT hooked — pass-through comment added
  - hookCtx(author, {reason?}) helper bridging env-based KB_ROOT into knowledge-sync SyncContext
  - hookSlug(name) local mirror of knowledge-sync.slugify (service does not export it)
affects: [153-03-route-hooks, 153-04-close]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inner try/catch around syncResource + invalidateKbIndex post-DB-commit (graceful failure, DB wins, KB stale logged via markStale)"
    - "Env-bridging hookCtx: knowledge-sync.ts reads SyncContext.kbRoot only (never env); kb-index-cache + kb-audit read process.env.KB_ROOT — hookCtx passes env through so all three modules see the same root during tests"
    - "Post-UPDATE SELECT re-read before syncResource (CONTEXT §D6): the row state passed to the service must be post-update, not the PATCH body"
    - "Delete path uses syncResource(entity, 'delete', {id}, ctx) — service routes to markDeprecated internally; hooks never call markDeprecated directly, never fs.unlink"

key-files:
  created:
    - app/src/lib/__tests__/kb-hooks-tools.test.ts
  modified:
    - app/src/lib/services/catbot-tools.ts

key-decisions:
  - "Entity keys are singular lowercase ('catbrain', 'catpaw', 'connector', 'template'); DB table names never reach syncResource — validated at TypeScript compile time via the Entity union"
  - "update_cat_paw NOT hooked — it fetch()es PATCH /api/cat-paws/[id]; Plan 153-03 route hook owns this path. Added a 3-line comment at case top to encode the invariant"
  - "hookCtx helper inline in catbot-tools.ts (not a new module) — single consumer, ~14 LOC, amortizes the knowledge-sync-does-not-read-env asymmetry without patching Phase 149 service contract"
  - "hookSlug re-implements slugify in-file because knowledge-sync.ts:117 does not export its slugify. Both functions must stay byte-identical on the {toLowerCase, collapse non-[a-z0-9] to -, trim, slice 50, unnamed fallback} chain"
  - "Tests pass explicit model='gemini-main' to create_cat_paw/create_agent so resolveAlias('agent-task') is skipped (no model_aliases seed in test DB)"
  - "T1's _index.json entry assertion uses 'catbrain-<id8>' key (entity-shortId), not '<id8>-slug' — knowledge-sync.ts:920 writes frontmatter.id as entity-prefixed; the KB filename uses shortId-slug but the index key is a different shape"

patterns-established:
  - "Hook recipe §A from RESEARCH applied verbatim at 4 create sites: const row = db.prepare(SELECT * WHERE id = ?).get(id); await syncResource(entity, 'create', row, hookCtx(author)); invalidateKbIndex();"
  - "Hook recipe for update_email_template follows §D6: re-SELECT post-UPDATE so row state is authoritative before syncResource runs detectBumpLevel"
  - "Hook recipe for delete_email_template: pass {id} only (service finds existing file by shortId); use hookCtx with reason string for change_log attribution"
  - "Failure path always markStale + logger.error; invalidateKbIndex is NEVER inside the catch (the old cache state is still correct if sync failed — §D7)"

requirements-completed: [KB-19, KB-21]

# Metrics
duration: 7min
completed: 2026-04-20
---

# Phase 153 Plan 02: KB Creation Tool Hooks — catbot-tools.ts Summary

**Wrapped 6 direct-DB-write tool cases in catbot-tools.ts with `await syncResource(entity, op, row, hookCtx(author))` + `invalidateKbIndex()` on success, `logger.error('kb-sync', …) + markStale(path, reason, …)` on failure, while leaving `update_cat_paw` as a pass-through (route hook in Plan 03 owns it).**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-20T13:45:37Z
- **Completed:** 2026-04-20T13:53:09Z
- **Tasks:** 2 (Task 2 tests RED first per TDD, then Task 1 implementation GREEN)
- **Files modified:** 2 (1 created, 1 edited)

## Accomplishments

- 6 hook wraps installed at the exact cases enumerated in RESEARCH §Target Call Sites (Tools):
  - `create_catbrain` at L1610 → hook span L1617–1638 (lines in final edited file)
  - `create_cat_paw` / `create_agent` fall-through at L1635-1636 → hook span L1671–1695
  - `create_connector` at L1699 → hook span L1754–1778
  - `create_email_template` at L3097 → hook span L3220–3244
  - `update_email_template` at L3122 → hook span L3272–3296
  - `delete_email_template` at L3152 → hook span L3311–3334
- `update_cat_paw` at L2340 gets a 3-line explanatory comment; zero `syncResource` references inside the case body (verified via grep on lines 2340-2380 — only the comment mentions it).
- 10/10 new tests in `kb-hooks-tools.test.ts` green (561 LOC, 1 describe block, 10 `it` blocks). Runtime 34ms per run (0.5s with startup).
- Full regression set green: **239/239 tests across 12 files** (`kb-hooks-tools, kb-audit, knowledge-sync, kb-index-cache, kb-tools, kb-tools-integration, kb-sync-cli, kb-sync-db-source, catbot-tools-query-knowledge, catbot-tools-retry-job, catbot-tools-user-patterns, catbot-prompt-assembler`).
- TypeScript strict compile: 0 new errors. Pre-existing error count (28) unchanged by this plan's edits — verified by `git stash && tsc --noEmit` comparison.

## Task Commits

1. **Task 2 RED: failing tests** — `58910c4` (`test(153-02): add failing tests for catbot-tools KB sync hooks`). 10 tests authored, 9 fail as expected (T7 trivially passes because pre-hook catbot-tools has zero syncResource calls).
2. **Task 1 GREEN: hook wraps + test fixes (id index format)** — `c4ca7a5` (`feat(153-02): hook 6 catbot-tools cases to syncResource (KB-19, KB-21)`). 6 hooks land, 2 helpers added (hookSlug + hookCtx), 4 imports added to top-of-file, 10/10 tests pass.

_Plan metadata commit follows this summary._

## Hook Line Numbers — Before vs After Edit

| Case                   | RESEARCH line | Post-edit anchor (opening `try {`) | Post-edit anchor (await syncResource) |
| ---------------------- | ------------- | ---------------------------------- | ------------------------------------- |
| create_catbrain        | L1610         | L1617                              | L1660                                 |
| create_cat_paw/agent   | L1635-1636    | L1671                              | L1713                                 |
| create_connector       | L1699         | L1754                              | L1791                                 |
| create_email_template  | L3097         | L3220                              | L3223                                 |
| update_email_template  | L3122         | L3272                              | L3275                                 |
| delete_email_template  | L3152         | L3311                              | L3313                                 |

Line drift is within 30 lines of RESEARCH estimates; caused by imports and helper insertions near the top of the file and the prior cases growing before the target.

## `update_cat_paw` Pass-Through Note

Inserted at the top of `case 'update_cat_paw': {` at L2340:

```typescript
case 'update_cat_paw': {
  // Phase 153 NOTE: This case is a pass-through (fetch PATCH /api/cat-paws/[id]).
  // The route handler owns the syncResource hook (Plan 153-03); adding one
  // here would double-fire or read stale state before the fetch returns.
  const catPawId = args.catPawId as string;
  // ... unchanged body ...
}
```

Verified via `grep -c "syncResource" lines 2340-2380 → 1 match (the comment only)`.

## slugify Source — Inline vs Import

Not imported from `knowledge-sync.ts` because that module's `slugify` at L117 is **not exported**. Added `hookSlug(name)` at L1324-1332 byte-identical to the service's implementation:

```typescript
function hookSlug(name: string): string {
  return (
    (name || 'unnamed')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'unnamed'
  );
}
```

Alternatives considered and rejected:
- **Export `slugify` from `knowledge-sync.ts`:** would touch Phase 149 surface area for a 6-line mirror; not worth it, and creates a hidden dependency between the failure-path markStale caller and the service's internal naming convention.
- **Pass the pre-computed file path to `markStale`:** requires calling `findExistingFileByIdShort` or replicating `kbFilePath` — more coupling, not less. The markStale path is editorial; a slugify mismatch would at most mis-address a single stale record and the `db_id` field still allows reconciliation.

Justification documented inline via JSDoc on `hookSlug` (L1315-1322 in the final file).

## `hookCtx` Helper — Env Bridging Rationale

`knowledge-sync.ts` reads `ctx?.kbRoot ?? DEFAULT_KB_ROOT` and NEVER consults `process.env.KB_ROOT`. The Phase 152 `kb-index-cache.ts` and Phase 153-01 `kb-audit.ts` modules both read `process.env.KB_ROOT || DEFAULT_KB_ROOT`. Tests rely on `process.env.KB_ROOT` to isolate writes to `mkdtempSync` temp dirs.

Without bridging, the hook would:
- Write the KB file to `DEFAULT_KB_ROOT` (real repo `.docflow-kb/`) during tests
- While `kb-index-cache.invalidateKbIndex()` + `kb-audit.markStale()` point at the temp dir
- Leaking test artifacts into the real KB AND making post-run assertions unable to see the hook's output (because it's in the wrong directory)

The bridge is a 14-line helper:

```typescript
function hookCtx(author: string, extras?: { reason?: string }): {
  author: string;
  kbRoot?: string;
  reason?: string;
} {
  const envRoot = process['env']['KB_ROOT'];
  return {
    author,
    ...(envRoot ? { kbRoot: envRoot } : {}),
    ...(extras?.reason ? { reason: extras.reason } : {}),
  };
}
```

In production, `KB_ROOT` is unset → hookCtx returns `{author}` → service falls back to its `DEFAULT_KB_ROOT`. Same behavior as without the bridge. In tests, `KB_ROOT` is set → hookCtx includes `kbRoot: envRoot` → service writes to the temp dir.

## Test Count / Runtime

- **File:** `app/src/lib/__tests__/kb-hooks-tools.test.ts`
- **LOC:** 561 (plan target was ~300-400; landed slightly higher because each of T3/T4 includes a security-canary assertion and T6 has 4 sub-assertions)
- **Tests:** 10 (T1-T10 per the plan)
- **Runtime:** ~34 ms (tests) + ~550 ms setup/import → ~0.6 s total per `vitest run kb-hooks-tools`
- **Regression set:** 239 tests in 12 files green (`~1.5 s total`)

## Discovered Drift from RESEARCH

1. **knowledge-sync frontmatter id format:** RESEARCH suggested the `_index.json` entry id would match `${idShort}-${slug}` (the filename pattern). Reading the service at L920 revealed it is actually `${entity}-${idShort(row.id)}` — so T1 asserts `catbrain-<id8>`, not `<id8>-aurora-knowledge`. Corrected during GREEN phase without changing any production code.
2. **`resolveAlias('agent-task')` fires from `create_cat_paw`** — not documented as a test gotcha in RESEARCH. The `model_aliases` table is not seeded in the test DB, so `create_cat_paw` and `create_agent` tests must pass explicit `model: 'gemini-main'` to skip the alias resolver path. Documented inline in the test file comments.
3. **`knowledge-sync.ts` ignores `process.env.KB_ROOT`** — RESEARCH mentions `getKbRoot(ctx)` but does not flag the env-asymmetry with `kb-index-cache.ts` and `kb-audit.ts`. The `hookCtx` helper resolves this; see section above.

## Decisions Made

See `key-decisions` in frontmatter. Notable:

- **Env bridging via `hookCtx` helper, not a knowledge-sync.ts edit.** Keeps the Phase 149 service contract frozen; the coupling burden stays at the call site where it can be reasoned about by Plan 03 route hooks and Plan 04 close-check.
- **Inline `hookSlug`** — mirroring knowledge-sync's private slugify. 6 lines, tightly co-located with the 5 `markStale` call sites that need it.
- **`update_cat_paw` gets a code comment, not a `logger.warn` or guard.** The comment documents the invariant; the absence of `syncResource` in the case body is verified by the negative test T7.

## Deviations from Plan

**1. [Rule 1 — Bug fix] Added `hookCtx` helper for env bridging between knowledge-sync and kb-index-cache/kb-audit**
- **Found during:** Task 1 GREEN run — first test execution showed KB files being written to the real `.docflow-kb/` instead of the test tmpdir, even though `process.env.KB_ROOT` was set.
- **Issue:** `knowledge-sync.ts:72-74` `getKbRoot(ctx)` returns `ctx?.kbRoot ?? DEFAULT_KB_ROOT` — it does not consult env vars. `kb-index-cache.ts:44-45` and `kb-audit.ts:29-31` both read `process.env.KB_ROOT`. Under tests, the hook was passing only `{author}` to syncResource, so the service used its own `DEFAULT_KB_ROOT` (real repo KB) while the cache invalidation + audit log pointed at the tmpdir. Real-KB pollution + mismatched test assertions.
- **Fix:** Added a 14-LOC `hookCtx(author, extras?)` helper that includes `kbRoot: process.env.KB_ROOT` when the env is set, and omits it otherwise. All 6 hooks use `hookCtx(...)` instead of inline `{author: ...}` literals. In production `KB_ROOT` is unset so the service falls back to its default (unchanged behavior). In tests the tmpdir is honored end-to-end.
- **Files modified:** `app/src/lib/services/catbot-tools.ts`
- **Verification:** Re-ran tests → 10/10 green; no files leaked to real `.docflow-kb/`; manual check with `git status .docflow-kb/` shows clean after a full test run.
- **Committed in:** `c4ca7a5` (Task 1 GREEN).

**2. [Rule 3 — Blocking issue] Tests must pass explicit `model: 'gemini-main'` to create_cat_paw/create_agent**
- **Found during:** Task 2 RED initial run.
- **Issue:** The `create_cat_paw` case falls back to `resolveAlias('agent-task')` when `args.model` is absent. In the test DB, `model_aliases` is not seeded → `resolveAlias` throws `No model available for alias "agent-task". Check alias configuration.` → the tool never runs.
- **Fix:** T2 and T10 now pass `model: 'gemini-main'` in the args. `resolveAlias` short-circuits on `(args.model as string) || await resolveAlias(...)` — truthy arg bypasses the resolver entirely.
- **Files modified:** `app/src/lib/__tests__/kb-hooks-tools.test.ts`
- **Verification:** T2 and T10 now reach the hook path and the KB files appear in the temp dir as expected.
- **Committed in:** Squashed into `58910c4` (RED) + refined in `c4ca7a5` (GREEN alongside the index-id fix).

**3. [Rule 1 — Bug fix] T1's `_index.json` entry id assertion corrected to `catbrain-<id8>`**
- **Found during:** Task 1 GREEN run.
- **Issue:** The test used `${shortId}-${slugOf(name)}` as the expected `_index.json` entry id, because that is the KB filename pattern. But `knowledge-sync.ts:920` writes `frontmatter.id = ${entity}-${idShort(row.id)}` — entity-prefixed, no slug.
- **Fix:** T1 now asserts `e.id === \`catbrain-${shortId}\``. (The file still exists at `<shortId>-<slug>.md` — that part of the assertion was always correct; only the index key shape was wrong.)
- **Files modified:** `app/src/lib/__tests__/kb-hooks-tools.test.ts`
- **Verification:** T1 goes green; frontmatter id format confirmed by direct read of knowledge-sync.ts:920.
- **Committed in:** `c4ca7a5`.

---

**Total deviations:** 3 auto-fixed (1 Rule 1 bug, 1 Rule 3 blocking issue, 1 Rule 1 test-expectation bug).
**Impact on plan:** No scope creep. The `hookCtx` helper is the only production addition beyond the 6 hooks + helper `hookSlug`; it is 14 LOC, tightly scoped, justified in-file, and non-observable in production where `KB_ROOT` is unset.

## Issues Encountered

- **Pre-existing TypeScript strict errors in unrelated files:** `catpaw-gmail-executor.test.ts`, `catpaw-email-template-executor.test.ts`, `intent-job-executor.test.ts`, `intent-jobs.test.ts`, `knowledge-tools-sync.test.ts`, `telegram-callback.test.ts` — 28 total errors, unchanged by this plan (verified by `git stash && tsc --noEmit` comparison). Tracked as pre-existing via Plan 153-01's `deferred-items.md`.
- **Real-KB write leak during first test run** (before the `hookCtx` fix landed). Files created in `.docflow-kb/` were cleaned up via `git checkout` + `rm` on tracked+untracked paths. Post-fix runs leave `.docflow-kb/` untouched (verified by `git status .docflow-kb/` → clean after a full test sweep).

## Self-Check: PASSED

All claimed files exist:
- `app/src/lib/__tests__/kb-hooks-tools.test.ts` — FOUND (561 LOC)
- `app/src/lib/services/catbot-tools.ts` — FOUND (modified)

All claimed commit hashes exist in git log:
- `58910c4 test(153-02): add failing tests for catbot-tools KB sync hooks` — FOUND
- `c4ca7a5 feat(153-02): hook 6 catbot-tools cases to syncResource (KB-19, KB-21)` — FOUND

All plan-level verifications pass:
1. `grep -c "await syncResource" catbot-tools.ts` → **6** ✓
2. `grep -c "logger.error('kb-sync'" catbot-tools.ts` → **6** ✓
3. `case 'update_cat_paw':` + next 40 lines contain `syncResource` **0 times outside the pass-through comment** ✓
4. `cd app && npm run test:unit -- kb-hooks-tools` → **10/10 green** ✓
5. Regression set (11 suites besides kb-hooks-tools) → **229/229 green** ✓
6. TypeScript strict → **0 new errors** (28 pre-existing unchanged) ✓

## User Setup Required

None — no external service configuration required. The hooks are additive to existing tool cases and silent in production unless a DB write occurs.

## Next Plan Readiness

- **Plan 153-03 (route hooks):** ready. Will hook the 15 API route handlers (`cat-paws/route.ts POST`, `cat-paws/[id]/route.ts PATCH+DELETE`, same triad for `catbrains`, `connectors`, `skills`, `email-templates`). Pattern mirrors this plan; the `hookCtx` helper may be promoted to a shared module if Plan 03 finds it duplicated across 15 sites, or re-implemented inline per-route for simplicity.
- **Plan 153-04 (close):** the oracle test can now exercise the CatBot chat path end-to-end (`create_cat_paw` via CatBot → KB file appears → next `list_cat_paws` sees `kb_entry` populated).
- **Phase 152 gap** (`kb_entry: null` on post-snapshot rows) will close for any entity created via the 6 hooked tool cases starting today. The remaining gap (entities created via UI or direct API calls) closes in Plan 03.

No blockers. Tool-side hooks (KB-19, KB-21) complete.

---
*Phase: 153-kb-creation-tool-hooks*
*Completed: 2026-04-20*
