---
phase: 23
slug: modelo-datos-api-crud-lista-wizard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Next.js build (`npm run build`) + manual API curl |
| **Config file** | next.config.js |
| **Quick run command** | `cd app && npx tsc --noEmit` |
| **Full suite command** | `cd app && npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npx tsc --noEmit`
- **After every plan wave:** Run `cd app && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | DATA-01..03 | build | `cd app && npm run build` | ✅ | ⬜ pending |
| 23-01-02 | 01 | 1 | DATA-04..08 | build + curl | `cd app && npm run build` | ✅ | ⬜ pending |
| 23-01-03 | 01 | 1 | DATA-09..10 | build + curl | `cd app && npm run build` | ✅ | ⬜ pending |
| 23-01-04 | 01 | 1 | DATA-11..12 | build + curl | `cd app && npm run build` | ✅ | ⬜ pending |
| 23-01-05 | 01 | 1 | NAV-01..02 | build | `cd app && npm run build` | ✅ | ⬜ pending |
| 23-01-06 | 01 | 1 | LIST-01..04 | build | `cd app && npm run build` | ✅ | ⬜ pending |
| 23-01-07 | 01 | 1 | WIZ-01..03 | build | `cd app && npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — npm run build is the validation gate.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sidebar shows Canvas link between Tareas and Conectores | NAV-01 | Visual layout position | Open app, verify sidebar order |
| Card grid shows thumbnails, badges, counts | LIST-01 | Visual rendering | Create 2+ canvases, verify card layout |
| Wizard 2-step flow creates canvas and redirects | WIZ-01..03 | User interaction flow | Click "+ Nuevo", complete both steps |
| Filter tabs show correct counts | LIST-02 | Client-side filtering | Create canvases with different modes, verify tab counts |
| Empty state visible when 0 canvases | LIST-04 | Conditional rendering | Delete all canvases, verify empty state |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
