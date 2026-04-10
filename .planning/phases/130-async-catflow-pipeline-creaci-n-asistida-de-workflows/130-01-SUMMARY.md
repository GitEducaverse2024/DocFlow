---
phase: 130-async-catflow-pipeline-creaci-n-asistida-de-workflows
plan: 01
subsystem: catbot
tags: [catbot, intent-jobs, async-pipeline, persistence, tools]
requires:
  - 129-01 (intents table + IntentRow CRUD pattern)
  - 124 (USER_SCOPED_TOOLS enforcement)
provides:
  - intent_jobs table in catbot.db with 16 columns + 3 indexes
  - IntentJobRow interface + CRUD (createIntentJob, updateIntentJob, getIntentJob, listJobsByUser, getNextPendingJob, countStuckPipelines)
  - ASYNC_TOOLS const map for OpenAI-safe async metadata
  - 6 new CatBot tools (queue_intent_job, list_my_jobs, cancel_job, approve_pipeline, execute_approved_pipeline, post_execution_decision)
  - Permission gate + USER_SCOPED_TOOLS coverage for the 6 new tools
  - settings.json KTREE-02 sync
affects:
  - app/src/lib/catbot-db.ts
  - app/src/lib/services/catbot-tools.ts
  - app/data/knowledge/settings.json
tech_stack:
  added: []
  patterns:
    - "const-map metadata instead of inline tool fields (OpenAI tools API compat)"
    - "decorated TOOLS spread in getToolsForLLM to avoid mutating source of truth"
    - "updateIntentJob dynamic SET with auto completed_at on terminal transitions"
key_files:
  created:
    - app/src/lib/__tests__/intent-jobs.test.ts
  modified:
    - app/src/lib/catbot-db.ts
    - app/src/lib/services/catbot-tools.ts
    - app/data/knowledge/settings.json
decisions:
  - "ASYNC metadata kept in separate const map (not inline tool fields) to keep TOOLS[] strictly OpenAI-compatible"
  - "list_my_jobs already covered by startsWith('list_') always-allowed rule in getToolsForLLM; no explicit allowlist entry needed"
  - "execute_approved_pipeline implemented as permission-less internal twin of approve_pipeline that skips phase verification (for IntentJobExecutor use)"
  - "approve_pipeline canvas execute call uses INTERNAL_BASE_URL env var with baseUrl fallback (process['env'] bracket notation)"
  - "countStuckPipelines threshold 30min matches Phase 128 AlertService conventions"
  - "save_recipe derives triggerPatterns from progress_message.goal with job.tool_name fallback"
metrics:
  duration_minutes: 7
  completed_date: "2026-04-10"
  tasks_total: 3
  tasks_completed: 3
  tests_added: 22
  tests_passing: 22
requirements_covered:
  - PIPE-01 (fully)
  - PIPE-02 (partial — tool + metadata; PromptAssembler protocol deferred to 130-02)
  - PIPE-07 (partial — post_execution_decision 3 branches implemented; post-exec trigger flow deferred)
  - PIPE-08 (partial — list_my_jobs with isolation + progress parsing; dashboard UI deferred)
---

# Phase 130 Plan 01: Intent Jobs Foundation Summary

Persistent foundation for the async CatFlow pipeline: new `intent_jobs` table + full CRUD, 6 LLM-callable tools wired through the permission gate with cross-user isolation, and OpenAI-safe async metadata via a separate `ASYNC_TOOLS` const map that `getToolsForLLM` consumes without mutating the canonical `TOOLS[]` array.

## What was built

### 1. `intent_jobs` schema + CRUD (`app/src/lib/catbot-db.ts`)

Appended a new `CREATE TABLE IF NOT EXISTS intent_jobs` block inside the existing `catbotDb.exec()` template literal, right after Phase 129's `intents` table. 16 columns: `id`, `intent_id` (nullable FK), `user_id`, `channel`, `channel_ref`, `pipeline_phase` (10-state union), `tool_name`, `tool_args` (JSON), `canvas_id`, `status` (5-state union), `progress_message` (JSON, default `'{}'`), `result`, `error`, `created_at`, `updated_at`, `completed_at`. Three indexes: `idx_intent_jobs_status`, `idx_intent_jobs_user_status`, `idx_intent_jobs_phase`.

Exported `IntentJobRow` interface with precisely typed `pipeline_phase` and `status` unions, and six CRUD functions mirroring the knowledge_gaps / Phase 129 intents pattern:

