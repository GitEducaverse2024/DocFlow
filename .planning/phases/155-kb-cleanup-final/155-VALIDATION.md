---
phase: 155
slug: kb-cleanup-final
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 155 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.x |
| **Config file** | `app/vitest.config.ts` |
| **Quick run command** | `cd app && npx vitest run --reporter=dot <targeted-file>` |
| **Full suite command** | `cd app && npx vitest run` |
| **Estimated runtime** | ~90 seconds (full suite) / ~5 seconds (targeted) |

Additional validators (non-vitest):

| Purpose | Command |
|---------|---------|
| KB schema / taxonomy validation | `node .docflow-kb/_scripts/validate-kb.cjs` |
| Build health (catches unused imports / dead refs) | `cd app && npm run build` |
| Grep-based regression (legacy paths must be gone) | `rg "app/data/knowledge\|\.planning/knowledge\|knowledge-tree" app/src` |
| CatBot oracle E2E | manual prompt execution against running container + paste response |

---

## Sampling Rate

- **After every task commit:** Run targeted vitest file OR `validate-kb.cjs` (whichever corresponds to that task)
- **After every plan wave:** Run full vitest suite + `validate-kb.cjs` + grep regression
- **Before `/gsd:verify-work`:** Full suite green + build green + CatBot oracle evidence pasted
- **Max feedback latency:** ≤90 seconds

---

## Per-Task Verification Map

*Filled by gsd-planner during planning. Each task row maps to a PLAN.md task and names the automated command that proves it works. Oracle-based verifications (CatBot prompts) go in the Manual section.*

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD-by-planner | — | — | — | — | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Re-baseline `knowledge-tree.test.ts` + `knowledge-tools-sync.test.ts` as **expected-to-delete** (research showed they currently pass — Wave 2 removes them together with the code under test)
- [ ] Confirm `validate-kb.cjs` runs green against current `.docflow-kb/` before any mutation
- [ ] Capture baseline `rg` count for legacy paths so Wave 2 can assert zero

*All other infrastructure (vitest, validate-kb.cjs) already exists — no installs needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CatBot answers questions about DocFlow features using ONLY the KB after legacy layers are deleted | REQ: KB single-source-of-truth | Proving "only source" requires interacting with the live assistant and inspecting reasoning | 1) Rebuild Docker with legacy knowledge deleted. 2) Ask CatBot 3 oracle prompts (canvas rules, connector, skill). 3) Paste responses into `155-VERIFICATION.md` as evidence. |
| Rollback instructions in `_manual.md` are followable | REQ: rollback plan | Documentation-quality judgment | Dry-read the rollback section, confirm each git command/path is accurate against repo state |
| Canvas executor still loads rules after `canvas-rules.ts` rewrite | REQ: no runtime regression | Requires running IntentJobExecutor architect loop end-to-end | Trigger one real CatFlow canvas generation in UI, confirm architect phase uses R-series rules from KB |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (filled by planner)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
