# ANALYSIS — Knowledge Base Architecture

**Fecha:** 2026-04-18
**Autor:** Antonio + CatBot (análisis conjunto)
**Estado:** Propuesta de arquitectura — abierta a discusión
**Alcance:** Unificar el sistema de conocimiento de DocFlow en una fuente única, auto-actualizable, consumible por LLM y dashboard.

---

## TL;DR

DocFlow tiene **7 silos de conocimiento** dispersos entre JSON, MD, código y DB, con deriva activa (las docs llevan días/semanas desactualizadas respecto al estado real). Cada silo tiene su propio formato, su propio índice (o ninguno), y su propia audiencia implícita.

**Propuesta:** reorganizar todo en un **Knowledge Base local** (`.docflow-kb/`) con:
- Nomenclatura hierárquica y predecible: `<layer>/<type>/<id>.md`
- Frontmatter universal con 12 campos fijos (tipo, tags, audiencia, TTL, fuentes).
- Índice auto-generado (`_index.json`) consumible por LLM **Y** por dashboard visual.
- Auto-sync bidireccional: cada creación/modificación de DB actualiza el archivo correspondiente; cada edición humana actualiza el índice.
- Disclosure progresivo para Gemini (3 niveles: header compacto → índice filtrado → archivo completo).

**No es versionar en N archivos.** Es una sola fuente con el historial y la frescura expresados en metadata interna.

---

## 1. Auditoría del estado actual

### 1.1 Silos existentes

| Silo | Ubicación | Contenido | Actualización |
|------|-----------|-----------|---------------|
| A. Knowledge runtime (LLM) | `app/data/knowledge/*.json` (7 áreas) | Conceptos, howto, common_errors por módulo | Manual, drift confirmado |
| B. Catálogos humanos | `.planning/knowledge/*.md` (12 files) | Inventarios (catpaw, connectors, templates), reglas, incidentes, APIs | Manual, drift confirmado |
| C. Skills / protocolos | `skill_orquestador_catbot_enriched.md` (root), `.claude/skills/docatflow-conventions.md` | Comportamiento esperado de CatBot | Manual, fragmentado |
| D. Fases GSD | `.planning/phases/*/` (130 dirs) | Histórico de cambios, PLAN.md, VERIFICATION.md | Inmutable post-fase |
| E. Estado proyecto | `.planning/STATE.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `PROJECT.md` | Estado activo | Actualizado por GSD |
| F. System prompts | `app/src/lib/services/catbot-pipeline-prompts.ts` | Prompts de strategist/decomposer/architect/QA | Manual en código |
| G. Live DB | `docflow.db`, `catbot.db` | Verdad operacional (CatPaws, connectors, etc.) | Automático (INSERT/UPDATE) |

### 1.2 Deriva observable (evidencia directa)

| Hecho | Implicación |
|-------|-------------|
| `.planning/Index.md` dice catpaw-catalog=30, la DB ya tiene 32 | Catálogo desactualizado |
| `app/data/knowledge/_index.json` dice updated=2026-04-12, pero `catflow.json` fue actualizado hoy 2026-04-18 | Índice desincronizado respecto a los archivos que indexa |
| `cat_paws` table NO tiene `best_for`; ARCHITECT_PROMPT habla de `resources.catPaws[].best_for` | Knowledge del prompt miente sobre la estructura real |
| `skill_orquestador_catbot_enriched.md` vive en la raíz del repo, fuera de todo índice | Huérfano |
| `.claude/skills/docatflow-conventions.md` es solo de uso Claude Code, no alimenta a CatBot | Silo separado |

### 1.3 Problemas estructurales (no ruido, sistémicos)

1. **Dos fuentes para lo mismo.** `catpaw.json` (runtime) y `catpaw-catalog.md` (humano) ambos listan CatPaws, pero con campos distintos y actualizaciones independientes.
2. **Domain vs Instance mezclados.** `catpaw.json` mete conceptos ontológicos ("qué es un CatPaw") junto con instancias concretas ("Operador Holded id 53f19c51…"). Dos cosas distintas en el mismo archivo.
3. **Ausencia de nomenclatura predecible.** `canvas-nodes-catalog.md`, `connector-logs-redaction-policy.md`, `proceso-catflow-revision-inbound.md` — cada archivo eligió su propio nombre.
4. **Ausencia de frontmatter.** Ningún MD declara su tipo, audiencia, o dependencias. Imposible filtrar por tipo salvo abriendo cada uno.
5. **Ausencia de tags controlados.** Cada catálogo usa vocabulario propio. No hay búsqueda cruzada.
6. **System prompts hardcoded en .ts.** Los prompts del pipeline son código, no knowledge. No se pueden inspeccionar/editar sin rebuild.
7. **130 fases GSD sin índice cronológico consumible por LLM.** El histórico existe pero es ilegible en masa.
8. **Sin cache invalidation.** Si alguien actualiza un .md, el LLM sigue viendo lo que cargó al inicio de sesión.

---

## 2. Principios de diseño

### 2.1 Single Source of Truth (SoT)

Un hecho = un archivo. El "Operador Holded id 53f19c51" vive en **un solo sitio**. Los demás lugares lo **referencian** por id, no lo copian.

### 2.2 Self-describing

Cada archivo lleva su propio manual en el frontmatter: qué es, a quién sirve, cuánto dura, cómo buscarlo, qué necesita para vivir (sources).

### 2.3 Token-aware (progressive disclosure)

El sistema expone 3 niveles de profundidad según necesidad, para que Gemini/Sonnet no se asfixien:

| Nivel | Contenido | Tamaño aprox | Cuándo |
|-------|-----------|--------------|--------|
| L0 — Header | Stats + top-tags + counts | <500 tokens | Siempre inyectado |
| L1 — Index filtrado | Lista compacta por filtro | 1-2K tokens | On-intent (creación canvas → filtra relevantes) |
| L2 — Archivo | Full frontmatter + body | 1-5K tokens | On-demand por id |

### 2.4 Multi-audience

| Audiencia | Qué lee |
|-----------|---------|
| **catbot** | `_index.json` como header + archivos L2 vía tool |
| **architect** (pipeline interno) | Index filtrado por `type: rule, resource, concept` |
| **developer** | Archivos .md en IDE + manual de nomenclatura |
| **user** | Dashboard visual (Next.js page) construido desde `_index.json` |
| **onboarding** | Rutas guiadas definidas en manifest |

### 2.5 Auto-synced

Cualquier cambio en DB → hook → escribe/actualiza el archivo correspondiente → regenera el `_index.json`. Deriva cero por diseño, no por disciplina.

### 2.6 Immutable history, mutable state

- **Histórico** (fases completadas, incidentes, decisiones): se añade, no se edita. Preserva contexto.
- **Estado** (recursos vigentes, protocolos activos): se actualiza in-place. Siempre refleja la verdad presente.

Dos secciones del KB claramente separadas.

---

## 3. Arquitectura propuesta

### 3.1 Estructura de carpetas

```
.docflow-kb/                        # RAÍZ: reemplaza app/data/knowledge + .planning/knowledge
├── _index.json                     # Índice master auto-generado (consumo LLM + dashboard)
├── _header.md                      # Nivel L0: stats + counts + top-tags
├── _manual.md                      # Cómo navegar el KB (para humanos + LLM)
├── _schema/                        # Schemas JSON para validación
│   ├── frontmatter.schema.json
│   ├── resource.schema.json
│   └── tag-taxonomy.json
│
├── domain/                         # NIVEL ONTOLÓGICO (qué son las cosas)
│   ├── concepts/                   # Conceptos atómicos
│   │   ├── catpaw.md
│   │   ├── catflow.md
│   │   ├── canvas-node.md
│   │   ├── connector.md
│   │   └── rag-catbrain.md
│   ├── taxonomies/                 # Clasificaciones
│   │   ├── node-roles.md           # los 7 roles funcionales
│   │   ├── catpaw-modes.md         # chat/processor/hybrid
│   │   └── connector-types.md
│   └── architecture/
│       ├── pipeline-async.md
│       ├── two-layer-agent.md      # base + canvas extras
│       └── knowledge-sync.md
│
├── resources/                      # NIVEL INSTANCIA (cosas concretas, auto-sync DB)
│   ├── catpaws/
│   │   ├── 53f19c51-operador-holded.md
│   │   ├── a3c5df1e-analista-facturas.md
│   │   └── b63164ed-consultor-crm.md
│   ├── connectors/
│   │   ├── seed-holded-mcp.md
│   │   ├── 43cbe742-gmail-antonio.md
│   │   └── 67d945f0-gmail-info.md
│   ├── catbrains/
│   ├── email-templates/
│   ├── skills/
│   └── canvases/                   # Canvases guardados (excluyendo templates)
│
├── rules/                          # REGLAS DE DISEÑO (R01-R25, SE01-SE03, DA01-DA04)
│   ├── R01-data-contracts.md
│   ├── R02-array-iterator-threshold.md
│   ├── R10-preserve-fields.md
│   ├── SE01-guard-before-emitter.md
│   └── ...
│
├── protocols/                      # SKILLS / COMPORTAMIENTOS (para CatBot)
│   ├── orquestador-catflow.md
│   ├── arquitecto-agentes.md
│   ├── resource-analyst.md         # (futuro, cuando exista)
│   └── knowledge-sync-protocol.md
│
├── runtime/                        # PROMPTS DEL PIPELINE (extraídos del código)
│   ├── strategist.prompt.md
│   ├── decomposer.prompt.md
│   ├── architect.prompt.md
│   ├── canvas-qa.prompt.md
│   └── agent-autofix.prompt.md
│
├── incidents/                      # INCIDENTES RESUELTOS (inmutable, cronológico)
│   ├── INC-11-renderer-html-vacio.md
│   ├── INC-12-gmail-send-no-messageid.md
│   └── ...
│
├── features/                       # DOCS POR FEATURE (vivo, una por feature relevante)
│   ├── 145-catpaw-operador-holded.md
│   ├── 137-01-renderer-wrapper.md
│   └── ...
│
├── guides/                         # RUTAS GUIADAS / USER GUIDES
│   ├── user-guide.md
│   ├── model-onboarding.md
│   └── canvas-design-tutorial.md
│
└── state/                          # ESTADO VIVO PROYECTO
    ├── roadmap.md
    ├── requirements-active.md
    ├── milestone-context.md
    └── deferred-items.md
