# Sesion 24 — Gmail Reader + Tool-Calling en CatPaw Chat

**Fecha:** 2026-03-26
**Milestone:** Post v19.0 — Feature puntual sobre v13.0 (Conector Gmail)
**Estado:** COMPLETADO (implementacion Claude Code + documentacion)

---

## Resumen

El CatPaw "Experto en Educa360" tenia el conector Gmail "Antonio Educa360" vinculado,
pero al pedirle que leyera correos respondia que no tenia acceso. Causa raiz: el conector
Gmail de v13.0 era exclusivamente de ENVIO (Nodemailer/SMTP). No existia lectura de bandeja,
busqueda ni tool-calling en el chat del CatPaw.

Se implemento el sistema completo de lectura Gmail + tool-calling bidireccional en el
chat del CatPaw. El LLM ahora puede decidir en tiempo de conversacion cuando llamar a
Gmail para listar, buscar, leer, redactar o enviar correos.

---

## Problema diagnosticado

### Flujo anterior (roto)

```
Usuario: "busca mis correos"
         →
CatPaw chat route
  → executeCatPaw() → invoca conectores ANTES del LLM para contexto estatico
  → Gmail connector: solo tiene operacion "invoke" (enviar email)
  → LLM recibe: sin contexto de emails
  → LLM responde: "No tengo acceso a su cuenta de correo"
```

### Por que pasaba

1. `email-service.ts` solo tenia `createTransporter`, `testConnection`, `sendEmail` — sin lectura
2. El conector Gmail se invocaba como contexto estatico pre-LLM, no como herramienta bajo demanda
3. El chat route de CatPaw (`/api/cat-paws/[id]/chat/route.ts`) no tenia tool-calling loop
4. En v13.0 la lectura IMAP estaba explicitamente marcada como Out of Scope

---

## Implementacion

### Archivos nuevos (3)

#### `app/src/lib/services/gmail-reader.ts`

Servicio de lectura Gmail con dos implementaciones segun el modo de autenticacion:

**OAuth2 (Gmail API via googleapis):**
- `listEmails(config, options)` → `EmailSummary[]`
- `readEmail(config, messageId)` → `EmailDetail`
- `searchEmails(config, query, limit)` → `EmailSummary[]`
- `draftEmail(config, payload)` → `{ draftId: string }`

Usa `googleapis` (ya instalado desde v13.0). El refresh_token cifrado se descifra con
`crypto.ts` y se pasa al cliente OAuth2 de Google. El token de acceso se gestiona
automaticamente por la libreria.

**App Password (IMAP via imap-simple):**
- Mismas funciones, implementadas sobre protocolo IMAP
- `imap-simple` instalado como nueva dependencia
- Configuracion: `imap.gmail.com:993` (TLS)
- `draftEmail` no disponible para App Password (requiere OAuth2 o SMTP especifico)
  → devuelve error descriptivo: "Los borradores requieren OAuth2"

**Tipos exportados:**
```typescript
interface EmailSummary {
  id: string
  subject: string
  from: string
  date: string
  snippet: string
  isRead: boolean
}

interface EmailDetail extends EmailSummary {
  to: string
  body: string
  bodyHtml?: string
  attachments?: string[]
}
```

**Deteccion del modo:**
```typescript
if (config.auth_mode === 'oauth2') {
  // Gmail API path
} else {
  // IMAP path (app_password)
}
```

---

#### `app/src/lib/services/catpaw-gmail-tools.ts`

Generador de tool definitions en formato OpenAI para el LLM.

**Funcion principal:**
```typescript
export function getGmailToolsForPaw(
  pawId: string,
  gmailConnectors: ConnectorWithConfig[]
): CatBotTool[]
```

Por cada conector Gmail vinculado al CatPaw genera 5 herramientas con nombre unico
basado en el nombre del conector (snake_case, sin caracteres especiales):

| Tool | Descripcion |
|------|-------------|
| `gmail_{slug}_list_emails` | Listar ultimos N correos (default 10, max 50) |
| `gmail_{slug}_search_emails` | Buscar por query Gmail (from:, subject:, etc.) |
| `gmail_{slug}_read_email` | Leer correo completo por messageId |
| `gmail_{slug}_draft_email` | Crear borrador (NO envia, solo prepara) |
| `gmail_{slug}_send_email` | Enviar email (descripcion instruye al LLM a pedir confirmacion) |

