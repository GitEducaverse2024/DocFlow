# Phase 33: Streaming Backend - Research

**Researched:** 2026-03-13
**Domain:** Server-Sent Events (SSE) streaming via Next.js 14 App Router + LiteLLM OpenAI-compatible streaming
**Confidence:** HIGH

## Summary

Phase 33 converts three existing request-response API routes (Chat RAG, CatBot, Document Processing) into SSE streaming endpoints. All three currently call LiteLLM at port 4000 using the OpenAI-compatible `/v1/chat/completions` API. Adding `stream: true` to these calls returns an `ndjson` stream of `data: {...}` chunks that the server can relay to the browser via `ReadableStream` with `text/event-stream` content type.

The key architectural pattern is: (1) the API route creates a `ReadableStream`, (2) inside its `start(controller)` callback, it calls LiteLLM with `stream: true`, (3) it reads the response body chunk-by-chunk using a `ReadableStream` reader, parsing SSE lines, (4) it forwards each token delta to the browser via `controller.enqueue()`, and (5) the route returns `new Response(stream, { headers })` immediately without awaiting the full generation. The frontend consumes using the standard `fetch` + `response.body.getReader()` pattern.

**Primary recommendation:** Create a shared `streamLiteLLM()` helper in `src/lib/services/stream-utils.ts` that handles the LiteLLM streaming fetch, SSE line parsing, and delta extraction. Each of the three routes uses this helper but wraps it with route-specific logic (RAG context, tool calls, processing stages).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STRM-01 | Chat RAG streams token-by-token (stream: true to LiteLLM, ReadableStream to frontend) | Chat route converted to SSE; shared stream helper parses LiteLLM chunks; frontend reads via getReader() |
| STRM-02 | CatBot streams token-by-token with tool call indicators (icon + spinner during execution) | CatBot route streams text deltas AND emits structured SSE events for tool_calls; multi-iteration tool loop sends progress events between LLM calls |
| STRM-03 | Document processing shows real-time SSE progress (stages: preparando, enviando, generando, guardando) | Process route converted to SSE; emits stage events before/after each phase; LLM generation portion streams tokens; non-LLM stages emit discrete progress events |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 14.2.35 | API routes returning `new Response(ReadableStream)` | Already installed; native SSE support via Web Streams API |
| LiteLLM | (proxy at :4000) | OpenAI-compatible streaming with `stream: true` | Already deployed; returns `data: {"choices":[{"delta":{"content":"..."}}]}` chunks |
| Web Streams API | Built-in Node 20 | `ReadableStream`, `TextDecoder`, `TextEncoder` | No npm dependencies needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| logger.ts | (custom, Phase 32) | Log stream errors/completions | Every stream start/error/complete event |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual SSE parsing | `openai` npm package streaming | Adds 2MB+ dependency for what is 30 lines of parsing code; LiteLLM is OpenAI-compatible so manual parsing is trivial |
| ReadableStream | WebSocket | Out of scope per REQUIREMENTS.md (ReadableStream + polling sufficient for single-user) |

**Installation:**
```bash
# No new packages needed — all built-in APIs
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   └── services/
│       └── stream-utils.ts       # NEW: shared LiteLLM streaming helper
├── app/api/
│   └── projects/[id]/
│       ├── chat/route.ts          # MODIFIED: SSE streaming
│       └── process/route.ts       # MODIFIED: SSE streaming with stage events
│   └── catbot/
│       └── chat/route.ts          # MODIFIED: SSE streaming with tool indicators
```

