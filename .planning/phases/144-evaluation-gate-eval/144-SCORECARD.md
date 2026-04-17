# Scorecard CatBot v28.0
Fecha: 2026-04-17
Score anterior: 60/100

---

## Test 1: Tipos de nodos
**Prompt:** "Que tipos de nodos puedo usar en un Canvas? Lista todos los disponibles con descripcion."
**Tools usadas:** Ninguna (respondio de knowledge/prompt)
**Respuesta (extracto):** Listo 8 tipos: AGENT, CONNECTOR, PROJECT, CONDITION, ITERATOR, MERGE, CHECKPOINT, OUTPUT. Cada uno con descripcion precisa. Menciono que iterator se empareja con iterator_end.
**Puntuacion:** 6/10
**Justificacion:** Lista 8 tipos con descripciones correctas. No menciona: START (tipo basico), STORAGE, SCHEDULER, MULTIAGENT, CATPAW. 8/13 tipos reales. Segun rubrica: menos de 12 tipos incluyendo storage/scheduler/multiagent = 4-7 rango. Da 6 porque las descripciones son precisas y menciona iterator_end indirectamente, pero omite 5 tipos.

---

## Test 2: Busqueda de recursos (CatPaws)
**Prompt:** "Que CatPaws pueden enviar emails?"
**Tools usadas:** list_cat_paws
**Respuesta (extracto):** Identifico correctamente: Ejecutor Gmail (principal para envio), Maquetador Email, Respondedor Inbound, Derivador Inbound, Clasificador Inbound, Redactor de Informe. Explico el rol de cada uno en el pipeline de email.
**Puntuacion:** 10/10
**Justificacion:** Uso list_cat_paws tool (mejora vs auditoria original donde NO usaba tools). Respuesta correcta y completa. Cumple rubrica: usa tool Y responde correctamente = 10.

---

## Test 3: Config completa (Plantillas)
**Prompt:** "Que plantillas de email tengo y cuales estan vacias? Listamelas todas."
**Tools usadas:** list_email_templates, get_email_template
**Respuesta (extracto):** Listo 15 plantillas totales organizadas en "Activas" (9 con uso) y "Vacias" (6 sin uso). Identifico duplicados de Pro-* creados recientemente. Propuso accion (eliminar duplicados).
**Puntuacion:** 9/10
**Justificacion:** Uso list_email_templates Y get_email_template (mejora significativa). Listo todas las plantillas con conteo de usos. Detecto duplicados. Solo pierde 1 punto porque interpreto "vacias" como "sin usos" en vez de "sin contenido/estructura" que era la intencion original.

---

## Test 4: Planificacion
**Prompt:** "Disena un CatFlow para procesar emails entrantes y responder con la plantilla correcta segun el producto"
**Tools usadas:** get_skill, list_email_connectors, list_email_templates
**Respuesta (extracto):** Clasifico como COMPLEXITY:complex. Propuso arquitectura de 5 nodos: START -> Clasificador de Producto -> Condition (Enrutador) -> Redactor con Plantilla -> Connector Gmail. Menciono plantillas Pro-K12, Pro-Simulator, Pro-REVI, Pro-Educaverse y conectores disponibles. Pregunto confirmacion antes de ejecutar.
**Puntuacion:** 8/10
**Justificacion:** Buen diseno con 5 nodos bien pensados. Uso tools de listado para fundamentar la propuesta. Consulto skill Orquestador. Pierde 2 puntos: propuso 5 nodos (no 7+), no incluyo data contracts explicitos entre nodos (solo menciono "JSON con to, subject, html_body"), y falta iterator para multiples emails.

---

## Test 5: Crear canvas
**Prompt:** "Crea un canvas llamado 'Eval Test v28' en modo mixed"
**Tools usadas:** canvas_create
**Respuesta (extracto):** "He creado el canvas Eval Test v28 en modo mixed." Confirmo creacion con nodo START implicito.
**Puntuacion:** 10/10
**Justificacion:** Creo correctamente y confirmo con START. Tool canvas_create ejecutada. Cumple rubrica completa.

---

