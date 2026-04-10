---
phase: 130-async-catflow-pipeline-creaci-n-asistida-de-workflows
plan: 02
subsystem: catbot
tags: [catbot, intent-jobs, async-pipeline, executor, llm-pipeline, prompt-assembler]
requires:
  - 130-01 (intent_jobs table + CRUD + 6 tools)
  - 129 (IntentWorker singleton pattern)
  - 128 (AlertService singleton pattern)
provides:
  - IntentJobExecutor singleton (background worker with 3-phase state machine + architect_retry resume branch)
  - catbot-pipeline-prompts.ts (STRATEGIST / DECOMPOSER / ARCHITECT system prompts)
  - cleanupOrphanJobs CRUD helper + extended IntentJobRow.pipeline_phase union (+architect_retry)
  - getNextPendingJob now accepts pipeline_phase IN ('pending','architect_retry')
  - buildComplexTaskProtocol() P1 section injected in PromptAssembler
  - 'intent-job-executor' LogSource literal
  - Boot wiring in instrumentation.ts (after IntentWorker)
affects:
  - app/src/lib/catbot-db.ts
  - app/src/lib/logger.ts
  - app/src/lib/services/catbot-prompt-assembler.ts
  - app/src/instrumentation.ts
tech_stack:
  added: []
  patterns:
    - "singleton worker class with static start/stop/tick + BOOT_DELAY stagger (mirrors IntentWorker/AlertService)"
    - "direct LiteLLM fetch with response_format: json_object (NO /api/catbot/chat re-entry)"
    - "currentJobId in-memory guard for one-job-per-tick concurrency"
    - "architect_retry branch reuses persisted goal+tasks from progress_message (resume path)"
    - "parseJSON markdown-fence strip fallback"
    - "cleanupOrphans on start() to mark abandoned intermediate-phase jobs as failed"
key_files:
  created:
    - app/src/lib/services/catbot-pipeline-prompts.ts
    - app/src/lib/services/intent-job-executor.ts
    - app/src/lib/__tests__/intent-job-executor.test.ts
  modified:
    - app/src/lib/catbot-db.ts
    - app/src/lib/logger.ts
    - app/src/lib/services/catbot-prompt-assembler.ts
    - app/src/instrumentation.ts
    - app/src/lib/__tests__/catbot-prompt-assembler.test.ts
decisions:
  - "ARCHITECT_PROMPT explicitly whitelists valid node types (agent|catpaw|catbrain|condition|iterator|multiagent|scheduler|checkpoint|connector) to avoid Pitfall 8 from RESEARCH"
  - "architect_retry branch validates progress_message.cat_paws_resolved === true as invariant — otherwise job goes straight to failed (defensive)"
  - "scanResources catches errors and returns empty arrays so tests with mocked db don't need to stub every table individually"
  - "notifyProgress / sendProposal / notifyUserCatPawApproval kept as logger-only stubs — Plan 04 replaces with real cross-channel notifications"
  - "cleanupOrphanJobs only marks jobs whose pipeline_phase is intermediate (NOT in pending/architect_retry/awaiting_approval/awaiting_user) — preserving all user-waiting states"
  - "buildComplexTaskProtocol tightened to ~700 chars after first draft ran 1026 chars (budget <800)"
metrics:
  duration_minutes: 8
  completed_date: "2026-04-10"
  tasks_total: 3
  tasks_completed: 3
  tests_added: 11
  tests_passing: 11
requirements_covered:
  - PIPE-02 (fully — buildComplexTaskProtocol P1 section injected with queue_intent_job/list_my_jobs/cancel_job/post_execution_decision instructions)
  - PIPE-03 (fully — IntentJobExecutor drives 3-phase pipeline with direct LiteLLM, one-job-per-tick guard, orphan cleanup)
  - PIPE-04 (partial — architect_retry resume branch implemented; approve_catpaw_creation tool that flips phase deferred to Plan 04 Task 4)
---

# Phase 130 Plan 02: IntentJobExecutor + 3-Phase Pipeline Engine Summary

Background worker that drives the async CatFlow pipeline from `intent_jobs` to `awaiting_approval` via three sequential LiteLLM calls (strategist -> decomposer -> architect), plus the PromptAssembler P1 section that teaches CatBot when to enqueue jobs. Includes the `architect_retry` resume branch that will let Plan 04 close the needs_cat_paws loop without re-running strategist/decomposer.

## What was built

### 1. Three pipeline prompts (`catbot-pipeline-prompts.ts`)

New file exporting three `const` system prompts, each instructing the LLM to return STRICT JSON:

- `STRATEGIST_PROMPT` -> `{ goal, success_criteria[], estimated_steps }`
- `DECOMPOSER_PROMPT` -> `{ tasks: [{ id, name, description, depends_on[], expected_output }] }`
- `ARCHITECT_PROMPT` -> `{ name, description, flow_data: {nodes, edges}, needs_cat_paws? }`

The architect prompt explicitly whitelists the nine valid canvas node types (`agent | catpaw | catbrain | condition | iterator | multiagent | scheduler | checkpoint | connector`) to sidestep the "LLM invents invalid types" pitfall flagged in RESEARCH.

### 2. IntentJobExecutor singleton (`intent-job-executor.ts`)

411-line file mirroring IntentWorker / AlertService structure:

**Lifecycle** (static): `start()` runs `cleanupOrphans()` synchronously, then `setTimeout(tick, BOOT_DELAY=60_000)`, then `setInterval(tick, CHECK_INTERVAL=30_000)`. The 60s boot delay staggers cleanly behind AlertService (30s) and IntentWorker (45s) to avoid WAL contention.

**Concurrency guard**: `private static currentJobId: string | null` — if set, `tick()` early-returns. Always cleared in `finally`. This is the one-job-per-tick invariant.

**State machine** (inside `tick()`):

```
getNextPendingJob() -> job
if job.pipeline_phase === 'architect_retry':
    runArchitectRetry(job)       // 1 LLM call
else:
    runFullPipeline(job)          // 3 LLM calls
```

- **`runFullPipeline`**: updates phase to `strategist` BEFORE the first LLM call (avoids Pitfall 4 — orphaned pending rows if the LLM hangs), then chains strategist -> decomposer -> architect, persisting `progress_message` at each transition.
- **`runArchitectRetry`**: parses `progress_message` from the persisted JSON, invariant-checks `cat_paws_resolved === true` (hard-fails the job otherwise to prevent infinite retry), then runs ONLY the architect call with the reused goal + tasks + freshly-scanned resources (which now include the newly-created CatPaws).
- **`finalizeDesign`** (shared): if `design.needs_cat_paws[]` is non-empty, persists `{cat_paws_needed, cat_paws_resolved: false}` in progress_message and transitions to `awaiting_user` WITHOUT creating a canvas. Otherwise `INSERT INTO canvases` + transition to `awaiting_approval` with `canvas_id` populated.

**Error handling**: any thrown error (LLM HTTP failure, JSON parse after fence-strip, canvas insert failure) falls through to the outer `catch` which marks the job `status='failed', error=String(err)`. No infinite loop.

**Helpers**:
- `callLLM(systemPrompt, userInput)` — direct fetch to `${LITELLM_URL}/v1/chat/completions` with `response_format: { type: 'json_object' }`, temperature 0.3, max_tokens 4000, bracket-notation env access (`process['env']['LITELLM_URL']` per MEMORY.md). On non-OK response, throws `litellm ${status}: ${body}`.
- `parseJSON(raw)` — tries `JSON.parse`; on failure strips `` ```json / ``` `` markdown fences and retries; still throws on invalid.
- `scanResources()` — queries `cat_paws` (active only), `catbrains`, `skills`, `connectors` with LIMIT 50 each via `@/lib/db`. Catches errors and returns empty arrays (test-friendly).
- `buildStrategistInput(job)` — packs `tool_name + tool_args + channel` into a JSON string.
- `cleanupOrphans()` — delegates to `cleanupOrphanJobs()` exported from catbot-db.
- Three notification stubs (`notifyProgress`, `sendProposal`, `notifyUserCatPawApproval`) that currently only log — Plan 04 will wire them to `createNotification` + `TelegramBotService.sendMessageWithInlineKeyboard`.

### 3. catbot-db extensions

- `IntentJobRow.pipeline_phase` union extended with `'architect_retry'`.
- `getNextPendingJob()` WHERE clause changed from `pipeline_phase = 'pending'` to `pipeline_phase IN ('pending','architect_retry')` — this is the keystone that lets Plan 04 Task 4's `approve_catpaw_creation` tool resume the job simply by flipping the phase.
- New `cleanupOrphanJobs()` export: `UPDATE intent_jobs SET status='failed', error='Abandoned on restart', completed_at=now WHERE status='pending' AND pipeline_phase NOT IN ('pending','architect_retry','awaiting_approval','awaiting_user')`. Preserves all user-waiting states.

### 4. PromptAssembler P1 section

