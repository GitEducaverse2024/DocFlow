---
phase: 76-docatflow-integration
plan: 03
subsystem: seed-connector-health-panel
tags: [holded, mcp, seed, health-panel, system]
dependency_graph:
  requires: [holded-mcp-tools]
  provides: [complete-seed-catalog, health-tools-count]
  affects: [system-health-panel, connectors-table]
tech_stack:
  patterns: [insert-or-update-seed, typed-health-status, module-badges]
key_files:
  modified:
    - app/src/lib/db.ts
    - app/src/components/system/system-health-panel.tsx
    - app/src/hooks/use-system-health.ts
decisions:
  - "Extract holdedConfig/holdedDescription as shared variables for INSERT and UPDATE branches"
  - "Use else branch (not separate UPDATE) to avoid double execution on fresh installs"
  - "Add tools_count to HoldedMcpStatus interface rather than using Record<string, unknown> cast"
metrics:
  duration: 281s
  completed: "2026-03-23"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 76 Plan 03: Seed Connector + Health Panel Enhancement Summary

Updated seed-holded-mcp connector from 6 tools to ~60 tools across 4 modules with UPDATE path for existing installations; enhanced System health panel with tools_count and module badges.

## What Was Done

### Task 1: Update seed connector with full tool catalog
- Replaced 6-tool config with 58 tools organized by module (Facturacion, CRM, Proyectos, Equipo)
- Added `modules` field to config JSON: `['invoicing', 'crm', 'projects', 'team']`
- Extracted config and description into shared variables to avoid duplication
- Added UPDATE branch for existing installations (INSERT OR IGNORE won't update rows that already exist)
- Updated description to reflect all 4 modules
- **Commit:** 1bf08a3

### Task 2: Enhance System health panel card for Holded MCP
- Added `tools_count?: number` to `HoldedMcpStatus` interface in use-system-health.ts
- Added tools_count display when Holded MCP is connected (e.g. "60 herramientas MCP")
- Added module badges as violet pills: Facturacion, CRM, Proyectos, Equipo
- Health route already returns tools_count from /health endpoint (no changes needed)
- Diagnostic command was already correct (systemctl --user status holded-mcp)
- **Commit:** 7ff0cc1

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type error for tools_count in JSX**
- **Found during:** Task 2
- **Issue:** `Record<string, unknown>` cast caused "Type 'unknown' is not assignable to type 'ReactNode'" because `&&` short-circuit could return `unknown` value
- **Fix:** Added `tools_count` to `HoldedMcpStatus` interface and used `!!` boolean coercion in JSX conditional
- **Files modified:** app/src/hooks/use-system-health.ts, app/src/components/system/system-health-panel.tsx

## Verification

- npm run build: PASSED (no errors)
- Seed connector: 58 tools across 4 modules with UPDATE path
- Health panel: tools_count + module badges when connected
- Health route: Already returns tools_count (no changes needed)
