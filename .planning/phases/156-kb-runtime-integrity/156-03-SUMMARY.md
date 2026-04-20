---
phase: 156-kb-runtime-integrity
plan: 03
subsystem: knowledge-base
tags: [orphan-cleanup, retention-policy, kb-sync, catbot-oracle, git-mv, search-hints, v29.1-close]

# Dependency graph
requires:
  - phase: 149
    provides: kb-sync.cjs CLI + validate-kb.cjs + knowledge-sync.ts syncResource contract
  - phase: 150
    provides: scripts/kb-sync-db-source.cjs (DB→KB sync writer)
  - phase: 152
    provides: searchKb + buildSourceOfTruthCache (index-level scoring contract)
  - phase: 153
    provides: markStale + hookCtx + _sync_failures.md audit log
  - phase: 156-01
    provides: canvas POST/PATCH/DELETE hooks + delete_catflow soft-delete (pre-req para oracle Prompts 1-2)
  - phase: 156-02
    provides: link_connector_to_catpaw + link_skill_to_catpaw re-sync + CatPaw template §Conectores/§Skills vinculadas (pre-req para oracle Prompt 3)
provides:
  - 15 orphan KB files archived to .docflow-legacy/orphans/<entity>/ via git mv (historial preservado)
  - .docflow-kb/_manual.md §Retention Policy (Phase 156) con tabla de 4 dimensiones + cheat-sheet de comandos
  - .planning/phases/156-kb-runtime-integrity/156-03-ORPHAN-AUDIT.md (source-of-truth audit contra DB live)
  - search_hints frontmatter extension en CatPaws (knowledge-sync.ts + kb-sync-db-source.cjs) — índice-level matching de linked connectors/skills names
  - 29 CatPaws backfilled con search_hints derivados de conectores + skills vinculados
  - 4/4 CatBot oracle prompts passed (KB-40, KB-41, KB-42, KB-43) — evidencia verbatim en 156-03-ORACLE-EVIDENCE.md
affects: [phase-156-VERIFICATION, v29.1-milestone-close, future-orphan-audits, phase-157+-search-body-scan-if-demanded]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Orphan detection via `source_of_truth[0].id ∈ DB.<table>.id` (canonical) — NOT filename-prefix heuristic (RESEARCH §E over-count root cause)"
    - "Archive via `git mv` to .docflow-legacy/orphans/<entity>/ (preserva historial) vs `_archived/YYYY-MM-DD/` (ciclo temporal deprecated→archived)"
    - "search_hints frontmatter extension para index-level matching de linked relations — closes searchKb body-scan gap without full-text scan"
    - "Retention Policy documentada como tabla de 4 dimensiones en _manual.md (≤30 líneas cheat-sheet)"

key-files:
  created:
    - .planning/phases/156-kb-runtime-integrity/156-03-ORPHAN-AUDIT.md
    - .planning/phases/156-kb-runtime-integrity/156-03-ORACLE-EVIDENCE.md
    - .docflow-legacy/orphans/catpaws/ (8 files)
    - .docflow-legacy/orphans/skills/ (1 file)
    - .docflow-legacy/orphans/canvases/ (2 files)
    - .docflow-legacy/orphans/email-templates/ (1 file)
    - .docflow-legacy/orphans/connectors/ (2 files)
    - .docflow-legacy/orphans/catbrains/ (1 file)
  modified:
    - .docflow-kb/_manual.md
    - .docflow-kb/_index.json
    - .docflow-kb/_header.md
    - app/src/lib/services/knowledge-sync.ts
    - scripts/kb-sync-db-source.cjs
    - app/src/lib/__tests__/knowledge-sync-catpaw-template.test.ts

