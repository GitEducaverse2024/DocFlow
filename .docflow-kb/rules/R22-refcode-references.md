---
id: rule-r22-refcode-references
type: rule
subtype: design
lang: es
title: "R22 — Referencias entre entidades usan RefCodes (6 chars), no nombres"
summary: "Referencias entre entidades usan RefCodes (6 chars), no nombres"
tags: [canvas, R22, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R22) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R22 — Referencias entre entidades usan RefCodes (6 chars), no nombres

Referencias entre entidades usan **RefCodes** (6 chars alfanuméricos), no nombres. Lookup tolerante: `ref_code → nombre → parcial → ID`.

## Por qué

- Los nombres cambian ("Pro-K12" → "Pro-K12 2026"). Los RefCodes no.
- Los LLMs renombran ("Pro-K12" → "ProK12", "PRO-K12", "Pro K-12") con altísima frecuencia.
- Un código de 6 chars es copiable exacto por el LLM (menos superficie para errores de transcripción que un nombre largo).

## Cómo funciona el mapeo

1. Cada plantilla/entidad tiene `ref_code` de 6 chars (ej: `K12A01`, `REVI02`) en la DB.
2. La skill "Leads y Funnel Educa360" mapea el producto detectado → ref_code.
3. El LLM copia el ref_code del mapeo en la skill al output: `{plantilla_ref: "K12A01"}`.
4. El connector de render busca por ref_code con lookup tolerante:
   - 1º: exact match `ref_code = "K12A01"`.
   - 2º: match por `name = "K12A01"`.
   - 3º: match por `name LIKE '%K12A01%'`.
   - 4º: match por `id = "K12A01"`.

Si nada matchea → error estructurado (R24), no fallback a "plantilla genérica".

## Ejemplo aplicado (v4c)

Antes de v4c, el Maquetador LLM recibía "Pro-K12" como `plantilla` y buscaba por nombre — fallaba 15% de las veces por variantes de naming.

Post-v4c: Respondedor produce `{plantilla_ref: "K12A01"}` — el Maquetador (ahora connector código) busca exact → 0% fallos.

## Cómo aplicar

1. Cualquier entidad referenciable desde canvas (plantillas, skills, CatPaws, connectores) debe exponer un ref_code.
2. Las skills que referencian entidades incluyen una tabla `producto → ref_code` explícita.
3. El LLM nunca ve nombres en las instrucciones — solo ref_codes.

## Ver también

- **R13** (nombres canónicos — el canónico es el ref_code, no el human-name).
- **R19** (selección vs maquetación).
