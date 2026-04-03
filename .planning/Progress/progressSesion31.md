# Sesion 31 — CatPower Templates: Bugfixes, CatBot CRUD, Drive Assets, send_email HTML

**Fecha:** 2026-04-01
**Estado:** COMPLETADO

---

## Resumen

Sesion de estabilizacion y expansion del modulo Email Templates (CatPower). Incluye: correccion de bugs criticos en UI (popover, colores, i18n), integracion completa de CatBot con CRUD de templates, solucion del envio de emails con HTML renderizado, y resolucion automatica de assets locales a URLs publicas de Drive.

---

## Bloque 1 — Bugfixes UI Templates

### Popover "Anadir bloque" no abria
- **Causa:** `Button` de shadcn usa `@base-ui/react/button` que no forwardea refs correctamente para Radix `PopoverTrigger asChild`.
- **Fix:** Wrapper `<div>` nativo en `BlockTypeSelector`, estado controlado con `useState`, cierre automatico al seleccionar tipo.
- **Archivo:** `app/src/components/templates/block-type-selector.tsx`

### Panel derecho vacio sin opciones
- **Causa:** Cuando no habia bloque seleccionado, solo mostraba texto "Anadir bloque" sin opciones.
- **Fix:** Ahora muestra los 5 tipos de bloque como botones clickables que añaden al body directamente.
- **Archivo:** `app/src/components/templates/template-editor.tsx`

### Boton eliminar plantilla inexistente
- **Fix:** Añadido icono Trash2 en cada card de la lista, con `confirm()` + `DELETE /api/email-templates/{id}`.
- **i18n:** Claves `templates.delete` y `templates.deleteConfirm` en es.json + en.json.
- **Archivo:** `app/src/app/catpower/templates/page.tsx`

---

## Bloque 2 — Error pagina Conectores

### TypeError: Cannot read 'border' of undefined
- **Causa:** Phase 105 añadio `email_template` como tipo de conector en `TYPE_CONFIG` pero no en `typeColors`.
- **Fix:** Añadido `email_template: { bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-400', border: 'border-fuchsia-500/20' }` + fallback `|| typeColors.n8n_webhook` en 2 accesos sin proteccion.
- **Archivo:** `app/src/app/catpower/connectors/page.tsx`

### MISSING_MESSAGE i18n para email_template
- **Fix:** Añadidas claves `connectors.types.email_template.label` y `.description` en es.json y en.json.

### Test conector "Unknown connector type: email_template"
- **Causa:** Faltaba case en 2 endpoints de test:
  - `/api/connectors/[id]/test/route.ts` (pagina conectores)
  - `/api/catbrains/[id]/connectors/[connId]/test/route.ts` (panel CatBrain)
- **Fix:** Añadidos cases para `email_template`, `gmail` y `google_drive` en ambos endpoints.

### Type error: CatBrainConnector missing gmail/google_drive
- **Fix:** Añadidos `gmail` | `google_drive` al union type de `CatBrainConnector.type` en `types.ts`.
- **Fix complementario:** Añadidos `gmail` y `google_drive` a `TYPE_CONFIG` en `connectors-panel.tsx`.

---

## Bloque 3 — CatBot: 6 herramientas CRUD de Templates

### Nuevas tools en catbot-tools.ts

| Tool | Descripcion |
|------|-------------|
| `list_email_templates` | Lista plantillas con filtro por categoria |
| `get_email_template` | Detalle completo: estructura, bloques, variables instruction, assets |
| `create_email_template` | Crea plantilla nueva con estructura opcional |
| `update_email_template` | Edita nombre, descripcion, categoria, estructura, activo/inactivo |
| `delete_email_template` | Elimina plantilla (con confirmacion previa) |
| `render_email_template` | Renderiza HTML final con variables rellenas + resolucion automatica de assets |

