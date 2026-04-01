# Guia de Usuario DoCatFlow

**Version:** v24.0 | **Actualizado:** 2026-04-01

---

## Que es DoCatFlow

DoCatFlow es una plataforma de procesamiento de documentos y gestion de conocimiento con IA. Convierte documentos dispersos en una base de conocimiento estructurada y consultable via chat con lenguaje natural.

---

## Modulos Principales

### 1. CatBrains (Base de Conocimiento)
**Ruta:** /catbrains

Un CatBrain es un proyecto de conocimiento que ingesta fuentes (PDFs, URLs, YouTube, notas), las procesa con LLM y las indexa en una base vectorial (Qdrant) para busqueda semantica.

**Pipeline de fuentes (3 pasos):**
1. **Fuentes** — Subir archivos (PDF, DOCX, PPTX, XLSX, TXT, MD, CSV, imagenes, codigo), URLs, videos YouTube, o notas de texto
2. **Procesar** — Cada fuente se procesa: "Procesar IA" (LLM genera resumen), "Contexto directo" (texto tal cual), o "Excluir"
3. **Indexar RAG** — Chunking + embeddings via Ollama + indexacion en Qdrant

**Funciones del CatBrain:**
- Chat RAG con busqueda semantica sobre las fuentes indexadas
- MCP Bridge para conectar agentes externos (OpenClaw, n8n, curl)
- System prompt configurable que se inyecta en todas las consultas
- Modelo y personalidad configurables

### 2. CatPaw (Agentes)
**Ruta:** /agents

Un CatPaw es un agente unificado que puede ser de tipo chat (conversacional), processor (procesa documentos) o hybrid (ambos).

**Configuracion de un CatPaw:**
- **Nombre, emoji, color** — identidad visual
- **Departamento** — clasificacion por area: Direccion, Negocio, Marketing, Finanzas, Produccion, Logistica, RRHH, Personal, Otros
- **Modo** — chat / processor / hybrid
- **Modelo** — LLM a usar (default: gemini-main)
- **Temperatura** — 0.1 (preciso) a 2.0 (creativo)
- **System prompt** — instrucciones del agente
- **Skills** — habilidades reutilizables que se inyectan en el prompt
- **Conectores** — acceso a servicios externos (Gmail, Drive, Holded, SearXNG, LinkedIn)
- **CatBrains** — bases de conocimiento RAG vinculadas
- **Agentes** — relaciones con otros CatPaws (colaborador, delegado, supervisor)

**Pagina /agents:**
La pagina muestra un directorio expandible por departamento:
- **Empresa** (violet): Direccion, Negocio, Marketing, Finanzas, Produccion, Logistica, RRHH
- **Personal** (sky): agentes personales
- **Otros** (zinc): agentes de test o sin clasificar

Cada tarjeta muestra: emoji, nombre, modo, modelo, badge de departamento, skills vinculadas, conectores.

### 3. Skills
**Ruta:** /skills

Una Skill es un paquete de instrucciones reutilizable que se inyecta en el system prompt de un CatPaw cuando se ejecuta. Modifica el comportamiento del agente sin cambiar su prompt base.

**Categorias:**
- **Escritura** (emerald): redaccion ejecutiva, propuestas, emails, briefings
- **Analisis** (blue): investigacion profunda, decision frameworks, competitivo
- **Estrategia** (violet): documentos de estrategia, roadmaps, OKRs, riesgos
- **Tecnico** (amber): revision de codigo, documentacion API, escritura tecnica
- **Formato** (cyan): diagramas Mermaid, Diataxis, voz de marca, output estructurado
- **Ventas** (rose): ICP, señales de compra, outbound, objeciones, discovery, scoring

**Pagina /skills:**
Directorio expandible por categoria con busqueda en tiempo real, highlight y pills de filtro.

### 4. CatFlow (Canvas/Tareas)
**Ruta:** /catflow

CatFlow combina tareas y canvas visuales:
- **Canvas** — Editor visual de flujos con nodos arrastrables (React Flow)
- **Nodos disponibles:** START, OUTPUT, AGENT, CATBRAIN, CONNECTOR, CHECKPOINT, SCHEDULER, STORAGE, MULTI_AGENT
- **Ejecucion:** DAG topologico, fire-and-forget, polling de estado
- **Tareas** — Pipelines multi-agente con ejecucion secuencial

