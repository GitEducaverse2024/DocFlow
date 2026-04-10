---
phase: 130-async-catflow-pipeline-creaci-n-asistida-de-workflows
plan: 04
subsystem: catbot
tags: [catbot, intent-jobs, async-pipeline, telegram, callback-query, notifications, catpaw-approval]
requires:
  - 130-03 (canvas-flow-designer + architect validation + needs_cat_paws pause persistence)
  - 128 (notifications + AlertService patterns)
  - 124 (USER_SCOPED_TOOLS enforcement)
provides:
  - NotificationType extended with 'catflow_pipeline'
  - TelegramCallbackQuery interface + callback_query field on TelegramUpdate
  - processCallbackQuery (approve|reject|create_catpaws) + sendMessageWithInlineKeyboard + answerCallbackQuery helpers
  - POST /api/intent-jobs/[id]/approve (force-dynamic, kicks canvas execute fire-and-forget)
  - POST /api/intent-jobs/[id]/reject (force-dynamic, marks cancelled)
  - POST /api/intent-jobs/[id]/approve-catpaws (force-dynamic, inserts CatPaws + flips to architect_retry)
  - resolveCatPawsForJob shared helper (catpaw-approval.ts — reused by route + tool)
  - approve_catpaw_creation CatBot tool (always_allowed for intent owner, closes BLOCKER 1)
  - IntentJobExecutor sendProposal + notifyUserCatPawApproval cross-channel wiring (web notification + Telegram inline keyboard)
  - notifyProgress telegram forwarding
affects:
  - app/src/lib/services/notifications.ts
  - app/src/lib/services/telegram-bot.ts
  - app/src/lib/services/intent-job-executor.ts
  - app/src/lib/services/catbot-tools.ts
  - app/data/knowledge/settings.json
tech_stack:
  added: []
  patterns:
    - "shared resolveCatPawsForJob helper called from two entry points (API route + CatBot tool) for identical DB state"
    - "dynamic import of telegram-bot inside executor (avoids circular import + keeps executor importable from tests without telegram mocks)"
    - "always-acknowledge callback_query BEFORE fetch (UX: clears the Telegram spinner before potential long fetch)"
    - "processUpdate branch for callback_query placed BEFORE the !msg guard so taps are not silently dropped"
    - "two-level authorization: USER_SCOPED_TOOLS gate enforces user_id arg consistency, the tool case enforces job ownership separately"
    - "fire-and-forget fetch to /api/canvas/{id}/execute from approve route with logger.warn on catch (no blocking)"
key_files:
  created:
    - app/src/lib/services/catpaw-approval.ts
    - app/src/app/api/intent-jobs/[id]/approve/route.ts
    - app/src/app/api/intent-jobs/[id]/reject/route.ts
    - app/src/app/api/intent-jobs/[id]/approve-catpaws/route.ts
    - app/src/lib/__tests__/telegram-callback.test.ts
    - app/src/app/api/intent-jobs/__tests__/approve.test.ts
  modified:
    - app/src/lib/services/notifications.ts
    - app/src/lib/services/telegram-bot.ts
    - app/src/lib/services/intent-job-executor.ts
    - app/src/lib/services/catbot-tools.ts
    - app/data/knowledge/settings.json
    - app/src/lib/__tests__/intent-jobs.test.ts
decisions:
  - "Reused existing telegramBotService singleton instead of adding a second export named telegramBot — the plan suggested adding telegramBot, but the file already exports telegramBotService and adding a duplicate would just be confusing. Executor imports via `const { telegramBotService } = await import('./telegram-bot')`."
  - "Shared helper extracted to catpaw-approval.ts (recommended-but-optional in plan). Both the API route and the CatBot tool delegate to resolveCatPawsForJob, guaranteeing identical DB state for the resume path."
  - "Dynamic import of telegram-bot.ts from intent-job-executor.ts (instead of top-level import) to avoid pulling the heavy telegram singleton into test contexts that do not stub it. The executor tests from Plan 02 still pass without any telegram mock."
  - "approve_catpaw_creation uses two-level auth: (1) USER_SCOPED_TOOLS gate validates user_id arg consistency, (2) the tool case cross-checks job.user_id !== context.userId. The plan wanted both; kept both for belt-and-suspenders."
  - "answerCallbackQuery is ALWAYS called before the fetch, not inside try/catch — ensures spinner clears even if fetch fails."
  - "Fetch to canvas execute from approve route is fire-and-forget with .catch(logger.warn). The executor tick + AlertService provide the safety net if the canvas hangs."
  - "processCallbackQuery validates both cq.data and cq.message before acting (not just cq.data) because sending a reply message requires chat_id from cq.message.chat.id."
  - "No exported telegramBot singleton was added because the existing singleton is already named telegramBotService and the plan's interface requirement can be satisfied by importing it under that name."
