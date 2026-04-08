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

## Protocolo de Documentación: Knowledge Tree + CatBot

**Regla:** Cada feature nueva o cambio significativo debe documentarse en el knowledge tree Y ser accesible para CatBot.

### Checklist por implementación

1. **Knowledge Tree (app/data/knowledge/*.json):**
   - Actualizar el JSON del área afectada (catboard, catbrains, catpaw, catflow, canvas, catpower, settings)
   - Añadir endpoints nuevos al array `endpoints`
   - Añadir tools nuevos al array `tools`
   - Añadir conceptos al array `concepts` si la feature introduce terminología nueva
   - Añadir howto si el flujo de uso no es obvio
   - Añadir dont si hay anti-patterns conocidos
   - Añadir common_errors si hay errores previsibles con causa y solución
   - Actualizar sources con rutas a documentación en .planning/ si existe

2. **CatBot Tools:**
   - Cada entidad nueva debe tener al menos un tool `list_*` (always_allowed)
   - Operaciones de escritura: permission-gated con la action key correspondiente
   - Operaciones destructivas o cross-user: sudo-required
   - Registrar el tool en TOOLS array, añadir case en executeTool, actualizar permission gate

3. **PromptAssembler:**
   - Si la feature cambia navegación o secciones del UI, actualizar el knowledge JSON correspondiente
   - Si hay nueva sección de configuración, verificar que PromptAssembler la inyecta al leer catbot_config

4. **Docker:**
   - Los knowledge JSON se auto-sincronizan al volumen via docker-entrypoint.sh
   - Si se añade un nuevo JSON en data/knowledge/, se incluirá automáticamente en el siguiente deploy

### ¿Cuándo NO documentar?

- Bug fixes que no cambian comportamiento visible
- Refactors internos sin cambio de API
- Cambios de estilo/CSS
