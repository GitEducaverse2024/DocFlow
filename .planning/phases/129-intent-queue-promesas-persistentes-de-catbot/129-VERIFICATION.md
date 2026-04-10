---
phase: 129-intent-queue-promesas-persistentes-de-catbot
verified: 2026-04-10T15:35:00Z
status: human_needed
score: 6/7 must-haves verified
re_verification: false
human_verification:
  - test: "CatBot-as-oracle 7-step end-to-end smoke test (Task 2 of Plan 03)"
    expected: |
      1. Multi-step request triggers create_intent and DB row appears
      2. list_my_intents returns correct open items
      3. Knowledge-shaped failure triggers log_knowledge_gap before retry_intent
      4. IntentWorker re-queues failed intent on next 5min tick
      5. IntentWorker abandons intent after 3 attempts
      6. AlertDialog shows 'intents_unresolved' when >5 unresolved in 7-day window
      7. CatBot can explain the intent system via query_knowledge
    why_human: "Oracle test requires a running DocFlow instance, live CatBot interaction, manual DB seeding, and dashboard inspection — none are verifiable by static code analysis"
---

# Phase 129: Intent Queue — Promesas Persistentes de CatBot — Verification Report

**Phase Goal:** CatBot persiste cada peticion del usuario como un intent first-class, la divide en steps si es compleja, reintenta automaticamente si falla, y el usuario puede consultar en cualquier momento el estado de sus peticiones.

**Verified:** 2026-04-10T15:35:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `catbot.db` contiene tabla `intents` con 14 campos + 2 indexes y puede aceptar INSERT/UPDATE/SELECT | VERIFIED | `catbot-db.ts` line 113: `CREATE TABLE IF NOT EXISTS intents` with 14 columns; indexes at lines 130-131 (`idx_intents_status`, `idx_intents_user_status`) |
| 2 | CatBot puede llamar a `create_intent` desde el LLM y obtener un `intent_id` | VERIFIED | `catbot-tools.ts` lines 914+3036: TOOLS[] entry + executeTool case; reads `context.userId` (not args); returns `{ created: true, intent_id }` |
| 3 | `list_my_intents` filtra por `context.userId` y nunca devuelve intents de otros usuarios | VERIFIED | `catbot-tools.ts` line 3060: `context?.userId \|\| 'web:default'` — args cannot override; cross-user isolation test in `catbot-intents.test.ts` (19/19 pass) |
| 4 | `retry_intent` respeta tope 3 attempts; `abandon_intent` cierra intent con `completed_at` | VERIFIED | `catbot-tools.ts` lines 3076-3092: pre-check `attempts >= 3` returns error; `abandon_intent` delegates to `abandonIntent()` which sets `completed_at` |
| 5 | IntentWorker reencola `failed` intents (attempts < MAX_ATTEMPTS=3) y abandona al superar el tope | VERIFIED | `intent-worker.ts` lines 54-92: `tick()` calls `getRetryableIntents`, applies `attempts + 1 >= MAX_ATTEMPTS` gate; 10/10 state machine tests pass |
| 6 | PromptAssembler inyecta P1 (Protocolo de Intents, <800 chars, 5 tools, regla INTENT-05) y P2 (Intents abiertos) | VERIFIED | `catbot-prompt-assembler.ts` lines 629-668: `buildIntentProtocol()` (797 chars, all 5 tools named, `log_knowledge_gap ANTES de update_intent_status` at line 646) + `buildOpenIntentsContext()` user-scoped; 45/45 tests pass |
| 7 | AlertService genera alerta `intents_unresolved` cuando >5 intents en estado failed/abandoned en ventana de 7 dias; CatBot oracle demuestra ciclo completo | PENDING HUMAN | `alert-service.ts` lines 232-247 verified in code; 21/21 alert tests pass. Oracle smoke test (Task 2, Plan 03) not yet run against live instance. |

