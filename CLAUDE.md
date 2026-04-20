# DocFlow — Project Instructions

## Protocolo de Testing: CatBot como Oráculo

**Regla:** Toda funcionalidad implementada debe ser verificable a través de CatBot. CatBot debe tener el poder, los permisos y el conocimiento de cada feature nueva.

### Flujo de verificación

1. **Antes de marcar cualquier fase/plan como verificado:**
   - Formular un prompt para CatBot que ejercite la funcionalidad implementada
   - CatBot debe poder consultar, operar o demostrar la feature usando sus herramientas (tools)
   - Pegar la respuesta de CatBot (satisfactoria o negativa) como evidencia

2. **Si CatBot no puede verificar algo:**
   - Identificar qué herramienta/skill/permiso le falta
   - Añadirlo como gap de la fase (CatBot debe poder hacer todo lo que el sistema ofrece)

3. **Después de verificar con CatBot:**
   - Marcar el resultado en el UAT
   - Si falla: gap → fix plan
   - Si pasa: evidencia pegada → aprobado

### Implicaciones para desarrollo

- Cada feature nueva en Settings, Canvas, o cualquier parte del sistema debe tener un tool/skill de CatBot correspondiente
- CatBot debe poder consultar el estado de Discovery, MID, alias routing, agentes, canvas, etc.
- Las skills de CatBot deben actualizarse cuando se añade funcionalidad nueva

## Documentación canónica

Toda la documentación de DocFlow vive en `.docflow-kb/`. Ver `.docflow-kb/_manual.md`
para nomenclatura, estructura de carpetas, semver lifecycle y flujos. CatBot consume
el KB automáticamente via `search_kb` + `get_kb_entry` (Phase 152); las creation tools
sincronizan DB↔KB automáticamente (Phase 153 hooks).

### Rutas de referencia rápida
- Proceso de revisión Inbound → `.docflow-kb/protocols/catflow-inbound-review.md`
- Contratos de nodos canvas → `.docflow-kb/rules/R01..R29` + `.docflow-kb/domain/concepts/canvas-node.md`
- Incidentes conocidos → `.docflow-kb/incidents/`
- Catálogo de CatPaws, connectors, skills, templates → `.docflow-kb/resources/`

### Restricciones absolutas

Las 4 restricciones inmutables viven como rules en el KB con tag `critical`:
`search_kb({tags:["critical"]})` → R26-R29 (canvas-executor inmutable, agentId UUID-only,
process['env'] bracket notation, Docker rebuild tras execute-catpaw.ts).
