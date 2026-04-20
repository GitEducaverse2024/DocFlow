---
id: incident-inc-09
type: incident
lang: es
title: "INC-09 — IMAP search con query \"is:unread\" no funciona"
summary: "IMAP search con query \"is:unread\" no funciona"
tags: [canvas, connector, email, ops]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/incidents-log.md §INC-09" }
ttl: never
---

# INC-09 — IMAP search con query "is:unread" no funciona

**Fecha:** 2026-03-31
**Severidad:** ALTA — búsqueda de no leídos devuelve resultados incorrectos

## Síntoma

`gmail_search_emails` con query "is:unread" no devolvía resultados o devolvía todos. El query estilo Gmail "is:unread" no es válido en IMAP.

## Causa raíz

El código IMAP traducía cualquier query a `OR SUBJECT "query" FROM "query"`. El string "is:unread" se buscaba literalmente en subject/from, lo cual no tiene sentido.

## Solución

Traducción de queries Gmail-style a criterios IMAP en `gmail-reader.ts`:

- `is:unread` → `UNSEEN`.
- `from:email@x.com` → `FROM email@x.com`.
- `subject:"texto"` → `SUBJECT texto`.
- Texto genérico → `OR SUBJECT texto FROM texto`.

## Regla para el futuro

Cuando una función acepta sintaxis ajena (ej: Gmail search syntax), documentar explícitamente la traducción que se aplica. No asumir equivalencia naïve con el backend.
