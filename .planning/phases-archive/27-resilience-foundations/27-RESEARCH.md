# Phase 27: Resilience Foundations - Research

**Researched:** 2026-03-12
**Domain:** Error resilience, retry logic, in-memory caching, structured logging, error boundaries, health monitoring, DB startup cleanup
**Confidence:** HIGH (all findings from direct codebase inspection)

---

## Summary

DocFlow calls five categories of external services — LiteLLM, Qdrant, Ollama, OpenClaw, and user-configured Connectors — spread across at least 8 files. None of those calls currently have retry logic. API routes return 500 on any unhandled exception and the UI receives no structured recovery path. There are no `error.tsx` files anywhere in the app directory tree, so a crash in any section takes the entire view down (the sidebar and CatBot persist only because they live in `layout.tsx`).

The health endpoint (`/api/health`) already measures `latency_ms` per service and returns a rich JSON payload. The dashboard summary endpoint (`/api/dashboard/summary`) has no caching. There is no structured logger — all observability goes through `console.error` / `console.log`. The `canvas_runs` table already gets a startup cleanup in `db.ts` (lines 939-943), but the `tasks` table does not, so tasks left in `'running'` state across Docker restarts remain stuck. CatBot persists messages in `localStorage` under the key `'docatflow_catbot_messages'` as a JSON array of `{ role, content, timestamp }` objects — this is the hook point for RESIL-06.

**Primary recommendation:** Implement all eight requirements in a single wave. The withRetry utility and the logger are pure-TS modules with no UI dependencies and should be built first; error.tsx files can be scaffolded in parallel; DB cleanup and cache layer slot into existing route handlers with surgical one-line changes.

---

## Service Call Inventory

### LiteLLM — chat completions (generation, NOT idempotent by default, but safe to retry on network/5xx)

| File | Function | Call | Idempotent? | Notes |
|------|----------|------|-------------|-------|
| `app/src/lib/services/task-executor.ts:15` | `callLLM()` | `POST /v1/chat/completions` | NO | LLM generation — do NOT auto-retry |
| `app/src/lib/services/canvas-executor.ts:86` | `callLLM()` | `POST /v1/chat/completions` | NO | Same — do NOT auto-retry |
| `app/src/app/api/catbot/chat/route.ts` | `POST handler` | `POST /v1/chat/completions` | NO | Do NOT auto-retry |
| `app/src/app/api/projects/[id]/process/route.ts:282` | inline | `POST /v1/chat/completions` | NO | Do NOT auto-retry |
| `app/src/app/api/agents/generate/route.ts` | inline | LiteLLM via provider | NO | Do NOT auto-retry |
| `app/src/app/api/workers/generate/route.ts` | inline | LiteLLM | NO | Do NOT auto-retry |
| `app/src/app/api/skills/generate/route.ts` | inline | LiteLLM | NO | Do NOT auto-retry |
| `app/src/lib/services/litellm.ts:18` | `getEmbeddings()` | `POST /v1/embeddings` | YES | Pure function of input — SAFE to retry |
| `app/src/lib/services/litellm.ts:8` | `healthCheck()` | `GET /v1/models` | YES | Read-only — SAFE to retry |
| `app/src/app/api/settings/models/route.ts:25` | `fetchLiteLLMModels()` | `GET /v1/models` | YES | Read-only — SAFE to retry |

### Qdrant — vector database

| File | Function | Call | Idempotent? | Notes |
|------|----------|------|-------------|-------|
| `app/src/lib/services/qdrant.ts:6` | `healthCheck()` | `GET /collections` | YES | SAFE |
| `app/src/lib/services/qdrant.ts:45` | `getCollectionInfo()` | `GET /collections/:name` | YES | SAFE |
| `app/src/lib/services/qdrant.ts:68` | `search()` | `POST /collections/:name/points/search` | YES | Pure read — SAFE |
| `app/src/lib/services/qdrant.ts:14` | `createCollection()` | `PUT /collections/:name` | YES | PUT is idempotent — SAFE |
| `app/src/lib/services/qdrant.ts:33` | `deleteCollection()` | `DELETE /collections/:name` | YES | Already handles 404 — SAFE |
| `app/src/lib/services/qdrant.ts:54` | `upsertPoints()` | `PUT /collections/:name/points` | YES | PUT upsert is idempotent — SAFE |

