# Phase 154: KB Dashboard /knowledge — Context

**Gathered:** 2026-04-20
**Status:** Ready for planning
**Source:** Decisiones delegadas por usuario (patrón establecido 150/152/153), derivadas de scout `app/src/app/` + `package.json` + PRD §7 Fase 6

<domain>
## Phase Boundary

Exponer el Knowledge Base (`.docflow-kb/`) como **dashboard navegable en la UI** de DocFlow. Ruta nueva `/knowledge` con (a) vista tabla de los 128 recursos con filtros client-side, (b) vista detalle por recurso que renderiza markdown, (c) gráfico timeline de cambios recientes, (d) contadores por subtipo desde `_index.json.header.counts`.

**Entregables:**

1. **Lista `/knowledge`** — `app/src/app/knowledge/page.tsx`. Server component que carga `_index.json` via `fs.readFileSync` + `KB_ROOT` env (reusar `kb-index-cache.ts` de Phase 152). Cliente filtra tabla por tag, type, audience, status + full-text sobre title/summary. Paginación no (solo 128 entries actuales, scroll).

2. **Detalle `/knowledge/[id]`** — `app/src/app/knowledge/[id]/page.tsx`. Lee el `.md` via `kb-index-cache.getKbEntry(id)` (Phase 152). Renderiza con `react-markdown` + frontmatter pretty-printed + bloque "Relaciones" con links al `related[]` resuelto.

3. **Timeline** — componente recharts sobre `_index.json.header.last_changes[]`. Se renderiza arriba de la tabla.

4. **API route `GET /api/knowledge/[id]`** — sirve el markdown crudo (para el componente detalle o para usos futuros). Read-only, no auth.

5. **Navegación** — añadir link `/knowledge` al menú principal del layout existente. NO modificar layouts globales más allá de una entrada de menú.

**Fuera de scope (explícito):**

- **Write UI** (editar archivos KB desde la UI) — fuera. El KB se edita vía `kb-sync.cjs --full-rebuild --source db` (Phase 150) o automáticamente vía creation hooks (Phase 153). Phase 154 es **read-only dashboard**.
- **Semantic search con Qdrant** — PRD §8.5, deferred.
- **Búsqueda cross-milestone** — solo el KB actual.
- **Edición inline de frontmatter** — fuera. Los campos del KB son derivados de DB (canónica).
- **Historial por archivo** — el `change_log` del frontmatter se muestra, pero no comparamos versiones ni diff.
- **Legacy cleanup** — Phase 155.
- **i18n completo del dashboard** — textos en español (consistent con el resto de la app según lo visto en menús `/agents`, `/catbrains`, etc.). No bilingüe hasta que haya traducción real de entries.

**Invariantes heredadas:**

- `_index.json` shape v2 (Phase 150 + 151 populated).
- `kb-index-cache.ts` es el consumer canónico server-side (Phase 152).
- Phase 153 mantiene KB sincronizado — el dashboard siempre refleja estado actual (no hay drift).
- Docker mount `.docflow-kb:/docflow-kb:ro` ya existe (Phase 152).

</domain>

<decisions>
## Implementation Decisions

Todas las decisiones siguientes son **locked** para researcher + planner.

### D1. Routing estructura

Convención DocFlow ya establecida: `/agents`, `/catbrains`, `/canvas`, `/settings`, `/skills`. Phase 154 añade `/knowledge` al mismo nivel.

```
app/src/app/knowledge/
├── page.tsx              ← Lista + filtros client + timeline
├── [id]/
│   └── page.tsx          ← Detalle de un entry
└── api/
    └── [id]/
        └── route.ts      ← GET /api/knowledge/[id] devuelve markdown
```

**Alternativa rechazada:** prefijo `/knowledge-base/`. Más verboso. `/knowledge` es suficiente (no hay collision con otras routes).

### D2. Server component para data fetching

`app/src/app/knowledge/page.tsx` es **server component** (Next.js App Router default). Lee `_index.json` directamente via `kb-index-cache.getKbIndex()` en el build-time fetch. Pasa a un **client component** `<KnowledgeTable>` para la interactividad (filtros, search input).

