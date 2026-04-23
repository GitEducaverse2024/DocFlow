# Phase 36: Playwright Setup + Test Specs - Research

**Researched:** 2026-03-13
**Domain:** End-to-end testing, API testing, Playwright framework
**Confidence:** HIGH

## Summary

Phase 36 requires installing Playwright as a devDependency, configuring it for the DoCatFlow application running at `http://localhost:3500` inside Docker, creating Page Object Models (POMs) for all 14 application sections, writing 15 E2E specs and 4 API specs, implementing test data cleanup via `[TEST]` prefix convention, and creating a `test_runs` SQLite table for the Phase 37 testing dashboard.

The app uses Next.js 14 with `output: 'standalone'` in Docker (`node:20-slim`). Tests run against the live Docker container. Chromium needs to be installed in the Dockerfile runner stage with system dependencies. Since this is a single-user app with SQLite, `workers: 1` is mandatory to prevent database lock errors.

**Primary recommendation:** Use `@playwright/test` v1.58.x with Chromium only, Page Object Model pattern with typed locators, JSON + HTML reporters, globalTeardown for `[TEST]` row cleanup, and a custom reporter or post-test script to write results to the `test_runs` SQLite table.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PLAY-01 | Playwright installed as devDependency with chromium + deps in Dockerfile | Standard Stack section: install command, Dockerfile modification for chromium deps |
| PLAY-02 | playwright.config.ts with baseURL http://localhost:3500, JSON + HTML reporters | Architecture Patterns: full config example with reporters |
| PLAY-03 | Page Objects (POM) for all app sections | Architecture Patterns: POM pattern with typed locators |
| PLAY-04 | test_runs table in SQLite | Code Examples: table schema, custom reporter to populate it |
| E2E-01 | Navigation spec: sidebar, links, breadcrumbs, footer, CatBot | POM: SidebarPOM, NavigationPOM |
| E2E-02 | Projects spec: create, list, open pipeline, delete | POM: ProjectsPOM |
| E2E-03 | Sources spec: upload, list, mode, search, delete | POM: SourcesPOM |
| E2E-04 | Processing spec: select agent/model/skills, process, history | POM: ProcessingPOM |
| E2E-05 | RAG spec: index, stats, query, re-index | POM: RagPOM |
| E2E-06 | Chat spec: send message, example questions | POM: ChatPOM |
| E2E-07 | Agents spec: list, create, edit, delete | POM: AgentsPOM |
| E2E-08 | Workers spec: list, create, edit, delete | POM: WorkersPOM |
| E2E-09 | Skills spec: list, create, edit, delete | POM: SkillsPOM |
| E2E-10 | Tasks spec: list, templates, create from template wizard | POM: TasksPOM |
| E2E-11 | Canvas spec: list, create wizard, editor, drag, connect, save | POM: CanvasPOM |
| E2E-12 | Connectors spec: list types, create, test connection, templates | POM: ConnectorsPOM |
| E2E-13 | CatBot spec: open panel, send message, contextual suggestions | POM: CatBotPOM |
| E2E-14 | Dashboard spec: summary cards, token chart, activity, storage | POM: DashboardPOM |
| E2E-15 | Settings spec: API keys, processing, CatBot sections | POM: SettingsPOM |
| API-01 | API projects: GET/POST/DELETE status codes | API test using request fixture |
| API-02 | API tasks: GET/POST/DELETE status codes | API test using request fixture |
| API-03 | API canvas: GET/POST/DELETE status codes | API test using request fixture |
| API-04 | API system: GET health, dashboard, connectors | API test using request fixture |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | ^1.58.2 | E2E + API test framework | Official Playwright test runner with built-in assertions, fixtures, reporters |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-sqlite3 | (existing) | test_runs table + [TEST] cleanup | Already in project, used for test result persistence |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @playwright/test | Cypress | Playwright is already decided; Cypress lacks API testing built-in |
| Custom reporter for test_runs | Post-run script | Custom reporter captures results in real-time; script only at end |

**Installation:**
```bash
cd ~/docflow/app && npm install -D @playwright/test
npx playwright install chromium
```

