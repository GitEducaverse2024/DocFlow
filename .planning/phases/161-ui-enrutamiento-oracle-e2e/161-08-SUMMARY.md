---
phase: 161-ui-enrutamiento-oracle-e2e
plan: 08
subsystem: api
tags: [catbot, reasoning-tokens, logger, oracle, gap-closure, ver-03, regression-harness]

# Dependency graph
requires:
  - phase: 161-ui-enrutamiento-oracle-e2e (plan 07)
    provides: "Gap A alias-priority inversion at route.ts:121 unblocks reproduction — request actually reaches Opus instead of failing HTTP 400 on gemini-main"
  - phase: 161-ui-enrutamiento-oracle-e2e (plan 03)
    provides: "reasoning_usage logger call-sites at route.ts L240 (streaming onDone) and L524 (non-streaming iteration loop) with `catbot-chat` LogSource literal"
provides:
  - "Live-oracle evidence that VER-03 non-streaming path emits reasoning_usage JSONL end-to-end (reasoning_tokens=154 and 169 captured in production log)"
  - "Tool-loop regression harness: describe('Gap B: reasoning_usage fires in tool-loop regime') — 2 cases locking the iteration-aware contract"
  - "Diagnostic finding (FINDING-5) confirming Plan 161-03 extraction path is correct and that Gap B was a symptom of Gap A"
  - "Identification of secondary Gap B-stream (LOW) — streaming-path reasoning_usage silent in Anthropic/LiteLLM 26k-prompt regime, deferred to v30.1"
affects:
  - "VER-03 flips from Partial to Complete in REQUIREMENTS.md (non-streaming path satisfies the contract; streaming limitation recorded as deferred)"
  - "Milestone v30.0 unblocked at oracle-evidence level — all 21 requirements satisfied modulo the streaming-path deferred item"
  - "Future v30.1 work: stream-utils.ts reasoning_content extraction from non-final SSE chunks"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Diagnose → fix → verify iteration pattern with temporary instrumentation (usage_inspect) that is removed before commit"
    - "Tool-loop regression test pattern: global.fetch returns different responses on consecutive calls via callIdx counter; executeTool mocked to allow loop progression"
    - "Oracle replay-as-evidence pattern per CLAUDE.md CatBot como Oráculo: pre-count/post-count grep of JSONL + verbatim prompt + sample line + reply snippet appended to UAT"

key-files:
  created:
    - ".planning/phases/161-ui-enrutamiento-oracle-e2e/161-08-SUMMARY.md (this file)"
  modified:
    - "app/src/app/api/catbot/chat/route.ts — Task 1 added + Task 3 removed temporary usage_inspect diagnostic; net zero LOC change, Plan 161-03 logger unchanged"
    - "app/src/app/api/catbot/chat/__tests__/route.test.ts — appended describe('Gap B: reasoning_usage fires in tool-loop regime (Plan 161-08)') with 2 cases (+248 lines)"
    - ".planning/phases/161-ui-enrutamiento-oracle-e2e/161-06-UAT.md — appended '## Gap Closure Verification' section with oracle replay evidence + sample JSONL + CatBot reply snippet + streaming-path deferred note"

key-decisions:
  - "No route.ts logic change — FINDING-5 confirmed extraction path at L240/L524 is already correct; all VER-03-visible symptoms caused by Gap A alone; adding code for non-problem would violate scope discipline"
  - "Streaming-path silence recorded as Gap B-stream (LOW) and deferred to v30.1 — stream-utils.ts scope expansion requires documented plan deviation per 161-08 scope-discipline directive; non-streaming satisfies VER-03 hard spec of >=1 evidence line"
  - "Regression test uses bespoke gapBMockLogger + gapBMockExecuteTool with vi.doMock + vi.resetModules pattern inherited from Plan 161-07 Gap A — keeps iteration-aware assertions isolated from pre-existing VER-03/PASS-03/PASS-04 describes"
  - "logger.info for diagnostic (not debug) — DocFlow logger has no debug level (info/warn/error only); accepted noise for one Task 1 run with explicit TEMP marker was preferable to permanently adding a debug level"
  - "Diagnostic removed entirely in Task 3 — Task 2 regression test is the primary canary against shape drift; runtime debug canary would add noise without new signal"

