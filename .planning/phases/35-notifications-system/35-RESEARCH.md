# Phase 35: Notifications System - Research

**Researched:** 2026-03-13
**Domain:** SQLite notifications + React polling UI + auto-generation from existing event sources
**Confidence:** HIGH

## Summary

Phase 35 implements a complete in-app notification system: a `notifications` SQLite table, four API endpoints (list, count, mark-read, mark-all-read), automatic notification creation when processes/RAG/tasks/canvas complete or fail, a Bell icon with unread badge in the sidebar header, a dropdown showing the last 20 notifications, and a full panel with filters and pagination.

The entire feature uses existing project patterns: better-sqlite3 for storage, Next.js API routes with `force-dynamic`, a React polling hook (modeled on `useSystemHealth`), shadcn/ui components, and Lucide icons. No new npm dependencies are required. The notification auto-generation hooks into existing completion/failure code paths in `task-executor.ts`, `canvas-executor.ts`, the process route, and the RAG create route.

**Primary recommendation:** Build a thin `notifications.ts` service module that exposes `createNotification()` and query helpers, then add one-line calls at each completion/failure point in existing routes and executors. The Bell UI goes in the sidebar header area. Use Popover (needs `npx shadcn@latest add popover`) for the dropdown and a dedicated `/notifications` page for the full panel.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NOTIF-01 | Tabla notifications en SQLite (id, type, title, message, severity, link, read, created_at) | DB pattern: CREATE TABLE IF NOT EXISTS in db.ts, same as all other tables |
| NOTIF-02 | Auto-generate notifications on process/RAG/task/canvas complete, connector errors, service status | Hook into existing completion points in task-executor.ts, canvas-executor.ts, process route, rag-create route, health check |
| NOTIF-03 | Bell icon in sidebar/header with red badge for unread count | Bell from lucide-react, badge in sidebar header area next to logo |
| NOTIF-04 | Dropdown with last 20 notifications: severity icon, title, truncated message, relative time, "Ver" link | Popover component (needs install), polling hook |
| NOTIF-05 | Full notifications panel with filters by type/severity, pagination | New /notifications page with tabs/select filters |
| NOTIF-06 | API endpoints: GET /api/notifications, GET /api/notifications/count, PATCH /api/notifications/{id}/read, POST /api/notifications/read-all | Standard Next.js API route pattern with force-dynamic |
| NOTIF-07 | Polling every 15s to update unread badge | useNotifications hook modeled on useSystemHealth |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (existing) | Notifications table storage | Already used for all DB tables in project |
| Next.js 14 App Router | (existing) | API routes + page | Project framework |
| React 18 | (existing) | UI components + hooks | Project framework |
| shadcn/ui | (existing) | Popover, Badge, Button, Tabs, Select | Project UI library |
| lucide-react | (existing) | Bell, CheckCheck, AlertCircle, Info, AlertTriangle icons | Project icon library |
| Tailwind CSS | (existing) | Styling | Project styling |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui Popover | (needs install) | Bell dropdown container | For the notification dropdown on bell click |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Popover for dropdown | DropdownMenu (already installed) | DropdownMenu closes on item click and is menu-oriented; Popover allows richer content and stays open |
| Dedicated /notifications page | Sheet (slide-out panel) | Page is better for full filtering/pagination UX, matches project pattern of dedicated pages |

**Installation:**
```bash
cd ~/docflow/app && npx shadcn@latest add popover
```

## Architecture Patterns

### Recommended Project Structure
```
app/src/
  lib/
    services/
      notifications.ts       # Service module: createNotification(), getNotifications(), etc.
  app/
    api/
      notifications/
        route.ts              # GET (list with filters/pagination)
        count/
          route.ts            # GET (unread count)
        [id]/
          read/
            route.ts          # PATCH (mark single as read)
        read-all/
          route.ts            # POST (mark all as read)
    notifications/
      page.tsx                # Full notifications panel
  components/
    notifications/
      notification-bell.tsx   # Bell icon + badge + popover dropdown
      notification-item.tsx   # Single notification row (shared between dropdown and page)
      notification-filters.tsx # Type/severity filter controls
  hooks/
    use-notifications.ts      # Polling hook for unread count + recent notifications
```

