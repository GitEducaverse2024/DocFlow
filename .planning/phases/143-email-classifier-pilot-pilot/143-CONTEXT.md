# Phase 143: Email Classifier Pilot (PILOT) - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Un CatFlow de clasificacion de emails funciona end-to-end: recibe emails, normaliza, clasifica por producto Educa360, busca contexto RAG, genera respuesta con plantilla Pro-*, y envia via Gmail. Las lecciones aprendidas quedan registradas en CatBrain DoCatFlow para entrenar a CatBot en Phase 144.

</domain>

<decisions>
## Implementation Decisions

### Construccion del CatFlow
- Script API directo (patron `setup-inbound-canvas.mjs`): POST /canvas + PATCH flow_data con 8 nodos y edges
- No construir via CatBot — el script es reproducible, documentable, y sirve como referencia para Phase 144
- 3 emails reales en `initialInput` del nodo START: al menos 2 productos distintos + 1 spam
- Orden de nodos: START -> Normalizador -> Clasificador -> Condition -> RAG -> Respondedor -> Gmail -> OUTPUT
- Condition tiene 2 ramas: spam -> OUTPUT directo, no-spam -> RAG (continua pipeline)

### Instrucciones y modelos por nodo
- **Normalizador**: Extrae JSON con 6 campos (`from`, `subject`, `date`, `body_plain`, `has_attachments`, `message_id`). Modelo: `canvas-formatter` (tarea mecanica)
- **Clasificador**: Mapea a producto Educa360 (`K12`, `Simulator`, `REVI`, `Educaverse`, `otro`, `spam`) + `template_id` (UUID de plantilla Pro-*) + `reply_mode` (REPLY_HILO o EMAIL_NUEVO). Modelo: `canvas-classifier`. Taxonomia basada en `setup-inbound-canvas.mjs` adaptada a productos
- **Condition**: Evalua `clasificador.producto === "spam"`. Si spam -> ruta a OUTPUT (skip). Si no-spam -> continua a RAG
- **RAG**: Query al CatBrain DoCatFlow con `{producto} + {subject}` para inyectar contexto de producto al Respondedor
- **Respondedor**: Genera email completo usando plantilla Pro-* correspondiente (header/saludo/propuesta/CTA/footer) + contexto RAG. Modelo: `canvas-writer` (tarea creativa)
- **Gmail**: Conector Gmail existente (OAuth2). Usa `reply_to_email` extraido del Normalizador. `canvas_processed_emails` previene re-envios

### Ejecucion y validacion del piloto
- Ejecutar via POST /canvas/[id]/execute contra Gmail real
- Criterio de exito por nodo:
  - Normalizador: JSON valido con 6 campos parseables
  - Clasificador: producto + template_id correctos para cada email
  - Condition: spam filtrado, no-spam pasa
  - RAG: contexto relevante recuperado (o vacio sin error si no hay datos)
  - Respondedor: email contextualizado con estructura de plantilla
  - Gmail: email enviado (verificar en bandeja de salida)
- Si un nodo falla: ajustar instrucciones del nodo (90% de los casos), re-ejecutar. Ultimo recurso: cambiar modelo y documentar que el problema era el modelo
- Los 3 emails deben completar el pipeline sin intervencion manual

### Registro de lecciones
- Documento markdown en CatBrain DoCatFlow con 3 secciones:
  1. Instrucciones finales por nodo (copiar las que funcionaron, no las iniciales)
  2. Data contracts validados: input->output real de cada nodo (copiar outputs reales como evidencia)
  3. Errores encontrados: causa, solucion aplicada, si se resolvio con prompt o con cambio de modelo
- RAG reindex del CatBrain tras registrar para que Phase 144 lo consulte
- Solo evidencia real de ejecuciones exitosas, no teorico

### Claude's Discretion
- Contenido exacto de los 3 emails de prueba (seleccionar de bandeja real o redactar representativos)
- Formato exacto de las instrucciones de cada nodo (prompt engineering)
- Estructura del script de construccion (JS standalone o integrado en app/scripts/)
- Si verificar plantillas Pro-* primero y maquetarlas si estan vacias, o asumir que tienen contenido

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `setup-inbound-canvas.mjs`: Patron existente de clasificacion de emails con taxonomia lead types A-H, reply_mode, form extraction
- `catpaw-email-template-tools.ts`: 6 tools CRUD para plantillas, template-renderer.ts para renderizado
- 4 plantillas Pro-* con IDs conocidos: Pro-K12 (`bc03e496`), Pro-REVI (`9f97f705`), Pro-Simulator (`d7cc4227`), Pro-Educaverse (`155c955e`)
- `gmail-reader.ts` + `catpaw-gmail-executor.ts`: Gmail connector con OAuth2, listEmails, readEmail, sendEmail, replyToMessage
- `canvas_processed_emails` tabla: idempotencia por message_id per canvas

### Established Patterns
- Canvas creation: POST /canvas crea con START default, PATCH flow_data para nodos/edges
- Node execution: topological sort (Kahn) en canvas-executor.ts, fire-and-forget
- Node state tracking: canvas_runs.node_states JSON (status, output, tokens, duration, error)
- Errores en espanol para auto-correccion de CatBot (Phase 138)
- Aliases de modelo: canvas-classifier, canvas-formatter, canvas-writer (Phase 140)
- Reporting post-ejecucion con checkmarks (Phase 141)

### Integration Points
- POST /canvas para crear el CatFlow piloto
- POST /canvas/[id]/execute para ejecutar contra Gmail
- POST /api/catbrains/[id]/rag/append para registrar lecciones
- POST /api/catbrains/[id]/rag/create para reindexar
- CatBrain DoCatFlow: destino de las lecciones aprendidas

</code_context>

<specifics>
## Specific Ideas

- El script de construccion sirve como "golden reference" para Phase 144: CatBot debe poder replicar este CatFlow autonomamente
- Usar la taxonomia existente de setup-inbound-canvas.mjs como base, adaptando los lead types a productos Educa360
- Las plantillas Pro-* deben tener contenido real antes de ejecutar el piloto — verificar y maquetear si estan vacias (PILOT-01)
- Cada iteracion del piloto (ajuste de instrucciones + re-ejecucion) debe documentarse como leccion aprendida

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 143-email-classifier-pilot-pilot*
*Context gathered: 2026-04-17*
