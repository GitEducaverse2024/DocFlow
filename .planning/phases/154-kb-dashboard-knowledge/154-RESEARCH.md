# Phase 154: KB Dashboard `/knowledge` - Research

**Researched:** 2026-04-20
**Domain:** Next.js 14 App Router read-only dashboard; react-markdown 10, recharts 3.8, shadcn UI (partial), next-intl 3.26; consumption of `kb-index-cache.ts` (Phase 152)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D1 — Routing structure**
```
app/src/app/knowledge/
├── page.tsx              ← Lista + filtros client + timeline
├── [id]/
│   └── page.tsx          ← Detalle de un entry
└── api/[id]/route.ts     ← GET /api/knowledge/[id]
```
(NOTA: la API route real se ubica en `app/src/app/api/knowledge/[id]/route.ts` siguiendo el patrón del repo — NO bajo `app/src/app/knowledge/api/`; ver conflicto D1 abajo).

**D2 — Server component para data fetching**
- `knowledge/page.tsx` y `knowledge/[id]/page.tsx` son **server components**
- Consumen `getKbIndex()` y `getKbEntry(id)` directamente desde `@/lib/services/kb-index-cache`
- Pasan datos a client components `<KnowledgeTable>`, `<KnowledgeDetail>`, `<KnowledgeTimeline>` para interactividad
- **Razón:** menos JS, cache TTL 60s del módulo, cero fetch round-trip

**D3 — Filtros client-side** (la tabla completa de ~128 entries entra en una request)
- `type` (select): enum real del KB — `audit | concept | taxonomy | guide | incident | protocol | resource | rule | runtime` (9 tipos, ver conflicto §Conflict 3)
- `subtype` (select dependiente de type, e.g. `resource → catpaw/connector/skill/catbrain/email-template/canvas`)
- `status` (select): default `active`; también `deprecated | draft | experimental | archived`
- `audience` (select): `catbot | architect | developer | user | onboarding`
- `tags` (multi-chip input, AND-match contra `entry.tags[]`)
- `search` (text, case-insensitive sobre title + summary)
- Reset button clear all

**D4 — Layout tabla**
Columnas: Title (link) · Type (badge color) · Subtype (badge gris) · Status · Tags (≤3 + "+N more") · Updated (fecha relativa). Row click → `/knowledge/[id]`. Sticky header. Dark mode.

**D5 — Vista detalle layout**
Back link → Title + metadata badges → Summary → `## Contenido` (react-markdown body) → `## Relaciones` (tabla type/id/title/link) → `## Metadata` (version/created/updated/change_log collapsed). Banner amarillo si `status=deprecated` con `deprecated_reason` + `superseded_by`.

**D6 — Timeline** `<KnowledgeTimeline>` recharts `LineChart` sobre `_index.json.header.last_changes[]`. X: fecha (últimos 30 días). Y: cantidad de cambios. Placeholder si vacío.

**D7 — API route GET `/api/knowledge/[id]`**
- Ubicación real: `app/src/app/api/knowledge/[id]/route.ts`
- 200: `{ id, path, frontmatter, body, related_resolved }` (shape `GetKbEntryResult` de kb-index-cache)
- 404: `{ error: 'NOT_FOUND', id }`
- Delegates a `getKbEntry(id)`. Sin auth.

**D8 — Counts bar** 8 shadcn `Card`s desde `_index.json.header.counts` — claves reales: `catpaws_active, connectors_active, catbrains_active, templates_active, skills_active, rules, incidents_resolved, features_documented`.

**D9 — Ubicación código nuevo**
- `app/src/app/knowledge/page.tsx` (server)
- `app/src/app/knowledge/[id]/page.tsx` (server)
- `app/src/app/api/knowledge/[id]/route.ts`
- `app/src/components/knowledge/KnowledgeTable.tsx` (client)
- `app/src/components/knowledge/KnowledgeDetail.tsx` (client)
- `app/src/components/knowledge/KnowledgeTimeline.tsx` (client)
- `app/src/components/knowledge/KnowledgeCountsBar.tsx` (puede ser server o client)
- `app/src/components/knowledge/KnowledgeFilters.tsx` (client, opcional — puede embed en Table)

**D10 — Navegación** añadir link `/knowledge` al menú principal. Archivo identificado: `app/src/components/layout/sidebar.tsx` (ver §Integration Points).

**D11 — Tests obligatorios (Nyquist — config `workflow.nyquist_validation: true`)**
Unit: filter logic (KnowledgeTable), markdown render (KnowledgeDetail deprecated banner), timeline data transform, counts render.
Integration: `GET /api/knowledge/[id]` 200/404. `/knowledge` server-render con fixture KB.
E2E: playwright spec para navegación `/knowledge` → filter → detail.
Oracle CatBot manual pre-cierre.

**D12 — Requirement IDs (Plan 01 Task 1)** — KB-23..KB-27 tal y como describe CONTEXT.md §D12 y el prompt del orchestrator.

### Claude's Discretion
- Color exacto de badges por type/status (respetar paleta del theme — violet es accent global).
- Helper `formatRelativeTime` casero (no hay date-fns; el repo usa `new Date().toLocaleDateString()`).
- Orden de columnas en la tabla.
- Placeholder exacto cuando no hay entries tras filtros.
- Responsive mobile — deseable pero no crítico.
- Ruta anidada para detalle vs modal — **confirmed ruta anidada** (D1).

