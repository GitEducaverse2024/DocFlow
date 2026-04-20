/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * kb-sync-rebuild-determinism.test.ts — Phase 157 Plan 01 Wave-0 RED tests.
 *
 * Verifies the exclusion-list contract for `--full-rebuild --source db`:
 *
 *   1. `loadArchivedIds(kbRoot)` helper — reads `.docflow-legacy/orphans/`
 *      (SIBLING of `.docflow-kb/`) and returns a `Set<"<subtype>:<short-id-slug>">`
 *      of keys to exclude. Returns empty Set when legacy tree is missing.
 *   2. `populateFromDb` applies the exclude check in Pass-2 BEFORE calling
 *      `writeResourceFile` — archived files NEVER get written/overwritten.
 *   3. `report.skipped_archived` is a NEW field (separate from `skipped`)
 *      that counts how many DB rows were excluded by the archived set.
 *   4. The CLI (`scripts/kb-sync.cjs --full-rebuild --source db --dry-run
 *      --verbose`) surfaces `[archived-skip]` WARN lines and a summary
 *      line with `skipped_archived` count.
 *
 * TDD discipline:
 *   - Before Task 3 (GREEN), ALL 4 tests MUST FAIL (RED). Typical failures:
 *       • `_internal.loadArchivedIds is not a function` (helper missing)
 *       • `report.skipped_archived` undefined (field missing)
 *       • File exists in `.docflow-kb/resources/catpaws/` (exclude missing)
 *       • stdout lacks `[archived-skip]` (log missing)
 *   - After Task 3, ALL 4 tests MUST PASS (GREEN).
 *
 * Path semantics (Phase 157 RESEARCH §Pitfall 1 — fix the Bug A root cause):
 *   `.docflow-legacy/` is a SIBLING of `.docflow-kb/`, both under repo root.
 *   `loadArchivedIds` MUST use `path.resolve(kbRoot, '..', '.docflow-legacy',
 *   'orphans')`, NOT `path.join(kbRoot, '.docflow-legacy', ...)`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { createFixtureDb } from './kb-sync-db-source.test';

// ---------------------------------------------------------------------------
// Constants (paths resolved relative to the repo root from __dirname)
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const CLI_SRC = path.join(REPO_ROOT, 'scripts/kb-sync.cjs');
const DB_SOURCE_SRC = path.join(REPO_ROOT, 'scripts/kb-sync-db-source.cjs');
const VALIDATE_SRC = path.join(REPO_ROOT, 'scripts/validate-kb.cjs');
const SCHEMA_SRC = path.join(REPO_ROOT, '.docflow-kb/_schema');

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Lay out `.docflow-legacy/orphans/<subdir>/<id>.md` stubs so
 * `loadArchivedIds(kbRoot)` can index them as archived keys.
 *
 * `layout` keys match the on-disk subdirectory names (plural, as used in
 * `SUBTYPE_SUBDIR`), e.g. `catpaws`, `canvases`, `skills`, `connectors`,
 * `email-templates`, `catbrains`.
 *
 * For each listed id, we write a minimal stub frontmatter so any accidental
 * downstream parse doesn't blow up; `loadArchivedIds` only cares about the
 * filename (basename without `.md` suffix), so the body is irrelevant.
 */
