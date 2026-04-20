# Phase 155: KB Cleanup Final — Research

**Researched:** 2026-04-20
**Domain:** Deletion of two legacy knowledge layers + runtime consumer migration + docs simplification (Fase 7 PRD KB)
**Confidence:** HIGH (grounded in direct filesystem inspection, live vitest runs, git log, and cross-phase docs)

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Deletion strategy**
- **Full delete** de los ~22 archivos legacy. `git rm` — repo queda limpio. Git history preserva breadcrumb; los stubs de Phase 151 ya cumplieron su propósito.
- No quedan tombstones ni redirect stubs en el working tree después de Phase 155.
- El `_index.json` y `_template.json` de `app/data/knowledge/` también caen.

**`query_knowledge` tool disposition**
- **Remove tool completely**: borrar del dispatcher `catbot-tools.ts` (case + TOOLS[] entry), Zod schemas (`KnowledgeEntrySchema`, `ConceptItemSchema`, etc.), y cualquier referencia en `knowledge-tree.ts`.
- Canónicos: `search_kb` y `get_kb_entry` (Phase 152). CatBot ya los usa en los 4 oracles de Phase 152.
- Tool description no se "deprecates" — simplemente desaparece. Sin migración blanda.

**Code sweep scope (full)**
- Borrar archivo `app/src/lib/knowledge-tree.ts` entero.
- Borrar helpers `stringifyConceptItem` y `mapConceptItem` en `app/src/lib/services/catbot-tools.ts` (Phase 152-01) y su gemelo en `app/src/lib/services/catbot-prompt-assembler.ts`.
- Borrar `__redirect` detection logic en `query_knowledge` case (ya no existe el case).
- Barrer imports de `loadKnowledgeArea`, `getAllKnowledgeAreas`, `getKnowledgeAreaById` en cualquier archivo que los consuma. Sustituir por `search_kb`/`get_kb_entry` si el caller genuino lo necesita.
- Eliminar `delete_catflow` residual si sigue referenciado en howto — Phase 152-04 lo sacó de `tools[]` pero quedó en `howto`.
- Método: grep-driven. `grep -rn 'app/data/knowledge\|knowledge-tree\|query_knowledge\|loadKnowledgeArea\|getAllKnowledgeAreas\|stringifyConceptItem\|mapConceptItem\|ConceptItemSchema\|KnowledgeEntrySchema' app/` antes y después — expected 0 hits salvo en commits/planning docs.

**Test cleanup**
- **Delete entire files**: `git rm app/src/lib/__tests__/knowledge-tree.test.ts` + `app/src/lib/__tests__/knowledge-tools-sync.test.ts`. No hay assertions portables — los subjects desaparecen.
- 8 tests rojos heredados cierran al borrar archivos. Tests KB (108 pre-Phase-154 + 11 Playwright) siguen verdes.
- No tocamos `task-scheduler.test.ts`, `alias-routing.test.ts`, `catbot-holded-tools.test.ts` — hotfix aparte.

**Live-DB KB backfill**
- **Dentro de Phase 155, commit separado**.
- Plan N: deletion + code sweep + tests delete + CLAUDE.md simplificación — un bloque.
- Plan N+1: `cd /home/deskmath/docflow && node scripts/kb-sync.cjs --full-rebuild --source db` — captura el estado actual del live DB en `.docflow-kb/resources/*.md`. Commit con mensaje `chore(kb): backfill resources from live DB post-155`.
- Tras backfill: re-run CatBot oracle "lista los CatPaws" → todos deben tener `kb_entry` resuelto (no más `null` en Operador Holded id `53f19c51`).

**CLAUDE.md simplification**
- **§"Protocolo de Documentación: Knowledge Tree + CatBot"** → reemplazar por puntero corto: "Toda documentación vive en `.docflow-kb/`. Ver `.docflow-kb/_manual.md` para nomenclatura + flujos. CatBot ya consume el header automáticamente."
- **§"Documentación de referencia"** → repuntar: rutas `.planning/knowledge/proceso-catflow-revision-inbound.md` → `.docflow-kb/protocols/catflow-inbound-review.md`, etc.
- **§"Restricciones absolutas"** → migrar a `.docflow-kb/rules/R*.md` (nuevos atoms con tags `[safety, critical]`):
  - "canvas-executor.ts NUNCA modificar" → `.docflow-kb/rules/R26-canvas-executor-immutable.md`
  - "agentId NUNCA inventar slugs; solo UUIDs" → `.docflow-kb/rules/R27-agent-id-uuid-only.md`
  - "process.env.X NUNCA; usar process['env']['X']" → `.docflow-kb/rules/R28-env-bracket-notation.md`
  - "Docker rebuild necesario tras cambios en execute-catpaw.ts" → `.docflow-kb/rules/R29-docker-rebuild-execute-catpaw.md`
- CLAUDE.md §Restricciones queda con puntero: "Ver `.docflow-kb/rules/` con tag `critical` para las 4 restricciones inmutables."
- §"Protocolo de Testing: CatBot como Oráculo" — mantener. No se toca.

**Rollback plan doc**
- Sección nueva en `.docflow-kb/_manual.md`: "Rollback de la migración v29.1" con 3 recipes (git revert por commit, backfill re-run).

**Audit v29.1 side-fixes included**
- Patch `.planning/REQUIREMENTS.md` §Traceability: añadir filas `| KB-01 | Phase 149 | Complete |` .. `| KB-05 | Phase 149 | Complete |` (actualmente ausentes).
- `_header.md` regeneration ya es dinámica (integration checker lo confirmó). No se toca.

**Commit strategy**
- Phase 155 landas en **≥3 commits atomizables**:
  1. Deletion + code sweep + tests delete + CLAUDE.md simplificación + rules migrados + REQUIREMENTS patch (grande pero atómico).
  2. KB backfill desde live DB (independiente; revertible sin rollback del delete).
  3. `.docflow-kb/_manual.md` update con sección rollback + Phase 155 section.
- Planner puede dividir 1 en sub-commits si identifica fronteras limpias.

### Claude's Discretion
- Granularidad exacta de commits dentro del bloque 1.
- Si algún consumer legacy tira de `loadKnowledgeArea` en runtime activo (no solo tests) — planner investiga y decide si lo migra a `get_kb_entry` o si puede eliminarse completamente.
- Wording exacto de las reglas R26-R29 en `.docflow-kb/rules/` (preservar la sustancia, frontmatter estándar con `tags:[safety,critical]`).
- Orden de ejecución: wave 1 (deletion + code + tests, paralelizable) → wave 2 (rules migrados + CLAUDE.md + REQUIREMENTS) → wave 3 (Docker rebuild + backfill) → wave 4 (_manual.md + oracle + VERIFICATION).
- Si el sweep descubre otros consumers inesperados (ej. un health check, un admin panel) — planner los incluye en scope.

### Deferred Ideas (OUT OF SCOPE)
- **Hotfix 10 tests orthogonal**: `task-scheduler.test.ts` (5 failures), `alias-routing.test.ts` (3), `catbot-holded-tools.test.ts` (2). Hotfix aparte en v29.2.
- **Catbrains migration column drift**: build logs ~50 warnings `23 cols but 18 values`. Hotfix aparte.
- **`_header.md` regenerate drift**: resolved — integration checker confirmó que knowledge-sync.ts + kb-sync.cjs ya lo computan dinámicamente.
- **Multi-worker cache invalidation** (`kb-index-cache.ts` 60s TTL process-local): latente en deploys multi-worker. Single-worker Docker actual es safe.
- **i18n strings** que mencionen "knowledge tree" o "two layers": si aparecen, pertenecen a refactor de copy aparte.
- **Nyquist compliance** para 149-154 (4 PARTIAL + 2 MISSING VALIDATION.md): discovery only del audit v29.1. No bloquea 155.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TBD | Requirements se registran durante `/gsd:plan-phase 155`. Context gathered pre-planning. | See "Standard Stack" + "Architecture Patterns" + "Don't Hand-Roll" below |

