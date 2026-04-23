#!/usr/bin/env node
/**
 * kb-sync-db-source — DB→frontmatter transformer for Phase 150 Plan 02.
 *
 * Reads the 6 live DocFlow SQLite tables (`cat_paws`, `connectors`, `skills`,
 * `catbrains`, `email_templates`, `canvases`), enumerates cross-entity joins,
 * and writes schema-compliant Markdown + YAML frontmatter files under
 * `.docflow-kb/resources/<subtype>/<short-id-slug>.md`.
 *
 * This module is **read-only DB + filesystem write**. Plan 03 layers the
 * idempotence diff (stable-equal comparison) and CLI flag surfacing on top.
 * Plan 04 adds validate-kb.cjs invocation + security canary assertions.
 *
 * Architecture (per 150-RESEARCH §"Architecture Patterns"):
 *   1. openDb(explicitPath)           — Read-only SQLite via better-sqlite3.
 *   2. Pass 1 (buildIdMap)            — Enumerate all 6 tables, build a
 *      per-subtype Map<row.id, short-id-slug> with deterministic collision
 *      resolution (prefix grows 8→12→16→fullId on conflict).
 *   3. Join table loaders             — Eager-load cat_paw_catbrains,
 *      cat_paw_connectors, cat_paw_skills, catbrain_connectors indexed by
 *      source row id for O(1) lookup in Pass 2.
 *   4. Pass 2 (writeResourceFile)     — For each row, build frontmatter +
 *      body, resolve `related` via Pass 1 maps, render YAML (inline
 *      serializer copied from scripts/kb-sync.cjs), write to disk.
 *
 * Security invariants (per CONTEXT §D2.2 + RESEARCH Pitfall 2):
 *   - SELECTs NEVER reference `connectors.config`, `canvases.flow_data`,
 *     `canvases.thumbnail`, `email_templates.structure`,
 *     `email_templates.html_preview`. Grep-verifiable from this file.
 *   - buildBody NEVER renders those same columns even when present on row.
 *
 * Exports:
 *   - populateFromDb(opts) — public entry point. See JSDoc on function.
 *   - _internal           — exposed helpers for unit tests (slugify,
 *     resolveShortIdSlug, deriveTags, openDb, SUBTYPES, SUBTYPE_SUBDIR,
 *     SUBTYPE_TABLE, buildIdMap, SELECTS). Not part of the public API.
 *
 * CJS format (not TS) because the repo root has no package.json; this
 * script runs on bare Node. process['env']['X'] bracket notation is used
 * per CLAUDE.md MEMORY to bypass any future webpack inlining if the script
 * is ever bundled.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// better-sqlite3 lives in app/node_modules/ (the repo root has no
// package.json). Resolving relative to __dirname lets this script run
// standalone from the real repo. When the module is copied to a tmp
// location (test fixtures copy scripts/* to tmpRepo/scripts/*), walk
// upward from __dirname and back through the original repo location
// via KB_SYNC_REPO_ROOT env or a best-effort fallback.
function _resolveBetterSqlite3() {
  const candidates = [];
  // 1) Sibling to scripts/: ../app/node_modules
  candidates.push(path.resolve(__dirname, '..', 'app', 'node_modules', 'better-sqlite3'));
  // 2) Env override (tests / containers may set this)
  const envRoot = process['env']['KB_SYNC_REPO_ROOT'];
  if (envRoot) {
    candidates.push(path.resolve(envRoot, 'app', 'node_modules', 'better-sqlite3'));
  }
  // 3) Ascend from __dirname looking for a node_modules/better-sqlite3
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    candidates.push(path.resolve(dir, 'node_modules', 'better-sqlite3'));
    candidates.push(path.resolve(dir, 'app', 'node_modules', 'better-sqlite3'));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const c of candidates) {
    try {
      // Require the package.json to cheaply test existence without triggering
      // the native addon load on failed probes.
      require.resolve(c);
      return require(c);
    } catch (_) {
      /* try next */
    }
  }
  throw new Error(
    `kb-sync-db-source: cannot locate better-sqlite3. Tried: ${candidates.join(', ')}`
  );
}
const Database = _resolveBetterSqlite3();

// ---------------------------------------------------------------------------
// Section 1 — Paths and constants
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DB_PATH = path.resolve(REPO_ROOT, 'app', 'data', 'docflow.db');
const DEFAULT_KB_ROOT = path.resolve(REPO_ROOT, '.docflow-kb');

/**
 * The 6 entity subtypes populated from DB.
 *
 * Internal identifier uses `'email-template'` (hyphen, singular) everywhere —
 * matches the frontmatter `subtype` field and the KB subdirectory name. Per
 * RESEARCH Open Question 2, no `'template'` alias is introduced.
 */
const SUBTYPES = Object.freeze([
  'catpaw',
  'connector',
  'skill',
  'catbrain',
  'email-template',
  'canvas',
]);

const SUBTYPE_SUBDIR = Object.freeze({
  catpaw: 'resources/catpaws',
  connector: 'resources/connectors',
  skill: 'resources/skills',
  catbrain: 'resources/catbrains',
  'email-template': 'resources/email-templates',
  canvas: 'resources/canvases',
});

const SUBTYPE_TABLE = Object.freeze({
  catpaw: 'cat_paws',
  connector: 'connectors',
  skill: 'skills',
  catbrain: 'catbrains',
  'email-template': 'email_templates',
  canvas: 'canvases',
});

// ---------------------------------------------------------------------------
// Section 2 — openDb (read-only, explicit path resolution)
// ---------------------------------------------------------------------------

/**
 * Open the DocFlow SQLite DB read-only. Priority:
 *   1. explicitPath argument (tests pass a tmpfs fixture).
 *   2. process['env']['DATABASE_PATH'] (matches app/src/lib/db.ts override).
 *   3. path.resolve(__dirname, '..', 'app', 'data', 'docflow.db').
 *
 * Throws with a clear error message if the DB file is missing so tests +
 * the CLI fail fast instead of silently opening an empty DB.
 */
function openDb(explicitPath) {
  const envPath = process['env']['DATABASE_PATH'];
  const dbPath = explicitPath || envPath || DEFAULT_DB_PATH;
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `DB not found at ${dbPath}. Set DATABASE_PATH or run from repo root with a seeded app/data/docflow.db`
    );
  }
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

// ---------------------------------------------------------------------------
// Section 3 — Explicit enumerated SELECTs (security-safe, never SELECT *)
// ---------------------------------------------------------------------------

/**
 * Per-subtype SELECT statements. Each enumerates ONLY the columns listed in
 * CONTEXT §D2.2 `fields_from_db` plus id/created_at/updated_at.
 *
 * Security — these column names MUST NEVER appear in SELECTS below:
 *   - connectors: NO `config`        (can contain API keys + secrets)
 *   - canvases:   NO `flow_data`, `thumbnail`  (bulk payloads)
 *   - email_templates: NO `structure`, `html_preview`  (bulk payloads)
 *
 * Plan 02 verify step greps this file for those literals; Plan 04 adds a
 * runtime assertion on generated .md files.
 */
const SELECTS = Object.freeze({
  catpaw: `SELECT id, name, description, mode, model, system_prompt, tone,
                  department_tags, is_active, times_used, temperature, max_tokens,
                  output_format, rationale_notes, created_at, updated_at
           FROM cat_paws`,
  connector: `SELECT id, name, description, type, is_active, times_used,
                     test_status, rationale_notes, created_at, updated_at
              FROM connectors`,
  skill: `SELECT id, name, description, category, tags, instructions,
                 source, version, author, times_used, rationale_notes,
                 created_at, updated_at
          FROM skills`,
  catbrain: `SELECT id, name, description, purpose, tech_stack, status,
                    agent_id, rag_enabled, rag_collection, rationale_notes,
                    created_at, updated_at
             FROM catbrains`,
  'email-template': `SELECT id, name, description, category, is_active,
                            times_used, ref_code, created_at, updated_at
                     FROM email_templates`,
  canvas: `SELECT id, name, description, mode, status, tags, is_template,
                  rationale_notes, created_at, updated_at
           FROM canvases`,
});

