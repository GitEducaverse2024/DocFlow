---
phase: 33
slug: streaming-backend
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-13
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compilation (npm run build) + manual curl/browser verification |
| **Config file** | tsconfig.json (existing) |
| **Quick run command** | `cd app && npm run build` |
| **Full suite command** | `cd app && npm run build` + Docker deploy + manual SSE curl tests |
| **Estimated runtime** | ~30 seconds (build) |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm run build`
- **After every plan wave:** Run `cd app && npm run build` + Docker deploy + manual curl SSE test
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 33-01-01 | 01 | 1 | STRM-01 | build | `cd app && npm run build` | N/A | ⬜ pending |
| 33-01-02 | 01 | 1 | STRM-02 | build | `cd app && npm run build` | N/A | ⬜ pending |
| 33-01-03 | 01 | 1 | STRM-03 | build | `cd app && npm run build` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. TypeScript compilation via `npm run build` is sufficient to verify correct streaming implementation (wrong imports, missing exports, type errors cause build failures). No Playwright test infrastructure needed (that's Phase 36).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chat RAG streams tokens progressively | STRM-01 | Requires running LiteLLM + browser | 1. Deploy to Docker 2. Open Chat RAG for any project 3. Send message 4. Verify tokens appear progressively in DevTools Network tab (text/event-stream) |
| CatBot streams with tool call indicators | STRM-02 | Requires running LiteLLM + tool execution | 1. Deploy to Docker 2. Open CatBot 3. Send message that triggers tool use 4. Verify tool_call events appear between token streams |
| Process shows SSE stage progress | STRM-03 | Requires running LiteLLM + document sources | 1. Deploy to Docker 2. Create project with sources 3. Process document 4. Verify stage events (preparando, enviando, generando, guardando) appear progressively |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