*(Planner MUST register KB-28..KB-3x requirement IDs in REQUIREMENTS.md when breaking into plans, per ROADMAP line 251.)*

## Summary

Phase 155 es una fase de limpieza pura: hay que **borrar físicamente** los dos silos de conocimiento legacy (`app/data/knowledge/*` y `.planning/knowledge/*`), el archivo `skill_orquestador_catbot_enriched.md` de la raíz, el módulo TS `app/src/lib/knowledge-tree.ts`, todos sus consumers (dispatcher `query_knowledge` case, helpers `mapConceptItem`/`renderConceptItem`, 2 routes API, 1 tab UI y 6 tests mockeados), simplificar la sección §"Protocolo de Documentación" y §"Documentación de referencia" de `CLAUDE.md`, migrar las 4 restricciones absolutas a `.docflow-kb/rules/R26..R29`, re-puntar `docker-entrypoint.sh` + `app/Dockerfile`, y hacer un backfill del KB contra la DB live para cerrar el drift `kb_entry:null` de CatPaws creados post-Phase-150.

**Hallazgo crítico:** contra lo que dice CONTEXT §domain, en `app/data/knowledge/` hay **11 archivos (no 9)** — los 2 extra son `canvas-nodes-catalog.md` y `canvas-rules-index.md` que consume `app/src/lib/services/canvas-rules.ts` en runtime (IntentJobExecutor architect+QA loop). Esto requiere **migrar canvas-rules.ts a leer `.docflow-kb/rules/R*.md`** (25 rules ya migradas en Phase 151) antes de borrar los catalogs MD. La alternativa (mantener los 2 MDs y borrar solo los JSONs) rompe el criterio mental del CONTEXT de "repo limpio".

**Hallazgo crítico 2:** los 8 tests "rojos" de `knowledge-tree.test.ts` + `knowledge-tools-sync.test.ts` listados en `deferred-items.md` de Phase 150 **están verdes hoy** (32/32 en vitest run ejecutado durante esta research). Motivo: Phase 152-01 extendió el Zod schema (union `string | {term,definition} | {__redirect}`) + Phase 151 añadió sources válidas + regeneró `_index.json.areas[].updated_at`. La acción planeada (borrar archivos enteros) sigue siendo correcta — el subject muere — pero el discurso "los 8 rojos pasan a verdes" debe actualizarse a "los 8 rojos ya estaban verdes; los borramos porque el subject desaparece".

**Primary recommendation:** Plan 155 en 4 waves disjoint: (1) migrar `canvas-rules.ts` a KB (nuevo código + tests nuevos + borrar tests de scope), (2) borrar archivos + sweep code consumers + tests legacy + CLAUDE.md + Dockerfile/entrypoint + REQUIREMENTS patch — commit grande atómico, (3) crear R26-R29 en `.docflow-kb/rules/`, Docker rebuild, backfill live-DB, (4) `_manual.md` rollback + oracle CatBot + VERIFICATION.md.

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `git rm` | any | Physical file deletion with history | Preserves breadcrumb; working tree clean |
| `scripts/kb-sync.cjs --full-rebuild --source db` | current | Regenerar `.docflow-kb/resources/*` desde DB live | Idempotente (Phase 150), seguro re-run |
| `scripts/validate-kb.cjs` | current | Gate post-commit schema/taxonomy | Exit 0 obligatorio tras todas las ops |
| `vitest run` (app/) | 4.1.0 | Run tests tras cada change | Existing test infra, no nuevas deps |
| `docker compose build docflow && up -d` | current | Rebuild sin host node_modules | MEMORY.md confirma flow canónico |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `grep -rn` | Sweep de referencias legacy | Antes + después de cada delete, garantiza 0 hits |
| `curl -H "Cookie: docatflow_locale=es" http://localhost:3500/api/catbot/chat` | Oracle CatBot | Evidencia Nyquist de Phase 155 |
| `js-yaml` (ya instalado) | Parse frontmatter de rules KB en canvas-rules.ts migration | Phase 152 ya lo usa en `kb-index-cache.ts` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Full delete (git rm) | Keep redirect stubs forever | Stubs ensucian working tree; tests `EXPECTED_FILES` assertion falla igual. Full delete es más limpio. |
| Rewrite canvas-rules.ts to read KB | Keep canvas-nodes-catalog.md + canvas-rules-index.md en app/data/knowledge/ | Rompe criterio "repo limpio"; además catalog MD ya tiene redirect stub, solo se lee por compat. Mejor migrar. |
| Delete knowledge-tree.ts but keep query_knowledge legacy hollow | Implement query_knowledge as passthrough to search_kb | Tool description + schema quedan huérfanos; sin señal de por qué existe. Remove es más limpio. |
| `fs.unlink` + manual index rebuild | `git rm` + natural removal | `git rm` mantiene historia; un revert restaura todo. Single-step semantics. |

**Installation:** No hay nuevas deps. Todo el stack ya existe en el repo.

## Architecture Patterns

### Recommended Wave Structure

