# Project Research Summary

**Project:** DoCatFlow v6.0 — Testing Inteligente + Performance + Estabilizacion
**Domain:** Testing infrastructure, LLM streaming, and app stabilization for a self-hosted Next.js 14 document intelligence platform
**Researched:** 2026-03-12
**Confidence:** HIGH

## Executive Summary

DoCatFlow v6.0 is a stabilization and capability milestone on top of an already-deployed, multi-section Next.js 14 + Docker application. The milestone adds three distinct capability layers: resilience utilities (retry, cache, error boundaries, structured logging), LLM response streaming for interactive chat surfaces, and a full E2E testing infrastructure centered on a new `/testing` page. Because the existing codebase and stack are validated and unchanged, this milestone is lower-risk than a greenfield build — the core challenge is making targeted, additive changes without breaking existing behavior.

The recommended approach is strictly additive: new service modules (`retry.ts`, `cache.ts`, `logger.ts`, `llm-stream.ts`) slot into the existing `lib/services/` layer alongside unchanged services. New streaming routes are parallel endpoints (`/api/catbot/stream`, `/api/projects/[id]/stream`) that coexist with the current non-streaming routes. Playwright lives exclusively on the host machine as a devDependency targeting the Docker container via `http://localhost:3500`. This architecture avoids Docker image bloat, preserves backward compatibility for all existing clients, and delivers each feature independently.

The dominant risk cluster sits around three pitfalls: retry logic accidentally applied to non-idempotent LLM generation calls (causes double execution and DB corruption); LLM streaming responses silently buffered by Next.js when the `ReadableStream` is not constructed correctly or `dynamic = 'force-dynamic'` is missing; and Playwright installed inside Docker instead of on the host (500MB+ image bloat and silent test failures). All three are preventable with explicit code-review checklists established at the start of each phase.

## Key Findings

### Recommended Stack

The existing validated stack (Next.js 14, React 18, Tailwind, shadcn/ui, better-sqlite3, Qdrant, LiteLLM, @xyflow/react, recharts) is completely unchanged. Only three new npm packages are required for v6.0: `@playwright/test@^1.58.2` (devDependency, host-only), and optionally `winston@^3.19.0` + `winston-daily-rotate-file@^5.0.0` (production dependencies for structured logging — see gap note below). All other capabilities — streaming, TTL cache, retry, error boundaries — are built from Web/Node APIs already available in the runtime with no new packages.

**Core technologies (new additions only):**
- `@playwright/test@^1.58.2`: E2E and API test runner — only framework with built-in API testing fixture, JSON reporter, and POM support without additional packages. Chromium-only on host machine (Node 22).
- Custom `logger.ts` (preferred) or `winston` + `winston-daily-rotate-file` (fallback): Structured JSONL file logging with 7-day rotation to `/app/data/logs/`. The custom approach is sufficient and avoids two production dependencies.
- Web Streams API (`ReadableStream`, `TextEncoder`): LLM response streaming — built into Next.js 14 Node.js runtime (Node 18+), no polyfill needed.
- TypeScript `Map` singleton (`cache.ts`): In-memory TTL cache — explicitly required by project constraints ("in-memory, resets on restart"). Zero dependencies.
- Pure TypeScript `withRetry` (`retry.ts`): Exponential backoff with jitter — ~25 lines, no external dependency justified.

**Do NOT add:** WebSocket/socket.io (excluded by project), Redis (overkill for single-user), Vercel AI SDK (large dep; LiteLLM already speaks OpenAI SSE), `p-retry` or `node-cache` (too trivial to justify a dependency), Cypress (heavier than Playwright, requires separate dashboard), `pino` (no built-in file rotation in Docker).

### Expected Features

**Must have (table stakes):**
- Playwright test runner executable from `/testing` UI — any test dashboard without a run button is a dead end
- Live test results table per test (pass/fail/duration/error) — totals alone are insufficient
- LLM streaming in Chat panel — current silent-wait UX is the primary user pain point; first token must appear within 1-2s
- LLM streaming in CatBot panel — same UX expectation; tool-call resolution completes synchronously before stream begins
- `withRetry` on all external service `fetch()` calls (LiteLLM, Qdrant, Ollama, OpenClaw) — bare `fetch()` is the current silent failure mode
- React Error Boundaries per section via `error.tsx` — Canvas crash must not kill the sidebar; base `ErrorBoundary` component already exists, just not deployed per-section
- Structured log viewer in `/testing` — users must not need SSH to read logs from the running app

