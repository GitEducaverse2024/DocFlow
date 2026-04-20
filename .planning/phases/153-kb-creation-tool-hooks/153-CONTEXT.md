# Phase 153: KB Creation Tool Hooks — Context

**Gathered:** 2026-04-20
**Status:** Ready for planning
**Source:** Decisiones delegadas por usuario (patrón establecido en Phases 150/152), derivadas de scout de `catbot-tools.ts` + `app/src/app/api/` + Phase 149 `knowledge-sync.ts` contract + PRD §7 Fase 5

<domain>
## Phase Boundary

Automatizar la sincronización DB → KB **sin intervención manual**. Cada vez que una escritura en DB crea/modifica/elimina una entidad que tiene representación en `.docflow-kb/resources/`, el archivo correspondiente se actualiza automáticamente vía `syncResource()` del servicio `knowledge-sync.ts` (Phase 149). Esto cierra el gap principal que Phase 152 expuso: el campo `kb_entry` en `list_cat_paws` devuelve `null` para CatPaws creados después del snapshot de Phase 150, porque nadie mantiene el KB sincronizado en runtime.

**Entregables:**

1. **Hooks en tools de CatBot** (`catbot-tools.ts`) — casos existentes: `create_catbrain`, `create_cat_paw`/`create_agent`, `create_connector`, `update_cat_paw`, `create_email_template`, `update_email_template`, `delete_email_template`. Cada uno llama `syncResource(subtype, op, row, {author})` al final de la operación DB exitosa.

2. **Hooks en API routes Next.js** (`app/src/app/api/*/route.ts` y `[id]/route.ts`) — confirmados con writes: `cat-paws POST/PATCH/DELETE`, `catbrains POST`, `connectors POST`, `skills POST`, `email-templates POST`. Cada handler llama `syncResource` tras la operación DB exitosa.

3. **Política de fallo:** DB es source of truth. Si `syncResource` falla (schema invalid, filesystem error, disk full), la operación DB **NO se revierte** — se loguea ERROR y se marca la entrada como stale en `.docflow-kb/_audit_stale.md` para reconciliación posterior con `scripts/kb-sync.cjs --full-rebuild --source db`.

4. **Semántica de delete:** todas las tools/routes de delete llaman `markDeprecated()` (soft delete — cambia frontmatter `status: deprecated` + añade `deprecated_at`/`deprecated_by`/`deprecated_reason`) en lugar de borrar el archivo. La eliminación física del archivo KB es Phase 155 cleanup.

5. **Invalidación de cache:** tras cada `syncResource` exitoso, invalidar el cache in-memory del `kb-index-cache.ts` (vía `invalidateKbIndex()` — export existe desde Phase 152) para que el siguiente `list_*` o `search_kb` refleje el cambio.

**Fuera de scope (explícito):**

- **Crear tools inexistentes** (`update_catbrain`, `delete_catbrain`, `delete_cat_paw`, `update_connector`, `delete_connector`, `create_skill`, `update_skill`, `delete_skill`, `create_canvas`, `update_canvas`, `delete_canvas`) — son features propias. Phase 153 solo hookea lo que ya existe.
- **Gestión de canvases** — ningún case en catbot-tools.ts ni route handler directo los toca como CRUD. Se gestionan vía `canvas_executor.ts` con rutas distintas. Deferred hasta fase que expanda tool surface.
- **Dashboard UI** → Phase 154.
- **Cleanup legacy** → Phase 155.
- **Sync bidireccional (KB → DB)** — nunca. KB es derivado, DB canónico. Esta dirección nunca se implementa.
- **Sync transaccional** (rollback DB si KB falla) — explícitamente rechazado (ver §D3 abajo).

**Invariantes heredadas que NO cambian:**

- `knowledge-sync.ts` contract (Phase 149): `syncResource(entity, op, row, context?)` firma fija.
- `kb-sync.cjs --full-rebuild --source db` (Phase 150): sigue funcionando como reconciliation tool manual.
- Zod union schema `knowledge-tree.ts` (Phase 152): sigue activa.
- `kb-index-cache.ts` (Phase 152): sigue siendo consumer — no se re-arquitecta.
- Secretos nunca en KB (Phase 150 §D2.2): `connector.config`, `canvas.flow_data/thumbnail`, `email_template.structure/html_preview` nunca van al KB. Los hooks deben respetar esto usando los mismos `FIELDS_FROM_DB` allowlists del servicio.