```
Wave 1 (sequential — prerequisite for Wave 2):
  └─ Plan 155-01 (canvas-rules migration): rewrite canvas-rules.ts to read .docflow-kb/rules/R*.md
     - Add js-yaml frontmatter parser (or reuse kb-index-cache helpers)
     - Parse 25 R files + SE01-03 + DA01-04 from KB
     - Keep external signature (loadRulesIndex, getCanvasRule) byte-identical for intent-job-executor
     - Update canvas-rules.test.ts to point at KB paths
     - Delete canvas-rules-scope.test.ts (subject file disappears in Wave 2)

Wave 2 (big atomic — disjoint files, parallelizable within):
  ├─ Plan 155-02-deletion:
  │   - git rm app/data/knowledge/ (11 files: 7 JSON + _index + _template + 2 MD)
  │   - git rm .planning/knowledge/ (12 files)
  │   - git rm skill_orquestador_catbot_enriched.md
  │   - git rm app/src/lib/knowledge-tree.ts
  │   - git rm app/src/lib/__tests__/knowledge-tree.test.ts
  │   - git rm app/src/lib/__tests__/knowledge-tools-sync.test.ts
  │   - git rm app/src/lib/__tests__/catbot-tools-query-knowledge.test.ts
  │   - git rm app/src/app/api/catbot/knowledge/tree/route.ts
  │   - git rm app/src/components/settings/catbot-knowledge/tab-knowledge-tree.tsx
  │
  ├─ Plan 155-02-code-sweep:
  │   - Edit catbot-tools.ts: remove import (L9), TOOLS[] entry (L223-236), always-allowed list (L1492), mapConceptItem (L1371-1387), scoreKnowledgeMatch, formatKnowledgeResult, formatKnowledgeAsText, explain_feature case (L1842-1867), query_knowledge case (L1869-1960). Keep explain_feature's tool DEFINITION if no other behavior exists — investigate.
  │   - Edit catbot-prompt-assembler.ts: remove import (L11), PAGE_TO_AREA map (L69-80), renderConceptItem (L175-187), formatKnowledgeForPrompt (L189-208), getPageKnowledge (L210-233). Rewrite buildKnowledgeProtocol (L668-695) to drop query_knowledge + search_documentation legacy bullets — leave only search_kb + get_kb_entry + log_knowledge_gap.
  │   - Edit catbot-knowledge-shell.tsx: remove TabKnowledgeTree import + entry in TABS array (L14) + rendering case (L70).
  │   - Edit search-docs/route.ts (L29, L42): remove `.planning/knowledge` from DOC_PATHS + LOCAL_DOC_PATHS. search-docs tool ya mencionado como "legacy fallback" puede quedar si apunta a PROJECT/STATE/ROADMAP.
  │   - Edit catpaw-gmail-executor.ts (L37) + catpaw-drive-executor.ts (L37): update comment reference from `.planning/knowledge/connector-logs-redaction-policy.md` to `.docflow-kb/protocols/connector-logs-redaction.md`.
  │   - Edit catbot-tools-retry-job.test.ts + catbot-learned.test.ts + canvas-tools-fixes.test.ts + catbot-intents.test.ts + intent-jobs.test.ts + catbot-knowledge-gap.test.ts + catbot-tools-user-patterns.test.ts: remove `vi.mock('@/lib/knowledge-tree', ...)` blocks (module no longer exists, no-op mock is error).
  │   - Edit catbot-prompt-assembler.test.ts: remove KPROTO-01/KPROTO-05 assertions that reference `query_knowledge` string (3 tests fail otherwise).
  │   - Edit intent-job-executor.test.ts + intent-job-executor-proposal.test.ts: keep canvas-rules mock; remove `data/knowledge/catboard.json` literal (L263 in proposal test) if present.
  │   - Edit catpaw-gmail-executor.test.ts (L212-229): remove fixture reads of `app/data/knowledge/canvas.json` / `catflow.json` + `connector-logs-redaction-policy.md`.
  │
  ├─ Plan 155-02-docker:
  │   - Edit app/docker-entrypoint.sh: remove lines 4-9 (cp -u /app/data-seed/knowledge/*.json/md). Entry reduces to `exec node server.js`.
  │   - Edit app/Dockerfile: remove line 55-56 (COPY knowledge seed). The data-seed/knowledge/ dir stops being needed.
  │
  ├─ Plan 155-02-docs:
  │   - Edit CLAUDE.md (80 lines): replace §"Protocolo de Documentación: Knowledge Tree + CatBot" (L29-63) with 3-line pointer. Replace §"Documentación de referencia" (L64-76) with KB paths. Replace §"Restricciones absolutas" (L77-81) with 1-line pointer to `.docflow-kb/rules/` con tag `critical`. Mantener §"Protocolo de Testing".
  │   - Edit .planning/Index.md: delete §"Catalogos de Conocimiento (knowledge/)" (L42-59 aprox). Simplify §"Knowledge Base" to remove "(en construcción)" and "Estado: Bootstrap completado…".
  │   - Edit .planning/REQUIREMENTS.md Traceability table (L113-155): insert 5 rows KB-01..KB-05 pointing to Phase 149.

Wave 3 (sequential after Wave 2 merge):
  ├─ Plan 155-03-rules: create 4 new atoms
  │   - .docflow-kb/rules/R26-canvas-executor-immutable.md (tags: [safety, critical])
  │   - .docflow-kb/rules/R27-agent-id-uuid-only.md
  │   - .docflow-kb/rules/R28-env-bracket-notation.md
  │   - .docflow-kb/rules/R29-docker-rebuild-execute-catpaw.md
  │   - Extend tag-taxonomy.json `cross_cutting` with "critical" (only if not present)
  │   - Extend tag-taxonomy.json `rules` with R26..R29
  │   - Run validate-kb.cjs exit 0
  │
  ├─ Plan 155-03-backfill:
  │   - docker compose build docflow && up -d (Wave 2 changes applied)
  │   - cd /home/deskmath/docflow && node scripts/kb-sync.cjs --full-rebuild --source db
  │   - git add .docflow-kb/ + commit chore(kb): backfill resources from live DB post-155
  │   - Re-run validate-kb.cjs exit 0
  │   - Oracle: curl POST /api/catbot/chat "lista los CatPaws activos y dime el kb_entry del primero" → expected kb_entry path, not null

Wave 4 (final close):
  └─ Plan 155-04:
     - Edit .docflow-kb/_manual.md: add "## Rollback de la migración v29.1" section + "## Phase 155 Cleanup" section
     - 155-VERIFICATION.md: grep invariants (0 hits), test suite exit 0, docker build exit 0, oracle evidence verbatim
     - Phase close (/gsd:complete-phase 155)
```

### Pattern 1: Grep-Driven Sweep (Before + After)

**What:** Every deletion wave MUST start with a `grep -rn` baseline and end with `grep -rn` verification (0 hits).
**When to use:** Any time a symbol/path is being removed from the codebase.

**Baseline command (before Wave 2):**
```bash
grep -rn \
  'app/data/knowledge\|\.planning/knowledge\|knowledge-tree\|query_knowledge\|loadKnowledgeArea\|getAllKnowledgeAreas\|getKnowledgeAreaById\|stringifyConceptItem\|mapConceptItem\|renderConceptItem\|ConceptItemSchema\|KnowledgeEntrySchema\|skill_orquestador_catbot_enriched\|TabKnowledgeTree\|data-seed/knowledge' \
  app/ scripts/ CLAUDE.md docker-compose.yml 2>/dev/null
```

**Expected after Wave 2 merge:**
- 0 hits in `app/src/` (except potentially history comments in CLAUDE.md pointing to git log).
- Hits ONLY in `.planning/**` (historical context — expected and desirable).

**Source:** Phase 151 migration-log.md §"NON-modified files" + Phase 153 plan-02 sweep methodology.

### Pattern 2: Oracle-as-Evidence (CatBot)

**What:** Run a CatBot prompt as the final verification — its response is the evidence of end-to-end correctness.
**When to use:** Wave 3 post-backfill + Wave 4 close.

**Example (from Phase 154-03):**
```bash
curl -X POST http://localhost:3500/api/catbot/chat \
  -H "Cookie: docatflow_locale=es" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Lista los CatPaws activos y dime el kb_entry del primero. ¿Qué devuelve?"}],"channel":"web"}'
```

**Expected signals:**
- Tool call trace contains `list_cat_paws` (NOT `query_knowledge` — that tool no longer exists).
- Response surfaces `kb_entry: "resources/catpaws/..md"` (path, not null) for at least Operador Holded (53f19c51).
- CatBot describes the KB without mentioning "knowledge tree" (outdated terminology).

**Source:** Phase 152-VERIFICATION.md §KB-15 oracle pattern + Phase 154-VERIFICATION.md §KB-26.

### Pattern 3: Atomic Commit with Backfill Split

**What:** Big atomic commit for the deletion+sweep (everything depends on everything else), separate commit for backfill (independently revertible).
**When to use:** Wave 2 vs Wave 3 boundary.

**Rationale:** If Wave 2 has a bug (e.g., canvas-rules fallback broke intent-job-executor architect loop), revert of Wave 3 alone does nothing useful; revert of Wave 2 is the real rollback. Separating backfill lets a user roll KB content back to pre-backfill snapshot without undoing deletion.

**Source:** CONTEXT §"Commit strategy" + Phase 153 plan-04 pattern.

### Anti-Patterns to Avoid

- **Keep redirect stubs "just in case":** The tests (`EXPECTED_FILES`) will fail anyway. Full delete is cleaner than partial.
- **Delete `knowledge-tree.ts` but leave `query_knowledge` case:** Tool case loses its backing module → TypeScript build error → Docker rebuild fail. Must be atomic.
- **Run backfill BEFORE Docker rebuild:** Backfill writes `.docflow-kb/` on host; container reads via volume mount. If running container still has old code path, oracle reads stale state. ALWAYS docker rebuild first.
- **Skip Docker volume mode check:** Phase 153-04 changed `:ro` → `rw`; `docker-compose.yml` L22 today has `./.docflow-kb:/docflow-kb` (no `:ro` suffix — rw is default). Don't let a careless edit revert to `:ro` or backfill silently no-ops.
- **Invent new tags without extending tag-taxonomy.json:** `.docflow-kb/_schema/tag-taxonomy.json.cross_cutting` ya contains `safety` but NOT `critical`. Adding `[safety, critical]` without extending taxonomy fails `validate-kb.cjs` exit 1.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parse frontmatter from `.docflow-kb/rules/R*.md` | Custom regex parser | `js-yaml` (4.1.1 already installed) via `kb-index-cache.ts` helpers | Phase 152 already did this; `parseKbFile` exists and handles edge cases (YAML anchors, multiline) |
| Rebuild `_index.json` after backfill | Manual JSON edit | `scripts/kb-sync.cjs --full-rebuild --source db` | Idempotent (Phase 150), atomic rewrite, regenerates `_header.md` + spawns validator |
| Validate KB post-commit | Custom check | `scripts/validate-kb.cjs` exit 0 gate | Frontmatter schema + tag taxonomy already enforced |
| Chown `.docflow-kb/` on host | Manual `sudo chown` | Document in `_manual.md` rollback recipe + rely on `docflow-init` container | Phase 153-04 already solved this (init container chowns before main) |
| Remove test mock entries one-by-one | Manually tracking each `vi.mock('@/lib/knowledge-tree', ...)` | `grep -l` + sed or Edit batch | Mock statement is exactly 5 lines; predictable pattern |
| Migrate CLAUDE.md §Restricciones | Port-by-port re-invention | Copy verbatim from CLAUDE.md lines 77-81, wrap in frontmatter template from R25-mandatory-idempotence.md | Proven frontmatter shape, matches 25 existing rules |

