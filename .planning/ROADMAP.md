# Roadmap: DoCatFlow v5.0

**Milestone:** Canvas Visual de Workflows
**Phases:** 4 (phases 23-26, continuing from v4.0)
**Requirements:** 52 active
**Granularity:** Standard

---

## Phases

- [x] **Phase 23: Modelo de Datos + API CRUD + Lista + Wizard** — Infraestructura de canvas: tablas, API completa, pagina /canvas con lista de cards y wizard de creacion (completed 2026-03-12)
- [ ] **Phase 24: Editor Visual + 8 Tipos de Nodo** — Editor React Flow con paleta, canvas infinito, nodos custom, auto-save, undo/redo, auto-layout
- [ ] **Phase 25: Motor de Ejecucion Visual** — Ejecucion DAG con estados por nodo, edges animados, checkpoints interactivos, cancelacion
- [ ] **Phase 26: Templates + Modos de Canvas** — 4 templates seed, filtrado de paleta por modo, cobertura completa de los 3 modos

---

## Phase Details

### Phase 23: Modelo de Datos + API CRUD + Lista + Wizard
**Goal**: El usuario puede ver, crear, nombrar y eliminar canvas desde una pagina dedicada con cards visuales y un wizard de 2 pasos
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07, DATA-08, DATA-09, DATA-10, DATA-11, DATA-12, NAV-01, NAV-02, LIST-01, LIST-02, LIST-03, LIST-04, WIZ-01, WIZ-02, WIZ-03
**Success Criteria** (what must be TRUE):
  1. El sidebar muestra enlace "Canvas" con icono Workflow entre Tareas y Conectores
  2. La pagina /canvas carga con grid de cards — cada card muestra miniatura SVG, nombre, emoji, badge de modo, conteo de nodos y botones de accion
  3. El boton "+ Nuevo" abre un wizard de 2 pasos: seleccion de tipo de canvas (Agentes/Proyectos/Mixto/Desde Plantilla) seguido de nombre, descripcion, emoji y tags
  4. Al completar el wizard, el canvas se crea y el usuario es redirigido al editor
  5. Las pestanas de filtro (Todos, Agentes, Proyectos, Mixtos, Plantillas) muestran conteos correctos y filtran los resultados
  6. Cuando no hay canvas creados, se muestra un empty state con boton de crear y link a CatBot
**Plans**: 4 plans
Plans:
- [x] 23-01-PLAN.md — Data model (3 tables) + core CRUD API (GET list, POST create, GET/PATCH/DELETE by id)
- [x] 23-02-PLAN.md — Utility API routes (validate, thumbnail, templates, from-template)
- [x] 23-03-PLAN.md — Navigation + list page + creation wizard
- [x] 23-04-PLAN.md — Gap closure: node_count display, Plantillas tab count, Usar button wiring (LIST-01..03)

### Phase 24: Editor Visual + 8 Tipos de Nodo
**Goal**: El usuario puede disenar pipelines visuales arrastrando nodos, conectandolos, configurando sus propiedades, y el canvas se guarda automaticamente
**Depends on**: Phase 23
**Requirements**: EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05, EDIT-06, EDIT-07, EDIT-08, EDIT-09, EDIT-10, EDIT-11, NODE-01, NODE-02, NODE-03, NODE-04, NODE-05, NODE-06, NODE-07, NODE-08
**Success Criteria** (what must be TRUE):
  1. La pagina /canvas/{id} carga el editor React Flow con fondo zinc-950, grilla de puntos y canvas infinito con pan/zoom
  2. El panel lateral izquierdo muestra los 7 tipos de nodo como iconos draggables; arrastrar uno al canvas lo crea en esa posicion
  3. Conectar el handle de output de un nodo al handle de input de otro crea un edge; la conexion se bloquea si generaria un ciclo
  4. Seleccionar un nodo abre el panel de configuracion inferior con formulario especifico por tipo (selector de agente para AGENT, selector de proyecto para PROJECT, etc.)
  5. El indicador en la toolbar muestra "Guardando..." al editar y "Guardado" tras 3 segundos sin cambios
  6. Ctrl+Z deshace la ultima accion y Ctrl+Shift+Z la rehace; el boton "Auto-organizar" reordena los nodos con layout dagre
