---
phase: 155-kb-cleanup-final
plan: 02
subsystem: infra
tags: [knowledge-base, cleanup, deletion, kb-migration, docker]

requires:
  - phase: 155-kb-cleanup-final
    plan: 01
    provides: "canvas-rules.ts KB-backed loader reading from .docflow-kb/rules/ — prerequisite for deleting app/data/knowledge/canvas-*.md"
  - phase: 152-kb-catbot-consume
    provides: "kb-index-cache.ts search_kb + get_kb_entry tools — canonical replacements for query_knowledge/explain_feature"
  - phase: 151-kb-migrate-static-knowledge
    provides: "redirect stubs prepended to legacy files — absorbed by full delete"
provides:
  - "Legacy knowledge tree physically absent: app/data/knowledge/ + .planning/knowledge/ + skill_orquestador_catbot_enriched.md + app/src/lib/knowledge-tree.ts + 4 test files + 1 UI tab + 1 API route"
  - "Zero runtime references to loadKnowledgeArea/getAllKnowledgeAreas/knowledge-tree/query_knowledge/explain_feature/ConceptItemSchema/KnowledgeEntrySchema/TabKnowledgeTree in app/src/"
  - "Slim Dockerfile + 2-line docker-entrypoint.sh"
  - "CLAUDE.md reduced from 80 → 46 lines with .docflow-kb/_manual.md pointer"
  - ".planning/Index.md slimmed (Catalogos de Conocimiento section removed)"
affects: [phase-155-plan-03, phase-155-plan-04]

tech-stack:
  added: []
  patterns:
    - "Atomic big-commit pattern: physical deletion + code sweep + test rewrites + Docker/entrypoint/CLAUDE.md + Index.md land in a single wave because TS compile + vitest + Docker build all depend on both sides of the legacy/KB boundary"
    - "Grep-invariant self-gate: 15+ banned symbols (loadKnowledgeArea, getAllKnowledgeAreas, knowledge-tree, query_knowledge, explain_feature, ConceptItemSchema, KnowledgeEntrySchema, stringifyConceptItem, mapConceptItem, renderConceptItem, formatKnowledgeForPrompt, formatKnowledgeAsText, formatKnowledgeResult, scoreKnowledgeMatch, getPageKnowledge, PAGE_TO_AREA, TabKnowledgeTree, data-seed/knowledge) must not appear in any import/call/type-ref in app/src/"

key-files:
  created: []
  modified:
    - "app/src/lib/services/catbot-tools.ts"
    - "app/src/lib/services/catbot-prompt-assembler.ts"
    - "app/src/lib/services/catbot-user-profile.ts"
    - "app/src/lib/services/catpaw-gmail-executor.ts"
    - "app/src/lib/services/catpaw-drive-executor.ts"
    - "app/src/app/api/catbot/search-docs/route.ts"
    - "app/src/components/settings/catbot-knowledge/catbot-knowledge-shell.tsx"
    - "app/src/lib/__tests__/catbot-tools-retry-job.test.ts"
    - "app/src/lib/__tests__/catbot-learned.test.ts"
    - "app/src/lib/__tests__/canvas-tools-fixes.test.ts"
    - "app/src/lib/__tests__/catbot-intents.test.ts"
    - "app/src/lib/__tests__/intent-jobs.test.ts"
    - "app/src/lib/__tests__/catbot-knowledge-gap.test.ts"
    - "app/src/lib/__tests__/catbot-tools-user-patterns.test.ts"
    - "app/src/lib/__tests__/catbot-prompt-assembler.test.ts"
    - "app/src/lib/__tests__/catpaw-gmail-executor.test.ts"
    - "app/src/lib/__tests__/intent-job-executor-proposal.test.ts"
    - "app/docker-entrypoint.sh"
    - "app/Dockerfile"
    - "CLAUDE.md"
    - ".planning/Index.md"
  deleted:
    - "app/data/knowledge/ (9 JSON + 2 md = 11 files)"
    - ".planning/knowledge/ (12 md files)"
    - "skill_orquestador_catbot_enriched.md"
    - "app/src/lib/knowledge-tree.ts"
    - "app/src/lib/__tests__/knowledge-tree.test.ts"
    - "app/src/lib/__tests__/knowledge-tools-sync.test.ts"
    - "app/src/lib/__tests__/catbot-tools-query-knowledge.test.ts"
    - "app/src/lib/__tests__/canvas-rules-scope.test.ts"
    - "app/src/app/api/catbot/knowledge/tree/ (route.ts)"
    - "app/src/components/settings/catbot-knowledge/tab-knowledge-tree.tsx"

