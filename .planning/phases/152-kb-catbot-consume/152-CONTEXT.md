# Phase 152: KB CatBot Consume — Context

**Gathered:** 2026-04-20
**Status:** Ready for planning
**Source:** Decisiones delegadas por usuario ("tu que conoces el proyecto elige la mejor opción"), derivadas de scout profundo del código (`catbot-prompt-assembler.ts`, `catbot-tools.ts`, `knowledge-tree.ts`) + PRD §7 Fase 4 (`ANALYSIS-knowledge-base-architecture.md`) + decisiones heredadas de Phase 149/150

<domain>
## Phase Boundary

Hacer que CatBot **consuma** el Knowledge Base. Tres entregables concretos:

1. **Inyección automática** — `catbot-prompt-assembler.ts` lee `.docflow-kb/_header.md` en cada construcción de prompt y lo inyecta como sección P1 (priority 1) con id `kb_header`, antes del `platform_overview` legacy.
2. **Tools nuevas** — `search_kb({...filters})` y `get_kb_entry(id)` registradas en `catbot-tools.ts` como always-allowed (read-only). Permiten a CatBot navegar el KB por tag/type/audience/search + obtener detalle de entries.
3. **Campo `kb_entry` en tools existentes** — `list_cat_paws`, `list_connectors`, `list_catbrains`, `list_email_templates`, `list_skills`, `canvas_list` devuelven ahora un campo opcional `kb_entry: "path/relativo/al/kb.md" | null` en cada item, resuelto buscando por `source_of_truth.id == row.id` en `_index.json`.

**En scope:**
- Nueva sección `kb_header` en prompt-assembler (lectura filesystem fresh por request).
- `search_kb` con filtros `{type, subtype, tags, audience, status, search, limit}` + ranking simple + respuesta resumida (ids+title+summary truncada).
- `get_kb_entry(id)` devuelve frontmatter completo + body markdown + `related_resolved` (resuelve cada entrada de `related[]` a `{type, id, title, path}` vía `_index.json`).
- Actualización del `buildKnowledgeProtocol()` del assembler para enseñar a CatBot el orden: `search_kb` → `get_kb_entry` → `query_knowledge` (legacy fallback) → `search_documentation` (full-text fallback) → `log_knowledge_gap`.
- Extensión del result shape de los 6 `list_*` tools para incluir `kb_entry` cuando exista.
- Tests unitarios sobre las 2 tools nuevas + tests de integración con fixture KB.

**Fuera de scope (explícito):**
- **Deprecación de `query_knowledge`/`search_documentation`** → Phase 155.
- **Creation-tool hooks** (crear catpaw sincroniza archivo KB) → Phase 153.
- **Ranking por access_count / touchAccess invocations** → Phase 153 (requiere hook al llamar `get_kb_entry` que incremente `access_count` en frontmatter, pero eso es write al KB desde runtime — decisión acoplada a Phase 153 creation hooks).
- **Semantic search con Qdrant** → PRD §8.5, reservado a futura fase.
- **Traducción automática** → PRD §8.4, deferred.
- **Dashboard UI** → Phase 154.
- **Limpieza física de legacy** → Phase 155.

</domain>

<decisions>
## Implementation Decisions

Todas las decisiones siguientes son **locked** para researcher + planner (usuario delegó). Claude's Discretion al final lista lo que el planner puede decidir.

### D1. Inyección del `_header.md` en el prompt

- **Nueva sección `kb_header`** en `catbot-prompt-assembler.ts`, priority **P1**.
- **Lectura filesystem fresh por request** (no cache). Razón: `_header.md` es pequeño (<2KB, 33 líneas actualmente), coste I/O despreciable (~1ms), y `kb-sync.cjs` puede regenerarlo en cualquier momento — fresh read garantiza que CatBot ve cambios inmediatos sin invalidación manual.
- **Posición relativa:** antes de `platform_overview` (línea 954 del assembler). Razón: `platform_overview` lee el legacy knowledge tree (`@/lib/knowledge-tree` → `app/data/knowledge/*.json`) y seguirá ahí hasta Phase 155. Inyectar `kb_header` primero hace que CatBot vea la fuente canónica antes que la legacy.
- **No reemplaza `knowledge_protocol` ni `platform_overview` todavía.** Coexisten.
- **Graceful failure:** si `.docflow-kb/_header.md` no existe o falla lectura, `sections.push` NO se añade (patrón `try/catch` como las otras secciones).
- **Contenido del archivo:** se inyecta tal cual como markdown. Phase 150 ya genera `_header.md` con frontmatter + counts + top_tags + last_changes. Si el shape cambia, se adapta solo (no hay parseo específico, se pasa raw).
- **Implementación:** función `buildKbHeader(): string` sigue el patrón de `buildPlatformOverview()`. Import de `fs.readFileSync` (o `fs/promises` si el assembler es async — verificar en código existente).

