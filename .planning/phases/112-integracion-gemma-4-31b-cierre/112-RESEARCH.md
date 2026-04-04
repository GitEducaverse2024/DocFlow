# Phase 112: Integracion Gemma 4:31B + Cierre - Research

**Researched:** 2026-04-04
**Domain:** E2E validation of model intelligence pipeline + Ollama Gemma 4 integration + documentation
**Confidence:** HIGH

## Summary

Phase 112 is the closing validation phase of milestone v25.0 (Model Intelligence Orchestration). Phases 107-111 built the full pipeline: Discovery (107), MID (108), Alias Routing (109), CatBot Orchestrator (110), UI (111). Phase 112 validates the pipeline end-to-end using Gemma 4:31B as the test subject, and documents the 3-step procedure for onboarding new LLMs.

This phase is **mostly E2E validation, documentation, and configuration tuning** — not major new code. The only likely code changes are (a) MID seed correction to reflect Gemma 4:31B's real capabilities (function calling, thinking, multimodal, 256K context — NOT the current stub of 8k_context), (b) potential VRAM-driven model variant switch, and (c) fixing a known `model_id` vs `id` mismatch in `alias-routing.ts` that currently breaks Discovery cross-reference.

**CRITICAL HARDWARE FINDING:** Gemma 4:31B (dense, 30.7B params) requires **24GB VRAM** per official Ollama guidance. The target host has **RTX 5080 with 16GB VRAM**. GEMMA-01 as written ("Gemma 4:31B instalado con parametros optimos para RTX 5080 16GB VRAM") is **physically infeasible** without heavy quantization or CPU offload (which would destroy performance). The phase MUST address this gap upfront — either (a) use `gemma4:26b` MoE variant (25.2B total / 3.8B active, ~18GB — still tight), (b) use `gemma4:e4b` (8B, fits comfortably in 10GB), or (c) install a Q4/Q5 quantized version of 31b.

**Primary recommendation:** Open phase with a hardware-fit decision (install gemma4:26b MoE or gemma4:e4b on RTX 5080; keep GEMMA-01 goal by relabeling it as "Gemma 4 instalado con variante optima para RTX 5080 16GB"). Then execute 4 E2E validation scenarios (A/B/C/D) as manual UAT checklist. Finally write a 3-step onboarding doc anchored to real procedure: (1) `ollama pull <model>` → (2) `POST /api/discovery/refresh` → (3) review/edit auto-created MID entry in Settings > Modelos.

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md file exists for Phase 112 — phase enters planning without a discussion constraint file.

### Locked Decisions
None captured — planner has full discretion within scope of GEMMA-01..GEMMA-08 requirements.

### Claude's Discretion
- Which Gemma 4 variant to install (31b/26b MoE/e4b) given RTX 5080 16GB constraint
- Exact E2E test script structure (manual checklist vs Playwright e2e vs combined)
- Documentation location (new `.planning/knowledge/` doc vs README section vs `docs/` folder)
- Whether to include minor code fixes (model_id/id alignment in alias-routing) in scope

