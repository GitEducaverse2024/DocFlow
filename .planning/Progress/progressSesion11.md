# DoCatFlow - Sesion 11: Resilience Foundations (Phase 27)

> Funcionalidades implementadas sobre la base documentada en `progressSesion10.md`. Esta sesion ejecuta la Phase 27 del milestone v6.0: utilidades de retry, cache y logger, aplicacion de withRetry a servicios externos, TTL caching en rutas GET, error boundaries en 8 secciones, limpieza de tareas en arranque, y latencia DB en health.

---

## Indice

1. [Resumen de cambios](#1-resumen-de-cambios)
2. [Plan 27-01: Utilidades Core (retry, cache, logger)](#2-plan-27-01-utilidades-core-retry-cache-logger)
3. [Plan 27-02: withRetry en Servicios + TTL Cache en APIs](#3-plan-27-02-withretry-en-servicios--ttl-cache-en-apis)
4. [Plan 27-03: Error Boundaries x8 + CatBot](#4-plan-27-03-error-boundaries-x8--catbot)
5. [Commits de la fase](#5-commits-de-la-fase)
6. [Archivos nuevos y modificados](#6-archivos-nuevos-y-modificados)
7. [Patrones establecidos](#7-patrones-establecidos)
8. [Decisiones tecnicas](#8-decisiones-tecnicas)

---

## 1. Resumen de cambios

### Phase 27: Resilience Foundations — 3 planes, 8 requisitos (RESIL-01..08)

| Plan | Que se construyo | Requisitos | Wave |
|------|-----------------|------------|------|
| 27-01 | retry.ts, cache.ts, logger.ts + limpieza DB arranque + health latencia | RESIL-01, RESIL-04, RESIL-07, RESIL-08 | 1 |
| 27-02 | withRetry en 11 llamadas externas + TTL cache en 11 rutas GET | RESIL-02, RESIL-03 | 2 |
| 27-03 | error.tsx en 8 secciones con integracion CatBot localStorage | RESIL-05, RESIL-06 | 2 |
| **Total** | | **8/8 RESIL requirements** | |

### Transformacion principal

La aplicacion pasa de no tener ningun mecanismo de resiliencia a contar con: reintentos automaticos con backoff exponencial en todas las llamadas a servicios externos (Qdrant, Ollama, LiteLLM, OpenClaw), cache en memoria con TTL para evitar saturar la DB en endpoints frecuentes, logging estructurado JSONL con rotacion a 7 dias, limpieza automatica de tareas huerfanas al arrancar, y error boundaries en cada seccion de la UI que notifican a CatBot automaticamente.

---

## 2. Plan 27-01: Utilidades Core (retry, cache, logger)

### retry.ts (`app/src/lib/retry.ts`, ~65 lineas)

Utilidad generica `withRetry<T>` con backoff exponencial y jitter.

| Parametro | Default | Descripcion |
|-----------|---------|-------------|
| `maxAttempts` | 3 | Numero maximo de intentos |
| `baseDelayMs` | 500ms | Delay base del backoff |
| `maxDelayMs` | 10000ms | Cap maximo del delay |
| `shouldRetry` | Errores transitorios | Funcion que decide si reintentar |

**Errores transitorios reconocidos:** ECONNREFUSED, timeout, aborted, 502, 503, 504, AbortError.

**Formula del delay:** `min(baseDelayMs * 2^(attempt-1), maxDelayMs) * jitter(0.75..1.25)`

Cada reintento se registra via `logger.warn` con attempt, maxAttempts, y mensaje de error.

### cache.ts (`app/src/lib/cache.ts`, ~35 lineas)

Cache en memoria basado en `Map<string, { data, expiresAt }>`.

| Funcion | Proposito |
|---------|-----------|
| `cacheGet<T>(key)` | Devuelve dato si TTL valido, borra y retorna null si expirado |
| `cacheSet<T>(key, data, ttlMs)` | Almacena con timestamp de expiracion |
| `cacheInvalidate(key)` | Borra una clave especifica |
| `cacheInvalidatePrefix(prefix)` | Borra todas las claves que empiezan con el prefijo |

**Regla critica:** Solo cachear respuestas exitosas. Los errores NUNCA se cachean.

### logger.ts (`app/src/lib/logger.ts`, ~63 lineas)

Logger JSONL asincrono que escribe a `/app/data/logs/app-YYYY-MM-DD.jsonl`.

| Caracteristica | Detalle |
|----------------|---------|
| Formato | JSONL: `{ ts, level, message, ...data }` |
| Escritura | `fs.appendFile` asincrono (fire-and-forget, no bloquea event loop) |
| Directorio | `process['env']['LOG_DIR']` o `/app/data/logs` |
| Rotacion | Al cargar el modulo, borra archivos >7 dias por fecha en nombre |
| Niveles | `logger.info()`, `logger.warn()`, `logger.error()` |

### Cambios en db.ts — Limpieza de tareas huerfanas

Al arrancar la aplicacion, inmediatamente despues de la limpieza de canvas_runs:

```sql
UPDATE tasks SET status = 'failed' WHERE status = 'running';
UPDATE task_steps SET status = 'failed' WHERE status = 'running';
```

Las tareas en estado `paused` se dejan intactas intencionalmente.

### Cambios en health/route.ts — Latencia DB

Envuelve el `SELECT 1` existente con `Date.now()` y reporta `latency_ms` en la seccion `docflow` de la respuesta JSON, junto a `status`, `db`, `projects_count`, `sources_count`.

---

## 3. Plan 27-02: withRetry en Servicios + TTL Cache en APIs

### Task 1: withRetry aplicado a servicios externos

11 llamadas idempotentes envueltas con `withRetry`:

| Servicio | Funciones envueltas | Archivo |
|----------|-------------------|---------|
| Qdrant | `healthCheck`, `createCollection`, `deleteCollection`, `getCollectionInfo`, `upsertPoints`, `search` (6) | `app/src/lib/services/qdrant.ts` |
| Ollama | `healthCheck`, `getEmbedding` (2) | `app/src/lib/services/ollama.ts` |
| LiteLLM | `healthCheck`, `getEmbeddings` (2) | `app/src/lib/services/litellm.ts` |
| OpenClaw | fetch `api/v1/agents` + `rpc/agents.list` en agents GET, `tryReloadGateway` en agents/create POST (3) | `app/src/app/api/agents/route.ts`, `agents/create/route.ts` |

**Deliberadamente excluidos:** llamadas de generacion LLM (chatCompletion, catbot, process routes) — no son idempotentes y romperian streaming.

### Task 2: TTL cache en 11 rutas GET

| Ruta | TTL | Clave cache |
|------|-----|-------------|
| `/api/agents` GET | 30s | `agents` |
| `/api/dashboard/summary` | 60s | `dashboard:summary` |
| `/api/dashboard/activity` | 60s | `dashboard:activity:{limit}` |
| `/api/dashboard/usage` | 60s | `dashboard:usage:{days}` |
| `/api/dashboard/top-agents` | 60s | `dashboard:top-agents:{limit}` |
| `/api/dashboard/top-models` | 60s | `dashboard:top-models:{limit}` |
| `/api/dashboard/storage` | 60s | `dashboard:storage` |
| `/api/health` | 30s | `health` |
| `/api/settings/api-keys` | 5min | `settings:api-keys` |
| `/api/settings/models` | 5min | `settings:models` |
| `/api/settings/processing` | 5min | `settings:processing` |

**Invalidacion:** Las mutaciones (POST/PATCH/DELETE) ejecutan `cacheInvalidate` antes de retornar exito:
- `agents/create` POST → invalida `agents`
- `settings/api-keys/[provider]` PATCH/DELETE → invalida `settings:api-keys`
- `settings/processing` PATCH → invalida `settings:processing`

---

## 4. Plan 27-03: Error Boundaries x8 + CatBot

### Patron error.tsx (Next.js App Router)

Se creo un archivo `error.tsx` en cada una de las 8 secciones de la aplicacion. Todas siguen el mismo patron:

```tsx
'use client';

const SECTION_NAME = 'NombreSeccion';

export default function Error({ error, reset }) {
  useEffect(() => {
    // Push a CatBot localStorage
    const existing = JSON.parse(localStorage.getItem('docatflow_catbot_messages') || '[]');
    existing.push({
      role: 'assistant',
      content: `He detectado un error en la seccion ${SECTION_NAME}: "${error.message}"...`,
      timestamp: Date.now(),
    });
    localStorage.setItem('docatflow_catbot_messages', JSON.stringify(existing.slice(-50)));
  }, [error]);

  return (
    // Card roja con AlertTriangle + "Algo ha ido mal"
    // Boton "Reintentar" (reset()) + "Ir al inicio" (navigate /)
    // Texto "CatBot ha sido notificado de este error."
  );
}
```

### Secciones cubiertas

| Seccion | Archivo | SECTION_NAME |
|---------|---------|--------------|
| Proyectos | `app/src/app/projects/error.tsx` | `Proyectos` |
| Tareas | `app/src/app/tasks/error.tsx` | `Tareas` |
| Agentes | `app/src/app/agents/error.tsx` | `Agentes` |
| Canvas | `app/src/app/canvas/error.tsx` | `Canvas` |
| Workers | `app/src/app/workers/error.tsx` | `Workers` |
| Skills | `app/src/app/skills/error.tsx` | `Skills` |
| Conectores | `app/src/app/connectors/error.tsx` | `Conectores` |
| Configuracion | `app/src/app/settings/error.tsx` | `Configuración` |

### Comportamiento

- **Aislamiento:** El error.tsx captura errores solo de su segmento — el sidebar y layout siguen funcionales
- **Notificacion CatBot:** Via localStorage push (zero coupling con catbot-panel.tsx), funciona incluso si el servidor esta caido
- **Acciones:** "Reintentar" llama `reset()` (re-renderiza el segmento), "Ir al inicio" navega a `/`
- **Limite:** Maximo 50 mensajes en localStorage (slice -50)

---

## 5. Commits de la fase

| Commit | Tipo | Descripcion |
|--------|------|-------------|
| `b5c2b6c` | feat | Crear modulos retry.ts, cache.ts, logger.ts |
| `3c618db` | feat | Limpieza tareas arranque + health DB latencia |
| `86802dd` | docs | SUMMARY + STATE + ROADMAP plan 27-01 |
| `655b331` | feat | Error boundaries 8 secciones + CatBot |
| `e39b67c` | docs | SUMMARY plan 27-03 |
| `0446b57` | feat | withRetry en servicios (Qdrant, Ollama, LiteLLM, OpenClaw) |
| `d01953b` | feat | TTL caching en 11 rutas GET |
| `061748f` | docs | SUMMARY + STATE + ROADMAP plan 27-02 |

---

## 6. Archivos nuevos y modificados

### Archivos nuevos (11)

| Archivo | Proposito |
|---------|-----------|
| `app/src/lib/retry.ts` | Utilidad withRetry con backoff exponencial |
| `app/src/lib/cache.ts` | Cache TTL en memoria |
| `app/src/lib/logger.ts` | Logger JSONL asincrono |
| `app/src/app/projects/error.tsx` | Error boundary Proyectos |
| `app/src/app/tasks/error.tsx` | Error boundary Tareas |
| `app/src/app/agents/error.tsx` | Error boundary Agentes |
| `app/src/app/canvas/error.tsx` | Error boundary Canvas |
| `app/src/app/workers/error.tsx` | Error boundary Workers |
| `app/src/app/skills/error.tsx` | Error boundary Skills |
| `app/src/app/connectors/error.tsx` | Error boundary Conectores |
| `app/src/app/settings/error.tsx` | Error boundary Configuracion |

### Archivos modificados (16)

| Archivo | Cambio |
|---------|--------|
| `app/src/lib/db.ts` | Import logger + limpieza tareas huerfanas al arrancar |
| `app/src/app/api/health/route.ts` | Latencia DB + TTL cache 30s |
| `app/src/lib/services/qdrant.ts` | 6 funciones envueltas con withRetry |
| `app/src/lib/services/ollama.ts` | healthCheck + getEmbedding con withRetry |
| `app/src/lib/services/litellm.ts` | healthCheck + getEmbeddings con withRetry |
| `app/src/app/api/agents/route.ts` | withRetry en fetches OpenClaw + cache 30s |
| `app/src/app/api/agents/create/route.ts` | withRetry en tryReloadGateway + invalidar cache |
| `app/src/app/api/dashboard/summary/route.ts` | Cache TTL 60s |
| `app/src/app/api/dashboard/activity/route.ts` | Cache TTL 60s (clave parametrizada) |
| `app/src/app/api/dashboard/usage/route.ts` | Cache TTL 60s (clave parametrizada) |
| `app/src/app/api/dashboard/top-agents/route.ts` | Cache TTL 60s (clave parametrizada) |
| `app/src/app/api/dashboard/top-models/route.ts` | Cache TTL 60s (clave parametrizada) |
| `app/src/app/api/dashboard/storage/route.ts` | Cache TTL 60s |
| `app/src/app/api/settings/api-keys/route.ts` | Cache TTL 5min |
| `app/src/app/api/settings/models/route.ts` | Cache TTL 5min |
| `app/src/app/api/settings/processing/route.ts` | Cache TTL 5min + invalidacion en PATCH |

---

## 7. Patrones establecidos

### withRetry en healthCheck

```typescript
export async function healthCheck(): Promise<boolean> {
  try {
    return await withRetry(async () => {
      const res = await fetch(`${QDRANT_URL}/healthz`);
      return res.ok;
    });
  } catch {
    return false;
  }
}
```
Pattern: retry transient failures, outer try/catch devuelve false si agotados.

### TTL Cache en GET handlers

```typescript
export async function GET() {
  const cached = cacheGet<ResponseType>('clave');
  if (cached) return NextResponse.json(cached);

  // ... logica normal ...

  cacheSet('clave', resultado, 60_000); // Solo en exito
  return NextResponse.json(resultado);
}
```

### Invalidacion en mutaciones

```typescript
export async function POST(request: Request) {
  // ... crear recurso ...
  cacheInvalidate('clave-relacionada');
  return NextResponse.json(resultado, { status: 201 });
}
```

### Claves parametrizadas para rutas con query params

```typescript
const cacheKey = `dashboard:activity:${limit}`;
```
Evita devolver datos stale cuando varian los parametros.

---

## 8. Decisiones tecnicas

| Decision | Razon |
|----------|-------|
| `fs.appendFile` asincrono (no sync) | No bloquear el event loop del servidor en cada log |
| Fire-and-forget en escritura de logs | Evitar loops infinitos si el sistema de archivos falla |
| `Array.from(store.keys())` en cache | Compatibilidad con distintos ES targets sin `downlevelIteration` |
| No retry en generacion LLM | No idempotente, romperia streaming, duplicaria tokens |
| Jitter ±25% en retry | Desincronizar reintentos concurrentes contra el mismo servicio |
| TTL 30s para endpoints volatiles | Agents y health cambian frecuentemente |
| TTL 5min para settings | Configuracion cambia raramente |
| error.tsx (no class ErrorBoundary) | Patron nativo Next.js App Router, aislamiento por segmento |
| CatBot via localStorage (no API) | Funciona offline, zero coupling con componente CatBot |
| Limpieza DB solo `running` → `failed` | `paused` es estado intencional del usuario, no huerfano |

---

*Fase completada: 2026-03-13*
*Milestone: v6.0 — Testing Inteligente + Performance + Estabilizacion*
*Siguiente: Phase 28 — Playwright Foundation*
