# Requirements: DoCatFlow

**Defined:** 2026-03-15
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.

## v10.0 Requirements

Requirements for milestone v10.0: CatPaw — Unificacion de Agentes. Unificar custom_agents + docs_workers en una entidad unica CatPaw con modos operativos, conexiones y motor de ejecucion centralizado.

### Modelo de Datos y Migracion

- [x] **DATA-01**: Tabla `cat_paws` creada con campos de identidad (name, avatar_emoji, avatar_color, department_tags), personalidad (system_prompt, tone), modo operativo (mode: chat/processor/hybrid), LLM (model, temperature, max_tokens), procesador (processing_instructions, output_format), OpenClaw sync, y meta (is_active, timestamps)
- [x] **DATA-02**: Tabla `cat_paw_catbrains` creada con FK a cat_paws y catbrains, query_mode (rag/connector/both), priority, UNIQUE(paw_id, catbrain_id)
- [x] **DATA-03**: Tabla `cat_paw_connectors` creada con FK a cat_paws y connectors, usage_hint, is_active, UNIQUE(paw_id, connector_id)
- [x] **DATA-04**: Tabla `cat_paw_agents` creada con FK a cat_paws (self-referencing), relationship (collaborator/delegate/supervisor), UNIQUE(paw_id, target_paw_id)
- [x] **DATA-05**: Tabla `cat_paw_skills` creada reemplazando agent_skills + worker_skills, PRIMARY KEY (paw_id, skill_id)
- [x] **DATA-06**: Migracion automatica de `custom_agents` a `cat_paws` con mode='chat', preservando id, name, emoji, system_prompt, model, openclaw_id
- [x] **DATA-07**: Migracion automatica de `docs_workers` a `cat_paws` con mode='processor', preservando id, name, instructions → processing_instructions, output_format
- [x] **DATA-08**: Migracion automatica de skills: agent_skills + worker_skills → cat_paw_skills

### API REST CatPaws

- [x] **API-01**: Endpoint `GET /api/cat-paws` lista CatPaws con filtros opcionales (mode, department, active) e incluye counts de relaciones (skills_count, catbrains_count, connectors_count)
- [x] **API-02**: Endpoint `POST /api/cat-paws` crea CatPaw con UUID, valida campos requeridos (name), parsea department_tags como JSON
- [x] **API-03**: Endpoint `GET /api/cat-paws/[id]` devuelve CatPaw completo con relaciones cargadas (skills, catbrains, connectors, agents)
- [x] **API-04**: Endpoint `PATCH /api/cat-paws/[id]` actualiza campos parciales del CatPaw, actualiza updated_at
- [x] **API-05**: Endpoint `DELETE /api/cat-paws/[id]` elimina CatPaw con CASCADE en relaciones
- [ ] **API-06**: Endpoint `GET /api/cat-paws/[id]/relations` devuelve catbrains, connectors y agents vinculados
- [ ] **API-07**: Endpoint `POST /api/cat-paws/[id]/catbrains` vincula CatBrain con query_mode y priority
- [ ] **API-08**: Endpoint `DELETE /api/cat-paws/[id]/catbrains/[catbrainId]` desvincula CatBrain
- [ ] **API-09**: Endpoint `POST /api/cat-paws/[id]/connectors` vincula conector global con usage_hint
- [ ] **API-10**: Endpoint `POST /api/cat-paws/[id]/agents` vincula otro CatPaw con relationship
- [ ] **API-11**: Endpoint `POST /api/cat-paws/[id]/openclaw-sync` sincroniza CatPaw con OpenClaw workspace
- [ ] **API-12**: Rutas antiguas `/api/agents` y `/api/workers` redirigen 301 a `/api/cat-paws`

### Motor de Ejecucion

- [ ] **EXEC-01**: Interfaces CatPawInput (query, context?, document_content?, catbrain_results?) y CatPawOutput (answer, sources?, connector_data?, paw_id, paw_name, mode, tokens_used?, model_used?)
- [ ] **EXEC-02**: Funcion `executeCatPaw(pawId, input)` que carga CatPaw con relaciones, consulta CatBrains vinculados, invoca conectores, construye messages y llama LiteLLM con withRetry
- [ ] **EXEC-03**: executeCatPaw registra uso en usage_logs (tokens, modelo, paw_id)
- [ ] **EXEC-04**: Task executor usa executeCatPaw cuando agent_id existe en cat_paws, con fallback a custom_agents
- [ ] **EXEC-05**: Canvas executor usa executeCatPaw para nodos tipo AGENT/CATPAW