// ---------------------------------------------------------------------------
// Section 4 — Join table loaders (eager-load, index by source id)
// ---------------------------------------------------------------------------

/**
 * Load cat_paw_catbrains + cat_paw_connectors + cat_paw_skills into a
 * single Map<paw_id, Array<{id, subtype, connector_type_raw?}>>.
 *
 * `connector_type_raw` is joined from connectors.type so deriveTags can
 * map the raw DB value (e.g. `mcp_server`) to the taxonomy value (`mcp`).
 *
 * Only active joins are returned (is_active=1 or missing means active).
 * If a referenced id is not in Pass 1 maps, Pass 2 filters it out with
 * a WARN log (see buildFrontmatter).
 */
function loadCatPawRelations(db) {
  const byPaw = new Map();
  const pushRel = (pawId, rel) => {
    if (!byPaw.has(pawId)) byPaw.set(pawId, []);
    byPaw.get(pawId).push(rel);
  };

  const pawCbRows = db
    .prepare(
      `SELECT paw_id, catbrain_id FROM cat_paw_catbrains`
    )
    .all();
  for (const r of pawCbRows) {
    pushRel(r.paw_id, { id: r.catbrain_id, subtype: 'catbrain' });
  }

  // Join with connectors.type so deriveTags can enrich catpaw tags with
  // the connector type taxonomy (e.g. `gmail`, `mcp`, `http`). Also pull
  // the connector name for Phase 156 search_hints (KB-42 oracle gap).
  const pawCnRows = db
    .prepare(
      `SELECT cpc.paw_id, cpc.connector_id, c.type AS connector_type_raw, c.name AS connector_name
       FROM cat_paw_connectors cpc
       LEFT JOIN connectors c ON cpc.connector_id = c.id
       WHERE cpc.is_active = 1 OR cpc.is_active IS NULL`
    )
    .all();
  for (const r of pawCnRows) {
    pushRel(r.paw_id, {
      id: r.connector_id,
      subtype: 'connector',
      connector_type_raw: r.connector_type_raw,
      name: r.connector_name,
    });
  }

  const pawSkRows = db
    .prepare(
      `SELECT cps.paw_id, cps.skill_id, s.name AS skill_name
       FROM cat_paw_skills cps
       LEFT JOIN skills s ON cps.skill_id = s.id`
    )
    .all();
  for (const r of pawSkRows) {
    pushRel(r.paw_id, { id: r.skill_id, subtype: 'skill', name: r.skill_name });
  }

  return byPaw;
}

/**
 * Load catbrain_connectors (catbrain-scoped connectors) into
 * Map<catbrain_id, Array<{id, subtype}>>.
 *
 * Note: catbrain_connectors has its own `id` column — the join semantic is
 * catbrain → owned connectors, not catbrain → global connectors table.
 * For KB `related`, we reference the catbrain_connectors.id as a
 * connector-subtype target. If no matching connector exists in Pass 1
 * maps, it's logged as orphan and dropped (expected — catbrain_connectors
 * rows don't correspond to rows in the main `connectors` table).
 */
function loadCatbrainRelations(db) {
  const byBrain = new Map();
  const rows = db
    .prepare(
      `SELECT catbrain_id, id AS owned_connector_id
       FROM catbrain_connectors
       WHERE is_active = 1 OR is_active IS NULL`
    )
    .all();
  for (const r of rows) {
    if (!byBrain.has(r.catbrain_id)) byBrain.set(r.catbrain_id, []);
    byBrain
      .get(r.catbrain_id)
      .push({ id: r.owned_connector_id, subtype: 'connector' });
  }
  return byBrain;
}

/**
 * Phase 157 KB-47 — CJS mirror of `renderLinkedSection` in
 * app/src/lib/services/knowledge-sync.ts:1021-1028. MUST stay byte-equivalent
 * so rebuild (`--full-rebuild --source db`) produces identical bodies to the
 * runtime path (`syncResource('catpaw','update')`). Phase 150 KB-09
 * `isNoopUpdate` uses stable-equal comparison on the rendered body — any
 * format drift here causes a false-positive diff on every subsequent run.
 *
 * Caller is responsible for sorting `items` ASC by name (splitRelationsBySubtype
 * does this for the known connector/skill arrays). Empty array returns the
 * italic placeholder — NEVER an empty string, NEVER omitted (RESEARCH Pitfall 3).
 *
 * @param {Array<{id: string, name: string}>} items  Sorted by name ASC.
 * @param {string} emptyLabel  Placeholder label WITHOUT wrapping underscores.
 * @returns {string}  Joined markdown list or `_(<emptyLabel>)_`.
 */
function renderLinkedSectionCjs(items, emptyLabel) {
  if (items.length === 0) return `_(${emptyLabel})_`;
  return items.map((i) => `- **${i.name}** (\`${i.id}\`)`).join('\n');
}

/**
 * Phase 157 KB-47 — split the flat relations array produced by
 * `loadCatPawRelations(db)` into `{ connectors, skills }` buckets, both sorted
 * ASC by name. Shape reference (RESEARCH Pitfall 2): the input is a flat
 * `Array<{id, subtype, name?, ...}>` — NOT the `{connectors:[], skills:[]}`
 * pre-nested shape some earlier notes suggested.
 *
 * `catbrain` subtype relations are silently ignored — this helper exists only
 * to build the catpaw body's two linked sections. Items without a `name`
 * field are also dropped (defensive: orphan joins lacking the LEFT JOIN row
 * cannot be rendered). Name used for sort is the raw string (locale-aware
 * via String.prototype.localeCompare) to match the runtime path ORDER BY in
 * catbot-tools.ts:2148.
 *
 * @param {Array<{id:string, subtype:string, name?:string}>} relations
 * @returns {{ connectors: Array<{id,name}>, skills: Array<{id,name}> }}
 */
function splitRelationsBySubtype(relations) {
  const connectors = [];
  const skills = [];
  for (const r of relations || []) {
    if (r.subtype === 'connector' && r.name) {
      connectors.push({ id: r.id, name: r.name });
    } else if (r.subtype === 'skill' && r.name) {
      skills.push({ id: r.id, name: r.name });
    }
  }
  connectors.sort((a, b) => a.name.localeCompare(b.name));
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return { connectors, skills };
}

/**
 * Phase 157 KB-46 — scan `.docflow-legacy/orphans/<subtype-subdir>/*.md` and
 * return a `Set<"<subtype>:<short-id-slug>">` of keys to exclude from
 * `populateFromDb` Pass-2 writes.
 *
 * The legacy root is a SIBLING of the KB root (both under repo root), so we
 * resolve it as `path.resolve(kbRoot, '..', '.docflow-legacy', 'orphans')`.
 * Historical bug (commit 06d69af7): Pass-2 had no exclusion step so any row
 * whose canonical archived copy lived under `.docflow-legacy/orphans/` got
 * "resurrected" on `--full-rebuild --source db`. This helper is the
 * discovery half of the fix; `populateFromDb` applies the exclusion.
 *
 * A missing `.docflow-legacy/orphans/` tree returns an empty Set (valid
 * state: fresh repo or pre-Phase-156 checkout). Subdirectory names match
 * the filesystem (plural, hyphenated), but the emitted keys use the
 * internal singular subtype names from `SUBTYPES` so callers can match
 * against `maps[subtype].get(row.id)` directly.
 *
 * @param {string} kbRoot Absolute path to `.docflow-kb/`.
 * @returns {Set<string>} `{ "catpaw:<slug>", "canvas:<slug>", ... }`.
 */
