# Phase 131: Complexity Assessment - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning (decisions locked by user)

<domain>
## Phase Boundary

CatBot razona sobre la complejidad de cada petición ANTES de ejecutar tools, usando casuísticas explícitas del proyecto en el prompt. Cuando detecta complejidad, pregunta al usuario si quiere preparar un CatFlow asíncrono (Phase 130). Auditoría de cada decisión en tabla dedicada para mejorar iterativamente las casuísticas.

Fuera del scope:
- Nuevo servicio/LLM/agente separado (se descarta explícitamente — se añade razonamiento inline al CatBot existente)
- Clasificación automática ML (las casuísticas son declarativas en el prompt)
- Reemplazar el flag async de Phase 130 (sigue siendo útil como certeza determinista)
- Preguntas de clarificación en casos ambiguous (se reporta como 'ambiguous' pero se procesa como simple por ahora)

</domain>

<decisions>
## Implementation Decisions (user-locked)

### Enfoque: razonamiento inline, NO LLM extra
- Se descarta explícitamente añadir un LLM/servicio separado para análisis previo
- Razón: +1-2s en CADA mensaje, rebuild de contexto, doble razonamiento redundante
- Solución: reforzar el prompt de CatBot con casuísticas del proyecto + regla dura de clasificación
- El LLM de CatBot YA es suficientemente inteligente — el problema del caso real fue que el flag `async:true` de Phase 130 era demasiado estrecho (solo triggereaba si la tool específica estaba marcada)

### Clasificación output
- CatBot antepone en su respuesta: `[COMPLEXITY:simple|complex|ambiguous] [REASON:...] [EST:Ns]`
- `/api/catbot/chat/route.ts` parsea este prefijo ANTES de devolver al cliente
- Lo persiste en `complexity_decisions` y lo elimina del texto visible al usuario
- Si `classification=complex`, bloquea el tool loop y responde con pregunta de aprobación

### UX del bloqueo (user-locked)
- Cuando se detecta complex, CatBot debe:
  1. NO ejecutar las tools que pensaba llamar
  2. Responder al usuario: *"Esta tarea es compleja y puede requerir un CatFlow. Se ejecutaría en segundo plano y se reportaría cuando esté creada. ¿Quieres que lo prepare?"*
  3. Incluir la duración estimada si está disponible ("~3 minutos")
  4. Mencionar que recibirá reportes cada 60 segundos del progreso
- Si el usuario acepta → llama `queue_intent_job(description)` → pipeline Phase 130 arranca
- Si el usuario rechaza → flujo normal síncrono (con riesgo de timeout, decisión del usuario)

### Casuísticas del proyecto (para el prompt)

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

### Criterios de clasificación (explícitos en el prompt)

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

### Self-check durante ejecución
- Si CatBot pensó que era simple pero durante el loop ha hecho >3 tool calls Y detecta más trabajo pendiente:
  - Detiene el loop
  - Llama `queue_intent_job(description=trabajo restante)`
  - Responde al usuario: *"Esta tarea ha resultado más compleja de lo esperado, la estoy preparando como CatFlow asíncrono"*
- Esto cubre el caso de clasificación errónea

### Progress reporting cada 60 segundos
- El IntentJobExecutor (Phase 130) actualmente actualiza progress_message pero no notifica al canal original
- Esta fase añade: cada 60 segundos (o cada vez que pipeline_phase cambia, lo que ocurra primero), IntentJobExecutor envía un mensaje al canal original:
  - Telegram: `sendMessage` con el progreso actual
  - Web: notification type=pipeline_progress
- Formato: "⏳ CatFlow en progreso: fase=architect, completado 2/3 fases, ETA ~1min"

### Auditoría y mejora iterativa
- Cada clasificación se loguea en `complexity_decisions` table
- AlertService nueva check: `checkClassificationTimeouts` — si hay >5 timeouts/día en requests con `classification=complex` que `async_path_taken=false`, alerta
- Los logs de clasificación permiten al admin revisar casos donde CatBot clasificó mal y ajustar las casuísticas manualmente

### Sección del prompt: nueva P0
- `buildComplexityProtocol()` es una sección P0 (prioridad absoluta, antes que todo)
- Se inyecta en `build()` con try/catch
- Se inyecta SOLO si no es un mensaje de system/assistant continuation
- Budget estricto: <1200 chars (casos + criterios + regla dura)

### Formato de prefijo exacto
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

</decisions>

<code_context>
## Existing Assets to Reuse

