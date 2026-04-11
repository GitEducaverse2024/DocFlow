---
phase: 137-learning-loops-memory-learn
plan: 07
gap_closure: true
triggered_by: "137-06 SIGNAL GATE RUN 1 failure — job cbf6c55e-0f62-46fc-8d1f-faef9c275821 (architect stage): SyntaxError Unterminated string in JSON at position 4722, max_tokens=4000 truncation"
subsystem: async-pipeline
tags: [architect, self-healing, jsonrepair, retry, catbot-sudo-tool, intent-jobs, knowledge-tree]

requires:
  - phase: 137-02-runtime-wiring
    provides: intent_jobs.complexity_decision_id + updateIntentJob patch type + createIntentJob helper
  - phase: 137-03-catbot-intelligence
    provides: CatBot tool registration pattern (TOOLS[] + executeTool case + permission gate + knowledge-tree parity invariant)
  - phase: 137-06-signal-gate
    provides: empirical failure evidence (job cbf6c55e, truncated_json at position 4722)

provides:
  - "intent_jobs schema: 4 idempotent nullable columns (failure_class, config_overrides, architect_iter0_raw, parent_job_id)"
  - "intent-job-failure-classifier.ts: classifyArchitectFailure(error, rawOutput?, finishReason?) → truncated_json|parse_error|qa_rejected|llm_error|other"
  - "intent-job-architect-helpers.ts: resolveArchitectMaxTokens(configOverridesJson) + parseArchitectJson(raw) with jsonrepair fallback"
  - "intent-job-executor.ts wiring: architect call honours job.config_overrides.architect_max_tokens (default 16000, clamped [1000,128000]); raw output persisted BEFORE parse; top-level catch classifies failure and persists failure_class"
  - "CatBot retry_intent_job tool: sudo-gated (manage_intent_jobs permission key + hard sudoActive check), creates new intent_job with parent_job_id back-link and optional architect_max_tokens override"
  - "ARCHITECT_MAX_TOKENS env var respected (bracket-notation) with 16000 default — 4x the old hard-coded 4000"
  - "Knowledge tree: catboard.json + _index.json updated (retry_intent_job in tools[], 2 new concepts, 1 new howto, 1 new common_error, updated_at=2026-04-12)"

affects: [137-06-signal-gate, future-retry-flows]

tech-stack:
  added:
    - "jsonrepair@^3.13.3 (npm dependency in app/package.json)"
  patterns:
    - "Helper extraction: resolveArchitectMaxTokens + parseArchitectJson pulled into a dedicated file (intent-job-architect-helpers.ts) so vitest can exercise the pure logic without importing the full IntentJobExecutor (DB+ollama+qdrant transitive chain)"
    - "Failure classification pipeline: rawOutput persisted BEFORE parse → top-level catch reads it back → classifier sees authentic truncation signal (balance-check heuristic) → failure_class column drives CatBot prompt logic"
    - "Sudo enforcement at TWO layers: tool catalog permission gate (manage_intent_jobs) AND hard sudoActive check inside executeTool case (defense in depth, because catalog gating can be bypassed by a user with catalog override)"
    - "Idempotent migration via addColumnIfMissing: 4 new TEXT columns on intent_jobs, safe on every container boot + test run (pre-existing pattern from Phase 133/137-02)"

key-files:
  created:
    - app/src/lib/services/intent-job-failure-classifier.ts
    - app/src/lib/services/intent-job-architect-helpers.ts
    - app/src/lib/__tests__/intent-job-failure-classifier.test.ts
    - app/src/lib/__tests__/intent-job-architect-helpers.test.ts
    - app/src/lib/__tests__/catbot-tools-retry-job.test.ts
    - .planning/phases/137-learning-loops-memory-learn/137-07-SUMMARY.md
  modified:
    - app/package.json
    - app/package-lock.json
    - app/src/lib/catbot-db.ts
    - app/src/lib/services/intent-job-executor.ts
    - app/src/lib/services/catbot-tools.ts
    - app/data/knowledge/catboard.json
    - app/data/knowledge/_index.json

