# RFC — ITER-01: Edit puntual de canvas-executor.ts para aislar parseIteratorItems

**Fecha:** 2026-04-22
**Milestone:** CatDev v30.2 (Robustez pipeline Inbound)
**Fase:** P1 ITER-01
**Regla impactada:** R26 — canvas-executor.ts NUNCA se modifica

## Contexto

El run `609828fa-80e6-4d1e-873d-dba3560bb762` (canvas `test-inbound-ff06b82c`, 2026-04-22 21:05 UTC) sufrió un fallo silencioso severo: el nodo `lector` emitió un string JSON de 20.369 chars con comillas/saltos mal escapados en emails de `moodle` y `securityalerts`. La función `parseIteratorItems` dentro del executor (`canvas-executor.ts` L1881-1930) capturó `JSON.parse` error, intentó una reparación ingenua buscando el último `}` y cerrando el array con `]`, falló y devolvió `[]`. Cascada: 8 nodos `skipped`, 0 respuestas a leads, 0 informe. El skill Auditor de v30.1 reportó `degraded=false` porque los contadores tradicionales estaban a cero — la ironía positiva es que validó el fix pero reveló la brecha.

## Scope del cambio a canvas-executor.ts

**Diff mínimo absoluto:**

1. Añadir 1 import al top:
   ```ts
   import { parseIteratorItems } from './canvas-iterator-parser';
   ```

2. Eliminar el cuerpo de la función local (L1881-1930, ~50 líneas) y el comentario "--- Helper: Parse iterator input into items array ---" asociado.

**Cero cambios** en la llamada L1809 (`parseIteratorItems(predecessorOutput, ...)`). La firma pública se mantiene idéntica: `(input: string, separator: string) => string[]`. Toda la lógica nueva (`jsonrepair`, logging diferenciado, regex fallback) vive en el módulo aislado `canvas-iterator-parser.ts`, que es un servicio adyacente (patrón R26 preferido).

## Por qué no es evitable

La llamada `parseIteratorItems(...)` se invoca en L1809 desde el dispatcher `case 'iterator'`. Las alternativas consideradas y descartadas:

1. **Interceptar en el caller upstream (el nodo lector):** no funciona porque el lector emite su output por un path genérico (todos los `catpaw` nodes retornan `{ output: string }`) y no hay hook específico para post-procesar.
2. **Nueva clase de nodo "iterator_v2":** cambio invasivo, requiere migrar el canvas `test-inbound-ff06b82c` a nuevo tipo, rompe compatibilidad con otros canvases que usan `iterator` y son sanos.
3. **Parchear en runtime via dynamic patch:** anti-patrón, oculta el cambio real.
4. **Dejar la función interna y solo añadir `jsonrepair` inline:** mancha aún más el executor. Mover la función fuera reduce carga cognitiva del dispatcher y facilita tests unitarios.

La solución elegida (import + delete 50 líneas) cumple el espíritu de R26 ("Nueva lógica de ejecución vive en servicios adyacentes") con el coste mínimo técnicamente posible.

## Invariantes preservados

- **Firma de `parseIteratorItems`**: `(input: string, separator: string) => string[]`. Idéntica pre/post cambio. L1809 no se toca.
- **Comportamiento observable pre-bug**: arrays bien formados, separadores custom, newline split, single item — todos comportamientos intactos (tests lo validarán en P4).
- **Comportamiento post-bug**: arrays malformados que antes silenciosamente devolvían `[]` ahora intentan `jsonrepair` antes de rendirse. Si rinde: log `warn` explícito. Si falla: log `error` (antes también era `error`, se mantiene).

## Riesgo

- **Bajo.** La función no tiene side effects más allá del logger. Los call sites son uno (L1809). Los tests de regresión (P4) consumen fixtures reales + sintéticos. Docker rebuild obligatorio tras el cambio (R29 extendido por coherencia operativa).

## Aprobación

Este RFC es la justificación escrita requerida por R26 para editar `canvas-executor.ts`. El cambio se ejecuta en el giro actual del `/catdev:go P1` bajo el protocolo CatDev v30.2. No se requiere firma externa; la ejecución está cubierta por el contrato del milestone.

## Plan de rollback

Si P4 (TEST-01) o verificación oracle revelan regresión:
1. `git revert` del commit que importe el parser + delete de la función local.
2. Restaurar la función `parseIteratorItems` inline (disponible en git history).
3. El módulo `canvas-iterator-parser.ts` queda huérfano (no rompe nada; puede borrarse).

Docker rebuild post-revert, verificación manual con un canvas con iterator sano.
