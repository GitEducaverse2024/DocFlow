---
phase: 137-learning-loops-memory-learn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/src/lib/services/catpaw-email-template-executor.ts
  - app/src/lib/services/catpaw-gmail-executor.ts
  - app/src/lib/services/catpaw-drive-executor.ts
  - app/src/lib/__tests__/catpaw-email-template-executor.test.ts
  - app/src/lib/__tests__/catpaw-gmail-executor.test.ts
  - app/data/knowledge/canvas.json
  - app/data/knowledge/catflow.json
  - .planning/knowledge/connector-logs-redaction-policy.md
autonomous: true
requirements: [INC-11, INC-12, INC-13]
must_haves:
  truths:
    - "render_template falla duro si faltan variables obligatorias del template"
    - "render_template falla duro si el html renderizado aún contiene placeholders no sustituidos"
    - "send_email rechaza args sin to/subject/body con error explícito (nunca {ok:true})"
    - "send_email sólo devuelve success cuando la respuesta trae messageId real"
    - "connector_logs.request_payload persiste todos los args reales (no solo {operation,pawId})"
    - "connector_logs.response_payload persiste messageId/ids/urls devueltos por el conector"
    - "Existe documentación de qué campos de connector_logs se persisten y cuáles se redactan"
    - "Knowledge tree (canvas.json + catflow.json) documenta INC-11/INC-12 como common_errors con causa y solución"
  artifacts:
    - path: "app/src/lib/services/catpaw-email-template-executor.ts"
      provides: "render_template con validación estricta y logging completo"
    - path: "app/src/lib/services/catpaw-gmail-executor.ts"
      provides: "send_email con validación body obligatoria + messageId mandatorio en response"
    - path: "app/src/lib/services/catpaw-drive-executor.ts"
      provides: "logging completo de request/response payloads"
    - path: ".planning/knowledge/connector-logs-redaction-policy.md"
      provides: "Documentación del policy de logging: campos persistidos, redactados, debug mode"
  key_links:
    - from: "catpaw-email-template-executor.ts render_template"
      to: "email_templates.structure variables"
      via: "validateRequiredVariables + detectUnresolvedPlaceholders"
      pattern: "throws when variables missing or placeholder remains"
    - from: "catpaw-gmail-executor.ts send_email"
      to: "sendEmail() response"
      via: "assert result.messageId"
      pattern: "if (!result.messageId) return {error}"
    - from: "all catpaw-*-executor.ts"
      to: "connector_logs"
      via: "JSON.stringify(args) + JSON.stringify(result)"
      pattern: "request_payload: JSON.stringify\\(\\{ operation, pawId, args"
---

<objective>
Cerrar los tres bugs de runtime INC-11/12/13 descubiertos en el gate de Phase 136, que bloquean la reproducibilidad end-to-end de la señal única del milestone (Holded Q1 vía Telegram).

**INC-11:** render_template del conector Email Templates acepta variables incompletas y devuelve el template con placeholders literales como `"Contenido principal del email"`, permitiendo que un canvas siga con un `html_body` vacío.

**INC-12:** catpaw-gmail-executor acepta send_email sin validar `body`/`html_body`, y el wrapper devuelve `{ok:true}` incluso cuando `sendEmail()` no devuelve `messageId`. El agent emitter puede alucinar "enviado correctamente" sin que nada se haya enviado.

**INC-13:** El log `request_payload` de `catpaw-email-template-executor.ts`, `catpaw-gmail-executor.ts` y `catpaw-drive-executor.ts` persiste solo `{operation, pawId}` — rompe VALIDATION-05 del post-mortem capability del gate.

Purpose: Sin estos fixes la señal única de LEARN-01 (3x reproducible via Telegram) es imposible. Son precondiciones.
Output: Tres catpaw connector executors con validación estricta y logging rico + tests de regresión + knowledge tree actualizado + policy doc de logging.

---

**Nota sobre el alcance del cierre de INC-12 (Option B — wrapper-level):**

