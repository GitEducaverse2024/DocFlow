# Phase 130: Async CatFlow Pipeline — Research

**Researched:** 2026-04-10
**Domain:** AI-assisted workflow composition (detect complex task → 3-phase LLM pipeline → canvas generation → approval-gated async execution → lifecycle) layered on top of the existing intent queue, canvas executor, Telegram bot, and notifications infrastructure.
**Confidence:** HIGH

## Summary

Phase 130 is the most complex phase of the v26.1 milestone but it is pattern-follow, not pattern-design. Every moving part has a 1:1 analog already shipped in Phases 118–129: the `intent_jobs` table mirrors `intents` and `knowledge_gaps`; the `IntentJobExecutor` singleton copy-pastes `IntentWorker` / `AlertService`; the 3-phase pipeline LLM calls reuse `canvas-executor.callLLM` or an equivalent minimal helper; the CatPaw-on-the-fly flow reuses the existing `create_cat_paw` tool; the canvas design writes the same `flow_data` JSON shape the executor already consumes; the dashboard notification uses the existing `notifications` table; and the Telegram inline-keyboard approval is the only genuinely new integration (Telegram bot currently has zero `callback_query` handling — this is the single biggest code addition).

The pipeline is an **overlay on intents** — it does NOT replace `/api/catbot/chat`. When CatBot detects a user request that requires >60s (heuristic: tool is flagged `async: true` or `estimated_duration_ms > 60000` in `TOOLS[]`), it calls a new `queue_intent_job` tool to persist the intent to `intent_jobs`, asks the user for confirmation, and then hands off to the `IntentJobExecutor` background worker. The worker drives the 3-phase pipeline (strategist → decomposer → architect) through sequential direct LiteLLM calls with specialized system prompts, persists each phase output into `progress_message`, designs a canvas, and sends a cross-channel approval request. On approval, it calls the existing `/api/canvas/{id}/execute` endpoint and notifies completion.

**Primary recommendation:** Implement exactly as the ROADMAP suggests in 5 plans. Plan 01 = schema + CRUD + `async` flag + `queue_intent_job` / `list_my_jobs` / `cancel_job` tools (pure additions). Plan 02 = `IntentJobExecutor` singleton + 3 specialized system prompts + phase persistence in `progress_message` JSON + `buildComplexTaskProtocol()` P1 section. Plan 03 = Canvas Flow Designer (task → flow_data mapping, resource scan, CatPaw-on-the-fly prompt). Plan 04 = cross-channel approval (notifications row + Telegram inline keyboard + `callback_query` handler + `/api/intent-jobs/{id}/approve` and `/reject` endpoints). Plan 05 = post-execution lifecycle (template/recipe/delete) + `AlertService.checkStuckPipelines()` + CatBot oracle E2E.

The single hardest subsystem is **Plan 04** because it requires introducing `callback_query` handling to `telegram-bot.ts` from scratch. Budget extra research and careful test coverage for that plan.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Pipeline roles — Opción B: CatBot único con system prompts especializados.** NO crear 3 CatPaws nuevos (`catflow-strategist`, `catflow-decomposer`, `catflow-architect`). CatBot ejecuta las 3 fases internamente cambiando el system prompt en cada fase. Cada fase usa LLM call con prompt enfocado: estratega, despiezador, arquitecto. Razón: el usuario prefiere no saturar la lista de CatPaws con entidades auxiliares.

- **Creación on-the-fly de CatPaws.** Cuando el Arquitecto de Canvas busca recursos (`list_cat_paws`) y no encuentra uno adecuado para una tarea específica, **DEBE preguntar al usuario**: "Necesito un CatPaw que sepa X para este paso, ¿puedo crearlo?". Si el usuario acepta: CatBot crea el CatPaw con el system prompt adecuado, lo guarda, y continúa el diseño. Si el usuario rechaza: CatBot reporta que no puede completar el diseño y marca el pipeline como failed con `last_error` explicativo. Esto es el punto de integración con el skill "Arquitecto de Agentes" existente de CatBot.

- **Trigger — Opción C: Heurística + confirmación explícita.** Detección automática via flag `async: true` o `estimated_duration_ms > 60000` en TOOLS[]. CatBot detecta → pregunta al usuario: "Esto va a requerir varios pasos y tiempo. ¿Quieres que prepare un CatFlow?". Si acepta → arranca el pipeline. Si rechaza → intenta ejecución inline. Instrucción en nueva sección P1 del PromptAssembler: "Protocolo de Tareas Complejas".

- **Scope trigger.** Solo aplica a tareas que requieren >60 segundos de ejecución. Peticiones simples (lecturas, list_*, get_*, edits rápidos, ejecución de canvas pre-existentes) siguen el flujo síncrono actual sin cambios. No se toca el flujo actual de `/api/catbot/chat` para peticiones simples.

- **Lista inicial de tools marcadas como async (a confirmar en research):** `execute_catflow`, `execute_task`, `process_source_rag`. Otras que el research identifique por patrón de uso.

- **Post-execution lifecycle (3 opciones siempre):**
  1. **Mantener como plantilla**: `is_template = 1` en canvases → aparece en galería de plantillas.
  2. **Guardar como recipe**: integración con Phase 122 user_memory (saveMemory) → fast-path en peticiones similares.
  3. **Eliminar**: `DELETE FROM canvases WHERE id = ?` → evita ruido de canvases desechables.

- **Notificación cross-channel.**
  - Dashboard: tabla `notifications` existente + tipo `catflow_pipeline` nuevo.
  - Telegram: `sendMessage` con InlineKeyboard (botones "Ejecutar/Cancelar" via callback_data).
  - El canal se determina por el `channel` del intent padre (telegram/web).

- **Pipeline visibility.** `progress_message` en `intent_jobs` se actualiza en cada fase. Dashboard: nueva card/tab en la sección "Conocimiento de CatBot" o sección independiente. Telegram: mensajes de progreso opcionales cada vez que cambia de fase.

### Claude's Discretion

