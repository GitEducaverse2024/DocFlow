---
id: protocol-catflow-inbound-review
type: protocol
subtype: review-process
lang: es
title: "Protocolo: Revisión Diaria Inbound (CatFlow Educa360)"
summary: "Protocolo de revisión diaria del buzón info@educa360.com — 15 errores reales encontrados durante la estabilización v4 + patrón arquitectónico aplicado."
tags: [canvas, catflow, email, testing]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/proceso-catflow-revision-inbound.md (v4.0) — 15 errores + patrón aplicado, reglas R01-R25 ahora atomizadas en rules/" }
ttl: never
---

# Protocolo: Revisión Diaria Inbound (CatFlow Educa360)

**Canvas ID (test):** `test-inbound-ff06b82c`
**Canvas ID (producción):** `9366fa92-99c6-4ec9-8cf8-7c627ccd1d97`
**Estado:** FUNCIONAL — validado en producción desde v4.0 (abril 2026).

## 1. Objetivo del sistema

Automatizar la gestión diaria del buzón `info@educa360.com`:

- Revisar emails sin respuesta de los últimos 7 días.
- Clasificar cada email (lead, registro free, spam, sistema).
- Responder automáticamente con plantilla visual del producto (Pro-K12, Pro-REVI, etc.).
- Marcar como leído los emails de sistema/spam.
- Derivar al responsable los que requieren atención humana.
- Generar informe diario al equipo directivo.
- NUNCA re-procesar un email ya atendido.

## 2. Arquitectura final (v4c)

```
START → Lector (LLM+Gmail) → ITERATOR
                                ├─ element → Clasificador (LLM) → Respondedor (LLM+RAG) → Connector Gmail (CÓDIGO)
                                │                                                               ↓
                                └─ completed                                              ITERATOR_END
                                       ↓                                                       ↓
                                 Connector Informe (CÓDIGO) ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ITERATOR_END
                                       ↓
                                 Storage Log → Output
```

**Principio fundamental:** El LLM **piensa** (clasifica, redacta). El código **ejecuta** (render template, enviar email, mark_read, filtrar duplicados). Ver [R20](../rules/R20-code-over-llm.md), [R23](../rules/R23-thinking-vs-execution-nodes.md).

**Nodos LLM:** 3 (Lector, Clasificador, Respondedor).
**Nodos código:** 2 (Connector Gmail, Connector Informe).
**Tool-calls LLM para ejecución:** 0 (todo determinista).

## 3. Historial de errores documentados

Las 25 Reglas de Oro (R01..R25) se extrajeron directamente de estos errores. Cada error remite a la(s) regla(s) nacida(s) de él. Las reglas viven atomizadas en [`rules/R01-*.md`..`rules/R25-*.md`](../rules/).

### 3.1 Fase v1-v3 (pre-estabilización)

| # | Error | Causa raíz | Solución | Regla derivada |
|---|-------|-----------|----------|----------------|
| 1 | Emails leídos sin respuesta no detectados | Criterio `is:unread` vs `sin respuesta` | OAuth2 + cruce `threadId` inbox vs sent | [R03](../rules/R03-technical-criteria.md) |
| 2 | Clasificador truncaba array >5 emails | `max_tokens=1024` insuficiente | Aumentar a 8192 | [R16](../rules/R16-max-tokens-estimate.md) |
| 3 | Clasificador confundido por tools irrelevantes | Gmail connector vinculado innecesariamente | Eliminar conectores innecesarios | [R08](../rules/R08-no-unnecessary-connectors.md) |
| 4 | Skill duplicada confunde Clasificador | "Triage" + "Leads y Funnel" contradecían | Desvincular Triage | [R06](../rules/R06-knowledge-in-skills.md), [R08](../rules/R08-no-unnecessary-connectors.md) |
| 5 | Nodo CatBrain destruye JSON array | CatBrain = texto→texto | Agent con CatBrain vinculado | [R07](../rules/R07-catbrain-vs-agent.md) |
| 6 | Respondedor inventa messageId y emails | LLM "completa" campos vacíos | Regla anti-teléfono-escacharrado | [R10](../rules/R10-preserve-fields.md) |
| 7 | Respondedor omite emails del array | Sin instrucción "TODOS" | "PASA SIN MODIFICAR los demás" | [R12](../rules/R12-explicit-passthrough.md) |
| 8 | Maquetador agota rounds con arrays | 3 tool-calls × 7 emails = 21 rounds | ITERATOR (1 email por nodo) | [R14](../rules/R14-arrays-iterator.md) |
| 9 | Plantillas Pro-* sin bloques instruction | Visual-only sin placeholder | Connector inyecta HTML después del visual | [R18](../rules/R18-template-instruction-block.md) |
| 10 | Ejecutor envía a BlastFunnels en vez del lead | `to=from` pero from es sistema | Campo canónico `reply_to_email` | [R13](../rules/R13-canonical-field-names.md) |
| 11 | Ejecutor envía texto plano en vez de HTML | Instrucciones no actualizadas | Actualizar a `html_body` | [R13](../rules/R13-canonical-field-names.md) |
| 12 | Informe llega vacío | Log usa IDs técnicos, no `datos_lead` | Instrucciones de formato con campos reales | [R13](../rules/R13-canonical-field-names.md) |
| 13 | Redactor Informe usa CatPaw equivocado | Respondedor (temp 0.6) en vez de Redactor (0.3) | CatPaw específico para informes | [R05](../rules/R05-single-responsibility.md) |