**Should have (differentiators):**
- AI-powered test generation script (`scripts/generate-tests.ts`) — reads source files, generates Playwright POM specs via LLM; reduces spec authoring time substantially
- Per-service latency (`latency_ms`) in health check — current UP/DOWN is insufficient for diagnosing degraded (not down) services
- Error Boundary proactive CatBot reporting — on `componentDidCatch`, push error context to CatBot local state for proactive messaging
- In-memory TTL cache on hot endpoints (health 30s, agents 30s, dashboard 60s, settings/models 300s) — reduces SQLite round-trips on parallel page-load requests
- LLM streaming in Processing panel — shows document being written in real time; higher complexity due to multi-source sequential processing

**Defer (v2+):**
- Coverage report integration — requires instrumented builds; E2E coverage misleads; HIGH build complexity for LOW return
- Test scheduling/cron — excluded by project constraints; manual "Ejecutar" button sufficient for single-user tool
- AI test generation from `/testing` UI — ship CLI script first; UI wrapper adds MEDIUM cost for LOW marginal value
- Cache hit/miss telemetry endpoint — add only when TTL values need tuning
- Parallel test workers — causes SQLite lock errors with shared live DB; `workers: 1` is the correct constraint

### Architecture Approach

The v6.0 architecture is a strict extension of the existing layered pattern: new service modules in `lib/services/`, new parallel API routes under `app/api/`, a new page at `app/testing/`, and `error.tsx` files co-located with each route segment. Playwright lives completely outside the Docker image — tests run from the host, results are written to a shared Docker volume (`/app/data/test-results/`), and the `/testing` page polls the results file. The key architectural bridge is a trigger mechanism: the API writes a trigger file to a shared volume, and a host-side watch script runs Playwright when the trigger appears. This keeps the Docker image lean (no Chromium) while enabling in-app test management.

