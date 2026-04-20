---
id: incident-inc-03
type: incident
lang: es
title: "INC-03 — Nodo Connector (type=connector) es pass-through, no lee datos"
summary: "Nodo Connector (type=connector) es pass-through, no lee datos"
tags: [canvas, connector, ops]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/incidents-log.md §INC-03" }
ttl: never
---

# INC-03 — Nodo Connector (type=connector) es pass-through, no lee datos

**Fecha:** 2026-03-31
**Severidad:** DISEÑO — no es un bug, es comportamiento esperado que confunde

## Síntoma

Se diseñaron canvases donde un nodo Connector leía emails o archivos de Drive. El nodo Connector NO lee — solo envía/ejecuta como efecto secundario y pasa el output del nodo anterior sin modificar.

## Causa raíz

El nodo Connector está diseñado como side-effect: toma el output del predecesor, lo usa como payload (ej: enviar email), y devuelve ese mismo output al siguiente nodo. NO genera output propio.

## Solución

Para LEER datos de Gmail o Drive, usar un nodo Agent con CatPaw que tenga las tools del conector. El nodo Connector solo sirve para ENVIAR (email, upload, webhook).

**Patrón correcto:**
- Leer emails → Agent con CatPaw Ejecutor Gmail + instructions "usa gmail_search_emails...".
- Enviar email → Connector con conector Gmail (recibe JSON `{to, subject, body}` del nodo anterior).
- Leer archivo Drive → Agent con CatPaw Operador Drive + instructions "usa drive_read_file...".
- Subir archivo → Storage con connectorId de Drive, o Connector con Drive.

## Regla para el futuro

El nodo Connector es un emitter (side-effect + pass-through). Para extractor, usar Agent con CatPaw.
