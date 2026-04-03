# Directory & File Structure

## Top-Level Layout

```
docflow/
├── app/                          # Next.js application (main codebase)
│   ├── Dockerfile                # Docker build (node:20-slim)
│   ├── package.json              # Dependencies & scripts
│   ├── next.config.js            # Next.js configuration
│   ├── tailwind.config.ts        # Tailwind CSS config
│   ├── tsconfig.json             # TypeScript config
│   ├── components.json           # shadcn/ui configuration
│   ├── patch_*.js                # Legacy patch scripts (20+ files)
│   └── src/                      # Source code
├── docker-compose.yml            # Multi-service orchestration
├── qdrant-data/                  # Qdrant vector DB persistent data
├── scripts/                      # Utility scripts
└── .planning/                    # GSD planning documents
```

## Source Code Structure (`app/src/`)

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Home page (project list)
│   ├── agents/page.tsx           # Agent management page
│   ├── settings/page.tsx         # Settings page
│   ├── skills/page.tsx           # Skills page
│   ├── system/page.tsx           # System health page
│   ├── workers/page.tsx          # Workers page
│   ├── projects/
│   │   ├── page.tsx              # Projects list
│   │   ├── new/page.tsx          # New project form
│   │   └── [id]/page.tsx         # Project detail (pipeline view)
│   └── api/                      # API Routes (see below)
├── components/                   # React components
│   ├── agents/                   # Agent management components
│   ├── chat/                     # Chat panel
│   ├── layout/                   # Sidebar, navigation
│   ├── process/                  # Processing pipeline UI
│   ├── projects/                 # Project-level components
│   ├── rag/                      # RAG panel
│   ├── sources/                  # Source management components
│   ├── system/                   # System health & diagnostics
│   └── ui/                       # shadcn/ui base components
├── hooks/                        # Custom React hooks
│   └── use-system-health.ts
└── lib/                          # Shared libraries
    ├── db.ts                     # SQLite database (better-sqlite3)
    ├── types.ts                  # TypeScript type definitions
    ├── utils.ts                  # Utility functions
    └── services/                 # Backend service integrations
        ├── content-extractor.ts  # PDF/file text extraction
        ├── litellm.ts            # LiteLLM proxy client
        ├── llm.ts                # LLM orchestration service
        ├── ollama.ts             # Ollama embeddings client
        ├── qdrant.ts             # Qdrant vector DB client
        ├── rag.ts                # RAG pipeline logic
        └── rag-jobs.ts           # RAG background job management
```

## API Routes (`app/src/app/api/`)

```
api/
├── health/route.ts               # System health check
├── projects/
│   ├── route.ts                  # GET/POST projects
│   └── [id]/
│       ├── route.ts              # GET/PUT/DELETE project
│       ├── bot/create/route.ts   # Create bot from project
│       ├── chat/route.ts         # Chat with project
│       ├── sources/
│       │   ├── route.ts          # GET/POST sources
│       │   ├── reorder/route.ts  # Reorder sources
│       │   └── [sid]/route.ts    # GET/PUT/DELETE source + POST re-extract
│       ├── process/
│       │   ├── route.ts          # POST trigger processing
│       │   ├── status/route.ts   # GET processing status
│       │   ├── history/route.ts  # GET version history
│       │   ├── callback/route.ts # Processing callback
│       │   ├── clean/route.ts    # Clean processing data
│       │   └── [vid]/
│       │       ├── route.ts      # GET/DELETE specific version
│       │       └── output/route.ts # GET version output
│       ├── rag/
│       │   ├── route.ts          # POST index to RAG
│       │   ├── create/route.ts   # Create RAG collection
│       │   ├── info/route.ts     # GET RAG status
│       │   ├── query/route.ts    # Query RAG
│       │   └── status/route.ts   # RAG job status
│       └── stats/route.ts        # Project statistics
├── agents/
│   ├── route.ts                  # GET/POST agents
│   ├── create/route.ts           # Create agent
│   ├── generate/route.ts         # Generate agent via AI
│   └── [id]/
│       ├── route.ts              # GET/PUT/DELETE agent
│       └── files/route.ts        # Agent file management
├── settings/
│   ├── api-keys/
│   │   ├── route.ts              # GET/POST API keys
│   │   └── [provider]/
│   │       ├── route.ts          # Provider-specific key
│   │       └── test/route.ts     # Test API key
│   ├── models/route.ts           # Model configuration
│   └── processing/route.ts       # Processing settings
├── skills/
│   ├── route.ts                  # GET/POST skills
│   ├── generate/route.ts         # Generate skill via AI
│   ├── import/route.ts           # Import skill
│   ├── openclaw/route.ts         # OpenClaw integration
│   └── [id]/route.ts             # GET/PUT/DELETE skill
└── workers/
    ├── route.ts                  # GET/POST workers
    ├── generate/route.ts         # Generate worker via AI
    └── [id]/route.ts             # GET/PUT/DELETE worker
```

## Key Patterns

- **File naming**: kebab-case for all files (e.g., `source-item.tsx`, `content-extractor.ts`)
- **Component naming**: PascalCase exports (e.g., `SourceItem`, `ProcessPanel`)
- **Route naming**: Next.js App Router conventions (`route.ts` in nested folders)
- **Entry points**: `app/src/app/page.tsx` (home), `app/src/app/layout.tsx` (root layout)
- **Config files**: Root of `app/` directory

## Notable Files

- **`patch_*.js` (20+ files)**: Legacy patch scripts in `app/` root — appear to be one-time migration/fix scripts that were applied manually. Candidates for cleanup.
- **`qdrant-data/`**: Persistent Qdrant storage with two collections (`experto-en-negocio`, `experto-en-threejs-react-web-3d`)
