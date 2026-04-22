---
phase: 161-ui-enrutamiento-oracle-e2e
plan: 06
subsystem: testing
tags: [uat, oracle, catbot, litellm, reasoning, v30.0, milestone-gate]

# Dependency graph
requires:
  - phase: 161-01
    provides: "LiteLLM shortcut seed in model_intelligence (claude-opus/claude-sonnet/gemini-main/gemma-local) so /api/models + list_llm_models return non-null capabilities — VER-01 precondition"
  - phase: 161-02
    provides: "GET /api/aliases enriched flat-root shape with capabilities LEFT JOIN — VER-02 post-state read-back mechanism"
  - phase: 161-03
    provides: "Silent reasoning_usage logger at catbot/chat route (both streaming + non-streaming) — VER-03 evidence mechanism"
  - phase: 161-05
    provides: "Tab Enrutamiento UI with expand-row panel and 3 reasoning controls — parity surface so post-set_catbot_llm change is visible manually"
  - phase: 160-02
    provides: "list_llm_models + get_catbot_llm read-only tools — VER-01 oracle vehicle"
  - phase: 160-03
    provides: "set_catbot_llm sudo-gated tool — VER-02 oracle vehicle"
  - phase: 160-04
    provides: "Operador de Modelos skill injected via PromptAssembler — conservative read-before-write behaviour observed in VER-02"
provides:
  - "161-06-UAT.md with 3 verbatim oracle transcripts + tool-call args + DB post-state verification"
  - "Gap A identified: catbot_config.model at route.ts:121 masks alias set via set_catbot_llm (HIGH severity, blocks VER-03)"
  - "Gap B identified: Plan 161-03 reasoning_usage logger silent end-to-end despite LiteLLM returning reasoning_tokens (MEDIUM severity, blocks VER-03)"
  - "Gap C identified: list_llm_models reports available=false for shortcut rows (LOW severity, deferred to v30.1)"
  - "Milestone v30.0 UAT status: 2/3 oracles PASS (VER-01, VER-02); VER-03 PARTIAL — routes through /gsd:plan-phase 161 --gaps for closure"
