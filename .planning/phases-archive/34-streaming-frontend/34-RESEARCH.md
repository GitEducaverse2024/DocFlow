# Phase 34: Streaming Frontend - Research

**Researched:** 2026-03-13
**Domain:** SSE consumption, progressive markdown rendering, streaming UX patterns
**Confidence:** HIGH

## Summary

Phase 34 transforms three existing frontend components (ChatPanel, CatBotPanel, ProcessPanel) from JSON-response consumers into SSE stream consumers. The backend SSE infrastructure is fully operational from Phase 33 -- all three routes (`/api/projects/[id]/chat`, `/api/catbot/chat`, `/api/projects/[id]/process`) already support `stream: true` in the request body and emit `text/event-stream` responses with event types: `start`, `token`, `tool_call_start`, `tool_call_result`, `stage`, `done`, `error`.

The frontend work is purely client-side: parse SSE events via `fetch` + `getReader()` (not EventSource, since we need POST), accumulate tokens into React state, render progressive markdown with `react-markdown` (already installed v10.1.0 + remark-gfm), add a blinking cursor CSS animation, wire an AbortController for stop functionality, and auto-scroll with a ref. No new npm packages are needed.

**Primary recommendation:** Create a shared `useSSEStream` hook that handles fetch-with-reader, SSE line parsing, AbortController, and callbacks -- then use it in all three panels. This avoids duplicating SSE parsing logic across ChatPanel, CatBotPanel, and ProcessPanel.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STRM-04 | Blinking cursor U+2588 during streaming (CSS blink 0.8s) | CSS `@keyframes blink` in globals.css, append cursor char to streaming content, remove on done |
| STRM-05 | "Parar generacion" button stops streaming immediately | AbortController on fetch, `controller.abort()` on click, cleanup state on abort |
| STRM-06 | Auto-scroll follows latest token during streaming | `scrollIntoView` on container bottom ref, triggered by content state updates via useEffect |
| STRM-07 | Progressive markdown rendering during streaming | react-markdown v10.1.0 already installed, re-renders on every state update with accumulated content |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-markdown | 10.1.0 | Markdown-to-React rendering | Already in use in ChatPanel and ProcessPanel |
| remark-gfm | 4.0.1 | GFM tables, strikethrough, task lists | Already in use alongside react-markdown |
| React 18 | 18.x | UI framework | Project standard |
| Tailwind CSS | 3.x | Styling + animations | Project standard |

### No New Dependencies Needed
The browser Fetch API + ReadableStream reader provides SSE parsing. No EventSource polyfill or streaming library is needed because:
- We use POST requests (EventSource only supports GET)
- The SSE format is simple (`event: X\ndata: Y\n\n`)
- A shared hook can parse this in ~40 lines

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual fetch+reader SSE parsing | `eventsource-parser` npm package | Adds dependency for ~40 lines of code we can write; our SSE format is simple |
| react-markdown for streaming | `marked` + `DOMPurify` for manual HTML | react-markdown already installed and works fine with frequent re-renders |

## Architecture Patterns

### Shared Hook: useSSEStream

**What:** A custom React hook that manages SSE consumption from POST endpoints.
**When to use:** Every component that consumes streaming from the Phase 33 SSE backends.

```typescript
// app/src/hooks/use-sse-stream.ts
interface UseSSEStreamOptions {
  onToken: (token: string) => void;
  onToolCallStart?: (data: { name: string }) => void;
  onToolCallResult?: (data: { name: string; result: unknown }) => void;
  onStage?: (data: { stage: string; message: string }) => void;
  onDone: (data: unknown) => void;
  onError: (error: Error) => void;
}

interface UseSSEStreamReturn {
  start: (url: string, body: Record<string, unknown>) => void;
  stop: () => void;
  isStreaming: boolean;
}
```

**Key implementation details:**
1. Uses `fetch()` with `{ method: 'POST', signal: abortController.signal }`
2. Reads response body via `response.body.getReader()` + `TextDecoder`
3. Splits buffer on `\n`, parses `event:` and `data:` lines
4. Calls appropriate callback per event type
5. `stop()` calls `abortController.abort()` which immediately terminates the stream
6. Tracks `isStreaming` state for UI conditionals

### SSE Event Protocol (from Phase 33 backend)

