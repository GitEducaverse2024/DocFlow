# Catalogo de Nodos Canvas

**Total:** 13 nodos activos (+ 1 deprecado) | **Actualizado:** 2026-04-03

---

## Reglas de Oro — Leer ANTES de disenar o modificar cualquier CatFlow

> Derivadas de fallos reales del canvas Revision Diaria Inbound. Documento completo: [proceso-catflow-revision-inbound.md](proceso-catflow-revision-inbound.md)

**Antes de tocar el canvas:**
- **R01** Definir el contrato de datos entre TODOS los nodos (que campos produce cada uno, que consume el siguiente) antes de escribir instrucciones.
- **R02** Calcular `N_items x tool_calls_por_item` y comparar con MAX_TOOL_ROUNDS (12). Si supera el 60%, usar ITERATOR o Dispatcher/Worker.
- **R03** Traducir el problema de negocio a criterios tecnicos verificables. "Emails sin respuesta" ≠ "emails no leidos".
- **R04** Probar el flujo minimo (START → primer nodo LLM → Output) con datos reales antes de anadir mas nodos.

**Diseno de nodos:**
- **R05** Un nodo = una responsabilidad. Si un nodo redacta + maqueta + selecciona plantilla, dividirlo.
- **R06** El conocimiento de negocio va en skills, no en instrucciones del nodo. Instrucciones = protocolo de pasos. Skills = inteligencia.
- **R07** Nodo CatBrain = texto→texto. Nodo Agent con CatBrain vinculado = JSON→JSON con RAG. Para manipular arrays JSON, SIEMPRE Agent.
- **R08** No vincular conectores ni skills innecesarios. Cada tool disponible es contexto que confunde al LLM.
- **R09** Los CatPaws son genericos, la especializacion es del canvas. Usar extras del nodo sin modificar el CatPaw base.

**Instrucciones de nodos LLM:**
- **R10** Si recibe JSON y devuelve JSON, la primera linea DEBE ser la regla anti-telefono-escacharrado: "Devuelve el MISMO array JSON, anadiendo solo tus campos. Manten TODOS los originales intactos."
- **R11** Las instrucciones dicen QUE hacer, no prohiben. Si escribes "NO hagas X" cinco veces, cambia el tipo de nodo.
- **R12** Especificar SIEMPRE "PASA SIN MODIFICAR" para items que el nodo debe ignorar.
- **R13** Nombres de campos canonicos identicos en todo el pipeline (reply_to_email es reply_to_email en TODOS los nodos).

**Ejecucion y arrays:**
- **R14** Arrays + tool-calling = ITERATOR. Nunca pasar arrays de >1 elemento a nodos que usan tools internamente.
- **R15** Un nodo LLM recibe la cantidad MINIMA de informacion necesaria. Recortar body, limitar campos.
- **R16** Max Tokens = estimacion realista del output. Array JSON de N items con M campos: `N x M x 60 tokens`.
- **R17** Todo nodo LLM es probabilistico. Asumir que puede devolver basura. Planificar contratos, ITERATOR, fallbacks.

**Plantillas:**
- **R18** Toda plantilla con contenido dinamico NECESITA al menos 1 bloque `instruction`. Si no lo tiene, el connector inyecta HTML del texto despues del visual.
- **R19** Separar seleccion de plantilla (skill) de maquetacion (tools). La skill decide QUE plantilla, el nodo ejecuta.

**Separacion LLM / Codigo:**
- **R20** Si puede hacerse con codigo (render template, enviar email, mark_read, buscar DB), NO delegarlo al LLM. El LLM produce el ESQUEMA. El codigo ejecuta.
- **R21** El codigo SIEMPRE limpia output del LLM (strip markdown, validar JSON, merge campos). Nunca confiar en el formato.
- **R22** Referencias entre entidades usan RefCodes (6 chars alfanumericos), no nombres. Lookup tolerante: ref_code → nombre → parcial → ID.
- **R23** Separar nodos de pensamiento (LLM: clasificar, redactar) de nodos de ejecucion (codigo: render, send, mark_read). No mezclar en el mismo nodo.

**Resiliencia:**
- **R24** Nunca hacer fallback destructivo. Si input corrupto, devolver vacio — no inventar datos. JSON truncado se repara o se descarta.
- **R25** Idempotencia obligatoria: registrar messageId procesados en `canvas_processed_emails`. Triple proteccion: Lector (threadId) + ITERATOR (filter) + Connector (safety net).