### Pattern 1: Notification Service Module
**What:** Centralized `notifications.ts` that handles all DB operations and exposes a simple `createNotification()` function
**When to use:** Every place that needs to create or query notifications
**Example:**
```typescript
// app/src/lib/services/notifications.ts
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export type NotificationType = 'process' | 'rag' | 'task' | 'canvas' | 'connector' | 'system';
export type NotificationSeverity = 'success' | 'info' | 'warning' | 'error';

export interface CreateNotificationParams {
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  link?: string;
}

export function createNotification(params: CreateNotificationParams): void {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO notifications (id, type, title, message, severity, link, read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))
  `).run(id, params.type, params.title, params.message, params.severity, params.link || null);
}

export function getUnreadCount(): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0').get() as { count: number };
  return row.count;
}

export function getNotifications(opts: { limit?: number; offset?: number; type?: string; severity?: string }): unknown[] {
  let sql = 'SELECT * FROM notifications WHERE 1=1';
  const params: unknown[] = [];
  if (opts.type) { sql += ' AND type = ?'; params.push(opts.type); }
  if (opts.severity) { sql += ' AND severity = ?'; params.push(opts.severity); }
  sql += ' ORDER BY created_at DESC';
  if (opts.limit) { sql += ' LIMIT ?'; params.push(opts.limit); }
  if (opts.offset) { sql += ' OFFSET ?'; params.push(opts.offset); }
  return db.prepare(sql).all(...params);
}
```

### Pattern 2: One-Line Notification Triggers in Existing Code
**What:** Add a single `createNotification()` call at each completion/failure point
**When to use:** After `UPDATE ... SET status = 'completed'` or `status = 'failed'` in existing executors and routes
**Example:**
```typescript
// In task-executor.ts, after task completes:
import { createNotification } from '@/lib/services/notifications';

// After: db.prepare("UPDATE tasks SET status = 'completed' ...").run(...)
createNotification({
  type: 'task',
  title: `Tarea completada: ${taskName}`,
  message: `Se completaron ${stepCount} pasos en ${duration}s`,
  severity: 'success',
  link: `/tasks/${taskId}`,
});
```

### Pattern 3: Polling Hook (modeled on useSystemHealth)
**What:** `useNotifications` hook that polls `/api/notifications/count` every 15s and caches recent notifications
**When to use:** In the notification bell component
**Example:**
```typescript
// app/src/hooks/use-notifications.ts
import { useState, useEffect, useCallback } from 'react';

