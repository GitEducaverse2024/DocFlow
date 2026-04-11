---
phase: 134-architect-data-layer-arch-data
plan: 03
type: execute
wave: 2
depends_on:
  - "134-01"
files_modified:
  - app/src/lib/services/canvas-flow-designer.ts
  - app/src/lib/__tests__/canvas-flow-designer.test.ts
  - app/src/lib/services/intent-job-executor.ts
autonomous: false
requirements:
  - ARCH-DATA-01
  - ARCH-DATA-04
  - ARCH-DATA-05
must_haves:
  truths:
    - "scanCanvasResources devuelve por cada CatPaw activo {paw_id, paw_name, paw_mode, tools_available[], skills[], best_for}"
    - "tools_available se construye a partir de cat_paw_connectors JOIN connectors mapeando cada connector_type a su lista de tools via getConnectorContracts()"
    - "scanCanvasResources devuelve por cada connector activo {connector_id, connector_name, connector_type, contracts: {...}}"
    - "scanCanvasResources devuelve top-3 canvas_similar filtrados por palabras del goal, forma {canvas_id, canvas_name, node_roles[], was_executed, note}"
    - "scanCanvasResources devuelve templates[] con {template_id, name, node_types[]} derivado de canvas_templates"
    - "El payload resultante fluye a runArchitectQALoop via scanResources(goal) wrapper sin cambiar la semántica del loop"
    - "Test unitario contra un mock DB shape-valida las 4 keys (catPaws, connectors, canvas_similar, templates)"
  artifacts:
    - path: "app/src/lib/services/canvas-flow-designer.ts"
      provides: "scanCanvasResources enriched"
      contains: "canvas_similar"
    - path: "app/src/lib/__tests__/canvas-flow-designer.test.ts"
      provides: "Tests actualizados + nuevos asserts para enrichment"
  key_links:
    - from: "app/src/lib/services/canvas-flow-designer.ts"
      to: "app/src/lib/services/canvas-connector-contracts.ts"
      via: "import { getConnectorContracts } from './canvas-connector-contracts'"
      pattern: "from\\s+['\"]\\./canvas-connector-contracts['\"]"
    - from: "scanCanvasResources"
      to: "runArchitectQALoop (intent-job-executor.ts:428)"
      via: "resources parameter → architectInputObj.resources → callLLM → persisted as architect_iter0"
      pattern: "resources"
---

<objective>
Reescribir `scanCanvasResources` en `canvas-flow-designer.ts` para producir el payload enriquecido que ARCH-DATA-01/04/05 exige: catPaws con tools_available por JOIN de cat_paw_connectors + skills + best_for; connectors con contracts importados de Plan 01; canvas_similar top-3 filtrado por goal keywords; templates desde canvas_templates. El consumidor `runArchitectQALoop` no cambia su API — el nuevo shape se propaga al LLM y queda reflejado en `intent_jobs.architect_iter0` (output del architect) + en un log line `architect_input` que emitimos antes de cada callLLM del architect.

Purpose: Phase 133 baseline mostró que el architect alucina agentIds slugs (`"consolidador-financiero"`) porque no ve la lista real de CatPaws con sus capacidades. Este plan cierra el gap.

Output:
- `scanCanvasResources(db, opts?: {goal?: string})` con nueva signature
- Nuevo shape de `CanvasResources`
- Tests actualizados + nuevos
- Verificación E2E vía `test-pipeline.mjs --case holded-q1` (checkpoint Task 4)
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/133-foundation-tooling-found/133-04-SUMMARY.md
@.planning/phases/133-foundation-tooling-found/133-VERIFICATION.md
@app/src/lib/services/canvas-flow-designer.ts
@app/src/lib/services/canvas-connector-contracts.ts

<interfaces>
<!-- Schema real de las tablas afectadas (extraído de app/src/lib/db.ts) -->

cat_paws (activa: is_active=1):
  id, name, description, mode (procesador|creador|...), system_prompt, is_active

cat_paw_connectors (junction):
  paw_id, connector_id, usage_hint, is_active, created_at
  -- JOIN: SELECT cn.id, cn.name, cn.type, cpc.usage_hint
  --       FROM cat_paw_connectors cpc LEFT JOIN connectors cn ON cn.id = cpc.connector_id
  --       WHERE cpc.paw_id = ? AND cpc.is_active = 1

