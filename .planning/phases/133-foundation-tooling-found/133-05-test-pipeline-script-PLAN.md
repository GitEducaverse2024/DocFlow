---
phase: 133-foundation-tooling-found
plan: 05
type: execute
wave: 5
depends_on:
  - 133-04
files_modified:
  - app/scripts/test-pipeline.mjs
  - app/scripts/pipeline-cases/holded-q1.json
  - app/scripts/pipeline-cases/inbox-digest.json
  - app/scripts/pipeline-cases/drive-sync.json
  - app/scripts/README-test-pipeline.md
autonomous: false
requirements:
  - FOUND-08
  - FOUND-09
must_haves:
  truths:
    - "Ejecutar `node app/scripts/test-pipeline.mjs --case holded-q1` imprime flow_data + qa_report + outputs intermedios en stdout"
    - "El comando termina en < 60 segundos contra LiteLLM real para el caso holded-q1"
    - "Existen 3 fixtures: holded-q1.json, inbox-digest.json, drive-sync.json con original_request canonizado"
    - "El script acepta --case, --goal, --save-baseline, --diff"
    - "El script inserta un job sintético, invoca IntentJobExecutor.tick() directamente, polla hasta estado terminal, imprime resultados, y limpia el job"
  artifacts:
    - path: "app/scripts/test-pipeline.mjs"
      provides: "Gate tooling del pipeline async: ejecución end-to-end contra LiteLLM real con inspección de los 6 outputs intermedios persistidos por Plan 04"
      min_lines: 200
    - path: "app/scripts/pipeline-cases/holded-q1.json"
      provides: "Fixture canonizado para el caso de señal única del milestone v27.0"
      contains: "original_request"
    - path: "app/scripts/pipeline-cases/inbox-digest.json"
      provides: "Fixture para caso iterator"
      contains: "original_request"
    - path: "app/scripts/pipeline-cases/drive-sync.json"
      provides: "Fixture para caso R10 verdadero-positivo en transformer"
      contains: "original_request"
  key_links:
    - from: "test-pipeline.mjs insertJob"
      to: "intent_jobs table (synthetic row con tool_name='__description__')"
      via: "db.prepare INSERT directo a better-sqlite3"
      pattern: "INSERT INTO intent_jobs"
    - from: "test-pipeline.mjs tick loop"
      to: "IntentJobExecutor.tick()"
      via: "import dynamico del módulo compilado + poll hasta status terminal"
      pattern: "IntentJobExecutor\\.tick"
    - from: "test-pipeline.mjs output"
      to: "stdout con strategist_output, decomposer_output, architect_iter[01], qa_iter[01], flow_data final, qa_report final, tiempos, tokens estimados"
      via: "SELECT * FROM intent_jobs WHERE id=? tras terminal"
      pattern: "architect_iter0|qa_iter0"
---

<objective>
Crear el gate tooling de Phase 133: un script CLI que ejercita el pipeline async completo (strategist → decomposer → architect+QA loop) contra LiteLLM real en un único comando, reutilizando las defensas y persistencia de los plans 01-04. Este script ES el criterio de done de Phase 133 — cuando `node app/scripts/test-pipeline.mjs --case holded-q1` imprime los outputs intermedios en < 60s, la fase está completa.

**Sequence rule (MANDATORY):** Este plan es el ÚLTIMO de Phase 133. Si se implementa antes de que Plans 01-04 estén operativos, el script ejecuta el pipeline en estado incompleto (sin timeouts, sin reaper, sin persistencia, sin notificación de exhaustion) y sus resultados NO son válidos para validar Phase 134/135/136.

Purpose: Phase 134/135/136 necesitan poder ejercitar el pipeline fuera del ciclo Telegram/web, con fixtures reproducibles, inspeccionando los 6 outputs intermedios que Plan 04 persiste. Sin este script, cada ciclo de validación requiere un flujo manual Telegram+DB inspection que no escala.
Output: `app/scripts/test-pipeline.mjs` + 3 fixtures JSON en `app/scripts/pipeline-cases/` + un mini README con ejemplos.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@./CLAUDE.md
@.planning/phases/133-foundation-tooling-found/133-04-intermediate-outputs-persistence-PLAN.md

