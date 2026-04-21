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

- ✓ CatPaw Directory: taxonomia de departamentos (9 valores) con API validada — v20.0
- ✓ Pagina /agents rediseñada como directorio expandible (Empresa/Personal/Otros) — v20.0
- ✓ Busqueda en tiempo real con highlight y auto-expand de secciones — v20.0
- ✓ Selector de departamento obligatorio en wizard/formulario CatPaw — v20.0
- ✓ Badge de departamento en tarjeta CatPawCard con colores por grupo — v20.0
- ✓ CatBot tool create_catpaw con parametro department — v20.0

- ✓ Skills Directory: nueva taxonomia de 5 categorias (writing, analysis, strategy, technical, format) — v21.0
- ✓ 20 skills nuevos curados + pagina /skills rediseñada como directorio expandible — v21.0
- ✓ Skill Arquitecto de Agentes: CatBot busca agentes existentes antes de crear, recomienda skills — v21.0

- ✓ CatBot en Telegram: long polling, sudo adaptado, wizard en Settings — v22.0
- ✓ Whitelist de usuarios, permisos configurables, token cifrado AES-256-GCM — v22.0
- ✓ Canvas: badge "En ejecucion" en lista + auto-reconnect en editor — v22.0

- ✓ CatPaw Operador Holded: generalista CRM con conector Holded MCP (buscar/crear leads + notas) — v29.0
- ✓ Knowledge Base `.docflow-kb/`: 10 subdirs + `frontmatter.schema.json` (13 campos bilingüe) + `tag-taxonomy.json` controlado — v29.1
- ✓ Servicio `knowledge-sync.ts`: `syncResource`/`touchAccess`/`detectBumpLevel`/`markDeprecated` con semver automático — v29.1
- ✓ CLI `scripts/kb-sync.cjs`: `--full-rebuild`/`--audit-stale`/`--archive`/`--purge` + retention 150d/170d/180d + `--restore --from-legacy` — v29.1
- ✓ KB Populate desde DB: regeneración live-DB de 6 entidades con idempotence + orphan detection + security (no `connectors.config` leak) — v29.1
- ✓ Static knowledge migrado al KB: `.planning/knowledge/` + `app/data/knowledge/` + skills/prompts → `domain/`/`rules/`/`protocols/`/`runtime/` — v29.1
- ✓ Tools CatBot `search_kb` + `get_kb_entry` (always-allowed) + campo `kb_entry` en 5 listing tools — v29.1
- ✓ `_header.md` inyectado en prompt-assembler como P1 system context; `buildKbHeader()` en `catbot-prompt-assembler.ts` — v29.1
- ✓ Creation hooks: 22 sitios (6 tool cases + 15 API routes + 1 sudo tool) disparan `syncResource` en cada write DB — v29.1
- ✓ `kb-audit.ts` con `markStale()` y log `_sync_failures.md` independiente del audit schema-validado — v29.1
- ✓ Dashboard `/knowledge`: 4 filtros (type/subtype/status/audience+tags+search), timeline recharts, 8-card counts bar, 125-row table — v29.1
- ✓ Vista detalle `/knowledge/[id]` con markdown body via remark-gfm + related resolved + metadata + `/api/knowledge/[id]` endpoint — v29.1
- ✓ Legacy cleanup: borrado físico de `.planning/knowledge/` + `app/data/knowledge/` + `knowledge-tree.ts` + `TabKnowledgeTree` — v29.1
- ✓ CLAUDE.md simplificado 80→46 líneas (pointer a `_manual.md` + `search_kb({tags:['critical']})` para R26-R29) — v29.1
- ✓ Restricciones absolutas como rule atoms: R26 (canvas-executor inmutable), R27 (agentId UUID), R28 (`process['env']`), R29 (Docker rebuild) — v29.1
- ✓ `canvas-rules.ts` reescrito para leer desde `.docflow-kb/rules/` (R01-R30 + SE01-SE03 + DA01-DA04) con contrato público byte-idéntico — v29.1
- ✓ Canvas write-path KB sync: POST/PATCH/DELETE `/api/canvas/*` + `delete_catflow` sudo soft-delete via `markDeprecated` — v29.1
- ✓ Link tools re-sync parent CatPaw: `link_connector_to_catpaw` + `link_skill_to_catpaw` regeneran body con `## Conectores vinculados`/`## Skills vinculadas` + `buildSearchHints` frontmatter — v29.1
- ✓ Retention policy documentada: `.docflow-legacy/orphans/` via `git mv` + R30 rule atom (`search_kb({tags:['retention']})`) — v29.1
- ✓ Rebuild determinism: `loadArchivedIds()` + Pass-2 exclusion gate + `buildBody(subtype,row,relations?)` 3-arg (cierra regresión commit 06d69af7) — v29.1

