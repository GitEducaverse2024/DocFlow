---
id: 1ea583c0-respondedor-inbound
type: resource
subtype: catpaw
lang: es
title: Respondedor Inbound
summary: Agente especializado en redacción de respuestas comerciales 
a emails inbound. Convierte consultas entrantes en comunicaciones 
profesionales orientadas a conversión, usando el conocimiento 
de pro...
tags: [catpaw, processor]
audience: [catbot, architect]
status: active
created_at: 2026-03-31T10:51:11.847Z
created_by: kb-sync-bootstrap
version: 1.0.18
updated_at: 2026-04-23T16:41:50.089Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 1ea583c0-0d44-4168-8196-a1c857cba562
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format, rationale_notes]
related:
  - { type: catbrain, id: 9cc58dee-educa360 }
  - { type: connector, id: seed-ema-plantillas-email-corporativas }
  - { type: skill, id: sales-co-copywriting-comercial }
  - { type: skill, id: objectio-manejo-de-objeciones }
  - { type: skill, id: a0517313-leads-y-funnel-infoeduca }
  - { type: skill, id: maquetad-maquetador-de-email }
search_hints: [Copywriting Comercial, Leads y Funnel InfoEduca, Manejo de Objeciones, Maquetador de Email, Plantillas Email Corporativas]
change_log:
  - { version: 1.0.14, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.15, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.16, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.17, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.18, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Agente especializado en redacción de respuestas comerciales 
a emails inbound. Convierte consultas entrantes en comunicaciones 
profesionales orientadas a conversión, usando el conocimiento 
de producto proporcionado por el flujo.

---
[v4d-doc-v1]

**Respondedor Inbound** — CatPaw generico que redacta respuestas comerciales a leads entrantes.

## Usado en canvas

- **Control Leads Info@Educa360.com** (`test-inbound-ff06b82c`): con instructions a nivel de nodo (marcador RESP-V4D-NESTED en flow_data). El nodo instructions resuelve producto, plantilla_ref, reply_to_email por-case y genera cuerpo personalizado.

## Contrato con el executor (critico)

El output DEBE tener estructura:
```
{
  accion_final: "send_reply",
  reply_mode: "REPLY_HILO" | "EMAIL_NUEVO",
  educaverse_addon: boolean,
  respuesta: {
    nombre_lead, email_destino, producto, plantilla_ref,
    asunto, saludo, cuerpo
  }
}
```
Los campos dentro de `respuesta: {...}` son obligatorios (el executor lee actionData.respuesta en L768 — si falta falla con "no 'respuesta' block"). `accion_final`, `reply_mode`, `educaverse_addon` van a nivel raiz.

## Tips

- Para BlastFunnels leads: `reply_to_email = email_real` (NO from) + `reply_mode = EMAIL_NUEVO`.
- Para emails nativos: `reply_mode = REPLY_HILO`, asunto vacio (hereda).
- Decision tree universidad: regex `/(universidad|facultad|universitari[oa])/i` sobre tipo_organizacion.

## Referencias

- canvas-executor.ts:765-871 (send_reply handler).
- Skill "Leads y Funnel InfoEduca" (a0517313): mapping producto -> plantilla.

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.6
- **Max tokens:** 8192
- **Output format:** json
- **Tone:** professional
- **Department tags:** ["inbound","respuesta","rag","venta","reunión"]
- **times_used:** 195

## System Prompt

```
Eres un redactor de comunicaciones comerciales inbound 
especializado en conversión. Tu trabajo es transformar 
consultas de leads entrantes en respuestas que generen 
confianza, transmitan valor y avancen la relación comercial.

ROL Y CAPACIDADES:
Eres experto en comunicación B2B y B2C de alto impacto. 
Entiendes los ciclos de decisión de compra y sabes cuándo 
empujar hacia cierre y cuándo nutrir con información. 
Adaptas el tono, la extensión y el nivel de detalle según 
el perfil del interlocutor y la fase en que se encuentra.

PRINCIPIOS DE RESPUESTA:
- Cada email tiene un objetivo único: o avanzar hacia reunión 
  o avanzar hacia cierre. Nunca los dos a la vez.
- La personalización real supera siempre a la genérica. 
  Usa siempre datos concretos del lead (nombre, empresa, 
  ciudad, interés declarado) para que el email no parezca 
  automatizado.
- El tono es profesional pero humano. Sin corporativismo frío, 
  sin jerga técnica innecesaria, sin frases hechas.
- La brevedad es u
```

## Conectores vinculados

- **Plantillas Email Corporativas** (`seed-email-template`)

## Skills vinculadas

- **Copywriting Comercial** (`sales-copywriting`)
- **Leads y Funnel InfoEduca** (`a0517313-ecee-45e1-b930-10725f2261d4`)
- **Manejo de Objeciones** (`objection-handling`)
- **Maquetador de Email** (`maquetador-email`)

## Historial de mejoras

> Entries gestionadas por la skill "Cronista CatDev" (v30.4). Append-only, idempotente por (date, change). No editar a mano — usar tool `update_catpaw_rationale` via CatBot.

### 2026-04-23 — _v30.3 sesion 34_ (by catdev-backfill)

**Instrucciones de nodo en canvas test-inbound reemiten bloque respuesta anidado**

_Por qué:_ El executor espera respuesta: {...} con nombre_lead/email_destino/producto/plantilla_ref/asunto/saludo/cuerpo dentro. accion_final/reply_mode/educaverse_addon van a nivel raíz.

_Tip:_ El schema de send_reply del executor es estricto. Ver canvas-executor.ts L768 antes de reescribir instrucciones.

