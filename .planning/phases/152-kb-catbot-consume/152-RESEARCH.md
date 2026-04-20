# Phase 152: KB CatBot Consume — Research

**Researched:** 2026-04-20
**Domain:** CatBot runtime integration with the `.docflow-kb/` Knowledge Base (read path — Fase 4 del PRD KB)
**Confidence:** HIGH (entirely grounded in existing code + CONTEXT + direct filesystem inspection)

## Summary

Phase 152 hace que CatBot **consuma** el Knowledge Base poblado por Phases 149/150/151 (126 entries: 67 resources + 60 knowledge items en `.docflow-kb/`). Tres mecanismos de consumo + un fix heredado:

1. **Inyección pasiva del `_header.md`** en el system prompt via `catbot-prompt-assembler.ts` (sección `kb_header`, priority P1, fresh-read sin cache).
2. **Tools nuevas `search_kb` / `get_kb_entry`** registradas en `catbot-tools.ts`, always-allowed (read-only, cross-user seguro).
3. **Campo `kb_entry: string | null`** añadido al result de 6 `list_*` tools existentes, resuelto via cache 60s del `_index.json`.
4. **Fix Zod schema de `query_knowledge`**: root cause NO es `__redirect` keys (Zod v3 sin `.strict()` los ignora silently), sino `catboard.json.concepts[18..20]` que son `{term, definition}` objects pre-existentes. Además extender para admitir `{__redirect: string}` preventivamente (Phase 151 introdujo ese patrón en otros sitios).

Todas las decisiones de shape, locations y always-allowed están locked en CONTEXT.md. Esta research investiga los **detalles de implementación** donde CONTEXT deja discretion: parser YAML, estructura del cache module, test fixture design, un conflicto CONTEXT-vs-realidad en `resolveKbEntry`, y oracle test design.

**Primary recommendation:** Implementar 4 módulos disjuntos (`kb-index-cache.ts`, extensiones al assembler, extensiones a `catbot-tools.ts`, fix al Zod schema de `knowledge-tree.ts`) con tests vitest siguiendo el patrón `mkdtempSync + vi.hoisted` ya establecido. **Usar `js-yaml` (ya instalado transitively, v4.1.1)** para parsear frontmatter en lugar de portar parser casero — es idiomático y el coste es 0.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D1. Inyección de `_header.md` en el prompt**
- Nueva sección `kb_header` en `catbot-prompt-assembler.ts`, priority **P1**.
- Lectura filesystem fresh por request (no cache). `_header.md` es <2KB, coste ~1ms, y `kb-sync.cjs` puede regenerarlo en cualquier momento.
- Posición relativa: **antes de `platform_overview`** (línea 954 del assembler).
- No reemplaza `knowledge_protocol` ni `platform_overview` todavía. Coexisten.
- Graceful failure: si archivo no existe, `sections.push` NO se añade.
- Contenido se inyecta raw como markdown.
- Implementación: función `buildKbHeader(): string` sigue patrón de `buildPlatformOverview()`.

**D2.1. `search_kb(params)` — signature y comportamiento**
- Parámetros: `{type?, subtype?, tags?, audience?, status?, search?, limit?}` (defaults: status=active, limit=10, cap 50).
- Filtros: AND contra tags, match case-insensitive sobre title/summary/search_hints.
- Ranking simple (title=3, summary=2, tag=1, search_hints=1). Sin `search`: orden por `updated DESC`. Empate: active > draft; luego updated DESC.
- Fuente: `.docflow-kb/_index.json` completo.
- Cap hard 50, default 10. No offset/pagination.
- NO score por access_count (Phase 153). NO semantic search con Qdrant (deferred).
- Respuesta: `{ total, results: [{id, path, type, subtype, title, summary, tags, audience, status, updated}] }` (summary truncada a 200 chars).

**D2.2. `get_kb_entry(id)` — signature y comportamiento**
- Parámetro: `{id: string}` (id canónico del entry, ej. "53f19c51-operador-holded").
- Respuesta: `{id, path, frontmatter, body, related_resolved}`.
- Resolución de `related_resolved`: para cada `{type, id}` en `frontmatter.related`, buscar en `_index.json.entries` por id. Si no encuentra, incluir `{type, id, title: null, path: null}` con log WARN.
- Entry no existe: `{ error: 'NOT_FOUND', id }` (graceful, no throw).
- NO `touchAccess` side effect (deferred a Phase 153).

**D3. Coexistencia con legacy knowledge tools**
- Mantener operativas `query_knowledge`, `search_documentation`, `log_knowledge_gap` durante Phase 152 → 154.
- Reescritura del `buildKnowledgeProtocol()` (líneas 612-626 del assembler) para incluir nuevas tools en primer lugar.
- Orden: `search_kb` → `get_kb_entry` → `query_knowledge` → `search_documentation` → `log_knowledge_gap`.
- No añadir deprecation warnings. No borrar `platform_overview` (línea 954).

**D4. Campo `kb_entry` en tools existentes (6)**
- `list_cat_paws`, `list_connectors`, `list_catbrains`, `list_email_templates` (o equivalente), `list_skills`, `canvas_list`.
- Shape: cada item gana `kb_entry: string | null` con path relativo al KB.
- Solo el path. No se duplica title/summary.
- Resolución via in-memory cache con TTL 60s del `_index.json`.
- `resolveKbEntry(dbTable, dbId)` busca por `source_of_truth.table == dbTable && source_of_truth.id == dbId`.
- Siempre presente (no opt-in). Si row sin archivo KB: `kb_entry: null`.
- NO tocar `create_*` / `update_*` / `delete_*` tools (Phase 153).

**D5. Ubicación del código nuevo**
- `buildKbHeader()` + reescritura `buildKnowledgeProtocol()` → dentro de `catbot-prompt-assembler.ts`.
- `search_kb` + `get_kb_entry` (registro + case en switch) → dentro de `catbot-tools.ts`.
- `resolveKbEntry` + cache `getKbIndex` + parser frontmatter → **nuevo módulo `app/src/lib/services/kb-index-cache.ts`** (importable desde tools y futuros consumers — Phase 154 dashboard lo necesitará).

**D6. Tests obligatorios (Nyquist enabled)**
- Unit tests `kb-tools.test.ts` para search_kb (filtros, ranking, limit, status default) y get_kb_entry (existente, no existente, related_resolved).
- Unit tests en `catbot-prompt-assembler.test.ts` para buildKbHeader injection, graceful failure, y reescritura de `buildKnowledgeProtocol`.
- Integration tests `kb-tools-integration.test.ts` con fixture KB temporal (6+ entries), verificación de campo `kb_entry` y cache TTL.
- Oracle test: correr CatBot en dev, repetir prompt de Phase 151 ("¿Qué sabes del KB?") — debe devolver contenido factual.

**Addendum A3 — Extensión del Zod schema de `query_knowledge`**
- Extender schema para aceptar `concepts: (string | { __redirect: string })[]` (y mismo patrón para howto, dont si aplica).
- Cuando encuentra redirect: devolver `{ type: 'redirect', target_kb_path, hint: 'Use get_kb_entry to resolve' }`.
- **NO deprecar query_knowledge** (opción A en Addendum). Coexistencia limpia.

### Claude's Discretion

- Runtime de tests → **vitest** (establecido en Phases 149/150/151).
- Parser YAML frontmatter → decidir entre `js-yaml` (ya presente transitivamente), `gray-matter` (idiomático), o portar parser casero de Phase 150.
- Cache de `_index.json` → inline en `catbot-tools.ts` o módulo dedicado `kb-index-cache.ts`.
- Strategy exacto para `path` del archivo KB dentro del frontmatter parsed: el path está en `_index.json.entries[].path`, no en frontmatter.
- Formato del `related_resolved` cuando `related` es null/undefined.
- Códigos de error concretos (`NOT_FOUND`, `INVALID_FILTER`).
- Cache TTL 60s — ajustable a 30s o 120s si hay razón concreta.

### Deferred Ideas (OUT OF SCOPE)

