---
phase: 157
slug: kb-rebuild-determinism
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 157 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Populated from `157-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.x (existing in `app/package.json`) |
| **Config file** | `app/vitest.config.ts` (existing) |
| **Quick run command** | `cd app && npx vitest run src/lib/__tests__/kb-sync-rebuild-determinism.test.ts --reporter=dot` |
| **Full suite command** | `cd app && npx vitest run src/lib/__tests__/ --reporter=dot` |
| **Estimated runtime** | ~15–30 seconds (targeted); ~90s (full suite) |
| **Node runtime** | Host Node 22 for scripts/; Docker Node 20 for runtime |
| **DB fixture helper** | `createFixtureDb()` (exported by `kb-sync-db-source.test.ts` from Phase 150) |
| **KB fixture helper** | `createFixtureKb()` (exported from Phase 152 per CONTEXT §research gap) |

---

## Sampling Rate

- **After every task commit:** Run targeted test file (`kb-sync-rebuild-determinism.test.ts` + any file edited)
- **After every plan wave:** Run full `app/src/lib/__tests__/` suite to catch cross-module regressions (especially `knowledge-sync*` + `kb-sync-db-source*` tests to protect Phase 150 idempotence + Phase 156-02 search_hints behavior)
- **Before CatBot oracle (Plan 03 wave 3):** Full suite green + `node scripts/validate-kb.cjs` exit 0
- **Max feedback latency:** 30 seconds (targeted run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 157-01-01 | 01 | 1 | KB-46 | cleanup | `git status .docflow-kb/resources/` (expect 10 `D` lines post-`git rm`) | ✅ working-tree | ⬜ pending |
| 157-01-02 | 01 | 1 | KB-46 | unit | `npx vitest run -t "loadArchivedIds"` | ❌ W0 (file to create) | ⬜ pending |
| 157-01-03 | 01 | 1 | KB-46 | unit | `npx vitest run -t "populateFromDb excludes archived"` | ❌ W0 | ⬜ pending |
| 157-01-04 | 01 | 1 | KB-46 | integration | `node scripts/kb-sync.cjs --full-rebuild --source db --dry-run` expects `archived-skip: N` | ✅ CLI | ⬜ pending |
| 157-01-05 | 01 | 1 | KB-46 | counts | `jq '.header.counts' .docflow-kb/_index.json` matches DB row counts Δ=0 × 6 entities | ✅ CLI | ⬜ pending |
| 157-02-01 | 02 | 2 | KB-47 | unit | `npx vitest run -t "renderLinkedSectionCjs byte-equivalent"` | ❌ W0 | ⬜ pending |
| 157-02-02 | 02 | 2 | KB-47 | unit | `npx vitest run -t "buildBody catpaw with relations"` | ❌ W0 | ⬜ pending |
| 157-02-03 | 02 | 2 | KB-47 | unit | `npx vitest run -t "buildBody catpaw empty relations placeholder"` | ❌ W0 | ⬜ pending |
| 157-02-04 | 02 | 2 | KB-47 | regression | `npx vitest run -t "search_hints preserved post-fix"` (KB-42 preservation) | ❌ W0 | ⬜ pending |
| 157-02-05 | 02 | 2 | KB-47 | integration | `grep "## Conectores vinculados" .docflow-kb/resources/catpaws/53f19c51-*.md` (Operador Holded) | ✅ CLI | ⬜ pending |
| 157-03-01 | 03 | 3 | KB-46 | unit | `npx vitest run -t "cmdRestore --from-legacy"` | ❌ W0 | ⬜ pending |
| 157-03-02 | 03 | 3 | KB-46 | idempotence | `npx vitest run -t "second rebuild produces zero writes"` (KB-09 regression) | ❌ W0 | ⬜ pending |
| 157-03-03 | 03 | 3 | KB-46/47 | docs | `grep -q "## Rebuild Determinism" .docflow-kb/_manual.md` | ✅ CLI | ⬜ pending |
| 157-03-04 | 03 | 3 | KB-46/47 | manual | CatBot oracle Prompt A (Operador Holded body sections) | manual | ⬜ pending |
| 157-03-05 | 03 | 3 | KB-46 | manual | CatBot oracle Prompt B (active counts match DB 6/6) | manual | ⬜ pending |
| 157-03-06 | 03 | 3 | KB-46 | manual | CatBot oracle Prompt C (archived semantics described) | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/lib/__tests__/kb-sync-rebuild-determinism.test.ts` — new test file (target: 10 unit tests covering loadArchivedIds + populateFromDb exclude + buildBody catpaw + renderLinkedSectionCjs + cmdRestore + idempotence regression + search_hints preservation)
- [ ] Confirm `createFixtureDb()` importable from `kb-sync-db-source.test.ts` (existing Phase 150 helper)
- [ ] Confirm `createFixtureKb()` importable (Phase 152 helper) — if not exported, create local fixture with `tmp/` dir + file scaffold
- [ ] Fixture data: 1 catpaw DB row with 1 connector + 1 skill relation; 1 archived file in `.docflow-legacy/orphans/catpaws/<prefix>-<slug>.md`; expected post-rebuild state

*No framework install needed — vitest already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CatBot reads updated KB body sections | KB-47 | Requires live Docker container + KB cache invalidation via container restart (TTL 60s, no HTTP endpoint) | 1. Run `--full-rebuild` + `docker restart docflow-app`. 2. POST `/api/catbot/chat` with prompt: "Dame las secciones vinculadas del CatPaw Operador Holded". 3. Verify response cites "Holded MCP" with UUID under `## Conectores vinculados`. Paste verbatim to `157-VERIFICATION.md`. |
| CatBot reports accurate active counts | KB-46 | Same — requires live CatBot invoking `list_cat_paws` + `search_kb` tools | POST `/api/catbot/chat`: "¿Cuántos CatPaws activos en KB y cuántos en DB?" → CatBot invokes both tools → response confirms 39 = 39 (or current real DB count). |
| CatBot explains archive semantics | KB-46 | Self-describing policy from `_manual.md §Rebuild Determinism` | POST `/api/catbot/chat`: "¿Si un archivo está archivado, el rebuild lo resucita?" → CatBot invokes `get_kb_entry('manual')` or `search_kb({tags:['retention']})` → response describes "archivado = frozen" + `--restore --from-legacy` command. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (13 automated + 3 manual)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (manual tasks are clustered at end of Plan 03)
- [ ] Wave 0 covers all MISSING references (1 new test file, fixture helpers already exported)
- [ ] No watch-mode flags (all commands use `vitest run`, not `vitest` watch)
- [ ] Feedback latency < 30s (targeted file runs in ~15s)
- [ ] Regression guards present: KB-09 idempotence + KB-42 search_hints preservation
- [ ] `nyquist_compliant: true` set in frontmatter post-Wave-0-green

**Approval:** pending
