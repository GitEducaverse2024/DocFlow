---
phase: 35
slug: notifications-system
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-13
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compilation (npm run build) + manual browser verification |
| **Config file** | tsconfig.json (existing) |
| **Quick run command** | `cd app && npm run build` |
| **Full suite command** | `cd app && npm run build` + Docker deploy + manual notification triggers |
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
| 35-01-01 | 01 | 1 | NOTIF-01, NOTIF-02 | build | `cd app && npm run build` | N/A | ⬜ pending |
| 35-01-02 | 01 | 1 | NOTIF-02, NOTIF-06 | build | `cd app && npm run build` | N/A | ⬜ pending |
| 35-02-01 | 02 | 2 | NOTIF-03, NOTIF-04, NOTIF-05 | build | `cd app && npm run build` | N/A | ⬜ pending |
| 35-02-02 | 02 | 2 | NOTIF-07 | build | `cd app && npm run build` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. TypeScript compilation via `npm run build` is sufficient to verify correct DB schema, API routes, hooks, and component integration. No Playwright needed (Phase 36).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Notifications auto-created after process/RAG/task/canvas completion | NOTIF-07 | Requires running LLM + actual process execution | 1. Deploy to Docker 2. Process a document 3. Check bell dropdown shows new notification |
| Bell badge updates every 15s | NOTIF-03 | Requires timing verification in browser | 1. Create notification via API 2. Observe badge appears within 15s without page refresh |
| Dropdown shows last 20 with correct fields | NOTIF-04 | Visual layout verification | 1. Create multiple notifications 2. Click bell 3. Verify severity icon, title, message, time, "Ver" link |
| Full panel filtering and pagination | NOTIF-05 | Interactive UI verification | 1. Navigate to notifications panel 2. Filter by type and severity 3. Verify pagination works |
| "Marcar todas como leidas" clears badge | NOTIF-06 | Interactive UI verification | 1. Have unread notifications 2. Click "Marcar todas como leidas" 3. Verify badge count goes to 0 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
