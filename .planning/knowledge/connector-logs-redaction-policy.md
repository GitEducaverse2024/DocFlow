# Connector Logs Redaction Policy

**Status:** Active since Phase 137-01 (INC-13 closure).
**Source:** `.planning/deferred-items.md` INC-13 — criterio de cierre #3.

Este documento describe qué campos de `connector_logs` persisten los catpaw
executors tras el fix de INC-13, qué campos se redactan sistemáticamente y
cómo habilitar modo debug para inspección puntual.

## Scope

Aplica a los INSERT en `connector_logs` realizados por:

- `app/src/lib/services/catpaw-gmail-executor.ts`
- `app/src/lib/services/catpaw-email-template-executor.ts`
- `app/src/lib/services/catpaw-drive-executor.ts`

Pre-INC-13 los tres executores persistían `request_payload = {operation, pawId}`
y `response_payload = {ok: true}`. Esto hacía imposible la reconstrucción
post-mortem VALIDATION-05 del Phase 136 gate. Post-INC-13 los payloads
contienen los args reales y el resultado real del conector.

## Campos persistidos por operación

### catpaw-gmail-executor

| Operation | request_payload.args | response_payload |
|-----------|---------------------|------------------|
| `send_email` | `{to, subject, cc, body_len, html_body_len}` — body/html_body completos NO se persisten, solo longitud (privacidad + size cap). | `{ok, messageId, threadId, ...}` — resultado completo de `sendEmail()`. |
| `list_emails` | `{folder, limit}` | `{count, messages:[{id,subject,from,...}]}` (subject lines OK; bodies truncados por safeStringify). |
| `search_emails` | `{query, limit}` | `{count, ids:[...]}` |
| `read_email` | `{messageId}` | cuerpo parcial (capped a 10_000 chars por safeStringify). |
| `draft_email` / `reply_to_message` | `{to, subject, cc, body_len, html_body_len, threadId?, messageId?}` | resultado completo del conector. |
| `mark_as_read` / `get_thread` | args crudos (solo IDs). | resultado completo. |

### catpaw-email-template-executor

| Operation | request_payload.args | response_payload |
|-----------|---------------------|------------------|
| `list_templates` | `{category?}` | array de templates con metadata. |
| `get_template` | `{template_id}` | `{id, name, description, category, instructions, structure}`. |
| `render_template` | `{template_id, variables}` — variables se trimean individualmente a 10_000 chars si exceden. | `{html, text, template_id, template_name}` — html renderizado completo (capped a 10_000 por safeStringify). |

Nota: `variables` entra tal cual al log. Esto es intencional — para cerrar
VALIDATION-05 es imprescindible poder ver QUÉ recibió el renderer, no solo
que lo llamaron.

### catpaw-drive-executor

| Operation | request_payload.args | response_payload |
|-----------|---------------------|------------------|
| `list_files` / `search_files` | `{folder_id, query, limit}` | `{count, files:[{id,name,mimeType,size,link}]}`. |
| `read_file` | `{file_id}` | metadata + primer fragmento de texto (capped). |
| `get_file_info` | `{file_id}` | metadata completa. |
| `upload_file` | `{file_name, folder_id, mime_type, content_len}` — `content` NUNCA se persiste, solo longitud. | `{id, name, link, folder_id, mime_type}`. |
| `create_folder` | `{folder_name, parent_folder_id}` | `{id, name, parent_folder_id}`. |

## Campos redactados (NUNCA persistir)

Los siguientes nombres de clave se reemplazan por `[REDACTED]` en
`redactAndTrimArgs()` / `redactAndTrimDriveArgs()`:

- `access_token`
- `refresh_token`
- `api_key`
- `password`
- `client_secret`
- `authorization`
- `cookie`
- `oauth_token`

Además, `safeStringify` aplica un cap duro de **10_000 caracteres** a cada
payload entero para evitar blowups de la tabla `connector_logs` — un body
multi-MB se trunca con sufijo `"...[truncado]"`.

### Redaction heurística (no implementada aún)

Los siguientes patrones se dejan como TODO si aparece evidencia de leaks:

- `/bearer\s+[\w-]+/i`
- `/sk-[A-Za-z0-9]{20,}/`
- `/[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{40,}/` (JWT triple)

## Debug mode

Para inspección puntual durante incident response, exportar la variable de
entorno:

```bash
CONNECTOR_LOGS_DEBUG=1
```

**(TODO: cablear esta flag en los 3 executors).** Cuando esté habilitada, los
executores deberán persistir `body`/`html_body`/`content` sin trim y sin
redaction de keys "safe-ish" (excepto credenciales explícitas). Deshabilitar
tras 24h.

## Ejemplos (antes / después de INC-13)

### Antes (broken)

```json
{
  "id": "log-42",
  "connector_id": "conn-gmail-1",
  "request_payload": "{\"operation\":\"send_email\",\"pawId\":\"paw-emitter-99\"}",
  "response_payload": "{\"ok\":true}",
  "status": "success"
}
```

No se puede saber **a quién** se envió, **qué body** se usó, ni **si hubo
messageId real**. El post-mortem de Phase 136 se atascó aquí.

### Después (INC-13 closed)

```json
{
  "id": "log-99",
  "connector_id": "conn-gmail-1",
  "request_payload": "{\"operation\":\"send_email\",\"pawId\":\"paw-emitter-99\",\"args\":{\"to\":\"antonio@example.com\",\"subject\":\"Informe Q1 2025\",\"body_len\":1423,\"html_body_len\":4210}}",
  "response_payload": "{\"ok\":true,\"messageId\":\"<CAE+abcdef@mail.gmail.com>\"}",
  "status": "success"
}
```

Reconstrucción post-mortem completa posible: destinatario, tamaño del body,
messageId real para cross-check con INBOX.

## Post-mortem capability (VALIDATION-05)

Con estos campos se puede reconstruir cualquier run pipeline:

1. Listar `connector_logs` ordenados por `created_at` para un `run_id` o
   ventana temporal.
2. Para cada emitter log: verificar que `response_payload.messageId` existe Y
   que `request_payload.args.to` coincide con lo esperado.
3. Para cada renderer log: verificar que `request_payload.args.variables`
   cubre todas las claves esperadas del template.
4. Correlacionar con `intent_jobs.flow_data_iter{0,1}` (Phase 133-04 FOUND-06)
   para confirmar que el canvas-executor propagó los outputs correctos.

## Referencias

- `.planning/deferred-items.md` — INC-11, INC-12, INC-13.
- `.planning/phases/137-learning-loops-memory-learn/137-01-runtime-connector-contracts-PLAN.md`
- `.planning/phases/136-end-to-end-validation-validation-gate/136-VERIFICATION.md`
- `app/src/lib/services/catpaw-gmail-executor.ts` — función `redactAndTrimArgs`.
- `app/src/lib/services/catpaw-email-template-executor.ts` — función `trimArgsForLog`.
- `app/src/lib/services/catpaw-drive-executor.ts` — función `redactAndTrimDriveArgs`.
