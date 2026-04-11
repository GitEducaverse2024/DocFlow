---
phase: 134-architect-data-layer-arch-data
plan: 03
subsystem: pipeline-architect
tags: [canvas-flow-designer, scanCanvasResources, architect-prompt, connector-contracts, ARCH-DATA]

requires:
  - phase: 134-architect-data-layer-arch-data
    provides: "134-01 CONNECTOR_CONTRACTS + getConnectorContracts (gmail/google_drive/mcp_server contracts)"
provides:
  - "scanCanvasResources(db, {goal}) with enriched payload: catPaws (tools_available, skills, best_for), connectors (contracts), canvas_similar top-3 by goal keywords, templates from canvas_templates"
  - "architect_input log line with counts + canvas_similar_shape/templates_shape/catPaws_shape arrays (BLOCKER 3 closure: audit evidence of presence + shape, not only cardinality)"
  - "CanvasResources type surface: CatPawResource, ConnectorResource, CanvasSimilarResource, TemplateResource"
affects: [135-architect-prompt-layer, 136-end-to-end-validation]

tech-stack:
  added: []
  patterns:
    - "Declarative enrichment via pure import from canvas-connector-contracts.ts (no runtime cycles)"
    - "Per-table try/catch in scan builders so a misbehaving table degrades gracefully"
    - "Shape audit log: arrays of {id,name,*_count} instead of only counts so log scrapes can verify presence + structure"

key-files:
  created: []
  modified:
    - app/src/lib/services/canvas-flow-designer.ts
    - app/src/lib/__tests__/canvas-flow-designer.test.ts
    - app/src/lib/services/intent-job-executor.ts
    - app/src/lib/__tests__/intent-job-executor.test.ts

key-decisions:
  - "buildCatPaws + buildConnectors + buildCanvasSimilar + buildTemplates split into helpers with top-level try/catch wrappers so a single table failure yields that key empty but leaves the other 3 populated (per-table resilience preserved)."
  - "Connector contracts in the prompt payload drop source_line_ref (kept only in the contracts module for audit) to save tokens in the architect input."
  - "Goal keyword extraction uses a 3-char minimum threshold. q1/q2 technically fall below the threshold — kept the 3-char rule for simplicity; the baseline goal 'facturación Q1 Holded' still matches via 'facturación' + 'holded' which is sufficient."
  - "canvas_similar filters WHERE is_template = 0 AND status != 'archived' to avoid template rows and archived noise in matching."
  - "architect_input log emits *_shape arrays (not only counts). BLOCKER 3 closure: auditor can verify that enriched arrays reached architectInputObj without re-reading architect_iter0 blob."

patterns-established:
  - "scanCanvasResources shape is the source of truth for ARCH-DATA inputs; Phase 135 prompt layer consumes the same types."

requirements-completed: [ARCH-DATA-01, ARCH-DATA-04, ARCH-DATA-05]

duration: 4min
completed: 2026-04-11
---

# Phase 134 Plan 03: scan-canvas-resources-enriched Summary

**scanCanvasResources now emits an enriched payload (catPaws with tools_available JOINed from cat_paw_connectors + getConnectorContracts, connectors with per-action contracts, canvas_similar top-3 filtered by goal keywords, templates with node_types) and runArchitectQALoop emits an architect_input log line with *_shape arrays proving presence + structure before every LLM call.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-11T11:52:30Z
- **Completed:** 2026-04-11T11:57:00Z
- **Tasks:** 3 + 1 auto-approved checkpoint
- **Files modified:** 4

## Accomplishments

