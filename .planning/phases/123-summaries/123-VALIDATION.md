---
phase: 123
slug: summaries
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 123 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already configured) |
| **Config file** | app/vitest.config.ts |
| **Quick run command** | `cd app && npx vitest run src/lib/__tests__/catbot-summary.test.ts` |
| **Full suite command** | `cd app && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command above
- **After every plan wave:** Run `cd app && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 123-01-01 | 01 | 1 | SUMMARY-01 | unit | `npx vitest run src/lib/__tests__/catbot-summary.test.ts -t "compressDaily"` | ❌ W0 | ⬜ pending |
| 123-01-02 | 01 | 1 | SUMMARY-02 | unit | `npx vitest run src/lib/__tests__/catbot-summary.test.ts -t "structured"` | ❌ W0 | ⬜ pending |
| 123-01-03 | 01 | 1 | SUMMARY-03, SUMMARY-04 | unit | `npx vitest run src/lib/__tests__/catbot-summary.test.ts -t "Weekly\|Monthly"` | ❌ W0 | ⬜ pending |
| 123-01-04 | 01 | 1 | SUMMARY-05 | unit | `npx vitest run src/lib/__tests__/catbot-summary.test.ts -t "decisions"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/lib/__tests__/catbot-summary.test.ts` — stubs for SUMMARY-01..05
- [ ] DB helpers: getConversationsByDateRange, summaryExists, getActiveUserIds in catbot-db.ts

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Scheduler runs daily summary generation | SUMMARY-01 | Requires time-based scheduler | 1. Check logs for SummaryService.start() 2. Manually trigger via test endpoint or direct call |
| CatBot can report summaries | All | CatBot oracle protocol | Ask CatBot "resumen del dia de ayer" or "lista mis resumenes" |
| Decisions accumulate across levels | SUMMARY-05 | Full chain: day→week→month | Insert test daily summaries with decisions, trigger weekly, verify all decisions preserved |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
