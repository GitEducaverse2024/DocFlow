---
phase: 156-kb-runtime-integrity
plan: 03
type: execute
wave: 2
depends_on: [156-01, 156-02]
autonomous: false
requirements: [KB-43]
files_modified:
  - .docflow-kb/_manual.md
  - .docflow-legacy/orphans/catpaws/
  - .docflow-legacy/orphans/skills/
  - .docflow-legacy/orphans/canvases/
  - .docflow-legacy/orphans/email-templates/
  - .docflow-legacy/orphans/connectors/
  - .docflow-legacy/orphans/catbrains/
  - .docflow-kb/_index.json
  - .docflow-kb/_header.md
  - .planning/phases/156-kb-runtime-integrity/156-03-ORPHAN-AUDIT.md
must_haves:
  truths:
    - "scripts/kb-sync.cjs --full-rebuild --source db --dry-run reporta los orphans reales (34 active + 6 deprecated per RESEARCH §E — NO los 10 que dice el brief)"
    - "Para cada entidad: count de `status: active` .md files en .docflow-kb/resources/<entidad>/ = SELECT COUNT(*) FROM <tabla> en la DB productiva (/home/deskmath/docflow-data/docflow.db)"
    - ".docflow-legacy/orphans/<entity>/ contiene los archivos orphan movidos (preservan historial git via git mv)"
    - ".docflow-kb/_manual.md contiene una sección '## Retention Policy' con las 4 dimensiones (max-age-deprecated, archive-vs-purge-threshold, manual-vs-automated-pruning, orphan-detection-cadence)"
    - "scripts/validate-kb.cjs exit 0 sobre el KB post-cleanup"
  artifacts:
    - path: ".docflow-kb/_manual.md"
      provides: "Nueva sección ## Retention Policy (Phase 156) ≤30 líneas con tabla de 4 dimensiones"
      contains: "Retention Policy"
    - path: ".docflow-legacy/orphans/catpaws/"
      provides: "Directorio con 11 active + 2 deprecated orphans movidos via git mv (total 13 archivos)"
      min_lines: 0
    - path: ".docflow-legacy/orphans/skills/"
      provides: "Directorio con 21 active orphans (mayoría slug-truncated legacy de Phase 150)"
      min_lines: 0
    - path: ".docflow-legacy/orphans/canvases/"
      provides: "Directorio con 2 active orphans (5a56962a-email-classifier-pilot, 9366fa92-revision-diaria-inbound)"
      min_lines: 0
    - path: ".docflow-legacy/orphans/email-templates/"
      provides: "Directorio con 1 deprecated orphan (720870b0-recordatorio-fichaje-semanal)"
      min_lines: 0
    - path: ".docflow-legacy/orphans/connectors/"
      provides: "Directorio con 2 deprecated orphans (755315db-test-slack-webhook, conn-gma-info-educa360-gmail)"
      min_lines: 0
    - path: ".docflow-legacy/orphans/catbrains/"
      provides: "Directorio con 1 deprecated orphan (a91ed58a-conocimiento-fichajes-holded)"
      min_lines: 0
    - path: ".planning/phases/156-kb-runtime-integrity/156-03-ORPHAN-AUDIT.md"
      provides: "Audit snapshot con el count real per-entidad (pre/post cleanup) y lista verbatim de archivos movidos"
      min_lines: 40
  key_links:
    - from: "post-cleanup KB state"
      to: "DB row counts"
      via: "grep -l '^status: active' .docflow-kb/resources/<entity>/*.md | wc -l == SELECT COUNT(*) FROM <table>"
      pattern: "active count = db count"
    - from: ".docflow-kb/_manual.md §Retention Policy"
      to: "kb-sync.cjs CLI commands"
      via: "cheat-sheet table con los comandos exactos"
      pattern: "kb-sync\\.cjs --audit-stale|--archive --confirm|--purge --confirm"
---

<objective>
Cerrar el gap KB-43: los 40 archivos orphan acumulados en `.docflow-kb/resources/` (34 active + 6 deprecated, per RESEARCH §E verificado contra la DB live 2026-04-20) quedan triados, movidos a `.docflow-legacy/orphans/<entity>/` preservando historial git, y el `_manual.md` gana una sección §Retention Policy que documenta cuándo pasa un archivo de active → deprecated → archived → purged, tanto para el ciclo de tiempo (ya cubierto por §Lifecycle) como para el caso orphan (nuevo en Phase 156).

