# Roadmap: DocFlow — Milestone v28.0 CatFlow Intelligence (Entrenamiento de CatBot)

## Overview

Milestone v28.0 eleva la capacidad de CatBot para construir CatFlows de calidad, desde un score de 60/100 a 85+/100. La estructura es lineal en 7 fases: (138) fix de bugs criticos en canvas tools que rompen la persistencia de datos, (139) nuevas capacidades en tools para que CatBot pueda configurar modelo por nodo, start input, y skills/conectores, (140) configuracion de modelos Gemma y aliases semanticos en LiteLLM, (141) enriquecimiento de la Skill Orquestador con data contracts y protocolos de reporting, (142) ajuste del loop de iteraciones para permitir canvas complejos sin escalado prematuro, (143) piloto end-to-end de Email Classifier construido via API y ejecutado contra Gmail real, y (144) re-scorecard de auditoria y test de construccion autonoma como gate de milestone.

## Phases

**Phase Numbering:** continua desde phase 137 (ultima de v27.0). Integer phases 138-144 son el plan de milestone v28.0.

- [x] **Phase 138: Canvas Tools Fixes (CANVAS)** - Fix persistencia de instructions, validacion de reglas en edges, labels obligatorios (completed 2026-04-17)
- [x] **Phase 139: Canvas Tools Capabilities (TOOLS)** - Modelo por nodo, canvas_set_start_input, extra skills/connectors, respuesta enriquecida (completed 2026-04-17)
- [x] **Phase 140: Model Configuration (MODEL)** - Gemma en LiteLLM + aliases semanticos por tipo de tarea (completed 2026-04-17)
- [ ] **Phase 141: Skill & Prompt Enrichment (SKILL)** - Orquestador con data contracts, reporting protocol, regla de tools de listado
- [ ] **Phase 142: Iteration Loop Tuning (LOOP)** - maxIterations=15, threshold escalado, reporting intermedio
- [ ] **Phase 143: Email Classifier Pilot (PILOT)** - Plantillas Pro-*, CatFlow piloto construido y ejecutado end-to-end
- [ ] **Phase 144: Evaluation Gate (EVAL)** - Re-scorecard >= 85/100, test de construccion autonoma

## Phase Details

### Phase 138: Canvas Tools Fixes (CANVAS)
**Goal**: Los canvas tools de CatBot persisten correctamente todos los datos de nodos y validan las reglas estructurales del canvas, eliminando los bugs criticos que impiden construir CatFlows funcionales.
**Depends on**: Nothing (primera fase del milestone)
**Requirements**: CANVAS-01, CANVAS-02, CANVAS-03
**Success Criteria** (what must be TRUE):
  1. Cuando CatBot usa `canvas_add_node` con instructions y model, esos campos aparecen en el flow_data del canvas al recargar el editor
  2. Cuando CatBot intenta conectar un edge desde un nodo OUTPUT, recibe un error claro indicando que OUTPUT es terminal
  3. Cuando CatBot intenta crear un nodo sin label o con label vacio, recibe un error de validacion que le obliga a proporcionar un label descriptivo
  4. Cuando CatBot conecta un nodo CONDITION, solo puede hacerlo via sourceHandle valido y no puede duplicar ramas existentes
**Plans:** 1/1 plans complete
Plans:
- [ ] 138-01-PLAN.md — TDD fixes: tests RED + implementacion GREEN + knowledge tree update

### Phase 139: Canvas Tools Capabilities (TOOLS)
**Goal**: CatBot puede configurar completamente un nodo de canvas — modelo LLM, input inicial del START, skills, conectores — y recibe feedback enriquecido que le permite verificar el estado del canvas sin llamadas adicionales.
**Depends on**: Phase 138
**Requirements**: TOOLS-01, TOOLS-02, TOOLS-03, TOOLS-04
**Success Criteria** (what must be TRUE):
  1. Cuando CatBot crea o actualiza un nodo, puede asignar un modelo LLM especifico (ej. `canvas-classifier`) y ese modelo aparece en el flow_data del nodo
  2. Cuando CatBot usa `canvas_set_start_input`, el nodo START del canvas tiene initialInput configurado y opcionalmente listen_mode
  3. Cuando CatBot crea un nodo con extra_skill_ids o extra_connector_ids, esos IDs aparecen en data.skills[] y data.extraConnectors[] del nodo
  4. La respuesta de `canvas_add_node` incluye nodeId, label, type, model, has_instructions, total_nodes, total_edges — CatBot puede confirmar el estado sin llamar a canvas_get_flow
**Plans:** 2/2 plans complete
Plans:
- [ ] 139-01-PLAN.md — TDD: tests RED + implementacion GREEN para TOOLS-01..04
- [ ] 139-02-PLAN.md — Knowledge tree canvas.json update

### Phase 140: Model Configuration (MODEL)
**Goal**: LiteLLM tiene modelos Gemma disponibles (si viable) y aliases semanticos que permiten a CatBot asignar el modelo apropiado a cada tipo de tarea sin conocer nombres internos de modelo.
**Depends on**: Phase 139 (los aliases se usan en los nodos de canvas)
**Requirements**: MODEL-01, MODEL-02
**Success Criteria** (what must be TRUE):
  1. Los aliases `canvas-classifier`, `canvas-formatter`, `canvas-writer` existen en LiteLLM y resuelven a modelos funcionales verificados via GET /api/models
  2. Si Gemma no es viable por recursos GPU/RAM, la decision esta documentada y los aliases apuntan a modelos alternativos — el milestone no se bloquea
