# Feature Research

**Domain:** Testing infrastructure, LLM streaming, and app stabilization for a self-hosted document intelligence platform
**Researched:** 2026-03-12
**Project:** DoCatFlow v6.0 — Testing Inteligente + Performance + Estabilizacion
**Confidence:** HIGH (stack already defined, features grounded in existing codebase)

---

## Context

This is a **subsequent milestone** on an existing application (8 sections, CatBot, Canvas, MCP Bridge, Usage Tracking, Docker-deployed). Research focuses on what is genuinely needed for:

1. A `/testing` dashboard page integrated into the app sidebar
2. AI-powered test generation (script reads code, generates Playwright specs)
3. LLM response streaming for Chat, CatBot, and Processing panels
4. In-memory TTL cache for frequent API endpoints
5. `withRetry` utility for external service calls
6. React Error Boundaries per section with CatBot reporting
7. Structured logging with file rotation and visibility in `/testing`
8. Enhanced health checks with per-service latency

**Existing codebase state relevant to this milestone:**
- `llm.ts` — synchronous `chatCompletion()`, no streaming support, handles 5 providers
- `error-boundary.tsx` — base `ErrorBoundary` class component exists but not deployed per-section
- No retry logic anywhere (`fetch()` calls are bare)
- No structured logging (only `console.error` scattered across API routes)
- No in-memory cache (every hot endpoint hits SQLite on every request)
- `health/route.ts` — existing health check (service connectivity only, no latency)
- CatBot chat route uses tool-call loop with LiteLLM (no streaming)
- Chat panel sends `POST /api/projects/[id]/chat`, waits for full response

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features without which the milestone deliverables feel broken or incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Playwright test runner execution from UI | If there is a /testing page, users assume they can trigger test runs from it — not just view old results | MEDIUM | Executes `npx playwright test` as child process from API route; streams stdout via polling or ReadableStream |
| Live test result display (pass/fail per test) | Any test dashboard without granular results is useless. "8 passed, 2 failed" alone is insufficient | MEDIUM | Parse Playwright JSON reporter output (`playwright-report/results.json`); render per-test name + status + duration |
| Test run history list | Users need to compare runs over time — "did it break between sessions?" | LOW | Store run metadata in SQLite (timestamp, total, passed, failed) or parse filesystem reports |
| Error details per failed test | Seeing that a test failed without the error message is a dead end | LOW | Playwright JSON includes `error.message` and `error.stack` per test; surface both in expandable row |
| LLM response streaming in Chat panel | Current behavior: user waits silently until the full response arrives. Any modern AI chat streams tokens progressively | HIGH | Requires new streaming API endpoint, ReadableStream in route handler, `EventSource` or fetch with `getReader()` on client |
| LLM response streaming in CatBot panel | CatBot already has a floating panel with message input — same UX expectation as Chat | HIGH | CatBot uses tool-calling loop (more complex to stream — must stream final text after tool resolution) |
| Retry on transient external service failures | `fetch()` to LiteLLM, Qdrant, Ollama, OpenClaw, and n8n will fail occasionally. Silent crashes are worse than retries | MEDIUM | `withRetry(fn, attempts, backoff)` utility; wrap all service calls; existing connector calls already need this |
| React Error Boundary per section (not global) | Currently one global boundary in `error-boundary.tsx` that is not deployed per section. A crash in Canvas should not kill the sidebar | LOW | Deploy existing `ErrorBoundary` component at section level in each page; add reset button |
| Structured log viewer in /testing | If logs write to `/app/data/logs/`, users expect to be able to read them from the UI without SSH access | MEDIUM | API endpoint to read last N lines from current log file; paginate; filter by level |

---

### Differentiators (Competitive Advantage)

