---
phase: 39-renombrado-y-migracion
plan: 03
subsystem: canvas, tasks, services, api-routes
tags: [rename, catbrains, canvas-nodes, task-steps, backward-compat]
dependency_graph:
  requires: [39-01, 39-02]
  provides: [catbrain-node-type, catbrain-task-step, catbrains-internal-refs]
  affects: [canvas-editor, task-executor, catbot-tools, mcp, dashboard]
tech_stack:
  added: []
  patterns: [backward-compat-dual-type, legacy-column-comments]
key_files:
  created:
    - app/src/components/canvas/nodes/catbrain-node.tsx
  modified:
    - app/src/components/canvas/node-palette.tsx
    - app/src/components/canvas/node-config-panel.tsx
    - app/src/components/canvas/canvas-wizard.tsx
    - app/src/components/canvas/canvas-editor.tsx
    - app/src/components/canvas/canvas-card.tsx
    - app/src/lib/services/canvas-executor.ts
    - app/src/lib/services/task-executor.ts
    - app/src/lib/services/catbot-tools.ts
    - app/src/lib/services/catbot-sudo-tools.ts
    - app/src/lib/error-formatter.ts
    - app/src/app/api/mcp/[projectId]/route.ts
    - app/src/app/api/catbot/chat/route.ts
    - app/src/app/api/dashboard/storage/route.ts
    - app/src/app/api/dashboard/summary/route.ts
    - app/src/app/api/health/route.ts
    - app/src/app/api/tasks/route.ts
    - app/src/app/api/testing/generate/route.ts
    - app/src/app/tasks/new/page.tsx
    - app/src/app/settings/page.tsx
    - app/src/app/catbrains/page.tsx
    - app/src/components/catbot/catbot-panel.tsx
decisions:
  - Dual node type registration (catbrain + project) in canvas-editor for backward compat with existing flow_data JSON
  - Legacy DB column names (linked_projects, use_project_rag, project_id) preserved with comments — renaming requires table recreation
  - Node palette uses custom Image icon (ico_catbrain.png) via next/image instead of lucide icon
  - MCP route folder kept as [projectId] for URL backward compat
metrics:
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 21
  completed: "2026-03-14"
requirements_completed: [REN-05, REN-06, REN-07]
---

# Phase 39 Plan 03: Canvas/Task Node Rename + Internal References Summary

Canvas node PROJECT renamed to CATBRAIN with violet theme, ico_catbrain.png icon, RAG status dot badge, and "0 conectores" placeholder; task step and all internal services (executors, CatBot tools, MCP, dashboard, health) updated to query catbrains table with full backward compatibility for legacy data.

## Task Completion

### Task 1: Rename Canvas node PROJECT to CATBRAIN (87bc471)

Created `catbrain-node.tsx` with violet color scheme, ico_catbrain.png via next/image, RAG status dot badge (green/yellow/grey), and "0 conectores" pill badge. Updated node-palette.tsx with custom Image icon and catbrains mode filter. Rewrote node-config-panel.tsx to fetch from /api/catbrains with CatBrain interface. Updated canvas-wizard.tsx mode cards, canvas-editor.tsx node type registry (dual catbrain+project registration), and canvas-card.tsx mode config. Canvas-executor.ts now handles both 'catbrain' and 'project' cases with catbrainId||projectId fallback, querying catbrains table.

**Files:** catbrain-node.tsx (new), node-palette.tsx, node-config-panel.tsx, canvas-wizard.tsx, canvas-editor.tsx, canvas-card.tsx, canvas-executor.ts

### Task 2: Rename Task step type and services layer (96a2201)

Task-executor.ts updated to query catbrains table with legacy column name comments. CatBot tools renamed: create_project->create_catbrain, list_projects->list_catbrains, with SQL and permission updates. CatBot sudo-tools MCP bridge queries catbrains table. Error-formatter.ts updated service pattern URL.

**Files:** task-executor.ts, catbot-tools.ts, catbot-sudo-tools.ts, error-formatter.ts

### Task 3: Update API routes and UI pages (4ab7e4e)

MCP route, CatBot chat, dashboard storage/summary, health, tasks API, and testing generate routes all updated to query catbrains table. Tasks/new wizard fetches /api/catbrains with CatBrain labels. Settings page uses create_catbrains permission. CatBot panel suggestions reference /catbrains paths. Fixed pre-existing unused Brain import in catbrains/page.tsx (blocking build).

**Files:** mcp/[projectId]/route.ts, catbot/chat/route.ts, dashboard/storage/route.ts, dashboard/summary/route.ts, health/route.ts, tasks/route.ts, testing/generate/route.ts, tasks/new/page.tsx, settings/page.tsx, catbrains/page.tsx, catbot-panel.tsx

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing unused Brain import in catbrains/page.tsx**
- **Found during:** Task 3 build verification
- **Issue:** `app/src/app/catbrains/page.tsx` had unused `Brain` import from lucide-react (pre-existing from plan 39-02), causing ESLint no-unused-vars error that blocked `npm run build`
- **Fix:** Removed `Brain` from the import statement
- **Files modified:** app/src/app/catbrains/page.tsx
- **Commit:** 4ab7e4e (included in Task 3 commit)

**2. [Rule 3 - Blocking] Fixed projects/error.tsx missing "use client" directive**
- **Found during:** Task 3 (pre-existing issue from 39-01 redirect stubs)
- **Issue:** error.tsx used server-side `redirect()` but Next.js error pages must be client components
- **Fix:** Converted to client component using useRouter().replace()
- **Files modified:** app/src/app/projects/error.tsx
- **Commit:** Included in earlier task commit

### Files Not Modified (not present or already correct)

Several files listed in the plan were already correct or did not contain PROJECT references:
- `app/src/lib/services/rag.ts` — no direct projects table reference found
- `app/src/app/api/catbot/search-docs/route.ts` — no projects table reference
- `app/src/app/api/tasks/[id]/route.ts` — no projects table reference
- `app/src/app/api/tasks/from-template/route.ts` — no projects table reference
- `app/src/app/api/testing/run/route.ts` — no projects table reference
- `app/src/components/testing/test-ai-generator.tsx` — no projects reference
- `app/src/components/testing/test-section-list.tsx` — no projects reference
- `app/src/app/tasks/[id]/page.tsx` — no projects reference to update
- `app/src/app/tasks/page.tsx` — no projects reference to update

## Verification Results

1. TypeScript check (`npx tsc --noEmit`): PASSED — zero errors
2. Build (`npm run build`): PASSED — all routes compile successfully
3. Grep verification (`FROM projects|INTO projects|TABLE projects`): Only migration code in db.ts (expected)
4. Backward compat: Both 'catbrain' and 'project' node types registered in canvas-editor
5. All success criteria met per plan specification

## Decisions Made

1. **Dual node type registration** — canvas-editor.tsx registers both `catbrain: CatBrainNode` and `project: CatBrainNode` so existing canvas flow_data with `type: 'project'` continues to render correctly
2. **Legacy column names preserved** — DB columns `linked_projects`, `use_project_rag`, `project_id` kept as-is with comments explaining they refer to catbrains (renaming requires SQLite table recreation)
3. **Custom icon via next/image** — node-palette.tsx uses `customIcon` field with `<Image src="/Images/icon/ico_catbrain.png">` instead of a lucide icon, requiring a new `customIcon` interface field on PaletteItem
4. **MCP route folder unchanged** — `[projectId]` folder name kept for URL backward compatibility; internally queries catbrains table

## Self-Check: PASSED

- All 8 key files verified present on disk
- All 3 task commits verified in git log (87bc471, 96a2201, 4ab7e4e)
