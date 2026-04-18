# Auditoría CatFlow — Informe Completo

**Fecha:** 2026-04-17
**Generado por:** Claude Code (Opus 4.6)
**Versión DoCatFlow:** 0.1.0

---

## 1. Motor de Canvas — Cómo funciona realmente

### 1.1 Ejecución por tipo de nodo

La función central es `dispatchNode()` (canvas-executor.ts L481) con un `switch (node.type)`:

| Tipo | Líneas | Lógica |
|------|--------|--------|
| `start` | 492-503 | Devuelve `external_input` del trigger o `data.initialInput` |
| `agent` | 505-581 | Con CatPaw activo → `executeCatPaw()`. Sin CatPaw → `callLLM()` directo |
| `catpaw` | 583-613 | Siempre `executeCatPaw()` |
| `catbrain`/`project` | 615-685 | `executeCatBrain()`. Caso especial: `seed-catbrain-websearch` → `executeWebSearch()` |
| `connector` | 687-1392 | Switch interno por `connector.type`: gmail, google_drive, email_template, mcp_server, http_api, genérico |
| `checkpoint` | 1394-1397 | Devuelve `predecessorOutput`, el loop principal maneja la pausa |
| `merge` | 1399-1434 | Concatena entradas. Si tiene `model`, llama `callLLM()` para sintetizar |
| `condition` | 1436-1457 | Llama `callLLM()` con "Responde SOLO con yes o no" + `normalizeConditionAnswer()` |
| `output` | 1459-1529 | Formatea output, puede crear notificación y disparar trigger chains |
| `scheduler` | 1531-1572 | 3 modos: delay, count, listen |
| `storage` | 1574-1675 | Guarda a archivo y/o vía conector |
| `multiagent` | 1677-1797 | Lanza ejecución de otro canvas completo |
| `iterator` | 1799-1866 | Parsea array, emite item por iteración |
| `iterator_end` | 1868-1871 | Passthrough, lógica en main loop |

### 1.2 Flujo de datos entre nodos

- **Transporte:** Siempre `string` vía `getPredecessorOutput()` (L249), pero puede contener JSON válido
- **Transformaciones entre nodos:**
  - `cleanLlmOutput()` (L214): elimina wrappers markdown ` ```json ``` `
  - `mergePreserveFields()` (L230): si input y output son JSON, hace `{...input, ...output}` (safety net R10)
- **No hay validación de schema entre nodos** — si JSON no es válido, funciones devuelven output original sin modificar

### 1.3 Agente SIN CatPaw

- Modelo: `data.model` del nodo o fallback `resolveAlias('canvas-agent')`
- System prompt: `"Eres un agente especializado. {instructions}\nResponde siempre en español."`
- max_tokens: **8000** (L163)
- Temperature: 0.7

### 1.4 Agente CON CatPaw

- Detecta CatPaw activo vía SQL (L511)
- Llama `executeCatPaw(agentId, pawInput, { extraSkillIds, extraConnectorIds, extraCatBrainIds })`
- Input: `query = instructions || predecessorOutput`, `context = predecessorOutput`

### 1.5 Nodo Connector — 100% determinístico

**NO usa LLM para decidir.** Todo basado en:

| Conector | Cómo decide la acción |
|----------|----------------------|
| Gmail | Parsea JSON buscando `accion_final` → mark_read, forward, send_reply, send_report |
| Google Drive | Lee `data.drive_operation` del nodo (upload, download, list, create_folder) |
| Email Template | Lee `data.template_id` o `config.default_template_id` |
| MCP Server | Lee `data.tool_name` o `connConfig.tool_name` |
| HTTP API | Lee `connConfig.method`, `url`, templates |
| Genérico/n8n | POST al webhook |

**Gmail sí puede enviar HTML** — `html_body` soportado en send_reply y send_report.
**Fallback seguro:** en caso de error o datos inesperados, el conector devuelve `predecessorOutput` sin modificar.

### 1.6 Nodo Condition — Usa LLM

- System: "Eres un evaluador de condiciones. Responde SOLO con 'yes' o 'no'."
- Usa `normalizeConditionAnswer()` (L55) con soporte multilingüe (sí/no/afirmativo/negativo)
- Default conservador: si no reconoce respuesta → `'no'`

### 1.7 Timeouts y límites

- **No hay timeout explícito por nodo** para llamadas LLM
- **max_tokens en callLLM:** fijo **8000**
- **Timeout conectores:** configurable, default **30 segundos**
- **Timeout MCP:** initialize/list 10s, call 30s

