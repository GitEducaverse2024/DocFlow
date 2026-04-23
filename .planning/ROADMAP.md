# Roadmap: DocFlow

## Estado actual

- ✅ **v30.7 CatDev — Holded MCP agregación de facturación por periodo** — 4 phases (shipped 2026-04-23, sesión 38) — see [Progress/progressSesion38.md](Progress/progressSesion38.md)
- ✅ **v30.6 CatDev — Canvas fan-out desde START + saneamiento de tipos** — 4 phases (shipped 2026-04-23, sesión 37) — see [Progress/progressSesion37.md](Progress/progressSesion37.md)
- ✅ **v30.5 CatDev — Arquitectura de inyección de skills sistema + Canvas Rules Inmutables** — 5 phases (shipped 2026-04-23, sesión 36) — see [Progress/progressSesion36.md](Progress/progressSesion36.md)
- ✅ **v30.4 CatDev — Cronista CatDev (protocolo de documentación viva)** — 5 phases (shipped 2026-04-23, sesión 35) — see [Progress/progressSesion35.md](Progress/progressSesion35.md)
- ✅ **v30.3 CatDev — Inbound v4d (dedup semántico + BlastFunnels lead extraction + respuesta K12/Educaverse)** — 4 phases + 2 hotfixes (shipped 2026-04-23, sesión 34) — see [Progress/progressSesion34.md](Progress/progressSesion34.md)
- ✅ **v30.2 CatDev — Robustez pipeline Inbound (iterator tolerante + silent_skip_cascade)** — 4 phases (shipped 2026-04-23, sesión 33) — see [Progress/progressSesion33.md](Progress/progressSesion33.md)
- ✅ **v30.1 CatDev — Honestidad operativa y robustez del pipeline** — 4 phases (shipped 2026-04-22, sesión 32) — see [Progress/progressSesion32.md](Progress/progressSesion32.md)
- ✅ **v30.0 LLM Self-Service para CatBot** — Phases 158-161 (shipped 2026-04-22, audit `tech_debt`) — see [milestones/v30.0-MILESTONE-AUDIT.md](milestones/v30.0-MILESTONE-AUDIT.md)
- ✅ **v29.1 KB Runtime Integration** — Phases 149-157 (shipped 2026-04-21) — see [milestones/v29.1-ROADMAP.md](milestones/v29.1-ROADMAP.md)
- 🟠 **v29.0 CatFlow Inbound + CRM** — Partial. Cerrado en transición GSD→CatDev (2026-04-22). Scope residual portado a [tech-debt-backlog.md](tech-debt-backlog.md).
- 🆕 **Metodología de desarrollo**: CatDev Protocol reemplaza GSD desde 2026-04-22. Ver `~/docflow/CATDEV_PROTOCOL.md`.

No hay milestone activo ahora mismo. Candidatos pendientes (tech-debt LOW/MEDIUM, no urgentes): (1) promover skill `Arquitecto de Agentes` de lazy-load a literal injection (mismo bug que Orquestador antes de v30.5, category=strategy); (2) R03 fine-tune — anti-patterns persisten 1/3 en dominio comparativa numérica; (3) fix `DATABASE_PATH` default en `kb-sync-db-source.cjs`; (4) `report_cc` no soportado por handler `send_report` (requiere RFC R26); (5) refactor DRY de `buildBody` compartido; (6) KB-44 cleanup de templates duplicados; (7) connectors `n8n_webhook` dependen de `node.data.instructions` como body — candidato a `body_template`/`headers` explícitos en `config` (observación v30.6). Para abrir uno: `/catdev:new [descripción]`.

## v30.7 CatDev (shipped 2026-04-23)

