---
gsd_state_version: 1.0
milestone: v29.0
milestone_name: checklist
current_plan: 4
status: executing
stopped_at: Phase 152 context gathered
last_updated: "2026-04-20T09:28:24.433Z"
last_activity: 2026-04-20
progress:
  total_phases: 11
  completed_phases: 3
  total_plans: 14
  completed_plans: 13
  percent: 75
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17)

**Core value:** CatFlow Inbound+CRM completo (email -> clasificacion -> CRM Holded -> respuesta con template) como piloto manual, luego CatBot lo construye autonomamente.
**Current focus:** Phase 145 - CatPaw Operador Holded

## Current Position

Phase: 151 of 155 (KB Migrate Static Knowledge — PRD Fase 3)
Current Plan: 4
Total Plans in Phase: 4
Status: In progress — Plan 151-01 complete (static .md migration: 40 atoms + 6 redirects + tag-taxonomy extended to 32 rule codes). Plans 151-02..04 pending.
Last activity: 2026-04-20

Progress: [████████░░] 75%

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

### Blockers/Concerns
- CatPaw "Consultor CRM" existente tiene system_prompt rigido (espera tipo_operacion="consulta_crm"). Necesita CatPaw nuevo "Operador Holded" generalista.

## Session Continuity

Last session: 2026-04-20T09:28:24.431Z
Stopped at: Phase 152 context gathered
Resume file: .planning/phases/152-kb-catbot-consume/152-CONTEXT.md
