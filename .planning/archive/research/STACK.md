# Stack Research — v6.0 Testing + Performance + Estabilización

**Project:** DoCatFlow — v6.0 milestone additions only
**Researched:** 2026-03-12
**Scope:** NEW libraries and patterns only. Existing validated stack (Next.js 14, React 18, Tailwind, shadcn/ui, better-sqlite3, Qdrant, LiteLLM, @xyflow/react, @dnd-kit, recharts) is unchanged.
**Confidence:** HIGH

---

## Summary

Six capability areas require stack additions. Only ONE of them (Playwright) needs a new npm package as a devDependency. The remaining five (streaming, TTL cache, retry, error boundaries, structured logging) are either: (a) built on Web/Node APIs already available in the runtime, or (b) require winston as the one production dependency. This keeps the surface area minimal.

---

## New Dependencies Required

### 1. E2E + API Testing

| Package | Version | Install As | Why |
|---------|---------|------------|-----|
| `@playwright/test` | `^1.58.2` | devDependency | Industry-standard E2E framework. Includes built-in API testing via `request` fixture (no extra library), JSON reporter for results parsing, Page Object Model via class extension, and chromium-only configuration. Self-contained — no additional assertion library, no separate test runner. Latest as of 2026-03-12. |

**Do NOT install:** Cypress (requires a running dashboard server, heavier), Vitest (unit testing only, no browser automation), puppeteer (raw browser API, no test structure), jest (no browser).

**Configuration:** Chromium only (per constraints). Set `baseURL: 'http://localhost:3500'`, `reporter: 'json'`, output to `.playwright-results/`. No `webServer` block — tests run against the already-running Docker container.

**Browser binary:** `npx playwright install chromium --with-deps` (run inside Docker or on CI). On the host machine for local runs: `npx playwright install chromium`.

### 2. Structured File Logging

| Package | Version | Install As | Why |
|---------|---------|------------|-----|
| `winston` | `^3.19.0` | dependency | Mature, widely used Node.js logger with log levels, JSON format, multiple transports, and excellent TypeScript types via `@types/winston` (bundled since v3). |
| `winston-daily-rotate-file` | `^5.0.0` | dependency | Official winston transport for date-based file rotation. Supports `maxFiles: '7d'` to auto-delete logs older than 7 days, `maxSize`, and compression. Writes to `/app/data/logs/`. The project constraint (rotate after 7 days) maps directly to this package's `maxFiles: '7d'` option. |

**Do NOT install:** Pino (no built-in file rotation — requires external logrotate, not viable in Docker without OS-level configuration), morgan (HTTP-only request logger, not a general logger), bunyan (abandoned, last release 2017).

**Why not custom file appender:** The 7-day rotation + gzip compression + atomic writes during log rotation would require ~200 lines of brittle fs code. Winston handles edge cases (concurrent writes, mid-rotation crash recovery) correctly.

---

## No New Package Required — Built From Runtime APIs

### 3. LLM Response Streaming

**Pattern:** Native Web Streams API (`ReadableStream`, `TransformStream`, `TextEncoder`/`TextDecoder`) available in Next.js 14 Node.js runtime and Edge runtime. No package needed.

**Integration point:** Extend `llm.ts` with a `chatCompletionStream` function that returns a `ReadableStream<string>`. The API route wraps it in a `new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })`.

**Critical implementation note (verified 2026):** The async streaming work MUST be initiated inside the `ReadableStream` `start(controller)` callback. Returning the `Response` before the async work starts causes Next.js to buffer the entire response and defeats streaming. Pattern:

```typescript
// app/api/projects/[id]/rag/chat/route.ts
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      // fetch from LiteLLM with stream: true
      const upstream = await fetch(litellmUrl, { body: JSON.stringify({ stream: true, ... }) })
      const reader = upstream.body!.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        controller.enqueue(enc.encode(parseSSEChunk(value)))
      }
      controller.close()
    }
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    }
  })
}
```

**Client consumption:** `fetch()` → `response.body.getReader()` → loop `read()` → append text chunks to React state. No `EventSource` needed (EventSource only supports GET; chat is POST).

**Providers needing streaming adaptation in `llm.ts`:**
- LiteLLM: add `stream: true` to body — already supports OpenAI-compatible SSE
- Ollama: change `stream: false` to `stream: true` in body — returns NDJSON chunks
- OpenAI: add `stream: true` — returns SSE
- Anthropic: add `stream: true` + `anthropic-version` — returns SSE with `data:` prefix
- Google: `streamGenerateContent` endpoint — returns NDJSON

### 4. In-Memory TTL Cache

**Pattern:** Plain TypeScript `Map` with entry metadata. Zero dependencies. Implemented as a singleton module in `src/lib/cache.ts`.

**Why no library:** `node-cache` adds a dependency for ~30 lines of logic. The project constraint is explicit: "in-memory Map with TTL, resets on server restart (no persistence)". A Map-based singleton is exactly right.

