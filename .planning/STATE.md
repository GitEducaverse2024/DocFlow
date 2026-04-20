---
gsd_state_version: 1.0
milestone: v29.0
milestone_name: checklist
current_plan: 4
status: executing
stopped_at: "Completed 155-04-PLAN.md body (3 tasks + SUMMARY); awaiting Task 4 human-verify checkpoint before /gsd:complete-phase 155"
last_updated: "2026-04-20T18:00:34.764Z"
last_activity: 2026-04-20
progress:
  total_phases: 11
  completed_phases: 8
  total_plans: 29
  completed_plans: 29
  percent: 86
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17)

**Core value:** CatFlow Inbound+CRM completo (email -> clasificacion -> CRM Holded -> respuesta con template) como piloto manual, luego CatBot lo construye autonomamente.
**Current focus:** Phase 145 - CatPaw Operador Holded

## Current Position

Phase: 155 of 155 (KB Cleanup Final — PRD Fase 7)
Current Plan: 4
Total Plans in Phase: 4
Status: In progress — Plan 155-01 complete (canvas-rules.ts rewritten to read from .docflow-kb/rules/; 7 new SE/DA atoms SE01-SE03 + DA01-DA04 created; 15/15 unit tests + 78/78 IntentJobExecutor tests green; validate-kb.cjs 128→135 files OK; grep invariant: 0 refs to app/data/knowledge in canvas-rules.ts). Plan 155-02 (physical deletion of app/data/knowledge + legacy stubs) up next. Phases 149-154 complete.
Last activity: 2026-04-20

Progress: [█████████░] 86%

## Performance Metrics

**Previous milestone (v28.0):** 7 phases (138-144), 20 requirements, all complete. Score CatBot 60->70 (medido), piloto E2E verificado.

**Velocity:**
- Total plans completed: 6 (149-01..05 + 150-01)
- Average duration: ~8 min per plan
- Total execution time: ~48 min

| Phase | Plan | Duration | Tasks | Files |
| ----- | ---- | -------- | ----- | ----- |
| 149   | 01   | ~8 min   | 5     | 30+   |
| 149   | 05   | ~10 min  | 2     | 6     |
| 149   | 02   | ~6 min   | 2     | 1     |
| 149   | 03   | ~7.5 min | 2     | 2     |
| 149   | 04   | ~8 min   | 2     | 4     |
| 150   | 01   | ~8 min   | 3     | 7     |
| Phase 150 P02 | 6min | 2 tasks | 2 files |
| Phase 150 P03 | 6min | 2 tasks | 6 files |
| Phase 150 P04 | 6.5min | 3 tasks | 74 files |
| Phase 151 P01 | ~45min | 3 tasks | 42 files |
| Phase 151 P02 | 12min | 3 tasks | 25 files |
| Phase 151 P03 | 4min | 2 tasks | 8 files |
| Phase 151 P04 | ~55min | 3 tasks | 9 files |
| Phase 152 P01 | 13min | 2 tasks | 10 files |
| Phase 152 P02 | 6min | 2 tasks | 4 files |
| Phase 152 P03 | 7min | 2 tasks | 4 files |
| Phase 152 P04 | 11min | 3 tasks | 5 files |
| Phase 153 P01 | 4min | 3 tasks | 6 files |
| Phase 153 P02 | 7min | 2 tasks | 2 files |
| Phase Phase 153 PP03 | 9min | 2 tasks | 12 files |
| Phase 153 P4 | 18min | 4 tasks | 11 files |
| Phase 154 P01 | 5min | 3 tasks | 12 files |
| Phase 154 P02 | 5min | 2 tasks | 9 files |
| Phase 154 P03 | 20min | 3 tasks | 7 files |
| Phase 155 P01 | 12min | 3 tasks | 9 files |
| Phase 155 P02 | 11min | 3 tasks | 52 files |
| Phase 155 P03 | 6min | 3 tasks | 114 files |
| Phase 155 P04 | 8min | 4 tasks | 4 files |

## Accumulated Context

