---
documento: Briefing Definitivo — Milestone v27.0 CatBot Intelligence Engine v2
versión: FINAL
destinatario: Claude Code
fecha: 2026-04-11
instrucción: Leer completo antes de planificar o ejecutar cualquier fase
---

# Milestone v27.0 — CatBot Intelligence Engine v2
## Briefing Definitivo para Claude Code

> Este documento es la fuente de verdad para este milestone.
> Sintetiza 3 auditorías técnicas (86 preguntas con evidencia literal de código),
> análisis del repositorio de referencia de la industria (paperclipai/paperclip, 46k ★),
> y el conocimiento acumulado de los CatFlows que sí funcionan en producción.
> No hay atajos. Lee todo antes de escribir una línea.

---

## PARTE 1 — El problema nombrado correctamente

### El "Memento Man"

El creador de Paperclip AI describe a los agentes IA como el protagonista de Memento: saben luchar, conducir, ganar dinero — pero no saben quiénes son ni qué se supone que están haciendo. Cada vez que despiertan empiezan desde cero.

**Eso es exactamente lo que le pasa al Pipeline Architect de DoCatFlow.**

El architect tiene capacidades (LLM potente, rules index, QA loop), pero cada ejecución empieza sin saber:
- Que el conector Gmail espera `{accion_final, report_to, report_subject, results[]}` del nodo predecesor
- Que el CatPaw "Filtro Holded" tiene las tools `holded_list_invoices` y `holded_get_contact`
- Que ya existe un canvas "Comparativa Holded Q1" que podría reutilizar como base
- Que un nodo `emitter` terminal nunca puede cumplir R10 porque su output es un ACK por diseño

**La solución no es un prompt más largo. Es inyección de contexto estructurada y específica en cada ejecución.** Paperclip lo llama heartbeat checklist. Nosotros lo implementaremos como `scanCanvasResources` enriquecido + ARCHITECT_PROMPT rediseñado como checklist ejecutable.

### El caso de referencia que no funciona

El pipeline async debe completar este caso end-to-end sin intervención humana:

> *"Comparativa facturación Q1 2026 vs Q1 2025 de Holded, maquétala con el template corporativo y envíala a antonio@educa360.com y fen@educa360.com"*

**Por qué falla hoy:** el architect mapea "enviar email" a `type:'agent'` (instrucción de 180 chars en texto libre) en vez de `type:'connector'` con el predecesor produciendo el JSON que el executor Gmail necesita. El executor no encuentra `accion_final` en el output, cae al path legacy frágil, email vacío. El QA loop encima flaggea R10 en el nodo emitter (que por diseño devuelve un ACK, no JSON enriquecido), agota las 2 iteraciones, usuario no recibe nada ni notificación.

**La causa raíz es una sola:** el architect trabaja con el 20% de la información que necesita.

---

## PARTE 2 — Arquitectura del sistema que hay que conocer

### 2.1 Los 5 elementos y cómo se relacionan

```
CatBrain  → Base de conocimiento RAG. Ingesta PDFs/URLs/notas, indexa en Qdrant.
             Un nodo CATBRAIN en canvas = consulta semántica a esa base.

CatPaw    → Agente ejecutor. Tiene system prompt, modo, modelo, temperatura, skills,
             conectores vinculados y CatBrains. Es la pieza más crítica.
             Un nodo AGENT en canvas = un CatPaw específico ejecutando con tool-calling.

Skill     → Paquete de instrucciones inyectable al system prompt de un CatPaw.
             Modifica comportamiento sin cambiar el prompt base.
             42 skills en 7 categorías. Se pueden añadir en el nodo (extras) sin tocar el CatPaw.

Conector  → Integración externa (Gmail, Drive, Holded MCP, LinkedIn, SearXNG).
             Un nodo CONNECTOR en canvas = ejecuta una acción directa sin inteligencia propia.
             Un CatPaw CON conector vinculado = tool-calling, puede razonar sobre el resultado.

Canvas    → Flujo visual DAG. Orquesta CatPaws, CatBrains y conectores en orden topológico.
             Cada nodo recibe SOLO el output del nodo inmediatamente anterior.
```

### 2.2 La distinción crítica que el architect ignora

```
NODO CONNECTOR (tipo: connector):
  → Ejecuta directamente una acción (envía email, sube archivo, llama HTTP)
  → NO tiene inteligencia. Solo ejecuta.
  → El executor lee {connectorId} + el JSON del nodo predecesor
  → Para Gmail: espera {accion_final, report_to, report_subject, results[]} del predecesor
  → Si el predecesor no produce ese JSON → cae al path legacy frágil → fallo silencioso

NODO AGENT con CatPaw que tiene conector vinculado:
  → Ejecuta tool-calling en loop (máx 8 rondas)
  → Puede razonar sobre el resultado del conector antes de responder
  → Usa si necesitas decisión, análisis, o transformación del resultado
  → Tools disponibles: las del conector vinculado (holded_list_invoices, drive_upload_file...)

REGLA FUNDAMENTAL:
  ¿El nodo solo ENVÍA/ESCRIBE/SUBE? → Nodo CONNECTOR
  ¿El nodo RAZONA sobre el resultado de un servicio? → Nodo AGENT con CatPaw+conector
```

### 2.3 Cómo ejecuta el executor un nodo AGENT

