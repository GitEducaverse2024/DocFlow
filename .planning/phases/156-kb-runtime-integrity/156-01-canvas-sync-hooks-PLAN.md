---
phase: 156-kb-runtime-integrity
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [KB-40, KB-41]
files_modified:
  - app/src/app/api/canvas/route.ts
  - app/src/app/api/canvas/[id]/route.ts
  - app/src/lib/services/catbot-sudo-tools.ts
  - app/src/lib/__tests__/canvas-api-kb-sync.test.ts
  - app/src/lib/__tests__/catbot-sudo-delete-catflow.test.ts
must_haves:
  truths:
    - "POST /api/canvas crea un canvas y el archivo .docflow-kb/resources/canvases/<id8>-<slug>.md aparece con status: active"
    - "PATCH /api/canvas/[id] sobre un canvas existente sube version (patch/minor) y añade entry al change_log"
    - "DELETE /api/canvas/[id] deja el archivo KB con status: deprecated (nunca fs.unlink)"
    - "delete_catflow sudo tool con confirmed:true produce soft-delete (status: deprecated, deprecated_by: catbot-sudo:delete_catflow)"
    - "Si syncResource falla, HTTP responde 201/200 igual, se registra markStale en _sync_failures.md, y invalidateKbIndex NO se llama"
  artifacts:
    - path: "app/src/app/api/canvas/route.ts"
      provides: "POST hook que llama syncResource('canvas','create', row, hookCtx('api:canvas.POST'))"
      contains: "syncResource"
    - path: "app/src/app/api/canvas/[id]/route.ts"
      provides: "PATCH + DELETE hooks (update/delete) con try/catch + markStale"
      contains: "syncResource"
    - path: "app/src/lib/services/catbot-sudo-tools.ts"
      provides: "deleteCatFlow async con syncResource('canvas','delete',...) en vez de hard-DELETE solo"
      contains: "syncResource"
    - path: "app/src/lib/__tests__/canvas-api-kb-sync.test.ts"
      provides: "Tests RED→GREEN para POST/PATCH/DELETE + failure path + idempotence"
      min_lines: 250
    - path: "app/src/lib/__tests__/catbot-sudo-delete-catflow.test.ts"
      provides: "Tests RED→GREEN para soft-delete + CONFIRM_REQUIRED + AMBIGUOUS + purge opcional + failure path"
      min_lines: 180
  key_links:
    - from: "app/src/app/api/canvas/route.ts"
      to: "app/src/lib/services/knowledge-sync.ts"
      via: "import { syncResource } + await en POST tras INSERT"
      pattern: "syncResource\\('canvas',\\s*'create'"
    - from: "app/src/app/api/canvas/[id]/route.ts"
      to: "app/src/lib/services/knowledge-sync.ts"
      via: "await syncResource('canvas','update'|'delete', ...) en PATCH y DELETE"
      pattern: "syncResource\\('canvas',\\s*'(update|delete)'"
    - from: "app/src/lib/services/catbot-sudo-tools.ts"
      to: "app/src/lib/services/knowledge-sync.ts"
      via: "deleteCatFlow async llama syncResource tras DB DELETE"
      pattern: "syncResource\\('canvas',\\s*'delete'"
    - from: "hooks catch blocks"
      to: ".docflow-kb/_sync_failures.md"
      via: "markStale(path, reason, details)"
      pattern: "markStale\\("
---

<objective>
Cerrar los gaps KB-40 y KB-41: el write-path de canvas (POST/PATCH/DELETE de las rutas HTTP) y el sudo tool `delete_catflow` nunca han sincronizado con el KB. Tras este plan, crear/editar/borrar canvases (por UI, por `canvas_create` tool pass-through, o por sudo tool) produce el mismo ciclo de KB sync que ya tienen CatPaws, connectors, catbrains, skills y email-templates desde Phase 153.

Purpose: Completar la matriz de hooks de Phase 153 sobre la 6ª entidad (canvas) y migrar el sudo tool hard-DELETE al patrón soft-delete vía `markDeprecated`. Sin este plan, el dashboard `/knowledge` muestra canvases stale o inexistentes y CatBot no puede resolver `kb_entry` para canvases.