**Por qué:**
- Zero client-side `fetch('/api/knowledge')` — el index ya está en el Node runtime.
- Cache TTL 60s de `kb-index-cache` ya maneja freshness.
- Menos JS al cliente.

**Detalle `[id]/page.tsx`:** también server component. Llama `kb-index-cache.getKbEntry(id)` (Phase 152). Recibe frontmatter + body + related_resolved. Pasa a componente client `<KnowledgeDetail>` que renderiza con react-markdown.

### D3. Filtros client-side

La tabla de 128 entries cabe en una request. Filtros corren client-side sobre el array completo. Simple + rápido. No paginación.

**Filtros:**
- **type** (select, 10 opciones): `concept | taxonomy | resource | rule | protocol | runtime | incident | feature | guide | state`
- **subtype** (select dependiente de type — si type=resource, muestra: catpaw/connector/skill/catbrain/email-template/canvas)
- **status** (select, 4 opciones): default `active`; pueden elegir `deprecated | draft | experimental`
- **audience** (select multi): `catbot | architect | developer | user | onboarding`
- **tags** (chip input multi — AND-match contra `tags[]`)
- **search** (text input, full-text sobre title + summary case-insensitive)

Reset button clear all filters.

### D4. Layout de tabla

shadcn `Table` component (ya usado en otras páginas probablemente — el planner verifica). Columnas:

| Col | Contenido | Comportamiento |
|-----|-----------|----------------|
| Title | `title` | Link a `/knowledge/[id]` |
| Type | badge con color por type (`resource` verde, `rule` rojo, `protocol` azul, `concept` morado, `guide` amarillo, etc.) |
| Subtype | badge secundario gris si existe |
| Status | badge `active`/`deprecated`/`draft`/`experimental` |
| Tags | chips hasta 3 primeros + "+N more" |
| Updated | fecha relativa ("hace 2 días") |

Click sobre row → navega a `/knowledge/[id]`. Sticky header. Dark mode respeta theme existente.

### D5. Vista detalle layout

`app/src/app/knowledge/[id]/page.tsx`:

```
┌─────────────────────────────────────────────────┐
│ ← Back to KB                 [Tag chips]        │
│                                                 │
│ # Title (from frontmatter)                     │
│ Type: [badge] · Subtype: [badge] · Status: ... │
│                                                 │
│ ## Summary                                      │
│ (from frontmatter summary)                     │
│                                                 │
│ ─────────────────────────────────────────────  │
│ ## Contenido                                    │
│ (body rendered via react-markdown)             │
│                                                 │
│ ─────────────────────────────────────────────  │
│ ## Relaciones                                   │
│ Table: type | id | title | link                │
│ (from related_resolved)                        │
│                                                 │
│ ─────────────────────────────────────────────  │
│ ## Metadata                                     │
│ Version · created_at/by · updated_at/by        │
│ change_log (collapsed)                         │
└─────────────────────────────────────────────────┘
```

**No botón de edit** (read-only).
**Si entry `status: deprecated`:** banner amarillo arriba: "Este recurso está deprecado. Razón: {deprecated_reason}. Usa `superseded_by` si existe."

### D6. Timeline de cambios

Arriba del dashboard (antes de la tabla). Componente `<KnowledgeTimeline>` usa `recharts` sobre `_index.json.header.last_changes[]`. Gráfico simple línea: X axis fecha (últimos 30 días), Y axis cantidad de cambios. Si `last_changes` está vacío (cosa que puede pasar), mostrar placeholder "Sin cambios recientes".

**Scope mínimo:** 1 componente, 1 tipo de gráfico. Sin drill-down a cambios individuales en esta fase (deferred).

### D7. API route `GET /api/knowledge/[id]`

Para futuros usos (ej. export, embedding en mails, CatBot alternativo que no tenga `get_kb_entry` tool). Shape:

```typescript
// GET /api/knowledge/:id
// → 200 { id, path, frontmatter, body, related_resolved }
// → 404 { error: 'NOT_FOUND', id }
```

Implementación: delega a `kb-index-cache.getKbEntry(id)`. Read-only, sin auth.

### D8. Contadores globales

Sobre la timeline, row de cards con counts desde `_index.json.header.counts`:

```
┌────────────┬────────────┬────────────┬────────────┐
│ 10 CatPaws │ 5 Conn.   │ 39 Skills  │ 2 CatBrain │
├────────────┼────────────┼────────────┼────────────┤
│ 9 Emails   │ 3 Canvases│ 25 Rules   │ 10 Inc.    │
└────────────┴────────────┴────────────┴────────────┘
```

Cada card clickeable → filtra tabla por ese type/subtype. Diseño con shadcn `Card`.

### D9. Ubicación del código nuevo

- `app/src/app/knowledge/page.tsx` — server component entry
- `app/src/app/knowledge/[id]/page.tsx` — detail server component
- `app/src/app/api/knowledge/[id]/route.ts` — GET handler
- `app/src/components/knowledge/KnowledgeTable.tsx` — client component con useState para filtros
- `app/src/components/knowledge/KnowledgeDetail.tsx` — client component react-markdown wrapper
- `app/src/components/knowledge/KnowledgeTimeline.tsx` — recharts wrapper
- `app/src/components/knowledge/KnowledgeCountsBar.tsx` — count cards
- `app/src/components/knowledge/KnowledgeFilters.tsx` — filters panel (puede embed en Table si queda <200 líneas)

### D10. Navegación

Añadir entrada "Knowledge" o "Base de conocimiento" al menú principal. El planner identifica el archivo de nav (probablemente `app/src/components/layout/*.tsx` o similar) y añade link con icono (BookIcon o similar de lucide-react).

### D11. Tests obligatorios (Nyquist)

**Unit tests:**
- `KnowledgeTable` filters: type filter, subtype filter, tags AND-match, search case-insensitive, status default active.
- `KnowledgeDetail` render: markdown body, related_resolved links, deprecated banner when status='deprecated'.
- `KnowledgeTimeline`: renders from last_changes array, empty placeholder.
- `KnowledgeCountsBar`: renders 8 cards with counts from header.counts.

**Integration tests:**
- `GET /api/knowledge/[id]` devuelve 200 con shape correcto.
- `GET /api/knowledge/bogus-id` devuelve 404.
- `/knowledge` page server-renders con datos del fixture KB.

**E2E (opcional — evaluar con playwright si existe):**
- Navigate `/knowledge` → tabla carga → click row → detalle se ve.

**Regression:**
- No afecta tests existentes (nuevas rutas aisladas).

**Oracle test (pre-cierre):**
1. Arrancar Next.js dev / Docker con 154 live.
2. Navegar `http://localhost:3500/knowledge` → tabla renderiza 128 entries.
3. Aplicar filtro `type=resource subtype=catpaw` → muestra 10.
4. Click en "Operador Holded" → detalle renderiza con system_prompt, related, etc.
5. Pegar screenshot/response a `154-VERIFICATION.md`.

### D12. Requirement IDs (Plan 01 Task 1)

- **KB-23:** `/knowledge` page lista 128 recursos con filtros client-side (type, subtype, tags, audience, status, search).
- **KB-24:** `/knowledge/[id]` detail renderiza markdown + related_resolved + frontmatter metadata.
- **KB-25:** `GET /api/knowledge/[id]` devuelve frontmatter + body + related_resolved; 404 en id no existente.
- **KB-26:** Timeline de cambios (recharts) + counts bar (8 cards shadcn) consumidos desde `_index.json.header`.
- **KB-27:** Navegación principal incluye link `/knowledge`.

### Claude's Discretion

- Exacto color de badges por type/status — el planner decide respetando el theme existente.
- Si crear helper `formatRelativeTime` o usar librería (`date-fns` si está, `dayjs`, o casero).
- Orden de columnas en la tabla.
- Placeholder exacto cuando no hay entries tras filtros.
- Responsive mobile — deseable pero el planner decide scope.
- Si pone el detalle en ruta anidada o modal — preferido ruta anidada para shareable URLs.

</decisions>

<specifics>
## Specific Ideas

### UI references
- Tabla estilo "Linear issues" — limpia, densa, badges de color.
- Detalle estilo "GitHub README" — markdown bien tipado, metadata lateral o arriba.
- Timeline estilo "Vercel deployment graph" — línea con hover para ver count exacto.

