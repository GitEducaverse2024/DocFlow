> **⚠️ MOVED to `.docflow-kb/protocols/orquestador-catflow.md`** during Phase 151 (2026-04-20).
>
> This file lives in the repo root as a leftover from pre-KB era. The canonical location is now the KB.
> Content below preserved for reference — new edits MUST happen in the KB.
> Eliminacion fisica: Phase 155 (cleanup final).

---

# SKILL: Orquestador Inteligente DoCatFlow
## Version 2.0 — Marzo 2026

---

## DESCRIPCION

Esta skill convierte a CatBot en el orquestador principal de DoCatFlow.
Le da logica de decision para construir flujos completos: saber cuando reutilizar
un CatPaw existente, cuando crear uno nuevo, como configurarlo correctamente,
como estructurar un Canvas, y como vincular conectores con inteligencia.

Sin esta skill, CatBot crea nodos genericos sin agente ni conector asignado,
lo que produce canvas con cajas vacias que no ejecutan nada.

---

## PARTE 1 — ARQUITECTURA DE DOCATFLOW (lo que CatBot debe saber)

### 1.1 Los 5 elementos y su relacion

```
CatBrain  → Base de conocimiento RAG. Contiene documentos procesados.
              UN nodo PROJECT o CATBRAIN en el Canvas = un CatBrain consultado.

CatPaw    → Agente ejecutor. Tiene system prompt, modelo y conectores.
              UN nodo AGENT en el Canvas = un CatPaw especifico por su agentId.

Conector  → Integracion externa (Gmail, Holded MCP, Drive, SearXNG, LinkedIn, HTTP).
              UN nodo CONNECTOR en el Canvas = un conector especifico por su connectorId.
              UN CatPaw puede tener conectores VINCULADOS para usarlos durante su ejecucion.

Canvas    → Flujo visual. Orquesta CatPaws, CatBrains y conectores en secuencia.
              Los nodos reciben el output del nodo anterior como input.

Tarea     → Pipeline secuencial sin conectores externos. Solo CatPaws en cadena.
```

### 1.2 Tipos de nodos del Canvas y que necesitan

El Canvas tiene 12 tipos de nodo registrados. Los 7 tipos principales se pueden crear
con la tool `canvas_add_node`:

| Tipo nodo | Campo obligatorio en `data` | Que pasa sin el |
|-----------|---------------------------|-----------------|
| agent | `agentId` → ID del CatPaw | El nodo ejecuta sin agente → resultado vacio o generico |
| project | `projectId` → ID del CatBrain | El nodo no consulta ningun RAG |
| connector | `connectorId` → ID del conector | El nodo no invoca ningun servicio externo |
| merge | Opcional: `agentId` sintetizador | Sin agente, concatena texto plano |
| condition | `condition` → criterio de bifurcacion | El nodo no puede evaluar |
| output | — | Siempre funciona. Campos opcionales: `format`, `notify_on_complete`, `trigger_targets` |
| checkpoint | Opcional: `instructions` | Sin instrucciones, solo pausa para aprobacion humana |

Tipos adicionales (se crean desde el editor visual, no desde tools):

| Tipo nodo | Uso |
|-----------|-----|
| start | Nodo inicial (se crea automaticamente con el canvas) |
| catbrain | Alternativa a project — consulta CatBrain con datos RAG, search_engine |
| scheduler | Temporización: delay, count, listen |
| storage | Almacenamiento: local, connector, both |
| multiagent | Invoca otro CatFlow como sub-flujo |

### 1.3 Diferencia critica: CatPaw con conector vs nodo CONNECTOR

```
NODO CONNECTOR (en el Canvas):
  → Invoca directamente un servicio externo (ej: busca en SearXNG, envia email)
  → Recibe el output del nodo anterior y lo usa como parametro
  → NO tiene inteligencia propia → solo ejecuta la operacion

CATPAW con conector VINCULADO (nodo AGENT en Canvas):
  → El CatPaw tiene un conector asociado via tabla cat_paw_connectors
  → Durante la ejecucion (execute-catpaw.ts), el sistema:
    1. Carga los conectores vinculados activos (is_active = 1)
    2. Invoca cada conector con {paw_id, paw_name, query, context}
    3. Inyecta los resultados en la seccion "DATOS DE CONECTORES" del system prompt
    4. El CatPaw RAZONA sobre esos datos antes de generar su respuesta
  → Util cuando necesitas que un agente busque en Holded y LUEGO tome decisiones
```

**REGLA:** Para filtrar leads contra Holded → usar CATPAW con conector Holded MCP vinculado,
NO un nodo CONNECTOR suelto. El nodo CONNECTOR es para operaciones directas (enviar email,
subir archivo), no para razonar sobre resultados.

### 1.4 Flujo de ejecucion de un CatPaw (execute-catpaw.ts)

Cuando un nodo AGENT se ejecuta en el Canvas, el executor sigue este flujo:

```
1. Carga CatPaw → SELECT * FROM cat_paws WHERE id = ? AND is_active = 1
2. Carga CatBrains vinculados → cat_paw_catbrains (query_mode: rag|connector|both)
3. Carga Conectores vinculados → cat_paw_connectors WHERE is_active = 1
4. Carga Skills vinculadas → cat_paw_skills JOIN skills
5. Consulta cada CatBrain → executeCatBrain(catbrain_id, {query, context, mode})
6. Invoca cada conector activo → fetch(config.url, {method, headers, body: {paw_id, query, context}})
7. Construye system prompt:
   - paw.system_prompt (o fallback "Eres {name}, un asistente experto")
   - + paw.tone
   - + SKILLS (instrucciones de cada skill)
   - + CONOCIMIENTO CATBRAINS (respuestas RAG)
   - + DATOS DE CONECTORES (resultados de invocaciones)
   - + INSTRUCCIONES DE PROCESAMIENTO (si mode = processor)
8. Llama a LiteLLM → /v1/chat/completions
9. Registra uso → logUsage + times_used++
```