### D2. Shape de `search_kb` + `get_kb_entry`

#### D2.1. `search_kb(params)` — signature y comportamiento

**Parámetros:**

```typescript
{
  type?: 'concept'|'taxonomy'|'resource'|'rule'|'protocol'|'runtime'|'incident'|'feature'|'guide'|'state',
  subtype?: string,                  // e.g. 'catpaw', 'connector', 'skill', 'email-template', 'canvas', 'catbrain'
  tags?: string[],                   // AND-match contra tags del entry (every tag debe estar presente)
  audience?: 'catbot'|'architect'|'developer'|'user'|'onboarding',
  status?: 'active'|'deprecated'|'draft'|'experimental',  // default: 'active'
  search?: string,                   // full-text, case-insensitive, sobre title + summary + search_hints
  limit?: number                     // default 10, cap 50
}
```

**Respuesta:**

```typescript
{
  total: number,                     // total matches antes de limit
  results: Array<{
    id: string,
    path: string,                    // relative to .docflow-kb/, e.g. "resources/catpaws/53f19c51-operador-holded.md"
    type: string,
    subtype: string | null,
    title: string,
    summary: string,                 // truncada a 200 chars máx
    tags: string[],
    audience: string[],
    status: string,
    updated: string                  // ISO date del frontmatter
  }>
}
```

**Fuente de datos:** `.docflow-kb/_index.json` completo (66 entries ahora, mucho más tras Phase 151). Usar los índices pre-calculados `indexes.by_type`, `indexes.by_tag`, `indexes.by_audience` cuando sea posible (intersección de sets).

**Ranking (score simple — NO semantic):**

Cuando `search` está presente, score = suma ponderada de matches case-insensitive:
- Match en `title` → +3
- Match en `summary` → +2
- Match en `tags[]` → +1 por match
- Match en `search_hints` → +1

Sin `search`: orden por `updated DESC`.

Empate: `status: active` gana sobre `draft`; luego `updated DESC`.

**NO se implementa:** score por `access_count` (requiere touchAccess runtime hooks — Phase 153). Score semántico con Qdrant (PRD §8.5 deferred).

**Paginación:** No hay `offset`. Si el usuario necesita más, refina con filtros (type, subtype, tags). Cap hard de 50 evita responses enormes. Default 10 es sweet spot para LLM context.

#### D2.2. `get_kb_entry(id)` — signature y comportamiento

**Parámetros:**

```typescript
{ id: string }                       // id canónico del entry, e.g. "53f19c51-operador-holded"
```

**Respuesta:**

```typescript
{
  id: string,
  path: string,                      // relative to .docflow-kb/
  frontmatter: {                     // todos los 13 campos obligatorios + condicionales presentes
    id: string,
    type: string,
    subtype: string | null,
    lang: string,
    title: string | { es: string, en: string },
    summary: string | { es: string, en: string },
    tags: string[],
    audience: string[],
    status: string,
    created_at: string,
    created_by: string,
    version: string,
    updated_at: string,
    updated_by: string,
    source_of_truth: Array<{ db: string, table: string, id: string, fields_from_db: string[] }> | null,
    ttl: string,
    related?: Array<{ type: string, id: string }>,
    change_log?: Array<{ version: string, date: string, author: string, reason: string }>,
    search_hints?: string | { es: string, en: string },
    deprecated_at?: string,
    deprecated_by?: string,
    deprecated_reason?: string,
    superseded_by?: string
  },
  body: string,                      // contenido markdown completo debajo del frontmatter
  related_resolved: Array<{          // resuelve cada related[] lookup contra _index.json
    type: string,
    id: string,
    title: string,
    path: string
  }>
}
```

