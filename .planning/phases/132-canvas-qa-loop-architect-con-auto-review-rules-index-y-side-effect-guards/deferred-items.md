# Deferred Items — Phase 132

## Known limitations — CLOSED 2026-04-11

Las 3 limitaciones listadas en la verificacion inicial se cerraron en el hotfix
`fix(132): close 3 known limitations`. Ver `132-VERIFICATION.md` seccion
"Anti-Patterns Found" para el mapeo detallado:

1. **ctxResolver injection** — `buildConnectorCtxResolver` cachea el lookup
   `connectors.type` por `data.connectorId` y se pasa a `insertSideEffectGuards`
   desde `finalizeDesign`. Connectors Gmail / SMTP / http_api / mcp_server sin
   `mode`/`action`/`tool_name` explicito ahora reciben guard correctamente.
2. **Notification channel routing first-class** — Columnas `channel` +
   `channel_ref` añadidas a la tabla `notifications` (idempotente via ALTER
   TABLE con try/catch). `CreateNotificationParams` las expone como props
   opcionales. `notifyUserIrreparable` ademas hace push directo a Telegram via
   `telegramBotService.sendMessage` cuando el pipeline originario fue Telegram.
3. **runArchitectRetry wrapped in QA loop** — La ruta de reanudacion tras
   aprobacion de CatPaws ahora llama `runArchitectQALoop` en vez de un unico
   `callLLM(ARCHITECT_PROMPT, ...)`. Mismo gating de calidad que pipelines
   frescos. Test `resume path (architect_retry)` actualizado a 2 LLM calls.

Tests añadidos / actualizados:
- `canvas-auto-repair.test.ts`: `notifyUserIrreparable: first-class channel+channel_ref fields AND Telegram push`
- `intent-job-executor.test.ts`: `buildConnectorCtxResolver: resolves connectorType from DB and caches`
- `intent-job-executor.test.ts`: `resume path (architect_retry)` actualizado

---


## Pre-existing test failures (not caused by Plan 01)

### knowledge-tree.test.ts — 2 failures

**Tests:**
1. `each area JSON has updated_at matching ISO date format`
2. `_index.json areas[].updated_at matches individual JSON updated_at`

**Root cause:** `app/data/knowledge/catboard.json` has `updated_at: "2026-04-10T20:10:00Z"` (full ISO datetime), while the regex in the test enforces `/^\d{4}-\d{2}-\d{2}$/` (date-only). This drift was introduced in an earlier phase and was already failing before Plan 132-01 started.

**Verification:** Confirmed via `git stash && vitest run knowledge-tree.test.ts` on the clean HEAD — 2 failures already present.

**Recommended fix (out of Plan 01 scope):** Normalize catboard.json `updated_at` to `"2026-04-10"` (date-only) and ensure `_index.json` matches. Should be addressed in a dedicated cleanup plan or incorporated into a future phase touching catboard knowledge.

## Pre-existing test failures (not caused by Plan 04)

Full-suite run on 2026-04-10T22:35Z (`cd app && npx vitest run`) reported 9 failures across 3 files — none of them in Phase 132's own test suite. Phase 132 suite (6 files, 98 tests) remains 100% green.

### catbot-holded-tools.test.ts — 2 failures

**Tests:**
1. `executeHoldedTool > should call Holded MCP and return result`
2. `executeHoldedTool > should handle MCP errors gracefully`

**Symptom:** `TypeError: response.text is not a function` — indicates the MCP client API contract changed underneath the mock. Completely unrelated to Phase 132 (rules index / QA loop / side-effect guards).

**Recommended fix (out of Plan 04 scope):** Dedicated Holded MCP adapter audit — check `response.text()` vs `response.text` after the MCP SDK bump.

### task-scheduler.test.ts — 5 failures

**Tests:**
1. `tick() > finds due schedules and triggers execution`
2. `tick() > handles execution errors gracefully and still updates next_run`
3. `updateNextRun() > calculates and stores next valid run`
4. `updateNextRun() > deactivates schedule when no more valid runs exist`
5. `updateNextRun() > does nothing when task has no schedule_config`

**Symptom:** TaskScheduler DB-mock state drift, completely unrelated to canvas pipeline. Likely introduced by an earlier phase touching the `task_schedules` table schema.

**Recommended fix (out of Plan 04 scope):** Refresh task-scheduler DB mocks and verify cron logic — separate fix plan.
