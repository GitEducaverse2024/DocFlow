# Domain Pitfalls: Testing Infrastructure, LLM Streaming, Caching, Retry, and Logging

**Domain:** Adding Playwright E2E testing, LLM streaming, in-memory cache, retry logic, and structured logging to an existing Next.js 14 + Docker application
**Project:** DoCatFlow v6.0 — Testing Inteligente + Performance + Estabilizacion
**Researched:** 2026-03-12
**Confidence:** HIGH (verified against official Playwright docs, Next.js GitHub discussions, Docker docs, multiple corroborating sources)

---

## Critical Pitfalls

Mistakes that require significant rework or cause build/runtime failures.

---

### Pitfall 1: Installing Playwright in the App Docker Image Instead of Running It From the Host

**What goes wrong:** Adding `@playwright/test` as a dependency and running `npx playwright install chromium` inside the `node:20-slim` Docker image (the same container that runs the Next.js app) will fail or produce an extremely large image. Chromium on Debian slim requires 25+ system libraries (libglib2.0, libnss3, libatk1.0, libcups2, libdrm2, libxkbcommon, libasound2, and many others) that are absent from `node:20-slim`. The install command either aborts or produces a broken binary.

**Why it happens:** `node:20-slim` is a minimal Debian image stripped of most system libraries to keep the image small. Playwright's Chromium distribution is not the same as the system Chromium package and requires its own set of shared libraries explicitly installed. The `--with-deps` flag only works correctly when apt-get is available and the user has root during install.

**Consequences:** Docker build fails, or the image balloons by 500MB–1GB. Worse, if the image somehow builds, tests silently crash at runtime because the browser cannot launch.

**Prevention:** Keep Playwright as a host-side devDependency only. Tests run from the host (Node 22, `server-ia`) against `http://localhost:3500` (the Docker app). The `playwright.config.ts` sets `baseURL: 'http://localhost:3500'`. Playwright and Chromium are installed on the host, not inside Docker. Add to `app/.dockerignore`:
```
node_modules
.next
.git
# Playwright outputs that must not enter the image
playwright-report
test-results
tests/e2e
```
Install on host only: `npm install -D @playwright/test && npx playwright install chromium`

**Warning signs:** Any step in `app/Dockerfile` that runs `npx playwright install`, or `@playwright/test` appearing in `dependencies` instead of `devDependencies`.

**Phase to address:** Playwright setup phase (the first phase). Must be established before writing any test.

---

### Pitfall 2: Test State Pollution — SQLite Is Shared Between App and Tests

**What goes wrong:** Tests run against `http://localhost:3500` which uses the real live SQLite database at `/home/deskmath/docflow-data/docflow.db`. Every test that creates a project, agent, task, or canvas writes real rows. Tests that delete data can destroy real user data. Tests that run in parallel produce race conditions on SQLite's single-writer model.

**Why it happens:** There is no test database. The app runs against one SQLite file. Playwright makes HTTP requests to the API. The API writes to the real DB.

**Consequences:** (1) Test A creates a project with a predictable name; test B finds multiple matching projects and fails. (2) A cleanup step accidentally deletes a project the user was working on. (3) Parallel Playwright workers cause SQLite "database is locked" errors.

**Prevention:**
- Use a prefix convention for all test-created data: `[TEST]` prefix in names (e.g., `[TEST] Proyecto Playwright`). Add a `globalSetup` script that deletes all rows where `name LIKE '[TEST]%'` before the test suite runs.
- Run Playwright with `--workers=1` (serial execution) to avoid concurrent writes. Add `workers: 1` to `playwright.config.ts`.
- Never test deletion of items that don't have the `[TEST]` prefix.
- Add a `globalTeardown` that also purges test rows after the suite.
- Write tests using `beforeEach`/`afterEach` API calls to create and destroy their own data.

**Warning signs:** Tests that hardcode IDs from the real database. Tests that check "there are exactly N projects" without knowing what's in the DB. Tests running with `workers > 1`.

**Phase to address:** Playwright setup phase — the `playwright.config.ts` and global setup/teardown must be written before the first test.

---