**Plans**: 3 plans
Plans:
- [x] 24-01-PLAN.md — Install React Flow packages, CSS config, editor page shell with toolbar, palette, canvas, minimap, zoom controls, connection validation, delete/multi-select (completed 2026-03-12)
- [x] 24-02-PLAN.md — All 8 custom node type components (START, AGENT, PROJECT, CONNECTOR, CHECKPOINT, MERGE, CONDITION, OUTPUT) + node configuration panel (completed 2026-03-12)
- [x] 24-03-PLAN.md — Auto-save with 3s debounce, undo/redo with Ctrl+Z/Ctrl+Shift+Z, dagre auto-layout (completed 2026-03-12)

### Phase 25: Motor de Ejecucion Visual
**Goal**: El usuario puede ejecutar un canvas y observar en tiempo real como cada nodo cambia de estado, aprobar o rechazar checkpoints, y ver el resultado final
**Depends on**: Phase 24
**Requirements**: EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05, EXEC-06, EXEC-07, EXEC-08, EXEC-09, EXEC-10, EXEC-11, EXEC-12, EXEC-13
**Success Criteria** (what must be TRUE):
  1. Al pulsar "Ejecutar", el canvas entra en modo read-only, los nodos no se pueden mover ni editar, y la barra de toolbar muestra "Ejecutando paso X/Y"
  2. Los nodos cambian de color segun su estado: violeta pulsante mientras ejecutan, esmeralda con check al completar, rojo con X si fallan, ambar con reloj si esperan checkpoint
  3. Los edges que conectan nodos en ejecucion se animan con stroke violet
  4. Cuando la ejecucion alcanza un nodo CHECKPOINT, aparece un dialog con el output anterior renderizado y botones Aprobar/Rechazar; el flujo se pausa hasta la decision del usuario
  5. El boton "Cancelar" detiene la ejecucion en curso y los nodos no ejecutados quedan en estado pendiente
  6. Al completar la ejecucion, todos los nodos estan verdes, el output final es expandible en la toolbar, y se muestran stats de tiempo, tokens y costo
**Plans**: TBD

### Phase 26: Templates + Modos de Canvas
**Goal**: El usuario puede crear canvas desde 4 templates predefinidos y la paleta se filtra segun el modo del canvas
**Depends on**: Phase 25
**Requirements**: TMPL-01, TMPL-02, TMPL-03, MODE-01, MODE-02
**Success Criteria** (what must be TRUE):
  1. La seccion "Plantillas" en /canvas muestra 4 cards con preview SVG: Propuesta comercial, Doc tecnica, Research+sintesis, Pipeline+conector
  2. Al hacer clic en "Usar" en una plantilla, se abre el wizard paso 2 con nombre/descripcion; al confirmar, el canvas creado tiene todos los nodos y edges de la plantilla con IDs nuevos
  3. Un canvas en modo "Agentes" muestra en la paleta solo nodos Agent, Checkpoint, Merge, Condition; en modo "Proyectos" solo Project, Merge, Condition; en modo "Mixto" todos los tipos
  4. El modo del canvas es visible en el badge de la card en la lista y no cambia tras la creacion
**Plans**: TBD

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 23. Modelo de Datos + API CRUD + Lista + Wizard | 4/4 | Complete    | 2026-03-12 |
| 24. Editor Visual + 8 Tipos de Nodo | 0/3 | Not started | - |
| 25. Motor de Ejecucion Visual | 0/? | Not started | - |
| 26. Templates + Modos de Canvas | 0/? | Not started | - |

---

## Dependency Chain

