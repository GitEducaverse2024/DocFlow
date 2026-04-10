# Phase 131: Complexity Assessment — Research

**Researched:** 2026-04-10
**Domain:** Pre-execution complexity gating in CatBot — inline LLM self-classification via prompt protocol + parser/gate in `/api/catbot/chat/route.ts` + audit table + extension of Phase 130 pipeline (description-libre + 60s progress reporter) + AlertService check.
**Confidence:** HIGH

## Summary

Phase 131 cierra el agujero del caso real (timeout de 60s en Telegram con 8 tool calls de mcp_bridge) añadiendo razonamiento de complejidad ANTES del tool loop. Es una fase de bajo riesgo arquitectónico: cero infraestructura nueva (no LLM extra, no servicios nuevos, no agentes, no workers nuevos). Todo el razonamiento es inline en el LLM existente de CatBot, controlado por una sección P0 nueva del PromptAssembler con casuísticas declarativas, y una capa de parsing en route.ts que persiste cada decisión y bloquea el tool loop si la clasificación es `complex`.

Cada pieza tiene precedente 1:1 en el código actual: `complexity_decisions` clona el patrón de `intent_jobs` (Phase 130) y `knowledge_gaps` (Phase 126); `buildComplexityProtocol` clona la estructura de `buildIntentProtocol` (629) y `buildComplexTaskProtocol` (658); el parser de prefijo va en el mismo punto de route.ts donde se lee `assistantMessage.tool_calls` (línea 349 non-stream / 173 streaming); el progress reporter de 60s extiende `notifyProgress` (intent-job-executor.ts:368), que ya existe y ya envía a Telegram; `checkClassificationTimeouts` se añade al array `checks` de AlertService como 11ª check (alert-service.ts:87). El único riesgo real es la coordinación del gate en el path streaming (SSE) — el path non-streaming es trivial.

**Primary recommendation:** Implementar exactamente como propone el roadmap en 4 plans. Plan 01 = schema + CRUD + sección P0 `buildComplexityProtocol` con casuísticas. Plan 02 = parser de prefijo en ambos paths de route.ts + persistencia + gate que bloquea tool loop si `complex` + extensión `queue_intent_job` con `description` libre. Plan 03 = self-check (>3 tool calls + work pending) + progress reporter cada 60s en IntentJobExecutor. Plan 04 = `AlertService.checkClassificationTimeouts` + CatBot oracle E2E reproduciendo el caso real (Holded Q1).

**Decisión arquitectónica clave:** El parsing del prefijo `[COMPLEXITY:...]` ocurre en la PRIMERA respuesta del LLM (iteración 0 del tool loop), antes de empezar a ejecutar tool_calls. Si la primera respuesta tiene tool_calls, igualmente se parsea el `content` (que llega junto a los tool_calls en la misma response) — si es `complex`, se descartan los tool_calls, se persiste el reason, se elimina el prefijo del content, y se devuelve el content limpio como respuesta final. El gate corre UNA sola vez por turno, fuera del bucle.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Enfoque: razonamiento inline, NO LLM extra.** Se descarta explícitamente añadir un LLM/servicio separado para análisis previo. Razón: +1-2s en CADA mensaje, rebuild de contexto, doble razonamiento redundante. Solución: reforzar el prompt de CatBot con casuísticas del proyecto + regla dura de clasificación. El LLM de CatBot YA es suficientemente inteligente — el problema del caso real fue que el flag `async:true` de Phase 130 era demasiado estrecho.

- **Clasificación output.** CatBot antepone en su respuesta: `[COMPLEXITY:simple|complex|ambiguous] [REASON:...] [EST:Ns]`. `/api/catbot/chat/route.ts` parsea este prefijo ANTES de devolver al cliente. Lo persiste en `complexity_decisions` y lo elimina del texto visible al usuario. Si `classification=complex`, bloquea el tool loop y responde con pregunta de aprobación.

- **UX del bloqueo.** Cuando se detecta complex, CatBot debe:
  1. NO ejecutar las tools que pensaba llamar
  2. Responder al usuario: *"Esta tarea es compleja y puede requerir un CatFlow. Se ejecutaría en segundo plano y se reportaría cuando esté creada. ¿Quieres que lo prepare?"*
  3. Incluir la duración estimada si está disponible ("~3 minutos")
  4. Mencionar que recibirá reportes cada 60 segundos del progreso
  - Si el usuario acepta → llama `queue_intent_job(description)` → pipeline Phase 130 arranca
  - Si el usuario rechaza → flujo normal síncrono (con riesgo de timeout, decisión del usuario)

- **Casuísticas del proyecto (para el prompt).**

  **COMPLEJAS** (ejemplos explícitos):
  - "entra en holded y haz resumen Q1 2026 + Q1 2025 + comparación + envía email"
  - "analiza los catflows del último mes y genera informe de uso"
  - "descarga PDFs de Drive, procésalos con RAG, y genera resumen ejecutivo"
  - "crea un CatPaw, vincúlalo con un skill, conéctalo a n8n y ejecuta test"
  - "compara facturación de dos períodos y envía reporte maquetado"

  **SIMPLES** (ejemplos explícitos):
  - "lista mis CatBrains"
  - "ejecuta el catflow TestInbound"
  - "crea un CatPaw llamado X con modelo claude-sonnet"
  - "busca en el knowledge tree cómo funciona catflow"
  - "muéstrame mis intents pendientes"

  **AMBIGUAS** (procesar como simple, loguear para mejorar):
  - "haz un resumen" (sin especificar de qué)
  - "ejecuta eso" (sin contexto claro)

- **Criterios de clasificación (explícitos en el prompt).**
  Compleja si cumple ≥1:
  - >3 operaciones secuenciales ("entra... luego haz... y después envía...")
  - Agregación/cálculo sobre rangos temporales grandes (Q1, mes, año, trimestre)
  - >2 servicios externos (Holded+Drive+Email, Telegram+n8n+RAG)
  - Requiere entrega formateada (informe, template corporativo, email maquetado)
  - Requiere comparación cross-source
  - Incluye una fase de análisis + una fase de acción

  Simple si:
  - 1-2 tool calls predecibles
  - Lecturas directas (get_*, list_*)
  - CRUD puntual sin agregación

- **Self-check durante ejecución.** Si CatBot pensó que era simple pero durante el loop ha hecho >3 tool calls Y detecta más trabajo pendiente: detiene el loop, llama `queue_intent_job(description=trabajo restante)`, responde *"Esta tarea ha resultado más compleja de lo esperado, la estoy preparando como CatFlow asíncrono"*. Cubre el caso de clasificación errónea.

- **Progress reporting cada 60 segundos.** El IntentJobExecutor (Phase 130) actualmente actualiza progress_message pero no notifica al canal original de forma temporizada. Esta fase añade: cada 60 segundos (o cada vez que pipeline_phase cambia, lo que ocurra primero), IntentJobExecutor envía un mensaje al canal original. Telegram: `sendMessage` con el progreso. Web: notification type=`pipeline_progress`. Formato: "⏳ CatFlow en progreso: fase=architect, completado 2/3 fases, ETA ~1min".