```
1. Lee agentId del nodo
2. Busca CatPaw en cat_paws WHERE id = ? AND is_active = 1
3. Si existe → executeCatPaw(agentId, {query: data.instructions, context: predecessorOutput})
4. En executeCatPaw:
   a. Carga skills vinculadas → inyecta en system prompt
   b. Carga CatBrains vinculados → ejecuta consulta RAG → inyecta contexto
   c. Carga conectores vinculados → expone como tools
   d. Construye system prompt: base + tone + skills + RAG_context + tool_results
   e. Llama LiteLLM en loop de tool-calling (máx 8 rondas)
   f. Devuelve output final
5. El output del nodo = lo que produce el LLM del CatPaw
```

**Consecuencia crítica:** Las `data.instructions` del nodo NO son el system prompt — son el `query` que recibe el CatPaw. Las instrucciones del nodo deben decirle al CatPaw **qué hacer** con el input que recibe y **qué producir** como output. Si las instrucciones son genéricas ("procesa los datos"), el CatPaw adivina.

### 2.4 Contratos de conectores que el executor espera

El executor de Gmail NO lee `data.instructions`. Lee el `predecessorOutput` como JSON. Si el predecesor no produce el contrato correcto, cae al path legacy.

**Contratos reales del executor Gmail:**

```json
// send_report (el que usa el caso Holded Q1)
{
  "accion_final": "send_report",
  "report_to": "antonio@educa360.com,fen@educa360.com",
  "report_subject": "Comparativa Facturación Q1 2025 vs 2026",
  "report_template_ref": "corporativo",
  "results": [{"concepto": "...", "q1_2025": 0, "q1_2026": 0, "variacion": "..."}]
}

// send_reply
{
  "accion_final": "send_reply",
  "respuesta": {
    "plantilla_ref": "ref_code",
    "saludo": "Hola X",
    "cuerpo": "texto del email",
    "email_destino": "destinatario@email.com"
  },
  "messageId": "id_del_email_original"
}

// mark_read
{
  "accion_final": "mark_read",
  "messageId": "id_del_email"
}
```

**El nodo predecesor del connector Gmail DEBE producir uno de estos JSONs.** El architect debe saber esto antes de diseñar el canvas. Hoy no lo sabe porque `scanCanvasResources` no se lo pasa.

### 2.5 CatPaws críticos para canvas (IDs reales)

| CatPaw | ID | Conectores vinculados | Cuándo usar |
|--------|----|--------------------|-------------|
| Ejecutor Gmail | `65e3a722-9e43-43fc-ab8a-e68261c6d3da` | Gmail (App Password) | Envío directo de email con tool-calling |
| Operador Drive | `e05f112e-f245-4a3b-b42b-bb830dd1ac27` | Google Drive | Subir/listar/buscar archivos Drive |
| Consultor CRM | `b63164ed-83ae-40d0-950e-3a62826bc76f` | Holded MCP | Consultar/crear contactos, facturas, leads |
| Filtro CRM | (ver catálogo) | Holded MCP | Verificar si contacto ya está en CRM |
| Analista de Leads | `69b53800-6c0a-4a64-ae2d-70beac3a1868` | Holded MCP | Extraer + verificar leads contra CRM |
| Redactor Email | `redactor-email-notificacion` | Gmail | Redactar emails con template corporativo |

**REGLA:** Nodos que necesitan Gmail/Drive/Holded DEBEN tener el CatPaw correspondiente con conector vinculado. Sin CatPaw no hay tool-calling. Sin tool-calling las tools no existen.

### 2.6 La calidad de instrucciones que funciona vs la que no

**LO QUE PRODUCE EL ARCHITECT HOY (falla):**
```
n3 instructions: "Analizar y comparar los datos de facturación de Q1 2025 y Q1 2026 recibidos,
                  generando un resumen contable a nivel ejecutivo."
→ 156 chars, sin estructura, sin tools, sin contratos de campos
```

**LO QUE PRODUCEN LAS INSTRUCCIONES HAND-CRAFTED DEL INBOUND CATFLOW (funciona):**
```
clasificador instructions: "ROL: Eres el Clasificador Inbound. Especialista en análisis de
intent de emails de negocio.
MISIÓN: Recibes UN solo email completo (messageId, threadId, from, subject, body, date).
Tu tarea es clasificarlo.
PROCESO:
  FASE 1 — Lee el campo 'from' y 'subject'. Identifica el tipo de remitente.
  FASE 2 — Evalúa el intent: ¿es lead nuevo, cliente existente, spam, interno?
  FASE 3 — Decide la acción: respond_auto | derive | ignore | spam
CASOS ESPECIALES:
  - Si el campo 'body' está vacío: clasificar como 'ignore'
  - Si el dominio es educa360.com: clasificar como 'interno'
OUTPUT OBLIGATORIO (JSON exacto, sin texto adicional):
{
  "messageId": "[valor exacto del input]",
  "threadId": "[valor exacto del input]",
  "from": "[valor exacto del input]",
  "subject": "[valor exacto del input]",
  "classification": "lead_nuevo|cliente|spam|interno",
  "action": "respond_auto|derive|ignore|spam",
  "razon": "motivo breve"
}
REGLA: Devuelve el MISMO objeto JSON con TODOS sus campos originales intactos más los nuevos."
→ 730 chars, estructura FASE 1/2/3, OUTPUT declarado, casos especiales, preservación de campos
```