Respuesta al prompt "Comparativa facturación cuatrimestre" de sesión 35 revela laguna: MCP Holded (59 tools) no expone un agregador global por rango absoluto — `holded_invoice_summary` es per-contacto con ventana relativa. v30.7 añade `holded_period_invoice_summary({starttmp, endtmp, docType?, paid?}) → {total_amount, invoice_count, unique_contacts, by_month, by_status, period}` como JS determinista reutilizable para comparativas/dashboards/KPIs. De paso sanea un bug arquitectónico colateral: el renderer del KB `kb-sync-db-source.cjs` no exponía `config.tools[]` en el body del resource connector (ni lo traía en el SELECT), dejando invisible cualquier tool MCP para `search_kb` — misma clase de bug que v30.4 (description truncada) y v30.5 (skills lazy-load).

- **P1** — TOOL: `periodInvoiceSummarySchema` Zod con refine (`endtmp > starttmp`) + handler puro (~60 LOC: loop, Set unique_contacts, byMonth via Date slice, byStatus via inv.paid, round2 final) + rate-limit 100/60s.
- **P2** — TESTS: 8 casos vitest con mock-client (happy path, periodo vacío, filter `paid`, by_month cross-month, rounding, by_status breakdown, Zod rejection, docType param) — 22/22 passed (0 regresiones).
- **P3** — DEPLOY: `npm run build && systemctl --user restart holded-mcp` → MCP `tools/list` devuelve 124 tools incluyendo el nuevo. `PATCH /api/connectors/seed-holded-mcp` append tool al catálogo DB. Extensión del renderer KB (SELECT `config` + `buildBody` append sección `## Tools disponibles (N)`). Full-rebuild KB sanea drift `deprecated→active` del resource (version 7.0.1).
- **P4** — VERIFICACIÓN: llamada MCP real Q1 2025 → 101.708,93€ / 40 facturas / 20 clientes / desglose mensual coherente (6.691€ ene → 38.708€ abr). Cross-check manual con `list_documents` crudo sumado → 101.708,93€ exacto al céntimo. Limitación: `by_status` todo `unpaid` porque Holded API no devuelve `paid` en list endpoint. CatBot CHECK 1 (sin hints) falla — responde de memoria, no descubre tool; CHECK 2 (con directiva `search_kb`) cita el tool con metricas correctas. Observación arquitectónica nueva documentada para v30.8.

Detalles: [.catdev/spec.md](../.catdev/spec.md) + [Progress/progressSesion38.md](Progress/progressSesion38.md).

## v30.6 CatDev (shipped 2026-04-23)

Resolución de un defecto silencioso descubierto al dar luz verde a CatBot para ejecutar el plan v30.5 del canvas "Comparativa facturación cuatrimestre": la MCP tool `canvas_add_edge` rechazaba fan-out desde START por una regla artificial de Phase 138 (commit b245dd6) sin base runtime, lo que forzó a CatBot a inventar un nodo `project` sin `catbrainId` como "Lanzador" (fallback legacy del executor, semánticamente corrupto). v30.6 alinea build-time con runtime, documenta el patrón canónico como R32 y sanea el canvas contaminado.

- **P1** — REMOVE-RULE + INVERT-TEST: bloque `if (sourceType === 'start')` eliminado limpiamente en `canvas_add_edge` (catbot-tools.ts L3075-3081). Test CANVAS-02b invertido — ahora verifica fan-out legal (28/28 tests verde, sin regresión).
- **P2** — R32 KB + CANVAS CONCEPT: regla crítica `R32 — Canvas fan-out desde START` en `.docflow-kb/rules/` con 3 antipatrones explícitos (project sin catbrainId, agent passthrough, cadena secuencial). Concept `canvas.md` actualizado. Taxonomía ampliada (`R31`, `R32` + tags `architecture, prompt, skills, system, topology`).
- **P3** — REWIRE CANVAS 005fa45e: script one-shot + PATCH API con `force_overwrite: true` (DB readonly desde host por permisos container). 7→6 nodos, 7→6 edges. Antipatrón eliminado.
- **P4** — VERIFICACIÓN EMPÍRICA: CHECK 1 — CatBot creó canvas fan-out con 5 edges directos y 0 nodos `project` sin `catbrainId`. CHECK 2 — CatBot citó R32 por nombre reproduciendo los 3 antipatrones tras llamar `search_kb` + `get_kb_entry`.