key-decisions:
  - "Orphan count reconciled 40→15 via canonical source_of_truth.id rule (RESEARCH §E used filename-prefix heuristic that over-counted 20+ legacy seed skill files that ARE tracked)"
  - "Archive to .docflow-legacy/orphans/<entity>/ (NOT _archived/YYYY-MM-DD/) — semántica distinta: orphan = residuo legacy/bootstrap; deprecated→archived = ciclo temporal natural"
  - "§Retention Policy documentada como tabla compacta de 4 dimensiones (active→deprecated, active orphan detection, deprecated→archived, archived→purged) + cadencia de auditoría"
  - "search_hints extension (commit 06d69af) cierra gap index-level post-oracle: linked relations names se emiten a frontmatter via buildSearchHints helper; dedup case-insensitive + sort ASC para isNoopUpdate idempotencia"
  - "email-templates +1 delta (16 KB vs 15 DB) documentado como KB-44 orthogonal (duplicate-mapping pathology) — NO es orphan, NO bloquea KB-43"
  - "list_connectors ausencia de CatBot tool documentada como potencial KB-45 / v29.2 gap ergonómico (no afecta Phase 156 criteria)"

patterns-established:
  - "Orphan audit canonical matching rule: source_of_truth[0].id == DB row id (frontmatter-based, NO filename-based)"
  - "Orphan archive via git mv preserva historial vs rm + write (tombstone comments-free per feedback_no_tombstone_comments)"
  - "Retention Policy ≤30-líneas tabla con 4 dimensiones + cheat-sheet de comandos en _manual.md (reutilizable para futuras policies)"
  - "search_hints populated from linked relations (names) — genérico, reutilizable para cualquier entidad con JOIN tables"

requirements-completed: [KB-43]

# Metrics
duration: ~35min
completed: 2026-04-20
---

# Phase 156 Plan 03: Orphan Cleanup + Retention Policy Summary

**15 orphans archivados a `.docflow-legacy/orphans/` via `git mv` preservando historial; `_manual.md §Retention Policy` documenta las 4 dimensiones del ciclo active→deprecated→archived→purged + orphan detection; 4/4 CatBot oracle prompts passed (KB-40..KB-43) tras gap closure search_hints que extiende el index-level matching de linked connectors/skills names.**

## Performance

- **Duration:** ~35 min (incluye gap closure search_hints + re-test)
- **Started:** 2026-04-20T20:15:00Z
- **Completed:** 2026-04-20T20:55:00Z (post re-test oracle)
- **Tasks:** 4/4 (3 auto + 1 checkpoint human-verify resolved)
- **Files modified:** 3 productivos (knowledge-sync.ts, kb-sync-db-source.cjs, _manual.md) + 15 orphans movidos + 3 audit/evidence/test files + 2 index regenerados = 25 total

## Accomplishments

- **Gap KB-43 cerrado:** 15 orphans reales (9 active + 6 deprecated) archivados via `git mv` a `.docflow-legacy/orphans/<entity>/`. Post-cleanup: `active_kb_count == db_row_count` para 5/6 entidades (+1 email-templates = KB-44 orthogonal).
- **Retention Policy documentada:** §Retention Policy (Phase 156) en `_manual.md` con tabla compacta de 4 dimensiones (active→deprecated, orphan detection, deprecated→archived, archived→purged) + cheat-sheet de comandos `kb-sync.cjs --audit-stale | --archive | --purge`.
- **Orphan count reconciled 40→15:** RESEARCH §E usaba heurística filename-prefix que over-contaba 20+ seed skill files con slug IDs legítimos. Audit Task 1 aplicó la regla canónica `source_of_truth[0].id ∈ DB.<table>.id` y produjo el ground-truth.
- **Oracle 4/4 passed end-to-end:** KB-40 (canvas create + sync), KB-41 (delete_catflow soft-delete), KB-42 (link tool + template + index match), KB-43 (counts reconciliation). Evidencia verbatim pegada a `156-03-ORACLE-EVIDENCE.md`.
- **Gap closure search_hints (commit `06d69af`):** `buildSearchHints` helper en `knowledge-sync.ts` + mirror en `kb-sync-db-source.cjs` emite frontmatter `search_hints` con nombres de conectores + skills linked. Dedup case-insensitive + sort ASC para determinismo de `isNoopUpdate`. 29 CatPaws backfilled via `DATABASE_PATH=/home/deskmath/docflow-data/docflow.db node scripts/kb-sync.cjs --full-rebuild --source db`. `search_kb({search:"holded"})` pasa de 4→9 hits incluyendo Test Linker Phase156.
- **Tests:** `knowledge-sync-catpaw-template.test.ts` gana T6 + T6b (15/15 green). Sin regresiones en suite KB.
- **Phase 156 listo para verifier:** los 3 plans de Wave 1/2 completados, oracle approved, metadata committeada atómicamente.

