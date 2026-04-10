# Phase 129: Intent Queue — Promesas Persistentes de CatBot - Research

**Researched:** 2026-04-10
**Domain:** Intent persistence (first-class SQLite-backed request lifecycle) + background retry worker + prompt protocol integration
**Confidence:** HIGH

## Summary

Phase 129 adds a first-class Intent Queue to CatBot: every multi-step or significant user request becomes a row in a new `intents` table in `catbot.db`, tracked through a lifecycle (pending → in_progress → completed / failed / abandoned), retryable by a background worker up to 3 times, and queryable by the user at any time. The design is a pure **overlay on top of the existing tool flow** — CatBot still calls the same tools as today, but wraps multi-step operations with a `create_intent` → execute → `update_intent_status` envelope.

All six requirements (INTENT-01 through INTENT-06) map cleanly onto existing project patterns. There is a 1:1 precedent for every piece: the new `intents` table follows the exact schema pattern of `knowledge_gaps` and `knowledge_learned`; the `IntentWorker` singleton is a copy-paste of `AlertService` (Phase 128-01) with a different tick body; the 5 new tools follow the same registration structure as `save_learned_entry` / `log_knowledge_gap`; the "Protocolo de Intents" P1 prompt section mirrors `buildKnowledgeProtocol()` byte-for-byte in structure; and the cross-phase integrations (log_knowledge_gap + AlertService) are one-line additions to already-existing code paths.

**Primary recommendation:** Implement in 3 plans exactly as the ROADMAP suggests. Plan 01 = schema + CRUD + 5 tools (pure additions, zero risk). Plan 02 = IntentWorker + PromptAssembler P1 section + instrumentation.ts registration. Plan 03 = integration with `AlertService.checkIntentsUnresolved()` + knowledge gap auto-logging on failed intents. The critical design decision is that **retries are LLM-driven, not code-driven**: the IntentWorker does NOT re-execute tools. Instead, it re-prompts CatBot with the failed intent as context and lets CatBot decide how to proceed (re-call tool, call different tool, or call `abandon_intent`). This keeps idempotency guarantees in the LLM layer where they belong.

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for Phase 129. Constraints come from the phase prompt itself:

### Locked Decisions
- **Schema shape:** `intents` table in `catbot.db` with exactly 12 fields: `id, user_id, channel, original_request, parsed_goal, steps, current_step, status, attempts, last_error, result, created_at, updated_at, completed_at` (REQUIREMENTS.md INTENT-01 + ROADMAP success criteria 1). Note the success criteria lists 14 entries when unrolled because timestamps are "created_at, updated_at, completed_at" — count them all.
- **Tool set:** Exactly 5 tools — `create_intent`, `update_intent_status`, `list_my_intents`, `retry_intent`, `abandon_intent`. No more, no less.
- **Permission model:** `create_intent`, `update_intent_status`, `list_my_intents` are always_allowed. `retry_intent` and `abandon_intent` are permission-gated (proposed action key: `manage_intents`, see Open Question 1).
- **Worker cadence:** 5 minutes (same as AlertService). Max 3 retries before marking `abandoned`.
- **Prompt section:** P1 priority "Protocolo de Intents" in PromptAssembler, injected from a new `buildIntentProtocol()` function mirroring `buildKnowledgeProtocol()`.
- **Integration Phase 126:** When an intent transitions to `failed` AND `last_error` contains knowledge-gap signals, CatBot (via prompt instruction, not code) calls `log_knowledge_gap`.
- **Integration Phase 128:** When >5 intents are unresolved (status in `('failed','abandoned','pending')` past threshold), `AlertService` generates an `intents_unresolved` alert in category `execution`.
- **Intents are an overlay, not a replacement:** Simple single-tool operations do NOT create an intent. CatBot decides per-request based on the P1 protocol.
- **Retries are idempotent by re-prompting, not re-executing:** IntentWorker never calls tools directly. It injects the failed intent into the next conversation so CatBot drives the retry.

### Claude's Discretion
- Exact wording and length of the "Protocolo de Intents" section (target <800 chars to protect token budget on Libre tier, same constraint as Phase 126).
- Dedup strategy for intents (should two identical `original_request` strings within 5min collapse into one intent? See Open Question 2).
- Exact SQL for "unresolved" alert threshold (see Open Question 3 for boundary conditions).
- Permission action key name for write ops (`manage_intents` proposed).
- Which knowledge JSON hosts the 5 new tools in its `tools[]` array to satisfy KTREE-02 (settings.json is the natural home, consistent with log_knowledge_gap placement).

