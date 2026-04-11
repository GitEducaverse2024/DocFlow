---
phase: 134-architect-data-layer-arch-data
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/src/lib/services/canvas-connector-contracts.ts
  - app/src/lib/__tests__/canvas-connector-contracts.test.ts
autonomous: true
requirements:
  - ARCH-DATA-02
  - ARCH-DATA-03
must_haves:
  truths:
    - "Para cada connector_type soportado existe un objeto `contracts` declarativo con los campos que canvas-executor.ts realmente lee del nodo predecesor"
    - "Los contratos Gmail incluyen send_report, send_reply, mark_read, forward con los required_fields verificados contra canvas-executor.ts"
    - "El módulo es importable desde canvas-flow-designer.ts sin ciclos"
    - "Los contratos son constantes en código (no strings del prompt): cualquier cambio al contrato real en canvas-executor.ts rompe un test si no se actualiza el módulo"
  artifacts:
    - path: "app/src/lib/services/canvas-connector-contracts.ts"
      provides: "CONNECTOR_CONTRACTS constant + getConnectorContracts(connectorType) helper"
      exports: ["CONNECTOR_CONTRACTS", "getConnectorContracts", "ConnectorContract", "ConnectorAction"]
    - path: "app/src/lib/__tests__/canvas-connector-contracts.test.ts"
      provides: "Unit tests confirmando shape + Gmail actions + lookup semantics"
  key_links:
    - from: "app/src/lib/services/canvas-connector-contracts.ts"
      to: "app/src/lib/services/canvas-executor.ts"
      via: "comentarios citando línea exacta de canvas-executor donde cada campo se lee"
      pattern: "canvas-executor.ts:(660|720|868|1010|1147)"
---

<objective>
Crear el módulo de contratos declarativos de conectores como constante/módulo de código. Este es el fundamento de ARCH-DATA-02/03: los contratos viven en código, derivados línea-a-línea de lo que `canvas-executor.ts` realmente lee del `predecessorOutput`, NO son abstracciones del prompt. Todo lo demás de Phase 134 (plan 03 scanCanvasResources enrichment) importa este módulo — por eso va primero en Wave 1.

Purpose: ARCH-DATA-03 exige que los contratos vivan en código. Si mañana alguien cambia `actionData.report_to` a `actionData.destino_email` en canvas-executor.ts, un test de este módulo debe romperse. Es la documentación del contrato real.

Output:
- `app/src/lib/services/canvas-connector-contracts.ts` con la constante `CONNECTOR_CONTRACTS` indexada por `connector_type` (gmail, google_drive, mcp_server, email_template, smtp, http_api, n8n_webhook)
- Helper `getConnectorContracts(connectorType: string): ConnectorContract | null`
- Tests unitarios que bloquean regresiones si los campos declarados no coinciden con lo que canvas-executor.ts lee
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md

<interfaces>
<!-- Contratos REALES extraídos de canvas-executor.ts. Estos son los campos
     que el executor actualmente lee del `predecessorOutput` parseado como
     actionData. Si cambian, el test de este módulo DEBE romperse. -->

From app/src/lib/services/canvas-executor.ts (lineas 652-1005, Gmail connector):

```
connector.type === 'gmail' — rama deterministic (actionData.accion_final):

  accion === 'send_report':
    actionData.accion_final === 'send_report'          // required (discriminador)
    actionData.report_to                                // required (default 'antonio@educa360.com' si falta)
    actionData.report_subject                           // optional (default: emoji + fecha)
    actionData.report_template_ref                      // optional (ref_code de email_templates)
    actionData.results | actionData.items               // required (array de objetos iterator output)
      items[i].accion_tomada                            // leído para stats
      items[i].respuesta.nombre_lead                    // leído en tabla HTML
      items[i].respuesta.email_destino                  // leído en tabla HTML
      items[i].respuesta.producto                       // leído en tabla HTML
      items[i].destinatario_final                       // leído en tabla HTML
      items[i].categoria                                // leído en tabla HTML
      items[i].producto_mencionado                      // fallback producto

  accion === 'send_reply':
    actionData.accion_final === 'send_reply'            // required
    actionData.respuesta                                // required (object)
      respuesta.producto | actionData.producto_mencionado // required (default 'K12')
      respuesta.email_destino | actionData.reply_to_email // required — throw si falta
      respuesta.saludo                                  // optional (default 'Hola')
      respuesta.cuerpo                                  // optional (default '')
      respuesta.cierre                                  // optional
      respuesta.asunto                                  // optional
      respuesta.plantilla_ref                           // optional (lookup en email_templates)
    actionData.reply_mode                               // optional ('REPLY_HILO' | 'EMAIL_NUEVO', default 'EMAIL_NUEVO')
    actionData.messageId                                // required si reply_mode='REPLY_HILO'
    actionData.threadId                                 // optional (default messageId)

  accion === 'mark_read':
    actionData.accion_final === 'mark_read'             // required
    actionData.messageId                                // required — si falta, no se ejecuta

  accion === 'forward':
    actionData.accion_final === 'forward'               // required
    actionData.forward_to                               // required (default 'antonio@educa360.com')
    actionData.subject                                  // optional
    actionData.resumen_derivacion | actionData.resumen_consulta | actionData.body  // required texto
    actionData.messageId                                // optional (marca leído si existe)
```