</domain>

<decisions>
## Implementation Decisions

Todas las decisiones siguientes son **locked** para researcher + planner (usuario delegó, patrón consistente con Phases 150/152). Claude's Discretion listado al final.

### D1. Double-path hook strategy (tools + API routes)

**Decisión:** hookear **ambos paths** (catbot-tools.ts cases + API routes Next.js). Razón: las tools de CatBot son un path; las API routes son otro path (usado por el UI y por futuros integraciones externas). No hookear las routes significaría que cualquier edit desde la UI (que es el flujo dominante real) deja el KB stale.

**Scope concreto** (solo lo que existe):

| Operación | Path tool (catbot-tools.ts case) | Path API route | Entrada KB |
|-----------|----------------------------------|----------------|------------|
| Create CatPaw | `create_cat_paw`/`create_agent` L1636 | `POST /api/cat-paws` | `resources/catpaws/` |
| Update CatPaw | `update_cat_paw` L2238 | `PATCH /api/cat-paws/[id]` | idem |
| Delete CatPaw | (sin tool) | `DELETE /api/cat-paws/[id]` | idem, soft-delete |
| Create CatBrain | `create_catbrain` L1610 | `POST /api/catbrains` | `resources/catbrains/` |
| Create Connector | `create_connector` L1699 | `POST /api/connectors` | `resources/connectors/` |
| Create Skill | (sin tool) | `POST /api/skills` | `resources/skills/` |
| Create Email Template | `create_email_template` L3097 | `POST /api/email-templates` | `resources/email-templates/` |
| Update Email Template | `update_email_template` L3122 | (API route no verificada aún — planner verifica) | idem |
| Delete Email Template | `delete_email_template` L3152 | (API route no verificada aún — planner verifica) | idem, soft-delete |

**No hookeamos** entidades sin path de escritura actual. Si existe route de update/delete para otras entidades (connector, catbrain, skill), el planner las añade — verificar con `ls app/src/app/api/<entity>/[id]/route.ts` antes de asumir.

### D2. Mecánica del hook — wrapper pattern

**No se refactoriza** el código existente. Cada hook es un **wrap puntual** tras la operación DB exitosa:

```typescript
// Ejemplo patrón — NO es código exacto, es la forma
// Antes:
case 'create_catbrain': {
  const row = db.prepare('INSERT INTO catbrains ...').run(...);
  return { name, result: {...} };
}

// Después:
case 'create_catbrain': {
  const id = generateId();
  db.prepare('INSERT INTO catbrains ...').run(...);
  const row = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(id);
  
  // NEW HOOK (non-blocking on failure):
  try {
    await syncResource('catbrain', 'create', row, { author: context?.userId ?? 'catbot' });
    invalidateKbIndex();
  } catch (err) {
    logger.error('kb-sync-hook', 'syncResource failed', { entity: 'catbrain', id, err });
    markStale(`.docflow-kb/resources/catbrains/${id}.md`, 'create-sync-failed');
  }
  
  return { name, result: {...} };
}
```

**Decisiones:**
- Hook corre **después** del commit DB (no transaccional con DB).
- Hook es `await` sobre `syncResource` — failure mode graceful `try/catch`.
- `invalidateKbIndex()` se llama solo en el path success.
- `markStale()` es un helper nuevo (Plan 01) que añade entry a `_audit_stale.md` con timestamp + razón + path. Usable por cualquier consumer.

### D3. Failure mode — DB wins, KB stale logged

**Sync failure NO rompe la operación DB.** La request del usuario/tool se completa exitosamente desde su perspectiva. La inconsistencia KB se materializa así:

- **ERROR log** con `entity`, `id`, `op`, `err` en `knowledge-sync` logger namespace.
- **Entry en `_audit_stale.md`** con frontmatter `status: sync-failed` + `reason: "create-sync-failed" | "update-sync-failed" | "delete-sync-failed" | "markDeprecated-failed"` + `detected_at: <timestamp>`.
- **Reconciliación** manual: el operador corre `scripts/kb-sync.cjs --full-rebuild --source db` (Phase 150) periodically o cuando `_audit_stale.md` tenga entries.