El criterio de cierre #2 de INC-12 dice literalmente "El executor marca el nodo emitter como `failed` cuando `response_payload` no trae `messageId`". Este plan cierra INC-12 **en la capa wrapper**, no en canvas-executor.ts/execute-catpaw.ts, por las siguientes razones (sanctioned deviation justificada):

1. **El wrapper ya devuelve `{ok:false, error:'MISSING_REQUIRED_FIELD'}` o `{error:'...messageId...'}`** cuando los args están incompletos o la respuesta del conector no trae messageId (PASO 1 y PASO 2 de Task 2). Lo que recibe el agent LLM es un string JSON con `error:`, no `{ok:true}`.

2. **El agent LLM no puede fabricar success sin contradecir la tool response.** Si el wrapper devuelve error, el agent recibe el error en el histórico de tool-calls. Fabricar un output "enviado correctamente" tras recibir error de tool sería una alucinación detectable en el post-mortem (ahora posible gracias a INC-13: connector_logs con payloads reales).

3. **La capa de executor (canvas-executor.ts o execute-catpaw.ts) requeriría un hook post-tool-call que parsee heurísticamente el output textual del agent** para detectar discrepancias entre el tool response y la narrativa final del agent. Esto es frágil (el agent puede expresar el resultado de muchas formas), requiere tocar `execute-catpaw.ts` (archivo NEVER-MODIFY) o añadir una segunda excepción sancionada a canvas-executor.ts (además de la de LEARN-06 en plan 02), y el beneficio marginal sobre el wrapper-level check es bajo.

4. **El signal-gate 137-06 observa la verdad end-to-end** (llegada real del email a los inboxes de antonio+fen), no un proxy. Si el wrapper falla y el agent fabrica success, el gate lo detecta porque los emails no llegan. El gate actualiza su acceptance form para validar explícitamente este escenario.

5. **Option A (fix en executor) queda documentado como deferred** en este plan y puede implementarse en v27.2 si aparece evidencia de que la capa wrapper es insuficiente.

**Actualización requerida en plan 137-06 (signal-gate):** la acceptance form del checkpoint human-verify añade:
> ✓ Si el wrapper Gmail falla (args incompletos o respuesta sin messageId), el agent emitter propaga el error en su output textual — NO fabrica "enviado correctamente". Verificar en connector_logs que `response_payload` del connector NO trae messageId ↔ `output` del nodo emitter NO afirma envío exitoso.

Esta actualización se aplica también en esta revisión.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/deferred-items.md
@.planning/phases/136-end-to-end-validation-validation-gate/136-VERIFICATION.md
@app/src/lib/services/catpaw-email-template-executor.ts
@app/src/lib/services/catpaw-gmail-executor.ts
@app/src/lib/services/catpaw-drive-executor.ts
@app/data/knowledge/canvas.json
@app/data/knowledge/catflow.json

<interfaces>
From app/src/lib/services/catpaw-email-template-executor.ts (current state — bugs):

```typescript
// Line 88-117: render_template does NOT validate variables against template structure.
// Line 122-135: connector_logs INSERT persists only {operation, pawId} as request_payload.
// Line 129: JSON.stringify({ operation, pawId })  <-- INC-13 root cause
// Line 130: JSON.stringify({ ok: true })           <-- INC-13 also
```

From app/src/lib/services/catpaw-gmail-executor.ts (current state — bugs):

```typescript
// Line 76-90: send_email case.
// Line 82: if (!to || !subject) return error   <-- body NOT required, INC-12 root cause
// Line 83-88: sendEmail(...) called; no assertion that result.messageId is present.
// INC-13: request_payload log likely also stripped — verify same pattern around L120+.
```

From app/src/lib/services/email-service.ts (producer):

```typescript
export async function sendEmail(config, { to, subject, text_body?, html_body?, cc? }): Promise<{messageId?: string, ok: boolean, ...}>;
```