### Permisos
- `list/get/render` — siempre disponibles (read-only)
- `create/update/delete` — disponibles por defecto o con `manage_templates` en allowedActions

### Feature Knowledge
- Añadidos entries `templates` y `catpower` en `FEATURE_KNOWLEDGE` para `explain_feature`.

---

## Bloque 4 — send_email con soporte HTML

### Problema
CatBot renderizaba el template correctamente pero al enviarlo usaba `text_body` (texto plano), haciendo que el destinatario viera codigo HTML raw.

### Fix
- **Tool definition:** Añadido parametro `html_body` (HTML del template) y `cc` al tool `send_email`.
- **Handler:** Construye payload con `html_body` si esta presente. El pipeline `invoke → parseOutputToPayload → sendEmail → nodemailer` ya soportaba `html_body`, solo faltaba el puente en catbot-tools.
- **Archivo:** `app/src/lib/services/catbot-tools.ts`

---

## Bloque 5 — Resolucion automatica de assets a Drive

### Problema
Las imagenes subidas al editor se guardaban solo localmente (`/api/email-templates/.../assets/...`). Estas URLs no son accesibles desde Gmail porque el servidor es interno.

### Solucion: resolveAssetsForEmail()

Nuevo servicio `app/src/lib/services/template-asset-resolver.ts` que:

1. Detecta assets sin `drive_url` (locales)
2. Crea carpeta en Drive: `DoCatFlow/templates/{templateId}/` (incluso sin `root_folder_id` — usa Drive root)
3. Sube cada imagen y la pone publica (`anyone with link = reader`)
4. Actualiza la DB con `drive_url` y `drive_file_id`
5. Reemplaza URLs locales en la estructura antes de renderizar

### Integracion en todos los caminos de render
- `catbot-tools.ts` → `render_email_template`
- `/api/email-templates/[id]/render` → endpoint REST
- `catpaw-email-template-executor.ts` → CatPaw tools
- `canvas-executor.ts` → Canvas workflow

### URL de Drive: formato correcto para imagenes
- **Antes:** `https://drive.google.com/uc?id={ID}&export=view` — Google transcodifica a JPG, pierde transparencia de webp/png
- **Despues:** `https://lh3.googleusercontent.com/d/{ID}` — sirve el archivo original sin conversion

---

## Bloque 6 — Skill "Maquetador de Email" actualizada

### Contenido ampliado
- Documentacion de las 6 herramientas CRUD (no solo las 3 de lectura)
- Protocolo de creacion de templates (estructura, secciones, bloques, tipos)
- Ejemplo de estructura JSON completo
- Protocolo de uso completo: analizar → listar → seleccionar → rellenar → renderizar → enviar
- Reglas de contenido y matching exacto de variables

### Auto-actualizacion
- El seed en `db.ts` ahora detecta si el skill existente no tiene `create_email_template` en sus instrucciones y lo actualiza automaticamente.

---

## Resumen de archivos modificados (codigo)

| Archivo | Cambio |
|---------|--------|
| `app/src/components/templates/block-type-selector.tsx` | Fix popover: wrapper div + estado controlado + cierre al seleccionar |
| `app/src/components/templates/template-editor.tsx` | Panel derecho: 5 tipos de bloque cuando no hay seleccion |
| `app/src/app/catpower/templates/page.tsx` | Boton eliminar plantilla en cards |
| `app/src/app/catpower/connectors/page.tsx` | typeColors email_template + fallbacks |
| `app/src/components/catbrains/connectors-panel.tsx` | TYPE_CONFIG: gmail + google_drive entries |
| `app/src/lib/types.ts` | CatBrainConnector.type: +gmail +google_drive |
| `app/src/app/api/connectors/[id]/test/route.ts` | Case email_template en test |
| `app/src/app/api/catbrains/[id]/connectors/[connId]/test/route.ts` | Cases gmail, google_drive, email_template |
| `app/src/lib/services/catbot-tools.ts` | 6 tools CRUD templates + send_email html_body + feature knowledge |
| `app/src/lib/services/template-asset-resolver.ts` | **NUEVO** — resolucion automatica de assets locales a Drive |
| `app/src/app/api/email-templates/[id]/render/route.ts` | Integracion resolveAssetsForEmail |
| `app/src/app/api/email-templates/[id]/assets/route.ts` | URL Drive: lh3.googleusercontent.com |
| `app/src/lib/services/catpaw-email-template-executor.ts` | Integracion resolveAssetsForEmail |
| `app/src/lib/services/canvas-executor.ts` | Integracion resolveAssetsForEmail |
| `app/src/lib/db.ts` | Skill maquetador-email: instrucciones CRUD + auto-update |
| `app/messages/es.json` | i18n: templates.delete, types.email_template |
| `app/messages/en.json` | i18n: templates.delete, types.email_template |

