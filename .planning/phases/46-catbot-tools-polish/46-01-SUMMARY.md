---
phase: 46-catbot-tools-polish
plan: 01
subsystem: catbot, dashboard, system, db
tags: [polish, catpaw, migration, tools, seeds]
dependency_graph:
  requires: [42-01, 43-01, 45-01]
  provides: [POLISH-01, POLISH-02, POLISH-03, POLISH-04, POLISH-05]
  affects: [catbot-tools, workers-page, dashboard, system-health, db-seeds]
tech_stack:
  added: []
  patterns: [catpaw-tools, migration-banner, mode-breakdown, seed-idempotent]
key_files:
  created: []
  modified:
    - app/src/lib/services/catbot-tools.ts
    - app/src/app/api/catbot/chat/route.ts
    - app/src/app/workers/page.tsx
    - app/src/app/api/dashboard/summary/route.ts
    - app/src/app/page.tsx
    - app/src/app/api/health/route.ts
    - app/src/hooks/use-system-health.ts
    - app/src/components/system/system-health-panel.tsx
    - app/src/lib/db.ts
decisions:
  - Backward compat aliases for create_agent/list_agents -> create_cat_paw/list_cat_paws
  - Dashboard API keeps agents field as catpawsTotal for backward compat
  - Seed CatPaws use fixed IDs with INSERT OR IGNORE for idempotency
  - System health panel replaces CatBrains metric with CatPaws activos
metrics:
  duration: 254s
  completed: "2026-03-15T14:22:44Z"
  tasks: 3
  files: 9
---

# Phase 46 Plan 01: CatBot Tools Polish Summary

CatBot tools migrated from custom_agents to cat_paws with mode-aware create/list, /workers replaced with migration banner, dashboard shows CatPaw breakdown by mode, system health shows CatPaws activos metric, and fresh installs get 2 seed CatPaws.

## Tasks Completed

### Task 1: CatBot tools -- replace agent tools with CatPaw tools + update system prompt
- **Commit:** 427005a
- Replaced create_agent/list_agents tool definitions with create_cat_paw/list_cat_paws
- create_cat_paw accepts mode parameter (chat/processor/hybrid)
- list_cat_paws supports optional mode filter, returns up to 15 results
- Backward compat: old tool names fall through to new implementations
- Updated FEATURE_KNOWLEDGE entries for agentes, workers, added catpaws
- System prompt queries cat_paws instead of custom_agents, references CatPaw model

### Task 2: Workers migration banner + Dashboard CatPaw stats + System metrics
- **Commit:** 8d66ae3
- /workers page replaced entirely with migration banner (no CRUD, no Sheet/Dialog)
- Dashboard API returns catpaws, catpaws_chat, catpaws_processor, catpaws_hybrid fields
- Dashboard UI shows PawPrint icon with "CatPaws" label and mode breakdown badges (violet/teal/amber)
- Health API includes catpaws_count in docflow section
- use-system-health hook updated with catpaws_count in type and initial state
- System health panel shows "CatPaws activos" instead of "CatBrains" metric

### Task 3: Seed 2 default CatPaws for fresh installs
- **Commit:** b0075db
- Seeds Analista (chat, violet) and Procesador de Docs (processor, teal) when cat_paws empty
- Fixed IDs (seed-analista-chat, seed-procesador-docs) with INSERT OR IGNORE
- Placed after all migration blocks, before cleanup section

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- TypeScript compiles clean (tsc --noEmit)
- Next.js build succeeds (npm run build)
- No references to custom_agents in catbot-tools.ts
- create_cat_paw present in TOOLS array, getToolsForLLM filter, and executeTool switch
