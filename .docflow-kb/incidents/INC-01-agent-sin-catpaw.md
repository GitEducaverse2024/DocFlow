---
id: incident-inc-01
type: incident
lang: es
title: "INC-01 — Nodo Agent sin CatPaw no tiene acceso a tools de conectores"
summary: "Nodo Agent sin CatPaw no tiene acceso a tools de conectores"
tags: [canvas, catpaw, gmail, ops]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/incidents-log.md §INC-01" }
ttl: never
---

# INC-01 — Nodo Agent sin CatPaw no tiene acceso a tools de conectores

**Fecha:** 2026-03-31
**Severidad:** CRITICA — bloquea cualquier canvas que use Gmail/Drive/Holded

## Síntoma

Un nodo Agent del canvas con `agentId: null` e `instructions` que piden usar `gmail_search_emails` o `drive_read_file` no ejecuta las herramientas. El LLM responde con un JSON describiendo lo que haría pero no lo hace.

## Causa raíz

Cuando `agentId` es null, el canvas executor usa llamada LLM directa (`callLLM`) que NO tiene tool-calling. Las tools de Gmail/Drive/MCP solo se inyectan cuando hay un CatPaw vinculado que pasa por `executeCatPaw()`.

## Solución

1. Crear CatPaws utilitarios con los conectores vinculados:
   - **Ejecutor Gmail** (id: `65e3a722-9e43-43fc-ab8a-e68261c6d3da`) — conector Info Educa360 Gmail.
   - **Operador Drive** (id: `e05f112e-f245-4a3b-b42b-bb830dd1ac27`) — conector Educa360Drive.
2. Asignar estos CatPaws como `agentId` en todos los nodos Agent que necesiten operar con conectores.

## Regla para el futuro

NUNCA crear un nodo Agent en canvas con `agentId: null` si necesita usar herramientas de conectores. Siempre vincular un CatPaw que tenga el conector linkado.
