# Phase 32: Logging Foundation - Research

**Researched:** 2026-03-13
**Domain:** Structured JSONL logging with file rotation, Node.js fs APIs
**Confidence:** HIGH

## Summary

Phase 32 requires integrating a structured JSONL logger into every significant API route and service module. The good news: a `logger.ts` module already exists at `app/src/lib/logger.ts` with the core structure (info/warn/error levels, JSONL format, daily file rotation, 7-day cleanup). However, it is missing the `source` field required by LOG-01, uses async `fs.appendFile` instead of the mandated `fs.appendFileSync`, and is currently imported by only 1 file (catbot-sudo-tools.ts) plus db.ts.

The main work is: (1) enhance the existing logger to include the `source` field in every log entry, (2) switch to `fs.appendFileSync` per project decision, and (3) replace ~75 files worth of `console.log`/`console.error`/`console.warn` calls in API routes and service modules with structured logger calls. The log viewer UI (LOG-04 through LOG-07) is explicitly deferred to Phase 37.

**Primary recommendation:** Enhance the existing `logger.ts` to accept a `source` parameter, switch to `fs.appendFileSync`, then systematically replace all `console.log/error/warn` calls in API routes and service modules with the structured logger.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LOG-01 | Modulo logger.ts con niveles info/warn/error, formato JSONL (timestamp, level, source, message, metadata) | Logger module exists but needs `source` field added and sync write. See Architecture Patterns section. |
| LOG-02 | Logger integrado en todos los endpoints principales: procesamiento, chat, RAG, catbot, tareas, canvas, conectores, servicios externos | 75 API route files currently use console.log/error. Key routes identified in research. See Don't Hand-Roll and integration strategy. |
| LOG-03 | Rotacion automatica de logs: borrar archivos de mas de 7 dias al arrancar | Already implemented in existing logger.ts `rotateLogs()` function. Needs minor verification only. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `fs` | built-in | Synchronous file append for log writes | No npm dependency needed; `fs.appendFileSync` prevents log loss on crash |
| Node.js `path` | built-in | Log file path construction | Standard path joining |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | - | - | No additional dependencies needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom logger.ts | Winston/Pino | Explicitly out of scope per REQUIREMENTS.md — custom logger is lighter for single-user app |

**Installation:**
```bash
# No new packages needed — all Node.js built-ins
```

## Architecture Patterns

### Existing Logger Location
```
app/src/lib/logger.ts          # EXISTS — needs enhancement
app/src/lib/services/*.ts      # 6 files with console.log to replace
app/src/app/api/**/route.ts    # 75 files with console.log to replace
/app/data/logs/                # Volume-mounted log directory (Docker)
```

### Pattern 1: Enhanced Logger Module (LOG-01)
**What:** Add `source` field to log entries, switch to `fs.appendFileSync`
**When to use:** Every log call must include a source identifier

Current logger entry format:
```typescript
{ ts: "2026-03-13T10:00:00.000Z", level: "info", message: "..." }
```

Required format per LOG-01:
```typescript
{
  ts: "2026-03-13T10:00:00.000Z",
  level: "info",
  source: "chat",
  message: "Consulta recibida",
  metadata: { projectId: "abc", tokens: 150 }
}
```

Enhanced logger API:
```typescript
// app/src/lib/logger.ts
export type LogLevel = 'info' | 'warn' | 'error';
export type LogSource =
  | 'processing' | 'chat' | 'rag' | 'catbot'
  | 'tasks' | 'canvas' | 'connectors' | 'system'
  | 'agents' | 'workers' | 'skills' | 'settings';

export const logger = {
  info: (source: LogSource, msg: string, meta?: Record<string, unknown>) => writeLog('info', source, msg, meta),
  warn: (source: LogSource, msg: string, meta?: Record<string, unknown>) => writeLog('warn', source, msg, meta),
  error: (source: LogSource, msg: string, meta?: Record<string, unknown>) => writeLog('error', source, msg, meta),
};
```

