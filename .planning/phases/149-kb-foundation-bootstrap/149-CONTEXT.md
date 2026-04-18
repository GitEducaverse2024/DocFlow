# Phase 149: KB Foundation Bootstrap — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Source:** PRD Express Path (`.planning/ANALYSIS-knowledge-base-architecture.md`)

<domain>
## Phase Boundary

Esta fase NO migra contenido. Crea la **infraestructura base** del Knowledge Base (`.docflow-kb/`) como Source of Truth unificado del conocimiento DocFlow y deja el terreno preparado para las fases siguientes (migración estática, consumo por CatBot, dashboard, limpieza).

**En scope (equivale a §7 "Fase 1 — Bootstrapping" + §D.2 "Operaciones inmediatas" del PRD):**

1. Crear `.docflow-kb/` con estructura de carpetas fija y `_manual.md`.
2. Definir `_schema/frontmatter.schema.json` (13 campos bilingües + lifecycle) y `_schema/tag-taxonomy.json` (vocabulario controlado).
3. Implementar servicio aislado `app/src/lib/services/knowledge-sync.ts` con `syncResource`, `touchAccess`, `detectBumpLevel`, `markDeprecated` + tests unitarios.
4. Implementar CLI `kb-sync.cjs` con comandos `--full-rebuild`, `--audit-stale`, `--archive --confirm`, `--purge --confirm`.
5. Crear `.docflow-legacy/` con `README.md` + subdirectorios vacíos preparados.
6. Limpieza raíz + `.planning/`: borrar duplicado `MILESTONE-CONTEXT-AUDIT.md`, fusionar `milestone-v29-revisado.md` (raíz) en `.planning/MILESTONE-CONTEXT.md` y borrarlo, mover `auditoria-catflow.md` (raíz) a `.planning/reference/`.
7. CI/validación: hook/script que valide frontmatter contra schema y falle si un archivo del KB incumple.

**Fuera de scope (pertenecen a fases posteriores del PRD):**

- §7 Fase 2: `--full-rebuild --source db` real (puebla desde tablas live).
- §7 Fase 3: migración de `.planning/knowledge/*.md`, `app/data/knowledge/*.json`, skills dispersas, prompts de código.
- §7 Fase 4: consumo por CatBot (prompt-assembler lee `_header.md`, tools `get_kb_entry`, `search_kb`).
- §7 Fase 5: enganchar `create_cat_paw`/`create_connector`/etc. a `syncResource`.
- §7 Fase 6: dashboard Next.js `/knowledge`.
- §7 Fase 7: eliminar `app/data/knowledge/*.json` y `.planning/knowledge/*.md`.

En esta fase `knowledge-sync.ts` existe y funciona sobre filesystem, pero ninguna tool de creación lo llama todavía — eso es trabajo de Fase 5 del PRD. El CLI `kb-sync.cjs` tampoco lee de DB real todavía; la plomería queda lista para que Fase 2 enchufe fuentes.

</domain>

<decisions>
## Implementation Decisions

Todo lo listado aquí proviene del PRD y es **decisión cerrada**. No renegociar durante planificación.

### Ubicación y naming

- **Raíz del KB:** `.docflow-kb/` en el root del repo (§8.1 del PRD — decidido).
- **Zona legacy transitoria:** `.docflow-legacy/` en el root (§D.1 🟡).
- **Archivos especiales con prefijo `_`:** `_index.json`, `_header.md`, `_manual.md`, `_schema/`, `_archived/`, `_audit_stale.md` (§3.2).
- **Archivos MD en kebab-case.** Instancias con prefijo de id corto (primeros 8 chars del UUID): `53f19c51-operador-holded.md`. Reglas con código + slug: `R10-preserve-fields.md`. Fases con número. Incidentes con `INC-`. Protocolos sin prefijo.

### Estructura de carpetas `.docflow-kb/` (§3.1)

Se crea exactamente esta estructura con los subdirectorios vacíos y un `.gitkeep` donde corresponda:

```
.docflow-kb/
├── _index.json                 (stub vacío válido contra schema v2)
├── _header.md                  (stub)
├── _manual.md                  (documento explicativo real)
├── _schema/
│   ├── frontmatter.schema.json
│   ├── resource.schema.json
│   └── tag-taxonomy.json
├── domain/
│   ├── concepts/
│   ├── taxonomies/
│   └── architecture/
├── resources/
│   ├── catpaws/
│   ├── connectors/
│   ├── catbrains/
│   ├── email-templates/
│   ├── skills/
│   └── canvases/
├── rules/
├── protocols/
├── runtime/
├── incidents/
├── features/
├── guides/
└── state/
```

### Frontmatter universal (§3.3)

Schema JSON valida los 13 campos obligatorios + campos condicionales. Los 13 son:

1. `id` — kebab-case único estable
2. `type` — enum: `concept | taxonomy | resource | rule | protocol | runtime | incident | feature | guide | state`
3. `subtype` — string o null
4. `lang` — enum: `es | en | es+en`
5. `title` — si `lang: es+en` ⇒ dict `{es, en}`; si no, string
6. `summary` — mismas reglas que `title`
7. `tags` — array contra `tag-taxonomy.json`
8. `audience` — array enum: `catbot | architect | developer | user | onboarding`
9. `status` — enum: `active | deprecated | draft | experimental`
10. `created_at` + `created_by`
11. `version` — semver completo `M.m.p`
12. `updated_at` + `updated_by`
13. `source_of_truth` — array de `{ db, id, fields_from_db[] }` (null permitido para docs puramente editoriales como concepts/rules/guides)

Campos adicionales requeridos por schema cuando aplican:
- `last_accessed_at` + `access_count` — requeridos si `ttl: managed`.
- `deprecated_at` + `deprecated_by` + `deprecated_reason` — requeridos si `status: deprecated`.
- `superseded_by` — opcional incluso si deprecated.
- `change_log` — array obligatorio (puede empezar con 1 entry de creación).
- `search_hints` — dict `{es, en}` si `lang: es+en`.
- `ttl` — enum `never | managed | 30d | 180d`.

### Tag taxonomy (§3.4)

`_schema/tag-taxonomy.json` literal del PRD:

```json
{
  "domains": ["crm", "email", "storage", "analytics", "auth", "scheduling"],
  "entities": ["catpaw", "catflow", "canvas", "catbrain", "connector", "skill", "template"],
  "modes": ["chat", "processor", "hybrid"],
  "connectors": ["gmail", "holded", "drive", "mcp", "http", "n8n", "smtp"],
  "roles": ["extractor", "transformer", "synthesizer", "renderer", "emitter", "guard", "reporter"],
  "departments": ["business", "finance", "production", "other"],
  "rules": ["R01", "R02", "R10", "R13", "SE01", "DA01"],
  "cross_cutting": ["safety", "performance", "learning", "ux", "ops", "testing"]
}
```

Validador: un tag solo es válido si aparece en alguna de las listas. Categoría implícita, no se declara en el archivo.

### Servicio `knowledge-sync.ts` (§5.1, §5.2)

Ubicación: `app/src/lib/services/knowledge-sync.ts`.

Funciones públicas:

- `syncResource(entity, op, row, context?)` — orquesta create/update/delete/access. Llama a los helpers internos. Actualiza `_index.json` y `_header.md` al final.
- `touchAccess(path)` — incrementa `access_count` y actualiza `last_accessed_at`.
- `detectBumpLevel(currentFile, newRow)` — devuelve `'patch' | 'minor' | 'major'` según tabla §5.2:
  - **patch:** `times_used`, `updated_at` en DB; edición de `enriched_fields`; cambio de `description`/`tags` añadidos.
  - **minor:** `system_prompt`, `connectors`/`skills` linked, `related` crítico añadido/quitado, traducción añadida.
  - **major:** `mode`, `status → deprecated`, `subtype`, cambio incompatible con contract I/O.
- `markDeprecated(path, row, author)` — soft delete: `status: deprecated`, `deprecated_at`, `deprecated_by`, `deprecated_reason`, `superseded_by` opcional. Nunca borra físicamente.

Helpers internos (pueden ser privados del módulo): `writeResourceMarkdown`, `updateResourceMarkdown`, `updateIndexEntry`, `regenerateHeader`, `invalidateLLMCache` (puede ser no-op/stub en esta fase — la integración real es trabajo de Fase 4).

Invariante protegido: merge DB ↔ archivo según §5.3 "Conflictos DB ↔ archivo":