**La diferencia:** 3-7x más largo, estructura explícita, tools mencionadas por nombre, contratos de entrada y salida declarados, casuística de errores. El architect debe llegar a ese nivel.

### 2.7 Los 7 roles funcionales (vocabulario compartido)

El problema central del QA loop: el reviewer aplica R10 ("JSON in → JSON out, preserva todos los campos") a un nodo Gmail sender que por diseño devuelve un ACK. Para solucionarlo, architect y reviewer deben compartir este vocabulario:

| Rol | Nodos típicos | R10 aplica | Qué produce |
|-----|--------------|:----------:|-------------|
| `extractor` | start, connector (fetch/list) | ✗ | Datos desde cero |
| `transformer` | agent (enriquecedor, clasificador) | ✓ estricto | JSON con campos del input + nuevos |
| `synthesizer` | agent (comparador, resumidor), merge | ✓ parcial | Resumen con campos clave declarados |
| `renderer` | agent (maquetador, redactor email) | ✗ | Artefacto (HTML, JSON con estructura específica) |
| `emitter` | connector (Gmail, Drive, HTTP POST) | ✗ | ACK de envío (terminal) |
| `guard` | condition | ✗ | yes/no |
| `reporter` | auto-insertado en guard.false | ✗ | Meta-nodo de recuperación |

**El architect debe declarar `data.role` en cada nodo. El reviewer debe aplicar reglas condicionalmente según ese rol.**

---

## PARTE 3 — Lo que funciona y no debe tocarse

| Componente | Tests | Estado |
|-----------|-------|--------|
| State machine `intent_jobs` | 23/23 ✓ | No tocar |
| `insertSideEffectGuards` | 36/36 ✓ | No tocar |
| `canvas-executor.ts` | ✓ | **Fuente de verdad. Jamás tocar.** |
| Channel propagation Telegram/web | ✓ | No tocar |
| `attemptNodeRepair` | 7/7 ✓ | No tocar |
| Complexity classification protocol | ✓ | No tocar (mejorar en Fase C) |
| Pipeline secuencial (1 job a la vez) | ✓ | Adecuado para volumen actual |

---

## PARTE 4 — Las tres fases del milestone

### ⚡ FASE A — Fundación y tooling (prerequisito bloqueante)

**Sin esta fase, B y C son imposibles de validar.** No avanzar a B sin A completa.

---

#### A.1 — Commit hotfix-B *(5 min, prerequisito absoluto)*

Antes de cualquier cosa: verificar que estos dos fixes están en git:
- `docker-entrypoint.sh` copia `*.md` además de `*.json`
- `VALID_NODE_TYPES` en `canvas-flow-designer.ts` tiene los 14 tipos

Si no están comprometidos, hacerlo ahora. No empezar sobre código sin baseline.

---

#### A.2 — Mover `canvas-nodes-catalog.md` al path de despliegue *(15 min)*

Mover `canvas-nodes-catalog.md` a `app/data/knowledge/`. Actualizar `canvas-rules.ts` para leer desde esa ruta. Verificar en el contenedor Docker:
```bash
docker exec docflow-app ls /app/data/knowledge/canvas-nodes-catalog.md
```
Actualmente `getCanvasRule('R10')` devuelve null en producción. La expansión on-demand está muerta en producción sin que ningún test lo detecte.

---

#### A.3 — Timeout en callLLM *(30 min)*

Añadir `AbortSignal.timeout(90_000)` a cada llamada `fetch` del pipeline async (`callLLM` en `intent-job-executor.ts`). Sin esto el executor puede bloquearse indefinidamente si LiteLLM cuelga → `this.currentJobId` no libera y ningún job nuevo progresa.

---

#### A.4 — Job reaper *(1h)*

Un proceso periódico (cada 5 minutos) dentro del executor que:
1. Consulta `intent_jobs` donde `status IN ('strategist','decomposer','architect')` y `updated_at < now - 10 minutes`
2. Para cada job encontrado: `updateIntentJob(id, {status: 'failed'})` + `notifyProgress` con mensaje de timeout por el canal original

Combinar con un cleanup de `this.currentJobId` si el job ID ya no existe en la BD.

---

#### A.5 — Persistencia de outputs intermedios *(2h)*

Añadir estas columnas a `intent_jobs` (con ALTER TABLE IF NOT EXISTS en `db.ts`):

```sql
strategist_output     TEXT  -- JSON: {goal, success_criteria, estimated_steps}
decomposer_output     TEXT  -- JSON: {tasks: [...]}
architect_iter0       TEXT  -- flow_data del primer intento del architect
qa_iter0              TEXT  -- qa_report completo del primer review
architect_iter1       TEXT  -- flow_data del segundo intento (si aplica)
qa_iter1              TEXT  -- qa_report del segundo review (si aplica)
```

Poblar estas columnas en los puntos correctos del pipeline. Sin esto, cuando el QA loop agota es imposible saber qué instrucciones generó el architect.

---

#### A.6 — Guardar flow_data en exhaustion *(30 min)*

En el path de exhaustion de `runArchitectQALoop`, antes de llamar `logKnowledgeGap`, añadir el `flow_data` del último intento del architect al campo `context` del gap. Actualmente solo se guarda el `qa_report` → post-mortem imposible.

---

#### A.7 — Script `test-pipeline.mjs` *(3h — entregable crítico)*