**Key change:** The `source` parameter becomes the FIRST argument after level. This is a breaking change for the single existing caller (catbot-sudo-tools.ts) and db.ts which must be updated simultaneously.

### Pattern 2: API Route Integration (LOG-02)
**What:** Replace console.log/error/warn with structured logger calls in every API route that touches LLM, RAG, or external services
**When to use:** Every significant action — not CRUD reads, but mutations, external calls, errors

```typescript
// Before (current pattern in ~75 files):
console.log('[Chat] Consulta recibida:', message);
console.error('[Chat] Error:', error);

// After:
import { logger } from '@/lib/logger';
logger.info('chat', 'Consulta recibida', { projectId, messageLength: message.length });
logger.error('chat', 'Error en chat', { projectId, error: (error as Error).message });
```

### Pattern 3: Service Module Integration
**What:** Replace console.log/error in service modules
**Services to update:** task-executor.ts, canvas-executor.ts, litellm.ts, content-extractor.ts, rag.ts, usage-tracker.ts

```typescript
// In task-executor.ts:
logger.info('tasks', 'Ejecutando paso', { taskId, stepId, agentModel });
logger.error('tasks', 'Error en paso', { taskId, stepId, error: err.message });
```

### Pattern 4: Log Rotation (LOG-03) — Already Implemented
**What:** Delete JSONL files older than 7 days on module load
**Status:** Already works in current logger.ts via `rotateLogs()` called at module load time. Module loads when first imported, which happens at app startup.

### Priority Routes for Logger Integration

The requirement says "todos los endpoints principales." Based on codebase analysis, these are the critical routes grouped by source:

| Source | Routes | Priority |
|--------|--------|----------|
| `chat` | `/api/projects/[id]/chat` | HIGH — LLM call |
| `processing` | `/api/projects/[id]/process` | HIGH — LLM call |
| `rag` | `/api/projects/[id]/rag/create`, `/rag/query` | HIGH — external service |
| `catbot` | `/api/catbot/chat`, `/api/catbot/sudo` | HIGH — LLM + tools |
| `tasks` | `/api/tasks/[id]/execute` + task-executor.ts | HIGH — LLM calls |
| `canvas` | `/api/canvas/[id]/execute` + canvas-executor.ts | HIGH — LLM calls |
| `connectors` | `/api/connectors/[id]/test` | HIGH — external calls |
| `agents` | `/api/agents/create`, `/api/agents/generate` | MEDIUM — LLM call |
| `workers` | `/api/workers/generate` | MEDIUM — LLM call |
| `skills` | `/api/skills/generate` | MEDIUM — LLM call |
| `system` | `/api/health`, service modules | MEDIUM — service status |
| `settings` | `/api/settings/api-keys/[provider]/test` | MEDIUM — external call |

CRUD-only routes (GET list, DELETE by id) should get `logger.error` on catch blocks but do NOT need `logger.info` for every read operation.

### Anti-Patterns to Avoid
- **Logging sensitive data:** Never log API keys, full request bodies with credentials, or user content in full. Log lengths, IDs, and status codes.
- **Async log writes in this project:** The project decision mandates `fs.appendFileSync` to prevent log loss on crash. Do NOT use the current `fs.appendFile` (async).
- **Double logging:** After migration, remove `console.log` calls. Do not keep both console and logger.
- **Logging in hot paths without value:** Dashboard summary/activity/usage GET routes do not need info-level logging — they are read-only queries. Only log errors.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Log rotation | Custom cron job or timer | Module-load rotation (already exists) | Runs on every app restart; 7-day single-user app needs nothing fancier |
| Log formatting | Custom serialization per route | Single `writeLog` function | Consistent JSONL format across all sources |
| Source type validation | Runtime string checking | TypeScript union type `LogSource` | Compile-time enforcement |

**Key insight:** The logger module is intentionally minimal (~60 lines). The complexity is in the integration work (updating ~75+ files), not in the module itself.

