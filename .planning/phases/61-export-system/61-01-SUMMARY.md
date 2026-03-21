---
phase: 61-export-system
plan: 01
subsystem: export
tags: [bundle, zip, archiver, export, api]
dependency_graph:
  requires: [task_bundles table, cat_paws table, canvases table, skills table, cat_paw_skills table]
  provides: [generateBundle service, POST /api/tasks/[id]/export]
  affects: [task_bundles rows, /app/data/exports/ directory]
tech_stack:
  added: [archiver ^7.0.1, @types/archiver ^7.0.0]
  patterns: [ZIP archive generation, resource collection, service/credential detection]
key_files:
  created:
    - app/src/lib/services/bundle-generator.ts
    - app/src/app/api/tasks/[id]/export/route.ts
    - app/src/lib/services/bundle-generator.test.ts
  modified:
    - app/package.json
    - app/package-lock.json
decisions:
  - "Used cat_paw_skills junction (not worker_skills) for skill collection -- matches current schema after migration"
  - "Agent JSON in bundle includes catbrain and connector associations for complete portability"
  - "detectCredentials accepts optional services param (reserved for future service-dependent credential logic)"
  - "Logger source 'tasks' used for export route (no 'export' LogSource defined)"
metrics:
  duration: 375s
  completed: "2026-03-21T19:39:00Z"
  tasks: 5
  tests: 22
  files_created: 3
  files_modified: 2
---

# Phase 61 Plan 01: Bundle Generator Service + Export API Summary

ZIP bundle generator service with archiver that collects task resources (steps, agents, canvases, skills with catbrain/connector associations), detects required Docker services and API credentials, and produces a structured export archive with manifest.json.

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Install archiver dependency | 5cd8a68 | archiver ^7.0.1, @types/archiver ^7.0.0 |
| 2 | Create bundle-generator.ts service | a8047f0 | generateBundle(), detectRequiredServices(), detectCredentials(), makeSlug() |
| 3 | Create export API route | 402fc90 | POST /api/tasks/[id]/export returns 201 with bundle |
| 4 | Create unit tests | 6461001 | 22 tests covering service/credential detection and slug generation |
| 5 | Build validation + lint fix | 0b122f2 | Fixed unused param lint error, build + tests green |

## Implementation Details

### bundle-generator.ts

Core service that:
1. Queries task + task_steps from DB
2. Collects unique agent_ids from steps and canvas flow_data nodes
3. Fetches cat_paws with their catbrain and connector associations
4. Fetches skills via cat_paw_skills junction table
5. Detects Docker services: always docflow+litellm, qdrant if RAG, ollama if local model
6. Detects credentials: always LITELLM_API_KEY, plus provider-specific keys based on model names
7. Creates ZIP with archiver (level 9 compression) containing:
   - `{slug}-bundle/manifest.json`
   - `{slug}-bundle/config/task.json`
   - `{slug}-bundle/config/canvases/{id}.json`
   - `{slug}-bundle/config/agents/{id}.json` (with catbrain/connector data)
   - `{slug}-bundle/config/skills/{id}.json`
8. Inserts task_bundles row with manifest JSON and file path

### Export API Route

POST /api/tasks/[id]/export:
- Validates task exists (404 if not)
- Calls generateBundle(taskId)
- Returns 201 with { id, bundle_path, manifest }
- Logs via 'tasks' source
- Uses force-dynamic export

### Test Coverage

22 unit tests covering:
- detectRequiredServices: 8 tests (always includes docflow/litellm, qdrant for RAG, ollama for local models)
- detectCredentials: 9 tests (per-provider API key detection, deduplication, null model handling)
- makeSlug: 5 tests (sanitization, truncation, edge cases)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Set spread not compatible with TS target**
- Found during: Task 2 (type-check)
- Issue: `[...new Set()]` requires downlevelIteration or es2015+ target
- Fix: Changed to `Array.from(new Set())` pattern
- Files modified: bundle-generator.ts
- Commit: a8047f0

**2. [Rule 1 - Bug] Invalid LogSource 'export'**
- Found during: Task 3 (type-check)
- Issue: LogSource type doesn't include 'export'
- Fix: Used 'tasks' LogSource instead
- Files modified: export/route.ts
- Commit: 402fc90

**3. [Rule 1 - Bug] Unused parameter lint error**
- Found during: Task 5 (build validation)
- Issue: `_services` parameter in detectCredentials flagged by ESLint
- Fix: Made param optional with `void services` statement
- Files modified: bundle-generator.ts
- Commit: 0b122f2

## Verification

- Build: PASSED (npm run build)
- Tests: 22/22 PASSED (vitest run bundle-generator)
- TypeScript: No errors (tsc --noEmit)