key-decisions:
  - "search-docs/route.ts KEPT (not deleted) — still serves PROJECT/STATE/ROADMAP/Index top-level planning + Progress sessions + codebase + MCP docs; only .planning/knowledge/ subpath removed from DOC_PATHS + LOCAL_DOC_PATHS"
  - "catbot-user-profile.ts explain_feature heuristic replaced with search_kb count (≥3 searches → 'learning' style) instead of dropping the metric — keeps LEARN-04 signal alive while migrating to the KB tool surface"
  - "Test files with dead vi.mock('@/lib/knowledge-tree') blocks had the 3-line mock removed inline (7 files); no entire test file deleted in Task 2 — Task 1 already handled the 4 files where the subject disappeared"
  - "catbot-prompt-assembler.test.ts KPROTO assertions rewritten to assert search_kb before search_documentation (new primary → legacy fallback chain) plus a negative-assertion block ('result').not.toContain('query_knowledge')/('explain_feature') — future-proofs the cleanup"
  - "catpaw-gmail-executor.test.ts Test 9/9b (INC-11/INC-12 catalog gates) collapsed into a single KB protocol existence check that skips gracefully if the atom hasn't landed yet — avoids false red while Plan 03 wires up the atom"
  - "intent-job-executor-proposal.test.ts Test 9 (catboard.json LEARN-07 documentation gate) deleted — legacy documentation concern, LEARN-07 proposals are functional-tested elsewhere"
  - "catbot-learned.test.ts 'query_knowledge learned entries behavior' describe block renamed to 'learned entries retrieval behavior' — tests still cover DB-layer behavior consumed by admin tools and future KB-integrated retrievers, just without the dead tool naming"
  - "Dockerfile COPY of /app/data/knowledge → /app/data-seed/knowledge deleted entirely, not guarded — the builder stage no longer has the source dir after Task 1 so the COPY would fail; entrypoint seed block also removed (2-line entrypoint)"
  - "CLAUDE.md §'Protocolo de Testing: CatBot como Oráculo' kept byte-identical (lines 3-27); §'Protocolo de Documentación' + §'Documentación de referencia' + §'Restricciones absolutas' collapsed to a single 22-line .docflow-kb pointer"
  - ".planning/Index.md §Catalogos de Conocimiento removed entirely (12 links dead); KB intro slimmed to 2-line _manual.md pointer"

patterns-established:
  - "Phase 155 cleanup commit pattern: `chore(155-02): delete …` for file removals + `refactor(155-02): …` for code sweeps — avoids squashing delete churn with substantive code changes in one commit"

requirements-completed: [KB-30, KB-31, KB-32, KB-33]

duration: ~11min
completed: 2026-04-20
---

# Phase 155 Plan 02: Legacy Knowledge Layer Deletion Summary

**Physically deleted 31 legacy files (app/data/knowledge/ + .planning/knowledge/ + skill root + knowledge-tree.ts + 4 tests + 1 UI tab + 1 API route), removed 40+ code consumers across 21 files, slimmed Dockerfile + docker-entrypoint.sh, reduced CLAUDE.md from 80→46 lines — all in 2 atomic commits. Vitest: 1001 passed, 10 pre-existing orthogonal reds unchanged. Docker build exit 0.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-04-20T17:25:03Z
- **Completed:** 2026-04-20T17:37:02Z (approx)
- **Tasks:** 3 (2 implementation + 1 verification)
- **Files deleted:** 31 (via git rm)
- **Files modified:** 21 (via code sweep)
- **Net line delta:** -7964 (deletions) + -427 (code sweep) = -8391 lines removed

## Accomplishments

- **Task 1 (commit `159f82a`):** `git rm` removed 31 legacy files
  - `app/data/knowledge/` (11 files: canvas/catboard/catbrains/catpaw/catflow/catpower/settings JSONs + _index + _template + canvas-nodes-catalog.md + canvas-rules-index.md)
  - `.planning/knowledge/` (12 files: all catalogs + user-guide + model-onboarding + mejoras-sistema-modelos + incidents-log + holded-mcp-api + proceso-catflow-revision-inbound + connector-logs-redaction-policy + canvas-nodes-catalog)
  - `skill_orquestador_catbot_enriched.md` (root)
  - `app/src/lib/knowledge-tree.ts` + 4 test files
  - `app/src/app/api/catbot/knowledge/tree/` (route + dir)
  - `app/src/components/settings/catbot-knowledge/tab-knowledge-tree.tsx`