- `createIntentJob({intentId?, userId, channel?, channelRef?, toolName, toolArgs?})` — inserts with `generateId()`, `JSON.stringify` for tool_args, defaults channel to `'web'`
- `updateIntentJob(id, patch)` — dynamic SET builder with always-updated `updated_at`; auto-sets `completed_at` when status transitions to `completed`/`failed`/`cancelled`; `progressMessage` serialized to JSON
- `getIntentJob(id)`, `listJobsByUser(userId, opts?)` — user-filtered with optional status + limit (default 20)
- `getNextPendingJob()` — oldest `status='pending' AND pipeline_phase='pending'` row for single-job executor contention safety
- `countStuckPipelines()` — rows in `status='running'` with `updated_at < now - 30min` for Phase 128 AlertService integration

### 2. Six new LLM tools + ASYNC metadata (`app/src/lib/services/catbot-tools.ts`)

Added an `ASYNC_TOOLS` const map just above `TOOLS[]`:

```ts
const ASYNC_TOOLS: Record<string, { estimated_duration_ms: number }> = {
  execute_catflow: { estimated_duration_ms: 120_000 },
  execute_task: { estimated_duration_ms: 180_000 },
  process_source_rag: { estimated_duration_ms: 240_000 },
};
```

`getToolsForLLM` now spreads `[...TOOLS, ...holdedTools]` into a decorated copy where each async tool's description gets `(ASYNC - estimated Ns)` appended. `TOOLS[]` itself is never mutated so unit tests observe stable descriptions and OpenAI tools API schema compatibility is preserved.

Six tool entries appended to `TOOLS[]` after the Phase 129 intent tools for locality:

| Tool | Gate | Purpose |
|---|---|---|
| `queue_intent_job` | always | Enqueue pipeline after user confirms async workflow |
| `list_my_jobs` | always (via `list_` prefix) | Surface user's pipeline status |
| `cancel_job` | `manage_intent_jobs` or empty | Terminate running pipeline |
| `approve_pipeline` | `manage_intent_jobs` or empty | Transition `awaiting_approval` → `running`, kick canvas |
| `execute_approved_pipeline` | always (internal) | Phase-unchecked twin for IntentJobExecutor |
| `post_execution_decision` | `manage_intent_jobs` or empty | Apply `keep_template` / `save_recipe` / `delete` |

`executeTool` switch gained 6 cases. `approve_pipeline` and `execute_approved_pipeline` call `fetch(${INTERNAL_BASE_URL ?? baseUrl}/api/canvas/${canvas_id}/execute)` (bracket-notation env access per MEMORY.md). `post_execution_decision` dispatches three branches: `UPDATE canvases SET is_template = 1`, `saveMemory({userId, triggerPatterns: [progress.goal ?? tool_name], steps: progress.tasks})`, or `DELETE FROM canvases WHERE id = ?`.

`USER_SCOPED_TOOLS` extended with `queue_intent_job`, `list_my_jobs`, `cancel_job`, `approve_pipeline`, `post_execution_decision` — cross-user access without sudo returns `SUDO_REQUIRED` per Phase 124 precedent.

### 3. Knowledge tree sync (`app/data/knowledge/settings.json`)

Added the 6 tool names to the `tools[]` array and bumped `updated_at` so `knowledge-tools-sync.test.ts` (KTREE-02) stays green. The bidirectional sync test now asserts all 6 new tools are both in `TOOLS[]` and in a knowledge JSON.

### 4. Wave 0 test suite (`app/src/lib/__tests__/intent-jobs.test.ts`)

405-line test file with 22 `it()` blocks mirroring `catbot-intents.test.ts` infrastructure (tmp CATBOT_DB_PATH, heavy-dep `vi.mock`s, observable `canvasesPrepare` fn for post_execution verification). Coverage:

- **intent_jobs CRUD (7 tests):** create defaults, progress JSON serialization, completed_at on terminal states, cross-user isolation, status+limit filters, getNextPendingJob ordering, countStuckPipelines 30min threshold
- **6 tools via executeTool (9 tests):** queue persists, list isolation + progress parsing, cancel_job transitions, approve rejects wrong phase, approve accepts + fetches canvas execute URL, post_execution 3 branches (keep_template UPDATE / save_recipe saveMemory / delete DELETE)
- **ASYNC_TOOLS visibility (2 tests):** async tools get `(ASYNC - estimated Ns)` suffix, non-async tools untouched
- **Permission gate (3 tests):** queue_intent_job/list_my_jobs/execute_approved_pipeline always-allowed; cancel/approve/post_execution default-allow when allowedActions empty; same three appear with `manage_intent_jobs` granted
- **USER_SCOPED_TOOLS (1 test):** cross-user `list_my_jobs` without sudo returns `SUDO_REQUIRED`

## Verification

```
$ npx vitest run src/lib/__tests__/intent-jobs.test.ts src/lib/__tests__/knowledge-tools-sync.test.ts
Test Files  2 passed (2)
     Tests  26 passed (26)
```