- `touchAccess` en `get_kb_entry` → Phase 153 (acoplado a hooks de write).
- Ranking por access_count → Phase 153.
- Populate `indexes.by_type/by_tag/by_audience` → ya poblado por Phase 151 (GAP cerrado, ver §1 de este research).
- Semantic search con Qdrant → PRD §8.5, post-v29.1.
- Traducción automática ES→EN → PRD §8.4, deferred.
- Deprecación de `query_knowledge` / `search_documentation` → Phase 155.
- Dashboard UI `/knowledge` → Phase 154.
- Creation-tool hooks → Phase 153.
- Pagination real en `search_kb` → no necesario con 126 entries.
- Bulk `search_kb + body inline` → rechazado por token cost.
- Historial de queries de CatBot (telemetría) → fuera de scope.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| KB-15 | CatBot consume `.docflow-kb/_header.md` automáticamente vía `catbot-prompt-assembler.ts` (sección P1 `kb_header` inyectada en cada prompt, fresh-read filesystem) | §2 (Assembler integration) + §6 (Tests assembler: inject/graceful) |
| KB-16 | Tools nuevas `search_kb({type,subtype,tags,audience,status,search,limit})` y `get_kb_entry(id)` operativas, always-allowed, con tests unitarios + oráculo CatBot | §1 (Tool pattern) + §3 (Cache design) + §4 (YAML parser) + §6 (Unit tests) + §8 (Oracle) + §9 (LLM integration) |
| KB-17 | Campo `kb_entry: string \| null` presente en results de `list_cat_paws`, `list_connectors`, `list_catbrains`, `list_email_templates`, `list_skills`, `canvas_list`; resuelto vía cache 60s del `_index.json` | §3 (Cache) + §7 (Fixture KB) + **CONFLICT #1** (resolver via frontmatter, no index) |
| KB-18 | Zod schema de `query_knowledge` extendido para aceptar `{__redirect: string}` en concepts/howtos/dont arrays — devuelve hint con `target_kb_path` cuando encuentra redirect, no falla (fix heredado de Phase 151) | §5 (Zod fix) + **CONFLICT #2** (root cause real es distinto) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 4.1.0 | Test runner | Usado por Phases 149/150/151; configurado en `app/package.json` |
| zod | 3.25.76 | Schema validation | Ya en uso por `knowledge-tree.ts` (`KnowledgeEntrySchema`); transitive dep |
| better-sqlite3 | 12.6.2 | DB access | Ya en uso para DB live reads en tools |
| `node:fs` | nativo | Filesystem reads | Usado por assembler (`loadKnowledgeIndex`) y knowledge-sync |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **js-yaml** | **4.1.1** | **YAML frontmatter parser** | **RECOMMENDED para `get_kb_entry` body extraction** — ya instalado transitively (`app/node_modules/js-yaml/package.json`), standard library, safe load API previene prototype pollution |
| gray-matter | (no instalado) | MD + frontmatter parser | Alternative: más idiomático en Next.js blogs pero añade dep. Descartado — js-yaml cubre el 100% del need con 1 split manual. |
| parser casero (`parseFrontmatter` en `knowledge-sync.ts:398`) | inline | YAML parsing | Ya existe pero NO exportado. Opción B: exponer `parseFrontmatter` del servicio para que el tool lo reuse. Pro: consistencia; Con: expande API pública del service para uso read-only |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| js-yaml direct | Export `parseFrontmatter` del `knowledge-sync.ts` | Reuse es atractivo pero acopla read path (KB consume) al write path (sync). Separation of concerns gana. |
| Module dedicado `kb-index-cache.ts` | Cache inline en `catbot-tools.ts` | CONTEXT D7 marca esto como discretion. **Recomendo módulo dedicado** porque Phase 154 dashboard lo reutilizará (confirmed por CONTEXT §Roadmap Evolution). Evita refactor futuro. |
| Leer frontmatter de cada resource file al cold-start de cache | Solo leer `_index.json` | **Conflict critical** — ver §CONFLICT #1. `_index.json.entries[]` NO expone `source_of_truth`. Hay que leer 67 resource files. |

**Installation:**
```bash
# Nada que instalar — js-yaml, zod, vitest ya presentes en app/node_modules.
# Si se quiere declarar js-yaml explícitamente en dependencies (recomendado):
cd app && npm install --save js-yaml@^4.1.1
cd app && npm install --save-dev @types/js-yaml
```

## Architecture Patterns

### Recommended Project Structure
```
app/src/lib/
├── services/
│   ├── catbot-prompt-assembler.ts         # Modify: buildKbHeader() + reescritura buildKnowledgeProtocol()
│   ├── catbot-tools.ts                    # Modify: TOOLS += search_kb/get_kb_entry + executeTool switch + 6 list_* cases
│   ├── kb-index-cache.ts                  # NEW: getKbIndex() + resolveKbEntry() + invalidateKbIndex() + parseKbFile()
│   └── knowledge-sync.ts                  # Untouched (write path — Phase 150 owns it)
├── knowledge-tree.ts                      # Modify: extend Zod to accept {__redirect} + {term, definition} objects; query_knowledge tool emits hint on redirect
└── __tests__/
    ├── kb-index-cache.test.ts             # NEW: cache hit/miss/TTL/invalidation + resolveKbEntry
    ├── kb-tools.test.ts                   # NEW: search_kb filters + get_kb_entry + related_resolved
    ├── kb-tools-integration.test.ts       # NEW: list_cat_paws.kb_entry e2e con fixture
    ├── catbot-prompt-assembler.test.ts    # Modify: add kb_header injection + graceful tests
    └── knowledge-tree.test.ts             # Modify: add Zod __redirect/object acceptance tests
```

### Pattern 1: Tool registration in catbot-tools.ts
**What:** Add a `{type: 'function', function: {name, description, parameters}}` literal to the `TOOLS` array (line ~76), then add a `case 'tool_name':` branch to the `executeTool` switch (line 1508+).

**When to use:** Any new CatBot tool that the LLM should discover via function calling.

**Example (search_kb):**
```typescript
// In TOOLS array (app/src/lib/services/catbot-tools.ts, suggest after canvas_list at L536)
{
  type: 'function',
  function: {
    name: 'search_kb',
    description: 'Busca en el Knowledge Base estructurado (.docflow-kb/) por tipo, subtipo, tags, audiencia, estado o texto libre. Devuelve una lista de entries con id, path, title y summary. Usa esto PRIMERO para cualquier pregunta sobre DoCatFlow (recursos, reglas, protocolos, incidentes, guías).',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['concept','taxonomy','resource','rule','protocol','runtime','incident','feature','guide','state'] },
        subtype: { type: 'string', description: 'Ej: catpaw, connector, skill, email-template, canvas, catbrain' },
        tags: { type: 'array', items: { type: 'string' }, description: 'AND-match — todos los tags deben estar presentes' },
        audience: { type: 'string', enum: ['catbot','architect','developer','user','onboarding'] },
        status: { type: 'string', enum: ['active','deprecated','draft','experimental'], description: 'Default: active' },
        search: { type: 'string', description: 'Texto libre case-insensitive sobre title, summary, search_hints' },
        limit: { type: 'number', description: 'Default 10, cap 50' },
      },
    },
  },
},
```

**Permission gate (`getToolsForLLM`, line 1328+):** `search_kb` y `get_kb_entry` hacen read-only cross-user → añadir al bloque always-allowed de la línea 1353:
```typescript
// Modify line 1353-1360:
if (name === 'navigate_to' || name === 'explain_feature' || name === 'query_knowledge'
    || name === 'search_kb' || name === 'get_kb_entry'          // <- add
    || name.startsWith('list_') || name.startsWith('get_')
    ...
```

**USER_SCOPED_TOOLS (line 1493):** NO añadir — read-only, no cross-user boundaries.

**Ejecución (nuevo case en `executeTool`):**
```typescript
case 'search_kb': {
  try {
    const params = args as { type?: string; subtype?: string; tags?: string[]; audience?: string; status?: string; search?: string; limit?: number };
    const result = searchKb(params);  // implementada en kb-index-cache.ts
    return { name, result };
  } catch (err) {
    return { name, result: { error: (err as Error).message } };
  }
}
case 'get_kb_entry': {
  const id = args.id as string;
  if (!id) return { name, result: { error: 'id es obligatorio' } };
  try {
    const entry = await getKbEntry(id);
    if (!entry) return { name, result: { error: 'NOT_FOUND', id } };
    return { name, result: entry };
  } catch (err) {
    return { name, result: { error: (err as Error).message } };
  }
}
```

### Pattern 2: Cache with TTL + graceful filesystem read
**What:** Module-level `let` cache with `{loaded, data}` shape. Lazy populate on first read. TTL check on every access. Graceful return `null` if file missing/invalid.

**When to use:** Static-ish data regenerated by external process (`kb-sync.cjs`) that consumers need to read frequently.

**Source:** Pattern establecido en `knowledge-tree.ts:48` (`indexCache`) y `catbot-user-profile.ts`. Reuse literal.

