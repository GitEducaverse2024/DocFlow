# External Integrations

**Analysis Date:** 2026-03-11

## APIs & External Services

**LLM Providers (via `app/src/lib/services/llm.ts`):**
DocFlow supports 5 LLM providers through a unified `chatCompletion()` abstraction. Provider credentials are stored in the `api_keys` SQLite table and managed via the settings UI.

- **OpenAI** - Chat completions via OpenAI-compatible `/chat/completions`
  - Client: Direct `fetch` to `${endpoint}/chat/completions`
  - Auth: Bearer token from `api_keys` table
  - Default endpoint: `https://api.openai.com/v1`

- **Anthropic** - Chat completions via Messages API
  - Client: Direct `fetch` to `${endpoint}/messages`
  - Auth: `x-api-key` header, `anthropic-version: 2023-06-01`
  - Default endpoint: `https://api.anthropic.com/v1`

- **Google (Gemini)** - Chat via `generateContent` endpoint
  - Client: Direct `fetch` to `${endpoint}/models/${model}:generateContent?key=${api_key}`
  - Auth: API key as query parameter
  - Default endpoint: `https://generativelanguage.googleapis.com/v1beta`

- **LiteLLM** - Unified LLM proxy (primary production gateway)
  - Client: Direct `fetch` to `${endpoint}/v1/chat/completions` (`app/src/lib/services/litellm.ts`)
  - Auth: Bearer token from `LITELLM_API_KEY` env var
  - Default endpoint: `http://192.168.1.49:4000`
  - Also provides embeddings via `/v1/embeddings`
  - Used for document processing in `app/src/app/api/projects/[id]/process/route.ts`

- **Ollama** - Local LLM inference with GPU
  - Client: Direct `fetch` to `${endpoint}/api/chat` (`app/src/lib/services/ollama.ts`)
  - Auth: None required
  - Default endpoint: `http://docflow-ollama:11434` (Docker internal)
  - Embedding endpoint: `/api/embed`
  - Supported embedding models: `nomic-embed-text` (768d), `mxbai-embed-large` (1024d), `all-minilm` (384d)
  - Auto-pulls missing models via `/api/pull`

**Workflow Automation:**
- **n8n** - External webhook-based document processing pipeline
  - Endpoint: `${N8N_WEBHOOK_URL}${N8N_PROCESS_WEBHOOK_PATH}` (default: `http://192.168.1.49:5678/webhook/docflow-process`)
  - Used in: `app/src/app/api/projects/[id]/process/route.ts`
  - Pattern: POST webhook with project data and sources; n8n calls back to `/api/projects/[id]/process/callback` when done
  - Fallback: If n8n is unreachable, processing falls back to local LiteLLM-based processing

**Agent Management:**
- **OpenClaw** - AI agent platform
  - Endpoint: `${OPENCLAW_URL}` (default: `http://192.168.1.49:18789`)
  - Health check via root `/` endpoint
  - Used in: `app/src/app/api/health/route.ts` (connectivity check)
  - Agent files: mounted at `/app/openclaw` from `~/.openclaw` host directory

## Data Storage

**SQLite Database:**
- Engine: `better-sqlite3@12.6.2` (synchronous, embedded)
- Connection: Single `Database` instance in `app/src/lib/db.ts`
- Location: `DATABASE_PATH` env var or `data/docflow.db`
- Schema: Inline DDL with `CREATE TABLE IF NOT EXISTS` (no migration tool)
- Tables:
  - `projects` - Document projects with status, versioning, RAG config
  - `sources` - Project source files/URLs/notes with extracted content
  - `processing_runs` - LLM processing history with versioning
  - `custom_agents` - User-defined LLM agent configurations
  - `docs_workers` - Pre-built document processing workers (seeded with defaults)
  - `skills` - Reusable processing skill definitions (seeded with defaults)
  - `worker_skills` / `agent_skills` - Many-to-many junction tables
  - `settings` - Key-value configuration store
  - `api_keys` - LLM provider credentials and endpoints

**Qdrant Vector Database:**
- Client: Direct REST API calls via `fetch` in `app/src/lib/services/qdrant.ts`
- Connection: `QDRANT_URL` env var (default: `http://192.168.1.49:6333`)
- Docker: `qdrant/qdrant:latest`, ports 6333 (REST) and 6334 (gRPC)
- Operations: `createCollection`, `deleteCollection`, `getCollectionInfo`, `upsertPoints`, `search`
- Vector config: Cosine distance, variable dimensions based on embedding model
- Used for: RAG (Retrieval Augmented Generation) on processed project documents

**File Storage:**
- Local filesystem only (Docker volume mount)
- Host path: `/home/deskmath/docflow-data` mounted to `/app/data`
- Structure: `data/projects/{projectId}/sources/` for uploads, `data/projects/{projectId}/processed/v{N}/output.md` for outputs
- Source files stored with full absolute paths in DB `file_path` column