```
$ npm run build
✓ Compiled successfully
✓ Linting and checking validity of types
```

Grep sanity checks:
- `grep -c "ASYNC_TOOLS" catbot-tools.ts` → **2** (declaration + getToolsForLLM lookup)
- 6 new tool names in `settings.json`
- `grep -c "intent_jobs" catbot-db.ts` → **11**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESLint no-unused-vars on mock factory `_sql` param**
- **Found during:** Task 3 `npm run build`
- **Issue:** `vi.fn((_sql: string) => ...)` — the leading underscore convention is insufficient for this project's strict ESLint config, which fails the Docker build.
- **Fix:** Changed to `vi.fn((sql: string) => { void sql; return {...}; })` with explicit `void sql` statement to satisfy the linter while keeping the signature type-meaningful.
- **Files modified:** `app/src/lib/__tests__/intent-jobs.test.ts`
- **Commit:** 987fc00

**2. [Rule 3 - Blocker] `saveMemory` not imported from `@/lib/catbot-db`**
- **Found during:** Task 3 implementation
- **Issue:** `post_execution_decision` case needed `saveMemory`, which was already exported from `catbot-db.ts` (Phase 122) but not in the import list of `catbot-tools.ts`.
- **Fix:** Added `saveMemory` to the existing `import catbotDb, { ... } from '@/lib/catbot-db'` line alongside the new intent_jobs CRUD exports.
- **Files modified:** `app/src/lib/services/catbot-tools.ts`
- **Commit:** 987fc00

### Interpretation choices (not strictly deviations)

- **list_my_jobs gate:** Plan listed it among always-allowed items, but `getToolsForLLM` already whitelists `name.startsWith('list_')`. No explicit rule added to avoid duplication. Test verifies it's present in `getToolsForLLM([])`.
- **save_recipe trigger derivation:** Plan said "triggerPatterns derivado de progress_message.goal". Implementation uses `progress.goal || job.tool_name || ''` filtered to non-empty so the `saveMemory` call still succeeds when `goal` is absent; otherwise `triggerPatterns` would be `['']` which is useless for matching.
- **approve_pipeline fetch baseUrl:** Plan mentioned `INTERNAL_BASE_URL || 'http://localhost:3000'`. I used `INTERNAL_BASE_URL || baseUrl` (the second arg to `executeTool`) since that's the already-resolved upstream callsite URL — avoids hardcoding a port that differs from DocFlow's actual `:3500`.

## Commits

| Hash | Task | Message |
|---|---|---|
| b169a06 | 1 | `test(130-01): add failing intent_jobs test scaffold (RED)` |
| 39f98d3 | 2 | `feat(130-01): add intent_jobs table + CRUD in catbot-db` |
| 987fc00 | 3 | `feat(130-01): 6 intent_jobs tools + ASYNC_TOOLS metadata + settings KTREE sync` |

## Requirements Coverage

- **PIPE-01 (fully):** Table + 6 CRUD exports + unit tests green
- **PIPE-02 (partial):** ASYNC metadata visible in `getToolsForLLM` output; `queue_intent_job` tool callable. Deferred to 130-02: PromptAssembler `buildComplexTaskProtocol` P1 section + heuristic detection
- **PIPE-07 (partial):** `post_execution_decision` three branches implemented and tested. Deferred: the post-execution trigger UX (buttons/notifications) + lifecycle hand-off from IntentJobExecutor
- **PIPE-08 (partial):** `list_my_jobs` parses progress + enforces user isolation + knowledge sync passes. Deferred: dashboard card + Telegram per-phase progress messages

## Oracle Verification (CatBot Protocol)

Per CLAUDE.md "CatBot como Oráculo" protocol, the oracle verification step (asking CatBot to demonstrate the 6 new tools via chat) is **deferred to a separate `checkpoint:human-verify` before phase completion**, consistent with Phase 129 Plan 03 precedent. Code-complete status is established; UAT sign-off requires a running DocFlow container.

## Self-Check: PASSED

- `app/src/lib/catbot-db.ts` — FOUND (modified, intent_jobs table + 6 CRUD exports)
- `app/src/lib/services/catbot-tools.ts` — FOUND (modified, ASYNC_TOOLS + 6 tools + cases + gate + USER_SCOPED_TOOLS)
- `app/data/knowledge/settings.json` — FOUND (modified, 6 tools in tools[] + updated_at bumped)
- `app/src/lib/__tests__/intent-jobs.test.ts` — FOUND (created, 405 lines, 22 tests)
- Commit b169a06 — FOUND
- Commit 39f98d3 — FOUND
- Commit 987fc00 — FOUND