**Score:** 6/7 truths verified automatically. 1 pending human oracle verification.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/src/lib/catbot-db.ts` | 14-column intents schema + 7 CRUD helpers + IntentRow interface + named catbotDb export | VERIFIED | Lines 113-131 (schema + indexes), 218 (IntentRow), 598-704 (7 CRUD helpers), 782 (named export) |
| `app/src/lib/services/catbot-tools.ts` | 5 tools in TOOLS[] + 5 executeTool cases + permission gate | VERIFIED | TOOLS[] entries at lines 914/940/958/972/984; cases at lines 3036/3049/3059/3076/3084; gate at lines 1093-1095 |
| `app/data/knowledge/settings.json` | 5 tool names in tools[] array + intent_protocol concept | VERIFIED | Lines 40-44 (5 tool names); line 68 (intent_protocol concept) |
| `app/src/lib/__tests__/catbot-intents.test.ts` | Unit tests: CRUD + tool execution + user isolation | VERIFIED | 337 lines, 19 tests, all passing |
| `app/src/lib/services/intent-worker.ts` | Class IntentWorker with start/stop/tick; BOOT_DELAY=45s; CHECK_INTERVAL=5min; MAX_ATTEMPTS=3; no executeTool | VERIFIED | 105 lines; constants at lines 21-23; class at line 29; grep for `executeTool` returns 0 matches |
| `app/src/lib/__tests__/intent-worker.test.ts` | State machine tests (re-queue, abandon, skip, error isolation, source-grep) | VERIFIED | 179 lines, 10 tests, all passing |
| `app/src/instrumentation.ts` | IntentWorker.start() registered after AlertService | VERIFIED | Lines 39-44: dynamic import + `IntentWorker.start()` inside try/catch |
| `app/src/lib/services/catbot-prompt-assembler.ts` | buildIntentProtocol() + buildOpenIntentsContext() registered in build() | VERIFIED | Lines 629/654 (functions); 744/749 (registered in build() with try/catch); 797-char P1 budget confirmed |
| `app/src/lib/services/alert-service.ts` | checkIntentsUnresolved static method + 8th entry in checks array | VERIFIED | Lines 18 (threshold const), 86 (checks array entry), 232-247 (method body with correct SQL and threshold) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `catbot-tools.ts` | `catbot-db.ts` | `import { createIntent, updateIntentStatus, getIntent, listIntentsByUser, abandonIntent, type IntentRow }` | WIRED | Line 10: confirmed import |
| `catbot-tools.ts` | `context.userId` | executeTool cases use `context?.userId` for create_intent and list_my_intents | WIRED | Lines 3037 + 3060 |
| `settings.json tools[]` | `catbot-tools.ts` TOOLS[] | All 5 tool names present | WIRED | Lines 40-44 of settings.json match TOOLS[] at lines 914-984 |
| `instrumentation.ts` | `intent-worker.ts` | Dynamic import + `IntentWorker.start()` | WIRED | Lines 39-44 of instrumentation.ts |
| `intent-worker.ts` | `catbot-db.ts` | `import { getRetryableIntents, updateIntentStatus, abandonIntent }` | WIRED | Lines 11-14 of intent-worker.ts |
| `catbot-prompt-assembler.ts` | `catbot-db.ts` | `import { listIntentsByUser }` for buildOpenIntentsContext | WIRED | Line 12 import; lines 655-656 usage |
| `buildIntentProtocol` + `buildOpenIntentsContext` | `build()` | Both registered as sections (P1 priority=1, P2 priority=2) with try/catch | WIRED | Lines 744 + 749-752 of prompt-assembler.ts |
| `alert-service.ts` | `intents table` | SELECT COUNT(*) FROM intents WHERE status IN ('failed','abandoned') AND completed_at window | WIRED | Lines 232-235; `catbotDb` imported; `checkIntentsUnresolved` registered at line 86 |
| `buildIntentProtocol text` | `log_knowledge_gap` escalation | Prompt instruction at line 646: "Si last_error revela que no sabes algo, llama log_knowledge_gap ANTES de update_intent_status" | WIRED | Text verified; two regex tests in catbot-prompt-assembler.test.ts lock it against regression |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INTENT-01 | 129-01 | Tabla intents en catbot.db con 14 campos + CRUD en catbot-db.ts | SATISFIED | `catbot-db.ts` line 113: schema; lines 598-704: 7 CRUD helpers; `IntentRow` interface at line 218 |
| INTENT-02 | 129-02 | PromptAssembler inyecta seccion "Protocolo de Intents" | SATISFIED | `catbot-prompt-assembler.ts` line 629: `buildIntentProtocol()` (797 chars); registered in `build()` line 744; 45/45 tests green |
| INTENT-03 | 129-01 | 5 tools registradas en CatBot + knowledge tree | SATISFIED | `catbot-tools.ts` TOOLS[] at lines 914-996; `settings.json` tools[] lines 40-44; KTREE-02 test 4/4 green |
| INTENT-04 | 129-02 | IntentWorker singleton corre cada 5min, reintenta hasta 3 veces | SATISFIED | `intent-worker.ts`: MAX_ATTEMPTS=3, CHECK_INTERVAL=5min, BOOT_DELAY=45s; registered in `instrumentation.ts`; 10/10 tests green |
| INTENT-05 | 129-02 (delivered) + 129-03 (test-locked) | Escalacion a log_knowledge_gap cuando last_error sugiere knowledge gap | SATISFIED | `catbot-prompt-assembler.ts` line 646 text; two test assertions in `catbot-prompt-assembler.test.ts` lock the rule |
| INTENT-06 | 129-03 | AlertService detecta >5 intents sin resolver, genera alerta 'intents_unresolved' | SATISFIED (code) / PENDING HUMAN (dashboard) | `alert-service.ts` lines 232-247; threshold=5 strict >; 7-day window; dedup via insertAlert; 21/21 tests green. Dashboard rendering not verified without live instance. |

All 6 INTENT requirement IDs from plan frontmatter are accounted for. No orphaned requirements found in REQUIREMENTS.md for Phase 129.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No anti-patterns found |

- No TODO/FIXME/placeholder comments in any phase 129 file
- No stub implementations (empty handlers or static returns)
- No tombstone comments
- No unused imports (npm run build passes per summaries; LogSource union extended for 'intent-worker')
- `intent-worker.ts`: confirmed zero references to `executeTool` (LLM-driven retry invariant holds)

---

### Human Verification Required

#### 1. CatBot-as-oracle End-to-End Smoke Test (Plan 03 Task 2 — blocking checkpoint)

**Test:** Run the 7-step oracle sequence against a live DocFlow instance via Telegram or web chat. Steps:

1. Send "Ejecuta el catflow de prueba de inbound que tengo configurado." — verify `create_intent` call + DB row
2. Send "¿Que tareas tienes pendientes conmigo?" — verify `list_my_intents` response
3. Manually set a DB intent to `status='failed', last_error='no se como configurar el connector X'`, then send "¿Puedes reintentar esa tarea fallida? Contame que paso." — verify `log_knowledge_gap` then `retry_intent` called
4. Set intent to `attempts=0, status='failed'`, wait 5+ min (or trigger tick) — verify status flips to `pending`, attempts=1
5. Set intent to `attempts=2, status='failed'`, wait next tick — verify status='abandoned', completed_at set, last_error contains 'Max retries'
6. Seed 6 failed intents, trigger AlertService tick, reload dashboard — verify "Intents sin resolver acumulados" alert appears under Ejecuciones
7. Send "¿Que sabes del sistema de intents?" — verify CatBot can explain via knowledge tree

**Expected:** All 7 steps pass with CatBot responses and sqlite3 outputs as documented in `129-03-SUMMARY.md` Oracle Evidence section (currently shows `_[paste]_` placeholders — needs real evidence).

**Why human:** Requires a running Next.js instance, live LLM inference via CatBot, manual DB seeding with `sqlite3`, waiting for background worker ticks (5 min intervals), and visual inspection of the AlertDialog dashboard component. These cannot be verified by static code analysis.

---

### Gaps Summary

No code gaps found. All 6 INTENT requirements are implemented correctly in the codebase:

- intents table: 14 columns, 2 indexes, 7 CRUD helpers — substantive and wired
- 5 CatBot tools: registered in TOOLS[], executeTool cases, permission gate, knowledge tree — all wired
- IntentWorker: LLM-driven retry semantics confirmed, no executeTool reference, registered in instrumentation.ts — wired
- PromptAssembler: both sections implemented, <800 char budget respected (797 chars), INTENT-05 rule present and test-locked — wired
- AlertService: checkIntentsUnresolved method implemented, registered as 8th check, correct SQL + threshold + window — wired

The single pending item is the CatBot-as-oracle human checkpoint required by CLAUDE.md's "CatBot como Oraculo" protocol. This is a process gate, not a code gap. Once the operator runs the 7-step oracle sequence and pastes evidence into `129-03-SUMMARY.md`, phase 129 can be fully closed.

**Test suite totals confirmed passing:**
- `catbot-intents.test.ts`: 19/19
- `intent-worker.test.ts`: 10/10
- `knowledge-tools-sync.test.ts`: 4/4
- `alert-service.test.ts`: 21/21 (16 pre-existing + 5 new)
- `catbot-prompt-assembler.test.ts`: 45/45 (44 pre-existing + 1 new)
- **Total: 99/99 tests green across all phase 129 test files**

---

_Verified: 2026-04-10T15:35:00Z_
_Verifier: Claude (gsd-verifier)_