**Dockerfile addition (runner stage):**
```dockerfile
# After the existing apt-get install poppler-utils line in runner stage
# Install Playwright chromium dependencies
RUN npx -y playwright@1.58.2 install-deps chromium
RUN npx -y playwright@1.58.2 install chromium
```

**Important:** The Dockerfile runner stage runs as `nextjs` user (UID 1001). Playwright browser install must happen BEFORE `USER nextjs` or use `--with-deps` as root. The `install-deps` command requires root (it runs apt-get).

## Architecture Patterns

### Recommended Project Structure
```
app/
├── playwright.config.ts          # Main config
├── e2e/
│   ├── fixtures/
│   │   └── test-fixtures.ts      # Extended test with POM fixtures
│   ├── pages/                    # Page Object Models
│   │   ├── base.page.ts          # Base POM with shared helpers
│   │   ├── sidebar.pom.ts        # Sidebar navigation
│   │   ├── dashboard.pom.ts      # Dashboard (/)
│   │   ├── projects.pom.ts       # Projects list + detail
│   │   ├── sources.pom.ts        # Sources within project
│   │   ├── processing.pom.ts     # Processing panel
│   │   ├── rag.pom.ts            # RAG panel
│   │   ├── chat.pom.ts           # Chat panel
│   │   ├── agents.pom.ts         # Agents page
│   │   ├── workers.pom.ts        # Workers page
│   │   ├── skills.pom.ts         # Skills page
│   │   ├── tasks.pom.ts          # Tasks list + wizard
│   │   ├── canvas.pom.ts         # Canvas list + editor
│   │   ├── connectors.pom.ts     # Connectors page
│   │   ├── catbot.pom.ts         # CatBot floating panel
│   │   └── settings.pom.ts       # Settings page
│   ├── specs/                    # Test specs
│   │   ├── navigation.spec.ts    # E2E-01
│   │   ├── projects.spec.ts      # E2E-02
│   │   ├── sources.spec.ts       # E2E-03
│   │   ├── processing.spec.ts    # E2E-04
│   │   ├── rag.spec.ts           # E2E-05
│   │   ├── chat.spec.ts          # E2E-06
│   │   ├── agents.spec.ts        # E2E-07
│   │   ├── workers.spec.ts       # E2E-08
│   │   ├── skills.spec.ts        # E2E-09
│   │   ├── tasks.spec.ts         # E2E-10
│   │   ├── canvas.spec.ts        # E2E-11
│   │   ├── connectors.spec.ts    # E2E-12
│   │   ├── catbot.spec.ts        # E2E-13
│   │   ├── dashboard.spec.ts     # E2E-14
│   │   └── settings.spec.ts      # E2E-15
│   ├── api/                      # API specs
│   │   ├── projects.api.spec.ts  # API-01
│   │   ├── tasks.api.spec.ts     # API-02
│   │   ├── canvas.api.spec.ts    # API-03
│   │   └── system.api.spec.ts    # API-04
│   ├── helpers/
│   │   └── test-data.ts          # [TEST] prefix helpers + cleanup
│   └── global-teardown.ts        # Cleanup [TEST] rows from all tables
```

### Pattern 1: Base Page Object Model
**What:** Base class with shared navigation and wait helpers, all POMs extend it
**When to use:** Every POM inherits from this
**Example:**
```typescript
// Source: https://playwright.dev/docs/pom
import { type Page, type Locator } from '@playwright/test';

export class BasePage {
  readonly page: Page;
  readonly sidebar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.locator('nav');
  }

  async navigateTo(path: string) {
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle');
  }
}
```

### Pattern 2: Typed POM with Spanish Locators
**What:** POMs use Spanish text labels that match the actual UI
**When to use:** All E2E specs
**Example:**
```typescript
import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class ProjectsPOM extends BasePage {
  readonly newProjectButton: Locator;
  readonly projectList: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    super(page);
    // Spanish UI labels
    this.newProjectButton = page.getByRole('link', { name: 'Nuevo Proyecto' });
    this.projectList = page.locator('[class*="grid"]');
    this.searchInput = page.getByPlaceholder('Buscar');
  }

  async goto() {
    await this.navigateTo('/projects');
  }

  async createProject(name: string, description?: string) {
    await this.newProjectButton.click();
    await this.page.getByLabel('Nombre').fill(name);
    if (description) {
      await this.page.getByLabel('Descripción').fill(description);
    }
    await this.page.getByRole('button', { name: 'Crear Proyecto' }).click();
  }
}
```

