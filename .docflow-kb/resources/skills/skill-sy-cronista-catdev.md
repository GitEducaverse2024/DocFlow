---
id: skill-sy-cronista-catdev
type: resource
subtype: skill
lang: es
title: Cronista CatDev
summary: Skill del sistema que obliga a CatBot a consultar el historial (rationale_notes + change_log) antes de modificar una entidad y a ofrecer documentar los cambios significativos tras realizarlos. Gara...
tags: [skill, system]
audience: [catbot, developer]
status: active
created_at: 2026-04-23T13:23:44.042Z
created_by: kb-sync-bootstrap
version: 1.0.9
updated_at: 2026-04-23T17:50:04.138Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: skill-system-cronista-v1
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used, rationale_notes]
change_log:
  - { version: 1.0.5, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.6, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.7, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.8, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.9, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
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

## Historial de mejoras

> Entries gestionadas por la skill "Cronista CatDev" (v30.4). Append-only, idempotente por (date, change). No editar a mano — usar tool `update_skill_rationale` via CatBot.

### 2026-04-23 — _v30.5 sesion 36_ (by user)

**Protocolo Cronista funciona — get_entity_history llamado en 3/3 queries de batería v30.5 P5**

_Por qué:_ Pre-v30.5: 0/3 queries invocaban get_entity_history. Post-v30.5: 3/3 queries lo invocan (1-3 veces por query) antes de proponer reuso de entidades. Cronista + Canvas Inmutables refuerzan la regla R01 dos veces desde ángulos distintos — redundancia intencional.

_Tip:_ Las skills comportamentales pueden combinarse — no hay riesgo de duplicación si las directrices son coherentes. Redundancia ligera aumenta probabilidad de aplicación.

