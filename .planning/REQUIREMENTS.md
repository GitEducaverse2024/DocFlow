# Requirements: DocFlow

**Defined:** 2026-03-11
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.

## v1.0 Archive

All 14 requirements completed. See milestone v1.0 archive.

## v2.0 Archive

All 48 requirements completed. See milestone v2.0 archive.

## v3.0 Requirements

Requirements for milestone v3.0: Conectores + Dashboard de Operaciones.

### Modelo de datos

- [x] **CDATA-01**: Tabla `connectors` con campos: id, name, description, emoji, type (n8n_webhook|http_api|mcp_server|email), config (JSON), is_active, test_status (untested|ok|failed), last_tested, times_used, created_at, updated_at
- [x] **CDATA-02**: Tabla `connector_logs` con campos: id, connector_id (FK), task_id, task_step_id, agent_id, request_payload (truncado 5000), response_payload (truncado 5000), status (success|failed|timeout), duration_ms, error_message, created_at
- [x] **CDATA-03**: Tabla `usage_logs` con campos: id, event_type (process|chat|rag_index|agent_generate|task_step|connector_call), project_id, task_id, agent_id, model, provider, input_tokens, output_tokens, total_tokens, estimated_cost (REAL), duration_ms, status (success|failed), metadata (JSON), created_at
- [x] **CDATA-04**: Tabla `agent_connector_access` con campos: agent_id, connector_id (FK), PRIMARY KEY (agent_id, connector_id)
- [x] **CDATA-05**: Interfaces TypeScript Connector, ConnectorLog, UsageLog, AgentConnectorAccess en types.ts

### API CRUD Conectores

- [x] **CAPI-01**: GET /api/connectors lista conectores con times_used y last_tested. Ordenar por updated_at desc
- [x] **CAPI-02**: POST /api/connectors crea conector (name, type, config, emoji, description). Maximo 20 conectores validado
- [x] **CAPI-03**: GET /api/connectors/{id} detalle del conector
- [x] **CAPI-04**: PATCH /api/connectors/{id} actualiza conector (name, description, emoji, config, is_active)
- [x] **CAPI-05**: DELETE /api/connectors/{id} elimina conector y sus logs
- [x] **CAPI-06**: POST /api/connectors/{id}/test ejecuta llamada de prueba segun tipo. Actualiza test_status y last_tested
- [x] **CAPI-07**: GET /api/connectors/{id}/logs lista ultimas 50 invocaciones con fecha, tarea, agente, status, duracion
- [x] **CAPI-08**: GET /api/connectors/for-agent/{agentId} lista conectores accesibles para un agente (via agent_connector_access)

### UI Conectores

- [ ] **CUI-01**: Entrada "Conectores" en sidebar entre Tareas y Configuracion con icono Plug
- [ ] **CUI-02**: Pagina /connectors con seccion de tipos (4 cards explicativas), lista de conectores configurados con estado, y seccion sin configurar
- [ ] **CUI-03**: Sheet lateral crear/editar conector: selector de tipo (4 cards), campos dinamicos segun tipo (n8n: URL+metodo+headers+timeout, http: URL+metodo+headers+body_template, mcp: URL+nombre+tools, email: SMTP o webhook n8n)
- [ ] **CUI-04**: Boton Test que ejecuta prueba y muestra resultado (success badge o error)
- [ ] **CUI-05**: Dialog de logs al pulsar "Logs": tabla scrolleable con ultimas 50 invocaciones (fecha, tarea, agente, status badge, duracion, payload expandible)
- [ ] **CUI-06**: Colores por tipo: n8n_webhook=orange, http_api=blue, mcp_server=violet, email=emerald
- [ ] **CUI-07**: Seccion "Conectores sugeridos para n8n" con 3 templates pre-configurados (email, Asana, Telegram) que pre-rellenan la config

### Ejecucion de conectores en pipeline + Acceso agente-conector

- [x] **CPIPE-01**: Nuevo campo connector_config en task_steps: JSON con array de {connector_id, mode: 'before'|'after'|'both'}
- [ ] **CPIPE-02**: En task-executor, antes de ejecutar paso agent: si tiene conectores mode 'before' o 'both', ejecutarlos y anadir respuestas al contexto
- [ ] **CPIPE-03**: En task-executor, despues de ejecutar paso agent: si tiene conectores mode 'after' o 'both', ejecutarlos enviando output como payload
- [ ] **CPIPE-04**: Payload enviado al conector: {task_id, task_name, step_index, step_name, agent_name, output, metadata: {tokens_used, model, duration_seconds}}
- [ ] **CPIPE-05**: Registrar cada invocacion de conector en connector_logs con request/response/status/duration
- [ ] **CPIPE-06**: En wizard paso 3 (Pipeline), cada paso agent muestra seccion "Conectores (opcional)" con checkboxes de conectores accesibles del agente y selector de modo
- [ ] **CACCESS-01**: En pagina /agents, al editar agente custom: seccion "Conectores disponibles" con checkboxes
- [ ] **CACCESS-02**: Guardar/eliminar en tabla agent_connector_access al guardar agente
- [ ] **CACCESS-03**: En wizard de tareas, al seleccionar conectores para un paso, solo mostrar los que el agente asignado tiene acceso

### Tracking de uso + Costes