Detalles: [.catdev/spec.md](../.catdev/spec.md) + [Progress/progressSesion37.md](Progress/progressSesion37.md).

## v30.5 CatDev (shipped 2026-04-23)

Resolución de un bug arquitectónico silencioso descubierto al final de sesión 35: las reglas inmutables añadidas al skill Orquestador CatFlow en v30.4 nunca llegaban al LLM porque el prompt-assembler usaba patrón lazy-load (`"cuando el usuario pida X, llama get_skill"`). El LLM ignoraba consistentemente ese trigger (0 `get_skill` calls en 3 pruebas consecutivas). v30.5 extrae las 8 reglas a skill sistema dedicada corta, inyectada literal via `buildCanvasInmutableSection()` (mirror Auditor/Cronista), y generaliza la lección a regla crítica R31 del KB.

- **P1** — AUDIT: script `scripts/audit-skill-injection.cjs` con matching fuzzy DB↔assembler y flag `--verify` para CI. Clasificación: 4 skills sistema literal (Auditor, Cronista, Operador de Modelos, Protocolo de CatPaw), 2 en lazy-load silencioso (Orquestador, Arquitecto de Agentes).
- **P2** — INMUTABLES: seed `skill-system-canvas-inmutable-v1` (4011 chars) con 8 reglas R01-R08 + anti-patterns R03 concretos + CHECKLIST obligatorio. Revert de PARTE 0 del skill Orquestador (código muerto: 55926→47014 chars).
- **P3** — INJECTION: `buildCanvasInmutableSection()` en prompt-assembler + rule crítica R31 en `.docflow-kb/rules/` con convención arquitectónica para futuros skills sistema.
- **P4** — INSTRUMENTACIÓN: endpoint `GET /api/catbot/diagnostic/prompt-compose` read-only con breakdown del prompt compuesto. Refactor limpio: `collectSections(ctx)` exportada, `build()` queda wrapper 1-línea. Trampa resuelta: Next.js App Router trata directorios `_*` como private.
- **P5** — VERIFICACIÓN: batería de 3 queries multi-dominio (facturación / leads B2B / PDF+RAG). Ganancia empírica: CHECKLIST 0/3→3/3, `get_entity_history` 0/3→3/3, promesa rationale 0/3→3/3, anti-patterns R03 0/3→2/3. Dogfooding: 4 entries rationale_notes en las skills relacionadas.

Detalles: [.catdev/spec.md](../.catdev/spec.md) + [Progress/progressSesion36.md](Progress/progressSesion36.md).

## v30.4 CatDev (shipped 2026-04-23)

Infraestructura de documentación viva. Cierra la brecha entre rationale humano (que vivía solo en `.catdev/spec.md` + `progressSesion*.md`) y lo que CatBot consulta al analizar una entidad antes de actuar. Resultado: CatBot informado automáticamente del historial técnico sin necesidad de que el usuario aporte contexto.

- **P1** — INFRA: columna `rationale_notes TEXT DEFAULT '[]'` en 5 tablas (cat_paws, canvases, catbrains, connectors, skills) + interface `RationaleNote` + extensión de `allowedFields` en los 5 endpoints PATCH.
- **P2** — TOOLS: 6 tools nuevas (`get_entity_history` + 5 `update_*_rationale`). Idempotencia por `(date, change)`. Visibility auto-allow por suffix `_rationale` (append-only low-risk).
- **P3** — SKILL: seed `skill-system-cronista-v1` (4313 chars) con patrón byte-symmetric INSERT OR IGNORE + UPDATE canonical + inyección P1 en prompt assembler.
- **P4** — SYNC: `rationale_notes` a `kb-sync-db-source.cjs` + nueva sección `## Historial de mejoras` en resource files + fix del bug del v30.3 quick-win (description con `---` truncada en body via API PATCH).
- **P5** — BACKFILL: 9 entries retroactivas en 5 entidades (canvas Control Leads, catpaws Respondedor/Redactor, skills Leads y Funnel/Auditor) extraídas de `.catdev/spec.md` + progressSesion33/34.

