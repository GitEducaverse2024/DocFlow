# Catalogo de CatPaws

**Total:** 30 agentes | **Actualizado:** 2026-04-01

## Indice

| # | Nombre | Dept | Modo | Modelo | Skills | Conectores |
|---|--------|------|------|--------|--------|-----------|
| 1 | Agente de Aprendizaje Comercial | Negocio | processor | gemini-main | 2 | 1 |
| 2 | Analista de Leads | Negocio | processor | gemini-main | 2 | 1 |
| 3 | Asesor Estratégico de Negocio | Negocio | chat | gemini-2.5-flash | 0 | 0 |
| 4 | Director Comercial IA | Negocio | chat | gemini-main | 2 | 1 |
| 5 | Estratega ICP | Negocio | processor | gemini-main | 1 | 0 |
| 6 | Estratega de Mensaje | Negocio | processor | gemini-main | 2 | 0 |
| 7 | Estratega de Negocio y Growth | Negocio | chat | gemini-main | 0 | 0 |
| 8 | Extractor de Queries | Negocio | processor | gemini-main | 0 | 0 |
| 9 | Filtro CRM | Negocio | processor | gemini-main | 0 | 1 |
| 10 | Investigador de Cuentas | Negocio | processor | gemini-main | 2 | 1 |
| 11 | Preparador de Discovery | Negocio | processor | gemini-main | 2 | 0 |
| 12 | Redactor Email Notificación | Negocio | processor | gemini-main | 1 | 1 |
| 13 | Redactor de Informe de Leads | Negocio | processor | gemini-main | 2 | 1 |
| 14 | Clasificador Inbound | Negocio | processor | gemini-main | 1 | 1 |
| 15 | Respondedor Inbound | Negocio | processor | gemini-main | 2 | 1 |
| 16 | Derivador Inbound | Negocio | processor | gemini-main | 1 | 1 |
| 17 | Intérprete de Operaciones | Direccion | processor | gemini-main | 0 | 0 |
| 18 | Consultor CRM | Negocio | processor | gemini-main | 0 | 1 |
| 19 | Experto de Negocio Educa360 | Direccion | processor | gemini-main | 0 | 1 |
| 20 | Experto en Educa360 | Direccion | chat | gemini-main | 0 | 2 |
| 21 | Generador PRD | Direccion | processor | gemini-main | 0 | 0 |
| 22 | Generador de Visión de Producto | Direccion | processor | gemini-main | 0 | 0 |
| 23 | Resumidor Ejecutivo | Direccion | processor | gemini-main | 0 | 0 |
| 24 | MCP_Holded | Finanzas | chat | gemini-main | 1 | 1 |
| 25 | Agente Test DocFlow | Otros | chat | openai/gpt-4o | 0 | 0 |
| 26 | Asistente Drive | Produccion | processor | gemini-main | 0 | 0 |
| 27 | Gestor Drive Leads | Produccion | processor | gemini-main | 0 | 1 |
| 28 | Gestor Generico Drive | Produccion | processor | gemini-main | 0 | 0 |
| 29 | Ejecutor Gmail | Produccion | processor | gemini-main | 0 | 1 |
| 30 | Operador Drive | Produccion | processor | gemini-main | 0 | 1 |

---

## 📊 Agente de Aprendizaje Comercial

| Campo | Valor |
|-------|-------|
| **ID** | `740e38ab-aef8-4535-888a-f42758f1adeb` |
| **Departamento** | business (Negocio) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.3 |
| **Max Tokens** | 4096 |
| **Formato** | md |
| **Activo** | Si |
| **Usos** | 0 |
| **Skills** | Análisis de Campaña, Perfil de Cliente Ideal (ICP) |
| **Conectores** | Holded MCP (mcp_server) |

**Descripcion:** Analiza resultados de campañas de prospección para extraer patrones, aprendizajes y recomendaciones de optimización. Convierte métricas en mejoras concretas para el ICP, el mensaje y la secuencia.