**Implementation skeleton:**

```typescript
// src/lib/cache.ts
interface CacheEntry<T> { value: T; expiresAt: number }
const store = new Map<string, CacheEntry<unknown>>()

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { store.delete(key); return null }
  return entry.value
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
}

export function cacheDelete(key: string): void { store.delete(key) }
export function cacheClear(): void { store.clear() }
```

**Target endpoints (from PROJECT.md):** agents list, dashboard stats, settings, health check. Recommended TTL: 30s for dashboard, 60s for agents/settings, 10s for health.

### 5. Retry with Exponential Backoff

**Pattern:** Pure TypeScript utility. Zero dependencies. Implemented as `src/lib/retry.ts`.

**Why no library:** `p-retry` adds a dependency for ~25 lines of logic. The project already uses plain `fetch()` for all external calls. A simple `withRetry(fn, opts)` wrapper covers the use case.

**Implementation skeleton:**

```typescript
// src/lib/retry.ts
interface RetryOptions { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number }

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 500, maxDelayMs = 5000 } = opts
  let lastError: Error
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn() }
    catch (err) {
      lastError = err as Error
      if (attempt === maxAttempts) break
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastError!
}
```

**Apply to:** all `fetch()` calls in `llm.ts`, connector calls, Qdrant calls, Ollama calls.

### 6. React Error Boundaries

**Pattern:** Next.js 14 App Router built-in convention. Zero new packages. Use `error.tsx` files in each section route segment.

**How it works:** Place `error.tsx` files at the section level (e.g., `app/projects/error.tsx`, `app/tasks/error.tsx`). Next.js automatically wraps the segment in a React Error Boundary. The component MUST carry `'use client'`.

**For custom Error Boundary components** (reusable, outside Next.js file convention): use a plain React class component with `'use client'` — no library needed. React's built-in `componentDidCatch` and `getDerivedStateFromError` are sufficient.

**CatBot integration (from PROJECT.md):** In the `useEffect` inside each `error.tsx`, call the CatBot panel with the error details. CatBot already has an internal message API — pass the error message to its state.

**Global boundary:** `app/global-error.tsx` for root layout crashes (must include its own `<html>` and `<body>`).

---

## Full Installation Command

Only three packages are actually new:

```bash
# Production dependencies (logging only)
cd ~/docflow/app
npm install winston winston-daily-rotate-file

# Dev dependencies (testing only)
npm install -D @playwright/test

# Install Playwright browser binary (chromium only, run once)
npx playwright install chromium
```

---

## Integration Points with Existing Stack

### Next.js 14 + Playwright

Tests run against the Docker app at `http://localhost:3500`. The `playwright.config.ts` lives at the project root (not inside `app/`). Use `reporter: [['json', { outputFile: '.playwright-results/results.json' }]]`. The `/testing` page reads this JSON file via a Next.js API route.

No `webServer` config in `playwright.config.ts` — the Docker app is expected to be running before tests execute.

### Winston + Docker Volume

Logs write to `/app/data/logs/` inside the container. This path is already a volume mount (same as SQLite DB and uploaded files). The 7-day rotation via `winston-daily-rotate-file` keeps the volume from growing unbounded.

**Do NOT write logs to `/tmp/` or Next.js `.next/` directory** — those are ephemeral inside the container and not accessible from the `/testing` page.

### LLM Streaming + existing `llm.ts`

`llm.ts` currently exposes only `chatCompletion()` (returns `Promise<string>`). Add a parallel `chatCompletionStream()` that returns `ReadableStream<Uint8Array>`. Do NOT modify the existing function signature — backward compatibility needed for task-engine.ts, canvas-executor.ts, and all existing API routes.

### TTL Cache + `dynamic = 'force-dynamic'`

All routes that use the TTL cache must still export `dynamic = 'force-dynamic'` (per the project constraint on env var access). The cache reduces LiteLLM/Qdrant/SQLite round-trips within the Node.js process — it does NOT affect Next.js static prerendering behavior.

### Error Boundaries + Sidebar Sections