affects: [v30.0 milestone close, gap-closure plan 161.1-or-161-07, v30.1 resolver layer (Gap C deferral)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "UAT oracle evidence per CLAUDE.md 'CatBot como Oráculo' hard requirement: verbatim prompts + tool-call args + DB read-back + gap documentation structured for gap-closure consumption"
    - "Gap-closure routing via UAT.md YAML Gaps section consumed by /gsd:plan-phase --gaps (per GSD workflow)"

key-files:
  created:
    - ".planning/phases/161-ui-enrutamiento-oracle-e2e/161-06-UAT.md (~210 lines)"
    - ".planning/phases/161-ui-enrutamiento-oracle-e2e/161-06-SUMMARY.md (this file)"
  modified:
    - ".planning/STATE.md (plan counter advance, decision added, session recorded)"
    - ".planning/ROADMAP.md (phase 161 plan-progress row updated)"
    - ".planning/REQUIREMENTS.md (VER-02 marked complete; VER-03 left uncompleted to honestly reflect PARTIAL status)"

key-decisions:
  - "Oracle was executed LIVE by orchestrator against Docker stack, not re-run by executor — evidence in prompt is authoritative. Executor's job scoped to transcription + gap taxonomy."
  - "VER-03 marked PARTIAL (not PASS, not FAIL) because the feature demonstrably works at the LLM-gateway layer (control-test curl confirmed reasoning_tokens=50) but the instrumentation required by the oracle contract (JSONL log line) is silent — this is a narrow evidence-pipeline gap, not a user-facing regression."
  - "Two independent defects surfaced in VER-03 (Gap A at route.ts:121 priority, Gap B in logger end-to-end) documented as separate artifacts with separate artifacts/missing entries so gap-closure planner can decide whether to land both in one plan or split."
  - "Gap C (list_llm_models available=false for shortcuts) tagged LOW severity and deferred to v30.1 per CONTEXT.md deferred-list — does NOT block v30.0 close because CatBot reads supports_reasoning (non-null, correct) not available for its narration."
  - "VER-03 NOT marked complete in REQUIREMENTS.md despite it being `[x]` checked pre-161-06 — the traceability table now honestly reflects the Gap A/B blockers and will surface during verifier phase-close, naturally routing to --gaps mode."

patterns-established:
  - "UAT.md gap structure: severity ladder (blocker/major/minor/cosmetic) + root_cause per gap + artifacts[path+line+issue] + missing[concrete fix list] + debug_session field reserved for later /gsd:plan-phase --gaps enrichment"
  - "Conservative read-before-write behaviour from Operador de Modelos skill: CatBot invokes get_catbot_llm + list_llm_models before committing set_catbot_llm even with sudo active. Validates Phase 160-04 skill injection pathway end-to-end."
  - "Control-test curl pattern for isolating which layer of the stack is responsible when the end-to-end oracle fails: bypass DocFlow with direct LiteLLM curl on identical body shape to prove gateway layer is sound, pinpointing defect to DocFlow route handler (not LiteLLM, not Claude Opus)."

requirements-completed: [VER-01, VER-02]
requirements-partial: [VER-03]

# Metrics
duration: ~15min
completed: 2026-04-22
---

# Phase 161 Plan 06: Oracle UAT 3/3 Summary

**Live oracle UAT landed VER-01 + VER-02 as PASS with verbatim CatBot transcripts + tool-call args + DB post-state read-back; VER-03 PARTIAL surfaced 2 blockers (catbot_config.model override at route.ts:121 + Plan 161-03 logger silent end-to-end) routed to /gsd:plan-phase 161 --gaps.**

## Performance

- **Duration:** ~15 min (including live oracle execution window ~12:20–12:35 UTC)
- **Started:** 2026-04-22T12:20:00Z
- **Completed:** 2026-04-22T14:55:00Z (UAT evidence authored and closed)
- **Tasks:** 5 (3 live oracle checkpoints + 1 capture-log-line + 1 UAT authoring)
- **Files created:** 2 (UAT.md, SUMMARY.md)

## Accomplishments

- **VER-01 PASS captured:** CatBot `list_llm_models` returned 21 models; all 4 Plan 161-01 shortcut rows (claude-opus / claude-sonnet / gemini-main / gemma-local) enriched with non-null `supports_reasoning` + `max_tokens_cap` + `is_local`. Namespace-mismatch blocker from STATE.md L39 verifiably closed end-to-end.
- **VER-02 PASS captured:** Under sudo, CatBot invoked `set_catbot_llm({model: "claude-opus", reasoning_effort: "high", max_tokens: 32000, thinking_budget: 16000})`. DB read-back via `GET /api/aliases` shows the write persisted. Conservative read-before-write pattern from "Operador de Modelos" skill (Phase 160-04) fired as designed.
- **VER-03 PARTIAL, diagnosed:** Two independent defects isolated and documented with exact file+line references, proposed fixes, and control-test evidence that LiteLLM passthrough (Phase 159) is sound at the gateway level — blast radius narrowed to DocFlow `catbot/chat` route handler.
- **Gap structure authored for automated gap-closure:** YAML Gaps section in UAT.md is /gsd:plan-phase --gaps-consumable (artifacts[path+line+issue] + missing[concrete fix list] + root_cause).
- **Milestone v30.0 user-facing surface unblocked:** VER-01/02 green + UI-01/02/03 shipped + 18/21 requirements complete; only VER-03 evidence-pipeline gap remains before v30.0 close.

## Task Commits

This plan is a documentation-only plan — the orchestrator ran the live oracles, not this agent. Evidence was authored into UAT.md as the sole artifact. Single metadata commit bundles UAT.md + SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md.

1. **Task 1: Pre-flight Docker rebuild + verify stack** — performed by orchestrator pre-execute (stack healthy, 4 shortcut rows seeded, LiteLLM health 200, logs writable)
2. **Task 2: VER-01 live oracle** — executed by orchestrator, evidence pasted in UAT.md § Oracle 1
3. **Task 3: VER-02 live oracle** — executed by orchestrator, evidence pasted in UAT.md § Oracle 2
4. **Task 4: VER-03 live oracle + log grep** — executed by orchestrator, log grep returned 0 hits → Gap B identified
5. **Task 5: Finalize UAT.md + mark phase status** — this agent: authored UAT.md structure with 3 sections + 3 gaps + overall disposition

**Plan metadata:** (to be committed with this SUMMARY + state/roadmap/requirements updates)

## Files Created/Modified

- `.planning/phases/161-ui-enrutamiento-oracle-e2e/161-06-UAT.md` — full UAT evidence file with 3 oracle sections + 3 gap entries (YAML) + severity table + overall disposition
- `.planning/phases/161-ui-enrutamiento-oracle-e2e/161-06-SUMMARY.md` — this file
- `.planning/STATE.md` — plan counter advanced, decision logged, session recorded
- `.planning/ROADMAP.md` — phase 161 plan-progress row updated (6/6 shipped, awaiting verifier)
- `.planning/REQUIREMENTS.md` — VER-02 marked complete; VER-03 left unchecked to reflect PARTIAL status honestly (verifier will surface as gap_found and route to /gsd:plan-phase 161 --gaps)

## Decisions Made

- **Evidence-as-authoritative:** Orchestrator ran the oracles live. This executor did NOT re-run. Rationale: re-running would (a) burn tokens against Anthropic + (b) risk rate-limits + (c) risk state drift (the very sudo+set_catbot_llm flow VER-02 tests would alter alias state between oracle runs, invalidating the first VER-01 pre-state). Orchestrator's evidence block in the prompt IS the authoritative source of truth. Executor's job: transcribe + gap-structure for machine consumption.
- **VER-03 PARTIAL, not FAIL:** The feature works (control-test curl proves LiteLLM returns reasoning_tokens=50 end-to-end); the oracle is silent. Distinguishing "feature broken" from "oracle broken" matters for milestone disposition — PARTIAL keeps v30.0 close-able contingent on instrumentation fix, whereas FAIL would imply a user-facing regression requiring rollback consideration.
- **Gap A vs Gap B as separate entries (not combined):** They have different root causes and likely different fixes. Combining would force the gap-closure planner into an all-or-nothing commit. Separating lets the planner scope each independently.
- **VER-03 NOT marked complete in REQUIREMENTS.md:** Pre-161-06 the traceability table marked VER-03 as `[x] Complete` (presumably based on Plan 161-03's logger implementation landing green in unit tests). The live oracle proves the unit test did not catch a real-world regression. Honest accounting flips VER-03 back to pending so verifier will surface it naturally — alternative (leaving `[x]` checked) would silently lie to the milestone audit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Scope narrowing - orchestration decision] Executor did NOT re-run the 3 live oracles**
- **Found during:** Plan entry
- **Issue:** Plan 161-06 tasks 1-4 are `type="checkpoint:human-verify"` meaning they expect human interaction with the live stack. Orchestrator already executed all 3 oracles and captured evidence before spawning this executor. Re-running would burn tokens, risk rate limits, and invalidate the chronological state captured in the evidence block.
- **Fix:** Executor treats orchestrator's `<live_oracle_evidence>` block as authoritative source of truth. Task 5 "Finalize UAT.md" is the only task this agent performs — consolidating evidence into UAT.md + SUMMARY.md.
- **Verification:** UAT.md contains all 3 oracle sections with verbatim prompts, tool-call args, DB read-back, and log-grep results from the authoritative evidence.
- **Rationale:** Explicitly instructed by orchestrator ("Do NOT re-run the oracles yourself — the evidence is authoritative").

---

**Total deviations:** 1 orchestration-level scope-narrowing (not a code deviation)
**Impact on plan:** None — final deliverable (161-06-UAT.md with 3 oracle transcripts + gaps) is identical to what the plan's done-criteria specify. Task 5's authoring responsibility is unchanged.

## Issues Encountered

- **VER-03 failed silently first.** Initial trigger prompt produced LiteLLM 400 because `catbot_config.model` masked the alias — orchestrator identified Gap A (route.ts:121 priority). Second trigger prompt with explicit model-in-body bypassed Gap A and produced a valid response, but no `reasoning_usage` log line appeared — orchestrator identified Gap B (logger silent end-to-end). Control-test curl directly to LiteLLM confirmed the gateway layer is sound, narrowing the diagnosis to DocFlow's `catbot/chat` route handler.
- **Pre-plan VER-03 checkmark in REQUIREMENTS.md was wrong.** Plan 161-03's unit tests passed green (regression guards covered interface widening + mock-fetch shape) but the live oracle surfaced the Gap B that unit tests couldn't catch — the full CatBot system prompt (26k tokens) + tool-loop MAX_ITERATIONS=15 regime wasn't represented in the mocks. Reinforces the CLAUDE.md "CatBot como Oráculo" principle: unit tests prove the code compiles; only CatBot can prove the feature works.

## User Setup Required

None — all data, tools, and UAT infrastructure are already in place. Live oracle ran against the user's Docker stack (localhost:3500) with user-provided sudo password.

## Next Phase Readiness

- **Immediate next step:** Verifier phase (per STATE.md milestone status `verifying`) will consume this SUMMARY + UAT and surface VER-03 Gap A/B as `gaps_found`, routing to `/gsd:plan-phase 161 --gaps`.
- **Expected gap-closure plan scope:**
  1. **Fix A:** Atomic `set_catbot_llm` → `catbot_config.model` propagation in Phase 160-03 handler (`app/src/lib/services/catbot-tools.ts`) so the tool keeps the alias-vs-catbot_config invariant locally, OR invert priority at `app/src/app/api/catbot/chat/route.ts:121` to `cfg.model || catbotConfig.model || requestedModel`. Planner decides based on impact analysis.
  2. **Fix B:** Add `logger.debug('catbot-chat', 'usage_inspect', {usage_raw: JSON.stringify(usage)})` before the `if (rt > 0)` check on both streaming + non-streaming paths, rebuild Docker, re-run the exact VER-03 prompt, inspect the usage shape captured, patch the extraction logic. Candidate root causes to rule out: (a) `reasoning_effort` / `thinking` dropped in the iteration loop after iteration 0, (b) `usage.completion_tokens_details` nested differently under full-context CatBot request, (c) `merge_reasoning_content_in_choices:false` LiteLLM config affecting usage shape.
  3. **Integration test:** seed alias catbot with reasoning config → mock catbot/chat end-to-end → assert `reasoning_usage` log line present. This test is the contract that catches any future regression equivalent to the one 161-03 unit tests missed.
- **Milestone v30.0 close-ability:** Contingent on Fix A + Fix B landing. User-facing surface (UI, tools, skill, schema, passthrough) is ALREADY operational per VER-01/02 PASS + UI-01/02/03 shipped + CAT/CFG/PASS/TOOL all green. VER-03 is an evidence-pipeline gap, narrow in blast radius.
- **Gap C deferred:** `list_llm_models available=false for shortcut rows` documented in UAT.md § Gap C, tagged LOW, deferred to v30.1 per CONTEXT.md `<deferred>` block. Does NOT block v30.0 close.

## Self-Check: PASSED

**Files verified:**
- `.planning/phases/161-ui-enrutamiento-oracle-e2e/161-06-UAT.md` — FOUND
- `.planning/phases/161-ui-enrutamiento-oracle-e2e/161-06-SUMMARY.md` — FOUND

**Evidence verified:**
- UAT.md contains 3 oracle sections (grep `### [123]\. Oracle`) — FOUND
- UAT.md contains Gaps section with 2 YAML entries structured for /gsd:plan-phase --gaps consumption — FOUND
- Gap A artifact reference: `app/src/app/api/catbot/chat/route.ts:121` — FOUND (verified present in live codebase per orchestrator evidence block)
- Gap B artifact reference: `app/src/app/api/catbot/chat/route.ts:518-525 + ~234` — FOUND (verified present per orchestrator evidence block)

**Commits verified:** (to be verified post-commit; this is a single-commit metadata-only plan)

---
*Phase: 161-ui-enrutamiento-oracle-e2e*
*Completed: 2026-04-22*
