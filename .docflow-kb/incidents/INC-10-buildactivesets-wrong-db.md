---
id: incident-inc-10
type: incident
lang: es
title: "INC-10 — buildActiveSets consultaba la BD equivocada — validator rechazaba todos los UUIDs reales"
summary: "buildActiveSets consultaba la BD equivocada — validator rechazaba todos los UUIDs reales"
tags: [canvas, canvas, ops, testing]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/incidents-log.md §INC-10" }
ttl: never
---

# INC-10 — buildActiveSets consultaba la BD equivocada — validator rechazaba todos los UUIDs reales

**Fecha:** 2026-04-11
**Severidad:** CRITICA — bloqueaba TODA generación de canvas post-Phase 135 en runtime

## Síntoma

Tras desplegar Phase 135 (deterministic pre-LLM validator), todos los pipelines terminaban en validator-reject en iteración 0. El validator marcaba cada `agentId` y `connectorId` del canvas generado por el architect como "unknown or inactive", aunque `scanCanvasResources` acababa de leerlos de la BD y pasárselos al architect como UUIDs válidos. 147/147 tests unitarios verdes. Producción completamente rota.

## Causa raíz

`buildActiveSets()` en `intent-job-executor.ts` (Phase 135 Plan 03) se cableó a `catbotDb`:

```ts
const paws = catbotDb.prepare('SELECT id FROM cat_paws WHERE is_active = 1').all();
const conns = catbotDb.prepare('SELECT id FROM connectors WHERE is_active = 1').all();
```

Pero las tablas `cat_paws` y `connectors` viven en **`docflow.db`** (accesible via `@/lib/db`), no en `catbot.db`. `catbot.db` solo contiene `intents`, `intent_jobs`, `conversation_log`, `knowledge_*`, `user_*`, `complexity_decisions`, `summaries`. La query lanzaba `SqliteError: no such table: cat_paws`, caía al `catch`, retornaba `{activeCatPaws: new Set(), activeConnectors: new Set()}`, y el validator rechazaba cualquier UUID real que le llegase.

Todos los otros readers de esas tablas (`task-executor.ts`, `execute-catpaw.ts`, `bundle-generator.ts`, `catbot-tools.ts`, `catbot-prompt-assembler.ts`, `canvas-flow-designer.ts`'s `scanCanvasResources`, etc.) usaban `db from '@/lib/db'` correctamente. El Plan 03 era el outlier.

**Por qué los tests no lo detectaron:** Toda la suite de tests ARCH-PROMPT-13 reemplazaba `buildActiveSets` con un spy (`vi.spyOn(...).mockReturnValue(...)`) — el query real contra el handle de BD nunca se ejercitaba.

## Solución

1. `intent-job-executor.ts:898-904`: `catbotDb` → `db` en ambas queries de `buildActiveSets`.
2. Actualizado el JSDoc de la función (decía "build active id sets from catbotDb" → "from docflow.db").
3. **Test de regresión nuevo** en `intent-job-executor.test.ts` → `describe('buildActiveSets DB handle (gap closure)')`. Restaura el spy por defecto con `vi.restoreAllMocks()`, configura `dbPrepareMock` con `mockImplementation` para retornar filas específicas cuando el SQL contiene `FROM cat_paws` o `FROM connectors`, invoca el `buildActiveSets` REAL y verifica que los Sets contienen esos IDs.

**Archivos modificados:**
- `app/src/lib/services/intent-job-executor.ts` (2 líneas + comentario).
- `app/src/lib/__tests__/intent-job-executor.test.ts` (nuevo describe, +70 líneas).

**Commit:** `b66cc61 fix(135-03): buildActiveSets reads @/lib/db (docflow.db), not catbotDb`.

**Verificación post-fix:** Pipeline `holded-q1` re-ejecutado contra LiteLLM real → alcanzó `awaiting_approval` en 120s con `recommendation:accept`, `quality_score:95`, `data_contract_score:100`, 0 issues. Los success criteria #2 y #3 del ROADMAP de Phase 135 quedaron confirmados en runtime.

**Estado:** RESUELTO — requirió docker rebuild (`dfdeploy`).

## Regla para el futuro

**Cualquier función que consulte la BD debe tener al menos un test de integración que invoque la función REAL contra un handle real** (in-memory o mock configurado), no solo tests con la función mockeada. Los tests spy-only validan el contrato de la función pero ocultan bugs de wiring (handle equivocado, tabla equivocada, tipo de parámetro equivocado, falta de join). Patrón clásico: "tests unitarios verdes + producción rota".

**Cómo aplicar:** cuando un agente ejecute un plan que toca la BD, al menos un test debe:
1. NO mockear `@/lib/db` (o restaurar el mock con `vi.restoreAllMocks()` al inicio del test).
2. Configurar `dbPrepareMock` o semillar una BD in-memory con las tablas reales.
3. Invocar la función sin spies encima.
4. Asertar sobre el resultado real, no sobre la señal del spy.

Si el plan no puede hacer esto (p.ej. por aislamiento de módulos), documentarlo como riesgo en el SUMMARY y marcar el criterio correspondiente como `human_needed` para verificación runtime obligatoria.