| Event | Data Shape | Emitted By |
|-------|-----------|------------|
| `start` | `{}` | All three routes |
| `token` | `{ token: string }` | Chat RAG, CatBot, Process |
| `tool_call_start` | `{ name: string }` | CatBot only |
| `tool_call_result` | `{ name: string, result: unknown }` | CatBot only |
| `stage` | `{ stage: string, message: string }` | Process only |
| `done` | `{ sources?: [], usage?: {}, reply?: string }` | All three routes |
| `error` | `{ message: string }` | All three routes |

### Cursor Implementation Pattern

**What:** Blinking block cursor (U+2588) appended to streaming text via CSS.
**Implementation:**

```css
/* globals.css */
@keyframes streaming-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.streaming-cursor::after {
  content: '\2588';
  animation: streaming-blink 0.8s step-end infinite;
}
```

The cursor is applied via a CSS class on the streaming message container, not by appending the character to the content string. This keeps the markdown content clean for rendering and avoids the cursor interfering with code blocks or other markdown structures.

### Stop Button Pattern

**What:** "Parar generacion" button visible only during active streaming.
**Implementation:**
- The `stop()` function from `useSSEStream` calls `abortController.abort()`
- This throws an `AbortError` in the fetch reader loop, which the hook catches and handles gracefully
- On abort: set `isStreaming = false`, keep accumulated content, remove cursor class
- Button appears conditionally: `{isStreaming && <Button onClick={stop}>...`}

### Auto-scroll Pattern

**What:** Scroll container follows content during streaming.
**Implementation:**
- Use a `useEffect` that fires when the accumulated content changes
- Check if user has scrolled up (is NOT at bottom) -- if so, do NOT auto-scroll (respect user intent)
- If at bottom, `scrollIntoView({ behavior: 'instant' })` on the bottom sentinel ref
- Use `behavior: 'instant'` not `'smooth'` during streaming to avoid scroll lag with rapid token updates

```typescript
const isNearBottom = (container: HTMLElement) => {
  const threshold = 100; // px
  return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
};
```

### Component Modification Pattern

Each panel follows the same transformation:

1. **Add streaming state:** `const [streamingContent, setStreamingContent] = useState('')`
2. **Add hook:** `const { start, stop, isStreaming } = useSSEStream({...callbacks})`
3. **Modify send handler:** Instead of `await fetch(...).then(r => r.json())`, call `start(url, body)` with `stream: true` in body
4. **Modify message rendering:** During streaming, render the accumulating `streamingContent` with ReactMarkdown + cursor class; on `done`, convert to a final message
5. **Add stop button:** Visible when `isStreaming` is true
6. **Keep JSON fallback:** The backend supports both modes; if streaming fails, the component could fall back

### Anti-Patterns to Avoid
- **Appending cursor character to content string:** This breaks markdown rendering (cursor appears inside code blocks, disrupts list formatting). Use CSS `::after` pseudo-element instead.
- **Using EventSource API:** Only supports GET requests. Our endpoints require POST with JSON body.
- **Smooth scrolling during streaming:** Creates janky lag when tokens arrive faster than smooth scroll animation. Use `behavior: 'instant'`.
- **Re-creating AbortController on every render:** Create it once in the hook, replace only when starting a new stream.
- **Storing each token as separate state update:** Accumulate tokens in a ref, then batch-update state (e.g., via requestAnimationFrame or a small throttle) to avoid 100+ re-renders per second.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown rendering | Custom parser | react-markdown 10.1.0 (already installed) | Handles edge cases (nested code, tables, XSS) |
| GFM extensions | Manual regex | remark-gfm 4.0.1 (already installed) | Tables, strikethrough, task lists for free |
| Request cancellation | Manual XMLHttpRequest | AbortController (browser built-in) | Standard, clean, works with fetch |

## Common Pitfalls

### Pitfall 1: React State Thrashing from Token-per-Render
**What goes wrong:** Each SSE token triggers a setState, causing 50-100+ re-renders per second. ReactMarkdown re-parses markdown on every render.
**Why it happens:** LLM tokens arrive very frequently (every 20-50ms).
**How to avoid:** Accumulate tokens in a `useRef`, then update state via `requestAnimationFrame` or a 50ms throttle. This batches updates to ~20/second max.
**Warning signs:** UI becomes sluggish during streaming, browser DevTools shows high render count.