Features that go beyond table stakes for this category. Not expected in a basic implementation, but create real value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI-powered test generation script | Reads source files of a page/component, generates Playwright spec with Page Object Model via LLM — drastically reduces authoring time | HIGH | Script (not UI): takes a file path or section name, calls `llm.ts` chatCompletion with file content as context, writes `.spec.ts` output. Needs careful prompting for stable selectors (`getByRole`, `getByLabel`) |
| LLM streaming in Processing panel (token-by-token preview) | Current UX: press "Process", wait 30–90s with a spinner. Streaming shows the document being written in real time — far more engaging | HIGH | Processing pipeline calls `llm.ts` sequentially per source chunk; would need streaming variant (`chatCompletionStream`) that yields tokens as they arrive |
| Error Boundary reports to CatBot | When a section crashes, the boundary reports the error context to CatBot so it can proactively suggest a fix or explain what happened | MEDIUM | On `componentDidCatch`, call a CatBot-visible store or localStorage key; CatBot panel reads it and surfaces proactive message |
| Per-service latency in health checks | Current health page shows UP/DOWN. Adding p50 latency (via timed ping) reveals degraded services before they become outages | LOW | Wrap each service ping in `Date.now()` before/after; return `latency_ms` field per service in health response |
| Log level filtering in UI | Being able to show only ERROR logs during an incident is far more useful than raw log dump | LOW | Client-side filter on fetched log lines (no backend change needed); filter by `[ERROR]`, `[WARN]`, `[INFO]` prefix in JSON log line |
| Coverage report integration | If Playwright is run with `--coverage`, the coverage JSON can be parsed and surfaced in `/testing` as a file tree with line percentages | HIGH | Playwright does not produce Istanbul-style line coverage for E2E by default — this requires `@playwright/experimental-ct-react` or a separate vitest setup. HIGH complexity for LOW return in this context. Flag as optional. |
| Test run filtering by section/tag | When the test suite grows to 20+ specs, users need to filter by section (Projects, Canvas, Tasks, etc.) | LOW | Playwright tags (`@projects`, `@canvas`) in spec files; pass `--grep` flag when running from UI |
| In-memory TTL cache hit/miss telemetry | Exposes cache effectiveness — valuable when tuning TTL values | LOW | Add `hits` and `misses` counter to cache Map entries; expose via debug endpoint |
| AI test generation from /testing page | Instead of running the script from terminal, a UI form where user selects a section and clicks "Generar tests" | MEDIUM | Wraps the AI generation script in an API route; shows generated spec in a preview panel before writing to disk |

---

### Anti-Features (Commonly Requested, Often Problematic)

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| WebSocket for test progress / log tailing | Real-time feel during test runs | Next.js App Router Route Handlers do not support persistent WebSocket connections without a custom server. PROJECT.md explicitly excludes WebSocket. Implementation complexity is high with no protocol benefit over SSE | Use SSE (text/event-stream) via ReadableStream for streaming progress. For static results, polling every 2s is sufficient and consistent with existing patterns |
| Istanbul/NYC code coverage for E2E tests | "Coverage" sounds like the right metric | Playwright E2E coverage requires instrumented builds — the app must be compiled differently. Adds complexity to Docker build and CI. Line coverage from E2E tests misleads (it measures what the browser exercises, not correctness) | Playwright's built-in JSON reporter gives pass/fail/duration per test. That is the actionable metric for this phase |
| External test persistence (database per run) | Storing test results in a dedicated table | PROJECT.md explicitly says "Test persistence in external DB — Playwright JSON reports parsed from filesystem." Filesystem reports are sufficient for the single-user case | Parse `playwright-report/results.json` from filesystem on demand; store only summary rows (timestamp, totals) in SQLite |
| Parallel test execution | Faster test suite | Playwright runs tests in parallel by default when multiple workers are configured. For a self-hosted single-machine setup, parallel test workers compete with the running app for resources (CPU/GPU), causing flakiness | Use `workers: 1` in playwright.config.ts to serialize test execution against the Docker app |
| Redis or external cache | "Production-grade" caching | This is a single-user self-hosted tool on one machine. Redis adds a container, networking overhead, and operational burden for zero user benefit over an in-process Map | In-memory Map with TTL; resets on server restart, which is acceptable for this use case |
| Test scheduling (cron) | Auto-run tests nightly | PROJECT.md excludes scheduling for task execution. Same rationale applies here: manual execution is fine for single-user internal tool | Button in /testing UI to trigger a run on demand |
| pino or winston as logging library | "Professional logging" | Adds a dependency and configuration layer. For a self-hosted Docker app writing to `/app/data/logs/`, a custom JSON logger using `fs.appendFileSync` with date-stamped files is simpler, has zero dependencies, and covers all requirements | Custom `logger.ts` with `log(level, message, meta)` → appends JSON lines to daily file; `cleanOldLogs()` deletes files older than 7 days |
| Sentry or external error monitoring | Crash reporting to an external service | This is a self-hosted internal tool with no external accounts in scope. Sending crash data to Sentry violates the self-hosted philosophy | Error Boundaries log to the structured file logger; CatBot surfaces errors proactively from local state |