**Por qué NO transaccional (rollback DB si KB falla):**
1. **DB es canónica.** Si el user crea un CatPaw, su intención es que el CatPaw exista en DB — revertir porque el disk está full es peor UX que desync temporal.
2. **Complejidad.** Rollback requiere capture del estado previo, manejo de side effects (p.ej. `openclaw_id` ya escrito), y duplicación de lógica en cada case. No vale.
3. **Precedente:** Phase 150 PRD §5.3 ya estableció que DB gana en `fields_from_db`. Phase 153 extiende la misma filosofía a writes.

### D4. Delete semantics — soft via markDeprecated

**Único camino de delete en todos los hooks:** `markDeprecated(path, row, author, reason)` del servicio Phase 149. Nunca `fs.unlink()` del archivo KB.

Comportamiento:
- El archivo `.docflow-kb/resources/<type>/<id>-<slug>.md` persiste pero con frontmatter actualizado:
  - `status: deprecated`
  - `deprecated_at: <timestamp>`
  - `deprecated_by: <author>` (p.ej. el userId que disparó el delete)
  - `deprecated_reason: "DB row deleted at <timestamp>"`
- `search_kb({status:'active'})` ya filtra default; el archivo deprecated no aparece en resultados sin `status:'deprecated'` explícito.
- `get_kb_entry(id)` sigue devolviendo el entry (acceso via ID directo a archivos deprecated es deliberado — sirve para historia).
- Eliminación física: Phase 155 cleanup o manual vía `kb-sync.cjs --archive --confirm` / `--purge --confirm` (Phase 149).

**Razón:** soft delete preserva historia + permite recovery + consistente con el workflow 150d/170d/180d de purga definido en Phase 149.

### D5. Author attribution

Cada `syncResource`/`markDeprecated` call pasa `author` en el context:

- **Tool case con `context?.userId`:** `author: context.userId ?? 'catbot'`. Si sudo está activo y target user difiere, es aceptable (reflejar quién ejecutó).
- **API route sin autenticación de usuario clara:** `author: 'api:<route>'` (e.g. `'api:cat-paws.POST'`). Si hay sistema de sesión/auth existente (revisar next-auth o similar), usar userId real; si no, el tag de route.
- **Seed/system operations** (p.ej. el proceso de bootstrap que crea CatPaws default en `db.ts`): `author: 'system:seed'`.

**El planner verifica** si hay middleware de auth en `app/src/app/api/` y usa `userId` cuando esté disponible. Si no, tag de route es aceptable — esto es campo editorial, no security boundary.

### D6. Orden operaciones en PATCH/UPDATE

Para updates, el orden crítico:
1. DB update (`db.prepare('UPDATE ...').run()`).
2. Re-leer row completa post-update (`db.prepare('SELECT * FROM ... WHERE id = ?').get(id)`).
3. `await syncResource(subtype, 'update', row, {author})` — `detectBumpLevel` internamente decide patch/minor/major según Phase 149 §5.2.
4. `invalidateKbIndex()`.
5. Return response al caller.

**Crítico:** paso 2 NO es opcional. El row que se pasa a `syncResource` debe tener el estado post-update. Pasar el `args` del request (pre-update diff) puede olvidarse de campos que el UPDATE tocó indirectamente (updated_at, times_used+1 en algunos casos, etc.).

### D7. Cache invalidation strategy

Una sola regla: **invalidar tras success**. No invalidar tras fail (el cache es el estado previo correcto en ese caso).

```typescript
try {
  await syncResource(...);
  invalidateKbIndex(); // ← solo aquí
} catch (err) {
  // NO invalidate — cache refleja KB state actual aún válido
  markStale(...);
}
```

La invalidación es barata (reset de `indexCache.data = null` + `loadedAt = null`); la próxima llamada que necesite el index hace cold-start (~15-25ms re-lee los 66+ files). Aceptable dado que los hooks son de baja frecuencia (no en hot path de reads).

