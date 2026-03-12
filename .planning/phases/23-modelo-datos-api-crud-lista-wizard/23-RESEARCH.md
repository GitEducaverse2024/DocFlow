# Phase 23: Modelo de Datos + API CRUD + Lista + Wizard — Research

**Researched:** 2026-03-12
**Domain:** SQLite data model, Next.js API routes, React card grid UI, 2-step Dialog wizard
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | Tabla `canvases` con id, name, description, emoji, mode, status, flow_data (JSON), thumbnail, tags, is_template, timestamps | DB pattern from db.ts; schema design in ARCHITECTURE.md |
| DATA-02 | Tabla `canvas_runs` con id, canvas_id (FK CASCADE), status, node_states (JSON), current_node_id, execution_order, total_tokens, total_duration, timestamps | Mirrors task_steps pattern; cascade on canvas delete |
| DATA-03 | Tabla `canvas_templates` con id, name, description, emoji, category, mode, nodes, edges, preview_svg, times_used | Mirrors task_templates seed pattern from db.ts |
| DATA-04 | GET /api/canvas — lista canvas con filtro por mode, status, tags. Excluye flow_data del SELECT | SELECT column list pattern; query params from API routes |
| DATA-05 | POST /api/canvas — crear canvas con nodo START por defecto. Retorna id + redirect URL | generateId() pattern; default flow_data with START node |
| DATA-06 | GET /api/canvas/{id} — canvas completo con flow_data, viewport | Full row SELECT; 404 pattern from projects/[id]/route.ts |
| DATA-07 | PATCH /api/canvas/{id} — guardar flow_data, viewport (auto-save endpoint) | Partial update pattern from projects/[id]/route.ts |
| DATA-08 | DELETE /api/canvas/{id} — eliminar canvas y runs asociados (CASCADE) | CASCADE FK on canvas_runs; mirrors DELETE projects pattern |
| DATA-09 | POST /api/canvas/{id}/validate — validar DAG (START existe, OUTPUT existe, nodos configurados, sin huérfanos, sin ciclos) | JSON parse flow_data, validation logic in API route |
| DATA-10 | POST /api/canvas/{id}/thumbnail — generar SVG miniatura desde posiciones de nodos | SVG generation from node positions JSON; no external lib |
| DATA-11 | GET /api/canvas/templates — lista templates con preview | SELECT from canvas_templates; seed on db init |
| DATA-12 | POST /api/canvas/from-template — crear canvas desde template (duplica nodos/edges con IDs nuevos) | generateId() for node/edge duplication; JSON parse/stringify |
| NAV-01 | Enlace "Canvas" en sidebar entre "Tareas" y "Conectores" con icono Workflow de Lucide | sidebar.tsx navItems array; Workflow icon from lucide-react |
| NAV-02 | Pagina /canvas con breadcrumb, page-header ("Canvas" + descripcion + boton "+ Nuevo") | breadcrumb.tsx ROUTE_LABELS; PageHeader component pattern |
| LIST-01 | Grid de cards de canvas: miniatura SVG 200x120, nombre+emoji, badge de modo, conteo de nodos, estado/ejecuciones, botones editar/ejecutar/eliminar | tasks/page.tsx card grid pattern; inline SVG thumbnail |
| LIST-02 | Filtros por pestana: Todos, Agentes, Proyectos, Mixtos, Plantillas — con conteo por categoria | Filter tab pattern from tasks/page.tsx |
| LIST-03 | Seccion "Plantillas" separada con cards de preview y boton "Usar →" | Templates section at bottom of tasks/page.tsx |
| LIST-04 | Empty state cuando 0 canvas: icono, titulo, subtitulo, boton crear, link a CatBot | Empty state dashed-border pattern from tasks/page.tsx |
| WIZ-01 | Dialog wizard paso 1: seleccion de tipo (Agentes, Proyectos, Mixto, Desde Plantilla) con cards descriptivas | shadcn Dialog + multi-step state machine; type cards |
| WIZ-02 | Dialog wizard paso 2: nombre, descripcion, emoji selector, tags — boton "Crear y abrir editor" | Input/Textarea from shadcn; emoji picker (native input or inline list); router.push on create |
| WIZ-03 | Si elige "Desde Plantilla", paso 2 muestra lista de templates para seleccionar antes del nombre | Conditional step content; fetch /api/canvas/templates on wizard open |
</phase_requirements>

