# DocFlow

## What This Is

DocFlow is a self-hosted document processing platform that ingests multiple sources (PDFs, URLs, YouTube, notes), processes them through LLMs to generate structured documents, and enables RAG-powered chat over the results. Built for internal use on a local server with GPU acceleration.

## Core Value

Turn scattered source documents into a structured, searchable knowledge base that users can query via natural language chat.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Project CRUD with pipeline lifecycle (draft → processed → RAG indexed) — v0
- ✓ Multi-source ingestion: file upload (PDF via poppler), URL, YouTube, notes — v0
- ✓ Source management: reorder, process modes (process/direct/exclude), re-extraction — v0
- ✓ LLM processing via LiteLLM proxy (multi-provider: OpenAI, Anthropic, Google, Ollama) — v0
- ✓ Versioned processing output with history — v0
- ✓ RAG pipeline: chunking → Ollama embeddings → Qdrant vector search — v0
- ✓ Chat interface with RAG-powered Q&A — v0/v1.0
- ✓ Workers (reusable processing templates) and Skills (composable prompt modules) — v0
- ✓ Custom Agents with OpenClaw integration — v0
- ✓ Settings management (API keys, models, processing config) — v0
- ✓ System health diagnostics — v0
- ✓ Docker deployment with GPU support — v0
- ✓ Stale detection (content_updated_at tracking) — v0
- ✓ Contextual explanation banners in process and RAG panels — v0
- ✓ Fix RAG chat retrieval (shared services, limit 10, no score filter) — v1.0
- ✓ Real-time RAG indexing progress bar with polling — v1.0
- ✓ Re-index cleans old Qdrant collection — v1.0
- ✓ Multi-agent task system with sequential pipeline execution — v2.0
- ✓ Task wizard (4-step creation flow with @dnd-kit pipeline builder) — v2.0
- ✓ Task execution engine (agent → checkpoint → merge steps) — v2.0
- ✓ Real-time execution monitoring with 2s polling — v2.0
- ✓ Task templates (3 seed templates) — v2.0
- ✓ Rebranding: DocFlow → DoCatFlow (logo, sidebar, favicon, colors mauve, typography Inter) — v4.0
- ✓ Welcome/onboarding screen with feature showcase — v4.0
- ✓ CatBot: AI assistant with 11 tools, floating panel, configurable model/personality — v4.0
- ✓ CatBot superpoderes: 5 sudo tools (bash, services, files, credentials, MCP) con seguridad scrypt/TTL/lockout — v4.0
- ✓ Host Agent: microservicio Node.js en el host (systemd) como puente CatBot ↔ host system — v4.0
- ✓ Escalabilidad: eliminación de IPs/usuarios hardcodeados, todo dinámico via env vars y os.userInfo() — v4.0
- ✓ MCP Bridge: per-project RAG exposed as MCP server (3 tools) — v4.0
- ✓ UX polish: breadcrumbs, page-header, footer, animations, responsive sidebar — v4.0
- ✓ Canvas data model (3 tables), full CRUD API (12 endpoints), list page, wizard — v5.0
- ✓ Canvas React Flow editor with 8 custom node types, palette, connection validation — v5.0
- ✓ Canvas auto-save, undo/redo, dagre auto-layout — v5.0
- ✓ Canvas execution engine backend (DAG topological sort, fire-and-forget) — v5.0
- ✓ Canvas visual execution state (polling, node colors, animated edges, toolbar progress) — v5.0
- ✓ Cache en memoria con TTL para endpoints frecuentes (agents, dashboard, settings, health) — v6.0
- ✓ Retry logic (withRetry) para todas las llamadas a servicios externos — v6.0
- ✓ React Error Boundaries por sección con fallback y reporte a CatBot — v6.0
- ✓ Streaming de respuestas LLM en Chat RAG, CatBot y procesamiento (token a token) — v7.0
- ✓ Playwright E2E + API tests con Page Object Model (15 E2E specs + 4 API specs) — v7.0
- ✓ Página /testing integrada: ejecutar tests, resultados, historial, cobertura — v7.0
- ✓ Generación de tests con IA usando LLM — v7.0
- ✓ Logging estructurado JSONL con niveles, rotación 7 días, integración en todos los endpoints — v7.0
- ✓ Visualización de logs en /testing con filtros y búsqueda — v7.0
- ✓ Sistema de notificaciones: campana, badge, dropdown, generación automática en procesos — v7.0
- ✓ Endpoints de notificaciones (CRUD + conteo + marcar leídas) — v7.0
- ✓ Canvas templates: 4 plantillas pre-configuradas (Pipeline Agentes, Investigacion RAG, Workflow Completo, Decision con Ramas) — v5.0
- ✓ Canvas mode filtering: paleta de nodos filtrada segun modo del canvas (agents/projects/mixed) — v5.0
- ✓ Interceptor global de errores: monkey-patch fetch, captura errores HTTP y JS, auto-abre CatBot con contexto — v8.0
- ✓ Badge rojo animado en boton flotante CatBot cuando hay error sin atender — v8.0
- ✓ Deteccion automatica de servicio afectado (Qdrant, LiteLLM, Ollama, n8n, OpenClaw) — v8.0
- ✓ Historial de errores persistido en SQLite (ultimos 10, consultable por CatBot) — v8.0
- ✓ Tool search_documentation: busqueda en archivos .md del proyecto con chunking y scoring — v8.0
- ✓ Tool read_error_history: lectura del historial de errores capturados — v8.0
- ✓ Endpoint GET /api/catbot/search-docs con cache TTL 5min — v8.0
- ✓ Endpoint GET/POST /api/catbot/error-history para persistencia de errores — v8.0
- ✓ Tabla de troubleshooting en system prompt de CatBot (9 errores comunes) — v8.0
- ✓ Protocolo de diagnostico automatico para mensajes de error interceptados — v8.0
- ✓ Validacion de modelos LLM: getAvailableModels() + resolveModel() con cache 60s — v8.0
- ✓ Fallback inteligente de modelo en task executor antes de llamar LiteLLM — v8.0
- ✓ Endpoint GET /api/models para exponer lista de modelos disponibles — v8.0

