---
phase: 131-complexity-assessment-catbot-razona-antes-de-ejecutar
plan: 02
subsystem: catbot-complexity-gate
tags: [catbot, route, streaming, tool-loop, intent-jobs, complexity, p0]
requires:
  - complexity_decisions CRUD (Plan 01)
  - buildComplexityProtocol P0 prompt section (Plan 01)
  - intent_jobs + Phase 130 pipeline executor
provides:
  - parseComplexityPrefix pure helper + ComplexityPrefix type
  - Iteration-0 complexity gate in both streaming and non-streaming paths of /api/catbot/chat
  - queue_intent_job accepting optional free-form description (synthetic tool_name=__description__)
  - IntentJobExecutor.buildStrategistInput handling the description branch
affects:
  - /api/catbot/chat/route.ts: non-streaming ~line 349 gate, streaming ~line 154 gate, outer catch timeout flip
  - catbot-tools.ts: executeTool context type gains optional complexityDecisionId
  - intent-job-executor.ts: strategist input honors __description__ synthetic tool
tech-stack:
  added: []
  patterns:
    - "Lenient front-of-content regex with safe 'simple' fallback"
    - "Iter-0 silent buffer in streaming path via bufferIter0 flag to suppress raw prefix"
    - "Context propagation of audit row id through executeTool for outcome flip"
key-files:
  created:
    - app/src/lib/services/catbot-complexity-parser.ts
    - app/src/lib/__tests__/complexity-parser.test.ts
    - .planning/phases/131-complexity-assessment-catbot-razona-antes-de-ejecutar/131-02-SUMMARY.md
  modified:
    - app/src/app/api/catbot/chat/route.ts
    - app/src/lib/services/catbot-tools.ts
    - app/src/lib/services/intent-job-executor.ts
    - app/src/lib/__tests__/intent-jobs.test.ts
decisions:
  - "decisionId declared at POST function scope (line ~50) — the outer try's let is NOT visible in catch, so hoisting was required for timeout flip"
  - "Streaming path uses a retroactive single-token emit after iter-0 parsing rather than mid-stream filtering, trading token-by-token UX on iter-0 for a hard guarantee that [COMPLEXITY: never leaks"
  - "Parser regex is front-anchored and lenient with whitespace + case; any deviation falls back to classification='simple' with reason='no_prefix_fallback' so routing never breaks on unexpected LLM output"
  - "queue_intent_job keeps tool_name optional AND accepts description — both callers coexist; synthetic '__description__' token is the IntentJobExecutor discriminator"
  - "executeTool context type widened in-place (no breaking signature change); all existing callers still type-check because the new field is optional"
metrics:
  duration_minutes: ~18
  tasks_completed: 3
  files_created: 2
  files_modified: 4
  commits: 3
  tests_added: 10
  tests_total_passing: 125
completed: 2026-04-10
---

# Phase 131 Plan 02: Complexity Gate + Description Pipeline Summary

Iteration-0 complexity gate wired into both streaming and non-streaming CatBot chat paths with a hard tool-loop block on 'complex', plus a description-based queue_intent_job so the Phase 130 strategist can consume multi-step requests without a specific tool anchor.

## What was built

### 1. `catbot-complexity-parser.ts` (new)

Pure helper exporting `parseComplexityPrefix(content)` with a front-anchored, case-insensitive, whitespace-lenient regex:

```
/^\s*\[COMPLEXITY:\s*(simple|complex|ambiguous)\s*\]\s*(?:\[REASON:\s*([^\]]+?)\s*\])?\s*(?:\[EST:\s*(\d+)\s*s?\s*\])?\s*/i
```

Returns `{ classification, reason, estimatedDurationS, cleanedContent, hadPrefix }`. Two safe fallbacks:
- Empty content → `classification='simple', reason='no_content_fallback', hadPrefix=false`
- No regex match → `classification='simple', reason='no_prefix_fallback', hadPrefix=false, cleanedContent=original`

No imports, no side-effects — trivially testable.

