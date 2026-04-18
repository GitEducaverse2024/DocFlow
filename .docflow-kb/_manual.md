# Knowledge Base de DocFlow — Manual de Navegación

## Propósito

Este árbol (`.docflow-kb/`) es el **Source of Truth** unificado del conocimiento DocFlow. Su objetivo es reemplazar los silos dispersos que existen hoy:

- `app/data/knowledge/*.json` — catálogos runtime del CatBot (catboard, catbrains, catpaw, catflow, canvas, catpower, settings).
- `.planning/knowledge/*.md` — catálogos manuales editoriales (catpaw-catalog, connectors-catalog, email-templates, canvas-nodes, incidents-log, proceso-catflow…).
- Skills sueltas (ej. `skill_orquestador_catbot_enriched.md`) en raíz del repo.
- Prompts hardcoded en código (`catbot-pipeline-prompts.ts`) y fragmentos de documentación en fases de `.planning/phases/*`.

**Estado actual: bootstrap.** Esta carpeta se creó en Phase 149 del roadmap. La estructura, schemas y herramientas están listas; **el contenido se migra en fases posteriores** del PRD `ANALYSIS-knowledge-base-architecture.md`. Los silos legacy siguen activos hasta que esas fases de migración los vacíen.

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