cat_paw_skills (junction):
  paw_id, skill_id
  -- JOIN: SELECT s.id, s.name, s.description FROM cat_paw_skills cps
  --       JOIN skills s ON s.id = cps.skill_id WHERE cps.paw_id = ?

connectors:
  id, name, type (gmail|google_drive|mcp_server|email_template|smtp|http_api|n8n_webhook), config (JSON), is_active

canvases:
  id, name, description, flow_data (JSON), listen_mode, is_template, status, last_run_at, updated_at
  -- filtering: WHERE is_template = 0 AND (name LIKE %w% OR description LIKE %w%)
  -- was_executed: last_run_at IS NOT NULL

canvas_templates:
  id, name, description, emoji, category, mode, nodes (JSON array), edges (JSON), times_used

<!-- Import from Plan 01 (must already exist on disk when this plan runs): -->
From app/src/lib/services/canvas-connector-contracts.ts:
  export function getConnectorContracts(connectorType: string): ConnectorContract | null;
  export interface ConnectorContract { connector_type: string; contracts: Record<string, ConnectorAction>; }
  export interface ConnectorAction { required_fields: readonly string[]; optional_fields: readonly string[]; description: string; source_line_ref: string; }
</interfaces>

Current consumer (modificaciones mínimas en Task 3):
@app/src/lib/services/intent-job-executor.ts líneas 410-450 — `runArchitectQALoop` pasa `resources` dentro de `architectInputObj`. El nuevo shape se propaga sin cambiar la lógica del loop.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Reescribir scanCanvasResources con catPaws enriched + connectors con contracts (ARCH-DATA-01/02)</name>
  <files>
    app/src/lib/services/canvas-flow-designer.ts
    app/src/lib/__tests__/canvas-flow-designer.test.ts
  </files>
  <behavior>
    - Test 1: con mock DB que devuelve 1 catPaw + 1 cat_paw_connectors row (type=gmail) + 1 skill row, el resultado `catPaws[0]` tiene `{paw_id, paw_name, paw_mode, tools_available, skills, best_for}`.
    - Test 2: `tools_available` contiene los action names de gmail ('send_report', 'send_reply', 'mark_read', 'forward') derivados de `getConnectorContracts('gmail')`.
    - Test 3: `skills` es un array de {id, name, description}.
    - Test 4: `best_for` es un string derivado de description + mode (fallback "uso general" si falta description).
    - Test 5: con mock que devuelve 2 connectors (gmail, google_drive), `connectors[]` tiene shape `{connector_id, connector_name, connector_type, contracts}` donde `contracts` = resultado de `getConnectorContracts(connector_type).contracts`.
    - Test 6: connector con type desconocido (ej 'foobar') devuelve `contracts: {}` en vez de romper.
    - Test 7: retrocompat — se ACTUALIZAN los 3 tests viejos de scanCanvasResources al nuevo shape; ya no existen keys `catBrains/skills` top-level (los skills van embedded en cada paw).
    - Test 8: per-table try/catch sigue funcionando — si `cat_paws` query throws, `catPaws: []` y el resto del resultado sigue poblándose.
  </behavior>
  <action>
    1. Importar al top de `canvas-flow-designer.ts`:
       ```typescript
       import { getConnectorContracts } from './canvas-connector-contracts';
       ```

    2. Reemplazar el `CanvasResources` interface:
       ```typescript
       export interface CanvasResources {
         catPaws: Array<{
           paw_id: string;
           paw_name: string;
           paw_mode: string;
           tools_available: string[];  // flat list: todos los action names de todos los connectors asociados
           skills: Array<{ id: string; name: string; description: string }>;
           best_for: string;
         }>;
         connectors: Array<{
           connector_id: string;
           connector_name: string;
           connector_type: string;
           contracts: Record<string, { required_fields: readonly string[]; optional_fields: readonly string[]; description: string }>;
         }>;
         canvas_similar: Array<{
           canvas_id: string;
           canvas_name: string;
           node_roles: string[];
           was_executed: boolean;
           note: string;
         }>;
         templates: Array<{
           template_id: string;
           name: string;
           mode: string;
           node_types: string[];
         }>;
       }
       ```

    3. Reescribir `scanCanvasResources(db: DbLike, opts?: { goal?: string }): CanvasResources`:

       - Query catPaws: `SELECT id, name, mode, description FROM cat_paws WHERE is_active = 1 LIMIT 50`.
       - Para cada paw, sub-query (con try/catch):
         - connectors del paw: `SELECT cn.id, cn.type FROM cat_paw_connectors cpc LEFT JOIN connectors cn ON cn.id = cpc.connector_id WHERE cpc.paw_id = ? AND cpc.is_active = 1`. Para cada connector result, llamar `getConnectorContracts(row.type)` y extraer `Object.keys(contract.contracts)` → añadir a `tools_available`.
         - skills del paw: `SELECT s.id, s.name, s.description FROM cat_paw_skills cps JOIN skills s ON s.id = cps.skill_id WHERE cps.paw_id = ?`.
       - `best_for`: `${paw.description ?? 'uso general'} (${paw.mode ?? 'procesador'})` truncado a 200 chars.
       - Build final `catPaws[]` con shape declarado arriba.

       - Query connectors: `SELECT id, name, type FROM connectors WHERE is_active = 1 LIMIT 50`.
       - Para cada connector, `const contractObj = getConnectorContracts(row.type); contracts = contractObj?.contracts ?? {}`. Simplificar cada action a `{required_fields, optional_fields, description}` (drop `source_line_ref` para reducir tokens del prompt).

       - Dejar `canvas_similar: []` y `templates: []` por ahora (Task 2 los rellena). Los 4 keys deben existir siempre.

    4. Actualizar los 3 tests existentes de `scanCanvasResources` en `canvas-flow-designer.test.ts` al nuevo shape (verificar las 4 keys nuevas, LIMIT 50 en queries, throw per-table).

    5. Añadir los 8 tests nuevos listados en <behavior>. Usar un mock DB que route por SQL substring matching:
       ```typescript
       const mkDb = (responses: Record<string, unknown[]>) => ({
         prepare: (sql: string) => ({
           all: (...params: unknown[]) => {
             for (const [key, rows] of Object.entries(responses)) {
               if (sql.includes(key)) return rows;
             }
             return [];
           },
         }),
       });
       ```
  </action>
  <verify>
    <automated>cd app && npx vitest run src/lib/__tests__/canvas-flow-designer.test.ts</automated>
  </verify>
  <done>
    Los tests (3 reescritos + 8 nuevos = 11) pasan. `CanvasResources` interface publica las 4 keys. `validateFlowData` y `insertSideEffectGuards` no se tocan (siguen verdes).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Añadir canvas_similar (top-3 por goal) + templates (ARCH-DATA-04/05)</name>
  <files>
    app/src/lib/services/canvas-flow-designer.ts
    app/src/lib/__tests__/canvas-flow-designer.test.ts
  </files>
  <behavior>
    - Test 1: con `opts.goal = 'facturación Q1 Holded'` y un mock que devuelve 5 canvases con nombres variados, el resultado `canvas_similar` tiene longitud ≤ 3.
    - Test 2: canvas_similar ordena por número de matches de keyword (más matches primero).
    - Test 3: sin `opts.goal`, `canvas_similar` devuelve array vacío (sin goal no hay similaridad).
    - Test 4: `canvas_similar[i]` tiene shape `{canvas_id, canvas_name, node_roles, was_executed, note}`. `node_roles` se deriva parseando `flow_data.nodes[].type` (no `data.role` — ese lo declara Phase 135).
    - Test 5: `was_executed` = `last_run_at != null` del row de canvases.
    - Test 6: `templates` devuelve items con `{template_id, name, mode, node_types}` donde `node_types` es `JSON.parse(nodes).map(n => n.type)` dedupado.
    - Test 7: query canvases usa `WHERE is_template = 0`.
    - Test 8: keyword extraction del goal: strip stopwords + tokens ≥ 3 chars.
  </behavior>
  <action>
    1. Añadir helper privado `extractKeywords(goal: string): string[]`:
       - Lowercase, split por `[\s,.:;!?()"']+`, filtrar stopwords + tokens < 3 chars. Stopwords:
         `['de','del','la','el','los','las','y','en','para','a','con','vs','un','una','por','que','al','es','se','lo','su','o','the','of','and','to','in','for','on']`
       - q1/q2 NO se excluyen — son keywords útiles.

    2. Query canvases para canvas_similar:
       ```sql
       SELECT id, name, description, flow_data, last_run_at
       FROM canvases
       WHERE is_template = 0 AND status != 'archived'
       ORDER BY updated_at DESC
       LIMIT 50
       ```
       En código, para cada row computar `matchCount = keywords.filter(k => (row.name+row.description).toLowerCase().includes(k)).length`. Ordenar descending, filtrar `matchCount > 0`, tomar top 3.

       Para cada row top-3:
       - `node_roles`: `try { JSON.parse(row.flow_data).nodes.map(n => n.type) } catch { [] }` dedupado, cap 20.
       - `was_executed`: `row.last_run_at != null && row.last_run_at !== ''`.
       - `note`: `${row.description?.slice(0, 100) ?? ''}`.

       Si `opts.goal` está vacío o undefined → `canvas_similar: []`.

    3. Query templates:
       ```sql
       SELECT id, name, mode, nodes FROM canvas_templates ORDER BY times_used DESC LIMIT 20
       ```
       Para cada row: `node_types = try { [...new Set(JSON.parse(row.nodes).map(n => n.type))] } catch { [] }`. Shape: `{template_id: row.id, name: row.name, mode: row.mode, node_types}`.

    4. Tests: 8 tests listados en <behavior>. Mismo mock DB con SQL substring routing de Task 1.

    5. Cap sanity: si JSON.stringify del resultado > 30KB, `logger.warn` (no truncar — Phase 135 ajusta si necesita).
  </action>
  <verify>
    <automated>cd app && npx vitest run src/lib/__tests__/canvas-flow-designer.test.ts</automated>
  </verify>
  <done>
    Los 8 tests nuevos de Task 2 pasan (además de los 11 de Task 1). `scanCanvasResources` devuelve shape completo con 4 keys.
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire scanResources(goal) + emitir log architect_input</name>
  <files>
    app/src/lib/services/intent-job-executor.ts
    app/src/lib/__tests__/intent-job-executor.test.ts
  </files>
  <action>
    1. Cambiar `scanResources` en intent-job-executor.ts para aceptar `goal`:
       ```typescript
       private static scanResources(goal?: string): CanvasResources {
         return scanCanvasResources(db, { goal });
       }
       ```

    2. Actualizar los 2 call sites (líneas ~347 y ~386) a `this.scanResources(typeof goal === 'string' ? goal : undefined)` y `this.scanResources(typeof prev.goal === 'string' ? prev.goal : undefined)`.

    3. Añadir dentro del loop de `runArchitectQALoop`, justo antes de cada `callLLM(architectSystem, ...)`:
       ```typescript
       logger.info('intent-job-executor', 'architect_input', {
         jobId: job.id,
         iteration: iter,
         resources_summary: {
           catPaws: resources.catPaws.length,
           connectors: resources.connectors.length,
           canvas_similar: resources.canvas_similar.length,
           templates: resources.templates.length,
           has_gmail_contracts: resources.connectors.some(c =>
             c.connector_type === 'gmail' && Object.keys(c.contracts).length > 0
           ),
         },
       });
       ```
       Este log es el audit oracle del Task 4 checkpoint: permite ver desde docker logs que el payload enriquecido llegó al architect sin persistir el input completo (out-of-scope añadir nueva columna).

    4. NO cambiar la semántica del loop más allá de esto. Los tests existentes deben seguir verdes (los mocks ya proveen un resources mínimo, que ahora solo tendrá un shape distinto pero funcional).

    5. Si algún test existente rompe porque mockea `scanCanvasResources` con el shape viejo, actualizar el mock al shape nuevo (catPaws: [], connectors: [], canvas_similar: [], templates: []) — 4 keys vacías bastan para que el loop corra.
  </action>
  <verify>
    <automated>cd app && npx vitest run src/lib/__tests__/intent-job-executor.test.ts</automated>
  </verify>
  <done>
    Los tests de intent-job-executor siguen verdes (con mocks actualizados si hace falta). `scanCanvasResources(db, {goal})` fluye desde el pipeline real. `logger.info('architect_input', ...)` emerge en cada iteración del architect.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Checkpoint — E2E audit vía test-pipeline.mjs --case holded-q1</name>
  <files>app/scripts/test-pipeline.mjs (solo lectura — no se modifica)</files>
  <action>
    Ejecutar el gate tooling de Phase 133 contra el caso canónico Holded Q1 y verificar que (a) el log `architect_input` muestra el payload enriquecido y (b) el architect ya no fabrica agentId slugs. Este checkpoint es la evidencia formal del éxito de Plan 03 contra LiteLLM real.
  </action>
  <what-built>
    scanCanvasResources reescrito con payload enriquecido (catPaws con tools_available + skills + best_for; connectors con contracts; canvas_similar top-3 por goal; templates). Payload fluye al LLM architect via runArchitectQALoop sin cambiar la lógica del loop. Log line `architect_input` emitido con summary del shape.
  </what-built>
  <how-to-verify>
    1. Rebuild docker para que los cambios apliquen:
       ```
       cd ~/docflow && docker compose build --no-cache && docker compose up -d && docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && docker restart docflow-app
       ```

    2. Ejecutar el gate tooling contra el caso canónico:
       ```
       node app/scripts/test-pipeline.mjs --case holded-q1
       ```

    3. Inspeccionar stdout — debe imprimir architect_iter0 como JSON válido; el pipeline debe terminar en < 240s (budget Phase 133).

    4. Verificar vía docker logs que el payload enriquecido llegó al LLM:
       ```
       docker logs docflow-app 2>&1 | grep 'architect_input' | tail -5
       ```
       Expected: `catPaws: N>0`, `connectors: M>0`, `has_gmail_contracts: true`, `templates: >= 1`.

    5. Verificar que el architect YA NO fabrica agentId slugs para el baseline:
       ```
       node -e "const db=require('better-sqlite3')('app/data/catbot.db'); const row=db.prepare(\"SELECT architect_iter0 FROM intent_jobs WHERE architect_iter0 IS NOT NULL ORDER BY created_at DESC LIMIT 1\").get(); const design=JSON.parse(row.architect_iter0); console.log(JSON.stringify((design.flow_data?.nodes ?? []).map(n=>({id:n.id,type:n.type,agentId:n.data?.agentId})), null, 2));"
       ```
       PASS si todos los `agentId` son UUIDs válidos o `null`; FAIL si aparece un slug `consolidador-*`, `data-interpreter-*`, o similar.

    6. Success criterion 1 de REQUIREMENTS.md ARCH-DATA-01: el payload persistido debe mostrar catPaws[] con {paw_id, paw_name, paw_mode, tools_available, skills, best_for}. La evidencia INPUT vive en el log `architect_input` (Task 3) — la evidencia OUTPUT vive en architect_iter0.
  </how-to-verify>
  <verify>
    <automated>docker logs docflow-app 2>&1 | grep -q 'architect_input' &amp;&amp; echo OK</automated>
  </verify>
  <done>
    Log `architect_input` con has_gmail_contracts:true visible en docker logs tras correr test-pipeline.mjs. architect_iter0 NO contiene agentId slugs fabricados (solo UUIDs reales o null).
  </done>
  <resume-signal>Type "approved" si el architect_input log muestra el shape enriquecido Y architect_iter0 no contiene slugs fabricados; describe el gap específico si algo falta.</resume-signal>