### Ollama — local embeddings

| File | Function | Call | Idempotent? | Notes |
|------|----------|------|-------------|-------|
| `app/src/lib/services/ollama.ts:13` | `healthCheck()` | `GET /api/tags` | YES | SAFE |
| `app/src/lib/services/ollama.ts:21` | `getEmbedding()` | `POST /api/embed` | YES | Pure function of input — SAFE |

### OpenClaw — agent management

| File | Function | Call | Idempotent? | Notes |
|------|----------|------|-------------|-------|
| `app/src/app/api/agents/route.ts:38` | `GET handler` | `GET /api/v1/agents` | YES | SAFE |
| `app/src/app/api/agents/route.ts:52` | `GET handler` | `GET /rpc/agents.list` | YES | SAFE (fallback endpoint) |
| `app/src/app/api/agents/create/route.ts:233` | `reloadOpenClaw()` | `POST /rpc/config.reload`, `POST /rpc/gateway.reload` | YES | Reload is idempotent — SAFE |
| `app/src/app/api/health/route.ts:51` | `checkService()` | `GET /` | YES | SAFE |

### Connectors — user-configured HTTP endpoints

| File | Function | Call | Idempotent? | Notes |
|------|----------|------|-------------|-------|
| `app/src/lib/services/task-executor.ts:166` | `executeConnectors()` | `POST config.url` | UNKNOWN | User-defined — treat as NOT idempotent. No auto-retry. |
| `app/src/lib/services/canvas-executor.ts:297` | `case 'connector'` | `POST/GET config.url` | UNKNOWN | User-defined — treat as NOT idempotent. No auto-retry. |
| `app/src/app/api/connectors/[id]/test/route.ts` | `test endpoint` | `POST config.url` | UNKNOWN | User-invoked test — no auto-retry. |

### n8n webhook (process route)

| File | Function | Call | Idempotent? | Notes |
|------|----------|------|-------------|-------|
| `app/src/app/api/projects/[id]/process/route.ts:385` | `POST handler` | `POST ${n8nUrl}/webhook/*` | NO | Triggers workflow — do NOT retry |

---

## withRetry Implementation Target

Calls that SHOULD be wrapped with `withRetry`:

```
litellm.getEmbeddings()           — rag.ts calls this in a loop per chunk
litellm.healthCheck()             — health/route.ts
qdrant.healthCheck()              — health/route.ts
qdrant.getCollectionInfo()        — multiple routes
qdrant.search()                   — task-executor.ts, canvas-executor.ts, chat/route.ts
qdrant.createCollection()         — rag.ts
qdrant.deleteCollection()         — rag.ts, rag/route.ts
qdrant.upsertPoints()             — rag.ts
ollama.healthCheck()              — health/route.ts
ollama.getEmbedding()             — task-executor.ts, canvas-executor.ts, chat/route.ts
GET /api/v1/agents (OpenClaw)     — agents/route.ts
GET /rpc/agents.list (OpenClaw)   — agents/route.ts
POST /rpc/config.reload           — agents/create/route.ts
```

Calls that MUST NOT be retried:
- All `POST /v1/chat/completions` (LLM generation — non-deterministic, user-visible)
- All connector invocations (`config.url`)
- n8n webhook trigger

---

## Current Error Handling Patterns

### API routes
Standard pattern is a top-level try/catch returning `500`:
```typescript
} catch (error) {
  console.error('Error ...:', error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
}
```