---

## Summary

Phase 23 is the foundation of v5.0 Canvas. It delivers three SQLite tables, twelve API endpoints, a sidebar link, the `/canvas` list page with card grid and filters, and a 2-step creation wizard Dialog. No React Flow is introduced in this phase — the editor is Phase 24. The canvas cards will display SVG thumbnails that are generated server-side from node position JSON (stored in the `thumbnail` column), not captured via html-to-image.

The phase follows patterns already well-established in this codebase. Every element has a direct analogue: `canvases` mirrors `tasks`, `canvas_runs` mirrors `task_steps`, `canvas_templates` mirrors `task_templates`. The list page `/canvas` is structurally identical to `/tasks/page.tsx`. The 2-step wizard is a Dialog (not a full page) because canvas creation is simpler than task creation — only 2 steps vs 4 steps in the task wizard. The one genuinely new piece is the SVG thumbnail generation utility, which is pure TypeScript — no library required.

The key schema decision (confirmed in STATE.md decisions) is that `flow_data` (full React Flow JSON) is stored separately from `thumbnail` (SVG string). The list page API must SELECT only non-JSON columns (`id, name, emoji, description, mode, status, thumbnail, tags, is_template, created_at, updated_at`) — never `flow_data` — to keep list queries fast. The `canvas_runs` table uses `node_states` as a JSON TEXT column, and `execution_order` as a TEXT column storing a JSON array of node IDs in topological order.

**Primary recommendation:** Follow the tasks system 1:1 as the structural template. The wizard is a shadcn Dialog with internal step state, not a separate page. POST /api/canvas creates a canvas with a default START node embedded in `flow_data`, then returns the new canvas `id` so the frontend can redirect to `/canvas/{id}`.

---

## Standard Stack

### Core (existing — no new installs required for Phase 23)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | existing | SQLite database | Already in use throughout db.ts |
| Next.js App Router | 14 | API routes + pages | Project standard |
| shadcn/ui | existing | Dialog, Input, Textarea, Badge, Button | Already installed |
| lucide-react | existing | Workflow icon for nav | Already installed — `Workflow` icon exists |
| Tailwind CSS | existing | Styling | Project standard |

### No New Packages for Phase 23

Phase 23 does NOT require any new npm packages. `@xyflow/react`, `@dagrejs/dagre`, and `html-to-image@1.11.11` are for Phase 24 (editor). The SVG thumbnail is generated from pure TypeScript math on node positions stored in `flow_data`.

**Installation:** None required for Phase 23.

---

## Architecture Patterns

### Recommended Project Structure (new files for Phase 23)

```
app/src/
├── app/
│   ├── canvas/
│   │   └── page.tsx                    # /canvas list page (LIST-01..04, NAV-02)
│   └── api/
│       └── canvas/
│           ├── route.ts                # GET list + POST create (DATA-04, DATA-05)
│           ├── templates/
│           │   └── route.ts            # GET templates (DATA-11)
│           ├── from-template/
│           │   └── route.ts            # POST from-template (DATA-12)
│           └── [id]/
│               ├── route.ts            # GET + PATCH + DELETE (DATA-06, DATA-07, DATA-08)
│               ├── validate/
│               │   └── route.ts        # POST validate (DATA-09)
│               └── thumbnail/
│                   └── route.ts        # POST thumbnail (DATA-10)
├── components/
│   └── canvas/
│       ├── canvas-card.tsx             # Card component with SVG thumbnail
│       └── canvas-wizard.tsx           # 2-step Dialog wizard (WIZ-01..03)
└── lib/
    └── db.ts                           # Modified: add 3 tables + canvas_runs cleanup
```

**Modified files:**
- `app/src/lib/db.ts` — add `canvases`, `canvas_runs`, `canvas_templates` tables + seed + startup cleanup
- `app/src/components/layout/sidebar.tsx` — add Canvas nav item between Tareas and Conectores
- `app/src/components/layout/breadcrumb.tsx` — add `'canvas': 'Canvas'` to ROUTE_LABELS

### Pattern 1: SQLite Table Creation (db.ts)

Follow the existing pattern exactly: `CREATE TABLE IF NOT EXISTS` in `db.exec()`, followed by `ALTER TABLE` try-catch blocks for any optional columns added later.

