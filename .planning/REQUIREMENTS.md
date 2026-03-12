# Requirements: DoCatFlow

**Defined:** 2026-03-12
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat — now with visual workflow canvas.

## v1.0 Archive

All 14 requirements completed. See milestone v1.0 archive.

## v2.0 Archive

All 48 requirements completed. See milestone v2.0 archive.

## v3.0 Archive

All 48 requirements completed. See milestone v3.0 archive.

## v4.0 Archive

All 52 requirements completed. See milestone v4.0 archive.

## v5.0 Requirements

Requirements for milestone v5.0: Canvas Visual de Workflows.

### Data Model + CRUD

- [x] **DATA-01**: Tabla `canvases` con id, name, description, emoji, mode, status, flow_data (JSON), thumbnail, tags, is_template, timestamps
- [x] **DATA-02**: Tabla `canvas_runs` con id, canvas_id (FK CASCADE), status, node_states (JSON), current_node_id, execution_order, total_tokens, total_duration, timestamps
- [x] **DATA-03**: Tabla `canvas_templates` con id, name, description, emoji, category, mode, nodes, edges, preview_svg, times_used
- [x] **DATA-04**: GET /api/canvas — lista canvas con filtro por mode, status, tags. Excluye flow_data del SELECT
- [x] **DATA-05**: POST /api/canvas — crear canvas con nodo START por defecto. Retorna id + redirect URL
- [x] **DATA-06**: GET /api/canvas/{id} — canvas completo con flow_data, viewport
- [x] **DATA-07**: PATCH /api/canvas/{id} — guardar flow_data, viewport (auto-save endpoint)
- [x] **DATA-08**: DELETE /api/canvas/{id} — eliminar canvas y runs asociados (CASCADE)
- [x] **DATA-09**: POST /api/canvas/{id}/validate — validar DAG (START existe, OUTPUT existe, nodos configurados, sin huérfanos, sin ciclos)
- [x] **DATA-10**: POST /api/canvas/{id}/thumbnail — generar SVG miniatura desde posiciones de nodos
- [x] **DATA-11**: GET /api/canvas/templates — lista templates con preview
- [x] **DATA-12**: POST /api/canvas/from-template — crear canvas desde template (duplica nodos/edges con IDs nuevos)

### Sidebar + Navegacion

- [ ] **NAV-01**: Enlace "Canvas" en sidebar entre "Tareas" y "Conectores" con icono Workflow de Lucide
- [ ] **NAV-02**: Pagina /canvas con breadcrumb, page-header ("Canvas" + descripcion + boton "+ Nuevo")

### Lista de Canvas

- [ ] **LIST-01**: Grid de cards de canvas: miniatura SVG 200x120, nombre+emoji, badge de modo, conteo de nodos, estado/ejecuciones, botones editar/ejecutar/eliminar
- [ ] **LIST-02**: Filtros por pestana: Todos, Agentes, Proyectos, Mixtos, Plantillas — con conteo por categoria
- [ ] **LIST-03**: Seccion "Plantillas" separada con cards de preview y boton "Usar →"
- [ ] **LIST-04**: Empty state cuando 0 canvas: icono, titulo, subtitulo, boton crear, link a CatBot

### Wizard de Creacion

- [ ] **WIZ-01**: Dialog wizard paso 1: seleccion de tipo (Agentes, Proyectos, Mixto, Desde Plantilla) con cards descriptivas
- [ ] **WIZ-02**: Dialog wizard paso 2: nombre, descripcion, emoji selector, tags — boton "Crear y abrir editor"
- [ ] **WIZ-03**: Si elige "Desde Plantilla", paso 2 muestra lista de templates para seleccionar antes del nombre

### Canvas Editor

- [ ] **EDIT-01**: Pagina /canvas/{id} con React Flow (@xyflow/react) — "use client" + dynamic({ ssr: false }), container h-[calc(100vh-64px)]
- [ ] **EDIT-02**: Toolbar superior sticky: boton volver, nombre editable inline, boton guardar, boton ejecutar (validado), boton settings
- [ ] **EDIT-03**: Panel lateral izquierdo (80px): paleta de nodos como iconos draggables con tooltip — 7 tipos (Agent, Project, Connector, Checkpoint, Merge, Condition, Output)
- [ ] **EDIT-04**: Canvas infinito con fondo zinc-950, grid de puntos (dots 20px gap), snap-to-grid
- [ ] **EDIT-05**: Conexion de nodos: drag de handle output a handle input, validacion (no output-output, no ciclos via isValidConnection)
- [x] **EDIT-06**: Panel inferior colapsable: configuracion del nodo seleccionado con formulario especifico por tipo
- [ ] **EDIT-07**: Minimap en esquina inferior derecha, controles de zoom (+/-/fit), indicador de zoom
- [ ] **EDIT-08**: Auto-save cada 3s con debounce (useRef timer), indicador "Guardado"/"Guardando..."/"Sin guardar"
- [ ] **EDIT-09**: Undo/Redo con Ctrl+Z / Ctrl+Shift+Z (historial de snapshots)
- [ ] **EDIT-10**: Auto-layout con dagre (@dagrejs/dagre) — boton "Auto-organizar", direccion LR, espaciado 200px H / 100px V
- [ ] **EDIT-11**: Delete nodos/edges con tecla Delete/Backspace, multi-seleccion con Shift+click o box-select

