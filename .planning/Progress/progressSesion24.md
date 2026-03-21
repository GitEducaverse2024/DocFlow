# Sesion 24 — RAG robustez + SSE streaming + i18n pipeline fix

**Fecha:** 2026-03-21
**Milestone:** v14.0 CatBrain UX Redesign
**Estado:** COMPLETADO

---

## Resumen

Mejoras de robustez para el sistema RAG en volumenes grandes (200+ fuentes, 5000+ chunks), migracion de polling a SSE real, y fix de i18n en produccion.

---

## 1. RAG Worker mejorado (`app/scripts/rag-worker.mjs`)

**Problema:** El worker solo reportaba errores genericos sin contexto: no indicaba que fuente estaba procesando, cuantos chunks habia completado, ni si el error era de Ollama o Qdrant.

**Cambios:**
- Nueva funcion `writeError()` que escribe al statusFile: `errorType` (ollama/qdrant/unknown), `currentSource`, `chunksCompleted`, `chunksTotal`, `stackTrace`
- Cada batch de embedding ahora incluye `currentSource`, `percent`, `elapsed` en el statusFile
- El catch de Ollama (conexion, pull) usa `writeError` con tipo `ollama`
- El catch de Qdrant upsert escribe error detallado con tipo `qdrant` antes de re-throw
- El catch final en `main()` detecta tipo de error automaticamente por contenido del mensaje

---

## 2. Pre-flight validation (`app/src/app/api/catbrains/[id]/rag/create/route.ts`)

**Problema:** Si Ollama o Qdrant no estaban disponibles, el worker se lanzaba igualmente y fallaba 10-15 minutos despues con un timeout opaco.

**Solucion:** Funcion `preflight()` que valida antes de spawnar:
1. Ollama responde (`GET /api/tags`, 8s timeout)
2. Modelo de embedding existe (warning si no, el worker lo descargara)
3. Qdrant responde (`GET /collections`, 5s timeout)

Si cualquier check falla, retorna HTTP 503 con mensaje especifico — no se lanza el worker.

---

## 3. SSE streaming para RAG (`rag/create/route.ts` + `sources-pipeline.tsx`)

**Problema:** La Fase 3 (Indexar RAG) usaba polling HTTP cada 2s a `/rag/status`. Sin progreso en tiempo real, sin contexto de que fuente se estaba procesando, sin deteccion de desconexion.

**Solucion — Backend:**
- Si `stream: true` en el body, el endpoint devuelve `text/event-stream` usando `createSSEStream`
- Eventos SSE: `start` (jobId), `stage` (progreso chunk a chunk con currentSource, percent, elapsed), `done` (chunksCount, duration), `error` (mensaje + errorType + stackTrace)
- Soporte reconnect: si ya hay un job running y llega otra peticion con `stream: true`, se conecta al stream existente sin re-spawnar worker
- Safety timeout SSE: 65 min max (alineado con timeout del worker de 60 min)

**Solucion — Frontend:**
- Nuevo hook `ragStream = useSSEStream()` dedicado a RAG
- Consola oscura identica a la de Fase 2: `h-48 bg-zinc-950 font-mono text-xs`, lineas color-coded
- Progreso se muestra como: `Chunk 847/3240 · progressSesion14.md · 26% · 2m 15s`
- Barra de progreso determinada sobre la consola
- **Auto-reconnect**: hasta 3 reintentos con 2s delay, mensajes en consola
- Warning de timeout a 2 min sin progreso + boton cancelar
- `handleCancelIndex` para detener el stream

---

## 4. Fix i18n: `MISSING_MESSAGE: pipeline.steps.config (es)`

**Problema:** Error en produccion: `MISSING_MESSAGE: pipeline.steps.config (es)`. El componente `pipeline-footer.tsx` usa `t.raw(\`steps.${activeStep}\`)` para labels de navegacion dinamicos. Los steps `config`, `connectors` y `websearch` existian como IDs en la UI pero no tenian entrada en el namespace `pipeline.steps`.

**Solucion:**
- Anadidas 3 claves faltantes en `es.json` y `en.json`: `pipeline.steps.config`, `pipeline.steps.connectors`, `pipeline.steps.websearch`
- Corregidos labels `next`/`prev` de `rag` y `chat` para reflejar la navegacion real del pipeline completo (rag -> connectors -> config -> chat)

---

## 5. i18n keys para RAG console

Nuevas claves en `catbrains.sourcesFlow.index` (es + en):
- `startLog`, `validating`, `timeoutWarning`, `cancelAndReturn`, `cancelled`
- `reconnecting`, `reconnectFailed`
- `errorSource`, `errorChunks`, `errorType`

---

## Archivos modificados (cambios de esta sesion)

| Archivo | Cambio |
|---------|--------|
| `app/scripts/rag-worker.mjs` | writeError(), currentSource en progreso, error detallado |
| `app/src/app/api/catbrains/[id]/rag/create/route.ts` | Preflight + SSE stream + reconnect |
| `app/src/components/catbrains/sources-pipeline.tsx` | ragStream hook, consola Fase 3, reconnect, cancelar |
| `app/messages/es.json` | pipeline.steps.{config,connectors,websearch} + RAG console keys |
| `app/messages/en.json` | pipeline.steps.{config,connectors,websearch} + RAG console keys |

---

## Notas tecnicas

- La arquitectura de worker separado (`child_process.spawn` + `unref()`) se mantiene intacta — solo se mejora la comunicacion via statusFile
- El SSE stream del endpoint lee el statusFile cada 1s y lo re-emite como eventos SSE — el worker no necesita saber que hay SSE
- El reconnect funciona porque el endpoint detecta `ragJobs.get()` con status running y salta el spawn
- El `pollRef` (polling HTTP anterior) se elimino del componente — ya no es necesario
