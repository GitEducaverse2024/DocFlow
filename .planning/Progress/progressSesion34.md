# Sesion 34 — CatDev v30.3: Inbound v4d — Dedup semantico + BlastFunnels lead extraction + respuesta K12/Educaverse

**Fecha:** 2026-04-23
**Estado:** COMPLETADO

---

## Resumen

Tercer milestone bajo CatDev Protocol. Cierra los tres bugs de logica de negocio del canvas Inbound descubiertos tras la verificacion live de v30.2: (1) dedup agrupando por `from` plano trataba tres consultas independientes de Antonio (K12 / patrimonio / REVI) como duplicadas respondiendo solo a la primera; (2) emails de `contacto@blastfunnels.com` (gestor de leads) se tratan como leads directos en vez de extraer el usuario real del body; (3) no habia respuesta diferenciada K12 Free->Premium ni addon Educaverse para universidades. Todo se resuelve **sin crear CatPaws ni skills nuevos** y **sin tocar canvas-executor** — reescritura de instructions a nivel de nodo (lector/respondedor/redactor) en `flow_data` + populate de los templates canonicos Pro-K12 y Pro-Educaverse. Verificacion end-to-end en live run `7cebf1cb` con dos emails de prueba enviados desde deskmath: 3 leads procesados (K12 Juan Los Pinos, K12 Laura Santa Maria Sevilla, REVI Javier Los Olivos), 3/3 respondidos con plantilla correcta segun producto, informe a antonio@educa360.com con template CatBot. Usuario confirmo recepcion y funcionamiento.

---

## Bloque 1 — Descubrimiento: scope reducido por reuso masivo

### Hallazgo en el KB

Antes de escribir el spec se hizo scan dirigido en `.docflow-kb/_index.json`. Aparecio que los productos comerciales ya tienen infraestructura completa:

- Templates `Pro-K12` (ref_code `xsEEpE`) + `Pro-Educaverse` (ref_code `B8g3mU`) existen en DB (duplicados entre `commercial` y `comercial` por KB-44).
- Skill `Leads y Funnel InfoEduca` (`a0517313-...`) ya mapea productos Educa360 -> plantillas (K12 -> Pro-K12, REVI -> Pro-REVI, Patrimonio VR -> Corporativa, Educaverse -> Pro-Educaverse, Simulator -> Pro-Simulator).
- CatPaws `Clasificador Inbound` / `Respondedor Inbound` / `Ejecutor Gmail` reusables.

### Decision de diseño

Aprovechar todo lo existente. Enhance las instrucciones de nodo (`canvases.flow_data.nodes[X].data.instructions`) en lugar de crear CatPaws paralelos. Resultado: **0 CatPaws nuevos, 0 skills nuevas, 0 tablas nuevas, 0 ficheros TypeScript tocados**. Todos los cambios son data-only en DB con updates idempotentes mediante marcadores en el contenido.

---

## Bloque 2 — P1: Lector v4d con deteccion BlastFunnels + dedup semantico

### Causa

El lector agrupaba emails por `from` plano. Tres emails de Antonio con temas distintos (mismo `from deskmath@gmail.com`) se marcaban como dup. Los emails de `contacto@blastfunnels.com` se trataban como lead directo aunque el usuario real viene dentro del body.

### Fix

Reescritura completa de las instructions del nodo `lector` en el canvas `test-inbound-ff06b82c`. Marcador `<!-- LECT-V4D -->` en la primera linea para idempotencia. Se conservan las 6 reglas de escape JSON del marcador `<!-- LECT-01-ESCAPE-V1 -->` de v30.2 (criticas para que el iterator no colapse).

Nueve pasos en la nueva instruction:

1. Fecha hace 7 dias.
2. Search inbox `in:inbox after:{fecha}`.
3. Search sent + extraer threadIds.
4. Filtrar inbox por threadId no-en-sent.
5. **Extraccion por-email**: si `from.domain === 'blastfunnels.com'` parsea el body buscando `Formulario`, `E-mail`, `Nombre Completo`, `Tipo de Organizacion`, `Centro Educativo`, `Pais`, `Ciudad`, `Telefono`, `Dispone de VR`. Produce campos `email_real`, `from_is_aggregator: true`, `formulario`, `nombre_completo`, `tipo_organizacion`. Caso aggregator sin `E-mail` extraible -> `is_duplicate: true, motivo: "blastfunnels sin email_real"`.
6. **Filtro formulario** (solo BlastFunnels): si el `formulario` no matchea `/registro\s+cuenta\s+free/i` -> `is_duplicate: true, motivo: "formulario no-target"`.
7. **Dedup semantica v4d** (reemplaza dedup por from): `dedup_key_base = email_real`, `discriminador = threadId` (emails directos) o `formulario` (BlastFunnels). Emails distintos con el mismo `email_real` pero `threadId`/`formulario` distintos NO son duplicados.
8. Orden: primero no-dup (por fecha asc), luego dup. Limite 10.
9. Emision con schema ampliado de 20 campos (conserva los antiguos + 8 nuevos v4d).

Longitud: 2558 -> 5536 chars.

**Archivo:** `canvases.flow_data.nodes[lector].data.instructions` (DB directo).

---

## Bloque 3 — P2 + hotfix: Respondedor con routing producto + addon universidad

### Causa del fix normal

El respondedor pre-v4d no sabia que `from_is_aggregator: true` significaba "responder al email_real, no al from". Tampoco diferenciaba universidades para addear Educaverse.

### Cinco pasos nuevos (marcador `<!-- RESP-V4D -->`)

- **PASO A**: resolver `reply_to_email` = `email_real` si aggregator (nunca contacto@blastfunnels), else = `from`. `reply_mode` = `EMAIL_NUEVO` si aggregator, `REPLY_HILO` si directo.
- **PASO B**: detectar producto (via skill `Leads y Funnel InfoEduca`) + `educaverse_addon = true` si `tipo_organizacion` matches `/(universidad|facultad|universitari[oa])/i`.
- **PASO C**: `plantilla_ref` por producto (K12->xsEEpE, REVI->v7aW5V, Educaverse->B8g3mU, Simulator->fsJ7Ac, fallback->bynab4). Obligatorio.
- **PASO D**: generar cuerpo personalizado. Para K12 con cuenta free: "cientos de salas didacticas, generador de rutas didacticas, metricas de progreso, gestion de profesores y usuarios, catalogo de cursos" + oferta de 3 meses premium + CTA demo 20min. Si `educaverse_addon = true` anade parrafo sobre www.educaverse.org ("Recrea tu universidad en el metaverso...") + CTA combinada.
- **PASO E**: emitir campos al JSON.

### Bug del executor: bloque `respuesta` anidado

