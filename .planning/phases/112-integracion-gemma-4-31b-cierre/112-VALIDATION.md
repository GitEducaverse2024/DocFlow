---
phase: 112
slug: integracion-gemma-4-31b-cierre
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-04
---

# Phase 112 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `112-RESEARCH.md` §Validation Architecture.

> **Note:** Phase 112 is primarily E2E manual UAT + docs + one code fix (MID seed + alias-routing Discovery cross-reference). Most verification is human-performed against the live Ollama + CatBot stack. Automated coverage is limited to the alias-routing unit test and doc/file existence checks.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit tests for alias-routing) + Manual UAT (`112-UAT.md`, mirroring 110-UAT.md) + shell checks (grep/jq/curl) |
| **Quick run command** | `cd app && npm run test:unit -- alias-routing.test.ts` |
| **Full suite command** | `cd app && npm run test:unit && npm run build` |
| **Estimated runtime** | Unit: ~10s. Build: ~90s. Manual UAT: ~30min (4 scenarios with CatBot conversation) |

---

## Sampling Rate

- **Per task commit:** Run changed service's unit test if applicable (<10s). File-existence grep for doc tasks.
- **Per wave merge:** `cd app && npm run test:unit` (full unit suite) before advancing to Wave 2.
- **Phase gate:** Unit suite green + `112-UAT.md` has 4/4 scenarios with `result: pass` (or diagnosed gaps captured).

Nyquist compliance: every task has either an `<automated>` verify command or a manual UAT instruction with explicit expected output. No 3 consecutive tasks without verification.

---

## Per-Task Verification Map

| Plan-Task | Requirement | Verification | Type |
|-----------|-------------|--------------|------|
| 01-T1 | GEMMA-02, GEMMA-03 | `npm run test:unit -- alias-routing.test.ts` | automated |
| 01-T2 | GEMMA-01 | `docker exec docflow-ollama ollama list \| grep gemma4:31b` | manual (human-action: user runs `ollama pull`) |
| 01-T3 | GEMMA-01, GEMMA-02, GEMMA-03 | `curl /api/discovery/models + /api/mid` + live alias reroute in UI + log inspection | manual (human-verify) |
| 02-T1 | GEMMA-04..07 | `test -f 112-UAT.md && grep -c '^### ' = 4` | automated |
| 02-T2 | GEMMA-04, GEMMA-05, GEMMA-06, GEMMA-07 | User drives 4 CatBot conversations, fills `result:` fields | manual-UAT |
| 03-T1 | GEMMA-08 | `grep -c '^## Paso' model-onboarding.md = 3` | automated |
| 03-T2 | (milestone closure) | `grep` for "Phase 112.*Complete" + "status: complete" | automated |

---

## Wave 0 Requirements

No standalone Wave 0. Wave 1 (Plan 01) is itself the foundation:
- Creates/updates `alias-routing.test.ts` test case alongside the code fix (TDD within task)
- `112-UAT.md` is scaffolded in Plan 02 Task 1 (auto-generated before user UAT runs)
- `model-onboarding.md` is created in Plan 03 Task 1

No MISSING references — all verifications map to existing infra or create their target file in-task.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| gemma4:31b installed on host Ollama | GEMMA-01 | Requires host hardware (GPU/VRAM) + 15GB network download; Claude cannot exec against host Docker autonomously | Run `docker exec docflow-ollama ollama pull gemma4:31b` then `ollama list \| grep gemma4:31b`. See Plan 01 Task 2. |
| Discovery returns gemma4:31b with real capabilities post-install | GEMMA-02 | Depends on running app + live Ollama; requires DB reseed or manual MID edit | `curl /api/discovery/refresh && curl /api/discovery/models \| jq '.models[] \| select(.id=="ollama/gemma4:31b")'` + MID UI inspection. See Plan 01 Task 3. |
| Alias resolution uses gemma4:31b without fallback after reroute | GEMMA-03 | Requires live reroute via Settings UI + log inspection of real chat request | Reroute 'chat-rag' alias in Settings > Modelos, send chat message, grep `docker logs docflow-app` for `alias.*chat-rag`, verify fallback=false. See Plan 01 Task 3. |
| CatBot diagnostic protocol suggests escalation | GEMMA-04 | LLM conversational output, non-deterministic | Follow Scenario A in 112-UAT.md: user prompts "modelo pobre", verifies CatBot cites MID + suggests escalation to Pro/Elite. |
| CatBot suggests model per canvas node | GEMMA-05 | Requires a real canvas + CatBot tool invocation + human interpretation of node fit | Follow Scenario B in 112-UAT.md: open canvas, ask CatBot to review nodes, verify per-node model_suggestion returned. |
| "Que modelos tengo" returns real inventory including Gemma 4 | GEMMA-06 | LLM conversational output | Follow Scenario C in 112-UAT.md: user asks inventory, verifies gemma4:31b appears with real tier+capabilities. |
| New Ollama model auto-detected and recommendable | GEMMA-07 | Requires live ollama pull + discovery refresh + CatBot conversation | Follow Scenario D in 112-UAT.md: pull phi3:mini, refresh, verify MID auto_created=1, ask CatBot for recommendation. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or manual UAT criteria
- [x] Sampling continuity: no 3 consecutive tasks without verification
- [x] Wave 0 covers any MISSING references (none needed — covered inline)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
