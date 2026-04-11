---
phase: 134-architect-data-layer-arch-data
plan: 01
subsystem: architect-data-layer
tags: [canvas, connector-contracts, gmail, google-drive, mcp, arch-data, tdd, vitest]

# Dependency graph
requires:
  - phase: 133-foundation-tooling-found
    provides: "baseline holded-q1 + test-pipeline.mjs regression gate that will exercise this module once Plan 03 wires it into scanCanvasResources"
provides:
  - "CONNECTOR_CONTRACTS constant indexed by connector_type (gmail, google_drive, mcp_server, email_template, smtp, http_api, n8n_webhook)"
  - "getConnectorContracts(connectorType) helper returning typed contract or null"
  - "ConnectorContract / ConnectorAction TypeScript types"
  - "Regression guard test asserting Gmail send_report declares every actionData.X field read by canvas-executor.ts"
affects:
  - 134-03-scan-canvas-resources-enriched  # Plan 03 importa este módulo para inyectar contratos reales al architect prompt
  - 135-architect-prompt-layer              # Prompt layer usará estos contratos para eliminar hallucination de field names
  - 136-end-to-end-validation               # Gate verifica que canvas ejecutado no rompe por drift de contrato

# Tech tracking
tech-stack:
  added: []   # ningún dep nuevo — módulo puro de constantes + tipos
  patterns:
    - "Contratos declarativos en código (no strings del prompt) con source_line_ref citando canvas-executor.ts"
    - "TDD rojo→verde para establecer regression guard antes del código"
    - "Módulo type-only sin runtime imports para evitar ciclos al ser consumido desde canvas-flow-designer.ts"

key-files:
  created:
    - app/src/lib/services/canvas-connector-contracts.ts
    - app/src/lib/__tests__/canvas-connector-contracts.test.ts
  modified: []

key-decisions:
  - "Gmail action keys usan snake_case (send_report, send_reply, mark_read, forward) porque coinciden por === con el valor literal de actionData.accion_final que compara canvas-executor.ts"
  - "google_drive contracts modelan campos de node.data (no de predecessorOutput) porque el executor los lee de ahí; la distinción queda documentada en description de cada action"
  - "mcp_server declara una sola action genérica invoke_tool (required=[tool_name], optional=[tool_args]); Holded vive aquí vía tool_name='holded_*' — no se modelan contratos por tool porque el MCP server los autodescribe en runtime"
  - "smtp/http_api/n8n_webhook quedan como stubs por completeness (no usados en holded-q1) para que el helper getConnectorContracts no devuelva null en escenarios fuera del caso canónico"
  - "source_line_ref cita canvas-executor.ts:LÍNEA en cada action para forzar review manual si alguien toca esas líneas sin sincronizar el módulo"

patterns-established:
  - "Regression guard pattern: test hardcoded-list que falla si los required/optional fields declarados no incluyen los campos documentados en el <interfaces> block del PLAN"
  - "Cada ConnectorAction = required_fields + optional_fields + description + source_line_ref; este shape será reutilizado por Plans 02/03 para enriquecer scanCanvasResources"

requirements-completed:
  - ARCH-DATA-02
  - ARCH-DATA-03

# Metrics
duration: 2min
completed: 2026-04-11
---

# Phase 134 Plan 01: Connector Contracts Module Summary

**Declarative connector contracts module (Gmail/Drive/MCP) derived line-by-line from canvas-executor.ts, with TDD regression guard blocking drift between module and runtime.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-11T11:46:32Z
- **Completed:** 2026-04-11T11:49:00Z
- **Tasks:** 1 (TDD: test → feat)
- **Files created:** 2

## Accomplishments

- Fundamento ARCH-DATA-02/03 en su lugar: contratos declarativos en código indexados por `connector_type`, listos para que Plan 03 los inyecte en scanCanvasResources.
- Gmail cubierto al 100% con las 4 acciones que canvas-executor discrimina por `actionData.accion_final` (send_report, send_reply, mark_read, forward), con required/optional derivados línea-a-línea del executor.
- Google Drive y MCP Server modelados como ciudadanos de primera clase; email_template + smtp + http_api + n8n_webhook quedan como stubs para que getConnectorContracts no devuelva null en conectores fuera del caso canónico.
- Regression guard tipo "test 12" implementado: si mañana alguien renombra `actionData.report_to` a `actionData.destino_email` en canvas-executor.ts sin tocar este módulo, el test rompe.
- Cero runtime imports en el módulo nuevo → Plan 03 lo puede importar desde canvas-flow-designer.ts sin riesgo de ciclos.

