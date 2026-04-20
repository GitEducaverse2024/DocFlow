---
phase: 156-kb-runtime-integrity
plan: 02
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [KB-42]
files_modified:
  - app/src/lib/services/knowledge-sync.ts
  - app/src/lib/services/catbot-tools.ts
  - app/src/lib/__tests__/catbot-tools-link.test.ts
  - app/src/lib/__tests__/knowledge-sync-catpaw-template.test.ts
must_haves:
  truths:
    - "link_connector_to_catpaw tras INSERT exitoso llama syncResource('catpaw','update', pawRow_enriched, hookCtx('catbot:link_connector')) y regenera el .md del CatPaw"
    - "link_skill_to_catpaw tras INSERT OR IGNORE llama syncResource; re-link idempotente → body idéntico → isNoopUpdate short-circuit → no version bump"
    - "El .md del CatPaw contiene sección '## Conectores vinculados' con cada conector (sorted por name ASC); sección '## Skills vinculadas' igual"
    - "search_kb({search:'holded'}) encuentra la CatPaw cuando tiene 'Holded MCP' en conectores vinculados (body text match)"
    - "UNIQUE collision (already_linked:true) NO dispara syncResource — solo happy-path INSERT lo hace"
  artifacts:
    - path: "app/src/lib/services/knowledge-sync.ts"
      provides: "buildBody catpaw extendido con '## Conectores vinculados' + '## Skills vinculadas' leyendo row.linked_connectors + row.linked_skills (Opción A — service permanece pure filesystem)"
      contains: "Conectores vinculados"
    - path: "app/src/lib/services/catbot-tools.ts"
      provides: "link_connector_to_catpaw + link_skill_to_catpaw cases con SELECT-back enriquecido + syncResource('catpaw','update',_) + try/catch/markStale"
      contains: "catbot:link_connector"
    - path: "app/src/lib/__tests__/catbot-tools-link.test.ts"
      provides: "Tests RED→GREEN para ambas link tools + failure paths + search_kb integration"
      min_lines: 200
    - path: "app/src/lib/__tests__/knowledge-sync-catpaw-template.test.ts"
      provides: "Tests RED→GREEN para buildBody catpaw extendido (sorted, placeholders, ambas secciones)"
      min_lines: 120
  key_links:
    - from: "app/src/lib/services/catbot-tools.ts link_*_to_catpaw"
      to: "app/src/lib/services/knowledge-sync.ts syncResource"
      via: "await syncResource('catpaw','update', enriched_row_with_linked_arrays, hookCtx(...))"
      pattern: "syncResource\\('catpaw',\\s*'update'"
    - from: "app/src/lib/services/knowledge-sync.ts buildBody"
      to: "CatPaw .md body"
      via: "render de row.linked_connectors + row.linked_skills sorted por name"
      pattern: "Conectores vinculados|Skills vinculadas"
    - from: "search_kb body text match"
      to: "CatPaw con conector Holded linked"
      via: "kb-index-cache body scan de '## Conectores vinculados'"
      pattern: "search_kb.*holded"
---

<objective>
Cerrar el gap KB-42: hoy `link_connector_to_catpaw` y `link_skill_to_catpaw` insertan filas en `cat_paw_connectors` / `cat_paw_skills` SIN actualizar el archivo KB del CatPaw padre. Resultado: el .md del CatPaw no refleja sus conectores/skills, y `search_kb({search:"holded"})` no encuentra CatPaws ligadas al conector Holded. Este plan añade el re-sync del CatPaw tras cada link exitoso Y extiende el template de buildBody para incluir las secciones "## Conectores vinculados" + "## Skills vinculadas".

Purpose: Completar el ciclo de sync cuando la relación entre entidades cambia (no solo cuando la entidad en sí cambia). El `_manual.md` L164 ya promete `minor bump on related (conectores/skills/catbrains enlazados)` — este plan lo implementa por primera vez.