**Caching:**
- In-memory only: RAG job tracking via `Map<string, RagJob>` in `app/src/lib/services/rag-jobs.ts`
- No Redis or external cache

## Authentication & Identity

**Auth Provider:**
- None - No authentication or user management
- The application is designed for single-user/team local deployment
- API keys for LLM providers are stored in the `api_keys` SQLite table (not encrypted)

## Monitoring & Observability

**Health Check Endpoint:**
- `GET /api/health` (`app/src/app/api/health/route.ts`)
- Checks connectivity to all external services: OpenClaw, n8n, Qdrant, LiteLLM, Ollama
- Reports latency, status, available models/collections
- Reports internal DB status and project/source counts

**Error Tracking:**
- None (no Sentry, Datadog, etc.)
- Errors logged to `console.error` and stored in `processing_runs.error_log` column

**Logs:**
- `console.log` / `console.error` throughout
- Prefixed with `[RAG]`, `[RAG-WORKER]`, `[Process]`, `[ContentExtractor]` for grep-ability
- No structured logging library

## CI/CD & Deployment

**Hosting:**
- Self-hosted Docker on local server (192.168.1.49)
- No cloud deployment

**CI Pipeline:**
- None detected (no `.github/workflows/`, no CI config files)

**Build & Deploy Process (manual):**
```bash
docker compose build --no-cache && docker compose up -d && \
docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && \
docker restart docflow-app
```

**Local Verification:**
```bash
cd ~/docflow/app && npm run build
```

## Environment Configuration

**Required env vars (stored in `.env` at project root):**
- `LITELLM_URL` - LiteLLM proxy URL
- `LITELLM_API_KEY` - LiteLLM auth key
- `QDRANT_URL` - Qdrant REST endpoint
- `OLLAMA_URL` - Ollama API endpoint
- `DATABASE_PATH` - SQLite database file path
- `PROJECTS_PATH` - Project data directory

**Optional env vars:**
- `OPENCLAW_URL` - OpenClaw agent platform URL
- `N8N_WEBHOOK_URL` - n8n base URL
- `N8N_PROCESS_WEBHOOK_PATH` - n8n webhook path for processing
- `EMBEDDING_MODEL` - Default embedding model (default: `nomic-embed-text`)
- `CHAT_MODEL` - Default chat model (default: `gemini-main`)

**Secrets location:**
- `.env` file at project root (git-ignored)
- `.env.example` present as template
- LLM API keys also stored in SQLite `api_keys` table (managed via Settings UI)

## Webhooks & Callbacks

**Incoming:**
- `POST /api/projects/[id]/process/callback` - n8n calls back with processing results after document generation

**Outgoing:**
- `POST ${N8N_WEBHOOK_URL}${N8N_PROCESS_WEBHOOK_PATH}` - Triggers n8n document processing workflow with project data, sources, and instructions

## RAG Pipeline (Child Process)

**Worker Process:**
- `app/scripts/rag-worker.mjs` runs as a standalone Node.js child process
- Spawned to avoid OOM in the main Next.js process
- Uses native Node.js 20 APIs only (no npm dependencies)
- Communicates via a JSON status file written to `/tmp/`
- Flow: Read processed document -> Chunk text -> Generate embeddings via Ollama -> Upsert vectors into Qdrant

**Embedding Models Supported:**
- `nomic-embed-text` (768 dimensions) - default
- `mxbai-embed-large` (1024 dimensions)
- `all-minilm` (384 dimensions)
- `snowflake-arctic-embed` (1024 dimensions)
- `bge-m3` (1024 dimensions)

## Content Extraction

**PDF Extraction (`app/src/lib/services/content-extractor.ts`):**
- Uses `pdftotext` CLI from `poppler-utils` (installed in Docker image)
- Spawned via `execSync` with 30s timeout and 50MB buffer
- No OCR capability - scanned PDFs return empty/warning

**Text File Extraction:**
- Direct UTF-8 read for known text extensions (code files, config files, markup)
- Binary detection via null-byte scanning in first 8KB
- Image and binary files return placeholder text

## Service Ports Summary

| Service    | Internal Port | External Port | Protocol |
|------------|--------------|---------------|----------|
| DocFlow    | 3000         | 3500          | HTTP     |
| LiteLLM    | -            | 4000          | HTTP     |
| n8n        | -            | 5678          | HTTP     |
| Qdrant     | 6333         | 6333          | REST     |
| Qdrant     | 6334         | 6334          | gRPC     |
| Ollama     | 11434        | 11434         | HTTP     |
| OpenClaw   | -            | 18789         | HTTP     |

---

*Integration audit: 2026-03-11*