### Pitfall 3: LLM Streaming Route Handlers Missing `dynamic = 'force-dynamic'`

**What goes wrong:** A new API route (`/api/projects/[id]/process/stream`, `/api/chat/stream`, `/api/catbot/stream`) returns a `ReadableStream`. During `npm run build`, Next.js statically analyzes routes and attempts to prerender those that have no dynamic params or no dynamic markers. Even though the route is a POST endpoint, Next.js can cache the response. The route works in development but returns stale or empty responses in the Docker production build.

**Why it happens:** Next.js 14 App Router's default is to cache and prerender where possible. Without `export const dynamic = 'force-dynamic'`, a route handler that reads `process['env']['LITELLM_URL']` during static build receives the build-time value (or empty) and caches it.

**Consequences:** Streaming works in `npm run dev` but breaks in Docker. Debugging is extremely difficult because the dev/prod behavior differs fundamentally.

**Prevention:** Every streaming route handler must include:
```typescript
export const dynamic = 'force-dynamic';
// For streaming routes also explicitly set:
export const runtime = 'nodejs'; // never 'edge' — better-sqlite3 requires Node.js runtime
```
This is already an established DocFlow pattern. Apply it without exception to all new streaming routes.

**Warning signs:** A new route file is missing `export const dynamic`. A streaming route that works in `npm run dev` but returns nothing or 404 in Docker.

**Phase to address:** LLM streaming phase. Verify in `npm run build` before Docker deployment.

---

### Pitfall 4: LLM Streaming Response Buffered by Next.js Before Client Receives It

**What goes wrong:** The client never sees streaming chunks — it waits for the full response, defeating the purpose of streaming. The route handler correctly builds a `ReadableStream`, but the stream is fully consumed server-side before the `Response` is returned. This happens when the developer `await`s the entire streaming loop before constructing the response.

**Why it happens:** A common mistake is:
```typescript
// WRONG: awaits the entire stream before returning
const chunks: string[] = [];
for await (const chunk of stream) {
  chunks.push(chunk);
}
return new Response(chunks.join(''), { headers: ... });
```
Or wrapping the stream in an async start() that is awaited. Next.js sees a fully resolved Response and delivers it as one block.

**Consequences:** Users see a spinner for the entire LLM generation time, then the full text appears at once. No visible streaming.

**Prevention:** Return the `ReadableStream` immediately inside the `Response` constructor. The `ReadableStream` start() function must NOT be awaited — it runs in the background while the Response is already streaming to the client:
```typescript
export async function POST(req: Request) {
  const body = await req.json();
  const stream = new ReadableStream({
    async start(controller) {
      const res = await fetch(`${litellmUrl}/v1/chat/completions`, {
        method: 'POST',
        body: JSON.stringify({ ...body, stream: true }),
        headers: { ... }
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.enqueue(value); // enqueue raw SSE bytes
      }
      controller.close();
    }
  });
  // Return immediately — stream flows to client
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    }
  });
}
```

**Warning signs:** Network tab shows a single response with total time equal to LLM generation time, no progressive loading. No `data:` prefix chunks visible in the response timeline.

**Phase to address:** LLM streaming phase. Must be verified with browser DevTools Network tab, not just console output.

---

### Pitfall 5: In-Memory Cache Map Silently Resets on Every Docker Restart

**What goes wrong:** A module-level `Map` used as a TTL cache appears to work in development but is invisible in production Docker. The cache never delivers a hit in practice because every Docker restart (deploy, crash recovery, `docker restart docflow-app`) destroys all in-memory state. The app returns uncached responses while the code path appears correct.

**Why it happens:** Docker containers are ephemeral processes. Module-level singletons in Next.js route handlers survive for the lifetime of the Node.js process, not across restarts. With `restart: unless-stopped`, the container restarts on crash. On every restart, the cache Map is re-initialized empty.

**Consequences:** Cache hits are 0% in practice for anything cached longer than a typical uptime. Dashboard, agents list, and settings endpoints hit SQLite on every request. If cache.has() is tested in a unit test but never in integration, this goes undetected.

