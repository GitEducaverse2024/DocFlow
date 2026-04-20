---
phase: 156
slug: kb-runtime-integrity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 156 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `156-RESEARCH.md` §M (Phase Requirements → Test Map).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (project-pinned via `app/package.json`) |
| **Config file** | `app/vitest.config.ts` (existing) |
| **Quick run command** | `cd app && npx vitest run <file>` |
| **Full suite command** | `cd app && npx vitest run` |
| **Estimated runtime** | ~30–60s full suite; <10s per new file |

---

## Sampling Rate

- **After every task commit:** Run the specific new test file (`cd app && npx vitest run <file>`) — <10s.
- **After every plan wave:** Run `cd app && npx vitest run` — ~30–60s.
- **Before `/gsd:verify-work`:** Full suite green + Docker rebuild + CatBot oracle (4 prompts per CLAUDE.md protocol).
- **Max feedback latency:** 60 seconds.

---

## Per-Task Verification Map

| Task ID (tentative) | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------------------|------|------|-------------|-----------|-------------------|-------------|--------|
| 156-01-W0 | 01 | 0 | KB-40 | fixture | `cd app && npx vitest run canvas-api-kb-sync.test.ts` (RED) | ❌ W0 | ⬜ pending |
| 156-01-T1 | 01 | 1 | KB-40 | integration | `cd app && npx vitest run canvas-api-kb-sync.test.ts -t "POST"` | ❌ W0 | ⬜ pending |
| 156-01-T2 | 01 | 1 | KB-40 | integration | `cd app && npx vitest run canvas-api-kb-sync.test.ts -t "PATCH"` | ❌ W0 | ⬜ pending |
| 156-01-T3 | 01 | 1 | KB-40 | integration | `cd app && npx vitest run canvas-api-kb-sync.test.ts -t "DELETE"` | ❌ W0 | ⬜ pending |
| 156-01-T4 | 01 | 1 | KB-40 | unit | `cd app && npx vitest run canvas-api-kb-sync.test.ts -t "failure"` | ❌ W0 | ⬜ pending |
| 156-01-T5 | 01 | 1 | KB-41 | unit | `cd app && npx vitest run catbot-sudo-delete-catflow.test.ts -t "soft-delete"` | ❌ W0 | ⬜ pending |
| 156-01-T6 | 01 | 1 | KB-41 | unit | `cd app && npx vitest run catbot-sudo-delete-catflow.test.ts -t "AMBIGUOUS"` | ❌ W0 | ⬜ pending |
| 156-02-W0 | 02 | 0 | KB-42 | fixture | `cd app && npx vitest run catbot-tools-link.test.ts` (RED) | ❌ W0 | ⬜ pending |
| 156-02-T1 | 02 | 1 | KB-42 | unit | `cd app && npx vitest run catbot-tools-link.test.ts -t "link_connector"` | ❌ W0 | ⬜ pending |
| 156-02-T2 | 02 | 1 | KB-42 | unit | `cd app && npx vitest run catbot-tools-link.test.ts -t "re-link noop"` | ❌ W0 | ⬜ pending |
| 156-02-T3 | 02 | 1 | KB-42 | unit | `cd app && npx vitest run knowledge-sync-catpaw-template.test.ts -t "conectores"` | ❌ W0 | ⬜ pending |
| 156-02-T4 | 02 | 1 | KB-42 | unit | `cd app && npx vitest run knowledge-sync-catpaw-template.test.ts -t "skills"` | ❌ W0 | ⬜ pending |
| 156-02-T5 | 02 | 1 | KB-42 | integration | `cd app && npx vitest run catbot-tools-link.test.ts -t "search_kb"` | ❌ W0 | ⬜ pending |
| 156-03-T1 | 03 | 1 | KB-43 | scripted | `node scripts/kb-sync.cjs --full-rebuild --source db --dry-run 2>&1 \| grep orphan` | ✅ existing | ⬜ pending |
| 156-03-T2 | 03 | 1 | KB-43 | scripted | Active-count per entity = DB row count (see §Manual-Only) | ✅ existing | ⬜ pending |
| 156-03-T3 | 03 | 1 | KB-43 | doc check | `grep -c "^## Retention Policy" .docflow-kb/_manual.md` → 1 | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/lib/services/__tests__/canvas-api-kb-sync.test.ts` — RED stubs for KB-40 (POST/PATCH/DELETE + failure path).
- [ ] `app/src/lib/services/__tests__/catbot-sudo-delete-catflow.test.ts` — RED stubs for KB-41 (soft-delete + AMBIGUOUS guard).
- [ ] `app/src/lib/services/__tests__/catbot-tools-link.test.ts` — RED stubs for KB-42 link-tool side (link_connector, re-link noop, search_kb).
- [ ] `app/src/lib/services/__tests__/knowledge-sync-catpaw-template.test.ts` — RED stubs for KB-42 template side (conectores + skills sections).
- [ ] Extend `ensureTables()` inline per test file with `canvases` + `cat_paw_connectors(usage_hint)` + `cat_paw_skills` schemas — no shared-helper refactor.
- Framework install: none needed (vitest + better-sqlite3 fixture pattern from Phase 153 tests already present).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Post-cleanup active-count per entity = DB row count | KB-43 | Requires live DB + KB filesystem state after Plan 03 executes; no unit harness reproduces orphan backlog | `for entity in catpaws skills email-templates canvases connectors catbrains; do echo "$entity: KB=$(grep -l '^status: active' .docflow-kb/resources/$entity/*.md 2>/dev/null \| wc -l) DB=$(sqlite3 docflow.db "SELECT COUNT(*) FROM $entity")"; done` — each row KB must equal DB |
| Retention Policy §added to `_manual.md` with ≥4 dimensions | KB-43 | Documentation edit; visual review | Inspect `.docflow-kb/_manual.md` for "## Retention Policy" section covering: max-age-deprecated, archive-vs-purge-threshold, manual-vs-automated-pruning, orphan-detection-cadence |
| CatBot oracle prompts pass (CLAUDE.md mandate) | KB-40..KB-43 | Requires Docker rebuild + live CatBot session; end-to-end ergonomics | Run 4 prompts after final docker restart: (1) "crea un canvas llamado Test156" → verify `resources/canvases/*.md` appears; (2) "borra el canvas Test156" → verify `status: deprecated`; (3) "vincula el conector Holded al CatPaw Controlador de Fichajes" → verify §Conectores vinculados includes Holded; (4) "busca CatPaws relacionadas con holded" → search_kb returns the linked CatPaw |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (4 new test files stubbed RED)
- [ ] No watch-mode flags (`vitest run`, not `vitest`)
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter after Wave 0 complete

**Approval:** pending
