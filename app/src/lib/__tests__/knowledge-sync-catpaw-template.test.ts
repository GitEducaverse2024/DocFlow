// Phase 156-02 — KB-42 template side — buildBody catpaw renders linked
// connectors + skills sections.
//
// Tests directos contra syncResource (no pasamos por tool/route). Input: row
// con linked_connectors / linked_skills arrays (Opción A de RESEARCH §D —
// caller enriquece el row; knowledge-sync sigue pure-filesystem, NO importa
// better-sqlite3).
//
// Wave 0 RED: estos tests fallan hasta Task 2 extienda buildBody con las dos
// nuevas secciones (§N.3 reference).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { syncResource, type DBRow } from '../services/knowledge-sync';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpRoot: string;

const SCHEMA_SOURCE_DIR = path.resolve(__dirname, '../../../../.docflow-kb/_schema');

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
    indexes: { by_type: {}, by_tag: {}, by_audience: {} },
  };
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kbcatpaw-tpl-'));
  const dirs = [
    '_schema',
    'resources/catpaws',
    'resources/connectors',
    'resources/catbrains',
    'resources/email-templates',
    'resources/skills',
    'resources/canvases',
    'rules',
  ];
  for (const d of dirs) {
    fs.mkdirSync(path.join(tmpRoot, d), { recursive: true });
  }
  // Copiar schemas para que el archivo generado tenga contexto validable
  if (fs.existsSync(SCHEMA_SOURCE_DIR)) {
    for (const f of fs.readdirSync(SCHEMA_SOURCE_DIR)) {
      fs.copyFileSync(
        path.join(SCHEMA_SOURCE_DIR, f),
        path.join(tmpRoot, '_schema', f),
      );
    }
  }
  fs.writeFileSync(
    path.join(tmpRoot, '_index.json'),
    JSON.stringify(emptyIndex(), null, 2),
  );
  fs.writeFileSync(path.join(tmpRoot, '_header.md'), '# KB Header\n\nCounts: 0\n');
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const baseRow: DBRow = {
  id: 'cat00001-1111-1111-1111-111111111111',
  name: 'Template Target',
  description: 'CatPaw de test para template extensions',
  mode: 'chat',
  model: 'gemini-main',
  system_prompt: 'You are a test CatPaw',
  temperature: 0.3,
  max_tokens: 1024,
  is_active: 1,
  department: 'test',
};

function readCatpawMd(): string {
  const dir = path.join(tmpRoot, 'resources/catpaws');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  expect(files.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(dir, files[0]), 'utf8');
}

function extractVersion(md: string): string {
  const m = md.match(/^version:\s*(\d+\.\d+\.\d+)/m);
  expect(m).toBeTruthy();
  return m![1];
}

function semverAtLeast(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i];
  }
  return true; // iguales cuentan como >=
}

// ---------------------------------------------------------------------------
// T1 — Conectores vinculados sorted por name (render tal cual lo pasa caller)
// ---------------------------------------------------------------------------