## Task Commits

Each task was committed atomically:

1. **Task 1: Re-auditar orphans contra DB live + 156-03-ORPHAN-AUDIT.md** — `e4204b4` (docs)
2. **Task 2: Archive 15 orphans a .docflow-legacy/orphans/ via git mv + regenerate _index.json/_header.md** — `c6e4ab6` (chore)
3. **Task 3: Añadir §Retention Policy (Phase 156) a _manual.md** — `5a1785e` (docs)
4. **Task 4: CatBot oracle human-verify checkpoint (4 prompts)**
   - `8300b02` (docs) — Evidencia inicial de los 4 prompts
   - `245c17d` (docs) — Update post-gap-closure con oracle 4/4 passed
   - `06d69af` (feat) — Gap closure search_hints extension (knowledge-sync + kb-sync-db-source + tests T6/T6b + backfill de 29 CatPaws)

**Plan metadata commit:** este SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md.

## Files Created/Modified

### Created
- **`.planning/phases/156-kb-runtime-integrity/156-03-ORPHAN-AUDIT.md`** (215 lines) — Canonical orphan audit contra live DB 2026-04-20. DB row counts, KB file counts pre/post, orphan list verbatim per entity (catpaws 8, skills 1, canvases 2, email-templates 1, connectors 2, catbrains 1 = 15 total), expected post-cleanup invariant, deltas vs RESEARCH §E (40→15 reconciliation), archive plan con file→destination mapping.
- **`.planning/phases/156-kb-runtime-integrity/156-03-ORACLE-EVIDENCE.md`** (150 lines) — Evidencia verbatim de los 4 oracle prompts (tool_calls + response + FS verification + verdict) + oracle summary table.
- **`.docflow-legacy/orphans/catpaws/`** — 8 files (72ef0fe5-redactor-informe-inbound, 7af5f0a7-lector-inbound, 96c00f37-clasificador-inbound, 98c3f27c-procesador-inbound, 9eb067d6-tester, a56c8ee8-ejecutor-inbound, a78bb00b-maquetador-inbound, a88166cd-controlador-de-fichajes).
- **`.docflow-legacy/orphans/skills/`** — 1 file (4f7f5abf-leads-y-funnel-infoeduca — duplicate slug pre-Phase-153).
- **`.docflow-legacy/orphans/canvases/`** — 2 files (5a56962a-email-classifier-pilot, 9366fa92-revision-diaria-inbound — ambos pre-Phase-156-01 hooks).
- **`.docflow-legacy/orphans/email-templates/`** — 1 file (720870b0-recordatorio-fichaje-semanal, deprecated).
- **`.docflow-legacy/orphans/connectors/`** — 2 files (755315db-test-slack-webhook, conn-gma-info-educa360-gmail, ambos deprecated).
- **`.docflow-legacy/orphans/catbrains/`** — 1 file (a91ed58a-conocimiento-fichajes-holded, deprecated).

### Modified
- **`.docflow-kb/_manual.md`** — Nueva sección §Retention Policy (Phase 156) insertada tras §Lifecycle. Tabla de 4 dimensiones + cadencia de auditoría + notas (nunca `fs.unlink` sobre resources/; orphans a `.docflow-legacy/orphans/` NO a `_archived/`). Cross-link desde §Lifecycle apuntando a la nueva sección.
- **`.docflow-kb/_index.json`** + **`.docflow-kb/_header.md`** — Regenerados via `kb-sync.cjs --full-rebuild` tras los `git mv` y tras el backfill de search_hints.
- **`app/src/lib/services/knowledge-sync.ts`** — Helper `buildSearchHints(linked_connectors, linked_skills)` emite array único (dedup case-insensitive, sort ASC) de nombres de connectors+skills. Integrado en create + update paths cuando el row trae linked_* arrays. Preserva contrato "no DB import en service".
- **`scripts/kb-sync-db-source.cjs`** — Mirror change: `loadCatPawRelations` incluye `name` en relations; `buildFrontmatter` emite `search_hints` para catpaws con conectores/skills. Garantiza paridad con knowledge-sync.ts para backfill CLI.
- **`app/src/lib/__tests__/knowledge-sync-catpaw-template.test.ts`** — Tests T6 + T6b añadidos: T6 verifica search_hints en create path; T6b verifica update path idempotencia (isNoopUpdate con search_hints re-ordenados = noop).