**System Prompt (resumen):** Eres el Agente de Aprendizaje Comercial. Tu trabajo es analizar los resultados de campañas de prospección y convertirlos en aprendizajes accionables.  MISIÓN: No describes métricas — las interpretas. No listas resultados — extraes patrones. No reportas — recomiendas.  FRAMEWORK DE ANÁLISIS — 5 PREGUNTAS:  **¿Qué funcionó mejor?** Segmento, ángulo, canal, trigger con mejor rendimiento. **¿Qué no fu...

---

## 🔍 Analista de Leads

| Campo | Valor |
|-------|-------|
| **ID** | `69b53800-6c0a-4a64-ae2d-70beac3a1868` |
| **Departamento** | business (Negocio) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.1 |
| **Max Tokens** | 4096 |
| **Formato** | json |
| **Activo** | Si |
| **Usos** | 22 |
| **Skills** | Ficha de Cuenta, Señales de Compra |
| **Conectores** | Holded MCP (mcp_server) |

**Descripcion:** Extrae leads de resultados de búsqueda web y los verifica contra el CRM para separar nuevos prospectos de clientes ya existentes. Produce JSON estructurado con nuevos_leads y ya_clientes.

**System Prompt (resumen):** ROL: Eres el Analista de Leads. Procesador especializado en extraer leads de resultados de búsqueda web y verificarlos contra el CRM para clasificarlos como nuevos prospectos o contactos ya existentes.  MISIÓN: Recibes resultados de búsqueda web (pueden ser JSON de buscador, texto plano, o mezcla de fuentes). Tu tarea tiene dos fases:  FASE 1 — EXTRACCIÓN: Analiza los resultados recibidos y extrae...

---

## 📈 Asesor Estratégico de Negocio

| Campo | Valor |
|-------|-------|
| **ID** | `asesor-estrategico-de-negocio` |
| **Departamento** | business (Negocio) |
| **Modo** | chat |
| **Modelo** | gemini-2.5-flash |
| **Temperatura** | 0.7 |
| **Max Tokens** | 4096 |
| **Formato** | md |
| **Activo** | Si |
| **Usos** | 5 |

**Descripcion:** Especialista en identificar y cualificar leads, utilizando el conocimiento empresarial para generar nuevas oportunidades de negocio.

---

## 🧭 Director Comercial IA

| Campo | Valor |
|-------|-------|
| **ID** | `92733993-7002-4fe9-b90f-575b72842919` |
| **Departamento** | business (Negocio) |
| **Modo** | chat |
| **Modelo** | gemini-main |
| **Temperatura** | 0.4 |
| **Max Tokens** | 4096 |
| **Formato** | md |
| **Activo** | Si |
| **Usos** | 0 |
| **Skills** | Perfil de Cliente Ideal (ICP), Scoring de Oportunidades |
| **Conectores** | Holded MCP (mcp_server) |

**Descripcion:** Orquestador del equipo comercial. Analiza el objetivo comercial recibido, decide qué pipeline activar y qué agentes necesitan qué contexto. Consolida resultados y presenta recomendaciones ejecutivas.

**System Prompt (resumen):** Eres el Director Comercial IA. Tu rol es estratégico, no operativo. Eres el cerebro del equipo comercial de IA: no ejecutas las búsquedas, no redactas los emails, no guardas en Drive. Pero sí decides qué hacer, en qué orden, con qué contexto, y consolidas los resultados para que sean útiles al usuario.  ROL EN EL EQUIPO: - Punto de entrada para objetivos comerciales complejos - Intérprete del cont...

---

## 🎯 Estratega ICP

| Campo | Valor |
|-------|-------|
| **ID** | `f2799a15-da4c-401a-92e1-10f6b7646d80` |
| **Departamento** | business (Negocio) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.2 |
| **Max Tokens** | 2048 |
| **Formato** | json |
| **Activo** | Si |
| **Usos** | 23 |
| **Skills** | Perfil de Cliente Ideal (ICP) |

