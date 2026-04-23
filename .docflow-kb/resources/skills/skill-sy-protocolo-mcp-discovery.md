---
id: skill-sy-protocolo-mcp-discovery
type: resource
subtype: skill
lang: es
title: Protocolo MCP Discovery
summary: Skill del sistema que obliga a CatBot a consultar list_connector_tools (o search_kb) antes de responder sobre capacidades de cualquier connector MCP. Previene el fallo de discoverability detectado ...
tags: [skill, system]
audience: [catbot, developer]
status: active
created_at: 2026-04-23T17:04:40.774Z
created_by: kb-sync-bootstrap
version: 1.0.0
updated_at: 2026-04-23T17:04:52.955Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: skill-system-mcp-discovery-v1
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used, rationale_notes]
change_log:
  - { version: 1.0.0, date: 2026-04-23, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
ttl: never
---

## Descripción

Skill del sistema que obliga a CatBot a consultar list_connector_tools (o search_kb) antes de responder sobre capacidades de cualquier connector MCP. Previene el fallo de discoverability detectado en v30.7: CatBot respondia de memoria con tools obsoletas.

## Configuración

- **Category:** system
- **Source:** built-in
- **Version:** 1.0
- **Author:** DoCatFlow
- **times_used:** 0

## Instrucciones

PROTOCOLO MCP DISCOVERY (obligatorio antes de responder sobre capacidades de connectors)

Cuando el usuario pregunte sobre las capacidades de un connector (Holded, LinkedIn, Gmail, etc.) o necesites decidir si existe una tool para una operacion concreta, JAMAS respondas de memoria. El catalogo de tools MCP puede haberse ampliado desde la ultima interaccion y responder con capacidades obsoletas genera planes erroneos y propuestas de canvas con nodos script innecesarios.

## Regla (OBLIGATORIA)

ANTES de responder "puedo/no puedo hacer X con el connector Y":

1. Si conoces el `connector_id` (ej: `seed-holded-mcp`, `seed-linkedin-mcp`) → ejecuta `list_connector_tools({ connector_id: '<id>' })`. Devuelve el array con las tools actuales (name + description).
2. Si NO conoces el id → ejecuta `search_kb({ subtype: 'connector' })` primero para obtener la lista de connectors activos y sus ids, luego paso 1.
3. Solo despues de tener el array actual, responde al usuario con los tools concretos que existen.

La tool `list_connector_tools` es BARATA (solo devuelve name+description, no el body entero del KB resource). No tengas miedo de llamarla — es mucho mas barata que fallar el plan.

## Anti-patterns (PROHIBIDOS)

- Responder "el connector X solo tiene las tools A y B" basado en tu memoria sin consultar `list_connector_tools`.
- Proponer "necesitas crear un script custom / webhook n8n / nodo storage con logica agregadora" sin antes haber confirmado con `list_connector_tools` que la capacidad NO existe en el MCP.
- Asumir que el listado de tools que viste en una sesion previa sigue vigente.
- Responder "no tengo ninguna tool para esto" cuando no has llamado `list_connector_tools` en este turno.

## Ejemplo positivo

Usuario: "Necesito el total facturado en Holded entre enero y abril 2025, que tool uso?"

CatBot correcto:
1. Llama `list_connector_tools({ connector_id: 'seed-holded-mcp' })`.
2. Recibe el array, detecta `holded_period_invoice_summary` con description "Aggregate g