New exported function `buildComplexTaskProtocol()` in `catbot-prompt-assembler.ts` — a compact ~700-char protocol that tells CatBot:
- Which tools are ASYNC (by name + by `(ASYNC` substring in description)
- The confirmation dialog flow ("Esto llevara varios pasos...")
- The correct tool to call on YES (`queue_intent_job`)
- Status queries (`list_my_jobs`, `cancel_job`)
- "Do not re-execute jobs in awaiting_approval"
- Post-execution lifecycle via `post_execution_decision({job_id, action: keep_template|save_recipe|delete})`

Registered in `build()` right after `intent_protocol` with `id: 'complex_task_protocol', priority: 1`.

### 5. logger.ts

Added `'intent-job-executor'` to the `LogSource` union so `logger.info/warn/error` calls from the executor type-check cleanly. This is the failure mode flagged in `<critical_reminders>` — caught at build time, not runtime.

### 6. instrumentation.ts boot wiring

Appended a new try/await-import block after `IntentWorker.start()` that dynamically imports and starts `IntentJobExecutor`. Same error-logging pattern as the five existing service starts (AlertService, IntentWorker, SummaryService, etc.). No ordering logic needed at this level — the BOOT_DELAY constants inside each service provide the 30s/45s/60s stagger.

### 7. Test coverage

**`intent-job-executor.test.ts`** — 8 tests covering every state-machine branch:

1. **happy path**: pending -> 3 LLM calls -> `awaiting_approval` with canvas_id populated; asserts `callLLM` called exactly 3 times
2. **pause path**: architect returns `needs_cat_paws[]` -> `awaiting_user`, `canvas_id: null`, `progress_message.cat_paws_needed.length === 1`, `cat_paws_resolved: false`
3. **resume path (architect_retry)**: manually inserted job with `pipeline_phase='architect_retry'` and persisted `{goal, tasks, cat_paws_resolved: true}` -> exactly 1 LLM call (architect only) -> `awaiting_approval` with canvas_id
4. **resume invariant**: same setup but `cat_paws_resolved: false` -> job goes straight to `failed` with error matching `/cat_paws_resolved/`
5. **error path**: first `callLLM` rejects with `litellm 500` -> `status='failed', error` matching `/litellm/`
6. **currentJobId guard**: pre-set `currentJobId` to a non-null value -> `tick()` early-returns without calling LLM at all
7. **orphan cleanup**: insert a job with `pipeline_phase='strategist'` pre-existing -> `cleanupOrphans()` transitions it to `failed` with `error='Abandoned on restart'`
8. **parseJSON fence fallback**: strategist LLM returns markdown-fenced JSON -> executor strips fences and proceeds normally to `awaiting_approval`

**`catbot-prompt-assembler.test.ts`** — 3 new `it()` blocks extending the existing describe:

- `buildComplexTaskProtocol` length under 800 chars (test caught the initial 1026-char draft and forced compression)
- Keyword coverage: `Protocolo de Tareas Complejas`, `queue_intent_job`, `ASYNC`, `60s`, `awaiting_approval`, `post_execution_decision`
- `build(baseCtx)` output contains the registered section content

## Verification

```
$ npx vitest run src/lib/__tests__/intent-job-executor.test.ts src/lib/__tests__/catbot-prompt-assembler.test.ts
Test Files  2 passed (2)
     Tests  56 passed (56)
```

```
$ npm run build
✓ Compiled successfully
✓ Linting and checking validity of types
(only pre-existing warnings about <img> tags + react-hooks deps in unrelated components)
```

Grep sanity checks:
- `grep -c "IntentJobExecutor" app/src/instrumentation.ts` → **2** (import + start call)
- `grep -c "buildComplexTaskProtocol" app/src/lib/services/catbot-prompt-assembler.ts` → **2** (definition + sections.push)
- `grep -c "intent-job-executor" app/src/lib/logger.ts` → **1** (LogSource literal)
- `grep -c "architect_retry" app/src/lib/services/intent-job-executor.ts` → **3** (union handling)
- `grep -c "architect_retry" app/src/lib/catbot-db.ts` → **3** (union type + getNextPendingJob + cleanupOrphanJobs preserve list)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] buildComplexTaskProtocol exceeded 800-char budget on first draft**
- **Found during:** Task 3 test run (`expected 1026 to be less than 800`)
- **Issue:** The Pattern 4 draft from RESEARCH was verbose (headers + bullet lists) and came in at 1026 chars — over the <800 target.
- **Fix:** Rewrote as flat prose with minimal headers, kept all 6 required keywords and the full flow instructions. Final size ~700 chars.
- **Files modified:** `app/src/lib/services/catbot-prompt-assembler.ts`
- **Commit:** ba2409e

