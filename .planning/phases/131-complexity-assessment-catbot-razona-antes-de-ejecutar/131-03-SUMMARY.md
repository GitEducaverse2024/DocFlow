---
phase: 131-complexity-assessment-catbot-razona-antes-de-ejecutar
plan: 03
subsystem: catbot-complexity-gate
tags: [catbot, route, intent-job-executor, notifications, throttling, self-check, qa-06, p0]
requires:
  - Plan 02 (decisionId propagation + updateComplexityOutcome in catch)
  - Phase 130 IntentJobExecutor + createIntentJob + runFullPipeline
  - createNotification + NotificationType union
provides:
  - Self-check escalation at iteration >= 3 in both streaming and non-streaming paths of /api/catbot/chat
  - 60s throttled notifyProgress (Map<jobId, lastNotifyAt>) with force flag for phase transitions
  - pipeline_progress NotificationType for web-channel progress pings
  - markTerminal helper for Map cleanup on terminal status
  - Periodic nudges before each pipeline LLM roundtrip
affects:
  - app/src/app/api/catbot/chat/route.ts: self-check blocks at end of each tool-loop iteration (non-streaming + streaming)
  - app/src/lib/services/intent-job-executor.ts: notifyProgress rewritten with throttling + web channel branch; phase transitions force=true; markTerminal on every terminal status update
  - app/src/lib/services/notifications.ts: NotificationType union extended with 'pipeline_progress'
  - app/src/lib/__tests__/intent-job-executor.test.ts: 7 new tests in "notifyProgress throttling (Phase 131)" describe block
tech-stack:
  added: []
  patterns:
    - "Map<string, number> throttling keyed by jobId with static readonly interval"
    - "Date.now() spy + manual nowMs counter for time-sensitive tests (cleaner than fake timers which interfere with dynamic import resolution)"
    - "Direct createIntentJob call (not executeTool) to avoid any risk of recursive tool dispatch on self-check escalation"
    - "Sequential callNotify + await flush() in tests to avoid racing concurrent dynamic imports of ./telegram-bot"
key-files:
  created:
    - .planning/phases/131-complexity-assessment-catbot-razona-antes-de-ejecutar/131-03-SUMMARY.md
  modified:
    - app/src/app/api/catbot/chat/route.ts
    - app/src/lib/services/intent-job-executor.ts
    - app/src/lib/services/notifications.ts
    - app/src/lib/__tests__/intent-job-executor.test.ts
decisions:
  - "Throttling is stored in-memory (static Map on the class) — NOT persisted. A server restart mid-pipeline causes at most one extra ping on the first post-restart tick. Trade-off accepted (no new schema, no timer lifecycle, no cleanup races)."
  - "Self-check uses createIntentJob directly from catbot-db, not executeTool('queue_intent_job', ...). Rationale: executeTool goes through the tool dispatcher which may re-enter the complexity gate / permission layer. Direct call is deterministic and recursion-proof."
  - "Streaming self-check emits the escalation as a single deferred token chunk (prefixed with '\\n\\n' to separate from any earlier visible output). No new SSE event type — the existing client renderer handles this transparently."
  - "markTerminal is a dedicated helper rather than inlining lastNotifyAt.delete() at every terminal update site. Keeps intent obvious at call sites (status flip + cleanup)."
  - "Tests use a Date.now() spy + manual nowMs counter instead of vi.useFakeTimers(). Fake timers interfered with dynamic import('./telegram-bot') resolution, causing spurious flakes."
metrics:
  duration_minutes: ~8
  tasks_completed: 3
  files_created: 1
  files_modified: 4
  commits: 3
  tests_added: 7
  tests_total_passing: 132
completed: 2026-04-10
---

# Phase 131 Plan 03: Self-Check Escalation + 60s Progress Throttling Summary

Two safety nets on top of the Plan 02 complexity gate: (1) a deterministic self-check in route.ts that breaks the tool loop when CatBot misclassified a complex request and is still emitting tool_calls after 3 iterations, encoling the remaining work as an async CatFlow; and (2) a 60s-throttled progress reporter in IntentJobExecutor that closes the UX loop promised by the gate ("recibirás reportes cada 60 segundos").

## What was built

### 1. Self-check escalation in /api/catbot/chat/route.ts

**Import:** `createIntentJob` added to the existing `@/lib/catbot-db` import line.

**Non-streaming path** — the self-check block lives at the end of the `for (let iteration = 0; iteration < maxIterations; iteration++)` body, AFTER the `for (const toolCall of ...)` inner loop that executes tools. Insertion anchor: immediately after the tool-dispatch closing `}` and before the outer loop's closing `}`.