**Example (`kb-index-cache.ts`):**
```typescript
// app/src/lib/services/kb-index-cache.ts (NEW)
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const KB_ROOT = path.join(process.cwd(), '..', '.docflow-kb');  // app/ → repo-root/.docflow-kb
// Alternative: process.cwd() when Next.js runs from repo root during prod.
// Test harness usa KB_ROOT_OVERRIDE env var para apuntar a fixture tmp.
const KB_ROOT_RESOLVED = process['env']['KB_ROOT_OVERRIDE'] || KB_ROOT;
const INDEX_CACHE_TTL_MS = 60_000;  // 60s

interface KbIndexEntry {
  id: string;
  path: string;
  type: string;
  subtype: string | null;
  title: string;
  summary: string;
  tags: string[];
  audience: string[];
  status: string;
  updated: string;
  search_hints: string[] | null;
}

interface KbIndex {
  schema_version: string;
  entry_count: number;
  entries: KbIndexEntry[];
  indexes: { by_type: Record<string,string[]>; by_tag: Record<string,string[]>; by_audience: Record<string,string[]> };
}

interface SourceOfTruthCache {
  // Map "table:id" -> entry.path (e.g. "cat_paws:72ef0fe5-9132-4a08-bc4d-37e8bbb2e6bc" -> "resources/catpaws/72ef0fe5-...md")
  byTableId: Map<string, string>;
  loadedAt: number;
}

let indexCache: { loadedAt: number; data: KbIndex | null } = { loadedAt: 0, data: null };
let sotCache: SourceOfTruthCache | null = null;

export function getKbIndex(): KbIndex | null {
  const now = Date.now();
  if (indexCache.data && now - indexCache.loadedAt < INDEX_CACHE_TTL_MS) {
    return indexCache.data;
  }
  try {
    const raw = fs.readFileSync(path.join(KB_ROOT_RESOLVED, '_index.json'), 'utf8');
    indexCache = { loadedAt: now, data: JSON.parse(raw) as KbIndex };
    sotCache = null;  // Invalidate source-of-truth map too
    return indexCache.data;
  } catch {
    return null;
  }
}

export function invalidateKbIndex(): void {
  indexCache = { loadedAt: 0, data: null };
  sotCache = null;
}

// See §CONFLICT #1 — this function must read source_of_truth from each resource file's frontmatter
// because _index.json.entries[] does NOT expose source_of_truth.
function buildSourceOfTruthCache(index: KbIndex): SourceOfTruthCache {
  const byTableId = new Map<string, string>();
  for (const entry of index.entries) {
    if (entry.type !== 'resource') continue;
    try {
      const filePath = path.join(KB_ROOT_RESOLVED, entry.path);
      const raw = fs.readFileSync(filePath, 'utf8');
      const fm = parseFrontmatter(raw);
      const sot = fm.source_of_truth as Array<{ db: string; table: string; id: string }> | null;
      if (!Array.isArray(sot)) continue;
      for (const s of sot) {
        if (s.table && s.id) byTableId.set(`${s.table}:${s.id}`, entry.path);
      }
    } catch { /* skip malformed */ }
  }
  return { byTableId, loadedAt: Date.now() };
}

export function resolveKbEntry(dbTable: string, dbId: string): string | null {
  const idx = getKbIndex();
  if (!idx) return null;
  if (!sotCache || Date.now() - sotCache.loadedAt > INDEX_CACHE_TTL_MS) {
    sotCache = buildSourceOfTruthCache(idx);
  }
  return sotCache.byTableId.get(`${dbTable}:${dbId}`) ?? null;
}

function parseFrontmatter(fileContent: string): Record<string, unknown> {
  if (!fileContent.startsWith('---\n') && !fileContent.startsWith('---\r\n')) return {};
  const lines = fileContent.split('\n');
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { endIdx = i; break; }
  }
  if (endIdx === -1) return {};
  const yamlText = lines.slice(1, endIdx).join('\n');
  return yaml.load(yamlText) as Record<string, unknown>;
}

export function parseKbFile(filePath: string): { frontmatter: Record<string, unknown>; body: string } | null {
  try {
    const raw = fs.readFileSync(path.join(KB_ROOT_RESOLVED, filePath), 'utf8');
    if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) return { frontmatter: {}, body: raw };
    const lines = raw.split('\n');
    let endIdx = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') { endIdx = i; break; }
    }
    if (endIdx === -1) return { frontmatter: {}, body: raw };
    const yamlText = lines.slice(1, endIdx).join('\n');
    const body = lines.slice(endIdx + 1).join('\n');
    return { frontmatter: yaml.load(yamlText) as Record<string, unknown>, body };
  } catch {
    return null;
  }
}

// search_kb implementation lives here too (keep module cohesive — it's "KB read path")
export function searchKb(params: {
  type?: string; subtype?: string; tags?: string[]; audience?: string;
  status?: string; search?: string; limit?: number;
}): { total: number; results: Array<Pick<KbIndexEntry,'id'|'path'|'type'|'subtype'|'title'|'summary'|'tags'|'audience'|'status'|'updated'>> } {
  const idx = getKbIndex();
  if (!idx) return { total: 0, results: [] };
  const status = params.status ?? 'active';
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);

  let candidates: KbIndexEntry[] = idx.entries;
  if (params.type) candidates = candidates.filter(e => e.type === params.type);
  if (params.subtype) candidates = candidates.filter(e => e.subtype === params.subtype);
  if (params.audience) candidates = candidates.filter(e => e.audience.includes(params.audience!));
  candidates = candidates.filter(e => e.status === status);
  if (params.tags && params.tags.length > 0) {
    candidates = candidates.filter(e => params.tags!.every(t => e.tags.includes(t)));
  }

  if (params.search) {
    const q = params.search.toLowerCase();
    const scored = candidates.map(e => {
      let score = 0;
      if (e.title.toLowerCase().includes(q)) score += 3;
      if (e.summary.toLowerCase().includes(q)) score += 2;
      for (const t of e.tags) if (t.toLowerCase().includes(q)) score += 1;
      const hints = Array.isArray(e.search_hints) ? e.search_hints : [];
      for (const h of hints) if (typeof h === 'string' && h.toLowerCase().includes(q)) score += 1;
      return { entry: e, score };
    }).filter(s => s.score > 0);
    scored.sort((a, b) => b.score - a.score || (b.entry.updated.localeCompare(a.entry.updated)));
    const total = scored.length;
    const results = scored.slice(0, limit).map(s => ({
      ...s.entry, summary: truncate(s.entry.summary, 200)
    }));
    return { total, results };
  }

  candidates.sort((a, b) => b.updated.localeCompare(a.updated));
  const total = candidates.length;
  const results = candidates.slice(0, limit).map(e => ({ ...e, summary: truncate(e.summary, 200) }));
  return { total, results };
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export async function getKbEntry(id: string): Promise<{
  id: string; path: string; frontmatter: Record<string, unknown>; body: string;
  related_resolved: Array<{ type: string; id: string; title: string | null; path: string | null }>;
} | null> {
  const idx = getKbIndex();
  if (!idx) return null;
  const entry = idx.entries.find(e => e.id === id);
  if (!entry) return null;
  const parsed = parseKbFile(entry.path);
  if (!parsed) return null;

  const related = (parsed.frontmatter.related as Array<{ type: string; id: string } | string> | undefined) ?? [];
  const related_resolved = related.map(r => {
    // Accept both {type, id} objects and plain strings per schema-vs-reality drift (see Phase 150 decisions)
    const typeVal = typeof r === 'object' ? r.type : '';
    const idVal = typeof r === 'object' ? r.id : r;
    const match = idx.entries.find(e => e.id === idVal);
    return match
      ? { type: typeVal || match.type, id: idVal, title: match.title, path: match.path }
      : { type: typeVal, id: idVal, title: null, path: null };
  });

  return { id: entry.id, path: entry.path, frontmatter: parsed.frontmatter, body: parsed.body, related_resolved };
}
```

### Pattern 3: Section injection in prompt-assembler
**What:** New builder function `buildKbHeader(): string` that returns raw `_header.md` contents or `''` on failure. Add `sections.push({ id, priority, content })` call in `build()` function **immediately before** `platform_overview` push (line 954).

**When to use:** Injecting filesystem-sourced context into the LLM prompt.

**Example:**
```typescript
// In catbot-prompt-assembler.ts, around line 270 (sibling of buildPlatformOverview)
function buildKbHeader(): string {
  try {
    const kbHeaderPath = path.join(process.cwd(), '..', '.docflow-kb', '_header.md');
    // Alternative: test harness injects KB_ROOT_OVERRIDE; production cwd detection.
    const content = fs.readFileSync(kbHeaderPath, 'utf8');
    return content;  // Inject raw — contents already have markdown structure
  } catch {
    return '';
  }
}

// In build() (line 860+), insert BEFORE the platform_overview push (line 952-955):
  // P1: KB header (Phase 152 — auto-generated header from .docflow-kb/_header.md)
  try {
    sections.push({ id: 'kb_header', priority: 1, content: buildKbHeader() });
  } catch { /* graceful */ }

  // P1: Platform overview from _index.json  (existing, unchanged)
  try {
    sections.push({ id: 'platform_overview', priority: 1, content: buildPlatformOverview() });
  } catch { /* graceful */ }
```

