> **⚠️ MOVED to `.docflow-kb/protocols/catflow-inbound-review.md`** during Phase 151 (2026-04-20).
>
> New locations:
> - `.docflow-kb/protocols/catflow-inbound-review.md`
> - `.docflow-kb/rules/R01..R25 (25 reglas atomizadas)`
>
> The content below is preserved for reference only — new edits MUST happen in the KB, not here.
> Eliminación física de este archivo: Phase 155 (cleanup final).

---
# CatFlow — Revisión Diaria Inbound Educa360
## Documento de Proceso: Diseño, Fallos, Razonamiento y Soluciones

**Fecha:** Abril 2026
**Estado:** FUNCIONAL — validado en producción
**Canvas ID (test):** `test-inbound-ff06b82c`
**Canvas ID (producción):** `9366fa92-99c6-4ec9-8cf8-7c627ccd1d97`
**Versión:** v4.0

---

## 1. Objetivo del sistema

Automatizar la gestión diaria del buzón `info@educa360.com`:
- Revisar emails sin respuesta de los últimos 7 días
- Clasificar cada email (lead, registro free, spam, sistema)
- Responder automáticamente con plantilla visual del producto (Pro-K12, Pro-REVI, etc.)
- Marcar como leído los emails de sistema/spam
- Derivar al responsable los que requieren atención humana
- Generar informe diario al equipo directivo
- NUNCA re-procesar un email ya atendido

---

## 2. Arquitectura final v4c

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

**Principio fundamental:** El LLM piensa (clasifica, redacta). El código ejecuta (render template, enviar email, mark_read, filtrar duplicados).

**Nodos LLM:** 3 (Lector, Clasificador, Respondedor)
**Nodos código:** 2 (Connector Gmail, Connector Informe)
**Tool-calls LLM para ejecución:** 0 (todo determinista)

---

## 3. Historial completo de errores y soluciones

### Fase v1-v3 (pre-estabilización)

| Error | Causa raíz | Solución |
|-------|-----------|----------|
| Emails leídos sin respuesta no detectados | Criterio `is:unread` vs `sin respuesta` | OAuth2 + cruce threadId inbox vs sent |
| Clasificador truncaba array >5 emails | max_tokens 1024 insuficiente | Aumentar a 8192 |
| Clasificador confundido por tools irrelevantes | Gmail connector vinculado innecesariamente | R08: eliminar conectores innecesarios |
| Skill duplicada confunde Clasificador | "Triage" + "Leads y Funnel" contradecían | Desvincular Triage |
| Nodo CatBrain destruye JSON array | CatBrain = texto→texto, no maneja JSON | R07: Agent con CatBrain vinculado |
| Respondedor inventa messageId y emails | LLM "completa" campos que percibe vacíos | R10: regla anti-teléfono-escacharrado |
| Respondedor omite emails del array | Sin instrucción de "TODOS", procesa el primero | R12: "PASA SIN MODIFICAR los demás" |
| Maquetador agota rounds con arrays | 3 tool-calls × 7 emails = 21 rounds (límite 8) | R14: ITERATOR (1 email por nodo) |
| Plantillas Pro-* sin bloques instruction | Creadas como visual-only, sin variable LLM | Connector inyecta HTML después del visual |
| Ejecutor envía a BlastFunnels en vez del lead | `to=from` pero from es sistema | R13: campo canónico `reply_to_email` |
| Ejecutor envía texto plano en vez de HTML | Instrucciones no actualizadas post-Maquetador | Actualizar a `html_body` |
| Informe llega vacío | Log usa IDs técnicos, no datos_lead | Instrucciones de formato con campos reales |
| Redactor Informe usa CatPaw equivocado | Respondedor (temp 0.6) en vez de Redactor (0.3) | CatPaw específico para informes |

### Fase v4 — Estabilización (metodología fase a fase)

| Fase | Nodos | Resultado | Iteraciones |
|------|-------|-----------|-------------|
| 1: Lector | START → Lector → Output | JSON limpio, BlastFunnels capturado | 3 (body 200→500→800ch) |
| 2: Iterator | + ITERATOR + ITERATOR_END | 6/6 items parseados | 1 |
| 3: Clasificador | + Clasificador en loop | 6/6 clasificados correctamente | 1 |
| 4a: Resp+Maq LLM | + Respondedor + Maquetador LLM | FRACASO: campos perdidos, markdown | 2 |
| 4b: Connector determinista | Eliminar Maquetador, + Connector código | 10/10 OK, 50% menos tokens | 1 |
| 4c: RefCode | + ref_code en templates | 8/8 OK, 4 plantillas distintas | 2 |
| 5: Post-loop | + Storage + Informe + Output | Pipeline completo funcional | 4 |
| Validación final | 0 emails nuevos | 0 enviados, informe "0 procesados" | 3 |
| Email nuevo | 1 email nuevo real | 1 respondido correctamente | 1 |

