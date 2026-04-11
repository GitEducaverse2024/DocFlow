---
phase: 133-foundation-tooling-found
plan: 03
type: execute
wave: 3
depends_on:
  - 133-02
files_modified:
  - app/src/lib/services/intent-job-executor.ts
  - app/src/lib/__tests__/intent-job-executor.test.ts
autonomous: true
requirements:
  - FOUND-05
must_haves:
  truths:
    - "Cada 5 minutos el executor ejecuta un reaper que detecta jobs colgados"
    - "Un job con status strategist|decomposer|architect y updated_at > 10 minutos es marcado failed por el reaper"
    - "El reaper notifica al usuario por el canal original del job (telegram o web) con mensaje de timeout"
    - "Si currentJobId coincide con un job reaped, se libera a null"
  artifacts:
    - path: "app/src/lib/services/intent-job-executor.ts"
      provides: "Método reapStaleJobs() + cron interno setInterval(5 * 60_000)"
      contains: "reapStaleJobs"
    - path: "app/src/lib/__tests__/intent-job-executor.test.ts"
      provides: "Test unitario reapStaleJobs marca failed + notifica + limpia currentJobId"
  key_links:
    - from: "setInterval cada 5 min"
      to: "reapStaleJobs()"
      via: "registrado en startReaper() invocado desde el constructor/init del executor"
      pattern: "reapStaleJobs"
    - from: "reapStaleJobs query"
      to: "intent_jobs WHERE status IN ('strategist','decomposer','architect') AND updated_at < now - 10min"
      via: "better-sqlite3 prepare+all con datetime('now', '-10 minutes')"
      pattern: "datetime.*-10 minutes|-600"
---

<objective>
Ningún job del pipeline puede quedar colgado indefinidamente. Si el timeout de 90s de callLLM falla (ej. fetch bloqueado antes de que AbortSignal arranque, o el proceso Node queda stuck en un `await` externo al fetch), un reaper de nivel superior detecta el job vía `updated_at > 10min` en un status no-terminal y lo mata notificando al usuario.

Purpose: Segunda línea de defensa independiente del timeout de fetch. FOUND-04 mata llamadas LLM; este plan mata jobs zombis más allá del scope de callLLM (ej. un await en scanCanvasResources que se cuelga, o un crash parcial que deja `currentJobId` apuntando a un job muerto).
Output: `reapStaleJobs()` como método privado del executor + `startReaper()` que lanza un `setInterval` de 5min, invocado una vez en el bootstrap del módulo.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@./CLAUDE.md
@.planning/phases/133-foundation-tooling-found/133-02-resilience-llm-PLAN.md

@app/src/lib/services/intent-job-executor.ts
@app/src/lib/services/intent-worker.ts
@app/src/lib/__tests__/intent-job-executor.test.ts

<interfaces>
<!-- Existing helpers in intent-job-executor.ts — reuse, don't duplicate -->

```ts
class IntentJobExecutor {
  private static currentJobId: string | null;
  private static notifyProgress(job: IntentJobRow, message: string, force?: boolean): void;
  private static markTerminal(jobId: string): void;
  private static readonly BOOT_DELAY_MS = 60_000; // existing pattern
}

// From intent-jobs.ts
function updateIntentJob(id: string, patch: Partial<IntentJobRow>): void;
function getIntentJob(id: string): IntentJobRow | null;

// From db.ts
import db from '../db';
// db.prepare(sql).all(...) / db.prepare(sql).run(...)

// IntentJobRow shape (relevant fields)
interface IntentJobRow {
  id: string;
  status: string; // 'pending'|'strategist'|'decomposer'|'architect'|'awaiting_user'|'awaiting_approval'|'completed'|'failed'|...
  updated_at: string; // ISO timestamp
  channel: string; // 'telegram'|'web'|...
  // ...
}
```

Non-terminal statuses where a job can be considered "stale if > 10min without update":
`strategist`, `decomposer`, `architect`
(NOT `awaiting_user` or `awaiting_approval` — those are legitimately waiting on human and may live for hours.)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implementar reapStaleJobs() + startReaper() con test unitario</name>
  <files>app/src/lib/services/intent-job-executor.ts, app/src/lib/__tests__/intent-job-executor.test.ts</files>
  <behavior>