### 1.8 Manejo de errores

- **Fuera de iterator:** nodo falla → **todo el run se detiene** (L2357-2378)
- **Dentro de iterator:** error se acumula, **ejecución continúa** con siguiente item (ITER-03)
- **Storage errors:** no-fatales, se loguean

---

## 2. Inventario de recursos

### Modelos disponibles (LiteLLM)

| Modelo | Tipo |
|--------|------|
| claude-opus | Anthropic |
| claude-sonnet | Anthropic |
| gemini-main | Google |
| gemini-search | Google (grounding) |
| gpt-5.4 | OpenAI |
| gpt-5.4-pro | OpenAI |

**No hay modelos libres/locales** (Gemma, Llama, Mistral, Phi, Qwen no configurados).
**Modelo por defecto de Agent sin CatPaw:** `resolveAlias('canvas-agent')` — típicamente gemini-main.

### CatPaws (37 activos)

#### Relevantes para email/canvas

| Nombre | ID (8 chars) | Modo | Modelo | Departamento |
|--------|-------------|------|--------|--------------|
| Ejecutor Gmail | 65e3a722 | processor | gemini-main | production |
| Respondedor Inbound | 1ea583c0 | processor | gemini-main | business |
| Maquetador Email | e9860d40 | processor | gemini-main | business |
| Clasificador Inbound | 22869eb0 | processor | gemini-main | business |
| Derivador Inbound | 3824a842 | processor | gemini-main | business |
| Redactor Email Notificación | ea15eff9 | processor | gemini-main | business |
| Consultor CRM | b63164ed | processor | gemini-main | business |
| Filtro CRM | 0ee9dc5c | processor | gemini-main | business |
| Analista de Facturas | a3c5df1e | processor | gemini-main | other |
| MCP_Holded | 5d8fbdd7 | chat | gemini-main | finance |

#### Otros CatPaws notables

| Nombre | Modo | Modelo | Departamento |
|--------|------|--------|--------------|
| Asistente Drive | processor | gemini-main | production |
| Gestor Drive Leads | processor | gemini-main | production |
| Director Comercial IA | chat | gemini-main | business |
| Estratega ICP | processor | gemini-main | business |
| Experto de Negocio Educa360 | processor | gemini-main | direction |
| 4× Redactor de Informe | processor | gemini-main | other |

### Skills (43)

| Categoría | Count | Ejemplos destacados |
|-----------|-------|---------------------|
| sales | 12 | Scoring Oportunidades, Secuencia Outbound, ICP, Discovery |
| strategy | 8 | Arquitecto de Agentes, Maquetador de Email, Business Case |
| analysis | 4 | Análisis Competitivo, Investigación Profunda |
| format | 5 | Output Estructurado, Holded ERP Guía, Voz de Marca |
| technical | 5 | Revisor de Código, Tests unitarios, Documentador APIs |
| writing | 6 | Email Profesional, Contenido Redes Sociales, Propuestas |
| system | 2 | **Orquestador CatFlow**, **Protocolo creación CatPaw** |

### Conectores (12)

| Nombre | Tipo | Uso |
|--------|------|-----|
| Antonio Educa360 | gmail | OAuth2 activo |
| Antonio Sierra Sánchez | gmail | OAuth2 activo |
| Info Educa360 | gmail | OAuth2 activo |
| Info_Auth_Educa360 | gmail | OAuth2 activo |
| Educa360Drive | google_drive | Archivos |
| Holded MCP | mcp_server | ERP |
| LinkedIn Intelligence | mcp_server | Leads |
| SearXNG Web Search | http_api | Búsqueda |
| Gemini Web Search | http_api | Búsqueda |
| Plantillas Email Corporativas | email_template | ×2 (seed + b3f4bfcd) |
| Test n8n | n8n_webhook | Test |

### Plantillas de email (11)

| Nombre | Categoría | Uso |
|--------|-----------|-----|
| Corporativa Educa360 | corporate | Template principal |
| Plantilla Corporativa | corporate | Alternativa |
| Pro-Educaverse | commercial | Producto Educaverse |
| Pro-K12 | commercial | Producto K12 |
| Pro-REVI | commercial | Producto REVI |
| Pro-Simulator | commercial | Producto Simulator |
| Respuesta Comercial | commercial | Genérica ventas |
| Informe de Leads | report | Reporting |
| Notificación Interna | notification | Alertas internas |
| CatBot | general | CatBot messages |
| Test Template | commercial | Testing |

