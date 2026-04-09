# Phase 127: Knowledge Admin Dashboard - Research

**Researched:** 2026-04-09
**Domain:** React UI (Settings section) + Next.js API routes + SQLite queries
**Confidence:** HIGH

## Summary

Esta fase construye un dashboard de administracion del conocimiento de CatBot dentro de Settings, con 3 tabs: Learned Entries, Knowledge Gaps, y Knowledge Tree. Toda la infraestructura backend ya existe (catbot-db.ts con CRUD completo para knowledge_learned y knowledge_gaps, knowledge-tree.ts con getAllKnowledgeAreas). El trabajo es 100% frontend + API routes ligeras que exponen datos ya disponibles.

El patron a seguir es exactamente el de ModelCenterShell: componente shell con tabs horizontales en archivo dedicado bajo `components/settings/`, cada tab como componente independiente, navegacion por searchParams. La unica complejidad real es disenar las metricas SQL aggregates (COUNT, AVG) que no existen todavia en catbot-db.ts.

**Primary recommendation:** Seguir el patron ModelCenterShell (shell + tab files), reusar los CRUD existentes de catbot-db.ts, crear API routes bajo `/api/catbot/knowledge/` con endpoints para entries, gaps, stats, y tree.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Posicion: despues de CatBotSettings, antes de CatBotSecurity en settings/page.tsx
- Componente dedicado en archivo propio (settings page ya tiene ~1300 lineas)
- Import como `<CatBotKnowledge />` en settings/page.tsx
- Tabla con acciones inline para Learned Entries: columnas contenido, area, fecha, botones validar/rechazar por fila
- Sin sudo para validar/rechazar/resolver (Settings es admin-only)
- Metricas calculadas en backend con SQL aggregates
- API routes nuevas en directorio catbot/knowledge/

### Claude's Discretion
- Tab style: tabs horizontales (shadcn pattern), accordion, u otro approach
- Bulk actions (checkboxes) vs solo individual
- Rechazar: delete directo con undo toast vs dialogo confirmacion
- Organizacion staging vs validadas (sub-secciones vs filtro toggle)
- Knowledge Tree: indicador de completitud (porcentaje vs semaforo)
- Knowledge Tree: layout (grid cards vs tabla)
- Knowledge Tree: solo lectura vs click para detalle
- API routes: organizacion por recurso vs consolidada

### Deferred Ideas (OUT OF SCOPE)
- Knowledge tree editable desde UI -- FUTURE-01 (v27+)
- Auto-validacion de learned entries sin intervencion admin -- FUTURE-02
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| KADMIN-01 | En Settings existe seccion "Conocimiento de CatBot" con tabs: Learned Entries, Knowledge Gaps, Knowledge Tree | ModelCenterShell pattern (shell + tabs), insertion point at line 1325 of settings/page.tsx |
| KADMIN-02 | Tab Learned Entries muestra entries staging con botones validar/rechazar, entries validadas, metricas | catbot-db.ts: getLearnedEntries(validated), setValidated(), deleteLearnedEntry(); new getKnowledgeStats() for aggregates |
| KADMIN-03 | Tab Knowledge Gaps muestra gaps reportados con filtros por area/estado, boton marcar resuelto | catbot-db.ts: getKnowledgeGaps(resolved, knowledgePath), resolveKnowledgeGap() |
| KADMIN-04 | Tab Knowledge Tree muestra las 7 areas con updated_at, conteos, indicador visual de completitud | knowledge-tree.ts: getAllKnowledgeAreas() returns all 7 KnowledgeEntry objects with tools/concepts/howto arrays |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 18 | 18.x | UI components | Project standard |
| Next.js 14 | 14.x | App Router, API routes | Project standard |
| shadcn/ui | latest | Card, Button, Badge, Tabs | Already imported in settings |
| next-intl | latest | i18n via useTranslations | Project standard |
| better-sqlite3 | latest | SQLite queries | catbot-db.ts already uses it |
| Lucide React | latest | Icons | Already in settings |
| sonner | latest | Toast notifications | Already in settings |

### No New Dependencies
This phase requires zero new npm packages. Everything needed is already installed.

## Architecture Patterns