- Exact wording / length of `buildComplexTaskProtocol()` (target <800 chars, same constraint as Phase 126/129).
- Internal shape of the `progress_message` JSON (flat string vs structured object — research recommends structured: `{ phase, goal, tasks, resources, cat_paws_needed, message }`).
- Exact SQL of "stuck pipeline" alert threshold (recommendation: `status='running' AND updated_at < datetime('now', '-30 min')`).
- Permission action key name for `cancel_job` (proposed: `manage_intent_jobs`).
- Which knowledge JSON hosts the new tools (recommendation: `settings.json`, same as Phase 129).
- Whether the IntentJobExecutor processes one job per tick or multiple (recommendation: ONE per tick to avoid dual-LLM contention).
- Whether the strategist/decomposer/architect prompts are hardcoded strings in the executor or loaded from files (recommendation: hardcoded consts in `intent-job-executor.ts` with a // Source: comment — 3 prompts ~500 chars each, fits easily).
- Exact shape of the Telegram `callback_data` payload (recommendation: ``pipeline:${intentJobId}:${action}`` where action ∈ {approve, reject}).
- Whether to offer post-execution options via tool calls or separate endpoint (recommendation: separate tool `post_execution_decision` called by CatBot when user answers).

### Deferred Ideas (OUT OF SCOPE)

- Edición visual del canvas propuesto desde el chat — el usuario abre /catflow/{id} en el editor existente.
- Versionado de planes fallidos — si el pipeline falla, se genera uno nuevo, no hay historial.
- Auto-creación de CatBrains nuevos — solo se pueden crear CatPaws nuevos.
- Ejecución sin aprobación — no hay modo "auto-approve", siempre se pregunta.
- Compartir pipelines entre usuarios — cross-user admin view sigue siendo FUTURE.
- Edición de flow_data después del diseño — si el diseño no es correcto, se rechaza y se regenera.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-01 | Tabla `intent_jobs` en catbot.db con CRUD | New `CREATE TABLE IF NOT EXISTS intent_jobs` block appended to catbot-db.ts schema (lines 34-112 area); CRUD mirrors `knowledge_gaps`/`intents` patterns (catbot-db.ts lines 511-555 / Phase 129 pattern). See Schema + CRUD section below. |
| PIPE-02 | CatBot detecta async tools + pregunta confirmación | Extend `TOOLS[]` entries with optional `async?: boolean` and `estimated_duration_ms?: number` fields. Extend LLM tool serialization in catbot-tools.ts `getToolsForLLM` to inject these into description. PromptAssembler adds P1 section `buildComplexTaskProtocol()` with explicit instruction. |
| PIPE-03 | Pipeline Orchestrator 3 fases con system prompts especializados | New `IntentJobExecutor` singleton in `app/src/lib/services/intent-job-executor.ts` copying `IntentWorker` pattern (alert-service.ts shape, BOOT_DELAY=60s to stagger after AlertService 30s + IntentWorker 45s). 3 hardcoded system prompts (STRATEGIST_PROMPT, DECOMPOSER_PROMPT, ARCHITECT_PROMPT). Each phase = one `callLLM()` call (reuse pattern from `canvas-executor.ts` lines 97-125). Phase output JSON-parsed and stored in `progress_message`. |
| PIPE-04 | Canvas Flow Designer con resource reuse + CatPaw on-the-fly | Architect phase prompt lists existing resources (from `list_catbrains`, `list_cat_paws`, `list_skills`, `list_connectors` called by executor synchronously before the LLM call). LLM returns flow_data JSON. If architect outputs `needs_cat_paws: [...]`, executor pauses pipeline (status='awaiting_user'), emits a notification asking for approval to create each CatPaw. User responds via tool or inline keyboard. |
| PIPE-05 | Propuesta cross-channel con botón Ejecutar/Cancelar | New notification type `catflow_pipeline` (extend `NotificationType` union in notifications.ts line 7). New Telegram `sendMessageWithInlineKeyboard` helper. New `callback_query` branch in `processUpdate`. New API routes `/api/intent-jobs/[id]/approve` and `/reject`. |
| PIPE-06 | Ejecución async vía `/api/canvas/{id}/execute` | On approval, IntentJobExecutor (or the approve endpoint) POSTs to `/api/canvas/{id}/execute` (same pattern as `execute_catflow` tool, catbot-tools.ts lines 1525-1559). Background execution: canvas executor already handles it. On completion, executor reads canvas_runs status and notifies user. |
| PIPE-07 | Post-execution lifecycle (template/recipe/delete) | New tool `post_execution_decision(intent_job_id, action: 'keep_template'\|'save_recipe'\|'delete')`. `keep_template`: `UPDATE canvases SET is_template = 1`. `save_recipe`: call `saveMemory()` from catbot-db.ts (line 348 pattern) with the original_request as trigger + canvas description as steps. `delete`: `DELETE FROM canvases WHERE id = ?`. |
| PIPE-08 | progress_message visible en dashboard + Telegram | `list_my_jobs` tool queries intent_jobs filtered by user_id. Dashboard: reuses existing Knowledge Admin Dashboard pattern (Phase 127) — a new tab or card. Telegram: at each phase transition, executor calls `sendMessage(chatId, `🔄 Fase: ${phase}\n${message}`)`. |
</phase_requirements>

## Standard Stack

### Core (all already in project, zero new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | existing | `intent_jobs` table in catbot.db | Same DB as intents (Phase 129), zero contention risk |
| vitest | existing | Unit tests for executor, CRUD, prompt section, approve/reject endpoints | Project test framework |
| Telegram Bot API (native fetch) | existing | `sendMessage` already exists; add `sendMessageWithInlineKeyboard` + `answerCallbackQuery` helpers | telegram-bot.ts is entirely native fetch, no SDK |
| next-intl | existing | i18n for new dashboard card + notification titles | Project convention |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| logger (@/lib/logger) | existing | Structured logs per pipeline phase + executor tick | Every LLM call, every state transition |
| generateId (@/lib/utils) | existing | intent_job IDs | Consistent with all other catbot.db tables |
| callLLM helper | new minimal (or reuse from canvas-executor.ts) | 3 sequential direct LiteLLM calls with different system prompts | Not tool-call loop — direct completion requests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct LiteLLM `fetch` in executor | Re-entering `/api/catbot/chat` with special system prompt | Re-entering chat loads the full PromptAssembler + tool catalog for every phase — wasteful and slow. Direct LiteLLM `chat/completions` POST with a 500-char system prompt is 10x faster. Chosen direct. |
| Separate `intent_jobs.db` | Add to catbot.db | catbot.db already owns all CatBot state, alerts use docflow.db. Keeping intent_jobs in catbot.db is consistent with intents (FK) and cheaper (one WAL). Chosen catbot.db. |
| Single `pipeline_data TEXT` column | Dedicated columns per phase output (`strategist_output`, `decomposer_output`, `architect_output`) | Dedicated columns make SQL queries heavy and force schema migrations if a 4th phase is added later. Single JSON column (`progress_message` TEXT) with `{phase, goal, tasks, resources, message}` structure is more flexible. Chosen single JSON. |
| Polling `/api/intent-jobs/{id}` from UI | Server-sent events | SSE adds complexity. Phase 127 dashboard already polls knowledge-stats every N seconds; same pattern. Chosen polling. |
| Telegram inline keyboard via dedicated lib | Inline JSON in existing fetch call | One new helper method `sendMessageWithInlineKeyboard` (~15 lines) is enough. Chosen native. |

## Architecture Patterns

### Recommended Project Structure
```
app/src/lib/
  catbot-db.ts                                  # ADD: intent_jobs schema + IntentJobRow + CRUD
  services/
    intent-job-executor.ts                      # NEW: IntentJobExecutor singleton (3-phase pipeline driver)
    catbot-pipeline-prompts.ts                  # NEW: STRATEGIST_PROMPT, DECOMPOSER_PROMPT, ARCHITECT_PROMPT consts
    catbot-prompt-assembler.ts                  # ADD: buildComplexTaskProtocol() + P1 registration
    catbot-tools.ts                             # ADD: queue_intent_job, list_my_jobs, cancel_job,
                                                #      approve_pipeline, execute_approved_pipeline,
                                                #      post_execution_decision + async flag on execute_catflow/execute_task/process_source_rag
    telegram-bot.ts                             # ADD: callback_query handler, sendMessageWithInlineKeyboard,
                                                #      answerCallbackQuery helpers
    alert-service.ts                            # ADD: checkStuckPipelines() method
    notifications.ts                            # EXTEND: NotificationType union adds 'catflow_pipeline'

app/src/app/api/
  intent-jobs/
    [id]/
      approve/route.ts                          # NEW: POST — user approves pipeline, kicks execution
      reject/route.ts                           # NEW: POST — user rejects, marks cancelled
    route.ts                                    # NEW: GET — list jobs for dashboard tab

app/src/components/
  catbot-pipelines/
    pipelines-tab.tsx                           # NEW: Dashboard tab showing active/recent pipelines

app/src/lib/__tests__/
  intent-job-executor.test.ts                   # NEW Wave 0
  catbot-intent-jobs.test.ts                    # NEW Wave 0 (CRUD + tools)
  catbot-pipeline-prompts.test.ts               # NEW Wave 0 (prompt text + JSON parsing)
  telegram-callback-query.test.ts               # NEW Wave 0 (inline keyboard flow)

app/src/instrumentation.ts                      # ADD: IntentJobExecutor.start() after IntentWorker.start()
app/data/knowledge/settings.json                # ADD: new tool names to tools[]
```

### Pattern 1: intent_jobs Schema + CRUD

**What:** Append new `CREATE TABLE` block to the existing `catbotDb.exec()` in catbot-db.ts
**When to use:** PIPE-01
**Example:**
```sql
CREATE TABLE IF NOT EXISTS intent_jobs (
  id TEXT PRIMARY KEY,
  intent_id TEXT,                              -- FK to intents.id (nullable if job stands alone)
  user_id TEXT NOT NULL,
  channel TEXT DEFAULT 'web',                  -- 'web' | 'telegram'
  channel_ref TEXT,                            -- chat_id for telegram, null for web
  pipeline_phase TEXT DEFAULT 'pending',       -- pending | strategist | decomposer | architect | awaiting_approval | awaiting_user | running | completed | failed | cancelled
  tool_name TEXT,                              -- which tool triggered the async flow
  tool_args TEXT,                              -- JSON of original args
  canvas_id TEXT,                              -- populated after architect phase
  status TEXT DEFAULT 'pending',               -- high-level: pending | running | completed | failed | cancelled
  progress_message TEXT DEFAULT '{}',          -- JSON: {phase, goal, tasks, resources, cat_paws_needed, message}
  result TEXT,                                 -- final output summary (canvas_run summary)
  error TEXT,                                  -- failure reason
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_intent_jobs_status ON intent_jobs(status);
CREATE INDEX IF NOT EXISTS idx_intent_jobs_user_status ON intent_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_intent_jobs_phase ON intent_jobs(pipeline_phase);
```
**Source:** catbot-db.ts lines 103-111 (knowledge_gaps pattern), Phase 129 `intents` table (identical add-to-exec-block approach).

**TypeScript interface and CRUD:**
```typescript
// catbot-db.ts — append after IntentRow definitions

export interface IntentJobRow {
  id: string;
  intent_id: string | null;
  user_id: string;
  channel: string;
  channel_ref: string | null;
  pipeline_phase: 'pending' | 'strategist' | 'decomposer' | 'architect' |
                  'awaiting_approval' | 'awaiting_user' | 'running' |
                  'completed' | 'failed' | 'cancelled';
  tool_name: string | null;
  tool_args: string | null;   // JSON
  canvas_id: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress_message: string;   // JSON
  result: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export function createIntentJob(job: {
  intentId?: string;
  userId: string;
  channel?: string;
  channelRef?: string;
  toolName: string;
  toolArgs?: Record<string, unknown>;
}): string {
  const id = generateId();
  catbotDb.prepare(`
    INSERT INTO intent_jobs (id, intent_id, user_id, channel, channel_ref, tool_name, tool_args)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    job.intentId ?? null,
    job.userId,
    job.channel ?? 'web',
    job.channelRef ?? null,
    job.toolName,
    JSON.stringify(job.toolArgs ?? {}),
  );
  return id;
}

export function updateIntentJob(
  id: string,
  patch: Partial<Pick<IntentJobRow, 'pipeline_phase' | 'status' | 'canvas_id' | 'result' | 'error'>> & {
    progressMessage?: Record<string, unknown>;
  },
): void {
  const fields: string[] = ["updated_at = datetime('now')"];
  const params: Array<string | number | null> = [];

  if (patch.pipeline_phase !== undefined) { fields.push('pipeline_phase = ?'); params.push(patch.pipeline_phase); }
  if (patch.status !== undefined) {
    fields.push('status = ?'); params.push(patch.status);
    if (patch.status === 'completed' || patch.status === 'failed' || patch.status === 'cancelled') {
      fields.push("completed_at = datetime('now')");
    }
  }
  if (patch.canvas_id !== undefined) { fields.push('canvas_id = ?'); params.push(patch.canvas_id); }
  if (patch.result !== undefined) { fields.push('result = ?'); params.push(patch.result); }
  if (patch.error !== undefined) { fields.push('error = ?'); params.push(patch.error); }
  if (patch.progressMessage !== undefined) { fields.push('progress_message = ?'); params.push(JSON.stringify(patch.progressMessage)); }

  params.push(id);
  catbotDb.prepare(`UPDATE intent_jobs SET ${fields.join(', ')} WHERE id = ?`).run(...params);
}

export function getIntentJob(id: string): IntentJobRow | undefined {
  return catbotDb.prepare('SELECT * FROM intent_jobs WHERE id = ?').get(id) as IntentJobRow | undefined;
}

