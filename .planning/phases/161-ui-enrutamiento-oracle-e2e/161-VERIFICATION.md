---
phase: 161-ui-enrutamiento-oracle-e2e
verified: 2026-04-22T16:30:00Z
status: passed
score: 7/7 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 6/7
  gaps_closed:
    - "VER-03: Oracle 3 — next CatBot request after set_catbot_llm to Opus+high emits reasoning_usage JSONL entry with reasoning_tokens > 0. Non-streaming path now fires reliably (4 lines captured in live log: reasoning_tokens=10/175/169/154, model=claude-opus, alias=catbot). Closed by Plan 161-07 (Gap A priority inversion at route.ts:127) + Plan 161-08 (FINDING-5 diagnosis confirming Gap B was a symptom of Gap A, regression harness added)."
  gaps_remaining: []
  regressions: []
human_verification: []
---

# Phase 161: UI Enrutamiento + Oracle End-to-End — Verification Report

**Phase Goal:** Cerrar v30.0 con parity manual+programático y verificación E2E contra el stack real. Tab Enrutamiento del Centro de Modelos gana tres controles condicionales por capability: dropdown "Inteligencia" (off|low|medium|high) visible solo si `supports_reasoning=true`; input numérico `max_tokens` con placeholder=`max_tokens_cap`; input numérico `thinking_budget` opcional. Oracle CatBot 3/3 end-to-end contra LiteLLM real: (a) enumerar modelos con capabilities; (b) cambiar a Opus+thinking máximo via sudo; (c) siguiente request incluye `reasoning_content` no-null + `reasoning_tokens > 0`. Unit test: `resolveAliasConfig('catbot')` devuelve valores seteados post-PATCH.

**Verified:** 2026-04-22T16:30:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (Plans 161-07 + 161-08)

---

## Gap Closure Summary

Two gap-closure plans were executed after the initial `gaps_found` verdict:

**Plan 161-07 — Gap A (route.ts:121 priority inversion)**

Commits: 4cb9326 / 7a7a87a / fe56aaa

The original model resolution chain `requestedModel || catbotConfig.model || cfg.model` let the legacy `catbot_config.model='gemini-main'` row shadow the v30.0 alias set via `set_catbot_llm`. After inversion the chain reads `requestedModel || cfg.model || catbotConfig.model` (line 127 with explanatory comment at lines 121-126), giving alias config the correct priority. 4 regression tests confirmed GREEN. Docker smoke: request now correctly routes to `anthropic/claude-opus-4-6`.

**Plan 161-08 — Gap B diagnosis and regression harness**

Commits: 3b3f061 / 5581723 / 820c948 / ac100e7

FINDING-5: Gap B was not an independent defect. When Gap A was active, HTTP 400 from the Gemini 3 `thinking_level` collision aborted the flow before the Plan 161-03 logger could run. With Gap A closed, the existing logger code at `route.ts:240` (streaming) and `route.ts:524` (non-streaming) fired correctly — no route.ts code change was needed. Plan 161-08 contributed: (1) temporary `usage_inspect` diagnostic (added Task 1, removed Task 3 — 0 occurrences remain); (2) 2 regression tests in `route.test.ts` under `describe('Gap B: reasoning_usage fires in tool-loop regime (Plan 161-08)')` locking multi-iteration tool-loop contract; (3) identification of Gap B-stream as a separate LOW-severity deferred item (streaming path `reasoning_usage` silent in 26k-prompt regime, deferred to v30.1 — non-streaming satisfies VER-03 hard spec).

