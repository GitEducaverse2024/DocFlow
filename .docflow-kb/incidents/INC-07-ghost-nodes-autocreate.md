---
id: incident-inc-07
type: incident
lang: es
title: "INC-07 — Nodos fantasma del auto-create causan fallos de ejecución"
summary: "Nodos fantasma del auto-create causan fallos de ejecución"
tags: [canvas, canvas, ops]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/incidents-log.md §INC-07" }
ttl: never
---

# INC-07 — Nodos fantasma del auto-create causan fallos de ejecución

**Fecha:** 2026-03-31
**Severidad:** ALTA — canvas falla con "Model input cannot be empty"

## Síntoma

Al crear un canvas vía POST, se generaba automáticamente un nodo Start default. Al hacer PATCH con los nodos reales, el merge del servidor re-añadía el Start default y otros nodos fantasma. Estos nodos no tenían datos válidos y causaban errores al ejecutar.

## Causa raíz

Auto-create de nodo Start en POST + merge del servidor en PATCH. Los nodos auto-creados con IDs diferentes a los del cliente sobrevivían al merge.

## Solución

Limpiar nodos fantasma de los 4 canvases (IDs no reconocidos eliminados). Prevenido a futuro con el fix de [INC-06](INC-06-deleted-nodes-reappear.md) (`force_overwrite`).

## Regla para el futuro

Auto-create de nodos en POST debe alinearse con IDs estables que el cliente pueda referenciar, o no existir.