Sin este script, iterar sobre los prompts de Fase B cuesta 3-4 minutos por prueba (Telegram → esperar → consultar BD → limpiar). Con él cuesta 30 segundos.

**Ubicación:** `app/scripts/test-pipeline.mjs`

**Uso:**
```bash
node app/scripts/test-pipeline.mjs --case holded-q1
node app/scripts/test-pipeline.mjs --goal "comparativa Holded Q1" --save-baseline
node app/scripts/test-pipeline.mjs --case holded-q1 --diff baselines/holded-q1.json
```

**Flujo interno:**
1. Lee el fixture del caso (`app/scripts/pipeline-cases/{case}.json`)
2. Inserta un job sintético en `intent_jobs` con status='pending'
3. Llama `IntentJobExecutor.tick()` directamente
4. Hace polling hasta que el job llega a estado terminal
5. Imprime en stdout: flow_data generado, roles declarados, instrucciones por nodo, iteraciones QA, qa_report final, tokens estimados, tiempo total
6. Limpia el job sintético de la BD

**Fixtures en `app/scripts/pipeline-cases/`:**

```json
// holded-q1.json — el caso de referencia
{
  "description": "holded-q1 canonical case",
  "original_request": "Comparativa facturación Q1 2026 vs Q1 2025 de Holded, maqueta con template corporativo y envía a antonio@educa360.com y fen@educa360.com",
  "channel": "test",
  "channel_ref": "test-runner"
}

// inbox-digest.json — caso con iterator
{
  "description": "inbox-digest with iterator",
  "original_request": "Lee los emails no leídos de info@educa360.com de hoy, clasifica cada uno y responde a los que sean leads nuevos"
}

// drive-sync.json — caso con storage y transformer
{
  "description": "drive sync with transformer chain",
  "original_request": "Descarga la lista de contactos de Holded, enriquece cada uno con si tiene factura pendiente, y guarda el resultado en Drive como CSV"
}
```

**El script NO debe avanzar a Fase B sin estar operativo.**

---

#### A.8 — Notificación de exhaustion *(30 min)*

En `runArchitectQALoop`, en el path de exhaustion (donde actualmente solo llama `logKnowledgeGap` y `markTerminal`), añadir:

```typescript
await this.notifyProgress(job,
  `⚠️ No pude generar un canvas de calidad tras ${MAX_QA_ITERATIONS} intentos.\n` +
  `Principales problemas:\n` +
  topIssues.map(i => `• [${i.rule_id}] ${i.description}`).join('\n'),
  true // force = true para que no sea throttleado
);
```

Donde `topIssues` son los top-2 issues por severity del último `qa_report`.

**Criterio de completitud Fase A:** ejecutar `node app/scripts/test-pipeline.mjs --case holded-q1` y recibir el flow_data + qa_report en stdout en menos de 60 segundos.

---

### 🧠 FASE B — Inteligencia del Architect

**Objetivo:** el architect produce canvases que el CatFlow Inbound v4.0 validaría como correctos.

---

#### B.1 — Enriquecer `scanCanvasResources` *(3h — máximo impacto del milestone)*

Este es **el cambio de arquitectura más importante**. El architect pasa del 20% al 80% de la información que necesita.

**Añadir al inventario que recibe el architect:**

**Tools por CatPaw** — Leer los conectores vinculados de cada CatPaw activo y mapear a tools disponibles:
```json
{
  "paw_id": "65e3a722-9e43-43fc-ab8a-e68261c6d3da",
  "paw_name": "Ejecutor Gmail",
  "paw_mode": "processor",
  "tools_available": ["gmail_send_email", "gmail_reply_to_message", "gmail_mark_as_read", "gmail_search_emails"],
  "skills": [],
  "best_for": "Envío y gestión de emails. Usa cuando el canvas necesita operaciones Gmail con tool-calling."
}
```

Construir este mapeo desde `cat_paw_connectors JOIN connectors` — los IDs de tools vienen del tipo de conector:
- `gmail` → tools de Gmail
- `google_drive` → tools de Drive
- `mcp_server` + nombre "Holded" → tools de Holded

**Contratos de conectores** — Para cada connector activo, el JSON que el executor espera del predecesor:
```json
{
  "connector_id": "43cbe742-d8ed-4788-a5df-0f6f874220a8",
  "connector_name": "Antonio Educa360",
  "connector_type": "gmail",
  "note": "El nodo connector NO lee data.instructions. Lee el predecessorOutput como JSON.",
  "contracts": {
    "send_report": {
      "required_fields": ["accion_final", "report_to", "report_subject", "results"],
      "optional_fields": ["report_template_ref"],
      "description": "El nodo AGENT anterior (renderer) debe producir este JSON exacto"
    },
    "send_reply": {
      "required_fields": ["accion_final", "respuesta", "messageId"]
    },
    "mark_read": {
      "required_fields": ["accion_final", "messageId"]
    }
  }
}
```

Construir este catálogo en código desde el executor — es la documentación del contrato real del executor, no una abstracción.

**Canvases similares** — Top 3 canvases en BD cuyo nombre o descripción tienen palabras del goal:
```json
{
  "canvas_id": "uuid",
  "canvas_name": "Comparativa Holded Q1",
  "node_roles": ["extractor", "extractor", "merge", "synthesizer", "renderer", "emitter"],
  "was_executed": true,
  "note": "Referencia de estructura para canvases similares"
}
```

