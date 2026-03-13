# Requirements: DoCatFlow

**Defined:** 2026-03-13
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.

## v7.0 Requirements

Requirements for milestone v7.0: Streaming + Testing + Logging + Notificaciones.

### Streaming

- [x] **STRM-01**: Usuario puede ver respuestas del Chat RAG token a token en tiempo real (stream: true a LiteLLM, ReadableStream al frontend)
- [x] **STRM-02**: Usuario puede ver respuestas del CatBot token a token con indicadores de tool calls intercalados (icono + spinner durante ejecucion)
- [x] **STRM-03**: Usuario puede ver progreso del procesamiento de documentos en tiempo real via SSE (pasos: preparando, enviando, generando, guardando)
- [x] **STRM-04**: Usuario ve cursor parpadeante `▊` durante la generacion de respuestas (CSS blink 0.8s)
- [x] **STRM-05**: Usuario puede detener la generacion de respuestas con boton "Parar generacion" visible durante streaming
- [x] **STRM-06**: El scroll sigue automaticamente al ultimo token durante streaming
- [x] **STRM-07**: El markdown se renderiza progresivamente durante streaming (cada token actualiza el render)

### Testing — Playwright

- [x] **PLAY-01**: Playwright instalado como devDependency con chromium y dependencias en Dockerfile
- [x] **PLAY-02**: playwright.config.ts apunta a baseURL http://localhost:3500 con reporters JSON y HTML
- [ ] **PLAY-03**: Page Objects (POM) creados para todas las secciones de la app (sidebar, dashboard, projects, sources, etc.)
- [x] **PLAY-04**: Tabla test_runs en SQLite (id, type, section, status, total/passed/failed/skipped, duration_seconds, results_json, created_at)

### Testing — E2E Specs

- [ ] **E2E-01**: Spec navegacion: sidebar carga, todos los links funcionan, breadcrumbs se actualizan, footer visible, CatBot flotante visible
- [ ] **E2E-02**: Spec proyectos: crear proyecto, aparece en lista, abrir muestra pipeline de 5 pasos, eliminar con confirmacion
- [ ] **E2E-03**: Spec fuentes: subir archivo, aparece en lista con Ready, cambiar modo, buscar, eliminar
- [ ] **E2E-04**: Spec procesamiento: seleccionar agente/modelo/skills, procesar muestra loading, completar muestra historial
- [ ] **E2E-05**: Spec RAG: indexar muestra barra de progreso, stats cards aparecen, consulta devuelve chunks, re-indexar funciona
- [ ] **E2E-06**: Spec chat: enviar mensaje recibe respuesta, preguntas ejemplo funcionan
- [ ] **E2E-07**: Spec agentes: listar OpenClaw + custom, crear custom, editar, eliminar
- [ ] **E2E-08**: Spec workers: listar, crear, editar, eliminar
- [ ] **E2E-09**: Spec skills: listar, crear, editar, eliminar
- [ ] **E2E-10**: Spec tareas: listar, templates visibles, crear desde template con wizard de 4 pasos
- [ ] **E2E-11**: Spec canvas: listar, crear con wizard, editor se abre con START, arrastrar nodos, conectar, guardar
- [ ] **E2E-12**: Spec conectores: listar tipos, crear conector, test de conexion, plantillas sugeridas
- [ ] **E2E-13**: Spec catbot: abrir panel, enviar mensaje, sugerencias contextuales cambian por pagina
- [ ] **E2E-14**: Spec dashboard: cards de resumen con datos, grafico de tokens, actividad reciente, storage
- [ ] **E2E-15**: Spec settings: API keys visibles, seccion procesamiento, seccion CatBot

### Testing — API Specs

- [ ] **API-01**: Spec API projects: GET/POST/DELETE verifican status codes y respuestas correctas
- [ ] **API-02**: Spec API tasks: GET/POST/DELETE verifican status codes y respuestas correctas
- [ ] **API-03**: Spec API canvas: GET/POST/DELETE verifican status codes y respuestas correctas
- [ ] **API-04**: Spec API system: GET /api/health, dashboard/summary, connectors verifican status codes

### Testing — Dashboard

- [ ] **TEST-01**: Pagina /testing en sidebar entre Conectores y Configuracion con icono FlaskConical
- [ ] **TEST-02**: Resumen de tests: total, pass, fail, skip con barra de cobertura visual
- [ ] **TEST-03**: Lista de secciones expandibles con tests individuales mostrando estado (pass/fail/skip) y duracion
- [ ] **TEST-04**: Boton "Ejecutar todos" que lanza Playwright y boton "Ejecutar" por seccion individual
- [ ] **TEST-05**: Progreso de ejecucion con polling cada 2s
- [ ] **TEST-06**: Historial de las ultimas 10 ejecuciones
- [ ] **TEST-07**: Tests fallidos muestran: error, screenshot (si existe), codigo del test
- [ ] **TEST-08**: Boton "Generar tests con IA" que usa LLM para crear tests basados en el codigo
- [ ] **TEST-09**: Endpoints POST /api/testing/run, GET /api/testing/status, GET /api/testing/results

### Logging