### Pattern 1: Shared LiteLLM Stream Helper
**What:** A function that calls LiteLLM with `stream: true`, reads the response body, parses SSE lines, and yields token deltas via a callback.
**When to use:** All three streaming endpoints.
**Example:**
```typescript
// src/lib/services/stream-utils.ts
import { logger } from '@/lib/logger';

interface StreamOptions {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  tools?: unknown[];
}

interface StreamCallbacks {
  onToken: (token: string) => void;
  onToolCall?: (toolCall: { id: string; type: string; function: { name: string; arguments: string } }) => void;
  onDone: (usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) => void;
  onError: (error: Error) => void;
}

export async function streamLiteLLM(options: StreamOptions, callbacks: StreamCallbacks): Promise<void> {
  const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
  const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';

  const response = await fetch(`${litellmUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${litellmKey}`,
    },
    body: JSON.stringify({
      ...options,
      stream: true,
      stream_options: { include_usage: true },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LiteLLM stream error (${response.status}): ${errText}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
  // Track partial tool call arguments across chunks
  const toolCallBuffers: Record<number, { id: string; type: string; function: { name: string; arguments: string } }> = {};

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;

          if (delta?.content) {
            callbacks.onToken(delta.content);
          }

          // Handle streamed tool calls
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (tc.id) {
                // New tool call starting
                toolCallBuffers[idx] = {
                  id: tc.id,
                  type: tc.type || 'function',
                  function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' },
                };
              } else if (toolCallBuffers[idx]) {
                // Continuation — append arguments
                toolCallBuffers[idx].function.arguments += tc.function?.arguments || '';
              }
            }
          }

          // Check finish_reason for tool_calls
          if (parsed.choices?.[0]?.finish_reason === 'tool_calls' && callbacks.onToolCall) {
            for (const tc of Object.values(toolCallBuffers)) {
              callbacks.onToolCall(tc);
            }
          }

          // Capture usage from final chunk
          if (parsed.usage) {
            usage = parsed.usage;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
    callbacks.onDone(usage);
  } catch (error) {
    callbacks.onError(error as Error);
  }
}
```

### Pattern 2: SSE Response from Next.js App Router
**What:** Creating a `ReadableStream` that emits SSE-formatted events and returning it as a `Response`.
**When to use:** Every streaming API route.
**Example:**
```typescript
// In any streaming route.ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  // ... validation, context building ...

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Run async work in background — do NOT await this
      (async () => {
        try {
          send('start', { timestamp: Date.now() });

          await streamLiteLLM(options, {
            onToken: (token) => send('token', { content: token }),
            onToolCall: (tc) => send('tool_call', tc),
            onDone: (usage) => {
              send('done', { usage });
              controller.close();
            },
            onError: (error) => {
              send('error', { message: error.message });
              controller.close();
            },
          });
        } catch (error) {
          send('error', { message: (error as Error).message });
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

### Pattern 3: Frontend SSE Consumption
**What:** Using `fetch` + `response.body.getReader()` to read SSE events progressively.
**When to use:** Chat panel, CatBot panel, Process panel.
**Example:**
```typescript
// Frontend streaming consumer
const res = await fetch('/api/projects/${id}/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, stream: true }),
});