export function useNotifications(pollInterval = 15000) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [recent, setRecent] = useState<Notification[]>([]);

  const fetchCount = useCallback(async () => {
    const res = await fetch('/api/notifications/count', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setUnreadCount(data.count);
    }
  }, []);

  const fetchRecent = useCallback(async () => {
    const res = await fetch('/api/notifications?limit=20', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setRecent(data.notifications);
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, pollInterval);
    return () => clearInterval(interval);
  }, [fetchCount, pollInterval]);

  return { unreadCount, recent, fetchCount, fetchRecent };
}
```

### Pattern 4: Bell Placement in Sidebar
**What:** Bell icon added to the sidebar header area, next to the DoCatFlow logo
**When to use:** The bell must be visible on all pages
**Placement:** Inside the sidebar `<div className="p-6">` header block, to the right of the logo/title group. This is a "use client" component already so hooks work directly.

### Anti-Patterns to Avoid
- **Do NOT use WebSocket or SSE for notifications:** Requirements explicitly say polling every 15s. This is a single-user app.
- **Do NOT create a separate notification context/provider:** A simple hook is sufficient for single-user; no need for React Context overhead.
- **Do NOT poll the full notification list every 15s:** Only poll the count endpoint (lightweight). Fetch the full list only when the user opens the dropdown.
- **Do NOT put the bell in the layout.tsx:** The bell needs client-side state. Place it inside the existing Sidebar component which is already "use client".

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Relative time display | Custom date math | Simple helper: `const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })` | Built-in browser API, handles Spanish locale |
| Dropdown positioning | Manual absolute positioning | shadcn/ui Popover (Radix UI underneath) | Handles viewport edge cases, focus management, accessibility |
| UUID generation | Custom ID generator | `uuid` v4 (already in project) | Already used everywhere in the codebase |

**Key insight:** The notification system is fundamentally simple CRUD + polling. The complexity is in correctly hooking into all existing event sources, not in the notification infrastructure itself.

## Common Pitfalls

### Pitfall 1: Missing `force-dynamic` on API Routes
**What goes wrong:** Next.js pre-renders the route at build time, returning stale data
**Why it happens:** All notification endpoints read from SQLite at request time
**How to avoid:** Add `export const dynamic = 'force-dynamic';` to every notification API route
**Warning signs:** Badge always shows 0 or stale count

### Pitfall 2: Forgetting bracket notation for env vars
**What goes wrong:** Webpack inlines undefined at build time
**Why it happens:** `process.env.X` gets replaced at build time by Next.js
**How to avoid:** Always use `process['env']['VARIABLE']`
**Warning signs:** Environment variables are undefined at runtime

### Pitfall 3: Notification creation in try-catch that swallows errors
**What goes wrong:** If `createNotification()` throws (e.g., DB locked), it could crash the parent operation
**Why it happens:** Notification creation is secondary to the main operation
**How to avoid:** Wrap `createNotification()` calls in try-catch within the service module itself, so callers never need to worry about it
**Warning signs:** Operations that worked before start failing after adding notification triggers

### Pitfall 4: Polling count endpoint causes N+1 sidebar re-renders
**What goes wrong:** Every 15s poll triggers full sidebar re-render
**Why it happens:** State change in parent causes all children to re-render
**How to avoid:** Extract the bell into its own component with its own hook. Only the bell component re-renders on count change.
**Warning signs:** Visible flickering in sidebar every 15 seconds

### Pitfall 5: RAG notification timing
**What goes wrong:** RAG indexing uses `ragJobs` in-memory map with `spawn()` child process -- there's no DB status update like tasks/canvas
**Why it happens:** RAG create route starts a background child process and tracks status in memory
**How to avoid:** Add notification creation in the ragJobs completion callback (where `job.status = 'completed'` or `job.status = 'error'`), NOT in the API route
**Warning signs:** RAG notifications never appear

### Pitfall 6: Missing notification for non-streaming process route
**What goes wrong:** Notifications only work for streaming processing, not the non-streaming or n8n paths
**Why it happens:** The process route has 3 paths: streaming local, non-streaming local, and n8n webhook
**How to avoid:** Add notification creation in ALL completion paths within `startLocalProcessing()` and after `send('done', ...)` in the streaming path
**Warning signs:** Some processes generate notifications, others don't

## Code Examples

### Table Schema
```sql
-- In db.ts, add after existing table definitions
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  severity TEXT DEFAULT 'info',
  link TEXT,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Relative Time Helper (Spanish)
```typescript
export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.round((now - then) / 1000);

  if (diffSec < 60) return 'hace unos segundos';
  if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `hace ${Math.floor(diffSec / 3600)}h`;
  if (diffSec < 604800) return `hace ${Math.floor(diffSec / 86400)}d`;
  return new Date(dateStr).toLocaleDateString('es-ES');
}
```

### Severity Icon Mapping
```typescript
import { CheckCircle, Info, AlertTriangle, AlertCircle } from 'lucide-react';

const severityConfig = {
  success: { icon: CheckCircle, color: 'text-emerald-500' },
  info:    { icon: Info,        color: 'text-blue-500' },
  warning: { icon: AlertTriangle, color: 'text-amber-500' },
  error:   { icon: AlertCircle,  color: 'text-red-500' },
};
```

### Bell with Badge
```typescript
import { Bell } from 'lucide-react';

function NotificationBell({ count }: { count: number }) {
  return (
    <button className="relative p-1.5 text-zinc-400 hover:text-zinc-50 transition-colors">
      <Bell className="w-5 h-5" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
```

## Notification Event Sources (Complete Map)

All places where `createNotification()` must be called:

| Source File | Event | Type | Severity | Link Pattern |
|-------------|-------|------|----------|--------------|
| `task-executor.ts` line ~288 | Task completed | `task` | `success` | `/tasks/{taskId}` |
| `task-executor.ts` line ~294 | Task failed | `task` | `error` | `/tasks/{taskId}` |
| `canvas-executor.ts` line ~512 | Canvas completed | `canvas` | `success` | `/canvas/{canvasId}` |
| `canvas-executor.ts` line ~522 | Canvas failed | `canvas` | `error` | `/canvas/{canvasId}` |
| `process/route.ts` line ~348-349 | Process completed (non-streaming) | `process` | `success` | `/projects/{projectId}` |
| `process/route.ts` line ~374-376 | Process failed (non-streaming) | `process` | `error` | `/projects/{projectId}` |
| `process/route.ts` line ~556-557 | Process completed (streaming) | `process` | `success` | `/projects/{projectId}` |
| `process/route.ts` line ~586-587 | Process failed (streaming) | `process` | `error` | `/projects/{projectId}` |
| `rag-jobs.ts` line ~48 | RAG indexing completed | `rag` | `success` | `/projects/{projectId}` |
| `rag-jobs.ts` line ~58 | RAG indexing failed | `rag` | `error` | `/projects/{projectId}` |

