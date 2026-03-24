# DoCatFlow — Documentacion de Conectores

## Que es un Conector

Un conector en DoCatFlow es una entidad que representa una conexion con un servicio externo. Los conectores permiten que CatPaws (agentes), CatBrains (proyectos) y tareas del sistema interactuen con servicios fuera de DoCatFlow — enviar webhooks, llamar APIs, comunicarse con servidores MCP, o enviar emails.

Cada conector tiene:
- **Nombre** y **emoji** identificativos
- **Tipo** (determina como se ejecuta la conexion)
- **Configuracion** (JSON con campos especificos al tipo: URL, headers, timeout, etc.)
- **Estado**: activo/inactivo, resultado del ultimo test, contador de usos
- **Logs**: registro de cada invocacion con payload, duracion y errores

Los conectores se almacenan en la tabla `connectors` de SQLite. Limite maximo: **20 conectores** por instalacion.

### Modelo de datos

```
connectors              connector_logs                 agent_connector_access
────────────           ────────────────               ────────────────────────
id (PK)                id (PK)                        agent_id (PK)
name                   connector_id (FK→connectors)   connector_id (PK, FK→connectors)
description            task_id
emoji                  task_step_id                   catbrain_connectors
type                   agent_id                       ────────────────────
config (JSON)          request_payload                id (PK)
is_active              response_payload               catbrain_id (FK→catbrains)
test_status            status                         name, type, config, description
last_tested            duration_ms                    is_active
times_used             error_message
created_at             created_at                     cat_paw_connectors
updated_at                                            ────────────────────
                                                      cat_paw_id (FK→cat_paws)
                                                      connector_id (FK→connectors)
```

**Interfaz TypeScript** (`app/src/lib/types.ts`):
```typescript
interface Connector {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
  type: 'n8n_webhook' | 'http_api' | 'mcp_server' | 'email';
  config: string | null;  // JSON con campos especificos al tipo
  is_active: number;       // 0 o 1
  test_status: 'untested' | 'ok' | 'failed';
  last_tested: string | null;
  times_used: number;
  created_at: string;
  updated_at: string;
}
```

---

## Tipos de Conector

### 1. n8n Webhook (`n8n_webhook`)

Conecta con flujos de n8n via webhook HTTP. DoCatFlow envia un POST (u otro metodo) al webhook URL de n8n, que ejecuta un flujo automatizado.

**Campos de configuracion:**
| Campo | Tipo | Requerido | Descripcion |
|-------|------|-----------|-------------|
| `url` | text | Si | URL del webhook de n8n |
| `method` | select | No | POST, GET o PUT (default: POST) |
| `headers` | JSON | No | Headers adicionales |
| `timeout` | number | No | Timeout en segundos (default: 30) |

**Test:** Envia `{"test": true, "source": "docflow"}` al webhook URL. Exito si responde 2xx.

**Casos de uso:** Enviar email via n8n, crear tareas en Asana, notificar a Telegram, procesar datos externos.

### 2. HTTP API (`http_api`)

Conecta con cualquier API REST. Configuracion flexible para metodo, headers y body template.

**Campos de configuracion:**
| Campo | Tipo | Requerido | Descripcion |
|-------|------|-----------|-------------|
| `url` | text | Si | URL del endpoint |
| `method` | select | No | GET, POST, PUT, PATCH, DELETE (default: GET) |
| `headers` | JSON | No | Headers (ej: Authorization) |
| `body_template` | JSON | No | Template del body con placeholders `{{output}}` |

**Test:** Hace la peticion HTTP configurada. Exito si responde 2xx.

### 3. MCP Server (`mcp_server`)

Conecta con un servidor que implementa el Model Context Protocol (MCP). Protocolo estandar para que LLMs interactuen con herramientas externas.

**Campos de configuracion:**
| Campo | Tipo | Requerido | Descripcion |
|-------|------|-----------|-------------|
| `url` | text | Si | URL del servidor MCP |
| `name` | text | No | Nombre del servidor |
| `tools` | JSON | No | Lista de tools disponibles |

**Test:** GET al URL del servidor. Exito si responde.

