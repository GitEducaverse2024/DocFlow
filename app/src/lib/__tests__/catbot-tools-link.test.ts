// Phase 156-02 — KB-42 — link tools re-sync CatPaw KB file.
//
// Proves that:
//   - link_connector_to_catpaw tras INSERT exitoso dispara
//       syncResource('catpaw','update', enriched_row, hookCtx('catbot:link_connector'))
//     con linked_connectors + linked_skills embebidos.
//   - link_skill_to_catpaw con INSERT OR IGNORE dispara syncResource; la segunda
//     llamada con el mismo skill termina en isNoopUpdate → no version bump.
//   - La rama UNIQUE collision (already_linked:true) NO dispara syncResource.
//   - Paws/connectors/skills inexistentes → result.error + NO syncResource call.
//   - Tras el link, la sección "## Conectores vinculados" del .md contiene el
//     nombre del connector (body-text propagation — verificamos leyendo el fs).
//
// Mirror pattern: kb-hooks-tools.test.ts (Phase 153). Wave 0 RED: estas
// aserciones fallan hasta Task 3 enganche los 2 case handlers en catbot-tools.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// CRITICAL: set up test env BEFORE module imports (mismo patrón que
// kb-hooks-tools.test.ts).
vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  const tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'kblink-'));
  process['env']['CATBOT_DB_PATH'] = nodePath.join(tmpDir, 'catbot-test.db');
  process['env']['DATABASE_PATH'] = nodePath.join(tmpDir, 'docflow-test.db');
});

import { executeTool } from '@/lib/services/catbot-tools';
import { invalidateKbIndex, searchKb } from '@/lib/services/kb-index-cache';
import * as kbIndexCacheModule from '@/lib/services/kb-index-cache';
import * as knowledgeSyncModule from '@/lib/services/knowledge-sync';
import { createFixtureKb } from './kb-test-utils';
import dbModule from '@/lib/db';

function listCatpawFiles(kbRoot: string): string[] {
  const dir = path.join(kbRoot, 'resources', 'catpaws');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
}

function readCatpawFile(kbRoot: string, id: string): string | null {
  const dir = path.join(kbRoot, 'resources', 'catpaws');
  if (!fs.existsSync(dir)) return null;
  const match = fs
    .readdirSync(dir)
    .find((f) => f.startsWith(`${id.slice(0, 8)}-`) && f.endsWith('.md'));
  if (!match) return null;
  return fs.readFileSync(path.join(dir, match), 'utf8');
}

function extractVersion(md: string): string | null {
  const m = md.match(/^version:\s*(\d+\.\d+\.\d+)/m);
  return m ? m[1] : null;
}