### Recommended Project Structure
```
app/src/
├── components/settings/catbot-knowledge/
│   ├── catbot-knowledge-shell.tsx    # Shell with tabs (like model-center-shell.tsx)
│   ├── tab-learned-entries.tsx       # KADMIN-02
│   ├── tab-knowledge-gaps.tsx        # KADMIN-03
│   └── tab-knowledge-tree.tsx        # KADMIN-04
├── app/api/catbot/knowledge/
│   ├── entries/route.ts              # GET entries, PATCH validate/reject
│   ├── gaps/route.ts                 # GET gaps, PATCH resolve
│   ├── stats/route.ts               # GET aggregate metrics
│   └── tree/route.ts                # GET knowledge tree summary
└── messages/
    ├── es.json                       # settings.knowledge.* keys
    └── en.json                       # settings.knowledge.* keys
```

### Pattern 1: Shell + Tabs (ModelCenterShell clone)
**What:** Componente shell que maneja tab navigation via searchParams, renderiza tab components condicionalmente.
**When to use:** Exactamente este caso -- seccion de Settings con multiples sub-vistas.
**Example:**
```typescript
// Source: components/settings/model-center/model-center-shell.tsx (lines 11-77)
const TABS = [
  { key: 'learned', icon: BookOpen },
  { key: 'gaps', icon: AlertCircle },
  { key: 'tree', icon: Network },
] as const

type TabKey = typeof TABS[number]['key']

export function CatBotKnowledge() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const t = useTranslations('settings.knowledge')

  // Use 'ktab' param to avoid collision with ModelCenter's 'tab' param
  const tabParam = searchParams.get('ktab')
  const activeTab: TabKey = isValidTab(tabParam) ? tabParam : 'learned'

  const handleTabChange = (key: TabKey) => {
    router.replace(`/settings?ktab=${key}`, { scroll: false })
  }
  // ... identical tab bar rendering pattern
}
```

### Pattern 2: API Route with catbot-db imports
**What:** Next.js route handler that imports catbot-db.ts functions directly, no ORM layer.
**When to use:** All API routes in this phase.
**Example:**
```typescript
// Source: app/api/catbot/conversations/route.ts pattern
import { NextRequest, NextResponse } from 'next/server';
import { getLearnedEntries, setValidated, deleteLearnedEntry } from '@/lib/catbot-db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const validated = searchParams.get('validated');
  const entries = getLearnedEntries({
    validated: validated !== null ? validated === 'true' : undefined
  });
  return NextResponse.json(entries);
}
```

### Pattern 3: Fetch + useEffect + toast (Settings established pattern)
**What:** Component loads data via useEffect GET, mutates via handler POST/PATCH, shows toast feedback.
**When to use:** All three tab components.
**Example:**
```typescript
// Source: settings/page.tsx ProcessingSettings pattern (lines 19-56)
const [data, setData] = useState<T[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  fetch('/api/catbot/knowledge/entries')
    .then(res => res.json())
    .then(setData)
    .catch(() => toast.error(t('errors.loadFailed')))
    .finally(() => setLoading(false));
}, []);

const handleValidate = async (id: string) => {
  const res = await fetch('/api/catbot/knowledge/entries', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, action: 'validate' }),
  });
  if (res.ok) {
    toast.success(t('entries.validated'));
    // Refetch or optimistic update
  }
};
```

### Anti-Patterns to Avoid
- **Importing catbot-db.ts in client components:** Server-only module with better-sqlite3. Types must be duplicated in client components (same as tab-resumen.tsx pattern).
- **Using 'tab' searchParam:** Already used by ModelCenterShell. Use 'ktab' or similar to avoid collision.
- **Creating getCatbotStats in catbot-db.ts as a single monolithic function:** Better to expose targeted SQL queries in the API route directly, or add small focused helper functions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tab navigation | Custom state + conditional rendering | searchParams-based tabs (ModelCenterShell pattern) | URL-addressable, browser back works, consistent with existing UX |
| Data tables | Custom div-based table | HTML table with Tailwind styling | Settings page already uses simple tables, no need for react-table |
| Toast feedback | Custom notification system | sonner toast (already imported) | Project standard |
| Date formatting | Manual date string manipulation | Intl.DateTimeFormat or simple helper | Consistent locale handling |
| Loading states | Custom skeleton | Loader2 spinner (Lucide, already imported) | Consistent with all Settings sections |