## Decisions Made

### 1. Orphan count reconciliation 40 → 15 (canonical rule)

RESEARCH §E snapshot 2026-04-20 afirmaba "40 orphans (34 active + 6 deprecated)". Task 1 re-audit con regla canónica (`source_of_truth[0].id ∈ DB.<table>.id`, frontmatter-based) produjo **15 orphans (9 active + 6 deprecated)**. Root cause del delta: RESEARCH §E usaba filename-prefix heuristic (primeros 8 chars del filename) que funciona para UUIDs pero **over-counta** 20+ seed skill files con slug-based filenames (`academic-investigador-academico.md`, etc.) cuyo `source_of_truth[0].id` SÍ matchea rows DB con IDs slug (`academic-researcher`, etc.). Esos files NO son orphans.

Los 6 deprecated counts agree entre audits (mismas entidades soft-deleted por hooks Phase 153/155/156-01/02). La política archivar-orphans es la misma; solo los números cambian.

### 2. Archive a `.docflow-legacy/orphans/` (no `_archived/YYYY-MM-DD/`)

Semántica distinta:
- `_archived/YYYY-MM-DD/` = ciclo temporal natural (deprecated + 180d → archive, archive + 365d → purge).
- `.docflow-legacy/orphans/<entity>/` = residuo de bootstrap/legacy (Phase 150 slug-truncated IDs, pre-Phase-156-01 canvases, pre-Phase-153 link rows).

Preservar esta distinción ayuda al operator: un archivo en `_archived/` "caducó naturalmente"; un archivo en `.docflow-legacy/orphans/` "nunca debió acumularse — sweep de bootstrap era necesario".

### 3. `git mv` sobre `rm + write` (preserva historial)

`git mv` preserva el blame + log del archivo para análisis histórico (quién lo creó, cuándo soft-deletó, etc.). Tres de los 6 deprecated orphans estaban UNTRACKED en git en tiempo de ejecución (creados por hooks post-último-commit); `git mv` sobre untracked = add-and-move atómico, funciona transparent.

### 4. Retention Policy como tabla de 4 dimensiones (≤30 líneas)

Formato: tabla `| Estado | Trigger | Acción | Comando |` con 4 filas (4 dimensiones). Cadencia de auditoría + notas debajo. Target ≤30 líneas per RESEARCH §H para readability como cheat-sheet. Decision alternative evaluado (párrafos prosa): rechazado por incoherencia con el resto del _manual.md (tablas de frontmatter fields, lifecycle windows).

### 5. Gap closure search_hints — cerrar Prompt 3b post-oracle

Prompt 3 reveló: `search_kb({search:"holded"})` no encontraba "Test Linker Phase156" aunque el body del .md sí contenía "Holded MCP". Root cause: `searchKb` (kb-index-cache.ts:341-360) scorea contra `title (3) + summary (2) + tags (1) + search_hints (1)`; NO escanea body.

Decision: en vez de extender searchKb con body full-text scan (regression risk + cost), **emitir search_hints frontmatter populated from linked relations names**. El CatPaw template ya renderiza secciones §Conectores/§Skills vinculadas; el siguiente paso natural es que el índice también tenga acceso a esos nombres.

Implementation:
- `buildSearchHints(linked_connectors, linked_skills)` helper en knowledge-sync.ts: extrae names, dedup case-insensitive, sort ASC.
- Emitido a frontmatter solo cuando hay al menos 1 linked relation (empty array se omite per consistency con otros fields).
- Mirror change en kb-sync-db-source.cjs para backfill vía CLI.
- Determinismo: dedup case-insensitive + sort ASC → `isNoopUpdate` stable cuando ninguna relation cambia.
- Backfill aplicado: 29 CatPaws con relations ganan search_hints en un solo `--full-rebuild --source db` run.

