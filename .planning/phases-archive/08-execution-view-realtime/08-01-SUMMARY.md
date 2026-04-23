---
phase: "08"
plan: "01"
subsystem: execution-view
tags: [ui, real-time, polling, markdown, pipeline]
dependency_graph:
  requires: [api-tasks-status, api-tasks-detail, api-checkpoint-approve, api-checkpoint-reject]
  provides: [task-execution-view, task-detail-page]
  affects: [tasks-list-page]
tech_stack:
  added: []
  patterns: [polling-with-setInterval, useRef-cleanup, markdown-rendering, blob-download]
key_files:
  created:
    - app/src/app/tasks/[id]/page.tsx
  modified: []
decisions:
  - "Single-file page with all logic inline (no separate components)"
  - "useRef for interval ID to properly clean up polling"
  - "Merge polling status into full task state to avoid re-fetching every 2s"
  - "Re-fetch full task data on transition to completed (to get full outputs)"
metrics:
  duration: 172s
  completed: "2026-03-11T15:17:35Z"
---

# Phase 8 Plan 01: Execution View + Real-time Monitoring Summary

Task detail page at /tasks/{id} with vertical pipeline visualization, 2s polling, checkpoint approve/reject, progress bar, and markdown result rendering.

## What Was Built

Single "use client" page (`app/src/app/tasks/[id]/page.tsx`, ~780 lines) implementing:

1. **Data Loading + Polling**: Initial fetch of full task data via GET /api/tasks/{id}. When task is running/paused, polls GET /api/tasks/{id}/status every 2 seconds. Stops polling and re-fetches full data when task completes or fails.

2. **Page Header**: Task name, status badge, description. Cancel button when running/paused, Re-execute button when completed/failed.

3. **Vertical Pipeline**: Step cards connected by vertical lines (emerald between completed steps, zinc otherwise). Each card shows type icon (Bot/ShieldCheck/GitMerge), step name, agent name/model, status badge with pulse animation for running, tokens and duration.

4. **Step Output**: Preview (max 200px with gradient fade) + "Ver completo" link opening full markdown dialog. Expanded view with prose-invert markdown rendering.

5. **Checkpoint UI**: When checkpoint step is active (running), shows previous step output rendered in markdown, "Aprobar y continuar" button, and textarea + "Rechazar y re-ejecutar" button requiring feedback.

6. **Progress Bar**: Sticky bottom bar showing step count (X/N), percentage bar (violet on zinc track), elapsed time, total tokens. Only visible when task is active.

7. **Completion View**: Result output rendered in markdown with emerald-bordered card. Action buttons: Descargar .md (Blob download), Copiar (clipboard), Re-ejecutar.

8. **Completed Pipeline**: All steps collapsed by default, click to expand and see full output in markdown. Chevron indicators for expand/collapse state.

9. **Error State**: Red banner for failed tasks, red border on failed step card.

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Create /tasks/{id} execution view page | e93a18b | app/src/app/tasks/[id]/page.tsx |
| 2 | Verify build passes | (verification only) | - |

## Verification Results

- setInterval: present (polling)
- ReactMarkdown: present (9 usages)
- approve: present
- reject: present (via feedback flow)
- Ver completo: present
- Descargar: present
- Re-ejecutar: present
- Copiar: present
- animate-pulse: present (running status)
- npm run build: PASSED
