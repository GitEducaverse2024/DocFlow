/**
 * kb-sync-cli.test.ts — Tests de integración del CLI scripts/kb-sync.cjs.
 *
 * Phase 149 Plan 04 (KB-05).
 *
 * Cubre los 4 comandos + safety gates + corner cases:
 *   - Test 1: --full-rebuild sobre KB vacío → entry_count=0
 *   - Test 2: --full-rebuild con 2 archivos válidos → entry_count=2
 *   - Test 3: --audit-stale con archivo deprecated 200d → eligible_for_purge=1
 *   - Test 4: --audit-stale con archivo deprecated 160d → warning_only=1, warning_visible=false
 *   - Test 5: --audit-stale con archivo deprecated 175d → warning_only=1, warning_visible=true
 *   - Test 6: --archive sin --confirm → exit 1
 *   - Test 7: --archive --confirm con elegible → movido a _archived/, status=archived
 *   - Test 8: --purge sin --confirm → exit 1
 *   - Test 9: --archive --confirm NO mueve archivo con refs incoming
 *   - Test 10: --full-rebuild --source db → exit 1 con "Fase 2"
 *   - Test 11: --purge --confirm --older-than-archived=365d sobre dir <365d → no-op
 *   - Test 12: --purge --confirm --older-than-archived=30d sobre dir 60d → borra
 *
 * Patrón: tmpRepo aislado con copia del CLI y schemas → ejecuta con cwd=tmpRepo.
 * El KB_ROOT del CLI es relativo (`__dirname, '..', '.docflow-kb'`), por lo que al
 * copiar el script a tmpRepo/scripts/ apunta a tmpRepo/.docflow-kb/.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const CLI_SRC = path.join(REPO_ROOT, 'scripts/kb-sync.cjs');

let tmpRepo: string;
let tmpKb: string;
let tmpCli: string;

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): CliResult {
  try {
    const stdout = execSync(`node "${tmpCli}" ${args.join(' ')}`, {
      cwd: tmpRepo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { status?: number; stdout?: Buffer; stderr?: Buffer };
    return {
      code: typeof err.status === 'number' ? err.status : 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

function daysAgoISO(d: number): string {
  return new Date(Date.now() - d * 86400000).toISOString();
}

/**
 * writeFixture — genera un archivo .md con frontmatter YAML compatible con
 * el parser del CLI. Soporta strings, arrays inline, dicts (inline flat o
 * nested) y null. Match de estilo con los tests de knowledge-sync.test.ts.
 */
function writeFixture(
  subdir: string,
  filename: string,
  fm: Record<string, unknown>,
  body = 'body',
): string {
  const fpath = path.join(tmpKb, subdir, filename);
  fs.mkdirSync(path.dirname(fpath), { recursive: true });
  const yaml: string[] = ['---'];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) {
      // Inline list, valores como string quoted
      const items = v.map((x) => (typeof x === 'string' ? `"${x}"` : String(x))).join(', ');
      yaml.push(`${k}: [${items}]`);
    } else if (v === null) {
      yaml.push(`${k}: null`);
    } else if (typeof v === 'object') {
      // Dict multiline
      yaml.push(`${k}:`);
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        if (Array.isArray(sv)) {
          const items = sv.map((x) => (typeof x === 'string' ? `"${x}"` : String(x))).join(', ');
          yaml.push(`  ${sk}: [${items}]`);
        } else if (typeof sv === 'string') {
          yaml.push(`  ${sk}: "${sv}"`);
        } else {
          yaml.push(`  ${sk}: ${String(sv)}`);
        }
      }
    } else if (typeof v === 'string') {
      yaml.push(`${k}: "${v}"`);
    } else {
      yaml.push(`${k}: ${String(v)}`);
    }
  }
  yaml.push('---');
  yaml.push(body);
  fs.writeFileSync(fpath, yaml.join('\n'));
  return fpath;
}

/**
 * Frontmatter válido contra frontmatter.schema.json para un catpaw activo.
 * Los 16 campos requeridos + ttl=managed extras.
 */
function validActiveCatpaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'catpaw-test',
    type: 'resource',
    subtype: 'catpaw',
    lang: 'es',
    title: 'Test Catpaw',
    summary: 'A test catpaw',
    tags: ['catpaw', 'crm'],
    audience: ['catbot'],
    status: 'active',
    created_at: daysAgoISO(10),
    created_by: 'test',
    version: '1.0.0',
    updated_at: daysAgoISO(5),
    updated_by: 'test',
    last_accessed_at: daysAgoISO(1),
    access_count: 3,
    source_of_truth: null,
    change_log: [{ version: '1.0.0', date: '2026-04-01', author: 'test', change: 'created' }],
    ttl: 'managed',
    ...overrides,
  };
}

/**
 * Frontmatter deprecated — añade deprecated_* requeridos por schema.
 */
function deprecatedCatpaw(
  daysSinceAccess: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...validActiveCatpaw(),
    status: 'deprecated',
    deprecated_at: daysAgoISO(daysSinceAccess),
    deprecated_by: 'test',
    deprecated_reason: 'test teardown',
    last_accessed_at: daysAgoISO(daysSinceAccess),
    ...overrides,
  };
}

/**
 * Extrae un campo del frontmatter de un MD, buscando en la sección antes
 * del segundo `---`. Soporta escalares simples (`key: value`).
 */
function extractFrontmatterField(content: string, key: string): string | null {
  const lines = content.split('\n');
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }
  const fmLines = endIdx === -1 ? lines : lines.slice(1, endIdx);
  for (const line of fmLines) {
    const m = line.match(new RegExp(`^${key}:\\s*(.+)$`));
    if (m) {
      let v = m[1].trim();
      // Strip surrounding quotes (fixtures may double-quote scalar values)
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v;
    }
  }
  return null;
}

beforeEach(() => {
  tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'kbcli-'));
  tmpKb = path.join(tmpRepo, '.docflow-kb');
  tmpCli = path.join(tmpRepo, 'scripts/kb-sync.cjs');

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

  // Seed _index.json vacío (el CLI lo reescribirá cuando se invoque --full-rebuild)
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
      2,
    ),
  );

  // Copiar el CLI real al tmpRepo/scripts/ para que su KB_ROOT relativo apunte a tmpKb
  fs.mkdirSync(path.join(tmpRepo, 'scripts'), { recursive: true });
  fs.copyFileSync(CLI_SRC, tmpCli);

  // Copiar schemas reales (el CLI no los valida pero los tests que
  // inspeccionan el audit generado pueden necesitarlos para validar)
  const schemaSrc = path.join(REPO_ROOT, '.docflow-kb/_schema');
  if (fs.existsSync(schemaSrc)) {
    for (const f of fs.readdirSync(schemaSrc)) {
      fs.copyFileSync(path.join(schemaSrc, f), path.join(tmpKb, '_schema', f));
    }
  }
});