- **`/api/catbot/chat/route.ts`**: donde se integra el gate. Ya tiene el tool loop (líneas ~306-400 aprox). El gate va ANTES de iniciar el loop.
- **`catbot-prompt-assembler.ts`**: patrón `buildIntentProtocol` (Phase 129) y `buildComplexTaskProtocol` (Phase 130) — el nuevo `buildComplexityProtocol` sigue el mismo patrón. Priority P0 (antes que todo).
- **`catbot-db.ts`**: patrón CRUD mirroring `intents`, `intent_jobs`, `knowledge_gaps` — el nuevo `complexity_decisions` sigue la misma estructura.
- **`intent-job-executor.ts` (Phase 130)**: ya tiene `updateIntentJob` con progress_message. Se extiende con `notifyProgress(channel, channel_ref, message)` que llama Telegram/notifications cada 60s durante el tick.
- **`queue_intent_job` tool**: actualmente acepta `{ tool_name, tool_args }`. Se amplía para aceptar `{ description }` opcional — cuando description está presente y no hay tool específica, el pipeline Phase 130 usa la description como input para el estratega.
- **`AlertService`**: patrón para añadir `checkClassificationTimeouts` como 10ª check.
- **Telegram `sendMessage`**: ya existe, se usa tal cual en notifyProgress.
- **`notifications` table**: ya tiene tipo `catflow_pipeline` (Phase 130), se añade tipo `pipeline_progress`.

## Integration Points

- **Phase 130 (pipeline async)**: el gate disparará el pipeline. `queue_intent_job` se extiende pero sigue creando `intent_jobs` row. Cero cambios en `IntentJobExecutor.tick()` — solo se añade el progress reporter.
- **Phase 128 (alerts)**: nueva check `checkClassificationTimeouts` en AlertService.
- **Phase 127 (dashboard)**: nueva card en tab-pipelines muestra las decisiones recientes de complexity (solo si classification=complex o ambiguous, para debugging visual).
- **Phase 126 (knowledge gaps)**: si CatBot no puede clasificar por falta de información del proyecto, puede llamar `log_knowledge_gap` (integración natural, no explícita).

## Known Pitfalls (from recent phases)

- **ESLint strict**: import solo lo que uses, no dejar imports colgados
- **LogSource union type**: si se loguea desde un nuevo módulo, añadir la source string
- **Prompt budget <800 chars**: ahora <1200 chars para este caso con casuísticas. Regla dura: medir con `buildComplexityProtocol().length` en el test
- **Parser regex fragile**: el LLM podría responder sin el prefijo exacto, el parser debe ser lenient y si no encuentra el prefijo tratar como "simple unknown" (fallback seguro)
- **Race condition**: el gate puede interferir con el streaming path. Necesita verificarse que funciona en ambos paths (streaming y non-streaming)
- **KTREE-02 sync test**: ninguna tool nueva se añade en esta fase (se extiende queue_intent_job solamente), así que no hay riesgo
- **process['env'] bracket notation**: si hay nuevas API routes que leen env vars
- **force-dynamic**: ninguna nueva API route en esta fase

</code_context>

<specifics>
## User Intent

El usuario quiere **robustez sin complicar el proyecto**. La solución debe:
1. Reutilizar lo que existe (Phase 130 pipeline)
2. No añadir piezas nuevas (no LLM extra, no servicio nuevo)
3. Ser eficiente (sin latencia extra en peticiones simples)
4. Ser auditable (tabla de decisiones para mejorar iterativamente)
5. Mantener al usuario informado (reportes cada 60s en ejecuciones async)
6. Respetar la decisión del usuario (siempre preguntar antes de encolar)

Caso real que motivó la fase:
```
Usuario (Telegram): "quiero que entres en holded y hagas resumen Q1 2026 + Q1 2025 
                     + compara + envía email maquetado a antonio@educa360.com"
CatBot: [ejecuta 8 tool calls de mcp_bridge en 60.18s]
Telegram: timeout a los 60s
Resultado: trabajo perdido, usuario frustrado
```

Con Phase 131:
```
Usuario: [misma petición]
CatBot razona: [COMPLEXITY:complex] [REASON:4 sub-tareas, agregación temporal, 
              comparación, entrega formateada] [EST:180s]
CatBot responde: "Esta tarea es compleja y puede requerir un CatFlow. 
                  Se ejecutaría en segundo plano y recibirías reportes cada 
                  60 segundos. ¿Quieres que lo prepare?"
Usuario: "sí"
CatBot: [llama queue_intent_job(description="entra en holded, Q1 2026 + Q1 2025 + 
         comparación + email maquetado a antonio@educa360.com")]
CatBot: "Tu CatFlow 'Comparativa Facturación Q1' está en preparación. 
         Te avisaré cuando esté listo para revisar."
[Phase 130 toma el relevo: pipeline 3 fases → canvas → aprobación → ejecución]
[Cada 60s durante ejecución: "⏳ En fase architect, 2/3 completado..."]
```

</specifics>

<deferred>
## Deferred Ideas

- Clarificación automática en casos ambiguous (por ahora se loguea y procesa como simple)
- Re-clasificación mid-loop si el self-check detecta error (se loguea pero no se corrige el complexity_decision ya persistido)
- Métricas de precisión del clasificador (% complex correctamente identificados) — FUTURE
- Dashboard analítico de complexity decisions — FUTURE
- Fine-tuning automático de casuísticas basado en timeouts históricos — FUTURE

</deferred>

---

*Phase: 131-complexity-assessment-catbot-razona-antes-de-ejecutar*
*Context decisions locked: 2026-04-10*