- ✓ Holded MCP: servidor MCP (patrón LinkedIn Intelligence, systemd host, puerto 8766) — v17.0
- ✓ Módulos CRM (leads, funnels, eventos), Proyectos (tareas, horas, batch), Equipo (empleados, fichaje jornada) — v17.0
- ✓ Contactos mejorados (fuzzy matching, confidence score) + Facturación simplificada — v17.0
- ✓ Integración DoCatFlow: CatBot tools Holded, nodo CONNECTOR, tarjeta /system, tests — v17.0

- ✓ Auditoría API Holded: corregir 7 bugs críticos en campos enviados (duration, userId, timestamps, notas) — v18.0
- ✓ Safe Delete: sistema de confirmación por email para todas las operaciones DELETE en Holded — v18.0
- ✓ Tests de integración con API real + system prompt mejorado con campos críticos — v18.0

- ✓ SearXNG self-hosted en Docker como metabuscador web (JSON API, puerto 8080) — v12.0
- ✓ Gemini Google Search grounding via LiteLLM (modelo gemini-search) — v12.0
- ✓ CatBrain WebSearch: nodo reutilizable con selector de motor (SearXNG/Gemini/Ollama/auto) — v12.0
- ✓ Endpoint /api/websearch/search con orquestacion multi-motor y fallback — v12.0
- ✓ Integracion Canvas + Tareas via executeWebSearch() — v12.0
- ✓ Columnas search_engine e is_system en tabla catbrains — v12.0
- ✓ Proteccion de CatBrains de sistema (is_system: 1, no eliminables) — v12.0

### Active

<!-- Current scope. Building toward these. -->

