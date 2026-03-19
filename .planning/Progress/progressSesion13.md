# DoCatFlow - Sesion 13: Testing Dashboard + Log Viewer (Phase 37) — v7.0 Completo

> Funcionalidades implementadas sobre la base documentada en `progressSesion12.md`. Esta sesion ejecuta la Phase 37 del milestone v7.0: pagina /testing con dashboard de tests, ejecucion de Playwright desde la UI, historial de runs, detalle de tests fallidos, generacion de tests con IA, y visor de logs JSONL con filtros. Con esta fase se completa el milestone v7.0.

---

## Indice

1. [Resumen de cambios](#1-resumen-de-cambios)
2. [Plan 37-01: API Endpoints + Page Shell](#2-plan-37-01-api-endpoints--page-shell)
3. [Plan 37-02: Resultados Tab](#3-plan-37-02-resultados-tab)
4. [Plan 37-03: Historial Tab + AI Generator](#4-plan-37-03-historial-tab--ai-generator)
5. [Plan 37-04: Logs Tab](#5-plan-37-04-logs-tab)
6. [Flujo completo de Testing Dashboard](#6-flujo-completo-de-testing-dashboard)
7. [Commits de la fase](#7-commits-de-la-fase)
8. [Archivos nuevos y modificados](#8-archivos-nuevos-y-modificados)
9. [Patrones establecidos](#9-patrones-establecidos)
10. [Decisiones tecnicas](#10-decisiones-tecnicas)
11. [Resumen completo milestone v7.0](#11-resumen-completo-milestone-v70)

---

## 1. Resumen de cambios

### Phase 37: Testing Dashboard + Log Viewer — 4 planes, 13 requisitos (TEST-01..09, LOG-04..07)

| Plan | Que se construyo | Requisitos | Wave |
|------|-----------------|------------|------|
| 37-01 | 6 API routes (run, status, results, generate, logs, logs/download), testing-state.ts, sidebar entry, page shell con 3 tabs, SQLite reporter update | TEST-01, TEST-09, LOG-06, LOG-07 | 1 |
| 37-02 | useTestRunner hook con polling 2s, test-summary-bar.tsx (4 stats + coverage bar), test-section-list.tsx (expandable sections + run buttons) | TEST-02, TEST-03, TEST-04, TEST-05 | 2 |
| 37-03 | test-run-history.tsx (ultimos 10 runs), test-result-detail.tsx (error + screenshot + code), test-ai-generator.tsx (dialog LLM) | TEST-06, TEST-07, TEST-08 | 3 |
| 37-04 | use-log-viewer.ts (polling 3s, debounce search), log-filters.tsx, log-viewer.tsx (auto-scroll, metadata expand, download) | LOG-04, LOG-05 | 4 |
| **Total** | | **13/13 requirements** | |

### Transformacion principal

El proyecto obtiene una pagina completa de testing y observabilidad accesible desde el sidebar: los usuarios pueden ejecutar Playwright desde el navegador, ver resultados en tiempo real con polling, inspeccionar tests fallidos con errores y screenshots, revisar historial de runs, generar nuevos tests con IA, y navegar los logs JSONL de la aplicacion con filtros interactivos — todo sin necesidad de SSH o terminal.

---

## 2. Plan 37-01: API Endpoints + Page Shell

### testing-state.ts (`app/src/lib/testing-state.ts`)

Modulo compartido para tracking en memoria del run activo:

```typescript
interface RunState {
  runId: string;
  status: 'running' | 'completed' | 'failed';
  section?: string;
  startedAt: number;
}

let currentRun: RunState | null = null;
export function getCurrentRun(): RunState | null;
export function setCurrentRun(run: RunState | null): void;
```

Patron: estado module-level (no Redis, single-user app), compartido entre `run/route.ts` y `status/route.ts`.

### API Routes de Testing (4)

| Ruta | Metodo | Que hace |
|------|--------|---------|
| `/api/testing/run` | POST | Rechaza si ya hay run activo (409). Crea `test_runs` en DB. Spawn `npx playwright test` via `child_process.spawn`. Parsea salida para actualizar DB al completar. Devuelve `{ runId, status: 'running' }` |
| `/api/testing/status` | GET | Lee `currentRun` de testing-state. Si activo: devuelve status + elapsed. Si no: busca ultimo run en DB |
| `/api/testing/results` | GET | `SELECT * FROM test_runs ORDER BY created_at DESC LIMIT ?`. Parametro `limit` (default 10). Devuelve array de runs con `results_json` parseado |
| `/api/testing/generate` | POST | Recibe `{ section }`. Usa `chatCompletion` de `llm.ts` con prompt template para generar spec Playwright. Devuelve `{ code, section }` |

**Spawn pattern en run/route.ts:**

```typescript
const args = section
  ? ['playwright', 'test', `e2e/specs/${section}.spec.ts`]
  : ['playwright', 'test'];

const child = spawn('npx', args, {
  cwd: path.resolve(process['env']['APP_DIR'] || '/app'),
  env: { ...process['env'], FORCE_COLOR: '0' }
});
```

- Si `section` presente: ejecuta solo ese spec (boton "Ejecutar" por seccion)
- Si no: ejecuta todos (boton "Ejecutar todos")
- `FORCE_COLOR: '0'` para que la salida no tenga escape codes ANSI

### API Routes de Logs (2)

| Ruta | Metodo | Que hace |
|------|--------|---------|
| `/api/system/logs` | GET | Lee archivo JSONL del dia (`/app/data/logs/app-YYYY-MM-DD.jsonl`). Parsea linea por linea con `JSON.parse`. Filtra por `level`, `source`, `search` (texto libre). Parametros: `date`, `level`, `source`, `search`, `limit` (default 200). Devuelve array JSON |
| `/api/system/logs/download` | GET | Lee archivo JSONL raw del dia. Devuelve como `application/x-ndjson` con header `Content-Disposition: attachment; filename=app-YYYY-MM-DD.jsonl` |

### SQLite Reporter Update

El reporter `sqlite-reporter.ts` fue actualizado para capturar errores:

```typescript
onTestEnd(test, result) {
  this.testResults.push({
    title: test.title,
    file: test.location.file,
    status: result.status,
    duration: result.duration,
    error: result.error?.message || undefined  // NUEVO
  });
}
```

### Sidebar Entry

Agregado en `sidebar.tsx` entre Conectores y Configuracion:

```typescript
{ name: 'Testing', href: '/testing', icon: FlaskConical }
```

### Page Shell (`app/src/app/testing/page.tsx`)

Layout con 3 tabs usando shadcn Tabs:
- **Resultados** — tab principal, muestra test results
- **Historial** — ultimos 10 runs
- **Logs** — visor de logs JSONL

Header: "Testing & Diagnosticos" con icono FlaskConical.

---

## 3. Plan 37-02: Resultados Tab

### useTestRunner (`app/src/hooks/use-test-runner.ts`)

Hook custom para gestionar ejecucion de tests:

| Estado/Funcion | Descripcion |
|----------------|-------------|
| `isRunning` | Boolean — hay run activo |
| `results` | Array de test runs del ultimo fetch |
| `latestRun` | Run mas reciente con results_json parseado |
| `summary` | `{ total, passed, failed, skipped }` del ultimo run |
| `runAll()` | POST `/api/testing/run` sin section |
| `runSection(name)` | POST `/api/testing/run` con `{ section: name }` |
| `fetchResults()` | GET `/api/testing/results` |

**Polling:** Cuando `isRunning === true`, poll `/api/testing/status` cada 2000ms via `setInterval`. Al detectar status terminal, llama `fetchResults()` y para el polling.

### test-summary-bar.tsx

4 tarjetas de estadisticas + barra de coverage visual:

| Card | Color | Icono | Valor |
|------|-------|-------|-------|
| Total | zinc | FileText | `summary.total` |
| Exitosos | emerald | CheckCircle | `summary.passed` |
| Fallidos | red | XCircle | `summary.failed` |
| Omitidos | amber | MinusCircle | `summary.skipped` |

**Barra de coverage:** `div` con 3 secciones de `flexGrow` proporcional (passed/failed/skipped), coloreadas emerald/red/amber.

### test-section-list.tsx

Agrupa resultados por archivo spec (`result.file`). Cada seccion:

- **Header:** nombre del spec + badge passed/failed + boton "Ejecutar"
- **Expandible:** al click, muestra lista de tests individuales
- **Por test:** icono status (check/x/minus) + titulo + duracion en ms
- **Tests fallidos:** fondo rojo sutil, clickeable para expandir detalle

---

## 4. Plan 37-03: Historial Tab + AI Generator

### test-run-history.tsx

Lista de los ultimos 10 test runs:

| Columna | Descripcion |
|---------|-------------|
| Fecha/hora | Timestamp relativo ("hace 5 minutos") |
| Status | Badge con color (completed/failed/running) |
| Contadores | total/passed/failed/skipped como pills |
| Duracion | En segundos |
| Expandible | Click para ver tests individuales del run |

Al expandir un run, cada test fallido renderiza `<TestResultDetail>`.

### test-result-detail.tsx

Componente para mostrar detalle de un test fallido:

| Seccion | Contenido |
|---------|-----------|
| Error | Mensaje de error en bloque monoespaciado rojo (`result.error || 'Error no disponible'`) |
| Screenshot | Si disponible, imagen base64; si no, "Screenshot no disponible" |
| Codigo | Contenido del archivo spec leido via API |

### test-ai-generator.tsx

Dialog modal para generar tests con IA:

1. **Selector de seccion:** dropdown con las 15 secciones E2E disponibles
2. **Boton "Generar":** POST `/api/testing/generate` con `{ section }`
3. **Resultado:** codigo Playwright mostrado en bloque `<pre>` monoespaciado
4. **Acciones:** "Copiar al portapapeles" (clipboard API) + "Cerrar"
5. **Loading:** Spinner mientras el LLM genera

---

## 5. Plan 37-04: Logs Tab

### use-log-viewer.ts (`app/src/hooks/use-log-viewer.ts`)

Hook para consumir y filtrar logs JSONL:

| Estado/Funcion | Descripcion |
|----------------|-------------|
| `entries` | Array de log entries filtrados |
| `isLoading` | Boolean |
| `autoRefresh` | Toggle para polling automatico |
| `filters` | `{ level, source, search }` |
| `setLevel(v)` | Filtrar por nivel (info/warn/error/all) |
| `setSource(v)` | Filtrar por source (processing/chat/rag/catbot/tasks/canvas/connectors/system/all) |
| `setSearch(v)` | Busqueda de texto libre (debounced 500ms) |
| `downloadLogs()` | `window.open('/api/system/logs/download', '_blank')` |

**Polling:** Cuando `autoRefresh === true`, fetch `/api/system/logs` cada 3000ms.

### log-filters.tsx

Barra de filtros horizontal:

| Control | Tipo | Opciones |
|---------|------|----------|
| Nivel | Select | Todos, Info, Warning, Error |
| Fuente | Select | Todos, Processing, Chat, RAG, CatBot, Tasks, Canvas, Connectors, System |
| Buscar | Input | Texto libre con debounce 500ms |
| Auto-refresh | Toggle | On/Off con indicador pulsante |
| Descargar | Button | Icono Download, descarga JSONL del dia |

### log-viewer.tsx

Lista de log entries con auto-scroll:

| Columna | Descripcion |
|---------|-------------|
| Timestamp | Formato HH:mm:ss.SSS |
| Level | Badge con color (info=blue, warn=amber, error=red) |
| Source | Badge gris con nombre del source |
| Message | Texto del log entry |
| Metadata | Expandible al click — muestra JSON.stringify(metadata, null, 2) |

**Auto-scroll:** `useEffect` con `scrollIntoView({ behavior: 'smooth' })` en el ultimo entry cuando cambian los entries.

---

## 6. Flujo completo de Testing Dashboard

### Ejecutar tests

```
1. Usuario navega a /testing (sidebar → Testing)
2. Ve tab "Resultados" con resumen del ultimo run (o vacio si es la primera vez)

3. Click "Ejecutar todos" (o "Ejecutar" en una seccion especifica)
   → Frontend: POST /api/testing/run { section?: string }
   → Backend: Rechaza si hay run activo (409)
   → Backend: Crea registro en test_runs, spawn npx playwright test
   → Backend: Devuelve { runId, status: 'running' }

4. Frontend: polling cada 2s via GET /api/testing/status
   → Muestra Loader2 spinner + "Ejecutando tests..."
   → Actualiza summary bar en tiempo real (parcial si el reporter escribe incrementalmente)

5. Playwright termina → Backend actualiza test_runs (status, passed, failed, results_json)
6. Siguiente poll detecta status terminal → para polling → fetchResults()
7. UI muestra resultados: summary bar con contadores, secciones expandibles
```

### Inspeccionar test fallido

```
1. En secciones, click en test con icono rojo
2. Se expande TestResultDetail:
   - Bloque rojo con error.message
   - Screenshot si disponible (base64 inline)
   - Codigo del spec file
```

### Generar test con IA

```
1. Click "Generar test con IA" en header
2. Dialog modal: seleccionar seccion del dropdown
3. Click "Generar" → POST /api/testing/generate
4. LLM genera codigo Playwright basado en la seccion
5. Codigo mostrado en bloque monoespaciado
6. "Copiar al portapapeles" → clipboard API
```

### Ver logs

```
1. Click tab "Logs"
2. Log viewer carga ultimas 200 entradas del dia
3. Auto-refresh cada 3s (toggle activado por defecto)
4. Filtrar por nivel (info/warn/error)
5. Filtrar por source (processing/chat/rag/etc.)
6. Buscar texto libre (debounced 500ms)
7. Click en entry para expandir metadata JSON
8. "Descargar logs" → descarga archivo .jsonl crudo
```

---

## 7. Commits de la fase

| Commit | Tipo | Descripcion |
|--------|------|-------------|
| `902b4d5` | feat | Add testing API routes, log endpoints, and update SQLite reporter |
| `a62e29f` | feat | Add /testing sidebar entry and page shell with 3 tabs |
| `2281521` | docs | Complete Testing API Routes + Page Shell plan |
| `87f1d52` | feat | Create useTestRunner hook with polling |
| `60eb152` | feat | Add summary bar, section list, and wire Resultados tab |
| `a13151c` | docs | Complete Resultados tab plan |
| `319c252` | feat | Add test run history list and failed test detail components |
| `1c1fbe4` | feat | Add AI test generator dialog and wire history tab into page |
| `d7a30ba` | docs | Complete History tab + AI generator plan |
| `4da644f` | feat | Add useLogViewer hook and LogFilters component |
| `d89b871` | feat | Add LogViewer component and wire Logs tab into testing page |
| `87a2600` | docs | Complete Log Viewer plan |
| `2afb1d5` | docs | Complete Testing Dashboard + Log Viewer — v7.0 milestone done |

---

## 8. Archivos nuevos y modificados

### Archivos nuevos (14)

| Archivo | Proposito |
|---------|-----------|
| `app/src/lib/testing-state.ts` | Estado en memoria para run activo |
| `app/src/app/api/testing/run/route.ts` | POST — spawn Playwright |
| `app/src/app/api/testing/status/route.ts` | GET — status del run |
| `app/src/app/api/testing/results/route.ts` | GET — historial de runs |
| `app/src/app/api/testing/generate/route.ts` | POST — generar test con LLM |
| `app/src/app/api/system/logs/route.ts` | GET — leer/filtrar JSONL |
| `app/src/app/api/system/logs/download/route.ts` | GET — descargar JSONL |
| `app/src/app/testing/page.tsx` | Pagina /testing con 3 tabs |
| `app/src/hooks/use-test-runner.ts` | Hook: run tests + polling 2s |
| `app/src/hooks/use-log-viewer.ts` | Hook: fetch logs + polling 3s |
| `app/src/components/testing/test-summary-bar.tsx` | 4 stat cards + coverage bar |
| `app/src/components/testing/test-section-list.tsx` | Secciones expandibles por spec |
| `app/src/components/testing/test-run-history.tsx` | Lista ultimos 10 runs |
| `app/src/components/testing/test-result-detail.tsx` | Detalle test fallido (error/screenshot/code) |
| `app/src/components/testing/test-ai-generator.tsx` | Dialog generacion IA |
| `app/src/components/testing/log-filters.tsx` | Filtros de logs (level/source/search) |
| `app/src/components/testing/log-viewer.tsx` | Visor de log entries |

### Archivos modificados (3)

| Archivo | Cambio |
|---------|--------|
| `app/src/components/layout/sidebar.tsx` | +entrada /testing con FlaskConical |
| `app/e2e/reporters/sqlite-reporter.ts` | +campo `error?` en results_json |
| `app/src/lib/db.ts` | (ya tenia test_runs de Phase 36) |

---

## 9. Patrones establecidos

### In-memory run state (single-user)

```typescript
// testing-state.ts
let currentRun: RunState | null = null;
export function getCurrentRun() { return currentRun; }
export function setCurrentRun(run: RunState | null) { currentRun = run; }
```
Pattern: estado module-level compartido entre rutas API. Funciona porque la app es single-user y single-process.

### Spawn + fire-and-forget

```typescript
const child = spawn('npx', ['playwright', 'test', ...args], { cwd, env });
child.on('close', (code) => {
  // Update DB with final results
  setCurrentRun(null);
});
// Don't await — return response immediately
return NextResponse.json({ runId, status: 'running' });
```

### Polling hook pattern

```typescript
useEffect(() => {
  if (!isRunning) return;
  const id = setInterval(async () => {
    const status = await fetch('/api/testing/status').then(r => r.json());
    if (status.status !== 'running') {
      clearInterval(id);
      fetchResults();
    }
  }, 2000);
  return () => clearInterval(id);
}, [isRunning]);
```

### JSONL line-by-line parsing

```typescript
const content = fs.readFileSync(logFile, 'utf-8');
const entries = content.split('\n')
  .filter(line => line.trim())
  .map(line => { try { return JSON.parse(line); } catch { return null; } })
  .filter(Boolean)
  .filter(entry => !level || entry.level === level)
  .filter(entry => !source || entry.source === source)
  .filter(entry => !search || entry.message?.includes(search))
  .slice(-limit);
```

---

## 10. Decisiones tecnicas

| Decision | Razon |
|----------|-------|
| `child_process.spawn` (no exec) | Spawn no tiene buffer limit; exec puede fallar con output largo de Playwright |
| Estado in-memory (no Redis/DB) | App single-user, single-process — la complejidad de Redis no se justifica |
| Rechazo 409 para runs concurrentes | SQLite + workers:1 ya previene concurrencia; el 409 lo hace explicito en la UI |
| Polling 2s para tests, 3s para logs | Tests cambian rapido (seconds-long); logs cambian mas lento |
| Debounce 500ms en busqueda de logs | Evita fetch en cada keystroke |
| `FORCE_COLOR: '0'` en spawn | Playwright emite ANSI escape codes que ensucian el output parseado |
| Download via `window.open` | Mas simple que fetch + Blob URL; el browser maneja el download nativo |
| Auto-scroll con `scrollIntoView` | Mantiene el log viewer en la ultima entrada sin JavaScript complejo |
| Metadata expandible por entry | Los logs pueden tener metadata larga; mostrar inline sobrecargaria la UI |

---

## 11. Resumen completo milestone v7.0

### v7.0: Streaming + Testing + Logging + Notificaciones

| Phase | Nombre | Plans | Requirements | Sesion |
|-------|--------|-------|-------------|--------|
| 32 | Logging Foundation | 3/3 | LOG-01, LOG-02, LOG-03 | 12* |
| 33 | Streaming Backend | 2/2 | STRM-01, STRM-02, STRM-03 | 12* |
| 34 | Streaming Frontend | 2/2 | STRM-04, STRM-05, STRM-06, STRM-07 | 12* |
| 35 | Notifications System | 2/2 | NOTIF-01..07 | 12* |
| 36 | Playwright Setup + Test Specs | 5/5 | PLAY-01..04, E2E-01..15, API-01..04 | 12 |
| 37 | Testing Dashboard + Log Viewer | 4/4 | TEST-01..09, LOG-04..07 | 13 |
| **Total** | | **18/18 plans** | **53/53 requirements** | |

*Phases 32-35 fueron ejecutadas en sesiones anteriores no documentadas individualmente. Los commits estan en el historial git.

### Sistemas entregados

1. **Logging JSONL** — Logger estructurado con 12 sources, rotacion 7 dias, integracion en todos los servicios y rutas API
2. **SSE Streaming** — Backend: `streamLiteLLM()` helper compartido + 3 rutas SSE. Frontend: `useSSEStream` hook con rAF batching, cursor parpadeante, boton parar
3. **Notificaciones** — 12 trigger points, tabla SQLite, polling 15s, bell badge, popover, pagina /notifications con filtros
4. **Playwright E2E** — 19 specs (15 E2E + 4 API), 15 POMs, fixtures tipados, SQLite reporter, global setup/teardown
5. **Testing Dashboard** — Pagina /testing con 3 tabs: ejecutar tests + resultados en tiempo real, historial + detalle de fallos + generador IA, visor de logs con filtros

### Estadisticas finales

| Metrica | Valor |
|---------|-------|
| Fases | 6 |
| Planes ejecutados | 18 |
| Requisitos cubiertos | 53/53 (100%) |
| Archivos nuevos creados | ~80+ |
| Commits | ~60+ |
| Verificaciones pasadas | 6/6 fases |

---

*Milestone completado: 2026-03-14*
*v7.0 — Streaming + Testing + Logging + Notificaciones*
*Pendiente: Deploy a Docker y verificacion manual*