---

## Tips y lecciones aprendidas

### Radix Popover + Base UI Button
`@base-ui/react/button` no forwardea refs correctamente para Radix `asChild`. Solucion: wrapper `<div>` nativo como trigger, o usar estado controlado con `open/onOpenChange`.

### Drive URLs para emails
`drive.google.com/uc?id=...&export=view` transcodifica imagenes a JPG (pierde transparencia webp/png). Usar `lh3.googleusercontent.com/d/{ID}` que sirve el archivo original.

### Assets locales no funcionan en emails
URLs tipo `/api/email-templates/.../assets/...` solo funcionan dentro de DoCatFlow. Para emails externos, las imagenes DEBEN estar en Drive con URL publica. El `resolveAssetsForEmail()` lo hace automaticamente al renderizar.

### send_email necesita html_body
El tool `send_email` de CatBot solo tenia `body` (texto plano). Para emails con plantilla, hay que usar `html_body` que pasa por el pipeline `invoke → parseOutputToPayload → sendEmail(config, payload)` donde nodemailer usa `html:` en vez de `text:`.

### Conector Drive sin root_folder_id
El conector Educa360Drive usa OAuth2 pero no tenia `root_folder_id` configurado. `resolveAssetsForEmail()` maneja esto creando carpetas desde la raiz de Drive (`'root'`).

### TypeScript Record strictness
Si usas `Record<Type['field'], Info>` y añades valores al union type, TODOS los archivos que usan ese Record deben tener entradas para los nuevos valores. Buscar con grep antes de añadir.

---

## Bloque 7 — gmail_get_thread + mejoras IMAP + OAuth2 bugfixes

### Nueva herramienta: gmail_get_thread

Obtiene TODOS los mensajes de un hilo por threadId. Soporta:
- **OAuth2**: `gmail.users.threads.get()` — devuelve metadatos de cada mensaje
- **IMAP (App Password)**: busca en INBOX + Sent Mail usando `X-GM-THRID` (extension Gmail IMAP), deduplica por Message-ID
- **Parametro `checkReplyFrom`**: si algún mensaje del hilo fue enviado desde esa direccion, rellena `hasReplyFrom`

**Archivos:**
- `app/src/lib/services/gmail-reader.ts` — getThreadGmailApi + getThreadImap + getThread export
- `app/src/lib/services/catpaw-gmail-tools.ts` — tool definition gmail_get_thread
- `app/src/lib/services/catpaw-gmail-executor.ts` — handler get_thread

### Mejoras busqueda IMAP

Ampliada la traduccion de operadores Gmail → IMAP:
- `after:YYYY/MM/DD` → SINCE
- `before:YYYY/MM/DD` → BEFORE
- Operadores combinables: `is:unread after:2026/03/25 from:lead@empresa.com`
- `listEmailsImap` ahora devuelve `threadId` via atributo `X-GM-THRID`

**Archivo:** `app/src/lib/services/gmail-reader.ts` (lineas 252-310)

### Bugfixes OAuth2 Wizard