Output: 3 archivos productivos modificados + 2 archivos de test nuevos. Tests RED-first en Wave 0; implementación GREEN en Wave 1. Patrón byte-idéntico al gold standard de `/api/cat-paws/*` (RESEARCH §B.1).
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/156-kb-runtime-integrity/156-RESEARCH.md
@.planning/phases/156-kb-runtime-integrity/156-VALIDATION.md

# Código productivo a modificar
@app/src/app/api/canvas/route.ts
@app/src/app/api/canvas/[id]/route.ts
@app/src/lib/services/catbot-sudo-tools.ts

# Patrón de referencia (mirror byte-identical) — RESEARCH §B.1
@app/src/app/api/cat-paws/route.ts
@app/src/app/api/cat-paws/[id]/route.ts

# Contratos frozen que hay que consumir (no reinventar) — RESEARCH §C, §K
@app/src/lib/services/knowledge-sync.ts
@app/src/lib/services/kb-hook-helpers.ts
@app/src/lib/services/kb-audit.ts
@app/src/lib/services/kb-index-cache.ts

# Convención de tests (Phase 153)
@app/src/lib/__tests__/kb-hooks-api-routes.test.ts
@app/src/lib/__tests__/kb-hooks-tools.test.ts
@app/src/lib/__tests__/kb-test-utils.ts

<interfaces>
<!-- Frozen API surface consumida por este plan. NO reinventar. Extracted from RESEARCH §C. -->

From app/src/lib/services/knowledge-sync.ts:
```typescript
export type Entity = 'catpaw' | 'connector' | 'catbrain' | 'template' | 'skill' | 'canvas';
export type Op = 'create' | 'update' | 'delete' | 'access';
export interface SyncContext { author?: string; kbRoot?: string; reason?: string; superseded_by?: string; }
export async function syncResource(
  entity: Entity,
  op: Op,
  row: DBRow | { id: string },
  context?: SyncContext,
): Promise<void>;
```

From app/src/lib/services/kb-hook-helpers.ts:
```typescript
export function hookCtx(author: string, extras?: { reason?: string }): { author: string; kbRoot?: string; reason?: string };
export function hookSlug(name: string): string;  // byte-identical a slugify() interno
```

From app/src/lib/services/kb-audit.ts:
```typescript
type StaleReason = 'create-sync-failed' | 'update-sync-failed' | 'delete-sync-failed' | 'markDeprecated-failed';
interface StaleEntry { entity: string; db_id: string; error: string; }
export function markStale(kbRelPath: string, reason: StaleReason, details?: StaleEntry): void;  // never throws
```

From app/src/lib/services/kb-index-cache.ts:
```typescript
export function invalidateKbIndex(): void;  // NUNCA llamar en el catch block
```
</interfaces>