---

## Feature Dependencies

Dependencies between this milestone's features and existing app sections.

```
[withRetry utility]
    └──required by──> [LiteLLM calls in llm.ts]
    └──required by──> [Qdrant calls in qdrant.ts]
    └──required by──> [Ollama calls in ollama.ts]
    └──required by──> [Connector fetch() calls]
    └──required by──> [OpenClaw calls in agents API]

[Structured logger (logger.ts)]
    └──required by──> [Log viewer in /testing page]
    └──enhances──>    [Error Boundaries (log caught errors)]
    └──enhances──>    [withRetry (log retry attempts)]
    └──enhances──>    [Health check (log latency results)]

[Playwright test suite (specs)]
    └──required by──> [AI test generation (needs specs to generate into)]
    └──required by──> [/testing page run trigger (no specs = nothing to run)]
    └──required by──> [Test result parser (needs JSON report from at least one run)]

[/testing page (route + UI)]
    └──requires──> [Playwright installed as devDependency]
    └──requires──> [API: POST /api/testing/run (triggers npx playwright test)]
    └──requires──> [API: GET /api/testing/results (reads playwright-report/results.json)]
    └──requires──> [API: GET /api/testing/logs (reads /app/data/logs/*.log)]
    └──requires──> [Test run history (SQLite table or filesystem scan)]

[LLM Streaming in Chat panel]
    └──requires──> [chatCompletionStream() in llm.ts (new function)]
    └──requires──> [New streaming API route: POST /api/projects/[id]/chat/stream]
    └──requires──> [Client-side ReadableStream reader in chat-panel.tsx]

[LLM Streaming in CatBot]
    └──requires──> [chatCompletionStream() in llm.ts]
    └──requires──> [Tool-call resolution must complete before streaming final text]
    └──requires──> [New streaming route: POST /api/catbot/chat/stream]
    └──requires──> [Client-side reader in catbot-panel.tsx]

[LLM Streaming in Processing panel]
    └──requires──> [chatCompletionStream() in llm.ts]
    └──requires──> [process-panel.tsx to handle streamed markdown]
    └──complex──>  [Multi-source processing: each source processed sequentially, streaming per-chunk]

[Error Boundaries per section]
    └──uses──>     [ErrorBoundary class (already exists in error-boundary.tsx)]
    └──enhances──> [CatBot (reports errors to local state for proactive messaging)]
    └──requires──> [Section-level wrapper in each page.tsx]

[Enhanced health checks]
    └──enhances──> [Existing /api/health route]
    └──feeds──>    [/testing page (health status panel)]

[In-memory TTL cache]
    └──wraps──>    [/api/agents route (agents list — frequently polled)]
    └──wraps──>    [/api/dashboard route (metrics — heavy SQL queries)]
    └──wraps──>    [/api/settings/* (API keys, models — rarely change)]
    └──wraps──>    [/api/health route (service checks — 5s TTL)]
    └──independent of all other milestone features]

[AI test generation script]
    └──requires──> [chatCompletion() from llm.ts (synchronous is fine here)]
    └──requires──> [Source files to read (app/src/app/* and app/src/components/*)]
    └──requires──> [Playwright installed]
    └──outputs──>  [.spec.ts files in tests/e2e/]
    └──optional──> [/testing page UI trigger]
```

### Dependency Notes