Purpose: Sanear el KB de residuos de Phase 150 bootstrap (slug-truncated legacy IDs) + canvases creados pre-Phase-156-01 hooks + entidades borradas en tiempos anteriores al ciclo de hooks. Post-plan, el claim "active KB count per entity = DB row count" es verdadero por primera vez.

Output: 40 archivos movidos via git mv a `.docflow-legacy/orphans/`, 1 sección nueva en `_manual.md`, 1 audit snapshot `156-03-ORPHAN-AUDIT.md`, `_index.json` + `_header.md` regenerados. Operacional, no TDD (no hay código productivo nuevo). Checkpoint:human-verify al final por la oracle de CatBot (CLAUDE.md mandate).

NOTA IMPORTANTE: El roadmap brief menciona "10 orphans" — RESEARCH §E verificó contra la DB productiva (`/home/deskmath/docflow-data/docflow.db`) y el count real es **40 orphans (34 active + 6 deprecated)**. Este plan honra el count real, no el del brief. El snapshot `156-03-ORPHAN-AUDIT.md` documenta ambos para trazabilidad.
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

# Plan dependency summaries (se leen tras Wave 1)
# Estos archivos aparecerán solo si 156-01 y 156-02 ya corrieron:
# @.planning/phases/156-kb-runtime-integrity/156-01-SUMMARY.md
# @.planning/phases/156-kb-runtime-integrity/156-02-SUMMARY.md

# Manual a extender
@.docflow-kb/_manual.md

# CLI de sync/audit que vamos a operar (NO modificar)
@scripts/kb-sync.cjs
@scripts/kb-sync-db-source.cjs
@scripts/validate-kb.cjs

<orphan_inventory>
<!-- VERIFICADO CONTRA DB LIVE 2026-04-20 — RESEARCH §E. Este es el ground-truth, NO el brief. -->
<!-- Re-verificar en Task 1 por si el count ha drift-eado desde entonces (nuevos canvases creados por tests de Plan 01, etc.). -->

DB row counts (/home/deskmath/docflow-data/docflow.db, 2026-04-20):
- cat_paws: 38
- skills: 43
- email_templates: 15
- canvases: 1
- connectors: 12
- catbrains: 3
- TOTAL: 112 DB rows

