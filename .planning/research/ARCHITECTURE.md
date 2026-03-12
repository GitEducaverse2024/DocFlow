# Architecture Research

**Domain:** Testing infrastructure + LLM streaming + stabilization for existing Next.js 14 App Router app (DoCatFlow v6.0)
**Researched:** 2026-03-12
**Confidence:** HIGH (based on direct codebase analysis + verified documentation)

---

## Standard Architecture

### System Overview: v6.0 Integration Map

```
┌──────────────────────────────────────────────────────────────────┐
│                        HOST MACHINE                               │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  Playwright (devDep, host-only, NOT inside Docker)           │  │
│  │  npx playwright test --reporter=json                        │  │
│  │  baseURL: http://localhost:3500 → targets Docker app        │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
└─────────────────────────────┼────────────────────────────────────┘
                              │ HTTP
┌─────────────────────────────▼────────────────────────────────────┐
│                    DOCKER: docflow-app :3500                       │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    Next.js 14 App Router                     │  │
│  │                                                             │  │
│  │  Pages: /testing (NEW)  /projects  /tasks  /agents          │  │
│  │                                                             │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │  │
│  │  │ error.tsx    │  │  Streaming   │  │   /testing page   │  │  │
│  │  │ per section  │  │  Response    │  │   run + results   │  │  │
│  │  │ (App Router) │  │  (SSE chunks)│  │   + log viewer    │  │  │
│  │  └─────────────┘  └──────┬───────┘  └─────────┬─────────┘  │  │
│  │                           │                     │            │  │
│  │  ┌────────────────────────┴─────────────────────┴─────────┐ │  │
│  │  │                   API Routes Layer                       │ │  │
│  │  │                                                          │ │  │
│  │  │  EXISTING (unchanged):                                   │ │  │
│  │  │  /api/catbot/chat         (tool loop, non-stream)        │ │  │
│  │  │  /api/projects/[id]/chat  (RAG chat, non-stream)        │ │  │
│  │  │  /api/health              (service checks)               │ │  │
│  │  │                                                          │ │  │
│  │  │  MODIFIED (additive):                                    │ │  │
│  │  │  /api/catbot/stream       (NEW — streaming variant)      │ │  │
│  │  │  /api/projects/[id]/stream (NEW — streaming RAG chat)   │ │  │
│  │  │  /api/health              (+ TTL cache wrapper, 30s)     │ │  │
│  │  │  /api/agents              (+ TTL cache wrapper, 30s)     │ │  │
│  │  │  /api/dashboard/summary   (+ TTL cache wrapper, 60s)     │ │  │
│  │  │                                                          │ │  │
│  │  │  NEW:                                                     │ │  │
│  │  │  /api/testing/run         (write trigger file)           │ │  │
│  │  │  /api/testing/results     (read JSON report)             │ │  │
│  │  │  /api/testing/logs        (read JSONL log files)         │ │  │
│  │  │  /api/testing/generate    (AI test generation)           │ │  │
│  │  └──────────────────────────┬───────────────────────────── ┘ │  │
│  │                              │                                │  │
│  │  ┌───────────────────────────┴──────────────────────────────┐ │  │
│  │  │                  lib/services/ Layer                      │ │  │
│  │  │                                                           │ │  │
│  │  │  EXISTING (unchanged):                                    │ │  │
│  │  │  llm.ts          chatCompletion() → non-streaming         │ │  │
│  │  │  usage-tracker.ts logUsage()                             │ │  │
│  │  │  catbot-tools.ts  executeTool(), getToolsForLLM()        │ │  │
│  │  │  task-executor.ts executeTask() (callLLM wrapped w/retry) │ │  │
│  │  │  canvas-executor.ts (callLLM wrapped w/retry)            │ │  │
│  │  │                                                           │ │  │
│  │  │  NEW:                                                     │ │  │
│  │  │  llm-stream.ts   chatStream() → ReadableStream            │ │  │
│  │  │  retry.ts        withRetry(fn, opts) utility              │ │  │
│  │  │  cache.ts        ttlCache Map with per-key TTL            │ │  │
│  │  │  logger.ts       log.info/warn/error → JSONL file         │ │  │
│  │  └───────────────────────────┬──────────────────────────────┘ │  │
│  │                              │                                 │  │
│  │  ┌───────────────────────────┴──────────────────────────────┐  │  │
│  │  │              Data Layer                                    │  │  │
│  │  │  SQLite (better-sqlite3) — existing tables (UNCHANGED)    │  │  │
│  │  │  /app/data/logs/app-YYYY-MM-DD.jsonl  — NEW log files    │  │  │
│  │  │  /app/data/test-results/report.json  — NEW test reports  │  │  │
│  │  │  /app/data/test-trigger/trigger.json — NEW trigger file  │  │  │
│  │  └───────────────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  External services (UNCHANGED — same ports):                      │
│  LiteLLM :4000 | Qdrant :6333 | Ollama :11434 | OpenClaw :18789  │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | New vs Modified |
|-----------|----------------|-----------------|
| `lib/services/llm-stream.ts` | chatStream() returns ReadableStream from LiteLLM | NEW |
| `lib/services/retry.ts` | withRetry(fn, opts) wraps any async function | NEW |
| `lib/services/cache.ts` | ttlCache Map with per-key TTL and invalidate methods | NEW |
| `lib/services/logger.ts` | Structured JSONL log write + console mirror, 7-day rotation | NEW |
| `app/api/catbot/stream/route.ts` | Streaming CatBot: tool loop first, then stream final reply | NEW |
| `app/api/projects/[id]/stream/route.ts` | Streaming RAG chat with SSE response | NEW |
| `app/api/testing/run/route.ts` | Write trigger file to shared volume | NEW |
| `app/api/testing/results/route.ts` | Read and parse Playwright JSON report | NEW |
| `app/api/testing/logs/route.ts` | Read JSONL log files for /testing UI | NEW |
| `app/api/testing/generate/route.ts` | AI reads source file, generates Playwright spec | NEW |
| `app/testing/page.tsx` | /testing UI: run button, results table, log viewer | NEW |
| `app/api/catbot/chat/route.ts` | Existing non-streaming endpoint — KEEP UNCHANGED | UNCHANGED |
| `app/api/projects/[id]/chat/route.ts` | Existing non-streaming — KEEP UNCHANGED | UNCHANGED |
| `app/api/health/route.ts` | Add TTL cache + enhanced latency + uptime | MODIFIED |
| `app/api/agents/route.ts` | Add TTL cache wrapper | MODIFIED |
| `app/api/dashboard/summary/route.ts` | Add TTL cache wrapper | MODIFIED |
| `app/projects/error.tsx` | Error boundary fallback for /projects/* | NEW |
| `app/tasks/error.tsx` | Error boundary fallback for /tasks/* | NEW |
| `app/agents/error.tsx` | Error boundary fallback for /agents/* | NEW |
| `tests/playwright.config.ts` | Test configuration: baseURL, reporter, chromium | NEW (at repo root) |
| `tests/pages/` | Page Object Model classes | NEW |
| `tests/e2e/` | 15 E2E spec files | NEW |
| `tests/api/` | 7 API spec files | NEW |

## Recommended Project Structure

```
/home/deskmath/docflow/
├── tests/                            # Playwright (host-only, devDep)
│   ├── playwright.config.ts
│   ├── pages/                        # Page Object Model
│   │   ├── ProjectsPage.ts
│   │   ├── TasksPage.ts
│   │   ├── AgentsPage.ts
│   │   ├── CatBotPanel.ts
│   │   └── SettingsPage.ts
│   ├── e2e/                          # UI specs
│   │   ├── projects.spec.ts
│   │   ├── tasks.spec.ts
│   │   ├── agents.spec.ts
│   │   ├── catbot.spec.ts
│   │   ├── canvas.spec.ts
│   │   └── ...
│   └── api/                          # API specs (Playwright request API)
│       ├── projects-api.spec.ts
│       ├── health-api.spec.ts
│       └── ...
│
app/src/
├── lib/
│   ├── db.ts                        # EXISTING — unchanged
│   ├── utils.ts                     # EXISTING — unchanged
│   └── services/
│       ├── llm.ts                   # EXISTING — unchanged
│       ├── llm-stream.ts            # NEW — streaming variant
│       ├── retry.ts                 # NEW — withRetry utility
│       ├── cache.ts                 # NEW — in-memory TTL cache
│       ├── logger.ts                # NEW — structured file logger
│       ├── usage-tracker.ts         # EXISTING — unchanged
│       ├── catbot-tools.ts          # EXISTING — unchanged
│       ├── task-executor.ts         # MODIFIED — callLLM wrapped in withRetry
│       └── canvas-executor.ts       # MODIFIED — callLLM wrapped in withRetry
│
└── app/
    ├── testing/
    │   └── page.tsx                 # NEW — /testing page
    ├── projects/
    │   └── error.tsx                # NEW — error boundary
    ├── tasks/
    │   └── error.tsx                # NEW — error boundary
    ├── agents/
    │   └── error.tsx                # NEW — error boundary
    └── api/
        └── testing/
            ├── run/route.ts         # NEW — trigger test run
            ├── results/route.ts     # NEW — read JSON report
            ├── logs/route.ts        # NEW — read JSONL logs
            └── generate/route.ts   # NEW — AI spec generation
