# Phase 37: Testing Dashboard + Log Viewer - Research

**Researched:** 2026-03-13
**Domain:** Next.js UI page + API routes for Playwright execution, test results display, and JSONL log viewing
**Confidence:** HIGH

## Summary

Phase 37 builds a `/testing` page with three functional areas: (1) a test runner dashboard that triggers Playwright via child_process and displays results from the `test_runs` SQLite table, (2) a test history view, and (3) a JSONL log viewer with filtering. All infrastructure pieces already exist: Playwright is installed with 19 specs, the `test_runs` table and SQLite reporter are wired, and the logger writes JSONL to `/app/data/logs/`.

The primary technical challenge is running Playwright as a child process from a Next.js API route, parsing its output, and reporting progress via polling. The log viewer is straightforward file reading with JSONL parsing and filtering. The "generate tests with AI" feature (TEST-08) uses the existing `llm.ts` chatCompletion to generate Playwright spec code.

**Primary recommendation:** Use `child_process.spawn` for Playwright execution (pattern already established in RAG create route), poll `test_runs` table for status, and read JSONL log files with `fs.readFileSync` + line-by-line JSON.parse for the log viewer.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-01 | /testing page in sidebar between Conectores and Configuracion with FlaskConical icon | Sidebar navItems array insertion; FlaskConical already imported in codebase |
| TEST-02 | Summary bar with total/pass/fail/skip counts and visual coverage bar | Query latest test_run from SQLite; recharts or simple CSS bar |
| TEST-03 | Expandable sections with individual test status, duration | Parse results_json from test_runs table; Collapsible component pattern |
| TEST-04 | "Ejecutar todos" button + per-section "Ejecutar" buttons | POST /api/testing/run with optional section param; spawn npx playwright test |
| TEST-05 | Polling every 2s showing execution progress | GET /api/testing/status endpoint; setInterval on client |
| TEST-06 | History of last 10 test runs | GET /api/testing/results with limit=10; test_runs table already stores all runs |
| TEST-07 | Failed tests show error, screenshot, test code | Screenshots at e2e/results/test-results/ (Playwright config); read spec file for code |
| TEST-08 | "Generate tests with AI" button using LLM | llm.ts chatCompletion with spec template prompt; write to e2e/specs/ |
| TEST-09 | API endpoints POST /api/testing/run, GET /api/testing/status, GET /api/testing/results | Three route handlers; spawn + in-memory run tracking + SQLite queries |
| LOG-04 | Log viewer in /testing with real-time polling every 3s | Tab in /testing page; GET /api/system/logs polled every 3s |
| LOG-05 | Filters by level, source, text search | Query params on GET /api/system/logs; client-side filter state |
| LOG-06 | GET /api/system/logs endpoint with level, source, limit, date params | Read JSONL file, parse line by line, filter, return JSON array |
| LOG-07 | "Descargar logs" button for current day's file | Direct download endpoint or Blob URL from raw JSONL content |
</phase_requirements>

## Standard Stack

### Core (already installed -- NO new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js 14 | 14.2.35 | App Router, API routes | Project framework |
| React 18 | ^18 | UI components | Project framework |
| @playwright/test | ^1.58.2 | Test execution (devDependency) | Already installed, 19 specs ready |
| better-sqlite3 | ^12.6.2 | test_runs table queries | Already used for all DB |
| lucide-react | ^0.577.0 | FlaskConical, Play, History, FileText icons | Already installed |
| recharts | ^3.8.0 | Optional visual bar chart for test summary | Already installed |

### Supporting (already available)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| child_process (Node built-in) | - | Spawn Playwright process | POST /api/testing/run |
| fs (Node built-in) | - | Read JSONL log files | GET /api/system/logs |
| llm.ts (project module) | - | AI test generation | TEST-08 generate tests button |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| child_process.spawn | child_process.exec | spawn is better for streaming output; exec buffers all stdout |
| In-memory run state | SQLite status column | In-memory is simpler, lost on restart but runs are short-lived |
| Server-side log filtering | Client-side filtering | Server-side reduces payload; use server-side for initial fetch, client for refinement |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
app/src/
  app/
    testing/
      page.tsx              # Main /testing page with tabs
    api/
      testing/
        run/route.ts        # POST - trigger Playwright run
        status/route.ts     # GET - check current run status
        results/route.ts    # GET - fetch test run history
        generate/route.ts   # POST - AI test generation (TEST-08)
      system/
        logs/route.ts       # GET - fetch filtered logs
        logs/download/route.ts  # GET - download raw JSONL file
  components/
    testing/
      test-summary-bar.tsx      # Total/pass/fail/skip counts
      test-section-list.tsx     # Expandable sections with tests
      test-run-history.tsx      # History tab content
      test-result-detail.tsx    # Failed test detail (error, screenshot, code)
      log-viewer.tsx            # Log viewer tab
      log-filters.tsx           # Level/source/search filters