```
Phase 23 (Data Model + CRUD + List + Wizard)
  └→ Phase 24 (Canvas Editor + 8 Node Types)
       └→ Phase 25 (Execution Engine)
            └→ Phase 26 (Templates + Modes)
```

Sequential — each phase depends on the previous. Phase 23 can start immediately.

---

## Coverage

| Requirement | Phase |
|-------------|-------|
| DATA-01 | 23 |
| DATA-02 | 23 |
| DATA-03 | 23 |
| DATA-04 | 23 |
| DATA-05 | 23 |
| DATA-06 | 23 |
| DATA-07 | 23 |
| DATA-08 | 23 |
| DATA-09 | 23 |
| DATA-10 | 23 |
| DATA-11 | 23 |
| DATA-12 | 23 |
| NAV-01 | 23 |
| NAV-02 | 23 |
| LIST-01 | 23 |
| LIST-02 | 23 |
| LIST-03 | 23 |
| LIST-04 | 23 |
| WIZ-01 | 23 |
| WIZ-02 | 23 |
| WIZ-03 | 23 |
| EDIT-01 | 24 |
| EDIT-02 | 24 |
| EDIT-03 | 24 |
| EDIT-04 | 24 |
| EDIT-05 | 24 |
| EDIT-06 | 24 |
| EDIT-07 | 24 |
| EDIT-08 | 24 |
| EDIT-09 | 24 |
| EDIT-10 | 24 |
| EDIT-11 | 24 |
| NODE-01 | 24 |
| NODE-02 | 24 |
| NODE-03 | 24 |
| NODE-04 | 24 |
| NODE-05 | 24 |
| NODE-06 | 24 |
| NODE-07 | 24 |
| NODE-08 | 24 |
| EXEC-01 | 25 |
| EXEC-02 | 25 |
| EXEC-03 | 25 |
| EXEC-04 | 25 |
| EXEC-05 | 25 |
| EXEC-06 | 25 |
| EXEC-07 | 25 |
| EXEC-08 | 25 |
| EXEC-09 | 25 |
| EXEC-10 | 25 |
| EXEC-11 | 25 |
| EXEC-12 | 25 |
| EXEC-13 | 25 |
| TMPL-01 | 26 |
| TMPL-02 | 26 |
| TMPL-03 | 26 |
| MODE-01 | 26 |
| MODE-02 | 26 |

**Total mapped: 52/52**

---

## Technical Notes (for plan-phase)

### npm packages to install
- `@xyflow/react` — React Flow v12 (NOT deprecated `reactflow`)
- `@dagrejs/dagre` — maintained fork of dagre for auto-layout
- `@types/dagre` — separate types package
- `html-to-image@1.11.11` — PINNED exact version (later versions have export bug)

### React Flow critical constraints (Phase 24)
- `"use client"` directive + `next/dynamic({ ssr: false })` on canvas editor component
- `nodeTypes` must be a module-level constant — NEVER defined inside component body
- `ReactFlowProvider` must wrap toolbar + palette + canvas together
- Canvas container must have explicit height: `h-[calc(100vh-64px)]`
- CSS import order in globals.css: Tailwind directives FIRST, then `@xyflow/react/dist/style.css`
- Auto-save debounce uses `useRef` timer pattern, not useState

### Architecture decisions
- `flow_data` in canvases table stores layout JSON — NEVER mutated during execution
- Execution state lives in `canvas_runs` table (node_states JSON per run)
- `canvas-executor.ts` mirrors `task-engine.ts` pattern — topological sort (Kahn's algorithm)
- fire-and-forget execution, client polls at 2s intervals
- `generateId()` for all node/edge IDs — NOT `crypto.randomUUID()` (requires HTTPS)
- All API routes: `export const dynamic = 'force-dynamic'`
- All env vars: `process['env']['VARIABLE']` bracket notation
- All UI text in Spanish

---
*Roadmap created: 2026-03-12*
