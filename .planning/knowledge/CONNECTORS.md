# Catalogo de Conectores

**Total:** 10 conectores | **Actualizado:** 2026-04-01

## Reglas criticas para Canvas

**IMPORTANTE para CatBot y creacion de Canvas:**
1. Un nodo Agent del canvas NECESITA un CatPaw con conector vinculado para usar herramientas (Gmail, Drive, Holded). Sin CatPaw, el nodo solo hace llamada LLM directa sin tools.
2. Para operaciones Gmail en canvas: usar CatPaw **Ejecutor Gmail** (id: `65e3a722-9e43-43fc-ab8a-e68261c6d3da`)
3. Para operaciones Drive en canvas: usar CatPaw **Operador Drive** (id: `e05f112e-f245-4a3b-b42b-bb830dd1ac27`)
4. Para consultas Holded en canvas: usar CatPaw **Consultor CRM** (id: `b63164ed-83ae-40d0-950e-3a62826bc76f`)
5. El nodo Connector (tipo connector) solo ENVIA como side-effect — no lee datos. Para LEER, usar nodo Agent con CatPaw.
6. El nodo Storage solo ESCRIBE — para leer archivos previos, usar Agent con Operador Drive.

## Indice

| # | Nombre | Tipo | Estado |
|---|--------|------|--------|
| 1 | Info Educa360 | gmail | Activo |
| 2 | Antonio Educa360 | gmail | Activo |
| 3 | Antonio Sierra Sánchez | gmail | Activo |
| 4 | Educa360Drive | google_drive | Activo |
| 5 | Gemini Web Search | http_api | Activo |
| 6 | Holded MCP | mcp_server | Activo |
| 7 | LinkedIn Intelligence | mcp_server | Activo |
| 8 | SearXNG Web Search | http_api | Activo |
| 9 | Test n8n | n8n_webhook | Activo |
| 10 | Plantillas Email Corporativas | email_template | Activo |

---

## Info Educa360

| Campo | Valor |
|-------|-------|
| **ID** | `67d945f0-5a73-4f40-b7d5-b16a15c05467` |
| **Tipo** | gmail |
| **Estado** | Activo |
| **Cuenta** | info@educa360.com |

**Tipo de conector:** Gmail — envio y lectura de emails via App Password (SMTP-relay Workspace)

**Herramientas disponibles (8):**
- `gmail_list_emails` — listar emails recientes (INBOX o sent)
- `gmail_search_emails` — buscar con operadores Gmail (is:unread, from:, after:, etc.)
- `gmail_read_email` — leer contenido completo de un email por ID
- `gmail_draft_email` — crear borrador (no envia)
- `gmail_send_email` — enviar email con soporte HTML y CC
- `gmail_mark_as_read` — marcar email como leido (IMAP o Gmail API)
- `gmail_reply_to_message` — responder en el mismo hilo con headers In-Reply-To/References (SMTP o Gmail API)

---

## Antonio Educa360

| Campo | Valor |
|-------|-------|
| **ID** | `43cbe742-d8ed-4788-a5df-0f6f874220a8` |
| **Tipo** | gmail |
| **Estado** | Activo |

**Tipo de conector:** Gmail — envio y lectura de emails via OAuth2

**Subtipo Gmail:** gmail_workspace

---

## Antonio Sierra Sánchez

| Campo | Valor |
|-------|-------|
| **ID** | `ac75321f-892a-4d86-8863-6e3ed44d04c4` |
| **Tipo** | gmail |
| **Estado** | Activo |

**Tipo de conector:** Gmail — envio y lectura de emails via OAuth2

**Subtipo Gmail:** gmail_personal

---

## Educa360Drive

| Campo | Valor |
|-------|-------|
| **ID** | `9aee88bd-545b-4caa-b514-2ceb7441587d` |
| **Tipo** | google_drive |
| **Estado** | Activo |

**Tipo de conector:** Google Drive — acceso a archivos, carpetas, subida y descarga

---

## Gemini Web Search