---

## Indice

| # | Nodo | Tipo | Color | Funcion principal |
|---|------|------|-------|-------------------|
| 1 | Start | start | Esmeralda | Punto de entrada del flujo. Define input inicial y modo escucha |
| 2 | Agent | agent | Violeta | Ejecuta un CatPaw o LLM directo con instrucciones |
| 3 | CatBrain | catbrain | Violeta | Consulta base de conocimiento RAG o busqueda web |
| 4 | Connector | connector | Naranja | Invoca servicio externo (Gmail, Drive, Holded, HTTP, MCP) |
| 5 | Checkpoint | checkpoint | Ambar | Pausa la ejecucion para aprobacion humana |
| 6 | Merge | merge | Cyan | Combina multiples entradas en una sola salida |
| 7 | Condition | condition | Amarillo | Bifurca el flujo segun evaluacion LLM (si/no) |
| 8 | Scheduler | scheduler | Ambar | Controla tiempos: delay, conteo de ciclos, escucha |
| 9 | Storage | storage | Teal | Guarda contenido en disco local y/o conector externo |
| 10 | MultiAgent | multiagent | Purpura | Lanza otro Canvas (CatFlow) de forma sincrona o asincrona |
| 11 | Output | output | Esmeralda | Nodo terminal: formatea resultado, notifica, encadena otros flujos |
| 12 | Iterator | iterator | Rosa | Bucle forEach sobre arrays con limite configurable |
| 13 | Iterator End | iterator_end | Rosa | Interruptor que señaliza fin de cada iteracion |
| 14 | Project | project | Azul | **DEPRECADO** — alias de CatBrain por compatibilidad |

---

## Modos del Canvas

Los nodos disponibles dependen del modo del Canvas:

| Modo | Nodos disponibles |
|------|-------------------|
| **agents** | start, agent, checkpoint, merge, condition, scheduler, iterator, storage, multiagent, output |
| **catbrains** | start, catbrain, checkpoint, merge, condition, scheduler, iterator, storage, multiagent, output |
| **mixed** | start, agent, catbrain, connector, checkpoint, merge, condition, scheduler, iterator, storage, multiagent, output |

---

## Arquitectura de Ejecucion

El Canvas ejecuta los nodos en **orden topologico** (algoritmo de Kahn) siguiendo las conexiones del grafo dirigido aciclico (DAG).

**Flujo de ejecucion por nodo:**
1. Se marca como `running`
2. Se obtiene la salida del nodo predecesor (input)
3. Se ejecuta la logica del nodo segun su tipo
4. Se marca como `completed` o `failed`
5. La salida se pasa al siguiente nodo conectado

**Estados posibles de un nodo:**
- `idle` — sin ejecutar
- `running` — en ejecucion
- `completed` — finalizado con exito
- `failed` — finalizado con error
- `waiting` — pausado (checkpoint o scheduler-listen)
- `skipped` — omitido por rama no seleccionada

---

## 1. Start