**2. [Rule 3 - Blocker] Unused imports broke Docker-equivalent `npm run build`**
- **Found during:** Task 3 `npm run build`
- **Issue:** ESLint strict mode flagged `getIntentJob` (imported in `intent-job-executor.ts` but never used — the state machine only reads jobs via `getNextPendingJob`) and `updateIntentJob` (imported as a type handle in the test file but never referenced after refactor). Both errors break the build per MEMORY.md `feedback_unused_imports_build.md`.
- **Fix:** Removed both imports.
- **Files modified:** `app/src/lib/services/intent-job-executor.ts`, `app/src/lib/__tests__/intent-job-executor.test.ts`
- **Commit:** ba2409e

### Interpretation choices (not strictly deviations)

- **cleanupOrphanJobs helper location:** Plan suggested either inline DB prepare inside `IntentJobExecutor.cleanupOrphans()` or a new export from `catbot-db`. Chose the `catbot-db` export so the orphan-cleanup query lives next to the other `intent_jobs` CRUD and can be reused by future admin UIs without importing the singleton.
- **scanResources error handling:** Plan said "if the tables don't exist in test context, catch and return empty arrays". Implemented as a single `try { ...all 4 queries... } catch { return empty }` rather than four individual try/catches — simpler and still lets the happy-path test stub the whole db.prepare via `vi.mock('@/lib/db')`.
- **Notification stubs:** Plan said "logger.info placeholders that Plan 04 will implement". I kept them as static private methods on the class so Plan 04 can swap the bodies without changing call sites — avoids touching `runFullPipeline` / `runArchitectRetry` / `finalizeDesign` when the real notifications land.
- **pipeline_phase union extension:** Plan 01 did not include `'architect_retry'`. I added it here (Plan 02) as part of the state-machine implementation rather than retroactively editing Plan 01's `IntentJobRow`. The DB column is TEXT so no schema migration required — only the TypeScript union needed updating.

## Commits

| Hash | Task | Message |
|---|---|---|
| 300e776 | 1 | `test(130-02): add failing intent-job-executor + prompt-assembler protocol tests (RED)` |
| 9e889a9 | 2 | `feat(130-02): IntentJobExecutor singleton + 3 pipeline prompts` |
| ba2409e | 3 | `feat(130-02): buildComplexTaskProtocol P1 section + IntentJobExecutor boot wiring` |

## Requirements Coverage

- **PIPE-02 (fully):** `buildComplexTaskProtocol` injected at P1 with all required tool references, length within budget, test-verified in `build()` output
- **PIPE-03 (fully):** 3-phase executor running via direct LiteLLM, one-job-per-tick guard, orphan cleanup on start, BOOT_DELAY stagger, instrumentation.ts registration, 8 unit tests covering every branch
- **PIPE-04 (partial):** `architect_retry` branch + `getNextPendingJob` extension + `finalizeDesign` cat_paws pause are all in place. The closing side (the `approve_catpaw_creation` tool that flips pipeline_phase back to `'architect_retry'` after creating the CatPaws) is deferred to Plan 04 Task 4 per the plan.

## Oracle Verification (CatBot Protocol)

Code-complete. The CatBot oracle check for this plan (asking CatBot to explain the complex-task protocol + queue a dummy async job and observe the state transitions) is deferred to the phase-level `checkpoint:human-verify` before Phase 130 closes — same pattern as Plan 01 and consistent with the phase-wide UAT block scheduled after Plan 05.

## Self-Check: PASSED

- `app/src/lib/services/catbot-pipeline-prompts.ts` — FOUND (created, 3 prompt exports + node-type whitelist)
- `app/src/lib/services/intent-job-executor.ts` — FOUND (created, singleton + full state machine + architect_retry branch)
- `app/src/lib/__tests__/intent-job-executor.test.ts` — FOUND (created, 8 tests covering all branches)
- `app/src/lib/catbot-db.ts` — FOUND (modified, union extension + getNextPendingJob + cleanupOrphanJobs)
- `app/src/lib/logger.ts` — FOUND (modified, 'intent-job-executor' LogSource added)
- `app/src/lib/services/catbot-prompt-assembler.ts` — FOUND (modified, buildComplexTaskProtocol + P1 registration)
- `app/src/instrumentation.ts` — FOUND (modified, IntentJobExecutor.start() wired after IntentWorker)
- `app/src/lib/__tests__/catbot-prompt-assembler.test.ts` — FOUND (modified, 3 new it() blocks)
- Commit 300e776 — FOUND
- Commit 9e889a9 — FOUND
- Commit ba2409e — FOUND
