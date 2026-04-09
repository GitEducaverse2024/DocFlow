---
phase: 127
slug: knowledge-admin-dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 127 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | app/vitest.config.ts |
| **Quick run command** | `cd ~/docflow/app && npx vitest run` |
| **Full suite command** | `cd ~/docflow/app && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd ~/docflow/app && npx vitest run`
- **After every plan wave:** Run `cd ~/docflow/app && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green + manual browser verification of 3 tabs
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 127-01-01 | 01 | 1 | KADMIN-02, KADMIN-03, KADMIN-04 | unit | `npx vitest run src/lib/__tests__/catbot-knowledge-stats.test.ts` | ❌ W0 | ⬜ pending |
| 127-02-01 | 02 | 2 | KADMIN-01 | manual | Visual verification — 3 tabs render in Settings | N/A | ⬜ pending |
| 127-02-02 | 02 | 2 | KADMIN-02 | manual | Learned Entries tab shows staging + validated + metrics | N/A | ⬜ pending |
| 127-02-03 | 02 | 2 | KADMIN-03 | manual | Knowledge Gaps tab shows gaps with filters and resolve button | N/A | ⬜ pending |
| 127-02-04 | 02 | 2 | KADMIN-04 | manual | Knowledge Tree tab shows 7 areas with stats and completeness | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/catbot-knowledge-stats.test.ts` — test SQL aggregates for getKnowledgeStats()
- [ ] Existing test suite must stay green after changes

*Note: UI components validated primarily via CatBot-as-oracle protocol (CLAUDE.md). API route tests secondary due to better-sqlite3 dependency.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 3 tabs render in Settings section | KADMIN-01 | UI visual layout | Open Settings, verify "Conocimiento de CatBot" section with 3 tabs |
| Learned Entries shows staging + metrics | KADMIN-02 | Interactive UI | Click Learned tab, verify entries and validate/reject buttons |
| Knowledge Gaps shows filters + resolve | KADMIN-03 | Interactive UI | Click Gaps tab, verify filter by area/status, resolve button |
| Knowledge Tree shows 7 areas with completeness | KADMIN-04 | Visual indicator | Click Tree tab, verify 7 area cards/rows with stats |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