function loadArchivedIds(kbRoot) {
  const ids = new Set();
  const legacyRoot = path.resolve(kbRoot, '..', '.docflow-legacy', 'orphans');
  if (!fs.existsSync(legacyRoot)) return ids;
  for (const sub of SUBTYPES) {
    // SUBTYPE_SUBDIR values look like 'resources/catpaws' → take last segment
    // ('catpaws') because `.docflow-legacy/orphans/` mirrors only the leaf.
    const subdirName = SUBTYPE_SUBDIR[sub].split('/').pop();
    const dir = path.join(legacyRoot, subdirName);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      ids.add(`${sub}:${f.slice(0, -3)}`);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Section 5 — slugify + collision resolver
// ---------------------------------------------------------------------------

/**
 * Normalize an arbitrary string to a safe kebab-case slug (ASCII, lowercase,
 * hyphen-separated, no diacritics, ≤50 chars).
 *
 * Example: "Operador Holded Fixture" → "operador-holded-fixture"
 *          "Canales de Atención"     → "canales-de-atencion"
 */
function slugify(name) {
  return (
    String(name || 'unnamed')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '') // strip diacritics
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'unnamed'
  );
}

/**
 * Deterministic short-id-slug generator with collision resolution.
 *
 * Strategy (per RESEARCH Architecture Pattern 3): try 8-char prefix first;
 * on collision in typeMap, escalate to 12, 16, then full id length. Ultimate
 * fallback: append a numeric suffix.
 *
 * Note: typeMap is scoped per-subtype (not global) — two different subtypes
 * with the same short-id-slug land in different subdirectories, so no
 * filesystem collision.
 *
 * @param fullId    The row's full id (DB primary key).
 * @param slug      The slugified name.
 * @param typeMap   Map<row.id, short-id-slug> — existing claims for the subtype.
 *                  Caller is responsible for .set() after receiving the result.
 * @returns         Unique short-id-slug for this row within its subtype.
 */
function resolveShortIdSlug(fullId, slug, typeMap) {
  const claimed = new Set(typeMap.values());
  const lengthsToTry = [8, 12, 16, fullId.length];
  // Dedupe + sort ascending so we always try the shortest prefix first.
  const uniqueLengths = Array.from(new Set(lengthsToTry)).sort((a, b) => a - b);
  for (const len of uniqueLengths) {
    const candidate = `${fullId.slice(0, len)}-${slug}`;
    if (!claimed.has(candidate)) return candidate;
  }
  // Extreme fallback: numeric suffix on full id + slug.
  let i = 2;
  while (claimed.has(`${fullId}-${slug}-${i}`)) i++;
  return `${fullId}-${slug}-${i}`;
}

// ---------------------------------------------------------------------------
// Section 6 — Pass 1: buildIdMap
// ---------------------------------------------------------------------------

/**
 * Pass 1 of the two-pass pipeline. Reads all SELECT'd rows into memory and
 * computes a per-subtype Map<row.id, short-id-slug>. Rows with missing
 * id or name are SKIPPED (per CONTEXT "Claude's Discretion": skip + WARN).
 *
 * @param db                 The opened better-sqlite3 Database instance.
 * @param subtypesFilter     Optional array of subtypes to include. When
 *                           null/undefined → all 6 are processed.
 * @returns                  { rows: { subtype: row[] }, maps: { subtype: Map } }.
 */
function buildIdMap(db, subtypesFilter) {
  const rows = {};
  const maps = {};
  for (const sub of SUBTYPES) {
    if (subtypesFilter && !subtypesFilter.includes(sub)) {
      rows[sub] = [];
      maps[sub] = new Map();
      continue;
    }
    rows[sub] = db.prepare(SELECTS[sub]).all();
    maps[sub] = new Map();
    for (const row of rows[sub]) {
      if (!row.id || !row.name) continue; // skip + WARN handled downstream
      const slug = slugify(row.name);
      const shortIdSlug = resolveShortIdSlug(row.id, slug, maps[sub]);
      maps[sub].set(row.id, shortIdSlug);
    }
  }
  return { rows, maps };
}

// ---------------------------------------------------------------------------
// Section 7 — Tag translation + derivation
// ---------------------------------------------------------------------------

/**
 * Spanish department label → taxonomy department. Per RESEARCH Pitfall 6,
 * live `cat_paws.department_tags` stores natural-language Spanish values
 * like "Negocio" that don't exist in tag-taxonomy.departments (which are
 * English: business/finance/production/other).
 */
const DEPARTMENT_MAP = Object.freeze({
  negocio: 'business',
  finanzas: 'finance',
  producción: 'production',
  produccion: 'production',
  otro: 'other',
});

/**
 * DB connector.type → taxonomy.connectors. The DB stores raw identifiers
 * like `mcp_server`/`http_api`; taxonomy uses short names. Unmapped types
 * → null (silent drop).
 */
const CONNECTOR_TYPE_MAP = Object.freeze({
  mcp_server: 'mcp',
  http_api: 'http',
  gmail: 'gmail',
  drive: 'drive',
  holded: 'holded',
  smtp: 'smtp',
  n8n: 'n8n',
  email_template: null, // no taxonomy mapping — drop
});

/**
 * Connector type → implicit domain. Per CONTEXT §D2.1 ("gmail → email").
 * Only emits if the domain is actually in taxonomy.domains.
 */
const TYPE_TO_DOMAIN = Object.freeze({
  gmail: 'email',
  smtp: 'email',
  holded: 'crm',
  drive: 'storage',
});

let _taxonomy = null;
function loadTaxonomy(kbRoot) {
  if (_taxonomy) return _taxonomy;
  const p = path.join(kbRoot, '_schema', 'tag-taxonomy.json');
  _taxonomy = JSON.parse(fs.readFileSync(p, 'utf8'));
  return _taxonomy;
}

// Allow tests to reset between describe blocks if they mutate the kbRoot.
function _resetTaxonomyCache() {
  _taxonomy = null;
}

/**
 * Derive the tags array for a row. Always includes the entity tag as floor
 * (taxonomy.entities member — `template` for email-template per tag-taxonomy.json).
 *
 * Unknown/unmapped tags are silently dropped (validate-kb.cjs would reject
 * them). When `verbose=true` or `process['env']['KB_SYNC_VERBOSE']` is set,
 * emits a `WARN` to stderr for each dropped tag — matches Advisory 1 from
 * the plan-checker (CONTEXT §D2.1 mandates the WARN).
 */
function deriveTags(subtype, row, kbRoot, relations, opts) {
  const options = opts || {};
  const verbose = options.verbose || !!process['env']['KB_SYNC_VERBOSE'];
  const dropped = [];
  const tax = loadTaxonomy(kbRoot);
  // Floor tag (taxonomy.entities): email-template → 'template' (no hyphen).
  const entityTag = subtype === 'email-template' ? 'template' : subtype;
  const out = new Set([entityTag]);

  const tryAdd = (value, bucket) => {
    if (value == null) return;
    const s = String(value).toLowerCase();
    if (Array.isArray(tax[bucket]) && tax[bucket].includes(s)) {
      out.add(s);
      return;
    }
    dropped.push({ tag: value, bucket });
  };

  if (subtype === 'catpaw') {
    tryAdd(row.mode, 'modes');
    const rawDept = String(row.department_tags || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const d of rawDept) {
      const translated = DEPARTMENT_MAP[d.toLowerCase()];
      if (translated && tax.departments.includes(translated)) {
        out.add(translated);
      } else {
        dropped.push({ tag: d, bucket: 'departments' });
      }
    }
    // Add connector types from cat_paw_connectors relations.
    for (const rel of relations || []) {
      if (rel.subtype !== 'connector') continue;
      const connType = rel.connector_type_raw;
      const mapped = connType ? CONNECTOR_TYPE_MAP[connType] : null;
      if (mapped && tax.connectors.includes(mapped)) {
        out.add(mapped);
        const dom = TYPE_TO_DOMAIN[mapped];
        if (dom && tax.domains.includes(dom)) out.add(dom);
      } else if (connType) {
        dropped.push({ tag: connType, bucket: 'connectors' });
      }
    }
  } else if (subtype === 'connector') {
    const mapped = CONNECTOR_TYPE_MAP[row.type];
    if (mapped && tax.connectors.includes(mapped)) {
      out.add(mapped);
      const dom = TYPE_TO_DOMAIN[mapped];
      if (dom && tax.domains.includes(dom)) out.add(dom);
    } else if (row.type) {
      dropped.push({ tag: row.type, bucket: 'connectors' });
    }
  } else if (subtype === 'skill') {
    if (row.category) tryAdd(row.category, 'roles');
    try {
      const parsed = JSON.parse(row.tags || '[]');
      if (Array.isArray(parsed)) {
        for (const t of parsed) {
          const s = String(t).toLowerCase();
          if (tax.cross_cutting.includes(s)) {
            out.add(s);
          } else {
            dropped.push({ tag: t, bucket: 'cross_cutting' });
          }
        }
      }
    } catch {
      // Malformed JSON → ignore quietly; entity floor tag still emitted.
    }
  } else if (subtype === 'catbrain') {
    const hasConnectors =
      Array.isArray(relations) && relations.length > 0;
    const mode = row.rag_enabled
      ? 'chat'
      : hasConnectors
        ? 'processor'
        : 'hybrid';
    if (tax.modes.includes(mode)) out.add(mode);
  } else if (subtype === 'email-template') {
    if (row.category) tryAdd(row.category, 'domains');
    if (tax.domains.includes('email')) out.add('email');
  } else if (subtype === 'canvas') {
    tryAdd(row.mode, 'modes');
    const rawTags = String(row.tags || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const t of rawTags) {
      const s = t.toLowerCase();
      let matched = false;
      for (const bucket of Object.values(tax)) {
        if (Array.isArray(bucket) && bucket.includes(s)) {
          out.add(s);
          matched = true;
          break;
        }
      }
      if (!matched) dropped.push({ tag: t, bucket: 'any' });
    }
  }

  if (verbose && dropped.length > 0) {
    // Advisory 1 from plan-checker: WARN per file when tags are dropped.
    const idLabel = row.id || '<no-id>';
    console.warn(
      `WARN [tags] ${subtype}/${idLabel} dropped: ${dropped
        .map((d) => `${d.tag} (→${d.bucket})`)
        .join(', ')}`
    );
  }

  return Array.from(out);
}

// ---------------------------------------------------------------------------
// Section 8 — Inline YAML serializer (copied byte-for-byte from
// scripts/kb-sync.cjs lines ~246-377 per RESEARCH "Don't Hand-Roll")
// ---------------------------------------------------------------------------

function needsQuoting(s) {
  if (typeof s !== 'string') return false;
  if (s === '') return true;
  if (/:\s/.test(s)) return true;
  if (s.endsWith(':')) return true;
  if (/^[!&*?|>@`%#,[\]{}]/.test(s)) return true;
  if (/^(true|false|null|~|yes|no)$/i.test(s)) return true;
  return false;
}

function formatScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    if (needsQuoting(v)) return `"${v.replace(/"/g, '\\"')}"`;
    return v;
  }
  return String(v);
}