## Task Commits

TDD: 2 commits (test → feat), 1 task lógica.

1. **Task 1 (RED): failing tests for connector contracts** - `1cce358` (test)
2. **Task 1 (GREEN): implement canvas-connector-contracts module** - `3f720ae` (feat)

**Plan metadata commit:** pendiente (se hace tras este SUMMARY junto con STATE/ROADMAP).

## Files Created/Modified

- `app/src/lib/services/canvas-connector-contracts.ts` — Módulo de contratos: tipos ConnectorAction/ConnectorContract, constante CONNECTOR_CONTRACTS (gmail+google_drive+mcp_server+email_template+smtp+http_api+n8n_webhook), helper getConnectorContracts().
- `app/src/lib/__tests__/canvas-connector-contracts.test.ts` — 12 tests vitest cubriendo shape Gmail, Drive ops, MCP invoke_tool, lookup semantics (null para unknown), type exports y regression guard del plan.

## Decisions Made

- **snake_case en action keys** para Gmail — coincide exacto con literales comparados por === contra `actionData.accion_final`. Evita una capa de mapeo que sería fuente de bugs.
- **google_drive modela node.data**, no predecessorOutput; la distinción va en la description de cada action para que Plan 03 lo exponga al architect prompt sin ambigüedad.
- **mcp_server: una sola action genérica invoke_tool** (no una por tool de Holded). Razón: los tools MCP son autodescribibles por el servidor en runtime; mantener un contrato por tool crearía drift.
- **Stubs para smtp/http_api/n8n_webhook** para que `getConnectorContracts()` devuelva objeto (no null) — simplifica el contrato de Plan 03 que siempre obtiene algo parseable.
- **source_line_ref obligatorio** en cada action. No es dinámico (el plan explícitamente dice "no scan dinámico"), pero sirve como comentario-anchor que obliga a re-review si alguien toca esas líneas del executor.

## Deviations from Plan

None — plan executed exactly as written. Las 12 tests pasaron en el primer intento tras RED, el tsc check quedó limpio en el archivo nuevo, y el audit `grep "accion_final" canvas-executor.ts` confirma que las 4 ramas Gmail declaradas en el módulo existen en el executor.

## Issues Encountered

None — la única sutileza fue confirmar que `npx tsc --noEmit` no reporta errores causados por el nuevo archivo (el proyecto tiene errores pre-existentes en archivos no tocados, fuera de scope por scope boundary).

## Verification Evidence

- **Automated:** `cd app && npx vitest run src/lib/__tests__/canvas-connector-contracts.test.ts` → `12 passed (12)` en 127ms.
- **Audit 1 (Gmail parity):** `grep -n "accion_final" app/src/lib/services/canvas-executor.ts` → líneas 660, 666, 677, 723 confirman las 4 ramas discriminadas (send_report/send_reply/mark_read/forward) — match 1:1 con las 4 actions declaradas.
- **Audit 2 (type-check):** `npx tsc --noEmit | grep canvas-connector-contracts` → sin errores imputables al módulo.
- **Audit 3 (zero runtime imports):** el archivo nuevo no tiene ningún `import` — solo `export` — garantizando que Plan 03 puede consumirlo sin riesgo de ciclos.

## Next Phase Readiness

- **Plan 02 (rules-index scope annotations):** independiente, puede ir en paralelo.
- **Plan 03 (scanCanvasResources enriched):** desbloqueado — ya puede importar `{ getConnectorContracts }` desde `canvas-flow-designer.ts` y usarlo para enriquecer el resource pack que ve el architect.
- **Requirements cubiertos:** ARCH-DATA-02 (contratos en código) + ARCH-DATA-03 (regression guard). Quedan 5 requirements ARCH-DATA para completar la fase.

---
*Phase: 134-architect-data-layer-arch-data*
*Plan: 01*
*Completed: 2026-04-11*

## Self-Check: PASSED

- FOUND: app/src/lib/services/canvas-connector-contracts.ts
- FOUND: app/src/lib/__tests__/canvas-connector-contracts.test.ts
- FOUND: .planning/phases/134-architect-data-layer-arch-data/134-01-SUMMARY.md
- FOUND commit 1cce358 (test RED)
- FOUND commit 3f720ae (feat GREEN)
- Test verification: 12/12 passed via `npx vitest run src/lib/__tests__/canvas-connector-contracts.test.ts`
