# Phase 150: KB Populate desde DB — Research

**Researched:** 2026-04-18
**Domain:** Node CLI tooling, SQLite read-only access, YAML frontmatter generation, filesystem idempotence, vitest integration testing
**Confidence:** HIGH (every finding grounded in repo file:line references and live DB inspection)

## Summary

Phase 150 implements `kb-sync.cjs --full-rebuild --source db`: read 6 live SQLite tables, emit frontmatter-valid Markdown to `.docflow-kb/resources/*/`, regenerate `_index.json` v2 and `_header.md`. The foundation built in Phase 149 is mostly reusable but has **three structural gaps** that block direct reuse and **three collisions between CONTEXT.md assumptions and code reality** that the planner must resolve up-front:

**Structural gaps in Phase 149 code that Phase 150 must fix:**

1. `scripts/kb-sync.cjs cmdFullRebuild` counts object (lines 514–523) and the matching `_header.md` in `knowledge-sync.ts regenerateHeader` (lines 1388–1395) are missing `canvases_active`. CONTEXT D1 populates 6 subtypes; the index shape only tracks 5.
2. `knowledge-sync.ts FIELDS_FROM_DB` at lines 85–102 includes `connectors.config` as a DB-sourced field (line 97). CONTEXT D2.2 forbids this (secrets leak). The Phase 150 module must **override** or bypass this mapping for connectors.
3. `knowledge-sync.ts syncResource('update')` at lines 1061–1143 **always** bumps `version`, updates `updated_at`, appends a `change_log` entry — it has no short-circuit when no field actually changed. CONTEXT D4 requires idempotence ("second run → 0 changes, 0 bumps") which the current service cannot deliver. Phase 150 must perform the diff **before** calling `syncResource` and skip the call when no effective change is detected.

**Collisions between CONTEXT.md and repo reality:**

1. CONTEXT D5 recommends test location `scripts/__tests__/kb-sync-db-source.test.cjs`. This is **wrong**: the repo root has no `package.json`, vitest lives under `app/` and its config only globs `src/**/*.test.ts` (`app/vitest.config.ts:8`). Phase 149 correctly placed its CLI tests at `app/src/lib/__tests__/kb-sync-cli.test.ts`. Phase 150 must follow that precedent: `app/src/lib/__tests__/kb-sync-db-source.test.ts`.
2. CONTEXT D2 assumes `<short-id>` = first 8 chars of UUID is unique. Live DB inspection: **collisions exist already** (`executive-summary` cat_paw vs `executive-briefing` skill both → `executiv`; 4 email templates collide on `seed-tpl`). A deterministic collision handler is mandatory.
3. CONTEXT D2.1 tag rules reference taxonomy categories (`business|finance|production`) but the live DB `cat_paws.department_tags` stores Spanish values like `"Negocio"` which do not exist in the taxonomy. Without a translation map every derived tag is dropped by `validate-kb.cjs`.

**Primary recommendation:** Implement Phase 150 as a standalone `scripts/kb-sync-db-source.cjs` CJS module that (a) opens `app/data/docflow.db` read-only with `better-sqlite3`, (b) builds an in-memory `id → short-id-slug` map across all 6 entity types (detecting collisions globally), (c) generates frontmatter + body **without** depending on `knowledge-sync.ts` for the write path (reuse only the YAML serializer pattern and the `detectBumpLevel` algorithm), (d) writes with its own idempotence check (compare computed frontmatter vs existing file before writing), (e) regenerates `_index.json` and `_header.md` with canvases count added, (f) calls `scripts/validate-kb.cjs` as last step. This avoids three blocking coupling issues with `knowledge-sync.ts` and keeps the CLI self-contained like its sibling scripts.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D1. Scope: 6 entity types, not 5.** Populate `catpaws, connectors, skills, catbrains, email-templates, canvases`. Canvases included regardless of `is_template` flag; archived canvases get `status: deprecated` in KB.

**D2. Filename shape:** `<short-id>-<kebab-slug-del-name>.md` where `short-id = id.slice(0, 8)`. Slug via lowercase ASCII + hyphens.

**D2. Frontmatter mapping table:** `id=<short-id>-<slug>`, `type=resource`, `subtype=<entity>`, `lang=es` (monolingüe), `title=row.name`, `summary=row.description[:200]`, `audience=['catbot','architect']` (`['catbot','developer']` for skills), `status` derived from `is_active` and secondary status columns, `version='1.0.0'` initial, `created_by='kb-sync-bootstrap'`, `ttl='never'`, 1 initial change_log entry.

**D2.1. Tag derivation:** Per-subtype rules mapping DB fields to taxonomy. Unknown tags filtered silently with WARN log.

**D2.2. `fields_from_db` per subtype:** Explicit enumerated lists in CONTEXT D2.2 — **do NOT include** `connectors.config`, `canvases.flow_data`, `canvases.thumbnail`, `email_templates.structure`, `email_templates.html_preview`.

**D2.3. `related` cross-entity:** Two-pass algorithm required. First pass builds `row.id → short-id-slug` map per type; second pass resolves `related` references.

**D3. `--full-rebuild --source db` semantics:** Upsert idempotente (no pre-delete). Missing file → create. Existing file → update with merge. Missing DB row → orphan WARN, no touch. Regenerate `_index.json` and `_header.md` at end. Run `validate-kb.cjs`; exit 1 on fail.

**D3. Required flags:** `--source db` (opt-in), `--dry-run` (preview), `--verbose` (per-file log), `--only <subtype>` (subset rebuild). No `--force-delete-resources`.

**D3. State-filtered DB rows:** `is_active=0` → `status: deprecated` (not skipped). `status='archived'` canvases → `status: deprecated`. `source='built-in'` skills included.

**D4. Tests required:** Fixture SQLite ≥2 rows/type (12+ total), dry-run on empty, full run validates everything, idempotence (2nd run → 0 bumps), change detection, orphan WARN, `--only <subtype>`, security check (no `connectors.config` leak).

**D4. CatBot oracle (Nivel 2):** Run CLI on dev DB, paste prompt + CatBot `list_cat_paws` response to `150-VERIFICATION.md` showing KB file count matches live DB count. No new CatBot tools in this phase.

### Claude's Discretion