KB file counts (.docflow-kb/resources/*/):
- catpaws: 46 (.md files) → 11 active orphans + 2 deprecated orphans = 13 orphans (46 - 13 = 33 matching DB rows + 5 MISSING que hay que regenerar)
- skills: 44 → 21 active orphans = 23 matching + 20 MISSING
- email-templates: 17 → 0 active + 1 deprecated orphan = 16 matching (+1 extra soft)
- canvases: 3 → 2 active orphans = 1 matching DB row
- connectors: 14 → 0 active + 2 deprecated = 12 matching
- catbrains: 4 → 0 active + 1 deprecated = 3 matching

Orphans to archive (40 total):

catpaws active (11):
- 72ef0fe5-redactor-informe-inbound.md
- 7af5f0a7-lector-inbound.md
- 96c00f37-clasificador-inbound.md
- 98c3f27c-procesador-inbound.md
- a56c8ee8-ejecutor-inbound.md
- a78bb00b-maquetador-inbound.md
- agente-t-agente-test-docflow.md
- asesor-e-asesor-estrategico-de-negocio.md
- estrateg-estratega-de-negocio-y-growth.md
- executiv-resumidor-ejecutivo.md
- experto--experto-en-educa360.md

catpaws deprecated (2):
- 9eb067d6-tester.md
- a88166cd-controlador-de-fichajes.md

skills active (21): 4f7f5abf-leads-y-funnel-infoeduca.md + 20 slug-truncated:
- academic-investigador-academico.md
- account-... (plus 19 similar slug-truncated)
- (full list se re-verifica en Task 1 con script)

email-templates deprecated (1):
- 720870b0-recordatorio-fichaje-semanal.md

canvases active (2):
- 5a56962a-email-classifier-pilot.md
- 9366fa92-revision-diaria-inbound.md

connectors deprecated (2):
- 755315db-test-slack-webhook.md
- conn-gma-info-educa360-gmail.md

catbrains deprecated (1):
- a91ed58a-conocimiento-fichajes-holded.md
</orphan_inventory>

<retention_policy_template>
<!-- Plantilla a insertar en _manual.md como nueva sección, tras §Lifecycle. Target ≤30 líneas, RESEARCH §H. -->

## Retention Policy (Phase 156)

Política de retención para archivos `.docflow-kb/resources/**`. Extiende §Lifecycle (que cubre solo el ciclo temporal de archivos deprecated).

### Las 4 dimensiones

| Estado | Trigger | Acción | Comando |
|--------|---------|--------|---------|
| **active → deprecated** | DB row borrada vía hook Phase 153/156 (API route, CatBot tool, sudo tool) | Soft-delete en situ (`syncResource(_,'delete',_)` → `markDeprecated`); archivo persiste con `status: deprecated`, `deprecated_at`, `deprecated_by`, `deprecated_reason` | Automático (hooks) |
| **active orphan detection** | KB file con `status: active` pero `source_of_truth.id` ausente de la tabla DB correspondiente. Causas: legacy bootstrap (Phase 150 slug-truncated IDs), pre-hook deletions, manual DB manipulation | Triage manual tras audit; move a `.docflow-legacy/orphans/<entity>/` via `git mv` (preserva historial) | `node scripts/kb-sync.cjs --full-rebuild --source db --dry-run 2>&1 \| grep 'WARN orphan'` → lista; `git mv` manual |
| **deprecated → archived** | `status: deprecated` + `days_since_last_accessed >= 180` | Mover a `_archived/YYYY-MM-DD/<file>` (soft-archive, reversible) | `node scripts/kb-sync.cjs --archive --confirm` |
| **archived → purged** | `_archived/YYYY-MM-DD/` con más de 365 días | Borrado físico (irreversible) | `node scripts/kb-sync.cjs --purge --confirm --older-than-archived=365d` |

### Cadencia de auditoría

- `--audit-stale`: on-demand antes de cada milestone close + cron semanal (opcional, no automatizado hoy).
- Orphan audit: on-demand tras cambios masivos en DB (migraciones, bulk delete, milestone close).
- `--confirm` siempre requerido para operaciones destructivas (archive/purge).

### Notas

- Nunca `fs.unlink` directo sobre resources/ — rompe el contrato de soft-delete y markDeprecated/change_log.
- Active orphans se archivan a `.docflow-legacy/orphans/` (NO a `_archived/YYYY-MM-DD/`) porque su semántica es "residuo de bootstrap/legacy" — diferente del ciclo natural deprecated→archived.
- Re-generar KB tras orphan cleanup via `node scripts/kb-sync.cjs --full-rebuild --source db` (crea cualquier .md ausente para DB rows sin KB entry).
</retention_policy_template>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Re-auditar orphans contra DB live + generar audit snapshot 156-03-ORPHAN-AUDIT.md</name>
  <files>.planning/phases/156-kb-runtime-integrity/156-03-ORPHAN-AUDIT.md</files>
  <action>
    Re-verificar el count de orphans contra la DB productiva en el momento de ejecución (puede diferir del snapshot 2026-04-20 de RESEARCH §E porque Plan 01 tests pudieron crear canvases efímeros).

    1. Verificar que existe la DB productiva:
       ```bash
       ls -la /home/deskmath/docflow-data/docflow.db
       ```
       Si no existe, BLOQUEANTE: pedir al usuario la ruta correcta antes de continuar.

    2. Ejecutar audit via CLI kb-sync `--full-rebuild --source db --dry-run` con la DB productiva:
       ```bash
       cd /home/deskmath/docflow && DATABASE_PATH=/home/deskmath/docflow-data/docflow.db node scripts/kb-sync.cjs --full-rebuild --source db --dry-run 2>&1 | tee /tmp/156-03-audit-dry-run.log
       ```
       El comando NO escribe; solo enumera WARN orphan lines (RESEARCH §F Option 2, L491).

    3. Capturar DB row counts verificables:
       ```bash
       for entity in cat_paws skills email_templates canvases connectors catbrains; do
         echo "$entity: $(sqlite3 /home/deskmath/docflow-data/docflow.db "SELECT COUNT(*) FROM $entity")"
       done
       ```

    4. Capturar KB file counts per entity:
       ```bash
       for entity in catpaws skills email-templates canvases connectors catbrains; do
         echo -n "$entity: total=$(ls .docflow-kb/resources/$entity/*.md 2>/dev/null | wc -l) active="
         grep -l "^status: active" .docflow-kb/resources/$entity/*.md 2>/dev/null | wc -l
       done
       ```

    5. Listar orphans confirmados (KB file cuyo `source_of_truth.id` no matchea ninguna row DB). Usar el log `/tmp/156-03-audit-dry-run.log` como primary source (kb-sync.cjs emite `WARN orphan <subtype>/<file>`).

    6. Escribir `.planning/phases/156-kb-runtime-integrity/156-03-ORPHAN-AUDIT.md` con:
       - **Header frontmatter:** date, phase: 156, plan: 03, status: draft.
       - **§1 DB row counts** (tabla con 6 entidades).
       - **§2 KB file counts** (tabla pre-cleanup con total + active + deprecated).
       - **§3 Orphan list verbatim** (subsection per entity con archivos full-path).
       - **§4 Expected post-cleanup state** (por entidad: `active_kb_count === db_row_count`).
       - **§5 Deltas vs RESEARCH §E snapshot 2026-04-20** — notar drift si existe.
       - **§6 Archive plan** — mapping de archivo → destino `.docflow-legacy/orphans/<entity>/<file>`.

    7. Commit: `docs(156-03): capture orphan audit snapshot against live DB (KB-43)`

    NOTA: si el count difiere significativamente del snapshot (e.g., >5 drift), documentar en §5 con timestamp. El plan continúa — la política (archive all orphans) es la misma, solo los números cambian.
  </action>
  <verify>
    <automated>test -f .planning/phases/156-kb-runtime-integrity/156-03-ORPHAN-AUDIT.md && grep -c "^## §\|^### " .planning/phases/156-kb-runtime-integrity/156-03-ORPHAN-AUDIT.md | awk '{if ($1 >= 6) print "OK"; else print "FAIL: snapshot too short"}'</automated>
  </verify>
  <done>
    156-03-ORPHAN-AUDIT.md existe con 6+ secciones, contiene DB counts + KB counts + orphan list + post-cleanup target + archive plan. Commit creado.
  </done>
</task>

<task type="auto">
  <name>Task 2: Archive orphans a .docflow-legacy/orphans/ via git mv (40 archivos per snapshot, o el count post-Task-1)</name>
  <files>.docflow-legacy/orphans/catpaws/, .docflow-legacy/orphans/skills/, .docflow-legacy/orphans/canvases/, .docflow-legacy/orphans/email-templates/, .docflow-legacy/orphans/connectors/, .docflow-legacy/orphans/catbrains/</files>
  <action>
    Mover cada orphan de `.docflow-kb/resources/<entity>/` a `.docflow-legacy/orphans/<entity>/` preservando historial git (via `git mv`). El plan sigue la secuencia de RESEARCH §E L464-472.

    1. Crear los 6 subdirs destino:
       ```bash
       mkdir -p .docflow-legacy/orphans/{catpaws,skills,canvases,email-templates,connectors,catbrains}
       ```

    2. Por cada entity, leer la lista de orphans del snapshot Task 1 (`156-03-ORPHAN-AUDIT.md §3`). Ejecutar `git mv` para cada uno:
       ```bash
       # Ejemplo catpaws:
       git mv .docflow-kb/resources/catpaws/72ef0fe5-redactor-informe-inbound.md .docflow-legacy/orphans/catpaws/
       git mv .docflow-kb/resources/catpaws/7af5f0a7-lector-inbound.md .docflow-legacy/orphans/catpaws/
       # ... (todos los active + deprecated orphans listados en el snapshot)
       ```

    3. CRÍTICO: NO borrar archivos activos (status:active) que SÍ tengan DB row correspondiente. Solo orphans verificados en Task 1. Si hay duda en un archivo, DEJARLO en su sitio — mejor falso-positivo (orphan dejado) que falso-negativo (archivo legítimo movido).

    4. Verificar pre/post counts:
       ```bash
       # Pre-move (debería coincidir con Task 1)
       for entity in catpaws skills email-templates canvases connectors catbrains; do
         ls .docflow-kb/resources/$entity/ 2>/dev/null | wc -l
       done
       # Post-move
       for entity in catpaws skills email-templates canvases connectors catbrains; do
         echo "$entity: kb=$(ls .docflow-kb/resources/$entity/*.md 2>/dev/null | wc -l) legacy=$(ls .docflow-legacy/orphans/$entity/*.md 2>/dev/null | wc -l)"
       done
       ```

    5. Regenerar `_index.json` + `_header.md`:
       ```bash
       cd /home/deskmath/docflow && node scripts/kb-sync.cjs --full-rebuild
       ```
       (Sin `--source db` — solo refresca el index frente al filesystem post-move.)

    6. Verificar schema-validity:
       ```bash
       node scripts/validate-kb.cjs
       ```
       Debe exit 0. Si falla, los orphans tal vez no estaban schema-válidos al mover y rompieron el validador — restaurar manualmente si necesario.

    7. OPCIONAL (RESEARCH §E step 5): correr `--full-rebuild --source db` para regenerar .md que estaban MISSING (DB rows sin KB entry — e.g., 3 catpaws creados post-Phase-150 sin hook, 20 skills migrados DB pero sin KB):
       ```bash
       DATABASE_PATH=/home/deskmath/docflow-data/docflow.db node scripts/kb-sync.cjs --full-rebuild --source db
       ```
       Esto cierra el claim "active_kb_count === db_row_count" que es el criterio de éxito KB-43.

       Verificar:
       ```bash
       for entity in catpaws skills email-templates canvases connectors catbrains; do
         echo -n "$entity: kb_active=$(grep -l '^status: active' .docflow-kb/resources/$entity/*.md 2>/dev/null | wc -l) "
         case $entity in
           catpaws) db_entity=cat_paws ;;
           skills) db_entity=skills ;;
           email-templates) db_entity=email_templates ;;
           canvases) db_entity=canvases ;;
           connectors) db_entity=connectors ;;
           catbrains) db_entity=catbrains ;;
         esac
         echo "db=$(sqlite3 /home/deskmath/docflow-data/docflow.db "SELECT COUNT(*) FROM $db_entity")"
       done
       ```
       Los 6 pares deben coincidir.

    8. Commit: `chore(156-03): archive 40 orphans to .docflow-legacy/orphans/ + regenerate _index.json/_header.md (KB-43)`

    Pitfalls (RESEARCH §L):
    - Pitfall 5 (orphans persist): `--full-rebuild --source db` no borra orphans; por eso usamos git mv manual aquí.
    - Pitfall 6 (better-sqlite3 resolver): `DATABASE_PATH=/home/deskmath/docflow-data/docflow.db` es obligatorio (STATE.md L196). Sin él, kb-sync-db-source.cjs apunta a fixture stale de 9 rows.

    NO correr `--audit-stale --archive --confirm` — ese CLI solo archiva deprecated+180d, NO cubre el caso orphan. El path manual vía git mv es la respuesta correcta según RESEARCH §F Option 2.
  </action>
  <verify>
    <automated>for entity in catpaws skills email-templates canvases connectors catbrains; do case $entity in catpaws) db=cat_paws ;; email-templates) db=email_templates ;; *) db=$entity ;; esac; kb=$(grep -l "^status: active" .docflow-kb/resources/$entity/*.md 2>/dev/null | wc -l); dbc=$(sqlite3 /home/deskmath/docflow-data/docflow.db "SELECT COUNT(*) FROM $db" 2>/dev/null); echo "$entity: kb=$kb db=$dbc $([[ $kb == $dbc ]] && echo OK || echo MISMATCH)"; done</automated>
  </verify>
  <done>
    40 orphans (o el count real post-Task-1) están en `.docflow-legacy/orphans/<entity>/`. Para las 6 entidades, `active_kb_count === db_row_count`. `validate-kb.cjs` exit 0. `_index.json` + `_header.md` regenerados. Commit creado.
  </done>
</task>

<task type="auto">
  <name>Task 3: Añadir sección §Retention Policy a .docflow-kb/_manual.md</name>
  <files>.docflow-kb/_manual.md</files>
  <action>
    Insertar la sección §Retention Policy (Phase 156) tras la sección §Lifecycle existente. Contenido verbatim del bloque `<retention_policy_template>` en el `<context>` de este plan (tabla con 4 dimensiones + cadencia + notas).

    1. Leer `.docflow-kb/_manual.md` completo.

    2. Localizar el final de la sección `## Lifecycle` (aprox L83-100, puede haber drift por ediciones de Phase 155 per STATE.md L193). Insertar la nueva sección DESPUÉS de ese bloque y ANTES de la siguiente sección top-level.

    3. Pegar el template verbatim del bloque `<retention_policy_template>` (ver `<context>` arriba). Target: ≤30 líneas per RESEARCH §H.

    4. Añadir un cross-link 1-línea al final de la sección §Lifecycle preexistente apuntando a la nueva:
       ```markdown
       > Para retención de orphans (no ciclo temporal), ver §Retention Policy abajo.
       ```

    5. Validar el cambio no rompe el manual:
       ```bash
       node scripts/validate-kb.cjs
       ```
       Exit 0 (el `_manual.md` está en `EXCLUDED_FILENAMES` normalmente, pero confirmar).

    6. Grep-check:
       ```bash
       grep -c "^## Retention Policy" .docflow-kb/_manual.md
       # debe devolver 1
       ```

    7. Commit: `docs(156-03): add §Retention Policy to _manual.md (KB-43)`

    Restricciones CLAUDE.md:
    - Comunicación en español en el contenido de la sección.
    - Ninguna referencia a layers legacy ya borrados en Phase 155 (layers.json, knowledge-tree, query_knowledge).
  </action>
  <verify>
    <automated>grep -c "^## Retention Policy" .docflow-kb/_manual.md</automated>
  </verify>
  <done>
    `.docflow-kb/_manual.md` tiene la sección §Retention Policy (Phase 156) con ≤30 líneas, las 4 dimensiones y el cheat-sheet de comandos. Grep-count devuelve 1. Commit creado.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: CatBot oracle — ejecutar los 4 prompts de verificación final para KB-40..KB-43</name>
  <files>.planning/phases/156-kb-runtime-integrity/156-VERIFICATION.md</files>
  <action>
    CHECKPOINT gate — pausa el plan hasta que el humano ejecute los 4 prompts de oracle contra el CatBot live (CLAUDE.md mandate + RESEARCH §I + VALIDATION §Manual-Only) y confirme los resultados.

    === LO QUE CONSTRUYERON PLANS 01-03 (RECAP) ===

    - Plan 156-01 (KB-40 canvas hooks + KB-41 delete_catflow soft-delete).
    - Plan 156-02 (KB-42 link tools + template extension).
    - Plan 156-03 Tasks 1-3 (KB-43 orphan cleanup + §Retention Policy en _manual.md).

    Ahora el KB:
    - Recibe sync hook en cada write de canvas (POST/PATCH/DELETE).
    - `delete_catflow` sudo tool usa soft-delete.
    - `link_connector_to_catpaw` + `link_skill_to_catpaw` re-sync el parent CatPaw.
    - CatPaw .md template incluye §Conectores vinculados + §Skills vinculadas.
    - 40 orphans archivados; active_kb_count === db_row_count per entity.
    - §Retention Policy documentada en _manual.md.

    === PRE-REQS: DOCKER REBUILD COMPLETO (MEMORY.md deploy sequence) ===

    ```bash
    cd ~/docflow/app && npm run build
    cd ~/docflow && docker compose build docflow --no-cache
    docker compose up -d --force-recreate
    docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/
    docker restart docflow-app
    ```

    Verificar container healthy:
    ```bash
    docker ps | grep docflow-app
    curl -s http://localhost:3500/api/health 2>/dev/null || echo "no health endpoint — pasar al siguiente step"
    ```

    === LOS 4 PROMPTS (ejecutar via POST /api/catbot/chat o UI /catbot) ===

    **Prompt 1 (KB-40 canvas create + search):**
    > "Crea un canvas llamado 'Phase 156 Verify' y luego busca su kb_entry."

    Expected:
    - tool_calls incluye `canvas_create` → devuelve `{id, name}`.
    - `search_kb({search:"Phase 156 Verify"})` o `canvas_list` devuelve el canvas con `kb_entry: "resources/canvases/<id8>-phase-156-verify.md"` non-null.
    - `ls .docflow-kb/resources/canvases/*phase-156-verify*.md` encuentra el archivo.
    - `grep '^status: active' <el_archivo>` match.

    **Prompt 2 (KB-41 delete_catflow soft-delete):**
    > "Borra el canvas 'Phase 156 Verify' con sudo y confirma que el archivo KB queda marcado como deprecated."

    Expected:
    - tool_calls incluye `delete_catflow({identifier:'Phase 156 Verify', confirmed:true})` (puede requerir sudo auth prompt primero).
    - Response status `DELETED`.
    - `get_kb_entry({id: 'canvas-<id8>'})` devuelve `frontmatter.status === 'deprecated'` + `deprecated_by: catbot-sudo:delete_catflow`.
    - `grep '^status: deprecated' <el_archivo>` match.

    **Prompt 3 (KB-42 link tools + template):**
    > "Crea un CatPaw 'Test Linker Phase156', enlázale el conector Holded MCP, y dime qué conectores tiene vinculados según el KB."

    Expected:
    - tool_calls en cadena: `create_cat_paw` → `link_connector_to_catpaw` → `get_kb_entry` o `search_kb`.
    - Response menciona "Holded MCP" como conector vinculado.
    - `cat .docflow-kb/resources/catpaws/*test-linker-phase156*.md | grep -A3 'Conectores vinculados'` muestra "- **Holded MCP** (...)".
    - `search_kb({search:"holded"})` devuelve al menos este CatPaw en los results.

    **Prompt 4 (KB-43 orphan visibility):**
    > "¿Cuántos archivos KB tienen status:active por entidad? Compáralo con los counts de la DB (cat_paws, skills, email_templates, canvases, connectors, catbrains)."

    Expected:
    - tool_calls incluye `list_cat_paws`, `list_skills`, `canvas_list`, `list_email_templates`, `list_catbrains`, + posiblemente `search_kb({status:'active'})` per type.
    - Response compara counts: post-cleanup, KB active count === DB row count per entity.
    - Si hay mismatch, anotarlo como gap (tras Task 2 NO debería haber mismatch).

    === CAPTURA DE EVIDENCIA ===

    Para cada prompt:
    1. Ejecutar via `curl -X POST http://localhost:3500/api/catbot/chat -H 'Content-Type: application/json' -d '{"message":"...","session_id":"phase-156-oracle"}'` o via UI `/catbot`.
    2. Pegar response verbatim (tool_calls + body) en `.planning/phases/156-kb-runtime-integrity/156-VERIFICATION.md` (crear si no existe, un bloque por prompt con status OK / GAP).
    3. Marcar el prompt OK o GAP con rationale.

    === LIMPIEZA POST-ORACLE ===

    Borrar el CatPaw de prueba (si persiste activo). El canvas 'Phase 156 Verify' ya fue soft-deleted en Prompt 2 — no requiere más limpieza:
    ```bash
    sqlite3 /home/deskmath/docflow-data/docflow.db "DELETE FROM cat_paws WHERE name = 'Test Linker Phase156'"
    # Este DELETE manual NO hookea; acceptable porque es cleanup de fixture de prueba.
    ```

    === RESUME SIGNAL ===

    - Si los 4 prompts pasan → escribe "approved" y la fase se cierra.
    - Si algún prompt falla (tool_call faltante, kb_entry null inesperado, sección Conectores vinculados ausente, count mismatch en Prompt 4) → describe el gap verbatim + qué esperabas vs qué obtuviste; la orquestación abrirá un gap-closure plan (o lo añadirá al próximo `/gsd:plan-phase --gaps`).
    - Si Docker rebuild falla → describe el error de build; el plan vuelve a Task 2 del Plan 156-01 o 156-02 según corresponda.
  </action>
  <verify>
    <automated>test -f .planning/phases/156-kb-runtime-integrity/156-VERIFICATION.md && grep -cE "^(## |### )Prompt [1-4]" .planning/phases/156-kb-runtime-integrity/156-VERIFICATION.md | awk '{if ($1 >= 4) print "OK: 4 prompts documented"; else print "FAIL: expected 4 prompts, got " $1}'</automated>
    <manual>Humano confirma "approved" (4/4 OK) o describe gaps (N/4 OK, resto gap). Evidencia verbatim en 156-VERIFICATION.md. Manual justification: los 4 prompts requieren Docker live + CatBot session end-to-end que ningún test unitario reproduce (ergonomía + toolchain real).</manual>
  </verify>
  <done>
    .planning/phases/156-kb-runtime-integrity/156-VERIFICATION.md existe con 4 bloques de prompt (uno por KB-40..KB-43), cada uno con tool_calls + response verbatim + status OK/GAP. Humano ha respondido "approved" (cierra la fase) o ha descrito gaps (trigger gap-closure plan). Si todos OK → fase 156 lista para `/gsd:complete-phase 156` + `/gsd:complete-milestone v29.1`.
  </done>
</task>

</tasks>

<verification>
Tras completar las 4 tasks:

1. **Automatizado (Task 1 + 2):** `for entity in catpaws skills email-templates canvases connectors catbrains; do ... kb=db ... done` → 6 líneas OK.
2. **Automatizado (Task 3):** `grep -c "^## Retention Policy" .docflow-kb/_manual.md` → 1.
3. **Automatizado (validator):** `node scripts/validate-kb.cjs` → exit 0.
4. **Manual (Task 4 oracle):** 4 prompts ejecutados + evidencia pegada a `156-VERIFICATION.md`.
5. **Git status:** los 40 archivos movidos aparecen como `R` (renamed) via `git mv`, no como delete+add separados.
6. **.docflow-legacy counts:** cada subdir `orphans/<entity>/` coincide con el count del snapshot §6 Archive plan.
</verification>

<success_criteria>
- [ ] `.planning/phases/156-kb-runtime-integrity/156-03-ORPHAN-AUDIT.md` existe con 6+ secciones (counts + lista + post-cleanup target + archive plan).
- [ ] 40 orphans movidos (o el count real verificado en Task 1) a `.docflow-legacy/orphans/<entity>/` via `git mv`.
- [ ] Para las 6 entidades: KB active count === DB row count.
- [ ] `.docflow-kb/_manual.md` contiene §Retention Policy (Phase 156) con las 4 dimensiones.
- [ ] `_index.json` + `_header.md` regenerados post-cleanup.
- [ ] `validate-kb.cjs` exit 0.
- [ ] CatBot oracle ejecutado: los 4 prompts producen evidencia pegada a `156-VERIFICATION.md` con status OK o GAP documentado.
- [ ] 3+ commits con prefijos `docs(156-03)`, `chore(156-03)`.
- [ ] Plans 156-01 y 156-02 completados antes de este (Wave 2 depends on Wave 1).
</success_criteria>

<output>
After completion, create `.planning/phases/156-kb-runtime-integrity/156-03-SUMMARY.md` con:
- Tasks completadas (4/4), commits SHAs.
- Orphan counts pre/post cleanup per entity (matching Task 1 audit vs Task 2 post-state).
- Drift vs RESEARCH §E snapshot 2026-04-20 (notar delta).
- Decisiones:
  * Retention policy via tabla compacta (≤30 líneas).
  * `.docflow-legacy/orphans/` vs `_archived/YYYY-MM-DD/` — elegido legacy per RESEARCH §P-Q4.
  * `--full-rebuild --source db` ejecutado post-git-mv para cerrar MISSING gap (3 catpaws + 20 skills).
- CatBot oracle evidence (Prompts 1-4 resultados).
- Gaps abiertos (si alguno): listar para potencial Phase 157 o para `/gsd:verify-phase` treatment.
- Ready para `/gsd:complete-phase 156` + `/gsd:complete-milestone v29.1` (post audit re-confirm).
</output>