patterns-established:
  - "Gap-closure RCA protocol: diagnose-first via targeted instrumentation → fix per finding (or no-fix if finding is extrinsic) → clean up → oracle replay → UAT evidence append"
  - "Tool-loop regression pattern: consecutive-response fetch mock + stub executeTool → prove iteration-aware logger semantics"

requirements-completed: [VER-03]  # VER-03 non-streaming path satisfied; streaming limitation logged as v30.1 deferred item

# Metrics
duration: ~22 min
completed: 2026-04-22
---

# Phase 161 Plan 08: Gap B — reasoning_usage logger end-to-end Summary

**Closed VER-03 non-streaming path via diagnose-first RCA: FINDING-5 proved the Plan 161-03 logger extraction path is correct, Gap B was a symptom of Gap A, and no route.ts code change was needed — only a regression harness to lock the tool-loop contract and an oracle replay that produced 4 reasoning_usage JSONL lines in today's live log (reasoning_tokens=10, 175, 169, 154; model=claude-opus; alias=catbot). Streaming-path reasoning_usage remains silent in the 26k-prompt regime; documented as Gap B-stream (LOW), deferred to v30.1.**

## Performance

- **Duration:** ~22 min (diagnostic Docker rebuild + 3 oracle replays + Anthropic rate-limit waits dominated wall-clock)
- **Started:** 2026-04-22T13:34:32Z
- **Completed:** 2026-04-22T13:55:00Z approx
- **Tasks:** 3
- **Files modified:** 3 (route.ts net zero LOC, route.test.ts +248, 161-06-UAT.md +69)
- **Commits:** 3 (3b3f061, 5581723, 820c948)

## Task 1 FINDING (verbatim)

**FINDING-5** — log was actually present end-to-end once Gap A closed.

Task 1 inserted temporary `logger.info('catbot-chat', 'usage_inspect', ...)` calls in both streaming onDone (route.ts ~L235) and non-streaming iteration-loop body (~L519), capturing the real production usage shape. Oracle replay at 13:38:18Z captured one non-streaming iteration-0 sample:

```json
{
  "path": "non-streaming",
  "iteration": 0,
  "model": "claude-opus",
  "usage_keys": ["completion_tokens","prompt_tokens","total_tokens","completion_tokens_details","prompt_tokens_details","cache_creation_input_tokens","cache_read_input_tokens","inference_geo"],
  "details_keys": ["reasoning_tokens","text_tokens"],
  "llmdata_keys": ["id","created","model","object","choices","usage"],
  "choice_message_keys": ["content","role","reasoning_content","thinking_blocks","provider_specific_fields"]
}
```

The `completion_tokens_details.reasoning_tokens=175` was present. The existing `const rt = usage?.completion_tokens_details?.reasoning_tokens ?? 0;` extraction fired with rt=175, and `if (rt > 0)` emitted the expected `reasoning_usage` JSONL line at 13:38:18.094Z.

**Implication:** The 161-06-UAT grep=0 result was a snapshot taken while Gap A was live (before 13:31Z). With Gap A routing requests to gemini-main, LiteLLM either returned HTTP 400 (thinking_level collision) or returned a gemini-shape response lacking `completion_tokens_details`. Once 161-07 flipped the priority, Opus is actually invoked, and the Plan 161-03 logger fires every time on the non-streaming path.

**Streaming path** was not captured in Task 1 (Anthropic rate limit 10k tpm hit on the immediate retry). Captured in Task 3 — see Deferred Issues below.

## Code diff summary

### route.ts

Net-zero change in Plan 161-08 scope (Task 1 added diagnostic, Task 3 removed it). The Plan 161-03 logger at L240 (streaming) and L524 (non-streaming) is unchanged:

```typescript
const rt = usage?.completion_tokens_details?.reasoning_tokens ?? 0;
if (rt > 0) {
  logger.info('catbot-chat', 'reasoning_usage', {
    reasoning_tokens: rt,
    model,
    alias: 'catbot',
  });
}
```

Byte-correct per FINDING-5.

### route.test.ts

Appended `describe('Gap B: reasoning_usage fires in tool-loop regime (Plan 161-08)')` with 2 cases (+248 lines). Both use consecutive-response fetch mocks and a stub `executeTool` to drive the non-streaming iteration loop through exactly 2 rounds. Mock pattern inherited from Plan 161-07 Gap A: `vi.doMock + vi.resetModules` inside `beforeEach` with bespoke `gapBMockLogger` for iteration-aware assertion isolation.

