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
**Status:** complete (4/4 plans done)
**Plans:** 71-01 (Fork+Setup), 71-02 (HTTP Client), 71-03 (Systemd+Script), 71-04 (Seed+Health+UI)
**Requirements:** SETUP-01, SETUP-02, SETUP-03, SETUP-04
**Priority:** CRITICAL

Plans:
- [x] 71-01-PLAN.md — Fork + Setup del Repositorio (wave 1)
- [x] 71-02-PLAN.md — HTTP Client: Rate Limiting, Key Masking, Module URLs (wave 1)
- [x] 71-03-PLAN.md — Systemd Service + Script de Instalacion (wave 2)
- [x] 71-04-PLAN.md — Seed Conector + Health Check + UI en DoCatFlow (wave 2)

### Phase 72 — Módulo CRM (Leads, Funnels, Eventos)
**Goal:** El LLM puede gestionar el pipeline comercial completo en lenguaje natural.
**Status:** complete (4/4 plans done)
**Plans:** 72-01 (Funnels), 72-02 (ID Resolver), 72-03 (Leads CRUD+Notas+Tareas), 72-04 (Eventos)
**Requirements:** CRM-01, CRM-02, CRM-03, CRM-04
**Priority:** CRITICAL

Plans:
- [x] 72-01-PLAN.md — Funnel Tools: list + get (wave 1)
- [x] 72-02-PLAN.md — ID Resolver: fuzzy funnel/stage matching (wave 1)
- [x] 72-03-PLAN.md — Leads CRUD + Notes + Tasks: 8 tools (wave 2)
- [x] 72-04-PLAN.md — Events Tools: list + create (wave 2)

### Phase 73 — Módulo Proyectos + Registros Horarios
**Goal:** El LLM puede crear proyectos, asignar tareas y fichar horas en bloque.
**Status:** shipped (4/4 plans executed)
**Plans:** 73-01 (Projects CRUD), 73-02 (Project Tasks), 73-03 (Time Tracking), 73-04 (Date Helpers)
**Requirements:** PROJ-01, PROJ-02, PROJ-03, PROJ-04
**Priority:** CRITICAL

Plans:
- [x] 73-01-PLAN.md — Projects CRUD + Summary: 6 tools (wave 1)
- [x] 73-02-PLAN.md — Project Tasks CRUD: 4 tools (wave 1)
- [x] 73-03-PLAN.md — Time Tracking CRUD + cross-project listing: 6 tools (wave 2)
- [x] 73-04-PLAN.md — Date Helper utilities: 5 conversion functions (wave 1)

### Phase 74 — Módulo Equipo (Empleados + Control Horario)
**Goal:** Gestión de empleados y fichaje de jornada laboral.
**Status:** shipped (2/2 plans executed)
**Plans:** 74-01 (Employees CRUD+Config), 74-02 (Timesheets+Clock+Summary)
**Requirements:** TEAM-01, TEAM-02
**Priority:** HIGH

Plans:
- [x] 74-01-PLAN.md — Employee CRUD + Search + MyId Config: 5 tools (wave 1)
- [x] 74-02-PLAN.md — Timesheet + Clock Actions + Weekly Summary: 7 tools (wave 2)

### Phase 75 — Contactos Mejorado + Facturación
**Goal:** Contactos con fuzzy matching + operaciones de facturación simplificada.
**Status:** complete (3/3 plans done)
**Plans:** 75-01 (Contact Search+Resolver), 75-02 (Simplified Invoicing), 75-03 (Contact Context)
**Requirements:** CONT-01, FACT-01, CONT-02
**Priority:** HIGH

Plans:
- [x] 75-01-PLAN.md — Contact Search + ID Resolver: 2 tools + resolveContactId utility (wave 1)
- [x] 75-02-PLAN.md — Simplified Invoicing: quick_invoice + list_invoices + invoice_summary (wave 2)
- [x] 75-03-PLAN.md — Contact Context: composite tool with details + invoices + balance (wave 2)

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