**Bug 1 — Test credentials siempre pedia app_password:**
- `test-credentials/route.ts` ahora detecta `auth_mode` y usa la ruta correcta (SMTP o OAuth2)

**Bug 2 — gmail_subtype siempre "gmail_workspace":**
- `POST /api/connectors` ahora respeta `body.gmail_subtype` del wizard o lo deriva de `auth_mode`
- OAuth2 → `gmail_workspace_oauth2`; App Password workspace → `gmail_workspace`

**Bug 3 — redirect_uri deprecated:**
- Los 4 endpoints OAuth2 (Gmail + Drive, auth-url + exchange-code) cambiados de `urn:ietf:wg:oauth:2.0:oob` a `http://localhost`

### CatBot conocimiento Gmail actualizado

- `FEATURE_KNOWLEDGE.gmail` — entrada completa con 9 herramientas, matriz de capacidades, reglas para Canvas Inbound
- `list_email_connectors` ahora devuelve `auth_mode`, `user` y `capabilities` por conector
- `FEATURE_KNOWLEDGE.conectores` actualizada para referenciar todos los tipos

### Tests reales ejecutados en produccion (info@educa360.com, OAuth2)

| Test | Resultado |
|------|-----------|
| search_emails after:2026/03/25 | OK — 5 emails |
| get_thread (threadId de alerta Google) | OK — 1 mensaje, hasReplyFrom: null |
| draft_email (crear + borrar borrador) | OK — draftId r-7087829562428383567 |
| search in:sent after:2026/03/25 | OK — 1 email enviado |

---

## Resumen de archivos modificados — Bloque 7

| Archivo | Cambio |
|---------|--------|
| `app/src/lib/services/gmail-reader.ts` | +ThreadMessage, +ThreadDetail types, +getThreadGmailApi, +getThreadImap, +getThread, mejora IMAP search (after/before), threadId via X-GM-THRID |
| `app/src/lib/services/catpaw-gmail-tools.ts` | +gmail_get_thread tool definition |
| `app/src/lib/services/catpaw-gmail-executor.ts` | +get_thread handler |
| `app/src/app/api/connectors/gmail/test-credentials/route.ts` | Soporte OAuth2 (no solo app_password) |
| `app/src/app/api/connectors/gmail/oauth2/auth-url/route.ts` | redirect_uri: http://localhost |
| `app/src/app/api/connectors/gmail/oauth2/exchange-code/route.ts` | redirect_uri: http://localhost |
| `app/src/app/api/connectors/google-drive/oauth2/auth-url/route.ts` | redirect_uri: http://localhost |
| `app/src/app/api/connectors/google-drive/oauth2/exchange-code/route.ts` | redirect_uri: http://localhost |
| `app/src/app/api/connectors/route.ts` | gmail_subtype respeta body o deriva de auth_mode |
| `app/src/lib/services/catbot-tools.ts` | FEATURE_KNOWLEDGE.gmail + list_email_connectors con capabilities |
| `.planning/knowledge/CONNECTORS.md` | Reescrito completo: 11 conectores, matriz OAuth2 vs App Password, reglas Canvas Inbound |

---

## Bloque 8 — Modelo Base + Extras en Canvas (skills y conectores)

### Problema
El panel de configuracion del nodo Agent en Canvas no mostraba las skills vinculadas al CatPaw. Ademas, vincular/desvincular conectores desde el canvas MODIFICABA el CatPaw base — rompia el principio de que el canvas no debe alterar la configuracion del agente.

### Solucion: dos capas

| Capa | Origen | Editable en canvas | Visual | Ejecucion |
|------|--------|-------------------|--------|-----------|
| **Base** | CatPaw (/agents) | NO (solo lectura) | Pill borde solido, sin X | Siempre activa |
| **Extra** | Canvas (nodo) | SI (+ Vincular / X quitar) | Pill borde dashed, con X | Mergeada con base |

