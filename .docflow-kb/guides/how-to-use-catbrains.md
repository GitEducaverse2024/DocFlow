---
id: guide-how-to-use-catbrains
type: guide
subtype: howto
lang: es
title: "Cómo usar CatBrains en DocFlow"
summary: "Guía operativa de CatBrains: endpoints, tools CatBot, cómo crear/procesar/indexar/chatear, errores comunes (Qdrant/Ollama connection refused, collection not exists) y anti-patterns."
tags: [catbrain, ux]
audience: [catbot, user, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
last_accessed_at: 2026-04-20T00:00:00Z
access_count: 0
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from app/data/knowledge/catbrains.json during Phase 151" }
ttl: managed
---

# Cómo usar CatBrains en DocFlow

Ver concepto en `../domain/concepts/catbrain.md`.

## Endpoints de la API

- `GET  /api/catbrains`
- `POST /api/catbrains`
- `GET  /api/catbrains/[id]`
- `POST /api/catbrains/[id]/sources`
- `POST /api/catbrains/[id]/process`
- `POST /api/catbrains/[id]/rag/index`
- `POST /api/catbrains/[id]/rag/chat`

## Tools de CatBot

- `list_catbrains`, `create_catbrain`, `search_documentation`

## Cómo hacer tareas comunes

### Crear un CatBrain

Ir a `/catbrains` > Nuevo CatBrain > subir fuentes > procesar > indexar RAG.

### Chatear con un CatBrain

Abrir el CatBrain > pestaña RAG > chatear.

### Vincular un CatBrain a un agente

Ir al CatPaw > sección CatBrains > Vincular.

### Re-procesar fuentes

Abrir el CatBrain > pestaña Fuentes > seleccionar > Procesar.

## Anti-patterns (no hacer)

- No procesar sin fuentes subidas.
- No indexar RAG sin haber procesado primero.
- No eliminar un CatBrain que esté vinculado a CatPaws activos sin desvincular primero.

## Errores comunes

### `collection does not exist`

- **Causa**: proyecto no procesado o colección RAG borrada.
- **Solución**: ir al proyecto > pestaña RAG > re-procesar.

### `Qdrant connection refused`

- **Causa**: contenedor Qdrant no está corriendo.
- **Solución**: verificar en CatBoard. `docker compose up -d docflow-qdrant`.

### `Ollama connection refused`

- **Causa**: contenedor Ollama no está corriendo para generar embeddings.
- **Solución**: verificar en CatBoard. `docker compose up -d docflow-ollama`.

## Casos de éxito

- Usuario sube 5 PDFs, procesa, indexa RAG, y chatea obteniendo respuestas con citas.
- CatBot crea un CatBrain vía tool, sube una URL, y lo vincula a un agente.

## Referencias

- `.planning/research/FEATURES.md`
- `.planning/PROJECT.md`
- Concepto: `../domain/concepts/catbrain.md`.