### Deferred Ideas (OUT OF SCOPE)
- Auto-benchmark suite (v26.0, Out of Scope per REQUIREMENTS.md)
- Cost tracking detailed (v26.0, Out of Scope)
- A/B model testing (v26.0, Out of Scope)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GEMMA-01 | Gemma 4:31B instalado en Ollama con parametros optimos para RTX 5080 (16GB VRAM) | **BLOCKER**: 31B needs 24GB VRAM (Ollama/Apidog docs). Must switch to `gemma4:26b` MoE (18GB, tight) or `gemma4:e4b` (~10GB, safe). Document actual install command + `num_ctx` parameter. |
| GEMMA-02 | Discovery detecta correctamente, MID poblado con capacidades reales (function calling, thinking, multimodal, 128K context) | Discovery already supports Ollama auto-detection. MID seed for `gemma4:31b` currently claims `["chat","function_calling","thinking","8k_context"]` — **wrong**. Real Gemma 4 capabilities per Ollama docs: multimodal (text+image), 256K context (NOT 128K), function calling, configurable thinking mode. Must UPDATE mid.ts seed or edit via UI. |
| GEMMA-03 | Alias routing puede usar Gemma 4:31B para tareas estandar (chat RAG, procesamiento) | `resolveAlias()` already supports any model_key present in Discovery. **Known gap**: `alias-routing.ts:96` uses `m.model_id` (unprefixed) for availability check, while MID/aliases use prefixed keys — likely needs `m.id` fix similar to Phase 110 Plan 03 catbot-tools fix. Also seed aliases still reference `gemini-main` (legacy unprefixed) — must verify they migrated. |
| GEMMA-04 | Validacion Escenario A — CatBot detecta atasco y sugiere modelo Elite | Manual UAT: user tells CatBot "el modelo de resumen no da buenos resultados" → CatBot follows diagnostic protocol (110-02) → suggests Elite alternative with justification. Phase 110 UAT already passed Test #5 for similar flow. |
| GEMMA-05 | Validacion Escenario B — Canvas con modelo optimo por nodo sugerido por CatBot | Manual UAT: open canvas, ask CatBot to review nodes. CatBot calls `canvas_get` and returns `model_suggestion` per node. Phase 110 UAT Test #6 was **skipped**, so this is first full run. |
| GEMMA-06 | Validacion Escenario C — "Que modelos tengo?" responde inventario real con tiers y usos | Manual UAT: CatBot calls `get_model_landscape`. Phase 110 UAT Test #1 passed — should confirm Gemma 4 variant now appears. |
| GEMMA-07 | Validacion Escenario D — Modelo nuevo detectado automaticamente, clasificado en MID, CatBot lo recomienda | Install arbitrary 2nd Ollama model (e.g. `phi3:mini`) → call POST /api/discovery/refresh → verify syncFromDiscovery auto-creates MID stub with `auto_created=1`, tier='Libre' → CatBot's `recommend_model_for_task` includes it. |
| GEMMA-08 | Procedimiento documentado para anadir nuevo LLM en exactamente 3 pasos | Write doc. Based on existing infra the 3 real steps are: (1) `ollama pull <model>` (or configure API key for cloud provider), (2) trigger Discovery refresh (POST /api/discovery/refresh or Settings > Modelos refresh button), (3) open Settings > Modelos → edit auto-created MID card (set tier, scores, best_use description). |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Ollama | latest (Docker) | Local LLM serving | Already project standard, service `docflow-ollama:11434` in docker-compose.yml |
| Gemma 4 (Google) | April 2026 release | Test subject model for validation | Specified in milestone scope; multimodal, 256K context, function calling, thinking mode |
| Playwright | existing | E2E test framework | `npm run test:e2e` already configured, `app/e2e/` has specs/fixtures/helpers |
| Vitest | existing | Unit tests | `npm run test:unit` — for any service-level test additions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| DiscoveryService (existing) | Phase 107 | Model inventory | GEMMA-02, GEMMA-07 refresh flow |
| MidService (existing) | Phase 108 | Model intelligence CRUD | GEMMA-02 capability update, GEMMA-07 auto-create verification |
| alias-routing (existing) | Phase 109 | Alias resolution | GEMMA-03 routing test |
| catbot-tools (existing) | Phase 110 | CatBot orchestration tools | GEMMA-04/05/06 manual UAT |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| gemma4:31b (24GB VRAM) | gemma4:26b MoE (18GB, 3.8B active) | Tight fit on RTX 5080 16GB — MoE may spill to CPU; better quality/VRAM ratio than 31B |
| gemma4:31b | gemma4:e4b (~10GB, 8B params) | Comfortable fit, 128K context, thinking mode; lower raw quality than 31B but excellent for local tier |
| gemma4:31b | gemma4:31b with Q4 quantization | ~16GB footprint, fits just barely, minor quality loss — Ollama may offer q4 tag |

**Installation (recommended path — gemma4:e4b as safe default):**
```bash
docker exec docflow-ollama ollama pull gemma4:e4b
# or for MoE variant (tighter fit):
docker exec docflow-ollama ollama pull gemma4:26b
```

## Architecture Patterns

### Recommended Phase Structure
This phase deviates from typical code-heavy phases. Expected task breakdown:

```
Plan 01: Hardware fit + install + MID capability fix
├── Decide variant (e4b vs 26b vs quantized 31b)
├── ollama pull <chosen variant>
├── Update mid.ts seed for gemma4:* entries (real capabilities: 256K context, multimodal, function calling, thinking)
├── Run /api/discovery/refresh → verify model appears
└── Verify MID auto-sync OR manual edit via UI

Plan 02: E2E validation scenarios (A/B/C/D)
├── Scenario A: CatBot diagnostic protocol
├── Scenario B: Canvas per-node suggestions
├── Scenario C: "que modelos tengo" inventory query
└── Scenario D: New model auto-detect (install secondary model)

Plan 03: Documentation + closure
├── Write 3-step onboarding doc (GEMMA-08)
├── Update STATE.md / ROADMAP.md to mark v25.0 complete
└── Archive milestone to .planning/milestones/v25.0-ROADMAP.md
```

### Pattern 1: E2E Validation as UAT Checklist
**What:** Scenarios are validated by user interaction with CatBot/UI, not automated tests
**When to use:** LLM-driven behavior where output is non-deterministic
**Example:** Phase 110 UAT (`110-UAT.md`) — manual test cases with `result: pass/fail/issue` tracking

### Pattern 2: Sync via Discovery Refresh Endpoint
**What:** Force cache invalidation triggers MID auto-create for new models
**When to use:** GEMMA-07 test flow
**Example:**
```bash
# Source: app/src/app/api/discovery/refresh/route.ts (Phase 107)
curl -X POST http://localhost:3500/api/discovery/refresh
# then:
curl http://localhost:3500/api/mid | jq '.models[] | select(.auto_created==1)'
```

### Pattern 3: Capability Update via MID UI or API
**What:** After install, user edits MID card to set real capabilities/tier
**When to use:** GEMMA-02 — correcting auto-stub with real Gemma 4 capabilities
**Example:**
```bash
# Source: Phase 108 API routes
curl -X PUT http://localhost:3500/api/mid/{id} -d '{
  "capabilities": ["chat","function_calling","thinking","vision","256k_context"],
  "scores": {"reasoning":8,"coding":8,"creativity":7,"speed":5,"multilingual":8}
}'
```

### Anti-Patterns to Avoid
- **Hardcoding gemma4:31b** when hardware cannot run it — fails silently in production, Discovery will list it but Ollama will OOM
- **Skipping MID capability correction** — current seed lies (says 8k_context, no multimodal); CatBot would recommend it wrongly
- **Writing lengthy onboarding doc** — GEMMA-08 explicitly requires exactly 3 steps; scope discipline matters

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ollama model discovery | Custom Ollama tags parser | `DiscoveryService.getInventory()` (Phase 107) | Already parses `/api/tags`, handles Docker network, timed status, graceful degradation |
| MID auto-creation | Manual insert for new Ollama model | `syncFromDiscovery(inventory)` in mid.ts:431 | Already flags `auto_created=1`, sets tier by `is_local`, idempotent via `existing` set |
| E2E test harness | Custom scenario runner | Playwright (`app/e2e/`) OR manual UAT markdown | Project already uses Playwright; manual UAT proven in Phase 110 |
| CatBot recommendation logic | Reimplement proportionality | `recommend_model_for_task` tool (Phase 110) | Tool returns flat+nested shape consumed by UI (Phase 111 Plan 04) |

**Key insight:** Phase 112 is assembly + validation, not construction. Any custom code is a smell — the 5 prior phases should cover all mechanics.

## Common Pitfalls

### Pitfall 1: Gemma 4:31B VRAM OOM
**What goes wrong:** `ollama pull gemma4:31b` succeeds but `ollama run` fails or offloads to CPU at <1 tok/s
**Why it happens:** 30.7B dense params need ~24GB VRAM; RTX 5080 has 16GB
**How to avoid:** Pre-check with `nvidia-smi --query-gpu=memory.total --format=csv`; pick variant that fits (e4b safe, 26b tight, 31b infeasible without Q4)
**Warning signs:** `CUDA error: out of memory` in ollama logs, or inference throughput <5 tok/s on 16GB card

