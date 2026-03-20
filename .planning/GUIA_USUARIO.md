# 🐱 DoCatFlow — Guía de Usuario

> Documento vivo. Se actualiza con cada sesión de trabajo.
> Última actualización: Marzo 2026

---

## 1. CatBrains 🧠

### ¿Qué es un CatBrain?

Un CatBrain es una **base de conocimiento inteligente**. Reúne documentos, los procesa con IA, los indexa en un motor de búsqueda semántica (RAG) y permite consultarlos por chat o desde flujos del Canvas.

Piensa en él como un "cerebro" especializado en un tema: puedes tener un CatBrain de "Documentación técnica", otro de "Leads B2B", otro de "Políticas internas", etc.

### Crear un CatBrain paso a paso

1. Ir a **CatBrains** en el menú lateral
2. Clic en **+ Nuevo CatBrain**
3. Asignar nombre, descripción y opcionalmente un emoji
4. Entrarás al pipeline de 7 pasos

### Pipeline de 7 pasos

| Paso | Nombre | Qué hace |
|------|--------|----------|
| 1 | 📄 **Fuentes** | Sube archivos, URLs, YouTube, notas manuales |
| 2 | ⚙️ **Procesar** | Transforma las fuentes con IA o como contexto directo |
| 3 | 📜 **Historial** | Revisa versiones anteriores del documento procesado |
| 4 | 🔍 **RAG** | Indexa el documento en la base vectorial para búsqueda semántica |
| 5 | 🔌 **Conectores** | Conecta servicios externos (Gmail, LinkedIn, etc.) |
| 6 | ⚙️ **Configuración** | System prompt, modelo LLM, MCP Bridge |
| 7 | 💬 **Chat** | Conversa con el CatBrain usando su RAG |

### Fuentes — Tipos y formatos

| Tipo | Formatos | Notas |
|------|----------|-------|
| 📁 Archivos | `.md`, `.txt`, `.pdf`, `.docx`, `.csv`, `.json`, `.html`, `.xml`, `.yaml` | Límite 50MB por archivo |
| 🌐 URLs | Cualquier página web | Extrae el contenido automáticamente |
| 🎥 YouTube | URLs de YouTube | Extrae transcripción/subtítulos |
| 📝 Notas | Texto libre | Escritas directamente en la app |

**Formas de subir**:
- Drag & drop sobre la zona de carga
- Clic en "Seleccionar archivos"
- Subir carpeta completa (mantiene estructura)

### Procesamiento — Agente IA vs CatPaw Procesador

Hay dos motores de procesamiento:

| Motor | Cuándo usarlo | Cómo |
|-------|---------------|------|
| **Agente IA** | Procesamiento general con instrucciones libres | Asignar un agente en Configuración del CatBrain |
| **CatPaw Procesador** | Procesamiento especializado con system prompt, formato y temperatura específicos | Seleccionar un CatPaw modo "Procesador" en el panel |

**Modos por fuente**:

Cada fuente individual se puede configurar como:

- **Procesar** → pasa por el LLM (necesita agente o CatPaw)
- **Contexto directo** → se anexa tal cual al documento final, sin IA
- **Excluir** → se ignora en esta ejecución

> 💡 **Tip**: Si TODAS las fuentes están en "contexto directo" y no hay instrucciones ni skills, **no necesitas agente asignado**. El sistema simplemente concatena los documentos.

**Modelos recomendados**:

| Modelo | Velocidad | Calidad | Uso ideal |
|--------|-----------|---------|-----------|
| `gemini-main` | ⚡ Rápido | ✅ Buena | Procesamiento masivo, iteración rápida |
| `claude-opus` | 🐢 Lento | 🏆 Excelente | Documentos críticos, análisis profundo |

### RAG — Indexación y búsqueda semántica

El RAG (Retrieval-Augmented Generation) indexa tu documento procesado en fragmentos (chunks) para búsqueda semántica.

**Configuración de chunking**:

| Parámetro | Rango | Default | Descripción |
|-----------|-------|---------|-------------|
| Tamaño base del chunk | 256–2048 chars | 512 | El chunking inteligente adapta: código/tablas usan 60%, narrativa usa 140% |
| Solapamiento | 0–256 chars | 50 | Evita que información quede cortada entre chunks |

**Modelos de embedding probados**:

| Modelo | Dimensiones | Notas |
|--------|-------------|-------|
| `nomic-embed-text` | 768d | Rápido, buen balance |
| `mxbai-embed-large` | 1024d | Más preciso, más lento |

**Score mínimo de relevancia**: 0.4 — resultados por debajo se filtran automáticamente.

#### ⚡ Append incremental (RAG sin re-indexar)

Cuando añades fuentes nuevas a un CatBrain que ya tiene RAG:

1. Aparece un **banner violeta**: "X fuentes listas para indexar"
2. Pulsa **"Procesar y añadir al RAG"**
3. Solo se indexan las fuentes nuevas — no se re-procesa todo el RAG

> ⚠️ **Badge "Extracción limitada"**: Significa que el texto no se extrajo correctamente. Hay que **procesar la fuente primero** antes de intentar indexar en RAG.

> ⚠️ **"Sin RAG" en el canvas**: Es un bug visual del nodo CatBrain en el canvas. El RAG funciona si está configurado en el panel del CatBrain. Ignorar el badge.

### Configuración del CatBrain

En el paso **Configuración** puedes ajustar:

- **System Prompt**: instrucciones base para el chat y consultas RAG
- **Modelo LLM**: el modelo que usará para responder en chat
- **MCP Bridge**: activar/desactivar para que herramientas MCP externas accedan al RAG

### Modos de entrada en Canvas

Cuando un CatBrain se usa como nodo en el Canvas, tiene dos modos:

| Modo | Comportamiento | Cuándo usarlo |
|------|---------------|---------------|
| **Modo A** (independiente) | Ignora el input del nodo anterior. Hace consulta RAG con su propio query | Cuando el CatBrain siempre busca lo mismo |
| **Modo B** (pipeline secuencial) | Recibe el output del nodo anterior y lo usa como contexto + consulta RAG | Cuando el CatBrain necesita saber **qué buscar** según el flujo |

> 💡 **Tip clave**: Si el chat del CatBrain responde bien pero en el canvas no da buenos resultados, el problema suele ser el **Modo de entrada**. Cambiar a Modo B y escribir una consulta RAG específica sobre lo que necesitas extraer.

---

## 2. CatPaws 🐾

### ¿Qué es un CatPaw?

Un CatPaw es un **agente especializado**. A diferencia del CatBrain (que almacena conocimiento), el CatPaw **ejecuta tareas**: analizar datos, redactar emails, generar reportes, clasificar leads, etc.

### Tres modos de operación

| Modo | Descripción | Uso típico |
|------|-------------|------------|
| 💬 **Chat** | Conversación libre | Asistente de preguntas, brainstorming |
| ⚙️ **Procesador** | Procesa documentos automáticamente | Transformar fuentes en CatBrains, análisis batch |
| 🔄 **Híbrido** | Ambos modos disponibles | CatPaws versátiles |

> 💡 **Para el Canvas**: usa CatPaws en modo **Procesador** o **Híbrido**.

### Wizard de creación — 4 pasos

#### Paso 1: Identidad

| Campo | Descripción |
|-------|-------------|
| Nombre | Nombre descriptivo (ej: "Estratega de Leads B2B") |
| Emoji | Icono visual del CatPaw |
| Color | Color de acento en la UI |
| Departamentos | Separados por coma (ej: "Marketing, Ventas") |
| Modo | Chat, Procesador o Híbrido |
| Descripción | Qué hace este CatPaw |

#### Paso 2: Personalidad

| Campo | Recomendación |
|-------|--------------|
| **System Prompt** | Define personalidad y formato de salida esperado. Si necesitas JSON, especificarlo aquí Y en Formato de salida |
| **Modelo** | Seleccionar del dropdown (`gemini-main` por defecto). **No escribir a mano** |
| **Temperatura** | `0.2` para precisión (JSON, análisis), `0.3–0.5` para redacción, `0.7+` para creatividad |
| **Max Tokens** | `2048` respuestas cortas, `4096` análisis, `8192` documentos largos (HTML) |
| **Instrucciones de procesamiento** | Complementan el system prompt, específicas para cada ejecución |
| **Formato de salida** | `json` para datos estructurados, `markdown` para documentos |

#### Paso 3: Skills

Seleccionar **solo las relevantes**. Para CatPaws de análisis/procesamiento generalmente no se necesita ninguna.