## Common Pitfalls

### Pitfall 1: SearchParam Collision
**What goes wrong:** Using `?tab=learned` collides with ModelCenterShell which uses `?tab=resumen`.
**Why it happens:** Both components read from the same URL searchParams.
**How to avoid:** Use a different param name like `ktab` for knowledge tabs.
**Warning signs:** Clicking a knowledge tab changes the ModelCenter tab.

### Pitfall 2: Missing `export const dynamic = 'force-dynamic'`
**What goes wrong:** API routes get pre-rendered as static at build time, return stale data.
**Why it happens:** Next.js 14 defaults to static rendering if no dynamic params detected.
**How to avoid:** Every API route file must have `export const dynamic = 'force-dynamic'` at top.
**Warning signs:** Data doesn't update after mutations.

### Pitfall 3: process.env Access
**What goes wrong:** Environment variables are undefined at runtime.
**Why it happens:** Webpack inlines `process.env.X` at build time.
**How to avoid:** Always use bracket notation: `process['env']['VARIABLE']`.
**Warning signs:** catbot-db.ts already does this correctly; just don't introduce regressions in new API routes.

### Pitfall 4: i18n Keys Missing
**What goes wrong:** Build warnings, untranslated text displayed.
**Why it happens:** Adding UI text without corresponding keys in es.json and en.json.
**How to avoid:** Add ALL text strings to both message files under `settings.knowledge.*` namespace.
**Warning signs:** Raw key paths shown in UI instead of translated text.

### Pitfall 5: Type Duplication Forgotten
**What goes wrong:** TypeScript errors or runtime shape mismatches between API response and client.
**Why it happens:** catbot-db.ts types (LearnedRow, KnowledgeGapRow) are server-only.
**How to avoid:** Duplicate interfaces in tab components (same pattern as model-center/tab-resumen.tsx line 12: "Types duplicated to avoid importing server-only module").
**Warning signs:** Import errors on `better-sqlite3` in client bundle.

## Code Examples

### SQL Aggregates for Metrics (new function needed in catbot-db.ts or API route)
```typescript
// Recommended: add to catbot-db.ts
export function getKnowledgeStats(): {
  total: number;
  staging: number;
  validated: number;
  avgAccessCount: number;
} {
  const row = catbotDb.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN validated = 0 THEN 1 ELSE 0 END) as staging,
      SUM(CASE WHEN validated = 1 THEN 1 ELSE 0 END) as validated,
      COALESCE(AVG(access_count), 0) as avgAccessCount
    FROM knowledge_learned
  `).get() as { total: number; staging: number; validated: number; avgAccessCount: number };
  return row;
}
```

### Knowledge Tree Summary (using existing getAllKnowledgeAreas)
```typescript
// In API route: app/api/catbot/knowledge/tree/route.ts
import { getAllKnowledgeAreas } from '@/lib/knowledge-tree';

