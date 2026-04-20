---
phase: 157-kb-rebuild-determinism
plan: 03
type: execute
wave: 3
depends_on: ["157-01", "157-02"]
files_modified:
  - scripts/kb-sync.cjs
  - app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts
  - .docflow-kb/_manual.md
  - .planning/phases/157-kb-rebuild-determinism/157-VERIFICATION.md
autonomous: false
requirements: [KB-46, KB-47]
must_haves:
  truths:
    - "Nuevo subcomando CLI `--restore --from-legacy <id>` mueve archivo desde .docflow-legacy/orphans/ a .docflow-kb/resources/"
    - "Exit codes del --restore: 0 ok, 1 missing --from-legacy <id>, 2 ambiguous/not-found, 3 destination-conflict"
    - "Idempotencia Phase 150 KB-09 preservada: segundo rebuild sobre estado estable = 0 writes + N skipped_archived"
    - ".docflow-kb/_manual.md §Retention Policy gana sub-sección '### Rebuild Determinism (Phase 157)'"
    - "Docs documentan (a) rebuild no resucita archivados (b) exclusion signal = .docflow-legacy/orphans/ (c) --restore --from-legacy <id> es opt-in (d) git mv manual como history-preserving alternative"
    - "CatBot oracle 3/3 prompts con evidencia verbatim en 157-VERIFICATION.md"
    - "Prompt A: Operador Holded body cita 'Holded MCP' literal bajo '## Conectores vinculados'"
    - "Prompt B: counts KB vs DB matchean (list_cat_paws + search_kb)"
    - "Prompt C: CatBot describe archive semantics citando --restore --from-legacy"
  artifacts:
    - path: "scripts/kb-sync.cjs"
      provides: "cmdRestore + dispatcher branch for --restore"
      contains: "function cmdRestore"
    - path: ".docflow-kb/_manual.md"
      provides: "§Retention Policy > ### Rebuild Determinism (Phase 157) sub-sección"
      contains: "### Rebuild Determinism"
    - path: "app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts"
      provides: "4 tests adicionales: cmdRestore happy-path + 3 error cases + idempotence regression"
      min_lines: 230
    - path: ".planning/phases/157-kb-rebuild-determinism/157-VERIFICATION.md"
      provides: "Evidence CatBot oracle 3 prompts + counts table + checklist"
      min_lines: 80
  key_links:
    - from: "scripts/kb-sync.cjs main() dispatcher"
      to: "cmdRestore"
      via: "if (args.includes('--restore')) return cmdRestore(args)"
      pattern: "args\\.includes\\('--restore'\\)"
    - from: ".docflow-kb/_manual.md §Retention Policy"
      to: "§Rebuild Determinism sub-section"
      via: "markdown ### heading within existing ## Retention Policy"
      pattern: "### Rebuild Determinism"
    - from: "CatBot oracle (POST /api/catbot/chat)"
      to: "Updated KB (post-rebuild)"
      via: "docker restart docflow-app invalidates kb-index-cache TTL 60s"
      pattern: "docker restart"
---

<objective>
Cerrar el loop de lifecycle añadiendo el comando opt-in `--restore --from-legacy <id>`, documentar la semántica "archived = frozen" en `_manual.md`, correr el oracle CatBot 3 prompts post-rebuild+docker-restart, y capturar evidencia verbatim en `157-VERIFICATION.md`.

Purpose: Plan 01+02 dejan el código funcional; Plan 03 cierra operabilidad (CLI de rescate), documentabilidad (`_manual.md`), y verificabilidad (oracle CatBot según CLAUDE.md Protocolo). Sin este plan, hay regresiones latentes (cache Docker 60s) y el ciclo archive→restore no tiene vehículo explícito.

Output:
- `scripts/kb-sync.cjs` gana `cmdRestore(args, {kbRoot})` + branch en `main()` dispatcher (línea 865-877).
- Tests Wave-0 extendidos con 4 tests adicionales: restore happy-path + 3 error cases + idempotence regression.
- `.docflow-kb/_manual.md` §Retention Policy gana sub-sección `### Rebuild Determinism (Phase 157)` con cross-link al PRD §5.3.
- `docker restart docflow-app` ejecutado para invalidar `kb-index-cache` TTL 60s.
- CatBot oracle 3 prompts ejecutados vía `POST /api/catbot/chat`, evidencia verbatim en `157-VERIFICATION.md`.
- Checkpoint human-verify final confirma todo end-to-end.
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
@.planning/phases/157-kb-rebuild-determinism/157-02-SUMMARY.md
@scripts/kb-sync.cjs
@.docflow-kb/_manual.md

