# Phase 153 — Deferred Items

Out-of-scope discoveries logged during execution, per GSD scope-boundary
rule (only auto-fix issues directly caused by current task's changes).

## Pre-existing Test Failures (not caused by 153-01)

Plan 153-01 touches `app/src/lib/logger.ts`, `app/src/lib/services/kb-audit.ts`
(new), `app/src/lib/__tests__/kb-audit.test.ts` (new), and
`scripts/validate-kb.cjs` (1-line exclusion). Running the full `npm run
test:unit` suite post-Plan-153-01 reveals **10 failing tests across 3 files**
that are unrelated to our changes:

- `src/lib/services/task-scheduler.test.ts` (5 failures) — TaskScheduler tick()
  and updateNextRun() logic. Unrelated to KB or logger.
- `src/lib/services/__tests__/alias-routing.test.ts` (3 failures) — seedAliases
  idempotence. Unrelated to KB or logger.
- `src/lib/services/__tests__/catbot-holded-tools.test.ts` (2 failures) —
  `response.text is not a function` mock mismatch. Unrelated to KB or logger.

Evidence these predate Phase 153-01:
- Stashed pre-153-01 working tree run of `catbot-holded-tools` still fails 2/10.
- The KB-regression subset specified in success_criteria (knowledge-sync 38/38,
  kb-sync-cli, kb-sync-db-source, kb-index-cache, kb-tools, kb-tools-integration,
  catbot-tools-query-knowledge, knowledge-sync, knowledge-tree,
  knowledge-tools-sync, catbot-prompt-assembler) runs **240/240 green** on
  post-Plan-153-01 tree.

**Action:** Log, do not fix. These belong to Phases 76-04 (catbot-holded-tools,
commit bf81952), and separate infra phases (alias-routing, task-scheduler).
Add to a future cleanup phase if/when prioritised.
