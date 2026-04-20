---
id: incident-inc-04
type: incident
lang: es
title: "INC-04 — Storage solo escribe, no lee"
summary: "Storage solo escribe, no lee"
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
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/incidents-log.md §INC-04" }
ttl: never
---

# INC-04 — Storage solo escribe, no lee

**Fecha:** 2026-03-31
**Severidad:** DISEÑO — comportamiento correcto pero no intuitivo

## Síntoma

Se diseñaron canvases donde un nodo Storage leía un JSON de storage previo. El nodo Storage solo ESCRIBE.

## Causa raíz

El nodo Storage tiene un rol de emitter (write). No expone operación de lectura.

## Solución

Para leer archivos previamente guardados:
- Si están en disco local: no hay forma directa desde canvas (el Storage escribe en `PROJECTS_PATH/storage/`).
- Si están en Drive: usar Agent con CatPaw Operador Drive + `drive_read_file`.
- Si están en ambos (`storage_mode=both`): leer desde Drive con Agent.

## Regla para el futuro

Storage = solo escritura. Para lectura de artefactos previos, Agent+CatPaw con el conector adecuado.
