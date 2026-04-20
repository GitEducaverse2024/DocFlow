# Knowledge Base de DocFlow — Manual de Navegación

## Propósito

Este árbol (`.docflow-kb/`) es el **Source of Truth** unificado del conocimiento DocFlow. Su objetivo es reemplazar los silos dispersos que existen hoy:

- `app/data/knowledge/*.json` — catálogos runtime del CatBot (catboard, catbrains, catpaw, catflow, canvas, catpower, settings).
- `.planning/knowledge/*.md` — catálogos manuales editoriales (catpaw-catalog, connectors-catalog, email-templates, canvas-nodes, incidents-log, proceso-catflow…).
- Skills sueltas (ej. `skill_orquestador_catbot_enriched.md`) en raíz del repo.
- Prompts hardcoded en código (`catbot-pipeline-prompts.ts`) y fragmentos de documentación en fases de `.planning/phases/*`.

**Estado actual: productivo (post-155).** El KB es la única fuente canónica de documentación DocFlow desde Phase 155 (2026-04-20). Los layers legacy (`app/data/knowledge/*.json` + `.planning/knowledge/*.md` + `skill_orquestador_catbot_enriched.md`) fueron borrados físicamente; el módulo TS `knowledge-tree.ts` + tools `query_knowledge`/`explain_feature` removidos. CatBot consume el KB via `search_kb`/`get_kb_entry` (Phase 152) con `_header.md` inyectado automáticamente en cada session; creation tools sincronizan DB↔KB via hooks (Phase 153).

Ver §5.3 del PRD para la política de merge DB↔archivo y la mecánica de soft-delete/purga.

## Estructura de carpetas

Árbol fijo del KB — ver §3.1 del PRD:

- `_index.json` — índice máquina-legible con todas las entradas, tags, audiencias y counts (shape v2, §4.1 PRD).
- `_header.md` — resumen L0 (counts + top tags + últimos cambios). Auto-generado por `knowledge-sync.ts`; no editar manualmente.
- `_manual.md` — este documento.
- `_schema/` — schemas JSON (`frontmatter.schema.json`, `resource.schema.json`, `tag-taxonomy.json`).
- `_archived/` — (se crea cuando corresponde) zona de archivos `status: archived` tras 180d sin acceso.
- `_audit_stale.md` — (se crea al correr `kb-sync --audit-stale`) reporte de candidatos a archivo/purga.
- `domain/` — conocimiento editorial estructural. Subdividido en `concepts/` (CatPaw, CatFlow, Canvas, CatBrain…), `taxonomies/` (departamentos, roles, connectors, cross_cutting), `architecture/` (diagramas y explicaciones arquitectónicas).
- `resources/` — recursos live con fuente de verdad en DB. Uno por tipo: `catpaws/`, `connectors/`, `catbrains/`, `email-templates/`, `skills/`, `canvases/`.
- `rules/` — reglas de código y diseño (R01, R02, R10, R13, SE01, DA01…). Una regla por archivo, prefijo con código.
- `protocols/` — protocolos de ejecución y procedimientos (inbound review, canvas build, etc.).
- `runtime/` — estado runtime documentado (intent queue, task scheduler, polling services).
- `incidents/` — log de incidencias resueltas con causa y fix. Prefijo `INC-`.
- `features/` — features documentados del producto (cara de usuario). Un archivo por feature.
- `guides/` — howto paso a paso y guías de onboarding.
- `state/` — instantáneas de estado del sistema cuando se requiera snapshot versionado.

## Nomenclatura

- Archivos en **kebab-case** siempre.
- **Instancias de resource** llevan prefijo con los primeros 8 chars del UUID: `53f19c51-operador-holded.md`.
- **Reglas** llevan código + slug: `R10-preserve-fields.md`, `SE01-no-shared-secrets.md`.
- **Incidentes** llevan prefijo `INC-`: `INC-2026-04-18-condition-pierde-json.md`.
- **Fases de proyecto** llevan número: `149-kb-foundation.md`.
- **Protocolos** sin prefijo, slug descriptivo: `inbound-review.md`.
- **Archivos especiales** con prefijo `_`: `_index.json`, `_header.md`, `_manual.md`, `_schema/`, `_archived/`, `_audit_stale.md`.

## Frontmatter universal

Todo archivo `.md` del KB (excepto los `_*` auto-generados) lleva frontmatter con 13 campos obligatorios (§3.3 PRD):

1. `id` — kebab-case único estable. No se renombra nunca.
2. `type` — enum: `concept | taxonomy | resource | rule | protocol | runtime | incident | feature | guide | state`.
3. `subtype` — string libre o `null`.
4. `lang` — enum: `es | en | es+en`.
5. `title` — si `lang: es+en` ⇒ dict `{es, en}`; si no, string plano.
6. `summary` — mismas reglas que `title`.
7. `tags` — array validado contra `tag-taxonomy.json`.
8. `audience` — array enum: `catbot | architect | developer | user | onboarding`.
9. `status` — enum: `active | deprecated | draft | experimental`.
10. `created_at` + `created_by`.
11. `version` — semver completo `M.m.p`.
12. `updated_at` + `updated_by`.
13. `source_of_truth` — array `{ db, id, fields_from_db[] }` o `null` (válido para docs puramente editoriales).

