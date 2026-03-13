---
phase: 32
slug: logging-foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-13
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compilation (npm run build) + manual verification |
| **Config file** | tsconfig.json (existing) |
| **Quick run command** | `cd app && npm run build` |
| **Full suite command** | `cd app && npm run build` (TypeScript catches import/signature errors) |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm run build`
- **After every plan wave:** Run `cd app && npm run build` + Docker deploy + manual endpoint check
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | LOG-01 | build | `cd app && npm run build` | N/A | ⬜ pending |
| 32-01-02 | 01 | 1 | LOG-02 | build + manual | `cd app && npm run build` | N/A | ⬜ pending |
| 32-01-03 | 01 | 1 | LOG-03 | build | `cd app && npm run build` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. TypeScript compilation via `npm run build` is sufficient to verify correct logger integration (wrong number of arguments or missing imports cause build failures). No Playwright test infrastructure needed (that's Phase 36).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| JSONL entries appear in /app/data/logs/ with correct format | LOG-01 | No automated test framework yet (Phase 36) | 1. Trigger any endpoint (chat, process, etc.) 2. Check `ls /app/data/logs/` 3. Read last line with `tail -1 /app/data/logs/app-YYYY-MM-DD.jsonl` 4. Verify JSON has ts, level, source, message fields |
| All main endpoints produce log entries | LOG-02 | Requires running app + endpoint triggers | 1. Deploy to Docker 2. Trigger chat, process, RAG, task execute, canvas execute, connector test 3. Verify each produces JSONL entries with correct `source` field |
| Files older than 7 days deleted | LOG-03 | Requires time-based file manipulation | 1. Create fake old log file: `touch -d "8 days ago" /app/data/logs/app-2026-03-05.jsonl` 2. Restart app 3. Verify file is deleted |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
