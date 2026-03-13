---
phase: 34
slug: streaming-frontend
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-13
---

# Phase 34 — Validation Strategy

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
- **After every plan wave:** Run `cd app && npm run build` + Docker deploy + manual browser verification
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 34-01-01 | 01 | 1 | STRM-04, STRM-05, STRM-06 | build | `cd app && npm run build` | N/A | ⬜ pending |
| 34-01-02 | 01 | 1 | STRM-07 | build | `cd app && npm run build` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. TypeScript compilation via `npm run build` is sufficient to verify correct hook/component integration. No Playwright test infrastructure needed (Phase 36).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Blinking cursor appears during streaming | STRM-04 | Visual CSS animation verification | 1. Deploy to Docker 2. Send chat message 3. Verify blinking U+2588 cursor at end of streaming text 4. Verify cursor disappears when done |
| Stop button stops generation | STRM-05 | Requires running LLM stream | 1. Send chat message 2. Click "Parar generacion" during streaming 3. Verify tokens stop immediately and cursor removed |
| Auto-scroll follows tokens | STRM-06 | Requires visual scroll behavior check | 1. Send long message that generates many tokens 2. Verify scroll follows latest content 3. Verify manual scroll up disengages auto-scroll |
| Progressive markdown rendering | STRM-07 | Requires visual markdown check | 1. Ask LLM to generate markdown with headers, lists, code 2. Verify elements render as tokens arrive, not after completion |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
