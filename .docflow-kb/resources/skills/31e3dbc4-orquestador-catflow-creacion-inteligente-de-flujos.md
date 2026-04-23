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
version: 1.0.3
updated_at: 2026-04-23T16:41:00.526Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: 31e3dbc4-f849-4ef5-91cd-adc2bfd2aa7c
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used, rationale_notes]
change_log:
  - { version: 1.0.0, date: 2026-04-17, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-23, author: api:skills.PATCH, change: "Auto-sync patch bump (warning: DB overwrote local human edit in fields_from_db)" }
  - { version: 1.0.3, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Protocolo de decision para que CatBot construya flujos Canvas, CatPaws y conectores correctamente. Define cuando crear vs reutilizar, como configurar nodos con agentId/connectorId, y la logica de orquestacion completa.

## Configuración

- **Category:** system
- **Source:** user
- **Version:** 4.0
- **Author:** DoCatFlow Admin
- **times_used:** 24

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

## Historial de mejoras

> Entries gestionadas por la skill "Cronista CatDev" (v30.4). Append-only, idempotente por (date, change). No editar a mano — usar tool `update_skill_rationale` via CatBot.

### 2026-04-23 — _v30.4 post-shipping sesion 35_ (by user)

**PARTE 0 anadida con 8 reglas inmutables R01-R08**

_Por qué:_ Tras experimento meta con canvas Comparativa facturacion cuatrimestre, se detectaron 8 fallos de planteamiento de CatBot al disenar canvas complejos (no llamaba get_entity_history, no verificaba detalle de entidades antes de reusarlas, delegaba calculos numericos al LLM, proponia crear conectores sin enumerar alternativas, mezclaba datasets distintos en un iterator, asumia batching nativo, no ofrecia rationale al terminar, mencionaba skills por nombre sin verificar ID). Las 8 reglas se consolidan como PRINCIPIOS inmutables al inicio del skill, con nomenclatura propia R01-R08 (no confundir con R26-R29 del KB critico).

_Tip:_ La PARTE 0 va ANTES de la PARTE 1 para que CatBot la lea primero. Son 8 reglas genericas, no hardcodean caso Holded/facturacion.

### 2026-04-23 — _v30.4 post-shipping iter2 sesion 35_ (by user)

**PARTE 0 iteracion v2: anti-patterns explicitos + checklist visible obligatorio**

_Por qué:_ Plan v2 (post-upgrade v1) mostro que R01/R02/R07 seguian fallando (interpretadas como no-aplica-en-planificacion) y R03 contraintuitiva (CatBot seguia proponiendo Validador Matematico/Auditor Financiero como agents LLM). Refuerzo: cada regla tiene ahora test de auto-verificacion explicito, anti-pattern concreto + pattern correcto, y un checklist 8-items que CatBot debe pegar al final de su respuesta con marcas ✓/✗. Esto fuerza al LLM a auto-evaluar antes de responder.

_Tip:_ Ejemplos negativos CONCEPTUALES (sin hardcodear caso Holded) son claves — solo reglas abstractas no calan con LLMs que tienden a patrones generativos.

### 2026-04-23 — _v30.5 sesion 36_ (by user)

**Revert PARTE 0 v2 (código muerto — skill en lazy-load, reglas nunca llegaban al LLM)**

_Por qué:_ P1 AUDIT v30.5 confirmó empíricamente que buildSkillsProtocols solo dice llama-a-get_skill (lazy-load) en vez de inyectar literal. En 3 pruebas consecutivas CatBot nunca llamó get_skill(Orquestador CatFlow). Las 8 reglas se mueven a skill-system-canvas-inmutable-v1 con injection literal. Orquestador vuelve a su estado pre-v30.4 iter1 (47014 chars).

_Tip:_ Antes de añadir reglas a un skill existente, verificar con scripts/audit-skill-injection.cjs que está en status LITERAL, no LAZY-LOAD.