### Implementacion

**UI (node-config-panel.tsx):**
- Nuevo estado `pawSkillIds` — fetch skills base del CatPaw via `GET /api/cat-paws/{id}`
- Conectores base: `pawConnectors` (ya existia) — ahora sin boton X
- Skills base: `pawSkillIds` — ahora se muestran como pills read-only
- Extras conectores: `node.data.extraConnectors` — pills dashed con X
- Extras skills: `node.data.skills` — pills dashed con X
- Pickers excluyen items ya en base o extras
- Elimando `handleLinkConnector`/`handleUnlinkConnector` que mutaban el CatPaw desde canvas

**Ejecucion (execute-catpaw.ts):**
- `executeCatPaw()` ahora acepta `options.extraSkillIds` y `options.extraConnectorIds`
- Mergea extras con base sin duplicados antes de construir el prompt y cargar tools
- El CatPaw base **nunca se modifica**

**Canvas executor (canvas-executor.ts):**
- Pasa `data.skills` y `data.extraConnectors` del nodo al `executeCatPaw()` como extras

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `app/src/components/canvas/node-config-panel.tsx` | +pawSkillIds, +showSkillPicker, dos capas visual, eliminados handlers que mutaban CatPaw |
| `app/src/lib/services/execute-catpaw.ts` | +options.extraSkillIds/extraConnectorIds, merge con base |
| `app/src/lib/services/canvas-executor.ts` | Pasa extras del nodo a executeCatPaw |
| `.planning/knowledge/canvas-nodes.md` | Documentacion modelo dos capas en nodo Agent |
| `.planning/knowledge/GUIA_USUARIO.md` | Seccion CatFlow actualizada con modelo Base + Extras |
| `app/src/lib/services/catbot-tools.ts` | FEATURE_KNOWLEDGE.catflow actualizado |

---

## Bloque 9 — Mejoras menores

### Descargar plantilla JSON de skills
- Boton "Plantilla" en /catpower/skills junto a "Importar JSON"
- Descarga `skill-template.json` con estructura base + guia profesional de creacion con IA
- **Archivo:** `app/src/app/catpower/skills/page.tsx`

### CatBot conocimiento de skills JSON
- `FEATURE_KNOWLEDGE.skills` actualizado con schema JSON completo, reglas de obligatoriedad, protocolo de creacion
- CatBot puede generar el JSON de una skill si el usuario la describe

### Vincular CatBrains en pagina de agentes
- Bug: `/api/catbrains?limit=100` devolvia `{ data: [...] }` pero el codigo buscaba `data.catbrains`
- Fix: `data.data || data.catbrains || []`
- **Archivo:** `app/src/app/agents/[id]/page.tsx`

## Bloque 10 — Canvas tools mejoradas + Skill Maquetador v2.0

### canvas_delete_edge (nueva tool)
- Elimina un edge por ID (formato `e-{sourceId}-{targetId}`)
- Valida existencia antes de eliminar

### canvas_add_node + insert_between
- Nuevo parametro `insert_between: { sourceNodeId, targetNodeId }`
- Calcula posicion media, elimina edge viejo, crea 2 edges nuevos
- 1 operacion en vez de 4

### Auto-resolve de nombres en canvas_add_node
- Al pasar `agentId`: resuelve automaticamente `agentName`, `model`, `mode` desde DB
- Al pasar `connectorId`: resuelve `connectorName` desde DB
- Nunca mas UUIDs como nombres visibles en nodos

### Fix canvas produccion
- Nodo Maquetador Email: `agentName` corregido de `undefined` a `"Maquetador Email"`

