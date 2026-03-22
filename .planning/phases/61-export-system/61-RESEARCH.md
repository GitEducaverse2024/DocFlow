# Phase 61 Research: Export System

## Current State

### Schema (Phase 57 — already in place)
- `task_bundles` table: id, task_id (FK CASCADE), bundle_name, bundle_path, manifest (JSON), created_at
- `TaskBundle` TypeScript interface in `lib/types.ts` lines 181-188

### Related Data Structures
- **Tasks**: id, name, description, expected_output, execution_mode, execution_count, schedule_config, steps (FK)
- **Task Steps**: id, task_id, order_index, type (agent|checkpoint|merge|canvas|fork|join), name, agent_id, agent_name, agent_model, instructions, context_mode, skill_ids, canvas_id, fork_group, branch_index, branch_label, connector_config
- **Cat Paws** (agents): id, name, description, avatar_emoji, avatar_color, system_prompt, tone, mode, model, temperature, max_tokens, processing_instructions, output_format, openclaw_id
- **Cat Paw CatBrains**: paw_id, catbrain_id, query_mode, priority (junction table)
- **Cat Paw Connectors**: paw_id, connector_id (junction table)
- **Skills**: id, name, description, category, tags, instructions, output_template, example_input, example_output, constraints, source, source_path, version, author
- **Worker Skills**: agent_id → skill_id junction
- **Canvases**: id, name, description, emoji, mode, status, flow_data (JSON with nodes/edges/viewport), thumbnail, tags, is_template
- **Connectors**: id, name, description, emoji, type (n8n_webhook|http_api|mcp_server|email|gmail), config (JSON), is_active, test_status

### File Storage
- All persistent data under `/app/data/` (mapped from `~/docflow-data/` via Docker volume)
- Existing directories: `projects/`, `logs/`, `bots/`
- Export ZIPs target: `/app/data/exports/` (new directory)

### Docker Architecture
- **docflow**: Node.js 20 app on port 3500 (internal 3000)
- **qdrant**: Vector DB on 6333/6334 — needed only if task uses RAG
- **ollama**: Local LLM on 11434 — needed only if task uses local models
- **docflow-searxng**: SearXNG on 8080 — needed only if task uses web search
- **docflow-init**: Init container for permissions

### API Patterns
- Route files: `app/src/app/api/...route.ts`
- `export const dynamic = 'force-dynamic'` on routes reading env vars
- File download pattern: `Content-Disposition: attachment; filename=...` (see `api/system/logs/download`)
- CRUD follows: GET list, POST create, GET by id, PATCH update, DELETE

### Dependencies
- **No ZIP library installed** — need to add `archiver` (npm standard for ZIP creation)
- Node.js built-in `fs`, `path`, `stream` for file operations
- `uuid` for ID generation

### Task Executor Integration
- `executeTask(taskId)` in `lib/services/task-executor.ts`
- `executeTaskWithCycles(taskId)` wraps for variable/scheduled modes
- Agent steps check `cat_paws` table first (Phase 55+), fallback to `custom_agents`
- Canvas steps use `canvas_id` FK to `canvases` table
- Fork/join uses `fork_group`, `branch_index`, `branch_label`
- Connector integration via `connector_config` JSON on steps

### i18n
- `next-intl` with `messages/es.json` and `messages/en.json`
- Pattern: `const t = useTranslations()` + `t('tasks.export')`

## Gap Analysis

### What's Missing for Phase 61

1. **ZIP bundle generator** — No export logic exists. Need:
   - Resource collector: gather task config, steps, referenced agents (cat_paws), skills, canvases
   - Manifest builder: analyze dependencies to determine required Docker services
   - ZIP archiver: create structured bundle with config/, docker/, runner/, install/ directories
   - File writer: save to `/app/data/exports/`

2. **Export API routes** — None exist:
   - POST `/api/tasks/[id]/export` — generate bundle
   - GET `/api/tasks/[id]/exports` — list bundles for task
   - GET `/api/tasks/[id]/exports/[bundleId]/download` — serve ZIP
   - DELETE `/api/tasks/[id]/exports/[bundleId]` — remove bundle
   - POST `/api/tasks/import` — import bundle

3. **Docker templates** — Need templated docker-compose.yml with conditional services:
   - Always: docflow (app)
   - Conditional: qdrant (if RAG), ollama (if local models), searxng (if web search)

4. **Install scripts** — Need:
   - `install.sh` for Linux/Mac (Docker check, setup-wizard, pull, start)
   - `install.ps1` for Windows (same flow in PowerShell)
   - `setup-wizard.js` (Node.js prompt for credentials)

5. **Runner HTML** — Standalone page: connect to localhost:3500, POST execute, poll status, show progress, download result

6. **Import endpoint** — POST /api/tasks/import: validate manifest, create task + steps + agents + skills + canvases idempotently by slug/name

7. **Task detail UI** — Collapsible export section with:
   - Resource summary (agents, skills, canvases, connectors count)
   - Required services list
   - "Generar bundle" button
   - Previous bundles list with download/delete

8. **`archiver` dependency** — Must npm install archiver + @types/archiver

## Architecture Decisions

### Bundle Structure
**Decision**: Flat structure under ZIP root
```
{task-slug}-bundle/
├── manifest.json
├── config/
│   ├── task.json          (task + steps serialized)
│   ├── canvases/          (one .json per referenced canvas)
│   ├── agents/            (one .json per referenced cat_paw)
│   └── skills/            (one .json per referenced skill)
├── docker/
│   └── docker-compose.yml (minimal, conditional services)
├── runner/
│   └── index.html         (standalone executor page)
└── install/
    ├── install.sh          (Linux/Mac)
    ├── install.ps1         (Windows)
    └── setup-wizard.js     (credential prompts)
```

### Service Detection Logic
**Decision**: Analyze task steps to determine required services
- **Qdrant**: Any step has `context_mode = 'rag'` OR `use_project_rag = 1`
- **Ollama**: Any referenced agent uses a local model (model name starts with `ollama/`)
- **SearXNG**: Any agent has web search tool enabled (check cat_paw tools/config)
- **LiteLLM**: Always included (proxy for all LLM calls)

### Import Idempotency
**Decision**: Import by slug/name matching — if resource with same name exists, skip (don't overwrite)
**Why**: Prevents accidental data loss on re-import; user can manually update if needed

### Plan Breakdown
**Decision**: 4 plans
1. **61-01**: archiver dep + bundle generator service + export API route (POST generate)
2. **61-02**: Bundle CRUD routes (list, download, delete) + import endpoint
3. **61-03**: Docker templates + install scripts + runner HTML (static files)
4. **61-04**: Export section UI on task detail page + i18n

## Key Files to Modify/Create

| File | Changes |
|------|---------|
| `package.json` | Add `archiver` + `@types/archiver` |
| `lib/services/bundle-generator.ts` | **NEW** — Collect resources, build manifest, create ZIP |
| `app/api/tasks/[id]/export/route.ts` | **NEW** — POST generate bundle |
| `app/api/tasks/[id]/exports/route.ts` | **NEW** — GET list bundles |
| `app/api/tasks/[id]/exports/[bundleId]/download/route.ts` | **NEW** — GET serve ZIP |
| `app/api/tasks/[id]/exports/[bundleId]/route.ts` | **NEW** — DELETE bundle |
| `app/api/tasks/import/route.ts` | **NEW** — POST import bundle |
| `lib/export-templates/` | **NEW** — Docker, install, runner templates |
| `app/tasks/[id]/page.tsx` | Add export section |
| `messages/es.json` | Add export keys |
| `messages/en.json` | Add export keys |