### Errores descubiertos durante la estabilización v4

| # | Error | Causa raíz | Solución | Regla |
|---|-------|-----------|----------|-------|
| E1 | ITERATOR recibía "yes" de Condition | Condition devuelve texto, no datos. ITERATOR necesita el array del Lector | Eliminar Condition, poner ITERATOR antes del Clasificador | — |
| E2 | Clasificador devolvía `[]` con array input | System prompt diseñado para UN email, no array | Mover ITERATOR antes del Clasificador (1 email por vez) | R04 |
| E3 | Lector JSON truncado → 50 items basura | `parseIteratorItems` hacía fallback a split por `\n` con JSON roto | Reparar JSON truncado o devolver `[]`. NUNCA split por líneas | R24 |
| E4 | Maquetador LLM pierde campos JSON | LLM devuelve solo `{html_body}` sin propagar originales | R20: reemplazar Maquetador LLM por Connector código | R20 |
| E5 | LLM envuelve JSON en markdown ``` | Gemini wrappea en ```json ~40% de las veces | `cleanLlmOutput()` en executor: strip automático | R21 |
| E6 | Maquetador LLM no usa plantilla correcta | LLM "decide" qué plantilla usar, a veces mal | RefCode: mapeo determinista producto→código | R22 |
| E7 | Emails re-contestados en cada ejecución | Para EMAIL_NUEVO, reply va a hilo nuevo → threadId cruce no detecta | Tabla `canvas_processed_emails` + filtro en ITERATOR | R25 |
| E8 | Filtro de tracker no funcionaba en runtime | try/catch silencioso + error de sintaxis (} extra) | Eliminar try/catch del filter, logging explícito por item | — |
| E9 | Informe no usaba template CatBot | `resolveAssetsForEmail` no se llamaba en `send_report` | Añadir resolve assets antes de render en send_report | — |
| E10 | Informe enviado a info@ en vez de antonio@ | `getPredecessorOutput` tomaba edge de nodo skipped | Mejorar para preferir edge de source completed | — |
| E11 | Remitente mostraba "Info_Auth_Educa360" | Campo `from_name` del connector Gmail | Cambiar a "Educa360" | — |
| E12 | Asunto con caracteres raros (ÃƒÂ³) | Encoding UTF-8 en raw MIME de replyToMessage | RFC 2047 Base64 encoding del subject | — |
| E13 | CTA duplicado en email (cierre + template) | Respondedor incluía cierre, template también tenía texto CTA | Respondedor no incluye cierre, template lo tiene | — |
| E14 | Post-loop skipped cuando 0 items | `getSkippedNodes` excluía nodos con edge del chosen branch del mismo nodo | Fix: edge del chosen branch cuenta como non-skipped parent | — |
| E15 | Connector informe recibía output vacío | `getPredecessorOutput` tomaba primer edge (iterator-end skipped) | Preferir edge de source completed con output | — |

---

## 4. Decisiones arquitectónicas clave

### 4.1 El LLM piensa, el código ejecuta (R20)

El cambio más impactante de la v4: eliminar 2 nodos LLM (Maquetador + Ejecutor) y reemplazarlos por 1 Connector Gmail con lógica determinista.

**Antes (v3):** Respondedor (LLM) → Maquetador (LLM: list+get+render) → Ejecutor (LLM: send+mark)
**Después (v4):** Respondedor (LLM: rellena esquema) → Connector Gmail (CÓDIGO: render+send+mark)

Resultado: 50% menos tokens, 0 errores de template, 100% determinista.

### 4.2 RefCode — Referencias deterministas (R22)

Las plantillas se identifican por códigos alfanuméricos de 6 chars. El LLM solo copia el código del mapeo en la skill. El código busca por ref_code con lookup tolerante (ref_code → nombre → parcial → ID).

### 4.3 Triple protección anti-duplicados

| Capa | Mecanismo | Fiabilidad |
|------|-----------|------------|
| 1. Lector | Cruce threadId inbox vs sent | ~80% (falla con EMAIL_NUEVO) |
| 2. ITERATOR | Filtro por messageId en `canvas_processed_emails` | ~99% (depende de runtime) |
| 3. Connector | Check individual por messageId antes de enviar | 100% (última línea) |

### 4.4 Plantillas sin instruction blocks

Para plantillas visual-only (Pro-K12, Pro-REVI, etc.), el código renderiza el visual y luego inyecta el texto HTML del Respondedor como `<tr><td>` antes del footer. No depende del LLM para la inyección.