function isInlineDict(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  const entries = Object.entries(d);
  if (entries.length === 0) return true;
  if (entries.length > 6) return false;
  return entries.every(
    ([, v]) =>
      v === null ||
      typeof v !== 'object' ||
      (Array.isArray(v) === false && typeof v === 'string')
  );
}

function serializeInlineDict(d) {
  const entries = Object.entries(d).map(
    ([k, v]) => `${k}: ${formatScalar(v)}`
  );
  return `{ ${entries.join(', ')} }`;
}

function serializeKV(key, value, indentLevel) {
  const indent = '  '.repeat(indentLevel);
  const out = [];
  if (value === null || value === undefined) {
    out.push(`${indent}${key}: null`);
    return out;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push(`${indent}${key}: []`);
      return out;
    }
    if (value.every((x) => x === null || typeof x !== 'object')) {
      const items = value.map(formatScalar).join(', ');
      out.push(`${indent}${key}: [${items}]`);
      return out;
    }
    out.push(`${indent}${key}:`);
    for (const item of value) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        if (isInlineDict(item)) {
          out.push(`${indent}  - ${serializeInlineDict(item)}`);
        } else {
          const entries = Object.entries(item);
          if (entries.length === 0) {
            out.push(`${indent}  - {}`);
            continue;
          }
          const [firstK, firstV] = entries[0];
          out.push(`${indent}  - ${firstK}: ${formatScalar(firstV)}`);
          for (let k = 1; k < entries.length; k++) {
            const [ek, ev] = entries[k];
            if (ev && typeof ev === 'object') {
              out.push(...serializeKV(ek, ev, indentLevel + 2));
            } else {
              out.push(`${indent}    ${ek}: ${formatScalar(ev)}`);
            }
          }
        }
      } else {
        out.push(`${indent}  - ${formatScalar(item)}`);
      }
    }
    return out;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      out.push(`${indent}${key}: {}`);
      return out;
    }
    out.push(`${indent}${key}:`);
    for (const [k, v] of entries) {
      if (v && typeof v === 'object') {
        out.push(...serializeKV(k, v, indentLevel + 1));
      } else {
        out.push(`${indent}  ${k}: ${formatScalar(v)}`);
      }
    }
    return out;
  }
  out.push(`${indent}${key}: ${formatScalar(value)}`);
  return out;
}

/**
 * Serialize a frontmatter object to YAML text. Uses a fixed key order
 * compatible with scripts/validate-kb.cjs and scripts/kb-sync.cjs.
 */
