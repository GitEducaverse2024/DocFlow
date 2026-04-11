---
phase: 137-learning-loops-memory-learn
plan: 03
subsystem: catbot-intelligence
tags: [catbot, system-prompt, user-patterns, catpaw-protocol, complexity-oracle, sqlite-migration, knowledge-tree]

requires:
  - phase: 131-complexity-gate
    provides: complexity_decisions table + updateComplexityOutcome helper
  - phase: 137-02-runtime-wiring
    provides: complexity_decisions.outcome closure at 3 terminal paths (completed/cancelled/timeout) — gives get_complexity_outcome_stats real data to aggregate
  - docflow.db skills table
  - catbot.db (existing user_profiles/complexity_decisions tables)
provides:
  - LEARN-01: system skill "Protocolo de creacion de CatPaw" seeded in docflow.db (category='system')
  - LEARN-02: PromptAssembler unconditional injection of the CatPaw protocol when the architect emits needs_cat_paws or the user asks to create a CatPaw
  - LEARN-03: user_interaction_patterns table in catbot.db (+2 indexes) + getUserPatterns/writeUserPattern helpers
  - LEARN-04: PromptAssembler P2 injection of "Preferencias observadas del usuario" section when userId has patterns
  - LEARN-08 oracle: get_complexity_outcome_stats tool (always_allowed readonly) answers "what % of complex requests complete successfully"
  - 4 new CatBot tools wired through permission gate (3 always_allowed + 1 manage_user_patterns gated)
affects: [137-04-telegram-ux, 137-06-signal-gate, 136-e2e-validation]

tech-stack:
  added: []
  patterns:
    - "Cross-db helper split: user_interaction_patterns (catbot.db) via catbotDb; skills (docflow.db) via db — tests mock each handle separately, no ambiguity"
    - "Seed idempotence via canonical deterministic id + INSERT OR IGNORE (skill-system-catpaw-protocol-v1)"
    - "vi.hoisted() for env-var setup in Vitest: ESM import hoisting forces temp-db paths to be set BEFORE module-level DB imports (otherwise imports are evaluated first and env vars never take effect)"
    - "User-scoped tools extended via existing USER_SCOPED_TOOLS array — args.user_id auto-injected from ctx.userId, sudo bypass for cross-user access (list_user_patterns/write_user_pattern/get_user_patterns_summary)"

key-files:
  created:
    - app/src/lib/__tests__/catbot-user-patterns.test.ts
    - app/src/lib/__tests__/catbot-tools-user-patterns.test.ts
    - .planning/phases/137-learning-loops-memory-learn/137-03-SUMMARY.md
  modified:
    - app/src/lib/catbot-db.ts
    - app/src/lib/db.ts
    - app/src/lib/services/catbot-user-profile.ts
    - app/src/lib/services/catbot-prompt-assembler.ts
    - app/src/lib/services/catbot-tools.ts
    - app/src/lib/__tests__/catbot-prompt-assembler.test.ts
    - app/data/knowledge/catboard.json
    - app/data/knowledge/catpaw.json
    - app/data/knowledge/_index.json

key-decisions:
  - "user_interaction_patterns lives in catbot-db.ts (catbot.db), NOT docflow.db — follows the INC-10 lesson that CatBot-owned mutable state belongs in catbotDb. Tests mock catbotDb for pattern assertions."
  - "Skill seed for 'Protocolo de creacion de CatPaw' lives in db.ts (docflow.db) because the skills table is canonical there. Tests mock db for seed assertions — complete cross-db separation of responsibilities."
  - "Permission key is manage_user_patterns (new) — write_user_pattern is the only pattern tool that needs a gate. list_user_patterns / get_user_patterns_summary / get_complexity_outcome_stats are readonly and always_allowed."
  - "get_complexity_outcome_stats is global (not user-scoped) because it is the LEARN-08 health oracle of the pipeline — CatBot answers system-level health questions, not per-user stats. Window clamped [1,365] via Math.max/min/floor — normalizes <=0 to 1 and >365 to 365."
  - "CatPaw protocol injected at P1 (high-priority, never truncated by budget) via buildCatPawProtocolSection(). LEARN-02 requirement is 'always follow the protocol' — the skill text must always be in the prompt, not gated on intent detection, because intent detection happens AFTER the prompt is built."
  - "User patterns injected at P2 — lower priority than identity/tools/skill protocols, truncatable under Libre budget, but present for Pro/Elite tiers. Limit 10 by confidence DESC, last_seen DESC so the most recent high-confidence signals win."
  - "Tests use a shared temp dir for BOTH CATBOT_DB_PATH and DATABASE_PATH so the real ./data/docflow.db is never polluted. This bug surfaced mid-RUN (an early pre-hoisted test poisoned the real docflow.db with id='skill-system-catpaw-protocol-v1' name='Duplicate attempt' — cleaned up manually via node -e script)."