### 5. Plantillas de Email (CatPower Templates)
**Ruta:** /catpower/templates

Editor visual de plantillas de email con bloques arrastrables. Permite crear, editar y previsualizar plantillas HTML corporativas que los agentes usan para generar emails profesionales.

**5 tipos de bloque:**
- **Logo** — imagen de logotipo con control de tamano y alineacion
- **Imagen** — imagen full-width o con dimensiones personalizadas
- **Video** — thumbnail con enlace a video
- **Texto** — contenido HTML/Markdown estatico (firma, CTA, parrafos)
- **Instruccion LLM** — bloque especial que el agente rellena con contenido real al generar el email

**Categorias:** General, Corporativa, Comercial, Informe, Notificacion

**5 plantillas incluidas de serie:**
1. **Basica** (general) — instruccion de cuerpo + pie de firma
2. **Corporativa Educa360** (corporate) — logo + banner, cuerpo LLM, firma con logo
3. **Informe de Leads** (report) — cabecera violeta, tabla de datos LLM, pie DoCatFlow
4. **Respuesta Comercial** (commercial) — logo sutil, cuerpo LLM + CTA de reunion, pie profesional
5. **Notificacion Interna** (notification) — minimalista, solo cuerpo + pie automatico

**Integracion con agentes:** Los CatPaws en Canvas usan el skill "Maquetador de Email" para seleccionar y rellenar plantillas automaticamente segun el contexto (remitente, destinatario, tipo de comunicacion). Los bloques de Instruccion LLM se sustituyen por contenido real generado por el agente.

### 6. Conectores
**Ruta:** /connectors

Servicios externos accesibles por los agentes:
- **Gmail** — lectura, envio, reply en hilo, marcar como leido, CC, HTML. Herramientas: list_emails, search_emails, read_email, send_email, draft_email, mark_as_read, reply_to_message
- **Google Drive** — gestion de archivos (subir, descargar, listar, crear carpetas, buscar)
- **Holded MCP** — ERP/CRM (contactos, facturas, leads, funnels, proyectos, empleados, fichaje). 16 herramientas expuestas a CatBot incluyendo create_contact, update_lead, create_lead_note
- **LinkedIn MCP** — perfiles, empresas, empleos
- **SearXNG** — busqueda web sin tracking (metabuscador self-hosted)
- **Gemini Search** — busqueda web con Google grounding
- **n8n** — webhooks de automatizacion

### 7. Canvas Comerciales (Flujos automatizados)
**Ruta:** /canvas

4 canvas comerciales operativos para Educa360:
- **Revision Diaria Inbound** (10:00 L-V) — Lee emails de info@educa360.com, clasifica, responde con RAG o deriva al responsable
- **Prospeccion Outbound** (manual/trigger) — Busca leads, deduplica, investiga, genera informe HTML y envia a founders
- **Canal de Mando** (cada 30min) — Founders envian email con asunto //negocio:educa360, el sistema interpreta y ejecuta (consulta CRM, lanza canvas, responde)
- **Informe Diario 14:00** (14:00 L-V) — Combina pipeline Holded + actividad del dia + RAG Educa360, genera informe ejecutivo y envia a 4 founders

**Regla critica para CatBot al crear canvas:** Los nodos Agent que necesiten Gmail/Drive/Holded DEBEN tener un CatPaw con conector vinculado. Sin CatPaw no hay tools disponibles. Usar: Ejecutor Gmail, Operador Drive, o Consultor CRM.

### 8. CatBot (Asistente IA)
**Acceso:** Boton flotante en toda la app + Telegram (numero: 30 CatPaws, 40 skills, 9 conectores)

CatBot es el asistente central de DoCatFlow. Tiene acceso a TODAS las funciones de la plataforma via tools:
- Crear/listar/modificar CatPaws, CatBrains, tareas, conectores
- Ejecutar canvas y CatFlows
- Enviar emails
- Navegar a cualquier pagina
- Buscar en la documentacion del proyecto
- Leer historial de errores
- Gestionar canvas (crear nodos, edges, ejecutar)