@app/src/lib/services/intent-job-executor.ts
@app/src/lib/intent-jobs.ts
@app/src/lib/db.ts
@app/scripts/rag-worker.mjs
@app/scripts/setup-inbound-canvas.mjs

<interfaces>
<!-- The script must consume the public-ish APIs already created by plans 01-04 -->

```ts
// From intent-job-executor.ts (static methods, invokable from mjs)
class IntentJobExecutor {
  static async tick(): Promise<void>; // picks up the next pending job and runs it
  // NOTE: if tick() is private, expose a test-mode entry point
  // static async runPipelineForJob(job: IntentJobRow): Promise<void>; // alternative
}

// From intent-jobs.ts
function queueIntentJob(params: { description: string; channel: string; ... }): string; // returns jobId
function getIntentJob(id: string): IntentJobRow | null;

// DB schema (post Plan 04):
intent_jobs (
  id TEXT PK, status TEXT, channel TEXT, tool_name TEXT, tool_args TEXT,
  created_at TEXT, updated_at TEXT, canvas_id TEXT, error TEXT,
  pipeline_phase TEXT, progressMessage TEXT,
  -- Plan 04 additions:
  strategist_output TEXT, decomposer_output TEXT,
  architect_iter0 TEXT, qa_iter0 TEXT, architect_iter1 TEXT, qa_iter1 TEXT
)
```

**Import strategy for .mjs:** Node ESM can import compiled TypeScript dist or the source via tsx/ts-node. Check how `rag-worker.mjs` handles this in this codebase and mirror the pattern. Most likely: the script imports from the `.next/standalone` output OR the script is actually run via `node --experimental-loader tsx` against the src. Inspect `rag-worker.mjs` first line and package.json scripts to determine the convention.

**Terminal statuses** (from the IntentJobRow state machine): `awaiting_user`, `awaiting_approval`, `completed`, `failed`. Any of these = stop polling.
</interfaces>