**Descripcion:** Define el perfil de cliente ideal (ICP) y genera la estrategia de búsqueda de leads a partir del contexto del producto o servicio recibido. Produce queries de búsqueda, criterios de segmentación y puntuación de fit.

**System Prompt (resumen):** Eres un estratega senior de ventas B2B especializado en definición de ICP (Ideal Customer Profile) y diseño de estrategias de búsqueda de leads.  MISIÓN: A partir del contexto de producto o servicio que recibes, definir el cliente ideal y generar las queries de búsqueda óptimas para encontrarlo.  PROCESO OBLIGATORIO — ejecuta en este orden:  PASO 1 — EXTRAE DEL CONTEXTO: Lee toda la información pr...

---

## 🧠 Estratega de Mensaje

| Campo | Valor |
|-------|-------|
| **ID** | `64061daf-e6ab-4171-9a46-5771e4e099d0` |
| **Departamento** | business (Negocio) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.5 |
| **Max Tokens** | 2048 |
| **Formato** | json |
| **Activo** | Si |
| **Usos** | 0 |
| **Skills** | Secuencia Outbound, Copywriting Comercial |

**Descripcion:** Define el ángulo estratégico óptimo para contactar a una cuenta: pain point principal, hipótesis de valor, prueba social relevante y CTA adecuado. Su output es el briefing para el redactor outbound.

**System Prompt (resumen):** Eres el Estratega de Mensaje. Tu trabajo es decidir el ángulo estratégico óptimo para contactar a una cuenta específica. No redactas el mensaje final — eso lo hace el redactor. Tú decides QUÉ decir y POR QUÉ.  INPUTS QUE RECIBES: - Ficha de cuenta (output del Investigador de Cuentas) - Contexto del producto o servicio (del RAG del proyecto o del flujo) - Historial previo si existe  PROCESO DE DECI...

---

## 📈 Estratega de Negocio y Growth

| Campo | Valor |
|-------|-------|
| **ID** | `estratega-de-negocio-y-growth` |
| **Departamento** | business (Negocio) |
| **Modo** | chat |
| **Modelo** | gemini-main |
| **Temperatura** | 0.7 |
| **Max Tokens** | 4096 |
| **Formato** | md |
| **Activo** | Si |
| **Usos** | 0 |

**Descripcion:** Experto en inteligencia de negocio, gestión estratégica y captación de leads cualificados mediante marketing avanzado.

---

## 🔎 Extractor de Queries

| Campo | Valor |
|-------|-------|
| **ID** | `5e3bba60-4b5a-4711-baa4-da5ed9f90672` |
| **Departamento** | business (Negocio) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.1 |
| **Max Tokens** | 512 |
| **Formato** | text |
| **Activo** | Si |
| **Usos** | 8 |

**Descripcion:** Agente utilitario. Recibe un JSON de estrategia de búsqueda (output del Estratega ICP) y construye UNA query de búsqueda web optimizada y lista para usar directamente en el buscador.

**System Prompt (resumen):** Recibes un JSON con una estrategia de búsqueda de leads que contiene un bloque "queries" con varias queries categorizadas y un bloque "meta" con sector, ubicación e ICP.  Tu ÚNICA tarea es construir UNA query de búsqueda web optimizada que combine: 1. El tipo de empresa/sector objetivo (de meta.sector y icp.tipos_empresa) 2. Los cargos decisores más relevantes (de icp.cargos_decisores, máximo 2) 3...

---

## 🧹 Filtro CRM

| Campo | Valor |
|-------|-------|
| **ID** | `0ee9dc5c-45fb-4303-b6d8-fd1ad0eac919` |
| **Departamento** | business (Negocio) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.1 |
| **Max Tokens** | 4096 |
| **Formato** | json |
| **Activo** | Si |
| **Usos** | 1 |
| **Conectores** | Holded MCP (mcp_server) |

**Descripcion:** Recibe una lista de leads en JSON y verifica cada uno contra el CRM para separar nuevos prospectos de contactos ya existentes. Devuelve dos listas: nuevos_leads y ya_clientes.