function serializeYAML(fm) {
  const lines = [];
  const ORDER = [
    'id',
    'type',
    'subtype',
    'lang',
    'title',
    'summary',
    'tags',
    'audience',
    'status',
    'created_at',
    'created_by',
    'version',
    'updated_at',
    'updated_by',
    'last_accessed_at',
    'access_count',
    'deprecated_at',
    'deprecated_by',
    'deprecated_reason',
    'superseded_by',
    'source_of_truth',
    'enriched_fields',
    'related',
    'search_hints',
    'change_log',
    'ttl',
    'generated_at',
    'eligible_for_purge',
    'warning_only',
    'warning_visible',
  ];
  const seen = new Set();
  const keys = [
    ...ORDER.filter((k) => k in fm),
    ...Object.keys(fm).filter((k) => !ORDER.includes(k)),
  ];
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(...serializeKV(key, fm[key], 0));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Section 9 — buildFrontmatter (Pass 2 helper)
// ---------------------------------------------------------------------------

/**
 * Canonical per-subtype list of DB columns that are "ground truth" from the
 * DB (per CONTEXT §D2.2). These are the fields auto-sync overwrites on
 * every run; anything else in the file body is "enriched" and preserved.
 *
 * NOTE: `config`, `flow_data`, `thumbnail`, `structure`, `html_preview` are
 * deliberately OMITTED per CONTEXT §D2.2 + RESEARCH Pitfall 2.
 */
const FIELDS_FROM_DB_BY_SUBTYPE = Object.freeze({
  catpaw: [
    'name',
    'description',
    'mode',
    'model',
    'system_prompt',
    'tone',
    'department_tags',
    'is_active',
    'times_used',
    'temperature',
    'max_tokens',
    'output_format',
    'rationale_notes',
  ],
  connector: [
    'name',
    'description',
    'type',
    'is_active',
    'times_used',
    'test_status',
    'rationale_notes',
  ],
  skill: [
    'name',
    'description',
    'category',
    'tags',
    'instructions',
    'source',
    'version',
    'author',
    'times_used',
    'rationale_notes',
  ],
  catbrain: [
    'name',
    'description',
    'purpose',
    'tech_stack',
    'status',
    'agent_id',
    'rag_enabled',
    'rag_collection',
    'rationale_notes',
  ],
  'email-template': [
    'name',
    'description',
    'category',
    'is_active',
    'times_used',
  ],
  canvas: [
    'name',
    'description',
    'mode',
    'status',
    'tags',
    'is_template',
    'rationale_notes',
  ],
});

/**
 * Build a frontmatter object for a DB row. Fully deterministic given the
 * same inputs (important for Plan 03's idempotence comparison).
 *
 * @param subtype     One of SUBTYPES.
 * @param row         The raw row object from SELECTS[subtype].
 * @param kbRoot      Absolute path to the .docflow-kb/ root.
 * @param maps        Per-subtype Map<row.id, short-id-slug> from Pass 1.
 * @param relations   Optional array of {id, subtype, ...} for the row.
 * @returns           Plain object ready for serializeYAML().
 */
function buildFrontmatter(subtype, row, kbRoot, maps, relations) {
  const shortIdSlug = maps[subtype].get(row.id);

  // Status derivation per CONTEXT §D2 mapping table.
  let status;
  if (subtype === 'canvas' && row.status === 'archived') {
    status = 'deprecated';
  } else if (subtype === 'catbrain' && row.status === 'draft') {
    status = 'draft';
  } else if (row.is_active === 0 || row.is_active === false) {
    status = 'deprecated';
  } else {
    status = 'active';
  }

  // Timestamps: prefer DB ground truth so repeated runs produce stable bytes.
  const nowFallback = new Date().toISOString();
  const createdAt = row.created_at || row.updated_at || nowFallback;
  const updatedAt = row.updated_at || row.created_at || nowFallback;

  // Audience per CONTEXT §D2: skills → developer instead of architect.
  const audience =
    subtype === 'skill' ? ['catbot', 'developer'] : ['catbot', 'architect'];

  // Summary: truncate to 200 chars with ellipsis (per CONTEXT §D2).
  const rawSummary = String(row.description || `${subtype} sin descripción`);
  const summary =
    rawSummary.length > 200 ? rawSummary.slice(0, 197) + '...' : rawSummary;

  // source_of_truth — always a single-element array (one DB row per file).
  const sourceOfTruth = [
    {
      db: 'sqlite',
      table: SUBTYPE_TABLE[subtype],
      id: row.id,
      fields_from_db: FIELDS_FROM_DB_BY_SUBTYPE[subtype],
    },
  ];

  // Tags — derived from taxonomy-validated mapping per CONTEXT §D2.1.
  const derivedTags = deriveTags(subtype, row, kbRoot, relations);

  // Cross-entity related: resolve Pass 1 maps to short-id-slug targets.
  // Orphan references (targets not in map) are logged + dropped.
  const related = [];
  for (const rel of relations || []) {
    const targetMap = maps[rel.subtype];
    if (!targetMap) continue;
    const targetShortId = targetMap.get(rel.id);
    if (!targetShortId) {
      if (process['env']['KB_SYNC_VERBOSE']) {
        console.warn(
          `WARN [related] orphan ${rel.subtype}/${rel.id} referenced by ${subtype}/${row.id}`
        );
      }
      continue;
    }
    related.push({ type: rel.subtype, id: targetShortId });
  }

  // change_log — always 1 initial entry at version 1.0.0.
  const changeLog = [
    {
      version: '1.0.0',
      date: updatedAt.slice(0, 10),
      author: 'kb-sync-bootstrap',
      change: 'Initial population from DB via Phase 150',
    },
  ];

  const fm = {
    id: shortIdSlug,
    type: 'resource',
    subtype,
    lang: 'es',
    title: String(row.name),
    summary,
    tags: derivedTags,
    audience,
    status,
    created_at: createdAt,
    created_by: 'kb-sync-bootstrap',
    version: '1.0.0',
    updated_at: updatedAt,
    updated_by: 'kb-sync-bootstrap',
    source_of_truth: sourceOfTruth,
    ttl: 'never',
  };
  if (related.length > 0) fm.related = related;

  // Phase 156 KB-42 (search_hints extension) — para catpaws, populate
  // search_hints con nombres de conectores + skills vinculadas para que
  // search_kb({search:"holded"}) encuentre CatPaws por connector name.
  // Dedup case-insensitive + sort ASC (determinismo para isNoopUpdate).
  if (subtype === 'catpaw' && Array.isArray(relations) && relations.length > 0) {
    const rawHints = [];
    for (const rel of relations) {
      if ((rel.subtype === 'connector' || rel.subtype === 'skill') &&
          typeof rel.name === 'string' && rel.name.trim() !== '') {
        rawHints.push(rel.name);
      }
    }
    const seen = new Set();
    const uniqueHints = [];
    for (const h of rawHints) {
      const k = h.toLowerCase();
      if (!seen.has(k)) { seen.add(k); uniqueHints.push(h); }
    }
    uniqueHints.sort((a, b) => a.localeCompare(b));
    if (uniqueHints.length > 0) fm.search_hints = uniqueHints;
  }

  if (status === 'deprecated') {
    fm.deprecated_at = updatedAt;
    fm.deprecated_by = 'kb-sync-bootstrap';
    fm.deprecated_reason =
      subtype === 'canvas' && row.status === 'archived'
        ? 'status=archived at first population'
        : 'is_active=0 at first population';
  }
  fm.change_log = changeLog;
  return fm;
}

// ---------------------------------------------------------------------------
// Section 10 — buildBody (Pass 2 helper)
// ---------------------------------------------------------------------------

/**
 * Build a human-readable Markdown body for a DB row. Renders only the
 * "legible" (non-bulk, non-secret) fields per CONTEXT §D2 "Shape canónico".
 *
 * Security invariant: never renders `row.config`, `row.flow_data`,
 * `row.thumbnail`, `row.structure`, `row.html_preview` even if present
 * on the row object.
 *
 * @param {string} subtype     One of SUBTYPES.
 * @param {object} row         Raw DB row.
 * @param {Array}  [relations] Optional flat relations array (from
 *   loadCatPawRelations). Only consumed for `subtype === 'catpaw'` —
 *   ignored for every other subtype (backwards-compat). Phase 157 KB-47:
 *   when present on a catpaw, renders `## Conectores vinculados` +
 *   `## Skills vinculadas` byte-equivalent to the runtime path at
 *   knowledge-sync.ts:1114-1121 so second-run rebuilds are noop.
 */
function buildBody(subtype, row, relations) {
  const lines = [];
  lines.push('');
  lines.push('## Descripción');
  lines.push('');
  lines.push(String(row.description || '_(sin descripción)_'));
  lines.push('');
  lines.push('## Configuración');
  lines.push('');

  if (subtype === 'catpaw') {
    lines.push(`- **Mode:** ${row.mode || 'chat'}`);
    lines.push(`- **Model:** ${row.model || 'gemini-main'}`);
    if (row.temperature != null) {
      lines.push(`- **Temperatura:** ${row.temperature}`);
    }
    if (row.max_tokens != null) {
      lines.push(`- **Max tokens:** ${row.max_tokens}`);
    }
    if (row.output_format) {
      lines.push(`- **Output format:** ${row.output_format}`);
    }
    if (row.tone) lines.push(`- **Tone:** ${row.tone}`);
    if (row.department_tags) {
      lines.push(`- **Department tags:** ${row.department_tags}`);
    }
    lines.push(`- **times_used:** ${row.times_used != null ? row.times_used : 0}`);
    if (row.system_prompt) {
      lines.push('');
      lines.push('## System Prompt');
      lines.push('');
      lines.push('```');
      lines.push(String(row.system_prompt).slice(0, 1000));
      lines.push('```');
    }
    // Phase 157 KB-47 — linked sections, byte-equivalent to the runtime path
    // at knowledge-sync.ts:1114-1121. Sections are ALWAYS rendered (placeholder
    // when empty) so (a) idempotence holds: after this rebuild, Phase 156-02
    // `replaceOrAppendSection` regex finds the section header and noop-replaces
    // with identical body; (b) Pitfall 3 is respected: empty != omitted. The
    // relations array comes from `loadCatPawRelations(db).get(row.id)` — its
    // items are discriminated by rel.subtype; splitRelationsBySubtype buckets
    // + sorts them ASC by name so renderLinkedSectionCjs emits stable output.
    const { connectors: catpawConnectors, skills: catpawSkills } =
      splitRelationsBySubtype(relations || []);
    lines.push('');
    lines.push('## Conectores vinculados');
    lines.push('');
    lines.push(renderLinkedSectionCjs(catpawConnectors, 'sin conectores vinculados'));
    lines.push('');
    lines.push('## Skills vinculadas');
    lines.push('');
    lines.push(renderLinkedSectionCjs(catpawSkills, 'sin skills vinculadas'));
  } else if (subtype === 'connector') {
    lines.push(`- **Type:** ${row.type}`);
    lines.push(`- **test_status:** ${row.test_status || 'untested'}`);
    lines.push(`- **times_used:** ${row.times_used != null ? row.times_used : 0}`);
    // NEVER render row.config (security)
  } else if (subtype === 'skill') {
    lines.push(`- **Category:** ${row.category || '-'}`);
    lines.push(`- **Source:** ${row.source || '-'}`);
    lines.push(`- **Version:** ${row.version || '-'}`);
    lines.push(`- **Author:** ${row.author || '-'}`);
    lines.push(`- **times_used:** ${row.times_used != null ? row.times_used : 0}`);
    if (row.instructions) {
      lines.push('');
      lines.push('## Instrucciones');
      lines.push('');
      lines.push(String(row.instructions).slice(0, 2000));
    }
  } else if (subtype === 'catbrain') {
    lines.push(`- **Purpose:** ${row.purpose || '-'}`);
    lines.push(`- **Tech stack:** ${row.tech_stack || '-'}`);
    lines.push(`- **Status:** ${row.status || '-'}`);
    lines.push(`- **RAG enabled:** ${row.rag_enabled ? 'yes' : 'no'}`);
    if (row.rag_collection) {
      lines.push(`- **RAG collection:** ${row.rag_collection}`);
    }
  } else if (subtype === 'email-template') {
    lines.push(`- **Category:** ${row.category || '-'}`);
    lines.push(`- **Ref code:** ${row.ref_code || '-'}`);
    lines.push(`- **times_used:** ${row.times_used != null ? row.times_used : 0}`);
    // NEVER render row.structure / row.html_preview (security)
  } else if (subtype === 'canvas') {
    lines.push(`- **Mode:** ${row.mode || '-'}`);
    lines.push(`- **Status (DB):** ${row.status || '-'}`);
    lines.push(`- **Is template:** ${row.is_template ? 'yes' : 'no'}`);
    if (row.tags) lines.push(`- **Tags (raw):** ${row.tags}`);
    // NEVER render row.flow_data / row.thumbnail (security)
  }

  // v30.4 Cronista CatDev (P4): render rationale_notes as "## Historial de mejoras".
  // Column rationale_notes is JSON array of { date, change, why, tip?, prompt_snippet?, session_ref?, author? }.
  // Supported subtypes: catpaw, canvas, catbrain, connector, skill (email-template NOT yet covered).
  if (row.rationale_notes && ['catpaw', 'canvas', 'catbrain', 'connector', 'skill'].includes(subtype)) {
    let entries = [];
    try { entries = JSON.parse(row.rationale_notes); } catch { entries = []; }
    if (Array.isArray(entries) && entries.length > 0) {
      lines.push('');
      lines.push('## Historial de mejoras');
      lines.push('');
      lines.push('> Entries gestionadas por la skill "Cronista CatDev" (v30.4). Append-only, idempotente por (date, change). No editar a mano — usar tool `update_' + subtype + '_rationale` via CatBot.');
      lines.push('');
      // Most recent first
      const sorted = [...entries].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      for (const e of sorted) {
        const date = e.date || '?';
        const ref = e.session_ref ? ` — _${e.session_ref}_` : '';
        const author = e.author ? ` (by ${e.author})` : '';
        lines.push(`### ${date}${ref}${author}`);
        lines.push('');
        lines.push(`**${e.change || '(sin change)'}**`);
        lines.push('');
        if (e.why) { lines.push(`_Por qué:_ ${e.why}`); lines.push(''); }
        if (e.tip) { lines.push(`_Tip:_ ${e.tip}`); lines.push(''); }
        if (e.prompt_snippet) {
          lines.push('<details><summary>Prompt snippet</summary>');
          lines.push('');
          lines.push('```');
          lines.push(String(e.prompt_snippet));
          lines.push('```');
          lines.push('</details>');
          lines.push('');
        }
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Section 10.5 — Minimal YAML parser (read existing file frontmatter for diff)
//
// The parser is a subset matching what the inline serializer produces; it
// handles scalars, inline lists/dicts, block maps, and block lists of inline
// dicts. Copied-and-adapted from scripts/kb-sync.cjs parseYAML. Only used
// for idempotence comparison — writes go through serializeYAML above.
// ---------------------------------------------------------------------------

function parseYAML(yamlText) {
  const lines = yamlText.split('\n');
  const result = {};
  let i = 0;

  function parseScalar(v) {
    v = v.trim();
    if (v === '' || v === 'null' || v === '~') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (/^-?\d+$/.test(v)) return parseInt(v, 10);
    if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
    if (v.startsWith('[') && v.endsWith(']')) return parseInlineList(v);
    if (v.startsWith('{') && v.endsWith('}')) return parseInlineDict(v);
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      return v.slice(1, -1);
    }
    return v;
  }

  function parseInlineList(v) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return smartSplit(inner, ',').map((x) => parseScalar(x));
  }

  function parseInlineDict(v) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return {};
    const pairs = smartSplit(inner, ',');
    const d = {};
    for (const pair of pairs) {
      const colonIdx = findTopLevelColon(pair);
      if (colonIdx === -1) continue;
      const k = pair.slice(0, colonIdx).trim();
      const val = pair.slice(colonIdx + 1).trim();
      d[k] = parseScalar(val);
    }
    return d;
  }

  function smartSplit(s, sep) {
    const out = [];
    let buf = '';
    let depthBracket = 0;
    let depthBrace = 0;
    let inQuote = null;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (inQuote) {
        if (c === inQuote) inQuote = null;
        buf += c;
        continue;
      }
      if (c === '"' || c === "'") {
        inQuote = c;
        buf += c;
        continue;
      }
      if (c === '[') depthBracket++;
      else if (c === ']') depthBracket--;
      else if (c === '{') depthBrace++;
      else if (c === '}') depthBrace--;
      if (c === sep && depthBracket === 0 && depthBrace === 0) {
        out.push(buf.trim());
        buf = '';
      } else {
        buf += c;
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  }

  function findTopLevelColon(s) {
    let depthBracket = 0;
    let depthBrace = 0;
    let inQuote = null;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (inQuote) {
        if (c === inQuote) inQuote = null;
        continue;
      }
      if (c === '"' || c === "'") {
        inQuote = c;
        continue;
      }
      if (c === '[') depthBracket++;
      else if (c === ']') depthBracket--;
      else if (c === '{') depthBrace++;
      else if (c === '}') depthBrace--;
      else if (c === ':' && depthBracket === 0 && depthBrace === 0) return k;
    }
    return -1;
  }

  function getIndent(line) {
    const m = line.match(/^(\s*)/);
    return m ? m[1].length : 0;
  }

  function parseBlock(startI, parentIndent) {
    const out = {};
    const list = [];
    let mode = null;
    let j = startI;
    while (j < lines.length) {
      const line = lines[j];
      if (!line.trim() || line.trim().startsWith('#')) {
        j++;
        continue;
      }
      const indent = getIndent(line);
      if (indent <= parentIndent) break;
      const trimmed = line.trim();
      if (trimmed.startsWith('- ')) {
        if (mode === 'dict') break;
        mode = 'list';
        const itemStr = trimmed.slice(2);
        if (itemStr.trim().startsWith('{') && itemStr.trim().endsWith('}')) {
          list.push(parseScalar(itemStr.trim()));
          j++;
          continue;
        }
        const colonIdx = findTopLevelColon(itemStr);
        if (colonIdx !== -1) {
          const firstKey = itemStr.slice(0, colonIdx).trim();
          const firstVal = itemStr.slice(colonIdx + 1).trim();
          const itemDict = {};
          if (firstVal) {
            itemDict[firstKey] = parseScalar(firstVal);
          } else {
            const sub = parseBlock(j + 1, indent + 1);
            itemDict[firstKey] = sub.value;
            j = sub.nextI - 1;
          }
          j++;
          const itemIndent = indent;
          while (j < lines.length) {
            const nline = lines[j];
            if (!nline.trim() || nline.trim().startsWith('#')) {
              j++;
              continue;
            }
            const nindent = getIndent(nline);
            if (nindent <= itemIndent) break;
            const ntrim = nline.trim();
            if (ntrim.startsWith('- ')) break;
            const ncol = findTopLevelColon(ntrim);
            if (ncol === -1) {
              j++;
              continue;
            }
            const nkey = ntrim.slice(0, ncol).trim();
            const nval = ntrim.slice(ncol + 1).trim();
            if (nval) {
              itemDict[nkey] = parseScalar(nval);
              j++;
            } else {
              const sub = parseBlock(j + 1, nindent);
              itemDict[nkey] = sub.value;
              j = sub.nextI;
            }
          }
          list.push(itemDict);
          continue;
        }
        list.push(parseScalar(itemStr));
        j++;
        continue;
      }
      if (mode === 'list') break;
      mode = 'dict';
      const colonIdx = findTopLevelColon(trimmed);
      if (colonIdx === -1) {
        j++;
        continue;
      }
      const key = trimmed.slice(0, colonIdx).trim();
      const valStr = trimmed.slice(colonIdx + 1).trim();
      if (valStr) {
        out[key] = parseScalar(valStr);
        j++;
      } else {
        const sub = parseBlock(j + 1, indent);
        out[key] = sub.value;
        j = sub.nextI;
      }
    }
    return { value: mode === 'list' ? list : out, nextI: j };
  }

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      i++;
      continue;
    }
    const indent = getIndent(line);
    if (indent > 0) {
      i++;
      continue;
    }
    const trimmed = line.trim();
    const colonIdx = findTopLevelColon(trimmed);
    if (colonIdx === -1) {
      i++;
      continue;
    }
    const key = trimmed.slice(0, colonIdx).trim();
    const valStr = trimmed.slice(colonIdx + 1).trim();
    if (valStr) {
      result[key] = parseScalar(valStr);
      i++;
    } else {
      const sub = parseBlock(i + 1, 0);
      result[key] = sub.value;
      i = sub.nextI;
    }
  }
  return result;
}

