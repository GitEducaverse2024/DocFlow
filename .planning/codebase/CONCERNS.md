# Codebase Concerns

**Analysis Date:** 2026-03-11

## Tech Debt

**Schema Migration via try/catch ALTER TABLE:**
- Issue: Database schema migrations are handled by wrapping `ALTER TABLE ADD COLUMN` in try/catch blocks that silently swallow errors. There is no versioned migration system.
- Files: `app/src/lib/db.ts` (lines 79-118, 140-144, 352-357)
- Impact: No way to track schema state, rollback changes, or handle column type changes. Adding a column with constraints or renaming/removing columns is impossible with this pattern. Silent catch blocks may hide real errors.
- Fix approach: Introduce a `schema_version` table and a sequential migration runner. Each migration is a numbered function that checks the current version before applying.

**Monolithic db.ts with seed data:**
- Issue: `db.ts` is 687 lines and combines schema creation, ALTER TABLE migrations, and extensive seed data (workers, skills, settings, API keys) all in module-level imperative code that runs on import.
- Files: `app/src/lib/db.ts`
- Impact: Slow cold starts, hard to test, impossible to reset seeds independently. Every import of `db` triggers all initialization logic.
- Fix approach: Split into `schema.ts`, `migrations.ts`, `seeds.ts`, and `db.ts` (connection only). Run seeds conditionally via a startup script.

**Massive code duplication between bot/create and agents/create:**
- Issue: `app/src/app/api/projects/[id]/bot/create/route.ts` (243 lines) and `app/src/app/api/agents/create/route.ts` (340 lines) share near-identical logic for OpenClaw registration, workspace creation, file generation, gateway reload, and signal file writing.
- Files: `app/src/app/api/projects/[id]/bot/create/route.ts`, `app/src/app/api/agents/create/route.ts`
- Impact: Bug fixes must be applied in two places. Divergence between the two is inevitable.
- Fix approach: Extract shared OpenClaw registration logic into `app/src/lib/services/openclaw.ts` with functions like `registerAgent()`, `createWorkspace()`, `reloadGateway()`.

**Process route is 387 lines of inline logic:**
- Issue: The main processing route handles request validation, source loading, content truncation, LLM prompt building, LLM calling, file writing, DB updates, worker/skill usage tracking, n8n webhook fallback -- all in a single file with deeply nested async closures.
- Files: `app/src/app/api/projects/[id]/process/route.ts`
- Impact: Very hard to test, debug, or modify any single aspect of processing without risk of breaking others.
- Fix approach: Extract into a `ProcessingService` with methods for each phase: `validateRequest()`, `loadSources()`, `buildPrompt()`, `callLLM()`, `saveOutput()`, `updateStats()`.

**Large component files without decomposition:**
- Issue: Several UI components exceed 500 lines with mixed concerns (data fetching, state management, rendering).
- Files: `app/src/components/process/process-panel.tsx` (954 lines), `app/src/components/agents/agent-creator.tsx` (726 lines), `app/src/components/rag/rag-panel.tsx` (712 lines), `app/src/app/skills/page.tsx` (640 lines), `app/src/components/projects/project-settings-sheet.tsx` (625 lines)
- Impact: Difficult to maintain, test, or reuse sub-components.
- Fix approach: Extract sub-panels, forms, and list components. Use custom hooks for data fetching logic.

## Known Bugs

**Async fire-and-forget processing loses errors:**
- Symptoms: When `startLocalProcessing()` is called without `await` (line 354 of process route), unhandled promise rejections can occur silently. The function is called without `await` intentionally to return a response immediately, but if it throws before the internal try/catch, the error is lost.
- Files: `app/src/app/api/projects/[id]/process/route.ts` (line 354)
- Trigger: LLM call fails in certain edge cases before the inner try block.
- Workaround: The inner try/catch handles most cases, but the pattern is fragile.

**Meta file path mismatch for folder uploads:**
- Symptoms: When files are uploaded with folder structure (relativePath), the source file is saved to a subdirectory but the `.meta.json` is always saved to the root of `sourcesDir`. The DELETE handler then looks for meta at `path.dirname(source.file_path)` which would be the subdirectory, not the root.
- Files: `app/src/app/api/projects/[id]/sources/route.ts` (lines 84-99), `app/src/app/api/projects/[id]/sources/[sid]/route.ts` (line 21)
- Trigger: Upload a file with a relativePath containing directories, then delete it.
- Workaround: Meta files are orphaned but do not cause crashes.

## Security Considerations

**No authentication or authorization on any API route:**
- Risk: All API endpoints are publicly accessible without any form of authentication. Anyone with network access can create/delete projects, read/modify API keys, trigger LLM processing, and delete data.
- Files: All files under `app/src/app/api/` (38+ route files with 50+ endpoints)
- Current mitigation: The app appears to run on a private network (192.168.1.49). No middleware.ts exists.
- Recommendations: Add authentication middleware at minimum for destructive operations. For a single-user self-hosted app, consider a simple bearer token or basic auth check.