**Nota:** Para el health check del sistema (`/api/health`), los servidores MCP se verifican con un POST JSON-RPC `initialize`.

### 4. Email (`email`)

Envia notificaciones por email. Puede funcionar via webhook de n8n o SMTP directo.

**Campos de configuracion:**
| Campo | Tipo | Requerido | Descripcion |
|-------|------|-----------|-------------|
| `url` | text | No | Webhook URL (n8n) |
| `smtp_host` | text | No | Host SMTP (ej: smtp.gmail.com) |
| `smtp_port` | number | No | Puerto SMTP (default: 587) |
| `from_address` | text | No | Email remitente |

**Test:** Valida que la configuracion exista (no envia email de prueba).

---

## Conectores Actuales

### LinkedIn Intelligence (LinkedIn MCP)

**Que hace:** Permite consultar datos de LinkedIn — perfiles de personas, empresas, ofertas de empleo y posts — a traves de un servidor MCP que usa un navegador headless con una sesion autenticada de LinkedIn.

**Tipo:** `mcp_server`

**ID en BD:** `seed-linkedin-mcp`

**Puerto / URL:** `http://{IP_SERVIDOR}:8765/mcp`

**Transporte:** Streamable HTTP (JSON-RPC sobre HTTP POST)

**Tools disponibles (6):**

| Tool | Descripcion | Limite/hora | Limite/dia |
|------|-------------|-------------|------------|
| `get_person_profile` | Perfil completo: experiencia, educacion, contacto, posts, recomendaciones | 10 | 30 |
| `search_people` | Buscar personas por query, lista paginada | 5 | 15 |
| `get_company_profile` | Perfil de empresa: industria, tamano, sede, empleos activos | 15 | 40 |
| `get_company_posts` | Posts recientes de empresa con metricas de engagement | 15 | 40 |
| `get_job_details` | Detalle completo de oferta de trabajo por URL | 15 | 40 |
| `search_jobs` | Buscar empleos con filtros: tipo, nivel, modalidad, fecha | 8 | 20 |
| **Total combinado** | | **30** | **80** |

#### Como se instala (paso a paso)

**Requisitos previos:**
- `uv` instalado: `curl -LsSf https://astral.sh/uv/install.sh | sh`
- `git` instalado
- Cuenta de LinkedIn dedicada (NO usar cuenta personal principal)

**Paso 1 — Ejecutar script de instalacion:**
```bash
cd ~/docflow
chmod +x scripts/linkedin-mcp/setup.sh
bash scripts/linkedin-mcp/setup.sh
```

El script hace lo siguiente:
1. Clona el repositorio `linkedin-mcp-server` en `~/docatflow-linkedin-mcp`
2. Aplica rebrand: elimina referencias al autor original, renombra paquete
3. Elimina archivos con atribucion (README.md, CONTRIBUTING.md, .github/)
4. Instala dependencias Python con `uv sync`
5. Instala navegador Chromium via `uv run patchright install chromium`
6. Copia `rate_limiter.py` a `~/.docatflow-linkedin-mcp/`
7. Instala servicio systemd del usuario con anti-deteccion
8. Arranca el servicio automaticamente

Si el directorio ya existe, solo actualiza dependencias (`uv sync`).

**Paso 2 — Autenticar LinkedIn:**
```bash
cd ~/docatflow-linkedin-mcp
uv run linkedin-mcp-server --login
```
Se abre un navegador. Iniciar sesion con la cuenta dedicada. La sesion se guarda en `~/.docatflow-linkedin-mcp/browser-data`.

**Paso 3 — Configurar variable de entorno en DoCatFlow:**

Editar `~/docflow/.env` y anadir (o descomentar):
```
LINKEDIN_MCP_URL=http://{IP_SERVIDOR}:8765/mcp
```
Donde `{IP_SERVIDOR}` es la IP del host (ej: `192.168.1.49`).

**Paso 4 — Rebuild Docker:**
```bash
cd ~/docflow
dfdeploy
```
O manualmente:
```bash
docker compose build --no-cache && docker compose up -d && docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && docker restart docflow-app
```

#### Variables de entorno necesarias

