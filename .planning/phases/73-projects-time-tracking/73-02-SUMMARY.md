---
phase: 73-projects-time-tracking
plan: 02
subsystem: holded-mcp
tags: [mcp, holded, projects, tasks, crud]
dependency_graph:
  requires: [73-01]
  provides: [project-task-tools]
  affects: [73-03, 73-04]
tech_stack:
  added: []
  patterns: [client-side-filtering, client-side-pagination, zod-validation, withValidation-wrapper]
key_files:
  created:
    - src/tools/project-tasks.ts
    - src/__tests__/project-tasks.test.ts
  modified:
    - src/validation.ts
    - src/index.ts
decisions:
  - "Client-side projectId filter (Holded /tasks returns all tasks, no server-side filter)"
  - "No update tool (Holded API has no PUT/update endpoint for tasks)"
metrics:
  duration: 111s
  completed: "2026-03-23T12:09:41Z"
---

# Phase 73 Plan 02: Project Tasks CRUD Tools Summary

4 MCP tools for Holded project tasks (list with client-side projectId filter + pagination, get with comments, create requiring projectId+listId+name, delete) using /tasks endpoint with 'projects' module

## What Was Built

### Zod Validation Schemas (src/validation.ts)
- `projectTaskIdSchema` - taskId string validation
- `listProjectTasksSchema` - optional projectId filter + pagination
- `createProjectTaskSchema` - projectId, listId, name required; desc, labels, date, dueDate, userId, status, billable, featured optional

### Project Task Tools (src/tools/project-tasks.ts)
- `holded_list_project_tasks` - Lists all tasks via GET /tasks, client-side filter by projectId, client-side pagination (page/limit)
- `holded_get_project_task` - GET /tasks/{taskId} with comments
- `holded_create_project_task` - POST /tasks with projectId+listId+name required
- `holded_delete_project_task` - DELETE /tasks/{taskId}

### Registration (src/index.ts)
- Import and spread getProjectTaskTools into allTools
- Rate limiter: 200/min for read ops, 30/min for create, 10/min for delete

### Tests (src/__tests__/project-tasks.test.ts)
- 10 tests covering: list all, filter by projectId, pagination, empty results, get by ID, reject empty taskId, create with required fields, create with all optional fields, reject empty required fields, delete

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| ce26ce2 | feat(73-02): add project task tools with Zod schemas and registration |
| 05d3b14 | test(73-02): add unit tests for project task tools |

## Verification

- `npm run build` - PASS (no errors)
- `npm test -- --run src/__tests__/project-tasks.test.ts` - PASS (10/10 tests)