- **Task 2 (commit `5b3ce16`):** Surgical code sweep (40+ edit points across 21 files)
  - `catbot-tools.ts`: -1 import, -2 TOOLS[] entries (explain_feature + query_knowledge), -4 helper functions (mapConceptItem, scoreKnowledgeMatch, formatKnowledgeResult, formatKnowledgeAsText), -2 case blocks, -3 unused catbot-db imports (getLearnedEntries, incrementAccessCount, promoteIfReady), -1 always-allowed list entry
  - `catbot-prompt-assembler.ts`: -1 import, -1 const (PAGE_TO_AREA), -3 functions (renderConceptItem, formatKnowledgeForPrompt, getPageKnowledge, buildPlatformOverview), -2 sections (page_knowledge, platform_overview), rewritten buildKnowledgeProtocol, rewritten buildToolInstructions (no explain_feature), updated buildReasoningProtocol (no query_knowledge), updated buildCanvasProtocols (updated search_documentation wording)
  - `catbot-user-profile.ts`: explain_feature heuristic → search_kb count heuristic
  - `catpaw-{gmail,drive}-executor.ts`: repoint redaction comment to `.docflow-kb/protocols/connector-logs-redaction.md`
  - `search-docs/route.ts`: removed `.planning/knowledge/` from DOC_PATHS + LOCAL_DOC_PATHS; kept top-level + Progress + codebase + MCP
  - `catbot-knowledge-shell.tsx`: removed TabKnowledgeTree import, tab, render case
  - 7 test files: removed dead `vi.mock('@/lib/knowledge-tree', …)` blocks (3 lines each)
  - `catbot-prompt-assembler.test.ts`: KPROTO rewrites + deleted Knowledge tree documentation describe block
  - `catpaw-gmail-executor.test.ts`: INC-11/INC-12 catalog gates → KB protocol existence gate
  - `intent-job-executor-proposal.test.ts`: deleted Test 9 catboard.json gate
  - `catbot-knowledge-gap.test.ts`: deleted knowledge-tools-sync describe block
  - `catbot-learned.test.ts`: renamed query_knowledge describe to learned entries retrieval
  - `docker-entrypoint.sh`: 12 → 2 lines
  - `Dockerfile`: removed COPY of /app/data/knowledge (and comment line)
  - `CLAUDE.md`: 80 → 46 lines with .docflow-kb pointer
  - `.planning/Index.md`: dropped §Catalogos de Conocimiento; slimmed KB intro
- **Task 3 (verification-only, no commit):**
  - Docker build exit 0 (all stages green)
  - Vitest full suite: 1001 passed + 10 pre-existing orthogonal reds unchanged
  - CLAUDE.md: 46 lines ≤55 target
  - CLAUDE.md: 0 'knowledge tree' string matches
  - CLAUDE.md: 5 `.docflow-kb` references (target ≥3)
  - Grep invariant sweep: 0 active consumers in app/src for 15+ banned symbols (only explanatory comments + negative-assertion tests remain)

## Task Commits

1. **Task 1: Physical deletion of 31 legacy files** — `159f82a` (chore)
2. **Task 2: Code sweep + simplification** — `5b3ce16` (refactor)
3. **Task 3: Docker rebuild + verification gates** — no commit (read-only verification; all 6 gates green)

## Decisions Made

See frontmatter `key-decisions` for the full list. Highlights:

- **search-docs route kept, not deleted** — still covers PROJECT/STATE/ROADMAP/Index + Progress sessions + codebase + MCP docs. Only the `.planning/knowledge/` subpath (now absent) removed from DOC_PATHS.
- **catbot-user-profile.ts explain_feature heuristic replaced, not dropped** — `searchKbCount >= 3` → 'learning' style. Preserves LEARN-04 signal while migrating to the KB surface.
- **Test-level damage controlled, not amplified** — 5 existing test files (not deleted in Task 1) had their 3-line `vi.mock('@/lib/knowledge-tree', …)` blocks surgically removed inline. No whole-test-file deletion in Task 2.
- **Negative-assertion tests added** — `catbot-prompt-assembler.test.ts` gains `not.toContain('query_knowledge')` and `not.toContain('explain_feature')` to future-proof the cleanup against accidental reintroduction.
- **CLAUDE.md §Protocolo de Testing kept byte-identical** — per plan spec; only the knowledge-tree-related sections rewritten.
- **Dockerfile COPY deleted, not no-op-guarded** — the source dir doesn't exist post-Task 1, so a guarded COPY would still fail; cleanest approach is delete.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] 3 test failures from test-level legacy catalog gates**
- **Found during:** Task 2 verification (first vitest run)
- **Issue:** After legacy catalog JSONs were deleted in Task 1, three tests still tried to `fs.readFileSync('app/data/knowledge/{catboard,catpaw,settings}.json')`:
  - `catbot-prompt-assembler.test.ts` Test "catboard.json lists the new tools and concepts"
  - `catbot-prompt-assembler.test.ts` Test "catpaw.json references the CatPaw creation protocol and INC-12 closure"
  - `catbot-knowledge-gap.test.ts` Test "settings.json tools[] includes log_knowledge_gap"