### 3.2 Fase v4 — Estabilización fase a fase

Metodología: añadir un nodo a la vez, validar con datos reales, iterar hasta OK ([R04](../rules/R04-minimal-first-flow.md)).

| Fase | Nodos añadidos | Resultado | Iteraciones |
|------|-------|-----------|-------------|
| 1: Lector | START → Lector → Output | JSON limpio, BlastFunnels capturado | 3 (body 200→500→800 chars) |
| 2: Iterator | + ITERATOR + ITERATOR_END | 6/6 items parseados | 1 |
| 3: Clasificador | + Clasificador en loop | 6/6 clasificados correctamente | 1 |
| 4a: Resp+Maq LLM | + Respondedor + Maquetador LLM | **FRACASO**: campos perdidos, markdown | 2 |
| 4b: Connector determinista | Eliminar Maquetador, + Connector código | 10/10 OK, 50% menos tokens | 1 |
| 4c: RefCode | + `ref_code` en templates | 8/8 OK, 4 plantillas distintas | 2 |
| 5: Post-loop | + Storage + Informe + Output | Pipeline completo funcional | 4 |
| Validación final | 0 emails nuevos | 0 enviados, informe "0 procesados" | 3 |
| Email nuevo | 1 email nuevo real | 1 respondido correctamente | 1 |

### 3.3 Los 15 errores de la fase v4 con trazabilidad a regla