describe('buildBody catpaw — KB-42 linked relations', () => {
  it('T1 renders "## Conectores vinculados" con cada connector sorted por name', async () => {
    // Caller enriquece pre-sorted (ORDER BY c.name ASC). buildBody render tal cual.
    const enriched: DBRow = {
      ...baseRow,
      linked_connectors: [
        { id: 'c-aaa-111', name: 'Aaa Connector' },
        { id: 'c-zzz-999', name: 'Zzz Connector' },
      ],
      linked_skills: [],
    };
    await syncResource('catpaw', 'create', enriched, {
      author: 'test-t1',
      kbRoot: tmpRoot,
    });

    const md = readCatpawMd();
    expect(md).toMatch(/## Conectores vinculados/);
    expect(md).toContain('**Aaa Connector** (`c-aaa-111`)');
    expect(md).toContain('**Zzz Connector** (`c-zzz-999`)');
    // Aaa should appear before Zzz (sorted)
    const idxA = md.indexOf('Aaa Connector');
    const idxZ = md.indexOf('Zzz Connector');
    expect(idxA).toBeGreaterThan(0);
    expect(idxZ).toBeGreaterThan(idxA);
  });

  // ──────────────────────────────────────────────────────────────────
  // T2 — placeholder cuando linked_connectors vacío
  // ──────────────────────────────────────────────────────────────────

  it('T2 renders placeholder "_(sin conectores vinculados)_" cuando linked_connectors está vacío', async () => {
    const enriched: DBRow = {
      ...baseRow,
      linked_connectors: [],
      linked_skills: [],
    };
    await syncResource('catpaw', 'create', enriched, {
      author: 'test-t2',
      kbRoot: tmpRoot,
    });

    const md = readCatpawMd();
    expect(md).toMatch(/## Conectores vinculados/);
    expect(md).toContain('_(sin conectores vinculados)_');
    expect(md).toMatch(/## Skills vinculadas/);
    expect(md).toContain('_(sin skills vinculadas)_');
  });

  // ──────────────────────────────────────────────────────────────────
  // T3 — ambas secciones rendereadas cuando hay connectors + skills
  // ──────────────────────────────────────────────────────────────────

  it('T3 renders "## Skills vinculadas" con cada skill', async () => {
    const enriched: DBRow = {
      ...baseRow,
      linked_connectors: [{ id: 'c-prod-001', name: 'Produccion Connector' }],
      linked_skills: [
        { id: 's-orq-001', name: 'Orquestador' },
        { id: 's-arq-002', name: 'Arquitecto' },
      ],
    };
    await syncResource('catpaw', 'create', enriched, {
      author: 'test-t3',
      kbRoot: tmpRoot,
    });

    const md = readCatpawMd();
    expect(md).toMatch(/## Conectores vinculados/);
    expect(md).toContain('**Produccion Connector** (`c-prod-001`)');
    expect(md).toMatch(/## Skills vinculadas/);
    expect(md).toContain('**Orquestador** (`s-orq-001`)');
    expect(md).toContain('**Arquitecto** (`s-arq-002`)');

    // Order: Conectores vinculados antes de Skills vinculadas
    const idxC = md.indexOf('## Conectores vinculados');
    const idxS = md.indexOf('## Skills vinculadas');
    expect(idxC).toBeGreaterThan(0);
    expect(idxS).toBeGreaterThan(idxC);
  });

  // ──────────────────────────────────────────────────────────────────
  // T4 — Añadir linked_connectors a un catpaw ya existente → version sube
  //
  // Nota: detectBumpLevel minor-on-related sería aspirational (_manual.md
  // L164). El plan ACEPTA patch bump como pass. Usamos semverAtLeast con 1.0.1
  // como piso (≥patch).
  // ──────────────────────────────────────────────────────────────────

  it('T4 añadir linked_connectors a catpaw existente → version sube ≥1.0.1', async () => {
    // Create sin links
    await syncResource('catpaw', 'create', { ...baseRow, linked_connectors: [], linked_skills: [] } as DBRow, {
      author: 'test-t4-create',
      kbRoot: tmpRoot,
    });
    const v0 = extractVersion(readCatpawMd());
    expect(v0).toBe('1.0.0');

    // Update con 1 connector añadido
    await syncResource('catpaw', 'update', {
      ...baseRow,
      linked_connectors: [{ id: 'c-holded-001', name: 'Holded MCP' }],
      linked_skills: [],
    } as DBRow, {
      author: 'test-t4-update',
      kbRoot: tmpRoot,
    });
    const v1 = extractVersion(readCatpawMd());
    expect(semverAtLeast(v1, '1.0.1')).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────
  // T5 — Update con mismos linked_* → isNoopUpdate short-circuit → no bump
  // ──────────────────────────────────────────────────────────────────

  it('T5 update con linked_* idéntico → body byte-idéntico → isNoopUpdate → version NO sube', async () => {
    const rowWithLinks: DBRow = {
      ...baseRow,
      linked_connectors: [{ id: 'c-stable-001', name: 'Stable Connector' }],
      linked_skills: [{ id: 's-stable-001', name: 'Stable Skill' }],
    };
    await syncResource('catpaw', 'create', rowWithLinks, {
      author: 'test-t5-create',
      kbRoot: tmpRoot,
    });
    const v0 = extractVersion(readCatpawMd());

    // Segundo syncResource update con el MISMO row enriquecido → noop
    await syncResource('catpaw', 'update', rowWithLinks, {
      author: 'test-t5-update',
      kbRoot: tmpRoot,
    });
    const v1 = extractVersion(readCatpawMd());
    expect(v1).toBe(v0);
  });
});
