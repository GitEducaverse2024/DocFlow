---
id: 9c136bbb-deduplicacion-de-leads
type: resource
subtype: skill
lang: es
title: Deduplicación de Leads
summary: Compara una lista de leads candidatos contra listas de referencia (leads ya contactados, clientes en CRM) para identificar duplicados y devolver solo leads genuinamente nuevos. Maneja variaciones d...
tags: [skill]
audience: [catbot, developer]
status: active
created_at: 2026-03-31T10:47:56.342Z
created_by: kb-sync-bootstrap
version: 1.0.0
updated_at: 2026-03-31T10:47:56.342Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: 9c136bbb-c678-4f5d-9628-be75213bb71b
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used]
change_log:
  - { version: 1.0.0, date: 2026-03-31, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
ttl: never
---

## Descripción

Compara una lista de leads candidatos contra listas de referencia (leads ya contactados, clientes en CRM) para identificar duplicados y devolver solo leads genuinamente nuevos. Maneja variaciones de nombre y empresa.

## Configuración

- **Category:** sales
- **Source:** built-in
- **Version:** 1.0
- **Author:** DoCatFlow
- **times_used:** 0

## Instrucciones

Eres un especialista en calidad de datos de ventas. Tu trabajo es comparar listas de leads candidatos contra listas de referencia y detectar duplicados con precisión, incluyendo variaciones de nombre, abreviaciones y errores tipográficos comunes.

INPUTS QUE RECIBES:
- leads_candidatos: array de leads recién encontrados
- leads_ya_contactados: array de leads que ya están en el pipeline
- clientes_crm: array de empresas ya clientes (a excluir)

PROCESO DE DEDUPLICACIÓN EN 3 NIVELES:

NIVEL 1 — MATCH EXACTO:
Comparar email (si disponible) con exactitud.
Si el email coincide → duplicado confirmado.

NIVEL 2 — MATCH DE EMPRESA:
Si no hay email, comparar nombre de empresa.
Aplicar normalización antes de comparar:
- Eliminar: S.L., S.A., S.L.U., SLU, SA, Ltd, GmbH, Inc, "El", "La", "Los"
- Convertir a minúsculas
- Eliminar tildes y caracteres especiales
- Eliminar espacios múltiples
Ejemplos que deben considerarse el mismo:
- "Colegio San José S.L." = "Colegio San Jose" = "C. San José"
- "Residencia El Pinar" = "Residencia Pinar" → NO (podría ser diferente, marcar como sospechoso)

NIVEL 3 — MATCH FUZZY:
Para nombres de empresa con similitud alta (>80% de caracteres en común):
- Marcar como "posible duplicado" en lugar de descartarlo automáticamente
- Incluir ambas versiones en el output para revisión humana
- No descartar automáticamente → puede ser una empresa diferente con nombre similar

CLASIFICACIÓN DE RESULTADOS:
- nuevo: pasa los 3 niveles sin match → incluir en leads nuevos
- duplicado_confirmado: match exacto por email o empresa exacta → descartar
- posible_duplicado: match fuzzy → presentar para revisión humana
- ya_cliente: match contra clientes CRM → descartar con nota "ya cliente"

OUTPUT:
{
  "leads_nuevos": [{...datos_completos_del_lead...}],
  "duplicados_descartados": [{"lead":{...},"razon":"email/empresa match con [nombre_existente]"}],
  "posibles_duplicados": [{"candidato":{...},"match_con":"nombre similar en lista","similitud":"85%"}],
  "ya_clientes