**Templates disponibles** — Los 4+ templates de la BD con su estructura de nodos como referencia.

---

#### B.2 — Mover el threshold de calidad a código *(30 min)*

Actualmente `quality_score >= 80` está dentro del string del prompt — el LLM decide si su propio output supera su propio threshold. Moverlo a código:

```typescript
// En runArchitectQALoop, después de parsear qaReport:
const blockers = qaReport.issues?.filter(i => i.severity === 'blocker') ?? [];
const shouldAccept =
  (qaReport.data_contract_score ?? qaReport.quality_score ?? 0) >= 80 &&
  blockers.length === 0;

if (shouldAccept) {
  return design; // accept
}
// else: revise / exhaustion
```

Esto convierte una decisión probabilística en determinista. El LLM ya no es juez de su propio output.

---

#### B.3 — Actualizar `canvas-rules-index.md` con scope por rol *(45 min)*

Cada regla que no sea universalmente correcta debe tener su scope declarado. Formato:

```markdown
- R10 [scope: transformer, synthesizer]: JSON in → JSON out. Mantener campos originales + añadir nuevos
- SE01 [scope: emitter]: Guard automático antes de cada send/write/upload/create
- R15 [scope: transformer, synthesizer, renderer]: Cada nodo LLM recibe info mínima necesaria
- R02 [scope: extractor, transformer cuando produce arrays]: Arrays >1 item → usar ITERATOR
```

Las reglas genuinamente universales (R03, R04, R11, R20, R23, R24) no necesitan anotación.

---

#### B.4 — Reescribir `ARCHITECT_PROMPT` como heartbeat checklist *(4h)*

Aplicando el patrón Paperclip: no una descripción, sino un checklist ejecutable. El LLM no debe "recordar" qué hacer — debe seguir pasos donde cada paso tiene el contexto necesario.

**Estructura del nuevo prompt:**

**[Sección 1] Lo que tienes disponible**

Declarar explícitamente qué información llega al architect:
- `goal` (del strategist): el objetivo conciso
- `tasks[]` (del decomposer): las tareas atómicas
- `resources.catPaws[]`: cada CatPaw con su `tools_available` y `best_for`
- `resources.connectors[]`: cada connector con su `contracts` declarativos
- `resources.skills[]`: lista de skills disponibles
- `resources.canvas_similar[]`: canvases parecidos como referencia
- `resources.templates[]`: templates disponibles

**[Sección 2] Taxonomía de 7 roles** (vocabulario compartido con el reviewer)

La tabla de roles de la Parte 2.7, compacta pero completa.

**[Sección 3] Checklist de diseño** (heartbeat pattern de Paperclip)

```
PASO 1 — Clasifica cada task por rol:
  ¿Genera datos desde un servicio? → extractor
  ¿Transforma/enriquece JSON preservando campos? → transformer
  ¿Resume/compara múltiples inputs? → synthesizer
  ¿Produce HTML/PDF/JSON estructurado para enviar? → renderer
  ¿Envía/escribe/sube al exterior? → emitter
  ¿Bifurca según condición? → guard

PASO 2 — Para cada nodo emitter:
  → Busca el connector en resources.connectors
  → Lee su contracts.{accion}
  → Las instrucciones del nodo RENDERER anterior DEBEN producir ese JSON exacto
  → Declara data.connectorId. No pongas instructions en el connector node.

PASO 3 — Para cada nodo extractor/transformer que produce arrays:
  → Si el siguiente nodo tiene tool-calling → insertar ITERATOR
  → El cuerpo del iterator procesa UN item
  → El iterator_end acumula

PASO 4 — Para cada nodo agent:
  → Busca el CatPaw en resources.catPaws que mejor encaje con la task
  → Las instructions DEBEN mencionar las tools_available del CatPaw por nombre
  → Declara data.role
  → Si role=transformer: el OUTPUT debe incluir TODOS los campos del INPUT más los nuevos
  → Si role=renderer: el OUTPUT debe ser el contrato del connector siguiente

PASO 5 — Valida la cadena de datos:
  → ¿Cada nodo tiene los campos que el siguiente necesita?
  → ¿Ningún nodo intermedio descarta datos que se necesitan aguas abajo?
  → Si un dato es necesario en el nodo 5, cada nodo 2,3,4 debe propagarlo en su output

PASO 6 — Si falta un CatPaw para una task:
  → NO inventes un agentId
  → Inclúyelo en needs_cat_paws con: name, mode:'processor', system_prompt (estructura ROL/MISIÓN/PROCESO/OUTPUT), skills sugeridas, conectores necesarios
```

**[Sección 4] Plantillas de instrucciones por rol**

Plantilla mínima para `transformer`, `renderer`, `emitter`. Específica y copiable:

*Transformer:*
```
INPUT: {campo1, campo2, campo3}
PROCESO:
  PASO 1 — [acción concreta con tool si aplica: usa holded_list_invoices para X]
  PASO 2 — [procesamiento]
  Si [caso especial]: [acción]
OUTPUT: {campo1, campo2, campo3, campoNuevo1, campoNuevo2}
          ↑ TODOS los del input + los nuevos añadidos
REGLA: Sin texto antes ni después del JSON. Sin markdown fences.
```

