# Technology Stack

**Analysis Date:** 2026-03-11

## Languages

**Primary:**
- TypeScript 5.x - All application code (`app/src/`)
- JavaScript (ESM) - RAG worker script (`app/scripts/rag-worker.mjs`)

**Secondary:**
- CSS/Tailwind - Styling
- SQL - Inline SQLite schema and queries in `app/src/lib/db.ts`

## Runtime

**Environment:**
- Node.js 20 (Docker production via `node:20-slim`)
- Node.js 22 (host development machine)
- `NODE_OPTIONS="--max-old-space-size=4096"` set in production

**Package Manager:**
- npm (with `npm ci` for reproducible installs)
- Lockfile: `app/package-lock.json` (present)

## Frameworks

**Core:**
- Next.js 14.2.35 - Full-stack framework (App Router)
- React 18 - UI rendering
- Tailwind CSS 3.4.x - Utility-first CSS
- shadcn/ui (via `shadcn@4.0.2`) - Component library built on Radix primitives

**Build/Dev:**
- PostCSS 8.x - CSS processing (`app/postcss.config.mjs`)
- ESLint 8.x with `eslint-config-next@14.2.35` - Linting
- TypeScript compiler (noEmit, bundler module resolution) - Type checking only (`app/tsconfig.json`)

## Key Dependencies

**Critical:**
- `better-sqlite3@12.6.2` - Embedded SQLite database (requires glibc, NOT Alpine/musl)
- `next@14.2.35` - Framework core
- `react@18` / `react-dom@18` - UI layer
- `uuid@13.0.0` - ID generation throughout the app

**UI:**
- `lucide-react@0.577.0` - Icon library
- `react-markdown@10.1.0` + `remark-gfm@4.0.1` - Markdown rendering
- `react-dropzone@15.0.0` - File upload drag-and-drop
- `sonner@2.0.7` - Toast notifications
- `next-themes@0.4.6` - Dark/light theme switching
- `@dnd-kit/core@6.3.1` + `@dnd-kit/sortable@10.0.0` - Drag-and-drop sorting
- `@base-ui/react@1.2.0` - Base UI primitives

**Styling Utilities:**
- `class-variance-authority@0.7.1` - Variant-based component styling
- `clsx@2.1.1` + `tailwind-merge@3.5.0` - Conditional class merging (via `cn()` helper in `app/src/lib/utils.ts`)
- `tailwindcss-animate@1.0.7` + `tw-animate-css@1.4.0` - Animation utilities
- `@tailwindcss/typography@0.5.19` - Prose styling for markdown content

**Dev Dependencies:**
- `@types/better-sqlite3@7.6.13` - SQLite type definitions
- `@types/pdf-parse@1.1.5` - PDF parsing types (note: `pdf-parse` itself is not a dependency; PDF extraction uses `pdftotext` CLI)
- `@types/uuid@10.0.0` - UUID type definitions

## Database & Storage

**SQLite (better-sqlite3):**
- Single-file embedded database at path from `DATABASE_PATH` env var (default: `data/docflow.db`)
- Schema managed via inline `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` migrations in `app/src/lib/db.ts`
- Tables: `projects`, `sources`, `processing_runs`, `custom_agents`, `docs_workers`, `skills`, `worker_skills`, `agent_skills`, `settings`, `api_keys`
- No ORM - raw SQL via `better-sqlite3` prepared statements

**Qdrant (Vector Database):**
- Docker container `qdrant/qdrant:latest` on ports 6333/6334
- Storage volume: `./qdrant-data:/qdrant/storage`
- Used for RAG vector search with Cosine distance

**File System:**
- Project data stored at `PROJECTS_PATH` (default: `data/projects/`)
- Volume mount: `/home/deskmath/docflow-data:/app/data`
- Processed documents saved as `output.md` under versioned directories

## Configuration

**Environment:**
- `.env` file at project root (loaded via `env_file` in docker-compose)
- `.env.example` present for reference
- CRITICAL: Use `process['env']['VAR']` bracket notation to bypass webpack inlining at build time
- API routes reading env vars must export `dynamic = 'force-dynamic'` to prevent static prerendering

**Key Environment Variables (names only):**
- `DATABASE_PATH` - SQLite file location
- `PROJECTS_PATH` - Project data directory
- `LITELLM_URL` - LiteLLM proxy endpoint
- `LITELLM_API_KEY` - LiteLLM auth key
- `QDRANT_URL` - Qdrant vector DB endpoint
- `OLLAMA_URL` - Ollama local LLM endpoint
- `OPENCLAW_URL` - OpenClaw agents endpoint
- `N8N_WEBHOOK_URL` - n8n workflow automation endpoint
- `N8N_PROCESS_WEBHOOK_PATH` - n8n processing webhook path
- `EMBEDDING_MODEL` - Default embedding model name
- `CHAT_MODEL` - Default chat model name

**Build:**
- `app/next.config.mjs` - Minimal (empty config object)
- `app/tsconfig.json` - Path alias `@/*` maps to `./src/*`
- `app/tailwind.config.ts` - Tailwind configuration
- `app/postcss.config.mjs` - PostCSS configuration

## Docker Build

**Multi-stage Dockerfile (`app/Dockerfile`):**

1. **base** - `node:20-slim` (Debian, NOT Alpine - required for better-sqlite3 native binaries)
2. **deps** - Installs `python3 make g++` for native module compilation, runs `npm ci`
3. **builder** - Copies source, runs `npm run build` (Next.js standalone output)
4. **runner** - Production image with:
   - `poppler-utils` installed for `pdftotext` PDF extraction
   - Non-root user `nextjs:nodejs` (UID/GID 1001)
   - Standalone Next.js output + static files + scripts directory
   - Port 3000 exposed (mapped to 3500 externally)

**Docker Compose (`docker-compose.yml`):**
- `docflow-init` - busybox init container for permissions
- `docflow` - Main app (port 3500:3000)
- `qdrant` - Vector database (ports 6333, 6334)
- `ollama` - Local LLM with NVIDIA GPU passthrough (port 11434)

## Platform Requirements

**Development:**
- Node.js 20+ (22 on host is fine for dev, but Docker uses 20)
- npm
- Docker + Docker Compose for full stack

**Production:**
- Docker with `node:20-slim` base
- NVIDIA GPU driver + nvidia-container-toolkit (for Ollama GPU acceleration)
- External services: LiteLLM (port 4000), n8n (port 5678), OpenClaw (port 18789)
- `poppler-utils` system package for PDF text extraction

---

*Stack analysis: 2026-03-11*