Case (A): iter 0 returns tool_calls + empty usage; iter 1 returns content + `completion_tokens_details.reasoning_tokens=50`. Asserts exactly one `reasoning_usage` call with `reasoning_tokens=50, model, alias: 'catbot'`. Verifies `executeTool` called once (sanity) and fetch called twice.

Case (B): both iterations lack reasoning_tokens. Asserts zero `reasoning_usage` emissions (silence invariant preserved in tool-loop regime).

Case (C) skipped: FINDING-5 is not a rename — the canonical field name `completion_tokens_details.reasoning_tokens` is emitted by LiteLLM verbatim. No alternate-shape test needed.

## Test counts

**Gap B suite (new):** 2/2 GREEN
**Full catbot/chat/route.test.ts:** 21/21 GREEN (19 pre-existing + 2 new Gap B; zero regression on Gap A, VER-03 logger, PASS-03/PASS-04, BC, TOOL-03 sudo)
**Full route.test suite (all POST endpoints):** 58/58 GREEN
**npm run build:** GREEN
**Docker rebuild (Task 3):** GREEN

## Docker rebuild + oracle replay output

**Non-streaming (PASSED):**

```bash
$ docker exec docflow-app grep 'reasoning_usage' /app/data/logs/app-2026-04-22.jsonl
{"ts":"2026-04-22T13:27:39.752Z","level":"info","source":"catbot-chat","message":"reasoning_usage","metadata":{"reasoning_tokens":10,"model":"claude-opus","alias":"catbot"}}
{"ts":"2026-04-22T13:38:18.094Z","level":"info","source":"catbot-chat","message":"reasoning_usage","metadata":{"reasoning_tokens":175,"model":"claude-opus","alias":"catbot"}}
{"ts":"2026-04-22T13:45:15.683Z","level":"info","source":"catbot-chat","message":"reasoning_usage","metadata":{"reasoning_tokens":169,"model":"claude-opus","alias":"catbot"}}
{"ts":"2026-04-22T13:47:10.393Z","level":"info","source":"catbot-chat","message":"reasoning_usage","metadata":{"reasoning_tokens":154,"model":"claude-opus","alias":"catbot"}}
```

- 13:27:39 — Plan 161-07 Docker smoke (pre-161-08)
- 13:38:18 — Task 1 diagnostic replay (Plan 161-08)
- 13:45:15 + 13:47:10 — Task 3 post-cleanup oracle replays (Plan 161-08)

All 4 lines shape-identical: `source=catbot-chat`, `message=reasoning_usage`, `metadata.reasoning_tokens > 0`, `metadata.model=claude-opus`, `metadata.alias=catbot`.

**Streaming (PARTIAL):** SSE events delivered correctly (`event: start` → `event: token` deltas → `event: done`), response contains full kinematic reasoning (`t = 4h`, `320 km from A`, `280 km from B`), 578 output tokens. However zero `reasoning_usage` delta. See Deferred Issues.

## Reference to UAT appendix

All oracle replay evidence (verbatim prompt, JSONL grep output, sample line, CatBot reply snippet, delta counts, streaming-partial note) pasted into `.planning/phases/161-ui-enrutamiento-oracle-e2e/161-06-UAT.md` under the new `## Gap Closure Verification` section at end of file.

## Deviations from Plan

### Deferred Issues

**1. [Gap B-stream — LOW severity] Streaming path reasoning_usage silent in Anthropic/LiteLLM 26k-prompt regime**
- **Found during:** Task 3 Step 7 (streaming oracle replay)
- **Observation:** Streaming SSE delivered the full reasoning-quality answer successfully, but the Plan 161-03 logger did not emit `reasoning_usage`. Non-streaming path with identical parameters emits reliably (4 hits today). Inferred cause: stream-utils.ts captures `usage` from `parsed.usage` at L121-123 from any chunk that carries it; Anthropic streaming via LiteLLM in this regime does not appear to populate `completion_tokens_details.reasoning_tokens` on the final `include_usage` chunk. Fix likely requires inspecting non-final SSE chunks for `reasoning_content` blocks directly or computing `reasoning_tokens` from thinking block sizes.
- **Why not fixed in 161-08:** Plan's scope-discipline directive explicitly requires documenting scope expansion to stream-utils.ts. VER-03's must_haves.truths[2] hard spec ("grep -c returning ≥ 1") is satisfied by non-streaming (grep returns 4). Extending scope mid-plan without a fresh RESEARCH pass would violate gap-closure discipline.
- **Routed to:** v30.1 milestone as Gap B-stream LOW. Logged to `deferred-items.md` for orchestrator visibility.
- **Impact:** user-facing feature works in both streaming and non-streaming modes (streaming produces correct reasoning answer); only the evidence pipeline is asymmetric.