**Note on CWD:** The existing `buildPlatformOverview` uses `loadKnowledgeIndex()` which uses `path.join(process.cwd(), 'data', 'knowledge')` (see `knowledge-tree.ts:54`). In production (`next start` under Docker), `process.cwd()` is `/app`. So `.docflow-kb/` lives at `/app/../.docflow-kb/` i.e. `/.docflow-kb/`. In dev (`cd app && npm run dev`), `process.cwd()` is `~/docflow/app/`, so `.docflow-kb/` is at `~/docflow/.docflow-kb/`. In both cases the pattern `path.join(process.cwd(), '..', '.docflow-kb')` works. **CONFIRMAR con planner**: si Docker WORKDIR cambió a `/`, usar env var `KB_ROOT`.

### Anti-Patterns to Avoid

- **Caching `_header.md` (cache hit trap):** CONTEXT D1 es explícito — fresh read por request. `_header.md` es <2KB, 33 líneas. Cachear rompe el contract de que `kb-sync.cjs --full-rebuild` se ve inmediatamente.
- **Caching `get_kb_entry` results:** El frontmatter es pequeño pero puede cambiar por hooks Phase 153. No cachear respuestas individuales — cachear solo el `_index.json` estructura.
- **Strict Zod con `.strict()`:** Rompería cualquier JSON legacy que tenga keys inesperadas (`__redirect`, `__redirect_destinations`). Default Zod v3 strips unknown keys silently — keep it.
- **Lectura recursiva del KB en cold-start:** 126 files × ~2-5KB c/u = ~500KB en RAM. Legible pero lento en cold (~25-50ms). Solo cargar `_index.json` + construir `byTableId` map bajo demanda, y lazy-load resource frontmatter sólo cuando `resolveKbEntry` lo pide (OR batch al primer acceso, ver §3 tradeoff).
- **Añadir deprecation warnings al `query_knowledge` tool:** CONTEXT D3 lo prohíbe. Coexistencia silente durante Phase 152-154.
- **Inventar un tool `list_email_templates` si no existe:** Existe en línea 2845 de `catbot-tools.ts` — verified. Listado: `id, ref_code, name, description, category, is_active, times_used, created_at, updated_at`.
- **Modificar `canvas-executor.ts`:** CLAUDE.md prohíbe.
- **`process.env.X`:** MEMORY.md manda usar `process['env']['X']` (bracket notation) para bypassear webpack inlining.
- **Commitear sin restart Docker:** MEMORY.md feedback_docker_restart.md — restart tras cambios al assembler/tools para que Docker pick up los cambios.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter parsing | Regex-based parser casero | `js-yaml@4.1.1` (ya transitively installed) | `yaml.load(yamlText)` handles nested objects, arrays, multi-line strings, escapes. Parser casero de `knowledge-sync.ts:398` es adequado para write path pero introduce drift risk si se duplica. |
| In-memory cache invalidation | Custom TTL wheel / manual timers | Module-level `{loadedAt, data}` + check on access | Patrón establecido en `knowledge-tree.ts:48` y `catbot-user-profile.ts`. Node single-thread event loop = zero thread-safety concerns. |
| Full-text search con scoring | BM25 / TF-IDF desde cero | Simple case-insensitive substring + weighted (title=3, summary=2, tag=1) | CONTEXT D2.1 specifies the exact ranking. 126 entries × in-memory scan < 1ms. Qdrant semantic es Phase 154+. |
| Filtering por múltiples campos con AND | SQL-like parser | Series de `.filter()` chained | 126 entries, zero allocations esperadas, V8 optimiza perfect. |
| Prompt section injection | Template string compose | `sections.push({id, priority, content})` + `assembleWithBudget` | Patrón establecido, budget-aware truncation gratis. |

**Key insight:** Todo el patrón de read-path del KB es < 200 líneas de código nuevo. La complejidad real está en testing (fixtures) y en el Zod fix (root cause diagnosis correcta — ver §5).

## Common Pitfalls

### Pitfall 1: `_index.json.entries[]` no expone `source_of_truth` (CONFLICT #1)
**What goes wrong:** CONTEXT D4 asume que `resolveKbEntry(dbTable, dbId)` puede buscar directo en el index: `idx.entries.find(e => e.source_of_truth.some(sot => sot.table === dbTable && sot.id === dbId))`. Pero los entries del index NO tienen `source_of_truth` — solo `{id, path, type, subtype, title, summary, tags, audience, status, updated, search_hints}`.

**Why it happens:** Phase 149/150 diseñó `_index.json.entries[]` como un índice "liviano" para navigation, no como mirror del frontmatter completo. El `source_of_truth` vive solo en el YAML frontmatter de cada `.md` resource file.

**Evidence:**
```
$ python3 -c "import json; d=json.load(open('.docflow-kb/_index.json')); print(list(d['entries'][0].keys()))"
['id', 'path', 'type', 'subtype', 'title', 'summary', 'tags', 'audience', 'status', 'updated', 'search_hints']
```

**How to avoid:** Dos opciones para el planner:
1. **Construir `byTableId` map al cache-load** (recomendado): leer los 67 resource files una vez por ciclo TTL de 60s. 67 × ~2KB = 130KB read + YAML parse. Coste ~15-25ms cold, 0ms warm. Amortizable sobre el TTL.
2. **Lazy per-request**: sólo leer frontmatter del file que `list_*` devuelve como candidato. Cada `list_cat_paws` devuelve ≤20 rows → 20 file reads/parses. Coste ~5-10ms por call. Peor en steady state.

**Recomendación: Opción 1.** Código arriba en `buildSourceOfTruthCache(index)` — leer todos los resource files una vez al poblar la cache.

Alternativa más invasiva (no recomendada, pero registrada): extender `scripts/kb-sync-db-source.cjs` (Phase 150) para que emita `source_of_truth_ids: ["table:id", ...]` directamente en cada `_index.json` entry. Eso reduce cold-start a 0ms pero cambia el schema del index y requiere actualizar Phase 149's `regenerateHeaderFile` + validators. Fuera de scope Phase 152.

**Warning signs:** Tests de `resolveKbEntry()` que mockean solo el index object pero no simulan reads del filesystem → falso verde.

### Pitfall 2: Zod root cause incorrecta (CONFLICT #2)
**What goes wrong:** CONTEXT Addendum A2/A3 asume que el break del Zod schema de `query_knowledge` es por `__redirect` keys top-level o por redirects DENTRO de arrays `concepts`/`howto`/`dont`. Ambas premisas son **parcialmente incorrectas**.

**Investigación real (via inspección directa de los 7 JSONs post-151):**
```
$ python3 inspect-knowledge-json.py
--- catflow.json ---
top-level keys: ['__redirect', '__redirect_destinations', 'id', 'name', ...]
  (no non-strings in concepts/howto/dont)
--- catboard.json ---
  concepts non-strings: [(18, 'dict'), (19, 'dict'), (20, 'dict')]
    [18]={'term': 'MAX_TOOL_ITERATIONS', 'definition': 'Limite maximo ...'}
    [19]={'term': 'ESCALATION_THRESHOLD', ...}
    [20]={'term': 'Reporting intermedio', ...}
(otros JSONs: sólo top-level __redirect + __redirect_destinations arrays)
```

**Truth:**
- `__redirect` y `__redirect_destinations` son **top-level** en los 7 JSONs — Zod v3 sin `.strict()` los **ignora silently** (strips unknown keys). Esto NO causa fallo.
- El fallo real es en **`catboard.json.concepts[18..20]`** — esos 3 elementos son objetos `{term, definition}`, NO strings. Y estos existen **pre-Phase 151**. El schema `concepts: z.array(z.string())` en `knowledge-tree.ts:20` ha estado mal desde siempre; solo saltó cuando CatBot consultó `query_knowledge({area: 'catboard'})` por primera vez durante el oracle de Phase 151.

**Why it happens:** El oracle de Phase 151 ejecutó `query_knowledge({query: 'R10'})` (sin `area` param), lo cual navega a `getAllKnowledgeAreas()` (línea 96 de `knowledge-tree.ts`) — esto carga **todos los JSONs**, incluyendo `catboard.json`, validándolos uno por uno. `KnowledgeEntrySchema.parse(catboard)` falla en `concepts[18]: expected string, received object`.

**How to avoid — fix del Zod (mínimo impacto):**

```typescript
// app/src/lib/knowledge-tree.ts — EXTEND the schema

// New union schema that accepts string, {term, definition}, o {__redirect}:
const ConceptItemSchema = z.union([
  z.string(),
  z.object({ term: z.string(), definition: z.string() }).passthrough(),
  z.object({ __redirect: z.string() }).passthrough(),
]);

export const KnowledgeEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  description: z.string(),
  endpoints: z.array(z.string()),
  tools: z.array(z.string()),
  concepts: z.array(ConceptItemSchema),          // <-- extended
  howto: z.array(ConceptItemSchema),              // <-- same pattern (defensive)
  dont: z.array(ConceptItemSchema),               // <-- same pattern (defensive)
  common_errors: z.array(CommonErrorSchema),
  success_cases: z.array(z.string()),
  sources: z.array(z.string()),
  updated_at: z.string(),
});
```