export function listJobsByUser(
  userId: string,
  opts?: { status?: IntentJobRow['status']; limit?: number },
): IntentJobRow[] {
  const where: string[] = ['user_id = ?'];
  const params: Array<string | number> = [userId];
  if (opts?.status) { where.push('status = ?'); params.push(opts.status); }
  const limit = opts?.limit ?? 20;
  return catbotDb.prepare(
    `SELECT * FROM intent_jobs WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`
  ).all(...params, limit) as IntentJobRow[];
}

export function getNextPendingJob(): IntentJobRow | undefined {
  // One job at a time to avoid dual-LLM contention
  return catbotDb.prepare(
    `SELECT * FROM intent_jobs WHERE status = 'pending' AND pipeline_phase = 'pending' ORDER BY created_at ASC LIMIT 1`
  ).get() as IntentJobRow | undefined;
}

export function countStuckPipelines(): number {
  const row = catbotDb.prepare(
    `SELECT COUNT(*) as cnt FROM intent_jobs
     WHERE status = 'running' AND updated_at < datetime('now', '-30 minutes')`
  ).get() as { cnt: number };
  return row.cnt;
}
```
**Source:** catbot-db.ts lines 511-555 (knowledge_gaps CRUD) + Phase 129 IntentRow CRUD pattern.

### Pattern 2: Tool Signature for async flag

**What:** Extend existing `ChatTool` type and mark `execute_catflow`, `execute_task`, `process_source_rag` as async
**When to use:** PIPE-02

```typescript
// catbot-tools.ts — extend existing tool entry for execute_catflow at line 249

{
  type: 'function',
  function: {
    name: 'execute_catflow',
    description: 'Ejecuta un CatFlow existente por nombre o ID. ASYNC (>60s): si el usuario lo pide, usa queue_intent_job antes para planificar con un pipeline asistido.',
    parameters: { /* ... existing ... */ },
  },
  async: true,                        // NEW custom field
  estimated_duration_ms: 120_000,     // NEW custom field
} as ChatTool,
```

**IMPORTANT:** The OpenAI tools API spec doesn't allow extra fields at the root level of a tool entry. Two options:
1. **Keep metadata in a separate const map:** `const ASYNC_TOOLS: Record<string, { estimated_duration_ms: number }> = { execute_catflow: { estimated_duration_ms: 120_000 }, execute_task: { estimated_duration_ms: 180_000 }, process_source_rag: { estimated_duration_ms: 240_000 } };` then in `getToolsForLLM` suffix the description with `(ASYNC - estimated ${ms/1000}s)`.
2. **Embed in description only:** Append `[ASYNC:120000]` to descriptions. Simpler but uglier.

**Recommendation:** Option 1 — const map in `catbot-tools.ts` just above `TOOLS[]`. Clean separation, easy to test, easy to extend.

### Pattern 3: 6 New Tools in catbot-tools.ts

**What:** Add to `TOOLS[]` array following `log_knowledge_gap` / Phase 129 intent tool shape
**When to use:** PIPE-02, PIPE-04, PIPE-05, PIPE-07, PIPE-08

```typescript
// --- queue_intent_job (always_allowed) ---
{
  type: 'function',
  function: {
    name: 'queue_intent_job',
    description: 'Encola una peticion compleja (>60s) como intent_job para que el pipeline orchestrator la procese. Llamalo DESPUES de que el usuario confirme que quiere un CatFlow asistido.',
    parameters: {
      type: 'object',
      properties: {
        tool_name: { type: 'string', description: 'Nombre del tool async original (ej: execute_catflow)' },
        tool_args: { type: 'object', description: 'Argumentos originales que el usuario queria pasar' },
        original_request: { type: 'string', description: 'Texto literal de la peticion del usuario' },
      },
      required: ['tool_name', 'original_request'],
    },
  },
},

// --- list_my_jobs (always_allowed) ---
{
  type: 'function',
  function: {
    name: 'list_my_jobs',
    description: 'Lista los intent_jobs del usuario actual (pipelines asistidos activos o recientes). Usalo cuando el usuario pregunta "como va mi pipeline", "que estas diseñando".',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] },
        limit: { type: 'number' },
      },
    },
  },
},

// --- cancel_job (permission-gated: manage_intent_jobs) ---
{
  type: 'function',
  function: {
    name: 'cancel_job',
    description: 'Cancela un intent_job en curso. Usalo cuando el usuario dice "cancela", "para", "no sigas".',
    parameters: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['job_id'],
    },
  },
},

// --- approve_pipeline (permission-gated: manage_intent_jobs) ---
// Called by CatBot when the user says "sí, ejecuta" to a pipeline proposal in chat
{
  type: 'function',
  function: {
    name: 'approve_pipeline',
    description: 'Aprueba un pipeline que esta en pipeline_phase=awaiting_approval. Llamalo cuando el usuario confirma que quiere ejecutar el canvas propuesto.',
    parameters: {
      type: 'object',
      properties: { job_id: { type: 'string' } },
      required: ['job_id'],
    },
  },
},

// --- execute_approved_pipeline (internal — called by approve handler or executor) ---
// Marked always_allowed but only called indirectly. Actually triggers canvas execution.
{
  type: 'function',
  function: {
    name: 'execute_approved_pipeline',
    description: 'Ejecuta un canvas aprobado. Uso interno tras approve_pipeline.',
    parameters: {
      type: 'object',
      properties: { job_id: { type: 'string' } },
      required: ['job_id'],
    },
  },
},

// --- post_execution_decision (permission-gated: manage_intent_jobs) ---
{
  type: 'function',
  function: {
    name: 'post_execution_decision',
    description: 'Registra la decision del usuario sobre el canvas ejecutado. Tres opciones: keep_template (lo guarda como plantilla), save_recipe (lo guarda como recipe reutilizable), delete (lo elimina).',
    parameters: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        action: { type: 'string', enum: ['keep_template', 'save_recipe', 'delete'] },
      },
      required: ['job_id', 'action'],
    },
  },
},
```

**executeTool switch cases:**
```typescript
case 'queue_intent_job': {
  const userId = context?.userId ?? 'web:default';
  const channel = context?.channel ?? 'web';
  const channelRef = context?.channelRef ?? null;
  const jobId = createIntentJob({
    userId,
    channel,
    channelRef: channelRef ?? undefined,
    toolName: args.tool_name as string,
    toolArgs: args.tool_args as Record<string, unknown> ?? {},
  });
  return { name, result: { queued: true, job_id: jobId, message: 'Pipeline encolado. En breve te enviare la propuesta.' } };
}

case 'list_my_jobs': {
  const userId = context?.userId ?? 'web:default';
  const jobs = listJobsByUser(userId, {
    status: args.status as IntentJobRow['status'] | undefined,
    limit: (args.limit as number | undefined) ?? 10,
  });
  return { name, result: { count: jobs.length, jobs: jobs.map(j => ({
    id: j.id,
    status: j.status,
    pipeline_phase: j.pipeline_phase,
    tool_name: j.tool_name,
    progress_message: j.progress_message ? JSON.parse(j.progress_message) : {},
    created_at: j.created_at,
  })) } };
}

case 'cancel_job': {
  updateIntentJob(args.job_id as string, {
    status: 'cancelled',
    pipeline_phase: 'cancelled',
    error: (args.reason as string) ?? 'Cancelled by user',
  });
  return { name, result: { cancelled: true, job_id: args.job_id } };
}

case 'approve_pipeline': {
  const job = getIntentJob(args.job_id as string);
  if (!job) return { name, result: { error: 'Job not found' } };
  if (job.pipeline_phase !== 'awaiting_approval') {
    return { name, result: { error: `Job is in phase ${job.pipeline_phase}, cannot approve` } };
  }
  updateIntentJob(job.id, { pipeline_phase: 'running', status: 'running' });
  // Kick canvas execution via existing endpoint
  await fetch(`${baseUrl}/api/canvas/${job.canvas_id}/execute`, { method: 'POST' });
  return { name, result: { approved: true, canvas_id: job.canvas_id } };
}

case 'post_execution_decision': {
  const job = getIntentJob(args.job_id as string);
  if (!job || !job.canvas_id) return { name, result: { error: 'Job or canvas not found' } };
  const action = args.action as 'keep_template' | 'save_recipe' | 'delete';
  if (action === 'keep_template') {
    db.prepare('UPDATE canvases SET is_template = 1 WHERE id = ?').run(job.canvas_id);
  } else if (action === 'save_recipe') {
    const progress = JSON.parse(job.progress_message) as { goal?: string; tasks?: unknown[] };
    saveMemory({
      userId: job.user_id,
      triggerPatterns: [progress.goal ?? job.tool_name ?? ''].filter(Boolean),
      steps: (progress.tasks as Record<string, unknown>[]) ?? [],
    });
  } else {
    db.prepare('DELETE FROM canvases WHERE id = ?').run(job.canvas_id);
  }
  updateIntentJob(job.id, { result: `post_execution: ${action}` });
  return { name, result: { action_applied: action, job_id: job.id } };
}
```

**getToolsForLLM permission gate additions (near line 1007-1010):**
```typescript
if (name === 'queue_intent_job' || name === 'list_my_jobs' || name === 'execute_approved_pipeline') return true;
if (name === 'cancel_job' && (allowedActions.includes('manage_intent_jobs') || !allowedActions.length)) return true;
if (name === 'approve_pipeline' && (allowedActions.includes('manage_intent_jobs') || !allowedActions.length)) return true;
if (name === 'post_execution_decision' && (allowedActions.includes('manage_intent_jobs') || !allowedActions.length)) return true;
```

### Pattern 4: PromptAssembler `buildComplexTaskProtocol()` P1 Section

**What:** New P1 section injected alongside `buildIntentProtocol()` and `buildKnowledgeProtocol()`
**When to use:** PIPE-02
**Target:** <800 chars (same budget as Phase 126/129)

```typescript
// catbot-prompt-assembler.ts — append after buildIntentProtocol