| Campo | Valor |
|-------|-------|
| **Tipo** | `start` |
| **Color** | Esmeralda (#059669) |
| **Icono** | Play |
| **Forma** | Circular (120x120px) |

**Funcion:** Punto de entrada obligatorio del Canvas. Define el input inicial que recibe el primer nodo del flujo.

**Configuracion:**

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `initialInput` | string | Texto o datos iniciales que se pasan al primer nodo |
| `listen_mode` | 0/1 | Activa el modo escucha para recibir triggers externos |
| `schedule_config` | object | Configuracion de ejecucion programada (cron) |

**Comportamiento en ejecucion:**
- Si hay `external_input` en el canvas (inyectado por un trigger externo de otro CatFlow), lo consume y lo pasa como salida
- Si no hay input externo, devuelve el `initialInput` configurado
- En `listen_mode=1`, muestra badge "LISTEN" y acepta triggers desde otros Canvas via nodo MultiAgent

**Conexiones:**
- Entrada: Handle izquierdo (solo en listen_mode=1, color naranja)
- Salida: Handle derecho (esmeralda)

---

## 2. Agent

| Campo | Valor |
|-------|-------|
| **Tipo** | `agent` |
| **Color** | Violeta (#7c3aed) |
| **Icono** | CatPaw |
| **Forma** | Rectangular (240x80px) |

**Funcion:** Ejecuta un CatPaw (agente IA) con el input del nodo anterior. Si no hay CatPaw vinculado, hace llamada directa al LLM.

**Configuracion:**

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `agentId` | string | ID del CatPaw a ejecutar. Al crear via CatBot, el nombre, modelo y modo se resuelven automaticamente desde la DB. |
| `agentName` | string | Nombre visible del agente (auto-resuelto, nunca UUID) |
| `model` | string | Modelo LLM (default: gemini-main) |
| `mode` | string | Modo del agente: chat, processor |
| `instructions` | string | Instrucciones adicionales (system prompt del nodo) |
| `skills` | string[] | IDs de skills EXTRA añadidas desde el canvas (no tocan el CatPaw base) |
| `extraConnectors` | string[] | IDs de conectores EXTRA añadidos desde el canvas (no tocan el CatPaw base) |
| `extraCatBrains` | string[] | IDs de CatBrains EXTRA añadidos desde el canvas (consulta RAG adicional) |

**Modelo de dos capas (Base + Canvas):**

El nodo Agent tiene un sistema de dos capas para skills, conectores y CatBrains:

| Capa | Origen | Editable desde canvas | Se ejecuta |
|------|--------|----------------------|------------|
| **Base** | CatPaw (/agents) | NO (solo lectura, sin X) | SI — siempre |
| **Extra** | Canvas (este nodo) | SI (borde dashed, con X) | SI — se mergea con base |

- **Skills base**: vinculadas al CatPaw en /agents. Pills con borde solido. No se pueden quitar.
- **Skills extra**: añadidas desde canvas con "+ Vincular". Pills con borde dashed. Solo este nodo.
- **Conectores base**: vinculados al CatPaw. Solo lectura en canvas.
- **Conectores extra**: añadidos desde canvas. Solo este nodo.
- **CatBrains base**: vinculados al CatPaw. Se muestran con query_mode (rag/connector/both). Solo lectura.
- **CatBrains extra**: añadidos desde canvas. Consulta RAG adicional para este nodo.

En ejecucion, `executeCatPaw()` recibe `extraSkillIds`, `extraConnectorIds` y `extraCatBrainIds` y los mergea con la configuracion base (sin duplicados). **El CatPaw base NUNCA se modifica desde el canvas.**

**Comportamiento en ejecucion:**
1. Busca el CatPaw por `agentId` en la base de datos
2. Si existe y esta activo: ejecuta `executeCatPaw()` con el input del predecesor como query
3. Mergea skills base (del CatPaw) + skills extra (del nodo canvas)
4. Mergea conectores base + conectores extra
5. Mergea CatBrains base + CatBrains extra → consulta RAG de todos
6. Si no existe CatPaw: hace llamada directa al LLM con `instructions` como system prompt
7. Registra metricas de uso (tokens entrada/salida, duracion)

**El CatPaw ejecutado tiene acceso a:**
- Skills base + extra — mergeadas
- Conectores base + extra — mergeados
- CatBrains base + extra — consultados para contexto RAG
- Su configuracion propia (temperatura, max_tokens, tono, formato salida)

**Conexiones:**
- Entrada: Handle izquierdo (violeta)
- Salida: Handle derecho (violeta)

---

## 3. CatBrain

| Campo | Valor |
|-------|-------|
| **Tipo** | `catbrain` |
| **Color** | Violeta (#7c3aed) |
| **Icono** | CatBrain |
| **Forma** | Rectangular (240x80px) |

**Funcion:** Consulta una base de conocimiento RAG (CatBrain) o ejecuta busqueda web. Inyecta conocimiento contextual en el flujo.

**Configuracion:**

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `catbrainId` | string | ID del CatBrain a consultar |
| `catbrainName` | string | Nombre visible |
| `search_engine` | string | Motor de busqueda: auto, searxng, gemini, ollama |
| `connector_mode` | string | Modo: rag, connector, both |
| `input_mode` | string | **independent**: CatBrain hace su propia query RAG. **pipeline**: recibe output del predecesor como contexto |
| `ragQuery` | string | Query personalizada para busqueda RAG |

**Comportamiento en ejecucion:**
- **CatBrain WebSearch** (seed-catbrain-websearch): ejecuta busqueda web via SearXNG/Gemini/Ollama
- **CatBrain normal**: ejecuta `executeCatBrain()` con la query
- **Modo independiente**: el CatBrain hace su propia busqueda RAG ignorando el predecesor
- **Modo pipeline**: el CatBrain recibe la salida del nodo anterior como contexto para la consulta

**Indicadores visuales:**
- Punto verde: RAG listo
- Punto ambar: procesando
- Punto gris: sin RAG

**Conexiones:**
- Entrada: Handle izquierdo (violeta)
- Salida: Handle derecho (violeta)

---

## 4. Connector

| Campo | Valor |
|-------|-------|
| **Tipo** | `connector` |
| **Color** | Naranja (#ea580c) |
| **Icono** | Plug |
| **Forma** | Rectangular (220x80px) |

**Funcion:** Invoca un servicio externo. Soporta Gmail, Google Drive, Holded MCP, APIs HTTP, n8n webhooks y servidores MCP genericos.

**Configuracion:**

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `connectorId` | string | ID del conector a usar |
| `connectorName` | string | Nombre visible |
| `mode` | string | **before**: ejecuta antes del nodo siguiente. **after**: ejecuta despues |
| `tool_name` | string | Para MCP: nombre de la herramienta a invocar |
| `tool_args` | object | Para MCP: argumentos adicionales |
| `drive_operation` | string | Para Drive: upload, download, list, create_folder |
| `drive_folder_id` | string | Para Drive: ID de carpeta destino |
| `drive_file_id` | string | Para Drive: ID de archivo |
| `drive_file_name` | string | Para Drive: nombre del archivo |
| `drive_mime_type` | string | Para Drive: tipo MIME |

**Comportamiento segun tipo de conector:**

| Tipo conector | Accion |
|---------------|--------|
| **gmail** | Parsea la salida del predecesor como payload de email y envia. Soporta: to, subject, body, html_body, cc |
| **google_drive** | Ejecuta operacion Drive: upload (sube contenido), download (lee archivo), list (lista carpeta), create_folder |
| **mcp_server** | Llama herramienta via JSON-RPC al servidor MCP (ej: Holded, LinkedIn) |
| **http_api** | Hace GET/POST con parametros/body template. Filtra resultados con `result_fields` y `max_results` |
| **n8n_webhook** | Envia payload al webhook de n8n |

**Importante:** El nodo Connector siempre devuelve la salida del predecesor (pass-through), no la respuesta del conector. La accion del conector es un efecto secundario.

**Conexiones:**
- Entrada: Handle izquierdo (naranja)
- Salida: Handle derecho (naranja)

---

## 5. Checkpoint

| Campo | Valor |
|-------|-------|
| **Tipo** | `checkpoint` |
| **Color** | Ambar (#d97706) |
| **Icono** | UserCheck |
| **Forma** | Rectangular (220x90px) |

**Funcion:** Pausa la ejecucion del Canvas y espera aprobacion humana. El usuario revisa la salida del nodo anterior y decide si continuar o rechazar.

**Configuracion:**

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `instructions` | string | Instrucciones para el revisor humano (que debe verificar) |

**Comportamiento en ejecucion:**
1. El nodo recibe la salida del predecesor
2. Transiciona a estado `waiting`
3. La ejecucion del Canvas se pausa
4. El usuario ve la salida y las instrucciones en la UI
5. El usuario aprueba o rechaza
6. Si aprueba: continua por la rama "approved" con la salida sin modificar
7. Si rechaza: continua por la rama "rejected"

**Casos de uso tipicos:**
- Revisar email antes de enviarlo
- Validar lista de leads antes de procesarlos
- Aprobar presupuesto antes de enviarlo al cliente
- Verificar calidad de contenido generado

**Conexiones:**
- Entrada: Handle izquierdo (ambar)
- Salida aprobada: Handle derecho superior (esmeralda, id="approved")
- Salida rechazada: Handle derecho inferior (rojo, id="rejected")

---

## 6. Merge

| Campo | Valor |
|-------|-------|
| **Tipo** | `merge` |
| **Color** | Cyan (#0891b2) |
| **Icono** | GitMerge |
| **Forma** | Rectangular (200x70px) |

**Funcion:** Combina las salidas de multiples nodos en una sola salida. Opcionalmente usa un LLM para sintetizar la informacion.

**Configuracion:**

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `handleCount` | number | Numero de entradas (2-5) |
| `agentId` | string | CatPaw opcional para sintetizar |
| `model` | string | Modelo LLM para sintesis (default: gemini-main) |
| `instructions` | string | Instrucciones de sintesis |

**Comportamiento en ejecucion:**
1. Espera a que todos los nodos conectados a sus handles de entrada completen
2. Recopila todas las salidas
3. **Sin LLM**: concatena las salidas con separadores `---`
4. **Con LLM**: llama al modelo con el prompt "Combina y sintetiza estos inputs en un documento unificado" + las instrucciones configuradas

**Casos de uso tipicos:**
- Combinar investigacion de multiples fuentes
- Unificar resultados de busqueda paralela
- Sintetizar informes de varios agentes

**Conexiones:**
- Entrada: Multiples handles izquierdos (2-5, cyan, ids: target-1 a target-5)
- Salida: Handle derecho unico (cyan)

---

## 7. Condition

| Campo | Valor |
|-------|-------|
| **Tipo** | `condition` |
| **Color** | Amarillo (#ca8a04) |
| **Icono** | GitBranch |
| **Forma** | Rectangular (220x80px) |

**Funcion:** Evalua una condicion sobre la salida del nodo anterior usando un LLM. Bifurca el flujo en dos ramas: si (yes) o no (no).

**Configuracion:**

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `condition` | string | Condicion a evaluar en lenguaje natural (ej: "El lead tiene email valido") |
| `model` | string | Modelo LLM para evaluacion (default: gemini-main) |

**Comportamiento en ejecucion:**
1. Recibe la salida del predecesor
2. Llama al LLM con: "Evaluando condicion: {condition}. Input: {salida_predecesor}. Responde SOLO con 'yes' o 'no'"
3. Si la respuesta empieza con "yes" → rama "yes"
4. Si no → rama "no"
5. Los nodos de la rama no seleccionada se marcan como `skipped`

**Casos de uso tipicos:**
- Verificar si hay leads nuevos antes de continuar
- Comprobar si un email requiere respuesta
- Validar si el contenido cumple criterios de calidad
- Decidir si un lead es cualificado para derivar

**Conexiones:**
- Entrada: Handle izquierdo (amarillo)
- Salida si: Handle derecho superior (verde, id="yes")
- Salida no: Handle derecho inferior (rojo, id="no")

---

## 8. Scheduler

| Campo | Valor |
|-------|-------|
| **Tipo** | `scheduler` |
| **Color** | Ambar (#d97706) |
| **Icono** | Timer / Radio / Hash (segun modo) |
| **Forma** | Rectangular (240x100px) |

**Funcion:** Controla el timing y la repeticion del flujo. Tres modos de operacion.

**Configuracion:**

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `schedule_type` | string | **delay**: pausa temporal. **count**: ciclos de repeticion. **listen**: espera señal |
| `delay_value` | number | Para delay: valor de tiempo (default: 5) |
| `delay_unit` | string | Para delay: seconds, minutes, hours |
| `count_value` | number | Para count: numero de ciclos (default: 3) |
| `listen_timeout` | number | Para listen: timeout en segundos |

**Comportamiento segun modo:**

### Modo delay
- Pausa la ejecucion durante el tiempo configurado
- Emite salida por handle `output-true` al completar
- Util para: esperar entre llamadas API, dar tiempo a procesos externos

### Modo count
- Mantiene un contador de ciclos en los metadatos del run
- Cada ejecucion incrementa el contador
- Emite `output-true` mientras quedan ciclos
- Emite `output-completed` cuando alcanza el maximo
- Util para: reintentos, iteraciones limitadas

### Modo listen
- Pausa la ejecucion y espera una señal via API
- Si recibe señal → `output-true`
- Si hace timeout → `output-false`
- Similar al checkpoint pero para señales programaticas

**Conexiones:**
- Entrada: Handle izquierdo (ambar)
- Salida activa: Handle derecho superior (verde, id="output-true")
- Salida completada: Handle derecho inferior (azul, id="output-completed")
- Salida timeout (solo listen): Handle derecho 75% (rojo, id="output-false")

---

## 9. Storage

| Campo | Valor |
|-------|-------|
| **Tipo** | `storage` |
| **Color** | Teal (#0d9488) |
| **Icono** | HardDrive |
| **Forma** | Rectangular (220x80px) |

**Funcion:** Guarda contenido en disco local y/o en un conector externo (Google Drive). Opcionalmente formatea con LLM antes de guardar.

**Configuracion:**

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `storage_mode` | string | **local**: disco del servidor. **connector**: conector externo. **both**: ambos |
| `filename_template` | string | Plantilla de nombre: {date}, {time}, {run_id}, {title} (default: {title}_{date}.md) |
| `subdir` | string | Subdirectorio local (sanitizado contra path traversal) |
| `connectorId` | string | ID del conector para modo connector/both |
| `use_llm_format` | boolean | Formatear contenido con LLM antes de guardar |
| `format_instructions` | string | Instrucciones para el LLM formateador |
| `format_model` | string | Modelo LLM para formateo |

**Comportamiento en ejecucion:**
1. Si `use_llm_format=true`: llama al LLM para formatear el contenido
2. Resuelve la plantilla de nombre (reemplaza {date}, {time}, etc.)
3. **Modo local**: escribe en `PROJECTS_PATH/storage/{subdir}/{filename}`
4. **Modo connector**: invoca el conector (ej: upload a Drive)
5. **Modo both**: hace ambas operaciones
6. Pasa el contenido (formateado o no) al siguiente nodo

**Variables de plantilla:**

| Variable | Valor |
|----------|-------|
| `{date}` | Fecha actual (YYYY-MM-DD) |
| `{time}` | Hora actual (HH-MM-SS) |
| `{run_id}` | ID de la ejecucion del Canvas |
| `{title}` | Nombre del Canvas |

**Conexiones:**
- Entrada: Handle izquierdo (teal)
- Salida: Handle derecho (teal)

---

## 10. MultiAgent

| Campo | Valor |
|-------|-------|
| **Tipo** | `multiagent` |
| **Color** | Purpura (#9333ea) |
| **Icono** | Network |
| **Forma** | Rectangular (240x100px) |

**Funcion:** Lanza la ejecucion de otro Canvas (CatFlow) que debe estar en modo escucha. Permite orquestar flujos complejos entre multiples Canvas.

**Configuracion:**

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `target_task_id` | string | ID del Canvas destino (debe tener listen_mode=1 en su Start) |
| `target_task_name` | string | Nombre visible del Canvas destino |
| `execution_mode` | string | **sync**: espera respuesta. **async**: fire-and-forget |
| `payload_template` | string | Plantilla con variables: {input}, {context}, {run_id} |
| `timeout` | number | Para sync: timeout en segundos (10-3600, default: 300) |

**Comportamiento segun modo:**

### Modo asincrono (async)
1. Valida que el Canvas destino existe y tiene listen_mode=1
2. Resuelve las variables de la plantilla de payload
3. Crea registro `catflow_trigger` en la base de datos
4. Establece `external_input` en el Canvas destino
5. Lanza la ejecucion del Canvas destino
6. **No espera respuesta** — devuelve inmediatamente: `{trigger_id, status: "launched"}`
7. Continua por la rama `output-response`

### Modo sincrono (sync)
1. Mismos pasos 1-5 que async
2. **Espera la respuesta** con carrera contra timeout
3. Comprueba periodicamente si hay respuesta del trigger o salida del run del Canvas destino
4. Si responde a tiempo → continua por `output-response` con la salida del Canvas destino
5. Si hace timeout → continua por `output-error` con mensaje de timeout

**Casos de uso tipicos:**
- Pipeline de prospeccion que lanza pipeline de email
- Canvas maestro que orquesta sub-flujos especializados
- Cadena de Canvas: prospeccion → investigacion → contacto

**Conexiones:**
- Entrada: Handle izquierdo (purpura)
- Salida respuesta: Handle derecho superior (verde, id="output-response")
- Salida error: Handle derecho inferior (rojo, id="output-error")

---

## 11. Output

| Campo | Valor |
|-------|-------|
| **Tipo** | `output` |
| **Color** | Esmeralda (#059669) |
| **Icono** | Flag |
| **Forma** | Circular (120x90px) |

**Funcion:** Nodo terminal del Canvas. Formatea la salida final, puede notificar y encadenar otros Canvas.

**Configuracion:**

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `outputName` | string | Nombre del resultado (visible en la UI) |
| `format` | string | **markdown**: formato MD. **json**: intenta parsear y formatear JSON. **plain**: texto plano |
| `notify_on_complete` | boolean | Crear notificacion en la campana cuando el Canvas complete |
| `trigger_targets` | array | Lista de Canvas destino a disparar al completar: [{id, name}] |

**Comportamiento en ejecucion:**
1. Recibe la salida del ultimo nodo
2. Si `format=json`: intenta parsear como JSON y lo formatea con indentacion
3. Si `notify_on_complete=true`: crea una notificacion en `/api/notifications`
4. Si hay `trigger_targets`: para cada Canvas destino que tenga listen_mode=1:
   - Crea registro `catflow_trigger`
   - Establece `external_input` con la salida del Canvas
   - Lanza la ejecucion del Canvas destino (fire-and-forget)
5. Devuelve la salida formateada

**Diferencia con MultiAgent:**
- **Output + trigger_targets**: fire-and-forget al final del flujo, sin esperar respuesta
- **MultiAgent sync**: en medio del flujo, espera respuesta del Canvas destino

**Conexiones:**
- Entrada: Handle izquierdo (esmeralda)
- Sin salida (nodo terminal)

---

## 12. Iterator

| Campo | Valor |
|-------|-------|
| **Tipo** | `iterator` |
| **Color** | Rosa (#e11d48) |
| **Icono** | Repeat |
| **Forma** | Rectangular (240x100px) |

**Funcion:** Bucle forEach sobre arrays. Recibe una lista de elementos, los emite uno a uno a traves del loop body, y acumula los resultados de cada iteracion. Trabaja en pareja con un nodo Iterator End.

**Configuracion:**

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `separator` | string | Separador para parsear el input. Vacio = autodeteccion (JSON array o lineas) |
| `limit_mode` | string | **none**: sin limite. **rounds**: maximo de iteraciones. **time**: tiempo maximo |
| `max_rounds` | number | Para rounds: numero maximo de iteraciones (1-1000, default: 10) |
| `max_time` | number | Para time: tiempo maximo en segundos (10-7200, default: 300) |
| `iteratorEndId` | string | ID del nodo Iterator End emparejado (auto-generado) |

**Sistema de pareja ITERATOR ↔ ITERATOR_END:**

El Iterator funciona con un nodo companero (Iterator End) que señaliza el fin de cada iteracion:

| Nodo | Funcion | Generacion |
|------|---------|------------|
| **Iterator** (principal) | Parsea array, emite elementos, controla limites | Se arrastra desde paleta |
| **Iterator End** (interruptor) | Señaliza fin de iteracion, acumula resultados | Boton "Generar interruptor" en config del Iterator |

- Si se elimina el Iterator End, el Iterator ejecuta una sola vez (sin bucle)
- Si se elimina el Iterator, el Iterator End pierde su vinculo automaticamente
- El Iterator End NO aparece en la paleta — se genera exclusivamente desde el Iterator

**Parseo del input (autodeteccion):**
1. Si el input es un JSON array valido `[...]` → cada elemento es un item
2. Si se configura un separador (`,`, `;`, `\n`) → split por separador
3. Si no, split por lineas (`\n`)
4. Si es una sola linea → un unico item

**Comportamiento en ejecucion:**
1. Primera vez: parsea el input del predecesor en un array de items. Almacena en `metadata.iterator_state`
2. Si array vacio → emite `[]` por handle "completed", salta el loop body
3. Si hay items → emite `items[0]` por handle "element" hacia el loop body
4. Los nodos del loop body procesan el elemento
5. Cuando Iterator End completa → acumula resultado, incrementa indice
6. Si hay mas items y no se alcanzo el limite → resetea nodos del loop body, re-ejecuta
7. Si termino → Iterator End emite el array de resultados acumulados por su salida

**Resiliencia ante fallos parciales (ITER-03):**
Si un nodo del loop body falla en una iteracion, el error se captura como resultado parcial:
```json
{"status": "error", "error_detail": "mensaje del error", "original_item": "item que fallo"}
```
La iteracion siguiente continua normalmente. Los resultados finales contienen tanto exitos como errores.

**Estado en metadata (canvas_runs):**
```json
{
  "iterator_state": {
    "nodeId": {
      "items": ["item1", "item2", "..."],
      "currentIndex": 0,
      "results": ["resultado1", "resultado2"],
      "startedAt": "2026-04-02T10:00:00.000Z"
    }
  }
}
```

**Conexiones:**
- Entrada: Handle izquierdo (rosa)
- Salida elemento: Handle derecho superior (verde, id="element") — emite un elemento por iteracion
- Salida completado: Handle derecho inferior (azul, id="completed") — bypass para array vacio

---

## 13. Iterator End

| Campo | Valor |
|-------|-------|
| **Tipo** | `iterator_end` |
| **Color** | Rosa (#e11d48) |
| **Icono** | CornerDownLeft |
| **Forma** | Rectangular pequeño (160x70px), borde dashed |

**Funcion:** Nodo interruptor que señaliza el fin de cada iteracion del bucle. Al completar, el sistema verifica si hay mas elementos y, si es asi, reinicia el loop body con el siguiente elemento.

**Configuracion:**

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `iteratorId` | string | ID del Iterator emparejado (auto-asignado) |

**Comportamiento en ejecucion:**
1. Recibe la salida del ultimo nodo del loop body
2. El motor de ejecucion detecta que es un Iterator End
3. Acumula el resultado en `iterator_state.results[]`
4. Incrementa `currentIndex`
5. **Si hay mas items**: resetea Iterator + nodos internos + Iterator End a pending, re-ejecuta
6. **Si termino**: establece su salida como `JSON.stringify(results)` y continua por sus edges normales

**Conexiones:**
- Entrada: Handle izquierdo (rosa)
- Salida: Handle derecho (rosa) — emite array acumulado de resultados al completar el bucle

---

## 14. Project (DEPRECADO)

| Campo | Valor |
|-------|-------|
| **Tipo** | `project` |
| **Color** | Azul (#2563eb) |
| **Icono** | FolderKanban |

**Estado:** DEPRECADO — usar nodo CatBrain en su lugar. Existe por compatibilidad con Canvas creados antes de la migracion a CatBrains. En ejecucion se trata identicamente a un nodo CatBrain.

---

## Patrones de Diseño Comunes

### Pipeline lineal simple
```
Start → Agent (Estratega ICP) → Agent (Analista Leads) → Storage → Output
```

### Bifurcacion condicional
```
Start → Agent → Condition ("¿Hay leads nuevos?")
                  ├─ yes → Agent (Investigar) → Output
                  └─ no → Output ("Sin leads")
```

### Aprobacion humana
```
Start → Agent (Redactor Email) → Checkpoint ("¿Email correcto?")
                                    ├─ approved → Connector (Gmail send)
                                    └─ rejected → Agent (Reescribir) → ...
```

### Merge de fuentes paralelas
```
Start ─┬─ Agent (Buscar web) ─────┐
       └─ CatBrain (RAG Educa360) ┤
                                   └─ Merge → Agent (Sintetizar) → Output
```

### Orquestacion multi-canvas
```
Canvas A: Start → Agent → MultiAgent (sync, target=Canvas B) → Output
Canvas B: Start (listen) → Agent → Output
```

### Bucle forEach con Iterator
```
Start → Agent (Lista emails) → Iterator (JSON array)
                                  ├─ element → Agent (Procesar) → Agent (Responder) → Iterator End → Output
                                  └─ completed → Output ("Sin emails")
```

### Flujo con almacenamiento
```
Start → Agent → Storage (local+Drive, {title}_{date}.csv) → Connector (Gmail) → Output
```

---

## Reglas Criticas para Conectores en Canvas

1. **Agent sin CatPaw = sin tools.** Un nodo Agent con agentId=null solo hace llamada LLM directa. Para usar herramientas (Gmail, Drive, Holded), SIEMPRE vincular un CatPaw con el conector.
2. **Connector node = side-effect.** Solo envia/ejecuta, no lee. Para LEER datos, usar Agent con CatPaw.
3. **Storage node = solo escribe.** Para leer datos previos de Drive, usar Agent con Operador Drive.

### CatPaws utilitarios para Canvas

| CatPaw | ID | Conector | Para |
|--------|-----|----------|------|
| Ejecutor Gmail | `65e3a722-9e43-43fc-ab8a-e68261c6d3da` | Info Educa360 | Leer, buscar, enviar, responder, marcar emails |
| Operador Drive | `e05f112e-f245-4a3b-b42b-bb830dd1ac27` | Educa360Drive | Listar, buscar, leer, subir archivos |
| Consultor CRM | `b63164ed-83ae-40d0-950e-3a62826bc76f` | Holded MCP | Contactos, leads, facturas, pipeline |

---