- Test runtime (recommended: vitest, per Phase 149 precedent).
- CJS vs TS for the new module (recommended: CJS, per `scripts/kb-sync.cjs` precedent).
- In-memory shape of the `row.id → short-id-slug` map between passes.
- Logging format (recommended: human-readable lines, per existing CLI style).
- DB open path (recommended: `better-sqlite3` direct, readonly mode — NOT routing through `app/src/lib/db.ts`).
- Exit codes (recommend: 0 success, 1 validation fail, 2 invalid args, 3 DB open error).
- Handling rows with empty `name` or non-UUID `id` (recommend: skip + WARN).

### Deferred Ideas (OUT OF SCOPE)

- Automatic ES→EN translation (`--translate`) — PRD §8.4.
- Auto-deprecation of orphan files — PRD Fase 5.
- CatBot consumption tools (`get_kb_entry`, `search_kb`) — PRD Fase 4.
- Wiring `create_cat_paw` → `syncResource` — PRD Fase 5.
- `/knowledge` dashboard — PRD Fase 6.
- Migration of `.planning/knowledge/*.md`, `app/data/knowledge/*.json` — PRD Fase 3.
- Enriched `change_log` with structured diffs.
- Bilingual `search_hints`.
- Batch/parallel I/O.

## Phase Requirements

Phase 150 has no pre-existing requirement IDs in `.planning/REQUIREMENTS.md` (the current file ends at KB-05, which belongs to Phase 149). The planner must **propose** 4–6 new requirement IDs that trace to CONTEXT.md scope and add them to REQUIREMENTS.md as part of the planning commit. Suggested:

| Proposed ID | Description | Research Support |
|-------------|-------------|------------------|
| KB-06 | `kb-sync.cjs --full-rebuild --source db` reads 6 DB tables and writes valid frontmatter files under `.docflow-kb/resources/*/` | All of §"Standard Stack", §"Architecture Patterns: DB access" |
| KB-07 | Generated files pass `validate-kb.cjs` (frontmatter schema + tag taxonomy) | §"Validation Architecture: contract tests"; reuse Phase 149 validator |
| KB-08 | CLI implements `--dry-run`, `--verbose`, `--only <subtype>` flags and correct exit codes | §"Architecture Patterns: CLI surgery"; §10 |
| KB-09 | Second consecutive run with unchanged DB produces zero file writes and zero version bumps (idempotence) | §"Pitfall 3: Always-bump trap"; §"Idempotence test design" |
| KB-10 | `_index.json` v2 regenerated with `header.counts.catpaws_active`, `connectors_active`, `catbrains_active`, `templates_active`, `skills_active`, `canvases_active` (NEW key) plus rules/incidents/features counts | §"Pitfall 1: Missing canvases_active key" |
| KB-11 | `connectors.config`, `canvases.flow_data`, `canvases.thumbnail`, `email_templates.structure`, `email_templates.html_preview` never appear in any generated file (security) | §"Pitfall 2: FIELDS_FROM_DB leaks config" |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | `^12.6.2` (in `app/package.json:27`) | Synchronous SQLite access, read-only open supported | Already the project's SQLite driver; used by `app/src/lib/db.ts:1`. No alternative needed. |
| Node built-ins (`fs`, `path`) | Node 20+ (Docker) / Node 22 (host) | File I/O, path resolution | Phase 149 `scripts/kb-sync.cjs` uses these exclusively; no heredoc deps. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| YAML serializer (inline) | duplicated from `scripts/kb-sync.cjs:246-377` | Generate frontmatter bytes | Reuse the exact serializer to keep validator compatibility. Do NOT introduce `js-yaml` (would require repo-root `package.json`). |
| `scripts/validate-kb.cjs` | Phase 149 | Final pass validation | Call via `child_process.spawnSync` at end of rebuild. Exit 1 propagates up. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `better-sqlite3` direct | Import `app/src/lib/db.ts` | Rejected: `db.ts` does INSERT-heavy seeding on import (lines 26+), couples CLI to Next.js toolchain, and instantiates WAL mode during connection (unwanted in a read-only script). `better-sqlite3` direct is 10 lines of code and safer. |
| CJS module | TypeScript module | Rejected: Node 22's `--experimental-strip-types` (stable since 22.6) lets `require('./file.ts')` work on the host (verified with `node -e "require('./app/src/lib/services/knowledge-sync.ts')"`), but Docker runs Node 20. Docker is currently irrelevant (CLI runs on host) but CJS preserves forward compatibility with CI regardless of Node version. Phase 149 Plan 04 made the same call explicitly (STATE.md L81). |
| Call `knowledge-sync.syncResource()` | Replicate write logic | Rejected: three blocking issues documented in §"Don't Hand-Roll"/§"Pitfalls". The planner has to replicate the frontmatter builder + YAML serializer anyway; routing through the service adds coupling without reuse win. |

**No new dependencies required.** No `npm install` step.

## Architecture Patterns

### Recommended Project Structure
```
scripts/
├── kb-sync.cjs              # Existing — minor edits (remove --source db reject, delegate)
├── kb-sync-db-source.cjs    # NEW — all DB → frontmatter logic
└── validate-kb.cjs          # Existing — called at end

app/src/lib/__tests__/
├── kb-sync-cli.test.ts      # Existing Phase 149
└── kb-sync-db-source.test.ts  # NEW — integration tests, follows Phase 149 pattern
```

### Pattern 1: DB Open — Read-only with explicit absolute path

**What:** Open `app/data/docflow.db` read-only, resolving path from the CLI's `__dirname` (not `process.cwd()`).

**Why:** `app/src/lib/db.ts:6` resolves the DB path via `process.cwd() + 'data/docflow.db'`, which only works when Node is launched from the `app/` directory. A CLI in `scripts/` launched from the repo root gets the wrong path. Solution: resolve from the script's own location.

**Example:**
```javascript
// Source: scripts/kb-sync-db-source.cjs (to be created)
const path = require('path');
const Database = require('better-sqlite3');

// __dirname = /home/deskmath/docflow/scripts
// DB lives at /home/deskmath/docflow/app/data/docflow.db
const DB_PATH =
  process.env.DATABASE_PATH /* honor the same override as app/src/lib/db.ts:6 */
  || path.resolve(__dirname, '..', 'app', 'data', 'docflow.db');

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
// No WAL pragma, no schema init — pure read.
try { runRebuild(db); } finally { db.close(); }
```

**Pitfall guard:** Docker image never runs this CLI (host-only), so no concern about the Docker image filesystem layout.