Live oracle evidence from Gap Closure replay (161-06-UAT.md "## Gap Closure Verification" section): 4 `reasoning_usage` JSONL lines in `/app/data/logs/app-2026-04-22.jsonl` with `reasoning_tokens=10/175/169/154`, `model=claude-opus`, `alias=catbot`. CatBot reply demonstrates reasoning (kinematic derivation: `V_relativa = 80+70 = 150 km/h`, `t = 600/150 = 4h`, `320 km from A`).

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Tab Enrutamiento renders expand-row with 3 conditional controls gated by capabilities | VERIFIED | `tab-enrutamiento.tsx` contains expand chevron (line 537), `reasoningSupported` gate (line 576), Inteligencia Select (line 611), max_tokens Input, thinking_budget Input — all conditional on `capabilities.supports_reasoning`. Gap-closure edits (161-07/08) did not touch this file — no regression. |
| 2 | LiteLLM shortcut rows seeded in model_intelligence with correct capabilities | VERIFIED | `db.ts` lines 4954-4972: INSERT OR IGNORE + UPDATE for claude-opus/claude-sonnet/gemini-main/gemma-local. UAT VER-01 live: capabilities non-null for all 4 shortcuts in production. |
| 3 | GET /api/aliases returns enriched shape with capabilities JOIN | VERIFIED | `app/src/app/api/aliases/route.ts` line 42: LEFT JOIN model_intelligence; capabilities object at line 54. Not modified by gap-closure plans. |
| 4 | Oracle VER-01 pass: CatBot enumerates models with non-null capabilities for 4 shortcuts | VERIFIED | UAT 161-06-UAT.md transcript: `list_llm_models()` returned 21 entries; 4 shortcut rows with supports_reasoning + max_tokens_cap non-null. Not affected by gap-closure plans. |
| 5 | Oracle VER-02 pass: CatBot changes to Opus+high via sudo, DB persists | VERIFIED | UAT 161-06-UAT.md transcript: conservative read-before-write, `set_catbot_llm({model:"claude-opus", reasoning_effort:"high", max_tokens:32000, thinking_budget:16000})` confirmed; read-back shows all 4 fields persisted. Not affected by gap-closure plans. |
| 6 | VER-04 unit test: resolveAliasConfig('catbot') roundtrip post-updateAlias + PATCH | VERIFIED | `alias-routing-v30-integration.test.ts` (304 lines, 3 test cases): direct service roundtrip, HTTP PATCH roundtrip, null reset semantics. Not modified by gap-closure plans. |
| 7 | Oracle VER-03 pass: next CatBot message emits reasoning_usage JSONL entry (reasoning_tokens > 0) | VERIFIED | 161-06-UAT.md "Gap Closure Verification": non-streaming replays at 13:45:15 (`reasoning_tokens=169`) and 13:47:10 (`reasoning_tokens=154`); total count via `grep -c` = 4 (up from 0 pre-closure). Sample JSONL: `{"source":"catbot-chat","message":"reasoning_usage","metadata":{"reasoning_tokens":154,"model":"claude-opus","alias":"catbot"}}`. Regression harness (route.test.ts Gap B describe, 2 tests) locks the tool-loop contract. |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/src/components/settings/model-center/tab-enrutamiento.tsx` | Expand-row panel with 3 conditional controls | VERIFIED | Not touched by 161-07/08; quick regression check confirms expand chevron at L537, `reasoningSupported` gate at L576, Inteligencia Select at L611, max_tokens Input, thinking_budget Input all present. |
| `app/messages/es.json` | i18n keys for new UI copy (Spanish) | VERIFIED | Keys at line 2673+: inteligencia, inteligenciaOff/Low/Medium/High, thinkingBudgetHelper. Not touched by gap-closure plans. |
| `app/messages/en.json` | i18n keys for new UI copy (English) | VERIFIED | Parallel keys at line 2673+. Not touched by gap-closure plans. |
| `app/src/lib/db.ts` | Seed block for 4 LiteLLM shortcut rows | VERIFIED | Lines 4954-4972 intact. Not touched by gap-closure plans. |
| `app/src/app/api/aliases/route.ts` | Enriched GET with capabilities JOIN | VERIFIED | LEFT JOIN model_intelligence (line 42); capabilities shape (line 54). Not touched by gap-closure plans. |
| `app/src/lib/services/stream-utils.ts` | onDone callback extended with reasoning_tokens | VERIFIED | StreamCallbacks interface extended at line 20 with completion_tokens_details.reasoning_tokens. Not touched by gap-closure plans. |
| `app/src/app/api/catbot/chat/route.ts` | reasoning_usage logger in both streaming + non-streaming paths, with correct model resolution priority | VERIFIED | Line 127: `requestedModel \|\| cfg.model \|\| catbotConfig.model` (alias config wins over legacy row). Logger at lines 240-244 (streaming) and 524-529 (non-streaming) fires end-to-end on non-streaming path. `usage_inspect` diagnostic fully removed (grep count = 0). |
| `app/src/lib/services/__tests__/alias-routing-v30-integration.test.ts` | VER-04 integration test — config roundtrip post-update | VERIFIED | 304 lines; 3 test cases (direct service, HTTP PATCH roundtrip, null reset); all 4 fields validated. Not touched by gap-closure plans. |
| `app/src/app/api/catbot/chat/__tests__/route.test.ts` | Gap B regression harness — tool-loop contract (Plan 161-08) | VERIFIED | `describe('Gap B: reasoning_usage fires in tool-loop regime (Plan 161-08)')` at line 810. 2 tests: (A) tool-loop with reasoning_tokens=50 on iteration 1 asserts exactly 1 reasoning_usage emission; (B) tool-loop with empty usage asserts 0 emissions. Both tests exercising the multi-iteration (MAX_TOOL_ITERATIONS=15) path that was the suspected Gap B cause. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `db.ts` bootstrap shortcut seed | `model_intelligence` table | INSERT OR IGNORE + UPDATE inside Phase 158 try block | WIRED | Lines 4954-4972 confirmed; UAT VER-01 live evidence: capabilities non-null for all 4 shortcuts. |
| `GET /api/aliases` route | model_intelligence JOIN | LEFT JOIN on ma.model_key = mi.model_key | WIRED | route.ts line 42; capabilities shape at line 54. |
| `tab-enrutamiento.tsx` fetch('/api/models') | modelCapsMap | useEffect + Map reduce on models array | WIRED | Lines 171-204; map populated at setModelCapsMap call; consumed by getTargetCapabilities. |
| `tab-enrutamiento.tsx` fetch('/api/aliases') | EnrichedAliasRow with capabilities | useState<EnrichedAliasRow[]> + capabilities.supports_reasoning reads | WIRED | Line 576: `const reasoningSupported = targetCaps?.supports_reasoning === true`. |
| Guardar button onClick | PATCH /api/alias-routing | fetch PATCH with reasoning_effort + max_tokens + thinking_budget | WIRED | Lines 365-384: dirty-state save; body includes reasoning_effort + conditional fields. |
| streamLiteLLM onDone | catbot/chat reasoning_usage logger (non-streaming) | extended StreamCallbacks.onDone with completion_tokens_details | WIRED | Logger at route.ts:524-529; UAT live evidence: 4 JSONL lines with reasoning_tokens > 0. |
| set_catbot_llm tool | model_aliases row (via PATCH) → catbot/chat model resolution | sudo gate + updateAlias + resolveAliasConfig + route.ts:127 priority chain | WIRED | VER-02 UAT confirmed persistence; route.ts:127 now resolves `cfg.model` before `catbotConfig.model`; VER-03 oracle replay used alias-set config and hit claude-opus correctly. |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| UI-01 | 161-01, 161-05 | Tab Enrutamiento shows Inteligencia dropdown gated by supports_reasoning | SATISFIED | tab-enrutamiento.tsx L611; REQUIREMENTS.md marked Complete. |
| UI-02 | 161-05 | max_tokens input with cap placeholder + validation | SATISFIED | tab-enrutamiento.tsx expand panel; REQUIREMENTS.md marked Complete. |
| UI-03 | 161-05 | thinking_budget input conditional on supports_reasoning | SATISFIED | tab-enrutamiento.tsx expand panel; REQUIREMENTS.md marked Complete. |
| VER-01 | 161-01, 161-06 | Oracle 1: CatBot enumerates capabilities via list_llm_models | SATISFIED | UAT 161-06-UAT.md — transcript present; 4 shortcut rows non-null. REQUIREMENTS.md marked Complete. |
| VER-02 | 161-06 | Oracle 2: CatBot changes to Opus+high via sudo | SATISFIED | UAT 161-06-UAT.md — set_catbot_llm transcript + post-state read-back present. REQUIREMENTS.md marked Complete. |
| VER-03 | 161-03, 161-06, 161-07, 161-08 | Oracle 3: next request emits reasoning_usage JSONL entry | SATISFIED | UAT 161-06-UAT.md "Gap Closure Verification": 4 lines with reasoning_tokens > 0 in live log; route.ts:127 priority fix closes Gap A; FINDING-5 closes Gap B. REQUIREMENTS.md marked Complete (row 97 explicitly notes non-streaming path satisfies contract; streaming deferred as Gap B-stream LOW to v30.1). |
| VER-04 | 161-04 | Unit test: resolveAliasConfig roundtrip post-PATCH | SATISFIED | alias-routing-v30-integration.test.ts: 3 test cases confirmed. REQUIREMENTS.md marked Complete. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | Gap-closure plans left no diagnostic logs, placeholders, or empty implementations. `usage_inspect` fully removed (grep count = 0). |

---

### Human Verification Required

None. All must-haves are verifiable from code inspection and the verbatim oracle transcripts in 161-06-UAT.md "Gap Closure Verification" (non-streaming oracle replay, JSONL sample line, CatBot reply snippet with kinematic derivation).

---

### Informational Notes

**Gap B-stream (LOW, deferred to v30.1):** The streaming path `reasoning_usage` logger remains silent in the 26k-prompt regime. This is explicitly NOT a v30.0 blocker — VER-03's hard spec ("grep -c returning >= 1 with reasoning_tokens > 0") is satisfied by the non-streaming path (4 lines captured). The limitation is documented in: REQUIREMENTS.md row 97, 161-06-UAT.md "Gap Closure Verification" section, and 161-08-SUMMARY.md "Deferred Issues". Note: 161-08-SUMMARY.md states it was "Logged to `deferred-items.md`" but `deferred-items.md` does not yet contain this entry — that file only has the pre-existing TypeScript errors and Phase 161-01 FQN regression note from Phase 161-03 and 161-01 execution respectively. This is an administrative gap (missing log entry in one file) with no impact on phase goal achievement.

**Gap C (LOW, deferred to v30.1):** `list_llm_models` reports `available=false` for the 4 shortcut rows due to FQN-vs-shortcut mismatch in `catbot-tools.ts`. Explicitly out-of-scope per initial verification and CONTEXT.md `<deferred>` block.

---

### Gaps Summary

No gaps. All 7 truths verified. VER-03 is now closed via Plans 161-07 (route.ts priority inversion) + 161-08 (regression harness + FINDING-5 RCA). Phase goal achieved.

---

_Verified: 2026-04-22T16:30:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification after: Plans 161-07 + 161-08 gap closure_