### Nodos Custom

- [x] **NODE-01**: Nodo START — circulo emerald con Play icon, 1 output handle, solo 1 por canvas, campo "Input inicial" opcional
- [x] **NODE-02**: Nodo AGENT — rectangulo violet con avatar, selector de agente, modelo editable, textarea instrucciones, toggle RAG, selector skills. 1 input + 1 output
- [x] **NODE-03**: Nodo PROJECT — rectangulo blue con icono proyecto, selector de proyecto, query RAG, limite chunks. 1 input + 1 output
- [x] **NODE-04**: Nodo CONNECTOR — rectangulo orange con emoji conector, selector conector, modo before/after, payload template. 1 input + 1 output
- [x] **NODE-05**: Nodo CHECKPOINT — rectangulo amber con icono usuario, texto instruccion revisor. 1 input + 2 outputs (Aprobado/Rechazado)
- [x] **NODE-06**: Nodo MERGE — rombo cyan con icono merge, agente sintetizador opcional, instrucciones. Multiples inputs (hasta 5) + 1 output
- [x] **NODE-07**: Nodo CONDITION — diamante yellow con icono bifurcacion, condicion en lenguaje natural o programatica. 1 input + 2 outputs (Si/No)
- [x] **NODE-08**: Nodo OUTPUT — circulo emerald/zinc con icono flag, nombre del output, formato (markdown/json/plain). 1 input, 0 outputs

### Ejecucion Visual

- [ ] **EXEC-01**: POST /api/canvas/{id}/execute — crear canvas_run, ejecutar DAG con topological sort, fire-and-forget
- [ ] **EXEC-02**: GET /api/canvas/{id}/run/{runId}/status — estado de ejecucion: node_states, current_node_id, elapsed, tokens
- [ ] **EXEC-03**: canvas-executor.ts: ejecutor DAG con dispatch por tipo de nodo (AGENT->LLM, PROJECT->RAG, CONNECTOR->fetch, MERGE->combinar, CONDITION->evaluar)
- [ ] **EXEC-04**: Nodos cambian color segun estado: pendiente(zinc), ejecutando(violet+pulse), completado(emerald+check), fallido(red+x), esperando(amber+reloj)
- [ ] **EXEC-05**: Edges animados durante ejecucion (animated=true, stroke violet)
- [ ] **EXEC-06**: Barra de progreso en toolbar: "Ejecutando paso X/Y · tiempo"
- [ ] **EXEC-07**: POST /api/canvas/{id}/run/{runId}/checkpoint/{nodeId}/approve — aprobar checkpoint y continuar
- [ ] **EXEC-08**: POST /api/canvas/{id}/run/{runId}/checkpoint/{nodeId}/reject — rechazar con feedback
- [ ] **EXEC-09**: Dialog de checkpoint: muestra output anterior renderizado, botones aprobar/rechazar con textarea
- [ ] **EXEC-10**: POST /api/canvas/{id}/run/{runId}/cancel — cancelar ejecucion en curso
- [ ] **EXEC-11**: Resultado final: nodos verdes, output expandible, stats en toolbar (tiempo, tokens, costo), botones descargar/copiar/re-ejecutar
- [ ] **EXEC-12**: Modo read-only durante ejecucion (no se pueden mover/editar/eliminar nodos)
- [ ] **EXEC-13**: Registrar uso en usage_logs con event_type 'canvas_execution'

### Templates

- [ ] **TMPL-01**: 4 templates seed al crear tabla: Propuesta comercial, Doc tecnica, Research+sintesis, Pipeline+conector
- [ ] **TMPL-02**: Cada template con nodes/edges JSON, preview_svg, category, times_used counter
- [ ] **TMPL-03**: Al crear desde template: duplicar flow_data con generateId() para nuevos IDs de nodos/edges

### Canvas Modes

