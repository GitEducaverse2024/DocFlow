# Requirements: DoCatFlow — Milestone v28.0 CatFlow Intelligence

**Defined:** 2026-04-17
**Core Value:** CatBot construye CatFlows de calidad — canvas tools sin bugs, instrucciones con data contracts, modelos apropiados por nodo, feedback paso a paso. Score auditoría ≥ 85/100.

**Fuente:** `auditoria-catflow.md` (2026-04-17, score 60/100)

> Requirements de milestones anteriores archivados en `.planning/milestones/` (v27.0 completado en fases 133-137).

---

## v28.0 Requirements

Requirements agrupados por capa. Cada uno mapea a una fase del roadmap.

---

### CANVAS — Fixes críticos en canvas tools *(→ Phase 138)*

- [x] **CANVAS-01**: `canvas_add_node` persiste instructions, model, y todos los campos de `data` al hacer PATCH al flow_data del canvas
- [x] **CANVAS-02**: `canvas_add_edge` valida reglas de canvas: OUTPUT es terminal (no puede tener edges de salida), CONDITION requiere sourceHandle válido y no permite duplicar ramas, START solo puede tener 1 edge de salida
- [x] **CANVAS-03**: `canvas_add_node` exige label descriptivo obligatorio — rechaza con error si label está vacío o ausente

### TOOLS — Nuevas capacidades en canvas tools *(→ Phase 139)*

- [x] **TOOLS-01**: `canvas_add_node` y `canvas_update_node` aceptan parámetro opcional `model` (string) para asignar modelo LLM por nodo, con default a `gemini-main`
- [x] **TOOLS-02**: Nueva tool `canvas_set_start_input` que configura `initialInput` y opcionalmente `listen_mode` del nodo START de un canvas
- [x] **TOOLS-03**: `canvas_add_node` acepta parámetros opcionales `extra_skill_ids` y `extra_connector_ids` (strings separados por coma) que se mapean a `data.skills[]` y `data.extraConnectors[]`
- [x] **TOOLS-04**: `canvas_add_node` devuelve respuesta enriquecida con nodeId, label, type, model, has_instructions, has_agent, has_skills, has_connectors, position, total_nodes, total_edges

### MODEL — Modelos Gemma + aliases en LiteLLM *(→ Phase 140)*

- [ ] **MODEL-01**: Modelo Gemma configurado en LiteLLM (vía Ollama o Google AI Studio); si no viable por recursos, documentar razón y defer sin bloquear el milestone
- [ ] **MODEL-02**: Aliases semánticos creados en LiteLLM: `canvas-classifier` (clasificación/extracción), `canvas-formatter` (formateo mecánico), `canvas-writer` (redacción) mapeados a modelos apropiados

### SKILL — Enriquecer Skill Orquestador + system prompt *(→ Phase 141)*

- [ ] **SKILL-01**: Skill "Orquestador CatFlow" actualizada con: reglas de validación de canvas, data contracts entre nodos (normalizador→clasificador→respondedor→connector), mapeo template→producto Educa360, modelos recomendados por tipo de tarea, instrucciones validadas por tipo de nodo (normalizador, clasificador, respondedor)
- [ ] **SKILL-02**: System prompt de CatBot incluye protocolo de reporting obligatorio: informar con ✓ después de cada tool call exitosa, ✗ en error, dividir canvas complejos en bloques de 3-4 nodos
- [ ] **SKILL-03**: System prompt de CatBot incluye regla imperativa de usar tools de listado (list_cat_paws, list_email_templates, list_skills) en vez de responder de memoria cuando el usuario pregunta por recursos existentes

### LOOP — maxIterations y feedback loop *(→ Phase 142)*

- [ ] **LOOP-01**: maxIterations de CatBot subido a 15, threshold de escalado async movido de iter 3+ a iter 10+ para permitir construcción de canvas 8+ nodos sin escalado prematuro
- [ ] **LOOP-02**: Reporting intermedio implementado: cada 4 iteraciones de tool-calling sin texto al usuario, se inyecta prompt de sistema pidiendo resumen de progreso

