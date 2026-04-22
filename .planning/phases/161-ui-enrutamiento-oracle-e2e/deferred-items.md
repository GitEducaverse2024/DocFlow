# Phase 161 — Deferred Items

Items discovered during Phase 161 execution that are OUT OF SCOPE per the
SCOPE BOUNDARY rule (only auto-fix issues directly caused by the current
task's changes; pre-existing warnings/errors in unrelated files are logged
here and NOT fixed).

## 2026-04-22 — Plan 161-03 execution

Pre-existing TypeScript errors surfaced by `npx tsc --noEmit` during
verification, UNRELATED to stream-utils / catbot/chat:

- `src/lib/__tests__/catpaw-gmail-executor.test.ts` — missing `connectorName`
  on `GmailToolDispatch` type (lines 163, 181, 195).
- `src/lib/__tests__/intent-job-executor.test.ts:328,1790` — mock shape
  mismatch between declared `Procedure` / `never[]` and test fixtures.
- `src/lib/__tests__/intent-jobs.test.ts:293` — tuple `[]` no element at
  index 0 (empty-array assertion cast).
- `src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` — `object` type
  inferred for rebuild result instead of the structured interface, breaking
  property accesses (`created`, `updated`, `unchanged`, `skipped_archived`).
- `src/lib/__tests__/telegram-callback.test.ts:107` — implicit `any` on
  `call` parameter.

None of these are caused by the Plan 161-03 edits (stream-utils +
catbot/chat reasoning_usage logger). They pre-exist on `main` and should
be handled in a dedicated tests cleanup plan.

Verification: `npx tsc --noEmit 2>&1 | grep -E "stream-utils|catbot/chat"`
returns nothing after Plan 161-03 changes.

## 2026-04-22 — Plan 161-01 execution

During the Docker smoke verification of the Phase 161 shortcut seed, the
FQN regression query returned `1` instead of the plan-specified `2`:

```
SELECT COUNT(*) FROM model_intelligence
 WHERE model_key IN ('anthropic/claude-opus-4-6','google/gemini-2.5-pro')
-- returns 1
```

Root cause (NOT caused by 161-01): the production DB has
`anthropic/claude-opus-4` (no `-6` suffix), so the Phase 158-01 seed
UPDATE `WHERE model_key = 'anthropic/claude-opus-4-6'` has been a silent
no-op in production. The `google/gemini-2.5-pro` row exists as expected.
Existing FQN rows are intact and unchanged by the Phase 161 shortcut
seed — the shortcut INSERT OR IGNORE operates on a different PK
(`claude-opus`) and its UPDATE only targets that key.

This is Phase 158 scope (Discovery / FQN naming drift: DB catalogue uses
`anthropic/claude-opus-4` whereas Anthropic's latest model id is
`anthropic/claude-opus-4-6`). Should be addressed either by:
  - (a) a data migration mapping `claude-opus-4` → `claude-opus-4-6`, or
  - (b) updating the 158 seed UPDATE to target the stored key variant,
        or
  - (c) the v30.1 resolver layer (consults `model_aliases`).

Logging here and NOT fixing in 161-01 per SCOPE BOUNDARY rule.
Shortcut seed (the actual 161-01 deliverable) verified intact:
4 rows with canonical capabilities, query 1 and query 2 match expected
output byte-for-byte.
