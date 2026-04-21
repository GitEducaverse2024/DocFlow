---
phase: 157-kb-rebuild-determinism
plan: 03
subsystem: knowledge-base
tags: [kb-sync, rebuild-determinism, restore-cli, catbot-oracle, rule-r30, retention-policy, tdd]

# Dependency graph
requires:
  - phase: 157-01
    provides: "loadArchivedIds + Pass-2 exclude + report.skipped_archived (KB-46 rebuild exclusion)"
  - phase: 157-02
    provides: "buildBody(subtype,row,relations) + renderLinkedSectionCjs + splitRelationsBySubtype (KB-47 body sections)"
  - phase: 156-03
    provides: ".docflow-legacy/orphans/<subtype>/ archive layout + Retention Policy section in _manual.md"
provides:
  - "cmdRestore(args, {kbRoot}) CLI subcommand + dispatcher branch (exit codes 0/1/2/3)"
  - "_manual.md §Retention Policy > ### Rebuild Determinism (Phase 157) sub-section"
  - "R30-rebuild-determinism.md rule atom in .docflow-kb/rules/ (discoverable via search_kb)"
  - "tag-taxonomy.json extended with retention, lifecycle, kb-sync, rebuild, R30"
  - "list_cat_paws tool LIMIT 20 → 100 + optional `limit` arg (unblocks counts parity oracle)"
  - "CatBot oracle 3/3 verbatim evidence in 157-VERIFICATION.md"
  - "Phase 157 closure — KB-46 + KB-47 requirements complete"
affects: [v29.1-milestone-close, verify-phase-157, complete-milestone-v29.1]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Atomic opt-in restore: fs.renameSync for portable move (+ git mv documented as history-preserving alternative)"
    - "Exit code convention for KB CLI sub-commands: 0 ok | 1 missing-arg | 2 not-found/ambiguous | 3 conflict"
    - "Automation-first before human-verify: cache invalidation via docker restart, then 3-prompt oracle via POST /api/catbot/chat"
    - "Rule atom + _manual.md subsection = dual discovery surface (R30 for tag/search; _manual.md for operator browse)"

key-files:
  created:
    - ".docflow-kb/rules/R30-rebuild-determinism.md"
    - ".planning/phases/157-kb-rebuild-determinism/157-VERIFICATION.md"
  modified:
    - "scripts/kb-sync.cjs (cmdRestore + dispatcher branch)"
    - ".docflow-kb/_manual.md (§Rebuild Determinism subsection in Retention Policy)"
    - ".docflow-kb/_schema/tag-taxonomy.json (retention, lifecycle, kb-sync, rebuild, R30)"
    - "app/src/lib/services/catbot-tools.ts (list_cat_paws LIMIT 20 → 100 + limit arg)"
    - "app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts (5 new tests G-K)"

key-decisions:
  - "cmdRestore uses fs.renameSync (atomic, portable, no git dep) — git mv is documented in _manual.md as the history-preserving alternative; both converge to same end state"
  - "Sub-section '### Rebuild Determinism' nested under existing '## Retention Policy' instead of top-level ## heading — cohesive with Phase 156-03 retention taxonomy, not a new category"
  - "R30 rule atom created as auto-fix (Rule 2 missing critical) to make the rebuild determinism guarantee discoverable via search_kb + get_kb_entry — CatBot oracle Prompt C cited R30 by name, validating the dual-surface decision"
  - "list_cat_paws LIMIT 20 → 100 (+ optional limit arg up to 500) unblocked Prompt B counts parity: pre-fix DB returned 20, KB returned 39, confirming UX bug not data drift. Fixed inline as Rule 2 missing-critical deviation (tool cannot claim to answer 'how many CatPaws?' while hard-capping at 20)"
  - "tag-taxonomy.json extended with `retention`, `lifecycle`, `kb-sync`, `rebuild`, `R30` — validate-kb.cjs rejected R30 frontmatter tags initially; taxonomy extension was a Rule 3 blocking fix"
  - "ESLint narrow types (Record<string, any> → {buildIdMap: (…) => …} + unknown catch types) applied during Task 4 fix-up — npm run build now exits 0, pre-requisite for Docker image refresh that picked up the list_cat_paws fix"
  - "Docker compose build --no-cache docflow ran before oracle (not just restart) because list_cat_paws TypeScript source change needed image refresh; restart alone would have run the old bundled tool code"

