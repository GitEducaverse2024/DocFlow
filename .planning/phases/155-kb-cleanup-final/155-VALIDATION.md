---
phase: 155
slug: kb-cleanup-final
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-20
---

# Phase 155 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `app/vitest.config.ts` |
| **Quick run command** | `cd app && npx vitest run --reporter=dot <targeted-file>` |
| **Full suite command** | `cd app && npx vitest run` |
| **Estimated runtime** | ~90 seconds (full suite) / ~5 seconds (targeted) |

Additional validators (non-vitest):

| Purpose | Command |
|---------|---------|
| KB schema / taxonomy validation | `node scripts/validate-kb.cjs` |
| Build health (catches unused imports / dead refs) | `docker compose build docflow` |
| Grep-based regression (legacy paths must be gone) | `grep -rn 'knowledge-tree\|query_knowledge\|app/data/knowledge\|\.planning/knowledge' app/src` |
| CatBot oracle E2E | `POST /api/catbot/chat` with 3 prompts + verbatim paste into VERIFICATION.md |
| Idempotent backfill | `node scripts/kb-sync.cjs --full-rebuild --source db` (2nd run = 0 writes) |

---

## Sampling Rate

- **After every task commit:** Run targeted vitest file OR `validate-kb.cjs` (whichever corresponds to that task)
- **After every plan wave:** Run full vitest suite + `validate-kb.cjs` + grep regression + (Plan 03 onwards) `docker compose build docflow`
- **Before `/gsd:complete-phase`:** Full suite green + build green + 3-prompt CatBot oracle evidence pasted to `155-VERIFICATION.md`
- **Max feedback latency:** ≤90 seconds (targeted vitest + validate-kb)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-T1 | 155-01 | 1 | KB-29 | KB validator | `node scripts/validate-kb.cjs` | ✅ existing | ⬜ planned |
| 01-T2 | 155-01 | 1 | KB-28 | unit (TDD) | `cd app && npx vitest run src/lib/__tests__/canvas-rules.test.ts --reporter=dot` | ✅ (rewritten in task) | ⬜ planned |
| 01-T3 | 155-01 | 1 | KB-28, KB-29 | integration smoke | `node scripts/validate-kb.cjs && cd app && npx vitest run src/lib/__tests__/{canvas-rules,intent-job-executor,intent-job-executor-proposal}.test.ts --reporter=dot` | ✅ existing | ⬜ planned |
| 02-T1 | 155-02 | 2 | KB-30 | smoke (shell) | `test ! -d app/data/knowledge && test ! -d .planning/knowledge && test ! -f skill_orquestador_catbot_enriched.md && test ! -f app/src/lib/knowledge-tree.ts && test ! -f app/src/lib/__tests__/knowledge-tree.test.ts && test ! -f app/src/lib/__tests__/knowledge-tools-sync.test.ts && test ! -f app/src/lib/__tests__/catbot-tools-query-knowledge.test.ts && test ! -f app/src/lib/__tests__/canvas-rules-scope.test.ts && test ! -d app/src/app/api/catbot/knowledge/tree && test ! -f app/src/components/settings/catbot-knowledge/tab-knowledge-tree.tsx` | ✅ shell-level | ⬜ planned |
| 02-T2 | 155-02 | 2 | KB-31 | grep + vitest | `! grep -rn 'loadKnowledgeArea\|getAllKnowledgeAreas\|knowledge-tree\|query_knowledge\|explain_feature\|ConceptItemSchema\|KnowledgeEntrySchema\|TabKnowledgeTree' app/src/ && cd app && npx vitest run --reporter=dot` | ✅ existing | ⬜ planned |
| 02-T3 | 155-02 | 2 | KB-32, KB-33 | docker build + lint | `docker compose build docflow && wc -l CLAUDE.md && ! grep -i 'knowledge tree' CLAUDE.md` | ✅ existing | ⬜ planned |
| 03-T1 | 155-03 | 3 | KB-35 | taxonomy smoke | `node -e "const t = require('./.docflow-kb/_schema/tag-taxonomy.json'); if (!t.cross_cutting.includes('critical')) process.exit(1); if (!['R26','R27','R28','R29'].every(r => t.rules.includes(r))) process.exit(1);"` | ✅ shell-level | ⬜ planned |
| 03-T2 | 155-03 | 3 | KB-34 | KB validator | `node scripts/validate-kb.cjs && ls .docflow-kb/rules/R2[6789]*.md` | ✅ existing | ⬜ planned |
| 03-T3 | 155-03 | 3 | KB-36 | docker build + backfill idempotence | `docker compose build docflow && docker compose up -d && sleep 3 && node scripts/kb-sync.cjs --full-rebuild --source db && node scripts/validate-kb.cjs && node scripts/kb-sync.cjs --full-rebuild --source db` (2nd run = 0 writes) | ✅ existing | ⬜ planned |
| 04-T1 | 155-04 | 4 | KB-37 | grep smoke | `grep -c 'Rollback de la migración v29.1' .docflow-kb/_manual.md && grep -c 'Phase 155 Cleanup' .docflow-kb/_manual.md && grep -c 'productivo (post-155)' .docflow-kb/_manual.md && node scripts/validate-kb.cjs` | ✅ shell-level | ⬜ planned |
| 04-T2 | 155-04 | 4 | KB-38 | integration (oracle) | `test -f .planning/phases/155-kb-cleanup-final/155-VERIFICATION.md && grep -c 'CatBot Oracle Evidence' .planning/phases/155-kb-cleanup-final/155-VERIFICATION.md && grep -c 'tool_calls' .planning/phases/155-kb-cleanup-final/155-VERIFICATION.md` (manual-Oracle: POST /api/catbot/chat × 3 prompts, verbatim paste) | ⬜ Wave 4 only | ⬜ planned |
| 04-T3 | 155-04 | 4 | KB-39 | traceability smoke | `count_complete=$(grep -cE 'KB-[0-9]+ \| Phase 155 \| Complete' .planning/REQUIREMENTS.md); count_ticked=$(grep -cE '- \[x\] \*\*KB-(2[89]\|3[0-9])\*\*' .planning/REQUIREMENTS.md); test "$count_complete" -eq 12 && test "$count_ticked" -eq 12` | ✅ shell-level | ⬜ planned |
| 04-T4 | 155-04 | 4 | KB-37, KB-38, KB-39 | UAT checkpoint (human) | MANUAL: rollback recipes read-through + oracle evidence inspection + docker ps + grep spot-check + traceability count | ❌ human | ⬜ planned |