```

### Pattern 1: Playwright Child Process Execution
**What:** Spawn `npx playwright test` as a child process from API route, track run state in memory, write results to test_runs via existing SQLite reporter.
**When to use:** POST /api/testing/run
**Example:**
```typescript
// Source: Existing pattern from app/src/app/api/projects/[id]/rag/create/route.ts
import { spawn } from 'child_process';

// In-memory state for current run (single-user app, only one run at a time)
let currentRun: { id: string; status: string; output: string } | null = null;

// POST /api/testing/run
const args = ['playwright', 'test'];
if (section) {
  args.push('--grep', section); // or specific spec file path
}
args.push('--reporter=list,./e2e/reporters/sqlite-reporter.ts');

const child = spawn('npx', args, {
  cwd: '/app', // or process.cwd() in dev
  env: { ...process['env'] },
});

child.stdout.on('data', (data) => {
  currentRun.output += data.toString();
});
child.on('close', (code) => {
  currentRun.status = code === 0 ? 'passed' : 'failed';
});
```

### Pattern 2: Tab-based Page Layout
**What:** Three tabs: "Resultados" (test results), "Historial" (history), "Logs" (log viewer)
**When to use:** /testing page
**Example:**
```typescript
// Follow existing tab patterns in the project
const [activeTab, setActiveTab] = useState<'results' | 'history' | 'logs'>('results');

// Tab buttons in a flex row with border-bottom styling
// Content area switches based on activeTab
```

### Pattern 3: JSONL Log Reading
**What:** Read log file line by line, parse each line as JSON, filter by params
**When to use:** GET /api/system/logs
**Example:**
```typescript
import fs from 'fs';
import path from 'path';

const LOG_DIR = process['env']['LOG_DIR'] || '/app/data/logs';

function readLogs(date: string, level?: string, source?: string, search?: string, limit = 200) {
  const filePath = path.join(LOG_DIR, `app-${date}.jsonl`);
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  let entries = lines.map(line => {
    try { return JSON.parse(line); }
    catch { return null; }
  }).filter(Boolean);

  if (level) entries = entries.filter(e => e.level === level);
  if (source) entries = entries.filter(e => e.source === source);
  if (search) entries = entries.filter(e =>
    e.message?.toLowerCase().includes(search.toLowerCase())
  );

  // Return latest entries (reverse chronological)
  return entries.reverse().slice(0, limit);
}
```

### Pattern 4: Polling with useEffect + setInterval
**What:** Poll API endpoints at fixed intervals for real-time updates
**When to use:** Test execution progress (2s), log viewer (3s)
**Example:**
```typescript
// Established pattern from notifications (15s polling)
useEffect(() => {
  if (!isRunning) return;
  const id = setInterval(async () => {
    const res = await fetch('/api/testing/status');
    const data = await res.json();
    setRunStatus(data);
    if (data.status !== 'running') {
      clearInterval(id);
      fetchResults(); // Refresh results
    }
  }, 2000);
  return () => clearInterval(id);
}, [isRunning]);
```

### Anti-Patterns to Avoid
- **Running Playwright synchronously in API route:** NEVER await the full Playwright run. Spawn in background, return immediately with run ID, poll for status.
- **Reading entire log file into memory for large files:** Use limit parameter and read from end of file. For day-old logs this is fine; for production use would need streaming.
- **Multiple concurrent Playwright runs:** The app is single-user. Reject new runs if one is already active. Playwright config has `workers: 1` to prevent SQLite locks.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test execution | Custom test runner | child_process.spawn with npx playwright test | Playwright handles browser lifecycle, reporting, retries |
| Test results storage | Custom DB writes | Existing SQLite reporter (e2e/reporters/sqlite-reporter.ts) | Already wired in playwright.config.ts, writes to test_runs |
| Test result JSON format | Custom parser | Playwright JSON reporter output (already configured) | Reliable structured output |
| Log file format | Custom format | Existing logger.ts JSONL format | Already in production, consistent schema |
| Screenshot capture | Custom screenshot logic | Playwright `screenshot: 'only-on-failure'` config | Already configured in playwright.config.ts |

**Key insight:** Phase 36 already built all the test infrastructure. Phase 37 is purely UI + API glue to expose what exists.

## Common Pitfalls

### Pitfall 1: Playwright Process Path in Docker
**What goes wrong:** `npx playwright test` fails in Docker because the working directory or PATH differs.
**Why it happens:** Docker container runs from /app, but playwright config expects specific relative paths.
**How to avoid:** Use absolute `cwd` in spawn options. Verify with `process.cwd()`. The Dockerfile already installs Playwright chromium.
**Warning signs:** "Cannot find playwright" or "No tests found" errors in API response.

### Pitfall 2: Concurrent Run Conflicts
**What goes wrong:** Two "Ejecutar" clicks spawn two Playwright processes that fight over SQLite and browser.
**Why it happens:** No server-side lock on test execution.
**How to avoid:** In-memory `currentRun` variable. API returns 409 Conflict if a run is active. Client disables buttons during execution.
**Warning signs:** SQLite BUSY errors, incomplete test_runs rows.

### Pitfall 3: Screenshot Path Resolution
**What goes wrong:** Failed test screenshots exist on disk but the UI shows broken image links.
**Why it happens:** Playwright stores screenshots relative to its config, but API needs to serve them as static files or base64.
**How to avoid:** Read screenshot file from disk in API route, return as base64 data URL. Screenshots go to `e2e/results/` by default.
**Warning signs:** 404 on screenshot URLs, empty image placeholders.

### Pitfall 4: Large Log Files Blocking the Event Loop
**What goes wrong:** Reading a full day's JSONL file synchronously blocks the API route for seconds.
**Why it happens:** fs.readFileSync on a large file (100MB+) in a hot API route.
**How to avoid:** Use limit parameter (default 200 lines). Read file with fs.readFileSync (small files are fine for single-user). For very large files, read last N bytes only.
**Warning signs:** API response times > 1s for log requests.

### Pitfall 5: Stale Run Status After Server Restart
**What goes wrong:** Server restarts while a Playwright run is active. In-memory `currentRun` is lost, UI shows "running" forever.
**Why it happens:** In-memory state doesn't survive process restart.
**How to avoid:** On startup, check if there is a test_run with no terminal status. If currentRun is null but UI polls, return { status: 'idle' }.
**Warning signs:** Infinite loading spinner on the testing page after restart.

### Pitfall 6: env vars in API routes
**What goes wrong:** Build-time webpack inlines process.env values as undefined.
**Why it happens:** Next.js 14 replaces process.env.X at build time.
**How to avoid:** ALWAYS use `process['env']['VAR']` bracket notation. ALWAYS export `dynamic = 'force-dynamic'` in route files.
**Warning signs:** undefined values for DATABASE_PATH, LOG_DIR in production.

## Code Examples

### Sidebar Entry for /testing
```typescript
// Source: app/src/components/layout/sidebar.tsx — insert between Conectores and Configuracion
// Current order: ..., Conectores (Plug), Notificaciones (Bell), Configuracion (Settings), ...
// Required order: ..., Conectores, Notificaciones, Testing, Configuracion, ...