- [ ] **MODE-01**: 3 modos de canvas: agents, projects, mixed — seleccionado en wizard y almacenado en DB
- [ ] **MODE-02**: Paleta filtrada por modo: agents=solo Agent+Checkpoint+Merge+Condition, projects=solo Project+Merge+Condition, mixed=todos los tipos

## Future Requirements

### Canvas v2

- **FUTURE-01**: Ejecucion paralela de ramas independientes del DAG
- **FUTURE-02**: Loop detection y ejecucion de ciclos controlados
- **FUTURE-03**: WebSocket updates en tiempo real (reemplazar polling)
- **FUTURE-04**: Canvas collaboration (multi-usuario)
- **FUTURE-05**: Sticky notes y anotaciones en el canvas
- **FUTURE-06**: Version history del canvas
- **FUTURE-07**: Import/export n8n workflows
- **FUTURE-08**: Variable passing UI entre nodos
- **FUTURE-09**: Scheduling/cron de canvas
- **FUTURE-10**: Marketplace de templates compartidos

## Out of Scope

| Feature | Reason |
|---------|--------|
| Parallel branch execution | Sequential topological order sufficient for v5.0 |
| Loop/cycle execution | DAG-only for v5.0, loops add complexity |
| WebSocket real-time updates | Polling at 2s intervals is sufficient |
| Canvas collaboration | Single-user tool |
| n8n workflow import | Different format, not worth the complexity |
| Canvas scheduling/cron | Manual execution only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 23 | Complete (23-01) |
| DATA-02 | Phase 23 | Complete (23-01) |
| DATA-03 | Phase 23 | Complete (23-01) |
| DATA-04 | Phase 23 | Complete (23-01) |
| DATA-05 | Phase 23 | Complete (23-01) |
| DATA-06 | Phase 23 | Complete (23-01) |
| DATA-07 | Phase 23 | Complete (23-01) |
| DATA-08 | Phase 23 | Complete (23-01) |
| DATA-09 | Phase 23 | Complete (23-02) |
| DATA-10 | Phase 23 | Complete (23-02) |
| DATA-11 | Phase 23 | Complete (23-02) |
| DATA-12 | Phase 23 | Complete (23-02) |
| NAV-01 | Phase 23 | Pending |
| NAV-02 | Phase 23 | Pending |
| LIST-01 | Phase 23 | Pending |
| LIST-02 | Phase 23 | Pending |
| LIST-03 | Phase 23 | Pending |
| LIST-04 | Phase 23 | Pending |
| WIZ-01 | Phase 23 | Pending |
| WIZ-02 | Phase 23 | Pending |
| WIZ-03 | Phase 23 | Pending |
| EDIT-01 | Phase 24 | Pending |
| EDIT-02 | Phase 24 | Pending |
| EDIT-03 | Phase 24 | Pending |
| EDIT-04 | Phase 24 | Pending |
| EDIT-05 | Phase 24 | Pending |
| EDIT-06 | Phase 24 | Complete |
| EDIT-07 | Phase 24 | Pending |
| EDIT-08 | Phase 24 | Pending |
| EDIT-09 | Phase 24 | Pending |
| EDIT-10 | Phase 24 | Pending |
| EDIT-11 | Phase 24 | Pending |
| NODE-01 | Phase 24 | Complete |
| NODE-02 | Phase 24 | Complete |
| NODE-03 | Phase 24 | Complete |
| NODE-04 | Phase 24 | Complete |
| NODE-05 | Phase 24 | Complete |
| NODE-06 | Phase 24 | Complete |
| NODE-07 | Phase 24 | Complete |
| NODE-08 | Phase 24 | Complete |
| EXEC-01 | Phase 25 | Pending |
| EXEC-02 | Phase 25 | Pending |
| EXEC-03 | Phase 25 | Pending |
| EXEC-04 | Phase 25 | Pending |
| EXEC-05 | Phase 25 | Pending |
| EXEC-06 | Phase 25 | Pending |
| EXEC-07 | Phase 25 | Pending |
| EXEC-08 | Phase 25 | Pending |
| EXEC-09 | Phase 25 | Pending |
| EXEC-10 | Phase 25 | Pending |
| EXEC-11 | Phase 25 | Pending |
| EXEC-12 | Phase 25 | Pending |
| EXEC-13 | Phase 25 | Pending |
| TMPL-01 | Phase 26 | Pending |
| TMPL-02 | Phase 26 | Pending |
| TMPL-03 | Phase 26 | Pending |
| MODE-01 | Phase 26 | Pending |
| MODE-02 | Phase 26 | Pending |

**Coverage:**
- v5.0 requirements: 52 total
- Mapped to phases: 52
- Unmapped: 0

---
*Requirements defined: 2026-03-12*