**Major components (all new or additive):**
1. `lib/services/retry.ts` — `withRetry(fn, opts)` wrapping external service `fetch()` calls; explicitly NOT applied to LLM generation calls (non-idempotent). ~30 lines.
2. `lib/services/cache.ts` — `ttlCache` Map singleton with per-key TTL; fixed key set only (no dynamic per-request keys to prevent unbounded growth). ~40 lines.
3. `lib/services/logger.ts` — JSONL writer to `/app/data/logs/`; rotation via date-check-on-write (not setInterval); mirrors to console; pure fs I/O (no DB imports, no circular dependency).
4. `lib/services/llm-stream.ts` — `chatStream()` returning `ReadableStream<Uint8Array>` from LiteLLM; parallel to existing `chatCompletion()` with no changes to the original function signature.
5. `app/api/catbot/stream/route.ts` and `app/api/projects/[id]/stream/route.ts` — streaming endpoints requiring `dynamic = 'force-dynamic'`, `runtime = 'nodejs'`, and `X-Accel-Buffering: no` header.
6. `app/api/testing/run|results|logs|generate` — run trigger (writes file to volume), results reader (parses Playwright JSON report), log reader (reads JSONL lines), AI generator (calls `chatCompletion`).
7. `app/testing/page.tsx` — run button (disabled while running), results table, log viewer with level filter.
8. `app/[section]/error.tsx` — one per major route segment (projects, tasks, agents, testing, canvas, workers, skills, connectors). Must be `'use client'`, uses Next.js App Router file convention (not class-based ErrorBoundary wrapping Server Components).
9. `tests/` (repo root, host-only) — `playwright.config.ts` (baseURL: http://localhost:3500, workers:1, JSON reporter to `/app/data/test-results/`), Page Object Models, E2E specs, API specs. NOT inside `app/` to avoid Next.js TypeScript config conflicts.

### Critical Pitfalls

1. **`withRetry` applied to LLM generation calls** — Network timeouts are ambiguous: a timeout does not mean the LLM server did not process the request. Retrying causes double execution, double DB writes, double token costs, and corrupted task/canvas output. Apply `withRetry` ONLY to idempotent read-only operations (health pings, embeddings, Qdrant searches). For LLM calls: use 120s+ timeouts and expose a UI "Reintentar" button instead of code-level retry.

2. **Streaming response buffered by Next.js (two failure modes)** — (a) Missing `export const dynamic = 'force-dynamic'` causes static prerendering in Docker builds while dev works fine. (b) Awaiting the full stream before constructing the `Response` defeats streaming — the `ReadableStream` `start(controller)` function must run in the background while `new Response(stream, ...)` is returned immediately. Verification: browser DevTools Network tab must show progressive chunks, not a single response with total generation time.

3. **Playwright installed in the Docker image** — `node:20-slim` lacks the 25+ system libraries Chromium requires (libglib2, libnss3, libasound2, etc.). Results: failed Docker build or ~1GB image. Playwright must be a host devDependency only. The `.dockerignore` must exclude `tests/`, `playwright-report/`, and `test-results/`.

4. **SQLite test state pollution** — Tests hit the real live DB with no isolation. Prevention: `[TEST]` prefix on all test-created data, `globalSetup`/`globalTeardown` scripts that delete `[TEST]` rows, and `workers: 1` in `playwright.config.ts` to prevent concurrent writes causing SQLite lock errors.

5. **Log files written to container ephemeral filesystem** — Any path outside `/app/data/` (e.g., `/app/logs/`) is wiped on `docker restart`. Logs MUST write to `/app/data/logs/`. Verify after a container restart: `ls /home/deskmath/docflow-data/logs/` on the host must show log files.

## Implications for Roadmap

Based on research dependencies and pitfall-prevention sequencing, five phases are recommended:

### Phase 1: Resilience Foundations
**Rationale:** All other phases depend on these utilities. `withRetry` must exist before streaming (network errors during stream setup need retry logic) and before any phase that surfaces previously silent failures. Logger must exist before Error Boundaries (boundaries need a structured write target). Cache is fully independent and can land here with zero risk. All four utilities have no inter-dependencies and can be implemented in parallel or sequentially within one phase.
**Delivers:** `retry.ts`, `cache.ts`, `logger.ts`, enhanced health check with `latency_ms` per service, `error.tsx` files per section with CatBot reporting hook
**Addresses:** withRetry (P1), logger (P1), cache (P1), health check (P1), Error Boundaries (P1) from FEATURES.md
**Avoids:** `withRetry` on LLM calls (document `shouldRetry` exclusions from day 1), log file on container filesystem (establish `/app/data/logs/` path immediately), `setInterval` log rotation (use date-check-on-write pattern), Error Boundaries wrapping Server Components (use `error.tsx` file convention only)

### Phase 2: Playwright Foundation
**Rationale:** Playwright infrastructure must precede the `/testing` page (the run button has nothing to execute without specs) and AI test generation (nothing to generate into). Host-only installation, shared volume architecture, and SQLite test isolation must be established before any spec writes data to the live DB.
**Delivers:** `@playwright/test` devDependency on host, `tests/playwright.config.ts` (baseURL, workers:1, JSON reporter to `/app/data/test-results/`), `globalSetup`/`globalTeardown` with `[TEST]` prefix cleanup, Page Object Models for all 8 sections, 7 API specs, 15 E2E specs, `data-testid` attributes added to key interactive UI elements
**Addresses:** Playwright test suite (P1) from FEATURES.md
**Avoids:** Playwright in Docker (host-only with `.dockerignore` entries verified), SQLite state pollution (`[TEST]` prefix convention from spec 1), `waitForTimeout` usage (ESLint rule added to config before any spec is written)

### Phase 3: Testing Dashboard (/testing page)
**Rationale:** Requires Phase 1 (logger must exist for log viewer to have content) and Phase 2 (specs must exist for the run button to be useful). The trigger-file architecture is the key design decision: Next.js API writes a trigger file to a shared Docker volume; a host-side watch script detects the trigger and runs Playwright; results land back in the volume for the UI to poll.
**Delivers:** `/testing` sidebar entry, `POST /api/testing/run` (writes trigger file), `GET /api/testing/results` (parses Playwright JSON report), `GET /api/testing/logs` (reads JSONL log lines), `/testing/page.tsx` (run button disabled-while-running, results table, log viewer with level filter), host-side watch script, docker-compose volume additions for test-results and test-trigger paths
**Addresses:** /testing page (P2), log viewer (table stakes), test run history from FEATURES.md
**Avoids:** Playwright child process with no timeout (hard 5-minute SIGKILL timer + single-run enforcement), Chromium process accumulation (disable run button while running, check trigger file status before spawning)

### Phase 4: LLM Streaming
**Rationale:** Requires Phase 1 (retry for connection resilience in stream setup, logger for stream error reporting). Independent of Phases 2-3. Streaming is the highest-impact user-facing change in this milestone — Chat and CatBot go from a 30s+ spinner to progressive token display. The shared `chatStream()` function in `llm-stream.ts` is built once and consumed by all streaming surfaces.
**Delivers:** `lib/services/llm-stream.ts` with `chatStream()`, `/api/projects/[id]/stream/route.ts`, `/api/catbot/stream/route.ts`, updated `chat-panel.tsx` and `catbot-panel.tsx` with `ReadableStreamDefaultReader` consumption and `AbortController` cleanup in `useEffect`. Processing panel streaming is in scope but should be treated as Phase 4 optional (higher complexity due to multi-source sequential architecture).
**Addresses:** LLM streaming Chat (P2), LLM streaming CatBot (P2), LLM streaming Processing (P3) from FEATURES.md
**Avoids:** Missing `dynamic = 'force-dynamic'` (verify in `npm run build` before Docker deploy), buffered response (verify in DevTools Network tab — chunks must appear progressively), SSE stream not closed on navigation (AbortController in useEffect cleanup), missing `X-Accel-Buffering: no` header breaking nginx proxy buffering inside Docker

### Phase 5: AI Test Generation
**Rationale:** Depends on Phase 2 (Playwright installed and `tests/e2e/` directory established as the output target) and an existing `chatCompletion()` function in `llm.ts` (synchronous call, no streaming needed). Independent of the `/testing` page UI — ships as a CLI script first; UI integration is an optional follow-on.
**Delivers:** `scripts/generate-tests.ts` CLI script reading source file paths, calling `chatCompletion`, and writing `.spec.ts` output; generation prompt template with Spanish-language enforcement ("Toda la interfaz está en español"), source file content included as LLM context, `data-testid` selector preference instruction, dry-run validation before writing; optionally `/api/testing/generate` endpoint for UI integration
**Addresses:** AI test generation (P2) from FEATURES.md
**Avoids:** Hallucinated English selectors (Spanish constraint in prompt + actual component source as context + `data-testid` preference), merging untested specs (require one successful `npx playwright test <generated-file>` run before committing)

### Phase Ordering Rationale

- **Foundations first:** `retry.ts`, `logger.ts`, `cache.ts` have zero dependencies and must exist before streaming needs error logging, before the testing page needs log viewer content, and before AI generation needs usage logging. Building them first costs little and reduces risk in all subsequent phases.
- **Playwright before testing page:** The `/testing` page run button is meaningless without specs. Establishing the host-only architecture and SQLite isolation before building UI around it avoids building on an unvalidated foundation.
- **Streaming after foundations, before AI generation:** Higher complexity and more failure modes than Phases 1-3. Phase 1 foundations reduce streaming risk. Keeping existing non-streaming routes unchanged means Phase 4 work has no blast radius on live functionality.
- **AI generation last:** Depends on both Playwright (output target) and a stable, testable app. The CLI script is independent of the `/testing` page, so it can ship incrementally without waiting for UI work.

### Research Flags

Phases needing deeper research during planning:
- **Phase 3 (/testing page):** The host-side watch script mechanism — `inotifywait` vs polling loop vs a Node.js `fs.watchFile` watcher — is not fully specified in research. The trigger-file pattern is sound architecturally; the exact host-side implementation needs validation before Phase 3 planning commits to an approach.
- **Phase 5 (AI test generation):** The LLM prompt template for generating Spanish-language POM Playwright specs is the critical variable. Research flags this as MEDIUM confidence. Recommend testing 2-3 prompt variants against a real DoCatFlow page component before finalizing the template.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundations):** Map-based TTL cache, exponential backoff retry, JSONL logger, and Next.js `error.tsx` boundaries are all documented patterns with authoritative official sources and well-understood implementations.
- **Phase 2 (Playwright):** POM structure, API testing via `request` fixture, `globalSetup`/`globalTeardown`, worker serialization are covered exhaustively in official Playwright docs. The patterns are unambiguous.
- **Phase 4 (Streaming):** Web Streams API + SSE in Next.js App Router is covered in official Next.js GitHub discussions with verified working patterns documented in ARCHITECTURE.md. The CatBot tool-loop interaction (resolve tools synchronously, then stream final reply) is the one area worth a brief design review during phase planning, but no external research is needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Only 3 new packages; all versions verified live via `npm show`. Custom utilities use standard Node/Web APIs with no ambiguity. Logger library choice (custom vs winston) is the only open decision. |
| Features | HIGH | Grounded in direct codebase analysis of `llm.ts`, `error-boundary.tsx`, health route, catbot routes, task-executor. Feature boundaries are well-defined. |
| Architecture | HIGH | Direct codebase analysis of all affected service modules and API routes. Component responsibilities, data flow, and integration points are explicit in ARCHITECTURE.md with working code samples. |
| Pitfalls | HIGH | Majority sourced from official Next.js GitHub discussions and Playwright official documentation. 14 specific pitfalls with concrete prevention steps, phase assignments, and recovery costs. |

