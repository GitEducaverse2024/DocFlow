---
phase: 60-execution-cycles-scheduler
plan: 03
subsystem: tasks-ui
tags: [schedule-toggle, cycle-progress, i18n, api-route]
dependency_graph:
  requires: [60-01, 60-02]
  provides: [schedule-toggle-api, cycle-progress-display]
  affects: [task-detail-page]
tech_stack:
  added: [shadcn-switch]
  patterns: [schedule-toggle-api, cycle-progress-bar]
key_files:
  created:
    - app/src/app/api/tasks/[id]/schedule/route.ts
    - app/src/components/ui/switch.tsx
  modified:
    - app/src/app/tasks/[id]/page.tsx
    - app/messages/en.json
    - app/messages/es.json
decisions:
  - Added schedule active state from schedule_config JSON rather than separate API call
  - Used division-by-zero guard for cycle progress bar width calculation
metrics:
  duration: 127s
  completed: 2026-03-21
---

# Phase 60 Plan 03: Schedule Toggle UI + Cycle Progress Display Summary

PATCH endpoint for toggling schedule is_active with next_run_at recalculation, plus cycle progress bar and schedule Switch toggle on task detail page.

## What was built

### Task 1: Schedule toggle API route
Created `PATCH /api/tasks/[id]/schedule` endpoint that:
- Validates task exists and has execution_mode='scheduled'
- Accepts `{ is_active: boolean }` body
- On activate: parses schedule_config, calls calculateNextExecution(), updates both task_schedules and tasks tables
- On deactivate: sets is_active=0, clears next_run_at on both tables
- Returns `{ is_active, next_run_at }`

### Task 2: Task detail page extensions
- Extended TaskDetail interface with v15 fields: execution_mode, execution_count, run_count, last_run_at, next_run_at, schedule_config
- Added Switch import (shadcn), CalendarClock/RotateCcw icons, formatNextExecution utility
- Added scheduleActive state with useEffect sync from schedule_config
- Added handleScheduleToggle async handler with toast feedback
- Variable mode: cycle progress bar showing run N/M with visual progress
- Scheduled mode: schedule section with Switch toggle, next run display, total runs

### Task 3: i18n keys
Added 8 new keys under tasks.detail in both es.json and en.json: cycleProgress, cycleCount, schedule, nextRun, totalRuns, scheduleActivated, scheduleDeactivated, scheduleToggleError

### Task 4: Build validation
npm run build passed with no TypeScript errors.

## Commits

| Commit | Description |
|--------|-------------|
| c2a1525 | feat(60-03): add schedule toggle API and cycle progress UI |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Division by zero guard in cycle progress**
- **Found during:** Task 2
- **Issue:** Plan code had `task.run_count / task.execution_count` without guarding execution_count=0
- **Fix:** Added ternary check `task.execution_count > 0 ? ... : 0`
- **Files modified:** app/src/app/tasks/[id]/page.tsx

**2. [Rule 3 - Blocking] Next.js params await pattern**
- **Found during:** Task 1
- **Issue:** Next.js 14+ requires `await params` in route handlers
- **Fix:** Used `const { id } = await params` instead of direct `params.id`
- **Files modified:** app/src/app/api/tasks/[id]/schedule/route.ts

**3. [Rule 3 - Blocking] i18n files at app/messages/ not app/src/messages/**
- **Found during:** Task 3
- **Issue:** Plan referenced app/src/messages/ but files live at app/messages/
- **Fix:** Used correct path app/messages/es.json and app/messages/en.json

**4. [Rule 3 - Blocking] Switch component not installed**
- **Found during:** Pre-execution check
- **Issue:** shadcn Switch component not yet in project
- **Fix:** Installed via `npx shadcn@latest add switch`

## Completion Criteria

- [x] PATCH /api/tasks/[id]/schedule toggles is_active and manages next_run_at
- [x] Task detail shows cycle progress bar for variable mode
- [x] Task detail shows schedule section with Switch toggle for scheduled mode
- [x] Toggle updates both task_schedules and tasks tables
- [x] All text uses i18n keys in both es.json and en.json
- [x] Build passes without TypeScript errors
