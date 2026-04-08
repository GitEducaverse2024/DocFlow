---
phase: 118
slug: foundation-catbot-db-knowledge-tree
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 118 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already configured) |
| **Config file** | app/vitest.config.ts |
| **Quick run command** | `cd app && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd app && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd app && npx vitest run && npm run build --prefix app`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 118-01-01 | 01 | 1 | INFRA-01 | unit | `cd app && npx vitest run src/lib/__tests__/catbot-db.test.ts -t "creates tables"` | ❌ W0 | ⬜ pending |
| 118-01-02 | 01 | 1 | INFRA-02 | unit | `cd app && npx vitest run src/lib/__tests__/catbot-db.test.ts -t "CRUD"` | ❌ W0 | ⬜ pending |
| 118-02-01 | 02 | 1 | INFRA-03 | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts -t "files exist"` | ❌ W0 | ⬜ pending |
| 118-02-02 | 02 | 1 | INFRA-04 | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts -t "schema"` | ❌ W0 | ⬜ pending |
| 118-02-03 | 02 | 1 | INFRA-05 | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts -t "coverage"` | ❌ W0 | ⬜ pending |
| 118-03-01 | 03 | 2 | INFRA-06 | integration | `cd app && npx vitest run src/lib/__tests__/catbot-db.test.ts -t "conversation"` | ❌ W0 | ⬜ pending |
| 118-03-02 | 03 | 2 | INFRA-07 | integration | `cd app && npx vitest run src/lib/__tests__/catbot-db.test.ts -t "migrate"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/lib/__tests__/catbot-db.test.ts` — stubs for INFRA-01, INFRA-02, INFRA-06, INFRA-07
- [ ] `app/src/lib/__tests__/knowledge-tree.test.ts` — stubs for INFRA-03, INFRA-04, INFRA-05

*Existing infrastructure covers framework needs (vitest already configured).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| localStorage migration works in browser | INFRA-07 | Requires real browser localStorage | 1. Add test messages to localStorage key `docatflow_catbot_messages` 2. Reload CatBot panel 3. Verify messages appear from DB 4. Verify localStorage key removed |
| CatBot can verify features via tools | All | CatBot oracle protocol | Ask CatBot to list knowledge areas, check conversation history, verify DB tables exist |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