Campos condicionales obligatorios cuando aplican: `last_accessed_at` + `access_count` si `ttl: managed`; `deprecated_at` + `deprecated_by` + `deprecated_reason` si `status: deprecated`; `superseded_by` opcional; `change_log` (últimos 5 entries, histórico completo en git); `search_hints` dict `{es, en}` si `lang: es+en`; `ttl` enum `never | managed | 30d | 180d`.

Los archivos bilingües (`lang: es+en`) deben coexistir en un único archivo con dict `{es, en}` — no se duplica el archivo.

## Tag taxonomy

`_schema/tag-taxonomy.json` define el **vocabulario controlado** en 8 categorías (§3.4 PRD):

- `domains` — crm, email, storage, analytics, auth, scheduling.
- `entities` — catpaw, catflow, canvas, catbrain, connector, skill, template.
- `modes` — chat, processor, hybrid.
- `connectors` — gmail, holded, drive, mcp, http, n8n, smtp.
- `roles` — extractor, transformer, synthesizer, renderer, emitter, guard, reporter.
- `departments` — business, finance, production, other.
- `rules` — R01, R02, R10, R13, SE01, DA01.
- `cross_cutting` — safety, performance, learning, ux, ops, testing.

El validador acepta un tag si aparece en alguna lista. Nuevos tags se añaden editando el archivo `_schema/tag-taxonomy.json` (requiere bump minor del KB).

## Lifecycle

Estados posibles: `active → deprecated → archived → purged`.

Transiciones (§5.3 PRD):

- **active → deprecated**: llamada explícita `markDeprecated(path, row, author)` en `knowledge-sync.ts`. Soft delete: nunca borra el archivo. Se añaden `deprecated_at`, `deprecated_by`, `deprecated_reason` y opcionalmente `superseded_by`.
- **deprecated → archived**: tras 180d sin acceso (basado en `last_accessed_at`). Ejecuta `kb-sync.cjs --archive --confirm`, mueve a `_archived/YYYY-MM-DD/`. **Requiere `--confirm` explícito**.
- **archived → purged**: tras 365d en `_archived/`. Ejecuta `kb-sync.cjs --purge --confirm --older-than-archived=365d`. **Borrado físico, también requiere `--confirm`**.

Workflow completo de avisos:

- Día 150 sin acceso: entrada informativa en `_audit_stale.md`.
- Día 170 sin acceso: aviso visible (`warning_visible: true` en el MD del reporte).
- Día 180: elegible para `--archive --confirm`.
- Día 365 tras archivado: elegible para `--purge --confirm`.

Nunca se archiva ni se purga sin confirmación explícita del operador humano.

> Para retención de orphans (archivos KB sin fila DB) y la política general de pruning ver §Retention Policy (Phase 156) abajo.

## Retention Policy (Phase 156)

Extiende §Lifecycle con la política canónica de retención del KB. §Lifecycle cubre el ciclo **temporal** de un archivo (active → deprecated → archived → purged). Esta sección cubre las 4 **dimensiones** que deciden cuándo un archivo deja de ser documentación viva, añadiendo el caso orphan (archivos KB sin fila DB) introducido en Phase 156 Plan 03.

### Las 4 dimensiones

| Dimensión                  | Trigger                                                                                      | Acción                                                                                                                         | Comando canónico                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **Max-age deprecated**     | `status: deprecated` + 180 días sin acceso (`last_accessed_at` o fallback a `deprecated_at`) | Mover a `.docflow-kb/_archived/YYYY-MM-DD/` vía `--archive --confirm`; archivo reversible                                      | `node scripts/kb-sync.cjs --audit-stale` → `node scripts/kb-sync.cjs --archive --confirm` |
| **Archive-vs-purge**       | Archivo en `_archived/` > 365 días                                                            | **Opción default:** no auto-purge nunca (git preserva historial); purga física sólo vía PR con etiqueta `kb-purge` + 2 reviewers | `node scripts/kb-sync.cjs --purge --confirm --older-than-archived=365d` (manual)    |
| **Manual-vs-automated**    | Cron semanal (GHA, pendiente KB-44) emite issue; operador aprueba                            | Automated: solo **reporta** (no destruye); manual: ejecuta `--archive`/`--purge`/`git mv`                                       | Cron: `--full-rebuild --source=db --dry-run` + `--audit-stale`; manual: idem + `--confirm` |
| **Orphan-detection**       | Archivo en `.docflow-kb/resources/<entity>/*.md` cuyo `source_of_truth[0].id` ∉ DB.`<tabla>`.id | `git mv` a `.docflow-legacy/orphans/<entity>/` (distinto de `_archived/` — semántica "residuo" vs "elapsed")                    | Auditoría: Node helper (ver `audit_orphans3.cjs`-style); archivo: `git mv` manual   |