metrics:
  duration_minutes: 5
  completed_date: "2026-04-10"
  tasks_total: 5
  tasks_completed: 4
  tests_added: 10
  tests_passing: 36
requirements_covered:
  - PIPE-04 (fully — needs_cat_paws loop closed end-to-end: pause in awaiting_user -> approve_catpaw_creation or /api/intent-jobs/[id]/approve-catpaws -> architect_retry -> next executor tick -> awaiting_approval)
  - PIPE-05 (fully — cross-channel notification delivered via createNotification('catflow_pipeline', ...) + Telegram sendMessageWithInlineKeyboard for approve|reject|create_catpaws callback taps)
  - PIPE-06 (fully — approve endpoint transitions phase to running + fires canvas execute fire-and-forget)
---

# Phase 130 Plan 04: Cross-channel Approval + CatPaw Resume Loop Summary

Completes the async CatFlow pipeline with cross-channel user approval and closes the needs_cat_paws pause loop identified as BLOCKER 1. Telegram gained callback_query support from ZERO, three new API routes handle approve/reject/approve-catpaws, the CatBot tool `approve_catpaw_creation` provides a conversational resume path, and IntentJobExecutor's notification stubs are now real cross-channel dispatchers.

## What was built

### 1. `notifications.ts` — type extension

Added `'catflow_pipeline'` to the NotificationType union. One-line change; the rest of `createNotification` already handles the type field via `(params.type)` at INSERT time.

### 2. `telegram-bot.ts` — full callback_query support from scratch

Four additions to the 800-line service:

**TelegramCallbackQuery interface + TelegramUpdate.callback_query field** — mirrors Telegram Bot API (id, from, message, chat_instance, data).

**processUpdate branch** placed as the FIRST statement inside the method (before the `if (!msg || !msg.text) return` guard that would silently drop callback_query updates otherwise):

```ts
if (update.callback_query) {
  await this.processCallbackQuery(update.callback_query);
  return;
}
```

**sendMessageWithInlineKeyboard (public async)** — POST to `sendMessage` with `reply_markup.inline_keyboard`, same markdown + error handling as sendRawMessage.

**answerCallbackQuery (private async)** — required by Telegram to clear the button spinner after a tap.

**processCallbackQuery (private async)** — parses `pipeline:<jobId>:<action>`, validates, ALWAYS calls answerCallbackQuery first (even before the pipeline: check so unrelated taps also clear the spinner), then POSTs to the corresponding route:

- `approve` → `/api/intent-jobs/{jobId}/approve` + reply "✅ Pipeline aprobado. Ejecutando..."
- `reject` → `/api/intent-jobs/{jobId}/reject` + reply "❌ Pipeline cancelado."
- `create_catpaws` → `/api/intent-jobs/{jobId}/approve-catpaws` (empty JSON body — the route reads cat_paws_needed from progress_message) + reply "✅ CatPaws creados. Reanudando..."

Errors are caught and surfaced to the user with "⚠️ Error procesando tu decision."

### 3. API routes (3 new files, all `force-dynamic`)

**`/api/intent-jobs/[id]/approve/route.ts`** — validates phase === 'awaiting_approval', updates to running/running, fires a fire-and-forget POST to `/api/canvas/{canvas_id}/execute`, returns `{ok: true, canvas_id}`. 404 on not found, 400 on wrong phase or missing canvas_id.

