# Phase 150: KB Populate desde DB — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Source:** Decisiones delegadas por usuario, derivadas de Phase 149 CONTEXT + PRD §7 Fase 2 (`.planning/ANALYSIS-knowledge-base-architecture.md`) + scout de código real

<domain>
## Phase Boundary

Implementar la semántica real de `kb-sync.cjs --full-rebuild --source db`, que en Phase 149 existe sólo como stub con error "Not implemented — Fase 2 del PRD". Esta fase lee las tablas live de la DB y genera archivos Markdown con frontmatter válido en `.docflow-kb/resources/{catpaws,connectors,skills,catbrains,email-templates,canvases}/`, regenera `_index.json` con contenido real y valida que todo pase el schema de Phase 149.

**En scope (equivale a PRD §7 Fase 2):**

1. `kb-sync.cjs --full-rebuild --source db` deja de rechazar y:
   - Lee las 6 tablas DB live (`cat_paws`, `connectors`, `skills`, `catbrains`, `email_templates`, `canvases`).
   - Para cada fila, llama `syncResource(entity, 'create', row, { author: 'kb-sync-bootstrap' })` o escribe directamente los archivos, manteniendo el contrato de `knowledge-sync.ts` (Phase 149).
   - Genera los archivos `.docflow-kb/resources/<type>/<id-corto>-<slug>.md` con frontmatter bilingüe (ver Mapeo DB→frontmatter).
2. Regenera `_index.json` v2 con `entry_count` real, `header.counts.*_active`, `entries[]`, e índices `by_type`/`by_tag`/`by_audience`.
3. Regenera `_header.md` con conteos reales (usando lo ya implementado en Phase 149 para el stub vacío).
4. Tests de integración: fixture SQLite con N filas por tipo → correr `--source db` → validar archivos generados + _index.json + schema compliance.
5. Documentación: actualizar `_manual.md` explicando cómo correr `--source db` y qué produce.
6. Commit snapshot del KB poblado.

**Fuera de scope (pertenecen a fases posteriores del PRD):**

- PRD Fase 3: migración estática de `.planning/knowledge/*.md`, `app/data/knowledge/*.json`, skills dispersas (va en fase GSD posterior).
- PRD Fase 4: consumo por CatBot (`get_kb_entry`, `search_kb`, prompt-assembler lee `_header.md`).
- PRD Fase 5: enganchar `create_cat_paw`, etc. a `syncResource`.
- PRD Fase 6: dashboard `/knowledge`.
- PRD Fase 7: borrado de `app/data/knowledge/*.json` y `.planning/knowledge/*.md`.

El KB queda poblado como **lectura** pero ningún consumidor lo usa todavía. El `create_cat_paw` sigue sin llamar `syncResource` (Fase 5).

</domain>

<decisions>
## Implementation Decisions

El usuario delegó las decisiones ("analiza y decide lo mejor"). Todas las decisiones siguientes son **locked** para el planner salvo donde se marque "Claude's Discretion".

### D1. Scope de entidades — 6 tipos (no 5)

El título de la fase lista 5 (`catpaws, connectors, skills, catbrains, templates`), pero el esqueleto `resources/` creado en Phase 149 tiene 6 subdirectorios. Se popula los 6:

| KB folder | DB table | Tipo KB (`type: resource`, `subtype`) |
|---|---|---|
| `resources/catpaws/` | `cat_paws` | `subtype: catpaw` |
| `resources/connectors/` | `connectors` | `subtype: connector` |
| `resources/skills/` | `skills` | `subtype: skill` |
| `resources/catbrains/` | `catbrains` | `subtype: catbrain` |
| `resources/email-templates/` | `email_templates` | `subtype: email-template` |
| `resources/canvases/` | `canvases` | `subtype: canvas` |

**Razón:** El PRD §7 Fase 2 dice "genera archivos `resources/*` desde las tablas live" sin excluir canvases. Phase 149 ya creó `resources/canvases/` (vacía). Dejar un subdirectorio definido y no poblarlo deja deuda inconsistente. "Templates" en el título = `email_templates` (única tabla claramente de plantillas; `task_templates` y `canvas_templates` son metadata interna, no recursos de usuario).

