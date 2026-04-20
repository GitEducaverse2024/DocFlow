---
id: incident-inc-08
type: incident
lang: es
title: "INC-08 — IMAP list_emails devuelve subject/from vacíos"
summary: "IMAP list_emails devuelve subject/from vacíos"
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
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/incidents-log.md §INC-08" }
ttl: never
---

# INC-08 — IMAP list_emails devuelve subject/from vacíos

**Fecha:** 2026-03-31
**Severidad:** CRITICA — Gmail via App Password no lee cabeceras de emails

## Síntoma

`gmail_list_emails` y `gmail_search_emails` devolvían todos los emails con `subject="(sin asunto)"` y `from=""` a pesar de que los emails tenían asunto y remitente reales visibles en Gmail.

## Causa raíz

`imap-simple` devuelve los headers de `HEADER.FIELDS (FROM SUBJECT DATE)` como **objeto** `{from: ['...'], subject: ['...'], date: ['...']}`, no como string raw. El código parseaba con regex asumiendo string, y cuando hacía `JSON.stringify(header)` el formato `{"from":["..."]}` no matcheaba con `/Subject:\s*(.+)/`.

## Solución

En `gmail-reader.ts`:
- Detectar si `header` es objeto o string.
- Si objeto: acceder directamente a `header.subject[0]`, `header.from[0]`, `header.date[0]`.
- Si string: parsear con regex (fallback).

## Regla para el futuro

Las librerías IMAP (como `imap-simple`) devuelven estructuras heterogéneas según la versión y los flags. Validar el tipo antes de parsear con regex.