**Oracle verde:** CatBot, tras llamar `get_entity_history({type: 'skill', id: 'skill-system-auditor-runs-v1'})`, respondió espontáneamente a *"¿por qué parseIteratorItems usa jsonrepair?"* citando el run `609828fa`, el patrón silent_skip_cascade y el tip de regex-salvage — sin ninguna pista del usuario.

Detalles: [.catdev/spec.md](../.catdev/spec.md) + [Progress/progressSesion35.md](Progress/progressSesion35.md).

## v30.3 CatDev (shipped 2026-04-23)

Reescritura de la lógica de negocio del pipeline Inbound sobre la infraestructura ya existente: canvas renombrado de "TEST Inbound" a "Control Leads Info@Educa360.com". Resuelve los 3 bugs de lógica descubiertos tras la verificación de v30.2: dedup por `from` plano agrupaba consultas distintas del mismo remitente, no se extraía el lead real del body de emails `@blastfunnels.com`, y no había respuesta diferenciada K12 Free→Premium ni addon Educaverse para universidades.

- **P1** — LECT-V4D: reescritura del nodo lector con detección de dominio `@blastfunnels.com`, parser del body semi-estructurado, extracción de `email_real` + `tipo_organizacion`, filtro por formulario `Registro cuenta free`, dedup semántico por `(email_real, threadId|formulario)`.
- **P2** — RESP-V4D + hotfix NESTED: respondedor enrutando `plantilla_ref` por producto (K12→xsEEpE, REVI→v7aW5V, etc.), `reply_to_email = email_real` si aggregator, addon Educaverse cuando `tipo_organizacion` matches regex universidad. Hotfix por requirement del executor de bloque `respuesta: {...}` anidado.
- **P3** — TPL-K12/ED-V4D: populate de Pro-K12 y Pro-Educaverse canonicos con `instruction` block `cuerpo_respuesta` + CTA text "Reservar demo". Render verificado via API.
- **P4** — TEST-V4D + hotfix REDACTOR-STRIP: live run + oracle CatBot. Descubierto bug del informe a directiva sin template wrapping (Redactor emitía raw HTML en vez del schema `send_report`). Fix en dos capas (schema + stripping de campos voluminosos para evitar truncate JSON).

Post-shipping: informe ampliado a 4 directivos (antonio/fen/fran/adriano), rename canvas, KB full-rebuild. Prueba final end-to-end con 2 emails enviados desde deskmath@: 3/3 leads respondidos con plantilla correcta + informe con template CatBot. Confirmación del usuario.

**0 ficheros TypeScript tocados** — todo data-only en DB (`canvases.flow_data` + `email_templates.structure`) con updates idempotentes mediante 8 marcadores distintos.

Detalles: [.catdev/spec.md](../.catdev/spec.md) + [Progress/progressSesion34.md](Progress/progressSesion34.md).

## v30.2 CatDev (shipped 2026-04-23)

Cierra el bug HIGH detectado al final de la sesión 32: el run `609828fa-80e6-4d1e-873d-dba3560bb762` (canvas test-inbound) completó `status=completed` pero el iterator devolvió `[]` ante JSON malformado del lector, provocando cascada de 8 nodos skipped y 0 respuestas a leads. El Auditor v30.1 no lo flagó porque los contadores tradicionales estaban a cero.

