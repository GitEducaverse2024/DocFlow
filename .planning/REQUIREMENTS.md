# Requirements: DocFlow

**Defined:** 2026-03-11
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.

## v1.0 Requirements (COMPLETE)

All 14 requirements completed. See milestone v1.0 archive.

## v2.0 Requirements

Requirements for milestone v2.0: Sistema de Tareas Multi-Agente.

### Modelo de datos

- [ ] **DATA-01**: Tabla `tasks` con campos: id, name, description, expected_output, status (draft|configuring|ready|running|paused|completed|failed), linked_projects (JSON), result_output, total_tokens, total_duration, created_at, updated_at, started_at, completed_at
- [ ] **DATA-02**: Tabla `task_steps` con campos: id, task_id (FK CASCADE), order_index, type (agent|checkpoint|merge), name, agent_id, agent_name, agent_model, instructions, context_mode (previous|all|manual|rag), context_manual, rag_query, use_project_rag, skill_ids (JSON), status (pending|running|completed|failed|skipped), output, tokens_used, duration_seconds, started_at, completed_at, human_feedback, created_at
- [ ] **DATA-03**: Tabla `task_templates` con campos: id, name, description, emoji, category, steps_config (JSON), required_agents (JSON), times_used, created_at. Seed de 3 templates al crear la tabla
- [ ] **DATA-04**: Las tablas se crean con el patron ALTER TABLE try-catch existente en db.ts

### API CRUD

- [ ] **API-01**: GET /api/tasks lista tareas con filtro por status, incluyendo conteo de pasos, pasos completados, agentes involucrados, proyectos vinculados. Ordenar por updated_at desc
- [ ] **API-02**: POST /api/tasks crea tarea (name, description, expected_output). Status inicial 'draft'
- [ ] **API-03**: GET /api/tasks/{id} devuelve tarea completa con todos sus pasos y outputs
- [ ] **API-04**: PATCH /api/tasks/{id} actualiza tarea (name, description, expected_output, linked_projects, status)
- [ ] **API-05**: DELETE /api/tasks/{id} elimina tarea y pasos (CASCADE)
- [ ] **API-06**: GET /api/tasks/{id}/steps lista pasos ordenados por order_index
- [ ] **API-07**: POST /api/tasks/{id}/steps crea paso. Si no se da order_index, se anade al final. Maximo 10 pasos por tarea
- [ ] **API-08**: PATCH /api/tasks/{id}/steps/{stepId} edita un paso
- [ ] **API-09**: DELETE /api/tasks/{id}/steps/{stepId} elimina paso y reordena los restantes
- [ ] **API-10**: POST /api/tasks/{id}/steps/reorder reordena pasos (recibe array de IDs)
- [ ] **API-11**: GET /api/tasks/templates lista templates disponibles
- [ ] **API-12**: POST /api/tasks/from-template crea tarea desde template con pasos pre-configurados

### Ejecucion del pipeline

- [ ] **EXEC-01**: POST /api/tasks/{id}/execute lanza ejecucion secuencial en el backend. Status cambia a 'running'
- [ ] **EXEC-02**: GET /api/tasks/{id}/status devuelve: task.status, current_step_index, pasos con status y output (truncado a 500 chars), elapsed_time
- [ ] **EXEC-03**: Paso tipo 'agent': construye contexto segun context_mode (previous|all|manual), llama al LLM via llm.ts, guarda output/tokens/duration
- [ ] **EXEC-04**: Paso tipo 'agent' con use_project_rag=1: busca en RAGs de proyectos vinculados usando ollama.getEmbedding + qdrant.search, anade chunks al contexto
- [ ] **EXEC-05**: Paso tipo 'checkpoint': pausa la ejecucion, espera aprobacion humana. POST /approve continua, POST /reject re-ejecuta paso anterior con feedback
- [ ] **EXEC-06**: Paso tipo 'merge': concatena outputs de todos los pasos anteriores, llama al LLM para sintetizar en un documento unificado
- [ ] **EXEC-07**: Al completar todos los pasos: result_output = output del ultimo paso, calcula total_tokens y total_duration, status = 'completed'
- [ ] **EXEC-08**: POST /api/tasks/{id}/cancel cancela ejecucion, marca como 'failed'
- [ ] **EXEC-09**: POST /api/tasks/{id}/retry re-ejecuta desde el paso que fallo

### Prompt del pipeline

- [ ] **PROMPT-01**: El prompt de cada paso incluye: system (agente), skills, instrucciones del paso, contexto de pasos anteriores, contexto RAG si aplica, resultado esperado de la tarea
- [ ] **PROMPT-02**: Al rechazar un checkpoint, el feedback se anade al contexto del paso anterior como "FEEDBACK DEL USUARIO: {feedback}"

### Pagina /tasks (listado)

- [ ] **UI-01**: Entrada "Tareas" en sidebar entre "Skills" y "Configuracion" con icono ClipboardList
- [ ] **UI-02**: Pagina /tasks con listado de tareas como cards (emoji, nombre, status badge, resumen pasos, agentes, proyectos, fecha relativa)
- [ ] **UI-03**: Filtros por estado: Todas, En curso, Completadas, Borradores. Badges con conteo
- [ ] **UI-04**: Colores de status: draft=zinc, configuring=blue, ready=cyan, running=violet+pulse, paused=amber, completed=emerald, failed=red
- [ ] **UI-05**: Estado vacio con icono, titulo, subtitulo explicativo, boton crear primera tarea
- [ ] **UI-06**: Seccion de templates al final de la lista: cards con emoji, nombre, cantidad de pasos, boton "Usar"
- [ ] **UI-07**: Boton "Nueva tarea" en header de la pagina

