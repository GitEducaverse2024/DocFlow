# Requirements: DoCatFlow — Milestone v29.0 CatFlow Inbound + CRM

**Defined:** 2026-04-17
**Core Value:** CatFlow completo Inbound+CRM (clasificación → Holded → email con template) como piloto manual, luego CatBot lo construye autónomamente.

## v1 Requirements

### CatPaw CRM

- [ ] **CRM-01**: CatPaw "Operador Holded" creado con system_prompt generalista y conector Holded MCP vinculado
- [ ] **CRM-02**: Operador Holded puede buscar leads/contactos en Holded via holded_search_lead y holded_search_contact
- [ ] **CRM-03**: Operador Holded puede crear leads nuevos en Holded via holded_create_lead con funnelId obtenido de holded_list_funnels
- [ ] **CRM-04**: Operador Holded puede añadir notas a leads via holded_create_lead_note con title y desc

### CatFlow Manual

- [ ] **FLOW-01**: Canvas Inbound+CRM de 8 nodos construido manualmente via API (START, Normalizador, Clasificador, CRM Handler, Respondedor, Connector Gmail, Output)
- [ ] **FLOW-02**: Normalizador (genérico, gemini-main) normaliza email texto libre a JSON con 6 campos (from, subject, body, date, message_id, thread_id)
- [ ] **FLOW-03**: Clasificador (genérico, gemini-main) clasifica por producto y produce JSON con reply_to_email, producto, template_id, is_spam, accion, datos_lead, resumen_consulta
- [ ] **FLOW-04**: CRM Handler (CatPaw Operador Holded) busca lead en Holded, crea si no existe, actualiza si existe, produce crm_action + lead_id
- [ ] **FLOW-05**: Respondedor (genérico, gemini-main) genera JSON con accion_final=send_reply + respuesta con plantilla_ref, saludo, cuerpo (texto plano) — o accion_final=no_action para spam
- [ ] **FLOW-06**: Connector Gmail envía email con template Pro-X renderizado cuando recibe accion_final=send_reply

### Tests E2E

- [ ] **TEST-01**: Test lead nuevo — email enviado a antonio@educa360.com con Pro-K12 + lead CREADO en Holded con nota
- [ ] **TEST-02**: Test lead existente — email enviado + lead ACTUALIZADO en Holded con nota
- [ ] **TEST-03**: Test spam — no se envía email, crm_action=skipped, no se toca Holded

### Entrenamiento CatBot

- [ ] **TRAIN-01**: PARTE 21 añadida al Skill Orquestador con patrón Inbound+CRM (arquitectura, CatPaw requerido, data contracts, errores comunes)
- [ ] **TRAIN-02**: CatBot construye canvas Inbound+CRM ≥80% correcto al primer intento (6-8 nodos, CRM Handler con CatPaw, data contracts correctos)
- [ ] **TRAIN-03**: canvas.json actualizado con patrón CRM y cuándo usar CatPaw con Holded
- [ ] **TRAIN-04**: Test de autonomía — CatBot construye variante del patrón (formulario web en vez de email) sin intervención

## Future Requirements

### Inbound Avanzado

- **ADV-01**: Pipeline multi-email (procesar batch de N emails en una ejecución)
- **ADV-02**: CatFlow programado (scheduler node) para polling automático de emails
- **ADV-03**: Integración con funnel stages dinámicos (mover lead entre etapas según interacciones)
- **ADV-04**: Dashboard de leads procesados con métricas

## Out of Scope

| Feature | Reason |
|---------|--------|
| Modificar canvas-executor.ts | Prohibido por CLAUDE.md — adaptarse a sus restricciones |
| Nodos CONDITION en pipeline de datos | Pierde JSON, solo pasa yes/no — probado en piloto v28 |
| Nodos CatBrain/RAG en pipeline | Usa instructions como query, no predecessorOutput — probado en piloto v28 |
| CatPaw en nodos de procesamiento de texto | Reinterpreta input con system_prompt — probado en piloto v28 |
| Multi-funnel routing en Holded | Complejidad innecesaria para v29, un solo funnel es suficiente |
| OAuth2 para Gmail | App password funciona para antonio@educa360.com |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CRM-01 | Pending | Pending |
| CRM-02 | Pending | Pending |
| CRM-03 | Pending | Pending |
| CRM-04 | Pending | Pending |
| FLOW-01 | Pending | Pending |
| FLOW-02 | Pending | Pending |
| FLOW-03 | Pending | Pending |
| FLOW-04 | Pending | Pending |
| FLOW-05 | Pending | Pending |
| FLOW-06 | Pending | Pending |
| TEST-01 | Pending | Pending |
| TEST-02 | Pending | Pending |
| TEST-03 | Pending | Pending |
| TRAIN-01 | Pending | Pending |
| TRAIN-02 | Pending | Pending |
| TRAIN-03 | Pending | Pending |
| TRAIN-04 | Pending | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 0
- Unmapped: 17 ⚠️

---
*Requirements defined: 2026-04-17*
*Last updated: 2026-04-17 after milestone v29.0 initialization*
