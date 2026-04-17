# Roadmap: DocFlow — Milestone v29.0 CatFlow Inbound + CRM

## Overview

Milestone v29.0 construye un CatFlow completo de Inbound+CRM (email entrante -> clasificacion -> operacion CRM en Holded -> respuesta con template) como piloto manual en 4 fases lineales: (145) crear CatPaw "Operador Holded" generalista con tools CRM, (146) construir manualmente el canvas Inbound+CRM de 8 nodos con data contracts verificados, (147) ejecutar tests E2E contra Holded real (lead nuevo, existente, spam), y (148) entrenar a CatBot con PARTE 21 del Orquestador para que construya el patron autonomamente.

## Phases

**Phase Numbering:** continua desde phase 144 (ultima de v28.0). Integer phases 145-148 son el plan de milestone v29.0.

- [x] **Phase 145: CatPaw Operador Holded** - CatPaw generalista con system_prompt amplio y conector Holded MCP para cualquier operacion CRM (completed 2026-04-17)
- [ ] **Phase 146: CatFlow Inbound+CRM Manual** - Canvas de 8 nodos construido manualmente via API con data contracts completos
- [ ] **Phase 147: Tests E2E Inbound+CRM** - Validacion end-to-end contra Holded real (lead nuevo, existente, spam)
- [ ] **Phase 148: Entrenamiento CatBot Patron CRM** - PARTE 21 del Orquestador + CatBot construye canvas autonomamente >=80% correcto

## Phase Details

### Phase 145: CatPaw Operador Holded
**Goal**: Existe un CatPaw "Operador Holded" generalista capaz de ejecutar cualquier operacion CRM en Holded (buscar, crear, actualizar leads y contactos, anadir notas) via Holded MCP.
**Depends on**: Nothing (primera fase del milestone)
**Requirements**: CRM-01, CRM-02, CRM-03, CRM-04
**Success Criteria** (what must be TRUE):
  1. CatPaw "Operador Holded" existe en /agents con conector Holded MCP vinculado y system_prompt generalista (no rigido a un tipo de operacion)
  2. El Operador Holded busca leads/contactos en Holded cuando recibe una instruccion de busqueda (usa holded_search_lead y holded_search_contact)
  3. El Operador Holded crea un lead nuevo en Holded con funnelId obtenido de holded_list_funnels cuando recibe datos de un lead desconocido
  4. El Operador Holded anade notas a leads existentes via holded_create_lead_note con title y desc
**Plans**: 1 plan

Plans:
- [ ] 145-01-PLAN.md — Crear CatPaw Operador Holded con conector Holded MCP y actualizar documentacion

### Phase 146: CatFlow Inbound+CRM Manual
**Goal**: Un canvas Inbound+CRM de 8 nodos funciona end-to-end: recibe un email, lo normaliza, clasifica por producto, ejecuta operacion CRM en Holded (buscar/crear/actualizar lead), y genera respuesta con template Pro-X.
**Depends on**: Phase 145
**Requirements**: FLOW-01, FLOW-02, FLOW-03, FLOW-04, FLOW-05, FLOW-06
**Success Criteria** (what must be TRUE):
  1. Canvas Inbound+CRM de 8 nodos existe y se visualiza correctamente en el editor (START, Normalizador, Clasificador, CRM Handler, Respondedor, Connector Gmail, Output)
  2. Normalizador recibe email texto libre y produce JSON con 6 campos (from, subject, body, date, message_id, thread_id)
  3. Clasificador recibe JSON normalizado y produce JSON con reply_to_email, producto, template_id, is_spam, accion, datos_lead, resumen_consulta
  4. CRM Handler (CatPaw Operador Holded) recibe clasificacion, opera contra Holded (buscar/crear/actualizar lead + nota), y produce crm_action + lead_id
  5. Respondedor genera JSON con accion_final=send_reply y respuesta con template Pro-X para leads validos, o accion_final=no_action para spam
**Plans**: TBD

Plans:
- [ ] 146-01: TBD

### Phase 147: Tests E2E Inbound+CRM
**Goal**: El pipeline Inbound+CRM esta validado contra Holded real en los 3 escenarios criticos: lead nuevo, lead existente, y spam.
**Depends on**: Phase 146
**Requirements**: TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. Test lead nuevo: al ejecutar el canvas con email de contacto desconocido, se CREA un lead en Holded con nota descriptiva Y se envia email con template Pro-K12 a antonio@educa360.com
  2. Test lead existente: al ejecutar con email de contacto conocido, se ACTUALIZA el lead en Holded con nota Y se envia email de respuesta
  3. Test spam: al ejecutar con email spam, NO se envia email, crm_action=skipped, NO se crea ni modifica nada en Holded
**Plans**: TBD

Plans:
- [ ] 147-01: TBD

### Phase 148: Entrenamiento CatBot Patron CRM
**Goal**: CatBot tiene el conocimiento y la capacidad de construir un CatFlow Inbound+CRM autonomamente (>=80% correcto al primer intento) y puede adaptarlo a variantes sin intervencion.
**Depends on**: Phase 147
**Requirements**: TRAIN-01, TRAIN-02, TRAIN-03, TRAIN-04
**Success Criteria** (what must be TRUE):
  1. PARTE 21 del Skill Orquestador esta anadida con patron CRM completo (arquitectura 8 nodos, CatPaw requerido para CRM Handler, data contracts entre nodos, errores comunes)
  2. canvas.json del knowledge tree incluye patron CRM con cuando usar CatPaw con Holded vs nodo generico
  3. CatBot construye un canvas Inbound+CRM con >=80% de criterios correctos al primer intento (6-8 nodos, CRM Handler con CatPaw, data contracts correctos)
  4. CatBot construye una variante del patron (formulario web en vez de email) sin intervencion humana
**Plans**: TBD

Plans:
- [ ] 148-01: TBD

## Progress

**Execution Order:** 145 -> 146 -> 147 -> 148

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 145. CatPaw Operador Holded | 1/1 | Complete   | 2026-04-17 |
| 146. CatFlow Inbound+CRM Manual | 0/? | Not started | - |
| 147. Tests E2E Inbound+CRM | 0/? | Not started | - |
| 148. Entrenamiento CatBot Patron CRM | 0/? | Not started | - |