#### Paso 4: Conexiones

| Conexión | Para qué |
|----------|----------|
| **CatBrains** | Si el CatPaw necesita acceder al RAG directamente |
| **Conectores** | Seleccionar el conector que usará (Gmail, LinkedIn, SearXNG, etc.) |
| **Pista de uso** | Descripción de para qué usa ese conector — ayuda al agente a entender cuándo invocarlo |

### Tips críticos aprendidos

> ⚠️ **System prompt vs instrucciones del nodo Canvas**: El system prompt tiene **más peso** que las instrucciones del nodo. Si el system prompt tiene datos hardcodeados (sectores, nombres), el CatPaw los usará ignorando el input del flujo. **Solución**: usar placeholders dinámicos en el system prompt.

> ⚠️ **Flujos de leads**: El CatPaw Estratega debe incluir "BASÁNDOTE EXCLUSIVAMENTE en la información recibida" — sin ICP predefinido en el system prompt.

> ⚠️ **Generación de HTML**: El CatPaw Redactor debe tener una REGLA CRÍTICA sobre links — **nunca inventar URLs** de LinkedIn u otros sitios. Solo usar URLs que vienen en el input.

---

## 2.5 Cómo crear Skills y Prompts profesionales para CatPaws 🎯

> Esta sección documenta las reglas aprendidas por experiencia real trabajando con
> DoCatFlow. Seguirlas marca la diferencia entre un CatPaw que funciona bien y uno
> que alucina, inventa datos o ignora el contexto del flujo.

---

### Reglas fundamentales de un buen System Prompt

#### Regla 1 — Nunca hardcodear datos del negocio

❌ **MAL:** `"sector": ["FP", "colegios privados", "ATECA"]`
✅ **BIEN:** `"sector": ["extraído del contexto recibido"]`

Si pones datos fijos en el system prompt, el CatPaw los usará siempre, ignorando
lo que le llegue del canvas. Todo lo que pueda variar debe ser dinámico.

#### Regla 2 — Especificar el formato de salida con ejemplo completo

El LLM debe saber exactamente qué estructura devolver. No basta con decir
"devuelve un JSON" — hay que incluir el JSON completo con todos los campos,
tipos y ejemplos de valores.

❌ **MAL:** `"Devuelve los leads en formato JSON"`
✅ **BIEN:** Incluir la estructura JSON completa con campos reales y comentarios
sobre qué poner en cada uno.

#### Regla 3 — Instrucción SOLO al principio Y al final

Los LLMs tienen sesgo de posición — recuerdan mejor el principio y el final.
Pon la instrucción crítica de formato en ambos sitios:

```
[Al inicio] Responde SIEMPRE con este JSON exacto y nada más.
[Estructura completa en el medio]
[Al final] IMPORTANTE: Responde SOLO con el JSON. Sin texto antes ni después.
```

#### Regla 4 — Casuística explícita para cada caso especial

Si el CatPaw puede encontrarse con situaciones ambiguas, hay que decirle
exactamente qué hacer en cada caso. Sin casuística, el LLM improvisa.

Ejemplos de casuística necesaria:
- Si no encuentra datos suficientes → qué devolver
- Si hay duplicados → cómo consolidar
- Si una URL no es verificable → poner null, nunca inventar
- Si no llegan suficientes leads → garantizar mínimo de 5 aunque sean parciales

#### Regla 5 — Las URLs nunca se inventan

Esta es la regla más crítica aprendida en producción. Un LLM construirá URLs
plausibles que no existen. La instrucción debe ser explícita y con ejemplos:

```
REGLA DE ORO — URLs DE LINKEDIN:
URL personal válida: https://www.linkedin.com/in/nombre-apellido-XXXXXXXX/
donde XXXXXXXX es un código alfanumérico (ej: ba322560, 2b3c4d5e).
Sin ese código al final = URL inventada = pon null.
NUNCA construyas URLs. Solo incluye las que aparezcan literalmente en los datos.
```

#### Regla 6 — El system prompt vs las instrucciones del nodo Canvas

El system prompt define la personalidad y el formato permanente del CatPaw.
Las instrucciones del nodo Canvas añaden contexto específico para esa ejecución.
Las instrucciones del nodo Canvas **NO** sobreescriben el system prompt — se suman.
Si hay contradicción, el system prompt tiene más peso.