(No active requirements -- v18.0 complete, next milestone TBD)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Multi-user authentication — internal single-user tool
- Real-time WebSocket updates — polling is sufficient
- Embedding model changes — dynamic detection via Ollama (MRL support added in v10.0 RAG improvements)
- Parallel step execution — sequential only
- Task scheduling/cron — manual execution only
- WebSocket para notificaciones — polling cada 15s es suficiente
- Auto-creating n8n workflows — only provide templates/instructions
- CatBot delete actions (via basic tools) — too risky, only create/read/list actions. Sudo bash_execute can delete if authorized.
- Canvas loop detection at runtime — DAG only for v5.0, loops deferred
- Canvas parallel node execution — sequential topological order for v5.0
- SearXNG con autenticacion — single-server internal, no expuesto a internet
- Scraping directo de Google — SearXNG lo abstrae via metabusqueda
- Rate limiter distribuido para SearXNG — single-server, sin necesidad de coordinacion
- Ollama Web Search como servicio self-hosted — es API externa de ollama.com, no self-hosteable
- Paid testing tools (Mabl, testRigor, etc.) — self-hosted only
- Test persistence in external DB — Playwright JSON reports parsed from filesystem
- WebSocket for test progress — polling sufficient

## Milestone History

### v1.0 — Fix RAG Chat + Mejoras de indexacion (COMPLETE)
- Chat endpoint rewritten with shared services (ollama.ts, qdrant.ts)
- RAG indexing progress bar with chunksProcessed/chunksTotal
- 2 phases, 14 requirements, all complete

### v2.0 — Sistema de Tareas Multi-Agente (COMPLETE)
- Data model: tasks, task_steps, task_templates tables
- Full CRUD API (13 endpoints)
- Pipeline execution engine with context passing, RAG, checkpoints, merge
- Task list page with filters, templates, status badges
- 4-step wizard with @dnd-kit drag-and-drop pipeline builder
- Real-time execution view with polling, checkpoint UI, progress bar
- 6 phases, 48 requirements, all complete

### v3.0 — Conectores + Dashboard de Operaciones (COMPLETE)
- Connector system: 4 types (n8n_webhook, http_api, mcp_server, email) with CRUD, test, logs
- Pipeline connector execution (before/after modes) + agent-connector access
- Usage tracking across all LLM endpoints with cost calculation
- Operations dashboard with recharts charts, activity feed, top agents/models, storage
- 6 phases (9-14), 48 requirements, all complete

### v5.0 — Canvas Visual de Workflows (COMPLETE)
- Canvas data model: canvases, canvas_runs, canvas_templates tables + full CRUD API
- Canvas list page with SVG thumbnails, filters by mode, wizard creation
- React Flow editor with 8 custom node types, drag-and-drop, connection validation
- Auto-save, undo/redo, dagre auto-layout
- Execution engine backend (canvas-executor.ts, DAG topological sort)
- Visual execution state: polling, node colors, animated edges, toolbar progress
- 4 canvas templates seeded (Pipeline Agentes, Investigacion RAG, Workflow Completo, Decision con Ramas)
- Node palette filtering by canvas mode (agents/projects/mixed)
- 4 phases (23-26), 52 requirements, all complete

### v6.0 — Testing Inteligente + Performance + Estabilización (PARTIAL — phase 27 complete, 28-31 superseded by v7.0)
- Resilience foundations: withRetry on all service modules, TTL cache on 11 GET routes, error boundaries for 8 app sections
- 1 phase (27) complete, 4 phases (28-31) superseded by v7.0 detailed spec
- 5 phases allocated (27-31), 8/58 requirements complete

### v7.0 — Streaming + Testing + Logging + Notificaciones (COMPLETE)
- Streaming de respuestas LLM token a token en Chat RAG, CatBot y procesamiento
- Playwright E2E (15 specs) + API tests (4 specs) con Page Object Model
- Pagina /testing integrada: ejecutar tests, resultados, historial, generacion con IA
- Logging estructurado JSONL con rotacion, integracion en todos los endpoints, visualizacion en /testing
- Sistema de notificaciones: tabla, generacion automatica, campana con badge, dropdown, endpoints CRUD
- 6 phases (32-37), 53 requirements, all complete