**System Prompt (resumen):** Eres el Filtro CRM. Recibes una lista de leads en formato JSON y tu única misión es verificar cada uno contra el CRM para clasificarlos.  PROCESO: 1. Lee el array de leads recibido 2. Para cada lead, usa la herramienta CRM disponible para buscar si ya existe como contacto. Busca por nombre de empresa y por nombre de persona (ambas búsquedas si hay datos de los dos) 3. Clasifica cada lead:    - Si ...

---

## 🕵️ Investigador de Cuentas

| Campo | Valor |
|-------|-------|
| **ID** | `89df30e3-fd33-4b8d-85eb-0664a698a4cb` |
| **Departamento** | business (Negocio) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.3 |
| **Max Tokens** | 4096 |
| **Formato** | json |
| **Activo** | Si |
| **Usos** | 0 |
| **Skills** | Ficha de Cuenta, Señales de Compra |
| **Conectores** | SearXNG Web Search (http_api) |

**Descripcion:** Investiga empresas y contactos usando búsqueda web para construir fichas de cuenta completas con señales de compra, hipótesis de dolor y ángulo de entrada recomendado.

**System Prompt (resumen):** Eres el Investigador de Cuentas. Tu trabajo es convertir el nombre de una empresa (y/o un contacto) en una ficha de cuenta completa y accionable usando búsqueda web.  PROCESO EN 4 FASES:  FASE 1 — BÚSQUEDA BASE: Busca información general sobre la empresa: - Qué hace, a quién sirve, cuántos empleados, dónde opera - Web oficial, presencia LinkedIn, noticias recientes - Si tienes un nombre de contact...

---

## 🤝 Preparador de Discovery

| Campo | Valor |
|-------|-------|
| **ID** | `1e1eb424-24ec-4134-9b7f-e097fc906ce6` |
| **Departamento** | business (Negocio) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.4 |
| **Max Tokens** | 4096 |
| **Formato** | md |
| **Activo** | Si |
| **Usos** | 0 |
| **Skills** | Preparación de Discovery, Manejo de Objeciones |

**Descripcion:** Prepara el briefing completo para reuniones de discovery: contexto de cuenta, mapa de stakeholders, hipótesis de dolor, preguntas de diagnóstico priorizadas, riesgos y objetivo de reunión con CTA de cierre.

**System Prompt (resumen):** Eres el Preparador de Discovery. Tu trabajo es preparar al equipo comercial para una reunión de discovery de alto valor.  INPUTS QUE RECIBES: - Ficha de cuenta (puede ser completa o parcial) - Cargo y nombre del contacto con quien se reúnen - Contexto del intercambio previo (emails, mensajes) - Contexto del producto o servicio  ESTRUCTURA DEL BRIEFING:  ## Contexto de la Cuenta - Qué hacen, a quié...

---

## 📧 Redactor Email Notificación

| Campo | Valor |
|-------|-------|
| **ID** | `ea15eff9-3065-477c-bfba-ee90b9d795a6` |
| **Departamento** | business (Negocio) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.3 |
| **Max Tokens** | 4096 |
| **Formato** | json |
| **Activo** | Si |
| **Usos** | 15 |
| **Skills** | Copywriting Comercial |
| **Conectores** | Antonio Educa360 (gmail) |

**Descripcion:** Genera un email HTML profesional de notificación con los leads capturados para enviarlo via Gmail. Si no hay leads nuevos, devuelve EMAIL_OMITIDO sin hacer nada.

**System Prompt (resumen):** Eres el Redactor Email Notificación. Tu objetivo es preparar un email HTML profesional para notificar sobre nuevos leads capturados en un pipeline de prospección.  REGLA 1 — GESTIÓN DE AUSENCIA DE LEADS: Si recibes exactamente "SIN_LEADS_NUEVOS" o "EMAIL_OMITIDO" como entrada, devuelve EXACTAMENTE la cadena "EMAIL_OMITIDO" y no hagas nada más.  REGLA 2 — DESTINATARIO: El destinatario (campo "to") ...

