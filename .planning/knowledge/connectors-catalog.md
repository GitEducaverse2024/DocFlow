# Catalogo de Conectores

**Total:** 11 conectores | **Actualizado:** 2026-04-01

## Reglas criticas para Canvas

**IMPORTANTE para CatBot y creacion de Canvas:**
1. Un nodo Agent del canvas NECESITA un CatPaw con conector vinculado para usar herramientas (Gmail, Drive, Holded). Sin CatPaw, el nodo solo hace llamada LLM directa sin tools.
2. Para operaciones Gmail en canvas: usar CatPaw **Ejecutor Gmail** (id: `65e3a722-9e43-43fc-ab8a-e68261c6d3da`)
3. Para operaciones Drive en canvas: usar CatPaw **Operador Drive** (id: `e05f112e-f245-4a3b-b42b-bb830dd1ac27`)
4. Para consultas Holded en canvas: usar CatPaw **Consultor CRM** (id: `b63164ed-83ae-40d0-950e-3a62826bc76f`)
5. El nodo Connector (tipo connector) solo ENVIA como side-effect — no lee datos. Para LEER, usar nodo Agent con CatPaw.
6. El nodo Storage solo ESCRIBE — para leer archivos previos, usar Agent con Operador Drive.

---

## Conectores Gmail — Modos de autenticacion

DoCatFlow soporta dos modos de autenticacion para Gmail. Cada modo tiene capacidades diferentes:

### Matriz de capacidades

| Capacidad | App Password (IMAP/SMTP) | OAuth2 (Gmail API) |
|-----------|:---:|:---:|
| `gmail_list_emails` (INBOX/sent) | SI | SI |
| `gmail_search_emails` (is:unread, from:, subject:) | SI | SI |
| `gmail_search_emails` (after:, before:) | SI (IMAP SINCE/BEFORE) | SI |
| `gmail_search_emails` (in:sent, has:attachment, label:) | NO | SI |
| `gmail_read_email` | SI | SI |
| `gmail_get_thread` (hilo completo) | SI (X-GM-THRID) | SI (threads.get) |
| `gmail_send_email` (texto + HTML + CC) | SI (SMTP) | SI (API) |
| `gmail_reply_to_message` (mismo hilo) | SI (SMTP + In-Reply-To) | SI (API + threadId) |
| `gmail_mark_as_read` | SI (IMAP addFlags) | SI (removeLabelIds UNREAD) |
| `gmail_draft_email` | NO | SI |
| Filtros avanzados Gmail | NO | SI |
| threadId en resultados list/search | SI (X-GM-THRID) | SI |

### Reglas de eleccion de modo