**Key insight:** Phase 155 reuses the ENTIRE Phase 149-154 toolchain. There is NO new infrastructure to build — just deletion + path updates + a few new rule atoms. The only net-new code is the canvas-rules.ts rewrite to consume KB instead of MD catalog.

## Common Pitfalls

### Pitfall 1: canvas-rules.ts runtime breakage
**What goes wrong:** Deleting `app/data/knowledge/canvas-nodes-catalog.md` + `canvas-rules-index.md` without migrating `canvas-rules.ts` breaks IntentJobExecutor (architect+QA loop at L478-480).
**Why it happens:** CONTEXT §domain lists "9 archivos: 7 áreas + `_index.json` + `_template.json`" but the reality is 11 files. The 2 MDs are consumed in production runtime via ARCHITECT_PROMPT's `{{RULES_INDEX}}` template placeholder.
**How to avoid:**
- Wave 1 (pre-Wave-2) rewrite `canvas-rules.ts` to read `.docflow-kb/rules/R*.md` (25 rules there today).
- Keep `loadRulesIndex()` + `getCanvasRule(id)` signatures byte-identical (public contract).
- SE01-SE03 + DA01-DA04 need investigation: are they in the KB? If yes, read from rules/. If no, decide: migrate to KB (additional atoms) OR inline as a tiny constant in canvas-rules.ts.
**Warning signs:** intent-job-executor.test.ts and canvas-rules.test.ts fail on the first vitest run post-deletion; IntentJobExecutor architect iteration returns `{{RULES_INDEX}}` literal un-substituted.

### Pitfall 2: Stale tab in Settings UI (silent breakage)
**What goes wrong:** `app/src/components/settings/catbot-knowledge/catbot-knowledge-shell.tsx` imports `TabKnowledgeTree` — if its component file is deleted without removing import, Next.js build fails.
**Why it happens:** CONTEXT omits the Settings UI consumer.
**How to avoid:** Delete BOTH `tab-knowledge-tree.tsx` AND the import + TABS entry + render case in `catbot-knowledge-shell.tsx`. Also clean `app/messages/{es,en}.json` keys `settings.knowledge.tabs.tree` + `settings.knowledge.tree.*` (or leave — dead keys are harmless but i18n lints may warn).
**Warning signs:** `npm run build` exit 1 with "Cannot find module './tab-knowledge-tree'".

### Pitfall 3: `data-seed/knowledge` ghost in Docker image
**What goes wrong:** `app/Dockerfile` L55-56 copies `app/data/knowledge/` to `/app/data-seed/knowledge/`. If the source disappears at host but Dockerfile still references it, `docker build` fails with "COPY failed: no source files".
**Why it happens:** Multi-stage build pulls from `/app` inside `builder` stage, which contains the source.
**How to avoid:** Remove Dockerfile L55-56 in SAME commit as the file deletions. `docker-entrypoint.sh` L4-9 also references `/app/data-seed/knowledge/` — remove together.
**Warning signs:** `docker compose build docflow` exits 1 at builder stage.

### Pitfall 4: `tag-taxonomy.json` doesn't include `critical`
**What goes wrong:** New rules R26-R29 declare `tags: [safety, critical]` but `cross_cutting` list in `_schema/tag-taxonomy.json` is `[safety, performance, learning, ux, ops, testing]` — no `critical`. `validate-kb.cjs` exit 1.
**Why it happens:** CONTEXT says "añadir tag `critical`" implicitly; planner must extend the taxonomy first.
**How to avoid:** In Plan 155-03-rules: extend `_schema/tag-taxonomy.json.cross_cutting` to include `critical` AS A PREREQUISITE TASK (Task 1) before creating the 4 rule atoms (Task 2-5). Also add `R26, R27, R28, R29` to taxonomy.rules array.
**Warning signs:** validate-kb.cjs reports "tag 'critical' not in any taxonomy list for R26-canvas-executor-immutable.md".

### Pitfall 5: Dev-only cwd fallbacks in canvas-rules.ts
**What goes wrong:** Current `canvas-rules.ts` has 5 fallback paths (Docker `/app/data/knowledge/`, local dev `data/knowledge/`, etc.). Migration must cover `/docflow-kb/` Docker volume + `.docflow-kb/` host + test fixtures.
**Why it happens:** Tests run from `app/` cwd; Docker runs from `/app` with `KB_ROOT=/docflow-kb` env; local `npm run build` runs from `app/`.
**How to avoid:** Use `process.env.KB_ROOT ?? path.resolve(process.cwd(), '..', '.docflow-kb')` pattern (already standard in `kb-index-cache.ts`). Extract via `getKbRoot()` helper if not already exported.
**Warning signs:** canvas-rules.test.ts green locally, intent-job-executor fails in Docker with "rules catalog not found" architect iter 0.

### Pitfall 6: catbot-prompt-assembler legacy phrases in tests
**What goes wrong:** `catbot-prompt-assembler.test.ts` L344-362, L828-842 assert exact strings `'query_knowledge'`, `'consulta query_knowledge'`. After code sweep, strings disappear → 3+ tests fail.
**Why it happens:** Tests were written for Phase 152 coexistence (search_kb + query_knowledge legacy). Phase 155 drops coexistence.
**How to avoid:** Delete or rewrite the affected test blocks (KPROTO-01, KPROTO-05, "mentions search_kb before query_knowledge", "labels query_knowledge as Legacy in the protocol"). Add new assertions: "knowledge_protocol mentions search_kb + get_kb_entry + log_knowledge_gap only".
**Warning signs:** vitest reports 4-6 failures in `catbot-prompt-assembler.test.ts` post-sweep.

### Pitfall 7: The 8 "failing" tests are already green
**What goes wrong:** CONTEXT cites 8 red tests from `deferred-items.md` as evidence this phase "fixes tests". Re-running vitest shows 32/32 green today (verified during research 2026-04-20). The narrative of "cierran rojos al borrar" should be "subject desaparece; test muere con él, verde o no".
**Why it happens:** Phases 151-152 fixed the root causes (schema drift, missing sources, `__redirect` passthrough) silently. `deferred-items.md` never got updated.
**How to avoid:** Plan 155 VERIFICATION.md must state: "tests already green pre-155; deleted as byproduct of subject removal (app/data/knowledge/ gone)". Don't claim the tests were "broken"; they were "irrelevant".
**Warning signs:** Reviewer asks "but CONTEXT said 8 red tests — are they green? why?"; planner must explain the drift.

### Pitfall 8: explain_feature case (not just query_knowledge)
**What goes wrong:** `catbot-tools.ts` L1842-1867 case `explain_feature` also calls `getAllKnowledgeAreas` and `formatKnowledgeAsText`. Its TOOLS[] entry at L210-222 stays, but the case body has no knowledge source.
**Why it happens:** CONTEXT only explicitly names `query_knowledge`; `explain_feature` is a sibling consumer.
**How to avoid:** Decide explicitly: (a) remove entire `explain_feature` tool (TOOLS[] + case + always-allowed list L1492) — CatBot doesn't need it since `search_kb` covers the same use case; OR (b) rewrite case to call `searchKb({search: args.feature, limit: 1}) → getKbEntry(result.id)` and format body → text. Option (a) preferred per CONTEXT philosophy "sin migración blanda".
**Warning signs:** `explain_feature` case tries to call deleted `getAllKnowledgeAreas` → TS build error.