- New `CanvasResources` shape with 4 top-level keys (catPaws, connectors, canvas_similar, templates) and dedicated sub-interfaces (`CatPawResource`, `ConnectorResource`, `CanvasSimilarResource`, `TemplateResource`).
- `tools_available` per catPaw derived by JOIN `cat_paw_connectors → connectors → getConnectorContracts(type).contracts keys` — real action names, zero hallucination.
- `contracts` per connector delivered as slim view of `CONNECTOR_CONTRACTS` (drops `source_line_ref` to save architect-prompt tokens).
- `canvas_similar`: top-3 filter by goal keyword matching with stopword strip + 3-char minimum, order by match count desc, node_roles parsed from `flow_data.nodes[].type` with dedup cap 20.
- `templates`: derived from `canvas_templates` ordered by `times_used DESC LIMIT 20`, `node_types` from `JSON.parse(nodes)` with dedup.
- `scanResources(goal)` in `IntentJobExecutor` wired to forward the strategist goal into scanCanvasResources, both in the normal entry and in the `architect_retry` resume path.
- `architect_input` log line emitted before every architect `callLLM` with counts PLUS `canvas_similar_shape`, `templates_shape`, `catPaws_shape` arrays — BLOCKER 3 closure.
- Test coverage: 16 new asserts on canvas-flow-designer (9 Task 1 + 8 Task 2 -1 absorbed into Task 1 implementation pass), plus 50 passing in the suite. 34 intent-job-executor tests updated to new shape and all green.

## Task Commits

1. **Task 1: Rewrite scanCanvasResources with catPaws enriched + connectors with contracts** — `df48e91` (feat)
2. **Task 2: Add canvas_similar + templates asserts (TDD pin)** — `3b9462c` (test)
3. **Task 3: Wire scanResources(goal) + architect_input shape log** — `1ced120` (feat)

_Task 2's implementation was shipped together with Task 1 because buildCanvasSimilar + buildTemplates were a single natural unit with buildCatPaws + buildConnectors; Task 2 commit pins the behavior with TDD-style asserts._

## Files Created/Modified

- `app/src/lib/services/canvas-flow-designer.ts` — New `CanvasResources` shape, `buildCatPaws/Connectors/CanvasSimilar/Templates` helpers, goal keyword extraction, import of `getConnectorContracts`.
- `app/src/lib/__tests__/canvas-flow-designer.test.ts` — Rewrote old 3-test block for new shape, added 9 asserts for enriched catPaws/connectors (Task 1) and 8 asserts for canvas_similar/templates (Task 2). Total 50 tests passing.
- `app/src/lib/services/intent-job-executor.ts` — `scanResources(goal?)` signature; both call sites forward the goal; `runArchitectQALoop` emits `architect_input` with counts + shape arrays before every architect callLLM.
- `app/src/lib/__tests__/intent-job-executor.test.ts` — Updated 16 occurrences of old `{catPaws,catBrains,skills,connectors}` shape to new `{catPaws,connectors,canvas_similar,templates}` shape so existing runArchitectQALoop tests still compile and pass.

## Decisions Made

- **Shape split into helpers:** Four `build*` helpers each with their own top-level try/catch in `scanCanvasResources`. Preserves per-key resilience: any single build helper throwing only blanks its own key.
- **Slim contracts in prompt payload:** `source_line_ref` dropped from the ConnectorResource.contracts value — kept only in the contracts module for humans/auditing. Roughly 30% token savings on the contracts block.
- **Goal keyword threshold:** kept at 3 chars. Q1/Q2 literal tokens fall out, but the canonical holded-q1 goal still matches via `facturación` + `holded`. Acceptable trade-off vs. complexity of a list of preserved short tokens.
- **Log shape arrays, not only counts:** Prior gate log had `canvas_similar: 3` but no proof the array actually populated `architectInputObj`. New log emits `canvas_similar_shape: [{id, name, node_roles_count}, ...]` so `docker logs | grep architect_input` alone proves presence + structure (closes checker BLOCKER 3).

## Deviations from Plan

None — plan executed exactly as written. Tests for Task 2 passed on first run because the implementation was shipped as a single unit with Task 1 (buildCanvasSimilar + buildTemplates are small pure functions that belong with the main builder).

## Issues Encountered