import { FlaskConical } from 'lucide-react';
// Add to navItems array after Notificaciones:
{ href: '/testing', label: 'Testing', icon: FlaskConical },
```

### test_runs Table Schema (already exists)
```sql
-- Source: app/src/lib/db.ts and e2e/reporters/sqlite-reporter.ts
CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,          -- 'full' | 'section'
  section TEXT,                -- null for full, section name for targeted
  status TEXT NOT NULL,        -- 'passed' | 'failed' | 'timedout' | 'interrupted'
  total INTEGER DEFAULT 0,
  passed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  duration_seconds REAL DEFAULT 0,
  results_json TEXT,           -- JSON array of { title, file, status, duration }
  created_at TEXT DEFAULT (datetime('now'))
);
```

### results_json Structure (from SQLite reporter)
```json
[
  { "title": "sidebar loads with all nav links", "file": "/app/e2e/specs/navigation.spec.ts", "status": "passed", "duration": 1234 },
  { "title": "all sidebar links navigate correctly", "file": "/app/e2e/specs/navigation.spec.ts", "status": "failed", "duration": 5678 }
]
```

### Logger JSONL Format (already exists)
```json
{"ts":"2026-03-13T10:00:00.000Z","level":"info","source":"processing","message":"Started processing for project abc","metadata":{"projectId":"abc"}}
```

### AI Test Generation Prompt (TEST-08)
```typescript
// Use existing llm.ts chatCompletion
const prompt = `Analiza el siguiente codigo fuente de la aplicacion y genera un test E2E de Playwright.
Usa el patron Page Object Model. El test debe estar en espanol.
Framework: @playwright/test
Base URL: http://localhost:3500
Codigo fuente:
${sourceCode}

Genera SOLO el codigo del test, sin explicaciones.`;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Playwright JSON reporter only | SQLite reporter + JSON reporter | Phase 36 | Results persisted in DB for dashboard consumption |
| SSH-only test execution | API-triggered execution | Phase 37 (this phase) | Non-technical users can run tests from browser |
| Manual log inspection | Structured JSONL + viewer | Phase 32 + 37 | Logs searchable and filterable in UI |

**Deprecated/outdated:**
- None relevant. All infrastructure is freshly built in v7.0.

## Open Questions

