---
id: 36f0a6ca-holded-erp-guia-operativa-para-asistentes
type: resource
subtype: skill
lang: es
title: Holded ERP — Guía Operativa para Asistentes
summary: "Instrucciones completas para operar Holded: fichajes, imputación de horas, CRM/leads, proyectos, facturación y marketing. Diferencia crítica entre fichar e imputar."
tags: [skill]
audience: [catbot, developer]
status: active
created_at: 2026-03-25T08:44:19.473Z
created_by: kb-sync-bootstrap
version: 1.0.1
updated_at: 2026-04-23T13:45:54.316Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: 36f0a6ca-7375-4162-b6a3-7acbe161060e
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used, rationale_notes]
change_log:
  - { version: 1.0.0, date: 2026-03-25, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Instrucciones completas para operar Holded: fichajes, imputación de horas, CRM/leads, proyectos, facturación y marketing. Diferencia crítica entre fichar e imputar.

## Configuración

- **Category:** format
- **Source:** user
- **Version:** 1.0
- **Author:** DoCatFlow Admin
- **times_used:** 0

## Instrucciones

# GUÍA HOLDED ERP PARA ASISTENTES

## 1. CONCEPTO FUNDAMENTAL: FICHAR ≠ IMPUTAR

Estos son los DOS sistemas de registro de tiempo en Holded. Son independientes y NO intercambiables.

### FICHAR (Jornada Laboral / Control Horario Legal)
- **Qué es**: Registro de entrada/salida del empleado. Obligatorio por ley en España.
- **Herramientas**: `holded_create_timesheet`, `holded_clock_in`, `holded_clock_out`, `holded_clock_pause`, `holded_clock_unpause`
- **Endpoint API**: `/team/v1/employees/{employeeId}/times`
- **Datos clave**: `employeeId` (del módulo Team, NO holdedUserId), `startTmp` y `endTmp` como timestamps Unix en SEGUNDOS como STRING
- **SÍ acepta fechas pasadas**: Puedes crear fichajes retroactivos con `holded_create_timesheet` indicando `date` (YYYY-MM-DD) + `startTime`/`endTime` (HH:MM, zona Europe/Madrid)
- **Ejemplo con pausa**: Para jornada 08:00-18:00 con 2h de pausa (14:00-16:00), crear DOS fichajes:
  - Mañana: date=2026-01-15, startTime=08:00, endTime=14:00
  - Tarde: date=2026-01-15, startTime=16:00, endTime=18:00

### IMPUTAR (Horas a Proyecto / Coste Interno)
- **Qué es**: Asignar horas trabajadas a un proyecto específico para control de costes.
- **Herramientas**: `holded_register_time`, `holded_batch_register_times`, `holded_create_time_entry`
- **Endpoint API**: `/projects/v1/projects/{projectId}/times`
- **Datos clave**: `projectId`, `duration` en SEGUNDOS (1h=3600, 2h=7200, 5h=18000), `costHour` (requerido, puede ser 0), `userId` (holdedUserId del empleado, NO el employeeId)
- **⚠️ NO acepta fechas pasadas**: La API de Holded IGNORA el campo date en este endpoint. Siempre registra con la fecha del servidor (hoy). Esta es una limitación de la API de Holded, no del MCP.
- **Implicación**: La imputación DEBE hacerse el mismo día o se registrará con fecha incorrecta.

### Tabla resumen
| Concepto | Fichar | Imputar |
|----------|--------|---------|
| Propósito | Control horario legal | Coste por proyecto |
| Módulo Holded | Team (RRHH) | Projects
