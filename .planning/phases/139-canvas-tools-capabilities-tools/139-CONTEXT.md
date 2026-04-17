# Phase 139: Canvas Tools Capabilities (TOOLS) - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

CatBot puede configurar completamente un nodo de canvas — modelo LLM, input inicial del START, skills, conectores — y recibe feedback enriquecido que le permite verificar el estado del canvas sin llamadas adicionales. No se tocan tipos de nodo, UI del editor, ni canvas-executor.ts.

</domain>

<decisions>
## Implementation Decisions

### canvas_set_start_input (TOOLS-02)
- Tool nueva que configura initialInput y opcionalmente listen_mode del nodo START
- Sobrescribe siempre: si ya hay initialInput, el nuevo reemplaza al anterior sin preguntar
- Error claro en español si el canvas no tiene nodo START: CatBot debe crearlo primero con canvas_add_node
- listen_mode: Claude revisa los valores que ya existen en canvas-executor y expone los mismos. No inventar nuevos
- Respuesta enriquecida: devolver initialInput configurado, listen_mode, total_nodes, total_edges

### Extra skills y conectores (TOOLS-03)
- extra_skill_ids y extra_connector_ids como strings separados por coma (parseados internamente a array)
- Validar contra DB: si algún ID no existe, devolver error con los IDs inválidos. CatBot corrige
- extra_connector_ids solo referencia conectores **ya existentes**. CatBot debe usar list_connectors antes para verificar disponibilidad
- Los conectores requieren configuración de permisos/claves del usuario. Si CatBot necesita un conector que no existe, debe guiar al usuario a crearlo
- Ambos parámetros disponibles tanto en canvas_add_node como en canvas_update_node

### Respuesta enriquecida (TOOLS-04)
- Aplicar a **todas** las canvas tools que modifican el canvas: canvas_add_node, canvas_update_node, canvas_add_edge, canvas_set_start_input
- Campos del nodo afectado: nodeId, label, type, model, has_instructions, has_agent, has_skills, has_connectors, position
- Campos del canvas: total_nodes, total_edges
- canvas_add_edge también devuelve total_nodes + total_edges para consistencia

### Model en canvas_update_node (TOOLS-01)
- Añadir parámetro model a canvas_update_node (canvas_add_node ya lo tiene desde Phase 138)
- model: null o model: '' resetea el override — el nodo hereda el model del CatPaw asignado
- Sin default: si CatBot no pasa model, el nodo no tiene override. En ejecución usa el model del CatPaw o el default global
- Sin validación contra LiteLLM: aceptar cualquier string. Los aliases se crean en Phase 140; si el modelo no existe, falla en ejecución
- canvas_update_node acepta también extra_skill_ids y extra_connector_ids (scope completo de reconfiguración)

### Claude's Discretion
- Valores válidos de listen_mode (extraer de canvas-executor.ts)
- Formato exacto de los campos booleanos has_* en la respuesta
- Manejo del idioma de errores (español por defecto, como Phase 138)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `catbot-tools.ts:571-593` — Schema de canvas_add_node ya tiene model, instructions, insert_between. Extender con extra_skill_ids y extra_connector_ids
- `catbot-tools.ts:660-679` — Schema de canvas_update_node tiene skills como array pero NO model ni extraConnectors. Extender ambos
- `catbot-tools.ts:2184-2299` — Implementación de canvas_add_node: ya persiste model (override de CatPaw), ya valida label ≥3 chars, ya tiene verify persistence pattern
- `catbot-tools.ts:2525-2563` — Implementación de canvas_update_node: patrón simple de merge fields en data. Falta model y extraConnectors
- `canvas-tools-fixes.test.ts` — Tests TDD de Phase 138 con mock de DB (canvases Map + catPaws Map). Extender para TOOLS-01 a TOOLS-04

### Established Patterns
- Errores en español para que CatBot auto-corrija (Phase 138 decision)
- Model explícito en add_node overrides CatPaw model post-lookup (Phase 138)
- Verify persistence: re-read de DB después de UPDATE para confirmar escritura
- Actions array con navigate URL al canvas en cada respuesta

### Integration Points
- canvas_set_start_input es tool nueva: añadir a TOOLS array, añadir case en executeTool, registrar en permission gate
- Knowledge tree (catboard.json): actualizar tools array con canvas_set_start_input y nuevos parámetros
- canvas-executor.ts: NO tocar — solo leer para descubrir listen_mode values válidos

</code_context>

<specifics>
## Specific Ideas

- Los conectores son recursos privados/de terceros que requieren claves y permisos. CatBot debe identificar si existen los conectores necesarios y, si no, plantear al usuario que los cree y ayudarle en el proceso
- Errores en español como primera opción. Si el usuario cambia al inglés, CatBot debe preguntar si quiere que siempre responda en inglés y configurarlo

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 139-canvas-tools-capabilities-tools*
*Context gathered: 2026-04-17*