**Fix del tool `query_knowledge` (emite hint cuando encuentra redirect):**

En `catbot-tools.ts`, caso `query_knowledge` (línea 1656), después del `loadKnowledgeArea(area)`:

```typescript
// Check if area has __redirect at top level (Zod strips it but we want to surface)
// Since Zod already strips __redirect, we need a secondary raw-read to detect.
// Alternative: keep __redirect in schema via passthrough() and check on entry object.
// RECOMMENDATION: modify KnowledgeEntrySchema to use z.object({...}).passthrough() so __redirect survives.

// In formatKnowledgeResult or caller:
if ('__redirect' in entry || '__redirect_destinations' in entry) {
  // Emit redirect hint
  return {
    ...staticResult,
    redirect: {
      hint: 'Este area ha sido migrada al KB estructurado. Usa search_kb / get_kb_entry.',
      target_kb_paths: (entry as any).__redirect_destinations as string[] ?? [],
    },
  };
}

// For concept items that are {__redirect} objects:
const mapConceptItem = (c: string | { term?: string; definition?: string; __redirect?: string }): string => {
  if (typeof c === 'string') return c;
  if ('__redirect' in c && c.__redirect) return `(migrado → ${c.__redirect}; usa get_kb_entry)`;
  if ('term' in c && 'definition' in c) return `**${c.term}**: ${c.definition}`;
  return JSON.stringify(c);
};
```

**Warning signs:** Tests de `query_knowledge` que pasan un fixture solo-string para `concepts` → seguro pero no cubre la realidad. **Tests nuevos DEBEN** usar fixtures con las 3 shapes: plain string, `{term, definition}`, y `{__redirect}`.

### Pitfall 3: `knowledge-tools-sync.test.ts` tripwire
**What goes wrong:** Existe un test meta que valida que cada tool en `TOOLS[]` aparece referenced en al menos un `app/data/knowledge/*.json`. Al añadir `search_kb` y `get_kb_entry` sin actualizar un JSON, este test falla.

**Why it happens:** Test file `app/src/lib/__tests__/knowledge-tools-sync.test.ts:66`:
```typescript
it('every TOOLS[] tool appears in at least one knowledge JSON', () => {
  const knowledgeTools = getAllKnowledgeToolNames();
  const missing = tsToolNames.filter(name => !knowledgeTools.has(name));
  expect(missing).toEqual([]);
});
```

**How to avoid:** Update `app/data/knowledge/catboard.json` (o el JSON semánticamente más adecuado — probably `catboard.json` o un `knowledge.json` area nuevo) adding `search_kb` y `get_kb_entry` al array `tools`. Preservar el conteo actual (no debería tocar `concepts[18..20]` objects).

**CLAUDE.md mandato:** Además de este test, el "Protocolo de Documentación" dice actualizar el knowledge tree para nuevas tools. Task explicito en el plan: escribir search_kb/get_kb_entry en `catboard.json` (o área más apropiada) + registrar en `tools[]` array, con common_errors si hay edge cases.

### Pitfall 4: `get_kb_entry(id)` con id ambiguo cross-type
**What goes wrong:** El `id` en `_index.json` es único dentro del KB, pero dos entries pueden coincidir accidentalmente si Phase 153 introduce colisiones (ej. `canvas-catpaw` concept vs `canvas-catpaw` skill). CONTEXT D2.2 dice buscar por id, sin disambiguation por type.

**Why it happens:** `_index.json.entries[]` garantiza id unicidad por file path convention, NO por schema.

**How to avoid:** `idx.entries.find(e => e.id === id)` devuelve **el primero**. Si alguna vez hay colision, `search_kb({search: id})` devolvería ambos. Documentar la asunción + añadir test que enfroce la invariante (validate-kb.cjs podría checkearlo, pero fuera de scope Phase 152). Para Phase 152: trust current uniqueness, log WARN si `findIndex !== indexOf`.

**Warning signs:** Oracle test que devuelve un entry diferente al esperado — señal de colisión silenciosa.

### Pitfall 5: Test fixture contamination entre runs
**What goes wrong:** Tests paralelos (vitest default) que escriben al mismo KB_ROOT_OVERRIDE → races.

**How to avoid:** Pattern establecido en `knowledge-sync.test.ts` y `kb-sync-db-source.test.ts`:
- Cada `describe` crea su `tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kbtest-'))` en `beforeEach`.
- Teardown con `fs.rmSync(tmpRoot, {recursive: true, force: true})` en `afterEach`.
- `vi.hoisted()` setea env vars ANTES de los imports del módulo bajo test.

**Warning signs:** Flaky tests que pasan en solo pero fallan en suite completa.

## Code Examples

Verified patterns from existing codebase:

### Existing Pattern 1: Prompt Section Injection (from catbot-prompt-assembler.ts:271)
```typescript
// Source: app/src/lib/services/catbot-prompt-assembler.ts:271-279
function buildPlatformOverview(): string {
  try {
    const index = loadKnowledgeIndex();
    const lines = index.areas.map(a => `- **${a.name}**: ${a.description}`);
    return `## Plataforma — Areas de conocimiento\n${lines.join('\n')}`;
  } catch {
    return '';
  }
}
```
**Reuse for:** `buildKbHeader()` following the exact try/catch + empty-string-on-fail convention.

### Existing Pattern 2: Tool Execution with Error Handling (catbot-tools.ts:1656)
```typescript
// Source: app/src/lib/services/catbot-tools.ts:1656-1717
case 'query_knowledge': {
  try {
    const area = args.area as string | undefined;
    const query = args.query as string | undefined;
    // ... business logic ...
    return { name, result: { ...staticResult, learned_entries: learned } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { name, result: { error: message } };
  }
}
```
**Reuse for:** `search_kb` y `get_kb_entry` — shape del return idéntico.

### Existing Pattern 3: Test with tmp dir + vi.hoisted env setup (catbot-tools-retry-job.test.ts:21)
```typescript
// Source: app/src/lib/__tests__/catbot-tools-retry-job.test.ts:21-32
vi.hoisted(() => {
  const nodePath = require('path');
  const nodeFs = require('fs');
  const nodeOs = require('os');
  const tmpDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'catbot-tools-retry-test-'));
  process['env']['CATBOT_DB_PATH'] = nodePath.join(tmpDir, 'catbot-test.db');
});

