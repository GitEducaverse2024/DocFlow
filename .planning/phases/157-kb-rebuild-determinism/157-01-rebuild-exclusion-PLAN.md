---
phase: 157-kb-rebuild-determinism
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .docflow-kb/resources/catpaws/72ef0fe5-redactor-informe-inbound.md
  - .docflow-kb/resources/catpaws/7af5f0a7-lector-inbound.md
  - .docflow-kb/resources/catpaws/96c00f37-clasificador-inbound.md
  - .docflow-kb/resources/catpaws/98c3f27c-procesador-inbound.md
  - .docflow-kb/resources/catpaws/a56c8ee8-ejecutor-inbound.md
  - .docflow-kb/resources/catpaws/a78bb00b-maquetador-inbound.md
  - .docflow-kb/resources/canvases/5a56962a-email-classifier-pilot.md
  - .docflow-kb/resources/canvases/9366fa92-revision-diaria-inbound.md
  - .docflow-kb/resources/skills/4f7f5abf-leads-y-funnel-infoeduca.md
  - .docflow-kb/resources/connectors/conn-gma-info-educa360-gmail.md
  - .docflow-kb/_index.json
  - .docflow-kb/_header.md
  - scripts/kb-sync-db-source.cjs
  - app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts
autonomous: true
requirements: [KB-46]
must_haves:
  truths:
    - "Los 10 archivos resucitados ya no existen en .docflow-kb/resources/**"
    - "scripts/kb-sync-db-source.cjs carga archivedIds Set desde .docflow-legacy/orphans/ tras buildIdMap"
    - "Pass-2 del populateFromDb aplica exclude O(1) y emite WARN [archived-skip] sin escribir"
    - "Segundo run de --full-rebuild --source db no resucita los archivos archivados"
    - "_index.json.counts post-rebuild matches DB row counts con Δ=0 para las 6 entidades"
  artifacts:
    - path: "scripts/kb-sync-db-source.cjs"
      provides: "loadArchivedIds helper + Pass-2 exclude logic + report.skipped_archived field"
      contains: "function loadArchivedIds"
    - path: "app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts"
      provides: "Wave-0 RED tests for loadArchivedIds + populateFromDb exclude + dry-run integration"
      min_lines: 80
    - path: ".docflow-kb/_index.json"
      provides: "Post-rebuild counts con Δ=0 vs DB"
      contains: "\"catpaws_active\""
  key_links:
    - from: "scripts/kb-sync-db-source.cjs populateFromDb"
      to: ".docflow-legacy/orphans/<subtype>/*.md"
      via: "loadArchivedIds(kbRoot) → Set<string>"
      pattern: "loadArchivedIds.*path\\.resolve.*\\.\\..*docflow-legacy"
    - from: "Pass-2 row iteration"
      to: "archivedIds Set"
      via: "continue + report.skipped_archived++ cuando archivedIds.has(`${sub}:${shortIdSlug}`)"
      pattern: "archivedIds\\.has"
---

<objective>
Eliminar los 10 archivos resucitados por el rebuild post-commit 06d69af7 y blindar `scripts/kb-sync-db-source.cjs` para que `--full-rebuild --source db` NUNCA vuelva a resucitar archivos presentes en `.docflow-legacy/orphans/<subtype>/*.md`.

Purpose: Cerrar el Bug A (root cause `writeResourceFile` línea 1401-1482 + Pass-2 sin exclusion check) de la regresión detectada en audit #2. Alinea el rebuild con PRD §5.3 Lifecycle (`archived → purged` es terminal, no tiene vuelta automática).

Output:
- 10 archivos resucitados eliminados via `git rm` (paso 1 — clean tree antes del fix).
- Wave-0 test file `kb-sync-rebuild-determinism.test.ts` con 3 RED tests (loadArchivedIds + populateFromDb excludes archived + integration --dry-run).
- Helper `loadArchivedIds(kbRoot) → Set<string>` implementado en `scripts/kb-sync-db-source.cjs`.
- Pass-2 loop con `continue` + `report.skipped_archived++` + `console.warn('[archived-skip] ...')`.
- Rebuild ejecutado: `_index.json.counts` matches DB row counts Δ=0 para las 6 entidades.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/157-kb-rebuild-determinism/157-CONTEXT.md
@.planning/phases/157-kb-rebuild-determinism/157-RESEARCH.md
@.planning/phases/157-kb-rebuild-determinism/157-VALIDATION.md
@scripts/kb-sync-db-source.cjs
@scripts/kb-sync.cjs
@app/src/lib/__tests__/kb-sync-db-source.test.ts