| Variable | Ejemplo | Donde se configura |
|----------|---------|-------------------|
| `LINKEDIN_MCP_URL` | `http://192.168.1.49:8765/mcp` | `~/docflow/.env` |

Esta es la unica variable necesaria. El servicio systemd gestiona sus propias variables de entorno internamente:
- `LINKEDIN_HEADLESS=true`
- `LINKEDIN_SLOW_MO=800` (milisegundos entre acciones, anti-deteccion)
- `LINKEDIN_TIMEOUT=15000`
- `LINKEDIN_USER_DATA_DIR=~/.docatflow-linkedin-mcp/browser-data`

#### Como se registra en DoCatFlow

Se registra automaticamente al arrancar la app via seed en `app/src/lib/db.ts`:

```sql
INSERT OR IGNORE INTO connectors
  (id, name, type, config, description, is_active, created_at, updated_at)
VALUES
  ('seed-linkedin-mcp', 'LinkedIn Intelligence', 'mcp_server', '{...}', '...', 1, ?, ?)
```

El seed es idempotente (INSERT OR IGNORE con ID fijo). La URL se toma de `LINKEDIN_MCP_URL` en el momento del seed; si la variable no esta definida, usa `http://localhost:8765/mcp` como fallback.

Tambien aparece automaticamente en:
- **Panel /system** — Tarjeta con estado, latencia y puerto (solo si `LINKEDIN_MCP_URL` esta configurado)
- **Footer** — Dot de estado del servicio (condicional)
- **CatBot** — Conoce el conector via `FEATURE_KNOWLEDGE` y lo menciona en su system prompt

#### Como verificar que funciona

**1. Servicio systemd:**
```bash
systemctl --user status docatflow-linkedin-mcp.service
# Debe mostrar "active (running)"
```

**2. Logs del servicio:**
```bash
journalctl --user -u docatflow-linkedin-mcp.service -f
```

**3. Test directo con curl:**
```bash
curl -X POST http://localhost:8765/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```
Debe responder con un JSON-RPC result (cualquier respuesta HTTP = servicio activo).

**4. Health check de DoCatFlow:**
```bash
curl http://localhost:3500/api/health?fresh=1 | jq '.linkedin_mcp'
# Debe mostrar: {"status": "connected", "configured": true, ...}
```

**5. Panel /system en la UI:**
Navegar a `/system` — debe aparecer tarjeta "LinkedIn MCP" con estado verde.

**6. Desde la pagina /conectores:**
Buscar "LinkedIn Intelligence" en la lista. Usar el boton de play para ejecutar test.

#### Troubleshooting comun

| Problema | Causa probable | Solucion |
|----------|---------------|----------|
| Servicio no arranca | `uv` no encontrado en PATH del servicio | Verificar que `~/.local/bin/uv` existe. Reinstalar uv. |
| "Offline" en /system pero servicio activo | Variable `LINKEDIN_MCP_URL` no configurada o Docker no rebuildeado | Verificar `.env`, hacer `dfdeploy` |
| Timeout en health check | Servicio lento al arrancar (Chromium) | Esperar 15-30s tras inicio. Timeout del health check es 3s. |
| Limite de rate alcanzado | Demasiadas consultas en la hora/dia | Esperar al siguiente periodo. Ver stats: `python ~/.docatflow-linkedin-mcp/rate_limiter.py` |
| Sesion de LinkedIn expirada | Cookies caducadas | Re-autenticar: `cd ~/docatflow-linkedin-mcp && uv run linkedin-mcp-server --login` |
| Error ECONNREFUSED | Servicio parado | `systemctl --user start docatflow-linkedin-mcp.service` |
| No aparece tarjeta en /system | `LINKEDIN_MCP_URL` no definido en .env | La tarjeta es condicional — solo se muestra si la variable existe |
| Estado en rate_state.json corrupto | Edicion manual o crash | Eliminar `~/.docatflow-linkedin-mcp/rate_state.json` — se recrea automaticamente |

#### Notas de seguridad / limitaciones