patterns-established:
  - "CatBot oracle self-verification (CLAUDE.md protocol): any new metric/feature gets a CatBot tool so CatBot can query its own state. get_complexity_outcome_stats is the pattern for LEARN-08 — CatBot can now answer 'what % of complex requests succeed' without the user touching the DB or UI."
  - "System skill injection: skills WHERE category='system' become unconditional prompt sections. Used here for Protocolo de creacion de CatPaw, reusable for any future always-on protocol (e.g. a 'Protocolo de envio de email' if INC-12 guardrails need repeating in every turn)."

deviations:
  auto-fixed:
    - "Rule 3 (blocking): vi.hoisted() replaced top-level env-var assignment in catbot-user-patterns.test.ts. ESM import hoisting evaluated @/lib/catbot-db before the env vars were set, causing the tests to hit production DB paths. Fixed by moving env setup into vi.hoisted() which runs before any import."
    - "Rule 1 (bug): pre-existing pollution of ./data/docflow.db with a stale skill row (id='skill-system-catpaw-protocol-v1' name='Duplicate attempt') from an earlier RED run that happened before DATABASE_PATH isolation. Cleaned the row via `node -e Database().prepare().run()`, then tests pass cleanly. Tests now use shared temp dir for both DBs so this cannot recur."
    - "Rule 3 (blocking): catbot-prompt-assembler.test.ts knowledge-tree updated_at mismatch — _index.json tracks updated_at per area and knowledge-tree.test.ts asserts they match the individual JSON files. Bumped catboard.json, catpaw.json, _index.json all to 2026-04-11 in a single coordinated edit."

  asked:
    - none

requirements-completed: [LEARN-01, LEARN-02, LEARN-03, LEARN-04, LEARN-08]

duration: ~25min
completed: 2026-04-11
tests:
  new_passing: 23
  regression_suite: 758/766 (7 pre-existing failures in task-scheduler.test.ts + catbot-holded-tools.test.ts — out of scope, not introduced by this plan)
commits:
  - 44e1dda test(137-03): RED — user_interaction_patterns schema + CatPaw protocol skill seed failing tests
  - 3d93b1c feat(137-03): GREEN — user_interaction_patterns schema + CatPaw protocol skill seed
  - 8612473 test(137-03): RED — LEARN-02/04/08 prompt injection + catbot-tools pattern tools failing tests
  - d234148 feat(137-03): GREEN — LEARN-02/04 prompt injection + LEARN-03/08 catbot-tools + knowledge tree
---

# Phase 137 Plan 03: CatBot Intelligence Summary

**System skill 'Protocolo de creacion de CatPaw' + per-user interaction patterns memory + LEARN-08 oracle tool — CatBot now follows a 5-step protocol before creating CatPaws, remembers user preferences across turns via user_interaction_patterns, and can self-verify complexity pipeline success rates.**

## What shipped

### LEARN-01 — system skill seed
`skills` table in docflow.db gains a canonical row `id='skill-system-catpaw-protocol-v1'`, `category='system'`, `name='Protocolo de creacion de CatPaw'`. Instructions contain the 5 PASOs (funcion -> skills -> conectores -> system prompt ROL/MISION/PROCESO/CASOS/OUTPUT -> plan de aprobacion). Idempotent seed via `INSERT OR IGNORE` with a deterministic id — safe on every container boot and in every test run.

### LEARN-02 — unconditional prompt injection
`PromptAssembler.build()` now pushes a P1 section `## Protocolo obligatorio: creacion de CatPaw` on every turn, pulling the skill instructions via `getSystemSkillInstructions('Protocolo de creacion de CatPaw')`. Priority P1 means the section is never truncated by Pro/Elite budgets and only truncated in Libre tier if strictly over-budget (rare). The skill is ALWAYS visible to CatBot — it does not rely on intent detection before prompt assembly.

### LEARN-03 — user_interaction_patterns table
New table in catbot.db:
```sql
CREATE TABLE IF NOT EXISTS user_interaction_patterns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  pattern_type TEXT NOT NULL,
  pattern_key TEXT NOT NULL,
  pattern_value TEXT NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 1,
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_user_patterns_user ON user_interaction_patterns(user_id);
CREATE INDEX idx_user_patterns_type ON user_interaction_patterns(user_id, pattern_type);
```
Helpers exported from `catbot-user-profile.ts`: `getUserPatterns(userId, limit=10)` (ORDER BY confidence DESC, last_seen DESC) and `writeUserPattern({ user_id, pattern_type, pattern_key, pattern_value, confidence })`.

### LEARN-04 — automatic prompt personalization
`PromptAssembler.build()` pushes a P2 section `## Preferencias observadas del usuario` when `ctx.userId` has ≥1 pattern. Format: `- [pattern_type] pattern_key: pattern_value (confianza N)`. Top 10 by confidence. Scoped strictly by user_id — no cross-user leak. Section absent if user has no patterns (no empty placeholder).

### LEARN-08 oracle — get_complexity_outcome_stats tool
New readonly always-allowed tool that aggregates `complexity_decisions.outcome` over a configurable window (default 30 days, clamped [1,365]). Returns:
```json
{
  "window_days": 30,
  "total": 42,
  "completed": 30,
  "failed": 5,
  "timeout": 3,
  "pending": 4,
  "success_rate": 0.714
}
```
This is the CatBot-oracle counterpart for LEARN-08 (closed in plan 137-02): CatBot can now answer "¿que porcentaje de peticiones complex completan con exito?" without leaving the conversation.