### Pattern 3: Test Data Identification with [TEST] Prefix
**What:** All test-created data uses `[TEST]` prefix for safe cleanup
**When to use:** Every spec that creates data
**Example:**
```typescript
// e2e/helpers/test-data.ts
export const TEST_PREFIX = '[TEST]';

export function testName(base: string): string {
  return `${TEST_PREFIX} ${base}`;
}

// Usage in spec:
await projects.createProject(testName('Mi Proyecto E2E'));
```

### Pattern 4: API Testing with request Fixture
**What:** Playwright's built-in `request` fixture for API-only tests (no browser)
**When to use:** API-01 through API-04 specs
**Example:**
```typescript
// Source: https://playwright.dev/docs/api-testing
import { test, expect } from '@playwright/test';

test.describe('API: Projects', () => {
  let testProjectId: string;

  test('POST /api/projects creates project', async ({ request }) => {
    const res = await request.post('/api/projects', {
      data: { name: '[TEST] API Project', description: 'test' }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    testProjectId = body.id;
  });

  test('GET /api/projects returns list', async ({ request }) => {
    const res = await request.get('/api/projects');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
  });

  test('DELETE /api/projects/:id removes project', async ({ request }) => {
    const res = await request.delete(`/api/projects/${testProjectId}`);
    expect(res.ok()).toBeTruthy();
  });
});
```

### Pattern 5: Custom Reporter for test_runs Table
**What:** A Playwright custom reporter that writes results to SQLite `test_runs` table
**When to use:** After every test run, so Phase 37 dashboard can display results
**Example:**
```typescript
// e2e/reporters/sqlite-reporter.ts
import type { Reporter, FullResult, Suite } from '@playwright/test/reporter';
import Database from 'better-sqlite3';
import path from 'path';
import { randomUUID } from 'crypto';

class SqliteReporter implements Reporter {
  private startTime = 0;

  onBegin() {
    this.startTime = Date.now();
  }

  onEnd(result: FullResult) {
    const dbPath = process['env']['DATABASE_PATH'] ||
      path.join(process.cwd(), 'data', 'docflow.db');
    const db = new Database(dbPath);

    // Ensure table exists
    db.exec(`CREATE TABLE IF NOT EXISTS test_runs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      section TEXT,
      status TEXT NOT NULL,
      total INTEGER DEFAULT 0,
      passed INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      skipped INTEGER DEFAULT 0,
      duration_seconds REAL DEFAULT 0,
      results_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    const duration = (Date.now() - this.startTime) / 1000;
    // Insert run result...
    db.close();
  }
}

export default SqliteReporter;
```

### Anti-Patterns to Avoid
- **Fragile CSS selectors:** Use `getByRole`, `getByText`, `getByLabel`, `getByPlaceholder` instead of `.class-name` or `#id` selectors
- **Hard-coded waits:** Use `waitForLoadState('networkidle')` or `expect(locator).toBeVisible()` instead of `page.waitForTimeout()`
- **Shared mutable state between specs:** Each spec file should be independent; use `test.describe.serial()` only within a single spec for ordered CRUD flows
- **Forgetting [TEST] prefix:** Every piece of test data MUST use the prefix so globalTeardown can clean it

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test runner/assertion | Custom test framework | @playwright/test | Built-in assertions, retries, parallel, reporters |
| API testing client | fetch + custom assertions | Playwright request fixture | Shared auth, baseURL, built-in expect |
| HTML test report | Custom report page | Playwright HTML reporter | Interactive, filterable, includes traces |
| JSON test results | Custom JSON serialization | Playwright JSON reporter | Standard format, all metadata included |
| Element waiting | Manual polling/setTimeout | Playwright auto-waiting | Built into every locator action |
| Screenshot on failure | Manual try-catch screenshot | Playwright config `screenshot: 'only-on-failure'` | Automatic, attached to report |