- **Auditoría y mejora iterativa.** Cada clasificación se loguea en `complexity_decisions`. AlertService nueva check: `checkClassificationTimeouts` — si hay >5 timeouts/día en requests con `classification=complex` que `async_path_taken=false`, alerta. Los logs permiten al admin revisar casos donde CatBot clasificó mal y ajustar las casuísticas manualmente.

- **Sección del prompt: nueva P0.** `buildComplexityProtocol()` es una sección P0 (prioridad absoluta, antes que todo). Se inyecta en `build()` con try/catch. Se inyecta SOLO si no es un mensaje de system/assistant continuation. Budget estricto: <1200 chars (casos + criterios + regla dura).

- **Formato de prefijo exacto.**
  ```
  [COMPLEXITY:complex] [REASON:4 operaciones secuenciales, agregación temporal, comparación cross-source, entrega formateada] [EST:180s]

  Esta tarea es compleja y puede requerir un CatFlow. Se ejecutaría en segundo plano con reportes cada 60 segundos. ¿Quieres que lo prepare?
  ```
  El parser en route.ts:
  1. Regex `\[COMPLEXITY:(\w+)\]\s*\[REASON:([^\]]+)\]\s*\[EST:(\d+)s\]`
  2. Extrae los tres campos
  3. Los persiste en `complexity_decisions`
  4. Si es complex → STOP tool loop, guarda la pregunta como respuesta final
  5. Si es simple → continúa flujo normal
  6. Si es ambiguous → loguea, continúa como simple
  7. Elimina el prefijo del texto visible al usuario

### Claude's Discretion

- Wording exacto y longitud final de `buildComplexityProtocol()` (target <1200 chars, hard cap)
- Forma exacta del regex parser (recomendación: lenient con `\s*` y match opcional EST)
- Naming exacto de columnas en `complexity_decisions` (recomendación: snake_case mirroring `intent_jobs`)
- Timing del self-check (recomendación: comprobación al inicio de cada iteración del tool loop tras la 3ª)
- Formato del mensaje de progress reporter cada 60s (recomendación: emoji + fase + tareas + ETA)
- Forma del payload `last_notify_at` para tracking de los 60s (recomendación: nuevo campo TEXT en `intent_jobs` o cálculo via `updated_at`)
- Si el parser elimina el prefijo del `content` o lo deja al cliente (recomendación: eliminarlo en server)
- Behavior fallback: prefijo ausente → recomendación: tratar como `simple unknown` y persistir con `classification='simple'`, `reason='no_prefix_fallback'`

### Deferred Ideas (OUT OF SCOPE)

- Clarificación automática en casos ambiguous (por ahora se loguea y procesa como simple)
- Re-clasificación mid-loop si el self-check detecta error (se loguea pero no se corrige el complexity_decision ya persistido)
- Métricas de precisión del clasificador (% complex correctamente identificados) — FUTURE
- Dashboard analítico de complexity decisions — FUTURE
- Fine-tuning automático de casuísticas basado en timeouts históricos — FUTURE
- Reemplazar el flag async de Phase 130 (sigue siendo útil como certeza determinista)
- Nuevo servicio/LLM/agente separado (descartado explícitamente)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QA-01 | Tabla `complexity_decisions` en catbot.db con CRUD | Append `CREATE TABLE IF NOT EXISTS complexity_decisions` al bloque `catbotDb.exec()` (catbot-db.ts líneas 34-112). CRUD mirrors `intent_jobs` (Phase 130) — `saveComplexityDecision`, `getComplexityDecision`, `listComplexityDecisionsByUser`, `countTimeoutsLastDay`. Ver Pattern 1. |
| QA-02 | Sección P0 "Protocolo de Evaluación de Complejidad" en PromptAssembler con casuísticas + regla dura | Nuevo `buildComplexityProtocol()` en catbot-prompt-assembler.ts copiando estructura de `buildIntentProtocol` (629) y `buildComplexTaskProtocol` (658). Registrado como **priority: 0** (P0) en `build()` justo después de `tool_instructions` y antes de `instructions_primary`. Budget <1200 chars. Ver Pattern 2. |
| QA-03 | CatBot antepone `[COMPLEXITY:*]` parseado y persistido | Parser regex `\[COMPLEXITY:(\w+)\]\s*\[REASON:([^\]]+)\]\s*\[EST:(\d+)s\]?` aplicado al `content` del primer LLM response. Ambos paths (streaming en route.ts líneas 173-186 y non-streaming línea 349-352). Persiste con `saveComplexityDecision()`. Strip del prefijo antes de devolver al cliente. Ver Pattern 3. |
| QA-04 | Si classification=complex → bloquea tool loop, pregunta al usuario | En route.ts: si parser devuelve `complex`, se hace `break` del tool loop ANTES de ejecutar pendingToolCalls, se descartan los tool_calls de esa iteración, se persiste con `async_path_taken=false` (se decidirá tras respuesta del usuario), y `finalReply` = content limpio. Ver Pattern 4. |
| QA-05 | `queue_intent_job` acepta `description` libre | Extender la tool definition en catbot-tools.ts (líneas 1011-1023): añadir `description` como string opcional en parameters; relajar `required` a `['original_request']` (quitar `tool_name` del required). Extender `createIntentJob` en catbot-db.ts para aceptar `toolName` opcional con default `'__description__'` y persistir la `description` en `tool_args` JSON cuando viene libre. Ver Pattern 5. |
| QA-06 | Self-check >3 tool calls + trabajo pendiente → encolar resto | En el tool loop de route.ts (línea 315 non-stream / 150 stream), tras cada iteración comprobar si `iteration > 3` Y el LLM expresa trabajo pendiente (heurística: response tiene tool_calls Y content menciona "luego/después/falta"). Si match → break loop, llamar `queue_intent_job` con description = original_request + "trabajo restante: ..." + responder al usuario. Ver Pattern 6. |
| QA-06b | IntentJobExecutor reporta progreso cada 60s al canal original | Extender `notifyProgress` en intent-job-executor.ts (línea 368) con tracking temporal. Añadir campo `last_notify_at` (TEXT, datetime) al schema de `intent_jobs` o trackear en memoria con Map<jobId,timestamp>. En cada llamada interna a `updateIntentJob`, comprobar si han pasado >60s desde `last_notify_at` o si `pipeline_phase` cambió. Si sí → llamar `notifyProgress` extendido que ahora envía Telegram + crea notification type=`pipeline_progress`. Ver Pattern 7. |
| QA-07 | `AlertService.checkClassificationTimeouts` | Nueva check estática `checkClassificationTimeouts()` en alert-service.ts añadida al array `checks` (línea 87). Query: `SELECT COUNT(*) FROM complexity_decisions WHERE classification='complex' AND async_path_taken=0 AND outcome='timeout' AND created_at > datetime('now','-1 day')`. Si >5 → `insertAlert(category='execution', alert_key='classification_timeouts', ...)`. Ver Pattern 8. |
</phase_requirements>

## Standard Stack