### Cadencia de auditoría

- **Semanal (automatizada, KB-44 trackeado):** cron GHA corre `--full-rebuild --source=db --dry-run` + `--audit-stale`; abre issue por cada candidato. No destructivo.
- **Post-milestone (manual obligatorio):** tras cerrar cualquier phase (especialmente las que tocan schemas de las 6 tablas: cat_paws, skills, canvases, email_templates, connectors, catbrains), el operador ejecuta la detección de orphans para evitar drift silencioso.
- **Post-deploy (si aplica):** tras cualquier deploy que mueva filas DB (migraciones, seeds), correr la detección antes del merge a main.
- **`--confirm`** sigue siendo obligatorio para toda operación destructiva (archive/purge). `git mv` a `.docflow-legacy/orphans/` es reversible, no requiere `--confirm`.

### Invariante canónico post-limpieza

Para cada entidad `(e, t)`, tras cualquier ciclo de retención:

```bash
# KB files con status:active cuyo source_of_truth.id matchea una fila DB
count(resources/<e>/*.md ∩ DB.<t>.id) == SELECT COUNT(*) FROM <t>
```

Si se rompe → orphan nuevo → dispara dimensión 4.

### Mapeo entidad ↔ tabla DB

| Carpeta KB                     | Tabla SQLite       |
| ------------------------------ | ------------------ |
| `resources/catpaws/`           | `cat_paws`         |
| `resources/skills/`            | `skills`           |
| `resources/canvases/`          | `canvases`         |
| `resources/email-templates/`   | `email_templates`  |
| `resources/connectors/`        | `connectors`       |
| `resources/catbrains/`         | `catbrains`        |

### Notas

- Nunca `fs.unlink` directo sobre `resources/` — rompe el contrato soft-delete + markDeprecated + change_log.
- Active orphans se archivan a `.docflow-legacy/orphans/` (NO a `_archived/YYYY-MM-DD/`) porque su semántica es "residuo de bootstrap/legacy", diferente del ciclo natural deprecated→archived.
- Re-generar KB tras orphan cleanup: `DATABASE_PATH=/home/deskmath/docflow-data/docflow.db node scripts/kb-sync.cjs --full-rebuild` (refresca `_index.json` + `_header.md`; sin `--source=db` solo reindexa, con `--source=db` también crea `.md` para DB rows sin KB entry).

### Rebuild Determinism (Phase 157)

A partir de Phase 157, el comando `node scripts/kb-sync.cjs --full-rebuild --source db` es **determinístico respecto al estado de lifecycle**:

1. **No resucita archivados.** El script carga al iniciar la lista de archivos en `.docflow-legacy/orphans/<subtype>/*.md` (via `loadArchivedIds(kbRoot)` → `Set<"<subtype>:<short-id-slug>">`) y los excluye del Pass-2 DB-row iteration. Aunque la fila DB correspondiente siga activa, si el archivo está archivado el rebuild emite `WARN [archived-skip] <subtype>/<id>-<slug>` y NO reescribe en `resources/`. El contador `report.skipped_archived` del PLAN summary surface cuántas filas fueron excluidas por lifecycle.

2. **Señal de archivado permanente.** Un archivo presente en `.docflow-legacy/orphans/<subtype>/<id>-<slug>.md` es la señal permanente: está fuera del ciclo automático hasta que el operador lo re-admita explícitamente. No hay timeout ni auto-restore.

3. **Re-admisión opt-in: `--restore --from-legacy <id>`.** Para re-admitir un archivo archivado al ciclo de sync, usar:

   ```bash
   node scripts/kb-sync.cjs --restore --from-legacy <short-id-slug>
   # Ejemplo: --restore --from-legacy 72ef0fe5-redactor-informe-inbound
   ```

   El comando mueve el archivo desde `.docflow-legacy/orphans/<subtype>/<id>.md` a `.docflow-kb/resources/<subtype>/<id>.md` via `fs.renameSync` (atómico, portable). Tras el restore, correr `--full-rebuild --source db` para re-indexar.

   **Exit codes del `--restore`:**

   | Código | Significado                                                                     |
   | ------ | ------------------------------------------------------------------------------- |
   | `0`    | archivo movido correctamente                                                    |
   | `1`    | missing `--from-legacy <id>` (flag o valor ausente)                             |
   | `2`    | id no encontrado en ningún subdir, o ambiguo (presente en >1 subdir)            |
   | `3`    | destination conflict (archivo ya existe en `resources/`; hacer `git rm` primero)|

4. **Preservación de historial git (opcional).** `--restore` usa `fs.renameSync` y pierde la cadena de `git log --follow` al reubicar. Para preservar historial, el operador puede hacer manualmente:

   ```bash
   git mv .docflow-legacy/orphans/<subtype>/<id>.md .docflow-kb/resources/<subtype>/<id>.md
   node scripts/kb-sync.cjs --full-rebuild --source db
   ```

   en vez del comando `--restore`. Ambos flujos producen el mismo estado final; `--restore` es la ergonomía rápida, `git mv` es la history-preserving alternative.