### Pitfall 2: model_id vs id prefix mismatch
**What goes wrong:** `resolveAlias()` can't find configured model in Discovery even though it's installed
**Why it happens:** `alias-routing.ts:96` uses `m.model_id` (e.g., `gemma4:31b`) but MID/aliases store prefixed `ollama/gemma4:31b`
**How to avoid:** Align to Phase 110 Plan 03 fix — use `m.id` (prefixed). OR normalize alias seeds to unprefixed keys.
**Warning signs:** Alias falls through to `env_fallback` in logs despite model being installed

### Pitfall 3: Stale MID seed claims
**What goes wrong:** CatBot recommends gemma4:31b for "short chat" because seed says 8k_context; user expects 256K
**Why it happens:** seed in mid.ts:354 was written before Gemma 4 released (April 2026), capabilities are placeholder guesses
**How to avoid:** UPDATE seed with real capabilities post-install; OR rely on UI edit flow (Settings > Modelos card edit)
**Warning signs:** CatBot justifications cite wrong context size or missing multimodal

### Pitfall 4: Discovery cache serves stale inventory
**What goes wrong:** Just-installed Gemma 4 doesn't appear in `get_model_landscape`
**Why it happens:** 5-min TTL cache in DiscoveryService (discovery.ts:62)
**How to avoid:** Call POST /api/discovery/refresh after install; or wait 5 minutes
**Warning signs:** Ollama `ollama list` shows model, but CatBot doesn't

### Pitfall 5: CHAT_MODEL env var points to retired model
**What goes wrong:** When alias fallback chain kicks in, lands on dead env value
**Why it happens:** Fallback chain ends at `process.env.CHAT_MODEL` which may not have been updated in .env
**How to avoid:** Verify CHAT_MODEL env during phase opening; document as part of 3-step onboarding

## Code Examples

### Verify Gemma 4 is live after install
```bash
# Source: app/src/app/api/discovery/refresh/route.ts (Phase 107 Plan 02)
docker exec docflow-ollama ollama list
curl -X POST http://localhost:3500/api/discovery/refresh
curl -s http://localhost:3500/api/discovery/models | jq '.models[] | select(.model_id | contains("gemma4"))'
```

### Update MID capabilities for gemma4 variants (mid.ts seed fix)
```typescript
// Source: app/src/lib/services/mid.ts:354 — REPLACE current seed with accurate capabilities
seed.run(generateId(), 'ollama/gemma4:26b', 'Gemma 4 26B (MoE)', 'ollama', 'Pro',
  'MoE Gemma 4 (3.8B active), excelente razonamiento y function calling, contexto 256K',
  '["chat","function_calling","thinking","vision","256k_context"]',
  'free', 'Gratuito (local)',
  '{"reasoning":8,"coding":8,"creativity":7,"speed":7,"multilingual":8}',
  'active', now, now);

seed.run(generateId(), 'ollama/gemma4:e4b', 'Gemma 4 E4B', 'ollama', 'Libre',
  'Edge Gemma 4, multimodal (texto+imagen+audio), thinking mode, 128K context',
  '["chat","function_calling","thinking","vision","audio","128k_context"]',
  'free', 'Gratuito (local)',
  '{"reasoning":7,"coding":6,"creativity":7,"speed":8,"multilingual":8}',
  'active', now, now);
```

### E2E Scenario D test — new model auto-detection
```bash
# Install any small extra model
docker exec docflow-ollama ollama pull phi3:mini
# Trigger sync
curl -X POST http://localhost:3500/api/discovery/refresh
# Verify MID auto-stub created
curl -s http://localhost:3500/api/mid | jq '.models[] | select(.model_key=="ollama/phi3:mini") | {tier, auto_created, best_use}'
# Expect: {"tier":"Libre","auto_created":1,"best_use":"Auto-detectado -- pendiente de clasificacion manual"}
```