</task>

</tasks>

<verification>
- `npx vitest run src/lib/__tests__/canvas-flow-designer.test.ts` verde (19 tests: 11 de Task 1 + 8 de Task 2).
- `npx vitest run src/lib/__tests__/intent-job-executor.test.ts` verde (no regresión).
- `node app/scripts/test-pipeline.mjs --case holded-q1` termina en < 240s.
- `docker logs docflow-app 2>&1 | grep architect_input` muestra el log line con has_gmail_contracts: true.
</verification>

<success_criteria>
- [ ] `CanvasResources` interface actualizada con 4 keys (catPaws enriched, connectors con contracts, canvas_similar, templates)
- [ ] Cada catPaw tiene {paw_id, paw_name, paw_mode, tools_available[], skills[], best_for}
- [ ] tools_available construido via JOIN cat_paw_connectors → getConnectorContracts(type).contracts keys
- [ ] Cada connector tiene {connector_id, connector_name, connector_type, contracts}
- [ ] canvas_similar top-3 filtrado por keywords del goal
- [ ] templates poblado desde canvas_templates con node_types
- [ ] Tests de canvas-flow-designer verdes (19 total)
- [ ] Tests de intent-job-executor verdes (sin regresión)
- [ ] Log `architect_input` visible en docker logs tras correr test-pipeline.mjs
- [ ] Baseline signal: architect_iter0 del baseline NO contiene agentId slugs fabricados como `consolidador-financiero`
</success_criteria>

<output>
Crear `.planning/phases/134-architect-data-layer-arch-data/134-03-SUMMARY.md`
</output>