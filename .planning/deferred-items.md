# Deferred Items

Bugs y trabajo diferidos fuera del scope del milestone vigente. Cada entrada debe tener causa raíz, routing al milestone/fase destino y criterios de cierre.

---

## INC-11 — Renderer agent no interpola contenido en render_template

**Fecha:** 2026-04-11
**Severidad:** Alta (rompe envío real de emails en canvases con renderer)
**Descubierto en:** Phase 136 gate, caso holded-q1, run `0347b621-7045-4ba7-932e-7ecdd42e6ea7` (2026-04-10T20:34–20:37)
**Routing:** Milestone v27.1 (executor runtime)

**Síntoma:**
El nodo renderer n4 (CatPaw "Maquetador Email") llama a `render_template` del conector `Plantillas Email Corporativas` (`b3f4bfcd-...`), pero el `html_body` devuelto contiene el placeholder literal:
```html
<div style="color:#9CA3AF;...border:1px dashed #D1D5DB">
  Contenido principal del email
</div>
```
El resumen ejecutivo generado por n3 nunca entra al template.

**Root cause hipotetizado:**
El system prompt del CatPaw Maquetador Email no especifica correctamente el nombre de la variable que el template slot espera, o el contrato entre el agente renderer y el conector `email_template` no está documentado. El agente llama `render_template` con variables faltantes o mal nombradas → el conector renderiza el template con placeholders por defecto → no falla → el canvas sigue con un html vacío.

**Fix requerido:**
1. Documentar el contrato del conector `email_template` (qué variables acepta `render_template`, cuáles son obligatorias, nombres exactos de los slots).
2. Inyectar ese contrato en el system prompt del CatPaw Maquetador Email (y de cualquier otro renderer agent).
3. Hacer que el conector `email_template` falle duro si faltan variables obligatorias o si el template renderizado aún contiene placeholders sin sustituir.

**Criterios de cierre:**
- Un run de `test-pipeline.mjs --case holded-q1` produce un `html_body` en n4 que contiene el texto del resumen ejecutivo de n3 (no el placeholder).
- `render_template` devuelve error explícito cuando faltan variables requeridas.

---

## INC-12 — Gmail catpaw-connector acepta send_email con args vacíos y devuelve {ok:true}

**Fecha:** 2026-04-11
**Severidad:** Crítica (silent success enmascara fallos reales; imposible detectar emails no enviados)
**Descubierto en:** Phase 136 gate, caso holded-q1, run `0347b621-7045-4ba7-932e-7ecdd42e6ea7`, connector_log `5b5e450d-9072-4584-9118-d5381940faed` (2026-04-10T20:37:38.086Z)
**Routing:** Milestone v27.1 (executor runtime)

**Síntoma:**
El conector Gmail `Info_Auth_Educa360` (`1d3c7b77-...`, oauth2) recibió un `send_email` cuyo `request_payload` loggeado fue literalmente:
```json
{"operation":"send_email","pawId":"65e3a722-9e43-43fc-ab8a-e68261c6d3da"}
```
Sin `to`, sin `subject`, sin `body`. El conector respondió `{"ok":true}` **sin `messageId`** — compárese con el log baseline de 2026-04-10T09:40:21 del conector `43cbe742-...` que sí incluye `messageId: "<18c62fe3-...@educa360.com>"`.

El email nunca llegó a los destinatarios reales. El agente emitter n5 emitió un texto alucinado: `"enviado exitosamente a antonio@educa360.com y fen@educa360.com"` (donde `fen@educa360.com` no existe en ninguna config).

**Root cause hipotetizado:**
El wrapper catpaw del conector Gmail hace early-return con `{ok:true}` cuando recibe args vacíos o incompletos, en vez de validar y lanzar error. Esto permite que el agent LLM invente su propio `output` textual de "envío exitoso" sin que el executor detecte la discrepancia.

**Fix requerido:**
1. Validación obligatoria en el handler `send_email` del catpaw-connector Gmail: `to`, `subject` y `body` (o `html_body`) deben estar presentes y no vacíos.
2. Si falta cualquiera → lanzar `ConnectorError` con código `MISSING_REQUIRED_FIELD` y mensaje indicando el campo.
3. `response_payload` debe incluir `messageId` en caso de éxito real; si no lo trae, el executor debe tratarlo como fallo.
4. El canvas-executor debe verificar que el `output` del nodo emitter coincida con la respuesta estructural del conector (no aceptar narrativa LLM como prueba de envío).

**Criterios de cierre:**
- `send_email` con args incompletos devuelve error explícito (nunca `{ok:true}`).
- El executor marca el nodo emitter como `failed` cuando `response_payload` no trae `messageId`.
- Test de regresión que llame `send_email` sin `to` y verifique que lanza error.

---

## INC-13 — connector_logs.request_payload redactado (observabilidad rota)

**Fecha:** 2026-04-11
**Severidad:** Alta (bloquea post-mortem de cualquier fallo de runtime — criterio VALIDATION-05 del gate)
**Descubierto en:** Phase 136 gate, al intentar diagnosticar INC-11/INC-12
**Routing:** Milestone v27.1 (observabilidad)

**Síntoma:**
Los logs del catpaw-connector wrapper registran `request_payload` con solo `{operation, pawId}` en vez del payload real. Ejemplos de la ventana 20:35–20:37 del run holded-q1:
```
{"operation":"list_templates","pawId":"e9860d40-..."}
{"operation":"get_template","pawId":"e9860d40-..."}
{"operation":"render_template","pawId":"e9860d40-..."}
{"operation":"send_email","pawId":"65e3a722-..."}
```
Todos con `response_payload: {"ok":true}` sin detalles.

Comparativa con logs antiguos (pre-catpaw wrapper, connector directo `43cbe742-...` del 09:40): el `request_payload` incluía `to`, `subject`, `output_length` y la response incluía `messageId`. El formato rico se perdió cuando el conector pasó a invocarse vía el wrapper catpaw.

**Impacto en el gate:**
VALIDATION-05 (post-mortem capability) asume que los outputs persistidos permiten ver qué generó el architect y qué recibió el executor en cada iteración. Con los request_payloads redactados, es imposible reconstruir qué args llegaron a cada conector → diagnóstico requiere inspección manual de node_states + hipótesis.

**Fix requerido:**
1. Restaurar logging completo de `request_payload` y `response_payload` en el catpaw-connector wrapper.
2. Si hay preocupación de tamaño/PII: modo debug configurable que persista el payload completo, con redacción solo de campos sensibles conocidos (tokens, passwords, refresh_tokens).
3. `response_payload` de conectores de acción (send_email, write_row, etc.) debe persistir el result completo (messageId, row_id, etc.), no solo `{ok:true}`.

**Criterios de cierre:**
- Un run de `test-pipeline.mjs` con runtime enabled produce `connector_logs` donde `request_payload` contiene todos los args reales pasados al conector.
- `response_payload` de `send_email` contiene `messageId` en caso de éxito.
- Documentación en `.planning/knowledge/` de qué campos se persisten y cuáles se redactan.

---
