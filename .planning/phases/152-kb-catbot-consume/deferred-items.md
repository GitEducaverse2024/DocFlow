# Deferred Items — Phase 152 KB CatBot Consume

Items discovered during execution that are OUT OF SCOPE per deviation-rule
SCOPE BOUNDARY: only auto-fix issues directly caused by current task changes.
Pre-existing issues are logged here, not fixed.

## From Plan 152-01 (Foundation)

### Pre-existing: `_index.json` area updated_at drift vs individual JSONs

- **Found during:** Task 2 RED→GREEN run of `knowledge-tree.test.ts`.
- **Test:** `Knowledge Tree > updated_at > _index.json areas[].updated_at matches individual JSON updated_at`
- **Failure:** `expected '2026-04-12' to be '2026-04-17'` — `app/data/knowledge/_index.json`
  area entries have older `updated_at` timestamps than the individual JSON
  files they reference.
- **Root cause:** Phase 151-02 commit `7c5d2e1` ("feat(151-02): inject redirect
  stubs into 7 JSONs + 4 MDs") modified `catpower.json` (and likely others)
  to include `__redirect` keys, bumping their `updated_at`, but did NOT
  regenerate `_index.json` to match. Pre-exists Phase 152.
- **Not fixed in 152-01:** Out of scope. Phase 152-01 delivers KB-18
  (Zod schema extension) and KB read-path foundation; it does not touch
  `app/data/knowledge/_index.json` generation.
- **Proposed owner:** Phase 155 (cleanup final, which owns removal of the
  legacy `app/data/knowledge/` tree altogether) OR a small Plan 152-04
  pre-Docker-rebuild patch if Plan 04's oracle test surfaces it. For now,
  the test failure is documented and knowledge-tree test suite runs at
  27/28 — the 14 new Plan-152-01 tests pass.

### Pre-existing: `knowledge-tools-sync.test.ts` phantom tool `delete_catflow`

- **Found during:** Task 2 full-suite regression check (`npm run test:unit`).
- **Test:** `Knowledge Tree <-> CatBot Tools Bidirectional Sync > every knowledge JSON tool exists in TOOLS[]`
- **Failure:** Phantom tool `delete_catflow` is referenced in a knowledge
  JSON (`app/data/knowledge/catflow.json` likely) but is NOT present in
  `catbot-tools.ts TOOLS[]`.
- **Verified pre-existing:** Failed on pristine tree (commit 8f6301f,
  before Plan 152-01 touched knowledge-tree.ts). Not caused by this plan.
- **Disposition:** Out of scope for Plan 152-01 (Foundation). Will surface
  again as tripwire in Plan 152-04 when we add `search_kb` and
  `get_kb_entry` to the tools array — the plan for Plan 02/03/04
  explicitly includes a task to add those two tool names to a knowledge
  JSON. `delete_catflow` can be cleaned up in the same sweep or left for
  Phase 155 (final legacy cleanup).

### Pre-existing: 4 task-scheduler, 3 alias-routing, 2 catbot-holded-tools test failures

- **Found during:** Task 2 full-suite regression check.
- **Verified pre-existing:** These suites touch services (task-scheduler,
  alias-routing, catbot-holded-tools) that Plan 152-01 never imports or
  modifies. Pre-exist this plan.
- **Disposition:** Out of scope. Logged for awareness only.

### Pre-existing: `list_connectors` tool does not exist

- **Found during:** Task 1 requirements drafting (REQUIREMENTS.md KB-17 text).
- **Evidence:** Grep `catbot-tools.ts` for `list_connectors` returns nothing;
  only `list_email_connectors` (L310) exists.
- **Disposition:** Documented in KB-17 as explicitly deferred. KB-17 scope
  reduced from 6 tools (as Phase 152 CONTEXT suggested) to 5 canonical
  tools. No work needed in 152-01.

## From Plan 152-02 (Tool Registration)

### Intentional RED: `knowledge-tools-sync.test.ts` — search_kb/get_kb_entry missing from knowledge JSONs

- **Found during:** Informational verify run after Task 1 GREEN.
- **Test:** `Knowledge Tree <-> CatBot Tools Bidirectional Sync > every TOOLS[] tool appears in at least one knowledge JSON`
- **Failure:** `Tools in TOOLS[] but missing from all knowledge JSONs: search_kb, get_kb_entry`
- **Disposition:** INTENTIONAL and EXPECTED. Plan 152-02 registers the two
  new tools in `catbot-tools.ts` but does NOT yet add them to any knowledge
  JSON — that write-path is owned by Plan 152-04 (knowledge tree + prompt
  assembler wiring). The tripwire is the exact signal Plan 04 responds to.
- **Companion failure:** `Phantom tools in knowledge JSONs: delete_catflow` —
  pre-existing from before Phase 152 (verified in Plan 01). Plan 04 should
  sweep `delete_catflow` at the same time it registers the two new tools.

### Out of scope (pre-existing): same 4 task-scheduler / 3 alias-routing / 2 catbot-holded-tools failures

- **Not re-triggered or worsened by Plan 02.** Plan 02 only modifies
  `catbot-tools.ts` (add-only: 2 imports, 2 TOOLS entries, 2 executeTool
  cases, allowlist extension, helper rename, query_knowledge case extension).
  None of these touch task-scheduler, alias-routing, or catbot-holded-tools.