**Skills siempre activas en CatBot:**
- **Orquestador CatFlow** — protocolo de creacion de flujos y canvas
- **Arquitecto de Agentes** — busca agentes existentes antes de crear, recomienda skills

**Sudo:** Para operaciones sensibles (bash, servicios, credenciales), CatBot requiere autorizacion sudo con clave scrypt.

**Telegram:** CatBot accesible desde Telegram con long polling, mismo sudo system, permisos configurables.

### 9. Configuracion
**Ruta:** /settings

- **API Keys** — configuracion de providers LLM (OpenAI, Anthropic, Google, LiteLLM, Ollama)
- **Procesamiento** — tokens maximos, truncamiento, metadata
- **Precios** — costes por modelo para tracking de uso
- **CatBot** — modelo, personalidad, acciones permitidas
- **Seguridad Sudo** — clave scrypt, duracion de sesion, acciones protegidas
- **Canales Externos** — Telegram bot (wizard 3 pasos, whitelist, permisos)

### 10. Estado del Sistema
**Ruta:** /system

Panel de salud de todos los servicios: OpenClaw, n8n, Qdrant, LiteLLM, LinkedIn MCP, Holded MCP, SearXNG, Telegram.
Cada servicio muestra: estado, latencia, URL.

---

## Equipo Comercial (CatPaws de Ventas)

DoCatFlow tiene un equipo comercial completo de 13 agentes:

| Agente | Funcion | Skills vinculadas |
|--------|---------|------------------|
| Director Comercial IA | Orquestador estrategico | ICP, Scoring |
| Estratega ICP | Define cliente ideal y queries | ICP |
| Investigador de Cuentas | Research web de cuentas | Ficha Cuenta, Señales |
| Analista de Leads | Extrae y verifica leads | Ficha Cuenta, Señales |
| Extractor de Queries | Construye query de busqueda | - |
| Filtro CRM | Verifica contra Holded | - |
| Estratega de Mensaje | Define angulo de contacto | Copywriting, Outbound |
| Preparador de Discovery | Briefing para reuniones | Discovery, Objeciones |
| Redactor Email | Email HTML con leads | Copywriting |
| Redactor Informe | Informe ejecutivo HTML | Ficha Cuenta, Output |
| Gestor Drive | Guarda leads en Drive CSV | - |
| Aprendizaje Comercial | Analiza resultados campanas | Analisis Campana, ICP |

---

## Arquitectura Tecnica

- **Framework:** Next.js 14 (App Router) + React 18 + Tailwind + shadcn/ui
- **Base de datos:** SQLite (better-sqlite3) con WAL mode
- **Vectores:** Qdrant (busqueda semantica RAG)
- **Embeddings:** Ollama (mxbai-embed-large, nomic-embed-text)
- **LLM Proxy:** LiteLLM (multi-provider: OpenAI, Anthropic, Google, Ollama)
- **Agentes:** OpenClaw (integracion opcional)
- **Docker:** node:20-slim base, standalone output
- **Host:** server-ia (192.168.1.49), Node 22

**Servicios y puertos:**
| Servicio | Puerto |
|----------|--------|
| DoCatFlow | 3500 |
| LiteLLM | 4000 |
| n8n | 5678 |
| Qdrant | 6333 |
| SearXNG | 8080 |
| Holded MCP | 8766 |
| LinkedIn MCP | 8767 |
| OpenClaw | 18789 |
| Ollama | 11434 |

---

## Convenciones Importantes

- **process.env:** Usar `process['env']['VARIABLE']` (bracket notation) para bypass webpack
- **API routes:** Exportar `dynamic = 'force-dynamic'` si leen env vars
- **file_path en sources:** Ruta absoluta completa (`/app/data/projects/...`)
- **Idiomas:** Español como primario, ingles como secundario (i18n con next-intl)
- **Config real:** `next.config.js` (NO .mjs) — CJS con next-intl plugin
- **instrumentationHook:** DEBE estar en `experimental: { instrumentationHook: true }`

---

*Documento de referencia para CatBot y usuarios de DoCatFlow.*