| # | Error | Causa raíz | Solución | Regla |
|---|-------|-----------|----------|-------|
| E1 | ITERATOR recibía "yes" de Condition | Condition devuelve texto, no datos | Eliminar Condition, ITERATOR antes del Clasificador | — |
| E2 | Clasificador devolvía `[]` con array input | System prompt diseñado para UN email, no array | Mover ITERATOR antes del Clasificador | [R04](../rules/R04-minimal-first-flow.md) |
| E3 | Lector JSON truncado → 50 items basura | `parseIteratorItems` fallback a split por `\n` | Reparar JSON o devolver `[]`. NUNCA split por líneas | [R24](../rules/R24-no-destructive-fallback.md) |
| E4 | Maquetador LLM pierde campos JSON | LLM devuelve solo `{html_body}` sin propagar | Reemplazar Maquetador LLM por Connector código | [R20](../rules/R20-code-over-llm.md) |
| E5 | LLM envuelve JSON en markdown ``` | Gemini wrappea en ``\`json ~40% veces | `cleanLlmOutput()` en executor: strip automático | [R21](../rules/R21-code-cleans-llm-output.md) |
| E6 | Maquetador LLM no usa plantilla correcta | LLM "decide" qué plantilla | RefCode: mapeo determinista producto→código | [R22](../rules/R22-refcode-references.md) |
| E7 | Emails re-contestados cada ejecución | Reply va a hilo nuevo → threadId cruce no detecta | Tabla `canvas_processed_emails` + filtro en ITERATOR | [R25](../rules/R25-mandatory-idempotence.md) |
| E8 | Filtro de tracker no funcionaba en runtime | try/catch silencioso + `}` extra | Eliminar try/catch, logging explícito por item | — |
| E9 | Informe no usaba template CatBot | `resolveAssetsForEmail` no se llamaba en `send_report` | Añadir resolve assets antes de render | — |
| E10 | Informe enviado a info@ en vez de antonio@ | `getPredecessorOutput` tomaba edge de nodo skipped | Mejorar para preferir edge de source completed | — |
| E11 | Remitente mostraba "Info_Auth_Educa360" | Campo `from_name` del connector Gmail | Cambiar a "Educa360" | — |
| E12 | Asunto con caracteres raros (ÃƒÂ³) | Encoding UTF-8 en raw MIME de `replyToMessage` | RFC 2047 Base64 encoding del subject | — |
| E13 | CTA duplicado en email | Respondedor incluía cierre, template también | Respondedor sin cierre, template lo tiene | [R05](../rules/R05-single-responsibility.md) |
| E14 | Post-loop skipped cuando 0 items | `getSkippedNodes` excluía nodos del chosen branch | Edge del chosen branch cuenta como non-skipped parent | — |
| E15 | Connector informe recibía output vacío | `getPredecessorOutput` tomaba primer edge (iterator-end skipped) | Preferir edge de source completed con output | — |

## 4. Decisiones arquitectónicas clave

### 4.1 El LLM piensa, el código ejecuta — ver [R20](../rules/R20-code-over-llm.md)

El cambio más impactante de v4: eliminar 2 nodos LLM (Maquetador + Ejecutor) y reemplazarlos por 1 Connector Gmail con lógica determinista.

**Antes (v3):**
`Respondedor (LLM) → Maquetador (LLM: list+get+render) → Ejecutor (LLM: send+mark)`

**Después (v4):**
`Respondedor (LLM: rellena esquema) → Connector Gmail (CÓDIGO: render+send+mark)`

Resultado: 50% menos tokens, 0 errores de template, 100% determinista.

### 4.2 RefCode — Referencias deterministas — ver [R22](../rules/R22-refcode-references.md)

Las plantillas se identifican por códigos alfanuméricos de 6 chars. El LLM solo copia el código del mapeo en la skill. El código busca por `ref_code` con lookup tolerante (ref_code → nombre → parcial → ID).

### 4.3 Triple protección anti-duplicados — ver [R25](../rules/R25-mandatory-idempotence.md)

| Capa | Mecanismo | Fiabilidad |
|------|-----------|------------|
| 1. Lector | Cruce `threadId` inbox vs sent | ~80% (falla con EMAIL_NUEVO) |
| 2. ITERATOR | Filtro por `messageId` en `canvas_processed_emails` | ~99% (depende de runtime) |
| 3. Connector | Check individual por `messageId` antes de enviar | 100% (última línea) |

### 4.4 Plantillas sin instruction blocks — ver [R18](../rules/R18-template-instruction-block.md)

Para plantillas visual-only (Pro-K12, Pro-REVI, etc.), el código renderiza el visual y luego inyecta el texto HTML del Respondedor como `<tr><td>` antes del footer. No depende del LLM para la inyección.

### 4.5 Informe siempre se envía

El ITERATOR tiene dos salidas: `element` (loop body) y `completed` (bypass). Ambas conectan al Connector Informe. Con 0 items, va por `completed` → informe con "0 procesados". Con N items, va por loop → ITERATOR_END → informe con resultados.

## 5. Las 25 Reglas de Oro — ahora atomizadas

Las 25 reglas extraídas durante la estabilización viven ahora como átomos individuales bajo [`rules/`](../rules/). Esta tabla es el índice:

**FASE 0 — Antes de tocar el canvas:** [R01](../rules/R01-data-contracts.md), [R02](../rules/R02-array-iterator-threshold.md), [R03](../rules/R03-technical-criteria.md), [R04](../rules/R04-minimal-first-flow.md).

**FASE 1 — Diseño de nodos:** [R05](../rules/R05-single-responsibility.md), [R06](../rules/R06-knowledge-in-skills.md), [R07](../rules/R07-catbrain-vs-agent.md), [R08](../rules/R08-no-unnecessary-connectors.md), [R09](../rules/R09-generic-catpaw.md).

**FASE 2 — Instrucciones LLM:** [R10](../rules/R10-preserve-fields.md), [R11](../rules/R11-positive-instructions.md), [R12](../rules/R12-explicit-passthrough.md), [R13](../rules/R13-canonical-field-names.md).

**FASE 3 — Ejecución y arrays:** [R14](../rules/R14-arrays-iterator.md), [R15](../rules/R15-minimal-information.md), [R16](../rules/R16-max-tokens-estimate.md), [R17](../rules/R17-probabilistic-llm.md).

**FASE 4 — Plantillas:** [R18](../rules/R18-template-instruction-block.md), [R19](../rules/R19-template-selection-vs-layout.md).

**FASE 5 — Separación LLM/código:** [R20](../rules/R20-code-over-llm.md), [R21](../rules/R21-code-cleans-llm-output.md), [R22](../rules/R22-refcode-references.md), [R23](../rules/R23-thinking-vs-execution-nodes.md).

**FASE 6 — Resiliencia:** [R24](../rules/R24-no-destructive-fallback.md), [R25](../rules/R25-mandatory-idempotence.md).

## 6. Roadmap futuro (no implementado)

### Inmediato

- Data Contracts básicos en executor (`json_required`, `non_empty` entre nodos).
- Migrar canvas test → producción + activar cron L-V 10:00.

### v26.0 — Robustez Enterprise

- Patrón Dispatcher/Worker (MultiAgent + listen_mode) para cargas pesadas.
- Dead Letter Queue (DLQ) visual en UI.
- Edge validation con schemas opcionales.
- Nodo SPLITTER como sugar syntax sobre MultiAgent.

## 7. Historial de versiones del protocolo

| Fecha | Versión | Cambios |
|-------|---------|---------|
| 2026-04-02 | v1.0 | Documento inicial: 11 nodos, 6 puntos calientes, 9 aprendizajes |
| 2026-04-02 | v2.0 | Retrospectiva asistente, Reglas R01-R19, flujo v4 con ITERATOR |
| 2026-04-03 | v3.0 | Estabilización fase a fase, errores v4, Reglas R20-R23, RefCode |
| 2026-04-03 | v4.0 | Pipeline completo validado: 15 errores, R24-R25, triple protección |
| 2026-04-20 | v4.1 | Migrado a `.docflow-kb/protocols/` — reglas atomizadas en `rules/` (Phase 151) |

---

*Protocolo vivo — se actualiza con cada iteración del canvas Revisión Diaria Inbound.*
