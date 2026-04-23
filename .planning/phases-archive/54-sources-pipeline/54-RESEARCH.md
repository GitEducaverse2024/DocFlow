# Phase 54: Sources Pipeline — Research

## Overview

Phase 54 creates a simplified 3-phase source ingestion flow accessible from the Entry Modal (Phase 53) "Nuevas Fuentes" button. The flow guides users through: Fuentes → Procesar → Indexar RAG.

## Existing Infrastructure

### API Endpoints Available

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/catbrains/[id]/sources` | GET | List all sources |
| `/api/catbrains/[id]/sources` | POST | Upload file (FormData) or create URL/YouTube/note (JSON) |
| `/api/catbrains/[id]/sources/[sid]` | DELETE | Delete source |
| `/api/catbrains/[id]/sources/[sid]` | PATCH | Update source (name, process_mode, etc.) |
| `/api/catbrains/[id]/process` | POST | Run processing (SSE streaming) |
| `/api/catbrains/[id]/process/status` | GET | Poll processing status |
| `/api/catbrains/[id]/rag/create` | POST | Full RAG indexing (spawns worker) |
| `/api/catbrains/[id]/rag/append` | POST | Append sources to existing RAG |
| `/api/catbrains/[id]/rag/status` | GET | Poll indexing progress (chunksProcessed/chunksTotal) |
| `/api/catbrains/[id]/rag/info` | GET | RAG metadata (enabled, vectorCount, model) |

### Existing UI Components

- `source-manager.tsx` — Tabbed source upload (Files, URLs, YouTube, Notes)
- `source-list.tsx` — Full-featured source list with drag-and-drop, multi-select, search
- `file-upload-zone.tsx` — Drag-and-drop file upload with react-dropzone
- `process-panel.tsx` — Full processing UI with source modes, agent/worker selection, SSE streaming
- `rag-panel.tsx` — Full RAG panel with config, progress bar, query tester
- `catbrain-entry-modal.tsx` — Entry modal with 3 action cards (Phase 53)

### Database Schema (Relevant Columns)

**sources table:**
- `process_mode`: 'process' | 'direct' | 'exclude'
- `content_text`: Extracted text content
- `is_pending_append`: 0 or 1 (flag for RAG append)
- `status`: 'pending' | 'ready' | 'error' | 'extracting'

**catbrains table:**
- `rag_enabled`: 0 or 1
- `rag_collection`: Qdrant collection name
- `rag_model`: Embedding model used
- `status`: 'draft' | 'sources_added' | 'processed' | 'rag_indexed'

### Key Behaviors

1. **RAG Append vs Create**: `/rag/append` is used when `rag_enabled=1` and collection exists. `/rag/create` is for new collections.
2. **Content Fallback**: Append endpoint already has fallback logic — if `content_text` is empty, tries to re-extract from disk, then falls back to `"Archivo: {name}"`.
3. **Progress Polling**: `/rag/status` returns `{ chunksProcessed, chunksTotal, progress, status }` — polled every 2 seconds by rag-panel.
4. **SSE Processing**: Process endpoint streams tokens via SSE with stage events.

### i18n

- Uses next-intl with `useTranslations('namespace')`
- `catbrains` namespace already has modal, pipeline, status sub-objects
- New keys needed under `catbrains.pipeline` or a new `catbrains.sourcesFlow` namespace

### Navigation Pattern

- Entry Modal "Nuevas Fuentes" → `/catbrains/[id]?step=sources`
- Detail page reads `?step=` to set initial tab
- Current pipeline has 8 steps (sources → process → history → rag → connectors → websearch → config → chat)

## Design Decisions

1. **New component vs modify existing**: Create a new `sources-pipeline.tsx` wizard component that wraps existing subcomponents. The existing pipeline in [id]/page.tsx is too complex (8 steps) for the simplified flow.

2. **Route**: New page at `/catbrains/[id]/sources-pipeline` OR render as overlay/panel within the detail page when `?step=sources-pipeline`. The latter avoids new routes.

3. **Reuse strategy**: Reuse `file-upload-zone.tsx` and `source-list.tsx` for Phase 1. For Phase 2, create simplified processing mode selector (not the full process-panel). For Phase 3, reuse the progress/polling logic from rag-panel.

4. **RAG decision logic**: Check `rag_enabled` and `rag_collection` from catbrain data → if both exist, use `/rag/append` with `is_pending_append=1` sources; otherwise use `/rag/create`.
