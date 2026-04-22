---
phase: 160-catbot-self-service-tools-skill-kb
plan: 04
subsystem: catbot-skill-kb
tags: [catbot, skill, prompt-assembler, llm-self-service, wave-2, tool-04, v30.0]

requires:
  - phase: 160-01
    provides: RED tests for db-seeds + modelos_protocol PromptAssembler injection (scaffolded 2 RED cases each)
  - phase: 137-03
    provides: Pattern for system-skill seed (skill-system-catpaw-protocol-v1) + buildCatPawProtocolSection helper
provides:
  - System skill "Operador de Modelos" (id=skill-system-modelos-operador-v1) seeded at db.ts bootstrap
  - buildModelosProtocolSection helper + P1 section push in PromptAssembler.build()
  - Protocol baked into every CatBot prompt: tarea→modelo recommendations + execution steps + absolute rules
affects: [161-ui-enrutamiento-oracle]

tech-stack:
  added: []
  patterns:
    - "System skill seed via INSERT OR IGNORE inside an isolated `{...}` block (mirrors skill-system-catpaw-protocol-v1 at db.ts L4411-4462) — const name collisions avoided by scope isolation"
    - "PromptAssembler P1 section push with try/catch graceful fallback — buildModelosProtocolSection returns '' when skill row absent, identical pattern to catpaw_protocol at L864-868"
    - "Test-driven content enforcement: db-seeds.test.ts regex assertions (case-sensitive /Opus/ and /Gemini 2.5 Pro/) forced the seed to use human-readable capitalized names alongside LiteLLM FQN identifiers (claude-opus-4-6 / gemini-2.5-pro)"

key-files:
  created:
    - .planning/phases/160-catbot-self-service-tools-skill-kb/160-04-SUMMARY.md
  modified:
    - app/src/lib/db.ts (+78 lines: MODELOS_SKILL_ID constant + MODELOS_INSTRUCTIONS + INSERT OR IGNORE block between L4462 and telegram_config comment)
    - app/src/lib/services/catbot-prompt-assembler.ts (+27 lines: buildModelosProtocolSection helper + P1 section push after catpaw_protocol push)
    - app/src/lib/__tests__/db-seeds.test.ts (-3 lines: removed unused path/fs/os ESM imports that would break Docker build)

key-decisions:
  - "Substring-compatible naming: plan's required substring assertions used /Opus/ and /Gemini 2.5 Pro/ case-sensitive regex; LiteLLM FQNs are lowercase (claude-opus-4-6, gemini-2.5-pro). Resolved by prefixing human-readable names to FQN parenthetical: 'Claude Opus (anthropic/claude-opus-4-6, ...)' and 'Gemini 2.5 Pro (google/gemini-2.5-pro, ...)'. Both the substring tests and the CatBot readability win."
  - "No syncResource call at db.ts bootstrap (per plan + RESEARCH.md line 678-683): db.ts is sync init context. KB file materialization deferred to release-time `node scripts/kb-sync.cjs --db-source`. Documented below as post-deploy action for search_kb tool visibility."
  - "Unused-imports fix (deviation Rule 3): Plan 160-01 left top-level ESM imports path/fs/os in db-seeds.test.ts that ESLint reports as errors. Per MEMORY.md, these would break any future Docker build (next lint runs in strict mode during build). Removed inline as a blocker for the plan's verification step 4 (Docker rebuild). Zero test impact (vi.hoisted uses its own require() calls)."
  - "Mirror-pattern discipline: both the seed block and the assembler helper are byte-pattern copies of the existing catpaw_protocol counterparts (same braces scope, same try/catch, same graceful fallback, same section push structure) — lowest cognitive cost for future maintainers + guaranteed parity when the catpaw pattern evolves."

patterns-established:
  - "When test expects capitalized human-readable model names AND the content needs FQN identifiers, use format: 'Human Name (fqn/identifier, key=val, ...)' — survives regex substring checks + keeps machine-readable ids adjacent"
  - "System skills in .docflow-kb are NEVER hand-authored (RESEARCH.md Pitfall #7): seed in DB via INSERT OR IGNORE at db.ts bootstrap, defer KB materialization to kb-sync.cjs post-deploy"