Some routes have nested try/catch for silent fallback (e.g., `agents/route.ts` swallows OpenClaw fetch errors silently).

### Service layer
- `qdrant.ts`: throws raw Error, no retry
- `ollama.ts`: throws on non-ok response, no retry
- `litellm.ts`: wraps in try/catch, re-throws with user message, no retry
- `task-executor.ts`: catches per-step errors, marks step as `'failed'`, stops task
- `canvas-executor.ts`: catches RAG errors silently, connector errors logged to console

### Client side
No `error.tsx` files exist anywhere in `app/src/app/`. Client-side fetch errors in pages use `.catch(() => null)` or `.catch(() => [])` inline patterns (e.g., `app/src/app/page.tsx` lines 122-127). No error boundaries. A React render error in any section would crash the entire `main` content area.

### Logging
All logging is `console.error()` and `console.log()`. No structured format. No disk persistence. No rotation. Logs are visible only via `docker logs docflow-app` and lost on container restart.

---

## Health Check Endpoint Analysis

**File:** `app/src/app/api/health/route.ts`

The endpoint already does what RESIL-07 requires. Key points:

1. `latency_ms` is already computed for every service via the `checkService()` helper (lines 31-47).
2. All five services are checked: openclaw, n8n, qdrant, litellm, ollama.
3. Response shape:
```json
{
  "timestamp": "...",
  "docflow": { "status": "ok", "db": "ok", "projects_count": N, "sources_count": N },
  "openclaw": { "status": "connected|disconnected", "url": "...", "latency_ms": N, "error": null },
  "n8n": { "status": "...", "latency_ms": N },
  "qdrant": { "status": "...", "latency_ms": N, "collections": [...] },
  "litellm": { "status": "...", "latency_ms": N, "models": [...] },
  "ollama": { "status": "...", "latency_ms": N, "models": [...] }
}
```

4. The `docflow.db` field is `'ok'|'error'` — no `latency_ms`. RESIL-07 wants latency for DB too.

**RESIL-07 gap:** Add DB latency measurement. The current code runs `db.prepare('SELECT 1').get()` without timing it. Wrap with `Date.now()` delta.

The `use-system-health.ts` hook polls `/api/health` every 30 seconds (configurable). The `SystemHealthPanel` component displays `latency_ms` already via `ServiceCard` — no UI changes needed.

---

## Cacheable Endpoints Analysis

### /api/agents (GET)
- **File:** `app/src/app/api/agents/route.ts`
- **Pattern:** Fetches OpenClaw (network) + SQLite query + `fs.existsSync()` per agent
- **Cost:** 5s timeout per OpenClaw attempt, two fallback endpoints tried
- **Recommended TTL:** 30 seconds
- **Cache key:** `'agents'`

### /api/dashboard/* (GET — 6 sub-endpoints)
- **Files:** `app/src/app/api/dashboard/summary|activity|usage|top-agents|top-models|storage/route.ts`
- **Pattern:** Pure SQLite COUNT/SUM queries — very fast but called in parallel on every dashboard load
- **Recommended TTL:** 60 seconds
- **Cache key:** `'dashboard:summary'`, `'dashboard:activity'`, etc.

### /api/health (GET)
- **File:** `app/src/app/api/health/route.ts`
- **Pattern:** 5 parallel network checks with 5s timeouts each
- **Cost:** Up to 5 seconds per request; hook polls every 30s
- **Recommended TTL:** 30 seconds
- **Cache key:** `'health'`

### /api/settings/* (GET)
- **Files:** `app/src/app/api/settings/api-keys/route.ts`, `app/src/app/api/settings/models/route.ts`, `app/src/app/api/settings/processing/route.ts`
- **Pattern:** SQLite reads + optional LiteLLM/Ollama model list fetch
- **Recommended TTL:** 300 seconds (settings rarely change)
- **Cache key:** `'settings:api-keys'`, `'settings:models'`, `'settings:processing'`