### v8.0 — CatBot Diagnosticador + Base de Conocimiento (COMPLETE)
- Interceptor global de errores (fetch monkey-patch + JS errors) con auto-apertura de CatBot
- Base de conocimiento: búsqueda en archivos .md del proyecto con chunking y scoring
- Diagnóstico inteligente con tabla de troubleshooting de 9 errores comunes
- Validación y fallback de modelos LLM (resolveModel con cache 60s)
- Historial de errores persistido en SQLite (últimos 10, consultable por CatBot)
- 1 phase (38), 15 requirements, all complete

### v9.0 — CatBrains (COMPLETE)
- Renombrado completo Projects → CatBrains (tabla, rutas, UI, sidebar, Canvas, Tareas)
- Migracion automatica de datos (projects → catbrains, columnas nuevas)
- Conectores propios por CatBrain (catbrain_connectors, CRUD, panel UI, test)
- System prompt configurable e inyectable en chat, Canvas, Tareas
- Contrato CatBrainInput/CatBrainOutput + executeCatBrain() centralizado
- Nodo CATBRAIN en Canvas con selector de modo, pestana Configuracion
- Red de CatBrains via MCP
- 3 phases (39-41), 23 requirements, all complete

### v11.0 — LinkedIn MCP Connector (COMPLETE)
- Scripts de instalacion, servicio systemd, rate limiter Python
- Seed conector seed-linkedin-mcp en BD (tipo mcp_server)
- Health check condicional, tarjeta /system, footer dot, CatBot awareness
- 1 phase (47), 7 requirements, all complete

### v12.0 — WebSearch CatBrain (COMPLETE)
- SearXNG self-hosted en Docker (puerto 8080, JSON API, Brave/DuckDuckGo/Google/Wikipedia)
- Gemini Google Search grounding via LiteLLM (endpoint /api/websearch/gemini)
- Multi-engine search orchestrator (/api/websearch/search) con fallback auto
- CatBrain "WebSearch" protegido (is_system: 1) con selector de motor
- Canvas + Tasks integration via executeWebSearch()
- Health check, tarjeta /system violet, footer dot para SearXNG
- UI: badge Sistema, engine selector tab, test panel, canvas node badge
- E2E + API tests, update script, maintenance docs
- 2 phases (48-49), 28 requirements, all complete

### v14.0 — CatBrain UX Redesign (COMPLETE)
- Fix CORS: /api/agents proxy interno a /api/cat-paws (sin redirects)
- Modal de entrada al CatBrain con 3 acciones (Chatear, Fuentes, Reset)
- Pipeline simplificado de fuentes en 3 fases (Fuentes → Procesar → Indexar RAG)
- Reset CatBrain con endpoint POST y confirmación en 2 pasos
- RAG SSE streaming, info bar, mejoras de robustez
- i18n completo (es.json + en.json) para todas las claves nuevas
- 5 phases (52-56), 37 requirements, all complete

### v15.0 — Tasks Unified (COMPLETE)
- Canvas como paso de tarea (subagente que ejecuta un canvas y devuelve output)
- Fork/Join: ramas paralelas (max 3) con consolidación de outputs
- Wizard cascada vertical (5 secciones)
- Ciclos de ejecución: única, variable (N veces), programada (scheduler interno setInterval 60s)
- Sistema de exportación: bundle ZIP portable con installer multiplataforma + runner HTML
- Sidebar: Canvas eliminado, se accede desde Tareas; /canvas → /tasks redirect
- 6 phases (57-62), ~77 requirements, all complete

### v16.0 — CatFlow (COMPLETE)
- Rename Tareas → CatFlow (sidebar, routes, i18n, backward compat)
- 3 new canvas nodes: Scheduler (delay/count/listen), Storage (local/connector/LLM), MultiAgent (sync/async)
- Config panel redesign: right sidebar w-80 + copy/paste (Ctrl+C/V)
- Inter-CatFlow communication: catflow_triggers, listen_mode, trigger chains
- Enhanced START (listen badge/handle) + Enhanced OUTPUT (notifications, triggers)
- CatBot: 4 new tools (list/execute/toggle/fork), 8 E2E + 3 API test specs
- 8 phases (63-70), 76 requirements, 69 PASS / 5 PARTIAL / 2 FAIL (cosmetic)

