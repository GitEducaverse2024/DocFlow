---
id: 31e3dbc4-orquestador-catflow-creacion-inteligente-de-flujos
type: resource
subtype: skill
lang: es
title: Orquestador CatFlow — Creacion Inteligente de Flujos
summary: Protocolo de decision para que CatBot construya flujos Canvas, CatPaws y conectores correctamente. Define cuando crear vs reutilizar, como configurar nodos con agentId/connectorId, y la logica de o...
tags: [skill]
audience: [catbot, developer]
status: active
created_at: 2026-03-26T19:23:03.717Z
created_by: kb-sync-bootstrap
version: 1.0.0
updated_at: 2026-04-17T19:04:19.657Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: 31e3dbc4-f849-4ef5-91cd-adc2bfd2aa7c
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used]
change_log:
  - { version: 1.0.0, date: 2026-04-17, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
ttl: never
---

## Descripción

Protocolo de decision para que CatBot construya flujos Canvas, CatPaws y conectores correctamente. Define cuando crear vs reutilizar, como configurar nodos con agentId/connectorId, y la logica de orquestacion completa.

## Configuración

- **Category:** system
- **Source:** user
- **Version:** 4.0
- **Author:** DoCatFlow Admin
- **times_used:** 23

## Instrucciones

# SKILL: Orquestador Inteligente DoCatFlow
## Version 2.0 — Marzo 2026

---

## DESCRIPCION

Esta skill convierte a CatBot en el orquestador principal de DoCatFlow.
Le da logica de decision para construir flujos completos: saber cuando reutilizar
un CatPaw existente, cuando crear uno nuevo, como configurarlo correctamente,
como estructurar un Canvas, y como vincular conectores con inteligencia.

Sin esta skill, CatBot crea nodos genericos sin agente ni conector asignado,
lo que produce canvas con cajas vacias que no ejecutan nada.

---

## PARTE 1 — ARQUITECTURA DE DOCATFLOW (lo que CatBot debe saber)

### 1.1 Los 5 elementos y su relacion

```
CatBrain  → Base de conocimiento RAG. Contiene documentos procesados.
              UN nodo PROJECT o CATBRAIN en el Canvas = un CatBrain consultado.

CatPaw    → Agente ejecutor. Tiene system prompt, modelo y conectores.
              UN nodo AGENT en el Canvas = un CatPaw especifico por su agentId.

Conector  → Integracion externa (Gmail, Holded MCP, Drive, SearXNG, LinkedIn, HTTP).
              UN nodo CONNECTOR en el Canvas = un conector especifico por su connectorId.
              UN CatPaw puede tener conectores VINCULADOS para usarlos durante su ejecucion.

Canvas    → Flujo visual. Orquesta CatPaws, CatBrains y conectores en secuencia.
              Los nodos reciben el output del nodo anterior como input.

Tarea     → Pipeline secuencial sin conectores externos. Solo CatPaws en cadena.
```

### 1.2 Tipos de nodos del Canvas y que necesitan

El Canvas tiene 12 tipos de nodo registrados. Los 7 tipos principales se pueden crear
con la tool `canvas_add_node`:

| Tipo nodo | Campo obligatorio en `data` | Que pasa sin el |
|-----------|---------------------------|-----------------|
| agent | `agentId` → ID del CatPaw | El nodo ejecuta sin agente → resultado vacio o generico |
| project | `projectId` → ID del CatBrain | El nodo no consulta ningun RAG |
| connector | `connectorId` → ID del conector | El nodo no invoca ningu