key-decisions:
  - "Default ARCHITECT_MAX_TOKENS = 16000 (4x the old 4000). The 137-06 RUN 1 failure truncated at position 4722 of a 7-8 node canvas; 16000 gives ~4x headroom for the canonical Holded Q1 case and accommodates 2-3x node count growth without another gate break. Clamped to [1000, 128000] to prevent pathological overrides."
  - "Helpers in a separate file (intent-job-architect-helpers.ts), NOT co-located in intent-job-executor.ts. Reason: existing test pattern — canvas-executor-condition.test.ts (Phase 137-02) and the catbot-tools-user-patterns tests all use the 'extract pure helper, test in isolation' pattern because importing the full executor pulls in DB+ollama+qdrant+logger and doubles test boot time. Extraction keeps intent-job-architect-helpers.test.ts under 150ms."
  - "Persist architect_iter0_raw BEFORE calling parseArchitectJson (not after). Reason: if the parse throws, the top-level catch in processJob must be able to read the raw output back from the DB to feed classifyArchitectFailure. If we only persisted on success, the classifier would only see the error string and would miss the balance-check heuristic."
  - "jsonrepair rethrows the ORIGINAL parse error on double-failure, not a wrapped 'both failed' error. Reason: the classifier's heuristic relies on authentic phrases ('Unterminated string', 'Unexpected end of JSON') from the v8 engine. Wrapping those in a custom message breaks classification."
  - "retry_intent_job is sudo-gated at TWO layers (permission gate + hard sudoActive check). Reason: retrying a failed job creates a new pipeline that burns LLM budget; cross-user retry (sudo bypass of user_id check) is intentional for admin triage. Single-layer gating would let a user with empty allowedActions bypass the check."
  - "parent_job_id is a new column (not an array of back-links). Reason: one-level lineage is enough for the v27.0 milestone. If a retry fails too, CatBot can walk backwards via parent_job_id chain; we don't need branching retry trees yet."
  - "jsonrepair is cleverer than expected — it repairs even 'totally not json @@@###' into '\"@@@\"'. Had to use empty string to exercise the rethrow branch in the test."

patterns-established:
  - "Self-healing execution loop: when a transient infrastructure failure (max_tokens, timeout, 5xx) hits the pipeline, the classifier emits a structured failure_class + CatBot can propose a retry with per-job overrides. Extensible to other knobs (temperature, model, timeout) without schema changes."
  - "CatBot as admin console: retry_intent_job is the first sudo-gated tool that creates new pipeline jobs. Establishes the pattern for future admin ops (force-restart, force-cancel, override-approve)."

deviations:
  auto-fixed:
    - "Rule 2 (missing critical functionality): default ARCHITECT_MAX_TOKENS was 4000 hard-coded. The plan said 'bump to 16000' but did not say 'also make the default cover non-override paths'. I made resolveArchitectMaxTokens return 16000 when both override and env are absent — otherwise existing pipelines without overrides would still hit the same 4000 wall."
    - "Rule 3 (blocking): pre-existing intent_job_executor.test.ts type error in the mock (columns 522 architect_iter0_raw). Fixed by extending updateIntentJob's patch type with the new 4 columns + adding them to stageColumns array."
    - "Rule 2 (self-check): knowledge-tree.test.ts asserts every source in catboard.json exists on disk. Initially added 137-07-SUMMARY.md as a source preemptively, broke the test, removed it and will re-reference from the summary itself (meta-reference) — the SUMMARY is written AFTER source list finalization."

  asked:
    - none

requirements-completed: []

duration: ~10.5min
started: 2026-04-11T17:22:10Z
completed: 2026-04-11T17:32:47Z
tests:
  new_passing: 33
  touched_suites: "174/174 passing (intent-job-failure-classifier + intent-job-architect-helpers + intent-job-executor + intent-jobs + catbot-tools-retry-job + catbot-tools-user-patterns + knowledge-tree)"

commits:
  - c81ee66 feat(137-07) intent_jobs failure classification schema + classifier
  - f1414df feat(137-07) architect jsonrepair fallback + max_tokens override + raw persistence
  - c543c0b feat(137-07) catbot retry_intent_job sudo tool + self-healing prompt context
---

# Phase 137 Plan 07: Architect Self-Healing + Retry Loop (Gap Closure)

