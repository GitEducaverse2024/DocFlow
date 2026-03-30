# Sesion 29 — Milestone v22.0 CatBot en Telegram + Mejoras Canvas + Arquitecto de Agentes

**Fecha:** 2026-03-30
**Milestones:** v22.0 CatBot en Telegram (fases 95-98), mejoras transversales
**Estado:** COMPLETADO

---

## Resumen

Sesion triple: (1) Skill "Arquitecto de Agentes" para CatBot, (2) milestone v22.0 completo — CatBot accesible desde Telegram con sudo, wizard en Settings y seguridad multicapa, (3) visibilidad de ejecucion de Canvas desde fuentes externas, (4) tres bugfixes criticos de produccion.

---

## Feature: Arquitecto de Agentes (pre-milestone)
**Commit:** `cad4891`

- Nueva tool `list_skills` para que CatBot consulte el catalogo completo de skills
- Tool `list_cat_paws` mejorada: incluye `department` y `linked_skills` para evaluar reutilizacion
- Skill seed "Arquitecto de Agentes" con protocolo de 5 pasos:
  1. Buscar agentes existentes (80%+ match → proponer reutilizacion)
  2. Consultar catalogo de skills para recomendar
  3. Disenar configuracion optima (departamento, modo, temperatura)
  4. Confirmar con usuario antes de crear
  5. Crear CatPaw + vincular skills
- Inyectada siempre en system prompt de CatBot (como Orquestador CatFlow)
- CatBot NUNCA crea un agente sin antes mostrar alternativas existentes

---

## Milestone v22.0 — CatBot en Telegram (4 fases, 50 requirements)

### Phase 95: DB + TelegramBotService base (12 reqs)
**Commits:** `f5b52bc`, `ecd9e01`

- Tabla `telegram_config` con token cifrado AES-256-GCM, estado, whitelist, permisos
- Singleton TelegramBotService con long polling (getUpdates timeout=25s)
- Procesamiento secuencial un mensaje a la vez
- Retry con backoff 10s en errores
- Whitelist de usuarios por chat_id o @username
- /start con mensaje de bienvenida
- Respuestas largas divididas en chunks de 4096 chars
- Retry de Markdown fallando a texto plano
- Arranque automatico desde instrumentation.ts si token activo

### Phase 96: Integracion CatBot + sistema sudo (12 reqs)
**Commits:** `4d868a9`, `417138b`, `d09d51f`

- Llamada interna a /api/catbot/chat con `channel='telegram'` y `sudo_active`
- Endpoint de CatBot acepta `channel` y `sudo_active` en body
- System prompt incluye instruccion de respuestas concisas cuando canal es Telegram
- Comando /sudo {clave}: validacion scrypt contra misma clave que la web
- Sesiones sudo en memoria Map<chat_id, expires_at> con TTL configurable
- Borrado del mensaje /sudo via Telegram deleteMessage API
- 5 intentos fallidos = bloqueo 15 minutos por chat_id
- Deteccion de operacion protegida → responde pidiendo /sudo
- Adaptacion de respuestas: HTML a Markdown, acciones a texto, emojis

### Phase 97: UI Settings + API + indicadores (16 reqs)
**Commits:** `f74b51f`, `2947696`, `4b97404`, `a7a52f9`

- 4 endpoints API: GET/POST/PATCH/DELETE /api/telegram/config + test + pause + resume
- Seccion "Canales externos" en /settings con card de estado
- Wizard de 3 pasos (solo primera vez): Token → Acceso → Test conexion
- Gestion de usuarios autorizados y permisos sin sudo
- Botones: Probar conexion, Pausar/Reanudar, Desactivar
- Dot de estado en footer (verde/amarillo/rojo)
- Card en /system con estado polling, ultimo mensaje, mensajes totales

### Phase 98: i18n + build + verificacion (8 reqs)
**Commit:** `30aad85`

- 40+ claves i18n bajo settings.telegram (es + en)
- Claves: titulo, estados, wizard, test, sudo, bienvenida, permisos, acciones

---

## Feature: Canvas Active Run Visibility
**Commit:** `b3f434b`

Cuando un canvas se ejecuta desde Telegram (o cualquier fuente externa), ahora es visible en la UI:

**Cambio 1 — Badge en lista /canvas:**
- GET /api/canvas devuelve `active_run: { run_id, status, started_at }` por canvas
- CanvasCard muestra badge pulsante: violet "En ejecucion" / amber "En espera"

**Cambio 2 — Auto-reconexion en editor:**
- Nuevo endpoint: GET /api/canvas/[id]/active-run
- El editor detecta run activo al montar y arranca polling automaticamente
- Patron schedulePollRef para conectar el efecto mount con el callback

---

## Bugfixes de produccion

### Fix 1: Permission gate para Telegram
**Commit:** `d402c1b`

El bot ejecutaba Canvas sin pedir sudo aunque "Ejecutar Canvas" no estuviera en permisos sin sudo. Solucion: deteccion de intencion pre-call con regex por operacion (execute_canvas, create_resources, send_emails) contra permissions_no_sudo de telegram_config.

