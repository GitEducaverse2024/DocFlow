---
phase: 02-real-time-rag-indexing-progress
plan: 01
subsystem: rag-indexing-progress
tags: [rag, progress-bar, ui, real-time]
dependency_graph:
  requires: []
  provides: [chunksProcessed-chunksTotal-chain, visual-progress-bar]
  affects: [rag-panel, rag-worker, rag-jobs, rag-status-endpoint, rag-create-endpoint]
tech_stack:
  added: []
  patterns: [structured-status-propagation, polling-with-progress-data]
key_files:
  created: []
  modified:
    - app/scripts/rag-worker.mjs
    - app/src/lib/services/rag-jobs.ts
    - app/src/app/api/projects/[id]/rag/status/route.ts
    - app/src/app/api/projects/[id]/rag/create/route.ts
    - app/src/components/rag/rag-panel.tsx
decisions:
  - Used inline progress bar within existing card layout rather than separate component
  - Toast message updated to show "vectores indexados" for clarity
metrics:
  duration: 131s
  completed: "2026-03-11T13:48:00Z"
---

# Phase 2 Plan 1: RAG Indexing Progress Bar Summary

Structured progress data (chunksProcessed/chunksTotal) propagated through entire RAG chain: worker writes to status file, create route reads and passes to job tracker, status endpoint returns to frontend, rag-panel renders visual progress bar with percentage.

## What Was Done

### Task 1: Worker structured progress (a96642e)
Modified `rag-worker.mjs` to write `chunksProcessed` and `chunksTotal` in every `writeStatus` call during the embedding loop. Status messages updated to Spanish ("Generando embedding X/Y..."). Chunking phase reports chunksTotal=0 until chunks are generated, then updates with actual count.

### Task 2: Backend chain propagation (0ad1fd0)
- Extended `RagJob` interface with `chunksProcessed?: number` and `chunksTotal?: number`
- Updated `updateProgress()` to accept and store chunk data
- `create/route.ts` passes `data.chunksProcessed` and `data.chunksTotal` from status file to ragJobs
- `status/route.ts` returns both fields in JSON response

### Task 3: Visual progress bar in rag-panel (3c3ebbe)
- Added `chunksProcessed` and `chunksTotal` state variables
- Polling callback updates chunk state from status endpoint
- New progress bar UI: shows "X/Y chunks" with percentage and animated violet bar
- Combined progress bar + current step + elapsed time + log history in single card
- All states reset on completed/error/idle

### Task 4: Build verification
`npm run build` passes with all changes. No type errors, no unused imports.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. `grep chunksProcessed app/scripts/rag-worker.mjs` - 4 occurrences (worker writes structured data)
2. `grep chunksProcessed app/src/lib/services/rag-jobs.ts` - present in interface and updateProgress
3. `grep chunksProcessed app/src/app/api/projects/[id]/rag/status/route.ts` - returned in response
4. `grep chunksProcessed app/src/app/api/projects/[id]/rag/create/route.ts` - passed from status file
5. `grep chunksProcessed app/src/components/rag/rag-panel.tsx` - 5 occurrences (UI uses for bar)
6. `npm run build` - passes successfully

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | a96642e | Worker writes chunksProcessed/chunksTotal |
| 2 | 0ad1fd0 | Backend chain propagation |
| 3 | 3c3ebbe | Visual progress bar in rag-panel |
| 4 | — | Build verification (no file changes) |
