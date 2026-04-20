# Phase 155: KB Cleanup Final - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminar la deuda técnica de los dos knowledge layers legacy ahora que `.docflow-kb/` es la única fuente canónica:

1. Borrar físicamente `app/data/knowledge/*.json` (9 archivos: 7 áreas + `_index.json` + `_template.json`) — datos migrados en Phase 151.
2. Borrar físicamente `.planning/knowledge/*.md` (12 archivos con redirect stubs desde Phase 151).
3. Borrar `skill_orquestador_catbot_enriched.md` (raíz, migrado a `protocols/orquestador-catflow.md` en Phase 151).
4. Barrido completo de código consumidor del layer legacy: tool `query_knowledge`, `knowledge-tree.ts`, helpers `stringifyConceptItem`/`mapConceptItem`, schemas Zod del viejo subsistema en `catbot-tools.ts` y `catbot-prompt-assembler.ts`.
5. Borrar `app/src/lib/__tests__/knowledge-tree.test.ts` + `knowledge-tools-sync.test.ts` enteros (subjects desaparecen).
6. Simplificar `CLAUDE.md`: §"Protocolo de Documentación" + §"Documentación de referencia" → punteros a `.docflow-kb/_manual.md`.
7. Migrar §"Restricciones absolutas" de `CLAUDE.md` a `.docflow-kb/rules/R*.md` con tag `safety`+`critical`.
8. Correr `scripts/kb-sync.cjs --full-rebuild --source db` + commit snapshot (cierra drift `kb_entry:null` de live CatPaws).
9. Documentar rollback plan en `.docflow-kb/_manual.md`.
10. Patchar traceability table en `.planning/REQUIREMENTS.md` añadiendo rows KB-01..KB-05 (doc gap del audit v29.1).

Corresponde a Fase 7 del PRD Knowledge Base (`.planning/ANALYSIS-knowledge-base-architecture.md §7`). Última fase de v29.1.

**Fuera de scope:**
- Los 10 tests rojos orthogonal (`task-scheduler` 5, `alias-routing` 3, `catbot-holded-tools` 2) — hotfix aparte.
- `catbrains` table migration column-count drift — hotfix aparte.
- Phase 155.1 decimal o Phase 156 follow-up — no se crean en este phase.

</domain>

<decisions>
## Implementation Decisions

### Deletion strategy
- **Full delete** de los ~22 archivos legacy. `git rm` — repo queda limpio. Git history preserva breadcrumb; los stubs de Phase 151 ya cumplieron su propósito.
- No quedan tombstones ni redirect stubs en el working tree después de Phase 155.
- El `_index.json` y `_template.json` de `app/data/knowledge/` también caen.

### `query_knowledge` tool disposition
- **Remove tool completely**: borrar del dispatcher `catbot-tools.ts` (case + TOOLS[] entry), Zod schemas (`KnowledgeEntrySchema`, `ConceptItemSchema`, etc.), y cualquier referencia en `knowledge-tree.ts`.
- Canónicos: `search_kb` y `get_kb_entry` (Phase 152). CatBot ya los usa en los 4 oracles de Phase 152.
- Tool description no se "deprecates" — simplemente desaparece. Sin migración blanda.

### Code sweep scope (full)
- Borrar archivo `app/src/lib/knowledge-tree.ts` entero.
- Borrar helpers `stringifyConceptItem` y `mapConceptItem` en `app/src/lib/services/catbot-tools.ts` (Phase 152-01) y su gemelo en `app/src/lib/services/catbot-prompt-assembler.ts`.
- Borrar `__redirect` detection logic en `query_knowledge` case (ya no existe el case).
- Barrer imports de `loadKnowledgeArea`, `getAllKnowledgeAreas`, `getKnowledgeAreaById` en cualquier archivo que los consuma. Sustituir por `search_kb`/`get_kb_entry` si el caller genuino lo necesita (planner investiga).
- Eliminar `delete_catflow` residual si sigue referenciado en howto — Phase 152-04 lo sacó de `tools[]` pero quedó en `howto`.
- Método: grep-driven. `grep -rn 'app/data/knowledge\|knowledge-tree\|query_knowledge\|loadKnowledgeArea\|getAllKnowledgeAreas\|stringifyConceptItem\|mapConceptItem\|ConceptItemSchema\|KnowledgeEntrySchema' app/` antes y después — expected 0 hits salvo en commits/planning docs.

### Test cleanup
- **Delete entire files**: `git rm app/src/lib/__tests__/knowledge-tree.test.ts` + `app/src/lib/__tests__/knowledge-tools-sync.test.ts`. No hay assertions portables — los subjects desaparecen.
- 8 tests rojos heredados cierran al borrar archivos. Tests KB (108 pre-Phase-154 + 11 Playwright) siguen verdes.
- No tocamos `task-scheduler.test.ts`, `alias-routing.test.ts`, `catbot-holded-tools.test.ts` — hotfix aparte.