**`/api/intent-jobs/[id]/reject/route.ts`** — simple transition to `pipeline_phase='cancelled', status='cancelled', error='User rejected'`. 404 on not found.

**`/api/intent-jobs/[id]/approve-catpaws/route.ts`** — delegates to `resolveCatPawsForJob(params.id, body.catpaws)`. Body is optional; if absent, the helper reads `cat_paws_needed` from persisted `progress_message`. Maps helper errors to HTTP codes: 'Job not found' → 404, anything else (wrong phase, empty list) → 400.

### 4. `catpaw-approval.ts` — shared helper (new)

`resolveCatPawsForJob(jobId, catpawsOverride?)` is called from two places with identical semantics:

1. Validates job exists and is in phase `'awaiting_user'`.
2. Reads `cat_paws_needed` from `progress_message` JSON, or uses override if provided.
3. For each catpaw: `db.prepare('INSERT INTO cat_paws ...').run(id, name, description, mode, system_prompt)`.
4. `updateIntentJob(jobId, { pipeline_phase: 'architect_retry', progressMessage: { ...prev, cat_paws_resolved: true, cat_paws_created } })`.
5. Returns `{ created: string[] }`.

This is the keystone of BLOCKER 1 closure. The next IntentJobExecutor.tick() now sees the job with `pipeline_phase='architect_retry'` and drives it through `runArchitectRetry` (Plan 02 Task 2), which re-scans resources (now including the freshly-created CatPaws), calls the architect once, and transitions to `awaiting_approval`.

### 5. `intent-job-executor.ts` — cross-channel notification wiring

Replaced the three stub methods from Plan 02:

- **`sendProposal`** now builds a markdown body with goal + task list, calls `createNotification({type: 'catflow_pipeline', title: 'Pipeline listo para aprobar', link: '/catflow/{canvasId}'})`, and if `job.channel === 'telegram'` dynamically imports `telegramBotService` and sends an inline keyboard with `[Ejecutar | Cancelar]` buttons whose callback_data is `pipeline:{jobId}:{approve|reject}`.

- **`notifyUserCatPawApproval`** now builds a list of requested CatPaws with name + reason/prompt preview, calls `createNotification({type: 'catflow_pipeline', severity: 'warning', link: '/settings/catbot/knowledge?tab=pipelines&job={id}'})`, and (on telegram) sends inline keyboard with `[Crear CatPaws | Cancelar]` whose callback_data is `pipeline:{jobId}:{create_catpaws|reject}`.

- **`notifyProgress`** now forwards progress messages to Telegram via `sendMessage` when `job.channel === 'telegram'` (web channel still only logs).

The dynamic `import('./telegram-bot')` is deliberate — it avoids pulling the heavy telegram singleton into test contexts that don't stub it (the Plan 02 executor tests still pass without any telegram mock).

### 6. `catbot-tools.ts` — approve_catpaw_creation tool

New TOOLS[] entry with parameters `job_id` (required) + optional `catpaws_to_create[]` override. Permission-gated as always_allowed (the owner check is at the case level, not the gate).

`executeTool` case:
1. Fetches the job.
2. If `context.userId` is set and does not match `job.user_id`, returns `{error: 'Not authorized (job belongs to another user)'}`.
3. Calls `resolveCatPawsForJob(jobId, args.catpaws_to_create)`.
4. Returns `{ok: true, created, next_phase: 'architect_retry', message: 'El pipeline reanudara en el proximo tick del executor.'}` or the thrown error message.

Also added:
- Permission gate whitelist: `name === 'approve_catpaw_creation'` → always allowed.
- `getToolsForLLM` whitelist entry so the tool is exposed in all contexts.
- USER_SCOPED_TOOLS array extended with `'approve_catpaw_creation'` so cross-user calls with explicit `user_id` arg are blocked by the gate.

### 7. `settings.json` — KTREE-02 sync

Added `"approve_catpaw_creation"` to the `tools[]` array and bumped `updated_at` to 2026-04-10T19:40:00Z. The `knowledge-tools-sync.test.ts` bidirectional test still passes (7 total pipeline tools now: queue_intent_job, list_my_jobs, cancel_job, approve_pipeline, execute_approved_pipeline, post_execution_decision, approve_catpaw_creation).

