---
id: concept-catbrain
type: concept
subtype: catbrain
lang: es
title: "CatBrain — Base de conocimiento RAG"
summary: "Los CatBrains (antes Proyectos) son el núcleo de DoCatFlow: subes documentos, los procesas con IA para generar docs estructurados, y los indexas en un RAG (Qdrant + Ollama) para chatear con el contenido."
tags: [catbrain]
audience: [catbot, architect, developer, user]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from app/data/knowledge/catbrains.json during Phase 151 (concepts + description)" }
ttl: never
---

# CatBrain

## Descripción

Los CatBrains son el núcleo de DoCatFlow. Subes documentos (PDF, URLs, YouTube, notas),
los procesas con IA para generar documentos estructurados, y luego indexas el resultado
en un RAG para poder chatear con el contenido.

Los CatBrains (antes llamados *Proyectos*) permiten crear bases de conocimiento
especializadas. El **RAG** (Retrieval-Augmented Generation) indexa documentos
procesados en vectores (Qdrant + Ollama embeddings) para que puedas hacer preguntas
en lenguaje natural sobre el contenido.

## Conceptos fundamentales

- CatBrains (antes Proyectos) son el núcleo de DoCatFlow.
- **Fuentes**: PDF, URL, YouTube, notas de texto.
- **Procesamiento**: LLM genera documento estructurado a partir de las fuentes.
- **RAG**: indexación en Qdrant con embeddings de Ollama para chat en lenguaje natural.
- Un CatBrain puede tener múltiples fuentes de distintos tipos.
- Los CatBrains se pueden vincular a CatPaws para darles contexto RAG.

## Referencias

- Guía operativa: `../../guides/how-to-use-catbrains.md`.
- Recursos DB poblados: `../../resources/catbrains/` (Phase 150).
- Fuente original: `app/data/knowledge/catbrains.json` (migración Phase 151).