Primer intento (`<!-- RESP-V4D -->`) ponia los campos a nivel raiz del JSON. El `connector-gmail` fallo con `Error: accion_final=send_reply but no "respuesta" block`. [canvas-executor.ts:768](../../app/src/lib/services/canvas-executor.ts#L768) lee `const respuesta = actionData.respuesta as Record<string, unknown> | undefined;` — requiere bloque anidado.

Hotfix `<!-- RESP-V4D-NESTED -->`: reestructurar PASO E. `accion_final`, `reply_mode`, `educaverse_addon` quedan a nivel raiz; `nombre_lead`, `email_destino`, `producto`, `plantilla_ref`, `asunto`, `saludo`, `cuerpo` dentro de `respuesta: { ... }`.

### Verificacion tras hotfix

Run `8d3059e8` completo 11/11 nodos. Los 2 items patrimonio + REVI pendientes post-v30.2 fueron respondidos con `ejecutado=true, accion_tomada=respondido`. Plantillas correctas (v7aW5V para REVI, bynab4 como fallback para patrimonio).

**Archivo:** `canvases.flow_data.nodes[respondedor].data.instructions` (DB directo).

---

## Bloque 4 — P3: Populate de templates comerciales canonicos

### Descubrimiento en runtime

Pro-K12 canonical (`bc03e496-8385-...`) tenia solo `image` + `video` en body. Pro-Educaverse canonical (`155c955e-...`) tenia `body.rows: []` (completamente vacio). Los duplicados `comercial` (ref `fjZupz` / `Yq8VAF`) tenian `instruction` blocks + CTA text, pero estan fuera de la canonica.

### Decision

Populate los canonicos (respetando `KB-44` pre-existente sobre los duplicados sin tocar). Schema del executor ([canvas-executor.ts:823-871](../../app/src/lib/services/canvas-executor.ts#L823-L871)) soporta dos paths:
- Si el template tiene un `instruction` block con `text: <varName>`, renderiza con `variables[varName] = <cuerpo generado>`.
- Si no, inyecta el cuerpo como textBlock antes del footer.

Para los canonicos: añadir un `instruction` block con `text: "cuerpo_respuesta"` (key que el executor toma del primer instruction block encontrado) + un `text` block con CTA fijo "**[Reservar demo](https://calendly.com/educa360/demo)**". Marcadores embedded en el content para idempotencia (`<!-- TPL-K12-V4D -->`, `<!-- TPL-ED-V4D -->`).

Resultado: Pro-K12 body 2 -> 4 rows, Pro-Educaverse 0 -> 2 rows. Render test via `POST /api/email-templates/[id]/render` con `{"variables":{"cuerpo_respuesta":"<p>TEST...</p>"}}` confirmo que el placeholder se sustituye y el CTA aparece.

**Archivo:** `email_templates.structure` (DB directo, 2 rows actualizadas).

---

## Bloque 5 — P4 + hotfix: Informe a la directiva con template CatBot

### Bug descubierto por el usuario

Tras verificar el live run, el usuario reporto que el informe que llega a `antonio@educa360.com` no viene con wrapping del template. Root cause diagnosticado en dos capas:

**Capa 1** — instructions legacy del Redactor `3fqil5y5w` emitian `{to, subject, html_body}` con HTML raw. El executor ([canvas-executor.ts:704-718](../../app/src/lib/services/canvas-executor.ts#L704-L718)) intenta dos patterns:
- Pattern A: `parsed.accion_final` truthy -> usar como `actionData` (disparar handler deterministico).
- Pattern B: `data.auto_report && Array.isArray(parsed)` -> wrap como `send_report`.

El output raw `{to, subject, html_body}` no tiene `accion_final` ni es array -> `actionData = null` -> cae al legacy path (`parseOutputToEmailPayload`) que ignora `report_template_ref`.

**Fix 1** (`<!-- REDACTOR-V4D -->`): reescribir para emitir `{accion_final:"send_report", report_to, report_template_ref:"zAykt4", results:[...]}` -> dispara el handler deterministico que wrappea en template + tabla stats.

**Capa 2** — tras aplicar el Fix 1, el output del Redactor tenia ~10kb porque incluia `body` completo de cada email en `results`. gemini-main truncaba silenciosamente el JSON -> `JSON.parse` fallaba en el executor -> mismo sintoma. Identico al patron del iterator bug de v30.2.

**Fix 2** (`<!-- REDACTOR-V4D-STRIP -->`): instructions explicitas de mantener solo campos minimos por item (messageId, from truncado 60 chars, subject 80, categoria, accion_tomada, respuesta{nombre_lead, email_destino, producto}). Prohibido: body, html_body, threadId, motivo, saludo, cuerpo, date y otros campos largos. Output post-fix: 1460 chars.

### Verificacion

Live run `a8471b60` con 4 items: `"send_report: building report" reportRefCode: "zAykt4" itemsCount: 4` + `"Gmail deterministic: send_report" to: "antonio@educa360.com" total: 4 respondidos: 1` + `ejecutado=true, accion_tomada=informe_enviado`.

**Archivo:** `canvases.flow_data.nodes[3fqil5y5w].data.instructions` (DB directo).

---

## Bloque 6 — Post-shipping: ampliacion a 4 directivos + rename + sync KB

A peticion del usuario tras verificacion OK:

### Informe a 4 destinatarios
Redactor updated: `report_to = "antonio@educa360.com, fen@educa360.com, fran@educa360.com, adriano@educa360.com"`. `sendEmail` ([email-service.ts:180](../../app/src/lib/services/email-service.ts#L180)) ya soporta comma-separated string via nodemailer. Sin cambio al executor.

### Rename del canvas
`canvases.name` cambiado de "TEST Inbound — Fase 5: Full Pipeline" a "Control Leads Info@Educa360.com" via `PATCH /api/canvas/[id]` -> dispara sync Phase 153 -> `title` del KB resource se actualiza automaticamente. Canvas ID y slug KB conservados (cosmetico).

### KB full rebuild
`node scripts/kb-sync.cjs --full-rebuild --source db` ejecutado. Resultado: 2 creates, 16 updates, 40 unchanged, 59 orphans (pre-existentes por KB-44 commercial/comercial). El Auditor skill sincronizo a `version: 2.0` pero el **contenido del instructions se trunco en el sync** (file 3172 bytes vs DB 5392 chars) — documentado como item tech-debt.

### Prueba final end-to-end
Run `7cebf1cb` con 2 emails enviados desde `deskmath@` (Laura Santa Maria Sevilla K12 + Javier Los Olivos REVI) + 1 preexistente Juan Los Pinos K12. Resultado: **3/3 respondidos con plantilla correcta** (K12 x2 -> xsEEpE, REVI -> v7aW5V), `ejecutado=true`, `accion_tomada=respondido`. Informe a antonio con template CatBot (`reportRefCode: zAykt4`). Usuario confirmo recepcion.

---

## Resumen de archivos modificados

| Archivo | Cambio |
|---------|--------|
| `canvases.flow_data` (DB, id=test-inbound-ff06b82c) | Lector reescrito (marcador `LECT-V4D`), Respondedor reescrito (`RESP-V4D` + `RESP-V4D-NESTED`), Redactor reescrito (`REDACTOR-V4D` + `REDACTOR-V4D-STRIP`). Canvas name -> "Control Leads Info@Educa360.com" |
| `email_templates.structure` (DB, bc03e496-... Pro-K12 + 155c955e-... Pro-Educaverse) | instruction block `cuerpo_respuesta` + text block CTA. Marcadores `TPL-K12-V4D` / `TPL-ED-V4D` |
| `.catdev/spec.md` | Spec v30.3 completo: 4 fases + notas de sesion + informe de verificacion (re-escrito al final en este /catdev:done) |
| `.planning/Progress/progressSesion34.md` | **NUEVO** — este informe de sesion |
| `.docflow-kb/resources/canvases/test-inb-*.md` | Title auto-actualizado a "Control Leads Info@Educa360.com" (via PATCH sync Phase 153) |
| `.docflow-kb/resources/email-templates/*pro-k12*.md` + `*pro-educaverse*.md` | Body structure sincronizado via full-rebuild |
| `.planning/STATE.md` | Frontmatter: last_milestone=v30.3, last_session=34, last_updated=2026-04-23 |
| `.planning/ROADMAP.md` | v30.3 marcado shipped + bloque descriptivo + pointer proximo candidato v30.4 |
| `.planning/tech-debt-backlog.md` | 3 items nuevos: `report_cc` no soportado, truncate JSON en nodos reducer, Cronista CatDev candidato milestone |

**Ficheros TypeScript tocados: 0** (cero cambios de codigo — todo data-only en DB + prompts).

---

## Tips y lecciones aprendidas

### Maxima reutilizacion antes de crear
Scan `.docflow-kb/_index.json` con `jq` antes de escribir el spec revelo infraestructura completa (templates Pro-K12 / Pro-Educaverse, skill Leads y Funnel, CatPaws Clasificador / Respondedor). El scope del milestone se redujo drasticamente al evitar crear nuevos CatPaws paralelos. Patron replicable: `jq -r '.entries[] | select(.subtype == "X") | select((.title) | test("keywords"; "i"))'` como primer paso de cualquier `/catdev:new`.

### `email_real` vs `from` — clave mental del aggregator
BlastFunnels (y en general cualquier adapter de formularios) es un **proxy**: el campo `from` es el adapter, el email del lead real esta dentro del body. Generalizable a Typeform, Hubspot Forms, Google Forms, etc. — patron "from_is_aggregator" + "email_real" aplica. El dedup y el routing SIEMPRE deben usar `email_real` como la identidad verdadera del lead.

### Dedup semantica no puede ser `group by from`
Agrupar por `from` plano es una aproximacion que rompe en cuanto un remitente envia consultas sobre temas distintos. La regla buena es `group by (lead_real, discriminador_tematico)` donde el discriminador es el `threadId` (emails nativos) o el `formulario` (leads via aggregator). El mismo lead preguntando por dos productos distintos = dos consultas, dos respuestas.

### Bloques anidados vs campos raiz en el executor deterministico
El handler `send_reply` requiere `actionData.respuesta: { ... }` (L768). El handler `send_report` requiere `actionData.results` + `actionData.report_template_ref`. Al reescribir instructions LLM se debe verificar **exactamente** que schema espera el executor — un campo raiz que deberia estar anidado o viceversa rompe el handler deterministico y cae al legacy path sin template. Patron: antes de tocar instructions de un node LLM, leer el case correspondiente en canvas-executor.

### Truncate JSON en nodos reducer LLM
Identico al patron del iterator bug de v30.2. Cuando un nodo LLM debe reemitir una lista grande con campos voluminosos (body, html completo, long subjects), gemini-main trunca silenciosamente si el output pasa de ~8-10kb. Fix canonico: instructions que exijan **stripping de campos no necesarios** para el consumidor downstream. El sintoma es identico (JSON.parse falla en el consumer -> falls through legacy path -> template wrapping pierde). Consider aplicar `jsonrepair` tambien en el connector deterministic path (item tech-debt MEDIUM).

### `sendEmail` con multiple destinatarios sin tocar el executor
`sendEmail({to: "a, b, c"})` soporta comma-separated string nativamente via nodemailer. Para informes multi-recipiente sin tocar el executor (R26-adyacente), basta con emitir el string correcto desde el nodo productor. No necesita campo `cc` separado.

### Full KB rebuild no es equivalente a PATCH incremental
`kb-sync-db-source.cjs --full-rebuild` regenera metadata pero **trunca el contenido** de instructions largas (auditor skill 5392 chars DB -> 3172 bytes file). Item tech-debt pendiente. Los PATCHes incrementales via `/api/*` si escriben el contenido completo. Preferir API updates sobre DB direct cuando la longitud del campo importa.

### Security invariants del KB
`kb-sync-db-source.cjs` L20-22 explicitamente excluye `canvases.flow_data`, `email_templates.structure`, `connectors.config` del sync. Consecuencia: las mejoras a nivel de prompt (instructions de nodo) no se reflejan en el KB resource, solo en la DB y en los artefactos de planning (`.catdev/spec.md`, progressSesion). Si se quiere que CatBot tenga visibilidad de los prompts para informar decisiones futuras, hay que relajar estos invariants o anadir una columna `public_summary` que SI se sincronice. Candidato v30.4 (Cronista CatDev).

---

## Metricas de la sesion

- **Milestone cerrado:** 1 (v30.3 shipped 2026-04-23)
- **Fases ejecutadas:** 4/4 (P1 LECT-V4D, P2 RESP-V4D + hotfix NESTED, P3 TPL-K12/ED-V4D, P4 TEST-V4D + hotfix REDACTOR-STRIP)
- **Ficheros TypeScript modificados:** 0
- **Ficheros TypeScript creados:** 0
- **Cambios en DB (data-only):** 2 tablas (canvases.flow_data, email_templates.structure)
- **Marcadores idempotentes introducidos:** 8 (LECT-V4D, RESP-V4D, RESP-V4D-NESTED, TPL-K12-V4D, TPL-ED-V4D, REDACTOR-V4D, REDACTOR-V4D-STRIP, + conservado LECT-01-ESCAPE-V1 de v30.2)
- **Live runs de verificacion:** 4 (`66aeb915` v30.2 previo, `ba3ceba4` descubrio bug respuesta-nested, `8d3059e8` post-hotfix nested, `a8471b60` post-hotfix redactor-strip, `7cebf1cb` prueba final end-to-end con 2 emails desde deskmath)
- **Bugs corregidos:** 3 logica de negocio + 2 integracion (nested block + JSON truncate)
- **CatPaws / skills / connectors nuevos:** 0 (reuso maximo)
- **Templates tocados:** 2 (Pro-K12, Pro-Educaverse canonicos)
- **Tech debt items capturados:** 3 nuevos (report_cc no soportado, truncate JSON en reducer, Cronista CatDev candidato)
- **Tech debt items cerrados:** 1 (★ Inbound v4d del backlog §3, promocionado y cerrado en este milestone)
- **Docker rebuilds:** 0 (data-only, ningun cambio TS necesitaba rebuild)
- **Verificacion CatBot:** 3/3 CHECKs verde + verificacion usuario confirmada
- **Confirmacion del usuario:** Si, aprobado y funcionando
