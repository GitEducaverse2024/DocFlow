# Sesion 19 — v13.0 Conector Gmail

**Fecha:** 2026-03-16
**Milestone:** v13.0 Conector Gmail — envio de email real via Gmail con App Password/OAuth2, wizard UI, CatBot tools
**Estado:** COMPLETADO (2 fases, 8 planes, ~35 requisitos)

---

## Resumen

Milestone completo. Se implemento el sistema completo de envio de emails via Gmail: servicio de email con Nodemailer, cifrado de credenciales con AES-256-GCM, API REST para Gmail (CRUD, test, invoke, OAuth2), wizard UI de 4 pasos, herramientas CatBot para enviar emails via chat, documentacion completa, y tests E2E/API. Desde la perspectiva del usuario, se puede configurar un conector Gmail (App Password o OAuth2) via wizard, enviar emails desde Canvas/Tareas, y pedir a CatBot que envie emails con confirmacion previa.

---

## Fase 50: EmailService + Gmail App Password (EMAIL-01..15)

**Planes:** 3/3 completados | **Requisitos:** 15/15

### Plan 50-01: Crypto + EmailService + Types
- Dependencias: `nodemailer`, `@types/nodemailer`, `googleapis`
- `crypto.ts`: encrypt/decrypt/isEncrypted con AES-256-GCM, scryptSync para derivar clave desde CONNECTOR_SECRET
- `email-service.ts`: createTransporter (App Password + OAuth2 skeleton), testConnection, sendEmail
- `types.ts`: GmailConfig, EmailPayload, GmailAuthMode, GmailAccountType, Connector type union con 'gmail'
- DB migration: columna `gmail_subtype` en tabla connectors

### Plan 50-02: Gmail API Endpoints
- POST `/api/connectors/gmail/test-credentials` — testear sin guardar
- POST `/api/connectors/gmail/send-test-email` — enviar email de prueba a si mismo
- POST `/api/connectors/[id]/invoke` — ejecucion en pipeline con 3 estrategias de parseo
- CRUD extensions: POST create con cifrado, GET con masking, PATCH con re-cifrado
- maskGmailConfig helper para sanitizar respuestas API
- Logs sanitizados (nunca contienen credenciales)

### Plan 50-03: Executor Integration
- `catbrain-connector-executor.ts`: invocar conector Gmail desde CatBrains
- `canvas-executor.ts`: nodo Conector Gmail en canvas visual
- `parseOutputToEmailPayload`: parseo de output del nodo previo a EmailPayload
- Anti-spam: module-level Map con delay 1s entre envios del mismo conector
- Fire-and-forget: el nodo Gmail retorna predecessorOutput (pipeline continua)

---

## Fase 51: OAuth2 + Wizard + CatBot + Tests (OAUTH-01..05, CATBOT-01..03, UI-01..09, DOC-01..03, TEST-01..05)

**Planes:** 5/5 completados | **Requisitos:** ~20

### Plan 51-01: OAuth2 API Routes
- GET `/api/connectors/gmail/oauth2/auth-url` — genera URL de autorizacion de Google (OOB redirect)
- POST `/api/connectors/gmail/oauth2/exchange-code` — intercambia codigo por refresh_token, cifra con AES-256-GCM
- Fix: Nodemailer maneja OAuth2 token refresh nativamente (eliminado getAccessToken manual)
- smtp.gmail.com:465 (secure) para transporte OAuth2

### Plan 51-02: CatBot Email Tools
- Tool `list_email_connectors`: lista conectores Gmail activos con id, nombre, tipo de cuenta, modo auth
- Tool `send_email`: busca conector por nombre (exacto o LIKE), invoca endpoint, gated por permiso `send_emails`
- System prompt actualizado: seccion "Envio de Email" con confirmacion obligatoria antes de enviar

### Plan 51-03: Gmail Wizard UI
- Componente `gmail-wizard.tsx` (~930 lineas) con 4 pasos:
  - Paso 1: Seleccion cuenta (Personal vs Workspace) con cards clickables
  - Paso 2A/2B: Formulario App Password (Personal/Workspace)
  - Paso 2C: Flujo OAuth2 inline (Client ID/Secret, generar URL, pegar codigo, intercambiar)
  - Paso 3: Test de conexion con 3 lineas animadas de estado
  - Paso 4: Confirmacion con badge "Listo para usar" y snippets de uso