Key invariant: messageId must be present on success; absence is a failure signal.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: INC-11 — render_template contract enforcement + INC-13 logging en email template executor</name>
  <files>
    app/src/lib/services/catpaw-email-template-executor.ts,
    app/src/lib/__tests__/catpaw-email-template-executor.test.ts
  </files>
  <behavior>
    - Test 1: render_template con un `template_id` válido pero `variables` que NO cubren todas las claves `{{X}}` del template → el handler devuelve JSON con `error` mencionando las variables faltantes. El html devuelto NO llega al caller.
    - Test 2: render_template cuyas variables cubren todas las keys del template → éxito; el html devuelto no contiene ninguna subcadena `{{` ni `}}` (detect unresolved placeholders como segunda línea de defensa).
    - Test 3: render_template devuelve error si, tras render, el html aún contiene el texto placeholder literal `"Contenido principal del email"` (el específico que disparó INC-11) o cualquier otro `{{placeholder}}` residual.
    - Test 4: connector_logs.request_payload para cualquier operación (list_templates, get_template, render_template) persiste `args` completos (template_id, variables) además de {operation, pawId}. Spy sobre `db.prepare(...).run` y assert que el 3er arg contiene `"template_id":` y `"variables":` como subcadena.
    - Test 5: connector_logs.response_payload para render_template persiste el html completo y template_id, NO `{ok:true}`.
  </behavior>
  <action>
    PASO 1 — Leer `app/src/lib/services/catpaw-email-template-executor.ts` y `app/src/lib/services/template-renderer.ts` para entender la estructura del template (`structure.variables` o keys del `{{X}}` en el html/text). Identificar cómo `renderTemplate(structure, variables)` detecta falta de variables (probablemente NO lo hace — por eso INC-11).

    PASO 2 — Añadir helper `extractRequiredVariableKeys(structure: TemplateStructure): string[]` que recorre los campos string del structure (html, text, subject, header, body…) y extrae todas las ocurrencias `{{([a-z_][a-z_0-9]*)}}` case-insensitive como set. Alternativa si la tabla `email_templates.structure` ya tiene un campo `variables[]` declarado, usarlo directamente.

    PASO 3 — En `case 'render_template'`, tras cargar y resolver assets, ANTES de llamar `renderTemplate`:
    ```typescript
    const requiredKeys = extractRequiredVariableKeys(structure);
    const providedKeys = Object.keys(variables);
    const missing = requiredKeys.filter(k => !providedKeys.includes(k) || variables[k] == null || variables[k] === '');
    if (missing.length > 0) {
      return JSON.stringify({
        error: `render_template: faltan variables obligatorias: ${missing.join(', ')}`,
        required_variables: requiredKeys,
        provided_variables: providedKeys,
      });
    }
    ```

    PASO 4 — Tras `renderTemplate(...)` añadir segunda defensa:
    ```typescript
    const unresolvedMatch = rendered.html.match(/\{\{[a-z_][a-z_0-9]*\}\}/i);
    if (unresolvedMatch || rendered.html.includes('Contenido principal del email')) {
      return JSON.stringify({
        error: `render_template: el html renderizado aún contiene placeholders sin sustituir: ${unresolvedMatch?.[0] ?? 'Contenido principal del email'}`,
      });
    }
    ```

    PASO 5 — **INC-13** Reemplazar el INSERT a `connector_logs` (aprox línea 125-132) por un payload rico:
    ```typescript
    db.prepare(
      'INSERT INTO connector_logs (id, connector_id, request_payload, response_payload, status, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      generateId(), connectorId,
      JSON.stringify({ operation, pawId, args }),
      JSON.stringify(result),  // no más {ok:true}; el result completo
      'success', durationMs, new Date().toISOString()
    );
    ```
    NOTA: `args` puede contener strings grandes (variables). Trim a 10_000 chars antes del stringify para no romper la tabla.

    PASO 6 — Tests en `catpaw-email-template-executor.test.ts` (crear si no existe) con los 5 casos de `<behavior>`. Mockear `db.prepare(...).get` y `db.prepare(...).run` con vi.spyOn del better-sqlite3. Usar estructura de template mínima: `{html: "<p>{{resumen}}</p>", subject: "{{title}}"}`.

    PASO 7 — Verificar que `resolveAssetsForEmail` no introduce placeholders `{{}}` propios (son para assets, no variables — deberían estar resueltos antes del check de placeholders). Si lo hace, el regex debe excluir ese namespace.
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm test -- catpaw-email-template-executor</automated>
  </verify>
  <done>
    - render_template retorna error cuando faltan variables del template
    - render_template retorna error si html aún contiene placeholders sin sustituir
    - connector_logs.request_payload ya incluye args completos
    - connector_logs.response_payload persiste el html renderizado, no {ok:true}
    - Tests de regresión verdes
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: INC-12 — Gmail send_email strict validation + messageId mandatory + INC-13 logging en gmail/drive executors + knowledge tree + redaction policy doc</name>
  <files>
    app/src/lib/services/catpaw-gmail-executor.ts,
    app/src/lib/services/catpaw-drive-executor.ts,
    app/src/lib/__tests__/catpaw-gmail-executor.test.ts,
    app/data/knowledge/canvas.json,
    app/data/knowledge/catflow.json,
    .planning/knowledge/connector-logs-redaction-policy.md
  </files>
  <behavior>
    - Test 1: send_email sin `to` → error "to, subject y body (o html_body) son requeridos"; sin llamar sendEmail.
    - Test 2: send_email sin `subject` → error mismo.
    - Test 3: send_email sin `body` Y sin `html_body` → error. (INC-12 core: hoy pasa con silent success).
    - Test 4: send_email con to/subject/body todos presentes pero sendEmail devuelve `{ok: true}` SIN messageId → error "send_email: el conector no devolvió messageId, envío considerado fallido".
    - Test 5: send_email con to/subject/body + sendEmail devuelve `{ok: true, messageId: "<abc@educa>"}` → success; el resultado JSON contiene messageId.
    - Test 6: connector_logs.request_payload tras send_email persiste args completos (to, subject, output_length aunque body trimmed), NO solo {operation,pawId}.
    - Test 7: connector_logs.response_payload persiste messageId en éxito.
    - Test 8: send_email con body vacío `""` → error (empty string ≠ presente).
    - Test 9 (knowledge tree): `grep -q "INC-11" app/data/knowledge/canvas.json` y `grep -q "INC-12" app/data/knowledge/canvas.json`.
    - Test 10 (redaction policy doc): `.planning/knowledge/connector-logs-redaction-policy.md` existe y contiene las secciones "Campos persistidos", "Campos redactados", "Debug mode".
  </behavior>
  <action>
    PASO 1 — En `catpaw-gmail-executor.ts` case 'send_email' (L76-90), reemplazar el check por:
    ```typescript
    case 'send_email': {
      const to = args.to as string;
      const subject = args.subject as string;
      const body = args.body as string | undefined;
      const htmlBody = args.html_body as string | undefined;
      const cc = args.cc as string[] | undefined;

      if (!to || !to.trim()) return JSON.stringify({ error: 'send_email: field "to" is required and non-empty' });
      if (!subject || !subject.trim()) return JSON.stringify({ error: 'send_email: field "subject" is required and non-empty' });
      if ((!body || !body.trim()) && (!htmlBody || !htmlBody.trim())) {
        return JSON.stringify({ error: 'send_email: at least one of "body" or "html_body" is required and non-empty' });
      }

      result = await sendEmail(config, {
        to,
        subject,
        ...(htmlBody ? { html_body: htmlBody } : {}),
        ...(body ? { text_body: body } : {}),
        ...(cc && cc.length > 0 ? { cc } : {}),
      });

      // INC-12: messageId es mandatorio. Sin él, el envío no se considera exitoso.
      if (!result || !(result as { messageId?: string }).messageId) {
        return JSON.stringify({
          error: 'send_email: el conector no devolvió messageId; envío considerado fallido',
          raw_response: result,
        });
      }
      break;
    }
    ```

    PASO 2 — **INC-13** Buscar el `INSERT INTO connector_logs` dentro del mismo archivo (patrón idéntico al email template executor). Reemplazar el payload por:
    ```typescript
    JSON.stringify({
      operation,
      pawId,
      args: {
        ...args,
        // redact PII-sensitive fields (tokens, refresh_tokens) pero preservar to/subject/body
        ...(args.body ? { body_len: String(args.body).length } : {}),
        ...(args.html_body ? { html_body_len: String(args.html_body).length } : {}),
      },
    })
    ```
    Y en response_payload: `JSON.stringify(result)` (no `{ok:true}`).

    PASO 3 — Aplicar el mismo fix de INC-13 a `catpaw-drive-executor.ts`: localizar el INSERT a connector_logs y reemplazar request_payload/response_payload con los datos reales (drive upload/list/search tiene args como folder_id, file_name, query). Sin cambios de validación funcional en Drive; solo logging.

    PASO 4 — Tests de regresión en `catpaw-gmail-executor.test.ts` (crear). Mockear `sendEmail` de `@/lib/services/email-service` con `vi.mock`. Para los tests de response, hacer que el mock devuelva `{ok:true}` (sin messageId) en un caso y `{ok:true, messageId: '<id@domain>'}` en otro.

    PASO 5 — **Crear `.planning/knowledge/connector-logs-redaction-policy.md`** con este contenido (estructura mínima):
    ```markdown
    # Connector Logs Redaction Policy

    Criterio de cierre #3 de INC-13 (deferred-items.md).

    ## Scope
    Aplica a los INSERTs en `connector_logs` de todos los `catpaw-*-executor.ts`.

    ## Campos persistidos (por operación)

    ### catpaw-gmail-executor
    - **send_email request_payload:** `{operation, pawId, args: {to, subject, cc, body_len, html_body_len}}` — body/html_body completos NO se persisten (solo longitud) para evitar payloads >10KB.
    - **send_email response_payload:** `{ok, messageId, threadId, ...}` del sendEmail() result completo.
    - **search/list request_payload:** `{operation, pawId, args: {query, max_results, ...}}`
    - **search/list response_payload:** `{count, ids: [...]}` (no el contenido de los emails).

    ### catpaw-email-template-executor
    - **render_template request_payload:** `{operation, pawId, args: {template_id, variables}}` (variables trim a 10_000 chars si excede).
    - **render_template response_payload:** `{ok, template_id, html}` (html renderizado completo).
    - **list_templates / get_template:** args y metadata completos.

    ### catpaw-drive-executor
    - **upload request_payload:** `{operation, pawId, args: {folder_id, file_name, mime_type, size_bytes}}` — contenido binario NO se persiste.
    - **upload response_payload:** `{ok, file_id, url}`.
    - **list/search:** args + metadata, sin contenido de ficheros.

    ## Campos redactados (NUNCA persistir)
    - `access_token`, `refresh_token`, `api_key`, `password`, `client_secret`
    - Cabeceras `Authorization`, `Cookie`
    - Cualquier string que matchee `/bearer\s+[\w-]+/i` o `/sk-[A-Za-z0-9]{20,}/`

    ## Debug mode
    Variable de entorno `CONNECTOR_LOGS_DEBUG=1` habilita persistencia completa de body/html_body (sin truncar). Solo para investigación puntual — deshabilitar tras 24h.

    ## Ejemplos (antes/después de INC-13)
    *(rellenar con ejemplos reales del run holded-q1 post-fix)*

    ## Post-mortem capability
    Con estos campos se puede reconstruir cualquier run pipeline y validar VALIDATION-05: ver qué generó el architect (`request_payload`) y qué recibió el canvas (`response_payload`) en cada nodo.
    ```

    PASO 6 — **Knowledge tree — canvas.json:** añadir al array `common_errors` (crear si no existe):
    ```json
    {"error": "INC-11: render_template devuelve html con placeholder 'Contenido principal del email'", "cause": "CatPaw renderer llama render_template con variables incompletas o mal nombradas; el conector no validaba y devolvía el template con placeholders literales", "solution": "Cerrado en Phase 137-01 Task 1. El wrapper extractRequiredVariableKeys + detectUnresolvedPlaceholders falla duro si faltan variables o si el html renderizado contiene {{}} residual o el texto literal del placeholder default."},
    {"error": "INC-12: send_email devuelve {ok:true} sin messageId y el agent emitter fabrica 'enviado correctamente'", "cause": "El catpaw-gmail wrapper aceptaba args sin body/html_body y devolvía {ok:true} cuando el conector real no trae messageId. El agent LLM tomaba el ok como confirmación y alucinaba output de éxito.", "solution": "Cerrado en Phase 137-01 Task 2. Validación estricta to/subject/body + assert messageId presente. Si falta cualquiera, el wrapper devuelve {error:...} al agent, quien NO puede fabricar success sin contradecir la tool response. Ver también deferred-items.md INC-12 y 137-06 signal-gate."}
    ```
    Añadir al array `concepts` (si no está ya) el connector `gmail` mencionando la validación estricta, y el connector `email_template` mencionando el contrato de variables de `render_template`.
    Actualizar `sources` con ruta a este PLAN.md y a deferred-items.md. Actualizar `updated_at`.

    PASO 7 — **Knowledge tree — catflow.json:** mismo patrón. Añadir los 2 `common_errors` INC-11/INC-12 (si catflow.json tiene ese array; si no, añadirlo). Añadir al array `howto`: "Diagnosticar por qué un renderer email enviando html vacío: consultar connector_logs con request_payload rico post-INC-13 para ver qué variables recibió render_template; si el html todavía contiene '{{X}}' el wrapper post-INC-11 habrá devuelto error explícito." Actualizar `updated_at`.

    PASO 8 — NO tocar `canvas-executor.ts` ni `execute-catpaw.ts`. El fix "el executor debe verificar output coincide con respuesta estructural" queda como **deferred a v27.2 (Option A)** y se documenta en el narrativo de este plan (ver `<objective>`). La capa wrapper es el cierre aceptado para este milestone — ver razones 1-5 en `<objective>`.
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm test -- catpaw-gmail-executor &amp;&amp; grep -q "INC-11" app/data/knowledge/canvas.json &amp;&amp; grep -q "INC-12" app/data/knowledge/canvas.json &amp;&amp; test -f .planning/knowledge/connector-logs-redaction-policy.md</automated>
  </verify>
  <done>
    - send_email sin body/html_body devuelve error explícito
    - send_email sin messageId en response devuelve error (no silent success)
    - connector_logs.request_payload en gmail y drive persiste args completos
    - connector_logs.response_payload persiste messageId
    - 10 tests verdes (8 gmail + 2 knowledge/doc)
    - canvas.json y catflow.json documentan INC-11/INC-12 como common_errors
    - .planning/knowledge/connector-logs-redaction-policy.md existe y cumple criterio de cierre #3 de INC-13
    - Suite global sin regresiones
  </done>