vi.mock('@/lib/db', () => ({ default: { prepare: vi.fn(() => ({...})) } }));
// ... more mocks ...
```
**Reuse for:** `kb-tools.test.ts` con `process['env']['KB_ROOT_OVERRIDE'] = tmpDir` apuntando a fixture KB.

### Existing Pattern 4: Integration test con schema copy (knowledge-sync.test.ts:34-66)
```typescript
// Source: app/src/lib/__tests__/knowledge-sync.test.ts:34-66
const SCHEMA_SOURCE_DIR = path.resolve(__dirname, '../../../../.docflow-kb/_schema');
const VALIDATOR_SCRIPT = path.resolve(__dirname, '../../../../scripts/validate-kb.cjs');

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kbtest-'));
  const dirs = [
    '_schema', 'domain/concepts', 'resources/catpaws',
    'resources/connectors', 'resources/skills', ...
  ];
  for (const d of dirs) fs.mkdirSync(path.join(tmpRoot, d), { recursive: true });
  // Copy schemas from real .docflow-kb/_schema/ into fixture tmpRoot
  fs.copyFileSync(
    path.join(SCHEMA_SOURCE_DIR, 'frontmatter.schema.json'),
    path.join(tmpRoot, '_schema', 'frontmatter.schema.json')
  );
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
```
**Reuse for:** `createFixtureKb(tmpDir)` helper — propose concrete signature below.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `loadKnowledgeIndex()` stateful singleton cache (no invalidation) | Module-level cache con TTL 60s | Phase 149 introduced stale-read concern | `kb-sync.cjs --full-rebuild` se ve en max 60s sin restart |
| Parser YAML casero en `knowledge-sync.ts:398` | `js-yaml.load()` | Phase 152 (read path) | `knowledge-sync.ts` (write path) sigue con parser propio (byte-for-byte round-trip tests lo requieren). Read path es tolerante — js-yaml es strictly better. |
| `query_knowledge` Zod `concepts: z.array(z.string())` | `concepts: z.array(z.union([z.string(), {term,definition}, {__redirect}]))` | Phase 152 (fix KB-18) | Legacy JSONs con concepts objects ya no rompen validation |
| Hardcoded tool descriptions que mencionan "knowledge tree" | Tool descriptions que diferencian KB (canonical) vs legacy (fallback) | Phase 152 (assembler rewrite) | LLM aprende el nuevo orden de discovery sin confusión |

**Deprecated/outdated:**
- `loadKnowledgeIndex()` → **sigue activo hasta Phase 155** por CONTEXT D3. No deprecar.
- `query_knowledge` tool → **sigue activo hasta Phase 155** por CONTEXT D3. Solo extender Zod.
- `_header.md` regenerateHeaderFile() en `kb-sync.cjs` → conoce solo 9 Phase-150 counts. Phase 151-04 patched manually. Phase 152 **no arregla** el CLI (fuera de scope, technical debt documentado).

## Open Questions

1. **CWD resolution en Docker production**
   - What we know: En dev CLI `cd app && npm test`, `process.cwd()` es `app/`. En Docker `WORKDIR /app`, cwd es `/app`. Host `.docflow-kb/` montado en repo root → `/` dentro del container? Requiere verificación del `docker-compose.yml`.
   - What's unclear: Si el volumen Docker monta `/home/deskmath/docflow/.docflow-kb` como `/app/../.docflow-kb` o como `/.docflow-kb` o como `/docflow-kb`.
   - Recommendation: El planner incluye una **Wave 0 task** que lee `docker-compose.yml` + `app/docker-entrypoint.sh` para confirmar el path exacto del KB en runtime. Default conservador: usar env var `KB_ROOT` (sin fallback) + explicit setup en entrypoint.

2. **¿Pre-computar `byTableId` al cold-start o lazy?**
   - What we know: 67 resource files × ~2-5KB cada uno = ~200-300KB. js-yaml parse de cada uno es ~0.2-0.5ms → total ~15-30ms cold start.
   - What's unclear: ¿Vale la pena pagar el cold-start para ahorrar 67 parses repartidos (amortizados en el TTL 60s)?
   - Recommendation: **Pre-compute** — mejor latencia predictable para el usuario. El cold start es 1 vez cada 60s (asumiendo tráfico constante).

3. **¿Extender el schema de `_index.json` para incluir `source_of_truth_ids` por entry?**
   - What we know: Reduciría el CONFLICT #1 work a 0 file reads. Requiere cambio a Phase 150's `scripts/kb-sync-db-source.cjs` regenerator.
   - What's unclear: Si mudar el schema es safe sin romper Phase 149/150 tests (65 tests).
   - Recommendation: **Fuera de scope Phase 152**. Documentar como deferred improvement. Phase 152 paga el coste de 67 reads por ciclo de 60s sin drama.

4. **¿Qué tool usa el planner para `list_canvases` si `canvas_list` ya existe pero su result shape varía (fetch a `/api/canvas`)?**
   - What we know: `canvas_list` (línea 2138) hace fetch a `/api/canvas` y devuelve el JSON response. No llama DB directamente.
   - What's unclear: El API `/api/canvas` ya devuelve el shape correcto (`{id, name, ...}`) o habría que inyectar `kb_entry` en el handler del API route.
   - Recommendation: **Inyectar `kb_entry` en el case de `executeTool`**, NO en el API route. Patch local al tool result tras el fetch. Evita cambio de API surface.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | `app/vitest.config.ts` (globs `src/**/*.test.ts`) |
| Quick run command | `cd app && npm run test:unit -- kb-` |
| Full suite command | `cd app && npm run test:unit` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KB-15 | `buildKbHeader()` reads `_header.md` fresh and returns content | unit | `cd app && npm run test:unit -- catbot-prompt-assembler` | ❌ Wave 0 — extend existing `catbot-prompt-assembler.test.ts` |
| KB-15 | Assembler includes `kb_header` section before `platform_overview` | unit | same | ❌ Wave 0 |
| KB-15 | Graceful: missing `_header.md` → no section inserted, no crash | unit | same | ❌ Wave 0 |
| KB-15 | `buildKnowledgeProtocol()` mentions search_kb, get_kb_entry in order | unit | same | ❌ Wave 0 |
| KB-16 | `search_kb({type:'resource'})` returns 67 resources | unit | `cd app && npm run test:unit -- kb-tools` | ❌ Wave 0 — new file `kb-tools.test.ts` |
| KB-16 | `search_kb({subtype:'catpaw'})` returns exactly the catpaws | unit | same | ❌ Wave 0 |
| KB-16 | `search_kb({tags:['catpaw','business']})` AND-matches | unit | same | ❌ Wave 0 |
| KB-16 | `search_kb({search:'holded'})` ranks by title > summary > tag | unit | same | ❌ Wave 0 |
| KB-16 | `search_kb({limit:5})` returns 5 + `total` ≥ 5 | unit | same | ❌ Wave 0 |
| KB-16 | `search_kb()` default filters to `status:active` | unit | same | ❌ Wave 0 |
| KB-16 | `search_kb({status:'deprecated'})` returns deprecated entries | unit | same | ❌ Wave 0 |
| KB-16 | `get_kb_entry('existing-id')` returns frontmatter + body + related_resolved | unit | same | ❌ Wave 0 |
| KB-16 | `get_kb_entry('missing-id')` returns `{error:'NOT_FOUND',id}` | unit | same | ❌ Wave 0 |
| KB-16 | `get_kb_entry` resolves related strings AND {type,id} objects | unit | same | ❌ Wave 0 |
| KB-16 | Tools registered in TOOLS array | contract | `cd app && npm run test:unit -- kb-tools` | ❌ Wave 0 |
| KB-16 | Tools always-allowed via `getToolsForLLM([])` | contract | same | ❌ Wave 0 |
| KB-17 | `list_cat_paws` result items include `kb_entry: string \| null` | integration | `cd app && npm run test:unit -- kb-tools-integration` | ❌ Wave 0 — new file `kb-tools-integration.test.ts` |
| KB-17 | `list_connectors`, `list_catbrains`, `list_skills`, `list_email_templates`, `canvas_list` same | integration | same | ❌ Wave 0 |
| KB-17 | Row with no KB file → `kb_entry: null` (not error) | integration | same | ❌ Wave 0 |
| KB-17 | Cache hit within 60s → only 1 `_index.json` read + 1 batch of resource reads | unit | `cd app && npm run test:unit -- kb-index-cache` | ❌ Wave 0 — new file `kb-index-cache.test.ts` |
| KB-17 | `invalidateKbIndex()` forces next call to re-read | unit | same | ❌ Wave 0 |
| KB-17 | `resolveKbEntry('cat_paws', existing_uuid)` returns correct path | unit | same | ❌ Wave 0 |
| KB-17 | `resolveKbEntry('cat_paws', bogus_uuid)` returns null | unit | same | ❌ Wave 0 |
| KB-18 | `KnowledgeEntrySchema.parse(catboard.json)` succeeds post-fix | unit | `cd app && npm run test:unit -- knowledge-tree` | ❌ Wave 0 — extend `knowledge-tree.test.ts` |
| KB-18 | `query_knowledge({area:'catboard'})` no longer throws Zod error | unit | `cd app && npm run test:unit -- catbot-tools` | ❌ Wave 0 |
| KB-18 | `query_knowledge` emits redirect hint when top-level `__redirect` present | unit | same | ❌ Wave 0 |
| KB-18 | `query_knowledge` handles concept item = `{term,definition}` object | unit | same | ❌ Wave 0 |
| KB-18 | `query_knowledge` handles concept item = `{__redirect}` object | unit | same | ❌ Wave 0 |
| Contract | `search_kb` result entries pass `frontmatter.schema.json` validation (sanity) | contract | spawn validate-kb.cjs | ❌ Wave 0 |
| Performance | `search_kb` over 126 entries < 50ms | perf | inline timing assertion | ❌ Wave 0 |
| Performance | `get_kb_entry` < 10ms (warm cache) | perf | inline timing assertion | ❌ Wave 0 |
| Performance | Cache hit < 1ms | perf | inline timing assertion | ❌ Wave 0 |
| Regression | `knowledge-sync.test.ts` 38/38 still green | regression | `cd app && npm run test:unit -- knowledge-sync` | ✅ exists |
| Regression | `kb-sync-cli.test.ts` 13/13 still green | regression | `cd app && npm run test:unit -- kb-sync-cli` | ✅ exists |
| Regression | `kb-sync-db-source.test.ts` 18/18 still green | regression | `cd app && npm run test:unit -- kb-sync-db-source` | ✅ exists |
| Regression | `knowledge-tools-sync.test.ts` still green (after adding search_kb/get_kb_entry to a knowledge JSON) | regression | `cd app && npm run test:unit -- knowledge-tools-sync` | ✅ exists |
| Oracle | CatBot answers "¿Qué sabes del KB de DocFlow?" factually using kb_header | oracle | POST `/api/catbot/chat` (manual) | N/A — human+orchestrator |
| Oracle | CatBot answers "¿Qué CatPaws existen?" using list_cat_paws + shows kb_entry | oracle | POST `/api/catbot/chat` (manual) | N/A |
| Oracle | CatBot resuelve "Dame detalle del Operador Holded" via search_kb → get_kb_entry | oracle | POST `/api/catbot/chat` (manual) | N/A |

### Sampling Rate
- **Per task commit:** `cd app && npm run test:unit -- kb-` (solo tests KB, ~5s)
- **Per wave merge:** `cd app && npm run test:unit` (full suite ~30-60s)
- **Phase gate:** Full suite green + Docker rebuild + oracle POST `/api/catbot/chat` con 3 prompts de verificación (ver §8 de priorities)

### Wave 0 Gaps

- [ ] `app/src/lib/services/kb-index-cache.ts` — new module with `getKbIndex`, `invalidateKbIndex`, `resolveKbEntry`, `searchKb`, `getKbEntry`, `parseKbFile`
- [ ] `app/src/lib/__tests__/kb-index-cache.test.ts` — unit tests for cache, resolver, YAML parsing
- [ ] `app/src/lib/__tests__/kb-tools.test.ts` — unit tests for `search_kb` + `get_kb_entry`
- [ ] `app/src/lib/__tests__/kb-tools-integration.test.ts` — integration with 6 list_* tools + fixture KB
- [ ] Test helper `createFixtureKb(tmpDir)` — shared by all new tests (propose: inline in `kb-tools-integration.test.ts` or in a helper file `app/src/lib/__tests__/kb-test-utils.ts`)
- [ ] Extension of `app/src/lib/__tests__/catbot-prompt-assembler.test.ts` — add kb_header + protocol tests
- [ ] Extension of `app/src/lib/__tests__/knowledge-tree.test.ts` — add Zod union schema tests
- [ ] Extension of `app/src/lib/__tests__/knowledge-tools-sync.test.ts` → **NO** — this test is consumer; fix is "add search_kb + get_kb_entry to `catboard.json.tools`"
- [ ] Framework install: NONE — js-yaml ya presente

### Proposed `createFixtureKb(tmpDir)` helper

```typescript
// app/src/lib/__tests__/kb-test-utils.ts (NEW, shared)
import fs from 'node:fs';
import path from 'node:path';

