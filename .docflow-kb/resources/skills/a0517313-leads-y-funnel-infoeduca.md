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
version: 1.0.0
updated_at: 2026-04-03 15:39:49
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: a0517313-ecee-45e1-b930-10725f2261d4
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used]
change_log:
  - { version: 1.0.0, date: 2026-04-03, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
ttl: never
---

## Descripción

Inteligencia comercial de Educa360. Define cómo identificar, clasificar y tratar cada tipo de lead que contacta a la empresa, con reglas de reply, plantillas asignadas y estrategia de respuesta por producto.

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
