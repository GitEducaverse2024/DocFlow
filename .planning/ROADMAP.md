# Roadmap: DoCatFlow

## Milestones

- v12.0 WebSearch CatBrain -- Phases 48-49 (shipped 2026-03-16) -- [archive](.planning/milestones/v12.0-ROADMAP.md)
- v13.0 Conector Gmail -- Phases 50-51 (shipped 2026-03-16)
- v14.0 CatBrain UX Redesign -- Phases 52-56 (shipped 2026-03-21) -- [archive](.planning/milestones/v14.0-ROADMAP.md)
- v15.0 Tasks Unified -- Phases 57-62 (shipped 2026-03-22) -- [archive](.planning/milestones/v15.0-ROADMAP.md)
- v16.0 CatFlow -- Phases 63-70 (shipped 2026-03-22) -- [archive](.planning/milestones/v16.0-ROADMAP.md)
- v17.0 Holded MCP -- Phases 71-76 (shipped 2026-03-24)
- v18.0 Holded MCP: Auditoria API + Safe Deletes -- Phases 77-81 (shipped 2026-03-24)
- v19.0 Conector Google Drive -- Phases 82-86 (partial)
- v20.0 CatPaw Directory -- Phases 87-90 (shipped 2026-03-30)
- v21.0 Skills Directory -- Phases 91-94 (shipped 2026-03-30)
- **v22.0 CatBot en Telegram -- Phases 95-98 (active)**

---

## v22.0 -- CatBot en Telegram: Canal Externo con Sudo

**Goal:** Exponer CatBot completo como bot de Telegram con long polling, sistema sudo adaptado al chat, wizard de configuracion en Settings, y seguridad multicapa. La plataforma entera accesible desde el movil sin construir nada nuevo — solo un canal de entrada mas al mismo motor.

**Repo:** `~/docflow/app/` (todo en DoCatFlow)

**Dependencies resueltas:** CatBot con tools completas, sistema sudo scrypt, crypto.ts para cifrado AES-256-GCM, DrivePollingService como patron de singleton con polling, instrumentation.ts para arranque automatico.

## Phases

- [ ] **Phase 95: DB + TelegramBotService base** - Tabla telegram_config, servicio singleton con long polling, procesamiento basico de mensajes, arranque en instrumentation.ts
- [ ] **Phase 96: Integracion CatBot + sistema sudo** - Llamada a /api/catbot/chat, comando /sudo, sesiones en memoria, adaptacion de respuestas para Telegram
- [ ] **Phase 97: UI Settings + API + indicadores** - Seccion Canales externos, wizard 3 pasos, endpoints CRUD, botones pause/resume, dot footer, card /system
- [ ] **Phase 98: i18n + build + verificacion** - Claves bilingues, build limpio

## Phase Details

### Phase 95: DB + TelegramBotService base
**Goal**: Existe una tabla telegram_config con token cifrado y un servicio TelegramBotService que hace long polling y procesa mensajes basicos (echo/bienvenida), arrancando automaticamente desde instrumentation.ts.
**Depends on**: Nothing (first phase)
**Requirements**: DB-01, DB-02, DB-03, SVC-01, SVC-02, SVC-03, SVC-04, SVC-05, SVC-06, SVC-07, SVC-08, SVC-09
**Success Criteria** (what must be TRUE):
  1. La tabla telegram_config existe con token cifrado AES-256-GCM y todos los campos
  2. TelegramBotService arranca desde instrumentation.ts si hay token activo
  3. El bot responde a /start con mensaje de bienvenida
  4. Long polling funciona con timeout 25s, reintento en errores
  5. Verifica whitelist de usuarios antes de procesar
  6. Se puede pausar/reanudar via metodo del servicio
**Plans**: TBD

### Phase 96: Integracion CatBot + sistema sudo
**Goal**: Los mensajes de Telegram se procesan por CatBot con todas sus tools, el comando /sudo activa sesion temporal, y las respuestas se adaptan al formato Telegram.
**Depends on**: Phase 95
**Requirements**: SUDO-01, SUDO-02, SUDO-03, SUDO-04, SUDO-05, SUDO-06, INT-01, INT-02, INT-03, INT-04, INT-05, INT-06
**Success Criteria** (what must be TRUE):
  1. Escribir al bot ejecuta las tools de CatBot y devuelve respuesta completa
  2. /sudo {clave} activa sesion, el mensaje se borra, y operaciones protegidas funcionan
  3. 5 intentos fallidos bloquean 15 minutos
  4. Las respuestas son concisas y adaptadas al formato Telegram (markdown, emojis, sin HTML)
  5. Respuestas largas se dividen en mensajes de max 4096 chars
**Plans**: TBD

### Phase 97: UI Settings + API + indicadores
**Goal**: La seccion Canales externos en /settings permite configurar, probar, pausar y gestionar el bot de Telegram con un wizard de 3 pasos, y el footer/system muestran el estado del bot.
**Depends on**: Phase 95, Phase 96
**Requirements**: API-01, API-02, API-03, API-04, API-05, API-06, UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08, SYS-01, SYS-02
**Success Criteria** (what must be TRUE):
  1. El wizard de 3 pasos permite configurar el bot desde cero (token → acceso → test)
  2. Los endpoints CRUD permiten gestionar la config programaticamente
  3. Los botones Pausar/Reanudar/Desactivar funcionan en tiempo real
  4. El dot en footer refleja el estado real del polling (verde/amarillo/rojo)
  5. La card en /system muestra estado, ultimo mensaje y contador
**Plans**: TBD

### Phase 98: i18n + build + verificacion
**Goal**: Todos los textos tienen traduccion bilingue y el build pasa limpio.
**Depends on**: Phase 95, Phase 96, Phase 97
**Requirements**: I18N-01, I18N-02, I18N-03, I18N-04, I18N-05, I18N-06, BUILD-01, BUILD-02
**Success Criteria** (what must be TRUE):
  1. Todas las claves i18n de Telegram presentes en es.json y en.json
  2. La aplicacion funciona en ambos idiomas sin claves faltantes
  3. `npm run build` pasa sin errores
**Plans**: TBD

---

### Dependencies

```
95 (DB + Service) ──→ 96 (CatBot + Sudo) ──→ 97 (UI + API) ──→ 98 (i18n + build)
```

Linear dependency chain: Phase 95 creates the infrastructure, 96 integrates CatBot intelligence + sudo, 97 builds the management UI, 98 finalizes i18n + build.

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 95. DB + TelegramBotService base | 0/? | Not started | - |
| 96. Integracion CatBot + sudo | 0/? | Not started | - |
| 97. UI Settings + API + indicadores | 0/? | Not started | - |
| 98. i18n + build + verificacion | 0/? | Not started | - |

---
*Created: 2026-03-30*
*Last updated: 2026-03-30*