## Test 6: Anadir nodo + edge
**Prompt:** "En el canvas 'Eval Test v28', anade un nodo AGENT 'Clasificador de Producto' con instrucciones [INPUT/OUTPUT/mapeo] y conecta START al Clasificador."
**Tools usadas:** get_skill, canvas_get, canvas_add_node, canvas_add_edge
**Respuesta (extracto):** Confirmo creacion del nodo con ID rrl7t71a3 y conexion desde Inicio. Reporto: "Instrucciones aplicadas: Clasificacion de emails por producto con template_id y salida estructurada en JSON."
**Verificacion posterior:** Al consultar las instrucciones del nodo, CatBot reporto: "no hay instrucciones configuradas (el campo esta vacio)".
**Puntuacion:** 4/10
**Justificacion:** Edge correcto (START -> Clasificador). CatBot reporto que las instrucciones fueron aplicadas, pero al verificar con canvas_get, las instrucciones NO persistieron. Esto es el mismo bug de la auditoria original (gap #3). Segun rubrica: instrucciones se pierden = 3, pero edge ok sube a 4.

---

## Test 7: Multiples nodos + edges
**Prompt:** "En el canvas 'Eval Test v28', anade: 1) Condition 'Tiene producto?', 2) OUTPUT 'Descartado', 3) OUTPUT 'Procesado'. Conecta Clasificador->Condition, Condition[no]->Descartado, Condition[yes]->Procesado."
**Tools usadas (intento 1):** Ninguna - escalo a async: "Tarea compleja (~1min). Preparo CatFlow asincrono?"
**Tools usadas (intento 2, forzado sync):** canvas_get, canvas_add_node x3, canvas_add_edge x3
**Respuesta (extracto):** Ejecuto sincronamente con 7 tool calls. Pero creo nodos con nombres diferentes: "Evaluacion de Calidad" (condition), "Generador de Reportes" (agent), "Salida Final" (output). Solo creo 1 OUTPUT en vez de 2. Solo conecto rama "yes", falta rama "no".
**Puntuacion:** 5/10
**Justificacion:** Mejora significativa: cuando se fuerza sync, ejecuta 7 tool calls sin problema (antes escalaba siempre). Pero: 1) Cambio los nombres solicitados, 2) Creo solo 1 OUTPUT en vez de 2, 3) Falta rama "no" del condition, 4) Creo un agent en vez de output. Segun rubrica: construye sincronamente pero con errores = 5. No escalo a async al insistir (mejora vs sourceHandle test).

---

## Test 8: Verificacion canvas
**Prompt:** "Muestrame el canvas 'Eval Test v28' completo con todos los nodos y conexiones"
**Tools usadas:** canvas_get
**Respuesta (extracto):** Reporto 5 nodos: Inicio (start), Clasificador de Producto (agent), Evaluacion de Calidad (condition), Generador de Reportes (agent), Salida Final (output). 4 conexiones: Inicio->Clasificador, Clasificador->Evaluacion, Evaluacion[yes]->Generador, Generador->Salida Final. Incluyo posiciones y sugerencias de modelo por tier.
**Puntuacion:** 8/10
**Justificacion:** Reporto correctamente todos los nodos existentes, edges y sourceHandle (yes en condition). Incluyo posiciones. Agrego sugerencias de modelo por tier (detalle util). Pierde 2 porque el canvas subyacente no es el solicitado (falta "no" branch y segundo OUTPUT), pero el reporte de lo que existe es fiel.

---

## Test 9: Recuperacion de errores
**Prompt:** "En el canvas 'Eval Test v28', conecta un nodo AGENT despues del nodo OUTPUT 'Salida Final'"
**Tools usadas:** get_skill, canvas_get, canvas_add_node, canvas_add_edge
**Respuesta (extracto):** "Atencion: El canvas no me permite conectar un nodo despues de Salida Final porque los nodos de tipo OUTPUT son terminales y no pueden tener conexiones de salida. He creado el nodo AGENT (como 'Nuevo Agente'), pero no he podido hacer la conexion."
**Puntuacion:** 7/10
**Justificacion:** MEJORA SIGNIFICATIVA vs auditoria original (score 2). Ahora detecta que OUTPUT es terminal y lo comunica claramente al usuario. Sin embargo, creo el nodo innecesariamente antes de intentar la conexion (deberia haber validado primero). Segun rubrica: advierte y no ejecuta la conexion = entre 5 y 10. Da 7 porque la deteccion es correcta pero la creacion preventiva del nodo es un efecto secundario no deseado.

---

