# Roadmap: DocFlow — Milestones v29.0 + v30.0

## Milestones

- ✅ **v29.1 KB Runtime Integration** — Phases 149-157 (shipped 2026-04-21) — see [milestones/v29.1-ROADMAP.md](milestones/v29.1-ROADMAP.md)
- 🚧 **v29.0 CatFlow Inbound + CRM** — Phases 145-148 (145 shipped with gaps; 146-148 pending)
- 🚧 **v30.0 LLM Self-Service para CatBot** — Phases 158-161 (planning)

---

## Overview

**Milestone v29.0 — CatFlow Inbound + CRM** (scope original)
Construye un CatFlow completo de Inbound+CRM (email entrante → clasificación → operación CRM en Holded → respuesta con template) como piloto manual en 4 fases lineales: (145) crear CatPaw "Operador Holded" generalista con tools CRM, (146) construir manualmente el canvas Inbound+CRM de 8 nodos con data contracts verificados, (147) ejecutar tests E2E contra Holded real (lead nuevo, existente, spam), y (148) entrenar a CatBot con PARTE 21 del Orquestador para que construya el patron autonomamente.

**Status v29.0:** `gaps_found` (per audit 2026-04-20 en `v29.0-MILESTONE-AUDIT.md`). Phase 145 requiere fix de gaps (tests rojos + live-verify pendiente). Phases 146-148 no iniciadas.

**Milestone v30.0 — LLM Self-Service para CatBot** (nuevo, 2026-04-21)
CatBot se convierte en operador consciente del stack de modelos LLM: puede listar qué modelos hay disponibles, consultar sus capabilities (extended thinking, max_tokens_cap, tier paid/local), recomendar el mejor para una tarea, y cambiar su propio LLM bajo sudo del usuario. El control manual (tab Enrutamiento en Centro de Modelos) y el control programático (CatBot tools) comparten la misma infraestructura (schema `model_intelligence` + `model_aliases`, servicio `resolveAlias`, `streamLiteLLM` passthrough). LiteLLM gateway ya soporta `reasoning_effort` + `thinking.budget_tokens` como passthrough a Claude Anthropic y como traducción a Gemini 2.5 Pro — v30.0 lo expone end-to-end en DocFlow. 4 fases secuenciales: (158) schema + catálogo, (159) backend passthrough, (160) CatBot tools + KB skill, (161) UI + oracle verification.

## Phases

**Phase Numbering:** continua desde phase 144 (ultima de v28.0).

**v29.0 scope:** Phases 145-148.
**v29.1 scope:** Phases 149-157 — archived.
**v30.0 scope:** Phases 158-161.

### v29.0 checklist
- [x] **Phase 145: CatPaw Operador Holded** — CatPaw generalista con system_prompt amplio y conector Holded MCP para cualquier operacion CRM (marked complete 2026-04-17 — has gaps per audit, needs fix)
- [ ] **Phase 146: CatFlow Inbound+CRM Manual** — Canvas de 8 nodos construido manualmente via API con data contracts completos
- [ ] **Phase 147: Tests E2E Inbound+CRM** — Validacion end-to-end contra Holded real (lead nuevo, existente, spam)
- [ ] **Phase 148: Entrenamiento CatBot Patron CRM** — PARTE 21 del Orquestador + CatBot construye canvas autonomamente >=80% correcto

<details>
<summary>✅ v29.1 KB Runtime Integration (Phases 149-157) — SHIPPED 2026-04-21</summary>

- [x] Phase 149: KB Foundation Bootstrap (5/5 plans) — completed 2026-04-18
- [x] Phase 150: KB Populate desde DB (4/4 plans) — completed 2026-04-18
- [x] Phase 151: KB Migrate Static Knowledge (4/4 plans) — completed 2026-04-20
- [x] Phase 152: KB CatBot Consume (4/4 plans) — completed 2026-04-20
- [x] Phase 153: KB Creation Tool Hooks (4/4 plans) — completed 2026-04-20
- [x] Phase 154: KB Dashboard /knowledge (3/3 plans) — completed 2026-04-20
- [x] Phase 155: KB Cleanup Final (4/4 plans) — completed 2026-04-20
- [x] Phase 156: KB Runtime Integrity (gap closure) (3/3 plans) — completed 2026-04-20
- [x] Phase 157: KB Rebuild Determinism + Body Backfill (3/3 plans) — completed 2026-04-21

Full details: [milestones/v29.1-ROADMAP.md](milestones/v29.1-ROADMAP.md) · Requirements: [milestones/v29.1-REQUIREMENTS.md](milestones/v29.1-REQUIREMENTS.md) · Audit: [milestones/v29.1-MILESTONE-AUDIT.md](milestones/v29.1-MILESTONE-AUDIT.md)

</details>