### 2. Gate wiring in `/api/catbot/chat/route.ts`

**Function-scope decision id** (hoisted above the `try` block since `let` declared inside a `try` is not visible in its `catch`):

```typescript
export async function POST(request: Request) {
  const startTime = Date.now();
  let decisionId: string | null = null;
  try { ... }
```

**Non-streaming path — anchor line ~349** (`const assistantMessage = choice.message;`):

After reading `assistantMessage`, the gate runs only on `iteration === 0`:
1. `parseComplexityPrefix(assistantMessage.content || '')`
2. `saveComplexityDecision(...)` → assigns to outer-scope `decisionId`
3. Strips the prefix: `assistantMessage.content = parsed.cleanedContent`
4. If `complex`: sets `finalReply = parsed.cleanedContent`, logs, `break` out of the tool loop. Any `tool_calls` from this iteration are discarded (the code never reaches the tool-dispatch block).
5. If `simple`/`ambiguous`: continues normal flow with cleaned content.

**Streaming path — anchor line ~154** (`for (let iteration = 0; ...)`):

Added a `bufferIter0 = iteration === 0` flag. The `onToken` callback still accumulates into `iterationContent`, but only forwards via `send('token', ...)` when `!bufferIter0`. This guarantees no raw `[COMPLEXITY:` character ever reaches the client.

After `streamLiteLLM` resolves, the iter-0 block mirrors the non-streaming flow:
1. `parseComplexityPrefix(iterationContent)`
2. `saveComplexityDecision(...)` → writes to outer-scope `decisionId`
3. `iterationContent = parsed.cleanedContent` (so any subsequent assistant-message push never carries the raw prefix)
4. If `complex`: emit the cleaned content as a single retroactive `send('token', { token: parsed.cleanedContent })` so the client still sees the user-facing question, log, `break`.
5. If `simple`/`ambiguous`: flush the buffered cleaned content as a single deferred token, then continue normally. Iterations > 0 stream token-by-token as before.

**executeTool context** — both paths now pass `complexityDecisionId: decisionId ?? undefined` plus `channel: effectiveChannel` into the regular-tool dispatch, so `queue_intent_job` can pick it up.

**Outer catch (~line 488)** — `if (decisionId) { try { updateComplexityOutcome(decisionId, 'timeout'); } catch {} }` runs before the translated error is returned, closing the audit loop for hard failures.

### 3. `queue_intent_job` extension in `catbot-tools.ts`

**Tool definition (~line 1011):**
- New optional `description` property
- `required` relaxed from `['tool_name', 'original_request']` to `['original_request']`
- Description updated to mention the new calling convention

**executeTool signature** — context type widened to include `complexityDecisionId?: string` (backward compatible; all existing call sites still type-check).

**Case body (~line 3233):**
```
toolName = args.tool_name || (description ? '__description__' : 'unknown')
toolArgs = description ? { description, original_request } : (args.tool_args ?? {})
createIntentJob({ userId, channel, toolName, toolArgs })
if (context.complexityDecisionId) updateComplexityOutcome(context.complexityDecisionId, 'queued', true)
```

`updateComplexityOutcome` imported from `@/lib/catbot-db`.

### 4. `IntentJobExecutor.buildStrategistInput` branch

New top-of-function check:

```typescript
if (job.tool_name === '__description__') {
  const obj = (parsed && typeof parsed === 'object') ? parsed : {};
  const description = obj.description || obj.original_request || '';
  return JSON.stringify({
    goal: description,
    description,
    original_request: obj.original_request ?? description,
    channel: job.channel,
  });
}
```

So the strategist LLM receives `goal` (its primary input) populated from the free-form description. Falls back safely to empty string if `tool_args` is malformed.

### 5. Tests (10 new, 125 total passing)

**Wave 0 (RED, commit `f3e82d7`):**