Ejemplo con conector "Antonio Educa360":
- `gmail_antonio_educa360_list_emails`
- `gmail_antonio_educa360_search_emails`
- etc.

La descripcion de `gmail_*_send_email` incluye instruccion explicita:
> "SIEMPRE pide confirmacion explicita al usuario antes de llamar esta herramienta.
> Muestra el borrador y espera que el usuario diga 'si', 'confirmar' o 'enviar'."

---

#### `app/src/app/api/cat-paws/[id]/gmail/route.ts`

Endpoint que ejecuta operaciones Gmail con verificacion de autorizacion.

**`POST /api/cat-paws/[id]/gmail`**

```typescript
Body: {
  connectorId: string
  operation: 'list_emails' | 'search_emails' | 'read_email' | 'draft_email' | 'send_email'
  params: Record<string, unknown>
}
```

Flujo de ejecucion:
1. Cargar CatPaw desde SQLite, verificar que existe
2. Verificar que `connectorId` esta en `cat_paw_connectors` para este paw (auth check)
3. Cargar conector y descifrar credenciales con `crypto.ts`
4. Llamar al metodo correspondiente de `gmail-reader.ts` (o `email-service.ts` para send)
5. Registrar en `connector_logs` (sin credenciales, sin contenido sensible del email)
6. Devolver resultado estructurado

Respuestas:
- `200` + `{ result }` en exito
- `403` si el conector no pertenece al CatPaw
- `400` si la operacion no es valida
- `422` si IMAP no esta habilitado (App Password): `"Esta cuenta necesita IMAP habilitado en Gmail"`
- `500` con mensaje descriptivo en error de Gmail API

---

### Archivos modificados (1)

#### `app/src/app/api/cat-paws/[id]/chat/route.ts`

**Cambios:**

1. **Deteccion de conectores Gmail** — Al cargar el CatPaw se filtran los conectores
   activos de tipo `gmail`:
   ```typescript
   const gmailConnectors = catPaw.connectors?.filter(
     c => c.type === 'gmail' && c.is_active
   ) ?? []
   ```

2. **Generacion de Gmail tools** — Si hay conectores Gmail, se generan las tools:
   ```typescript
   const gmailTools = gmailConnectors.length > 0
     ? getGmailToolsForPaw(pawId, gmailConnectors)
     : []
   ```

3. **Tools al LLM** — Las Gmail tools se anaden junto a las MCP tools existentes
   en el llamado a LiteLLM (no reemplazan el sistema existente):
   ```typescript
   tools: [...mcpTools, ...gmailTools]
   ```

4. **Seccion Gmail en system prompt** — Cuando hay conectores Gmail se anade:
   ```
   Tienes acceso a las siguientes cuentas de Gmail: [nombre del conector].
   Puedes listar correos, buscar por remitente/asunto/contenido, leer correos
   completos y redactar borradores. Para ENVIAR un email siempre pide confirmacion
   explicita al usuario antes de ejecutar. Nunca envies sin confirmacion.
   ```

5. **Ejecucion de Gmail tools en el loop** — En el tool-calling loop existente,
   se anade rama para tools de nombre `gmail_*`:
   ```typescript
   if (toolName.startsWith('gmail_')) {
     result = await executeGmailTool(pawId, toolName, toolArgs, gmailConnectors)
   }
   ```
   Donde `executeGmailTool` determina que conector y que operacion usar
   basandose en el nombre de la tool, y llama al endpoint interno.

6. **Limite del loop** — Maximo 5 iteraciones (igual que CatBot para MCP tools).

---

## Arquitectura final del CatPaw Chat con Gmail

```
Usuario: "cual fue el ultimo correo de fernando?"
          →
POST /api/cat-paws/[id]/chat
  → Cargar CatPaw + relaciones
  → executeCatPaw() → contexto inicial (CatBrains RAG, skills, otros conectores)
  → Detectar gmailConnectors (antonio_educa360)
  → Generar gmail_antonio_educa360_* tools (5 tools)
  → LLM call con tools + system prompt Gmail
      →
  LLM responde: tool_call: gmail_antonio_educa360_search_emails
                params: { query: "from:fernando", limit: 5 }
      →
  ejecutar tool → POST /api/cat-paws/[id]/gmail
                  → verificar auth
                  → gmail-reader.searchEmails()
                  → [ { id, subject, from, date, snippet } ]
      →
  LLM call con tool result
      →
  LLM responde: "El ultimo correo de Fernando fue el [fecha]:
                '[asunto]'. Quieres que lo lea completo?"
      →
  Stream SSE al cliente
```

