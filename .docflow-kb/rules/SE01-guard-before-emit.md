---
id: rule-se01-guard-before-emit
type: rule
subtype: side-effects
lang: es
title: "SE01 — Condition guard antes de emit"
summary: "Antes de cada send/write/upload/create insertar condition guard automatico [scope: emitter]"
tags: [canvas, SE01, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-155
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-155
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-155, change: "Migrated from app/data/knowledge/canvas-rules-index.md §Side Effects Guards + Anti-patterns (phase 155 cleanup)" }
ttl: never
---

# SE01 — Condition guard antes de emit

Antes de cada `send`/`write`/`upload`/`create` el canvas inserta automáticamente un nodo guard de tipo `condition` que valida el contrato de entrada del emisor. Scope: **emitter**.

## Por qué

Sin guard un connector puede emitir con contrato corrupto: un `reply_to_email` vacío llega a Gmail `send` y genera un email sin destinatario; un `funnelId` nulo llega a Holded `create_lead` y crea leads huérfanos. El daño es silencioso — el emitter devuelve `ok:true` con payload inválido.

## Cómo aplicar

1. El Pipeline Architect añade un nodo guard justo antes de cada emitter con `required_fields: [...]` derivado del contrato documentado del connector (ver `connectors-catalog.md`).
2. Cada field se valida con `isNonEmpty(v) = v != null && v !== '' && (Array.isArray(v) ? v.length > 0 : true)` (ver **SE02**).
3. Si guard.true → el emisor ejecuta. Si guard.false → ruta a nodo reportador (ver **SE03**).

## Relacionado

- **SE02** (guard valida contrato completo).
- **SE03** (guard.false → auto-repair 1 vez).
- **R22** (RefCodes para lookup tolerante — los required_fields pueden ser IDs que resuelven por refcode).