### CatBrains con RAG

| Nombre | RAG habilitado | Sources |
|--------|---------------|---------|
| DoCatFlow | Sí | 267 |
| Educa360 | Sí | 8 |
| WebSearch | No | 0 |

### Canvases existentes (7)

| Nombre | Modo | Nodos |
|--------|------|-------|
| Revisión Diaria Inbound — Educa360 | mixed | 14 |
| TEST Inbound — Fase 5: Full Pipeline | mixed | 11 |
| Prospección Outbound — Educa360 | mixed | 19 |
| Lead Hunting Educa360 | mixed | 13 |
| Informe Diario de Negocio — 14:00 | mixed | 10 |
| Canal de Mando — //negocio:educa360 | mixed | 13 |
| Análisis Comparativo Facturación Q1 | mixed | 9 |

### Ejecuciones recientes (últimos 20 runs)

| Canvas | Status | Runs en muestra | Duración media |
|--------|--------|-----------------|----------------|
| TEST Inbound Fase 5 | completed | 16/17 (1 cancelled) | ~75s |
| Análisis Comparativo Q1 | completed | 3/3 | ~99s |
| Revisión Diaria Inbound | — | 0 en últimos 20 | — |

**Observación clave:** El canvas Q1 (creado por CatBot/Architect) **funciona 3/3 veces** cuando consigue crearse. El problema no es ejecución sino diseño/creación.

---

## 3. Inteligencia actual de CatBot — Tests y resultados

### Test 1: Conocimiento de tipos de nodos ✅

**Pregunta:** "¿Qué tipos de nodos puedo usar en un Canvas?"
**Respuesta:** Listó 8 tipos correctamente (agent, connector, condition, merge, iterator, project, checkpoint, output) con descripciones precisas.
**Evaluación:** Conoce los tipos principales. No mencionó: storage, scheduler, multiagent, catpaw, iterator_end. 8/12 tipos.

### Test 2: CatPaws de email ⚠️

**Pregunta:** "¿Qué CatPaws pueden enviar emails?"
**Tools usadas:** Ninguna visible (`tools_used: []`)
**Respuesta:** Identificó correctamente Ejecutor Gmail, Respondedor Inbound, Maquetador Email con IDs reales.
**Evaluación:** IDs correctos. Pero no usó `list_cat_paws` — respondió de memoria/knowledge tree. Esto funciona hoy pero no escalaría si se añaden nuevos CatPaws.

### Test 3: Plantillas vacías ⚠️

**Pregunta:** "¿Qué plantillas de email tengo y cuáles están vacías?"
**Tools usadas:** Ninguna visible
**Respuesta:** Preguntó si eliminar "Test Template" (la vacía), pero **no listó todas las plantillas**.
**Evaluación:** No usó `list_email_templates`. Respuesta incompleta — no reportó el inventario completo.

### Test 4: Diseño CatFlow complejo ✅

**Pregunta:** "Diseña un CatFlow para procesar emails y responder con la plantilla correcta"
**Clasificación:** `COMPLEXITY:complex`
**Respuesta:** Diseño de 7+ nodos con: Lector Gmail → Condition (¿hay emails?) → Iterator → Clasificador de Producto → mapeo template-producto (Pro-Educaverse, Pro-K12, Pro-REVI, Pro-Simulator con IDs reales) → Maquetador → Ejecutor Gmail
**Evaluación:** Excelente. Planifica antes de actuar. Conoce las plantillas por producto. Propone iterator correctamente. Menciona JSON output estricto.

### Test 5: Crear canvas vacío ✅

**Pregunta:** "Crea canvas 'Audit Test' en modo mixed"
**Respuesta:** Creó correctamente con nodo START. Confirmó creación.
**Evaluación:** Funciona. Pero `tools_used: []` — no reporta qué tools ejecutó internamente.

### Test 6: Añadir nodo + edge ⚠️

**Pregunta:** "Añade nodo AGENT 'Clasificador' con instrucciones + conecta START"
**Respuesta:** Confirmó creación.
**Evaluación:** Nodo creado y edge conectado. PERO en la verificación posterior (Q8), las instrucciones NO estaban configuradas en el nodo. El nodo se creó pero las instrucciones se perdieron.

### Test 7: Múltiples nodos + edges ❌

