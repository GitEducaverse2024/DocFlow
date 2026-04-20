---
id: rule-r13-canonical-field-names
type: rule
subtype: design
lang: es
title: "R13 — Nombres de campos canónicos idénticos en todo el pipeline"
summary: "Nombres de campos canónicos idénticos en todo el pipeline"
tags: [canvas, R13, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R13) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R13 — Nombres de campos canónicos idénticos en todo el pipeline

Los nombres de campos canónicos son **idénticos** en todo el pipeline. `reply_to_email` es `reply_to_email` en **TODOS** los nodos, de extremo a extremo.

## Por qué

Sin canonicalización estricta, cada nodo LLM reinventa el nombre:

- Lector: `reply_to_email`
- Clasificador: `email_respuesta`
- Respondedor: `to_address`
- Connector: espera `reply_to_email` → no lo encuentra → envía al destinatario equivocado

Esto ocurre incluso con **R10** si los campos originales no existen con ese nombre exacto.

## Incidente real

**Ejecutor v3** recibía `from` como campo del email y usaba eso como `to` del reply. Pero `from` era el remitente técnico de BlastFunnels (noreply-formularios@blastfunnels.com), no el lead real. El reply iba a BlastFunnels.

Fix: introducir campo canónico `reply_to_email` en el Lector desde el primer momento (cruce de headers `Reply-To` y `From` preferiendo `Reply-To`). Todos los nodos downstream usan exactamente `reply_to_email`.

## Cómo aplicar

1. Definir el vocabulario canónico al inicio (con R01).
2. Documentar el vocabulario en el contrato del pipeline.
3. Repetir el nombre literal en cada instrucción de nodo: `"el campo reply_to_email del input"` — nunca parafrasear como "el email de respuesta".
4. El código del Connector traduce del canónico al API externo: `gmail_send_email({ to: item.reply_to_email, ...})` — NO el LLM.

## Vocabulario canónico del pipeline inbound (ejemplo)

| Canónico | Fuente | API destino |
|----------|--------|-------------|
| `reply_to_email` | Lector | Gmail `to` |
| `messageId` | IMAP `Message-ID` | Gmail `In-Reply-To` |
| `threadId` | IMAP thread | Gmail `threadId` |
| `producto_detectado` | Clasificador | RefCode de plantilla |

## Ver también

- **R10** (mantener campos intactos).
- **R22** (RefCodes para referencias entre entidades).