## Common Pitfalls

### Pitfall 1: Breaking the existing logger API
**What goes wrong:** Changing the logger function signature breaks existing callers
**Why it happens:** db.ts and catbot-sudo-tools.ts already import and call logger
**How to avoid:** Update ALL existing callers in the same commit as the logger change. There are only 2 files to update.
**Warning signs:** TypeScript compilation errors after changing logger signature

### Pitfall 2: Sync writes blocking the event loop
**What goes wrong:** `fs.appendFileSync` blocks Node.js event loop during high-volume logging
**Why it happens:** Synchronous I/O on every log call
**How to avoid:** This is acceptable for a single-user app per project decision. Log entries are small (<1KB each). If performance becomes an issue later, can batch writes — but NOT in this phase.
**Warning signs:** Response times increasing noticeably after logger integration

### Pitfall 3: Log directory not existing in Docker
**What goes wrong:** `fs.appendFileSync` throws ENOENT if `/app/data/logs/` doesn't exist
**Why it happens:** Volume mount creates `/app/data/` but not the `logs/` subdirectory
**How to avoid:** The existing `fs.mkdirSync(LOG_DIR, { recursive: true })` at module load handles this. Keep it.
**Warning signs:** Application crashes on first log write after fresh Docker deploy

### Pitfall 4: Missing `source` field in log entries
**What goes wrong:** Log viewer (Phase 37) depends on filtering by `source` — if entries lack it, filters break
**Why it happens:** Forgetting to pass source in some routes, or using incorrect source identifiers
**How to avoid:** Make `source` a required parameter in the TypeScript signature. Use a fixed union type.
**Warning signs:** TypeScript errors (good — they catch this at compile time)

### Pitfall 5: env var bracket notation
**What goes wrong:** Build fails or env var is undefined at runtime
**Why it happens:** Using `process.env.LOG_DIR` instead of `process['env']['LOG_DIR']`
**How to avoid:** Project convention: always use bracket notation. The existing logger already does this correctly.
**Warning signs:** Webpack inlines the value as `undefined` during build

## Code Examples

### Enhanced logger.ts (verified pattern from existing code + requirements)
```typescript
import fs from 'fs';
import path from 'path';

export type LogLevel = 'info' | 'warn' | 'error';
export type LogSource =
  | 'processing' | 'chat' | 'rag' | 'catbot'
  | 'tasks' | 'canvas' | 'connectors' | 'system'
  | 'agents' | 'workers' | 'skills' | 'settings';

const LOG_DIR = process['env']['LOG_DIR'] || '/app/data/logs';

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch { /* ignore */ }

function rotateLogs(): void {
  try {
    const files = fs.readdirSync(LOG_DIR);
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    for (const file of files) {
      const match = file.match(/^app-(\d{4}-\d{2}-\d{2})\.jsonl$/);
      if (!match) continue;
      const fileDate = new Date(match[1]).getTime();
      if (!isNaN(fileDate) && now - fileDate > sevenDaysMs) {
        try { fs.unlinkSync(path.join(LOG_DIR, file)); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

rotateLogs();

function getLogPath(): string {
  const dateStr = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `app-${dateStr}.jsonl`);
}

function writeLog(level: LogLevel, source: LogSource, message: string, metadata?: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    source,
    message,
    ...(metadata ? { metadata } : {}),
  };
  try {
    fs.appendFileSync(getLogPath(), JSON.stringify(entry) + '\n');
  } catch {
    // Last resort — write to stderr so Docker logs capture it
    process.stderr.write(`[logger-fallback] ${JSON.stringify(entry)}\n`);
  }
}

export const logger = {
  info: (source: LogSource, msg: string, meta?: Record<string, unknown>) => writeLog('info', source, msg, meta),
  warn: (source: LogSource, msg: string, meta?: Record<string, unknown>) => writeLog('warn', source, msg, meta),
  error: (source: LogSource, msg: string, meta?: Record<string, unknown>) => writeLog('error', source, msg, meta),
};
```

