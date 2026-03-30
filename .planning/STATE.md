---
gsd_state_version: 1.0
milestone: v21.0
milestone_name: "Skills Directory: Nueva Taxonomia, Skills Externos & Rediseno UX"
status: roadmap_complete
last_updated: "2026-03-30"
last_activity: 2026-03-30 -- Roadmap created (4 phases, 40 requirements)
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Current Position

Phase: 91 - DB + tipos + API + formulario (not started)
Plan: --
Status: Roadmap complete, ready for phase planning
Last activity: 2026-03-30 -- Roadmap created

```
[>>>>>>>>>>>>>>>>>>>>                                          ] 0/4 phases
```

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-30)

**Core value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.
**Current milestone:** v21.0 Skills Directory: Nueva Taxonomia, Skills Externos & Rediseno UX

## Phase Overview

| # | Phase | Reqs | Status |
|---|-------|------|--------|
| 91 | DB + tipos + API + formulario | 9 | Not started |
| 92 | Seeds de 20 skills nuevos | 6 | Not started |
| 93 | Directorio /skills rediseñado | 15 | Not started |
| 94 | i18n + build + verificacion | 7 | Not started |

**Total:** 4 phases, 40 requirements, 0 complete

## Decisions

- **Scope**: UX/UI + contenido -- sin cambios en logica de ejecucion ni inyeccion de skills
- **Taxonomy**: 5 categorias orientadas a valor: writing, analysis, strategy, technical, format
- **Category migration**: Reclasificar 5 seeds existentes a nuevas categorias
- **New skills**: 20 skills curados de repos publicos + originales DoCatFlow
- **Visual style**: emerald writing, blue analysis, violet strategy, amber technical, cyan format
- **Phase structure**: Linear chain 91->92->93->94 (data->content->directory->i18n)

## Blockers

(None)

## Accumulated Context

- v21.0 is UX/UI + content -- no skill injection, pipeline, or execution changes
- Old categories: documentation, analysis, communication, code, design, format
- New categories: writing, analysis, strategy, technical, format
- Page follows same expandable directory pattern as v20.0 /agents
- i18n must cover both es.json and en.json

## Milestone History

### v20.0 -- CatPaw Directory (COMPLETE)
- 4 phases (87-90), 40 requirements, all complete
- Department taxonomy, /agents directory redesign, CatBot tool, i18n

### v19.0 -- Conector Google Drive (PARTIAL)
- 2/5 phases (82, 85 complete), ~18 requirements implemented
- Phase 82: data model + auth service + CRUD API
- Phase 85: wizard UI + polling daemon

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