### Deferred Ideas (OUT OF SCOPE)
- Intent dependencies / DAG (an intent spawning child intents).
- User-facing UI for intents in the dashboard (only CatBot tool list, no visual queue panel yet).
- Cross-user intent visibility (admin view of all users' intents).
- Vector search over parsed_goal for semantic dedup.
- Webhook / push notification when intent completes.
- Intent templates / recipes shared across users.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTENT-01 | Tabla `intents` en `catbot.db` con 14 campos + CRUD expuesto via `catbot-db.ts` | New `CREATE TABLE IF NOT EXISTS intents` in catbot-db.ts schema block (lines 34-112 block), plus CRUD functions following the `saveKnowledgeGap` / `getKnowledgeGaps` pattern (lines 511-555). TypeScript `IntentRow` interface mirrors `KnowledgeGapRow` (lines 188-196). |
| INTENT-02 | PromptAssembler inyecta sección "Protocolo de Intents" | New `buildIntentProtocol()` function in `catbot-prompt-assembler.ts` copying the exact shape of `buildKnowledgeProtocol()` at lines 606-621. Registered as P1 in `build()` next to `knowledge_protocol` (line 692). |
| INTENT-03 | 5 tools registrados en `catbot-tools.ts` + knowledge tree | New entries in `TOOLS[]` array following `log_knowledge_gap` pattern (lines 895-910). Cases in `executeTool` switch following lines 2939-2946. Always_allowed conditions in `getToolsForLLM` line 1007 extended with the 3 read-path tools. Knowledge tree entries in `settings.json` tools[] (lines 22-40). |
| INTENT-04 | IntentWorker singleton cada 5min, retry hasta 3 veces, abandoned tras limite | New `intent-worker.ts` file in `app/src/lib/services/` copying `alert-service.ts` structure exactly — BOOT_DELAY, CHECK_INTERVAL, start/stop/tick pattern. Registered in `instrumentation.ts` after `AlertService.start()`. |
| INTENT-05 | Auto-log_knowledge_gap cuando failed con last_error de knowledge | Prompt instruction only (not code). Inside the "Protocolo de Intents" text, include a rule: "Si un intent falla con error que sugiere falta de conocimiento, llama `log_knowledge_gap` antes de `update_intent_status`." Follows the same prompt-not-code pattern from KPROTO-04 (Phase 126). |
| INTENT-06 | AlertService detecta >5 intents unresolved y genera alerta | New method `AlertService.checkIntentsUnresolved()` added to the checks array at `alert-service.ts` line 77. Uses existing `insertAlert` API with category='execution', alert_key='intents_unresolved'. |
</phase_requirements>

## Standard Stack

### Core (all already in project, zero new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | existing | `intents` table in catbot.db | Same DB, same pattern as knowledge_gaps |
| vitest | existing | Unit tests for worker, CRUD, prompt section | Project test framework |
| TypeScript | existing | Type-safe IntentRow interface + tool args | Project convention |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| logger (@/lib/logger) | existing | Structured logs for IntentWorker tick, retry attempts, abandonment | Every worker iteration |
| generateId (@/lib/utils) | existing | Intent IDs | Consistent with all other catbot.db tables |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQLite table for intents | In-memory Map | Loses state on restart — unacceptable for "persistent promises". Rejected. |
| Hard-coded retry in IntentWorker (re-execute tools) | LLM-driven retry via re-prompting | Re-execution breaks idempotency (e.g., double-creates a CatPaw). Re-prompting lets CatBot reason about partial state. Chosen. |
| Dedicated intents.db file | Add to catbot.db | Adds another DB file + WAL contention. catbot.db already hosts all CatBot state. Chosen. |
| Cron-style scheduler (node-cron) | `setInterval` pattern from AlertService | AlertService pattern is proven and 20 lines. node-cron adds a dep for no benefit. Chosen setInterval. |
| Separate IntentService + IntentWorker | Single `IntentWorker` class with static CRUD helpers | Separation adds ceremony. CRUD lives in catbot-db.ts already; worker only needs tick logic. Chosen single class. |

## Architecture Patterns

### Recommended Project Structure
```
app/src/lib/
  catbot-db.ts                                  # ADD: intents schema + IntentRow + CRUD
  services/
    intent-worker.ts                            # NEW: IntentWorker singleton (mirrors alert-service.ts)
    catbot-prompt-assembler.ts                  # ADD: buildIntentProtocol() + P1 registration
    catbot-tools.ts                             # ADD: 5 tools in TOOLS[] + executeTool cases + getToolsForLLM
    alert-service.ts                            # ADD: checkIntentsUnresolved() method
  __tests__/
    intent-worker.test.ts                       # NEW: Wave 0
    catbot-intents.test.ts                      # NEW: Wave 0 (CRUD + tools)
    catbot-prompt-assembler.test.ts             # EXTEND: new describe block for intents section
    alert-service.test.ts                       # EXTEND: new test for checkIntentsUnresolved

app/src/instrumentation.ts                      # ADD: IntentWorker.start() after AlertService.start()
app/data/knowledge/settings.json                # ADD: 5 new tool names to tools[] array
```

### Pattern 1: Schema Extension in catbot-db.ts
**What:** Append new CREATE TABLE block inside the existing `catbotDb.exec(` template literal at lines 34-112
**When to use:** INTENT-01
**Example:**
```typescript
// catbot-db.ts — append inside existing exec() block
CREATE TABLE IF NOT EXISTS intents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel TEXT DEFAULT 'web',
  original_request TEXT NOT NULL,
  parsed_goal TEXT,
  steps TEXT DEFAULT '[]',               -- JSON array of {tool, args, description, status}
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',         -- pending | in_progress | completed | failed | abandoned
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  result TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_intents_status ON intents(status);
CREATE INDEX IF NOT EXISTS idx_intents_user_status ON intents(user_id, status);
```
**Source:** catbot-db.ts lines 103-111 (knowledge_gaps table — identical pattern)

### Pattern 2: CRUD Functions (mirror knowledge_gaps exactly)
**What:** Export typed CRUD helpers from catbot-db.ts
**When to use:** INTENT-01 + enables Plan 02/03 consumers
**Example:**
```typescript
// catbot-db.ts

export interface IntentRow {
  id: string;
  user_id: string;
  channel: string;
  original_request: string;
  parsed_goal: string | null;
  steps: string;              // JSON
  current_step: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'abandoned';
  attempts: number;
  last_error: string | null;
  result: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export function createIntent(intent: {
  userId: string;
  channel?: string;
  originalRequest: string;
  parsedGoal?: string;
  steps?: Array<{ tool: string; args?: Record<string, unknown>; description?: string }>;
}): string {
  const id = generateId();
  catbotDb.prepare(`
    INSERT INTO intents (id, user_id, channel, original_request, parsed_goal, steps)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    intent.userId,
    intent.channel ?? 'web',
    intent.originalRequest,
    intent.parsedGoal ?? null,
    JSON.stringify(intent.steps ?? []),
  );
  return id;
}