### PILOT — CatFlow Email Classifier piloto *(→ Phase 143)*

- [ ] **PILOT-01**: Las 4 plantillas Pro-* (Pro-K12, Pro-Simulator, Pro-REVI, Pro-Educaverse) verificadas; si tienen 0 bloques, maquetadas con estructura header/saludo/propuesta/CTA/footer
- [ ] **PILOT-02**: CatFlow "Email Classifier Pilot" construido manualmente vía API directa con 8 nodos (START→Normalizador→Clasificador→Condition→RAG→Respondedor→Gmail→OUTPUT) y 3 emails de prueba en initialInput
- [ ] **PILOT-03**: Piloto ejecutado end-to-end contra Gmail real: normalizador produce JSON 6 campos, clasificador mapea producto+template, condition filtra spam, RAG contextualiza, respondedor genera email, Gmail envía
- [ ] **PILOT-04**: Lecciones del piloto (instrucciones finales, data contracts funcionales, errores y soluciones) registradas como nota en CatBrain DoCatFlow y RAG reindexado

### EVAL — Test de aprendizaje de CatBot *(→ Phase 144)*

- [ ] **EVAL-01**: Re-ejecutar scorecard de auditoría (10 tests: tipos de nodos, búsqueda de recursos, config completa, conexiones, sourceHandle, CatPaw, skills/conectores, reporting, recuperación, planificación) con score total ≥ 85/100
- [ ] **EVAL-02**: Test de construcción completa: CatBot crea CatFlow de email classifier completo sin intervención manual — canvas legible en editor, ejecutable end-to-end, con reporting paso a paso

## v29+ Requirements (Deferred)

### Optimización de costes
- **OPT-01**: Asignación automática de modelo por tipo de nodo basada en complejidad
- **OPT-02**: Métricas de coste por CatFlow ejecutado

### Resiliencia avanzada
- **RES-01**: Retry automático de nodos fallidos en canvas execution
- **RES-02**: Checkpoint/resume de CatFlows parcialmente ejecutados

## Out of Scope

| Feature | Reason |
|---------|--------|
| Tocar canvas-executor.ts | Fuente de verdad del contrato, intocable |
| Tocar insertSideEffectGuards | 36/36 verde, no tocar |
| Nuevos tipos de nodo | No necesarios para v28.0 |
| UI del canvas editor | Solo backend/tools en v28.0 |
| WebSocket para feedback en tiempo real | Polling suficiente para single-user |
| Tests E2E con Playwright para canvas tools | Se valida vía piloto end-to-end y scorecard manual |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CANVAS-01 | Phase 138 | Complete |
| CANVAS-02 | Phase 138 | Complete |
| CANVAS-03 | Phase 138 | Complete |
| TOOLS-01 | Phase 139 | Complete |
| TOOLS-02 | Phase 139 | Complete |
| TOOLS-03 | Phase 139 | Complete |
| TOOLS-04 | Phase 139 | Complete |
| MODEL-01 | Phase 140 | Pending |
| MODEL-02 | Phase 140 | Pending |
| SKILL-01 | Phase 141 | Pending |
| SKILL-02 | Phase 141 | Pending |
| SKILL-03 | Phase 141 | Pending |
| LOOP-01 | Phase 142 | Pending |
| LOOP-02 | Phase 142 | Pending |
| PILOT-01 | Phase 143 | Pending |
| PILOT-02 | Phase 143 | Pending |
| PILOT-03 | Phase 143 | Pending |
| PILOT-04 | Phase 143 | Pending |
| EVAL-01 | Phase 144 | Pending |
| EVAL-02 | Phase 144 | Pending |

**Coverage:**
- v28.0 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-17*
*Last updated: 2026-04-17 after initial definition*