**Consecuencia práctica:** si el system prompt tiene un ICP hardcodeado, las
instrucciones del nodo Canvas que digan "usa el ICP del contexto" no servirán.

#### Regla 7 — Temperatura según tipo de tarea

| Tarea | Temperatura | Por qué |
|-------|-------------|---------|
| Generar JSON estructurado | 0.1 – 0.2 | Máxima consistencia, sin variación |
| Análisis y cualificación | 0.2 – 0.3 | Preciso pero con algo de criterio |
| Redacción de informes | 0.3 – 0.4 | Fluido pero controlado |
| Contenido creativo | 0.6 – 0.8 | Variedad y creatividad |

#### Regla 8 — Max Tokens según output esperado

| Output | Max Tokens |
|--------|-----------|
| JSON corto (ICP + queries) | 2048 |
| JSON largo (lista de leads) | 4096 |
| HTML completo de informe | 8192 |
| Análisis extenso | 4096 – 8192 |

---

### Estructura ideal de un System Prompt profesional

Un system prompt bien construido tiene siempre estas 5 secciones en este orden:

```
1. ROL — Quién eres y cuál es tu especialidad
2. MISIÓN — Qué debes hacer exactamente en esta ejecución
3. PROCESO — Pasos ordenados que debes seguir (FASE 1, FASE 2...)
4. CASUÍSTICA — Qué hacer en cada caso especial
5. OUTPUT — Formato exacto de salida con ejemplo completo + recordatorio final
```

---

### Cómo pedir a la IA que genere un buen skill

El prompt que le darías a Claude para que genere un skill profesional para DoCatFlow:

**Prompt de ejemplo para generar un skill de Lead Hunting:**

```
Necesito que crees un system prompt profesional para un CatPaw de DoCatFlow
llamado "Estratega de Leads" en modo Procesador.

CONTEXTO DE LA PLATAFORMA:
- DoCatFlow es una plataforma de IA con flujos tipo Canvas
- Este CatPaw recibe como input el output del nodo anterior (texto libre con
  contexto del producto y sector)
- Su output pasa a 3 conectores SearXNG en paralelo y a LinkedIn MCP
- Los conectores usan {{output}} para construir sus queries de búsqueda

FUNCIÓN DEL CATPAW:
Analizar el contexto del producto recibido y generar una estrategia de búsqueda
de leads B2B con:
- ICP (Ideal Customer Profile) dinámico basado en el contexto recibido, nunca hardcodeado
- Queries específicas para 3 tipos de búsqueda: empresas en zona cercana,
  empresas nacional, directivos y LinkedIn
- Zona geográfica: priorizar radio 200km del vendedor, luego nacional
- Número de leads: respetar el solicitado, mínimo 5 si no se especifica

REGLAS CRÍTICAS QUE DEBE SEGUIR:
- Nunca usar datos hardcodeados de sectores, empresas o cargos
- Basarse EXCLUSIVAMENTE en el contexto recibido
- La output debe ser un JSON válido y nada más (ni texto antes ni después)
- Temperatura recomendada: 0.2

FORMATO DE SALIDA REQUERIDO:
El JSON debe tener estos campos:
- meta: producto, sector, ubicacion_vendedor, num_leads_objetivo, icp_resumen
- icp: tipos_empresa, cargos_decisores, tamanio_empresa, zona_primaria,
       zona_secundaria, senales_compra
- queries: empresas_zona, empresas_nacional, empresas_linkedin,
           directivos_web, directivos_linkedin, noticias_sector
- keywords_complementarias: array de 3-5 términos
- notas_estrategia: observación sobre el sector

CASOS ESPECIALES A MANEJAR:
- Si no se especifica sector: extraerlo de las características del producto
- Si no se especifica ubicación: usar "España" como zona primaria y secundaria
- Si no se especifica número de leads: usar 5 como mínimo
- Si el producto tiene múltiples sectores objetivo: crear queries para cada uno

Genera el system prompt completo listo para copiar y pegar en DoCatFlow.
Incluye las 5 secciones: ROL, MISIÓN, PROCESO, CASUÍSTICA y OUTPUT.
El prompt debe estar en español.
```

---

### Lo que hace diferente este tipo de prompt