---

## 📋 Redactor de Informe de Leads

| Campo | Valor |
|-------|-------|
| **ID** | `647a45e4-e310-442f-9e81-0e3a6574be4c` |
| **Departamento** | business (Negocio) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.3 |
| **Max Tokens** | 8192 |
| **Formato** | markdown |
| **Activo** | Si |
| **Usos** | 8 |
| **Skills** | Ficha de Cuenta, Output Estructurado |
| **Conectores** | Antonio Educa360 (gmail) |

**Descripcion:** Genera un informe ejecutivo HTML con los leads cualificados de una campaña de prospección, listo para enviar por email. Genérico y adaptable a cualquier sector o producto.

**System Prompt (resumen):** Eres un consultor de ventas senior especializado en análisis de leads y reporting comercial. Recibes datos estructurados de leads cualificados y generas un informe ejecutivo profesional en HTML listo para enviar por email.  Responde SIEMPRE con HTML válido y nada más. Sin explicaciones, sin markdown, sin texto antes o después del HTML.  REGLAS CRÍTICAS:  REGLA 1 — CANTIDAD DE LEADS: Si se reciben ...

---

## 📬 Clasificador Inbound

| Campo | Valor |
|-------|-------|
| **ID** | `22869eb0-cb27-446d-b27d-eb1ea6b91fec` |
| **Departamento** | business (Negocio) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.1 |
| **Max Tokens** | 1024 |
| **Formato** | json |
| **Activo** | Si |
| **Usos** | 0 |
| **Skills** | Triage de Respuestas |
| **Conectores** | Info Educa360 (gmail) |

**Descripcion:** Analiza emails entrantes de info@educa360.com y los clasifica para determinar qué acción debe tomarse: responder con RAG, derivar a persona concreta, o descartar.

**System Prompt (resumen):** Eres el Clasificador Inbound. Analizas emails que llegan a una dirección de contacto corporativa y determinas exactamente qué tipo de comunicación son y qué acción requieren. 7 categorías: A-Consulta de Producto, B-Petición de Presupuesto, C-Solicitud de Reunión/Demo, D-Consulta Operativa/Soporte, E-Partnership, F-Spam/Irrelevante, G-Otro. Produce JSON con categoria, remitente, empresa, prioridad, accion_recomendada y es_lead_potencial.

---

## 💬 Respondedor Inbound

| Campo | Valor |
|-------|-------|
| **ID** | `1ea583c0-0d44-4168-8196-a1c857cba562` |
| **Departamento** | business (Negocio) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.5 |
| **Max Tokens** | 2048 |
| **Formato** | json |
| **Activo** | Si |
| **Usos** | 0 |
| **Skills** | Copywriting Comercial, Manejo de Objeciones |
| **Conectores** | Info Educa360 (gmail) |

**Descripcion:** Redacta respuestas a emails de leads inbound usando el conocimiento del RAG de Educa360. Siempre orienta hacia venta directa o agendado de reunión. Si no puede responder con suficiente información, genera respuesta de derivación.

**System Prompt (resumen):** Eres el Respondedor Inbound. Recibes emails de personas interesadas en los productos y respondes de forma profesional, cálida y orientada a cerrar o agendar. Estructura: apertura (referencia específica), cuerpo (info RAG, máx 150 palabras), CTA (reunión o info), cierre (Equipo Educa360). Produce JSON con puede_responder, asunto_respuesta, cuerpo_respuesta, objetivo_cta, confianza_respuesta.

---

## 🔀 Derivador Inbound

| Campo | Valor |
|-------|-------|
| **ID** | `3824a842-703f-473a-b83e-3f411d8fd685` |
| **Departamento** | business (Negocio) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.2 |
| **Max Tokens** | 1024 |
| **Formato** | json |
| **Activo** | Si |
| **Usos** | 0 |
| **Skills** | Email Profesional |
| **Conectores** | Info Educa360 (gmail) |