**Pregunta:** "Añade Condition + 2 OUTPUT + 3 edges"
**Intento 1:** Pidió nombre del canvas (perdió contexto conversacional).
**Intento 2 (con nombre):** Escaló a CatFlow asíncrono — "Esta tarea ha resultado más compleja de lo esperado."
**Evaluación:** **No puede crear 3 nodos + 3 edges en una sesión síncrona.** El maxIterations=8 + self-check escalation a iter 3+ provoca que tareas de ~6 tool calls se escalen a async. Sin embargo, **el resultado async SÍ funcionó** — Q8 verificó que los 5 nodos estaban correctos con sourceHandle yes/no.

### Test 8: Verificación canvas ✅

**Pregunta:** "Muéstrame el canvas 'Audit Test' completo"
**Respuesta:** Reportó correctamente 5 nodos, 4 conexiones, sourceHandle yes/no en condition.
**Evaluación:** `canvas_get` funciona bien. El canvas se construyó correctamente (a pesar de ser escalado a async).

### Test 9: Recuperación de errores ❌

**Pregunta:** "Conecta un nodo AGENT después del OUTPUT 'Procesar'"
**Respuesta:** Lo hizo sin detectar que **no se puede conectar después de un OUTPUT**.
**Evaluación:** NO detectó el error lógico. Conectó el nodo después del OUTPUT sin cuestionar. Falta validación de reglas de canvas en CatBot.

### Test 10: Reporting paso a paso ⚠️

**Pregunta:** "Construye mini-flujo paso a paso, reporta después de cada acción"
**Respuesta:** Clasificó como `COMPLEXITY:complex` y preguntó si limpiar el canvas primero o crear uno nuevo.
**Evaluación:** Buena detección de conflicto (canvas ya tiene nodos), pero **no ejecutó paso a paso como se pidió** — pidió decisión al usuario en vez de empezar. No demostró reporting iterativo.

### Scorecard de CatBot

| Capacidad | Puntuación (0-10) | Notas |
|-----------|-------------------|-------|
| Conoce tipos de nodos | 7 | 8/12 tipos, falta storage/scheduler/multiagent/iterator_end |
| Busca recursos antes de crear | 4 | Usa knowledge tree, no tools de listado (list_cat_paws, list_email_templates) |
| Crea nodos con config completa | 5 | Crea pero instrucciones se pierden a veces |
| Conecta nodos correctamente | 8 | sourceHandle yes/no correcto en condition |
| Usa sourceHandle en Condition | 9 | Correcto en todos los tests |
| Asigna CatPaw cuando necesario | 7 | IDs correctos, pero no siempre busca primero |
| Configura skills/conectores extra | 6 | Dice que lo hace pero difícil verificar |
| Reporta progreso paso a paso | 3 | No demostró reporting iterativo; escaló o pidió decisión |
| Recupera de errores | 2 | No detectó error lógico (conectar después de OUTPUT) |
| Planifica antes de construir | 9 | Q4 excelente diseño con template mapping |
| **TOTAL** | **60/100** | |

---

## 4. Skill Orquestador — Análisis de gaps

### Contenido actual (resumen)

La skill "Orquestador Inteligente DoCatFlow v2.0" es **muy completa**:
- Protocolo de 6 pasos para crear canvas
- Árbol de decisión para tipo de nodo
- Regla de oro: "¿Necesita RAZONAR? → CatPaw. ¿Solo EJECUTAR? → Connector directo"
- Patrones de nodos con campos `data` exactos
- Ejemplo completo del flujo Lead Hunting
- 8 errores comunes documentados + tabla de diagnóstico de 10+ síntomas
- Template para system prompts (ROL, MISIÓN, PROCESO, CASUÍSTICA, OUTPUT)

### Lo que le falta

1. **Mapeo template-producto** — No tiene tabla de qué plantilla usar para qué producto (Pro-Educaverse → 155c955e, etc.)
2. **Modelos recomendados por tipo de nodo** — Solo sugiere temperatura, no qué modelo usar
3. **Reglas de validación de canvas** — No dice "no puedes conectar después de un OUTPUT" ni "iterator necesita iterator_end"
4. **Protocolo de reporting paso a paso** — No define cuándo informar al usuario del progreso
5. **Límite de maxIterations** — No menciona que CatBot tiene solo 8 iteraciones y que canvases complejos escalan a async
6. **Instrucciones para nodos específicos** — Tiene template genérico pero no instrucciones probadas para: Lector Gmail, Clasificador, Maquetador
7. **Patrones de data contracts entre nodos** — No define qué JSON debe pasar cada nodo al siguiente