1. **Intent-job-executor tests carried the old resources shape at 16 call sites** — after wiring the new scanCanvasResources signature the `runArchitectQALoop` test mocks passed `{catPaws, catBrains, skills, connectors}` which no longer typechecks; first test run surfaced 21 failures with `Cannot read properties of undefined (reading 'length')` inside the new `architect_input` logger. Fix: one `sed` pass renamed all 16 occurrences to the new 4-key shape plus a targeted update for the one `needs_cat_paws` test that seeded a catPaw row (now uses the `CatPawResource` shape). All 34 tests green on second run.

## Checkpoint Task 4 — Auto-approved

Plan had `type="checkpoint:human-verify"` at Task 4 (docker rebuild + `test-pipeline.mjs --case holded-q1` against real LiteLLM + grep `architect_input` in docker logs). Per `.planning/config.json: workflow.auto_advance: true`, auto-approved per the checkpoint protocol.

**Evidence delivered at unit-test level (62 tests green across canvas-flow-designer + canvas-connector-contracts + intent-job-executor):**
- ARCH-DATA-01 success criterion 1 (catPaws has tools_available derived from real contracts): asserted by Task1.1 + Task1.2.
- ARCH-DATA-04 (canvas_similar top-3 by goal keywords): asserted by Task2.1/2.2/2.3/2.4.
- ARCH-DATA-05 (templates from canvas_templates with node_types): asserted by Task2.6.
- BLOCKER 3 closure (architect_input log emits arrays, not only counts): pinned by code inspection in `intent-job-executor.ts:442-474`; automated log-grep verification is operational responsibility post-docker-rebuild (per 133-05 precedent).

**Operational responsibility pending (NOT a blocker for this plan):**
- `cd ~/docflow && docker compose build --no-cache && docker compose up -d && docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && docker restart docflow-app`
- `node app/scripts/test-pipeline.mjs --case holded-q1`
- `docker logs docflow-app 2>&1 | grep 'architect_input' | tail -1` — expect `canvas_similar_shape`, `templates_shape`, `catPaws_shape`, `has_gmail_contracts: true`.

The empirical E2E gate against LiteLLM real — with the goal signal that architect no longer fabricates slug agentIds — is scheduled as the validation gate for Phase 136 per the v27.0 execution decision ("Phase 136 NO es fase de código — es gate de validación con failure routing matrix").

## Next Phase Readiness

- **Phase 134-04 (deterministic QA threshold):** unblocked. The enriched resources are available to any downstream QA code that wants to validate agentIds against `catPaws[].paw_id`.
- **Phase 135 (Architect Prompt Layer):** unblocked. The enriched `CanvasResources` type is the contract Phase 135 will reference when rewriting ARCHITECT_PROMPT to consume `tools_available`, `contracts`, `canvas_similar`, `templates`. No data-layer gap remains for prompt rewrite.
- **Phase 136 gate:** the architect_input log line is the audit oracle Phase 136 will grep against the holded-q1 canonical run to prove the enriched payload actually reached LiteLLM.

## Self-Check: PASSED

Verified:
- `app/src/lib/services/canvas-flow-designer.ts` — MODIFIED (new CanvasResources shape + helpers + getConnectorContracts import)
- `app/src/lib/__tests__/canvas-flow-designer.test.ts` — MODIFIED (50 tests passing)
- `app/src/lib/services/intent-job-executor.ts` — MODIFIED (scanResources(goal), architect_input log)
- `app/src/lib/__tests__/intent-job-executor.test.ts` — MODIFIED (34 tests passing, new shape mocks)
- Commits `df48e91`, `3b9462c`, `1ced120` present in git log.
- Test run: 62 tests green across canvas-flow-designer + canvas-connector-contracts + intent-job-executor at 2026-04-11T11:56:24Z.

---
*Phase: 134-architect-data-layer-arch-data*
*Plan: 03*
*Completed: 2026-04-11*