5. **Body-sections en rebuild.** Desde Phase 157-02, `buildBody(subtype, row, relations)` renderiza secciones `## Conectores vinculados` y `## Skills vinculadas` en CatPaws durante `--full-rebuild --source db`, byte-equivalentes al runtime path (`syncResource('catpaw','update')` de `knowledge-sync.ts`). Esto cierra el drift heredado Phase 156-02 donde sólo los CatPaws editados post-despliegue tenían las secciones.

**Cross-links:**

- PRD §5.3 Lifecycle — `.planning/ANALYSIS-knowledge-base-architecture.md` §5.3.
- Phase 156-03 orphan audit — `.planning/phases/156-kb-runtime-integrity/156-03-ORPHAN-AUDIT.md`.
- Phase 157 root cause — `.planning/phases/157-kb-rebuild-determinism/157-CONTEXT.md`.

## Validación y CI

Script local: `node scripts/validate-kb.cjs` (planificado en Plan 149-02). Recorre `.docflow-kb/**/*.md` (excluye `_archived/` y los stubs `_header.md`/`_manual.md`), extrae el frontmatter y valida contra `_schema/frontmatter.schema.json`. Sale con código 1 si algún archivo incumple, listando los errores.

**Estado CI:** DocFlow no tiene pipeline CI integrado en este momento (no existe `.github/workflows/` en el repo). Cuando se añada CI, este script se integrará como step de validación del PR. Mientras tanto, la convención es correrlo local antes de commitear cambios al KB.

## Estado actual (Phase 149)

Esta fase crea únicamente **infraestructura**. El contenido real se migra en fases posteriores del PRD:

- **Fase 2 PRD** — `kb-sync.cjs --full-rebuild --source db` puebla `resources/*` leyendo tablas live de la DB.
- **Fase 3 PRD** — migración estática de `.planning/knowledge/*.md`, `app/data/knowledge/*.json`, skills dispersas, y prompts hardcoded en `catbot-pipeline-prompts.ts`.
- **Fase 4 PRD** — consumo por CatBot: `prompt-assembler` lee `_header.md`, tools `get_kb_entry` y `search_kb` expuestas como `always_allowed`.
- **Fase 5 PRD** — enganchar tools de creación (`create_cat_paw`, `create_connector`, `create_catbrain`, …) a `knowledge-sync.syncResource()` para mantener el KB sincronizado con operaciones de usuario.
- **Fase 6 PRD** — dashboard Next.js `/knowledge` con filtros, búsqueda, react-markdown y timeline.
- **Fase 7 PRD** — limpieza final: se eliminan los silos migrados (`app/data/knowledge/*.json` y `.planning/knowledge/*.md`).

Hasta entonces, los silos legacy siguen siendo la fuente activa para CatBot y planificación. No borrar contenido antiguo manualmente: el material que quede sin migrar se archiva en `.docflow-legacy/` con entrada en `_migration-log.md`.

## Referencias

- PRD completo: [`.planning/ANALYSIS-knowledge-base-architecture.md`](../.planning/ANALYSIS-knowledge-base-architecture.md) — decisiones cerradas, apéndices A/B/C con ejemplos canónicos.
- Context locked de esta fase: [`.planning/phases/149-kb-foundation-bootstrap/149-CONTEXT.md`](../.planning/phases/149-kb-foundation-bootstrap/149-CONTEXT.md).
- Schema de frontmatter: `_schema/frontmatter.schema.json` (se crea en Plan 149-02).
- Tag taxonomy: `_schema/tag-taxonomy.json` (se crea en Plan 149-02).
- Zona legacy: [`.docflow-legacy/README.md`](../.docflow-legacy/README.md) y [`.docflow-legacy/_migration-log.md`](../.docflow-legacy/_migration-log.md).
- Índice maestro de `.planning/`: [`.planning/Index.md`](../.planning/Index.md).

## Contenido actual del KB

**Última regeneración:** ejecutar `node scripts/kb-sync.cjs --full-rebuild --source db --verbose` y mirar el timestamp de `_header.md`.

El KB se popula desde 6 tablas SQLite (`app/data/docflow.db`) a través del comando:

```bash
node scripts/kb-sync.cjs --full-rebuild --source db
```

### Flags

- `--dry-run` — imprime el plan (`N to create, M to update, K unchanged, O orphans, S skipped`) sin escribir archivos. Exit 0.
- `--verbose` — loguea una línea por archivo (`CREATE`, `UPDATE`, `UNCHANGED`, `ORPHAN`).
- `--only <subtype>` — limita la población a uno de: `catpaw | connector | skill | catbrain | email-template | canvas`. Cualquier otro valor → exit 2.

### Exit codes