**Hardcoded LiteLLM API key in source code:**
- Risk: The string `sk-antigravity-gateway` is hardcoded as a fallback API key in multiple files, and also appears in UI diagnostic snippets shown to users.
- Files: `app/src/lib/services/litellm.ts` (line 2), `app/src/app/api/workers/generate/route.ts` (line 13), `app/src/app/api/skills/generate/route.ts` (line 13), `app/src/app/api/projects/[id]/chat/route.ts` (line 19), `app/src/app/api/projects/[id]/process/route.ts` (line 244), `app/src/app/api/health/route.ts` (line 28), `app/src/components/system/diagnostic-content.ts` (line 90)
- Current mitigation: This is a local LiteLLM proxy key, not a third-party API key.
- Recommendations: Remove all hardcoded keys from source. Use env vars only, fail with a clear error if not set.

**Hardcoded private IP addresses throughout codebase:**
- Risk: `192.168.1.49` appears as fallback in 25+ locations across API routes and UI components. This leaks infrastructure details and makes the app non-portable.
- Files: See grep results -- spans `app/src/lib/db.ts`, `app/src/lib/services/litellm.ts`, `app/src/app/api/health/route.ts`, `app/src/app/api/projects/[id]/process/route.ts`, `app/src/components/system/diagnostic-content.ts`, `app/src/components/rag/rag-panel.tsx`, and many more.
- Current mitigation: Values are used as fallbacks when env vars are not set.
- Recommendations: Replace all hardcoded IPs with `localhost` or Docker service names as defaults. Use env vars exclusively for production.

**Hardcoded username "deskmath" in generated files:**
- Risk: Agent workspace files generated by the API contain `Nombre: deskmath` hardcoded.
- Files: `app/src/app/api/agents/create/route.ts` (line 101), `app/src/app/api/projects/[id]/bot/create/route.ts` (line 165)
- Current mitigation: None.
- Recommendations: Make the username configurable via settings or env var.

**Unauthenticated processing callback endpoint:**
- Risk: The `/api/projects/[id]/process/callback` endpoint accepts POST requests that can update processing run status and project status. Any caller can mark a run as completed or failed.
- Files: `app/src/app/api/projects/[id]/process/callback/route.ts`
- Current mitigation: The endpoint requires knowing a valid `run_id` (UUID), which provides weak security through obscurity.
- Recommendations: Add a shared secret or HMAC verification for callback requests from n8n.

**API keys stored in SQLite without encryption:**
- Risk: LLM provider API keys (OpenAI, Anthropic, Google) are stored as plaintext in the SQLite database.
- Files: `app/src/lib/db.ts` (api_keys table, lines 652-685), `app/src/app/api/settings/api-keys/[provider]/route.ts`
- Current mitigation: Keys are masked when returned via GET. The database file is on a local filesystem.
- Recommendations: Encrypt keys at rest using a master key from an env var.

**File upload has no size limits:**
- Risk: The file upload endpoint in sources/route.ts accepts files of any size. A single large upload could exhaust memory (entire file is loaded into a Buffer) or fill disk.
- Files: `app/src/app/api/projects/[id]/sources/route.ts` (line 42: `Buffer.from(await file.arrayBuffer())`)
- Current mitigation: None.
- Recommendations: Add file size limits (e.g., 50MB). Use streaming for large files.

**execSync for PDF extraction with user-controlled paths:**
- Risk: `content-extractor.ts` passes file paths to `execSync(pdftotext "${filePath}" -)`. While the path comes from the server (not directly from user input), if a filename contained shell metacharacters it could be exploited.
- Files: `app/src/lib/services/content-extractor.ts` (line 69)
- Current mitigation: File paths use UUID-based names generated server-side, not original filenames.
- Recommendations: Use `execFileSync` instead of `execSync` to avoid shell interpolation entirely.

## Performance Bottlenecks

**Synchronous SQLite on API routes:**
- Problem: All database operations use synchronous `better-sqlite3` calls on the Node.js event loop. During heavy queries or concurrent requests, this blocks the entire server.
- Files: `app/src/lib/db.ts`, all API route files
- Cause: `better-sqlite3` is synchronous by design. Single-threaded Node.js cannot serve other requests during DB operations.
- Improvement path: For the current scale (single-user, self-hosted), this is acceptable. If scaling is needed, consider wrapping in worker threads or switching to an async SQLite driver.

**Full file content stored in SQLite TEXT columns:**
- Problem: Source file content is stored entirely in `content_text` column of the `sources` table. Large documents (PDFs, codebases) can be multiple MB each, all loaded into memory on queries like `SELECT *`.
- Files: `app/src/app/api/projects/[id]/sources/route.ts` (line 11), `app/src/app/api/projects/[id]/process/route.ts` (line 103)
- Cause: Schema stores full extracted text inline rather than in separate files.
- Improvement path: Store content in files on disk, keep only metadata in SQLite. The sources GET already uses `length(content_text) as content_text_length` to avoid returning full content, but `SELECT *` in process route loads everything.

