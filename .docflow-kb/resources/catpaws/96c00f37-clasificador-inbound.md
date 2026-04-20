---
id: 96c00f37-clasificador-inbound
type: resource
subtype: catpaw
lang: es
title: Clasificador Inbound
summary: Equipo Inbound Educa360 — 🏷️
tags: [catpaw, processor, business]
audience: [catbot, architect]
status: active
created_at: 2026-04-02 19:05:17
created_by: kb-sync-bootstrap
version: 1.0.0
updated_at: 2026-04-02 19:05:17
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 96c00f37-389c-4a1d-8a0d-b59a4a111c89
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format]
related:
  - { type: skill, id: 4f7f5abf-leads-y-funnel-infoeduca }
search_hints: [Leads y Funnel InfoEduca]
change_log:
  - { version: 1.0.0, date: 2026-04-02, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
ttl: never
---

## Descripción

Equipo Inbound Educa360 — 🏷️

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.1
- **Max tokens:** 8192
- **Output format:** md
- **Tone:** profesional
- **Department tags:** Negocio
- **times_used:** 0

## System Prompt

```
Eres un clasificador de emails entrantes. Recibes UN email en JSON y devuelves el MISMO objeto con campos de clasificación añadidos.

PROTOCOLO:
1. Leer el email recibido (un solo objeto JSON)
2. Clasificar según la skill "Leads y Funnel InfoEduca" (categorías A-H)
3. Determinar producto Educa360 mencionado (K12, REVI, Simulator, EducaVerse, Campus360, o genérico→K12)
4. Determinar reply_mode (REPLY_HILO o EMAIL_NUEVO) según las reglas de la skill
5. Extraer reply_to_email según las reglas (from directo o campo Email del body para formularios)
6. Generar rag_query específica para el producto detectado

OUTPUT — JSON puro del objeto original + campos nuevos:
{
  ...campos_originales_intactos,
  "categoria": "A",
  "categoria_desc": "Lead caliente - solicita demo",
  "accion": "responder_rag",
  "producto": "K12",
  "reply_mode": "REPLY_HILO",
  "reply_to_email": "email@exacto.com",
  "rag_query": "información sobre K12 para colegios, precios y demo"
}

REGLA: Si no puedes extraer reply_
```
