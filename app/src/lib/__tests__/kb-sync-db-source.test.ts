/**
 * kb-sync-db-source.test.ts — Wave 0 test scaffold for Phase 150 Plans 02-04.
 *
 * Phase 150 Plan 01 — creates the test runway:
 *   - createFixtureDb helper: inline CREATE TABLE + seed of the 6 target
 *     tables + 4 join tables used by scripts/kb-sync-db-source.cjs (Plan 02).
 *   - Seed rows exercise every code path the downstream plans need to
 *     cover: active/inactive/archived, tag translation fuel, collision
 *     pair, cross-entity join rows, and security canaries (literals that
 *     MUST NOT leak into any generated .md file — asserted in Plan 04).
 *   - 1 fixture-validation test (not .todo) proves the helper loads cleanly.
 *   - 17 `it.todo()` placeholders mirror VALIDATION.md per-task map; Plans
 *     02-04 convert each to a real test as they implement the feature.
 *
 * Test location convention: `app/src/lib/__tests__/` matches Phase 149's
 * kb-sync-cli.test.ts (app/vitest.config.ts globs `src/**\/*.test.ts`; the
 * repo root has no package.json so placing this under scripts/ would miss
 * the vitest runner).
 *
 * Security canary strings seeded below (Plan 04 asserts absence):
 *   - "LEAK-A"                   connectors.config secret (on seed-test-a)
 *   - "LEAK-B"                   connectors.config secret (on seed-test-b)
 *   - "localhost:8765"           connectors.config url
 *   - "<BINARY-BLOB-MUST-NOT-LEAK>"  email_templates.structure bulk payload
 *   - "<HTML-LEAK>"              email_templates.html_preview bulk payload
 *   - "<CANVAS-FLOW-LEAK>"       canvases.flow_data bulk payload
 *   - "<CANVAS-THUMB-LEAK>"      canvases.thumbnail bulk payload
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Constants (paths resolved relative to the repo root from __dirname)
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const CLI_SRC = path.join(REPO_ROOT, 'scripts/kb-sync.cjs');
const DB_SOURCE_SRC = path.join(REPO_ROOT, 'scripts/kb-sync-db-source.cjs');
const VALIDATE_SRC = path.join(REPO_ROOT, 'scripts/validate-kb.cjs');
const SCHEMA_SRC = path.join(REPO_ROOT, '.docflow-kb/_schema');

// ---------------------------------------------------------------------------
// createFixtureDb — inline schema + seed for the 10 tables Plan 02 will read
// ---------------------------------------------------------------------------

/**
 * createFixtureDb — builds a minimal but production-parity SQLite fixture
 * that scripts/kb-sync-db-source.cjs (Plan 02) can read end-to-end.
 *
 * Schema subset (10 tables, columns match app/src/lib/db.ts):
 *   - cat_paws        : id, name, description, mode, model, system_prompt,
 *                       tone, department_tags, is_active, times_used,
 *                       temperature, max_tokens, output_format, created_at,
 *                       updated_at
 *   - connectors      : id, name, description, type, config, is_active,
 *                       test_status, times_used, created_at, updated_at
 *   - skills          : id, name, description, category, tags, instructions,
 *                       source, version, author, times_used, created_at,
 *                       updated_at
 *   - catbrains       : id, name, description, purpose, tech_stack, status,
 *                       agent_id, rag_enabled, rag_collection, created_at,
 *                       updated_at
 *   - email_templates : id, name, description, category, structure,
 *                       html_preview, is_active, times_used, ref_code,
 *                       created_at, updated_at   (structure + html_preview
 *                       seeded as canaries — Plan 04 asserts they never
 *                       appear in any generated .md)
 *   - canvases        : id, name, description, mode, status, flow_data,
 *                       thumbnail, tags, is_template, created_at,
 *                       updated_at             (flow_data + thumbnail
 *                       seeded as canaries — same rationale)
 *   - cat_paw_connectors : paw_id, connector_id, usage_hint, is_active
 *   - cat_paw_skills     : paw_id, skill_id
 *   - cat_paw_catbrains  : paw_id, catbrain_id, query_mode, priority
 *   - catbrain_connectors: id, catbrain_id, name, type, is_active
 *
 * Seed summary: 13 rows across the 6 entity tables + 4 join rows, covering:
 *   - active + inactive + archived states
 *   - Spanish department_tags ("Negocio") for tag-translation fuel
 *   - connector config with "LEAK-A"/"LEAK-B"/"localhost:8765" secrets
 *   - canvas flow_data + thumbnail binary payload canaries
 *   - email_template structure + html_preview canaries
 *   - collision pair: seed-test-a / seed-test-b (both → short-id "seed-tes")
 *   - skill tags JSON with "testing" (in taxonomy) + "unknown-tag" (filtered)
 *   - catbrain with rag_enabled=1 AND catbrain without RAG
 *   - cross-entity joins: 1 catpaw ↔ 1 catbrain / 1 connector / 1 skill
 */