### Pattern 2: Two-pass generation to resolve cross-entity `related`

Per CONTEXT D2.3. Required because `related: [{ type: catbrain, id: <catbrain-short-id> }]` references sibling files whose `short-id-slug` is only known after a first enumeration.

```javascript
// Pass 1: read all 6 tables, build global id maps and collision-resolve
const maps = {
  catpaw: new Map(),    connector: new Map(), skill: new Map(),
  catbrain: new Map(),  'email-template': new Map(), canvas: new Map(),
};
for (const sub of SUBTYPES) {
  const rows = db.prepare(SELECT_SQL[sub]).all();
  for (const row of rows) {
    const slug = slugify(row.name);
    const shortIdSlug = resolveShortIdSlug(row.id, slug, maps[sub]);  // handles collisions
    maps[sub].set(row.id, shortIdSlug);
  }
}

// Pass 2: generate files, resolving related via maps
for (const sub of SUBTYPES) {
  for (const row of rows[sub]) {
    const fm = buildFrontmatter(sub, row, maps);  // now can fill `related`
    const body = buildBody(sub, row);
    upsertFile(kbRoot, sub, fm, body, dryRun, verbose);
  }
}
```

### Pattern 3: Collision handling for `short-id`

Live DB already has collisions (verified 3 pairs/groups). Deterministic resolution:

```javascript
// Source: design; no repo precedent yet
function resolveShortIdSlug(fullId, slug, typeMap) {
  let short = fullId.slice(0, 8);
  let candidate = `${short}-${slug}`;
  // Look for existing distinct full-id that already claimed this short+slug
  for (const [existingId, existingVal] of typeMap.entries()) {
    if (existingId !== fullId && existingVal === candidate) {
      // Collision — extend short to 12 chars, then 16, then full id
      for (const len of [12, 16, fullId.length]) {
        const longer = `${fullId.slice(0, len)}-${slug}`;
        if (![...typeMap.values()].includes(longer)) {
          return longer;
        }
      }
    }
  }
  return candidate;
}
```

**Scoping note:** Collisions only matter *within a subtype* (files live in separate directories per subtype). A `catpaw` and a `skill` sharing `executiv` prefix don't collide — they land in different folders. But the `related: [...]` array must still disambiguate across types, so the frontmatter id MUST stay globally unique when written. The current frontmatter `id` convention is `<entity>-<short-id>` (see `knowledge-sync.ts:896`: `id: \`${entity}-${idShort(row.id)}\``) which already scopes by entity. **Recommend sticking with `id: <entity>-<shortid>` for the frontmatter ID** (matches existing service) and `<shortid>-<slug>.md` for the filename (matches CONTEXT D2).

### Pattern 4: CLI surgery in `scripts/kb-sync.cjs`

Current structure (`scripts/kb-sync.cjs:469-542`):

```javascript
function cmdFullRebuild(args, { kbRoot = KB_ROOT } = {}) {
  // lines 470-479: detect --source db and error out
  if (hasSourceDb) { console.error('Not implemented — Fase 2'); process.exit(1); }
  // lines 481-542: walk KB, read frontmatters, build _index.json
}
```

**Proposed surgery** (minimal diff):
```javascript
function cmdFullRebuild(args, { kbRoot = KB_ROOT } = {}) {
  const hasSourceDb = /* unchanged detection */;
  if (hasSourceDb) {
    const { populateFromDb } = require('./kb-sync-db-source.cjs');
    populateFromDb({ kbRoot, args });  // writes files, then falls through
  }
  // existing walk + _index.json rebuild runs AFTER populate
  // lines 481-542 stay unchanged
  // add: spawn validate-kb.cjs at end, exit 1 on fail
}
```

This structure is clean because the existing `cmdFullRebuild` already regenerates `_index.json` from frontmatters — after populate writes files, the existing code correctly indexes them. Zero duplication. Test 1/2 from Phase 149 still pass because they don't use `--source db`.

### Pattern 5: Idempotence via computed-vs-existing diff

CONTEXT D4 requires that `--full-rebuild --source db` run twice in a row produces zero changes on the second run. The existing `knowledge-sync.ts syncResource('update')` is not idempotent (see §Pitfalls). The Phase 150 module must implement its own idempotence check **before** writing:

```javascript
function upsertFile(filePath, computedFm, computedBody, { dryRun, verbose }) {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8');
    const computed = renderFrontmatter(computedFm) + computedBody;
    // Compare the "stable" part: skip volatile fields (updated_at, change_log last entry)
    if (stableEqual(existing, computed)) {
      if (verbose) console.log(`UNCHANGED ${filePath}`);
      return { changed: false, bump: null };
    }
    // Real change — compute bump, preserve created_at/enriched_fields
    const { frontmatter: curFm, body: curBody } = parseFrontmatter(existing);
    const bump = detectBumpLevel(curFm, computedFm);
    const mergedFm = mergeKeepEnriched(curFm, computedFm, bump);
    if (!dryRun) fs.writeFileSync(filePath, renderFrontmatter(mergedFm) + computedBody);
    return { changed: true, bump };
  }
  // Create path — always writes
  if (!dryRun) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, renderFrontmatter(computedFm) + computedBody); }
  return { changed: true, bump: 'init' };
}

// stableEqual: strip updated_at, change_log, sync_snapshot hash/timestamps before compare
// so that a second run where the DB row is byte-identical returns true.
```

**Key insight:** The "stable" comparison is non-trivial but necessary. Without it the service-level idempotence can't be achieved without modifying `knowledge-sync.ts`.

### Anti-Patterns to Avoid