**Ad-hoc gap closure triggered by 137-06 SIGNAL GATE RUN 1 failure. The architect LLM truncated its JSON output at position 4722 when designing a 7-8 node canvas because `max_tokens` was hard-coded to 4000. This plan makes the architect robust (bigger default + jsonrepair fallback + raw output persistence + failure classification) and gives CatBot a sudo-gated `retry_intent_job` tool so the user can diagnose + retry failed jobs in one conversation.**

## Context — why this plan exists

`137-06-signal-gate-3x-reproducibility-PLAN.md` Task 2 (first Telegram run of the v27.0 milestone signal) failed with:

```
intent_job id:        cbf6c55e-0f62-46fc-8d1f-faef9c275821
pipeline_phase:       architect
status:               failed
error:                SyntaxError: Unterminated string in JSON at position 4722
```

The notification trail showed the architect correctly emitted `needs_cat_paws` at 17:07:25 UTC (the 137-03 CatPaw protocol skill fired as designed). The failure came 60s later, at parse time of the subsequent architect call, because the LLM ran out of `max_tokens` mid-string while re-emitting the full `flow_data` JSON after CatPaw resolution.

This is **preexisting structural fragility** exposed by the gate, not a regression of plans 137-01..05. Plan 137-07 is the fix.

## What shipped

### Task 1 — schema + classifier (commit c81ee66)

**New idempotent columns on `intent_jobs`** (via `addColumnIfMissing`):

| Column                 | Purpose                                                                 |
|------------------------|-------------------------------------------------------------------------|
| `failure_class`        | bucket set on failed transitions: `truncated_json \| parse_error \| qa_rejected \| llm_error \| other` |
| `config_overrides`     | JSON blob with per-job knobs (currently `architect_max_tokens`)         |
| `architect_iter0_raw`  | raw LLM output before parse, for post-mortem of truncation              |
| `parent_job_id`        | back-link from a retry job to the original failed job                   |

`IntentJobRow` TypeScript type extended. `updateIntentJob` patch type + `stageColumns` array accept the new fields.

**New file `intent-job-failure-classifier.ts`** — pure function:
```typescript
classifyArchitectFailure({ error, rawOutput?, finishReason? })
  → 'truncated_json' | 'parse_error' | 'qa_rejected' | 'llm_error' | 'other'
```

Heuristics:
- `truncated_json`: error contains "Unterminated string" | "Unexpected end of JSON/input", OR `finishReason === 'length'`, OR `rawOutput` fails a balance-check (unclosed braces/brackets/strings).
- `parse_error`: any other JSON parse failure (SyntaxError, Unexpected token).
- `qa_rejected`: error contains "QA loop exhausted".
- `llm_error`: timeout, ECONN*, litellm 5xx, fetch failed, abort.
- `other`: everything else.

**15 tests, all green.**

### Task 2 — architect robustness (commit f1414df)

**Installed `jsonrepair@^3.13.3`** as an app dependency.

**New file `intent-job-architect-helpers.ts`:**

```typescript
resolveArchitectMaxTokens(configOverridesJson: string | null | undefined): number
// Precedence: overrides.architect_max_tokens > ARCHITECT_MAX_TOKENS env > 16000
// Clamped to [1000, 128000]

parseArchitectJson(raw: string): { parsed: unknown; repair_applied: boolean }
// 1. strip markdown fences
// 2. JSON.parse — return on success
// 3. jsonrepair(stripped) + JSON.parse — return with repair_applied=true
// 4. on double-failure, rethrow the ORIGINAL JSON.parse error
```

**Wired into `intent-job-executor.ts`:**

1. `callLLM` now accepts `opts?: { maxTokens?: number }` (default 4000 for strategist/decomposer/QA unchanged).
2. `runArchitectQALoop` resolves `architectMaxTokens = resolveArchitectMaxTokens(job.config_overrides)` once per job and passes it to every architect `callLLM`. Logs the resolved value + whether an override was present.
3. `runArchitectQALoop` persists `architect_iter0_raw = architectRaw` BEFORE calling `parseArchitectJson`, so the top-level catch in `processJob` can read it back to feed the classifier.
4. `runArchitectQALoop` calls `parseArchitectJson(architectRaw)` instead of the legacy `this.parseJSON(architectRaw)` for architect output (QA output still uses the legacy helper — QA responses fit comfortably under 4000 tokens). Logs a warning when `repair_applied === true`.
5. `processJob` catch block now reads back `architect_iter0_raw`, calls `classifyArchitectFailure`, logs the classification, and persists `failure_class` alongside `status='failed'`.