### D8. Tests obligatorios (Nyquist enabled)

**Unit tests por cada hook:**
- Ficture DB + fixture KB (reusar `createFixtureKb` de Phase 152 + `createFixtureDb` pattern de Phase 150).
- `create_*` → DB insert + archivo aparece en KB + `_index.json` incluye entry + `invalidateKbIndex` llamada (spy).
- `update_*` → DB update + archivo actualiza con bump correcto + `change_log` crece.
- `delete_*` → DB delete (si la route hace DELETE real) + archivo persiste con `status: deprecated` + `deprecated_at` timestamp.
- **Failure simulation:** mock `syncResource` para lanzar error; verificar que (a) DB op persiste, (b) ERROR log emitido, (c) `_audit_stale.md` gana entry, (d) response al caller NO contiene error del sync.

**Integration tests API routes:**
- Fetch `POST /api/cat-paws` con body válido → 200 + row en DB + archivo KB presente + index invalidated.
- Fetch `PATCH /api/cat-paws/[id]` → 200 + file updated.
- Fetch `DELETE /api/cat-paws/[id]` → 200 + file `status:deprecated`.

**Regression:**
- Tests existentes (knowledge-sync 38/38, kb-sync-cli 13/13, kb-sync-db-source 18/18, kb-index-cache 20/20, kb-tools 18/18, catbot-tools-query-knowledge 6/6, kb-tools-integration 6/6, knowledge-tree, knowledge-tools-sync) siguen green.

**Oracle test (pre-cierre):**
1. Dev DB: crear CatPaw vía `POST /api/cat-paws` o vía CatBot chat con `create_cat_paw`.
2. Verificar `ls .docflow-kb/resources/catpaws/<id>*.md` — archivo existe.
3. Verificar frontmatter `status: active`, `version: 1.0.0`, `created_by` poblado.
4. Actualizar con PATCH o `update_cat_paw` — verificar `version: 1.0.1` (o 1.1.0/2.0.0 según tabla bump), `change_log` con 2 entries.
5. Delete → verificar `status: deprecated`, archivo persiste.
6. Tras paso 5: `search_kb({subtype:'catpaw', status:'active'})` NO devuelve el deleted. `search_kb({subtype:'catpaw', status:'deprecated'})` SÍ. `get_kb_entry(id)` devuelve el archivo deprecated.

### D9. Ubicación del código nuevo

- **Helper `markStale(path, reason)`:** nuevo módulo `app/src/lib/services/kb-audit.ts` o extender `knowledge-sync.ts` con este export. Planner decide según tamaño — si es <50 líneas, dentro de knowledge-sync; si crece, módulo dedicado. Preferencia: módulo dedicado porque Phase 155 cleanup lo consumirá independientemente.
- **Hooks en tools:** edits in-place en `catbot-tools.ts` (~8 cases).
- **Hooks en API routes:** edits in-place en `app/src/app/api/*/route.ts` y `*/[id]/route.ts` (verificar cada file).
- **Tests nuevos:** `app/src/lib/__tests__/kb-hooks-tools.test.ts` (tools-side) + `app/src/lib/__tests__/kb-hooks-api-routes.test.ts` (routes-side) — separación porque son superficies distintas con fixtures/mocks distintos.

### D10. Requirement IDs a registrar (Plan 01 Task 1)

- **KB-19:** Tools de CatBot que crean/actualizan/eliminan recursos (8 cases existentes) llaman `syncResource` al final exitoso. Failure mode: DB persiste, ERROR loguead, `_audit_stale.md` actualizado, cache KB invalidado.
- **KB-20:** API routes Next.js (POST/PATCH/DELETE a `/api/cat-paws`, `/api/catbrains`, `/api/connectors`, `/api/skills`, `/api/email-templates`) llaman `syncResource` tras DB write. Misma política de fallo.
- **KB-21:** Tools/routes de delete llaman `markDeprecated()` — nunca `fs.unlink()`. Archivos deprecated persisten hasta Phase 155.
- **KB-22:** Helper `markStale(path, reason)` expuesto desde módulo dedicado (preferencia `kb-audit.ts`). Genera entries en `_audit_stale.md` con shape compatible con `kb-sync.cjs --audit-stale` (Phase 149).