| Caso | Resolución |
|------|------------|
| Edit humano en `enriched_fields` | Respetado. Bump patch. |
| Edit humano en `source_of_truth.fields_from_db` | Auto-sync lo pisa; warning en change_log. |
| DB update sin cambio en archivo | Auto-sync actualiza + patch bump. |
| Edit + DB update simultáneos | DB gana en `fields_from_db`, archivo gana en `enriched_fields`. |
| DB row borrado, archivo existe | `status → deprecated`, razón: "DB row removed at {ts}". |

Implementación: leer archivo actual, preservar `enriched_fields`, sobrescribir solo `fields_from_db`.

**Tests unitarios obligatorios** (cobertura por función, sin mocks de disco — temp dirs reales):
- `detectBumpLevel` — 1 test por cada fila de la tabla §5.2.
- `syncResource create` — escribe archivo + frontmatter válido + `_index.json` actualizado.
- `syncResource update` — preserva `enriched_fields`; bump correcto; `change_log` crece.
- `syncResource delete` — soft delete correcto; archivo sigue existiendo.
- `syncResource access` — `access_count++`, `last_accessed_at` actualizado, sin otros cambios.
- `touchAccess` directo — misma semántica que `op: access`.
- Merge conflict — edición local en `enriched_fields` sobrevive a update de DB.

### CLI `kb-sync.cjs` (§5.3 workflow de purga, §D.2)

Ubicación: root del repo (mismo nivel que otros CLIs) o `scripts/kb-sync.cjs` si ya existe esa convención. **Planificador:** verifica convención existente antes de decidir.

Comandos obligatorios:

- `--full-rebuild` — regenera `_index.json` desde cero leyendo todos los frontmatter del KB. En esta fase NO lee DB todavía (ese es trabajo de Fase 2 del PRD). Si el KB está vacío, genera `_index.json` con `entry_count: 0` válido contra schema v2.
- `--audit-stale` — genera `.docflow-kb/_audit_stale.md` con archivos `deprecated + last_accessed_at > 150d`. Formato del §Apéndice C.
- `--archive --confirm` — mueve elegibles (180d sin acceso, deprecated, sin refs) a `.docflow-kb/_archived/YYYY-MM-DD/`, status `deprecated → archived`. Requiere `--confirm` explícito o aborta.
- `--purge --confirm --older-than-archived=365d` — borrado físico solo de archivos que lleven >1 año en `_archived/`. Requiere `--confirm` explícito.

**Nunca purga sin confirmación.** Nunca archiva sin confirmación. Workflow:
- Día 150: aviso informativo en `_audit_stale.md`.
- Día 170: aviso visible (flag `warning_visible: true` en el MD).
- Día 180: elegible para archivar — requiere `--archive --confirm`.
- Día 365 post-archivado: elegible para purga física — requiere `--purge --confirm`.

### CI validation (§8.3 — decidido)

Desde el día 1 debe existir validación de frontmatter. Mínimo viable aceptable: un script `scripts/validate-kb.cjs` (o integrado en el CLI) que:

- Recorra `.docflow-kb/**/*.md` (excluyendo `_archived/` y los stubs `_header.md`, `_manual.md`).
- Para cada archivo, extraiga el frontmatter y lo valide contra `frontmatter.schema.json`.
- Falle con exit 1 si algún archivo incumple, listando los errores.

**Planificador:** integrar en pipeline CI existente del repo (si existe `.github/workflows/` u otro); si no existe pipeline, dejar el script ejecutable y documentar en `_manual.md` cómo correrlo local.

### `.docflow-legacy/` (§D.1 🟡)

Estructura inicial (vacía pero preparada):

```
.docflow-legacy/
├── README.md                     (explica propósito + reglas)
├── audits-closed/                (vacío — .gitkeep)
├── milestone-retrospectives/     (vacío — .gitkeep)
├── catalogs-pre-kb/              (vacío — .gitkeep)
├── json-pre-kb/                  (vacío — .gitkeep)
└── _migration-log.md             (archivo vacío con frontmatter listo para recibir entries)
```

`README.md` debe explicar: zona transitoria, material cuyo insight vive en otro sitio o milestone cerrado, purga física tras ~180d sin acceso (según §5.3), movimientos registrados en `_migration-log.md`.