function buildComplexTaskProtocol(): string {
  return `## Protocolo de Tareas Complejas

Si una peticion requiere >60s (tools marcados ASYNC o multi-paso pesado), NO ejecutes inline.

### Deteccion
Tools ASYNC: execute_catflow, execute_task, process_source_rag (y cualquiera marcado en su descripcion).

### Flujo
1. Detecta: el usuario pide algo que implica un tool ASYNC.
2. Pregunta: "Esto llevara varios pasos y tiempo. Quieres que prepare un CatFlow asistido? (si/no)"
3. Si SI -> llama \`queue_intent_job({ tool_name, tool_args, original_request })\`. Responde: "Pipeline encolado. Te avisare con la propuesta."
4. Si NO -> ejecuta inline (probablemente fallara por timeout, es decision del usuario).

### Consulta de estado
"Como va?" -> \`list_my_jobs\`. "Cancelalo" -> \`cancel_job\`.

### Tras propuesta
Cuando veas que un job esta en awaiting_approval, NO re-ejecutes. Espera la decision del usuario en el canal original (boton o texto).

### Post-ejecucion
Cuando el canvas termine, pregunta al usuario: "Quieres guardarlo como plantilla, como recipe, o eliminarlo?". Llama \`post_execution_decision({ job_id, action })\`.`;
}
```
**Source:** catbot-prompt-assembler.ts lines 606-621 (buildKnowledgeProtocol pattern), Phase 129 `buildIntentProtocol`.

**Registration (inside `build()` near line 692):**
```typescript
try {
  sections.push({ id: 'complex_task_protocol', priority: 1, content: buildComplexTaskProtocol() });
} catch { /* graceful */ }
```

### Pattern 5: IntentJobExecutor Singleton

**What:** Background worker that picks pending jobs and drives the 3-phase pipeline. Mirrors IntentWorker / AlertService structure EXACTLY.
**When to use:** PIPE-03, PIPE-04, PIPE-06

```typescript
// app/src/lib/services/intent-job-executor.ts — NEW FILE

import {
  getNextPendingJob,
  updateIntentJob,
  getIntentJob,
  type IntentJobRow,
} from '@/lib/catbot-db';
import { logger } from '@/lib/logger';
import { createNotification } from '@/lib/services/notifications';
import {
  STRATEGIST_PROMPT,
  DECOMPOSER_PROMPT,
  ARCHITECT_PROMPT,
} from './catbot-pipeline-prompts';
import db from '@/lib/db';
import { generateId } from '@/lib/utils';

const CHECK_INTERVAL = 30 * 1000;   // 30s — faster than worker because pipeline needs responsiveness
const BOOT_DELAY = 60_000;          // 60s — after IntentWorker (45s)

export class IntentJobExecutor {
  private static intervalId: ReturnType<typeof setInterval> | null = null;
  private static timeoutId: ReturnType<typeof setTimeout> | null = null;
  private static currentJobId: string | null = null;  // prevent overlap

  static start(): void {
    logger.info('intent-job-executor', 'Starting with boot delay', { delayMs: BOOT_DELAY });
    this.timeoutId = setTimeout(() => {
      this.tick().catch(err => logger.error('intent-job-executor', 'Tick error', { error: String(err) }));
      this.intervalId = setInterval(() => {
        this.tick().catch(err => logger.error('intent-job-executor', 'Tick error', { error: String(err) }));
      }, CHECK_INTERVAL);
    }, BOOT_DELAY);
  }

