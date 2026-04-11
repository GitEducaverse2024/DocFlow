---
title: Respuestas a la auditoría de funnel completo (67 preguntas, Bloques A-M)
created: 2026-04-11
companion: AUDIT-catflow-pipeline-quality.md, AUDIT-respuestas-bateria-19q.md, AUDIT-bateria-funnel-completo.md
purpose: Evidencia + razonamiento detallado del funnel end-to-end antes de planificar Phase 133
status: working-document
---

# Respuestas — Auditoría de Funnel Completo

> Esta auditoría cubre el pipeline completo desde que el usuario escribe un mensaje hasta que recibe el resultado.
> 67 preguntas, 13 bloques. Cada respuesta incluye **evidencia literal** + **hechos** + **razonamiento** (mi criterio).
> Es el documento más profundo de los tres del trilogía: quick-audit (general), batería-19q (prompts+executor), funnel (end-to-end).

---

## BLOQUE A — Entrada y clasificación de la petición

### A1. Cadena completa desde Telegram hasta el clasificador

**Evidencia** ([telegram-bot.ts](app/src/lib/services/telegram-bot.ts)):

```
Telegram API (long-poll getUpdates, timeout=25s)
    ↓
pollLoop() — bucle infinito con auto-restart a 5s si crash
    ↓
processUpdate(update) — sequential, una por una
    ↓
msg.text ? → processCallbackQuery (si es botón) o rama de texto
    ↓
isAuthorized(chatId, username) ? — SVC-07 whitelist check
    ↓
handleCatBotMessage(chatId, text)
    ├─ cleanupStaleChats()
    ├─ accumula en history Map<chatId, messages[]>
    ├─ checkPermissionGate(chatId, text) — pre-flight regex de operaciones protegidas
    ├─ buildConversationWindow(history) — ventana 10 recientes + compactación
    └─ POST /api/catbot/chat { messages: windowed, channel:'telegram', channel_ref: String(chatId), sudo_active, user_id: 'telegram:<chatId>' }
    ↓
api/catbot/chat/route.ts
    ├─ iteration 0: llama LLM con system prompt que incluye buildComplexityProtocol()
    ├─ parseComplexityPrefix(iterationContent)
    ├─ saveComplexityDecision(...)
    └─ Si parsed.classification === 'complex' → break (sale del tool loop, responde pregunta de confirmación)
```

**Hechos:**
- **Transformaciones intermedias** antes de llegar al clasificador:
  1. `text.trim()` (línea 1 del processUpdate)
  2. `buildConversationWindow(history)` — el mensaje del usuario se **añade al history** antes de enviarlo, y el history se comprime si pasa de 10 mensajes recientes + compactación de los antiguos.
  3. Se enriquece con metadata: `channel`, `channel_ref`, `sudo_active`, `user_id`.
- **Capas intermedias del mensaje:** 3 (telegram-bot → API route → LLM chat completion con system prompt).
- **Permission gate pre-flight** (antes del LLM): un regex check bloquea operaciones destructivas si no hay sudo activo, devolviendo un mensaje de error sin llamar al LLM.

**Razonamiento:**

El diseño es razonable, pero hay dos puntos frágiles:

1. **La ventana de conversación (`buildConversationWindow`) es crítica y opaca.** Si el usuario ha tenido 15 mensajes previos en el chat, la ventana comprime los antiguos. Esa compactación la hace otro LLM (presumiblemente), lo que añade una fuente de variabilidad **antes** de llegar al clasificador de complejidad. Si la compactación pierde el contexto de "estoy pidiendo una comparativa Holded", el clasificador verá un mensaje descontextualizado.

2. **El permission gate es regex mechanical, no razonado.** Filtra por palabras clave ("eliminar", "crear cat_paw", "modificar"...). Eso significa que cualquier petición sobre cambiar entidades protegidas dispara sudo aunque sea una consulta (ej: "cuántos CatPaws tenemos" vs "crea un CatPaw"). Es un falso positivo potencial que obliga al usuario a autenticarse para conversar. Aceptable hoy, pero convendría mover el gate a una decisión post-LLM-iteración-0 una vez tenemos la complexity classification.

---

### A2. ¿Qué información recibe el clasificador?

**Evidencia** (POST /api/catbot/chat body desde telegram-bot.ts:handleCatBotMessage):

```ts
body: JSON.stringify({
  messages: windowed,                // Array de mensajes previos + el actual
  context: { page: 'telegram', channel: 'telegram' },
  channel: 'telegram',
  channel_ref: String(chatId),
  sudo_active: sudoActive,
  stream: false,
  user_id: `telegram:${chatId}`,
})
```

Dentro de `/api/catbot/chat/route.ts`, el system prompt se ensambla con `PromptAssembler` e incluye:
- Personalidad del CatBot
- `buildComplexityProtocol()` (el P0)
- Knowledge tree JSONs (catflow.json, catpaw.json, etc.)
- Resources disponibles (CatPaws activos, conectores, skills)
- Historial del usuario (user_profile, user_memory)

**Hechos:**
- El clasificador **es el LLM** ejecutándose en iteración 0 con el system prompt completo.
- Recibe **todo el system prompt** (incluye knowledge tree, resources, perfil del usuario, protocolo de complejidad).
- Recibe **el history de la conversación compactado** (últimos 10 + summary de los anteriores).
- **NO recibe** una representación explícita de "canvases existentes" (solo los CatPaws + connectors + skills vía el knowledge tree).
- **NO recibe** un inventario de templates reutilizables.

**Razonamiento:**

El clasificador tiene **más contexto del que probablemente necesita** para la decisión simple/complex, pero **menos contexto del que necesita para razonar bien**:

- El protocolo de complejidad son ~30 líneas en el system prompt, perdidas entre otros KBs mucho más grandes. El LLM tiene que "recordar" aplicarlas.
- El clasificador no sabe si ya existe un canvas similar al que el usuario pide. No puede decir "ya tienes el canvas 'Comparativa Holded Q1' creado, quieres ejecutarlo?" — solo puede decir "esto es complejo, preparo pipeline".
- El `context.page='telegram'` es una pista canal pero el LLM no hace nada con ella (al menos no está instruido).

Esta es la razón por la que a veces el clasificador decide complex cuando el usuario pide algo que **ya existe como canvas ejecutable**. Podríamos ahorrar todo el pipeline async si el clasificador mirara primero "¿hay un canvas que resuelve esto?".

---

### A3. Criterios exactos en `buildComplexityProtocol`

**Evidencia** (texto literal del prompt, extraído vía grep):

```
## Protocolo de Evaluacion de Complejidad (P0)

ANTES de usar tools, clasifica. Antepon a tu respuesta:
`[COMPLEXITY:simple|complex|ambiguous] [REASON:breve] [EST:Ns]`

### COMPLEJA si >=1:
- >3 ops secuenciales (entra... luego... despues...)
- Agregacion temporal (Q1, mes, ano, trimestre)
- >2 servicios externos (Holded+Drive+Email, n8n+RAG)
- Entrega formateada (informe, email maquetado)
- Comparacion cross-source o analisis+accion

Ej COMPLEJAS:
- "entra holded, Q1 2026 + Q1 2025 + comparativa + email"
- "descarga PDFs Drive, RAG, resumen ejecutivo"
- "crea CatPaw + skill + n8n + test"

### SIMPLE si:
- 1-2 tool calls (list_*, get_*)
- CRUD puntual sin agregacion

Ej SIMPLES: "lista mis CatBrains", "ejecuta catflow X", "crea CatPaw Y"

### AMBIGUA: vaga ("haz un resumen") -> trata como simple, marca ambiguous.

### REGLA DURA
Si complex: NO ejecutes tools. Responde: "Tarea compleja (~Nmin). Preparo CatFlow asincrono con reportes cada 60s?"
Si acepta -> queue_intent_job({description}). Si rechaza -> inline.

Ej: `[COMPLEXITY:complex] [REASON:4 ops + agregacion + formato] [EST:180s]`
```

**Hechos:**
- **No son keywords ni regex.** Es un protocolo de razonamiento del LLM: 5 criterios disjuntos (con >=1 cumplido → complex).
- Criterios:
  1. `>3 ops secuenciales` (indicadores: "entra...", "luego", "despues")
  2. `Agregacion temporal` (Q1, mes, año, trimestre)
  3. `>2 servicios externos`
  4. `Entrega formateada` (informe, email maquetado)
  5. `Comparacion cross-source` o `analisis+accion`
- **3 ejemplos concretos por clase** (complex / simple / ambigua).
- **La regla dura está explícita:** si complex → NO tools, responde con pregunta de confirmación.
- **Prefijo tagueado:** `[COMPLEXITY:xxx] [REASON:yyy] [EST:Ns]` parseado por `parseComplexityPrefix` en código TypeScript.

**Razonamiento:**

El protocolo tiene tres fortalezas y dos debilidades:

**Fortalezas:**
1. Criterios disjuntos con "any-of" lógica es fácil de entender para el LLM.
2. Ejemplos concretos (3 complex + 3 simple + 1 ambigua) son el mejor anclaje posible — es few-shot en miniatura.
3. El formato del prefijo es simple y parseable sin ambigüedad.

**Debilidades:**
1. **No tiene escape para tareas que parecen complex pero son simple.** Ejemplo: "dame un informe diario de holded" → podría parecer complex (entrega formateada + servicio externo), pero si ya existe un canvas "Informe Diario Holded" y el usuario solo quiere ejecutarlo, debería ser simple. El protocolo no tiene la ruta "busca canvas existente primero".
2. **"`Comparacion cross-source`" es ambiguo.** ¿Qué cuenta como cross-source? Holded + Drive es obvio. ¿Holded invoices + Holded contacts? El protocolo no lo especifica. El LLM improvisa caso por caso.

Para Phase 133 vale la pena añadir un sexto ejemplo: **"Tarea que ya existe como canvas ejecutable"** → simple (ejecuta canvas existente) en vez de complex (pipeline async). Esto requiere darle al clasificador acceso a `list_catflows` tool, al menos como parte del contexto.

---

### A4. ¿Mecanismo de self-check para clasificaciones erróneas?

**Evidencia:** Búsqueda en código de cualquier mecanismo de escalado retroactivo.

No existe. El clasificador decide en iteración 0 y:
- Si es simple → entra en el tool-calling loop (máx 12 rondas según MAX_TOOL_ROUNDS en execute-catpaw.ts).
- Si es complex → break inmediato, responde con pregunta, espera confirmación del usuario.

**Hechos:**
- **No hay self-check `>3 tool calls → escalar a complex`.** Esto estaba mencionado en la batería anterior como hipótesis, pero no está implementado.
- La iteración N>0 del tool loop simplemente ejecuta tools hasta max 12 rondas o hasta que el LLM devuelva respuesta sin tools.
- Si el LLM clasificó simple pero la tarea requiere 15 tool calls, se queda colgado hasta timeout.

**Razonamiento:**

Este es un gap real. El protocolo de complejidad **no tiene forma de auto-corregirse en runtime**. Si el LLM clasificó mal en iteración 0, el usuario va a sufrir una ejecución lenta y probablemente incorrecta.

Un self-check simple sería: **en cada iteración, contar el número de tool calls acumulados**; si pasa de 3 y la tarea no parece convergir, abortar el tool loop y sugerir al usuario "esta tarea está siendo más compleja de lo esperado, te propongo moverla a pipeline async".

Otro más barato: **en iteración 0, si el goal del usuario menciona más de 2 tools distintos ya en la primera respuesta del LLM (detectado por heurística simple de contar substrings)**, forzar escalado.

Ambos son añadidos pequeños al route.ts. No son críticos para Phase 133 pero son follow-ups naturales.

---

### A5. ¿Qué pasa en el camino SIMPLE? ¿Puede agotar herramientas?

**Evidencia** (flow de tool-calling en `/api/catbot/chat/route.ts` + `execute-catpaw.ts:472`):

- Máximo 12 rondas de tool-calling por ejecución (`MAX_TOOL_ROUNDS = 12`).
- En cada ronda:
  - Se llama al LLM con los mensajes acumulados y el conjunto de tools.
  - Si el LLM devuelve `tool_calls`, se ejecutan en secuencia y se pasan los resultados como `tool` messages de vuelta.
  - Si el LLM devuelve contenido (sin tool_calls), se termina el loop.
- Si se llega a la ronda 12 sin convergencia, **se fuerza una ronda final sin tools** para que el LLM sintetice lo que tenga.

**Hechos:**
- Sí, una tarea simple puede agotar las 12 rondas si:
  - El LLM insiste en llamar tools después de 12 iteraciones.
  - Los tools devuelven errores y el LLM sigue reintentando.
  - La tarea requiere genuinamente >12 pasos (mal clasificada como simple).
- Cuando se agotan las rondas, el LLM devuelve **lo que tenga** en la ronda 12 final. Esto puede ser:
  - Una respuesta parcial ("He conseguido extraer los datos de 2025 pero no los de 2026 porque...").
  - Una respuesta incorrecta (el LLM sintetiza a partir de tools fallidos como si hubieran funcionado).
  - Un error útil.

**Razonamiento:**

**Sí, puede producir una respuesta incompleta que el usuario ve como correcta.** Este es un modo de fallo insidioso porque el usuario no sabe cuándo el LLM está improvisando y cuándo tiene datos reales.

Hay un mecanismo mitigante existente: cada ronda del tool loop **se loggea** en conversation_log + `usage_events`, así que podemos auditar si un mensaje consumió 12 rondas (indicativo de pseudo-fallo) vs 2 (normal).

Para Phase 133 un contador al final del loop: "si se usaron >=8 rondas y no hubo convergencia clara, añade al mensaje del usuario una warning 'esta respuesta puede ser parcial'". No es caro y mejora la confianza.

---

### A6. ¿Existe `complexity_decisions` y cuál es su tasa de acierto?

