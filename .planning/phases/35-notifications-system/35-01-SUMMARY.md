---
phase: 35-notifications-system
plan: 01
subsystem: notifications
tags: [notifications, sqlite, api, backend]
dependency_graph:
  requires: []
  provides: [notifications-table, notifications-service, notifications-api]
  affects: [task-executor, process-route, rag-create-route, canvas-executor]
tech_stack:
  added: []
  patterns: [fire-and-forget-notifications, 30-day-retention-cleanup]
key_files:
  created:
    - app/src/lib/services/notifications.ts
    - app/src/app/api/notifications/route.ts
    - app/src/app/api/notifications/count/route.ts
    - app/src/app/api/notifications/[id]/read/route.ts
    - app/src/app/api/notifications/read-all/route.ts
  modified:
    - app/src/lib/db.ts
    - app/src/lib/logger.ts
    - app/src/lib/services/task-executor.ts
    - app/src/lib/services/canvas-executor.ts
    - app/src/app/api/projects/[id]/process/route.ts
    - app/src/app/api/projects/[id]/rag/create/route.ts
decisions:
  - Notifications use generateId() from lib/utils (not crypto.randomUUID)
  - createNotification is fire-and-forget with internal try-catch (never crashes caller)
  - Added 'notifications' to LogSource type for typed logging
metrics:
  duration: 241s
  completed: "2026-03-13"
---

# Phase 35 Plan 01: Notifications Backend Summary

SQLite notifications table with CRUD service, four API endpoints, and auto-generation hooks in task-executor, process route, RAG create route, and canvas-executor for all completion/failure paths.

## Tasks Completed

### Task 1: Notifications table, service module, and API endpoints (c4b8e63)

- Added `notifications` table to db.ts with schema: id, type, title, message, severity, link, read, created_at
- Added 30-day notification cleanup on startup
- Created `notifications.ts` service with 5 exports: createNotification, getNotifications, getUnreadCount, markAsRead, markAllAsRead
- Created 4 API routes all with `force-dynamic`:
  - GET /api/notifications (paginated, filterable by type/severity)
  - GET /api/notifications/count (unread count)
  - PATCH /api/notifications/[id]/read (mark single as read)
  - POST /api/notifications/read-all (mark all as read)

### Task 2: Notification auto-generation triggers (a08a2c0)

- task-executor.ts: notifications on task completion (success) and failure (step-level + outer catch)
- process/route.ts: notifications on both streaming and non-streaming completion and failure (4 paths total)
- rag/create/route.ts: notifications on RAG indexing completion and failure
- canvas-executor.ts: notifications on canvas run completion, node failure, and outer catch failure

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added 'notifications' to LogSource type**
- **Found during:** Task 1
- **Issue:** Logger uses typed LogSource union; 'notifications' was not included, causing build failure
- **Fix:** Added `| 'notifications'` to LogSource type in logger.ts
- **Files modified:** app/src/lib/logger.ts
- **Commit:** c4b8e63

## Verification

- Build passes cleanly with no TypeScript errors
- All 4 API routes export `dynamic = 'force-dynamic'`
- notifications.ts exports all 5 functions
- db.ts contains `CREATE TABLE IF NOT EXISTS notifications`
- All 4 trigger files import and call createNotification

## Self-Check: PASSED

All 6 created/key files verified on disk. Both task commits (c4b8e63, a08a2c0) verified in git log.