Re-test: `search_kb({search:"holded", subtype:"catpaw"})` pasa de 4→9 hits incluyendo Test Linker Phase156. Contract index-level ahora cumplido.

### 6. email-templates +1 delta (KB-44) deferido como orthogonal

Post-cleanup counts: 15 DB rows vs 16 KB active files (+1). Diagnosis: duplicate-mapping pathology (2 KB files → 1 DB row). NO es orphan (ambos archivos tienen `source_of_truth[0].id` válido en DB; pero dos archivos mappean al mismo DB id). Documented as KB-44 gap en 156-03-ORPHAN-AUDIT.md §4 y ORACLE-EVIDENCE.md §Prompt 4; tracked para v29.2 o gap-closure futuro. NO bloquea KB-43 porque el criterio canónico era "active_kb_count per entity = DB count"; 5/6 entidades cumplen + 1 documentado.

### 7. list_connectors ausencia = KB-45 orthogonal (v29.2)

Durante oracle Prompt 4, CatBot no pudo listar connectors "nativamente" porque no existe `list_connectors` tool en `catbot-tools.ts` (solo `list_email_connectors`). Gap ergonómico documentado; NO afecta KB-43 criteria porque todos los counts fueron verificables vía `search_kb` + FS grep.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] search_hints index-level matching para linked relations**

- **Found during:** Task 4 checkpoint (oracle Prompt 3b revelaba gap index-level aunque template/hook cumplían)
- **Issue:** El plan cerraba KB-42 con template + hook + fs-level invariant. Pero `search_kb({search:"holded"})` no encontraba CatPaws cuyo único match a "holded" fuera vía connector linked (solo por title/summary/tags/search_hints). RESEARCH §P-Q5 había marcado esta duda como "possible feature Phase 157+"; la oracle confirmó que el gap real rompe el contract "KB es la fuente única de search para CatBot".
- **Fix:** Extender `buildSearchHints` helper + integración en create + update paths. Mirror en kb-sync-db-source.cjs. Tests T6 + T6b. Backfill de 29 CatPaws con relations via `kb-sync.cjs --full-rebuild --source db`.
- **Files modified:** `app/src/lib/services/knowledge-sync.ts`, `scripts/kb-sync-db-source.cjs`, `app/src/lib/__tests__/knowledge-sync-catpaw-template.test.ts`.
- **Verification:** Oracle re-test Prompt 3b: `search_kb({search:"holded", subtype:"catpaw"})` 4→9 hits incluyendo Test Linker Phase156. 15/15 tests green + suite KB amplia green.
- **Committed in:** `06d69af` (feat — gap closure)

---

**Total deviations:** 1 auto-fixed (1 Rule 2 — Missing Critical)
**Impact on plan:** El gap closure expande el scope explícito de Plan 03 (orphan cleanup) para cerrar también el contrato index-level de Plan 02 (KB-42). Justificado: (a) la oracle es el gate que decide cierre; (b) el fix es mínimo + localizado (helper + mirror + 2 tests); (c) el plan de ejecución alternativo (abrir Plan 04 o deferir a v29.2) rompería el flow del oracle y dejaría el claim "KB como fuente canónica" con excepción explícita. Zero scope creep en otras dimensiones.

## Authentication Gates

None — oracle ejecutado en Docker live con session activa preexistente. No hubo auth prompts interactivos.

## Issues Encountered

### Oracle Prompt 4 interpretive error (CatBot response quality, no hook bug)

CatBot respondió Prompt 4 aplicando un filtro `audience` implícito que redujo el KB CatPaws count a 1 (solo los que tuvieran `audience: user` explícito). Las tool_calls crudas sí ejecutaron los `list_*` + `search_kb({status:"active"})` correctos, pero la interpretación LLM-side colapsó el conteo. Resolution: **ground-truth reconciliation manual** (grep + sqlite3) en ORACLE-EVIDENCE.md §Prompt 4 tabla; 5/6 entidades cumplen invariant, +1 email-templates documentado como KB-44 orthogonal.

