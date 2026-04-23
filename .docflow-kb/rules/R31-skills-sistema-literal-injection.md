---
id: rule-r31-skills-sistema-literal-injection
type: rule
subtype: architecture
lang: es
title: "R31 — Skills sistema con reglas criticas requieren literal-injection en el prompt"
summary: "Skills category=system cuyo contenido debe influir en TODO mensaje del LLM se inyectan literal en el system prompt; lazy-load via get_skill solo es aceptable para detalle on-demand"
tags: [critical, architecture, prompt, skills, system]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-23T14:00:00Z
created_by: v30.5-p3
version: 1.0.0
updated_at: 2026-04-23T14:00:00Z
updated_by: v30.5-p3
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-23, author: v30.5-p3, change: "Created after bug discovery session 35 — skill Orquestador en lazy-load silencioso" }
ttl: never
---

# R31 — Skills sistema con reglas criticas requieren literal-injection

## Regla

Cualquier skill `category='system'` cuyo contenido deba influir en **todo mensaje futuro del LLM**
(reglas de comportamiento, protocolos obligatorios, principios de diseno, anti-patterns) debe
inyectarse **literal** en el system prompt de CatBot via:

1. Funcion dedicada `buildXProtocolSection()` en `app/src/lib/services/catbot-prompt-assembler.ts`
   que lee la skill via `getSystemSkillInstructions('<nombre>')`.
2. Push a `sections` con `priority: 1` (o 0 si es absolutamente critica).

Lazy-load via mensajes tipo *"cuando el usuario pida X, llama `get_skill(name: ...)`"* **NO
cuenta como inyeccion** — el LLM ignora frecuentemente esos triggers y las reglas nunca llegan
al prompt.

## Cuando lazy-load SI es aceptable

Solo para contenido **on-demand, no comportamental**:

- Catalogos grandes (ej: detalle de todos los modelos LLM disponibles).
- Detalle de un connector especifico cuando se va a usar (ej: como se autentica Holded MCP).
- Referencia tecnica que solo aplica en una tarea concreta (ej: schema de un endpoint).

En estos casos el LLM decide cargar la skill cuando la necesita. La decision depende del
criterio "¿este contenido deberia estar presente en CADA conversacion o solo cuando aplica?".

## Criterio de decision (arbol simple)

```
¿La skill contiene reglas/protocolos que deben aplicarse SIEMPRE?
  ├── SI → injection literal (buildXProtocolSection + sections.push) — cost aceptable
  └── NO → ¿se consulta cuando es relevante?
           ├── SI → lazy-load via get_skill tool (ahorra tokens)
           └── NO → revisar si la skill tiene proposito claro
```

## Por que

Descubierto empiricamente en sesion 35 del proyecto DocFlow (v30.4 post-shipping):
- Skill "Orquestador CatFlow" (55926 chars, category=system) contenia reglas inmutables
  (anti-patterns R03, protocolos R01/R02, etc.) en una PARTE 0 anadida en iteraciones v30.4.
- El assembler solo mencionaba *"llama a get_skill cuando..."*.
- En 3 pruebas consecutivas de diseno de canvas, CatBot NO llamo `get_skill("Orquestador")`
  ni una sola vez — el trigger se ignoro.
- Las reglas nunca entraron al prompt. Los cambios del skill fueron codigo muerto.

Las skills Auditor de Runs, Cronista CatDev, Operador de Modelos y Protocolo de creacion de
CatPaw se inyectan literal desde v30.1+ y funcionan consistentemente — el patron probado es
el correcto.

## Como aplicar

Antes de crear o modificar un skill category='system':

1. Decidir si contiene reglas comportamentales (aplican siempre) o detalle on-demand.
2. Si aplica siempre:
   - Asegurarse de que el nombre de la skill es corto y matcheable sin fuzzy.
   - Mantener el contenido bajo un tamano razonable (~2k-6k chars ideal, evitando inflar
     el context window innecesariamente).
   - Anadir `buildXProtocolSection()` en el assembler siguiendo el patron de
     `buildAuditorProtocolSection()` / `buildCronistaProtocolSection()`.
   - Push a `sections` con priority=1.
3. Ejecutar `node scripts/audit-skill-injection.cjs --verify` antes de commitear. El script
   detecta lazy-load silencioso de skills sistema y falla con exit=1 si lo encuentra.
4. Usar `GET /api/catbot/_diagnostic/prompt-compose` (v30.5 P4) para confirmar que la section
   aparece en el output del prompt.

## Relacionado

- R26 — canvas-executor inmutable (mismo nivel critical).
- R27 — agentId UUID-only.
- R28 — process['env'] bracket notation.
- R29 — Docker rebuild tras execute-catpaw.ts.

## Referencia historica

- Sesion 35 del proyecto DocFlow (progressSesion35 si se genera separado, o
  `.catdev/spec.md` de v30.5).
- Script de auditoria: `scripts/audit-skill-injection.cjs`.
- Endpoint de diagnostico: `GET /api/catbot/_diagnostic/prompt-compose`.
