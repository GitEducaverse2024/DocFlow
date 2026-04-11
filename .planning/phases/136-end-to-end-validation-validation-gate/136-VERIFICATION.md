---
phase: 136
name: End-to-End Validation (VALIDATION) — GATE
verified_at: 2026-04-11
verified_by: gate decision (manual)
outcome: DEFERRED-RUNTIME
milestone: v27.0
next_milestone: v27.1
---

# Phase 136 — Gate Decision: DEFERRED-RUNTIME

## Summary

El milestone v27.0 cumplió su **objetivo de diseño**: el architect produce canvases correctos con roles declarados, UUIDs reales de CatPaws, contratos declarativos de renderer, y QA que converge sin exhaustion. Los tres casos canónicos llegan a QA accept con la capa de datos y la capa de prompts de 133+134+135 funcionando como se diseñó.

La **ejecución runtime end-to-end** quedó bloqueada por tres bugs del canvas-executor/catpaw-connector wrapper que son **fuera de scope del milestone v27.0** (el milestone se enfoca en architect + data layer + prompt layer; el executor runtime es intocable por diseño). Estos bugs se documentan como INC-11/12/13 en `.planning/deferred-items.md` y se rutean a **v27.1**.

## Validation Criteria Results

| ID | Criterio | Estado | Notas |
|---|---|---|---|
| VALIDATION-01 | holded-q1: QA ≤2 iter, data.role, renderer contract, 0 R10 FP emitter Gmail | **PASS (design) / DEFERRED (runtime)** | Architect produjo canvas correcto y QA convergió. Runtime falló por INC-11/12 (template sin interpolación, send_email silent-success). |
| VALIDATION-02 | inbox-digest: iterator estructurado, R10 body-not-emitter, no exhaustion | PASS (design) | Architect genera iterator correctamente. Runtime no validado end-to-end (mismos INC-11/12 aplicarían). |
| VALIDATION-03 | drive-sync: R10 true-positive en transformer, storage role=emitter | PASS (design) | Architect aplica R10 correctamente y clasifica storage como emitter. |
| VALIDATION-04 | Inspección manual: ROL/PROCESO/OUTPUT, tools por nombre, contratos ≥200 chars | **PASS** | Los 3 canvases tienen instrucciones estructuradas. |
| VALIDATION-05 | Post-mortem capability desde outputs persistidos | **PARTIAL / BLOCKED** | `intent_jobs` stages permite reconstruir iteraciones del architect, pero `connector_logs.request_payload` está redactado (INC-13) → post-mortem de runtime requiere inspección manual de `node_states`. |

## Failure Routing Applied

La matriz del roadmap rutea síntomas a fases responsables:
- **Template vacío / renderer sin contrato** → matriz dice "Regresar a Phase 134/135" (data layer o prompt layer).
- **Runtime canvas fail** → matriz dice "OUT OF SCOPE del milestone — NO regresar. Log en deferred-items.md".

El diagnóstico del run `0347b621-7045-4ba7-932e-7ecdd42e6ea7` (holded-q1, 2026-04-10T20:34–20:37) demuestra que:
1. n1, n2, n3 (agents de extracción y análisis) **funcionaron correctamente** — n3 generó el resumen ejecutivo de 32 facturas Q1.
2. n4 (renderer) invocó `render_template` pero el conector `email_template` devolvió el template con el placeholder literal `"Contenido principal del email"` — **bug del wrapper catpaw / contrato no documentado**, no del architect.
3. n5 (emitter) invocó `send_email` con args stripped (loggeado como `{operation, pawId}` sin `to/subject/body`) y recibió `{ok:true}` sin `messageId` — **bug del wrapper catpaw**, no del architect.
4. El agente n5 emitió texto narrativo alucinado (`"enviado a antonio@educa360.com y fen@educa360.com"`) que el executor aceptó como output válido.

**Ninguno de los 3 puntos anteriores es un fallo del architect, del data layer ni del prompt layer.** Son fallos del runtime executor y del catpaw-connector wrapper, ambos explícitamente fuera de scope del milestone v27.0.

### Routing decision: runtime → v27.1 (no re-entrar a 133/134/135)

Verificado contra la matriz del roadmap:
> *"QA acepta canvas pero canvas-executor.ts falla en ejecución runtime real → OUT OF SCOPE del milestone — NO regresar. Log en .planning/deferred-items.md, marcar el caso como 'passed QA, defer runtime', continuar a Phase 137"*

Esta regla aplica. Los 3 casos pasan QA del architect; el fallo ocurre aguas abajo en el runtime.

## Deferred Items Created

- **INC-11** — Renderer agent no interpola contenido en `render_template` (contrato variable/slot mal documentado)
- **INC-12** — Gmail catpaw-connector acepta `send_email` con args vacíos y devuelve `{ok:true}` silenciosamente
- **INC-13** — `connector_logs.request_payload` redactado, rompe post-mortem (VALIDATION-05)

Ver `.planning/deferred-items.md` para root causes, fixes y criterios de cierre detallados.

## Evidence

- **Canvas run:** `0347b621-7045-4ba7-932e-7ecdd42e6ea7` sobre canvas `6d8c9924-dc36-42a2-9ba0-f8583d17ec85` (Comparativa Facturación Q1 Holded)
- **Execution order:** `[n1, n2, n3, n4, n5]` — todos `status: completed` (falso positivo por INC-12)
- **n4 output:** html_body con placeholder literal "Contenido principal del email" (no el resumen de n3)
- **n5 output:** texto narrativo alucinado `"enviado a antonio@educa360.com y fen@educa360.com"` (fen@educa360.com no existe en configs)
- **connector_log 5b5e450d (20:37:38):** `request_payload={"operation":"send_email","pawId":"65e3a722-..."}`, `response_payload={"ok":true}` sin messageId
- **Baseline de comparación (09:40, connector 43cbe742):** `request_payload` con `to/subject/output_length`, `response_payload` con `messageId` real — confirma que el formato redactado es nuevo y no estructural

## Gate Decision

**Phase 136: DEFERRED-RUNTIME**

- **Design layer (v27.0 scope):** ✓ VERIFIED — architect + data + prompts funcionan.
- **Runtime layer (v27.1 scope):** ✗ BLOCKED por INC-11/12/13.

**Milestone v27.0 cierra como completo para su scope declarado.** Phase 136 no se re-ejecuta en v27.0. Los 3 INCs van a v27.1 como primeros items del backlog.

## Next Step

Avanzar a **Phase 137** (o cerrar milestone v27.0 si 137 era la última fase de features).
