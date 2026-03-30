---
gsd_state_version: 1.0
milestone: v20.0
milestone_name: "CatPaw Directory: Taxonomia de Negocio & UX Reorganizacion"
status: roadmap_complete
last_updated: "2026-03-30"
last_activity: 2026-03-30 -- Roadmap created (4 phases, 38 requirements)
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Current Position

Phase: 87 - DB + API (not started)
Plan: --
Status: Roadmap complete, ready for phase planning
Last activity: 2026-03-30 -- Roadmap created

```
[>>>>>>>>>>>>>>>>>>>>                                          ] 0/4 phases
```

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-30)

**Core value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.
**Current milestone:** v20.0 CatPaw Directory: Taxonomia de Negocio & UX Reorganizacion

## Phase Overview

| # | Phase | Reqs | Status |
|---|-------|------|--------|
| 87 | DB + API | 7 | Not started |
| 88 | Formulario con selector de departamento | 5 | Not started |
| 89 | Directorio /agents rediseñado | 18 | Not started |
| 90 | CatBot + i18n + verificacion build | 10 | Not started |

**Total:** 4 phases, 38 requirements, 0 complete

## Decisions

- **Scope**: UX/UI milestone only -- no changes to agent execution logic, canvas, or connectors
- **Taxonomy**: Fixed hierarchy (Empresa/Personal/Otros), not user-editable in v20.0
- **Department field**: `department TEXT DEFAULT 'other'` in cat_paws table
- **Existing agents**: Default to 'other' department automatically
- **Visual style**: violet-400 Empresa, sky-400 Personal, zinc-400 Otros
- **Phase structure**: Linear chain 87->88->89->90 (data->form->directory->integration)

## Blockers

(None)

## Accumulated Context

- v20.0 is purely UX/UI -- no agent execution, canvas, or connector changes
- 9 department values: direction, business, marketing, finance, production, logistics, hr, personal, other
- 3 visual groups: Empresa (7 sub-departments, violet), Personal (sky), Otros (zinc)
- i18n must cover both es.json and en.json

## Milestone History

### v19.0 -- Conector Google Drive (PARTIAL)
- 1/5 phases (82 complete), 18/56 requirements implemented
- Phase 82: data model + auth service + CRUD API complete
- Phases 83-86: RAG source, Canvas I/O, Wizard UI, CatBot tools -- not completed

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