<interfaces>
<!-- Key contracts the executor needs. Extracted from working-tree code.
     Executor should use these directly — no codebase exploration needed. -->

From scripts/kb-sync-db-source.cjs (verified anchors):

```javascript
// Line 103-110
const SUBTYPES = ['catpaw','connector','skill','catbrain','email-template','canvas'];

// Line 112-119
const SUBTYPE_SUBDIR = {
  catpaw: 'resources/catpaws',
  connector: 'resources/connectors',
  skill: 'resources/skills',
  catbrain: 'resources/catbrains',
  'email-template': 'resources/email-templates',
  canvas: 'resources/canvases',
};

// Line 355-374 — Pass 1 output
function buildIdMap(db, subtypesFilter) {
  // returns { rows: {subtype: row[]}, maps: {subtype: Map<id, shortIdSlug>} }
}

// Line 1401-1482 — writer (DO NOT modify — exclude happens UPSTREAM in populateFromDb)
function writeResourceFile(kbRoot, subtype, shortIdSlug, fm, body, opts) { ... }

// Line 1499-1607 — the function we extend
function populateFromDb(opts) {
  const { kbRoot, dryRun, verbose, only } = opts;
  const report = { created:0, updated:0, unchanged:0, orphans:0, skipped:0, files:[] };
  // ... line ~1526 — after buildIdMap: ADD archivedIds load
  // ... line 1534+ — Pass 2 loop: ADD exclude check
  // ... line 1576-1597 — orphan scan (unchanged)
  return report;
}

// Line 1613-1641 — _internal exports (ADD loadArchivedIds for tests)
module.exports = {
  populateFromDb,
  _internal: {
    // existing: buildIdMap, resolveShortIdSlug, loadCatPawRelations, ...
    // ADD: loadArchivedIds
  },
};
```

From scripts/kb-sync.cjs line 865-877 (dispatcher — unchanged in this plan):
```javascript
function main() {
  const args = process.argv.slice(2);
  if (args.includes('--full-rebuild')) return cmdFullRebuild(args);
  // ...
}
```

From app/src/lib/__tests__/kb-sync-db-source.test.ts line 92 (reusable fixture helper):
```typescript
export function createFixtureDb(dbPath: string): Database.Database
```
</interfaces>

<!-- CRITICAL CORRECTIONS from RESEARCH — supersede CONTEXT:
     1. `.docflow-legacy/` is SIBLING of `.docflow-kb/`, NOT nested.
        Use: path.resolve(kbRoot, '..', '.docflow-legacy', 'orphans')
        NOT: path.join(kbRoot, '.docflow-legacy', ...)
     2. Add NEW report field `skipped_archived` (do NOT reuse `skipped` which means "missing id/name"). -->
</context>

<tasks>