*Renderer (caso email):*
```
INPUT: {facturacion_q1_2026, facturacion_q1_2025, variacion_pct, analisis_ejecutivo}
PROCESO:
  PASO 1 — Verificar que los campos existen. Si falta uno, usar "No disponible".
  PASO 2 — Aplicar template corporativo (header #1a73e8, tabla alternada #f8f9fa, estilos inline)
  PASO 3 — Construir el JSON de salida
OUTPUT OBLIGATORIO:
{
  "accion_final": "send_report",
  "report_to": "[destinatarios del contexto]",
  "report_subject": "Comparativa Q1 2025 vs 2026 — Educa360",
  "report_template_ref": "corporativo",
  "results": [{...datos del comparativo...}]
}
REGLA: Nunca inventar datos. Solo JSON. Sin markdown.
```

**[Sección 5] Ejemplos contrastados** (few-shot — el insumo de mayor apalancamiento)

Al menos 2 pares malo/bueno para los roles críticos renderer y emitter:

*Renderer MALO (el que produce el architect hoy):*
```json
{"instructions": "Genera el email con la comparativa recibida"}
```
*Por qué falla: no declara el contrato {accion_final,...} → el executor cae al path legacy → email vacío*

*Renderer BUENO:*
```json
{"instructions": "INPUT: {facturacion_q1_2026, facturacion_q1_2025, variacion_pct}\nPASO 1: Verificar campos...\nOUTPUT: {\"accion_final\":\"send_report\",\"report_to\":\"...\",\"results\":[...]}"}
```

*Emitter MALO (el error original del caso Holded Q1):*
```json
{"type": "agent", "data": {"agentId": "65e3a722...", "instructions": "Enviar el documento por email a antonio@educa360.com"}}
```
*Por qué falla: nodo agent para envío → no usa el contrato declarativo → email vacío o error*

*Emitter CORRECTO:*
```json
{"type": "connector", "data": {"connectorId": "43cbe742...", "role": "emitter"}}
```
*El RENDERER anterior produce el JSON con accion_final. El connector lo ejecuta. Sin instructions en el connector.*

**[Sección 6] Patrón del iterator (copiable)**

Flow_data completo de un iterator con edges correctos como template literal en el prompt.

**[Sección 7] `{{RULES_INDEX}}`** — igual que ahora.

---

#### B.5 — Reescribir `CANVAS_QA_PROMPT` con validación en dos capas *(2h)*

**Capa 1 — Validador determinístico (código, ANTES del LLM):**

Antes de llamar al LLM reviewer, el código verifica:
- Todos los `agentId` existen en `cat_paws` WHERE is_active=1
- Todos los `connectorId` existen en `connectors` WHERE is_active=1
- El grafo es DAG (sin ciclos)
- Hay exactamente un nodo `start`
- Todos los tipos de nodo están en `VALID_NODE_TYPES`

Si falla → `recommendation: 'reject'` automático, sin llamar al LLM. Ahorra tokens y produce errores más claros.

**Capa 2 — Reviewer LLM con roles:**

El prompt reescrito debe:
- Leer `data.role` de cada nodo antes de aplicar cualquier regla
- Aplicar R10 **solo** a nodos con `role ∈ {transformer, synthesizer}`
- Detectar nodos terminales (sin edges salientes) y no aplicarles R10
- Producir el schema de output actualizado:

```json
{
  "data_contract_score": 0-100,
  "instruction_quality_score": 0-100,
  "issues": [
    {
      "severity": "blocker|major|minor",
      "scope": "data_contract|instruction_quality",
      "rule_id": "R10",
      "node_id": "n4",
      "node_role": "renderer",
      "description": "El nodo renderer no produce el contrato {accion_final,...} requerido por el connector Gmail siguiente",
      "fix_hint": "Añadir al OUTPUT el JSON con accion_final:'send_report', report_to, report_subject y results[]"
    }
  ],
  "recommendation": "accept|revise|reject"
}
```

Criterio de `accept` (en código, Fase B.2): `data_contract_score >= 80 AND blockers.length === 0`.

---

#### B.6 — Actualizar tests *(1h)*

- Actualizar mocks en `intent-job-executor.test.ts` al nuevo schema de reviewer (dos scores)
- Añadir test: canvas con emitter sin R10 → reviewer no emite R10, resultado `accept`
- Añadir test: canvas con transformer que descarta campos → reviewer emite R10 blocker, resultado `revise`
- Añadir test: exhaustion → `notifyProgress` se llama con top-2 issues (spy)
- Añadir test: validador determinístico rechaza canvas con agentId inexistente sin llamar al LLM

**Criterio de completitud Fase B:**

Ejecutar los 3 casos canonizados con `test-pipeline.mjs`:
1. **holded-q1**: QA converge en ≤ 2 iteraciones. Canvas tiene `data.role` en todos los nodos. Nodo renderer produce `{accion_final: 'send_report', ...}`. Cero R10 falsos positivos en emitter.
2. **inbox-digest**: Canvas genera un nodo `iterator` correctamente. R10 aplica dentro del iterator body pero no al emitter final.
3. **drive-sync**: R10 aplicado correctamente en transformer (verdadero positivo). Nodo storage clasificado como emitter.

Inspección manual de instrucciones: estructura ROL/PROCESO/OUTPUT, tools mencionadas por nombre, contratos de campos explícitos.

---

### 🌀 FASE C — Loops de aprendizaje y memoria