```typescript
if (
  iteration >= 3 &&
  assistantMessage.tool_calls &&
  assistantMessage.tool_calls.length > 0
) {
  const remainingWork = `Tras ${iteration + 1} pasos, queda trabajo pendiente. Intent original: ${lastUserMessage}`;
  let escalatedJobId = 'unknown';
  try {
    escalatedJobId = createIntentJob({
      userId,
      channel: effectiveChannel ?? 'web',
      toolName: '__description__',
      toolArgs: { description: remainingWork, original_request: lastUserMessage },
    });
  } catch (e) {
    logger.error('catbot', 'Self-check createIntentJob failed', { error: (e as Error).message });
  }
  if (decisionId) {
    try { updateComplexityOutcome(decisionId, 'queued', true); } catch { /* swallow */ }
  }
  logger.warn('catbot', 'Self-check escalation', { decisionId, escalatedJobId, iteration });
  finalReply = `Esta tarea ha resultado mas compleja de lo esperado. La he encolado como CatFlow asincrono (job ${escalatedJobId}). Te avisare con reportes cada 60 segundos.`;
  break;
}
```

Deterministic condition: `iteration >= 3 && assistantMessage.tool_calls?.length > 0`. No NLP-based "pending work" detection.

**Streaming path** — mirror block placed at the end of the streaming tool loop body (after the inner `for (const tc of pendingToolCalls)` closes). Uses `pendingToolCalls.length > 0` as the trigger. Emits the escalation as a single deferred `send('token', { token: '\n\n' + escalationMsg })` and then `break`s the outer loop. No new SSE event type.

**No executeTool re-entry:** Both paths call `createIntentJob` directly from `@/lib/catbot-db` rather than routing through `executeTool('queue_intent_job', ...)`. This guarantees no recursive tool dispatch / permission check / complexity gate re-entry.

**decisionId flip:** When the self-check fires, `updateComplexityOutcome(decisionId, 'queued', true)` flips the original audit row to `outcome='queued', async_path_taken=1`, correctly reflecting that a "simple"-classified request actually took the async path.

### 2. 60s throttled notifyProgress in IntentJobExecutor

**Added static state** (class top):

```typescript
private static lastNotifyAt: Map<string, number> = new Map();
private static readonly NOTIFY_INTERVAL_MS = 60_000;
```

**Rewritten `notifyProgress` signature** (was `(job, message)`, now `(job, message, force?)`):

- Short-circuit: `if (!force && Date.now() - lastNotifyAt.get(job.id) ?? 0 < NOTIFY_INTERVAL_MS) return;`
- Writes `lastNotifyAt.set(job.id, now)` on every emission
- Telegram branch unchanged (dynamic `import('./telegram-bot')` + `sendMessage`)
- NEW Web branch: `createNotification({ type: 'pipeline_progress', title: 'CatFlow en progreso', message, severity: 'info', link: '/catflow/' + (job.canvas_id ?? '') })` wrapped in try/catch

**Phase-transition call sites updated to pass `force=true`:**

| Anchor | Line (post-edit) | Phase transition | force |
|--------|------------------|------------------|-------|
| `runFullPipeline` strategist nudge | 156 | pre-strategist LLM call | false |
| `runFullPipeline` post-strategist | 162 | strategist done, goal defined | **true** |
| `runFullPipeline` decomposer nudge | 167 | pre-decomposer LLM call | false |
| `runFullPipeline` post-decomposer | 176 | decomposer done, tasks listed | **true** |
| `runFullPipeline` architect nudge | 181 | pre-architect LLM call | **true** |
| `runArchitectRetry` architect nudge | 221 | resume path pre-architect | **true** |

**Periodic nudge placement:** Before each of the three `callLLM` invocations in `runFullPipeline`, a no-flag `notifyProgress(job, 'Procesando fase=<phase>...')` call is placed. It no-ops until 60s have elapsed since the previous emit, so long LLM calls still produce at least one progress ping per minute without spamming.

**`markTerminal(jobId)` helper** (new private static):

```typescript
private static markTerminal(jobId: string): void {
  this.lastNotifyAt.delete(jobId);
}
```

Called from every terminal-status update site:

- `tick()` catch block (line 143) — after `status='failed'` from top-level pipeline exception
- `runArchitectRetry` bad-JSON branch — after `status='failed'` for invalid progress_message
- `runArchitectRetry` unresolved-catpaws branch — after `status='failed'`
- `finalizeDesign` architect-output-invalid branch — after `status='failed'` for validation error

The `awaiting_approval` and `awaiting_user` phases are NOT terminal (the job is still alive waiting for user input), so they do not trigger cleanup.

### 3. pipeline_progress NotificationType

One-line extension in `app/src/lib/services/notifications.ts` line 7:

```typescript
export type NotificationType = 'process' | 'rag' | 'task' | 'canvas' | 'connector' | 'system' | 'catflow_pipeline' | 'pipeline_progress';
```

No schema change — notifications table stores `type TEXT` so any string value is accepted; only the TypeScript union is extended.

### 4. Tests (7 new, 132 total passing)

**Wave 0 (RED, commit `219670a`):**

New describe block `notifyProgress throttling (Phase 131)` appended to `app/src/lib/__tests__/intent-job-executor.test.ts`:

- Test 1: first call for a telegram job emits via `telegramBotService.sendMessage` (chat id parsed, message prefixed with hourglass)
- Test 2: second call within 60s for same jobId is suppressed
- Test 3: force=true bypasses throttle within the 60s window
- Test 4: call after 61s+ re-emits without force
- Test 5: different jobIds tracked independently (uses distinct chat ids + sequential flush to avoid racing concurrent dynamic imports)
- Test 6: `markTerminal(jobId)` cleanup allows the next call to re-emit immediately
- Test 7: web-channel job invokes `createNotification` with `type='pipeline_progress'` and NOT `telegramBotService.sendMessage`