**Resolución de `related_resolved`:** para cada `{type, id}` en `frontmatter.related`:
- Buscar `_index.json.entries` por id matching.
- Si encontrado: incluir `{type, id, title, path}` del entry.
- Si no encontrado (stale reference): incluir `{type, id, title: null, path: null}` con log WARN.

**No leer:** recursos que no existen en disk devuelven `{ error: "NOT_FOUND", id }`. Sin excepción — el tool es read-only y falla graceful.

**NO se implementa:** side effect de `touchAccess` para incrementar `access_count`/`last_accessed_at` — requeriría write al filesystem desde cada call, lo cual complica permisos y es responsabilidad de Phase 153.

### D3. Coexistencia con legacy knowledge tools

**Mantener operativas** `query_knowledge`, `search_documentation`, `log_knowledge_gap` durante toda Phase 152 → Phase 154. Razón: el legacy (`app/data/knowledge/*.json`) contiene concepts, howtos, endpoints que NO están migrados todavía al KB — Phase 151 los migra, Phase 155 los borra. Deprecarlos prematuramente crea gap de cobertura.

**Orden de discovery en el nuevo `buildKnowledgeProtocol()`:**

El protocolo actual (líneas 612-626 del assembler) debe reescribirse para incluir los nuevos tools en primer lugar:

```
## Base de conocimiento del proyecto

El KB estructurado (.docflow-kb/) es la fuente canónica para recursos y protocolos operativos.
El knowledge tree legacy (app/data/knowledge/) sigue activo para conceptos narrativos y documentación
procedural hasta que Phase 155 lo elimine.

Orden obligatorio de consulta para cualquier pregunta sobre DoCatFlow:

1. **search_kb({...filters})** — Busca en el KB estructurado. Úsala PRIMERO para:
   - Recursos: CatPaws, connectors, skills, catbrains, email-templates, canvases
   - Reglas: R01, R02, R10, R13, SE01, DA01
   - Protocolos: Orquestador CatFlow, Arquitecto de Agentes (cuando estén migrados)
   - Incidentes resueltos, features documentadas
2. **get_kb_entry(id)** — Abre el detalle completo de un entry que search_kb devolvió.
3. **query_knowledge(area, query)** — Legacy. Úsala si search_kb no tuvo resultados para:
   - Conceptos narrativos de áreas (catboard, catflow, canvas, catpower, etc.)
   - Howtos procedurales no migrados todavía
4. **search_documentation(query)** — Legacy. Fallback full-text sobre archivos .planning/*.md.
5. **log_knowledge_gap** — Si NINGUNO de los 4 anteriores tiene información útil, registra el gap
   SIEMPRE antes de responder con conocimiento general. Indica que el KB está incompleto.

Flow canónico:
  search_kb → (si 0 results) query_knowledge → (si 0 results) search_documentation → log_knowledge_gap → responder

Cuando CatBot encuentra la respuesta en el KB via search_kb + get_kb_entry, NO necesita llamar las tools legacy.
```

**No añadir deprecation warnings en el código legacy.** Añadirlos prematuramente ensucia el output y confunde. La coexistencia es intencional y finita (Phase 155 cierra).

**No borrar el legacy `platform_overview`** (línea 954): seguirá leyendo `loadKnowledgeIndex()` hasta Phase 155.

### D4. Campo `kb_entry` en tools existentes

**Lista de tools afectadas (6):**

- `list_cat_paws`
- `list_connectors`
- `list_catbrains`
- `list_skills`
- `list_email_connectors` (NO — solo email accounts, no templates) / `list_email_templates` (buscar tool exacto o crear si no existe — flag para planner)
- `canvas_list`

**Shape del campo:**

Cada item del array result gana un campo nuevo:

```typescript
{
  id: string,
  name: string,
  // ...campos existentes...
  kb_entry: string | null          // path relativo al KB, e.g. "resources/catpaws/53f19c51-operador-holded.md"
}
```

