---
phase: 129-intent-queue-promesas-persistentes-de-catbot
plan: 01
subsystem: database
tags: [sqlite, catbot, intents, tools, knowledge-tree]

requires:
  - phase: 118-foundation-catbot-db-knowledge-tree
    provides: catbot.db singleton, catbot-db.ts schema block, generateId helper
  - phase: 125-knowledge-tools-sync
    provides: KTREE-02 bidirectional sync test for tools[] arrays
  - phase: 124-learn-admin
    provides: executeTool context parameter (userId, sudoActive)
  - phase: 126-catbot-knowledge-protocol
    provides: log_knowledge_gap tool registration pattern (mirror template)

provides:
  - intents table with 14-column schema + 2 indexes in catbot.db
  - IntentRow TypeScript interface with status union type
  - 7 CRUD helpers (createIntent, updateIntentStatus, getIntent, listIntentsByUser, getRetryableIntents, countUnresolvedIntents, abandonIntent)
  - 5 CatBot tools registered in TOOLS[] (create_intent, update_intent_status, list_my_intents, retry_intent, abandon_intent)
  - Named export of catbotDb from catbot-db.ts
  - executeTool context type extended with optional channel

affects:
  - 129-02 (IntentWorker + PromptAssembler section) — consumes getRetryableIntents, IntentRow type
  - 129-03 (AlertService + knowledge gap integration) — consumes countUnresolvedIntents

tech-stack:
  added: []
  patterns:
    - "Intent lifecycle overlay on top of existing tool flow (create → execute → update envelope)"
    - "context.userId as authoritative identity source (never trust args) for user-scoped tools"
    - "3-attempt retry ceiling enforced at tool layer (retry_intent returns error when attempts >= 3)"
    - "default-allow fallback for permission-gated tools when allowedActions is empty"

key-files:
  created:
    - app/src/lib/__tests__/catbot-intents.test.ts
  modified:
    - app/src/lib/catbot-db.ts
    - app/src/lib/services/catbot-tools.ts
    - app/data/knowledge/settings.json
    - app/data/knowledge/_index.json

key-decisions:
  - "Named export of catbotDb added alongside default export (tests need DELETE FROM intents in beforeEach)"
  - "executeTool context type extended with optional channel (backward compatible — existing callers unaffected)"
  - "list_my_intents relies on both name.startsWith('list_') AND explicit create_intent/update_intent_status entries to keep intent registrations grep-able"
  - "retry_intent does NOT increment attempts at tool layer (user-triggered retries not counted yet); ceiling still enforced via attempts >= 3 pre-check (deviated from plan language to keep behavior consistent with LLM-driven retry model planned for Plan 02)"
  - "updated_at in settings.json and _index.json refreshed to 2026-04-10 for KTREE-01 compliance"

patterns-established:
  - "Intent CRUD mirrors knowledge_gaps CRUD exactly (table placement, function layout, export style)"
  - "Dynamic SQL UPDATE pattern: build fields[] + params[] arrays, auto-set completed_at on terminal transitions"
  - "Test pattern: temp CATBOT_DB_PATH + heavy dep vi.mock block allows real CRUD + real tool layer in one vitest file"

requirements-completed:
  - INTENT-01
  - INTENT-03

duration: 50min
completed: 2026-04-10
---

# Phase 129 Plan 01: Intents Schema + CRUD + Tools Summary

**SQLite-backed intents table with 14-column lifecycle schema, 7 CRUD helpers, and 5 LLM tools wired end-to-end with cross-user isolation via context.userId.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-04-10T12:02:24Z
- **Completed:** 2026-04-10T12:52:43Z
- **Tasks:** 3
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- New `intents` table with 14 columns and 2 composite/single indexes, hot-path scans fast by (status) and (user_id, status)
- 7 typed CRUD helpers exported from `catbot-db.ts`, auto-setting `completed_at` on `completed`/`abandoned` transitions
- 5 new CatBot tools (`create_intent`, `update_intent_status`, `list_my_intents`, `retry_intent`, `abandon_intent`) with JSON schemas and executeTool dispatch
- Permission gate: 3 always_allowed + 2 manage_intents-gated (with default-allow fallback when allowedActions is empty)
- Cross-user isolation enforced via `context.userId` — tool args cannot leak other users' intents
- Knowledge tree sync satisfied (`settings.json.tools[]` + `_index.json.updated_at`) so KTREE-02 stays green
- Wave 0 test file with 19 passing tests (10 CRUD + 6 tool execution + 3 permission gate)