### Auto-fixed Issues

None in Plan 161-08 scope. Task 1 diagnostic was explicit scope (planned TEMP). Task 2 test scaffolding required no auto-fixes. Task 3 cleanup was deterministic.

## Issues Encountered

- **Anthropic 10k tpm rate limit** hit multiple times during oracle replays (26k-token prompt forces minute-window waits between runs). Not a DocFlow defect; mitigation was `sleep 60-90` between replays.
- **Plan line 422 parameter-name drift:** Plan text used `useStream:true` in curl examples, but route.ts at L89 destructures `stream: useStream` (reads `body.stream`, not `body.useStream`). First streaming replay fell through to non-streaming path. Corrected with `stream:true`; recorded so future oracle-replay plans use the right parameter. (This is a plan-text quibble, not a code defect.)
- **Logger has no debug method:** Plan Task 1 Step 2 instructed to use `logger.debug` if available. Verified `app/src/lib/logger.ts` exports only `info/warn/error`. Used `logger.info` with TEMP marker; Task 3 removed regardless.

## User Setup Required

None — fully autonomous. Alias catbot state (claude-opus + high + 32k + 16k) persisted from VER-02 UAT session earlier today; Task 1 Step 5a alias-check passed without requiring re-PATCH.

## Next Phase Readiness

- **VER-03 flip to Complete:** Non-streaming path satisfies must_haves.truths[1] (reasoning_usage JSONL with reasoning_tokens>0) and truths[2] (grep-count ≥1 in live Docker log). Streaming limitation recorded as deferred v30.1 Gap B-stream. Orchestrator can flip REQUIREMENTS.md VER-03 from Partial → Complete via `requirements mark-complete VER-03`.
- **Verifier run:** `/gsd:verify-phase 161` expected to pass. All 21 v30.0 requirements now Complete (18 previously + VER-03 flipped).
- **Milestone v30.0 close:** Pending audit + ship.
- **Gap C (list_llm_models available=false on shortcuts):** Still deferred to v30.1 per CONTEXT.md.
- **Gap B-stream (new):** Deferred to v30.1 alongside Gap C.

## Self-Check: PASSED

**Files verified present:**
- FOUND: `app/src/app/api/catbot/chat/route.ts` (grep 'usage_inspect' returns 0 — diagnostic removed)
- FOUND: `app/src/app/api/catbot/chat/__tests__/route.test.ts` (grep 'Gap B: reasoning_usage' returns match)
- FOUND: `.planning/phases/161-ui-enrutamiento-oracle-e2e/161-06-UAT.md` (grep '## Gap Closure Verification' returns 1)
- FOUND: `.planning/phases/161-ui-enrutamiento-oracle-e2e/161-08-SUMMARY.md` (this file)

**Commits verified:**
- FOUND: `3b3f061` (Task 1 diagnostic)
- FOUND: `5581723` (Task 2 regression tests)
- FOUND: `820c948` (Task 3 cleanup + UAT evidence)

**Tests verified:**
- 2/2 Gap B cases GREEN
- 21/21 catbot/chat/route.test.ts suite GREEN
- 58/58 full route.test suite GREEN
- npm run build GREEN
- Docker rebuild + restart GREEN (HTTP 200 on /api/aliases)

**Oracle evidence verified:**
- `docker exec docflow-app grep -c 'reasoning_usage' /app/data/logs/app-2026-04-22.jsonl` → 4 (pre-plan 1 or 2, delta from Plan 161-08 Task 1+3 replays = +3 non-streaming hits)
- Sample JSONL line shape-matches Plan 161-03 contract
- CatBot reply demonstrates correct kinematic derivation (t=4h, 320 km from A, 280 km from B, sum=600 km verified)

---
*Phase: 161-ui-enrutamiento-oracle-e2e*
*Completed: 2026-04-22*