**Solo el path.** No se duplica `title` ni `summary` (el list_* ya devuelve `name` y `description`). CatBot puede hacer `get_kb_entry(id_extraido_del_path)` si quiere profundizar.

**Resolución eficiente — in-memory cache con TTL:**

```typescript
// En catbot-tools.ts (o módulo nuevo kb-index-cache.ts)
let indexCache: { loaded: Date | null, data: KbIndex | null } = { loaded: null, data: null };
const INDEX_CACHE_TTL_MS = 60000; // 60s

function getKbIndex(): KbIndex | null {
  const now = new Date();
  if (indexCache.data && indexCache.loaded && (now.getTime() - indexCache.loaded.getTime() < INDEX_CACHE_TTL_MS)) {
    return indexCache.data;
  }
  try {
    const raw = fs.readFileSync('.docflow-kb/_index.json', 'utf8');
    indexCache.data = JSON.parse(raw);
    indexCache.loaded = now;
    return indexCache.data;
  } catch {
    return null;
  }
}

function resolveKbEntry(dbTable: string, dbId: string): string | null {
  const idx = getKbIndex();
  if (!idx) return null;
  const entry = idx.entries.find(e =>
    Array.isArray(e.source_of_truth) &&
    e.source_of_truth.some(sot => sot.table === dbTable && sot.id === dbId)
  );
  return entry ? entry.path : null;
}
```

**Patrón de uso en `list_cat_paws`:**

```typescript
case 'list_cat_paws': {
  const rows = db.prepare('SELECT ... FROM cat_paws WHERE is_active = 1 LIMIT 20').all();
  const withKb = rows.map(row => ({
    ...row,
    kb_entry: resolveKbEntry('cat_paws', row.id)
  }));
  return { name, result: withKb };
}
```

**Siempre presente (no opt-in):** añadir param extra (`include_kb_entry?: boolean`) a cada tool signature sería redundante. Siempre presente es discoverable y el overhead es 1 lookup en memoria sobre 66 entries (trivial). Si el row no tiene archivo KB asociado (CatPaw recién creado antes de Phase 153 hooks), `kb_entry: null`.

**NO tocar los `create_*` / `update_*` / `delete_*` tools** — esos se enganchan en Phase 153 vía `syncResource`.

### D5. Ubicación del código nuevo

- **Nueva sección `kb_header` + `buildKbHeader()`** → dentro de `app/src/lib/services/catbot-prompt-assembler.ts` (mismo archivo, siguiendo convención de builders existentes).
- **Nuevas tools `search_kb` + `get_kb_entry`** → dentro de `app/src/lib/services/catbot-tools.ts`:
  - Registradas en el array `TOOLS` con `name`, `description`, `parameters` schema JSON.
  - Casos en `executeTool` switch.
- **Reescritura de `buildKnowledgeProtocol`** → misma función en `catbot-prompt-assembler.ts`, no se crea módulo nuevo.
- **Helper `resolveKbEntry` + cache `getKbIndex`** → nuevo módulo `app/src/lib/services/kb-index-cache.ts`, importable tanto desde `catbot-tools.ts` como desde futuros consumidores.
- **Parser del frontmatter para `get_kb_entry`** → reusar el parser del módulo Phase 150 si está expuesto (`scripts/kb-sync-db-source.cjs` tiene `parseYAML` y `parseFile`). Si no está exposable (es .cjs en scripts/), crear helper TS en `app/src/lib/services/kb-parser.ts` — probablemente se necesita `js-yaml` o parser YAML que funcione en Next.js server-side.

### D6. Tests obligatorios

**Nyquist validation enabled** → cada decisión arriba debe tener test cobertura:

**Unit tests (nuevo archivo `app/src/lib/__tests__/kb-tools.test.ts`):**
- `search_kb` con filtro `type: 'resource'` devuelve sólo resources.
- `search_kb` con filtro `subtype: 'catpaw'` devuelve los 9 catpaws (o los del fixture).
- `search_kb` con `tags: ['catpaw', 'business']` hace AND (ambos tags deben estar).
- `search_kb` con `search: 'holded'` hace match case-insensitive en title/summary/hints y rankea correctamente.
- `search_kb` con `limit: 5` devuelve 5 resultados + `total` con el count real.
- `search_kb` sin filtros devuelve `status: 'active'` por default.
- `search_kb` con `status: 'deprecated'` devuelve solo deprecated.
- `get_kb_entry('id-existente')` devuelve frontmatter parseado + body + related_resolved.
- `get_kb_entry('id-que-no-existe')` devuelve `{ error: 'NOT_FOUND' }`.
- `get_kb_entry` con `related` resuelve títulos desde index.

**Unit tests assembler (`app/src/lib/__tests__/catbot-prompt-assembler.test.ts`):**
- `buildKbHeader()` inyecta contenido de `.docflow-kb/_header.md` cuando existe.
- `buildKbHeader()` devuelve `''` cuando archivo no existe (graceful).
- Assembler producido incluye sección `kb_header` con priority 1 y posicionada antes de `platform_overview`.
- `buildKnowledgeProtocol()` reescrito menciona `search_kb` y `get_kb_entry`.

**Integration tests (`app/src/lib/__tests__/kb-tools-integration.test.ts`):**
- Fixture `.docflow-kb/` temporal con 6 entries (1 por subtype).
- `list_cat_paws` devuelve items con `kb_entry` correctamente resuelto.
- `list_cat_paws` con row sin archivo KB devuelve `kb_entry: null`.
- Cache TTL: llamar `list_cat_paws` 2 veces dentro de 60s → solo 1 read del index file.
- Cache invalidation: tras 60s → re-read.

**Oracle test (CatBot uso real — manual pre-cierre):**
Correr CatBot en dev y:
1. Preguntar "¿Qué CatPaws existen?" → CatBot debe llamar `search_kb({subtype: 'catpaw'})` o `list_cat_paws`, y la respuesta debe incluir el Operador Holded con su `kb_entry`.
2. Preguntar "Dame el detalle del Operador Holded" → CatBot debe llamar `get_kb_entry('53f19c51-operador-holded')` o similar, y devolver frontmatter + body.
3. Preguntar "¿Qué reglas conoce el sistema?" → CatBot debe intentar `search_kb({type: 'rule'})` y si devuelve 0 (Phase 151 aún no migró reglas) caer a `query_knowledge`.

### D7. Claude's Discretion (el planner decide con justificación)

- Runtime de tests → vitest (igual que Phase 149/150, ya establecido).
- Cómo parsear YAML frontmatter en el path Next.js server-side (librería js-yaml vs gray-matter vs parser casero). Preferible reusar lo que Phase 150 hizo en `scripts/kb-sync-db-source.cjs` si es portable.
- Si el cache de `_index.json` vive en `catbot-tools.ts` inline o en módulo dedicado `kb-index-cache.ts` → decisión del planner basada en si hay otros consumidores previsibles (probablemente sí: dashboard Phase 154 también lee el index).
- Strategy exacto para capturar `path` del archivo KB dentro del frontmatter parsed: el path no está dentro del frontmatter, está en `_index.json.entries[].path`. Decisión del planner si `get_kb_entry` recibe `id` y resuelve vía index, o recibe `path` directo (la firma aquí decide `id`).
- Formato del `related_resolved` cuando el `related` es null/undefined: array vacío `[]` (el planner ajusta).
- Exit codes / códigos de error concretos para los tools (`NOT_FOUND`, `INVALID_FILTER`, etc.) — formato consistente con tools existentes que devuelven `{ error: string }` en el result.
- Si cache TTL 60s es óptimo — el planner puede ajustarlo a 30s o 120s si ve una razón concreta. No crítico.

</decisions>

<specifics>
## Specific Ideas

### Shape del _index.json disponible (post-Phase 150)

Ya confirmado:

```json
{
  "schema_version": "2.0",
  "generated_at": "...",
  "generated_by": "knowledge-sync",
  "entry_count": 66,
  "header": {
    "counts": {
      "catpaws_active": 9, "connectors_active": 4, "catbrains_active": 1,
      "templates_active": 9, "skills_active": 39, "canvases_active": 2,
      "rules": 0, "incidents_resolved": 0, "features_documented": 0
    },
    "top_tags": [],
    "last_changes": []
  },
  "entries": [
    {
      "id": "5a56962a-email-classifier-pilot",
      "path": "resources/canvases/5a56962a-email-classifier-pilot.md",
      "type": "resource",
      "subtype": "canvas",
      "title": "Email Classifier Pilot",
      "summary": "...",
      "tags": ["canvas"],
      "audience": ["catbot", "architect"],
      "status": "active",
      "updated": "2026-04-17 14:26:46",
      "search_hints": null
    }
  ],
  "indexes": {
    "by_type": {},
    "by_tag": {},
    "by_audience": {}
  }
}
```

**Nota crítica:** los `indexes.by_type / by_tag / by_audience` están poblados en el shape pero vacíos `{}` en el dev DB actual — Phase 150 los dejó como estructura vacía pendiente de relleno. `search_kb` debe funcionar aunque estén vacíos (fallback: scan lineal de `entries[]`). El planner puede decidir poblarlos como mejora, o trabajar sobre scan lineal (66 entries → <1ms en memoria).

### Ejemplo de prompt de CatBot con kb_header inyectado

```markdown
... [sección P0: instructions_primary] ...

## KB Header (auto-generated)
**Generado:** 2026-04-18T17:17:00.137Z
**Entradas totales:** 66

### Conteos activos
- 9 CatPaws
- 4 Connectors
- 39 Skills
- 1 CatBrain
- 9 Email templates
- 2 Canvases
- 0 Rules (pending migration Phase 151)

### Tags frecuentes
(populating in Phase 151)

### Cambios recientes
(populating in Phase 151)

## Plataforma — Areas de conocimiento  [legacy, seguirá hasta Phase 155]
- catboard: ...
- catflow: ...
...

## Protocolo de knowledge [reescrito Phase 152]
1. search_kb({...filters}) — KB estructurado PRIMERO
2. get_kb_entry(id) — detalle
3. query_knowledge(area, query) — legacy fallback
4. search_documentation(query) — full-text fallback
5. log_knowledge_gap — si nada tiene respuesta
```

### Flujo canónico CatBot responde "¿Qué CatPaws existen?"

1. Prompt assembler inyecta `kb_header` → CatBot sabe que hay 9 CatPaws.
2. CatBot llama `list_cat_paws` → recibe 9 items con campo `kb_entry` cada uno.
3. Usuario pide detalle de Operador Holded → CatBot llama `get_kb_entry("53f19c51-operador-holded")` → recibe frontmatter + body (system_prompt, department, etc.) + related (catbrain + connector) resuelto.
4. CatBot responde al usuario con la info enriquecida.

Esto es el "KB vivo" que Phase 149/150 preparó pero no entregó.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`app/src/lib/services/catbot-prompt-assembler.ts`** — assembler modular P0-P3 con budget-based assembly (32k-64k chars según modelo). Ya tiene patrón `sections.push({ id, priority, content })` + `buildXxxSection()` builders. Fase 152 añade `buildKbHeader()` + `buildKnowledgeProtocol()` reescrito.
- **`app/src/lib/services/catbot-tools.ts`** — array `TOOLS: ToolDefinition[]` (línea ~80) + `executeTool(name, args, baseUrl, context)` switch (línea 1486). Patrón establecido: `case 'list_x': { /* db.prepare().all() */; return { name, result }; }`. Fase 152 añade 2 cases (`search_kb`, `get_kb_entry`) + modifica 6 existing list cases.
- **`.docflow-kb/_index.json` (66 entries)** — ya tiene shape v2 completo post-Phase 150. Consumible directamente via `fs.readFileSync` + `JSON.parse`.
- **`.docflow-kb/_header.md` (33 líneas, ~2KB)** — ya generado por Phase 150 con counts reales. Consumible via `fs.readFileSync`.
- **`app/src/lib/services/knowledge-sync.ts`** — servicio Phase 149. Expone `touchAccess(path)` que podría invocarse desde `get_kb_entry` en Phase 153 (deferred a ese plan).
- **`scripts/kb-sync-db-source.cjs`** (Phase 150) — tiene `parseYAML` y `parseFile` pero es CommonJS en `scripts/`. Reusar en Next.js server-side requiere portar o duplicar helper.