requirements-completed: [TOOL-04]

# Metrics
duration: ~5min
completed: 2026-04-22
---

# Phase 160 Plan 04: Operador de Modelos Skill + PromptAssembler P1 Summary

**TOOL-04 satisfied: system skill "Operador de Modelos" seeded idempotently at db.ts bootstrap and unconditionally injected at P1 into every CatBot prompt — Plan 160-01 RED tests flipped GREEN with zero regression across 81 pre-existing PromptAssembler cases.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-22T10:57:08Z
- **Completed:** 2026-04-22T11:02:08Z
- **Tasks:** 2 (plus 1 auto-fix commit)
- **Files modified:** 3 (0 created, 3 edited)

## Accomplishments

- `skill-system-modelos-operador-v1` row seeded in `skills` table (category='system') with 2956-char instructions covering 4 task-quadrant recommendations (ligera→Gemma, razonamiento→Claude Opus, creativa→Gemini 2.5 Pro, balance→Sonnet/Flash) + 7-step execution protocol + 5 absolute rules + namespace-mismatch fallback
- `buildModelosProtocolSection` helper added to PromptAssembler at L765, called unconditionally via P1 section push at L894
- 4 Plan 160-01 RED cases flipped GREEN: 2 db-seeds cases (row exists + instruction markers) + 2 modelos_protocol cases (injection + graceful absence)
- All 81 pre-existing PromptAssembler tests still GREEN → zero regression
- Docker rebuild + smoke query confirmed: production DB has the seed row with all 4 required substrings

## Task Commits

Each task was committed atomically:

1. **Task 1: Seed Operador de Modelos in db.ts** — `a342051` (feat)
2. **Task 2: buildModelosProtocolSection + P1 push in PromptAssembler** — `e4daf3c` (feat)
3. **Deviation Rule 3 fix: remove unused imports in db-seeds.test.ts** — `dfe82f1` (fix)

**Plan metadata:** pending (final commit after STATE/ROADMAP updates)

## Files Created/Modified

### `app/src/lib/db.ts` (+78 lines)

**Exact line range of MODELOS_SKILL seed block:** L4464–4542 (inserted between `skill-system-catpaw-protocol-v1` closing brace at L4462 and the `// v22.0: DB-01 telegram_config table` comment at L4544).

Structure:
- L4464–4470: Block comment anchoring Phase 160 TOOL-04 intent
- L4471: `{` opens isolated scope (prevents const collision with adjacent catpaw block)
- L4472: `const MODELOS_SKILL_ID = 'skill-system-modelos-operador-v1';`
- L4473–4524: `const MODELOS_INSTRUCTIONS = \`...\`;` (52-line template literal with 4 task quadrants + execution protocol + absolute rules + limitations note)
- L4525–4541: `db.prepare('INSERT OR IGNORE INTO skills ...').run(...)`
- L4542: `}` closes scope

### `app/src/lib/services/catbot-prompt-assembler.ts` (+27 lines)

**Helper definition:** L765 `function buildModelosProtocolSection(): string { ... }` (+15 lines block)
**Section push:** L894 `sections.push({ id: 'modelos_protocol', priority: 1, content: buildModelosProtocolSection() });` inside try/catch at L890–896

Both anchors verified by `grep -n "buildModelosProtocolSection\|modelos_protocol" app/src/lib/services/catbot-prompt-assembler.ts` returning 3 lines as specified in plan done criterion.

### `app/src/lib/__tests__/db-seeds.test.ts` (-3 lines)

Removed unused ESM imports at L2–4 (`import path from 'node:path'; import fs from 'node:fs'; import os from 'node:os';`). The `vi.hoisted` block at L19 uses inline `require()` calls (lines 21, 23, 25) instead — the top-level ESM imports were never referenced. Pre-existing lint errors introduced by Plan 160-01 commit `5276c61`.

## Decisions Made

