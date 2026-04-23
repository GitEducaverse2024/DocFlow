---
id: skill-sy-protocolo-de-creacion-de-catpaw
type: resource
subtype: skill
lang: es
title: Protocolo de creacion de CatPaw
summary: Skill del sistema que protocoliza la creacion de un CatPaw nuevo en 5 pasos. Se aplica cuando el architect emite needs_cat_paws o el usuario pide crear un CatPaw.
tags: [skill, system]
audience: [catbot, developer]
status: active
created_at: 2026-04-11T16:35:15.182Z
created_by: kb-sync-bootstrap
version: 1.0.19
updated_at: 2026-04-23T16:41:50.096Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: skill-system-catpaw-protocol-v1
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used, rationale_notes]
change_log:
  - { version: 1.0.15, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.16, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.17, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.18, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.19, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Skill del sistema que protocoliza la creacion de un CatPaw nuevo en 5 pasos. Se aplica cuando el architect emite needs_cat_paws o el usuario pide crear un CatPaw.

## Configuración

- **Category:** system
- **Source:** built-in
- **Version:** 1.0
- **Author:** DoCatFlow
- **times_used:** 0

## Instrucciones

PROTOCOLO DE CREACION DE CATPAW (obligatorio seguir al crear uno nuevo)

PASO 1 — Identifica la funcion del CatPaw:
  ¿Es para el Canvas (debe ser mode: processor)?
  ¿Que tipo de tarea: extractor | transformer | synthesizer | renderer | emitter?
  Declara el role dentro de la taxonomia de 7 roles del milestone v27.0.

PASO 2 — Identifica las skills que necesita:
  Escritura/redaccion -> skill "Redaccion Ejecutiva" o "Copywriting Comercial"
  Analisis -> skill "Investigacion Profunda" o "Marco de Decision"
  Email con template -> skill "Maquetador de Email"
  Formato de output -> skill "Output Estructurado"

PASO 3 — Identifica los conectores necesarios:
  ¿Gmail? -> vincular conector Gmail tras crear
  ¿Drive? -> vincular Educa360Drive
  ¿Holded? -> vincular Holded MCP

PASO 4 — Genera el system prompt con estructura ROL / MISION / PROCESO / CASOS / OUTPUT:
  Temperatura 0.1-0.2 para clasificacion/filtrado, 0.4-0.6 para redaccion.
  Formato 'json' si el output alimenta a otro nodo; 'md' si el output es para un humano.

PASO 5 — Presenta el plan al usuario antes de ejecutar create_cat_paw:
  "Voy a crear el CatPaw 'X' con mode: processor, skills [Y], conector 'Z', temperatura 0.2, output json. ¿Procedo?"
  NUNCA llamar create_cat_paw sin aprobacion explicita del usuario.
