# Milestones

## v25.1 Centro de Modelos (Shipped: 2026-04-08)

**Phases completed:** 5 phases (113-117), 10 plans

**Key accomplishments:**
- Health API with real alias/provider verification (/api/models/health)
- Centro de Modelos: 4-tab shell (Resumen, Proveedores, Modelos, Enrutamiento)
- Tab Modelos: MID cards grouped by tier (Elite/Pro/Libre), filters, en-uso badges, inline cost editing
- Tab Enrutamiento: compact routing table with health semaphores, smart model dropdown
- CatBot check_model_health tool (3 modes: alias, model, full self-diagnosis)
- UI cleanup: horizontal tabs (CatPower pattern), CatBoard rename, SystemHealth integration, CatTools menu
- New CatBot tools: list_mid_models, update_mid_model
- Removed: ModelPricingSettings, Embeddings placeholder, /system page

## v12.0 WebSearch CatBrain (Shipped: 2026-03-16)

**Phases completed:** 2 phases (48-49), 28 requirements

## v13.0 Conector Gmail (Shipped: 2026-03-16)

**Phases completed:** 2 phases (50-51), ~35 requirements

## v14.0 CatBrain UX Redesign (Shipped: 2026-03-21)

**Phases completed:** 5 phases (52-56), 37 requirements

## v15.0 Tasks Unified (Shipped: 2026-03-22)

**Phases completed:** 6 phases (57-62), ~77 requirements

**Key accomplishments:**
- Canvas as subagent step in task pipelines
- Fork/Join parallel branches (max 3) with output consolidation
- Cascade wizard (5-section vertical flow replacing 4-step stepper)
- Variable (N-times) and scheduled execution with internal scheduler
- Export system: ZIP bundles with Docker, runner HTML, install scripts
- Canvas removed from sidebar, accessed from Tasks

## v16.0 CatFlow (Shipped: 2026-03-22)

**Phases completed:** 8 phases (63-70), 76 requirements (69 PASS / 5 PARTIAL / 2 FAIL cosmetic)

**Key accomplishments:**
- Rename Tareas -> CatFlow (sidebar, routes, i18n, backward compat)
- 3 new canvas nodes: Scheduler, Storage, MultiAgent
- Config panel redesign: right sidebar w-80 + copy/paste (Ctrl+C/V)
- Inter-CatFlow communication: catflow_triggers, listen_mode, trigger chains
- Enhanced START (listen badge/handle) + Enhanced OUTPUT (notifications, triggers)
- CatBot: 4 new tools, E2E + API tests

## v17.0 Holded MCP (Shipped: 2026-03-24)

**Phases completed:** 6 phases (71-76), ~58 requirements

**Key accomplishments:**
- Fork iamsamuelfraga/mcp-holded (MIT), adapted to DoCatFlow pattern (systemd, HTTP transport port 8766)
- CRM module: leads, funnels, events, fuzzy ID resolver
- Projects module: CRUD, tasks, time tracking with batch registration
- Team module: employees, timesheets, clock actions, weekly summary
- Contacts improved: fuzzy matching, confidence score, context tool
- Invoicing simplified: quick_invoice, list, summary, pay, send, PDF
- DoCatFlow integration: 10 CatBot tools, Canvas MCP executor, System UI, E2E/API tests

## v18.0 Holded MCP: Auditoria API + Safe Deletes (Shipped: 2026-03-24)

**Phases completed:** 5 phases (77-81), ~26 requirements

**Key accomplishments:**
- Auditoria y correccion de 7 bugs criticos en campos API
- Sistema Safe Delete: confirmacion por email con tokens para 14 DELETE tools
- Tests de integracion contra API real de Holded
- System prompt CatPaw actualizado con campos criticos

## v19.0 Conector Google Drive (Partial: 2026-03-30)

**Phases completed:** 1/5 phases (82 of 82-86), 18/56 requirements

**Key accomplishments:**
- Google Drive data model (3 tables), auth service (SA + OAuth2), full CRUD API
- Phase 83 code written (RAG source + polling daemon) but pending verification
- Phases 84-86 not started (Canvas I/O, Wizard UI, CatBot tools)

## v20.0 CatPaw Directory (Active)

**Phases:** TBD (87+), requirements TBD

**Target features:**
- Taxonomía de departamentos en cat_paws (9 valores)
- Página /agents rediseñada como directorio por secciones expandibles
- Búsqueda en tiempo real, selector departamento obligatorio, badge en tarjetas
- CatBot tool actualizada, i18n completo

---