patterns-established:
  - "Rule-atom + _manual.md subsection dual-discovery for lifecycle invariants: operators browse _manual.md §policy; CatBot discovers via search_kb({tags:['retention']}) → get_kb_entry({id:'rule-rNN-…'})"
  - "CatBot oracle 3-prompt cadence: Prompt A proves KB-level behavior (body sections), Prompt B proves counts parity (DB↔KB), Prompt C proves lifecycle semantics (archive/restore) via rule citation"
  - "Automation-first checkpoint protocol: docker compose build → up -d → cache invalidation → 3 oracle prompts via POST /api/catbot/chat → evidence verbatim → only THEN human-verify"

requirements-completed: [KB-46, KB-47]

# Metrics
duration: ~90min
completed: 2026-04-21
---

# Phase 157 Plan 03: Restore CLI + Docs + Oracle Summary

**`--restore --from-legacy <id>` opt-in CLI + `### Rebuild Determinism` subsection in `_manual.md` + R30 rule atom + `list_cat_paws` LIMIT fix + CatBot oracle 3/3 verbatim evidence in `157-VERIFICATION.md`. Phase 157 closes with KB-46 + KB-47 requirements complete and milestone v29.1 ready for `/gsd:verify-phase 157`.**

## Performance

- **Duration:** ~90 min (including 3 auto-fix deviations during Task 4)
- **Started:** 2026-04-21T00:00Z (Task 1 RED commit `12aa859`)
- **Completed:** 2026-04-21T00:49Z (Task 4 oracle commit `922ccbc`) + user approval 2026-04-21T14:09Z
- **Tasks:** 5/5 (Task 5 = human-verify checkpoint, user approved "approved")
- **Files modified:** 9 source/config + 1 test + 1 new rule atom + 1 VERIFICATION.md + 1 SUMMARY (this file)

## Accomplishments

- Extended `scripts/kb-sync.cjs` with `cmdRestore(args, {kbRoot})` (exit codes 0/1/2/3 per spec) + dispatcher branch in `main()`. `fs.renameSync` is atomic and portable; no git dependency required.
- Added 5 TDD RED tests (G-K) to `app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts`: cmdRestore happy path, missing args, ambiguous/not-found, destination conflict, idempotence regression guard (Phase 150 KB-09 preserved after Plan 157-02 buildBody changes). All GREEN after implementation.
- Documented the rebuild determinism contract in `.docflow-kb/_manual.md` as a sub-section within the existing `## Retention Policy (Phase 156)`: five points covering (a) no-resurrect, (b) exclusion signal, (c) `--restore --from-legacy <id>` opt-in, (d) `git mv` manual alternative for history preservation, (e) body-sections in rebuild. Cross-links to PRD §5.3 + Phase 156-03 + 157-CONTEXT.
- Created `R30-rebuild-determinism.md` rule atom in `.docflow-kb/rules/` (tags: `retention`, `lifecycle`, `kb-sync`, `rebuild`, `R30`, `safety`) so CatBot can discover the rule via `search_kb({tags:['retention']})` + cite it in oracle responses. Prompt C validated this end-to-end: CatBot cited "R30 (Rebuild determinístico)" by name.
- Extended `.docflow-kb/_schema/tag-taxonomy.json` with the 5 new tags consumed by R30; `validate-kb.cjs` now exit 0 on the rule.
- Fixed `list_cat_paws` tool in `app/src/lib/services/catbot-tools.ts`: hardcoded `LIMIT 20` → `LIMIT 100` default + optional `limit` argument (cap 500). Prompt B pre-fix returned DB=20, KB=39 (false mismatch); post-fix returned DB=39, KB=39 (Δ=0 confirmed).
- Narrowed two TypeScript `Record<string, any>` usages + `unknown` catch types in the fix-up sweep → `npm run build` exits 0 (ESLint no-explicit-any gate passes).
- `docker compose build --no-cache docflow && docker compose up -d` refreshed the image so the container shipped the patched `list_cat_paws`; `kb-index-cache` 60s TTL invalidated on restart.
- Executed 3 oracle prompts via `POST /api/catbot/chat` per CLAUDE.md Protocolo de Testing. Captured response + tool_calls verbatim in `157-VERIFICATION.md`. Prompt A (KB-47 body sections): PASSED — CatBot cited "Holded MCP (`seed-holded-mcp`)" literal under `## Conectores vinculados`. Prompt B (KB-46 counts parity): PASSED — search_kb=39 === list_cat_paws=39. Prompt C (KB-46 archive semantics): PASSED — CatBot cited R30 + described both `--restore` and `git mv` options.
- Human-verify checkpoint (Task 5): user approved "approved" after reviewing `157-VERIFICATION.md`.