- **P1** — ITER-01: `parseIteratorItems` extraído a `canvas-iterator-parser.ts` con cascada JSON.parse → jsonrepair → regex-salvage → `[]`+error (RFC en `.planning/reference/RFC-ITER-01-canvas-executor-edit.md` por R26)
- **P2** — LECT-01: hardening del prompt del lector (6 reglas de escape JSON en `flow_data.nodes[lector].data.instructions` con marcador idempotente)
- **P3** — OBS-01: `inspect_canvas_run` extendido con `silent_skip_cascade` + Auditor skill bumpeado a v2.0 (patrón INSERT OR IGNORE + UPDATE canonical)
- **P4** — TEST-01: regression suite 12/12 con fixture real del run 609828fa (20.452 bytes)

Verificación end-to-end: run live `66aeb915` con 11/11 nodos completados, degraded=false, lead K12 respondido. Detalles: [.catdev/spec.md](../.catdev/spec.md) + [Progress/progressSesion33.md](Progress/progressSesion33.md).

## v30.1 CatDev (shipped 2026-04-22)

Primer milestone bajo el protocolo CatDev. Resuelve los 3 defectos infraestructurales descubiertos en el run `e9679f28` del canvas test-inbound e introduce observabilidad post-ejecución vía skill Auditor.

- **P1** — KB filesystem permissions (docflow-init extendido con chmod a+rwX para /docflow-kb)
- **P2** — Discovery + alias routing: `chat-rag` migrado de FQN `anthropic/claude-sonnet-4` a shortcut `claude-sonnet` (sin fallback)
- **P3** — RAG embedding context overflow: truncate defensivo en `ollama.getEmbedding` con límites por familia de modelo
- **P4** — CatBot observability tools (`inspect_canvas_run`, `get_recent_errors`) + skill `Auditor de Runs`

Detalles completos: [.catdev/spec.md](../.catdev/spec.md) + [Progress/progressSesion32.md](Progress/progressSesion32.md).

---

## Overview de milestones cerrados

### Milestone v29.0 — CatFlow Inbound + CRM (Partial — cerrado 2026-04-22)

**Scope original:** 4 phases lineales (145 CatPaw Operador Holded, 146 Canvas Inbound+CRM manual, 147 Tests E2E, 148 Entrenamiento CatBot PARTE 21).

**Decisión de cierre:** No se completa el scope GSD. El patrón Inbound+CRM funciona en producción con arquitectura distinta (Connector Gmail determinista, no CatPaw Operador) — ver [progressSesion31.md Bloque 12 "CatFlow Inbound v4c"](Progress/progressSesion31.md). Phase 145 artifact queda en DB como won't-do; scope de 146-148 migrado al backlog CatDev.

**Detalle del cierre:** [tech-debt-backlog.md §1 + §3](tech-debt-backlog.md)
**Audit original:** [v29.0-MILESTONE-AUDIT.md](v29.0-MILESTONE-AUDIT.md) (2026-04-20) para estado previo a la decisión.

### Milestone v30.0 — LLM Self-Service para CatBot (Shipped 2026-04-22)

CatBot se convierte en operador consciente del stack de modelos LLM: enumera modelos con capabilities, cambia su propio alias bajo sudo, extended-thinking end-to-end (Opus/Sonnet 4.6 + Gemini 2.5 Pro + passthrough a LiteLLM). 21/21 requirements satisfied across 4 phases (158 schema+catálogo, 159 backend passthrough, 160 tools+KB skill, 161 UI+oracle).

**Audit:** [milestones/v30.0-MILESTONE-AUDIT.md](milestones/v30.0-MILESTONE-AUDIT.md) — status `tech_debt` (ship con deferred items de severidad baja, ver [tech-debt-backlog.md §2](tech-debt-backlog.md)).

---

## Fases completadas

