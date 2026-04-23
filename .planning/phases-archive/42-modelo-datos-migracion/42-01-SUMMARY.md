---
phase: 42-modelo-datos-migracion
plan: 01
subsystem: data-model
tags: [database, migration, types, catpaw]
dependency_graph:
  requires: []
  provides: [cat_paws-table, cat_paw_catbrains-table, cat_paw_connectors-table, cat_paw_agents-table, cat_paw_skills-table, CatPaw-types]
  affects: [api-routes-phase-43, executor-phase-44, ui-phase-45]
tech_stack:
  added: []
  patterns: [INSERT-OR-IGNORE-idempotent-migration, CHECK-constraint-mode-enum, self-referencing-FK]
key_files:
  created:
    - app/src/lib/types/catpaw.ts
  modified:
    - app/src/lib/db.ts
decisions:
  - "Migrations are idempotent (INSERT OR IGNORE) — safe on every restart"
  - "Old tables (custom_agents, docs_workers, agent_skills, worker_skills) preserved for backward compat until Phase 43"
  - "docs_workers.system_prompt maps to both cat_paws.system_prompt and processing_instructions"
  - "custom_agents has no updated_at — use created_at for both fields"
metrics:
  duration: 117s
  completed: "2026-03-15T12:31:00Z"
  tasks_completed: 3
  tasks_total: 3
---

# Phase 42 Plan 01: Data Model + Migration Summary

5 CatPaw SQLite tables with idempotent data migration from custom_agents (chat) and docs_workers (processor), plus TypeScript interfaces for all entities and relations.

## What Was Done

### Task 1: Create 5 CatPaw tables (60fd965)
Added a single `db.exec()` block with all 5 tables:
- **cat_paws**: 20 columns including mode CHECK constraint (chat/processor/hybrid), temperature REAL, department_tags JSON, openclaw fields
- **cat_paw_catbrains**: paw-to-catbrain with query_mode and priority
- **cat_paw_connectors**: paw-to-connector with usage_hint
- **cat_paw_agents**: self-referencing paw-to-paw with relationship types (collaborator/delegate/supervisor)
- **cat_paw_skills**: paw-to-skill junction with composite PK

### Task 2: Migrate existing data (5eeee51)
3 idempotent migration blocks:
- custom_agents -> cat_paws (mode='chat'), emoji -> avatar_emoji, created_at used for both timestamps
- docs_workers -> cat_paws (mode='processor'), system_prompt maps to both system_prompt and processing_instructions
- agent_skills + worker_skills -> cat_paw_skills, preserving original IDs as paw_id

### Task 3: TypeScript interfaces (95b24ae)
Created `app/src/lib/types/catpaw.ts` with 6 exported interfaces:
- CatPaw, CatPawCatBrain, CatPawConnector, CatPawAgent, CatPawSkill
- CatPawWithCounts (extended type for API list responses with relation counts)

## Verification Results
- 5 tables confirmed via sqlite_master query
- 3 docs_workers migrated as processors (vision-product, prd-generator, executive-summary)
- 0 custom_agents to migrate (table empty in current DB)
- npm run build passes clean

## Deviations from Plan

None — plan executed exactly as written.