**Environment variable:** `process['env']['ARCHITECT_MAX_TOKENS']` (bracket notation per CLAUDE.md). Default remains 16000 when env is absent.

**11 tests, all green.** Pre-existing `intent-job-executor.test.ts` (47 tests) still passes unchanged.

### Task 3 — CatBot retry_intent_job tool (commit c543c0b)

**New entry in `TOOLS[]`:** `retry_intent_job`

```typescript
{
  name: 'retry_intent_job',
  description: 'Phase 137-07: Reintenta un intent_job fallido [...] SUDO REQUIRED [...]',
  parameters: {
    required: ['job_id'],
    properties: {
      job_id: { type: 'string' },
      architect_max_tokens: { type: 'number' },
    },
  },
}
```

**Permission gate** (`getToolsForLLM`): sudo-gated via `manage_intent_jobs` permission key (follows `cancel_job` / `approve_pipeline` / `post_execution_decision` pattern).

**executeTool case** (defense in depth — hard sudoActive check INSIDE the case):
1. If `!context?.sudoActive` → return `{ error: 'SUDO_REQUIRED', message: '...' }`.
2. If `!args.job_id` → return `{ error: 'job_id is required' }`.
3. If `getIntentJob(origJobId)` returns undefined → return `{ error: 'not_found' }`.
4. Build `overridesApplied` with `architect_max_tokens` when provided.
5. Call `createIntentJob` with the original's user_id/channel/channel_ref/tool_name/tool_args.
6. Call `updateIntentJob(newJobId, { config_overrides, parent_job_id })` to persist the retry metadata.
7. Return `{ new_job_id, parent_job_id, overrides_applied, message }`.

**Knowledge tree** (per CLAUDE.md Knowledge Tree + CatBot Protocol):
- `catboard.json`:
  - `tools[]`: added `retry_intent_job`
  - `concepts[]`: 2 new (self-healing retry loop overview, `architect_iter0_raw` column)
  - `howto[]`: 1 new (6-step diagnose + retry flow: `list_my_jobs` → read `failure_class` → propose override → user activates sudo → `retry_intent_job` → new job via `parent_job_id`)
  - `common_errors[]`: 1 new (`Unterminated string in JSON ... (architect failure)`) with cause + 137-07 solution
  - `updated_at` → `2026-04-12`
- `_index.json`: `catboard.updated_at` → `2026-04-12` (knowledge-tree parity invariant preserved)

**7 tests, all green** (registration + gate + sudo + happy path + override + not_found).

## Test results

All touched vitest suites green:

| Suite                                    | Tests | Status |
|------------------------------------------|------:|--------|
| intent-job-failure-classifier.test.ts    |    15 | new    |
| intent-job-architect-helpers.test.ts     |    11 | new    |
| catbot-tools-retry-job.test.ts           |     7 | new    |
| intent-job-executor.test.ts              |    47 | pass   |
| intent-jobs.test.ts                      |    30 | pass   |
| catbot-tools-user-patterns.test.ts       |    16 | pass   |
| knowledge-tree.test.ts                   |    48 | pass   |
| **Total (touched suites)**               | **174** | **174/174** |

**New tests: 33.** Pre-existing suite-wide failures (task-scheduler 5 + catbot-holded-tools 2) confirmed pre-existing, out of scope, NOT introduced by this plan.

## CatBot oracle self-verification (CLAUDE.md protocol)

After docker rebuild, the following prompts will exercise the self-healing chain end-to-end:

1. **`que paso con mi ultimo job fallido`** → CatBot calls `list_my_jobs(status='failed')`, reads `failure_class` from the row, explains to the user that the failure was technical (truncated_json = architect hit max_tokens) and proposes a retry with `architect_max_tokens=16000`.

2. **`reintenta el job cbf6c55e con mas tokens`** → (in sudo) CatBot calls `retry_intent_job(job_id='cbf6c55e...', architect_max_tokens=16000)` and reports back `{new_job_id, parent_job_id, overrides_applied}`. User sees the new job move through the pipeline within ~60-90s.

3. **`cuantos jobs han fallado por truncated_json esta semana`** → (future enhancement) would be a new `get_failure_class_stats` oracle. Out of scope for 137-07 — logged as a follow-up.