The 8 sections from PROJECT.md each map to a route segment that can have its own `error.tsx`:
`projects`, `agents`, `workers`, `skills`, `tasks`, `canvas`, `connectors`, `testing`. One `error.tsx` per section. Keep the fallback UI in Spanish (per the language constraint).

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| E2E testing | `@playwright/test` | Cypress | Cypress requires separate dashboard server for results; Playwright JSON reporter is self-contained |
| E2E testing | `@playwright/test` | Vitest + browser mode | No full E2E browser automation, no API request fixtures |
| File logging | `winston` + `winston-daily-rotate-file` | Pino | Pino has no built-in file rotation — requires OS logrotate, impractical in Docker |
| File logging | `winston` + `winston-daily-rotate-file` | Custom `fs.createWriteStream` | 200+ lines to handle rotation, compression, concurrent writes, crash recovery |
| TTL cache | Custom `Map` utility | `node-cache` | Adds a dependency for 30 lines of code; Map is sufficient |
| TTL cache | Custom `Map` utility | Redis | Overkill — PROJECT.md explicitly says "no persistence, resets on server restart" |
| Retry | Custom `withRetry` | `p-retry` | Adds a dependency for 25 lines of code; exponential backoff is trivial to implement |
| Streaming | Web Streams API (native) | `ai` SDK (Vercel AI SDK) | Adds a large dependency; overkill when LiteLLM already speaks OpenAI-compatible SSE |
| Error Boundaries | Next.js `error.tsx` convention | `react-error-boundary` package | Next.js 14 App Router has first-class support; no additional package needed |

---

## What NOT to Add

| Avoid | Why |
|-------|-----|
| `reactflow` (old name) | Deprecated — already using `@xyflow/react` |
| `socket.io` or `ws` | PROJECT.md explicitly excludes WebSocket; polling is sufficient |
| `redis` or `ioredis` | Cache must reset on server restart (in-memory only per constraint) |
| `p-retry` | 25 lines of utility code; no need for a dependency |
| `node-cache` | 30 lines of utility code; Map is sufficient |
| `react-error-boundary` | Next.js 14 App Router has built-in `error.tsx` convention |
| `ai` (Vercel AI SDK) | Large dependency; LiteLLM already speaks OpenAI SSE natively |
| `EventSource` (for streaming) | Only supports GET; chat endpoints are POST |
| `jest` or `vitest` | No unit test scope in v6.0; Playwright handles both E2E and API tests |
| Firefox/WebKit browsers for Playwright | Constraint says chromium only; extra browser downloads waste space |
| `pino` | No built-in file rotation; needs external OS logrotate |

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| `@playwright/test` | 1.58.2 | Node 18+ (using Node 20 in Docker) | Fully compatible with Node 20 in `node:20-slim` Docker image |
| `winston` | 3.19.0 | Node 12+ | Compatible with Node 20 |
| `winston-daily-rotate-file` | 5.0.0 | `winston@3.x` only | Do NOT use with winston@2 (API incompatible) |
| Web Streams API | built-in | Next.js 14 (Node 18+) | `ReadableStream` available in Node 18+; no polyfill needed |

---

## Confidence Assessment

| Claim | Confidence | Source |
|-------|------------|--------|
| `@playwright/test` latest is 1.58.2 | HIGH | `npm show @playwright/test version` (verified live) |
| Playwright supports API testing via `request` fixture | HIGH | Official Playwright docs |
| `winston` latest is 3.19.0 | HIGH | `npm show winston version` (verified live) |
| `winston-daily-rotate-file` latest is 5.0.0 | HIGH | `npm show winston-daily-rotate-file version` (verified live) |
| `winston-daily-rotate-file@5` requires `winston@3` | HIGH | npm page compatibility notes |
| `ReadableStream` available in Next.js 14 Node runtime | HIGH | Next.js 14 uses Node 18+ runtime; Web Streams are built-in since Node 18 |
| Next.js `error.tsx` wraps segment in Error Boundary | HIGH | Official Next.js 14 App Router docs |
| Streaming: async work must start inside `start()` callback | MEDIUM | 2026 community reports + Next.js SSE discussion #67501 |
| LiteLLM supports `stream: true` | HIGH | Stated in PROJECT.md: "LiteLLM proxy supports streaming" |
| Custom Map-based TTL cache is sufficient | HIGH | PROJECT.md explicit constraint: "in-memory Map with TTL, resets on server restart" |

---

## Sources

- @playwright/test npm (live): `npm show @playwright/test version` → 1.58.2
- Playwright official docs (best practices 2026): https://playwright.dev/docs/best-practices
- Next.js Playwright testing guide: https://nextjs.org/docs/pages/guides/testing/playwright
- Next.js error handling (App Router): https://nextjs.org/docs/app/getting-started/error-handling
- Next.js SSE streaming discussion: https://github.com/vercel/next.js/discussions/67501
- winston npm (live): `npm show winston version` → 3.19.0
- winston-daily-rotate-file npm (live): `npm show winston-daily-rotate-file version` → 5.0.0
- BrowserStack Playwright best practices 2026: https://www.browserstack.com/guide/playwright-best-practices
- Pino vs Winston comparison: https://betterstack.com/community/guides/scaling-nodejs/pino-vs-winston/
- NODE.js memory cache with TTL (2026): https://oneuptime.com/blog/post/2026-01-30-nodejs-memory-cache-ttl/view
- SSE LLM streaming in Next.js: https://upstash.com/blog/sse-streaming-llm-responses

---

*Stack research for: DoCatFlow v6.0 — Testing + Performance + Estabilización*
*Researched: 2026-03-12*