**Overall confidence:** HIGH

### Gaps to Address

- **Logger library choice:** FEATURES.md proposes a custom `fs.appendFileSync` logger to avoid dependencies. STACK.md recommends `winston` for production-grade rotation edge-case handling. Both are viable. Resolve in Phase 1 planning — the recommended decision is the custom logger (fewer dependencies, ARCHITECTURE.md has the full implementation), with `winston` as a fallback if concurrent-write or rotation edge cases emerge during testing.
- **Host watch script mechanism:** ARCHITECTURE.md specifies the trigger-file pattern without committing to `inotifywait` vs polling. For a single-user tool, a host-side polling loop checking every 2s is simpler and sufficient. Resolve during Phase 3 planning.
- **Processing panel streaming complexity:** FEATURES.md rates this P3/HIGH complexity because multi-source sequential processing requires streaming per-source-chunk with progressive aggregation. The roadmap should explicitly treat this as optional within Phase 4 scope — deliver Chat and CatBot streaming first, add Processing streaming as a follow-on if Phase 4 timeline permits.
- **`data-testid` attribute rollout scope:** Both Playwright POM tests and AI generation benefit from `data-testid` attributes that do not currently exist across the 8 section pages. Phase 2 must include a pass over all key interactive elements — this is a non-trivial frontend change that the research files mention but do not fully scope. Plan it explicitly as a Phase 2 task item, not an afterthought.
- **Startup DB cleanup for zombie running states:** PITFALLS.md documents that in-memory cancel flags are lost on Docker restart, leaving tasks and canvas runs stuck in `running` state. A startup recovery routine (`UPDATE tasks SET status = 'failed' WHERE status = 'running'`) should be added in Phase 1 alongside the resilience utilities — it is a one-liner with high recovery value.