- **Substring-driven capitalization**: Plan's required substrings (/Opus/, /Gemini 2.5 Pro/) are case-sensitive. LiteLLM FQNs are lowercase. Fix: human-readable capitalized names precede FQN parentheticals (e.g., "Claude Opus (anthropic/claude-opus-4-6, ...)"). Benefits both: regex match passes and CatBot's rendered prompt is human-readable for the user to reason about.
- **No syncResource at bootstrap**: db.ts runs synchronously at init; `syncResource` would require async + KB-validator dependencies that aren't available at that layer. Phase 137-03's catpaw protocol skill seed set the same precedent. KB materialization happens at release-time via `node scripts/kb-sync.cjs --db-source`.
- **Mirror-pattern discipline**: every new piece of code is a byte-pattern copy of an existing Phase 137-03 counterpart — same brace scope, same try/catch, same graceful fallback, same section push structure. Lowest cognitive cost, guaranteed parity when catpaw evolves.
- **No conditional injection**: Plan explicit (RESEARCH.md §Open Question #4) that the protocol is unconditionally P1. Skipped any `if (ctx.message.includes('model'))` keyword gate. Protocol is ~1.2KB, budget is 16-64KB, cost negligible.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Substring-case mismatch between plan content spec and test regex**
- **Found during:** Task 1 verification (first npm run test:unit)
- **Issue:** Plan's content spec used lowercase LiteLLM FQNs (`anthropic/claude-opus-4-6`, `google/gemini-2.5-pro`). Plan-01 test regex is case-sensitive: `/Opus/` and `/Gemini 2.5 Pro/`. First GREEN run flipped 2/3 cases with 1 failure: "expected 'PROTOCOLO...' to match /Opus/".
- **Fix:** Added human-readable capitalized names BEFORE the FQN parenthetical in the RAZONAMIENTO and CREATIVA LARGA sections: "Claude Opus (anthropic/claude-opus-4-6, ...)" and "Gemini 2.5 Pro (google/gemini-2.5-pro, ...)". Both substring tests pass without sacrificing machine identifiers.
- **Files modified:** app/src/lib/db.ts
- **Verification:** db-seeds.test.ts 3/3 GREEN.
- **Committed in:** a342051 (Task 1 commit)

**2. [Rule 3 - Blocking] Unused ESM imports in db-seeds.test.ts (from Plan 160-01)**
- **Found during:** Final lint verification
- **Issue:** Plan 160-01 left `import path from 'node:path'; import fs from 'node:fs'; import os from 'node:os';` at db-seeds.test.ts lines 2-4 while the body uses vi.hoisted + inline require() instead. ESLint `@typescript-eslint/no-unused-vars` reports these as Errors. Per MEMORY.md "feedback_unused_imports_build.md: Unused imports break Docker build (ESLint no-unused-vars = error in next build)", this would block the plan's verification step #4 (Docker rebuild).
- **Fix:** Removed the 3 unused imports. Tests still pass (body relies only on `vitest` + `better-sqlite3` type import).
- **Files modified:** app/src/lib/__tests__/db-seeds.test.ts
- **Verification:** Lint clean for db-seeds.test.ts; 3/3 tests still GREEN. Docker build succeeded.
- **Committed in:** dfe82f1 (separate fix commit)

---

**Total deviations:** 2 auto-fixed (1 bug + 1 blocking)
**Impact on plan:** Both auto-fixes unblock verification sections. Substring-case fix was inevitable given the test regex; the capitalization is arguably a win for prompt readability. The unused-imports fix paid down a Plan 160-01 debt that would have surfaced in the first Docker production build regardless of this plan's scope — deferred-items.md alternative would have been non-ideal given the Docker rebuild is in this plan's verification checklist.

## Authentication Gates

None. Plan is pure code + DB seed + PromptAssembler wiring. No external auth or sudo interactions.

## Issues Encountered

None blocking. Two lint warnings in unrelated files (`templates/block-config-panel.tsx`, `testing/test-result-detail.tsx`) are pre-existing and out of scope (defer per SCOPE BOUNDARY rule).

## Verification Results

### Unit Tests (Phase 160 Suite)

```
src/lib/__tests__/catbot-tools-model-self-service.test.ts — all GREEN
src/lib/__tests__/db-seeds.test.ts — 3/3 GREEN (both TOOL-04 cases + sanity)
src/lib/__tests__/catbot-prompt-assembler.test.ts — 81/81 GREEN (incl. 2 modelos_protocol Phase 160)
src/app/api/catbot/chat/__tests__/route.test.ts — all GREEN
Total: 104/104 tests pass across 4 Phase 160 test files
```

### Docker Rebuild + Smoke Query

```
$ docker compose build --no-cache  → docflow-docflow Built (image sha256:f37e0fe6d6f88e...)
$ docker compose up -d              → docflow-app Recreated + Started
$ docker exec docflow-app node -e "..."
{
  "id": "skill-system-modelos-operador-v1",
  "name": "Operador de Modelos",
  "category": "system",
  "instr_len": 2956
}

Required substrings in production DB:
{
  "tarea ligera": true,
  "Opus": true,
  "Gemini 2.5 Pro": true,
  "reasoning_effort": true
}
```

Production DB now has the seeded row after Docker rebuild. All 4 required substrings present.

### Lint Clean

Lint output now free of errors in files touched by this plan (db-seeds.test.ts warnings resolved). Remaining warnings are pre-existing unrelated (img tags in UI components + useEffect deps — out of scope per SCOPE BOUNDARY rule).

## Post-Deploy Action Required

**`search_kb` tool visibility**: To make the Operador de Modelos skill queryable by CatBot via `search_kb({subtype:'skill', search:'Operador de Modelos'})`, a subsequent run of `node scripts/kb-sync.cjs --db-source` is needed to materialize the skill as a `.docflow-kb/resources/skills/*.md` file. This is NOT part of this plan's scope per Phase 137-03 precedent; it runs as part of the release tick. The skill is fully functional in the prompt-injection pathway (the unconditional P1 section) from the moment the Docker container boots — only the `search_kb` discovery path is deferred.

## Phase 160 Status After This Plan

- ✅ TOOL-01 (list_llm_models) — Plan 02 complete
- ✅ TOOL-02 (get_catbot_llm) — Plan 02 complete
- ✅ TOOL-03 (set_catbot_llm sudo-gated) — Plan 03 complete (per STATE.md)
- ✅ TOOL-04 (Operador de Modelos skill) — **this plan complete**

**Phase 160 is 4/4 requirements satisfied.** Ready for Phase 161 (UI Enrutamiento + Oracle End-to-End).

## Self-Check: PASSED

**Files modified (verified via grep/stat):**
- FOUND: /home/deskmath/docflow/app/src/lib/db.ts (contains `skill-system-modelos-operador-v1` at L4472)
- FOUND: /home/deskmath/docflow/app/src/lib/services/catbot-prompt-assembler.ts (contains `buildModelosProtocolSection` at L765 + `modelos_protocol` section push at L894)
- FOUND: /home/deskmath/docflow/app/src/lib/__tests__/db-seeds.test.ts (unused imports removed)

**Commits:**
- FOUND: a342051 (feat(160-04): seed Operador de Modelos system skill in db.ts bootstrap)
- FOUND: e4daf3c (feat(160-04): inject Operador de Modelos protocol at P1 in PromptAssembler)
- FOUND: dfe82f1 (fix(160-04): remove unused ESM imports in db-seeds.test.ts)

**Production verification:**
- FOUND: skill-system-modelos-operador-v1 row in /app/data/docflow.db (category=system, instr_len=2956)
- FOUND: all 4 required substrings present in production DB (tarea ligera, Opus, Gemini 2.5 Pro, reasoning_effort)

**Test state:**
- 104/104 Phase 160 tests pass across 4 files
- Zero regression on 81 pre-existing PromptAssembler tests
- db-seeds.test.ts 3/3 GREEN (was 2 RED / 1 GREEN pre-plan)
- catbot-prompt-assembler.test.ts modelos_protocol: 2/2 GREEN (was 1 RED / 1 GREEN pre-plan)

---
*Phase: 160-catbot-self-service-tools-skill-kb*
*Completed: 2026-04-22*