### Roadmap Evolution
- Phase 149 added: KB Foundation Bootstrap — prerequisite of Canvas Creation Wizard. Creates `.docflow-kb/` unified knowledge base with schema validation, semver versioning, soft-delete + 180d purge mechanism. Orthogonal to v29 CRM flow. Backed by `.planning/ANALYSIS-knowledge-base-architecture.md`.
- Phase 150 added: KB Populate desde DB (catpaws, connectors, skills, catbrains, templates) — Fase 2 del PRD KB. Extends `kb-sync.cjs` with `--source db`, generates `resources/*.md` from live DB tables via `knowledge-sync.ts`. Produces the first real content in the KB.
- Phase 151 added: KB Migrate Static Knowledge — PRD Fase 3 (§7 de ANALYSIS-knowledge-base-architecture.md). Migra `.planning/knowledge/*.md`, `app/data/knowledge/*.json`, `skill_orquestador_catbot_enriched.md` y system prompts hardcoded en `app/src/lib/services/catbot-pipeline-prompts.ts` al KB estructurado: `domain/concepts/`, `domain/taxonomies/`, `domain/architecture/`, `rules/` (R01/R02/R10/R13…), `protocols/` (skills orquestador), `runtime/*.prompt.md`, `incidents/`, `guides/`. Requirements KB-12/13/14 se registran en `/gsd:plan-phase 151`. Depends on Phase 150 (completada). Paralelizable con 152 (CatBot Consume) y 154 (Dashboard) en worktree `gsd/phase-151-kb-migrate-static` — archivos disjuntos. NO toca CLAUDE.md ni borra originales; eliminación física es Phase 155. Originales quedan con nota de redirect al path del KB.
- Phase 152 added: KB CatBot Consume — PRD Fase 4. `prompt-assembler` consume `.docflow-kb/_header.md` como system context en cada sesión; tools nuevas `get_kb_entry(id)` y `search_kb({tags, type, audience, search})` contra `_index.json`; tools existentes de listado (`list_cat_paws`, `list_connectors`, `list_skills`, `list_catbrains`, `list_email_templates`, `list_canvases`) añaden campo `kb_entry` con path relativo en `.docflow-kb/resources/`. Requirements KB-15/16/17 se registran en `/gsd:plan-phase 152`. Depends on Phase 150 (no requiere 151). Paralelizable con 151 y 154 en worktree `gsd/phase-152-kb-catbot-consume`.
- Phase 153 added: KB Creation Tool Hooks — PRD Fase 5. Engancha `create_*`/`update_*`/`delete_*` tools de CatBot a `syncResource` de `knowledge-sync.ts`: cada write en DB actualiza automáticamente el archivo KB correspondiente + `_index.json` + `_header.md`. Requirements KB-18/19 se registran en `/gsd:plan-phase 153`. Depends on Phase 152 (mismo dispatcher de tools de CatBot, secuencial).

### From v28.0 (Lecciones del Piloto E2E)
- RESTRICCION: CONDITION solo pasa "yes/no" -- el nodo siguiente pierde el JSON. NO usar en pipelines de datos.
- RESTRICCION: CatBrain/RAG usa instructions como query al CatBrain, no el predecessorOutput. Contexto inline.
- RESTRICCION: CatPaws con system_prompt elaborado reinterpretan el input. Nodos genericos para procesamiento.
- PATRON VALIDADO: 8 nodos lineales (START -> Normalizador -> Clasificador -> Respondedor -> Gmail -> Output)
- DATA CONTRACT Gmail: {accion_final: "send_reply", respuesta: {plantilla_ref, saludo, cuerpo}} -- NO {to, subject, html_body}
- CatPaw SOLO para tools externas (Holded MCP, Gmail send). Sin CatPaw para procesamiento de datos.
- PARTEs 19-20 aplicadas en Skill Orquestador. canvas.json actualizado con restricciones.