**Objetivo:** el sistema aprende de lo que hace. El usuario tiene visibilidad completa. CatBot entiende cómo crear CatPaws y canvases bien desde la primera vez.

---

#### C.1 — Protocolo de creación de CatPaw *(2h)*

El problema que señalas: si CatBot no tiene el rigor de saber cómo dotar de skill a un CatPaw, qué conector necesita para qué función, todo se cae.

Actualmente `create_cat_paw` crea el agente con campos básicos. El system prompt hay que editarlo manualmente. Esto debe cambiar.

**Implementar un protocolo de creación guiado para CatBot:**

Cuando el architect detecta `needs_cat_paws`, o cuando el usuario pide "crea un CatPaw para X", CatBot debe seguir este protocolo:

```
PASO 1 — Identifica la función del CatPaw:
  ¿Es para el Canvas (debe ser mode: processor)?
  ¿Qué tipo de tarea: extractor | transformer | renderer | emitter?

PASO 2 — Identifica las skills que necesita:
  Escritura/redacción → skill "Redacción Ejecutiva" o "Copywriting Comercial"
  Análisis → skill "Investigación Profunda" o "Marco de Decisión"
  Email con template → skill "Maquetador de Email"
  Formato de output → skill "Output Estructurado"

PASO 3 — Identifica los conectores necesarios:
  ¿Necesita Gmail? → vincular conector Gmail correspondiente DESPUÉS de crear
  ¿Necesita Drive? → vincular Educa360Drive
  ¿Necesita Holded? → vincular Holded MCP

PASO 4 — Genera el system prompt con estructura ROL/MISIÓN/PROCESO/CASOS/OUTPUT:
  Temperatura: 0.1-0.2 para clasificación/filtrado, 0.4-0.6 para redacción
  Formato: json si output es para otro nodo, md si output es para humano

PASO 5 — Presenta el plan al usuario antes de crear:
  "Voy a crear el CatPaw 'X' con mode: processor, skill 'Y', conector 'Z'. ¿Procedo?"
```

Añadir este protocolo como skill del sistema (`categoria: system`) en la BD, accesible por CatBot en todas las conversaciones.

---

#### C.2 — Memoria de interacción por usuario *(2h — verificar estado actual)*

El usuario menciona que se planificó una fase para loggear cómo el usuario pide las cosas y cómo hay que entregárselas. Verificar el estado actual:

1. Consultar si existe tabla `user_memory` o `user_profile` o `conversation_patterns` en `catbot.db`
2. Verificar si `complexity_decisions.outcome` se cierra cuando el pipeline completa
3. Verificar si hay algún mecanismo de "learning" activo

Si la funcionalidad básica existe pero no está completa:
- Asegurar que `complexity_decisions.outcome` se actualiza a `completed|failed` cuando el job termina
- Añadir campo `user_patterns` en `user_profile` donde CatBot pueda escribir observaciones como: "Este usuario siempre pide las comparativas con Q1/Q2, prefiere email con template corporativo, destinatarios habituales: antonio y fen"
- Que CatBot lea esos patrones en el sistema prompt para personalizar respuestas

Si la funcionalidad no existe, crear la estructura mínima:
```sql
CREATE TABLE IF NOT EXISTS user_interaction_patterns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  pattern_type TEXT, -- 'delivery_preference', 'request_style', 'frequent_task'
  pattern_key TEXT,
  pattern_value TEXT,
  confidence INTEGER DEFAULT 1,
  last_seen TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

#### C.3 — Goal → initialInput del canvas *(15 min)*

Propagar el `goal` producido por el strategist como `initialInput` del nodo START del canvas. Actualmente el START recibe el texto original de la petición del usuario (a veces ambiguo). El goal del strategist es más preciso y accionable. Los nodos del canvas trabajarán con contexto de propósito, no solo con datos.

---

#### C.4 — Condition parser multilingüe *(15 min)*

El executor del nodo `condition` busca "yes"/"no" (inglés). Si el LLM responde "Sí", "No", "si", falla silenciosamente. Añadir variantes:
```typescript
const YES_VALUES = ['yes', 'sí', 'si', 'true', '1', 'afirmativo', 'correcto'];
const NO_VALUES = ['no', 'false', '0', 'negativo', 'incorrecto'];
```

---

#### C.5 — Propuesta más informativa al usuario *(1h)*

En `sendProposal` al usuario por Telegram, incluir información útil antes de aprobar:
```
📋 CatFlow generado: "Comparativa Holded Q1"

Nodos (6):
  📥 Extractor Q1 2025 — Extrae facturas de Holded
  📥 Extractor Q1 2026 — Extrae facturas de Holded
  🔀 Merge — Combina ambos resultados
  🧠 Comparador — Genera análisis ejecutivo
  🎨 Maquetador — Aplica template corporativo
  📤 Gmail Antonio — Envía informe por email

⏱ Tiempo estimado: ~3 minutos