## Test 10: Reporting paso a paso
**Prompt:** "Crea un canvas nuevo 'Eval Reporting Test' en modo mixed y construye un mini-flujo: START -> Agent 'Lector' -> Condition 'Hay datos?' -> OUTPUT 'Vacio' y OUTPUT 'Listo'. Reporta despues de cada accion."
**Tools usadas (intento 1):** Ninguna - escalo a async: "Tarea compleja (~2min)"
**Tools usadas (intento 2, forzado sync):** Pidio detalles de nuevo (perdio contexto)
**Tools usadas (intento 3, detalles repetidos):** Escalo a async de nuevo
**Tools usadas (intento 4, instruccion directa tool names):** canvas_create (solo 1 paso)
**Tools usadas (intento 5, solo 2 ops):** canvas_get, canvas_add_node, canvas_add_edge (lo hizo)
**Respuesta final (extracto):** Creo canvas y luego anadio nodo Lector + edge cuando se pidio paso a paso en solicitudes pequenas. NO reporto con check/cross. Requirio 5 interacciones para completar una tarea que deberia ser 1.
**Puntuacion:** 3/10
**Justificacion:** El clasificador de complejidad bloquea tareas de 4+ nodos como "complex" y fuerza escalamiento async. No demostro reporting con check/cross. Requirio multiples intentos. Creo el canvas pero no lo completo en una sola interaccion. Segun rubrica: no reporta paso a paso = 3.

---

## Score Total

| Test | Nombre | Antes | Ahora | Delta |
|------|--------|-------|-------|-------|
| 1 | Tipos de nodos | 7 | 6 | -1 |
| 2 | Busqueda de CatPaws | 4 | 10 | +6 |
| 3 | Plantillas de email | 5 | 9 | +4 |
| 4 | Planificacion | 9 | 8 | -1 |
| 5 | Crear canvas | 8 | 10 | +2 |
| 6 | Nodo + edge | 5 | 4 | -1 |
| 7 | Multiples nodos | 3 | 5 | +2 |
| 8 | Verificacion canvas | 8 | 8 | 0 |
| 9 | Recuperacion errores | 2 | 7 | +5 |
| 10 | Reporting paso a paso | 3 | 3 | 0 |
| **TOTAL** | | **60** | **70** | **+10** |

---

## Analisis de Resultados

### Mejoras significativas (+6, +5, +4, +2, +2)
1. **Test 2 (+6):** CatBot ahora USA list_cat_paws tool en vez de responder de memoria. Mejora directa de Phase 141 (tool-use-first protocol).
2. **Test 9 (+5):** CatBot ahora DETECTA que OUTPUT es terminal y lo comunica. Mejora directa de Phase 138 (validacion de reglas en canvas_add_edge).
3. **Test 3 (+4):** CatBot ahora USA list_email_templates y get_email_template. Misma mejora de tool-use-first.
4. **Test 5 (+2):** Creacion de canvas limpia y confirmada.
5. **Test 7 (+2):** Cuando se fuerza sync, ejecuta multiples tool calls correctamente (7 en una iteracion).

### Sin cambio (0) o regresion (-1)
1. **Test 1 (-1):** Sigue sin listar todos los tipos (falta storage/scheduler/multiagent/start). El knowledge tree no se actualizo con los tipos nuevos.
2. **Test 4 (-1):** Diseno ligeramente menos ambicioso (5 nodos vs 7+ que propuso antes). Pero mas realista.
3. **Test 6 (-1):** Las instrucciones SIGUEN sin persistir en canvas_add_node. Bug critico no resuelto.
4. **Test 8 (0):** Verificacion sigue funcionando bien.
5. **Test 10 (0):** Reporting paso a paso sigue sin funcionar. El clasificador de complejidad bloquea.

### Gaps criticos restantes
1. **Instrucciones no persisten (Test 6):** canvas_add_node no guarda instructions en la BD. Score 4/10.
2. **Clasificador de complejidad demasiado agresivo (Test 7, 10):** Tareas de 4+ nodos se escalan automaticamente a async, impidiendo construccion sincrona con feedback.
3. **Nombres de nodos ignorados (Test 7):** CatBot cambio los nombres solicitados por otros diferentes.
4. **Falta reporting check/cross (Test 10):** El protocolo de Phase 141 no se activa consistentemente.

### Veredicto del Gate
**Score: 70/100 -- NO APRUEBA el gate de 85/100.**

La mejora es de +10 puntos (60 -> 70). Las fases 138-143 mejoraron significativamente el uso de tools (+14 puntos en tests 2, 3, 9) pero los bugs criticos de persistencia de instrucciones y el clasificador de complejidad agresivo impiden alcanzar el objetivo.

### Proximos pasos recomendados
1. **Fix canvas_add_node instrucciones** -- Bug critico, deberia subir Test 6 de 4 a 9-10 (+5-6 puntos)
2. **Ajustar clasificador complejidad** -- Permitir sync para <8 tool calls, deberia subir Tests 7 y 10 (+5-7 puntos)
3. **Actualizar knowledge con tipos de nodo completos** -- Subir Test 1 de 6 a 9 (+3 puntos)
4. **Forzar uso de labels solicitados** -- Subir Test 7 (+2 puntos)

Con estos fixes, score estimado: 85-92/100.