### 8. Test coverage

**`telegram-callback.test.ts` (new, 7 tests):**
- routes `pipeline:<job>:approve` → `/api/intent-jobs/<job>/approve`
- routes `pipeline:<job>:reject` → `/api/intent-jobs/<job>/reject`
- routes `pipeline:<job>:create_catpaws` → `/api/intent-jobs/<job>/approve-catpaws`
- ignores non-pipeline callback data (no fetch fired)
- does not crash on undefined data
- calls answerCallbackQuery BEFORE fetch (verified via mock invocationCallOrder)
- sends an error message to the chat when fetch fails

**`approve.test.ts` (new, 7 tests):**
- approve 200 with phase transition + canvas execute fetch
- approve 400 on wrong phase
- approve 404 on not found
- reject 200 with phase transition to cancelled
- reject 404 on not found
- approve-catpaws 200 + INSERT INTO cat_paws + flip to architect_retry
- approve-catpaws 400 on wrong phase

**`intent-jobs.test.ts` (extended, 3 new tests):**
- approve_catpaw_creation tool happy path (job flipped, cat_paws_resolved, created array)
- approve_catpaw_creation error on wrong phase
- approve_catpaw_creation cross-user authorization returns "Not authorized"

## Verification

```
$ npx vitest run src/lib/__tests__/telegram-callback.test.ts \
                src/lib/__tests__/intent-jobs.test.ts \
                src/app/api/intent-jobs/__tests__/approve.test.ts \
                src/lib/__tests__/knowledge-tools-sync.test.ts
Test Files  4 passed (4)
     Tests  36 passed (36)
```

Also verified: `src/lib/__tests__/intent-job-executor.test.ts` from Plan 02 still green (the dynamic telegram import does not break the mocked db path).

```
$ npm run build
✓ Compiled successfully
✓ Generating static pages (32/32)
```

Grep sanity checks:

- `grep -c "callback_query\|processCallbackQuery\|sendMessageWithInlineKeyboard\|answerCallbackQuery\|create_catpaws" app/src/lib/services/telegram-bot.ts` → **14** (well above the required 7)
- `grep -c "approve_catpaw_creation" app/src/lib/services/catbot-tools.ts` → **6** (TOOLS entry name + case + gate + whitelist + USER_SCOPED_TOOLS + getToolsForLLM)
- `grep -c "approve_catpaw_creation" app/data/knowledge/settings.json` → **1**
- `grep -c "force-dynamic" app/src/app/api/intent-jobs/\[id\]/*/route.ts` → **3** (one per route)

## Deviations from Plan

None — all four automated tasks completed as written. Minor interpretation choices (not strictly deviations):

- **Singleton name:** Plan suggested adding `export const telegramBot = TelegramBotService.getInstance();` if missing. The existing export is `telegramBotService` (instance of the class, not via getInstance). I reused the existing export rather than adding a duplicate — cleaner, and the executor imports it as `const { telegramBotService } = await import('./telegram-bot')`.
- **Shared helper extraction:** Plan marked it "optional but recommended". I extracted it to `catpaw-approval.ts` so both the API route and the CatBot tool call `resolveCatPawsForJob`, guaranteeing identical DB state for the resume path.
- **Dynamic import of telegram-bot from executor:** Not specified but necessary — prevents the executor tests from pulling the telegram singleton and needing mocks for it. The Plan 02 executor tests still pass untouched.
- **vi.hoisted in approve.test.ts:** vi.mock factories were rejected at top-level for referencing mock functions. Fixed by wrapping the mock state in `vi.hoisted(() => {...})` — standard vitest pattern for this.

## Commits

| Hash    | Task | Message |
|---------|------|---------|
| 4f7f80d | 1    | `test(130-04): add failing telegram-callback + approve endpoint tests (RED)` |
| 346fd81 | 2    | `feat(130-04): telegram callback_query support + executor cross-channel notifications` |
| fce8bde | 3    | `feat(130-04): approve/reject/approve-catpaws API routes + catpaw-approval helper` |
| 582530b | 4    | `feat(130-04): approve_catpaw_creation tool closes needs_cat_paws loop (BLOCKER 1)` |