### Core (zero new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | existing | `complexity_decisions` table en catbot.db | Misma DB que intent_jobs/intents/knowledge_gaps |
| vitest | existing | Tests para parser, CRUD, prompt section, self-check, alert check | Framework del proyecto |
| TypeScript strict | existing | Type-safe ComplexityDecisionRow + parser output | Convención del proyecto |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| logger (`@/lib/logger`) | existing | Logs estructurados de cada clasificación + fallbacks del parser | LogSource ya cubre `catbot` y `intent-job-executor` — sin extensión necesaria |
| generateId (`@/lib/utils`) | existing | IDs de complexity_decisions | Consistente con catbot.db |
| Telegram `sendMessage` | existing (telegram-bot.ts) | Progress reporter cada 60s | Ya usado en `notifyProgress` (intent-job-executor.ts:374) |
| `createNotification` (notifications.ts) | existing | Web notifications con tipo nuevo `pipeline_progress` | Extender NotificationType union (línea 7) — ya extendido con `catflow_pipeline` en Phase 130, mismo patrón |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline reasoning en CatBot | LLM separado de pre-clasificación | Descartado por usuario: latencia +1-2s/mensaje, doble razonamiento, rebuild de contexto. Inline aprovecha que el LLM ya tiene todo el contexto cargado. **Chosen inline.** |
| Parser regex strict | Parser permisivo + fallback | LLMs varían formato. Recomendado lenient con `\s*` entre brackets y EST opcional. Si no hay match → `simple unknown`. **Chosen lenient.** |
| Gate dentro del tool loop | Gate antes del tool loop (única vez) | Dentro del loop sería costoso, repetiría parsing. La clasificación SOLO ocurre en el primer LLM response del turno (iteración 0). **Chosen single-shot.** |
| Nueva tabla `complexity_decisions` | Reusar `intents` o columnas en `intent_jobs` | Auditoría limpia requiere tabla dedicada (cada decisión, no solo las que escalan). intents/intent_jobs son "side effect" de complex decisions. **Chosen dedicated.** |
| Tracking de los 60s con Map en memoria | Columna `last_notify_at` en intent_jobs | Map se pierde tras restart pero no afecta funcionalidad (solo dispara una notificación extra al boot). Columna persiste correctamente. **Recomendación: columna**, pero Map es válido si el plan prefiere zero-schema-change. |

## Architecture Patterns

### Recommended Project Structure
```
app/src/lib/
  catbot-db.ts                                 # ADD: complexity_decisions schema + ComplexityDecisionRow + CRUD
  services/
    catbot-prompt-assembler.ts                 # ADD: buildComplexityProtocol() + P0 registration
    catbot-tools.ts                            # MODIFY: queue_intent_job parameters (description libre, tool_name opcional)
    intent-job-executor.ts                     # MODIFY: extender notifyProgress con tracking 60s + pipeline_progress notification
    alert-service.ts                           # ADD: checkClassificationTimeouts() método

app/src/app/api/catbot/chat/
  route.ts                                     # MODIFY: parser de prefijo + gate (ambos paths streaming/non-streaming) + self-check >3 iterations

app/src/lib/__tests__/
  catbot-complexity-decisions.test.ts          # NEW Wave 0 (CRUD + tool extension)
  complexity-protocol.test.ts                  # NEW Wave 0 (prompt section <1200 chars + casuísticas presentes)
  complexity-parser.test.ts                    # NEW Wave 0 (regex lenient + fallback)
  catbot-chat-route-complexity.test.ts         # NEW Wave 0 (gate behavior end-to-end con LLM mockeado)
  intent-job-executor.test.ts                  # EXTEND: nuevos tests para 60s notify
  alert-service.test.ts                        # EXTEND: nuevo test para checkClassificationTimeouts

app/data/knowledge/
  settings.json                                # NO change: queue_intent_job ya está registrada (Phase 130). KTREE-02 sin riesgo.
```

### Pattern 1: complexity_decisions Schema + CRUD

**What:** Append `CREATE TABLE` block al `catbotDb.exec()` existente y CRUD typed.
**When to use:** QA-01

```sql
CREATE TABLE IF NOT EXISTS complexity_decisions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel TEXT DEFAULT 'web',                  -- 'web' | 'telegram'
  message_snippet TEXT,                        -- primeros 200 chars del user message
  classification TEXT NOT NULL,                -- 'simple' | 'complex' | 'ambiguous'
  reason TEXT,                                 -- razón del LLM (parsed [REASON:...])
  estimated_duration_s INTEGER,                -- de [EST:Ns]
  async_path_taken INTEGER DEFAULT 0,          -- 0/1 — true si terminó en queue_intent_job
  outcome TEXT,                                -- 'completed' | 'queued' | 'timeout' | 'cancelled' | NULL (aún ejecutándose)
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_complexity_user ON complexity_decisions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complexity_classification ON complexity_decisions(classification, created_at DESC);
```

```typescript
// catbot-db.ts — append after IntentJobRow CRUD

export interface ComplexityDecisionRow {
  id: string;
  user_id: string;
  channel: string;
  message_snippet: string | null;
  classification: 'simple' | 'complex' | 'ambiguous';
  reason: string | null;
  estimated_duration_s: number | null;
  async_path_taken: 0 | 1;
  outcome: 'completed' | 'queued' | 'timeout' | 'cancelled' | null;
  created_at: string;
}

export function saveComplexityDecision(d: {
  userId: string;
  channel?: string;
  messageSnippet?: string;
  classification: ComplexityDecisionRow['classification'];
  reason?: string;
  estimatedDurationS?: number;
  asyncPathTaken?: boolean;
}): string {
  const id = generateId();
  catbotDb.prepare(`
    INSERT INTO complexity_decisions
      (id, user_id, channel, message_snippet, classification, reason, estimated_duration_s, async_path_taken)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    d.userId,
    d.channel ?? 'web',
    (d.messageSnippet ?? '').slice(0, 200),
    d.classification,
    d.reason ?? null,
    d.estimatedDurationS ?? null,
    d.asyncPathTaken ? 1 : 0,
  );
  return id;
}

export function updateComplexityOutcome(
  id: string,
  outcome: ComplexityDecisionRow['outcome'],
  asyncPathTaken?: boolean,
): void {
  const fields: string[] = ['outcome = ?'];
  const params: Array<string | number | null> = [outcome];
  if (asyncPathTaken !== undefined) {
    fields.push('async_path_taken = ?');
    params.push(asyncPathTaken ? 1 : 0);
  }
  params.push(id);
  catbotDb.prepare(`UPDATE complexity_decisions SET ${fields.join(', ')} WHERE id = ?`).run(...params);
}

