---
title: Respuestas a la batería de 19 preguntas (Bloques 1-7)
created: 2026-04-11
companion: AUDIT-catflow-pipeline-quality.md
purpose: Evidencia literal + razonamiento por pregunta antes de planificar Phase 133
status: working-document
---

# Respuestas — Batería diagnóstico Pipeline Architect (19 preguntas)

> Cada respuesta tiene tres secciones:
> - **Evidencia** (código literal o query SQL real)
> - **Hechos** (interpretación directa de la evidencia, sin opinión)
> - **Razonamiento** (mi criterio sobre por qué pasa esto y qué implica)

---

## BLOQUE 1 — Los prompts actuales

### P1. Texto literal de `ARCHITECT_PROMPT` post hotfix-A

**Evidencia** ([catbot-pipeline-prompts.ts:26-73](app/src/lib/services/catbot-pipeline-prompts.ts#L26-L73)):

```ts
export const ARCHITECT_PROMPT = `Eres un arquitecto de CatFlow. Recibes: objetivo + tareas + inventario de recursos (catPaws, catBrains, skills, connectors) + index de reglas de diseno.

REGLAS DE DISENO (lookup on-demand con needs_rule_details):
{{RULES_INDEX}}

Tipos de nodo validos: agent | catbrain | condition | iterator | multiagent | scheduler | checkpoint | connector | storage | merge | output | start. NO inventes otros.

Para cada tarea mapeas UN nodo:
- 'agent' con data.agentId = cat_paws.id si hay CatPaw adecuado. Si no hay, inclúyelo en needs_cat_paws.
- 'catbrain' con data.catbrainId para RAG.
- 'connector' con data.connectorId para email/drive/http/mcp.
- 'iterator' para arrays >1 item con tool-calling (R14, R02).
- 'condition' para bifurcaciones logicas.

DATA CONTRACTS OBLIGATORIOS (R01, R10, R13):
- Cada nodo 'instructions' DEBE empezar con "INPUT: {campo1, campo2, ...}\\nOUTPUT: {campoA, ...}" declarando el contrato explicitamente.
- Los campos OUTPUT del nodo N DEBEN coincidir 1:1 con los campos INPUT del nodo N+1.
- Si recibe JSON y devuelve JSON, incluye "Devuelve el MISMO array JSON, anadiendo solo tus campos. Manten TODOS los originales intactos." (R10).

ANTI-PATTERNS A EVITAR:
- DA01: No pases arrays >1 item a nodos con tool-calling interno (usa ITERATOR).
- DA02: No enlaces connectors/skills innecesarios.
- DA03: No generes URLs con LLM, usa campos especificos del output del tool.
- DA04: No dependas de datos fuera del input explicito del nodo.

QA REVIEW:
Tu diseno pasara por un reviewer QA automatico que validara data contracts y reglas. Anticipa posibles blockers:
- cada nodo tiene INPUT+OUTPUT declarados?
- los nombres de campo son canonicos a lo largo del pipeline?
- los arrays >1 items van dentro de un iterator?
- los nodos con side effects (send/write/upload/create) aparecen al final del pipeline y no dentro de un loop?

Si NO hay CatPaw adecuado para una tarea, NO inventes un id — inclúyelo en needs_cat_paws con name+system_prompt+reason.

Si recibes feedback de un QA review previo (qa_report), corrige los issues en tu nuevo diseno.

Las reglas del index tienen id (R01, SE01, DA01...). Si una regla especifica te es critica y necesitas mas detalle del que da el index de una linea, puedes pedirlo en tu respuesta incluyendo el campo \`needs_rule_details: ["R01", "R10"]\` junto al flow_data preliminar. Si lo haces, recibiras una segunda llamada con el detalle expandido (expansion pass) de esas reglas bajo la key \`expanded_rules\` en el input, y entonces deberas devolver el flow_data definitivo (ya sin needs_rule_details). Usa este mecanismo solo si realmente lo necesitas; el index suele ser suficiente.

Responde SOLO con JSON:
{
  "name": "Nombre del canvas <50 chars",
  "description": "Descripcion <200 chars",
  "flow_data": {
    "nodes": [ { "id": "n1", "type": "agent", "data": { "agentId": "...", "instructions": "INPUT: {...}\\nOUTPUT: {...}\\n..." }, "position": { "x": 100, "y": 100 } } ],
    "edges": [ { "id": "e1", "source": "n1", "target": "n2" } ]
  },
  "needs_cat_paws": [ { "name": "...", "system_prompt": "...", "reason": "..." } ]
}`;
```

**Hechos:**
- ~60 líneas, 9 secciones (intro, reglas, tipos, mapeo, contratos, anti-patterns, QA review, needs_cat_paws, JSON shape).
- Cero ejemplos completos de un nodo bien escrito vs mal escrito.
- La sección "DATA CONTRACTS OBLIGATORIOS" formula R10 como una regla universal: "Si recibe JSON y devuelve JSON, incluye 'Manten TODOS los originales intactos'". Sin condicionales por tipo o rol de nodo.
- El esquema JSON al final solo muestra `{ id, type, data: { agentId, instructions }, position }`. No menciona `connectorId`, no menciona shape de input para connectors, no menciona role.
- La instrucción para nodos `connector` es **una sola línea**: `"'connector' con data.connectorId para email/drive/http/mcp"`. No explica qué shape de JSON debe producir el nodo predecesor para que el connector sepa qué hacer.

**Razonamiento (mi criterio):**

El prompt está bien estructurado pero sufre **3 problemas de fondo**:

1. **Trata todos los nodos como si fueran la misma cosa.** Solo distingue por `node.type`, que es estructural. No tiene vocabulario para razonar sobre el rol funcional (extractor vs transformer vs renderer vs emitter). Esto se traslada al LLM, que tampoco tiene ese vocabulario y aplica las mismas reglas (R10) a todos los nodos.

2. **Define qué deben tener las instructions (`INPUT:/OUTPUT:` prefix), pero no enseña a escribir el contenido.** El contenido es el cuerpo de la instruction después del prefix — y ahí es donde los humanos escriben "PASO 1, PASO 2..." con tools concretos y los LLMs escriben "Procesa los datos.". El prompt no muestra ejemplos de instructions ricas, así que el LLM hace lo mínimo.

3. **La instrucción para `connector` es opaca.** Dice que `connector` necesita `connectorId` pero no explica que el nodo predecesor debe producir un JSON con shape específica (ej: para Gmail send_report, necesita `{ accion_final: 'send_report', report_to, report_subject, report_template_ref, results }`). Esa shape la conoce solo el executor (ver P4). El architect está volando a ciegas y termina mapeando "enviar email" → `type: 'agent'` (ver P9, ese es exactamente el bug del Holded Q1 original).

Si solo tuviera que resumir el diagnóstico de P1: **el prompt enseña sintaxis pero no semántica.** Y la ausencia de ejemplos amplifica el problema 10x — los LLMs aprenden por imitación, no por descripción.

---

### P2. `CANVAS_QA_PROMPT` y la formulación de R10

**Evidencia** ([catbot-pipeline-prompts.ts:75-114](app/src/lib/services/catbot-pipeline-prompts.ts#L75-L114)):

```ts
export const CANVAS_QA_PROMPT = `Eres el Canvas QA Reviewer. Recibes: rules_index, canvas_proposal (flow_data), tasks originales, resources. Tu trabajo: auditar el canvas contra las reglas de diseno y devolver un reporte estricto en JSON.

REGLAS DE DISENO:
{{RULES_INDEX}}

CHECKLIST OBLIGATORIO:
1. Data contracts (R01, R10, R13): cada nodo tiene INPUT:+OUTPUT: en sus instructions? Los OUTPUT del nodo N coinciden 1:1 con los INPUT del nodo N+1? Los nombres de campo son canonicos?
2. Arrays & loops (R02, R14): hay arrays >1 item siendo pasados a nodos con tool-calling fuera de un iterator?
3. Responsabilidades (R05, R06, R20, R23): algun nodo mezcla pensamiento y ejecucion? Alguna instruccion hace logica de negocio que deberia estar en skill?
4. Side effects: hay nodos send/write/upload/create/delete sin guard condition antes? (NOTA: el post-procesador insertara guards automaticamente, pero el architect debe anticipar su ubicacion final).
5. Anti-patterns DA01-DA04.

Para cada issue encontrado asigna severity:
- 'blocker': el canvas fallara en runtime o producira output vacio/incorrecto garantizado
- 'major': alta probabilidad de fallo o resultado suboptimo
- 'minor': mejora pero no critico

RECOMENDACION:
- 'accept' si quality_score >= 80 Y ningun blocker
- 'revise' si hay blockers o quality_score < 80 pero el diseno es rescatable
- 'reject' si el diseno no se puede rescatar (falta fundamental de entender la tarea)
[...]
```

R10 en el rules index ([canvas-rules-index.md:7](app/data/knowledge/canvas-rules-index.md#L7)):

```
R10: JSON in -> JSON out. Mantener TODOS los campos originales; anadir solo los nuevos
```

**Hechos:**
- R10 está formulada como **imperativo universal**: "JSON in → JSON out. Mantener TODOS los campos originales".
- Cero condicionales (`solo si`, `cuando el nodo es`, `excepto en`).
- En el CHECKLIST del prompt, R10 va agrupada con R01 y R13 bajo el bullet "Data contracts": "cada nodo tiene INPUT:+OUTPUT: en sus instructions? Los OUTPUT del nodo N coinciden 1:1 con los INPUT del nodo N+1?". El reviewer entiende esto como: **cada nodo, sin excepción**, debe preservar el contrato.
- El reviewer asigna severity automáticamente. R10 violada en un emitter → severity `major` por default (porque no es un blocker estructural, pero "alta probabilidad de fallo" según su propia definición).
- Threshold de accept: `quality_score >= 80` Y `ningún blocker`. Un canvas con 3 issues `major` por R10 baja el score por debajo de 80 → revise garantizado.

**Razonamiento:**

R10 está mal escrita por dos razones independientes que se amplifican:

1. **No tiene scope.** "JSON in → JSON out" presupone que todos los nodos tienen un input JSON significativo y un output JSON significativo. Pero un emitter (Gmail send) tiene como input un JSON estructurado y como output un ack `{ ejecutado: true, accion_tomada: 'respondido' }` que NO es el input enriquecido. El reviewer no sabe esto y exige que el ack contenga "html_body" + "facturacion_q1_2025" + etc.

2. **Está formulada en negativo amplificado.** "Mantener **TODOS** los campos originales" — ese "TODOS" en mayúsculas es lo que el LLM reviewer toma como prior absoluto. Cualquier nodo cuyo output no incluya literalmente todos los campos del input dispara la regla. Esto es coherente con R11 del propio rules index ("Decir QUE hacer, no prohibir") — pero R10 viola R11 al ser un imperativo absoluto sin escape.

El resultado lo vimos en el caso 4 del audit: el reviewer flaggea R10 en n3, n4, n5 simultáneamente, score 70-75, recommendation revise, exhaustion. **El reviewer está siendo obediente a una regla que, tal como está escrita, es inaplicable a 4 de los 7 roles funcionales.** No es un bug del reviewer; es un bug de R10.

---

### P3. ¿Hay ejemplos en `ARCHITECT_PROMPT`? ¿Diferencia entre `connector` vs `agent`?

**Evidencia:** El único ejemplo en todo el ARCHITECT_PROMPT es el esquema JSON al final:

```json
{
  "nodes": [ { "id": "n1", "type": "agent", "data": { "agentId": "...", "instructions": "INPUT: {...}\\nOUTPUT: {...}\\n..." }, "position": { "x": 100, "y": 100 } } ],
  "edges": [ { "id": "e1", "source": "n1", "target": "n2" } ]
}
```

Para nodos `connector`, **el ejemplo en el JSON shape es inexistente** — solo se menciona en una línea: `"'connector' con data.connectorId para email/drive/http/mcp"`.

**Hechos:**
- 0 ejemplos completos de instructions de un nodo (ni bueno ni malo).
- 0 ejemplos contrastados (good vs bad).
- 0 ejemplos por tipo de nodo (no hay un ejemplo de `connector`, otro de `agent`, otro de `iterator`).
- El esquema JSON al final usa `agent` como único caso. La forma de un `connector` no aparece.
- El bullet point para `connector` no menciona qué shape debe tener el output del nodo predecesor para que el connector funcione.

**Razonamiento:**

Esta es la asimetría más cara del prompt. El architect tiene **toda** la información sobre cómo escribir un agent (mira el esquema), pero **cero** información sobre cómo escribir un connector. ¿Qué hace en consecuencia? Lo que vimos en el flow_data del Holded canvas (P9): mapea "enviar email" a un nodo `type: 'agent'` con `instructions: "Enviar el documento maquetado por correo a antonio@..."`. El LLM recurre al patrón que sí conoce (agent + instructions textuales) en vez del que no conoce (connector + JSON estructurado predecesor).

Esto es prompt engineering 101: **lo que no muestres con un ejemplo, el LLM lo va a hacer mal o evitarlo.** Phase 132 invirtió mucho esfuerzo en el rules index (32 reglas) y la infraestructura del QA loop, pero no incluyó **ni un solo ejemplo** de instruction profesional. El rules index es una checklist, no es pedagogía.

La diferencia connector vs agent es invisible para el LLM hoy. Eso explica directamente por qué los canvases generados nunca consiguen producir el contrato `{ accion_final, report_to, ... }` que el executor espera.

---

## BLOQUE 2 — El executor como fuente de verdad

### P4. ¿Qué lee `canvas-executor.ts` de un nodo `connector` Gmail send?

**Evidencia** ([canvas-executor.ts:643-991](app/src/lib/services/canvas-executor.ts#L643-L991), extractos):

```ts
case 'connector': {
  const connectorId = data.connectorId as string;
  if (!connectorId) return { output: predecessorOutput };

  const connector = db.prepare('SELECT * FROM connectors WHERE id = ? AND is_active = 1').get(connectorId) as ...
  if (!connector) return { output: predecessorOutput };

  // Gmail connector: deterministic action based on predecessor JSON
  if ((connector.type as string) === 'gmail') {
    const gmailConfig: GmailConfig = connector.config ? JSON.parse(connector.config as string) : {};

    // Try to parse structured action from predecessor (new deterministic pattern)
    let actionData: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(predecessorOutput);
      if (parsed && typeof parsed === 'object' && parsed.accion_final) {
        actionData = parsed;
      }
      // Also detect auto_report: if node has flag and input is array, wrap as send_report
      if (!actionData && data.auto_report && Array.isArray(parsed)) {
        actionData = {
          accion_final: 'send_report',
          report_to: (data.report_to as string) || 'antonio@educa360.com',
          report_template_ref: (data.report_template_ref as string) || null,
          ...
        };
      }
    } catch { /* not structured JSON — fall through to legacy behavior */ }
```

Y dentro del bloque `send_report`:

```ts
} else if (accion === 'send_report') {
  const reportTo = (actionData.report_to as string) || 'antonio@educa360.com';
  const reportSubject = (actionData.report_subject as string) || `📊 Informe Inbound Diario — ...`;
  const reportRefCode = (actionData.report_template_ref as string) || null;
  // ... lee actionData.results, actionData.items, construye HTML, llama sendEmail
```

**Hechos:**
- El connector Gmail **NO lee `data.instructions`**. Cero referencias a `data.instructions` en el bloque connector.
- Lee de `node.data`: `connectorId` (obligatorio), `auto_report` (flag opcional), `report_to`, `report_template_ref` (defaults para auto_report).
- El **resto de la información viene del `predecessorOutput`** parseado como JSON. El predecessor debe producir un objeto con `accion_final` ∈ `{ mark_read, forward, send_reply, send_report }` y los campos específicos de cada acción:
  - `mark_read`: necesita `messageId`
  - `forward`: necesita `forward_to`, `subject`, `resumen_derivacion`/`body`
  - `send_reply`: necesita `respuesta: { plantilla_ref, saludo, cuerpo, email_destino, ... }`, `messageId`, `replyMode`
  - `send_report`: necesita `report_to`, `report_subject`, `report_template_ref`, `results: [...]`
- Si el predecessor NO produce JSON con `accion_final`, el connector cae al **legacy behavior** (`parseOutputToEmailPayload`) que es un parser regex frágil.

**Razonamiento:**

Esta es la verdad inconveniente que ni el architect ni el reviewer conocen: **el contrato real entre un nodo agent y un nodo connector Gmail es `{ accion_final: ..., ...campos específicos }`, NO una instruction textual.** El connector ignora completamente lo que el architect escribe en `data.instructions`.

Por lo tanto:
- Cualquier instruction que el architect ponga en un connector node es decoración. No tiene efecto runtime.
- El reviewer, al validar R10 sobre las instructions del connector, está evaluando **algo que el executor nunca lee**.
- El verdadero gap no es "instructions más ricas" — es que el architect debe **enseñar al nodo predecessor a producir el JSON correcto**. Y eso requiere que el architect sepa qué shape produce cada tipo de connector. Que actualmente no sabe.

Esto cambia el enfoque de Phase 133 ligeramente: el rediseño de prompts no es solo sobre instructions ricas. Es sobre **enseñar al architect que ciertos nodos (connector, storage, multiagent) tienen contratos de input declarativos que el executor parsea, y que el predecessor debe producir ese contrato como su output**.

---

### P5. ¿Cómo construye el executor el system prompt para un nodo `agent`?

**Evidencia** ([canvas-executor.ts:461-536](app/src/lib/services/canvas-executor.ts#L461-L536)):

```ts
case 'agent': {
  const agentId = (data.agentId as string) || null;

  if (agentId) {
    const catPaw = db.prepare('SELECT id FROM cat_paws WHERE id = ? AND is_active = 1').get(agentId) as ...
    if (catPaw) {
      const pawInput: CatPawInput = {
        query: (data.instructions as string) || predecessorOutput || 'Procesa la informacion.',
        context: predecessorOutput || undefined,
      };
      const extraSkillIds = (data.skills as string[]) || [];
      const extraConnectorIds = (data.extraConnectors as string[]) || [];
      const extraCatBrainIds = (data.extraCatBrains as string[]) || [];
      const pawResult = await executeCatPaw(agentId, pawInput, {
        ...(extraSkillIds.length > 0 ? { extraSkillIds } : {}),
        ...(extraConnectorIds.length > 0 ? { extraConnectorIds } : {}),
        ...(extraCatBrainIds.length > 0 ? { extraCatBrainIds } : {}),
      });
      // ... return pawResult.answer
    }
  }

  // Fallback: existing agent logic for custom_agents (no CatPaw match)
  const model = (data.model as string) || await resolveAlias('canvas-agent');
  const instructions = (data.instructions as string) || 'Procesa la siguiente información.';
  // ... RAG injection ...
  const systemPrompt = `Eres un agente especializado. ${instructions}\n\nResponde siempre en español.`;
  const result = await callLLM(model, systemPrompt, userContent);
```

**Hechos:**
- Hay **dos paths** distintos según si `data.agentId` apunta a un CatPaw existente o no:
  - **Path A (CatPaw):** llama `executeCatPaw(agentId, { query, context }, { extraSkills, extraConnectors, extraCatBrains })`. La `query` es `data.instructions || predecessorOutput`. El system prompt completo se construye dentro de `executeCatPaw` (en `catpaw-runner.ts`), no aquí. Es decir: **`data.instructions` se inyecta como `query`/`user input`**, no como system prompt. El system prompt real es el del CatPaw (`cat_paws.system_prompt`).
  - **Path B (custom_agents fallback):** construye literalmente `Eres un agente especializado. ${instructions}\n\nResponde siempre en español.` Aquí sí, las `data.instructions` van como sufijo del system prompt.
- En path A las extras (`data.skills`, `data.extraConnectors`, `data.extraCatBrains`) se PASAN como overrides a `executeCatPaw` y se mergean con la base del CatPaw.
- En ningún caso `data.instructions` "sobreescribe" el comportamiento del CatPaw — en path A se convierte en parte del input del usuario. Es como si el CatPaw recibiera un prompt adicional.

**Razonamiento:**

Hay aquí una sutileza importantísima que el architect ignora:

- Si el architect mapea un nodo a un CatPaw existente (path A), las `instructions` que escribe **no son system prompt**, son **un parámetro de query**. Se concatenan al input del usuario. El comportamiento base del CatPaw (su personalidad, sus tools always-allowed, su skill set base) NO cambia.
- Si el architect mapea un nodo sin agentId válido (path B), las `instructions` **sí son system prompt** (inyectado tras "Eres un agente especializado.").

El architect actual no distingue entre los dos casos. Escribe instructions del estilo "Extraer los datos crudos de facturación..." que son razonables como query, pero claramente débiles como system prompt (vimos en P15 que estas instructions tienen 100-300 chars vs los 500-700 chars de las instructions hand-crafted).

Esto añade otra dimensión al Phase 133:
- Para nodos con CatPaw: la instruction debe leerse como **directiva específica para esta tarea concreta**, asumiendo que el CatPaw ya tiene su personalidad base.
- Para nodos sin CatPaw: la instruction debe ser **completamente self-contained** — system prompt + tarea + contrato de datos.

El architect actual produce instructions tipo (1) en todos los casos, lo que falla cuando el CatPaw escogido no es lo bastante específico para la tarea.

---

### P6. ¿Qué devuelve el executor como output de un connector Gmail send?

**Evidencia** ([canvas-executor.ts:973-991](app/src/lib/services/canvas-executor.ts#L973-L991)):

```ts
} else if (accion === 'send_report') {
  // ... build report, sendEmail ...
  result.ejecutado = true;
  result.accion_tomada = 'informe_enviado';
  result.destinatario_final = reportTo;
  result.plantilla_usada = usedTemplateId;
  result.stats = { respondidos, derivados, leidos, errores, total: items.length };
  ...
}
} catch (err) {
  result.ejecutado = false;
  result.error = (err as Error).message;
  ...
}

return { output: JSON.stringify(result) };
```

Y para `send_reply`:

```ts
result.ejecutado = true;
result.accion_tomada = 'respondido';
result.destinatario_final = emailDestino;
result.plantilla_usada = templateId;
result.html_body_length = htmlBody.length;
```

**Hechos:**
- El output del executor para un Gmail connector es siempre `JSON.stringify(result)`, donde `result` parte de los `actionData` del predecesor (`{ ...actionData, ejecutado: false }`) y se le añaden los campos `ejecutado`, `accion_tomada`, `destinatario_final`, `plantilla_usada`, `html_body_length`/`stats`.
- Es **un string JSON**, no un objeto. Cualquier nodo downstream que quiera consumirlo debe hacer `JSON.parse(predecessorOutput)`.
- El `result` mantiene los campos del `actionData` original (porque parte de `{...actionData}`), pero en términos de dato útil downstream solo añade los 4-5 campos del envío en sí (ejecutado, acción tomada, destinatario, template, longitud).
- El path legacy (cuando no hay `accion_final` parseable) devuelve `{ output: predecessorOutput }` — es decir, **no añade nada**, solo pasa el predecessor adelante. Esto significa que en el caso degradado el connector es transparente, no terminal.

**Razonamiento:**

Aquí está la ironía completa de R10 aplicada al Gmail emitter en el caso Holded:

- El reviewer flaggea n5 con: *"Añade 'html_body' al OUTPUT de n5 junto con 'status'"*.
- Pero el output REAL del executor para un Gmail connector ya devuelve un objeto que **incluye los campos del actionData original más los del envío** (porque hace `{ ...actionData }`). Es decir: si el predecessor le pasara `{ accion_final, report_to, results, html_body }`, el output ya tendría `html_body`.
- El problema NO es que n5 no preserve campos. El problema es que n4 (el predecessor del emitter) no produjo un actionData con `accion_final` correcto. El reviewer está aplicando R10 a la víctima en vez de al culpable.

Más importante todavía: **un emitter es terminal por diseño**. Su output (`{ ejecutado: true, accion_tomada: 'informe_enviado', ... }`) no se va a consumir downstream — porque no hay downstream. R10 sobre un nodo terminal es semánticamente vacuo.

Conclusión para Phase 133: **el reviewer necesita saber qué nodos son terminales** (no tienen edges salientes hacia otro nodo significativo) y desactivar R10 en ellos. Esto es un cambio simple en el QA prompt: añadir un check estructural en el checklist.

---

### P7. ¿`VALID_NODE_TYPES` está sincronizado con el switch del executor?

**Evidencia:**

`VALID_NODE_TYPES` post hotfix-B ([canvas-flow-designer.ts:26-41](app/src/lib/services/canvas-flow-designer.ts#L26-L41)):

```ts
export const VALID_NODE_TYPES = [
  'start',
  'agent',
  'catpaw',
  'catbrain',
  'condition',
  'iterator',
  'iterator_end',
  'merge',
  'multiagent',
  'scheduler',
  'checkpoint',
  'connector',
  'storage',
  'output',
] as const;
```
**14 tipos.**

Switch del executor (`grep "case '" canvas-executor.ts` filtrado a node types):

```
448: case 'start':
461: case 'agent':
539: case 'catpaw':
571: case 'catbrain':
572: case 'project':         ← backward compat alias
643: case 'connector':
1350: case 'checkpoint':
1355: case 'merge':
1392: case 'condition':
1415: case 'output':
1487: case 'scheduler':
1530: case 'storage':
1633: case 'multiagent':
1755: case 'iterator':
1824: case 'iterator_end':
```
**15 cases**, pero `'project'` (línea 572) es un alias de backward compat para canvases viejos donde `catbrain` se llamaba `project`.

**Comparación:**

| Tipo | VALID_NODE_TYPES | executor switch | Sync |
|------|------------------|-----------------|------|
| start | ✅ | ✅ | OK |
| agent | ✅ | ✅ | OK |
| catpaw | ✅ | ✅ | OK |
| catbrain | ✅ | ✅ | OK |
| project | ❌ | ✅ (backward compat) | Aceptable (legacy) |
| condition | ✅ | ✅ | OK |
| iterator | ✅ | ✅ | OK |
| iterator_end | ✅ | ✅ | OK |
| merge | ✅ | ✅ | OK |
| multiagent | ✅ | ✅ | OK |
| scheduler | ✅ | ✅ | OK |
| checkpoint | ✅ | ✅ | OK |
| connector | ✅ | ✅ | OK |
| storage | ✅ | ✅ | OK |
| output | ✅ | ✅ | OK |

**Hechos:**
- Los 14 tipos de `VALID_NODE_TYPES` están todos presentes en el switch del executor.
- El executor además tiene un caso adicional `'project'` que es un alias legacy para `catbrain` — no debería usarse en canvases nuevos pero existe por compatibilidad. NO está en VALID_NODE_TYPES (correcto: el architect no debería generarlo).
- Sincronización efectiva: ✅ post hotfix-B.

**Razonamiento:**

La sincronización está OK ahora. Pero el aprendizaje del incidente sigue vigente: tener dos fuentes de verdad (`VALID_NODE_TYPES` array vs el `switch` del executor) es deuda estructural. Cualquier nuevo tipo que se añada al executor sin tocar el array repetirá el bug del caso 3 del audit.

Recomendación táctica para Phase 133 (no es requisito, pero es low cost):
- Generar `VALID_NODE_TYPES` desde un test de sincronización que parsee los `case` del executor con regex y los compare al array. Si no coincide → fail. Es el patrón KTREE-02 del knowledge tree pero aplicado al canvas.
- O documentar en el header del archivo `canvas-flow-designer.ts` que esta lista debe mantenerse sincronizada y dónde mirar.

No es bloqueante. Solo es seguro futuro.

---

## BLOQUE 3 — El fallo real de Holded Q1

### P8. ¿`knowledge_gap` del caso Holded Q1?

**Evidencia (consulta directa a `catbot.db` en el contenedor):**

```json
{
  "id": "e52b4907-70c3-49f4-8117-e42226d450bc",
  "knowledge_path": "catflow/design/quality",
  "query": "Pipeline architect could not produce acceptable canvas for job 7947f7bc-... after 2 iterations",
  "context": {
    "job_id": "7947f7bc-b196-4a3a-8771-5356fc10c234",
    "goal": "Extraer facturación Q1 2025 y Q1 2026 de Holded, generar comparativa ejecutiva, maquetar con plantilla corporativa y enviar por email a antonio@educa360.com y fen@educa360.com.",
    "last_qa_report": {
      "quality_score": 75,
      "issues": [
        {
          "severity": "major",
          "rule_id": "R10",
          "node_id": "n3",
          "description": "El nodo no mantiene los campos originales del input en su output.",
          "fix_hint": "Añade 'facturacion_q1_2025' y 'facturacion_q1_2026' al OUTPUT de n3."
        },
        {
          "severity": "major",
          "rule_id": "R10",
          "node_id": "n4",
          "description": "El nodo no mantiene los campos originales del input en su output.",
          "fix_hint": "Añade 'comparativa_ejecutiva' (y los campos anteriores) al OUTPUT de n4."
        },
        {
          "severity": "major",
          "rule_id": "R10",
          "node_id": "n5",
          "description": "El nodo no mantiene los campos originales del input en su output.",
          "fix_hint": "Añade 'html_body' al OUTPUT de n5 junto con 'status'."
        },
        {
          "severity": "minor",
          "rule_id": "R20",
          "node_id": "n_merge",
          "description": "El nodo merge tiene instrucciones como si fuera un LLM.",
          "fix_hint": "Los nodos merge ejecutan código para fusionar JSONs, no necesitan instrucciones de prompt."
        }
      ],
      "data_contract_analysis": {
        "start->n1": "ok",
        "start->n2": "ok",
        "n1->n_merge": "ok",
        "n2->n_merge": "ok",
        "n_merge->n3": "ok",
        "n3->n4": "broken: n3 omite los campos de facturación en su output, violando R10",
        "n4->n_guard": "broken: n4 omite comparativa_ejecutiva en su output, violando R10",
        "n_guard->n5": "ok"
      },
      "recommendation": "revise"
    }
  },
  "reported_at": "2026-04-10 23:19:08"
}
```

**Hechos:**
- 4 issues totales: 3 majors de R10 (n3, n4, n5) + 1 minor de R20 (n_merge).
- `data_contract_analysis` reporta 7 edges, 5 OK + 2 broken (n3→n4, n4→n_guard).
- Topología observable de los node_ids: `start` + `n1, n2` (paralelos extractores) + `n_merge` + `n3` (synthesizer) + `n4` (renderer) + `n_guard` (auto-insertado por hotfix-A) + `n5` (emitter Gmail).
- El architect generó un canvas con `n_merge` (merge node), `n_guard` (lo insertó el post-procesador `insertSideEffectGuards`), y los 5 nodos funcionales (n1-n5).
- `quality_score: 75` < 80 → revise. Con 3 majors → revise. Doble disparo.

**Razonamiento:**

Confirma con datos lo que era hipótesis: **el reviewer flaggea R10 en cadena por todo el pipeline porque su criterio mecánico no entiende rol funcional**. n3 sintetiza, n4 renderiza, n5 emite — los tres son flaggeados por la misma regla con el mismo wording. El minor de R20 sobre n_merge es interesante (es correcto: el reviewer sí captó que un merge no debe tener instrucciones LLM), pero está clasificado como minor mientras los R10 absurdos son majors. Eso confirma que el calibrado de severities está roto.

Lo que NO se guardó: **el `flow_data` del intento del architect**. Solo se persistió el `qa_report`. Esto es relevante para P13 — la exhaustion no preserva la propuesta del arquitecto, solo el reporte del crítico. Para Phase 133 esto se debe arreglar porque sin el `flow_data` literal no podemos diagnosticar offline qué instructions exactas escribió el architect.

---

### P9. ¿`flow_data` del canvas fallido / `data.instructions` del nodo n5?

**Evidencia:**

El canvas del intento que falló (job `7947f7bc...`) **no fue persistido en `canvases`** — `canvas_id IS NULL` en el row de `intent_jobs`, y `finalizeDesign` nunca se ejecutó porque `runArchitectQALoop` retornó null en exhaustion (ver P12-P13 más abajo).

Lo que sí está persistido: el **canvas inmediatamente anterior** (Holded Q1 original, pre-Phase 132, creado 2026-04-10 20:25:34, ID `6d8c9924-dc36-42a2-9ba0-f8583d17ec85`):

```json
{
  "name": "Comparativa Facturación Q1 Holded",
  "nodes": [
    {
      "id": "n1", "type": "agent",
      "data": {
        "agentId": "5d8fbdd7-f008-4589-a560-a1e0dcc3e61a",
        "instructions": "Extraer los datos crudos de facturación correspondientes al primer trimestre (Q1) de 2025 desde Holded."
      }
    },
    {
      "id": "n2", "type": "agent",
      "data": {
        "agentId": "5d8fbdd7-f008-4589-a560-a1e0dcc3e61a",
        "instructions": "Extraer los datos crudos de facturación correspondientes al primer trimestre (Q1) de 2026 desde Holded."
      }
    },
    {
      "id": "n3", "type": "agent",
      "data": {
        "agentId": "executive-summary",
        "instructions": "Analizar y comparar los datos de facturación de Q1 2025 y Q1 2026 recibidos, generando un resumen contable a nivel ejecutivo."
      }
    },
    {
      "id": "n4", "type": "agent",
      "data": {
        "agentId": "e9860d40-4487-4d5b-be8d-1bf3f8ac7690",
        "instructions": "Aplicar la plantilla corporativa al análisis comparativo generado para darle formato de presentación oficial en HTML."
      }
    },
    {
      "id": "n5", "type": "agent",                                            ← ¡AGENT, no connector!
      "data": {
        "agentId": "65e3a722-9e43-43fc-ab8a-e68261c6d3da",
        "instructions": "Enviar el documento maquetado por correo electrónico a antonio@educa360.com y fen@educa360.com con el asunto 'Comparativa Ejecutiva Facturación Q1 2025 vs 2026'."
      }
    }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n3" },
    { "id": "e2", "source": "n2", "target": "n3" },
    { "id": "e3", "source": "n3", "target": "n4" },
    { "id": "e4", "source": "n4", "target": "n5" }
  ]
}
```

**Hechos:**
- **n5 es `type: 'agent'`, NO `type: 'connector'`.** El architect mapeó "enviar email" a un nodo agent con instrucciones textuales, en vez de a un connector con `connectorId`.
- Las instructions del n5 son una sola frase imperativa: "Enviar el documento maquetado por correo electrónico a antonio@educa360.com y fen@educa360.com con el asunto '...'".
- Length de las instructions: n1=103, n2=103, n3=156, n4=129, n5=180 chars. Todas single-sentence, sin estructura (no PASO 1, no INPUT/OUTPUT, no contrato).
- No hay nodo `connector` en este canvas, ni nodo `merge`, ni nodo `iterator`. Es un grafo lineal (n1 ∥ n2 → n3 → n4 → n5) con cinco agents.
- El `agentId` de n5 (`65e3a722-9e43-43fc-ab8a-e68261c6d3da`) es probablemente un CatPaw genérico de envío de correo. Sin un connector Gmail explícito, ese CatPaw debería tener tools `send_email` mediante su skill base — pero no hay garantía de que esos tools sepan extraer destinatarios desde una instruction de texto libre.

**Razonamiento:**

Esto es **el bug original Holded Q1 cristalizado**. El architect razonó: "necesito enviar un email → existe un CatPaw que envía emails → uso un agent node con su agentId". Lo que NO razonó: "necesito producir un payload estructurado para que el connector Gmail haga deterministic send_report".

¿Por qué? Porque:
1. El prompt no le explica que existe ese contrato deterministico (P3, P4).
2. El prompt presenta `connector` como una opción opaca de una línea.
3. El CatPaw "envío de email" probablemente existe y resuelve el `scanCanvasResources`, así que el architect lo escoge porque encaja semánticamente con la tarea.

Resultado: un canvas válido estructuralmente, ejecutable, pero **completamente incapaz de aplicar el template corporativo o extraer correctamente los destinatarios**. El email llega vacío porque el agent n5 recibe como input el HTML maquetado de n4 (un string largo sin estructura) y su CatPaw probablemente intenta enviar sin saber dónde está el destinatario, el subject, el template id, etc.

**Esta es la causa raíz que Phase 132 no atacó.** Phase 132 introdujo la QA loop pero el reviewer ahora flaggea problemas en canvases con n5='connector' (los nuevos, post hotfix-A) que tampoco son correctos. El problema NO es accept vs revise — el problema es que el architect **no tiene un modelo mental del contrato declarativo** que esperan los nodos terminales del executor.

---

## BLOQUE 4 — El rules index y su integridad

### P10. ¿Cuántas reglas tienen condiciones de aplicabilidad explícitas?

**Evidencia** ([canvas-rules-index.md](app/data/knowledge/canvas-rules-index.md)) — análisis literal de las 32 reglas:

| ID | Texto | Tiene condición? |
|----|-------|------------------|
| R01 | Define contrato JSON (input/output) entre TODOS pares de nodos ANTES de instructions | ❌ universal |
| R02 | N_items x tool_calls vs MAX_TOOL_ROUNDS(12). Si >60% -> ITERATOR o Dispatcher | ✅ condicional ("Si >60%") |
| R03 | Traducir problema de negocio a criterios tecnicos verificables | ❌ universal |
| R04 | Probar flujo minimo (START -> primer LLM -> Output) con datos reales antes | ❌ universal |
| R05 | Un nodo = una responsabilidad. Redactar+maquetar+seleccionar = dividir | ❌ universal |
| R06 | Conocimiento de negocio en SKILLS, no en instructions del nodo | ❌ universal |
| R07 | CatBrain=text-to-text. Agent con CatBrain=JSON-to-JSON con RAG. Arrays = SIEMPRE Agent | ⚠️ semi (diferencia por tipo) |
| R08 | No vincular conectores ni skills innecesarios. Cada tool confunde al LLM | ❌ universal |
| R09 | CatPaws genericos, especializacion en el canvas (extras del nodo) | ❌ universal |
| R10 | JSON in -> JSON out. Mantener TODOS los campos originales; anadir solo los nuevos | ❌ universal (CRÍTICO) |
| R11 | Decir QUE hacer, no prohibir | ❌ universal |
| R12 | Especificar SIEMPRE "PASA SIN MODIFICAR" para items que el nodo debe ignorar | ⚠️ semi (cuando hay items a ignorar) |
| R13 | Nombres canonicos identicos a lo largo del pipeline | ❌ universal |
| R14 | Arrays + tool-calling = ITERATOR siempre. Jamas arrays >1 item a nodos tool-calling | ✅ condicional ("Arrays + tool-calling") |
| R15 | Cada nodo LLM recibe cantidad MINIMA de info. Recorta body, limita campos | ⚠️ semi ("LLM nodes") |
| R16 | Max Tokens = estimacion realista del output | ❌ universal |
| R17 | Todo LLM es probabilistico. Asumir basura. Planificar contratos, ITERATOR, fallbacks | ⚠️ semi ("nodos LLM") |
| R18 | Toda plantilla con contenido dinamico NECESITA >=1 bloque instruction | ✅ condicional ("plantilla con contenido dinamico") |
| R19 | Separar seleccion de plantilla (skill) de maquetacion (tools) | ⚠️ semi (cuando hay templates) |
| R20 | Si puede hacerse con codigo, NO delegar al LLM | ❌ universal |
| R21 | El codigo SIEMPRE limpia output del LLM | ❌ universal |
| R22 | Referencias entre entidades usan RefCodes (6 chars), lookup tolerante | ❌ universal |
| R23 | Separar nodos de pensamiento (LLM) de nodos de ejecucion (codigo) | ❌ universal |
| R24 | Nunca fallback destructivo. Input corrupto -> vacio, no inventar | ❌ universal |
| R25 | Idempotencia obligatoria. Registrar messageId procesados | ❌ universal |
| SE01 | Antes de cada send/write/upload/create -> insertar condition guard automatico | ✅ condicional ("antes de cada send/write...") |
| SE02 | Guard valida que el contrato de entrada tiene TODOS los campos requeridos no vacios | ❌ universal (sobre guards) |
| SE03 | Si guard.false -> agent reportador auto-repara via CatBot 1 vez | ✅ condicional ("Si guard.false") |
| DA01 | No pases arrays >1 item a nodos con tool-calling interno | ✅ condicional |
| DA02 | No enlaces connectors/skills que el nodo no va a usar | ❌ universal |
| DA03 | No generes URLs con LLM, usa campos especificos del output del tool | ❌ universal |
| DA04 | No dependas de datos fuera del input explicito del nodo | ❌ universal |

**Conteo:**
- **Condiciones explícitas:** 6 (R02, R14, R18, SE01, SE03, DA01) — 18.75%
- **Semi-condicionales (mencionan tipo de nodo):** 5 (R07, R12, R15, R17, R19) — 15.6%
- **Universales sin escape:** 21 (incluida R10) — 65.6%

**Razonamiento:**

Casi 2/3 de las reglas están escritas como imperativos universales. Esto es funcional para reglas que **realmente** son universales (R03, R04, R11, R20, R23 son sentido común que siempre aplica), pero es **catastrófico** para reglas que SÍ tienen scope natural y no lo declaran (R10, R13, R15, R17).

R10 es la reina del problema porque:
1. Es universal en redacción ("JSON in → JSON out, **TODOS**").
2. Pero solo aplica a transformers/synthesizers en la práctica.
3. Cuando el reviewer la aplica a renderers/emitters/guards (los otros 5 roles), genera falsos positivos sistemáticos.

R13 es el segundo candidato a problema futuro: "Nombres canónicos idénticos a lo largo del pipeline". Esto es razonable cuando hay un flujo de datos coherente, pero un emitter que produce `{ ejecutado, accion_tomada }` no comparte vocabulario con un extractor que produce `{ invoices, period }`. Cuando un usuario ejecute un caso con renombrado intencional entre fases, el reviewer va a flaggear R13 y vamos a estar de vuelta aquí.

R15, R17 hablan de "nodos LLM" pero no definen qué es un nodo LLM. Un agent con CatPaw es LLM. Un connector NO. Un merge NO. Un guard SÍ (es un agent invocado por el executor). Esa ambigüedad alimenta inconsistencias.

**Recomendación de Phase 133 (relacionada con la taxonomía de roles del audit):** reescribir cada regla con la sintaxis explícita `Aplica a: [extractor, transformer, synthesizer, renderer, emitter, guard, reporter]`, reemplazar "TODOS" por una lista cerrada, y usar el mismo vocabulario tanto en architect como en reviewer.

---

### P11. ¿`canvas-nodes-catalog.md` está en el contenedor?

**Evidencia (consulta directa al contenedor):**

```bash
$ docker exec docflow-app ls /app/.planning/knowledge/canvas-nodes-catalog.md /app/data/knowledge/canvas-nodes-catalog.md
ls: cannot access '/app/.planning/knowledge/canvas-nodes-catalog.md': No such file or directory
ls: cannot access '/app/data/knowledge/canvas-nodes-catalog.md': No such file or directory
```

Listado completo de `/app/data/knowledge/`:

```
_index.json
_template.json
canvas-rules-index.md   ← presente
canvas.json
catboard.json
catbrains.json
catflow.json
catpaw.json
catpower.json
settings.json
```

**Hechos:**
- `canvas-nodes-catalog.md` **NO está en el contenedor**, ni en `/app/.planning/knowledge/` ni en `/app/data/knowledge/`.
- El gap secundario documentado en el audit §11 sigue abierto.
- En consecuencia, `getCanvasRule(R01)` ejecutado en producción **siempre devolverá null** para R01-R25 (porque el parser long-form lee desde `canvas-nodes-catalog.md`), y solo devolverá entradas para SE01-SE03 / DA01-DA04 que están inline en `canvas-rules-index.md`.

**Razonamiento:**

Esto significa que el mecanismo `needs_rule_details` que añadimos en Phase 132 está **muerto en producción para R01-R25**. Si el architect pide expansión de R10 ("dame el detalle largo de R10 antes de regenerar"), el `getCanvasRule('R10')` devuelve null y la expansion pass no añade nada nuevo. El architect repite el mismo error.

Es un bug silencioso: en `canvas-rules.ts:91-101` (parseRules), cuando catalogPath no existe el catch lo absorbe sin loggear (`catch { /* fall through */ }`). Los tests unitarios pasan porque montan un catalog mock en el repo local. **Producción y tests divergieron sin que ningún test lo cazara.**

Para Phase 133:
- Resolución mínima: añadir `cp -u /app/data-seed/.planning/knowledge/*.md` al docker-entrypoint.sh para llevar el catalog al volumen. Pero `.planning/` no se incluye en la imagen Docker actual (`Dockerfile` solo COPY `/app/data/knowledge`). Hay que mover `canvas-nodes-catalog.md` a `app/data/knowledge/` o copiar `.planning/knowledge/` aparte en la imagen.
- Resolución correcta: el long-form de R01-R25 debería vivir junto al index (`app/data/knowledge/canvas-rules-catalog.md`) y `canvas-rules.ts` debería leer de ahí. Una sola fuente de verdad, dentro del path de despliegue conocido.

---

## BLOQUE 5 — La infraestructura del QA loop

### P12. ¿Cómo decide `runArchitectQALoop` que un report es 'accept'?

**Evidencia** ([intent-job-executor.ts:355-391](app/src/lib/services/intent-job-executor.ts#L355-L391)):

```ts
// --- QA reviewer call ---
this.notifyProgress(job, `QA review iteracion ${iter}...`, true);
const qaRaw = await this.callLLM(
  qaSystem,
  JSON.stringify({ canvas_proposal: design, tasks, resources }),
);
const qaReport = this.parseJSON(qaRaw) as QaReport;

logger.info('intent-job-executor', 'QA review complete', {
  jobId: job.id,
  iteration: iter,
  recommendation: qaReport.recommendation,
  score: qaReport.quality_score,
  issueCount: Array.isArray(qaReport.issues) ? qaReport.issues.length : 0,
});

updateIntentJob(job.id, {
  progressMessage: {
    phase: 'architect',
    iteration: iter,
    qa_recommendation: qaReport.recommendation,
    qa_score: qaReport.quality_score,
    message: `QA iter ${iter}: ${String(qaReport.recommendation)}`,
  },
});

if (qaReport.recommendation === 'accept') {
  return design;
}

previousDesign = design;
previousQaReport = qaReport;
```

**Hechos:**
- La decisión de aceptar depende **únicamente** del campo `qaReport.recommendation === 'accept'`.
- `qaReport.quality_score` se **lee** (se loggea, se persiste en progress_message para observabilidad), pero **no se usa** en la decisión.
- No hay threshold numérico aplicado en código TypeScript.
- El threshold (`quality_score >= 80`) está **dentro del prompt** (CANVAS_QA_PROMPT línea 93), es decir, lo aplica el LLM reviewer cuando elige el campo `recommendation`. Si el LLM ignora el threshold y devuelve `recommendation: 'accept'` con score 60, el código lo aceptará igualmente.

**Razonamiento:**

Esto tiene dos consecuencias importantes:

1. **El reviewer es soberano de su propio veredicto.** Si el LLM tiene un mal día y devuelve `recommendation: 'accept'` sin justificación, el código no le hace double-check. Es una decisión consciente (delegar al LLM), pero significa que cualquier mejora del threshold tiene que ser un cambio de prompt, no de código.

2. **Para Phase 133, si introducimos `data_contract_score` y `instruction_quality_score` separados, hay dos opciones:**
   - **Opción A:** Mantener el flag binario en código y mover toda la lógica al prompt. Más simple, pero el threshold sigue siendo invisible para el código.
   - **Opción B:** Cambiar el código para que aplique el threshold compuesto: `accept iff data_contract_score >= 80 && blockers == 0`. El campo `recommendation` se vuelve opcional o un hint. Más explícito, más testeable, más resistente a un LLM que se equivoque en el flag.

Mi recomendación es **B** porque mueve la lógica de decisión a código TypeScript que sí podemos testear con casos sintéticos. Hoy no podemos testear "si el reviewer devuelve esto, el loop debe hacer lo otro" sin mockear el LLM completo.

---

### P13. ¿Qué se guarda en `knowledge_gap` cuando exhaustion?

**Evidencia** ([intent-job-executor.ts:393-420](app/src/lib/services/intent-job-executor.ts#L393-L420)):

```ts
// --- Loop exhausted: log knowledge gap + mark failed ---
logger.warn('intent-job-executor', 'QA loop exhausted without accept', {
  jobId: job.id,
});
try {
  saveKnowledgeGap({
    knowledgePath: 'catflow/design/quality',
    query: `Pipeline architect could not produce acceptable canvas for job ${job.id} after ${this.MAX_QA_ITERATIONS} iterations`,
    context: JSON.stringify({
      job_id: job.id,
      goal,
      last_qa_report: previousQaReport,
    }).slice(0, 4000),
  });
} catch (err) {
  logger.error('intent-job-executor', 'Failed to log knowledge gap after QA exhaustion', {
    error: String(err),
  });
}
```

Y la variable `previousQaReport` se setea solo desde el reviewer (línea 390), nunca el `previousDesign` se persiste.

**Hechos:**
- Se guarda en el `context` del knowledge_gap:
  - `job_id`
  - `goal`
  - `last_qa_report` (el último qa_report completo: quality_score, issues, data_contract_analysis, recommendation)
- **NO se guarda:**
  - El `flow_data` del último intento del architect (`previousDesign`).
  - Las iteraciones intermedias (solo el último qa_report sobrevive).
  - Tasks ni resources.
  - La traza completa de progress_messages.
- El `context` se trunca a 4000 chars con `.slice(0, 4000)`. El qa_report del caso Holded Q1 ocupó ~1.5KB, así que entró completo, pero un report con muchos issues podría ser truncado en silencio.

**Razonamiento:**

Esto es exactamente lo que mencioné en P8: **la exhaustion preserva la opinión del crítico pero no la propuesta del arquitecto**. Sin el `flow_data` literal del último intento no podemos:
- Reproducir offline qué exactamente generó el architect.
- Hacer test de regresión: "Si el architect produce este flow_data, ¿la nueva versión del prompt converge?".
- Auditar manualmente si el reviewer fue justo.
- Alimentar un dataset de fine-tuning futuro con (input, bad_output, qa_critique, fixed_output).

Para Phase 133 hay dos cambios mínimos en este path:

1. **Persistir `last_design: previousDesign`** en el context. Aumenta el tamaño del row (probablemente 2-5 KB extra) pero da observabilidad.
2. **Persistir `iteration_count` y `qa_score_trajectory: [iter0_score, iter1_score]`** para detectar si el loop está convergiendo (scores subiendo) o divergiendo (planos / bajando).

Y el fix del Caso 5 del audit (notificar al usuario en exhaustion) va aquí también: añadir antes del `markTerminal`:

```ts
const top2 = (previousQaReport?.issues ?? []).slice(0, 2)
  .map(i => `${i.rule_id}:${i.description}`).join(' | ');
this.notifyProgress(job, `❌ Pipeline fallo tras ${this.MAX_QA_ITERATIONS} iteraciones QA. Issues: ${top2}`, true);
```

---

### P14. ¿`notifyProgress` se llama en el QA loop? ¿Y en exhaustion?

**Evidencia** (`grep notifyProgress intent-job-executor.ts`):

```
166:   this.notifyProgress(job, `❌ Pipeline fallo: ${errShort}`, true);   ← catch en tick()
186:   this.notifyProgress(job, 'Procesando fase=strategist...');
193:   this.notifyProgress(job, 'Definiendo objetivo...', true);
197:   this.notifyProgress(job, 'Procesando fase=decomposer...');
208:   this.notifyProgress(job, `${taskCount} tareas identificadas`, true);
212:   this.notifyProgress(job, 'Procesando fase=architect (iter 0)...', true);
251:   this.notifyProgress(job, 'Procesando fase=architect (retry con QA loop)...', true);
299:   this.notifyProgress(job, `Architect iteracion ${iter}...`, true);
342:   this.notifyProgress(job, `Architect expansion pass (iter ${iter})...`, true);
360:   this.notifyProgress(job, `QA review iteracion ${iter}...`, true);
```

**Hechos:**
- `notifyProgress` existe y se llama **10 veces** en el archivo.
- Dentro del QA loop específicamente (`runArchitectQALoop`):
  - Línea 299: antes de la llamada al architect (force=true)
  - Línea 342: antes de la expansion pass si `needs_rule_details` (force=true)
  - Línea 360: antes de la llamada al reviewer (force=true)
- En el path de exhaustion (líneas 393-420): **NO se llama `notifyProgress`**.
- El único punto donde el usuario recibe notificación de fallo es el `catch` de `tick()` en línea 166, **pero solo si el error es una excepción lanzada**. El path `runArchitectQALoop` exhausted retorna null y propaga ese null hacia arriba sin lanzar excepción → el catch nunca se activa.

**Razonamiento:**

Confirma cuantitativamente lo que ya sabíamos del caso 5 del audit. El usuario recibe ~10 mensajes de progreso por Telegram durante una ejecución exitosa, pero **0 mensajes en el caso de exhaustion**. Es una experiencia rota — el usuario queda esperando indefinidamente, viendo "QA review iteracion 1..." como último mensaje.

El fix es trivial: añadir una llamada `notifyProgress(job, '❌ Pipeline fallo: QA loop exhausted...', true)` justo antes del `markTerminal(job.id)` en línea 419. Es 1 línea de código.

Por qué esto está en P14 y no se ha arreglado todavía: porque hicimos hotfix-A y hotfix-B sin revisar este path. El caso de exhaustion es raro en la práctica (los tests siempre mockean accept), así que pasó desapercibido hasta la primera ejecución real. Es exactamente el patrón del aprendizaje 5 del audit ("patches aislados amplifican riesgo").

---

## BLOQUE 6 — Lo que el architect produce en la práctica

### P15. ¿Cómo son las `data.instructions` de un nodo agent en canvases reales?

**Evidencia (instructions de canvases existentes en producción):**

**Canvases generados por architect (Phase 130/131/132):**

| Canvas | Nodo | Tipo | Length | Instruction |
|--------|------|------|--------|-------------|
| Comparativa Facturación Q1 Holded | n1 | agent | 103 | "Extraer los datos crudos de facturación correspondientes al primer trimestre (Q1) de 2025 desde Holded." |
| Comparativa Facturación Q1 Holded | n3 | agent | 156 | "Analizar y comparar los datos de facturación de Q1 2025 y Q1 2026 recibidos, generando un resumen contable a nivel ejecutivo." |
| Comparativa Facturación Q1 Holded | n5 | agent | 180 | "Enviar el documento maquetado por correo electrónico a antonio@... con el asunto 'Comparativa...'." |

**Canvases hand-crafted (humanos / casos de éxito):**

| Canvas | Nodo | Length | Instruction (preview) |
|--------|------|--------|----------------------|
| TEST Inbound Fase 5 | lector | 696 | "PASO 1: Calcular fecha hace 7 dias (formato YYYY/MM/DD).\nPASO 2: gmail_search_emails con query 'in:inbox after:{fecha}'\nPASO 3: gmail_search_emails con query 'in:sent after:{fecha}' y extraer threadIds\nPASO 4: Filtrar inbox: solo emails cuyo threadId NO este en sent..." |
| TEST Inbound Fase 5 | clasificador | 730 | "Recibes UN solo email (un objeto JSON, NO un array).\nClasificalo segun tu system prompt y la skill 'Leads y Funnel InfoEduca'.\n\nCRITICO: Devuelve el MISMO objeto con TODOS sus campos originales intactos (messageId, threadId, from, subject, body, date...)" |
| Informe Diario Negocio 14:00 | extractor-holded | 224 | "Consulta el pipeline de Holded:\n1. holded_list_leads (todos los deals abiertos)\n2. Agrupa por producto/etapa\n3. Calcula métricas: total_deals, valor_total, por_etapa, sin_movimiento_7d\nDevuelve JSON de métricas del pipeline." |
| Revisión Diaria Inbound | lector-emails | 749 | "PASO 1: Calcular fecha hace 7 dias (YYYY/MM/DD).\nPASO 2: gmail_search_emails query 'in:inbox after:{fecha}'\nPASO 3: gmail_search_emails query 'in:sent after:{fecha}'..." |
| Lead Hunting Educa360 | extractor ICP | 276 | "Analiza el contexto del producto recibido del nodo anterior y extrae de él el ICP real. NO uses un ICP predefinido. Basa el perfil de cliente ideal y las queries de búsqueda EXCLUSIVAMENTE en la información recibida. Responde SOLO con el JSON especificado." |

**Hechos:**
- **Architect:** instructions de **100-180 chars**, single-sentence imperative en lenguaje natural.
- **Hand-crafted:** instructions de **220-750 chars** (3-7x más largas), con estructura `PASO 1 / PASO 2 / ...`, nombres de tools concretos (`gmail_search_emails`, `holded_list_leads`), enumeración de campos esperados ("messageId, threadId, from, subject, body"), instrucciones de preservación explícitas ("MISMO objeto con TODOS sus campos originales").
- **Diferencia cualitativa:**
  - Architect: declarativo y vago. "Extraer los datos de facturación".
  - Hand-crafted: imperativo, estructurado, con nombres exactos de tools y campos. "PASO 1: holded_list_invoices con period=2025-Q1, devuelve array de invoices con campos {id, date, amount, customer}".
- Las instructions hand-crafted **siempre** mencionan al menos un tool concreto. Las del architect no mencionan ninguno.

**Razonamiento:**

Esto es **prueba forense** de la hipótesis del audit. La calidad de las instructions del architect es 3-7x peor que la de un humano, medida en chars y estructura. No es sorpresa — el prompt no le pide más:

- El prompt actual dice "instructions DEBE empezar con INPUT:/OUTPUT:". El LLM cumple ese formato superficialmente y se va. No tiene incentivo para escribir más.
- El prompt no muestra ejemplos de PASO 1/PASO 2. El LLM no sabe que ese es el patrón productivo.
- El prompt no enumera tools por CatPaw. Cuando el architect mapea un nodo a `agentId='5d8fbdd7-...'`, no sabe qué tools tiene ese CatPaw, así que no puede mencionarlos en las instructions. Resultado: instructions abstractas que el ejecutor del CatPaw tiene que adivinar.
- El prompt no muestra el patrón de "preservar campos" como ejemplo concreto. El LLM no sabe qué frase exacta usar para garantizar R10. (Y lo curioso es que cuando el reviewer flaggea R10, el architect tampoco sabe qué frase usar para arreglarlo.)

**Insight clave:** las instructions hand-crafted contienen información que **el architect no tiene acceso**. Específicamente, los nombres de tools por CatPaw. Phase 133 debería pasar al architect un mini-snapshot de tools por CatPaw escogido (algo como `Resources: catPaws[5d8fbdd7] tools: [holded_list_invoices, holded_list_contacts, holded_list_payments]`). Eso le permitiría mencionarlos en las instructions y aproximarse a las hand-crafted.

---

### P16. ¿El `flow_data` actual incluye `role` en `node.data`?

**Evidencia (búsqueda en todos los canvases):**

```bash
$ docker exec docflow-app node -e "
const dx = new Database('/app/data/docflow.db');
const rows = dx.prepare('SELECT id, name, flow_data FROM canvases').all();
let withRole = 0, total = 0;
for (const r of rows) {
  try {
    const fd = JSON.parse(r.flow_data);
    for (const n of fd.nodes) {
      total++;
      if (n.data && n.data.role) withRole++;
    }
  } catch {}
}
console.log('total nodes:', total, '| with role:', withRole);
"
```

**Hechos:**
- El campo `data.role` **no existe en ningún canvas** generado o creado a mano.
- No hay referencias a `role` en `canvas-executor.ts` ni en `canvas-flow-designer.ts` ni en los prompts.
- No hay schema/migración para añadirlo. Sería un campo aditivo nuevo.

**Razonamiento:**

Esto es lo esperado. El campo `role` es la propuesta del audit §8 — no existe todavía. Su introducción sería:

1. **Cambio aditivo en schema lógico:** `node.data.role: "extractor"|"transformer"|"synthesizer"|"renderer"|"emitter"|"guard"|"reporter"|undefined`. Sin migración SQL porque `flow_data` es un BLOB JSON.
2. **Cambio en ARCHITECT_PROMPT:** instruir al LLM a declarar el rol por nodo.
3. **Cambio en CANVAS_QA_PROMPT:** consumir el rol declarado para aplicar reglas condicionalmente.
4. **Cero impacto en canvases existentes:** los que no tienen `role` siguen funcionando — el reviewer asume `transformer` (default conservador) cuando `role` es undefined.
5. **Impacto en UI:** el editor de canvas podría mostrar el rol como badge, pero no es bloqueante.
6. **Impacto en tests:** todos los tests existentes siguen pasando porque no asumen presencia del campo.

Es un cambio estructural pequeño que habilita reglas semánticas grandes. Buen ROI.

---

## BLOQUE 7 — Riesgos de implementación

### P17. ¿Cómo mockean los tests el `qa_report`? ¿Cuántos rompen si separamos los scores?

**Evidencia** ([intent-job-executor.test.ts:528-534](app/src/lib/__tests__/intent-job-executor.test.ts#L528-L534)):

```ts
const QA_ACCEPT = JSON.stringify({ quality_score: 90, issues: [], recommendation: 'accept' });
const QA_REVISE = JSON.stringify({
  quality_score: 55,
  issues: [{ severity: 'blocker', rule_id: 'R01', node_id: 'n1', description: 'x', fix_hint: 'y' }],
  recommendation: 'revise',
});
const QA_REJECT = JSON.stringify({ quality_score: 20, issues: [], recommendation: 'reject' });
```

Conteo de referencias en tests:
- `intent-job-executor.test.ts`: 17 usos de QA_ACCEPT/REVISE/REJECT/quality_score
- `catbot-pipeline-prompts.test.ts`: 2 usos

**Hechos:**
- Los mocks tienen un único `quality_score` numérico, no estructura compuesta.
- Tres fixtures globales: QA_ACCEPT (score 90), QA_REVISE (score 55), QA_REJECT (score 20).
- Las assertions de los tests dependen de:
  - `result.name === 'Canvas'` (que viene del architect mock, no del qa_report)
  - `callSpy.toHaveBeenCalledTimes(N)` (cuántas LLM calls se hicieron)
  - `progress_message` parseado contiene `qa_recommendation`/`qa_score`
  - El número de ejecuciones del loop hasta accept

**Cuántos tests rompen si introducimos `data_contract_score` + `instruction_quality_score`:**
- **Si añadimos los nuevos campos como opcionales y `quality_score` se mantiene como suma o alias compatible:** **0 tests rompen**.
- **Si reemplazamos `quality_score` por los dos nuevos:** rompen ~6-8 assertions que leen `qa_score: qaReport.quality_score` (en updateIntentJob) y los 17 usos de las constantes mock que no tendrían el campo. Habría que actualizar:
  - Las 3 constantes (`QA_ACCEPT`, `QA_REVISE`, `QA_REJECT`) → 1 cambio cada una.
  - Las assertions sobre `progress_message.qa_score` → reescribir a `qa_data_contract_score`/`qa_instruction_quality_score`.
  - Tests del prompt en `catbot-pipeline-prompts.test.ts` que validan que el prompt menciona `quality_score`.

Estimado: **8-12 ediciones puntuales en 2 archivos**. No es disruptivo.

**Razonamiento:**

La estrategia de migración correcta para Phase 133 es **aditiva**:

1. Mantener `quality_score` como campo opcional/computed (`quality_score = round((data_contract_score + instruction_quality_score) / 2)`).
2. Añadir `data_contract_score` + `instruction_quality_score` como campos nuevos.
3. La lógica de decisión en código consume **los nuevos campos**, con fallback a `quality_score` si los nuevos no están presentes (compat hacia atrás con un reviewer que aún devuelva el formato viejo).
4. Los tests mock se actualizan a la nueva forma uno a uno, y el código tolera ambas.

Ventaja: ningún test rompe en CI durante la transición. Desventaja: hay duda sobre dónde llega la verdad. Mitigación: en Plan 02 de la fase, eliminar `quality_score` del prompt para forzar la migración completa.

---

### P18. ¿Hay otros archivos fuera de `intent-job-executor.ts` que lean `qa_report`?

**Evidencia** (`grep` en `app/src` excluyendo tests):

```
catbot-pipeline-prompts.ts:60   "Si recibes feedback de un QA review previo (qa_report), corrige los issues..."
catbot-pipeline-prompts.ts:93   "'accept' si quality_score >= 80 Y ningun blocker"
catbot-pipeline-prompts.ts:94   "'revise' si hay blockers o quality_score < 80 ..."
catbot-pipeline-prompts.ts:99   "quality_score": 0-100,
intent-job-executor.ts:61       quality_score?: number;
intent-job-executor.ts:296      if (previousQaReport) architectInputObj.qa_report = previousQaReport;
intent-job-executor.ts:365      const qaReport = this.parseJSON(qaRaw) as QaReport;
intent-job-executor.ts:370      recommendation: qaReport.recommendation,
intent-job-executor.ts:371      score: qaReport.quality_score,
intent-job-executor.ts:379      qa_recommendation: qaReport.recommendation,
intent-job-executor.ts:380      qa_score: qaReport.quality_score,
intent-job-executor.ts:381      message: `QA iter ${iter}: ...`,
intent-job-executor.ts:385      if (qaReport.recommendation === 'accept') { ... }
intent-job-executor.ts:404      last_qa_report: previousQaReport,
```

**Hechos:**
- **Solo dos archivos producción** referencian `qa_report`/`quality_score`/`recommendation`:
  - `catbot-pipeline-prompts.ts` (los strings literales del prompt — el reviewer recibe esto como instrucciones, no es código de consumo).
  - `intent-job-executor.ts` (el ÚNICO consumidor de código real).
- No hay otros servicios, no hay rutas API que lean `qa_report`, no hay UI que lo muestre directamente.
- Solo se persiste en `intent_jobs.progress_message` (como JSON) y en `knowledge_gaps.context` (en exhaustion).
- Los consumidores indirectos serían cualquier cosa que lea `progress_message` parseado. Buscando: solo el `list_my_jobs` tool y la UI de notificaciones podrían leerlo, pero no parsean campos específicos del qa_report.

**Razonamiento:**

Esto es **excelentes noticias** para Phase 133. Toda la lógica de consumo está concentrada en un único archivo (`intent-job-executor.ts`), específicamente dentro de una sola función (`runArchitectQALoop`). Cualquier cambio al schema del `qa_report` se contiene en:
- Edits al prompt (`catbot-pipeline-prompts.ts`)
- Edits al consumidor (`intent-job-executor.ts`)
- Edits a los tests (`intent-job-executor.test.ts`)

3 archivos en total. Bajo riesgo de regresión cruzada. Esto justifica que Phase 133 sea un trabajo pequeño-medio (2-3 plans), no un milestone completo.

---

### P19. ¿Hay forma de probar el pipeline contra LiteLLM real sin Telegram?

**Evidencia (búsqueda de scripts/CLI/test runners):**

```
~/docflow/app/scripts/
├── rag-worker.mjs                  ← worker RAG, no relacionado
└── setup-inbound-canvas.mjs        ← bootstrapping, no e2e

~/docflow/scripts/
└── host-agent.mjs                  ← supervisor de servicios docker
```

Búsqueda de tests "real"/"integration"/"live" en `app/src/lib/__tests__/`:
```
0 archivos
```

Búsqueda de cualquier script que llame `IntentJobExecutor.tick()` directamente desde CLI:
```
0 resultados
```

Forma actual de provocar una ejecución del pipeline:
1. Usuario manda mensaje por Telegram → `telegram-bot.ts` recibe → `intent-worker` clasifica como complejo → `queue_intent_job` inserta en `intent_jobs` → `IntentJobExecutor.tick()` lo recoge en máx 30s → corre el pipeline.
2. Alternativa: insertar a mano un row en `intent_jobs` con `status='pending'` y `pipeline_phase='pending'` (lo que hicimos en el monitoreo del Holded Q1 con el `node -e ...`).
3. Alternativa hacky: llamar a la API web `/api/catbot/chat` con un texto largo y esperar que el clasificador lo encole.

**Hechos:**
- **No existe un script estándar** para ejecutar el pipeline contra LiteLLM real desde CLI.
- **No existe ningún test de integración** que llame al pipeline completo (los unit tests mockean callLLM).
- La única forma documentada de probar end-to-end es Telegram.
- La inserción manual en `intent_jobs` funciona pero no es repetible (cada ejecución es destructiva, hay que limpiar el row después).

**Razonamiento:**

Este es un gap de tooling significativo. Para Phase 133 ya es relevante porque:

- **Iterar sobre el prompt requiere ejecutar el pipeline real** (el LLM se comporta diferente que los mocks).
- **Cada iteración manual cuesta:** abrir Telegram, mandar mensaje, esperar 60s del BOOT_DELAY, esperar otros 30-60s del pipeline, mirar la BD, limpiar el row. ~3 minutos por iteración.
- **No tenemos manera de hacer prompt replay automatizado** con casos canonizados.

Lo mínimo que Phase 133 debería entregar como tooling:

1. **Script `app/scripts/test-pipeline.mjs`** que recibe un goal por argv y un sample de tasks/resources, llama directamente a `IntentJobExecutor.tick()` con un row temporal, espera el resultado, imprime el qa_report y el flow_data, y limpia. Algo así:
   ```bash
   node app/scripts/test-pipeline.mjs --goal "Comparativa Holded Q1 2025 vs 2026..." --case holded-q1
   ```
   Output: el flow_data, las iteraciones del QA, el último qa_report, tiempo total.

2. **Carpeta `app/scripts/pipeline-cases/`** con 3 casos canonizados:
   - `holded-q1.json` (el caso de referencia)
   - `inbox-digest.json` (caso simple con iterator)
   - `drive-sync.json` (caso con storage)

3. **Bandera `--save-baseline`** para guardar el output como ground truth y `--diff` para comparar contra el baseline en próximas ejecuciones (regression test manual).

Esto convierte el ciclo de 3 minutos en uno de ~30 segundos y permite probar el prompt iterativamente sin pasar por Telegram. Es 200 líneas de código, alto ROI.

---

## Sumario ejecutivo (post-batería)

| Bloque | Hallazgo principal |
|--------|--------------------|
| 1 — Prompts | ARCHITECT enseña sintaxis pero no semántica. R10 está formulada como universal sin scope. Cero ejemplos completos de instructions. Nodos `connector` reciben una sola línea de explicación. |
| 2 — Executor | Gmail connector NO lee `data.instructions` — espera un JSON estructurado del predecessor con `accion_final`. El architect ignora completamente este contrato. Output del emitter incluye campos del actionData + status, pero R10 sobre nodos terminales es semánticamente vacuo. |
| 3 — Holded Q1 | El canvas que falló mapeó "enviar email" a un nodo `type:'agent'`, no a `connector`. Las instructions del architect son 100-180 chars; las hand-crafted son 250-750 chars con PASO 1/PASO 2 y tools concretos. |
| 4 — Rules index | 21 de 32 reglas son universales sin condición. R10 es la reina del falso positivo. `canvas-nodes-catalog.md` no está en el contenedor → expansión on-demand de R01-R25 está muerta en producción. |
| 5 — QA loop | La decisión accept depende SOLO de `recommendation === 'accept'`. El threshold `>=80` está dentro del prompt, no en código. Exhaustion guarda qa_report pero NO el flow_data del intento, y NO llama notifyProgress (usuario silenciado). |
| 6 — Práctica | El field `role` no existe en ningún canvas. Las instructions del architect son 3-7x más cortas que las hand-crafted. El architect no menciona ningún tool por nombre porque el prompt no se los pasa. |
| 7 — Riesgo | Solo 2 archivos producción consumen `qa_report` (encapsulación buena). Tests mock son 17 usos en 2 archivos, migración aditiva no rompe nada. NO existe script para probar pipeline contra LiteLLM real sin pasar por Telegram. |

## Implicaciones para Phase 133

Después de esta batería el diagnóstico se afina. El plan que propone el audit (taxonomía de 7 roles + role-aware QA + ejemplos contrastados) **sigue siendo correcto**, pero hay 3 hallazgos nuevos que añadir al scope:

1. **El architect debe conocer el contrato declarativo de los nodos `connector`** (ej: Gmail send_report espera `{accion_final, report_to, ...}` del predecessor). Esto NO estaba en el plan original. Es crítico — sin esto, los emitters seguirán siendo nodos rotos. Solución: pasar al architect un mini-snapshot de los contratos por tipo de connector, leído de la documentación del executor.

2. **Tooling de prueba sin Telegram (P19)** debe ser un entregable de Phase 133, no un nice-to-have. Sin esto el iterar sobre prompts es prohibitivo en tiempo.

3. **Persistir `flow_data` del último intento en knowledge_gap exhaustion** es trivial y desbloquea diagnóstico post-mortem. Bundlear con la fix de notifyProgress en el mismo plan.

Las 5 decisiones del audit §10 quedan intactas. Ahora hay 8-9 decisiones (las 5 originales + estas 3 nuevas), pero todas tienen recomendación clara.

---

_Documento generado el 2026-04-11 como insumo de la batería diagnóstica del usuario._
_Companion document: `AUDIT-catflow-pipeline-quality.md` (auditoría general)._
_Próximo paso: el usuario revisa este documento + el audit + responde las decisiones pendientes → procedemos a planificar Phase 133._