### Route integration example (chat route)
```typescript
import { logger } from '@/lib/logger';

// At start of POST handler:
logger.info('chat', 'Consulta recibida', { projectId, messageLength: message.length });

// After successful LLM response:
logger.info('chat', 'Respuesta generada', { projectId, chunksFound: results.length, model: chatModel });

// In catch block:
logger.error('chat', 'Error en chat', { projectId, error: (error as Error).message });
```

### Service integration example (task-executor.ts)
```typescript
import { logger } from '@/lib/logger';

// At step execution start:
logger.info('tasks', 'Ejecutando paso', { taskId, stepId, stepOrder, agentModel });

// On step completion:
logger.info('tasks', 'Paso completado', { taskId, stepId, durationMs, tokens: totalTokens });

// On error:
logger.error('tasks', 'Error en paso', { taskId, stepId, error: err.message });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `console.log('[Tag] message')` | `logger.info('source', 'message', meta)` | This phase | Structured, filterable, persistent logs |
| `fs.appendFile` (async) | `fs.appendFileSync` (sync) | This phase | Prevents log loss on crash per project decision |
| No source field | Required `source` field | This phase | Enables Phase 37 log viewer filtering |

## Open Questions

1. **Should `console.log` calls be entirely removed or kept alongside logger?**
   - What we know: Docker captures stdout/stderr via `docker logs`. Logger writes to JSONL files.
   - What's unclear: Whether ops team relies on `docker logs` output for debugging
   - Recommendation: Remove console.log/warn, keep console.error as fallback only in the logger's own error handler. All structured logging goes through logger only.

2. **Should the `metadata` field be strictly typed per source?**
   - What we know: LOG-01 says "metadata" as a generic field. Phase 37 log viewer filters by level and source only.
   - What's unclear: Whether future phases need typed metadata
   - Recommendation: Keep metadata as `Record<string, unknown>` for now. Type strictness would add complexity without current benefit.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual verification (no Playwright yet — Phase 36) |
| Config file | none |
| Quick run command | `cd /home/deskmath/docflow/app && npm run build` |
| Full suite command | `cd /home/deskmath/docflow/app && npm run build` (TypeScript compilation verifies all imports) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LOG-01 | Logger writes JSONL with ts, level, source, message, metadata | manual | Build succeeds + manual check of /app/data/logs/ | N/A |
| LOG-02 | All main endpoints produce log entries | manual | Trigger each endpoint, verify JSONL output | N/A |
| LOG-03 | Files older than 7 days deleted on startup | manual | Create old file, restart app, verify deleted | N/A |

### Sampling Rate
- **Per task commit:** `npm run build` (TypeScript compilation catches import/signature errors)
- **Per wave merge:** Build + Docker deploy + manual endpoint verification
- **Phase gate:** All main endpoints produce JSONL entries in /app/data/logs/

### Wave 0 Gaps
None -- no automated test infrastructure needed for this phase. TypeScript compilation via `npm run build` is sufficient to verify correct logger integration (wrong number of arguments or missing imports cause build failures).

## Sources

### Primary (HIGH confidence)
- Existing codebase: `app/src/lib/logger.ts` — current logger implementation analyzed directly
- Existing codebase: 75 API route files with console.log identified via grep
- Existing codebase: `app/src/lib/services/usage-tracker.ts` — pattern reference for service integration
- Project decisions in STATE.md — `fs.appendFileSync`, custom logger, JSONL format

### Secondary (MEDIUM confidence)
- Node.js `fs.appendFileSync` documentation — synchronous write guarantees

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No external dependencies, all Node.js built-ins
- Architecture: HIGH - Logger module already exists, enhancement path is clear
- Pitfalls: HIGH - Based on direct codebase analysis and existing project patterns

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable — no external dependency changes expected)
