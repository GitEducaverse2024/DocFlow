# Requirements: DoCatFlow v13.0 — Conector Gmail

**Defined:** 2026-03-16
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.

## v1 Requirements

Requirements for v13.0 milestone. Each maps to roadmap phases 50-51.

### EmailService y Dependencias

- [x] **EMAIL-01**: Instalar dependencias nodemailer, @types/nodemailer y googleapis en app/package.json
- [x] **EMAIL-02**: Utilidad de cifrado src/lib/crypto.ts con encrypt/decrypt/isEncrypted usando AES-256-GCM y clave derivada de CONNECTOR_SECRET
- [x] **EMAIL-03**: EmailService en src/lib/services/email-service.ts con createTransporter, sendEmail y testConnection para App Password y OAuth2
- [x] **EMAIL-04**: Tipos TypeScript GmailConfig, EmailPayload, GmailAuthMode y GmailAccountType en src/lib/types.ts
- [x] **EMAIL-05**: Variable CONNECTOR_SECRET documentada en .env.template con instrucciones de generacion
- [x] **EMAIL-06**: Migracion de columna gmail_subtype TEXT nullable en tabla connectors

### API Endpoints Gmail

- [x] **EMAIL-07**: POST /api/connectors/gmail/test-credentials para test sin guardar, devuelve {ok, error?}
- [x] **EMAIL-08**: POST /api/connectors/gmail/send-test-email para enviar email de prueba a la misma direccion configurada
- [x] **EMAIL-09**: Extender POST /api/connectors para tipo gmail con cifrado de campos sensibles antes de guardar
- [x] **EMAIL-10**: Extender PATCH /api/connectors/[id] para tipo gmail con re-cifrado parcial de campos actualizados
- [x] **EMAIL-11**: Extender /api/connectors/[id]/test para tipo gmail llamando testConnection del EmailService
- [x] **EMAIL-12**: POST /api/connectors/[id]/invoke para tipo gmail parsea output como EmailPayload y llama sendEmail

### Integracion Executor

- [ ] **EMAIL-13**: Nuevo caso 'gmail' en catbrain-connector-executor.ts que despacha a executeGmailConnector
- [ ] **EMAIL-14**: Funcion executeGmailConnector que parsea output del nodo previo (JSON con to/subject/body, texto plano, o JSON sin campos email) y envia email
- [ ] **EMAIL-15**: Delay anti-spam de 1 segundo entre envios del mismo conector gmail en el executor

### OAuth2 Workspace

- [ ] **OAUTH-01**: GET /api/connectors/gmail/oauth2/auth-url genera URL de autorizacion Google con redirect OOB y scope mail.google.com
- [ ] **OAUTH-02**: POST /api/connectors/gmail/oauth2/exchange-code intercambia codigo por refresh_token cifrado, nunca devuelve client_secret
- [ ] **OAUTH-03**: Subtipo gmail_workspace_oauth2 en GmailConfig con auth_mode oauth2 + account_type workspace
- [ ] **OAUTH-04**: Pantalla OAuth2 en el wizard con flow guiado (pegar URL, copiar codigo, intercambiar)
- [ ] **OAUTH-05**: Instrucciones inline del setup Google Cloud Console en el wizard (crear proyecto, habilitar Gmail API, crear credencial OAuth2)

### CatBot Tools

- [ ] **CATBOT-01**: Tool send_email en catbot-tools.ts que busca conector gmail por nombre y llama /api/connectors/[id]/invoke
- [ ] **CATBOT-02**: Tool list_email_connectors en catbot-tools.ts que devuelve lista de conectores gmail activos
- [ ] **CATBOT-03**: System prompt de CatBot actualizado con seccion de envio de email y confirmacion antes de enviar

### Wizard UI

- [ ] **UI-01**: Tipo gmail en el selector de tipo de conector en /conectores con badge esmeralda
- [ ] **UI-02**: Componente gmail-wizard.tsx con wizard de 4 pasos (tipo, credenciales, test, confirmacion) y barra de progreso
- [ ] **UI-03**: Paso 1 del wizard: selector de tipo de cuenta (Gmail Personal vs Google Workspace) con tarjetas clickables
- [ ] **UI-04**: Paso 2A del wizard: formulario App Password para Gmail Personal (nombre, email, password, remitente) con instrucciones
- [ ] **UI-05**: Paso 2B del wizard: formulario App Password para Workspace con campo dominio adicional y texto smtp-relay
- [ ] **UI-06**: Paso 2C del wizard: toggle OAuth2 en paso 2B con campos Client ID, Client Secret, boton generar URL, campo codigo
- [ ] **UI-07**: Paso 3 del wizard: test de conexion con 3 lineas de estado animadas (SMTP, auth, email prueba)
- [ ] **UI-08**: Paso 4 del wizard: confirmacion con resumen, badge "Listo para usar" y snippets de uso desde Canvas/Tareas/CatBot
- [ ] **UI-09**: Conector gmail en lista de conectores con badge esmeralda, cuenta como subtitulo, acciones Test/Editar/Logs/Activar/Eliminar