- `reapStaleJobs()` ejecuta una query `SELECT * FROM intent_jobs WHERE status IN ('strategist','decomposer','architect') AND updated_at < datetime('now', '-10 minutes')`
- Para cada row: (a) llama `notifyProgress(row, '⏱️ Pipeline timeout: job colgado > 10min, marcado failed por el reaper', true)`, (b) `updateIntentJob(row.id, { status: 'failed', error: 'reaper: stale > 10min' })`, (c) si `this.currentJobId === row.id` lo setea a null, (d) llama `markTerminal(row.id)`
- `startReaper()` registra `setInterval(() => this.reapStaleJobs().catch(...), 5 * 60_000)` y lo llama una vez inmediatamente (no espera 5min). Guarda el handle en una variable estática para tests (`private static reaperInterval: NodeJS.Timeout | null`).
- `startReaper()` sólo se llama una vez; llamarla dos veces no crea un segundo intervalo. Guarda contra doble-init con un flag `private static reaperStarted: boolean`.
- Test unitario: insertar 2 jobs en DB de test con `updated_at` forzado a > 10min ago, status `architect` y `strategist`, y un tercer job con `updated_at` reciente. Ejecutar `reapStaleJobs()` directamente (sin setInterval). Verificar: (a) los 2 primeros están status=failed, (b) el tercero sigue en su status original, (c) `notifyProgress` fue llamado 2 veces con force=true, (d) `currentJobId` queda null si apuntaba a uno de ellos.
  </behavior>
  <action>
1. Añadir a `intent-job-executor.ts` el método estático:

   ```ts
   private static reaperStarted = false;
   private static reaperInterval: NodeJS.Timeout | null = null;
   private static readonly REAPER_INTERVAL_MS = 5 * 60 * 1000;
   private static readonly STALE_THRESHOLD = "-10 minutes";

   static startReaper(): void {
     if (this.reaperStarted) return;
     this.reaperStarted = true;
     // Run once after a small delay so tests can control it, then every 5 min
     this.reaperInterval = setInterval(() => {
       this.reapStaleJobs().catch((err) =>
         logger.error('intent-job-executor', 'reapStaleJobs failed', { error: String(err) })
       );
     }, this.REAPER_INTERVAL_MS);
     logger.info('intent-job-executor', 'Reaper started', { intervalMs: this.REAPER_INTERVAL_MS });
   }

   static async reapStaleJobs(): Promise<number> {
     const STALE_STATUSES = ['strategist', 'decomposer', 'architect'] as const;
     const placeholders = STALE_STATUSES.map(() => '?').join(',');
     const rows = db
       .prepare(
         `SELECT * FROM intent_jobs
          WHERE status IN (${placeholders})
          AND updated_at < datetime('now', ?)`
       )
       .all(...STALE_STATUSES, this.STALE_THRESHOLD) as IntentJobRow[];

     if (rows.length === 0) return 0;

     for (const row of rows) {
       logger.warn('intent-job-executor', 'Reaping stale job', {
         jobId: row.id, status: row.status, updatedAt: row.updated_at,
       });
       try {
         this.notifyProgress(
           row,
           `⏱️ Pipeline timeout: job ${row.id.slice(0, 8)} colgado > 10min, marcado failed por el reaper.`,
           true,
         );
       } catch (err) {
         logger.warn('intent-job-executor', 'reaper notify failed', { jobId: row.id, error: String(err) });
       }
       updateIntentJob(row.id, { status: 'failed', error: 'reaper: stale > 10min' });
       if (this.currentJobId === row.id) this.currentJobId = null;
       this.markTerminal(row.id);
     }
     return rows.length;
   }

   // Test helper — allows tests to stop the interval without leaking timers
   static stopReaperForTest(): void {
     if (this.reaperInterval) {
       clearInterval(this.reaperInterval);
       this.reaperInterval = null;
     }
     this.reaperStarted = false;
   }
   ```

2. Encontrar el punto de arranque del executor (probablemente `intent-worker.ts` o el `init()` del executor llamado desde `src/instrumentation.ts`). Llamar `IntentJobExecutor.startReaper()` justo después de arrancar el poller principal.
   - Si el executor ya tiene un método `start()` o similar, añadir `this.startReaper()` dentro; si no, añadir el call a la función que instrumenta el worker en `intent-worker.ts`.