export function listComplexityDecisionsByUser(
  userId: string,
  limit: number = 20,
): ComplexityDecisionRow[] {
  return catbotDb.prepare(
    `SELECT * FROM complexity_decisions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
  ).all(userId, limit) as ComplexityDecisionRow[];
}

export function countComplexTimeoutsLast24h(): number {
  const row = catbotDb.prepare(
    `SELECT COUNT(*) AS cnt FROM complexity_decisions
     WHERE classification = 'complex'
       AND async_path_taken = 0
       AND outcome = 'timeout'
       AND created_at > datetime('now', '-1 day')`
  ).get() as { cnt: number };
  return row.cnt;
}
```
**Source:** catbot-db.ts líneas 511-555 (knowledge_gaps CRUD), Phase 130 IntentJobRow CRUD pattern.

### Pattern 2: buildComplexityProtocol() — P0 prompt section

**What:** Nueva función exportada con casuísticas declarativas y regla dura.
**When to use:** QA-02
**Char budget:** <1200 chars (medir en test)

```typescript
// catbot-prompt-assembler.ts — append after buildComplexTaskProtocol

export function buildComplexityProtocol(): string {
  return `## Protocolo de Evaluacion de Complejidad (P0)

ANTES de usar tools, clasifica la peticion. Antepon en tu respuesta:
\`[COMPLEXITY:simple|complex|ambiguous] [REASON:breve] [EST:Ns]\`

### COMPLEJA si cumple >=1:
- >3 operaciones secuenciales (entra... luego... y despues...)
- Agregacion temporal (Q1, mes, ano, trimestre)
- >2 servicios externos (Holded+Drive+Email, Telegram+n8n+RAG)
- Entrega formateada (informe, email maquetado, template)
- Comparacion cross-source o fase analisis+accion

Ejemplos COMPLEJAS:
- "entra holded, resumen Q1 2026 + Q1 2025 + comparativa + email"
- "descarga PDFs Drive, RAG, resumen ejecutivo"
- "crea CatPaw + skill + n8n + test"

### SIMPLE si:
- 1-2 tool calls predecibles (list_*, get_*)
- CRUD puntual sin agregacion

Ejemplos SIMPLES: "lista mis CatBrains", "ejecuta catflow X", "crea CatPaw Y"

### AMBIGUA: peticion vaga ("haz un resumen", "ejecuta eso") -> trata como simple pero marca ambiguous.

### REGLA DURA
Si COMPLEX: NO ejecutes tools. Responde: "Esta tarea es compleja (~Nmin). Preparo un CatFlow asincrono con reportes cada 60s?"
Si usuario acepta -> queue_intent_job({description}). Si rechaza -> ejecuta inline.

Ejemplo prefijo: \`[COMPLEXITY:complex] [REASON:4 ops + agregacion temporal + entrega formateada] [EST:180s]\``;
}
```

**Registración en `build()`:**
```typescript
// catbot-prompt-assembler.ts — modify build() near line 723
// Insert AFTER 'tool_instructions' (line 735) and BEFORE 'instructions_primary' (line 741)

// P0: Complexity protocol (Phase 131 — gate antes del tool loop)
try {
  sections.push({ id: 'complexity_protocol', priority: 0, content: buildComplexityProtocol() });
} catch { /* graceful */ }
```

**Source:** catbot-prompt-assembler.ts líneas 629-651 (buildIntentProtocol), 658-675 (buildComplexTaskProtocol).

### Pattern 3: Parser de prefijo en route.ts

**What:** Helper puro que extrae prefijo del content del primer LLM response.
**When to use:** QA-03

```typescript
// New helper in app/src/lib/services/catbot-complexity-parser.ts (or inline in route.ts)

export interface ComplexityPrefix {
  classification: 'simple' | 'complex' | 'ambiguous';
  reason: string | null;
  estimatedDurationS: number | null;
  cleanedContent: string;     // content sin el prefijo
  hadPrefix: boolean;         // false → fallback
}

const COMPLEXITY_REGEX = /^\s*\[COMPLEXITY:\s*(simple|complex|ambiguous)\s*\]\s*(?:\[REASON:\s*([^\]]+?)\s*\])?\s*(?:\[EST:\s*(\d+)\s*s?\s*\])?\s*/i;

export function parseComplexityPrefix(content: string): ComplexityPrefix {
  if (!content) {
    return { classification: 'simple', reason: 'no_content_fallback', estimatedDurationS: null, cleanedContent: content || '', hadPrefix: false };
  }
  const match = content.match(COMPLEXITY_REGEX);
  if (!match) {
    return { classification: 'simple', reason: 'no_prefix_fallback', estimatedDurationS: null, cleanedContent: content, hadPrefix: false };
  }
  const cls = match[1].toLowerCase() as 'simple' | 'complex' | 'ambiguous';
  const reason = (match[2] ?? '').trim() || null;
  const est = match[3] ? parseInt(match[3], 10) : null;
  const cleaned = content.slice(match[0].length).trimStart();
  return { classification: cls, reason, estimatedDurationS: est, cleanedContent: cleaned, hadPrefix: true };
}
```

**Test cases mínimos (lenient):**
- `[COMPLEXITY:complex] [REASON:foo] [EST:180s]\n\nbody` → ok
- `[COMPLEXITY:complex] [REASON:foo bar baz]\n\nbody` (sin EST) → ok, est=null
- `  [COMPLEXITY: complex ] [REASON: 4 ops ] [EST:180]` (whitespace + sin "s") → ok
- `[COMPLEXITY:simple]\n\nbody` (sin REASON ni EST) → ok
- `body sin prefijo` → fallback simple, hadPrefix=false
- `[CMPLEXITY:complex]` (typo) → fallback simple

### Pattern 4: Gate en route.ts (ambos paths)

**What:** Aplicar parser al PRIMER LLM response (iteración 0) antes de ejecutar tool_calls.
**When to use:** QA-04

**Non-streaming path** (route.ts líneas 315-352, dentro del `for (let iteration = 0; iteration < maxIterations; iteration++)`):

```typescript
// AFTER llmResponse parsed, BEFORE checking tool_calls
const assistantMessage = choice.message;

// ─── Phase 131: Complexity gate (iteration 0 only) ───
if (iteration === 0) {
  const parsed = parseComplexityPrefix(assistantMessage.content || '');
  const decisionId = saveComplexityDecision({
    userId,
    channel: effectiveChannel,
    messageSnippet: lastUserMessage,
    classification: parsed.classification,
    reason: parsed.reason ?? undefined,
    estimatedDurationS: parsed.estimatedDurationS ?? undefined,
    asyncPathTaken: false,    // será actualizado si el usuario acepta el CatFlow
  });

  // Strip prefijo del content visible
  assistantMessage.content = parsed.cleanedContent;

  if (parsed.classification === 'complex') {
    // BLOQUEO: descartar tool_calls de esta iteración, devolver content limpio
    finalReply = parsed.cleanedContent;
    logger.info('catbot', 'Complexity gate triggered', {
      decisionId, classification: 'complex', estimatedDurationS: parsed.estimatedDurationS,
    });
    break;
  }
  // simple / ambiguous: continúa flujo normal
}
// ─── /gate ───

// existing logic: if no tool_calls, finalReply = content; break;
if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) { ... }
```

**Streaming path** (route.ts líneas 150-242): el reto es que el `iterationContent` se va llenando token a token. Estrategia: en `onDone` callback (línea 164), tras el primer iteration completo, ANTES de procesar `pendingToolCalls`, parsear `iterationContent`. Si `complex`, hacer `send('done', ...)` con la respuesta limpia y abortar el loop. Importante: el cliente recibirá tokens del prefijo via `onToken`. **Mitigación: filtrar tokens en `onToken` para no enviar los del prefijo al cliente** — buffer local hasta detectar `]` del tercer bracket o un `\n\n` que indique fin de prefijo.

**Recomendación pragmática:** En streaming, NO emitir tokens de la primera iteración hasta que termine (`onDone`). Acumular en `iterationContent`, parsear en `onDone`, emitir el `cleanedContent` como un único `send('token', ...)` retroactivo si simple, o como `send('reply', ...)` si complex. Trade-off: pierde visibility token-by-token en iteration 0, pero garantiza no exponer el prefijo. Iteraciones posteriores (>0) siguen siendo streaming normal.

### Pattern 5: queue_intent_job — description libre

**What:** Relajar `tool_name` requirement, añadir `description`.
**When to use:** QA-05

```typescript
// catbot-tools.ts — modify lines 1011-1023

