---
phase: 10-connectors-api-crud
plan: 01
subsystem: connectors-api
tags: [api, crud, connectors, rest]
dependency_graph:
  requires: [09-01]
  provides: [connectors-api-crud]
  affects: [11-connectors-ui, 12-pipeline-integration]
tech_stack:
  added: []
  patterns: [dynamic-patch-builder, type-specific-test, abort-controller-timeout]
key_files:
  created:
    - app/src/app/api/connectors/route.ts
    - app/src/app/api/connectors/[id]/route.ts
    - app/src/app/api/connectors/[id]/test/route.ts
    - app/src/app/api/connectors/[id]/logs/route.ts
    - app/src/app/api/connectors/for-agent/[agentId]/route.ts
  modified: []
decisions:
  - "Connector test uses AbortController with 10s timeout for all HTTP types"
  - "Email connector test validates config structure only (no actual send)"
metrics:
  duration: 117s
  completed: "2026-03-11T16:09:22Z"
  tasks_completed: 6
  tasks_total: 6
---

# Phase 10 Plan 01: Connectors API CRUD Summary

Full REST API for connector management: list, create, get, update, delete, type-specific test with 10s timeout, invocation logs, and agent-filtered access.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | GET/POST /api/connectors | c49f602 | app/src/app/api/connectors/route.ts |
| 2 | GET/PATCH/DELETE /api/connectors/[id] | 6376b5b | app/src/app/api/connectors/[id]/route.ts |
| 3 | POST /api/connectors/[id]/test | 7588f34 | app/src/app/api/connectors/[id]/test/route.ts |
| 4 | GET /api/connectors/[id]/logs | ce66d8c | app/src/app/api/connectors/[id]/logs/route.ts |
| 5 | GET /api/connectors/for-agent/[agentId] | cdb7de0 | app/src/app/api/connectors/for-agent/[agentId]/route.ts |
| 6 | Verify build | -- | All route files (build passes) |

## Endpoints Created

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/connectors | List all connectors, ordered by updated_at DESC |
| POST | /api/connectors | Create connector (max 20, validates name+type) |
| GET | /api/connectors/{id} | Get single connector detail |
| PATCH | /api/connectors/{id} | Update allowed fields (name, description, emoji, config, is_active) |
| DELETE | /api/connectors/{id} | Remove connector (CASCADE deletes logs and access) |
| POST | /api/connectors/{id}/test | Test connector by type with 10s timeout |
| GET | /api/connectors/{id}/logs | Last 50 invocation logs |
| GET | /api/connectors/for-agent/{agentId} | Active connectors filtered by agent access |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- All 5 route files created and present
- All connector types handled in test endpoint (n8n_webhook, http_api, mcp_server, email)
- Max 20 validation in POST create
- LIMIT 50 in logs query
- agent_connector_access junction table used in for-agent route
- npm run build passes with all 5 connector routes in output

## Self-Check: PASSED

All 5 route files verified on disk. All 5 task commits verified in git log.