<interfaces>
<!-- CLI dispatcher to extend (scripts/kb-sync.cjs). Verified anchors: -->

```javascript
// Line 511-661
function cmdFullRebuild(args, { kbRoot = KB_ROOT } = {}) { ... }

// Line 667-770
function cmdAuditStale({ kbRoot = KB_ROOT } = {}) { ... }

// Line 771-813
function cmdArchive(args, { kbRoot = KB_ROOT } = {}) { ... }

// Line 814-864
function cmdPurge(args, { kbRoot = KB_ROOT } = {}) { ... }

// Line 865-877 — MAIN DISPATCHER (to extend)
function main() {
  const args = process.argv.slice(2);
  if (args.includes('--full-rebuild')) return cmdFullRebuild(args);
  if (args.includes('--audit-stale')) return cmdAuditStale();
  if (args.includes('--archive')) return cmdArchive(args);
  if (args.includes('--purge')) return cmdPurge(args);
  // ADD HERE: if (args.includes('--restore')) return cmdRestore(args);
  console.error('ERROR: unknown command');
  process.exit(1);
}
```

Exit codes convention (existing — Phase 150 KB-08):
- 0: ok
- 1: destructive-without-confirm / invalid dispatch
- 2: invalid --only subtype / invalid args
- 3: DB load fail / module load fail

Phase 157 cmdRestore extends convention:
- 0: ok (file moved)
- 1: missing `--from-legacy <id>` or no arg after flag
- 2: `<id>.md` not found anywhere OR found in >1 subdir (ambiguous)
- 3: destination already exists in `resources/` (conflict)

From .docflow-kb/_manual.md (existing structure):

```markdown
## Retention Policy (Phase 156)

[existing content — lifecycle tables, archive workflow, purge policy]

[INSERT HERE at end of §Retention Policy:]

### Rebuild Determinism (Phase 157)

[new sub-section]
```
</interfaces>