### Deferred Ideas (OUT OF SCOPE)
- Write UI / edición de frontmatter
- Version diff / history compare
- Bulk operations
- Export (download .md / zip)
- Semantic search con Qdrant
- Traducción inline es↔en
- Mobile responsive avanzado
- Virtualización de tabla (>1000 entries)
- Feed RSS/JSON de cambios
- Compartir entry publicly
- Integración con knowledge-tools-sync tripwire (no aplica — no hay tools nuevas)
- Legacy cleanup (Phase 155)

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| KB-23 | `/knowledge` page lista entries del KB con filtros client-side (type, subtype, tags, audience, status, search) | Standard Stack: server component + `getKbIndex()` (HIGH). Patterns: client component filter state hook (paralelo a `catbrains/page.tsx:23-42`). `_index.json.entries[]` shape verificado: `id, path, type, subtype, title, summary, tags[], audience[], status, updated, search_hints[]` (11 keys). |
| KB-24 | `/knowledge/[id]` detail page renderiza markdown body con react-markdown + frontmatter metadata + related_resolved con links + deprecated banner si aplica | react-markdown 10.1.0 + remark-gfm 4.0.1 (instalados). Pattern canónico del repo: `<div className="prose prose-invert prose-sm max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>...</ReactMarkdown></div>` (7 usos). `@tailwindcss/typography` plugin confirmado en `tailwind.config.ts:77`. Schema frontmatter verificado — campos deprecated: `deprecated_at`, `deprecated_by`, `deprecated_reason`, `superseded_by`. `GetKbEntryResult` shape de `kb-index-cache.ts:105-116` contiene `related_resolved[]` ya resuelto por el servicio. |
| KB-25 | `GET /api/knowledge/[id]` route handler que delega a `kb-index-cache.getKbEntry(id)`; 200 con shape `{id, path, frontmatter, body, related_resolved}` \| 404 `{error:'NOT_FOUND', id}` | Pattern canónico: `app/src/app/api/catbrains/[id]/route.ts:1-27`. `export const dynamic = 'force-dynamic'`, `NextResponse.json`, signature `GET(request: Request, { params }: { params: Promise<{id: string}> })`. |
| KB-26 | Timeline recharts LineChart sobre `_index.json.header.last_changes[]` + counts bar (8 shadcn Cards desde `header.counts`) | recharts 3.8.0 instalado. Pattern existente: `app/src/app/page.tsx:239-270` usa `ResponsiveContainer + BarChart + XAxis + YAxis + CartesianGrid + Tooltip`, paleta dark (`#27272a`, `#18181b`, `#71717a`). Cambiar `BarChart → LineChart`. **CRITICAL:** `last_changes[]` shape real es `{id, updated}[]` (NO `{version, date, author, reason}` como sugiere el prompt adicional — ver §Conflict 2). |
| KB-27 | Link a `/knowledge` añadido al navigation principal existente | Target: `app/src/components/layout/sidebar.tsx:51-57` (`navItems` array). Requiere también añadir keys i18n: `nav.knowledge` en `app/messages/es.json` + `en.json`, y `layout.breadcrumb.knowledge` (breadcrumb auto-generado). Icon candidate de lucide-react: `BookOpen` o `Library`. |

</phase_requirements>

## Summary

Phase 154 es un dashboard read-only sobre infraestructura ya sólida (Phase 152 `kb-index-cache.ts` 408 lines con TTL cache, byTableId map, searchKb, getKbEntry, getKbIndex). El trabajo principal es **UI compositiva**: 3 server components (page, [id]/page, route.ts), 4 client components (Table, Detail, Timeline, CountsBar), y 2 strings i18n + 1 icon en sidebar.

El stack tecnológico está **100% presente** en `package.json`: `react-markdown@10.1.0`, `remark-gfm@4.0.1`, `recharts@3.8.0`, `lucide-react@0.577.0`, `shadcn@4.0.2`, `next-intl@3.26.5`, `@tailwindcss/typography@0.5.19`, `next@14.2.35`. **Ningún install nuevo es estrictamente necesario**; la única posible excepción es si se desea `npx shadcn add table` (el repo no tiene `components/ui/table.tsx`).

El trabajo tiene 3 conflictos entre CONTEXT / prompt adicional y el código real — **todos resolubles en el plan**, ninguno bloquea Phase 154:

1. `KbIndex` TypeScript interface omite el campo `header` (los datos runtime sí lo tienen). Se requiere extender el type o pedir a Phase 152 que lo amplíe.
2. `last_changes[]` shape real es `{id, updated}` — NO `{version, date, author, reason}`.
3. `_index.json.entries[].type` tiene 9 valores reales (no 10 del CONTEXT); faltan `state` y `feature`, sobra `audit`.

**Primary recommendation:** Implementar Phase 154 en 2-3 plans siguiendo el patrón server-component + client-component ya canónico en el repo (inverso de `catbrains/page.tsx` que es client+fetch; `knowledge/page.tsx` es server+import). **Extender el type `KbIndex` en `kb-index-cache.ts`** (1-liner al principio del Plan 01) para exponer `header.counts` y `header.last_changes`. Reusar exactamente el pattern react-markdown + remark-gfm documentado en 7 archivos del repo. Añadir shadcn `table` opcionalmente; la alternativa es `<table>` native con Tailwind (sin coste adicional).

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 14.2.35 | App Router, server components | Framework del proyecto |
| `react-markdown` | 10.1.0 | Renderizar markdown body | Usado en 7 archivos del repo (catbot-panel, tasks, process-panel, chat-panel, catpaw-chat-sheet, version-history, execution-result, canvas-editor) |
| `remark-gfm` | 4.0.1 | Tables, strikethrough, task lists | Usado siempre junto con react-markdown |
| `recharts` | 3.8.0 | Gráfico timeline | Usado en `app/src/app/page.tsx` (BarChart) |
| `lucide-react` | 0.577.0 | Icons | Usado en sidebar.tsx, breadcrumb.tsx, todas las pages |
| `next-intl` | 3.26.5 | i18n labels (nav link + breadcrumb) | `useTranslations('nav')` en sidebar.tsx:21 |
| `@tailwindcss/typography` | 0.5.19 | `prose` classes para markdown | Registrado en `tailwind.config.ts:77` |
| `tailwindcss-animate` | 1.0.7 | Animaciones | Registrado en tailwind config |

### Supporting (shadcn components already available)

| Component | Path | Use |
|-----------|------|-----|
| `Card, CardContent, CardHeader, CardTitle` | `components/ui/card.tsx` | CountsBar (8 cards) + sección wrappers |
| `Badge` | `components/ui/badge.tsx` | Type/status/subtype badges |
| `Button` | `components/ui/button.tsx` | Reset, back, etc. |
| `Input` | `components/ui/input.tsx` | Search box |
| `Select` (Radix) | `components/ui/select.tsx` | Type/subtype/status/audience filters |
| `Separator` | `components/ui/separator.tsx` | Secciones del detail |
| `Skeleton` | `components/ui/skeleton.tsx` | Loading states (opcional — server component puede evitar) |
| `Tooltip` | `components/ui/tooltip.tsx` | Hints sobre filtros / badges |
| `PageHeader` | `components/layout/page-header.tsx` | Title + description + action header |
| `Breadcrumb` | `components/layout/breadcrumb.tsx` | Auto-generado; requiere i18n key |

