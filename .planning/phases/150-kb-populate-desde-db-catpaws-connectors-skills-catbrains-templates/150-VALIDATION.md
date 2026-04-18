---
phase: 150
slug: kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-18
---

# Phase 150 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 150-RESEARCH.md `## Validation Architecture` + CONTEXT.md §D4.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest v1.x |
| **Config file** | `app/vitest.config.ts` (globs `src/**/*.test.ts`) |
| **Quick run command** | `cd app && npm run test:unit -- src/lib/__tests__/kb-sync-db-source.test.ts` |
| **Full suite command** | `cd app && npm run test:unit` |
| **Estimated runtime** | ~30 seconds (new file); full suite ~2-3 min |

---

## Sampling Rate

- **After every task commit:** Run the quick command (`vitest run src/lib/__tests__/kb-sync-db-source.test.ts`)
- **After every plan wave:** Run `cd app && npm run test:unit` (full vitest suite)
- **Before `/gsd:verify-work`:** (1) full vitest green, (2) `node scripts/kb-sync.cjs --full-rebuild --source db` on dev DB produces `validate-kb.cjs` exit 0, (3) Oracle test pasted to `150-VERIFICATION.md`, (4) commit of KB snapshot
- **Max feedback latency:** 30 seconds (quick) / 180 seconds (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 150-01-01 | 01 | 1 | KB-09 (pre-req fixes) | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-sync.test.ts -t "syncResource update idempotent when unchanged"` | ❌ W0 | ⬜ pending |
| 150-01-02 | 01 | 1 | KB-10 | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-sync.test.ts -t "canvases_active in _index header"` | ❌ W0 | ⬜ pending |
| 150-01-03 | 01 | 1 | KB-11 | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-sync.test.ts -t "FIELDS_FROM_DB connector has no config"` | ❌ W0 | ⬜ pending |
| 150-02-01 | 02 | 2 | KB-06 | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "writes files from 6 tables"` | ❌ W0 | ⬜ pending |
| 150-02-02 | 02 | 2 | KB-06 | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "dry run empty DB"` | ❌ W0 | ⬜ pending |
| 150-02-03 | 02 | 2 | KB-06 | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "tag derivation"` | ❌ W0 | ⬜ pending |
| 150-02-04 | 02 | 2 | KB-06/11 | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "short-id collision resolved"` | ❌ W0 | ⬜ pending |
| 150-02-05 | 02 | 2 | KB-06 | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "related cross-entity"` | ❌ W0 | ⬜ pending |
| 150-03-01 | 03 | 2 | KB-08 | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "dry run reports counts"` | ❌ W0 | ⬜ pending |
| 150-03-02 | 03 | 2 | KB-08 | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "only subtype filter"` | ❌ W0 | ⬜ pending |
| 150-03-03 | 03 | 2 | KB-08 | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "exit 2 on invalid args"` | ❌ W0 | ⬜ pending |
| 150-03-04 | 03 | 2 | KB-09 | idempotence | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "idempotent second run"` | ❌ W0 | ⬜ pending |
| 150-03-05 | 03 | 2 | KB-09 | idempotence | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "detects single row change"` | ❌ W0 | ⬜ pending |
| 150-03-06 | 03 | 2 | KB-09 | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "orphan WARN, no delete"` | ❌ W0 | ⬜ pending |
| 150-04-01 | 04 | 3 | KB-07 | contract | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "validate-kb passes on generated files"` | ❌ W0 | ⬜ pending |
| 150-04-02 | 04 | 3 | KB-10 | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "canvases_active count"` | ❌ W0 | ⬜ pending |
| 150-04-03 | 04 | 3 | KB-10 | integration | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "header md has all counts"` | ❌ W0 | ⬜ pending |
| 150-04-04 | 04 | 3 | KB-11 | security | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "no connector config leak"` | ❌ W0 | ⬜ pending |
| 150-04-05 | 04 | 3 | KB-11 | security | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "no flow_data leak"` | ❌ W0 | ⬜ pending |
| 150-04-06 | 04 | 3 | KB-11 | security | `cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts -t "no template structure leak"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Plan numbering is the planner's call — this map assumes a 4-plan split (pre-req fixes → DB reader/transformer → CLI integration → validation+security); planner will finalize.

---

## Wave 0 Requirements

- [ ] `app/src/lib/__tests__/kb-sync-db-source.test.ts` — new vitest file with ~17 integration + security + idempotence tests covering KB-06..KB-11. Pattern mirrors `app/src/lib/__tests__/kb-sync-cli.test.ts` (tmpRepo fixture, programmatic DB seeding via `better-sqlite3` in `beforeEach`)
- [ ] Test helper `createFixtureDb(path)` inside the test file — programmatic inline schema for 6 target tables + 4 join tables (`cat_paws`, `connectors`, `skills`, `catbrains`, `email_templates`, `canvases`, `cat_paw_connectors`, `cat_paw_catbrains`, `cat_paw_skills`, `catbrain_connectors`). Does NOT import `app/src/lib/db.ts` (would run 5000 lines of seed/migrate on require)
- [ ] Update `app/src/lib/__tests__/knowledge-sync.test.ts` to cover 3 pre-req fixes: idempotent `syncResource('update')` when input unchanged, `canvases_active` in index header, `FIELDS_FROM_DB.connector` has no `config`
- [ ] No framework install required (`better-sqlite3` and `vitest` already in `app/package.json`)
- [ ] `kb-sync-cli.test.ts` review: if its header counts assertion is strict `.toEqual`, add `canvases_active: 0` to expected object (research notes it currently uses tolerant `.arrayContaining` — verify during W0)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CatBot oracle parity (count CatPaws in KB ↔ DB) | KB-06 Nivel 2 per CONTEXT D4 | CatBot has no `list_kb_resources` tool yet (Fase 4 PRD). Requires human to compare counts. | (1) `node scripts/kb-sync.cjs --full-rebuild --source db --verbose` on dev DB. (2) `ls .docflow-kb/resources/catpaws/*.md \| wc -l`. (3) Open CatBot chat, ask "Lista los CatPaws que existen en el sistema." — count rows returned by `list_cat_paws`. (4) Paste both counts + CatBot response into `150-VERIFICATION.md`. Counts must match. If mismatch → gap. If CatBot cannot "see" KB files (expected — no tool yet) → document as gap for Fase 4, do NOT block phase close. |
| KB snapshot commit to git | CONTEXT D1 "Commit snapshot" | The populated `.docflow-kb/resources/*.md` files are a repo artifact — must be committed after passing validation. | After all tests + oracle pass: `git add .docflow-kb/` then `git commit -m "chore(kb): populate .docflow-kb/ from DB via Phase 150"`. Verify `git status` clean. |
| `_manual.md` updated with "Contenido actual del KB" section | Phase close | Small documentation update, easier manual. | Append section listing the 6 resource subdirs and their counts (from `_index.json.header.counts`). Commit. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`kb-sync-db-source.test.ts` + `createFixtureDb` helper)
- [ ] No watch-mode flags (tests use `vitest run`, not `vitest watch`)
- [ ] Feedback latency < 30s (quick) / < 180s (full)
- [ ] Oracle test executed and pasted to VERIFICATION.md
- [ ] `validate-kb.cjs` exit 0 on generated KB
- [ ] KB snapshot committed to git
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