export function updateIntentStatus(
  id: string,
  patch: {
    status?: IntentRow['status'];
    currentStep?: number;
    lastError?: string | null;
    result?: string | null;
    incrementAttempts?: boolean;
  },
): void {
  const fields: string[] = ["updated_at = datetime('now')"];
  const params: Array<string | number | null> = [];

  if (patch.status !== undefined) {
    fields.push('status = ?'); params.push(patch.status);
    if (patch.status === 'completed' || patch.status === 'abandoned') {
      fields.push("completed_at = datetime('now')");
    }
  }
  if (patch.currentStep !== undefined) { fields.push('current_step = ?'); params.push(patch.currentStep); }
  if (patch.lastError !== undefined) { fields.push('last_error = ?'); params.push(patch.lastError); }
  if (patch.result !== undefined) { fields.push('result = ?'); params.push(patch.result); }
  if (patch.incrementAttempts) { fields.push('attempts = attempts + 1'); }

  params.push(id);
  catbotDb.prepare(`UPDATE intents SET ${fields.join(', ')} WHERE id = ?`).run(...params);
}

export function getIntent(id: string): IntentRow | undefined {
  return catbotDb.prepare('SELECT * FROM intents WHERE id = ?').get(id) as IntentRow | undefined;
}

export function listIntentsByUser(userId: string, opts?: { status?: IntentRow['status']; limit?: number }): IntentRow[] {
  const where: string[] = ['user_id = ?'];
  const params: Array<string | number> = [userId];
  if (opts?.status) { where.push('status = ?'); params.push(opts.status); }
  const limit = opts?.limit ?? 50;
  return catbotDb.prepare(
    `SELECT * FROM intents WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`
  ).all(...params, limit) as IntentRow[];
}

export function getRetryableIntents(maxAttempts: number = 3): IntentRow[] {
  return catbotDb.prepare(
    `SELECT * FROM intents WHERE status = 'failed' AND attempts < ? ORDER BY updated_at ASC LIMIT 20`
  ).all(maxAttempts) as IntentRow[];
}

export function countUnresolvedIntents(): number {
  const row = catbotDb.prepare(
    `SELECT COUNT(*) AS cnt FROM intents WHERE status IN ('failed','abandoned')`
  ).get() as { cnt: number };
  return row.cnt;
}

