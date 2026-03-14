# Requirements: DoCatFlow

**Defined:** 2026-03-14
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.

## v9.0 Requirements

Requirements for milestone v9.0: CatBrains — Renombrar y ampliar Projects a unidades de conocimiento inteligente.

### Renombrado y Migración

- [ ] **REN-01**: La tabla `projects` se migra automáticamente a `catbrains` al arrancar (CREATE AS SELECT + DROP + ALTER TABLE para columnas nuevas: system_prompt, mcp_enabled, icon_color)
- [ ] **REN-02**: Todas las rutas API `/api/projects/...` se renombran a `/api/catbrains/...` con aliases 301 temporales desde las rutas antiguas
- [ ] **REN-03**: La UI muestra "CatBrains" en sidebar, listado, detalle, breadcrumbs y todos los textos visibles al usuario
- [ ] **REN-04**: El icono `ico_catbrain.png` aparece en cards del listado, header de detalle, nodo Canvas y paso Tareas
- [ ] **REN-05**: El nodo `PROJECT` en Canvas se renombra a `CATBRAIN` con icono y badges actualizados (RAG status, conectores count)
- [ ] **REN-06**: El paso `PROJECT` en Tareas se renombra a `CATBRAIN` con icono actualizado
- [ ] **REN-07**: Las referencias internas (MCP endpoint, task executor, canvas executor, CatBot tools) usan `catbrains` en vez de `projects`

### Conectores Propios

- [ ] **CONN-01**: La tabla `catbrain_connectors` se crea con FK a `catbrains.id` y ON DELETE CASCADE (id, catbrain_id, name, type, config, description, is_active, test_status, last_tested, created_at, updated_at)
- [ ] **CONN-02**: Endpoints CRUD `/api/catbrains/[id]/connectors` — GET lista, POST crear, PUT actualizar, DELETE eliminar
- [ ] **CONN-03**: Endpoint POST `/api/catbrains/[id]/connectors/[connId]/test` para probar un conector individual
- [ ] **CONN-04**: Panel "Conectores" como nueva pestaña en el detalle del CatBrain con lista de conectores, crear, editar, eliminar, probar, con badges de estado
- [ ] **CONN-05**: Los conectores activos se invocan automáticamente cuando `mode` incluye `connector` o `both`; desactivables individualmente via `is_active`
- [ ] **CONN-06**: Un CatBrain puede tener otro CatBrain como conector vía tipo `mcp_server` apuntando a `/api/mcp/{catbrain-id}` (red de CatBrains)

### System Prompt y Configuración

- [ ] **CFG-01**: Campo `system_prompt` en tabla `catbrains` (TEXT, nullable), editable en UI como textarea expandible
- [ ] **CFG-02**: El system prompt se inyecta en toda interacción LLM del CatBrain (chat directo, ejecución desde Canvas, ejecución desde Tareas)
- [ ] **CFG-03**: Pestaña "Configuración" en detalle del CatBrain con: nombre, descripción, modelo LLM (selector dinámico), system prompt (textarea), MCP toggle, botón eliminar
- [ ] **CFG-04**: Selector de modelo LLM dinámico que usa `/api/models` existente para listar modelos disponibles en LiteLLM
- [ ] **CFG-05**: Toggle MCP endpoint activo/inactivo con URL copiable (`http://{host}:3500/api/mcp/{id}`)

### Contrato de E/S e Integración

- [ ] **INT-01**: Interfaces TypeScript `CatBrainInput` (query, context?, mode?) y `CatBrainOutput` (answer, sources?, connector_data?, catbrain_id, catbrain_name) definidas en archivo compartido
- [ ] **INT-02**: Función `executeCatBrain(catbrainId, input: CatBrainInput): Promise<CatBrainOutput>` que orquesta RAG + conectores + LLM con system prompt según el mode
- [ ] **INT-03**: Nodo CATBRAIN en Canvas usa `executeCatBrain` y expone selector de modo (Solo RAG / Solo Conectores / RAG + Conectores)
- [ ] **INT-04**: Paso CATBRAIN en Tareas usa `executeCatBrain` con el modo configurado en el wizard de creación
- [ ] **INT-05**: En Canvas, las aristas entre nodos CATBRAIN permiten elegir Modo A (consulta RAG independiente) o Modo B (pipeline secuencial con context passing)

## v7.0 Requirements (COMPLETE)

<details>
<summary>53 requirements — all complete</summary>

### Streaming

- [x] **STRM-01**: Usuario puede ver respuestas del Chat RAG token a token en tiempo real
- [x] **STRM-02**: Usuario puede ver respuestas del CatBot token a token con indicadores de tool calls
- [x] **STRM-03**: Usuario puede ver progreso del procesamiento en tiempo real via SSE
- [x] **STRM-04**: Usuario ve cursor parpadeante durante la generacion
- [x] **STRM-05**: Usuario puede detener la generacion con boton "Parar generacion"
- [x] **STRM-06**: El scroll sigue automaticamente al ultimo token
- [x] **STRM-07**: El markdown se renderiza progresivamente

### Testing — Playwright

- [x] **PLAY-01**: Playwright instalado como devDependency con chromium en Dockerfile
- [x] **PLAY-02**: playwright.config.ts apunta a baseURL http://localhost:3500
- [x] **PLAY-03**: Page Objects (POM) para todas las secciones
- [x] **PLAY-04**: Tabla test_runs en SQLite

### Testing — E2E Specs

- [x] **E2E-01** through **E2E-15**: 15 E2E specs covering all app sections

### Testing — API Specs

- [x] **API-01** through **API-04**: 4 API specs for projects, tasks, canvas, system

### Testing — Dashboard

- [x] **TEST-01** through **TEST-09**: Testing page with runner, results, history, AI generator

### Logging

- [x] **LOG-01** through **LOG-07**: Structured JSONL logging with rotation and viewer

### Notificaciones

- [x] **NOTIF-01** through **NOTIF-07**: Notification system with bell, badge, dropdown, endpoints

</details>

## Future Requirements

Deferred to future milestones.

- **TFUT-01**: Generacion automatica de tests con IA como script CLI independiente
- **TFUT-02**: Cobertura de codigo integrada en resultados
- **TFUT-03**: Tests de rendimiento/carga
- **SFUT-01**: Streaming en ejecucion de tareas multi-agente (paso a paso)
- **SFUT-02**: Streaming en ejecucion de canvas (nodo a nodo)
- **FFUT-01**: Exportar/importar CatBrain como unidad portable
- **FFUT-02**: Límite configurable de conectores por CatBrain
- **FFUT-03**: Variantes de color de icono por CatBrain
- **FFUT-04**: Canvas loop detection para redes de CatBrains

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-user permissions on CatBrains | Single-user tool |
| Real-time connector streaming | Fire-and-forget sufficient |
| CatBrain versioning/snapshots | Out of scope for v9.0 |
| Automatic connector discovery | Manual configuration only |
| WebSocket para streaming/notificaciones | ReadableStream + polling sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| REN-01..07 | TBD | Pending |
| CONN-01..06 | TBD | Pending |
| CFG-01..05 | TBD | Pending |
| INT-01..05 | TBD | Pending |

**Coverage:**
- v9.0 requirements: 23 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 23

---
*Requirements defined: 2026-03-14*
*Last updated: 2026-03-14*