## Task Commits

1. **Task 1: RED tests — cmdRestore 4 cases + idempotence regression (G-K)** — `12aa859` (test — RED)
2. **Task 2: cmdRestore + dispatcher branch (GREEN)** — `751dd2e` (feat — GREEN)
3. **Task 3: _manual.md §Rebuild Determinism subsection** — `17b49b4` (docs)
4. **Task 4: Oracle 3/3 passed + R30 rule + list_cat_paws LIMIT fix + VERIFICATION.md** — `922ccbc` (feat — bundles 3 auto-fix deviations)
5. **Task 5: Human checkpoint — approved** — no commit (checkpoint outcome captured via user response "approved" + this SUMMARY)

**Plan metadata commit:** pending (includes this SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md verification).

## Files Created/Modified

- `scripts/kb-sync.cjs` — `cmdRestore(args, {kbRoot})` function (~45 LOC) + 1-line dispatcher branch in `main()`. Exit codes 0/1/2/3 per spec. Uses `fs.renameSync` + `fs.mkdirSync({recursive:true})`; scans 6 subdirs (`catpaws, connectors, skills, catbrains, email-templates, canvases`) for exactly-one match.
- `app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` — 5 new tests (G-K) appended to existing describe block. Pattern: `execFileSync('node', [...], {encoding:'utf8'})` wrapped in `try/catch` to capture exit code via `error.status` + stderr via `error.stderr`. Test K uses `populateFromDb` twice on same fixture + asserts `report2.updated === 0 && report2.unchanged >= N`. Total file now 15 tests (4 Plan 01 + 6 Plan 02 + 5 Plan 03) — all GREEN.
- `.docflow-kb/_manual.md` — `### Rebuild Determinism (Phase 157)` subsection appended to `## Retention Policy (Phase 156)`. 5 numbered points + cross-links to PRD §5.3, Phase 156-03 ORPHAN-AUDIT, Phase 157-CONTEXT.
- `.docflow-kb/rules/R30-rebuild-determinism.md` — New rule atom (~80 lines). Frontmatter: `type: rule`, `subtype: lifecycle`, `tags: [retention, lifecycle, kb-sync, rebuild, R30, safety]`, `audience: [catbot, architect, developer, ops]`, `status: active`. Body: rule statement + "Por qué" + "Cómo aplicar" (exclusion list, restore CLI, git mv alternative) + related links.
- `.docflow-kb/_schema/tag-taxonomy.json` — `cross_cutting` extended with `retention`, `lifecycle`, `rebuild`; `entities` extended with `kb-sync`; `rules` extended with `R30`. Total 33 rule tags (was 32 post-Phase 155).
- `app/src/lib/services/catbot-tools.ts` — `list_cat_paws` case: `LIMIT 20` literal replaced with parameterized `LIMIT ${Math.min(args.limit ?? 100, 500)}`. Tool description updated to mention the optional `limit` arg (default 100, max 500).
- `.planning/phases/157-kb-rebuild-determinism/157-VERIFICATION.md` — 177-line evidence file with Prompt A/B/C verbatim (Spanish responses + tool_calls JSON summaries), Counts Parity table (6 entities), Success Criteria checklists for KB-46 and KB-47, Tests Status (33/33 GREEN file-level + 31/31 no-regressions), Artifacts Produced table.

## Decisions Made

1. **Rule atom + _manual.md subsection dual-discovery surface (R30).** Operator-facing browse happens in `_manual.md §Retention Policy > ### Rebuild Determinism`. CatBot discovery happens via `search_kb({tags:['retention']})` → `get_kb_entry({id:'rule-r30-rebuild-determinism'})`. Keeping both surfaces synchronized is Phase 155's dual-write contract (CLAUDE.md pointer pattern).

