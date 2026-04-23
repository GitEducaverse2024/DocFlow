---
phase: 36-playwright-setup-test-specs
plan: 04
subsystem: e2e-specs-secondary
tags: [playwright, e2e, pom, canvas, connectors, catbot, dashboard, settings]
dependency_graph:
  requires: [playwright-config, base-pom, test-helpers, dashboard-pom]
  provides: [canvas-pom, connectors-pom, catbot-pom, settings-pom, canvas-spec, connectors-spec, catbot-spec, dashboard-spec, settings-spec]
  affects: []
tech_stack:
  added: []
  patterns: [page-object-model, serial-crud-tests, contextual-suggestion-tests, floating-panel-tests]
key_files:
  created:
    - app/e2e/pages/canvas.pom.ts
    - app/e2e/pages/connectors.pom.ts
    - app/e2e/pages/catbot.pom.ts
    - app/e2e/pages/settings.pom.ts
    - app/e2e/specs/canvas.spec.ts
    - app/e2e/specs/connectors.spec.ts
    - app/e2e/specs/catbot.spec.ts
    - app/e2e/specs/dashboard.spec.ts
    - app/e2e/specs/settings.spec.ts
  modified: []
decisions:
  - "Reused DashboardPOM from Plan 02 (already existed) for dashboard.spec.ts"
  - "Canvas spec uses serial CRUD: create via wizard, open editor, verify START node, drag, save, delete"
  - "CatBot spec verifies contextual suggestions differ between / and /projects using PAGE_SUGGESTIONS map"
  - "Dashboard spec handles both main dashboard and welcome screen (when no projects exist)"
  - "Connectors spec tests n8n_webhook type by default, verifies templates section with 3 suggested templates"
metrics:
  duration: 180s
  completed: "2026-03-13T19:45:00Z"
---

# Phase 36 Plan 04: Canvas, Connectors, CatBot, Dashboard, Settings POMs + E2E Specs Summary

4 POMs and 5 E2E spec files covering E2E-11 through E2E-15, with Spanish labels extracted from actual source components.

## What Was Built

### POMs (4 files)

1. **CanvasPOM** (`canvas.pom.ts`) - List page with wizard creation, editor with ReactFlow container, START node locator, drag-and-drop via mouse events, save/delete methods
2. **ConnectorsPOM** (`connectors.pom.ts`) - Type cards section ("Tipos de conector"), configured connectors table, create via Sheet dialog, test connection button ("Probar conector"), templates section ("Plantillas sugeridas")
3. **CatBotPOM** (`catbot.pom.ts`) - Floating trigger button (title="Abrir CatBot"), panel open/close, message input ("Escribe un mensaje..."), suggestion buttons, welcome text detection
4. **SettingsPOM** (`settings.pom.ts`) - Section locators for API Keys de LLMs, Procesamiento, Costes de modelos, CatBot Asistente IA, CatBot Seguridad Sudo, Modelos de Embeddings, Conexiones, Preferencias

### Specs (5 files)

1. **canvas.spec.ts** (E2E-11) - Serial CRUD: page loads, create with wizard, editor with START node, drag nodes, save, delete
2. **connectors.spec.ts** (E2E-12) - Serial CRUD: page loads with 4 type cards, create n8n_webhook connector, test connection, verify templates, delete
3. **catbot.spec.ts** (E2E-13) - Floating button visible, open panel, send message, contextual suggestions change between / and /projects, close panel
4. **dashboard.spec.ts** (E2E-14) - Summary cards (Proyectos, Agentes, Tareas, Conectores), token chart ("Uso de tokens"), activity ("Actividad reciente"), storage ("Almacenamiento")
5. **settings.spec.ts** (E2E-15) - Page loads, API keys section, processing section, CatBot section, CatBot security section, embeddings section, connections section

## Spanish Labels Used

All labels extracted from actual component source files:
- Canvas: "Canvas", "Nuevo", "No hay canvas creados", "Crear Canvas", "Inicio" (start node)
- Connectors: "Conectores", "Nuevo conector", "Tipos de conector", "Conectores configurados", "Plantillas sugeridas", "Probar conector", "Eliminar", "Usar plantilla"
- CatBot: "Abrir CatBot", "Cerrar", "Minimizar", "Limpiar historial", "Escribe un mensaje...", "Hola! Soy"
- Settings: "Configuracion", "API Keys de LLMs", "Procesamiento", "CatBot -- Asistente IA", "CatBot -- Seguridad Sudo", "Modelos de Embeddings", "Conexiones", "Preferencias"
- Dashboard: "Dashboard", "Proyectos", "Agentes", "Tareas", "Conectores", "Uso de tokens", "Actividad reciente", "Almacenamiento"

## Deviations from Plan

None - plan executed exactly as written. DashboardPOM from Plan 02 was already available.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create POMs for canvas, connectors, catbot, settings | e55827d | 4 POM files |
| 2 | Create E2E specs for canvas, connectors, catbot, dashboard, settings | 8e03ed5 | 5 spec files |

## Self-Check: PASSED

- All 4 POM files found: canvas.pom.ts, connectors.pom.ts, catbot.pom.ts, settings.pom.ts
- All 5 spec files found: canvas.spec.ts, connectors.spec.ts, catbot.spec.ts, dashboard.spec.ts, settings.spec.ts
- Commit e55827d: Task 1 (POMs)
- Commit 8e03ed5: Task 2 (specs)
- npm run build: passes
