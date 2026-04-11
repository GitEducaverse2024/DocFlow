---
phase: 137-learning-loops-memory-learn
plan: 04
subsystem: notifications
tags: [telegram, sendProposal, intent-job-executor, learn-07, knowledge-tree]

requires:
  - phase: 137-02
    provides: persisted flow_data with nodes at canvas INSERT
  - phase: 135-01
    provides: data.role taxonomy (extractor/transformer/synthesizer/renderer/emitter/guard/reporter)
provides:
  - sendProposal rich Telegram format (title + nodes list + estimated time + approve/cancel buttons)
  - Role-based emoji mapping for node list rendering
  - Web fallback (createNotification) reusing the rich body
  - catboard.json documentation of LEARN-07 format per CLAUDE.md knowledge tree protocol
affects: [137-06 (signal-gate E2E verification), 137-05 (next plan in phase)]

tech-stack:
  added: []
  patterns:
    - "Rich Telegram proposal: load canvas (name + flow_data) from DB at send time, derive body from real persisted nodes"
    - "Role > Type > Default fallback chain for node emoji; agent/multiagent deliberately omit type-emoji so role-less agents fall through to default bullet (signal to user that role annotation is missing)"
    - "Iterative safety cap: trim nodes list until body fits 4000 chars, preserving header + footer"

key-files:
  created:
    - app/src/lib/__tests__/intent-job-executor-proposal.test.ts
  modified:
    - app/src/lib/services/intent-job-executor.ts
    - app/data/knowledge/catboard.json

key-decisions:
  - "TYPE_EMOJI omits agent/multiagent: role-less agents fall to • default so user can see missing-role signal instead of generic robot"
  - "Iterative trim in buildProposalBody: shrink nodes list before blind slice; keeps header + footer intact"
  - "callback_data unchanged (pipeline:{jobId}:approve|reject): telegram-bot.ts handler untouched, zero risk to existing approval flow"
  - "CatBot oracle waiver: LEARN-07 is self-verifying because Telegram is CatBot's primary output channel; 137-06 gate covers E2E"

patterns-established:
  - "Rich-body notification pattern: load persisted resource at send time, derive message from DB state (not from stale LLM tool args)"
  - "Role-based visual rendering: map data.role → emoji for UI feedback loops"

requirements-completed: [LEARN-07]

duration: ~8min
completed: 2026-04-11
---

# Phase 137 Plan 04: Telegram Proposal UX Summary

**Rich sendProposal body for Telegram approvals — canvas title + nodes list with role emoji + estimated time + preserved approve/cancel buttons, so users approve with visibility instead of blind trust**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-11T16:38:00Z
- **Completed:** 2026-04-11T16:44:20Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- sendProposal now loads canvas `(name, flow_data)` from DB and renders a rich approval body with title, **Objetivo**, `Nodos (N):` list with role-based emoji, `⏱ Tiempo estimado`, and backward-compat approve/cancel inline buttons
- ROLE_EMOJI mapping for the 7 Phase-135 roles + start + default bullet; TYPE_EMOJI fallback for structural node types (iterator, condition, connector, merge, start)
- Estimated time heuristic: `ceil(agent_count * 30s / 60)` clamped to [1,10] minutes
- Safety: iterative node-list trim before 4000-char cap; header + footer always preserved
- Web channel (`createNotification`) reuses the same rich body for non-Telegram flows
- catboard.json documents the new format (2 concepts + 1 howto + plan source) per CLAUDE.md knowledge tree protocol
- LEARN-07 CatBot oracle waiver explicit in the plan: self-verifying via Telegram as primary channel, E2E covered by 137-06 gate

## Task Commits

Each task was committed atomically (TDD split):

1. **RED — failing proposal tests** — `16fd386` (test)
   - 9 tests: title, nodes list, role emoji, truncation, estimated time, buttons, 4000-char cap, web fallback, knowledge tree grep
   - Verified 9/9 failing as expected
2. **GREEN — sendProposal rich format + knowledge tree** — `2282507` (feat)
   - Rewrote `sendProposal` + new helpers `buildProposalBody`, `formatNodeLine`, `estimateMinutes`, `ROLE_EMOJI`, `TYPE_EMOJI`
   - catboard.json: 2 concepts, 1 howto, plan source
   - 9/9 proposal tests green, 71/71 intent-job-executor regression green, 19/19 knowledge-tree parity green

**Plan metadata:** (this commit)