### 4.5 Informe siempre se envía

El ITERATOR tiene dos salidas: "element" (loop body) y "completed" (bypass). Ambas conectan al Connector Informe. Con 0 items, va por "completed" → informe con "0 procesados". Con N items, va por loop → ITERATOR_END → informe con resultados.

---

## 5. Reglas de Oro — v4.0 (23 + 2 nuevas)

### FASE 0 — Antes de tocar el canvas

| # | Regla |
|---|-------|
| R01 | Definir contrato de datos entre TODOS los nodos antes de escribir instrucciones |
| R02 | Calcular N_items × tool_calls vs MAX_TOOL_ROUNDS (12). Si >60%, ITERATOR o Dispatcher |
| R03 | Traducir problema de negocio a criterios técnicos verificables |
| R04 | Probar flujo mínimo (START → 1 nodo → Output) con datos reales. Añadir un nodo cada vez |

### FASE 1 — Diseño de nodos

| # | Regla |
|---|-------|
| R05 | Un nodo = una responsabilidad |
| R06 | Conocimiento de negocio en skills, no en instrucciones del nodo |
| R07 | CatBrain = texto→texto. Agent+CatBrain = JSON→JSON con RAG |
| R08 | No vincular conectores/skills innecesarios — cada tool confunde al LLM |
| R09 | CatPaws genéricos, especialización via extras del canvas |

### FASE 2 — Instrucciones de nodos LLM

| # | Regla |
|---|-------|
| R10 | JSON in → JSON out: primera línea = regla anti-teléfono-escacharrado |
| R11 | Instrucciones dicen QUÉ hacer, no prohíben. Si escribes "NO" 5 veces, cambia el diseño |
| R12 | Siempre especificar "PASA SIN MODIFICAR" para items que el nodo debe ignorar |
| R13 | Nombres de campos canónicos idénticos en todo el pipeline |

### FASE 3 — Ejecución y arrays

| # | Regla |
|---|-------|
| R14 | Arrays + tools = ITERATOR. Nunca arrays >1 item a nodos con tool-calling |
| R15 | Nodo LLM recibe la cantidad MÍNIMA de info necesaria |
| R16 | Max Tokens = estimación realista del output |
| R17 | Todo nodo LLM es probabilístico. Planificar contratos, fallbacks |

### FASE 4 — Plantillas

| # | Regla |
|---|-------|
| R18 | Plantilla con contenido dinámico necesita bloque instruction. Sin él, código inyecta HTML |
| R19 | Separar selección de plantilla (skill/RefCode) de maquetación (código) |

### FASE 5 — Separación LLM / Código

| # | Regla |
|---|-------|
| R20 | Si puede hacerse con código, NO delegarlo al LLM. El LLM produce esquema, código ejecuta |
| R21 | Código SIEMPRE limpia output del LLM (strip markdown, validar JSON) |
| R22 | Referencias entre entidades usan RefCodes deterministas, no nombres |
| R23 | Separar nodos de pensamiento (LLM) de nodos de ejecución (código) |

### FASE 6 — Resiliencia (nuevas v4.0)

| # | Regla |
|---|-------|
| R24 | Nunca hacer fallback destructivo. Si input está corrupto, devolver vacío — no inventar datos |
| R25 | Idempotencia obligatoria: registrar messageId procesados. Triple protección: Lector + ITERATOR + Connector |

---

## 6. Roadmap futuro

### Inmediato
- Data Contracts básicos en executor (json_required, non_empty entre nodos)
- Migrar canvas test → producción + activar cron L-V 10:00

### v26.0 — Robustez Enterprise
- Patrón Dispatcher/Worker (MultiAgent + listen_mode) para cargas pesadas
- Dead Letter Queue (DLQ) visual en UI
- Edge validation con schemas opcionales
- Nodo SPLITTER como sugar syntax sobre MultiAgent

---

## 7. Historial de versiones

| Fecha | Versión | Cambios |
|-------|---------|---------|
| 2026-04-02 | v1.0 | Documento inicial: 11 nodos, 6 puntos calientes, 9 aprendizajes |
| 2026-04-02 | v2.0 | Retrospectiva asistente, Reglas R01-R19, flujo v4 con ITERATOR |
| 2026-04-03 | v3.0 | Estabilización fase a fase, errores v4, Reglas R20-R23, RefCode |
| 2026-04-03 | v4.0 | Pipeline completo validado: 15 errores documentados, R24-R25, triple protección, RefCode, Data Contracts roadmap |

---

*Documento vivo — se actualiza con cada iteración del canvas Revisión Diaria Inbound.*
*Generado por el proceso de desarrollo colaborativo DoCatFlow — Abril 2026*