### Operaciones inmediatas de limpieza (§D.2)

Pre-requisitos que esta fase ejecuta como tareas concretas:

1. Verificar que `.planning/MILESTONE-CONTEXT-AUDIT.md` es duplicado literal de `AUDIT-respuestas-funnel-completo.md` (`diff` exit 0). Si sí: borrar. Si diverge: escalar al usuario, no borrar.
2. Fusionar `milestone-v29-revisado.md` (raíz) en `.planning/MILESTONE-CONTEXT.md`. El revisado **reemplaza, no suma** (versión post-piloto v28 con los 3 bugs canvas-executor + restricciones aplicadas). Borrar el archivo raíz tras fusión.
3. Crear `.planning/reference/` si no existe. Mover `auditoria-catflow.md` (raíz) → `.planning/reference/auditoria-catflow.md`.
4. Actualizar `.planning/Index.md` para:
   - Apuntar a `.docflow-kb/_manual.md` como fuente de conocimiento cuando la migración avance.
   - Marcar catálogos de `.planning/knowledge/` como "migrables en fases siguientes" (NO borrar todavía — viven en `.planning/` hasta Fase 7 del PRD).
   - Añadir puntero a `.planning/reference/auditoria-catflow.md`.

### Qué NO se toca en esta fase

- `.planning/knowledge/*.md` — siguen vivos tal cual, se migran en Fase 3 del PRD.
- `app/data/knowledge/*.json` — siguen vivos, se migran en Fase 3 del PRD.
- `skill_orquestador_catbot_enriched.md` (raíz) — sigue viva tal cual (migra en Fase 3).
- `.claude/skills/docatflow-conventions.md` — no se toca (§D.1 ⚪).
- `CLAUDE.md` (raíz) — no se toca en esta fase; se simplifica cuando el KB tenga `_manual.md` real y consumible (fases posteriores).
- `app/src/lib/services/catbot-pipeline-prompts.ts` — prompts siguen hardcoded, se extraen en Fase 3 del PRD.
- `create_cat_paw`/`create_connector`/etc. — no se enganchan a `syncResource` todavía (Fase 5 del PRD).

### Claude's Discretion

El PRD no fija los siguientes detalles; el planificador decide justificadamente:

- Runtime de tests (Vitest/Jest) — seguir convención existente del repo.
- Estructura interna modular de `knowledge-sync.ts` (un solo archivo vs split en helpers) — preferir un solo archivo si <500 líneas, split si mayor.
- Implementación de `invalidateLLMCache` en esta fase — puede ser un no-op documentado (`TODO: wired in Phase 4 del PRD`). No debe pretender hacer algo que no hace.
- Formato exacto del stub de `_index.json` v2 (campos `header`, `entries`, `indexes`) — seguir el shape del §4.1 del PRD al pie de la letra.
- Reglas exactas de `change_log` (truncar a los últimos 5 vs mantener todo) — PRD dice "últimos 5 cambios (histórico completo en git)". Implementar: truncar a últimos 5 en el frontmatter.
- Ubicación de `scripts/validate-kb.cjs` y `kb-sync.cjs` — seguir convención existente del repo.
- Si el CI ya existe, integrar validación como step; si no, dejar script local y documentar.
- Estructura de tests (un archivo `knowledge-sync.test.ts` vs múltiples) — preferir un archivo si la suite es <300 líneas.

</decisions>

<specifics>
## Specific Ideas

### Shape literal del `_index.json` v2 (§4.1 del PRD)

```json
{
  "schema_version": "2.0",
  "generated_at": "ISO8601",
  "generated_by": "knowledge-sync",
  "entry_count": 0,
  "header": {
    "counts": {
      "catpaws_active": 0,
      "connectors_active": 0,
      "catbrains_active": 0,
      "templates_active": 0,
      "skills_active": 0,
      "rules": 0,
      "incidents_resolved": 0,
      "features_documented": 0
    },
    "top_tags": [],
    "last_changes": []
  },
  "entries": [],
  "indexes": {
    "by_type": {},
    "by_tag": {},
    "by_audience": {}
  }
}
```

Esto es lo que `--full-rebuild` produce en KB vacío.

### Ejemplo canónico de archivo bilingüe

