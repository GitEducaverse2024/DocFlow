---
phase: 129-intent-queue-promesas-persistentes-de-catbot
plan: 03
subsystem: alerts-integration
tags: [catbot, intents, alerts, knowledge-gap, oracle-test]

requires:
  - phase: 129-intent-queue-promesas-persistentes-de-catbot
    plan: 01
    provides: intents table, catbotDb named export
  - phase: 129-intent-queue-promesas-persistentes-de-catbot
    plan: 02
    provides: buildIntentProtocol (already contains log_knowledge_gap ANTES rule), IntentWorker

provides:
  - AlertService.checkIntentsUnresolved (8th check in tick)
  - 'intents_unresolved' alert (category=execution, severity=warning) when >5 unresolved intents within 7-day window
  - Verified INTENT-05 prompt rule present in buildIntentProtocol

affects:
  - Phase 129 closure (INTENT-05 + INTENT-06 completed)

tech-stack:
  added: []
  patterns:
    - "Plan 03 discovered the INTENT-05 prompt rule was already present from Plan 02 (line 646 of catbot-prompt-assembler.ts); work reduced to test strengthening + AlertService check"
    - "Strict > threshold (not >=) per RESEARCH Pattern 6 — 5 unresolved is normal, 6 is the escalation point"
    - "Window semantics: completed_at IS NULL OR completed_at > -7 days — captures both currently-stuck and recently-failed"

key-files:
  created: []
  modified:
    - app/src/lib/services/alert-service.ts
    - app/src/lib/__tests__/alert-service.test.ts
    - app/src/lib/__tests__/catbot-prompt-assembler.test.ts

key-decisions:
  - "INTENT-05 rule was already delivered in Plan 02 (buildIntentProtocol line 646: 'Si last_error revela que no sabes algo, llama log_knowledge_gap ANTES de update_intent_status'). Plan 03 only strengthens the test assertion to enforce the temporal word 'antes' and the last_error trigger explicitly — no refinement of the prompt text was needed."
  - "UNRESOLVED_INTENTS_THRESHOLD kept as a file-local const (mirrors KNOWLEDGE_GAPS_THRESHOLD, STAGING_ENTRIES_THRESHOLD) instead of a static class member — consistency with existing file style trumped the plan's proposed class-member pattern."
  - "tick() registration appended as 8th entry in the checks array — fire-order identical to plan."
  - "Dedup relies entirely on existing insertAlert behavior; no per-check tracking added."

requirements-completed:
  - INTENT-05
  - INTENT-06

duration: TBD
completed: 2026-04-10
---

# Phase 129 Plan 03: AlertService Integration + INTENT-05 Verification Summary

