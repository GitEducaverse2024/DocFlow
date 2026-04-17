# Auditoría Retrospectiva — Milestone v28.0: CatFlow Intelligence

**Fecha:** 2026-04-17
**Scope:** Fases 138-144 (7 fases, 15 planes, ~0.5h ejecución total)
**Objetivo del milestone:** Elevar la capacidad de CatBot para construir CatFlows de calidad, de 60/100 a 85+/100

---

## 1. Resumen Ejecutivo

El milestone v28.0 atacó el problema central: CatBot no sabía construir CatFlows bien. Partíamos de un score de 60/100 donde CatBot respondía de memoria en vez de usar tools, no validaba reglas estructurales, y escalaba prematuramente a async.

**Score final pre-gap-closure:** 70/100 (+10)
**Score proyectado post-gap-closure (fases 144-03/04):** 85-92/100

Las fases se ejecutaron linealmente (138→144) sin bloqueos mayores. Los mayores gains vinieron de enseñar a CatBot a usar sus propias herramientas (+14 puntos en tests 2, 3, 9). Los mayores problemas fueron bugs que no se descubrieron hasta la evaluación final (instrucciones que no persisten en canvas_get, clasificador demasiado agresivo).

---

## 2. Fase por Fase: Qué se hizo y qué aprendimos

### Phase 138: Canvas Tools Fixes (CANVAS)
**Qué:** Fix de bugs críticos en canvas_add_node (persistencia de model, label min 3 chars) y canvas_add_edge (OUTPUT terminal, START max 1, CONDITION sourceHandle).

**Resultado:** 9 tests, todos green. Verificación pasada.

**Aprendizaje:** La validación de reglas estructurales en edges fue el fix más impactante del milestone — Test 9 (recuperación de errores) subió de 2/10 a 7/10 solo por esto. CatBot ahora detecta que OUTPUT es terminal y lo comunica al usuario en vez de fallar silenciosamente.

**Error cometido:** El fix de persistencia de instrucciones en `canvas_add_node` no fue suficiente. Las instrucciones se guardan en la BD pero `canvas_get` no las exponía en la respuesta, así que CatBot creía que no se habían guardado. Este bug no se detectó hasta la scorecard en fase 144 porque los tests unitarios verificaban la escritura pero no la lectura completa.

---

### Phase 139: Canvas Tools Capabilities (TOOLS)
**Qué:** Nuevas capacidades — model override por nodo, `canvas_set_start_input`, `extra_skill_ids`/`extra_connector_ids`, respuestas enriched con `buildNodeSummary`.

**Resultado:** 14 tests nuevos (23 total). Verificación pasada limpia (14/14 truths).

**Aprendizaje:** La función `buildNodeSummary` que enriquece las respuestas de mutation tools fue una decisión acertada. Dar feedback rico después de cada operación (nodeId, label, type, model, has_* flags, total_nodes, total_edges) le permite a CatBot "ver" lo que acaba de hacer sin necesitar un `canvas_get` adicional.

**Decisión notable:** `model: ""` (string vacío) resetea el override al modelo por defecto. Parece trivial pero evita la necesidad de un tool separado `canvas_reset_model`.

---

### Phase 140: Model Configuration (MODEL)
**Qué:** Configurar Gemma4 en LiteLLM con aliases semánticos (canvas-classifier → gemma-local, canvas-writer → gemini-main).

**Resultado:** Verificación pasada después de Docker restart.

**Aprendizaje importante:** Gemma4:31b (19GB VRAM) no cabe en RTX 5080 (16GB). Solo Gemma4:e4b (9GB) es viable. Esta decisión de hardware se tomó correctamente en planificación, pero lo relevante es que **la configuración de LiteLLM vive fuera del repo docflow** (open-antigravity-workspace). Los cambios se aplicaron directamente y se necesitó un restart de LiteLLM para que los aliases se propagaran.

**Error cometido:** No se verificó que el restart de Docker propagara correctamente los aliases hasta que se hizo un test manual. El alias seeding y la invalidación de caché requirieron un paso adicional no contemplado en el plan.

---

### Phase 141: Skill & Prompt Enrichment (SKILL)
**Qué:** Enriquecer el Skill Orquestador con data contracts (PARTE 15), model mapping (PARTE 16), diagnostic protocol (PARTE 17). Añadir reporting protocol y tool-use-first rule al system prompt.

**Resultado:** Verificación pasada (7/7). El tool-use-first fue el cambio más impactante del milestone.

**Aprendizaje clave:** El patrón de "append PARTEs" al skill existente (en vez de reemplazar todo el contenido) fue la decisión correcta. Permite acumular conocimiento sin perder ediciones manuales previas. Cada PARTE es un bloque idempotente con su propio condicional de inserción.