**Key insight:** Playwright's built-in features cover 95% of testing needs. The only custom code needed is the SQLite reporter for the Phase 37 dashboard and the [TEST] data cleanup.

## Common Pitfalls

### Pitfall 1: SQLite Lock Errors with Parallel Workers
**What goes wrong:** Multiple Playwright workers write to SQLite simultaneously, causing SQLITE_BUSY errors
**Why it happens:** SQLite doesn't handle concurrent writes well; better-sqlite3 is synchronous
**How to avoid:** Set `workers: 1` in playwright.config.ts (already decided)
**Warning signs:** Intermittent test failures with "database is locked" errors

### Pitfall 2: Chromium Crashes in Docker Without Sufficient Shared Memory
**What goes wrong:** Chromium crashes with "session deleted" or OOM errors inside Docker
**Why it happens:** Docker default /dev/shm is 64MB, Chromium needs more
**How to avoid:** Add `ipc: host` or `shm_size: '1gb'` to docker-compose.yml for the docflow service, OR pass `--disable-dev-shm-usage` via Chromium launch args
**Warning signs:** Random test crashes, especially on pages with large DOM

### Pitfall 3: Tests Failing Because App Not Ready
**What goes wrong:** Playwright starts before Next.js server is ready at localhost:3500
**Why it happens:** Docker container takes time to start
**How to avoid:** Do NOT use `webServer` in playwright.config.ts (app runs in Docker separately). Instead, add a retry/wait in globalSetup or use `expect(page).toHaveURL()` with increased timeout
**Warning signs:** Connection refused errors on first test

### Pitfall 4: Stale Test Data from Previous Failed Runs
**What goes wrong:** Previous test run failed before cleanup, leaving [TEST] rows that confuse subsequent runs
**Why it happens:** globalTeardown doesn't run if process is killed
**How to avoid:** Run cleanup in BOTH globalSetup (pre-clean) AND globalTeardown (post-clean)
**Warning signs:** Tests finding unexpected [TEST]-prefixed items in lists

### Pitfall 5: Spanish Text Encoding Issues
**What goes wrong:** Locators with accented characters fail to match
**Why it happens:** Character encoding mismatch between test file and rendered page
**How to avoid:** Save all test files as UTF-8; use exact Spanish text from the UI components
**Warning signs:** `getByText('Configuración')` not finding elements

### Pitfall 6: Network-Dependent Tests Failing (LLM/External Services)
**What goes wrong:** Tests that trigger LLM calls, Qdrant, or OpenClaw fail because services are unavailable
**Why it happens:** Test environment may not have all external services running
**How to avoid:** E2E specs that trigger LLM processing (E2E-04, E2E-05, E2E-06) should verify UI behavior up to the point of submission, not wait for LLM completion. Use shorter timeouts and verify loading states rather than final results when external services are involved.
**Warning signs:** Tests timing out waiting for LLM responses

### Pitfall 7: Standalone Output and Playwright in Same Dockerfile
**What goes wrong:** Playwright browsers are not included in the standalone output
**Why it happens:** Next.js standalone only includes production dependencies; Playwright is devDependency
**How to avoid:** Install Playwright and Chromium in the runner stage separately from the Next.js build. The `npx playwright install chromium` command downloads browsers to `~/.cache/ms-playwright/`, which persists outside the standalone output
**Warning signs:** "Browser not found" errors when running tests in Docker

## Code Examples

### playwright.config.ts
```typescript
// Source: https://playwright.dev/docs/test-configuration
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['specs/**/*.spec.ts', 'api/**/*.api.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: 'http://localhost:3500',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  reporter: [
    ['list'],
    ['json', { outputFile: 'e2e/results/test-results.json' }],
    ['html', { outputFolder: 'e2e/results/html-report', open: 'never' }],
    ['./e2e/reporters/sqlite-reporter.ts'],
  ],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          args: ['--disable-dev-shm-usage'],
        },
      },
    },
  ],
});
```

### global-setup.ts (Pre-clean + Health Check)
```typescript
import { FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL || 'http://localhost:3500';

  // Wait for app to be ready
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${baseURL}/api/health`);
      if (res.ok) { ready = true; break; }
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 2000));
  }
  if (!ready) throw new Error('App not ready at ' + baseURL);

  // Pre-clean any leftover [TEST] data
  // (calls cleanup API or direct DB access)
}