### UI Pagina de Agentes

- [ ] **UI-01**: Sidebar actualizado: Agentes con icono PawPrint, Workers eliminado del sidebar
- [ ] **UI-02**: Pagina `/agents` con grid de cards (3 cols desktop), filtros por modo (Todos/Chat/Procesador/Hibrido), busqueda por nombre, filtro por departamento
- [ ] **UI-03**: Wizard de creacion 4 pasos: Identidad (nombre, emoji, color, tags, modo), Personalidad (system prompt, tono, modelo, temperatura, instrucciones procesador), Skills (multi-select), Conexiones (CatBrains, conectores, agentes)
- [ ] **UI-04**: Pagina detalle `/agents/[id]` con tabs: Identidad, Conexiones, Skills, Chat (solo chat/hybrid), OpenClaw (solo chat/hybrid)
- [ ] **UI-05**: Tab Conexiones con secciones CatBrains/Conectores/Agentes vinculados, botones vincular/desvincular, campos editables (query_mode, usage_hint, relationship)
- [ ] **UI-06**: Tab Chat con input, streaming SSE, sources RAG. Endpoint `POST /api/cat-paws/[id]/chat`
- [ ] **UI-07**: Selector de procesador CatPaw en pipeline de CatBrain (reemplaza selector de Worker), filtrado por mode IN (processor, hybrid)
- [ ] **UI-08**: Selector de agente CatPaw en wizard de Tareas y edicion de pasos (con backward compat a custom_agents)
- [ ] **UI-09**: Nodo AGENT en Canvas actualizado: selector apunta a CatPaws, icono PawPrint, badges de conexiones

### Polish y Compatibilidad

- [ ] **POLISH-01**: CatBot tools actualizadas: list_cat_paws, create_cat_paw (con aliases list_agents, list_workers para backward compat)
- [ ] **POLISH-02**: Pagina `/workers` muestra banner de migracion con enlace a `/agents?mode=processor`, sin boton de crear
- [ ] **POLISH-03**: Dashboard unifica stats: "CatPaws activos" con subtipos (N chat, N procesadores, N hibridos)
- [ ] **POLISH-04**: Panel `/system` unifica metricas de agents/workers en CatPaws
- [ ] **POLISH-05**: Seeds de ejemplo: 2 CatPaws por defecto si tabla vacia despues de migracion (Analista chat, Procesador docs)

## v9.0 Requirements (COMPLETE)

<details>
<summary>23 requirements — all complete</summary>

### Renombrado y Migracion

- [x] **REN-01**: La tabla `projects` se migra automaticamente a `catbrains` al arrancar
- [x] **REN-02**: Todas las rutas API `/api/projects/...` se renombran a `/api/catbrains/...` con aliases 301
- [x] **REN-03**: La UI muestra "CatBrains" en sidebar, listado, detalle, breadcrumbs
- [x] **REN-04**: El icono `ico_catbrain.png` aparece en cards, header, nodo Canvas y paso Tareas
- [x] **REN-05**: El nodo `PROJECT` en Canvas se renombra a `CATBRAIN`
- [x] **REN-06**: El paso `PROJECT` en Tareas se renombra a `CATBRAIN`
- [x] **REN-07**: Las referencias internas usan `catbrains` en vez de `projects`

### Conectores Propios

- [x] **CONN-01**: Tabla `catbrain_connectors` con FK y CASCADE
- [x] **CONN-02**: Endpoints CRUD `/api/catbrains/[id]/connectors`
- [x] **CONN-03**: Endpoint test `/api/catbrains/[id]/connectors/[connId]/test`
- [x] **CONN-04**: Panel "Conectores" en detalle del CatBrain
- [x] **CONN-05**: Conectores activos se invocan automaticamente segun modo
- [x] **CONN-06**: Red de CatBrains via MCP connector

### System Prompt y Configuracion

- [x] **CFG-01**: Campo `system_prompt` en catbrains, editable en UI
- [x] **CFG-02**: System prompt inyectado en toda interaccion LLM
- [x] **CFG-03**: Pestana "Configuracion" en detalle del CatBrain
- [x] **CFG-04**: Selector de modelo LLM dinamico
- [x] **CFG-05**: Toggle MCP endpoint con URL copiable

### Contrato de E/S e Integracion

