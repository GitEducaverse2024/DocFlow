---
id: test-inb-control-leads-info-educa360-com
type: resource
subtype: canvas
lang: es
title: Control Leads Info@Educa360.com
summary: "catdev P1 smoke 1776888574

---
[v4d-doc-v1]

**Pipeline Inbound v4d** (shipped v30.3, sesion 34, 2026-04-23):

Canvas que orquesta la lectura del inbox de info@educa360.com, clasifica y responde l..."
tags: [canvas]
audience: [catbot, architect]
status: active
created_at: 2026-04-02 21:30:55
created_by: kb-sync-bootstrap
version: 1.0.1
updated_at: 2026-04-23T16:41:50.098Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: canvases
    id: test-inbound-ff06b82c
    fields_from_db: [name, description, mode, status, tags, is_template, rationale_notes]
change_log:
  - { version: 1.0.1, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

catdev P1 smoke 1776888574

---
[v4d-doc-v1]

**Pipeline Inbound v4d** (shipped v30.3, sesion 34, 2026-04-23):

Canvas que orquesta la lectura del inbox de info@educa360.com, clasifica y responde leads comerciales con plantillas diferenciadas por producto, y envia informe resumen a la directiva.

## Arquitectura logica

1. **Lector** (nodo `lector`, agente Ejecutor Gmail): detecta emails con dominio `@blastfunnels.com` como aggregator y extrae `email_real` + `tipo_organizacion` + `formulario` del body semi-estructurado. Para el resto, `email_real = from`. Filtra BlastFunnels por formulario "Registro cuenta free". Dedup semantico por `(email_real, threadId|formulario)` — NO por from plano (bug v30.3 P1).
2. **Iterator** (nodo `iterator`): emite items al pipeline. Tolerante a JSON malformado del lector (v30.2 P1 con jsonrepair + regex-salvage).
3. **Clasificador** (nodo `clasificador`): identifica producto Educa360 (K12/REVI/Patrimonio VR/Educaverse/Simulator) via skill "Leads y Funnel InfoEduca".
4. **Respondedor** (nodo `respondedor`): rutea `plantilla_ref` por producto, genera cuerpo personalizado. Si `from_is_aggregator=true`, reply_to = email_real. Si `tipo_organizacion` matches /(universidad|facultad)/i, anade addon Educaverse.
5. **connector-gmail** (deterministico): envia via nodemailer con template wrapping.
6. **Redactor de Informe + connector-informe**: emite schema `send_report` (NO raw HTML — el executor necesita este schema para wrappear el template CatBot `zAykt4`). Output strippeado a campos minimos por item (evita truncate JSON en outputs largos).

## Por que asi

- **No crear CatPaws paralelos**: max reuse de Clasificador/Respondedor/Redactor existentes. Toda la logica v4d vive en `flow_data.nodes[X].data.instructions` (prompts a nivel de nodo).
- **R26 respetado**: 0 cambios a canvas-executor.ts. Los bugs del executor (bloque `respuesta` anidado, `actionData.accion_final` como trigger) se respetaron en el diseño del schema emitido por cada nodo.
- **Dedup semantico real**: `email_real` identifica al lead, `threadId` o `formulario` discriminan temas. 3 consultas del mismo remitente sobre 3 productos = 3 respuestas.

## Tips & gotchas

- El output del lector DEBE ser JSON parseable. Si el LLM se pasa con HTML denso, parseIteratorItems cae a `jsonrepair` + regex-salvage (v30.2).
- Al emitir schemas estructurados (send_reply, send_report), VERIFICAR que campos van a nivel raiz vs anidados en `respuesta: {}` / `results: []`. El executor es estricto.
- Outputs grandes (>8kb) en nodos reducer causan truncate silencioso de gemini. Stripear campos no necesarios (body, html_body, threadId) antes de reemitir listas.
- `sendEmail.to` soporta comma-separated directamente — util para informes multi-directivo sin tocar executor.

## Marcadores idempotentes activos

- `LECT-V4D`, `LECT-01-ESCAPE-V1` en nodo lector.
- `RESP-V4D` + `RESP-V4D-NESTED` en nodo respondedor.
- `REDACTOR-V4D` + `REDACTOR-V4D-STRIP` en nodo redactor.

## Referencias

- .catdev/spec.md (v30.3 historico archivado)
- .planning/Progress/progressSesion33.md (v30.2 foundation)
- .planning/Progress/progressSesion34.md (v30.3 Inbound v4d)

## Configuración

- **Mode:** mixed
- **Status (DB):** idle
- **Is template:** no

## Historial de mejoras

> Entries gestionadas por la skill "Cronista CatDev" (v30.4). Append-only, idempotente por (date, change). No editar a mano — usar tool `update_canvas_rationale` via CatBot.

### 2026-04-23 — _v30.3 sesion 34_ (by catdev-backfill)

**Rename a "Control Leads Info@Educa360.com" + informe a 4 directivos comma-separated**

_Por qué:_ Usuario pidió que el informe llegue también a fen@, fran@, adriano@ además de antonio@. sendEmail soporta "to" comma-separated nativo vía nodemailer — evita tocar executor.

_Tip:_ Para ampliar recipients a cualquier send deterministico sin R26 RFC: emitir "to: a, b, c" en el schema que consume el connector.

### 2026-04-23 — _v30.3 sesion 34_ (by catdev-backfill)

**Redactor de Informe emite schema send_report + strip de campos voluminosos**

_Por qué:_ Root cause 1: instructions legacy emitían {to, subject, html_body} raw → executor caía al path sin template wrapping (plantilla zAykt4 CatBot no se aplicaba). Root cause 2: output > 10kb se truncaba silenciosamente en gemini-main → JSON.parse fallaba downstream. Fix en 2 capas (schema + stripping).

_Tip:_ Patrón reutilizable: nodos LLM reducer DEBEN stripear campos irrelevantes del siguiente consumidor antes de reemitir arrays grandes. Outputs > 8kb rompen.

### 2026-04-23 — _v30.3 sesion 34_ (by catdev-backfill)

**Respondedor con reply_to_email=email_real + addon Educaverse si universidad + bloque respuesta anidado**

_Por qué:_ El executor handler send_reply requiere actionData.respuesta: {...} como bloque anidado (L768). Campos a nivel raíz fallaban con "accion_final=send_reply but no respuesta block". Además, la respuesta a BlastFunnels debía ir al email_real extraído del body, no a contacto@blastfunnels.com.

_Tip:_ Antes de tocar node LLM instructions, leer el case correspondiente del canvas-executor para verificar el schema exacto que espera (anidado vs root).

### 2026-04-23 — _v30.3 sesion 34_ (by catdev-backfill)

**Lector con detección BlastFunnels + dedup semántico por (email_real, threadId|formulario)**

_Por qué:_ Dedup pre-v4d agrupaba por "from" plano — 3 emails de Antonio con threadIds distintos (K12/patrimonio/REVI) se marcaban como duplicados falsos. Nueva lógica usa email_real (from o extraído del body BlastFunnels) + discriminador temático.

_Tip:_ Para aggregators de formularios (BlastFunnels, Typeform…): el from del email NO es el lead. Extraer identidad real del body (campo "E-mail" o similar) y usar eso como identidad para dedup + reply.