/**
 * Parse an existing file on disk into { frontmatter, body }. Returns empty
 * frontmatter + full raw text as body if the file lacks a `---`-delimited
 * block (defensive — every file we wrote will have one).
 */
function parseFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };
  return { frontmatter: parseYAML(match[1]), body: match[2] };
}

// ---------------------------------------------------------------------------
// Section 10.6 — Idempotence helpers (stripVolatile, detectBumpLevel, bump)
// ---------------------------------------------------------------------------

/**
 * Keys whose values naturally change across runs without representing a real
 * content change. Excluded from stable-equal comparison so a second run on
 * unchanged DB returns action='unchanged'.
 */
const VOLATILE_UPDATE_KEYS = new Set([
  'updated_at',
  'updated_by',
  'version',
  'change_log',
  'sync_snapshot',
]);

function stripVolatile(fm) {
  const out = {};
  for (const [k, v] of Object.entries(fm || {})) {
    if (!VOLATILE_UPDATE_KEYS.has(k)) out[k] = v;
  }
  return out;
}

/**
 * Stable JSON stringify for order-independent structural comparison.
 * Sorts object keys; arrays keep order (tags/related order is semantically
 * meaningful since our serializer emits stable orders via Section 8).
 */
function stableStringify(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const keys = Object.keys(v).sort();
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') +
    '}'
  );
}

