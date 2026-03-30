---
gsd_state_version: 1.0
milestone: v20.0
milestone_name: "CatPaw Directory: Taxonomía de Negocio & UX Reorganización"
status: planning
last_updated: "2026-03-30"
last_activity: 2026-03-30 -- Milestone v20.0 started
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-30 — Milestone v20.0 started

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-30)

**Core value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.
**Current milestone:** v20.0 CatPaw Directory: Taxonomía de Negocio & UX Reorganización

## Phase Overview

(Phases TBD — roadmap pending)

## Decisions

- **Scope**: UX/UI milestone only — no changes to agent execution logic, canvas, or connectors
- **Taxonomy**: Fixed hierarchy (Empresa/Personal/Otros), not user-editable in v20.0
- **Department field**: `department TEXT DEFAULT 'other'` in cat_paws table
- **Existing agents**: Default to 'other' department automatically
- **Visual style**: violet-400 Empresa, sky-400 Personal, zinc-400 Otros

## Blockers

(None)

## Milestone History

### v19.0 -- Conector Google Drive (PARTIAL)
- 1/5 phases (82 complete), 18/56 requirements implemented
- Phase 82: data model + auth service + CRUD API complete
- Phases 83-86: RAG source, Canvas I/O, Wizard UI, CatBot tools — not completed

### v18.0 -- Holded MCP: Auditoria API + Safe Deletes (COMPLETE)
- 5 phases (77-81), ~26 requirements, all complete

### v17.0 -- Holded MCP (COMPLETE)
- 6 phases (71-76), ~58 requirements, all complete

### v16.0 -- CatFlow (COMPLETE)
- 8 phases (63-70), 76 requirements, 69 PASS / 5 PARTIAL / 2 FAIL (cosmetic)

### v15.0 -- Tasks Unified (COMPLETE)
- 6 phases (57-62), ~77 requirements, all complete

### v14.0 -- CatBrain UX Redesign (COMPLETE)
- 5 phases (52-56), 37 requirements, all complete

### v12.0 -- WebSearch CatBrain (COMPLETE)
- 2 phases (48-49), 28 requirements, all complete

### v11.0 -- LinkedIn MCP Connector (COMPLETE)
- 1 phase (47), 7 requirements, all complete

### v10.0 -- CatPaw: Unificacion de Agentes (COMPLETE)
- 6 phases (42-47), 50 requirements, all complete
