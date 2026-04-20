---
phase: 156-kb-runtime-integrity
plan: 02
subsystem: kb-sync
tags: [knowledge-base, catbot-tools, syncResource, catpaw, linked-connectors, linked-skills, isNoopUpdate, hook-pattern]

# Dependency graph
requires:
  - phase: 149
    provides: syncResource + buildBody + isNoopUpdate contract
  - phase: 152
    provides: kb-index-cache.invalidateKbIndex + searchKb
  - phase: 153
    provides: try/catch hook wrapper + markStale + hookCtx/hookSlug + author convention
provides:
  - link_connector_to_catpaw re-sincroniza KB del CatPaw padre tras INSERT exitoso
  - link_skill_to_catpaw re-sincroniza KB con INSERT OR IGNORE + isNoopUpdate idempotencia
  - buildBody catpaw renderiza "## Conectores vinculados" + "## Skills vinculadas" (create path)
  - syncResource('catpaw','update') actualiza las 2 secciones in-place en el body existente
  - renderLinkedSection + replaceOrAppendSection helpers reutilizables en knowledge-sync.ts
affects: [156-03-orphan-cleanup, phase-157+, catbot-oracle-prompt-3, v29.1-milestone-audit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Opción A enrichment (RESEARCH §D): caller pasa linked_* arrays al row; service stays pure-filesystem (sin DB import)"
    - "replaceOrAppendSection regex per section header hasta '## ' siguiente o EOF — mirror del system_prompt block rewrite en syncResource update path"
    - "Option B para INSERT OR IGNORE (RESEARCH §A.6): siempre fire syncResource; isNoopUpdate short-circuit para idempotencia"

key-files:
  created:
    - app/src/lib/__tests__/catbot-tools-link.test.ts
    - app/src/lib/__tests__/knowledge-sync-catpaw-template.test.ts
  modified:
    - app/src/lib/services/knowledge-sync.ts
    - app/src/lib/services/catbot-tools.ts

key-decisions:
  - "Opción A (caller enriquece row) sobre B (DB import en knowledge-sync) — preservar contrato Phase 149 'pure-filesystem service'; scripts/kb-sync-db-source.cjs no sufre regresión"
  - "detectBumpLevel minor-on-related NOT extendido; patch bump es suficiente para KB-42 MVP (aspirational per _manual.md L164; DEFERRED a Phase 157+)"
  - "already_linked:true (UNIQUE collision) NO dispara syncResource; reconciliation es scope de --full-rebuild --source db (RESEARCH §P-Q1 resolved)"
  - "Body update path en syncResource requirió replaceOrAppendSection porque update NO llama buildBody (solo rewrite system_prompt block); secciones linked_* se inyectan mediante regex replacement + append fallback"
  - "Tests fixtures inline per archivo (RESEARCH §P-Q2 no shared-helper refactor); skills.instructions NOT NULL satisfied via empty-string seed"

patterns-established:
  - "Linked relations body sync: caller → enriched row → buildBody/replaceOrAppendSection → KB .md reflects relationships"
  - "Body section replacement regex: `^## Header\\n\\n[\\s\\S]*?(?=\\n## |$)` captures until next H2 or EOF; replacement keeps trailing newline for layout stability"
  - "T6-style body-text propagation test: verify fs-level substring + searchKb-level index hit (combined) cuando el search index no escanea body"

requirements-completed: [KB-42]

# Metrics
duration: ~22min
completed: 2026-04-20
---

# Phase 156 Plan 02: Link Tools Resync Summary

**CatBot link_connector_to_catpaw + link_skill_to_catpaw re-sincronizan el .md del CatPaw padre via syncResource('catpaw','update',enriched); buildBody + replaceOrAppendSection renderizan '## Conectores vinculados' + '## Skills vinculadas' sorted por name; isNoopUpdate preserva idempotencia en re-links.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-04-20T21:50:00Z (approx)
- **Completed:** 2026-04-20T22:08:00Z
- **Tasks:** 3/3
- **Files modified:** 2 productivos + 2 tests nuevos = 4 total

## Accomplishments

- **Gap KB-42 cerrado end-to-end:** las 2 tool cases ahora disparan syncResource tras INSERT; los .md de los CatPaws reflejan sus conectores + skills vinculados (test T1 + T7 + T6 probados en fs).
- **buildBody catpaw extendido con 2 secciones nuevas** + renderer helper compartido entre create y update paths (renderLinkedSection).
- **Update path body-sync resuelto:** syncResource('update') no llamaba buildBody; introducido replaceOrAppendSection + regex per sección para mantener body byte-determinístico sorted por name ASC.
- **Idempotencia verificada:** re-link con mismo skill → body byte-idéntico → isNoopUpdate → no version bump (Test T2).
- **Contrato 'no DB import en knowledge-sync' preservado** (Opción A): scripts/kb-sync-db-source.cjs continúa shimming knowledge-sync sin regresión.
- **11 test files, 13 tests, 100% green** + 97 tests en suite KB ampliada sin regresiones.

## Task Commits

Each task was committed atomically:

1. **Task 1 (Wave 0 RED): tests link + template** — `789a834` (test)
2. **Task 2 (Wave 1): buildBody catpaw extension** — `59eccc6` (feat)
3. **Task 3 (Wave 1): hook link tools** — `ebfe6d6` (feat)

**Plan metadata commit:** pending (this SUMMARY.md + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified

### Created
- **`app/src/lib/__tests__/catbot-tools-link.test.ts`** (340 lines) — 8 tests: T1 link_connector enriched syncResource; T2 link_skill re-link noop idempotencia; T3 UNIQUE collision no-hook; T4 CatPaw missing error no-hook; T5 connector/skill missing error no-hook; T6 body propagation + searchKb integration; T7 link_skill enriched + author; T8 link_connector invalidateKbIndex.
- **`app/src/lib/__tests__/knowledge-sync-catpaw-template.test.ts`** (247 lines) — 5 tests: T1 "## Conectores vinculados" sorted render; T2 placeholder empty; T3 "## Skills vinculadas" render; T4 version ≥1.0.1 tras añadir linked_*; T5 isNoopUpdate con linked_* idénticos.

### Modified
- **`app/src/lib/services/knowledge-sync.ts`** (+95 lines) — añade `renderLinkedSection` + `replaceOrAppendSection` helpers; extiende buildBody catpaw con las 2 secciones; extiende syncResource 'update' path para actualizar body in-place cuando el row trae linked_* arrays.
- **`app/src/lib/services/catbot-tools.ts`** (+57 lines) — añade hook post-INSERT en link_connector_to_catpaw + link_skill_to_catpaw: SELECT-back pawRow + 2 SELECT JOIN sorted por name ASC → enriched row → syncResource('catpaw','update',enriched, hookCtx(author)) + invalidateKbIndex on success; catch → logger.error + markStale('update-sync-failed').

## Decisions Made

### 1. Opción A sobre Opción B (DB import en knowledge-sync)
RESEARCH §D evaluó 3 opciones. Escogimos A porque:
- Phase 149 contrato explícito "no importar better-sqlite3" (knowledge-sync.ts:19-20).
- `scripts/kb-sync-db-source.cjs` shim consume knowledge-sync sin DB; cambiar esto rompería el CLI.
- Caller duplica 2 queries JOIN, pero la acumulación es 6 total call sites (link_connector, link_skill + opcionales create/patch/delete routes); acceptable.

### 2. Patch bump en vez de minor bump
`_manual.md` L164 dice "minor bump on related". Implementarlo requiere extender `detectBumpLevel` con `linked_connectors_hash` en sync_snapshot. Evaluamos:
- Test T4 acepta ≥1.0.1 (patch) — plan lo permitió explícitamente como fallback.
- Cambio adicional en detectBumpLevel tiene overhead de regression risk en 15 tests Phase 149.
- DEFERRED a Phase 157+ si hay demanda real.

### 3. `already_linked: true` NO dispara syncResource
RESEARCH §P-Q1 open question resuelto: la rama UNIQUE collision no toca DB → no hay cambio semántico para sincronizar. Reconciliation de sync failures históricos se owe a `--full-rebuild --source db`.

### 4. INSERT OR IGNORE skills: Option B (always fire syncResource)
RESEARCH §A.6 comparó A (check `stmt.changes === 1`) vs B (always fire + rely on isNoopUpdate). Escogimos B:
- Menos código especial-case en el tool case.
- isNoopUpdate es el contrato canónico de idempotencia (Phase 149 invariant); aprovecharlo es el patrón.
- Test T2 prueba explícitamente: re-link → version NO sube.

### 5. Update-path body rewrite via replaceOrAppendSection
**Descubrimiento no-planeado:** el código del plan asumía que buildBody se llama tanto en create como en update. NO es así: syncResource('update') L1150 reutiliza el body existente + patch solo el system_prompt block (knowledge-sync.ts:1154-1170). Sin modificar el update path, los hooks de Plan 156-02 dispararían syncResource pero las secciones linked_* nunca se actualizarían.

Solución: añadir 2 helpers al service:
- `renderLinkedSection(items, emptyLabel)` — shared entre create y update.
- `replaceOrAppendSection(content, header, body)` — regex `^## Header\n\n[\s\S]*?(?=\n## |$)` captura sección hasta siguiente H2 o EOF; reemplaza inline; si no existe, append al final con separador.

Aplicado condicionalmente cuando `linked_connectors !== undefined` o `linked_skills !== undefined` (preserva back-compat con callers no-enriquecidos).

### 6. Tests fixture: schema inline + skills.instructions NOT NULL
RESEARCH §P-Q2 recomendó "inline, no shared-helper refactor". Aplicado. Durante RED run descubrimos `skills.instructions TEXT NOT NULL` en db.ts:453. Fix: seed con `instructions = ''` (empty string satisface el constraint sin consumir fixture data).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed skills.instructions NOT NULL test seed constraint**
- **Found during:** Task 1 (RED verification)
- **Issue:** INSERT INTO skills sin `instructions` columna falló con "NOT NULL constraint failed: skills.instructions" — db.ts:453 declara `instructions TEXT NOT NULL`.
- **Fix:** Añadida `instructions` columna al INSERT statement con valor `''`.
- **Files modified:** app/src/lib/__tests__/catbot-tools-link.test.ts (seedSkill helper).
- **Verification:** Post-fix los 2 skill tests (T2 + T7) avanzan del setup error al fail-for-correct-reason.
- **Committed in:** `789a834` (Task 1 commit, pre-commit fix absorbed).

**2. [Rule 1 - Bug] buildBody-only template extension no afecta update path**
- **Found during:** Task 2 (GREEN run of template tests).
- **Issue:** Plan §N.3 solo mostró buildBody extension. Pero syncResource('update') L1117 NO llama buildBody — reutiliza body existente + patch system_prompt block. Tests T4 de template.test.ts fallaba: version no subía porque body no cambiaba en update.
- **Fix:** Añadidos 2 helpers (`renderLinkedSection`, `replaceOrAppendSection`) + extensión de syncResource 'update' path para reemplazar las 2 secciones in-place cuando el row trae linked_* arrays. Lógica mirror del system_prompt block rewrite pre-existente (L1154-1170).
- **Files modified:** app/src/lib/services/knowledge-sync.ts (+66 lines: helpers + update-path wiring).
- **Verification:** T4 green + 38/38 Phase 149 tests sin regresión + 24/24 Phase 153 hooks sin regresión.
- **Committed in:** `59eccc6` (Task 2 commit).

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 3 blocker)
**Impact on plan:** Both auto-fixes necessary to close KB-42 end-to-end (tests T4/T6 otherwise unreachable). Zero scope creep — helpers stay within knowledge-sync.ts, contract "no DB import" preserved.

## Issues Encountered

- **§P-Q5 open question parcialmente resuelto:** kb-index-cache.searchKb (L325-366) solo indexa title/summary/tags/search_hints — **no escanea body**. T6 test adaptado: verifica (a) body substring "**Holded MCP**" via fs directo Y (b) searchKb('holded') total>=1 vía el connector entry indexado por title. Body-text full-text search queda como potencial feature de Phase 157+ si se requiere. **NO es blocker para KB-42**: el objetivo de KB-42 era que el .md refleje los links; invariante (a) es el contrato real. Invariante (b) prueba que el KB sigue siendo consistente post-hook.

## User Setup Required

None — no external service configuration required. Cambios son puramente de lib/services + tests.

## Next Phase Readiness

### Ready for Plan 156-03 (orphan cleanup)
- KB-42 hooks están live. Nuevos CatPaws con links crearán .md correctos desde el primer link.
- Archivos disjuntos con Plan 156-01 (canvas routes + delete_catflow) y Plan 156-03 (orphan sweep + _manual.md retention policy): cero merge conflict surface.

### Open follow-ups (no blockers)
- **OPCIONAL (scope creep):** `create_cat_paw` tool + POST/PATCH/DELETE /api/cat-paws/*  rutas siguen pasando row NO enriquecido (sin linked_* arrays). Resultado: primer create renderiza las 2 secciones con placeholders empty (correcto semánticamente — CatPaw recién creado no tiene links). Si en el futuro se quiere que el primer create acepte `connectors:[...]` del POST body y los inyecte pre-sync, es scope creep — DEFERRED.
- **DEFERRED (minor):** `detectBumpLevel` minor-on-related tras añadir `linked_connectors_hash` en sync_snapshot. `_manual.md` L164 lo promete; MVP usa patch.
- **DEFERRED (nice-to-have):** searchKb body-scan full-text mode para que `search:'holded'` encuentre CatPaws via contenido del body además de por title. Scope de phase posterior.

### Phase oracle checklist (para /gsd:verify-phase)
- **Oracle Prompt 3 (RESEARCH §I):** "Crea un CatPaw 'Test Linker', enlázale el conector Holded MCP, y dime qué conectores tiene vinculados según el KB." → debe retornar el connector en la respuesta via get_kb_entry o search_kb.
- Esto valida end-to-end KB-42 en producción Docker (post Plan 156-03 docker rebuild).

## Self-Check

**Files created/modified verification:**

```bash
[ -f "app/src/lib/__tests__/catbot-tools-link.test.ts" ] && echo FOUND || echo MISSING
[ -f "app/src/lib/__tests__/knowledge-sync-catpaw-template.test.ts" ] && echo FOUND || echo MISSING
grep -c "linked_connectors" app/src/lib/services/knowledge-sync.ts
grep -c "catbot:link_connector" app/src/lib/services/catbot-tools.ts
```

**Commit verification:**

```bash
git log --oneline | grep -E "(789a834|59eccc6|ebfe6d6)"
```

## Self-Check: PASSED

- `app/src/lib/__tests__/catbot-tools-link.test.ts` — FOUND (git: 789a834)
- `app/src/lib/__tests__/knowledge-sync-catpaw-template.test.ts` — FOUND (git: 789a834)
- `app/src/lib/services/knowledge-sync.ts` — MODIFIED (git: 59eccc6; 5 occurrences of `linked_connectors` post-edit)
- `app/src/lib/services/catbot-tools.ts` — MODIFIED (git: ebfe6d6; `catbot:link_connector` + `catbot:link_skill` authors present)
- Commits 789a834, 59eccc6, ebfe6d6 all present in main branch history.
- 13/13 Plan 156-02 tests green; 97/97 broader KB suite green; `npm run build` exit 0.

---
*Phase: 156-kb-runtime-integrity*
*Plan: 02*
*Completed: 2026-04-20*