/**
 * Detect semver bump level between existing frontmatter and newly computed
 * frontmatter. Simplified port of app/src/lib/services/knowledge-sync.ts
 * detectBumpLevel. Returns:
 *   'major' — subtype change, status active→deprecated, mode change
 *   'minor' — related[] change, system_prompt change (via source_of_truth
 *             metadata), connectors/skills linked change (related array)
 *   'patch' — any other structural change
 *   null    — stable-equal (strip-volatile projections match)
 *
 * Note: we operate on the already-built frontmatter projection. Since the
 * body contains the system_prompt rendering (NOT the frontmatter), a
 * system_prompt-only change is detected via the BODY diff in the writer,
 * which maps to 'minor' bump via the contract ("system_prompt changed").
 */
function detectBumpLevel(curFm, newFm, curBody, newBody) {
  const curStable = stripVolatile(curFm);
  const newStable = stripVolatile(newFm);
  const curStr = stableStringify(curStable);
  const newStr = stableStringify(newStable);
  const curBodyNorm = (curBody || '').trimEnd();
  const newBodyNorm = (newBody || '').trimEnd();

  if (curStr === newStr && curBodyNorm === newBodyNorm) return null;

  // MAJOR: subtype, mode, status active→deprecated
  if ((curFm.subtype || null) !== (newFm.subtype || null)) return 'major';
  if (curFm.status === 'active' && newFm.status === 'deprecated') return 'major';
  // Detect catpaw/canvas "mode" change via the body line "- **Mode:** X".
  const modeRe = /- \*\*Mode:\*\* ([^\n]+)/;
  const curMode = (curBody || '').match(modeRe);
  const newMode = (newBody || '').match(modeRe);
  if (curMode && newMode && curMode[1].trim() !== newMode[1].trim()) {
    return 'major';
  }

  // MINOR: related array changed, or system_prompt line in body changed.
  const curRel = stableStringify(curFm.related || []);
  const newRel = stableStringify(newFm.related || []);
  if (curRel !== newRel) return 'minor';

  // system_prompt is rendered in body inside a ``` block after
  // "## System Prompt" heading. If that block differs while everything
  // else up to the heading matches, treat as minor.
  const extractSP = (body) => {
    const m = (body || '').match(
      /## System Prompt\s*\n+```\n([\s\S]*?)\n```/
    );
    return m ? m[1] : null;
  };
  const curSP = extractSP(curBody);
  const newSP = extractSP(newBody);
  if (curSP !== newSP) return 'minor';

  // PATCH — something else changed (description, tags, times_used, etc.)
  return 'patch';
}

function bumpVersion(current, level) {
  const parts = String(current || '1.0.0')
    .split('.')
    .map((x) => parseInt(x, 10));
  const M = Number.isNaN(parts[0]) ? 1 : parts[0];
  const m = Number.isNaN(parts[1]) ? 0 : parts[1];
  const p = Number.isNaN(parts[2]) ? 0 : parts[2];
  if (level === 'major') return `${M + 1}.0.0`;
  if (level === 'minor') return `${M}.${m + 1}.0`;
  if (level === 'patch') return `${M}.${m}.${p + 1}`;
  return String(current || '1.0.0');
}

// ---------------------------------------------------------------------------
// Section 11 — File writer (with stable-equal idempotence, Plan 03)
// ---------------------------------------------------------------------------

/**
 * Render the full file content (YAML frontmatter + Markdown body).
 */
function renderFile(fm, body) {
  return `---\n${serializeYAML(fm)}\n---\n${body}`;
}

/**
 * Write the resource file with stable-equal idempotence.
 *
 * Semantics (Plan 03):
 *   - File does NOT exist → action='create' (or 'would-create' in dry-run).
 *   - File exists, stable-equal to computed → action='unchanged' (no write).
 *   - File exists, differs → action='update' (or 'would-update' in dry-run);
 *     version bumped per detectBumpLevel; change_log appended (max 5 tail);
 *     created_at and created_by preserved from existing file.
 */
function writeResourceFile(kbRoot, subtype, shortIdSlug, fm, body, opts) {
  const dryRun = !!opts.dryRun;
  const verbose = !!opts.verbose;
  const targetDir = path.join(kbRoot, SUBTYPE_SUBDIR[subtype]);
  const filePath = path.join(targetDir, `${shortIdSlug}.md`);

  if (fs.existsSync(filePath)) {
    // Idempotence path
    const { frontmatter: curFm, body: curBody } = parseFile(filePath);
    const bump = detectBumpLevel(curFm, fm, curBody, body);

    if (bump === null) {
      if (verbose) console.log(`UNCHANGED ${filePath}`);
      return { path: filePath, action: 'unchanged', subtype, id: shortIdSlug };
    }

    // Real change — compute merged frontmatter with preserved provenance.
    const newVersion = bumpVersion(curFm.version || '1.0.0', bump);
    const now = new Date().toISOString();
    const prevLog = Array.isArray(curFm.change_log) ? curFm.change_log : [];
    const newEntry = {
      version: newVersion,
      date: now.slice(0, 10),
      author: 'kb-sync-bootstrap',
      change: `Auto-sync ${bump} bump from DB`,
    };
    const changeLog = [...prevLog, newEntry].slice(-5);

    const mergedFm = {
      ...fm,
      created_at: curFm.created_at || fm.created_at,
      created_by: curFm.created_by || fm.created_by,
      version: newVersion,
      updated_at: now,
      updated_by: 'kb-sync-bootstrap',
      change_log: changeLog,
    };
    // Reactivation (deprecated → active): clear deprecation fields.
    if (curFm.status === 'deprecated' && mergedFm.status === 'active') {
      delete mergedFm.deprecated_at;
      delete mergedFm.deprecated_by;
      delete mergedFm.deprecated_reason;
    }

    if (dryRun) {
      if (verbose) console.log(`DRY UPDATE ${filePath} (${bump})`);
      return {
        path: filePath,
        action: 'would-update',
        subtype,
        id: shortIdSlug,
        bump,
      };
    }
    fs.writeFileSync(filePath, renderFile(mergedFm, body), 'utf8');
    if (verbose) {
      console.log(`UPDATE ${filePath} (${bump} → ${newVersion})`);
    }
    return {
      path: filePath,
      action: 'update',
      subtype,
      id: shortIdSlug,
      bump,
    };
  }

  // Create path
  if (dryRun) {
    if (verbose) console.log(`DRY CREATE ${filePath}`);
    return {
      path: filePath,
      action: 'would-create',
      subtype,
      id: shortIdSlug,
    };
  }
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(filePath, renderFile(fm, body), 'utf8');
  if (verbose) console.log(`CREATE ${filePath}`);
  return { path: filePath, action: 'create', subtype, id: shortIdSlug };
}