### NOT installed — decisions for planner

| Missing | Decision |
|---------|----------|
| `components/ui/table.tsx` (shadcn Table) | OPCIONAL install via `npx shadcn add table` en Wave 0; alternativa viable es `<table>` native con Tailwind (el detail/metadata de sección "Relaciones" también usa tabla). Recomendación: **usar table native con Tailwind** para evitar nueva dependencia y mantener disciplina (tabla es simple, no necesita virtualización, 128 rows). |
| `date-fns` / `dayjs` | No está. Usar helper inline `formatRelativeTime(updated: string): string` en un `lib/relative-time.ts` (40 líneas max, usa `Date.now() - new Date(updated).getTime()` + buckets). Patrón existente: `new Date().toLocaleDateString()` (catbrains/page.tsx:143). |
| `@testing-library/react` | No está. **Material:** los "unit tests de componentes" del prompt adicional no son posibles directamente. Estrategia test pivota a: unit tests en TS puro sobre funciones exportadas (filter logic extraído como función pura), integration tests del route handler, Playwright spec para E2E. |
| `rehype-highlight` / `rehype-raw` | No está. Markdown del KB es prosa con code fences ocasionales (protocolos, runtime prompts). Code fences de react-markdown renderizan como `<pre><code>` sin highlighting — aceptable para read-only. NO añadir `rehypeRaw` (riesgo XSS). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `<table>` | `npx shadcn add table` | shadcn table aporta keyboard nav + aria; native es 0 deps nuevas. Planner decide (recomendado native — simplicidad, 128 rows). |
| Server component + direct service call | Client component + `/api/knowledge` GET | Convención del repo es client+fetch (`catbrains/page.tsx`). Phase 154 DEVIATES intencionadamente por D2: el module `kb-index-cache` es server-only (lee filesystem). Documentar el motivo en comentario top-of-file. |
| Inline filter logic | Extraer a `lib/kb-filters.ts` | Extraer porque: (a) unit-testeable sin jsdom, (b) reusable si surge otra vista. Recomendado: extraer. |

**Installation commands (minimum):**
```bash
# Ninguno — todo dependency ya instalado. Solo opcional:
cd app && npx shadcn@latest add table  # SOLO si planner elige shadcn Table sobre native
```

## Architecture Patterns

### Recommended Project Structure

```
app/src/app/knowledge/
├── page.tsx                              # Server component: KB lista + filtros + timeline + counts
└── [id]/page.tsx                         # Server component: detail

app/src/app/api/knowledge/
└── [id]/route.ts                         # GET handler

app/src/components/knowledge/
├── KnowledgeCountsBar.tsx                # Server or client; renders 8 Cards from header.counts
├── KnowledgeTimeline.tsx                 # 'use client' — recharts ResponsiveContainer+LineChart
├── KnowledgeTable.tsx                    # 'use client' — useState filters + rows
├── KnowledgeFilters.tsx                  # 'use client' — Input + Select x4 + tag chips (opcional; puede inline en Table)
├── KnowledgeDetail.tsx                   # 'use client' — markdown + metadata
├── KnowledgeRelatedTable.tsx             # Sub-component of Detail; opcional
└── KnowledgeDeprecatedBanner.tsx         # Sub-component of Detail; opcional

app/src/lib/kb-filters.ts                 # Pure TS filter functions (unit-testable)
app/src/lib/relative-time.ts              # Pure helper (unit-testable)
app/src/lib/kb-types.ts                   # OPCIONAL: re-exports + extended KbIndex with header (see Conflict 1)
```

### Pattern 1: Server Component + Client Component Split

**What:** Server component fetches from service (Node-only module), passes plain JSON to client component for interactivity.

```typescript
// Source: canonical pattern inferred from catbrains + kb-index-cache exports
// app/src/app/knowledge/page.tsx
import { getKbIndex } from '@/lib/services/kb-index-cache';
import { KnowledgeTable } from '@/components/knowledge/KnowledgeTable';
import { KnowledgeTimeline } from '@/components/knowledge/KnowledgeTimeline';
import { KnowledgeCountsBar } from '@/components/knowledge/KnowledgeCountsBar';
import { PageHeader } from '@/components/layout/page-header';

export const dynamic = 'force-dynamic';  // KB changes per Phase 153 hooks

export default async function KnowledgePage() {
  const index = getKbIndex();
  if (!index) {
    return <div className="p-8">KB no disponible. Ejecuta `kb-sync.cjs --full-rebuild`.</div>;
  }
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader title="Knowledge Base" description="..." />
      <KnowledgeCountsBar counts={index.header.counts} />
      <KnowledgeTimeline changes={index.header.last_changes} />
      <KnowledgeTable entries={index.entries} />
    </div>
  );
}
```

**When to use:** Whenever data comes from a Node-only module (filesystem, better-sqlite3, `kb-index-cache`).

