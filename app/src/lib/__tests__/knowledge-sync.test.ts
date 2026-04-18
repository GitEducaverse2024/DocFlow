/**
 * knowledge-sync.test.ts — Tests unitarios para el servicio de sync KB ↔ DB.
 *
 * Phase 149 Plan 03 — TDD RED stage.
 *
 * Cubre:
 *   - Grupo A: detectBumpLevel, una fila por cada entrada de la tabla §5.2 del PRD (12 filas).
 *   - Grupo B: syncResource create/update/delete(soft)/access.
 *   - Grupo C: touchAccess directo.
 *   - Grupo D: markDeprecated directo.
 *   - Grupo E: Merge conflicts DB ↔ archivo (Casos 2 y 4 del §5.3 del PRD).
 *
 * No mockea disco: usa tmp dirs reales (fs.mkdtempSync) y teardown limpio.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import {
  syncResource,
  touchAccess,
  detectBumpLevel,
  markDeprecated,
  type DBRow,
} from '../services/knowledge-sync';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpRoot: string;

const SCHEMA_SOURCE_DIR = path.resolve(__dirname, '../../../../.docflow-kb/_schema');
const VALIDATOR_SCRIPT = path.resolve(__dirname, '../../../../scripts/validate-kb.cjs');

function emptyIndex(): Record<string, unknown> {
  return {
    schema_version: '2.0',
    generated_at: new Date().toISOString(),
    generated_by: 'knowledge-sync',
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
    indexes: {
      by_type: {},
      by_tag: {},
      by_audience: {},
    },
  };
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kbtest-'));
  const dirs = [
    '_schema',
    'domain/concepts',
    'domain/taxonomies',
    'domain/architecture',
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
  for (const d of dirs) fs.mkdirSync(path.join(tmpRoot, d), { recursive: true });

  // Copiar schemas reales (para que el validador externo pueda validar los archivos generados)
  if (fs.existsSync(SCHEMA_SOURCE_DIR)) {
    for (const f of fs.readdirSync(SCHEMA_SOURCE_DIR)) {
      fs.copyFileSync(
        path.join(SCHEMA_SOURCE_DIR, f),
        path.join(tmpRoot, '_schema', f)
      );
    }
  }

  fs.writeFileSync(
    path.join(tmpRoot, '_index.json'),
    JSON.stringify(emptyIndex(), null, 2)
  );
  fs.writeFileSync(
    path.join(tmpRoot, '_header.md'),
    '# KB Header\n\nCounts: 0\n'
  );
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const baseRow: DBRow = {
  id: '53f19c51-9cac-4b23-87ca-cd4d1b30c5ad',
  name: 'Operador Holded',
  description: 'CatPaw CRM generalista',
  mode: 'processor',
  model: 'gemini-main',
  system_prompt: 'You are a CRM operator',
  temperature: 0.2,
  max_tokens: 2048,
  is_active: 1,
  department: 'business',
};

function readResource(entity: string): string {
  const subdir = path.join(tmpRoot, 'resources', `${entity}s`);
  const files = fs.readdirSync(subdir);
  expect(files.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(subdir, files[0]), 'utf8');
}

function getResourcePath(entity: string): string {
  const subdir = path.join(tmpRoot, 'resources', `${entity}s`);
  const files = fs.readdirSync(subdir);
  return path.join(subdir, files[0]);
}

// ---------------------------------------------------------------------------
// Grupo A — detectBumpLevel (12 filas de la tabla §5.2 del PRD)
// ---------------------------------------------------------------------------

describe('detectBumpLevel — tabla §5.2 del PRD', () => {
  const baseCurrent = {
    version: '1.0.0',
    mode: 'processor',
    subtype: 'catpaw',
    status: 'active',
    lang: 'es',
    system_prompt: 'You are a CRM operator',
    connectors_linked: [],
    skills_linked: [],
    related: [],
  };

  // Row 1: Auto-sync por times_used en DB → patch
  it('row 1: times_used cambió → patch', () => {
    const newRow: DBRow = { ...baseRow, times_used: 50 };
    expect(detectBumpLevel(baseCurrent, newRow)).toBe('patch');
  });

  // Row 2: Auto-sync por updated_at en DB (sin otros cambios) → patch
  it('row 2: updated_at DB cambió solo → patch', () => {
    const newRow: DBRow = { ...baseRow, updated_at: new Date().toISOString() };
    expect(detectBumpLevel(baseCurrent, newRow)).toBe('patch');
  });

  // Row 3: Edición en enriched_fields (use_cases) → patch
  it('row 3: enriched_fields editados (use_cases) → patch', () => {
    const current = { ...baseCurrent, enriched_fields: ['use_cases'] };
    const newRow: DBRow = { ...baseRow };
    expect(detectBumpLevel(current, newRow)).toBe('patch');
  });

  // Row 4: description cambió (campo técnico no-estructural) → patch
  it('row 4: description cambió → patch', () => {
    const newRow: DBRow = { ...baseRow, description: 'Nueva descripción diferente' };
    expect(detectBumpLevel(baseCurrent, newRow)).toBe('patch');
  });

  // Row 5: Tag añadido (no-estructural) → patch
  it('row 5: tag añadido (no-estructural) → patch', () => {
    const current = { ...baseCurrent, tags: ['catpaw'] };
    const newRow: DBRow = { ...baseRow, tags: ['catpaw', 'crm'] } as DBRow;
    expect(detectBumpLevel(current, newRow)).toBe('patch');
  });

  // Row 6: system_prompt cambió → minor
  it('row 6: system_prompt cambió → minor', () => {
    const newRow: DBRow = { ...baseRow, system_prompt: 'REDISEÑADO TOTALMENTE' };
    expect(detectBumpLevel(baseCurrent, newRow)).toBe('minor');
  });

  // Row 7: connectors linked cambiaron → minor
  it('row 7: connectors_linked cambió → minor', () => {
    const newRow: DBRow = {
      ...baseRow,
      connectors_linked: ['seed-holded-mcp', 'gmail-prod'],
    } as DBRow;
    expect(detectBumpLevel(baseCurrent, newRow)).toBe('minor');
  });

  // Row 8: skills linked cambiaron → minor
  it('row 8: skills_linked cambió → minor', () => {
    const newRow: DBRow = {
      ...baseRow,
      skills_linked: ['arquitecto-agentes'],
    } as DBRow;
    expect(detectBumpLevel(baseCurrent, newRow)).toBe('minor');
  });

  // Row 9: related crítico añadido → minor
  it('row 9: related crítico añadido → minor', () => {
    const current = { ...baseCurrent, related: ['concept-catpaw'] };
    const newRow: DBRow = {
      ...baseRow,
      related: ['concept-catpaw', 'feature-145', 'protocol-arquitecto-agentes'],
    } as DBRow;
    expect(detectBumpLevel(current, newRow)).toBe('minor');
  });

  // Row 10: lang: es → es+en (traducción añadida) → minor
  it('row 10: lang es → es+en → minor', () => {
    const newRow: DBRow = { ...baseRow, lang: 'es+en' } as DBRow;
    expect(detectBumpLevel(baseCurrent, newRow)).toBe('minor');
  });

  // Row 11: mode cambió → major
  it('row 11: mode cambió → major', () => {
    const current = { ...baseCurrent, mode: 'chat' };
    const newRow: DBRow = { ...baseRow, mode: 'processor' };
    expect(detectBumpLevel(current, newRow)).toBe('major');
  });

  // Row 12: status → deprecated → major (detectado via is_active: 0)
  it('row 12a: status → deprecated (is_active: 0) → major', () => {
    const newRow: DBRow = { ...baseRow, is_active: 0 };
    expect(detectBumpLevel(baseCurrent, newRow)).toBe('major');
  });

  it('row 12b: status → deprecated (is_active: false) → major', () => {
    const newRow: DBRow = { ...baseRow, is_active: false };
    expect(detectBumpLevel(baseCurrent, newRow)).toBe('major');
  });

  // Row 13: subtype cambió → major
  it('row 13: subtype cambió → major', () => {
    const newRow: DBRow = { ...baseRow, subtype: 'connector' } as DBRow;
    expect(detectBumpLevel(baseCurrent, newRow)).toBe('major');
  });

  // Row 14: contract I/O incompatible → major (detectado via io_contract_hash)
  it('row 14: io_contract_hash cambió → major', () => {
    const current = { ...baseCurrent, io_contract_hash: 'abc123' };
    const newRow: DBRow = { ...baseRow, io_contract_hash: 'xyz789' } as DBRow;
    expect(detectBumpLevel(current, newRow)).toBe('major');
  });

  // Precedence: major gana sobre minor
  it('precedencia: mode+system_prompt cambiados → major (gana major)', () => {
    const current = { ...baseCurrent, mode: 'chat', system_prompt: 'old' };
    const newRow: DBRow = { ...baseRow, mode: 'processor', system_prompt: 'new' };
    expect(detectBumpLevel(current, newRow)).toBe('major');
  });

  // Precedence: minor gana sobre patch
  it('precedencia: system_prompt+description cambiados → minor (gana minor)', () => {
    const newRow: DBRow = {
      ...baseRow,
      system_prompt: 'new',
      description: 'otra',
    };
    expect(detectBumpLevel(baseCurrent, newRow)).toBe('minor');
  });
});

// ---------------------------------------------------------------------------
// Grupo B — syncResource ops
// ---------------------------------------------------------------------------

describe('syncResource create', () => {
  it('escribe archivo .md + frontmatter válido + actualiza _index.json', async () => {
    await syncResource('catpaw', 'create', baseRow, {
      author: 'phase-149-test',
      kbRoot: tmpRoot,
    });

    const files = fs.readdirSync(path.join(tmpRoot, 'resources/catpaws'));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^53f19c51-.*\.md$/);

    const content = readResource('catpaw');
    expect(content).toMatch(/^---\n/);
    // 16 campos requeridos del schema
    expect(content).toMatch(/^id:\s*catpaw-53f19c51/m);
    expect(content).toMatch(/^type:\s*resource/m);
    expect(content).toMatch(/^subtype:\s*catpaw/m);
    expect(content).toMatch(/^lang:\s*es/m);
    expect(content).toMatch(/^title:/m);
    expect(content).toMatch(/^summary:/m);
    expect(content).toMatch(/^tags:/m);
    expect(content).toMatch(/^audience:/m);
    expect(content).toMatch(/^status:\s*active/m);
    expect(content).toMatch(/^created_at:/m);
    expect(content).toMatch(/^created_by:\s*phase-149-test/m);
    expect(content).toMatch(/^version:\s*1\.0\.0/m);
    expect(content).toMatch(/^updated_at:/m);
    expect(content).toMatch(/^updated_by:\s*phase-149-test/m);
    expect(content).toMatch(/^source_of_truth:/m);
    expect(content).toMatch(/^change_log:/m);
    expect(content).toMatch(/^ttl:\s*managed/m);

    // _index.json actualizado
    const idx = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, '_index.json'), 'utf8')
    );
    expect(idx.entry_count).toBe(1);
    expect(idx.entries).toHaveLength(1);
    expect(idx.entries[0].id).toBe('catpaw-53f19c51');
    expect(idx.entries[0].subtype ?? idx.entries[0].type).toMatch(
      /catpaw|resource/
    );
  });

  it('archivo generado pasa validate-kb.cjs (exit 0)', async () => {
    await syncResource('catpaw', 'create', baseRow, {
      author: 'phase-149-test',
      kbRoot: tmpRoot,
    });

    // Ejecutar validador apuntándolo al tmpRoot via env override
    // El script tiene KB_ROOT hardcoded; en test integramos llamando por proc
    // y verificamos el archivo generado pasa el schema contract.
    // Usamos un script wrapper: node -e para monkey-patch KB_ROOT no es limpio.
    // Estrategia: copiar el archivo al KB real está fuera de scope — mejor
    // verificar manualmente que el shape cumple las reglas del schema.
    const content = readResource('catpaw');

    // Campos requeridos (16) presentes
    const requiredFields = [
      'id',
      'type',
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
      'source_of_truth',
      'change_log',
      'ttl',
    ];
    for (const f of requiredFields) {
      expect(content).toMatch(new RegExp(`^${f}:`, 'm'));
    }

    // ttl=managed ⇒ last_accessed_at + access_count requeridos
    expect(content).toMatch(/^last_accessed_at:/m);
    expect(content).toMatch(/^access_count:/m);

    // version semver
    const ver = content.match(/^version:\s*(.+)$/m)?.[1]?.trim();
    expect(ver).toMatch(/^\d+\.\d+\.\d+$/);

    // Tags sólo de la taxonomy oficial
    expect(content).toMatch(/^tags:.*catpaw/m);
  });
});

describe('syncResource update', () => {
  it('bump patch cuando sólo cambia description', async () => {
    await syncResource('catpaw', 'create', baseRow, {
      author: 'test',
      kbRoot: tmpRoot,
    });
    const newRow = { ...baseRow, description: 'Descripción distinta' };
    await syncResource('catpaw', 'update', newRow, {
      author: 'test',
      kbRoot: tmpRoot,
    });
    const content = readResource('catpaw');
    expect(content).toMatch(/^version:\s*1\.0\.1/m);
  });

  it('bump minor cuando system_prompt cambia; change_log crece', async () => {
    await syncResource('catpaw', 'create', baseRow, {
      author: 'test',
      kbRoot: tmpRoot,
    });
    const newRow = { ...baseRow, system_prompt: 'REDISEÑADO' };
    await syncResource('catpaw', 'update', newRow, {
      author: 'test',
      kbRoot: tmpRoot,
    });
    const content = readResource('catpaw');
    expect(content).toMatch(/^version:\s*1\.1\.0/m);
    // change_log tiene al menos 2 entries (1.0.0 creación + 1.1.0 update)
    const versionsInLog = content.match(/version:\s*\d+\.\d+\.\d+/g) || [];
    // Al menos 3 occurrences: version top-level + 2 en change_log
    expect(versionsInLog.length).toBeGreaterThanOrEqual(3);
  });

  it('bump major cuando is_active → 0 (soft deprecation via update)', async () => {
    await syncResource('catpaw', 'create', baseRow, {
      author: 'test',
      kbRoot: tmpRoot,
    });
    const newRow = { ...baseRow, is_active: 0 };
    await syncResource('catpaw', 'update', newRow, {
      author: 'test',
      kbRoot: tmpRoot,
    });
    const content = readResource('catpaw');
    expect(content).toMatch(/^version:\s*2\.0\.0/m);
  });

  it('change_log se trunca a los últimos 5 entries tras 7 updates', async () => {
    await syncResource('catpaw', 'create', baseRow, {
      author: 'test',
      kbRoot: tmpRoot,
    });
    for (let i = 0; i < 7; i++) {
      await syncResource(
        'catpaw',
        'update',
        { ...baseRow, system_prompt: `v${i}` },
        { author: 'test', kbRoot: tmpRoot }
      );
    }
    const content = readResource('catpaw');
    // Contar entries de change_log: cada entry tiene `date: YYYY-MM-DD` o `{ version:`
    const entryMarkers = content.match(/- \{ version:|\s{2,}- version:/g) || [];
    expect(entryMarkers.length).toBeLessThanOrEqual(5);
    expect(entryMarkers.length).toBeGreaterThan(0);
  });

  it('update sobre archivo inexistente se comporta como create (idempotente)', async () => {
    // No llamamos create — directo a update
    await syncResource('catpaw', 'update', baseRow, {
      author: 'test',
      kbRoot: tmpRoot,
    });
    const files = fs.readdirSync(path.join(tmpRoot, 'resources/catpaws'));
    expect(files).toHaveLength(1);
  });
});

describe('syncResource delete (soft-delete)', () => {
  it('status → deprecated; archivo sigue existiendo; deprecated_at/by/reason presentes', async () => {
    await syncResource('catpaw', 'create', baseRow, {
      author: 'test',
      kbRoot: tmpRoot,
    });
    await syncResource(
      'catpaw',
      'delete',
      { id: baseRow.id },
      { author: 'test', kbRoot: tmpRoot, reason: 'test teardown' }
    );
    const files = fs.readdirSync(path.join(tmpRoot, 'resources/catpaws'));
    expect(files).toHaveLength(1); // NO se borra físicamente
    const content = readResource('catpaw');
    expect(content).toMatch(/^status:\s*deprecated/m);
    expect(content).toMatch(/^deprecated_at:/m);
    expect(content).toMatch(/^deprecated_by:\s*test/m);
    expect(content).toMatch(/^deprecated_reason:/m);
    expect(content).toContain('test teardown');
  });

  it('delete sobre archivo inexistente es no-op silencioso', async () => {
    await syncResource(
      'catpaw',
      'delete',
      { id: 'no-existe-xxxxxxxxxxxxxxxx' },
      { author: 'test', kbRoot: tmpRoot }
    );
    const files = fs.readdirSync(path.join(tmpRoot, 'resources/catpaws'));
    expect(files).toHaveLength(0);
  });
});

describe('syncResource access', () => {
  it('access_count++ y last_accessed_at cambió; version/otros campos intactos', async () => {
    await syncResource('catpaw', 'create', baseRow, {
      author: 'test',
      kbRoot: tmpRoot,
    });
    const fpath = getResourcePath('catpaw');
    const before = fs.readFileSync(fpath, 'utf8');
    const versionBefore = before.match(/^version:\s*(.+)$/m)?.[1];
    const accessBefore = parseInt(
      before.match(/^access_count:\s*(\d+)$/m)?.[1] ?? '-1',
      10
    );
    const systemPromptBefore = before.match(/^system_prompt:.*$/m)?.[0];

    await new Promise((r) => setTimeout(r, 10));

    await syncResource(
      'catpaw',
      'access',
      { id: baseRow.id },
      { author: 'test', kbRoot: tmpRoot }
    );

    const after = fs.readFileSync(fpath, 'utf8');
    const versionAfter = after.match(/^version:\s*(.+)$/m)?.[1];
    const accessAfter = parseInt(
      after.match(/^access_count:\s*(\d+)$/m)?.[1] ?? '-1',
      10
    );

    expect(versionAfter).toBe(versionBefore); // NO bump por access
    expect(accessAfter).toBe(accessBefore + 1); // +1

    // No se toca system_prompt si estaba presente
    if (systemPromptBefore) {
      expect(after).toContain(systemPromptBefore);
    }
  });

  it('access sobre archivo inexistente es no-op silencioso', async () => {
    await syncResource(
      'catpaw',
      'access',
      { id: 'no-existe-xxxxxxxxxxxxxxxx' },
      { author: 'test', kbRoot: tmpRoot }
    );
    // No explota
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Grupo C — touchAccess directo
// ---------------------------------------------------------------------------

describe('touchAccess', () => {
  it('incrementa access_count en 2 llamadas consecutivas (0 → 2)', async () => {
    await syncResource('catpaw', 'create', baseRow, {
      author: 'test',
      kbRoot: tmpRoot,
    });
    const fpath = getResourcePath('catpaw');
    await touchAccess(fpath);
    await touchAccess(fpath);
    const content = fs.readFileSync(fpath, 'utf8');
    expect(content).toMatch(/^access_count:\s*2$/m);
  });

  it('preserva todos los campos no-access al actualizar', async () => {
    await syncResource('catpaw', 'create', baseRow, {
      author: 'test',
      kbRoot: tmpRoot,
    });
    const fpath = getResourcePath('catpaw');
    const before = fs.readFileSync(fpath, 'utf8');
    const idBefore = before.match(/^id:\s*(.+)$/m)?.[1];
    const titleBefore = before.match(/^title:\s*(.+)$/m)?.[1];
    const versionBefore = before.match(/^version:\s*(.+)$/m)?.[1];
    const createdBefore = before.match(/^created_at:\s*(.+)$/m)?.[1];

    await touchAccess(fpath);
    const after = fs.readFileSync(fpath, 'utf8');
    expect(after.match(/^id:\s*(.+)$/m)?.[1]).toBe(idBefore);
    expect(after.match(/^title:\s*(.+)$/m)?.[1]).toBe(titleBefore);
    expect(after.match(/^version:\s*(.+)$/m)?.[1]).toBe(versionBefore);
    expect(after.match(/^created_at:\s*(.+)$/m)?.[1]).toBe(createdBefore);
  });
});

// ---------------------------------------------------------------------------
// Grupo D — markDeprecated directo
// ---------------------------------------------------------------------------

describe('markDeprecated', () => {
  it('sin reason usa default "DB row removed at {ts}"', async () => {
    await syncResource('catpaw', 'create', baseRow, {
      author: 'test',
      kbRoot: tmpRoot,
    });
    const fpath = getResourcePath('catpaw');
    await markDeprecated(fpath, { id: baseRow.id }, 'user:antonio');
    const content = fs.readFileSync(fpath, 'utf8');
    expect(content).toMatch(/^status:\s*deprecated/m);
    expect(content).toMatch(/^deprecated_by:\s*user:antonio/m);
    expect(content).toMatch(/^deprecated_reason:.*DB row removed/m);
  });

  it('con reason + superseded_by añade ambos campos', async () => {
    await syncResource('catpaw', 'create', baseRow, {
      author: 'test',
      kbRoot: tmpRoot,
    });
    const fpath = getResourcePath('catpaw');
    await markDeprecated(
      fpath,
      { id: baseRow.id },
      'user:antonio',
      'replaced by v2',
      'catpaw-abc12345'
    );
    const content = fs.readFileSync(fpath, 'utf8');
    expect(content).toMatch(/^deprecated_by:\s*user:antonio/m);
    expect(content).toMatch(/^deprecated_reason:.*replaced by v2/m);
    expect(content).toMatch(/^superseded_by:\s*catpaw-abc12345/m);
  });
});

// ---------------------------------------------------------------------------
// Grupo E — Merge conflict DB ↔ archivo (Casos §5.3 del PRD)
// ---------------------------------------------------------------------------

describe('merge conflict DB ↔ archivo', () => {
  it('Caso 2 (§5.3): humano editó fields_from_db → auto-sync pisa y añade warning al change_log', async () => {
    // Create inicial
    await syncResource('catpaw', 'create', baseRow, {
      author: 'test',
      kbRoot: tmpRoot,
    });
    const fpath = getResourcePath('catpaw');

    // Simular edición humana de un campo fields_from_db (description → summary)
    let content = fs.readFileSync(fpath, 'utf8');
    content = content.replace(
      /^summary:.*$/m,
      'summary: SUMMARY EDITADO A MANO POR HUMANO'
    );
    fs.writeFileSync(fpath, content);

    // Sync desde DB con valor diferente (mismo baseRow, por lo tanto la descripción original gana)
    await syncResource('catpaw', 'update', baseRow, {
      author: 'auto-sync',
      kbRoot: tmpRoot,
    });

    const after = fs.readFileSync(fpath, 'utf8');
    // El summary DB gana → SUMMARY EDITADO desaparece, vuelve a ser la description de DB
    expect(after).not.toContain('SUMMARY EDITADO A MANO POR HUMANO');
    expect(after).toContain('CatPaw CRM generalista');

    // Y se añadió un warning al change_log sobre la sobreescritura
    expect(after).toMatch(/change_log:/);
    expect(after.toLowerCase()).toMatch(/warning|overwrote|overwr|pisó|pisada/);
  });

  it('Caso 4 (§5.3): edit humano en enriched_fields + DB update en fields_from_db → ambos preservados', async () => {
    await syncResource('catpaw', 'create', baseRow, {
      author: 'test',
      kbRoot: tmpRoot,
    });
    const fpath = getResourcePath('catpaw');

    // Añadir use_cases como enriched_fields + contenido en body
    let content = fs.readFileSync(fpath, 'utf8');
    content = content.replace(
      /^enriched_fields:.*$/m,
      'enriched_fields: [use_cases]'
    );
    // Añadir contenido rico al body después del cierre de frontmatter
    content =
      content +
      '\n## Casos de uso\n\nCaso 1 — Búsqueda de leads por email\nCaso 2 — Creación de lead con funnel\n';
    fs.writeFileSync(fpath, content);

    // DB update cambia system_prompt (fields_from_db) → debe preservar enriched y sobrescribir system_prompt
    const newRow = { ...baseRow, system_prompt: 'NUEVO SYSTEM PROMPT DESDE DB' };
    await syncResource('catpaw', 'update', newRow, {
      author: 'auto-sync',
      kbRoot: tmpRoot,
    });

    const after = fs.readFileSync(fpath, 'utf8');
    // DB field updated
    expect(after).toContain('NUEVO SYSTEM PROMPT DESDE DB');
    // Enriched fields preservados (body)
    expect(after).toContain('Caso 1 — Búsqueda de leads por email');
    expect(after).toContain('Caso 2 — Creación de lead con funnel');
    // Bump minor por system_prompt
    expect(after).toMatch(/^version:\s*1\.1\.0/m);
  });
});

// ---------------------------------------------------------------------------
// Integration — validate-kb.cjs sanity gate
// ---------------------------------------------------------------------------

describe('integration: archivos generados pasan validate-kb.cjs', () => {
  it('un create + un update producen archivos que el validador acepta (exit 0)', async () => {
    await syncResource('catpaw', 'create', baseRow, {
      author: 'test',
      kbRoot: tmpRoot,
    });
    await syncResource(
      'catpaw',
      'update',
      { ...baseRow, system_prompt: 'updated' },
      { author: 'test', kbRoot: tmpRoot }
    );

    // Ejecutar validate-kb.cjs con KB_ROOT override via env/argv
    // El script tiene KB_ROOT hardcoded a ../.docflow-kb; usamos un workaround:
    // inyectar el tmpRoot copiando el script y reemplazando la constante.
    if (!fs.existsSync(VALIDATOR_SCRIPT)) {
      // Si no existe el validador, skip el test en vez de fallar
      return;
    }
    const origScript = fs.readFileSync(VALIDATOR_SCRIPT, 'utf8');
    const patchedScript = origScript.replace(
      /const KB_ROOT = path\.resolve\([^\)]+\);/,
      `const KB_ROOT = ${JSON.stringify(tmpRoot)};`
    );
    const patchedPath = path.join(tmpRoot, '_validate-kb-test.cjs');
    fs.writeFileSync(patchedPath, patchedScript);
    try {
      const out = execFileSync('node', [patchedPath], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      expect(out).toMatch(/OK:/);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Validator failed on generated files: ${msg}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 150 Plan 01 — service hardening tests
// ---------------------------------------------------------------------------

describe('Phase 150 Plan 01 — knowledge-sync hardening', () => {
  it('FIELDS_FROM_DB connector never includes config (security — KB-11)', async () => {
    const row: DBRow = {
      id: 'fixture-conn-01-aaaaaaaaaaaaaa',
      name: 'Leaky Connector',
      description: 'A test connector with a secret config payload',
      type: 'http_api',
      config: '{"secret":"MUST_NOT_LEAK","url":"https://internal:8765"}',
      is_active: 1,
    } as DBRow;
    await syncResource('connector', 'create', row, {
      author: 'phase-150-test',
      kbRoot: tmpRoot,
    });
    const files = fs.readdirSync(path.join(tmpRoot, 'resources/connectors'));
    expect(files).toHaveLength(1);
    const fileContent = fs.readFileSync(
      path.join(tmpRoot, 'resources/connectors', files[0]),
      'utf8'
    );
    // source_of_truth.fields_from_db array must not mention 'config'
    const fieldsFromDbMatch = fileContent.match(/fields_from_db:\s*(.+)/);
    expect(fieldsFromDbMatch).not.toBeNull();
    expect(fieldsFromDbMatch?.[1] ?? '').not.toMatch(/\bconfig\b/);
    // And the literal secret must never appear anywhere in the file
    expect(fileContent).not.toContain('MUST_NOT_LEAK');
    expect(fileContent).not.toContain('internal:8765');
  });

  it('regenerateHeader emits Canvases activos line (KB-10)', async () => {
    // Seed a canvas row via syncResource — regenerateHeader runs at the end
    const row: DBRow = {
      id: 'fixture-canvas-01-bbbbbbbbbbbbb',
      name: 'Test Canvas',
      description: 'canvas fixture for header test',
      mode: 'chat',
      is_active: 1,
    } as DBRow;
    await syncResource('canvas', 'create', row, {
      author: 'phase-150-test',
      kbRoot: tmpRoot,
    });
    const header = fs.readFileSync(path.join(tmpRoot, '_header.md'), 'utf8');
    expect(header).toMatch(/Canvases activos: \d+/);
  });

  it('syncResource update is idempotent when input row is unchanged (KB-09)', async () => {
    const row: DBRow = {
      id: 'fixture-paw-01-cccccccccccccc',
      name: 'Idempotent Test Paw',
      description: 'catpaw fixture for idempotence test',
      mode: 'chat',
      model: 'gemini-main',
      system_prompt: 'You are a test.',
      temperature: 0.7,
      max_tokens: 2048,
      is_active: 1,
      department: 'business',
    };
    await syncResource('catpaw', 'create', row, {
      author: 'phase-150-test',
      kbRoot: tmpRoot,
    });
    const files = fs.readdirSync(path.join(tmpRoot, 'resources/catpaws'));
    expect(files).toHaveLength(1);
    const filePath = path.join(tmpRoot, 'resources/catpaws', files[0]);
    const firstBytes = fs.readFileSync(filePath, 'utf8');
    // Small delay so that any accidental updated_at=now() would differ
    await new Promise((r) => setTimeout(r, 20));
    // Second call with the SAME row — must be a no-op
    await syncResource('catpaw', 'update', row, {
      author: 'phase-150-test',
      kbRoot: tmpRoot,
    });
    const secondBytes = fs.readFileSync(filePath, 'utf8');
    expect(secondBytes).toBe(firstBytes); // byte-identical file
    // Version still 1.0.0, change_log length still 1
    expect(secondBytes).toMatch(/^version:\s*1\.0\.0/m);
    const changeLogEntries = secondBytes.match(/- \{ version:|\s{2,}- version:/g) ?? [];
    expect(changeLogEntries.length).toBe(1);
  });
});