---

## Tabla de capacidades por modo de autenticacion

| Operacion | App Password (IMAP) | OAuth2 (Gmail API) |
|-----------|--------------------|--------------------|
| Listar correos | si | si |
| Buscar correos | si (IMAP SEARCH) | si (Gmail query syntax) |
| Leer correo completo | si | si |
| Crear borrador | no (requiere OAuth2) | si |
| Enviar email | si (via SMTP existente) | si |

**Nota sobre App Password + IMAP:** Gmail requiere que el usuario habilite
el acceso IMAP manualmente en `mail.google.com → Configuracion → Reenvio e IMAP`.
Si no esta habilitado, el endpoint devuelve `422` con mensaje descriptivo.

---

## Dependencias nuevas

| Paquete | Version | Motivo |
|---------|---------|--------|
| `imap-simple` | latest | Lectura IMAP para cuentas App Password |
| `@types/imap-simple` | latest | Tipos TypeScript |

Las dependencias `googleapis` y `nodemailer` ya existian desde v13.0.

---

## Verificaciones realizadas

| Test | Resultado |
|------|-----------|
| `npm run build` | OK Compilado sin errores |
| Drive unit tests (12/12) | OK Sin regresiones |
| `task-scheduler.test.ts` | WARN Fallo pre-existente, no relacionado |

### Tests manuales recomendados post-deploy

1. Abrir CatPaw con Gmail vinculado → tab Chat
2. "Cual es el ultimo correo que he recibido?" → debe llamar `list_emails` y responder
3. "Busca correos de antonio@educa360.com" → debe llamar `search_emails`
4. "Leeme el contenido del primero" → debe llamar `read_email`
5. "Redacta un correo a fernando sobre la reunion del lunes" → debe llamar `draft_email` y mostrar borrador
6. "Envialo" → debe pedir confirmacion antes de ejecutar `send_email`
7. Confirmar → envio ejecutado, log en `connector_logs`

---

## Errores conocidos y edge cases

| Situacion | Comportamiento |
|-----------|---------------|
| App Password sin IMAP habilitado | `422`: "Esta cuenta necesita IMAP habilitado en Gmail" |
| OAuth2 con refresh_token expirado | `500` con mensaje de Google. Solucion: re-configurar conector |
| Borrador en cuenta App Password | `400`: "Los borradores requieren OAuth2" |
| Conector no vinculado al CatPaw | `403`: autenticacion denegada |
| CatPaw sin conectores Gmail | Chat funciona normalmente, sin tools Gmail |
| Multiples conectores Gmail | Se generan tools separadas con slug del nombre de cada conector |

---

## Phase 85 — Google Drive Wizard UI

**Contexto:** Las fases 83 y 84 implementaron el conector Google Drive completo (source type,
polling, Canvas integration, CatBrain executor), pero la UI del wizard era un stub vacio.
La configuracion requeria hacerse via API curl directamente. Esta fase implementa el wizard
completo de 4 pasos, consistente con el wizard de Gmail (v13.0).

### Archivos nuevos (1)

#### `app/src/app/api/connectors/google-drive/browse/route.ts`

Nuevo endpoint `POST /api/connectors/google-drive/browse` para explorar carpetas de Drive
**sin necesitar un connector ID previo**.

Problema que resuelve: el folder picker del wizard necesita mostrar carpetas antes de que
el conector este creado. El endpoint acepta las credenciales directamente en el body
para uso exclusivo del wizard.

---

### Archivos modificados (5)

#### `google-drive-wizard.tsx` — Wizard completo de 4 pasos

| Paso | Contenido |
|------|-----------|
| 1 | Tipo de cuenta: Workspace (sky-500, recomendado) vs Personal (violet-500) |
| 2 | Credenciales OAuth2: nombre, email, Client ID, Client Secret (toggle ver) + instrucciones expandibles por tipo |
| 3 | Autorizacion via popup OAuth2 (postMessage callback) + lineas de verificacion animadas |
| 4 | Folder picker interactivo + card resumen + snippets Canvas/CatPaw/CatBrain |

**Decision clave:** Popup OAuth2 en lugar del flujo OOB (pegar codigo) — OOB esta deprecado
por Google desde 2022. El callback existente envia tokens via `window.opener.postMessage`.