## Task Commits

1. **Task 1: Wave 0 failing tests (RED)** — `4079b68` (test)
2. **Task 2: intents schema + CRUD (GREEN for INTENT-01)** — `68dc019` (feat)
3. **Task 3: 5 tools + permission gate + knowledge tree sync (GREEN for INTENT-03)** — `5b7d5e5` (feat)

_Plan metadata commit: pending (final state/roadmap update)_

## Files Created/Modified

- `app/src/lib/__tests__/catbot-intents.test.ts` — 337 lines, 19 tests covering CRUD, tool execution (via real executeTool), and permission gate
- `app/src/lib/catbot-db.ts` — Added intents CREATE TABLE + 2 indexes, `IntentRow` interface, 7 CRUD helpers, named `catbotDb` export
- `app/src/lib/services/catbot-tools.ts` — Added intent imports, 5 TOOLS[] entries, 5 executeTool cases, extended permission gate, extended context type with optional channel
- `app/data/knowledge/settings.json` — Added 5 tool names to tools[] array, refreshed updated_at
- `app/data/knowledge/_index.json` — Refreshed settings area + top-level updated_at

## Schema Reference

```sql
CREATE TABLE intents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel TEXT DEFAULT 'web',
  original_request TEXT NOT NULL,
  parsed_goal TEXT,
  steps TEXT DEFAULT '[]',
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',  -- pending | in_progress | completed | failed | abandoned
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  result TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX idx_intents_status ON intents(status);
CREATE INDEX idx_intents_user_status ON intents(user_id, status);
```

## Exported CRUD Functions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `createIntent` | `(intent: { userId; channel?; originalRequest; parsedGoal?; steps? }) => string` | Insert row, return generated id |
| `updateIntentStatus` | `(id, patch: { status?; currentStep?; lastError?; result?; incrementAttempts? }) => void` | Dynamic UPDATE with auto completed_at on terminal states |
| `getIntent` | `(id) => IntentRow \| undefined` | Fetch single row |
| `listIntentsByUser` | `(userId, opts?: { status?; limit? }) => IntentRow[]` | User-scoped list, default limit 50, sorted by created_at DESC |
| `getRetryableIntents` | `(maxAttempts = 3) => IntentRow[]` | Failed rows with attempts < max, ordered by updated_at ASC, max 20 (for IntentWorker Plan 02) |
| `countUnresolvedIntents` | `() => number` | COUNT of status IN ('failed','abandoned') (for AlertService Plan 03) |
| `abandonIntent` | `(id, reason) => void` | Sets status='abandoned' + last_error + completed_at |

## Tool Registration

| Tool | Permission | Context Usage | Notes |
|------|-----------|---------------|-------|
| `create_intent` | always_allowed | Reads `context.userId` + `context.channel` | Never reads userId from args |
| `update_intent_status` | always_allowed | Takes intent_id from args | Status enum: in_progress/completed/failed |
| `list_my_intents` | always_allowed | Reads `context.userId` | Cross-user isolation verified in tests |
| `retry_intent` | `manage_intents` (or default-allow) | — | Returns error when attempts >= 3 |
| `abandon_intent` | `manage_intents` (or default-allow) | — | Delegates to abandonIntent() helper |

**Knowledge tree host:** `app/data/knowledge/settings.json` — consistent with log_knowledge_gap placement (Phase 126).

## Decisions Made

