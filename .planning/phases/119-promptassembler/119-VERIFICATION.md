---
phase: 119-promptassembler
verified: 2026-04-08T13:54:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 119: PromptAssembler Verification Report

**Phase Goal:** El system prompt de CatBot se ensambla dinamicamente desde knowledge tree + config + contexto de pagina, con presupuesto de tokens
**Verified:** 2026-04-08T13:54:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | El system prompt de CatBot se ensambla dinamicamente desde knowledge tree + config | VERIFIED | `catbot-prompt-assembler.ts` importa `loadKnowledgeIndex`, `loadKnowledgeArea`, `getAllAliases`, `getHoldedTools`, `db`. `build()` existe en linea 528. |
| 2 | El prompt cambia segun la pagina actual del usuario (ej: /catflow inyecta catflow.json) | VERIFIED | `PAGE_TO_AREA` mapping en lineas 44-55 del assembler. `getPageKnowledge()` en linea 168. Test confirmado: 8/8 pasan incluyendo "includes page-specific knowledge for /catflow" y "/settings". |
| 3 | Si el prompt excede el presupuesto de tokens, las secciones P3 se truncan primero, luego P2 | VERIFIED | `assembleWithBudget()` en linea 91. Test "budget truncation removes P3 sections first" pasa. Elite>=Pro>=Libre test pasa. |
| 4 | Las secciones P0 (identidad, tool instructions) nunca se truncan | VERIFIED | `assembleWithBudget()` incluye P0 incondicionalmente. Test "P0 sections are never truncated even over budget" pasa con model 'qwen2:0.5b' (Libre tier). |
| 5 | buildSystemPrompt() ya no existe en route.ts — reemplazada por PromptAssembler.build() | VERIFIED | `grep "function buildSystemPrompt" route.ts` devuelve 0 coincidencias. `route.ts:12` importa `build as buildPrompt` desde catbot-prompt-assembler. `route.ts:82` llama `buildPrompt({page, channel, hasSudo, catbotConfig})`. |
| 6 | CatBot puede usar query_knowledge para consultar el knowledge tree por area o fulltext | VERIFIED | Tool definido en `catbot-tools.ts:202`. Handler en linea 1112. Importa `loadKnowledgeArea`, `getAllKnowledgeAreas`. Anadiado a `always_allowed` en linea 887. |
| 7 | query_knowledge devuelve conceptos, howto, dont y errores comunes relevantes | VERIFIED | Handler filtra por `area` o busca fulltext con scoring. `formatKnowledgeResult()` retorna campos estructurados del `KnowledgeEntry`. |
| 8 | Los sources de cada JSON del knowledge tree apuntan a docs reales en .planning/ | VERIFIED | 7/7 JSONs tienen sources no vacios. Ningun JSON tiene `"sources": []`. Tests `knowledge-tree.test.ts` pasan (10/10) incluyendo "every knowledge area has at least one source" y "sources point to existing files". |

