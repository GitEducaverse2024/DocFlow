# Phase 142: Iteration Loop Tuning (LOOP) - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

CatBot puede ejecutar construcciones largas de canvas (8+ nodos, 10+ tool calls) sin que el sistema escale prematuramente a async, y reporta progreso intermedio durante construcciones largas. Cambios en `maxIterations`, threshold de escalado, y mecanismo de reporting intermedio.

</domain>

<decisions>
## Implementation Decisions

### maxIterations y threshold de escalado
- `maxIterations` sube de 8 a 15 — ambos paths (streaming y non-streaming) en `route.ts`
- Threshold de self-check escalation sube de `iteration >= 3` a `iteration >= 10` — ambos paths
- Valores hardcodeados como constantes nombradas al inicio del archivo (`const MAX_TOOL_ITERATIONS = 15; const ESCALATION_THRESHOLD = 10;`) — no configurables por settings/env en esta fase. Si en el futuro se necesita, se extraen a config
- Mismo threshold para web y Telegram — el canal no afecta la capacidad de iteración

### Reporting intermedio (cada 4 iteraciones sin texto)
- Mecanismo: conteo interno de iteraciones consecutivas donde CatBot solo hace tool_calls sin emitir texto al usuario. Cuando el contador llega a 4, se inyecta un system message al array `llmMessages` pidiendo resumen de progreso
- System message inyectado: breve, imperativo, ~100 chars: `"Llevas {N} tool calls consecutivas sin informar al usuario. Resume brevemente qué has hecho y qué queda antes de continuar."`
- El contador se resetea cuando CatBot emite texto (iterationContent no vacío en streaming, o assistantMessage.content no vacío en non-streaming)
- Formato esperado del reporte: texto corto inline ("He creado 4 nodos del canvas: Normalizador, Clasificador, Condition, RAG. Faltan 3 nodos y las conexiones.") — no JSON, no bloque especial, solo texto natural que el usuario lee en el chat
- Eficiencia de tokens: el system message inyectado es mínimo (~20 tokens). CatBot responde con ~30-50 tokens de progreso. Coste total: ~70 tokens cada 4 iteraciones — insignificante vs el contexto del canvas

### Comportamiento del escalado en iter 10+
- Mismo mecanismo actual de Phase 131: `createIntentJob` + mensaje al usuario
- Mensaje ajustado para reflejar que ya se intentó más: "Tras {N} pasos esta tarea necesita ejecución asíncrona. La he encolado como CatFlow (job {id})."
- Sin cambios en la integración con `complexity_decisions` ni en el progress reporting de 60s del async pipeline

### Claude's Discretion
- Redacción exacta del system message de inyección de reporting
- Si el contador de "sin texto" se resetea solo con texto sustancial o cualquier texto (elegir lo más robusto)
- Si añadir un log entry cuando se inyecta el reporting (recomendado: sí, nivel info)
- Naming de constantes y ubicación exacta en el archivo

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `route.ts:170` — `const maxIterations = 8;` → cambiar a constante nombrada `MAX_TOOL_ITERATIONS = 15`
- `route.ts:336` y `route.ts:604` — `iteration >= 3` → `iteration >= ESCALATION_THRESHOLD` (ambos paths)
- `route.ts:185` — `iterationContent` ya trackea el texto por iteración (streaming) — base para el contador de "sin texto"
- Non-streaming path: `assistantMessage.content` indica si hubo texto

### Established Patterns
- Ambos paths (streaming ~línea 184, non-streaming ~línea 440) tienen estructura idéntica de for-loop con iteration counter
- System messages se añaden a `llmMessages` con `{ role: 'system', content: '...' }` o como user message con context — seguir patrón existente
- Logger ya se usa en ambos paths para escalation events

### Integration Points
- `llmMessages` array en ambos paths — donde se inyecta el system message de reporting
- Self-check blocks en líneas ~336 y ~604 — donde se cambia el threshold
- Phase 141 reporting ✓/✗ es post-ejecución (al final) — complementario al reporting intermedio (durante ejecución)

</code_context>

<specifics>
## Specific Ideas

- "Buscamos escalabilidad y profesionalidad y aprovechar eficiencia de tokens" — decisiones deben minimizar overhead sin sacrificar UX
- El reporting intermedio complementa (no reemplaza) el reporting ✓/✗ de Phase 141 que ocurre al final
- El caso de uso principal es la construcción de canvas complejos donde CatBot encadena 10+ tool calls (add_node × 8, add_edge × 10+)

</specifics>

<deferred>
## Deferred Ideas

- Configurabilidad de maxIterations/threshold via Settings UI o env vars — future phase si se necesita
- Threshold diferenciado por canal (web más permisivo, Telegram más agresivo por timeout) — evaluar tras datos reales
- Dashboard de métricas de iteraciones por conversación — future analytics

</deferred>

---

*Phase: 142-iteration-loop-tuning-loop*
*Context gathered: 2026-04-17*
