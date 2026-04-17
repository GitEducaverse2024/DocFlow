# Phase 141: Skill & Prompt Enrichment (SKILL) - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Enriquecer la Skill Orquestador CatFlow y el system prompt de CatBot con: data contracts validados entre nodos, aliases de modelo por tipo de tarea, protocolo de reporting (✓/✗), regla imperativa de usar tools en vez de memoria, y protocolo de diagnóstico de nodos.

</domain>

<decisions>
## Implementation Decisions

### Data Contracts entre nodos
- Solo documentar cadenas validadas en producción — no especular sobre flujos no probados
- Flujo semi-automático: tras ejecución exitosa de un canvas, CatBot extrae los campos reales del output de cada nodo y sugiere el data contract. El usuario aprueba antes de registrarlo
- El formato de los contracts (tabla, JSON schema, ejemplo anotado) y su ubicación (skill vs knowledge tree vs mixto) queda a discreción de Claude — elegir lo más profesional y escalable
- Actualmente solo el flujo de test inbound ha funcionado parcialmente — esa es la única base real

### Protocolo de reporting ✓/✗
- Resumen al final, no progresivo — CatBot ejecuta el canvas completo y al terminar muestra el reporte
- Solo texto legible: "✓ Normalizador: 6 campos extraídos", sin JSON ni datos técnicos
- En error: CatBot para, reporta con ✗, y propone una solución o revisión
- Usar el CatBrain de CatFlow como base de conocimiento de errores y soluciones conocidas
- Granularidad del reporte (por nodo vs por bloques) a discreción de Claude

### Regla tool-use-first
- Agresividad máxima: siempre que exista un tool que pueda responder, usarlo. No solo listados — cualquier dato consultable
- Transparente: CatBot anuncia "Voy a consultar..." antes de ejecutar el tool. El usuario sabe que es dato real, no memoria
- Cada implementación exitosa (canvas creado, agente configurado) debe documentarse con todo el detalle: qué se hizo, cómo, si fue aprobada por el cliente, forma de uso
- Los tools de listado actuales son suficientes — no añadir nuevos en esta fase, pero el principio es que cada feature futura incluya su tool correspondiente

### Modelo por tipo de tarea
- Estrategia de asignación de alias por tipo de nodo a discreción de Claude (regla fija vs inferencia por criterio mecánico/creativo)
- Protocolo de diagnóstico de nodos cuando algo falla:
  1. Mejorar el prompt (90% de los casos)
  2. Aislar el nodo y probar variantes de prompt mejoradas
  3. Implementar/ajustar skill y reglas del nodo
  4. Como último recurso: cambiar el LLM y reportar que el problema era el modelo, no el prompt
- Ubicación del protocolo de diagnóstico (skill vs knowledge tree) a discreción de Claude

### Claude's Discretion
- Formato exacto de data contracts (tabla, JSON schema, ejemplo anotado)
- Ubicación de contracts (skill directa, knowledge JSON, o mixto)
- Granularidad del reporte ✓/✗ (por nodo individual o por bloques de 3-4)
- Estrategia de asignación de aliases: tabla fija por tipo de nodo vs inferencia por criterio
- Ubicación del protocolo de diagnóstico de nodos

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `skill_orquestador_catbot_enriched.md` (891 líneas): Skill completa v2.0 con 14 partes. Base para enriquecimiento
- `canvas-connector-contracts.ts`: Contratos formales por tipo de conector (Gmail, Drive, MCP, etc.) con required/optional fields
- `canvas-rules.ts` + `canvas-rules-index.md`: 32+ reglas categorizadas (R01: data contracts, R10: JSON in>out, etc.)
- `catbot-prompt-assembler.ts` (970 líneas): Ensamblaje modular de system prompt con prioridades 0-3
- `catbot-tools.ts` (3,854 líneas): 50+ tools con patrón OpenAI function schema, dispatcher executeTool

### Established Patterns
- **Skill injection:** `getSystemSkillInstructions()` carga skills al system prompt desde cat_paw_skills
- **Knowledge tree:** JSONs en app/data/knowledge/ consultables via search_knowledge
- **Alias routing:** `resolveAlias(alias)` async lookup, `seedAliases()` con INSERT OR IGNORE
- **Tool registration:** TOOLS[] array + executeTool dispatcher + permission gate

### Integration Points
- PromptAssembler: donde se inyectan las reglas nuevas (reporting, tool-use-first)
- Skill Orquestador: donde van los data contracts y protocolo de diagnóstico
- Knowledge tree JSONs: donde van contratos validados (si se elige esa ruta)
- CatBrain de CatFlow: fuente de errores y soluciones para el protocolo de reporting

</code_context>

<specifics>
## Specific Ideas

- "Tenemos que documentar las que verdaderamente hayamos hecho que funcionen" — solo contratos basados en evidencia real, no teóricos
- "Siempre que haga una implementación debe actualizarse y contener si ha sido exitosa y aprobada por el cliente, su forma de uso, todo el detalle de cómo se creó" — registro vivo de implementaciones validadas
- "Casi el 90% de los casos será el prompt, conector o skill y reglas" — el LLM casi nunca es el problema
- Usar CatBrain de CatFlow existente como base de conocimiento de errores

</specifics>

<deferred>
## Deferred Ideas

- Auto-documentación completa de contratos tras ejecución exitosa (el mecanismo semi-automático se diseña aquí pero el catálogo completo se llena cuando haya más flujos validados)

</deferred>

---

*Phase: 141-skill-prompt-enrichment-skill*
*Context gathered: 2026-04-17*