**Service status changes (optional, lower priority):** Could hook into `useSystemHealth` on the server side, but the requirements say "servicios caidos/recuperados" -- this can be done by checking health in a lightweight way and comparing to previous state. However, this is complex because health checks currently run client-side only. Recommendation: defer service-status notifications to a follow-up or implement a simple server-side check that runs periodically.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WebSocket for real-time | Polling for single-user apps | Always valid for single-user | Simpler, no connection management |
| Toast-only notifications | Persistent notifications in DB | N/A | Toasts are ephemeral; DB notifications persist and can be browsed |
| React Context for global state | Simple hook with polling | N/A | Less boilerplate for single-user |

## Open Questions

1. **Service status notifications (servicios caidos/recuperados)**
   - What we know: Health checks currently run client-side in `useSystemHealth`. NOTIF-02 requires notifications for "servicios caidos/recuperados".
   - What's unclear: Should we add a server-side periodic health check, or hook into the client-side check to call an API that creates notifications?
   - Recommendation: Add a lightweight server-side check. When the app starts and periodically (every 60s), check service health and compare to last known state. If changed, create a notification. This can be a simple interval in the notifications service module that runs on first import. Alternatively, simpler: have the existing `/api/health` route create notifications on status change (it already checks all services).

2. **Connector error notifications**
   - What we know: NOTIF-02 mentions "errores de conectores". Connector logs exist in `connector_logs` table.
   - What's unclear: Where exactly to hook -- connector execution happens during tasks.
   - Recommendation: Add notification creation in the connector execution error path within task steps, if it exists. Check `connector_logs` insert points.

3. **Notification cleanup/retention**
   - What we know: Requirements don't specify retention policy.
   - What's unclear: Should old notifications be cleaned up like logs (7 days)?
   - Recommendation: Add a cleanup on startup (delete notifications older than 30 days) similar to log rotation pattern.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (not yet installed, Phase 36) |
| Config file | none -- Wave 0 |
| Quick run command | N/A (no test infra yet) |
| Full suite command | N/A |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTIF-01 | notifications table exists with correct schema | manual-only | Check via SQLite CLI | N/A |
| NOTIF-02 | Notifications auto-generated on events | manual-only | Trigger a process, check bell | N/A |
| NOTIF-03 | Bell icon with badge visible | manual-only | Visual check | N/A |
| NOTIF-04 | Dropdown shows 20 notifications | manual-only | Click bell, verify list | N/A |
| NOTIF-05 | Full panel with filters | manual-only | Navigate to /notifications | N/A |
| NOTIF-06 | API endpoints return correct data | manual-only | curl commands | N/A |
| NOTIF-07 | Badge updates every 15s | manual-only | Watch badge after triggering event | N/A |

### Sampling Rate
- **Per task commit:** Manual verification via browser
- **Per wave merge:** Full manual walkthrough of all 7 requirements
- **Phase gate:** All 5 success criteria verified manually

### Wave 0 Gaps
- No test infrastructure exists yet (Phase 36)
- Manual testing is the only option for this phase
- Phase 36 E2E specs will cover notification bell visibility (E2E-01 navigation spec)

## Sources

### Primary (HIGH confidence)
- Project codebase: `db.ts`, `task-executor.ts`, `canvas-executor.ts`, `process/route.ts`, `rag/create/route.ts` -- verified all completion/failure points
- Project codebase: `sidebar.tsx`, `layout.tsx`, `use-system-health.ts` -- verified UI patterns and polling hook pattern
- Project codebase: `logger.ts` -- verified service module pattern

### Secondary (MEDIUM confidence)
- shadcn/ui Popover: standard Radix-based popover, consistent with existing shadcn usage in project

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, no new dependencies except Popover
- Architecture: HIGH - follows exact same patterns as existing features (polling hook, service module, API routes)
- Pitfalls: HIGH - identified from direct code inspection of all event sources and existing patterns
- Event source map: HIGH - traced every completion/failure path in actual source code

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable -- no external dependencies changing)