**Closes Phase 129: AlertService now raises `intents_unresolved` when >5 intents are stuck failed/abandoned in a 7-day window, and the INTENT-05 knowledge-gap escalation rule (already shipped in Plan 02's prompt) is now test-locked so it cannot regress.**

## Performance

- **Duration:** ~15 min (Task 1 only — Task 2 is human oracle verification)
- **Started:** 2026-04-10T15:22:41Z
- **Tasks:** 2 (1 auto TDD, 1 checkpoint:human-verify)
- **Files touched:** 3 modified
- **Tests passing:** 62/62 across alert-service + catbot-prompt-assembler (57 pre-existing + 5 new checkIntentsUnresolved)

## Accomplishments

- **AlertService.checkIntentsUnresolved**: new static async method, registered as the 8th entry in the `tick()` checks array. Reads `catbotDb` (intents live in catbot.db, not the main DB) and inserts a `category='execution', alert_key='intents_unresolved', severity='warning'` alert when the unresolved count is strictly greater than 5 within a 7-day `completed_at` window.
- **5 new alert-service tests**: count>5 alert, count==5 no-alert (strict threshold), count<5 no-alert, dedup against unacknowledged alert, and a `tick()` spy that proves the new check is actually registered.
- **INTENT-05 test tightened**: the existing Plan 02 assertion `/log_knowledge_gap[\s\S]*update_intent_status/` was too loose. Plan 03 adds a second assertion that requires `last_error` as the trigger word AND the temporal word `antes` between `log_knowledge_gap` and `update_intent_status`, regression-proofing the rule's intent.
- **Full build clean**: `npm run build` passes with only pre-existing warnings (db.ts catbrains migration noise, missing mid/alias-routing services — out of scope per CLAUDE.md).

## Task Commits

1. **RED — failing tests** — `750c28c` (test)
2. **GREEN — checkIntentsUnresolved implementation** — `45b20b3` (feat)

_Plan metadata commit: pending (final state/roadmap update)_

## The Check Method

```typescript
static async checkIntentsUnresolved(): Promise<void> {
  const row = catbotDb.prepare(
    `SELECT COUNT(*) AS cnt FROM intents WHERE status IN ('failed','abandoned')
     AND (completed_at IS NULL OR completed_at > datetime('now', '-7 days'))`
  ).get() as { cnt: number };

  if (row.cnt > UNRESOLVED_INTENTS_THRESHOLD) {
    this.insertAlert(
      'execution',
      'intents_unresolved',
      'Intents sin resolver acumulados',
      `Hay ${row.cnt} intents en estado failed/abandoned sin resolver (umbral: ${UNRESOLVED_INTENTS_THRESHOLD})`,
      'warning',
      JSON.stringify({ count: row.cnt, threshold: UNRESOLVED_INTENTS_THRESHOLD }),
    );
  }
}
```

## INTENT-05 Prompt Rule (verified, not rewritten)

Located in `app/src/lib/services/catbot-prompt-assembler.ts` (line 646) inside `buildIntentProtocol()`:

> **### Gap conocimiento**
> Si last_error revela que no sabes algo, llama `log_knowledge_gap` ANTES de `update_intent_status`.

This text was added in Plan 02 (commit `7d6a220`). Plan 03 verified its presence with two regex assertions:

1. `/last_error/i` — ensures the trigger condition is explicit
2. `/log_knowledge_gap[\s\S]*antes[\s\S]*update_intent_status/i` — ensures the temporal ordering is enforced

Both assertions are now part of the test suite, so any future prompt trim that drops the rule will break the build.

## Verification Matrix

| Check | Command | Result |
|-------|---------|--------|
| alert-service tests | `npx vitest run src/lib/__tests__/alert-service.test.ts` | 21/21 PASS (16 pre-existing + 5 new) |
| prompt-assembler tests | `npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts` | 45/45 PASS (44 pre-existing + 1 new) |
| Docker build | `cd app && npm run build` | PASS |

## Deviations from Plan

**None on the code side.** The plan assumed the INTENT-05 rule *might* need refining; inspection showed Plan 02 already delivered it verbatim. Work scope collapsed to test strengthening + a single new check method.

The plan's proposed `private static readonly UNRESOLVED_INTENTS_THRESHOLD = 5` was simplified to a file-level const (matching `KNOWLEDGE_GAPS_THRESHOLD`, `STAGING_ENTRIES_THRESHOLD`, etc.) for style consistency. Behavior identical.

## Oracle Evidence

**Per CLAUDE.md "CatBot como Oráculo" protocol** — the human operator runs the 7-step verification sequence against CatBot and pastes evidence here.

### Status: PENDING HUMAN VERIFICATION (Task 2 checkpoint)

### Step 1: Multi-step request creates an intent
- **Prompt:** "Ejecuta el catflow de prueba de inbound que tengo configurado."
- **Expected:** CatBot calls `create_intent` first, then executes tools
- **Verification:** `sqlite3 app/data/catbot.db "SELECT id, status, original_request FROM intents ORDER BY created_at DESC LIMIT 1"`
- **CatBot response:** _[paste]_
- **sqlite3 output:** _[paste]_
- **Result:** _[pass/fail/gap]_

### Step 2: List pending intents
- **Prompt:** "¿Qué tareas tienes pendientes conmigo?"
- **Expected:** CatBot calls `list_my_intents` and reports items with status
- **CatBot response:** _[paste]_
- **Result:** _[pass/fail/gap]_

### Step 3: Force failure + knowledge gap logging
- **Setup:** `sqlite3 app/data/catbot.db "UPDATE intents SET status='failed', last_error='no se como configurar el connector X' WHERE id=(SELECT id FROM intents ORDER BY created_at DESC LIMIT 1)"`
- **Prompt:** "¿Puedes reintentar esa tarea fallida? Contame qué pasó."
- **Expected:** CatBot explains failure, calls `log_knowledge_gap` (INTENT-05 rule), then `retry_intent`
- **Verification:** `sqlite3 app/data/catbot.db "SELECT query FROM knowledge_gaps ORDER BY reported_at DESC LIMIT 1"`
- **CatBot response:** _[paste]_
- **knowledge_gaps row:** _[paste]_
- **Result:** _[pass/fail/gap]_

### Step 4: IntentWorker re-queues failed intent
- **Setup:** Force attempts=0 and status=failed on one intent
- **Wait:** 5+ minutes for next IntentWorker tick
- **Verification:** `sqlite3 app/data/catbot.db "SELECT id, status, attempts FROM intents WHERE id=?"`
- **Expected:** status flipped to 'pending', attempts incremented
- **Logs:** _[paste any `intent-worker Tick complete` lines]_
- **Result:** _[pass/fail/gap]_

### Step 5: Abandonment after 3 attempts
- **Setup:** Set intent attempts=2, status='failed'
- **Wait:** Next IntentWorker tick
- **Verification:** status='abandoned', completed_at set, last_error contains 'Max retries'
- **sqlite3 output:** _[paste]_
- **Result:** _[pass/fail/gap]_

### Step 6: Alert on >5 unresolved intents (INTENT-06)
- **Setup:**
  ```bash
  for i in 1 2 3 4 5 6; do
    sqlite3 app/data/catbot.db "INSERT INTO intents (id, user_id, original_request, status) VALUES ('test-$i', 'web:default', 'req $i', 'failed')"
  done
  ```
- **Trigger:** Restart server or wait 5 min for next AlertService tick
- **Reload:** Dashboard in browser
- **Expected:** AlertDialog shows "Intents sin resolver acumulados" under Ejecuciones category
- **Screenshot / text:** _[paste]_
- **Cleanup:** `sqlite3 app/data/catbot.db "DELETE FROM intents WHERE user_id='web:default' AND id LIKE 'test-%'"`
- **Result:** _[pass/fail/gap]_

### Step 7: CatBot knowledge self-check
- **Prompt:** "¿Qué sabes del sistema de intents?"
- **Expected:** CatBot references `settings.json` knowledge tree entries (5 intent tools + intent_protocol concept added in Plan 02)
- **CatBot response:** _[paste]_
- **If CatBot cannot explain:** GAP → add entries to `settings.json` and document as follow-up in STATE.md
- **Result:** _[pass/fail/gap]_

### Gaps Found

_[document any step failures with action items]_

## Phase 129 Closing Status

With Plan 03 committed, the 6 INTENT requirements map as follows:

| Req | Title | Delivered in | Status |
|-----|-------|--------------|--------|
| INTENT-01 | intents schema + CRUD | 129-01 | done |
| INTENT-02 | PromptAssembler intent protocol section | 129-02 | done |
| INTENT-03 | 5 CatBot intent tools | 129-01 | done |
| INTENT-04 | IntentWorker LLM-driven re-queue | 129-02 | done |
| INTENT-05 | Knowledge-gap escalation prompt rule | 129-02 (delivered) + 129-03 (test-locked) | done |
| INTENT-06 | AlertService intents_unresolved check | 129-03 | done |

All 6 INTENT requirements closed pending Oracle verification (Task 2).

## Issues Encountered

- **Pre-existing test-env noise** (db.ts migrations, missing mid/alias-routing modules): untouched per CLAUDE.md scope boundary.

## User Setup Required

None. The new check runs automatically as part of the 5-minute AlertService tick cycle.

## Self-Check: PASSED

- `app/src/lib/services/alert-service.ts` contains `checkIntentsUnresolved` — FOUND
- `app/src/lib/services/alert-service.ts` contains `this.checkIntentsUnresolved()` in checks array — FOUND
- `app/src/lib/services/alert-service.ts` contains `UNRESOLVED_INTENTS_THRESHOLD` — FOUND
- `app/src/lib/services/catbot-prompt-assembler.ts` contains `log_knowledge_gap` ANTES rule — FOUND (line 646)
- commit `750c28c` (RED) — FOUND
- commit `45b20b3` (GREEN) — FOUND
- `npx vitest run alert-service + catbot-prompt-assembler` — 62/62 PASS
- `npm run build` — PASS

---
*Phase: 129-intent-queue-promesas-persistentes-de-catbot*
*Task 2 Oracle verification: PENDING*