```

### 3.2 Nomenclatura — reglas

| Regla | Ejemplo |
|-------|---------|
| Archivos `.md` en kebab-case | `operador-holded.md`, no `OperadorHolded.md` |
| Instancias con prefijo de id corto | `53f19c51-operador-holded.md` (primeros 8 chars del UUID) |
| Reglas con código + slug | `R10-preserve-fields.md`, `SE01-guard-before-emitter.md` |
| Fases con número | `145-catpaw-operador-holded.md` |
| Incidentes con INC- | `INC-11-renderer-html-vacio.md` |
| Protocolos = nombre sin prefijo | `arquitecto-agentes.md` |
| Archivos especiales con `_` | `_index.json`, `_header.md`, `_manual.md` |

Beneficio: ordenación alfabética de `ls` da orden semántico natural.

### 3.3 Frontmatter universal (bilingüe + lifecycle)

```yaml
---
# ─── Identidad ────────────────────────────────────────
id: catpaw-53f19c51                    # Kebab-case, único, estable
type: resource                          # concept|taxonomy|resource|rule|protocol|runtime|incident|feature|guide|state
subtype: catpaw                         # Sub-clasificación (null si no aplica)
lang: es+en                             # es | en | es+en

# ─── Contenido bilingüe ───────────────────────────────
title:
  es: Operador Holded
  en: Holded Operator
summary:
  es: CatPaw generalista de operaciones CRM en Holded vía MCP. Acepta cualquier instrucción CRM en lenguaje natural.
  en: Generalist CatPaw for CRM operations on Holded via MCP. Accepts any CRM instruction in natural language.

# ─── Clasificación (vocabulario EN, un único idioma) ──
tags: [catpaw, crm, holded, processor, business, mcp]
audience: [catbot, architect, developer]   # catbot | architect | developer | user | onboarding
status: active                              # active | deprecated | draft | experimental

# ─── Lifecycle ────────────────────────────────────────
created_at: 2026-04-17T10:23:00Z
created_by: catbot:phase-145
version: 1.0.0                              # Semver completo (major.minor.patch)
updated_at: 2026-04-17T10:23:00Z
updated_by: catbot:phase-145
last_accessed_at: 2026-04-18T14:00:00Z      # Actualizado por knowledge-sync en cada acceso
access_count: 12                            # Counter global (search, get_kb_entry, dashboard view)

change_log:                                 # Últimos 5 cambios (histórico completo en git)
  - { version: 1.0.0, date: 2026-04-17, author: catbot:phase-145, change: "Creado en Phase 145" }

# ─── Deprecation (solo si status == deprecated) ───────
# deprecated_at: null
# deprecated_by: null
# deprecated_reason: null
# superseded_by: null

# ─── SoT y enrichment ─────────────────────────────────
source_of_truth:
  - db: cat_paws
    id: 53f19c51-9cac-4b23-87ca-cd4d1b30c5ad
    fields_from_db: [name, description, mode, model, system_prompt, temperature, max_tokens, is_active]
enriched_fields: [use_cases, examples, relationship_notes]   # Humanos pueden editar libremente

# ─── Relaciones ───────────────────────────────────────
related: [protocol-arquitecto-agentes, concept-catpaw, feature-145]

# ─── Búsqueda bilingüe ────────────────────────────────
search_hints:
  es: [holded crm, facturación, crm generalista, mcp holded]
  en: [holded crm, billing, crm generalist, mcp holded]