export function createFixtureKb(tmpDir: string): { kbRoot: string } {
  const kbRoot = path.join(tmpDir, '.docflow-kb');
  fs.mkdirSync(path.join(kbRoot, 'resources/catpaws'), { recursive: true });
  fs.mkdirSync(path.join(kbRoot, 'resources/connectors'), { recursive: true });
  fs.mkdirSync(path.join(kbRoot, 'resources/skills'), { recursive: true });
  fs.mkdirSync(path.join(kbRoot, 'resources/catbrains'), { recursive: true });
  fs.mkdirSync(path.join(kbRoot, 'resources/email-templates'), { recursive: true });
  fs.mkdirSync(path.join(kbRoot, 'resources/canvases'), { recursive: true });
  fs.mkdirSync(path.join(kbRoot, 'rules'), { recursive: true });

  // _header.md
  fs.writeFileSync(path.join(kbRoot, '_header.md'),
    `# KB Header (test fixture)\n**Entradas totales:** 7\n\n## Resource counts\n- CatPaws activos: 1\n`);

  // _index.json — 7 entries mirror shape v2
  const index = {
    schema_version: '2.0',
    generated_at: new Date().toISOString(),
    entry_count: 7,
    entries: [
      { id: 'aaa11111-test-catpaw', path: 'resources/catpaws/aaa11111-test-catpaw.md', type: 'resource', subtype: 'catpaw', title: 'Test CatPaw', summary: 'Holded agent for tests', tags: ['catpaw', 'business'], audience: ['catbot', 'architect'], status: 'active', updated: '2026-04-20T00:00:00Z', search_hints: null },
      { id: 'bbb22222-test-connector', path: 'resources/connectors/bbb22222-test-connector.md', type: 'resource', subtype: 'connector', title: 'Gmail Test', summary: 'Test gmail connector', tags: ['connector', 'gmail'], audience: ['catbot'], status: 'active', updated: '2026-04-19T00:00:00Z', search_hints: null },
      { id: 'test-skill-writer', path: 'resources/skills/test-skill-writer.md', type: 'resource', subtype: 'skill', title: 'Test Writer Skill', summary: 'Writer skill', tags: ['skill'], audience: ['catbot'], status: 'active', updated: '2026-04-18T00:00:00Z', search_hints: null },
      { id: 'ccc33333-test-catbrain', path: 'resources/catbrains/ccc33333-test-catbrain.md', type: 'resource', subtype: 'catbrain', title: 'Test CatBrain', summary: 'RAG test', tags: ['catbrain'], audience: ['catbot'], status: 'active', updated: '2026-04-17T00:00:00Z', search_hints: null },
      { id: 'tpl-test-welcome', path: 'resources/email-templates/tpl-test-welcome.md', type: 'resource', subtype: 'email-template', title: 'Welcome Template', summary: 'Welcome email', tags: ['template', 'email'], audience: ['catbot'], status: 'active', updated: '2026-04-16T00:00:00Z', search_hints: null },
      { id: 'ddd44444-test-canvas', path: 'resources/canvases/ddd44444-test-canvas.md', type: 'resource', subtype: 'canvas', title: 'Test Canvas', summary: 'Inbound canvas', tags: ['canvas'], audience: ['catbot'], status: 'active', updated: '2026-04-15T00:00:00Z', search_hints: null },
      { id: 'R10-preserve-fields', path: 'rules/R10-preserve-fields.md', type: 'rule', subtype: null, title: 'R10 Preserve Fields', summary: 'Always preserve JSON input fields', tags: ['rule', 'safety'], audience: ['catbot', 'architect'], status: 'active', updated: '2026-04-14T00:00:00Z', search_hints: null },
    ],
    indexes: { by_type: {}, by_tag: {}, by_audience: {} },
  };
  fs.writeFileSync(path.join(kbRoot, '_index.json'), JSON.stringify(index, null, 2));

  // Write each file with frontmatter so parseKbFile + resolveKbEntry work
  writeResource(kbRoot, 'resources/catpaws/aaa11111-test-catpaw.md', 'aaa11111-test-catpaw', 'catpaw', 'cat_paws', 'aaa11111-abcd-...',
    ['catpaw', 'business'], ['catbot', 'architect'], 'active', 'Test CatPaw', 'Holded agent for tests');
  writeResource(kbRoot, 'resources/connectors/bbb22222-test-connector.md', 'bbb22222-test-connector', 'connector', 'connectors', 'bbb22222-conn-uuid',
    ['connector', 'gmail'], ['catbot'], 'active', 'Gmail Test', 'Test gmail connector');
  writeResource(kbRoot, 'resources/skills/test-skill-writer.md', 'test-skill-writer', 'skill', 'skills', 'writer-skill',
    ['skill'], ['catbot'], 'active', 'Test Writer Skill', 'Writer skill');
  // ... more ...
  return { kbRoot };
}

