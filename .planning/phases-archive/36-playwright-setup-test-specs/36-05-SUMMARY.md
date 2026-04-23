---
phase: 36-playwright-setup-test-specs
plan: 05
subsystem: api-specs-fixtures
tags: [playwright, api-testing, request-fixture, test-fixtures, pom-wiring]
dependency_graph:
  requires: [playwright-config, all-15-poms, test-helpers]
  provides: [projects-api-spec, tasks-api-spec, canvas-api-spec, system-api-spec, unified-test-fixture]
  affects: []
tech_stack:
  added: []
  patterns: [api-request-fixture, serial-crud-api-tests, afterAll-cleanup, typed-playwright-fixtures]
key_files:
  created:
    - app/e2e/api/projects.api.spec.ts
    - app/e2e/api/tasks.api.spec.ts
    - app/e2e/api/canvas.api.spec.ts
    - app/e2e/api/system.api.spec.ts
  modified:
    - app/e2e/fixtures/test-fixtures.ts
decisions:
  - "API specs use Playwright request fixture (no browser) for pure HTTP testing"
  - "Projects API returns paginated {data, pagination} shape; tasks and canvas return flat arrays"
  - "Canvas POST returns {id, redirectUrl} not the full canvas object"
  - "System spec tests health, connectors list, and dashboard summary in a single describe block"
  - "All CRUD specs use describe.serial to ensure create-before-read-before-delete ordering"
metrics:
  duration: 120s
  completed: "2026-03-13T19:48:00Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 36 Plan 05: API Specs + Test Fixtures Finalization Summary

4 API spec files covering projects/tasks/canvas/system endpoints via Playwright request fixture, plus finalized test-fixtures.ts wiring all 15 POMs as typed Playwright fixtures.

## Task 1: Create 4 API Spec Files

Created `app/e2e/api/` directory with 4 spec files that use Playwright's `request` fixture for browser-free HTTP testing:

**projects.api.spec.ts (API-01):** Serial CRUD -- POST creates project (status 201, validates id/name/purpose), GET /api/projects checks paginated response with {data, pagination} shape, GET /api/projects/:id returns single project, DELETE returns {success: true} and verifies 404 on re-fetch.

**tasks.api.spec.ts (API-02):** Serial CRUD -- POST creates task (status 201, validates name/description), GET /api/tasks validates flat array with enriched fields (steps_count, steps_completed, agents), GET /api/tasks/:id returns task with steps array, DELETE returns {success: true} and verifies 404.

**canvas.api.spec.ts (API-03):** Serial CRUD -- POST creates canvas (status 201, validates {id, redirectUrl} response shape), GET /api/canvas validates flat array with mode/status/node_count fields, GET /api/canvas/:id returns full canvas with flow_data, DELETE returns {success: true} and verifies 404.

**system.api.spec.ts (API-04):** Non-serial describe -- GET /api/health validates docflow.status/db/latency_ms plus all 5 external services (openclaw, n8n, qdrant, litellm, ollama) with status/url/latency_ms shape; timestamp ISO validation; GET /api/connectors returns array; GET /api/dashboard/summary validates 7 numeric fields (projects, agents, tasks, connectors, tokens_today, cost_this_month, running_tasks).

All specs use `[TEST]` prefix via `testName()` and have `afterAll` cleanup that deletes any leftover test resources.

## Task 2: Finalize test-fixtures.ts with All 15 POMs

Updated `app/e2e/fixtures/test-fixtures.ts` from simple re-export to full typed fixture:
- Imports BasePage + 15 POMs (sidebar, dashboard, projects, sources, processing, rag, chat, agents, workers, skills, tasks, canvas, connectors, catbot, settings)
- Defines `Fixtures` type with all 16 page objects
- Uses `base.extend<Fixtures>()` so any spec can destructure POM instances directly
- Exports `test` (extended) and `expect` for use across all specs

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 31c5cde | feat(36-05): add 4 API spec files |
| 2 | e2b4a94 | feat(36-05): finalize test-fixtures.ts with all 15 POMs |

## Verification

- All 4 API spec files exist under e2e/api/
- test-fixtures.ts has 16 imports (BasePage + 15 POMs)
- API specs use request fixture, no browser instantiation
- Status codes and response shapes match actual API route handlers
- `npm run build` passes (e2e files outside Next.js compilation)
- Total spec count: 15 E2E + 4 API = 19 spec files

## Self-Check: PASSED

- FOUND: app/e2e/api/projects.api.spec.ts
- FOUND: app/e2e/api/tasks.api.spec.ts
- FOUND: app/e2e/api/canvas.api.spec.ts
- FOUND: app/e2e/api/system.api.spec.ts
- FOUND: app/e2e/fixtures/test-fixtures.ts
- FOUND: 31c5cde (Task 1 commit)
- FOUND: e2b4a94 (Task 2 commit)