const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n\n');
  buffer = lines.pop() || '';

  for (const block of lines) {
    const eventMatch = block.match(/^event: (.+)$/m);
    const dataMatch = block.match(/^data: (.+)$/m);
    if (!eventMatch || !dataMatch) continue;

    const event = eventMatch[1];
    const data = JSON.parse(dataMatch[1]);

    switch (event) {
      case 'token':
        setContent(prev => prev + data.content);
        break;
      case 'tool_call':
        setToolCalls(prev => [...prev, data]);
        break;
      case 'done':
        setIsStreaming(false);
        break;
      case 'error':
        setError(data.message);
        break;
    }
  }
}
```

### Pattern 4: CatBot Tool-Call Streaming Loop
**What:** CatBot has a multi-iteration tool-calling loop (up to 5 iterations). During streaming, each iteration streams the LLM response, then if tool_calls are detected, the stream emits tool execution events, executes tools synchronously, then starts the next LLM call with tool results.
**When to use:** CatBot streaming endpoint only.
**Example event sequence:**
```
event: start
event: token (multiple — first LLM response)
event: tool_call_start { name: "list_projects", id: "call_123" }
event: tool_call_result { id: "call_123", result: {...} }
event: token (multiple — second LLM response after tool results)
event: done { usage: {...} }
```

### Pattern 5: Process SSE Stage Events
**What:** Document processing has distinct stages that are NOT token streaming. The route emits stage progress events alongside token streaming for the LLM generation portion.
**When to use:** Process route only.
**Example event sequence:**
```
event: stage { stage: "preparando", message: "Leyendo fuentes..." }
event: stage { stage: "preparando", message: "3 fuentes cargadas (12KB)" }
event: stage { stage: "enviando", message: "Enviando a LiteLLM..." }
event: stage { stage: "generando", message: "Generando documento..." }
event: token (multiple — the actual LLM output)
event: stage { stage: "guardando", message: "Guardando resultado..." }
event: done { version: 3, runId: "...", truncationWarning: "..." }
```

### Anti-Patterns to Avoid
- **Awaiting the full stream before returning Response:** The `start(controller)` callback must kick off an async IIFE and return immediately. `return new Response(stream)` must happen before any tokens are generated.
- **Using `NextResponse.json()` for streaming:** Must use raw `new Response(stream, { headers })` — NextResponse would buffer the entire response.
- **Forgetting `runtime = 'nodejs'`:** Without this export, Next.js might use the Edge runtime which has different streaming behavior.
- **Forgetting `X-Accel-Buffering: no`:** Docker/nginx proxies buffer SSE by default, causing all tokens to arrive at once.
- **Using `withRetry` on streaming calls:** The retry utility wraps idempotent calls. LLM streaming is NOT idempotent and should NOT be retried automatically (per STATE.md decision: "withRetry applies ONLY to idempotent calls -- NOT LLM generation").

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE line parsing from LiteLLM | Custom regex per route | Shared `streamLiteLLM()` helper | Parsing `data: {...}` lines with buffer management is error-prone; one helper, three consumers |
| SSE event formatting to browser | Raw string concatenation | Helper `send(event, data)` closure | Consistent `event: X\ndata: {...}\n\n` formatting; avoids missing double-newline bugs |
| Tool call argument accumulation | Per-route tool parsing | Accumulator in `streamLiteLLM()` | LiteLLM streams tool_call arguments in fragments across multiple chunks; buffer logic is non-trivial |

**Key insight:** The LiteLLM SSE format follows the OpenAI specification exactly. Token content arrives in `choices[0].delta.content`, tool calls arrive in `choices[0].delta.tool_calls` with incremental argument strings, and the final chunk contains `usage` data. One parser handles all three routes.

## Common Pitfalls

### Pitfall 1: Buffer Boundary Splitting
**What goes wrong:** SSE data lines get split across `reader.read()` chunks at arbitrary byte boundaries, cutting JSON in half.
**Why it happens:** Network/OS delivers data in variable-sized chunks unrelated to SSE line boundaries.
**How to avoid:** Always maintain a string buffer, split by `\n`, and keep the last incomplete segment for the next iteration.
**Warning signs:** Sporadic JSON parse errors in production logs, especially with longer responses.

### Pitfall 2: Stream Not Closing on Error
**What goes wrong:** If the LiteLLM call throws before streaming starts (e.g., 400 bad model), the ReadableStream never closes, browser hangs.
**Why it happens:** The error occurs inside the async IIFE in `start()` but nobody calls `controller.close()`.
**How to avoid:** Wrap the entire async IIFE in try/catch, always call `controller.close()` in both success and error paths.
**Warning signs:** Browser connection stays open indefinitely, loading spinner never stops.

### Pitfall 3: Usage Tracking Broken by Streaming
**What goes wrong:** The current routes extract `data.usage` from the JSON response body. With streaming, usage arrives in the final SSE chunk (or not at all if not requested).
**Why it happens:** OpenAI streaming does not include usage by default; you must pass `stream_options: { include_usage: true }`.
**How to avoid:** Always include `stream_options: { include_usage: true }` in the LiteLLM request body. Capture usage from the final chunk and call `logUsage()` after stream completes.
**Warning signs:** Usage tracking shows 0 tokens for all streaming calls.

### Pitfall 4: CatBot Tool Loop Complexity
**What goes wrong:** CatBot's current loop makes up to 5 sequential LLM calls with tool results. Streaming makes this significantly more complex because each iteration must stream independently, and tool execution happens between iterations.
**Why it happens:** Tool calls require synchronous execution before the next LLM call can proceed.
**How to avoid:** Design the SSE protocol with explicit `tool_call_start` and `tool_call_result` events. The frontend shows a spinner during tool execution. Each LLM iteration streams normally.
**Warning signs:** Tokens from different iterations blending together without clear tool call boundaries.

### Pitfall 5: Process Route Dual Mode (n8n vs Local)
**What goes wrong:** The current process route has two paths: n8n webhook (async, returns immediately) and local processing (also async). Only local processing can stream.
**Why it happens:** n8n webhook processing is external and cannot be streamed.
**How to avoid:** Only stream when `useLocalProcessing` is true. For n8n mode, return a regular JSON response (existing behavior). The frontend must handle both modes.
**Warning signs:** Attempting to stream n8n processing creates an empty SSE stream that never emits tokens.

### Pitfall 6: Env Var Bracket Notation
**What goes wrong:** Using `process.env.LITELLM_URL` instead of `process['env']['LITELLM_URL']` causes webpack to inline the value at build time (undefined in Docker).
**Why it happens:** Next.js webpack plugin replaces `process.env.X` at build time.
**How to avoid:** Always use bracket notation per project convention: `process['env']['VARIABLE']`.
**Warning signs:** Streaming works in dev but fails in Docker with connection errors to undefined URLs.

## Code Examples

### LiteLLM Streaming Request Format
```typescript
// Source: OpenAI API specification (LiteLLM is compatible)
const response = await fetch(`${litellmUrl}/v1/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${litellmKey}`,
  },
  body: JSON.stringify({
    model: 'gemini-main',
    messages: [
      { role: 'system', content: '...' },
      { role: 'user', content: '...' },
    ],
    stream: true,
    stream_options: { include_usage: true },
  }),
});
// Response body is a stream of:
// data: {"id":"...","choices":[{"delta":{"content":"Hello"},"index":0}]}
// data: {"id":"...","choices":[{"delta":{"content":" world"},"index":0}]}
// data: {"id":"...","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}
// data: [DONE]
```

### SSE Headers for Next.js App Router
```typescript
// Source: Next.js docs + project constraints
return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',  // Critical for Docker/nginx
  },
});
```

### Route Exports Required
```typescript
// Both MUST be present on every streaming route
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Full JSON response after generation | SSE streaming with ReadableStream | This phase | First token arrives in <2s vs 5-30s for full generation |
| `NextResponse.json()` for LLM responses | `new Response(ReadableStream)` for LLM responses | This phase | Enables progressive rendering |
| Polling process status every 3s | SSE stage events + token streaming | This phase (local processing only) | Real-time progress instead of periodic checks |