**Warning signs:** Cache is effective in `npm run dev` (long-running dev server) but adds no measurable benefit when tested against the Docker app. Log output shows "cache miss" on every request for endpoints that should be warm after first load.

**Prevention:** This is expected and acceptable for DoCatFlow's single-user internal use case — document it explicitly. The cache serves to batch rapid sequential requests (e.g., page load that calls health, agents, and dashboard in parallel) not to survive restarts. Set TTLs to 30–60 seconds maximum. Never cache data that changes rarely (settings) for more than 5 minutes since restarts will always clear it anyway. Add a startup log: `console.log('[Cache] In-memory cache initialized — resets on process restart')`.

**Phase to address:** In-memory cache phase. Accept the limitation, document it, and design TTLs accordingly.

---

### Pitfall 6: Retry Logic Applied to Fire-and-Forget Executors Causes Double Execution

**What goes wrong:** `withRetry` is added to the LiteLLM call inside `task-executor.ts` or `canvas-executor.ts`. A transient network error causes the retry to fire. But the first call succeeded (LiteLLM returned a response after 2 seconds but the network layer timed out at 1 second). The LLM processes the same prompt twice, writing two outputs to the DB. For canvas execution, this means a node is processed twice and its output in `node_states` JSON is overwritten with the second (possibly different) result.

**Why it happens:** Network timeouts are ambiguous — a timeout does not mean the server did not receive and process the request. When the existing `canvas-executor.ts` calls LiteLLM with `fetch()` and the response takes longer than the AbortController timeout, the request is retried. But the LiteLLM server may have already started (or completed) generating the response.

**Consequences:** Tasks and canvas nodes have inconsistent output. Usage logs show double token counts. LLM costs are doubled for slow queries. More critically: for merge/checkpoint nodes, double execution can corrupt the task output chain.

**Prevention:** Apply `withRetry` ONLY to idempotent, read-only operations: health checks, embedding requests (same input = same vector), Qdrant searches. Do NOT apply `withRetry` to any LLM generation call (chatCompletion, streaming). For LLM calls, use longer timeouts (120s minimum) and fail fast rather than retry. Implement retry at the UI layer instead: expose a "Reintentar" button that re-runs a failed step from the UI.

**Warning signs:** Task steps appear twice in the output. Usage logs show the same step recorded twice with identical timestamps. A canvas node shows `completed` but with output from a different run.

**Phase to address:** Retry logic implementation phase. The `withRetry` utility must explicitly document which call sites are safe vs. unsafe.

---

### Pitfall 7: React Error Boundaries Applied to Server Components

**What goes wrong:** A developer wraps a Server Component with a custom `ErrorBoundary` class component. The `ErrorBoundary` is declared `"use client"` (required by React for class components with `componentDidCatch`). But the Server Component children throw during server-side rendering — the error boundary's `componentDidCatch` never fires because the error occurs server-side, not in the client render tree.

**Why it happens:** React error boundaries are a client-side React mechanism. They catch errors during React's client-side render phase. Server Component errors occur during the server render before any client-side code runs. The two error domains are separate.

**Consequences:** The error boundary's fallback UI does not appear. Instead, Next.js shows its default error page (or a blank screen in production). The "report to CatBot" integration in the fallback never fires.