- **Cuenta dedicada obligatoria**: NUNCA usar la cuenta personal de LinkedIn. Crear una cuenta especifica para el servicio.
- **Anti-ban**: El rate limiter impone limites estrictos (30 llamadas/hora, 80/dia) y un delay aleatorio de 5-12 segundos entre cada llamada.
- **Anti-deteccion**: El servicio usa Patchright (fork de Playwright con proteccion anti-bot), headless mode, slow motion de 800ms.
- **Sin OAuth**: LinkedIn no ofrece API publica para estos datos. El servicio usa session cookies via navegador headless.
- **Datos sensibles**: La sesion de LinkedIn se guarda en `~/.docatflow-linkedin-mcp/browser-data`. Proteger este directorio.
- **Single-server**: El rate limiter es local (archivo JSON). No hay rate limiting distribuido.
- **Servicio del host**: Corre como servicio systemd del usuario en el host, NO dentro de Docker. DoCatFlow accede via HTTP a traves de `host.docker.internal` o IP directa.

#### Archivos del conector

| Archivo | Ubicacion | Proposito |
|---------|-----------|-----------|
| `setup.sh` | `scripts/linkedin-mcp/setup.sh` | Script de instalacion completo |
| `docatflow-linkedin-mcp.service` | `scripts/linkedin-mcp/` (template) | Unidad systemd con placeholders |
| `rate_limiter.py` | `scripts/linkedin-mcp/rate_limiter.py` → copiado a `~/.docatflow-linkedin-mcp/` | Limites anti-ban |
| `README.md` | `scripts/linkedin-mcp/README.md` | Instrucciones rapidas |
| Servicio instalado | `~/.config/systemd/user/docatflow-linkedin-mcp.service` | Unidad systemd activa |
| Codigo fuente MCP | `~/docatflow-linkedin-mcp/` | Servidor clonado y rebranded |
| Datos del navegador | `~/.docatflow-linkedin-mcp/browser-data/` | Sesion de LinkedIn |
| Estado rate limiter | `~/.docatflow-linkedin-mcp/rate_state.json` | Contadores de uso |

---

## Conectores Actuales (cont.)

### Conector Gmail

**Que hace:** Permite enviar emails reales a traves de cuentas Gmail (personal o Google Workspace) usando App Password o OAuth2. Los emails se pueden enviar desde Canvas, Tareas y CatBot.

**Tipo:** `gmail`

**Milestone:** v13.0 (Fases 50 + 51)

**Modos de Autenticacion:**

| Modo | Cuenta | Servidor SMTP | Puerto | Notas |
|------|--------|---------------|--------|-------|
| App Password (Personal) | Gmail personal | smtp.gmail.com | 587 | Requiere 2FA habilitado. Generar App Password en myaccount.google.com/apppasswords |
| App Password (Workspace) | Google Workspace | smtp-relay.gmail.com | 465 (TLS) | Admin debe habilitar SMTP relay en Google Admin Console. Transporter usa `name: dominio` para EHLO |
| OAuth2 (Workspace) | Google Workspace | smtp.gmail.com | 465 (secure) | Requiere proyecto en Google Cloud Console, Gmail API habilitada, credenciales OAuth2, pantalla de consentimiento configurada |

**Subtipos en BD (columna `gmail_subtype`):**
- `gmail_personal` — App Password con cuenta personal
- `gmail_workspace` — App Password con cuenta Workspace
- `gmail_workspace_oauth2` — OAuth2 con cuenta Workspace

#### Configuracion desde la UI

El conector Gmail se crea via un **Wizard de 4 pasos** (componente `gmail-wizard.tsx`):

1. **Seleccion de cuenta:** Cards clickables para Personal vs Workspace con iconos y descripciones
2. **Credenciales:** Formulario dinamico segun tipo de cuenta y modo de autenticacion
   - Personal: nombre remitente, email, App Password
   - Workspace App Password: nombre remitente, email, App Password, dominio, nota de smtp-relay
   - Workspace OAuth2: Client ID, Client Secret, boton "Generar URL", textarea para codigo de autorizacion, boton "Intercambiar"
3. **Test de conexion:** 3 lineas animadas de estado (Conectando SMTP..., Verificando autenticacion..., Enviando email de prueba...) con opciones de reintentar y saltar
4. **Confirmacion:** Tarjeta resumen con badge "Listo para usar" y snippets de uso para Canvas/Tareas/CatBot