| Sin especificar | Especificando bien |
|-----------------|-------------------|
| "Crea un agente de leads" | Define el contexto exacto de la plataforma |
| El LLM inventa el flujo | Explica cómo llega y sale la información |
| Output genérico | Especifica cada campo del JSON requerido |
| Sin casos especiales | Lista las situaciones ambiguas y qué hacer |
| Prompt básico | Pide estructura en 5 secciones profesionales |

---

### Checklist antes de guardar un CatPaw

- [ ] ¿El system prompt menciona explícitamente el formato de salida?
- [ ] ¿Hay un ejemplo completo del JSON/HTML esperado?
- [ ] ¿La instrucción SOLO aparece al inicio Y al final?
- [ ] ¿Ningún dato de negocio está hardcodeado?
- [ ] ¿Hay casuística para cuando falten datos?
- [ ] ¿Las URLs tienen regla explícita de nunca inventar?
- [ ] ¿La temperatura es adecuada para el tipo de tarea?
- [ ] ¿El Max Tokens es suficiente para el output esperado?
- [ ] ¿Las instrucciones del nodo Canvas complementan (no contradicen) el system prompt?
- [ ] ¿Se ha probado con un caso real antes de usar en producción?

---

## 3. Canvas 🎨

### ¿Qué es el Canvas?

El Canvas es el **editor visual de flujos**. Conectas nodos (CatPaws, CatBrains, conectores) para crear pipelines automatizados. Cada nodo recibe el output del anterior y produce un resultado que pasa al siguiente.

**¿Canvas o Tareas?**

| Canvas | Tareas |
|--------|--------|
| Flujos visuales con múltiples pasos | Ejecución simple de un CatPaw |
| Bifurcaciones, merges, checkpoints | Una entrada → una salida |
| Integración con conectores externos | Sin conectores |

### Tipos de canvas

- **Agentes**: solo nodos CatPaw
- **CatBrains**: solo nodos CatBrain
- **Mixto**: combina CatPaws y CatBrains
- **Desde Plantilla**: usa un flujo predefinido

### 8 tipos de nodos

| Nodo | Color | Función |
|------|-------|---------|
| 🟢 **Inicio** | Verde | Input inicial del flujo, texto libre |
| 🟣 **Agente/CatPaw** | Violeta | Ejecuta un CatPaw, recibe input del nodo anterior |
| 🔮 **CatBrain** | Violeta oscuro | Consulta RAG, tiene Modos A y B |
| 🟠 **Conector** | Naranja | Invoca conector externo (Gmail, LinkedIn, SearXNG, HTTP) |
| 🔵 **Fusionar/Merge** | Cyan | Combina 2–5 entradas, con o sin agente sintetizador |
| 🟡 **Check** | Ámbar | Checkpoint humano — aprueba o rechaza con feedback |
| 🌕 **Condición** | Amarillo | Bifurca el flujo según evaluación LLM (yes/no) |
| 🟢 **Salida/Resultado** | Verde (pill) | Nodo final, muestra el output |

### Cómo conectar nodos

1. Localiza el **punto blanco** en el borde derecho del nodo origen
2. Arrastra desde ese punto hasta el **punto izquierdo** del nodo destino
3. Se crea un edge (conexión) visible

### Configuración de nodos

Hacer **clic en un nodo** para abrir el **panel inferior** de configuración. Cada tipo de nodo tiene opciones diferentes:

- **CatPaw**: seleccionar agente, escribir instrucciones específicas para este paso
- **CatBrain**: seleccionar CatBrain, modo de entrada (A/B), consulta RAG
- **Conector**: seleccionar conector, escribir payload JSON

### Payload de conectores

El campo de payload usa `{{output}}` para inyectar el output del nodo anterior:

```json
{
  "to": "cliente@empresa.com",
  "subject": "Propuesta personalizada",
  "body": "{{output}}"
}
```

### Nodo Fusionar/Merge

| Config | Comportamiento |
|--------|---------------|
| Sin agente sintetizador | Solo concatena las entradas |
| Con agente sintetizador | Procesa y resume los datos combinados con IA |

El nodo Merge necesita **mínimo 2 edges entrantes** conectados explícitamente.

### Flujo Lead Hunting — arquitectura probada