### CatBot tools — 4 new
| Tool                         | Permission                | Scope         |
|------------------------------|---------------------------|---------------|
| list_user_patterns           | always_allowed            | user-scoped   |
| write_user_pattern           | manage_user_patterns (new)| user-scoped   |
| get_user_patterns_summary    | always_allowed            | user-scoped   |
| get_complexity_outcome_stats | always_allowed            | global oracle |

The 3 user-scoped tools were added to `USER_SCOPED_TOOLS` in `executeTool` so `ctx.userId` is auto-injected into args, and cross-user access without sudo returns `SUDO_REQUIRED`. `get_complexity_outcome_stats` is intentionally NOT user-scoped — it answers a system-level pipeline health question.

### Knowledge tree updates (per CLAUDE.md)
- **catboard.json**: added 4 new tools, 3 new concepts (user_interaction_patterns, Protocolo de creacion de CatPaw, complexity_decisions.outcome), 2 howtos, 1 dont, 1 success_case, new sources, updated_at=2026-04-11
- **catpaw.json**: added concept for the protocol, new howto for CatBot-driven CatPaw creation, 2 new common_errors (one for INC-12 closure, one for missing protocol), new source, updated_at=2026-04-11
- **_index.json**: bumped catboard/catpaw updated_at to 2026-04-11 to keep knowledge-tree.test.ts invariant

## Tests

All new tests green:

| File                                           | Tests | Coverage                                                                          |
|------------------------------------------------|------:|-----------------------------------------------------------------------------------|
| catbot-user-patterns.test.ts                   |     8 | Schema + indexes + insert/read + seed + idempotence + cross-db sanity             |
| catbot-prompt-assembler.test.ts (extended)     |    14 | LEARN-02 injection + LEARN-04 injection + LEARN-08 helper + knowledge-tree asserts |
| catbot-tools-user-patterns.test.ts             |     9 | executeTool for 4 new tools + permission gate (6 gate tests)                      |

**Regression suite:** 758/766 passing. The 7 failures that remain (task-scheduler 5, catbot-holded-tools 2) were pre-existing before this plan started and are out of scope — they concern infrastructure that this plan does not touch. Logged as deferred but not triaged here.

## CatBot oracle self-verification (CLAUDE.md protocol)

This plan closes LEARN-08's CatBot-oracle loop: CatBot can now run `get_complexity_outcome_stats` directly and answer success-rate questions using real data from `complexity_decisions.outcome`. After docker rebuild, the following prompts will exercise the full chain:

1. `"¿que patterns tienes registrados sobre mi?"` → CatBot calls `list_user_patterns` → returns current user's rows.
2. `"crea un CatPaw para redactar emails comerciales"` → CatBot reads the injected Protocolo section → presents 5-step plan → waits approval → only then calls `create_cat_paw`.
3. `"¿que porcentaje de peticiones complex estan completando con exito?"` → CatBot calls `get_complexity_outcome_stats(30)` → replies with the real histogram.

These are the 3 CatBot-as-oracle prompts from `<verification>` step 4–6 of the plan; they require a running container (post-rebuild) and are checked in Phase 137 integration, not here.

## Deferred / out of scope

- 7 pre-existing test failures (task-scheduler, catbot-holded-tools) — NOT introduced by this plan, logged for future triage.
- UI for managing patterns: no Settings panel or CatPower page was added. Users see patterns indirectly via CatBot's personalized responses and can inspect them via `list_user_patterns`. Admin-facing UI is Phase 137-04 or later.
- Auto-detection of patterns from tool-call history (zero-cost extraction in the style of `extractPreferencesFromTools`): NOT implemented here. This plan wires the substrate (table + tools + prompt injection); future plans can fill the table programmatically.

## Self-Check: PASSED

All claimed artifacts verified on disk:
- `app/src/lib/__tests__/catbot-user-patterns.test.ts` FOUND
- `app/src/lib/__tests__/catbot-tools-user-patterns.test.ts` FOUND
- `app/src/lib/catbot-db.ts` modified (user_interaction_patterns CREATE TABLE present)
- `app/src/lib/db.ts` modified (skill-system-catpaw-protocol-v1 seed present)
- `app/src/lib/services/catbot-user-profile.ts` modified (4 new exports)
- `app/src/lib/services/catbot-prompt-assembler.ts` modified (buildCatPawProtocolSection + buildUserPatternsSection)
- `app/src/lib/services/catbot-tools.ts` modified (4 tools + permission gate + USER_SCOPED_TOOLS)
- `app/data/knowledge/catboard.json` + `catpaw.json` + `_index.json` modified

All commits present in git log (verified via `git log --oneline`):
- 44e1dda — RED test 1
- 3d93b1c — GREEN task 1
- 8612473 — RED test 2
- d234148 — GREEN task 2

Regression gate: `npx vitest run catbot-prompt-assembler catbot-tools-user-patterns catbot-user-patterns knowledge-tree` → **107/107 passed**.