### Pitfall 9: tsx compilation vs runtime discrepancy after canvas-rules.ts migration
**What goes wrong:** If canvas-rules.ts loads rules eagerly at module-init with `fs.readFileSync` on `.docflow-kb/rules/R*.md`, tests that construct `process.cwd()` fixtures fail (KB not at cwd during vitest).
**Why it happens:** Current canvas-rules.ts uses lazy caches (`cachedIndex`, `cachedRules`); migration must preserve lazy init.
**How to avoid:** Mirror the lazy pattern: `function loadRulesIndex() { if (cachedIndex) return cachedIndex; … }`. Tests inject fixture via `_resetCache() + process.env.KB_ROOT` override.
**Warning signs:** First vitest run hangs on "readdirSync ENOENT: no such directory '/home/runner/.docflow-kb/rules'".

## Code Examples

Verified patterns from the existing codebase:

### Lazy cache module pattern (canvas-rules.ts migration target)
```typescript
// Target: app/src/lib/services/canvas-rules.ts (rewrite)
// Source: Mirror of kb-index-cache.ts:12-40 (Phase 152)

import fs from 'fs';
import path from 'path';
import { getKbIndex, getKbEntry } from './kb-index-cache';

let cachedIndex: string | null = null;
let cachedRules: Map<string, RuleDetail> | null = null;

function getKbRoot(): string {
  return process.env['KB_ROOT'] ?? path.resolve(process.cwd(), '..', '.docflow-kb');
}

export function loadRulesIndex(): string {
  if (cachedIndex !== null) return cachedIndex;
  // Synthesize the "index" from rules/ files: one line per rule
  const rulesDir = path.join(getKbRoot(), 'rules');
  const files = fs.readdirSync(rulesDir).filter(f => f.match(/^(R\d{2}|SE\d{2}|DA\d{2})-.+\.md$/)).sort();
  const lines: string[] = ['# Canvas Design Rules Index', ''];
  for (const file of files) {
    const body = fs.readFileSync(path.join(rulesDir, file), 'utf-8');
    const titleMatch = body.match(/^title:\s*"?(R\d{2}|SE\d{2}|DA\d{2}) — (.+?)"?$/m);
    const short = titleMatch ? titleMatch[2] : file.replace('.md', '');
    const id = file.match(/^([A-Z]+\d{2})/)?.[1] ?? '';
    if (id) lines.push(`- ${id}: ${short}`);
  }
  cachedIndex = lines.join('\n');
  return cachedIndex;
}

export function getCanvasRule(ruleId: string): RuleDetail | null {
  if (!cachedRules) cachedRules = parseRules();
  return cachedRules.get(ruleId.toUpperCase()) ?? null;
}

function parseRules(): Map<string, RuleDetail> {
  const out = new Map<string, RuleDetail>();
  const rulesDir = path.join(getKbRoot(), 'rules');
  const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const idMatch = file.match(/^(R\d{2}|SE\d{2}|DA\d{2})/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const body = fs.readFileSync(path.join(rulesDir, file), 'utf-8');
    // Strip frontmatter
    const fmMatch = body.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    const bodyOnly = fmMatch ? fmMatch[2].trim() : body;
    const long = bodyOnly.replace(/^#.*$/m, '').trim().replace(/\s+/g, ' ');
    const short = long.length <= 100 ? long : long.slice(0, 97) + '...';
    out.set(id, { id, short, long, category: categorize(id) });
  }
  return out;
}

export function _resetCache(): void {
  cachedIndex = null;
  cachedRules = null;
}
```

### Rule atom template (R26-R29 creation)
```markdown
<!-- Target: .docflow-kb/rules/R26-canvas-executor-immutable.md -->
<!-- Source: .docflow-kb/rules/R25-mandatory-idempotence.md frontmatter shape -->

---
id: rule-r26-canvas-executor-immutable
type: rule
subtype: safety
lang: es
title: "R26 — canvas-executor.ts NUNCA se modifica"
summary: "El runtime canvas-executor.ts está congelado; toda nueva lógica va en nodos o servicios adyacentes"
tags: [canvas, R26, safety, critical]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-155
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-155
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-155, change: "Migrated from CLAUDE.md §Restricciones absolutas (phase 155 cleanup)" }
ttl: never
---

# R26 — canvas-executor.ts NUNCA se modifica

**Regla absoluta:** `app/src/lib/services/canvas-executor.ts` está congelado. No se permiten edits directos.

## Por qué

El executor mantiene invariantes críticos para el funcionamiento de todos los canvas activos en producción. Cualquier cambio en el dispatcher core afecta todos los pipelines simultáneamente. Bugs introducidos aquí son difíciles de revertir una vez que flows reales los han consumido.

## Cómo aplicar

- Nueva lógica de ejecución vive en servicios adyacentes (p.ej. `canvas-auto-repair.ts`, `canvas-connector-contracts.ts`).
- Nuevos tipos de nodo se registran via el dispatcher, sin tocar el executor principal.
- Si creés absolutamente imprescindible editar canvas-executor.ts, abrí una RFC previa en `.planning/reference/` justificando el cambio.

## Relacionado

- `R27-agent-id-uuid-only.md` — contratos de datos que el executor espera
- `guides/how-to-use-canvases.md` — patrones de extensión sin tocar executor
```