```
Inicio → CatBrain(Modo B) → Agente(Estratega)
  → Conector(LinkedIn) ──┐
                          ├→ Merge → Agente(Analista) → Agente(Redactor) → Conector(Gmail) → Salida
  → Conector(SearXNG) ───┘
```

**Cómo funciona**:
1. **Inicio**: datos del lead o empresa objetivo
2. **CatBrain (Modo B)**: busca en el RAG información relevante usando el input
3. **Estratega**: analiza y genera queries de búsqueda
4. **LinkedIn + SearXNG**: ejecutan búsquedas en paralelo
5. **Merge**: combina resultados de ambos conectores
6. **Analista**: cruza datos y genera perfil del lead
7. **Redactor**: genera email HTML personalizado
8. **Gmail**: envía el email

### Tips críticos aprendidos

> 💡 **Badge "Sin RAG"** en el nodo CatBrain es un bug visual — el RAG funciona si está configurado en el panel.

> 💡 **Modo B** del CatBrain es necesario cuando el flujo necesita que el CatBrain sepa qué buscar según el input inicial.

> 💡 **Conectores en modo "Después (after)"** se ejecutan tras recibir el output del nodo anterior.

> ⚠️ **Nodo en rojo**: revisar el panel de **Resultado** al final del canvas para ver el error detallado.

> 💡 **Instrucciones del nodo Canvas** sobreescriben parcialmente el system prompt del CatPaw para ese nodo específico. Útil para personalizar un CatPaw genérico en un paso concreto.

> 💡 **Auto-organizar** (botón en la toolbar) alinea los nodos automáticamente para mejor visibilidad.

> 💡 **Paneles redimensionables**: el panel inferior de configuración y el de resultados se pueden redimensionar arrastrando el borde superior. El tamaño máximo es 80% del viewport.

---

## 4. Conectores 🔌

> 🚧 En construcción — se documentará con la experiencia acumulada

### 4.1 Tipos de conectores

### 4.2 Conector Gmail (Personal y Workspace)

### 4.3 Conector LinkedIn Intelligence MCP

### 4.4 Conector SearXNG Web Search

### 4.5 Conector HTTP API genérico

### 4.6 Tips y errores comunes

---

## 5. Tareas Multi-Agente 📋

> Las Tareas son pipelines secuenciales donde varios agentes IA colaboran en orden
> para producir un documento complejo, con la posibilidad de que tu revises y apruebes
> en puntos clave del proceso.

---

### 5.1 Cuando usar Tareas vs Canvas

| Situacion | Usar |
|-----------|------|
| Necesitas conectores externos (Gmail, LinkedIn, SearXNG) | Canvas |
| Necesitas busquedas paralelas y fusionar resultados | Canvas |
| Quieres producir un documento con revision humana en el medio | **Tareas** |
| Varios agentes trabajan en secuencia sobre el mismo contenido | **Tareas** |
| Quieres guardar y re-ejecutar el mismo pipeline para distintos inputs | **Tareas** |
| El flujo es completamente automatico sin intervencion | Canvas |

**Regla simple:** si el flujo toca el mundo exterior (APIs, email, busquedas),
usa Canvas. Si el flujo produce un documento con IA y quieres supervisarlo, usa Tareas.

---

### 5.2 Caso de uso real probado — Preparar Contacto Comercial

Pipeline de 5 pasos probado en produccion con el lead Carlos Martinez
(Director de Innovacion, Sanitas Mayores):

```
Paso 1 — Investigador (Agente + RAG Educa360)
  Analiza el perfil del lead, consulta el RAG del producto y extrae
  los argumentos mas relevantes segun cargo y empresa
  ↓
Paso 2 — Redactor LinkedIn (Agente)
  Genera dos versiones del mensaje: solicitud de conexion (300 chars)
  y mensaje directo completo
  ↓
Paso 3 — Checkpoint (Revision humana)
  Lees los mensajes, apruebas o das feedback para que se rehagan
  ↓
Paso 4 — Preparador de Demo (Agente)
  Genera guion de 20 minutos con apertura, preguntas de descubrimiento,
  presentacion, manejo de objeciones y cierre
  ↓
Paso 5 — Sintesis
  Empaqueta todo: ficha ejecutiva + mensajes + guion en un documento .md
```

**Resultado:** documento profesional completo en ~3 minutos, listo para usar.

---

### 5.3 Crear una tarea — Wizard de 4 pasos