### Skill "Arquitecto de Agentes" — OK

Protocolo de 5 pasos bien definido: buscar existentes → consultar skills → diseñar config → confirmar → crear y vincular. Incluye guía de departamentos, modos, temperatura y formatos.

### System Prompt de CatBot

- **maxIterations:** 8 (insuficiente para canvas 8+ nodos)
- **Self-check escalation:** después de iter 3+ con tool_calls → escala a CatFlow async
- **Budget de prompt:** Elite 64K chars, Pro 32K, Libre 16K
- **Canvas protocols:** lista 8 tools canvas_*, protocolo SIEMPRE canvas_get primero
- **Knowledge protocol:** cadena query_knowledge → search_documentation → log_knowledge_gap
- **No tiene:** protocolo explícito de reporting paso a paso

---

## 5. Ingeniería inversa — Canvas que funcionan vs los de CatBot

### Patrón del canvas "Revisión Diaria Inbound" (MANUAL, 14 nodos)

```
START → Lector Emails → ¿Hay emails? 
  [no] → Sin emails (output)
  [yes] → Iterator → Clasificador → Respondedor → Maquetador → Ejecutor Gmail → Fin iteración
        → Storage (log) → Redactor Informe → Ejecutor Informe Gmail → Revisión Completada
```

**Características clave:**
- Todos los agents usan modelo `gemini-main` explícito
- Todos los nodos tienen labels descriptivos
- Instrucciones de 128-749 chars con formato PASO 1/2/3
- CatPaws con conectores específicos vinculados
- Instrucciones referencian tools por nombre (gmail_search_emails, render_email_template)

### Diferencias con canvas de CatBot (Análisis Comparativo Q1)

| Característica | Manual | CatBot |
|----------------|--------|--------|
| Labels en nodos | Siempre presentes y descriptivos | **AUSENTES** |
| Modelo explícito | `gemini-main` en todos | **`default`** (no especificado) |
| Formato instrucciones | PASO 1/2/3, condiciones, JSON output | INPUT/{}/PROCESO:/OUTPUT:{} (más abstracto) |
| Longitud instrucciones | 200-1685 chars | 84-364 chars (más cortas) |
| Nodos connector | connectorId configurado | A veces sin connectorId |
| Self-healing | No necesario | Guard + reparador inyectados por architect |

### Observación crítica

**El canvas de CatBot funciona (3/3 ejecuciones completadas)** pero es de menor calidad UX: ilegible en el editor visual, modelo default puede rutear inesperadamente, instrucciones menos operativas.

---

## 6. Pipeline de email — Estado técnico real

### 6.1 Gmail tools disponibles en CatPaw (execute-catpaw.ts)

| Tool | Descripción |
|------|-------------|
| `gmail_list_emails` | Listar correos (limit, folder) |
| `gmail_search_emails` | Buscar con operadores Gmail |
| `gmail_read_email` | Leer contenido por messageId |
| `gmail_draft_email` | Crear borrador |
| `gmail_send_email` | Enviar (to, subject, body, **html_body**, cc[]) |
| `gmail_get_thread` | Todos los mensajes de un hilo |
| `gmail_mark_as_read` | Marcar leído |
| `gmail_reply_to_message` | Responder en hilo (threadId, messageId, **html_body**) |

**`html_body` tiene preferencia sobre `body`** cuando ambos están presentes.

### 6.2 Email Templates tools

- `list_email_templates` — Lista todas
- `get_email_template` — Detalle con estructura
- `render_email_template(templateId, variables)` — Devuelve HTML listo para enviar

**IMPORTANTE:** `render_email_template` está disponible como **tool de CatBot** pero NO como tool nativa de CatPaw en canvas. Los CatPaws acceden al conector email_template con las 3 tools anteriores via `getEmailTemplateToolsForPaw()`.

### 6.3 CatPaw en canvas — maxIterations

**MAX_TOOL_ROUNDS = 12** en execute-catpaw.ts (L473). Permite hasta 13 rondas de tool-calling — suficiente para: buscar template, renderizar, y enviar.

### 6.4 CatBot canvas tools