**Nota sobre canvases:** La tabla `canvases` tiene flag `is_template` — filtrar sólo `is_template=1` como recursos KB **o** incluir todos. **Decisión: incluir todos** (canvases activos también son recursos que CatBot debe conocer). Canvases `status='archived'` se incluyen con `status: deprecated` en KB (ver D3).

### D2. Mapeo DB → frontmatter

Para **cada** fila DB se genera un archivo `.docflow-kb/resources/<type>/<short-id>-<kebab-slug-del-name>.md`. `short-id` = primeros 8 caracteres del UUID (`id.slice(0, 8)`). Ejemplo: `53f19c51-operador-holded.md`. Si `name` tiene caracteres no-ASCII, normalizar con `slugify` (minúsculas, ASCII, guiones).

**Campos del frontmatter por tipo (tabla unificada):**

| Frontmatter | Origen |
|---|---|
| `id` | `<short-id>-<slug>` (mismo que filename sin `.md`) |
| `type` | `resource` |
| `subtype` | `catpaw` / `connector` / `skill` / `catbrain` / `email-template` / `canvas` |
| `lang` | `es` (monolingüe inicial — ver razón abajo) |
| `title` | `row.name` (string, no dict, porque `lang: es`) |
| `summary` | `row.description` (truncada a 200 chars si más larga) o fallback `"{subtype} sin descripción"` |
| `tags` | Derivados mecánicamente (ver tabla D2.1) |
| `audience` | `['catbot', 'architect']` por defecto; `['catbot', 'developer']` para skills |
| `status` | `row.is_active=1 → 'active'`; `=0 → 'deprecated'`; canvases `status='archived' → 'deprecated'`; catbrains `status='draft' → 'draft'` |
| `created_at` | `row.created_at` (o `row.updated_at` si falta) |
| `created_by` | `'kb-sync-bootstrap'` (autor sintético para esta fase; en Fase 5 los `create_*` pondrán el real) |
| `version` | `'1.0.0'` (primera escritura siempre) |
| `updated_at` | `row.updated_at` o now() |
| `updated_by` | `'kb-sync-bootstrap'` |
| `source_of_truth` | `[{ db: 'sqlite', table: '<tablename>', id: row.id, fields_from_db: [...] }]` (campos fijos por tipo, ver D2.2) |
| `ttl` | `'never'` (recursos vivos — no caducan por TTL) |
| `change_log` | 1 entrada inicial `{ version: '1.0.0', date: now, author: 'kb-sync-bootstrap', reason: 'Initial population from DB via Phase 150' }` |
| `last_accessed_at`, `access_count` | **NO se incluyen** (sólo si `ttl: managed`; nuestro ttl es `never`) |
| `deprecated_at`/`by`/`reason` | Si `status: deprecated` → `deprecated_at: row.updated_at`, `deprecated_by: 'kb-sync-bootstrap'`, `deprecated_reason: 'is_active=0 at first population'` o `'status=archived at first population'` |

**Cuerpo del Markdown (debajo del frontmatter):** Sección fija por tipo con render legible de los campos principales. Detalle completo del shape en el plan que construya el planner. Mínimo:
- `## Descripción` — `row.description`
- `## Configuración` — campos técnicos del tipo (ver D2.2)
- `## Relaciones` — tabla de relaciones (join tables) cuando aplican (ver D2.3)

#### D2.1. Derivación automática de `tags`

`tags` debe estar en la taxonomía `tag-taxonomy.json` (Phase 149). Reglas por tipo:

- **catpaws:** `['catpaw', row.mode]` + `row.department_tags?.split(',')` filtrados a `departments` de la taxonomía (`business|finance|production|other`). Si el catpaw tiene `cat_paw_connectors` joined → añadir cada `connector.type` si está en `connectors` de la taxonomía.
- **connectors:** `['connector', row.type]` filtrado contra `connectors` + `domains` de la taxonomía (p.ej. `gmail → ['connector', 'gmail', 'email']`). Tabla de mapeo se define en el plan.
- **skills:** `['skill']` + `row.tags?.split(',')` filtrados contra `cross_cutting` de la taxonomía. Si `row.category` mapea a `roles` de la taxonomía (`extractor|transformer|synthesizer|renderer|emitter|guard|reporter`) → añadir.
- **catbrains:** `['catbrain']` + mode heurístico: si `rag_enabled=1` → `chat`; si tiene `catbrain_connectors` → `processor`; sino `hybrid`.
- **email-templates:** `['template', 'email']` + `row.category` si mapea a `domains` de la taxonomía.
- **canvases:** `['canvas', row.mode]` + `row.tags?.split(',')` filtrados contra la taxonomía.

**Tags desconocidos se filtran silenciosamente** (validate-kb.cjs luego rechazaría el archivo). Log WARN por archivo con tags descartados.

#### D2.2. `source_of_truth.fields_from_db` por tipo

Estos son los campos que **siempre gana DB** en futuros syncs (Phase 149 §5.3). Todo lo demás que aparezca en el cuerpo del markdown es "enriched" y nunca se toca en auto-sync.

| Tipo | `fields_from_db` |
|---|---|
| catpaw | `['name', 'description', 'mode', 'model', 'system_prompt', 'tone', 'department_tags', 'is_active', 'times_used', 'temperature', 'max_tokens', 'output_format']` |
| connector | `['name', 'description', 'type', 'is_active', 'times_used', 'test_status']` (NO `config` — puede contener secretos) |
| skill | `['name', 'description', 'category', 'tags', 'instructions', 'source', 'version', 'author', 'times_used']` |
| catbrain | `['name', 'description', 'purpose', 'tech_stack', 'status', 'agent_id', 'rag_enabled', 'rag_collection']` |
| email-template | `['name', 'description', 'category', 'is_active', 'times_used']` (NO `structure` ni `html_preview` — bulk binary) |
| canvas | `['name', 'description', 'mode', 'status', 'tags', 'is_template']` (NO `flow_data` ni `thumbnail` — bulk) |

**Regla de seguridad:** nunca escribir al KB campos que contengan secretos (`connectors.config` puede traer API keys), ni payloads pesados (`canvases.flow_data`, `email_templates.html_preview`). El planner valida esto explícitamente.

#### D2.3. Relaciones cross-entity

Join tables existen (`cat_paw_catbrains`, `cat_paw_connectors`, `cat_paw_skills`, `catbrain_connectors`). Se renderizan como campo `related` del frontmatter (array de `{ type, id }`) y se enumeran en la sección `## Relaciones` del markdown. Ejemplo para un catpaw:

```yaml
related:
  - { type: catbrain, id: <catbrain-short-id> }
  - { type: connector, id: <connector-short-id> }
  - { type: skill, id: <skill-short-id> }
```

Los IDs en `related` usan el mismo `<short-id>-<slug>` que los filenames de los recursos relacionados. Esto requiere **dos pasadas**: primera pasada genera mapa `row.id → short-id-slug` por tipo; segunda pasada escribe archivos ya con `related` resuelto.

### D3. Semántica de `--full-rebuild --source db`

**Modo:** Upsert idempotente — NO borra `resources/` antes de poblar.

1. Primera pasada (read-only): carga todas las filas DB y construye mapa de IDs.
2. Segunda pasada (write): por cada fila, llama a `syncResource(subtype, op, row)`:
   - Si archivo NO existe → `op: 'create'` (version `1.0.0`, change_log con entrada inicial).
   - Si archivo existe → `op: 'update'` (aplica merge Phase 149 §5.3: fields_from_db pisan, enriched_fields se preservan, `detectBumpLevel` decide version bump).
   - Si DB row falta pero archivo existe → **no se toca en este rebuild** (marcar como orphan handler es Fase 5 cuando tools de delete llamen `markDeprecated`). Se loguea WARN con el conteo de orphans.
3. Regenera `_index.json` desde cero leyendo todos los frontmatter (reusa código `--full-rebuild` de Phase 149).
4. Regenera `_header.md` con conteos reales.
5. Corre `scripts/validate-kb.cjs` al final; si falla → CLI exit 1.