### Established Patterns

- **Tool pattern:** `{ name, description, parameters }` JSON schema + case en executeTool switch. Las read tools (`list_*`, `get_*`, `search_*`, `query_*`) no tienen permission gate — son always-allowed implícitamente. Solo `USER_SCOPED_TOOLS` (línea 1493) requieren sudo por user boundaries. `search_kb` y `get_kb_entry` son read-only cross-user — no requieren sudo.
- **Section priority:** P0 = crítico no-truncable (instructions_primary), P1 = importante, P2 = contextual, P3 = troubleshooting/email.
- **Graceful degradation:** todos los `try/catch` en assembler permiten que una sección falle sin romper el prompt entero.
- **Fresh vs cached:** `loadKnowledgeIndex()` actual (legacy) NO cachea — lee el archivo cada vez. El KB nuevo puede cachear con TTL 60s porque se regenera menos frecuentemente que query_knowledge calls.

### Integration Points

- **`catbot-prompt-assembler.ts:954`** — insertar `sections.push({ id: 'kb_header', priority: 1, content: buildKbHeader() })` ANTES de la línea de `platform_overview`.
- **`catbot-prompt-assembler.ts:915`** — ajustar contenido de `buildKnowledgeProtocol()` (función definida en línea 612) para incluir search_kb/get_kb_entry como tools primarias.
- **`catbot-tools.ts:TOOLS array (~línea 80)`** — añadir 2 definiciones nuevas (`search_kb`, `get_kb_entry`).
- **`catbot-tools.ts:executeTool switch (línea 1486+)`** — añadir 2 cases nuevos + modificar 6 list_* cases.
- **Nuevo módulo `app/src/lib/services/kb-index-cache.ts`** — helper compartido `getKbIndex()` + `resolveKbEntry(table, id)` + parser frontmatter.

### DB Schema Context (no se modifica)

Este phase es solo lectura — DB permanece intacta. Las tools `search_kb`/`get_kb_entry` leen filesystem. `kb_entry` se resuelve via `_index.json` in-memory.

</code_context>

<deferred>
## Deferred Ideas

- **`touchAccess` en `get_kb_entry`** (incrementar access_count + last_accessed_at del frontmatter cuando CatBot abre un entry). Acoplado a Phase 153 creation hooks porque comparte el sistema de writes al KB desde runtime.
- **Ranking por access_count** en `search_kb`. Requiere touchAccess operativo (Phase 153).
- **Populate `indexes.by_type/by_tag/by_audience`** en `_index.json` — gap heredado de Phase 150. Si el planner decide es trivial (1h de trabajo en el generator de Phase 150), puede hacerse como mejora. Si es invasivo, queda para Phase 155 cleanup o futura fase.
- **Semantic search con Qdrant** sobre `_index.json` — PRD §8.5, reservada a Phase 154 (dashboard) o post-v29.1.
- **Traducción automática ES→EN** en el KB — PRD §8.4, deferred.
- **Deprecación de `query_knowledge` / `search_documentation`** — Phase 155 (cuando legacy esté borrado).
- **Dashboard UI `/knowledge`** — Phase 154.
- **Creation-tool hooks** (`create_cat_paw` → `syncResource` → KB sync en vivo) — Phase 153.
- **Pagination real** en `search_kb` (offset + cursor) — no necesario actualmente con 66 entries. Añadir si Phase 151 mete >500 entries y algún flujo lo pide.
- **Bulk `search_kb` + `get_kb_entry` combinado** (devolver body inline en search) — rechazado por token cost. Patrón search → get separado es más eficiente.
- **Historial de queries de CatBot** (telemetría sobre qué tags/search usa más) — útil para analítica pero fuera de scope.
- **Validación runtime del `_index.json` contra schema** antes de consumir — asume schema correcto por Phase 149 validator. Si falla al leer, graceful degradation.

</deferred>

---

*Phase: 152-kb-catbot-consume*
*Context gathered: 2026-04-20 (decisiones delegadas por usuario, derivadas de scout del código actual + PRD §7 Fase 4)*
