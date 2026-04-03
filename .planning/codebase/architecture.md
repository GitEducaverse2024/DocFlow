# Architecture

**Analysis Date:** 2026-03-11

## Pattern Overview

**Overall:** Server-side rendered monolith (Next.js 14 App Router) with containerized satellite services

**Key Characteristics:**
- Single Next.js application handling both UI and API (no separate backend)
- API routes in `app/src/app/api/` act as the backend, directly accessing SQLite via `better-sqlite3`
- External services (Qdrant, Ollama, LiteLLM) accessed via HTTP from API routes
- RAG indexing offloaded to a child process (`scripts/rag-worker.mjs`) to avoid OOM in the Next.js runtime
- All pages are client components (`"use client"`) that fetch data from API routes via `fetch()`
- No authentication layer -- single-user/internal tool

## Layers

**UI Layer (Client Components):**
- Purpose: Render interactive pages and panels
- Location: `app/src/app/` (pages), `app/src/components/` (reusable components)
- Contains: React client components using `useState`/`useEffect` for state, `fetch()` for data
- Depends on: API routes via HTTP, `@/lib/types` for TypeScript interfaces
- Used by: End users via browser

**API Layer (Next.js Route Handlers):**
- Purpose: REST-like endpoints for all CRUD and processing operations
- Location: `app/src/app/api/`
- Contains: `route.ts` files exporting `GET`, `POST`, `PUT`, `DELETE`, `PATCH` handlers
- Depends on: `@/lib/db` (SQLite), `@/lib/services/*` (LLM, RAG, content extraction), external services
- Used by: UI layer via `fetch()` calls

**Data Layer (SQLite + Filesystem):**
- Purpose: Persistent storage for projects, sources, runs, settings, workers, skills
- Location: `app/src/lib/db.ts` (single module, singleton connection)
- Contains: Schema creation, migrations (ALTER TABLE try/catch), seed data
- Depends on: `better-sqlite3`, filesystem at `/app/data/`
- Used by: All API routes import `db` directly

**Services Layer:**
- Purpose: Abstraction over external integrations
- Location: `app/src/lib/services/`
- Contains:
  - `llm.ts` - Multi-provider LLM client (OpenAI, Anthropic, Google, LiteLLM, Ollama)
  - `content-extractor.ts` - File content extraction (PDF via `pdftotext`, text files)
  - `rag-jobs.ts` - In-memory RAG job tracking
  - `rag.ts`, `qdrant.ts`, `ollama.ts` - RAG-related service clients
- Depends on: `@/lib/db` for API key lookups, external HTTP APIs
- Used by: API route handlers

**Worker Layer (Child Process):**
- Purpose: Isolate memory-intensive RAG indexing from the Next.js process
- Location: `app/scripts/rag-worker.mjs`
- Contains: Standalone Node.js script (no npm deps) for chunking, embedding via Ollama, upserting to Qdrant
- Depends on: Ollama HTTP API, Qdrant HTTP API, filesystem (reads processed output)
- Used by: RAG create API route spawns it via `child_process.spawn()`

## Data Flow

**Document Processing Pipeline:**

1. User uploads source files via UI -> `POST /api/projects/[id]/sources` stores file to `/app/data/projects/{id}/sources/` and metadata to `sources` table
2. Content extraction runs (on upload or re-extract) via `content-extractor.ts` -- stores extracted text in `sources.content_text`
3. User triggers processing -> `POST /api/projects/[id]/process` collects source texts, builds LLM prompt with worker/agent system prompt + skills, calls LiteLLM
4. LLM response saved to `/app/data/projects/{id}/processed/v{N}/output.md`
5. Processing run tracked in `processing_runs` table with version, status, timestamps

**RAG Indexing Pipeline:**

1. User triggers RAG indexing -> `POST /api/projects/[id]/rag/create`
2. API route spawns `scripts/rag-worker.mjs` as detached child process
3. Worker reads `output.md`, chunks text, generates embeddings via Ollama, upserts to Qdrant
4. Worker communicates progress via temp JSON file (`/tmp/rag-{projectId}.json`), API route polls every 1s
5. On completion, API route updates `projects` table with RAG metadata

**Chat (RAG Query) Flow:**

1. User sends message -> `POST /api/projects/[id]/chat`
2. API route generates embedding for query via Ollama
3. Searches Qdrant collection for top-5 similar chunks
4. Builds prompt with retrieved context chunks + user question
5. Calls LiteLLM for response, returns to UI

**Processing Fallback (n8n):**

1. If `useLocalProcessing` is false, the process route first attempts to send a webhook to n8n
2. On n8n failure (timeout/error), falls back to local LLM processing
3. n8n can call back via `POST /api/projects/[id]/process/callback` to update run status