function createFixtureLegacy(
  kbRoot: string,
  layout: Partial<Record<
    | 'catpaws'
    | 'canvases'
    | 'skills'
    | 'connectors'
    | 'email-templates'
    | 'catbrains',
    string[]
  >>
): void {
  const legacyRoot = path.resolve(kbRoot, '..', '.docflow-legacy', 'orphans');
  for (const [subdir, ids] of Object.entries(layout) as Array<
    [string, string[] | undefined]
  >) {
    if (!ids || ids.length === 0) continue;
    const dir = path.join(legacyRoot, subdir);
    fs.mkdirSync(dir, { recursive: true });
    for (const id of ids) {
      fs.writeFileSync(
        path.join(dir, `${id}.md`),
        `---\nid: ${id}\nstatus: archived\n---\n\n# ${id}\n`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Test harness — tmpRepo / tmpKb / tmpDb (mirrors kb-sync-db-source.test.ts)
// ---------------------------------------------------------------------------

let tmpRepo: string;
let tmpKb: string;
let tmpDb: string;

beforeEach(() => {
  tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'kbrebdet-'));
  tmpKb = path.join(tmpRepo, '.docflow-kb');
  tmpDb = path.join(tmpRepo, 'app/data/docflow.db');

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

  // Seed empty _index.json (Phase 149 layout)
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

  // Copy real schemas so validate-kb.cjs (spawned by --full-rebuild --source db)
  // finds them when the CLI integration test runs.
  if (fs.existsSync(SCHEMA_SRC)) {
    for (const f of fs.readdirSync(SCHEMA_SRC)) {
      fs.copyFileSync(path.join(SCHEMA_SRC, f), path.join(tmpKb, '_schema', f));
    }
  }

  // Copy CLI + DB-source + validator scripts into tmpRepo/scripts.
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

  // Symlink app/node_modules/better-sqlite3 so CLI invocations from tmpRepo
  // (the integration test below) succeed — otherwise _resolveBetterSqlite3
  // cannot locate the native binding. Test 1-3 require the module from its
  // real on-disk path (REPO_ROOT/scripts/) so they do not need this link.
  const realBetterSqlite3 = path.resolve(
    REPO_ROOT,
    'app',
    'node_modules',
    'better-sqlite3'
  );
  if (fs.existsSync(realBetterSqlite3)) {
    const tmpAppNm = path.join(tmpRepo, 'app', 'node_modules');
    fs.mkdirSync(tmpAppNm, { recursive: true });
    fs.symlinkSync(realBetterSqlite3, path.join(tmpAppNm, 'better-sqlite3'));
  }
});

afterEach(() => {
  fs.rmSync(tmpRepo, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Require the DB-source module under test (directly from the repo path so
// better-sqlite3 resolves via its normal ascending-path search — the tmpRepo
// copy has no node_modules alongside it). Matches the require() pattern used
// throughout kb-sync-db-source.test.ts.
// ---------------------------------------------------------------------------

function requireDbSource(): typeof import('../../../../scripts/kb-sync-db-source.cjs') {
  // Cache-bust so per-test tmpRepo fixtures don't alias each other through
  // any module-level state (taxonomy cache already resets itself, but we do
  // this for explicit isolation).
  delete require.cache[require.resolve(DB_SOURCE_SRC)];
  return require(DB_SOURCE_SRC);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Phase 157 Plan 01 — kb-sync rebuild exclusion (archived set)', () => {
  // -------------------------------------------------------------------------
  // Test 1 — loadArchivedIds returns empty Set when legacy tree missing
  // -------------------------------------------------------------------------
  it('loadArchivedIds returns empty Set when .docflow-legacy/ is absent', () => {
    // No createFixtureLegacy call → no legacy tree exists for this tmpRepo.
    const mod = requireDbSource();
    const fn = mod._internal.loadArchivedIds as
      | ((kbRoot: string) => Set<string>)
      | undefined;
    expect(typeof fn).toBe('function'); // fails in RED — function missing
    const ids = fn!(tmpKb);
    expect(ids).toBeInstanceOf(Set);
    expect(ids.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test 2 — loadArchivedIds reads all 6 subdirs into "<subtype>:<slug>" keys
  // -------------------------------------------------------------------------
  it('loadArchivedIds reads all 6 subdirs and returns "<subtype>:<slug>" keys', () => {
    createFixtureLegacy(tmpKb, {
      catpaws: ['abc12345-foo', 'def67890-bar'],
      canvases: ['c1234567-baz'],
      skills: ['s1234567-leads'],
      connectors: ['conn-custom-gmail'],
      'email-templates': ['t1234567-welcome'],
      catbrains: ['b1234567-kb'],
    });

    const mod = requireDbSource();
    const fn = mod._internal.loadArchivedIds as
      | ((kbRoot: string) => Set<string>)
      | undefined;
    expect(typeof fn).toBe('function');
    const ids = fn!(tmpKb);

    // Internal subtype identifiers (see SUBTYPE_SUBDIR): subdir 'catpaws' →
    // subtype 'catpaw'; 'canvases' → 'canvas'; 'skills' → 'skill';
    // 'connectors' → 'connector'; 'email-templates' → 'email-template';
    // 'catbrains' → 'catbrain'.
    expect(ids.has('catpaw:abc12345-foo')).toBe(true);
    expect(ids.has('catpaw:def67890-bar')).toBe(true);
    expect(ids.has('canvas:c1234567-baz')).toBe(true);
    expect(ids.has('skill:s1234567-leads')).toBe(true);
    expect(ids.has('connector:conn-custom-gmail')).toBe(true);
    expect(ids.has('email-template:t1234567-welcome')).toBe(true);
    expect(ids.has('catbrain:b1234567-kb')).toBe(true);
    expect(ids.size).toBe(7);
  });

  // -------------------------------------------------------------------------
  // Test 3 — populateFromDb excludes archived catpaw from Pass-2 write
  // -------------------------------------------------------------------------
  it('populateFromDb excludes an archived catpaw: no write, no update, report.skipped_archived++', () => {
    const db = createFixtureDb(tmpDb);
    db.close();

    // Preload the fixture to derive the exact short-id-slug that
    // kb-sync-db-source.cjs will assign to fixture-paw-01-active. With
    // slugify + resolveShortIdSlug, a 21-char UUID-shaped id uses the 8-char
    // prefix + slugified name. Use the module's _internal helpers to compute
    // the canonical short-id-slug so the legacy fixture matches exactly.
    const mod = requireDbSource();
    const internal = mod._internal as {
      buildIdMap: (
        db: unknown,
        subtypes: string[]
      ) => { maps: { catpaw: Map<string, string> } };
    };

    // Match the real production behavior: shortIdSlug = <id.slice(0,8)>-<slugify(name)>
    // fixture-paw-01-active starts "fixture-" (8 chars), name "Operador Holded Fixture"
    // → slugify → "operador-holded-fixture". Compose the key the same way
    // buildIdMap would. We do this by running the actual helper.
    const Database = require('better-sqlite3');
    const dbRO = new Database(tmpDb, { readonly: true, fileMustExist: true });
    const { maps } = internal.buildIdMap(dbRO, ['catpaw']);
    const archivedSlug = maps.catpaw.get('fixture-paw-01-active') as string;
    dbRO.close();
    expect(typeof archivedSlug).toBe('string');
    expect(archivedSlug.length).toBeGreaterThan(0);

    // Drop the archived stub under .docflow-legacy/orphans/catpaws/ so the
    // helper indexes this exact key and populateFromDb excludes the row.
    createFixtureLegacy(tmpKb, { catpaws: [archivedSlug] });

    // Sanity: no file under resources/catpaws yet.
    const writeTarget = path.join(
      tmpKb,
      'resources/catpaws',
      `${archivedSlug}.md`
    );
    expect(fs.existsSync(writeTarget)).toBe(false);

    const report = mod.populateFromDb({
      kbRoot: tmpKb,
      dbPath: tmpDb,
      subtypes: ['catpaw'],
      verbose: false,
    });

    // The archived row MUST NOT be written.
    expect(fs.existsSync(writeTarget)).toBe(false);

    // report.skipped_archived is a NEW field (not the same as `skipped`).
    expect(report.skipped_archived).toBe(1);

    // The other catpaw (fixture-paw-02-inactive) should still be processed
    // normally — at least 1 file was created/updated for non-archived rows.
    const createdOrUpdated =
      (report.created ?? 0) + (report.updated ?? 0) + (report.unchanged ?? 0);
    expect(createdOrUpdated).toBeGreaterThanOrEqual(1);

    // The legacy copy must remain untouched.
    const legacyCopy = path.resolve(
      tmpKb,
      '..',
      '.docflow-legacy',
      'orphans',
      'catpaws',
      `${archivedSlug}.md`
    );
    expect(fs.existsSync(legacyCopy)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test A — Phase 157 Plan 02 KB-47 — renderLinkedSectionCjs byte-equivalent
  // with runtime renderLinkedSection (knowledge-sync.ts:1021-1028). Pre-sorted
  // items + empty placeholder `_(…)_` must match char-for-char so rebuild
  // output == syncResource output (Phase 150 KB-09 isNoopUpdate idempotence).
  // -------------------------------------------------------------------------
  it('renderLinkedSectionCjs byte-equivalent with canonical format (sorted + placeholder)', () => {
    const mod = requireDbSource();
    const fn = (mod._internal as Record<string, unknown>).renderLinkedSectionCjs as
      | ((items: Array<{ id: string; name: string }>, emptyLabel: string) => string)
      | undefined;
    expect(typeof fn).toBe('function'); // RED: helper missing

    // Caller is responsible for sorting; helper only maps + joins. Use the
    // sorted-ASC shape that splitRelationsBySubtype will emit downstream.
    const sorted = [
      { id: 'xyz', name: 'Bar' },
      { id: 'abc', name: 'Foo' },
    ];
    expect(fn!(sorted, 'sin conectores vinculados')).toBe(
      '- **Bar** (`xyz`)\n- **Foo** (`abc`)'
    );

    // Empty array → italic placeholder (NOT omitted). Phase 157 RESEARCH
    // Pitfall 3: caller renders both section headings + this placeholder body
    // unconditionally.
    expect(fn!([], 'sin conectores vinculados')).toBe('_(sin conectores vinculados)_');
    expect(fn!([], 'sin skills vinculadas')).toBe('_(sin skills vinculadas)_');
  });

  // -------------------------------------------------------------------------
  // Test B — splitRelationsBySubtype discriminates flat array by rel.subtype
  // -------------------------------------------------------------------------
  it('splitRelationsBySubtype filters connector/skill from flat array, sorts ASC, ignores catbrain', () => {
    const mod = requireDbSource();
    const fn = (mod._internal as Record<string, unknown>).splitRelationsBySubtype as
      | ((
          arr: Array<{ id: string; subtype: string; name?: string }>
        ) => { connectors: Array<{ id: string; name: string }>; skills: Array<{ id: string; name: string }> })
      | undefined;
    expect(typeof fn).toBe('function'); // RED: helper missing

    const flat = [
      { id: 'c2', subtype: 'connector', name: 'Conn2' },
      { id: 's1', subtype: 'skill', name: 'Skill1' },
      { id: 'c1', subtype: 'connector', name: 'Conn1' },
      { id: 'cb1', subtype: 'catbrain', name: 'BrainIgnored' },
      { id: 's2', subtype: 'skill', name: 'Askill' }, // sort-check anchor
    ];
    const out = fn!(flat);

    // Connectors sorted ASC by name: Conn1 < Conn2
    expect(out.connectors).toEqual([
      { id: 'c1', name: 'Conn1' },
      { id: 'c2', name: 'Conn2' },
    ]);

    // Skills sorted ASC by name: Askill < Skill1
    expect(out.skills).toEqual([
      { id: 's2', name: 'Askill' },
      { id: 's1', name: 'Skill1' },
    ]);

    // catbrain was NOT smuggled into either bucket.
    expect(out.connectors.find((c) => c.id === 'cb1')).toBeUndefined();
    expect(out.skills.find((s) => s.id === 'cb1')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Test C — buildBody('catpaw', row, relations) renders both linked sections
  // with byte-equivalent format to renderLinkedSection (knowledge-sync.ts:1021)
  // -------------------------------------------------------------------------
  it("buildBody('catpaw', row, relations) includes '## Conectores vinculados' + '## Skills vinculadas' sections", () => {
    const mod = requireDbSource();
    const buildBody = (mod._internal as Record<string, unknown>).buildBody as
      | ((subtype: string, row: Record<string, unknown>, relations?: unknown[]) => string)
      | undefined;
    expect(typeof buildBody).toBe('function');
    // RED assertion: the function must accept a 3rd arg and render sections.

    const row = {
      id: 'fixture-paw-holded',
      name: 'Operador Holded',
      description: 'CRM generalist',
      mode: 'processor',
      model: 'gemini-main',
      system_prompt: null,
      tone: null,
      department_tags: null,
      is_active: 1,
      times_used: 0,
      temperature: 0.2,
      max_tokens: 4096,
      output_format: 'json',
    };
    const relations = [
      {
        id: 'seed-holded-mcp',
        subtype: 'connector',
        name: 'Holded MCP',
        connector_type_raw: 'mcp_server',
      },
      { id: 'skill-dedup', subtype: 'skill', name: 'Deduplicación de leads' },
    ];

    const body = buildBody!('catpaw', row, relations);

    // Canonical byte-equivalent format per knowledge-sync.ts:1021-1028.
    expect(body).toContain('## Conectores vinculados\n\n- **Holded MCP** (`seed-holded-mcp`)');
    expect(body).toContain(
      '## Skills vinculadas\n\n- **Deduplicación de leads** (`skill-dedup`)'
    );
  });

  // -------------------------------------------------------------------------
  // Test D — buildBody('catpaw', row, []) renders both sections with placeholder
  // (Pitfall 3: sections are ALWAYS rendered, never omitted when empty)
  // -------------------------------------------------------------------------
  it("buildBody('catpaw', row, []) still renders both sections with italic placeholder", () => {
    const mod = requireDbSource();
    const buildBody = (mod._internal as Record<string, unknown>).buildBody as
      | ((subtype: string, row: Record<string, unknown>, relations?: unknown[]) => string)
      | undefined;
    expect(typeof buildBody).toBe('function');

    const row = {
      id: 'fixture-paw-empty',
      name: 'Lonely CatPaw',
      description: 'no links',
      mode: 'chat',
      model: 'gemini-main',
      system_prompt: null,
      tone: null,
      department_tags: null,
      is_active: 1,
      times_used: 0,
      temperature: 0.5,
      max_tokens: 1024,
      output_format: 'md',
    };
    const body = buildBody!('catpaw', row, []);

    // Pitfall 3: both ## headings present + placeholder body.
    expect(body).toContain('## Conectores vinculados\n\n_(sin conectores vinculados)_');
    expect(body).toContain('## Skills vinculadas\n\n_(sin skills vinculadas)_');
  });

  // -------------------------------------------------------------------------
  // Test E — buildBody('connector', row, relations) ignores relations
  // (backwards-compat: only catpaws render linked sections)
  // -------------------------------------------------------------------------
  it("buildBody('connector', row, relations) does NOT render linked sections (catpaw-only)", () => {
    const mod = requireDbSource();
    const buildBody = (mod._internal as Record<string, unknown>).buildBody as
      | ((subtype: string, row: Record<string, unknown>, relations?: unknown[]) => string)
      | undefined;
    expect(typeof buildBody).toBe('function');

    const row = {
      id: 'conn-test',
      name: 'Connector X',
      description: 'an mcp connector',
      type: 'mcp_server',
      is_active: 1,
      times_used: 0,
      test_status: 'passing',
    };
    // Even if a caller accidentally passes relations, connector subtype MUST
    // NOT emit the catpaw-specific headings.
    const relations = [{ id: 'x', subtype: 'connector', name: 'SomeName' }];
    const body = buildBody!('connector', row, relations);

    expect(body).not.toContain('## Conectores vinculados');
    expect(body).not.toContain('## Skills vinculadas');
  });

  // -------------------------------------------------------------------------
  // Test F — search_hints KB-42 regression guard: populateFromDb preserves
  // the search_hints frontmatter field when rebuilding a catpaw body. Ensures
  // Phase 157 KB-47 does not break Phase 156-02 KB-42 search surface.
  // -------------------------------------------------------------------------
  it('populateFromDb preserves search_hints frontmatter on rebuilt catpaw (KB-42 regression guard)', () => {
    const db = createFixtureDb(tmpDb);
    db.close();

    const mod = requireDbSource();
    mod.populateFromDb({
      kbRoot: tmpKb,
      dbPath: tmpDb,
      subtypes: ['catpaw', 'connector', 'skill'],
      verbose: false,
    });

    // fixture-paw-01-active is linked to 'Test Connector A' (seed-test-a) and
    // 'Test Skill With Mixed Tags' (fixture-skill-01). search_hints should
    // carry both names (case-insensitive dedup + sort ASC — Phase 156 KB-42).
    const dir = path.join(tmpKb, 'resources/catpaws');
    const files = fs.readdirSync(dir);
    const match = files.find((f) => f.startsWith('fixture-') && f.includes('operador-holded'));
    expect(match, 'fixture-paw-01-active .md must exist').toBeDefined();
    const raw = fs.readFileSync(path.join(dir, match!), 'utf8');

    // Frontmatter must include search_hints: […] with both names.
    expect(raw).toMatch(/^search_hints:\s*\[[^\]]*Test Connector A[^\]]*\]/m);
    expect(raw).toMatch(/^search_hints:\s*\[[^\]]*Test Skill With Mixed Tags[^\]]*\]/m);

    // Also: the body must now contain the KB-47 '## Conectores vinculados'
    // section so rebuild output matches the runtime path.
    expect(raw).toContain('## Conectores vinculados');
    expect(raw).toContain('- **Test Connector A** (`seed-test-a`)');
    expect(raw).toContain('## Skills vinculadas');
    expect(raw).toContain('- **Test Skill With Mixed Tags** (`fixture-skill-01`)');
  });

  // -------------------------------------------------------------------------
  // Test 4 (integration) — CLI --dry-run --verbose logs [archived-skip] + summary
  // -------------------------------------------------------------------------
  it('CLI --full-rebuild --source db --dry-run --verbose surfaces [archived-skip] and skipped_archived summary', () => {
    const db = createFixtureDb(tmpDb);
    db.close();

    // Build the archived set against the canonical short-id-slug of
    // fixture-paw-01-active.
    const mod = requireDbSource();
    const Database = require('better-sqlite3');
    const dbRO = new Database(tmpDb, { readonly: true, fileMustExist: true });
    const { maps } = mod._internal.buildIdMap(dbRO, ['catpaw']);
    const archivedSlug = maps.catpaw.get('fixture-paw-01-active') as string;
    dbRO.close();
    createFixtureLegacy(tmpKb, { catpaws: [archivedSlug] });

    // Invoke the CLI under tmpRepo. Pass DATABASE_PATH so openDb finds the
    // fixture DB (its default resolves to <scripts/>/../app/data/docflow.db
    // inside tmpRepo, which we created above — either works, but explicit is
    // more robust to copy-order changes). Capture BOTH stdout and stderr via
    // 2>&1 redirection (the `[archived-skip]` WARN goes through
    // console.warn, which writes to stderr by default).
    let combined = '';
    let exitCode = 0;
    try {
      combined = execFileSync(
        'bash',
        [
          '-c',
          'node scripts/kb-sync.cjs --full-rebuild --source db --dry-run --verbose 2>&1',
        ],
        {
          cwd: tmpRepo,
          env: {
            ...process.env,
            KB_SYNC_REPO_ROOT: tmpRepo,
            DATABASE_PATH: tmpDb,
          },
          encoding: 'utf8',
        }
      );
    } catch (e: unknown) {
      const err = e as { stdout?: unknown; stderr?: unknown; status?: number };
      combined = String(err.stdout ?? '') + String(err.stderr ?? '');
      exitCode = typeof err.status === 'number' ? err.status : 1;
    }
    const stdout = combined;

    // Dry-run must not blow up. Phase 150 behavior: exit code 0.
    expect(exitCode).toBe(0);

    // --verbose must emit an [archived-skip] WARN line for the excluded row.
    // We do NOT pin the exact slug to avoid brittleness if resolveShortIdSlug
    // changes; presence of the prefix + matching subtype is enough.
    expect(stdout).toMatch(/\[archived-skip\]\s+catpaw\//);

    // The script's PLAN summary line already exists (Phase 150). We want
    // skipped_archived surfaced explicitly — either as its own field in the
    // summary or a dedicated log line. Assert either form.
    expect(stdout).toMatch(/skipped_archived\s*[:=]\s*1/);
  });

  // -------------------------------------------------------------------------
  // Phase 157 Plan 03 — cmdRestore + idempotence regression tests (G-K)
  // -------------------------------------------------------------------------

  /**
   * Helper: invoke `node scripts/kb-sync.cjs --restore ...` inside tmpRepo and
   * capture exit code + merged stdout/stderr. Mirrors Test 4's bash -c '2>&1'
   * pattern so stderr (where error messages are emitted via console.error) is
   * captured alongside stdout.
   */
  function runRestoreCli(cliArgs: string[]): { exitCode: number; combined: string } {
    let combined = '';
    let exitCode = 0;
    const joined = cliArgs.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
    try {
      combined = execFileSync(
        'bash',
        ['-c', `node scripts/kb-sync.cjs ${joined} 2>&1`],
        {
          cwd: tmpRepo,
          env: {
            ...process.env,
            KB_SYNC_REPO_ROOT: tmpRepo,
            DATABASE_PATH: tmpDb,
          },
          encoding: 'utf8',
        }
      );
    } catch (e: unknown) {
      const err = e as { stdout?: unknown; stderr?: unknown; status?: number };
      combined = String(err.stdout ?? '') + String(err.stderr ?? '');
      exitCode = typeof err.status === 'number' ? err.status : 1;
    }
    return { exitCode, combined };
  }

  // -------------------------------------------------------------------------
  // Test G — cmdRestore happy path
  // -------------------------------------------------------------------------
  it('cmdRestore happy path: moves .docflow-legacy/orphans/catpaws/<id>.md → resources/catpaws/<id>.md', () => {
    const targetId = 'abc12345-foo';
    createFixtureLegacy(tmpKb, { catpaws: [targetId] });

    const legacyPath = path.resolve(
      tmpKb,
      '..',
      '.docflow-legacy',
      'orphans',
      'catpaws',
      `${targetId}.md`
    );
    const destPath = path.join(tmpKb, 'resources/catpaws', `${targetId}.md`);

    expect(fs.existsSync(legacyPath)).toBe(true);
    expect(fs.existsSync(destPath)).toBe(false);

    const { exitCode, combined } = runRestoreCli(['--restore', '--from-legacy', targetId]);

    expect(exitCode).toBe(0);
    expect(combined).toMatch(/RESTORED:/);
    expect(fs.existsSync(destPath)).toBe(true);
    expect(fs.existsSync(legacyPath)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test H — cmdRestore missing args → exit 1
  // -------------------------------------------------------------------------
  it('cmdRestore missing --from-legacy flag/arg → exit 1 with clear error', () => {
    // Case a: --restore alone, no --from-legacy
    const a = runRestoreCli(['--restore']);
    expect(a.exitCode).toBe(1);
    expect(a.combined).toMatch(/requires --from-legacy/);

    // Case b: --restore --from-legacy but no value after the flag
    const b = runRestoreCli(['--restore', '--from-legacy']);
    expect(b.exitCode).toBe(1);
    expect(b.combined).toMatch(/requires --from-legacy/);
  });

  // -------------------------------------------------------------------------
  // Test I — cmdRestore not-found / ambiguous → exit 2
  // -------------------------------------------------------------------------
  it('cmdRestore not-found or ambiguous id → exit 2', () => {
    // Case a: empty .docflow-legacy/ — id does not exist anywhere
    // (fixture didn't create any legacy subdir; helper creates legacyRoot only
    //  when at least one subdir has ids — so legacyRoot may not exist yet)
    // Pre-seed the legacyRoot empty so cmdRestore distinguishes
    // "legacy missing" from "id missing". createFixtureLegacy with a single id
    // and then delete it gives us an empty-but-existing subdir tree.
    const legacyRoot = path.resolve(tmpKb, '..', '.docflow-legacy', 'orphans');
    fs.mkdirSync(path.join(legacyRoot, 'catpaws'), { recursive: true });
    const a = runRestoreCli(['--restore', '--from-legacy', 'does-not-exist']);
    expect(a.exitCode).toBe(2);
    expect(a.combined).toMatch(/not found/);

    // Case b: same id in 2 subdirs → ambiguous
    createFixtureLegacy(tmpKb, {
      catpaws: ['dup-id'],
      canvases: ['dup-id'],
    });
    const b = runRestoreCli(['--restore', '--from-legacy', 'dup-id']);
    expect(b.exitCode).toBe(2);
    expect(b.combined).toMatch(/ambiguous/);
  });

  // -------------------------------------------------------------------------
  // Test J — cmdRestore destination conflict → exit 3
  // -------------------------------------------------------------------------
  it('cmdRestore destination conflict (file exists in resources/) → exit 3', () => {
    const dupId = 'dup-id';
    createFixtureLegacy(tmpKb, { catpaws: [dupId] });

    // Create a conflicting file in destination resources/catpaws/<id>.md
    const destPath = path.join(tmpKb, 'resources/catpaws', `${dupId}.md`);
    fs.writeFileSync(destPath, '---\nid: dup-id\nstatus: active\n---\n# pre-existing\n');

    const { exitCode, combined } = runRestoreCli(['--restore', '--from-legacy', dupId]);
    expect(exitCode).toBe(3);
    expect(combined).toMatch(/already exists/);

    // Destination file untouched; legacy copy ALSO untouched.
    expect(fs.existsSync(destPath)).toBe(true);
    const legacyPath = path.resolve(
      tmpKb,
      '..',
      '.docflow-legacy',
      'orphans',
      'catpaws',
      `${dupId}.md`
    );
    expect(fs.existsSync(legacyPath)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test K — Idempotence regression: second rebuild on stable state = 0 writes
  // -------------------------------------------------------------------------
  it('populateFromDb second run on stable state: 0 created/updated + skipped_archived preserved (Phase 150 KB-09 regression guard)', () => {
    const db = createFixtureDb(tmpDb);
    db.close();

    // Stage 1: build the canonical archived slug for fixture-paw-01-active and
    // legacy-stub it so the exclusion counter increments on both runs.
    const mod = requireDbSource();
    const Database = require('better-sqlite3');
    const dbRO = new Database(tmpDb, { readonly: true, fileMustExist: true });
    const { maps } = mod._internal.buildIdMap(dbRO, ['catpaw']);
    const archivedSlug = maps.catpaw.get('fixture-paw-01-active') as string;
    dbRO.close();
    createFixtureLegacy(tmpKb, { catpaws: [archivedSlug] });

    // First run: backfill. Expect at least some writes.
    const report1 = mod.populateFromDb({
      kbRoot: tmpKb,
      dbPath: tmpDb,
      subtypes: ['catpaw', 'connector', 'skill'],
      verbose: false,
    });
    expect(report1.skipped_archived).toBe(1);
    // At least one file touched on first pass (the non-archived fixture-paw-02
    // + connectors + skills rows).
    expect((report1.created ?? 0) + (report1.updated ?? 0)).toBeGreaterThanOrEqual(1);

    // Second run: stable state → 0 creates, 0 updates (isNoopUpdate short-
    // circuit), skipped_archived preserved, unchanged >= 1.
    const report2 = mod.populateFromDb({
      kbRoot: tmpKb,
      dbPath: tmpDb,
      subtypes: ['catpaw', 'connector', 'skill'],
      verbose: false,
    });
    expect(report2.created ?? 0).toBe(0);
    expect(report2.updated ?? 0).toBe(0);
    expect(report2.unchanged ?? 0).toBeGreaterThanOrEqual(1);
    expect(report2.skipped_archived).toBe(report1.skipped_archived);
  });
});