[✓ Aprobar] [✗ Cancelar]
```

---

#### C.6 — Cerrar loop `complexity_decisions` *(30 min)*

Al completar o fallar un pipeline async, actualizar el campo `outcome` en `complexity_decisions`:
- Pipeline completa con éxito → `outcome: 'completed'`
- Pipeline falla con exhaustion → `outcome: 'failed'`
- Job reiniciado por reaper → `outcome: 'timeout'`

Esto permite responder preguntas como "¿qué % de peticiones complex se completan con éxito?"

---

#### C.7 — Evaluar fusión strategist+decomposer *(2h, si positivo)*

El strategist actual reformula la petición sin añadir valor real (evidencia: toma "Comparativa Holded Q1 + email a antonio y fen" y produce el mismo texto con mejor puntuación). Una llamada LLM para reformatear text es ruido.

Evaluar con el script de test si fusionarlos produce resultados equivalentes:
1. Ejecutar holded-q1 con pipeline actual (strategist + decomposer = 2 calls)
2. Ejecutar con un prompt fusionado que hace las dos cosas en 1 call
3. Comparar calidad de las tasks resultantes

Si la calidad es equivalente → implementar. Elimina una fuente de variabilidad y reduce latencia ~15s.

---

**Criterio de completitud Fase C:**

El caso Holded Q1 ejecutado end-to-end vía Telegram produce un email con cifras reales de ambos periodos, template HTML corporativo aplicado, y ambos destinatarios. Sin intervención manual. Sin reintentos. Reproducible en 3 ejecuciones consecutivas.

---

## PARTE 5 — Restricciones absolutas de este milestone

**NUNCA tocar:**
- `canvas-executor.ts` — es la fuente de verdad. Sus decisiones de implementación son ley.
- Los tests existentes que pasan — si algo se rompe, es un bug del cambio, no del test
- La UI del canvas — fuera de scope
- `insertSideEffectGuards` — funciona, no tocar

**NUNCA hacer:**
- Añadir tipos de nodo nuevos para "solucionar" el problema del architect
- Subir `MAX_QA_ITERATIONS` sin cambiar los prompts — más iteraciones del mismo error = mismo resultado con más coste
- Marcar Fase B como completa sin ejecutar los 3 casos canonizados contra LiteLLM real
- Saltarse Fase A porque parece "solo setup" — sin el script de test, B no es ejecutable eficientemente

---

## PARTE 6 — Orden de ejecución y estimación

```
FASE A — ~7-8h total (prerequisito)
  A.1 commit hotfix-B                    [5 min]
  A.2 mover canvas-nodes-catalog         [15 min]
  A.3 timeout callLLM                    [30 min]
  A.6 flow_data en exhaustion            [30 min]
  A.8 notificación de exhaustion         [30 min]
  A.4 job reaper                         [1h]
  A.5 persistencia outputs intermedios   [2h]
  A.7 script test-pipeline.mjs           [3h] ← desbloquea Fase B

FASE B — ~11-12h total (el núcleo)
  B.2 threshold a código                 [30 min]
  B.3 rules index scope                  [45 min]
  B.1 scanCanvasResources enriquecido    [3h] ← mayor impacto
  B.5 QA capa determinística             [2h]
  B.4 ARCHITECT_PROMPT                   [4h] ← más laborioso
  B.5 QA prompt LLM                      [1h]
  B.6 tests actualizados                 [1h]
  Validación 3 casos canonizados         [variable]

FASE C — ~6-8h total (cierre)
  C.3 goal → initialInput                [15 min]
  C.4 condition parser multilingüe       [15 min]
  C.6 complexity_decisions loop          [30 min]
  C.5 notificación propuesta informativa [1h]
  C.1 protocolo creación CatPaw          [2h]
  C.2 memoria interacción usuario        [2h]
  C.7 evaluar fusión strategist          [2h si positivo]
```

---

## PARTE 7 — La señal única de éxito

```
Usuario envía por Telegram:
"Comparativa facturación Q1 2026 vs Q1 2025 de Holded,
 maquétala con el template corporativo y envíala a
 antonio@educa360.com y fen@educa360.com"

Sistema:
→ Clasifica como complex
→ Pipeline async: strategist → decomposer → architect → QA (≤2 iter) → propuesta
→ Usuario aprueba
→ Canvas ejecuta: extractor×2 → merge → comparador → renderer → Gmail

Resultado:
✓ Email llega a ambos destinatarios
✓ Template HTML corporativo aplicado (header azul, tabla alternada)
✓ Cifras reales de Q1 2025 y Q1 2026 en la tabla (no placeholders)
✓ Sin intervención manual
✓ Sin reintentos
✓ Reproducible
```

Cuando eso funciona de forma consistente, el milestone está completo.

---

## PARTE 8 — Referencias de calidad

| Referencia | Dónde está | Para qué |
|-----------|-----------|---------|
| CatFlow Inbound v4.0 | `proceso-catflow-revision-inbound.md` | Estándar de instrucciones de nodo |
| Skill Orquestador v2.0 | `skill_orquestador_catbot_enriched.md` | Protocolo completo de creación de canvas |
| Canvas Nodes Catalog | `canvas-nodes-catalog.md` | Contratos reales del executor |
| Connectors Catalog | `connectors-catalog.md` | IDs, contratos y reglas de conectores |
| CatPaw Catalog | `catpaw-catalog.md` | IDs, skills y conectores de agentes existentes |
| Paperclip AI | github.com/paperclipai/paperclip | Heartbeat pattern + role-tiered skills |

---

*Documento final — 2026-04-11*
*Basado en: trilogía de auditoría (86 preguntas, código literal), análisis Paperclip AI (46k ★), CatFlow Inbound v4.0 (referencia de calidad probada)*
*El patrón fundamental: "Memento Man" — inyectar el contexto correcto, no esperar que el LLM lo recuerde*