```typescript
// Source: app/src/lib/db.ts (existing pattern)
db.exec(`
  CREATE TABLE IF NOT EXISTS canvases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    emoji TEXT DEFAULT '🔷',
    mode TEXT NOT NULL DEFAULT 'mixed',
    status TEXT DEFAULT 'idle',
    flow_data TEXT,
    thumbnail TEXT,
    tags TEXT,
    is_template INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS canvas_runs (
    id TEXT PRIMARY KEY,
    canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    node_states TEXT,
    current_node_id TEXT,
    execution_order TEXT,
    total_tokens INTEGER DEFAULT 0,
    total_duration INTEGER DEFAULT 0,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS canvas_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    emoji TEXT DEFAULT '📋',
    category TEXT,
    mode TEXT NOT NULL DEFAULT 'mixed',
    nodes TEXT,
    edges TEXT,
    preview_svg TEXT,
    times_used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
```

**Startup cleanup** — canvas_runs stuck in 'running' on server restart:
```typescript
// At db.ts init, after table creation:
try {
  db.prepare("UPDATE canvas_runs SET status = 'failed' WHERE status = 'running'").run();
} catch { /* table may not exist on first run */ }
```

### Pattern 2: Seed Pattern for canvas_templates

```typescript
// Source: db.ts seed pattern (check count, insert if 0)
{
  const tCount = (db.prepare('SELECT COUNT(*) as c FROM canvas_templates').get() as { c: number }).c;
  if (tCount === 0) {
    const now = new Date().toISOString();
    const seedTemplate = db.prepare(
      `INSERT OR IGNORE INTO canvas_templates (id, name, description, emoji, category, mode, nodes, edges, preview_svg, times_used, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    );
    // Templates are seeded in Phase 26 (TMPL-01..03), NOT in Phase 23.
    // Phase 23 seeds the table structure but no data — or seeds 0 templates.
    // The seed data is Phase 26 scope.
  }
}
```

**Important:** DATA-03 creates the `canvas_templates` TABLE in Phase 23. The 4 template seed rows (TMPL-01) are Phase 26 scope. The Phase 23 table creation enables DATA-11 and DATA-12 to work (list will be empty, from-template will 404).

### Pattern 3: API Route — GET list with column filter

```typescript
// Source: pattern from existing API routes — never SELECT flow_data for list
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode');
    const status = searchParams.get('status');

    let query = `SELECT id, name, emoji, description, mode, status, thumbnail, tags,
                 is_template, created_at, updated_at
                 FROM canvases WHERE 1=1`;
    const params: unknown[] = [];

    if (mode) { query += ' AND mode = ?'; params.push(mode); }
    if (status) { query += ' AND status = ?'; params.push(status); }

    query += ' ORDER BY updated_at DESC';

    const rows = db.prepare(query).all(...params);
    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching canvases:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

### Pattern 4: POST /api/canvas — create with default START node

```typescript
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, emoji, mode, tags } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name es obligatorio' }, { status: 400 });
    }

    const id = generateId();
    const now = new Date().toISOString();

    // Default flow_data: single START node at center
    const startNodeId = generateId();
    const defaultFlowData = JSON.stringify({
      nodes: [{
        id: startNodeId,
        type: 'start',
        position: { x: 250, y: 200 },
        data: { label: 'Inicio' }
      }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    });

    db.prepare(`
      INSERT INTO canvases (id, name, description, emoji, mode, status, flow_data, tags, is_template, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'idle', ?, ?, 0, ?, ?)
    `).run(
      id,
      name.trim(),
      description?.trim() || null,
      emoji || '🔷',
      mode || 'mixed',
      defaultFlowData,
      tags ? JSON.stringify(tags) : null,
      now, now
    );

    return NextResponse.json({ id, redirectUrl: `/canvas/${id}` }, { status: 201 });
  } catch (error) {
    console.error('Error creating canvas:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

### Pattern 5: SVG Thumbnail Generation (DATA-10)

Generate SVG from node positions — no external library. The thumbnail is stored in `canvases.thumbnail` and displayed as inline SVG or `data:image/svg+xml` on the card.

```typescript
// POST /api/canvas/{id}/thumbnail
// Body: { nodes: Array<{ id, type, position: {x,y} }> }
function generateThumbnailSvg(nodes: Array<{ id: string; type: string; position: { x: number; y: number } }>): string {
  if (!nodes || nodes.length === 0) {
    return `<svg width="200" height="120" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="120" fill="#18181b" rx="4"/>
    </svg>`;
  }

  // Normalize positions to 200x120 viewport
  const xs = nodes.map(n => n.position.x);
  const ys = nodes.map(n => n.position.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = Math.max(maxX - minX, 1);
  const rangeY = Math.max(maxY - minY, 1);
  const pad = 20;
  const W = 200, H = 120;

  const normalize = (x: number, y: number) => ({
    nx: pad + ((x - minX) / rangeX) * (W - pad * 2),
    ny: pad + ((y - minY) / rangeY) * (H - pad * 2),
  });

  const NODE_COLORS: Record<string, string> = {
    start: '#10b981',    // emerald
    agent: '#8b5cf6',    // violet
    project: '#3b82f6',  // blue
    connector: '#f97316', // orange
    checkpoint: '#f59e0b', // amber
    merge: '#06b6d4',    // cyan
    condition: '#eab308', // yellow
    output: '#10b981',   // emerald
  };

  const rects = nodes.map(n => {
    const { nx, ny } = normalize(n.position.x, n.position.y);
    const color = NODE_COLORS[n.type] || '#71717a';
    return `<rect x="${nx - 8}" y="${ny - 5}" width="16" height="10" rx="2" fill="${color}" opacity="0.8"/>`;
  }).join('\n');

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#18181b" rx="4"/>
    ${rects}
  </svg>`;
}
```

### Pattern 6: DAG Validation (DATA-09)

```typescript
// POST /api/canvas/{id}/validate
// Parses flow_data and checks: START exists, OUTPUT exists, no orphans, no cycles
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const canvas = db.prepare('SELECT flow_data FROM canvases WHERE id = ?').get(params.id) as { flow_data: string } | undefined;
  if (!canvas) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { nodes, edges } = JSON.parse(canvas.flow_data || '{"nodes":[],"edges":[]}');
  const errors: string[] = [];

  const hasStart = nodes.some((n: { type: string }) => n.type === 'start');
  const hasOutput = nodes.some((n: { type: string }) => n.type === 'output');

  if (!hasStart) errors.push('El canvas necesita un nodo Inicio (START)');
  if (!hasOutput) errors.push('El canvas necesita al menos un nodo Salida (OUTPUT)');

  // Check for orphan nodes (non-START, non-OUTPUT with no incoming edge)
  const connectedTargets = new Set(edges.map((e: { target: string }) => e.target));
  const orphans = nodes.filter((n: { id: string; type: string }) =>
    n.type !== 'start' && !connectedTargets.has(n.id)
  );
  if (orphans.length > 0) {
    errors.push(`Nodos sin conexion de entrada: ${orphans.map((n: { data?: { label?: string }; id: string }) => n.data?.label || n.id).join(', ')}`);
  }

  // Cycle check via DFS
  const hasCycle = detectCycle(nodes, edges);
  if (hasCycle) errors.push('El canvas contiene ciclos — solo se permiten DAGs');

  return NextResponse.json({ valid: errors.length === 0, errors });
}
```

### Pattern 7: 2-Step Dialog Wizard (WIZ-01..03)

The wizard is implemented as a shadcn Dialog with internal step state — NOT a separate page. This is simpler than the task wizard (which is a full page with 4 steps).

```typescript
// app/src/components/canvas/canvas-wizard.tsx
"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type WizardMode = 'agents' | 'projects' | 'mixed' | 'template';

interface CanvasWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function CanvasWizard({ open, onClose, onCreated }: CanvasWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<WizardMode | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  // ... name, description, emoji, tags state

  // Step 1: mode cards (Agentes / Proyectos / Mixto / Desde Plantilla)
  // Step 2: if mode === 'template' → template list then name/description/emoji/tags
  //         else → name/description/emoji/tags
  // Submit: POST /api/canvas or POST /api/canvas/from-template → redirect to /canvas/{id}
}
```

**Key wizard decision:** Dialog (not page). The wizard is triggered by the "+ Nuevo" button in the PageHeader. On creation, the caller (`/canvas/page.tsx`) receives the new canvas id and calls `router.push('/canvas/{id}')`.

### Pattern 8: Filter Tabs on /canvas page

```typescript
// Filter type matches requirement LIST-02
type FilterKey = 'all' | 'agents' | 'projects' | 'mixed' | 'templates';

const MODE_MAP: Record<FilterKey, string | null> = {
  all: null,
  agents: 'agents',
  projects: 'projects',
  mixed: 'mixed',
  templates: null, // filtered client-side by is_template === 1
};
```

The "Plantillas" filter tab shows `is_template === 1` rows from `canvases` table. The template section (LIST-03) fetches from `/api/canvas/templates` (the `canvas_templates` seed table, separate from user-created canvases marked `is_template`).

### Anti-Patterns to Avoid

- **SELECT flow_data in list query:** The flow_data column can be tens of kilobytes. Never include it in `GET /api/canvas`. Use a separate column list.
- **Generating thumbnail with html-to-image in Phase 23:** html-to-image is Phase 24+ only (requires the React Flow editor to be mounted). Phase 23 thumbnails are generated from pure JSON node positions via the `/thumbnail` endpoint.
- **Separate page for wizard:** The 2-step wizard fits naturally in a Dialog. A full page would require extra routing and lose context.
- **crypto.randomUUID() for canvas IDs:** Use the existing `generateId()` helper — the app runs on HTTP.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal/Dialog UI | Custom overlay + backdrop | shadcn `Dialog` | Already installed, accessible, consistent |
| Form inputs | Raw HTML inputs | shadcn `Input`, `Textarea`, `Select` | Consistent styling, already in use |
| Toast notifications | Custom toast | sonner `toast` | Already in use throughout codebase |
| UUID generation | `crypto.randomUUID()` or `Math.random()` alone | `generateId()` helper | Existing helper, HTTP-safe |
| SVG thumbnail | html-to-image, canvas capture | Pure TS SVG generation from node positions | No browser APIs needed, works in API routes |

**Key insight:** Phase 23 has zero new dependencies. All tools exist. The only genuinely new code is the SVG thumbnail generator and the DAG cycle checker — both are 20-30 lines of pure TypeScript.

---

## Common Pitfalls

### Pitfall 1: Selecting flow_data in the List Endpoint

**What goes wrong:** Including `flow_data` in the `SELECT *` for `GET /api/canvas` causes the response to balloon to megabytes as canvases accumulate nodes and configuration.

**Why it happens:** Developer uses `SELECT *` without thinking about column weights.

**How to avoid:** Explicitly list columns: `SELECT id, name, emoji, description, mode, status, thumbnail, tags, is_template, created_at, updated_at FROM canvases`.

**Warning signs:** List page load time increases with each canvas created.

### Pitfall 2: Missing `export const dynamic = 'force-dynamic'` on Canvas API Routes

**What goes wrong:** Routes that read `process['env']` variables but have no dynamic path params are prerendered as static by Next.js at build time. Returns stale/empty data in Docker.

**Why it happens:** Project-wide constraint that is easy to forget on new routes.

**How to avoid:** Every file under `app/src/app/api/canvas/` must include `export const dynamic = 'force-dynamic'` at the top, without exception.

**Warning signs:** API works in `npm run dev` but returns empty arrays or 500s in Docker.

### Pitfall 3: Wizard as a Full Page instead of Dialog

**What goes wrong:** Routing to `/canvas/new` for a 2-step wizard creates unnecessary navigation complexity and loses the `router.push` redirect pattern after creation.

**Why it happens:** The tasks wizard uses a full page (4 complex steps). Canvas wizard has only 2 simple steps.

**How to avoid:** Implement as shadcn Dialog opened from the "+ Nuevo" button. State stays local to the list page. On success, call `router.push('/canvas/{id}')`.

### Pitfall 4: canvas_runs Without Startup Cleanup

**What goes wrong:** If the server restarts while a canvas is executing, `canvas_runs.status` stays as `'running'` forever. Phase 25 cannot re-execute these canvases.

**Why it happens:** In-memory execution state is lost on restart, but DB state is not updated.

**How to avoid:** Add startup cleanup in `db.ts` immediately after canvas tables are created:
```typescript
try {
  db.prepare("UPDATE canvas_runs SET status = 'failed' WHERE status = 'running'").run();
} catch { /* ignore if table doesn't exist yet */ }
```

### Pitfall 5: Breadcrumb Missing 'canvas' Label

**What goes wrong:** `/canvas` renders the segment as `canvas` (raw) in the breadcrumb instead of `Canvas` (localized label).

**Why it happens:** `ROUTE_LABELS` in `breadcrumb.tsx` is not updated.

**How to avoid:** Add `'canvas': 'Canvas'` to `ROUTE_LABELS` in `app/src/components/layout/breadcrumb.tsx`.

### Pitfall 6: Sidebar Icon Not Available

**What goes wrong:** Using an icon name that doesn't exist in lucide-react, causing a build error.

**Why it happens:** Not checking icon availability before coding.

**How to avoid:** `Workflow` is confirmed in lucide-react (STATE.md decisions reference it). Import: `import { Workflow } from 'lucide-react'`. Add to sidebar between `ClipboardList` (Tareas) and `Plug` (Conectores).

### Pitfall 7: generateId Function Location

**What goes wrong:** Importing `generateId` from the wrong location or redefining it locally.

**Why it happens:** The function is defined locally in `tasks/new/page.tsx` and not yet extracted to a shared utility.

**How to avoid:** Define a shared `generateId()` in `app/src/lib/utils.ts` or copy the implementation locally in API routes. The implementation is:
```typescript
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
```

---

## Code Examples

### Sidebar nav item insertion (NAV-01)

```typescript
// Source: app/src/components/layout/sidebar.tsx
// Add after Tareas ({ href: '/tasks', label: 'Tareas', icon: ClipboardList })
// and before Conectores ({ href: '/connectors', label: 'Conectores', icon: Plug })
{ href: '/canvas', label: 'Canvas', icon: Workflow },
```

Add to imports: `import { ..., Workflow } from 'lucide-react';`

### Page header for /canvas (NAV-02)

```typescript
// Source: tasks/page.tsx pattern with PageHeader
<PageHeader
  title="Canvas"
  description="Diseña y ejecuta workflows visuales de agentes y proyectos."
  icon={<Workflow className="w-6 h-6" />}
  action={
    <Button
      onClick={() => setWizardOpen(true)}
      className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
    >
      <Plus className="w-4 h-4 mr-2" />
      Nuevo
    </Button>
  }
/>
```

### PATCH /api/canvas/{id} — partial update pattern

```typescript
// Source: app/src/app/api/projects/[id]/route.ts pattern
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
  if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description); }
  if (body.flow_data !== undefined) { updates.push('flow_data = ?'); values.push(body.flow_data); }
  if (body.thumbnail !== undefined) { updates.push('thumbnail = ?'); values.push(body.thumbnail); }
  if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status); }
  if (body.tags !== undefined) { updates.push('tags = ?'); values.push(body.tags ? JSON.stringify(body.tags) : null); }

  if (updates.length === 0) {
    return NextResponse.json(db.prepare('SELECT * FROM canvases WHERE id = ?').get(params.id));
  }

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(params.id);

  db.prepare(`UPDATE canvases SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return NextResponse.json({ success: true });
}
```

### from-template endpoint (DATA-12)

```typescript
// POST /api/canvas/from-template
// Body: { templateId: string, name: string, description?: string, emoji?: string }
export async function POST(request: Request) {
  const { templateId, name, description, emoji } = await request.json();
  const template = db.prepare('SELECT * FROM canvas_templates WHERE id = ?').get(templateId) as CanvasTemplate | undefined;
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const canvasId = generateId();
  const now = new Date().toISOString();

  // Duplicate nodes/edges with new IDs
  const nodes = JSON.parse(template.nodes || '[]');
  const edges = JSON.parse(template.edges || '[]');
  const idMap = new Map<string, string>();

  const newNodes = nodes.map((n: { id: string; [key: string]: unknown }) => {
    const newId = generateId();
    idMap.set(n.id, newId);
    return { ...n, id: newId };
  });

  const newEdges = edges.map((e: { id: string; source: string; target: string; [key: string]: unknown }) => ({
    ...e,
    id: generateId(),
    source: idMap.get(e.source) || e.source,
    target: idMap.get(e.target) || e.target,
  }));

  const flowData = JSON.stringify({ nodes: newNodes, edges: newEdges, viewport: { x: 0, y: 0, zoom: 1 } });

  db.prepare(`
    INSERT INTO canvases (id, name, description, emoji, mode, status, flow_data, thumbnail, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'idle', ?, ?, ?, ?)
  `).run(canvasId, name, description || null, emoji || template.emoji, template.mode, flowData, template.preview_svg || null, now, now);

  // Increment times_used
  db.prepare('UPDATE canvas_templates SET times_used = times_used + 1 WHERE id = ?').run(templateId);

  return NextResponse.json({ id: canvasId, redirectUrl: `/canvas/${canvasId}` }, { status: 201 });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Wizard as separate page (/tasks/new) | Wizard as Dialog (2 steps only) | Phase 23 decision | Simpler navigation, no extra route |
| SELECT * for list queries | Explicit column list (no flow_data) | Architecture decision | List page stays fast as canvases grow |
| crypto.randomUUID() | generateId() (Math.random-based) | Established pattern (HTTP context) | No HTTPS required |
| Single execution state table | Separate canvas_runs table (not in flow_data) | v5.0 design decision | Clean separation; flow_data never mutated during execution |

**Note on canvas_runs vs canvas_node_states:** The REQUIREMENTS.md specifies `canvas_runs` with `node_states` as a JSON TEXT column. The prior ARCHITECTURE.md research used a separate `canvas_node_states` table. The REQUIREMENTS.md spec (DATA-02) is the authoritative source — use `canvas_runs.node_states` (JSON TEXT) not a separate per-node rows table for Phase 23. The execution engine in Phase 25 will read/write this JSON column.

---

## Open Questions

1. **Emoji selector in wizard (WIZ-02)**
   - What we know: WIZ-02 requires "emoji selector" in the wizard step 2
   - What's unclear: Whether this is a simple text input, a small grid of preset emoji, or a full emoji picker library
   - Recommendation: Use a small inline grid of ~12 preset emoji relevant to workflows (similar to how task templates use a fixed emoji in db.ts). No emoji picker library needed. The user can also type an emoji directly into an input field.

2. **Tags input for canvases (WIZ-02 + DATA-01)**
   - What we know: Tags are stored as JSON TEXT in `canvases.tags`
   - What's unclear: The UI for tags — free-form text split by comma? Or pill-based tag input?
   - Recommendation: Simple comma-separated text input for Phase 23. Tags are stored as `JSON.stringify(['tag1','tag2'])`. The filter UI (LIST-02) filters by `mode`, not `tags`, so tag-based filtering is not required in Phase 23.

3. **canvas_templates in Phase 23 vs Phase 26**
   - What we know: DATA-03 creates the table (Phase 23), TMPL-01 seeds 4 templates (Phase 26)
   - What's unclear: Should Phase 23 seed any templates at all for testing?
   - Recommendation: Create the table in Phase 23 with no seed data. The list page handles empty templates gracefully (LIST-03 section simply does not render if no templates). Phase 26 adds the 4 seed templates.

---

## Validation Architecture

`workflow.nyquist_validation` is not set in `.planning/config.json` (key absent — treated as enabled).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — no test config files, no test directories in `/home/deskmath/docflow/app/` |
| Config file | None — Wave 0 gap |
| Quick run command | N/A until framework installed |
| Full suite command | N/A until framework installed |

**Note:** This is a Next.js frontend/API project. The existing codebase has no test infrastructure (no jest.config, no vitest.config, no `__tests__` directories). Given the project pattern of manual testing via browser + Docker, the practical test validation for Phase 23 is manual smoke testing of each API endpoint and the UI flows.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | canvases table created with all columns | smoke | `npm run build` (build succeeds = schema valid) | ❌ Wave 0 |
| DATA-02 | canvas_runs table with FK CASCADE | smoke | manual: create canvas, create run, delete canvas, verify cascade | ❌ Manual |
| DATA-03 | canvas_templates table created | smoke | `npm run build` | ❌ Wave 0 |
| DATA-04 | GET /api/canvas returns list without flow_data | integration | manual: curl GET /api/canvas, verify no flow_data field | ❌ Manual |
| DATA-05 | POST /api/canvas creates with START node | integration | manual: POST, verify flow_data has start node | ❌ Manual |
| DATA-06 | GET /api/canvas/{id} returns flow_data | integration | manual: GET /api/canvas/{id} | ❌ Manual |
| DATA-07 | PATCH /api/canvas/{id} updates flow_data | integration | manual: PATCH, GET, verify | ❌ Manual |
| DATA-08 | DELETE /api/canvas/{id} cascades | integration | manual: DELETE, verify runs deleted | ❌ Manual |
| DATA-09 | POST /api/canvas/{id}/validate returns errors for invalid DAG | integration | manual: POST with no START node | ❌ Manual |
| DATA-10 | POST /api/canvas/{id}/thumbnail generates SVG | integration | manual: POST, verify SVG string returned | ❌ Manual |
| DATA-11 | GET /api/canvas/templates returns empty array | smoke | manual: GET /api/canvas/templates | ❌ Manual |
| DATA-12 | POST /api/canvas/from-template returns 404 when no templates | integration | manual: POST with invalid templateId | ❌ Manual |
| NAV-01 | Canvas link appears in sidebar between Tareas and Conectores | e2e | visual inspection in browser | ❌ Manual |
| NAV-02 | /canvas loads with breadcrumb and page-header | e2e | visual inspection in browser | ❌ Manual |
| LIST-01 | Canvas cards display SVG thumbnail, name, mode badge | e2e | create canvas, navigate to /canvas | ❌ Manual |
| LIST-02 | Filter tabs show correct counts | e2e | create agents/projects/mixed canvases, check tabs | ❌ Manual |
| LIST-03 | Templates section shows cards when templates exist | e2e | Phase 26 validation | ❌ Phase 26 |
| LIST-04 | Empty state shows when no canvases exist | e2e | fresh state, navigate to /canvas | ❌ Manual |
| WIZ-01 | Wizard step 1 shows 4 type cards | e2e | click "+ Nuevo", verify cards | ❌ Manual |
| WIZ-02 | Wizard step 2 shows name/description/emoji/tags form | e2e | select mode, verify step 2 | ❌ Manual |
| WIZ-03 | Template mode shows template list in step 2 | e2e | select "Desde Plantilla" in step 1 | ❌ Phase 26 (no templates yet) |

### Sampling Rate

- **Per task commit:** `npm run build` (verifies TypeScript compiles, no broken imports)
- **Per wave merge:** `npm run build` + manual smoke test of each API endpoint
- **Phase gate:** All 21 requirements manually verified before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] No test framework installed — manual testing via browser and curl is the established project pattern
- [ ] `npm run build` serves as the primary automated validation gate
- [ ] Consider adding a simple curl test script at `scripts/test-canvas-api.sh` for repeatability

---

## Sources

### Primary (HIGH confidence)
- Existing codebase `app/src/lib/db.ts` — table creation pattern, seed pattern, startup cleanup location
- Existing codebase `app/src/app/api/projects/[id]/route.ts` — PATCH partial update pattern, DELETE CASCADE
- Existing codebase `app/src/app/tasks/page.tsx` — card grid, filter tabs, empty state, templates section
- Existing codebase `app/src/app/tasks/new/page.tsx` — wizard stepper pattern, generateId() implementation
- Existing codebase `app/src/components/layout/sidebar.tsx` — navItems array structure
- Existing codebase `app/src/components/layout/breadcrumb.tsx` — ROUTE_LABELS map
- Existing codebase `app/src/components/layout/page-header.tsx` — PageHeader component API
- `.planning/STATE.md` — locked v5.0 decisions (generateId, flow_data immutability, mode values)
- `.planning/REQUIREMENTS.md` — authoritative requirement text for DATA-01..12, NAV-01..02, LIST-01..04, WIZ-01..03
- `.planning/research/ARCHITECTURE.md` — data model design, SVG thumbnail approach
- `.planning/research/PITFALLS.md` — dynamic = force-dynamic, column SELECT, startup cleanup

### Secondary (MEDIUM confidence)
- `.planning/research/SUMMARY.md` — phase build order rationale, no new packages for Phase 23

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all patterns exist in codebase
- Architecture: HIGH — direct analogues in tasks system; verified via source code reads
- Pitfalls: HIGH — derived from existing patterns and prior research (PITFALLS.md)
- SVG thumbnail: HIGH — pure TypeScript math, no external dependencies, well-understood

**Research date:** 2026-03-12
**Valid until:** 2026-06-12 (stable — Next.js 14 + better-sqlite3 API is stable)