El tipo Gmail aparece con **badge esmeralda** en la pagina `/conectores`. Al seleccionarlo, se abre un Dialog (no Sheet) con el wizard.

#### Uso desde Canvas/Tareas/CatBot

**Canvas:**
- Agregar nodo "Conector Gmail" al final del flujo
- El output del nodo previo se parsea como email:
  - JSON con campos `to`, `subject`, `body` (modo estructurado)
  - JSON sin estructura (se parsea heuristicamente)
  - Texto plano (primer linea = subject, resto = body, requiere `to` en config)
- Anti-spam: delay de 1s entre envios del mismo conector

**Tareas:**
- Seleccionar conector Gmail en un paso de tarea
- El executor invoca el conector con el output del paso previo

**CatBot:**
- Comando: "Envia un email usando [nombre del conector]"
- CatBot lista conectores disponibles con `list_email_connectors`
- CatBot **siempre confirma** con el usuario antes de enviar (requisito CATBOT-03)
- Tool `send_email` busca conector por nombre (exacto o LIKE fuzzy)
- Gated por permiso `send_emails` en getToolsForLLM

#### Fix: EHLO error 421 en Docker (Workspace)

En Docker, `os.hostname()` devuelve el container ID (ej: `abc123def456`). Google smtp-relay rechaza con `421 4.7.0 Try again later` si el EHLO no es un dominio valido.

**Solucion aplicada en `email-service.ts`** (caso `account_type === 'workspace'`):
```typescript
const workspaceDomain = config.user.split('@')[1] || 'gmail.com';
return nodemailer.createTransport({
  host: 'smtp-relay.gmail.com',
  port: 465,
  secure: true,
  name: workspaceDomain,  // Controla EHLO greeting
  auth: { user: config.user, pass: decryptedPassword },
});
```

El campo `name` de Nodemailer sobreescribe `os.hostname()` en el saludo EHLO. Al usar el dominio del email del usuario (ej: `educa360.es`), Google acepta la conexion.

#### Modal de ayuda en el Wizard (paso 2)

El paso 2 (Credenciales) incluye un icono `HelpCircle` que abre un modal con instrucciones detalladas:

**Gmail Personal (5 pasos):**
1. Activar verificacion en 2 pasos en myaccount.google.com → Seguridad
2. Ir a myaccount.google.com/apppasswords
3. Crear App Password con nombre "DoCatFlow"
4. Copiar los 16 caracteres (solo se muestra una vez)
5. Pegar en el campo App Password del wizard

**Google Workspace (8 pasos):**
1-3. App Password igual que personal
4. Entrar en admin.google.com como administrador
5. Ir a Aplicaciones → Google Workspace → Gmail → Enrutamiento → Servicio de relay SMTP → Configurar
6. Anadir IP publica del servidor (visible en logs de error como "Mail relay denied [IP]")
7. Marcar: Solo aceptar correo de IPs especificadas + Requerir autenticacion SMTP + Requerir cifrado TLS
8. Esperar 2-3 minutos de propagacion

**Advertencias:** App Password solo se muestra una vez, no usar contrasena principal, IP debe ser publica (no 192.168.x.x), cambios en relay SMTP tardan hasta 5 minutos.

**Estilo:** zinc-900 fondo, zinc-700 borde, tabs pill para Personal/Workspace, pasos con circulos violeta, links en cajas monospace, boton "Entendido" esmeralda.

#### Bugfixes del Wizard (sesion 21)

| Bug | Causa | Fix |
|-----|-------|-----|
| Test conexion siempre falla (paso 3) | Wizard leia `testData.success` pero API devuelve `{ ok: true }` | Cambiar a `testData.ok` |
| "user is required" al crear (paso 4) | Wizard enviaba `{ config: { user, ... } }` anidado | Cambiar `config,` → `...config,` para spread al nivel raiz |
| CatBrains no cargaban (paso 4 CatPaw) | Fetch parseaba `response.catbrains` pero API devuelve `{ data: [...] }` | Usar `response.data \|\| response.catbrains \|\| []` |
| Contadores mostraban (0) | Usaban `linkedX.length` (seleccionados) en vez de `availableX.length` | Mostrar total disponible |
| Label "Agentes" incorrecto | Renombrado a CatPaws no completado | Cambiar a "CatPaws" |