Output: 2 archivos productivos modificados (knowledge-sync.ts, catbot-tools.ts) + 2 archivos de test nuevos. Tests RED-first en Wave 0; implementación GREEN en Wave 1. Preserva el contrato "no DB import en knowledge-sync.ts" (Opción A de RESEARCH §D — caller pasa el row enriquecido).
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/156-kb-runtime-integrity/156-RESEARCH.md
@.planning/phases/156-kb-runtime-integrity/156-VALIDATION.md

# Código productivo a modificar
@app/src/lib/services/knowledge-sync.ts
@app/src/lib/services/catbot-tools.ts

# Contratos frozen (no reinventar) — RESEARCH §C
@app/src/lib/services/kb-hook-helpers.ts
@app/src/lib/services/kb-audit.ts
@app/src/lib/services/kb-index-cache.ts

# Convención de tests (Phase 153)
@app/src/lib/__tests__/kb-hooks-tools.test.ts
@app/src/lib/__tests__/kb-test-utils.ts

<interfaces>
<!-- Frozen API surface consumida por este plan — from RESEARCH §C + §D. -->

From app/src/lib/services/knowledge-sync.ts:
```typescript
export type Entity = 'catpaw' | 'connector' | 'catbrain' | 'template' | 'skill' | 'canvas';
export async function syncResource(entity, op, row, context?): Promise<void>;
// Importante: el servicio NO importa better-sqlite3. Opción A (RESEARCH §D) = caller pasa row con linked_connectors + linked_skills embebidos.
```

From app/src/lib/services/kb-hook-helpers.ts:
```typescript
export function hookCtx(author: string, extras?: { reason?: string }): SyncContext;
export function hookSlug(name: string): string;
```

From app/src/lib/services/kb-audit.ts:
```typescript
export function markStale(kbRelPath: string, reason: StaleReason, details?: StaleEntry): void;
```

From app/src/lib/services/kb-index-cache.ts:
```typescript
export function invalidateKbIndex(): void;
export async function searchKb(query: { search?: string; type?: string; tags?: string[]; status?: string }): Promise<{total:number; results:Array<...>}>;
```
</interfaces>

<reference_code>
<!-- Código destino verificado — RESEARCH §N.2 + §N.3. Implementar byte-identical. -->

== N.2 link_connector_to_catpaw target state ==

```ts
case 'link_connector_to_catpaw': {
  const catpawId = args.catpaw_id as string;
  const connectorId = args.connector_id as string;

  const paw = db.prepare('SELECT id, name FROM cat_paws WHERE id = ?').get(catpawId) as { id: string; name: string } | undefined;
  if (!paw) return { name, result: { error: `CatPaw no encontrado: ${catpawId}` } };
  const connector = db.prepare('SELECT id, name FROM connectors WHERE id = ?').get(connectorId) as { id: string; name: string } | undefined;
  if (!connector) return { name, result: { error: `Conector no encontrado: ${connectorId}` } };

  try {
    db.prepare('INSERT INTO cat_paw_connectors (paw_id, connector_id, usage_hint, is_active, created_at) VALUES (?, ?, ?, 1, ?)')
      .run(catpawId, connectorId, (args.usage_hint as string) || null, new Date().toISOString());
  } catch (e) {
    if ((e as Error).message.includes('UNIQUE')) {
      return { name, result: { already_linked: true, catpaw: paw.name, connector: connector.name } };
    }
    throw e;
  }

  // NEW Phase 156 KB-42 hook
  const pawRow = db.prepare('SELECT * FROM cat_paws WHERE id = ?').get(catpawId) as Record<string, unknown> & { id: string; name: string };
  const linked_connectors = db.prepare(
    'SELECT c.id, c.name FROM cat_paw_connectors cpc LEFT JOIN connectors c ON c.id = cpc.connector_id WHERE cpc.paw_id = ? ORDER BY c.name ASC'
  ).all(catpawId) as Array<{ id: string; name: string }>;
  const linked_skills = db.prepare(
    'SELECT s.id, s.name FROM cat_paw_skills cps LEFT JOIN skills s ON s.id = cps.skill_id WHERE cps.paw_id = ? ORDER BY s.name ASC'
  ).all(catpawId) as Array<{ id: string; name: string }>;
  const enriched = { ...pawRow, linked_connectors, linked_skills };

  try {
    await syncResource('catpaw', 'update', enriched, hookCtx('catbot:link_connector'));
    invalidateKbIndex();
  } catch (err) {
    const errMsg = (err as Error).message;
    logger.error('kb-sync', 'syncResource failed on link_connector_to_catpaw', { entity: 'catpaw', id: catpawId, err: errMsg });
    markStale(
      `resources/catpaws/${catpawId.slice(0, 8)}-${hookSlug(paw.name)}.md`,
      'update-sync-failed',
      { entity: 'cat_paws', db_id: catpawId, error: errMsg },
    );
  }

  return {
    name,
    result: { linked: true, catpaw_id: catpawId, catpaw_name: paw.name, connector_id: connectorId, connector_name: connector.name },
  };
}
```