**Flags:**

- `--source db` (obligatorio — sin él, `--full-rebuild` mantiene comportamiento Phase 149 regenerando sólo `_index.json` desde frontmatters existentes).
- `--dry-run` (nuevo) — imprime plan de cambios (N files to create, M to update, K orphans) sin escribir. **Obligatorio implementarlo** para permitir al usuario ver qué pasará.
- `--verbose` (nuevo) — loguea cada archivo creado/actualizado con su version bump.
- `--only <subtype>` (nuevo, opcional) — limita el rebuild a un tipo (`catpaw|connector|...`). Útil para debugging y tests.
- NO hay `--force-delete-resources` ni similar — eliminar archivos es Fase 5.

**Idempotencia:** correr `--full-rebuild --source db` dos veces seguidas en DB estable debe producir un segundo run sin cambios (version no se bumpea porque `detectBumpLevel` devuelve bump sólo ante cambio real). Tests cubren esto explícitamente.

**Estado DB filtrado:**
- Catpaws/connectors/templates con `is_active=0` → archivo con `status: deprecated`, NO se saltan.
- Catbrains con `status='archived'` (si existe) → `status: deprecated`.
- Skills con `source='built-in'` se incluyen (son parte del KB).

### D4. Verificación y CatBot oracle

CLAUDE.md §"Protocolo de Testing: CatBot como Oráculo" se aplica pero con matiz: en esta fase no añadimos tools nuevas a CatBot (eso es Fase 4 PRD). La verificación tiene dos niveles:

**Nivel 1 — Tests automáticos (plan obligatorio):**

- Fixture SQLite con ≥2 filas por tipo (12+ total) en estados variados (active/inactive/archived).
- Test: `--source db --dry-run` sobre DB vacía → reporta 0 files.
- Test: `--source db` sobre fixture → escribe N archivos correctos, `_index.json` con `entry_count: N`, todos los archivos pasan `validate-kb.cjs`.
- Test idempotencia: segundo run → 0 cambios, 0 bumps.
- Test detección de cambio: modifica 1 fila fixture → re-run → 1 archivo actualizado con version bump correcto según tabla §5.2.
- Test orphan: borra 1 fila fixture → re-run → archivo persiste, WARN loguea orphan.
- Test `--only <subtype>` → toca sólo ese tipo.
- Test seguridad: verifica que `connectors.config` NO aparece en ningún archivo generado.

**Nivel 2 — Oracle CatBot (mandatorio pre-cierre):**

El `_manual.md` del KB se actualiza con sección "Contenido actual del KB" que lista los tipos poblados y sus conteos. CatBot ya lee `_manual.md` vía contexto del knowledge tree (eventualmente via Fase 4), pero para **esta fase** basta con que:

- El KB real en dev tenga contenido tras correr `--source db` (comando manual en el servidor dev con DB real).
- Se pegue en el `150-VERIFICATION.md` un prompt a CatBot tipo: *"Lista los CatPaws que existen en el sistema"* y la respuesta usando sus tools actuales (`list_cat_paws`) para confirmar paridad con los archivos KB generados (mismo count, mismos nombres).
- No se añaden tools nuevas a CatBot en esta fase. Si la verificación del oracle detecta gap (CatBot no puede contar archivos del KB), se documenta como gap para Fase 4 PRD, no bloquea cierre de fase 150.

### D5. Ubicación del código nuevo

- Lógica de lectura DB + transformación → nuevo módulo `scripts/kb-sync-db-source.cjs` (o equivalente en `.ts` si encaja mejor con el resto de scripts). El planner elige. Razón: aísla la nueva complejidad del CLI root actual.
- `scripts/kb-sync.cjs` existente se modifica sólo para (a) quitar el rechazo del flag `--source db` y (b) delegar al nuevo módulo.
- Tests → `scripts/__tests__/kb-sync-db-source.test.cjs` (o `.ts`) siguiendo convención ya usada en Phase 149 para `kb-sync-cli.test.ts`.

### Claude's Discretion

El planner decide:

- Runtime de tests para el nuevo módulo (sigue convención Phase 149: vitest/jest del repo).
- TypeScript vs CJS para el nuevo módulo — preferir seguir lo que hizo Phase 149 con `kb-sync.cjs` (CJS) para consistencia del CLI; si el módulo crece mucho (>400 líneas) puede splitearse.
- Cómo exponer el mapa `row.id → short-id-slug` entre pasadas (in-memory, pase de arg, etc.).
- Logging exacto (formato legible/humano, no estructurado) — seguir estilo del `kb-sync.cjs` existente.
- Si usar `better-sqlite3` directamente o ir por la capa existente de `app/src/lib/db.ts`. **Recomendación:** directamente con `better-sqlite3` y la misma DB file path que resuelve `db.ts`, para que el script no arrastre el bundle entero de Next.
- Exit codes concretos (0 éxito, 1 validation fail, 2 invalid args, etc.).
- Cómo manejar filas con `id` no-UUID o `name` vacío (skip + WARN, o fail, o placeholder — el planner decide con justificación).

### Razones de monolingüe `lang: es`

El PRD §3.3 permite `es | en | es+en` y muestra ejemplos bilingües (Apéndices A/B). Pero:

1. El contenido de las tablas DB está en español (descripciones, names, system_prompts). No hay versión inglesa en la DB.
2. Generar `lang: es+en` con `title.es` y `title.en` "igual al español" sería fingir contenido bilingüe. El schema exige dict, y rellenar ambos campos con el mismo string es ruido.
3. Traducción automática (`kb-sync.cjs --translate`) es §8.4 del PRD y está explícitamente fuera de scope de Phase 149 y Phase 150.

Decisión: todos los archivos se escriben con `lang: es`. `title` y `summary` son strings simples. Si en el futuro alguien añade traducción, `detectBumpLevel` la registra como bump `minor` (tabla §5.2: "Traducción añadida → minor"). Esto es lo ortodoxo con el PRD.

</decisions>

<specifics>
## Specific Ideas

### Shape canónico de un archivo generado (catpaw)

```markdown
---
id: 53f19c51-operador-holded
type: resource
subtype: catpaw
lang: es
title: Operador Holded
summary: Gestiona operaciones CRM en Holded — lectura y creación de contactos, facturas y proyectos
tags: [catpaw, chat, business, holded, crm]
audience: [catbot, architect]
status: active
created_at: 2026-02-10T09:12:00Z
created_by: kb-sync-bootstrap
version: 1.0.0
updated_at: 2026-04-18T11:00:00Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 53f19c51-2a1f-4b89-8f3e-abcdef123456
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format]
ttl: never
related:
  - { type: catbrain, id: 7c8d9e0a-holded-ops }
  - { type: connector, id: 4f5e6a7b-holded-api }
change_log:
  - { version: 1.0.0, date: 2026-04-18, author: kb-sync-bootstrap, reason: "Initial population from DB via Phase 150" }
---

## Descripción

Gestiona operaciones CRM en Holded...

## Configuración

- **Mode:** chat
- **Model:** gemini-main
- **Temperatura:** 0.7
- **Max tokens:** 4096
- **Output format:** md
- **Tone:** profesional

## System Prompt

[contenido de system_prompt]

## Relaciones

| Tipo | ID | Nombre |
|------|----|----|
| catbrain | 7c8d9e0a-holded-ops | Catbrain Holded Ops |
| connector | 4f5e6a7b-holded-api | Holded API |
```

Este es el contrato que el planner tiene que respetar literalmente — deriva directo del §Apéndice A del PRD simplificado a monolingüe.

### Integración con validate-kb.cjs (Phase 149)

`scripts/validate-kb.cjs` ya valida todo `.docflow-kb/**/*.md` contra `frontmatter.schema.json`. El rebuild `--source db` debe terminar llamándolo. Si falla → exit 1 con lista de archivos inválidos. Esto protege contra bugs del mapeo DB→frontmatter.

### Comando canónico de ejecución

Tras completar la fase, el comando que puebla el KB en un servidor dev es literalmente:

```bash
node scripts/kb-sync.cjs --full-rebuild --source db --verbose
```

