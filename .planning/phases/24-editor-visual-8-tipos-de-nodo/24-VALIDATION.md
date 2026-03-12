---
phase: 24
slug: editor-visual-8-tipos-de-nodo
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Next.js build (`npm run build`) + manual browser verification |
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
| 24-01-01 | 01 | 1 | EDIT-01, EDIT-04, EDIT-07 | build | `cd app && npm run build` | ✅ | ⬜ pending |
| 24-01-02 | 01 | 1 | EDIT-02, EDIT-03, EDIT-05, EDIT-11 | build | `cd app && npm run build` | ✅ | ⬜ pending |
| 24-02-01 | 02 | 2 | NODE-01..NODE-08 | build | `cd app && npm run build` | ✅ | ⬜ pending |
| 24-02-02 | 02 | 2 | EDIT-06 | build | `cd app && npm run build` | ✅ | ⬜ pending |
| 24-03-01 | 03 | 2 | EDIT-08, EDIT-09, EDIT-10 | build | `cd app && npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — npm run build is the validation gate.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Canvas loads with zinc-950 bg, dot grid, pan/zoom | EDIT-01, EDIT-04 | Visual rendering | Open /canvas/{id}, verify dark background with dots, pan and zoom |
| Dragging node from palette creates it on canvas | EDIT-03 | Drag interaction | Drag Agent icon from palette onto canvas |
| Cycle detection blocks invalid edge | EDIT-05 | Visual interaction | Try connecting output back to ancestor node |
| Node config panel shows type-specific form | EDIT-06 | Visual rendering | Click Agent node, verify agent selector appears |
| Auto-save indicator transitions | EDIT-08 | Visual + network | Edit canvas, watch indicator change to Guardando then Guardado |
| Undo/Redo works with Ctrl+Z/Ctrl+Shift+Z | EDIT-09 | Keyboard interaction | Add node, Ctrl+Z removes it, Ctrl+Shift+Z restores it |
| Auto-layout repositions nodes without overlap | EDIT-10 | Visual layout | Click Auto-organizar, verify nodes spread out cleanly |
| 8 node types render with correct colors/shapes | NODE-01..08 | Visual rendering | Create each node type, verify color and handle count |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
