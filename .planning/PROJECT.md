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
- ✓ Chat interface with RAG-powered Q&A — v0
- ✓ Workers (reusable processing templates) and Skills (composable prompt modules) — v0
- ✓ Custom Agents with OpenClaw integration — v0
- ✓ Settings management (API keys, models, processing config) — v0
- ✓ System health diagnostics — v0
- ✓ Docker deployment with GPU support — v0
- ✓ Stale detection (content_updated_at tracking) — v0
- ✓ Contextual explanation banners in process and RAG panels — v0

### Active

<!-- Current scope. Building toward these. -->

- [ ] Fix RAG chat retrieval (chat endpoint doesn't find indexed content)
- [ ] Real-time RAG indexing progress bar with polling
- [ ] Re-index cleans old Qdrant collection before creating new one

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Multi-user authentication — internal single-user tool
- Real-time WebSocket updates — polling is sufficient for indexing progress
- Embedding model changes — must stay on Ollama nomic-embed-text 768 dims

## Current Milestone: v1.0 Fix RAG Chat + Mejoras de indexación

**Goal:** Make RAG chat actually return indexed content, and provide real-time feedback during RAG indexing.

**Target features:**
- Chat endpoint uses same search logic as "Probar consulta" (correct collection, Ollama embeddings, proper thresholds)
- Progress bar during RAG indexing with step descriptions and elapsed time
- Clean re-indexing (delete old collection before creating new)

## Context

- Chat endpoint at `src/app/api/projects/[id]/chat/route.ts` is returning "no information" for queries that DO match in the RAG query endpoint
- RAG query endpoint (`rag/query/route.ts`) correctly finds chunks with ~57% scores
- The discrepancy suggests chat uses different search logic, wrong collection, different embedding model, or a score threshold that's too high
- RAG worker (`scripts/rag-worker.mjs`) writes progress to `/tmp/rag-{projectId}.json` but UI doesn't poll it
- RAG status endpoint exists at `rag/status/route.ts` backed by in-memory job tracker (`rag-jobs.ts`)

## Constraints

- **Language**: All UI text, logs, and comments in Spanish
- **Build**: `npm run build` must pass without errors
- **Embedding model**: Ollama nomic-embed-text with 768 dimensions (do not change)
- **Chat model**: gemini-main by default (configurable via CHAT_MODEL env)
- **Stack**: Next.js 14 App Router, better-sqlite3, Qdrant, Ollama

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use bracket notation for env vars | Bypass webpack inlining at build time | ✓ Good |
| node:20-slim Docker base | better-sqlite3 needs glibc (not musl/Alpine) | ✓ Good |
| Child process for RAG worker | Avoid OOM in Next.js runtime during embedding | ✓ Good |
| Polling for indexing progress | Simpler than WebSocket, sufficient for use case | — Pending |

---
*Last updated: 2026-03-11 after milestone v1.0 initialization*