<!-- CRITICAL from RESEARCH:
     - cmdRestore uses fs.renameSync (atomic, simple). Document git mv as history-preserving alternative.
     - Docker container has kb-index-cache TTL 60s → must `docker restart docflow-app` to make CatBot see updated KB.
     - NO Docker REBUILD needed (script .cjs runs on host, .docflow-kb mounted via volume :rw). -->
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED tests — cmdRestore happy-path + 3 error cases + idempotence regression</name>
  <files>app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts</files>
  <behavior>
    Añadir 4 tests al archivo existente:

    - Test G — `cmdRestore happy path`: Fixture con `.docflow-legacy/orphans/catpaws/abc123-foo.md`. Invocar script con `--restore --from-legacy abc123-foo`. Assert: exit 0, archivo ahora existe en `.docflow-kb/resources/catpaws/abc123-foo.md` y NO en legacy, stdout contiene "RESTORED:".

    - Test H — `cmdRestore missing args`: Invocar sin `--from-legacy`: `--restore` → exit 1 + stderr contiene "requires --from-legacy". Invocar con `--restore --from-legacy` (sin valor) → exit 1.

    - Test I — `cmdRestore ambiguous/not-found`: (a) `.docflow-legacy/` vacío, invocar con id random → exit 2 + stderr "not found". (b) Crear `.docflow-legacy/orphans/catpaws/X.md` Y `.docflow-legacy/orphans/canvases/X.md` (mismo id en 2 subdirs), invocar `--restore --from-legacy X` → exit 2 + stderr "ambiguous".

    - Test J — `cmdRestore destination conflict`: Crear `.docflow-legacy/orphans/catpaws/dup-id.md` Y `.docflow-kb/resources/catpaws/dup-id.md` (destination ya existe). Invocar `--restore --from-legacy dup-id` → exit 3 + stderr "already exists".

    - Test K — `Idempotence regression (second rebuild zero writes)`: Setup fixture DB + legacy + run `populateFromDb` (primera corrida = backfill). Run `populateFromDb` DE NUEVO sin cambios. Assert: segundo run `report.updated === 0`, `report.unchanged >= N`, `report.skipped_archived` igual que primer run. Este test es regression guard para Phase 150 KB-09 tras los cambios del Plan 02 (body-sections).

    Todos los tests deben fallar en RED (cmdRestore aún no existe).
  </behavior>
  <action>
    Añadir 5 tests (G-K) al archivo `app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts`.

    Para Tests G-J (CLI integration):
    - Usar `child_process.execFileSync('node', ['scripts/kb-sync.cjs', '--restore', '--from-legacy', '<id>'], {cwd: tmpRepo, env: {...process.env, KB_SYNC_REPO_ROOT: tmpRepo}})` con `try/catch` para capturar exit code via `error.status`.
    - Crear fixture KB tree: `tmpRepo/.docflow-kb/resources/catpaws/` + `tmpRepo/.docflow-legacy/orphans/catpaws/`.
    - Copiar `scripts/kb-sync.cjs` + `scripts/kb-sync-db-source.cjs` al `tmpRepo/scripts/` antes de ejecutar (patrón establecido en `kb-sync-db-source.test.ts`).

    Para Test K (integration idempotence):
    - Reutilizar `createFixtureDb` con DB que tenga 2 catpaws (1 archived via legacy setup, 1 active).
    - Primera corrida: capture `report1 = populateFromDb(...)`.
    - Segunda corrida inmediata: `report2 = populateFromDb(...)`.
    - Assert: `report2.updated === 0`, `report2.created === 0`, `report2.unchanged >= 1`, `report2.skipped_archived === report1.skipped_archived`.

    **CRITICAL — exit code capture pattern:**
    ```typescript
    let exitCode = 0;
    let stderr = '';
    try {
      execFileSync('node', [...], { cwd: tmpRepo, encoding: 'utf8' });
    } catch (e: any) {
      exitCode = e.status;
      stderr = e.stderr?.toString() ?? '';
    }
    expect(exitCode).toBe(1); // or 2 or 3
    expect(stderr).toMatch(/requires --from-legacy/);
    ```
  </action>
  <verify>
    <automated>cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/kb-sync-rebuild-determinism.test.ts -t "restore|Idempotence" 2>&1 | grep -E "(fail|pass)"</automated>
  </verify>
  <done>
    5 tests nuevos (G-K) añadidos. Ejecutar `vitest run` muestra los nuevos en FAIL (RED). Los 10 tests de Plans 01-02 siguen GREEN (no regresión).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implementar cmdRestore + dispatcher branch en scripts/kb-sync.cjs</name>
  <files>scripts/kb-sync.cjs</files>
  <behavior>
    Los 5 tests (G-K) del Task 1 pasan a GREEN:
    - `cmdRestore(args, {kbRoot})` implementada siguiendo RESEARCH §Function Signature Proposals §C.
    - Branch añadida al dispatcher `main()` antes de los "unknown command" fallback.
    - Exit codes 0/1/2/3 según spec (§D de RESEARCH).
    - Uses `fs.renameSync` (atomic, portable).
  </behavior>
  <action>
    Editar `scripts/kb-sync.cjs`:

    **Cambio 1** — Añadir función `cmdRestore` (después de `cmdPurge` línea 814-864, antes de `function main()` línea 865). Código EXACTO desde RESEARCH §Function Signature Proposals §C:

    ```javascript
    /**
     * Phase 157 KB-46 — opt-in command to move a single file from
     * .docflow-legacy/orphans/<subtype>/ back into .docflow-kb/resources/<subtype>/
     * so the next --full-rebuild --source db will include it again.
     *
     * Usage:
     *   node scripts/kb-sync.cjs --restore --from-legacy <id>
     *
     * Where <id> is the short-id-slug (basename without .md), unambiguous across
     * subtypes since the script scans all 6 subdirs and expects exactly one match.
     *
     * Exit codes:
     *   0  ok
     *   1  missing --from-legacy <id> or no arg after flag
     *   2  id not found anywhere OR found in >1 subdir (ambiguous)
     *   3  destination already exists in resources/ (conflict)
     */
    function cmdRestore(args, { kbRoot = KB_ROOT } = {}) {
      const fromIdx = args.indexOf('--from-legacy');
      if (fromIdx === -1 || !args[fromIdx + 1]) {
        console.error('ERROR: --restore requires --from-legacy <id>');
        console.error('Usage: node scripts/kb-sync.cjs --restore --from-legacy <id>');
        process.exit(1);
      }
      const targetId = args[fromIdx + 1];
      const legacyRoot = path.resolve(kbRoot, '..', '.docflow-legacy', 'orphans');
      if (!fs.existsSync(legacyRoot)) {
        console.error(`ERROR: legacy root not found: ${legacyRoot}`);
        process.exit(2);
      }

      const matches = [];
      const SUBDIR_NAMES = ['catpaws','connectors','skills','catbrains','email-templates','canvases'];
      for (const name of SUBDIR_NAMES) {
        const dir = path.join(legacyRoot, name);
        if (!fs.existsSync(dir)) continue;
        const fpath = path.join(dir, `${targetId}.md`);
        if (fs.existsSync(fpath)) matches.push({ subdir: name, fpath });
      }
      if (matches.length === 0) {
        console.error(`ERROR: ${targetId}.md not found in .docflow-legacy/orphans/*/`);
        process.exit(2);
      }
      if (matches.length > 1) {
        console.error(`ERROR: ambiguous id — found in ${matches.length} subdirs: ${matches.map(m=>m.subdir).join(', ')}`);
        process.exit(2);
      }

      const [{ subdir, fpath }] = matches;
      const destDir = path.join(kbRoot, 'resources', subdir);
      const destPath = path.join(destDir, `${targetId}.md`);
      if (fs.existsSync(destPath)) {
        console.error(`ERROR: destination already exists (conflict): ${destPath}`);
        console.error('HINT: git rm that file first, then retry --restore.');
        process.exit(3);
      }

      fs.mkdirSync(destDir, { recursive: true });
      fs.renameSync(fpath, destPath);
      console.log(`RESTORED: .docflow-legacy/orphans/${subdir}/${targetId}.md → resources/${subdir}/${targetId}.md`);
      console.log('NEXT: run `node scripts/kb-sync.cjs --full-rebuild --source db` to re-index.');
    }
    ```

    **Cambio 2** — Extender `main()` dispatcher (línea 865-877). Añadir ANTES de la rama "unknown command":

    ```javascript
    if (args.includes('--restore')) return cmdRestore(args);
    ```

    El orden recomendado:
    ```javascript
    function main() {
      const args = process.argv.slice(2);
      if (args.includes('--full-rebuild')) return cmdFullRebuild(args);
      if (args.includes('--audit-stale')) return cmdAuditStale();
      if (args.includes('--archive')) return cmdArchive(args);
      if (args.includes('--purge')) return cmdPurge(args);
      if (args.includes('--restore')) return cmdRestore(args);   // Phase 157
      console.error('ERROR: unknown command');
      process.exit(1);
    }
    ```

    NO usar `git mv` via `execSync` — `fs.renameSync` es portable y no depende de git disponible (RESEARCH §Don't Hand-Roll). El operador puede hacer `git mv` manualmente antes de committear si quiere preservar historial; documentado en `_manual.md` (Task 3).
  </action>
  <verify>
    <automated>cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/kb-sync-rebuild-determinism.test.ts 2>&1 | grep -E "Test Files"</automated>
  </verify>
  <done>
    Los 15 tests del archivo (4 Plan 01 + 6 Plan 02 + 5 Plan 03) están en GREEN. `scripts/kb-sync.cjs` tiene `cmdRestore` + branch en `main()`. `node -c scripts/kb-sync.cjs` exit 0. `node scripts/kb-sync.cjs --restore` sin args → exit 1 con mensaje claro.
  </done>
</task>

<task type="auto">
  <name>Task 3: Documentar §Rebuild Determinism en .docflow-kb/_manual.md</name>
  <files>.docflow-kb/_manual.md</files>
  <action>
    Editar `.docflow-kb/_manual.md` añadiendo una sub-sección al final de `## Retention Policy (Phase 156)` (línea ~104+).

    Localizar el final de `## Retention Policy (Phase 156)` (antes del próximo `## ...` heading de nivel 2). Insertar:

    ```markdown

    ### Rebuild Determinism (Phase 157)

    A partir de Phase 157, el comando `node scripts/kb-sync.cjs --full-rebuild --source db` es **determinístico respecto al estado de lifecycle**:

    1. **No resucita archivados.** El script carga al iniciar la lista de archivos en `.docflow-legacy/orphans/<subtype>/*.md` y los excluye del Pass-2 DB-row iteration. Aunque la fila DB correspondiente siga activa, si el archivo está archivado el rebuild emite `WARN [archived-skip] <subtype>/<id>-<slug>` y NO reescribe en `resources/`.

    2. **Señal de archivado permanente.** Un archivo presente en `.docflow-legacy/orphans/<subtype>/<id>-<slug>.md` es la señal permanente: está fuera del ciclo automático hasta que el operador lo re-admita explícitamente. No hay timeout ni auto-restore.

    3. **Re-admisión opt-in: `--restore --from-legacy <id>`.** Para re-admitir un archivo archivado al ciclo de sync, usar:

       ```bash
       node scripts/kb-sync.cjs --restore --from-legacy <short-id-slug>
       # Ejemplo: --restore --from-legacy 72ef0fe5-redactor-informe-inbound
       ```

       El comando mueve el archivo desde `.docflow-legacy/orphans/<subtype>/<id>.md` a `.docflow-kb/resources/<subtype>/<id>.md` via `fs.renameSync` (atómico, portable). Tras el restore, correr `--full-rebuild --source db` para re-indexar.

       **Exit codes del `--restore`:**
       - `0` — archivo movido correctamente.
       - `1` — missing `--from-legacy <id>`.
       - `2` — id no encontrado en ningún subdir, o ambiguo (presente en >1 subdir).
       - `3` — destination conflict (archivo ya existe en `resources/`; hacer `git rm` primero).

    4. **Preservación de historial git (opcional).** `--restore` usa `fs.renameSync` y pierde la cadena de `git log --follow` al reubicar. Para preservar historial, el operador puede hacer manualmente:

       ```bash
       git mv .docflow-legacy/orphans/<subtype>/<id>.md .docflow-kb/resources/<subtype>/<id>.md
       node scripts/kb-sync.cjs --full-rebuild --source db
       ```

       en vez del comando `--restore`. Ambos flujos producen el mismo estado final.

    5. **Body-sections en rebuild.** Desde Phase 157-02, `buildBody(subtype, row, relations)` renderiza secciones `## Conectores vinculados` y `## Skills vinculadas` en CatPaws durante `--full-rebuild --source db`, byte-equivalentes al runtime path (`syncResource('catpaw','update')` de `knowledge-sync.ts`). Esto cierra el drift heredado Phase 156-02 donde sólo los CatPaws editados post-despliegue tenían las secciones.

    **Cross-links:**
    - PRD §5.3 Lifecycle — `.planning/ANALYSIS-knowledge-base-architecture.md` §5.3.
    - Phase 156-03 orphan audit — `.planning/phases/156-kb-runtime-integrity/156-03-ORPHAN-AUDIT.md`.
    - Phase 157 root cause — `.planning/phases/157-kb-rebuild-determinism/157-CONTEXT.md`.
    ```

    La sub-sección debe ir DENTRO de `## Retention Policy (Phase 156)`, NO como nuevo `## ...` heading de nivel 2 (RESEARCH Open Question #4 + Claude's Discretion: sub-sección por cohesión).

    Commit: `docs(157-03): document rebuild determinism + --restore --from-legacy in _manual.md`.

    NO modificar el `## Retention Policy (Phase 156)` existente — sólo añadir sub-sección al final.
  </action>
  <verify>
    <automated>cd /home/deskmath/docflow && grep -q "### Rebuild Determinism" .docflow-kb/_manual.md && grep -q "\-\-restore \-\-from-legacy" .docflow-kb/_manual.md && grep -q "fs.renameSync" .docflow-kb/_manual.md && echo OK</automated>
  </verify>
  <done>
    `.docflow-kb/_manual.md` contiene sub-sección `### Rebuild Determinism (Phase 157)` dentro de `## Retention Policy (Phase 156)`. Sub-sección cubre los 5 puntos (no resucitación, señal, --restore, git mv manual, body-sections). Cross-links a PRD §5.3 + Phase 156-03 + 157-CONTEXT incluidos. Commit creado.
  </done>
</task>

<task type="auto">
  <name>Task 4: Docker restart + ejecutar oracle CatBot 3 prompts + capturar evidencia</name>
  <files>.planning/phases/157-kb-rebuild-determinism/157-VERIFICATION.md</files>
  <action>
    **Paso 1 — Invalidar cache Docker:**

    El container `docflow-app` cachea `_index.json` + frontmatter en `kb-index-cache` con TTL 60s (sin endpoint HTTP de invalidación). Tras los rebuilds de Plan 02, el filesystem está actualizado pero el container ve el índice viejo hasta que expire el TTL o se haga restart.

    ```bash
    docker restart docflow-app
    # Espera ~8-10s hasta que instrumentación.ts re-inicie servicios
    ```

    NO hace falta Docker REBUILD (script `.cjs` corre en host, `.docflow-kb` montado `:rw` — MEMORY.md + STATE Decision Phase 152-04).

    **Paso 2 — Ejecutar 3 prompts oracle via POST /api/catbot/chat:**

    Usar `curl` o herramienta equivalente. Cada prompt en sesión nueva (no concatenado). Capturar response completo (respuesta + tool_calls) verbatim.

    **Prompt A — Body sections (KB-47):**
    ```
    Dame el `get_kb_entry` del CatPaw "Operador Holded" y léeme las secciones
    "## Conectores vinculados" y "## Skills vinculadas" del body.
    ```
    Criterio de éxito: response cita literal "Holded MCP" con su UUID entre backticks, bajo `## Conectores vinculados`. Si hay skills linked, al menos una skill bajo `## Skills vinculadas`.

    **Prompt B — Counts parity (KB-46):**
    ```
    ¿Cuántos CatPaws activos hay en el KB según search_kb, y cuántos en la DB
    según list_cat_paws? Confirma que coinciden.
    ```
    Criterio de éxito: tool_calls incluye `search_kb({type:'resource',subtype:'catpaw',status:'active'})` + `list_cat_paws()`. Response confirma match numérico (ambos === 39, o el count real actual, con Δ=0).

    **Prompt C — Archive semantics (KB-46):**
    ```
    ¿Si un archivo del KB está archivado en `.docflow-legacy/orphans/`, el
    comando `--full-rebuild --source db` lo resucita automáticamente? ¿Cómo
    lo re-admito al ciclo de sync si fue archivado por error?
    ```
    Criterio de éxito: response dice claramente "NO lo resucita" y describe `--restore --from-legacy <id>` como el vehículo opt-in. Tool_calls incluyen `search_kb({tags:['retention']})` o `get_kb_entry({id: '<manual-id>'})` para citar `_manual.md §Rebuild Determinism`.

    **Paso 3 — Crear `.planning/phases/157-kb-rebuild-determinism/157-VERIFICATION.md`:**

    Estructura del archivo:

    ```markdown
    ---
    phase: 157-kb-rebuild-determinism
    verified: 2026-04-20
    requirements: [KB-46, KB-47]
    oracle_prompts_passed: 3/3
    ---

    # Phase 157 — VERIFICATION

    ## KB-46 — Rebuild Determinism

    ### Success Criteria Checklist
    - [x] loadArchivedIds implemented + Pass-2 exclude (Plan 01)
    - [x] Counts Δ=0 vs DB (6 entities) — table below
    - [x] --restore --from-legacy CLI (Plan 03 Task 2)
    - [x] §Rebuild Determinism in _manual.md (Plan 03 Task 3)
    - [x] Oracle Prompt B passed — counts match (evidence below)
    - [x] Oracle Prompt C passed — archive semantics described (evidence below)

    ### Counts Parity (KB vs DB)

    | Entity | KB count | DB count | Δ |
    |--------|----------|----------|---|
    | catpaws_active | 39 | 39 | 0 |
    | canvases_active | 1 | 1 | 0 |
    | catbrains_active | 3 | 3 | 0 |
    | skills_active | 43 | 43 | 0 |
    | templates_active | 15 | 15 | 0 |
    | connectors_active | 12 | 12 | 0 |

    (Ajustar a counts reales post-rebuild).

    ## KB-47 — Body-Section Rendering

    ### Success Criteria Checklist
    - [x] buildBody(subtype, row, relations) 3-arg signature (Plan 02)
    - [x] renderLinkedSectionCjs + splitRelationsBySubtype helpers (Plan 02)
    - [x] Operador Holded body contains "## Conectores vinculados" + "Holded MCP"
    - [x] Idempotence preserved (2nd run = 0 writes)
    - [x] Oracle Prompt A passed (evidence below)

    ## Oracle Evidence (verbatim)

    ### Prompt A — Body sections

    **Request:**
    [prompt literal]

    **CatBot response (verbatim):**
    [paste response]

    **Tool calls:**
    [paste tool_calls array]

    ### Prompt B — Counts parity
    [same structure]

    ### Prompt C — Archive semantics
    [same structure]

    ## Tests Status

    - `npx vitest run src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` — 15/15 GREEN.
    - Full suite `npx vitest run src/lib/__tests__/` — no regressions.

    ## Sign-off

    Phase 157 ready for `/gsd:verify-phase 157` → `/gsd:complete-phase 157` → `/gsd:complete-milestone v29.1`.
    ```

    Commit: `docs(157-03): oracle 3/3 passed + 157-VERIFICATION.md evidence`.
  </action>
  <verify>
    <automated>cd /home/deskmath/docflow && test -f .planning/phases/157-kb-rebuild-determinism/157-VERIFICATION.md && grep -q "oracle_prompts_passed: 3/3" .planning/phases/157-kb-rebuild-determinism/157-VERIFICATION.md && grep -q "Prompt A" .planning/phases/157-kb-rebuild-determinism/157-VERIFICATION.md && echo OK</automated>
  </verify>
  <done>
    Docker restarted. 3 oracle prompts ejecutados exitosamente (3/3). Evidencia verbatim capturada en `157-VERIFICATION.md` con response + tool_calls. Counts table con Δ=0. Checklist KB-46 + KB-47 tick-verde. Tests 15/15 GREEN documentados. Commit creado.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 5: Human checkpoint — confirmar evidencia oracle + phase readiness</name>
  <files>.planning/phases/157-kb-rebuild-determinism/157-VERIFICATION.md</files>
  <action>
    CHECKPOINT gate — pausa el plan hasta que el humano revise la evidencia oracle y confirme phase-readiness. Este task NO automatiza nada; simplemente presenta los verificables que Tasks 1-4 produjeron y espera "approved" o una descripción de issue.

    === LO QUE CONSTRUYERON PLANS 01-03 (RECAP) ===

    - **Plan 157-01:** 10 archivos resucitados eliminados via `git rm` + exclusion list en `populateFromDb` + `report.skipped_archived` + rebuild Δ=0 vs DB.
    - **Plan 157-02:** `renderLinkedSectionCjs` + `splitRelationsBySubtype` helpers + `buildBody(subtype, row, relations)` 3-arg signature + Operador Holded CatPaw `.md` tiene secciones canónicas vinculadas.
    - **Plan 157-03 Tasks 1-4:** `cmdRestore` CLI + dispatcher branch + `_manual.md §Rebuild Determinism` + Docker restart + oracle 3/3 prompts + `157-VERIFICATION.md` evidence file.

    Total: 15 tests GREEN en `kb-sync-rebuild-determinism.test.ts` (4 Plan 01 + 6 Plan 02 + 5 Plan 03).

    === PASOS QUE DEBE EJECUTAR EL HUMANO ===

    1. **Revisar `.planning/phases/157-kb-rebuild-determinism/157-VERIFICATION.md`** y confirmar:
       - Counts table: Δ=0 para al menos 5/6 entidades (email-templates +1 es KB-44 deferred, aceptable si documentado).
       - Prompt A response cita "Holded MCP" literal con UUID completa entre backticks.
       - Prompt B response confirma counts matching (KB vs DB invocando `search_kb` + `list_cat_paws`).
       - Prompt C response describe `--restore --from-legacy` como el vehículo opt-in + "archivado = frozen".

    2. **Verificar manualmente con `curl` uno de los 3 prompts** (opcional — redundancia si se quiere re-verificar):
       ```bash
       curl -X POST http://localhost:3500/api/catbot/chat \
         -H 'Content-Type: application/json' \
         -d '{"message":"¿Cuántos CatPaws activos hay en el KB?","sessionId":"oracle-test-157"}'
       ```

    3. **Verificar estado del working tree:**
       ```bash
       cd /home/deskmath/docflow && git status .docflow-kb/ .docflow-legacy/
       # Esperado: clean o sólo con _index.json / _header.md / _manual.md (committeados en tasks previos)
       ls .docflow-legacy/orphans/catpaws/ | wc -l   # ≥ 8 (Plan 01 cleanup archivó los 10; 8 son catpaws)
       ```

    4. **Inspeccionar un CatPaw con connectors linked** para confirmar body format:
       ```bash
       cat .docflow-kb/resources/catpaws/*operador-holded*.md | head -80
       # Debe contener: '## Conectores vinculados' + '- **Holded MCP** (`<UUID>`)'
       ```

    5. **Correr test suite completa:**
       ```bash
       cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/ --reporter=dot
       # Esperado: 15/15 en kb-sync-rebuild-determinism + 0 regressions en el resto
       ```

    === DECISIÓN DEL HUMANO ===

    - **"approved"** — todos los verificables OK. Marcar Phase 157 como plans-complete. Siguiente paso: `/gsd:verify-phase 157` → `/gsd:complete-phase 157` → `/gsd:complete-milestone v29.1` (cierra milestone).
    - **"issue: <descripción>"** — describir qué falló. El orchestrador creará gap closure plan si es necesario.
  </action>
  <verify>
    <automated>cd /home/deskmath/docflow && test -f .planning/phases/157-kb-rebuild-determinism/157-VERIFICATION.md && grep -q "Prompt A" .planning/phases/157-kb-rebuild-determinism/157-VERIFICATION.md && grep -q "Prompt B" .planning/phases/157-kb-rebuild-determinism/157-VERIFICATION.md && grep -q "Prompt C" .planning/phases/157-kb-rebuild-determinism/157-VERIFICATION.md && echo OK</automated>
  </verify>
  <done>
    Humano confirma "approved" tras revisar `157-VERIFICATION.md` + verificaciones manuales opcionales. Phase 157 queda en estado plans-complete, ready para `/gsd:verify-phase 157`.
  </done>
</task>

</tasks>

<verification>
- [ ] `scripts/kb-sync.cjs` contiene `function cmdRestore` + branch en `main()`.
- [ ] Exit codes `--restore`: 0 (ok), 1 (missing arg), 2 (not-found/ambiguous), 3 (conflict).
- [ ] `.docflow-kb/_manual.md` §Retention Policy contiene sub-sección `### Rebuild Determinism (Phase 157)` con los 5 puntos (no-resurrect, signal, --restore, git mv opcional, body-sections).
- [ ] Cross-links a PRD §5.3 + Phase 157-CONTEXT en docs.
- [ ] `docker restart docflow-app` ejecutado.
- [ ] 3 oracle prompts ejecutados vía POST /api/catbot/chat.
- [ ] `157-VERIFICATION.md` creado con evidencia verbatim (response + tool_calls) + counts table.
- [ ] 15/15 tests GREEN en `kb-sync-rebuild-determinism.test.ts`.
- [ ] Human checkpoint aprobado.
</verification>

<success_criteria>
**KB-46 (cerrado completo):**
- ✅ `loadArchivedIds` + Pass-2 exclude (Plan 01).
- ✅ `--restore --from-legacy <id>` opt-in (Plan 03).
- ✅ `_manual.md §Rebuild Determinism` documenta flujo completo.
- ✅ Oracle Prompt B confirms counts parity KB vs DB.
- ✅ Oracle Prompt C confirms archive semantics.

**KB-47 (cerrado completo):**
- ✅ `buildBody(subtype, row, relations)` 3-arg signature (Plan 02).
- ✅ Operador Holded body tiene secciones canónicas (Plan 02 verified).
- ✅ Oracle Prompt A cita "Holded MCP" bajo `## Conectores vinculados`.
- ✅ Idempotencia Phase 150 KB-09 preservada (Plan 03 Task 1 Test K).

**Phase 157 ready for `/gsd:verify-phase 157`:**
- ✅ Todos los success criteria del ROADMAP §Phase 157 cumplidos (7/7).
- ✅ CatBot oracle 3/3 prompts passed según CLAUDE.md Protocolo.
- ✅ Human checkpoint aprobado.
</success_criteria>

<output>
After completion, create `.planning/phases/157-kb-rebuild-determinism/157-03-SUMMARY.md` documentando:
- Cambios en `scripts/kb-sync.cjs` (cmdRestore + dispatcher branch).
- Cambios en `.docflow-kb/_manual.md` (sub-sección §Rebuild Determinism).
- Tests añadidos (5 en Plan 03 Task 1, total 15).
- Oracle evidence reference (link a `157-VERIFICATION.md`).
- Phase 157 closure status — ready para `/gsd:verify-phase 157` → `/gsd:complete-phase 157` → `/gsd:complete-milestone v29.1`.
</output>