describe('KB-42 link tools call syncResource with enriched CatPaw row', () => {
  let tmpRoot: string;
  let kbRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kblink-'));
    ({ kbRoot } = createFixtureKb(tmpRoot));
    process['env']['KB_ROOT'] = kbRoot;
    invalidateKbIndex();

    // Ensure minimal tables exist, wipe para control estricto de counts.
    dbModule
      .prepare(
        "CREATE TABLE IF NOT EXISTS cat_paws (id TEXT PRIMARY KEY, name TEXT, avatar_emoji TEXT, mode TEXT, model TEXT, department TEXT, is_active INTEGER, description TEXT, system_prompt TEXT, temperature REAL, max_tokens INTEGER, output_format TEXT, created_at TEXT, updated_at TEXT)",
      )
      .run();
    dbModule
      .prepare(
        'CREATE TABLE IF NOT EXISTS connectors (id TEXT PRIMARY KEY, name TEXT, type TEXT, config TEXT, is_active INTEGER, times_used INTEGER, test_status TEXT, description TEXT, created_at TEXT, updated_at TEXT)',
      )
      .run();
    dbModule
      .prepare(
        'CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, name TEXT, description TEXT, category TEXT, tags TEXT, source TEXT, is_featured INTEGER)',
      )
      .run();
    // cat_paw_connectors: full schema (usage_hint + is_active + created_at) para
    // reflejar el INSERT real (5 columnas). UNIQUE para disparar la rama
    // already_linked.
    dbModule
      .prepare(
        'CREATE TABLE IF NOT EXISTS cat_paw_connectors (paw_id TEXT, connector_id TEXT, usage_hint TEXT, is_active INTEGER, created_at TEXT, PRIMARY KEY (paw_id, connector_id))',
      )
      .run();
    dbModule
      .prepare(
        'CREATE TABLE IF NOT EXISTS cat_paw_skills (paw_id TEXT, skill_id TEXT, PRIMARY KEY (paw_id, skill_id))',
      )
      .run();

    dbModule.prepare('DELETE FROM cat_paws').run();
    dbModule.prepare('DELETE FROM connectors').run();
    dbModule.prepare('DELETE FROM skills').run();
    dbModule.prepare('DELETE FROM cat_paw_connectors').run();
    dbModule.prepare('DELETE FROM cat_paw_skills').run();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process['env']['KB_ROOT'];
    invalidateKbIndex();
  });

  /**
   * Seed a CatPaw row + its KB file. We pass through create_cat_paw tool to
   * exercise the Phase 153 create hook (populates the .md with the initial
   * empty linked sections).
   */
  async function seedCatpaw(name: string, desc = 'Seed CatPaw'): Promise<string> {
    const res = await executeTool(
      'create_cat_paw',
      { name, description: desc, mode: 'chat', model: 'gemini-main' },
      'http://test',
      { userId: 'seed', sudoActive: false },
    );
    const id = (res.result as { id: string }).id;
    return id;
  }

  function seedConnector(id: string, name: string): void {
    dbModule
      .prepare(
        "INSERT INTO connectors (id, name, type, is_active, created_at, updated_at) VALUES (?, ?, 'mcp', 1, '2026-04-20T00:00:00Z', '2026-04-20T00:00:00Z')",
      )
      .run(id, name);
  }

  function seedSkill(id: string, name: string): void {
    // skills.instructions is NOT NULL in the real schema (db.ts:453); pass empty
    // string to satisfy the constraint without loading seed data.
    dbModule
      .prepare(
        "INSERT INTO skills (id, name, description, category, instructions) VALUES (?, ?, 'test skill', 'test', '')",
      )
      .run(id, name);
  }

  // ──────────────────────────────────────────────────────────────────
  // T1 — link_connector fires syncResource with enriched row
  // ──────────────────────────────────────────────────────────────────

  it('T1 link_connector_to_catpaw fires syncResource with enriched linked_connectors', async () => {
    const catpawId = await seedCatpaw('Linker One');
    seedConnector('conn-holded-001', 'Holded MCP');

    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    const res = await executeTool(
      'link_connector_to_catpaw',
      { catpaw_id: catpawId, connector_id: 'conn-holded-001' },
      'http://test',
      { userId: 'alice', sudoActive: false },
    );

    const result = res.result as { linked?: boolean; error?: string };
    expect(result.linked).toBe(true);

    // syncResource invocado con op='update' + enriched row
    const updateCalls = syncSpy.mock.calls.filter(
      (c) => c[0] === 'catpaw' && c[1] === 'update',
    );
    expect(updateCalls.length).toBe(1);
    const row = updateCalls[0][2] as {
      id: string;
      linked_connectors?: Array<{ id: string; name: string }>;
      linked_skills?: Array<{ id: string; name: string }>;
    };
    expect(row.id).toBe(catpawId);
    expect(Array.isArray(row.linked_connectors)).toBe(true);
    expect(row.linked_connectors!.length).toBe(1);
    expect(row.linked_connectors![0].id).toBe('conn-holded-001');
    expect(row.linked_connectors![0].name).toBe('Holded MCP');
    expect(Array.isArray(row.linked_skills)).toBe(true);
    expect(row.linked_skills!.length).toBe(0);

    // Author convention: 'catbot:link_connector'
    const ctx = updateCalls[0][3] as { author?: string };
    expect(ctx.author).toBe('catbot:link_connector');
  });

  // ──────────────────────────────────────────────────────────────────
  // T2 — link_skill re-link noop via isNoopUpdate
  // ──────────────────────────────────────────────────────────────────

  it('T2 link_skill_to_catpaw re-link produces byte-identical body → version no sube', async () => {
    const catpawId = await seedCatpaw('Linker Two');
    seedSkill('skill-orq-001', 'Orquestador');

    // Primer link — version should bump up from 1.0.0
    await executeTool(
      'link_skill_to_catpaw',
      { catpaw_id: catpawId, skill_id: 'skill-orq-001' },
      'http://test',
      { userId: 'bob', sudoActive: false },
    );

    const md1 = readCatpawFile(kbRoot, catpawId);
    expect(md1).toBeTruthy();
    const v1 = extractVersion(md1!);
    expect(v1).toBeTruthy();
    // Tras el primer link, body contiene la skill
    expect(md1!).toContain('Orquestador');

    // Segundo link idempotente (INSERT OR IGNORE no-op) — body byte-idéntico,
    // isNoopUpdate short-circuit → version NO sube.
    await executeTool(
      'link_skill_to_catpaw',
      { catpaw_id: catpawId, skill_id: 'skill-orq-001' },
      'http://test',
      { userId: 'bob', sudoActive: false },
    );

    const md2 = readCatpawFile(kbRoot, catpawId);
    expect(md2).toBeTruthy();
    const v2 = extractVersion(md2!);
    expect(v2).toBe(v1);
  });

  // ──────────────────────────────────────────────────────────────────
  // T3 — UNIQUE collision on link_connector → already_linked: NO syncResource
  // ──────────────────────────────────────────────────────────────────

  it('T3 UNIQUE collision en link_connector (already_linked) NO dispara syncResource', async () => {
    const catpawId = await seedCatpaw('Linker Three');
    seedConnector('conn-gmail-001', 'Gmail OAuth');

    // Primer link — éxito
    await executeTool(
      'link_connector_to_catpaw',
      { catpaw_id: catpawId, connector_id: 'conn-gmail-001' },
      'http://test',
      { userId: 'carol', sudoActive: false },
    );

    // Ahora espiamos — el segundo link debe devolver already_linked sin
    // invocar syncResource.
    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    const res = await executeTool(
      'link_connector_to_catpaw',
      { catpaw_id: catpawId, connector_id: 'conn-gmail-001' },
      'http://test',
      { userId: 'carol', sudoActive: false },
    );

    const result = res.result as { already_linked?: boolean; linked?: boolean };
    expect(result.already_linked).toBe(true);
    expect(result.linked).toBeUndefined();

    // syncResource NOT called en la rama already_linked
    const updateCalls = syncSpy.mock.calls.filter(
      (c) => c[0] === 'catpaw' && c[1] === 'update',
    );
    expect(updateCalls.length).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────
  // T4 — CatPaw missing → error, no syncResource
  // ──────────────────────────────────────────────────────────────────

  it('T4 CatPaw inexistente → error + NO syncResource call', async () => {
    seedConnector('conn-any-001', 'Whatever');
    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    const res = await executeTool(
      'link_connector_to_catpaw',
      { catpaw_id: 'does-not-exist', connector_id: 'conn-any-001' },
      'http://test',
      { userId: 'dave', sudoActive: false },
    );

    const result = res.result as { error?: string; linked?: boolean };
    expect(result.error).toBeTruthy();
    expect(result.linked).toBeUndefined();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────
  // T5 — Connector/Skill missing → error, no syncResource
  // ──────────────────────────────────────────────────────────────────

  it('T5 Connector/Skill inexistente → error + NO syncResource call', async () => {
    const catpawId = await seedCatpaw('Linker Five');

    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    // link_connector con connector_id inexistente
    const res1 = await executeTool(
      'link_connector_to_catpaw',
      { catpaw_id: catpawId, connector_id: 'ghost-connector' },
      'http://test',
      { userId: 'eve', sudoActive: false },
    );
    const r1 = res1.result as { error?: string };
    expect(r1.error).toBeTruthy();

    // link_skill con skill_id inexistente
    const res2 = await executeTool(
      'link_skill_to_catpaw',
      { catpaw_id: catpawId, skill_id: 'ghost-skill' },
      'http://test',
      { userId: 'eve', sudoActive: false },
    );
    const r2 = res2.result as { error?: string };
    expect(r2.error).toBeTruthy();

    // Ningún syncResource('catpaw','update') en ninguno de los dos.
    const updateCalls = syncSpy.mock.calls.filter(
      (c) => c[0] === 'catpaw' && c[1] === 'update',
    );
    expect(updateCalls.length).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────
  // T6 — search_kb integration + body-text propagation
  //
  // Research §P-Q5: searchKb actualmente NO escanea body — solo
  // title/summary/tags/search_hints (kb-index-cache.ts:325-366). Por tanto
  // este test verifica 2 cosas complementarias que juntas prueban el link:
  //   (a) body propagation: el .md del CatPaw contiene el nombre del connector
  //       linkeado (§N.3 template) — leemos fs directamente.
  //   (b) searchKb alcanza el connector por título (substring 'holded') —
  //       demuestra que el KB indexa la cadena aunque el body-scan no esté.
  // T6 documenta body-text propagation como invariante incluso si searchKb
  // body-scan sigue siendo scope de phase posterior.
  // ──────────────────────────────────────────────────────────────────

  it('T6 post-link, CatPaw body contiene "Holded MCP" + searchKb encuentra el connector', async () => {
    const catpawId = await seedCatpaw('Pepe');
    seedConnector('conn-holded-e2e', 'Holded MCP');

    await executeTool(
      'link_connector_to_catpaw',
      { catpaw_id: catpawId, connector_id: 'conn-holded-e2e' },
      'http://test',
      { userId: 'frank', sudoActive: false },
    );

    // (a) Body propagation — §N.3 template render
    const md = readCatpawFile(kbRoot, catpawId);
    expect(md).toBeTruthy();
    expect(md!).toMatch(/## Conectores vinculados/);
    expect(md!).toContain('**Holded MCP**');
    expect(md!).toContain('`conn-holded-e2e`');

    // (b) searchKb finds ≥1 result for 'holded'. We also need to ensure the
    // fresh CatPaw .md is reflected in _index.json — the hook already called
    // invalidateKbIndex; searchKb repoblará la caché leyendo _index.json.
    // El fixture no incluye 'Holded' así que los hits deben venir del catpaw
    // creado + connector entry añadidos por los hooks.
    const results = searchKb({ search: 'holded' });
    expect(results.total).toBeGreaterThanOrEqual(1);
  });

  // ──────────────────────────────────────────────────────────────────
  // T7 (EXTRA): link_skill happy path fires syncResource with skill enriched
  // ──────────────────────────────────────────────────────────────────

  it('T7 link_skill_to_catpaw fires syncResource with linked_skills populated + author=catbot:link_skill', async () => {
    const catpawId = await seedCatpaw('Linker Seven');
    seedSkill('skill-arq-001', 'Arquitecto de Agentes');

    const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');

    await executeTool(
      'link_skill_to_catpaw',
      { catpaw_id: catpawId, skill_id: 'skill-arq-001' },
      'http://test',
      { userId: 'greg', sudoActive: false },
    );

    const updateCalls = syncSpy.mock.calls.filter(
      (c) => c[0] === 'catpaw' && c[1] === 'update',
    );
    expect(updateCalls.length).toBe(1);

    const row = updateCalls[0][2] as {
      id: string;
      linked_skills?: Array<{ id: string; name: string }>;
    };
    expect(row.id).toBe(catpawId);
    expect(row.linked_skills!.length).toBe(1);
    expect(row.linked_skills![0].id).toBe('skill-arq-001');
    expect(row.linked_skills![0].name).toBe('Arquitecto de Agentes');

    const ctx = updateCalls[0][3] as { author?: string };
    expect(ctx.author).toBe('catbot:link_skill');

    // invalidateKbIndex fired after success
    expect(listCatpawFiles(kbRoot).length).toBeGreaterThanOrEqual(1);
  });

  // ──────────────────────────────────────────────────────────────────
  // T8 (EXTRA): T1 body propagation — invalidateKbIndex called on success
  // ──────────────────────────────────────────────────────────────────

  it('T8 link_connector success path llama invalidateKbIndex', async () => {
    const catpawId = await seedCatpaw('Linker Eight');
    seedConnector('conn-slack-001', 'Slack Webhook');

    const invalidateSpy = vi.spyOn(kbIndexCacheModule, 'invalidateKbIndex');

    await executeTool(
      'link_connector_to_catpaw',
      { catpaw_id: catpawId, connector_id: 'conn-slack-001' },
      'http://test',
      { userId: 'harry', sudoActive: false },
    );

    expect(invalidateSpy).toHaveBeenCalled();
  });
});
