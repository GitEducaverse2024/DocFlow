# Roadmap: DoCatFlow

## Milestones

- v12.0 WebSearch CatBrain -- Phases 48-49 (shipped 2026-03-16) -- [archive](.planning/milestones/v12.0-ROADMAP.md)
- v13.0 Conector Gmail -- Phases 50-51 (shipped 2026-03-16)
- v14.0 CatBrain UX Redesign -- Phases 52-56 (shipped 2026-03-21) -- [archive](.planning/milestones/v14.0-ROADMAP.md)
- v15.0 Tasks Unified -- Phases 57-62 (shipped 2026-03-22) -- [archive](.planning/milestones/v15.0-ROADMAP.md)
- v16.0 CatFlow -- Phases 63-70 (shipped 2026-03-22) -- [archive](.planning/milestones/v16.0-ROADMAP.md)
- **v17.0 Holded MCP -- Phases 71-76 (active)**

---

## v17.0 — Holded MCP: CRM, Proyectos, Equipo y Facturación

**Goal:** Integrar Holded ERP/CRM con DoCatFlow mediante servidor MCP (patrón LinkedIn Intelligence). Servicio systemd en host, conector mcp_server, acceso desde CatBot y Canvas.

**Repo base:** `iamsamuelfraga/mcp-holded` (MIT) — ya cubre Invoice (60+ tools). Extender con CRM, Proyectos, Equipo.

### Phase 71 — Setup + Base del Servidor
**Goal:** Fork del repo, adaptarlo al patrón DoCatFlow, servicio systemd funcionando.
**Status:** in-progress (3/4 plans complete)
**Plans:** 71-01 (Fork+Setup), 71-02 (HTTP Client), 71-03 (Systemd+Script), 71-04 (Seed+Health+UI)
**Requirements:** SETUP-01, SETUP-02, SETUP-03, SETUP-04
**Priority:** CRITICAL

Plans:
- [x] 71-01-PLAN.md — Fork + Setup del Repositorio (wave 1)
- [x] 71-02-PLAN.md — HTTP Client: Rate Limiting, Key Masking, Module URLs (wave 1)
- [x] 71-03-PLAN.md — Systemd Service + Script de Instalacion (wave 2)
- [ ] 71-04-PLAN.md — Seed Conector + Health Check + UI en DoCatFlow (wave 2)

### Phase 72 — Módulo CRM (Leads, Funnels, Eventos)
**Goal:** El LLM puede gestionar el pipeline comercial completo en lenguaje natural.
**Status:** pending
**Plans:** 4 (funnels, leads CRUD+notas+tareas, eventos, id-resolver)
**Requirements:** CRM-01, CRM-02, CRM-03, CRM-04
**Priority:** CRITICAL

### Phase 73 — Módulo Proyectos + Registros Horarios
**Goal:** El LLM puede crear proyectos, asignar tareas y fichar horas en bloque.
**Status:** pending
**Plans:** 4 (proyectos, tareas proyecto, registros horarios+batch, date helper)
**Requirements:** PROJ-01, PROJ-02, PROJ-03, PROJ-04
**Priority:** CRITICAL

### Phase 74 — Módulo Equipo (Empleados + Control Horario)
**Goal:** Gestión de empleados y fichaje de jornada laboral.
**Status:** pending
**Plans:** 2 (empleados+config myId, control horario)
**Requirements:** TEAM-01, TEAM-02
**Priority:** HIGH

### Phase 75 — Contactos Mejorado + Facturación
**Goal:** Contactos con fuzzy matching + operaciones de facturación simplificada.
**Status:** pending
**Plans:** 3 (contactos mejorados, documentos/facturación, contexto general)
**Requirements:** CONT-01, FACT-01, CONT-02
**Priority:** HIGH

### Phase 76 — Integración DoCatFlow: CatBot + Canvas + Sistema + Tests
**Goal:** El MCP es accesible desde CatBot, Canvas y la página de Sistema.
**Status:** pending
**Plans:** 5 (CatBot tools, Canvas integración, /system+footer, tests E2E/API, documentación)
**Requirements:** INT-01, INT-02, INT-03, INT-04, INT-05
**Priority:** MEDIUM

---

### Dependencies

```
71 (setup) ──→ 72 (CRM)
71 (setup) ──→ 73 (proyectos)
71 (setup) ──→ 74 (equipo)
71 (setup) ──→ 75 (contactos+facturación)
72 + 73 + 74 + 75 ──→ 76 (integración DoCatFlow)
```

Phases 72-75 can run in parallel after 71. Phase 76 depends on all prior phases.

---
*Created: 2026-03-23*
*Last updated: 2026-03-23*