**Evidencia** ([catbot-db.ts:156-170](app/src/lib/catbot-db.ts#L156-L170)):

```sql
CREATE TABLE IF NOT EXISTS complexity_decisions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel TEXT DEFAULT 'web',
  message_snippet TEXT,
  classification TEXT NOT NULL,
  reason TEXT,
  estimated_duration_s INTEGER,
  async_path_taken INTEGER DEFAULT 0,
  outcome TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_complexity_user ON complexity_decisions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complexity_classification ON complexity_decisions(classification, created_at DESC);
```

**Hechos:**
- La tabla existe y registra cada decisión del clasificador.
- Campos: `classification` (simple/complex/ambiguous), `reason`, `estimated_duration_s`, `async_path_taken` (boolean), `outcome` (`completed`/`queued`/`timeout`/`cancelled`/NULL).
- El flujo de auditoría diseñado:
  1. `/api/catbot/chat` iter 0 → `saveComplexityDecision({classification, reason, estimated_duration_s, async_path_taken: 0})`.
  2. Si el usuario confirma y se llama `queue_intent_job` → `updateComplexityOutcome(decisionId, 'queued', true)`.
  3. Si la tarea simple se completa → el outcome queda sin actualizar (ruta feliz no cierra el log).

**No consulté la DB real** en este momento para conseguir estadísticas. Para hacerlo:

```sql
SELECT classification, COUNT(*), AVG(async_path_taken)
FROM complexity_decisions
GROUP BY classification;
```

**Razonamiento:**

La tabla existe y captura las decisiones, pero tiene **un gap de cierre del ciclo**:

- Las decisiones `simple` nunca se cierran con un outcome. Si el tool loop colapsa (A5) no hay manera de saber que la clasificación simple fue incorrecta.
- Las decisiones `complex` sí se cierran con `outcome='queued'` cuando se encola, pero nunca se actualiza con `outcome='completed'|'failed'` cuando el pipeline async termina.
- `outcome='timeout'` y `outcome='cancelled'` están definidos en el schema pero no veo dónde se setean en código.

Para medir tasa de acierto se necesita **correlación cruzada** con `intent_jobs.status` (para las complex) y con el outcome de las iteraciones de simple (que no existe). Phase 133 debería cerrar ese loop para que tengamos analytics reales, no solo logs.

---

## BLOQUE B — Encolado y lo que viaja por el pipeline

### B1. ¿Qué campos se insertan en `intent_jobs`?

**Evidencia** ([catbot-db.ts schema + createIntentJob](app/src/lib/catbot-db.ts)):

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS intent_jobs (
  id TEXT PRIMARY KEY,
  intent_id TEXT,
  user_id TEXT NOT NULL,
  channel TEXT DEFAULT 'web',
  channel_ref TEXT,
  pipeline_phase TEXT DEFAULT 'pending',
  tool_name TEXT,
  tool_args TEXT,
  canvas_id TEXT,
  status TEXT DEFAULT 'pending',
  progress_message TEXT DEFAULT '{}',
  result TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);
```

**INSERT en `createIntentJob`:**
```ts
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
```

**Hechos:**
- 7 campos insertados explícitamente; los otros 9 se inicializan a sus defaults del schema (`status='pending'`, `progress_message='{}'`, etc.).
- `tool_name` normalmente es `'__description__'` (síntesis de descripción libre) o el nombre de un tool async concreto como `'execute_catflow'`.
- `tool_args` contiene `{description, original_request}` cuando es descripción libre.
- **NO se guarda** el historial de conversación previo.
- **NO se guarda** contexto del thread de Telegram (thread_id).
- **NO se guarda** ningún estado del usuario relevante para el pipeline (perfil, memoria, preferencias de idioma, etc.).
- **Sí se guarda** el `channel_ref` (chat_id de Telegram).

**Razonamiento:**

Esto es **un gap significativo** para ejecuciones complejas. El pipeline async pierde todo el contexto previo al momento del encolado:

- Si el usuario dijo "como la última vez, pero para Q2" → el `original_request` guardado es "como la última vez, pero para Q2", sin el contexto del "última vez".
- Si el usuario tiene preferencias persistentes (idioma, template preferido, destinatarios de email frecuentes), el strategist no las ve.
- El thread ID de Telegram no se propaga, así que el `sendProposal` crea un mensaje nuevo en la conversación principal en vez de responder al thread original si el usuario usó threads.

Phase 133 debería extender el INSERT para guardar:
- `conversation_snapshot` (últimos 5 mensajes del chat justo antes del encolado, compactados).
- `user_profile_snapshot` (o al menos un hash del user_profile_id para lookup después).
- `thread_id` de Telegram si está disponible.

Aumenta el row size en ~2-5KB pero es necesario para pipelines que reusen contexto.

---

### B2. ¿Por qué 60s de BOOT_DELAY?

**Evidencia** ([intent-job-executor.ts:46-47](app/src/lib/services/intent-job-executor.ts#L46-L47)):

```ts
const CHECK_INTERVAL = 30 * 1000; // 30s
const BOOT_DELAY = 60_000;         // 60s — staggered after IntentWorker (45s)
```

Y el `start()` lo aplica directamente via `setTimeout`:

```ts
this.timeoutId = setTimeout(() => {
  this.tick().catch(err => logger.error(...));
  this.intervalId = setInterval(() => {
    this.tick().catch(err => logger.error(...));
  }, CHECK_INTERVAL);
}, BOOT_DELAY);
```

**Hechos:**
- BOOT_DELAY hardcoded a 60000ms. No es configurable via env var.
- Comentario explica: "staggered after IntentWorker (45s)". El staggering evita contención de recursos al arranque del proceso (AlertService 30s → IntentWorker 45s → IntentJobExecutor 60s).
- CHECK_INTERVAL de 30s entre ticks.
- **Worst case latency** del primer tick post-encolado: si el usuario encola justo después del `start()`, el job espera el BOOT_DELAY completo (60s) + hasta el primer intervalo (30s) = **hasta 90s** antes de que el pipeline empiece.
- **Normal case:** si el proceso lleva rato corriendo, el tick ya está en intervalo de 30s, así que la latencia es 0-30s. Media ~15s.
- **El usuario SÍ recibe feedback durante ese tiempo:** la respuesta inmediata de `queue_intent_job` ("Pipeline encolado. En breve te enviare la propuesta.") la manda el tool directamente, no el executor.

**Razonamiento:**

Los 60s iniciales son una decisión arbitraria pero razonable para evitar una cold-start storm. El problema es que **no se comunica al usuario**. El `queue_intent_job` devuelve "en breve te enviaré la propuesta" pero no explica si "breve" son 10s o 2 minutos.

Para Phase 133 propongo: en `queue_intent_job`, estimar dinámicamente el delay y comunicarlo:
- Si `IntentJobExecutor.isRunning === false` o recién arrancado, el mensaje incluye "aproximadamente 60-90 segundos para empezar".
- Si ya está en régimen estable, "30 segundos aproximadamente".

Alternativa más brusca: **disparar un tick inmediato** al encolar, saltándose el intervalo natural. El executor vería el job nuevo en el siguiente tick natural de todos modos, así que esto solo adelanta ~15s en media.

---

### B3. ¿Qué pasa si el servidor se reinicia con un job en estado intermedio?

**Evidencia** ([catbot-db.ts:cleanupOrphanJobs](app/src/lib/catbot-db.ts)):

```ts
export function cleanupOrphanJobs(): void {
  catbotDb.prepare(`
    UPDATE intent_jobs
    SET status = 'failed',
        error = 'Abandoned on restart',
        updated_at = datetime('now'),
        completed_at = datetime('now')
    WHERE status = 'pending'
      AND pipeline_phase NOT IN ('pending','architect_retry','awaiting_approval','awaiting_user')
  `).run();
}
```

`IntentJobExecutor.start()` lo invoca antes de arrancar los timers:

```ts
static start(): void {
  logger.info('intent-job-executor', 'Starting with boot delay', { delayMs: BOOT_DELAY });
  try {
    this.cleanupOrphans();
  } catch (err) {
    logger.error('intent-job-executor', 'cleanupOrphans failed on start', { error: String(err) });
  }
  this.timeoutId = setTimeout(() => { ... }, BOOT_DELAY);
}
```

**Hechos:**
- Al arranque, **todos los jobs huérfanos** en estado intermedio (`strategist`, `decomposer`, `architect`, `running`, ...) se marcan como `failed` con `error='Abandoned on restart'`.
- Fases **preservadas** (no tocadas): `pending`, `architect_retry`, `awaiting_approval`, `awaiting_user`.
- **No hay resume from intermediate phase.** Un job en `strategist` al morir el proceso pierde el trabajo de strategist y se marca failed. El usuario recibe notificación de fallo (si hubo error reportado) y tiene que reenviar.
- Las fases preservadas son puntos de retoma seguros porque no tienen trabajo a medias (solo esperan input del usuario o son estado de entrada).

**Razonamiento:**

La estrategia es **fail-loud** en vez de **resume-partial**. Tiene sentido técnicamente: los prompts del strategist/decomposer/architect consumen LLM calls y el estado intermedio (goal, tasks) podría ser inconsistente si el proceso murió mid-call.

Pero tiene un coste UX: **si el usuario encola una tarea compleja y el proceso se reinicia 30s después (deploy, restart, crash), el job se pierde sin aviso claro**. `cleanupOrphanJobs` marca failed pero NO envía notificación al usuario — ese paso no está en el código. El usuario se queda esperando una propuesta que nunca llega.

Fix simple para Phase 133: en `cleanupOrphanJobs` además de marcar failed, iterar los jobs huérfanos y llamar a un equivalente de `notifyProgress` para comunicar "tu pipeline se interrumpió por reinicio del servidor, vuelve a enviar la petición". Eso cierra el loop sin intentar reanudar trabajo a medias.

---

### B4. ¿Concurrencia o secuencial estricto?

**Evidencia** ([intent-job-executor.ts:125-176](app/src/lib/services/intent-job-executor.ts#L125-L176)):

```ts
static async tick(): Promise<void> {
  if (this.currentJobId) {
    logger.info('intent-job-executor', 'Skipping tick — job in progress', {
      jobId: this.currentJobId,
    });
    return;
  }
  let job: IntentJobRow | undefined;
  try {
    job = getNextPendingJob();
  } catch (err) { ... }
  if (!job) return;

  this.currentJobId = job.id;
  try {
    if (job.pipeline_phase === 'architect_retry') {
      await this.runArchitectRetry(job);
    } else {
      await this.runFullPipeline(job);
    }
  } catch (err) { ... }
  finally {
    this.currentJobId = null;
  }
}
```

**Hechos:**
- **Estrictamente secuencial.** El guard `this.currentJobId` asegura que solo un job se procesa a la vez.
- Si hay 3 jobs pendientes y uno tarda 4 minutos en el strategist + decomposer + architect + QA loop, los otros 2 **esperan**.
- El throughput máximo es 1 job por cada ciclo completo del pipeline. Si un job consume 180s, el throughput es ~20 jobs/hora.
- **No hay pool de workers.** No hay forma de paralelizar con el código actual.

**Razonamiento:**

Esto es **adecuado para Phase 132** (pocos usuarios, pocas tareas concurrentes) pero va a ser un cuello de botella cuando el sistema escale. Dos observaciones:

1. **No hay buffer backpressure.** Si llegan 20 peticiones complex simultáneas, entran todas a la cola y se procesan una a una. El usuario 20 espera ~60 minutos antes de ver su propuesta. El `queue_intent_job` no mira la cola, así que no puede devolver "hay 15 jobs delante tuyo, ETA 40 minutos".

2. **La secuencialidad es en parte necesaria.** El executor comparte una DB SQLite (better-sqlite3) que es single-writer. Paralelizar múltiples pipelines concurrentes tendría que coordinar escrituras (a intent_jobs, canvases, canvas_runs). Posible pero no trivial.

Para Phase 133 la prioridad es **exponer la cola** al usuario y al CatBot: un tool `list_pending_jobs` que permita decir "tu pipeline X está encolado, hay 3 delante, ETA ~5 minutos". El paralelismo real es un follow-up mayor, no bloqueante si el volumen actual es bajo.

---

### B5. ¿Mecanismo de timeout por job?

**Evidencia:** Búsqueda exhaustiva de timeouts en intent-job-executor.ts.

- No hay `setTimeout` alrededor de las llamadas LLM individuales (strategist, decomposer, architect, QA).
- Las llamadas LLM usan `fetch` al LiteLLM proxy sin `AbortSignal.timeout`.
- `callLLM()` helper tampoco tiene timeout.
- El único timeout implícito es el HTTP default del runtime (probablemente infinito o muy largo).

**Hechos:**
- Si el strategist LLM call cuelga, el job queda bloqueado en `this.currentJobId` hasta que la llamada retorne o el proceso muera.
- **No hay job reaper en runtime** específico para jobs en fase intermedia prolongada. El único cleanup es `cleanupOrphanJobs` que solo se ejecuta al arranque del proceso.
- El `AlertService` (ver Phase 128) probablemente monitoriza jobs atascados pero NO aborta la llamada LLM — solo reporta que hay un job parado (confirmar en Phase 133).

**Razonamiento:**

Este es un **modo de fallo silencioso grave**. Si LiteLLM tiene un problema que cuelga la request, el IntentJobExecutor se queda bloqueado indefinidamente. El `currentJobId` evita que otros jobs progresen. El usuario ve "QA review iteracion 0..." como último mensaje y nada más.

Lo mínimo que Phase 133 debería añadir:

```ts
private static async callLLM(systemPrompt: string, userInput: string): Promise<string> {
  const CALL_TIMEOUT_MS = 90_000; // 90s por fase LLM
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);

  try {
    const res = await fetch(..., { signal: controller.signal });
    ...
  } finally {
    clearTimeout(timer);
  }
}
```

Combinado con un timeout global del tick (si el tick entero lleva >300s, abort), elimina el failure mode.

Y para los jobs ya stuck por fallos previos: un job reaper periódico que corre cada 5 minutos y marca failed cualquier job cuyo `updated_at` no haya cambiado en los últimos 10 minutos en una fase activa.

---

## BLOQUE C — Pipeline de diseño LLM

### C1. `STRATEGIST_PROMPT` literal

**Evidencia** ([catbot-pipeline-prompts.ts:16-18](app/src/lib/services/catbot-pipeline-prompts.ts#L16-L18)):

```ts
export const STRATEGIST_PROMPT = `Eres un estratega de pipelines. Recibes una peticion del usuario (tool original + args) y devuelves un objetivo claro y accionable en JSON.
Responde SOLO con JSON de forma:
{ "goal": "descripcion concisa del objetivo final en <200 chars", "success_criteria": ["criterio 1", "criterio 2"], "estimated_steps": N }`;
```

**Hechos:**
- **3 líneas**. Es el prompt más corto de todos los del pipeline.
- Output schema: `{goal, success_criteria[], estimated_steps}`.
- `goal` limitado a <200 chars. Forza concisión.
- **NO recibe** contexto adicional sobre recursos disponibles.
- **NO recibe** historial del usuario.
- **NO pregunta al LLM que justifique o razone**, solo que devuelva el objetivo.

**Razonamiento:**

El strategist es una **capa de normalización** — toma una petición del usuario (posiblemente ambigua) y la convierte en un goal accionable. Lo hace con poca información:
- Solo el `tool_args` (que contiene `description` y `original_request`).
- Un output rígido que limita lo que puede expresar.

El resultado es un goal que a veces es útil y a veces es tautológico. Por ejemplo, para el caso Holded Q1 real:
- Input: "Extraer facturación Q1 2026 de Holded, comparativa con 2025, email a antonio y fen"
- Output: `{goal: "Extraer facturación Q1 2025 y Q1 2026 de Holded, generar comparativa ejecutiva, maquetar con plantilla corporativa y enviar por email a antonio@educa360.com y fen@educa360.com."}`

Básicamente **reformateó el original_request palabra por palabra**. El success_criteria era algo como `["email enviado"]`. No añadió valor.

**Hipótesis:** para casos simples el strategist es pass-through, para casos ambiguos sí ayuda (ej: "mándame el informe de siempre" → strategist lo interpreta). Pero hoy **no hay forma de medir eso** porque el strategist output no se persiste más allá del `progress_message`.

Para Phase 133 el strategist podría fusionarse con el decomposer (menos LLMs = menos variabilidad) O reforzarse con un prompt que diga "enriquece la petición con suposiciones razonables: template default, destinatarios frecuentes del usuario, periodo actual si no se especifica". Eso le daría valor real.

---

### C2. `DECOMPOSER_PROMPT` literal

**Evidencia** ([catbot-pipeline-prompts.ts:20-24](app/src/lib/services/catbot-pipeline-prompts.ts#L20-L24)):

```ts
export const DECOMPOSER_PROMPT = `Eres un despiezador de tareas. Recibes un objetivo y lo divides en 3-8 tareas secuenciales o paralelas. Cada tarea debe ser atomica (una sola operacion) y describir QUE hacer, no COMO.
Responde SOLO con JSON de forma:
{ "tasks": [
  { "id": "t1", "name": "...", "description": "...", "depends_on": [], "expected_output": "..." }
] }`;
```

**Hechos:**
- **5 líneas.** Pide 3-8 tareas atómicas.
- Cada tarea tiene: `id`, `name`, `description`, `depends_on[]` (para secuencial/paralelo), `expected_output`.
- Regla clave: "QUÉ hacer, no CÓMO" — pide abstracción, no implementación.
- **NO recibe** el inventario de recursos (CatPaws, conectores). **Trabaja a ciegas** sobre qué existe en el sistema.
- **NO hay validación** del número de tasks ni de su coherencia. Si devuelve 15 o 1 tarea, el executor no se queja.
- **NO hay validación** de que los `depends_on` apunten a ids existentes.

**Razonamiento:**

Trabajar a ciegas es un **bug de diseño**. El decomposer produce tareas como "Extraer facturación Q1 2025 de Holded" sin saber si existe un CatPaw que sepa hacer eso. Luego el architect recibe esas tareas y tiene que mapearlas a recursos, y si no encaja genera `needs_cat_paws`.

Mejor flujo sería: **decomposer recibe también el inventario**. Entonces produce tareas como "Extraer facturación Q1 2025 de Holded **usando CatPaw Filtro Holded**". El architect ya no tiene que adivinar el mapeo.

Esto añadiría ~500-1000 tokens al prompt del decomposer (inventario de CatPaws + descripciones breves), pero eliminaría una fuente de error sistemática.

**El número de tasks:** 3-8 es razonable pero arbitrario. Para el caso Holded Q1 el decomposer produjo 5 tasks (vimos en el progress_message). Para tareas más simples debería producir 2-3. Para tareas muy complejas debería poder producir más — pero 8 es el techo duro.

La limitación es razonable porque más de 8 nodes en un canvas se hace difícil de razonar. Pero no hay lógica de colapso: si el decomposer produce 10, el architect recibe 10 y probablemente crea 10 nodes. No hay paso intermedio que los agrupe.

---

### C3. ¿Cuántas tareas produce típicamente el decomposer?

**Evidencia:** El único caso observable es el caso Holded Q1 (23:18 UTC), donde el `progress_message` intermedio mencionaba "5 tareas identificadas". No hay analytics sobre otras ejecuciones.

**Hechos:**
- Para Holded Q1 → 5 tasks.
- El rango declarado en el prompt es 3-8.
- El architect mapea **1:1 task → node**. No hay lógica de colapso, y el rules index no tiene regla sobre "agrupar tareas".
- Si el decomposer devuelve 8 tasks, el canvas tendrá ~8 nodos funcionales + los guards auto-insertados (~12-14 total).

**Razonamiento:**

La observabilidad sobre este número es **casi cero**. No hay:
- Tabla que registre el número de tasks por ejecución.
- Métrica de "task → node" ratio.
- Histograma de tasks por tipo de petición.

Para Phase 133 sería útil persistir el strategist/decomposer output en `intent_jobs` directamente (en campos dedicados, no dentro de `progress_message` que es solo para UI). Algo como:

```sql
ALTER TABLE intent_jobs ADD COLUMN strategist_output TEXT;
ALTER TABLE intent_jobs ADD COLUMN decomposer_output TEXT;
ALTER TABLE intent_jobs ADD COLUMN architect_output TEXT;
```

Con eso podemos hacer post-mortem real: "de las últimas 50 ejecuciones, cuántas tasks promedio? cuántas tenían más de 6? cuántas fallaron por falta de CatPaw adecuado?"

---

### C4. ¿Modelo usado, temperatura, persistencia del output?

**Evidencia** ([intent-job-executor.ts:507-539](app/src/lib/services/intent-job-executor.ts#L507-L539) — callLLM):

```ts
private static async callLLM(systemPrompt: string, userInput: string): Promise<string> {
  const litellmUrl = process['env']['LITELLM_URL'] || 'http://litellm:4000';
  const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
  const model = process['env']['CATBOT_PIPELINE_MODEL'] || 'gemini-main';

  const res = await fetch(`${litellmUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { ... },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput },
      ],
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    }),
  });
  ...
}
```

**Hechos:**
- **Modelo único:** `process.env.CATBOT_PIPELINE_MODEL || 'gemini-main'`. Los 4 LLMs del pipeline (strategist, decomposer, architect, QA) usan el mismo modelo.
- **Temperatura fija:** 0.3 (moderadamente determinista pero no cero).
- **max_tokens: 4000** (mismo para todos).
- **`response_format: {type: 'json_object'}`** fuerza output JSON válido.
- **Persistencia:** solo el output final del architect se persiste en `canvases.flow_data`. Los outputs intermedios (strategist, decomposer, QA) viven brevemente en `intent_jobs.progress_message` como estado UI pero NO se persisten como auditoría post-mortem.

**Razonamiento:**

El uso del mismo modelo para los 4 roles es una decisión de simplicidad pero **pierde una oportunidad de optimización**:

- El strategist es trivial (normalizar una petición) → modelo barato/rápido (ej: gemini-flash) bastaría.
- El decomposer requiere reasoning ligero → también gemini-flash sería suficiente.
- El architect es donde la calidad importa → aquí sí usar gemini-main o gemini-pro.
- El reviewer QA necesita ser estricto y detallista → gemini-pro o modelo más grande.

Usar el mismo modelo para todos significa que pagamos gemini-main en fases donde no lo necesitamos, y **no tenemos margen para usar modelos más potentes** en las fases críticas sin duplicar coste.

Temperatura 0.3 es un valor razonable pero también podría bajar a 0.1 en fases donde la variabilidad es contraproducente (strategist, QA) y subir a 0.5 en fases creativas (architect podría beneficiarse de más variedad).

**Lo más crítico:** la ausencia de persistencia de outputs intermedios es un gap de diagnóstico. Sin eso no puedo reproducir por qué el decomposer produjo 5 tasks y no 3. Phase 133 debe cerrarlo.

---

### C5. ¿Error handling del strategist/decomposer?

**Evidencia** ([intent-job-executor.ts:186-220](app/src/lib/services/intent-job-executor.ts#L186-L220) + parseJSON fallback):

```ts
// Phase 1: strategist
updateIntentJob(job.id, { pipeline_phase: 'strategist' });
this.notifyProgress(job, 'Procesando fase=strategist...');
const strategistRaw = await this.callLLM(STRATEGIST_PROMPT, this.buildStrategistInput(job));
const strategistOut = this.parseJSON(strategistRaw) as { goal?: unknown };
const goal = strategistOut.goal ?? '';
```

Y `parseJSON`:

```ts
private static parseJSON(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Strip markdown fences and retry
    const stripped = raw
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    return JSON.parse(stripped);
  }
}
```

**Hechos:**
- Si el strategist/decomposer devuelve JSON malformado, `parseJSON` intenta limpiar markdown fences. Si aún falla, **lanza excepción** que burbujea hasta el `catch` del `tick()`, que marca el job como `failed` con el mensaje de error.
- Si el output es JSON válido pero **tiene el goal vacío o las tasks vacías**, el código continúa con `goal = ''` o `tasks = []`. **No hay validación**.
- `const taskCount = Array.isArray(tasks) ? tasks.length : 0;` solo se loggea, no se valida (ni siquiera se chequea que sea > 0).
- El architect recibe entonces datos inválidos (goal vacío, tasks vacías) y probablemente genera un canvas vacío o se confunde.

**Razonamiento:**

Este es un **modo de fallo silencioso** que puede manifestarse como "canvas que parece válido pero no hace nada útil". Un validator mínimo:

```ts
if (!goal || String(goal).trim().length < 10) {
  throw new Error(`Strategist returned empty/invalid goal: ${JSON.stringify(strategistOut)}`);
}
if (!Array.isArray(tasks) || tasks.length === 0) {
  throw new Error(`Decomposer returned no tasks: ${JSON.stringify(decomposerOut)}`);
}
```

Es trivial de añadir y convierte fallos silenciosos en fallos loud. Debería estar en Phase 133.

---

### C6. ¿Feedback loop entre ejecución del canvas y los prompts?

**Evidencia:** Búsqueda exhaustiva — no hay ningún mecanismo que tome el resultado de un canvas ejecutado y lo alimente de vuelta al strategist/decomposer/architect.

**Hechos:**
- Cada pipeline parte de cero.
- El strategist no sabe si "hacer comparativa Holded" tuvo éxito la última vez.
- El architect no sabe si el canvas generado la última vez convergió al accept o agotó el QA loop.
- El rules index es estático y no se actualiza en función de fallos observados.
- Los `knowledge_gaps` se acumulan en DB pero nadie los lee para retroalimentar prompts.

**Razonamiento:**

Esto es **por diseño** pero tiene coste: el sistema no mejora con el uso. Cada ejecución fallida es una oportunidad de aprendizaje desperdiciada.

Un feedback loop mínimo sería:
1. Cuando un canvas se ejecuta con éxito (notifyOnComplete), un proceso async registra el goal + el flow_data final como "ejemplo exitoso".
2. Cuando el QA loop agota, registra el goal + el qa_report como "ejemplo fallido".
3. Un proceso periódico (cron, 1x/día) consulta estos registros, extrae patrones comunes (ej: "5 de 10 canvases de tipo Holded tenían el mismo error de R10 en el emitter") y los añade al rules index como reglas específicas o ejemplos del ARCHITECT_PROMPT.

Esto es Phase 134 o 135, no 133. Pero la infraestructura para habilitarlo (persistencia de outputs intermedios, C4) es Phase 133.

---

## BLOQUE D — Contexto del architect

### D1. `scanCanvasResources` literal

**Evidencia** ([canvas-flow-designer.ts:99-117](app/src/lib/services/canvas-flow-designer.ts#L99-L117)):

```ts
export function scanCanvasResources(db: DbLike): CanvasResources {
  const safe = (sql: string): unknown[] => {
    try {
      const rows = db.prepare(sql).all();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };

  return {
    catPaws: safe(
      'SELECT id, name, description, mode, system_prompt FROM cat_paws WHERE is_active = 1 LIMIT 50',
    ),
    catBrains: safe('SELECT id, name, description FROM catbrains LIMIT 50'),
    skills: safe('SELECT id, name, description FROM skills LIMIT 50'),
    connectors: safe('SELECT id, name, type FROM connectors LIMIT 50'),
  };
}
```

**Hechos:**
- Devuelve 4 arrays: `catPaws`, `catBrains`, `skills`, `connectors`.
- Cada uno limitado a 50 rows (hardcoded, no paginación).
- `catPaws`: incluye `id, name, description, mode, system_prompt`.
- `catBrains`: solo `id, name, description`.
- `skills`: solo `id, name, description`.
- `connectors`: solo `id, name, type`.

**Campos ausentes relevantes:**
- `cat_paws`: NO incluye las `skills` vinculadas, NI los `connectors` vinculados, NI las `catBrains` vinculadas a cada CatPaw. El architect no sabe qué tools tiene cada CatPaw disponibles.
- `connectors`: NO incluye el `config` ni la descripción de qué hace el connector. Solo `{id, name, type}`.
- `skills`: solo descripción textual, no las tools/endpoints que expone.
- `catBrains`: no incluye estadísticas (n_docs, actualizado_en).

**Razonamiento:**

Este es **el gap más crítico del architect** identificado hasta ahora. El architect se entera de que existe "CatPaw Filtro Holded" pero NO sabe:
- Qué conectores tiene vinculados (→ no sabe qué tools puede llamar).
- Qué skills tiene (→ no sabe qué capacidades tiene).
- Qué CatBrains tiene vinculados (→ no sabe si tiene RAG disponible).

Resultado: el architect mapea "extraer datos Holded" a `agentId='xxx'` de Filtro Holded, con instructions vagas. El executor runtime invoca `executeCatPaw(filtro_holded, {query: 'Extraer Q1 2025'})` — y el CatPaw usa sus tools para intentarlo, pero sin que las instrucciones del nodo mencionen los tools por nombre, la probabilidad de que haga lo correcto baja.

Las instructions hand-crafted (batería anterior P15) siempre mencionan tools por nombre (`holded_list_invoices`, `gmail_search_emails`). El architect no puede hacerlo porque no los conoce.

**Phase 133 debe extender `scanCanvasResources`** para incluir para cada CatPaw:

```ts
catPaws: [
  {
    id: "5d8fbdd7-...",
    name: "Filtro Holded",
    description: "Extrae datos contables",
    mode: "oneshot",
    system_prompt_preview: "Eres un experto...",
    connectors: [{ id: "holded-mcp", name: "Holded MCP", type: "mcp_server" }],
    skills: [{ id: "skill-1", name: "Holded API" }],
    catBrains: [],
    tools_available: ["holded_list_invoices", "holded_list_contacts", "holded_list_payments"],  // flattened
  }
]
```

Ese "tools_available" le permitiría al architect mencionar tools por nombre en las instructions. Cambio contenido (query JOIN extra, ~20 líneas), impacto grande.

---

### D2. ¿Sabe el architect qué conectores tiene cada CatPaw?

**Evidencia:** Confirmado por D1 — NO.

**Hechos:**
- El schema de `cat_paws_connectors` existe (tabla de junction), pero `scanCanvasResources` no hace JOIN con ella.
- El architect solo ve `catPaws[].system_prompt` que podría mencionar tools textualmente (si el humano que creó el CatPaw lo puso), pero es inconsistente y no estructurado.

**Razonamiento:**

Confirma D1. Este es el gap #1 a cerrar en Phase 133 para el architect. Sin eso, la calidad de las instructions seguirá siendo pobre en runtime porque el LLM no tiene las herramientas específicas para mencionar.

---

### D3. ¿Conoce el architect los canvases existentes?

**Evidencia:** `scanCanvasResources` no incluye ninguna lectura de la tabla `canvases`. El architect diseña desde cero siempre.

**Hechos:**
- Cero reutilización.
- El architect no sabe si ya existe un canvas "Comparativa Holded Q1" con 5 nodos validados funcionando.
- Si el usuario pide la misma tarea dos veces, el architect genera dos canvases distintos (potencialmente con calidad distinta).

**Razonamiento:**

Esto es **un desperdicio enorme**. Escenario: el usuario pide "comparativa Holded" por primera vez, el architect lo genera con algunos errores, el usuario lo aprueba y lo ejecuta (arreglándolo manualmente o con auto-repair), funciona. Una semana después el usuario pide lo mismo → todo el pipeline async se reactiva desde cero.

Opciones para Phase 133 (en orden de dificultad):

1. **Lookup simple por similarity:** Antes del pipeline async, buscar en `canvases` por nombre/descripción similar al goal del usuario. Si hay un match con >70% similarity, ofrecer ejecutarlo en vez de generar uno nuevo. Requiere embedding del goal + embeddings de canvases existentes. Medio complicado.

2. **Lookup por `intent_jobs` histórico:** Buscar si el mismo `user_id` ha ejecutado con éxito una `tool_args.description` similar. Si sí, reutilizar el `canvas_id`. Más simple, pero depende de que el usuario use las mismas palabras.

3. **Pasar al architect una lista resumida de canvases existentes** como parte del scanCanvasResources. El architect puede entonces razonar "ya existe uno similar, lo adapto" vs "creo uno nuevo". Más invasivo pero empodera al LLM.

Mi recomendación: **opción 3 en Phase 133** (solo lectura, el architect decide), **opción 1 como follow-up** para cuando queramos detección preventiva antes incluso de entrar al pipeline.

---

### D4. ¿Conoce el architect los contratos de los conectores?

**Evidencia:** Búsqueda exhaustiva — no hay ningún lugar en el código donde los contratos declarativos de los conectores (ej: `{accion_final, report_to, ...}` para Gmail) estén expuestos al architect.

**Hechos:**
- Los contratos están **implícitos en el switch del executor** (ver batería anterior P4).
- `scanCanvasResources` solo devuelve `{id, name, type}` por conector. No hay schema de input esperado.
- El architect solo tiene acceso al rules index (que no menciona estos contratos) y a `scanCanvasResources` (que no los expone).

**Razonamiento:**

Este es el gap #2 confirmado. El executor tiene contratos específicos por tipo de conector (Gmail con `accion_final`, Drive con `drive_operation`, HTTP con `body_template`, MCP con `tool_name`...) y el architect es **completamente inconsciente** de ellos.

Solución para Phase 133: crear un **catálogo de contratos por tipo de conector** en un archivo estático (ej: `app/data/knowledge/canvas-connector-contracts.md`) que documente:

```
## Gmail connector
El nodo predecesor DEBE producir un JSON de una de estas 4 formas:

### send_report
{
  "accion_final": "send_report",
  "report_to": "email@destino.com",
  "report_subject": "Título del email",
  "report_template_ref": "ref_code_template",
  "results": [ {...array de resultados...} ]
}

### send_reply
{
  "accion_final": "send_reply",
  "respuesta": {
    "plantilla_ref": "ref_code",
    "saludo": "Hola X",
    "cuerpo": "texto del email",
    "email_destino": "..."
  },
  "messageId": "id del email original"
}

### forward
...

### mark_read
...
```

Y que el ARCHITECT_PROMPT inyecte este catálogo (como hace con rules index hoy). Entonces el architect sabe qué shape esperar del predecesor de un nodo Gmail connector.

Es el cambio de mayor ROI identificado hasta ahora. Ataca directamente la causa raíz del Caso 1 del audit.

---

### D5. ¿Conoce el architect las skills?

**Evidencia:** `scanCanvasResources` devuelve `{id, name, description}` por skill. Eso sí.

**Hechos:**
- El architect **sí ve la lista de skills** disponibles.
- Pero las `description` son textos libres, no estructurados. No indican qué tools expone la skill, ni qué tipo de canvas nodes podrían usarla.
- **NO sabe cómo vincular una skill a un nodo** — el prompt dice "agent con `data.agentId`" pero no menciona `data.skills[]` como campo posible.

**Razonamiento:**

El architect puede leer las skills existentes, pero **no tiene vocabulario para usarlas** en el flow_data. El esquema JSON del output del architect en el prompt solo menciona `agentId` e `instructions` — los `data.skills[]` existen en el schema del canvas pero el architect no sabe que puede declararlos.

Las instructions hand-crafted a veces incluyen skills en `data.skills[]`. Phase 133 debe documentar esto en el prompt del architect: "puedes declarar `data.skills: ['skill-1', 'skill-2']` para enriquecer un nodo agent con skills específicas además de las que tiene el CatPaw base".

---

### D6. `needs_cat_paws` — ¿se materializa?

**Evidencia** ([intent-job-executor.ts:428-448](app/src/lib/services/intent-job-executor.ts#L428-L448)):

```ts
private static async finalizeDesign(...) {
  if (design.needs_cat_paws && design.needs_cat_paws.length > 0) {
    updateIntentJob(job.id, {
      pipeline_phase: 'awaiting_user',
      progressMessage: {
        phase: 'architect',
        goal,
        tasks,
        cat_paws_needed: design.needs_cat_paws,
        cat_paws_resolved: false,
        message: `Necesito crear ${design.needs_cat_paws.length} CatPaws nuevos. Espero tu aprobacion.`,
      },
    });
    await this.notifyUserCatPawApproval(job, design.needs_cat_paws);
    logger.info('intent-job-executor', 'Paused for CatPaw approval', { ... });
    return;
  }
  ...
}
```

**Hechos:**
- Cuando el architect detecta que falta un CatPaw y lo incluye en `needs_cat_paws`, el pipeline **se pausa** en `awaiting_user`.
- El usuario recibe una notificación por Telegram con inline keyboard: `[Crear CatPaws] [Cancelar]`.
- Si el usuario aprueba, hay un endpoint `/api/intent-jobs/[id]/create-catpaws` (no leído en esta auditoría) que crea los CatPaws con el `system_prompt` y `name` propuestos por el architect, y luego transiciona el job a `architect_retry` para que el pipeline se reanude con los CatPaws ya creados disponibles.
- Si el usuario cancela, el job se marca `cancelled`.
- **NO hay creación automática** — siempre requiere aprobación explícita del usuario.

**Razonamiento:**

La ceremonia de aprobación es la **correcta** — crear CatPaws es una operación con efecto lateral que debe ser confirmada. Pero:

- El usuario solo ve nombre + reason. No ve el `system_prompt` completo que va a generar. Si el architect propone un CatPaw con un prompt malo, el usuario lo aprueba a ciegas.
- No hay preview de qué canvas se va a generar después con los nuevos CatPaws. El usuario aprueba la creación de los CatPaws sin saber si el canvas resultante va a servir.

Para Phase 133, una mejora menor: en `notifyUserCatPawApproval`, incluir los primeros 200 chars del `system_prompt` propuesto por cada CatPaw. Mejor aún: ofrecer al usuario ver el canvas preliminar (con los CatPaws placeholders) antes de confirmar.

No es bloqueante del caso Holded Q1 (ahí no hay `needs_cat_paws`, los CatPaws necesarios ya existen). Es follow-up de Phase 134.

---

## BLOQUE E — Calidad del output del architect

### E1. Instructions en canvases que funcionaron

**Evidencia** (query real al contenedor Docker, canvases existentes):

Post Phase 132, no tengo un ejemplo claro de un canvas generado por el architect que llegara a `accept` y se ejecutara con éxito end-to-end. El único caso real que llegó a executar fue el Holded Q1 pre-132 (generado por architect Phase 130/131, con n5 mal mapeado a `agent`), y falló en producción por email vacío.

Los canvases con instructions ricas (250-750 chars, estructura PASO 1/PASO 2) son todos **hand-crafted**, no generados por architect.

**Hechos:**
- Sample de instructions hand-crafted (Test Inbound Fase 5):
  - `lector`: 696 chars, estructura PASO 1→4, menciona `gmail_search_emails` 2 veces, describe filtro de threadIds.
  - `clasificador`: 730 chars, explicita "Recibes UN solo email... Devuelve el MISMO objeto con TODOS sus campos originales intactos (messageId, threadId, from, subject, body, date, ...)".
- Sample de instructions architect (Holded Q1):
  - `n3`: 156 chars, "Analizar y comparar los datos de facturación de Q1 2025 y Q1 2026 recibidos, generando un resumen contable a nivel ejecutivo."
  - Sin estructura, sin tools mencionados, sin nombres de campos esperados.

**Razonamiento:**

Confirmado con evidencia: el architect produce instrucciones **3-7x más cortas** y **sin estructura concreta**. Las buenas instrucciones tienen:

1. Estructura explícita (PASO 1, PASO 2, ...).
2. Nombres de tools exactos (`gmail_search_emails`).
3. Shape del input/output con nombres de campo concretos (`messageId, threadId, from, ...`).
4. Cláusula de preservación explícita ("MISMO objeto con TODOS los campos").

El architect actual no sabe hacer nada de esto porque el prompt no lo enseña con ejemplos. Phase 133 debe incluir ejemplos few-shot en el prompt del architect, al menos 2-3 contrastados por rol funcional (extractor, transformer, synthesizer, renderer, emitter).

---

### E2. ¿Menciona el architect tools por nombre?

**Evidencia:** Cero menciones de tools en las instructions generadas por el architect. Comprobado en el canvas Holded Q1 original.

**Hechos:**
- El architect no tiene acceso al catálogo de tools por CatPaw (ver D1).
- Las instructions que genera son abstractas ("Extraer los datos") sin mencionar tools concretas (`holded_list_invoices`).
- El CatPaw al recibir la instruction tiene que inferir qué tools usar. A veces acierta, a veces no.

**Razonamiento:**

Esto es consecuencia directa de D1-D2. La solución es la misma: extender `scanCanvasResources` para incluir el flattened `tools_available` por CatPaw. Entonces el prompt del architect puede decir "las instructions DEBEN mencionar explícitamente qué tool(s) del CatPaw hay que usar" y el LLM tiene el vocabulario para hacerlo.

---

### E3. Nodos `connector` en canvases del architect

**Evidencia:** Revisando los canvases persistidos:

- Canvas Holded Q1 (archivo `6d8c9924-...`): n5 es `type:'agent'`, no `connector`. El architect eligió el patrón wrong.
- En los canvases hand-crafted (Inbound v4.0, Revisión Diaria), los nodos `connector` son comunes pero siempre creados por humanos.
- No tengo un canvas del architect post-Phase 132 que tenga un nodo `connector` bien formado.

**Hechos:**
- **No hay evidencia de que el architect haya generado correctamente un par `predecessor → connector`** con el contrato `{accion_final, ...}` en ningún canvas real.
- En la última ejecución (23:18 UTC) el qa_report mencionaba `n5` como "nodo Gmail emitter" flaggeado por R10. Sin flow_data persistido (exhaustion no lo guarda — P13 batería anterior) no puedo confirmar si era connector o agent.

**Razonamiento:**

Razonablemente el architect post-hotfix-A sí está usando `type:'connector'` para n5 (porque el prompt dice "'connector' con data.connectorId para email/drive/http/mcp"), pero sin los contratos D4 no está produciendo el JSON correcto en el predecessor n4. El flujo actual es:
- `n4` (renderer) produce un string con el HTML maquetado.
- `n5` (connector Gmail) recibe ese string, hace `JSON.parse` → no es JSON → cae al path legacy → `parseOutputToEmailPayload` (regex frágil) → email vacío o mal direccionado.

Este es el mecanismo exacto del fallo. Phase 133 debe cerrarlo enseñando al architect que n4 debe producir:

```json
{
  "accion_final": "send_report",
  "report_to": "antonio@educa360.com,fen@educa360.com",
  "report_subject": "Comparativa Q1 2025 vs Q1 2026",
  "report_template_ref": "corporativo",
  "results": [ ...datos comparativos... ]
}
```

Y que las instructions de n4 digan literalmente: "Devuelve un JSON con la forma `{accion_final, report_to, ...}` donde `results` es el array producido por n3 enriquecido con los campos de comparativa".

---

### E4. ¿Genera el architect nodos `condition` por iniciativa?

**Evidencia:** El canvas Holded Q1 original no tiene nodos condition. Los canvases que sí los tienen son:
- Los que el post-procesador `insertSideEffectGuards` añade (guards antes de side-effect nodes).
- Los hand-crafted, que tienen condiciones de negocio reales ("si el email es spam, marcar leído; si no, responder").

En `runFullPipeline` tras el QA loop, siempre se llama `insertSideEffectGuards` sobre el flow_data del architect. Los guards son añadidos **después** del architect, no por él.

**Hechos:**
- El architect raramente genera condition nodes.
- Los guards los inserta el post-procesador automáticamente.
- Los conditions de negocio real (no guards, sino bifurcaciones lógicas) son casi inexistentes en canvases generados.

**Razonamiento:**

El architect piensa en flujos lineales (extractor → transformer → emitter) pero los canvases reales de negocio son bifurcados (diferentes acciones según el tipo de input). Esto limita el poder expresivo de lo que puede generar.

Razón: el prompt del architect dice "`condition` para bifurcaciones logicas" sin ejemplos de cuándo usarlas. El LLM, en duda, se va a lo simple (lineal).

Para Phase 133: incluir en el prompt un ejemplo concreto con bifurcación: "Si la tarea tiene diferentes acciones según el tipo de input (ej: email de spam vs lead real), usa un `condition` tras el clasificador". Y un ejemplo contrastado de "lineal" vs "bifurcado" para que el LLM aprenda el patrón.

---

### E5. ¿Usa iterator correctamente?

**Evidencia:** Revisando los canvases del architect: ninguno tiene un iterator. Los canvases hand-crafted tienen iterators para procesar arrays (emails individuales, invoices uno a uno).

**Hechos:**
- R02 y R14 del rules index mencionan iterator como obligatorio para arrays >1 item con tool-calling.
- El architect **teoréticamente sabe esto** (está en el rules index que recibe inline).
- En la práctica **no lo aplica**. Los canvases que genera son lineales sin iteradores, incluso cuando hay arrays grandes (ej: lista de invoices Q1).

**Razonamiento:**

Este es el **gap entre conocer una regla y saber aplicarla**. El rules index le dice al LLM "usa iterator cuando >1 item", pero no le muestra cómo se construye un iterator en el canvas (qué edges, qué iteratorEndId, qué es el cuerpo del bucle).

El prompt del architect tiene una línea: `'iterator' para arrays >1 item con tool-calling (R14, R02)`. Eso es todo. Ningún ejemplo de flow_data con un iterator. Ningún template de cómo conectarlo.

Phase 133 debe incluir **el patrón completo del iterator** en el prompt, con flow_data concreto:

```json
{
  "nodes": [
    { "id": "extractor", "type": "agent", ... },
    { "id": "it1", "type": "iterator", "data": { "iteratorEndId": "it1-end" } },
    { "id": "body", "type": "agent", "data": { "instructions": "Procesa UN item..." } },
    { "id": "it1-end", "type": "iterator_end" },
    { "id": "emitter", "type": "connector", ... }
  ],
  "edges": [
    { "source": "extractor", "target": "it1" },
    { "source": "it1", "target": "body", "sourceHandle": "element" },
    { "source": "body", "target": "it1-end" },
    { "source": "it1-end", "target": "emitter" }
  ]
}
```

Eso lo convierte en un patrón copiable por el LLM.

---

### E6. ¿Consumo de tokens del pipeline completo?

**Evidencia:** Los 4 LLMs del pipeline tienen `max_tokens: 4000` cada uno. No hay analytics persistente del consumo real.

**Estimación gruesa:**
- STRATEGIST_PROMPT (~200 tokens) + user input (~300 tokens) + output (~150 tokens) = ~650 tokens por call.
- DECOMPOSER_PROMPT (~300 tokens) + goal + original (~400 tokens) + output (~600 tokens) = ~1300 tokens.
- ARCHITECT_PROMPT (~1200 tokens base + ~2000 tokens de rules index + ~500 tokens de resources + ~300 tokens de tasks) + output (~2000 tokens para un flow_data con 5-6 nodes) = ~6000 tokens.
- CANVAS_QA_PROMPT (~800 tokens base + ~2000 rules + ~2000 canvas_proposal) + output (~800 tokens) = ~5600 tokens.

**Total por iteración del QA loop:** ~6000 (architect) + ~5600 (QA) = ~11600 tokens.
**Con 2 iteraciones:** ~23200 tokens.
**Total del pipeline con strategist + decomposer + 2 iter QA:** ~25150 tokens.

**Hechos:**
- Estimado **~25K tokens por pipeline** (1 ejecución del QA loop con 2 iteraciones).
- Modelo `gemini-main` (Gemini 2.5 Pro): ~$1.25/M input + $5/M output (aprox). Llamémoslo ~$0.03 por pipeline complejo.
- No hay persistencia de esto. No veo datos reales en `usage_events` para correlacionar.
- Comparado con una conversación normal de CatBot (~2K tokens), el pipeline async es ~12x más caro.

**Razonamiento:**

El coste unitario es bajo ($0.03) pero el **crecimiento es lineal en peticiones**. Si el sistema llega a 1000 pipelines complejos/día, son $30/día = $900/mes solo en pipeline async. Manejable, pero no trivial.

Más importante: **no tenemos observabilidad real del consumo**. Phase 133 debe añadir persistencia de tokens consumidos por fase del pipeline (como columnas adicionales en `intent_jobs`) para poder responder preguntas como:
- ¿Qué pipelines consumieron >40K tokens? (señal de iteraciones múltiples del QA loop)
- ¿Cuál es el token consumption medio vs p95?
- ¿Los casos complex simple tienen coste similar?

La tabla `usage_events` ya existe (se usa para canvas execution logging). Extender su uso al pipeline async es directo.

---

## BLOQUE F — QA loop y patrones de fallo

### F1. ¿Qué recibe el architect en iter 1 como feedback?

**Evidencia** ([intent-job-executor.ts:285-300](app/src/lib/services/intent-job-executor.ts#L285-L300)):

```ts
for (let iter = 0; iter < this.MAX_QA_ITERATIONS; iter++) {
  const architectInputObj: Record<string, unknown> = {
    goal,
    tasks,
    resources,
  };
  if (previousQaReport) architectInputObj.qa_report = previousQaReport;
  if (previousDesign) architectInputObj.previous_design = previousDesign;

  this.notifyProgress(job, `Architect iteracion ${iter}...`, true);
  const architectRaw = await this.callLLM(
    architectSystem,
    JSON.stringify(architectInputObj),
  );
  ...
```

**Hechos:**
En iter 1 el architect recibe:
- `goal` (del strategist)
- `tasks` (del decomposer)
- `resources` (de scanCanvasResources)
- `qa_report` (el del iter 0 completo: quality_score, issues, data_contract_analysis, recommendation)
- `previous_design` (el flow_data que generó en iter 0)

Es decir: **el contexto completo del intento anterior más el feedback del reviewer**.

**Razonamiento:**

El feedback es completo técnicamente, pero hay un problema sutil: **el architect recibe el qa_report como JSON raw, sin explicación de cómo actuar sobre él**. El prompt del architect solo dice:

> "Si recibes feedback de un QA review previo (qa_report), corrige los issues en tu nuevo diseno."

"Corrige los issues" es vago. El LLM tiene que deducir:
1. Cómo priorizar los issues (blocker primero, luego major, ignore minor?).
2. Qué hacer con un `fix_hint` que es contraintuitivo (ej: "añade 'html_body' al OUTPUT de n5 junto con 'status'" cuando n5 es un emitter y no tiene output útil).
3. Si puede ignorar issues que considere incorrectos.

Para Phase 133 el prompt del architect en iter >0 debería incluir guidance explícita:
- "Prioriza issues `blocker` sobre `major` sobre `minor`."
- "Si un `fix_hint` es contradictorio con el rol del nodo (ej: preservar campos en un emitter terminal), puedes documentar en tu respuesta por qué no lo aplicas."
- "No repitas el mismo diseño si ya fue rechazado — cambia al menos las instructions del nodo más problemático."

Un prompt que habilita al LLM a **empujar de vuelta** contra issues incorrectos sería más útil que uno que le pide obediencia ciega.

---

### F2. ¿El architect corrige efectivamente entre iter 0 e iter 1?

**Evidencia:** El caso Holded Q1 real (23:18 UTC) muestra:
- iter 0: score 70, recommendation revise
- iter 1: score 75, recommendation revise

El score subió 5 puntos. El recommendation no cambió. Exhaustion.

**Hechos:**
- Sin persistencia del `previousDesign` no puedo comparar flow_data iter 0 vs iter 1 literal.
- El score subió → el architect sí hizo cambios, pero no bastaron.
- Los issues del qa_report de iter 1 (persistidos en knowledge_gap) seguían mencionando R10 en n3, n4, n5 — los mismos tres issues del iter 0 (presumiblemente).
- No hay tracking de "¿qué cambió entre iter 0 e iter 1?".

**Razonamiento:**

El architect sí está intentando corregir (el score subió), pero no puede **resolver issues que son contradicciones del sistema** (R10 aplicado a emitter). Hace cambios cosméticos → el reviewer flaggea los mismos issues → exhaustion.

La conclusión es: **el QA loop no converge cuando los issues son contradicciones de las reglas, no del diseño**. La única forma de desbloquearlo es:
1. Arreglar las reglas (R10 con scope por rol).
2. Permitir al architect rechazar issues incorrectos.
3. Reducir el umbral de accept (permitir accept con majors si no hay blockers).

Phase 133 debe hacer los tres. El rediseño del CANVAS_QA_PROMPT para calibrar mejor severity y threshold es tan importante como el del ARCHITECT_PROMPT.

---

### F3. ¿Patrones en qué issues se corrigen vs no?

**Evidencia:** Sin persistencia de múltiples qa_reports (solo el último) no hay datos para análisis.

**Hechos:**
- Hay 1 solo knowledge_gap hoy.
- No puedo determinar patrones empíricos.
- Mi hipótesis (sin datos):
  - Issues de data_contract (R01, R13) probablemente se corrigen cuando son superficiales (añadir prefix INPUT:).
  - Issues de R10 en emitters **no se corrigen nunca** (son contradicciones).
  - Issues de anti-patterns (DA01-DA04) probablemente se corrigen porque el architect sí los entiende.
  - Issues de R20 (código vs LLM) **posiblemente no se corrigen** porque el architect no sabe refactorizar de agent a código determinista.

**Razonamiento:**

Este es otro síntoma del gap de observabilidad. Para tener datos empíricos Phase 133 necesita persistir **cada qa_report de cada iteración** (no solo el último) en una tabla nueva `qa_iterations` con FK al intent_job. Con eso podemos hacer consultas tipo:

```sql
SELECT rule_id, severity,
       COUNT(*) as total,
       SUM(CASE WHEN iter_1_fixed THEN 1 ELSE 0 END) as fixed
FROM qa_iterations
WHERE iter_num = 0
GROUP BY rule_id, severity;
```

Y saber qué issues son "arregables" y cuáles no. Esto alimenta la Phase 134 de feedback loop del rules index.

---

### F4. ¿Valida el reviewer que los agentId/connectorId existen?

**Evidencia:** El `CANVAS_QA_PROMPT` recibe `resources` como parte del input (`JSON.stringify({ canvas_proposal: design, tasks, resources })`). Así que el reviewer **sí tiene acceso al inventario**.

Pero el prompt actual no pide explícitamente validar existencia:

```
CHECKLIST OBLIGATORIO:
1. Data contracts (R01, R10, R13): ...
2. Arrays & loops (R02, R14): ...
3. Responsabilidades (R05, R06, R20, R23): ...
4. Side effects: ...
5. Anti-patterns DA01-DA04.
```

Ningún bullet dice "verifica que los agentId referenciados existen en resources.catPaws".

**Hechos:**
- El reviewer recibe los resources pero el prompt no pide validación de existencia.
- El LLM reviewer puede decidir validar por iniciativa, pero no hay garantía.
- Si el architect inventa un `agentId="abc123"` que no existe, el reviewer probablemente **no lo cazaría** en las iteraciones normales.
- En runtime, el executor busca el agentId y si no existe cae al path fallback de custom agent (línea 506 de canvas-executor), que es un LLM sin tool-calling → comportamiento sorpresa.

**Razonamiento:**

Esto es un **gap de validación silencioso**. El architect puede alucinar IDs, el reviewer puede aprobarlo, y el canvas "funciona" ejecutándose pero comportándose diferente al esperado.

Fix trivial para Phase 133: añadir un bullet al CHECKLIST del reviewer:

> "6. Validación de referencias: cada `data.agentId` debe existir en `resources.catPaws`. Cada `data.connectorId` debe existir en `resources.connectors`. Cada `data.catbrainId` debe existir en `resources.catBrains`. Si no existen, reportar issue `blocker` R_REF (referencia inválida)."

Con R_REF siendo una nueva regla que añadimos al rules index.

Mejor aún (determinístico, no LLM): añadir esta validación **en código** después del parseo del architect output, antes de llamar al QA reviewer. Un `validateReferences(design, resources)` que devuelve issues antes de gastar tokens en el reviewer. Más rápido y confiable.

---

### F5. ¿Sabe el reviewer evaluar iterator?

**Evidencia:** El CANVAS_QA_PROMPT checklist menciona "arrays >1 item siendo pasados a nodos con tool-calling fuera de un iterator" (R02, R14), pero no tiene guidance específica para validar el contenido del body del iterator.

**Hechos:**
- El prompt asume que si hay un iterator, su presencia es suficiente. No valida si el body del iterator está correctamente diseñado.
- En el rules index, R02 y R14 son sobre **usar** iterator, no sobre **cómo diseñar el body**.
- No hay regla que diga "el nodo body del iterator recibe UN solo item, no todo el array" — esa información está implícita pero no enseñada.

**Razonamiento:**

El iterator es relativamente opaco para el reviewer. Si el architect pone un agent dentro del iterator que espera un array (en vez de UN item), el reviewer no lo caza. Luego el runtime falla porque el body recibe un solo item y el agent no sabe procesarlo.

Phase 133 debería añadir al rules index:
- `R14b: Body del iterator recibe UN solo item (no array). Instructions empiezan con "Recibes UN solo X..."`
- `R14c: Body del iterator preserva el contrato por item (si entró {id, name}, sale {id, name, ...})`

Y en el CHECKLIST del reviewer: "si hay un iterator, verifica que el body empiece con 'Recibes UN solo X' o equivalente".

---

### F6. ¿Canvases que pasaron QA pero fallaron en runtime?

**Evidencia:** Sin histórico de múltiples ejecuciones no puedo dar un número.

**Hechos:**
- **Probablemente sí**, porque el QA es prompt-based y tiene falsos negativos.
- Los fallos más comunes en runtime son:
  - Campos que el executor espera (ej: `accion_final`) que no están en el JSON del predecessor.
  - Tool names que el agent no tiene disponible (ej: mencionar `holded_list_invoices` cuando el CatPaw no tiene Holded MCP vinculado).
  - Connector config mal (ej: token Gmail expirado, el QA no lo detecta porque no ejecuta).
- No hay una categoría "QA accepted but runtime failed" en la telemetría actual.

**Razonamiento:**

Este es un **gap sistemático de cobertura**. El QA es estático (sobre el diseño) y el runtime es dinámico (sobre la ejecución). Hay clases enteras de fallos que solo se detectan en runtime:
- Credenciales expiradas.
- Tool names inexistentes.
- Contratos implícitos del executor.
- Network issues.

El QA no los detectará nunca porque no ejecuta. Phase 133 debería añadir una capa de **validación runtime-aware** pero sin ejecutar: verificar estáticamente que:
- Los agentId existan y estén activos.
- Los connectorId existan y tengan test_status='ok'.
- Si el architect menciona un tool en las instructions, ese tool esté en el catálogo del CatPaw correspondiente.

Esto es una tercera capa (validador) entre architect y QA. Podría vivir en código (no LLM). Determinístico, rápido, no consume tokens.

---

## BLOQUE G — finalizeDesign y la propuesta al usuario

### G1. ¿Qué hace `finalizeDesign`?

**Evidencia** ([intent-job-executor.ts:427-500](app/src/lib/services/intent-job-executor.ts#L427-L500)):

Los pasos en orden:

1. **Check `needs_cat_paws`:** si existen, pausa en `awaiting_user`, notifica al usuario, retorna.
2. **Validación estructural** (`validateFlowData`): valida que los tipos de nodo sean válidos y que los edges apunten a nodos existentes. Si falla, marca job como failed.
3. **Construcción del ctxResolver** (hotfix-A): lookup cacheado de connector types por connectorId.
4. **`insertSideEffectGuards(flow_data, ctxResolver)`:** post-procesador que inserta `condition + reporter` antes de cada side-effect node.
5. **INSERT en tabla `canvases`** con el flow_data modificado (con guards).
6. **UPDATE intent_jobs:** `canvas_id = canvasId, pipeline_phase = 'awaiting_approval'`, progress_message con resumen.
7. **`sendProposal`:** notifica al usuario (web + Telegram) con el resumen del canvas + botones aprobar/cancelar.

**Hechos:**
- Hay **una transformación significativa** del flow_data entre lo que produce el architect y lo que se guarda: los guards se insertan. El architect no "ve" los guards en su output, los añade el post-procesador.
- La validación estructural ocurre **antes** de insertar guards (correcto: valida los nodes del architect primero).
- Después de insertar guards, **no hay re-validación**. Si los guards añaden nodes con edges a nodos que no existen (bug del post-procesador), no se detectaría aquí.
- El canvas se inserta en DB como un row normal, indistinguible de un canvas creado manualmente.

**Razonamiento:**

La pipeline tiene sentido pero hay un subtle issue: **los guards no se validan**. Si `insertSideEffectGuards` tiene un bug y produce un flow_data con edges inválidos, el canvas se guarda y el executor falla en runtime. Debería haber un `validateFlowData(design.flow_data)` **después** de `insertSideEffectGuards` también.

Además, el `sendProposal` no muestra los guards al usuario. El usuario ve "5 nodes planeados" pero en realidad el canvas tiene 5 funcional + 4 guards + 4 reporter = 13 nodes. Esta discrepancia es invisible hasta que el usuario abre el canvas en el editor y se sorprende.

Phase 133: el sendProposal debería mencionar "además, he añadido 4 puntos de control automáticos antes de cada operación de envío/escritura". Transparencia mejora confianza.

---

### G2. ¿Qué ve el usuario en Telegram en la propuesta?

**Evidencia** ([intent-job-executor.ts:646-683](app/src/lib/services/intent-job-executor.ts#L646-L683) — sendProposal):

```ts
const taskList = Array.isArray(tasks)
  ? (tasks as Array<{ name?: string }>).map(t => `• ${t.name ?? '?'}`).join('\n')
  : '';
const body = `**Objetivo:** ${String(goal)}\n\n**Plan:**\n${taskList}\n\n¿Ejecutar este CatFlow?`;

try {
  createNotification({ ... });
} catch (err) { ... }

if (job.channel === 'telegram' && job.channel_ref) {
  const chatId = parseInt(job.channel_ref, 10);
  if (!Number.isNaN(chatId)) {
    try {
      const { telegramBotService } = await import('./telegram-bot');
      await telegramBotService.sendMessageWithInlineKeyboard(chatId, body, [[
        { text: '✅ Ejecutar', callback_data: `pipeline:${job.id}:approve` },
        { text: '❌ Cancelar', callback_data: `pipeline:${job.id}:reject` },
      ]]);
    } catch (err) { ... }
  }
}
```

**Hechos:**
- El mensaje es:
  ```
  **Objetivo:** Extraer facturación Q1 2025 y Q1 2026...
  
  **Plan:**
  • Extraer Q1 2025
  • Extraer Q1 2026
  • Comparar
  • Maquetar
  • Enviar email
  
  ¿Ejecutar este CatFlow?
  ```
- Con 2 botones inline: [✅ Ejecutar] [❌ Cancelar].
- **NO muestra:**
  - Los CatPaws que se van a usar (solo los nombres de las tasks).
  - El número total de nodos.
  - Si hay guards auto-insertados.
  - El canvas como diagrama.
  - Estimación de duración.
  - Costo estimado.

**Razonamiento:**

La propuesta es **minimalista al punto de ser vaga**. El usuario aprueba a ciegas. En particular:

- Si el pipeline tiene 5 tasks pero solo 2 tiene CatPaw adecuado, los otros 3 son custom agent (path B del executor) — el usuario no lo sabe. Calidad muy variable.
- Si las tasks son genéricas ("Comparar") el usuario no puede evaluar si realmente va a hacer lo que pidió.

Para Phase 133 (mejora del sendProposal):

```
**Objetivo:** Extraer facturación Q1 2025 y Q1 2026 de Holded, comparar y enviar email

**Plan (5 tareas):**
• 📥 Extraer Q1 2025 — usa CatPaw Filtro Holded
• 📥 Extraer Q1 2026 — usa CatPaw Filtro Holded
• 🧮 Comparar — usa CatPaw Synthesizer (nuevo)
• 🎨 Maquetar con template corporativo — usa CatPaw Renderer Email
• 📧 Enviar a antonio@, fen@ — vía connector Gmail

⏱ Estimado: ~2 minutos, ~15K tokens
🛡 4 puntos de control automáticos antes de envío

¿Ejecutar?
```

Eso da al usuario información suficiente para decidir con confianza.

---

### G3. ¿Puede el usuario pedir modificaciones antes de aprobar?

**Evidencia:** Los callback_data posibles son solo `pipeline:{id}:approve` y `pipeline:{id}:reject`. No hay un botón "refinar".

**Hechos:**
- Solo 2 opciones: aprobar o cancelar.
- Si el usuario ve que el plan es incompleto, la única forma es cancelar y reenviar con una petición más detallada.
- No hay forma de decir "lo que tienes está bien pero añade un paso X" sin empezar de cero.

**Razonamiento:**

Esto es una limitación severa pero **lógica para Phase 132**: añadir capacidad de refinamiento implicaría diálogo multi-turn con el architect, lo cual complica la UX y el state machine (pause → user types feedback → resume architect with feedback).

Para Phase 133 no es prioritario. Pero en Phase 134 (UX del pipeline) sería valioso añadir un tercer botón **[✏️ Refinar]** que:
1. Manda un mensaje al usuario: "¿qué quieres cambiar?"
2. Al recibir respuesta, crea un `architect_retry` con un nuevo campo `user_feedback` en el input.
3. El architect reconsidera con ese feedback.

Implica MAX_QA_ITERATIONS_WITH_FEEDBACK = 3 o similar. No trivial pero tampoco imposible.

---

### G4. ¿Tasa de aprobación? Patrones de cancelados?

**Evidencia:** `intent_jobs` tiene `status` que incluye `cancelled` pero no hay analytics hechos sobre esto.

**Hechos:**
- No hay dashboards ni queries establecidas para medir tasa de aprobación.
- Para calcular: `SELECT status, COUNT(*) FROM intent_jobs WHERE pipeline_phase IN ('awaiting_approval', 'cancelled', 'running', 'completed') GROUP BY status`.
- No lo consulto en este momento porque el sistema ha tenido pocas ejecuciones reales (esto es un sistema en desarrollo).

**Razonamiento:**

Phase 133 debería añadir a `list_my_jobs` y `list_intent_jobs` (tools de CatBot) la capacidad de reportar estadísticas: "de tus 10 últimos jobs, 6 fueron aprobados, 2 cancelados, 2 fallados". Esto cierra el loop de observabilidad para el usuario y para el admin.

---

### G5. ¿Qué input recibe el nodo START cuando el usuario aprueba?

**Evidencia** ([canvas-executor.ts:448-459](app/src/lib/services/canvas-executor.ts#L448-L459)):

```ts
case 'start': {
  const startCanvas = db.prepare('SELECT external_input FROM canvases WHERE id = ?').get(canvasId) as
    | { external_input: string | null }
    | undefined;
  if (startCanvas?.external_input) {
    db.prepare('UPDATE canvases SET external_input = NULL WHERE id = ?').run(canvasId);
    return { output: startCanvas.external_input };
  }
  return { output: (data.initialInput as string) || '' };
}
```

**Hechos:**
- El nodo START lee `canvases.external_input` (si está presente) o `data.initialInput` (del flow_data).
- Para canvases creados por el pipeline async, **no se seta ninguno de los dos**. `finalizeDesign` no escribe `external_input` ni `initialInput`. El start recibe string vacío.
- Cuando el canvas se aprueba y ejecuta vía `/api/canvas/{id}/execute`, el first node (después del start) recibe `predecessorOutput = ''`.
- El `goal` del strategist y el `original_request` del usuario **NO se propagan** al canvas ejecutable. El canvas "sabe" cómo debe comportarse solo por las `instructions` que el architect puso en cada nodo.

**Razonamiento:**

Este es **un gap semántico importante**. El goal refinado por el strategist es el "brief" del canvas, pero no se transfiere al runtime. Si el architect puso instrucciones que asumen contexto implícito (ej: "usar el periodo que pidió el usuario"), el runtime no tiene ese contexto.

Para el caso Holded Q1 específico: el goal era "Q1 2025 vs Q1 2026" pero ese "Q1 2025" no vive en ningún nodo del canvas — el architect lo hardcodeó en las instructions de n1 ("Extraer Q1 2025") y n2 ("Extraer Q1 2026"). Si el architect fallara en mapear correctamente los periodos, el canvas ejecutaría "Q4 2025" y "Q1 2026" (o cualquier cosa) sin que nadie lo detecte.

Solución para Phase 133: **pasar el `original_request` o el `goal` como `initialInput` del nodo START**. Así el primer nodo del canvas tiene el contexto original disponible para validar que sus instrucciones hardcodeadas son correctas.

Es un cambio de 2 líneas en `finalizeDesign`:

```ts
db.prepare(`
  INSERT INTO canvases (id, name, description, mode, status, flow_data, external_input)
  VALUES (?, ?, ?, 'mixed', 'idle', ?, ?)
`).run(canvasId, design.name, design.description, JSON.stringify(design.flow_data), String(goal));
```

Y el nodo START ya consume `external_input` automáticamente. Los downstream nodes reciben el goal como `predecessorOutput` del start.

---

## BLOQUE H — La ejecución nodo a nodo

### H1. ¿String o objeto entre nodos?

**Evidencia** (`getPredecessorOutput` — canvas-executor.ts):

```ts
function getPredecessorOutput(nodeId, edges, nodeStates): string {
  // ...
  return nodeStates[source]?.output || '';
}
```

**Hechos:**
- **Siempre string.** `nodeStates[nodeId].output` es siempre string.
- Si un nodo agent devuelve JSON, se guarda como `JSON.stringify(result)` y se pasa como string al siguiente.
- El siguiente nodo debe hacer `JSON.parse(predecessorOutput)` explícitamente si quiere el objeto.
- **`mergePreserveFields`** (ejecutado en canvas-executor línea ~2010) intenta mergear el input del predecesor con el output del nodo, para mantener R10. Parsea ambos como JSON, hace `{...input, ...output}`, y re-stringifica. Si alguno no es JSON válido, devuelve el nodeOutput sin cambios.

**Razonamiento:**

Pasar strings es la única opción porque `canvas_runs.node_states` se persiste como JSON en SQLite, y JSON no puede contener funciones o referencias circulares. String es la forma canónica.

Pero esto significa que cada nodo pagará un `JSON.parse + JSON.stringify` cycle, con pérdida potencial si el parser es flexible (ej: números grandes, dates, etc.). Para most cases es OK.

La implementación de `mergePreserveFields` es interesante: **intenta arreglar R10 automáticamente** fusionando el input con el output del nodo. Esto significa que R10 es parcialmente redundante porque el executor ya lo enforza a posteriori. El architect no necesita cuidarlo tan estrictamente... **excepto que el reviewer R10 flaggea la declaración en instructions, no el comportamiento runtime**. El reviewer ignora que existe `mergePreserveFields`.

Phase 133 debería documentar este merge en el rules index: "R10 se enforce automáticamente en runtime via mergePreserveFields. Las instructions del architect no necesitan garantizarlo si el contrato de campos está declarado. R10 en el reviewer es solo para nodos donde el merge no aplica (emitters, renderers)". Esto resuelve directamente el falso positivo R10.

---

### H2. ¿Qué pasa si un agent produce non-JSON cuando se espera JSON?

**Evidencia** (canvas-executor no tiene un sanitizer explícito para outputs non-JSON, solo el `parseJSON` defensivo en `intent-job-executor` para los prompts del pipeline).

**Hechos:**
- El executor pasa el output del agent tal cual (como string) al siguiente nodo.
- Si el output tiene markdown fences (```json...```) el siguiente nodo las recibe.
- Si el siguiente nodo es un agent, probablemente funciona (los LLMs toleran markdown).
- Si el siguiente nodo es un connector que hace `JSON.parse` estricto, falla.
- **`mergePreserveFields` intenta parsear** con try/catch — si falla, deja el output tal cual.

**Razonamiento:**

Esto es un modo de fallo real. Los LLMs a veces devuelven `"```json\n{...}\n```"` en vez de `"{...}"`. Si el siguiente nodo es un connector Gmail, el `JSON.parse` explícito falla y cae al path legacy.

Fix para Phase 133: añadir una normalización del output de nodos agent en el executor:

```ts
// After dispatching agent
if (node.type === 'agent') {
  cleanedOutput = stripMarkdownFences(cleanedOutput);
}

function stripMarkdownFences(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}
```

Esto convierte a idempotente el output de los agents respecto a markdown. Trivial y elimina una clase de fallos.

---

### H3. ¿Qué pasa si el condition LLM responde algo distinto de yes/no?

**Evidencia** ([canvas-executor.ts:1392](app/src/lib/services/canvas-executor.ts#L1392)):

```ts
case 'condition': {
  const conditionText = (data.condition as string) || 'La entrada es válida';
  const model = (data.model as string) || await resolveAlias('canvas-agent');
  const systemPrompt = `Eres un evaluador de condiciones. Responde SOLO con 'yes' o 'no'.`;
  const userContent = `Condición: ${conditionText}\n\nContenido a evaluar:\n${predecessorOutput}`;
  const result = await callLLM(model, systemPrompt, userContent);
  const answer = result.output.trim().toLowerCase().startsWith('yes') ? 'yes' : 'no';
  ...
  return { ...result, output: answer };
}
```

**Hechos:**
- El parser es `trim().toLowerCase().startsWith('yes')`.
- Si el LLM responde:
  - `"yes"` → yes ✅
  - `"YES, ..."` → yes ✅
  - `"Yes, porque el input contiene..."` → yes ✅
  - `"Sí"` → **no** (no empieza con "yes"!) ❌
  - `"Affirmative"` → no ❌
  - `"no"` → no ✅
  - `"Cannot determine"` → no (default) ✅
  - `"Absolutely, this is valid"` → no (empieza con "absolutely", no "yes") ❌

**Razonamiento:**

**Esto es un bug sutil.** El prompt del condition guard está en español ("El input tiene contenido no vacio..."), pero el parser espera "yes" en inglés. Si el LLM responde en español ("Sí"), el parser lo convierte a "no" → guard falla → reporter se activa → ejecución se detiene.

Este es probablemente el mecanismo por el que algunos canvases fallan en runtime silenciosamente. El LLM interpreta la condition y responde en español (porque el prompt del condition está en español), y el parser lo rechaza.

Fix para Phase 133: hacer el parser multilenguaje:

```ts
const out = result.output.trim().toLowerCase();
const answer = (out.startsWith('yes') || out.startsWith('sí') || out.startsWith('si ') || out === 'si' || out.startsWith('true') || out.startsWith('affirmat')) ? 'yes' : 'no';
```

O forzar el systemPrompt a ser en inglés: `"Reply ONLY with 'yes' or 'no'."`. Más robusto porque aísla al parser de la variabilidad del LLM.

---

### H4. ¿Merge con entradas parciales?

**Evidencia** ([canvas-executor.ts:1355](app/src/lib/services/canvas-executor.ts#L1355) — merge case):

```ts
case 'merge': {
  const incomingEdges = edges.filter(e => e.target === node.id);
  const allInputs = incomingEdges
    .map((e, i) => {
      const sourceOutput = nodeStates[e.source]?.output || '';
      return `## Entrada ${i + 1}\n${sourceOutput}`;
    })
    .join('\n\n---\n\n');
  ...
}
```

**Hechos:**
- El merge **toma lo que hay** en `nodeStates[sourceId]?.output`. Si una fuente tiene output vacío (porque falló o fue skipped), se incluye como "## Entrada N\n" vacío.
- **No espera.** El executor es secuencial; cuando llega al merge, los predecessors ya están en su estado final (completed, failed, skipped).
- Si todos los predecessors fallaron, el merge recibe todos vacíos y genera un output vacío.

**Razonamiento:**

El comportamiento es "best effort" — el merge no falla si una rama falló, simplemente procesa lo que tiene. Esto es razonable para flujos donde algunas ramas son opcionales, pero **peligroso para flujos donde todas las ramas son críticas**.

No hay forma de declarar "este merge requiere todas las entradas". Si el architect espera 3 entradas al merge pero 1 falla, el merge procesa solo las 2 que llegaron. El resultado puede ser parcial sin aviso.

Phase 133 podría añadir un campo `data.merge_mode: 'all' | 'best_effort'` al merge node. Pero no es bloqueante. Follow-up.

---

### H5. ¿Timeouts por nodo?

**Evidencia:** Confirmado por la investigación del subagent:

- Connectors: timeout de 30s default (configurable via connector config), con AbortController.
- Agent / catpaw: **no hay timeout explícito**. Puede colgarse indefinidamente.
- Scheduler listen mode: timeout configurable via `listen_timeout` en node data (default 300s).

**Hechos:**
- Solo connectors tienen timeout HTTP. Los agents no.
- `executeCatPaw` usa `withRetry` para retries en fallos retryables, pero no impone timeout global.
- MAX_TOOL_ROUNDS=12 es un límite de iteraciones, no de tiempo. 12 rondas de tool calls con LLM lentos pueden tomar varios minutos sin abortar.

**Razonamiento:**

Un canvas en ejecución puede colgarse indefinidamente si un nodo agent entra en bucle de tool-calling (tool devuelve datos, LLM llama otro tool, repeat). No hay circuit breaker.

Phase 133 debería añadir timeout por nodo: un `NODE_EXECUTION_TIMEOUT_MS = 120_000` (2 minutos) wrap alrededor del `dispatchNode` call. Si expira, marca el nodo como failed con "node execution timeout after 120s".

---

### H6. ¿Persiste el estado intermedio por nodo?

**Evidencia** (canvas-executor, `saveNodeStates`):

```ts
function saveNodeStates(runId: string, currentNodeId: string | null, nodeStates: NodeStates): void {
  db.prepare('UPDATE canvas_runs SET node_states = ?, current_node_id = ? WHERE id = ?').run(
    JSON.stringify(nodeStates),
    currentNodeId,
    runId
  );
}
```

Llamado después de:
- Marcar nodo running (antes de ejecutar)
- Marcar nodo completed (después)
- Marcar nodo failed (en catch)
- Cada iteración del iterator

**Hechos:**
- **Sí se persiste** después de cada transición de estado en cada nodo.
- `canvas_runs.node_states` contiene un JSON object con entry por nodeId: `{status, output, tokens, started_at, completed_at, error?}`.
- Si un canvas falla en el nodo 4 de 6, los nodos 1-3 están en la DB con sus outputs completos.
- **Observable via:** la UI del canvas editor (muestra el run), `canvas_get_run` tool de CatBot, queries directas a la DB.

**Razonamiento:**

Este es un **fortaleza del sistema**. La persistencia granular permite diagnóstico post-mortem completo: si algo falla, tenemos toda la trayectoria. Es la única cosa del executor que está mejor diseñada que el pipeline async.

El único gap: el `node_states` no se loggea públicamente al usuario. Si el canvas falla, el usuario ve "error en nodo X" pero no ve el output que produjeron los nodos anteriores. Phase 133 podría extender la notificación de error para incluir un snippet (primeros 300 chars) del output del último nodo exitoso.

---

### H7. ¿Límite de rondas de tool-calling?

**Evidencia** ([execute-catpaw.ts:472](app/src/lib/services/execute-catpaw.ts#L472)):

```ts
const MAX_TOOL_ROUNDS = 12;

for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
  // Call LLM with tools
  // If tool_calls detected, execute and loop
  // If no tool_calls, break
}
```

**Hechos:**
- **12 rondas máximo** por ejecución de CatPaw (applies a nodos `agent` que apuntan a un CatPaw, y a nodos `catpaw`).
- Si después de la ronda 12 el LLM sigue devolviendo tool_calls, se fuerza una ronda 13 **sin tools** para que el LLM sintetice una respuesta final con lo que tiene.
- Si en la ronda 13 el LLM devuelve más tool_calls, se ignoran y se toma su contenido textual como respuesta.

**Razonamiento:**

12 rondas es un límite razonable pero puede ser insuficiente para tareas legítimamente complejas. Para el caso Holded Q1:
- n1 (Extractor Q1 2025): probablemente 3-4 rondas (list_invoices, list_payments, aggregate, done).
- n2 (Extractor Q1 2026): igual.
- n3 (Synthesizer): 1-2 rondas (solo LLM reasoning sobre datos ya extraídos).
- n4 (Renderer): 1 ronda (template rendering).
- n5 (Gmail sender): deterministic, sin tool rounds.

Total: ~10 rondas entre los 5 nodes. Dentro del límite si cada nodo se queda en 2-3 rondas. Si un nodo necesita 5+ rondas para la extracción, puede que no converja.

Para Phase 133, no cambiar el límite, pero **loggear el round count por nodo** en `canvas_runs.metadata.node_rounds` para poder detectar cuáles nodos están cerca del límite y rediseñarlos.

---

## BLOQUE I — Gestión de fallos y resiliencia

### I1. ¿Fail-fast o fail-soft?

**Evidencia** (canvas-executor el catch global del loop):

```ts
} catch (err) {
  const errorMsg = err instanceof Error ? err.message : String(err);
  
  const insideIterator = isNodeInsideIteratorLoop(nodeId, nodes, edges);
  if (insideIterator) {
    // Push error result, continue to next iteration
    ...
  }
  
  // Default: fail the entire run
  nodeStates[nodeId] = { status: 'failed', error: errorMsg };
  saveNodeStates(runId, nodeId, nodeStates);
  db.prepare("UPDATE canvas_runs SET status = 'failed' WHERE id = ?").run(runId);
  createNotification({ type: 'canvas', severity: 'error', ... });
  runningExecutors.delete(runId);
  return;
}
```

**Hechos:**
- Por default, **fail-fast.** Un nodo falla → todo el canvas_run se marca failed, se crea notificación, se aborta.
- Excepción: dentro de un iterator, el error del body se **captura por item**. El item falla pero el loop continúa con los siguientes items.
- **No hay skip logic** para nodos paralelos independientes. Si hay dos ramas que no dependen una de otra y una falla, la otra no se skippa — el canvas entero se aborta.

**Razonamiento:**

Fail-fast es la elección correcta para casos donde los nodos dependen uno del siguiente linealmente. Pero para flujos con ramas independientes (ej: "extrae Holded + extrae Drive, luego merge"), fail-fast aborta incluso si Drive falló pero Holded tenía éxito.

Para Phase 133 no es prioritario, pero Phase 134 podría añadir una bandera `data.on_failure: 'abort' | 'skip'` por nodo, permitiendo que ciertos nodos (opcionales) no aborten el canvas.

---

### I2. ¿Auto-repair se activa para qué fallos?

**Evidencia** ([canvas-auto-repair.ts](app/src/lib/services/canvas-auto-repair.ts) + invocación desde `_internal_attempt_node_repair` tool):

**Hechos:**
- Auto-repair **solo** se activa cuando un guard (condition node auto-insertado) falla (`guard.no → reporter node → reporter llama `_internal_attempt_node_repair`).
- NO se activa para nodos agent que fallan por output malformado.
- NO se activa para nodos connector que fallan en el API call.
- NO se activa para nodos condition de negocio (no auto-insertados).
- La invocación es siempre por el reporter agent auto-insertado, que tiene `data.tools = ['_internal_attempt_node_repair', 'log_knowledge_gap']`.

**Razonamiento:**

Auto-repair es **un mecanismo muy estrecho**. Solo cubre el caso "guard detectó input inválido antes de side-effect". No cubre:
- Agent output malformado.
- Connector API error.
- Tool call timeout.
- Datos inesperados del upstream.

Phase 133 podría generalizar auto-repair para más casos, pero eso es complejo. Más pragmático: documentar claramente en qué casos se activa y en cuáles no, para que los usuarios no lo esperen como silver bullet.

---

### I3. ¿Qué modifica auto-repair exactamente?

**Evidencia** (canvas-auto-repair.ts, AGENT_AUTOFIX_PROMPT output):

```
{
  "status": "fixed",
  "fix_target_node_id": "nX",
  "fixed_instructions": "INPUT: {...}\nOUTPUT: {...}\n...",
  "reason": "1-2 lineas"
}
```

Y en código (canvas-auto-repair.ts:163-180):

```ts
const targetNode = flowData.nodes.find(n => n.id === llmOut.fix_target_node_id);
...
const targetData = (targetNode.data ?? {}) as Record<string, unknown>;
targetData.instructions = llmOut.fixed_instructions;
targetNode.data = targetData;

db.prepare('UPDATE canvases SET flow_data = ? WHERE id = ?')
  .run(JSON.stringify(flowData), canvasId);
```

**Hechos:**
- Auto-repair **reemplaza completamente** las `instructions` del nodo target (que puede ser el failed node o un upstream).
- **Persiste el cambio en la tabla `canvases`** — el canvas se queda permanentemente modificado.
- Resetea el `node_states` del nodo target y del failed node a pending, y marca el canvas_run como running.
- Incrementa `canvas_runs.metadata.repair_attempts[failedNodeId]` a 1.
- En la siguiente iteración del executor (next tick), el run se reanuda desde el nodo reparado.

**Razonamiento:**

El auto-repair es **destructivo** — modifica el canvas persistido, no solo el run. Esto significa que si un canvas se ejecuta, falla, se repara, y funciona la segunda vez, el canvas queda modificado para futuras ejecuciones. Esto puede ser bueno (aprendizaje persistente) o malo (el canvas deriva sin que el usuario lo apruebe).

Para Phase 133 propondría: **los cambios de auto-repair se guardan en una tabla `canvas_patches` separada**, no directamente en `canvases.flow_data`. El run consume la versión parcheada, pero el usuario puede revisar los parches y decidir si commit al canvas original o revertir.

Alternativamente (más simple): notificar al usuario del parche aplicado: "He tenido que ajustar las instrucciones de n4 para corregir un contrato de datos. Revísalo si el resultado no es correcto."

---

### I4. ¿withRetry se aplica en el executor?

**Evidencia:** Grep results:
- `/app/api/cat-paws/[id]/chat/route.ts` — chat con CatPaws
- `/app/api/websearch/*.ts` — websearch
- `/lib/services/execute-catpaw.ts:484` — llamadas LiteLLM en tool-calling loop
- `/lib/services/ollama.ts` — ollama calls

**Hechos:**
- `withRetry` **se aplica dentro de `execute-catpaw.ts:484`**, es decir, cada llamada LLM del tool loop del CatPaw tiene retry automático para errores retryables (503, 502, 504, timeout, ECONNREFUSED).
- **No se aplica** a las llamadas LLM del pipeline async (`intent-job-executor.callLLM`).
- **No se aplica** a los connector calls (fetch simple con AbortController timeout pero sin retry).

**Razonamiento:**

Asimetría. Los CatPaws tienen retry, el pipeline async no. Para Phase 133, trivialmente: wrap `intent-job-executor.callLLM` en `withRetry`:

```ts
private static async callLLM(systemPrompt, userInput) {
  return withRetry(async () => {
    const res = await fetch(...);
    ...
  }, { maxAttempts: 3, baseDelayMs: 1000 });
}
```

Tres llamadas extra en el worst case, pero resiliente a transient failures de LiteLLM. Bajo riesgo, alto ROI.

---

### I5. ¿Qué ve el usuario cuando un canvas falla?

**Evidencia:** El executor crea una notificación genérica:

```ts
createNotification({
  type: 'canvas',
  title: `Error en ejecucion de canvas`,
  message: `Nodo ${node.type} fallido: ${errorMsg}`.slice(0, 200),
  severity: 'error',
  link: `/canvas/${canvasId}`,
});
```

**Hechos:**
- Notificación con título genérico + nodo tipo + mensaje de error truncado a 200 chars.
- **NO menciona** qué nodo específico (node.id) falló por nombre humano, solo su `type`.
- **NO incluye** contexto del output del nodo previo.
- **NO incluye** link directo al `canvas_run` para inspección.
- Para Telegram, la notificación se envía vía `notifyProgress` si hay `channel_ref`, pero el mensaje es igualmente genérico.

**Razonamiento:**

Información mínima. El usuario ve "Nodo agent fallido: JSON.parse unexpected token at position 42" y se queda sin saber **qué nodo**, **por qué**, **qué había antes**, **qué debería hacer**.

Phase 133 debería enriquecer esto con:
- Node.id + node name/label.
- Primeros 300 chars del output del nodo previo (si existe).
- Link al run con anchor en el nodo fallido.
- Sugerencia de acción ("revisa este run", "reintenta desde el checkpoint", etc.).

Es UX, no crítico, pero marca la diferencia entre debugging frustrante y debugging productivo.

---

### I6. ¿Historial de fallos accesible para CatBot?

**Evidencia:** Las tools `canvas_list_runs` y `canvas_get_run` existen en catbot-tools.ts. Ambas leen de `canvas_runs`.

**Hechos:**
- CatBot puede listar runs fallidos y ver el `node_states` completo.
- `canvas_get_run` devuelve: id, canvas_id, status, node_states (JSON parseable), metadata, started_at, completed_at, total_tokens, total_duration, current_node_id, execution_order.
- Granularidad: por nodo, con output, error, tokens, duration.
- El usuario puede preguntar "¿por qué falló el canvas X ayer?" y CatBot puede:
  1. list_canvases para encontrarlo
  2. canvas_list_runs(canvas_id) para ver los runs
  3. canvas_get_run(run_id) para el run fallido
  4. Parsear node_states, encontrar el nodo con status='failed', leer su error.

**Razonamiento:**

La infraestructura está. La experiencia de usuario depende de que CatBot sepa hacer esto de forma natural. El knowledge tree de canvas.json debería tener un howto: "para diagnosticar un canvas fallido: 1. list_canvases 2. canvas_list_runs 3. canvas_get_run 4. parse node_states".

Eso no existe hoy. Verificar en catflow.json / canvas.json y añadir en Phase 133 como parte del mantenimiento del knowledge tree.

---

## BLOQUE J — Output, notificación y cierre del loop

### J1. ¿Qué ve el usuario en Telegram cuando el canvas termina?

**Evidencia:** El output node crea notificación:

```ts
createNotification({
  type: 'canvas',
  title: `CatFlow completado: ${outputName}`,
  message: output.slice(0, 200),
  severity: 'success',
  link: `/canvas/${canvasId}`,
});
```

Y al final del `executeCanvas`:

```ts
createNotification({
  type: 'canvas',
  title: `Canvas ejecutado correctamente`,
  message: `Ejecucion completada en ${totalDuration}ms con ${totalTokens} tokens`,
  severity: 'success',
  link: `/canvas/${canvasId}`,
});
```

**Hechos:**
- Dos notificaciones pueden dispararse al completar: una por el output node (si existe y notify_on_complete=true), otra genérica al final del run.
- El mensaje está limitado a 200 chars (primeros 200 del output).
- **NO hay envío directo por Telegram desde el executor.** Las notificaciones van a la tabla `notifications` y son consumidas por `notifyProgress` del executor o por el polling del telegram-bot (no verificado en detalle).
- Si el pipeline async inició por Telegram y el output es > 200 chars, el usuario solo ve un preview + link al web.

**Razonamiento:**

Para ejecuciones iniciadas por Telegram esto es **insuficiente**. El usuario pidió "la comparativa Holded por email" — si el canvas tuvo éxito, el email ya llegó a su inbox. El usuario no necesita un preview de 200 chars, necesita una confirmación: "✅ Email enviado a antonio@, fen@ con el informe comparativo (2 min, 14K tokens)".

Phase 133 debería tener un handler específico para outputs de canvases iniciados vía pipeline async: buscar el `intent_jobs.channel_ref`, y enviar al chat original un mensaje estructurado con metadata del run (tiempo, tokens, nodos exitosos, destino final si aplicable).

---

### J2. ¿Se persiste el output en algún lugar accesible?

**Evidencia:** El output del nodo final vive en `canvas_runs.node_states[lastNodeId].output`. No hay un campo `canvas_runs.final_output` dedicado.

**Hechos:**
- El output es accesible via `canvas_get_run(runId)`.
- CatBot puede recuperarlo si el usuario lo pide.
- La UI del canvas editor también lo muestra al ver un run.

**Razonamiento:**

Accesible pero no prominentemente. Phase 133 podría añadir `canvas_runs.final_output TEXT` como columna dedicada que se pobla al completar el run, simplificando la recuperación.

Prioridad baja. Ya funciona.

---

### J3. ¿Mecanismo de feedback del usuario?

**Evidencia:** Búsqueda exhaustiva — no hay endpoint `/api/canvas/[id]/run/[runId]/feedback` ni ningún tool de rating.

Solo existe el feedback de checkpoint (cuando un nodo `checkpoint` pausa la ejecución esperando aprobación humana). Ese feedback se guarda en `node_states[prevNodeId].feedback` y se usa si el checkpoint se rechaza.

**Hechos:**
- No hay mecanismo de post-execution feedback.
- El usuario no puede decir "el resultado fue correcto" o "el resultado estaba mal".
- No hay aprendizaje cerrado del loop.

**Razonamiento:**

Es un gap de Phase 134/135 para el ciclo de mejora continua. Phase 133 no lo necesita. Pero valdría la pena añadir al knowledge_gap log cuando el usuario cancela un pipeline ya ejecutado (si eso es posible) o cuando un run queda en estado "waiting" indefinidamente.

---

## BLOQUE K — Memoria, aprendizaje y patrones

### K1. Contenido de `catflow.json`

**Evidencia completa:** (ya pegado por el agente explorador arriba, resumida aquí)

- 7 endpoints de API
- 7 tools registrados (incluido `_internal_attempt_node_repair`)
- **31 conceptos** (incluyen R01-R25 resumidos, SE01-SE03, DA01-DA04, y los conceptos nuevos del hotfix)
- 4 howtos
- 4 donts
- 1 common_error
- 2 success_cases
- 5 sources
- updated_at: 2026-04-11

**Hechos:**
- Es el archivo del knowledge tree más grande después de catboard.json.
- Cubre tanto CatFlow (canvas pipelines) como conceptos técnicos del architect post-hotfix.
- Está bien mantenido (updated_at reciente).

**Razonamiento:**

El knowledge tree es sólido técnicamente pero mezcla **información para usuarios** (cómo crear un canvas, anti-patterns) con **información técnica del architect** (R01-R25, SE01-SE03). Esto hace que sea difícil para un humano leerlo y saber si está completo.

Phase 133 podría separar en dos archivos:
- `catflow.json` — info para usuarios (howto, donts, errores comunes).
- `catflow-architect.json` — info técnica del pipeline architect (reglas, taxonomías, contratos de conectores).

Ambos cargados por CatBot pero con propósitos distintos. Más mantenible.

---

### K2. ¿Los knowledge_gaps se procesan?

**Evidencia:** Búsqueda exhaustiva — no hay un proceso automático que lea `knowledge_gaps` y actualice algo.

**Hechos:**
- La tabla `knowledge_gaps` existe y se llena con cada exhaustion de QA y cada auto-repair failure.
- Hay UI en Settings para ver gaps (Phase 127).
- Hay tool `query_knowledge_gaps` que CatBot puede usar.
- **Pero no hay feedback loop automático.** Un admin tiene que manualmente leer los gaps y decidir si actualizar el rules index o el prompt del architect.

**Razonamiento:**

Los gaps se acumulan sin acción. Esto es **capacidad sin uso**. Para Phase 133 no es prioritario, pero Phase 134 podría introducir:

1. **Weekly gap review:** un scheduler que cada semana compila los gaps nuevos, los agrupa por patrón, y los envía como notificación al admin ("Esta semana: 5 gaps de R10 en emitters, sugerencia: relajar R10 en nodos connector").

2. **Gap→prompt injection automática:** si un gap se repite N veces con el mismo patrón, se añade automáticamente un ejemplo al ARCHITECT_PROMPT como contraste ("no hagas esto: [gap example], haz esto: [fix]").

Alto potencial, pero es un sistema de aprendizaje a construir. Phase 134.

---

### K3. ¿Recuerdos de canvases pasados?

**Evidencia:** Confirmado — no hay memoria de canvases pasados en el pipeline. Cada diseño parte de cero.

**Hechos:**
- El architect no consulta `canvases` existentes.
- Las `user_memory` (Phase 122) existen pero son para CatBot conversacional, no para el pipeline architect.
- Los canvases con `times_used` count existen (templates) pero el architect no los usa como input.

**Razonamiento:**

Ver D3. Es un gap crítico para reutilización. Fix sugerido en D3: pasar al architect una lista de canvases similares como parte del `resources`.

---

### K4. ¿Canvases generados vs creados manualmente son distinguibles?

**Evidencia:** La tabla `canvases` no tiene un campo `auto_generated` ni `source`. No hay flag.

**Hechos:**
- Indistinguible a nivel de DB.
- Para saber si un canvas fue generado por el pipeline, hay que hacer un JOIN con `intent_jobs WHERE canvas_id = X`.
- La UI muestra todos los canvases iguales.

**Razonamiento:**

Esto limita el filtrado y el análisis. Phase 133 debería añadir:

```sql
ALTER TABLE canvases ADD COLUMN source TEXT DEFAULT 'manual';  -- manual, pipeline_async, template_clone, fork
ALTER TABLE canvases ADD COLUMN source_ref TEXT;  -- intent_job_id, template_id, canvas_id (for forks)
```

Y popular `source='pipeline_async'`, `source_ref=jobId` en `finalizeDesign`. Permite queries como "cuántos canvases generados automáticamente se ejecutaron con éxito esta semana".

---

### K5. ¿Canvas templates como starting point?

**Evidencia:** Confirmado por la exploración: `canvas_templates` existe con 5 templates seed, incluido "Pipeline Multi-Agente".

**Hechos:**
- Los templates son accesibles vía `/canvas/from-template/[templateId]`.
- El architect **no tiene acceso a ellos** en `scanCanvasResources`.
- Nadie los usa como input del pipeline async hoy.

**Razonamiento:**

Enorme oportunidad perdida. El template "Pipeline Multi-Agente" **es literalmente el shape que el architect genera** (start → agent1 → agent2 → output). Si el architect tuviera acceso a templates como starting points:

1. Recibe goal + tasks
2. Busca un template que se parece al goal
3. Adapta el template en vez de generar desde cero

Esto convertiría al architect en un **adapter** (transformación) en vez de un **generator** (creación desde cero). Adapters son mucho más estables y predecibles que generators.

Phase 133 debería añadir templates al `scanCanvasResources.templates: Array<{id, name, description, node_count, uses}>` y extender el ARCHITECT_PROMPT para considerar "si un template encaja, adáptalo en vez de generar desde cero".

Esto es el cambio de mayor ROI conceptual identificado en toda la auditoría.

---

## BLOQUE L — Patrones y arquitectura hacia el sistema ideal

### L1. Cambio de arquitectura de mayor impacto

**Mi razonamiento:**

El cambio de mayor impacto **no es prompt tuning ni rules adjustments**. Es un cambio de paradigma:

**El architect actual es un generator. Debe convertirse en un adapter + validator.**

Concretamente: en vez de "recibir goal+tasks y generar flow_data desde cero", el architect debería:

1. **Recibir** goal + tasks + **inventory** (resources + templates + canvas previous existentes + connector contracts).
2. **Buscar** un template o canvas existente que se parezca al goal (similarity search simple).
3. **Adaptar** ese starting point a la petición específica (cambiar nombres, destinatarios, periodos, etc.).
4. **Generar** solo las partes que son genuinamente nuevas.
5. **Validar** con el reviewer (QA como hoy).

Esto es porque **la variabilidad del LLM** es la principal fuente de fallos. Si el LLM adapta un template validado, la variabilidad se limita a pocos cambios quirúrgicos. Si el LLM genera desde cero, la variabilidad cubre todo el diseño.

Además, **los templates hand-crafted son la fuente de verdad de buenas prácticas**. Ya sabemos que los canvases hand-crafted funcionan. El architect debería beneficiarse de ese conocimiento sin tener que re-aprender.

Esto no requiere cambiar infraestructura ni LLMs — solo extender `scanCanvasResources` y el ARCHITECT_PROMPT. Es cambio de prompt + una feature de similarity search simple (keyword match o embedding cosine).

---

### L2. ¿Cambiarías el número o el orden de LLMs?

**Mi razonamiento:**

Mantendría los 4 LLMs pero:

1. **Fusionaría strategist + decomposer en una sola llamada.** El strategist produce un "goal" que el decomposer solo reformatea en "tasks". La separación añade latencia y coste sin valor. Una sola llamada con output `{goal, tasks}` hace el mismo trabajo.

2. **Reemplazaría la llamada LLM del QA por código determinístico en la primera pasada + LLM en refinamiento.** Un validador en código (determinístico) puede verificar:
   - Referencias válidas (agentId existe, connectorId existe).
   - Tipos de nodo válidos.
   - Edges bien formados.
   - Contratos INPUT:/OUTPUT: declarados.
   - Iterator body conectado correctamente.

   El LLM QA solo se invoca **si** el validador determinístico pasa, para validar semántica (R10 scope-aware, instructions quality). Esto reduce falsos positivos y coste.

3. **Mantendría el architect como está** pero con el contexto enriquecido (templates, connector contracts, tools por CatPaw).

Total: 3 LLMs en ruta feliz (strategist+decomposer combinado → architect → QA condicional), 2 en ruta mínima (validador pasa sin QA). Reducción del 25-50% de latencia y coste.

---

### L3. ¿Cómo maneja el sistema la variabilidad del LLM?

**Mi razonamiento:**

Hoy: **solo** el QA loop y `temperature: 0.3`. Ambos son débiles:

- Temperature 0.3 todavía permite variabilidad significativa en outputs largos.
- QA loop es 2 iteraciones, y si no converge, falla.

Lo ideal (en orden de incremento de robustez):

1. **Temperature 0** para las fases determinísticas (strategist, decomposer, QA). Mantener 0.3 para architect (permite creatividad en diseño).
2. **Seed estable** si el modelo lo soporta (gemini no lo garantiza, así que esto es best-effort).
3. **Self-consistency** en el architect: generar N=3 diseños distintos, pasar los 3 por el QA, elegir el de mayor score. Coste x3 pero variabilidad mucho menor. Opcional vía flag.
4. **Post-procesamiento determinístico** del output del architect:
   - Normalizar nombres de nodos (n1, n2, ... en orden topológico).
   - Deduplicar edges.
   - Validar referencias antes del QA.
   - Añadir INPUT:/OUTPUT: prefix si falta.

Los puntos 1, 2, 4 son gratis. El 3 es opcional. Phase 133 debería hacer al menos 1 y 4.

---

### L4. ¿Diferencias estructurales canvases hand-crafted vs generados?

**Mi razonamiento:**

Más allá de la calidad de instructions, los canvases hand-crafted (Inbound v4.0, Revisión Diaria) tienen **estructura distinta**:

1. **Más tipos de nodo.** Usan iterators, conditions de negocio (no solo guards), merge, storage, scheduler. El architect generado solo usa start/agent/connector/output.

2. **Más edges condicionales.** Los hand-crafted tienen bifurcaciones (yes/no). El architect generado produce flujos lineales.

3. **Nodos con roles explícitos (en el nombre).** Los hand-crafted tienen nodes llamados "lector-emails", "clasificador", "redactor". El architect generado usa "n1, n2, n3" genéricos.

4. **Checkpoints humanos.** Los hand-crafted tienen checkpoint nodes para flujos que requieren revisión humana. El architect generado nunca los pone (ni siquiera los conoce).

5. **Skills declaradas explícitamente.** Los hand-crafted tienen `data.skills=[...]`. El architect generado casi nunca declara skills.

El gap estructural es proporcional al gap de calidad de instructions. Es la misma causa: el architect no tiene suficiente vocabulario ni ejemplos.

---

### L5. ¿Cuántos few-shot ejemplos necesitaría el architect?

**Mi razonamiento:**

Mínimo: **4 ejemplos contrastados**, cubriendo los 4 patrones estructurales más comunes:

1. **Lineal simple** (extractor → transformer → emitter): el caso Holded Q1.
2. **Paralelo con merge** (extractor × 2 → merge → transformer → emitter): reportes que comparan fuentes.
3. **Iterator con body rico** (extractor → iterator → transformer body → emitter): procesamiento de arrays (inbound emails, invoices).
4. **Con bifurcación condicional** (extractor → condition → branches): flujos de clasificación y routing.

Cada ejemplo con:
- Goal en lenguaje natural.
- flow_data completo (nodes + edges).
- Instructions detalladas (500+ chars cada nodo importante).
- Declaración explícita del rol de cada nodo.
- Explicación breve de por qué se eligió esta estructura.

Total: ~3000-4000 tokens adicionales en el ARCHITECT_PROMPT. Con un prompt base de ~1200 tokens + 2000 de rules index, pasaríamos de ~3200 a ~6500 tokens en el system prompt. Todavía dentro del context window de Gemini 2.5 Pro (1M tokens).

Mayor: 6-8 ejemplos si cubrimos casos por dominio (Holded, Gmail, Drive, HTTP genérico). Pero empieza a ser overkill. 4 bien elegidos cubren ~80% de los casos.

---

### L6. ¿Qué partes del pipeline deberían ser determinísticas?

**Mi razonamiento:**

**Candidatos firmes a ser código, no LLM:**

1. **Decomposer → validación de tasks.** La estructura del output del decomposer es fija. Un validador de código verifica: tasks es array, length 3-8, cada task tiene id/name/description/depends_on/expected_output, depends_on apunta a ids existentes, no hay ciclos. Determinístico.

2. **Architect → resolución de referencias.** Después del LLM, verificar que cada agentId, connectorId, catbrainId existe en resources. Fix automático: si falta, convertir a needs_cat_paws. Determinístico.

3. **Architect → inserción de INPUT/OUTPUT prefix.** Si el LLM olvidó el prefix INPUT:/OUTPUT: en una instruction, el código lo puede añadir a partir del contrato declarado en `data_contract_analysis`. Menos LLM work.

4. **QA → validación estructural.** Validar node types, edges, topological sortability, guard insertion. Código. Luego el LLM QA solo evalúa semántica.

5. **Side-effect detection.** Ya es código (`isSideEffectNode`). Mantener.

6. **Guard insertion.** Ya es código (`insertSideEffectGuards`). Mantener.

**Candidatos a permanecer LLM:**

1. **Strategist:** normalizar petición ambigua del usuario. Requiere interpretación de lenguaje natural.
2. **Architect:** diseño creativo del flow_data. Aunque con templates + contratos + ejemplos, sigue requiriendo reasoning.
3. **QA semántico:** evaluar si las instructions tienen sentido dado el rol de cada nodo. Razonamiento contextual.

Híbrido: validadores determinísticos **antes y después** de cada LLM. Reduce superficie de error y coste.

---

## BLOQUE M — Consistencia entre canal web y canal Telegram

### M1. ¿Pipeline async desde web?

**Evidencia:** El flujo es el mismo. Si el usuario envía un mensaje complejo vía `/api/catbot/chat` con `channel='web'`, el clasificador lo detecta y el `queue_intent_job` encola con `channel='web'`, `channel_ref=null`.

**Hechos:**
- El pipeline async funciona igual para web y telegram.
- Las diferencias están en el `notifyProgress` y `sendProposal`: ambos tienen un path por canal.
- En web, `channel_ref` es null → la notificación es un row en `notifications` con `channel='web'` que la UI consume.
- En telegram, `channel_ref` es el chat_id → la notificación es un sendMessage directo.

**Razonamiento:**

Parece funcional en ambos canales. La limitación es la UX: en web, las notificaciones se ven en un panel dentro de la app. Si el usuario cierra la tab, no recibe nada hasta volver. En telegram, la notificación es push.

Para Phase 133 no hay cambios necesarios aquí (fue arreglado en hotfix-A con los channel_ref first-class). M2 cubre el caso edge.

---

### M2. ¿Qué pasa si el usuario cierra el navegador?

**Evidencia:** `notifyProgress` para `channel='web'` solo crea notificaciones en la tabla `notifications`. No hay email, no hay push browser, no hay push del OS.

**Hechos:**
- Si el usuario cierra el navegador tras aprobar un pipeline, no recibe nada hasta volver a abrir DocFlow en web.
- El pipeline se ejecuta igual en background.
- Al volver, el usuario ve las notificaciones nuevas en el panel.
- **No hay timeout ni limpieza.** Si el usuario tarda una semana en volver, las notificaciones siguen ahí.

**Razonamiento:**

Esto es aceptable si el usuario **sabe** que el pipeline está en background. Si no lo sabe (la UX no lo deja claro), puede quedarse con la sensación de "nunca me llegó la respuesta".

Para Phase 133 o siguientes: ofrecer al usuario elegir canal de notificación al arrancar el pipeline ("¿quieres que te notifique por email / telegram / esperar en web?"). Requiere `user_profile` con preferencias de canal. Follow-up.

---

### M3. ¿Adaptación de formato por canal?

**Evidencia:** `notifyProgress` tiene dos ramas (telegram vía sendMessage, web vía createNotification). Los mensajes son idénticos en texto, pero:
- Telegram renderiza **Markdown**.
- Web notifications renderizan HTML o texto plano (depende del panel UI).

**Hechos:**
- Los mensajes del pipeline usan Markdown (asteriscos para negrita, bullets con •).
- En Telegram se renderizan como esperado.
- En web, si el panel de notificaciones no parsea markdown, el usuario ve asteriscos literales.

**Razonamiento:**

Inconsistencia menor. Phase 133 debería hacer el formato del mensaje **canal-aware**: Telegram recibe Markdown, web recibe HTML o texto plano según lo que el panel soporte.

Alternativa más simple: usar texto plano en ambos. Pierde algo de UX en Telegram pero es consistente.

No bloqueante.

---

## Sumario ejecutivo (post-funnel)

| Bloque | Hallazgos principales |
|--------|-----------------------|
| A — Entrada | 3 capas (telegram → API → LLM). Clasificador es prompt-based, sin self-check. Protocolo tiene criterios OK pero sin ejemplos de "ya existe canvas". `complexity_decisions` existe pero no cierra el loop. |
| B — Encolado | Intent_jobs no guarda historial ni contexto. BOOT_DELAY 60s opaco al usuario. cleanupOrphanJobs no notifica fallos por reinicio. Sin timeout por fase LLM (cuelga indefinidamente). |
| C — Pipeline LLM | 4 LLMs con mismo modelo y temperatura. Strategist/decomposer trabajan a ciegas sobre recursos. No hay validación de goal vacío o tasks vacías. Cero feedback loop. Outputs intermedios no persistidos. |
| D — Contexto architect | **Gap crítico**: architect no sabe qué tools tiene cada CatPaw, no conoce contratos de conectores, no ve canvases existentes, no ve templates. Trabaja con 20% de la información necesaria. |
| E — Output architect | Instructions 3-7x más cortas que hand-crafted. Nunca menciona tools por nombre. Nunca usa iterator. Nunca genera condition de negocio. R10 aplicado universal falsamente. |
| F — QA patterns | Feedback en iter 1 es JSON raw sin guidance. Reviewer no valida existencia de referencias. Iterator es caja negra para el reviewer. Sin persistencia de iteraciones para análisis. |
| G — finalizeDesign | sendProposal minimalista, usuario aprueba a ciegas. Sin opción de refinar. Sin propagación del goal al initialInput del canvas. No hay re-validación post-guards. |
| H — Ejecución | Strings entre nodos (OK). Sin sanitización markdown en agent output. Condition parser solo inglés (bug silencioso). Merge best-effort sin espera. **Sin timeout por nodo agent**. |
| I — Resiliencia | Fail-fast por default. Auto-repair solo guards. withRetry no aplicado al pipeline async. Notificaciones de fallo genéricas y poco útiles. |
| J — Output al usuario | Mensaje completion minimalista (200 chars). Output no persistido en campo dedicado. Cero feedback loop del resultado. |
| K — Memoria/aprendizaje | catflow.json bien mantenido. knowledge_gaps se acumulan sin procesar. Cero reuso de canvases pasados. canvas_templates ignorados por el architect. |
| L — Arquitectura | **Hallazgo mayor**: architect debe ser adapter de templates + validador, no generator desde cero. Strategist+decomposer fusionables. QA debería tener capa determinística antes del LLM. |
| M — Canales | Web sin push (usuario debe volver). Formato Markdown inconsistente entre canales. Pipeline funciona en ambos. |

## Priorización para Phase 133

Después del funnel completo, el orden de impacto ordenado de mayor a menor:

1. **Extender `scanCanvasResources`** para incluir tools_available por CatPaw, templates, canvases similares, y pasar connector contracts inline. **Un cambio, 3 beneficios.** (D1, D2, D4, K5)

2. **Introducir validadores determinísticos** antes del QA LLM (referencias válidas, structure, contratos declarados). Reduce falsos positivos R10 y coste QA. (F4, L6)

3. **Reescribir CANVAS_QA_PROMPT con taxonomía de roles y R10 scope-aware.** Elimina el bucle de falsos positivos. (Audit §8)

4. **Reescribir ARCHITECT_PROMPT con 4 ejemplos few-shot contrastados** + guidance sobre qa_report handling en iter>0. (E1, F1, L5)

5. **Persistencia de outputs intermedios** (strategist, decomposer, architect iter 0, qa iter 0, architect iter 1, qa iter 1) en columnas dedicadas de intent_jobs. Desbloquea debugging y analytics. (C4, F3, P13 batería anterior)

6. **Propagar `goal` al `initialInput` del canvas** + notificar exhaustion con top 2 issues por Telegram + wrap callLLM en withRetry. Tres fixes de 1-5 líneas cada uno. (G5, caso 5 audit, I4)

7. **Script `test-pipeline.mjs`** para iterar sobre prompts sin Telegram. Tooling esencial para calidad del prompt engineering. (P19 batería anterior)

8. **`scanCanvasResources` extensión a templates + canvases existentes** (parte del punto 1, pero con lógica de similarity). Habilita reuse. (D3, K3, K5)

Los puntos 1-6 son el scope core de Phase 133. Los 7-8 son follow-up natural (Phase 134 o al final de 133 si hay margen).

---

_Documento generado el 2026-04-11 como respuesta a la auditoría de funnel completo._
_Companion docs: AUDIT-catflow-pipeline-quality.md (audit general), AUDIT-respuestas-bateria-19q.md (batería 19q)._
_Total: 67 preguntas respondidas con evidencia + razonamiento._
_Próximo paso: el usuario revisa los 3 documentos de auditoría → decide prioridad → procedemos a planificar Phase 133._