- **App Password**: Para cuentas Workspace con relay SMTP habilitado. Mas simple de configurar. Limitado en filtros avanzados pero cubre el 90% de casos.
- **OAuth2**: Para funcionalidad completa. Necesita proyecto Google Cloud, credenciales OAuth2 (Desktop app, redirect_uri: http://localhost), y consent screen. Soporta TODO.

### Operadores de busqueda IMAP (App Password)

Traduccion automatica Gmail → IMAP en `gmail_search_emails`:
- `is:unread` → UNSEEN
- `from:xxx` → FROM xxx
- `subject:xxx` o `subject:"texto con espacios"` → SUBJECT xxx
- `after:YYYY/MM/DD` → SINCE fecha
- `before:YYYY/MM/DD` → BEFORE fecha
- **Combinables**: `is:unread after:2026/03/25 from:lead@empresa.com` → [UNSEEN, SINCE, FROM]

### Reglas para Canvas Inbound (revision diaria de emails)

1. **Buscar por fecha, NO solo por unread**: `after:YYYY/MM/DD` (7 dias atras). Motivo: directivos leen emails desde movil → quedan como leidos pero sin respuesta.
2. **Comprobar respuestas con get_thread**: Para cada email, `gmail_get_thread(threadId, checkReplyFrom: "cuenta@email.com")`. Si `hasReplyFrom` tiene valor → ya atendido, ignorar.
3. **Tras responder**: `gmail_mark_as_read` para evitar reprocesamiento.
4. **Filtrar antiguedad**: Solo ultimos 7 dias con `after:`.
5. **Agrupar por threadId**: No procesar duplicados del mismo hilo. Tomar solo el mas reciente.
6. **Casuistica completa**:
   - Email nuevo no leido → requiere atencion
   - Email leido por directivo sin respuesta → requiere atencion
   - Email respondido por sistema en ejecucion anterior → ignorar (hasReplyFrom)
   - Email respondido manualmente por directivo → ignorar (hasReplyFrom)
   - Spam/newsletter → el clasificador lo descarta despues
   - Email antiguo (>7 dias) → excluido por after:

---

## Indice de conectores

| # | Nombre | Tipo | Auth | Estado |
|---|--------|------|------|--------|
| 1 | Info Educa360 | gmail | App Password | Activo |
| 2 | Info_Auth_Educa360 | gmail | OAuth2 | Activo |
| 3 | Antonio Educa360 | gmail | App Password | Activo |
| 4 | Antonio Sierra Sanchez | gmail | App Password | Activo |
| 5 | Educa360Drive | google_drive | OAuth2 | Activo |
| 6 | Gemini Web Search | http_api | — | Activo |
| 7 | Holded MCP | mcp_server | — | Activo |
| 8 | LinkedIn Intelligence | mcp_server | — | Activo |
| 9 | SearXNG Web Search | http_api | — | Activo |
| 10 | Test n8n | n8n_webhook | — | Activo |
| 11 | Plantillas Email Corporativas | email_template | — | Activo |

---

## Info Educa360

| Campo | Valor |
|-------|-------|
| **ID** | `67d945f0-5a73-4f40-b7d5-b16a15c05467` |
| **Tipo** | gmail |
| **Auth** | App Password (SMTP-relay Workspace) |
| **Subtipo** | gmail_workspace |
| **Cuenta** | info@educa360.com |

**Herramientas (8):** list, search, read, get_thread, send, reply, mark_as_read, send_email (CatBot directo)
**Limitaciones:** No drafts, no filtros avanzados Gmail (in:sent, has:attachment)

---

## Info_Auth_Educa360

| Campo | Valor |
|-------|-------|
| **ID** | `1d3c7b77-157c-4d73-9e7e-7b7daa104cf6` |
| **Tipo** | gmail |
| **Auth** | OAuth2 |
| **Subtipo** | gmail_workspace_oauth2 |
| **Cuenta** | info@educa360.com |

**Herramientas (9):** list, search, read, get_thread, send, reply, mark_as_read, draft, send_email (CatBot directo)
**Capacidad completa:** Todos los filtros Gmail, drafts, threads API, busqueda en cualquier carpeta
**Test verificado:** 2026-04-01 — search by date OK, get_thread OK, draft OK, in:sent OK

---

## Antonio Educa360

| Campo | Valor |
|-------|-------|
| **ID** | `43cbe742-d8ed-4788-a5df-0f6f874220a8` |
| **Tipo** | gmail |
| **Auth** | App Password |
| **Subtipo** | gmail_workspace |
| **Cuenta** | antonio@educa360.com |

---

## Antonio Sierra Sanchez

| Campo | Valor |
|-------|-------|
| **ID** | `ac75321f-892a-4d86-8863-6e3ed44d04c4` |
| **Tipo** | gmail |
| **Auth** | App Password |
| **Subtipo** | gmail_personal |
| **Cuenta** | deskmath@gmail.com |

---

## Educa360Drive

| Campo | Valor |
|-------|-------|
| **ID** | `9aee88bd-545b-4caa-b514-2ceb7441587d` |
| **Tipo** | google_drive |
| **Auth** | OAuth2 |
| **Estado** | Activo |

**Tipo de conector:** Google Drive — acceso a archivos, carpetas, subida y descarga.
Usado automaticamente por el sistema de templates para subir imagenes con URL publica.

---

## Gemini Web Search

| Campo | Valor |
|-------|-------|
| **ID** | `seed-gemini-search` |
| **Tipo** | http_api |
| **Estado** | Activo |
| **Descripcion** | Busqueda web via Gemini grounding (Google). Requiere modelo gemini-search en LiteLLM. |

---

## Holded MCP

| Campo | Valor |
|-------|-------|
| **ID** | `seed-holded-mcp` |
| **Tipo** | mcp_server |
| **Estado** | Activo |
| **Descripcion** | Conector MCP para Holded ERP. 72+ herramientas via MCP JSON-RPC. |

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
- `list_contacts` — listar contactos con paginacion

---

## LinkedIn Intelligence

| Campo | Valor |
|-------|-------|
| **ID** | `seed-linkedin-mcp` |
| **Tipo** | mcp_server |
| **Estado** | Activo |
| **Descripcion** | Consulta de perfiles, empresas y empleos de LinkedIn. Rate limiting integrado. |

---

## SearXNG Web Search

| Campo | Valor |
|-------|-------|
| **ID** | `seed-searxng` |
| **Tipo** | http_api |
| **Estado** | Activo |
| **Descripcion** | Busqueda web local. 246 motores. 100% local, sin API key. Puerto 8080. |

---

## Test n8n

| Campo | Valor |
|-------|-------|
| **ID** | `e7d15f13-dffc-4f87-932f-00ff6a87df9b` |
| **Tipo** | n8n_webhook |
| **Estado** | Activo |

---

## Plantillas Email Corporativas

| Campo | Valor |
|-------|-------|
| **ID** | `seed-email-template` |
| **Tipo** | email_template |
| **Estado** | Activo |
| **Descripcion** | Acceso a plantillas de email con editor visual. |

**Herramientas disponibles (6 en CatBot + 3 en CatPaw):**
- CatBot: `list_email_templates`, `get_email_template`, `create_email_template`, `update_email_template`, `delete_email_template`, `render_email_template`
- CatPaw: `list_email_templates`, `get_email_template`, `render_email_template`

---