- [x] **LOG-01**: Modulo logger.ts con niveles info/warn/error, formato JSONL (timestamp, level, source, message, metadata)
- [x] **LOG-02**: Logger integrado en todos los endpoints principales: procesamiento, chat, RAG, catbot, tareas, canvas, conectores, servicios externos
- [x] **LOG-03**: Rotacion automatica de logs: borrar archivos de mas de 7 dias al arrancar
- [ ] **LOG-04**: Visualizacion de logs en /testing: stream en tiempo real con polling cada 3s
- [ ] **LOG-05**: Filtros por nivel (info/warn/error), source (processing/chat/rag/catbot/tasks/canvas/connectors), y busqueda de texto
- [ ] **LOG-06**: Endpoint GET /api/system/logs con parametros level, source, limit, date
- [ ] **LOG-07**: Boton "Descargar logs" que descarga el archivo JSONL del dia actual

### Notificaciones

- [x] **NOTIF-01**: Tabla notifications en SQLite (id, type, title, message, severity, link, read, created_at)
- [x] **NOTIF-02**: Notificaciones generadas automaticamente al completar procesamiento, RAG indexacion, tareas, canvas, errores de conectores, servicios caidos/recuperados
- [x] **NOTIF-03**: Icono campana (Bell) en sidebar/header con badge rojo de notificaciones no leidas
- [x] **NOTIF-04**: Dropdown con ultimas 20 notificaciones: icono severidad, titulo, mensaje truncado, tiempo relativo, link "Ver"
- [x] **NOTIF-05**: Panel completo de notificaciones con filtros por tipo y severidad, paginacion
- [x] **NOTIF-06**: Endpoints GET /api/notifications, GET /api/notifications/count, PATCH /api/notifications/{id}/read, POST /api/notifications/read-all
- [x] **NOTIF-07**: Polling cada 15s para actualizar badge de notificaciones no leidas

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Testing Avanzado

- **TFUT-01**: Generacion automatica de tests con IA como script CLI independiente
- **TFUT-02**: Cobertura de codigo integrada en resultados
- **TFUT-03**: Tests de rendimiento/carga

### Streaming Avanzado

- **SFUT-01**: Streaming en ejecucion de tareas multi-agente (paso a paso)
- **SFUT-02**: Streaming en ejecucion de canvas (nodo a nodo)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| WebSocket para streaming/notificaciones | ReadableStream + polling suficiente para single-user |
| Testing frameworks de pago (Mabl, testRigor) | Self-hosted only |
| Persistencia de tests en DB externa | Playwright JSON reports desde filesystem |
| Winston/Pino para logging | Custom logger.ts mas ligero, suficiente para single-user |
| Notificaciones push (browser notifications) | Polling suficiente, no requiere permisos del navegador |
| Tests de rendimiento/carga | Fuera de scope para v7.0, herramienta single-user |
| Cobertura de codigo (Istanbul/c8) | Complejidad alta, beneficio bajo para este proyecto |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LOG-01 | Phase 32 | Complete |
| LOG-02 | Phase 32 | Complete |
| LOG-03 | Phase 32 | Complete |
| STRM-01 | Phase 33 | Complete |
| STRM-02 | Phase 33 | Complete |
| STRM-03 | Phase 33 | Complete |
| STRM-04 | Phase 34 | Complete |
| STRM-05 | Phase 34 | Complete |
| STRM-06 | Phase 34 | Complete |
| STRM-07 | Phase 34 | Complete |
| NOTIF-01 | Phase 35 | Complete |
| NOTIF-02 | Phase 35 | Complete |
| NOTIF-03 | Phase 35 | Complete |
| NOTIF-04 | Phase 35 | Complete |
| NOTIF-05 | Phase 35 | Complete |
| NOTIF-06 | Phase 35 | Complete |
| NOTIF-07 | Phase 35 | Complete |
| PLAY-01 | Phase 36 | Complete |
| PLAY-02 | Phase 36 | Complete |
| PLAY-03 | Phase 36 | Pending |
| PLAY-04 | Phase 36 | Complete |
| E2E-01 | Phase 36 | Pending |
| E2E-02 | Phase 36 | Pending |
| E2E-03 | Phase 36 | Pending |
| E2E-04 | Phase 36 | Pending |
| E2E-05 | Phase 36 | Pending |
| E2E-06 | Phase 36 | Pending |
| E2E-07 | Phase 36 | Pending |
| E2E-08 | Phase 36 | Pending |
| E2E-09 | Phase 36 | Pending |
| E2E-10 | Phase 36 | Pending |
| E2E-11 | Phase 36 | Pending |
| E2E-12 | Phase 36 | Pending |
| E2E-13 | Phase 36 | Pending |
| E2E-14 | Phase 36 | Pending |
| E2E-15 | Phase 36 | Pending |
| API-01 | Phase 36 | Pending |
| API-02 | Phase 36 | Pending |
| API-03 | Phase 36 | Pending |
| API-04 | Phase 36 | Pending |
| TEST-01 | Phase 37 | Pending |
| TEST-02 | Phase 37 | Pending |
| TEST-03 | Phase 37 | Pending |
| TEST-04 | Phase 37 | Pending |
| TEST-05 | Phase 37 | Pending |
| TEST-06 | Phase 37 | Pending |
| TEST-07 | Phase 37 | Pending |
| TEST-08 | Phase 37 | Pending |
| TEST-09 | Phase 37 | Pending |
| LOG-04 | Phase 37 | Pending |
| LOG-05 | Phase 37 | Pending |
| LOG-06 | Phase 37 | Pending |
| LOG-07 | Phase 37 | Pending |

**Coverage:**
- v7.0 requirements: 53 total (corrected from initial estimate of 48)
- Mapped to phases: 53
- Unmapped: 0

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-13 after roadmap creation*