---

## PARTE 2 — PROTOCOLO DE DECISION ANTES DE CREAR

### 2.1 Cuando el usuario pide hacer "algo" con un servicio externo

```
Usuario: "quiero que el flujo busque en Holded si el lead es cliente"

PASO 1 → Identificar el servicio
  → El servicio es "Holded". Tipo: MCP Server (Holded MCP).

PASO 2 → Verificar si existe el conector
  → Llamar: list_email_connectors (para Gmail) o preguntar al usuario
  → Si NO existe: "No tengo configurado el conector de Holded. ¿Quieres que te
    indique como crearlo, o ya lo tienes?"
  → Si SI existe: usar su connectorId

PASO 3 → Decidir que tipo de nodo necesita el flujo
  → ¿Necesita razonar sobre el resultado? → CATPAW con conector vinculado
  → ¿Es una operacion directa (enviar, subir, listar)? → Nodo CONNECTOR

PASO 4 → Verificar si existe un CatPaw adecuado
  → Llamar: list_cat_paws
  → Buscar CatPaw cuyo nombre contenga palabras relacionadas con el servicio
  → Si encuentra uno → preguntar: "Encontre el CatPaw '[nombre]'. ¿Lo uso para
    este paso o prefieres crear uno nuevo especifico?"
  → Si NO encuentra → preguntar: "No tengo un CatPaw para este paso.
    ¿Quieres que cree uno ahora?"

PASO 5 → Si hay que crear el CatPaw
  → Seguir el protocolo de creacion (Parte 3)
```

### 2.2 Arbol de decision para un nodo nuevo en el Canvas

```
¿Que tipo de nodo necesitas?
│
├── Ejecutar logica con IA (analizar, filtrar, redactar, clasificar)
│     └── → Nodo agent con CatPaw
│           ├── ¿Necesita consultar base de conocimiento? → vincular CatBrain
│           ├── ¿Necesita usar un servicio externo con razonamiento? → vincular conector al CatPaw
│           └── ¿Solo procesa el input anterior? → solo system prompt
│
├── Invocar servicio externo directamente (enviar email, subir a Drive, buscar web)
│     └── → Nodo connector
│           └── ¿Que conector? → pedir connectorId del conector correcto
│
├── Consultar base de conocimiento RAG directamente
│     └── → Nodo project con CatBrain
│
├── Combinar multiples resultados
│     └── → Nodo merge
│           └── ¿Quieres que un agente sintetice? → vincular CatPaw sintetizador
│
└── Bifurcar segun condicion
      └── → Nodo condition con campo "condition"
```

---

## PARTE 3 — PROTOCOLO DE CREACION DE CATPAW

### 3.1 Informacion minima para crear un CatPaw bien configurado

Antes de llamar `create_cat_paw`, CatBot debe tener:
1. **Nombre descriptivo** → que hace, para que sirve
2. **Modo** → siempre `processor` para Canvas (nunca `chat` para nodos)
3. **System prompt** → estructurado en 5 secciones (ver 3.2)
4. **Conector vinculado** → si necesita un servicio externo, vincular DESPUES de crear
5. **CatBrain vinculado** → si necesita conocimiento RAG, vincular DESPUES de crear

### 3.2 Tool create_cat_paw — Parametros reales

```json
{
  "name": "string (OBLIGATORIO)",
  "description": "string (opcional)",
  "mode": "chat | processor | hybrid (default: chat)",
  "model": "string (default: gemini-main)"
}
```

**NOTA:** `create_cat_paw` crea el CatPaw con campos basicos. Para configurar
system_prompt, temperature, processing_instructions, el usuario debe ir al editor
en /agents y editarlo manualmente, o usar las tools sudo (file_operation) para
modificar la DB directamente.

### 3.3 Vincular conector a un CatPaw

Despues de crear el CatPaw, vincular un conector:

```
POST /api/cat-paws/{pawId}/connectors
Content-Type: application/json

Body:
{
  "connector_id": "id-del-conector",     // OBLIGATORIO
  "usage_hint": "descripcion del uso",   // OPCIONAL
  "is_active": 1                          // OPCIONAL (default: 1)
}

Respuesta 201:
{
  "paw_id": "id-del-catpaw",
  "connector_id": "id-del-conector",
  "usage_hint": "...",
  "is_active": 1,
  "created_at": "2026-03-26T..."
}
```

**Tabla DB:** `cat_paw_connectors` (paw_id, connector_id, usage_hint, is_active, created_at)
**Restriccion:** UNIQUE(paw_id, connector_id) → no se puede vincular el mismo conector dos veces.

### 3.4 Estructura del system prompt para un CatPaw de Canvas

