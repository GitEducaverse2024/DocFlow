# Milestones

## v30.1 CatDev — Honestidad operativa y robustez del pipeline (Shipped: 2026-04-22)

**Scope:** 4 phases (P1 KB permissions, P2 alias routing, P3 RAG embedding, P4 observability + skill Auditor). Primer milestone bajo metodología **CatDev Protocol** (reemplaza GSD).
**Sesión:** 32 — ver [Progress/progressSesion32.md](Progress/progressSesion32.md) y [.catdev/spec.md](../.catdev/spec.md).
**Oracle:** 3/4 CHECKs automated ✅ | CHECK 3 (respuesta del Respondedor con contenido del KB Educa360) pendiente validación manual re-ejecutando el canvas `test-inbound-ff06b82c` con emails reales.

**Delivered:** cierre de los 3 defectos infraestructurales descubiertos en el run `e9679f28` (2026-04-22 15:15 UTC): (a) KB filesystem permissions via `docflow-init` extendido; (b) alias `chat-rag` migrado de FQN `anthropic/claude-sonnet-4` a shortcut `claude-sonnet` con `reasoning_effort: medium`; (c) truncate defensivo en `ollama.getEmbedding` con tabla de límites conservadores por familia de modelo. Además entregada la capa de observabilidad post-ejecución: tools `inspect_canvas_run` y `get_recent_errors` + skill comportamental `Auditor de Runs` (P1 injection en prompt-assembler). CatBot ahora cruza output_plane con infrastructure_plane antes de dar informe final — evita el anti-pattern de "100% funcional" con degradaciones ocultas.

### Key accomplishments

- **P1 KB permissions** — `docker-compose.yml` `docflow-init` extendido con `chmod -R a+rwX /docflow-kb` (owner `deskmath` preservado para host workflow; container nextjs escribe via `other`). 0 EACCES post-fix verificado via CatBot oracle.
- **P2 Alias routing** — Root cause: LiteLLM Discovery solo expone 12 shortcuts, no FQNs. `chat-rag → anthropic/claude-sonnet-4` activaba `same_tier_fallback:Elite → claude-opus`. Fix: `PATCH /api/alias-routing` con `model_key: "claude-sonnet"`. Log confirma `fallback=False` tras el cambio.
- **P3 RAG embedding** — `mxbai-embed-large` tiene ctx 512 tokens; queries 1685+ chars generaban `400 input length exceeds context length`. Fix en `ollama.getEmbedding` con tabla `EMBEDDING_CHAR_LIMITS` (mxbai: 1200 chars, nomic: 18000, etc.) + `logger.warn` cuando se trunca. Smoke test: query 2920 chars → truncate a 1200 → HTTP 200.
- **P4 Observability** — 2 tools read-only + skill sistema. `inspect_canvas_run(runId)` devuelve `{output_plane, infrastructure_plane: {errors, fallbacks, kbSyncFailures, embeddingErrors, outliers, degraded}}`. `get_recent_errors(minutes, filter?)` agrupa errores por `source+message`. Skill `skill-system-auditor-runs-v1` (3318 chars instructions) inyectado en P1 del prompt-assembler como `auditor_protocol` — mirror pattern de Phase 160-04.

### Metrics

- **Timeline:** ~1h35min reloj (estimado original 5-7h)
- **Tools nuevas CatBot:** 2 (`inspect_canvas_run`, `get_recent_errors`)
- **Skills sistema nuevos:** 1 (`skill-system-auditor-runs-v1`)
- **Bugs corregidos:** 3 (los 3 del run e9679f28)
- **Tech debt capturado:** 2 nuevos items (UX-04 UI Enrutamiento warning, embedding retry progresivo)
- **Tech debt mitigado incidentalmente:** 1 (Gap C parcial de v30.0 — shortcuts chat-rag ahora sin fallback)
- **Docker rebuilds:** 4 (P1, P3, P4 x2 por visibility hotfix)
- **Ficheros modificados:** 7 de código + 10 de docs + 2 de config
- **Ficheros nuevos:** 9