- [ ] **USAGE-01**: POST /api/projects/{id}/process registra usage_log con event_type 'process', tokens, modelo, duracion
- [ ] **USAGE-02**: POST /api/projects/{id}/chat registra usage_log con event_type 'chat', tokens, modelo, duracion
- [ ] **USAGE-03**: POST /api/projects/{id}/rag/create registra usage_log con event_type 'rag_index' (duracion, sin tokens LLM)
- [ ] **USAGE-04**: POST /api/agents/generate registra usage_log con event_type 'agent_generate', tokens, modelo
- [ ] **USAGE-05**: Task executor registra usage_log por cada paso con event_type 'task_step', tokens, modelo, duracion
- [ ] **USAGE-06**: Connector calls registran usage_log con event_type 'connector_call', duracion, status
- [ ] **USAGE-07**: Calcular estimated_cost usando precios de modelos almacenados en settings. Formula: (input_tokens * input_price + output_tokens * output_price) / 1_000_000
- [ ] **USAGE-08**: Insertar usage_logs en background (no bloquear respuesta al usuario)
- [ ] **COST-01**: Seccion "Costes de modelos" en /settings con tabla editable: modelo, input price, output price, provider
- [ ] **COST-02**: Guardar precios en tabla settings como JSON con clave 'model_pricing'
- [x] **COST-03**: Seed de precios por defecto: gemini-main=0/0, claude-sonnet-4-6=3/15, claude-opus-4-6=15/75, gpt-4o=2.5/10, gpt-4o-mini=0.15/0.60, ollama=0/0

### Dashboard de operaciones

- [ ] **DASH-01**: GET /api/dashboard/summary — conteos: proyectos, agentes, tareas, tokens hoy, coste este mes
- [ ] **DASH-02**: GET /api/dashboard/usage?days=7 — tokens por dia desglosado por provider para grafico de barras
- [ ] **DASH-03**: GET /api/dashboard/activity?limit=10 — ultimos 10 eventos de usage_logs como feed
- [ ] **DASH-04**: GET /api/dashboard/top-agents?limit=5 — agentes mas usados por conteo de usage_logs
- [ ] **DASH-05**: GET /api/dashboard/top-models?limit=5 — modelos mas usados
- [ ] **DASH-06**: GET /api/dashboard/storage — tamano de directorio proyectos, colecciones Qdrant, modelos Ollama
- [ ] **DASH-07**: Pagina / (reemplazar dashboard actual) con: cards de resumen, grafico de tokens (recharts barras por dia/provider), actividad reciente (timeline), agentes mas activos, top modelos, storage, proyectos recientes, tareas en curso
- [ ] **DASH-08**: Instalar recharts y usar BarChart para grafico de tokens. Colores: Gemini=blue, Claude=violet, GPT=emerald, Ollama=amber

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CDATA-01 | Phase 9 | Complete |
| CDATA-02 | Phase 9 | Complete |
| CDATA-03 | Phase 9 | Complete |
| CDATA-04 | Phase 9 | Complete |
| CDATA-05 | Phase 9 | Complete |
| CAPI-01 | Phase 10 | Complete |
| CAPI-02 | Phase 10 | Complete |
| CAPI-03 | Phase 10 | Complete |
| CAPI-04 | Phase 10 | Complete |
| CAPI-05 | Phase 10 | Complete |
| CAPI-06 | Phase 10 | Complete |
| CAPI-07 | Phase 10 | Complete |
| CAPI-08 | Phase 10 | Complete |
| CUI-01 | Phase 11 | Pending |
| CUI-02 | Phase 11 | Pending |
| CUI-03 | Phase 11 | Pending |
| CUI-04 | Phase 11 | Pending |
| CUI-05 | Phase 11 | Pending |
| CUI-06 | Phase 11 | Pending |
| CUI-07 | Phase 11 | Pending |
| CPIPE-01 | Phase 9+12 | Complete |
| CPIPE-02 | Phase 12 | Pending |
| CPIPE-03 | Phase 12 | Pending |
| CPIPE-04 | Phase 12 | Pending |
| CPIPE-05 | Phase 12 | Pending |
| CPIPE-06 | Phase 12 | Pending |
| CACCESS-01 | Phase 12 | Pending |
| CACCESS-02 | Phase 12 | Pending |
| CACCESS-03 | Phase 12 | Pending |
| USAGE-01 | Phase 13 | Pending |
| USAGE-02 | Phase 13 | Pending |
| USAGE-03 | Phase 13 | Pending |
| USAGE-04 | Phase 13 | Pending |
| USAGE-05 | Phase 13 | Pending |
| USAGE-06 | Phase 13 | Pending |
| USAGE-07 | Phase 13 | Pending |
| USAGE-08 | Phase 13 | Pending |
| COST-01 | Phase 13 | Pending |
| COST-02 | Phase 13 | Pending |
| COST-03 | Phase 9+13 | Complete |
| DASH-01 | Phase 14 | Pending |
| DASH-02 | Phase 14 | Pending |
| DASH-03 | Phase 14 | Pending |
| DASH-04 | Phase 14 | Pending |
| DASH-05 | Phase 14 | Pending |
| DASH-06 | Phase 14 | Pending |
| DASH-07 | Phase 14 | Pending |
| DASH-08 | Phase 14 | Pending |

**Coverage:**
- v3.0 requirements: 48 total
- Mapped to phases: 48
- Unmapped: 0

---
*Requirements defined: 2026-03-11*
