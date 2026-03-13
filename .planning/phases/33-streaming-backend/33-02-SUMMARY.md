---
phase: 33-streaming-backend
plan: 02
subsystem: streaming
tags: [SSE, streaming, CatBot, process, tool-calls, stage-events]
dependency_graph:
  requires: [streamLiteLLM-helper, SSE-stream-factory]
  provides: [catbot-SSE-streaming, process-SSE-streaming]
  affects: [frontend-catbot, frontend-process-panel]
tech_stack:
  added: []
  patterns: [streaming-tool-call-loop, SSE-stage-events, inline-local-processing]
key_files:
  created: []
  modified:
    - app/src/app/api/catbot/chat/route.ts
    - app/src/app/api/projects/[id]/process/route.ts
decisions:
  - CatBot streaming uses tool_call_start/tool_call_result events between LLM iterations
  - Process streaming only applies to local processing mode, n8n mode unchanged
  - Both routes keep non-streaming JSON fallback for backward compatibility
metrics:
  duration: 271s
  completed: 2026-03-13
---

# Phase 33 Plan 02: Streaming Backend - CatBot + Process SSE Routes Summary

CatBot route streams tokens with tool_call_start/tool_call_result events between multi-iteration LLM tool-calling loops; Process route streams stage events (preparando/enviando/generando/guardando) with token streaming during local LLM generation, preserving n8n JSON mode untouched.

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Convert CatBot route to SSE streaming with tool-call loop | 536afa8 | Streaming path with start/token/tool_call_start/tool_call_result/done events, usage accumulation across iterations |
| 2 | Convert Process route to SSE streaming with stage events | 605db8c | Stage-based SSE events + token streaming for local processing, non-streaming fallback preserved |

## Key Implementation Details

### CatBot Route (445 lines)
- **Streaming path**: When `stream: true` in request body, returns SSE stream via `createSSEStream`
- **Tool-call loop**: Up to 5 iterations; collects tool calls via `onToolCall` callback, executes them between iterations with `tool_call_start`/`tool_call_result` events
- **Sudo handling**: Same sudo gate logic (check `isSudoTool`, `sudoActive`, protected actions) works in streaming mode
- **Usage tracking**: Accumulates `prompt_tokens` + `completion_tokens` across all streaming iterations via `onDone` callback
- **Event sequence**: start -> token* -> tool_call_start -> tool_call_result -> token* -> done

### Process Route (632 lines)
- **Streaming local processing**: When `stream: true` AND `useLocalProcessing`, returns SSE stream with inline processing logic
- **Stage events**: preparando (source reading) -> enviando (LLM send) -> generando (token streaming) -> guardando (file save)
- **Token streaming**: During `generando` phase, tokens stream via `streamLiteLLM` onToken callback
- **DB operations inline**: Run status updates, file save, worker/skill usage counts all happen within the stream handler
- **Non-streaming fallback**: `useLocalProcessing` without `stream` still uses detached `startLocalProcessing()` + JSON response
- **n8n mode**: Completely unchanged regardless of `stream` flag

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused litellmUrl variable in streaming path**
- **Found during:** Task 2 build verification
- **Issue:** `litellmUrl` was declared but never used in the streaming path because `streamLiteLLM` reads the URL from `process.env` internally
- **Fix:** Removed the unused variable declaration
- **Files modified:** app/src/app/api/projects/[id]/process/route.ts
- **Commit:** 605db8c

## Verification Results

1. `npm run build` -- compiled successfully, no errors
2. `export const runtime = 'nodejs'` present in both routes
3. `streamLiteLLM` imported and called in both routes
4. `tool_call_start` event emitted in CatBot route (line 236)
5. Stage events emitted in Process route (lines 385, 431, 505, 506, 573)
6. No `withRetry` usage in either route (confirmed)

## Self-Check: PASSED

- FOUND: app/src/app/api/catbot/chat/route.ts
- FOUND: app/src/app/api/projects/[id]/process/route.ts
- FOUND: commit 536afa8
- FOUND: commit 605db8c