```
ROL: Eres [nombre del agente]. Tu especialidad es [que hace].

MISION: Recibes [que tipo de input] y debes [que tarea exacta].

PROCESO:
1. [Primer paso concreto]
2. [Segundo paso]
3. [Tercer paso]
Si encuentras [caso especial], [que hacer].

CASUISTICA:
- Si el input esta vacio o es "SIN_LEADS_NUEVOS": devuelve exactamente ese texto sin hacer nada mas.
- Si [otra situacion]: [accion especifica]
- Si no puedes completar la tarea: devuelve {"error": "descripcion del problema"}

OUTPUT: Responde SIEMPRE con este JSON y nada mas:
{
  "campo1": "descripcion",
  "campo2": ["array si aplica"],
  "estado": "ok | vacio | error"
}
IMPORTANTE: Solo el JSON. Sin texto antes ni despues.
```

### 3.5 Reglas criticas del system prompt

- **NUNCA hardcodear** emails, nombres de empresa, sectores especificos
- El input siempre llega como texto del nodo anterior → referenciar como "el input recibido"
- Si el CatPaw usa un conector, describir en el prompt como usarlo
- Temperatura: `0.1-0.2` para tareas de clasificacion/filtrado, `0.4-0.6` para redaccion
- Formato de salida: especificar JSON con ejemplo completo cuando el output pasa a otro nodo

---

## PARTE 4 — PROTOCOLO DE CONSTRUCCION DE CANVAS

### 4.1 Tools de Canvas disponibles — Referencia completa

| Tool | Descripcion | Parametros requeridos | Parametros opcionales |
|------|------------|----------------------|----------------------|
| `canvas_list` | Lista todos los canvas | — | — |
| `canvas_get` | Detalle de un canvas | — | `canvasId`, `canvasName` (uno de los dos) |
| `canvas_create` | Crea canvas nuevo (con nodo start) | `name` | `mode` (agents/projects/mixed), `description`, `emoji` |
| `canvas_add_node` | Anade nodo al canvas | `canvasId`, `nodeType`, `label` | `agentId`, `connectorId`, `instructions`, `positionX`, `positionY` |
| `canvas_add_edge` | Conecta dos nodos | `canvasId`, `sourceNodeId`, `targetNodeId` | `sourceHandle` (para condition: yes/no) |
| `canvas_remove_node` | Elimina nodo y sus edges | `canvasId`, `nodeId` | — |
| `canvas_update_node` | Actualiza config de nodo | `canvasId`, `nodeId` | `label`, `agentId`, `connectorId`, `instructions` |
| `canvas_execute` | Ejecuta el canvas | `canvasId` | `input` (texto inicial para START) |

### 4.2 Secuencia correcta de operaciones

```
1. canvas_get → SIEMPRE primero. Nunca modificar sin ver el estado actual.
2. Identificar nodos existentes (IDs, posiciones, conexiones)
3. Planificar posiciones: X = ultimo nodo X + 250, Y distribuido sin solapar
4. canvas_add_node (×N) → Anadir todos los nodos nuevos
5. canvas_add_edge (×N) → Conectar en secuencia
6. Confirmar al usuario con lista de nodeIds creados
```

### 4.3 Tipos de nodo validos para canvas_add_node

El parametro `nodeType` acepta estos valores (en MAYUSCULAS):
`AGENT`, `PROJECT`, `CONNECTOR`, `CHECKPOINT`, `MERGE`, `CONDITION`, `OUTPUT`

**IMPORTANTE:** El sistema convierte internamente a minusculas para que React Flow los renderice correctamente.

### 4.4 El campo data de cada tipo de nodo

```typescript
// Nodo agent → SIEMPRE incluir agentId
{
  label: "Nombre visible",
  agentId: "id-del-catpaw",        // OBLIGATORIO para ejecutar
  // Campos que el UI muestra (opcionales, se resuelven automaticamente):
  // agentName, model, mode
}

// Nodo connector → SIEMPRE incluir connectorId
{
  label: "Nombre visible",
  connectorId: "id-del-conector",  // OBLIGATORIO para ejecutar
  // connectorName: se resuelve automaticamente
  // mode: "before" | "after" (default: despues del nodo anterior)
}

// Nodo project → SIEMPRE incluir projectId
{
  label: "Nombre visible",
  projectId: "id-del-catbrain",    // OBLIGATORIO para consultar RAG
  // projectName: se resuelve automaticamente
}

// Nodo merge
{
  label: "Fusionar resultados",
  agentId: "id-sintetizador",      // OPCIONAL → si quieres que un agente sintetice
  instructions: "Como sintetizar",  // OPCIONAL
  handleCount: 3                    // OPCIONAL → numero de entradas (2-5, default 3)
}

// Nodo condition → campo "condition" (NO "conditionPrompt")
{
  label: "¿Hay leads nuevos?",
  condition: "El input contiene leads nuevos (no es SIN_LEADS_NUEVOS ni vacio)"
  // Tiene dos salidas: sourceHandle "yes" (verde) y "no" (rojo)
}

// Nodo checkpoint
{
  label: "Revision humana",
  instructions: "Revisa que los datos sean correctos antes de continuar"
  // Tiene dos salidas: sourceHandle "approved" (verde) y "rejected" (rojo)
}

// Nodo output
{
  label: "Resultado final",
  outputName: "nombre-del-output",           // OPCIONAL
  format: "markdown" | "json" | "plain",     // OPCIONAL
  notify_on_complete: true,                   // OPCIONAL → notificacion al completar
  trigger_targets: [{id: "canvas-id", name: "Nombre CatFlow"}]  // OPCIONAL → activar otros CatFlows
}
```

### 4.5 Posicionamiento de nodos

```
Nodo START: siempre X:50, Y:300 (se crea automatico con el canvas)
Nodos secuenciales: X += 250 por cada nodo
Nodos en paralelo (mismo nivel): mismo X, Y separados por 150
Nodo MERGE: X = maximo X de sus entradas + 250
Nodo OUTPUT: siempre al final, X mas alto
```