- **Hand-routing every row through `syncResource('update')`:** Breaks idempotence (see Pitfall 3). Only call `syncResource('create')` for first write, and even then Phase 150 likely needs its own writer to control `kb-sync-bootstrap` author/version semantics.
- **`SELECT *` on DB tables:** Leaks secrets (see Pitfall 2). Always enumerate columns explicitly.
- **Generating `updated_at = new Date().toISOString()` unconditionally:** Breaks byte-stability across idempotent runs. Strategy: use `row.updated_at` from DB (stable), or compare structural content and only bump `updated_at` when structural change detected.
- **Trusting `row.id` is always UUID:** Live data has short slug IDs (`vision-product`, `seed-tpl-corporativa`). `id.slice(0, 8)` of `"seed-tpl-corporativa"` = `"seed-tpl"` which collides 4× in current DB. Handler mandatory.
- **Normalizing tags to empty array when all are unknown:** Leaves the file with no tags and poor discoverability. Recommend: always include the entity tag (e.g., `['catpaw']`) as floor so `tags` is never empty.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML serialization | Custom serializer from scratch | Copy `serializeYAML`/`parseYAML` from `scripts/kb-sync.cjs:41-377` | Phase 149 already proved byte-stability with `validate-kb.cjs`. Rewriting risks serializer/validator drift. |
| Version bump detection | Homegrown semver logic | Port `detectBumpLevel` from `app/src/lib/services/knowledge-sync.ts:721-819` to CJS | Non-trivial rules (major > minor > patch precedence). Already tested by Phase 149 Plan 03. |
| Frontmatter validation | Regex checks in the CLI | Spawn `scripts/validate-kb.cjs` at end | The validator already reads the schema + taxonomy. Double-validation would drift. |
| `_index.json` regeneration | Build from DB in memory | Reuse `cmdFullRebuild` body (`scripts/kb-sync.cjs:481-542`) after populate writes files | Same walker is already tested (Phase 149 Tests 1 & 2). |
| `_header.md` regeneration | Build from scratch | Extend the EXISTING `cmdFullRebuild` (line 540 writes `_index.json` only — `_header.md` lives in `knowledge-sync.ts:1373` service, not in the CLI). **Gap**: the CLI does not regenerate `_header.md` today. Phase 150 must add this step. |
| SQLite abstraction | Query builder | `db.prepare(sql).all()` / `.get()` | `better-sqlite3` sync API is ergonomic and fast; rows come out as plain objects with column names. |

**Key insight:** Most of the heavy lifting already exists in Phase 149 code. Phase 150 is 60% orchestration (DB read → frontmatter build → filesystem write) and 40% copying well-tested helpers into a new CJS module. No new algorithms required except the collision handler and the stable-equal idempotence check.

## Common Pitfalls

### Pitfall 1: `_index.json.header.counts` and `_header.md` are missing `canvases_active`

**What goes wrong:** CONTEXT D1 mandates 6 subtypes including canvases. Current `scripts/kb-sync.cjs:514-523` and `app/src/lib/services/knowledge-sync.ts:1388-1395` emit only 5 count keys (catpaws, connectors, catbrains, templates, skills). Running Phase 150 without fixing this produces a consistent shape between the two regen paths but NO canvas count, making canvases invisible in the L0 header.

**Why it happens:** Phase 149 was drafted before the decision to include canvases was finalized (see Phase 149 CONTEXT.md: resources/canvases/ exists but empty; count key was never added).

**How to avoid:** Add `canvases_active` to both places (index + header). Update the test fixture in `app/src/lib/__tests__/kb-sync-cli.test.ts:217-225` to assert the new key does NOT break Test 1 ("8 keys required" becomes 9, or make the test assertion `arrayContaining` tolerant).

**Warning signs:** `validate-kb.cjs` does not catch this (it validates individual file frontmatters, not the index shape). The only way to detect regression is explicit test assertion on `idx.header.counts.canvases_active`.

### Pitfall 2: `knowledge-sync.ts FIELDS_FROM_DB` leaks `connectors.config`

**What goes wrong:** `app/src/lib/services/knowledge-sync.ts:97` lists `config` in the connector field list. If Phase 150 delegates connector writes to `syncResource('create', 'connector', row)`, the service would try to use `row.config` in `buildSyncSnapshot` (line 868). Fortunately the snapshot only captures specific keys (`system_prompt, connectors_linked, skills_linked, io_contract_hash` — line 861), so `config` doesn't actually land in `sync_snapshot`. BUT: `source_of_truth.fields_from_db` at line 916 DOES embed the full `FIELDS_FROM_DB[entity]` array into the file's frontmatter, which includes the string `"config"`. That's metadata, not the value — low severity but inconsistent with CONTEXT D2.2 ("NO `config`").

**Why it happens:** Phase 149 wrote a generic service; didn't know about the secret-classification decision taken in Phase 150 CONTEXT.

**How to avoid:** Either (a) override `FIELDS_FROM_DB` in the Phase 150 module by building `source_of_truth` manually instead of relying on service, OR (b) patch `knowledge-sync.ts:97` to remove `config` (safer, narrower scope). Option (b) is 1 line and aligns the service with CONTEXT.

**Warning signs:** Integration test REQUIRED: generate a connector file from fixture DB, `grep -r "config" .docflow-kb/resources/connectors/` should find ONLY the metadata string `fields_from_db: [...]` (if that), never an actual config value. Better: grep for characteristic tokens from the fixture DB config (e.g., `"localhost:8765"` from `seed-linkedin-mcp`).

### Pitfall 3: `syncResource('update')` always bumps — no idempotence