== N.3 buildBody catpaw extension ==

```ts
if (entity === 'catpaw') {
  // ... existing Modo/Modelo/Departamento + ## System prompt + ## Configuración ...

  // NEW Phase 156 KB-42
  const linkedConnectors = (row as unknown as { linked_connectors?: Array<{ id: string; name: string }> }).linked_connectors ?? [];
  const linkedSkills = (row as unknown as { linked_skills?: Array<{ id: string; name: string }> }).linked_skills ?? [];

  lines.push('## Conectores vinculados');
  lines.push('');
  if (linkedConnectors.length === 0) {
    lines.push('_(sin conectores vinculados)_');
  } else {
    for (const c of linkedConnectors) {
      lines.push(`- **${c.name}** (\`${c.id}\`)`);
    }
  }
  lines.push('');
  lines.push('## Skills vinculadas');
  lines.push('');
  if (linkedSkills.length === 0) {
    lines.push('_(sin skills vinculadas)_');
  } else {
    for (const s of linkedSkills) {
      lines.push(`- **${s.name}** (\`${s.id}\`)`);
    }
  }
  lines.push('');
}
```
</reference_code>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 (Wave 0 RED): Crear catbot-tools-link.test.ts + knowledge-sync-catpaw-template.test.ts con stubs rojos</name>
  <files>app/src/lib/__tests__/catbot-tools-link.test.ts, app/src/lib/__tests__/knowledge-sync-catpaw-template.test.ts</files>
  <behavior>
    catbot-tools-link.test.ts — 6 tests (RED inicialmente):
    - T1 "link_connector fires syncResource with enriched row": INSERT exitoso, syncSpy llamado con 'catpaw'/'update', args[2].linked_connectors tiene el connector recién añadido, args[3].author === 'catbot:link_connector'.
    - T2 "link_skill re-link noop via isNoopUpdate": link por segunda vez con mismo skill → syncResource se llama pero el .md no cambia (body byte-idéntico) — verificar version NO sube (isNoopUpdate short-circuit).
    - T3 "UNIQUE collision on link_connector → already_linked: no syncResource call": segundo link con mismo connectorId → result.already_linked === true, syncSpy NOT called second time.
    - T4 "CatPaw missing → error, no syncResource": catpawId inexistente → result.error set, syncSpy never called.
    - T5 "Connector/Skill missing → error, no syncResource": connectorId/skillId inexistente → result.error set, syncSpy never called.
    - T6 "search_kb finds CatPaw via linked connector body text": tras link Holded a Pepe, searchKb({search:'holded'}) retorna un result cuyo id incluye el del CatPaw Pepe. Integration test — usa kbRoot real post-sync.

    knowledge-sync-catpaw-template.test.ts — 5 tests (RED inicialmente):
    - T1 "buildBody catpaw renders Conectores vinculados section with sorted names": input row {linked_connectors:[{id:'c2',name:'Zzz'},{id:'c1',name:'Aaa'}]} → output.body contiene '## Conectores vinculados\n\n- **Aaa** (`c1`)\n- **Zzz** (`c2`)\n' (sorted ASC por name in caller; buildBody renders tal cual).
    - T2 "buildBody catpaw renders placeholder when linked_connectors empty": row.linked_connectors === [] → output.body contiene '_(sin conectores vinculados)_'.
    - T3 "buildBody catpaw renders Skills vinculadas section": row.linked_skills:[{id:'s1',name:'Orq'}] → body contiene '## Skills vinculadas\n\n- **Orq** (`s1`)'.
    - T4 "syncResource update with linked_* changed → bump patch or minor": create catpaw sin linked, segundo update con linked_connectors:[{...}] → version sube por lo menos a 1.0.1 (patch). MINOR bump es aspirational (_manual.md L164) — si detectBumpLevel no lo implementa, patch es acceptable.
    - T5 "syncResource update with same linked_* → isNoopUpdate no-op": tras T4, tercer update con linked_connectors idéntico → no version bump (body byte-idéntico).

    Fixture pattern (inline, no shared helper refactor — RESEARCH §P-Q2):
    - createFixtureKb desde kb-test-utils.ts.
    - ensureTables inline per archivo: CREATE TABLE cat_paws(id, name, system_prompt, mode, model, temperature, max_tokens, department, created_at, updated_at); CREATE TABLE connectors(id, name); CREATE TABLE skills(id, name); CREATE TABLE cat_paw_connectors(paw_id, connector_id, usage_hint, is_active, created_at, PRIMARY KEY(paw_id, connector_id)); CREATE TABLE cat_paw_skills(paw_id, skill_id, created_at, PRIMARY KEY(paw_id, skill_id)).
  </behavior>
  <action>
    1. Leer `app/src/lib/__tests__/kb-hooks-tools.test.ts` completo (Phase 153 tool-case test convention).

    2. Crear `app/src/lib/__tests__/catbot-tools-link.test.ts` con los 6 tests. Stack:
       - Importar `executeTool` desde `../../services/catbot-tools` (verificar export real).
       - seedCatPaw helper: `db.prepare('INSERT INTO cat_paws (...) VALUES (...)').run(id, name, ...)`.
       - vi.spyOn(knowledgeSyncModule, 'syncResource'). NO mock completo — dejar ejecutar real para T6 que verifica fs state + search_kb.
       - T6 usa kbRoot real y llama `searchKb({search:'holded'})` desde kb-index-cache. Tras `invalidateKbIndex()` (fire por el hook), la siguiente búsqueda deberá leer fresh. El test puede necesitar `await invalidateKbIndex(); await new Promise(r=>setTimeout(r,10))` para que el filesystem settle.

    3. Crear `app/src/lib/__tests__/knowledge-sync-catpaw-template.test.ts` con los 5 tests. Stack:
       - Testa `syncResource` directamente en lugar de pasar por una tool. Input: mock row `{id, name, system_prompt, linked_connectors, linked_skills, ...}`.
       - Lee el resultado en fs: `fs.readFileSync(path.join(kbRoot,'resources/catpaws/<id8>-<slug>.md'),'utf-8')`.
       - Verifica substring literal de las 2 secciones.
       - Para T4/T5 bump: lee el frontmatter, extrae `version`, compara antes/después.

    4. Correr: `cd app && npx vitest run catbot-tools-link.test.ts knowledge-sync-catpaw-template.test.ts`. Los 11 tests (6+5) deben FALLAR — y fallar por la razón correcta (hook no implementado, sección no renderizada) NO por error de import/setup.

    5. Commit: `test(156-02): add RED tests for link tools + buildBody catpaw template extension (KB-42)`

    Restricciones CLAUDE.md/MEMORY.md:
    - Spanish comments donde aplique; tests descriptions pueden ser EN.
    - No tombstone comments.
    - Tests self-contained — cada test crea y limpia su propio tmpdir.
  </action>
  <verify>
    <automated>cd app && npx vitest run catbot-tools-link.test.ts knowledge-sync-catpaw-template.test.ts 2>&1 | grep -E '(FAIL|Tests)' | head -20</automated>
  </verify>
  <done>
    Los 11 tests (6 link + 5 template) existen y fallan por la razón correcta (hook/sección ausente), no por errores de import/TypeScript/setup. Commit `test(156-02): ...` creado. Task 2 puede empezar.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2 (Wave 1): Extender buildBody catpaw en knowledge-sync.ts con secciones vinculadas → T1-T3 + T5 de template.test.ts GREEN</name>
  <files>app/src/lib/services/knowledge-sync.ts</files>
  <action>
    Extender `buildBody` para el caso `entity === 'catpaw'` con las dos nuevas secciones. Opción A de RESEARCH §D (service stays pure filesystem, caller pasa row enriquecido con `linked_connectors` + `linked_skills` arrays).

    1. Leer `app/src/lib/services/knowledge-sync.ts:966-1011` (región buildBody catpaw).

    2. Añadir al final del bloque `if (entity === 'catpaw') { ... }` (tras las secciones existentes Modo/Modelo, ## System prompt, ## Configuración) el código de RESEARCH §N.3:
       ```ts
       const linkedConnectors = (row as unknown as { linked_connectors?: Array<{ id: string; name: string }> }).linked_connectors ?? [];
       const linkedSkills = (row as unknown as { linked_skills?: Array<{ id: string; name: string }> }).linked_skills ?? [];

       lines.push('## Conectores vinculados');
       lines.push('');
       if (linkedConnectors.length === 0) {
         lines.push('_(sin conectores vinculados)_');
       } else {
         for (const c of linkedConnectors) {
           lines.push(`- **${c.name}** (\`${c.id}\`)`);
         }
       }
       lines.push('');
       lines.push('## Skills vinculadas');
       lines.push('');
       if (linkedSkills.length === 0) {
         lines.push('_(sin skills vinculadas)_');
       } else {
         for (const s of linkedSkills) {
           lines.push(`- **${s.name}** (\`${s.id}\`)`);
         }
       }
       lines.push('');
       ```

    3. NO importar better-sqlite3 (contrato frozen — RESEARCH §J anti-pattern, RESEARCH §D Opción A). Solo cast-lectura del row.

    4. NO tocar `detectBumpLevel()`. La `_manual.md` L164 dice "minor bump on related" — implementarlo es NICE-TO-HAVE opcional. RESEARCH §D bump-level-semantics recomienda minor, pero por simplicidad Patch es acceptable. DEFERRED: extender `detectBumpLevel` con un `linked_connectors_hash` en sync_snapshot es una mejora documental; lo dejamos para una phase posterior si el equipo lo pide. Test T4 acepta patch como pass (≥ bump, no ==).

    5. Correr tests template: `cd app && npx vitest run knowledge-sync-catpaw-template.test.ts`. T1, T2, T3 deben GREEN. T5 GREEN si isNoopUpdate detecta body byte-idéntico. T4 GREEN con patch bump (no minor).

    6. Correr suite Phase 149 para no romper syncResource existente: `cd app && npx vitest run knowledge-sync.test.ts` → sin regresiones.

    7. Local build: `cd app && npm run build 2>&1 | tail -20` → exit 0.

    8. Commit: `feat(156-02): extend buildBody catpaw with linked connectors + skills sections (KB-42 template side)`

    Pitfalls (RESEARCH §L):
    - Pitfall 3 (isNoopUpdate body drift): caller DEBE pasar `linked_connectors` sorted por name ASC. No poner timestamps ni IDs random en la sección. ORDER BY c.name ASC en la SELECT — verificar en Task 3.
  </action>
  <verify>
    <automated>cd app && npx vitest run knowledge-sync-catpaw-template.test.ts -t "conectores" -t "skills" -t "placeholder"</automated>
  </verify>
  <done>
    Los 5 tests de knowledge-sync-catpaw-template.test.ts pasan (o T4 pasa con patch bump). Suite knowledge-sync.test.ts sin regresiones. npm run build exit 0. Commit creado.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3 (Wave 1): Hook link_connector_to_catpaw + link_skill_to_catpaw en catbot-tools.ts → T1-T6 de catbot-tools-link.test.ts GREEN</name>
  <files>app/src/lib/services/catbot-tools.ts</files>
  <action>
    Añadir el hook syncResource('catpaw','update',enriched) tras INSERT exitoso en las 2 tool cases. Patrón byte-idéntico al `create_cat_paw` case de Phase 153 + RESEARCH §N.2.

    1. Leer `app/src/lib/services/catbot-tools.ts` L9 (imports) + L2122-2164 (link cases).

    2. Verificar que los 5 imports ya existen al top (Phase 153 los añadió para otras tool cases). Debe haber:
       ```ts
       import { syncResource } from './knowledge-sync';
       import { invalidateKbIndex, searchKb, getKbEntry, resolveKbEntry } from './kb-index-cache';
       import { markStale } from './kb-audit';
       import { hookCtx, hookSlug } from './kb-hook-helpers';
       ```
       Si alguno falta, añadirlo.

    3. Reemplazar el case `link_connector_to_catpaw` (aprox L2122-2146) con la versión de RESEARCH §N.2 (ver `<reference_code>` arriba). Cambios relevantes respecto al original:
       - Tras INSERT exitoso (antes del return `{linked:true,...}`), añadir:
         * SELECT * del pawRow.
         * 2 SELECT JOIN para linked_connectors y linked_skills (con `ORDER BY c.name ASC` / `ORDER BY s.name ASC` — Pitfall 3).
         * enriched = {...pawRow, linked_connectors, linked_skills}.
         * try { await syncResource('catpaw','update',enriched, hookCtx('catbot:link_connector')); invalidateKbIndex(); } catch { logger.error + markStale }.
       - Mantener `{ name, result: { linked: true, catpaw_id, catpaw_name: paw.name, connector_id, connector_name: connector.name } }` return intacto.
       - NO hookear la rama `already_linked:true` (RESEARCH §P-Q1 resolved: reconciliation es scope de `--full-rebuild`).

    4. Reemplazar el case `link_skill_to_catpaw` (aprox L2148-2164) con el mismo patrón pero:
       - Author: `'catbot:link_skill'` (no connector).
       - Misma JOIN query para enriched row.
       - `INSERT OR IGNORE` se mantiene — opción B (siempre fire syncResource; `isNoopUpdate` lo protege contra re-link spurious). Referencia RESEARCH §A.6 y Pitfall 8.
       - Capturar optional `stmt.run().changes` para log si es útil, pero NO condicional sobre él (option B > option A per RESEARCH §A.6 recommendation).

    5. executeTool ya es async (RESEARCH §A.5 L164 dice "executeTool es async"), no cambios de signature.

    6. Verificar TypeScript: `cd app && npx tsc --noEmit 2>&1 | grep 'catbot-tools' | head -20` → limpio.

    7. Verificar imports sin usar: si en catbot-tools.ts hay un import que ya no se usa tras esta edit, eliminarlo (unused imports matan Docker build per MEMORY.md — feedback_unused_imports_build.md). Si añadimos imports nuevos y ya estaban, no duplicar.

    8. Correr tests: `cd app && npx vitest run catbot-tools-link.test.ts`. 6 tests GREEN.

    9. Correr suite de tool hooks: `cd app && npx vitest run kb-hooks-tools.test.ts` — sin regresiones.

    10. Suite KB completa para sanidad: `cd app && npx vitest run --reporter=default 2>&1 | tail -40`. Sin regresiones.

    11. Local build: `cd app && npm run build` exit 0.

    12. Commit: `feat(156-02): hook link_connector_to_catpaw + link_skill_to_catpaw to syncResource (KB-42 tool side)`

    Pitfalls relevantes:
    - Pitfall 1 (double-fire): Este plan NO toca `/api/cat-paws/*`. Los link-tools son direct-DB, no pass-through. Hook solo aquí — correcto.
    - Pitfall 3 (isNoopUpdate body drift): ORDER BY en SELECT → sorted determinísticamente. Re-link con mismo skill → body byte-idéntico → isNoopUpdate → no-op. Test T2 lo verifica.
    - Pitfall 8 (INSERT OR IGNORE hides failed link): skill-exists check (L2155-2156) ya lo mitiga.

    OPCIONAL (DEFERRED): Consistencia con `create_cat_paw` y `/api/cat-paws/*` routes — sus hooks HOY pasan un row NO enriquecido a syncResource('catpaw','create',row). Tras este plan, el template render llama `row.linked_connectors ?? []` → renderiza placeholders vacíos en la primera creación (expected; un CatPaw recién creado no tiene links). Si queremos que el primer create también muestre los links (ej. si se pasa `connectors:[...]` en el POST body), sería un scope creep — DEFERRED, pero noted en el plan de la fase siguiente. Los tests de este plan NO requieren la consistencia — solo los 2 link cases.
  </action>
  <verify>
    <automated>cd app && npx vitest run catbot-tools-link.test.ts -t "link_connector" -t "link_skill" -t "search_kb"</automated>
  </verify>
  <done>
    Los 6 tests de catbot-tools-link.test.ts pasan. Los 5 de knowledge-sync-catpaw-template.test.ts siguen verdes. Suite completa `cd app && npx vitest run` sin regresiones frente al estado pre-Plan-156-02. Local build exit 0. Commit creado. Ready para Plan 156-03.
  </done>
</task>

</tasks>

<verification>
Tras completar las 3 tasks:

1. **Automatizado:** `cd app && npx vitest run catbot-tools-link.test.ts knowledge-sync-catpaw-template.test.ts` → 11/11 tests verdes.
2. **Suite KB completa:** `cd app && npx vitest run kb-hooks-tools.test.ts kb-hooks-api-routes.test.ts knowledge-sync.test.ts kb-index-cache.test.ts` → sin regresiones.
3. **Local build:** `cd app && npm run build` exit 0 (unused-import check es blocker per MEMORY.md).
4. **Files disjuntos con Plan 156-01:** `knowledge-sync.ts` (este) vs `catbot-sudo-tools.ts`+`canvas/route.ts` (Plan 01) — cero overlap. `catbot-tools.ts` (este) vs `canvas/*` (Plan 01) — cero overlap. Merge conflicts imposibles.
5. **CatBot oracle (diferido al close de phase):** Prompt 3 de §I RESEARCH — "Crea un CatPaw 'Test Linker', enlázale el conector Holded MCP, y dime qué conectores tiene vinculados según el KB" — se ejecuta en Plan 156-03 close o en `/gsd:verify-phase`.
</verification>

<success_criteria>
- [ ] `app/src/lib/services/knowledge-sync.ts` buildBody catpaw renderiza `## Conectores vinculados` + `## Skills vinculadas` (con placeholder `_(sin …)_` cuando vacío).
- [ ] `app/src/lib/services/catbot-tools.ts` link_connector_to_catpaw case: SELECT-back enriquecido + syncResource('catpaw','update',enriched, hookCtx('catbot:link_connector')) + invalidateKbIndex + try/catch/markStale. Rama `already_linked:true` NO hookea.
- [ ] `app/src/lib/services/catbot-tools.ts` link_skill_to_catpaw case: mismo patrón con author 'catbot:link_skill'.
- [ ] 2 test files existen, 11 tests pasan (6 link + 5 template).
- [ ] Local `npm run build` exit 0.
- [ ] 3 commits con prefijos `test(156-02)` y `feat(156-02)`.
- [ ] Files disjuntos con Plan 156-01 — podrían haberse ejecutado en paralelo Wave 1.
</success_criteria>

<output>
After completion, create `.planning/phases/156-kb-runtime-integrity/156-02-SUMMARY.md` con:
- Tasks completadas (3/3), commits SHAs.
- Test results (11/11 green + suite pre-Plan-02 sin regresiones).
- Decisiones:
  * Opción A (caller enriquece row) sobre B (DB en knowledge-sync) — contrato preservado.
  * Bump level patch (no minor) — NICE-TO-HAVE detectBumpLevel extension DEFERRED.
  * `already_linked:true` no hookea — reconciliation via `--full-rebuild --source db`.
- Open question §P-Q5 (searchKb body-text-match) resuelto: T6 pasa → kb-index-cache SÍ escanea body. No investigación adicional necesaria.
- Gaps: ninguno esperado. Si detectBumpLevel resulta crítico para Plan 156-03, se abre como follow-up.
</output>