export default globalSetup;
```

### global-teardown.ts ([TEST] Cleanup)
```typescript
import Database from 'better-sqlite3';
import path from 'path';

async function globalTeardown() {
  const dbPath = process['env']['DATABASE_PATH'] ||
    path.join(process.cwd(), 'data', 'docflow.db');
  const db = new Database(dbPath);

  const tables = [
    { table: 'projects', column: 'name' },
    { table: 'custom_agents', column: 'name' },
    { table: 'docs_workers', column: 'name' },
    { table: 'skills', column: 'name' },
    { table: 'tasks', column: 'name' },
    { table: 'canvases', column: 'name' },
    { table: 'connectors', column: 'name' },
  ];

  for (const { table, column } of tables) {
    db.prepare(`DELETE FROM ${table} WHERE ${column} LIKE '[TEST]%'`).run();
  }

  db.close();
}

export default globalTeardown;
```

### test_runs Table Schema (PLAY-04)
```sql
CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- 'e2e' | 'api' | 'full'
  section TEXT,                 -- 'projects' | 'tasks' | null (for full run)
  status TEXT NOT NULL,         -- 'passed' | 'failed' | 'timedout' | 'interrupted'
  total INTEGER DEFAULT 0,
  passed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  duration_seconds REAL DEFAULT 0,
  results_json TEXT,            -- Full JSON report for details
  created_at TEXT DEFAULT (datetime('now'))
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| globalSetup file | Project dependencies (setup/teardown projects) | Playwright 1.46+ | Better traces, report integration |
| CSS selectors | Role-based / text-based locators | Playwright 1.20+ | More resilient, accessible |
| `page.waitForTimeout()` | Auto-waiting + web assertions | Playwright 1.0+ | No flaky arbitrary waits |
| `page.$(selector)` | `page.locator(selector)` (lazy) | Playwright 1.14+ | Auto-retry, no stale elements |

**Note on project dependencies vs globalSetup:** The newer approach uses project dependencies for setup/teardown, which provides traces and report integration. However, for this project's simple needs (health check + DB cleanup), the traditional globalSetup/globalTeardown is simpler and sufficient. The project dependency approach adds config complexity without significant benefit here.

## Open Questions

1. **Running tests inside Docker vs from host**
   - What we know: App runs in Docker at port 3500. Tests need Chromium.
   - What's unclear: Should `npx playwright test` run from inside the container or from the host machine?
   - Recommendation: Run from host machine (where devDependencies are installed). The Dockerfile Chromium installation is for Phase 37's "Ejecutar" button (runs tests from the app itself). For development, run from host with `npx playwright test`.

2. **E2E specs requiring external services (LLM, Qdrant, OpenClaw)**
   - What we know: Some specs (processing, RAG, chat) need LLM to be available
   - What's unclear: Will all external services always be running during test execution?
   - Recommendation: Specs should test UI interactions up to submission. For processing/RAG/chat, verify the request is sent and loading state appears. Don't wait for LLM completion -- that depends on external service availability.

3. **File upload in E2E-03 (sources)**
   - What we know: Source upload uses react-dropzone
   - What's unclear: Exact file input mechanism for Playwright
   - Recommendation: Playwright's `page.setInputFiles()` works with react-dropzone's hidden input. Create a small test file in the e2e/fixtures/ directory.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | @playwright/test ^1.58.2 |
