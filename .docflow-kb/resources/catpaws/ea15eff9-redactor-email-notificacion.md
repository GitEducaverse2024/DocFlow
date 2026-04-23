---
id: ea15eff9-redactor-email-notificacion
type: resource
subtype: catpaw
lang: es
title: Redactor Email Notificación
summary: Genera un email HTML profesional de notificación con los leads capturados para enviarlo via Gmail. Si no hay leads nuevos, devuelve EMAIL_OMITIDO sin hacer nada.

---
[v4d-doc-v1]

**Redactor Email...
tags: [catpaw, processor, gmail, email]
audience: [catbot, architect]
status: active
created_at: 2026-03-26T17:04:33.960Z
created_by: kb-sync-bootstrap
version: 1.1.0
updated_at: 2026-04-23T16:41:50.087Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: ea15eff9-3065-477c-bfba-ee90b9d795a6
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format, rationale_notes]
related:
  - { type: connector, id: 43cbe742-antonio-educa360 }
  - { type: skill, id: sales-co-copywriting-comercial }
search_hints: [Antonio Educa360, Copywriting Comercial]
change_log:
  - { version: 1.1.0, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync minor bump from DB }
ttl: never
---

## Descripción

Genera un email HTML profesional de notificación con los leads capturados para enviarlo via Gmail. Si no hay leads nuevos, devuelve EMAIL_OMITIDO sin hacer nada.

---
[v4d-doc-v1]

**Redactor Email Notificacion** — CatPaw que consolida resultados del loop Inbound en un informe para la directiva.

## Contrato con el executor (critico)

Output DEBE ser el schema send_report, NO html_body raw:
```
{
  accion_final: "send_report",
  report_to: "antonio@..., fen@..., fran@..., adriano@...",  // comma-separated
  report_subject: "Resumen Procesamiento Inbound — YYYY-MM-DD",
  report_template_ref: "zAykt4",  // template CatBot
  results: [...items strippeados...]
}
```
Si el output es raw {to, subject, html_body} el executor cae al path legacy SIN template wrapping (bug v30.3 P4 hotfix B).

## Stripping obligatorio de items (anti-truncate)

Cada item en results DEBE tener solo: messageId, from (truncado 60), subject (80), categoria, accion_tomada, respuesta{nombre_lead, email_destino, producto}. Prohibido body, html_body, threadId, motivo, saludo, cuerpo, date. Outputs > 8kb se truncan silenciosamente en gemini-main y rompen JSON.parse downstream.

## Usado en canvas

- **Control Leads Info@Educa360.com** (nodo `3fqil5y5w`): marcador REDACTOR-V4D-STRIP en instructions.

## Referencias

- canvas-executor.ts:913-1025 (send_report handler): detecta `accion_final=send_report` + `report_template_ref` y wrappea con template.
- sendEmail.to soporta comma-separated directamente (email-service.ts:180).

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.3
- **Max tokens:** 4096
- **Output format:** json
- **Tone:** profesional
- **Department tags:** ["ventas","email","notificación","leads"]
- **times_used:** 22

## System Prompt

```
Eres el Redactor Email Notificación. Tu objetivo es preparar un email HTML profesional para notificar sobre nuevos leads capturados en un pipeline de prospección.

REGLA 1 — GESTIÓN DE AUSENCIA DE LEADS:
Si recibes exactamente "SIN_LEADS_NUEVOS" o "EMAIL_OMITIDO" como entrada, devuelve EXACTAMENTE la cadena "EMAIL_OMITIDO" y no hagas nada más.

REGLA 2 — DESTINATARIO:
El destinatario (campo "to") debe extraerse del contexto del flujo. Si no se especifica en el input, usa el valor de la variable {{destinatario_email}}. Nunca uses un email hardcodeado.

REGLA 3 — PARSEO DEL INPUT:
Recibirás un JSON del gestor de Drive con campos: url_drive, cantidad_leads, file_name, leads[]
El array "leads" contiene los datos de cada lead: nombre, empresa, cargo, email, telefono, fuente.
Usa estos datos para rellenar cada fila de la tabla HTML.

FORMATO DE SALIDA — JSON estricto:
{
  "to": "{{destinatario_email}}",
  "subject": "Nuevos Leads Capturados - [fecha de hoy]",
  "html_body": "<html>...</html>
```

## Conectores vinculados

- **Antonio Educa360** (`43cbe742-d8ed-4788-a5df-0f6f874220a8`)

## Skills vinculadas

- **Copywriting Comercial** (`sales-copywriting`)

## Historial de mejoras

> Entries gestionadas por la skill "Cronista CatDev" (v30.4). Append-only, idempotente por (date, change). No editar a mano — usar tool `update_catpaw_rationale` via CatBot.

### 2026-04-23 — _v30.3 sesion 34_ (by catdev-backfill)

**Instrucciones estrictas: schema send_report + stripping de campos por item**

_Por qué:_ Este agente es reducer (consolida iterator.results en informe). Si incluye body/html_body/threadId/motivo de cada item → output > 10kb → truncate silencioso en LLM → executor falls-through legacy sin template. Stripping a mínimos (messageId, from truncado, subject truncado, categoria, accion_tomada, respuesta{nombre_lead, email_destino, producto}) mantiene output ~1.5kb.

_Tip:_ Todos los nodos reducer deben prohibir explícitamente campos voluminosos en instructions. Regla general: outputs < 8kb para estabilidad de gemini.