### Performance
128 entries es trivial. Sin virtualización necesaria. Si el KB crece a 1000+, considerar virtualización futura (deferred).

### Accessibility
Tabla con `<table>` semántico + aria-sort en columnas ordenables. Filtros con labels. Keyboard navigation via tabindex natural.

### Shape esperado del fetch server-side

```typescript
// app/src/app/knowledge/page.tsx
import { getKbIndex } from '@/lib/services/kb-index-cache';

export default async function KnowledgePage() {
  const index = getKbIndex();
  if (!index) return <EmptyState message="KB no disponible" />;
  
  return (
    <div>
      <KnowledgeCountsBar counts={index.header.counts} />
      <KnowledgeTimeline changes={index.header.last_changes} />
      <KnowledgeTable entries={index.entries} />
    </div>
  );
}
```

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`app/src/lib/services/kb-index-cache.ts`** (Phase 152 — 408 lines) — `getKbIndex()`, `getKbEntry(id)`, `searchKb(params)`. Server-side usable directamente desde server components.
- **`react-markdown@10.1.0`** en `package.json` — renderizador estándar para el body.
- **`recharts@3.8.0`** — librería de gráficos. Usar `LineChart` para timeline.
- **`shadcn@4.0.2`** — componentes Table, Card, Badge, Input, Select ya instalados (verificar en `app/src/components/ui/` o similar).
- **`next-intl@3.26.5`** — i18n infra existe. Phase 154 usa strings en español directo (no prioridad traducir).
- **`lucide-react`** — icons probablemente. El planner confirma.

### Established Patterns

- **Routing:** `app/src/app/<feature>/page.tsx` + `[id]/page.tsx` para detalle. Ejemplos: `catflow`, `canvas`, `catbrains` todos siguen este pattern.
- **Client/server split:** server components para data fetching, client components para interactividad (sufijo `'use client'` en el top).
- **API routes:** `app/src/app/api/<feature>/[id]/route.ts` con `export async function GET(...)`.
- **Styling:** Tailwind + shadcn, dark mode via `class` strategy (verificar en `tailwind.config`).

### Integration Points

- `app/src/components/layout/*` (o similar) — menú principal que necesita nueva entrada `/knowledge`.
- `app/src/lib/services/kb-index-cache.ts` — el dashboard consume esto server-side.
- `.docflow-kb/_index.json` — fuente de datos (actualizado en tiempo real por Phase 153 hooks).
- CatBot tools `list_cat_paws` etc. ya devuelven `kb_entry` path (Phase 152) — el dashboard puede convertir ese path en link a `/knowledge/[id]` para que CatBot y UI estén alineados.

### No DB schema changes

Phase 154 es read-only sobre el KB filesystem. No toca DB.

</code_context>

<deferred>
## Deferred Ideas

- **Write UI** (editar archivos KB desde UI) — rechazado. KB es derivado, canónico en DB + hooks.
- **Edición de frontmatter desde UI** — fuera.
- **Version diff / history compare** — `change_log` se muestra pero sin UI de diff entre versiones.
- **Bulk operations** (mass archive, mass tag) — fuera. CLI `kb-sync.cjs` lo cubre.
- **Export** (download entry as .md / zip) — deseable pero deferred.
- **Semantic search con Qdrant** — PRD §8.5, futura fase.
- **Traducción inline es↔en** — PRD §8.4, deferred.
- **Mobile responsive avanzado** — target desktop first; mobile decente pero sin optimización dedicada.
- **Virtualización de tabla** (>1000 entries) — trivial sin esto hasta que el KB explote.
- **Feed RSS/JSON de cambios del KB** — útil pero no crítico.
- **Compartir entry publicly** (URL pública sin auth) — no. Todo sigue siendo interno.
- **Integración con knowledge-tools-sync tripwire** — no hay tools nuevas en Phase 154, tripwire no aplica.
- **Legacy cleanup** — Phase 155.

</deferred>

---

*Phase: 154-kb-dashboard-knowledge*
*Context gathered: 2026-04-20 (decisiones delegadas por usuario, patrón consistente Phases 150/152/153)*