**Key details:**
- `export const dynamic = 'force-dynamic';` en page — KB se regenera por Phase 153 hooks; sin esto Next.js podría static-prerender al build (MEMORY.md mandato #2).
- NO `'use client'` en page.tsx (server).
- Hijos client components DEBEN llevar `'use client'` top line.

### Pattern 2: react-markdown + remark-gfm in client component

**What:** Canonical repo pattern, 7 usos verificados.

```typescript
// Source: app/src/components/process/process-panel.tsx:513-517
// app/src/components/knowledge/KnowledgeDetail.tsx
'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function KnowledgeDetail({ entry }: { entry: GetKbEntryResult }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.body}</ReactMarkdown>
    </div>
  );
}
```

**When to use:** Rendering `entry.body` (markdown after frontmatter).

**Anti-pattern:** NO pasar `rehypeRaw` ni `rehypePlugins` con HTML raw — el KB es confiable pero el principio de defense-in-depth aplica (XSS vector si alguien edita un .md con HTML malicioso).

### Pattern 3: recharts LineChart with dark theme

**What:** Adapt repo's BarChart pattern to LineChart.

```typescript
// Source: app/src/app/page.tsx:239-270 (BarChart → LineChart)
// app/src/components/knowledge/KnowledgeTimeline.tsx
'use client';
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts';

interface LastChange { id: string; updated: string; }

export function KnowledgeTimeline({ changes }: { changes: LastChange[] }) {
  if (!changes || changes.length === 0) {
    return <div className="text-zinc-500 text-sm py-4">Sin cambios recientes</div>;
  }
  // Aggregate by day (YYYY-MM-DD)
  const byDay = new Map<string, number>();
  for (const c of changes) {
    const day = c.updated.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const data = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({ day, count }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="day" tick={{ fill: '#71717a', fontSize: 12 }} tickFormatter={v => String(v).slice(5)} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#71717a', fontSize: 12 }} axisLine={false} tickLine={false} />
        <RechartsTooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} labelStyle={{ color: '#a1a1aa' }} />
        <Line type="monotone" dataKey="count" stroke="#8B6D8B" strokeWidth={2} dot={{ fill: '#8B6D8B', r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**When to use:** Cualquier gráfico del dashboard. Colors: violet/purple del theme (`#8B6D8B` match con sidebar DoCatFlow logo).

### Pattern 4: API route handler with delegation to service

```typescript
// Source: app/src/app/api/catbrains/[id]/route.ts:1-27 adapted
// app/src/app/api/knowledge/[id]/route.ts
import { NextResponse } from 'next/server';
import { getKbEntry } from '@/lib/services/kb-index-cache';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const entry = getKbEntry(id);
  if (!entry) {
    return NextResponse.json({ error: 'NOT_FOUND', id }, { status: 404 });
  }
  return NextResponse.json(entry);
}
```

### Pattern 5: Sidebar nav integration

```typescript
// Source: app/src/components/layout/sidebar.tsx:51-57 (extension)
// After:  { href: '/catpower', labelKey: 'catpower' as const, icon: Boxes },
// Add:    { href: '/knowledge', labelKey: 'knowledge' as const, icon: BookOpen },

// Import addition:
import { ..., BookOpen } from 'lucide-react';
```

Y en `app/messages/es.json` + `en.json`:
```json
{
  "nav": {
    ...
    "catpower": "CatPower",
    "knowledge": "Knowledge"    // or "Base de conocimiento" (es)
  },
  "layout": {
    "breadcrumb": {
      ...
      "knowledge": "Knowledge"  // required for auto-breadcrumb in /knowledge/*
    }
  }
}
```

### Anti-Patterns to Avoid

- **NO hacer `client page.tsx` + `useEffect fetch('/api/knowledge')`:** el módulo `kb-index-cache` es server-only; fetch sobre API route nuevo es un round-trip innecesario. D2 lock decision.
- **NO usar `process.env.KB_ROOT`:** dot-notation. Solo `process['env']['KB_ROOT']` (MEMORY.md mandato #1). Pero este módulo YA lo maneja — Phase 154 NO lee env directamente, solo llama `getKbIndex()`.
- **NO pasar `rehypeRaw` a react-markdown:** XSS risk (KB trust boundary débil — un protocolo migrado podría contener HTML embedded).
- **NO crear un "table virtualization"**: 128 rows no lo necesita (deferred >1000).
- **NO añadir un pagination server-side**: filter client-side es la decisión D3.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| KB read + TTL cache | Otro fetcher filesystem | `kb-index-cache.getKbIndex()` / `getKbEntry(id)` (Phase 152) | Ya resuelto: 60s TTL, byTableId map, graceful missing, bracket-notation env |
| YAML frontmatter parse | js-yaml inline call | `parseKbFile(relPath)` o `getKbEntry(id)` | `kb-index-cache.ts:261-294` ya lo expone |
| Related resolution | Walk entries manually | `getKbEntry(id).related_resolved[]` | Service resuelve `related: [{type,id}] → [{type,id,title,path}]` |
| Markdown render | Hand-parse `#` / `**` / ``` ``` | react-markdown + remark-gfm | 7 usos existentes, estandarizado |
| Breadcrumb | Construir trail manual | `<Breadcrumb />` (auto desde pathname) | `app/src/components/layout/breadcrumb.tsx` |
| Page header | `<h1>` + `<p>` + layout custom | `<PageHeader title description action />` | `app/src/components/layout/page-header.tsx` |
| Dark mode toggle | useState + class toggler | Root `<html className="dark">` in layout.tsx | Forzado dark en `app/src/app/layout.tsx:31` |
| i18n | Strings hardcoded | `useTranslations('nav')` y añadir en `messages/es.json` + `en.json` | Pattern canónico sidebar.tsx:21 |
| Filter state persist URL | `useSearchParams + router.replace` custom | Opcional — D3 no requiere URL sync; state local basta | 128 entries, refresh pierde filter es aceptable |
| Markdown code highlighting | rehype-highlight + shiki | Dejar `<pre><code>` plain (react-markdown default) | Read-only, scope-limited; deferred si necesario |

**Key insight:** `kb-index-cache.ts` ya expone TODO el read-path. Phase 154 es UI puramente; NO tocar services/ directorio.

## Common Pitfalls

### Pitfall 1: `KbIndex` TS interface vs runtime shape (Conflict 1)
**What goes wrong:** `kb-index-cache.ts:66-75` declara `KbIndex` como `{schema_version, entry_count, entries, indexes}` — NO incluye `header`. Pero `_index.json` en disk SÍ tiene `header.counts` + `header.last_changes` + `header.top_tags`. Al hacer `index.header.counts` TypeScript compila en error.

**Why it happens:** Phase 152 owner type-annotated `KbIndex` cuando `_index.json` aún no tenía `header` completo. Phase 149/150 lo añadieron al runtime data pero el type quedó detrás.

**How to avoid:** Plan 01 Task 1 debe extender `KbIndex` en `kb-index-cache.ts` (1 archivo, 10 líneas):
```typescript
export interface KbIndexHeader {
  counts: {
    catpaws_active: number;
    connectors_active: number;
    catbrains_active: number;
    templates_active: number;
    skills_active: number;
    rules: number;
    incidents_resolved: number;
    features_documented: number;
  };
  top_tags: string[];
  last_changes: Array<{ id: string; updated: string }>;
}
export interface KbIndex {
  schema_version: string;
  generated_at?: string;
  generated_by?: string;
  entry_count: number;
  header: KbIndexHeader;
  entries: KbIndexEntry[];
  indexes: { by_type: Record<string,string[]>; by_tag: Record<string,string[]>; by_audience: Record<string,string[]> };
}
```

**Warning signs:** `tsc` error "Property 'header' does not exist on type 'KbIndex'".

### Pitfall 2: `last_changes[]` real shape ≠ documented (Conflict 2)
**What goes wrong:** El prompt adicional y el PRD sugieren `last_changes[]` con `{version, date, author, reason}`. Real shape verificado en `_index.json`: `{id, updated}`. Solo 2 campos.

**Why it happens:** PRD describía un objetivo futuro; la implementación de Phase 149/150 emitió el shape mínimo.

**How to avoid:** Timeline agrupa por día y cuenta IDs. NO renderizar version/author/reason porque NO ESTÁN. Tooltip muestra `count + date`.

**Warning signs:** Runtime `undefined` en `.version` o `.author` del change object.

### Pitfall 3: Type enum values runtime ≠ D3 spec (Conflict 3)
**What goes wrong:** CONTEXT D3 lista 10 types: `concept | taxonomy | resource | rule | protocol | runtime | incident | feature | guide | state`. Real `_index.json` tiene 9 valores distintos: `audit, concept, taxonomy, guide, incident, protocol, resource, rule, runtime`. Faltan `feature` y `state`; sobra `audit`.

**Why it happens:** Schema JSON en `.docflow-kb/_schema/frontmatter.schema.json:16` permite 11 types (incluyendo `audit`). Runtime solo hay 9 porque Phase 151 migró contenido activo.

**How to avoid:** `type` filter select debe derivar dinámicamente de `[...new Set(entries.map(e => e.type))]` — NO hardcodear. Misma lógica para `subtype` (filtrar dependiente de type).

**Warning signs:** Option "feature" visible en select pero 0 resultados.

### Pitfall 4: next.js static prerendering
**What goes wrong:** Sin `export const dynamic = 'force-dynamic';`, Next 14 puede prerender `/knowledge` en build-time, cacheando 128 entries vacíos (o del fs del build-time).

**Why it happens:** App Router por default prerendera si no detecta dinamismo (no usa cookies, searchParams, etc).

**How to avoid:** Añadir `export const dynamic = 'force-dynamic';` en `page.tsx`, `[id]/page.tsx`, y `route.ts`. Pattern canónico del repo (MEMORY.md mandato #3, ver `api/catbrains/route.ts:10`, `api/catbrains/[id]/route.ts:11`).

### Pitfall 5: shadcn Select interop en Radix v1
**What goes wrong:** `components/ui/select.tsx` es Radix-based; un `<Select onValueChange={fn}>` con value="" throws porque Radix requiere value `undefined` para "clear".

**How to avoid:** Filtros empiezan con `undefined` (no ""), y al limpiar (`Reset`) se setea `undefined`. Alternativa: usar `<select>` nativo con Tailwind (menos accesible pero zero-friction).

### Pitfall 6: Breadcrumb genérico no conoce entry title
**What goes wrong:** `Breadcrumb` auto-genera desde pathname: `/knowledge/72ef0fe5-redactor-informe-inbound` → "Knowledge / 72ef0fe5-redactor-informe-inbound" (slug kebab). Feo.

**How to avoid:** Opciones: (a) aceptar el slug (más simple), (b) en `[id]/page.tsx` skippear `<Breadcrumb />` y renderizar uno manual con el `entry.frontmatter.title`. **Recomendación:** (b), pattern ya usado en `catbrains/[id]/page.tsx:256-262`.

### Pitfall 7: `updated` fecha formatos mixtos
**What goes wrong:** Algunos entries tienen `updated: "2026-04-20T14:27:55.981Z"` (ISO), otros `"2026-04-20 19:05:17"` (SQL). `new Date(...)` puede dar Invalid Date en el segundo formato en Safari.

**How to avoid:** Helper `formatRelativeTime`:
```typescript
export function formatRelativeTime(updated: string): string {
  const safe = updated.includes('T') ? updated : updated.replace(' ', 'T') + 'Z';
  const diff = Date.now() - new Date(safe).getTime();
  if (Number.isNaN(diff)) return updated;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  if (days < 365) return `hace ${Math.floor(days/30)} meses`;
  return new Date(safe).toLocaleDateString('es-ES');
}
```

## Code Examples

### `app/src/app/knowledge/page.tsx` (skeleton)

```typescript
// Source: synthesis of kb-index-cache.ts:146 + catbrains page + page-header pattern
import { getKbIndex } from '@/lib/services/kb-index-cache';
import { KnowledgeTable } from '@/components/knowledge/KnowledgeTable';
import { KnowledgeTimeline } from '@/components/knowledge/KnowledgeTimeline';
import { KnowledgeCountsBar } from '@/components/knowledge/KnowledgeCountsBar';
import { PageHeader } from '@/components/layout/page-header';
import { BookOpen } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function KnowledgePage() {
  const index = getKbIndex();
  if (!index) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <PageHeader title="Knowledge Base" description="KB no disponible" icon={<BookOpen className="w-8 h-8" />} />
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
          <p className="text-zinc-400">
            El Knowledge Base no está disponible. Ejecuta <code className="text-violet-400">scripts/kb-sync.cjs --full-rebuild --source db</code> para poblarlo.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader title="Knowledge Base" description={`${index.entry_count} recursos`} icon={<BookOpen className="w-8 h-8" />} />
      <KnowledgeCountsBar counts={index.header.counts} />
      <KnowledgeTimeline changes={index.header.last_changes} />
      <KnowledgeTable entries={index.entries} />
    </div>
  );
}
```

### `app/src/app/knowledge/[id]/page.tsx` (skeleton)

```typescript
import { getKbEntry } from '@/lib/services/kb-index-cache';
import { KnowledgeDetail } from '@/components/knowledge/KnowledgeDetail';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function KnowledgeEntryPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = getKbEntry(id);
  if (!entry) notFound();

  const fmTitle = typeof entry.frontmatter.title === 'string'
    ? entry.frontmatter.title
    : (entry.frontmatter.title as { es?: string; en?: string })?.es ?? id;

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-6">
      {/* Manual breadcrumb — avoids auto-breadcrumb slug ugliness */}
      <nav className="flex items-center text-sm text-zinc-400 mb-4">
        <Link href="/" className="hover:text-zinc-50">Dashboard</Link>
        <ChevronRight className="w-4 h-4 mx-1.5" />
        <Link href="/knowledge" className="hover:text-zinc-50">Knowledge</Link>
        <ChevronRight className="w-4 h-4 mx-1.5" />
        <span className="text-zinc-50 truncate max-w-[300px]">{fmTitle}</span>
      </nav>
      <KnowledgeDetail entry={entry} title={fmTitle} />
    </div>
  );
}
```

### `app/src/app/api/knowledge/[id]/route.ts` (complete)

```typescript
import { NextResponse } from 'next/server';
import { getKbEntry } from '@/lib/services/kb-index-cache';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const entry = getKbEntry(id);
  if (!entry) {
    return NextResponse.json({ error: 'NOT_FOUND', id }, { status: 404 });
  }
  return NextResponse.json(entry);
}
```

### `app/src/lib/kb-filters.ts` (pure TS — unit testable in vitest node env)

```typescript
import type { KbIndexEntry } from './services/kb-index-cache';

export interface KbFilterState {
  type?: string;
  subtype?: string;
  status?: string;           // default 'active' applied at call site
  audience?: string;
  tags: string[];            // AND-match
  search: string;            // case-insensitive title+summary
}

export function applyKbFilters(entries: KbIndexEntry[], f: KbFilterState): KbIndexEntry[] {
  const q = f.search.trim().toLowerCase();
  return entries.filter(e => {
    if (f.type && e.type !== f.type) return false;
    if (f.subtype && e.subtype !== f.subtype) return false;
    if (f.status && e.status !== f.status) return false;
    if (f.audience && !e.audience.includes(f.audience)) return false;
    if (f.tags.length && !f.tags.every(t => e.tags.includes(t))) return false;
    if (q) {
      const hay = (e.title + ' ' + e.summary).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function collectDistinctTypes(entries: KbIndexEntry[]): string[] {
  return [...new Set(entries.map(e => e.type))].sort();
}

export function collectDistinctSubtypes(entries: KbIndexEntry[], type?: string): string[] {
  const filtered = type ? entries.filter(e => e.type === type) : entries;
  return [...new Set(filtered.map(e => e.subtype).filter((s): s is string => !!s))].sort();
}

export function collectDistinctTags(entries: KbIndexEntry[], max = 50): string[] {
  const count = new Map<string, number>();
  for (const e of entries) for (const t of e.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([t]) => t);
}
```

### Timeline aggregation (pure TS — unit testable)

```typescript
// app/src/lib/kb-timeline.ts
export function aggregateChangesByDay(
  changes: Array<{ id: string; updated: string }>,
): Array<{ day: string; count: number }> {
  const byDay = new Map<string, number>();
  for (const c of changes) {
    const safe = c.updated.includes('T') ? c.updated : c.updated.replace(' ', 'T') + 'Z';
    const day = safe.slice(0, 10);
    if (day.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({ day, count }));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Next.js Pages Router (`pages/`) | App Router (`app/`) | Next 13+ | Phase 154 usa App Router nativo (servers components disponibles) |
| `params` sync object | `params: Promise<{id: string}>` | Next 14 async params | `await params` required — visible en ALL recent route handlers |
| react-markdown v6 API con `plugins` | v10 con `remarkPlugins`/`rehypePlugins` | v7+ (2022) | Pattern canónico del repo es v10 — YA actualizado |
| recharts v2 | recharts v3.8 | 2024 | Breaking changes menores; el pattern de `page.tsx` usa v3 API |

**Deprecated/outdated:**
- **`app/data/knowledge/*.json`**: fuente vieja de knowledge runtime. Será borrado en Phase 155. Phase 154 NO debe consultar este folder — solo `.docflow-kb/`.
- **`app/src/app/skills/page.tsx`**: simple redirect a `/catpower/skills`. Ejemplo patrón no aplicable.

## Open Questions

1. **¿Debe el planner instalar shadcn Table o usar `<table>` native?**
   - Recomendación: native + Tailwind. 128 rows no justifica dep + 2 archivos nuevos.
   - Deferred si surge virtualización (>1000 rows).

2. **¿El `status` filter default es `'active'` (oculta deprecated) o muestra todo?**
   - CONTEXT D3 dice default `active` — **LOCKED**. Usuario puede cambiar a `deprecated` manualmente.
   - Consistencia con `searchKb()` que también default `status:'active'` (kb-index-cache.ts:311).

3. **`KbIndex` type extension — Plan 01 o deferred al service owner?**
   - Recomendación: **Plan 01 Task foundation** añade la extensión. Es 10 líneas, sin riesgo. Dejarlo para Phase 152 retroactivo sería bloqueante.
   - Alternativa mínima: `const idx = getKbIndex() as KbIndex & { header: KbIndexHeader };` con cast — feo pero funciona.

4. **¿Qué icono de lucide-react para "Knowledge"?**
   - Candidatos: `BookOpen`, `Library`, `Database`, `Book`, `Archive`.
   - Recomendación: `BookOpen` — consistente con la naturaleza lectura-principal del dashboard.
   - No conflict con icons usados en sidebar (LayoutDashboard, Brain, PawPrint, Boxes, Zap).

5. **¿i18n en las páginas de `/knowledge/*` o hardcode español?**
   - Sidebar + breadcrumb REQUIEREN i18n keys (pattern del repo).
   - Page body: CONTEXT §Out of scope "i18n completo del dashboard — textos en español (consistent con el resto de la app)". **LOCKED:** sidebar + breadcrumb via i18n, internals de `/knowledge/*` hardcoded en español.

## Validation Architecture

> `workflow.nyquist_validation: true` confirmed in `.planning/config.json` — this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework (unit) | **vitest 4.1.0**, environment `node`, include `src/**/*.test.ts` |
| Framework (E2E) | **Playwright 1.58.2**, baseURL `http://localhost:3500`, testDir `app/e2e/` |
| Config file (unit) | `app/vitest.config.ts` |
| Config file (E2E) | `app/playwright.config.ts` |
| Quick run command (unit) | `cd app && npm run test:unit` |
| Single file (unit) | `cd app && npx vitest run src/lib/kb-filters.test.ts` |
| Full suite (unit) | `cd app && npm run test:unit` |
| E2E quick | `cd app && npm run test:e2e -- --grep "knowledge"` |
| E2E full | `cd app && npm run test:e2e` |
| Oracle | manual via CatBot (see D11 + Step below) |

**Critical constraint:** vitest env is `node` — **no jsdom, no `@testing-library/react` installed**. React component rendering tests are NOT feasible without adding deps. **Strategy:** test PURE TS logic (extracted to `lib/kb-filters.ts`, `lib/kb-timeline.ts`, `lib/relative-time.ts`) + Playwright for UI behavior.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| KB-23 | Filter by type reduces set | unit | `npx vitest run src/lib/kb-filters.test.ts -t "type"` | Wave 0 |
| KB-23 | Filter by subtype (dependent) | unit | `npx vitest run src/lib/kb-filters.test.ts -t "subtype"` | Wave 0 |
| KB-23 | Filter by tags AND-match (2 tags) | unit | `npx vitest run src/lib/kb-filters.test.ts -t "tags AND"` | Wave 0 |
| KB-23 | Filter by search case-insensitive title+summary | unit | `npx vitest run src/lib/kb-filters.test.ts -t "search"` | Wave 0 |
| KB-23 | Filter default status='active' excludes deprecated | unit | `npx vitest run src/lib/kb-filters.test.ts -t "status default"` | Wave 0 |
| KB-23 | Reset clears all | unit | `npx vitest run src/lib/kb-filters.test.ts -t "reset"` | Wave 0 |
| KB-23 | `/knowledge` page renders rows | E2E | `npx playwright test e2e/specs/knowledge.spec.ts -g "lista 128"` | Wave 0 |
| KB-23 | `/knowledge` filter UI interaction | E2E | `npx playwright test e2e/specs/knowledge.spec.ts -g "filter"` | Wave 0 |
| KB-24 | Detail renders markdown body | E2E | `npx playwright test e2e/specs/knowledge.spec.ts -g "detail markdown"` | Wave 0 |
| KB-24 | Detail deprecated banner appears | E2E | `npx playwright test e2e/specs/knowledge.spec.ts -g "deprecated banner"` | Wave 0 |
| KB-24 | Detail related_resolved links navigate | E2E | `npx playwright test e2e/specs/knowledge.spec.ts -g "related links"` | Wave 0 |
| KB-25 | `GET /api/knowledge/[id]` 200 shape | integration | `npx playwright test e2e/api/knowledge.api.spec.ts -g "200"` | Wave 0 |
| KB-25 | `GET /api/knowledge/bogus` 404 | integration | `npx playwright test e2e/api/knowledge.api.spec.ts -g "404"` | Wave 0 |
| KB-25 | Response matches `GetKbEntryResult` type | integration | `npx playwright test e2e/api/knowledge.api.spec.ts -g "shape"` | Wave 0 |
| KB-26 | Timeline aggregates by day | unit | `npx vitest run src/lib/kb-timeline.test.ts -t "aggregate"` | Wave 0 |
| KB-26 | Timeline handles empty array | unit | `npx vitest run src/lib/kb-timeline.test.ts -t "empty"` | Wave 0 |
| KB-26 | Timeline handles SQL date format | unit | `npx vitest run src/lib/kb-timeline.test.ts -t "SQL format"` | Wave 0 |
| KB-26 | CountsBar renders 8 cards | E2E | `npx playwright test e2e/specs/knowledge.spec.ts -g "counts bar"` | Wave 0 |
| KB-27 | Sidebar has Knowledge link | E2E | `npx playwright test e2e/specs/knowledge.spec.ts -g "sidebar link"` | Wave 0 |
| KB-27 | Clicking sidebar navigates to /knowledge | E2E | same spec | Wave 0 |

### Sampling Rate

- **Per task commit:** `cd app && npm run test:unit -- --changed` (only touched files) + `npm run build` (next compile catches TS/ESLint)
- **Per wave merge:** full `cd app && npm run test:unit`
- **Phase gate (pre `/gsd:verify-work`):** 
  - `cd app && npm run test:unit` (all unit)
  - `cd app && npm run build` (ESLint + TS compile — Docker build depends on this)
  - `cd app && npx playwright test --grep "knowledge|api/knowledge"` (Phase 154 scope)
  - Full existing suite regression: `cd app && npm run test:unit` (no new brokenness)
  - Oracle CatBot manual (see D11)

### Wave 0 Gaps

**Test files to create:**
- [ ] `app/src/lib/kb-filters.ts` — pure filter functions (source file)
- [ ] `app/src/lib/kb-filters.test.ts` — 6 tests: type / subtype / tags AND / search / status default / reset
- [ ] `app/src/lib/kb-timeline.ts` — pure aggregate function
- [ ] `app/src/lib/kb-timeline.test.ts` — 3 tests: aggregate / empty / SQL format
- [ ] `app/src/lib/relative-time.ts` — pure helper
- [ ] `app/src/lib/relative-time.test.ts` — 4 tests: hoy / ayer / days / months
- [ ] `app/e2e/specs/knowledge.spec.ts` — UI E2E with POM page
- [ ] `app/e2e/api/knowledge.api.spec.ts` — API E2E (GET /api/knowledge/[id] 200 + 404)
- [ ] `app/e2e/pages/knowledge.pom.ts` — POM page object for /knowledge UI interactions

**Regression check (no new tests needed — verify existing pass):**
- `knowledge-sync.test.ts` (Phase 150)
- `kb-sync-cli.test.ts` (Phase 150)
- `kb-sync-db-source.test.ts` (Phase 150)
- `kb-index-cache.test.ts` (Phase 152) — **CRITICAL** if extending `KbIndex` type
- `kb-tools.test.ts` (Phase 152)
- `kb-tools-integration.test.ts` (Phase 152)
- `catbot-tools-query-knowledge.test.ts` (Phase 152)
- `kb-audit.test.ts` (Phase 153)
- `kb-hooks-tools.test.ts` (Phase 153)
- `kb-hooks-api-routes.test.ts` (Phase 153)

**Fixture strategy:** Playwright E2E tests run against live Docker stack (baseURL 3500). If fixture KB is needed for deterministic tests, use the existing `.docflow-kb/` content (already has 128 real entries). For the 404 test, use a deterministic bogus ID like `bogus-nonexistent-123`.

**Framework installs:** None required — all deps already present.

### Oracle (manual, pre-phase-close)

1. Docker rebuild: `docker compose build --no-cache app && docker compose up -d`
2. Browser → `http://localhost:3500/knowledge`
3. Verify:
   - PageHeader with "Knowledge Base" title
   - 8 CountsBar cards with numbers (catpaws_active=10, connectors_active=4, etc.)
   - Timeline line chart with last N days
   - Table with 128 rows (or filtered after status=active default)
4. Apply filter: `type=resource`, `subtype=catpaw` → expect ~10 rows (CatPaws active count)
5. Click row "Operador Holded" (or any catpaw) → detail page
6. Verify:
   - Breadcrumb: Dashboard > Knowledge > Operador Holded
   - Title from frontmatter, type/status badges
   - `## Contenido` rendered (system prompt in markdown)
   - `## Relaciones` table with related entries and links
   - `## Metadata` with version/dates/change_log
7. Click a related link → navigate to related entry
8. Navigate `/api/knowledge/catpaw-{real-id}` in browser → JSON response with `{id, path, frontmatter, body, related_resolved}`
9. Navigate `/api/knowledge/bogus-nonexistent-id` → JSON `{error: 'NOT_FOUND', id: 'bogus-nonexistent-id'}` with 404
10. **CatBot oracle prompt:** "¿Cuántos CatPaws activos hay en el Knowledge Base y cuál es el path del archivo KB del primer CatPaw que veas?" — CatBot responde usando `search_kb({type:'resource', subtype:'catpaw'})` (tool de Phase 152) — this proves dashboard + CatBot point at same KB.
11. Paste screenshots + CatBot response to `154-VERIFICATION.md`.

## Sources

### Primary (HIGH confidence — file + line refs from this repo)

- `app/package.json` — verified all dep versions (react-markdown 10.1.0, remark-gfm 4.0.1, recharts 3.8.0, lucide-react 0.577.0, next 14.2.35, next-intl 3.26.5, vitest 4.1.0, @playwright/test 1.58.2, shadcn 4.0.2)
- `app/src/lib/services/kb-index-cache.ts:1-413` — full read of Phase 152 module; types and functions
- `.docflow-kb/_index.json` — runtime inspection of real shape (header.counts 8 keys, last_changes[0]={id,updated}, entries[0] 11 keys, 9 distinct types, 2 distinct statuses, 21 distinct subtypes)
- `.docflow-kb/_schema/frontmatter.schema.json:1-80+` — schema of entry frontmatter (fields deprecated_at/by/reason, superseded_by, lifecycle)
- `.docflow-kb/resources/catpaws/72ef0fe5-*.md:1-30` — sample frontmatter including change_log, source_of_truth, related
- `app/src/components/layout/sidebar.tsx:1-273` — nav integration point (navItems array L51-57)
- `app/src/components/layout/breadcrumb.tsx:1-53` — auto-breadcrumb (ROUTE_KEYS L8-12; requires `knowledge` key)
- `app/src/components/layout/page-header.tsx:1-29` — reusable header component
- `app/src/app/layout.tsx:1-50` — root layout with `className="dark"` and NextIntlClientProvider
- `app/src/app/catbrains/page.tsx:1-159` — list page pattern (client+fetch — contrast with Phase 154 server approach)
- `app/src/app/catbrains/[id]/page.tsx:1-389` — detail page pattern (breadcrumb manual at L256-262)
- `app/src/app/api/catbrains/[id]/route.ts:1-27` — GET handler canonical pattern (dynamic=force-dynamic, NextResponse, Promise<params>)
- `app/src/app/api/catbrains/route.ts:1-35` — alternate GET pattern
- `app/src/app/page.tsx:17-20, 239-270` — recharts BarChart canonical example (adapt to LineChart)
- `app/src/components/process/process-panel.tsx:513-517` — `prose prose-invert prose-sm` + ReactMarkdown + remarkGfm canonical
- `app/src/app/tasks/[id]/page.tsx:935-939` — another instance of same markdown pattern
- `app/tailwind.config.ts:1-81` — darkMode class, CSS vars, @tailwindcss/typography
- `app/src/app/globals.css:17-70` — HSL CSS vars for dark theme tokens
- `app/vitest.config.ts:1-17` — env=node, include=src/**/*.test.ts
- `app/playwright.config.ts:1-38` — baseURL 3500, testDir e2e/
- `app/e2e/specs/navigation.spec.ts:1-66` — existing E2E pattern for nav testing
- `app/e2e/pages/sidebar.pom.ts:1-75` — existing POM pattern to extend
- `app/e2e/api/catbrains.api.spec.ts:1-50` — existing API E2E pattern
- `app/messages/es.json` (3362 lines) — i18n structure; `nav.*` and `layout.breadcrumb.*` keys confirmed
- `app/src/components/ui/*.tsx` (ls) — confirmed shadcn components: badge, button, card, input, select, separator, skeleton, tooltip; **confirmed missing: table**
- `.planning/config.json` — `workflow.nyquist_validation: true` (validation arch required)
- `.planning/ANALYSIS-knowledge-base-architecture.md:393-402, 697-702` — PRD Fase 6 spec
- `.planning/v29.1-MILESTONE-CONTEXT.md:38-45` — DoD incluye Phase 154

### Secondary (MEDIUM confidence — verified pattern against repo)

- `.planning/REQUIREMENTS.md:61-72, 133-136` — KB-15..KB-22 complete status; KB-23..KB-27 to be added
- `.planning/STATE.md:60-69` — phase history; Phase 153 complete, Phase 154 ready

### Tertiary (LOW confidence — not applicable)

*(None — all findings verified against live codebase + runtime files.)*

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — versions verified in `package.json`, all canonical patterns (react-markdown+remark-gfm, recharts, next-intl) have 7+ uses in the repo
- Architecture: **HIGH** — server component pattern verified in other Next 14 App Router pages; service delegation pattern canonical (api/catbrains/[id]/route.ts)
- Pitfalls: **HIGH** — 3 concrete conflicts between CONTEXT/prompt and real code observed (KbIndex.header missing, last_changes shape, type enum values); all validated against live `_index.json`
- Test infrastructure: **HIGH** — vitest.config.ts and playwright.config.ts read directly; env=node constraint proves @testing-library/react NOT usable without adding deps
- Navigation integration: **HIGH** — sidebar.tsx:51-57 and breadcrumb.tsx:8-12 are the exact integration points; messages/es.json structure verified

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days — stable repo, Phase 152/153 just completed with no signs of upcoming churn in kb-index-cache or sidebar)

---

*Phase: 154-kb-dashboard-knowledge*
*Research complete: 2026-04-20*