export function abandonIntent(id: string, reason: string): void {
  catbotDb.prepare(`
    UPDATE intents SET status = 'abandoned', last_error = ?, completed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(reason, id);
}
```
**Source:** catbot-db.ts lines 511-555 (saveKnowledgeGap, getKnowledgeGaps, resolveKnowledgeGap)

### Pattern 3: 5 Tools in catbot-tools.ts
**What:** Add to `TOOLS[]` array following `log_knowledge_gap` shape
**When to use:** INTENT-03
**Example:**
```typescript
// catbot-tools.ts — append to TOOLS array

{
  type: 'function',
  function: {
    name: 'create_intent',
    description: 'Crea un intent persistente antes de ejecutar una peticion multi-paso del usuario. Usalo cuando la peticion requiere 2+ tools o acciones significativas. No lo uses para consultas simples.',
    parameters: {
      type: 'object',
      properties: {
        original_request: { type: 'string', description: 'Texto literal de la peticion del usuario' },
        parsed_goal: { type: 'string', description: 'Objetivo interpretado en tus palabras' },
        steps: {
          type: 'array',
          description: 'Lista de pasos planificados',
          items: {
            type: 'object',
            properties: {
              tool: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
      },
      required: ['original_request'],
    },
  },
},
{
  type: 'function',
  function: {
    name: 'update_intent_status',
    description: 'Actualiza el estado de un intent activo. Llama esto despues de cada paso o al terminar.',
    parameters: {
      type: 'object',
      properties: {
        intent_id: { type: 'string' },
        status: { type: 'string', enum: ['in_progress', 'completed', 'failed'] },
        current_step: { type: 'number' },
        last_error: { type: 'string' },
        result: { type: 'string' },
      },
      required: ['intent_id', 'status'],
    },
  },
},
{
  type: 'function',
  function: {
    name: 'list_my_intents',
    description: 'Lista los intents del usuario actual. Usalo cuando el usuario pregunta "que me pediste", "que estas haciendo", "que tareas tienes pendientes".',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed', 'abandoned'] },
        limit: { type: 'number' },
      },
    },
  },
},
{
  type: 'function',
  function: {
    name: 'retry_intent',
    description: 'Marca un intent failed como pending para que el IntentWorker lo reintente. Usalo cuando el usuario pide explicitamente reintentar algo.',
    parameters: {
      type: 'object',
      properties: { intent_id: { type: 'string' } },
      required: ['intent_id'],
    },
  },
},
{
  type: 'function',
  function: {
    name: 'abandon_intent',
    description: 'Marca un intent como abandonado. Usalo cuando el usuario dice que ya no quiere continuar, o cuando has superado el limite de reintentos.',
    parameters: {
      type: 'object',
      properties: {
        intent_id: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['intent_id', 'reason'],
    },
  },
},
```

**executeTool cases (append to switch near line 2946):**
```typescript
case 'create_intent': {
  const userId = context?.userId || 'web:default';
  const channel = context?.channel || 'web';
  const intentId = createIntent({
    userId,
    channel,
    originalRequest: args.original_request as string,
    parsedGoal: args.parsed_goal as string | undefined,
    steps: args.steps as Array<{ tool: string; description?: string }> | undefined,
  });
  return { name, result: { created: true, intent_id: intentId, message: 'Intent registrado. Recuerda actualizar su estado al terminar.' } };
}

case 'update_intent_status': {
  updateIntentStatus(args.intent_id as string, {
    status: args.status as IntentRow['status'],
    currentStep: args.current_step as number | undefined,
    lastError: args.last_error as string | undefined,
    result: args.result as string | undefined,
  });
  return { name, result: { updated: true, intent_id: args.intent_id } };
}

case 'list_my_intents': {
  const userId = context?.userId || 'web:default';
  const intents = listIntentsByUser(userId, {
    status: args.status as IntentRow['status'] | undefined,
    limit: (args.limit as number | undefined) ?? 20,
  });
  return { name, result: { count: intents.length, intents: intents.map(i => ({
    id: i.id,
    status: i.status,
    original_request: i.original_request,
    current_step: i.current_step,
    attempts: i.attempts,
    last_error: i.last_error,
    created_at: i.created_at,
  })) } };
}

case 'retry_intent': {
  const intent = getIntent(args.intent_id as string);
  if (!intent) return { name, result: { error: 'Intent no encontrado' } };
  if (intent.attempts >= 3) return { name, result: { error: 'Intent supero limite de reintentos' } };
  updateIntentStatus(args.intent_id as string, { status: 'pending', lastError: null });
  return { name, result: { retried: true, intent_id: args.intent_id } };
}

case 'abandon_intent': {
  abandonIntent(args.intent_id as string, args.reason as string);
  return { name, result: { abandoned: true, intent_id: args.intent_id } };
}
```

**getToolsForLLM permission gate (extend line 1003-1007):**
```typescript
if (name === 'create_intent' || name === 'update_intent_status' || name === 'list_my_intents') return true;
if (name === 'retry_intent' && (allowedActions.includes('manage_intents') || !allowedActions.length)) return true;
if (name === 'abandon_intent' && (allowedActions.includes('manage_intents') || !allowedActions.length)) return true;
```

**Source:** catbot-tools.ts lines 895-910 (log_knowledge_gap registration), lines 2939-2946 (execute case), line 1007 (always_allowed list), line 1008-1010 (permission-gated list).

### Pattern 4: PromptAssembler P1 Section
**What:** `buildIntentProtocol()` function returning text, registered in `build()` as P1 section
**When to use:** INTENT-02, INTENT-05
**Example:**
```typescript
// catbot-prompt-assembler.ts — append after buildKnowledgeProtocol (line 621)

function buildIntentProtocol(): string {
  return `## Protocolo de Intents

Tienes una cola persistente de intents (peticiones del usuario) en catbot.db. Usala asi:

### Cuando crear un intent
- Peticion multi-paso (2+ tools): SI, llama \`create_intent\` ANTES de ejecutar.
- Peticion simple (1 tool, consulta, navegacion): NO, ejecuta directamente.
- El usuario dice "recuerdame que...", "quiero que...", "encargate de...": SI siempre.

### Ciclo de vida
1. \`create_intent({ original_request, parsed_goal, steps })\` -> obtienes intent_id
2. Ejecuta los tools planificados
3. Al terminar: \`update_intent_status(intent_id, status='completed', result)\`
4. Si algo falla: \`update_intent_status(intent_id, status='failed', last_error)\`

### Fallo con gap de conocimiento
Si last_error indica que no sabes como hacer algo, llama \`log_knowledge_gap\` ANTES de \`update_intent_status\`.

### Consultas del usuario
"Que tareas tienes pendientes?" -> \`list_my_intents({ status: 'pending' })\`
"Reintentalo" -> \`retry_intent(intent_id)\`
"Olvidalo" -> \`abandon_intent(intent_id, reason)\``;
}
```

**Registration (inside `build()` at line 692):**
```typescript
// P1: Intent protocol
try {
  sections.push({ id: 'intent_protocol', priority: 1, content: buildIntentProtocol() });
} catch { /* graceful */ }
```

**Source:** catbot-prompt-assembler.ts lines 606-621 (buildKnowledgeProtocol), line 692 (registration).

### Pattern 5: IntentWorker Singleton
**What:** Class with static start/stop/tick methods, registered in instrumentation.ts
**When to use:** INTENT-04
**Example:**
```typescript
// app/src/lib/services/intent-worker.ts — NEW FILE

import {
  getRetryableIntents,
  updateIntentStatus,
  abandonIntent,
  type IntentRow,
} from '@/lib/catbot-db';
import { logger } from '@/lib/logger';

const CHECK_INTERVAL = 5 * 60 * 1000;  // 5 min
const BOOT_DELAY = 45_000;             // 45s — after AlertService (30s) to stagger startup I/O
const MAX_ATTEMPTS = 3;

export class IntentWorker {
  private static intervalId: ReturnType<typeof setInterval> | null = null;
  private static timeoutId: ReturnType<typeof setTimeout> | null = null;

  static start(): void {
    logger.info('intent-worker', 'Starting with boot delay', { delayMs: BOOT_DELAY });
    this.timeoutId = setTimeout(() => {
      this.tick().catch(err => logger.error('intent-worker', 'Tick error', { error: String(err) }));
      this.intervalId = setInterval(() => {
        this.tick().catch(err => logger.error('intent-worker', 'Tick error', { error: String(err) }));
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
    logger.info('intent-worker', 'Tick start');
    let retried = 0;
    let abandoned = 0;

    try {
      const failedIntents = getRetryableIntents(MAX_ATTEMPTS);

      for (const intent of failedIntents) {
        try {
          if (intent.attempts + 1 >= MAX_ATTEMPTS) {
            // This attempt will be the last — mark abandoned instead
            abandonIntent(intent.id, `Max retries (${MAX_ATTEMPTS}) reached. Last error: ${intent.last_error ?? 'unknown'}`);
            abandoned++;
            logger.info('intent-worker', 'Intent abandoned', { id: intent.id, attempts: intent.attempts });
            continue;
          }

          // Mark as pending again so the next conversation with this user picks it up.
          // NOTE: We do NOT re-execute tools here. Retry is LLM-driven:
          // On the user's next interaction, the PromptAssembler will inject
          // open intents into the prompt and CatBot will resume them.
          updateIntentStatus(intent.id, {
            status: 'pending',
            incrementAttempts: true,
          });
          retried++;
          logger.info('intent-worker', 'Intent re-queued for LLM retry', {
            id: intent.id,
            newAttempts: intent.attempts + 1,
          });
        } catch (err) {
          logger.error('intent-worker', 'Per-intent retry failed', {
            id: intent.id,
            error: String(err),
          });
        }
      }
    } catch (err) {
      logger.error('intent-worker', 'getRetryableIntents failed', { error: String(err) });
    }

    logger.info('intent-worker', 'Tick complete', { retried, abandoned });
  }
}
```
**Source:** alert-service.ts lines 40-103 (AlertService.start / stop / tick pattern).

**instrumentation.ts registration (append after AlertService block at line 37):**
```typescript
// Start IntentWorker (retries failed intents every 5min)
try {
  const { IntentWorker } = await import('@/lib/services/intent-worker');
  IntentWorker.start();
} catch (err) {
  console.error('[instrumentation] Failed to start IntentWorker:', err);
}
```

### Pattern 6: AlertService Integration (INTENT-06)
**What:** Add a new check method to `AlertService` and register it in the `tick()` checks array
**When to use:** INTENT-06
**Example:**
```typescript
// alert-service.ts — add near line 228 with other check methods

const UNRESOLVED_INTENTS_THRESHOLD = 5;

static async checkIntentsUnresolved(): Promise<void> {
  const row = catbotDb.prepare(
    `SELECT COUNT(*) AS cnt FROM intents WHERE status IN ('failed','abandoned')
     AND (completed_at IS NULL OR completed_at > datetime('now', '-7 days'))`
  ).get() as { cnt: number };

  if (row.cnt > UNRESOLVED_INTENTS_THRESHOLD) {
    this.insertAlert(
      'execution',
      'intents_unresolved',
      'Intents sin resolver acumulados',
      `Hay ${row.cnt} intents en estado failed/abandoned sin resolver (umbral: ${UNRESOLVED_INTENTS_THRESHOLD})`,
      'warning',
      JSON.stringify({ count: row.cnt, threshold: UNRESOLVED_INTENTS_THRESHOLD }),
    );
  }
}
```
**Register in tick checks array at line 77:**
```typescript
const checks = [
  () => this.checkKnowledgeGaps(),
  () => this.checkStagingEntries(),
  () => this.checkStuckTasks(),
  () => this.checkOrphanedRuns(),
  () => this.checkFailingConnectors(),
  () => this.checkStaleSyncs(),
  () => this.checkUnreadNotifications(),
  () => this.checkIntentsUnresolved(),  // NEW
];
```
**Source:** alert-service.ts lines 77-85 (checks array), lines 109-228 (check method pattern), lines 234-257 (insertAlert dedup).

### Anti-Patterns to Avoid

- **Re-executing tools inside IntentWorker:** Never call `executeTool()` from the worker. That path runs outside a user context, has no sudo, no conversation history, and re-running writes would cause double-create bugs. Retry = re-queue + next LLM call handles it.
- **Creating an intent for every single tool call:** The whole point of the overlay is opt-in. The P1 protocol must be explicit: "simple consultas = ejecuta directo, multi-paso = crea intent". Otherwise every `list_my_recipes` call becomes a row in the intents table.
- **Hard-coding auto-log_knowledge_gap in executeTool when intent fails:** INTENT-05 mirrors KPROTO-04 — this is a prompt instruction, not code. Do NOT add code that inspects `last_error` for knowledge signals.
- **Forgetting KTREE-02 bidirectional sync test:** All 5 new tools MUST appear in at least one knowledge JSON's `tools[]` array or the test at `knowledge-tools-sync.test.ts` will fail the Docker build (via ESLint? — see Pitfall 5).
- **Using `executeTool` without passing `context`:** Phase 124 decisions (STATE.md line 102) note context is optional default undefined. The new tools need `context.userId` to scope `list_my_intents` and `create_intent` correctly. All existing callers pass context; just don't regress it.
- **Storing `steps` as a plain string:** Use JSON. The schema reserves `steps TEXT DEFAULT '[]'` — parse/stringify at CRUD boundaries so callers work with objects.
- **Blocking on `getRetryableIntents` with no LIMIT:** If the table ever has thousands of failed intents, the worker would OOM. The example includes `LIMIT 20` per tick.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Background scheduler | Custom `while(true)` + sleep | `setInterval` + BOOT_DELAY pattern from AlertService | Proven, restartable, unified with other services |
| UUID generation | `crypto.randomUUID()` directly | `generateId` from `@/lib/utils` | Project convention, Phase 126 decision |
| Idempotent retry logic in code | Custom lock table + state machine | LLM-driven re-queue | CatBot already has reasoning + tool-selection; double-execute bugs are the biggest risk |
| Tool dedup tracking | Custom hash of args | SQLite PRIMARY KEY on intent id + status check | The status column IS the state machine |
| Alert dedup | Manual "already sent" tracking | `AlertService.insertAlert` already dedups by (category, alert_key, acknowledged=0) | alert-service.ts lines 242-249 — free correctness |
| Cleanup of old intents | Custom retention cron | Piggyback on AlertService tick() cleanup block (line 95-102) or add similar in IntentWorker | Same pattern, already scheduled |
| Permission checks for write tools | Custom auth layer | Extend `getToolsForLLM` allowedActions logic | 50+ existing tools follow this pattern |
| user_id derivation | Custom per-channel logic | `context.userId` from route.ts (Phase 121 pattern) | Already resolves web:default / telegram:{chat_id} |

**Key insight:** The entire phase is pattern-follow, not pattern-design. Every moving part has a 1:1 analog that shipped in Phases 121-128. Research time is better spent verifying the edge cases below than designing new abstractions.

## Common Pitfalls

### Pitfall 1: KTREE-02 Bidirectional Sync Test Failure
**What goes wrong:** After adding 5 tools to `TOOLS[]`, the build/test fails with "tool X not found in any knowledge JSON".
**Why it happens:** Phase 125 added `knowledge-tools-sync.test.ts` that validates every TOOLS entry appears in at least one knowledge JSON's `tools[]` array. Missing even one of the 5 new tools breaks the test.
**How to avoid:** After adding the 5 tools to `catbot-tools.ts`, immediately add all 5 names to `app/data/knowledge/settings.json` tools[] array (it already hosts `log_knowledge_gap`, consistent home for CatBot system tools). Run `cd app && npx vitest run src/lib/__tests__/knowledge-tools-sync.test.ts` before committing.
**Warning signs:** CI or docker build fails with unexpected test error not related to intent logic.

### Pitfall 2: Token Budget Explosion on Libre Tier
**What goes wrong:** P1 "Protocolo de Intents" section + existing P1 sections (user_profile, reasoning_protocol, knowledge_protocol, matched_recipe, page_knowledge, platform_overview, skills_protocols, canvas_protocols, telegram_adaptation) bust the 16K token budget on Libre, and PromptAssembler starts truncating lower-priority sections.
**Why it happens:** Libre tier has aggressive budget, and Phase 126 already noted the existing P1 stack is tight (Phase 126 decisions set knowledge_protocol to 771 chars to stay under 800).
**How to avoid:** Keep `buildIntentProtocol()` output under 800 characters. The example above is ~780 chars — measure after writing. If over, trim the "Cuando crear un intent" section first.
**Warning signs:** Libre-tier responses become terse / lose page_knowledge context. Run `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts` with a budget assertion.

### Pitfall 3: IntentWorker Races with User-Driven Retry
**What goes wrong:** User calls `retry_intent` at T+4:59 (setting status back to pending), then IntentWorker wakes at T+5:00 and sees a pending intent with low attempts, does nothing. Or worse: user abandons at T+4:59, worker tries to retry at T+5:00 and re-queues an abandoned intent.
**Why it happens:** No row-level locking between user path and worker path. Both operate on the same intents table.
**How to avoid:** The worker should ONLY operate on `status = 'failed'` rows (see `getRetryableIntents` query). A user-triggered `retry_intent` moves the intent to `pending`, which the worker skips. An `abandon_intent` moves to `abandoned`, which the worker's WHERE clause also skips. The state machine is the lock. Add tests for both races.
**Warning signs:** Logs show IntentWorker "re-queueing" an intent the user just abandoned.

### Pitfall 4: attempts Counter Drift Between User Retry and Worker Retry
**What goes wrong:** User calls `retry_intent` 3 times but `attempts` is not incremented by the tool (tool just resets status to pending), so the worker thinks the intent has 0 attempts and keeps re-queueing forever.
**Why it happens:** INTENT-04 spec says "IntentWorker marks abandoned after 3 attempts" but doesn't specify whether user-initiated retries count.
**How to avoid:** Decide explicitly: `retry_intent` tool should also call `updateIntentStatus({ status: 'pending', incrementAttempts: true })`. That way the 3-attempt ceiling applies uniformly whether the worker or user triggered it. Document this in the tool description.
**Warning signs:** Same intent bouncing between failed and pending indefinitely in logs.

### Pitfall 5: ESLint unused-var on New Imports
**What goes wrong:** Docker build fails because `IntentRow` imported into intent-worker.ts isn't actually used, or `getIntent` helper added but never called in Wave 0.
**Why it happens:** MEMORY.md (feedback_unused_imports_build.md): unused imports are `error` in `next build`.
**How to avoid:** Only import what you use. If the worker doesn't actually reference `IntentRow`, don't import the type. If a CRUD helper exists but is only used in tests, add `// eslint-disable-next-line @typescript-eslint/no-unused-vars` sparingly — better: use it in one production code path (e.g., `getIntent` inside `retry_intent` tool case — already used in the example above).
**Warning signs:** Green locally, red in Docker build.

### Pitfall 6: Concurrent WAL Contention on catbot.db
**What goes wrong:** IntentWorker tick runs while user is mid-conversation writing to `conversation_log`, and one gets SQLITE_BUSY.
**Why it happens:** catbot.db is single-writer even with WAL for long transactions. STATE.md pitfall-2 notes this risk.
**How to avoid:** `busy_timeout = 5000` is already set in catbot-db.ts line 25. Keep tick operations fast and non-transactional. Process intents one at a time, not in a single BEGIN...COMMIT. Already the pattern in the example.
**Warning signs:** `SQLITE_BUSY` in logs during tick.

### Pitfall 7: list_my_intents Leaks Cross-User Data
**What goes wrong:** A Telegram user sees another user's intents.
**Why it happens:** If `context.userId` is not wired through route.ts into executeTool for the new tools, it defaults to `web:default` and all web users share an intent queue.
**How to avoid:** Verify route.ts passes `context: { userId, channel }` to executeTool for these tools (it already does for profile/recipe tools post-Phase 121). The `list_my_intents` handler MUST use `context.userId`, never args. Add a test for user isolation.
**Warning signs:** User A in a smoke test sees an intent created by a different user_id.

### Pitfall 8: Prompt Instruction to Create Intent Triggers on Simple Queries
**What goes wrong:** CatBot creates an intent for every "list my models" or "what's my profile" call, flooding the table.
**Why it happens:** LLM is overly literal with the protocol text.
**How to avoid:** Explicit negative examples in the prompt text: "NO crees intent para: consultas (list_*, get_*), navegacion, preguntas sobre la plataforma." The example text in Pattern 4 includes this but verify in integration testing with Libre tier first (most literal).
**Warning signs:** intents table has thousands of rows for read-only ops.

## Code Examples

### Test: Wave 0 IntentWorker retry state machine
```typescript
// app/src/lib/__tests__/intent-worker.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IntentWorker } from '@/lib/services/intent-worker';
import {
  createIntent,
  updateIntentStatus,
  getIntent,
  getRetryableIntents,
} from '@/lib/catbot-db';

describe('IntentWorker', () => {
  beforeEach(() => {
    // Clear intents table via SQL in a test helper
  });

  it('re-queues failed intent with attempts < 3', async () => {
    const id = createIntent({ userId: 'test:user', originalRequest: 'foo' });
    updateIntentStatus(id, { status: 'failed', lastError: 'network', incrementAttempts: true });

    await IntentWorker.tick();

    const intent = getIntent(id)!;
    expect(intent.status).toBe('pending');
    expect(intent.attempts).toBe(2);
  });

  it('abandons intent after 3 attempts', async () => {
    const id = createIntent({ userId: 'test:user', originalRequest: 'bar' });
    updateIntentStatus(id, { status: 'failed', incrementAttempts: true });
    updateIntentStatus(id, { status: 'failed', incrementAttempts: true });
    // attempts = 2, next retry will be attempt 3 which must abandon

    await IntentWorker.tick();

    const intent = getIntent(id)!;
    expect(intent.status).toBe('abandoned');
    expect(intent.completed_at).not.toBeNull();
  });

  it('skips pending intents', async () => {
    const id = createIntent({ userId: 'test:user', originalRequest: 'baz' });
    // Still pending by default — worker should ignore
    await IntentWorker.tick();
    const intent = getIntent(id)!;
    expect(intent.status).toBe('pending');
    expect(intent.attempts).toBe(0);
  });
});
```

### Test: AlertService.checkIntentsUnresolved
```typescript
// app/src/lib/__tests__/alert-service.test.ts — new describe block

describe('checkIntentsUnresolved', () => {
  it('creates alert when > 5 intents are failed/abandoned', async () => {
    for (let i = 0; i < 6; i++) {
      const id = createIntent({ userId: 'test:user', originalRequest: `req-${i}` });
      updateIntentStatus(id, { status: 'failed' });
    }
    await AlertService.checkIntentsUnresolved();
    const alerts = AlertService.getAlerts(true).filter(a => a.alert_key === 'intents_unresolved');
    expect(alerts).toHaveLength(1);
  });

  it('does not create alert when <= 5', async () => {
    for (let i = 0; i < 5; i++) {
      const id = createIntent({ userId: 'test:user', originalRequest: `req-${i}` });
      updateIntentStatus(id, { status: 'failed' });
    }
    await AlertService.checkIntentsUnresolved();
    const alerts = AlertService.getAlerts(true).filter(a => a.alert_key === 'intents_unresolved');
    expect(alerts).toHaveLength(0);
  });
});
```

### Prompt assembler test
```typescript
// catbot-prompt-assembler.test.ts — new describe block

describe('buildIntentProtocol', () => {
  it('is included as P1 section', () => {
    const prompt = build(mockContext());
    expect(prompt).toContain('## Protocolo de Intents');
    expect(prompt).toContain('create_intent');
    expect(prompt).toContain('update_intent_status');
  });

  it('section is under 800 characters to protect token budget', () => {
    // direct test of buildIntentProtocol — requires exporting it for test
    // or measure by extracting the section from full prompt
  });

  it('contains gap-of-knowledge escalation rule', () => {
    const prompt = build(mockContext());
    expect(prompt).toMatch(/log_knowledge_gap.*update_intent_status/s);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Request vanishes on tool failure | Persistent intents with retry | Phase 129 (this) | User never loses a request mid-flight |
| Multi-step failures require manual redo | IntentWorker auto-retries | Phase 129 (this) | Self-healing multi-step operations |
| No visibility into pending user requests | `list_my_intents` tool | Phase 129 (this) | User can audit CatBot's queue |
| Alerts only for system health | Alerts also for stuck user requests | Phase 129 (this) | Admin sees user-level friction |
| Background workers only for summaries/alerts | Also for intent retries | Phase 129 (this) | Unified singleton pattern for 3 services |

## Open Questions

1. **Permission action key for retry_intent / abandon_intent**
   - What we know: `getToolsForLLM` uses action keys like `manage_profile`, `manage_knowledge`, `manage_models`.
   - What's unclear: Does `manage_intents` already exist as a config key in Settings UI? Probably not.
   - Recommendation: Plan 01 adds `manage_intents` as a new action key. Plan 03 (or a follow-up) adds it to the Settings CatBot config UI checkboxes. For this phase, default-allow when `!allowedActions.length` (matches existing tool-permission pattern).

2. **Dedup strategy for intents**
   - What we know: Two identical `original_request` strings in quick succession could create two intents.
   - What's unclear: Is that desired (user asked twice = two requests) or not (user retried their message = same request)?
   - Recommendation: Default to NO dedup — each `create_intent` call creates a new row. If dedup is needed later, add an optional `source_message_id` column and UNIQUE constraint. Not in scope for Phase 129.

3. **"Unresolved" alert threshold boundary**
   - What we know: ROADMAP says ">5 intents en 'failed' o 'abandoned' sin resolver".
   - What's unclear: Does "sin resolver" mean (a) not acknowledged by user, (b) within a time window, (c) not yet deleted?
   - Recommendation: Use a 7-day window: `completed_at IS NULL OR completed_at > datetime('now', '-7 days')`. Rationale: if something failed 2 months ago it's historical noise, not actionable. Example SQL in Pattern 6 includes this.

4. **Should PromptAssembler inject open intents into the prompt?**
   - What we know: INTENT-04 says worker re-queues for LLM retry, but retry only happens on user's next message.
   - What's unclear: Should the next conversation turn automatically see open intents in the prompt context? If not, the LLM won't know to retry.
   - Recommendation: Add a small P2 section `buildOpenIntentsContext(userId)` that lists up to 3 most-recent pending/in_progress intents for the current user when building the prompt. This closes the retry loop. Add as a Plan 02 subtask. Otherwise INTENT-04 is effectively a no-op from user perspective.

5. **What happens to an intent when a conversation ends without update_intent_status?**
   - What we know: CatBot might forget to close an intent (LLM hallucination or early conversation end).
   - What's unclear: Orphaned in_progress intents could accumulate.
   - Recommendation: Add a "stuck intent" check to IntentWorker: if status='in_progress' and updated_at < datetime('now', '-1 hour'), mark as failed with last_error='stuck'. Also triggers alerts via existing threshold. Same pattern as `checkStuckTasks` in AlertService.

6. **Telegram channel persistence of context.userId**
   - What we know: Phase 121 decision (STATE.md 78): `userId resolved from bodyUserId (Telegram) first, then deriveUserId fallback for web`.
   - What's unclear: Does the current route.ts pass `context.userId` to executeTool in the Telegram path consistently? Pitfall 7 depends on this.
   - Recommendation: During Plan 01, grep route.ts for `executeTool` calls and verify context.userId is plumbed. Add a regression test in Wave 0.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | `app/vitest.config.ts` |
| Quick run command | `cd ~/docflow/app && npx vitest run src/lib/__tests__/intent-worker.test.ts src/lib/__tests__/catbot-intents.test.ts -x` |
| Full suite command | `cd ~/docflow/app && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| INTENT-01 | intents table schema + CRUD (createIntent, updateIntentStatus, listIntentsByUser, getRetryableIntents, abandonIntent) | unit | `cd app && npx vitest run src/lib/__tests__/catbot-intents.test.ts -x` | No — Wave 0 |
| INTENT-02 | PromptAssembler includes `## Protocolo de Intents` as P1, under 800 chars, mentions create_intent/update_intent_status | unit | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -x` | Exists (extend) |
| INTENT-03 | 5 tools exist in TOOLS[], executeTool cases work, always_allowed gating correct, settings.json tools[] contains all 5 | unit + existing sync test | `cd app && npx vitest run src/lib/__tests__/catbot-intents.test.ts src/lib/__tests__/knowledge-tools-sync.test.ts -x` | Partial — Wave 0 extends |
| INTENT-04 | IntentWorker re-queues failed < 3 attempts, abandons at 3, skips pending, handles per-intent errors | unit | `cd app && npx vitest run src/lib/__tests__/intent-worker.test.ts -x` | No — Wave 0 |
| INTENT-05 | Prompt text contains gap-escalation rule; manual CatBot smoke verifies the LLM actually calls log_knowledge_gap on knowledge-shaped errors | unit (text) + manual (CatBot oracle per CLAUDE.md) | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -x` | Exists (extend) |
| INTENT-06 | AlertService.checkIntentsUnresolved creates alert > 5, does not < 5, dedups correctly | unit | `cd app && npx vitest run src/lib/__tests__/alert-service.test.ts -x` | Exists (extend) |

### Sampling Rate
- **Per task commit:** `cd app && npx vitest run src/lib/__tests__/intent-worker.test.ts src/lib/__tests__/catbot-intents.test.ts src/lib/__tests__/catbot-prompt-assembler.test.ts src/lib/__tests__/alert-service.test.ts src/lib/__tests__/knowledge-tools-sync.test.ts -x`
- **Per wave merge:** `cd app && npx vitest run`
- **Phase gate:** Full suite green + Docker build green (`cd app && npm run build`) + CatBot oracle prompt executed per CLAUDE.md protocol before `/gsd:verify-work`.

### CatBot Oracle Prompt (per CLAUDE.md)
After implementation, formulate this prompt to CatBot:
1. "Ejecuta el catflow X" (where X is a multi-step catflow) → verify CatBot calls `create_intent` first.
2. Interrupt / force a tool failure mid-execution → verify intent moves to `failed` with `last_error`.
3. Ask CatBot "¿qué tareas tienes pendientes?" → verify it calls `list_my_intents` and reports the failed one.
4. Ask "Reintenta la última tarea fallida" → verify `retry_intent` is called.
5. Wait 5+ minutes → verify IntentWorker re-queues it (check logs for `intent-worker` tick).
6. After 3 attempts, verify intent becomes `abandoned` and the AlertDialog eventually shows `intents_unresolved` (if >5 in that state).

### Wave 0 Gaps
- [ ] `app/src/lib/__tests__/intent-worker.test.ts` — covers INTENT-04
- [ ] `app/src/lib/__tests__/catbot-intents.test.ts` — covers INTENT-01, INTENT-03 (CRUD + tool execution)
- [ ] Extend `app/src/lib/__tests__/catbot-prompt-assembler.test.ts` — covers INTENT-02, INTENT-05 (prompt text rules)
- [ ] Extend `app/src/lib/__tests__/alert-service.test.ts` — covers INTENT-06
- [ ] Run `knowledge-tools-sync.test.ts` after adding tools (existing test, verifies KTREE-02)
- [ ] Shared fixture helper to clear intents table between tests (add to existing test setup)

## Sources

### Primary (HIGH confidence)
- `app/src/lib/catbot-db.ts` lines 34-112, 188-196, 507-555 — schema block + row types + knowledge_gaps CRUD (direct template for intents)
- `app/src/lib/services/alert-service.ts` entire file — copy-paste template for IntentWorker singleton + check method pattern
- `app/src/lib/services/catbot-tools.ts` lines 895-910 (tool registration), 995-1020 (permission gate), 2939-2946 (executeTool case) — template for 5 new tools
- `app/src/lib/services/catbot-prompt-assembler.ts` lines 606-621 (buildKnowledgeProtocol), 690-693 (P1 registration) — template for buildIntentProtocol
- `app/src/instrumentation.ts` entire file (40 lines) — registration pattern
- `app/data/knowledge/settings.json` lines 22-40 — target location for KTREE-02 tool registration
- Phase 128 RESEARCH.md — AlertService pattern and dedup semantics (already shipped)
- Phase 126 RESEARCH.md — KPROTO-04 prompt-not-code decision, knowledge_gaps schema precedent
- STATE.md accumulated context — Phase 121 userId resolution, Phase 124 executeTool context parameter, Phase 126 knowledge-protocol decisions, Phase 128 AlertService decisions
- REQUIREMENTS.md lines 120-125 — verbatim INTENT-01..06 requirements
- ROADMAP.md lines 247-263 — Phase 129 success criteria + plan breakdown

### Secondary (MEDIUM confidence)
- CLAUDE.md — CatBot-as-oracle testing protocol + knowledge tree update checklist (used to structure validation architecture)
- MEMORY.md — Docker build / unused imports / feedback_language conventions

### Tertiary (LOW confidence)
- None. All patterns are directly observable in existing codebase with 1:1 precedent.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, every library already in project
- Architecture: HIGH — every pattern (singleton worker, schema extension, tool registration, prompt section, alert check) has a direct precedent shipped in Phases 124-128
- Pitfalls: HIGH — identified by direct reading of existing code, tests (KTREE-02 sync), and Phase 121/124/126 recorded decisions in STATE.md
- Integration points (Phase 126 + Phase 128): HIGH — both integrations are additive one-file changes with existing extension points

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable internal patterns, no external dependencies, all touch-points in code paths that have not changed in last 30 days)