### Known gaps (deferred)

- **CHECK 3 pendiente validación manual** — re-ejecutar canvas `test-inbound-ff06b82c` con emails reales para confirmar que la respuesta al lead ahora incluye contenido del KB Educa360 (productos, precios, FAQs).
- **UX-04** (capturado durante P2) — UI Enrutamiento debería advertir si el `model_key` seleccionado no aparece en Discovery inventory. Severidad LOW.
- **Embedding retry progresivo** — si el límite de una familia desconocida falla, no hay retry automático con límite menor. Tech debt menor.
- **Phase E del draft original** (Anthropic rate limit + system prompt compaction) — marcada **won't-do por ahora** en la decisión de scope del milestone.

### Tag

- `v30.1` (to be created after milestone commit)

---

## v30.0 LLM Self-Service para CatBot (Shipped: 2026-04-22)

**Scope:** Phases 158-161 (4 phases, 19 plans)
**Requirements:** 21/21 satisfied (CAT-01..03, CFG-01..03, PASS-01..04, TOOL-01..04, UI-01..03, VER-01..04)
**Audit:** `tech_debt` status — 21/21 requirements, 4/4 phases passed, 21/21 integration wired, 3/4 E2E flows complete + 1 deferred (Gap B-stream streaming path reasoning_usage). Full audit: [milestones/v30.0-MILESTONE-AUDIT.md](milestones/v30.0-MILESTONE-AUDIT.md).

**Delivered:** CatBot self-service sobre el stack LLM: enumera modelos con capabilities, cambia su propio alias con sudo, reasoning extended-thinking propagado end-to-end (Opus/Sonnet + Gemini 2.5 Pro) con reasoning_tokens visibles en logs.

### Key accomplishments