function writeResource(kbRoot: string, relPath: string, id: string, subtype: string, dbTable: string, dbId: string,
                       tags: string[], audience: string[], status: string, title: string, summary: string): void {
  const frontmatter = `---
id: ${id}
type: resource
subtype: ${subtype}
lang: es
title: ${title}
summary: "${summary}"
tags: [${tags.join(', ')}]
audience: [${audience.join(', ')}]
status: ${status}
created_at: 2026-04-01T00:00:00Z
created_by: test
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: test
source_of_truth:
  - db: sqlite
    table: ${dbTable}
    id: ${dbId}
    fields_from_db: [name]
change_log:
  - { version: 1.0.0, date: 2026-04-01, author: test, change: fixture }
ttl: never
---

## Descripción

${summary}
`;
  fs.writeFileSync(path.join(kbRoot, relPath), frontmatter);
}
```

## Oracle Test Concrete Design

**Pre-152 oracle (from Phase 151):** "Lee el contenido de la regla R10 del knowledge base y resúmelo en 3 bullets. Si no tienes acceso al KB aún, responde 'NO TENGO ACCESO' para que lo documente como gap."
**Expected response PRE-152:** "NO TENGO ACCESO" (Phase 151 outcome ideal — confirmed).

**Post-152 oracle (executed by orchestrator per Phase 151-04 precedent):**

1. **Prompt 1 (KB awareness):** "¿Qué sabes del KB de DocFlow? ¿Cuántas entradas tiene?"
   - **Expected:** CatBot responds with counts from `_header.md` injection (126 entries, 25 rules, 10 incidents, 3 protocols, etc.). NO tool calls needed — the data is in the system prompt.

2. **Prompt 2 (list with kb_entry):** "Lista los CatPaws que tenemos"
   - **Expected:** CatBot calls `list_cat_paws`. Response shows 9-10 catpaws each with `kb_entry: "resources/catpaws/..."`. Response narrative mentions KB enrichment.

3. **Prompt 3 (search_kb usage):** "Busca en el KB las reglas de seguridad que conoces"
   - **Expected:** CatBot calls `search_kb({type:'rule', tags:['safety']})`. Returns subset of 25 rules tagged `safety`. Response summarizes by title+summary.

4. **Prompt 4 (get_kb_entry usage):** "Muéstrame la regla R10 completa"
   - **Expected:** CatBot calls `get_kb_entry('R10-preserve-fields')`. Returns frontmatter + body. CatBot summarizes body as 3 bullets.

5. **Prompt 5 (query_knowledge still works):** "¿Qué es un CatFlow?"
   - **Expected:** CatBot tries `search_kb({type:'concept', subtype:'catflow'})` first (follows new protocol), then falls back to `query_knowledge({area:'catflow'})` which now SUCCEEDS (no Zod break). If `catflow.json` has `__redirect`, response includes hint "Use get_kb_entry to resolve".

**Oracle execution path (from Phase 151-04 precedent):**
- Orchestrator authenticates via session token or sudo bypass.
- POST `/api/catbot/chat` with each prompt.
- Capture verbatim response + tool_calls[] trace.
- Paste into `152-VERIFICATION.md` §Oracle section.
- If any prompt fails (tool crash, wrong answer, no tool call): auto-log `knowledge_gap` and treat as gap-to-fix.

**Previous oracle gap-id** `4abe76e9-4536-4167-acfc-74bb8e11ff3c` (from Phase 151) should be **resolved** by Phase 152 — note in VERIFICATION.md that the gap is now addressable.

## LLM Integration Notes

**How CatBot discovers new tools:**
1. `app/src/app/api/catbot/chat/route.ts:163` calls `getToolsForLLM(catbotConfig.allowed_actions)`.
2. That function returns decorated tool array (ASYNC suffix, filter by permission).
3. Array is passed to LLM provider (LiteLLM via `litellm/v1/chat/completions`) as `tools: [...]` parameter.
4. LLM sees tool name + description + JSON schema of params.
5. LLM function-calls; `executeTool(name, args, baseUrl, context)` dispatches the switch.

**Tool description is the critical LLM prompt.** CONTEXT enfatiza que la description de `search_kb` debe decir "Usa esto PRIMERO para cualquier pregunta sobre DoCatFlow" para que el LLM priorice sobre `query_knowledge` (que dice exactamente lo mismo). **Conflict en los prompts que el LLM ve.** Resolución: actualizar la description de `query_knowledge` para decir "Legacy. Úsala solo si search_kb devuelve 0 resultados." Planner debe incluir esto en el plan — es 1 línea pero cambia el routing del LLM.

**LLM providers en uso (from `alias-routing.ts`):**
- `gemini-main` (Google Gemini via LiteLLM) — supports OpenAI function calling
- `opus` (Claude Opus) — supports function calling
- `sonnet` (Claude Sonnet) — supports function calling
- `gemma-main` (libre tier via Ollama) — **may NOT support** function calling consistently

All LLMs receive tool schemas via the same OpenAI-compatible `tools` array. CatBot behavior is model-agnostic at the tool layer. No model-specific handling needed for `search_kb` / `get_kb_entry`.

## CLAUDE.md Protocol Compliance

Per project instructions, **every new feature MUST**:

1. **Knowledge Tree update** (`app/data/knowledge/*.json`):
   - Add `search_kb`, `get_kb_entry` to `tools[]` array of relevant area (`catboard.json` recomendado — es el hub).
   - Add concept "Knowledge Base estructurado (`.docflow-kb/`)" to `concepts[]` if not present.
   - Add howto "Para consultar recursos del KB, usa search_kb → get_kb_entry" to `howto[]`.
   - Add common_errors if any — e.g. "search_kb devuelve 0 → verifica filters, no prematuramente log_knowledge_gap".
   - Update `updated_at`.
   - **This is mandatory** to avoid breaking `knowledge-tools-sync.test.ts`.

2. **CatBot Tools**:
   - `search_kb` + `get_kb_entry` are `list_*`/`get_*` analogs → always-allowed (read-only). Add to allowlist in `getToolsForLLM` line 1353.
   - NO sudo-required (cross-user irrelevant, KB is global).
   - NO permission gate (no write side effects).

3. **PromptAssembler**: ✅ cubierto por D1 + buildKnowledgeProtocol rewrite.

4. **Docker**: Knowledge JSON updates auto-sync via `docker-entrypoint.sh`. `.docflow-kb/` is mounted from host — no copy needed.

## Sources

### Primary (HIGH confidence)
- `/home/deskmath/docflow/.planning/phases/152-kb-catbot-consume/152-CONTEXT.md` — locked decisions D1-D7, Addendum A1-A5
- `/home/deskmath/docflow/app/src/lib/services/catbot-prompt-assembler.ts` (1038 lines) — especially L271-279 (buildPlatformOverview), L612-626 (buildKnowledgeProtocol), L860-1037 (build function + section list with priorities)
- `/home/deskmath/docflow/app/src/lib/services/catbot-tools.ts` (3865 lines) — especially L76-150 (TOOLS array start), L222-246 (query_knowledge + search_documentation defs), L1328-1397 (getToolsForLLM permission gate), L1486-1508 (executeTool signature), L1552-1566 (list_cat_paws case), L1985-1997 (list_skills case), L2138-2151 (canvas_list case), L2845-2853 (list_email_templates case)
- `/home/deskmath/docflow/app/src/lib/knowledge-tree.ts` (99 lines) — Zod schemas L13-39 (KnowledgeEntrySchema with `concepts: z.array(z.string())` — the bug location)
- `/home/deskmath/docflow/.docflow-kb/_index.json` — 126 entries, shape v2 confirmed; `indexes.by_type/by_tag/by_audience` populated post-151 (contradicts CONTEXT note that said they were empty); entries do NOT expose source_of_truth
- `/home/deskmath/docflow/.docflow-kb/_header.md` — 47 lines, 126 entries, Phase-151 patched
- `/home/deskmath/docflow/.docflow-kb/_schema/frontmatter.schema.json` — schema of each resource .md, confirms `source_of_truth: [{db, id, fields_from_db}]`
- `/home/deskmath/docflow/.docflow-kb/resources/catpaws/72ef0fe5-redactor-informe-inbound.md` — sample resource; confirms `source_of_truth[0].id` = full UUID (e.g. `72ef0fe5-9132-4a08-bc4d-37e8bbb2e6bc`) while filename short-id is first 8 chars + slug
- `/home/deskmath/docflow/.docflow-kb/resources/skills/academic-investigador-academico.md` — sample skill; confirms some skill IDs are NOT UUID prefixes (e.g. `academic-researcher` as DB id, `academic-investigador-academico` as KB id)
- `/home/deskmath/docflow/.planning/phases/151-kb-migrate-static-knowledge/151-VERIFICATION.md` — oracle result "NO TENGO ACCESO" + gap-id `4abe76e9-4536-4167-acfc-74bb8e11ff3c`
- `/home/deskmath/docflow/app/src/lib/__tests__/catbot-tools-retry-job.test.ts` — test pattern template with vi.hoisted + mocks
- `/home/deskmath/docflow/app/src/lib/__tests__/knowledge-sync.test.ts` L34-66 — fixture KB setup pattern
- `/home/deskmath/docflow/app/src/lib/__tests__/knowledge-tools-sync.test.ts` L66-74 — tripwire test that enforces TOOLS ↔ knowledge JSON sync
- `/home/deskmath/docflow/app/package.json` — vitest 4.1.0; zod, js-yaml transitive

### Secondary (MEDIUM confidence)
- Direct filesystem inspection via python3 confirmed non-string items in `catboard.json.concepts[18..20]` — Zod v3 behavior regarding unknown top-level keys inferred from framework knowledge (Zod v3 default behavior: `.parse()` strips unknown keys, `.strict()` rejects them)
- `/home/deskmath/docflow/.planning/ANALYSIS-knowledge-base-architecture.md` — PRD context §7 Fase 4 read lines 1-200

### Tertiary (LOW confidence)
- Docker CWD in production — inferred from MEMORY.md but not verified against actual docker-compose.yml (flagged in Open Question #1)
- Performance estimates (~15-25ms cold start for frontmatter cache build) — educated guess based on 67 files × ~2KB each + js-yaml typical parse speed; not benchmarked

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified present + in use
- Architecture: HIGH — patterns directly copied from existing code with line refs
- Cache design: HIGH — matches `knowledge-tree.ts:48` pattern exactly
- CONFLICT #1 (source_of_truth not in index): HIGH — verified via `python3 -c "import json; ..."` direct read of _index.json
- CONFLICT #2 (Zod root cause): HIGH — verified via direct inspection of all 7 JSON files; Zod behavior confirmed from framework knowledge
- Oracle test design: MEDIUM — depends on orchestrator auth path and model availability at oracle time
- Docker CWD resolution: MEDIUM — inferred from project structure, flagged for Wave 0 verification
- Performance estimates: LOW — not benchmarked, added as guide not contract

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days — Phase 152 code + CONTEXT stable; re-verify only if Phase 151 VERIFICATION changes or `.docflow-kb/` schema is bumped)