### v30.0 checklist (shipped 2026-04-22)
- [x] **Phase 158: Model Catalog Capabilities + Alias Schema** — `model_intelligence` con `supports_reasoning`/`max_tokens_cap`/`tier` + `model_aliases` con `reasoning_effort`/`max_tokens`/`thinking_budget` + seed + `GET /api/models` ampliado (CAT-01..03, CFG-01)
- [x] **Phase 159: Backend Passthrough LiteLLM Reasoning** — `streamLiteLLM` propaga `reasoning_effort`/`thinking.budget_tokens`/`max_tokens` + `resolveAliasConfig()` paralelo + CatBot chat route consume params resueltos (CFG-02..03, PASS-01..04)
- [x] **Phase 160: CatBot Self-Service Tools + Skill KB** — Tools `list_llm_models`/`get_catbot_llm`/`set_catbot_llm` (sudo-gated) + skill KB "Operador de Modelos" con protocolo tarea→modelo (TOOL-01..04)
- [x] **Phase 161: UI Enrutamiento + Oracle End-to-End** — Tab Enrutamiento con dropdown Inteligencia + inputs condicionales + oracle CatBot 3/3 (VER-01/02 complete; VER-03 complete non-streaming, streaming deferred a Gap B-stream en [tech-debt-backlog.md](tech-debt-backlog.md)) (UI-01..03, VER-01..04)

<details>
<summary>✅ v29.1 KB Runtime Integration (Phases 149-157) — SHIPPED 2026-04-21</summary>

- [x] Phase 149: KB Foundation Bootstrap (5/5 plans)
- [x] Phase 150: KB Populate desde DB (4/4 plans)
- [x] Phase 151: KB Migrate Static Knowledge (4/4 plans)
- [x] Phase 152: KB CatBot Consume (4/4 plans)
- [x] Phase 153: KB Creation Tool Hooks (4/4 plans)
- [x] Phase 154: KB Dashboard /knowledge (3/3 plans)
- [x] Phase 155: KB Cleanup Final (4/4 plans)
- [x] Phase 156: KB Runtime Integrity (3/3 plans)
- [x] Phase 157: KB Rebuild Determinism + Body Backfill (3/3 plans)

Full details: [milestones/v29.1-ROADMAP.md](milestones/v29.1-ROADMAP.md) · Requirements: [milestones/v29.1-REQUIREMENTS.md](milestones/v29.1-REQUIREMENTS.md) · Audit: [milestones/v29.1-MILESTONE-AUDIT.md](milestones/v29.1-MILESTONE-AUDIT.md)

</details>

### v29.0 checklist (partial — cerrado)
- [x] **Phase 145: CatPaw Operador Holded** — CatPaw `53f19c51-9cac-4b23-87ca-cd4d1b30c5ad` creado con caveats. Marcado won't-do en [tech-debt-backlog.md](tech-debt-backlog.md).
- [~] **Phase 146: CatFlow Inbound+CRM Manual** — No ejecutado (GSD). Funcionalmente resuelto con arquitectura distinta en [progressSesion31.md Bloque 12](Progress/progressSesion31.md). Scope migrado al backlog CatDev.
- [~] **Phase 147: Tests E2E Inbound+CRM** — No ejecutado. Scope migrado al backlog CatDev.
- [~] **Phase 148: Entrenamiento CatBot Patron CRM** — No ejecutado. Scope migrado al backlog CatDev.

---

## Histórico pre-v25

Las fases 01-55 (milestones v1-v14) se archivaron en `.planning/phases-archive/` durante la transición GSD→CatDev (2026-04-22) para reducir ruido en `.planning/phases/`. Todo el trabajo correspondiente está shipped y documentado en [.planning/Progress/](Progress/).

---

## Próximo milestone

Se abre con `/catdev:new [descripción]`. El comando leerá:
- `.planning/STATE.md` — estado actual
- `.planning/ROADMAP.md` — este documento
- `.planning/tech-debt-backlog.md` — items pendientes
- `.planning/Progress/progressSesion31.md` (la más reciente)
- `.docflow-kb/_manual.md` + `_header.md` — conocimiento del proyecto

Sugerencias de candidatos (del backlog):
- Items del backlog-activo en [tech-debt-backlog.md §3](tech-debt-backlog.md)
- Saneamiento de tests legacy (~18 failures en baseline CI)
- Cualquier feature nuevo que describas