- Badge esmeralda para tipo Gmail en pagina /conectores
- GmailSubtitle muestra tipo de cuenta y email en lista de conectores
- Dialog (no Sheet) para wizard

### Plan 51-04: E2E y API Tests
- Tests E2E para wizard App Password y OAuth2
- Tests E2E para integracion Canvas y CatBot
- Tests API para CRUD con cifrado/masking

### Plan 51-05: Documentacion
- CONNECTORS.md actualizado con seccion completa "Conector Gmail"
- progressSesion19.md (este archivo) documentando v13.0

---

## Decisiones clave del milestone

| Decision | Razon |
|----------|-------|
| AES-256-GCM con scryptSync para cifrado | Estandar robusto, clave derivada de CONNECTOR_SECRET env var |
| OAuth2 OOB flow (urn:ietf:wg:oauth:2.0:oob) | Apps self-hosted sin redirect URL publica |
| Wizard como Dialog (no Sheet) | Flujo guiado de multiples pasos, mas enfocado que panel lateral |
| CatBot confirma antes de enviar | Seguridad: evitar envios accidentales via chat |
| Anti-spam: delay 1s entre envios | Prevenir rate limits de Gmail, simple y efectivo |
| Nodemailer maneja OAuth2 refresh nativamente | Elimina dependencia de googleapis en runtime de envio |
| smtp.gmail.com:465 (secure) para OAuth2 | Mas robusto que service shorthand para OAuth2 transport |
| LIKE fallback para busqueda de conector en CatBot | Tolerancia a errores de tipeo del usuario |

---

## Requisitos entregados

### Fase 50 (EMAIL-01..15)
- EMAIL-01: Servicio de email con Nodemailer
- EMAIL-02..05: Configuracion SMTP (personal, workspace, OAuth2 skeleton, auto-deteccion)
- EMAIL-06..08: API endpoints (test-credentials, send-test-email, invoke)
- EMAIL-09..11: CRUD con cifrado y masking
- EMAIL-12..13: Executor integration (CatBrain, Canvas)
- EMAIL-14: Anti-spam delay
- EMAIL-15: DB migration gmail_subtype

### Fase 51
- OAUTH-01..03: OAuth2 API (auth-url, exchange-code, subtype)
- OAUTH-04..05: Instrucciones OAuth2 en wizard
- CATBOT-01..03: Tools email + system prompt
- UI-01..09: Wizard completo + badge + integracion
- DOC-01..03: Documentacion CONNECTORS.md + progressSesion19
- TEST-01..05: E2E + API tests

---

## Estadisticas del milestone

| Metrica | Valor |
|---------|-------|
| Fases completadas | 2/2 (50 + 51) |
| Planes ejecutados | 8/8 (3 + 5) |
| Requisitos verificados | ~35 |
| Archivos nuevos | ~15 |
| Archivos modificados | ~12 |

---

## Archivos clave del milestone

| Archivo | Descripcion |
|---------|-------------|
| `app/src/lib/crypto.ts` | Cifrado AES-256-GCM (encrypt/decrypt/isEncrypted) |
| `app/src/lib/services/email-service.ts` | createTransporter, testConnection, sendEmail |
| `app/src/lib/types.ts` | GmailConfig, EmailPayload, tipos Gmail |
| `app/src/components/connectors/gmail-wizard.tsx` | Wizard UI 4 pasos (~930 lineas) |
| `app/src/app/connectors/page.tsx` | Integracion wizard + badge esmeralda |
| `app/src/app/api/connectors/gmail/` | Endpoints test/send/oauth2 |
| `app/src/app/api/connectors/route.ts` | CRUD con cifrado Gmail |
| `app/src/lib/services/catbot-tools.ts` | Tools send_email + list_email_connectors |
| `app/src/app/api/catbot/chat/route.ts` | System prompt con seccion email |
| `.planning/CONNECTORS.md` | Documentacion completa del conector |