<reference_pattern>
<!-- Patrón canónico a mirror-ar byte-identical — RESEARCH §B.1 app/src/app/api/cat-paws/*. -->

POST hook (tras INSERT, tras SELECT-back, antes del return):
```ts
const row = db.prepare('SELECT * FROM cat_paws WHERE id = ?').get(id) as Record<string, unknown> & { id: string };
try {
  await syncResource('catpaw', 'create', row, hookCtx('api:cat-paws.POST'));
  invalidateKbIndex();
} catch (err) {
  const errMsg = (err as Error).message;
  logger.error('kb-sync', 'syncResource failed on POST /api/cat-paws', { entity: 'catpaw', id, err: errMsg });
  markStale(
    `resources/catpaws/${id.slice(0, 8)}-${hookSlug(String(body.name))}.md`,
    'create-sync-failed',
    { entity: 'cat_paws', db_id: id, error: errMsg },
  );
}
```

Entity/subdir map relevante para este plan:
- `Entity` arg = `'canvas'` (singular). DB table name = `'canvases'` (plural — usado solo en markStale details.entity).
- KB subdir = `resources/canvases/`.
- slugify(id8) = `id.slice(0,8)` + `-` + `hookSlug(name)`.
</reference_pattern>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 (Wave 0 RED): Crear canvas-api-kb-sync.test.ts + catbot-sudo-delete-catflow.test.ts con stubs rojos</name>
  <files>app/src/lib/__tests__/canvas-api-kb-sync.test.ts, app/src/lib/__tests__/catbot-sudo-delete-catflow.test.ts</files>
  <behavior>
    canvas-api-kb-sync.test.ts — 5 tests (todos RED inicialmente):
    - T1 "POST /api/canvas fires syncResource('canvas','create') with author api:canvas.POST": POST con body {name:"Test Canvas"} → res.status === 201, syncSpy.toHaveBeenCalledWith('canvas','create', objectContaining({id, name:'Test Canvas'}), objectContaining({author:'api:canvas.POST'})), findKbFile(kbRoot,'canvases',id) devuelve path no-null.
    - T2 "PATCH /api/canvas/[id] fires syncResource('canvas','update') with version bump": crear canvas, PATCH name, syncSpy llamado con 'update', author 'api:canvas.PATCH', segundo PATCH idéntico (isNoopUpdate) → 0 nuevas llamadas a syncResource O bump no-op.
    - T3 "DELETE /api/canvas/[id] fires syncResource('canvas','delete') + file keeps status: deprecated": DELETE, syncSpy llamado con 'delete' y {id}, después el .md existe con /^status: deprecated/m match.
    - T4 "failure path: syncResource throws → HTTP still 201, markStale fires, invalidateKbIndex NOT called": vi.spyOn(syncResource).mockRejectedValueOnce(new Error('sync boom')), POST → res.status === 201, markStaleSpy llamado con reason 'create-sync-failed', invalidateSpy NOT called.
    - T5 "idempotence: second POST with same body": solo si la route soporta idempotence; si no, omitir este test. Realmente: "segundo PATCH idéntico tras el primero NO sube version" via isNoopUpdate. Reutilizar T2.

    catbot-sudo-delete-catflow.test.ts — 5 tests (todos RED inicialmente):
    - T1 "soft-delete with confirmed:true": deleteCatFlow({identifier:canvas.id, confirmed:true}) → result.status === 'DELETED', DB row ausente, KB file existe con /^status: deprecated/m, /^deprecated_by: catbot-sudo:delete_catflow/m, syncSpy llamado con 'delete' + author 'catbot-sudo:delete_catflow', markStaleSpy NOT called.
    - T2 "confirmed:false returns CONFIRM_REQUIRED": status 'CONFIRM_REQUIRED', DB row intacta, no syncResource call.
    - T3 "AMBIGUOUS identifier": 2 canvases con mismo prefix → status 'AMBIGUOUS', sin delete, sin syncResource.
    - T4 "purge:true hard-delete path": deleteCatFlow({identifier, confirmed:true, purge:true}) → DB DELETE + syncResource NOT called. (Por defecto sin purge = soft).
    - T5 "failure path: syncResource throws": mockRejectedValueOnce → DB row aun borrada (hard-delete ganó), result.status === 'DELETED', markStaleSpy llamado con reason 'delete-sync-failed' y details.entity === 'canvases'.

    Fixture setup inline en CADA archivo (no shared helper — RESEARCH §P-Q2):
    - `createFixtureKb` import de kb-test-utils.ts.
    - ensureTables inline: CREATE TABLE canvases(id TEXT PRIMARY KEY, name TEXT, description TEXT, emoji TEXT, mode TEXT, status TEXT, thumbnail TEXT, tags TEXT, is_template INTEGER, node_count INTEGER, flow_data TEXT, listen_mode TEXT, created_at TEXT, updated_at TEXT); CREATE TABLE canvas_runs(id TEXT PRIMARY KEY, canvas_id TEXT).
    - Test DB: better-sqlite3 in-memory con path override via env, seguir patrón de kb-hooks-api-routes.test.ts L113-148.
  </behavior>
  <action>
    1. Leer `app/src/lib/__tests__/kb-hooks-api-routes.test.ts` completo y adoptar la misma estructura de setup (beforeEach kbRoot/tmpDir, afterEach cleanup, ensureTables helper inline, spy sobre el módulo knowledgeSync).

    2. Crear `app/src/lib/__tests__/canvas-api-kb-sync.test.ts` con los 5 tests descritos en `<behavior>`.
       - Import directo de `POST` desde `../../app/api/canvas/route` y `PATCH`/`DELETE` desde `../../app/api/canvas/[id]/route`.
       - NOTA: las rutas deben aceptar ser invocadas directamente (request stub). Mirror pattern de kb-hooks-api-routes.test.ts.
       - Al final del archivo helper `findKbFile(kbRoot, subdir, id)` que hace `fs.readdirSync(path.join(kbRoot,'resources',subdir)).find(f => f.startsWith(id.slice(0,8)))`.
       - No mockear knowledge-sync completo — usar vi.spyOn(knowledgeSyncModule, 'syncResource') y dejar la implementación real ejecutar (los tests validan el side effect en fs).

    3. Crear `app/src/lib/__tests__/catbot-sudo-delete-catflow.test.ts` con los 5 tests descritos.
       - Import `deleteCatFlow` via `executeSudoTool` dispatcher o directamente si está exportado — verificar en catbot-sudo-tools.ts si `deleteCatFlow` se exporta standalone o solo via dispatcher. Si no se exporta, importar el dispatcher (likely `executeSudoTool('delete_catflow', args)`).
       - Setup: seed una canvas en DB antes de cada test.

    4. Ejecutar `cd app && npx vitest run canvas-api-kb-sync.test.ts catbot-sudo-delete-catflow.test.ts --reporter=default` y CONFIRMAR que los tests fallan por la razón correcta (syncResource nunca es llamado, no por un import/setup error). Esto es el commit RED.

    5. Commit: `test(156-01): add RED tests for canvas API + delete_catflow KB sync hooks (KB-40, KB-41)`

    Restricciones CLAUDE.md:
    - Comunicación en español en el código/comentarios.
    - No tombstone comments ("// nunca se hookea" está OK como documentación; "// removed X" NO).
    - Los tests deben ser self-contained — no depender de fixtures externos fuera del tmpdir.
  </action>
  <verify>
    <automated>cd app && npx vitest run canvas-api-kb-sync.test.ts catbot-sudo-delete-catflow.test.ts 2>&1 | grep -E '(FAIL|Tests)' | head -20</automated>
  </verify>
  <done>
    Los 10 tests (5 en cada archivo) existen y fallan con mensajes del tipo "expected syncSpy to have been called" o "expected file to exist". No deben fallar por errores de import/setup/TypeScript — ese tipo de fallo bloquea Task 2. Commit `test(156-01): ...` creado. Task 2 puede empezar.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2 (Wave 1): Implementar canvas API hooks (POST + PATCH + DELETE) y verificar T1-T5 en canvas-api-kb-sync.test.ts GREEN</name>
  <files>app/src/app/api/canvas/route.ts, app/src/app/api/canvas/[id]/route.ts</files>
  <action>
    Modificar las 2 rutas canvas para mirror-ar el patrón de `/api/cat-paws/*` byte-identical (RESEARCH §B.1 + §N.1). NO cambiar signatures ni response shapes — `NextResponse.json({id, redirectUrl}, {status:201})` se mantiene intacto (RESEARCH §A.1 response shape invariant).

    === app/src/app/api/canvas/route.ts (POST) ===

    1. Añadir 4 imports al TOP del archivo (después de imports existentes):
       ```ts
       import { syncResource } from '@/lib/services/knowledge-sync';
       import { invalidateKbIndex } from '@/lib/services/kb-index-cache';
       import { markStale } from '@/lib/services/kb-audit';
       import { hookCtx, hookSlug } from '@/lib/services/kb-hook-helpers';
       ```

    2. En el handler POST, tras la línea `db.prepare('INSERT INTO canvases ...').run(...)` y ANTES del `return NextResponse.json({id, redirectUrl:...}, {status:201})`:
       ```ts
       const row = db.prepare('SELECT * FROM canvases WHERE id = ?').get(id) as Record<string, unknown> & { id: string; name: string };
       try {
         await syncResource('canvas', 'create', row, hookCtx('api:canvas.POST'));
         invalidateKbIndex();
       } catch (err) {
         const errMsg = (err as Error).message;
         logger.error('kb-sync', 'syncResource failed on POST /api/canvas', {
           entity: 'canvas', id, err: errMsg,
         });
         markStale(
           `resources/canvases/${id.slice(0, 8)}-${hookSlug(String(row.name))}.md`,
           'create-sync-failed',
           { entity: 'canvases', db_id: id, error: errMsg },
         );
       }
       ```

    === app/src/app/api/canvas/[id]/route.ts (PATCH + DELETE) ===

    3. Añadir los mismos 4 imports (syncResource, invalidateKbIndex, markStale, hookCtx, hookSlug).

    4. En PATCH: tras la línea `db.prepare(UPDATE).run(...)` (RESEARCH §A.2 L92) y DENTRO del bloque que ejecutó un cambio real (NO dentro del short-circuit `if (updates.length === 1) return ...` — ver Pitfall 4). Antes del `return NextResponse.json({success:true})`:
       ```ts
       const row = db.prepare('SELECT * FROM canvases WHERE id = ?').get(params.id) as Record<string, unknown> & { id: string; name: string };
       try {
         await syncResource('canvas', 'update', row, hookCtx('api:canvas.PATCH'));
         invalidateKbIndex();
       } catch (err) {
         const errMsg = (err as Error).message;
         logger.error('kb-sync', 'syncResource failed on PATCH /api/canvas/[id]', {
           entity: 'canvas', id: params.id, err: errMsg,
         });
         markStale(
           `resources/canvases/${params.id.slice(0, 8)}-${hookSlug(String(row.name))}.md`,
           'update-sync-failed',
           { entity: 'canvases', db_id: params.id, error: errMsg },
         );
       }
       ```

    5. En DELETE: CAMBIAR el pre-SELECT actual `SELECT id FROM canvases WHERE id = ?` a `SELECT id, name FROM canvases WHERE id = ?` (RESEARCH §A.3 — necesitamos el nombre para el path de markStale). Después de `db.prepare('DELETE FROM canvases WHERE id = ?').run(params.id)`:
       ```ts
       try {
         await syncResource('canvas', 'delete', { id: params.id }, hookCtx(
           'api:canvas.DELETE',
           { reason: `DB row deleted at ${new Date().toISOString()}` },
         ));
         invalidateKbIndex();
       } catch (err) {
         const errMsg = (err as Error).message;
         logger.error('kb-sync', 'syncResource failed on DELETE /api/canvas/[id]', {
           entity: 'canvas', id: params.id, err: errMsg,
         });
         markStale(
           `resources/canvases/${params.id.slice(0, 8)}-${hookSlug(String(canvas.name ?? ''))}.md`,
           'delete-sync-failed',
           { entity: 'canvases', db_id: params.id, error: errMsg },
         );
       }
       ```

       IMPORTANTE: NO añadir `fs.unlink` sobre el .md (RESEARCH §J anti-pattern). El soft-delete lo hace internamente `syncResource('canvas','delete',_)` vía `markDeprecated()`.

    6. Params shape: RESEARCH §A.2 documenta que `/api/canvas/[id]` usa la forma síncrona `{ params: { id: string } }` (no Promise-based). MANTENER así — no migrar a Promise para minimizar diff. Verificar que `params.id` es el acceso correcto antes de editar.

    7. Verificar que no quedan imports sin usar (puede matar el Docker build per MEMORY.md): `cd app && npx tsc --noEmit 2>&1 | grep 'app/api/canvas' | head -20` debe salir limpio.

    8. Correr tests RED → GREEN: `cd app && npx vitest run canvas-api-kb-sync.test.ts`. Los 5 tests deben pasar. Si alguno falla, iterar (NO modificar los tests — corregir el código productivo).

    9. Correr suite completa KB para no romper Phase 153: `cd app && npx vitest run kb-hooks-api-routes.test.ts kb-hooks-tools.test.ts kb-index-cache.test.ts`. Todos deben seguir verdes.

    10. Local Docker build verify (per MEMORY.md): `cd app && npm run build 2>&1 | tail -20`. No errors.

    11. Commit: `feat(156-01): wire canvas API POST/PATCH/DELETE to KB syncResource hooks (KB-40)`

    Restricciones CLAUDE.md / MEMORY.md:
    - `process['env']` bracket notation (no aplica aquí — no se leen env vars nuevas).
    - No tombstone comments.
    - Respect existing short-circuit at L87-90 (Pitfall 4) — hook tras el UPDATE real, no antes.
  </action>
  <verify>
    <automated>cd app && npx vitest run canvas-api-kb-sync.test.ts -t "POST" -t "PATCH" -t "DELETE" -t "failure"</automated>
  </verify>
  <done>
    Los 5 tests de canvas-api-kb-sync.test.ts pasan en verde. La suite Phase 153 (kb-hooks-api-routes.test.ts + kb-hooks-tools.test.ts) sigue verde. `npm run build` local exit 0. Commit `feat(156-01): wire canvas API ...` creado.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3 (Wave 1): Refactor delete_catflow sudo tool a soft-delete + verificar T1-T5 en catbot-sudo-delete-catflow.test.ts GREEN</name>
  <files>app/src/lib/services/catbot-sudo-tools.ts</files>
  <action>
    Migrar `deleteCatFlow` del patrón hard-DELETE a soft-delete vía `syncResource`. Siguiendo RESEARCH §A.4 + §B.2 + §N-equivalente.

    1. Leer `app/src/lib/services/catbot-sudo-tools.ts` L690-789 (región delete_catflow) + L1-50 (imports) + L240-260 (dispatcher).

    2. Añadir 5 imports al top del archivo (si no existen ya):
       ```ts
       import { syncResource } from './knowledge-sync';
       import { invalidateKbIndex } from './kb-index-cache';
       import { markStale } from './kb-audit';
       import { hookCtx, hookSlug } from './kb-hook-helpers';
       ```
       (Paths relativos porque el archivo está en `app/src/lib/services/`.)

    3. Cambiar signature: `function deleteCatFlow(args): ToolResult` → `async function deleteCatFlow(args): Promise<ToolResult>` (Pitfall 2).

    4. En el dispatcher (L249 aprox): `return deleteCatFlow(args)` → `return await deleteCatFlow(args)`. Si el dispatcher tiene signature sync, cambiarlo a `async` y await en todos los call sites upstream (probablemente solo el handler HTTP que llama executeSudoTool).

    5. Extender args type para aceptar optional `purge?: boolean`.

    6. DENTRO del bloque que antes era solo `db.prepare('DELETE FROM canvases WHERE id = ?').run(canvas.id)` (RESEARCH §A.4 L760):
       ```ts
       db.prepare('DELETE FROM canvases WHERE id = ?').run(canvas.id);

       if (args.purge === true) {
         // Hard-delete path: no KB sync, file se limpiará en el próximo --audit-stale ciclo.
         logger.info('catbot-sudo', 'delete_catflow purge path: KB file no syncado', { canvas_id: canvas.id });
       } else {
         try {
           await syncResource('canvas', 'delete', { id: canvas.id }, hookCtx(
             'catbot-sudo:delete_catflow',
             { reason: `canvas run count ${runCount} cascaded` },
           ));
           invalidateKbIndex();
         } catch (err) {
           const errMsg = (err as Error).message;
           logger.error('kb-sync', 'syncResource failed on delete_catflow', {
             entity: 'canvas', id: canvas.id, err: errMsg,
           });
           markStale(
             `resources/canvases/${canvas.id.slice(0, 8)}-${hookSlug(canvas.name)}.md`,
             'delete-sync-failed',
             { entity: 'canvases', db_id: canvas.id, error: errMsg },
           );
         }
       }
       ```

    7. La sudo session requirement (L696-734) se mantiene intacta. Solo cambia el flujo post-DELETE.

    8. Preservar el return shape existente: `{status: 'DELETED', deleted: {id, name, runs_cascaded: runCount}}`.

    9. Verificar TypeScript: `cd app && npx tsc --noEmit 2>&1 | grep 'catbot-sudo' | head -10`. Exit limpio.

    10. Correr tests: `cd app && npx vitest run catbot-sudo-delete-catflow.test.ts`. 5 tests verdes.

    11. Correr suite relacionada: `cd app && npx vitest run kb-hooks-tools.test.ts` — no regressions.

    12. Verificar que `catbot-tools.ts` NO necesita hook para `canvas_create` (pass-through via fetch a POST /api/canvas — ya lo cubre Task 2 + Pitfall 1 explicitly warns against double-hook).

    13. Local build: `cd app && npm run build 2>&1 | tail -20`. Exit 0.

    14. Commit: `feat(156-01): delete_catflow sudo tool uses soft-delete via syncResource (KB-41)`
  </action>
  <verify>
    <automated>cd app && npx vitest run catbot-sudo-delete-catflow.test.ts -t "soft-delete" -t "AMBIGUOUS" -t "purge"</automated>
  </verify>
  <done>
    Los 5 tests de catbot-sudo-delete-catflow.test.ts pasan. `deleteCatFlow` es async con rama soft-delete (por defecto) y rama purge-hard (opt-in con `purge:true`). Suite completa `cd app && npx vitest run` sigue verde (o al menos no regresiona tests pre-Plan-156). Commit creado.
  </done>
</task>

</tasks>

<verification>
Tras completar las 3 tasks:

1. **Automatizado:** `cd app && npx vitest run canvas-api-kb-sync.test.ts catbot-sudo-delete-catflow.test.ts` → 10/10 tests verdes.
2. **Suite KB completa:** `cd app && npx vitest run kb-hooks-api-routes.test.ts kb-hooks-tools.test.ts kb-index-cache.test.ts canvas-api-kb-sync.test.ts catbot-sudo-delete-catflow.test.ts` → no regresiones.
3. **Local build:** `cd app && npm run build` exit 0 (unused-import check es blocker per MEMORY.md).
4. **Grep invariante (Plan 156-02 no lo toca):** archivos modificados por este plan NO overlap con los de 156-02 (`knowledge-sync.ts`, `catbot-tools.ts`).
5. **CatBot oracle (diferido al close del phase, no este plan):** Prompts 1 y 2 de la batería de Phase 156 (§I del RESEARCH) — "Crea un canvas llamado Test156" + "Borra el canvas Test156" — producen archivo KB activo y luego deprecated. Esto se ejecuta en Plan 156-03 close o en el `/gsd:verify-phase` final.
</verification>

<success_criteria>
- [ ] `app/src/app/api/canvas/route.ts` POST llama `syncResource('canvas','create', row, hookCtx('api:canvas.POST'))` + `invalidateKbIndex()` en happy-path; `logger.error` + `markStale('create-sync-failed')` en catch.
- [ ] `app/src/app/api/canvas/[id]/route.ts` PATCH llama `syncResource('canvas','update', row, hookCtx('api:canvas.PATCH'))`; DELETE llama `syncResource('canvas','delete', {id}, hookCtx('api:canvas.DELETE', {reason:...}))`.
- [ ] `app/src/lib/services/catbot-sudo-tools.ts` `deleteCatFlow` es async, soft-delete por defecto, hard-delete via `purge:true`, mismo patrón try/catch + markStale.
- [ ] 2 test files existen, 10 tests pasan.
- [ ] Local `npm run build` exit 0 (no unused imports, no TS errors).
- [ ] 3 commits creados con prefijo `test(156-01)` y `feat(156-01)`.
- [ ] Plan 156-02 puede correr en paralelo (Wave 1) sin merge conflicts — files disjuntos.
</success_criteria>

<output>
After completion, create `.planning/phases/156-kb-runtime-integrity/156-01-SUMMARY.md` con:
- Tasks completadas (3/3), commits SHAs.
- Test results verbatim (10/10 green + suite pre-Phase-156 sin regresiones).
- Findings adicionales o decisiones tomadas (e.g., si hubo que cambiar el dispatcher sudo a async).
- Patrones consumidos (mirror byte-identical de `/api/cat-paws/*`).
- Deferred items: retention policy y orphan cleanup → Plan 156-03.
- Gaps abiertos (ninguno esperado — si aparecen se anotan para /gsd:verify-phase).
</output>