| Code | Significado |
|------|-------------|
| 0 | Éxito (todos los archivos pasan `validate-kb.cjs`). |
| 1 | `validate-kb.cjs` rechazó al menos un archivo generado (frontmatter fuera de schema o tags fuera de taxonomía). |
| 2 | Argumento inválido (p.ej., `--only <foo>` desconocido). |
| 3 | No se pudo abrir la DB (archivo inexistente o `better-sqlite3` falló) o no se pudo cargar el módulo `kb-sync-db-source.cjs`. |

### Idempotencia

Correr el comando dos veces seguidas en una DB estable produce `0 to create, 0 to update, N unchanged` en la segunda corrida — no modifica ningún archivo. La detección se basa en comparación estructural (se ignoran `updated_at`, `change_log`, `version`, `sync_snapshot`).

### Versionado automático

Cuando una fila DB cambia entre corridas, el archivo correspondiente recibe un bump semver según la naturaleza del cambio:

- **patch** (`1.0.0 → 1.0.1`): cambio de `description`, `tags` añadidos, `times_used`, etc.
- **minor** (`1.0.0 → 1.1.0`): cambio en `system_prompt`, `related` (conectores/skills/catbrains enlazados).
- **major** (`1.0.0 → 2.0.0`): cambio de `mode`, `status → deprecated`, `subtype`.

Cada bump añade una entrada a `change_log` (truncado a los últimos 5 por archivo; historial completo en git).

### Seguridad — qué NO entra al KB

El módulo `scripts/kb-sync-db-source.cjs` **nunca** lee ni escribe los siguientes campos, aunque existan en la DB:

- `connectors.config` (puede contener API keys, tokens, URLs internas).
- `canvases.flow_data` (JSON blob pesado, ~5KB por canvas).
- `canvases.thumbnail` (binario base64).
- `email_templates.structure` (JSON estructura).
- `email_templates.html_preview` (HTML renderizado).

Si alguno de estos valores aparece en un archivo `.docflow-kb/resources/**/*.md`, es un bug — reportar inmediatamente. Tests automáticos (`kb-sync-db-source.test.ts` — `no connector config leak`, `no flow_data leak`, `no template structure leak`) verifican este invariante en cada build.

### Orphans (archivo sin fila DB)

Si un archivo existe en el KB pero la fila DB asociada fue borrada, el CLI loguea `WARN orphan <subtype>/<file>` y **no modifica el archivo**. La auto-deprecación de orphans es trabajo de Fase 5 del PRD (`delete_cat_paw` → `markDeprecated`), no de este comando.

### Contenido actual (snapshot)

> Los conteos exactos viven en `_index.json.header.counts` y se renderizan en `_header.md`. Esta sección documenta sólo las categorías que existen:

- **CatPaws** (`resources/catpaws/`) — agentes especialistas (`cat_paws` table).
- **Connectors** (`resources/connectors/`) — conectores externos (MCP, HTTP, Gmail, Holded, etc.).
- **Skills** (`resources/skills/`) — habilidades transversales (Orquestador, Arquitecto, etc.).
- **CatBrains** (`resources/catbrains/`) — agentes RAG con colecciones Qdrant.
- **Email templates** (`resources/email-templates/`) — plantillas de respuesta (Pro-K12, Pro-FP, etc.).
- **Canvases** (`resources/canvases/`) — CatFlows y canvas templates (activos + archived).

Consumidores del KB: todavía ninguno. Fase 4 del PRD enchufará CatBot (`get_kb_entry`, `search_kb`) y el dashboard `/knowledge` (Fase 6) leerá estos archivos.

## Contenido migrado en Phase 151

Phase 151 (2026-04-20) completó la migración de los silos de conocimiento estático al KB. Antes de esta fase, el `_manual.md` describía la estructura vacía; ahora refleja el estado poblado.

### Silos migrados

1. **`.planning/knowledge/*.md`** (12 files) → atomizado en `rules/` (25), `incidents/` (10), `protocols/` (3), `domain/` (9), `guides/` (2). Originales con redirect stub hasta Phase 155.
2. **`app/data/knowledge/*.json`** (7 JSONs) → split en `domain/concepts/` (5) + `guides/` (7). JSONs con clave `__redirect` + `__redirect_destinations`.
3. **`skill_orquestador_catbot_enriched.md`** (raíz) → `protocols/orquestador-catflow.md` (14 PARTES, 890 líneas).
4. **Runtime prompts hardcoded** (`catbot-pipeline-prompts.ts`) → extracción paralela a `runtime/*.prompt.md` (5 archivos). El código sigue usando las constantes TS hasta Phase 152.

### Navegación post-151

- **¿Reglas de diseño de canvas?** → `rules/R01-*.md` ... `R25-*.md`
- **¿Incidentes históricos resueltos?** → `incidents/INC-*.md`
- **¿Cómo usar un CatPaw/CatFlow/CatBrain?** → `guides/how-to-use-*.md`
- **¿Qué es un canvas node?** → `domain/concepts/canvas-node.md`
- **¿Los 7 roles funcionales?** → `domain/taxonomies/node-roles.md`
- **¿Cómo funciona la API Holded MCP?** → `domain/architecture/holded-mcp-api.md`
- **¿Cómo orquestar un canvas completo?** → `protocols/orquestador-catflow.md`
- **¿Qué prompt usa el strategist/architect/qa del pipeline?** → `runtime/*.prompt.md`