**State Management:**
- No client-side state library (no Redux, Zustand, etc.)
- Each page/component manages local state with `useState`
- Data refreshed via `refreshTrigger` counter pattern -- incrementing triggers `useEffect` re-fetch
- No server-side caching; every request hits SQLite directly

## Key Abstractions

**Project:**
- Purpose: Central entity -- a documentation project containing sources, processing runs, RAG collection
- Examples: `app/src/lib/types.ts` (interface), `app/src/app/api/projects/` (CRUD)
- Pattern: Stateful lifecycle: `draft` -> `sources_added` -> `processing` -> `processed` -> `rag_indexed`

**Source:**
- Purpose: Input document (file, URL, YouTube, note) attached to a project
- Examples: `app/src/lib/types.ts`, `app/src/app/api/projects/[id]/sources/`
- Pattern: Has `process_mode` (`process` | `direct` | `exclude`) controlling how it's used in processing

**DocsWorker:**
- Purpose: Reusable LLM processing template with system prompt, output format, and template
- Examples: `app/src/lib/types.ts`, `app/src/app/api/workers/`
- Pattern: Seeded with defaults on first DB init; users can create custom workers

**Skill:**
- Purpose: Composable instruction module that augments workers/agents during processing
- Examples: `app/src/lib/types.ts`, `app/src/app/api/skills/`
- Pattern: Injected into system prompt during processing; can be attached to workers or agents via junction tables

**Custom Agent:**
- Purpose: Named LLM configuration (model + description) assignable to projects
- Examples: `app/src/app/api/agents/`
- Pattern: References stored in `projects.agent_id`; OpenClaw integration for agent file management

## Entry Points

**Next.js App:**
- Location: `app/src/app/layout.tsx` (root layout), `app/src/app/page.tsx` (dashboard)
- Triggers: Browser navigation
- Responsibilities: Renders sidebar + main content area, provides toast notifications

**API Routes:**
- Location: `app/src/app/api/` (39 route files)
- Triggers: Client-side `fetch()` calls
- Responsibilities: All data operations, LLM calls, file management, RAG operations

**RAG Worker:**
- Location: `app/scripts/rag-worker.mjs`
- Triggers: Spawned by `POST /api/projects/[id]/rag/create`
- Responsibilities: Chunk text, embed via Ollama, store in Qdrant

**Docker Entrypoint:**
- Location: `app/Dockerfile` (line 63: `CMD ["node", "server.js"]`)
- Triggers: Container start
- Responsibilities: Runs Next.js standalone server on port 3000

## Error Handling

**Strategy:** Try/catch at API route level, return structured JSON errors with HTTP status codes

**Patterns:**
- API routes wrap entire handler in try/catch, return `{ error: string }` with appropriate status
- Processing errors update `processing_runs.error_log` and set status to `'failed'`
- RAG worker writes error to status file; parent process polls and updates in-memory job tracker
- Client components use `toast.error()` (sonner) for user-facing errors
- No global error boundary except per-panel `<ErrorBoundary>` components in project detail page

## Cross-Cutting Concerns

**Logging:** `console.log`/`console.error` with prefix tags like `[RAG]`, `[RAG-WORKER]`, `[Process]`, `[ContentExtractor]`

**Validation:** Minimal -- basic null/empty checks in API routes. No schema validation library (no Zod, Joi, etc.)

**Authentication:** None. Single-user internal tool with no auth middleware.

**Environment Variables:** Accessed via bracket notation `process['env']['VAR']` to bypass webpack inlining. API routes reading env vars must export `dynamic = 'force-dynamic'` to prevent static prerendering.

## Deployment Architecture

**Docker Compose** orchestrates 4 containers:
- `docflow` (Next.js app) on port 3500 -> internal 3000
- `qdrant` (vector DB) on ports 6333/6334
- `ollama` (local LLM/embeddings) on port 11434, with NVIDIA GPU access
- `docflow-init` (busybox) runs once to set file permissions

**External services** (not in compose):
- LiteLLM proxy at `192.168.1.49:4000` -- routes LLM requests to various providers
- n8n at `192.168.1.49:5678` -- optional webhook-based processing pipeline
- OpenClaw at `192.168.1.49:18789` -- agent management

**Persistent data:**
- SQLite DB + project files: host volume `/home/deskmath/docflow-data` -> `/app/data`
- OpenClaw data: host volume `/home/deskmath/.openclaw` -> `/app/openclaw`
- Qdrant storage: bind mount `./qdrant-data`
- Ollama models: named volume `ollama-data`

---

*Architecture analysis: 2026-03-11*