- **Fix:** Deleted the describe/it blocks entirely with inline Phase 155 comments. These were documentation-gate tests anchoring on the legacy catalog — they have no functional coverage equivalent in the KB world, and recreating them against `.docflow-kb/_index.json` would duplicate Phase 152 KB consume tests.
- **Files modified:** `app/src/lib/__tests__/catbot-prompt-assembler.test.ts`, `app/src/lib/__tests__/catbot-knowledge-gap.test.ts`
- **Verification:** 228/228 affected tests pass; 1001/1011 full suite (10 orthogonal reds unchanged).
- **Included in:** Task 2 commit `5b3ce16`

**Total deviations:** 1 auto-fixed (scope: 3 tests, zero production code churn)

**Impact on plan:** No scope creep. The fix amplifies the cleanup (+3 deleted tests) rather than restoring legacy dependencies.

## Issues Encountered

None blocking. Plan executed per spec; the only deviation was a predictable follow-on from Task 1 deletion (3 tests gating the deleted JSONs).

## Verification Evidence

### Task 1 Gate
```
$ test ! -d app/data/knowledge && test ! -d .planning/knowledge && test ! -f skill_orquestador_catbot_enriched.md && ... && echo OK
OK
$ git status --short | grep '^D' | wc -l
31
```

### Task 2 Gate
```
$ grep -rn 'loadKnowledgeArea\|getAllKnowledgeAreas\|getKnowledgeAreaById\|loadKnowledgeIndex\|KnowledgeEntrySchema\|ConceptItemSchema\|stringifyConceptItem\|mapConceptItem\|renderConceptItem\|formatKnowledgeForPrompt\|formatKnowledgeAsText\|formatKnowledgeResult\|scoreKnowledgeMatch\|getPageKnowledge\|PAGE_TO_AREA\|TabKnowledgeTree' app/src/
(no output)
```

Full vitest suite:
```
Test Files  3 failed | 58 passed (61)
Tests       10 failed | 1001 passed (1011)
```
Failing files: `task-scheduler.test.ts` (5), `alias-routing.test.ts` (3), `catbot-holded-tools.test.ts` (2). All documented in CONTEXT §deferred. Zero new failures attributable to Plan 02.

### Task 3 Gates
```
$ docker compose build docflow
... (all 30 stages green) ...
 docflow-docflow  Built

$ wc -l CLAUDE.md
46 CLAUDE.md

$ ! grep -i "knowledge tree" CLAUDE.md && echo 'PASS'
PASS

$ grep -c "\.docflow-kb" CLAUDE.md
5
```

## Test Outcomes

| Category | Count |
| --- | --- |
| Tests green (full suite) | 1001 |
| Tests newly green (migrated to Phase 155 wording) | 4 (KPROTO rewrites + 1 protocol-existence) |
| Tests deleted (Task 1) | ~25 spread across 4 test files (knowledge-tree.test.ts + knowledge-tools-sync.test.ts + catbot-tools-query-knowledge.test.ts + canvas-rules-scope.test.ts) |
| Tests deleted (Task 2 deviation) | 3 (catboard.json + catpaw.json + settings.json gates) |
| Tests deleted (Task 2 plan spec) | 2 (INC-11/INC-12 catpaw-gmail-executor catalog gates, LEARN-07 catboard.json gate in intent-job-executor-proposal) |
| Pre-existing orthogonal reds (unchanged) | 10 (5 task-scheduler + 3 alias-routing + 2 catbot-holded-tools) |
| New reds from Plan 02 | 0 |

## Docker Build Log Tail