**Current state:**
- `app/scripts/` contains `rag-worker.mjs` and `setup-inbound-canvas.mjs` — use them as reference for import patterns, env loading, DB access.
- No `pipeline-cases/` folder yet.
- Fixtures must contain the `original_request` canonizado de cada caso (ver `.planning/MILESTONE-CONTEXT.md` PART 7 para holded-q1).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear los 3 fixtures pipeline-cases/*.json con original_request canonizado</name>
  <files>app/scripts/pipeline-cases/holded-q1.json, app/scripts/pipeline-cases/inbox-digest.json, app/scripts/pipeline-cases/drive-sync.json</files>
  <action>
1. Crear `app/scripts/pipeline-cases/holded-q1.json`:
   ```json
   {
     "case": "holded-q1",
     "description": "Caso canónico v27.0: comparativa facturación Q1 2026 vs Q1 2025 de Holded, maquetada con template corporativo y enviada a antonio+fen",
     "original_request": "Comparativa facturación Q1 2026 vs Q1 2025 de Holded, maquétala con el template corporativo y envíala a antonio@educa360.com y fen@educa360.com",
     "channel": "web",
     "expected_nodes": ["start", "agent", "connector"],
     "expected_roles": ["extractor", "transformer", "synthesizer", "renderer", "emitter"],
     "expected_emitter_connector_type": "gmail",
     "expected_emitter_accion": "send_report"
   }
   ```

2. Crear `app/scripts/pipeline-cases/inbox-digest.json`:
   ```json
   {
     "case": "inbox-digest",
     "description": "Caso iterator: leer inbox, procesar cada email con un agente, sintetizar digest y enviarlo",
     "original_request": "Dame un digest de los correos no leídos de hoy en mi Gmail: por cada uno, extrae asunto, remitente y resumen en 2 frases, y envíamelo todo junto al final.",
     "channel": "web",
     "expected_nodes": ["start", "iterator", "agent", "iterator_end", "connector"],
     "expected_has_iterator": true
   }
   ```

3. Crear `app/scripts/pipeline-cases/drive-sync.json`:
   ```json
   {
     "case": "drive-sync",
     "description": "Caso R10 verdadero-positivo: sincronizar documentos desde Drive preservando metadata, terminar en storage (emitter)",
     "original_request": "Sincroniza los documentos nuevos de la carpeta 'Proyectos/Activos' de Google Drive al sistema: para cada uno, extrae metadata (título, autor, fecha, tags), transforma a nuestro formato interno preservando TODOS los campos, y guárdalos en el storage.",
     "channel": "web",
     "expected_nodes": ["start", "connector", "iterator", "agent", "storage"],
     "expected_r10_transformer_applies": true
   }
   ```

4. Validar que los 3 JSON son parseables (cada uno debe hacer `JSON.parse` sin error).
  </action>
  <verify>
    <automated>node -e "['holded-q1','inbox-digest','drive-sync'].forEach(c=>{const j=require('./app/scripts/pipeline-cases/'+c+'.json'); if(!j.original_request)throw new Error(c)})"</automated>
  </verify>
  <done>
- 3 fixtures existen con `original_request` no-vacío
- JSON válido
  </done>
</task>

<task type="auto">
  <name>Task 2: Implementar test-pipeline.mjs con flags --case, --goal, --save-baseline, --diff</name>
  <files>app/scripts/test-pipeline.mjs, app/scripts/README-test-pipeline.md</files>
  <action>
1. **Inspeccionar el patrón de import** de `rag-worker.mjs` y `setup-inbound-canvas.mjs` en las primeras 30 líneas — qué loader usan, si hay transpilación previa (ej. `tsx`, `ts-node`, o importan del build standalone). Replicar el mismo patrón. Si usan `require('better-sqlite3')` + acceso directo a la DB, hacer lo mismo.

2. Crear `app/scripts/test-pipeline.mjs` siguiendo esta estructura:

   ```js
   #!/usr/bin/env node
   // test-pipeline.mjs — Phase 133 gate tooling (FOUND-08/09)
   // Uso:
   //   node app/scripts/test-pipeline.mjs --case holded-q1
   //   node app/scripts/test-pipeline.mjs --goal "texto libre" --case holded-q1
   //   node app/scripts/test-pipeline.mjs --case holded-q1 --save-baseline
   //   node app/scripts/test-pipeline.mjs --case holded-q1 --diff .baseline/holded-q1.json

   import fs from 'node:fs';
   import path from 'node:path';
   import { fileURLToPath } from 'node:url';

   const __dirname = path.dirname(fileURLToPath(import.meta.url));
   const ROOT = path.resolve(__dirname, '..');

   // --- CLI parse ---
   const args = process.argv.slice(2);
   function getFlag(name, fallback = null) {
     const idx = args.indexOf(`--${name}`);
     if (idx === -1) return fallback;
     const next = args[idx + 1];
     if (!next || next.startsWith('--')) return true; // boolean flag
     return next;
   }
   const caseName = getFlag('case');
   const goalOverride = getFlag('goal');
   const saveBaseline = getFlag('save-baseline') === true;
   const diffPath = getFlag('diff');

   if (!caseName) {
     console.error('❌ --case <name> requerido. Disponibles: holded-q1, inbox-digest, drive-sync');
     process.exit(1);
   }

   const fixturePath = path.join(__dirname, 'pipeline-cases', `${caseName}.json`);
   if (!fs.existsSync(fixturePath)) {
     console.error(`❌ Fixture no encontrado: ${fixturePath}`);
     process.exit(1);
   }
   const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
   const originalRequest = goalOverride || fixture.original_request;

   console.log(`▶ test-pipeline: case=${caseName}`);
   console.log(`  original_request: ${originalRequest.slice(0, 120)}...`);

   // --- Import executor + db ---
   // (Mirror the pattern from rag-worker.mjs)
   const { default: db } = await import(path.join(ROOT, '.next/standalone/app/src/lib/db.js'));
   const { IntentJobExecutor } = await import(path.join(ROOT, '.next/standalone/app/src/lib/services/intent-job-executor.js'));
   // If build path differs, ADJUST according to whatever rag-worker.mjs uses.

   // --- Insert synthetic job ---
   const jobId = `test-${caseName}-${Date.now()}`;
   const now = new Date().toISOString();
   db.prepare(`INSERT INTO intent_jobs (id, status, channel, tool_name, tool_args, created_at, updated_at)
               VALUES (?, 'pending', 'web', '__description__', ?, ?, ?)`)
     .run(jobId, JSON.stringify({ description: originalRequest, original_request: originalRequest }), now, now);

   console.log(`  job inserted: id=${jobId}`);

   // --- Run tick loop ---
   const startMs = Date.now();
   const TIMEOUT_MS = 120_000;
   const TERMINAL = new Set(['awaiting_user', 'awaiting_approval', 'completed', 'failed']);

   while (true) {
     const elapsed = Date.now() - startMs;
     if (elapsed > TIMEOUT_MS) {
       console.error(`❌ Timeout: pipeline > ${TIMEOUT_MS}ms`);
       // Cleanup the synthetic job before exiting
       db.prepare('DELETE FROM intent_jobs WHERE id=?').run(jobId);
       process.exit(2);
     }

     await IntentJobExecutor.tick();
     const row = db.prepare('SELECT * FROM intent_jobs WHERE id=?').get(jobId);
     if (!row) {
       console.error(`❌ Job ${jobId} desaparecido antes de terminal`);
       process.exit(3);
     }
     if (TERMINAL.has(row.status)) break;
     await new Promise((r) => setTimeout(r, 1000));
   }

   const finalMs = Date.now() - startMs;
   const row = db.prepare('SELECT * FROM intent_jobs WHERE id=?').get(jobId);

   // --- Pretty-print results ---
   function tryParse(s) { try { return JSON.parse(s); } catch { return s; } }

   const result = {
     case: caseName,
     job_id: jobId,
     final_status: row.status,
     error: row.error || null,
     duration_ms: finalMs,
     duration_s: (finalMs / 1000).toFixed(1),
     strategist_output: tryParse(row.strategist_output),
     decomposer_output: tryParse(row.decomposer_output),
     architect_iter0: tryParse(row.architect_iter0),
     qa_iter0: tryParse(row.qa_iter0),
     architect_iter1: tryParse(row.architect_iter1),
     qa_iter1: tryParse(row.qa_iter1),
     final_canvas_id: row.canvas_id || null,
   };

   console.log('\n===== PIPELINE RESULT =====');
   console.log(JSON.stringify(result, null, 2));
   console.log(`\n⏱  duration: ${result.duration_s}s`);
   console.log(`   final_status: ${result.final_status}`);

   // Also print just the flow_data for quick inspection
   const finalDesign = result.architect_iter1 || result.architect_iter0;
   if (finalDesign && typeof finalDesign === 'object' && finalDesign.flow_data) {
     console.log('\n===== FINAL flow_data (roles per node) =====');
     for (const n of (finalDesign.flow_data.nodes || [])) {
       const role = n.data?.role ?? '(no role)';
       const inst = (typeof n.data?.instruction === 'string' ? n.data.instruction.slice(0, 80) : '');
       console.log(`  ${n.id} [${n.type}] role=${role} — ${inst}`);
     }
   }

   // --- Baseline save / diff ---
   const baselineDir = path.join(ROOT, 'scripts', '.baselines');
   if (saveBaseline) {
     fs.mkdirSync(baselineDir, { recursive: true });
     const blPath = path.join(baselineDir, `${caseName}.json`);
     fs.writeFileSync(blPath, JSON.stringify(result, null, 2));
     console.log(`✔ baseline saved: ${blPath}`);
   }
   if (diffPath) {
     const baseline = JSON.parse(fs.readFileSync(diffPath, 'utf8'));
     const diff = [];
     if (baseline.final_status !== result.final_status) diff.push(`status: ${baseline.final_status} -> ${result.final_status}`);
     // Extend diff logic as needed
     console.log('\n===== DIFF vs baseline =====');
     console.log(diff.length === 0 ? '(no diffs)' : diff.join('\n'));
   }

   // --- Cleanup ---
   db.prepare('DELETE FROM intent_jobs WHERE id=?').run(jobId);
   console.log(`\n✔ cleanup: job ${jobId} removed`);

   process.exit(result.final_status === 'failed' ? 4 : 0);
   ```

3. **Ajuste crítico del import:** el bloque `await import(...)` con `.next/standalone/...` es un placeholder. Inspeccionar cómo `rag-worker.mjs` importa desde `src/lib/services/`:
   - Si usa `import './rag-worker.ts'` vía `tsx`, el script se invoca con `tsx`.
   - Si el build standalone produce JS en `.next/server/app/...` o `dist/`, ajustar path.
   - Si el codebase usa `npm run test-pipeline` que internamente invoca `tsx`, crear también un script en `package.json`:
     ```json
     "scripts": { "test-pipeline": "tsx app/scripts/test-pipeline.mjs" }
     ```
   - NO adivinar — mirror `rag-worker.mjs` exactamente.

4. Crear `app/scripts/README-test-pipeline.md` con:
   - Qué hace el script
   - Cómo se invoca (3 casos + flags)
   - Prerequisitos (LiteLLM corriendo en localhost:4000, DB inicializada)
   - Criterio de aceptación: holded-q1 termina en < 60s

5. Si `IntentJobExecutor.tick` es privado, añadir un export test-mode estático:
   ```ts
   // En intent-job-executor.ts
   static async tickForTest(): Promise<void> { return this.tick(); }
   ```
   y llamar `tickForTest` desde el script.
  </action>
  <verify>
    <automated>node -e "const f = require('fs'); if (!f.existsSync('app/scripts/test-pipeline.mjs')) throw new Error('missing script'); const c = f.readFileSync('app/scripts/test-pipeline.mjs','utf8'); if (!c.includes('--case') || !c.includes('architect_iter0')) throw new Error('incomplete script')"</automated>
  </verify>
  <done>
- `app/scripts/test-pipeline.mjs` existe y tiene parse de flags + insert job + tick loop + pretty print + cleanup
- README existe
- Import strategy mirrors `rag-worker.mjs` (verificado)
- El script no tiene tombstone comments
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Verificar end-to-end contra LiteLLM real — criterio de done de Phase 133</name>
  <files>app/scripts/test-pipeline.mjs, app/scripts/pipeline-cases/holded-q1.json</files>
  <action>Ejecutar manualmente el script contra LiteLLM real y pegar output. Ver instrucciones detalladas en <how-to-verify> abajo. Esto es un checkpoint bloqueante humano — el usuario verifica el criterio de done de Phase 133.</action>
  <verify>Manual: output de `node app/scripts/test-pipeline.mjs --case holded-q1` pegado en el checkpoint con `duration_s < 60.0` y `final_status != failed`.</verify>
  <done>Usuario confirma con "approved" + output pegado evidenciando holded-q1 terminó en terminal state en < 60s con los 4 outputs intermedios (strategist, decomposer, architect_iter0, qa_iter0) presentes.</done>
  <what-built>
- `test-pipeline.mjs` con 3 fixtures
- Pipeline completo con timeouts (Plan 02), reaper (Plan 03), persistencia de outputs intermedios (Plan 04), catalog en runtime (Plan 01)
- Este checkpoint ES el criterio de done exacto de Phase 133
  </what-built>
  <how-to-verify>
1. Verificar que LiteLLM está corriendo: `curl -sf http://litellm:4000/health || curl -sf http://localhost:4000/health`. Si no responde, arrancar el stack: `docker compose up -d`.

2. Ejecutar el script contra holded-q1 (el caso canónico del milestone):
   ```bash
   cd ~/docflow && time node app/scripts/test-pipeline.mjs --case holded-q1
   ```
   (o `npx tsx app/scripts/test-pipeline.mjs --case holded-q1` si el patrón del repo usa tsx)

3. Confirmar en el output:
   - [ ] El script imprime `===== PIPELINE RESULT =====` seguido de un JSON con `strategist_output`, `decomposer_output`, `architect_iter0`, `qa_iter0` no-null
   - [ ] El script imprime `===== FINAL flow_data (roles per node) =====` con al menos 3 nodos listados
   - [ ] `duration_s` es **< 60.0** (criterio de done exacto de la fase)
   - [ ] `final_status` es uno de: `awaiting_approval`, `completed`, `awaiting_user` (NO `failed`)
   - [ ] El job sintético queda limpio al final (`✔ cleanup` impreso)

4. Probar los otros dos casos (timing puede ser más holgado pero debe completar sin colgarse):
   ```bash
   node app/scripts/test-pipeline.mjs --case inbox-digest
   node app/scripts/test-pipeline.mjs --case drive-sync
   ```
   - [ ] Ambos terminan en terminal state en < 120s cada uno (< 60s es el objetivo solo para holded-q1)

5. Probar `--save-baseline` y `--diff`:
   ```bash
   node app/scripts/test-pipeline.mjs --case holded-q1 --save-baseline
   node app/scripts/test-pipeline.mjs --case holded-q1 --diff app/scripts/.baselines/holded-q1.json
   ```
   - [ ] `--save-baseline` crea el fichero en `.baselines/holded-q1.json`
   - [ ] `--diff` imprime `===== DIFF vs baseline =====` (con o sin diffs)

6. **CatBot oráculo (protocolo de DocFlow CLAUDE.md):** Abrir CatBot web y preguntarle:
   > "¿Puedes confirmar que la tabla intent_jobs ahora tiene las columnas strategist_output, architect_iter0 y qa_iter0? Usa un tool de inspección."

   - [ ] CatBot responde afirmativamente usando una tool tipo `query_database` o `list_intent_jobs`
   - [ ] Si CatBot no tiene una tool para esto, registrar como gap en `.planning/phases/133-foundation-tooling-found/133-gaps.md` (NO bloquea este checkpoint pero queda documentado para un plan futuro de CatBot tools)

7. Pegar el output completo de `node app/scripts/test-pipeline.mjs --case holded-q1` en el comentario de aprobación del checkpoint.
  </how-to-verify>
  <resume-signal>Type "approved" con el output pegado, o describe qué falló (timeout, error de import, pipeline cuelga, output incompleto) para crear un gap closure plan</resume-signal>
</task>

</tasks>

<verification>
1. `node app/scripts/test-pipeline.mjs --case holded-q1` imprime flow_data + qa_report + outputs intermedios a stdout en < 60s (criterio exacto)
2. Los 3 fixtures existen y son JSON parseables
3. `--save-baseline` y `--diff` funcionan
4. El job sintético es limpiado al final (no deja filas zombies en `intent_jobs`)
5. CatBot puede verificar las nuevas columnas (oracle protocol)
</verification>

<success_criteria>
- FOUND-08: `test-pipeline.mjs` existe con los 4 flags y ejecuta el pipeline directo ✓
- FOUND-09: 3 fixtures canonizados en `pipeline-cases/` ✓
- Phase 133 done criterion: holded-q1 < 60s con outputs intermedios legibles ✓
- CatBot oracle verificó la persistencia (o gap documentado) ✓
</success_criteria>

<output>
After completion, create `.planning/phases/133-foundation-tooling-found/133-05-SUMMARY.md` con:
- Script creado
- Fixtures creados
- Timing real del holded-q1 contra LiteLLM
- Output completo del run de aprobación (pegado)
- Gaps de CatBot tools (si los hay)

Y crear `.planning/phases/133-foundation-tooling-found/133-VERIFICATION.md` con los 5 success criteria de la fase marcados:
1. test-pipeline.mjs --case holded-q1 < 60s ✓/✗
2. Timeouts + reaper previenen jobs colgados ✓/✗
3. Exhaustion notifica con top-2 issues + flow_data persistido ✓/✗
4. getCanvasRule('R10') funciona en contenedor ✓/✗
5. 6 columnas intermedias existen y se pueblan ✓/✗
</output>