## Current Milestone: v30.0 LLM Self-Service para CatBot

**Goal:** CatBot puede consultar qué modelos LLM hay disponibles, qué capacidades tienen (extended thinking, max tokens, tier free/paid), recomendar el mejor para una tarea, y cambiar su propio LLM bajo instrucción del usuario con sudo. El control manual (UI Enrutamiento) y programático (tools) usan la misma infraestructura.

**Prerequisitos de v29.1:** Milestone v29.1 en verify (Phase 157 KB Rebuild Determinism). Centro de Modelos UI (v25.1) ya entregado con 4 tabs. Alias routing básico funcional.

**Target features:**
- Catálogo `model_intelligence` extendido con capabilities (`supports_reasoning`, `max_tokens_cap`, `tier`)
- `model_aliases` extendido con per-alias `reasoning_effort`, `max_tokens`, `thinking_budget`
- Backend passthrough: `streamLiteLLM` propaga reasoning params a LiteLLM (Claude Opus/Sonnet 4.6 + Gemini 2.5 Pro)
- Extended thinking verificado end-to-end (max potential: budget configurable hasta tope del modelo)
- CatBot tools: `list_llm_models` (catálogo con capabilities), `get_catbot_llm` (config actual), `set_catbot_llm` (sudo-gated)
- UI tab-enrutamiento: dropdown Inteligencia + slider max_tokens condicionales por capability
- Skill KB "Operador de Modelos": CatBot recomienda Opus+thinking alto vs Gemma local según tarea
- Free tier preservado: Ollama/Gemma local siempre disponible sin coste

### Active

<!-- Current scope. Building toward these. -->

#### v30.0 — LLM Self-Service para CatBot

- [ ] Schema `model_intelligence` con columnas `supports_reasoning`, `max_tokens_cap`, `tier`
- [ ] Schema `model_aliases` con columnas `reasoning_effort`, `max_tokens`, `thinking_budget`
- [ ] Seed: Claude Opus/Sonnet 4.6 + Gemini 2.5 Pro marcados como reasoning-capable; Ollama tier=free
- [ ] `streamLiteLLM` propaga `reasoning_effort`/`thinking`/`max_tokens` al body de LiteLLM
- [ ] `resolveAlias` devuelve objeto completo `{model, reasoning_effort, max_tokens, thinking_budget}`
- [ ] CatBot tool `list_llm_models` devuelve catálogo con capabilities y tier
- [ ] CatBot tool `get_catbot_llm` devuelve config actual del alias `catbot`
- [ ] CatBot tool `set_catbot_llm` cambia config de `catbot` (sudo-gated, valida capabilities)
- [ ] Tab Enrutamiento: dropdown Inteligencia + input max_tokens condicionales por capability del modelo
- [ ] Skill KB "Operador de Modelos" con reglas de recomendación (tarea simple→Gemma, razonamiento→Opus high)
- [ ] Oracle CatBot 3/3: (a) enumera modelos con capabilities, (b) cambia a Opus+thinking alto tras sudo, (c) próxima respuesta usa reasoning_content

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
- Google Workspace Shared Drives — solo My Drive y drives compartidos con SA
- Google Docs/Sheets/Slides en formato nativo — solo exportados a PDF/text via Drive export API
- Drive Push Notifications/webhooks — requiere dominio publico, usar polling
- Multi-cuenta Drive — una configuracion por conector
- OAuth2 OOB flow — deprecado por Google oct 2022, usar web callback redirect
- Taxonomía de departamentos editable por el usuario — fija en v20.0, editable en futuro
- Drag-and-drop para reordenar agentes dentro de secciones — no necesario para v20.0

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

