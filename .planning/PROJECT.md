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

### Active

<!-- Current scope. Building toward these. -->

- [ ] Connectors system (n8n webhooks, HTTP API, MCP servers, email)
- [ ] Connector execution in task pipelines (before/after modes)
- [ ] Usage tracking (tokens, costs, activity across all LLM operations)
- [ ] Operations dashboard with metrics, charts, activity feed
- [ ] Model cost configuration in settings

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Multi-user authentication — internal single-user tool
- Real-time WebSocket updates — polling is sufficient
- Embedding model changes — must stay on Ollama nomic-embed-text 768 dims
- Parallel step execution — sequential only
- Task scheduling/cron — manual execution only
- Auto-creating n8n workflows — only provide templates/instructions

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

## Current Milestone: v3.0 Conectores + Dashboard de Operaciones

**Goal:** Enable agents to interact with the outside world (trigger n8n workflows, call APIs, send emails, use MCP tools) and provide full visibility into system operations (tokens, costs, activity, storage).

**Target features:**
- Connector system: 4 types (n8n_webhook, http_api, mcp_server, email) with CRUD, test, logs
- Connector execution in pipelines: before/after step modes, payload with task context
- Agent-connector access control (which agent can use which connector)
- Usage tracking: instrument all LLM endpoints with token/cost tracking
- Operations dashboard: summary cards, token usage chart (recharts), activity feed, top agents/models, storage
- Model cost configuration in settings (editable pricing table)
- Predefined n8n connector templates

## Context

- Agents exist in `custom_agents` table + OpenClaw agents (fetched via GET /api/agents)
- Skills exist in `skills` table with instructions, templates, constraints
- LLM calls go through `llm.ts` service (chatCompletion with provider/model routing)
- Task executor calls LiteLLM directly via fetch (not llm.ts)
- RAG search via `ollama.ts` (getEmbedding) + `qdrant.ts` (search)
- Projects have `rag_collection` field for Qdrant collection name
- @dnd-kit installed for drag-and-drop
- recharts needs to be installed for dashboard charts
- Task execution: fire-and-forget, in-memory cancel flags
- Connector calls: fetch() with configurable timeout

## Constraints

- **Language**: All UI text, logs, and comments in Spanish
- **Build**: `npm run build` must pass without errors
- **Stack**: Next.js 14 App Router, better-sqlite3, Qdrant, Ollama, recharts (to install)
- **Env vars**: Use `process['env']['VARIABLE']` bracket notation
- **API routes**: Must export `dynamic = 'force-dynamic'` if they read env vars
- **Max connectors**: 20 per installation (validated in API)
- **Connector logs**: Truncate payload to 5000 chars
- **Usage logs**: Insert in background (non-blocking)
- **crypto.randomUUID**: NOT available in HTTP context — use generateId() helper

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

---
*Last updated: 2026-03-11 after milestone v3.0 initialization*