#### Troubleshooting (8 errores comunes)

| # | Error | Causa probable | Solucion |
|---|-------|---------------|----------|
| 1 | "Credenciales invalidas" | App Password incorrecta o expirada | Verificar en myaccount.google.com/apppasswords, generar nueva si es necesario |
| 2 | "No se pudo conectar al servidor SMTP" | Firewall bloqueando puerto 587/465 | Verificar reglas de red, confirmar que el puerto esta abierto desde el servidor Docker |
| 3 | "Tiempo de espera agotado" | Red lenta o SMTP bloqueado por ISP | Probar desde otra red, verificar que el ISP no bloquea SMTP saliente |
| 4 | "Error de certificado SSL" | Proxy corporativo interceptando TLS | Verificar configuracion de red, desactivar inspeccion SSL para smtp.gmail.com |
| 5 | "No se obtuvo refresh_token" | Acceso previo no revocado antes de re-autorizar | Revocar acceso en myaccount.google.com/permissions y reintentar el flujo OAuth2 |
| 6 | "Rate limit exceeded" | Limite diario alcanzado | Limites: 500/dia (personal), 2000/dia (workspace), 10000/dia (smtp-relay). Esperar 24h o usar smtp-relay |
| 7 | "Invalid grant" | Codigo de autorizacion expirado o ya usado | El codigo expira en minutos. Generar nueva URL y obtener codigo fresco |
| 8 | "Access denied" | Gmail API no habilitada o consent screen pendiente | Habilitar Gmail API en Google Cloud Console. Si consent screen dice "Testing", agregar usuario como test user |

#### Arquitectura

- **Cifrado de credenciales:** AES-256-GCM con clave derivada via `scryptSync` desde `CONNECTOR_SECRET` env var. Implementado en `app/src/lib/crypto.ts`
- **Anti-spam:** Delay de 1s entre envios del mismo conector (module-level Map en catbrain-connector-executor, simple delay en canvas-executor)
- **OAuth2 token refresh:** Nodemailer maneja la renovacion de access_token automaticamente usando el refresh_token almacenado. No se llama a `getAccessToken()` manualmente
- **Masking:** Las API routes GET nunca retornan credenciales en claro — solo versiones masked (`****`) o campos `*_encrypted`
- **Logs sanitizados:** Los connector_logs nunca contienen credenciales, solo metadata de la invocacion

#### Variables de entorno

| Variable | Requerida | Descripcion |
|----------|-----------|-------------|
| `CONNECTOR_SECRET` | Recomendada | Clave para cifrado AES-256-GCM. Si no existe, usa fallback para desarrollo |

#### API Endpoints especificos de Gmail

| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/connectors/gmail/test-credentials` | POST | Testear credenciales sin guardar conector |
| `/api/connectors/gmail/send-test-email` | POST | Enviar email de prueba a si mismo |
| `/api/connectors/gmail/oauth2/auth-url` | GET | Generar URL de autorizacion de Google |
| `/api/connectors/gmail/oauth2/exchange-code` | POST | Intercambiar codigo por refresh_token (cifrado) |

#### Instrucciones OAuth2 (referencia para wizard — OAUTH-04, OAUTH-05)

El wizard incluye instrucciones inline para configurar OAuth2 en Google Cloud Console:

1. Ir a console.cloud.google.com y crear un proyecto nuevo
2. Habilitar la Gmail API (APIs & Services → Library → Gmail API)
3. Configurar pantalla de consentimiento (OAuth consent screen) — tipo Internal si es Workspace
4. Crear credenciales OAuth2 (Credentials → Create → OAuth client ID → Desktop app)
5. Copiar Client ID y Client Secret al wizard
6. El wizard genera la URL de autorizacion, el usuario la abre en el navegador, autoriza, y pega el codigo de vuelta

#### Archivos clave del conector

| Archivo | Proposito |
|---------|-----------|
| `app/src/lib/crypto.ts` | encrypt/decrypt/isEncrypted (AES-256-GCM) |
| `app/src/lib/services/email-service.ts` | createTransporter, testConnection, sendEmail |
| `app/src/lib/types.ts` | GmailConfig, EmailPayload, GmailAuthMode, GmailAccountType |
| `app/src/components/connectors/gmail-wizard.tsx` | Wizard UI de 4 pasos |
| `app/src/app/connectors/page.tsx` | Integracion en pagina de conectores |
| `app/src/app/api/connectors/gmail/` | Endpoints especificos (test, send, oauth2) |
| `app/src/lib/services/catbot-tools.ts` | Tools send_email + list_email_connectors |

---

## Como crear un conector nuevo (desde la UI)

1. Navegar a **Conectores** en el sidebar (icono de enchufe)
2. Pulsar **"Nuevo conector"** (boton violeta arriba a la derecha)
3. Seleccionar el **tipo** de conector (n8n Webhook, HTTP API, MCP Server, Email)
4. Rellenar:
   - **Emoji**: icono representativo
   - **Nombre**: nombre descriptivo (obligatorio)
   - **Descripcion**: texto opcional
   - **Configuracion**: campos dinamicos segun el tipo seleccionado (URL, headers, timeout, etc.)
5. Pulsar **"Crear conector"**

**Plantillas sugeridas**: La pagina incluye 3 plantillas predefinidas (Email via n8n, Asana via n8n, Telegram via n8n) que pre-rellenan el formulario.

**Despues de crear:**
- Usar el boton **Play** para ejecutar un test de conexion
- Ver **logs** de invocaciones pasadas con el boton de documento
- **Activar/Desactivar** pulsando en el badge de estado
- **Editar** configuracion con el lapiz
- **Eliminar** con la papelera (pide confirmacion)

**Asociar a CatPaw o CatBrain:**
- Los CatPaws pueden tener conectores asociados via la tabla `cat_paw_connectors`
- Los CatBrains tienen conectores propios via `catbrain_connectors` (se gestionan desde la vista de detalle del CatBrain)

---

## Como crear un conector nuevo (seed en db.ts)

Para conectores que deben existir siempre en toda instalacion de DoCatFlow, se crean como seeds en `app/src/lib/db.ts`. Patron:

```typescript
// Seed [nombre] connector if not exists
try {
  const exists = (db.prepare(
    "SELECT COUNT(*) as c FROM connectors WHERE id = 'seed-mi-conector'"
  ).get() as { c: number }).c;

  if (exists === 0) {
    const miUrl = process['env']['MI_CONECTOR_URL'] || 'http://localhost:PUERTO';
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO connectors (id, name, type, config, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      'seed-mi-conector',      // ID fijo con prefijo "seed-"
      'Mi Conector',           // Nombre visible
      'mcp_server',            // Tipo
      JSON.stringify({
        url: miUrl,
        timeout: 30000,
        tools: [/* lista de tools */],
      }),
      'Descripcion del conector',
      now, now
    );
    logger.info('system', 'Seeded Mi Conector');
  }
} catch (e) {
  logger.error('system', 'Seed Mi Conector error', { error: (e as Error).message });
}
```

**Reglas del seed:**
- ID con prefijo `seed-` para identificar seeds vs. conectores creados por el usuario
- `INSERT OR IGNORE` para idempotencia (no falla si ya existe)
- Verificar `COUNT(*)` antes de insertar para poder hacer logging informativo
- URL tomada de variable de entorno con fallback a localhost
- Usar `process['env']['VARIABLE']` (bracket notation, NO `process.env.VARIABLE`)
- Try-catch para no romper el arranque si el seed falla
- Colocar despues de los seeds de CatPaws, antes de la seccion de cleanup

---

## Reglas generales y convenciones

### Codigo

- **Bracket notation para env vars**: Siempre `process['env']['VARIABLE']`, nunca `process.env.VARIABLE` (webpack inlining prevention)
- **API routes**: Exportar `export const dynamic = 'force-dynamic'` si leen variables de entorno
- **Limite de conectores**: 20 maximo, validado en POST `/api/connectors`
- **Truncar payloads en logs**: Maximo 5000 caracteres para `request_payload` y `response_payload`
- **Usage logs**: Insertar en background (no bloquear la respuesta)
- **IDs**: `uuid` para conectores creados por usuario, `seed-*` para seeds

### API REST de Conectores

| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/connectors` | GET | Listar todos los conectores |
| `/api/connectors` | POST | Crear conector (limite: 20) |
| `/api/connectors/[id]` | GET | Obtener un conector |
| `/api/connectors/[id]` | PATCH | Actualizar conector (name, description, emoji, config, is_active) |
| `/api/connectors/[id]` | DELETE | Eliminar conector (CASCADE en logs y accesos) |
| `/api/connectors/[id]/test` | POST | Ejecutar test de conexion |
| `/api/connectors/[id]/logs` | GET | Obtener ultimos 50 logs |
| `/api/connectors/for-agent/[agentId]` | GET | Conectores activos de un agente |

