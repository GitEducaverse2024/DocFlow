---
phase: 34-streaming-frontend
plan: 02
subsystem: streaming-frontend
tags: [sse, streaming, catbot, process, tool-calls, stages, markdown]
dependency_graph:
  requires: [34-01]
  provides: [catbot-sse-streaming, process-sse-streaming, catbot-markdown-rendering]
  affects: [catbot-panel, process-panel]
tech_stack:
  added: []
  patterns: [useSSEStream-hook, streamingToolCallsRef-pattern, sse-stage-events, dual-path-streaming-polling]
key_files:
  created: []
  modified:
    - app/src/components/catbot/catbot-panel.tsx
    - app/src/components/process/process-panel.tsx
decisions:
  - CatBot uses streamingToolCallsRef to avoid stale closure in onDone/onError callbacks
  - ProcessPanel branches handleProcess into SSE (local) and JSON+polling (n8n) paths
  - CatBot assistant messages upgraded from whitespace-pre-wrap to ReactMarkdown
metrics:
  duration: 200s
  completed: "2026-03-13T16:50:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 34 Plan 02: CatBot + ProcessPanel SSE Streaming Summary

CatBot streams tokens with tool_call_start/result events and ReactMarkdown; ProcessPanel shows live SSE stage progress with content preview for local processing while keeping n8n polling unchanged.

## What Was Done

### Task 1: Convert CatBotPanel to SSE streaming (71a9dfa)

Replaced CatBotPanel's JSON fetch/response pattern with the shared useSSEStream hook. Key changes:

- **Streaming state**: Added `streamingContent`, `streamingToolCalls`, `activeToolCall` states with corresponding refs to avoid stale closures in SSE callbacks
- **Tool call events**: `onToolCallStart` shows a spinner with the tool name; `onToolCallResult` clears the spinner and adds a checkmark
- **ReactMarkdown upgrade**: Both streaming and historical assistant messages now render with ReactMarkdown + remarkGfm (previously plain `whitespace-pre-wrap`)
- **Stop button**: Send button replaced with red Square stop button during streaming
- **Auto-scroll**: Added `scrollContainerRef` with near-bottom threshold detection (100px), auto-scrolls on `streamingContent`/`streamingToolCalls`/`activeToolCall` changes
- **localStorage safety**: Only final messages (from `onDone`) are added to the messages array. Streaming partials live in separate state that is never persisted
- **Removed `loading` state**: Replaced all references with `isStreaming` from the hook

### Task 2: Convert ProcessPanel to SSE streaming (426aef4)

Added SSE streaming for local processing mode while keeping n8n polling completely unchanged:

- **Dual-path handleProcess**: When `useLocalProcessing` is true, calls `startStream()` with SSE. When false, uses existing JSON fetch + polling path
- **Stage indicators**: Shows current SSE stage (preparando, enviando, generando, guardando) with a pulsing violet dot
- **Live content preview**: During "generando" stage, shows streaming tokens in a scrollable container with ReactMarkdown and `streaming-cursor` CSS class
- **Auto-scroll**: `streamingPreviewRef` scrolls to bottom on content changes
- **Stop button**: "Parar generacion" button with Square icon during streaming; original "Cancelar procesamiento" XCircle button for n8n mode
- **Temporary activeRun**: Sets a placeholder run with `id: 'streaming'` and `status: 'running'` during SSE, updated to `completed`/`failed` on done/error

## Deviations from Plan

None - plan executed exactly as written.

## Verification

1. Build passes with no TypeScript errors
2. All three panels (Chat, CatBot, Process) import and use the shared useSSEStream hook
3. All three panels have the `streaming-cursor` CSS class
4. CatBot uses ReactMarkdown for both streaming and historical messages
5. ProcessPanel n8n polling path unchanged (isPolling + setInterval)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 71a9dfa | CatBotPanel SSE streaming with tool calls + ReactMarkdown |
| 2 | 426aef4 | ProcessPanel SSE streaming with stage events + dual path |