*Status: ⬜ planned · ✅ green · ❌ red · ⚠️ flaky · ⚙️ blocked*

---

## Wave 0 Requirements

Phase 155 has **no Wave 0 setup tasks** — all infrastructure (vitest, validate-kb.cjs, kb-sync.cjs, docker compose, curl POST /api/catbot/chat) already exists from Phases 149-154. Wave 1 starts immediately with Plan 01 Task 1 (create SE/DA atoms).

Notes on pre-phase baselines (informational, no action needed):
- `knowledge-tree.test.ts` + `knowledge-tools-sync.test.ts` are currently **green** (32/32 per 2026-04-20 vitest run, Research §Pitfall 7). Wave 2 deletes them wholesale — they "die with the subject", not "fix red-to-green".
- `validate-kb.cjs` is currently green against the 126-entry KB. Each plan must preserve exit 0.
- Legacy path grep baseline: `grep -rn 'app/data/knowledge\|\.planning/knowledge'` in `app/src/` has ~50 hits today; expected 0 after Plan 02 merge.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CatBot answers 3 oracle prompts using ONLY KB after legacy layers are deleted | KB-38 | Proving "only source" requires interacting with the live assistant and inspecting tool_calls + reply semantics | 1. Confirm Docker container healthy (post-Plan-03 rebuild). 2. POST /api/catbot/chat with 3 prompts (list_cat_paws, canvas-executor-editable, design rules). 3. Paste verbatim JSON responses into `155-VERIFICATION.md` §KB-38. 4. Verify signals: no `query_knowledge` in tool_calls, R26 cited, SE/DA rules listed. |
| Rollback recipes in `_manual.md` are followable | KB-37 | Documentation-quality judgment | Dry-read the Rollback section. For each of the 4 recipes, verify: command syntax is valid (no typos), file paths exist or are documented as "to be restored", SHA placeholders are understood by the human operator. No execution — just critical reading. |
| Canvas-executor + IntentJobExecutor architect loop still loads rules from the new KB backing store | KB-28 | End-to-end architect loop needs real LLM call + real canvas creation; vitest covers unit-level but not runtime | Trigger one real CatFlow canvas generation via UI or API (`POST /api/catbot/intent` with a simple canvas-create intent). Inspect architect iteration logs: `{{RULES_INDEX}}` template MUST be substituted with the R01-R29 + SE/DA index text (not the literal placeholder). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are explicitly manual (Task 04-T4 is the human UAT gate per CLAUDE.md §Protocolo de Testing)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (Plan 04 Task 4 is the only manual, and it's the phase close gate)
- [x] Wave 0 covers all MISSING references (N/A — no Wave 0 needed; all infra exists)
- [x] No watch-mode flags (all commands use `vitest run` + `--reporter=dot`)
- [x] Feedback latency < 90s (targeted vitest files + validate-kb.cjs all complete in ≤10s; full docker build in ~60-90s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for `/gsd:execute-phase 155 --wave 1`