### v30.0 checklist
- [x] **Phase 158: Model Catalog Capabilities + Alias Schema** — Schema `model_intelligence` con `supports_reasoning`/`max_tokens_cap`/`tier` + schema `model_aliases` con `reasoning_effort`/`max_tokens`/`thinking_budget` + seed + `GET /api/models` expuesto (CAT-01..03, CFG-01) (completed 2026-04-21)
- [x] **Phase 159: Backend Passthrough LiteLLM Reasoning** — `streamLiteLLM` propaga `reasoning_effort` + `thinking.budget_tokens` + `max_tokens` al body de LiteLLM + `resolveAlias` devuelve objeto completo + CatBot chat route consume params resueltos (CFG-02..03, PASS-01..04) (completed 2026-04-22)
- [ ] **Phase 160: CatBot Self-Service Tools + Skill KB** — Tools `list_llm_models`/`get_catbot_llm`/`set_catbot_llm` (sudo-gated con validación de capabilities) + skill KB "Operador de Modelos" con reglas de recomendación tarea→modelo (TOOL-01..04)
- [ ] **Phase 161: UI Enrutamiento + Oracle End-to-End** — Tab Enrutamiento con dropdown Inteligencia + inputs max_tokens/thinking_budget condicionales por capability + oracle CatBot 3/3 (enumerar, cambiar a Opus+high via sudo, verificar reasoning_content en siguiente request) + unit test `resolveAlias('catbot')` post-PATCH (UI-01..03, VER-01..04)

## Phase Details

### Phase 145: CatPaw Operador Holded
**Goal**: Existe un CatPaw "Operador Holded" generalista capaz de ejecutar cualquier operacion CRM en Holded (buscar, crear, actualizar leads y contactos, anadir notas) via Holded MCP.
**Depends on**: Nothing (primera fase del milestone)
**Requirements**: CRM-01, CRM-02, CRM-03, CRM-04
**Success Criteria** (what must be TRUE):
  1. CatPaw "Operador Holded" existe en /agents con conector Holded MCP vinculado y system_prompt generalista (no rigido a un tipo de operacion)
  2. El Operador Holded busca leads/contactos en Holded cuando recibe una instruccion de busqueda (usa holded_search_lead y holded_search_contact)
  3. El Operador Holded crea un lead nuevo en Holded con funnelId obtenido de holded_list_funnels cuando recibe datos de un lead desconocido
  4. El Operador Holded anade notas a leads existentes via holded_create_lead_note con title y desc
**Plans**: 1 plan

Plans:
- [x] 145-01-PLAN.md — Crear CatPaw Operador Holded con conector Holded MCP y actualizar documentacion

### Phase 146: CatFlow Inbound+CRM Manual
**Goal**: Un canvas Inbound+CRM de 8 nodos funciona end-to-end: recibe un email, lo normaliza, clasifica por producto, ejecuta operacion CRM en Holded (buscar/crear/actualizar lead), y genera respuesta con template Pro-X.
**Depends on**: Phase 145
**Requirements**: FLOW-01, FLOW-02, FLOW-03, FLOW-04, FLOW-05, FLOW-06
**Success Criteria** (what must be TRUE):
  1. Canvas Inbound+CRM de 8 nodos existe y se visualiza correctamente en el editor (START, Normalizador, Clasificador, CRM Handler, Respondedor, Connector Gmail, Output)
  2. Normalizador recibe email texto libre y produce JSON con 6 campos (from, subject, body, date, message_id, thread_id)
  3. Clasificador recibe JSON normalizado y produce JSON con reply_to_email, producto, template_id, is_spam, accion, datos_lead, resumen_consulta
  4. CRM Handler (CatPaw Operador Holded) recibe clasificacion, opera contra Holded (buscar/crear/actualizar lead + nota), y produce crm_action + lead_id
  5. Respondedor genera JSON con accion_final=send_reply y respuesta con template Pro-X para leads validos, o accion_final=no_action para spam
**Plans**: TBD

Plans:
- [ ] 146-01: TBD

### Phase 147: Tests E2E Inbound+CRM
**Goal**: El pipeline Inbound+CRM esta validado contra Holded real en los 3 escenarios criticos: lead nuevo, lead existente, y spam.
**Depends on**: Phase 146
**Requirements**: TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. Test lead nuevo: al ejecutar el canvas con email de contacto desconocido, se CREA un lead en Holded con nota descriptiva Y se envia email con template Pro-K12 a antonio@educa360.com
  2. Test lead existente: al ejecutar con email de contacto conocido, se ACTUALIZA el lead en Holded con nota Y se envia email de respuesta
  3. Test spam: al ejecutar con email spam, NO se envia email, crm_action=skipped, NO se crea ni modifica nada en Holded
**Plans**: TBD

Plans:
- [ ] 147-01: TBD

