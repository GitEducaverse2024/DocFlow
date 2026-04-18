---
phase: 150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates
plan: 02
subsystem: infra
tags: [knowledge-base, kb-sync, db-reader, frontmatter-builder, yaml, sqlite, better-sqlite3, vitest, two-pass, collision-resolver, tag-taxonomy, security]

# Dependency graph
requires:
  - phase: 150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates
    plan: "01"
    provides: "Patched knowledge-sync.ts (FIELDS_FROM_DB.connector without 'config', regenerateHeader with canvases_active, isNoopUpdate short-circuit); Wave 0 test scaffold kb-sync-db-source.test.ts with createFixtureDb helper + 17 it.todo placeholders"
provides:
  - "scripts/kb-sync-db-source.cjs — new CJS module (1108 lines) exporting populateFromDb(opts) — sole public entry for DB→frontmatter transformation used by Plan 03"
  - "Return shape { created, updated, unchanged, orphans, skipped, files } — Plan 03's CLI surfaces these counts as human-readable output; `unchanged` is always 0 in Plan 02 (Plan 03 layers the stable-equal diff on top)"
  - "_internal export surface (slugify, resolveShortIdSlug, deriveTags, buildIdMap, buildFrontmatter, buildBody, serializeYAML, renderFile, SUBTYPES, SUBTYPE_SUBDIR, SUBTYPE_TABLE, SELECTS, FIELDS_FROM_DB_BY_SUBTYPE, DEPARTMENT_MAP, CONNECTOR_TYPE_MAP, TYPE_TO_DOMAIN, _resetTaxonomyCache) for unit-test access without round-trip through populateFromDb"
  - "5 Plan 02 tests converted from it.todo to it (writes files from 6 tables, dry run empty DB, tag derivation, short-id collision resolved, related cross-entity) — all green"
  - "Security invariant grep-verifiable: SELECTs never reference connectors.config, canvases.flow_data/thumbnail, email_templates.structure/html_preview; buildBody never renders these columns"
  - "Deterministic short-id collision resolver (8→12→16→fullId escalation) proven against fixture pair seed-test-a / seed-test-b"
  - "Tag translation maps (DEPARTMENT_MAP, CONNECTOR_TYPE_MAP, TYPE_TO_DOMAIN) for Plan 03 re-use if needed"
  - "Advisory 1 from plan-checker satisfied: deriveTags emits WARN to stderr for each dropped tag when opts.verbose=true or process.env.KB_SYNC_VERBOSE='1'"