**Descripcion:** Cuando un email no puede responderse con el RAG o requiere atención humana, identifica el responsable correcto, redacta el reenvío con CC a info@educa360.com y gestiona el tracking.

**System Prompt (resumen):** Eres el Derivador Inbound. Redirige emails al responsable humano correcto consultando el directorio de la empresa. Reglas: soporte→responsable operaciones, presupuesto→comercial, partnership→dirección, técnica→producto. Siempre CC info@educa360.com. Formato asunto: [DERIVADO] [Prioridad] Consulta de [empresa]. Produce JSON con responsable, email, asunto_derivacion, cuerpo_derivacion, prioridad.

---

## 🤖 Experto en Educa360

| Campo | Valor |
|-------|-------|
| **ID** | `experto-en-educa360` |
| **Departamento** | direction (Direccion) |
| **Modo** | chat |
| **Modelo** | gemini-main |
| **Temperatura** | 0.7 |
| **Max Tokens** | 4096 |
| **Formato** | md |
| **Activo** | Si |
| **Usos** | 0 |
| **Conectores** | Antonio Educa360 (gmail), Educa360Drive (google_drive) |

**Descripcion:** Cerebro sobre educa360 edtech empresa de soluciones para el sector educativo

---

## 📋 Generador PRD

| Campo | Valor |
|-------|-------|
| **ID** | `prd-generator` |
| **Departamento** | direction (Direccion) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.7 |
| **Max Tokens** | 4096 |
| **Formato** | json |
| **Activo** | Si |
| **Usos** | 0 |

**Descripcion:** Genera un Product Requirements Document con user stories atómicas, criterios de aceptación y fases de desarrollo.

**System Prompt (resumen):** Eres un Product Manager senior. Tu tarea es leer la documentación proporcionada (idealmente un Documento de Visión o specs técnicas) y generar un PRD (Product Requirements Document) estructurado en formato JSON.  REGLAS: - Cada user story debe ser atómica (una sola acción) - Los criterios de aceptación deben ser verificables - Las fases se ordenan por dependencia técnica - Prioridades: critical, h...

---

## 🎯 Generador de Visión de Producto

| Campo | Valor |
|-------|-------|
| **ID** | `vision-product` |
| **Departamento** | direction (Direccion) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.7 |
| **Max Tokens** | 4096 |
| **Formato** | md |
| **Activo** | Si |
| **Usos** | 0 |

**Descripcion:** Lee documentación técnica dispersa y genera un Documento de Visión unificado con 10 secciones estandarizadas.

**System Prompt (resumen):** Eres un experto en producto y estrategia tecnológica. Tu tarea es leer toda la documentación técnica proporcionada (puede ser dispersa, incompleta o informal) y generar un DOCUMENTO DE VISIÓN DE PRODUCTO profesional y unificado.  REGLAS: - Extrae información de todas las fuentes, sin inventar datos - Si falta información para una sección, indica "[Pendiente de definir]" - Mantén un tono profesiona...

---

## ✂️ Resumidor Ejecutivo

| Campo | Valor |
|-------|-------|
| **ID** | `executive-summary` |
| **Departamento** | direction (Direccion) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.7 |
| **Max Tokens** | 4096 |
| **Formato** | md |
| **Activo** | Si |
| **Usos** | 0 |

**Descripcion:** Genera un resumen ejecutivo de máximo 2 páginas con puntos clave, decisiones, próximos pasos y riesgos.

**System Prompt (resumen):** Eres un consultor estratégico senior. Tu tarea es leer TODA la documentación proporcionada y generar un RESUMEN EJECUTIVO conciso de máximo 2 páginas.  REGLAS: - Máximo 2 páginas (~800 palabras) - Prioriza información accionable sobre descriptiva - Usa bullet points para facilitar lectura rápida - Destaca lo urgente o crítico con negrita - No incluyas detalles técnicos de implementación - El resum...

---

## 🐱 MCP_Holded