**Score:** 8/8 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/src/lib/services/catbot-prompt-assembler.ts` | PromptAssembler con build(), assembleWithBudget(), page-to-area mapping | VERIFIED | 620 lineas. Exporta `build`, `PromptContext`, `PromptSection`. Funciones `assembleWithBudget`, `getBudget`, `getStats`, `getPageKnowledge` presentes. |
| `app/src/lib/__tests__/catbot-prompt-assembler.test.ts` | Tests unitarios para build, page context, y budget truncation | VERIFIED | 81 lineas (>60 min). 8 tests, 8 pasan. Cubre identidad, page knowledge, budget truncation, tiers. |
| `app/src/app/api/catbot/chat/route.ts` | Chat endpoint usando PromptAssembler.build() | VERIFIED | Importa `build as buildPrompt` en linea 12. Llama en linea 82 con PromptContext completo. `buildSystemPrompt()` eliminada (0 ocurrencias). |
| `app/src/lib/services/catbot-tools.ts` | query_knowledge tool + explain_feature migrado a knowledge tree | VERIFIED | `query_knowledge` definido (linea 202), handler (linea 1112), always_allowed (linea 887). `explain_feature` usa `getAllKnowledgeAreas()` + scoring (linea 1085). `FEATURE_KNOWLEDGE` = 0 ocurrencias. |
| `app/data/knowledge/catboard.json` | Sources populados con paths a .planning/ | VERIFIED | Sources: `['.planning/PROJECT.md', '.planning/ROADMAP.md']` |
| `app/data/knowledge/catbrains.json` | Sources populados | VERIFIED | Sources non-empty, apuntan a .planning/ |
| `app/data/knowledge/catpaw.json` | Sources populados | VERIFIED | Sources non-empty, apuntan a .planning/ |
| `app/data/knowledge/catflow.json` | Sources populados | VERIFIED | Sources: `['.planning/research/FEATURES.md', '.planning/milestones/v16.0-ROADMAP.md']` |
| `app/data/knowledge/canvas.json` | Sources populados | VERIFIED | Sources non-empty, apuntan a .planning/ |
| `app/data/knowledge/catpower.json` | Sources populados | VERIFIED | Sources non-empty, apuntan a .planning/ |
| `app/data/knowledge/settings.json` | Sources populados | VERIFIED | Sources: `['.planning/research/ARCHITECTURE.md', '.planning/ROADMAP.md']` |
| `app/src/lib/__tests__/knowledge-tree.test.ts` | Test de sources no vacios en knowledge JSONs | VERIFIED | 10/10 tests pasan. Incluye "every knowledge area has at least one source" y "sources point to existing files". |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app/src/app/api/catbot/chat/route.ts` | `app/src/lib/services/catbot-prompt-assembler.ts` | `import { build } from catbot-prompt-assembler` | WIRED | `route.ts:12` confirma import. `route.ts:82` confirma uso. |
| `app/src/lib/services/catbot-prompt-assembler.ts` | `app/src/lib/knowledge-tree.ts` | `loadKnowledgeArea() for page-specific knowledge` | WIRED | `assembler:9` importa. `assembler:186` llama `loadKnowledgeArea(areaId)`. `assembler:253` llama `loadKnowledgeIndex()`. |
| `app/src/lib/services/catbot-prompt-assembler.ts` | `app/src/lib/db.ts` | `DB queries for stats` | WIRED | `assembler:12` importa db. `assembler:125,129,133,137` llaman `db.prepare(...)`. |
| `app/src/lib/services/catbot-tools.ts` | `app/src/lib/knowledge-tree.ts` | `import loadKnowledgeArea, getAllKnowledgeAreas for query_knowledge` | WIRED | `catbot-tools.ts:9` importa. Usado en handlers de `explain_feature` (linea 1088) y `query_knowledge` (lineas 1118, 1123). |
| `app/data/knowledge/*.json sources` | `.planning/*.md` | `sources arrays pointing to documentation files` | WIRED | Todos los JSONs contienen paths como `.planning/PROJECT.md`, `.planning/ROADMAP.md`, etc. Tests de knowledge-tree.test.ts confirman formato correcto. |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PROMPT-01 | 119-01-PLAN.md | PromptAssembler reemplaza buildSystemPrompt() hardcodeado con ensamblaje modular desde knowledge tree + perfil usuario + config | SATISFIED | `buildSystemPrompt()` eliminada (0 ocurrencias). `buildPrompt()` llamada en route.ts con PromptContext. 310 lineas hardcodeadas reemplazadas. |
| PROMPT-02 | 119-01-PLAN.md | El prompt se compone dinamicamente segun la pagina actual del usuario, cargando el JSON relevante del knowledge tree | SATISFIED | `PAGE_TO_AREA` mapping + `getPageKnowledge()` en assembler. Test `/catflow` contiene "pipeline", `/settings` contiene "Centro de Modelos". |
| PROMPT-03 | 119-01-PLAN.md | El PromptAssembler tiene un presupuesto de tokens y trunca secciones de menor prioridad si excede el limite del modelo | SATISFIED | `getBudget()`: Libre=16K, Pro=32K, Elite=64K chars. `assembleWithBudget()` ordena por prioridad. 8 tests confirman comportamiento. |
| PROMPT-04 | 119-02-PLAN.md | El tool query_knowledge permite a CatBot consultar el knowledge tree por path y fulltext cuando necesita informacion no inyectada en el prompt | SATISFIED | Tool definido y registrado. Handler implementado con `loadKnowledgeArea(area)` para especifico y scoring fulltext para busqueda global. Anadiado a `always_allowed`. |
| PROMPT-05 | 119-02-PLAN.md | Los sources en cada JSON del knowledge tree apuntan a los 80+ docs existentes en .planning/ para que CatBot pueda profundizar con search_documentation | SATISFIED | 7/7 JSONs con sources no vacios. Tests `knowledge-tree.test.ts:PROMPT-05` pasan (10/10). |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `catbot-prompt-assembler.ts` | 353 | "placeholder" en texto de prompt | INFO | Contenido del prompt (regla de negocio sobre leads), no un stub de codigo. Sin impacto. |

