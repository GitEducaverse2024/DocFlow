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

### Pre-existing: `list_connectors` tool does not exist

- **Found during:** Task 1 requirements drafting (REQUIREMENTS.md KB-17 text).
- **Evidence:** Grep `catbot-tools.ts` for `list_connectors` returns nothing;
  only `list_email_connectors` (L310) exists.
- **Disposition:** Documented in KB-17 as explicitly deferred. KB-17 scope
  reduced from 6 tools (as Phase 152 CONTEXT suggested) to 5 canonical
  tools. No work needed in 152-01.