{
  type: 'function',
  function: {
    name: 'queue_intent_job',
    description: 'Encola una peticion compleja (>60s) como intent_job. Llamalo cuando el usuario confirma que quiere un CatFlow asistido. Acepta description libre cuando no hay un tool especifico.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Descripcion libre del trabajo a hacer (preferida sobre tool_name si la peticion es multi-paso)' },
        tool_name: { type: 'string', description: 'Nombre del tool async original (opcional, solo si la peticion es un solo tool async)' },
        tool_args: { type: 'object', description: 'Argumentos originales (opcional)' },
        original_request: { type: 'string', description: 'Texto literal de la peticion del usuario' },
      },
      required: ['original_request'],   // tool_name ya NO es required
    },
  },
},
```

```typescript
// catbot-tools.ts — modify line 3233 case 'queue_intent_job'

case 'queue_intent_job': {
  const userId = context?.userId || 'web:default';
  const channel = context?.channel || 'web';
  const description = args.description as string | undefined;
  const toolName = (args.tool_name as string | undefined) || (description ? '__description__' : 'unknown');
  const toolArgs = description
    ? { description, original_request: args.original_request }
    : ((args.tool_args as Record<string, unknown> | undefined) ?? {});

  const jobId = createIntentJob({
    userId,
    channel,
    toolName,
    toolArgs,
  });

  // Si esta llamada vino tras complexity gate, marcar async_path_taken
  // (necesita complexity_decision_id en context — Plan 02 lo añade)
  if (context?.complexityDecisionId) {
    updateComplexityOutcome(context.complexityDecisionId, 'queued', true);
  }

  return { name, result: { queued: true, job_id: jobId, message: 'Pipeline encolado.' } };
}
```

**IntentJobExecutor downstream:** El `runFullPipeline` debe detectar `tool_name === '__description__'` y pasar `tool_args.description` como input principal al strategist en vez de los args originales. Cambio mínimo en `buildStrategistInput(job)`.

### Pattern 6: Self-check en tool loop (>3 iterations)

**What:** Comprobar tras la 3ª iteración si hay trabajo pendiente y el LLM lo expresa.
**When to use:** QA-06

```typescript
// route.ts — dentro del for loop, después de procesar tool_calls de la iteración

if (iteration >= 3 && assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
  // Heurística: el LLM aún quiere ejecutar más tools después de 3+ iterations
  // → la clasificación inicial fue probablemente errónea
  const remainingWork = `Tras ${iteration + 1} pasos, queda trabajo pendiente. Intent original: ${lastUserMessage}`;

  // Encolar el resto como CatFlow
  const jobId = createIntentJob({
    userId,
    channel: effectiveChannel ?? 'web',
    toolName: '__description__',
    toolArgs: { description: remainingWork, original_request: lastUserMessage },
  });

  // Marcar la decisión inicial como mal-clasificada
  if (decisionId) {
    updateComplexityOutcome(decisionId, 'queued', true);
    // (opcional: log adicional para mejorar casuísticas)
    logger.warn('catbot', 'Self-check escalation', { decisionId, jobId, iteration });
  }

  finalReply = `Esta tarea ha resultado más compleja de lo esperado. La he encolado como CatFlow asíncrono (job ${jobId}). Te avisaré con reportes cada 60 segundos.`;
  break;
}
```

**Decisión de diseño:** El gate del self-check es **incondicional** tras la 3ª iteración SI el LLM aún devuelve tool_calls. No se intenta detectar "trabajo pendiente" via NLP en el content (frágil). Se asume: si tras 3 iteraciones aún hay tool_calls, la tarea está rebasando el budget razonable del flujo síncrono.

### Pattern 7: Progress reporter cada 60s en IntentJobExecutor

**What:** Extender `notifyProgress` (línea 368) para enviar tras cada 60s + en cada cambio de fase.
**When to use:** QA-06 (IntentJobExecutor part)

**Opción A: Map en memoria (sin schema change)**
```typescript
// intent-job-executor.ts — añadir static field

private static lastNotifyAt: Map<string, number> = new Map();
private static readonly NOTIFY_INTERVAL_MS = 60_000;

private static notifyProgress(job: IntentJobRow, message: string, force: boolean = false): void {
  const now = Date.now();
  const last = this.lastNotifyAt.get(job.id) ?? 0;
  if (!force && now - last < this.NOTIFY_INTERVAL_MS) return;
  this.lastNotifyAt.set(job.id, now);

  logger.info('intent-job-executor', 'Progress', { jobId: job.id, message });

  // Telegram
  if (job.channel === 'telegram' && job.channel_ref) {
    const chatId = parseInt(job.channel_ref, 10);
    if (!Number.isNaN(chatId)) {
      import('./telegram-bot')
        .then(({ telegramBotService }) => telegramBotService.sendMessage(chatId, `\u23F3 ${message}`))
        .catch(err => logger.warn('intent-job-executor', 'notifyProgress telegram failed', { error: String(err) }));
    }
  }

  // Web — nuevo tipo de notification
  if (job.channel === 'web') {
    try {
      createNotification({
        type: 'pipeline_progress',
        title: 'CatFlow en progreso',
        message,
        severity: 'info',
        link: `/catflow/${job.canvas_id ?? ''}`,
      });
    } catch (err) {
      logger.warn('intent-job-executor', 'notifyProgress web notification failed', { error: String(err) });
    }
  }
}
```

**Cleanup:** Cuando un job termina (status=completed/failed/cancelled), limpiar `this.lastNotifyAt.delete(job.id)`.

**Phase change forces notification:** Cada vez que `pipeline_phase` cambia, llamar `notifyProgress(job, msg, /*force=*/true)`. Las llamadas existentes en `runFullPipeline` (líneas 155, 169) ya disparan en cada fase — basta con añadir `force=true`. Para los 60s, añadir un setInterval-like check dentro del tick o, más limpio, una llamada periódica desde el LLM call (cada `callLLM` puede enviar un `notifyProgress(job, 'Procesando...')` que será no-op si no han pasado 60s).

**Pitfall del Map:** Si el server reinicia mid-pipeline, el Map se pierde y se enviará una notificación extra al primer tick post-restart. Aceptable.

**Nuevo NotificationType:**
```typescript
// notifications.ts línea 7
export type NotificationType = 'process' | 'rag' | 'task' | 'canvas' | 'connector' | 'system' | 'catflow_pipeline' | 'pipeline_progress';
```

### Pattern 8: AlertService.checkClassificationTimeouts

**What:** Nueva check estática añadida al array `checks` de AlertService.
**When to use:** QA-07

```typescript
// alert-service.ts — añadir al array checks (línea 87)

