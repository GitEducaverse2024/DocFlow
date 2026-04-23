---
phase: 34-streaming-frontend
plan: 01
subsystem: streaming-frontend
tags: [sse, streaming, chat, hooks, css]
dependency_graph:
  requires: [33-01, 33-02]
  provides: [useSSEStream-hook, streaming-cursor-css, chat-sse-integration]
  affects: [chat-panel, globals-css]
tech_stack:
  added: []
  patterns: [rAF-batching, AbortController-streams, SSE-event-parsing]
key_files:
  created:
    - app/src/hooks/use-sse-stream.ts
  modified:
    - app/src/app/globals.css
    - app/src/components/chat/chat-panel.tsx
decisions:
  - "rAF batching limits onToken state updates to ~60/s max, preventing React render thrashing"
  - "Streaming cursor uses CSS ::after pseudo-element, not appended character, to avoid markdown interference"
  - "streamingContentRef avoids stale closure in onDone/onError callbacks"
  - "Auto-scroll uses instant scrollTop assignment (not smooth) to prevent lag during rapid token arrival"
metrics:
  duration: 130s
  completed: 2026-03-13
---

# Phase 34 Plan 01: SSE Hook + ChatPanel Streaming Summary

Shared useSSEStream hook with rAF-batched token dispatch, CSS blinking cursor, and ChatPanel converted from JSON fetch to progressive SSE streaming with stop button and auto-scroll.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create useSSEStream hook and streaming cursor CSS | 1ae6643 | use-sse-stream.ts, globals.css |
| 2 | Convert ChatPanel to SSE streaming | 0edac16 | chat-panel.tsx |

## Key Implementation Details

### useSSEStream Hook (use-sse-stream.ts)
- Parses SSE `event:` / `data:` line protocol from POST endpoints
- Supports all backend event types: start, token, tool_call_start, tool_call_result, stage, done, error
- requestAnimationFrame batching accumulates tokens and flushes at ~60fps max
- AbortController for user-initiated stop (suppresses AbortError from onError)
- Cleanup on unmount prevents orphaned streams
- Options stored in ref to avoid stale closures

### Streaming Cursor CSS (globals.css)
- `@keyframes streaming-blink` with 0.8s step-end animation
- `.streaming-cursor::after` pseudo-element with U+2588 block character in violet-400
- Applied only when streamingContent is non-empty (not during "Pensando..." state)

### ChatPanel Conversion (chat-panel.tsx)
- Replaced `async fetch -> res.json()` with `useSSEStream` hook
- `streamingContent` state + `streamingContentRef` for progressive rendering
- Stop button ("Parar generacion") with Square icon, red styling, calls `stop()`
- Auto-scroll with `shouldAutoScroll` ref (100px near-bottom threshold)
- Progressive markdown via ReactMarkdown on streaming content
- `isLoading` state fully removed, replaced by `isStreaming` from hook
- `Loader2` import removed

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- TypeScript `tsc --noEmit` passes with zero errors
- `npm run build` completes successfully
- All verification criteria met:
  - useSSEStream exports start/stop/isStreaming
  - globals.css contains streaming-blink keyframes and streaming-cursor class
  - chat-panel.tsx imports useSSEStream, uses streaming-cursor class, has stop button
  - No isLoading state in chat-panel.tsx