**Prevention:** In Next.js 14 App Router, use `error.tsx` files (Next.js's built-in error boundary mechanism) for per-route error handling — these are the only way to catch both server and client errors within a route segment. Add a custom `error.tsx` alongside each page that should have error recovery:
```
app/projects/[id]/error.tsx   — catches project page errors
app/tasks/[id]/error.tsx      — catches task page errors
app/canvas/[id]/error.tsx     — catches canvas page errors
```
Custom React `ErrorBoundary` class components are valid ONLY for purely client-side subtrees (e.g., the CatBot panel, the chat panel) that are already `"use client"`. Also: `error.tsx` cannot catch errors in `layout.tsx` of the same segment — only in `page.tsx` children.

**Warning signs:** Error boundary's `fallback` prop is never rendered even when the wrapped component throws. No `componentDidCatch` calls visible in DevTools.

**Phase to address:** React Error Boundaries phase.

---

### Pitfall 8: Playwright AI Test Generator Hallucinates Spanish UI Selectors

**What goes wrong:** The AI test generation script reads DoCatFlow source code and asks an LLM to produce Playwright tests. The LLM generates tests using English text selectors (`getByText('New Project')`, `getByLabel('Name')`) because most of its training data is in English. DoCatFlow's UI is entirely in Spanish (`'Nuevo proyecto'`, `'Nombre'`). Every generated test fails immediately because no matching element is found.

**Why it happens:** LLMs default to the language of their training data when generating UI automation code. Without explicit instruction and code context showing Spanish strings, the LLM produces English selectors.

**Consequences:** 100% of AI-generated tests fail on first run. Engineers spend time fixing obvious hallucinations rather than reviewing real logic.

**Prevention:**
1. The generation prompt MUST include: "Toda la interfaz está en español. Los selectores de texto deben usar strings en español exactamente como aparecen en el código."
2. Include the actual source file content for the page being tested (the React component) so the LLM can see real strings.
3. Instruct the LLM to prefer `data-testid` attributes over text. Add `data-testid` attributes to all key interactive elements as part of the testing phase.
4. After generation, run a quick dry-run (`--dry-run` flag or `page.locator(...).count()` check) before calling a test "generated."
5. Never merge AI-generated tests without at least one successful local run against the live app.

**Warning signs:** Generated test file contains `getByText('New')`, `getByText('Create')`, `getByText('Delete')`, `getByLabel('Title')` — English words in a Spanish app.

**Phase to address:** AI test generation phase. The generation prompt template is more important than the generation logic.

---

## Moderate Pitfalls

Issues that cause incorrect behavior or degraded UX but can be fixed without rework.

---

### Pitfall 9: SSE Stream Not Properly Closed on Client Navigation

**What goes wrong:** A user starts a streaming LLM response in the Chat or CatBot panel, then navigates away. The client-side `useEffect` that initiated the fetch stream does not abort the controller on cleanup. The server-side `ReadableStream` continues reading from LiteLLM and enqueueing chunks into a closed stream. This triggers `WritableStreamDefaultWriter: write after close` errors in the server logs.

**Why it happens:** `ReadableStream` on the server side has no automatic awareness of client disconnection unless the route handler checks `req.signal.aborted`.

**Prevention:** Thread the request's `AbortSignal` into the upstream LiteLLM fetch call:
```typescript
export async function POST(req: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      const upstream = await fetch(litellmUrl, {
        signal: req.signal, // abort if client disconnects
        body: ...,
      });
      // ...
    }
  });
  return new Response(stream, { headers: ... });
}
```
On the client, abort the fetch when the component unmounts:
```typescript
useEffect(() => {
  const controller = new AbortController();
  startStreaming(controller.signal);
  return () => controller.abort();
}, []);
```

**Warning signs:** Server logs show `WritableStreamDefaultWriter: write after close` or `AbortError` on every page navigation during an active stream.

**Phase to address:** LLM streaming phase.

---

### Pitfall 10: Log Files Written to Container Filesystem Instead of Mounted Volume

**What goes wrong:** The logging service writes structured JSON logs to `/app/logs/` inside the container filesystem. Docker containers have an ephemeral writable layer. On `docker restart docflow-app`, all log files in `/app/logs/` are lost. Log history is wiped on every deploy.

**Why it happens:** Only paths explicitly declared as Docker volumes persist across restarts. The app's data volume (`/home/deskmath/docflow-data:/app/data`) is mounted, but if logs are written to a different path (e.g., `/app/logs/`), they live in the ephemeral container layer.

**Prevention:** Write logs to `/app/data/logs/` (which maps to `/home/deskmath/docflow-data/logs/` on the host via the existing volume mount). The PROJECT.md constraint already specifies: "Logs: rotate after 7 days, write to /app/data/logs/". Never write logs to any path outside `/app/data/`.

Log file structure:
```
/app/data/logs/
  app-2026-03-12.log   (current day)
  app-2026-03-11.log   (yesterday — kept for 7 days)
```

**Warning signs:** Log files appear in `docker exec docflow-app ls /app/logs/` but NOT in `ls /home/deskmath/docflow-data/logs/` on the host. Logs disappear after `docker restart`.

**Phase to address:** Structured logging phase. Must be the first thing verified after the logger is wired up.

---

### Pitfall 11: Playwright `waitForTimeout()` Used Instead of Element Assertions

**What goes wrong:** Tests use `page.waitForTimeout(2000)` to wait for the app to respond (API call finishes, navigation completes, polling updates the UI). Tests pass locally when the server is fast, then fail in CI or on load because 2 seconds was not enough.

**Why it happens:** `waitForTimeout` is the "easiest" way to handle async UI updates for developers new to Playwright. It looks like it works during development when the machine is fast.

**Consequences:** Flaky tests that fail intermittently. Tests that slow down the suite linearly (22 tests × 2 seconds each = 44 seconds of pure waiting).

**Prevention:** Replace all `waitForTimeout` calls with web-first assertions that Playwright auto-retries:
```typescript
// BAD
await page.waitForTimeout(2000);
await expect(page.getByText('Completado')).toBeVisible();

// GOOD — waits up to 30s, retries every 100ms
await expect(page.getByText('Completado')).toBeVisible({ timeout: 30000 });
```
For polling-based updates (task execution, canvas run), use `expect.poll()`:
```typescript
await expect.poll(
  async () => {
    const res = await page.request.get(`/api/tasks/${taskId}`);
    const data = await res.json();
    return data.status;
  },
  { timeout: 60000, intervals: [2000] }
).toBe('completed');
```

**Warning signs:** Any occurrence of `waitForTimeout` in a test file. Tests that pass 95% of the time but fail randomly.

**Phase to address:** Playwright setup phase. Enforce via ESLint rule `no-restricted-syntax` targeting `waitForTimeout` calls.

---

### Pitfall 12: In-Memory Cancel Flags Lost After Server Restart During Active Execution

**What goes wrong:** `task-executor.ts` and `canvas-executor.ts` store cancel flags in module-level Maps (`runningTasks`, `runningExecutors`). If the Docker container restarts while a task or canvas is running, the in-memory flag is gone. The DB shows `status = 'running'` but no executor is running. The "Cancelar" button calls the cancel API, which tries to set the in-memory flag (finds nothing) and updates the DB to `failed` — but there is no running process to actually cancel.

**Why it happens:** In-process state is ephemeral. This is an already-known limitation (Pitfall 12 from v5.0 research). Adding retry logic can interact badly: the retry wrapper starts a new execution attempt that finds the task in `running` state from the previous (now-dead) process and skips it.

**Prevention:** Add a startup recovery routine in the DB initialization or a route handler that runs once:
```typescript
// On app startup, fix orphaned running states
db.prepare("UPDATE tasks SET status = 'failed' WHERE status = 'running'").run();
db.prepare("UPDATE canvas_runs SET status = 'failed' WHERE status = 'running'").run();
```
This converts "zombie" running states to failed, so users can see they need to retry. Do NOT attempt to auto-resume — this requires knowing where execution left off.

**Warning signs:** Tasks stuck in `running` state permanently. No active executor in `runningTasks` Map for that task ID.

**Phase to address:** Retry logic phase (the startup recovery should be added when retry/stability features are introduced).

---

### Pitfall 13: Log Rotation Implemented With `setInterval` in a Route Handler

**What goes wrong:** The log rotation logic (`delete logs older than 7 days`) is triggered via `setInterval` inside a Next.js route handler or in a module that is imported by a route handler. This creates a new interval timer on every cold start of the route module. In Next.js, route modules can be re-initialized frequently (especially in development). Multiple timers accumulate.

**Why it happens:** Next.js does not provide a lifecycle hook for "app startup" in route handlers. Developers put long-running logic in module initialization code that executes on first import.

**Consequences:** Multiple rotation intervals fire simultaneously. Log files are deleted by competing timers. In development, this can delete the current day's log.

**Prevention:** Implement log rotation as a one-time check triggered by the first write call to the logger each day, not by an interval:
```typescript
let lastRotationDate = '';
function maybeRotateLogs() {
  const today = new Date().toISOString().split('T')[0];
  if (today === lastRotationDate) return;
  lastRotationDate = today;
  // Delete log files older than 7 days
  deleteOldLogFiles('/app/data/logs/', 7);
}
```
Call `maybeRotateLogs()` at the top of every `log()` call. This is idempotent and safe for multiple callers.

**Warning signs:** Log directory has fewer files than expected. Rotation fires multiple times per minute in dev logs.

**Phase to address:** Structured logging phase.

---

### Pitfall 14: Testing Page `/testing` Runs Playwright as a Child Process With No Timeout

**What goes wrong:** The `/testing` page triggers `npx playwright test` via a Next.js API route using `child_process.spawn()`. If a test hangs (infinite wait, server not responding), the child process runs forever. The API route does not time out. The Docker container accumulates zombie Chromium processes. Memory grows until OOM kill.

**Why it happens:** `child_process.spawn()` returns immediately but the process runs indefinitely. There is no default timeout on child processes in Node.js.

**Consequences:** One hanging test causes the entire test suite to never complete. Multiple "Run Tests" button clicks spawn multiple Chromium instances. OOM eventually kills the Docker container.

**Prevention:**
- Set `--timeout` in the Playwright config (e.g., 60000ms per test, 300000ms per suite).
- Set a hard kill timeout on the child process:
```typescript
const proc = spawn('npx', ['playwright', 'test', '--reporter=json'], { cwd: '...' });
const killTimer = setTimeout(() => {
  proc.kill('SIGKILL');
}, 5 * 60 * 1000); // 5 minute hard limit
proc.on('close', () => clearTimeout(killTimer));
```
- Only allow one test run at a time (check if a previous process is still running before spawning a new one).

**Warning signs:** Multiple Chromium processes in `docker exec docflow-app ps aux`. API response for "run tests" never completes. Memory usage grows linearly.

**Phase to address:** `/testing` page implementation phase.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using `waitForTimeout` in tests | Fast to write, "works" locally | Flaky test suite, false confidence | Never in committed tests |
| Applying `withRetry` to all external calls | One utility covers everything | Double execution on LLM calls corrupts output | Only for idempotent read-only calls |
| Writing logs to container filesystem (not volume) | No Docker config needed | Log history lost on every restart | Never — violates project constraints |
| Skipping `data-testid` attributes on UI elements | No frontend changes needed | AI-generated tests use fragile text selectors | Only for very stable, single-occurrence text |
| Module-level `setInterval` for log rotation | Simple one-liner | Multiple timers on route re-init, deleted logs | Never |
| Caching LLM responses (not just metadata) | Faster repeated queries | Stale LLM output returned as "live" response | Never — LLM output is never idempotent |
| Running Playwright tests with `workers > 1` | Faster test suite | SQLite lock errors, race conditions on shared DB | Never with shared SQLite |

---

## Integration Gotchas

Common mistakes when connecting the new features to DoCatFlow's existing architecture.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| LiteLLM streaming | Calling `res.json()` on a streaming response (blocks until full) | Check `Content-Type: text/event-stream` header; use `res.body.getReader()` for SSE chunks |
| Playwright + Spanish UI | Using English text in `getByText()` | Read actual component source for exact Spanish strings; add `data-testid` attributes |
| Logger + better-sqlite3 | Writing DB queries inside the logger (circular dependency: DB uses logger, logger uses DB) | Logger must be pure file I/O — no DB imports |
| Cache + `dynamic = 'force-dynamic'` | Caching in a route that is also statically prerendered | `force-dynamic` routes are fine; but cache TTL means stale data is served between invalidations |
| Retry + task-executor.ts | Adding retry around `callLLM()` in task-executor | LLM calls are non-idempotent; retry only the outer health-check fetch, never LLM generation |
| Error Boundaries + canvas page | Class-based ErrorBoundary wrapping a Server Component | Use `app/canvas/[id]/error.tsx` instead (Next.js file convention) |
| Playwright + live Docker app | Hardcoding `localhost:3000` in tests | Always use `baseURL: 'http://localhost:3500'` from `playwright.config.ts` |
| Log file + concurrent route handlers | Multiple route handlers write to same log file simultaneously | Use append-mode writes (`fs.appendFileSync`) which are atomic on Linux at line level |

---

## Performance Traps

Patterns that work at DoCatFlow's current scale but degrade with more data.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Cache not keyed by query params | Two requests for different agents return the same cached list | Include all variable params in the cache key: `cache.get(`agents-${filter}-${page}`)` | Any use of list filtering |
| Log file grows unbounded | `/app/data/logs/app-YYYY-MM-DD.log` reaches hundreds of MB for heavy LLM use | Log only ERROR and WARN by default; DEBUG only in development | After 1 week of LLM processing |
| Playwright JSON report parsed by string manipulation | Test results page breaks if Playwright changes JSON format | Parse using the report's documented schema; pin Playwright version | On any Playwright upgrade |
| All Playwright tests in one spec file | Suite takes 10+ minutes to run | Organize by page/feature into separate spec files; use `--grep` to run subsets | Beyond 30 tests in one file |
| Cache invalidation missing after write | Cached agent list returned after creating a new agent | Always delete relevant cache keys in POST/PUT/DELETE handlers | First time a user creates a resource and sees the old list |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Playwright setup:** `data-testid` attributes added to key elements — verify at least 10 interactive elements have `data-testid` before writing AI-generated tests.
- [ ] **Playwright setup:** `globalSetup` and `globalTeardown` scripts exist and delete `[TEST]` prefixed rows — verify with `SELECT COUNT(*) FROM projects WHERE name LIKE '[TEST]%'` before and after.
- [ ] **LLM streaming:** Verified in browser DevTools Network tab that chunks arrive progressively — a "complete in 200ms" response means it's buffered, not streaming.
- [ ] **LLM streaming:** Client-side `AbortController` cleanup in `useEffect` return — verify by navigating away mid-stream and checking server logs for clean abort.
- [ ] **In-memory cache:** TTL expiry actually removes the entry — not just checked on read but also on write (expired entries accumulate memory if never read again).
- [ ] **Retry logic:** `withRetry` call sites are listed and reviewed for idempotency — any LLM call site with `withRetry` is a bug.
- [ ] **Structured logging:** Logs appear in `/home/deskmath/docflow-data/logs/` on the HOST, not just inside the container — verify after `docker restart docflow-app`.
- [ ] **Error boundaries:** Each `error.tsx` file has a working "Reintentar" button and reports to CatBot — not just a static error message.
- [ ] **Testing page `/testing`:** "Run Tests" button is disabled while a test run is in progress — prevents accumulation of Chromium processes.
- [ ] **AI test generation:** At least 3 generated tests run successfully against the live app before the generator script is considered complete.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Playwright installed in Docker image | MEDIUM | Remove from Dockerfile, rebuild image, install on host only |
| Test data polluted real DB | MEDIUM | Write a cleanup SQL: `DELETE FROM projects WHERE name LIKE '[TEST]%'` and run against live DB |
| Streaming buffered (not streaming) | LOW | Add `export const dynamic = 'force-dynamic'`; verify stream construction returns before awaiting |
| Double execution from retry on LLM call | HIGH | Identify affected task/canvas run IDs from usage_logs (duplicate timestamps); manually delete incorrect rows; remove `withRetry` from LLM calls |
| Logs lost after restart | LOW | Check if volume mount is correct in docker-compose.yml; move log path to `/app/data/logs/` |
| AI-generated tests with English selectors | LOW | Add Spanish constraint to generation prompt; re-generate; add `data-testid` attributes |
| Error boundary not catching server errors | LOW | Replace custom ErrorBoundary with `error.tsx` file convention for server-rendered routes |
| Zombie running tasks after restart | LOW | Run startup DB cleanup: `UPDATE tasks SET status = 'failed' WHERE status = 'running'` |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Playwright in Docker image | Phase 1: Playwright setup | `docker images` shows no size increase; `docker exec docflow-app which chromium` returns nothing |
| SQLite test isolation | Phase 1: Playwright setup | `globalSetup.ts` exists; `playwright.config.ts` has `workers: 1` |
| Missing `force-dynamic` on streaming routes | Phase: LLM streaming | `npm run build` completes without static prerender warnings on streaming routes |
| Buffered streaming response | Phase: LLM streaming | DevTools Network tab shows progressive chunks for `/api/*/stream` endpoints |
| In-memory cache reset on restart | Phase: Cache implementation | Documented in code comments; TTLs ≤ 60s; logged on startup |
| Retry on LLM calls (double execution) | Phase: Retry logic | Code review checklist: `withRetry` call sites list; LLM calls are excluded |
| Error boundary on server components | Phase: Error Boundaries | `error.tsx` files exist alongside each page.tsx; no class-based ErrorBoundary wrapping RSC |
| AI tests with English selectors | Phase: AI test generation | Generation prompt template includes Spanish instruction; dry-run before commit |
| SSE stream not closed on navigation | Phase: LLM streaming | Server logs show no `WritableStreamDefaultWriter` errors after navigation |
| Logs not on volume | Phase: Structured logging | `ls /home/deskmath/docflow-data/logs/` shows log files after Docker restart |
| `waitForTimeout` in tests | Phase: All Playwright phases | ESLint rule in `eslint.config.js` flags `waitForTimeout`; code review |
| Cancel flags lost on restart | Phase: Retry/stability | Startup DB cleanup migration runs; no permanently-running tasks |
| Log rotation via setInterval | Phase: Structured logging | Logger uses date-based rotation check, not timer |
| Playwright child process hangs | Phase: Testing page | Hard kill timeout in spawn wrapper; "Run Tests" button disabled while running |

---

## Sources

- [Playwright Docker Official Docs](https://playwright.dev/docs/docker) — HIGH confidence (official)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices) — HIGH confidence (official)
- [GitHub Issue: Host system missing dependencies](https://github.com/microsoft/playwright/issues/17975) — HIGH confidence (official issue tracker)
- [Next.js Discussion: ReadableStream in API routes](https://github.com/vercel/next.js/discussions/50614) — HIGH confidence (official discussion)
- [Next.js Discussion: SSE and App Router](https://github.com/vercel/next.js/discussions/48427) — HIGH confidence (official discussion)
- [Next.js Discussion: ResponseAborted with SSE](https://github.com/vercel/next.js/discussions/61972) — HIGH confidence (official discussion)
- [Next.js Issue: Inconsistent Singleton in App Router 14.2.3](https://github.com/vercel/next.js/issues/65350) — HIGH confidence (official issue)
- [Next.js Error Handling Docs](https://nextjs.org/docs/app/getting-started/error-handling) — HIGH confidence (official)
- [Next.js error.js Convention](https://nextjs.org/docs/app/api-reference/file-conventions/error) — HIGH confidence (official)
- [GitHub Issue: Non-NextJS Error Boundary doesn't catch RSC errors](https://github.com/vercel/next.js/issues/58754) — HIGH confidence (official issue)
- [better-sqlite3 Performance and WAL mode](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md) — HIGH confidence (official)
- [Playwright Database Rollback Strategies](https://www.thegreenreport.blog/articles/database-rollback-strategies-in-playwright/database-rollback-strategies-in-playwright.html) — MEDIUM confidence
- [Docker JSON File Logging Driver](https://docs.docker.com/engine/logging/drivers/json-file/) — HIGH confidence (official)
- [AI Test Generation with Playwright MCP](https://www.checklyhq.com/blog/generate-end-to-end-tests-with-ai-and-playwright/) — MEDIUM confidence
- [Playwright Flaky Test Prevention](https://semaphore.io/blog/flaky-tests-playwright) — MEDIUM confidence
- [SSE Streaming in Next.js — Fixing Slow SSE](https://medium.com/@oyetoketoby80/fixing-slow-sse-server-sent-events-streaming-in-next-js-and-vercel-99f42fbdb996) — MEDIUM confidence

---

*Pitfalls research for: v6.0 Testing Inteligente + Performance + Estabilizacion*
*Researched: 2026-03-12*
