# Requirements: DoCatFlow

**Defined:** 2026-03-12
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.

## v1.0 Archive

All 14 requirements completed. See milestone v1.0 archive.

## v2.0 Archive

All 48 requirements completed. See milestone v2.0 archive.

## v3.0 Archive

All 48 requirements completed. See milestone v3.0 archive.

## v4.0 Archive

All 52 requirements completed. See milestone v4.0 archive.

## v5.0 Archive

51/52 requirements completed (phases 23-24 complete, 25 partial, 26 deferred). See milestone v5.0 archive.

## v6.0 Requirements

Requirements for milestone v6.0: Testing Inteligente + Performance + Estabilización.

### Resilience

- [ ] **RESIL-01**: withRetry(fn, opts) utility con exponential backoff para llamadas a servicios externos
- [ ] **RESIL-02**: withRetry aplicado a llamadas de LiteLLM, Qdrant, Ollama, OpenClaw y Conectores (solo operaciones idempotentes)
- [ ] **RESIL-03**: TTL cache en memoria (Map) para endpoints frecuentes: agents 30s, dashboard 60s, health 30s, settings 300s
- [ ] **RESIL-04**: Logger estructurado JSONL con rotación 7 días en /app/data/logs/
- [x] **RESIL-05**: error.tsx por cada sección principal (projects, tasks, agents, canvas, workers, skills, connectors, testing) con botón reintentar
- [x] **RESIL-06**: Error Boundary reporta errores a CatBot (push error context a localStorage para mensaje proactivo)
- [ ] **RESIL-07**: Health check mejorado con latency_ms por servicio (DB, LiteLLM, Qdrant, Ollama, OpenClaw)
- [ ] **RESIL-08**: Startup DB cleanup: resetear tasks y canvas_runs en estado 'running' a 'failed' al iniciar

### Playwright Setup

- [ ] **PLAY-01**: @playwright/test instalado como devDependency en host, playwright.config.ts con baseURL localhost:3500, workers:1, JSON reporter
- [ ] **PLAY-02**: globalSetup/globalTeardown con prefijo [TEST] para aislamiento de datos en SQLite
- [ ] **PLAY-03**: 9 Page Object Models (sidebar, dashboard, projects, project-detail, agents, tasks, canvas, connectors, settings)
- [ ] **PLAY-04**: data-testid attributes añadidos a elementos interactivos clave en las 8 secciones

### Tests E2E

- [ ] **E2E-01**: navigation.spec.ts — sidebar, navegación entre secciones, breadcrumbs, footer, responsive
- [ ] **E2E-02**: projects.spec.ts — CRUD proyectos, pipeline de 5 pasos, eliminar con confirmación
- [ ] **E2E-03**: sources.spec.ts — subir archivo, modos de fuente, buscar, eliminar, re-extraer
- [ ] **E2E-04**: processing.spec.ts — seleccionar agente/modelo/skills, procesar, ver resultado
- [ ] **E2E-05**: rag.spec.ts — indexar, barra progreso, stats cards, probar consulta, MCP panel
- [ ] **E2E-06**: chat.spec.ts — enviar mensaje, respuesta RAG, preguntas ejemplo
- [ ] **E2E-07**: agents.spec.ts — tablas OpenClaw y custom, CRUD agente custom
- [ ] **E2E-08**: workers.spec.ts — CRUD workers
- [ ] **E2E-09**: skills.spec.ts — CRUD skills
- [ ] **E2E-10**: tasks.spec.ts — lista, templates, wizard 4 pasos, ejecución
- [ ] **E2E-11**: canvas.spec.ts — lista, wizard, editor, arrastrar nodos, conectar, configurar
- [ ] **E2E-12**: connectors.spec.ts — CRUD conectores
- [ ] **E2E-13**: settings.spec.ts — configuración
- [ ] **E2E-14**: catbot.spec.ts — CatBot flotante
- [ ] **E2E-15**: dashboard.spec.ts — dashboard estadísticas

### Tests API