### v19.0 — Conector Google Drive (COMPLETE)
- Google Drive data model (3 tablas: drive_sync_jobs, drive_indexed_files, columnas en sources), 4 interfaces TypeScript
- Auth service dual: Service Account (JSON cifrado) + OAuth2 web callback (postMessage relay)
- Drive API service: list, download, upload, createFolder, getChanges, getStartPageToken
- Full CRUD API (12 endpoints): CRUD generico + test, invoke, browse, oauth2/auth-url, oauth2/callback
- Source indexacion: POST sources/drive descarga carpeta, extrae contenido, crea sources RAG-ready
- DrivePollingService: singleton con master tick 60s, per-job intervals, changes.list incremental, SHA-256 hash comparison
- Canvas integration: nodo CONNECTOR con google_drive branch (upload/download/list/create_folder)
- Wizard UI 4 pasos (SA + OAuth2), DriveFolderPicker lazy-loaded, DriveSubtitle
- Gmail Reader + CatPaw tool-calling (5 tools por conector Gmail, dual auth OAuth2/IMAP)
- 4 phases (82-85), code complete (phase 86 not needed — scope covered in 4 phases)

### v20.0 — CatPaw Directory (COMPLETE)
- Taxonomia de departamentos (9 valores) en cat_paws, API con validacion
- Pagina /agents rediseñada como directorio expandible (Empresa/Personal/Otros)
- Busqueda en tiempo real con highlight y auto-expand
- Selector de departamento, badge en tarjeta, CatBot tool, i18n
- 4 phases (87-90), 40 requirements, all complete

### v21.0 — Skills Directory (COMPLETE)
- Nueva taxonomia (writing, analysis, strategy, technical, format), 20 skills curados
- Pagina /skills como directorio expandible, tarjeta rediseñada, busqueda con highlight
- Skill Arquitecto de Agentes inyectada en CatBot (busca existentes, recomienda skills)
- 4 phases (91-94), 40 requirements, all complete

### v22.0 — CatBot en Telegram (COMPLETE)
- TelegramBotService con long polling, sudo scrypt, whitelist, permisos configurables
- Wizard 3 pasos en Settings, token cifrado AES-256-GCM
- Canvas badge "En ejecucion" + auto-reconnect desde fuentes externas
- Permission gate pre-call, auto-restart del poll loop, instrumentationHook fix
- 4 phases (95-98), 50 requirements, all complete

### v28.0 — CatFlow Intelligence (COMPLETE)
- CatBot score: 60/100 → 70/100 (medido), proyectado 85-92 post-gap-closure
- canvas_add_node: persistencia instructions, model, labels, edge validation
- canvas_set_start_input, extra_skill_ids, extra_connector_ids, buildNodeSummary
- Gemma4:e4b + aliases semánticos (canvas-classifier, canvas-writer, gemini-main)
- Skill Orquestador: PARTEs 15-20 (data contracts, reporting, restricciones executor)
- maxIterations=15, escalation threshold 10, reporting intermedio cada 4 iters
- Piloto Email Classifier E2E: email Pro-K12 verificado, spam filtrado
- CatBot construye canvas email 10/10 criterios (post-entrenamiento)
- Restricciones críticas descubiertas: no CONDITION/RAG/CatPaw en pipelines de datos
- 7 phases (138-144), 20 requirements, all complete

### v25.1 — Centro de Modelos (COMPLETE)
- ✓ Health API con verificación real por alias y proveedor
- ✓ Centro de Modelos shell con 4 tabs (Resumen, Proveedores, Modelos, Enrutamiento)
- ✓ Tab Proveedores: accordion cards con status, latencia, modelos
- ✓ Tab Modelos: MID cards agrupadas por tier, filtros, badges "en uso", costes inline
- ✓ Tab Enrutamiento: tabla compacta con semáforos, dropdown inteligente, verificación pre-cambio
- ✓ CatBot check_model_health tool con 3 modos (alias, modelo, self-diagnosis)
- ✓ Cleanup: ModelPricingSettings eliminado, Embeddings eliminado
- ✓ UI: horizontal tabs CatPower pattern, CatBoard, CatTools menu, model selector por tier