ttl: managed                                # never | managed | 30d | 180d
---

## Español

[contenido en español]

---

## English

[content in English]
```

**Reglas de campos bilingües:**

| Campo | Formato |
|-------|---------|
| `id`, `type`, `subtype` | kebab-case EN, inmutable |
| `tags`, `audience`, `status` | controlled vocabulary EN |
| `title`, `summary` | dict `{es, en}` — ambos requeridos si `lang: es+en` |
| `search_hints` | dict `{es, en}` — idioma nativo para cada uno |
| Body `## Español` / `## English` | secciones libres |
| Bloques code/JSON | neutros, sin duplicar |

### 3.4 Taxonomía de tags (controlled vocabulary)

Definida en `_schema/tag-taxonomy.json`:

```json
{
  "domains": ["crm", "email", "storage", "analytics", "auth", "scheduling"],
  "entities": ["catpaw", "catflow", "canvas", "catbrain", "connector", "skill", "template"],
  "modes": ["chat", "processor", "hybrid"],
  "connectors": ["gmail", "holded", "drive", "mcp", "http", "n8n", "smtp"],
  "roles": ["extractor", "transformer", "synthesizer", "renderer", "emitter", "guard", "reporter"],
  "departments": ["business", "finance", "production", "other"],
  "rules": ["R01", "R02", "R10", "R13", "SE01", "DA01", "..."],
  "cross_cutting": ["safety", "performance", "learning", "ux", "ops", "testing"]
}
```

**Beneficio:** búsqueda por intersección: `tag:catpaw + tag:holded` → encuentra instantáneamente Operador Holded sin abrir archivos.

---

## 4. El índice maestro — `_index.json`

### 4.1 Shape

```json
{
  "schema_version": "2.0",
  "generated_at": "2026-04-18T14:00:00Z",
  "generated_by": "knowledge-sync",
  "entry_count": 287,

  "header": {
    "counts": {
      "catpaws_active": 32,
      "connectors_active": 12,
      "catbrains_active": 5,
      "templates_active": 15,
      "skills_active": 42,
      "rules": 32,
      "incidents_resolved": 9,
      "features_documented": 28
    },
    "top_tags": ["catpaw", "gmail", "holded", "canvas", "catflow"],
    "last_changes": [
      { "date": "2026-04-18", "change": "Added delete_catflow sudo tool", "file": "runtime/strategist.prompt.md" },
      { "date": "2026-04-17", "change": "Added CatPaw Operador Holded", "file": "resources/catpaws/53f19c51-operador-holded.md" }
    ]
  },

  "entries": [
    {
      "id": "catpaw-53f19c51",
      "path": "resources/catpaws/53f19c51-operador-holded.md",
      "type": "resource",
      "subtype": "catpaw",
      "title": "Operador Holded",
      "summary": "CatPaw generalista de operaciones CRM en Holded vía MCP...",
      "tags": ["catpaw", "crm", "holded", "processor", "business"],
      "audience": ["catbot", "architect", "developer"],
      "status": "active",
      "updated": "2026-04-17",
      "search_hints": ["holded crm", "facturación holded"]
    }
    // ... N entries más
  ],

  "indexes": {
    "by_type": {
      "resource": [/* ids */],
      "rule": [/* ids */],
      "protocol": [/* ids */]
    },
    "by_tag": {
      "catpaw": [/* ids */],
      "holded": [/* ids */]
    },
    "by_audience": {
      "catbot": [/* ids */],
      "architect": [/* ids */]
    }
  }
}
```

### 4.2 Consumo

**CatBot prompt assembler:**

```typescript
// Nivel L0 siempre: _header.md (generado desde _index.json.header)
const header = fs.readFileSync('.docflow-kb/_header.md');
systemPrompt += `\n## KB HEADER (auto)\n${header}`;

// Nivel L1 on-intent: filtra por tags relevantes
if (intent === 'create_canvas') {
  const index = JSON.parse(fs.readFileSync('.docflow-kb/_index.json'));
  const relevant = index.entries.filter(e => 
    e.audience.includes('architect') && 
    (e.tags.includes('catpaw') || e.tags.includes('connector'))
  );
  systemPrompt += `\n## RELEVANT KB (${relevant.length} entries)\n${formatCompact(relevant)}`;
}

// Nivel L2 on-demand: tool get_kb_entry(id) lee el .md completo
```

**Dashboard Next.js** (`app/pages/knowledge/index.tsx`):

```typescript
const index = await fetch('/api/kb/index').then(r => r.json());
// Render:
// - Stats del header
// - Búsqueda client-side sobre index.entries (filter by tag, audience, updated_at)
// - Click → abre el .md formateado con react-markdown
// - Gráfico de cambios recientes (last_changes)
```

### 4.3 Regeneración

`_index.json` se regenera automáticamente por:

1. **Creación DB** (ej. `create_cat_paw`) → `knowledge-sync` escribe el .md del recurso → regenera `_index.json`.
2. **Edición humana de .md** → pre-commit hook regenera `_index.json`.
3. **Cambio de schema** → comando `pnpm run kb:rebuild` regenera desde cero leyendo todos los frontmatter.
4. **Migración puntual** → script CLI `kb-sync.cjs --full-rebuild`.

Invariante: `_index.json` siempre coincide con los frontmatter de los archivos. Si no coincide, el CI peta.

---

## 5. El mecanismo de auto-sync

### 5.1 Servicio `knowledge-sync.ts`

```typescript
// app/src/lib/services/knowledge-sync.ts