| Campo | Valor |
|-------|-------|
| **ID** | `seed-gemini-search` |
| **Tipo** | http_api |
| **Estado** | Activo |
| **Descripcion** | Busqueda web via Gemini grounding (Google). Requiere modelo gemini-search en LiteLLM. |

**Tipo de conector:** API HTTP — llamadas a APIs externas (busqueda web, webhooks)

---

## Holded MCP

| Campo | Valor |
|-------|-------|
| **ID** | `seed-holded-mcp` |
| **Tipo** | mcp_server |
| **Estado** | Activo |
| **Descripcion** | Conector MCP para Holded ERP. Modulos: Facturacion (contactos, documentos, productos, servicios), CRM (leads, funnels, eventos), Proyectos (tareas, registros horarios), Equipo (empleados, fichaje). 72+ herramientas disponibles via MCP JSON-RPC. |

**Tipo de conector:** Servidor MCP (Model Context Protocol) — acceso a herramientas externas via protocolo estandar

**Herramientas expuestas a CatBot/CatPaws (16):**
- `holded_search_contact` — buscar contactos (fuzzy por nombre/email/NIF)
- `holded_contact_context` — contexto completo (datos + facturas + balance)
- `holded_quick_invoice` — crear factura rapida
- `holded_list_invoices` — listar facturas de un contacto
- `holded_list_leads` — listar leads del CRM
- `holded_create_lead` — crear lead en el CRM
- `holded_update_lead` — actualizar etapa/estado de un lead
- `holded_search_lead` — buscar leads por nombre
- `holded_create_lead_note` — añadir nota a un lead
- `holded_list_projects` — listar proyectos
- `holded_list_funnels` — listar pipelines con stages
- `holded_clock_in` / `holded_clock_out` — fichaje
- `create_contact` — crear contacto nuevo (lead/cliente)
- `update_contact` — actualizar contacto existente
- `list_contacts` — listar contactos con paginacion (para cache deduplicacion)

---

## LinkedIn Intelligence

| Campo | Valor |
|-------|-------|
| **ID** | `seed-linkedin-mcp` |
| **Tipo** | mcp_server |
| **Estado** | Activo |
| **Descripcion** | Conector MCP para consulta de perfiles, empresas y empleos de LinkedIn. Rate limiting integrado para proteccion de cuenta. |

**Tipo de conector:** Servidor MCP (Model Context Protocol) — acceso a herramientas externas via protocolo estandar

---

## SearXNG Web Search

| Campo | Valor |
|-------|-------|
| **ID** | `seed-searxng` |
| **Tipo** | http_api |
| **Estado** | Activo |
| **Descripcion** | Busqueda web local via SearXNG. Agrega 246 motores. 100% local, sin API key. |

**Tipo de conector:** API HTTP — llamadas a APIs externas (busqueda web, webhooks)

---

## Test n8n

| Campo | Valor |
|-------|-------|
| **ID** | `e7d15f13-dffc-4f87-932f-00ff6a87df9b` |
| **Tipo** | n8n_webhook |
| **Estado** | Activo |
| **Descripcion** | test n8n |

**Tipo de conector:** n8n Webhook — integracion con flujos de automatizacion n8n

---

## Plantillas Email Corporativas

| Campo | Valor |
|-------|-------|
| **ID** | `seed-email-template` |
| **Tipo** | email_template |
| **Estado** | Activo |
| **Descripcion** | Conector para acceder a las plantillas de email de DoCatFlow. Permite listar, consultar y renderizar templates HTML corporativos. |

**Tipo de conector:** Email Template — acceso al modulo de plantillas de email con editor visual

**Herramientas disponibles (3):**
- `list_email_templates` — lista templates activos con filtro opcional por categoria (corporate, report, commercial, notification, general)
- `get_email_template` — obtiene la estructura completa de un template con bloques (header, body, footer) y estilos
- `render_email_template` — genera el HTML final del email sustituyendo bloques de instruccion LLM por contenido real y aplicando estilos corporativos

---