From app/src/lib/services/canvas-executor.ts (lineas 1009-1088, Google Drive connector):

```
connector.type === 'google_drive' — lee node.data, NO predecessorOutput:

  data.drive_operation                                  // required ('upload'|'download'|'list'|'create_folder', default 'upload')
  data.drive_folder_id                                  // optional (default config.root_folder_id o 'root')
  data.drive_file_name                                  // optional (default `output-${node.id}.md`)
  data.drive_file_id                                    // required para download
  data.drive_mime_type                                  // optional para download (default octet-stream)

  upload:    predecessorOutput se usa como contenido del archivo (string)
  download:  sobreescribe output con contenido del archivo
  list:      ignora predecessorOutput, devuelve JSON de listado
```

From app/src/lib/services/canvas-executor.ts (linea 1147+, MCP Server connector):

```
connector.type === 'mcp_server' — lee node.data:

  data.tool_name                                        // required (default connConfig.tool_name)
  data.tool_args                                        // optional (object, merge con {keywords: predecessorOutput})
```

NOTA: Holded vive como mcp_server (tool_name='holded_search_facturas' u otros). El contrato
Holded son los tool_args que el connector MCP espera, documentados por tool_name.
</interfaces>

Relevant existing code (DO NOT re-explore — contracts above are canonical):
@app/src/lib/services/canvas-executor.ts (líneas 640-900 Gmail, 1010-1088 Drive, 1147-1250 MCP)
@app/src/lib/services/canvas-flow-designer.ts (consumirá este módulo en Plan 03)
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Crear canvas-connector-contracts.ts con Gmail contracts primero (TDD)</name>
  <files>
    app/src/lib/services/canvas-connector-contracts.ts
    app/src/lib/__tests__/canvas-connector-contracts.test.ts
  </files>
  <behavior>
    - Test 1: `getConnectorContracts('gmail')` devuelve objeto con `contracts.send_report`, `contracts.send_reply`, `contracts.mark_read`, `contracts.forward` (las 4 acciones).
    - Test 2: `contracts.send_report.required_fields` contiene exactamente `['accion_final', 'report_to', 'results']` (con `accion_final` como discriminador).
    - Test 3: `contracts.send_report.optional_fields` contiene `['report_subject', 'report_template_ref']`.
    - Test 4: `contracts.send_reply.required_fields` contiene `['accion_final', 'respuesta.email_destino', 'respuesta.producto']` y `contracts.send_reply.optional_fields` contiene `['messageId', 'threadId', 'reply_mode', 'respuesta.saludo', 'respuesta.cuerpo', 'respuesta.asunto', 'respuesta.plantilla_ref']`.
    - Test 5: `contracts.mark_read.required_fields` contiene `['accion_final', 'messageId']`.
    - Test 6: `contracts.forward.required_fields` contiene `['accion_final', 'forward_to']` y `optional_fields` contiene `['subject', 'resumen_derivacion', 'resumen_consulta', 'body', 'messageId']`.
    - Test 7: cada action tiene un `description` string no vacío.
    - Test 8: `getConnectorContracts('unknown_type')` devuelve `null`.
    - Test 9: `getConnectorContracts('google_drive')` devuelve objeto con `contracts.upload`, `contracts.download`, `contracts.list`, `contracts.create_folder` y campos declarativos de `node.data` (drive_operation, drive_folder_id, drive_file_name, drive_file_id, drive_mime_type).
    - Test 10: `getConnectorContracts('mcp_server')` devuelve contrato genérico con `contracts.invoke_tool` = {required: ['tool_name'], optional: ['tool_args']}.
    - Test 11: `CONNECTOR_CONTRACTS` es exportado como const readonly; los types `ConnectorContract` y `ConnectorAction` son exportados.
    - Test 12 (regression guard): para Gmail `send_report`, el test lee el contrato y verifica que contiene todos los campos que aparecen como `actionData.X` en canvas-executor.ts — si un futuro refactor cambia `actionData.report_to` a otro nombre, este test rompe. Implementación del guard: lista hardcoded en el test derivada del <interfaces> block arriba; no es un scan dinámico.
  </behavior>
  <action>
    Crear `app/src/lib/services/canvas-connector-contracts.ts`:

    1. Definir types:
       ```typescript
       export interface ConnectorAction {
         required_fields: readonly string[];
         optional_fields: readonly string[];
         description: string;
         source_line_ref: string; // ej "canvas-executor.ts:660-676"
       }
       export interface ConnectorContract {
         connector_type: string;
         contracts: Record<string, ConnectorAction>;
       }
       ```

    2. Exportar `CONNECTOR_CONTRACTS: Record<string, ConnectorContract>` con claves:
       - `'gmail'`: 4 actions (send_report, send_reply, mark_read, forward) siguiendo EXACTAMENTE el <interfaces> block arriba. Cada action incluye `source_line_ref` citando canvas-executor.ts.
       - `'google_drive'`: 4 actions (upload, download, list, create_folder). Importante: son campos de `node.data`, NO de predecessorOutput parseado. Documentar esto en description.
       - `'mcp_server'`: 1 action genérica `invoke_tool` con `required_fields: ['tool_name']`, `optional_fields: ['tool_args']`. description: "MCP server invoca tool por JSON-RPC; el predecessorOutput se pasa como tool_args.keywords automáticamente. Holded vive aquí (tool_name='holded_*')."
       - `'email_template'`: 1 action `render_template` con `required_fields: []` (usa `data.template_id` del nodo + predecessorOutput como JSON de variables), optional con `template_id`.
       - `'smtp'`, `'http_api'`, `'n8n_webhook'`: contratos mínimos con descripción "side effect; predecessorOutput se pasa opaco al POST body" — estos 3 no se usan en holded-q1 pero van por completeness.

    3. Exportar helper `export function getConnectorContracts(connectorType: string): ConnectorContract | null` que retorna `CONNECTOR_CONTRACTS[connectorType] ?? null`.

    4. Comentario del archivo: "Derivado de canvas-executor.ts. Si cambias un campo aquí SIN cambiar canvas-executor.ts (o viceversa), el pipeline romperá en runtime. Los tests unitarios bloquean esta drift."

    Crear `app/src/lib/__tests__/canvas-connector-contracts.test.ts`:
    - Suite describe('CONNECTOR_CONTRACTS') con los 12 tests listados en <behavior>.
    - Usar `import { describe, it, expect } from 'vitest'`.
    - Regression guard (test 12) como un `expect(Object.keys(contracts.send_report.required_fields).sort()).toEqual([...hardcoded list].sort())`.

    Naming: usar snake_case para action names porque coinciden con el valor literal de `accion_final` que canvas-executor.ts compara por ===.
  </action>
  <verify>
    <automated>cd app && npx vitest run src/lib/__tests__/canvas-connector-contracts.test.ts</automated>
  </verify>
  <done>
    Los 12 tests pasan. El archivo `canvas-connector-contracts.ts` exporta `CONNECTOR_CONTRACTS`, `getConnectorContracts`, `ConnectorContract`, `ConnectorAction`. El test 12 rompería si alguien cambia el contrato Gmail sin sincronizar canvas-executor.ts.
  </done>