// ---------------------------------------------------------------------------
// Section 12 — Public entry point: populateFromDb
// ---------------------------------------------------------------------------

/**
 * Populate the KB from the live SQLite DB.
 *
 * @param {object} opts
 * @param {string} [opts.kbRoot]      Absolute path to .docflow-kb/. Default: repo .docflow-kb.
 * @param {string} [opts.dbPath]      Absolute path to docflow.db. Default: env DATABASE_PATH or app/data/docflow.db.
 * @param {string[]} [opts.subtypes]  Optional subset of SUBTYPES to process.
 * @param {boolean} [opts.dryRun]     When true, no filesystem writes.
 * @param {boolean} [opts.verbose]    When true, logs each file + tag WARNs.
 * @returns {object}                  { created, updated, unchanged, orphans, skipped, files }.
 */
function populateFromDb(opts) {
  const options = opts || {};
  const kbRoot = options.kbRoot || DEFAULT_KB_ROOT;
  const dbPath = options.dbPath;
  const subtypesFilter =
    options.subtypes && options.subtypes.length ? options.subtypes : null;
  const dryRun = !!options.dryRun;
  const verbose = !!options.verbose;

  // Enable the tag-drop WARN trail for this run if requested.
  const prevVerbose = process['env']['KB_SYNC_VERBOSE'];
  if (verbose) process['env']['KB_SYNC_VERBOSE'] = '1';

  // Reset the taxonomy cache so tests with different kbRoot values don't
  // alias each other.
  _resetTaxonomyCache();

  const db = openDb(dbPath);
  const report = {
    created: 0,
    updated: 0,
    unchanged: 0,
    orphans: 0,
    skipped: 0,
    // Phase 157 KB-46 — count of rows excluded by loadArchivedIds. Separate
    // from `skipped` (which tracks rows missing id/name).
    skipped_archived: 0,
    files: [],
  };
  try {
    const { rows, maps } = buildIdMap(db, subtypesFilter);

    // Eager-load join rows indexed by source id.
    const pawRels = loadCatPawRelations(db);
    const brainRels = loadCatbrainRelations(db);

    // Phase 157 KB-46 — load the archived-key Set BEFORE the write loop so
    // Pass-2 can O(1) exclude rows whose canonical state is "archived"
    // (living under `.docflow-legacy/orphans/<subdir>/<slug>.md`). The
    // helper returns an empty Set when the legacy tree is missing.
    const archivedIds = loadArchivedIds(kbRoot);
    if (verbose && archivedIds.size > 0) {
      console.log(
        `[archived-ids] loaded ${archivedIds.size} entries from .docflow-legacy/orphans/`
      );
    }

    for (const sub of SUBTYPES) {
      if (subtypesFilter && !subtypesFilter.includes(sub)) continue;
      for (const row of rows[sub]) {
        if (!row.id || !row.name) {
          report.skipped++;
          if (verbose) {
            console.warn(
              `WARN [skip] ${sub}/${row.id || '<no-id>'} missing id or name`
            );
          }
          continue;
        }
        let relations = [];
        if (sub === 'catpaw') relations = pawRels.get(row.id) || [];
        else if (sub === 'catbrain') relations = brainRels.get(row.id) || [];
        const shortIdSlug = maps[sub].get(row.id);
        // Phase 157 KB-46 — if this row's short-id-slug matches an archived
        // entry under `.docflow-legacy/orphans/`, skip it entirely: NO
        // frontmatter build, NO write, NO overwrite. The archived copy
        // remains the source of truth (PRD §5.3 Lifecycle: archived →
        // purged is terminal, no automatic "unarchive" path).
        if (archivedIds.has(`${sub}:${shortIdSlug}`)) {
          report.skipped_archived++;
          if (verbose) console.warn(`[archived-skip] ${sub}/${shortIdSlug}`);
          continue;
        }
        const fm = buildFrontmatter(sub, row, kbRoot, maps, relations);
        // Phase 157 KB-47 — pass relations so catpaws render linked sections
        // byte-equivalent to the runtime path (knowledge-sync.ts:1114-1121).
        // Other subtypes ignore the 3rd arg (backwards-compat).
        const body = buildBody(sub, row, relations);
        const res = writeResourceFile(kbRoot, sub, shortIdSlug, fm, body, {
          dryRun,
          verbose,
        });
        report.files.push(res);
        switch (res.action) {
          case 'create':
          case 'would-create':
            report.created++;
            break;
          case 'update':
          case 'would-update':
          case 'overwrite':
            report.updated++;
            break;
          case 'unchanged':
            report.unchanged++;
            break;
        }
      }
    }

    // Orphan scan pass — walk each resources/<subtype>/ subdirectory and
    // emit a WARN for any file whose short-id-slug has no matching DB row.
    // Orphan files are NEVER modified or deleted in this rebuild (CONTEXT
    // §D3: auto-deprecation is Fase 5).
    for (const sub of SUBTYPES) {
      if (subtypesFilter && !subtypesFilter.includes(sub)) continue;
      const dir = path.join(kbRoot, SUBTYPE_SUBDIR[sub]);
      if (!fs.existsSync(dir)) continue;
      const knownShortIds = new Set(maps[sub].values());
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.md')) continue;
        const shortIdSlug = f.slice(0, -3);
        if (!knownShortIds.has(shortIdSlug)) {
          console.warn(
            `WARN orphan ${sub}/${f} (no DB row — left untouched)`
          );
          report.orphans++;
          report.files.push({
            path: path.join(dir, f),
            action: 'orphan',
            subtype: sub,
            id: shortIdSlug,
          });
        }
      }
    }
    return report;
  } finally {
    db.close();
    // Restore prior env state so we don't leak the flag across test cases.
    if (verbose) {
      if (prevVerbose === undefined) delete process['env']['KB_SYNC_VERBOSE'];
      else process['env']['KB_SYNC_VERBOSE'] = prevVerbose;
    }
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  populateFromDb,
  _internal: {
    slugify,
    resolveShortIdSlug,
    deriveTags,
    openDb,
    buildIdMap,
    buildFrontmatter,
    buildBody,
    serializeYAML,
    renderFile,
    parseYAML,
    parseFile,
    stripVolatile,
    stableStringify,
    detectBumpLevel,
    bumpVersion,
    // Phase 157 KB-46 — exposed for unit tests of the exclusion contract.
    loadArchivedIds,
    // Phase 157 KB-47 — exposed for unit tests of the linked-sections contract.
    renderLinkedSectionCjs,
    splitRelationsBySubtype,
    loadCatPawRelations,
    SUBTYPES,
    SUBTYPE_SUBDIR,
    SUBTYPE_TABLE,
    SELECTS,
    FIELDS_FROM_DB_BY_SUBTYPE,
    DEPARTMENT_MAP,
    CONNECTOR_TYPE_MAP,
    TYPE_TO_DOMAIN,
    _resetTaxonomyCache,
  },
};