### Live-DB KB backfill
- **Dentro de Phase 155, commit separado**.
- Plan N: deletion + code sweep + tests delete + CLAUDE.md simplificación — un bloque.
- Plan N+1: `cd /home/deskmath/docflow && node scripts/kb-sync.cjs --full-rebuild --source db` — captura el estado actual del live DB en `.docflow-kb/resources/*.md`. Commit con mensaje `chore(kb): backfill resources from live DB post-155`.
- Tras backfill: re-run CatBot oracle "lista los CatPaws" → todos deben tener `kb_entry` resuelto (no más `null` en Operador Holded id `53f19c51`).

### CLAUDE.md simplification
- **§"Protocolo de Documentación: Knowledge Tree + CatBot"** → reemplazar por puntero corto: "Toda documentación vive en `.docflow-kb/`. Ver `.docflow-kb/_manual.md` para nomenclatura + flujos. CatBot ya consume el header automáticamente."
- **§"Documentación de referencia"** → repuntar: rutas `.planning/knowledge/proceso-catflow-revision-inbound.md` → `.docflow-kb/protocols/catflow-inbound-review.md`, etc. Lista cerrada según el mapa de migración de Phase 151.
- **§"Restricciones absolutas"** → migrar a `.docflow-kb/rules/R*.md` (nuevos atoms con tags `[safety, critical]`):
  - "canvas-executor.ts NUNCA modificar" → `.docflow-kb/rules/R26-canvas-executor-immutable.md`
  - "agentId NUNCA inventar slugs; solo UUIDs" → `.docflow-kb/rules/R27-agent-id-uuid-only.md`
  - "process.env.X NUNCA; usar process['env']['X']" → `.docflow-kb/rules/R28-env-bracket-notation.md`
  - "Docker rebuild necesario tras cambios en execute-catpaw.ts" → `.docflow-kb/rules/R29-docker-rebuild-execute-catpaw.md`
- CLAUDE.md §Restricciones queda con puntero: "Ver `.docflow-kb/rules/` con tag `critical` para las 4 restricciones inmutables."
- §"Protocolo de Testing: CatBot como Oráculo" — mantener. No se toca.

### Rollback plan doc
- Sección nueva en `.docflow-kb/_manual.md`: "Rollback de la migración v29.1":
  - Recipe 1 (archivos): `git revert <sha-deletion>` restaura los 22 archivos legacy.
  - Recipe 2 (code): `git revert <sha-code-sweep>` restaura `query_knowledge` + `knowledge-tree.ts`.
  - Recipe 3 (backfill): `git revert <sha-backfill>` devuelve el snapshot pre-backfill del KB; correr `node scripts/kb-sync.cjs --full-rebuild --source db` regenera desde DB live.
  - Nota: se puede revertir tras el commit, pero si se mergea a prod + pasan semanas, restaurar los JSONs requerirá regenerar `app/data/knowledge/_index.json` a mano (el formato drifteó).

### Audit v29.1 side-fixes included
- Patch `.planning/REQUIREMENTS.md` §Traceability: añadir filas `| KB-01 | Phase 149 | Complete |` .. `| KB-05 | Phase 149 | Complete |` (actualmente ausentes — cosmético).
- `_header.md` regeneration ya es dinámica (integration checker lo confirmó). No se toca.

### Commit strategy
- Phase 155 landas en **≥3 commits atomizables**:
  1. Deletion + code sweep + tests delete + CLAUDE.md simplificación + rules migrados + REQUIREMENTS patch (grande pero atómico porque son operaciones que dependen mutuamente).
  2. KB backfill desde live DB (independiente; revertible sin rollback del delete).
  3. `.docflow-kb/_manual.md` update con sección rollback + Phase 155 section.
- Planner puede dividir 1 en sub-commits si identifica fronteras limpias.

