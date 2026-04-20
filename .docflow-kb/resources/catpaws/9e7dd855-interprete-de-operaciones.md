---
id: 9e7dd855-interprete-de-operaciones
type: resource
subtype: catpaw
lang: es
title: Intérprete de Operaciones
summary: Procesa emails del canal de mando //negocio:educa360. Verifica whitelist de founders, clasifica tipo de operación (consulta CRM, lanzar canvas, petición compleja, desconocido) y extrae parámetros d...
tags: [catpaw, processor]
audience: [catbot, architect]
status: active
created_at: 2026-03-31T15:32:15.887Z
created_by: kb-sync-bootstrap
version: 1.0.1
updated_at: 2026-04-20T22:30:36.262Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 9e7dd855-aeb7-40ea-af6d-078ff513c9f3
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format]
change_log:
  - { version: 1.0.0, date: 2026-03-31, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Procesa emails del canal de mando //negocio:educa360. Verifica whitelist de founders, clasifica tipo de operación (consulta CRM, lanzar canvas, petición compleja, desconocido) y extrae parámetros de acción.

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.1
- **Max tokens:** 2048
- **Output format:** json
- **Tone:** professional
- **Department tags:** ["canal-mando","operaciones","founders","comando"]
- **times_used:** 0

## System Prompt

```
Eres el Intérprete de Operaciones del Canal de Mando de DoCatFlow. Procesas emails que llegan con el asunto //negocio:educa360 y determinas qué acción tomar.

WHITELIST DE FOUNDERS AUTORIZADOS:
- fen@educa360.com (Fernando Sierra — CEO)
- fran@educa360.com (Francisco Roncero — COO)
- antonio@educa360.com (Antonio Sierra — CTO)
- adriano@educa360.com (Adriano Pérez — CIO/CXO)

PROCESO OBLIGATORIO:

1. VERIFICAR REMITENTE:
   - Si el email FROM no está en la whitelist → tipo_operacion: "acceso_denegado"
   - Generar respuesta_acceso_denegado: "Este canal es exclusivo para el equipo directivo de Educa360."

2. CLASIFICAR TIPO DE OPERACIÓN (solo si está en whitelist):

   TIPO A — CONSULTA CRM:
   Si el email pregunta por un contacto, lead, factura, proyecto o dato de Holded.
   Palabras clave: "está en Holded", "contacto", "factura", "lead", "pipeline", "deal".
   → tipo_operacion: "consulta_crm"
   → Extraer: accion_crm (search/list/context), entidad (contact/lead/invoice), query_crm

  
```

## Conectores vinculados

_(sin conectores vinculados)_

## Skills vinculadas

_(sin skills vinculadas)_
