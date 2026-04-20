---
id: rule-r25-mandatory-idempotence
type: rule
subtype: design
lang: es
title: "R25 — Idempotencia obligatoria — triple protección anti-duplicados"
summary: "Idempotencia obligatoria — triple protección anti-duplicados"
tags: [canvas, R25, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R25) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R25 — Idempotencia obligatoria — triple protección anti-duplicados

**Idempotencia obligatoria:** registrar messageIds procesados en `canvas_processed_emails`. **Triple protección:** Lector (threadId) + ITERATOR (filter) + Connector (safety net).

## Por qué

Un pipeline sin idempotencia re-procesa el mismo email cada ejecución (cron L-V 10:00). El lead recibe N respuestas idénticas → daño reputacional.

El Lector ya hace cruce `threadId` inbox vs sent para filtrar emails ya respondidos, pero FALLA para emails nuevos (el reply crea un thread distinto al original en Gmail web app). Necesitamos más capas.

## Incidente real (E7)

**Pipeline v3**: un lead `anna@example.com` enviaba un email. Pipeline respondía con Pro-K12 → thread A (inbox) y thread B (sent). Siguiente ejecución: thread A sigue en inbox "sin respuesta en su thread" → pipeline re-responde. Otro día: re-responde otra vez. Cliente recibió 3 respuestas idénticas.

Fix v4: triple protección.

## Arquitectura de la triple protección

| Capa | Mecanismo | Fiabilidad |
|------|-----------|------------|
| 1. Lector | Cruce `threadId` inbox vs sent | ~80% (falla con EMAIL_NUEVO) |
| 2. ITERATOR | Filtro por `messageId` en `canvas_processed_emails` | ~99% (depende de runtime) |
| 3. Connector | Check individual por `messageId` antes de enviar | 100% (última línea) |

### Capa 1 — Lector
```
query IMAP:
  INBOX: fecha >= now-7d
  SENT:  fecha >= now-7d
  filter: INBOX items con threadId NO presente en SENT
```

### Capa 2 — ITERATOR (filter)
Antes de emitir items al loop, el ITERATOR consulta `canvas_processed_emails`:
```sql
SELECT message_id FROM canvas_processed_emails
 WHERE canvas_id = :current_canvas_id
   AND message_id IN (<item_messageIds>);
```
Items ya presentes se filtran silenciosamente.

### Capa 3 — Connector (safety net)
Antes de llamar `send_email`, el Connector Gmail re-chequea:
```sql
SELECT 1 FROM canvas_processed_emails
 WHERE canvas_id = :canvas_id AND message_id = :message_id;
```
Si existe → abort con `{ok: true, skipped: true, reason: 'already_processed'}`.

Tras send OK, el connector INSERTA el messageId. La tabla es `(canvas_id, message_id) UNIQUE`.

## Cómo aplicar

- Toda entidad con unique identifier que atraviese un canvas debe tener registro anti-duplicado.
- Para emails: `canvas_processed_emails(canvas_id, message_id, processed_at)`.
- Para leads Holded: `canvas_processed_leads(canvas_id, lead_id, processed_at)`.
- Triple protección: lógica de lectura + filtro en ITERATOR + check final en connector.

## Ver también

- **R24** (fallback no-destructivo — si hay duplicado, skippear con log, no re-procesar).
- `protocols/catflow-inbound-review.md` §4.3 triple protección.