- [ ] **API-01**: projects.api.spec.ts — GET/POST/DELETE /api/projects, GET /api/projects/{id}
- [ ] **API-02**: sources.api.spec.ts — POST/GET/DELETE fuentes de proyecto
- [ ] **API-03**: tasks.api.spec.ts — GET/POST /api/tasks
- [ ] **API-04**: canvas.api.spec.ts — GET/POST /api/canvas, PATCH/DELETE /api/canvas/{id}
- [ ] **API-05**: connectors.api.spec.ts — CRUD /api/connectors
- [ ] **API-06**: settings.api.spec.ts — GET/PATCH /api/settings/*
- [ ] **API-07**: dashboard.api.spec.ts — GET /api/dashboard/summary, /api/system/status

### Testing Dashboard

- [ ] **TEST-01**: Enlace "Testing" en sidebar entre Conectores y Configuración con icono FlaskConical
- [ ] **TEST-02**: Página /testing con resumen: total tests, passed, failed, skipped, cobertura %, última ejecución
- [ ] **TEST-03**: POST /api/testing/run para ejecutar tests (trigger-file → host script → Playwright)
- [ ] **TEST-04**: GET /api/testing/results parsea JSON report de Playwright y devuelve resultados por test
- [ ] **TEST-05**: Tabla de tests por sección con estado pass/fail/skip, duración, botones ejecutar y ver detalle
- [ ] **TEST-06**: Dialog detalle de test fallido: error message, screenshot, código del test, trace
- [ ] **TEST-07**: GET /api/testing/history — últimos 10 runs con timestamp, totales, duración
- [ ] **TEST-08**: Historial de ejecuciones en /testing con comparación entre runs
- [ ] **TEST-09**: GET /api/testing/logs — lee líneas JSONL del logger con filtro por nivel
- [ ] **TEST-10**: Visor de logs en /testing con filtro por nivel (INFO, WARN, ERROR)
- [ ] **TEST-11**: Modelo de datos: tabla test_runs y test_coverage en SQLite
- [ ] **TEST-12**: Gráfico de cobertura por sección (barras horizontales)

### Streaming LLM

- [ ] **STRM-01**: chatStream() en lib/services/llm-stream.ts retornando ReadableStream desde LiteLLM con stream:true
- [ ] **STRM-02**: POST /api/projects/[id]/stream — endpoint streaming para chat de proyecto con force-dynamic
- [ ] **STRM-03**: chat-panel.tsx consume streaming con ReadableStreamDefaultReader y AbortController cleanup
- [ ] **STRM-04**: POST /api/catbot/stream — endpoint streaming para CatBot (tool-calling resuelve primero, luego stream)
- [ ] **STRM-05**: catbot-panel.tsx consume streaming con cursor parpadeante durante generación
- [ ] **STRM-06**: Streaming en procesamiento: preview en tiempo real del texto generado por el LLM
- [ ] **STRM-07**: Header X-Accel-Buffering: no en todos los endpoints streaming

### AI Test Generation

- [ ] **AIGEN-01**: Script CLI scripts/generate-tests.ts que lee código fuente y genera specs Playwright via LLM
- [ ] **AIGEN-02**: Prompt template con enforcement de español, data-testid, Page Object Model, getByRole/getByLabel
- [ ] **AIGEN-03**: POST /api/testing/generate — endpoint para generar tests desde la UI
- [ ] **AIGEN-04**: Sección en /testing para generar tests: selector de sección, botón generar, preview del spec generado
- [ ] **AIGEN-05**: Tests generados guardados en tests/ai-generated/ para revisión antes de mover a tests/e2e/

## Future Requirements

### Testing v2

- **FUTURE-01**: Coverage report integration (instrumented builds)
- **FUTURE-02**: Test scheduling/cron
- **FUTURE-03**: Cache hit/miss telemetry endpoint
- **FUTURE-04**: Parallel test workers (when SQLite isolation improves)
- **FUTURE-05**: AI test generation with auto-fix on failure

### Streaming v2

- **FUTURE-06**: CatBot streaming during tool execution (not just final response)
- **FUTURE-07**: Processing streaming with multi-source progress aggregation

## Out of Scope

| Feature | Reason |
|---------|--------|
| WebSocket for streaming/test progress | Next.js App Router doesn't support persistent WebSocket; polling sufficient |
| Redis or external cache | Single-user self-hosted tool; in-memory Map sufficient |
| Paid testing tools (Mabl, testRigor) | Self-hosted only constraint |
| Istanbul/NYC code coverage for E2E | Requires instrumented builds; misleading metric for E2E |
| Sentry or external error monitoring | Self-hosted philosophy; structured logger + CatBot sufficient |
| pino as logging library | No built-in file rotation; custom logger simpler |
| Playwright in Docker image | 500MB+ bloat; chromium deps missing in node:20-slim |
| Test persistence in external DB | JSON reports from filesystem sufficient |
| Test scheduling/cron | Manual execution sufficient for single-user |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RESIL-01 | Phase 27 | Pending |
| RESIL-02 | Phase 27 | Pending |
| RESIL-03 | Phase 27 | Pending |
| RESIL-04 | Phase 27 | Pending |
| RESIL-05 | Phase 27 | Complete |
| RESIL-06 | Phase 27 | Complete |
| RESIL-07 | Phase 27 | Pending |
| RESIL-08 | Phase 27 | Pending |
| PLAY-01 | Phase 28 | Pending |
| PLAY-02 | Phase 28 | Pending |
| PLAY-03 | Phase 28 | Pending |
| PLAY-04 | Phase 28 | Pending |
| E2E-01 | Phase 28 | Pending |
| E2E-02 | Phase 28 | Pending |
| E2E-03 | Phase 28 | Pending |
| E2E-04 | Phase 28 | Pending |
| E2E-05 | Phase 28 | Pending |
| E2E-06 | Phase 28 | Pending |
| E2E-07 | Phase 28 | Pending |
| E2E-08 | Phase 28 | Pending |
| E2E-09 | Phase 28 | Pending |
| E2E-10 | Phase 28 | Pending |
| E2E-11 | Phase 28 | Pending |
| E2E-12 | Phase 28 | Pending |
| E2E-13 | Phase 28 | Pending |
| E2E-14 | Phase 28 | Pending |
| E2E-15 | Phase 28 | Pending |
| API-01 | Phase 28 | Pending |
| API-02 | Phase 28 | Pending |
| API-03 | Phase 28 | Pending |
| API-04 | Phase 28 | Pending |
| API-05 | Phase 28 | Pending |
| API-06 | Phase 28 | Pending |
| API-07 | Phase 28 | Pending |
| TEST-01 | Phase 29 | Pending |
| TEST-02 | Phase 29 | Pending |
| TEST-03 | Phase 29 | Pending |
| TEST-04 | Phase 29 | Pending |
| TEST-05 | Phase 29 | Pending |
| TEST-06 | Phase 29 | Pending |
| TEST-07 | Phase 29 | Pending |
| TEST-08 | Phase 29 | Pending |
| TEST-09 | Phase 29 | Pending |
| TEST-10 | Phase 29 | Pending |
| TEST-11 | Phase 29 | Pending |
| TEST-12 | Phase 29 | Pending |
| STRM-01 | Phase 30 | Pending |
| STRM-02 | Phase 30 | Pending |
| STRM-03 | Phase 30 | Pending |
| STRM-04 | Phase 30 | Pending |
| STRM-05 | Phase 30 | Pending |
| STRM-06 | Phase 30 | Pending |
| STRM-07 | Phase 30 | Pending |
| AIGEN-01 | Phase 31 | Pending |
| AIGEN-02 | Phase 31 | Pending |
| AIGEN-03 | Phase 31 | Pending |
| AIGEN-04 | Phase 31 | Pending |
| AIGEN-05 | Phase 31 | Pending |

**Coverage:**
- v6.0 requirements: 58 total
- Mapped to phases: 58
- Unmapped: 0

---
*Requirements defined: 2026-03-12*
*Traceability updated: 2026-03-12 (roadmap created)*