### Fix 2: Hardening del permission gate
**Commit:** `39d2566`

checkPermissionGate() podia crashear el flujo completo. Solucion: try-catch independiente que falla seguro a sudo (pide /sudo en vez de romper). Guard null/tipo en permissions_no_sudo.

### Fix 3: Auto-restart del poll loop
**Commit:** `e03c740`

Si pollLoop() crasheaba, el servicio moria permanentemente. Solucion: auto-restart tras 5s en el .catch() handler. Heartbeat log cada ~100 ciclos para visibilidad en /testing.

### Fix 4: instrumentationHook en next.config.js
**Commit:** `1605fae`

Causa raiz del bot muerto tras Docker rebuild: `next.config.js` (el archivo real — no `.mjs`) no tenia `experimental.instrumentationHook: true`. Sin esto, Next.js 14 ignora src/instrumentation.ts completamente. Ni taskScheduler, ni DrivePolling, ni Telegram arrancaban.

---

## Archivos clave creados/modificados

| Archivo | Cambios |
|---------|---------|
| `app/src/lib/services/telegram-bot.ts` | NUEVO — servicio completo (polling, sudo, CatBot, permisos, auto-restart) |
| `app/src/app/api/telegram/config/route.ts` | NUEVO — CRUD config con token cifrado |
| `app/src/app/api/telegram/test/route.ts` | NUEVO — verificacion token contra Telegram API |
| `app/src/app/api/telegram/pause/route.ts` | NUEVO — pausar polling |
| `app/src/app/api/telegram/resume/route.ts` | NUEVO — reanudar polling |
| `app/src/app/api/canvas/[id]/active-run/route.ts` | NUEVO — detectar run activo |
| `app/src/app/api/canvas/route.ts` | active_run field en GET response |
| `app/src/app/api/catbot/chat/route.ts` | channel + sudo_active + Telegram system prompt |
| `app/src/app/settings/page.tsx` | Seccion Canales externos + wizard 3 pasos |
| `app/src/components/canvas/canvas-card.tsx` | Badge pulsante active_run |
| `app/src/components/canvas/canvas-editor.tsx` | Auto-reconnect polling |
| `app/src/components/layout/footer.tsx` | Dot Telegram |
| `app/src/components/system/system-health-panel.tsx` | Card Telegram |
| `app/src/lib/services/catbot-tools.ts` | list_skills tool + list_cat_paws mejorado + Arquitecto skill |
| `app/src/lib/db.ts` | tabla telegram_config + skill Arquitecto de Agentes |
| `app/src/instrumentation.ts` | TelegramBotService startup |
| `app/next.config.js` | instrumentationHook: true |
| `app/messages/es.json` + `en.json` | i18n Telegram + canvas running/waiting |

---

## Commits de la sesion

| Commit | Descripcion |
|--------|-------------|
| `cad4891` | feat: Arquitecto de Agentes skill + list_skills tool |
| `35c55f1` | docs: create milestone v22.0 (4 phases, 50 requirements) |
| `f5b52bc` | feat(95-01): telegram_config table + TelegramBotService singleton |
| `ecd9e01` | docs(95-01): complete DB + TelegramBotService base plan |
| `4d868a9` | feat(96): sudo system + CatBot integration in TelegramBotService |
| `417138b` | feat(96): channel + sudo_active support in CatBot endpoint |
| `d09d51f` | docs(96-01): complete CatBot + sudo integration plan |
| `f74b51f` | feat(97-01): Telegram API endpoints |
| `2947696` | feat(97-01): TelegramSettings UI + wizard 3 pasos |
| `4b97404` | feat(97-01): Telegram system indicators (footer + /system) |
| `a7a52f9` | docs(97-01): complete Telegram API + Settings UI plan |
| `30aad85` | feat(98): Telegram i18n keys (40+ keys es + en) |
| `b3f434b` | feat: canvas active run visibility (badge + auto-reconnect) |
| `d402c1b` | fix: Telegram permission gate before CatBot call |
| `39d2566` | fix: harden permission gate with fail-safe try-catch |
| `e03c740` | fix: auto-restart + heartbeat for Telegram poll loop |
| `1605fae` | fix: enable instrumentationHook in next.config.js |

---

## Metricas de la sesion completa

| Componente | Cifras |
|------------|--------|
| Milestones completados | v22.0 (50/50 reqs) |
| Features adicionales | Arquitecto de Agentes, Canvas visibility |
| Bugfixes produccion | 4 (permisos, hardening, auto-restart, config) |
| Commits | 17 |
| Archivos nuevos | 6 |
| Archivos modificados | 12 |
| Build | Limpio |

---

## Estado final

- **v22.0:** MILESTONE COMPLETO — 4/4 fases, 50/50 requirements
- **CatBot Telegram:** Activo, respondiendo, sudo funcional, permisos enforced
- **Canvas:** Badge pulsante en lista + auto-reconnect en editor
- **CatBot:** Skill Arquitecto de Agentes inyectada, busca antes de crear
- **Docker:** instrumentationHook habilitado, todos los servicios arrancan
