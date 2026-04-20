---
id: concept-catpaw
type: concept
subtype: catpaw
lang: es
title: "CatPaw — Agente unificado con 3 modos"
summary: "Los CatPaws son agentes unificados con 3 modos (chat/processor/hybrid) que se vinculan a CatBrains, conectores y skills. Entidad de primer nivel en DocFlow — Workers migrados a modo processor."
tags: [catpaw]
audience: [catbot, architect, developer, user]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from app/data/knowledge/catpaw.json during Phase 151 (concepts + description)" }
ttl: never
---

# CatPaw

## Descripción

Los Agentes (**CatPaws**) son entidades unificadas con 3 modos:

- **chat** — agentes conversacionales para interacción directa.
- **processor** — procesadores de documentos (antes llamados Workers).
- **hybrid** — combinan chat y procesamiento de documentos.

Se crean en `/agents` y se pueden vincular a CatBrains (contexto RAG), conectores
(integraciones externas) y skills (instrucciones reutilizables). Los Docs Workers
han sido migrados a CatPaws con modo processor. Visita `/agents?mode=processor`
para ver los procesadores.

## Conceptos fundamentales

- CatPaws (Agentes) son entidades unificadas con 3 modos: `chat`, `processor`, `hybrid`.
- **Modo chat**: agentes conversacionales para interacción directa.
- **Modo processor**: procesadores de documentos (antes llamados Workers).
- **Modo hybrid**: combinan chat y procesamiento de documentos.
- Los CatPaws se vinculan a CatBrains (contexto RAG), conectores (integraciones) y skills (instrucciones).
- **SIEMPRE** buscar agentes existentes antes de crear uno nuevo — `list_cat_paws` primero.
- Los Workers han sido migrados a CatPaws modo processor.
- **Protocolo de creación de CatPaw** (Phase 137-03, LEARN-01): skill del sistema *"Protocolo de creación de CatPaw"* con los 5 pasos (función, skills, conectores, system prompt con estructura ROL/MISIÓN/PROCESO/CASOS/OUTPUT, plan de aprobación). CatBot lo inyecta automáticamente cuando el architect emite `needs_cat_paws` o el usuario pide crear un CatPaw.
- **CatPaw "Operador Holded"** (id: `53f19c51-9cac-4b23-87ca-cd4d1b30c5ad`) es el agente CRM generalista para canvas. Acepta cualquier instrucción CRM en lenguaje natural. Usar en vez de *Consultor CRM* para pipelines flexibles.

## Referencias

- Guía de uso: `../../guides/how-to-use-catpaws.md`.
- Catálogo de CatPaws reales: `../../resources/catpaws/` (populado por Phase 150).
- Fuente original: `app/data/knowledge/catpaw.json` (migración Phase 151).