### Claude's Discretion

- Ubicación exacta de `markStale` helper (módulo dedicado vs dentro de knowledge-sync) — preferencia módulo.
- Estructura interna de tests (1 archivo grande vs split por entity) — el planner decide según tamaño final.
- Si usar `logger.error(...)` (si existe en el proyecto) o `console.error` — seguir convención del repo. Buscar primero el logger con `grep -rln "logger\." app/src/lib/services/knowledge-sync.ts`.
- Exit strategy si route existe pero planner no puede verificarla en codebase (route de update_catbrain no confirmado): **scope down** — no añadir hook hasta confirmar que el route existe.
- Mensaje exacto del ERROR log — estilo consistente con Phase 149/150.
- Si añadir Observability metric (counter de sync-failed) — deferred, no critical para esta fase.

</decisions>

<specifics>
## Specific Ideas

### Shape del `_audit_stale.md` entry tras fallo

Phase 149 ya define el archivo. Phase 153 añade entries así:

```yaml
---
entries:
  - path: resources/catpaws/abc12345-nombre-slug.md
    detected_at: 2026-04-20T12:34:56Z
    reason: create-sync-failed
    error: "ENOSPC: no space left on device"
    entity: cat_paws
    db_id: abc12345-uuid-completo
    retry_hint: "Run kb-sync.cjs --full-rebuild --source db"
  - path: resources/connectors/xyz98765-...
    detected_at: ...
    reason: update-sync-failed
    ...
---

# Audit Stale

Entradas marcadas para reconciliación manual. Generadas automáticamente por hooks de Phase 153 cuando syncResource falla. Corre `kb-sync.cjs --audit-stale` para el reporte legible. Corre `kb-sync.cjs --full-rebuild --source db` para reconciliar.
```

### Secuencia canónica de un hook exitoso (create_cat_paw)

1. CatBot recibe `{"message": "Crea un CatPaw Tester"}` → invoca `create_cat_paw`.
2. `executeTool` entra en case `create_cat_paw`.
3. `INSERT INTO cat_paws ...` exitoso (DB update).
4. `SELECT * FROM cat_paws WHERE id = ?` devuelve row completa.
5. `await syncResource('catpaw', 'create', row, {author: 'catbot'})`:
   - Genera archivo `resources/catpaws/<id8>-tester.md` con frontmatter + body.
   - `_index.json` actualizado con entry nueva.
   - `_header.md` conteo de catpaws incrementado.
6. `invalidateKbIndex()` → cache in-memory se limpia.
7. Response tool: `{id, name, mode, department, ..., kb_entry: 'resources/catpaws/<id8>-tester.md'}`.
8. CatBot responde al user con link al KB entry + Navigate action.

Si cualquier paso 3-5 falla, el hook NO interfiere con pasos previos que ya tuvieron éxito.

### Integración con Phase 152 cache

`invalidateKbIndex()` ya exportado por `app/src/lib/services/kb-index-cache.ts` (Phase 152). Los hooks lo importan y llaman tras success. La siguiente `list_cat_paws` o `search_kb` llamará `getKbIndex()` con cache miss → re-lee `_index.json` (ahora actualizado por `syncResource`).

Esto significa que Phase 153 cierra el ciclo de retroalimentación:

```
Create CatPaw → DB write → syncResource → KB file created →
  invalidateKbIndex → next list_cat_paws sees kb_entry populated →
  CatBot puede inmediatamente hacer get_kb_entry sobre el nuevo recurso
```

Phase 152 expuso este gap (campo `kb_entry: null` para CatPaws recientes); Phase 153 lo cierra.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`app/src/lib/services/knowledge-sync.ts`** (Phase 149) — exports `syncResource(entity, op, row, context?)`, `touchAccess(path)`, `markDeprecated(path, row, author, reason)`, `detectBumpLevel(currentFile, newRow)`. Contratos estables, testeados (38/38).
- **`app/src/lib/services/kb-index-cache.ts`** (Phase 152) — exports `getKbIndex`, `invalidateKbIndex`, `resolveKbEntry`, `searchKb`, `getKbEntry`, `parseKbFile`. `invalidateKbIndex()` es la integración clave para hooks de 153.
- **`scripts/kb-sync-db-source.cjs`** (Phase 150) — sigue siendo reconciliation tool manual. Tras Phase 153, debería ser raramente necesario (solo tras failures).
- **`scripts/kb-sync.cjs`** — `--audit-stale` command ya lee `_audit_stale.md` y genera reporte (Phase 149).
- **Test fixtures:** `app/src/lib/__tests__/kb-test-utils.ts` (Phase 152) + patrón `createFixtureDb` inline (Phase 150) — reusar para tests de Phase 153.