- **Named export of `catbotDb`**: Tests need `DELETE FROM intents` in beforeEach. Added `export { catbotDb }` alongside the existing default export (non-breaking for existing default imports).
- **Context type extended with `channel?: string`**: create_intent reads `context.channel || 'web'`. Added to optional field of executeTool signature — all existing callers continue to work without change.
- **Retry attempt counting deferred to IntentWorker (Plan 02)**: The plan said "retry_intent calls updateIntentStatus with incrementAttempts: true", but the research pattern showed `status: 'pending', lastError: null` only. Deviation Rule 1 resolved in favor of the research pattern — user-triggered retries are a signal of intent to re-run, not a failed attempt. The attempts >= 3 ceiling is still enforced via the pre-check. Plan 02 IntentWorker will increment attempts as part of the re-prompt cycle.
- **Tool exposure via multiple allow-paths**: `list_my_intents` is covered by the existing `name.startsWith('list_')` rule. Added explicit entries for `create_intent` + `update_intent_status` anyway so grep-ability stays high and future refactors of the startsWith rule don't silently drop intent tools.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Behavior Consistency] retry_intent does not increment attempts at tool layer**
- **Found during:** Task 3 (register 5 tools)
- **Issue:** Plan task 3 `<behavior>` block said "retry_intent calls updateIntentStatus with status='pending' AND incrementAttempts: true", but research Pattern 3 showed `status: 'pending', lastError: null` only — no increment. The two sources disagree.
- **Fix:** Followed research Pattern 3. User-triggered retries are a green-light, not a failed attempt. The attempts >= 3 ceiling still gates the call (Pitfall 4). Plan 02 IntentWorker will carry the increment responsibility during background re-prompting.
- **Files modified:** `app/src/lib/services/catbot-tools.ts` (case 'retry_intent')
- **Verification:** Test "retry_intent returns error when attempts >= 3" passes (attempts bumped via direct updateIntentStatus calls before invoking the tool)
- **Committed in:** `5b7d5e5`

**2. [Rule 3 — Blocking] Test file needed real DB + mocked tool deps simultaneously**
- **Found during:** Task 1 (RED test setup)
- **Issue:** CRUD tests need real SQLite (no mock), but importing executeTool from catbot-tools.ts pulls 10+ heavy dependencies (alias-routing, discovery, mid, health, knowledge-tree, etc.) that crash in test environment.
- **Fix:** Combined approach — set `CATBOT_DB_PATH` to a tmp dir (real catbot-db), then vi.mock all catbot-tools transitive deps upfront. Dynamic imports in beforeAll ensure env var is set before module load.
- **Files modified:** `app/src/lib/__tests__/catbot-intents.test.ts`
- **Verification:** 19 tests pass, no warnings, no real DB touched
- **Committed in:** `4079b68`

---

**Total deviations:** 2 auto-fixed (1 behavior consistency, 1 blocking)
**Impact on plan:** Both necessary. Deviation 1 aligns behavior with the research (which is the more detailed spec). Deviation 2 is a test-infra shape that every future intent test can reuse. No scope creep.

## Issues Encountered

- **Pre-existing TypeScript downlevelIteration errors in unrelated test files**: `tsc --noEmit` surfaced 3 errors in `catbot-summary.test.ts` and `knowledge-tools-sync.test.ts` unrelated to this plan. Out of scope per CLAUDE.md scope boundary — not fixed. Next.js `npm run build` succeeds cleanly (different tsconfig).
- **`git add app/data/...` warning**: First commit attempt produced a gitignore warning but succeeded on retry because the files are already tracked (legacy ignore rule matches the path but not the tracked entries). No data loss.

## User Setup Required

None — no external service configuration required. CatBot tools live in the existing catbot.db via standard `better-sqlite3` lifecycle.

## Next Phase Readiness

- **Plan 02 (IntentWorker + PromptAssembler P1 section):** READY — `getRetryableIntents` and `IntentRow` are exported; `intent-worker.ts` can be written as a copy of `alert-service.ts`.
- **Plan 03 (AlertService integration + knowledge gap auto-log):** READY — `countUnresolvedIntents` exported, `checkIntentsUnresolved` can be dropped into `alert-service.ts` checks array.
- **No blockers. No architectural decisions outstanding.**

## Self-Check: PASSED

- `app/src/lib/__tests__/catbot-intents.test.ts` — FOUND
- `app/src/lib/catbot-db.ts` contains `CREATE TABLE IF NOT EXISTS intents` — FOUND
- `app/src/lib/services/catbot-tools.ts` contains `create_intent` — FOUND
- `app/data/knowledge/settings.json` contains `create_intent` — FOUND
- commit `4079b68` — FOUND
- commit `68dc019` — FOUND
- commit `5b7d5e5` — FOUND
- `npx vitest run catbot-intents + knowledge-tools-sync` — 23/23 PASSED
- `npm run build` — PASSED

---
*Phase: 129-intent-queue-promesas-persistentes-de-catbot*
*Completed: 2026-04-10*
