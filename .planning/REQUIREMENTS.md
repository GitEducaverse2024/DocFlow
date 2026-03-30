# Requirements: v22.0 CatBot en Telegram

**Defined:** 2026-03-30
**Core Value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.

## v22.0 Requirements

Exponer CatBot como bot de Telegram con long polling, sistema sudo adaptado, wizard de configuracion en Settings, y seguridad multicapa. CatBot completo en el movil sin construir nada nuevo — solo un canal de entrada mas al mismo motor.

### DB -- Modelo de datos

- [x] **DB-01**: Tabla `telegram_config` con: token_encrypted, bot_username, status (active/paused/inactive), authorized_usernames (JSON array), authorized_chat_ids (JSON array), permissions_no_sudo (JSON array), messages_count, last_message_at, created_at, updated_at
- [x] **DB-02**: Token cifrado con AES-256-GCM usando crypto.ts existente (misma funcion que Gmail)
- [x] **DB-03**: Estado inicial: inactive (hasta que se configure via wizard)

### SVC -- TelegramBotService

- [x] **SVC-01**: Singleton instanciado en instrumentation.ts (mismo patron que DrivePollingService)
- [x] **SVC-02**: Long polling con getUpdates (timeout=25s), no webhooks — funciona detras de NAT
- [x] **SVC-03**: Procesa un mensaje a la vez para evitar respuestas solapadas
- [x] **SVC-04**: Si Telegram devuelve error, espera 10s y reintenta con withRetry existente
- [x] **SVC-05**: Se puede pausar/reanudar via API sin reiniciar servidor
- [x] **SVC-06**: Arranca automaticamente si hay token configurado y status='active'
- [x] **SVC-07**: Verifica whitelist de usuarios autorizados por chat_id antes de procesar
- [x] **SVC-08**: Mensaje /start responde con bienvenida explicando capacidades del bot
- [x] **SVC-09**: Respuestas largas (>4096 chars) divididas en mensajes consecutivos

### SUDO -- Sistema sudo en Telegram

- [x] **SUDO-01**: Comando /sudo {clave} activa sesion sudo para el chat_id
- [x] **SUDO-02**: Misma clave scrypt que la web (settings catbot_sudo)
- [x] **SUDO-03**: Sesion almacenada en memoria Map<chat_id, expires_at> con TTL configurable
- [x] **SUDO-04**: Tras activacion, eliminar el mensaje /sudo via deleteMessage API (no exponer clave)
- [x] **SUDO-05**: 5 intentos fallidos = bloqueo 15 minutos para ese chat_id
- [x] **SUDO-06**: Cuando CatBot detecta operacion protegida sin sudo, responde pidiendo /sudo

### INT -- Integracion con CatBot

- [x] **INT-01**: TelegramBotService llama a /api/catbot/chat con channel='telegram' y sudo_active=boolean
- [x] **INT-02**: El endpoint acepta channel y sudo_active en el body/contexto
- [x] **INT-03**: Cuando channel='telegram', system prompt incluye instruccion de respuestas concisas
- [x] **INT-04**: Botones de navegacion se convierten en texto con ruta
- [x] **INT-05**: Tool_calls se muestran como texto con emoji
- [x] **INT-06**: Markdown adaptado al formato Telegram (negrita, cursiva, codigo)

### API -- Endpoints nuevos

- [ ] **API-01**: GET /api/telegram/config — devuelve config (sin token en claro)
- [ ] **API-02**: POST /api/telegram/config — guarda token cifrado + config inicial (requiere sudo)
- [ ] **API-03**: PATCH /api/telegram/config — actualiza permisos, usuarios, estado
- [ ] **API-04**: POST /api/telegram/test — verifica token contra Telegram API, devuelve bot info
- [ ] **API-05**: POST /api/telegram/pause — pausa el polling sin borrar config
- [ ] **API-06**: POST /api/telegram/resume — reanuda el polling

### UI -- Settings

- [ ] **UI-01**: Seccion "Canales externos" en /settings despues de la seccion CatBot
- [ ] **UI-02**: Card de Telegram con estado, username del bot, contador de mensajes
- [ ] **UI-03**: Wizard de 3 pasos (solo primera vez): Token → Acceso → Test conexion
- [ ] **UI-04**: Paso 1: input de token con texto de ayuda sobre @BotFather (requiere sudo)
- [ ] **UI-05**: Paso 2: radio cualquier usuario vs whitelist + selector de permisos sin sudo
- [ ] **UI-06**: Paso 3: test de conexion con Telegram API, muestra bot info, inicia polling
- [ ] **UI-07**: Botones: Probar conexion, Pausar/Reanudar, Desactivar
- [ ] **UI-08**: Gestion de usuarios autorizados (anadir/eliminar @usernames)

### SYS -- Indicadores del sistema

- [ ] **SYS-01**: Dot de estado en footer: verde (polling activo), amarillo (pausado), rojo (error) — solo si configurado
- [ ] **SYS-02**: Card en /system con: estado polling, ultimo mensaje, mensajes totales

### I18N -- Internacionalizacion

- [ ] **I18N-01**: Claves de seccion: telegram.title, telegram.description (es + en)
- [ ] **I18N-02**: Claves de estado: telegram.status.active/paused/inactive (es + en)
- [ ] **I18N-03**: Claves de wizard: telegram.wizard.step1/2/3 con titulos y ayuda (es + en)
- [ ] **I18N-04**: Claves de test: telegram.test.connecting/success/failed (es + en)
- [ ] **I18N-05**: Claves de sudo Telegram: telegram.sudo.request/granted/denied/blocked (es + en)
- [ ] **I18N-06**: Claves de mensajes bot: telegram.welcome, telegram.unauthorized (es + en)

### BUILD -- Verificacion

- [ ] **BUILD-01**: `npm run build` pasa sin errores
- [ ] **BUILD-02**: Ambos idiomas (es/en) funcionan correctamente

## Out of Scope

| Feature | Reason |
|---------|--------|
| Webhooks de Telegram | Requiere IP publica, servidor es local/NAT |
| WhatsApp / Web Widget | Solo Telegram en v22.0 |
| Bot por CatPaw individual | CatBot centralizado es mas potente |
| Mensajes multimedia (fotos, audio) | Solo texto en v22.0 |
| Inline queries de Telegram | Complejidad innecesaria para v22.0 |
| Persistencia de historial Telegram en DB | Usa historial en memoria por sesion |
| Cambios en tools de CatBot | Se reutilizan las existentes sin modificacion |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01..03 | Phase 95 | Pending |
| SVC-01..09 | Phase 95 | Pending |
| SUDO-01..06 | Phase 96 | Complete |
| INT-01..06 | Phase 96 | Complete |
| API-01..06 | Phase 97 | Pending |
| UI-01..08 | Phase 97 | Pending |
| SYS-01..02 | Phase 97 | Pending |
| I18N-01..06 | Phase 98 | Pending |
| BUILD-01..02 | Phase 98 | Pending |

**Coverage:**
- v22.0 requirements: 50 total
- Mapped to phases: 50
- Unmapped: 0

---
*Requirements defined: 2026-03-30*