</task>

</tasks>

<verification>
1. `cd app && npm test -- catpaw-email-template-executor catpaw-gmail-executor` → todos verdes
2. `cd app && npm test` → suite completa sin regresiones (147+ tests intent-job-executor + canvas-flow-designer + catbot-pipeline-prompts del baseline Phase 135)
3. `grep -q "INC-11" app/data/knowledge/canvas.json && grep -q "INC-12" app/data/knowledge/canvas.json`
4. `test -f .planning/knowledge/connector-logs-redaction-policy.md`
5. Tras docker rebuild, un run manual de test-pipeline.mjs --case holded-q1 debe, en el peor caso (args incompletos), producir error explícito en el nodo emitter en lugar de silent success
</verification>

<success_criteria>
- INC-11 cerrado: render_template falla duro si el contrato no se cumple
- INC-12 cerrado a nivel wrapper (Option B justificado en objective): send_email valida args y exige messageId real. La verificación E2E (output del agent ↔ tool response) queda delegada al signal-gate 137-06 que observa la verdad end-to-end (email recibido).
- INC-13 cerrado: connector_logs persiste args+response reales, post-mortem reconstructible, redaction policy documentada en .planning/knowledge/
- Knowledge tree actualizado (canvas.json + catflow.json) con common_errors INC-11/INC-12 per CLAUDE.md protocol
- Zero modificaciones a `canvas-executor.ts`, `execute-catpaw.ts`, `insertSideEffectGuards`, intent_jobs state machine
</success_criteria>

<output>
After completion, create `.planning/phases/137-learning-loops-memory-learn/137-01-SUMMARY.md`
</output>
</content>
</invoke>