### Pitfall 2: Incomplete SSE Lines in Buffer
**What goes wrong:** SSE data arrives in arbitrary chunks from the network. A chunk may split mid-line (`event: tok` + `en\ndata: ...`).
**Why it happens:** ReadableStream chunks don't align with SSE message boundaries.
**How to avoid:** Keep a buffer string. Only process complete lines (split on `\n`, keep last incomplete segment for next chunk). This is the same pattern used in `stream-utils.ts` on the backend.
**Warning signs:** JSON parse errors in console, missing tokens.

### Pitfall 3: Scroll Jank from Fighting User Intent
**What goes wrong:** User scrolls up to read earlier content, auto-scroll forces them back to bottom.
**Why it happens:** Unconditional `scrollIntoView` on every token.
**How to avoid:** Check if scroll position is near bottom before auto-scrolling. Only auto-scroll if user hasn't manually scrolled up.
**Warning signs:** User reports being unable to read earlier messages during streaming.

### Pitfall 4: Cursor Inside Markdown Structures
**What goes wrong:** If the cursor character is part of the content string, it appears inside code blocks, headers, or list items.
**Why it happens:** react-markdown parses the full string including the cursor character.
**How to avoid:** Use CSS `::after` pseudo-element on the wrapper, not a character in the content.
**Warning signs:** Cursor appears inside `<code>` blocks or at wrong positions.

### Pitfall 5: AbortError Not Handled Gracefully
**What goes wrong:** Clicking "Parar generacion" causes an uncaught error toast or console error.
**Why it happens:** `fetch` throws `AbortError` when signal is aborted, and the catch block treats it as a real error.
**How to avoid:** In the catch block, check `if (error.name === 'AbortError') return;` before showing error UI.
**Warning signs:** Error messages appearing when user intentionally stops generation.

### Pitfall 6: CatBot Message History Breaking Streaming
**What goes wrong:** CatBot stores messages to localStorage. If streaming content is saved mid-stream, reopening the panel shows partial messages.
**Why it happens:** CatBot's `saveMessages` effect fires on every state change including partial streaming content.
**How to avoid:** Only add the final message to the messages array on `done` event, not during streaming. Keep streaming content in a separate state variable that is NOT part of the messages array.
**Warning signs:** Partial messages appearing after page refresh.

## Code Examples

### SSE Parsing in Browser (fetch + reader)

```typescript
// Core SSE consumption pattern (simplified from hook)
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...body, stream: true }),
  signal: abortController.signal,
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // Keep incomplete line

  let currentEvent = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('event: ')) {
      currentEvent = trimmed.slice(7);
    } else if (trimmed.startsWith('data: ')) {
      const data = JSON.parse(trimmed.slice(6));
      // Dispatch based on currentEvent
      switch (currentEvent) {
        case 'token': onToken(data.token); break;
        case 'done': onDone(data); break;
        case 'error': onError(new Error(data.message)); break;
        // ... other events
      }
    }
  }
}
```

### Throttled State Updates

```typescript
// Accumulate in ref, flush to state via rAF
const contentRef = useRef('');
const rafRef = useRef<number>(0);

const onToken = (token: string) => {
  contentRef.current += token;
  if (!rafRef.current) {
    rafRef.current = requestAnimationFrame(() => {
      setStreamingContent(contentRef.current);
      rafRef.current = 0;
    });
  }
};
```

### Auto-scroll with User Intent Detection

```typescript
const scrollContainerRef = useRef<HTMLDivElement>(null);
const shouldAutoScroll = useRef(true);

// Track user scroll position
const handleScroll = () => {
  const el = scrollContainerRef.current;
  if (!el) return;
  const threshold = 100;
  shouldAutoScroll.current =
    el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
};

// Auto-scroll on content change
useEffect(() => {
  if (shouldAutoScroll.current && scrollContainerRef.current) {
    scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
  }
}, [streamingContent]);
```

### CSS Cursor Animation