### 3-step onboarding doc template (GEMMA-08)
```markdown
# Añadir un nuevo LLM al ecosistema DocFlow

## Paso 1 — Instalar el modelo
**Ollama local:** `docker exec docflow-ollama ollama pull <model>:<tag>`
**API provider (OpenAI/Anthropic/Google):** configurar API key en Settings > API Keys

## Paso 2 — Refrescar Discovery
En Settings > Modelos, click "Refrescar inventario".
(O vía API: `POST /api/discovery/refresh`)

## Paso 3 — Clasificar en MID
El modelo aparece con tier por defecto (Libre para local, Pro para API).
En Settings > Modelos, edita la ficha del modelo: tier real, capacidades, descripcion de mejor uso, scores.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded `gemini-main` everywhere | Alias routing with fallback chain | Phase 109 (2026-04-04) | Phase 112 can route to Gemma 4 by updating single alias row |
| Manual MID curation | syncFromDiscovery auto-stubs | Phase 108 (2026-04-04) | GEMMA-07 scenario works without manual DB inserts |
| Gemma 3 27B (128K ctx) | Gemma 4 26B MoE / 31B (256K ctx, multimodal, thinking) | 2026-04-02 (Google release) | Hardware requirements doubled; 31B no longer fits on 16GB consumer GPUs |

**Deprecated/outdated:**
- Original phase goal "Gemma 4:31B on RTX 5080 16GB" — infeasible, replace with 26b MoE or e4b
- mid.ts seed entries for gemma4:* — capabilities incorrect (8k_context, missing vision/audio)

## Open Questions

1. **Which Gemma 4 variant to install?**
   - What we know: 31b needs 24GB (infeasible), 26b MoE ~18GB (tight), e4b ~10GB (safe)
   - What's unclear: Whether user accepts goal relabel OR wants Q4 quantized 31b
   - Recommendation: Propose e4b as safe default with option to add 26b if MoE fits after testing. Document actual choice in plan.

2. **Does alias-routing.ts need the same m.id fix as catbot-tools.ts?**
   - What we know: Phase 110 Plan 03 fixed catbot-tools.ts (3 places). alias-routing.ts:96 still uses `m.model_id`.
   - What's unclear: Whether it's already working (because aliases store `gemini-main` unprefixed keys, matching m.model_id), or if migration to prefixed keys pending
   - Recommendation: Verify during Plan 01 — trace resolveAlias('chat-rag') live; if broken, include fix in scope

3. **E2E scenarios: Playwright automation or manual UAT?**
   - What we know: Phase 110 UAT used manual markdown checklist successfully
   - What's unclear: User preference for Phase 112 closure
   - Recommendation: Manual UAT via `112-UAT.md` mirroring `110-UAT.md` format — LLM output is non-deterministic, automated assertion would be flaky

4. **Where to store 3-step doc?**
   - Options: `.planning/knowledge/model-onboarding.md` | `docs/add-new-llm.md` | README section | CLAUDE.md
   - Recommendation: `.planning/knowledge/model-onboarding.md` for operator runbooks, linked from Settings > Modelos UI

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (unit, existing) + Playwright (e2e, existing) + Manual UAT (LLM scenarios) |
| Config file | `app/vitest.config.ts`, `app/playwright.config.ts` (exist) |
| Quick run command | `cd app && npm run test:unit -- mid.test.ts alias-routing.test.ts discovery.test.ts` |
| Full suite command | `cd app && npm run test:unit && npm run build` |
| Phase UAT | Manual, tracked in `112-UAT.md` (one row per GEMMA-04..07 scenario) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GEMMA-01 | Gemma 4 variant installed, detectable by Ollama | smoke | `docker exec docflow-ollama ollama list \| grep gemma4` | manual |
| GEMMA-02 | Discovery returns gemma4 entry; MID has correct capabilities | integration | `curl -s localhost:3500/api/discovery/models \| jq '.models[] \| select(.model_id \| contains("gemma4"))'` | manual |
| GEMMA-03 | resolveAlias returns gemma4 when alias points to it | unit | add test to `alias-routing.test.ts`: resolveAlias('chat-rag') returns gemma4 key after update | needs Wave 0 test addition |
| GEMMA-04 | CatBot diagnostic protocol suggests Elite on poor result | manual-UAT | conversation with CatBot — non-deterministic | `112-UAT.md` Wave 0 |
| GEMMA-05 | Canvas per-node model_suggestion from CatBot | manual-UAT | canvas_get tool call via CatBot | `112-UAT.md` Wave 0 |
| GEMMA-06 | "que modelos tengo" returns real inventory | manual-UAT | get_model_landscape call | `112-UAT.md` Wave 0 |
| GEMMA-07 | New Ollama model → auto MID stub → CatBot recommends | integration + manual | `pull phi3:mini && curl refresh && curl /api/mid` + CatBot interaction | mixed (script + UAT) |
| GEMMA-08 | 3-step doc exists and is exactly 3 steps | doc-check | `wc -l .planning/knowledge/model-onboarding.md && grep -c "^## Paso" = 3` | Wave 0 — create doc |

**Manual-only justification:** GEMMA-04/05/06 involve LLM conversational output which is non-deterministic. Automated assertion (e.g., "CatBot mentions 'Claude'") would be brittle. Manual UAT matches Phase 110's proven pattern.

### Sampling Rate
- **Per task commit:** `npm run test:unit -- <changed-service>` (fast, < 10s)
- **Per wave merge:** `npm run test:unit && npm run build` (full unit suite + build gate)
- **Phase gate:** Full unit suite green + manual UAT table complete with all scenarios marked `pass`

### Wave 0 Gaps
- [ ] `.planning/phases/112-integracion-gemma-4-31b-cierre/112-UAT.md` — manual UAT scenario tracker (template from 110-UAT.md)
- [ ] `.planning/knowledge/model-onboarding.md` — 3-step procedure doc (GEMMA-08 deliverable)
- [ ] `app/src/lib/services/__tests__/alias-routing.test.ts` — add test case for Gemma 4 alias resolution (if GEMMA-03 gets coverage)
- [ ] Pre-flight script: `scripts/check-gemma-vram.sh` — reads `nvidia-smi` and picks variant (optional hardening)

## Sources

### Primary (HIGH confidence)
- `.planning/phases/107-*/107-01-SUMMARY.md` — DiscoveryService contract
- `.planning/phases/108-*/108-01-SUMMARY.md` — MID seed, syncFromDiscovery
- `.planning/phases/109-*/109-03-SUMMARY.md` — Alias routing migration complete
- `.planning/phases/110-*/110-03-SUMMARY.md` — catbot-tools.ts m.id fix precedent
- `.planning/phases/110-*/110-UAT.md` — UAT format precedent
- `.planning/phases/111-*/111-04-SUMMARY.md` — recommendation UI flow
- `app/src/lib/services/mid.ts` — current gemma4:31b seed at line 354
- `app/src/lib/services/alias-routing.ts` — resolveAlias at line 73, model_id at line 96
- `app/src/lib/services/discovery.ts` — DiscoveredModel type, cache TTL
- `.planning/REQUIREMENTS.md` lines 67-74 — GEMMA-01..08 definitions
- Ollama library Gemma 4 page: https://ollama.com/library/gemma4

### Secondary (MEDIUM confidence)
- Apidog "How to Run Gemma 4 Locally with Ollama" (2026) — VRAM requirements, pull commands
- NVIDIA blog "Day 0 Gemma 4 for RTX" (2026) — RTX hardware support
- `nvidia-smi` query on host: confirmed 16303 MiB VRAM on RTX 5080

### Tertiary (LOW confidence)
- Exact quantization tags available for gemma4:31b (Q4/Q5/Q8) — not verified on ollama.com at research time, user should check `ollama show gemma4:31b` or tags page
- Whether gemma4:26b MoE actually fits in 16GB VRAM at inference (18GB spec is tight) — needs live test

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components exist, well-documented in prior SUMMARY files
- Architecture: HIGH — this is a validation phase, reuses Phase 107-111 primitives
- Pitfalls: HIGH — VRAM limit verified via nvidia-smi + Ollama docs; m.id mismatch found via grep
- Gemma 4 capabilities: MEDIUM — relying on Ollama library + Apidog/NVIDIA blogs; official Google model card not fetched

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (30 days; Gemma 4 just released, tags and quantizations may expand)