</task>

</tasks>

<verification>
Post-plan audit (antes de finalizar):
1. `grep -n "accion_final" app/src/lib/services/canvas-executor.ts` debe coincidir con las 4 acciones Gmail declaradas en el módulo.
2. `npx tsc --noEmit` desde app/ no reporta errores en el nuevo archivo.
3. El módulo NO importa nada runtime (solo types) — evita que Plan 03 cree ciclos.
</verification>

<success_criteria>
- [ ] `canvas-connector-contracts.ts` exporta CONNECTOR_CONTRACTS con gmail (4 actions), google_drive (4), mcp_server (1), email_template (1), smtp/http_api/n8n_webhook (stubs)
- [ ] Gmail `send_report` required_fields = ['accion_final', 'report_to', 'results']
- [ ] Gmail `send_reply` required_fields incluye 'respuesta.email_destino' y 'respuesta.producto'
- [ ] Gmail `mark_read` required_fields = ['accion_final', 'messageId']
- [ ] 12 tests unitarios pasan vía `npx vitest run src/lib/__tests__/canvas-connector-contracts.test.ts`
- [ ] `source_line_ref` en cada action cita canvas-executor.ts:LINEA
- [ ] Módulo es type-only imports, sin side effects, listo para Plan 03 importarlo
</success_criteria>

<output>
Crear `.planning/phases/134-architect-data-layer-arch-data/134-01-SUMMARY.md`
</output>