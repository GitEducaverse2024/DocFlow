---
id: skill-sy-operador-de-modelos
type: resource
subtype: skill
lang: es
title: Operador de Modelos
summary: Skill del sistema que protocoliza la recomendacion tarea->modelo y el flujo de cambio de LLM via tools list_llm_models/get_catbot_llm/set_catbot_llm.
tags: [skill, system]
audience: [catbot, developer]
status: active
created_at: 2026-04-22T10:58:46.143Z
created_by: kb-sync-bootstrap
version: 1.0.10
updated_at: 2026-04-23T18:34:49.391Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: skill-system-modelos-operador-v1
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used, rationale_notes]
change_log:
  - { version: 1.0.6, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.7, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.8, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.9, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.10, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Skill del sistema que protocoliza la recomendacion tarea->modelo y el flujo de cambio de LLM via tools list_llm_models/get_catbot_llm/set_catbot_llm.

## Configuración

- **Category:** system
- **Source:** built-in
- **Version:** 1.0
- **Author:** DoCatFlow
- **times_used:** 0

## Instrucciones

PROTOCOLO OPERADOR DE MODELOS (aplica cuando el usuario pregunte por modelos o quiera cambiar su LLM)

PROTOCOLO DE RECOMENDACION TAREA -> MODELO

1. TAREA LIGERA (clasificar, formatear, extraer, listar):
   RECOMENDAR: Gemma local (ollama/gemma3:12b o similar, is_local=true, sin coste)
   reasoning_effort: null
   max_tokens: 2048-4096
   JUSTIFICACION: sin coste API, suficiente para tareas mecanicas

2. RAZONAMIENTO PROFUNDO (analizar pipeline complejo, resolver problema encadenado, diagnostico multi-factor):
   RECOMENDAR: Claude Opus (anthropic/claude-opus-4-6, supports_reasoning=true, tier=Elite, max_tokens_cap=32000)
   reasoning_effort: high
   max_tokens: 8192-16384
   thinking_budget: 4096-16384
   JUSTIFICACION: reasoning nativo, mejor quality/capacidad de razonamiento

3. CREATIVA LARGA (redactar documento extenso, brainstorming, narrativa, creacion de contenido):
   RECOMENDAR: Gemini 2.5 Pro (google/gemini-2.5-pro, supports_reasoning=true, tier=Elite, max_tokens_cap=65536)
   reasoning_effort: medium
   max_tokens: 16384-32768
   thinking_budget: 4096-8192 (moderado)
   JUSTIFICACION: thinking moderado evita overengineering en tareas creativas; 65K tokens para outputs largos

4. BALANCE CALIDAD-COSTE (chat diario, operaciones CRUD, preguntas de plataforma):
   RECOMENDAR: anthropic/claude-sonnet-4-6 o google/gemini-2.5-flash (tier=Pro)
   reasoning_effort: low o null
   max_tokens: 4096-8192
   JUSTIFICACION: default razonable para la mayoria de interacciones

PROTOCOLO DE EJECUCION (cuando el usuario pida un cambio):
PASO 1 - Llamar get_catbot_llm para ver config actual
PASO 2 - Llamar list_llm_models para ver opciones (con filtro adecuado si el usuario lo especifica)
PASO 3 - Proponer al usuario: "Te cambio a [modelo] con reasoning_effort=[X], max_tokens=[Y]. ¿Procedo?"
PASO 4 - Esperar confirmacion explicita
PASO 5 - Si no hay sudo activo, avisar: "Necesito modo sudo para ejecutar el cambio. Introduce tu clave en el chat."
PASO 6 - Llamar set_catbot_