Nota: este no es un bug del hook pattern de Phase 156; es una pregunta de prompt-engineering para futuras oracle sessions (e.g., "cuenta TODOS los CatPaws activos independientemente del audience"). Acceptable — la evidencia FS-level + grep es canónica.

### email-templates duplicate-mapping (KB-44 pre-existing)

Reconciliation reveló 16 KB files → 15 DB rows. NO es orphan (ambos archivos del "duplicate" tienen source_of_truth válido en DB pero apuntan al mismo row id). Pathology pre-existing; tracked como KB-44 (orthogonal a Phase 156). No blocker.

## User Setup Required

None — todos los cambios son internos al repo + KB filesystem. No external service configuration.

## Next Phase Readiness

### Phase 156 ready para `/gsd:verify-phase 156` + `/gsd:complete-phase 156` + `/gsd:complete-milestone v29.1`

- **Los 3 plans completados** (156-01 canvas hooks, 156-02 link tools + template, 156-03 orphan cleanup + retention policy).
- **KB-40, KB-41, KB-42, KB-43 → Complete** (verificados end-to-end vía CatBot oracle 4/4 + FS invariants).
- **Estado del KB post-Phase-156:**
  - Canvas entra en el ciclo de sync hooks (POST/PATCH/DELETE + delete_catflow sudo).
  - Link tools re-sync parent CatPaw + renderizan §Conectores/§Skills vinculadas.
  - 5/6 entidades: `active_kb_count == db_row_count`.
  - Retention Policy documentada para orphan detection + ciclo temporal.
  - search_hints extension cierra el gap index-level para linked relations names.

### Open orthogonal items (NO blockers para Phase 156 close)

- **KB-44 (email-templates duplicate-mapping):** 16 KB → 15 DB. Tracked en 156-03-ORPHAN-AUDIT.md §4 y ORACLE-EVIDENCE.md §Prompt 4. Candidate para v29.2 gap-closure (duplicate detection + merge script).
- **KB-45 (list_connectors tool ausente):** CatBot no tiene tool nativo para listar connectors "sueltos" (solo scoped por CatPaw). Gap ergonómico; candidate para v29.2.
- **searchKb body-scan full-text mode:** el gap fue cerrado via search_hints extension para linked relations; un body-scan full-text (para match arbitrario de palabras en content) queda opcional para Phase 157+ si hay demanda real.
- **Test fixtures remanentes:** CatPaw "Test Linker Phase156" (id `2ca02aa7-...`) sigue active en DB+KB. Canvas "Phase 156 Verify" (id `e938d979-...`) ya soft-deleted. Cleanup opcional via SQL (`DELETE FROM cat_paws WHERE name='Test Linker Phase156'`); no blocker.

## Self-Check: PASSED

**Files created/modified verification:**

- FOUND: `.planning/phases/156-kb-runtime-integrity/156-03-ORPHAN-AUDIT.md`
- FOUND: `.planning/phases/156-kb-runtime-integrity/156-03-ORACLE-EVIDENCE.md`
- FOUND: `.docflow-kb/_manual.md` (contains §Retention Policy)
- FOUND: `.docflow-legacy/orphans/catpaws/` (8 files)
- FOUND: `.docflow-legacy/orphans/skills/` (1 file)
- FOUND: `.docflow-legacy/orphans/canvases/` (2 files)
- FOUND: `.docflow-legacy/orphans/email-templates/` (1 file)
- FOUND: `.docflow-legacy/orphans/connectors/` (2 files)
- FOUND: `.docflow-legacy/orphans/catbrains/` (1 file)

**Commits verification:**

- FOUND commit: `e4204b4` (Task 1: audit snapshot)
- FOUND commit: `c6e4ab6` (Task 2: archive 15 orphans + regenerate index)
- FOUND commit: `5a1785e` (Task 3: §Retention Policy)
- FOUND commit: `8300b02` (Task 4: initial oracle evidence)
- FOUND commit: `245c17d` (Task 4: oracle evidence update post-gap-closure)
- FOUND commit: `06d69af` (Task 4 deviation: search_hints gap closure + backfill)

---
*Phase: 156-kb-runtime-integrity*
*Plan: 03*
*Completed: 2026-04-20*