**Auto-posicion:** Si no se pasan `positionX`/`positionY`, la tool calcula automaticamente:
- X = maxX de nodos existentes + 250
- Y = promedio Y de nodos existentes (o 200 si no hay nodos)

---

## PARTE 5 — CATALOGO DE CONECTORES CONOCIDOS

### Conectores disponibles en esta instalacion

| Nombre | Tipo | Uso principal | Lo que puede hacer |
|--------|------|--------------|---------------------|
| Holded MCP | mcp_server | CRM / ERP | Buscar contactos, crear leads, registrar tiempo, proyectos |
| Antonio Educa360 | gmail | Email Workspace | Enviar emails desde antonio@educa360.com |
| Antonio Sierra Sanchez | gmail | Email Personal | Enviar emails desde deskmath@gmail.com |
| SearXNG Web Search | http_api | Busqueda web | Buscar en la web sin rastreo |
| Gemini Web Search | http_api | Busqueda web | Busqueda con grounding de Google |
| LinkedIn Intelligence | mcp_server | Prospeccion | Buscar perfiles y empresas en LinkedIn |
| Google Drive | google_drive | Almacenamiento | Listar, subir, descargar, crear carpetas |

### Cuando usar nodo CONNECTOR vs CatPaw con conector vinculado

```
REGLA DE ORO:
  ¿El agente necesita RAZONAR sobre el resultado del conector? → CatPaw con conector
  ¿Solo necesitas EJECUTAR una accion? → Nodo CONNECTOR directo

EJEMPLOS:
  "Enviar email con el resultado" → Nodo connector Gmail (ejecucion directa)
  "Buscar en Holded Y decidir si es cliente" → CatPaw con Holded MCP vinculado
  "Buscar en la web" → Nodo connector SearXNG (ejecucion directa)
  "Buscar en la web Y analizar los resultados para extraer leads" → CatPaw con SearXNG vinculado
  "Subir archivo a Drive" → Nodo connector Google Drive (ejecucion directa)
  "Buscar en Drive si existe la carpeta Y crearla si no" → CatPaw con Drive vinculado
```

---

## PARTE 6 — REGLAS DE INTERACCION CON EL USUARIO

### 6.1 Antes de crear cualquier cosa

CatBot DEBE preguntar si no tiene la informacion necesaria:
- ¿Hay un CatPaw existente que sirva o hay que crear uno nuevo?
- ¿El conector esta configurado?
- ¿En que canvas quiere anadir el flujo?

CatBot NO debe crear sin confirmar cuando:
- Va a crear mas de 2 elementos nuevos (nodos, CatPaws, conectores)
- No esta seguro del proposito del agente
- El usuario da instrucciones ambiguas

### 6.2 Flujo de confirmacion para flujos complejos

```
1. CatBot presenta el PLAN antes de ejecutar:
   "Voy a hacer esto:
   1. Crear CatPaw 'Filtro Holded' (processor) con conector Holded MCP vinculado
   2. Anadir nodo agent en el canvas con ese CatPaw
   3. Conectar Merge → Filtro Holded
   ¿Procedo?"

2. Solo tras confirmacion → ejecutar
3. Al terminar → reportar nodeIds creados y conexiones establecidas
```

### 6.3 Respuestas cuando falta informacion

```
Situacion: Usuario pide "anade un agente de Holded al canvas" pero no tiene conector Holded activo
Respuesta: "Para que el agente pueda consultar Holded necesito el conector Holded MCP.
  Veo que esta configurado pero marcado como Inactivo. ¿Quieres activarlo primero,
  o procedo igualmente y lo activas tu despues?"

Situacion: Usuario pide algo que requiere un CatPaw pero no hay ninguno adecuado
Respuesta: "No tengo ningun CatPaw configurado para [tarea]. Puedo crear uno ahora.
  Necesito saber: ¿debe usar algun conector externo? ¿Que formato de salida necesitas
  (texto libre, JSON, lista)? ¿Es para un paso de analisis, redaccion o clasificacion?"

Situacion: Usuario da nombre de canvas incorrecto
Respuesta: CatBot llama canvas_list → muestra opciones → pregunta cual es el correcto.
  NUNCA inventar el canvasId.
```

---

## PARTE 7 — EJEMPLO COMPLETO: Flujo LeadHunting con filtro Holded

### El flujo que el usuario quiere

```
Merge → Filtro Holded → Gestor Drive → Redactor Email → Gmail → Output
```

### Como CatBot debe construirlo correctamente

**Paso 1 — Diagnostico previo:**
```
canvas_get({canvasName: "Lead Hunting Educa360"})
→ Ver IDs de nodos existentes: merge (ID: xxx), output (ID: yyy)
→ Ver posicion del Merge: X:1540
→ Planificar: Filtro Holded en X:1790, Gestor Drive en X:2040,
              Redactor Email en X:2290, Gmail en X:2540
```

**Paso 2 — Crear/verificar CatPaws:**
```
list_cat_paws() → buscar "filtro" o "holded"
→ Si existe "Filtro Holded" con agentId disponible → usar ese ID
→ Si no existe → crear CatPaw con:
    create_cat_paw({name: "Filtro Holded", mode: "processor"})
    → DESPUES vincular conector Holded MCP:
      POST /api/cat-paws/{new_paw_id}/connectors
      Body: {"connector_id": "id-conector-holded"}

list_cat_paws() → buscar "drive" o "gestor"
→ Si no existe → crear "Gestor Drive Leads" con conector Google Drive vinculado
```

