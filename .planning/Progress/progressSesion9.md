# DoCatFlow - Sesion 9: Canvas Visual — Modelo de Datos, API, Lista, Wizard y Editor (Phases 23-24)

> Funcionalidades implementadas sobre la base documentada en `progressSesion8.md`. Esta sesion inicia el milestone v5.0 "Canvas Visual de Workflows": infraestructura de datos, API CRUD completa, pagina /canvas con lista y wizard, y editor visual React Flow con 8 tipos de nodo.

---

## Indice

1. [Resumen de cambios](#1-resumen-de-cambios)
2. [Phase 23: Modelo de Datos + API CRUD](#2-phase-23-modelo-de-datos--api-crud)
3. [Phase 23: Lista de Canvas + Wizard](#3-phase-23-lista-de-canvas--wizard)
4. [Phase 24: Editor Visual React Flow](#4-phase-24-editor-visual-react-flow)
5. [Phase 24: 8 Tipos de Nodo Custom](#5-phase-24-8-tipos-de-nodo-custom)
6. [Phase 24: Auto-save, Undo/Redo, Auto-layout](#6-phase-24-auto-save-undoredo-auto-layout)
7. [Errores encontrados y corregidos](#7-errores-encontrados-y-corregidos)
8. [Archivos nuevos y modificados](#8-archivos-nuevos-y-modificados)
9. [Paquetes npm instalados](#9-paquetes-npm-instalados)

---

## 1. Resumen de cambios

### Milestone v5.0: Canvas Visual de Workflows (Phases 23-24 de 4)

| Fase | Que se construyo | Requisitos | Plans |
|------|-----------------|------------|-------|
| 23 | Modelo de datos (3 tablas), API CRUD (8 endpoints + 4 utilitarios), pagina /canvas, wizard de creacion | DATA-01..12, NAV-01..02, LIST-01..04, WIZ-01..03 (21) | 4 |
| 24 | Editor React Flow, 8 nodos custom, panel de configuracion, auto-save, undo/redo, auto-layout dagre | EDIT-01..11, NODE-01..08 (19) | 3 |
| **Total** | | **40/52** | **7** |

### Transformacion principal

DoCatFlow ahora incluye un editor de workflows visual donde el usuario puede disenar pipelines arrastrando nodos (agentes, proyectos, conectores, checkpoints, condiciones, merges) sobre un canvas infinito con React Flow, y los datos se guardan automaticamente.

---

## 2. Phase 23: Modelo de Datos + API CRUD

### 3 Tablas SQLite (`app/src/lib/db.ts`)

#### canvases
```sql
CREATE TABLE IF NOT EXISTS canvases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  emoji TEXT DEFAULT '🔄',
  mode TEXT DEFAULT 'mixed',        -- 'agents' | 'projects' | 'mixed'
  tags TEXT DEFAULT '[]',            -- JSON array
  flow_data TEXT DEFAULT '{}',       -- JSON: {nodes: [], edges: []}
  node_count INTEGER DEFAULT 1,     -- cached count for list display
  status TEXT DEFAULT 'draft',
  is_template INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

#### canvas_runs
```sql
CREATE TABLE IF NOT EXISTS canvas_runs (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL,
  status TEXT DEFAULT 'running',     -- running | waiting | completed | failed | cancelled
  node_states TEXT DEFAULT '{}',     -- JSON: {nodeId: {status, output, error}}
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  total_tokens INTEGER DEFAULT 0,
  estimated_cost REAL DEFAULT 0,
  FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE
)
```

#### canvas_templates
```sql
CREATE TABLE IF NOT EXISTS canvas_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  mode TEXT DEFAULT 'mixed',
  flow_data TEXT NOT NULL,           -- JSON template
  preview_svg TEXT DEFAULT '',
  times_used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

### API CRUD — 8 endpoints core

| Ruta | Metodo | Que hace |
|------|--------|---------|
| `/api/canvas` | GET | Lista canvas (sin flow_data, incluye node_count) |
| `/api/canvas` | POST | Crea canvas con nodo START por defecto |
| `/api/canvas/[id]` | GET | Canvas completo con flow_data |
| `/api/canvas/[id]` | PATCH | Update parcial, auto-calcula node_count si flow_data cambia |
| `/api/canvas/[id]` | DELETE | Elimina canvas + runs (CASCADE) |
| `/api/canvas/[id]/validate` | POST | Validacion DAG: ciclos (DFS), nodo START, nodo terminal, edges validos |
| `/api/canvas/[id]/thumbnail` | POST | Genera SVG 200x120 de preview |
| `/api/canvas/templates` | GET | Lista todas las plantillas |
| `/api/canvas/from-template` | POST | Crea canvas desde plantilla con IDs nuevos (idMap), incrementa times_used |

### Utilidades

- **generateId()** (`app/src/lib/utils.ts`): Generador de IDs cortos `Math.random().toString(36).slice(2, 11)` — NO usa `crypto.randomUUID()` porque requiere HTTPS.
- **Validacion DAG** (`validate/route.ts`): 4 checks — tiene START, tiene nodo terminal (OUTPUT o sin edges de salida), edges apuntan a nodos existentes, deteccion de ciclos via DFS.
- **Thumbnail SVG** (`thumbnail/route.ts`): SVG 200x120 con nodos como circulos de colores por tipo y edges como lineas.

---

## 3. Phase 23: Lista de Canvas + Wizard

### Navegacion

- **Sidebar** (`sidebar.tsx`): Enlace "Canvas" con icono `Workflow` entre "Tareas" y "Conectores"
- **Breadcrumb** (`breadcrumb.tsx`): Label `'canvas': 'Canvas'` en ROUTE_LABELS

### Pagina /canvas (`app/src/app/canvas/page.tsx`)

#### Pestanas de filtro
5 tabs con conteos: Todos | Agentes | Proyectos | Mixtos | Plantillas

- Filtros por `canvas.mode` para las primeras 4
- Plantillas: conteo desde `/api/canvas/templates` (tabla `canvas_templates`, no `canvases.is_template`)

#### Grid de cards (`app/src/components/canvas/canvas-card.tsx`)
Cada card muestra:
- Miniatura SVG (via thumbnail API)
- Emoji + nombre
- Badge de modo (Agentes=violet, Proyectos=blue, Mixto=amber)
- Conteo de nodos (`{canvas.node_count || 0} nodos`)
- Botones: Editar (navega a `/canvas/{id}`) y Eliminar (con confirmacion)

#### Empty state
Cuando no hay canvas: dashed border, icono Workflow, "No hay canvas creados", boton "Crear Canvas", link "o preguntale a CatBot".

#### Seccion Plantillas
Cards de templates con boton "Usar" que abre el wizard directamente en paso 2 con la plantilla pre-seleccionada.

### Wizard de creacion (`app/src/components/canvas/canvas-wizard.tsx`)

Dialog de 2 pasos:

**Paso 1** — Seleccion de tipo (grid 2x2):
| Tipo | Icono | Color | Descripcion |
|------|-------|-------|-------------|
| Agentes | Bot | violet | Canvas con nodos de agentes |
| Proyectos | FolderKanban | blue | Canvas con nodos de proyectos |
| Mixto | Shuffle | amber | Combina agentes y proyectos |
| Desde Plantilla | Layout | emerald | Usar plantilla existente |

**Paso 2** — Detalles:
- Nombre (requerido)
- Descripcion
- Emoji picker (8 opciones)
- Tags (input con Enter para agregar)
- Si modo=plantilla: lista de plantillas disponibles antes del formulario

**Flujo "Usar" desde Plantillas:**
`setSelectedTemplateForWizard(tmpl.id)` → wizard abre en paso 2 → `useEffect` auto-avanza con `initialMode='template'` + `initialTemplateId` → `fetchTemplates(preSelectId)` pre-selecciona la plantilla.

**Creacion:**
- Normal: POST `/api/canvas` → redirect a `/canvas/{id}`
- Template: POST `/api/canvas/from-template` → redirect a `/canvas/{id}`

---

## 4. Phase 24: Editor Visual React Flow

### Paquetes instalados

| Paquete | Version | Uso |
|---------|---------|-----|
| `@xyflow/react` | 12.x | React Flow v12 (NO el deprecated `reactflow`) |
| `@dagrejs/dagre` | latest | Fork mantenido de dagre para auto-layout |
| `@types/dagre` | latest | Types para dagre |
| `html-to-image` | 1.11.11 | PINNED — versiones posteriores tienen bug de export |

### Pagina del editor (`app/src/app/canvas/[id]/page.tsx`)

SSR-safe dynamic import:
```typescript
const CanvasEditor = dynamic(
  () => import('@/components/canvas/canvas-editor').then(m => m.CanvasEditor),
  { ssr: false }
);
```

### Canvas Editor Shell (`app/src/components/canvas/canvas-editor.tsx`)

~500+ lineas. Componente principal del editor.

#### Estructura
```
ReactFlowProvider
  └─ CanvasShell (inner component)
       ├─ CanvasToolbar (sticky top h-16)
       ├─ div.flex-1
       │    ├─ NodePalette (80px left panel)
       │    └─ ReactFlow (canvas infinito)
       │         ├─ MiniMap
       │         └─ Controls (zoom)
       └─ NodeConfigPanel (collapsible bottom)
```

#### Configuracion critica de React Flow
- `"use client"` directive obligatoria
- `NODE_TYPES` como constante a nivel de modulo (NUNCA dentro del componente — causa remount)
- `ReactFlowProvider` envuelve toolbar + palette + canvas juntos
- Container con `h-[calc(100vh-64px)]`
- CSS: Tailwind directives PRIMERO, luego `@xyflow/react/dist/style.css`

#### Canvas features
- Fondo zinc-950 con grid de puntos (`variant={BackgroundVariant.Dots}`)
- Pan/zoom infinito
- MiniMap en esquina inferior derecha
- Controles de zoom
- Multi-select con Shift+click
- Delete con Backspace/Delete

#### Validacion de conexiones
`isValidConnection`: DFS cycle detection que bloquea edges que crearian ciclos.

#### Drag & Drop de paleta
`onDragOver` (preventDefault) + `onDrop` (lee `application/reactflow`, crea nodo en posicion del drop con `screenToFlowPosition`).

### Toolbar (`app/src/components/canvas/canvas-toolbar.tsx`)

Barra sticky h-16:
- **Izquierda**: Boton back (ArrowLeft) → `/canvas`
- **Centro**: Input editable transparente con nombre del canvas (blur-to-save via PATCH)
- **Centro**: Status de guardado: amber "Sin guardar" → violet pulse "Guardando..." → green "Guardado"
- **Centro**: Botones Undo2/Redo2 (disabled cuando historial vacio)
- **Derecha**: Boton "Auto-organizar" + boton "Ejecutar" (violet)

### Paleta de nodos (`app/src/components/canvas/node-palette.tsx`)

Panel izquierdo de 80px con 8 nodos draggables:
- Cada nodo es un div con `draggable` + `onDragStart` que pone `application/reactflow` en dataTransfer
- Tooltips con `@base-ui/react` (prop `delay`, no `delayDuration`)

---

## 5. Phase 24: 8 Tipos de Nodo Custom

Cada nodo es un componente React con handles (puntos de conexion), icono, color y forma especificos.

### Tabla de nodos

| Tipo | Archivo | Forma | Color | Icono | Handles |
|------|---------|-------|-------|-------|---------|
| START | `start-node.tsx` | Circulo | Emerald | Play | 1 source (derecha) |
| AGENT | `agent-node.tsx` | Rectangulo | Violet | Bot | 1 target + 1 source |
| PROJECT | `project-node.tsx` | Rectangulo | Blue | FolderKanban | 1 target + 1 source |
| CONNECTOR | `connector-node.tsx` | Rectangulo | Orange | Plug | 1 target + 1 source, badge de modo |
| CHECKPOINT | `checkpoint-node.tsx` | Rectangulo | Amber | UserCheck | 1 target + 2 source nombrados (`approved`, `rejected`) |
| MERGE | `merge-node.tsx` | Rectangulo | Cyan | GitMerge | 2-5 targets nombrados (`target-1..5`) + 1 source, botones +/- |
| CONDITION | `condition-node.tsx` | Rectangulo | Yellow | GitBranch | 1 target + 2 source nombrados (`yes`, `no`) |
| OUTPUT | `output-node.tsx` | Pill | Emerald/zinc | Flag | 1 target (izquierda), sin source |

### Panel de configuracion (`app/src/components/canvas/node-config-panel.tsx`)

~426 lineas. Panel inferior colapsable que se abre al seleccionar un nodo.

Formulario especifico por tipo:

| Tipo | Campos |
|------|--------|
| AGENT | Selector de agente (desde `/api/agents`), modelo LLM, system prompt, max tokens |
| PROJECT | Selector de proyecto (desde `/api/projects`), fuente RAG, top_k |
| CONNECTOR | Selector de conector (desde `/api/connectors`), URL override, headers |
| CHECKPOINT | Instrucciones de revision, auto-approve toggle |
| MERGE | Estrategia (concatenar/resumir), separador |
| CONDITION | Condicion (texto que el LLM evalua como yes/no) |
| OUTPUT | Formato (markdown/json/text), instrucciones de formato |
| START | Input del pipeline (texto/prompt inicial) |

---

## 6. Phase 24: Auto-save, Undo/Redo, Auto-layout

### Auto-save con debounce de 3 segundos

- `scheduleAutoSave`: `useCallback` con deps vacias + `canvasIdRef` para closure estable
- `saveTimer` ref: `clearTimeout` + nuevo `setTimeout(3000ms)`
- PATCH `/api/canvas/{id}` con `{ flow_data: { nodes, edges } }`
- Filtro: cambios de solo seleccion (`changes.every(c => c.type === 'select')`) no disparan auto-save
- Status: amber "Sin guardar" → violet "Guardando..." → green "Guardado"
- Strips `executionStatus`/`executionOutput` de node data antes del PATCH

### Undo/Redo con snapshots

- Arrays `past` y `future` (max 30 snapshots)
- `takeSnapshot()`: guarda `{nodes, edges}` en `past` antes de operaciones estructurales
- No guarda en movimientos de posicion (solo drag final via `onNodeDragStop`)
- Ctrl+Z: undo (pop past, push current to future)
- Ctrl+Shift+Z / Ctrl+Y: redo (pop future, push current to past)
- Botones Undo2/Redo2 en toolbar, disabled cuando historial vacio

### Auto-layout dagre

- Boton "Auto-organizar" en toolbar
- `applyDagreLayout`: crea grafo dagre con `rankdir: 'LR'`, `ranksep: 200`, `nodesep: 100`
- Dimensiones por tipo de nodo via `NODE_DIMENSIONS` map
- Aplica posiciones calculadas a todos los nodos
- `takeSnapshot` antes de layout para poder deshacer

---

## 7. Errores encontrados y corregidos

### Error 1: Tooltip delayDuration vs delay
Componente `@base-ui/react` Tooltip usa prop `delay`, no `delayDuration` como shadcn.
**Fix**: Cambiado a `delay` en node-palette.tsx.

### Error 2: IsValidConnection type
`IsValidConnection<Edge>` callback acepta `Edge|Connection`, no solo `Connection`.
**Fix**: Agregado null guard para `source`/`target`.

### Error 3: Stub de node-config-panel
Plan 24-03 creo un stub temporal de `node-config-panel.tsx` para build compatibility; Plan 24-02 (en paralelo) lo reemplazo con la implementacion completa de 426 lineas.
**Resolucion**: Orden de ejecucion correcto — el archivo final es el completo.

### Error 4: projects API response format
`/api/projects` devuelve `{ data: [...], pagination: {...} }` pero el config panel llamaba `.map()` directamente.
**Fix**: `fetch('/api/projects').then(r => r.json()).then(d => setProjects(d.data || []))`.

---

## 8. Archivos nuevos y modificados

### Archivos nuevos

| Archivo | Lineas | Descripcion |
|---------|--------|-------------|
| `app/src/app/canvas/page.tsx` | ~260 | Pagina lista de canvas con tabs, cards, empty state, wizard |
| `app/src/app/canvas/[id]/page.tsx` | ~20 | Pagina editor con dynamic import SSR-safe |
| `app/src/components/canvas/canvas-editor.tsx` | ~500+ | Shell principal React Flow con drag&drop, validacion, polling |
| `app/src/components/canvas/canvas-toolbar.tsx` | ~150 | Toolbar con nombre editable, save status, undo/redo, ejecutar |
| `app/src/components/canvas/node-palette.tsx` | ~120 | Panel izquierdo con 8 nodos draggables |
| `app/src/components/canvas/node-config-panel.tsx` | ~426 | Panel inferior con formularios por tipo de nodo |
| `app/src/components/canvas/canvas-card.tsx` | ~100 | Card de canvas para la lista |
| `app/src/components/canvas/canvas-wizard.tsx` | ~280 | Dialog wizard 2 pasos para crear canvas |
| `app/src/components/canvas/nodes/start-node.tsx` | ~40 | Nodo START (circulo emerald) |
| `app/src/components/canvas/nodes/agent-node.tsx` | ~50 | Nodo AGENT (rect violet) |
| `app/src/components/canvas/nodes/project-node.tsx` | ~50 | Nodo PROJECT (rect blue) |
| `app/src/components/canvas/nodes/connector-node.tsx` | ~50 | Nodo CONNECTOR (rect orange) |
| `app/src/components/canvas/nodes/checkpoint-node.tsx` | ~60 | Nodo CHECKPOINT (rect amber, 2 outputs nombrados) |
| `app/src/components/canvas/nodes/merge-node.tsx` | ~80 | Nodo MERGE (rect cyan, 2-5 inputs, botones +/-) |
| `app/src/components/canvas/nodes/condition-node.tsx` | ~60 | Nodo CONDITION (rect yellow, outputs yes/no) |
| `app/src/components/canvas/nodes/output-node.tsx` | ~40 | Nodo OUTPUT (pill emerald/zinc) |
| `app/src/app/api/canvas/route.ts` | ~80 | GET lista + POST crear canvas |
| `app/src/app/api/canvas/[id]/route.ts` | ~90 | GET/PATCH/DELETE canvas individual |
| `app/src/app/api/canvas/[id]/validate/route.ts` | ~60 | Validacion DAG con DFS |
| `app/src/app/api/canvas/[id]/thumbnail/route.ts` | ~50 | Generacion SVG 200x120 |
| `app/src/app/api/canvas/templates/route.ts` | ~20 | GET todas las plantillas |
| `app/src/app/api/canvas/from-template/route.ts` | ~50 | Crear canvas desde plantilla |

### Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `app/src/lib/db.ts` | +3 tablas (canvases, canvas_runs, canvas_templates) + ALTER TABLE node_count |
| `app/src/lib/utils.ts` | +generateId() |
| `app/src/components/layout/sidebar.tsx` | +Canvas nav item con Workflow icon |
| `app/src/components/layout/breadcrumb.tsx` | +'canvas': 'Canvas' en ROUTE_LABELS |
| `app/src/app/globals.css` | +@xyflow/react/dist/style.css import |

### Commits

```
eddd648 feat(23-01): add canvas tables to db.ts and generateId to utils.ts
62ee6c3 feat(23-01): create canvas CRUD API routes
7440b46 feat(23-02): add canvas validate and thumbnail API routes
6c728c9 feat(23-02): add canvas templates and from-template API routes
22d8be3 feat(23-03): add sidebar link, breadcrumb label, canvas card and list page
6368f4b feat(23-03): create canvas creation wizard Dialog
227ca90 feat(23-04): add node_count column and display in canvas cards (LIST-01)
fdf511f feat(23-04): fix Plantillas tab count and wire Usar button to wizard (LIST-02, LIST-03)
7c34342 feat(24-01): install React Flow packages, CSS config, and canvas editor shell
47b8f13 feat(24-01): add canvas toolbar and 8-type node palette
c48db32 feat(24-02): create all 8 custom node components with handles and shapes
c5d9717 feat(24-03): add auto-save with 3s debounce and save status indicator
00d63c0 feat(24-03): add undo/redo snapshots, dagre auto-layout
```

---

## 9. Paquetes npm instalados

```bash
cd app && npm install @xyflow/react @dagrejs/dagre @types/dagre html-to-image@1.11.11
```

| Paquete | Razon |
|---------|-------|
| `@xyflow/react` | React Flow v12 — canvas infinito, nodos, edges, drag&drop |
| `@dagrejs/dagre` | Auto-layout de grafos dirigidos (boton "Auto-organizar") |
| `@types/dagre` | TypeScript types para dagre |
| `html-to-image@1.11.11` | Captura de thumbnail (PINNED — versiones posteriores tienen bug) |

### Restricciones criticas de React Flow

1. `"use client"` + `next/dynamic({ ssr: false })` en la pagina del editor
2. `nodeTypes` como constante a nivel de modulo — NUNCA dentro del cuerpo del componente
3. `ReactFlowProvider` debe envolver toolbar + palette + canvas juntos
4. Container con altura explicita: `h-[calc(100vh-64px)]`
5. Orden de CSS en globals.css: directivas Tailwind PRIMERO, luego `@xyflow/react/dist/style.css`