- **Schema + Catalog** (158) — `model_intelligence` extendido con `supports_reasoning`/`max_tokens_cap`/`tier` + `model_aliases` con `reasoning_effort`/`max_tokens`/`thinking_budget`. Seeds canónicos para Claude Opus/Sonnet 4.6 + Gemini 2.5 Pro (reasoning-capable) + Ollama (tier=local). `GET /api/models` amplía shape con flat-root capabilities.
- **Backend Passthrough** (159) — `resolveAliasConfig()` paralelo a `resolveAlias()` (Pitfall #1 locked, 14+ legacy callers preservados en shim). `streamLiteLLM` propaga `reasoning_effort` + `thinking.budget_tokens` + `max_tokens` al body LiteLLM. `PATCH /api/alias-routing` valida cross-field (hasOwnProperty gate) con capability lookup post-update y fallback gracioso en namespace mismatch.
- **CatBot Self-Service Tools + KB Skill** (160) — Tools `list_llm_models` / `get_catbot_llm` (read-only) + `set_catbot_llm` (sudo-gated, thin shim sobre PATCH, validación delegada al server). Skill KB "Operador de Modelos" (`skill-system-modelos-operador-v1`) auto-inyectado como P1 section de CatBot con protocolo tarea→modelo (4-quadrant recommendation + 5 reglas absolutas + namespace-mismatch fallback).
- **UI Enrutamiento + Oracle E2E** (161) — Tab Enrutamiento gana dropdown Inteligencia + inputs max_tokens/thinking_budget condicionales por capability. Sudo gate mirrored en streaming + non-streaming paths. Oracle VER-01/02 complete; VER-03 complete on non-streaming (4 live JSONL lines con `reasoning_tokens=10/175/169/154`); streaming path deferred a v30.1 como Gap B-stream.

### Metrics

- **Timeline:** 2026-04-21 → 2026-04-22 (~1.5 días)
- **Requirements:** 21/21 satisfied
- **Tests:** 33/33 green on stream-utils + alias-routing extended-body; new `route.test.ts` (300 lines) for catbot/chat narrow PASS-03/PASS-04 contract; 81/81 pre-existing PromptAssembler tests green (zero regression)

### Known gaps (deferred — see [tech-debt-backlog.md](tech-debt-backlog.md))

- **Gap B-stream**: streaming path reasoning_usage logger silent in 26k-prompt regime (LOW, non-blocking)
- **Gap C**: `list_llm_models` reports `available=false` for 4 LiteLLM shortcuts (cosmetic, non-blocking)
- **FQN drift**: prod DB has `claude-opus-4` (no `-6` suffix); Phase 158 seed UPDATE silent no-op
- **Nyquist VALIDATION.md**: missing/partial en 158, 159, 161 (no se rellena retroactivamente — en CatDev el Nyquist se reemplaza por oracle CatBot)

### Tag

- `v30.0` (to be created after milestone commit)

---

## v29.0 CatFlow Inbound + CRM (Partial — cerrado en transición GSD→CatDev: 2026-04-22)

**Scope original:** Phases 145-148 — 1 phase shipped-with-caveats + 3 phases not-started.
**Decisión de cierre:** No se ejecuta el resto del scope (decisión explícita en transición a CatDev).

### Resultado final
- **Phase 145 (CatPaw Operador Holded)** — shipped con caveats. Marcado **won't-do** en [tech-debt-backlog.md §1](tech-debt-backlog.md). El CatPaw queda en DB (`53f19c51-9cac-4b23-87ca-cd4d1b30c5ad`) sin consumidor activo.
- **Phases 146-148** (canvas Inbound+CRM manual + tests E2E + PARTE 21) — **scope migrado** al [tech-debt-backlog.md §3](tech-debt-backlog.md). El patrón Inbound funciona en producción con arquitectura distinta (Connector Gmail determinista — ver [progressSesion31.md Bloque 12 "CatFlow Inbound v4c"](Progress/progressSesion31.md)).

Ver audit original: [v29.0-MILESTONE-AUDIT.md](v29.0-MILESTONE-AUDIT.md) (2026-04-20) para el estado completo antes del cierre.

---

## v29.1 KB Runtime Integration (Shipped: 2026-04-21)

**Scope:** Phases 149-157 (9 phases, 35 plans)
**Requirements:** 45/45 satisfied (KB-01..KB-43 + KB-46 + KB-47). KB-44/KB-45 deferred to v29.2 as orthogonal.
**Audit:** cycle 3 passed — 7/7 cross-phase seams WIRED, 4/4 E2E flows end-to-end, 0 open regressions (commit 06d69af7 resurrection pathology closed by Phase 157).

**Delivered:** A fully live Knowledge Base at `.docflow-kb/` that CatBot reads and writes in real time.

### Key accomplishments

- **Foundation** (149) — `.docflow-kb/` scaffold with 10 subdirectories, `frontmatter.schema.json` (13 obligatory fields, bilingual `title.es/en`), `tag-taxonomy.json` controlled vocabulary, `knowledge-sync.ts` service (4 ops × 3 semver bump rules), `scripts/kb-sync.cjs` CLI (`--full-rebuild`/`--audit-stale`/`--archive`/`--purge`, 150d warning + 170d alert + 180d archive retention).
- **Populate** (150) — `kb-sync.cjs --full-rebuild --source db` generates 66 resource files from 6 DB tables (cat_paws, connectors, skills, catbrains, email_templates, canvases) with schema validation, idempotence (0 writes on unchanged DB), orphan detection, `--dry-run`/`--verbose`/`--only` flags.
- **Static migration** (151) — `.planning/knowledge/*.md`, `app/data/knowledge/*.json`, skill prompts migrated to `domain/concepts`, `domain/taxonomies`, `domain/architecture`, `rules/` (R01-R25), `protocols/` (orquestador skills), `runtime/*.prompt.md`. 128 entries live.
- **CatBot consume** (152) — `search_kb({tags,type,audience,search})` + `get_kb_entry({id})` tools (always-allowed, read-only); `kb_entry` field on 5 listing tools (`list_cat_paws`, `list_catbrains`, `list_skills`, `list_email_templates`, `canvas_list`); `buildKbHeader()` injects `_header.md` as P1 system context in prompt-assembler.
- **Creation hooks** (153) — 22 hook sites (6 CatBot tool cases + 15 API route handlers + 1 sudo tool) fire `syncResource` on every DB create/update/delete; `kb-audit.ts` module with `markStale()` writing non-schema-validated failure log; DELETE soft-deletes via `markDeprecated()` (no `fs.unlink`). `kb-index-cache` byTableId field-name fix closes prior `kb_entry:null` drift end-to-end.
- **Dashboard** (154) — `/knowledge` server component with 4-filter UI (`type`, `subtype`, `status`, `audience`+tags+search), timeline (recharts), 8-card counts bar, 125-row table; `/knowledge/[id]` detail view with breadcrumb, body via remark-gfm, relations table, metadata; `/api/knowledge/[id]` read-only endpoint; sidebar nav entry with i18n.
- **Legacy cleanup** (155) — `.planning/knowledge/` + `app/data/knowledge/` + `app/src/lib/knowledge-tree.ts` + `TabKnowledgeTree` UI + `knowledge/tree` API physically deleted; `CLAUDE.md` simplified 80→46 lines (pointer + `search_kb({tags:['critical']})` hint); R26-R29 critical rule atoms (canvas-executor inmutable, agentId UUID, `process['env']`, Docker rebuild); `canvas-rules.ts` rewritten to read from `.docflow-kb/rules/` + 7 new atoms (SE01-SE03, DA01-DA04); live-DB backfill produces `kb_entry` non-null for all CatPaws including post-Phase-150 (Operador Holded).
- **Runtime integrity** (156) — canvas write-path sync (`POST`/`PATCH`/`DELETE /api/canvas/*` + `delete_catflow` sudo tool all route through `syncResource`), link tools re-sync parent CatPaw body (`## Conectores vinculados` / `## Skills vinculadas` sections + `buildSearchHints` frontmatter extension, `search_kb({search:"holded"})` 4→9 hits); 15 orphans archived to `.docflow-legacy/orphans/` via `git mv` with retention policy documented in `_manual.md`.
- **Rebuild determinism** (157) — `scripts/kb-sync-db-source.cjs` `loadArchivedIds()` + Pass-2 exclusion gate seals commit 06d69af7 resurrection (0/8 archived catpaws reappear); `buildBody(subtype, row, relations?)` 3-arg signature renders linked sections byte-stable during rebuild; `cmdRestore --from-legacy <id>` opt-in readmission dispatcher; R30 rule atom documents contract with dual-discovery via `search_kb({tags:['retention']})`.

### Metrics

- **Timeline:** 2026-04-18 → 2026-04-21 (~4 days from Phase 149 kickoff to Phase 157 oracle approval)
- **Requirements:** 45 KB REQ-IDs (KB-01..KB-47 minus KB-44/KB-45), 100% satisfied
- **Tests:** 33/33 green on `kb-sync-rebuild-determinism.test.ts`; 22 `knowledge-sync` tests; Playwright 11/11 dashboard; CatBot oracle 3/3 on Phase 157, 4/4 on Phase 156, 3/3 on Phase 155
- **KB state at close:** 187 entries across 10 subdirs, `_header.md` + `_index.json` regenerated atomically, `.docflow-legacy/orphans/` holds 15 archived files

### Known gaps (deferred to v29.2)

- **KB-44**: `email-templates` active count shows +1 vs DB (duplicate-mapping pathology, 2 KB files → 1 DB row, not orphan)
- **KB-45**: CatBot `list_connectors` tool missing (only scoped `list_email_connectors` exists)
- **Idempotence cosmetic regression**: second `--full-rebuild --source db` re-bumps 56 version/timestamp fields on unchanged DB (pre-existing Phase 150/153 drift, non-blocking)

### Tag

- `v29.1` (to be created after milestone commit)

---