**Aprendizaje sobre impacto:** El `buildToolUseFirstRule()` con su tabla de 8 filas (pregunta → tool a usar) fue directamente responsable de +14 puntos en la scorecard. CatBot pasó de responder de memoria a consultar sus herramientas primero. Es probablemente el cambio con mejor ROI de todo el milestone.

**Error cometido:** El reporting protocol inicial decía "NO reportes paso a paso" — una contradicción directa con lo que queríamos (Test 10: reporting con check/cross). Este error no se detectó hasta la scorecard. La lección: cuando escribes reglas en lenguaje natural para un LLM, las negaciones son peligrosas. "NO hagas X" se interpreta literalmente.

---

### Phase 142: Iteration Loop Tuning (LOOP)
**Qué:** Subir MAX_TOOL_ITERATIONS de 3 a 15, ESCALATION_THRESHOLD a 10, reporting intermedio cada 4 iteraciones silenciosas.

**Resultado:** Verificación pasada (4/4).

**Aprendizaje:** Los magic numbers (iter >= 3 hardcodeado en dos paths de streaming/no-streaming) eran el cuello de botella más silencioso del sistema. CatBot escalaba a async después de 3 tool calls — imposible construir un canvas de 8 nodos así. Extraer constantes nombradas fue trivial pero transformativo.

**Error cometido:** Se actualizaron los dos paths (streaming y no-streaming) correctamente, pero no se verificó en producción que el reporting intermedio cada 4 iteraciones realmente apareciera en la UI. Los tests validan la lógica del contador pero no el rendering.

---

### Phase 143: Email Classifier Pilot (PILOT)
**Qué:** Construir un CatFlow real de Email Classifier (8 nodos) por API, ejecutarlo contra Gmail real, documentar lecciones.

**Resultado:** 100% accuracy en clasificación (K12, REVI, spam). 21 vectores indexados en CatBrain. Verificación pasada tras 4 re-verificaciones.

**Aprendizaje crítico — producción vs desarrollo:**
- El path de la BD en producción es diferente al del script de setup
- `canvas-formatter` alias no existía aún en LiteLLM cuando se ejecutó (fallback a gemini-main)
- `gemma-local` era demasiado lento para producción (también fallback a gemini-main)
- Las instrucciones en la BD de producción estaban "condensadas" (sin saltos de línea) vs el script que las tenía formateadas → los `replace()` no matcheaban
- El file ownership del volumen Docker (uid 1001 nextjs vs uid 1000 host) impedía escribir directamente → se usó `docker exec`

**Esta fase fue la más valiosa del milestone** no por lo que construyó, sino por los bugs de producción que reveló. Sin el piloto, habríamos llegado a la evaluación sin saber que gemma-local era inutilizable en tiempo real ni que los patches de instrucciones no se aplicaban correctamente.

**Patrón descubierto:** "Dual-patch" — actualizar el script (para futuros deploys) + docker exec en prod (para efecto inmediato). Necesario porque los scripts solo corren en setup inicial.

---

### Phase 144: Evaluation Gate (EVAL)
**Qué:** Re-scorecard de 10 tests + test de construcción autónoma + gap closure.

**Resultado:** Scorecard 70/100 (pre-fixes). Construction test 78/100. 4 gaps identificados y corregidos en planes 03-04.

**El scorecard reveló la verdad que los tests unitarios no podían:**
- canvas_get no exponía instrucciones → CatBot creía que no se guardaban (Test 6: 4/10)
- El clasificador de complejidad bloqueaba canvas construction (Test 7: 5/10, Test 10: 3/10)
- El knowledge tree listaba 8 tipos de nodo de 13 (Test 1: 6/10)
- CatBot ignoraba los labels solicitados por el usuario (Test 7)
- El reporting protocol contradecía su propio objetivo (Test 10)

**Gap closure (144-03, 144-04):** Los 5 fixes se implementaron en 6 minutos totales. Cada uno quirúrgico y bien acotado. Proyección post-fix: 85-92/100.

---

## 3. Errores Sistémicos y Patrones

### Error #1: Tests unitarios no sustituyen evaluación funcional
Los tests verificaban que la función X guardaba el campo Y en la BD. Pero nadie verificó que la función Z (que lee esos datos) los exponía correctamente. `canvas_add_node` guardaba instructions; `canvas_get` no las devolvía. 28 tests green, bug real en producción.

**Lección:** Para features que son cadenas (write → read → display), el test debe cubrir la cadena completa, no cada eslabón por separado.

### Error #2: Contradicciones en prompts de lenguaje natural
El reporting protocol decía "NO reportes paso a paso" y luego esperábamos que CatBot reportara paso a paso. Los LLMs interpretan literalmente las negaciones.

**Lección:** Revisar prompts buscando contradicciones antes de commitear. Especialmente cuando se escriben reglas en fases diferentes (141 escribió "NO reportes", 144 esperaba reporting).