- `app/src/lib/__tests__/complexity-parser.test.ts` — 7 tests: full prefix, lenient whitespace+case, simple without REASON/EST, no-prefix fallback, ambiguous, empty content, typo'd prefix.
- `app/src/lib/__tests__/intent-jobs.test.ts` — 3 new tests in `describe('queue_intent_job description extension (Phase 131)')`: createIntentJob verbatim storage, description-only executeTool call produces `__description__` job, `context.complexityDecisionId` flips `async_path_taken=1, outcome='queued'`. Also added `saveComplexityDecision` import and `DELETE FROM complexity_decisions` in `beforeEach`.

After implementation (commits `0bb9c9b` + `48a152e`): all 125 tests across the 6 relevant suites green.

## Edge cases encountered

1. **`let` in try ≠ visible in catch** — Initial plan suggested placing `decisionId` inside the outer try. Caught at implementation time: hoisted to POST function body so the catch can read it.
2. **Streaming post-conversation hooks** — `autoSaveRecipe` only runs when `allToolResults.length >= 2`. Complex-gate path produces 0 tool results, so no extra guard needed; the existing threshold is the natural no-op.
3. **Simple/ambiguous streaming UX** — User feedback will be a single chunk instead of token-by-token for iteration 0. Trade-off accepted per plan: iteration 0 is short (usually just the question/first sentences before tool calls), and the guarantee of "no raw marker ever" is worth more than streaming smoothness on the first message. Iterations > 0 remain fully streamed.
4. **Test 1 of the extension block** (createIntentJob with `__description__`) turned out to pass RED immediately because `createIntentJob` doesn't validate `tool_name`. Kept as a regression guard — it still belongs to the feature surface.

## SSE protocol

No new event types were added. The existing protocol is:
- `start` → `token` (repeated) → `tool_call_start` → `tool_call_result` → ... → `done`

On the complex path, the client receives: `start` → single `token` (the cleaned question) → `done`. The client-side renderer already accumulates `token` events into a single reply string, so no UI change is required.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 - Blocking] `let decisionId` block-scope visibility in outer catch**
- **Found during:** Task 3 while writing the outer catch timeout-flip
- **Issue:** Plan suggested declaring `decisionId` inside the outer `try` block, but `let` is not visible in sibling `catch`. Without hoisting, the timeout flip would be a TS error.
- **Fix:** Declared `let decisionId: string | null = null;` at POST function body, before the outer `try`.
- **Files modified:** `app/src/app/api/catbot/chat/route.ts`
- **Commit:** `48a152e`

### Out-of-scope discoveries

None. No pre-existing warnings touched.

## Verification

- `npx vitest run complexity-parser complexity-decisions catbot-prompt-assembler intent-jobs intent-job-executor catbot-intents` → **125 passed (125)**
- `npm run build` → **Build succeeded** (zero ESLint unused-imports, zero TS errors)

## Commits

- `f3e82d7` — `test(131-02): add failing tests for complexity parser + queue_intent_job description`
- `0bb9c9b` — `feat(131-02): add complexity parser + extend queue_intent_job with description field`
- `48a152e` — `feat(131-02): wire complexity gate into route.ts streaming + non-streaming paths`

## Self-Check: PASSED

- FOUND: app/src/lib/services/catbot-complexity-parser.ts
- FOUND: app/src/lib/__tests__/complexity-parser.test.ts
- FOUND: app/src/app/api/catbot/chat/route.ts (modified — parseComplexityPrefix + saveComplexityDecision imports, both gates wired, timeout-flip in catch)
- FOUND: app/src/lib/services/catbot-tools.ts (modified — description field, case body, complexityDecisionId in context)
- FOUND: app/src/lib/services/intent-job-executor.ts (modified — __description__ branch in buildStrategistInput)
- FOUND commit: f3e82d7
- FOUND commit: 0bb9c9b
- FOUND commit: 48a152e
- VERIFIED: 125/125 tests passing
- VERIFIED: npm run build success
- VERIFIED: no raw [COMPLEXITY: forwarded to SSE client (bufferIter0 flag gates onToken forward)