export async function syncResource(
  entity: 'catpaw'|'connector'|'catbrain'|'template'|'skill'|'canvas',
  op: 'create'|'update'|'delete'|'access',
  row: DBRow | { id: string },
  context?: { author: string }
): Promise<void> {
  const path = kbPath(entity, row.id);
  
  switch (op) {
    case 'create':
      await writeResourceMarkdown(path, row, { bump: 'init', author: context?.author });
      break;
    case 'update':
      const bump = detectBumpLevel(path, row);  // patch|minor|major, ver tabla §5.2
      await updateResourceMarkdown(path, row, { bump, author: context?.author });
      break;
    case 'delete':
      await markDeprecated(path, row, context?.author);  // soft delete
      break;
    case 'access':
      await touchAccess(path);  // actualiza last_accessed_at + access_count++
      break;
  }
  
  await updateIndexEntry(path);  // actualiza _index.json entry
  await regenerateHeader();       // actualiza counts en _header.md
  await invalidateLLMCache();     // señal a prompt-assembler para next session
}
```

### 5.2 Regla de bump de versión (semver completo)

| Cambio detectado | Bump | Ejemplo |
|------------------|------|---------|
| Auto-sync por cambio en `times_used`, `updated_at` en DB | **patch** | 1.0.0 → 1.0.1 |
| Añadido/editado en `enriched_fields` (use_cases, examples, notes) | **patch** | 1.0.1 → 1.0.2 |
| Edición de campo técnico no-estructural (description, tags añadidos) | **patch** | — |
| Cambio en `system_prompt`, `connectors` linked, `skills` linked | **minor** | 1.0.2 → 1.1.0 |
| Añadido/quitado `related` entry crítico | **minor** | — |
| Traducción añadida (se pasa de `lang: es` a `lang: es+en`) | **minor** | — |
| Cambio de `mode`, `status → deprecated`, `subtype` | **major** | 1.1.0 → 2.0.0 |
| Cambio incompatible con canvases existentes (ej. cambia contract I/O) | **major** | — |

`detectBumpLevel()` compara el archivo actual vs el nuevo y decide. Incluye entry en `change_log` con la razón.

### 5.2 Templates de generación

Cada tipo de recurso tiene un template Markdown con placeholders. El servicio llena los placeholders con datos de la DB.

Ejemplo — `resources/catpaws/_template.md`:

```markdown
---
id: catpaw-{id_short}
type: resource
subtype: catpaw
title: {name}
summary: {description_first_200_chars}
tags: [catpaw, {mode}, {department}, ...auto-inferred-from-skills]
audience: [catbot, architect]
status: {is_active ? active : deprecated}
version: 1.0
updated: {updated_at}
source_of_truth:
  - db: cat_paws
    id: {id}
search_hints: {auto-extracted-from-system-prompt}
ttl: managed
---

# {name}

**Modo:** {mode} | **Modelo:** {model} | **Departamento:** {department}

## Descripción

{description}

## Configuración

- Temperature: {temperature}
- Max tokens: {max_tokens}
- Output format: {output_format}

## System prompt (primeros 500 chars)

> {system_prompt_preview}

## Skills vinculadas

{linked_skills_list}

## Conectores vinculados

{linked_connectors_list}

## Casos de uso

{auto-filled-from-usage-logs-if-available}

## Cómo se usa desde canvas

- Node type: `agent`
- `data.agentId`: `{id}`
- Extras soportados: `extraSkills`, `extraConnectors`, `extraCatBrains` (dos capas)
```

### 5.3 Hooks en las creation tools

```typescript
// catbot-tools.ts
case 'create_cat_paw': {
  const newId = insertCatPaw(args);
  const row = getCatPaw(newId);
  await syncResource('catpaw', 'create', row);  // <-- nuevo
  return { name, result: { id: newId, kb_entry: `.docflow-kb/resources/catpaws/${newId.slice(0,8)}-${slugify(row.name)}.md` } };
}
```

---

## 5.3 Lifecycle completo — creación, edición, deprecation, purga

### Estados de un archivo

```
   active ────────────────► active (updates) ────────────────► deprecated ────────► archived ────────► purged
     │                           │                                   │                  │                  │
     │                           │                                   │                  │                  │
  created_at              updated_at bump version             deprecated_at       at 180d of no         manual only
  created_by              updated_by                          status:deprecated   access + confirm     (--purge-confirmed)
  version 1.0.0           change_log append                   superseded_by?      moved to _archived/  physical delete
```

### Soft delete (no se borra nunca automáticamente)

Cuando la fuente DB del recurso desaparece (ej. DELETE de un CatPaw) o el usuario marca como obsoleto:

```yaml
status: deprecated
deprecated_at: 2026-05-10T09:15:00Z
deprecated_by: user:antonio
deprecated_reason: "Sustituido por Operador Holded v2 tras rediseño de prompts"
superseded_by: catpaw-abc12345        # opcional, link al reemplazo
```

Consecuencias:
- `_index.json` filtra `status=deprecated` por default en búsquedas.
- Dashboard muestra los deprecated en sección separada (toggle "mostrar obsoletos").
- Canvases existentes que referencian el ID en DB siguen funcionando (el archivo .md sigue presente para debugging).
- `related` entries en otros archivos siguen siendo válidos como referencia histórica.

### Purga — criterio y workflow

**Condiciones para ser elegible para purga:**

Todas estas simultáneamente:
1. `status == deprecated`
2. `(now - last_accessed_at) > 180 días`
3. No hay docs con `related` que apunten aquí (verificado escaneando todo el KB)
4. No hay referencias en canvas_runs de los últimos 180 días que usen el ID

**Workflow de aviso + purga:**

```
Día 150 (deprecated + no access)
  └─► Weekly audit job añade entrada a .docflow-kb/_audit_stale.md
      con título "ATENCIÓN: {N} archivos elegibles para purga en 30 días"
  └─► Notifica al usuario (notification interna + log en consola si hay sesión CatBot)

Día 180 (si nada cambió)
  └─► Se añade al batch de purga
  └─► NUNCA se purga automático. Requiere ejecución explícita:

      $ kb-sync.cjs --audit-stale
      # muestra lista completa con razón por cada archivo

      $ kb-sync.cjs --archive --confirm
      # mueve archivos elegibles a .docflow-kb/_archived/YYYY-MM-DD/
      # status: deprecated → archived
      # sigue disponible para lectura pero fuera del _index principal

      $ kb-sync.cjs --purge --confirm --older-than-archived=365d
      # borrado físico. Solo archivos que llevan >1 año archivados.
      # git preserva el histórico.
