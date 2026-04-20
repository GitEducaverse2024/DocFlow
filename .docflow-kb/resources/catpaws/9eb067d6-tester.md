---
id: catpaw-9eb067d6
type: resource
subtype: catpaw
lang: es
mode: chat
title: Tester
summary: Updated v2 via Phase 153
tags: [catpaw, chat, business]
audience: [catbot, architect, developer]
status: deprecated
created_at: 2026-04-20T14:26:42.850Z
created_by: web:default
version: 2.0.0
updated_at: 2026-04-20T14:27:55.981Z
updated_by: api:cat-paws.DELETE
last_accessed_at: 2026-04-20T14:26:42.850Z
access_count: 0
deprecated_at: 2026-04-20T14:27:55.981Z
deprecated_by: api:cat-paws.DELETE
deprecated_reason: DB row deleted at 2026-04-20T14:27:55.981Z
source_of_truth:
  - db: cat_paws
    id: 9eb067d6-6bed-467a-afee-f54636260b6f
    fields_from_db: [name, description, mode, model, system_prompt, temperature, max_tokens, is_active, department]
enriched_fields: []
related: []
sync_snapshot:
  system_prompt: Eres Tester, un asistente de prueba para la fase 153 oracle.
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: web:default, change: Creado automáticamente por knowledge-sync (web:default) }
  - { version: 1.0.1, date: 2026-04-20, author: api:cat-paws.PATCH, change: "Auto-sync patch bump (warning: DB overwrote local human edit in fields_from_db)" }
  - { version: 2.0.0, date: 2026-04-20, author: api:cat-paws.DELETE, change: DEPRECATED — DB row deleted at 2026-04-20T14:27:55.981Z }
ttl: managed
---

# Tester

Test CatPaw para Phase 153 oracle

**Modo:** chat | **Modelo:** gemini-main | **Departamento:** business

## System prompt

```
Eres Tester, un asistente de prueba para la fase 153 oracle.
```

## Configuración

- Temperature: 0.2
- Max tokens: 4096
