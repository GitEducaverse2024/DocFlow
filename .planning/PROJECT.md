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
- ✓ MCP Bridge: per-project RAG exposed as MCP server (3 tools) — v4.0
- ✓ UX polish: breadcrumbs, page-header, footer, animations, responsive sidebar — v4.0
- ✓ Canvas data model (3 tables), full CRUD API (12 endpoints), list page, wizard — v5.0
- ✓ Canvas React Flow editor with 8 custom node types, palette, connection validation — v5.0
- ✓ Canvas auto-save, undo/redo, dagre auto-layout — v5.0
- ✓ Canvas execution engine backend (DAG topological sort, fire-and-forget) — v5.0
- ✓ Canvas visual execution state (polling, node colors, animated edges, toolbar progress) — v5.0

### Active

<!-- Current scope. Building toward these. -->

- [ ] Playwright E2E + API tests con Page Object Model (15 E2E specs + 7 API specs)
- [ ] Generación de tests con IA: script que lee código y genera tests Playwright automáticamente
- [ ] Página /testing integrada en la app: ejecutar tests, ver resultados, historial, cobertura
- [ ] Streaming de respuestas LLM en Chat, CatBot y procesamiento (ReadableStream)
- [ ] Cache en memoria con TTL para endpoints frecuentes (agents, dashboard, settings, health)
- [ ] Retry logic (withRetry) para todas las llamadas a servicios externos
- [ ] React Error Boundaries por sección con fallback y reporte a CatBot
- [ ] Logging estructurado con niveles, rotación 7 días, visible en /testing
- [ ] Health check mejorado con latencia por servicio, conteos, uptime

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Multi-user authentication — internal single-user tool
- Real-time WebSocket updates — polling is sufficient
- Embedding model changes — must stay on Ollama nomic-embed-text 768 dims
- Parallel step execution — sequential only
- Task scheduling/cron — manual execution only
- Auto-creating n8n workflows — only provide templates/instructions
- CatBot delete actions — too risky, only create/read/list actions
- Canvas loop detection at runtime — DAG only for v5.0, loops deferred
- Canvas parallel node execution — sequential topological order for v5.0
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

### v5.0 — Canvas Visual de Workflows (PARTIAL — phases 23-24 complete, 25-26 deferred)
- Canvas data model: canvases, canvas_runs, canvas_templates tables + full CRUD API
- Canvas list page with SVG thumbnails, filters by mode, wizard creation
- React Flow editor with 8 custom node types, drag-and-drop, connection validation
- Auto-save, undo/redo, dagre auto-layout
- Execution engine backend (canvas-executor.ts, DAG topological sort)
- Visual execution state: polling, node colors, animated edges, toolbar progress
- 4 phases (23-26), 52 requirements, 51 complete — phases 25 (1 plan left) and 26 deferred

## Current Milestone: v6.0 Testing Inteligente + Performance + Estabilización

**Goal:** Sistema de testing profesional integrado en la app con Playwright + IA, streaming de respuestas LLM, y estabilización global con retry/logging/error boundaries.

**Target features:**
- Playwright E2E + API tests con Page Object Model para todas las secciones
- Generación de tests con IA leyendo el código y generando specs automáticamente
- Página /testing integrada: ejecutar tests desde UI, ver resultados en tiempo real, historial
- Streaming de respuestas LLM en Chat, CatBot y procesamiento
- Cache en memoria con TTL para endpoints frecuentes
- Retry logic para todas las llamadas a servicios externos
- React Error Boundaries por sección
- Logging estructurado con rotación y visualización en /testing
- Health check mejorado con latencia por servicio

## Context

- Agents exist in `custom_agents` table + OpenClaw agents (fetched via GET /api/agents)
- Skills exist in `skills` table with instructions, templates, constraints
- LLM calls go through `llm.ts` service (chatCompletion with provider/model routing)
- Task executor calls LiteLLM directly via fetch (not llm.ts)
- RAG search via `ollama.ts` (getEmbedding) + `qdrant.ts` (search)
- Projects have `rag_collection` field for Qdrant collection name
- @dnd-kit installed for drag-and-drop
- recharts installed for dashboard charts
- Task execution: fire-and-forget, in-memory cancel flags
- Connector calls: fetch() with configurable timeout
- Usage logs: 6 event types, token counts, estimated_cost, metadata JSON
- Dashboard: 6 API endpoints, recharts bar chart, activity feed
- Connectors: 4 types, 8 API endpoints, agent_connector_access table
- Logo exists at app/images/logo.jpg (cat with VR glasses and suit)
- React Flow installed (@xyflow/react v12, @dagrejs/dagre)
- Task execution engine (task-engine.ts) + canvas-executor.ts for DAG execution
- Playwright for E2E testing (to install: @playwright/test as devDependency)
- Tests execute against running Docker app (baseURL: http://localhost:3500)
- Playwright JSON reporter for results parsing
- LiteLLM proxy supports streaming (stream: true in request body)
- ReadableStream Web API for server-to-client streaming

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
- **CatBot**: localStorage for conversation history (not server DB)
- **MCP**: Streamable HTTP protocol, one endpoint per project
- **Logo**: app/images/logo.jpg — use as Next.js static import, crop to circle
- **Canvas**: React Flow container needs fixed height (h-[calc(100vh-64px)])
- **Canvas nodes**: min-width 200px, max-width 300px, responsive
- **Canvas auto-save**: debounce 3s using useCallback + setTimeout
- **Canvas DAG**: no loops allowed, topological sort for execution order
- **Canvas execution**: reuses task-engine.ts patterns adapted for DAG
- **Playwright**: devDependency only, chromium browser, tests run against Docker app
- **Streaming**: Web Streams API (ReadableStream), no WebSocket
- **Cache**: in-memory Map with TTL, resets on server restart (no persistence)
- **Logs**: rotate after 7 days, write to /app/data/logs/
- **Testing page**: /testing in sidebar between Conectores and Configuración

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

| React Flow for canvas editor | Industry-standard node editor, supports custom nodes | ✓ Good |
| dagre for auto-layout | Lightweight DAG layout algorithm, well-supported | ✓ Good |
| Canvas DAG-only (no loops) | Simpler execution model, loops deferred | ✓ Good |
| Sequential topological execution | Simpler than parallel, sufficient for v5.0 | ✓ Good |
| SVG thumbnails for canvas cards | Lightweight, auto-generated from node positions | ✓ Good |
| Playwright for E2E testing | Industry standard, headless chromium, JSON reporter | — Pending |
| LLM streaming via ReadableStream | Standard Web API, no WebSocket dependency | — Pending |
| In-memory TTL cache | Simple Map-based, no external cache needed | — Pending |
| withRetry utility for external calls | Centralized retry with exponential backoff | — Pending |
| Structured file logging | JSON logs with rotation, visible in /testing | — Pending |

---
*Last updated: 2026-03-12 after milestone v6.0 initialization*