### Cache Implementation Pattern

Simple module-level Map in each route file is NOT recommended — it would be per-route-instance and not shared. Better: a shared `app/src/lib/cache.ts` module that exports a singleton:

```typescript
// app/src/lib/cache.ts
interface CacheEntry<T> { data: T; expiresAt: number; }
const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | null { ... }
export function cacheSet<T>(key: string, data: T, ttlMs: number): void { ... }
export function cacheInvalidate(key: string): void { ... }
```

Since Next.js API routes run in a single Node process (not serverless in Docker), a module-level Map persists across requests as expected.

---

## DB Initialization Flow — RESIL-08 Cleanup Insertion Point

**File:** `app/src/lib/db.ts`

The file executes top-to-bottom at import time. Table creation and seeding happen synchronously. The existing canvas_runs cleanup is at **lines 939-943**:

```typescript
// Mark stuck canvas_runs as failed on startup
try {
  db.prepare("UPDATE canvas_runs SET status = 'failed' WHERE status = 'running'").run();
  db.prepare("UPDATE canvas_runs SET status = 'failed' WHERE status = 'waiting'").run();
} catch { /* table may not exist on first run */ }
```

**RESIL-08 gap:** The `tasks` table has no equivalent cleanup. Tasks left in `'running'` state survive Docker restarts. The fix inserts immediately after the canvas_runs block (or alongside it):

```typescript
// Mark stuck tasks as failed on startup (RESIL-08)
try {
  db.prepare("UPDATE tasks SET status = 'failed', updated_at = datetime('now') WHERE status = 'running'").run();
  // Also reset any task_steps stuck in 'running'
  db.prepare("UPDATE task_steps SET status = 'failed' WHERE status = 'running'").run();
} catch { /* table may not exist on first run */ }
```

**Important:** `task_steps` with status `'running'` should also be reset, otherwise a resumed task would see a completed step that has no output.

The existing canvas_runs block already handles `'waiting'` status too — tasks do not have a 'waiting' equivalent, only 'paused'. 'paused' tasks (at a checkpoint) should NOT be reset — they are legitimately paused awaiting human approval.

---

## CatBot localStorage Format — RESIL-06

**File:** `app/src/components/catbot/catbot-panel.tsx`

```typescript
const STORAGE_KEY = 'docatflow_catbot_messages';
const MAX_STORED = 50;

interface Message {
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: Array<{ name: string; args: Record<string, unknown>; result: unknown }>;
  actions?: Array<{ type: string; url: string; label: string }>;
  timestamp: number;
}
```

Messages are stored as `JSON.stringify(messages.slice(-MAX_STORED))` and read back on mount via `loadMessages()`. The panel reads localStorage on mount inside a `useEffect`.

**RESIL-06 implementation strategy:**

The `error.tsx` component should push a synthetic assistant message to `localStorage` before the error boundary renders. Since `error.tsx` runs client-side in React, it has access to `localStorage`. The message format:

```typescript
const errorMsg: Message = {
  role: 'assistant',
  content: `🐱 He detectado un error en ${sectionName}: "${error.message}". Estoy aquí para ayudarte a recuperarte. ¿Quieres que te guíe?`,
  timestamp: Date.now(),
};
const existing = JSON.parse(localStorage.getItem('docatflow_catbot_messages') || '[]');
localStorage.setItem(
  'docatflow_catbot_messages',
  JSON.stringify([...existing, errorMsg].slice(-50))
);
```

CatBot reads this on next open via `loadMessages()` in its `useEffect`. No changes to catbot-panel.tsx are needed — the pre-pushed message will appear automatically.

