---
id: a0517313-leads-y-funnel-infoeduca
type: resource
subtype: skill
lang: es
title: Leads y Funnel InfoEduca
summary: Inteligencia comercial de Educa360. Define cómo identificar, clasificar y tratar cada tipo de lead que contacta a la empresa, con reglas de reply, plantillas asignadas y estrategia de respuesta por...
tags: [skill]
audience: [catbot, developer]
status: active
created_at: 2026-04-02T08:15:20.899Z
created_by: kb-sync-bootstrap
version: 1.0.2
updated_at: 2026-04-23T13:45:54.321Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: a0517313-ecee-45e1-b930-10725f2261d4
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used, rationale_notes]
change_log:
  - { version: 1.0.0, date: 2026-04-03, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-23, author: api:skills.PATCH, change: "Auto-sync patch bump (warning: DB overwrote local human edit in fields_from_db)" }
  - { version: 1.0.2, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Inteligencia comercial de Educa360. Define cómo identificar, clasificar y tratar cada tipo de lead que contacta a la empresa, con reglas de reply, plantillas asignadas y estrategia de respuesta por producto.

---
[v4d-doc-v1]

**Leads y Funnel InfoEduca** — Inteligencia comercial Educa360. Mapping productos -> plantillas -> modo de respuesta.

## Usado por

- Respondedor Inbound en canvas "Control Leads Info@Educa360.com" (`test-inbound-ff06b82c`) para resolver plantilla_ref segun producto.

## Contrato de output del respondedor

Plantilla por producto (ref_codes actuales):
- K12 → xsEEpE (Pro-K12)
- REVI → v7aW5V (Pro-REVI)
- Educaverse → B8g3mU (Pro-Educaverse)
- Simulator → fsJ7Ac (Pro-Simulator)
- Patrimonio VR → Corporativa Educa360 (fallback actual: bynab4 Respuesta Comercial)
- Sin match → bynab4

## Tips

- Los templates Pro-K12 y Pro-Educaverse tienen instruction block `cuerpo_respuesta` (populate v30.3 P3, marcador TPL-K12-V4D / TPL-ED-V4D) — el respondedor genera cuerpo y se inyecta ahi.
- Existen duplicados `comercial` vs `commercial` por KB-44 pre-existente; la canonica es `commercial`.

## Configuración

- **Category:** sales
- **Source:** user
- **Version:** 1.0
- **Author:** DoCatFlow Admin
- **times_used:** 0

## Instrucciones

# Leads y Funnel InfoEduca

Esta skill define la inteligencia comercial de Educa360 para el tratamiento de leads entrantes. Úsala para identificar correctamente el tipo de lead, el producto de interés, la plantilla a usar y el modo de respuesta.

---

## 1. PRODUCTOS EDUCA360 Y SEÑALES DE RECONOCIMIENTO

### Educa360 K12 (Primaria y Secundaria)
Producto principal. Plataforma educativa para colegios con VR, IA y gestión de aula.
- Señales: menciona colegio, centro educativo, primaria, secundaria, ESO, bachillerato, profesores, alumnos, aula, docentes, digitalización educativa, innovación en el aula
- Público: directores de colegio, coordinadores TIC, profesores referentes, jefes de estudios
- Plantilla: Pro-K12
- Ticket: desde 7,90€/mes por docente hasta 99,90€/mes centro completo

### REVI
Programa de intervención terapéutica para personas mayores mediante realidad virtual.
- Señales: menciona residencia, centro de día, personas mayores, tercera edad, estimulación cognitiva, terapia, bienestar, geriatría, psicólogo, terapeuta, animación sociocultural
- Público: directores de residencia, responsables de calidad asistencial, coordinadores terapéuticos
- Plantilla: Pro-REVI
- Entrada: piloto, proyecto a medida

### Patrimonio VR
Experiencias de realidad virtual para difusión del patrimonio histórico y cultural.
- Señales: menciona patrimonio, museo, ayuntamiento, turismo, historia, cultura, municipio, visita virtual, bien cultural, arqueología, monumento
- Público: concejales de cultura/turismo, técnicos de patrimonio, directores de museo
- Plantilla: Corporativa Educa360
- Ticket: desde 14.800€ netos (más del 60% cofinanciado por Ministerio de Cultura)

### EducaSimulator
Simuladores inmersivos VR/AR para Formación Profesional.
- Señales: menciona FP, formación profesional, ciclo formativo, simulador, ATECA, prácticas, taller, soldadura, mecánica, sanidad, logística, riesgo laboral
- Público: directores de centros FP, coordinadores de ciclos, jefes de taller
- Plantil

## Historial de mejoras

> Entries gestionadas por la skill "Cronista CatDev" (v30.4). Append-only, idempotente por (date, change). No editar a mano — usar tool `update_skill_rationale` via CatBot.

### 2026-04-23 — _v30.3 sesion 34_ (by catdev-backfill)

**Mapping producto → plantilla_ref hardcoded en respondedor (ref_codes)**

_Por qué:_ El respondedor del canvas Inbound usa esta skill implícitamente pero los plantilla_ref (xsEEpE K12, v7aW5V REVI, B8g3mU Educaverse, fsJ7Ac Simulator, bynab4 fallback) se hardcoded en las instrucciones del nodo — la skill documenta las Plantillas por nombre, no por ref_code.

_Tip:_ Cuando se añada un producto nuevo, actualizar instructions del respondedor + la skill. KB-44 (duplicados commercial/comercial) sigue sin resolver, usar SIEMPRE las canónicas.