afterEach(() => {
  fs.rmSync(tmpRepo, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('kb-sync CLI — --full-rebuild', () => {
  it('Test 1: sobre KB vacío produce _index.json con entry_count=0 y shape v2', () => {
    const result = runCli(['--full-rebuild']);
    expect(result.code).toBe(0);
    // Phase 150-04: log line now also mentions _header.md (regenerated together)
    expect(result.stdout).toMatch(
      /OK: _index\.json \+ _header\.md regenerados con 0 entries/,
    );

    const idx = JSON.parse(fs.readFileSync(path.join(tmpKb, '_index.json'), 'utf8'));
    expect(idx.schema_version).toBe('2.0');
    expect(idx.entry_count).toBe(0);
    expect(idx.header).toBeDefined();
    expect(idx.header.counts).toBeDefined();
    // Las 8 keys de counts requeridas
    expect(Object.keys(idx.header.counts)).toEqual(
      expect.arrayContaining([
        'catpaws_active',
        'connectors_active',
        'catbrains_active',
        'templates_active',
        'skills_active',
        'rules',
        'incidents_resolved',
        'features_documented',
      ]),
    );
    expect(idx.indexes.by_type).toEqual({});
    expect(idx.indexes.by_tag).toEqual({});
    expect(idx.indexes.by_audience).toEqual({});
  });

  it('Test 2: con 2 archivos válidos produce entry_count=2 y por-tipo correcto', () => {
    writeFixture('resources/catpaws', 'aaa-foo.md', validActiveCatpaw({ id: 'catpaw-aaa' }));
    writeFixture(
      'resources/connectors',
      'bbb-bar.md',
      validActiveCatpaw({
        id: 'connector-bbb',
        subtype: 'connector',
        tags: ['connector', 'gmail'],
      }),
    );

    const result = runCli(['--full-rebuild']);
    expect(result.code).toBe(0);

    const idx = JSON.parse(fs.readFileSync(path.join(tmpKb, '_index.json'), 'utf8'));
    expect(idx.entry_count).toBe(2);
    expect(idx.entries).toHaveLength(2);
    expect(idx.indexes.by_type.resource).toHaveLength(2);
    expect(idx.header.counts.catpaws_active).toBe(1);
    expect(idx.header.counts.connectors_active).toBe(1);
  });
});

describe('kb-sync CLI — --audit-stale', () => {
  it('Test 3: archivo deprecated 200 días → eligible_for_purge=1', () => {
    writeFixture('resources/catpaws', 'old-200.md', deprecatedCatpaw(200, { id: 'catpaw-old-200' }));

    const result = runCli(['--audit-stale']);
    expect(result.code).toBe(0);

    const auditPath = path.join(tmpKb, '_audit_stale.md');
    expect(fs.existsSync(auditPath)).toBe(true);
    const audit = fs.readFileSync(auditPath, 'utf8');

    expect(extractFrontmatterField(audit, 'eligible_for_purge')).toBe('1');
    expect(extractFrontmatterField(audit, 'warning_only')).toBe('0');
    // Body incluye al archivo en la tabla de elegibles
    expect(audit).toContain('catpaw-old-200');
    expect(audit).toContain('**Elegible archivar**');
  });

  it('Test 4: archivo deprecated 160 días → warning_only=1, warning_visible=false', () => {
    writeFixture('resources/catpaws', 'warn-160.md', deprecatedCatpaw(160, { id: 'catpaw-warn-160' }));

    const result = runCli(['--audit-stale']);
    expect(result.code).toBe(0);

    const audit = fs.readFileSync(path.join(tmpKb, '_audit_stale.md'), 'utf8');
    expect(extractFrontmatterField(audit, 'eligible_for_purge')).toBe('0');
    expect(extractFrontmatterField(audit, 'warning_only')).toBe('1');
    expect(extractFrontmatterField(audit, 'warning_visible')).toBe('false');
    // El warning aparece pero como "Aviso informativo" (no visible aún)
    expect(audit).toContain('catpaw-warn-160');
    expect(audit).toContain('Aviso informativo');
  });

  it('Test 5: archivo deprecated 175 días → warning_only=1, warning_visible=true', () => {
    writeFixture('resources/catpaws', 'warn-175.md', deprecatedCatpaw(175, { id: 'catpaw-warn-175' }));

    const result = runCli(['--audit-stale']);
    expect(result.code).toBe(0);

    const audit = fs.readFileSync(path.join(tmpKb, '_audit_stale.md'), 'utf8');
    expect(extractFrontmatterField(audit, 'eligible_for_purge')).toBe('0');
    expect(extractFrontmatterField(audit, 'warning_only')).toBe('1');
    expect(extractFrontmatterField(audit, 'warning_visible')).toBe('true');
    expect(audit).toContain('catpaw-warn-175');
    expect(audit).toContain('**Warning visible**');
  });
});

describe('kb-sync CLI — safety gates', () => {
  it('Test 6: --archive sin --confirm aborta exit 1 con mensaje', () => {
    const result = runCli(['--archive']);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/--confirm/);
    expect(result.stderr).toMatch(/--archive/);
  });

  it('Test 8: --purge sin --confirm aborta exit 1', () => {
    const result = runCli(['--purge']);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/--confirm/);
    expect(result.stderr).toMatch(/--purge/);
  });

  // Phase 150 Plan 03: --source db is now wired to kb-sync-db-source.cjs and
  // no longer rejected. These two tests assert that the CLI attempts to load
  // the module; because the tmp repo harness does not copy the module, the
  // CLI should exit 3 with "failed to load" (module-load error gate).
  it('Test 10: --full-rebuild --source db now delegates to populateFromDb (module absent → exit 3)', () => {
    const result = runCli(['--full-rebuild', '--source', 'db']);
    expect(result.code).toBe(3);
    expect(result.stderr).toMatch(/failed to load kb-sync-db-source\.cjs/);
    // No more Phase 149 reject message
    expect(result.stderr).not.toMatch(/Fase 2/);
  });

  it('Test 10b: --full-rebuild --source=db (forma unida) también delega', () => {
    const result = runCli(['--full-rebuild', '--source=db']);
    expect(result.code).toBe(3);
    expect(result.stderr).toMatch(/failed to load kb-sync-db-source\.cjs/);
  });
});

describe('kb-sync CLI — --archive --confirm', () => {
  it('Test 7: archivo deprecated >180d sin refs → movido a _archived/YYYY-MM-DD/, status=archived', () => {
    const fname = 'old-file.md';
    writeFixture(
      'resources/catpaws',
      fname,
      deprecatedCatpaw(200, { id: 'catpaw-archive-me' }),
    );

    const result = runCli(['--archive', '--confirm']);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/ARCHIVED:/);

    // Original desapareció
    expect(fs.existsSync(path.join(tmpKb, 'resources/catpaws', fname))).toBe(false);

    // Archivado en _archived/YYYY-MM-DD/
    const archivedRoot = path.join(tmpKb, '_archived');
    expect(fs.existsSync(archivedRoot)).toBe(true);
    const dateDirs = fs.readdirSync(archivedRoot);
    expect(dateDirs).toHaveLength(1);
    expect(dateDirs[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const archivedFiles = fs.readdirSync(path.join(archivedRoot, dateDirs[0]));
    expect(archivedFiles).toContain(fname);

    // Status → archived
    const archivedContent = fs.readFileSync(path.join(archivedRoot, dateDirs[0], fname), 'utf8');
    expect(extractFrontmatterField(archivedContent, 'status')).toBe('archived');

    // _index.json regenerado (el archivo ya no cuenta como active)
    const idx = JSON.parse(fs.readFileSync(path.join(tmpKb, '_index.json'), 'utf8'));
    expect(idx.entry_count).toBe(0); // archivado no cuenta (vive bajo _archived/ excluido)
  });

  it('Test 9: archivo con refs incoming NO es movido', () => {
    // Archivo A deprecated >180d — candidato
    writeFixture(
      'resources/catpaws',
      'target.md',
      deprecatedCatpaw(200, { id: 'catpaw-target' }),
    );
    // Archivo B activo con `related: [catpaw-target]` → bloquea archivado de A
    writeFixture(
      'resources/catpaws',
      'holder.md',
      validActiveCatpaw({
        id: 'catpaw-holder',
        related: ['catpaw-target'],
      }),
    );

    const result = runCli(['--archive', '--confirm']);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/OK: 0 archivos archivados/);

    // target.md sigue en su sitio, status sigue deprecated
    const originalPath = path.join(tmpKb, 'resources/catpaws/target.md');
    expect(fs.existsSync(originalPath)).toBe(true);
    const content = fs.readFileSync(originalPath, 'utf8');
    expect(extractFrontmatterField(content, 'status')).toBe('deprecated');

    // _archived/ o no existe o está vacío
    const archivedRoot = path.join(tmpKb, '_archived');
    if (fs.existsSync(archivedRoot)) {
      const dateDirs = fs.readdirSync(archivedRoot);
      for (const d of dateDirs) {
        const files = fs.readdirSync(path.join(archivedRoot, d));
        expect(files).toHaveLength(0);
      }
    }
  });
});

describe('kb-sync CLI — --purge --confirm', () => {
  it('Test 11: purge con threshold 365d sobre dir recién archivado (<1d) → no-op', () => {
    // Crear manualmente un dir _archived/ con fecha de hoy
    const isoDate = new Date().toISOString().slice(0, 10);
    const dir = path.join(tmpKb, '_archived', isoDate);
    fs.mkdirSync(dir, { recursive: true });
    const stuck = path.join(dir, 'fresh.md');
    fs.writeFileSync(stuck, '---\nid: fresh\n---\nbody');

    const result = runCli(['--purge', '--confirm', '--older-than-archived=365d']);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/OK: 0 archivos purgados/);
    expect(fs.existsSync(stuck)).toBe(true); // sigue ahí
  });

  it('Test 12: purge con threshold 30d sobre dir 60d-antiguo → borra físicamente', () => {
    // Crear dir con fecha de hace 60 días
    const dateStr = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const dir = path.join(tmpKb, '_archived', dateStr);
    fs.mkdirSync(dir, { recursive: true });
    const victim = path.join(dir, 'victim.md');
    fs.writeFileSync(victim, '---\nid: victim\n---\nbody');

    const result = runCli(['--purge', '--confirm', '--older-than-archived=30d']);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/OK: 1 archivos purgados/);
    expect(fs.existsSync(victim)).toBe(false);
  });
});