2. **`fs.renameSync` over `git mv` for `cmdRestore`.** Portable (no git dep), atomic, testable in isolated tmpRepo fixtures. `git mv` documented as the history-preserving alternative in `_manual.md` Point 4 so operators can choose per their audit preferences.

3. **Exit code convention matches Phase 150 KB-08.** 0 ok | 1 missing-arg/invalid dispatch | 2 not-found/ambiguous | 3 conflict/destination exists. Consistency with `cmdArchive` + `cmdPurge` exit codes → operator mental model is stable across the 5 KB sync sub-commands.

4. **Sub-section under existing `## Retention Policy`, not new top-level `##`.** Phase 156-03 owns the retention taxonomy; rebuild determinism is a sub-topic of retention (archive files are "frozen" = retention invariant). Avoids heading proliferation in `_manual.md` (currently 8 `##` sections; adding another would dilute the table of contents).

5. **R30 rule promoted from Plan's optional note to first-class atom during Task 4.** Originally the plan only specified the `_manual.md` subsection; when Prompt C first executed, CatBot responded with vague paraphrase. The fix was to give it a citable atom with `id: rule-r30-rebuild-determinism` — post-fix response cited R30 by name verbatim. Confirms the dual-discovery pattern is necessary, not redundant.

6. **`list_cat_paws` LIMIT 20 → 100 default** (not 500 or "no limit"). 100 covers all realistic DocFlow workspaces (current: 39); cap 500 prevents pathological payloads. CatBot pagination via `limit` arg is explicit opt-in for larger pulls — matches the shape of `list_email_templates` + `list_skills` which already parameterize their limits.

