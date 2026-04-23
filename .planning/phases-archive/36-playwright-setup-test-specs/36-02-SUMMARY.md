---
phase: 36-playwright-setup-test-specs
plan: 02
subsystem: e2e-testing
tags: [playwright, e2e, pom, specs, navigation, projects, sources, processing, rag]
dependency_graph:
  requires: [playwright-config, base-pom, test-fixtures, test-helpers]
  provides: [sidebar-pom, dashboard-pom, projects-pom, sources-pom, processing-pom, rag-pom, navigation-spec, projects-spec, sources-spec, processing-spec, rag-spec]
  affects: []
tech_stack:
  added: []
  patterns: [page-object-model, serial-test-suites, api-fixture-setup, graceful-service-degradation]
key_files:
  created:
    - app/e2e/pages/sidebar.pom.ts
    - app/e2e/pages/dashboard.pom.ts
    - app/e2e/pages/projects.pom.ts
    - app/e2e/pages/sources.pom.ts
    - app/e2e/pages/processing.pom.ts
    - app/e2e/pages/rag.pom.ts
    - app/e2e/specs/navigation.spec.ts
    - app/e2e/specs/projects.spec.ts
    - app/e2e/specs/sources.spec.ts
    - app/e2e/specs/processing.spec.ts
    - app/e2e/specs/rag.spec.ts
  modified: []
decisions:
  - "POMs use exact Spanish labels extracted from component source files (e.g. 'Configuracion' from sidebar.tsx navItems)"
  - "Specs that depend on external services (LLM, Qdrant, Ollama) verify UI states not output quality"
  - "Sources/Processing/RAG specs create test projects via API in beforeAll, delete in afterAll for isolation"
  - "RAG query test handles Qdrant-unavailable gracefully with OR assertions (results OR error message visible)"
  - "Project delete uses the 2-step confirmation dialog (Continuar then type name then Eliminar permanentemente)"
metrics:
  duration: 264s
  completed: "2026-03-13T18:41:49Z"
---

# Phase 36 Plan 02: POMs + E2E Specs for Navigation, Projects, Sources, Processing, RAG Summary

Created 6 Page Object Models with typed locators using exact Spanish UI labels, and 5 E2E spec files covering E2E-01 through E2E-05 with serial CRUD flows, tab mode switching, and graceful service degradation.

## What Was Built

### Task 1: 6 Page Object Models (all extend BasePage)

**SidebarPOM** — Nav link locators matching all 11 sidebar items from sidebar.tsx, footer area (service status dots + main footer), CatBot floating button (title="Abrir CatBot"), notification bell (aria-label="Notificaciones"), breadcrumb area. Includes `clickNav(label)` and `allNavLinks()` methods.

**DashboardPOM** — Summary card locators (Proyectos, Agentes, Tareas, Conectores), token usage chart (recharts container), "Actividad reciente", "Almacenamiento", "Top modelos", "Top agentes" sections. `goto()` navigates to `/`.

**ProjectsPOM** — "Nuevo Proyecto" button, search input (placeholder "Buscar proyectos..."), pipeline nav with 5 step labels (Fuentes, Procesar, Historial, RAG, Chat). Methods: `createProject()` fills wizard step 1 (name, description, purpose) and saves as draft; `openProject()` clicks "Ver Detalles"; `deleteProject()` handles the 2-step confirmation dialog.

**SourcesPOM** — Tab locators for Archivos/URLs/YouTube/Notas, hidden file input for react-dropzone uploads, search input (placeholder "Buscar..."). `changeMode()` clicks the corresponding tab to switch source input mode. `uploadFile()` uses setInputFiles.

**ProcessingPOM** — Agent selector area, model selector combobox, process button ("Procesar con {name}"), streaming indicator, stop button. `selectAgent()` and `triggerProcessing()` methods.

**RagPOM** — "Indexar documentos" button, "Re-indexar" button, progress bar/message, stats cards grid (Vectores, Modelo embeddings, Dimensiones, Coleccion), query input (placeholder "Escribe tu pregunta..."), query submit button, query results area. `queryRag()` fills input and clicks submit. `reindex()` handles confirm dialog.

### Task 2: 5 E2E Spec Files

**navigation.spec.ts (E2E-01)** — 6 tests: sidebar loads with all nav links, all links navigate correctly, breadcrumb/heading updates after navigation, footer with service status visible, CatBot floating button visible, notification bell visible.

**projects.spec.ts (E2E-02)** — 4 serial tests: create project via wizard, verify project appears in list, open project shows 5 pipeline steps, delete with 2-step confirmation dialog then verify removal.

**sources.spec.ts (E2E-03)** — 5 serial tests with API setup/teardown: upload file appears in list, source shows status, "cambiar modo" switches between Archivos/URLs/Notas tabs, search filters sources, delete source via bulk selection. Uses `path.resolve` for fixture file paths.

**processing.spec.ts (E2E-04)** — 3 serial tests with API setup/teardown: processing panel shows process button, trigger processing shows loading state (gracefully handles no-agent-available case), processing history section visible.

**rag.spec.ts (E2E-05)** — 4 serial tests with API setup/teardown: RAG panel shows index button, trigger indexing shows progress, stats cards appear (or config if not indexed), query submission verifies input/submit/response area with Qdrant-unavailable graceful handling.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- All 6 POM files exist under `app/e2e/pages/`
- All 5 spec files exist under `app/e2e/specs/`
- POMs use Spanish labels extracted from actual component source
- Specs use `testName()` helper with [TEST] prefix
- Specs with CRUD use `test.describe.serial()`
- navigation.spec.ts has breadcrumb/heading and footer tests
- sources.spec.ts has "cambiar modo" test step (changeMode method)
- rag.spec.ts has query submission and response verification with graceful degradation
- `npm run build` passes

## Self-Check: PASSED

- All 11 created files verified on disk
- Commit 55c0d51: feat(36-02): add 6 Page Object Models for E2E test specs
- Commit 5c3098a: feat(36-02): add 5 E2E spec files covering E2E-01 through E2E-05