### Phase 148: Entrenamiento CatBot Patron CRM
**Goal**: CatBot tiene el conocimiento y la capacidad de construir un CatFlow Inbound+CRM autonomamente (>=80% correcto al primer intento) y puede adaptarlo a variantes sin intervencion.
**Depends on**: Phase 147
**Requirements**: TRAIN-01, TRAIN-02, TRAIN-03, TRAIN-04
**Success Criteria** (what must be TRUE):
  1. PARTE 21 del Skill Orquestador esta anadida con patron CRM completo (arquitectura 8 nodos, CatPaw requerido para CRM Handler, data contracts entre nodos, errores comunes)
  2. canvas.json del knowledge tree incluye patron CRM con cuando usar CatPaw con Holded vs nodo generico
  3. CatBot construye un canvas Inbound+CRM con >=80% de criterios correctos al primer intento (6-8 nodos, CRM Handler con CatPaw, data contracts correctos)
  4. CatBot construye una variante del patron (formulario web en vez de email) sin intervencion humana
**Plans**: TBD

Plans:
- [ ] 148-01: TBD

### Phase 158: Model Catalog Capabilities + Alias Schema

**Goal:** Extender la capa de metadata del stack de modelos para que DocFlow exprese lo que cada LLM puede hacer y lo que cada alias ha decidido usar. `model_intelligence` gana tres columnas (`is_local` bool, `supports_reasoning` bool, `max_tokens_cap` int) seeded con Claude Opus/Sonnet 4.6 + Gemini 2.5 Pro como `supports_reasoning=true` y Ollama/Gemma como `is_local=true`; `model_aliases` gana tres columnas (`reasoning_effort` enum off|low|medium|high, `max_tokens` int, `thinking_budget` int) con defaults NULL para preservar comportamiento actual. `GET /api/models` (existente desde v8.0) extiende su shape (flat root) para devolver capabilities + is_local + tier + cost_tier en cada entry, y los 4 consumers UI se actualizan a leer `.id` del objeto para cero regresión. Sin cambios de runtime LLM todavía — Phase 159 conecta el passthrough, Phase 160 las tools, Phase 161 la UI + oracle. **Decisión locked (CONTEXT.md)**: `is_local INTEGER DEFAULT 0` override al `tier` enum paid|local del ROADMAP original (cero regresión sobre la columna `tier` existente = Elite/Pro/Libre).
**Depends on:** Nothing del milestone v30.0; asume schema DB existente de v25.1 (Centro de Modelos) + endpoint `GET /api/models` de v8.0.
**Requirements**: CAT-01, CAT-02, CAT-03, CFG-01
**Plans**: 2 plans

Plans:
- [ ] 158-01-PLAN.md — Schema migration + seed inline en `db.ts` (6 ALTER idempotentes + UPDATE seed) + Vitest con tmpfile DB (CAT-01, CAT-02, CFG-01)
- [ ] 158-02-PLAN.md — `GET /api/models` enrichment con JOIN `model_intelligence` + 4 consumers UI actualizados a `.id` extraction + Vitest mock-based (CAT-03)

### Phase 159: Backend Passthrough LiteLLM Reasoning