| Tool | Soporta modelo? | Soporta skills? | Soporta instructions? |
|------|-----------------|-----------------|----------------------|
| `canvas_add_node` | NO (hereda de CatPaw vía agentId) | NO (solo en update) | SÍ |
| `canvas_update_node` | NO directamente | SÍ (`skills: string[]`) | SÍ |

**Gaps:**
- No hay tool para configurar `initialInput` del nodo START
- No se puede setear modelo por nodo (solo vía CatPaw)
- `extraConnectors` NO se puede configurar desde canvas tools — son propiedad del CatPaw

### 6.5 maxIterations de CatBot

**maxIterations = 8** con self-check escalation después de iter 3+. Para un canvas de 8 nodos:
- canvas_get (1) + 8× canvas_add_node (8) + 8× canvas_add_edge (8) = **17 tool calls mínimo**
- Con el limit de 8 iters y ~3-4 calls por iter ≈ 24-32 calls posibles en teoría
- PERO el self-check a iter 3+ escala a async → **un canvas complejo NO se construye síncronamente**

---

## 7. Conclusiones y recomendaciones

### Gaps críticos (bloquean el objetivo de CatFlows autónomos)

1. **Architect-QA data_contract convergence** — El architect genera canvases que el QA rechaza repetidamente por data contracts. Probado con 4 iteraciones, `data_contract_score` oscila en 60-70 sin converger. **Bloquea la señal única del milestone.**

2. **maxIterations de CatBot = 8** — Insuficiente para construir canvases de 8+ nodos síncronamente. Se escala a async automáticamente, que funciona pero pierde el feedback loop con el usuario.

3. **Instrucciones no persisten** — En Q6 se pasaron instrucciones al crear el nodo pero en Q8 el verificador no las reportó. Posible bug en `canvas_add_node` que no persiste instructions o las sobreescribe.

4. **No hay validación de reglas de canvas** — CatBot conectó un nodo después de un OUTPUT sin detectar el error (Q9). No existe validación: OUTPUT es terminal, iterator necesita iterator_end, condition necesita 2 salidas.

### Gaps importantes (degradan calidad)

5. **Labels ausentes en canvases de CatBot** — El architect no genera labels, haciendo el canvas ilegible en el editor visual.

6. **Modelo "default" en vez de explícito** — Los canvases del architect usan modelo default en vez de `gemini-main`. Puede causar routing inesperado.

7. **Instrucciones genéricas vs operativas** — Canvases manuales tienen instrucciones con pasos concretos referenciando tools por nombre; los del architect son abstractos (INPUT/PROCESO/OUTPUT).

8. **CatBot no usa tools de listado** — Responde de knowledge tree en vez de llamar `list_cat_paws`, `list_email_templates`. Funciona hoy pero no escala.

9. **Falta mapeo template↔producto** — La skill Orquestador no tiene la tabla de qué plantilla usar para cada producto.

### Gaps menores (nice to have)

10. **No hay tool para setear modelo por nodo** — Solo vía CatPaw. Limita flexibilidad.
11. **No hay tool para configurar initialInput del START** — Solo vía canvas_execute.
12. **extraConnectors no configurable desde canvas tools** — Son propiedad del CatPaw.
13. **Falta protocolo de reporting paso a paso** — CatBot no informa al usuario en cada acción.
14. **Knowledge de 4 tipos de nodo incompleto** — storage, scheduler, multiagent no documentados en respuesta a usuario.

### Plan de acción recomendado

**Fase 1 — Architect-QA convergence (bloquea milestone v27.0)**
- Structured data_contract feedback injection (QA → Architect)
- Per-issue remediation prompting
- QA threshold calibration para canvases 7+ nodos
- Alternativa: modular canvas construction (per-node expand)

**Fase 2 — CatBot construction quality**
- Fix persistencia de instrucciones en canvas_add_node
- Añadir validación de reglas de canvas (OUTPUT terminal, iterator pairs)
- Forzar labels descriptivos en canvas_add_node
- Forzar modelo explícito (gemini-main) en architect output

**Fase 3 — Skill Orquestador enrichment**
- Tabla mapeo template↔producto
- Instrucciones probadas por tipo de nodo (copiar de canvases manuales exitosos)
- Reglas de validación de canvas
- Protocolo de reporting paso a paso
- Documentar límite maxIterations y escalamiento async

**Fase 4 — Canvas tools improvements**
- Añadir parámetro `model` a canvas_add_node/canvas_update_node
- Añadir tool `canvas_set_initial_input`
- CatBot use tools de listado en vez de knowledge tree para inventario
