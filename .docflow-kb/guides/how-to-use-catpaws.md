---
id: guide-how-to-use-catpaws
type: guide
subtype: howto
lang: es
title: "Cómo usar CatPaws en DocFlow"
summary: "Guía operativa para CatPaws: endpoints REST, tools CatBot, howtos (crear/vincular/diagnosticar), anti-patterns y errores comunes migrados desde app/data/knowledge/catpaw.json."
tags: [catpaw, ux]
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
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from app/data/knowledge/catpaw.json during Phase 151" }
ttl: managed
---

# Cómo usar CatPaws en DocFlow

Ver concepto en `../domain/concepts/catpaw.md`.

## Endpoints de la API

- `GET    /api/agents`
- `POST   /api/agents`
- `GET    /api/agents/[id]`
- `PUT    /api/agents/[id]`
- `DELETE /api/agents/[id]`
- `POST   /api/agents/[id]/execute`

## Tools de CatBot

- `list_cat_paws`, `get_cat_paw`, `create_cat_paw`, `update_cat_paw`
- `get_skill`, `list_skills`
- `link_connector_to_catpaw`, `link_skill_to_catpaw`

## Cómo hacer tareas comunes

### Crear un CatPaw (flujo UI)

Ir a `/agents` > Nuevo Agente > elegir modo > configurar skills y conectores.

### Vincular un CatBrain a un CatPaw

Abrir el CatPaw > sección CatBrains > Vincular.

### Vincular un conector a un CatPaw

Abrir el CatPaw > sección Conectores > Vincular.

### Ver procesadores

Ir a `/agents?mode=processor`.

### Protocolo obligatorio antes de crear un CatPaw

Ejecutar `list_cat_paws` antes de crear uno nuevo; buscar si existe uno que cubra 80%+
del requerimiento antes de proponer crear otro.

### Crear un CatPaw nuevo vía CatBot

CatBot sigue el skill system *"Protocolo de creación de CatPaw"* (5 pasos: función →
skills → conectores → system prompt `ROL/MISIÓN/PROCESO/CASOS/OUTPUT` → plan de
aprobación) ANTES de llamar `create_cat_paw`. **NUNCA** llamar `create_cat_paw` sin
aprobación explícita del usuario.

### Operaciones CRM en canvas

Usar CatPaw *"Operador Holded"* con conector Holded MCP. Recibe instrucción natural,
ejecuta herramientas MCP (search, create, update leads/contacts/notes), devuelve JSON
estructurado.

## Anti-patterns (no hacer)

- No crear un CatPaw sin antes verificar que no existe uno similar — usar `list_cat_paws`.
- No crear un agente sin vincular las skills apropiadas — usar `list_skills` para recomendar.
- No confundir *CatPaw* (nombre de agentes) con tipo de nodo canvas — el tipo siempre es `agent`.
- No llamar `create_cat_paw` sin haber presentado el plan de 5 pasos al usuario (skill system *Protocolo de creación de CatPaw*).

## Errores comunes

### `invalid model ID`

- **Causa**: modelo configurado no existe en LiteLLM `routing.yaml`.
- **Solución**: ir a Configuración > verificar modelos activos. Editar el agente y seleccionar un modelo válido.

### CatPaw creado sin system prompt estructurado

- **Causa**: no se siguió el protocolo de 5 pasos (skill system *"Protocolo de creación de CatPaw"*).
- **Solución**: reescribir system prompt con secciones `ROL / MISIÓN / PROCESO / CASOS / OUTPUT`. Temperatura 0.1–0.2 para clasificación/filtrado, 0.4–0.6 para redacción. Formato JSON si alimenta otro nodo, Markdown si es para humano.

### CatPaw llama a `send_email` sin `to/subject/body` y obtiene `{ok:true}`

- **Causa**: INC-12 (pre-137): el wrapper Gmail aceptaba args incompletos.
- **Solución**: cerrado en Phase 137-01. El wrapper Gmail valida `to/subject/body` y exige `messageId` en response. Ver `../incidents/INC-12-*.md` y `.planning/deferred-items.md INC-12`.

## Casos de éxito

- CatBot busca agentes existentes, encuentra uno similar, sugiere reutilizarlo con skills adicionales.
- Usuario crea un CatPaw `hybrid` vinculado a CatBrain de clientes y conector Gmail para responder emails.
- CatBot aplica el skill *"Protocolo de creación de CatPaw"*, presenta plan de 5 pasos al usuario, espera aprobación y solo entonces llama `create_cat_paw`.

## Referencias

- `.planning/research/FEATURES.md`
- `.planning/PROJECT.md`
- `.planning/phases/137-learning-loops-memory-learn/137-03-catbot-intelligence-PLAN.md`
- Concepto: `../domain/concepts/catpaw.md`.
