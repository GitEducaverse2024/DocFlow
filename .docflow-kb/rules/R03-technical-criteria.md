---
id: rule-r03-technical-criteria
type: rule
subtype: design
lang: es
title: "R03 — Traducir problema de negocio a criterios técnicos verificables"
summary: "Traducir problema de negocio a criterios técnicos verificables"
tags: [canvas, R03, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R03) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R03 — Traducir problema de negocio a criterios técnicos verificables

Traducir el problema de negocio a criterios técnicos verificables. **"Emails sin respuesta" ≠ "emails no leídos"**.

## Por qué

"Sin respuesta" es un criterio de negocio. "Unread" es un criterio técnico IMAP. No son lo mismo: un email leído puede seguir sin respuesta; un email no leído puede ser spam que no necesita respuesta.

Traducir mal el criterio significa que el pipeline procesa los emails equivocados o omite los que debe atender.

## Cómo aplicar

1. Negocio: "emails del buzón info@ sin respuesta de los últimos 7 días".
2. Técnico verificable: "emails en INBOX con `date >= now-7d`, para los que NO existe un email en SENT con el mismo `threadId`".
3. Implementación: cruce entre dos listas IMAP (INBOX vs SENT) por `threadId`.

## Ejemplo del fail

El pipeline v1 usaba `is:unread` como proxy de "sin respuesta". Resultado: dejó sin responder 3 emails importantes que el usuario había abierto en el móvil, y respondió 2 spam-newsletter.

## Antipattern

Que el LLM decida el criterio: "considera si es un email que merece respuesta". La decisión vaga produce resultados aleatorios entre ejecuciones (R17).
