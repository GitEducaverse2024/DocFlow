---
id: skill-sy-canvas-rules-inmutables
type: resource
subtype: skill
lang: es
title: Canvas Rules Inmutables
summary: Skill del sistema con las 8 reglas inmutables R01-R08 para disenar cualquier canvas. Inyectada literal en el prompt de CatBot via buildCanvasInmutableSection (mirror Auditor/Cronista). Antes de v30...
tags: [skill, system]
audience: [catbot, developer]
status: active
created_at: 2026-04-23T14:45:20.345Z
created_by: kb-sync-bootstrap
version: 1.0.5
updated_at: 2026-04-23T16:41:50.097Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: skill-system-canvas-inmutable-v1
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used, rationale_notes]
change_log:
  - { version: 1.0.1, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.3, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.4, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.5, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Skill del sistema con las 8 reglas inmutables R01-R08 para disenar cualquier canvas. Inyectada literal en el prompt de CatBot via buildCanvasInmutableSection (mirror Auditor/Cronista). Antes de v30.5 estas reglas vivian en el skill Orquestador CatFlow que esta en lazy-load — el LLM no las cargaba.

## Configuración

- **Category:** system
- **Source:** built-in
- **Version:** 1.0
- **Author:** DoCatFlow
- **times_used:** 0

## Instrucciones

REGLAS INMUTABLES DE DISENO DE CANVAS (prioridad absoluta, aplican en planificacion, no solo en ejecucion)

Si tu plan menciona una entidad como reusable o propone crear una, ya has tomado una decision que debe cumplir estas reglas. No puedes corregir despues sin perder credibilidad — re-planifica antes de enviar la respuesta.

## R01 — Historial antes de decidir
Antes de mencionar una entidad (catpaw/canvas/catbrain/connector/skill) como candidata a reuso o modificacion, llama `get_entity_history({type, id})`. Resume al usuario los 1-3 ultimos cambios relevantes. Aplica en planificacion, no solo en ejecucion.

## R02 — Detalle completo antes de afirmar reuso
Nunca afirmes que una entidad "esta vacia", "sirve para X" o "esta bien configurada" sin haber cargado su detalle (`get_cat_paw` / `get_skill` / `get_email_template` / `get_kb_entry`). Cita textualmente un fragmento de sus instructions reales que justifique el reuso.

## R03 — Calculos numericos NO se delegan al LLM (regla CRITICA)
Sumas, conteos, promedios, porcentajes, agregaciones temporales, comparativas numericas, ranking, estadisticas: van en nodos deterministicos (`storage` con script, `connector` a endpoint SQL, nodo script). El LLM interpreta/narra/clasifica — no calcula.

ANTI-PATTERN CONCRETOS (todos prohibidos — re-planifica si tu plan los incluye):
- Agent "Validador Matematico" / "Calculador Estricto" / "Calculador" / "Auditor Financiero" / "Analista Comparativo" / "Contador" / "Verificador Aritmetico".
- Instrucciones tipo "Solo puedes realizar sumas y conteos" o "recalcula total=sum(lineas)" o "valida que las sumas cuadren" a un agent LLM.
- Modelos tier Elite con reasoning=high delegados a "razonar matematicamente". El razonamiento detecta errores pero NO los evita.

PATTERN CORRECTO: storage/script calcula → agent recibe numeros YA validados y los NARRA.

## R04 — Enumerar alternativas antes de proponer crear
Antes de crear conector/catpaw/skill/template nuevo, enumera alternativas: tools `<do

## Historial de mejoras

> Entries gestionadas por la skill "Cronista CatDev" (v30.4). Append-only, idempotente por (date, change). No editar a mano — usar tool `update_skill_rationale` via CatBot.

### 2026-04-23 — _v30.5 sesion 36_ (by user)

**Creación skill Canvas Rules Inmutables v1.0 con 8 reglas R01-R08 + checklist obligatorio**

_Por qué:_ Las mismas 8 reglas vivían en PARTE 0 del skill Orquestador largo pero ese skill está en lazy-load silencioso — CatBot nunca las cargaba (0/3 tool calls get_skill en pruebas previas). Mover a skill dedicada corta + inyección literal via buildCanvasInmutableSection() (mirror Auditor/Cronista) garantiza que las reglas llegan al prompt siempre.

_Tip:_ Patrón byte-symmetric INSERT OR IGNORE + UPDATE canonical (mirror Phase 161-01). Seed ~4k chars con las 8 reglas + anti-patterns R03 concretos + checklist R01-R08 que CatBot pega al final de sus respuestas.