- **withRetry before everything else:** Every external service call in the app is currently bare `fetch()`. The utility should be built first (standalone, no dependencies) and then applied systematically.
- **logger.ts before Error Boundaries:** Error Boundaries need something to write to beyond `console.error`. Build the logger first.
- **chatCompletionStream() before any streaming UI:** All three streaming surfaces (Chat, CatBot, Processing) share the same new function in `llm.ts`. Build once, use three times.
- **Playwright specs before /testing page:** The test runner page is useless without at least a minimal test suite to execute.
- **In-memory cache is fully independent:** Can be added to any hot endpoint at any phase without coordination.

---

## MVP Definition

### Phase 1 — Foundations (no dependencies between items)
- [ ] `withRetry(fn, attempts, backoffMs)` utility — standalone, tested manually
- [ ] `logger.ts` — JSON line logger, daily rotation, 7-day cleanup, writes to `/app/data/logs/`
- [ ] `CacheStore` class — in-memory Map with TTL, `get/set/delete/clear` methods
- [ ] Enhanced health check — add `latency_ms` per service, `uptime` from process start
- [ ] Error Boundaries deployed per section — wrap each page's main content with existing `ErrorBoundary`

### Phase 2 — Playwright Foundation
- [ ] Install `@playwright/test` as devDependency, configure `playwright.config.ts` (baseURL: http://localhost:3500, workers: 1, JSON reporter)
- [ ] Page Object Models for all 8 sections
- [ ] 7 API test specs (agents, projects, sources, tasks, canvas, connectors, health)
- [ ] 15 E2E specs (one per section + critical flows)

### Phase 3 — Testing Dashboard (/testing page)
- [ ] Sidebar entry between Conectores and Configuracion
- [ ] API: `POST /api/testing/run` — spawn `npx playwright test`, return run ID
- [ ] API: `GET /api/testing/results` — parse `playwright-report/results.json`
- [ ] API: `GET /api/testing/logs` — read last 200 lines from today's log file
- [ ] UI: run button, progress indicator (polling), results table (test name / status / duration / error)
- [ ] UI: log viewer with level filter

### Phase 4 — LLM Streaming
- [ ] `chatCompletionStream()` in `llm.ts` — streaming variant using `ReadableStream`; handles openai/anthropic/litellm/ollama providers
- [ ] Streaming Chat panel (`/api/projects/[id]/chat/stream`)
- [ ] Streaming CatBot (tool resolution first, then stream final answer)
- [ ] Streaming Processing panel (stream per-source LLM chunk, aggregate progressively)

### Phase 5 — AI Test Generation
- [ ] `scripts/generate-tests.ts` — reads file path, calls `chatCompletion`, writes `.spec.ts`
- [ ] Prompt engineering: instructs LLM to use `getByRole`/`getByLabel`, POM structure, Spanish test descriptions
- [ ] Optional: `/testing` page "Generar tests" form that wraps the script as an API call

### Future Consideration
- [ ] Coverage report integration — defer; requires build instrumentation changes
- [ ] Cache hit/miss telemetry endpoint — add when TTL values need tuning
- [ ] AI test generation from /testing UI — ship script first, UI wrapper later

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Depends On |
|---------|------------|---------------------|----------|------------|
| withRetry utility | HIGH (prevents silent crashes) | LOW | P1 | Nothing |
| Error Boundaries per section | HIGH (prevents full-page crashes) | LOW (component exists) | P1 | Nothing |
| logger.ts structured logging | HIGH (debugging, audit) | LOW | P1 | Nothing |
| In-memory TTL cache | MEDIUM (perf) | LOW | P1 | Nothing |
| Enhanced health checks | MEDIUM (observability) | LOW | P1 | Nothing |
| Playwright test suite (specs) | HIGH (quality gate) | HIGH | P1 | Playwright installed |
| /testing page (run + results) | HIGH (test visibility) | MEDIUM | P2 | Playwright + specs + logger |
| LLM streaming in Chat | HIGH (UX — perceived speed) | HIGH | P2 | chatCompletionStream() |
| LLM streaming in CatBot | HIGH (UX) | HIGH | P2 | chatCompletionStream() |
| AI test generation script | HIGH (dev velocity) | MEDIUM | P2 | Playwright + llm.ts |
| LLM streaming in Processing | MEDIUM (long wait UX) | HIGH | P3 | chatCompletionStream() + process-panel refactor |
| AI test gen from /testing UI | LOW | MEDIUM | P3 | Script exists first |
| Coverage report integration | LOW (misleading metric for E2E) | HIGH | P3 | Separate vitest setup |

**Priority key:**
- P1: Must have for milestone to deliver value
- P2: Core milestone deliverables
- P3: Nice to have, add if time allows

---

## Interaction Patterns (Expected User Behaviors)

| User Action | Expected Behavior | Common Failure Mode |
|-------------|-------------------|---------------------|
| Opens /testing page | Sees last run results immediately (or empty state if no run yet), plus a "Ejecutar Tests" button | Blank page with no state — user does not know if tests exist |
| Clicks "Ejecutar Tests" | Button disables, progress indicator appears (spinner or progress bar), results update as they arrive | Button stays enabled → duplicate runs; or page refreshes and loses progress |
| Clicks a failed test row | Expands to show error message and stack trace | Row is not expandable; user must open terminal to see why it failed |
| Sends chat message in RAG chat | First token appears within 1–2s, rest streams progressively | 30s spinner, then full response appears at once |
| CatBot tool call in progress | CatBot shows "Pensando..." while resolving tools, then streams the text answer | Spinner disappears then full answer jumps in — better than before but not ideal |
| Section crashes (e.g., Canvas) | Red bordered panel with error message + reset button; rest of app works normally | Full white screen, sidebar inaccessible, user must reload |
| Looks at /system health page | Each service shows green/red badge AND latency in ms | Only UP/DOWN — user cannot tell if Qdrant is slow |
| Requests AI test generation for "Projects" | Script reads relevant source files, produces a `.spec.ts` with POM class and 3–5 test cases | Generated spec uses fragile CSS selectors or hardcoded text that breaks on next UI change |

---

## Sources

- Playwright official docs — [playwright.dev](https://playwright.dev/docs/intro) (HIGH confidence)
- Next.js testing guide — [nextjs.org/docs/app/guides/testing/playwright](https://nextjs.org/docs/app/guides/testing/playwright) (HIGH confidence)
- BrowserStack Playwright best practices 2026 — [browserstack.com/guide/playwright-best-practices](https://www.browserstack.com/guide/playwright-best-practices) (MEDIUM confidence)
- Next.js error handling (App Router) — [nextjs.org/docs/app/getting-started/error-handling](https://nextjs.org/docs/app/getting-started/error-handling) (HIGH confidence)
- SSE + ReadableStream for LLM streaming — [upstash.com/blog/sse-streaming-llm-responses](https://upstash.com/blog/sse-streaming-llm-responses) (MEDIUM confidence)
- LLM streaming patterns — [dev.to/programmingcentral/stop-making-users-wait](https://dev.to/programmingcentral/stop-making-users-wait-the-ultimate-guide-to-streaming-ai-responses-22m3) (MEDIUM confidence)
- Node.js in-memory TTL cache patterns — [oneuptime.com/blog/post/2026-01-30-nodejs-memory-cache-ttl](https://oneuptime.com/blog/post/2026-01-30-nodejs-memory-cache-ttl/view) (MEDIUM confidence)
- AI test generation with Playwright + LLM — [checklyhq.com/blog/generate-end-to-end-tests-with-ai-and-playwright](https://www.checklyhq.com/blog/generate-end-to-end-tests-with-ai-and-playwright/) (MEDIUM confidence)
- BrowserStack AI + Playwright article — [browserstack.com/guide/modern-test-automation-with-ai-and-playwright](https://www.browserstack.com/guide/modern-test-automation-with-ai-and-playwright) (MEDIUM confidence)
- PROJECT.md constraints (out-of-scope decisions) — LOCAL, authoritative for this project
- Existing codebase analysis: `llm.ts`, `error-boundary.tsx`, `catbot/chat/route.ts`, `health/route.ts` — LOCAL, HIGH confidence

---
*Feature research for: DoCatFlow v6.0 — Testing Inteligente + Performance + Estabilizacion*
*Researched: 2026-03-12*