### Archivos originales NO borrados

Todos los originales en `.planning/knowledge/`, `app/data/knowledge/`, y la skill en raíz reciben redirect stub apuntando al nuevo destino en el KB. La eliminación física está planificada para Phase 155 (cleanup final). Ver `.planning/phases/151-kb-migrate-static-knowledge/migration-log.md` para el mapping completo.

### Nota sobre logs de migración

Los logs de migración de esta fase (global + por plan) viven en `.planning/phases/151-kb-migrate-static-knowledge/migration-log{,-plan-01,-plan-02,-plan-03}.md`, NO dentro de `.docflow-kb/`. Razón: `validate-kb.cjs` exige frontmatter universal a todo `.md` del KB, incluidos dotfiles.

## Phase 153 — Creation Tool Hooks (automatic sync)

**Completada:** 2026-04-20

**Qué cambia:** cada create/update/delete sobre las entidades `cat_paws`, `catbrains`, `connectors`, `skills`, `email_templates` ahora sincroniza automáticamente el archivo `.docflow-kb/resources/**` correspondiente. No hace falta correr `kb-sync.cjs --full-rebuild --source db` manualmente tras cada edit. Esto cierra el gap heredado de Phase 152 donde `list_cat_paws` devolvía `kb_entry: null` para recursos creados post-snapshot.

### Superficie de hooks (21 puntos)

- **6 tool cases** en `app/src/lib/services/catbot-tools.ts`: `create_catbrain`, `create_cat_paw` / `create_agent`, `create_connector`, `create_email_template`, `update_email_template`, `delete_email_template`.
- **15 API route handlers** (5 entidades × POST/PATCH/DELETE) en `app/src/app/api/{cat-paws,catbrains,connectors,skills,email-templates}/route.ts` y `[id]/route.ts`.
- **NO hookeado:** `update_cat_paw` tool (case en catbot-tools.ts L2340). Es un `fetch` pass-through a `PATCH /api/cat-paws/[id]` — la route PATCH tiene el hook. Hookear el tool causaría double-fire o lectura stale.

### Política de fallo

- **DB siempre gana.** Si `syncResource` lanza, la operación DB persiste normal y el HTTP response del caller es éxito (200/201).
- Se registra `logger.error('kb-sync', ...)` con metadata `{entity, id, err}`.
- Se añade una línea a `.docflow-kb/_sync_failures.md` (fichero separado de `_audit_stale.md`, que es regenerado por `kb-sync.cjs --audit-stale`).
- `invalidateKbIndex()` NO se llama en el path de fallo (cache refleja estado previo válido).

### Reconciliación manual

Cuando `_sync_failures.md` tenga entradas, el operador corre:

```bash
node scripts/kb-sync.cjs --full-rebuild --source db
```

Esto regenera los archivos afectados desde la DB (fuente canónica). Tras reconciliar, `_sync_failures.md` puede vaciarse manualmente (es append-only por diseño).

### Delete es soft

`syncResource(entity, 'delete', {id}, ctx)` internamente llama `markDeprecated` — **nunca** `fs.unlink`. Archivos `status: deprecated` persisten para auditoría. El workflow físico 150d/170d/180d (Phase 149) maneja la eliminación eventual via `kb-sync.cjs --archive --confirm` / `--purge --confirm`.

### Cache invalidation

Tras cada hook exitoso se llama `invalidateKbIndex()` — el cache TTL de Phase 152 se limpia y la siguiente llamada a `list_*` o `search_kb` hace cold-read del `_index.json` actualizado. El campo `kb_entry` en los tools `list_*` se resuelve vía `resolveKbEntry(table, id)` contra el `source_of_truth[]` del frontmatter (acepta tanto `db:` como `table:` field names por compatibilidad).

### Author attribution

- **Tool cases:** `context?.userId ?? 'catbot'`.
- **API routes:** `'api:<entity>.<METHOD>'` (p.ej. `'api:cat-paws.POST'`, `'api:cat-paws.PATCH'`, `'api:cat-paws.DELETE'`). No hay middleware de auth en `/api/*`.

### Archivos de audit

- `_audit_stale.md` — regenerado por `kb-sync.cjs --audit-stale` (Phase 149). Reporte de candidatos a archivo/purga tras N días sin acceso. NO lo tocan los hooks de Phase 153.
- `_sync_failures.md` — append-only, escrito por `markStale()` en `app/src/lib/services/kb-audit.ts`. Excluido de `validate-kb.cjs` via `EXCLUDED_FILENAMES`.

### Requisitos de deploy