## Deviations from plan

### Rule 2 (missing critical functionality)

The plan said "bump max_tokens default to 16000 via env var". This addresses overrides and env-set deployments but leaves deployments without env vars still at the old 4000 wall. Fix: `resolveArchitectMaxTokens` returns 16000 when BOTH override and env are absent, making the self-healing path universal without requiring a deploy-time config change.

### Rule 3 (blocking)

Pre-existing `updateIntentJob` patch type did not accept the 4 new columns added in Task 1. TypeScript error at line 522 of intent-job-executor.ts when I tried to persist `architect_iter0_raw`. Fixed by extending the patch type and the `stageColumns` array in catbot-db.ts — this closes the type gap once and for all, not just for 137-07.

### Self-reference meta-issue

Initially added `137-07-SUMMARY.md` to `catboard.json.sources[]` preemptively. Broke `knowledge-tree.test.ts` because the test asserts every source exists on disk. Removed the preemptive reference and documented that the SUMMARY lives at `.planning/phases/137-learning-loops-memory-learn/137-07-SUMMARY.md`.

**No architectural deviations (Rule 4). No human-action auth gates.**

## Deferred / out of scope

- **Retry lineage walk tool**: if a retry itself fails, CatBot currently needs to call `list_my_jobs` twice and trace the chain manually. A `get_job_lineage(job_id)` tool that walks `parent_job_id` backwards is a natural next step.
- **Failure class stats oracle**: `get_failure_class_stats(window_days)` similar to `get_complexity_outcome_stats` — would close the "how often does the architect fail" loop.
- **Auto-retry heuristic**: currently retries are user-driven. A background worker that auto-retries `truncated_json` failures with a bumped budget (up to N attempts) would eliminate user friction but also risks runaway token spend — needs a budget gate.
- **Docker rebuild**: explicitly OUT of scope per plan constraints. User handles it manually.

## Self-Check: PASSED

**Files on disk:**
- `/home/deskmath/docflow/app/src/lib/services/intent-job-failure-classifier.ts` — FOUND
- `/home/deskmath/docflow/app/src/lib/services/intent-job-architect-helpers.ts` — FOUND
- `/home/deskmath/docflow/app/src/lib/__tests__/intent-job-failure-classifier.test.ts` — FOUND
- `/home/deskmath/docflow/app/src/lib/__tests__/intent-job-architect-helpers.test.ts` — FOUND
- `/home/deskmath/docflow/app/src/lib/__tests__/catbot-tools-retry-job.test.ts` — FOUND
- `/home/deskmath/docflow/app/src/lib/catbot-db.ts` — modified (4 new columns + patch type)
- `/home/deskmath/docflow/app/src/lib/services/intent-job-executor.ts` — modified (helpers + classifier wiring)
- `/home/deskmath/docflow/app/src/lib/services/catbot-tools.ts` — modified (retry_intent_job tool + gate + case)
- `/home/deskmath/docflow/app/data/knowledge/catboard.json` — modified (tools + concepts + howto + common_error + updated_at)
- `/home/deskmath/docflow/app/data/knowledge/_index.json` — modified (catboard updated_at bumped)

**Commits in git log:**
- `c81ee66` — schema + classifier
- `f1414df` — jsonrepair + max_tokens override + raw persistence
- `c543c0b` — retry_intent_job sudo tool + knowledge tree

**Regression gate:** `npx vitest run intent-job-failure-classifier intent-job-architect-helpers intent-job-executor intent-jobs catbot-tools-retry-job catbot-tools-user-patterns knowledge-tree` → **174/174 passed**.

## Next steps for the user

1. **Docker rebuild** (OUT of executor scope, user handles manually):
   ```bash
   docker compose build --no-cache && docker compose up -d && docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && docker restart docflow-app
   ```
2. **Retry the 137-06 signal gate RUN 1, RUN 2, RUN 3** via Telegram. The architect should now handle 7-8 node canvases without truncation (16000 max_tokens default). If it still truncates, ask CatBot:
   > "Reintentalo con mas max_tokens" (activa sudo primero)

   CatBot should call `retry_intent_job` with `architect_max_tokens: 32000`.

---

*Phase: 137-learning-loops-memory-learn · Plan: 07 (gap closure) · Completed: 2026-04-11*