- [x] **INT-01**: Interfaces CatBrainInput/CatBrainOutput
- [x] **INT-02**: executeCatBrain() centralizado
- [x] **INT-03**: Nodo CATBRAIN en Canvas con modo selector
- [x] **INT-04**: Paso CATBRAIN en Tareas con executeCatBrain
- [x] **INT-05**: Aristas Canvas con Modo A/B

</details>

## v7.0 Requirements (COMPLETE)

<details>
<summary>53 requirements — all complete</summary>

### Streaming
- [x] **STRM-01** through **STRM-07**: Streaming LLM en Chat, CatBot, Procesamiento

### Testing — Playwright
- [x] **PLAY-01** through **PLAY-04**: Playwright setup + POM + test_runs

### Testing — E2E Specs
- [x] **E2E-01** through **E2E-15**: 15 E2E specs

### Testing — API Specs
- [x] **API-01** through **API-04**: 4 API specs

### Testing — Dashboard
- [x] **TEST-01** through **TEST-09**: Testing page

### Logging
- [x] **LOG-01** through **LOG-07**: JSONL logging

### Notificaciones
- [x] **NOTIF-01** through **NOTIF-07**: Notification system

</details>

## Future Requirements

Deferred to future milestones.

- **TFUT-01**: Generacion automatica de tests con IA como script CLI independiente
- **TFUT-02**: Cobertura de codigo integrada en resultados
- **TFUT-03**: Tests de rendimiento/carga
- **SFUT-01**: Streaming en ejecucion de tareas multi-agente (paso a paso)
- **SFUT-02**: Streaming en ejecucion de canvas (nodo a nodo)
- **FFUT-01**: Exportar/importar CatBrain como unidad portable
- **FFUT-02**: Limite configurable de conectores por CatBrain
- **FFUT-03**: Variantes de color de icono por CatBrain
- **FFUT-04**: Canvas loop detection para redes de CatBrains
- **RFUT-01**: RAG R3 — Busqueda avanzada + reranking (filtros metadata, reranker, source attribution)
- **RFUT-02**: RAG R4 — Escalabilidad + optimizacion (incremental index, deduplication, cache, multi-collection)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-user permissions on CatPaws | Single-user tool |
| CatPaw marketplace/sharing | Internal tool only |
| Auto-migration of CatPaw across instances | Export/import deferred |
| Parallel CatPaw execution in tasks | Sequential pipeline only |
| WebSocket for CatPaw chat | SSE streaming sufficient |
| CatPaw scheduling/cron | Manual execution only |
| CatPaw versioning/snapshots | Out of scope for v10.0 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 42 | Pending |
| DATA-02 | Phase 42 | Pending |
| DATA-03 | Phase 42 | Pending |
| DATA-04 | Phase 42 | Pending |
| DATA-05 | Phase 42 | Pending |
| DATA-06 | Phase 42 | Pending |
| DATA-07 | Phase 42 | Pending |
| DATA-08 | Phase 42 | Pending |
| API-01 | Phase 43 | Complete |
| API-02 | Phase 43 | Complete |
| API-03 | Phase 43 | Complete |
| API-04 | Phase 43 | Complete |
| API-05 | Phase 43 | Complete |
| API-06 | Phase 43 | Pending |
| API-07 | Phase 43 | Pending |
| API-08 | Phase 43 | Pending |
| API-09 | Phase 43 | Pending |
| API-10 | Phase 43 | Pending |
| API-11 | Phase 43 | Pending |
| API-12 | Phase 43 | Pending |
| EXEC-01 | Phase 44 | Pending |
| EXEC-02 | Phase 44 | Pending |
| EXEC-03 | Phase 44 | Pending |
| EXEC-04 | Phase 44 | Pending |
| EXEC-05 | Phase 44 | Pending |
| UI-01 | Phase 45 | Pending |
| UI-02 | Phase 45 | Pending |
| UI-03 | Phase 45 | Pending |
| UI-04 | Phase 45 | Pending |
| UI-05 | Phase 45 | Pending |
| UI-06 | Phase 45 | Pending |
| UI-07 | Phase 45 | Pending |
| UI-08 | Phase 45 | Pending |
| UI-09 | Phase 45 | Pending |
| POLISH-01 | Phase 46 | Pending |
| POLISH-02 | Phase 46 | Pending |
| POLISH-03 | Phase 46 | Pending |
| POLISH-04 | Phase 46 | Pending |
| POLISH-05 | Phase 46 | Pending |

**Coverage:**
- v10.0 requirements: 39 total
- Mapped to phases: 39/39 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-03-15*
*Milestone: v10.0 — CatPaw: Unificacion de Agentes*