- **Volumen Docker:** el mount `.docflow-kb:/docflow-kb` debe ser **read-write** (NO `:ro`). Phase 152 montaba `:ro` porque era consume-only; Phase 153 necesita write access para los hooks.
- **Permisos host:** el directorio `.docflow-kb/` debe ser escribible por el uid del container (`nextjs`, uid 1001). Ejecutar `sudo chown -R 1001:<host-gid> .docflow-kb/` tras deploy si es necesario.

## Phase 154 — Dashboard UI `/knowledge` (2026-04-20)

El KB ahora es navegable desde la UI de DocFlow.

### Acceso

- **Lista:** http://localhost:3500/knowledge
- **Detalle por id:** http://localhost:3500/knowledge/<id>
- **API JSON (read-only):** `GET http://localhost:3500/api/knowledge/<id>` — devuelve `{id, path, frontmatter, body, related_resolved}` o 404 `{error:'NOT_FOUND', id}`.

### Funcionalidad

- Lista tabla con filtros client-side: type, subtype, audience, status (default `active`), tags (AND-match), search case-insensitive sobre title+summary.
- Vista detalle con markdown body (react-markdown + remark-gfm, `prose prose-invert`) + tabla Relaciones + metadata colapsable.
- Banner amarillo automático cuando `status: deprecated` — muestra `deprecated_reason` y link a `superseded_by` si existe.
- Gráfico timeline (recharts LineChart) agregando `header.last_changes` por día.
- 8 count cards desde `header.counts` (CatPaws activos, Conectores activos, CatBrains activos, Plantillas activas, Skills activos, Reglas, Incidentes resueltos, Features documentadas).
- Sidebar incluye link "Knowledge" (icon BookOpen) que navega a `/knowledge`.

### No es

- No edita KB (write UI es explícitamente out-of-scope — KB es derivado de DB + hooks Phase 153).
- No busca con semántica Qdrant (deferred).
- No traduce entries es↔en (deferred).

### Requirements cubiertos

- **KB-23** lista + filtros client-side (type/subtype/tags AND/audience/status default active/search).
- **KB-24** detalle markdown body + related + metadata + banner deprecated.
- **KB-25** `GET /api/knowledge/[id]` 200/404.
- **KB-26** timeline recharts LineChart + 8 counts cards.
- **KB-27** sidebar link `/knowledge` con icon BookOpen + i18n keys.

### Cómo regenerar el KB tras cambios en DB

Phase 153 mantiene sincronía automática (creation hooks en tools y routes). Si el `_index.json` queda desactualizado (fallo en `_sync_failures.md`), ejecutar:

```bash
node scripts/kb-sync.cjs --full-rebuild --source db
```

### Nota sobre middleware + locale cookie

`app/src/middleware.ts` redirige las rutas no excluidas a `/welcome` cuando no existe la cookie `docatflow_locale`. Para curl/API automation, añadir el header `Cookie: docatflow_locale=es`. Los E2E Playwright specs plantan la cookie en `beforeEach` vía `context.addCookies()`.

## Phase 155 Cleanup (2026-04-20)

Phase 155 cerró el ciclo KB v29.1 eliminando la deuda técnica de los dos knowledge layers legacy. Trabajo consolidado:

### Archivos borrados (23+ totales)
- `app/data/knowledge/` completo (11 archivos: 7 áreas JSON + `_index.json` + `_template.json` + 2 MDs `canvas-nodes-catalog.md` + `canvas-rules-index.md`)
- `.planning/knowledge/` completo (12 archivos)
- `skill_orquestador_catbot_enriched.md` (raíz)
- `app/src/lib/knowledge-tree.ts` + 4 tests asociados
- `app/src/app/api/catbot/knowledge/tree/route.ts`
- `app/src/components/settings/catbot-knowledge/tab-knowledge-tree.tsx`

### Código barrido
- `catbot-tools.ts`: imports de knowledge-tree, TOOLS entries `query_knowledge` + `explain_feature`, helpers `mapConceptItem`/`renderConceptItem`/`formatKnowledge*`/`scoreKnowledgeMatch`, case handlers.
- `catbot-prompt-assembler.ts`: import knowledge-tree, `PAGE_TO_AREA`, `getPageKnowledge`, `renderConceptItem`, `formatKnowledgeForPrompt`, `buildKnowledgeProtocol` simplificado (solo search_kb + get_kb_entry + search_documentation + log_knowledge_gap).
- `canvas-rules.ts`: reescrito de raíz — ahora lee `.docflow-kb/rules/R*.md + SE*.md + DA*.md` (Plan 01).
- 9 test files con `vi.mock('@/lib/knowledge-tree', ...)` blocks removidos + 2 tests con fixture reads de `app/data/knowledge/` adaptados.
- `catpaw-gmail-executor.ts` + `catpaw-drive-executor.ts`: comment references repuntados a `.docflow-kb/protocols/connector-logs-redaction.md`.
- `search-docs/route.ts`: DOC_PATHS sin `.planning/knowledge/`.
- `app/docker-entrypoint.sh` reducido a 2 líneas (sin cp de data-seed/knowledge).
- `app/Dockerfile`: sin COPY de `/app/data/knowledge`.