**Paso 3 — Anadir nodos con IDs correctos:**
```
canvas_add_node({
  canvasId: "lead-hunting-id",
  nodeType: "AGENT",
  label: "Filtro Holded",
  agentId: "id-del-catpaw-filtro-holded",
  positionX: 1790,
  positionY: 330
})
→ Devuelve: { nodeId: "abc123def", ... }

canvas_add_node({
  canvasId: "lead-hunting-id",
  nodeType: "CONNECTOR",
  label: "Gmail Antonio Educa360",
  connectorId: "id-del-conector-gmail",
  positionX: 2540,
  positionY: 330
})
→ Devuelve: { nodeId: "ghi456jkl", ... }
```

**Paso 4 — Conectar en orden usando los IDs devueltos:**
```
canvas_add_edge({canvasId: "lead-hunting-id", sourceNodeId: "merge-id", targetNodeId: "abc123def"})
canvas_add_edge({canvasId: "lead-hunting-id", sourceNodeId: "abc123def", targetNodeId: "gestor-id"})
canvas_add_edge({canvasId: "lead-hunting-id", sourceNodeId: "gestor-id", targetNodeId: "redactor-id"})
canvas_add_edge({canvasId: "lead-hunting-id", sourceNodeId: "redactor-id", targetNodeId: "ghi456jkl"})
canvas_add_edge({canvasId: "lead-hunting-id", sourceNodeId: "ghi456jkl", targetNodeId: "output-id"})
```

---

## PARTE 8 — ERRORES COMUNES Y COMO EVITARLOS

| Error | Por que ocurre | Como evitarlo |
|-------|---------------|---------------|
| Nodo agent sin agentId | Se creo el nodo sin buscar/crear el CatPaw primero | Siempre tener el agentId antes de llamar canvas_add_node |
| Nodo connector sin connectorId | Se uso un nombre de conector en vez de su ID | Llamar list_email_connectors o preguntar el ID antes |
| Canvas con cajas en esquina | Posiciones no calculadas o en X:0, Y:0 | Siempre calcular posicion relativa al ultimo nodo |
| CatPaw en modo "chat" para Canvas | Se creo con mode="chat" | Canvas siempre requiere mode="processor" o "hybrid" |
| Modificar canvas sin GET previo | Se llama add_node sin saber el estado actual | SIEMPRE canvas_get primero |
| Edges que no conectan | NodeId incorrecto (nombre en vez de ID) | Usar los IDs devueltos por canvas_add_node |
| CatPaw sin conector vinculado | Se creo el CatPaw pero no se vinculo el conector | Despues de create_cat_paw, POST /api/cat-paws/{id}/connectors |
| condition sin campo condition | Se uso "conditionPrompt" en vez de "condition" | El campo correcto es `condition` (no conditionPrompt) |

---

## PARTE 9 — PROMPT RAPIDO PARA GENERAR SYSTEM PROMPTS DE CATPAWS

Cuando el usuario pida crear un CatPaw para una tarea especifica, CatBot puede
generar el system prompt siguiendo este patron interno:

```
ROL: Eres [nombre]. Eres un procesador especializado en [dominio].

MISION: Recibes como input [descripcion del input tipico].
Tu tarea es [accion principal].

PROCESO:
FASE 1 → [Primer paso de analisis o lectura del input]
FASE 2 → [Accion principal con el servicio/dato]
FASE 3 → [Construccion del output]

CASOS ESPECIALES:
- Input vacio o "SIN_DATOS": devolver exactamente ese texto.
- [Caso de error del servicio]: devolver {"estado": "error", "mensaje": "..."}
- [Caso de no encontrar resultados]: devolver {"estado": "vacio", "resultado": []}

OUTPUT OBLIGATORIO (JSON exacto, sin texto adicional):
{
  "estado": "ok | vacio | error",
  "resultado": [...],
  "metadata": { "procesados": N, "fecha": "ISO_DATE" }
}

RECUERDA: Responde SOLO con el JSON. Sin explicaciones. Sin markdown. Solo JSON.
```

---

## PARTE 10 — MAPA DE DATOS REALES POR TIPO DE NODO

### 10.1 Campos data que cada nodo lee del flow_data

Esta tabla documenta los campos exactos que cada componente React lee de `node.data`
y que el executor (`canvas-executor.ts`) usa al ejecutar:

| Tipo nodo | Campos data del componente | Campos que el executor usa | Tool que los acepta |
|-----------|--------------------------|---------------------------|---------------------|
| **start** | `executionStatus`, `listen_mode` | `initialInput` | (se crea automatico) |
| **agent** | `label`, `agentId`, `agentName`, `model`, `mode`, `executionStatus` | `agentId` → busca CatPaw y ejecuta via executeCatPaw | `canvas_add_node`, `canvas_update_node` |
| **project** | `label`, `projectId`, `projectName`, `executionStatus` | `projectId` → ejecuta executeCatBrain con modo RAG | `canvas_add_node`, `canvas_update_node` |
| **catbrain** | `label`, `catbrainId`, `catbrainName`, `projectId` (compat), `rag_status`, `search_engine`, `executionStatus` | `catbrainId`/`projectId` → ejecuta CatBrain | (solo editor visual) |
| **connector** | `label`, `connectorId`, `connectorName`, `mode` (before/after), `executionStatus` | `connectorId` → fetch a URL del conector | `canvas_add_node`, `canvas_update_node` |
| **condition** | `label`, `condition`, `executionStatus` | `condition` → LLM evalua si es yes/no | `canvas_add_node`, `canvas_update_node` |
| **checkpoint** | `label`, `instructions`, `executionStatus` | `instructions` → mostrado al revisor humano | `canvas_add_node`, `canvas_update_node` |
| **merge** | `label`, `agentId`, `instructions`, `handleCount`, `executionStatus` | `agentId` → sintetizador opcional | `canvas_add_node`, `canvas_update_node` |
| **output** | `label`, `outputName`, `format`, `notify_on_complete`, `trigger_targets`, `executionStatus` | `format`, `trigger_targets` → triggers a otros canvas | `canvas_add_node` (solo label) |
| **scheduler** | `label`, `schedule_type`, `delay_value`, `delay_unit`, `count_value`, `listen_timeout`, `executionStatus` | Todos los schedule_* | (solo editor visual) |
| **storage** | `label`, `storage_mode`, `filename_template`, `subdir`, `executionStatus` | `storage_mode`, `filename_template`, `subdir` | (solo editor visual) |
| **multiagent** | `label`, `target_task_id`, `target_task_name`, `execution_mode`, `payload_template`, `timeout`, `executionStatus` | `target_task_id`, `execution_mode` | (solo editor visual) |

### 10.2 Schemas de DB relevantes

**cat_paws** (tabla principal de agentes):
```
id, name, description, avatar_emoji, avatar_color, department_tags,
system_prompt, tone, mode (chat|processor|hybrid), model, temperature,
max_tokens, processing_instructions, output_format, openclaw_id,
is_active, times_used, created_at, updated_at
```

**connectors** (tabla de integraciones externas):
```
id, name, description, emoji, type (n8n_webhook|http_api|mcp_server|email|gmail|google_drive),
config (JSON), is_active, test_status, times_used, created_at, updated_at
```

**canvases** (tabla de canvas/flujos):
```
id, name, description, emoji, mode (agents|projects|mixed), status (idle|running|scheduled|completed|failed),
flow_data (JSON con {nodes, edges, viewport}), thumbnail, tags (JSON array),
is_template, listen_mode, external_input, next_run_at, created_at, updated_at
```

**skills** (tabla de habilidades inyectables):
```
id, name, description, category, tags (JSON array), instructions (TEXT),
output_template, constraints, source (built-in|user), version, author,
times_used, created_at, updated_at
```

### 10.3 Tablas de relacion CatPaw

```
cat_paw_connectors: paw_id, connector_id, usage_hint, is_active, created_at
cat_paw_catbrains:  paw_id, catbrain_id, query_mode (rag|connector|both), priority, created_at
cat_paw_skills:     paw_id, skill_id
```

### 10.4 Tools complementarias de CatBot

Ademas de las 8 tools canvas_*, CatBot tiene estas tools relevantes para orquestacion:

| Tool | Uso en orquestacion |
|------|---------------------|
| `create_cat_paw` | Crear agente: `{name, description?, mode?, model?}` |
| `list_cat_paws` | Buscar agentes existentes: `{mode?}` |
| `create_connector` | Crear conector: `{name, type, config?}` |
| `list_email_connectors` | Listar conectores Gmail activos |
| `list_catbrains` | Listar CatBrains para vincular a nodos project |
| `create_catbrain` | Crear CatBrain: `{name, purpose?}` |
| `navigate_to` | Generar boton clickeable: `{url, label}` |

---

## PARTE 11 — EJECUCION AVANZADA: TOOL-CALLING EN CATPAWS

### 11.1 Nodo AGENT con deteccion automatica de CatPaw (EXEC-05)

Cuando un nodo de tipo `agent` se ejecuta, el executor hace esto:

```
1. Lee el agentId del nodo
2. Busca en cat_paws: SELECT id FROM cat_paws WHERE id = ? AND is_active = 1
3. SI existe en cat_paws → ejecuta via executeCatPaw() (con tool-calling)
4. SI NO existe → ejecuta via callLLM() (single shot, sin tools)
```

**CONSECUENCIA CRITICA:** Un CatPaw vinculado a conectores (Drive, MCP, etc.) DEBE
tener sus conectores registrados en `cat_paw_connectors` para que el tool-calling
funcione. Sin vincular el conector, el CatPaw no tendra herramientas disponibles.

### 11.2 Tool-calling loop en executeCatPaw

Cuando un CatPaw tiene conectores vinculados, `executeCatPaw` ejecuta un loop
multi-round de tool-calling (maximo 8 rondas):

```
Ronda 1: LLM recibe system prompt + input → puede devolver tool_calls[]
Ronda 2: Sistema ejecuta cada tool_call → devuelve resultados al LLM
Ronda 3: LLM puede pedir mas tool_calls o generar respuesta final
... (hasta 8 rondas o hasta que el LLM responda sin tool_calls)
```

**Herramientas disponibles por tipo de conector vinculado:**

| Conector | Tools disponibles |
|----------|------------------|
| Google Drive | `drive_list_files`, `drive_search_files`, `drive_upload_file`, `drive_create_folder` |
| MCP Server (Holded, LinkedIn) | Todas las tools del MCP server (descubiertas via tools/list) |

### 11.3 Reglas para system prompts de CatPaws con tools

Cuando un CatPaw tiene herramientas Drive o MCP, su system prompt DEBE:
1. **Mencionar las herramientas** que puede usar (por nombre)
2. **Describir el flujo** esperado: "Usa drive_list_files para buscar, luego drive_upload_file para subir"
3. **Especificar que datos usar** de la respuesta de la herramienta: "La URL la obtienes del campo 'link'"
4. **NUNCA inventar datos** — si necesita una URL, debe obtenerla de la herramienta, no generarla