```

**Criterio de notificación ("bajo tu criterio"):**

- **Día 150:** primer aviso, informativo.
- **Día 170:** segundo aviso, más visible (aparece en dashboard como alerta).
- **Día 180:** elegible. NO se purga, se bloquea hasta confirmación.
- **Día 365 (tras archivado):** elegible para purga física, con confirmación doble.

Siempre reversible hasta el `--purge --confirm` final. Nunca pérdida de datos por timeout.

### Conflictos DB ↔ archivo

Si un humano edita un `.md` directamente y la DB no cambió, o viceversa:

| Caso | Resolución |
|------|------------|
| Edit humano en `enriched_fields` (use_cases, examples) | ✅ Respetado. Bump patch. |
| Edit humano en `source_of_truth.fields_from_db` (ej. description) | ⚠️ Auto-sync lo pisa en próximo sync. Warning en change_log. |
| DB update sin cambio en archivo | Auto-sync actualiza `fields_from_db` + patch bump |
| Archivo editado + DB update simultáneo | Auto-sync merge: DB gana en `fields_from_db`, archivo gana en `enriched_fields` |
| DB row borrado pero archivo aún existe | status → deprecated, deprecated_reason: "DB row removed at {timestamp}" |

**Implementación de merge:** `knowledge-sync.ts` lee el archivo actual, extrae `enriched_fields`, los preserva en la regeneración. Solo los `fields_from_db` se sobrescriben con la row actual.

---

## 6. Comparativa visual — antes/después

### 6.1 Hoy: "¿Qué CatPaws tenemos para análisis financiero?"

**Flujo actual del LLM:**
1. Lee `app/data/knowledge/catpaw.json` → concepts (stale) + howto genérico
2. Llama `list_cat_paws` → 20 rows sin description rica
3. Para cada candidato, abre fallback → llama `get_cat_paw(id)` → lee detalle completo
4. Contrasta contra la petición en prosa → decide

Coste: ~4 roundtrips, ~6K tokens, info potencialmente inconsistente (DB vs concepts).

### 6.2 Propuesta: mismo caso

**Flujo con KB unificado:**
1. Prompt assembler inyecta `_header.md` (L0, 500 tokens): *"32 CatPaws, top-tags: catpaw, gmail, holded, crm, finance"*
2. Intent detectado "análisis financiero" → inyecta L1 filtrado por `tag:finance, tag:catpaw` → 4 entries compactas con summary + tags
3. LLM decide directamente O pide L2 de 1-2 candidatos finalistas

Coste: 1 roundtrip (a lo sumo 2), ~2K tokens, info garantizada consistente.

---

## 7. Migración — plan gradual (no big-bang)

### Fase 1 — Bootstrapping (no toca nada activo)

1. Crear `.docflow-kb/` con `_schema/`, `_manual.md`, `_header.md` vacíos.
2. Definir `frontmatter.schema.json` y `tag-taxonomy.json`.
3. Escribir `knowledge-sync.ts` como servicio aislado.
4. Escribir `kb-sync.cjs` CLI para migración puntual.
5. **Ningún cambio en prompt-assembler ni en creation tools todavía.**

### Fase 2 — Pobla desde DB

1. Ejecuta `kb-sync.cjs --full-rebuild --source db` → genera archivos `resources/*` desde las tablas live.
2. Genera `_index.json` por primera vez.
3. Valida frontmatter con schema.
4. **Commit snapshot** → el KB existe como lectura pero aún no se consume.

### Fase 3 — Migra knowledge estático (concepts, rules, protocols)

1. Archivos de `.planning/knowledge/*.md` → se parten en átomos y se migran con frontmatter a `domain/`, `rules/`, `incidents/`.
2. Archivos de `app/data/knowledge/*.json` → concepts migran a `domain/concepts/*.md`.
3. `skill_orquestador_catbot_enriched.md` + skills dispersas → `protocols/`.
4. System prompts de código → `runtime/*.prompt.md` + código los lee desde ahí.
5. Se mantienen los originales con nota de redirect hasta confirmar.

### Fase 4 — Consumo por CatBot

1. Prompt assembler lee `_header.md` (L0) en cada sesión.
2. Tool nueva `get_kb_entry(id)` → lee archivo L2.
3. Tool nueva `search_kb({tags, type, audience, search})` → filtra `_index.json`.
4. Las tools actuales `list_cat_paws`, etc., devuelven ahora con `kb_entry` path para profundizar.

### Fase 5 — Enganchar creation tools

1. `create_cat_paw`, `create_connector`, etc. llaman `syncResource` al final.
2. Testing: crear CatPaw → verificar archivo generado + índice actualizado.
3. Actualizar skill "Arquitecto de Agentes" mencionando el sync automático.

### Fase 6 — Dashboard

1. Página `/knowledge` en Next.js consume `_index.json`.
2. Filtros client-side por tag/type/audience.
3. Vista detalle renderizada con react-markdown.
4. Gráfico de timeline de cambios recientes.

### Fase 7 — Limpieza

1. Remove `app/data/knowledge/*.json` (los datos migraron).
2. Remove `.planning/knowledge/*.md` o convertir a redirects simbólicos.
3. Actualizar CLAUDE.md §29 para apuntar a `.docflow-kb/_manual.md` como fuente.
4. Deprecar el concepto de "dos knowledge layers" (runtime vs humano).

---

## 8. Preguntas abiertas / decisiones pendientes

### 8.1 Ubicación: `.docflow-kb/` vs otra ruta

- **`.docflow-kb/`** (propuesto): nombre nuevo, limpio, claro.
- **`app/data/knowledge/`** (existente): reusa ubicación, menos churn.
- **`knowledge/` en root**: más visible, alineado con monorepos.

Trade-off: visibilidad vs aislamiento. Yo recomiendo `.docflow-kb/` en root — está claro que es knowledge, no código; no se confunde con `app/`.

### 8.2 ¿Se versionan los instance docs (resources/) con git?

- **Sí:** histórico navegable, diffs revisables en PR, rollback posible.
- **No:** se regeneran desde DB, son derivados, meten ruido en el log.

Yo recomiendo **sí** pero con `.gitattributes` que los marque como `binary` o `text eol=lf` para simplificar diffs. Si la DB es la fuente, los .md son cache fría persistente.

### 8.3 ¿Schema validado en CI?

- Pre-commit hook que valida frontmatter contra `_schema/frontmatter.schema.json`.
- CI que falla si `_index.json` no coincide con la suma de frontmatters.

Yo recomiendo **sí** desde el día 1. Sin validación la deriva vuelve en semanas.

### 8.4 Internacionalización — DECIDIDO: bilingüe ES+EN

**Regla:**
- **Frontmatter keys** en inglés (interop): `id`, `type`, `tags`, `audience`, `status`.
- **Contenido user-facing bilingüe** en dicts `{es, en}`: `title`, `summary`, `search_hints`.
- **Body** en secciones `## Español` / `## English`, o solo una si `lang: es` / `lang: en`.
- **Tags** controlled vocabulary único en inglés (un solo `tag-taxonomy.json`).
- **change_log** en idioma del editor (mix está OK — son entradas de autoría).
- **Bloques code/JSON** neutros, no se duplican.

Si una traducción falta, el archivo tiene `lang: es` y el dashboard muestra fallback al idioma disponible con banner "Translation missing".

`knowledge-sync.ts` **no traduce automáticamente**. La traducción es editorial/humana. Hook opcional: si `lang: es` y se quiere añadir EN, el servicio expone `kb-sync.cjs --translate <id> --to en` que usa LLM para producir borrador que un humano revisa antes de commit.

### 8.5 ¿Search engine?

- **Client-side sobre _index.json** — suficiente para <5K entries. Rápido, sin dependencias.
- **Server-side con MiniSearch/Fuse.js** — mejor ranking, más lento setup.
- **Qdrant embeddings** — ya tenemos infra. Potente pero complejidad extra para docs.

Yo recomiendo **client-side + opción Qdrant** para el dashboard cuando haga falta semantic search.

### 8.6 ¿Cómo manejamos las 130 fases pasadas?

- Mantener `.planning/phases/` como está — es histórico inmutable.
- Crear `features/*.md` nuevo para fases **relevantes para el funcionamiento actual** (filtrado: las que añadieron features aún vivos, reglas aún activas, learnings aún válidos).
- No migrar las 130; cherry-pick las ~30 "foundational".

### 8.7 ¿Qué hacer con CLAUDE.md?

- Queda como **manifest raíz** para Claude Code (la herramienta).
- Delega al KB como fuente de cualquier detalle operativo.
- Se reduce a: protocolo general + punteros a `.docflow-kb/_manual.md`.

---

## 9. Impacto esperado

| Dimensión | Hoy | Post-migración |
|-----------|-----|----------------|
| Sources of truth para CatPaws | 3 (DB + JSON + catalog) | 1 (archivo .md, derivado de DB) |
| Deriva posible | Alta (hace falta disciplina) | Cero (auto-sync garantiza) |
| Token overhead del header LLM | ~2-5K (mezcla de todo) | ~500 (L0 compacto) |
| Roundtrips para decidir un recurso | 2-4 | 1-2 |
| Tiempo de onboarding human | Días (buscar en 3 sitios) | Horas (manual + dashboard) |
| Coste de añadir nuevo tipo | Bajo pero con riesgo de drift | Bajo + auto-documentado |
| Dashboard visualizable | No existe | `/knowledge` con filtros |
| Auditabilidad | Baja (git log sobre múltiples repos) | Alta (timeline del _index) |

---

## 10. Resumen ejecutivo

### La decisión central

No es *"vamos a documentar mejor"* — es *"vamos a tener UNA forma de representar conocimiento y UN mecanismo para mantenerlo vivo"*. El resto emerge de ahí.

### Lo que cambia

- **Un solo árbol** (`.docflow-kb/`) reemplaza 7 silos.
- **Un solo frontmatter** (12 campos fijos) reemplaza formatos ad-hoc.
- **Un solo índice** (`_index.json`) reemplaza `_index.json`+`Index.md`+catálogos manuales.
- **Un solo servicio** (`knowledge-sync.ts`) garantiza coherencia DB↔archivo.
- **3 niveles de profundidad** para controlar tokens.

### Lo que NO cambia

- Las DB tablas (`cat_paws`, `connectors`, etc.) siguen siendo la fuente operacional.
- Las tools de discovery siguen existiendo (se mejoran en paralelo, no se quitan).
- GSD `.planning/phases/` sigue funcionando igual.
- El canvas-executor sigue intacto.

### Estimación GSD

Este rediseño cabe en **~4 fases GSD**:

1. Bootstrapping + Schema + Servicio de sync (Fase A)
2. Migración de knowledge estático + Cambio de fuente en prompt-assembler (Fase B)
3. Enganche en creation tools + Tests (Fase C)
4. Dashboard + Limpieza de silos viejos (Fase D)

Total estimado: 1-2 semanas de trabajo concentrado.

### El pivote de valor

Este rediseño es **prerrequisito real** para el Canvas Creation Wizard propuesto en `ANALYSIS-canvas-creation-wizard.md`. Sin knowledge unificado y fresco, el wizard opera sobre datos que pueden mentir. Con él, el wizard tiene garantizado razonamiento contra verdad actual.

---

## Apéndice A — Ejemplo completo bilingüe: `resources/catpaws/53f19c51-operador-holded.md`

```markdown
---
id: catpaw-53f19c51
type: resource
subtype: catpaw
lang: es+en

title:
  es: Operador Holded
  en: Holded Operator

summary:
  es: CatPaw generalista de operaciones CRM en Holded vía MCP. Acepta cualquier instrucción CRM en lenguaje natural. Reemplaza a Consultor CRM para canvases flexibles.
  en: Generalist CatPaw for CRM operations on Holded via MCP. Accepts any CRM instruction in natural language. Replaces Consultor CRM for flexible canvases.

tags: [catpaw, crm, holded, processor, business, mcp]
audience: [catbot, architect, developer]
status: active

created_at: 2026-04-17T10:23:00Z
created_by: catbot:phase-145
version: 1.0.0
updated_at: 2026-04-17T10:23:00Z
updated_by: catbot:phase-145
last_accessed_at: 2026-04-18T14:00:00Z
access_count: 12

change_log:
  - { version: 1.0.0, date: 2026-04-17, author: catbot:phase-145, change: "Creado en Phase 145 — CatPaw CRM generalista" }

source_of_truth:
  - db: cat_paws
    id: 53f19c51-9cac-4b23-87ca-cd4d1b30c5ad
    fields_from_db: [name, description, mode, model, system_prompt, temperature, max_tokens, is_active]
enriched_fields: [use_cases, examples, relationship_notes]

related:
  - protocol-arquitecto-agentes
  - concept-catpaw
  - feature-145
  - resource-connector-seed-holded-mcp
  - resource-catpaw-b63164ed-consultor-crm

search_hints:
  es: [holded crm, facturación holded, crm generalista, mcp holded, leads holded]
  en: [holded crm, billing holded, crm generalist, mcp holded, leads holded]

ttl: managed
---

## Español

# Operador Holded

**Modo:** processor | **Modelo:** gemini-main | **Departamento:** business

### Descripción

CatPaw generalista para Holded. Ejecuta cualquier operación CRM: buscar leads y contactos,
crear leads nuevos, añadir notas, actualizar información. Diseñado para canvases flexibles
donde la instrucción llega en lenguaje natural.

### Configuración

- Temperature: 0.2
- Max tokens: 2048
- Output format: json

### Casos de uso

**Caso 1 — Búsqueda de leads**
INPUT: `{ "query": "Juan Pérez", "tipo": "leads" }`
OUTPUT: `{ "found": [...], "count": N }`

**Caso 2 — Creación de lead**
INPUT: `{ "name": "...", "email": "...", "funnelId": "..." }`
OUTPUT: `{ "lead_id": "..." }`

### Relación con otros CatPaws

- **vs Consultor CRM (b63164ed)** — rígido (tipo_operacion="consulta_crm"). Operador Holded es flexible.
- **vs Analista de Facturas (a3c5df1e)** — Analista procesa facturas (análisis); Operador las extrae (CRM query).

---

## English

# Holded Operator

**Mode:** processor | **Model:** gemini-main | **Department:** business

### Description

Generalist CatPaw for Holded. Executes any CRM operation: search leads and contacts,
create new leads, add notes, update information. Designed for flexible canvases where
the instruction arrives in natural language.

### Configuration

- Temperature: 0.2
- Max tokens: 2048
- Output format: json

### Use cases

**Case 1 — Lead search**
INPUT: `{ "query": "Juan Pérez", "type": "leads" }`
OUTPUT: `{ "found": [...], "count": N }`

**Case 2 — Lead creation**
INPUT: `{ "name": "...", "email": "...", "funnelId": "..." }`
OUTPUT: `{ "lead_id": "..." }`

### Relationship with other CatPaws

- **vs Consultor CRM (b63164ed)** — rigid (tipo_operacion="consulta_crm"). Holded Operator is flexible.
- **vs Analista de Facturas (a3c5df1e)** — Analista processes invoices (analysis); Operator extracts them (CRM query).

---

## Reference (lang-neutral)

### Canvas node usage

```json
{
  "type": "agent",
  "data": {
    "agentId": "53f19c51-9cac-4b23-87ca-cd4d1b30c5ad",
    "role": "extractor|transformer",
    "extraSkills": [],
    "extraConnectors": [],
    "extraCatBrains": []
  }
}
```

### Linked connectors

- `seed-holded-mcp` (Holded MCP) — 121 tools available

### History

- 2026-04-17 · Created in Phase 145 (v29.0) · [feature-145](features/145-catpaw-operador-holded.md)
```

---

## Apéndice B — Ejemplo de archivo deprecated

```markdown
---
id: catpaw-b63164ed
type: resource
subtype: catpaw
lang: es+en

title:
  es: Consultor CRM
  en: CRM Consultant

summary:
  es: CatPaw rígido para consultas Holded con parámetro `tipo_operacion`. DEPRECADO — reemplazado por Operador Holded (generalista).
  en: Rigid CatPaw for Holded queries via `tipo_operacion` parameter. DEPRECATED — replaced by Holded Operator (generalist).

tags: [catpaw, crm, holded, processor, business]
audience: [catbot, architect, developer]
status: deprecated

created_at: 2025-11-03T12:00:00Z
created_by: user:antonio
version: 2.3.1
updated_at: 2026-04-17T10:25:00Z
updated_by: catbot:phase-145
last_accessed_at: 2026-04-17T11:00:00Z
access_count: 47

deprecated_at: 2026-04-17T10:25:00Z
deprecated_by: catbot:phase-145
deprecated_reason: "Sustituido por Operador Holded (53f19c51). Razón: system_prompt rígido con tipo_operacion='consulta_crm' limita canvases flexibles."
superseded_by: catpaw-53f19c51

change_log:
  - { version: 1.0.0, date: 2025-11-03, author: user:antonio, change: "Creado para canvas de pipelines inbound" }
  - { version: 2.0.0, date: 2026-02-10, author: catbot:phase-112, change: "Añadido system_prompt con tipo_operacion" }
  - { version: 2.3.1, date: 2026-04-17, author: catbot:phase-145, change: "DEPRECATED — superseded by Operador Holded" }

source_of_truth:
  - db: cat_paws
    id: b63164ed-1234-5678-90ab-cdef12345678

related:
  - catpaw-53f19c51  # replacement
  - feature-145      # deprecation event

search_hints:
  es: [consultor crm, legacy crm, tipo_operacion]
  en: [crm consultant, legacy crm, tipo_operacion]

ttl: managed   # elegible para purga 180d desde deprecated_at (si no es accedido)
---

## Español

> ⚠️ **Este CatPaw está deprecado.** Usa [Operador Holded](53f19c51-operador-holded.md) en vez.

[resto del contenido permanece como archivo histórico]

## English

> ⚠️ **This CatPaw is deprecated.** Use [Holded Operator](53f19c51-operador-holded.md) instead.
```

---

## Apéndice C — Notificación de purga elegible

Cuando `kb-sync.cjs --audit-stale` se ejecuta (semanal automático o manual):

**Generación automática** de `.docflow-kb/_audit_stale.md`:

```markdown
---
type: audit
generated_at: 2026-10-14T09:00:00Z
eligible_for_purge: 3
warning_only: 7
---

# Audit de archivos stale — 2026-10-14

## Elegibles para archivado (180+ días sin acceso, deprecated)

| ID | Title | Deprecated since | Last access | Refs in-coming | Action |
|----|-------|------------------|-------------|----------------|--------|
| catpaw-b63164ed | Consultor CRM | 2026-04-17 (180d) | 2026-04-17 | 0 (fase 145 histórico) | **Elegible archivar** |
| connector-abc12345 | Gmail viejo | 2026-04-10 (187d) | 2026-04-10 | 0 | **Elegible archivar** |
| skill-def67890 | Skill obsoleta | 2026-04-01 (196d) | 2026-04-01 | 0 | **Elegible archivar** |

## Warning only (150+ días, aviso previo)

[lista de los que llegarán al umbral en los próximos 30 días]

---

**Para archivar los elegibles:**

    kb-sync.cjs --archive --confirm

Los archivos se mueven a `.docflow-kb/_archived/2026-10-14/` y status pasa a `archived`.
Siguen legibles pero fuera del índice principal. Reversible hasta purga física.
```

---

## Apéndice D — Clasificación completa de la documentación existente

Auditoría realizada 2026-04-18. Cada archivo `.md`/`.json` del proyecto ha sido clasificado basándose en evidencia (fecha, referencias, estado de fases dependientes, contenido, duplicación).

### D.1 Las 3 zonas y dónde va cada cosa

#### 🔵 Zone `.planning/` — GSD workspace activo (queda)

| Archivo | Estado | Notas |
|---------|--------|-------|
| `STATE.md` | Live | Actualizado por workflows GSD |
| `REQUIREMENTS.md` | Live | Milestone v29 activo |
| `ROADMAP.md` | Live | — |
| `PROJECT.md` | Live | — |
| `MILESTONE-CONTEXT.md` | **Live, fusionar** | Recibe contenido de `milestone-v29-revisado.md` (raíz). Versión post-piloto v28 con los 3 bugs canvas-executor + restricciones aplicadas |
| `Index.md` | Live | Se simplifica tras migración, apunta al KB |
| `deferred-items.md` | Live | Backlog |
| `ANALYSIS-canvas-creation-wizard.md` | Live | Plan de diseño en curso |
| `ANALYSIS-knowledge-base-architecture.md` | Live | Este documento |
| `phases/` (130 dirs) | Inmutable | Histórico GSD |
| `reference/` (nuevo) | Ref pool | Recibe `auditoria-catflow.md` desde root hasta migración formal al KB |

#### 🟢 Zone `.docflow-kb/` — Source of Truth (migración destino)

**Se crea vacío en Fase GSD 1. Se pobla gradualmente.**

**Protocolos y referencias técnicas:**

| Origen | Destino KB |
|--------|-----------|
| `skill_orquestador_catbot_enriched.md` (root) | `protocols/orquestador-catflow.md` |
| `.planning/reference/auditoria-catflow.md` (movido desde root) | `domain/architecture/canvas-executor.md` |
| `.planning/knowledge/proceso-catflow-revision-inbound.md` | `protocols/catflow-inbound-review.md` + reglas asociadas |
| `.planning/knowledge/connector-logs-redaction-policy.md` | `protocols/connector-logs-redaction.md` |

**Catálogos → split en átomos:**

| Origen | Destino KB |
|--------|-----------|
| `.planning/knowledge/canvas-nodes-catalog.md` | `domain/concepts/canvas-node.md` + `rules/R01-R25-*.md` (32 archivos) + `domain/taxonomies/node-types.md` |
| `.planning/knowledge/incidents-log.md` | `incidents/INC-XX-*.md` (un archivo por incidente) |
| `.planning/knowledge/holded-mcp-api.md` | `resources/mcp-tools/seed-holded-mcp.md` (archivo largo único) |

**Auto-sync desde DB (se generan dinámicamente):**

| Origen | Destino KB |
|--------|-----------|
| `.planning/knowledge/catpaw-catalog.md` + DB `cat_paws` | `resources/catpaws/{id_short}-{slug}.md` (N archivos auto-sync) |
| `.planning/knowledge/connectors-catalog.md` + DB `connectors` | `resources/connectors/{id_short}-{slug}.md` |
| `.planning/knowledge/skills-catalog.md` + DB `skills` | `resources/skills/{id_short}-{slug}.md` |
| `.planning/knowledge/email-templates-catalog.md` + DB `email_templates` | `resources/email-templates/{id_short}-{slug}.md` |

**Guides:**

| Origen | Destino KB |
|--------|-----------|
| `.planning/knowledge/user-guide.md` | `guides/user-guide.md` |
| `.planning/knowledge/model-onboarding.md` | `guides/model-onboarding.md` |

**Runtime JSONs → split semántico:**

| Origen | Destino KB |
|--------|-----------|
| `app/data/knowledge/catpaw.json` | `domain/concepts/catpaw.md` (concepts) + `guides/how-to-use-catpaws.md` (howto) |
| `app/data/knowledge/catflow.json` | `domain/concepts/catflow.md` + guides |
| `app/data/knowledge/catbrains.json` | `domain/concepts/catbrain.md` + guides |
| `app/data/knowledge/canvas.json` | `domain/concepts/canvas.md` + guides |
| `app/data/knowledge/catboard.json` | `guides/catboard.md` |
| `app/data/knowledge/catpower.json` | `domain/concepts/catpower.md` |
| `app/data/knowledge/settings.json` | `guides/settings.md` |
| `app/data/knowledge/_template.json` | `.docflow-kb/_schema/resource-template-example.md` |
| `app/data/knowledge/_index.json` | Reemplazado por `.docflow-kb/_index.json` (nuevo schema v2) |

**System prompts (extraer de código):**

| Origen | Destino KB |
|--------|-----------|
| `catbot-pipeline-prompts.ts:STRATEGIST_PROMPT` | `runtime/strategist.prompt.md` |
| `catbot-pipeline-prompts.ts:DECOMPOSER_PROMPT` | `runtime/decomposer.prompt.md` |
| `catbot-pipeline-prompts.ts:ARCHITECT_PROMPT` | `runtime/architect.prompt.md` |
| `catbot-pipeline-prompts.ts:CANVAS_QA_PROMPT` | `runtime/canvas-qa.prompt.md` |
| `catbot-pipeline-prompts.ts:AGENT_AUTOFIX_PROMPT` | `runtime/agent-autofix.prompt.md` |

Código los carga vía `loadPrompt(name)` en lugar de tenerlos hardcoded.

#### 🟡 Zone `.docflow-legacy/` — Descartable post-migración

Material cuyo insight ya vive en otro sitio o cuyo milestone está cerrado. Conservado como referencia durante transición. Purga física tras ~180d sin acceso (según regla de purga §5.3).

| Archivo | Razón para legacy |
|---------|-------------------|
| `.planning/AUDIT-catflow-pilot-e2e-test.md` | 3 bugs documentados ya aplicados en MILESTONE-CONTEXT + Skill Orquestador |
| `.planning/AUDIT-catflow-pipeline-quality.md` | Insumo de Phase 133 — **Phase 133 COMPLETE** (5 plans ejecutados) |
| `.planning/AUDIT-respuestas-bateria-19q.md` | Trilogía con anterior, Phase 133 cerrada |
| `.planning/AUDIT-respuestas-funnel-completo.md` | Trilogía con anterior, Phase 133 cerrada |
| `.planning/AUDIT-milestone-v28-retrospectiva.md` | Milestone v28 cerrado |
| `.planning/knowledge/mejoras-sistema-modelos.md` | Post-mortem v25.0 → v25.1 **COMPLETE** |
| Catálogos `.md` post-migración | Tras ingerir en KB se mueven aquí como referencia transitoria |
| JSONs `app/data/knowledge/*.json` post-migración | Idem |

Organización dentro de legacy:

```
.docflow-legacy/
├── README.md                  # Explica que es zona transitoria
├── audits-closed/             # AUDIT-* de fases cerradas
├── milestone-retrospectives/  # v28 y anteriores
├── catalogs-pre-kb/           # Catálogos antes de migrar
├── json-pre-kb/               # app/data/knowledge/*.json viejos
└── _migration-log.md          # Qué se movió, cuándo, a qué destino en KB
```

#### ❌ Borrar

| Archivo | Razón |
|---------|-------|
| `.planning/MILESTONE-CONTEXT-AUDIT.md` | **Duplicado literal** de `AUDIT-respuestas-funnel-completo.md` (verificado con `diff`, exit 0) |

#### ⚪ Queda donde está

| Archivo | Razón |
|---------|-------|
| `.claude/skills/docatflow-conventions.md` | Skill para Claude Code CLI, no para CatBot |
| `CLAUDE.md` (raíz) | Manifest para Claude Code. Se simplifica apuntando al KB pero no se mueve |

### D.2 Operaciones inmediatas (Fase GSD 1 — setup)

Pre-requisitos antes de empezar a migrar knowledge:

1. **`.planning/MILESTONE-CONTEXT.md`**: fusionar contenido de `milestone-v29-revisado.md` (raíz). El revisado reemplaza, no suma.
2. **`.planning/reference/`**: crear subdir y mover `auditoria-catflow.md` desde raíz. Raíz queda limpia.
3. **`.planning/MILESTONE-CONTEXT-AUDIT.md`**: borrar (duplicado).
4. **`milestone-v29-revisado.md`**: borrar tras fusión (contenido vive en MILESTONE-CONTEXT).
5. **`.docflow-kb/` y `.docflow-legacy/`**: crear como estructura vacía con `README.md` que explica propósito y reglas.
6. **`.planning/Index.md`**: actualizar para apuntar a `.docflow-kb/_manual.md` como fuente de conocimiento y deprecar referencias a catálogos que van a migrar.

### D.3 Resumen numérico

| Acción | Archivos |
|--------|----------|
| Quedan en `.planning/` | 10 activos + 130 phase dirs |
| Migran a `.docflow-kb/` | 15 MDs + 9 JSONs + 5 prompts de código = ~29 fuentes ingeridas (produce 100+ archivos atómicos tras split) |
| Van a `.docflow-legacy/` | 6 audits/retrospectivas + N catálogos post-migración |
| Se borran | 2 (duplicado + revisado tras fusión) |
| No se tocan | 2 (CLAUDE.md, docatflow-conventions.md) |

---

*Documento abierto para discusión. Nada comprometido en código aún. La migración es trabajo de Fase GSD 1 — no se ejecuta desde este análisis.*
