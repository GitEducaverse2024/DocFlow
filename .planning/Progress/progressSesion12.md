# DoCatFlow - Sesion 12: Playwright Setup + Test Specs (Phase 36)

> Funcionalidades implementadas sobre la base documentada en `progressSesion11.md`. Esta sesion ejecuta la Phase 36 del milestone v7.0: instalacion de Playwright, configuracion completa de testing E2E, 15 Page Object Models, 15 specs E2E, 4 specs API, fixtures compartidos, SQLite reporter, y global setup/teardown.

---

## Indice

1. [Resumen de cambios](#1-resumen-de-cambios)
2. [Plan 36-01: Infraestructura Playwright](#2-plan-36-01-infraestructura-playwright)
3. [Plan 36-02: POMs + E2E Specs (Navegacion, Proyectos, Fuentes, Procesamiento, RAG)](#3-plan-36-02-poms--e2e-specs-navegacion-proyectos-fuentes-procesamiento-rag)
4. [Plan 36-03: POMs + E2E Specs (Chat, Agentes, Workers, Skills, Tareas)](#4-plan-36-03-poms--e2e-specs-chat-agentes-workers-skills-tareas)
5. [Plan 36-04: POMs + E2E Specs (Canvas, Conectores, CatBot, Dashboard, Settings)](#5-plan-36-04-poms--e2e-specs-canvas-conectores-catbot-dashboard-settings)
6. [Plan 36-05: API Specs + Test Fixtures](#6-plan-36-05-api-specs--test-fixtures)
7. [Commits de la fase](#7-commits-de-la-fase)
8. [Archivos nuevos](#8-archivos-nuevos)
9. [Patrones establecidos](#9-patrones-establecidos)
10. [Decisiones tecnicas](#10-decisiones-tecnicas)

---

## 1. Resumen de cambios

### Phase 36: Playwright Setup + Test Specs — 5 planes, 23 requisitos (PLAY-01..04, E2E-01..15, API-01..04)

| Plan | Que se construyo | Requisitos | Wave |
|------|-----------------|------------|------|
| 36-01 | Playwright install, config, base POM, helpers, fixtures, global setup/teardown, SQLite reporter, test_runs table | PLAY-01, PLAY-02, PLAY-04 | 1 |
| 36-02 | 6 POMs (sidebar, dashboard, projects, sources, processing, rag) + 5 E2E specs (E2E-01..05) | E2E-01, E2E-02, E2E-03, E2E-04, E2E-05 | 2 |
| 36-03 | 5 POMs (chat, agents, workers, skills, tasks) + 5 E2E specs (E2E-06..10) | E2E-06, E2E-07, E2E-08, E2E-09, E2E-10 | 2 |
| 36-04 | 4 POMs (canvas, connectors, catbot, settings) + 5 E2E specs (E2E-11..15) | E2E-11, E2E-12, E2E-13, E2E-14, E2E-15 | 2 |
| 36-05 | 4 API specs (projects, tasks, canvas, system) + test-fixtures.ts con 16 POMs | API-01, API-02, API-03, API-04, PLAY-03 | 3 |
| **Total** | | **23/23 requirements** | |

### Transformacion principal

El proyecto pasa de no tener ningun test automatizado a contar con una suite completa de 19 specs Playwright: 15 E2E specs que cubren todas las secciones de la UI con Page Object Model, 4 API specs para CRUD de recursos, un SQLite reporter que guarda resultados en la DB, y fixtures compartidos que inyectan todos los POMs como dependencias tipadas.

---

## 2. Plan 36-01: Infraestructura Playwright

### Instalacion y configuracion

- `@playwright/test` como devDependency
- `playwright.config.ts` con `workers: 1` (previene lock errors en SQLite)
- `baseURL: http://localhost:3500` (puerto de DocFlow)
- Scripts npm: `test:e2e`, `test:e2e:headed`, `test:e2e:report`

### Base POM (`app/e2e/pages/base.page.ts`)

Clase base que todos los POMs extienden:

| Metodo | Proposito |
|--------|-----------|
| `navigateTo(path)` | Navega a la URL base + path |
| `waitForLoad()` | Espera `networkidle` |
| `getByTestId(id)` | Shortcut para `page.getByTestId()` |
| `expectVisible(locator)` | Assert con timeout configurable |

### Test Helpers (`app/e2e/fixtures/`)

- `sample.txt` — archivo de muestra para tests de upload de fuentes
- `test-fixtures.ts` — extiende `test` de Playwright con todos los 16 POMs como fixtures tipados

### Global Setup / Teardown

- `globalSetup.ts` — crea proyecto con prefijo `[TEST]` para aislamiento
- `globalTeardown.ts` — limpia todos los proyectos/tareas/canvas con prefijo `[TEST]`

### SQLite Reporter (`app/e2e/reporters/sqlite-reporter.ts`)

Reporter custom que guarda resultados en tabla `test_runs`:

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `id` | TEXT PK | UUID del run |
| `status` | TEXT | running/completed/failed |
| `total` | INTEGER | Total de tests |
| `passed` | INTEGER | Tests exitosos |
| `failed` | INTEGER | Tests fallidos |
| `skipped` | INTEGER | Tests omitidos |
| `duration_ms` | INTEGER | Duracion total en ms |
| `results_json` | TEXT | JSON con detalle por test: `{ title, file, status, duration, error? }` |
| `created_at` | TEXT | Timestamp ISO |

### Tabla test_runs en db.ts

```sql
CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'running',
  total INTEGER DEFAULT 0,
  passed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  results_json TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
)
```

---

## 3. Plan 36-02: POMs + E2E Specs (Navegacion, Proyectos, Fuentes, Procesamiento, RAG)

### Page Object Models (6)

| POM | Archivo | Locators/Metodos clave |
|-----|---------|----------------------|
| SidebarPOM | `sidebar.pom.ts` | 11 nav links, footer servicios, CatBot toggle, bell, breadcrumb |
| DashboardPOM | `dashboard.pom.ts` | summary cards, charts, activity sections |
| ProjectsPOM | `projects.pom.ts` | create/open/delete/search, pipeline nav |
| SourcesPOM | `sources.pom.ts` | upload, changeMode tabs, search, delete |
| ProcessingPOM | `processing.pom.ts` | agent/model selectors, process button |
| RagPOM | `rag.pom.ts` | index, progress, stats, queryRag, reindex |

### E2E Specs (5)

| Spec | Archivo | Tests | Descripcion |
|------|---------|-------|-------------|
| E2E-01 | `navigation.spec.ts` | 6 | Sidebar links, footer, breadcrumbs |
| E2E-02 | `projects.spec.ts` | 4 serial | CRUD proyecto (crear, abrir, buscar, eliminar) |
| E2E-03 | `sources.spec.ts` | 5 serial | Upload, cambiar modo, buscar, eliminar |
| E2E-04 | `processing.spec.ts` | 3 serial | Seleccionar agente/modelo, procesar |
| E2E-05 | `rag.spec.ts` | 4 serial | Indexar, verificar stats, query, reindexar |

---

## 4. Plan 36-03: POMs + E2E Specs (Chat, Agentes, Workers, Skills, Tareas)

### Page Object Models (5)

| POM | Archivo | Locators/Metodos clave |
|-----|---------|----------------------|
| ChatPOM | `chat.pom.ts` | message input, send, example questions, streaming locators |
| AgentsPOM | `agents.pom.ts` | CRUD con modo Manual en AgentCreator dialog |
| WorkersPOM | `workers.pom.ts` | Sheet/Dialog CRUD pattern |
| SkillsPOM | `skills.pom.ts` | Grid layout CRUD, instructions field |
| TasksPOM | `tasks.pom.ts` | List + wizard de 4 pasos |

### E2E Specs (5)

| Spec | Archivo | Tests | Descripcion |
|------|---------|-------|-------------|
| E2E-06 | `chat.spec.ts` | 3 serial | Input visible, examples, enviar + respuesta |
| E2E-07 | `agents.spec.ts` | 5 serial | Load, secciones, crear, editar, eliminar |
| E2E-08 | `workers.spec.ts` | 4 serial | Load, crear, editar, eliminar |
| E2E-09 | `skills.spec.ts` | 4 serial | Load, crear, editar, eliminar |
| E2E-10 | `tasks.spec.ts` | 3 serial | Load, templates, wizard |

---

## 5. Plan 36-04: POMs + E2E Specs (Canvas, Conectores, CatBot, Dashboard, Settings)

### Page Object Models (4)

| POM | Archivo | Locators/Metodos clave |
|-----|---------|----------------------|
| CanvasPOM | `canvas.pom.ts` | Wizard, editor, drag methods |
| ConnectorsPOM | `connectors.pom.ts` | CRUD + test connection |
| CatBotPOM | `catbot.pom.ts` | Floating panel + suggestions |
| SettingsPOM | `settings.pom.ts` | 7 section locators |

### E2E Specs (5)

| Spec | Archivo | Tests | Descripcion |
|------|---------|-------|-------------|
| E2E-11 | `canvas.spec.ts` | serial | CRUD canvas completo |
| E2E-12 | `connectors.spec.ts` | serial | CRUD conectores |
| E2E-13 | `catbot.spec.ts` | - | Sugerencias contextuales |
| E2E-14 | `dashboard.spec.ts` | - | Summary cards, chart, activity, storage |
| E2E-15 | `settings.spec.ts` | - | Visibilidad de 7 secciones |

---

## 6. Plan 36-05: API Specs + Test Fixtures

### API Specs (4)

| Spec | Archivo | Endpoints | Tests |
|------|---------|-----------|-------|
| API-01 | `projects.api.spec.ts` | POST 201, GET paginated, GET by id, DELETE + 404 verify | 4 |
| API-02 | `tasks.api.spec.ts` | CRUD con enriched response (steps_count, agents) | 4 |
| API-03 | `canvas.api.spec.ts` | CRUD con `{id, redirectUrl}` response shape | 4 |
| API-04 | `system.api.spec.ts` | Health check, connectors list, dashboard summary (7 numeric fields) | 3 |

### Test Fixtures (`app/e2e/fixtures/test-fixtures.ts`)

Extiende `test` de Playwright con typed Fixtures para los 16 POMs:

```typescript
type Fixtures = {
  sidebarPage: SidebarPOM;
  dashboardPage: DashboardPOM;
  projectsPage: ProjectsPOM;
  sourcesPage: SourcesPOM;
  processingPage: ProcessingPOM;
  ragPage: RagPOM;
  chatPage: ChatPOM;
  agentsPage: AgentsPOM;
  workersPage: WorkersPOM;
  skillsPage: SkillsPOM;
  tasksPage: TasksPOM;
  canvasPage: CanvasPOM;
  connectorsPage: ConnectorsPOM;
  catbotPage: CatBotPOM;
  settingsPage: SettingsPOM;
  dashboardHomePage: DashboardPOM;
};
```

---

## 7. Commits de la fase

| Commit | Tipo | Descripcion |
|--------|------|-------------|
| `4712bdd` | feat | Install Playwright, create config, update Dockerfile and db schema |
| `189c51d` | feat | Add base POM, test helpers, fixtures, global setup/teardown, SQLite reporter |
| `a924aeb` | docs | Complete Playwright setup + test infrastructure plan |
| `55c0d51` | feat | Add 6 Page Object Models for E2E test specs |
| `5c3098a` | feat | Add 5 E2E spec files covering E2E-01 through E2E-05 |
| `58c1cd4` | feat | Add POMs for chat, agents, workers, skills, tasks |
| `2ab2894` | feat | Add E2E specs for chat, agents, workers, skills, tasks |
| `e55827d` | feat | Add POMs for canvas, connectors, catbot, settings |
| `8e03ed5` | feat | Add E2E specs for canvas, connectors, catbot, dashboard, settings |
| `d8e85f6` | docs | Complete POMs + E2E specs for navigation, projects, sources, processing, RAG |
| `300e651` | docs | Complete Chat/Agents/Workers/Skills/Tasks POMs + E2E specs plan |
| `be9e2d9` | docs | Complete canvas/connectors/catbot/dashboard/settings POMs + specs plan |
| `31c5cde` | feat | Add 4 API spec files for projects, tasks, canvas, system |
| `e2b4a94` | feat | Finalize test-fixtures.ts with all 15 POMs wired |
| `882e4f5` | docs | Complete API specs + test-fixtures plan — Phase 36 done |

---

## 8. Archivos nuevos

### Infraestructura (7)

| Archivo | Proposito |
|---------|-----------|
| `app/playwright.config.ts` | Config Playwright: workers:1, baseURL, reporter SQLite |
| `app/e2e/pages/base.page.ts` | Clase base para todos los POMs |
| `app/e2e/fixtures/test-fixtures.ts` | Fixtures tipados con 16 POMs |
| `app/e2e/fixtures/sample.txt` | Archivo muestra para tests de upload |
| `app/e2e/reporters/sqlite-reporter.ts` | Reporter SQLite custom |
| `app/e2e/global-setup.ts` | Crea datos [TEST] de prueba |
| `app/e2e/global-teardown.ts` | Limpia datos [TEST] |

### Page Object Models (15)

| Archivo | Seccion |
|---------|---------|
| `app/e2e/pages/sidebar.pom.ts` | Sidebar/navegacion |
| `app/e2e/pages/dashboard.pom.ts` | Dashboard |
| `app/e2e/pages/projects.pom.ts` | Proyectos |
| `app/e2e/pages/sources.pom.ts` | Fuentes |
| `app/e2e/pages/processing.pom.ts` | Procesamiento |
| `app/e2e/pages/rag.pom.ts` | RAG |
| `app/e2e/pages/chat.pom.ts` | Chat |
| `app/e2e/pages/agents.pom.ts` | Agentes |
| `app/e2e/pages/workers.pom.ts` | Workers |
| `app/e2e/pages/skills.pom.ts` | Skills |
| `app/e2e/pages/tasks.pom.ts` | Tareas |
| `app/e2e/pages/canvas.pom.ts` | Canvas |
| `app/e2e/pages/connectors.pom.ts` | Conectores |
| `app/e2e/pages/catbot.pom.ts` | CatBot |
| `app/e2e/pages/settings.pom.ts` | Configuracion |

### E2E Specs (15)

| Archivo | ID | Seccion |
|---------|-----|---------|
| `app/e2e/specs/navigation.spec.ts` | E2E-01 | Navegacion sidebar |
| `app/e2e/specs/projects.spec.ts` | E2E-02 | CRUD proyectos |
| `app/e2e/specs/sources.spec.ts` | E2E-03 | Gestion fuentes |
| `app/e2e/specs/processing.spec.ts` | E2E-04 | Procesamiento docs |
| `app/e2e/specs/rag.spec.ts` | E2E-05 | RAG indexacion/query |
| `app/e2e/specs/chat.spec.ts` | E2E-06 | Chat conversacional |
| `app/e2e/specs/agents.spec.ts` | E2E-07 | CRUD agentes |
| `app/e2e/specs/workers.spec.ts` | E2E-08 | CRUD workers |
| `app/e2e/specs/skills.spec.ts` | E2E-09 | CRUD skills |
| `app/e2e/specs/tasks.spec.ts` | E2E-10 | Tareas + wizard |
| `app/e2e/specs/canvas.spec.ts` | E2E-11 | CRUD canvas |
| `app/e2e/specs/connectors.spec.ts` | E2E-12 | CRUD conectores |
| `app/e2e/specs/catbot.spec.ts` | E2E-13 | CatBot sugerencias |
| `app/e2e/specs/dashboard.spec.ts` | E2E-14 | Dashboard metricas |
| `app/e2e/specs/settings.spec.ts` | E2E-15 | Configuracion secciones |

### API Specs (4)

| Archivo | ID | Endpoints |
|---------|-----|-----------|
| `app/e2e/api/projects.api.spec.ts` | API-01 | Projects CRUD |
| `app/e2e/api/tasks.api.spec.ts` | API-02 | Tasks CRUD |
| `app/e2e/api/canvas.api.spec.ts` | API-03 | Canvas CRUD |
| `app/e2e/api/system.api.spec.ts` | API-04 | Health + system |

---

## 9. Patrones establecidos

### Page Object Model (POM)

```typescript
export class ProjectsPOM extends BasePage {
  readonly createButton = this.page.getByRole('button', { name: 'Nuevo proyecto' });
  readonly projectList = this.page.locator('[data-testid="project-list"]');

  async createProject(name: string) {
    await this.createButton.click();
    await this.page.getByLabel('Nombre').fill(name);
    await this.page.getByRole('button', { name: 'Crear' }).click();
  }
}
```

### Fixtures tipados

```typescript
import { test as base } from '@playwright/test';
export const test = base.extend<Fixtures>({
  projectsPage: async ({ page }, use) => {
    await use(new ProjectsPOM(page));
  },
});
```

### Tests seriales con [TEST] prefix

```typescript
test.describe.serial('Projects CRUD', () => {
  test('create project', async ({ projectsPage }) => {
    await projectsPage.createProject('[TEST] Mi Proyecto');
    await expect(projectsPage.projectList).toContainText('[TEST] Mi Proyecto');
  });
});
```

### API spec pattern

```typescript
test('POST /api/projects returns 201', async ({ request }) => {
  const response = await request.post('/api/projects', {
    data: { name: '[TEST] API Project', description: 'Test' }
  });
  expect(response.status()).toBe(201);
});
```

---

## 10. Decisiones tecnicas

| Decision | Razon |
|----------|-------|
| `workers: 1` en Playwright config | SQLite no soporta escrituras concurrentes — lock errors con multiples workers |
| Prefijo `[TEST]` en datos de prueba | Permite limpiar datos de test sin afectar datos reales del usuario |
| SQLite reporter custom | Guardar resultados en la misma DB para que el Testing Dashboard los consuma |
| `test.describe.serial` para CRUD | Los tests de crear/editar/eliminar dependen del orden de ejecucion |
| Global setup/teardown separados | El setup crea datos compartidos; el teardown los limpia independientemente del resultado |
| Base POM con `waitForLoad` | Espera `networkidle` para evitar flakiness por carga lenta |
| 16 POMs en fixtures | Cada spec importa solo los POMs que necesita via destructuring |
| API specs separados de E2E | Tests de API no necesitan browser — mas rapidos y aislados |

---

*Fase completada: 2026-03-14*
*Milestone: v7.0 — Streaming + Testing + Logging + Notificaciones*
*Siguiente: Phase 37 — Testing Dashboard + Log Viewer*
