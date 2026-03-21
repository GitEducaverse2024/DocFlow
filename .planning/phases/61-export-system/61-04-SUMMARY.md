---
phase: 61-export-system
plan: 04
subsystem: import
tags: [bundle, zip, import, idempotent, api]
dependency_graph:
  requires: [bundle structure from 61-01, cat_paws table, canvases table, skills table, tasks table, task_steps table]
  provides: [importBundle service, validateManifest, POST /api/tasks/import]
  affects: [cat_paws rows, skills rows, canvases rows, tasks rows, task_steps rows]
tech_stack:
  added: []
  patterns: [idempotent name matching, ID remapping, FormData ZIP upload, temp dir cleanup]
key_files:
  created:
    - app/src/lib/services/bundle-importer.ts
    - app/src/app/api/tasks/import/route.ts
    - app/src/lib/services/bundle-importer.test.ts
  modified: []
decisions:
  - "Skills imported without cat_paw_skills re-linking -- bundle stores skill_ids at step level, not via junction table"
  - "Task always created as new (never skipped) with status=draft and run_count=0"
  - "Bundle directory detection searches for manifest.json in extracted subdirectories"
metrics:
  duration: 221s
  completed: "2026-03-21T19:45:56Z"
  tasks: 4
  tests: 7
  files_created: 3
  files_modified: 0
---

# Phase 61 Plan 04: Import Endpoint + Bundle Importer Service Summary

Bundle importer service with idempotent name-matching that imports agents, skills, canvases, and tasks from exported ZIP bundles, remapping all cross-reference IDs.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Create bundle-importer.ts service | e836874 | app/src/lib/services/bundle-importer.ts |
| 2 | Create POST /api/tasks/import route | e836874 | app/src/app/api/tasks/import/route.ts |
| 3 | Unit tests for validateManifest | e836874 | app/src/lib/services/bundle-importer.test.ts |
| 4 | Build validation (npm run build + vitest) | e836874 | - |

## Implementation Details

### Bundle Importer Service
- `validateManifest(path)`: Validates manifest.json exists, is valid JSON, has bundle_version and task.name
- `importBundle(extractedDir)`: Orchestrates import in dependency order: agents -> skills -> canvases -> task
- Agents matched by name in `cat_paws` table -- existing skipped, new created with full field mapping
- Skills matched by name in `skills` table -- new ones get `source='imported'`
- Canvases matched by name in `canvases` table -- new ones get `status='active'`
- Task always created as new with `status='draft'`, `run_count=0`
- All step `agent_id` and `canvas_id` references remapped from old to new IDs
- Warnings collected for unmapped references

### Import API Route
- POST /api/tasks/import accepts FormData with `file` field (ZIP)
- Extracts to temp directory using `unzip` (available in Docker image)
- Searches extracted directories for one containing `manifest.json`
- Cleanup via `finally` block ensures temp files removed even on error
- Returns 201 with ImportResult summary on success

### Test Coverage
- 7 tests covering manifest validation: missing file, invalid JSON, missing bundle_version, missing task, missing task.name, full valid manifest, minimal valid manifest

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused insertPawSkill variable**
- **Found during:** Task 4 (build validation)
- **Issue:** ESLint flagged unused `insertPawSkill` prepared statement
- **Fix:** Removed the variable; cat_paw_skills linkage not needed since bundle stores skill_ids at step level
- **Files modified:** app/src/lib/services/bundle-importer.ts

**2. [Rule 1 - Bug] Fixed let -> const for flowData**
- **Found during:** Task 4 (build validation)
- **Issue:** ESLint prefer-const flagged `flowData` variable
- **Fix:** Changed `let` to `const`
- **Files modified:** app/src/lib/services/bundle-importer.ts

## Completion Criteria

- [x] POST /api/tasks/import accepts ZIP upload and returns import summary
- [x] Manifest validation rejects invalid bundles with clear error messages
- [x] Agents imported idempotently by name -- existing skipped, new created
- [x] Skills imported idempotently by name
- [x] Canvases imported idempotently by name
- [x] Task always created as new with remapped step references
- [x] ID remapping covers agent_id, canvas_id across all steps
- [x] Temp files cleaned up after import
- [x] Unit tests pass (7/7)
- [x] Build passes