### Health monitoring

- El endpoint `/api/health` incluye un check para cada servicio que tenga variable de entorno configurada
- Para servicios MCP, el health check envia un POST JSON-RPC `initialize`
- Si el servicio responde (cualquier status HTTP), se considera **online**
- Si hay timeout (3s) o connection refused, se marca como **disconnected**
- Cache de 30 segundos (TTL). Forzar refresh con `?fresh=1`

### Condicionalidad

- Tarjeta en `/system` y dot en footer solo aparecen si la variable de entorno del servicio esta configurada
- CatBot menciona servicios opcionales (como LinkedIn MCP) solo si estan configurados
- El seed en `db.ts` se ejecuta siempre, pero la URL usa fallback a localhost si la variable no existe

### UI

- Todos los textos en espanol
- Colores por tipo: naranja (n8n), azul (HTTP API), violeta (MCP Server), esmeralda (Email)
- Color primario de la app: mauve (#8B6D8B), accents violet-500/600, fondo zinc-950

---

---

## Holded API — Critical Field Reference

Campos criticos descubiertos durante la auditoria v18.0 (phases 77-80). Referencia rapida para desarrollo y debugging.

| Modulo | Tool | Campo | Valor Correcto | Error Comun |
|--------|------|-------|-----------------|-------------|
| Time Tracking | holded_register_time | duration | Segundos (1h=3600, 8h=28800) | Enviar horas directas |
| Time Tracking | holded_register_time | userId | holdedUserId del empleado (GET /employees/{id}) | Usar el id interno |
| Time Tracking | holded_register_time | costHour | Requerido, puede ser 0 | Omitirlo |
| Timesheets | holded_create_timesheet | startTmp/endTmp | Unix timestamp string (ej: '1742205600') | Enviar HH:MM |
| Timesheets | holded_create_timesheet | timezone | Europe/Madrid (CET +1 / CEST +2) | Asumir UTC |
| CRM | holded_create_lead_note | title | Requerido | Usar campo "text" |
| CRM | holded_create_lead_note | desc | Opcional (cuerpo de la nota) | Usar campo "text" |
| CRM | holded_create_lead | stageId | Passthrough directo (no transformar) | — |
| Contacts | holded_search_contact | — | Client-side filtering (API no filtra por nombre) | Esperar filtro server-side |
| Deletes | Todos (14 tools) | — | requestDelete() + email confirmation | DELETE directo |

### Protocolo de Resolucion de Entidades

Antes de operar sobre cualquier entidad Holded: Listar/Buscar -> Identificar (desambiguar si varios) -> Retener ID -> Ejecutar.

### Safe Delete Flow

1. Tool de eliminacion llama `requestDelete()` con recurso y callback
2. Sistema genera token unico + envia email HTML al admin
3. Email contiene boton Confirmar y boton Cancelar
4. Solo al confirmar se ejecuta el DELETE real en la API de Holded
5. Token expira en 24h. Tokens usados o expirados muestran error

---

*Documentacion generada: 2026-03-16 — Actualizada: 2026-03-24*
*Basada en: v13.0 (Gmail Connector + OAuth2 + CatBot + EHLO fix + Wizard bugfixes) + v11.0 (LinkedIn MCP) + sistema de conectores de v3.0 + v18.0 (Holded API Auditoria + Safe Deletes)*