  static stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.intervalId = null;
    this.timeoutId = null;
  }

  static async tick(): Promise<void> {
    if (this.currentJobId) {
      logger.info('intent-job-executor', 'Skipping tick — job in progress', { jobId: this.currentJobId });
      return;
    }

    const job = getNextPendingJob();
    if (!job) return;

    this.currentJobId = job.id;
    logger.info('intent-job-executor', 'Processing job', { jobId: job.id, toolName: job.tool_name });

    try {
      // Phase 1: Strategist — define the goal
      updateIntentJob(job.id, { pipeline_phase: 'strategist' });
      const strategistOutput = await this.callLLM(STRATEGIST_PROMPT, this.buildStrategistInput(job));
      const goal = this.parseJSON(strategistOutput, 'goal');

      updateIntentJob(job.id, { progressMessage: { phase: 'strategist', goal, message: 'Objetivo definido' } });
      await this.notifyProgress(job, 'Definiendo objetivo...');

      // Phase 2: Decomposer — break goal into tasks
      updateIntentJob(job.id, { pipeline_phase: 'decomposer' });
      const decomposerOutput = await this.callLLM(DECOMPOSER_PROMPT, JSON.stringify({ goal, original: job.tool_args }));
      const tasks = this.parseJSON(decomposerOutput, 'tasks');

      updateIntentJob(job.id, { progressMessage: { phase: 'decomposer', goal, tasks, message: 'Tareas identificadas' } });
      await this.notifyProgress(job, `${(tasks as unknown[]).length} tareas identificadas`);

      // Phase 3: Architect — design the canvas flow_data
      updateIntentJob(job.id, { pipeline_phase: 'architect' });
      const resources = await this.scanResources();
      const architectOutput = await this.callLLM(
        ARCHITECT_PROMPT,
        JSON.stringify({ goal, tasks, resources })
      );
      const design = this.parseJSON(architectOutput, 'design') as {
        flow_data: { nodes: unknown[]; edges: unknown[] };
        name: string;
        description: string;
        needs_cat_paws?: Array<{ name: string; system_prompt: string; reason: string }>;
      };

      // If new CatPaws needed, pause and ask user
      if (design.needs_cat_paws && design.needs_cat_paws.length > 0) {
        updateIntentJob(job.id, {
          pipeline_phase: 'awaiting_user',
          progressMessage: {
            phase: 'architect',
            goal,
            tasks,
            cat_paws_needed: design.needs_cat_paws,
            message: `Necesito crear ${design.needs_cat_paws.length} CatPaws nuevos`,
          },
        });
        await this.notifyUserCatPawApproval(job, design.needs_cat_paws);
        return;  // Resume on next tick when user approves
      }

      // Create the canvas
      const canvasId = generateId();
      db.prepare(`
        INSERT INTO canvases (id, name, description, mode, status, flow_data)
        VALUES (?, ?, ?, 'mixed', 'idle', ?)
      `).run(canvasId, design.name, design.description, JSON.stringify(design.flow_data));

      updateIntentJob(job.id, {
        canvas_id: canvasId,
        pipeline_phase: 'awaiting_approval',
        progressMessage: {
          phase: 'architect',
          goal,
          tasks,
          resources,
          canvas_id: canvasId,
          message: 'Propuesta lista. Esperando aprobacion.',
        },
      });

      await this.sendProposal(job, canvasId, goal, tasks);
      logger.info('intent-job-executor', 'Proposal sent', { jobId: job.id, canvasId });

    } catch (err) {
      logger.error('intent-job-executor', 'Pipeline failed', { jobId: job.id, error: String(err) });
      updateIntentJob(job.id, { status: 'failed', error: String(err) });
    } finally {
      this.currentJobId = null;
    }
  }

  // --- Helpers (see Pattern 6 for LLM call, Pattern 7 for notifications) ---
  private static async callLLM(systemPrompt: string, userInput: string): Promise<string> { /* see Pattern 6 */ }
  private static parseJSON(raw: string, key: string): unknown { /* JSON.parse with fallback */ }
  private static buildStrategistInput(job: IntentJobRow): string { /* tool_name + tool_args + original */ }
  private static async scanResources(): Promise<Record<string, unknown>> {
    // Query list_catbrains, list_cat_paws (active), list_skills, list_connectors directly from DB
    const catPaws = db.prepare("SELECT id, name, description, mode, system_prompt FROM cat_paws WHERE is_active = 1 LIMIT 50").all();
    const catBrains = db.prepare("SELECT id, name, description FROM catbrains LIMIT 50").all();
    const skills = db.prepare("SELECT id, name, description FROM skills LIMIT 50").all();
    const connectors = db.prepare("SELECT id, name, type FROM connectors LIMIT 50").all();
    return { catPaws, catBrains, skills, connectors };
  }
  private static async notifyProgress(job: IntentJobRow, message: string): Promise<void> { /* see Pattern 7 */ }
  private static async sendProposal(job: IntentJobRow, canvasId: string, goal: unknown, tasks: unknown): Promise<void> { /* see Pattern 7 */ }
  private static async notifyUserCatPawApproval(job: IntentJobRow, needs: Array<{name: string; system_prompt: string; reason: string}>): Promise<void> { /* see Pattern 7 */ }
}
```
**Source:** alert-service.ts lines 40-103, intent-worker.ts (Phase 129).

**instrumentation.ts registration (after IntentWorker.start()):**
```typescript
try {
  const { IntentJobExecutor } = await import('@/lib/services/intent-job-executor');
  IntentJobExecutor.start();
} catch (err) {
  console.error('[instrumentation] Failed to start IntentJobExecutor:', err);
}
```

### Pattern 6: Direct LiteLLM Call Helper (3 sequential calls, not tool loop)

**What:** Simple fetch wrapper, NO tool catalog, NO PromptAssembler overhead
**When to use:** PIPE-03 — each pipeline phase is one independent LLM completion

```typescript
// intent-job-executor.ts — private helper
private static async callLLM(systemPrompt: string, userInput: string): Promise<string> {
  const litellmUrl = process['env']['LITELLM_URL'] || 'http://litellm:4000';
  const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
  const model = process['env']['CATBOT_PIPELINE_MODEL'] || 'ollama/gemma3:12b';

  const res = await fetch(`${litellmUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${litellmKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput },
      ],
      temperature: 0.3,        // low for structured JSON output
      max_tokens: 4000,
      response_format: { type: 'json_object' },  // force JSON
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LiteLLM error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '{}';
}
```
**Source:** canvas-executor.ts lines 97-125 (callLLM pattern) + catbot-summary.ts LLM compaction (Phase 123 — already uses json_object response_format).

**The 3 system prompts (~500 chars each, in `catbot-pipeline-prompts.ts`):**
```typescript
export const STRATEGIST_PROMPT = `Eres un estratega de pipelines. Recibes una peticion del usuario (tool original + args) y devuelves un objetivo claro y accionable en JSON.
Responde SOLO con JSON de forma:
{ "goal": "descripcion concisa del objetivo final en <200 chars", "success_criteria": ["criterio 1", "criterio 2"], "estimated_steps": N }`;

export const DECOMPOSER_PROMPT = `Eres un despiezador de tareas. Recibes un objetivo y lo divides en 3-8 tareas secuenciales o paralelas. Cada tarea debe ser atomica (una sola operacion) y describir QUE hacer, no COMO.
Responde SOLO con JSON de forma:
{ "tasks": [
  { "id": "t1", "name": "...", "description": "...", "depends_on": [], "expected_output": "..." },
  ...
] }`;

export const ARCHITECT_PROMPT = `Eres un arquitecto de CatFlow. Recibes un objetivo + tareas + inventario de recursos (catPaws, catBrains, skills, connectors existentes). Debes mapear cada tarea a un nodo del canvas reutilizando recursos cuando sea posible.

Para cada tarea, elige el tipo de nodo:
- "agent" (referencia a cat_paws.id via data.agentId) si hay un CatPaw adecuado
- "catbrain" (referencia a catbrains.id via data.catbrainId) para busquedas RAG
- "connector" para email, http, n8n
- "condition" / "iterator" para control de flujo

Si NO hay un CatPaw adecuado para una tarea, NO inventes un id. En su lugar, incluyelo en needs_cat_paws.

Responde SOLO con JSON de forma:
{
  "name": "Nombre del canvas <50 chars",
  "description": "Descripcion <200 chars",
  "flow_data": {
    "nodes": [ { "id": "n1", "type": "agent"|"catbrain"|"connector"|"condition", "data": { "agentId": "...", "instructions": "..." }, "position": { "x": 100, "y": 100 } }, ... ],
    "edges": [ { "id": "e1", "source": "n1", "target": "n2" }, ... ]
  },
  "needs_cat_paws": [ { "name": "...", "system_prompt": "...", "reason": "..." } ] (opcional, solo si falta uno)
}`;
```

### Pattern 7: Cross-Channel Notification (Web + Telegram inline keyboard)

**What:** Insert a notification row AND (if channel=telegram) call a new `sendMessageWithInlineKeyboard` helper
**When to use:** PIPE-05

**Extend `NotificationType` union in notifications.ts line 7:**
```typescript
export type NotificationType = 'process' | 'rag' | 'task' | 'canvas' | 'connector' | 'system' | 'catflow_pipeline';
```

**Approval notification from executor:**
```typescript
private static async sendProposal(job: IntentJobRow, canvasId: string, goal: unknown, tasks: unknown): Promise<void> {
  const taskList = (tasks as Array<{ name: string }>).map(t => `• ${t.name}`).join('\n');
  const body = `**Objetivo:** ${goal}\n\n**Plan:**\n${taskList}\n\n¿Ejecutar este CatFlow?`;

  // Dashboard notification (always)
  createNotification({
    type: 'catflow_pipeline',
    title: 'Pipeline listo para aprobar',
    message: body,
    severity: 'info',
    link: `/catflow/${canvasId}`,
  });

  // Telegram inline keyboard (if applicable)
  if (job.channel === 'telegram' && job.channel_ref) {
    const chatId = parseInt(job.channel_ref, 10);
    const { telegramBot } = await import('@/lib/services/telegram-bot');
    await telegramBot.sendMessageWithInlineKeyboard(chatId, body, [
      [
        { text: '✅ Ejecutar', callback_data: `pipeline:${job.id}:approve` },
        { text: '❌ Cancelar', callback_data: `pipeline:${job.id}:reject` },
      ],
    ]);
  }
}
```

**New helpers on TelegramBotService:**
```typescript
// telegram-bot.ts — append near sendMessage (line 689)

async sendMessageWithInlineKeyboard(
  chatId: number,
  text: string,
  keyboard: Array<Array<{ text: string; callback_data: string }>>,
): Promise<void> {
  const url = `${TELEGRAM_API}${this.token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.error('telegram', 'sendMessageWithInlineKeyboard failed', { chatId, status: res.status, body });
  }
}

private async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await fetch(`${TELEGRAM_API}${this.token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text: text ?? '' }),
  }).catch(err => logger.warn('telegram', 'answerCallbackQuery failed', { error: (err as Error).message }));
}
```

**TelegramUpdate type extension + callback_query handler:**
```typescript
// Extend existing interface at line 30
interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  chat_instance: string;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;   // NEW
}

// Extend processUpdate at line 297
private async processUpdate(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    await this.processCallbackQuery(update.callback_query);
    return;
  }
  const msg = update.message;
  if (!msg || !msg.text) return;
  // ... existing message handling
}

private async processCallbackQuery(cq: TelegramCallbackQuery): Promise<void> {
  if (!cq.data || !cq.message) return;
  const chatId = cq.message.chat.id;

  // Ack the button press immediately (removes loading spinner)
  await this.answerCallbackQuery(cq.id, 'Procesando...');

  // Parse: "pipeline:<jobId>:<action>"
  const [kind, jobId, action] = cq.data.split(':');
  if (kind !== 'pipeline' || !jobId || !action) return;

  const baseUrl = process['env']['INTERNAL_BASE_URL'] || 'http://localhost:3000';
  try {
    if (action === 'approve') {
      await fetch(`${baseUrl}/api/intent-jobs/${jobId}/approve`, { method: 'POST' });
      await this.sendMessage(chatId, '✅ Pipeline aprobado. Ejecutando...');
    } else if (action === 'reject') {
      await fetch(`${baseUrl}/api/intent-jobs/${jobId}/reject`, { method: 'POST' });
      await this.sendMessage(chatId, '❌ Pipeline cancelado.');
    }
  } catch (err) {
    logger.error('telegram', 'Pipeline action failed', { jobId, action, error: (err as Error).message });
    await this.sendMessage(chatId, '⚠️ Error procesando tu decision. Intenta de nuevo.');
  }
}
```

**CRITICAL FINDING (Integration gap):** `telegram-bot.ts` has ZERO existing `callback_query` handling. The current `TelegramUpdate` interface (line 30-33) only has `message`. This means Plan 04 must also add a small `telegramBot` singleton export if one doesn't already exist (grep shows `TelegramBotService` is a class — verify in planning whether there's already a singleton getter or whether we need to add `export const telegramBot = TelegramBotService.getInstance();`).

### Pattern 8: AlertService `checkStuckPipelines` (Phase 128 integration)

**What:** New check in AlertService tick array
**When to use:** Plan 05

```typescript
// alert-service.ts — new method near checkIntentsUnresolved (Phase 129)
const STUCK_PIPELINE_THRESHOLD_MIN = 30;

static async checkStuckPipelines(): Promise<void> {
  const row = catbotDb.prepare(
    `SELECT COUNT(*) AS cnt FROM intent_jobs
     WHERE status = 'running' AND updated_at < datetime('now', '-${STUCK_PIPELINE_THRESHOLD_MIN} minutes')`
  ).get() as { cnt: number };

  if (row.cnt > 0) {
    this.insertAlert(
      'execution',
      'pipelines_stuck',
      'Pipelines atascados',
      `Hay ${row.cnt} intent_jobs en estado running sin actualizarse en >${STUCK_PIPELINE_THRESHOLD_MIN} minutos`,
      'warning',
      JSON.stringify({ count: row.cnt, threshold_min: STUCK_PIPELINE_THRESHOLD_MIN }),
    );
  }
}
```
**Register in checks array alongside `checkIntentsUnresolved`.**

### Anti-Patterns to Avoid

- **Re-entering `/api/catbot/chat` for pipeline phases:** Each phase is ONE completion call, not a full CatBot conversation. Going through route.ts would load the full tool catalog (52+ tools), PromptAssembler (~10K tokens), budget truncation, profile injection — all useless for a structured JSON output. Use a minimal direct LiteLLM fetch.
- **Processing multiple jobs per tick:** The `currentJobId` guard enforces ONE job at a time. Parallel pipelines would cause LLM quota spikes and canvas_id collisions if two architects run simultaneously. Accept the latency.
- **Hardcoding canvas flow_data templates:** The whole point of the architect phase is dynamic design based on available resources. Don't build a "template library" — trust the LLM with `response_format: json_object`.
- **Running the executor tick inside the user request:** The entire design is async — `queue_intent_job` returns immediately ("pipeline encolado, te avisare"). The executor tick is the ONLY path that runs the 3 phases. Don't try to "speed it up" by kicking the tick inline from the tool handler.
- **Storing `tool_args` as a plain string instead of JSON:** Always JSON.stringify on write, JSON.parse on read. Steps column in Phase 129 set this precedent.
- **Forgetting to add `callback_query` support to Telegram:** This is a net-new code path. Without it, users on Telegram would see the buttons but nothing happens when tapped. Wave 0 test MUST cover this.
- **Skipping KTREE-02 sync:** All 6 new tools must appear in `settings.json` tools[] array or the sync test fails Docker build.
- **Pipeline triggers itself recursively:** If the strategist decides to call `execute_catflow` as a step, and that tool is marked async, could the executor loop forever? Guard: set a `pipeline_depth` tracking or simply forbid async tools inside the architect's generated flow_data at the executor layer.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 3-phase LLM orchestration | Custom chain-of-thought / ReAct loop | 3 sequential direct LLM calls with specialized system prompts + JSON response_format | LLM quality is already sufficient; complexity is in state machine, not prompting |
| Canvas design from scratch | Template library + pattern matcher | LiteLLM with architect prompt + resources inventory | The existing flow_data format is already a DSL — let the LLM generate it |
| Approval UI | Custom React modal system | `notifications` table + existing dashboard polling + Telegram InlineKeyboard | Both channels already have infrastructure, just new payload type |
| Background execution | Custom job queue | Existing `/api/canvas/{id}/execute` endpoint + canvas-executor.ts | Canvas executor is battle-tested, just hand it a canvas_id |
| CatPaw creation | Custom LLM prompt-to-CatPaw flow | Existing `create_cat_paw` tool (catbot-tools.ts line 86) | Already handles schema validation, permissions, knowledge tree |
| Post-execution template save | New "template" table | `UPDATE canvases SET is_template = 1` (column already exists, db.ts line 988) | Zero schema work |
| Post-execution recipe save | New recipe writer | Existing `saveMemory()` function (catbot-db.ts line 348) | Phase 122 already built this |
| Stuck pipeline detection | Custom monitor | `AlertService.checkStuckPipelines()` following Phase 128 pattern | Re-uses alert infrastructure |
| Cross-user isolation for jobs | Custom auth layer | `context.userId` from route.ts (Phase 121 pattern) + USER_SCOPED_TOOLS list | Phase 124 decision already covers this |

**Key insight:** 95% of Phase 130 is plumbing existing primitives together. The only genuinely new code is (a) the 3-phase executor state machine, (b) Telegram `callback_query` handling, and (c) the `post_execution_decision` branching.

## Common Pitfalls

### Pitfall 1: Telegram Bot Has No callback_query Support Yet
**What goes wrong:** User taps "Ejecutar" button on Telegram, nothing happens. Log shows nothing because `processUpdate` drops the update entirely (`if (!msg || !msg.text) return;` at line 299 discards updates without a message field).
**Why it happens:** The Telegram update schema used in `TelegramUpdate` interface (line 30-33) only declares `message`. A `callback_query` update has no `message` field at the top level, so current code silently ignores it.
**How to avoid:** Plan 04 must add `callback_query?: TelegramCallbackQuery` to the interface AND add a new branch in `processUpdate` BEFORE the `if (!msg)` check. See Pattern 7 for exact code. Test with `telegram-callback-query.test.ts` (Wave 0).
**Warning signs:** Buttons don't respond. Logs are silent during taps.

### Pitfall 2: canvas_id Foreign Key Lives in docflow.db, intent_jobs in catbot.db
**What goes wrong:** You can't use a real SQL foreign key between `intent_jobs.canvas_id` and `canvases.id` because they're in different SQLite files.
**Why it happens:** The dual-DB architecture (Phase 118 decision) keeps CatBot state in catbot.db and platform data in docflow.db. Cross-DB FKs are impossible.
**How to avoid:** Treat `intent_jobs.canvas_id` as an opaque TEXT reference. On read, always check for existence: `const canvas = db.prepare('SELECT * FROM canvases WHERE id = ?').get(canvasId)`. Delete-cascade doesn't work — if user deletes a canvas, orphan intent_jobs remain. Add a periodic cleanup in IntentJobExecutor tick (delete completed jobs whose canvas is gone) OR accept the orphans and let `list_my_jobs` filter them out.
**Warning signs:** `list_my_jobs` returns jobs with canvas_id pointing to nonexistent canvases.

### Pitfall 3: LLM Returns Non-JSON Despite response_format
**What goes wrong:** `JSON.parse` throws, pipeline crashes, job stuck in 'strategist' or 'architect' phase forever.
**Why it happens:** `response_format: { type: 'json_object' }` is respected by Gemma3 12b in most cases but not all. Some Libre tier models ignore it and return markdown-fenced JSON.
**How to avoid:** Wrap `JSON.parse` in a try/catch. On fail, strip markdown fences (`const clean = raw.replace(/^```json\s*/, '').replace(/```\s*$/, '')`) and try again. On second fail, mark job failed with explicit error. Similar to Phase 123 SummaryService retry pattern.
**Warning signs:** Jobs in 'strategist' phase with `updated_at` stuck for hours. Logs show `SyntaxError: Unexpected token`.

### Pitfall 4: Pipeline Processes Same Job Repeatedly
**What goes wrong:** `getNextPendingJob()` returns the same job every tick, IntentJobExecutor keeps re-running it.
**Why it happens:** The query filters `status='pending' AND pipeline_phase='pending'`. If a tick crashes mid-flight BEFORE updating the phase, the job stays in that state. Also: the `currentJobId` guard is in-memory only, so on server restart the in-flight job is abandoned.
**How to avoid:** Update phase to 'strategist' as the FIRST thing in the tick, before any LLM call. On boot, clean up orphans: `UPDATE intent_jobs SET status='failed', error='Abandoned on restart' WHERE status='pending' AND pipeline_phase != 'pending'`.
**Warning signs:** Logs show same job id being picked every 30s.

### Pitfall 5: IntentJobExecutor and IntentWorker Race on catbot.db WAL
**What goes wrong:** Both workers tick at overlapping times and one gets SQLITE_BUSY.
**Why it happens:** Even with WAL, write contention can still occur when two workers update the same table. Phase 129 decision staggered IntentWorker BOOT_DELAY to 45s after AlertService's 30s. We should stagger IntentJobExecutor to 60s.
**How to avoid:** BOOT_DELAY=60s. Also keep transactions short — never wrap an LLM call inside a BEGIN/COMMIT. `busy_timeout=5000` is already set.
**Warning signs:** `SQLITE_BUSY` in logs, especially during first minute after start.

### Pitfall 6: KTREE-02 Sync Test Fails After Adding 6 Tools
**What goes wrong:** Docker build red because new tools don't appear in any knowledge JSON.
**Why it happens:** Phase 125 added `knowledge-tools-sync.test.ts` that enforces every TOOLS entry appears in at least one `tools[]` array across `app/data/knowledge/*.json`.
**How to avoid:** Add all 6 new tool names to `settings.json` tools[] in the same commit that adds them to `catbot-tools.ts`. Run `cd app && npx vitest run src/lib/__tests__/knowledge-tools-sync.test.ts` before push.
**Warning signs:** CI failure with "tool X not found in any knowledge JSON".

### Pitfall 7: `progress_message` JSON Grows Unbounded
**What goes wrong:** The tasks array and flow_data reference get stored in every progress_message update, bloating the column to 100KB+ per job.
**Why it happens:** Each phase update includes the cumulative state (goal + tasks + resources).
**How to avoid:** Only store REFERENCES, not full content: `{ phase, goal_summary: goal.slice(0, 200), task_count: tasks.length, canvas_id, message }`. The full data stays in the canvas itself.
**Warning signs:** catbot.db size growing rapidly, slow intent_jobs queries.

### Pitfall 8: Architect Generates flow_data With Invalid Node Types
**What goes wrong:** Architect outputs `"type": "pipeline"` or `"type": "workflow"` which canvas-executor doesn't know, executor crashes at runtime.
**Why it happens:** Canvas executor switches on `node.type` expecting: `'agent' | 'catpaw' | 'catbrain' | 'condition' | 'iterator' | 'multiagent' | 'scheduler' | 'checkpoint'` (see canvas-executor.ts line 461+).
**How to avoid:** Include the EXACT list of valid node types in the ARCHITECT_PROMPT. Add post-validation in the executor before `INSERT INTO canvases`: iterate nodes, reject any with unknown type, mark job failed with "architect generated invalid node type X".
**Warning signs:** Canvas run fails immediately with "unknown node type".

### Pitfall 9: Cross-User Data Leak in list_my_jobs
**What goes wrong:** Telegram user A sees user B's pipelines.
**Why it happens:** If `context.userId` is not plumbed correctly from route.ts into executeTool, it defaults to `'web:default'`, and all jobs share a single queue.
**How to avoid:** Phase 121 (line 78 STATE.md) + Phase 129 (USER_SCOPED_TOOLS) already enforce this. Add `queue_intent_job`, `list_my_jobs`, `cancel_job`, `approve_pipeline`, `post_execution_decision` to the USER_SCOPED_TOOLS list in catbot-tools.ts. Add a test for user isolation.
**Warning signs:** User A's tests see jobs created by user B.

### Pitfall 10: Unused Imports Break Docker Build
**What goes wrong:** Importing `IntentJobRow` type into `intent-job-executor.ts` but not using it triggers ESLint `no-unused-vars = error`.
**Why it happens:** MEMORY.md `feedback_unused_imports_build.md`. ESLint strict in `next build`.
**How to avoid:** Only import what you actually reference. If you import a type purely for JSDoc, use `import type`. Run `cd app && npm run build` locally before pushing.
**Warning signs:** Green locally with vitest, red in Docker.

### Pitfall 11: LogSource Union Type Missing New Sources
**What goes wrong:** `logger.info('intent-job-executor', ...)` fails TypeScript because `'intent-job-executor'` isn't in the `LogSource` union.
**Why it happens:** `@/lib/logger` defines an explicit union type for source strings. Every new source must be added.
**How to avoid:** Add `'intent-job-executor'` and any other new source strings to the LogSource union in `app/src/lib/logger.ts` as part of Plan 02.
**Warning signs:** TypeScript error on logger calls.

### Pitfall 12: Production DB Contamination in Tests
**What goes wrong:** Running `intent-job-executor.test.ts` against real catbot.db pollutes the production data.
**Why it happens:** catbot-db.ts opens a real DB file on import. Without env override, tests share the same DB.
**How to avoid:** Use the Phase 129 test pattern: `vi.hoisted(() => { process.env.CATBOT_DB_PATH = '/tmp/test-intent-jobs.db'; })` BEFORE any imports. Delete the tmp file in beforeEach.
**Warning signs:** Production intent_jobs table has entries with `user_id='test:user'`.

## Code Examples

### intent_jobs CRUD test (Wave 0)
```typescript
// app/src/lib/__tests__/catbot-intent-jobs.test.ts
import { vi } from 'vitest';
vi.hoisted(() => { process.env.CATBOT_DB_PATH = '/tmp/test-intent-jobs.db'; });

import { describe, it, expect, beforeEach } from 'vitest';
import { createIntentJob, updateIntentJob, getIntentJob, listJobsByUser, getNextPendingJob } from '@/lib/catbot-db';

describe('intent_jobs CRUD', () => {
  beforeEach(() => {
    // DELETE FROM intent_jobs
  });

  it('creates and retrieves a job', () => {
    const id = createIntentJob({
      userId: 'test:user',
      toolName: 'execute_catflow',
      toolArgs: { identifier: 'my-flow' },
    });
    const job = getIntentJob(id)!;
    expect(job.tool_name).toBe('execute_catflow');
    expect(JSON.parse(job.tool_args!)).toEqual({ identifier: 'my-flow' });
    expect(job.status).toBe('pending');
    expect(job.pipeline_phase).toBe('pending');
  });

  it('updates progressMessage as structured JSON', () => {
    const id = createIntentJob({ userId: 'test:user', toolName: 'execute_task' });
    updateIntentJob(id, { progressMessage: { phase: 'strategist', goal: 'test goal' } });
    const job = getIntentJob(id)!;
    expect(JSON.parse(job.progress_message)).toEqual({ phase: 'strategist', goal: 'test goal' });
  });

  it('isolates jobs by user', () => {
    createIntentJob({ userId: 'user:a', toolName: 'execute_catflow' });
    createIntentJob({ userId: 'user:b', toolName: 'execute_catflow' });
    expect(listJobsByUser('user:a')).toHaveLength(1);
    expect(listJobsByUser('user:b')).toHaveLength(1);
  });

  it('getNextPendingJob returns oldest pending', async () => {
    const id1 = createIntentJob({ userId: 'test:user', toolName: 'a' });
    await new Promise(r => setTimeout(r, 10));
    const id2 = createIntentJob({ userId: 'test:user', toolName: 'b' });
    const next = getNextPendingJob()!;
    expect(next.id).toBe(id1);
  });
});
```

### IntentJobExecutor tick test (Wave 0)
```typescript
describe('IntentJobExecutor', () => {
  it('advances job from pending through all phases (happy path, mocked LLM)', async () => {
    // Mock callLLM via vi.spyOn to return canned JSON for each phase
    vi.spyOn(IntentJobExecutor as any, 'callLLM')
      .mockResolvedValueOnce(JSON.stringify({ goal: 'test goal' }))
      .mockResolvedValueOnce(JSON.stringify({ tasks: [{ id: 't1', name: 'step 1' }] }))
      .mockResolvedValueOnce(JSON.stringify({
        name: 'Test Canvas', description: 'desc',
        flow_data: { nodes: [], edges: [] },
      }));

    const id = createIntentJob({ userId: 'test:user', toolName: 'execute_catflow' });
    await IntentJobExecutor.tick();

    const job = getIntentJob(id)!;
    expect(job.pipeline_phase).toBe('awaiting_approval');
    expect(job.canvas_id).toBeTruthy();
  });

  it('pauses at awaiting_user when architect needs new CatPaws', async () => {
    vi.spyOn(IntentJobExecutor as any, 'callLLM')
      .mockResolvedValueOnce(JSON.stringify({ goal: 'g' }))
      .mockResolvedValueOnce(JSON.stringify({ tasks: [] }))
      .mockResolvedValueOnce(JSON.stringify({
        name: 'X', description: 'Y',
        flow_data: { nodes: [], edges: [] },
        needs_cat_paws: [{ name: 'Scraper', system_prompt: 'scrape', reason: 'no scraper exists' }],
      }));

    const id = createIntentJob({ userId: 'test:user', toolName: 'execute_catflow' });
    await IntentJobExecutor.tick();

    const job = getIntentJob(id)!;
    expect(job.pipeline_phase).toBe('awaiting_user');
    expect(job.canvas_id).toBeNull();
  });

  it('marks job failed on LLM error', async () => {
    vi.spyOn(IntentJobExecutor as any, 'callLLM').mockRejectedValueOnce(new Error('litellm 500'));
    const id = createIntentJob({ userId: 'test:user', toolName: 'execute_task' });
    await IntentJobExecutor.tick();
    const job = getIntentJob(id)!;
    expect(job.status).toBe('failed');
    expect(job.error).toContain('litellm');
  });
});
```

### Telegram callback_query test (Wave 0)
```typescript
describe('TelegramBot callback_query', () => {
  it('parses pipeline:<id>:approve and calls approve endpoint', async () => {
    const bot = new TelegramBotService(/* mocks */);
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await (bot as any).processCallbackQuery({
      id: 'cb1',
      from: { id: 1, first_name: 'T' },
      message: { message_id: 1, chat: { id: 123, type: 'private' }, date: 0 },
      chat_instance: 'ci',
      data: 'pipeline:job-abc:approve',
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/intent-jobs/job-abc/approve'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('ignores non-pipeline callback_data', async () => {
    // Should not call any fetch
  });
});
```

### Flow_data reference structure (for architect prompt context)
```json
{
  "nodes": [
    {
      "id": "n1",
      "type": "agent",
      "data": {
        "agentId": "cat_paw-xyz123",
        "instructions": "Extract customer email from the input",
        "useRag": false
      },
      "position": { "x": 100, "y": 100 }
    },
    {
      "id": "n2",
      "type": "catbrain",
      "data": {
        "catbrainId": "catbrain-website-docs",
        "ragQuery": "billing policies"
      },
      "position": { "x": 400, "y": 100 }
    },
    {
      "id": "n3",
      "type": "condition",
      "data": {
        "condition": "output.intent === 'refund'"
      },
      "position": { "x": 700, "y": 100 }
    }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2" },
    { "id": "e2", "source": "n2", "target": "n3" }
  ]
}
```
**Source:** canvas-executor.ts lines 461-600 (agent/catpaw/catbrain case handlers define the expected `data` shape for each node type).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CatBot attempts complex tasks synchronously (times out at 60s) | Detects complexity → queues pipeline → async approval flow | Phase 130 (this) | Users never hit the 60s timeout on complex requests |
| Canvases are designed manually by users | AI-assisted design with resource reuse | Phase 130 (this) | Lower barrier to creating workflows |
| Approval dialogs are chat-only | Cross-channel (dashboard notification + Telegram inline keyboard) | Phase 130 (this) | Users can approve pipelines from their preferred channel |
| Canvases accumulate as garbage after one-shot use | Explicit lifecycle (template/recipe/delete) post-execution | Phase 130 (this) | No canvas landfill |
| Pipeline orchestration via explicit code | LLM-driven with 3 specialized system prompts | Phase 130 (this) | Adapts to new tools/resources without code changes |

## Open Questions

1. **Does `telegramBot` exist as a singleton export?**
   - What we know: `TelegramBotService` is a class in telegram-bot.ts.
   - What's unclear: Is there already a module-level singleton instance exported (e.g., `export const telegramBot = ...`)? The executor needs to import and call it.
   - Recommendation: grep `telegram-bot.ts` for `export const|export default`. If none exists, Plan 04 adds one OR instantiates it lazily in `IntentJobExecutor.sendProposal`.

2. **Permission action key for intent_jobs**
   - What we know: Existing keys: `manage_profile`, `manage_knowledge`, `manage_intents`, `create_agents`.
   - What's unclear: Whether to introduce `manage_intent_jobs` or reuse `manage_intents`.
   - Recommendation: New key `manage_intent_jobs`. Plan 01 default-allows when `!allowedActions.length` (matches existing pattern). Plan 05 adds checkbox to Settings CatBot config UI.

3. **Where to pass `channel_ref` through the stack**
   - What we know: `context.userId` is plumbed from route.ts. Telegram path uses `telegram:{chat_id}` as userId.
   - What's unclear: The executor needs the raw `chat_id` to send Telegram messages. Storing it redundantly in `intent_jobs.channel_ref` is fine, but we need to extract it from `userId` OR pass it explicitly via `context.channelRef`.
   - Recommendation: Extend `ToolContext` with optional `channelRef?: string`. Telegram bot passes `chat_id` explicitly; web passes null. Matches Phase 129 pattern (`context.channel` already exists).

4. **Should `approve_pipeline` tool be LLM-callable at all?**
   - What we know: User approval can come via chat ("sí, ejecuta") OR Telegram button.
   - What's unclear: If the user says "sí, ejecuta" in chat, does CatBot call `approve_pipeline` as a tool, or does CatBot call the approve endpoint directly?
   - Recommendation: Expose as a tool. CatBot calls `approve_pipeline(job_id)`. The Telegram button also hits the endpoint. Both paths converge on `IntentJobExecutor.resumeApproved(jobId)` or similar.

5. **Post-execution timing — when does CatBot ask about template/recipe/delete?**
   - What we know: Canvas execution is fully async (own polling by canvas-executor).
   - What's unclear: How does CatBot know the canvas finished so it can ask the post-execution question?
   - Recommendation: Add a second worker tick that detects `intent_jobs.status='running'` rows whose canvas_run is `completed`/`failed`. Update the job + send a notification/message with 3 buttons (or prompt in chat). CatBot-in-chat path is simpler: the dashboard/Telegram notification includes the 3 options as buttons mapping to `post_execution_decision(action=...)`.

6. **What flow_data shape does the frontend CatFlow editor expect?**
   - What we know: `canvases.flow_data` TEXT column; canvas-executor parses it expecting `{nodes, edges}`.
   - What's unclear: React Flow editor UI may require additional properties (viewport, handles, etc.).
   - Recommendation: During Plan 03, inspect one existing canvas's `flow_data` from the DB and use it as reference in the ARCHITECT_PROMPT. Keep shape minimal if possible; if editor needs extras, include them.

7. **Do we need a "resumeApproved" helper or does the executor pick it up via next tick?**
   - What we know: After user approves, status moves to 'running' and canvas execution kicks off.
   - What's unclear: Does the tick need to do anything else after approval, or is canvas-executor autonomous from there?
   - Recommendation: Approval handler POSTs to `/api/canvas/{id}/execute` synchronously (fire-and-forget), updates job status, done. No executor involvement. The executor's role ends at `awaiting_approval`.

8. **Cleanup of orphan intent_jobs on server restart**
   - What we know: `currentJobId` in-memory guard is lost on restart. A job mid-pipeline gets stuck.
   - What's unclear: Auto-recover or mark failed?
   - Recommendation: On `IntentJobExecutor.start()`, run `UPDATE intent_jobs SET status='failed', error='Abandoned on restart' WHERE status='pending' AND pipeline_phase NOT IN ('pending', 'awaiting_approval', 'awaiting_user')` BEFORE the first tick.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | `app/vitest.config.ts` |
| Quick run command | `cd ~/docflow/app && npx vitest run src/lib/__tests__/catbot-intent-jobs.test.ts src/lib/__tests__/intent-job-executor.test.ts src/lib/__tests__/catbot-pipeline-prompts.test.ts src/lib/__tests__/telegram-callback-query.test.ts -x` |
| Full suite command | `cd ~/docflow/app && npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIPE-01 | intent_jobs schema + CRUD (createIntentJob, updateIntentJob, getIntentJob, listJobsByUser, getNextPendingJob) | unit | `cd app && npx vitest run src/lib/__tests__/catbot-intent-jobs.test.ts -x` | No — Wave 0 |
| PIPE-02 | async flag on tools visible in description; buildComplexTaskProtocol present in prompt; queue_intent_job tool callable | unit | `cd app && npx vitest run src/lib/__tests__/catbot-intent-jobs.test.ts src/lib/__tests__/catbot-prompt-assembler.test.ts -x` | Partial (extend existing) |
| PIPE-03 | IntentJobExecutor advances through 3 phases with mocked LLM; marks failed on LLM error; respects currentJobId guard | unit | `cd app && npx vitest run src/lib/__tests__/intent-job-executor.test.ts -x` | No — Wave 0 |
| PIPE-04 | Architect pauses pipeline at awaiting_user when needs_cat_paws present; creates canvas with valid flow_data when all resources exist | unit | `cd app && npx vitest run src/lib/__tests__/intent-job-executor.test.ts src/lib/__tests__/catbot-pipeline-prompts.test.ts -x` | No — Wave 0 |
| PIPE-05 | sendMessageWithInlineKeyboard sends valid reply_markup; createNotification uses catflow_pipeline type; approve/reject endpoints return 200 | unit + integration | `cd app && npx vitest run src/lib/__tests__/telegram-callback-query.test.ts src/app/api/intent-jobs/__tests__/approve.test.ts -x` | No — Wave 0 |
| PIPE-06 | approve endpoint transitions phase and calls canvas execute; integration test with mocked fetch | integration | `cd app && npx vitest run src/app/api/intent-jobs/__tests__/approve.test.ts -x` | No — Wave 0 |
| PIPE-07 | post_execution_decision handles keep_template/save_recipe/delete correctly; saveMemory called with correct args | unit | `cd app && npx vitest run src/lib/__tests__/catbot-intent-jobs.test.ts -x` | No — Wave 0 |
| PIPE-08 | list_my_jobs returns parsed progress_message; user isolation enforced; knowledge-tools-sync passes with all 6 new tools | unit + existing sync | `cd app && npx vitest run src/lib/__tests__/catbot-intent-jobs.test.ts src/lib/__tests__/knowledge-tools-sync.test.ts -x` | Partial (extend) |

### Sampling Rate
- **Per task commit:** `cd app && npx vitest run src/lib/__tests__/catbot-intent-jobs.test.ts src/lib/__tests__/intent-job-executor.test.ts src/lib/__tests__/catbot-pipeline-prompts.test.ts src/lib/__tests__/telegram-callback-query.test.ts src/lib/__tests__/knowledge-tools-sync.test.ts -x`
- **Per wave merge:** `cd app && npx vitest run`
- **Phase gate:** Full suite green + Docker build green (`cd app && npm run build`) + CatBot oracle E2E (Plan 05) before `/gsd:verify-work`.

### CatBot Oracle Prompt (per CLAUDE.md) — defined in Plan 05
After implementation:
1. Ask CatBot: "Ejecuta el catflow ComplexPipelineX" (non-existent, long-running) → verify it asks for confirmation first.
2. Say "Sí, prepara el CatFlow asistido" → verify it calls `queue_intent_job`.
3. Wait ~2 minutes → verify IntentJobExecutor runs the 3 phases (check logs for `intent-job-executor` with phase transitions).
4. Verify a notification appears in the dashboard with type 'catflow_pipeline' and title "Pipeline listo para aprobar".
5. If testing Telegram: verify the bot sends a message with "Ejecutar" and "Cancelar" inline buttons.
6. Tap "Ejecutar" or say "sí, ejecuta" → verify canvas execution starts.
7. After canvas completes → verify CatBot asks about template/recipe/delete.
8. Choose "save_recipe" → verify `user_memory` has a new row via `list_my_recipes`.
9. Ask "¿Qué pipelines tengo?" → verify CatBot calls `list_my_jobs` and lists the completed one.
10. Wait 30+ min with a deliberately stuck job → verify AlertService emits `pipelines_stuck`.

### Wave 0 Gaps
- [ ] `app/src/lib/__tests__/catbot-intent-jobs.test.ts` — covers PIPE-01, PIPE-02 (CRUD + tool execution + isolation), PIPE-07 (post_execution_decision branches), PIPE-08 (list_my_jobs)
- [ ] `app/src/lib/__tests__/intent-job-executor.test.ts` — covers PIPE-03, PIPE-04 (3-phase state machine + CatPaw pause)
- [ ] `app/src/lib/__tests__/catbot-pipeline-prompts.test.ts` — covers prompt text constants + JSON parsing contract
- [ ] `app/src/lib/__tests__/telegram-callback-query.test.ts` — covers PIPE-05 (new callback_query handler)
- [ ] `app/src/app/api/intent-jobs/__tests__/approve.test.ts` — covers PIPE-06 (approval endpoint)
- [ ] Extend `app/src/lib/__tests__/catbot-prompt-assembler.test.ts` — buildComplexTaskProtocol section assertions (PIPE-02)
- [ ] Extend `app/src/lib/__tests__/alert-service.test.ts` — checkStuckPipelines test (Plan 05)
- [ ] Extend `knowledge-tools-sync.test.ts` (no file change, just run after adding 6 tools to settings.json)
- [ ] Shared fixture helper to clear intent_jobs table between tests (add to existing test setup)
- [ ] Framework install: none needed — vitest is already the project test framework

## Sources

### Primary (HIGH confidence)
- Codebase: `app/src/lib/catbot-db.ts` lines 34-112 (schema block), 188-196 (KnowledgeGapRow), 345-395 (user_memory CRUD), 511-555 (knowledge_gaps CRUD)
- Codebase: `app/src/lib/db.ts` lines 978-1020 (canvases + canvas_runs schemas), 1116-1125 (notifications schema), 215-217 (canvases external_input)
- Codebase: `app/src/lib/services/canvas-executor.ts` lines 97-125 (callLLM pattern), 461-600 (node type case handlers), 28-57 (CanvasNode/Edge interfaces)
- Codebase: `app/src/lib/services/catbot-tools.ts` lines 86-104 (create_cat_paw), 249+ (execute_catflow tool), 1007-1010 (permission gate), 1525-1559 (execute_catflow executeTool case)
- Codebase: `app/src/lib/services/telegram-bot.ts` lines 11-47 (type definitions — NO callback_query), 297-328 (processUpdate), 685-744 (sendMessage/sendRawMessage)
- Codebase: `app/src/lib/services/alert-service.ts` lines 40-103 (singleton pattern), 253+ (insertAlert signature)
- Codebase: `app/src/lib/services/notifications.ts` lines 7-40 (NotificationType union + createNotification)
- Codebase: `app/src/app/api/catbot/chat/route.ts` lines 340-434 (tool-call loop, executeTool invocation with context)
- Phase 129 RESEARCH.md (patterns for schema append, CRUD mirror, IntentWorker singleton, prompt section <800 chars, KTREE-02 sync, USER_SCOPED_TOOLS)
- Phase 128 RESEARCH.md (AlertService pattern, notification dedup, dual-DB pitfalls)
- STATE.md Phase 121/124/128/129 decisions (context.userId plumbing, USER_SCOPED_TOOLS, BOOT_DELAY stagger, tmp DB test pattern)
- CLAUDE.md project instructions (CatBot oracle protocol, knowledge tree sync, Spanish)
- MEMORY.md (process['env'] bracket notation, force-dynamic, unused imports = ESLint error, better-sqlite3 glibc constraint)

### Secondary (MEDIUM confidence)
- Telegram Bot API reply_markup spec — standard across SDKs, verified via Telegram official docs structure (inline_keyboard is an array of arrays of InlineKeyboardButton objects)
- `response_format: { type: 'json_object' }` support in Ollama Gemma 3 — verified via Phase 123 SummaryService usage (works but not 100% reliable, documented fallback)

### Tertiary (LOW confidence)
- `callLLM` performance (~5-10s per phase for gemma3:12b) — extrapolated from SummaryService observed latency, not measured for architect-sized prompts (~8K tokens of resources inventory)
- Number of tools to mark async initially — CONTEXT.md lists 3 but research did not exhaustively audit TOOLS[] for other candidates. Plan 01 should grep for any tool whose executeTool case does `fetch` to a long-running endpoint or iterates over large data

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all primitives already in project, zero new dependencies
- Architecture: HIGH — 1:1 pattern match with Phase 129 (IntentWorker), Phase 128 (AlertService), canvas-executor callLLM, catbot-tools tool registration
- Pitfalls: HIGH — 12 pitfalls identified from code analysis including the critical Telegram callback_query gap
- Telegram callback_query integration: MEDIUM (no existing code to reference, new from scratch, but Telegram Bot API spec is well-known)
- Flow_data schema for architect: MEDIUM — research did not read a real canvas's full flow_data JSON, recommended verification in Plan 03

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable patterns, no external deps except Telegram Bot API which is extremely stable)