#### `drive-folder-picker.tsx`

Anadida prop `credentials?: WizardCredentials`. Cuando se pasan credenciales usa el
nuevo endpoint POST browse (wizard mode). Sin credenciales usa GET con connector ID (modo normal).

```typescript
export interface WizardCredentials {
  client_id: string
  client_secret: string
  refresh_token: string
}
```

#### `connectors/page.tsx`

Eliminados 3 comentarios `eslint-disable` anadidos cuando el wizard era stub.
`GoogleDriveWizard`, `DriveSubtitle` y `driveWizardOpen` ahora se usan activamente.

#### `es.json` + `en.json`

Seccion `drive` renovada: claves para step1-4, tipos de cuenta, instrucciones, folder picker,
snippets de uso y mensajes de error.

---

### Estado de configuracion Drive post-fase 85

| Via | Estado |
|-----|--------|
| Wizard UI OAuth2 (Personal + Workspace) | OK Operativo |
| API curl / Service Account | OK Sigue funcionando |

---

## Bugfix Phase 85 — OAuth2 IP privada bloqueada por Google

**Error:** Al completar el paso 3 del wizard Drive aparecia:
```
Error 400: invalid_request
device_id and device_name are required for private IP:
http://192.168.1.49:3500/api/connectors/google-drive/oauth2/callback
```

**Causa raiz:** El endpoint `auth-url/route.ts` de Drive usaba como `redirect_uri`
la IP local del servidor (`http://192.168.1.49:3500/api/.../callback`).
Google bloquea explicitamente los redirects OAuth2 a IPs privadas (RFC 1918).

**Solucion:** Cambiar al flujo code-paste identico al que ya usa Gmail wizard (v13.0),
que usa `urn:ietf:wg:oauth:2.0:oob` como redirect URI.
Google muestra el codigo de autorizacion en pantalla y el usuario lo copia.

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `auth-url/route.ts` | `redirect_uri` cambiado de `origin/callback` a `urn:ietf:wg:oauth:2.0:oob` |
| `oauth2/exchange-code/route.ts` | NUEVO — intercambia code por tokens, cifra refresh_token y client_secret |
| `google-drive-wizard.tsx` | Paso 3 reescrito: popup+postMessage → code-paste |
| `es.json` + `en.json` | Instrucciones paso 3 actualizadas para flujo code-paste |

### Nuevo flujo paso 3 (post-fix)

```
ANTES (roto):
  Wizard abre popup → Google redirige a 192.168.1.49 → ERROR 400

AHORA (igual que Gmail):
  1. Usuario pulsa "Abrir en navegador" → nueva pestana con URL de Google
  2. Google muestra el codigo en pantalla
  3. Usuario copia el codigo y lo pega en el wizard
  4. Wizard llama POST /oauth2/exchange-code → cifra credenciales
  5. Continua al paso 4 (folder picker)
```

### exchange-code/route.ts — Logica clave

- Recibe `{ code, client_id, client_secret }`
- Crea OAuth2 client con `redirect_uri: 'urn:ietf:wg:oauth:2.0:oob'`
- Intercambia code → tokens via `oauth2Client.getToken(code)`
- Si no hay `refresh_token`: devuelve 400 con instruccion de revocar acceso
- Obtiene email del usuario via `oauth2.userinfo.get()` (no critico, para display)
- Cifra `refresh_token` y `client_secret` con `crypto.ts` (AES-256-GCM)
- Devuelve `{ refresh_token_encrypted, client_secret_encrypted, client_id, email }`
- Errores traducidos al espanol: `invalid_grant`, `invalid_client`, `redirect_uri_mismatch`

**Build:** OK Compilado sin errores tras el fix.

**Para aplicar:** `dfdeploy` — el flujo ahora es identico al de Gmail.

---

## Feature: CatBot Canvas Tools — Orquestacion de flujos desde chat

**Motivacion:** CatBot creaba CatPaws y conectores pero no podia tocar el Canvas.
Al pedirle que modificara un flujo respondia "no tengo permisos para editar el lienzo visual".
La API del Canvas existia completa (GET/PATCH/POST/execute) pero no habia tools expuestas al LLM.

### 8 tools nuevas en catbot-tools.ts

