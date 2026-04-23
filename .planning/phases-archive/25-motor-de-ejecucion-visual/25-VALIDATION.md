---
phase: 25
slug: motor-de-ejecucion-visual
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 25 — Validation Strategy

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
| 25-01-01 | 01 | 1 | EXEC-01, EXEC-02, EXEC-03, EXEC-10, EXEC-13 | build | `cd app && npm run build` | ✅ | ⬜ pending |
| 25-01-02 | 01 | 1 | EXEC-04, EXEC-05, EXEC-06, EXEC-12 | build | `cd app && npm run build` | ✅ | ⬜ pending |
| 25-02-01 | 02 | 2 | EXEC-07, EXEC-08, EXEC-09 | build | `cd app && npm run build` | ✅ | ⬜ pending |
| 25-02-02 | 02 | 2 | EXEC-11 | build | `cd app && npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — npm run build is the validation gate.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Ejecutar button starts execution, canvas enters read-only mode | EXEC-01, EXEC-12 | Interactive flow | Click Ejecutar, verify nodes can't be dragged/connected |
| Nodes change color by state: violet pulse (running), emerald+check (done), red+x (failed), amber+clock (waiting) | EXEC-04 | Visual rendering | Execute canvas, watch node colors transition |
| Edges animate with violet stroke during execution | EXEC-05 | Visual animation | Execute canvas, verify active edges animate |
| Toolbar shows "Ejecutando paso X/Y" with elapsed time | EXEC-06 | Visual rendering | Execute multi-node canvas, verify step counter increments |
| CHECKPOINT dialog shows predecessor output with Aprobar/Rechazar buttons | EXEC-09 | Interactive dialog | Execute canvas with CHECKPOINT node, verify dialog appears |
| Cancel button stops execution, pending nodes stay in pending state | EXEC-10 | Interactive flow | Start execution, click Cancel, verify incomplete nodes are pending |
| Completed execution shows all green nodes, expandable output, stats (time, tokens, cost) | EXEC-11 | Visual rendering | Complete execution, verify output panel and stats display |
| CONDITION node routes to correct branch, non-chosen branch marked skipped | EXEC-03 | Logic verification | Execute canvas with CONDITION, verify correct branch executes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