3. Test en `intent-job-executor.test.ts`:
   ```ts
   describe('reapStaleJobs', () => {
     beforeEach(() => {
       // Truncate intent_jobs in test DB
       db.prepare('DELETE FROM intent_jobs').run();
     });

     it('marks stale architect/strategist jobs as failed and notifies', async () => {
       const now = Date.now();
       const stale = new Date(now - 11 * 60_000).toISOString(); // 11 min ago
       const fresh = new Date(now - 2 * 60_000).toISOString();  // 2 min ago

       db.prepare(`INSERT INTO intent_jobs (id, status, channel, updated_at, created_at, tool_name, tool_args)
                   VALUES (?, 'architect', 'telegram', ?, ?, '__description__', '{}')`)
         .run('job-stale-1', stale, stale);
       db.prepare(`INSERT INTO intent_jobs (id, status, channel, updated_at, created_at, tool_name, tool_args)
                   VALUES (?, 'strategist', 'web', ?, ?, '__description__', '{}')`)
         .run('job-stale-2', stale, stale);
       db.prepare(`INSERT INTO intent_jobs (id, status, channel, updated_at, created_at, tool_name, tool_args)
                   VALUES (?, 'architect', 'telegram', ?, ?, '__description__', '{}')`)
         .run('job-fresh', fresh, fresh);

       const notifySpy = vi.spyOn(IntentJobExecutor as any, 'notifyProgress');
       (IntentJobExecutor as any).currentJobId = 'job-stale-1';

       const count = await IntentJobExecutor.reapStaleJobs();
       expect(count).toBe(2);
       expect(notifySpy).toHaveBeenCalledTimes(2);
       expect(notifySpy).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/reaper|timeout/i), true);

       const s1 = db.prepare('SELECT status FROM intent_jobs WHERE id=?').get('job-stale-1') as { status: string };
       const s2 = db.prepare('SELECT status FROM intent_jobs WHERE id=?').get('job-stale-2') as { status: string };
       const sf = db.prepare('SELECT status FROM intent_jobs WHERE id=?').get('job-fresh') as { status: string };
       expect(s1.status).toBe('failed');
       expect(s2.status).toBe('failed');
       expect(sf.status).toBe('architect'); // unchanged
       expect((IntentJobExecutor as any).currentJobId).toBeNull();
     });

     it('is a no-op when no stale jobs exist', async () => {
       const count = await IntentJobExecutor.reapStaleJobs();
       expect(count).toBe(0);
     });

     it('does NOT reap awaiting_user or awaiting_approval jobs even if old', async () => {
       const stale = new Date(Date.now() - 30 * 60_000).toISOString();
       db.prepare(`INSERT INTO intent_jobs (id, status, channel, updated_at, created_at, tool_name, tool_args)
                   VALUES ('job-await', 'awaiting_user', 'telegram', ?, ?, '__description__', '{}')`)
         .run(stale, stale);
       await IntentJobExecutor.reapStaleJobs();
       const row = db.prepare('SELECT status FROM intent_jobs WHERE id=?').get('job-await') as { status: string };
       expect(row.status).toBe('awaiting_user');
     });
   });
   ```

4. Limpieza: asegurar que `afterAll` en el test suite llama `IntentJobExecutor.stopReaperForTest()` para no dejar timers colgando.

5. NO tocar el `tick()` principal del executor ni la lógica de pipeline async del Plan 02. Solo añadir los métodos del reaper.
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm test -- --run intent-job-executor.test 2>&amp;1 | tail -30</automated>
  </verify>
  <done>
- `reapStaleJobs()` y `startReaper()` existen en `intent-job-executor.ts`
- Reaper registrado en el bootstrap del executor/worker (intent-worker.ts o instrumentation)
- Los 3 tests nuevos pasan
- `npm run build` compila
  </done>
</task>

</tasks>

<verification>
1. `cd app && npm test -- --run intent-job-executor.test` verde (reaper + todos los tests previos)
2. `cd app && npm run build` compila
3. Grep: `grep -n "reapStaleJobs\|startReaper" app/src/lib/services/intent-job-executor.ts` devuelve los métodos
4. Verificar manualmente que `startReaper()` es invocada en intent-worker.ts o similar (`grep -rn "startReaper" app/src`)
</verification>

<success_criteria>
- FOUND-05: reaper cada 5min marca failed jobs stale > 10min en statuses no-terminales, notifica por canal original, limpia currentJobId ✓
- Awaiting_user / awaiting_approval NUNCA son reaped (verificado en test)
- Sin regresiones
</success_criteria>

<output>
After completion, create `.planning/phases/133-foundation-tooling-found/133-03-SUMMARY.md` con:
- Implementación del reaper
- Punto de bootstrap
- Tests añadidos
</output>