**Limitation:** CatBot must be opened after the error for the message to appear (it's already in localStorage, not pushed as a notification). A badge indicator on the floating button would be ideal but is out of scope for this phase.

---

## App Sections Directory Structure — RESIL-05

The 8 sections requiring `error.tsx` files:

| Section | Directory | Currently has error.tsx |
|---------|-----------|------------------------|
| Projects | `app/src/app/projects/` | No |
| Tasks | `app/src/app/tasks/` | No |
| Agents | `app/src/app/agents/` | No |
| Canvas | `app/src/app/canvas/` | No |
| Workers | `app/src/app/workers/` | No |
| Skills | `app/src/app/skills/` | No |
| Connectors | `app/src/app/connectors/` | No |
| System/Settings | `app/src/app/system/` or `app/src/app/settings/` | No |

**Note on "testing" section:** The phase requirements mention a "testing" section, but no `app/src/app/testing/` or `app/src/app/testing/` directory exists. The closest equivalent is either `app/src/app/system/` (health checks / diagnostics) or `app/src/app/settings/` (API key testing). The research recommends treating `system` as the 8th section, or adding `settings` — both have pages but no error boundaries.

**Next.js error.tsx convention:**
- Must be `'use client'` directive
- Receives `{ error: Error & { digest?: string }, reset: () => void }` props
- Must be placed directly in the route segment directory (NOT in `components/`)
- Sidebar and CatBot remain functional because they are in `layout.tsx` which is NOT affected by segment-level error boundaries

**Standard error.tsx template for this project:**
```typescript
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // RESIL-06: push to CatBot localStorage
    try {
      const msgs = JSON.parse(localStorage.getItem('docatflow_catbot_messages') || '[]');
      msgs.push({
        role: 'assistant',
        content: `🐱 Error detectado: "${error.message}". Pulsa Reintentar o abre CatBot para ayuda.`,
        timestamp: Date.now(),
      });
      localStorage.setItem('docatflow_catbot_messages', JSON.stringify(msgs.slice(-50)));
    } catch { /* ignore */ }
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <h2 className="text-xl font-semibold text-zinc-100 mb-2">Algo ha ido mal</h2>
      <p className="text-zinc-400 mb-6 text-sm">{error.message}</p>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  );
}
```

---

## Structured Logger Design — RESIL-04

**Location:** `app/src/lib/logger.ts`
**Output:** `/app/data/logs/app-YYYY-MM-DD.jsonl`
**Rotation:** Keep last 7 days, delete older files

No external dependencies. Implementation uses Node.js `fs` (already imported in db.ts).

```typescript
// app/src/lib/logger.ts
import fs from 'fs';
import path from 'path';

const LOG_DIR = process['env']['LOG_DIR'] || '/app/data/logs';

function getLogPath(): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(LOG_DIR, `app-${date}.jsonl`);
}

function rotateLogs(): void {
  // Delete files older than 7 days
}

export type LogLevel = 'info' | 'warn' | 'error';

export function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...data,
  });
  // Append to file (non-blocking)
  fs.appendFile(getLogPath(), entry + '\n', () => {});
}

export const logger = { info: ..., warn: ..., error: ... };
```

**Important:** `fs.appendFile` with callback is fire-and-forget — it does not block the request. The log dir `/app/data/logs` lives in the Docker volume already used for SQLite and projects data. The directory must be created if missing (same pattern as `db.ts` line 9-11).

**Rotation strategy:** Call `rotateLogs()` once at module load time (top-level in logger.ts). List files in LOG_DIR, parse dates from filenames, delete any older than 7 days.

---

## withRetry Utility Design — RESIL-01

**Location:** `app/src/lib/retry.ts`

```typescript
// app/src/lib/retry.ts
export interface RetryOptions {
  maxAttempts?: number;   // default: 3
  baseDelayMs?: number;   // default: 500
  maxDelayMs?: number;    // default: 10000
  shouldRetry?: (error: Error) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const maxDelayMs = opts.maxDelayMs ?? 10000;
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;

  let lastError: Error;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt === maxAttempts || !shouldRetry(lastError)) throw lastError;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      // Add jitter: delay * (0.75 + Math.random() * 0.5)
      await sleep(delay * (0.75 + Math.random() * 0.5));
    }
  }
  throw lastError!;
}

function defaultShouldRetry(error: Error): boolean {
  // Retry on network errors, timeouts, and 5xx
  const msg = error.message.toLowerCase();
  return (
    msg.includes('econnrefused') ||
    msg.includes('timeout') ||
    msg.includes('aborted') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504') ||
    error.name === 'AbortError'
  );
}
```

**RESIL-02 application points:**

```typescript
// In qdrant.ts:
async search(name, vector, limit = 5) {
  return withRetry(() => /* existing fetch */, { maxAttempts: 3 });
}

// In ollama.ts:
async getEmbedding(text, model) {
  return withRetry(() => /* existing fetch */, { maxAttempts: 3 });
}

// In litellm.ts:
async getEmbeddings(texts, model) {
  return withRetry(() => /* existing fetch */, { maxAttempts: 3 });
}
```

All other idempotent calls follow the same pattern. The `shouldRetry` default excludes 4xx errors (auth failures, bad requests should not be retried).

---

## Architecture Patterns

### Recommended File Structure (new files)
```
app/src/lib/
├── retry.ts               # withRetry utility (RESIL-01)
├── cache.ts               # TTL in-memory cache (RESIL-03)
├── logger.ts              # JSONL logger (RESIL-04)

app/src/app/
├── projects/
│   └── error.tsx          # RESIL-05
├── tasks/
│   └── error.tsx
├── agents/
│   └── error.tsx
├── canvas/
│   └── error.tsx
├── workers/
│   └── error.tsx
├── skills/
│   └── error.tsx
├── connectors/
│   └── error.tsx
└── system/
    └── error.tsx
```

### Modified Files
```
app/src/lib/db.ts                           # RESIL-08: add tasks cleanup
app/src/lib/services/qdrant.ts              # RESIL-02: wrap with withRetry
app/src/lib/services/ollama.ts              # RESIL-02: wrap with withRetry
app/src/lib/services/litellm.ts             # RESIL-02: wrap with withRetry
app/src/app/api/agents/route.ts             # RESIL-02 + RESIL-03: retry + cache
app/src/app/api/dashboard/summary/route.ts  # RESIL-03: cache
app/src/app/api/dashboard/activity/route.ts # RESIL-03: cache
app/src/app/api/dashboard/usage/route.ts    # RESIL-03: cache
app/src/app/api/dashboard/top-agents/route.ts # RESIL-03: cache
app/src/app/api/dashboard/top-models/route.ts # RESIL-03: cache
app/src/app/api/dashboard/storage/route.ts  # RESIL-03: cache
app/src/app/api/health/route.ts             # RESIL-03 + RESIL-07: cache + DB latency
app/src/app/api/settings/api-keys/route.ts  # RESIL-03: cache
app/src/app/api/settings/models/route.ts    # RESIL-03: cache
app/src/app/api/settings/processing/route.ts # RESIL-03: cache
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Jitter in backoff | Custom random logic scattered | Built into `withRetry` utility | Consistent behavior |
| File rotation | Custom file system crawler | Simple `Date.now()` + `fs.readdirSync` in logger.ts | Enough for 7-day window |
| Error reporting | Custom error service | localStorage push to CatBot | Already integrated |
| Class-based ErrorBoundary | React class component | Next.js `error.tsx` files | Native framework support |
| Cache eviction | LRU or complex strategy | TTL check on `cacheGet()` | Hot endpoints have stable TTLs |

---

## Common Pitfalls

### Pitfall 1: Retrying LLM Generation
**What goes wrong:** If `callLLM()` in task-executor or canvas-executor is wrapped with `withRetry`, a slow LLM response that eventually times out gets retried, consuming tokens twice and producing double output.
**How to avoid:** NEVER wrap `POST /v1/chat/completions` calls. Only wrap reads and idempotent writes. The key distinction: `getEmbeddings()` is deterministic given the same input; `chatCompletion()` is not.

### Pitfall 2: Cache Poisoning on Error
**What goes wrong:** A request that fails (e.g., DB down, OpenClaw unreachable) returns a partial or empty response, which gets cached and served for the TTL window.
**How to avoid:** Only call `cacheSet()` when the response is successful (`res.ok` or no exception). On error, throw/return error response WITHOUT caching.

### Pitfall 3: error.tsx Missing 'use client' Directive
**What goes wrong:** Next.js throws a build error because `error.tsx` uses hooks (`useEffect`) but is not marked as a client component.
**How to avoid:** Every `error.tsx` must start with `'use client';` as the first line.

### Pitfall 4: Resetting 'paused' Tasks on Startup
**What goes wrong:** Tasks paused at a checkpoint (status `'paused'`) get reset to `'failed'`, losing the human-approved checkpoint state.
**How to avoid:** The DB cleanup query for tasks must only reset `status = 'running'`, NOT `status = 'paused'`. Paused tasks are intentionally waiting for human input.

### Pitfall 5: Logger Blocking Request Thread
**What goes wrong:** Using `fs.writeFileSync()` or `fs.appendFileSync()` in the logger blocks the Node.js event loop for every log call.
**How to avoid:** Use `fs.appendFile()` with a callback (fire-and-forget). Lost logs on crash are acceptable for this use case.

### Pitfall 6: Cache Not Invalidated on Mutations
**What goes wrong:** User creates a new agent; the cache returns stale data for 30 seconds.
**How to avoid:** Call `cacheInvalidate('agents')` at the end of any POST/PATCH/DELETE handler for agents. Same for settings (invalidate on PUT/POST to `/api/settings/*`). Dashboard data is read-only aggregate — 60s staleness is acceptable.

### Pitfall 7: withRetry in rag.ts Loop
**What goes wrong:** `rag.ts` calls `litellm.getEmbeddings()` and `qdrant.upsertPoints()` in a loop over potentially hundreds of chunks. If each call retries 3 times with exponential backoff, a prolonged outage causes the loop to hang for minutes.
**How to avoid:** Keep `maxAttempts: 3` with `maxDelayMs: 5000` for the RAG indexing path. The failure will propagate and the RAG job status will be set to `'failed'` by the existing error handler in `rag.ts`.

---

## State of the Art

| Old Approach | Current Approach | Relevance |
|--------------|-----------------|-----------|
| Class-based ErrorBoundary | Next.js `error.tsx` segment boundaries | Use error.tsx — no class components needed |
| winston/bunyan for logging | Custom JSONL logger | Keep custom (fewer deps, fits constraint) |
| Redis for caching | In-process Map with TTL | Correct for single-process Docker container |
| Complex retry libraries (axios-retry) | Plain `withRetry` utility | Self-contained, no dependency |

---

## Open Questions

1. **"testing" section in RESIL-05**
   - What we know: No `app/src/app/testing/` directory exists
   - What's unclear: Whether the requirement means `system/` (health diagnostics) or a future testing section
   - Recommendation: Add `error.tsx` to `app/src/app/system/` as the 8th section; document it as "Sistema" in the error card UI

2. **Cache invalidation on settings change**
   - What we know: Settings routes are GET-cached for 300s
   - What's unclear: Whether API key test updates (`POST /api/settings/api-keys/[provider]/test`) should invalidate the cache
   - Recommendation: Yes — the test route updates `test_status` in DB; the settings cache should be invalidated after any successful test

3. **Log directory permissions in Docker**
   - What we know: `/app/data/` is a Docker volume; the existing `chown -R nextjs:nodejs /app/data/` command in the build instructions covers it
   - What's unclear: Whether `/app/data/logs/` needs to be pre-created or if `fs.mkdirSync` on startup is sufficient
   - Recommendation: Create `logs/` dir in `logger.ts` at module load time (same pattern as `db.ts` line 9-11)

---

## Validation Architecture

Nyquist validation not configured (key absent from `.planning/config.json`) — treated as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no test config files found |
| Config file | None — Wave 0 must add if needed |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements — Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RESIL-01 | withRetry retries 3x with backoff | unit | N/A — manual verification | ❌ Wave 0 |
| RESIL-02 | Qdrant/Ollama/LiteLLM calls are wrapped | manual | Shut down Qdrant, trigger RAG query, observe retry | N/A |
| RESIL-03 | Cache returns stale data within TTL | manual | Hit /api/agents twice quickly, check response time | N/A |
| RESIL-04 | Logger writes JSONL to /app/data/logs/ | manual | `docker exec docflow-app ls /app/data/logs/` | N/A |
| RESIL-05 | error.tsx renders per section | manual | Navigate to broken route, observe error card | N/A |
| RESIL-06 | Error pushes to CatBot localStorage | manual | Trigger error, open CatBot, verify message | N/A |
| RESIL-07 | Health check reports latency_ms for DB | automated | `curl /api/health | jq .docflow.latency_ms` | N/A |
| RESIL-08 | Stuck tasks reset on startup | automated | Insert running task, restart app, query DB | N/A |

### Wave 0 Gaps
No test infrastructure exists. Given the constraint to use a custom logger (not winston) and no test framework is present, functional testing is manual. The planner may choose to add a minimal test script for RESIL-01 (withRetry) as it is pure logic.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `/home/deskmath/docflow/app/src/lib/db.ts` — full schema, startup cleanup, seeding
- `/home/deskmath/docflow/app/src/lib/services/llm.ts` — all LLM provider call patterns
- `/home/deskmath/docflow/app/src/lib/services/qdrant.ts` — all Qdrant operations
- `/home/deskmath/docflow/app/src/lib/services/ollama.ts` — Ollama embedding calls
- `/home/deskmath/docflow/app/src/lib/services/litellm.ts` — LiteLLM embedding + health
- `/home/deskmath/docflow/app/src/lib/services/task-executor.ts` — full task pipeline, connector execution
- `/home/deskmath/docflow/app/src/lib/services/canvas-executor.ts` — canvas pipeline, connector node
- `/home/deskmath/docflow/app/src/lib/services/rag.ts` — RAG indexing pipeline
- `/home/deskmath/docflow/app/src/app/api/health/route.ts` — complete health check implementation
- `/home/deskmath/docflow/app/src/app/api/agents/route.ts` — OpenClaw agent listing
- `/home/deskmath/docflow/app/src/app/api/agents/create/route.ts` — OpenClaw registration + reload
- `/home/deskmath/docflow/app/src/components/catbot/catbot-panel.tsx` — localStorage format
- `/home/deskmath/docflow/app/src/app/layout.tsx` — root layout (confirms sidebar/CatBot isolation)
- `find` and `grep` over entire `app/src/` for error.tsx, logging, and fetch patterns

### Secondary (MEDIUM confidence)
- Next.js App Router docs pattern: `error.tsx` must be `'use client'` and receives `{ error, reset }` — this is a well-documented stable pattern unchanged since Next.js 13

---

## Metadata

**Confidence breakdown:**
- Service call inventory: HIGH — all fetches found via grep, no ambiguity
- withRetry design: HIGH — standard exponential backoff pattern
- Cache implementation: HIGH — module-level Map is correct for Docker single-process
- Logger design: HIGH — fs.appendFile pattern is established
- CatBot localStorage: HIGH — read directly from source
- error.tsx sections: HIGH — directory listing confirms no error.tsx files exist
- DB cleanup: HIGH — exact insertion point identified in db.ts

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable Next.js patterns, internal codebase)