<task type="auto">
  <name>Task 1: git rm 10 archivos resucitados + commit atomic cleanup</name>
  <files>
    .docflow-kb/resources/catpaws/72ef0fe5-redactor-informe-inbound.md,
    .docflow-kb/resources/catpaws/7af5f0a7-lector-inbound.md,
    .docflow-kb/resources/catpaws/96c00f37-clasificador-inbound.md,
    .docflow-kb/resources/catpaws/98c3f27c-procesador-inbound.md,
    .docflow-kb/resources/catpaws/a56c8ee8-ejecutor-inbound.md,
    .docflow-kb/resources/catpaws/a78bb00b-maquetador-inbound.md,
    .docflow-kb/resources/canvases/5a56962a-email-classifier-pilot.md,
    .docflow-kb/resources/canvases/9366fa92-revision-diaria-inbound.md,
    .docflow-kb/resources/skills/4f7f5abf-leads-y-funnel-infoeduca.md,
    .docflow-kb/resources/connectors/conn-gma-info-educa360-gmail.md
  </files>
  <action>
    Ejecutar `git rm` de los 10 archivos resucitados listados en RESEARCH §5 "Impact Analysis" (también en CONTEXT §1). La lista EXACTA (verificada por `git ls-files .docflow-kb/resources/ | grep -E "(72ef0fe5|7af5f0a7|...)"`):

    ```bash
    cd /home/deskmath/docflow && git rm \
      .docflow-kb/resources/catpaws/72ef0fe5-redactor-informe-inbound.md \
      .docflow-kb/resources/catpaws/7af5f0a7-lector-inbound.md \
      .docflow-kb/resources/catpaws/96c00f37-clasificador-inbound.md \
      .docflow-kb/resources/catpaws/98c3f27c-procesador-inbound.md \
      .docflow-kb/resources/catpaws/a56c8ee8-ejecutor-inbound.md \
      .docflow-kb/resources/catpaws/a78bb00b-maquetador-inbound.md \
      .docflow-kb/resources/canvases/5a56962a-email-classifier-pilot.md \
      .docflow-kb/resources/canvases/9366fa92-revision-diaria-inbound.md \
      .docflow-kb/resources/skills/4f7f5abf-leads-y-funnel-infoeduca.md \
      .docflow-kb/resources/connectors/conn-gma-info-educa360-gmail.md
    ```

    Razón por la que es primer task (RESEARCH Open Question #3): limpiar árbol antes del fix garantiza que el rebuild verificatorio ejerza el código nuevo contra un estado coherente. Sin cleanup, el rebuild post-fix produciría un `diff` confuso (archivos presentes en resources + legacy, exclude list los ignora pero los archivos siguen ahí).

    Regenerar `_index.json` + `_header.md` tras el `git rm` NO lo hace este task — lo harán los rebuilds de Tasks 4-5. Entre este task y el fix, los 10 archivos NO deben volver (sería regresión).

    Commit atomic: `chore(157-01): remove 10 resurrected files (cleanup pre-fix)`.

    NO tocar `.docflow-legacy/orphans/**` — esos archivos son la fuente de verdad del estado "archivado".
  </action>
  <verify>
    <automated>cd /home/deskmath/docflow && git ls-files .docflow-kb/resources/ | grep -c -E "(72ef0fe5-redactor|7af5f0a7-lector|96c00f37-clasificador|98c3f27c-procesador|a56c8ee8-ejecutor|a78bb00b-maquetador|5a56962a-email-classifier|9366fa92-revision|4f7f5abf-leads|conn-gma-info-educa360)" | xargs -I{} test {} -eq 0 && echo OK</automated>
  </verify>
  <done>Los 10 archivos ya no aparecen en `git ls-files .docflow-kb/resources/`. Commit atomic creado. Los correspondientes files en `.docflow-legacy/orphans/**` siguen presentes (unchanged).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wave-0 RED tests — loadArchivedIds + populateFromDb excludes archived + --dry-run integration</name>
  <files>app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts</files>
  <behavior>
    - Test 1 — `loadArchivedIds(kbRoot) returns empty Set when legacy tree missing`: kbRoot apunta a tmpdir sin `.docflow-legacy/`, assert `loadArchivedIds(kbRoot).size === 0`.
    - Test 2 — `loadArchivedIds reads all 6 subdirs and returns Set<string>`: Crear fixture con `.docflow-legacy/orphans/catpaws/abc123-foo.md` + `.docflow-legacy/orphans/canvases/def456-bar.md`. Assert Set has `'catpaw:abc123-foo'` y `'canvas:def456-bar'`.
    - Test 3 — `populateFromDb excludes archived catpaw from Pass-2 write`: createFixtureDb con 1 catpaw row. Crear fixture KB con `.docflow-legacy/orphans/catpaws/<id8>-<slug>.md`. Correr populateFromDb. Assert: `report.skipped_archived === 1`, `report.created === 0`, archivo NO existe en `.docflow-kb/resources/catpaws/`.
    - Test 4 (integration) — `--dry-run log shows archived-skip count`: fixture con 1 archivo archived + 2 catpaws DB. Invocar el script via child_process con `--full-rebuild --source db --dry-run --verbose`. Assert stdout incluye `[archived-skip]` y `skipped_archived: 1` en el resumen final.

    Todos los tests deben FALLAR antes de Task 3 (RED). Task 3 los pone GREEN.
  </behavior>
  <action>
    Crear `app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` con 4 tests siguiendo el patrón de `kb-sync-db-source.test.ts`:

    1. Reutilizar `createFixtureDb` via `import { createFixtureDb } from './kb-sync-db-source.test'`.

    2. Crear helper local `createFixtureLegacy(kbRoot, layout)` que:
       - Crea `.docflow-legacy/orphans/<subdir>/<id>.md` con stub content `---\nid: ${id}\nstatus: active\n---\n`.
       - `layout` shape: `{catpaws?: string[], canvases?: string[], skills?: string[], connectors?: string[], 'email-templates'?: string[], catbrains?: string[]}`.

    3. Import del script via `const mod = require(path.resolve(REPO_ROOT, 'scripts/kb-sync-db-source.cjs'))`. Confirmar que `mod._internal.loadArchivedIds` existe (o fallará con "undefined is not a function" — correcto en RED).

    4. Test 4 usa `child_process.execFileSync('node', ['scripts/kb-sync.cjs', '--full-rebuild', '--source', 'db', '--dry-run', '--verbose'], {cwd: tmpRepo, env: {...process.env, KB_SYNC_REPO_ROOT: tmpRepo}})`.

    5. Path resolution: `REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..')`. Tests deben ejecutar `vitest run src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` desde `app/`.

    Usar `path.resolve(kbRoot, '..', '.docflow-legacy', 'orphans')` — SIBLING de kbRoot, NO nested (RESEARCH Pitfall 1).

    NO importar desde `scripts/` como ES module (es CJS). Siempre `require()`.
  </action>
  <verify>
    <automated>cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/kb-sync-rebuild-determinism.test.ts 2>&1 | grep -E "(FAIL|pass|fail)" | head -10</automated>
  </verify>
  <done>
    Archivo de test creado con 4 tests. Ejecutar `vitest run` muestra los 4 tests en estado FAIL (RED) con mensajes claros (por ejemplo "loadArchivedIds is not a function" o "archivedIds not excluded"). Los tests están listos para pasar a GREEN en Task 3.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Implementar loadArchivedIds + Pass-2 exclude + report.skipped_archived</name>
  <files>scripts/kb-sync-db-source.cjs</files>
  <behavior>
    Los 4 tests del Task 2 pasan a GREEN.
    - `loadArchivedIds(kbRoot)` implementada y exportada via `_internal`.
    - `populateFromDb` carga `archivedIds` tras `buildIdMap` (línea ~1526) antes del Pass-2 loop.
    - Pass-2 loop aplica `if (archivedIds.has(`${sub}:${shortIdSlug}`))` → `continue` + incrementa `report.skipped_archived` + log `console.warn('[archived-skip] ' + sub + '/' + shortIdSlug)` cuando `verbose`.
    - `report` inicializado con `skipped_archived: 0` (NUEVO field — no reusar `skipped`).
  </behavior>
  <action>
    Editar `scripts/kb-sync-db-source.cjs` con 3 cambios quirúrgicos:

    **Cambio 1** — Añadir helper `loadArchivedIds` (después de línea 255 — tras `loadCatPawRelations`, o justo antes de `slugify` línea 297). Código exacto (copiar de RESEARCH §Function Signature Proposals §A):

    ```javascript
    /**
     * Phase 157 KB-46 — scan .docflow-legacy/orphans/<subtype>/*.md and return
     * a Set of "<subtype>:<shortIdSlug>" keys to exclude from rebuild.
     *
     * Path: .docflow-legacy is a SIBLING of .docflow-kb (both under repo root),
     * so the legacy root is path.resolve(kbRoot, '..', '.docflow-legacy').
     *
     * Returns an empty Set if .docflow-legacy/orphans/ is missing or empty —
     * a missing legacy tree is a valid state (fresh repo, pre-Phase-156).
     */
    function loadArchivedIds(kbRoot) {
      const ids = new Set();
      const legacyRoot = path.resolve(kbRoot, '..', '.docflow-legacy', 'orphans');
      if (!fs.existsSync(legacyRoot)) return ids;
      for (const sub of SUBTYPES) {
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
    ```

    **Cambio 2** — En `populateFromDb` (línea 1499+):

    (a) Inicializar `report` con `skipped_archived: 0`. Busca la línea `const report = { created: 0, updated: 0, unchanged: 0, orphans: 0, skipped: 0, files: [] };` (alrededor de línea 1506-1510) y añade `skipped_archived: 0,` (antes de `files`).

    (b) Tras `buildIdMap` (alrededor línea 1526), antes del Pass-2 loop, añadir:
    ```javascript
    const archivedIds = loadArchivedIds(kbRoot);
    if (verbose && archivedIds.size > 0) {
      console.log(`[archived-ids] loaded ${archivedIds.size} entries from .docflow-legacy/orphans/`);
    }
    ```

    (c) Dentro del Pass-2 loop (línea 1534+), después de computar `shortIdSlug` y antes de `buildFrontmatter`, añadir:
    ```javascript
    if (archivedIds.has(`${sub}:${shortIdSlug}`)) {
      report.skipped_archived++;
      if (verbose) console.warn(`[archived-skip] ${sub}/${shortIdSlug}`);
      continue;
    }
    ```

    **Cambio 3** — Exportar `loadArchivedIds` via `_internal`. En el `module.exports` final (línea 1613-1641), añadir `loadArchivedIds` al objeto `_internal`:
    ```javascript
    module.exports = {
      populateFromDb,
      _internal: {
        // ...existing exports...
        loadArchivedIds,
      },
    };
    ```

    NO modificar `writeResourceFile` (línea 1401-1482) — la exclusion vive UPSTREAM en `populateFromDb`, NO en el writer (RESEARCH §Architecture Patterns "Anti-Patterns").

    NO modificar el orphan scan (línea 1576-1597) — sigue intacto, ahora será dormant (los archived no son escritos → no son "resurrected orphans").

    NO tocar `buildBody`, `buildFrontmatter`, `loadCatPawRelations`, `stripVolatile`, `detectBumpLevel` — esos cambios viven en Plan 02.
  </action>
  <verify>
    <automated>cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/kb-sync-rebuild-determinism.test.ts 2>&1 | grep -E "(pass|Test Files)"</automated>
  </verify>
  <done>
    Los 4 tests del Task 2 pasan a GREEN. `scripts/kb-sync-db-source.cjs` tiene el helper `loadArchivedIds` exportado vía `_internal`. `populateFromDb` aplica exclude con log WARN y `report.skipped_archived`. `writeResourceFile` sin modificar. El archivo compila (JS, no TS — verificación via `node -c scripts/kb-sync-db-source.cjs`).
  </done>
</task>

<task type="auto">
  <name>Task 4: Ejecutar --full-rebuild --source db + verificar Δ=0 counts vs DB</name>
  <files>.docflow-kb/_index.json, .docflow-kb/_header.md</files>
  <action>
    Ejecutar el rebuild real contra la DB live y verificar invariantes de KB-46 Success Criteria #2 (ROADMAP):

    ```bash
    cd /home/deskmath/docflow && DATABASE_PATH=/home/deskmath/docflow-data/docflow.db \
      node scripts/kb-sync.cjs --full-rebuild --source db --verbose
    ```

    Nota: `DATABASE_PATH` apunta a la DB Docker-mounted productiva (RESEARCH §Code Inventory + STATE Plan 155-03 Decision). Fallback `app/data/docflow.db` es fixture stale de 9 rows.

    Esperar en el resumen del script:
    - `skipped_archived: 10` (los 10 que Plan 01 Task 1 acaba de `git rm` siguen presentes en `.docflow-legacy/orphans/` y ahora son excluidos).
    - `created: 0` (no debería haber archivos nuevos — si hay, indica DB row sin archivo KB previo, investigar).
    - `orphans: 0` (los 10 resucitados ya no generan orphan warnings).

    Verificar invariante Δ=0 vs DB para las 6 entidades:
    ```bash
    # jq el _index.json counts
    jq '.header.counts' .docflow-kb/_index.json
    # Query DB counts
    sqlite3 /home/deskmath/docflow-data/docflow.db \
      "SELECT 'catpaws', COUNT(*) FROM cat_paws WHERE is_active=1; \
       SELECT 'connectors', COUNT(*) FROM connectors WHERE is_active=1; \
       SELECT 'skills', COUNT(*) FROM skills WHERE is_active=1; \
       SELECT 'catbrains', COUNT(*) FROM catbrains; \
       SELECT 'email-templates', COUNT(*) FROM email_templates; \
       SELECT 'canvases', COUNT(*) FROM canvases WHERE is_active=1;"
    ```

    Ambos outputs deben matchear Δ=0 para las 6 entidades: `catpaws_active`, `canvases_active`, `catbrains_active`, `skills_active`, `templates_active`, `connectors_active`.

    Si hay discrepancia (por ejemplo email-templates +1 delta), documentar pero NO bloquear — puede ser el KB-44 duplicate-mapping pathology deferido a v29.2 (STATE Decision [Phase 156]).

    Commit: `feat(157-01): exclusion list archivedIds + rebuild Δ=0 vs DB`.

    El cache in-memory de Docker container (`kb-index-cache` TTL 60s) NO se invalida aquí — queda para Plan 03 pre-oracle (`docker restart docflow-app`). El filesystem `.docflow-kb/**` SÍ está actualizado y committeado.
  </action>
  <verify>
    <automated>cd /home/deskmath/docflow && node -e "const idx=JSON.parse(require('fs').readFileSync('.docflow-kb/_index.json','utf8')); const c=idx.header.counts; console.log('counts:', JSON.stringify(c)); process.exit(c.catpaws_active>0 && c.canvases_active>=0 && c.skills_active>0 ? 0 : 1)"</automated>
  </verify>
  <done>
    Rebuild ejecutado sin errores. `.docflow-kb/_index.json.header.counts` matches DB row counts Δ=0 para al menos 5/6 entidades (si hay discrepancia, documentada como gap orthogonal no-blocker). Los 10 archivos archived NO reaparecieron en `.docflow-kb/resources/`. Log del rebuild muestra `skipped_archived: 10` (o ≥10 si otros archivos están en legacy). Commit creado.
  </done>
</task>

</tasks>

<verification>
- [ ] Los 10 archivos resucitados (listados en `files_modified`) ya no existen en `.docflow-kb/resources/**`.
- [ ] `git ls-files .docflow-legacy/orphans/` sigue listando los archivos archived (no se tocaron).
- [ ] `scripts/kb-sync-db-source.cjs` exporta `loadArchivedIds` via `_internal`.
- [ ] `populateFromDb` emite `[archived-skip]` warnings durante rebuild con `--verbose`.
- [ ] `report.skipped_archived` field presente en el resumen del rebuild.
- [ ] `npx vitest run src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` — 4/4 tests GREEN.
- [ ] `jq '.header.counts' .docflow-kb/_index.json` matches `SELECT COUNT(*)` de las 6 tablas DB con Δ=0 (o 5/6 con KB-44 duplicate-mapping como gap documentado).
</verification>

<success_criteria>
**KB-46 (parcial — exclusion list):**
- ✅ `loadArchivedIds(kbRoot) → Set<string>` implementada y retorna Set vacío si legacy tree missing.
- ✅ `populateFromDb` aplica O(1) exclude check en Pass-2 tras `buildIdMap`.
- ✅ Log `WARN [archived-skip]` cuando `verbose`.
- ✅ `report.skipped_archived` field separado de `report.skipped`.
- ✅ Rebuild post-fix no resucita ningún archivo archived: `git status` limpio respecto a `.docflow-kb/resources/**`.
- ✅ Counts post-rebuild matches DB Δ=0.

**NO cubierto aquí (pasa a Plan 02/03):**
- ❌ Body-section rendering de catpaws (KB-47 — Plan 02).
- ❌ Comando `--restore --from-legacy` (Plan 03).
- ❌ Docs §Rebuild Determinism en `_manual.md` (Plan 03).
- ❌ Oracle CatBot post-rebuild (Plan 03 — requiere docker restart para cache TTL).
</success_criteria>

<output>
After completion, create `.planning/phases/157-kb-rebuild-determinism/157-01-SUMMARY.md` documentando:
- Los 10 archivos eliminados con commit SHA de cleanup.
- Cambios en `scripts/kb-sync-db-source.cjs` (líneas añadidas: `loadArchivedIds` helper + Pass-2 exclude + `report.skipped_archived`).
- Tests creados en `kb-sync-rebuild-determinism.test.ts` (4 tests GREEN).
- Counts post-rebuild vs DB (tabla 6 entidades) + delta si existe (documentar como KB-44 gap si aplica).
- Commit SHA del rebuild final.
- Handoff a Plan 02: `buildBody(subtype, row, relations)` extension pending.
</output>