**Ejemplo de system prompt para CatPaw con Drive:**
```
HERRAMIENTAS DISPONIBLES:
- drive_list_files: Listar archivos en una carpeta
- drive_search_files: Buscar archivos por nombre
- drive_upload_file: Subir/crear un archivo (devuelve id, name, link)
- drive_create_folder: Crear una carpeta (devuelve id, name)

PROCESO:
1. Usa drive_list_files para verificar si existe la carpeta "MiCarpeta"
2. Si no existe, usa drive_create_folder para crearla
3. Usa drive_upload_file para subir el archivo con el contenido procesado
4. En tu respuesta final, incluye la URL REAL del campo "link" de la respuesta
   NUNCA inventes URLs de Google Drive
```

---

## PARTE 12 — CADENA DE DATOS ENTRE NODOS: PROPAGACION DE CONTEXTO

### 12.1 Regla de oro: cada nodo solo recibe el output del anterior

El canvas ejecuta nodos en orden topologico. Cada nodo recibe como input SOLO
el output del nodo inmediatamente anterior (o la fusion de multiples nodos
si es un MERGE). Esto tiene consecuencias criticas para el diseno:

```
PROBLEMA COMUN: Nodo A produce datos detallados → Nodo B resume y pierde datos
               → Nodo C necesita los datos originales pero no los tiene

SOLUCION: El nodo intermedio DEBE propagar toda la informacion relevante
          para nodos posteriores en su output.
```

### 12.2 Ejemplo real: flujo de leads con email

```
Analista → produce JSON con array de leads detallados (nombre, empresa, cargo, fuente)
Gestor Drive → sube a Drive, pero su output DEBE incluir el array de leads
               ademas de url_drive y file_name
Redactor Email → necesita AMBOS: la URL de Drive Y los datos de cada lead
                 para construir la tabla HTML del email
Gmail → envia el email formateado
```

**ERROR que ocurrio:** El Gestor solo devolvia `{url_drive, cantidad_leads, file_name}`
sin el array de leads. El Redactor no tenia datos para llenar la tabla y ponia
"ver datos en Drive" como placeholder.

**SOLUCION:** El system prompt del Gestor incluye:
```
Tu salida final DEBE incluir:
{
  "url_drive": "URL real del archivo",
  "cantidad_leads": N,
  "file_name": "nombre.csv",
  "leads": [array COMPLETO de los leads con todos sus campos]
}
El siguiente nodo necesita el array leads para construir el email.
```

### 12.3 Reglas para CatBot al disenar flujos

Cuando CatBot disena un canvas con multiples nodos en secuencia:

1. **Mapear que datos necesita cada nodo** desde el primero hasta el ultimo
2. **Asegurar que ningun nodo intermedio descarte datos** necesarios aguas abajo
3. **Documentar en el system prompt** que campos debe incluir en su output
4. **Para nodos que generan emails**, el nodo anterior debe incluir:
   - Todos los datos que deben aparecer en el cuerpo del email
   - URLs reales de archivos (Drive, etc.) obtenidas de herramientas
   - Nunca depender de que el Redactor "sepa" datos que no estan en su input

### 12.4 Patron para nodo Redactor de Email

El nodo que genera el payload del email SIEMPRE debe producir un JSON con:

```json
{
  "to": "destinatario@email.com",
  "subject": "Asunto del email",
  "html_body": "<html>...</html>"
}
```

Reglas para el html_body:
- Usar estilos inline (no CSS externo) para compatibilidad con clientes de email
- Incluir tabla HTML con datos reales, NO placeholders
- Incluir enlace a Drive si hay archivo subido (URL real, no inventada)
- Colores sugeridos: header #1a73e8, filas alternas #f8f9fa

El parser del Gmail connector (`parseOutputToEmailPayload`) soporta 3 estrategias:
1. JSON con campos `to`, `subject`, `html_body` (preferida)
2. JSON sin esos campos → se envuelve en template HTML
3. Texto plano → se convierte a HTML basico

**TIP:** El LLM a veces envuelve el JSON en markdown fences (```json ... ```).
El parser tiene `stripMarkdownFences()` para manejar esto automaticamente.

---

## PARTE 13 — DIAGNOSTICO DE EJECUCIONES Y TROUBLESHOOTING

### 13.1 Herramientas de diagnostico disponibles

CatBot puede usar `canvas_list_runs` y `canvas_get_run` para inspeccionar ejecuciones.
Cada run contiene `node_states` con el output de cada nodo.

### 13.2 Tabla de diagnostico ampliada