**Goal:** Conectar los datos de Phase 158 al runtime. `resolveAlias(alias)` extiende su return shape de `{model}` a `{model, reasoning_effort, max_tokens, thinking_budget}` (back-compat con callers que sólo leen `.model`). `PATCH /api/alias-routing` acepta y persiste los tres campos nuevos con validación (capabilities del modelo target: si `supports_reasoning=false`, `reasoning_effort` debe ser `off` o `null`; `max_tokens` ≤ `max_tokens_cap`; `thinking_budget` ≤ `max_tokens`). `streamLiteLLM` en `stream-utils.ts` acepta dos nuevos parámetros opcionales (`reasoning_effort?: string`, `thinking?: {budget_tokens: number}`) y los propaga al body JSON de `POST /v1/chat/completions`; `max_tokens` efectivo se toma del alias config si definido, con fallback al default actual. CatBot chat route (`/api/catbot/chat`) tras resolver alias, pasa los params resueltos a `streamLiteLLM`. **Decisión de diseño (research 159-RESEARCH.md Pitfall #1)**: `resolveAlias()` mantiene su signature `Promise<string>` byte-identical (back-compat HARD — 15+ callers). Se añade `resolveAliasConfig()` como función paralela que devuelve `AliasConfig` — solo `/api/catbot/chat/route.ts:119` migra.
**Depends on:** Phase 158 (schema + seed)
**Requirements**: CFG-02, CFG-03, PASS-01, PASS-02, PASS-03, PASS-04
**Plans**: 4 plans

Plans:
- [ ] 159-01-PLAN.md — `alias-routing.ts`: añadir `resolveAliasConfig()` + `AliasConfig`/`AliasRowV30` interfaces + extender `updateAlias(alias, model_key, opts?)`; `resolveAlias()` queda como shim (CFG-03)
- [ ] 159-02-PLAN.md — `stream-utils.ts`: extender `StreamOptions` con `reasoning_effort` + `thinking`; body JSON con spread condicional (`'off'` sentinel omitido del wire) (PASS-01, PASS-02)
- [ ] 159-03-PLAN.md — `api/alias-routing/route.ts` PATCH: type guards + cross-table capability check + persistencia via `updateAlias(alias, key, opts)`; graceful degradation cuando cap row ausente (CFG-02)
- [ ] 159-04-PLAN.md — `api/catbot/chat/route.ts`: migrar L119 a `resolveAliasConfig`; propagar `reasoning_effort`/`thinking`/`max_tokens` a streaming (L199) y non-streaming (L459); crear Wave 0 test file nuevo (PASS-03, PASS-04)

### Phase 160: CatBot Self-Service Tools + Skill KB

**Goal:** CatBot gana autonomía sobre su propio LLM. Tres tools nuevas: `list_llm_models({tier?, reasoning?})` (always-allowed, devuelve catálogo con capabilities y tier); `get_catbot_llm()` (always-allowed, devuelve config actual del alias `catbot` + capabilities); `set_catbot_llm({model, reasoning_effort?, max_tokens?, thinking_budget?})` (sudo-gated, valida capabilities contra `model_intelligence`). Skill KB "Operador de Modelos" con protocolo de recomendación: tarea ligera → Gemma local; razonamiento → Opus + reasoning_effort=high; creativa larga → Gemini 2.5 Pro + thinking moderado. Skill registrada en catboard.json.skills.
**Depends on:** Phase 159 (resolveAlias shape + PATCH validación operativa)
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04
**Plans**: 4 plans

Plans:
- [ ] 160-01-PLAN.md — Wave 0 test scaffolds for TOOL-01..04 (catbot-tools-model-self-service + db-seeds + prompt-assembler + chat route sudo gate)
- [ ] 160-02-PLAN.md — list_llm_models + get_catbot_llm read-only tools registered in catbot-tools.ts (TOOL-01, TOOL-02)
- [ ] 160-03-PLAN.md — set_catbot_llm sudo-gated tool + chat route dual sudo branch (TOOL-03)
- [ ] 160-04-PLAN.md — Operador de Modelos skill seed in db.ts + PromptAssembler P1 injection (TOOL-04)

### Phase 161: UI Enrutamiento + Oracle End-to-End

**Goal:** Cerrar v30.0 con parity manual+programático y verificación E2E contra el stack real. Tab Enrutamiento del Centro de Modelos gana tres controles condicionales por capability: dropdown "Inteligencia" (off|low|medium|high) visible solo si `supports_reasoning=true`; input numérico `max_tokens` con placeholder=`max_tokens_cap`; input numérico `thinking_budget` opcional. Oracle CatBot 3/3 end-to-end contra LiteLLM real: (a) enumerar modelos con capabilities; (b) cambiar a Opus+thinking máximo via sudo; (c) siguiente request incluye `reasoning_content` no-null + `reasoning_tokens > 0`. Unit test: `resolveAlias('catbot')` devuelve valores seteados post-PATCH.
**Depends on:** Phase 160 (tools operativas + skill KB inyectada)
**Requirements**: UI-01, UI-02, UI-03, VER-01, VER-02, VER-03, VER-04
**Plans**: TBD

Plans:
- [ ] 161-01: TBD

## Progress

**Execution Order:** 145 → 146 → 147 → 148 (v29.0) | 158 → 159 → 160 → 161 (v30.0)

| 2/2 | Complete    | 2026-04-21 | Status      | Completed  |
| ----- | --------- | -------------- | ----------- | ---------- |
| 145. CatPaw Operador Holded | v29.0 | 1/1 | Complete (gaps) | 2026-04-17 |
| 146. CatFlow Inbound+CRM Manual | v29.0 | 0/? | Not started | — |
| 147. Tests E2E Inbound+CRM | v29.0 | 0/? | Not started | — |
| 148. Entrenamiento CatBot Patron CRM | v29.0 | 0/? | Not started | — |
| 149-157 (v29.1 KB Runtime Integration) | v29.1 | 35/35 | ✅ Shipped | 2026-04-21 |
| 158. Model Catalog Capabilities + Alias Schema | v30.0 | 2/2 | ✅ Complete | 2026-04-21 |
| 159. Backend Passthrough LiteLLM Reasoning | 4/4 | Complete    | 2026-04-22 | — |
| 160. CatBot Self-Service Tools + Skill KB | v30.0 | 0/? | Not started | — |
| 161. UI Enrutamiento + Oracle End-to-End | v30.0 | 0/? | Not started | — |
</content>
</invoke>