```

### Structure Rationale

- **tests/ at monorepo root (not inside app/):** Playwright is a devDependency that runs on the host. Placing specs at `app/src` would cause Next.js build to attempt to compile `.spec.ts` files and conflict with the Next.js TypeScript config. Root-level `tests/` avoids all build interference.
- **lib/services/ additions follow existing pattern:** All new utilities (retry, cache, logger, llm-stream) follow the same module pattern as existing services. No dependency injection, no new frameworks — just named exports.
- **Streaming as parallel routes, not replacements:** `/api/catbot/stream` is a new route alongside `/api/catbot/chat`. Background processing (task-executor, canvas-executor) continues using non-streaming `chatCompletion()` because there is no active client connection to stream to.
- **error.tsx per section:** Next.js App Router convention. Co-locating error.tsx with the route segment (e.g. `app/projects/error.tsx`) automatically creates a React Error Boundary for that segment. No class component boilerplate needed.

## Architectural Patterns

### Pattern 1: LLM Streaming via ReadableStream + SSE

**What:** The streaming API route calls LiteLLM with `stream: true`, pipes the SSE response body through a new `ReadableStream`, and returns it as the HTTP response with `Content-Type: text/event-stream`. The client reads chunks via `ReadableStreamDefaultReader` and appends delta tokens to UI state.

**When to use:** CatBot chat and project RAG chat — wherever a user is actively waiting for a response. NOT for background processing (task-executor, canvas-executor run fire-and-forget).

**Trade-offs:** Simple and stateless per request. The CatBot tool-calling loop (up to 3 iterations) must complete synchronously before streaming begins — stream only the final reply, not intermediate tool calls.

**Key gotcha:** The `X-Accel-Buffering: no` header is required to disable nginx proxy buffering inside Docker; without it, chunks accumulate and flush in one burst at the end, negating streaming.

**Example — lib/services/llm-stream.ts:**
```typescript
export async function chatStream(
  litellmUrl: string,
  litellmKey: string,
  model: string,
  messages: ChatMessage[]
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${litellmUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${litellmKey}`,
    },
    body: JSON.stringify({ model, messages, stream: true, max_tokens: 4000 }),
  });

  if (!res.ok) throw new Error(`LiteLLM stream error ${res.status}`);

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const reader = res.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Forward raw SSE chunks — client parses "data: {...}" lines
          controller.enqueue(encoder.encode(decoder.decode(value)));
        }
      } finally {
        controller.close();
      }
    },
  });
}
```

**Example — API route response:**
```typescript
// app/api/catbot/stream/route.ts
const stream = await chatStream(litellmUrl, litellmKey, model, finalMessages);
return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  },
});
```

**Example — Client consumption:**
```typescript
const res = await fetch('/api/catbot/stream', { method: 'POST', body: JSON.stringify(payload) });
const reader = res.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  // Parse SSE lines: "data: {...}\n\n"
  for (const line of chunk.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const json = line.slice(6);
    if (json === '[DONE]') break;
    const delta = JSON.parse(json).choices?.[0]?.delta?.content ?? '';
    setReply(prev => prev + delta);
  }
}
```

### Pattern 2: In-Memory TTL Cache (Map with expiry timestamps)

**What:** A module-level `Map` in `cache.ts` keyed by deterministic cache keys, storing `{ value, expiresAt }`. API routes check the cache before running expensive operations. Cache invalidates on TTL expiry. Resets on server restart (acceptable: single Docker container, no shared state needed).

**When to use:** High-frequency, low-mutation endpoints: `/api/health` (30s), `/api/dashboard/summary` (60s), `/api/agents` (30s), `/api/settings/models` (300s). NOT for processing status, task step results, or anything that must reflect the current second.

**Trade-offs:** Zero infrastructure overhead. No Redis required. Cache is per-process, so if Docker restarts, first request always misses. Completely acceptable for single-user self-hosted deployment.

**Example — lib/services/cache.ts:**
```typescript
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export const ttlCache = {
  get<T>(key: string): T | null {
    const entry = store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { store.delete(key); return null; }
    return entry.value;
  },

  set<T>(key: string, value: T, ttlSeconds: number): void {
    store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  },

  invalidate(key: string): void { store.delete(key); },

  invalidatePrefix(prefix: string): void {
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  },
};
```

**Usage in route:**
```typescript
const CACHE_TTL = 30; // seconds
const cached = ttlCache.get<HealthResponse>('health:status');
if (cached) return NextResponse.json(cached);
const fresh = await fetchAllServiceHealth();
ttlCache.set('health:status', fresh, CACHE_TTL);
return NextResponse.json(fresh);
```

### Pattern 3: withRetry Utility (exponential backoff, no external dependency)

**What:** A generic async wrapper that retries a function on transient failures with exponential backoff + jitter. Applied at the service call level (the `fetch()` to LiteLLM/Qdrant/Ollama), not at the API route handler level.

**When to use:** All `fetch()` calls to external services inside service modules. In `task-executor.ts` and `canvas-executor.ts`, wrap the internal `callLLM()` fetch. In `llm.ts`, wrap individual provider fetch calls. NOT on SQLite operations (synchronous, failures are immediate and unrecoverable at this layer).

**Key rule:** Never retry the entire API route handler — only the specific network call. API routes may have already mutated state on the first attempt.

**Example — lib/services/retry.ts:**
```typescript
interface RetryOptions {
  maxAttempts?: number;       // default: 3
  baseDelayMs?: number;       // default: 300
  maxDelayMs?: number;        // default: 5000
  shouldRetry?: (err: Error) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 300,
    maxDelayMs = 5000,
    shouldRetry = () => true,
  } = opts;
  let lastErr: Error = new Error('Unknown');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err as Error;
      if (attempt === maxAttempts || !shouldRetry(lastErr)) throw lastErr;
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 100,
        maxDelayMs
      );
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
```

**Usage inside task-executor.ts callLLM (additive change):**
```typescript
// Wrap only the fetch(), not the entire callLLM()
const res = await withRetry(
  () => fetch(`${litellmUrl}/v1/chat/completions`, { method: 'POST', ... }),
  {
    maxAttempts: 3,
    shouldRetry: (e) => !e.message.includes('400') && !e.message.includes('401'),
  }
);
```

### Pattern 4: Structured File Logger (JSONL, 7-day rotation)

**What:** `logger.ts` writes JSON log lines to `/app/data/logs/app-YYYY-MM-DD.jsonl` using `fs.appendFileSync`. One file per day. Rotation deletes files older than 7 days on module load. Also mirrors to `console.log/error` for Docker stdout. The `/testing` page reads these files via `/api/testing/logs` to display a live log viewer.

**When to use:** New code uses `log.info/warn/error()`. Existing `console.log/error` calls are not required to migrate immediately — the logger is additive. Priority targets: API route error handlers, service layer errors, catbot tool execution, retry failures.

**Trade-offs:** `fs.appendFileSync` is synchronous but the writes are small (one JSON line per log call). For this single-user app, synchronous writes are acceptable. For high-throughput production, use pino with async transport — not needed here.

**Example — lib/services/logger.ts:**
```typescript
import fs from 'fs';
import path from 'path';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function getLogPath(): string {
  const date = new Date().toISOString().slice(0, 10);
  const logsDir = process['env']['LOGS_PATH'] || '/app/data/logs';
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  return path.join(logsDir, `app-${date}.jsonl`);
}

function rotateOldLogs(): void {
  try {
    const logsDir = process['env']['LOGS_PATH'] || '/app/data/logs';
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    fs.readdirSync(logsDir)
      .filter(f => f.startsWith('app-') && f.endsWith('.jsonl'))
      .forEach(file => {
        if (fs.statSync(path.join(logsDir, file)).mtimeMs < cutoff) {
          fs.unlinkSync(path.join(logsDir, file));
        }
      });
  } catch { /* non-critical */ }
}

rotateOldLogs(); // once per process start

function write(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
  const entry = { ts: new Date().toISOString(), level, msg, ctx };
  try { fs.appendFileSync(getLogPath(), JSON.stringify(entry) + '\n'); } catch { /* ignore */ }
  const consoleFn = level === 'error' ? console.error : console.log;
  consoleFn(`[${level.toUpperCase()}] ${msg}`, ctx ?? '');
}

export const log = {
  info:  (msg: string, ctx?: Record<string, unknown>) => write('info', msg, ctx),
  warn:  (msg: string, ctx?: Record<string, unknown>) => write('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => write('error', msg, ctx),
  debug: (msg: string, ctx?: Record<string, unknown>) => {
    if (process['env']['LOG_LEVEL'] === 'debug') write('debug', msg, ctx);
  },
};
```

### Pattern 5: Playwright Tests — Host-Only, Docker Target

**What:** Playwright is installed as a devDependency in `app/package.json`. All test specs and the config live at the repo root in `tests/`. Tests run on the host against the Docker container at `http://localhost:3500`. Test results (JSON report) are written to `/app/data/test-results/report.json` via a Docker volume mount — making them accessible to the `/api/testing/results` API route inside Docker.

**The trigger problem:** The Next.js server runs inside Docker and cannot exec Playwright (not installed there). The solution is a host-side watch script:
- `/api/testing/run` writes a trigger file to `/app/data/test-trigger/trigger.json`
- A host-side bash script watches the trigger file and runs `npx playwright test`
- Results land in the shared volume at `/app/data/test-results/`
- UI polls `/api/testing/results` (reads from shared volume) every 2 seconds

This keeps Docker lean (no chromium in the image) while enabling in-app test management.

**Example — tests/playwright.config.ts:**
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3500',
    headless: true,
    screenshot: 'only-on-failure',
  },
  reporter: [
    ['json', { outputFile: '../app/data/test-results/report.json' }],
    ['html', { open: 'never', outputFolder: '../app/data/test-results/html' }],
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

**Example — tests/pages/ProjectsPage.ts (POM):**
```typescript
import { Page, Locator } from '@playwright/test';

export class ProjectsPage {
  readonly page: Page;
  readonly newProjectButton: Locator;
  readonly projectCards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newProjectButton = page.getByRole('button', { name: /Nuevo Proyecto/i });
    this.projectCards = page.locator('[data-testid="project-card"]');
  }

  async goto() { await this.page.goto('/projects'); }

  async createProject(name: string) {
    await this.newProjectButton.click();
    await this.page.getByLabel('Nombre').fill(name);
    await this.page.getByRole('button', { name: /Crear/i }).click();
  }
}
```

**Docker volume addition required in docker-compose.yml:**
```yaml
volumes:
  - ./app/data/test-results:/app/data/test-results
  - ./app/data/test-trigger:/app/data/test-trigger
  - ./app/data/logs:/app/data/logs
```

### Pattern 6: Error Boundaries via App Router Convention

**What:** Create `error.tsx` files co-located with route segments. These must be `'use client'` components. Next.js App Router auto-wraps the segment in a React Error Boundary using the exported component as the fallback. The `reset()` prop allows retry without full page reload.

**When to use:** Each major section: `app/projects/error.tsx`, `app/tasks/error.tsx`, `app/agents/error.tsx`, `app/testing/error.tsx`. A root-level `app/error.tsx` catches anything not covered by section-level boundaries.

**Scope limit:** An `error.tsx` does NOT catch errors thrown in the `layout.tsx` of the same segment. For layout errors, use the parent segment's `error.tsx` or `global-error.tsx`.

**Example — app/projects/error.tsx:**
```typescript
'use client';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ProjectsError]', error.message);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p className="text-zinc-400">Algo salió mal en Proyectos.</p>
      <p className="text-sm text-red-400 font-mono text-xs">{error.message}</p>
      <Button onClick={reset} variant="outline" size="sm">Reintentar</Button>
    </div>
  );
}
```

## Data Flow

### Streaming Chat Flow (New)

```
User types message → ChatPanel submits
    ↓
fetch('/api/projects/[id]/stream', { method: 'POST', body: messages })
(or '/api/catbot/stream' for CatBot)
    ↓
[CatBot only] Run tool-calling loop synchronously (max 3 iterations)
    ↓
chatStream(litellmUrl, litellmKey, model, finalMessages)
  → fetch LiteLLM with stream: true
  → pipe response.body through new ReadableStream
    ↓
return new Response(stream, { 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' })
    ↓
Client: response.body.getReader().read() loop
  → parse "data: {...}\n\n" lines → extract choices[0].delta.content
  → setState(prev => prev + delta) → incremental render
    ↓
Stream ends ([DONE] sentinel) → logUsage() called
```

### Test Execution Flow (New)

```
User clicks "Ejecutar Tests" on /testing page
    ↓
POST /api/testing/run { suite: 'e2e' | 'api' | 'all' }
  → writes { suite, requestedAt, status: 'pending' } to /app/data/test-trigger/trigger.json
  → returns { status: 'triggered' }
    ↓
Host watch script (watches trigger.json inotify or polling):
  → reads trigger.json
  → runs: npx playwright test [--grep suite filter]
  → Playwright writes /app/data/test-results/report.json
  → host script updates trigger.json { status: 'complete' }
    ↓
/testing page polls GET /api/testing/results every 2s
  → API reads /app/data/test-results/report.json
  → returns parsed test summary: { total, passed, failed, suites[] }
    ↓
UI renders TestResultsTable with pass/fail per spec
```

### Retry Flow (Transparent to API Route)

```
Task executor calls callLLM() → withRetry(() => fetch(litellmUrl, ...), opts)
    ↓
Attempt 1: 503 LiteLLM (overloaded) → wait 300ms + jitter
Attempt 2: 503 → wait 600ms + jitter
Attempt 3: 200 OK → return result
    ↓
callLLM() returns normally → API route never saw the retry
```

### Cache Flow

```
GET /api/health
    ↓
ttlCache.get('health:status')
    ↓ HIT (< 30s old)
return cached JSON — 0ms additional latency
    ↓ MISS
Promise.allSettled([checkOpenClaw, checkQdrant, checkLiteLLM, checkOllama, checkN8n])
  → each has 5s AbortSignal timeout
  → total: up to 5s parallel
ttlCache.set('health:status', result, 30)
return fresh JSON
```

## Integration Points

### Existing Services — Minimal Change, Maximum Integration

| Service | What Changes | How |
|---------|-------------|-----|
| `llm.ts` chatCompletion() | No change to function signature or behavior | None — streaming is a new parallel function |
| `task-executor.ts` callLLM() | Wrap internal `fetch()` with `withRetry()` | Additive: 3 lines change |
| `canvas-executor.ts` callLLM() | Same — wrap internal `fetch()` | Additive: 3 lines change |
| `/api/catbot/chat/route.ts` | No change — keep as-is for backward compat | None — new `/stream` route is parallel |
| `/api/projects/[id]/chat/route.ts` | No change | None — new `/stream` route is parallel |
| `/api/health/route.ts` | Add ttlCache wrapper + uptime field | ~10 lines added |
| `/api/agents/route.ts` | Add ttlCache wrapper | ~10 lines added |
| `/api/dashboard/summary/route.ts` | Add ttlCache wrapper | ~10 lines added |

### New Volume Mounts Required in docker-compose.yml

| Path in Docker | Host Path | Purpose |
|----------------|-----------|---------|
| `/app/data/logs` | `./app/data/logs` | Structured log files (JSONL) |
| `/app/data/test-results` | `./app/data/test-results` | Playwright JSON + HTML reports |
| `/app/data/test-trigger` | `./app/data/test-trigger` | Trigger file for host→Docker signaling |

The `./app/data` directory is likely already a volume mount for SQLite persistence. Verify existing `docker-compose.yml` before adding.

### Cache TTL Recommendations

| Endpoint | TTL | Rationale |
|----------|-----|-----------|
| `/api/health` | 30s | Service state changes slowly |
| `/api/dashboard/summary` | 60s | Aggregated usage stats — per-minute freshness fine |
| `/api/agents` (list) | 30s | Changes only on create/delete |
| `/api/settings/models` | 300s | Very rarely changes |
| `/api/workers` (list) | 30s | Same as agents |
| `/api/skills` (list) | 30s | Same pattern |

### Retry Configuration per Call Site

| Call Site | maxAttempts | shouldRetry |
|-----------|-------------|-------------|
| `task-executor.ts` callLLM | 3 | Skip 400, 401, 422 |
| `canvas-executor.ts` callLLM | 3 | Skip 400, 401, 422 |
| `catbot/stream` LiteLLM fetch | 2 | Skip 400, 401 (user sees error fast) |
| `ollama.getEmbedding` | 3 | Always retry (Ollama startup slow) |
| `qdrant.search` | 2 | Retry on network errors only |
| `health/route.ts` service checks | Do NOT use retry | AbortSignal.timeout(5s) is sufficient |

## Scaling Considerations

This is a single-user, single-server app. Practical operational concerns only:

| Concern | Risk | Mitigation |
|---------|------|------------|
| Log disk usage growth | Unbounded without rotation | 7-day JSONL rotation keeps at ~50-100MB max |
| Streaming backpressure | Client disconnects, server-side fetch stays open | Use `request.signal` to abort upstream fetch |
| Playwright chromium on host | Chromium uses ~200MB RAM during test run | Limit to 1 concurrent run; trigger file approach serializes runs |
| Cache Map unbounded growth | Varied keys accumulate | Use deterministic fixed key set (not per-user or per-request params) |
| Test report size | Large JSON for many specs | Report covers only latest run; HTML report for full history |
| Retry latency on genuine failures | 3 attempts × growing delay = up to ~5s added | shouldRetry predicate skips permanent errors (4xx) |

## Anti-Patterns

### Anti-Pattern 1: Streaming Background Processing (task-executor / canvas-executor)

**What people do:** Add streaming to task-executor.ts and canvas-executor.ts since they call LiteLLM.

**Why it's wrong:** These executors run fire-and-forget (launched without `await`). There is no persistent client HTTP connection to stream to — the HTTP response already returned `{ started: true }`. The client uses polling, not streaming, for progress.

**Do this instead:** Keep task-executor and canvas-executor with non-streaming `chatCompletion()`. Only add streaming to the interactive chat endpoints where a user actively waits for the full response in real time.

### Anti-Pattern 2: Retry Wrapping Entire API Route Handlers

**What people do:** `withRetry(() => handleRequest(req), { maxAttempts: 3 })` around the whole handler.

**Why it's wrong:** API route handlers may write to SQLite before the network call fails. Retrying the handler causes double-inserts. Also, the HTTP response headers may already be partially flushed.

**Do this instead:** Wrap only the specific `fetch()` call to the external service inside `withRetry()`. Keep all DB writes outside the retry scope.

### Anti-Pattern 3: Playwright Inside Docker

**What people do:** Add playwright and chromium to Dockerfile to allow `/api/testing/run` to spawn tests directly.

**Why it's wrong:** Playwright chromium adds ~500MB to the Docker image. The `node:20-slim` base (Debian) would need many additional system packages (libglib2, libnss3, libasound2, etc.). Increases image size from ~500MB to ~1GB.

**Do this instead:** Keep Playwright on the host (devDependency). Use shared Docker volumes for results. Trigger via host-side watch script that sees the trigger file created by the Next.js API.

### Anti-Pattern 4: Dynamic Cache Keys Based on Request Parameters

**What people do:** `ttlCache.set(\`agents-page-${page}-filter-${filter}\`, data, 30)`.

**Why it's wrong:** An unbounded set of keys is created as users paginate or filter. The Map grows without bound and keys never expire via TTL in practice (different params on every request means each key is set once and ages out after TTL, but the Map fills between restarts).

**Do this instead:** Cache only coarse-grained full-list responses with a fixed key set: `'agents:list'`, `'health:status'`, `'dashboard:summary'`. Filtered/paginated queries bypass the cache and always hit the DB. The DB is SQLite and is fast enough for filtered queries.

### Anti-Pattern 5: One error.tsx for the Entire App

**What people do:** Only add `app/error.tsx` at the root as a global catch-all.

**Why it's wrong:** A root-level boundary catches all errors from all sections, showing one generic fallback for every failure. Users lose context — a failure in tasks shows the same UI as a failure in projects.

**Do this instead:** Add section-specific `error.tsx` files per major route segment. The root `app/error.tsx` remains as the last resort, but section-level boundaries provide more targeted recovery (e.g., retry just the tasks section without losing the sidebar state).

### Anti-Pattern 6: Logger Writing During synchronous SQLite Hot Paths

**What people do:** Call `log.info('Inserted row', { id })` inside a synchronous `db.prepare(...).run()` loop that runs thousands of times.

**Why it's wrong:** `fs.appendFileSync` is synchronous. Calling it inside a tight synchronous loop (like the RAG chunking loop) will serialize file I/O with DB writes and significantly reduce throughput.

**Do this instead:** Log at the route handler level (after the batch is complete), not inside each iteration of bulk operations. For the usage-tracker pattern, maintain the existing non-blocking `try { logUsage(...) } catch {}` convention.

## Sources

- Next.js 14 App Router Error Handling: https://nextjs.org/docs/14/app/building-your-application/routing/error-handling
- Next.js error.js file convention: https://nextjs.org/docs/app/api-reference/file-conventions/error
- Playwright Next.js Testing Guide: https://nextjs.org/docs/pages/guides/testing/playwright
- Playwright Page Object Model: https://www.ideas2it.com/blogs/step-by-step-guide-to-setup-a-comprehensive-playwright-test-automation-framework-using-page-object-model
- LLM Streaming with SSE in Next.js: https://upstash.com/blog/sse-streaming-llm-responses
- Next.js Streaming Discussion: https://github.com/vercel/next.js/discussions/67501
- Exponential Backoff retry pattern: https://bpaulino.com/entries/retrying-api-calls-with-exponential-backoff
- Pino vs Winston structured logging: https://betterstack.com/community/comparisons/pino-vs-winston/
- Codebase direct analysis: `app/src/lib/services/llm.ts`, `catbot-tools.ts`, `usage-tracker.ts`, `task-executor.ts`, `canvas-executor.ts`, `/api/catbot/chat/route.ts`, `/api/projects/[id]/chat/route.ts`, `/api/health/route.ts`

---
*Architecture research for: DoCatFlow v6.0 — Testing Infrastructure + LLM Streaming + Stabilization*
*Researched: 2026-03-12*