export function createFixtureDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TABLE cat_paws (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        mode TEXT NOT NULL DEFAULT 'chat',
        model TEXT DEFAULT 'gemini-main',
        system_prompt TEXT,
        tone TEXT DEFAULT 'profesional',
        department_tags TEXT,
        is_active INTEGER DEFAULT 1,
        times_used INTEGER DEFAULT 0,
        temperature REAL DEFAULT 0.7,
        max_tokens INTEGER DEFAULT 4096,
        output_format TEXT DEFAULT 'md',
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE connectors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,
        config TEXT,
        is_active INTEGER DEFAULT 1,
        test_status TEXT DEFAULT 'untested',
        times_used INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'documentation',
        tags TEXT,
        instructions TEXT NOT NULL,
        source TEXT DEFAULT 'built-in',
        version TEXT DEFAULT '1.0',
        author TEXT,
        times_used INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE catbrains (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        purpose TEXT,
        tech_stack TEXT,
        status TEXT DEFAULT 'draft',
        agent_id TEXT,
        rag_enabled INTEGER DEFAULT 0,
        rag_collection TEXT,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE email_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'general',
        structure TEXT NOT NULL DEFAULT '{}',
        html_preview TEXT,
        is_active INTEGER DEFAULT 1,
        times_used INTEGER DEFAULT 0,
        ref_code TEXT,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE canvases (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        mode TEXT NOT NULL DEFAULT 'mixed',
        status TEXT DEFAULT 'idle',
        flow_data TEXT,
        thumbnail TEXT,
        tags TEXT,
        is_template INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE cat_paw_connectors (
        paw_id TEXT NOT NULL,
        connector_id TEXT NOT NULL,
        usage_hint TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT,
        UNIQUE(paw_id, connector_id)
      );

      CREATE TABLE cat_paw_skills (
        paw_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        PRIMARY KEY (paw_id, skill_id)
      );

      CREATE TABLE cat_paw_catbrains (
        paw_id TEXT NOT NULL,
        catbrain_id TEXT NOT NULL,
        query_mode TEXT DEFAULT 'both',
        priority INTEGER DEFAULT 0,
        created_at TEXT,
        UNIQUE(paw_id, catbrain_id)
      );

      CREATE TABLE catbrain_connectors (
        id TEXT PRIMARY KEY,
        catbrain_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        config TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
      );
    `);

    const nowIso = '2026-04-18T10:00:00Z';

    // -------- cat_paws (2 rows: active with Spanish dept, inactive) --------
    const insertPaw = db.prepare(`
      INSERT INTO cat_paws (id, name, description, mode, model, system_prompt,
        tone, department_tags, is_active, times_used, temperature, max_tokens,
        output_format, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertPaw.run(
      'fixture-paw-01-active',
      'Operador Holded Fixture',
      'CatPaw CRM fixture for Phase 150 tests',
      'chat',
      'gemini-main',
      'You are a CRM operator for fixtures.',
      'profesional',
      'Negocio', // Spanish → translates to 'business'
      1,
      42,
      0.5,
      2048,
      'md',
      nowIso,
      nowIso
    );
    insertPaw.run(
      'fixture-paw-02-inactive',
      'Deprecated Fixture Paw',
      'Inactive catpaw — should produce status: deprecated in KB',
      'processor',
      'gemini-main',
      'Old prompt.',
      'neutro',
      null,
      0, // inactive → deprecated in KB
      3,
      0.7,
      1024,
      'md',
      nowIso,
      nowIso
    );

    // -------- connectors (3 rows incl. collision pair with canary configs) --------
    const insertConn = db.prepare(`
      INSERT INTO connectors (id, name, description, type, config, is_active,
        test_status, times_used, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    // Collision pair: both ids share 8-char prefix "seed-tes"
    insertConn.run(
      'seed-test-a',
      'Test Connector A',
      'http_api connector with secret config canary',
      'http_api',
      '{"secret":"LEAK-A","url":"localhost:8765"}',
      1,
      'untested',
      0,
      nowIso,
      nowIso
    );
    insertConn.run(
      'seed-test-b',
      'Test Connector B',
      'mcp_server connector with secret config canary',
      'mcp_server',
      '{"secret":"LEAK-B","endpoint":"wss://prod.example"}',
      1,
      'untested',
      0,
      nowIso,
      nowIso
    );
    insertConn.run(
      'fixture-conn-03-active',
      'Gmail Fixture',
      'gmail connector without secrets',
      'gmail',
      '{}',
      1,
      'passing',
      17,
      nowIso,
      nowIso
    );

    // -------- skills (2 rows — one with mixed tags, one built-in) --------
    const insertSkill = db.prepare(`
      INSERT INTO skills (id, name, description, category, tags, instructions,
        source, version, author, times_used, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertSkill.run(
      'fixture-skill-01',
      'Test Skill With Mixed Tags',
      'skill fixture with one valid tag and one unknown',
      'testing',
      JSON.stringify(['testing', 'unknown-tag']),
      'Apply tests and assertions.',
      'user',
      '1.0',
      'phase-150',
      5,
      nowIso,
      nowIso
    );
    insertSkill.run(
      'fixture-skill-02',
      'Built-in Skill Fixture',
      'skill fixture with source=built-in',
      'documentation',
      JSON.stringify([]),
      'Document the flow.',
      'built-in',
      '1.0',
      'system',
      0,
      nowIso,
      nowIso
    );

    // -------- catbrains (2 rows — with + without RAG) --------
    const insertBrain = db.prepare(`
      INSERT INTO catbrains (id, name, description, purpose, tech_stack, status,
        agent_id, rag_enabled, rag_collection, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertBrain.run(
      'fixture-brain-01-rag',
      'Test CatBrain RAG',
      'catbrain fixture with rag_enabled=1',
      'Answer product questions from docs.',
      'gemini-main',
      'active',
      null,
      1,
      'fixture-collection',
      nowIso,
      nowIso
    );
    insertBrain.run(
      'fixture-brain-02-norag',
      'Test CatBrain No-RAG',
      'catbrain fixture without RAG — processor-style',
      'Transform payloads.',
      'gemini-main',
      'draft',
      null,
      0,
      null,
      nowIso,
      nowIso
    );

    // -------- email_templates (2 rows, one with canary structure/html_preview) --------
    const insertTpl = db.prepare(`
      INSERT INTO email_templates (id, name, description, category, structure,
        html_preview, is_active, times_used, ref_code, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertTpl.run(
      'fixture-tpl-01',
      'Pro-Fixture Template',
      'template fixture with canary structure + html_preview',
      'product',
      '<BINARY-BLOB-MUST-NOT-LEAK>', // canary → Plan 04 asserts absence
      '<HTML-LEAK>', // canary → Plan 04 asserts absence
      1,
      8,
      'FIX001',
      nowIso,
      nowIso
    );
    insertTpl.run(
      'fixture-tpl-02',
      'Generic Fixture Template',
      'template fixture without canaries (active)',
      'general',
      '{}',
      null,
      1,
      0,
      'FIX002',
      nowIso,
      nowIso
    );

    // -------- canvases (2 rows — active + archived, both with canaries) --------
    const insertCanvas = db.prepare(`
      INSERT INTO canvases (id, name, description, mode, status, flow_data,
        thumbnail, tags, is_template, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertCanvas.run(
      'fixture-canvas-01-active',
      'Test Canvas Active',
      'canvas fixture — status=idle, is_template=0',
      'chat',
      'idle',
      '<CANVAS-FLOW-LEAK>', // canary — never should appear in .md
      '<CANVAS-THUMB-LEAK>', // canary — never should appear in .md
      null,
      0,
      nowIso,
      nowIso
    );
    insertCanvas.run(
      'fixture-canvas-02-archived',
      'Test Canvas Archived',
      'canvas fixture — status=archived → deprecated in KB',
      'processor',
      'archived', // archived → deprecated in KB per CONTEXT D3
      '<CANVAS-FLOW-LEAK-2>',
      null,
      null,
      0,
      nowIso,
      nowIso
    );

    // -------- Join rows: fixture-paw-01 ↔ brain/conn/skill --------
    db.prepare(
      `INSERT INTO cat_paw_catbrains (paw_id, catbrain_id, query_mode, priority, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run('fixture-paw-01-active', 'fixture-brain-01-rag', 'rag', 0, nowIso);
    db.prepare(
      `INSERT INTO cat_paw_connectors (paw_id, connector_id, usage_hint, is_active, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run('fixture-paw-01-active', 'seed-test-a', 'CRM lookup', 1, nowIso);
    db.prepare(
      `INSERT INTO cat_paw_skills (paw_id, skill_id) VALUES (?, ?)`
    ).run('fixture-paw-01-active', 'fixture-skill-01');

    // -------- catbrain-scoped connector (to exercise that join table) --------
    db.prepare(
      `INSERT INTO catbrain_connectors (id, catbrain_id, name, type, config, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'fixture-brainconn-01',
      'fixture-brain-01-rag',
      'Brain-scoped Pinecone',
      'vector_db',
      '{"secret":"BRAIN-LEAK"}',
      1,
      nowIso,
      nowIso
    );
  } catch (err) {
    db.close();
    throw err;
  }
  return db;
}

// ---------------------------------------------------------------------------
// Test harness — tmpRepo / tmpKb / tmpDb with schema + CLI copy (when present)
// ---------------------------------------------------------------------------

let tmpRepo: string;
let tmpKb: string;
let tmpDb: string;

beforeEach(() => {
  tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'kbdbsrc-'));
  tmpKb = path.join(tmpRepo, '.docflow-kb');
  tmpDb = path.join(tmpRepo, 'app/data/docflow.db');

  // KB directory skeleton matching Phase 149 layout
  const dirs = [
    '_schema',
    'domain/concepts',
    'resources/catpaws',
    'resources/connectors',
    'resources/catbrains',
    'resources/email-templates',
    'resources/skills',
    'resources/canvases',
    'rules',
    'protocols',
    'runtime',
    'incidents',
    'features',
    'guides',
    'state',
  ];
  for (const d of dirs) fs.mkdirSync(path.join(tmpKb, d), { recursive: true });
  fs.mkdirSync(path.dirname(tmpDb), { recursive: true });
  fs.mkdirSync(path.join(tmpRepo, 'scripts'), { recursive: true });

  // Seed empty _index.json (CLI --full-rebuild rewrites it)
  fs.writeFileSync(
    path.join(tmpKb, '_index.json'),
    JSON.stringify(
      {
        schema_version: '2.0',
        entry_count: 0,
        header: {
          counts: {
            catpaws_active: 0,
            connectors_active: 0,
            catbrains_active: 0,
            templates_active: 0,
            skills_active: 0,
            canvases_active: 0,
            rules: 0,
            incidents_resolved: 0,
            features_documented: 0,
          },
          top_tags: [],
          last_changes: [],
        },
        entries: [],
        indexes: { by_type: {}, by_tag: {}, by_audience: {} },
      },
      null,
      2
    )
  );

  // Copy real schemas so validate-kb.cjs (when spawned in Plan 04) finds them
  if (fs.existsSync(SCHEMA_SRC)) {
    for (const f of fs.readdirSync(SCHEMA_SRC)) {
      fs.copyFileSync(path.join(SCHEMA_SRC, f), path.join(tmpKb, '_schema', f));
    }
  }

  // Copy the CLI scripts that already exist (Phase 149). The DB-source
  // module is created in Plan 02 — copy conditionally so this scaffold
  // works today and keeps working when Plan 02 lands.
  if (fs.existsSync(CLI_SRC)) {
    fs.copyFileSync(CLI_SRC, path.join(tmpRepo, 'scripts/kb-sync.cjs'));
  }
  if (fs.existsSync(VALIDATE_SRC)) {
    fs.copyFileSync(VALIDATE_SRC, path.join(tmpRepo, 'scripts/validate-kb.cjs'));
  }
  if (fs.existsSync(DB_SOURCE_SRC)) {
    fs.copyFileSync(
      DB_SOURCE_SRC,
      path.join(tmpRepo, 'scripts/kb-sync-db-source.cjs')
    );
  }
});

afterEach(() => {
  fs.rmSync(tmpRepo, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Phase 150 — kb-sync-db-source', () => {
  // ----- Fixture-validation test (not todo) — proves helper loads cleanly
  it('createFixtureDb produces a valid 10-table fixture with expected seed counts', () => {
    const db = createFixtureDb(tmpDb);
    try {
      const tables = (
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
          )
          .all() as Array<{ name: string }>
      ).map((r) => r.name);
      expect(tables).toEqual(
        expect.arrayContaining([
          'cat_paws',
          'connectors',
          'skills',
          'catbrains',
          'email_templates',
          'canvases',
          'cat_paw_connectors',
          'cat_paw_skills',
          'cat_paw_catbrains',
          'catbrain_connectors',
        ])
      );
      const pawCount = (
        db.prepare('SELECT COUNT(*) as n FROM cat_paws').get() as { n: number }
      ).n;
      const connCount = (
        db.prepare('SELECT COUNT(*) as n FROM connectors').get() as {
          n: number;
        }
      ).n;
      const skillCount = (
        db.prepare('SELECT COUNT(*) as n FROM skills').get() as { n: number }
      ).n;
      const brainCount = (
        db.prepare('SELECT COUNT(*) as n FROM catbrains').get() as {
          n: number;
        }
      ).n;
      const tplCount = (
        db.prepare('SELECT COUNT(*) as n FROM email_templates').get() as {
          n: number;
        }
      ).n;
      const canvasCount = (
        db.prepare('SELECT COUNT(*) as n FROM canvases').get() as {
          n: number;
        }
      ).n;
      expect(pawCount).toBeGreaterThanOrEqual(2);
      expect(connCount).toBeGreaterThanOrEqual(2);
      expect(skillCount).toBeGreaterThanOrEqual(2);
      expect(brainCount).toBeGreaterThanOrEqual(2);
      expect(tplCount).toBeGreaterThanOrEqual(2);
      expect(canvasCount).toBeGreaterThanOrEqual(2);
      // Total ≥ 12 entity rows per CONTEXT D4 fixture requirement
      expect(
        pawCount + connCount + skillCount + brainCount + tplCount + canvasCount
      ).toBeGreaterThanOrEqual(12);

      // Security canaries present in fixture (Plan 04 asserts absence in output)
      const connA = db
        .prepare('SELECT config FROM connectors WHERE id = ?')
        .get('seed-test-a') as { config: string };
      expect(connA.config).toContain('LEAK-A');
      expect(connA.config).toContain('localhost:8765');
      const canvas1 = db
        .prepare('SELECT flow_data, thumbnail FROM canvases WHERE id = ?')
        .get('fixture-canvas-01-active') as {
        flow_data: string;
        thumbnail: string;
      };
      expect(canvas1.flow_data).toContain('CANVAS-FLOW-LEAK');
      expect(canvas1.thumbnail).toContain('CANVAS-THUMB-LEAK');
      const tpl1 = db
        .prepare('SELECT structure, html_preview FROM email_templates WHERE id = ?')
        .get('fixture-tpl-01') as { structure: string; html_preview: string };
      expect(tpl1.structure).toContain('BINARY-BLOB-MUST-NOT-LEAK');
      expect(tpl1.html_preview).toContain('HTML-LEAK');

      // Cross-entity join rows present (KB-06 cross-entity related fuel)
      const joinCb = (
        db
          .prepare(
            "SELECT COUNT(*) as n FROM cat_paw_catbrains WHERE paw_id = ?"
          )
          .get('fixture-paw-01-active') as { n: number }
      ).n;
      const joinCn = (
        db
          .prepare(
            "SELECT COUNT(*) as n FROM cat_paw_connectors WHERE paw_id = ?"
          )
          .get('fixture-paw-01-active') as { n: number }
      ).n;
      const joinSk = (
        db
          .prepare("SELECT COUNT(*) as n FROM cat_paw_skills WHERE paw_id = ?")
          .get('fixture-paw-01-active') as { n: number }
      ).n;
      expect(joinCb).toBe(1);
      expect(joinCn).toBe(1);
      expect(joinSk).toBe(1);

      // Collision pair verified (short-id resolver fuel for Plan 02)
      expect('seed-test-a'.slice(0, 8)).toBe('seed-tes');
      expect('seed-test-b'.slice(0, 8)).toBe('seed-tes');
    } finally {
      db.close();
    }
  });

  // ----- Plan 02 (KB-06) — core DB reading + transformation -----
  it.todo('writes files from 6 tables');

  it('dry run empty DB', () => {
    // Create empty DB (schema only, no seed rows)
    const db = new Database(tmpDb);
    db.exec(`
      CREATE TABLE cat_paws (id TEXT PRIMARY KEY, name TEXT NOT NULL,
        description TEXT, mode TEXT DEFAULT 'chat', model TEXT,
        system_prompt TEXT, tone TEXT, department_tags TEXT,
        is_active INTEGER DEFAULT 1, times_used INTEGER DEFAULT 0,
        temperature REAL, max_tokens INTEGER, output_format TEXT,
        created_at TEXT, updated_at TEXT);
      CREATE TABLE connectors (id TEXT PRIMARY KEY, name TEXT NOT NULL,
        description TEXT, type TEXT NOT NULL, is_active INTEGER DEFAULT 1,
        test_status TEXT, times_used INTEGER DEFAULT 0,
        created_at TEXT, updated_at TEXT);
      CREATE TABLE skills (id TEXT PRIMARY KEY, name TEXT NOT NULL,
        description TEXT, category TEXT, tags TEXT, instructions TEXT NOT NULL,
        source TEXT, version TEXT, author TEXT, times_used INTEGER DEFAULT 0,
        created_at TEXT, updated_at TEXT);
      CREATE TABLE catbrains (id TEXT PRIMARY KEY, name TEXT NOT NULL,
        description TEXT, purpose TEXT, tech_stack TEXT, status TEXT,
        agent_id TEXT, rag_enabled INTEGER DEFAULT 0, rag_collection TEXT,
        created_at TEXT, updated_at TEXT);
      CREATE TABLE email_templates (id TEXT PRIMARY KEY, name TEXT NOT NULL,
        description TEXT, category TEXT, is_active INTEGER DEFAULT 1,
        times_used INTEGER DEFAULT 0, ref_code TEXT,
        created_at TEXT, updated_at TEXT);
      CREATE TABLE canvases (id TEXT PRIMARY KEY, name TEXT NOT NULL,
        description TEXT, mode TEXT DEFAULT 'mixed', status TEXT DEFAULT 'idle',
        tags TEXT, is_template INTEGER DEFAULT 0,
        created_at TEXT, updated_at TEXT);
      CREATE TABLE cat_paw_connectors (paw_id TEXT, connector_id TEXT,
        usage_hint TEXT, is_active INTEGER DEFAULT 1);
      CREATE TABLE cat_paw_skills (paw_id TEXT, skill_id TEXT);
      CREATE TABLE cat_paw_catbrains (paw_id TEXT, catbrain_id TEXT,
        query_mode TEXT, priority INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1);
      CREATE TABLE catbrain_connectors (id TEXT, catbrain_id TEXT,
        name TEXT, type TEXT, is_active INTEGER DEFAULT 1);
    `);
    db.close();
    const { populateFromDb } = require(DB_SOURCE_SRC);
    const report = populateFromDb({
      kbRoot: tmpKb,
      dbPath: tmpDb,
      dryRun: true,
    });
    expect(report.created).toBe(0);
    expect(report.updated).toBe(0);
    expect(report.unchanged).toBe(0);
    expect(report.orphans).toBe(0);
    expect(report.skipped).toBe(0);
    expect(report.files).toEqual([]);
  });

  it('tag derivation', () => {
    const { _internal } = require(DB_SOURCE_SRC);
    // catpaw: mode=chat + department_tags=Negocio → [catpaw, chat, business]
    const catpawTags = _internal.deriveTags(
      'catpaw',
      { id: 'x', name: 'x', mode: 'chat', department_tags: 'Negocio' },
      tmpKb,
      []
    );
    expect(catpawTags).toEqual(
      expect.arrayContaining(['catpaw', 'chat', 'business'])
    );
    expect(catpawTags).not.toContain('Negocio');
    expect(catpawTags).not.toContain('negocio');

    // skill: category=extractor + tags=["testing","unknown-tag"]
    // → [skill, extractor, testing]; unknown dropped
    const skillTags = _internal.deriveTags(
      'skill',
      {
        id: 'y',
        name: 'y',
        category: 'extractor',
        tags: '["testing","unknown-tag"]',
      },
      tmpKb,
      []
    );
    expect(skillTags).toEqual(
      expect.arrayContaining(['skill', 'extractor', 'testing'])
    );
    expect(skillTags).not.toContain('unknown-tag');

    // connector: type=gmail → [connector, gmail, email] (domain derived)
    const connTags = _internal.deriveTags(
      'connector',
      { id: 'z', name: 'z', type: 'gmail' },
      tmpKb,
      []
    );
    expect(connTags).toEqual(expect.arrayContaining(['connector', 'gmail']));
    expect(connTags).toContain('email');

    // email-template: floor tag is 'template' (taxonomy entity), not 'email-template'
    const tplTags = _internal.deriveTags(
      'email-template',
      { id: 't', name: 't', category: 'crm' },
      tmpKb,
      []
    );
    expect(tplTags).toContain('template');
    expect(tplTags).toContain('email');
  });

  it('short-id collision resolved', () => {
    const { _internal } = require(DB_SOURCE_SRC);
    const typeMap = new Map<string, string>();
    const first = _internal.resolveShortIdSlug('seed-test-a', 'test-a', typeMap);
    typeMap.set('seed-test-a', first);
    const second = _internal.resolveShortIdSlug('seed-test-b', 'test-b', typeMap);
    typeMap.set('seed-test-b', second);
    // First claim wins with 8-char prefix
    expect(first).toBe('seed-tes-test-a');
    // Second gets different filename — extended prefix or fuller id
    expect(second).not.toEqual(first);
    // Both filenames must be distinct and reflect the entity
    expect(second).toMatch(/test-b$/);
  });

  it.todo('related cross-entity');

  // ----- Plan 03 (KB-08, KB-09) — CLI flags + idempotence runtime -----
  it.todo('dry run reports counts');
  it.todo('only subtype filter');
  it.todo('exit 2 on invalid args');
  it.todo('idempotent second run');
  it.todo('detects single row change');
  it.todo('orphan WARN, no delete');

  // ----- Plan 04 (KB-07, KB-10, KB-11) — validation + security + header -----
  it.todo('validate-kb passes on generated files');
  it.todo('canvases_active count');
  it.todo('header md has all counts');
  it.todo('no connector config leak');
  it.todo('no flow_data leak');
  it.todo('no template structure leak');
});
