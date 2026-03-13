---
phase: 37
slug: testing-dashboard-log-viewer
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-13
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compilation (npm run build) + manual browser verification |
| **Config file** | tsconfig.json (existing) |
| **Quick run command** | `cd app && npm run build` |
| **Full suite command** | `cd app && npm run build` + Docker deploy + manual browser test |
| **Estimated runtime** | ~30 seconds (build) |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm run build`
- **After every plan wave:** Run `cd app && npm run build` + Docker deploy + manual verification
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 37-01-01 | 01 | 1 | TEST-09, TEST-01 | build | `cd app && npm run build` | N/A | ⬜ pending |
| 37-01-02 | 01 | 1 | TEST-02, TEST-03, TEST-04, TEST-05 | build | `cd app && npm run build` | N/A | ⬜ pending |
| 37-02-01 | 02 | 2 | TEST-06, TEST-07 | build | `cd app && npm run build` | N/A | ⬜ pending |
| 37-02-02 | 02 | 2 | TEST-08 | build | `cd app && npm run build` | N/A | ⬜ pending |
| 37-03-01 | 03 | 2 | LOG-04, LOG-05, LOG-06 | build | `cd app && npm run build` | N/A | ⬜ pending |
| 37-03-02 | 03 | 2 | LOG-07 | build | `cd app && npm run build` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. TypeScript compilation via `npm run build` is sufficient to verify correct API route creation, component integration, and hook wiring. Playwright test infrastructure already exists from Phase 36.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Ejecutar todos" triggers Playwright run and polls progress | TEST-04, TEST-05 | Requires Docker with Playwright + running app | 1. Deploy to Docker 2. Navigate to /testing 3. Click "Ejecutar todos" 4. Verify progress polling every 2s |
| Expandable test results with error/screenshot/code | TEST-03, TEST-07 | Requires completed test run with failures | 1. Run tests 2. Expand failed test 3. Verify error message, screenshot, test code visible |
| History tab shows last 10 runs | TEST-06 | Requires multiple test runs in DB | 1. Run tests multiple times 2. Click history tab 3. Verify 10 entries with timestamps |
| AI test generation produces valid spec | TEST-08 | Requires LLM service | 1. Click "Generar test" 2. Select section 3. Verify generated code in modal |
| Log viewer streams with 3s polling | LOG-04 | Requires running app generating logs | 1. Navigate to /testing log tab 2. Trigger actions in app 3. Verify logs appear within 3s |
| Log filters by level/source/text | LOG-05 | Interactive UI verification | 1. Open log viewer 2. Filter by error level 3. Filter by source 4. Search text |
| "Descargar logs" downloads JSONL file | LOG-07 | Requires browser download verification | 1. Click "Descargar logs" 2. Verify .jsonl file downloads |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