### Skill Maquetador de Email v2.0 (reescrita completa)
- Separacion de responsabilidades: solo maqueta, no redacta
- Reglas de diseño: tipografia segura (Arial 14-16px), colores (#333/#1a73e8/#FFF), H1 22-26px
- CTA bulletproof pattern (table HTML para Outlook)
- Estructura 150-250 palabras: saludo→hook→valor→CTA→firma
- Engagement patterns: asuntos 30-50 chars, hooks, PS lines
- Lista de "NO hacer" (muros de texto, multiple CTAs, ALL CAPS)
- Ejemplo completo de email B2B profesional como referencia
- Fallback: genera HTML directo si plantilla no tiene bloques instruction

### Reestructuracion documentacion .planning/
- Eliminados duplicados raiz (CONNECTORS.md, GUIA_USUARIO.md)
- Renombrado knowledge/ a kebab-case + -catalog (catpaw-catalog.md, skills-catalog.md, etc.)
- Renombrado codebase/ a lowercase (architecture.md, stack.md, etc.)
- Movido coding-rules.md → codebase/, milestones-archive.md → milestones/
- Movido research/ → archive/research/, MCP/ → knowledge/holded-mcp-api.md
- Creado knowledge/email-templates-catalog.md (11 plantillas documentadas)
- Index.md reescrito con todas las rutas actualizadas
- CatBot search-docs ampliado: escanea codebase/ y MCP/ ademas de knowledge/ y Progress/
- Raiz limpia: solo 5 archivos GSD + Index + config.json

---

## Bloque 11 — Nodo Iterator (forEach para Canvas)

### Nuevo sistema de nodos ITERATOR / ITERATOR_END
Implementacion completa de bucles forEach en el motor de canvas. Permite procesar arrays elemento a elemento con resiliencia ante fallos parciales.

**Archivos creados:**
- `app/src/components/canvas/nodes/iterator-node.tsx` — componente visual (rosa, 240x100px, 2 handles)
- `app/src/components/canvas/nodes/iterator-end-node.tsx` — componente visual interruptor (rosa, 160x70px, borde dashed)

**Archivos modificados:**
- `canvas-editor.tsx` — NODE_TYPES, defaults, minimap, handleGenerateIteratorEnd, cleanup onNodesDelete
- `node-palette.tsx` — Iterator en paleta (todos los modos), icono Repeat
- `node-config-panel.tsx` — Formularios: separador, limite, "Generar interruptor"
- `canvas-executor.ts` — dispatch iterator/iterator_end, branch skipping, loop control, partial failure resilience, helpers parseIteratorItems/getNodesBetween/isNodeInsideIteratorLoop
- `catbot-tools.ts` — ITERATOR en enum canvas_add_node, FEATURE_KNOWLEDGE['iterator']
- `es.json` / `en.json` — 30+ keys i18n (palette, nodes, nodeConfig, nodeDefaults)

**Arquitectura del motor:**
- Sin ciclos en el DAG — usa reset de nodos + llamada recursiva (patron SCHEDULER count)
- `metadata.iterator_state` — items[], results[], currentIndex, startedAt
- ITERATOR_END como punto de salida — acumula resultados y emite array final
- Resiliencia: si un nodo del loop falla, captura `{status:"error", error_detail, original_item}` y continua

**Build verificado:** TypeScript + Next.js build OK

---

## Bloque 12 — CatFlow Inbound v4: Estabilización fase a fase

### Metodología
Construcción incremental: cada fase añade 1 nodo, se ejecuta con datos reales, se verifica. No se avanza hasta que pasa.

### Fases completadas
| Fase | Nodos | Resultado |
|------|-------|-----------|
| 1: Lector | START → Lector → Output | 6 emails JSON limpio, BlastFunnels email capturado |
| 2: Iterator | + ITERATOR + ITERATOR_END | 6/6 items parseados y acumulados |
| 3: Clasificador | + Clasificador en el loop | 6/6 correctos: categoría, producto, reply_to_email |
| 4a: Respondedor+Maquetador LLM | + Respondedor + Maquetador | FRACASO: campos perdidos, markdown wrappers |
| 4b: Connector determinista | Eliminar Maquetador, + Connector Gmail | 10/10 OK, 50% menos tokens |
| 4c: RefCode | + ref_code en templates, lookup tolerante | 8/8 OK, 4 plantillas distintas por producto |

### Decisión arquitectónica clave: LLM piensa, código ejecuta
- Eliminados 2 nodos LLM (Maquetador + Ejecutor) → reemplazados por 1 Connector Gmail con lógica determinista
- El LLM solo produce un esquema JSON (clasificación + respuesta + plantilla_ref)
- El código hace: lookup plantilla por RefCode → render template → inject HTML si no hay instruction blocks → enviar email → mark_read
- 0 tool-calls LLM para la ejecución. 100% determinista.

### RefCode — Sistema de referencias para plantillas
- Campo `ref_code` (6 chars alfanuméricos, unique) en email_templates
- Migración auto para plantillas existentes
- API GET/render aceptan ref_code como ID alternativo
- Badge visible en UI de lista de plantillas
- Mapeo producto→RefCode en skill "Leads y Funnel InfoEduca"
- Lookup tolerante en connector: ref_code → nombre → parcial → ID
- Tools CatBot (list/get/render) actualizadas para soportar refCode

### Mejoras en canvas-executor.ts
- `cleanLlmOutput()`: strip automático de markdown wrappers para nodos agent/catbrain
- `mergePreserveFields()`: safety net anti-teléfono-escacharrado (merge input con output)
- Connector Gmail determinista: parsea `accion_final` del predecessor, ejecuta sin LLM
- Inyección HTML para plantillas sin instruction blocks (Pro-K12, Pro-REVI, etc.)
- Encoding UTF-8 en asuntos de reply (RFC 2047)

### Reglas de Oro nuevas (R20-R23)
- R20: Si puede hacerse con código, NO delegarlo al LLM
- R21: El código SIEMPRE limpia output del LLM
- R22: Referencias entre entidades usan RefCodes, no nombres
- R23: Separar nodos de pensamiento (LLM) de nodos de ejecución (código)

---

## Metricas de la sesion

- **Bugs corregidos:** 12 (popover, typeColors, i18n, test endpoint x2, type union, OAuth2 test, gmail_subtype, redirect_uri, catbrains link, canvas mutaba CatPaw, agentName UUID)
- **Tools nuevas CatBot:** 7 (CRUD templates + canvas_delete_edge)
- **Tools nuevas CatPaw:** 1 (gmail_get_thread)
- **Tools mejoradas:** 3 (send_email + html_body, list_email_connectors + capabilities, canvas_add_node + insert_between + auto-resolve)
- **Skills reescritas:** 1 (Maquetador de Email v2.0)
- **Servicios nuevos:** 1 (template-asset-resolver.ts)
- **Nodos Canvas nuevos:** 2 (Iterator + Iterator End — sistema forEach completo)
- **Feature nueva:** RefCode — sistema de referencias deterministas para plantillas (6 chars, DB+API+UI+tools)
- **Mejoras IMAP:** busqueda por fecha (after/before), threadId (X-GM-THRID), operadores combinables
- **Arquitectura nueva:** modelo Base+Extras, ITERATOR, Connector Gmail determinista, separacion LLM/codigo, triple proteccion anti-duplicados
- **Documentacion:** reestructuracion .planning/, 8 catalogos knowledge/, postmortem Inbound v4.0, Reglas R01-R25
- **CatFlow Inbound v4c VALIDADO:** pipeline completo, 0 re-envíos, informe con template CatBot, filtro de 9/9 duplicados, 1 email nuevo procesado correctamente
- **Errores documentados:** 15 errores con causa raíz y solución (E1-E15 en postmortem)
- **Archivos modificados:** 55+
- **Tests reales produccion:** 20+ ejecuciones del canvas de test con datos reales
- **Build verificado:** Si (TypeScript + Next.js)
