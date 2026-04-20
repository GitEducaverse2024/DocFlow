---
phase: 157-kb-rebuild-determinism
plan: 02
type: execute
wave: 2
depends_on: ["157-01"]
files_modified:
  - scripts/kb-sync-db-source.cjs
  - app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts
  - .docflow-kb/resources/catpaws/*.md
  - .docflow-kb/_index.json
  - .docflow-kb/_header.md
autonomous: true
requirements: [KB-47]
must_haves:
  truths:
    - "buildBody(subtype, row, relations) acepta 3er parámetro opcional backwards-compat"
    - "Para subtype='catpaw', el body renderiza '## Conectores vinculados' + '## Skills vinculadas' con items ordenados por name ASC"
    - "Empty-state renderiza placeholder `_(sin conectores vinculados)_` / `_(sin skills vinculadas)_` (NO omite la sección)"
    - "Output byte-equivalente a renderLinkedSection de knowledge-sync.ts:1021-1028 — formato `- **<name>** (`<UUID>`)`"
    - "Rebuild post-fix: Operador Holded (53f19c51-*) .md contiene 'Holded MCP' bajo '## Conectores vinculados'"
    - "search_hints frontmatter preservado (KB-42 regression guard)"
    - "Segunda corrida post-backfill = 0 writes (idempotencia Phase 150 KB-09 preservada)"
  artifacts:
    - path: "scripts/kb-sync-db-source.cjs"
      provides: "renderLinkedSectionCjs + splitRelationsBySubtype helpers + buildBody 3-arg signature + call-site pasa relations"
      contains: "function renderLinkedSectionCjs"
    - path: "app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts"
      provides: "Extended: byte-equivalence tests + empty-placeholder + search_hints regression"
      min_lines: 150
    - path: ".docflow-kb/resources/catpaws/53f19c51-operador-holded.md"
      provides: "Operador Holded body con secciones '## Conectores vinculados' + '## Skills vinculadas'"
      contains: "## Conectores vinculados"
  key_links:
    - from: "buildBody('catpaw', row, relations)"
      to: "splitRelationsBySubtype(relations) + renderLinkedSectionCjs"
      via: "for subtype==='catpaw' render 2 sections always (with placeholder if empty)"
      pattern: "splitRelationsBySubtype.*renderLinkedSectionCjs"
    - from: "Pass-2 call site línea ~1549"
      to: "buildBody"
      via: "buildBody(sub, row, pawRelsMap.get(row.id) || [])"
      pattern: "buildBody\\(sub, row, "
---

<objective>
Extender `buildBody` en `scripts/kb-sync-db-source.cjs` para que acepte `relations` como 3er argumento opcional, renderice las secciones `## Conectores vinculados` y `## Skills vinculadas` en CatPaws de forma byte-equivalente al runtime path (`syncResource('catpaw','update')` de `knowledge-sync.ts:1021-1124`), y llamar Pass-2 pasándole `loadCatPawRelations(db).get(row.id)`.

Purpose: Cerrar Bug B (CONTEXT §2.2) — Phase 156-02 añadió renderLinkedSection al servicio TS pero el script CJS de rebuild nunca lo replicó, resultando en ~29 CatPaws pre-existentes sin secciones cuando se ejecuta `--full-rebuild --source db`. Tras este fix, el rebuild produce bodies byte-idénticos al runtime path, preservando idempotencia (Phase 150 KB-09).

Output:
- Helpers `renderLinkedSectionCjs(items, emptyLabel)` y `splitRelationsBySubtype(arr)` en `kb-sync-db-source.cjs`.
- `buildBody(subtype, row, relations?)` con signature extendida, SIEMPRE renderiza ambas secciones para catpaws (placeholder si vacío).
- Call-site en `populateFromDb` Pass-2 pasa `pawRelsMap.get(row.id) || []` a buildBody.
- Tests Wave-0 extendidos con byte-equivalence + empty-placeholder + search_hints regression.
- Rebuild ejecutado: Operador Holded CatPaw `.md` contiene `- **Holded MCP** (\`<UUID>\`)` bajo `## Conectores vinculados`.
- Segunda corrida = 0 writes (idempotencia).
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/157-kb-rebuild-determinism/157-RESEARCH.md
@.planning/phases/157-kb-rebuild-determinism/157-VALIDATION.md
@.planning/phases/157-kb-rebuild-determinism/157-01-SUMMARY.md
@scripts/kb-sync-db-source.cjs
@app/src/lib/services/knowledge-sync.ts

<interfaces>
<!-- Canonical output format — byte-equivalent with runtime path.
     Source: app/src/lib/services/knowledge-sync.ts:1021-1028 + 1058-1124 (verified). -->

Format reference (MUST match char-for-char for idempotence with Phase 156-02):

```markdown

## Conectores vinculados

- **Holded MCP** (`seed-holded-mcp`)
- **Gmail Info Educa** (`conn-gma-info-educa360-gmail`)

## Skills vinculadas

- **Deduplicación de leads** (`9c136bbb-dedup-skill`)

```

Rules:
- Items sorted by `name` ASC (ya garantizado por `catbot-tools.ts:2148` ORDER BY c.name ASC — rebuild MUST replicate this sort).
- Format: `- **<name>** (\`<id>\`)` — double asterisks, backticks around id, FULL UUID (NOT slug) because `knowledge-sync.ts:1108` passes `{id: connector.id}` (DB PK).
- Empty array: section is NOT omitted. Placeholder `_(sin conectores vinculados)_` / `_(sin skills vinculadas)_`.
- Separator: `\n` between items. Heading→body: `\n\n` (two newlines after `## Heading`).

From scripts/kb-sync-db-source.cjs (Plan 01 baseline — already has loadArchivedIds):

```javascript
// Line 207-255 (UNCHANGED — shape reference only)
function loadCatPawRelations(db) {
  // Returns: Map<pawId, Array<{id: string, subtype: 'connector'|'skill'|'catbrain', name?: string, connector_type_raw?: string}>>
  // NOT {connectors:[], skills:[]} — use splitRelationsBySubtype to discriminate.
}

// Line 942-1017 — buildBody signature to EXTEND
function buildBody(subtype, row) {
  // ... existing logic ...
}

// Line 1499-1607 populateFromDb — call-site line ~1549 to MODIFY
// Before: const body = buildBody(sub, row);
// After:  const pawRels = (sub === 'catpaw') ? (pawRelsMap.get(row.id) || []) : [];
//         const body = buildBody(sub, row, pawRels);
// NOTE: pawRelsMap must be computed BEFORE the loop (once):
//         const pawRelsMap = loadCatPawRelations(db);
```

From app/src/lib/services/knowledge-sync.ts (canonical TS path — DO NOT modify):

```typescript
// Line 1021-1028
function renderLinkedSection(items: Array<{id: string; name: string}>, emptyLabel: string): string {
  if (items.length === 0) return `_(${emptyLabel})_`;
  return items.map(i => `- **${i.name}** (\`${i.id}\`)`).join('\n');
}

// Line 1114-1121 — empty-state labels
'sin conectores vinculados'  // for connectors
'sin skills vinculadas'       // for skills
```
</interfaces>

<!-- CRITICAL from RESEARCH:
     - Placeholder format is `_(...)_` (underscore-wrapped italic).
     - Empty sections are ALWAYS rendered (Pitfall 3 — NOT conditional).
     - `loadCatPawRelations` returns flat array discriminated by `subtype`, NOT {connectors,skills} shape.
     - `relations` param is OPTIONAL (backwards-compat for non-catpaw subtypes). -->
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extender tests Wave-0 — byte-equivalence + empty-placeholder + search_hints regression</name>
  <files>app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts</files>
  <behavior>
    Añadir 5 tests al archivo existente (creado en Plan 01 Task 2):

    - Test A — `renderLinkedSectionCjs byte-equivalent with canonical format`: input `[{id:'abc', name:'Foo'}, {id:'xyz', name:'Bar'}]` + emptyLabel 'sin X'. Assert output `'- **Bar** (\`xyz\`)\n- **Foo** (\`abc\`)'` (sorted ASC). Test empty case `[]` + 'sin X' returns `'_(sin X)_'`.

    - Test B — `splitRelationsBySubtype discriminates correctly`: input flat array `[{id:'c1', subtype:'connector', name:'Conn1'}, {id:'s1', subtype:'skill', name:'Skill1'}, {id:'c2', subtype:'connector', name:'Conn2'}, {id:'cb1', subtype:'catbrain', name:'CB'}]`. Assert `{connectors: [Conn1, Conn2] sorted ASC, skills: [Skill1]}` — catbrain ignorado.

    - Test C — `buildBody('catpaw', row, [{id,subtype:connector,name}]) includes linked sections`: row con campos mínimos catpaw; relations con 1 connector + 1 skill. Assert body contiene literal `## Conectores vinculados\n\n- **<name>** (\`<UUID>\`)` y `## Skills vinculadas\n\n- **<name>** (\`<UUID>\`)` — byte-equivalent al format del runtime (knowledge-sync.ts:1021).

    - Test D — `buildBody('catpaw', row, []) renders both sections with placeholder`: relations vacío. Assert body contiene `## Conectores vinculados\n\n_(sin conectores vinculados)_` y `## Skills vinculadas\n\n_(sin skills vinculadas)_`. **Pitfall 3**: secciones siempre renderizadas (NO omitir).

    - Test E — `buildBody('connector', row, relations) ignores relations (backwards-compat)`: subtype no-catpaw con relations poblado. Assert body NO contiene ni '## Conectores vinculados' ni '## Skills vinculadas'.

    - Test F — `search_hints preservation (KB-42 regression guard)`: fixture DB con catpaw linked a 1 connector con name 'Holded MCP'. Correr `populateFromDb`. Leer archivo KB generado. Assert frontmatter contiene `search_hints: [Holded MCP]` (o similar). NO romper Phase 156-02 behavior.

    Todos los tests del Task 1 fallan en RED (helpers aún no existen ni la signature de `buildBody` acepta 3er arg).
  </behavior>
  <action>
    Editar `app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` añadiendo 6 tests (A-F) tras los 4 existentes de Plan 01.

    Acceder a los helpers via `_internal`:
    ```typescript
    const mod = require(path.resolve(REPO_ROOT, 'scripts/kb-sync-db-source.cjs'));
    const { renderLinkedSectionCjs, splitRelationsBySubtype, buildBody } = mod._internal;
    ```

    Para Test C/D/E — `buildBody` debe estar exportado via `_internal`. Si no lo está en Plan 01, añadirlo aquí (este task es RED-first, el export se hace en Task 2 junto con la implementación).

    Para Test F — usar `createFixtureDb` de Plan 01 baseline pero con un catpaw fixture que tenga `cat_paw_connectors` row linking al connector 'Holded MCP'. Ejecutar `populateFromDb({kbRoot: tmpKb, dryRun: false})`. Leer `.docflow-kb/resources/catpaws/<id>-<slug>.md` y assert frontmatter contiene `search_hints:` con `Holded MCP`.

    **CRITICAL (RESEARCH Pitfall 3):** Test D debe assertir que las secciones se renderizan SIEMPRE (incluso con `relations: []`). NO afirmar que `relations.length === 0 → section omitted` — ese es el comportamiento INCORRECTO que CONTEXT sugirió y RESEARCH corrigió.

    **CRITICAL (RESEARCH Pitfall 2):** Test B verifica que `splitRelationsBySubtype` opera sobre array PLANO discriminado por `rel.subtype`, NO sobre `{connectors:[], skills:[]}` nested shape.
  </action>
  <verify>
    <automated>cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/kb-sync-rebuild-determinism.test.ts 2>&1 | grep -E "(Test Files|fail|pass)"</automated>
  </verify>
  <done>
    6 tests nuevos (A-F) añadidos al archivo. Ejecutar `vitest run` muestra los nuevos tests en FAIL (RED) con mensajes como "renderLinkedSectionCjs is not a function" o "buildBody expected 3 args but got 2". Los 4 tests de Plan 01 siguen GREEN (no regresión).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implementar renderLinkedSectionCjs + splitRelationsBySubtype + extender buildBody</name>
  <files>scripts/kb-sync-db-source.cjs</files>
  <behavior>
    Los 6 tests (A-F) del Task 1 pasan a GREEN:
    - `renderLinkedSectionCjs(items, emptyLabel)` byte-equivalent.
    - `splitRelationsBySubtype(arr)` filtra y ordena.
    - `buildBody(subtype, row, relations?)` signature nueva, SIEMPRE renderiza secciones en catpaws.
    - Ambos helpers + `buildBody` exportados via `_internal`.
    - Call-site en `populateFromDb` Pass-2 pasa `pawRelsMap.get(row.id) || []` a `buildBody`.
    - Idempotencia preservada (primer rebuild = backfill, segundo = 0 writes).
  </behavior>
  <action>
    Editar `scripts/kb-sync-db-source.cjs` con 4 cambios:

    **Cambio 1** — Añadir helper `renderLinkedSectionCjs` (después de `loadArchivedIds` de Plan 01). Código exacto desde RESEARCH §Architecture Patterns Pattern 2:

    ```javascript
    /**
     * Phase 157 KB-47 — CJS mirror of knowledge-sync.ts:1021-1028.
     * Byte-equivalent with renderLinkedSection for idempotence with runtime path.
     *
     * @param {Array<{id: string, name: string}>} items  Sorted by name ASC (caller responsibility).
     * @param {string} emptyLabel  Placeholder label (without underscores).
     * @returns {string}  Markdown list or `_(emptyLabel)_` placeholder.
     */
    function renderLinkedSectionCjs(items, emptyLabel) {
      if (items.length === 0) return `_(${emptyLabel})_`;
      return items.map((i) => `- **${i.name}** (\`${i.id}\`)`).join('\n');
    }
    ```

    **Cambio 2** — Añadir helper `splitRelationsBySubtype` (justo después):

    ```javascript
    /**
     * Phase 157 KB-47 — split flat relations array from loadCatPawRelations()
     * into {connectors, skills} discriminated by rel.subtype, sorted by name ASC.
     *
     * Shape reference: loadCatPawRelations returns Array<{id, subtype, name?, ...}>
     * — NOT {connectors:[], skills:[]} (RESEARCH Pitfall 2).
     */
    function splitRelationsBySubtype(relations) {
      const connectors = [];
      const skills = [];
      for (const r of relations || []) {
        if (r.subtype === 'connector' && r.name) connectors.push({ id: r.id, name: r.name });
        else if (r.subtype === 'skill' && r.name) skills.push({ id: r.id, name: r.name });
      }
      connectors.sort((a, b) => a.name.localeCompare(b.name));
      skills.sort((a, b) => a.name.localeCompare(b.name));
      return { connectors, skills };
    }
    ```

    **Cambio 3** — Extender `buildBody(subtype, row)` → `buildBody(subtype, row, relations)` (línea 942-1017). Mantener toda la lógica existente; añadir al final (antes del `lines.push('');` trailing blank — línea ~1015-1016):

    ```javascript
    // Phase 157 KB-47 — linked sections for catpaws, byte-equivalent to
    // knowledge-sync.ts:1114-1121 so syncResource('catpaw','update') + rebuild
    // produce identical bodies. Sections ALWAYS rendered (placeholder if empty)
    // per RESEARCH Pitfall 3 — omitting breaks idempotence with runtime path.
    if (subtype === 'catpaw') {
      const { connectors, skills } = splitRelationsBySubtype(relations || []);
      lines.push('## Conectores vinculados');
      lines.push('');
      lines.push(renderLinkedSectionCjs(connectors, 'sin conectores vinculados'));
      lines.push('');
      lines.push('## Skills vinculadas');
      lines.push('');
      lines.push(renderLinkedSectionCjs(skills, 'sin skills vinculadas'));
    }
    ```

    Si el código existente de `buildBody` ya termina con `lines.push('');` + `return lines.join('\n');`, insertar el bloque nuevo ANTES del `lines.push('');` final. El trailing blank debe quedar al final para match con runtime path.

    **Cambio 4** — Modificar call-site en `populateFromDb` Pass-2 (línea ~1549). Computar `pawRelsMap` UNA VEZ antes del loop (no por-row):

    Antes del Pass-2 loop (junto a `archivedIds` loading de Plan 01, alrededor línea 1527):
    ```javascript
    // Phase 157 KB-47 — load catpaw relations once for the whole pass
    const pawRelsMap = loadCatPawRelations(db);
    ```

    Dentro del loop, reemplazar `const body = buildBody(sub, row);` por:
    ```javascript
    const pawRels = (sub === 'catpaw') ? (pawRelsMap.get(row.id) || []) : [];
    const body = buildBody(sub, row, pawRels);
    ```

    **Cambio 5** — Exportar ambos helpers + `buildBody` via `_internal` (módulo exports final). Añadir:
    ```javascript
    module.exports = {
      populateFromDb,
      _internal: {
        // ...existing (loadArchivedIds de Plan 01)...
        renderLinkedSectionCjs,
        splitRelationsBySubtype,
        buildBody,   // if not already exported
      },
    };
    ```

    NO modificar `buildFrontmatter` (línea 806-928) — el `search_hints` backfill ya existe desde Phase 156-02 y debe preservarse (Pitfall 8).

    NO modificar `knowledge-sync.ts` — scope discipline (RESEARCH §5).

    NO re-llamar `syncResource` desde el rebuild (RESEARCH §Don't Hand-Roll) — duplicar 8 líneas es la opción correcta.
  </action>
  <verify>
    <automated>cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/kb-sync-rebuild-determinism.test.ts 2>&1 | grep -E "(Test Files|pass|fail)"</automated>
  </verify>
  <done>
    Los 10 tests del archivo (4 de Plan 01 + 6 nuevos A-F) están en GREEN. `renderLinkedSectionCjs`, `splitRelationsBySubtype`, `buildBody` exportados via `_internal`. `buildBody` acepta 3er param opcional. Pass-2 pasa relations a buildBody. `node -c scripts/kb-sync-db-source.cjs` exit 0.
  </done>
</task>

<task type="auto">
  <name>Task 3: Rebuild live-DB + verificar Operador Holded body + idempotencia 2nd-run</name>
  <files>.docflow-kb/resources/catpaws/*.md, .docflow-kb/_index.json, .docflow-kb/_header.md</files>
  <action>
    Ejecutar rebuild backfill + verificar KB-47 Success Criteria #3-4 (ROADMAP) + idempotencia Phase 150 KB-09.

    **Paso 1 — Primera corrida (backfill):**
    ```bash
    cd /home/deskmath/docflow && DATABASE_PATH=/home/deskmath/docflow-data/docflow.db \
      node scripts/kb-sync.cjs --full-rebuild --source db --verbose 2>&1 | tee /tmp/rebuild-pass-1.log
    ```

    Esperado:
    - `updated: ≥29` (CatPaws pre-existentes que ganan secciones nuevas — Phase 156-02 solo tocó el runtime path via `syncResource`).
    - `skipped_archived: 10` (los archived siguen excluidos).
    - `created: 0` (no debería haber nuevos archivos).
    - `orphans: 0`.

    **Paso 2 — Verificar Operador Holded tiene secciones:**
    ```bash
    grep -l "Operador Holded\|operador-holded" .docflow-kb/resources/catpaws/*.md | head -1 | xargs cat | head -80
    ```

    El archivo debe contener (formato EXACTO):
    ```
    ## Conectores vinculados

    - **Holded MCP** (`<UUID>`)

    ## Skills vinculadas

    - **<skill_name>** (`<UUID>`)
    ```

    Si hay skills vinculadas. Si no, placeholder `_(sin skills vinculadas)_`.

    **Paso 3 — Segunda corrida (idempotencia):**
    ```bash
    cd /home/deskmath/docflow && DATABASE_PATH=/home/deskmath/docflow-data/docflow.db \
      node scripts/kb-sync.cjs --full-rebuild --source db --verbose 2>&1 | tee /tmp/rebuild-pass-2.log
    ```

    Esperado:
    - `updated: 0` (idempotencia — ningún cambio tras backfill).
    - `unchanged: ≥29`.
    - `skipped_archived: 10`.
    - `created: 0`.

    Si la segunda corrida reporta `updated > 0`, diagnosticar:
    - ¿`stripVolatile` captura `sync_snapshot`? (Phase 150 KB-09 Decision — debería).
    - ¿Sort stability? (los items deben salir siempre en mismo orden — verificar `localeCompare`).
    - ¿Trailing newline? (comparar bytes entre dos runs del mismo archivo).

    **Paso 4 — Regression guard KB-42 search_hints:**
    ```bash
    grep "search_hints:" .docflow-kb/resources/catpaws/*.md | grep -i "holded" | head -5
    ```

    Debe seguir presente. `search_kb({search:"holded"})` (manual/via CatBot en Plan 03) debe seguir devolviendo 9+ hits (Phase 156-02 baseline).

    **Commit:**
    `feat(157-02): buildBody relations 3-arg + renderLinkedSectionCjs + rebuild backfill sections`.

    Documentar en commit message: cuántos CatPaws actualizados (primera corrida), counts finales post-backfill, idempotencia verificada.
  </action>
  <verify>
    <automated>cd /home/deskmath/docflow && F=$(ls .docflow-kb/resources/catpaws/*operador-holded*.md 2>/dev/null | head -1); test -n "$F" && grep -q "^## Conectores vinculados" "$F" && grep -q "Holded MCP" "$F" && echo OK</automated>
  </verify>
  <done>
    Primera corrida: `updated: ≥29`, `skipped_archived: 10`, `created: 0`. Operador Holded `.md` contiene `## Conectores vinculados` con "- **Holded MCP** (`<UUID>`)" literal. Segunda corrida: `updated: 0`, `unchanged: ≥29` (idempotencia). `search_hints: [Holded MCP]` preservado en frontmatter. Commit creado.
  </done>
</task>

</tasks>

<verification>
- [ ] `scripts/kb-sync-db-source.cjs` exporta `renderLinkedSectionCjs`, `splitRelationsBySubtype`, `buildBody` via `_internal`.
- [ ] `buildBody` signature es `(subtype, row, relations)` con 3er param opcional.
- [ ] Pass-2 en `populateFromDb` computa `pawRelsMap = loadCatPawRelations(db)` UNA vez antes del loop.
- [ ] Call-site pasa `pawRelsMap.get(row.id) || []` a `buildBody`.
- [ ] `npx vitest run src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` — 10/10 GREEN.
- [ ] Operador Holded `.md` contiene secciones `## Conectores vinculados` + `## Skills vinculadas` con formato canónico `- **<name>** (\`<UUID>\`)`.
- [ ] Segunda corrida del rebuild = 0 writes (idempotencia preservada).
- [ ] `search_hints` frontmatter sin cambios (KB-42 preservation).
</verification>

<success_criteria>
**KB-47 (cumplido):**
- ✅ `buildBody(subtype, row, relations?)` — 3er param opcional backwards-compat.
- ✅ Para `subtype === 'catpaw'`: renderiza 2 secciones SIEMPRE (con placeholder si empty).
- ✅ Output byte-equivalente a `renderLinkedSection` de knowledge-sync.ts:1021.
- ✅ Post-rebuild: Operador Holded body contiene `- **Holded MCP** (\`<UUID>\`)` literal.
- ✅ Idempotencia Phase 150 KB-09 preservada (2nd run = 0 writes).
- ✅ search_hints frontmatter unchanged (KB-42 preservation).

**NO cubierto aquí (pasa a Plan 03):**
- ❌ Comando `--restore --from-legacy` (Plan 03).
- ❌ Docs §Rebuild Determinism en `_manual.md` (Plan 03).
- ❌ Oracle CatBot post-rebuild (Plan 03 — requiere docker restart para cache TTL).
- ❌ `search_kb({search:"holded"})` body-match via CatBot (Plan 03 oracle Prompt A).
</success_criteria>

<output>
After completion, create `.planning/phases/157-kb-rebuild-determinism/157-02-SUMMARY.md` documentando:
- Cambios exactos en `scripts/kb-sync-db-source.cjs` (líneas añadidas: 2 helpers + buildBody signature extension + Pass-2 call-site + exports).
- Tests extendidos en `kb-sync-rebuild-determinism.test.ts` (10/10 GREEN).
- Stats del rebuild: #CatPaws actualizados en primera corrida, counts finales, verificación idempotencia.
- Output literal del body de Operador Holded (secciones vinculadas).
- Handoff a Plan 03: `--restore` CLI + docs + oracle pending.
</output>