## Sources

### Primary (HIGH confidence)
- Playwright official docs (playwright.dev) — E2E setup, POM, API testing, Docker guidance, best practices
- Next.js 14 App Router official docs (nextjs.org/docs/app) — error.tsx convention, dynamic route handling, streaming
- Next.js GitHub discussions (#67501, #50614, #48427, #61972, #65350) — SSE streaming, ReadableStream behavior, singleton issues in App Router
- `npm show` live queries — verified package versions: @playwright/test 1.58.2, winston 3.19.0, winston-daily-rotate-file 5.0.0
- DoCatFlow codebase direct analysis — `llm.ts`, `catbot-tools.ts`, `usage-tracker.ts`, `task-executor.ts`, `canvas-executor.ts`, `/api/catbot/chat/route.ts`, `/api/projects/[id]/chat/route.ts`, `/api/health/route.ts`
- better-sqlite3 performance docs — WAL mode, single-writer constraint, synchronous API behavior

### Secondary (MEDIUM confidence)
- Upstash blog — SSE + ReadableStream LLM streaming patterns in Next.js App Router
- BrowserStack Playwright best practices 2026 — test organization and selector stability
- Checkly blog — AI test generation with Playwright and LLM prompt engineering
- OneUptime blog (2026-01-30) — Node.js in-memory TTL cache patterns
- Semaphore blog — Playwright flaky test prevention and `waitForTimeout` alternatives
- BetterStack — Pino vs Winston structured logging comparison

### Tertiary (LOW confidence)
- 2026 community reports on Next.js streaming `start()` callback requirement — mentioned in STACK.md as MEDIUM confidence; consistent with Next.js SSE discussions but not an official doc reference

---
*Research completed: 2026-03-12*
*Ready for roadmap: yes*