**Plans:** 1/1 plans complete
Plans:
- [ ] 140-01-PLAN.md — Gemma4 en LiteLLM + aliases semanticos canvas + knowledge tree

### Phase 141: Skill & Prompt Enrichment (SKILL)
**Goal**: La Skill Orquestador y el system prompt de CatBot contienen todo el conocimiento necesario para construir CatFlows de calidad: data contracts entre nodos, modelos por tipo de tarea, protocolo de reporting, y regla de consultar recursos via tools.
**Depends on**: Phase 140 (los aliases de modelo se referencian en la skill)
**Requirements**: SKILL-01, SKILL-02, SKILL-03
**Success Criteria** (what must be TRUE):
  1. La Skill Orquestador incluye data contracts explicitos (ej. normalizador produce JSON con 6 campos definidos, clasificador consume ese JSON y produce producto+template) que CatBot puede seguir al redactar instructions
  2. Cuando CatBot ejecuta un tool call exitoso, reporta con marca de check en su respuesta; cuando falla, reporta con marca de error — el usuario ve progreso paso a paso
  3. Cuando el usuario pregunta "que CatPaws tengo" o "que templates de email hay", CatBot ejecuta el tool de listado correspondiente en vez de responder de memoria
**Plans:** 1 plan
Plans:
- [ ] 140-01-PLAN.md — Gemma4 en LiteLLM + aliases semanticos canvas + knowledge tree

### Phase 142: Iteration Loop Tuning (LOOP)
**Goal**: CatBot puede construir canvas complejos (8+ nodos, 10+ tool calls) sin que el sistema escale prematuramente a async, y reporta progreso intermedio durante construcciones largas.
**Depends on**: Phase 141 (el protocolo de reporting se aplica aqui)
**Requirements**: LOOP-01, LOOP-02
**Success Criteria** (what must be TRUE):
  1. CatBot puede ejecutar 15 tool calls consecutivas sin que el sistema interrumpa con escalado async (el threshold pasa de iter 3+ a iter 10+)
  2. Cuando CatBot lleva 4+ iteraciones de tool-calling sin texto al usuario, genera automaticamente un resumen de progreso antes de continuar
**Plans:** 1 plan
Plans:
- [ ] 140-01-PLAN.md — Gemma4 en LiteLLM + aliases semanticos canvas + knowledge tree

### Phase 143: Email Classifier Pilot (PILOT)
**Goal**: Un CatFlow de clasificacion de emails funciona end-to-end: recibe emails, normaliza, clasifica por producto, busca contexto RAG, genera respuesta, y envia via Gmail. Las lecciones aprendidas quedan registradas para entrenar a CatBot.
**Depends on**: Phase 142 (requiere deploy previo de fases 138-142 para que canvas tools funcionen correctamente)
**Requirements**: PILOT-01, PILOT-02, PILOT-03, PILOT-04
**Success Criteria** (what must be TRUE):
  1. Las 4 plantillas Pro-* (Pro-K12, Pro-Simulator, Pro-REVI, Pro-Educaverse) tienen contenido real con estructura header/saludo/propuesta/CTA/footer
  2. El CatFlow Email Classifier con 8 nodos (START, Normalizador, Clasificador, Condition, RAG, Respondedor, Gmail, OUTPUT) esta construido y es visible/legible en el editor de canvas
  3. La ejecucion del piloto contra 3 emails reales produce: normalizador JSON valido, clasificador con producto+template correcto, condition filtra spam, respondedor genera email contextualizado, Gmail envia
  4. Las lecciones del piloto (instrucciones finales, data contracts funcionales, errores encontrados) estan registradas en CatBrain DoCatFlow con RAG indexado
**Plans:** 1 plan
Plans:
- [ ] 140-01-PLAN.md — Gemma4 en LiteLLM + aliases semanticos canvas + knowledge tree

### Phase 144: Evaluation Gate (EVAL)
**Goal**: CatBot demuestra capacidad de construir CatFlows de calidad: pasa la scorecard de auditoria con >= 85/100 y puede crear un CatFlow de email classifier completo sin intervencion manual.
**Depends on**: Phase 143 (las lecciones del piloto alimentan el conocimiento de CatBot)
**Requirements**: EVAL-01, EVAL-02
**Success Criteria** (what must be TRUE):
  1. La re-ejecucion de los 10 tests de auditoria (tipos de nodos, busqueda de recursos, config completa, conexiones, sourceHandle, CatPaw, skills/conectores, reporting, recuperacion, planificacion) produce score total >= 85/100
  2. CatBot crea un CatFlow de email classifier completo sin intervencion manual: el canvas resultante es legible en el editor, ejecutable end-to-end, y CatBot reporta paso a paso durante la construccion
**Plans:** 1 plan
Plans:
- [ ] 140-01-PLAN.md — Gemma4 en LiteLLM + aliases semanticos canvas + knowledge tree

## Progress

**Execution Order:** 138 -> 139 -> 140 -> 141 -> 142 -> 143 -> 144

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 138. Canvas Tools Fixes | 1/1 | Complete    | 2026-04-17 |
| 139. Canvas Tools Capabilities | 2/2 | Complete    | 2026-04-17 |
| 140. Model Configuration | 1/1 | Complete   | 2026-04-17 |
| 141. Skill & Prompt Enrichment | 0/? | Not started | - |
| 142. Iteration Loop Tuning | 0/? | Not started | - |
| 143. Email Classifier Pilot | 0/? | Not started | - |
| 144. Evaluation Gate | 0/? | Not started | - |