Documentado en `_manual.md` y en `150-VERIFICATION.md`.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets

- `app/src/lib/services/knowledge-sync.ts` — `syncResource(entity, op, row, context?)`, `touchAccess`, `detectBumpLevel`, `markDeprecated`. Ya existe desde Phase 149. Esta fase lo llama, no lo modifica.
- `scripts/kb-sync.cjs` — CLI con `--full-rebuild`, `--audit-stale`, `--archive`, `--purge`. Sólo hay que extender `--full-rebuild` para aceptar `--source db`.
- `scripts/validate-kb.cjs` — validador de frontmatter contra schema. Se llama al final del rebuild.
- `.docflow-kb/_schema/frontmatter.schema.json`, `tag-taxonomy.json`, `resource.schema.json` — todo el esqueleto de validación ya existe.
- `app/src/lib/db.ts` — 6 tablas target (`cat_paws`, `connectors`, `skills`, `catbrains`, `email_templates`, `canvases`) con columnas ya conocidas (ver D2.2).

### Established Patterns

- CLI en raíz ejecutable con `node scripts/*.cjs` — confirmado en Phase 149.
- Tests de integración bajo `scripts/__tests__/*.test.ts` — Phase 149 usó `kb-sync-cli.test.ts` con 13 tests.
- No tocar `CLAUDE.md` raíz en esta fase — se simplifica cuando el KB sea consumido (Fase 4+).
- Docker no afecta a esta fase: el CLI corre en host, lee SQLite file directamente.

### Integration Points

- DB file path: lo que `app/src/lib/db.ts` resuelva (típicamente `.data/app.db` o similar). El planner lee `db.ts` para extraer la resolución y reutilizarla o replicarla.
- `.docflow-kb/` — ya creado por Phase 149 con estructura completa.
- `_index.json` y `_header.md` — ya tienen stubs válidos que serán sobrescritos.
- Sin tocar Phase 149 tests — siguen pasando (esta fase no cambia contratos).

</code_context>

<deferred>
## Deferred Ideas

- **Traducción automática a inglés** (`kb-sync.cjs --translate <id> --to en`): PRD §8.4. Opcional, no-goal para esta fase.
- **Detección de orphans (archivo KB sin DB row) y auto-deprecation** en rebuild: queda como WARN log; la lógica de auto-deprecate es Fase 5 del PRD cuando `delete_cat_paw` y pares llamen a `markDeprecated`.
- **Consumo por CatBot** (`get_kb_entry`, `search_kb`, prompt-assembler leyendo `_header.md`): PRD Fase 4, fase GSD posterior.
- **Tools CatBot que listen contenido del KB** (`list_kb_resources`, `kb_stats`): también Fase 4 PRD. Si la verificación de esta fase descubre que CatBot no puede "ver" el KB poblado, se documenta como gap para Fase 4, no se implementa aquí.
- **Dashboard `/knowledge`** (PRD Fase 6): phase GSD posterior.
- **Migración de `.planning/knowledge/*.md` → `.docflow-kb/domain/concepts` y `rules/`**: PRD Fase 3, phase GSD posterior.
- **`.planning/reference/auditoria-catflow.md` movida/migrada al KB**: parte de PRD Fase 3.
- **Enganche de creation tools** (`create_cat_paw` → `syncResource`): PRD Fase 5.
- **Limpieza de `app/data/knowledge/*.json`**: PRD Fase 7.
- **`change_log` más rico con diffs**: por ahora sólo 1 entrada `version/date/author/reason`. Enriquecer con diff estructurado es una mejora opcional no-requerida por el PRD.
- **`search_hints` bilingües**: schema los permite; esta fase no los rellena porque `lang: es`. Fase 4 (consumo CatBot) puede introducirlos.
- **Batch / paralelismo I/O para miles de entradas**: la escala actual DocFlow (docenas a bajas centenas de filas por tipo) no lo justifica. Si en el futuro crece, es mejora incremental.

</deferred>

---

*Phase: 150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates*
*Context gathered: 2026-04-18 (decisiones delegadas por usuario, derivadas de PRD §7 Fase 2 + scout DB real)*
