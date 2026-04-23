---
phase: 33-streaming-backend
plan: 01
subsystem: streaming
tags: [SSE, streaming, LiteLLM, chat-rag, text-event-stream]
dependency_graph:
  requires: []
  provides: [streamLiteLLM-helper, SSE-stream-factory, chat-rag-streaming]
  affects: [catbot-route, process-route, frontend-chat]
tech_stack:
  added: []
  patterns: [SSE-text-event-stream, ReadableStream-factory, index-based-tool-call-accumulation]
key_files:
  created:
    - app/src/lib/services/stream-utils.ts
  modified:
    - app/src/app/api/projects/[id]/chat/route.ts
decisions:
  - streamLiteLLM does NOT use withRetry (streaming LLM calls are not retryable)
  - createSSEStream runs handler in background IIFE so Response returns immediately
  - Chat RAG keeps non-streaming JSON fallback for backward compatibility until Phase 34
metrics:
  duration: 168s
  completed: 2026-03-13
---

# Phase 33 Plan 01: Streaming Backend - streamLiteLLM Helper + Chat RAG SSE Summary

Shared streamLiteLLM helper parsing LiteLLM SSE chunks with tool call accumulation and usage capture; Chat RAG route upgraded to return text/event-stream with token/done/error events when stream=true, falling back to existing JSON response otherwise.

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Create shared streamLiteLLM helper and SSE utilities | d8d57d3 | stream-utils.ts with streamLiteLLM, createSSEStream, sseHeaders exports |
| 2 | Convert Chat RAG route to SSE streaming | f1342fd | Chat route supports stream=true SSE path + non-streaming fallback |

## Key Implementation Details

### stream-utils.ts (190 lines)
- **streamLiteLLM**: Fetches LiteLLM with `stream: true` + `stream_options: { include_usage: true }`, reads via getReader/TextDecoder with buffer splitting, accumulates tool calls by index, captures usage from final chunk
- **createSSEStream**: ReadableStream factory wrapping TextEncoder, emits `event: {name}\ndata: {json}\n\n` format
- **sseHeaders**: Includes `X-Accel-Buffering: no` for Docker/nginx proxy compatibility

### Chat RAG Route Changes
- Added `export const runtime = 'nodejs'` (required for streaming)
- Extracts `stream` boolean from request body alongside `message`
- Streaming path: createSSEStream with start/token/done/error events, sources sent in done event
- Non-streaming path: unchanged from original implementation
- Usage tracking works for both paths via stream_options include_usage

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused variable ESLint error**
- **Found during:** Task 2
- **Issue:** `fullContent` accumulator variable triggered `@typescript-eslint/no-unused-vars` ESLint error, blocking build
- **Fix:** Removed the unused accumulator variable (content is streamed directly via onToken)
- **Files modified:** app/src/app/api/projects/[id]/chat/route.ts
- **Commit:** f1342fd

## Verification Results

1. `npm run build` -- compiled successfully, no errors
2. `export const runtime = 'nodejs'` present in chat route (line 10)
3. `X-Accel-Buffering: no` present in sseHeaders (line 160)
4. `stream_options: { include_usage: true }` present in streamLiteLLM (line 56)
5. No `withRetry` usage in stream-utils.ts (only in documentation comment)

## Self-Check: PASSED

- FOUND: app/src/lib/services/stream-utils.ts
- FOUND: app/src/app/api/projects/[id]/chat/route.ts
- FOUND: .planning/phases/33-streaming-backend/33-01-SUMMARY.md
- FOUND: commit d8d57d3
- FOUND: commit f1342fd