### v26.0 — CatBot Intelligence Engine (COMPLETE)
- ✓ Base de datos independiente catbot.db con perfiles de usuario, memoria, logs y resúmenes
- ✓ Knowledge Tree: wiki JSON estructurada de toda la plataforma (endpoints, tools, howto, pitfalls, sources)
- ✓ Config CatBot ampliada: instrucciones primarias/secundarias, personalidad custom, permisos sudo editables
- ✓ System prompt dinámico generado desde knowledge tree (PromptAssembler P0-P3)
- ✓ Perfiles de usuario evolutivos con initial_directives auto-generadas
- ✓ User memory: recipes aprendidas con trigger matching y Capa 0 de acceso instantáneo
- ✓ Protocolo de razonamiento adaptativo (simple/medio/complejo)
- 14 phases (118-132), ~41 requirements + PIPE-01..08 + QA2-01..08, all complete

### v27.0 — CatBot Intelligence Engine v2 — Memento Man fix (COMPLETE)
- ✓ Foundation & Tooling: timeouts 90s, job reaper 5min, persistencia outputs intermedios, test-pipeline.mjs
- ✓ Architect Data Layer: scanCanvasResources enriquecido (tools/CatPaws, contratos declarativos, canvases similares, templates)
- ✓ Architect Prompt Layer: ARCHITECT_PROMPT heartbeat checklist 7 secciones, QA role-aware, validador determinístico
- ✓ End-to-End Validation: design layer verificado, runtime deferred (INC-11/12/13 cerrados en 137-01)
- ✓ Learning Loops & Memory: CatPaw protocol skill, user_interaction_patterns, Telegram proposal UX, strategist fusion eval (DEFER)
- ✓ Architect self-healing: failure classifier, jsonrepair fallback, retry_intent_job tool, architect_max_tokens 16k
- 5 phases (133-137), 45 requirements, all complete

### v29.0 — CatFlow Inbound + CRM (PARTIAL — Phase 145 shipped with gaps, 146-148 carry forward)
- ✓ CatPaw Operador Holded: generalista CRM con Holded MCP (buscar/crear leads + notas, funnelId resolution)
- ⚠️ Phase 145 audit `gaps_found` (tests rojos + live-verify pendiente); scope del milestone cerrado con gaps documentados, cierre diferido pending Phase 146-148 execution
- 1/4 phases complete (145; 146-148 pending), 4/21 requirements complete (CRM-01..04)

### v29.1 — KB Runtime Integration (COMPLETE — 2026-04-21)
- ✓ `.docflow-kb/` como Source of Truth del conocimiento DocFlow: 10 subdirs, schemas bilingües, retention policy 150/170/180d, `.docflow-legacy/` zone
- ✓ Populate desde DB live (6 entidades, 66 archivos) + Static migration (`.planning/knowledge/` + prompts → `domain/rules/protocols/runtime/`, 128 entries)
- ✓ CatBot consume: tools `search_kb` + `get_kb_entry` (always-allowed) + `kb_entry` field en 5 listing tools + `_header.md` inyectado como P1 system context
- ✓ Creation hooks: 22 sitios (6 tool cases + 15 routes + 1 sudo) fire `syncResource` en cada DB write + `markStale` + `_sync_failures.md` + delete soft-delete via `markDeprecated` (no `fs.unlink`)
- ✓ Dashboard `/knowledge` + `/knowledge/[id]` + `/api/knowledge/[id]` (filters, timeline, counts bar, 125 entries) + sidebar nav
- ✓ Legacy cleanup: `app/data/knowledge/`, `.planning/knowledge/`, `knowledge-tree.ts`, `TabKnowledgeTree` físicamente borrados + CLAUDE.md 80→46 líneas
- ✓ Critical rule atoms R26-R29 + canvas-rules.ts rewritten to read from `.docflow-kb/rules/` (R01-R30 + SE01-SE03 + DA01-DA04) byte-idéntico
- ✓ Runtime integrity: canvas write-path sync + `delete_catflow` soft-delete + link tools re-sync parent CatPaw body (`## Conectores/Skills vinculadas`) + orphan cleanup + retention policy
- ✓ Rebuild determinism: `loadArchivedIds()` + Pass-2 exclusion + `buildBody(subtype,row,relations?)` 3-arg + R30 dual-discovery (cierra regresión commit 06d69af7)
- 9 phases (149-157), 45 requirements (KB-01..KB-43, KB-46, KB-47), all complete
- Deferred a v29.2: KB-44 (templates duplicate-mapping delta), KB-45 (`list_connectors` CatBot tool)

---
*Last updated: 2026-04-21 — v29.1 milestone shipped (KB Runtime Integration); v30.0 in progress (LLM Self-Service para CatBot)*
