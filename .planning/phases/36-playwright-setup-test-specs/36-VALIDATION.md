---
phase: 36
slug: playwright-setup-test-specs
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-13
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright @playwright/test + TypeScript compilation |
| **Config file** | app/playwright.config.ts |
| **Quick run command** | `cd app && npm run build` |
| **Full suite command** | `cd app && npx playwright test` |
| **Estimated runtime** | ~30 seconds (build), ~120 seconds (full suite with 19 specs) |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm run build`
- **After every plan wave:** Run `cd app && npm run build` (full Playwright suite requires running Docker app)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 1 | PLAY-01, PLAY-02 | build | `cd app && npm run build` | N/A | ⬜ pending |
| 36-01-02 | 01 | 1 | PLAY-03, PLAY-04 | build | `cd app && npm run build` | N/A | ⬜ pending |
| 36-02-01 | 02 | 2 | E2E-01..E2E-05 | build | `cd app && npm run build` | N/A | ⬜ pending |
| 36-02-02 | 02 | 2 | E2E-06..E2E-10 | build | `cd app && npm run build` | N/A | ⬜ pending |
| 36-03-01 | 03 | 2 | E2E-11..E2E-15 | build | `cd app && npm run build` | N/A | ⬜ pending |
| 36-03-02 | 03 | 2 | API-01..API-04 | build | `cd app && npm run build` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

This phase IS the test infrastructure setup. Playwright installation and configuration happen in Plan 01 Task 1 (PLAY-01).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| All 19 specs execute against running app | PLAY-01 | Requires Docker app running at localhost:3500 | 1. Deploy to Docker 2. `cd app && npx playwright test` 3. Verify 19 specs run with JSON + HTML reports |
| test_runs table populated after execution | PLAY-04 | Requires running specs + DB check | 1. Run specs 2. Check `SELECT * FROM test_runs ORDER BY id DESC LIMIT 1` |
| [TEST] data cleaned up after run | PLAY-03 | Requires DB inspection after globalTeardown | 1. Run specs 2. Check no [TEST]-prefixed rows in projects, agents, tasks tables |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