### Oracle prompt structure (Wave 4 VERIFICATION evidence)
```bash
# Source: Phase 154-VERIFICATION.md KB-26 pattern

# Prompt 1: "Does CatBot still work without knowledge-tree?"
curl -sX POST http://localhost:3500/api/catbot/chat \
  -H "Cookie: docatflow_locale=es" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"¿Cuántos CatPaws activos hay y cuál es el kb_entry del primero?"}],"channel":"web"}' \
  | jq '{reply, tool_calls: .tool_calls|length, first_tool: .tool_calls[0].function.name}'

# Expected:
# - reply: mentions count + a path like "resources/catpaws/53f19c51-operador-holded.md"
# - tool_calls >= 1, includes "list_cat_paws" (NOT "query_knowledge")
# - no occurrences of "knowledge tree" in reply

# Prompt 2: "Does CatBot know about the deleted restrictions (now R26-R29)?"
curl -sX POST http://localhost:3500/api/catbot/chat \
  ... \
  -d '{"messages":[{"role":"user","content":"¿Puedo editar canvas-executor.ts? ¿Por qué?"}],...}' \
  | jq '{reply, tool_calls: [.tool_calls[].function.name]}'

# Expected:
# - reply: "No" + cites R26 + rationale
# - tool_calls includes "search_kb" or "get_kb_entry"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 3 knowledge silos (`.planning/knowledge/`, `app/data/knowledge/`, root skill file) | Single `.docflow-kb/` tree | Phase 151 (2026-04-20) — migration done, originals still present | Phase 155 physically removes the originals |
| `query_knowledge` tool as primary CatBot knowledge gate | `search_kb` + `get_kb_entry` as primary, query_knowledge as legacy fallback | Phase 152 (2026-04-20) | Phase 155 removes query_knowledge entirely |
| PromptAssembler loads knowledge area JSON via `loadKnowledgeArea(PAGE_TO_AREA[page])` | `_header.md` injected as P1 section; page-specific knowledge deprecated | Phase 152 (2026-04-20) | Phase 155 removes PAGE_TO_AREA + formatKnowledgeForPrompt entirely |
| `app/data/knowledge/*.json` auto-synced to Docker volume via entrypoint | No runtime JSON sync needed | Phase 155 (this phase) | Removes Dockerfile COPY + entrypoint cp block |
| canvas-rules.ts reads markdown catalog from `app/data/knowledge/` | canvas-rules.ts reads atomic rules from `.docflow-kb/rules/` | Phase 155 (this phase) | Same public API, different backing store |
| CLAUDE.md §"Protocolo de Documentación: Knowledge Tree + CatBot" | CLAUDE.md pointer → `.docflow-kb/_manual.md` | Phase 155 (this phase) | CLAUDE.md drops ~30 lines |
| CLAUDE.md §"Restricciones absolutas" | `.docflow-kb/rules/R26-R29` with tags `[safety, critical]` | Phase 155 (this phase) | Searchable via `search_kb({tags:["critical"]})` — discoverable by CatBot |

**Deprecated/outdated:**
- The phrase "two knowledge layers" / "dos knowledge layers" in docs — replace with "Knowledge Base (`.docflow-kb/`)".
- `app/data/knowledge/_template.json` `_instructions` array — template is obsolete, KB has its own `_schema/frontmatter.schema.json`.
- `.planning/knowledge/mejoras-sistema-modelos.md` — NOT migrated (Phase 151 decision); moves to `.docflow-legacy/milestone-retrospectives/` per CONTEXT.
- `catboard.json.sources[]` field — listed `.planning/*.md` paths that are fine but the whole file dies.

## Open Questions

1. **Does `explain_feature` tool stay or go?**
   - What we know: CONTEXT only names `query_knowledge` for removal; but `explain_feature` case (L1842-1867 in catbot-tools.ts) also consumes `getAllKnowledgeAreas`/`formatKnowledgeAsText`.
   - What's unclear: Is `explain_feature` still exposed to CatBot? Looking at L1492 always-allowed list, it IS. No CONTEXT guidance.
   - Recommendation: **Remove entirely** (TOOLS[] + case + always-allowed list) — matches CONTEXT philosophy "sin migración blanda". search_kb covers the same use case ("dime qué es un CatPaw") better because it returns structured KB entries.

2. **Where do SE01-SE03 and DA01-DA04 live post-migration?**
   - What we know: `.docflow-kb/rules/` has 25 R*.md files (R01-R25). No SE* or DA* atoms. `tag-taxonomy.json.rules` lists SE01-SE03 + DA01-DA04 as valid tags.
   - What's unclear: Are SE/DA rules still needed by canvas-rules.ts? `canvas-rules-index.md` (which disappears) is the only source.
   - Recommendation: Planner should READ `app/data/knowledge/canvas-rules-index.md` content for SE01-SE03 + DA01-DA04 definitions BEFORE deletion, and either (a) create 7 new atoms in `.docflow-kb/rules/` or (b) inline them as a constant in the new canvas-rules.ts. Option (a) is canon-aligned and enables CatBot discoverability.

3. **Does the dashboard `/knowledge` need any changes?**
   - What we know: Phase 154 dashboard reads `kb-index-cache.getKbIndex()` — no reference to knowledge-tree.ts.
   - What's unclear: After backfill, do counts change meaningfully? (e.g., if new CatPaws exist on live DB beyond the 10 committed in Phase 150.)
   - Recommendation: No changes needed; backfill will naturally regenerate `_index.json.header.counts` and the dashboard reads fresh. Verification step: after Wave 3 backfill, `curl http://localhost:3500/knowledge` HTTP 200 + counts card shows the new totals.

4. **`delete_catflow` residual in `catflow.json.howto`:**
   - What we know: CONTEXT §"Code sweep scope" mentions "Eliminar `delete_catflow` residual si sigue referenciado en howto — Phase 152-04 lo sacó de `tools[]` pero quedó en `howto`."
   - What's unclear: With full delete of `catflow.json`, the residual goes away naturally. Is there any OTHER location that references `delete_catflow` and needs cleanup?
   - Recommendation: grep `'delete_catflow'` across the whole app/. If hits only in `app/data/knowledge/catflow.json` (dying) and maybe in catbot-sudo-tools.ts (legitimate tool), no extra action. If in `.docflow-kb/` guides/concepts — update those atoms in Wave 2.

5. **Does Wave 4 oracle need Docker rebuild separately or is Wave 3's enough?**
   - What we know: Wave 3 already does `docker compose build docflow && up -d` before backfill.
   - What's unclear: If Wave 2 is merged but Wave 3 not yet run, is the running container broken? (Wave 2 code sweep removes `query_knowledge` from the TS source; if the container is still running old image, it has old code — mismatch.)
   - Recommendation: Wave 3 MUST include Docker rebuild as its FIRST step (before backfill). Document in Plan 155-03 explicitly. Wave 4 oracle runs against the post-rebuild container — no extra rebuild.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 (existing) |
| Config file | `app/vitest.config.ts` (existing, no changes) |
| Quick run command | `cd app && npx vitest run <pattern>` |
| Full suite command | `cd app && npx vitest run` |
| E2E Playwright | `cd app && npx playwright test` (optional — Phase 154 specs still green) |

### Phase Requirements → Test Map

*(Phase 155 requirements TBD — planner registers KB-28..KB-3x in REQUIREMENTS.md during `/gsd:plan-phase 155`. Mapping below uses provisional IDs aligned with CONTEXT deliverables.)*

| Req ID (provisional) | Behavior | Test Type | Automated Command | File Exists? |
|---------------------|----------|-----------|-------------------|--------------|
| KB-28 | canvas-rules.ts reads from `.docflow-kb/rules/R*.md` and preserves `loadRulesIndex()`/`getCanvasRule(id)` contract | unit | `cd app && npx vitest run src/lib/__tests__/canvas-rules.test.ts` | ✅ (needs rewrite) |
| KB-29 | All 25 R rules resolvable via getCanvasRule; R10 returns scope-aware detail | unit | `cd app && npx vitest run src/lib/__tests__/canvas-rules.test.ts -t "R10"` | ✅ |
| KB-30 | app/data/knowledge/ does not exist on filesystem | smoke | `test ! -d app/data/knowledge && echo OK` | ✅ shell-level |
| KB-31 | .planning/knowledge/ does not exist on filesystem | smoke | `test ! -d .planning/knowledge && echo OK` | ✅ shell-level |
| KB-32 | skill_orquestador_catbot_enriched.md does not exist at repo root | smoke | `test ! -f skill_orquestador_catbot_enriched.md && echo OK` | ✅ shell-level |
| KB-33 | app/src/lib/knowledge-tree.ts does not exist | smoke | `test ! -f app/src/lib/knowledge-tree.ts && echo OK` | ✅ shell-level |
| KB-34 | grep for 'loadKnowledgeArea\|query_knowledge\|knowledge-tree' in app/src returns 0 matches | smoke | `! grep -rn 'loadKnowledgeArea\|query_knowledge\|knowledge-tree\|getAllKnowledgeAreas\|ConceptItemSchema\|KnowledgeEntrySchema' app/src` | ✅ shell-level |
| KB-35 | CatBot responds factually about KB via search_kb+get_kb_entry without invoking query_knowledge | integration (oracle) | `POST /api/catbot/chat` → inspect tool_calls | ❌ Wave 4 |
| KB-36 | CatBot cites R26 (canvas-executor immutable) when asked about editing the file | integration (oracle) | `POST /api/catbot/chat` → inspect reply | ❌ Wave 4 |
| KB-37 | `validate-kb.cjs` exit 0 on full KB post-rule-addition (R26-R29 + backfill) | unit | `node scripts/validate-kb.cjs` | ✅ existing |
| KB-38 | `scripts/kb-sync.cjs --full-rebuild --source db` runs idempotent on second call (0 writes) | smoke | `diff <(node scripts/kb-sync.cjs --full-rebuild --source db --dry-run)  <(echo 'already-idempotent')` | ✅ existing (Phase 150) |
| KB-39 | `npm run build` (Next.js) exits 0 inside container after deletion + code sweep | smoke | `docker compose build docflow` | ✅ shell-level |
| KB-40 | `list_cat_paws` tool returns `kb_entry` non-null for Operador Holded (53f19c51) | integration (oracle) | `POST /api/catbot/chat` "lista cat_paws" → inspect result | ❌ Wave 3-4 |
| KB-41 | CLAUDE.md contains pointer to `.docflow-kb/_manual.md` and NO mention of "Knowledge Tree" (legacy term) | smoke | `! grep -i "knowledge tree" CLAUDE.md` | ✅ shell-level |
| KB-42 | REQUIREMENTS.md Traceability includes KB-01..KB-05 rows pointing to Phase 149 | smoke | `grep -c "| KB-0[12345] | Phase 149 | Complete |" .planning/REQUIREMENTS.md` == 5 | ✅ shell-level |

### Sampling Rate
- **Per task commit:** `cd app && npx vitest run src/lib/__tests__/canvas-rules.test.ts` (Wave 1) + grep sweeps (Wave 2) + `validate-kb.cjs` (Wave 3).
- **Per wave merge:** `cd app && npx vitest run` (full suite) + `docker compose build docflow` (Wave 2, 3).
- **Phase gate:** Full vitest + Docker build exit 0 + oracle evidence pegada a `155-VERIFICATION.md` before `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `app/src/lib/__tests__/canvas-rules.test.ts` — needs **rewrite** to point at `.docflow-kb/rules/` paths (current asserts `data/knowledge/canvas-rules-index.md` content structure). Existing test still covers R01, R10, R25 lookup semantics; update paths + regenerate fixtures.
- [ ] `app/src/lib/__tests__/canvas-rules-scope.test.ts` — **delete** (subject `canvas-rules-index.md` disappears; scope annotations `[scope: transformer,synthesizer]` on R10 must be migrated to `.docflow-kb/rules/R10-preserve-fields.md` frontmatter `search_hints` or body text before test deletion).
- [ ] `app/src/lib/__tests__/catbot-tools-query-knowledge.test.ts` — **delete** (subject `query_knowledge` case disappears).
- [ ] `app/src/lib/__tests__/knowledge-tree.test.ts` — **delete** (subject module disappears).
- [ ] `app/src/lib/__tests__/knowledge-tools-sync.test.ts` — **delete** (subject JSON files disappear).
- [ ] Grep-sweep smoke script — new helper `scripts/verify-155-sweep.sh` OR inline in VERIFICATION.md. Runs the 9 smoke checks KB-30..KB-34, KB-41 in under 5 seconds.

*(Framework install: N/A — vitest 4.1.0 already installed, no new deps.)*

## Code Consumer Inventory (high-fidelity)

Table of EVERY code consumer of the legacy layer with file:line location, action required, and the downstream canonical replacement.

| File | Lines | Current Usage | Phase 155 Action | Replacement |
|------|-------|---------------|------------------|-------------|
| `app/src/lib/knowledge-tree.ts` | entire | Module definition (Zod schemas + loader) | DELETE file | — |
| `app/src/lib/services/catbot-tools.ts` | L9 | `import { loadKnowledgeArea, getAllKnowledgeAreas, type KnowledgeEntry }` | REMOVE import | — |
| `app/src/lib/services/catbot-tools.ts` | L223-236 | TOOLS[] entry for `query_knowledge` | REMOVE entry | — |
| `app/src/lib/services/catbot-tools.ts` | L210-222 | TOOLS[] entry for `explain_feature` | REMOVE entry (open question 1) | — or rewrite to search_kb |
| `app/src/lib/services/catbot-tools.ts` | L1020 | `log_knowledge_gap` description mentions `query_knowledge` | EDIT string — remove mention | — |
| `app/src/lib/services/catbot-tools.ts` | L1355-1387 | `mapConceptItem` helper | REMOVE function | — |
| `app/src/lib/services/catbot-tools.ts` | L1389-1403 | `scoreKnowledgeMatch` helper | REMOVE function | — |
| `app/src/lib/services/catbot-tools.ts` | L1405-1429 | `formatKnowledgeResult` helper | REMOVE function | — |
| `app/src/lib/services/catbot-tools.ts` | L1431-1461 | `formatKnowledgeAsText` helper | REMOVE function | — |
| `app/src/lib/services/catbot-tools.ts` | L1492 | always-allowed list includes `query_knowledge`, `explain_feature` | EDIT — drop both names | — |
| `app/src/lib/services/catbot-tools.ts` | L1842-1867 | case `explain_feature` | REMOVE case | — or rewrite |
| `app/src/lib/services/catbot-tools.ts` | L1869-1962 | case `query_knowledge` | REMOVE case | — |
| `app/src/lib/services/catbot-prompt-assembler.ts` | L11 | `import { loadKnowledgeIndex, loadKnowledgeArea, type KnowledgeEntry }` | REMOVE import | — |
| `app/src/lib/services/catbot-prompt-assembler.ts` | L69-80 | `PAGE_TO_AREA` map | REMOVE const | — |
| `app/src/lib/services/catbot-prompt-assembler.ts` | L166-208 | `renderConceptItem`, `formatKnowledgeForPrompt` | REMOVE functions | — |
| `app/src/lib/services/catbot-prompt-assembler.ts` | L210-233 | `getPageKnowledge(page)` | REMOVE function | — |
| `app/src/lib/services/catbot-prompt-assembler.ts` | L648 | reasoning protocol text mentions `query_knowledge` | EDIT string | — |
| `app/src/lib/services/catbot-prompt-assembler.ts` | L684-691 | `buildKnowledgeProtocol` mentions query_knowledge + search_documentation | REWRITE to drop legacy bullets | — |
| `app/src/lib/services/catbot-prompt-assembler.ts` | (callers of getPageKnowledge) | Section `page_knowledge` build | REMOVE section | — (kb_header P1 replaces it) |
| `app/src/lib/services/canvas-rules.ts` | L47-74 | resolveIndexPath/resolveCatalogPath point at app/data/knowledge + .planning/knowledge | REWRITE to read `.docflow-kb/rules/R*.md` via js-yaml + kb-index-cache | See Code Example §1 |
| `app/src/lib/services/catpaw-gmail-executor.ts` | L37 | Comment references `.planning/knowledge/connector-logs-redaction-policy.md` | EDIT comment | `.docflow-kb/protocols/connector-logs-redaction.md` |
| `app/src/lib/services/catpaw-drive-executor.ts` | L37 | Same as above | EDIT comment | Same |
| `app/src/app/api/catbot/knowledge/tree/route.ts` | entire | GET handler using getAllKnowledgeAreas | DELETE route (+ dir `app/src/app/api/catbot/knowledge/tree/`) | — (dashboard `/knowledge` covers UI) |
| `app/src/app/api/catbot/search-docs/route.ts` | L29, L42 | DOC_PATHS includes `.planning/knowledge` | EDIT — remove that entry | — (search-docs covers PROJECT/STATE/ROADMAP only) |
| `app/src/components/settings/catbot-knowledge/catbot-knowledge-shell.tsx` | L8, L14, L70 | Imports + renders `<TabKnowledgeTree>` | REMOVE import + TABS entry + render case | — |
| `app/src/components/settings/catbot-knowledge/tab-knowledge-tree.tsx` | entire | Fetches `/api/catbot/knowledge/tree` and renders grid | DELETE file | Link to `/knowledge` dashboard if needed |
| `app/messages/es.json`, `en.json` | settings.knowledge.tabs.tree + tree.* | i18n keys for deleted tab | DELETE keys (or leave — dead) | — |
| `app/src/lib/__tests__/catbot-tools-retry-job.test.ts` | L63-65 | `vi.mock('@/lib/knowledge-tree', ...)` | REMOVE mock | — |
| `app/src/lib/__tests__/catbot-learned.test.ts` | L38-40 | Same | REMOVE mock | — |
| `app/src/lib/__tests__/canvas-tools-fixes.test.ts` | L156-158 | Same | REMOVE mock | — |
| `app/src/lib/__tests__/catbot-intents.test.ts` | L36-38 | Same | REMOVE mock | — |
| `app/src/lib/__tests__/intent-jobs.test.ts` | L51-53 | Same | REMOVE mock | — |
| `app/src/lib/__tests__/catbot-knowledge-gap.test.ts` | L53-55 | Same | REMOVE mock | — |
| `app/src/lib/__tests__/catbot-tools-user-patterns.test.ts` | L57-59 | Same | REMOVE mock | — |
| `app/src/lib/__tests__/catbot-prompt-assembler.test.ts` | L344-362, L828-842 | Assertions on `query_knowledge` string in prompt | REWRITE assertions to match new knowledge_protocol | — |
| `app/src/lib/__tests__/catpaw-gmail-executor.test.ts` | L212-229 | Reads fixtures from `app/data/knowledge/canvas.json`, `catflow.json`, `connector-logs-redaction-policy.md` | REWRITE to use `.docflow-kb/` paths OR remove if behavior doesn't need them | Check live code; likely remove |
| `app/src/lib/__tests__/intent-job-executor-proposal.test.ts` | L263 | Reads `app/data/knowledge/catboard.json` | REWRITE or remove | — |
| `app/src/lib/__tests__/canvas-rules-scope.test.ts` | L5 | RULES_PATH = `data/knowledge/canvas-rules-index.md` | DELETE test file (subject disappears) | Scope annotations moved to R10 frontmatter in Wave 3 |
| `app/src/lib/__tests__/canvas-rules.test.ts` | entire | Asserts getCanvasRule('R01'), loadRulesIndex format | REWRITE asserts + fixture paths to `.docflow-kb/rules/` | Covered by KB-28, KB-29 |
| `app/docker-entrypoint.sh` | L4-9 | `cp -u /app/data-seed/knowledge/*.json` + `*.md` | REMOVE lines (entrypoint becomes 2 lines: shebang + `exec node server.js`) | — |
| `app/Dockerfile` | L55-56 | `COPY ... /app/data/knowledge ./data-seed/knowledge` | REMOVE lines | — |
| `CLAUDE.md` | L29-63 | §"Protocolo de Documentación: Knowledge Tree + CatBot" | REPLACE with 3-line pointer | — |
| `CLAUDE.md` | L64-76 | §"Documentación de referencia" | REPUNTAR rutas a `.docflow-kb/` | — |
| `CLAUDE.md` | L77-81 | §"Restricciones absolutas" (4 reglas) | MIGRATE to R26-R29 in KB + leave 1-line pointer | `.docflow-kb/rules/R26..R29` |
| `.planning/Index.md` | L42-59 | §"Catalogos de Conocimiento (knowledge/)" | DELETE section | `.docflow-kb/_manual.md` |
| `.planning/Index.md` | L9-13 | §"Knowledge Base (en construcción)" | SIMPLIFY — drop "(en construcción)" + "Bootstrap completado…" | — |
| `.planning/REQUIREMENTS.md` | L113-155 Traceability table | Missing KB-01..KB-05 rows | INSERT 5 rows pointing to Phase 149 | — |

**Summary of code sweep:** 40+ discrete edits across 4 major files (catbot-tools.ts, catbot-prompt-assembler.ts, canvas-rules.ts, Dockerfile/entrypoint) + 9 test files + 3 docs. All disjoint and mergeable in a single commit per CONTEXT §"Commit strategy".

## Rollback Plan (to document in `_manual.md`)

**Section template to add to `.docflow-kb/_manual.md` post-Phase-155:**

```markdown
## Rollback de la migración v29.1 (Phase 155)

Si tras Phase 155 surge un problema crítico que requiere restaurar el estado pre-cleanup, los siguientes 3 git reverts son suficientes:

### Recipe 1: Restaurar archivos legacy (22 files)
`git revert <SHA-del-commit-deletion>` — restaura los 11 en `app/data/knowledge/`, los 12 en `.planning/knowledge/` y `skill_orquestador_catbot_enriched.md` en la raíz. El código consumidor (knowledge-tree.ts, query_knowledge case) NO se restaura — ver Recipe 2.

### Recipe 2: Restaurar código consumidor
`git revert <SHA-del-commit-code-sweep>` — restaura `knowledge-tree.ts`, `query_knowledge` case en `catbot-tools.ts`, `mapConceptItem`/`renderConceptItem` helpers, TabKnowledgeTree UI component, API route `/api/catbot/knowledge/tree`. Tras este revert, correr `cd app && npm install && docker compose build docflow && up -d`.

### Recipe 3: Restaurar estado KB pre-backfill
`git revert <SHA-del-commit-backfill>` — devuelve el snapshot pre-backfill del KB. Si tras restaurar prefieres regenerar desde DB live (en lugar de volver al snapshot), correr `cd /home/deskmath/docflow && node scripts/kb-sync.cjs --full-rebuild --source db`.

### Nota sobre reverts tardíos
Los 3 reverts son seguros durante ~30 días. Si se mergea a prod + pasan semanas con la DB evolucionando, el revert del backfill puede chocar con rows nuevas: en ese caso, re-correr `--full-rebuild --source db` es más seguro que el revert directo.

### Verificación post-rollback
- `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts` → 32/32 green (asumiendo Phase 152 schema extensions se preserven).
- `curl http://localhost:3500/api/catbot/chat` con prompt "knowledge tree stats" → CatBot cita los 7 áreas legacy.
- `ls app/data/knowledge/` → 11 files restaurados.
```

## Sources

### Primary (HIGH confidence)
- `.planning/phases/155-kb-cleanup-final/155-CONTEXT.md` — user decisions (locked, verbatim)
- `.planning/phases/151-kb-migrate-static-knowledge/migration-log.md` — complete 21-redirect map (authoritative)
- `.planning/phases/150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates/deferred-items.md` — the "8 failing tests" reference
- `.planning/phases/152-kb-catbot-consume/152-VERIFICATION.md` — KB-15/16/17/18 oracle evidence + Docker volume rw config
- `.planning/phases/154-kb-dashboard-knowledge/154-VERIFICATION.md` — oracle-as-evidence pattern to mirror
- Direct filesystem inspection (2026-04-20): `/home/deskmath/docflow/app/data/knowledge/` (11 files, not 9), `/home/deskmath/docflow/.planning/knowledge/` (12 files), `/home/deskmath/docflow/.docflow-kb/rules/` (25 R files), `/home/deskmath/docflow/.docflow-kb/_schema/tag-taxonomy.json`
- Live vitest run 2026-04-20 18:38 — confirms 32/32 green on knowledge-tree.test.ts + knowledge-tools-sync.test.ts (contradicts CONTEXT narrative; documented as Pitfall 7)
- `app/src/lib/knowledge-tree.ts`, `app/src/lib/services/catbot-tools.ts`, `app/src/lib/services/catbot-prompt-assembler.ts`, `app/src/lib/services/canvas-rules.ts` — grep'd for every consumer
- `app/docker-entrypoint.sh`, `app/Dockerfile`, `docker-compose.yml` — runtime integration points
- `CLAUDE.md` — exact §§ to simplify
- `.planning/ROADMAP.md` L248-257 — Phase 155 goal verbatim
- `.docflow-kb/_manual.md` — current shape to extend (Phase 153 + 154 sections already present)

### Secondary (MEDIUM confidence)
- Phase 153 oracle chain (3-prompt CatPaw lifecycle) as pattern for Wave 4 oracle design
- `.planning/ANALYSIS-knowledge-base-architecture.md` §7 — PRD Fase 7 description (matches CONTEXT)
- Phase 151-01 plan on `canvas-nodes-catalog.md` split into R01-R25 atoms — confirms 25 rules fully migrated

### Tertiary (LOW confidence)
- None relevant — all critical claims verified via direct filesystem/code reads.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools already in repo, multiple phases proven.
- Architecture (4-wave structure): HIGH — matches CONTEXT explicitly + mirrors Phase 153 execution model.
- Pitfalls: HIGH — pitfalls 1-3 verified via direct grep; pitfall 7 verified via live vitest; pitfalls 4-9 extrapolated from cross-phase patterns.
- Code consumer inventory: HIGH — every entry cites file:line verified via Grep tool.
- Oracle design: HIGH — exact pattern from Phase 152/154 verification evidence.
- Open questions: MEDIUM — 5 genuine ambiguities that planner must resolve via CONTEXT re-read or live code inspection.

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days — stable phase, code paths inspected directly; DB live state drifts but research is about deletion, not DB)