7. **Docker `build --no-cache` instead of just `up -d --force-recreate`.** The `list_cat_paws` TypeScript fix lives in the bundled Next.js server image; `up -d` alone would mount the patched source only if the volume included `app/src/` (it doesn't — production image bundles the compiled output). `--no-cache` was the cleanest way to guarantee the oracle ran against the patched tool code.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] list_cat_paws hardcoded LIMIT 20 broke Prompt B counts parity**
- **Found during:** Task 4 (oracle Prompt B first execution).
- **Issue:** `list_cat_paws` SQL: `SELECT * FROM cat_paws WHERE is_active=1 LIMIT 20`. DB has 39 active CatPaws; KB `search_kb({type:'resource',subtype:'catpaw',status:'active'})` returned 39. CatBot first response: "Según search_kb hay 39, según list_cat_paws hay 20 — NO coinciden." This was a UX bug in the tool itself (the oracle asked a perfectly reasonable question; the tool gave a misleading answer). Critical for correctness: any tool that claims to list an entity must not silently truncate.
- **Fix:** `app/src/lib/services/catbot-tools.ts` — LIMIT literal replaced with `Math.min(args.limit ?? 100, 500)`. Tool description updated to document the `limit` arg. Tool definition schema in `TOOLS[]` array gains optional `limit: z.number().int().min(1).max(500).optional()`.
- **Files modified:** `app/src/lib/services/catbot-tools.ts`.
- **Verification:** Docker image rebuilt; Prompt B re-executed post-rebuild; CatBot responded "Según search_kb hay 39, según list_cat_paws hay 39 — coinciden exactamente (Δ=0)". Verbatim in `157-VERIFICATION.md §Prompt B`.
- **Committed in:** `922ccbc` (Task 4 commit, bundled with other Task 4 work).

**2. [Rule 2 - Missing Critical] R30 rule atom created to make rebuild determinism citable by CatBot**
- **Found during:** Task 4 (oracle Prompt C first execution).
- **Issue:** Prompt C asked whether the rebuild resurrects archived files. CatBot first response was a vague paraphrase ("generalmente no, pero depende"). The `_manual.md` subsection (Task 3) documented the rule for humans; but CatBot's `search_kb` does not scan `_manual.md` (not a resource entry) — only `rules/*.md`. Without a rule atom, the rebuild determinism contract was invisible to the oracle surface.
- **Fix:** Created `.docflow-kb/rules/R30-rebuild-determinism.md` with frontmatter + body documenting the exclusion list behavior, `--restore --from-legacy` opt-in, and `git mv` alternative. Tagged `retention, lifecycle, kb-sync, rebuild, R30, safety`.
- **Files modified:** `.docflow-kb/rules/R30-rebuild-determinism.md` (created), `.docflow-kb/_schema/tag-taxonomy.json` (extended — see Deviation 3).
- **Verification:** Post-creation + `--full-rebuild --source db` + docker restart, Prompt C re-executed: CatBot cited "R30 (Rebuild determinístico)" by name, described `WARN [archived-skip]` behavior, gave both `--restore` and `git mv` paths. Verbatim in `157-VERIFICATION.md §Prompt C`.
- **Committed in:** `922ccbc` (Task 4 commit).

**3. [Rule 3 - Blocking] tag-taxonomy.json rejected R30 frontmatter tags**
- **Found during:** Task 4 (running `validate-kb.cjs` after creating R30 rule atom).
- **Issue:** R30 uses tags `retention`, `lifecycle`, `kb-sync`, `rebuild`, `R30` (plus the pre-existing `safety`). None of the first five were in `tag-taxonomy.json`; validator rejected the rule file.
- **Fix:** Extended `.docflow-kb/_schema/tag-taxonomy.json`: `cross_cutting` += `retention`, `lifecycle`, `rebuild`; `entities` += `kb-sync`; `rules` += `R30`.
- **Files modified:** `.docflow-kb/_schema/tag-taxonomy.json`.
- **Verification:** `validate-kb.cjs` exit 0 on R30 after taxonomy extension. The 1 pre-existing FAIL on `resources/canvases/e938d979-phase-156-verify.md` (tag: mixed) is Phase 156 residue, orthogonal to Plan 03.
- **Committed in:** `922ccbc` (Task 4 commit).

**4. [Rule 1 - Bug] ESLint `no-explicit-any` errors blocked Docker build**
- **Found during:** Task 4 (running `npm run build` after editing `catbot-tools.ts`).
- **Issue:** Two `Record<string, any>` type annotations and two `catch(e: any)` types in the touched code path. Next.js ESLint preset `no-explicit-any = error` during `next build`. Pre-existing tech debt but this plan's touches tripped it.
- **Fix:** Narrowed `Record<string, any>` → `{buildIdMap: (entries: Entry[]) => Map<string,string>}` (explicit shape) in one site and `Record<string, unknown>` in the other. `catch(e: any)` → `catch(e: unknown)` with type-guard + `e instanceof Error` branch. Behavior unchanged.
- **Files modified:** `app/src/lib/services/catbot-tools.ts` (same file as Deviation 1).
- **Verification:** `cd app && npm run build` exit 0. Docker `compose build --no-cache docflow` succeeds.
- **Committed in:** `922ccbc` (Task 4 commit).

---

**Total deviations:** 4 auto-fixed (2 Rule 2 missing critical, 1 Rule 3 blocking, 1 Rule 1 bug). All discovered during Task 4 (oracle execution) — the oracle itself is the stress-test that surfaced them.
**Impact on plan:** All auto-fixes were necessary to produce the oracle evidence the plan mandated (3/3 passed). No scope creep; the R30 rule atom is a Task-3-adjacent artifact (dual-discovery with `_manual.md`); the `list_cat_paws` fix is a critical correctness bug in a Phase 152 tool; the ESLint fixes are pre-existing drift. All four auto-fixes co-located in the single Task 4 commit `922ccbc` so the change set stays reviewable as one oracle-readiness unit.

## Issues Encountered

- **Prompt B initial mismatch (DB=20 vs KB=39).** Resolved by Deviation 1 above. The oracle protocol is itself the test — this is how CLAUDE.md's "CatBot como Oráculo" protocol is supposed to work: features get exercised until gaps surface; gaps either close via auto-fix (Rules 1-3) or become checkpoints (Rule 4). Plan 03 produced 4 Rules-1-3 auto-fixes, 0 Rule-4 architectural escalations.
- **1 pre-existing `validate-kb.cjs` FAIL on `canvases/e938d979-phase-156-verify.md`.** `tag: mixed` is not in taxonomy. Phase 156 residue, documented in Plan 01 + Plan 02 SUMMARY Issues sections. Orthogonal to Phase 157 — not touched.
- **Pass-2 idempotence warning re-surfaced in Task 4 rebuild (57 cosmetic bumps).** Pre-existing Plan 150/153 drift (documented in Plan 01 Decision #4 + Plan 02 Deviations "Pass 2"). KB-47 target files (Operador Holded + 33 other catpaws) remain byte-stable; the 57 bumps are the pre-existing 5 catpaws + 38 skills + 8 templates + 5 connectors + 1 catbrain delta that both Plans 01 and 02 already described. Plan 03 neither introduces nor worsens this drift.

## User Setup Required

None — no external service configuration introduced. The `--restore --from-legacy <id>` command is a Claude-runnable CLI; users interact with it via Claude, not directly.

## Next Phase Readiness

**Ready for `/gsd:verify-phase 157`:**
- KB-46 closed end-to-end: exclusion list (Plan 01) + opt-in restore CLI (Plan 03) + docs (Plan 03) + oracle Prompt B (counts parity) + oracle Prompt C (archive semantics via R30 citation).
- KB-47 closed end-to-end: buildBody 3-arg signature (Plan 02) + Operador Holded body byte-stable (Plan 02 md5 verified) + oracle Prompt A (CatBot cites "Holded MCP" verbatim under `## Conectores vinculados`) + idempotence regression guard (Plan 03 Test K).
- `157-VERIFICATION.md` contains oracle 3/3 verbatim evidence + Counts Parity table + Success Criteria checklists.
- Tests: 15/15 GREEN in `kb-sync-rebuild-determinism.test.ts` (4+6+5); no Phase 149/150/152/153 regressions.
- `npm run build` exit 0; `validate-kb.cjs` 187/188 PASS (1 pre-existing Phase 156 FAIL on `canvases/e938d979-phase-156-verify.md`, orthogonal).

**Ready for `/gsd:complete-phase 157` → `/gsd:complete-milestone v29.1`:**
- ROADMAP.md Phase 157 row moves 2/3 → 3/3 Complete (metadata commit).
- REQUIREMENTS.md KB-46 + KB-47 already marked Complete in Traceability (done in Plan 01 + Plan 02 state updates).
- STATE.md current_plan advances 2 → 3 of 3 (all plans complete), status → verifying.

**Deferred (non-blocking for v29.1 close):**
- KB-44 (email-templates +1 duplicate-mapping pathology) — tracked as orthogonal v29.2 gap in Phase 156-03 SUMMARY.
- KB-45 (list_connectors tool absence) — tracked as orthogonal v29.2 gap in Phase 156-03 SUMMARY.
- isNoopUpdate cosmetic idempotence drift (57 file bumps per rebuild on unchanged DB) — documented in Plans 01/02/03; pre-existing Plan 150/153 issue; non-blocking.
- Pre-existing Phase 156 orphan `resources/canvases/e938d979-phase-156-verify.md` with out-of-taxonomy tag — 1 of 188 validate-kb.cjs entries; Plan 03 scope explicitly excludes cleanup of pre-existing residue.

**Blockers:** None for verify-phase or complete-milestone.

---
*Phase: 157-kb-rebuild-determinism*
*Completed: 2026-04-21*

## Self-Check: PASSED

- [x] All 4 prior task commits present on `main`: `12aa859` (RED), `751dd2e` (GREEN), `17b49b4` (docs), `922ccbc` (oracle + auto-fixes).
- [x] `scripts/kb-sync.cjs` contains `function cmdRestore` (grep confirmed).
- [x] `.docflow-kb/_manual.md` contains `### Rebuild Determinism` subsection (grep confirmed).
- [x] `.docflow-kb/rules/R30-rebuild-determinism.md` exists (ls confirmed).
- [x] `.planning/phases/157-kb-rebuild-determinism/157-VERIFICATION.md` exists with `oracle_prompts_passed: 3/3` + Prompt A/B/C verbatim (Read confirmed).
- [x] Oracle Prompt A: CatBot cited "Holded MCP (`seed-holded-mcp`)" under `## Conectores vinculados` (verbatim captured).
- [x] Oracle Prompt B: CatBot confirmed KB=39 === list_cat_paws=39 (Δ=0, verbatim captured post-LIMIT-fix).
- [x] Oracle Prompt C: CatBot cited R30 by name + described `--restore --from-legacy` + `git mv` options (verbatim captured).
- [x] User human-verify checkpoint: "approved" — recorded in prompt, no gap-closure needed.
- [x] This `157-03-SUMMARY.md` created with substantive one-liner + frontmatter dependency graph + task commits + deviations documented.
