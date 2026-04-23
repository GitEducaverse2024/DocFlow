---
id: skill-sy-cronista-catdev
type: resource
subtype: skill
lang: es
title: Cronista CatDev
summary: Skill del sistema que obliga a CatBot a consultar el historial (rationale_notes + change_log) antes de modificar una entidad y a ofrecer documentar los cambios significativos tras realizarlos. Gara...
tags: [skill]
audience: [catbot, developer]
status: active
created_at: 2026-04-23T13:23:44.042Z
created_by: kb-sync-bootstrap
version: 1.0.2
updated_at: 2026-04-23T13:45:59.950Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: skill-system-cronista-v1
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used, rationale_notes]
change_log:
  - { version: 1.0.0, date: 2026-04-23, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Skill del sistema que obliga a CatBot a consultar el historial (rationale_notes + change_log) antes de modificar una entidad y a ofrecer documentar los cambios significativos tras realizarlos. Garantiza que las mejoras tecnicas permanezcan trazables para futuras sesiones.

## Configuración

- **Category:** system
- **Source:** built-in
- **Version:** 1.0
- **Author:** DoCatFlow
- **times_used:** 0

## Instrucciones

PROTOCOLO CRONISTA CATDEV (aplica siempre que vayas a modificar cat_paws, canvases, catbrains, connectors o skills)

OBJETIVO
Evitar que las mejoras tecnicas se pierdan en el historial de git y que tu proximo yo reinvente soluciones ya tomadas. La DB + el KB son documentacion viva: cada cambio significativo debe quedar registrado con contexto (que, por que, tip) para que futuras sesiones puedan construir encima.

PROTOCOLO ANTES DE MODIFICAR (lectura proactiva):
PASO 1 - Cuando el usuario te pida modificar una entidad (catpaw, canvas, catbrain, connector, skill), ANTES de ejecutar la modificacion llama:
         get_entity_history({ type: "<tipo>", id: "<id>" })
PASO 2 - Si hay entries en rationale_notes, resumelas al usuario en 1-2 frases:
         "He visto que este <tipo> fue modificado en <sesion_ref> para <change> porque <why>. Tip: <tip>."
         Esto evita reintroducir bugs ya corregidos y respeta decisiones previas.
PASO 3 - Si no hay entries (entity nueva o sin historial), avisa: "No hay rationale_notes previas — cualquier decision de hoy sentara precedente."

PROTOCOLO TRAS MODIFICAR (escritura con consentimiento):
PASO 4 - Tras completar una modificacion significativa, pregunta al usuario:
         "¿Documento esto en rationale_notes? Propuesta:
           change: <1 linea de que cambie>
           why: <razon tecnica o de negocio>
           tip: <gotcha o pattern a recordar>
          Si dices 'si' lo guardo con update_<tipo>_rationale."
PASO 5 - Si aprueba, ejecuta la tool. Si no, no la ejecutes.
PASO 6 - Idempotencia: las tools update_*_rationale hacen no-op si ya existe entry con misma fecha+change. No te preocupes por duplicados.

CRITERIOS PARA DISTINGUIR "CAMBIO SIGNIFICATIVO" DE "MECANICO":
- SI merece rationale_notes: cambio de system_prompt, reescritura de instructions de nodo, bugfix con causa raiz identificada, ajuste de plantilla_ref en routing, ALTER TABLE con columna nueva, migracion de schema, fix a un edge case reportado.
- NO merece r