#### Paso 1 — Objetivo

- **Nombre:** obligatorio, descriptivo. Ej: `Preparar Contacto Comercial`
- **Descripcion:** que hace esta tarea (opcional pero recomendado para plantillas reutilizables)
- **Resultado esperado:** que documento o output esperas obtener

> 💡 **Tip:** si vas a reutilizar la tarea para distintos casos, hazla generica en el nombre
> y pon en el contexto manual del primer paso los datos especificos de cada ejecucion.

#### Paso 2 — CatBrains

Selecciona que CatBrains pueden usar los agentes para consultar el RAG. Solo aparecen
los CatBrains con RAG activo e indexado (muestra el numero de vectores).

- Selecciona el CatBrain cuyo RAG es relevante para la tarea
- Puedes seleccionar varios si la tarea necesita consultar multiples bases de conocimiento
- Los agentes con "Usar RAG" activado consultaran automaticamente estos CatBrains

#### Paso 3 — Pipeline

El nucleo de la tarea. Construyes el pipeline arrastrando pasos.

**Tipos de paso:**

| Tipo | Icono | Cuando usarlo |
|------|-------|---------------|
| Agente | 🤖 | Cualquier tarea de analisis, redaccion o procesamiento |
| Checkpoint | 🛡️ | Cuando quieres revisar el output antes de continuar |
| Sintesis | 🔀 | Al final, para unificar todos los outputs en un documento |

**Configuracion de un paso Agente:**

- **Agente:** selecciona el CatPaw que ejecutara este paso
- **Modelo (override):** dropdown con todos los modelos disponibles del sistema. Deja en "Usa el del agente" para usar el modelo configurado en el CatPaw, o selecciona uno diferente para este paso en concreto. Si la API de modelos no responde, aparece un input de texto como fallback
- **Instrucciones:** que debe hacer este agente en este paso especifico. Se concreto — estas instrucciones se suman al system prompt del CatPaw
- **Contexto:** como recibe informacion de pasos anteriores:

| Modo | Cuando usarlo |
|------|--------------|
| Paso anterior | El agente recibe solo el output del paso inmediatamente anterior. Mas enfocado |
| Todo el pipeline | El agente recibe todos los outputs acumulados. Usar en el paso final o en Sintesis |
| Manual | Tu pegas el contexto directamente. Util para el primer paso con datos del caso |

- **Usar RAG:** activalo si este paso necesita consultar el conocimiento del CatBrain vinculado
- **Skills:** selecciona skills relevantes para este paso (ej: Redaccion ejecutiva para pasos de redaccion)

**Configuracion de un Checkpoint:**

Solo tiene campo de nombre. Cuando la tarea llega aqui, se pausa y te muestra el
output del paso anterior en un panel scrollable (max 400px de alto) para que lo revises. Puedes:

- **Aprobar y continuar:** el pipeline sigue al siguiente paso
- **Rechazar con feedback:** escribes que quieres cambiar (campo de 4 lineas, redimensionable) y el paso anterior se re-ejecuta con tu feedback incorporado

> 💡 **Tip sobre el feedback en Checkpoint:** se especifico. En vez de
> "cambialo", escribe "el mensaje es demasiado formal, hazlo mas cercano y menciona
> explicitamente la estimulacion cognitiva en la apertura".

**Configuracion de Sintesis:**

Solo tiene campo de nombre. Concatena automaticamente todos los outputs de los pasos
anteriores y genera un documento unificado. No necesita mas configuracion — funciona solo.

**Orden de los pasos:** puedes reordenarlos arrastrando el icono de los 6 puntos (⋮⋮)
a la izquierda de cada paso. Maximo 10 pasos por tarea.

#### Paso 4 — Revisar

Resumen completo antes de lanzar. Revisa que:
- El nombre y descripcion son correctos
- Los CatBrains vinculados son los correctos
- El pipeline tiene los pasos en el orden correcto

Dos opciones:
- **Guardar borrador:** guarda sin ejecutar. Puedes editarla y lanzarla despues
- **Lanzar tarea:** guarda y arranca inmediatamente

---

### 5.4 Monitoreo en tiempo real

Una vez lanzada, la tarea muestra el pipeline vertical con el estado de cada paso:

| Color del borde | Estado |
|-----------------|--------|
| Gris | Pendiente |
| Violeta pulsante | Ejecutando |
| Verde | Completado |
| Ambar | En checkpoint (esperando tu aprobacion) |
| Rojo | Fallido |

En la barra inferior sticky veras: progreso, tiempo transcurrido y tokens consumidos.

**Ver el output de un paso:** haz clic en el paso completado para expandirlo y
ver su output completo en markdown.

---

### 5.5 Al completar la tarea

El resultado final aparece renderizado en markdown. Tienes tres acciones:

- **Descargar .md:** descarga el documento completo como archivo Markdown
- **Copiar:** copia el texto al portapapeles (funciona en HTTP y HTTPS con fallback automatico). Si `result_output` es null, copia el output del ultimo paso completado
- **Re-ejecutar:** lanza la tarea de nuevo (util para otro lead con el mismo pipeline)

---

### 5.6 Listado de tareas

- Cada tarea se muestra como una card con nombre, progreso, agentes asignados y estado
- **Filtros**: Todas, En curso, Completadas, Borradores
- **Eliminar tarea**: al pasar el cursor sobre una card aparece un icono 🗑️ en la esquina superior derecha. Pide confirmacion antes de eliminar

---

### 5.7 Plantillas disponibles

| Plantilla | Pasos | Caso de uso |
|-----------|-------|-------------|
| Documentacion tecnica completa | 4 | Analiza fuentes → revision humana → genera PRD → define arquitectura |
| Investigacion y resumen | 3 | Investiga el tema → genera resumen ejecutivo → revision |
| Propuesta comercial | 3 | Analiza requisitos → revision humana → genera propuesta |

Para crear tu propia plantilla reutilizable, crea una tarea con el pipeline deseado,
guardala como borrador y usala de referencia clonandola manualmente.

---

### 5.8 Tips y aprendizajes de produccion

> 💡 **El primer paso con contexto Manual es el input del pipeline.** Pega aqui los datos
> especificos de cada ejecucion (perfil del lead, tema a investigar, etc.). Los siguientes
> pasos en modo "Paso anterior" reciben automaticamente este contenido procesado.

> 💡 **Las instrucciones del paso se suman al system prompt del CatPaw.** Si el CatPaw ya
> tiene instrucciones detalladas en su system prompt, las instrucciones del paso anaden
> contexto especifico para esta ejecucion. No se sobreescriben, se acumulan.

> 💡 **El mismo CatPaw puede usarse en varios pasos.** En el caso de Preparar Contacto
> Comercial, el mismo "Asesor Estrategico de Negocio" hace tres trabajos distintos
> porque las instrucciones de cada paso son completamente diferentes.

> 💡 **Usa "Todo el pipeline" en el ultimo paso antes de Sintesis.** Si el paso final
> necesita referenciar trabajo de varios pasos anteriores (no solo el inmediatamente
> anterior), selecciona "Todo el pipeline" como contexto.

> 💡 **El Checkpoint es el punto de control de calidad.** Usalo despues de pasos de
> redaccion donde el tono o el contenido es critico. No lo pongas despues de pasos
> de analisis estructurado donde el output es un JSON o datos — ahi el agente no
> necesita supervision.

> 💡 **La Sintesis no necesita agente.** Concatena automaticamente todo y produce
> un documento coherente. Solo ponle un nombre descriptivo del documento final
> que quieres obtener.

> 💡 **Re-ejecutar con otro lead:** modifica el contexto manual del paso 1 con el
> nuevo perfil y pulsa Re-ejecutar. El pipeline completo se repite con los nuevos datos

---

## 6. Skills ⚡

> 🚧 En construcción

---

## 7. CatBot — Asistente IA 🤖

> 🚧 En construcción

### 7.1 Capacidades básicas

### 7.2 Superpoderes sudo

### 7.3 Cómo activar y usar sudo

---

## 8. Dashboard y métricas 📊

> 🚧 En construcción

---

## 9. Configuración del sistema ⚙️

> 🚧 En construcción

### 9.1 API Keys de LLMs

### 9.2 Configuración de CatBot

### 9.3 Modelos de embedding

---

## 10. Estado del Sistema 🏥

> 🚧 En construcción

---

## 11. Testing 🧪

> 🚧 En construcción

---

## 12. Errores comunes y soluciones 🔧

> 🚧 En construcción — se irá completando con los problemas encontrados