Ver §Apéndice A del PRD (`53f19c51-operador-holded.md`) — es la referencia de verdad para el parser del schema. El planificador debe leer el apéndice completo y asegurarse de que el schema acepta ese archivo exacto sin errores.

### Ejemplo canónico de archivo deprecated

Ver §Apéndice B del PRD (`catpaw-b63164ed`). Schema debe permitir los campos `deprecated_at`, `deprecated_by`, `deprecated_reason`, `superseded_by` y exigirlos cuando `status: deprecated`.

### Ejemplo de `_audit_stale.md`

Ver §Apéndice C del PRD. Formato del frontmatter y la tabla debe respetarse (el CLI lo genera; tests pueden verificar contra el shape).

### Tabla de bump exhaustiva (§5.2 del PRD)

| Cambio detectado | Bump |
|------------------|------|
| Auto-sync por `times_used`, `updated_at` en DB | patch |
| Edición en `enriched_fields` | patch |
| Edición de campo técnico no-estructural | patch |
| Cambio en `system_prompt` | minor |
| Cambio en `connectors` linked | minor |
| Cambio en `skills` linked | minor |
| `related` crítico añadido/quitado | minor |
| Traducción añadida (`lang: es → es+en`) | minor |
| Cambio de `mode` | major |
| `status → deprecated` | major |
| Cambio de `subtype` | major |
| Cambio incompatible con contract I/O | major |

`detectBumpLevel` debe cubrir cada fila explícitamente.

### Verificación con CatBot (CLAUDE.md Protocolo de Testing)

Esta fase crea infraestructura, no features user-facing. El oráculo CatBot aplica así:

- Tras completar la fase, CatBot debe poder responder "¿qué estructura tiene el KB?" apoyándose en `.docflow-kb/_manual.md`.
- CatBot no necesita tool nueva en esta fase (las tools `get_kb_entry`/`search_kb` son Fase 4 del PRD). Sí debe saber *que el KB existe* — al menos una mención en `app/data/knowledge/catboard.json` o equivalente apuntando a `.docflow-kb/` como zona en construcción.

El planificador decide si esto es un item del plan o una nota de seguimiento para Fase 3 del PRD.

</specifics>

<deferred>
## Deferred Ideas

Items mencionados en el PRD pero fuera del scope de Phase 149:

- **Fase 2 PRD — Pobla desde DB:** `kb-sync.cjs --full-rebuild --source db` que lee tablas live y genera `resources/*`. Esta fase deja el esqueleto del CLI pero la ejecución real con DB es Fase 2 del PRD → corresponde a una phase GSD posterior.
- **Fase 3 PRD — Migración estática:** splitting de catálogos, concepts desde JSONs, skills dispersas, prompts de código → phase GSD posterior.
- **Fase 4 PRD — Consumo por CatBot:** prompt-assembler leyendo `_header.md`, tools `get_kb_entry`/`search_kb`, bridge `kb_entry` path en tools existentes → phase GSD posterior.
- **Fase 5 PRD — Enganchar creation tools:** `create_cat_paw` → `syncResource` → phase GSD posterior.
- **Fase 6 PRD — Dashboard Next.js:** página `/knowledge`, filtros, react-markdown, timeline → phase GSD posterior.
- **Fase 7 PRD — Limpieza final:** eliminar `app/data/knowledge/*.json` y `.planning/knowledge/*.md`, simplificar CLAUDE.md → phase GSD posterior.
- **Traducción automática** (`kb-sync.cjs --translate <id> --to en`) — §8.4 del PRD. Opcional, no-goal para esta fase.
- **Semantic search con Qdrant** — §8.5 del PRD. Reservado al dashboard (Fase 6 PRD).
- **Cherry-pick de las ~30 fases foundational a `features/`** — §8.6 del PRD. Pertenece a Fase 3 PRD.
- **Bilingual content infill** — los archivos de ejemplo bilingües (Apéndice A/B) son ilustrativos; esta fase valida que el schema los acepta pero no crea los archivos de ejemplo reales (eso lo hace la migración de Fase 2/3 PRD).

</deferred>

---

*Phase: 149-kb-foundation-bootstrap*
*Context gathered: 2026-04-18 via PRD Express Path (`.planning/ANALYSIS-knowledge-base-architecture.md`)*