### Established Patterns

- **Tool cases en `catbot-tools.ts`:** `case 'xxx': { db.prepare(...).run(...); return { name, result }; }`. Phase 153 wrap puntual tras el `.run()`.
- **API routes Next.js:** handler async → validación body → db.prepare → response JSON. Phase 153 inserta hook entre db.prepare success y response.
- **Logger:** verificar en codebase. Probablemente `logger.info('scope', 'message', {meta})` — seguir convención.
- **Graceful failure intra-catch:** Phase 152 ya establece pattern `try { sections.push(...) } catch { /* graceful */ }`. Phase 153 aplica mismo patrón a `try { syncResource... } catch { markStale... }`.

### Integration Points

- **catbot-tools.ts L1610-3152** — 8 cases identificados que son target de hook. Planner verifica con grep que no haya más (ej. canvas_* o bulk operations).
- **app/src/app/api/*/route.ts y [id]/route.ts** — handlers POST/PATCH/DELETE. Planner enumera todos los exports async y evalúa cuáles tocan DB entities con subtipos KB.
- **Middleware de auth** (si existe) — para `author` attribution. `grep -rln "getServerSession\|auth()" app/src/app/api/ | head -5` identifica si hay auth global.
- **`_audit_stale.md`** existente (Phase 149) — Phase 153 escribe entries. `scripts/kb-sync.cjs --audit-stale` las lee.

### DB Schema (no se modifica)

Phase 153 es read+derivative — DB permanece intacta. Hooks solo leen post-write.

</code_context>

<deferred>
## Deferred Ideas

- **Crear tools inexistentes** (`update_catbrain`, `delete_cat_paw`, `update_connector`, `delete_connector`, `create_skill`, `update_skill`, `delete_skill`, `update_*`/`delete_*` del resto) — features propias, no scope de 153.
- **Canvas CRUD tools** — gestionados vía `canvas_executor.ts` con flujo distinto. Cuando existan tools de canvas create/update/delete, añadir hooks (future phase).
- **Sync transaccional / DB rollback on KB fail** — explícitamente rechazado por filosofía DB-wins (§D3).
- **Sync bidireccional KB → DB** — nunca. KB es derivado.
- **Observability metrics** (sync-failed counter, p99 latency, etc.) — útil pero no crítico para 153. Futura fase de observability.
- **Webhook/event-driven sync** (en lugar de inline) — más complejo, no necesario a esta escala. Inline es simple y suficiente.
- **Retry automático en syncResource failure** — no. `_audit_stale.md` + CLI manual es suficiente. Automatic retry requiere queue infra.
- **`touchAccess` al servir `get_kb_entry` / `search_kb`** — actualizaría `access_count` en frontmatter. Útil para ranking futuro pero requiere writes en el read path (complica cache invalidation). Deferred — podría ser una fase dedicada si se quiere scoring por acceso.
- **Deprecación física de archivos tras N días** — ya cubierto por Phase 149 workflow 150d/170d/180d + CLI `--archive --confirm` / `--purge --confirm`. Phase 153 solo marca soft; el workflow de cleanup ya existe.
- **Prompt injection del event log** (que CatBot sepa "acabo de crear X") — out of scope; el campo `kb_entry` del return ya le da el handle.
- **Dashboard UI de stale entries** — Phase 154 (dashboard general) puede incluirlo.
- **Cleanup físico de legacy layer** — Phase 155.

</deferred>

---

*Phase: 153-kb-creation-tool-hooks*
*Context gathered: 2026-04-20 (decisiones delegadas por usuario, patrón consistente con Phases 150/152)*