```css
@keyframes streaming-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.streaming-cursor::after {
  content: '\2588';
  animation: streaming-blink 0.8s step-end infinite;
  color: theme('colors.violet.400');
  margin-left: 1px;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| EventSource API for SSE | fetch + getReader for POST SSE | Always (EventSource is GET-only) | Must use fetch reader pattern |
| react-markdown v8 (ESM issues) | react-markdown v10.1.0 (clean ESM) | 2024 | Already installed, no issues |
| Append char cursor to string | CSS ::after pseudo-element cursor | Common pattern since 2023 ChatGPT-style UIs | Cleaner, no markdown interference |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Not yet installed (Phase 36) |
| Config file | none -- see Wave 0 |
| Quick run command | `npm run build` (build verification only) |
| Full suite command | N/A until Phase 36 |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STRM-04 | Blinking cursor during streaming | manual + future E2E-06 | `npm run build` (compile check) | N/A -- Wave 0 |
| STRM-05 | Stop button halts streaming | manual + future E2E-06 | `npm run build` (compile check) | N/A -- Wave 0 |
| STRM-06 | Auto-scroll follows tokens | manual | Visual verification | N/A -- Wave 0 |
| STRM-07 | Progressive markdown rendering | manual + future E2E-06 | `npm run build` (compile check) | N/A -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd ~/docflow/app && npm run build`
- **Per wave merge:** Manual browser verification with DevTools Network tab
- **Phase gate:** All four STRM requirements verified manually in browser

### Wave 0 Gaps
None -- no test infrastructure exists yet (Phase 36). Build verification is the automated gate.

## Existing Code Analysis

### Files to Modify

| File | Current State | Changes Needed |
|------|---------------|----------------|
| `app/src/components/chat/chat-panel.tsx` (198 lines) | Uses `fetch().then(r => r.json())`, no streaming | Add SSE consumption, streaming state, cursor, stop button, auto-scroll |
| `app/src/components/catbot/catbot-panel.tsx` (638 lines) | Uses `fetch().then(r => r.json())`, no streaming | Add SSE consumption with tool call events, streaming state, cursor, stop button |
| `app/src/components/process/process-panel.tsx` (~900 lines) | Uses `fetch().then(r => r.json())` + polling | Add SSE consumption with stage events, live content preview during generation |
| `app/src/app/globals.css` | No streaming animations | Add `@keyframes streaming-blink` and `.streaming-cursor` class |

### Files to Create

| File | Purpose |
|------|---------|
| `app/src/hooks/use-sse-stream.ts` | Shared SSE consumption hook with AbortController |

### Key Observations from Current Code

1. **ChatPanel** already has `scrollToBottom()` and `messagesEndRef` -- just needs to be enhanced for streaming
2. **ChatPanel** already uses ReactMarkdown + remarkGfm for bot messages -- progressive rendering will work by re-rendering on state change
3. **CatBotPanel** does NOT use ReactMarkdown -- it uses plain `<span className="whitespace-pre-wrap">` for content. Should add ReactMarkdown for CatBot too, or keep simple if messages are short
4. **CatBotPanel** has complex tool_call rendering inline -- streaming tool calls need to appear as they happen (tool_call_start shows spinner, tool_call_result shows result)
5. **ProcessPanel** uses polling (`setIsPolling(true)`) for process status -- streaming replaces this with live SSE for local processing mode
6. **All three** keep JSON fallback on backend, so non-streaming path remains as safety net

## Open Questions

1. **CatBot markdown rendering**
   - What we know: CatBot currently renders plain text with `whitespace-pre-wrap`, not ReactMarkdown
   - What's unclear: Should CatBot get ReactMarkdown too, or is plain text fine for its typically shorter responses?
   - Recommendation: Add ReactMarkdown to CatBot for consistency -- LLM responses can contain markdown regardless of context

2. **Process panel streaming scope**
   - What we know: Process SSE only works for local processing mode (not n8n)
   - What's unclear: Should the n8n path remain polling-only or show a message explaining no live streaming?
   - Recommendation: Keep n8n as-is with polling; add a subtle indicator that live streaming is only available for local processing

## Sources

### Primary (HIGH confidence)
- Phase 33 summaries (33-01-SUMMARY.md, 33-02-SUMMARY.md) -- SSE event protocol, backend implementation
- stream-utils.ts source code -- exact SSE format: `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`
- chat-panel.tsx, catbot-panel.tsx, process-panel.tsx source code -- current frontend state
- package.json -- react-markdown 10.1.0, remark-gfm 4.0.1 confirmed installed

### Secondary (MEDIUM confidence)
- react-markdown v10 works with frequent re-renders for streaming (standard pattern since ChatGPT-style UIs became common)
- requestAnimationFrame batching for token throttling (widely documented React pattern)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed, versions confirmed from package.json
- Architecture: HIGH - SSE parsing pattern is well-established, hook pattern is standard React
- Pitfalls: HIGH - these are well-known problems from streaming chat UI implementations
- Code examples: HIGH - based on actual backend code (stream-utils.ts) and existing frontend components

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable domain, no fast-moving dependencies)