const checks = [
  // ... existing 10 checks
  () => this.checkIntentsUnresolved(),
  () => this.checkStuckPipelines(),
  () => this.checkClassificationTimeouts(),    // NEW
];

// alert-service.ts — añadir método estático

static async checkClassificationTimeouts(): Promise<void> {
  const count = countComplexTimeoutsLast24h();
  const THRESHOLD = 5;
  if (count > THRESHOLD) {
    this.insertAlert(
      'execution',
      'classification_timeouts',
      `${count} timeouts en peticiones clasificadas como complex que NO tomaron el path async en las ultimas 24h`,
      'warning',
    );
  }
}
```

**Nota sobre `outcome='timeout'`:** Para que esta check funcione, el código en route.ts (al detectar timeout o error) debe llamar `updateComplexityOutcome(decisionId, 'timeout')`. Esto requiere que `decisionId` esté disponible en el catch/finally del flujo. Plan 04 debe cubrir esta integración.

### Anti-Patterns to Avoid

- **Parser strict:** Si exiges formato exacto el LLM fallará a menudo. Usa regex lenient + fallback `simple unknown`.
- **Parser dentro del tool loop:** El parsing solo debe ocurrir UNA VEZ por turno (iteración 0). Repetirlo en cada iteración es redundante y peligroso.
- **Streaming sin buffer en iter 0:** Si emites tokens del prefijo al cliente, el usuario verá `[COMPLEXITY:complex]` antes del mensaje real. Buffer obligatorio.
- **NLP-based "trabajo pendiente" detection:** Frágil. Usa contador de iteraciones.
- **Schema migration sin IF NOT EXISTS:** Romperás existing DBs. Sigue el patrón de Phase 130.
- **Notify spam:** Sin throttling, IntentJobExecutor podría notificar cada tick. Map/timestamp obligatorio.
- **Force notify en cada llamada LLM:** Solo `force=true` en cambios de fase. El check temporal es para llamadas sin cambio de fase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pre-clasificación de complejidad | LLM separado / agente nuevo | Sección P0 inyectada al LLM existente | Latencia +1-2s, doble razonamiento, rebuild de contexto. Decisión locked por usuario. |
| Audit log de decisiones | Files JSON / logs solo | Tabla `complexity_decisions` SQL | Queries para AlertService + dashboard futuro. Mismo patrón que intent_jobs. |
| Throttle de notificaciones | setInterval por job | Map<jobId, lastNotifyAt> + check inline | Sin lifecycle de timers, sin cleanup races, sin memory leaks. |
| Regex super-strict | Parser custom | Regex lenient + fallback | LLM varía formato. Fallback seguro mejor que retry costly. |
| Self-check NLP | Análisis semántico de "trabajo pendiente" | Contador de iteraciones (>3 + tool_calls) | Determinista, testeable, sin LLM extra. |

## Common Pitfalls

### Pitfall 1: Streaming path expone tokens del prefijo
**What goes wrong:** En el path SSE, `onToken` envía cada token al cliente conforme llega. Si el LLM empieza con `[COMPLEXITY:`, el usuario verá esos tokens.
**Why:** El parser sólo puede correr cuando `iterationContent` está completo (en `onDone`).
**How to avoid:** Bufferizar la primera iteración (iter 0). NO llamar `send('token', ...)` hasta que `onDone` se ejecute. Tras parsear, emitir `cleanedContent` como un solo evento o como tokens diferidos.
**Warning signs:** Test E2E del streaming muestra "[COMPLEXITY" en el output del cliente.

### Pitfall 2: tool_calls + content presentes simultáneamente
**What goes wrong:** Algunos LLMs devuelven `content` (con el prefijo) Y `tool_calls` en la misma response. Si lees uno e ignoras el otro, el gate falla.
**Why:** OpenAI tools API permite ambos campos en `assistant.message`.
**How to avoid:** SIEMPRE parsear `content` antes de procesar `tool_calls`. Si `complex`, descartar `tool_calls` aunque estén presentes.
**Warning signs:** El LLM ejecuta tools de una petición compleja cuando debería haberse bloqueado.

### Pitfall 3: Parser no lenient
**What goes wrong:** El LLM responde `[COMPLEXITY: complex ]` (whitespace), `[Complexity:Complex]` (mixed case), o sin EST. Regex strict falla y trata todo como `simple_fallback`, perdiendo el gate.
**How to avoid:** Regex con `\s*`, flag `i`, EST opcional, REASON opcional. Test exhaustivo de variantes.
**Warning signs:** Muchas decisiones con `reason='no_prefix_fallback'` en complexity_decisions.

### Pitfall 4: Prompt budget overflow
**What goes wrong:** `buildComplexityProtocol` excede 1200 chars y empuja al PromptAssembler a truncar P1 sections (knowledge_protocol, intent_protocol, complex_task_protocol).
**How to avoid:** Test que mide `buildComplexityProtocol().length` y falla si >1200. Iterar wording si excede.
**Warning signs:** Test budget falla. Otros protocolos truncados.

### Pitfall 5: Self-check loop entre intentos
**What goes wrong:** Self-check encola el resto, IntentJobExecutor lo procesa, escala otra vez en una nueva conversación, encola otra vez. Infinite loop.
**How to avoid:** El IntentJobExecutor opera en un contexto distinto (background tick, no /api/catbot/chat). Su propio prompt NO incluye `buildComplexityProtocol` (ya que es interno, no es input de usuario). Solo `route.ts` aplica el gate.
**Warning signs:** intent_jobs spawning intent_jobs.

### Pitfall 6: LogSource no extendido
**What goes wrong:** Si añades logs desde un nuevo módulo (e.g. `catbot-complexity-parser`), TypeScript falla.
**How to avoid:** Reutilizar `'catbot'` o `'intent-job-executor'` que ya existen. NO crear nuevo LogSource innecesariamente.
**Warning signs:** Build TypeScript error: `Type '"complexity-parser"' is not assignable to type 'LogSource'`.

### Pitfall 7: IntentJobExecutor procesa job con tool_name='__description__' y crashea
**What goes wrong:** `runFullPipeline` asume que `job.tool_args` contiene los args del tool original. Cuando viene description libre, esos args no existen.
**How to avoid:** En `buildStrategistInput`, detectar `tool_name === '__description__'` y usar `tool_args.description` como input principal del strategist.
**Warning signs:** Strategist phase falla con `goal: undefined` o `goal: '{}'`.

### Pitfall 8: Map de last_notify_at sin cleanup
**What goes wrong:** Memoria crece indefinidamente con jobs viejos.
**How to avoid:** Tras `updateIntentJob` con `status` terminal (completed/failed/cancelled), llamar `lastNotifyAt.delete(job.id)`.
**Warning signs:** Heap crece monotónicamente.

## Code Examples

### Verifying buildComplexityProtocol char budget
```typescript
// app/src/lib/__tests__/complexity-protocol.test.ts
import { describe, it, expect } from 'vitest';
import { buildComplexityProtocol } from '@/lib/services/catbot-prompt-assembler';

describe('buildComplexityProtocol', () => {
  const protocol = buildComplexityProtocol();

  it('fits the 1200 char budget', () => {
    expect(protocol.length).toBeLessThanOrEqual(1200);
  });

  it('contains COMPLEX casuísticas explícitas', () => {
    expect(protocol).toMatch(/holded/i);
    expect(protocol).toMatch(/Q1/);
    expect(protocol).toMatch(/Drive/);
  });

  it('contains SIMPLE casuísticas explícitas', () => {
    expect(protocol).toMatch(/list_/);
    expect(protocol).toMatch(/CatBrains/);
  });

  it('declares the prefix format', () => {
    expect(protocol).toMatch(/\[COMPLEXITY:/);
    expect(protocol).toMatch(/\[REASON:/);
    expect(protocol).toMatch(/\[EST:/);
  });

  it('declares the hard rule', () => {
    expect(protocol).toMatch(/NO ejecutes tools/i);
    expect(protocol).toMatch(/queue_intent_job/);
  });
});
```

### Parser unit tests
```typescript
// app/src/lib/__tests__/complexity-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseComplexityPrefix } from '@/lib/services/catbot-complexity-parser';

describe('parseComplexityPrefix', () => {
  it('extracts complex with reason and est', () => {
    const r = parseComplexityPrefix('[COMPLEXITY:complex] [REASON:4 ops] [EST:180s]\n\nbody');
    expect(r.classification).toBe('complex');
    expect(r.reason).toBe('4 ops');
    expect(r.estimatedDurationS).toBe(180);
    expect(r.cleanedContent).toBe('body');
    expect(r.hadPrefix).toBe(true);
  });

  it('is lenient with whitespace and case', () => {
    const r = parseComplexityPrefix('  [COMPLEXITY: COMPLEX ] [REASON: foo ] [EST:60]   body');
    expect(r.classification).toBe('complex');
    expect(r.reason).toBe('foo');
    expect(r.estimatedDurationS).toBe(60);
  });

  it('accepts simple without REASON or EST', () => {
    const r = parseComplexityPrefix('[COMPLEXITY:simple]\n\nrespuesta');
    expect(r.classification).toBe('simple');
    expect(r.reason).toBeNull();
    expect(r.estimatedDurationS).toBeNull();
    expect(r.cleanedContent).toBe('respuesta');
  });

  it('falls back to simple when no prefix', () => {
    const r = parseComplexityPrefix('hola, soy CatBot');
    expect(r.classification).toBe('simple');
    expect(r.reason).toBe('no_prefix_fallback');
    expect(r.hadPrefix).toBe(false);
    expect(r.cleanedContent).toBe('hola, soy CatBot');
  });

  it('handles ambiguous classification', () => {
    const r = parseComplexityPrefix('[COMPLEXITY:ambiguous] [REASON:vague]\n\nx');
    expect(r.classification).toBe('ambiguous');
  });
});
```

## State of the Art

| Old Approach (Phase 130) | Current Approach (Phase 131) | When Changed | Impact |
|--------------------------|------------------------------|--------------|--------|
| Detección via flag `async:true` en TOOLS[] | Razonamiento LLM con casuísticas + parsing prefijo | Phase 131 | Cubre tareas que el flag no detecta (multi-step que combina tools simples) |
| `queue_intent_job({tool_name, tool_args})` requiere tool específica | `queue_intent_job({description})` libre | Phase 131 (QA-05) | El estratega del pipeline puede manejar peticiones libres sin un tool ancla |
| `notifyProgress` solo en cambios de fase | `notifyProgress` cada 60s + cada cambio de fase | Phase 131 (QA-06) | El usuario tiene visibility temporal continua, no solo en transiciones |
| Sin auditoría de decisiones de complejidad | `complexity_decisions` table con CRUD | Phase 131 (QA-01) | Iteración: el admin revisa casos mal clasificados y ajusta casuísticas |

**Deprecated/outdated:** Nada se deprecia en esta fase. El flag `async:true` de Phase 130 sigue vivo como certeza determinista (si una tool individual está marcada async, el flujo de Phase 130 sigue funcionando como complemento al gate del Phase 131).

## Open Questions

1. **¿Debe el progress reporter usar `pipeline_progress` notification type o reusar `catflow_pipeline`?**
   - Recomendación: nuevo tipo `pipeline_progress` para distinguir "ready to approve" (catflow_pipeline) de "running update" (pipeline_progress). UI puede filtrarlas distintamente.

2. **¿Dónde guardar `complexityDecisionId` para que `queue_intent_job` pueda actualizarlo a `outcome='queued'`?**
   - Recomendación: extender `executeTool` context con `complexityDecisionId?: string`. Plan 02 lo añade al pasar context en route.ts.

3. **¿El gate aplica a Holded tools y Sudo tools?**
   - Sí. El gate corre en iteración 0 antes de cualquier branching de tool type. Aplica universalmente.

4. **¿Qué pasa si el usuario aplica sudo MID-conversation y eso resetea el contexto?**
   - Phase 128 garantiza preservación de hilo en sudo. La complexity decision del turno anterior persiste en DB. No hay riesgo.

5. **¿Cómo se mide `outcome='timeout'` exactamente?**
   - Recomendación: en el catch general de route.ts (línea 488 catch del POST handler), si `decisionId` está en scope, llamar `updateComplexityOutcome(decisionId, 'timeout')`. Plan 02 cubre esta integración.

6. **¿El self-check (>3 iter) cuenta iteraciones desde 0 o desde 1?**
   - Recomendación: desde 0. El check es `iteration >= 3` (es decir, en la 4ª iteración y siguientes). Esto da al LLM 4 oportunidades antes de escalar.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (existing project framework) |
| Config file | `app/vitest.config.ts` (existing) |
| Quick run command | `cd app && npx vitest run src/lib/__tests__/complexity-protocol.test.ts src/lib/__tests__/complexity-parser.test.ts` |
| Full suite command | `cd app && npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QA-01 | complexity_decisions schema + CRUD inserts/selects/updates correctly | unit | `cd app && npx vitest run src/lib/__tests__/catbot-complexity-decisions.test.ts` | ❌ Wave 0 |
| QA-02 | buildComplexityProtocol <1200 chars + casuísticas presentes + registrado P0 en build() | unit | `cd app && npx vitest run src/lib/__tests__/complexity-protocol.test.ts` | ❌ Wave 0 |
| QA-02 | PromptAssembler.build() incluye `complexity_protocol` section con priority=0 | unit | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -t complexity` | ⚠️ EXTEND existing |
| QA-03 | Parser regex extrae prefijo (lenient) + fallback funciona | unit | `cd app && npx vitest run src/lib/__tests__/complexity-parser.test.ts` | ❌ Wave 0 |
| QA-03 | route.ts non-streaming path persiste decision en iteración 0 | integration | `cd app && npx vitest run src/lib/__tests__/catbot-chat-route-complexity.test.ts -t persists` | ❌ Wave 0 |
| QA-04 | Si classification=complex → break loop, no ejecuta tools, devuelve cleanedContent | integration | `cd app && npx vitest run src/lib/__tests__/catbot-chat-route-complexity.test.ts -t blocks` | ❌ Wave 0 |
| QA-04 | Si classification=simple → continúa flujo normal y ejecuta tools | integration | `cd app && npx vitest run src/lib/__tests__/catbot-chat-route-complexity.test.ts -t allows` | ❌ Wave 0 |
| QA-04 | Streaming path NO emite tokens del prefijo al cliente | integration | `cd app && npx vitest run src/lib/__tests__/catbot-chat-route-complexity.test.ts -t streaming` | ❌ Wave 0 |
| QA-05 | queue_intent_job acepta `description` sin `tool_name` | unit | `cd app && npx vitest run src/lib/__tests__/catbot-complexity-decisions.test.ts -t description` | ❌ Wave 0 |
| QA-05 | createIntentJob persiste description en tool_args JSON | unit | `cd app && npx vitest run src/lib/__tests__/catbot-complexity-decisions.test.ts -t persists_description` | ❌ Wave 0 |
| QA-06 | Self-check escala a CatFlow tras 4ª iteración con tool_calls | integration | `cd app && npx vitest run src/lib/__tests__/catbot-chat-route-complexity.test.ts -t self_check` | ❌ Wave 0 |
| QA-06 | notifyProgress respeta interval 60s con Map | unit | `cd app && npx vitest run src/lib/__tests__/intent-job-executor.test.ts -t notify_throttle` | ⚠️ EXTEND existing |
| QA-06 | notifyProgress force=true en cambio de fase ignora throttle | unit | `cd app && npx vitest run src/lib/__tests__/intent-job-executor.test.ts -t notify_force` | ⚠️ EXTEND existing |
| QA-07 | checkClassificationTimeouts genera alerta si >5 timeouts/día | unit | `cd app && npx vitest run src/lib/__tests__/alert-service.test.ts -t classification_timeouts` | ⚠️ EXTEND existing |
| QA-07 | countComplexTimeoutsLast24h SQL query funciona | unit | `cd app && npx vitest run src/lib/__tests__/catbot-complexity-decisions.test.ts -t count_timeouts` | ❌ Wave 0 |
| Build | `npm run build` succeeds (no unused imports, no LogSource issues) | smoke | `cd app && npm run build` | ✅ existing |
| KTREE-02 | Sync test sigue verde (no se añaden tools nuevas) | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-tools-sync.test.ts` | ✅ existing |

### Sampling Rate
- **Per task commit:** `cd app && npx vitest run src/lib/__tests__/complexity-protocol.test.ts src/lib/__tests__/complexity-parser.test.ts src/lib/__tests__/catbot-complexity-decisions.test.ts`
- **Per wave merge:** `cd app && npx vitest run` (full suite)
- **Phase gate:** Full suite green + `cd app && npm run build` + CatBot oracle E2E test (Plan 04 reproduce el caso real Holded Q1)

### Wave 0 Gaps
- [ ] `app/src/lib/__tests__/catbot-complexity-decisions.test.ts` — covers QA-01 (CRUD) + QA-05 (queue_intent_job description) + QA-07 (countComplexTimeoutsLast24h)
- [ ] `app/src/lib/__tests__/complexity-protocol.test.ts` — covers QA-02 (prompt section budget + content)
- [ ] `app/src/lib/__tests__/complexity-parser.test.ts` — covers QA-03 (parser unit)
- [ ] `app/src/lib/__tests__/catbot-chat-route-complexity.test.ts` — covers QA-03/QA-04/QA-06 (gate end-to-end con LiteLLM mockeado vía vi.mock fetch)
- [ ] `app/src/lib/services/catbot-complexity-parser.ts` — module file (parser implementation)
- [ ] EXTEND `app/src/lib/__tests__/catbot-prompt-assembler.test.ts` — añadir describe block para complexity_protocol P0 registration
- [ ] EXTEND `app/src/lib/__tests__/intent-job-executor.test.ts` — añadir tests para notify throttle (Map + 60s) y force=true
- [ ] EXTEND `app/src/lib/__tests__/alert-service.test.ts` — añadir test para checkClassificationTimeouts

**Framework install:** none — vitest ya está instalado.

**Mock pattern recomendado para route.ts integration tests:** `vi.mock('@/lib/services/stream-utils')` + `vi.mock('global fetch')` para simular respuestas del LLM con/sin prefijo. Mismo patrón que `catbot-intents.test.ts` (Phase 129) y `intent-job-executor.test.ts` (Phase 130).

## Sources

### Primary (HIGH confidence)
- `app/src/app/api/catbot/chat/route.ts` (lines 46-502) — full source of truth para tool loop streaming + non-streaming
- `app/src/lib/services/catbot-prompt-assembler.ts` (lines 600-800) — buildIntentProtocol, buildComplexTaskProtocol, build() registration pattern
- `app/src/lib/services/catbot-tools.ts` (lines 1008-1023, 3233-3250) — queue_intent_job definition + executeTool case
- `app/src/lib/services/intent-job-executor.ts` (lines 90-180, 355-410) — tick(), runFullPipeline, notifyProgress, sendProposal
- `app/src/lib/services/notifications.ts` (line 7) — NotificationType union, ya extendido en Phase 130
- `app/src/lib/services/alert-service.ts` (lines 87, 234-280) — checks array + checkIntentsUnresolved + checkStuckPipelines + insertAlert
- `app/src/lib/logger.ts` (lines 6-21) — LogSource union, `catbot` y `intent-job-executor` ya cubren todas las necesidades de Phase 131
- `.planning/REQUIREMENTS.md` (lines 138-146) — QA-01..07 verbatim
- `.planning/phases/130-async-catflow-pipeline-creaci-n-asistida-de-workflows/130-RESEARCH.md` — patterns 1-6 reutilizables (intent_jobs CRUD, async tool flag, progress structure)
- `.planning/phases/129-intent-queue-promesas-persistentes-de-catbot/129-RESEARCH.md` — patterns para CRUD mirroring + prompt section structure + test pattern (vi.mock + tmp DB)
- `app/src/lib/db.ts` y `app/src/lib/catbot-db.ts` (intents, intent_jobs, knowledge_gaps schemas) — patterns esquema CRUD

### Secondary (MEDIUM confidence)
- `.planning/phases/128-sistema-de-alertas-memoria-de-conversaci-n-catbot/` — AlertService check pattern
- CLAUDE.md — protocolo de testing (CatBot oracle obligatorio en Plan 04)
- STATE.md — Phase 130 plans 03/04 status, decisiones previas

### Tertiary (LOW confidence)
- Ninguna. Toda la fase reusa patrones existentes verificados in-source.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — todo es código existente, cero deps nuevas
- Architecture: HIGH — 1:1 con patterns Phase 129/130 verificados
- Pitfalls: HIGH — el principal (streaming buffer) está identificado y documentado
- Parser regex: MEDIUM — el regex propuesto cubre casos comunes pero el LLM real puede sorprender; mitigado por fallback seguro
- Self-check heuristic: MEDIUM — la heurística "iter >= 3 + tool_calls" es razonable pero puede ser muy agresiva; el threshold se puede ajustar tras observación

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (30 días — el código del proyecto cambia rápido pero los patterns son estables)