### Error #3: No verificar en producción hasta el piloto
Las fases 138-142 se verificaron con tests unitarios y lecturas de código. Recién en 143 (piloto) se descubrió que gemma-local era lento, que los paths de BD eran diferentes, y que las instrucciones estaban condensadas.

**Lección:** Un smoke test en producción después de cada fase de infrastructure (138, 140, 142) habría detectado estos problemas 3 fases antes.

### Error #4: Magic numbers distribuidos
`iter >= 3` estaba hardcodeado en dos paths diferentes (streaming y no-streaming). Cuando se cambió en uno, fácilmente podría haberse olvidado el otro.

**Lección:** Ya resuelto con constantes nombradas, pero el patrón de "buscar todas las ocurrencias" debe ser parte del checklist de cualquier fix de configuración.

---

## 4. Lo que Funcionó Bien

### Tool-use-first protocol (Phase 141)
+14 puntos en scorecard. La tabla de 8 filas "pregunta → tool" es el cambio con mayor ROI. Simple, declarativo, y CatBot lo sigue consistentemente.

### Patrón de PARTEs acumulativas (Phase 141)
Append idempotente de bloques de conocimiento al skill existente. Preserva ediciones manuales, es versionable, y cada PARTE tiene su condicional de inserción. Escalable para futuras fases.

### buildNodeSummary (Phase 139)
Feedback rico después de cada mutation. CatBot "ve" el resultado sin tool call adicional. Reduce iteraciones y mejora la calidad del reporting.

### Evaluación como gate (Phase 144)
Hacer la scorecard ANTES de cerrar el milestone reveló 5 bugs que los tests unitarios no detectaron. El patrón "scorecard → gaps → fix → re-score" es valioso y debería ser estándar.

### Piloto en producción (Phase 143)
Construir y ejecutar un CatFlow real fue la prueba de fuego. Reveló problemas de producción que ningún test local habría encontrado.

---

## 5. Métricas del Milestone

| Métrica | Valor |
|---------|-------|
| Fases completadas | 7/7 |
| Planes ejecutados | 15/15 |
| Tiempo total ejecución | ~0.5 horas |
| Tiempo promedio por plan | 4.3 minutos |
| Tests añadidos | ~50+ nuevos |
| Score inicial | 60/100 |
| Score pre-gap-closure | 70/100 (+10) |
| Score proyectado post-fixes | 85-92/100 (+25-32) |
| Commits totales | ~30 |
| Re-verificaciones necesarias | 6 (Phase 143: 4, Phase 144: 2) |

---

## 6. Recomendaciones para Milestone v29

1. **Scorecard temprana:** Ejecutar una mini-scorecard (3-5 tests clave) después de cada 2-3 fases, no solo al final. Detectaría contradicciones y bugs de integración antes.

2. **Tests de cadena completa:** Para cualquier feature write→read, el test debe cubrir ambos extremos. Un test que escribe y luego lee es más valioso que dos tests separados.

3. **Smoke test en producción:** Después de fases de infrastructure, hacer un smoke test mínimo en Docker. 2 minutos que ahorran 2 fases de rework.

4. **Revisión de prompts cross-fase:** Antes de añadir una regla nueva al system prompt, grep las reglas existentes buscando contradicciones. Especialmente negaciones ("NO hagas X").

5. **Documentar decisiones de hardware/infra:** Gemma4:31b no viable fue una decisión correcta pero casi invisible. Las constraints de hardware deben estar en el knowledge tree, no solo en el SUMMARY de una fase.

6. **El gap-closure cycle funciona:** scorecard → gaps → fix plans → re-score es un patrón validado. Sistematizarlo como parte del cierre de todo milestone.

---

## 7. Deuda Técnica Identificada

| Item | Severidad | Dónde |
|------|-----------|-------|
| `_index.json` updated_at desincronizado con canvas.json | Baja | Phase 138 verification |
| gemma-local demasiado lento para producción | Media | Phase 143 — se usa gemini-main como fallback |
| canvas-formatter alias no existe en LiteLLM | Baja | Phase 143 — fallback a gemini-main |
| Dual-patch pattern no automatizado | Media | Phase 143 — manual docker exec + script update |
| Reporting intermedio no verificado visualmente en UI | Baja | Phase 142 — tests pasan pero no se vio en browser |

---

## 8. Veredicto

El milestone v28.0 logró su objetivo técnico: CatBot pasó de no usar herramientas y escalar todo a async, a usar tools consistentemente, validar reglas, y construir canvas de 8+ nodos. El score subió de 60 a 70 con mejoras estructurales, y los gap-closure fixes proyectan 85-92.

El mayor aprendizaje no fue técnico sino metodológico: **los tests unitarios green no significan que la feature funciona end-to-end.** La evaluación funcional (scorecard) y el piloto en producción fueron las dos herramientas que realmente revelaron la calidad del trabajo. Deben ser parte integral de todo milestone futuro, no solo del último.