export async function GET() {
  const areas = getAllKnowledgeAreas();
  const summary = areas.map(area => ({
    id: area.id,
    name: area.name,
    path: area.path,
    updated_at: area.updated_at,
    counts: {
      tools: area.tools.length,
      concepts: area.concepts.length,
      howto: area.howto.length,
      dont: area.dont.length,
      common_errors: area.common_errors.length,
      endpoints: area.endpoints.length,
      sources: area.sources.length,
    },
    // Completeness: how many of the countable arrays have at least 1 entry
    completeness: [
      area.tools.length > 0,
      area.concepts.length > 0,
      area.howto.length > 0,
      area.dont.length > 0,
      area.common_errors.length > 0,
      area.endpoints.length > 0,
      area.sources.length > 0,
    ].filter(Boolean).length / 7,
  }));
  return NextResponse.json(summary);
}
```

### Discretion Recommendations

**Tab style:** Use horizontal tabs (matching ModelCenterShell). The settings page already has this pattern established. Consistency trumps novelty. Confidence: HIGH.

**Bulk actions:** Skip bulk actions for v1. Individual validate/reject is simpler and the volume of staging entries will be low initially. Add bulk later if needed. Confidence: MEDIUM.

**Reject action:** Use delete with undo toast (sonner already supports `toast.success('Deleted', { action: { label: 'Undo', onClick: ... } })`). Faster workflow than confirmation dialog for curation tasks. Confidence: MEDIUM.

**Staging vs validated:** Sub-sections (staging first, then validated collapsed/toggleable). Admin's primary task is curation, so staging should be prominent. Confidence: MEDIUM.

**Knowledge Tree completeness:** Semaphore (green/yellow/red circles). Percentage is misleading because not all areas need all fields equally. Semaphore with 3 levels (7/7 = green, 4-6 = yellow, <4 = red) is more honest. Confidence: MEDIUM.

**Knowledge Tree layout:** Grid of cards (2-3 columns). Each area is a visual card with name, updated_at, counts, and semaphore. More scannable than a table for 7 items. Confidence: MEDIUM.

**API organization:** One route per resource (entries/, gaps/, stats/, tree/). Matches existing catbot API pattern (chat/, conversations/, search-docs/, etc.). Confidence: HIGH.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A (no dashboard existed) | ModelCenterShell tab pattern | Phase 111 (v25.1) | Established pattern for multi-tab Settings sections |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | app/vitest.config.ts |
| Quick run command | `cd ~/docflow/app && npx vitest run --reporter=verbose` |
| Full suite command | `cd ~/docflow/app && npx vitest run --reporter=verbose` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KADMIN-01 | Shell component renders 3 tabs | manual-only | Visual verification in browser | N/A |
| KADMIN-02 | Stats API returns correct aggregates | unit | `cd ~/docflow/app && npx vitest run src/app/api/catbot/knowledge/stats/route.test.ts` | Wave 0 |
| KADMIN-03 | Gaps API filters by area and resolved status | unit | `cd ~/docflow/app && npx vitest run src/app/api/catbot/knowledge/gaps/route.test.ts` | Wave 0 |
| KADMIN-04 | Tree API returns 7 areas with counts and completeness | unit | `cd ~/docflow/app && npx vitest run src/app/api/catbot/knowledge/tree/route.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd ~/docflow/app && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd ~/docflow/app && npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green + manual browser verification of 3 tabs

### Wave 0 Gaps
- [ ] API route tests require mocking catbot-db.ts and knowledge-tree.ts (server-only modules)
- [ ] Consider: API tests may be impractical due to better-sqlite3 requiring actual DB file. CatBot verification via CatBot-as-oracle (CLAUDE.md protocol) may be the primary validation path.

**Note:** Given the project's CatBot-as-oracle testing protocol (CLAUDE.md), the primary verification for this phase will be prompting CatBot to exercise the dashboard functionality. Unit tests for SQL aggregates are secondary.

## Sources

### Primary (HIGH confidence)
- `/home/deskmath/docflow/app/src/lib/catbot-db.ts` - Full CRUD for knowledge_learned and knowledge_gaps tables
- `/home/deskmath/docflow/app/src/lib/knowledge-tree.ts` - getAllKnowledgeAreas(), KnowledgeEntry type with Zod schema
- `/home/deskmath/docflow/app/src/components/settings/model-center/model-center-shell.tsx` - Tab shell pattern (77 lines)
- `/home/deskmath/docflow/app/src/app/settings/page.tsx` - Settings page structure (1363 lines), insertion point at line 1325
- `/home/deskmath/docflow/app/src/app/api/catbot/conversations/route.ts` - API route pattern with catbot-db imports
- `/home/deskmath/docflow/app/src/app/api/settings/route.ts` - Simple GET/POST API route pattern

### Secondary (MEDIUM confidence)
- CONTEXT.md mentions `getCatbotStats()` as existing pattern but it does NOT exist yet in catbot-db.ts -- must be created

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Zero new dependencies, all libraries already in project
- Architecture: HIGH - Direct clone of ModelCenterShell pattern, well-established in codebase
- Pitfalls: HIGH - All identified from existing project patterns and CLAUDE.md rules
- Discretion recommendations: MEDIUM - Based on UX judgment, not verified with user

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable -- all patterns are internal to this project)