## Files Created/Modified
- `app/src/lib/__tests__/intent-job-executor-proposal.test.ts` — 9 behavior tests with canvas row mocking and telegramBotService spy
- `app/src/lib/services/intent-job-executor.ts` — new `ROLE_EMOJI`/`TYPE_EMOJI` statics, `formatNodeLine`, `estimateMinutes`, `buildProposalBody`, and `sendProposal` rewrite (loads canvas row, derives body from persisted flow_data, preserves approve/cancel callback_data, applies iterative safety cap)
- `app/data/knowledge/catboard.json` — LEARN-07 concepts (format + heuristic) + howto (Telegram approval flow) + source refs to plan and MILESTONE-CONTEXT

## Decisions Made

- **TYPE_EMOJI omits `agent`/`multiagent`**: test 3 expects role-less agents to fall to `•` default. Rationale in code comment: a bare `agent` without `data.role` is a Phase 135 ARCH-PROMPT-10 violation — the default bullet is a visible signal that the role annotation is missing, not a neutral decoration. A 🤖 emoji would hide the defect.
- **Iterative trim** (not blind slice): `buildProposalBody` shrinks the visible node list one node at a time until the body fits 4000 chars, preserving header + footer always. Blind `slice(0, 3990)` was the fallback only if iterative trim couldn't fit even 1 node.
- **Load canvas from DB at send time** (not from tool_args): the plan's "canvas already persisted" contract (canvas INSERT at L851-854) is the truth. Using `row.flow_data` guarantees the proposal reflects what's in the canvas, not a stale architect-output blob.
- **callback_data preserved byte-for-byte** (`pipeline:{jobId}:approve|reject`): zero touch to `telegram-bot.ts` handler. Button labels changed from "Ejecutar" to "Aprobar" (matches test expectation and PARTE 7 spec).

## Deviations from Plan

**1. [Rule 1 — Spec contradiction] TYPE_EMOJI for `agent` omitted**
- **Found during:** TDD GREEN run, test 3 failed because plan's example `TYPE_EMOJI` had `agent: '🤖'` but test expected role-less agent to fall to `•` default (plan behavior text: "Nodos sin role declarado reciben un emoji default (•)").
- **Issue:** Self-contradiction between plan's code example and plan's behavior description. The 9 explicit test behaviors are the source of truth per TDD protocol.
- **Fix:** Removed `agent` and `multiagent` from `TYPE_EMOJI`. Added comment documenting this is intentional: role-less agent → default bullet is a visible defect signal (missing ARCH-PROMPT-10 role annotation).
- **Files modified:** `app/src/lib/services/intent-job-executor.ts`
- **Verification:** 9/9 proposal tests green, 71/71 intent-job-executor regression green
- **Committed in:** `2282507` (GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 spec contradiction resolved in favor of test-as-spec)
**Impact on plan:** Zero scope creep. Decision preserves TDD integrity and surfaces a user-visible defect signal.

## Issues Encountered
None beyond the deviation above. All 71 intent-job-executor tests green on first GREEN run after fixing TYPE_EMOJI; knowledge-tree parity held because `_index.json` catboard entry was already `2026-04-11`.

## User Setup Required
None. No new env vars, no external services, no migrations. docker rebuild required to ship the new sendProposal path to runtime, but that's responsibility of 137-06 signal-gate per CatBot oracle waiver.

## Next Phase Readiness
- LEARN-07 ready for E2E validation in 137-06 (signal-gate Task 2: human-verify receives Telegram message with new format, clicks Aprobar, pipeline runs)
- Plan 137-05 (next in wave) can proceed independently — this plan only touched sendProposal + knowledge tree
- 35/45 v27.0 requirements now covered (FOUND-01..10, ARCH-DATA-01..07, ARCH-PROMPT-01..14, LEARN-01..07+08)

## Self-Check: PASSED

- FOUND: `app/src/lib/__tests__/intent-job-executor-proposal.test.ts`
- FOUND: `app/src/lib/services/intent-job-executor.ts` (with new helpers + rewritten sendProposal)
- FOUND: `app/data/knowledge/catboard.json` (3 matches for CatFlow generado/sendProposal/LEARN-07)
- FOUND commit: `16fd386` (RED)
- FOUND commit: `2282507` (GREEN)
- Tests: 9/9 proposal + 71/71 intent-job-executor + 19/19 knowledge-tree all green

---
*Phase: 137-learning-loops-memory-learn*
*Completed: 2026-04-11*