| Sintoma | Causa probable | Solucion |
|---------|---------------|----------|
| Nodo agent devuelve resultado generico/vacio | agentId no apunta a un CatPaw activo, o el CatPaw existe pero no tiene system_prompt | Verificar que el CatPaw existe en cat_paws con is_active=1 y tiene system_prompt |
| CatPaw no usa herramientas Drive/MCP | Conector no vinculado en cat_paw_connectors, o conector inactivo | Verificar vinculacion en cat_paw_connectors Y que el conector tiene is_active=1 |
| URL de Drive inventada/falsa | El CatPaw genera la URL en vez de obtenerla de drive_upload_file | Reforzar en el system prompt: "Usa la URL del campo 'link' de la herramienta" |
| Email llega sin datos en la tabla | El nodo anterior al Redactor no propaga los datos completos | Verificar que el nodo intermedio incluye todos los datos en su output JSON |
| Email llega como texto JSON crudo | El LLM envuelve el JSON en markdown fences (```json) | El parser ya maneja esto con stripMarkdownFences. Si persiste, reforzar "sin markdown" en el prompt |
| Nodo dice SIN_LEADS_NUEVOS cuando hay leads | El Analista no puede extraer leads del formato de input | Revisar que el system prompt del Analista describe el formato real del input (snippets web, no JSON) |
| Email dice EMAIL_OMITIDO | El Redactor recibio SIN_LEADS_NUEVOS o un input que no pudo procesar | Verificar la cadena completa: el nodo anterior devolvio datos validos? |
| Nodo connector Gmail no envia | El conector Gmail no esta activo o el test falla | Testear conector en /connectors. Verificar credenciales OAuth/app_password |
| Canvas muestra nodos corruptos (sin vinculacion) | El tipo de nodo en flow_data no es un tipo registrado (ver Parte 14.2 para la lista completa) | Corregir el type del nodo a uno valido (normalmente "agent") y verificar que agentId/connectorId es correcto |
| Canvas tarda mucho en ejecutar | CatPaw con tool-calling hace muchas rondas, o API externa lenta | Revisar connector_logs para ver duracion de cada tool call |

### 13.3 Como CatBot debe diagnosticar un fallo de ejecucion

```
1. canvas_get_run para ver node_states de cada nodo
2. Identificar el primer nodo con status "failed" o output inesperado
3. Si el output es SIN_LEADS_NUEVOS/EMAIL_OMITIDO → rastrear hacia atras
4. Si el output es JSON mal formado → revisar system prompt del CatPaw
5. Si no hay output → verificar agentId/connectorId del nodo
6. Revisar connector_logs si el nodo usa conectores (Drive, MCP, Gmail)
7. Informar al usuario con diagnostico claro y solucion propuesta
```

### 13.4 Verificacion post-ejecucion (checklist)

Cuando un canvas completa, CatBot debe verificar estos puntos si el usuario pregunta:

- [ ] Todos los nodos completaron sin error
- [ ] El Analista/procesador devolvio datos validos (no vacio ni generico)
- [ ] El Gestor Drive uso herramientas reales (verificar connector_logs)
- [ ] La URL de Drive en el output es real (empieza con https://drive.google.com/file/d/)
- [ ] El Redactor produjo html_body con tabla de datos reales
- [ ] El Gmail envio el email (nodo completed)

---

## PARTE 14 — TIPOS DE NODO DEL CANVAS vs CATPAWS (ACLARACION IMPORTANTE)

### 14.1 CatPaw vs tipo de nodo "agent" — NO son lo mismo

En DoCatFlow hay dos conceptos que pueden confundirse:

- **CatPaw** = nuestro nombre para los agentes IA. Son las entidades que viven en
  la tabla `cat_paws` de la DB. Tienen nombre, system prompt, modelo, conectores.
  Son lo que el usuario ve en /agents. Es la MARCA de los agentes en DoCatFlow.

- **Tipo de nodo `agent`** = el tipo tecnico que se usa en el flow_data del canvas
  para representar un nodo que ejecuta un CatPaw. Es un valor interno del motor
  de ejecucion.

**La relacion es:** Un nodo de tipo `agent` en el canvas EJECUTA un CatPaw.
El campo `agentId` del nodo apunta al ID del CatPaw en la tabla `cat_paws`.
El executor detecta automaticamente que es un CatPaw y usa executeCatPaw con
todo el poder del tool-calling (Drive, MCP, etc.).

### 14.2 Tipos de nodo validos en flow_data.nodes[].type

Estos son los UNICOS tipos que el editor visual y el executor reconocen:

```
agent      → Ejecuta un CatPaw (con tool-calling si tiene conectores vinculados)
connector  → Invoca un servicio externo directamente (Gmail, Drive, SearXNG)
merge      → Combina multiples inputs
condition  → Bifurca segun evaluacion LLM (yes/no)
output     → Nodo final, formatea resultado
checkpoint → Pausa para aprobacion humana
project    → Consulta CatBrain RAG
start      → Nodo inicial (se crea automaticamente)
catbrain   → Consulta CatBrain (alternativa a project)
scheduler  → Temporizacion
storage    → Almacenamiento
multiagent → Sub-flujo
```

### 14.3 Error conocido: no inventar tipos de nodo nuevos

El editor visual de React Flow solo renderiza los tipos de nodo registrados arriba.
Si se escribe un valor distinto en `flow_data.nodes[].type` (por ejemplo, un tipo
inventado que no esta en la lista), el nodo aparece corrupto en la UI:
sin icono, sin vinculacion visual, sin interaccion.

Esto ocurrio cuando se intento usar `type: "catpaw"` como tipo de nodo en el canvas.
Ese valor NO existe como tipo registrado. El resultado fue nodos rotos en la UI.

**La forma correcta** de ejecutar un CatPaw desde el canvas es:
```
type: "agent"  +  agentId: "id-del-catpaw"
```

El motor de ejecucion (EXEC-05) busca el agentId en la tabla cat_paws.
Si lo encuentra, ejecuta automaticamente via executeCatPaw() con tool-calling.
Si no lo encuentra, usa callLLM() como fallback (sin tools).

**Solucion si un nodo aparece corrupto:** Corregir el `type` a `"agent"` en flow_data
y asegurar que `data.agentId` apunta al CatPaw correcto.