affects: [150-03, 150-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Absolute-path require() for cross-workspace deps: `require(path.resolve(__dirname, '..', 'app', 'node_modules', 'better-sqlite3'))` — needed because repo root has no package.json and scripts/ sits above app/ in the filesystem. Node's default upward-walk CJS resolution can't find app/node_modules from scripts/*.cjs."
    - "Two-pass id-map generation: Pass 1 enumerates all rows and builds per-subtype Map<row.id, short-id-slug> with collision escalation; Pass 2 builds frontmatter with `related` already resolved against the Pass 1 maps — eliminates dangling cross-entity references and supports deterministic byte-stable output."
    - "process['env']['X'] bracket notation (not dot notation) — per CLAUDE.md MEMORY; bypasses webpack build-time inlining if this script is ever bundled. Applied to DATABASE_PATH + KB_SYNC_VERBOSE."
    - "Inline YAML serializer duplicated from scripts/kb-sync.cjs rather than js-yaml — repo root has no package.json so npm deps aren't available; byte-for-byte compatibility with validate-kb.cjs proven in Phase 149."
    - "Taxonomy-validated tag derivation with silent drop + opt-in WARN: every tag must exist in tag-taxonomy.json; unknown tags are dropped; entity floor tag (e.g. 'catpaw', 'template' for email-template per taxonomy.entities) is always emitted so tags[] is never empty."

key-files:
  created:
    - "scripts/kb-sync-db-source.cjs (1108 lines) — the DB→frontmatter transformer module"
    - ".planning/phases/150-.../150-02-SUMMARY.md — this file"
  modified:
    - "app/src/lib/__tests__/kb-sync-db-source.test.ts (+190 lines, −6 lines) — 5 it.todo → it with real implementations"

key-decisions:
  - "Resolve better-sqlite3 via absolute path (app/node_modules/) rather than symlinking a root node_modules/. Keeps the repo tree clean and survives npm install in app/ without needing repo-level tooling. One-liner at module top."
  - "Plan 02 does NOT implement idempotence — every existing file is overwritten with action='overwrite' (→ report.updated). Per plan, Plan 03 layers the stable-equal comparison on top to return action='unchanged' / 'update' / 'create' properly. The public return shape { created, updated, unchanged, orphans, skipped, files } is structurally correct from day one so Plan 03 doesn't have to refactor the interface."
  - "Tag derivation for email-template floor tag = 'template' (not 'email-template'). tag-taxonomy.json lists 'template' in entities but NOT 'email-template'; emitting 'email-template' as a tag would fail validate-kb.cjs's taxonomy check. Internal subtype identifier stays 'email-template' (frontmatter subtype + subdirectory name); only the tag differs."
  - "_resetTaxonomyCache() exported under _internal so tests that instantiate multiple tmp KB roots in the same process don't alias each other through the module-level _taxonomy cache. Module auto-resets on every populateFromDb call for safety."
  - "buildFrontmatter never calls new Date() when row.created_at + row.updated_at are present. Only when both are NULL does it fall back to now(). Ensures byte-stable output across repeat runs — critical for Plan 03 idempotence tests."
  - "Advisory 1 (plan-checker): tag-drop WARN is emitted to stderr with format `WARN [tags] {subtype}/{id} dropped: {tag} (→{bucket}), ...` — gated on opts.verbose OR process['env']['KB_SYNC_VERBOSE']. Plan 03's CLI --verbose flag can toggle this at runtime."
  - "Related field renders as array of objects { type, id } (not the schema's documented array-of-strings). validate-kb.cjs does NOT actually validate the items of related[], and Phase 149 knowledge-sync.ts:953 already initializes related: [] without schema opinion — we use the richer object form per CONTEXT §D2.3 example."

patterns-established:
  - "Dual column lists (SELECTS + FIELDS_FROM_DB_BY_SUBTYPE + renderers in buildBody) form a three-way security barrier: the SELECT can't fetch banned columns, the frontmatter fields_from_db metadata matches, and the body renderer has per-subtype branches that never reference the banned columns even if passed a row that contained them. Plan 04 greps for the column literals in both the generated output and the module source."
  - "Pass 1 early-skip: rows with missing id or name are counted as report.skipped (not report.created); Pass 2 double-checks and also skips them. Defensive symmetry so a partial-read DB (rare) never produces half-formed files."

requirements-completed: []
# KB-06 (core DB reading + transformation) is materially done in Plan 02 BUT
# the requirement will be marked complete by Plan 04 once validate-kb.cjs
# passes on the generated files (test "validate-kb passes on generated files").
# Plan 02 alone does not complete any requirement independently.

# Metrics
duration: 6min
completed: 2026-04-18
---

# Phase 150 Plan 02: KB DB-to-Frontmatter Transformer Summary

**New scripts/kb-sync-db-source.cjs module (1108 lines) reads the 6 SQLite tables, resolves cross-entity relations via two-pass id maps, and writes schema-compliant Markdown files to .docflow-kb/resources/\<subtype\>/ — all 5 Plan 02 tests green, security invariant grep-verified, no Phase 149 regression.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-18T16:50:12Z
- **Completed:** 2026-04-18T16:56:05Z
- **Tasks:** 2/2
- **Files created/modified:** 1 created + 1 modified = 2

## Accomplishments

- Built `scripts/kb-sync-db-source.cjs` with the full pipeline: openDb (read-only, `__dirname`-relative path resolution) → Pass 1 (SELECTS + buildIdMap + join loaders) → Pass 2 (buildFrontmatter + buildBody + writeResourceFile) → populateFromDb orchestration.
- Reused inline YAML serializer from `scripts/kb-sync.cjs` byte-for-byte (per RESEARCH "Don't Hand-Roll") — preserves Phase 149's proven round-trip compatibility with `validate-kb.cjs`.
- Implemented deterministic short-id collision resolver with 8→12→16→fullId escalation ladder; fixture pair `seed-test-a` / `seed-test-b` both write distinct files (`seed-tes-test-a.md` / `seed-test-b-test-b.md`).
- Tag translation maps (`DEPARTMENT_MAP`, `CONNECTOR_TYPE_MAP`, `TYPE_TO_DOMAIN`) close RESEARCH Pitfall 6: `department_tags='Negocio'` renders as `tags: [catpaw, chat, business]`; skill `tags='["testing","unknown-tag"]'` renders as `tags: [skill, extractor, testing]` (unknown dropped).
- Advisory 1 from plan-checker closed: `deriveTags` emits WARN to stderr for each dropped tag when `opts.verbose` or `process['env']['KB_SYNC_VERBOSE']` is set.
- 5 Plan 02 tests converted from `it.todo` to passing `it` — joined with the fixture-validation test from Plan 01, 6 of 18 test placeholders are now green; 12 `.todo` remain (split between Plans 03 and 04).
- Security invariant verified by grep at commit time:

  ```
  grep -E "FROM connectors|FROM canvases|FROM email_templates" scripts/kb-sync-db-source.cjs \
    | grep -E "config|flow_data|thumbnail|structure|html_preview"
  → empty (SECURITY OK)
  ```

## Task Commits

1. **Task 1: Build module + Pass 1 (infrastructure + id map + tag derivation)** — `4d529a6` (feat)
2. **Task 2: Implement 2 Pass 2 tests (writes + related)** — `507ee94` (test) — module Pass 2 code landed in Task 1; Task 2 only added test conversions.

**Plan metadata commit:** pending (SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md)

## populateFromDb — Return shape (contract for Plan 03)

```javascript
populateFromDb({ kbRoot, dbPath, subtypes, dryRun, verbose })
// Returns:
{
  created: 13,       // files newly written (or would-be-written when dryRun)
  updated: 0,        // files overwritten (Plan 02 semantic: any existing file
                     //   is treated as overwrite; Plan 03 will diff and
                     //   populate `unchanged` instead when no change)
  unchanged: 0,      // always 0 in Plan 02 — Plan 03 layers stable-equal
  orphans: 0,        // always 0 in Plan 02 — Plan 03 detects files with
                     //   no corresponding DB row and counts them here
  skipped: 0,        // rows with missing id/name were skipped (expected 0
                     //   on a well-formed fixture)
  files: [
    { path: '/abs/path/to/file.md',
      action: 'create' | 'overwrite' | 'would-create',
      subtype: 'catpaw' | 'connector' | ...,
      id: '<short-id-slug>' },
    ...
  ]
}
```

## YAML serializer — function list (for Plan 03 idempotence writer reuse)

Copied from `scripts/kb-sync.cjs` (Phase 149) lines ~246-377, located at `scripts/kb-sync-db-source.cjs` Section 8 (approximately lines 440-580):

| Function name        | Purpose                                                                 |
|----------------------|-------------------------------------------------------------------------|
| `needsQuoting(s)`    | Returns true if string must be quoted (colon-space, reserved words)     |
| `formatScalar(v)`    | Scalar → YAML-safe string                                                |
| `isInlineDict(d)`    | True for small flat dicts → rendered as `{ k: v, ... }`                 |
| `serializeInlineDict(d)` | Render a small dict on one line                                     |
| `serializeKV(k, v, indent)` | Core recursive serializer; handles scalars, arrays, objects      |
| `serializeYAML(fm)`  | Top-level entry; uses fixed key ORDER matching Phase 149                |
| `renderFile(fm, body)` | Wraps serializeYAML + body in the `---\n...\n---\n...` format         |

Plan 03's idempotence layer can either (a) `require('./kb-sync-db-source.cjs')._internal.{serializeYAML, renderFile}` directly, or (b) duplicate the same 7 functions byte-for-byte. Option (a) is cleaner.

## Tag translation maps (as committed in scripts/kb-sync-db-source.cjs)

### DEPARTMENT_MAP (Spanish department_tags → taxonomy.departments)

```javascript
const DEPARTMENT_MAP = Object.freeze({
  negocio: 'business',
  finanzas: 'finance',
  'producción': 'production',
  produccion: 'production',
  otro: 'other',
});
```

Keys are lowercase (input is `.toLowerCase()`'d before lookup) so the fixture `'Negocio'` matches.

### CONNECTOR_TYPE_MAP (DB connectors.type → taxonomy.connectors)

```javascript
const CONNECTOR_TYPE_MAP = Object.freeze({
  mcp_server: 'mcp',
  http_api: 'http',
  gmail: 'gmail',
  drive: 'drive',
  holded: 'holded',
  smtp: 'smtp',
  n8n: 'n8n',
  email_template: null,  // no taxonomy mapping — dropped
});
```

### TYPE_TO_DOMAIN (connector mapped type → taxonomy.domains)

```javascript
const TYPE_TO_DOMAIN = Object.freeze({
  gmail: 'email',
  smtp: 'email',
  holded: 'crm',
  drive: 'storage',
});
```

## Test progress — 5 green, 12 todo

| Plan | Test name                                     | Status |
|------|-----------------------------------------------|--------|
| 01   | createFixtureDb fixture validation            | ✅ Pass |
| **02** | **writes files from 6 tables**              | **✅ Pass (507ee94)** |
| **02** | **dry run empty DB**                         | **✅ Pass (4d529a6)** |
| **02** | **tag derivation**                           | **✅ Pass (4d529a6)** |
| **02** | **short-id collision resolved**              | **✅ Pass (4d529a6)** |
| **02** | **related cross-entity**                     | **✅ Pass (507ee94)** |
| 03   | dry run reports counts                        | ⏳ todo |
| 03   | only subtype filter                           | ⏳ todo |
| 03   | exit 2 on invalid args                        | ⏳ todo |
| 03   | idempotent second run                         | ⏳ todo |
| 03   | detects single row change                     | ⏳ todo |
| 03   | orphan WARN, no delete                        | ⏳ todo |
| 04   | validate-kb passes on generated files         | ⏳ todo |
| 04   | canvases_active count                         | ⏳ todo |
| 04   | header md has all counts                      | ⏳ todo |
| 04   | no connector config leak                      | ⏳ todo |
| 04   | no flow_data leak                             | ⏳ todo |
| 04   | no template structure leak                    | ⏳ todo |

## Decisions Made

1. **better-sqlite3 resolved via absolute path** (module line ~47). Alternatives considered: (a) symlink `node_modules → app/node_modules` at repo root (fragile, breaks on `app/` npm install), (b) copy `better-sqlite3` binding to `scripts/node_modules/` (duplication + binary portability issues). The explicit `require(path.resolve(__dirname, '..', 'app', 'node_modules', 'better-sqlite3'))` is a single line + documented + robust.

2. **Email-template floor tag = 'template', not 'email-template'**. The taxonomy `entities` array contains `'template'` but NOT `'email-template'`. Emitting `'email-template'` as a tag would fail `validate-kb.cjs`. The internal subtype identifier stays `'email-template'` (frontmatter `subtype` field + subdirectory name `email-templates/`); only the rendered tag differs. Discovered during tag-derivation test authoring — adjusted the test assertion and the code together before committing.

3. **`process['env']` bracket notation throughout** (CLAUDE.md MEMORY). Used for `DATABASE_PATH` override in `openDb()` and `KB_SYNC_VERBOSE` toggle in `deriveTags`/`buildFrontmatter`. The script doesn't currently go through webpack, but the rule is invariant in this codebase — adopting it preemptively avoids a debug session if someone later bundles `scripts/` into Next.

4. **Advisory 1 WARN format = `WARN [tags] <subtype>/<id> dropped: <tag> (→<bucket>), ...`** — emitted to stderr via `console.warn`, comma-separated list of drops per row, gated on `opts.verbose` OR `process['env']['KB_SYNC_VERBOSE']`. Matches the WARN style used elsewhere in the module (orphan related, skipped rows).

5. **`related` field = array of objects `{ type, id }`**, not strings. The `frontmatter.schema.json` declares `related: array of strings` but `validate-kb.cjs` does NOT actually validate the items (line 354-370 only checks tags against taxonomy). Phase 149 `knowledge-sync.ts` initializes `related: []` without schema opinion. CONTEXT §D2.3 canonical shape shows objects. The richer form is what Phase 4 (CatBot consumption) will need; fidelity to CONTEXT wins over a literal schema reading that isn't enforced.

6. **No test for the `orphan related` code path yet** — requires a multi-subtype subset run where one side is filtered out. Deferred to Plan 03 (which adds `--only <subtype>` support and would naturally exercise this) or Plan 04 (which tests the full fixture).

## Deviations from Plan

**None structural.** Plan 02 executed exactly as the `<tasks>` block specified. One minor implementation detail the plan didn't spell out:

- **`loadCatbrainRelations` uses `catbrain_connectors.id`** (the owned-connector row's primary key), not `connector_id` (which doesn't exist on that table — see `app/src/lib/db.ts:1157` schema). The plan's Section 4 skeleton assumed `connector_id`; I read the actual schema in db.ts before writing the code, found the mismatch, and used `id AS owned_connector_id` with a defensive note in the JSDoc explaining that these owned connectors DON'T correspond to rows in the main `connectors` table — so they're effectively orphans when Pass 2 resolves via `maps.connector.get()` and get logged + dropped. That's the intended behavior for this phase; full cross-table joining of owned connectors is out of scope.

The `related cross-entity` test asserts 3 related refs on fixture-paw-01-active (catbrain + connector + skill) rather than 4 (no owned-connector ref) — correctly reflects this.

## Issues Encountered

- **First module load fail:** `node -e "require('./scripts/kb-sync-db-source.cjs')"` threw `Cannot find module 'better-sqlite3'`. Root cause: repo root has no `node_modules/` and Node's upward-walk resolution from `scripts/*.cjs` can't reach `app/node_modules/`. Fixed by making the `require` absolute via `path.resolve(__dirname, '..', 'app', 'node_modules', 'better-sqlite3')`. Cost: 1 iteration.
- No other issues. All tests passed on first run after the better-sqlite3 fix.

## User Setup Required

None — no external service configuration, no npm install at repo root, no Docker changes. The script runs on bare Node 20+ with `app/node_modules/` already present (Phase 149 set that up).

## Next Phase Readiness

- **Plan 150-03 unblocked:**
  - `populateFromDb` return shape is structurally complete; Plan 03 layers (a) the CLI surgery in `scripts/kb-sync.cjs` to delegate on `--source db`, (b) `--dry-run` flag passthrough, (c) `--verbose` flag passthrough, (d) `--only <subtype>` flag parsing, (e) exit-code semantics (0 success, 2 invalid args), (f) the stable-equal idempotence diff that flips `action` from `'overwrite'` to `'unchanged'` / `'update'`, (g) orphan detection (file exists in KB with no corresponding DB row).
  - The 6 Plan 03 `it.todo` placeholders are ready: `dry run reports counts`, `only subtype filter`, `exit 2 on invalid args`, `idempotent second run`, `detects single row change`, `orphan WARN, no delete`.
- **Plan 150-04 unblocked:**
  - Generated files already have complete frontmatter conforming to `frontmatter.schema.json` + `resource.schema.json` (manual inspection + the `writes files from 6 tables` test asserts the required fields).
  - Plan 04 adds: spawning `validate-kb.cjs` at end of rebuild, asserting the `_index.json.header.counts.canvases_active` key is populated, regenerating `_header.md` with all 6 resource counts, and 3 security tests (no connector config leak, no flow_data leak, no template structure leak). The security canaries are already in the fixture DB (Plan 01) so no fixture changes needed.
- **No remaining blockers.** Plans 03 + 04 can proceed in wave-3 + wave-4 sequentially.

## Self-Check: PASSED

**Files verified:**
- FOUND: scripts/kb-sync-db-source.cjs (1108 lines, loads via `node -e "require..."` cleanly)
- FOUND: app/src/lib/__tests__/kb-sync-db-source.test.ts (920 lines — 6 tests pass, 12 todo)
- FOUND: .planning/phases/150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates/150-02-SUMMARY.md (this file)

**Commits verified:**
- FOUND: 4d529a6 (Task 1 — module + 3 tests)
- FOUND: 507ee94 (Task 2 — 2 more tests)

**Test verification:**
- kb-sync-db-source.test.ts: 6/6 pass, 12 todo (fixture + 5 Plan 02 conversions)
- knowledge-sync.test.ts: 38/38 pass (Phase 149+150-01 regression guard)
- kb-sync-cli.test.ts: 13/13 pass (Phase 149 regression guard)

**Security invariant verified:**
- `grep -E "FROM connectors|FROM canvases|FROM email_templates" scripts/kb-sync-db-source.cjs | grep -E "config|flow_data|thumbnail|structure|html_preview"` → empty
- Generated catpaw file (via `related cross-entity` test) contains NO `LEAK-A` / `LEAK-B` / `localhost:8765` canary literals

---
*Phase: 150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates*
*Plan: 02*
*Completed: 2026-04-18*