### Claude's Discretion
- Granularidad exacta de commits dentro del bloque 1 (planner decide si separa "deletion de archivos" de "code sweep" de "CLAUDE.md").
- Si algún consumer legacy tira de `loadKnowledgeArea` en runtime activo (no solo tests) — planner investiga y decide si lo migra a `get_kb_entry` o si puede eliminarse completamente.
- Wording exacto de las reglas R26-R29 en `.docflow-kb/rules/` (preservar la sustancia, frontmatter estándar con `tags:[safety,critical]`).
- Orden de ejecución: wave 1 (deletion + code + tests, paralelizable) → wave 2 (rules migrados + CLAUDE.md + REQUIREMENTS) → wave 3 (Docker rebuild + backfill) → wave 4 (_manual.md + oracle + VERIFICATION).
- Si el sweep descubre otros consumers inesperados (ej. un health check, un admin panel) — planner los incluye en scope.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/lib/services/kb-index-cache.ts` — `getKbIndex`, `getKbEntry`, `searchKb`, `resolveKbEntry` ya existen (Phase 152). Los consumers actuales de `loadKnowledgeArea` (si los hay) pueden portarse a `get_kb_entry`/`search_kb`.
- `scripts/kb-sync.cjs --full-rebuild --source db` — idempotente (Phase 150), seguro para correr contra DB live. Produce .md + `_index.json` + `_header.md` + spawn `validate-kb.cjs`.
- `scripts/validate-kb.cjs` — gate post-commit; debe exit 0 tras todas las ops.
- `.docflow-kb/rules/R*.md` — pattern establecido (25 rules en Phase 151). `tag-taxonomy.json` ya incluye `safety`, `critical`.

### Established Patterns
- Phase 151-01 **redirect stubs prepend**: el contenido original quedó debajo del stub. Phase 155 full-delete se lleva ambas partes en un git rm.
- Phase 152-01 **adapters `stringifyConceptItem`/`renderConceptItem`** existen solo porque `knowledge-tree.ts` tenía union-types. Al eliminar el archivo, los adapters quedan huérfanos → borrar junto.
- Phase 153 **hook pattern**: `await syncResource(entity, op, row, ctx)` + `invalidateKbIndex()`. Siguió vivo tras backfill; backfill respeta idempotencia (2nd run = 0 writes).
- **Docker volume mount rw**: Phase 153-04 cambió `:ro` → rw. Backfill escribe al host; container lee. Verificar `docker-compose.yml` sigue en rw antes del backfill.
- **Oracle pattern**: `POST /api/catbot/chat` con mensaje en texto libre + evidencia verbatim en VERIFICATION.md. Phase 155 debe correr al menos 1 oracle: "lista los CatPaws activos y dime el kb_entry del primero" — expected: todos con `kb_entry` resuelto post-backfill.

### Integration Points
- `CLAUDE.md` (root) — 80 líneas, 3 secciones principales a tocar.
- `app/src/lib/services/catbot-tools.ts` — dispatcher de tools, executor central; el case `query_knowledge` + TOOLS entry + imports desaparecen.
- `app/src/lib/services/catbot-prompt-assembler.ts` — los helpers Phase 152-01 de compat con ConceptItemSchema se van.
- `app/src/lib/knowledge-tree.ts` — archivo entero se borra.
- `.planning/REQUIREMENTS.md` — patch traceability table lines 113-155.
- `.planning/Index.md` — probable deprecación del concepto "dos knowledge layers" (planner verifica).
- `.docflow-kb/_manual.md` — añade sección Phase 155 + rollback recipe.
- `docker-compose.yml` — verificar volumen `.docflow-kb` sigue rw (Phase 153-04 change).

</code_context>

<specifics>
## Specific Ideas

- "Repo limpio" es el criterio de aceptación mental — no quiero ver stubs de redirect en el working tree tras Phase 155.
- Todos los rojos del subsistema legacy (`knowledge-tree.test.ts`) deben desaparecer porque el archivo que testean desaparece. No "skip()", no "TODO Phase 156".
- Backfill no puede diferirse a otra fase; si v29.1 cierra, quiero que el estado del KB en disco refleje el estado DB live.
- CatBot debe poder demostrar que el cleanup fue limpio: oracle post-155 debe devolver `kb_entry` resuelto para todos los CatPaws activos (no solo los 10 committeados en Phase 150).
- CLAUDE.md queda más corta tras Phase 155 — esto es deseable.

</specifics>

<deferred>
## Deferred Ideas

- **Hotfix 10 tests orthogonal**: `task-scheduler.test.ts` (5 failures), `alias-routing.test.ts` (3), `catbot-holded-tools.test.ts` (2). Pertenecen a Phases 60/109/76. Merit hotfix aparte en v29.2 o standalone — no en 155.
- **Catbrains migration column drift**: build logs ~50 warnings `23 cols but 18 values`. Investigación en `app/src/lib/db.ts` migration sequence. Hotfix aparte.
- **`_header.md` regenerate drift**: Phase 152-VERIFICATION mencionó hand-patch para counts Phase 151; integration checker confirmó que knowledge-sync.ts + kb-sync.cjs ya lo computan dinámicamente. No hacer nada — resolved.
- **Multi-worker cache invalidation** (`kb-index-cache.ts` 60s TTL process-local): latente en deploys multi-worker. Single-worker Docker actual es safe. Follow-up si/cuando escalemos.
- **i18n strings** que mencionen "knowledge tree" o "two layers": si aparecen, pertenecen a refactor de copy aparte. No scope de 155.
- **Nyquist compliance** para 149-154 (4 PARTIAL + 2 MISSING VALIDATION.md): discovery only del audit v29.1. No bloquea 155, pero conviene `/gsd:validate-phase` antes de `/gsd:complete-milestone v29.1`.

</deferred>

---

*Phase: 155-kb-cleanup-final*
*Context gathered: 2026-04-20*