## Requirements Coverage

- **PIPE-04 (fully):** The loop is closed end-to-end. Architect pauses with `needs_cat_paws[]` → `awaiting_user` + notification → user taps `Crear CatPaws` (Telegram) or calls `approve_catpaw_creation` tool (web) or POSTs to `/api/intent-jobs/[id]/approve-catpaws` (dashboard) → `resolveCatPawsForJob` inserts CatPaws + flips to `architect_retry` → next executor tick (within 30s) picks up the job → `runArchitectRetry` (Plan 02) → `awaiting_approval` → Proposal notification.
- **PIPE-05 (fully):** `createNotification('catflow_pipeline', ...)` delivers to dashboard, `sendMessageWithInlineKeyboard` delivers to Telegram with approve|reject|create_catpaws buttons, `processCallbackQuery` handles taps.
- **PIPE-06 (fully):** `/api/intent-jobs/[id]/approve` transitions phase+status to running and fires `/api/canvas/{canvas_id}/execute` POST fire-and-forget.

## Oracle Verification (CatBot Protocol)

Code-complete. The CatBot oracle check for Phase 130 as a whole — including this plan's resume loop — is scheduled as the phase-level `checkpoint:human-verify` after Plan 05. Task 5 of this plan is a manual smoke test that exercises the full cross-channel flow (see Checkpoint State below).

## Checkpoint State (Task 5 — human-verify)

Automated work complete. Task 5 requires a running Docker container and a real Telegram bot to exercise:

1. Dashboard notification appears after pipeline runs to `awaiting_approval`.
2. Telegram inline keyboard appears with `[Ejecutar | Cancelar]` buttons.
3. Tap `Ejecutar` → canvas run kicks off, bot replies "✅ Pipeline aprobado. Ejecutando..."
4. CatPaw pause path: architect with unknown tools → `awaiting_user` notification → tap `Crear CatPaws` or call `approve_catpaw_creation` via CatBot → job flips to `architect_retry` → next tick completes architect → `awaiting_approval` reached.

Paste evidence (logs + screenshots) below this line after running the smoke test:

```
[EVIDENCE PENDING — manual smoke in Task 5]
```

## Self-Check: PASSED

- `app/src/lib/services/notifications.ts` — FOUND (NotificationType extended)
- `app/src/lib/services/telegram-bot.ts` — FOUND (TelegramCallbackQuery + processCallbackQuery + sendMessageWithInlineKeyboard + answerCallbackQuery)
- `app/src/lib/services/intent-job-executor.ts` — FOUND (sendProposal + notifyUserCatPawApproval + notifyProgress cross-channel)
- `app/src/lib/services/catbot-tools.ts` — FOUND (approve_catpaw_creation tool + case + gate + USER_SCOPED)
- `app/src/lib/services/catpaw-approval.ts` — FOUND (resolveCatPawsForJob helper)
- `app/src/app/api/intent-jobs/[id]/approve/route.ts` — FOUND (force-dynamic)
- `app/src/app/api/intent-jobs/[id]/reject/route.ts` — FOUND (force-dynamic)
- `app/src/app/api/intent-jobs/[id]/approve-catpaws/route.ts` — FOUND (force-dynamic)
- `app/data/knowledge/settings.json` — FOUND (approve_catpaw_creation + updated_at bumped)
- `app/src/lib/__tests__/telegram-callback.test.ts` — FOUND (7 tests)
- `app/src/app/api/intent-jobs/__tests__/approve.test.ts` — FOUND (7 tests)
- `app/src/lib/__tests__/intent-jobs.test.ts` — FOUND (extended with 3 new tests)
- Commit 4f7f80d — FOUND (Task 1 RED)
- Commit 346fd81 — FOUND (Task 2 GREEN telegram + executor)
- Commit fce8bde — FOUND (Task 3 + route for approve-catpaws + shared helper)
- Commit 582530b — FOUND (Task 4 tool + settings + tests)