| Tool | Tipo | Que hace |
|------|------|----------|
| `canvas_list` | Lectura | Lista todos los canvas con nombre, modo y num de nodos |
| `canvas_get` | Lectura | Obtiene flow_data completo (nodos + edges) por nombre o ID |
| `canvas_create` | Escritura | Crea canvas vacio con nodo START incluido |
| `canvas_add_node` | Escritura | Anade nodo (AGENT/PROJECT/CONNECTOR/MERGE/CONDITION/OUTPUT/CHECKPOINT) |
| `canvas_add_edge` | Escritura | Conecta dos nodos, soporta sourceHandle para CONDITION (yes/no) |
| `canvas_remove_node` | Escritura | Elimina nodo y todos sus edges asociados |
| `canvas_update_node` | Escritura | Cambia label, agentId, connectorId o instrucciones de un nodo |
| `canvas_execute` | Escritura | Ejecuta el canvas, devuelve runId para seguimiento |

**Filtrado en getToolsForLLM:**
- `canvas_list` y `canvas_get`: siempre disponibles (igual que `list_projects`)
- Resto: filtradas por `manage_canvas` o libres si `allowedActions` esta vacio

**Patron de implementacion (canvas_add_node como ejemplo):**
```
1. GET /api/canvas/{canvasId} → obtener flow_data actual
2. Generar nodeId: Math.random().toString(36).slice(2,11)
3. Calcular posicion: X = maxX de nodos + 250, Y = media de Y existentes
4. Construir nodo React Flow: { id, type, position, data: {label, agentId?, ...} }
5. PATCH /api/canvas/{canvasId} con { flow_data: { nodes: [...existing, newNode], edges } }
6. Devolver { nodeId, label, type }
```

Nunca se modifica flow_data sin GET previo — riesgo de sobrescribir nodos existentes.

### Cambios en chat/route.ts

- **System prompt**: seccion "Canvas (CatFlow Visual)" con protocolo obligatorio para el LLM:
  1. Siempre `canvas_get` PRIMERO antes de modificar
  2. Posiciones calculadas para no solapar (X: +250 del ultimo nodo)
  3. Edges siempre despues de nodos
  4. Confirmar al usuario que nodos y conexiones se crearon
- **maxIterations**: subido de 5 → **8** (construir un canvas completo puede requerir: get + N*add_node + N*add_edge)
- Linea Canvas anadida en "Lo que sabes de DoCatFlow"

### Verificaciones recomendadas post-deploy

1. "Que canvas tengo?" → `canvas_list` → lista con nombres
2. "Abre LeadHunting Educa360 y dime cuantos nodos tiene" → `canvas_get` → conteo
3. "Anade un nodo AGENT llamado Filtro Holded al canvas LeadHunting" → `canvas_get` + `canvas_add_node`
4. "Conecta el nodo Merge con Filtro Holded" → `canvas_get` + `canvas_add_edge`

**Build:** OK `npm run build` sin errores.

---

## Resumen global de archivos — Sesion 24

| Archivo | Accion | Feature |
|---------|--------|---------|
| `gmail-reader.ts` | NUEVO | Lectura Gmail (OAuth2 + IMAP) |
| `catpaw-gmail-tools.ts` | NUEVO | Tool definitions para LLM |
| `cat-paws/[id]/gmail/route.ts` | NUEVO | Endpoint operaciones Gmail |
| `cat-paws/[id]/chat/route.ts` | MODIFICADO | Tool-calling loop Gmail |
| `google-drive/browse/route.ts` | NUEVO | Browse Drive sin connector ID |
| `google-drive-wizard.tsx` | MODIFICADO | Wizard 4 pasos completo |
| `drive-folder-picker.tsx` | MODIFICADO | Prop credentials para wizard |
| `connectors/page.tsx` | MODIFICADO | Limpieza eslint-disable |
| `oauth2/exchange-code/route.ts` | NUEVO | Intercambio code → tokens cifrados |
| `auth-url/route.ts` | MODIFICADO | redirect_uri → OOB flow |
| `catbot-tools.ts` | MODIFICADO | 8 canvas tools (definitions + handlers) |
| `catbot/chat/route.ts` | MODIFICADO | System prompt Canvas + maxIterations 8 |
| `es.json` + `en.json` | MODIFICADO | i18n Drive wizard |

## Build final

- `npm run build` → OK sin errores
- Drive unit tests 12/12 → OK
- `task-scheduler.test.ts` → WARN fallo pre-existente no relacionado