**What goes wrong:** `knowledge-sync.ts:1082-1136` unconditionally sets `version=newVersion`, `updated_at=now()`, and appends a `change_log` entry. Running Phase 150 rebuild twice on unchanged DB produces: 1st run → files with version `1.0.0`; 2nd run → same files bumped to `1.0.1` (patch from `detectBumpLevel`'s default). This violates CONTEXT D4 explicit test: "segundo run → 0 cambios, 0 bumps."

**Why it happens:** `detectBumpLevel` returns `patch` as default fallback (line 818), which is interpreted as "nothing significant changed but still bump." There is no "no change" return value.

**How to avoid:** Phase 150 module performs its own stable-equal check BEFORE invoking any update logic. If the computed frontmatter (minus volatile fields `updated_at`, `change_log`, `sync_snapshot.*`) equals the existing file's frontmatter, skip the write entirely. Do NOT call `syncResource('update')` in that case.

**Warning signs:** Integration test REQUIRED: run rebuild twice on same fixture DB, check that (a) no file's `updated_at` changed, (b) no file's `version` changed, (c) CLI logs `0 updates` or equivalent.

### Pitfall 4: DB path resolution — `process.cwd()` trap

**What goes wrong:** `app/src/lib/db.ts:6` uses `path.join(process.cwd(), 'data', 'docflow.db')`. A script in `scripts/` invoked from `/home/deskmath/docflow` would get `./data/docflow.db` — wrong location (actual DB is `./app/data/docflow.db`).

**Why it happens:** `db.ts` is designed to run from inside `app/` where `process.cwd()` equals `/home/deskmath/docflow/app`. Docker entrypoints run from `/app`. Standalone CLIs need explicit path resolution.

**How to avoid:** Use `__dirname`-relative path: `path.resolve(__dirname, '..', 'app', 'data', 'docflow.db')`. Honor `process.env.DATABASE_PATH` to match the same override semantics as `db.ts`.

**Warning signs:** Integration tests should construct fixture DBs at `app/data/docflow.db` location, OR pass `DATABASE_PATH=<tmpdir>/fixture.db` env var, OR expose an internal `dbPath` option (cleanest for tests — `populateFromDb({ dbPath, kbRoot })`).

### Pitfall 5: UUID collisions in `short-id`

**What goes wrong:** CONTEXT D2 assumes `id.slice(0, 8)` is unique. Live DB inspection via `node -e "..."` found 3 collision sets:
- `executive-summary` (cat_paw) + `executive-briefing` (skill) → both `executiv`
- `business-case` (skill) + `business-writing-formal` (skill) → both `business`
- 4 email templates sharing `seed-tpl` prefix

**Why it happens:** DB contains slug-style IDs (not UUIDs) for seed data, migrated or created without UUID enforcement.

**How to avoid:** Deterministic collision resolver (see §Architecture Pattern 3). Skill-vs-catpaw collision is harmless (different folders), but skill-vs-skill or template-vs-template requires extension.

**Warning signs:** Integration test REQUIRED: fixture with intentional `seed-foo`/`seed-foo-bar` ids in same table → verify two distinct files are generated, filenames differ.

### Pitfall 6: Tag derivation drops all tags without translation

**What goes wrong:** `cat_paws.department_tags = "Negocio"` is a natural-language Spanish label. `tag-taxonomy.json:7` departments are `["business", "finance", "production", "other"]` — English. Without a translation map, every derived tag is rejected by `validate-kb.cjs:367` ("tag not in taxonomy") → file fails validation → CLI exits 1.

**Skills tags storage:** `skills.tags` is a JSON-encoded array (`"[\"diátaxis\",\"estructura\",...]"`), Spanish, non-taxonomy. Same drop problem.

**Canvases tags storage:** `canvases.tags` is NULL in the live DB — no drop problem but also no signal.

**Why it happens:** DB stores user-facing strings; taxonomy is internal normalized vocabulary. Tag design choice.

**How to avoid:** Phase 150 module defines per-subtype **translation/filter maps**:

```javascript
const DEPARTMENT_MAP = {
  'Negocio': 'business',
  'Finanzas': 'finance',
  'Producción': 'production',
  'Produccion': 'production',
  'Otro': 'other',
};

const CONNECTOR_TYPE_MAP = {
  'mcp_server': 'mcp',
  'http_api': 'http',
  'gmail': 'gmail',
  'email_template': null,  // no taxonomy mapping — drop
};

// Skills tags (JSON array of Spanish words) → keep only those in cross_cutting
function mapSkillTags(rawJsonString) {
  try {
    const arr = JSON.parse(rawJsonString);
    return arr.filter(t => TAXONOMY.cross_cutting.includes(String(t).toLowerCase()));
  } catch { return []; }
}
```

Always include the entity tag as floor (`['catpaw']`, `['skill']`, etc.) so the file has at least one valid tag.

**Warning signs:** Integration test: generate from fixture with `department_tags='Negocio'` and `tags='["testing", "unknown-tag"]'`, assert output file frontmatter has `tags: [catpaw, business, testing]` (Negocio translated, unknown dropped, testing kept because it's in `cross_cutting`).

### Pitfall 7: `knowledge-sync.ts` uses Node 22 type-stripping — NOT portable

**What goes wrong:** `require('./app/src/lib/services/knowledge-sync.ts')` works on Node 22.6+ but fails on Node 20 (Docker image). If the Phase 150 CLI were to `require()` the service, CI / Docker execution breaks.

**Verified:** `node --version` → `v22.22.0` on host; `require('./app/src/lib/services/knowledge-sync.ts')` succeeds. On Node 20 it would fail at parse time.

**How to avoid:** Keep Phase 150 module as CJS with its own (copied) helpers. Do NOT `require` the TS service.

**Warning signs:** CI test matrix or Node 20 validation would catch this. Lacking CI, the rule-of-thumb is: "scripts run on bare Node without type stripping."

### Pitfall 8: `mergeRowIntoFrontmatter` cannot reactivate deprecated files

**What goes wrong:** `knowledge-sync.ts:1025-1032` changes `status` from `active → deprecated` when `is_active=0`, and vice versa. But when going `deprecated → active`, the frontmatter KEEPS `deprecated_at`, `deprecated_by`, `deprecated_reason` populated → `validate-kb.cjs:321-326` requires those only when `status=deprecated`; the reverse case with `status=active` + `deprecated_at` populated IS technically allowed by the validator (it's an if-then, not an if-iff), but it's confusing data.

**How to avoid:** Phase 150 module explicitly clears `deprecated_*` fields when transitioning to `active`. Lower priority than Pitfall 3 but worth covering in one test.

**Warning signs:** Fixture with `is_active=0` → run → flip to `is_active=1` → run → inspect file: `deprecated_at` should be absent or null; `status` should be `active`.

## Code Examples

### Opening the DB read-only

```javascript
// Source: adapted from app/src/lib/db.ts:6 with __dirname resolution
// File: scripts/kb-sync-db-source.cjs (to be created)
const Database = require('better-sqlite3');
const path = require('path');

function openDb(explicitPath) {
  const dbPath = explicitPath
    || process.env.DATABASE_PATH
    || path.resolve(__dirname, '..', 'app', 'data', 'docflow.db');
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}
```

### Explicit enumerated SELECTs (security-safe)

```javascript
// Source: design based on app/src/lib/db.ts schemas (lines 27, 447, 922, 978, 1174, 4483)
const SELECTS = {
  catpaw: `SELECT id, name, description, mode, model, system_prompt, tone,
                  department_tags, is_active, times_used, temperature, max_tokens,
                  output_format, created_at, updated_at
           FROM cat_paws`,
  connector: `SELECT id, name, description, type, is_active, times_used,
                     test_status, created_at, updated_at
              FROM connectors`,                   /* NO config */
  skill: `SELECT id, name, description, category, tags, instructions,
                 source, version, author, times_used, created_at, updated_at
          FROM skills`,
  catbrain: `SELECT id, name, description, purpose, tech_stack, status,
                    agent_id, rag_enabled, rag_collection, created_at, updated_at
             FROM catbrains`,
  'email-template': `SELECT id, name, description, category, is_active,
                            times_used, ref_code, created_at, updated_at
                     FROM email_templates`,        /* NO structure, NO html_preview */
  canvas: `SELECT id, name, description, mode, status, tags, is_template,
                  created_at, updated_at
           FROM canvases`,                         /* NO flow_data, NO thumbnail */
};
```

### Reading related join tables

```javascript
// Source: verified against live DB via `node -e "..."`
// cat_paw_connectors schema at app/src/lib/db.ts:1206
function loadCatPawConnectors(db) {
  const sql = `
    SELECT cpc.paw_id, cpc.connector_id, c.type AS connector_type
    FROM cat_paw_connectors cpc
    LEFT JOIN connectors c ON cpc.connector_id = c.id
    WHERE cpc.is_active = 1`;
  const rows = db.prepare(sql).all();
  const byPaw = new Map();  // paw_id → [{ connector_id, connector_type }]
  for (const r of rows) {
    if (!byPaw.has(r.paw_id)) byPaw.set(r.paw_id, []);
    byPaw.get(r.paw_id).push({ id: r.connector_id, type: r.connector_type });
  }
  return byPaw;
}
```

### Spawning validate-kb.cjs at end

```javascript
// Source: design — no existing example in scripts/kb-sync.cjs
const { spawnSync } = require('child_process');
function runValidator(kbRoot) {
  const validator = path.resolve(__dirname, 'validate-kb.cjs');
  const result = spawnSync(process.execPath, [validator], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error('FAIL: validate-kb.cjs rejected the generated KB');
    console.error(result.stdout); console.error(result.stderr);
    process.exit(1);
  }
}
```

### Idempotence — stable-equal comparison

```javascript
// Source: design — key invariant from CONTEXT.md D4
const VOLATILE_KEYS = new Set(['updated_at', 'change_log', 'last_accessed_at', 'access_count']);

function stripVolatile(fm) {
  const out = {};
  for (const [k, v] of Object.entries(fm)) {
    if (!VOLATILE_KEYS.has(k)) out[k] = v;
  }
  return out;
}

function stableEqual(existingPath, computedFm, computedBody) {
  if (!fs.existsSync(existingPath)) return false;
  const { frontmatter: curFm, body: curBody } = readFrontmatter(existingPath);
  const a = JSON.stringify(stripVolatile(curFm));
  const b = JSON.stringify(stripVolatile(computedFm));
  return a === b && curBody.trimEnd() === computedBody.trimEnd();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `app/data/knowledge/*.json` + manual `.planning/knowledge/*.md` catalogs, maintained by hand | Single `.docflow-kb/` tree with auto-sync from DB via `knowledge-sync.ts` | Phase 149 (2026-04-18) | Phase 150 is the first concrete use. The old silos remain until PRD Fase 3/7. |
| `SELECT *` in app code | Explicit column enumeration for KB generation | This phase introduces the convention | Prevents accidental leak of `config`/`flow_data` when DB gains new columns. |

**Deprecated/outdated:**
- Nothing is being deprecated in Phase 150. The phase is additive. Phase 7 of the PRD (not scheduled yet) will delete `app/data/knowledge/*.json` and `.planning/knowledge/*.md`.

## Open Questions

1. **Should `connectors.config` be removed from `knowledge-sync.ts:97`?**
   - What we know: Including it there is inconsistent with CONTEXT D2.2 security rule.
   - What's unclear: Whether the service is consumed by anyone besides this phase (Phase 149 Plan 03 tests exercise it). If we patch the service, the Phase 149 test `knowledge-sync.test.ts` may need an update.
   - Recommendation: The planner SHOULD patch `knowledge-sync.ts:97` (remove `'config'`) and verify Phase 149 tests still pass. 1-line change, aligns service with CONTEXT. If risk-averse, leave the service alone and have Phase 150 module build `source_of_truth` itself.

2. **Naming conflict between `email-template` (frontmatter subtype) and `template` (service Entity type).**
   - What we know: `resource.schema.json:14` enum includes `email-template`. `knowledge-sync.ts:33-39` uses `'template'` as the `Entity` key (line 36). `ENTITY_SUBDIR['template']='resources/email-templates'` (line 81).
   - What's unclear: When the Phase 150 module writes files, the `subtype` in frontmatter must be `email-template` (with hyphen), but the internal entity identifier is `template`. Which to use internally?
   - Recommendation: Internal variable = `'email-template'` everywhere in Phase 150 module to avoid confusion. Maps 1:1 to filename/subtype/tag.

3. **Does the validator accept `status: archived` for type=resource files?**
   - What we know: `frontmatter.schema.json:64-67` includes `archived` in the status enum. But `resource.schema.json` doesn't restrict it; individual files with archived status would pass validator.
   - Unclear: CONTEXT D3 specifies archived canvases → `status: deprecated` (not `archived`). The distinction: `archived` is for files moved to `_archived/` folder by `cmdArchive`, `deprecated` is for live-but-inactive resources. Phase 150 files stay in `resources/`, so they should ALWAYS be `active` or `deprecated`, never `archived`.
   - Recommendation: Plan task must enforce this rule explicitly: `canvases.status='archived'` in DB → frontmatter `status: deprecated`. Add a unit test.

4. **What happens to a `cat_paw_catbrains` row when Phase 150 runs but the catbrain was deleted from the catbrains table?**
   - What we know: `cat_paw_catbrains.catbrain_id` has `ON DELETE CASCADE` (`app/src/lib/db.ts:1199`) so this case shouldn't arise in a consistent DB.
   - Unclear: During rebuild, if the join returns a `catbrain_id` that we haven't registered in our `maps.catbrain` (e.g., filter excludes some rows), what does `related` show?
   - Recommendation: Defensive — if a joined id is not in `maps[target_type]`, log WARN and skip that `related` entry rather than emit a dangling reference.

5. **Who keeps `_manual.md` in sync with CONTEXT.md updates?**
   - What we know: CONTEXT D3 (line 21) requires updating `_manual.md` with a "Contenido actual del KB" section explaining `--source db`.
   - Unclear: Is this task 1 separate plan or embedded in the main plan?
   - Recommendation: Small enough to be task N+1 of the main plan (not a separate plan). Append ~30 lines to `_manual.md`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest` v1.x (in `app/package.json` devDependencies) |
| Config file | `app/vitest.config.ts` (uses `include: ['src/**/*.test.ts']`) |
| Quick run command | `cd app && npm run test:unit -- src/lib/__tests__/kb-sync-db-source.test.ts` |
| Full suite command | `cd app && npm run test:unit` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| KB-06 | `--source db` reads 6 tables and writes frontmatter files | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "writes files from 6 tables"` | ❌ Wave 0 |
| KB-06 | Dry run on empty fixture DB → 0 files | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "dry run empty DB"` | ❌ Wave 0 |
| KB-07 | Every generated file passes `validate-kb.cjs` | contract | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "validate-kb passes on generated files"` (test spawns validate-kb.cjs on tmp KB) | ❌ Wave 0 |
| KB-08 | `--dry-run` reports plan without writing | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "dry run reports counts"` | ❌ Wave 0 |
| KB-08 | `--only catpaw` touches only catpaw files | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "only subtype filter"` | ❌ Wave 0 |
| KB-08 | Invalid arg combination → exit 2 | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "exit 2 on invalid args"` | ❌ Wave 0 |
| KB-09 | 2nd run on unchanged DB → 0 writes, 0 bumps | idempotence | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "idempotent second run"` | ❌ Wave 0 |
| KB-09 | Change a single row → re-run → 1 file updated, correct bump level | idempotence | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "detects single row change"` | ❌ Wave 0 |
| KB-09 | Delete a row → re-run → orphan WARN, file persists unchanged | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "orphan WARN, no delete"` | ❌ Wave 0 |
| KB-10 | `_index.json.header.counts.canvases_active` populated correctly | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "canvases_active count"` | ❌ Wave 0 |
| KB-10 | `_header.md` rendered with all 6 resource counts | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "header md has all counts"` | ❌ Wave 0 |
| KB-11 | `connectors.config` value (e.g. `localhost:8765`) never in any generated file | security | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "no connector config leak"` | ❌ Wave 0 |
| KB-11 | `canvases.flow_data` JSON blob never in any file | security | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "no flow_data leak"` | ❌ Wave 0 |
| KB-11 | `email_templates.structure`/`html_preview` never in any file | security | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "no template structure leak"` | ❌ Wave 0 |
| KB-06/11 | Collision pair in short-id generates 2 distinct files | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "short-id collision resolved"` | ❌ Wave 0 |
| KB-06 | Tag translation: `Negocio` → `business`, unknown tags dropped | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "tag derivation"` | ❌ Wave 0 |
| KB-06 | Cross-entity `related` references resolve across types | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "related cross-entity"` | ❌ Wave 0 |

**Oracle test (manual, mandatory pre-close per CONTEXT D4 Nivel 2):**
1. Run on dev DB: `node scripts/kb-sync.cjs --full-rebuild --source db --verbose`
2. Count files: `ls -la .docflow-kb/resources/catpaws/ | wc -l`
3. Ask CatBot via chat: "Lista los CatPaws que existen en el sistema." → pipe through `list_cat_paws` tool
4. Paste both counts to `150-VERIFICATION.md`. Both numbers must match.
5. If CatBot cannot count KB files directly (no `list_kb_resources` tool yet — that's Fase 4), document as gap in `150-VERIFICATION.md` but do NOT block phase close.

### Sampling Rate
- **Per task commit:** `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts` (new test file, ~15 tests, < 30s)
- **Per wave merge:** `cd app && npm run test:unit` (full vitest suite)
- **Phase gate:** (1) full vitest suite green, (2) `node scripts/kb-sync.cjs --full-rebuild --source db` on dev DB produces `validate-kb.cjs` exit 0, (3) Oracle test pasted to 150-VERIFICATION.md, (4) commit of KB snapshot.

### Wave 0 Gaps
- [ ] `app/src/lib/__tests__/kb-sync-db-source.test.ts` — new integration tests (~15 tests), follows `kb-sync-cli.test.ts` pattern (tmpRepo fixture, programmatic DB seeding via `better-sqlite3` in test `beforeEach`)
- [ ] Test helper to build a fixture DB with the 6 target tables + 4 join tables — can be a top-level `createFixtureDb(path)` function in the test file (keeps schema inline rather than reading `app/src/lib/db.ts`, which pulls seeds/migrations)
- [ ] Update `app/src/lib/__tests__/kb-sync-cli.test.ts` Tests 1/2 to account for the new `canvases_active` counts key (assertion needs adjusting if strict `.toEqual`; currently uses `.arrayContaining` which is tolerant — verify in code review)
- [ ] No framework install required (`better-sqlite3`, `vitest` already in `app/package.json`)

### Test Fixture Strategy (CONTEXT D4 "≥2 rows per type, 12+ total")

**Recommended approach:** Programmatic inline schema, NOT importing `app/src/lib/db.ts`.

**Rationale:**
- `app/src/lib/db.ts` does ~5000 lines of table creation, seeding, and migrations at import time (executes on `require`). Tests would incur 1-2 seconds of unwanted side-effects and risk polluting the fixture with production seed rows.
- Copying a minimal CREATE TABLE subset (the 6 target tables + 4 join tables) into the test file keeps the fixture deterministic, fast (<50ms), and self-documenting.
- The schema subset is small (~80 lines of SQL) — manageable to maintain alongside `db.ts`. Drift risk is low because Phase 150 only reads the 6 tables, and the columns it reads are documented in `fields_from_db` per CONTEXT D2.2.

**Example fixture skeleton:**
```typescript
// app/src/lib/__tests__/kb-sync-db-source.test.ts
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

function createFixtureDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE cat_paws (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
      mode TEXT NOT NULL DEFAULT 'chat', model TEXT DEFAULT 'gemini-main',
      system_prompt TEXT, tone TEXT DEFAULT 'profesional', department_tags TEXT,
      is_active INTEGER DEFAULT 1, times_used INTEGER DEFAULT 0,
      temperature REAL DEFAULT 0.7, max_tokens INTEGER DEFAULT 4096,
      output_format TEXT DEFAULT 'md', created_at TEXT, updated_at TEXT);
    CREATE TABLE connectors (id TEXT PRIMARY KEY, name TEXT NOT NULL,
      description TEXT, type TEXT NOT NULL, config TEXT, is_active INTEGER DEFAULT 1,
      test_status TEXT DEFAULT 'untested', times_used INTEGER DEFAULT 0,
      created_at TEXT, updated_at TEXT);
    /* ... skills, catbrains, email_templates, canvases ... */
    CREATE TABLE cat_paw_connectors (paw_id TEXT, connector_id TEXT,
      usage_hint TEXT, is_active INTEGER, UNIQUE(paw_id, connector_id));
    /* ... cat_paw_skills, cat_paw_catbrains, catbrain_connectors ... */
  `);
  // Seed ≥2 rows per type + at least 1 collision pair + 1 deprecated row
  db.prepare(`INSERT INTO cat_paws (id, name, is_active, department_tags, mode) VALUES (?, ?, ?, ?, ?)`)
    .run('fixture-paw-1', 'Test CatPaw Active', 1, 'Negocio', 'chat');
  db.prepare(`INSERT INTO cat_paws (id, name, is_active, mode) VALUES (?, ?, ?, ?)`)
    .run('fixture-paw-2', 'Test CatPaw Inactive', 0, 'processor');
  /* Collision pair: same 8-char prefix */
  db.prepare(`INSERT INTO connectors (id, name, type, config, is_active) VALUES (?, ?, ?, ?, ?)`)
    .run('seed-test-a', 'Test A', 'http_api', '{"secret":"LEAK-A"}', 1);
  db.prepare(`INSERT INTO connectors (id, name, type, config, is_active) VALUES (?, ?, ?, ?, ?)`)
    .run('seed-test-b', 'Test B', 'mcp_server', '{"secret":"LEAK-B"}', 1);
  /* ... ≥12 rows total ... */
  return db;
}
```

Pattern copied from Phase 149 `kb-sync-cli.test.ts:186-251` — `tmpRepo`/`tmpKb` with `beforeEach`/`afterEach` cleanup. Fixture DB lives at `tmpRepo/app/data/docflow.db` so the CLI finds it by default path resolution, or test passes `DATABASE_PATH` env var.

## Sources

### Primary (HIGH confidence)
- `/home/deskmath/docflow/.planning/phases/150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates/150-CONTEXT.md` — locked decisions
- `/home/deskmath/docflow/.planning/ANALYSIS-knowledge-base-architecture.md` §3, §4, §5, §7, Apéndice A — PRD
- `/home/deskmath/docflow/app/src/lib/services/knowledge-sync.ts` (1418 lines) — Phase 149 service; signatures at L721 (`detectBumpLevel`), L1042 (`syncResource`), L1169 (`touchAccess`), L1181 (`markDeprecated`)
- `/home/deskmath/docflow/scripts/kb-sync.cjs` (761 lines) — Phase 149 CLI; `cmdFullRebuild` at L469, `--source db` reject at L476-479
- `/home/deskmath/docflow/scripts/validate-kb.cjs` (411 lines) — Phase 149 validator; tag check at L354-370
- `/home/deskmath/docflow/app/src/lib/db.ts` — DB schema; `cat_paws` L1174, `connectors` L922, `skills` L447, `catbrains` L27, `email_templates` L4483, `canvases` L978, join tables L1157 / L1197 / L1206 / L1223
- `/home/deskmath/docflow/.docflow-kb/_schema/frontmatter.schema.json` — validation rules
- `/home/deskmath/docflow/.docflow-kb/_schema/tag-taxonomy.json` — controlled vocabulary
- `/home/deskmath/docflow/.docflow-kb/_index.json` — v2 shape reference (NOTE: missing `canvases_active`)
- `/home/deskmath/docflow/app/src/lib/__tests__/kb-sync-cli.test.ts` — Phase 149 test pattern
- `/home/deskmath/docflow/app/vitest.config.ts` — `include: ['src/**/*.test.ts']` confirms test location requirement
- Live DB inspection via `node -e "..."` at `/home/deskmath/docflow/app/data/docflow.db`:
  - `cat_paws`: 9 rows, `department_tags` stores Spanish single-value strings ("Negocio")
  - `connectors`: 6 rows, `type` values: `mcp_server, http_api, email_template, gmail`
  - `skills`: 39 rows, `tags` is JSON-encoded array of Spanish words
  - `catbrains`: 1 row (dev scarcity — fixture DB essential for tests)
  - `email_templates`: 9 rows, `html_preview` always NULL, `structure` ~450-845 bytes JSON
  - `canvases`: 2 rows, `flow_data` 4.6-6.6 KB, `tags` NULL
  - Short-id collisions verified: 3 distinct collision sets already exist in live DB

### Secondary (MEDIUM confidence)
- `/home/deskmath/docflow/.planning/phases/149-kb-foundation-bootstrap/149-CONTEXT.md` — Phase 149 scope (what's already built)
- `/home/deskmath/docflow/.planning/STATE.md` — velocity/history; Phase 149 decisions log at L81-86
- `/home/deskmath/docflow/CLAUDE.md` — oracle protocol, knowledge tree requirements
- `/home/deskmath/docflow/.docflow-kb/_manual.md` — KB manual (to update per CONTEXT D3)
- `/home/deskmath/docflow/app/package.json` — dependency versions (`better-sqlite3 ^12.6.2`, `vitest` devDep)

### Tertiary (LOW confidence)
- Node 22 type-stripping behavior for `require('./x.ts')` — verified locally but specific to Node 22.6+; falls back to fail on Node 20. Assumption: no CI matrix testing on Node 20 for these scripts (not verified, planner to confirm).

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — `better-sqlite3` already in repo; no new deps; pattern matches Phase 149 CLI.
- Architecture patterns: **HIGH** — all patterns grounded in file:line references in repo; two-pass cross-entity resolution verified on live DB join queries.
- Don't hand-roll list: **HIGH** — Phase 149 provides all the helpers; copy-paste is explicit.
- Common pitfalls: **HIGH** — all 8 pitfalls verified via direct file inspection or live DB query. Pitfall 1 (missing `canvases_active`) and Pitfall 3 (no idempotence in `syncResource`) are blocking; planner MUST address.
- Validation architecture: **HIGH** — test framework, location, and fixture strategy verified via `app/vitest.config.ts` and existing `kb-sync-cli.test.ts`.
- Pitfall 7 (Node 22 type-stripping portability): **MEDIUM** — verified on host, not tested in Docker/Node 20. Recommendation (stick with CJS) is conservative and zero-risk regardless.

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (30 days — stable domain; DB schema and Phase 149 contracts are unlikely to shift in this window)