```
#25 [runner 12/16] RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data
#25 DONE 0.1s
#26 [runner 13/16] RUN mkdir -p /tmp && chown nextjs:nodejs /tmp
#26 DONE 0.2s
...
#28 [runner 15/16] COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
#28 DONE 0.0s
#29 [runner 16/16] RUN chmod +x ./docker-entrypoint.sh
#29 DONE 0.1s
#30 exporting to image
#30 writing image sha256:36978681ac79c6ac1b949d3984d6311baa9a6e23670f0bea6c9225ef1adc7dfa done
 docflow-docflow  Built
```

## CLAUDE.md Before/After

| | Lines |
| --- | --- |
| Pre-Phase-155 (last commit: 75d7f97) | 80 |
| Post-Plan-155-02 | 46 |
| Delta | -34 lines (42.5% reduction) |

Sections byte-identical: §Protocolo de Testing: CatBot como Oráculo (lines 3-27 retained verbatim).
Sections removed: §Protocolo de Documentación: Knowledge Tree + CatBot (35 lines) + §Documentación de referencia (13 lines) + §Restricciones absolutas (5 lines).
Section added: §Documentación canónica (22 lines total) with `.docflow-kb/_manual.md` pointer + reference rutas + `search_kb({tags:["critical"]})` pointer for R26-R29.

## Known Gap Before Plan 03

`search_kb({tags:["critical"]})` returns **0 results** until Plan 03 creates R26-R29 atoms. This gap is documented in the plan `<interfaces>` block: "R26-R29 atoms do NOT exist yet — Plan 03 creates them. The CLAUDE.md pointer written in this plan is forward-referencing; post-Plan-03 merge, `search_kb({tags:["critical"]})` returns those 4 rules."

The gap window is ~1 plan boundary (acceptable within the phase).

## User Setup Required

None. Docker rebuild (already done as Task 3 gate) produced the post-Plan-02 image; no service config changes.

## CatBot Oracle Evidence

**Deferred to Plan 155-04** per CONTEXT §Commit Strategy. Plan 02 is primarily subtractive — the user-observable surface change is CatBot losing access to `query_knowledge` + `explain_feature` tools (expected + documented), compensated by existing `search_kb` + `get_kb_entry` (Phase 152). Functional parity is verified in Plan 04 oracle.

## Next Phase Readiness

- **Plan 03** (`155-03-PLAN.md`) can proceed immediately:
  - Task 1 deletions merged (no source-file ambiguity for R26-R29 creation)
  - Task 2 code sweep merged (catbot-tools.ts + catbot-prompt-assembler.ts are clean)
  - CLAUDE.md pointer `search_kb({tags:["critical"]})` is forward-referencing (Plan 03 creates R26-R29 with tag `critical`)
- **Plan 04** (oracle + backfill + final cleanup) waits for Plan 03 R26-R29 + Docker rebuild + backfill

## Self-Check: PASSED

**Files verified to be absent (Task 1):**
- MISSING (correctly): `app/data/knowledge/`
- MISSING (correctly): `.planning/knowledge/`
- MISSING (correctly): `skill_orquestador_catbot_enriched.md`
- MISSING (correctly): `app/src/lib/knowledge-tree.ts`
- MISSING (correctly): `app/src/lib/__tests__/knowledge-tree.test.ts`
- MISSING (correctly): `app/src/lib/__tests__/knowledge-tools-sync.test.ts`
- MISSING (correctly): `app/src/lib/__tests__/catbot-tools-query-knowledge.test.ts`
- MISSING (correctly): `app/src/lib/__tests__/canvas-rules-scope.test.ts`
- MISSING (correctly): `app/src/app/api/catbot/knowledge/tree/route.ts`
- MISSING (correctly): `app/src/components/settings/catbot-knowledge/tab-knowledge-tree.tsx`

**Files verified to exist (Task 2 modifications):**
- FOUND: `app/src/lib/services/catbot-tools.ts` (modified)
- FOUND: `app/src/lib/services/catbot-prompt-assembler.ts` (modified)
- FOUND: `app/docker-entrypoint.sh` (2 lines)
- FOUND: `app/Dockerfile` (no /app/data/knowledge COPY)
- FOUND: `CLAUDE.md` (46 lines, has `.docflow-kb` pointer)
- FOUND: `.planning/Index.md` (slimmed)

**Commits verified to exist:**
- FOUND: `159f82a` — chore(155-02): delete legacy knowledge layers (23+ files)
- FOUND: `5b3ce16` — refactor(155-02): remove legacy knowledge-tree consumers + simplify CLAUDE.md

---
*Phase: 155-kb-cleanup-final*
*Completed: 2026-04-20*