### Decisions
(for v29.0)
- [Phase 145]: Operador Holded as generalist CRM agent for flexible canvas pipelines (vs rigid Consultor CRM)
- [Phase 149-kb-foundation-bootstrap]: Bootstrap .docflow-kb/ and .docflow-legacy/ scaffolding with deterministic stubs (ISO 2026-04-18T00:00:00Z) — real timestamps arrive when knowledge-sync.ts regenerates
- [Phase 149-kb-foundation-bootstrap]: Added forward-compatible link to .planning/reference/auditoria-catflow.md in Index.md even though directory will be created in Plan 149-05
- [Phase 149-05]: Option A (Total replacement) chosen — the active .planning/MILESTONE-CONTEXT.md was a stale v27 briefing (Memento Man / Pipeline Architect, 2026-04-11), two milestones behind. Replaced with milestone-v29-revisado.md content (v29 post-piloto v28 briefing); previous v27 preserved in git history
- [Phase 149-05]: Task 1 (delete MILESTONE-CONTEXT-AUDIT.md duplicate) absorbed into Plan 149-01 commit b3d81f8 (pre-staged deletion) — Plan 149-05 generated only 2 task commits instead of the 3-4 originally planned
- [Phase 149-02]: Vanilla-Node validator over AJV dependency — repo root has no package.json; inline YAML subset parser + manual schema check. Upgrade path to AJV documented in validator docstring (~30 line swap when package.json arrives).
- [Phase 149-02]: YAML parser scope pinned to exactly the shapes used in PRD §3.3 + Apéndice A/B (both canonical fixtures verified exit 0). Out of scope: anchors, `|`/`>` multiline strings. Parser must be replaced if archived content uses advanced YAML.
- [Phase 149-02]: resource.schema.json allOf+$ref is contract-of-record only; validator applies frontmatter.schema.json rules procedurally. AJV consumption deferred until package.json exists at root.
- [Phase 149-03]: sync_snapshot sub-object persists fields_from_db critical values (system_prompt, connectors_linked, skills_linked, io_contract_hash) in frontmatter so detectBumpLevel has ground truth across updates — alternative (body re-parse) was rejected as more brittle.
- [Phase 149-03]: YAML parser/serializer bundled inline (same strategy as Plan 149-02) — app/ has js-yaml available, but dep-free parser guarantees byte-for-byte round-trip with validate-kb.cjs and the integration test proves the contract.
- [Phase 149-03]: Monolithic 1418-line service over plan's 500-line split threshold — the YAML subsystem (~450 lines) is a tight internal helper; splitting would add an import boundary for no reuse gain.
- [Phase 149-03]: Relaxed YAML `needsQuoting` heuristic (only quote `:\s` or trailing `:`, not every colon) — test regexes depend on bare-scalar formatting like `deprecated_by: user:antonio`, YAML 1.2 allows this.
- [Phase 149-04]: CLI is vanilla Node `.cjs` with inline YAML parser/serializer — no npm deps at repo root (repo has no root `package.json`; CLI must run standalone in CI and dev). YAML parser duplicated byte-for-byte from `scripts/validate-kb.cjs` (Plan 149-02); unification deferred until AJV/js-yaml arrives at repo root — documented upgrade path in CLI docstring.
- [Phase 149-04]: Destructive ops (`--archive`, `--purge`) require `--confirm` explicit flag; without it, exit 1 with usage message. No default-to-destructive behavior.
- [Phase 149-04]: `--source db` branch present but rejected with `Not implemented — Fase 2 del PRD` message; both `--source db` (two args) and `--source=db` (one arg) forms handled.
- [Phase 149-04]: `cmdArchive` calls `cmdFullRebuild([])` at end to maintain `_index.json` consistency after each archive batch — single-command operation, not two separate steps.
- [Phase 149-04]: Thresholds fixed as module-level constants per PRD §5.3 (WARNING=150d, VISIBLE_WARNING=170d, ARCHIVE=180d); only purge threshold configurable via `--older-than-archived=<days>` flag (default 365d).
- [Phase 149-04]: `_audit_stale.md` uses `type: audit` + `ttl: never` — schema v2 supports these, audit snapshots are point-in-time artifacts not TTL-managed content.
- [Phase 150-01]: `FIELDS_FROM_DB.connector` patched at the service layer (remove 'config', add 'times_used'/'test_status') rather than overriding downstream — 1-line fix, aligns Phase 149 service with CONTEXT D2.2 for all future callers, no dual source of truth. 35 existing tests still green.
- [Phase 150-01]: `stripVolatile` key set includes `sync_snapshot` even though it's not a timestamp. Snapshot values are fully derived from fields_from_db, so when the row is unchanged, snapshot values cannot disagree — including it sidesteps a subtle false-positive-change failure mode in idempotence comparison.
- [Phase 150-01]: `isNoopUpdate` short-circuits `syncResource('update')` BEFORE calling `detectBumpLevel`/`bumpVersion` and before mutating version/updated_at/change_log. Second run on unchanged row → byte-identical file. Strict byte-equality is the property Plans 02-04 idempotence tests assert.
- [Phase 150-01]: Wave 0 fixture DB schema includes `flow_data`/`thumbnail` on canvases and `structure`/`html_preview` on email_templates (production-parity) even though the Plan 02 module will never SELECT them — Plan 04 security canary tests need to seed these columns without amending the fixture helper later (plan-checker Advisory 3).
- [Phase 150]: [Phase 150-02]: better-sqlite3 resolved via absolute path require(path.resolve(__dirname, '..', 'app', 'node_modules', 'better-sqlite3')) — repo root has no node_modules and Node's upward-walk CJS resolution can't reach app/node_modules from scripts/*.cjs. One-liner, robust, documented.
- [Phase 150]: [Phase 150-02]: Email-template floor tag = 'template' (not 'email-template'). tag-taxonomy.json entities contains 'template' but not 'email-template'; emitting the hyphenated form would fail validate-kb.cjs. Internal subtype identifier stays 'email-template' (frontmatter subtype + subdir name); only the rendered tag differs.
- [Phase 150]: [Phase 150-02]: related field renders as array of { type, id } objects (not strings). frontmatter.schema.json declares array-of-strings but validate-kb.cjs does NOT validate related[] items; Phase 149 knowledge-sync.ts:953 initializes related: [] without schema opinion; CONTEXT §D2.3 shows objects. Fidelity to CONTEXT + future Phase 4 consumption wins over literal-schema reading that isn't enforced.
- [Phase 150]: [Phase 150-03]: CLI --source db delegates to populateFromDb, --dry-run/--verbose/--only flags with exit codes 0/2/3; canvases_active added to _index.json counts shape.
- [Phase 150]: [Phase 150-03]: Ported detectBumpLevel to CJS with null-return on stable-equal projection (stripVolatile + stableStringify) — second run on unchanged DB produces byte-identical files. Body-scan detects system_prompt and mode changes that live in rendered Markdown, not frontmatter.
- [Phase 150]: [Phase 150-03]: Orphan detection emits WARN per KB file without matching DB row, increments report.orphans, NEVER modifies/deletes the file — auto-deprecation is Fase 5 PRD.
- [Phase 150]: [Phase 150-03]: Robust better-sqlite3 resolver (ascending path + KB_SYNC_REPO_ROOT env) lets tests copy kb-sync-db-source.cjs to tmpdir and still find the native binding.
- [Phase 150]: [Phase 150-04]: validate-kb.cjs spawn gated on hasSourceDb (not all --full-rebuild paths) — Phase 149's index-only path doesn't produce new content, keeping the spawn out avoids changing its test harness.
- [Phase 150]: [Phase 150-04]: regenerateHeaderFile runs on EVERY --full-rebuild (not just --source db). _header.md drift was the Phase 149 gap — any _index.json rewrite must atomically rewrite the header. Phase 149 Test 1 log-line regex updated single-line.
- [Phase 150]: [Phase 150-04]: Oracle §D4 Nivel 2 executed as parity-by-construction — CatBot's list_cat_paws and kb-sync.cjs --source db read the same cat_paws table (count 9 on both sides). Observational parity (CatBot counts .md files) requires list_kb_resources tool, deferred to Fase 4 PRD and documented as gap in 150-VERIFICATION.md §8 per CONTEXT §D4 explicit allowance. Non-blocking for phase close.
- [Phase 151]: Migration log kept outside .docflow-kb/ (in phase dir) — validate-kb.cjs walks all .md including dotfiles, so any log inside would break KB-14
- [Phase 151-01]: tag-taxonomy.json extended first (Task 1) as prerequisite — validator rejects unknown tags, so rules referencing R03..R25 needed taxonomy support before writing
- [Phase 151-01]: holded-mcp-api.md kept as single architecture atom (not split by endpoint) per Apéndice D §D2 long-file pattern — the whole file is ~120KB of reference with strong internal cohesion
- [Phase 151-01]: mejoras-sistema-modelos.md NOT migrated (legacy v25.1 post-mortem) — gets LEGACY stub pointing to Phase 155 move to .docflow-legacy/
- [Phase 151-01]: Redirect stubs PREPEND (do not replace) original content — Phase 155 owns physical deletion. Meanwhile originals keep full content below stub for reference
- [Phase 151-01]: Cross-linking from protocols/catflow-inbound-review.md to rules/R*.md uses relative paths (../rules/R10-preserve-fields.md) — keeps the KB portable between repos
- [Phase 151-02]: JSON __redirect pattern: top-level key + __redirect_destinations array injected before existing keys — preserves runtime behavior for PromptAssembler while signaling move to KB
- [Phase 151-02]: catpower collapsed into single concept atom (5KB source, interleaved ontology+howto); catboard + settings → single guide atom each (no ontology-of-self, only pointers)
- [Phase 151-02]: user-guide + model-onboarding migrated verbatim (body preserved byte-for-byte + frontmatter injected) — prevents translation drift and keeps Phase 155 deletion lossless
- [Phase 151-02]: Cross-plan redirect citations are strings not filesystem links — Plan 02 Task 3 stubs cite Plan 01 outputs (rules/R*.md, domain/concepts/canvas-node.md) enabling Wave 1 parallel execution; Plan 151-04 audit verifies resolution
- [Phase 151]: [Phase 151-03]: TS file catbot-pipeline-prompts.ts NOT modified — Phase 152 owns loadPrompt() refactor. KB copies are parallel reads until then; source_of_truth frontmatter points back to TS export for traceability
- [Phase 151]: [Phase 151-03]: Architect prompt uses 4-backtick markdown fence because body contains embedded triple-backtick code blocks (iterator pattern + JSON schema). 3-backtick would close prematurely. Other 4 prompts use standard 3-backtick
- [Phase 151]: [Phase 151-03]: Verbatim-extraction verified BYTE-IDENTICAL for all 5 prompts via Node fs.readFileSync comparison after write (script included in migration-log-plan-03.md). Escaped backticks unescaped; {{RULES_INDEX}} preserved byte-identical in architect + canvas-qa
- [Phase 151]: [Phase 151-03]: Skill protocol frontmatter version 2.0.0 preserves semver continuity with source (Version 2.0 — Marzo 2026); H1 + version line dropped to frontmatter; DESCRIPCION + 14 PARTES preserved byte-identical
- [Phase 151-04]: CatBot oracle executed by orchestrator via POST /api/catbot/chat (not manual UI) — user authorized; verbatim response + tool-call trace captured as evidence
- [Phase 151-04]: Mid-phase Rule-3 blocker fix commit (1765654) for ESLint errors in kb-sync-db-source.test.ts + unused vars in knowledge-sync.ts — Docker rebuild unblocked before oracle
- [Phase 151-04]: __redirect key injection (Plan 151-02) breaks query_knowledge Zod schema (concepts[18..20] become object). Tracked for Phase 152 — consumer must replace query_knowledge OR extend its Zod to allow top-level __redirect* keys
- [Phase 151-04]: _header.md patched manually with Phase-151 subdir counts over extending regenerateHeaderFile() CLI — scope-guarded to avoid regressing Phase 149/150 tests on header.counts shape
- [Phase 152]: [Phase 152-01]: ConceptItemSchema union (string | {term,definition} | {__redirect}) + KnowledgeEntrySchema.passthrough() — root cause fix for query_knowledge Zod break was pre-existing catboard.json[18..20] {term,definition} objects, not __redirect keys (which Zod v3 default strip silently)
- [Phase 152]: [Phase 152-01]: kb-index-cache.ts as shared read-path module (getKbIndex/resolveKbEntry/searchKb/getKbEntry/parseKbFile) with 60s TTL — byTableId resolver built from resource frontmatter because _index.json.entries[] does NOT expose source_of_truth (CONFLICT #1)
- [Phase 152]: [Phase 152-01]: KB-17 enshrines 5 canonical list_* tools (list_cat_paws, list_catbrains, list_skills, list_email_templates, canvas_list). list_connectors marked deferred — tool does not exist in catbot-tools.ts, only list_email_connectors (L310)
- [Phase 152]: [Phase 152-01]: stringifyConceptItem/renderConceptItem adapters added to catbot-tools.ts + catbot-prompt-assembler.ts (Rule-3 blocking fix) so existing consumers of the union-typed concepts/howto/dont arrays don't break the Next.js build
- [Phase 152]: [Phase 152-02]: mapConceptItem in-file rename (not parallel helper) — Phase 152 KB-18 formats are canonical (**term**: def, migrado → path; usa get_kb_entry); no reason to retain Plan 01 transitional forms
- [Phase 152]: [Phase 152-02]: Redirect hint emission inline in query_knowledge case (not inside formatKnowledgeResult) — keeps formatter pure; __redirect is a top-level KB concern outside formatter contract
- [Phase 152]: [Phase 152-02]: Warning 4 null/array guard applied at TWO sites — mapConceptItem (object-branch guard) AND redirect detection block (entry guard). Both tested via query_knowledge({}) aggregate + unknown-area no-throw tests
- [Phase 152]: [Phase 152-03]: buildKbHeader() normalizes leading H1 to H2 so section-delimiter scanners (recipe-cap extractor, etc.) survive — real _header.md starts with '# KB Header' but prompt is structured as H2 blocks
- [Phase 152]: [Phase 152-03]: Reasoning protocol references search_kb before query_knowledge (new canonical) while preserving legacy 'consulta query_knowledge' substring for KPROTO-05 byte-wise assertion
- [Phase 152]: [Phase 152-03]: kb_entry field always present on 5 canonical list_* tool results (not opt-in) — consistent discoverable shape, O(1) Map lookup amortized over byTableId cache
- [Phase 152]: [Phase 152-04]: delete_catflow removed from catflow.json.tools[] (not from howto) — tripwire parser scans only catbot-tools.ts regex and cannot see SUDO_TOOLS[] in catbot-sudo-tools.ts. Cleanest fix preserves howto documentation while satisfying tripwire
- [Phase 152]: [Phase 152-04]: Volume mount read-only (./.docflow-kb:/docflow-kb:ro) + KB_ROOT=/docflow-kb env — Phase 152 is consume-side only; writes owed to Phase 153. Same env var used by both kb-index-cache and catbot-prompt-assembler
- [Phase 152]: [Phase 152-04]: Docker image rebuild required (not just recreate) — Plan 04 Task 2 specified only mount config but running image predated Plans 01-03. Caught by oracle Prompt 1 showing stale Zod error. Standard build+up-d sequence fixed
- [Phase 152]: [Phase 152-04]: Oracle evidence accepts kb_entry:null on live catpaws — data drift (Operador Holded added post-Phase-150) owed to Phase 153 hooks. Positive-path proof from Plan 03 integration tests. Phase 151 gap 4abe76e9-... resolved end-to-end
- [Phase 153-01]: markStale writes to .docflow-kb/_sync_failures.md (NOT _audit_stale.md which is regenerated by kb-sync.cjs --audit-stale and would silently wipe hook entries)
- [Phase 153-01]: kb-audit.ts as dedicated module (not extending knowledge-sync.ts) — Phase 155 cleanup will consume it independently and separation keeps never-throws contract visible
- [Phase 153-01]: Lazy frontmatter header includes change_log entry (minItems: 1 required by schema) — plan's proposed header missed this field; caught during Task 3 implementation and added as auto-fix
- [Phase 153]: Plan 153-02: hookCtx(author, {reason?}) helper bridges process.env.KB_ROOT into SyncContext — knowledge-sync.ts does not read env but kb-index-cache + kb-audit do; hookCtx keeps Phase 149 service contract frozen while letting tests + future env-based deployments see a consistent KB root end-to-end
- [Phase 153]: Plan 153-02: update_cat_paw intentionally NOT hooked (L2340 is a fetch pass-through to PATCH /api/cat-paws/[id]); route handler in Plan 03 owns the hook. 3-line comment added at case top; T7 negative test verifies syncResource is never invoked from the tool case
- [Phase 153]: Plan 153-02: hookSlug inlined in catbot-tools.ts (knowledge-sync.slugify is not exported). 6 LOC mirror; alternatives (export from service, or compute path via findExistingFileByIdShort) rejected as coupling-worsening
- [Phase 153]: Plan 153-02: _index.json entry id format is 'entity-<id8>' (not '<id8>-slug') — from knowledge-sync.ts:920. Discovered during GREEN run; T1 corrected without changing service code. RESEARCH drift documented in SUMMARY.
- [Phase Phase 153]: Plan 153-03: hookCtx + hookSlug promoted from Plan 02 inline to shared kb-hook-helpers.ts module (10 route consumers made inlining untenable); byte-identical to Plan 02 versions so markStale paths stay consistent across tool + route call sites
- [Phase Phase 153]: Plan 153-03: connectors hooks pass RAW post-SELECT row to syncResource (not maskSensitiveConfig result); FIELDS_FROM_DB.connector excludes 'config' entirely so no double-filter. Masking stays in HTTP response layer.
- [Phase Phase 153]: Plan 153-03: catbrains DELETE hook placed AFTER db.prepare('DELETE FROM catbrains').run(id), BEFORE logger.warn/info — on failure, markStale writes to _sync_failures.md; existing errors[]/warnings[] array is NOT mutated (response shape {success, warnings?} preserves Qdrant/fs-only semantics)
- [Phase Phase 153]: Plan 153-03: email-templates DELETE pre-SELECT extended from 'SELECT id' to 'SELECT id, name' so markStale path uses the real slug on failure; response shape {deleted: true} preserved
- [Phase 153]: Plan 153-04: Oracle chain via 3-prompt CatBot chain proved 21-site hook surface (6 tool + 15 route) fires end-to-end; Tester CatPaw lifecycle (create→update→delete) produced expected KB frontmatter transitions including version bumps (1.0.0→1.0.1→2.0.0), change_log growth, and soft-delete with status:deprecated
- [Phase 153]: Plan 153-04: fixed kb-index-cache buildSourceOfTruthCache field-name mismatch (source_of_truth[].db vs .table) — this was the exact root cause of Phase 152's documented 'kb_entry: null on live catpaws' deferred gap; now list_cat_paws returns populated kb_entry post-create
- [Phase 153]: Plan 153-04: docker-compose .docflow-kb mount changed from :ro (Phase 152 consume-only) to rw; host dir chown 1001:gid required for container nextjs user to write; documented in _manual.md Requisitos de deploy
- [Phase 153]: Plan 153-04: T11 same-table Promise.all of 2 create_catbrain added to kb-hooks-tools.test.ts — stricter _index.json atomic read-merge-write invariant vs Plan 02 T10 mixed entities; _sync_failures.md absent after oracle (ideal — no production-path hook failures)
- [Phase 154-01]: KbIndex type extension in kb-index-cache.ts itself (not kb-types.ts) — single source of truth for the KB contract, Phase 152 owns the file, safer than cast-at-call-site
- [Phase 154-01]: Array.from() over spread [...new Set/map.entries()] in kb-filters.ts + kb-timeline.ts — app/tsconfig.json has no explicit target so Next 14 TS check fails downlevel iteration (Rule-3 blocker, fixed inline, 22 tests still green)
- [Phase 154-01]: aggregateChangesByDay types match real runtime shape {id,updated} — NOT {version,date,author,reason} suggested by older prompts (RESEARCH Conflict 2 resolved at type + test level)
- [Phase 154-01]: collectDistinct* helpers derive options dynamically from entries[] — absorbs Phase 151 type-enum drift (RESEARCH Conflict 3: 9 runtime types, not 10)
- [Phase 154-02]: Native <select>+<table> over shadcn Radix Select+Table — sidesteps Pitfall 5 (Radix empty-value edge case) and keeps 0 new deps for 128 rows; KnowledgeFilters uses e.target.value || undefined to map clean to KbFilterState
- [Phase 154-02]: Server component + direct getKbIndex/getKbEntry import (NOT client+fetch round-trip) — D2 lock; zero /api/knowledge list round-trip, TTL cache stays warm; client components (Table/Filters/Timeline/Detail) receive plain JSON via props and own useState interactivity locally
- [Phase 154-02]: Manual breadcrumb in /knowledge/[id]/page.tsx (Dashboard > Knowledge > <title>) — bypasses auto-Breadcrumb which would render raw kebab-case slug (Pitfall 6); title resolution handles string, {es,en} object, fallback to id
- [Phase 154]: Phase 154-03 Playwright POM disambiguates selects via option[value=X] filter — label-text selectors fail strict mode because wrapping label concatenates Tipo+options overlapping with Subtipo
- [Phase 154]: Phase 154-03 locale cookie planted per-spec (beforeEach + API Cookie header) — middleware /welcome redirect fix scoped to Phase 154 specs; global-setup.ts fix deferred to test-infra phase
- [Phase 154]: Phase 154-03 oracle auto-approved checkpoint:human-verify — Docker build (service name 'docflow' not 'app'), 11/11 Playwright, 6/6 HTTP codes, CatBot list_cat_paws → kb_entry:null drift documented as pre-existing
- [Phase 155]: Plan 155-01: SCOPE_ANNOTATIONS hard-coded in canvas-rules.ts (not read from atom frontmatter) — only 5 rules carry scope tags; hard-coding byte-matches canonical canvas-rules-index.md without introducing a new frontmatter field
- [Phase 155]: Plan 155-01: Inline YAML-subset parser in canvas-rules.ts instead of importing parseKbFile from kb-index-cache.ts — canvas-rules needs only summary/title/id from frontmatter; keeps service self-contained for Plan 02 deletion safety and avoids js-yaml coupling
- [Phase 155]: Plan 155-01: extractLongBody collapses whitespace to single spaces — preserves legacy single-line long-form semantics from canvas-nodes-catalog.md; the R10 FOUND-03 content anchor 'MISMO array JSON' survives collapse
- [Phase 155]: Plan 155-01: getKbRoot() tries 3 fallback paths (../docflow-kb → ./docflow-kb → /docflow-kb) with KB_ROOT env top priority; first path whose rules/ subdir exists wins, so dev (cwd=app/), vitest, repo-root scripts, and Docker deploys all resolve transparently
- [Phase 155]: Plan 155-01: SE/DA atom bodies expanded with Por-qué + Cómo-aplicar + Relacionado sections (not verbatim one-liners) — matches R01-R25 shape from Phase 151 and gives CatBot richer retrieval content
- [Phase 155]: Plan 155-02: search-docs route kept (covers PROJECT/STATE/ROADMAP/Index) — only .planning/knowledge/ subpath removed from DOC_PATHS + LOCAL_DOC_PATHS; legacy catalog gone but fallback surface preserved
- [Phase 155]: Plan 155-02: catbot-user-profile.ts explain_feature heuristic replaced with searchKbCount>=3 (not dropped) — keeps LEARN-04 'learning' style signal alive while migrating to KB tool surface
- [Phase 155]: Plan 155-02: CLAUDE.md §Protocolo de Testing kept byte-identical (lines 3-27); §Documentación + §Restricciones collapsed to 22-line .docflow-kb/_manual.md pointer + search_kb({tags:['critical']}) hint for R26-R29 (forward-ref to Plan 03). 80→46 lines
- [Phase 155]: Plan 155-02: Dockerfile COPY of /app/data/knowledge → /app/data-seed/knowledge deleted entirely + docker-entrypoint.sh reduced from 12→2 lines (shebang + exec) — source dir gone after Task 1 so guarded COPY would still fail
- [Phase 155]: Plan 155-03: Extended cross_cutting with 'build' + 'docker' in addition to 'critical' — Rule-3 auto-fix for R28/R29 tag spec (validator rejects unknown tags)
- [Phase 155]: Plan 155-03: DATABASE_PATH=/home/deskmath/docflow-data/docflow.db required for kb-sync live-DB backfill — default app/data/docflow.db is stale 9-row fixture, not the Docker-mounted production DB with 38 catpaws
- [Phase 155]: Plan 155-03: Container restart post-backfill required to invalidate kb-index-cache 60s TTL; acceptable because .docflow-kb is volume-mounted rw, not compiled into image
- [Phase 155]: Plan 155-03: isNoopUpdate cosmetic idempotence regression (second pass re-bumps 56 version/timestamp fields on unchanged DB) deferred — pre-existing Phase 150/153 issue, non-blocking for Phase 155 cleanup criteria
- [Phase 155]: Plan 155-04: SHA placeholders in _manual.md rollback recipes left LITERAL — standard Phase 153 pattern; operator resolves via git log post-close (resolving at plan write time would point at commits before phase-close metadata commit)
- [Phase 155]: Plan 155-04: Plan Task 3 spec (flip 12 rows Pending→Complete) downscoped to 3 rows because Plans 01-03 already flipped KB-28..KB-36 via requirements mark-complete tool during their state-update steps — real scope 3 rows, final state matches spec exactly
- [Phase 155]: Plan 155-04: Oracle Prompt 1 confirmed Phase 152 kb_entry:null drift resolved END-TO-END (CatBot returns resources/catpaws/53f19c51-operador-holded.md non-null for Operador Holded); Prompt 2 confirmed CLAUDE.md pointer search_kb({tags:['critical']}) resolves via get_kb_entry({id:'rule-r26-canvas-executor-immutable'}); Prompt 3 confirmed Plan 01 SE/DA atoms are live (enumerated verbatim)

### Blockers/Concerns
- CatPaw "Consultor CRM" existente tiene system_prompt rigido (espera tipo_operacion="consulta_crm"). Necesita CatPaw nuevo "Operador Holded" generalista.

## Session Continuity

Last session: 2026-04-20T18:00:21.409Z
Stopped at: Completed 155-04-PLAN.md body (3 tasks + SUMMARY); awaiting Task 4 human-verify checkpoint before /gsd:complete-phase 155
Resume file: None