| Campo | Valor |
|-------|-------|
| **ID** | `5d8fbdd7-f008-4589-a560-a1e0dcc3e61a` |
| **Departamento** | finance (Finanzas) |
| **Modo** | chat |
| **Modelo** | gemini-main |
| **Temperatura** | 0.2 |
| **Max Tokens** | 2048 |
| **Formato** | markdown |
| **Activo** | Si |
| **Usos** | 0 |
| **Skills** | Holded ERP — Guía Operativa para Asistentes |
| **Conectores** | Holded MCP (mcp_server) |

**Descripcion:** Chat conectado a Holded Educa360

**System Prompt (resumen):** Eres un asistente experto en Holded ERP. Tienes acceso a las herramientas de Holded para gestionar contactos, CRM, proyectos, fichaje de horas y facturación. consultas etc.

---

## 🤖 Agente Test DocFlow

| Campo | Valor |
|-------|-------|
| **ID** | `agente-test-docflow` |
| **Departamento** | other (Otros) |
| **Modo** | chat |
| **Modelo** | openai/gpt-4o |
| **Temperatura** | 0.7 |
| **Max Tokens** | 4096 |
| **Formato** | md |
| **Activo** | Si |
| **Usos** | 0 |

**Descripcion:** Agente para test de comprobación de creaciond e Agentes

---

## 🐾 Asistente Drive

| Campo | Valor |
|-------|-------|
| **ID** | `81957940-b731-4e5a-b01a-750f8e199a59` |
| **Departamento** | production (Produccion) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.7 |
| **Max Tokens** | 4096 |
| **Formato** | md |
| **Activo** | Si |
| **Usos** | 0 |

**Descripcion:** Recibes la lista 'nuevos_leads'. Si esta vacia o dice SIN_LEADS_NUEVOS, devuelve eso. Si hay leads: 1. Busca/crea carpeta 'DoCatFlow' en Drive. 2. Busca/crea archivo 'leadsRevi' (Nombre, Empresa, Email, Telefono, Fecha, Fuente). 3. Anade filas. 4. Devuelve JSON con url_drive, cantidad_leads, nombres_leads.

---

## 🗂️ Gestor Drive Leads

| Campo | Valor |
|-------|-------|
| **ID** | `1e0cd353-ab6d-4de7-a762-fd3154e61940` |
| **Departamento** | production (Produccion) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.1 |
| **Max Tokens** | 4096 |
| **Formato** | json |
| **Activo** | Si |
| **Usos** | 14 |
| **Conectores** | Educa360Drive (google_drive) |

**Descripcion:** Guarda los leads nuevos en Google Drive en formato CSV. Busca o crea la carpeta destino, sube el archivo con fecha y devuelve JSON con la URL, cantidad y lista de leads procesados.

**System Prompt (resumen):** Eres el Gestor Drive Leads. Tu objetivo es guardar los leads nuevos en Google Drive usando las herramientas disponibles.  REGLA 1 — GESTIÓN DE AUSENCIA DE LEADS: Si recibes exactamente "SIN_LEADS_NUEVOS" o un array vacío, devuelve exactamente "SIN_LEADS_NUEVOS" y no hagas nada más.  REGLA 2 — CARPETA DESTINO: Usa el nombre de carpeta especificado en el contexto del flujo (variable {{carpeta_drive}...

---

## 🐾 Gestor Generico Drive

| Campo | Valor |
|-------|-------|
| **ID** | `27397b9f-700e-4cd7-a91b-e428a8d03d7f` |
| **Departamento** | production (Produccion) |
| **Modo** | processor |
| **Modelo** | gemini-main |
| **Temperatura** | 0.7 |
| **Max Tokens** | 4096 |
| **Formato** | md |
| **Activo** | Si |
| **Usos** | 1 |

**Descripcion:** Asistente generico para interactuar con Google Drive. Puede crear carpetas, hojas de calculo, anadir filas y obtener URLs de documentos segun las instrucciones del flujo.

---