1. **Playwright section filtering strategy**
   - What we know: playwright.config.ts uses `testMatch: ['specs/**/*.spec.ts', 'api/**/*.api.spec.ts']`. Individual specs are named by section (navigation.spec.ts, projects.spec.ts, etc.).
   - What's unclear: Whether to use `--grep` (filter by test title pattern) or pass specific file paths for per-section execution.
   - Recommendation: Use file path approach: `npx playwright test e2e/specs/projects.spec.ts`. More reliable than grep patterns. Map section names to spec file paths in a config object.

2. **Screenshot serving strategy**
   - What we know: Playwright stores screenshots on failure. Config says `screenshot: 'only-on-failure'`.
   - What's unclear: Exact path where screenshots land (test-results/ directory by default).
   - Recommendation: Read screenshots as base64 from the API route. Playwright default is `test-results/` in the project root. Check `trace: 'on-first-retry'` artifacts too.

3. **AI test generation scope (TEST-08)**
   - What we know: Requirement says "Generar tests con IA". There is already a "tests-unitarios" skill in the skills table.
   - What's unclear: Whether to generate full spec files or suggest test ideas. What source code to feed the LLM.
   - Recommendation: Read the route handler source for a given section, send to LLM with a Playwright spec template, return generated code in a dialog/modal for review. Don't auto-write to disk without user confirmation.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | @playwright/test ^1.58.2 |
| Config file | app/playwright.config.ts |
| Quick run command | `cd app && npx playwright test e2e/specs/navigation.spec.ts` |
| Full suite command | `cd app && npx playwright test` |

### Phase Requirements Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | /testing page in sidebar | e2e | `npx playwright test e2e/specs/navigation.spec.ts` | Partial (nav spec exists, needs /testing link check) |
| TEST-02 | Summary bar counts | manual-only | Manual: visit /testing, verify counts match DB | N/A |
| TEST-03 | Expandable test sections | manual-only | Manual: click section, verify expand/collapse | N/A |
| TEST-04 | Run buttons trigger execution | manual-only | Manual: click Ejecutar, verify Playwright spawns | N/A |
| TEST-05 | Polling shows progress | manual-only | Manual: run tests, verify UI updates every 2s | N/A |
| TEST-06 | History shows last 10 runs | manual-only | Manual: run tests multiple times, check history tab | N/A |
| TEST-07 | Failed test details | manual-only | Manual: trigger failing test, check error/screenshot/code | N/A |
| TEST-08 | AI test generation | manual-only | Manual: click generate, verify LLM returns spec code | N/A |
| TEST-09 | API endpoints | smoke | `curl -X POST localhost:3500/api/testing/run && curl localhost:3500/api/testing/status` | No (Wave 0) |
| LOG-04 | Log viewer streams | manual-only | Manual: visit /testing logs tab, verify entries appear | N/A |
| LOG-05 | Log filters work | manual-only | Manual: apply filters, verify log entries change | N/A |
| LOG-06 | GET /api/system/logs | smoke | `curl "localhost:3500/api/system/logs?level=info&limit=10"` | No (Wave 0) |
| LOG-07 | Download logs button | manual-only | Manual: click Descargar, verify JSONL file downloads | N/A |

### Sampling Rate
- **Per task commit:** Manual smoke test of the specific feature built
- **Per wave merge:** Full visual verification of /testing page
- **Phase gate:** All 13 requirements manually verified via browser

### Wave 0 Gaps
- [ ] `app/src/app/api/testing/run/route.ts` -- POST endpoint (TEST-09)
- [ ] `app/src/app/api/testing/status/route.ts` -- GET endpoint (TEST-09)
- [ ] `app/src/app/api/testing/results/route.ts` -- GET endpoint (TEST-09)
- [ ] `app/src/app/api/system/logs/route.ts` -- GET endpoint (LOG-06)

## Sources

### Primary (HIGH confidence)
- Project codebase: `app/src/lib/logger.ts` -- JSONL format, LOG_DIR, rotation logic
- Project codebase: `app/e2e/reporters/sqlite-reporter.ts` -- test_runs schema, results_json format
- Project codebase: `app/playwright.config.ts` -- testDir, reporters, screenshot/trace config
- Project codebase: `app/src/components/layout/sidebar.tsx` -- navItems array structure
- Project codebase: `app/src/lib/db.ts` -- test_runs table DDL, DB access pattern
- Project codebase: `app/src/app/api/projects/[id]/rag/create/route.ts` -- spawn pattern

### Secondary (MEDIUM confidence)
- Playwright docs: `--grep` and file path filtering for targeted spec execution
- Node.js docs: child_process.spawn for async process management

### Tertiary (LOW confidence)
- None. All findings verified against project source code.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and in use
- Architecture: HIGH -- follows established patterns from notifications page, RAG create route
- Pitfalls: HIGH -- derived from project-specific constraints (SQLite locking, Docker paths, env bracket notation)

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable -- no external dependencies changing)