No blocker anti-patterns encontrados. No hay TODOs, FIXMEs, return null/return {} como implementaciones vacias, ni funciones buildSystemPrompt remanentes.

---

### Build & Test Status

| Check | Result |
|-------|--------|
| `npm run build` | PASS — build completa sin errores |
| `vitest run catbot-prompt-assembler.test.ts` | PASS — 8/8 tests |
| `vitest run knowledge-tree.test.ts` | PASS — 10/10 tests |
| `grep "function buildSystemPrompt" route.ts` | 0 coincidencias (confirmado eliminada) |
| `grep -c "FEATURE_KNOWLEDGE" catbot-tools.ts` | 0 (confirmado eliminado) |
| `grep -c '"sources": \[\]' knowledge/*.json` | 0 en todos los 7 archivos |

Commits verificados en git log: `daa4366`, `6cf139c`, `7891d73`, `59aac8f`.

---

### Human Verification Required

#### 1. CatBot responde diferente segun pagina

**Test:** Abrir DocFlow en `/catflow`, iniciar chat con CatBot y preguntar "que es un pipeline?" — luego hacer lo mismo desde `/settings`.
**Expected:** En `/catflow` CatBot menciona conceptos de CatFlow. En `/settings` menciona conceptos del Centro de Modelos. Los prompts son distintos.
**Why human:** El assembler produce prompts distintos segun `page`, pero la pagina se pasa desde el cliente. Verificar que el cliente envia correctamente `context.page` en cada ruta.

#### 2. Presupuesto de tokens visible en practica

**Test:** Configurar CatBot con un modelo Libre (ej: gemma), abrir chat y preguntar sobre troubleshooting.
**Expected:** La seccion de troubleshooting puede estar ausente del prompt (P3 truncada), pero la identidad y funcionalidades principales estan intactas.
**Why human:** No se puede verificar programaticamente que el modelo recibe el prompt truncado — requiere inspeccion del log de network o la respuesta de CatBot al preguntar sobre su propia configuracion.

#### 3. query_knowledge funcional desde chat

**Test:** En CatBot, escribir "consulta el knowledge tree sobre catflow".
**Expected:** CatBot llama a `query_knowledge` con `area: "catflow"` y devuelve conceptos, howto, errores comunes del area.
**Why human:** Requiere que el modelo LLM elija llamar a la tool. No verificable con grep.

---

## Resumen

La fase 119 alcanza su objetivo. El system prompt de CatBot se ensambla dinamicamente desde el knowledge tree, con pagina-contexto y presupuesto de tokens. Los 5 requirements (PROMPT-01 a PROMPT-05) estan satisfechos con evidencia directa en codigo. Todos los tests unitarios pasan (8/8 assembler, 10/10 knowledge-tree), el build compila, y los 4 commits documentados existen en git.

Los 3 items de verificacion humana son opcionales para confirmar el comportamiento end-to-end en el cliente, pero no bloquean la aprobacion de la fase dado que el nucleo funcional esta verificado programaticamente.

---

_Verified: 2026-04-08T13:54:00Z_
_Verifier: Claude (gsd-verifier)_