### Documentacion

- [ ] **DOC-01**: Seccion "Conector Gmail" en CONNECTORS.md con modos de auth, troubleshooting de 8 errores, uso desde Canvas/Tareas/CatBot
- [ ] **DOC-02**: Tipo 'gmail' anadido al union type de Connector en types.ts
- [ ] **DOC-03**: Archivo progressSesion19.md documentando milestone v13.0 completo

### Tests

- [ ] **TEST-01**: Tests E2E para flujo Gmail App Password (wizard 4 pasos, credenciales, badge en lista)
- [ ] **TEST-02**: Tests E2E para flujo Gmail OAuth2 (auth URL, instrucciones OOB, exchange code)
- [ ] **TEST-03**: Tests E2E para integracion Canvas (nodo CONNECTOR gmail ejecuta, parseo output, rate limit)
- [ ] **TEST-04**: Tests E2E para integracion CatBot (listar conectores, confirmar antes de enviar, invoke)
- [ ] **TEST-05**: Tests API para CRUD gmail (cifrado app_password, mascarado campos sensibles, invoke con payload)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Adjuntos en emails | MVP sin adjuntos, arquitectura preparada para futuro |
| Proveedores SMTP no-Gmail (Outlook, Yahoo) | Solo Gmail para v13.0, extensible despues |
| Envio masivo / email marketing | DoCatFlow es herramienta interna, no plataforma de marketing |
| IMAP / lectura de emails | Solo envio para v13.0 |
| Templates HTML predefinidos | El contenido viene del CatBrain/Canvas/Tareas |
| OAuth2 para Gmail Personal | Solo App Password para personal (OAuth2 solo Workspace) |
| Rate limiter distribuido | Single-server, Map en memoria suficiente |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| EMAIL-01 | Phase 50 | Complete |
| EMAIL-02 | Phase 50 | Complete |
| EMAIL-03 | Phase 50 | Complete |
| EMAIL-04 | Phase 50 | Complete |
| EMAIL-05 | Phase 50 | Complete |
| EMAIL-06 | Phase 50 | Complete |
| EMAIL-07 | Phase 50 | Complete |
| EMAIL-08 | Phase 50 | Complete |
| EMAIL-09 | Phase 50 | Complete |
| EMAIL-10 | Phase 50 | Complete |
| EMAIL-11 | Phase 50 | Complete |
| EMAIL-12 | Phase 50 | Complete |
| EMAIL-13 | Phase 50 | Pending |
| EMAIL-14 | Phase 50 | Pending |
| EMAIL-15 | Phase 50 | Pending |
| OAUTH-01 | Phase 51 | Pending |
| OAUTH-02 | Phase 51 | Pending |
| OAUTH-03 | Phase 51 | Pending |
| OAUTH-04 | Phase 51 | Pending |
| OAUTH-05 | Phase 51 | Pending |
| CATBOT-01 | Phase 51 | Pending |
| CATBOT-02 | Phase 51 | Pending |
| CATBOT-03 | Phase 51 | Pending |
| UI-01 | Phase 51 | Pending |
| UI-02 | Phase 51 | Pending |
| UI-03 | Phase 51 | Pending |
| UI-04 | Phase 51 | Pending |
| UI-05 | Phase 51 | Pending |
| UI-06 | Phase 51 | Pending |
| UI-07 | Phase 51 | Pending |
| UI-08 | Phase 51 | Pending |
| UI-09 | Phase 51 | Pending |
| DOC-01 | Phase 51 | Pending |
| DOC-02 | Phase 51 | Pending |
| DOC-03 | Phase 51 | Pending |
| TEST-01 | Phase 51 | Pending |
| TEST-02 | Phase 51 | Pending |
| TEST-03 | Phase 51 | Pending |
| TEST-04 | Phase 51 | Pending |
| TEST-05 | Phase 51 | Pending |

**Coverage:**
- v1 requirements: 40 total
- Mapped to phases: 40
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-16*
*Last updated: 2026-03-16 after initial definition*