## Context

- Agents exist in `custom_agents` table + OpenClaw agents (fetched via GET /api/agents) — to be unified into cat_paws
- Workers exist in `docs_workers` table — to be unified into cat_paws (mode: processor)
- Skills exist in `skills` table with instructions, templates, constraints; linked via agent_skills + worker_skills
- LLM calls go through `llm.ts` service (chatCompletion with provider/model routing)
- Task executor calls LiteLLM directly via fetch (not llm.ts)
- RAG search via `ollama.ts` (getEmbedding) + `qdrant.ts` (search), smart chunking, MRL support
- CatBrains have `rag_collection`, `system_prompt`, `mcp_enabled`, `rag_model` fields
- executeCatBrain() orchestrates RAG + connectors + LLM with system prompt injection
- CatBrainInput/CatBrainOutput interfaces in lib/types/catbrain.ts
- @dnd-kit installed for drag-and-drop
- recharts installed for dashboard charts
- Task execution: fire-and-forget, in-memory cancel flags
- Connector calls: fetch() with configurable timeout
- Usage logs: 6 event types, token counts, estimated_cost, metadata JSON
- Dashboard: 6 API endpoints, recharts bar chart, activity feed
- Connectors: 4 types, 8 API endpoints, agent_connector_access table
- Logo exists at app/images/logo.jpg (cat with VR glasses and suit)
- CatBot sudo tools (catbot-sudo-tools.ts) proxy through Host Agent (scripts/host-agent.mjs) via HTTP
- Host Agent runs on port 3501 as systemd user service, authenticated by Bearer token
- Host Agent uses os.userInfo() and os.homedir() — no hardcoded users/paths
- CatBot sudo security: scrypt hash, in-memory session Map with TTL, lockout after 5 failed attempts
- API routes use `localhost` as default fallback for all service URLs (env vars override)
- docker-compose.yml uses `${HOME}` for volume paths (shell expansion)
- React Flow installed (@xyflow/react v12, @dagrejs/dagre)
- Task execution engine (task-engine.ts) + canvas-executor.ts for DAG execution
- Playwright installed as devDependency (@playwright/test), chromium in Dockerfile
- Tests execute against running Docker app (baseURL: http://localhost:3500)
- Playwright JSON + HTML reporters for results parsing
- LiteLLM proxy supports streaming (stream: true in request body, OpenAI-compatible chunks)
- ReadableStream Web API for server-to-client streaming (Content-Type: text/event-stream)
- Notifications: SQLite table, polling cada 15s, no WebSocket
- Logger: JSONL format, fs.appendFileSync, /app/data/logs/docatflow-YYYY-MM-DD.log
- test_runs table for persisting Playwright execution results
- Error interceptor: monkey-patch fetch in layout, dispatches CustomEvent 'catbot:error', CatBot listens
- Error history persisted in settings table under key 'catbot_error_history' (JSON array, max 10)
- search-docs endpoint reads .md files from /app/.planning/ and /app/.planning/Progress/
- litellm.ts: getAvailableModels() cached 60s, resolveModel() validates + fallback
- Task executor uses litellm.resolveModel() before calling LLM
- Error formatter uses XMLHttpRequest (not fetch) to POST to /api/catbot/error-history to avoid interceptor loop

## Constraints

- **Language**: All UI text, logs, and comments in Spanish
- **Build**: `npm run build` must pass without errors
- **Stack**: Next.js 14 App Router, better-sqlite3, Qdrant, Ollama, recharts
- **Env vars**: Use `process['env']['VARIABLE']` bracket notation
- **API routes**: Must export `dynamic = 'force-dynamic'` if they read env vars
- **Max connectors**: 20 per installation (validated in API)
- **Connector logs**: Truncate payload to 5000 chars
- **Usage logs**: Insert in background (non-blocking)
- **crypto.randomUUID**: NOT available in HTTP context — use generateId() helper
- **Colors**: Primary mauve (#8B6D8B), accent violet-500/600, bg zinc-950
- **CatBot**: localStorage for conversation history (not server DB). Sudo tools require Host Agent running on host.
- **No hardcoded IPs/users**: All URLs default to `localhost`, all paths use `$HOME`/`os.homedir()`. Use env vars to override.
- **MCP**: Streamable HTTP protocol, one endpoint per project
- **Logo**: app/images/logo.jpg — use as Next.js static import, crop to circle
- **Canvas**: React Flow container needs fixed height (h-[calc(100vh-64px)])
- **Canvas nodes**: min-width 200px, max-width 300px, responsive
- **Canvas auto-save**: debounce 3s using useCallback + setTimeout
- **Canvas DAG**: no loops allowed, topological sort for execution order
- **Canvas execution**: reuses task-engine.ts patterns adapted for DAG
- **Playwright**: devDependency only, chromium browser, tests run against Docker app
- **Streaming**: Web Streams API (ReadableStream), Content-Type text/event-stream, no WebSocket
- **Cache**: in-memory Map with TTL, resets on server restart (no persistence)
- **Logs**: JSONL format, fs.appendFileSync (sync to avoid loss on crash), rotate after 7 days, write to /app/data/logs/
- **Testing page**: /testing in sidebar between Conectores and Configuración
- **Notifications**: SQLite table, polling cada 15s para badge, no WebSocket
- **Playwright Docker**: chromium + deps installed in Dockerfile runner stage
- **Streaming cursor**: blinking `▊` with CSS animation 0.8s, auto-scroll follows tokens
- **Notification bell**: sidebar/header, z-50, badge rojo animate-bounce on new
- **Error interceptor**: excludes polling endpoints (/api/system, /api/health, /api/notifications/count, /api/testing/status, /api/canvas/runs/)
- **Error history**: max 10 errors, FIFO, persisted in settings table as JSON
- **Doc search**: text-based chunking ~500 chars, top 5 results, cache 5 min per file
- **Model validation**: cache 60s, fallback chain: requested → settings default → first available

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use bracket notation for env vars | Bypass webpack inlining at build time | ✓ Good |
| node:20-slim Docker base | better-sqlite3 needs glibc (not musl/Alpine) | ✓ Good |
| Child process for RAG worker | Avoid OOM in Next.js runtime during embedding | ✓ Good |
| Polling for progress | Simpler than WebSocket, sufficient for use case | ✓ Good |
| Sequential pipeline only | Simpler mental model, parallel can come later | ✓ Good |
| In-process execution | No separate worker process needed for LLM calls | ✓ Good |
| generateId() over crypto.randomUUID | crypto.randomUUID requires HTTPS, app runs HTTP | ✓ Good |

| CatBot messages in localStorage | Simpler than server DB, per-browser history | ✓ Good |
| MCP Streamable HTTP per project | Standard protocol, one endpoint per RAG | ✓ Good |
| No CatBot delete actions | Safety — only create/list/navigate actions | ✓ Good |
| Host Agent for sudo tools | Docker container can't access host system; lightweight HTTP bridge | ✓ Good |
| Scrypt for sudo password | Industry-standard KDF, timing-safe comparison, in-memory sessions | ✓ Good |
| localhost as default fallback URLs | Portability — no hardcoded IPs, works for any user/server | ✓ Good |

| React Flow for canvas editor | Industry-standard node editor, supports custom nodes | ✓ Good |
| dagre for auto-layout | Lightweight DAG layout algorithm, well-supported | ✓ Good |
| Canvas DAG-only (no loops) | Simpler execution model, loops deferred | ✓ Good |
| Sequential topological execution | Simpler than parallel, sufficient for v5.0 | ✓ Good |
| SVG thumbnails for canvas cards | Lightweight, auto-generated from node positions | ✓ Good |
| Playwright for E2E testing | Industry standard, headless chromium, JSON reporter | ✓ Good |
| LLM streaming via ReadableStream | Standard Web API, no WebSocket dependency | ✓ Good |
| In-memory TTL cache | Simple Map-based, no external cache needed | ✓ Good |
| withRetry utility for external calls | Centralized retry with exponential backoff | ✓ Good |
| Structured file logging | JSONL logs with rotation, visible in /testing | ✓ Good |
| Notifications via SQLite + polling | Simpler than WebSocket, sufficient for single-user | ✓ Good |
| Chromium in Dockerfile | Enables running Playwright tests inside container | ✓ Good |
| Canvas templates seeded at startup | 4 reusable templates, from-template API handles duplication | ✓ Good |
| Canvas mode filtering in palette | Per-mode node visibility, mixed shows all 8 types | ✓ Good |
| Fetch monkey-patch for error interception | Captures all HTTP errors globally without modifying each component | ✓ Good |
| XMLHttpRequest for error-history POST | Avoids recursive fetch interceptor loop | ✓ Good |
| Text search (not vector) for doc search | No external dependencies, sufficient for ~15 .md files | ✓ Good |
| Error history in settings table | Reuses existing key-value store, no new table needed | ✓ Good |
| Model validation with cache | 60s TTL prevents extra API call per LLM request while keeping list fresh | ✓ Good |
| ErrorInterceptorProvider as dynamic import | Keeps layout.tsx as Server Component, hook runs client-only | ✓ Good |
| SearXNG as metasearch engine | Self-hosted, no API keys, aggregates 246 engines | ✓ Good |
| Multi-engine search with auto fallback | SearXNG → Gemini → Ollama chain ensures resilience | ✓ Good |
| is_system column for CatBrain protection | Prevents accidental deletion of system CatBrains (403) | ✓ Good |
| search_engine column per CatBrain | Per-CatBrain engine selection, not global setting | ✓ Good |
| SearXNG health check 3s timeout | Faster than 5s default — local service should respond quickly | ✓ Good |

### v10.0 — CatPaw: Unificacion de Agentes (COMPLETE)
- CatPaw entity unifying custom_agents + docs_workers with chat/processor/hybrid modes
- Full API REST + execution engine (executeCatPaw)
- Redesigned /agents page with wizard, detail tabs, direct chat
- Canvas + Tasks integration with CatPaw selectors
- CatBot tools, migration banner, dashboard stats, seeds
- Testing with Vitest unit tests + rewritten E2E/API specs
- 6 phases (42-47), 50 requirements, all complete

### v17.0 — Holded MCP (COMPLETE)
- Fork iamsamuelfraga/mcp-holded adapted to DoCatFlow pattern (systemd, HTTP port 8766)
- CRM: leads, funnels, events, fuzzy ID resolver
- Projects: CRUD, tasks, time tracking with batch registration
- Team: employees, timesheets, clock actions, weekly summary
- Contacts improved: fuzzy matching, confidence score, context tool
- Invoicing simplified: quick_invoice, list, summary, pay, send, PDF
- DoCatFlow integration: 10 CatBot tools, Canvas MCP executor, System UI, E2E/API tests
- 6 phases (71-76), ~58 requirements, all complete

### v18.0 — Holded MCP: Auditoria API + Safe Deletes (COMPLETE)
- Auditoria y correccion de 7 bugs criticos en campos API (duration, userId, timestamps, notas)
- Sistema Safe Delete: confirmacion por email con tokens para 14 DELETE tools
- Tests de integracion contra API real de Holded
- System prompt CatPaw actualizado con campos criticos
- 5 phases (77-81), ~26 requirements, all complete

## Current Milestone: v18.0 Holded MCP — Auditoría API + Safe Deletes (COMPLETE)

**Status:** COMPLETE (2026-03-24)

All target features delivered:
- ✓ Corrección de 7 bugs críticos en campos API (duration, userId, timestamps, notas)
- ✓ Sistema Safe Delete con confirmación por email (nodemailer + tokens + HTTP endpoint)
- ✓ Tests de integración con API real
- ✓ System prompt mejorado con campos críticos

---
*Last updated: 2026-03-24 — v18.0 milestone COMPLETE*
