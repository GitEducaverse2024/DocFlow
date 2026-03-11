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

### Active

<!-- Current scope. Building toward these. -->

- [ ] Multi-agent task system with sequential pipeline execution
- [ ] Task wizard (4-step creation flow)
- [ ] Task execution engine (agent → checkpoint → merge steps)
- [ ] Real-time execution monitoring with polling
- [ ] Task templates (predefined pipelines)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Multi-user authentication — internal single-user tool
- Real-time WebSocket updates — polling is sufficient
- Embedding model changes — must stay on Ollama nomic-embed-text 768 dims
- Parallel step execution — sequential only for v2.0
- Task scheduling/cron — manual execution only

## Milestone History

### v1.0 — Fix RAG Chat + Mejoras de indexacion (COMPLETE)
- Chat endpoint rewritten with shared services (ollama.ts, qdrant.ts)
- RAG indexing progress bar with chunksProcessed/chunksTotal
- 2 phases, 12 requirements, all complete

### v2.0 — Sistema de Tareas Multi-Agente (CURRENT)
See below.

## Current Milestone: v2.0 Sistema de Tareas Multi-Agente

**Goal:** Build a multi-agent task system where agents collaborate in sequential pipelines to produce complex documents. A task defines an objective, links project RAGs for context, and executes a pipeline of steps (agent, checkpoint, merge) where each step passes its output as context to the next.

**Target features:**
- Data model: tasks, task_steps, task_templates tables in SQLite
- Full CRUD API for tasks, steps, and templates
- Pipeline execution engine: sequential step execution with context passing, RAG integration, checkpoint pausing, merge synthesis
- Task list page with filters, templates, and status badges
- 4-step creation wizard: Objetivo → Proyectos → Pipeline → Revisar
- Real-time execution view with step outputs, checkpoint approval/rejection, progress bar
- 3 seed templates (Documentacion tecnica, Propuesta comercial, Investigacion)

## Context

- Agents exist in `custom_agents` table + OpenClaw agents (fetched via GET /api/agents)
- Skills exist in `skills` table with instructions, templates, constraints
- LLM calls go through `llm.ts` service (chatCompletion with provider/model routing)
- RAG search via `ollama.ts` (getEmbedding) + `qdrant.ts` (search)
- Projects have `rag_collection` field for Qdrant collection name
- @dnd-kit already installed for drag-and-drop
- Existing seed pattern: check count, insert if 0

## Constraints

- **Language**: All UI text, logs, and comments in Spanish
- **Build**: `npm run build` must pass without errors
- **Stack**: Next.js 14 App Router, better-sqlite3, Qdrant, Ollama, @dnd-kit
- **Env vars**: Use `process['env']['VARIABLE']` bracket notation
- **API routes**: Must export `dynamic = 'force-dynamic'` if they read env vars
- **Execution**: Sequential steps only (no parallel) in this version
- **Max steps**: 10 per task (validated in API)
- **Polling**: 2s interval for execution status

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use bracket notation for env vars | Bypass webpack inlining at build time | ✓ Good |
| node:20-slim Docker base | better-sqlite3 needs glibc (not musl/Alpine) | ✓ Good |
| Child process for RAG worker | Avoid OOM in Next.js runtime during embedding | ✓ Good |
| Polling for progress | Simpler than WebSocket, sufficient for use case | ✓ Good |
| Sequential pipeline only | Simpler mental model, parallel can come later | — Pending |
| In-process execution | No separate worker process needed for LLM calls | — Pending |

---
*Last updated: 2026-03-11 after milestone v2.0 initialization*