**Test seam compromises:**

- `notifyProgress`, `lastNotifyAt`, `markTerminal` are private static members; tests access them via `(IntentJobExecutor as unknown as Internals)` casts. Kept as internals (not made public) to preserve the API surface.
- Tests use a `Date.now()` spy + manual `nowMs` counter instead of `vi.useFakeTimers()`. Fake timers interfered with the dynamic `import('./telegram-bot')` resolution path, producing spurious zero-call failures on the very first assertion. The spy approach is simpler and deterministic.
- A `flush()` helper drains 3 macrotask ticks + ~60 microtask drains per call, which is required for the dynamic import chain to resolve before assertions.
- Test 5 had to sequence `callNotify` + `flush()` + `callNotify` + `flush()` (rather than back-to-back calls) because concurrent dynamic imports of the same module caused one of the two `sendMessage` invocations to be dropped by vitest's mock machinery.

**Post-implementation (commits `b2cb562` + `c4cd987`):** all 132 tests across 6 suites green.

### Route.ts self-check tests

Deferred to the Plan 04 oracle E2E. route.ts is too side-effect-heavy (LiteLLM fetch, SSE stream, full tool dispatcher) for clean unit tests, and the behavior is deterministic at the code level (iteration counter + tool_calls.length check).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test harness: fake timers broke dynamic imports**

- **Found during:** Task 1 while running the initial RED tests
- **Issue:** `vi.useFakeTimers()` + `vi.setSystemTime()` caused the dynamic `import('./telegram-bot')` inside `notifyProgress` to never resolve its `.then()` callback within the test timing, producing "expected 1, got 0" failures on the very first assertion of several tests.
- **Fix:** Replaced fake timers with `vi.spyOn(Date, 'now').mockImplementation(() => nowMs)` and a manual `nowMs` counter the tests advance directly. Added a `flush()` helper that drains 3 setTimeout(0) ticks + 20 microtask drains each.
- **Files modified:** `app/src/lib/__tests__/intent-job-executor.test.ts`
- **Commit:** `219670a` (part of the RED commit)

**2. [Rule 3 - Blocking] Test 5: concurrent dynamic imports dropped one call**

- **Found during:** Task 2 while validating GREEN state
- **Issue:** Test 5 called `notifyProgress` twice back-to-back for different jobIds, then awaited flush. Only one of the two `telegramBotService.sendMessage` calls was registered, even though both code paths executed.
- **Fix:** Sequenced the two calls with an intermediate `await flush()` and used distinct chat ids (`10001`, `10002`) to avoid any mock-collapse. This still exercises "different jobIds tracked independently" because the suppression assertion at +5s still fires for both.
- **Files modified:** `app/src/lib/__tests__/intent-job-executor.test.ts`
- **Commit:** `b2cb562` (merged with Task 2 impl commit)

### Out-of-scope discoveries

None. No pre-existing warnings or unrelated failures touched.

## Verification

```bash
cd ~/docflow/app && npx vitest run \
  src/lib/__tests__/complexity-parser.test.ts \
  src/lib/__tests__/complexity-decisions.test.ts \
  src/lib/__tests__/catbot-prompt-assembler.test.ts \
  src/lib/__tests__/intent-jobs.test.ts \
  src/lib/__tests__/intent-job-executor.test.ts \
  src/lib/__tests__/catbot-intents.test.ts
```
**Result:** 132 passed (132)

```bash
cd ~/docflow/app && npm run build
```
**Result:** Build succeeded (zero ESLint unused-imports errors, zero TypeScript errors)

## Commits

- `219670a` — `test(131-03): add failing tests for notifyProgress throttling`
- `b2cb562` — `feat(131-03): add 60s throttled progress notifications + pipeline_progress type`
- `c4cd987` — `feat(131-03): add self-check escalation after iteration>=3 with pending tool_calls`

## Self-Check: PASSED

- FOUND: app/src/lib/services/intent-job-executor.ts (modified — lastNotifyAt Map, NOTIFY_INTERVAL_MS, throttled notifyProgress, markTerminal, phase-transition force=true, pre-LLM nudges, terminal cleanup on 4 failure sites)
- FOUND: app/src/lib/services/notifications.ts (modified — pipeline_progress added to NotificationType union)
- FOUND: app/src/app/api/catbot/chat/route.ts (modified — createIntentJob import, self-check block in non-streaming path, self-check block in streaming path)
- FOUND: app/src/lib/__tests__/intent-job-executor.test.ts (modified — 7 new tests in notifyProgress throttling describe block)
- FOUND commit: 219670a
- FOUND commit: b2cb562
- FOUND commit: c4cd987
- VERIFIED: 132/132 tests passing across 6 suites
- VERIFIED: npm run build success
- VERIFIED: all success criteria met (self-check in tool loop, 60s throttling with force flag, pipeline_progress type, SUMMARY.md created)