### Docs simplificados
- `CLAUDE.md` (80 → ~50 líneas): §"Protocolo de Documentación" reemplazado por puntero a `.docflow-kb/_manual.md`; §"Documentación de referencia" repuntada a `.docflow-kb/`; §"Restricciones absolutas" reemplazada por pointer a `search_kb({tags:["critical"]})` (R26-R29).
- `.planning/Index.md`: §"Catalogos de Conocimiento (knowledge/)" borrada; §"Knowledge Base" simplificada (sin "en construcción").

### KB extendido
- `.docflow-kb/rules/` gana 11 atoms nuevos:
  - 7 migrados desde `canvas-rules-index.md` (Plan 01): SE01, SE02, SE03, DA01, DA02, DA03, DA04.
  - 4 nuevos `critical` (Plan 03): R26 (canvas-executor inmutable), R27 (agentId UUID), R28 (process['env']), R29 (Docker rebuild tras execute-catpaw).
- `_schema/tag-taxonomy.json`: `critical` añadido a cross_cutting; R26-R29 añadidos a rules.

### Backfill live-DB
- Commit separado `chore(kb): backfill resources from live DB post-155`. Captura el estado real de las 6 tablas DB (cat_paws, connectors, skills, catbrains, email_templates, canvases). Cierra el drift `kb_entry: null` heredado de Phase 152.

## Rollback de la migración v29.1 (Phase 155)

Si tras Phase 155 surge un problema crítico que requiere restaurar el estado pre-cleanup, los siguientes reverts son seguros:

### Recipe 1: Restaurar archivos legacy + código consumidor (big atomic commit)
```bash
git revert <SHA-del-commit-Plan-155-02>
```
Restaura:
- `app/data/knowledge/` (11 archivos)
- `.planning/knowledge/` (12 archivos)
- `skill_orquestador_catbot_enriched.md` (raíz)
- `app/src/lib/knowledge-tree.ts` + 4 tests
- `app/src/app/api/catbot/knowledge/tree/route.ts`
- `app/src/components/settings/catbot-knowledge/tab-knowledge-tree.tsx`
- `query_knowledge` + `explain_feature` cases en `catbot-tools.ts`
- `mapConceptItem`/`renderConceptItem` helpers
- Dockerfile + docker-entrypoint.sh con data-seed/knowledge
- CLAUDE.md §Protocolo de Documentación + §Restricciones absolutas (pre-155 shape)

Tras revert: `cd app && npm install && docker compose build docflow && docker compose up -d`. Esperado: build passes, vitest verde, container healthy. 32/32 tests verdes en `knowledge-tree.test.ts` (el subject vive otra vez).

### Recipe 2: Restaurar solo canvas-rules.ts al modo MD-catalog (Plan 01 revert)
```bash
git revert <SHA-del-commit-Plan-155-01>
```
Restaura la versión pre-155 de `canvas-rules.ts` (lee de `app/data/knowledge/canvas-*.md`). NOTA: solo tiene sentido SI también se reverte Plan 02 (Recipe 1), porque `canvas-rules.ts` pre-155 busca archivos que Plan 02 borró.

### Recipe 3: Restaurar estado KB pre-backfill
```bash
git revert <SHA-del-commit-chore(kb):-backfill>
```
Devuelve el snapshot `.docflow-kb/resources/*.md` al estado pre-Plan-03. Si prefieres regenerar desde DB live (en lugar de volver al snapshot), correr:
```bash
cd /home/deskmath/docflow && node scripts/kb-sync.cjs --full-rebuild --source db
```

### Recipe 4: Rollback de R26-R29 + taxonomy extension
```bash
git revert <SHA-del-commit-Plan-155-03>
```
Borra R26-R29 + devuelve tag-taxonomy.json al estado pre-extensión. Sólo hacer esto si las reglas R26-R29 han sido reemplazadas por otro mecanismo de discovery (ej. volver a CLAUDE.md §Restricciones absolutas).

### Nota sobre reverts tardíos

Los 4 reverts son seguros durante ~30 días. Si se mergea a prod + pasan semanas con la DB evolucionando:
- Revert del backfill (Recipe 3) puede chocar con rows nuevas en DB live. Re-correr `kb-sync.cjs --full-rebuild --source db` es más seguro.
- Revert de archivos legacy (Recipe 1): los JSONs `app/data/knowledge/*.json` restaurados drifted del formato que actualmente espera `query_knowledge` (Phase 152 hizo Zod extensions). Probable que requiera patch manual a `_index.json.areas[].updated_at` o re-extender Zod.

### Verificación post-rollback
- `cd /home/deskmath/docflow/app && npx vitest run` → suite verde (asumiendo Phase 152 Zod extensions se preserven — están en una commit anterior separada).
- `ls app/data/knowledge/` → 11 archivos restaurados.
- `curl http://localhost:3500/api/catbot/chat` con "knowledge tree areas" → CatBot cita los 7 áreas legacy.
