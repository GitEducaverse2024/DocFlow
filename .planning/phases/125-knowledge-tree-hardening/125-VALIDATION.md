---
phase: 125
slug: knowledge-tree-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 125 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (installed, configured) |
| **Config file** | app/vitest.config.ts |
| **Quick run command** | `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts` |
| **Full suite command** | `cd app && npm run test:unit` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts`
- **After every plan wave:** Run `cd app && npm run test:unit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 125-01-01 | 01 | 1 | KTREE-01, KTREE-05 | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts -t "updated_at"` | ❌ W0 | ⬜ pending |
| 125-01-02 | 01 | 1 | KTREE-04 | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts -t "template"` | ❌ W0 | ⬜ pending |
| 125-02-01 | 02 | 2 | KTREE-02 | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-tools-sync.test.ts` | ❌ W0 | ⬜ pending |
| 125-02-02 | 02 | 2 | KTREE-03 | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts -t "sources"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/knowledge-tools-sync.test.ts` — new file for KTREE-02 bidirectional tool sync
- [ ] Update `knowledge-tree.test.ts` — add updated_at assertions, source existence checks, template validation

*Existing infrastructure covers framework and config; only test stubs needed.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