**RAG worker polling with setInterval:**
- Problem: The RAG create endpoint uses a 1-second `setInterval` to poll a status file, running indefinitely for up to 10 minutes (600 polls). This happens in the API route's closure, tying up server resources.
- Files: `app/src/app/api/projects/[id]/rag/create/route.ts` (lines 83-121)
- Cause: Inter-process communication via filesystem polling rather than IPC or events.
- Improvement path: Use Node.js `child_process` IPC messages or a proper job queue.

## Fragile Areas

**Dynamic SQL UPDATE construction:**
- Files: `app/src/app/api/projects/[id]/route.ts` (line 52), `app/src/app/api/projects/[id]/sources/[sid]/route.ts` (line 62), `app/src/app/api/workers/[id]/route.ts` (line 44), `app/src/app/api/skills/[id]/route.ts` (line 49), `app/src/app/api/settings/api-keys/[provider]/route.ts` (line 40)
- Why fragile: Multiple PATCH endpoints build SQL strings dynamically via `updates.join(', ')`. While column names come from a fixed allowlist in some routes (workers, skills), others (projects, sources) accept arbitrary field names from the request body. The parameterized values prevent SQL injection, but the column names are constructed from code logic, not validated against a schema.
- Safe modification: Always validate field names against an explicit allowlist before building the SQL string.
- Test coverage: No tests exist.

**OpenClaw JSON file manipulation:**
- Files: `app/src/app/api/agents/create/route.ts` (lines 147-177), `app/src/app/api/projects/[id]/bot/create/route.ts` (lines 57-87)
- Why fragile: Both routes read, parse, modify, and rewrite `openclaw.json`. Concurrent writes from multiple requests could corrupt the file. No file locking is used.
- Safe modification: Use a mutex or file lock when writing openclaw.json.
- Test coverage: No tests exist.

## Scaling Limits

**SQLite as primary database:**
- Current capacity: Adequate for single-user, dozens of projects with hundreds of sources.
- Limit: SQLite supports one writer at a time. Concurrent writes from multiple users or parallel processing would serialize and potentially timeout.
- Scaling path: Enable WAL mode (not currently set). For multi-user, migrate to PostgreSQL.

**In-memory RAG job tracking:**
- Current capacity: Works for one user running one RAG job at a time.
- Limit: `ragJobs` map is in-process memory. Server restart loses all job state. No persistence.
- Files: Referenced in `app/src/app/api/projects/[id]/rag/create/route.ts` (line 6, import from `@/lib/services/rag-jobs`)
- Scaling path: Persist job state in SQLite or use a proper job queue.

## Dependencies at Risk

**Next.js 14.2.35 (pinned, not latest):**
- Risk: Next.js 14 is no longer the latest major version. The `params` API used throughout all route handlers (`{ params }: { params: { id: string } }`) is the old synchronous style that changed in Next.js 15.
- Impact: Upgrading to Next.js 15+ will require updating every API route handler to use `await params`.
- Migration plan: When upgrading, use codemod or find/replace to update all route parameter access patterns.

**qdrant/qdrant:latest in docker-compose:**
- Risk: Using `latest` tag means any `docker compose pull` could introduce breaking API changes.
- Files: `docker-compose.yml` (line 34)
- Impact: Qdrant API changes could break RAG indexing and search.
- Migration plan: Pin to a specific Qdrant version.

**ollama/ollama:latest in docker-compose:**
- Risk: Same `latest` tag issue as Qdrant.
- Files: `docker-compose.yml` (line 43)
- Impact: Embedding model behavior changes could break RAG pipeline.
- Migration plan: Pin to a specific Ollama version.

## Missing Critical Features

**No authentication system:**
- Problem: Zero authentication on any endpoint. No middleware, no session management, no user concept.
- Blocks: Multi-user deployments, any public-facing deployment, audit trails.

**No input validation library:**
- Problem: Request body validation is ad-hoc (manual `if (!name)` checks). No schema validation (zod, joi, etc.).
- Files: All POST/PATCH API routes
- Blocks: Consistent error messages, type safety at API boundaries, documentation generation.

**No logging framework:**
- Problem: All logging uses `console.log` and `console.error`. No structured logging, no log levels, no correlation IDs.
- Files: All API route files
- Blocks: Production debugging, observability, audit trails.

## Test Coverage Gaps

**Zero test files exist:**
- What's not tested: The entire application. No unit tests, integration tests, or end-to-end tests.
- Files: No `*.test.*` or `*.spec.*` files found anywhere in the codebase.
- Risk: Any code change can silently break functionality. Refactoring is extremely risky.
- Priority: High. Start with API route integration tests for critical paths: project CRUD, source upload, processing pipeline.

---

*Concerns audit: 2026-03-11*