| Config file | app/playwright.config.ts (Wave 0 creation) |
| Quick run command | `cd ~/docflow/app && npx playwright test --grep @smoke` |
| Full suite command | `cd ~/docflow/app && npx playwright test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAY-01 | Playwright installed, chromium in Dockerfile | manual | `npx playwright --version` | N/A |
| PLAY-02 | Config with baseURL + reporters | manual | Verify config file exists | N/A |
| PLAY-03 | POMs for all sections | manual | Verify POM files exist | N/A |
| PLAY-04 | test_runs table populated | smoke | `npx playwright test --grep @smoke && sqlite3 data/docflow.db "SELECT * FROM test_runs"` | Wave 0 |
| E2E-01 | Navigation works | e2e | `npx playwright test e2e/specs/navigation.spec.ts` | Wave 0 |
| E2E-02 | Projects CRUD | e2e | `npx playwright test e2e/specs/projects.spec.ts` | Wave 0 |
| E2E-03 | Sources CRUD | e2e | `npx playwright test e2e/specs/sources.spec.ts` | Wave 0 |
| E2E-04 | Processing flow | e2e | `npx playwright test e2e/specs/processing.spec.ts` | Wave 0 |
| E2E-05 | RAG flow | e2e | `npx playwright test e2e/specs/rag.spec.ts` | Wave 0 |
| E2E-06 | Chat flow | e2e | `npx playwright test e2e/specs/chat.spec.ts` | Wave 0 |
| E2E-07 | Agents CRUD | e2e | `npx playwright test e2e/specs/agents.spec.ts` | Wave 0 |
| E2E-08 | Workers CRUD | e2e | `npx playwright test e2e/specs/workers.spec.ts` | Wave 0 |
| E2E-09 | Skills CRUD | e2e | `npx playwright test e2e/specs/skills.spec.ts` | Wave 0 |
| E2E-10 | Tasks wizard | e2e | `npx playwright test e2e/specs/tasks.spec.ts` | Wave 0 |
| E2E-11 | Canvas editor | e2e | `npx playwright test e2e/specs/canvas.spec.ts` | Wave 0 |
| E2E-12 | Connectors CRUD | e2e | `npx playwright test e2e/specs/connectors.spec.ts` | Wave 0 |
| E2E-13 | CatBot interaction | e2e | `npx playwright test e2e/specs/catbot.spec.ts` | Wave 0 |
| E2E-14 | Dashboard data | e2e | `npx playwright test e2e/specs/dashboard.spec.ts` | Wave 0 |
| E2E-15 | Settings page | e2e | `npx playwright test e2e/specs/settings.spec.ts` | Wave 0 |
| API-01 | Projects API | api | `npx playwright test e2e/api/projects.api.spec.ts` | Wave 0 |
| API-02 | Tasks API | api | `npx playwright test e2e/api/tasks.api.spec.ts` | Wave 0 |
| API-03 | Canvas API | api | `npx playwright test e2e/api/canvas.api.spec.ts` | Wave 0 |
| API-04 | System API | api | `npx playwright test e2e/api/system.api.spec.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx playwright test e2e/specs/navigation.spec.ts` (smoke)
- **Per wave merge:** `npx playwright test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `app/playwright.config.ts` -- main configuration
- [ ] `app/e2e/` directory -- entire test infrastructure
- [ ] `@playwright/test` -- devDependency installation
- [ ] Dockerfile chromium deps -- runner stage modification
- [ ] `test_runs` table -- SQLite schema in db.ts

## Sources

### Primary (HIGH confidence)
- [Playwright official docs - POM](https://playwright.dev/docs/pom) - Page Object Model pattern
- [Playwright official docs - Reporters](https://playwright.dev/docs/test-reporters) - JSON + HTML reporter config
- [Playwright official docs - API Testing](https://playwright.dev/docs/api-testing) - request fixture pattern
- [Playwright official docs - Global Setup/Teardown](https://playwright.dev/docs/test-global-setup-teardown) - cleanup pattern
- [Playwright official docs - Docker](https://playwright.dev/docs/docker) - Dockerfile chromium deps
- [Playwright official docs - Configuration](https://playwright.dev/docs/test-configuration) - defineConfig options

### Secondary (MEDIUM confidence)
- [@playwright/test npm](https://www.npmjs.com/package/@playwright/test) - Current version 1.58.2
- [Playwright GitHub releases](https://github.com/microsoft/playwright/releases) - Release history

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Playwright is the decided framework, version verified on npm
- Architecture: HIGH - POM pattern well-documented by Playwright team, project structure follows conventions
- Pitfalls: HIGH - Docker + SQLite + Chromium pitfalls are well-known and documented
- Dockerfile changes: MEDIUM - Exact apt packages may vary by Playwright version; `install-deps` auto-detects

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (Playwright releases monthly but API is stable)
