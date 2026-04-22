---
phase: 159
slug: backend-passthrough-litellm-reasoning
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
---

# Phase 159 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | `app/vitest.config.ts` (existing) |
| **Quick run command** | `cd app && npm run test:unit -- src/lib/services/__tests__/alias-routing.test.ts src/lib/services/stream-utils.test.ts src/app/api/alias-routing/__tests__/route.test.ts` |
| **Full suite command** | `cd app && npm run test:unit` |
| **Estimated runtime** | ~5s quick / ~30s full |

---

## Sampling Rate

- **After every task commit:** Run quick command (3 test files, < 5s).
- **After every plan wave:** Run `cd app && npm run test:unit -- src/lib/services src/app/api/alias-routing src/app/api/catbot src/app/api/models` (domain slice, < 15s).
- **Before `/gsd:verify-work`:** `cd app && npm run lint && npm run build && npm run test:unit` green; Docker smoke via `docker compose build --no-cache && docker compose up -d` + manual curl PATCH against `/api/alias-routing` validating a 400 and a 200.
- **Max feedback latency:** 15 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 159-01-* | 01 | 1 | CFG-03 | unit | `cd app && npm run test:unit -- src/lib/services/__tests__/alias-routing.test.ts -t "resolveAliasConfig"` | ✅ EXTEND | ⬜ pending |
| 159-01-* | 01 | 1 | CFG-03 | unit | `cd app && npm run test:unit -- src/lib/services/__tests__/alias-routing.test.ts -t "fallback with config"` | ✅ EXTEND | ⬜ pending |
| 159-01-* | 01 | 1 | CFG-03 (back-compat) | static+unit | `cd app && npm run build` + `cd app && npm run test:unit -- alias-routing` | ✅ EXTEND | ⬜ pending |
| 159-02-* | 02 | 1 | CFG-02 | unit | `cd app && npm run test:unit -- src/app/api/alias-routing/__tests__/route.test.ts -t "reasoning_effort"` | ✅ EXTEND | ⬜ pending |
| 159-02-* | 02 | 1 | CFG-02 | unit | `cd app && npm run test:unit -- src/app/api/alias-routing/__tests__/route.test.ts -t "capability conflict"` | ✅ EXTEND | ⬜ pending |
| 159-02-* | 02 | 1 | CFG-02 | unit | `cd app && npm run test:unit -- src/app/api/alias-routing/__tests__/route.test.ts -t "max_tokens cap"` | ✅ EXTEND | ⬜ pending |
| 159-02-* | 02 | 1 | CFG-02 | unit | `cd app && npm run test:unit -- src/app/api/alias-routing/__tests__/route.test.ts -t "thinking_budget"` | ✅ EXTEND | ⬜ pending |
| 159-02-* | 02 | 1 | CFG-02 | unit | `cd app && npm run test:unit -- src/app/api/alias-routing/__tests__/route.test.ts -t "persists new fields"` | ✅ EXTEND | ⬜ pending |
| 159-03-* | 03 | 2 | PASS-01 | unit | `cd app && npm run test:unit -- src/lib/services/stream-utils.test.ts -t "reasoning_effort in body"` | ✅ EXTEND | ⬜ pending |
| 159-03-* | 03 | 2 | PASS-02 | unit | `cd app && npm run test:unit -- src/lib/services/stream-utils.test.ts -t "thinking in body"` | ✅ EXTEND | ⬜ pending |
| 159-04-* | 04 | 3 | PASS-03 | unit | `cd app && npm run test:unit -- src/app/api/catbot/chat/__tests__/route.test.ts -t "max_tokens fallback"` | ❌ W0 | ⬜ pending |
| 159-04-* | 04 | 3 | PASS-04 | unit | `cd app && npm run test:unit -- src/app/api/catbot/chat/__tests__/route.test.ts -t "streaming reasoning propagation"` | ❌ W0 | ⬜ pending |
| 159-04-* | 04 | 3 | PASS-04 | unit | `cd app && npm run test:unit -- src/app/api/catbot/chat/__tests__/route.test.ts -t "non-streaming reasoning propagation"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs finalized by gsd-planner; rows above map requirement → test commands per plan.*

---

## Wave 0 Requirements

- [ ] `app/src/app/api/catbot/chat/__tests__/route.test.ts` — **does not exist.** Covers PASS-03 + PASS-04 (streaming + non-streaming param propagation, max_tokens fallback). Mocks `streamLiteLLM`, `resolveAliasConfig`, `getToolsForLLM`, `db`.
- [ ] Shared fixture helper `makeMidRow({ model_key, supports_reasoning, max_tokens_cap })` — add inline in `app/src/app/api/alias-routing/__tests__/route.test.ts` (4 call sites, inline is fine).
- [ ] Framework install: **none needed** — vitest 4.1.0 already in `app/package.json`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CatBot end-to-end with reasoning alias (oracle per CLAUDE.md) | ALL | Real LiteLLM + real DB + real streaming; oracle confirms reasoning tokens flow | 1) `docker compose up -d`; 2) In CatBot chat: "dame el alias catbot actual" → expect current config; 3) "cambia catbot a Opus con reasoning high y max_tokens 8000"; 4) "haz un razonamiento sobre X" → expect reasoning response stream |
| Docker smoke of PATCH validator | CFG-02 | Validates end-to-end HTTP path including DB persistence | `curl -X PATCH localhost:3500/api/alias-routing -d '{"alias":"catbot","model":"opus","reasoning_effort":"high","max_tokens":99999}'` → expect 400 "max_tokens exceeds cap"; then valid body → expect 200 |

*CatBot oracle is part of the DocFlow testing protocol (CLAUDE.md); treated as Phase 161 scope but included here for completeness.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (catbot route tests)
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