**Deprecated/outdated:**
- The `openai` npm package's streaming helpers are not needed — LiteLLM returns standard SSE that can be parsed with 30 lines of code
- `eventsource` polyfill is not needed — all modern browsers support `fetch` + `ReadableStream`

## Open Questions

1. **CatBot streaming with tool calls: should the route fall back to non-streaming for tool-heavy conversations?**
   - What we know: Tool calls require sequential LLM calls. Streaming each iteration is possible but adds protocol complexity.
   - What's unclear: Whether the LLM model reliably streams tool_call deltas (some models may not).
   - Recommendation: Stream always. If a model returns tool_calls without streaming them as deltas, detect via `finish_reason: 'tool_calls'` in a non-delta chunk and handle gracefully.

2. **Should the process route switch from polling to SSE for n8n mode too?**
   - What we know: n8n processing is external and cannot stream tokens.
   - What's unclear: N/A — this is clearly out of scope.
   - Recommendation: Only stream for `useLocalProcessing: true`. Keep polling for n8n mode. The frontend detects mode from the initial response.

3. **Usage tracking accuracy with streaming**
   - What we know: `stream_options: { include_usage: true }` is an OpenAI extension. LiteLLM supports it for most providers.
   - What's unclear: Whether all LiteLLM-proxied models support `stream_options`.
   - Recommendation: Always request it, but handle missing usage gracefully (log a warning, record 0 tokens).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual validation (Playwright not yet installed — Phase 36) |
| Config file | none |
| Quick run command | `curl -N -X POST http://localhost:3500/api/projects/{id}/chat -H 'Content-Type: application/json' -d '{"message":"test","stream":true}'` |
| Full suite command | Manual browser DevTools Network tab verification |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STRM-01 | Chat RAG streams tokens | manual | `curl -N -X POST http://localhost:3500/api/projects/{id}/chat ...` | N/A |
| STRM-02 | CatBot streams with tool indicators | manual | `curl -N -X POST http://localhost:3500/api/catbot/chat ...` | N/A |
| STRM-03 | Process shows SSE stage progress | manual | `curl -N -X POST http://localhost:3500/api/projects/{id}/process ...` | N/A |

### Sampling Rate
- **Per task commit:** Manual curl test against running Docker instance
- **Per wave merge:** Browser DevTools Network tab check for all 3 endpoints
- **Phase gate:** All 4 success criteria verified in browser

### Wave 0 Gaps
None — no test infrastructure needed for this phase (manual validation only; automated testing comes in Phase 36).

## Sources

### Primary (HIGH confidence)
- OpenAI API streaming specification — SSE format with `data:` lines, `[DONE]` terminator, `stream_options` for usage
- Next.js 14 App Router documentation — `new Response(ReadableStream)` pattern for streaming routes
- Project codebase — actual route implementations, LiteLLM service, logger module

### Secondary (MEDIUM confidence)
- LiteLLM documentation — OpenAI-compatible streaming support, `stream_options: { include_usage: true }` support

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies; all built-in Web Streams API + existing LiteLLM proxy
- Architecture: HIGH - Pattern is well-established (ReadableStream + SSE); all three routes follow same template
- Pitfalls: HIGH - Based on direct code review of existing routes; buffer splitting and error handling are universal SSE concerns

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable — Web Streams API and SSE are mature standards)
