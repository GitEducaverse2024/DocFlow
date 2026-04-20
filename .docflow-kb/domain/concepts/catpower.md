---
id: concept-catpower
type: concept
subtype: catpower
lang: es
title: "CatPower — Skills, Conectores y Templates"
summary: "CatPower es el módulo paraguas en /catpower que agrupa Skills (instrucciones reutilizables), Conectores (integraciones: Gmail/Drive/Holded/MCP/SearXNG/n8n) y Templates (plantillas de email con editor visual drag-and-drop)."
tags: [skill, connector, template, gmail, holded, drive, mcp]
audience: [catbot, architect, developer, user]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from app/data/knowledge/catpower.json during Phase 151 (single-atom merge: JSON was small, merged concept + guide)" }
ttl: never
---

# CatPower

## Descripción

**CatPower** es el módulo paraguas que agrupa Skills, Conectores y Templates en
`/catpower`. Skills son instrucciones reutilizables para agentes. Conectores son
integraciones externas (n8n, HTTP APIs, MCP servers, Gmail, Google Drive). Templates
son plantillas de email con editor visual.

Este atom fusiona concepto + howto porque la fuente (`catpower.json`) era pequeña
(~5KB) y la división semántica no aportaba claridad adicional.

## Conceptos fundamentales

- **CatPower agrupa tres subsistemas**: Skills, Conectores y Templates.
- **Skills** son instrucciones reutilizables inyectadas en el system prompt de CatPaws. Categorías: `writing`, `analysis`, `strategy`, `technical`, `format`, `sales`, `system`.
- **Conectores** permiten integrar DoCatFlow con servicios externos: n8n webhooks, APIs HTTP, servidores MCP, Gmail, Google Drive, email templates.
- **Templates** son plantillas de email con editor visual drag-and-drop. 5 tipos de bloque: Logo, Imagen, Video (YouTube), Texto (markdown), Instrucción IA.
- **Gmail** soporta dos modos: App Password (IMAP/SMTP) y OAuth2. OAuth2 soporta drafts y filtros avanzados adicionales.
- **Herramientas Gmail disponibles (9)**: `list_email_connectors`, `send_email`, `gmail_list_emails`, `gmail_search_emails`, `gmail_read_email`, `gmail_get_thread`, `gmail_draft_email`, `gmail_send_email`, `gmail_mark_as_read`, `gmail_reply_to_message`.
- **Holded MCP** integra el ERP: contactos, facturas, CRM leads, proyectos, fichaje. Servicio en puerto 8766.
- **LinkedIn MCP** permite consultar perfiles, empresas y ofertas de empleo. Rate limiting 30/hora. Puerto 8765.
- **SearXNG** es metabuscador self-hosted sin API key en puerto 8080. Agrega Google, Brave, DuckDuckGo, Wikipedia.
- **Websearch** usa dos motores: SearXNG (local) y Gemini Search (cloud via LiteLLM grounding).
- **MCP** (Model Context Protocol) permite exponer RAGs como servidores consultables por otros agentes.
- **OpenClaw** es gateway de agentes IA. DoCatFlow registra agentes en OpenClaw para acceso vía chat y Telegram.
- **Formato JSON para importar/exportar skills**: `name` e `instructions` obligatorios, acepta objeto o array.

## Endpoints de la API

- `GET  /api/skills`
- `POST /api/skills`
- `GET  /api/connectors`
- `POST /api/connectors`
- `GET  /api/templates`
- `POST /api/templates`

## Tools de CatBot

- `list_skills`, `get_skill`
- `list_email_connectors`, `send_email`, `create_connector`
- `create_email_template`, `delete_email_template`, `get_email_template`, `list_email_templates`, `render_email_template`, `update_email_template`

## Cómo usar CatPower

- **Crear una skill**: ir a `/catpower/skills` > Nueva Skill. Definir ROL, PROTOCOLO, REGLAS, FORMATO, EJEMPLOS.
- **Importar skills JSON**: aceptar objeto o array. Solo `name` e `instructions` obligatorios.
- **Configurar conector Gmail**: `/catpower/connectors` > Nuevo > Gmail > elegir App Password u OAuth2.
- **Enviar email**: `list_email_connectors` para ver disponibles, `send_email` para enviar.
- **Usar Holded**: pedirle directamente a CatBot (busca contacto, crea factura, lista leads, ficha entrada/salida).
- **Plantillas email**: `/catpower/templates` > editor visual con 3 secciones (header, body, footer), filas de 1–2 columnas.
- **Reglas Gmail para Canvas Inbound**: buscar por fecha (`after:`), usar `get_thread` con `checkReplyFrom`, `mark_as_read` tras responder, filtrar 7 días max.

## Anti-patterns (no hacer)

- No pedir API Key de Holded al usuario — ya está en el servidor MCP.
- No crear skills sin definir ROL, PROTOCOLO, REGLAS y FORMATO.
- No usar el endpoint `/mcp` directamente para health check — siempre usar `GET /health` del servidor MCP.
- No hacer scraping masivo con LinkedIn MCP — solo uso personal.
- No usar `localhost` o nombre Docker en URL de servicio — usar IP física del servidor.

## Errores comunes

### `spawn pdftotext ENOENT`

- **Causa**: poppler no instalado en contenedor.
- **Solución**: verificar que el Dockerfile incluye `poppler-utils`.

### `MCP StreamableHTTPServerTransport Accept header missing`

- **Causa**: health check usando endpoint `/mcp` en vez de `/health`.
- **Solución**: añadir `GET /health` al servidor MCP y apuntar health check ahí.

## Casos de éxito

- CatBot genera JSON de skill profesional con ROL, PROTOCOLO, REGLAS y FORMATO a partir de descripción del usuario.
- Pipeline de email: Agent lista emails → Iterator procesa cada uno → Responde → `mark_as_read`.
- CatBot consulta Holded MCP para buscar contacto y crear factura sin pedir credenciales.

## Referencias

- `.planning/milestones/v24.0-catpower-templates.md`
- `.planning/research/FEATURES.md`
- Recursos DB: `../../resources/skills/`, `../../resources/connectors/`, `../../resources/email-templates/`.
- Fuente original: `app/data/knowledge/catpower.json` (migración Phase 151).
