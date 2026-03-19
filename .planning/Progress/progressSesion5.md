# DocFlow - Sesion 5: Fix RAG Chat + Barra de Progreso de Indexacion

> Funcionalidades implementadas sobre la base documentada en `progressWebapp.md`, `progressSesion2.md`, `progressSesion3.md` y `progressSesion4.md`. Esta sesion corrige el endpoint de chat RAG que no encontraba contenido indexado, y agrega una barra de progreso visual en tiempo real durante la indexacion RAG.

---

## Indice

1. [Resumen de cambios](#1-resumen-de-cambios)
2. [Metodologia: GSD Workflow](#2-metodologia-gsd-workflow)
3. [Phase 1: Fix RAG Chat Retrieval](#3-phase-1-fix-rag-chat-retrieval)
4. [Phase 2: Barra de progreso de indexacion RAG](#4-phase-2-barra-de-progreso-de-indexacion-rag)
5. [Archivos nuevos y modificados](#5-archivos-nuevos-y-modificados)
6. [Commits de la sesion](#6-commits-de-la-sesion)
7. [Verificacion y build](#7-verificacion-y-build)
8. [Pendientes para verificacion humana](#8-pendientes-para-verificacion-humana)

---

## 1. Resumen de cambios

### Problemas resueltos
- **Chat RAG no encontraba contenido**: El endpoint `/api/projects/[id]/chat` respondia "no tengo esa informacion" incluso cuando los chunks existian en Qdrant. Causa raiz: usaba llamadas `fetch()` manuales a Ollama y Qdrant en vez de los servicios compartidos que SI funcionaban en "Probar consulta".
- **Progreso de indexacion era texto generico**: Durante la indexacion RAG, la UI solo mostraba texto como "Embedding 15/44..." sin barra visual ni porcentaje.

### Funcionalidades nuevas
- **Chat RAG funcional** — Usa los mismos servicios compartidos (`ollama.ts`, `qdrant.ts`) que el endpoint de consulta que ya funcionaba
- **Barra de progreso visual** — Durante indexacion, muestra barra violeta con porcentaje, "15/44 chunks", paso actual descriptivo, y tiempo transcurrido
- **Datos estructurados de progreso** — Toda la cadena (worker → archivo de estado → backend → API → UI) propaga `chunksProcessed` y `chunksTotal`
- **Logs diagnosticos en chat** — Query recibida, chunks encontrados, scores, longitud del contexto

### Planificacion GSD creada
- `.planning/codebase/` — 7 documentos de analisis del codebase
- `.planning/PROJECT.md` — Definicion del proyecto con milestone
- `.planning/REQUIREMENTS.md` — 14 requisitos con IDs (CHAT-01..07, PROG-01..05, REIDX-01..02)
- `.planning/ROADMAP.md` — 2 fases, ambas completadas
- `.planning/STATE.md` — Estado actual del milestone
- `.planning/phases/01-fix-rag-chat-retrieval/` — Plan, Summary, Verification
- `.planning/phases/02-real-time-rag-indexing-progress/` — Plan, Summary, Verification

---

## 2. Metodologia: GSD Workflow

Esta sesion uso el workflow GSD (Get Shit Done) completo:

```
/gsd:map-codebase      → 4 agentes paralelos analizan el codebase → 7 documentos
/gsd:new-milestone     → Define milestone, requisitos, roadmap
/gsd:plan-phase 1      → Investiga + crea plan ejecutable para Phase 1
/gsd:execute-phase 1   → Ejecuta plan con commits atomicos + verificacion
/gsd:execute-phase 2   → Crea plan inline + ejecuta Phase 2
```

### Artefactos de planificacion

| Archivo | Proposito |
|---------|-----------|
| `.planning/codebase/STACK.md` | Tecnologias y dependencias |
| `.planning/codebase/INTEGRATIONS.md` | Servicios externos (Ollama, Qdrant, LiteLLM) |
| `.planning/codebase/ARCHITECTURE.md` | Arquitectura de la app |
| `.planning/codebase/STRUCTURE.md` | Estructura de directorios |
| `.planning/codebase/CONVENTIONS.md` | Convenciones de codigo |
| `.planning/codebase/TESTING.md` | Estado de tests |
| `.planning/codebase/CONCERNS.md` | Deuda tecnica y riesgos |
| `.planning/PROJECT.md` | Definicion del proyecto |
| `.planning/REQUIREMENTS.md` | 14 requisitos mapeados |
| `.planning/ROADMAP.md` | 2 fases planificadas |
| `.planning/STATE.md` | Progreso: 2/2 fases completadas |

---

## 3. Phase 1: Fix RAG Chat Retrieval

### Causa raiz del bug

El endpoint `chat/route.ts` hacia llamadas `fetch()` manuales directas a Ollama (`/api/embed`) y Qdrant (`/collections/.../points/search`) con URLs hardcodeadas. Estas llamadas fallaban silenciosamente o diferian de la logica probada.

Mientras tanto, el endpoint `rag/query/route.ts` ("Probar consulta") usaba los servicios compartidos `ollama.ts` y `qdrant.ts` que SI funcionaban correctamente y encontraban chunks con ~57% de score.

### Solucion: Reescritura completa de chat/route.ts

Archivo: `app/src/app/api/projects/[id]/chat/route.ts`

El archivo fue reescrito completamente para usar el mismo patron que el endpoint de consulta:

```typescript
import { qdrant } from '@/lib/services/qdrant';
import { ollama } from '@/lib/services/ollama';

export const dynamic = 'force-dynamic';

interface QdrantResult {
  score: number;
  payload: { text: string; [key: string]: unknown };
}
```

### Flujo del endpoint reescrito

```
1. Recibe message del body JSON
2. Consulta proyecto de SQLite (valida rag_enabled y rag_collection)
3. qdrant.getCollectionInfo() → obtiene vectorSize
4. ollama.guessModelFromVectorSize(vectorSize) → modelo correcto
5. ollama.getEmbedding(message, model) → vector de la consulta
6. qdrant.search(collection, queryVector, 10) → hasta 10 resultados
7. Construye contexto con todos los chunks (sin filtrar por score)
8. LiteLLM /v1/chat/completions → genera respuesta con contexto
9. Retorna { reply, sources }
```

### Cambios clave vs version anterior

| Aspecto | Antes (roto) | Despues (funcional) |
|---------|-------------|---------------------|
| Ollama | `fetch()` manual a `/api/embed` | `ollama.getEmbedding(message, model)` |
| Qdrant | `fetch()` manual a `/collections/.../points/search` | `qdrant.search(collection, vector, 10)` |
| Modelo embedding | Hardcodeado | Deteccion dinamica via `guessModelFromVectorSize()` |
| Limite busqueda | 5 | 10 |
| Filtro score | `score_threshold` activo | Sin filtro (usa todos los resultados) |
| Logs | Ninguno | Query, chunks, scores, longitud contexto |
| `force-dynamic` | No | Si |
| Tipos | `any` | `QdrantResult` interface |

### Deteccion dinamica de modelo de embedding

Patron compartido entre chat y query para detectar automaticamente el modelo correcto:

```typescript
// 1. Obtener info de la coleccion en Qdrant
const collectionInfo = await qdrant.getCollectionInfo(project.rag_collection);

// 2. Extraer tamaño del vector (768 dims = nomic-embed-text)
const vectorSize = collectionInfo.result?.config?.params?.vectors?.size || 768;

// 3. Determinar modelo automaticamente
const model = ollama.guessModelFromVectorSize(vectorSize);

// 4. Generar embedding con el modelo correcto
const queryVector = await ollama.getEmbedding(message, model);
```

### Prompt del sistema para el LLM

```
Eres el bot experto del proyecto "{nombre}". Responde basandote UNICAMENTE
en el siguiente contexto extraido de la documentacion del proyecto. Si la
informacion no esta en el contexto, di que no tienes esa informacion.

Contexto:
[Fuente 1] {texto chunk 1}
[Fuente 2] {texto chunk 2}
...
```

### Configuracion de LiteLLM

```typescript
const litellmUrl = process['env']['LITELLM_URL'] || 'http://192.168.1.49:4000';
const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
const chatModel = process['env']['CHAT_MODEL'] || 'gemini-main';
```

### Logs diagnosticos (en espanol)

```
[Chat] Consulta recibida: <query>
[Chat] Chunks encontrados: 10
[Chat] Scores: [0.57, 0.54, 0.51, ...]
[Chat] Longitud del contexto: 12345 caracteres
```

### Requisitos completados (Phase 1)

- [x] **CHAT-01**: Chat usa servicios compartidos (ollama.ts, qdrant.ts)
- [x] **CHAT-02**: Busca con modelo correcto (nomic-embed-text via deteccion dinamica)
- [x] **CHAT-03**: Recupera hasta 10 resultados de Qdrant
- [x] **CHAT-04**: No filtra por score_threshold
- [x] **CHAT-05**: Chunks se pasan como contexto al LLM
- [x] **CHAT-06**: Logs: query, chunks, scores, longitud contexto
- [x] **CHAT-07**: Modelo por defecto gemini-main (configurable via CHAT_MODEL)

---

## 4. Phase 2: Barra de progreso de indexacion RAG

### Cadena de datos de progreso

```
rag-worker.mjs                    → Escribe a /tmp/rag-{projectId}.json
  ↓
rag/create/route.ts (polling)     → Lee archivo, pasa a ragJobs
  ↓
rag-jobs.ts (in-memory)           → Almacena chunksProcessed/chunksTotal
  ↓
rag/status/route.ts               → Devuelve en respuesta JSON
  ↓
rag-panel.tsx (polling cada 2s)   → Renderiza barra de progreso
```

### Paso 1: Worker escribe datos estructurados

Archivo: `app/scripts/rag-worker.mjs`

La funcion `writeStatus()` ya aceptaba un tercer parametro `extra = {}`. Se agregaron `chunksProcessed` y `chunksTotal` a cada llamada:

```javascript
// Antes del loop de embeddings:
writeStatus('running', 'Dividiendo en chunks...', { chunksProcessed: 0, chunksTotal: 0 });

// Despues de generar chunks:
writeStatus('running', `${chunks.length} chunks generados. Iniciando embeddings...`,
  { chunksProcessed: 0, chunksTotal: chunks.length });

// En cada iteracion del loop:
const msg = `Generando embedding ${i + 1}/${total}...`;
writeStatus('running', msg, { chunksProcessed: i + 1, chunksTotal: total });

// Al completar:
writeStatus('completed', 'Completado',
  { chunksCount: total, chunksProcessed: total, chunksTotal: total });
```

Formato del archivo de estado (`/tmp/rag-{projectId}.json`):

```json
{
  "status": "running",
  "progress": "Generando embedding 15/44...",
  "chunksProcessed": 15,
  "chunksTotal": 44,
  "updatedAt": 1234567890
}
```

### Paso 2: Backend propaga datos estructurados

#### rag-jobs.ts — Interface y updateProgress

Archivo: `app/src/lib/services/rag-jobs.ts`

```typescript
export interface RagJob {
  id: string;
  projectId: string;
  status: 'running' | 'completed' | 'error';
  progress: string;
  startedAt: number;
  completedAt?: number;
  error?: string;
  chunksCount?: number;
  chunksProcessed?: number;   // NUEVO
  chunksTotal?: number;       // NUEVO
}

// updateProgress ahora acepta datos de chunks:
updateProgress(projectId: string, progress: string, chunksProcessed?: number, chunksTotal?: number) {
  const job = jobs.get(projectId);
  if (job) {
    job.progress = progress;
    if (chunksProcessed !== undefined) job.chunksProcessed = chunksProcessed;
    if (chunksTotal !== undefined) job.chunksTotal = chunksTotal;
  }
},
```

#### rag/create/route.ts — Pasa datos del status file a ragJobs

Archivo: `app/src/app/api/projects/[id]/rag/create/route.ts`

```typescript
// En el polling del status file:
if (data.status === 'running') {
  ragJobs.updateProgress(projectId, data.progress || 'Procesando...',
    data.chunksProcessed, data.chunksTotal);
}
```

#### rag/status/route.ts — Devuelve datos en la respuesta

Archivo: `app/src/app/api/projects/[id]/rag/status/route.ts`

```typescript
return NextResponse.json({
  jobId: job.id,
  status: job.status,
  progress: job.progress,
  startedAt: job.startedAt,
  completedAt: job.completedAt,
  error: job.error,
  chunksCount: job.chunksCount,
  chunksProcessed: job.chunksProcessed,   // NUEVO
  chunksTotal: job.chunksTotal,           // NUEVO
});
```

### Paso 3: UI muestra barra de progreso visual

Archivo: `app/src/components/rag/rag-panel.tsx`

#### Nuevos estados

```typescript
const [chunksProcessed, setChunksProcessed] = useState(0);
const [chunksTotal, setChunksTotal] = useState(0);
```

#### Polling actualiza los estados

```typescript
if (data.status === 'running') {
  setProgressMsg(data.progress || 'Indexando...');
  if (data.chunksProcessed !== undefined) setChunksProcessed(data.chunksProcessed);
  if (data.chunksTotal !== undefined) setChunksTotal(data.chunksTotal);
} else if (data.status === 'completed') {
  // ... reset:
  setChunksProcessed(0);
  setChunksTotal(0);
  toast.success(`Indexacion completada: ${data.chunksCount} vectores indexados`);
} else if (data.status === 'error' || data.status === 'idle') {
  // ... reset:
  setChunksProcessed(0);
  setChunksTotal(0);
}
```

#### Barra de progreso visual

```tsx
{isIndexing && (
  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-3">
    {/* Barra de progreso — solo visible cuando chunksTotal > 0 */}
    {chunksTotal > 0 && (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-300 font-medium">
            {chunksProcessed}/{chunksTotal} chunks
          </span>
          <span className="text-violet-400 font-mono">
            {Math.round((chunksProcessed / chunksTotal) * 100)}%
          </span>
        </div>
        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-violet-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.round((chunksProcessed / chunksTotal) * 100)}%` }}
          />
        </div>
      </div>
    )}

    {/* Paso actual y tiempo transcurrido */}
    <div className="flex items-center justify-between">
      <p className="text-sm text-violet-400 animate-pulse">{progressMsg}</p>
      <p className="text-xs text-zinc-500 font-mono">
        {Math.floor(ragElapsed / 60)}:{(ragElapsed % 60).toString().padStart(2, '0')}
      </p>
    </div>

    {/* Log de indexacion */}
    <div className="space-y-1 text-xs font-mono text-zinc-400 max-h-32 overflow-y-auto">
      {getRagLogs().map((log, i) => (
        <p key={i} className={log.done ? 'text-emerald-400' : 'text-violet-400 animate-pulse'}>
          {log.done ? '✓' : '↻'} {log.text}
        </p>
      ))}
    </div>
  </div>
)}
```

### Descripcion visual de la barra

```
┌──────────────────────────────────────────────┐
│  15/44 chunks                           34%  │
│  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│                                              │
│  ⟳ Generando embedding 15/44...       0:23   │
│                                              │
│  ✓ Leyendo documento...                      │
│  ✓ Dividiendo en chunks...                   │
│  ✓ 44 chunks generados. Iniciando embeddings │
│  ⟳ Generando embedding 15/44...              │
└──────────────────────────────────────────────┘
```

- Barra violeta (`bg-violet-500`) con animacion de transicion (`transition-all duration-500`)
- Contador de chunks y porcentaje
- Paso actual con animacion pulse
- Tiempo transcurrido (MM:SS)
- Log de pasos con iconos (✓ completado, ↻ en progreso)

### Toast al completar

```
✓ Indexacion completada: 44 vectores indexados
```

### Requisitos completados (Phase 2)

- [x] **PROG-01**: Barra de progreso visual con porcentaje basado en chunksProcessed/chunksTotal
- [x] **PROG-02**: Texto descriptivo del paso actual se actualiza en tiempo real
- [x] **PROG-03**: Tiempo transcurrido visible durante indexacion
- [x] **PROG-04**: Toast al completar con N vectores indexados
- [x] **PROG-05**: Endpoint GET /rag/status devuelve chunksProcessed y chunksTotal

---

## 5. Archivos nuevos y modificados

### Archivos modificados (codigo)

| Archivo | Cambios |
|---------|---------|
| `app/src/app/api/projects/[id]/chat/route.ts` | Reescrito completamente: servicios compartidos, limit 10, sin filtro score, logs, QdrantResult interface, force-dynamic |
| `app/scripts/rag-worker.mjs` | writeStatus con chunksProcessed/chunksTotal en chunking, loop de embeddings, y completado |
| `app/src/lib/services/rag-jobs.ts` | RagJob interface + updateProgress con chunksProcessed/chunksTotal |
| `app/src/app/api/projects/[id]/rag/status/route.ts` | Respuesta JSON incluye chunksProcessed y chunksTotal |
| `app/src/app/api/projects/[id]/rag/create/route.ts` | Polling pasa chunksProcessed/chunksTotal del status file a ragJobs |
| `app/src/components/rag/rag-panel.tsx` | Estados de chunks, polling actualiza, barra de progreso visual, reset en completed/error/idle |

### Archivos nuevos (planificacion GSD)

| Archivo | Descripcion |
|---------|-------------|
| `.planning/PROJECT.md` | Definicion del proyecto DocFlow |
| `.planning/REQUIREMENTS.md` | 14 requisitos con IDs y trazabilidad |
| `.planning/ROADMAP.md` | 2 fases planificadas y completadas |
| `.planning/STATE.md` | Estado del milestone (2/2 fases completadas) |
| `.planning/codebase/STACK.md` | Stack tecnologico |
| `.planning/codebase/INTEGRATIONS.md` | Integraciones externas |
| `.planning/codebase/ARCHITECTURE.md` | Arquitectura de la app |
| `.planning/codebase/STRUCTURE.md` | Estructura de directorios |
| `.planning/codebase/CONVENTIONS.md` | Convenciones de codigo |
| `.planning/codebase/TESTING.md` | Estado de tests |
| `.planning/codebase/CONCERNS.md` | Deuda tecnica |
| `.planning/phases/01-fix-rag-chat-retrieval/01-01-PLAN.md` | Plan de ejecucion Phase 1 |
| `.planning/phases/01-fix-rag-chat-retrieval/01-01-SUMMARY.md` | Resumen de ejecucion Phase 1 |
| `.planning/phases/01-fix-rag-chat-retrieval/01-01-VERIFICATION.md` | Verificacion Phase 1 |
| `.planning/phases/02-real-time-rag-indexing-progress/02-01-PLAN.md` | Plan de ejecucion Phase 2 |
| `.planning/phases/02-real-time-rag-indexing-progress/02-01-SUMMARY.md` | Resumen de ejecucion Phase 2 |
| `.planning/phases/02-real-time-rag-indexing-progress/02-01-VERIFICATION.md` | Verificacion Phase 2 |

---

## 6. Commits de la sesion

| Commit | Descripcion |
|--------|-------------|
| `05a3f1c` | docs: initialize milestone v1.0 — Fix RAG Chat + Mejoras de indexacion (2 phases) |
| `85f96f6` | docs(01-fix-rag-chat-retrieval): create phase plan |
| `b76071f` | feat(01-01): rewrite chat endpoint with shared ollama/qdrant services |
| `c75fbcb` | fix(01-01): replace any types with QdrantResult interface for build |
| `5a82fe7` | docs(01-01): complete chat endpoint rewrite plan |
| `eb35a45` | docs(phase-1): complete phase execution — Fix RAG Chat Retrieval |
| `80c0503` | docs(phase-2): plan RAG indexing progress bar (1 plan, 1 wave) |
| `a96642e` | feat(02-01): add chunksProcessed/chunksTotal to rag-worker status updates |
| `0ad1fd0` | feat(02-01): propagate chunksProcessed/chunksTotal through backend chain |
| `3c3ebbe` | feat(02-01): add visual progress bar to RAG indexing panel |
| `8f4a061` | docs(02-01): complete RAG indexing progress bar plan |
| `55a25d6` | docs(phase-2): complete phase execution — RAG Indexing Progress |

---

## 7. Verificacion y build

### Build local

```bash
cd ~/docflow/app && npm run build
```

Resultado: Build exitoso sin errores.

### Verificaciones automaticas ejecutadas

```bash
# Phase 1
grep "import.*ollama" app/src/app/api/projects/[id]/chat/route.ts    # ✓ Servicio compartido
grep "import.*qdrant" app/src/app/api/projects/[id]/chat/route.ts    # ✓ Servicio compartido
grep "force-dynamic" app/src/app/api/projects/[id]/chat/route.ts     # ✓ Presente
grep ", 10)" app/src/app/api/projects/[id]/chat/route.ts             # ✓ Limite 10

# Phase 2
grep "chunksProcessed" app/scripts/rag-worker.mjs                    # ✓ 4 ocurrencias
grep "chunksProcessed" app/src/lib/services/rag-jobs.ts              # ✓ Interface + updateProgress
grep "chunksProcessed" app/src/app/api/projects/[id]/rag/status/route.ts  # ✓ En respuesta
grep "chunksProcessed" app/src/app/api/projects/[id]/rag/create/route.ts  # ✓ Polling
grep "chunksProcessed" app/src/components/rag/rag-panel.tsx          # ✓ 5 ocurrencias (UI)
```

### Deploy Docker

```bash
docker compose build --no-cache && docker compose up -d
```

---

## 8. Pendientes para verificacion humana

### Test E2E del chat RAG
1. Abrir un proyecto con RAG indexado
2. Ir al panel de Chat
3. Enviar una consulta que coincida con contenido indexado (ej: "spoke")
4. Verificar que la respuesta incluye contenido real de los chunks (no "no tengo esa informacion")
5. Verificar en la consola del servidor los logs: `[Chat] Chunks encontrados: N`, `[Chat] Scores: [...]`

### Test E2E de la barra de progreso
1. Abrir un proyecto con fuentes procesadas
2. Ir al panel RAG y clickear "Indexar documentos"
3. Verificar que aparece la barra violeta con porcentaje
4. Verificar que el texto del paso cambia: "Dividiendo en chunks..." → "N chunks generados..." → "Generando embedding X/Y..."
5. Verificar que el timer de tiempo transcurrido funciona
6. Al completar, verificar el toast "Indexacion completada: N vectores indexados"

### Nota de sesion anterior (no implementado)
- Badge amber "Mayormente imagenes" en `source-item.tsx` cuando PDF tiene < 500 chars content_text pero archivo > 100KB
- Agregar `content_text_length` a la respuesta GET sources API