### Wizard de creacion (4 pasos)

- [ ] **WIZ-01**: Pagina /tasks/new con stepper visual de 4 pasos: Objetivo, Proyectos, Pipeline, Revisar
- [ ] **WIZ-02**: Paso 1 (Objetivo): campos nombre, descripcion, resultado esperado. Pre-relleno si viene de template
- [ ] **WIZ-03**: Paso 2 (Proyectos): lista de proyectos con checkbox, muestra N vectores RAG o "No indexado" con aviso
- [ ] **WIZ-04**: Paso 3 (Pipeline): constructor de pasos con drag-and-drop (@dnd-kit). Cada paso tipo 'agent' tiene: selector agente, modelo, instrucciones, radio contexto (previous|all|manual), checkbox RAG, selector skills. Boton "+" entre pasos para insertar agent/checkpoint/merge
- [ ] **WIZ-05**: Paso 4 (Revisar): resumen de la tarea con pipeline visual, boton "Guardar borrador" y "Lanzar tarea"
- [ ] **WIZ-06**: Si viene de template (?template=ID), pre-carga los pasos del template

### Vista de ejecucion

- [ ] **VIEW-01**: Pagina /tasks/{id} muestra la tarea con pipeline visual vertical. Polling cada 2s a /status
- [ ] **VIEW-02**: Cada paso muestra: icono de tipo, agente, modelo, status badge, output (preview 200px con fade, "Ver completo" abre dialog)
- [ ] **VIEW-03**: Conexiones entre pasos: linea vertical con flecha. Emerald si completado, zinc si pendiente
- [ ] **VIEW-04**: Paso tipo checkpoint activo muestra: output del paso anterior renderizado en markdown, boton "Aprobar y continuar", textarea feedback + boton "Rechazar y re-ejecutar"
- [ ] **VIEW-05**: Barra de progreso inferior: X/N pasos, porcentaje, tiempo total, tokens totales
- [ ] **VIEW-06**: Cuando completa: muestra resultado final renderizado en markdown, botones descargar .md, copiar, re-ejecutar
- [ ] **VIEW-07**: Pipeline completado: pasos colapsados expandibles para ver output de cada agente

### Templates seed

- [ ] **TMPL-01**: Template "Documentacion tecnica completa" (emoji 📄, category documentation): 4 pasos (Analista, Checkpoint, PRD Gen, Arquitecto)
- [ ] **TMPL-02**: Template "Propuesta comercial" (emoji 💼, category business): 3 pasos (Analista, Checkpoint, Estratega)
- [ ] **TMPL-03**: Template "Investigacion y resumen" (emoji 🔍, category research): 3 pasos (Investigador, Resumidor, Checkpoint)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Ejecucion paralela de pasos | Complejidad excesiva para v2.0. Solo secuencial |
| Scheduling/cron de tareas | Manual por ahora |
| Export a PDF | Solo markdown. El usuario puede convertir externamente |
| WebSocket para ejecucion | Polling cada 2s es suficiente |
| Historial de re-ejecuciones | Solo la ejecucion actual se guarda |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 3 | Pending |
| DATA-02 | Phase 3 | Pending |
| DATA-03 | Phase 3 | Pending |
| DATA-04 | Phase 3 | Pending |
| API-01 | Phase 4 | Pending |
| API-02 | Phase 4 | Pending |
| API-03 | Phase 4 | Pending |
| API-04 | Phase 4 | Pending |
| API-05 | Phase 4 | Pending |
| API-06 | Phase 4 | Pending |
| API-07 | Phase 4 | Pending |
| API-08 | Phase 4 | Pending |
| API-09 | Phase 4 | Pending |
| API-10 | Phase 4 | Pending |
| API-11 | Phase 4 | Pending |
| API-12 | Phase 4 | Pending |
| EXEC-01 | Phase 5 | Pending |
| EXEC-02 | Phase 5 | Pending |
| EXEC-03 | Phase 5 | Pending |
| EXEC-04 | Phase 5 | Pending |
| EXEC-05 | Phase 5 | Pending |
| EXEC-06 | Phase 5 | Pending |
| EXEC-07 | Phase 5 | Pending |
| EXEC-08 | Phase 5 | Pending |
| EXEC-09 | Phase 5 | Pending |
| PROMPT-01 | Phase 5 | Pending |
| PROMPT-02 | Phase 5 | Pending |
| UI-01 | Phase 6 | Pending |
| UI-02 | Phase 6 | Pending |
| UI-03 | Phase 6 | Pending |
| UI-04 | Phase 6 | Pending |
| UI-05 | Phase 6 | Pending |
| UI-06 | Phase 6 | Pending |
| UI-07 | Phase 6 | Pending |
| WIZ-01 | Phase 7 | Pending |
| WIZ-02 | Phase 7 | Pending |
| WIZ-03 | Phase 7 | Pending |
| WIZ-04 | Phase 7 | Pending |
| WIZ-05 | Phase 7 | Pending |
| WIZ-06 | Phase 7 | Pending |
| VIEW-01 | Phase 8 | Pending |
| VIEW-02 | Phase 8 | Pending |
| VIEW-03 | Phase 8 | Pending |
| VIEW-04 | Phase 8 | Pending |
| VIEW-05 | Phase 8 | Pending |
| VIEW-06 | Phase 8 | Pending |
| VIEW-07 | Phase 8 | Pending |
| TMPL-01 | Phase 3 | Pending |
| TMPL-02 | Phase 3 | Pending |
| TMPL-03 | Phase 3 | Pending |

**Coverage:**
- v2.0 requirements: 48 total
- Mapped to phases: 48
- Unmapped: 0

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 after v2.0 milestone initialization*
