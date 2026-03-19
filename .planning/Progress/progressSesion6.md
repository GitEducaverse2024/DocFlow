# DocFlow - Sesion 6: Sistema de Tareas Multi-Agente (Milestone v2.0)

> Funcionalidades implementadas sobre la base documentada en `progressSesion5.md`. Esta sesion implementa el sistema completo de tareas multi-agente: modelo de datos, API CRUD, motor de ejecucion de pipelines, pagina de listado, wizard de creacion con drag-and-drop, y vista de ejecucion en tiempo real.

---

## Indice

1. [Resumen de cambios](#1-resumen-de-cambios)
2. [Metodologia y planificacion](#2-metodologia-y-planificacion)
3. [Phase 3: Data Model + Templates Seed](#3-phase-3-data-model--templates-seed)
4. [Phase 4: API CRUD (Tasks, Steps, Templates)](#4-phase-4-api-crud-tasks-steps-templates)
5. [Phase 5: Pipeline Execution Engine](#5-phase-5-pipeline-execution-engine)
6. [Phase 6: Tasks List Page + Sidebar](#6-phase-6-tasks-list-page--sidebar)
7. [Phase 7: Task Creation Wizard](#7-phase-7-task-creation-wizard)
8. [Phase 8: Execution View + Real-time Monitoring](#8-phase-8-execution-view--real-time-monitoring)
9. [Bug fix: crypto.randomUUID en HTTP](#9-bug-fix-cryptorandomuuid-en-http)
10. [Archivos nuevos y modificados](#10-archivos-nuevos-y-modificados)
11. [Commits de la sesion](#11-commits-de-la-sesion)
12. [Deploy y verificacion](#12-deploy-y-verificacion)

---

## 1. Resumen de cambios

### Nuevo sistema completo: Tareas Multi-Agente

Se implemento un sistema de tareas donde multiples agentes de IA colaboran en un pipeline secuencial para producir documentos complejos. El usuario define pasos (agentes, checkpoints humanos, sintesis), los ejecuta, y monitorea en tiempo real.

### 48 requisitos implementados en 6 fases

| Fase | Que se construyo | Requisitos | Duracion |
|------|-----------------|------------|----------|
| 3 | Modelo de datos (SQLite + TypeScript) | 7/7 | 95s |
| 4 | API CRUD completa (13 endpoints) | 12/12 | 105s |
| 5 | Motor de ejecucion de pipelines | 11/11 | 190s |
| 6 | Pagina de listado + sidebar | 7/7 | 104s |
| 7 | Wizard de creacion con drag-and-drop | 6/6 | 201s |
| 8 | Vista de ejecucion en tiempo real | 5/5 | 172s |
| **Total** | | **48/48** | **~15 min** |

### Tipos de paso en el pipeline

- **Agente**: Llama a un LLM con instrucciones, contexto de pasos anteriores, y opcionalmente RAG de proyectos vinculados
- **Checkpoint**: Pausa la ejecucion para revision humana. El usuario aprueba o rechaza con feedback
- **Sintesis (Merge)**: Concatena outputs de todos los pasos anteriores y genera un documento unificado

### Modos de contexto

- **previous**: Solo el output del paso anterior
- **all**: Todos los outputs concatenados
- **manual**: Texto manual del usuario
- **rag**: Busqueda en colecciones RAG de proyectos vinculados

---

## 2. Metodologia y planificacion

### Workflow GSD ejecutado

```
/gsd:new-milestone     → Define milestone v2.0, requisitos, roadmap (6 fases)
/gsd:plan-phase 3      → Plan para modelo de datos
/gsd:execute-phase 3   → Ejecuta con commits atomicos
/gsd:plan-phase 4      → Plan para API CRUD
/gsd:execute-phase 4   → Ejecuta 8 tareas en 7 archivos
/gsd:plan-phase 5      → Plan para motor de ejecucion
/gsd:execute-phase 5   → Ejecuta 5 tareas en 7 archivos
/gsd:plan-phase 6      → Plan para UI listado
/gsd:execute-phase 6   → Ejecuta 3 tareas en 2 archivos
/gsd:plan-phase 7      → Plan para wizard
/gsd:execute-phase 7   → Ejecuta 2 tareas en 1 archivo
/gsd:plan-phase 8      → Plan para vista de ejecucion
/gsd:execute-phase 8   → Ejecuta 2 tareas en 1 archivo
```

### Cadena de dependencias

```
Phase 3 (Data) → Phase 4 (API) → Phase 5 (Execution)
                                         ↓
Phase 3 (Data) → Phase 6 (List UI) → Phase 7 (Wizard) → Phase 8 (Exec View)
```

### Artefactos de planificacion creados

| Archivo | Descripcion |
|---------|-------------|
| `.planning/REQUIREMENTS.md` | 48 requisitos con IDs (DATA, API, EXEC, PROMPT, UI, WIZ, VIEW, TMPL) |
| `.planning/ROADMAP.md` | 6 fases (3-8) con dependencias |
| `.planning/STATE.md` | Progreso: 6/6 fases completadas |
| `.planning/phases/03-*/` | Plan + Summary |
| `.planning/phases/04-*/` | Plan + Summary |
| `.planning/phases/05-*/` | Plan + Summary |
| `.planning/phases/06-*/` | Plan + Summary |
| `.planning/phases/07-*/` | Plan + Summary |
| `.planning/phases/08-*/` | Plan + Summary |

---

## 3. Phase 3: Data Model + Templates Seed

### 3 tablas nuevas en SQLite

Archivo: `app/src/lib/db.ts`

#### Tabla `tasks`

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  expected_output TEXT,
  status TEXT DEFAULT 'draft',
  linked_projects TEXT,        -- JSON array de project IDs
  result_output TEXT,          -- Output final del pipeline
  total_tokens INTEGER DEFAULT 0,
  total_duration INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
);
```

Status posibles: `draft | configuring | ready | running | paused | completed | failed`

#### Tabla `task_steps`

```sql
CREATE TABLE IF NOT EXISTS task_steps (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  type TEXT NOT NULL,           -- 'agent' | 'checkpoint' | 'merge'
  name TEXT,
  agent_id TEXT,
  agent_name TEXT,
  agent_model TEXT,
  instructions TEXT,
  context_mode TEXT DEFAULT 'previous',  -- 'previous' | 'all' | 'manual' | 'rag'
  context_manual TEXT,
  rag_query TEXT,
  use_project_rag INTEGER DEFAULT 0,
  skill_ids TEXT,              -- JSON array de skill IDs
  status TEXT DEFAULT 'pending',  -- 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  output TEXT,
  tokens_used INTEGER DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  human_feedback TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

#### Tabla `task_templates`

```sql
CREATE TABLE IF NOT EXISTS task_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  emoji TEXT DEFAULT '📋',
  category TEXT,               -- 'documentation' | 'business' | 'development' | 'research' | 'content'
  steps_config TEXT,           -- JSON array de configuracion de pasos
  required_agents TEXT,        -- JSON array de roles de agentes necesarios
  times_used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 3 templates seed

| ID | Nombre | Emoji | Categoria | Pasos |
|----|--------|-------|-----------|-------|
| `doc-tecnica` | Documentacion tecnica completa | 📄 | documentation | 4: Analizar fuentes → Revision humana → Generar PRD → Definir arquitectura |
| `propuesta-comercial` | Propuesta comercial | 💼 | business | 3: Analizar requisitos → Revision humana → Generar propuesta |
| `investigacion-resumen` | Investigacion y resumen | 🔍 | research | 3: Investigar tema → Generar resumen ejecutivo → Revision humana |

### Interfaces TypeScript

Archivo: `app/src/lib/types.ts`

```typescript
export interface Task {
  id: string;
  name: string;
  description: string | null;
  expected_output: string | null;
  status: 'draft' | 'configuring' | 'ready' | 'running' | 'paused' | 'completed' | 'failed';
  linked_projects: string | null;
  result_output: string | null;
  total_tokens: number;
  total_duration: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface TaskStep {
  id: string;
  task_id: string;
  order_index: number;
  type: 'agent' | 'checkpoint' | 'merge';
  name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_model: string | null;
  instructions: string | null;
  context_mode: 'previous' | 'all' | 'manual' | 'rag';
  context_manual: string | null;
  rag_query: string | null;
  use_project_rag: number;
  skill_ids: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  output: string | null;
  tokens_used: number;
  duration_seconds: number;
  started_at: string | null;
  completed_at: string | null;
  human_feedback: string | null;
  created_at: string;
}

export interface TaskTemplate {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
  category: 'documentation' | 'business' | 'development' | 'research' | 'content';
  steps_config: string | null;
  required_agents: string | null;
  times_used: number;
  created_at: string;
}
```

---

## 4. Phase 4: API CRUD (Tasks, Steps, Templates)

### 13 endpoints creados

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/api/tasks` | Lista tareas con filtro por status. Enriched: steps_count, steps_completed, agents, project_names |
| POST | `/api/tasks` | Crea tarea (name, description, expected_output). Status inicial 'draft' |
| GET | `/api/tasks/{id}` | Detalle de tarea con todos sus pasos |
| PATCH | `/api/tasks/{id}` | Actualiza campos (dynamic SQL SET) |
| DELETE | `/api/tasks/{id}` | Elimina tarea (CASCADE a pasos) |
| GET | `/api/tasks/{id}/steps` | Lista pasos ordenados por order_index |
| POST | `/api/tasks/{id}/steps` | Crea paso. Max 10 por tarea. Auto-reorder si se inserta en medio |
| PATCH | `/api/tasks/{id}/steps/{stepId}` | Edita un paso (dynamic SQL SET) |
| DELETE | `/api/tasks/{id}/steps/{stepId}` | Elimina paso y reordena restantes |
| POST | `/api/tasks/{id}/steps/reorder` | Reordena pasos (array de IDs, transaction atomica) |
| GET | `/api/tasks/templates` | Lista templates ordenados por times_used DESC |
| POST | `/api/tasks/from-template` | Crea tarea desde template con pasos pre-configurados |

### Patrones clave

**Dynamic SQL SET para PATCH:**
```typescript
const allowedFields = ['name', 'description', 'expected_output', 'linked_projects', 'status'];
const updates: string[] = [];
const values: unknown[] = [];
for (const field of allowedFields) {
  if (body[field] !== undefined) {
    updates.push(`${field} = ?`);
    values.push(body[field]);
  }
}
```

**Transaction-based reorder:**
```typescript
const reorder = db.transaction((stepIds: string[]) => {
  for (let i = 0; i < stepIds.length; i++) {
    db.prepare('UPDATE task_steps SET order_index = ? WHERE id = ? AND task_id = ?')
      .run(i, stepIds[i], taskId);
  }
});
reorder(step_ids);
```

---

## 5. Phase 5: Pipeline Execution Engine

### Archivo principal: `app/src/lib/services/task-executor.ts`

Motor de ejecucion secuencial de pipelines con:

#### Funciones exportadas

| Funcion | Proposito |
|---------|-----------|
| `executeTask(taskId)` | Ejecuta todos los pasos secuencialmente (fire-and-forget) |
| `cancelTask(taskId)` | Marca cancel flag en memoria, marca task/steps como failed |
| `retryTask(taskId)` | Resetea pasos fallidos a pending, re-ejecuta |
| `resumeAfterCheckpoint(taskId, stepId)` | Aprueba checkpoint, continua pipeline |
| `rejectCheckpoint(taskId, stepId, feedback)` | Re-ejecuta paso anterior con feedback inyectado |

#### Flujo de ejecucion por tipo de paso

**Paso Agent:**
```
1. Construye contexto segun context_mode:
   - previous: output del paso anterior
   - all: concatenacion de todos los outputs
   - manual: context_manual del usuario
2. Si use_project_rag=1: busca en RAG de proyectos vinculados
   - ollama.getEmbedding(query) → vector
   - qdrant.search(collection, vector, 5) → chunks
   - Anade chunks al contexto
3. Carga skills del paso (skill_ids JSON → fetch skills table)
4. Construye prompt:
   - System: "Eres {agent_name}. {skills_instructions}"
   - User: "{instructions}\n\nCONTEXTO:\n{context}\n\nRAG:\n{rag_chunks}\n\nRESULTADO ESPERADO:\n{expected_output}\n\nFEEDBACK:\n{feedback}"
5. Llama a LiteLLM directamente via fetch (no llm.ts)
6. Guarda output, tokens, duration en DB
```

**Paso Checkpoint:**
```
1. Marca step como 'running', task como 'paused'
2. RETORNA de la funcion (no sigue ejecutando)
3. Espera approve/reject via endpoints
```

**Paso Merge:**
```
1. Recopila outputs de TODOS los pasos anteriores
2. Llama a LiteLLM: "Sintetiza estos outputs en un documento unificado"
3. Guarda output
```

#### Mecanismo de cancelacion

```typescript
const cancelFlags = new Map<string, { cancelled: boolean }>();

// Al ejecutar: checkea flag antes de cada paso
if (flag?.cancelled) { markTaskFailed(taskId); return; }

// Al cancelar: setea flag + marca en DB
cancelFlags.set(taskId, { cancelled: true });
```

#### Endpoints de ejecucion

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | `/api/tasks/{id}/execute` | Lanza ejecucion (fire-and-forget) |
| GET | `/api/tasks/{id}/status` | Status + pasos con output truncado a 500 chars |
| POST | `/api/tasks/{id}/cancel` | Cancela tarea en ejecucion |
| POST | `/api/tasks/{id}/retry` | Re-ejecuta desde paso fallido |
| POST | `/api/tasks/{id}/steps/{stepId}/approve` | Aprueba checkpoint |
| POST | `/api/tasks/{id}/steps/{stepId}/reject` | Rechaza con feedback |

#### LLM via LiteLLM directo

```typescript
const litellmUrl = process['env']['LITELLM_URL'] || 'http://192.168.1.49:4000';
const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';

const response = await fetch(`${litellmUrl}/v1/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${litellmKey}`,
  },
  body: JSON.stringify({
    model: stepModel || 'gemini-main',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 4096,
  }),
});
```

---

## 6. Phase 6: Tasks List Page + Sidebar

### Sidebar actualizado

Archivo: `app/src/components/layout/sidebar.tsx`

```typescript
const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Proyectos', icon: FolderKanban },
  { href: '/agents', label: 'Agentes', icon: Bot },
  { href: '/workers', label: 'Docs Workers', icon: FileOutput },
  { href: '/skills', label: 'Skills', icon: Sparkles },
  { href: '/tasks', label: 'Tareas', icon: ClipboardList },  // ← NUEVO
  { href: '/settings', label: 'Configuracion', icon: Settings },
  { href: '/system', label: 'Estado del Sistema', icon: Activity },
];
```

### Pagina /tasks

Archivo: `app/src/app/tasks/page.tsx`

#### Colores de status

```typescript
const STATUS_CONFIG = {
  draft:       { label: 'Borrador',      badgeClass: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
  configuring: { label: 'Configurando',  badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  ready:       { label: 'Listo',         badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  running:     { label: 'Ejecutando',    badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20 animate-pulse' },
  paused:      { label: 'Pausado',       badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  completed:   { label: 'Completado',    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  failed:      { label: 'Fallido',       badgeClass: 'bg-red-500/10 text-red-400 border-red-500/20' },
};
```

#### Filtros

- **Todas**: Todas las tareas
- **En curso**: status in [running, paused, configuring, ready]
- **Completadas**: status === 'completed'
- **Borradores**: status === 'draft'

Cada filtro muestra conteo: `Todas (5) | En curso (2) | Completadas (1) | Borradores (2)`

#### Task cards (grid 3 columnas)

Cada card muestra:
- Nombre de la tarea (link a `/tasks/{id}`)
- Status badge con color
- Descripcion truncada (2 lineas)
- Barra de progreso: "{steps_completed}/{steps_count} pasos" con barra visual
- Agentes involucrados como badges
- Proyectos vinculados + fecha relativa ("hace 5 min")

#### Seccion de templates

Al final de la pagina, 3 cards de templates con:
- Emoji grande
- Nombre y descripcion
- Conteo de pasos
- Boton "Usar" → `/tasks/new?template={id}`

#### Estado vacio

```
[ClipboardList icon grande]
No hay tareas
Crea tu primera tarea para comenzar a procesar documentos con pipelines multi-agente.
[+ Crear primera tarea]
```

---

## 7. Phase 7: Task Creation Wizard

### Pagina /tasks/new

Archivo: `app/src/app/tasks/new/page.tsx` (~1028 lineas)

### Stepper visual de 4 pasos

```
(1) Objetivo → (2) Proyectos → (3) Pipeline → (4) Revisar
```

- Paso activo: circulo violeta con numero blanco
- Paso completado: circulo emerald con checkmark
- Paso futuro: circulo zinc con numero
- Lineas de conexion entre circulos

### Paso 1: Objetivo

- Nombre de la tarea (obligatorio, borde rojo si vacio)
- Descripcion (opcional, textarea)
- Resultado esperado (opcional, textarea)

### Paso 2: Proyectos

- Lista de proyectos con checkbox
- Estado RAG de cada proyecto:
  - "1,234 vectores" (emerald) si indexado
  - "No indexado" (amber) si RAG habilitado pero sin vectores
  - "RAG deshabilitado" (zinc) si rag_enabled=0
- Fetch lazy de RAG info cuando el paso se renderiza

### Paso 3: Pipeline (drag-and-drop)

Integra @dnd-kit para reordenar pasos arrastrando.

#### Agregar pasos

Boton "+" entre cada paso y al final. Al clickear, dropdown con 3 opciones:
- Paso de agente (Bot icon)
- Checkpoint (ShieldCheck icon)
- Sintesis (GitMerge icon)

Maximo 10 pasos (se ocultan botones "+" al llegar al limite).

#### Editor de paso agente (expandible)

```
Agente: [Select con agentes de /api/agents — emoji + nombre]
Modelo (override): [Input, placeholder "Usa el del agente"]
Instrucciones: [Textarea, monospace, 5 filas]
Contexto: (•) Paso anterior  ( ) Todo el pipeline  ( ) Manual
           [Si manual: textarea adicional]
☐ Usar RAG de proyectos vinculados
Skills: [Checkboxes de /api/skills — nombre + categoria]
```

#### Paso checkpoint/merge expandido

Solo campo nombre editable (defaults: "Revision humana" / "Sintesis final")

### Paso 4: Revisar

Resumen completo:
- Nombre, descripcion, resultado esperado
- Proyectos vinculados
- Pipeline visual con cada paso listado

Dos botones de accion:
- **"Guardar borrador"** (outline): POST task → POST steps → PATCH linked_projects → navega a `/tasks/{id}`
- **"Lanzar tarea"** (violeta): Lo mismo + POST execute

### Template pre-fill (WIZ-06)

Si la URL tiene `?template=templateId`:
- Carga el template
- Parsea steps_config JSON
- Pre-rellena pipelineSteps con UUIDs generados
- Pre-rellena nombre con template.name
- Toast: "Plantilla cargada: {nombre}"

### @dnd-kit integracion

```typescript
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sensor con 8px de distancia para evitar activaciones accidentales
const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
```

---

## 8. Phase 8: Execution View + Real-time Monitoring

### Pagina /tasks/{id}

Archivo: `app/src/app/tasks/[id]/page.tsx` (~780 lineas)

### Pipeline visual vertical

Cada paso como card con:
- Icono de tipo (Bot/ShieldCheck/GitMerge)
- Nombre del paso
- Agente + modelo (si aplica)
- Status badge con color animado
- Preview de output (max 200px con gradient fade)
- Boton "Ver completo" → Dialog con markdown completo

### Conexiones entre pasos

Linea vertical (w-0.5 h-8) entre cada card:
- Emerald si ambos pasos adyacentes estan completados
- Zinc si alguno esta pendiente

### Paso activo (running)

- Borde izquierdo violeta (border-l-2 border-violet-500)
- Spinner Loader2 junto al status badge
- animate-pulse en el badge

### Checkpoint UI

Cuando un paso checkpoint esta 'running' (tarea pausada):
- Muestra output del paso anterior renderizado en markdown
- Boton "Aprobar y continuar" (emerald)
- Textarea para feedback + boton "Rechazar y re-ejecutar" (amber/red)

```typescript
// Aprobar
const handleApprove = async (stepId: string) => {
  await fetch(`/api/tasks/${taskId}/steps/${stepId}/approve`, { method: 'POST' });
  toast.success('Checkpoint aprobado');
};

// Rechazar
const handleReject = async (stepId: string) => {
  await fetch(`/api/tasks/${taskId}/steps/${stepId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ feedback }),
  });
  toast.success('Paso rechazado, re-ejecutando con feedback');
};
```

### Polling cada 2 segundos

```typescript
useEffect(() => {
  if (!task || !['running', 'paused'].includes(task.status)) return;

  const interval = setInterval(async () => {
    const res = await fetch(`/api/tasks/${task.id}/status`);
    const data = await res.json();
    // Merge status into task state
    setTask(prev => ({ ...prev, status: data.status, steps: mergedSteps }));

    // Si transiciono a completed, re-fetch datos completos
    if (data.status === 'completed' || data.status === 'failed') {
      clearInterval(interval);
      fetchFullTask();
    }
  }, 2000);

  intervalRef.current = interval;
  return () => clearInterval(interval);
}, [task?.status]);
```

### Barra de progreso (sticky bottom)

Visible cuando la tarea esta running o paused:

```
Paso 3/5  ████████████░░░░ 60%   ⏱ 45s  🔤 1.2k tokens
```

- Porcentaje basado en pasos completados
- Tiempo transcurrido formateado (Xs o Xm Ys)
- Tokens formateados (1234 → "1.2k")

### Vista de completado

Cuando task.status === 'completed':
- Resultado final renderizado en markdown (react-markdown + remark-gfm)
- Clases: `prose prose-invert prose-sm max-w-none`
- 3 botones:
  - **Descargar .md**: Crea Blob y descarga como archivo
  - **Copiar**: navigator.clipboard.writeText
  - **Re-ejecutar**: POST /execute → reload

### Pipeline completado (pasos expandibles)

Cuando la tarea esta completada, todos los pasos aparecen colapsados.
Click en cualquier paso lo expande para ver su output individual en markdown.

---

## 9. Bug fix: crypto.randomUUID en HTTP

### Problema

`crypto.randomUUID()` solo funciona en contextos seguros (HTTPS o localhost). La app Docker corre en HTTP en `192.168.1.49:3500`, causando `TypeError: crypto.randomUUID is not a function`.

### Solucion

Reemplazo de `crypto.randomUUID()` con un generador de UUID v4 manual:

```typescript
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
```

Archivo afectado: `app/src/app/tasks/new/page.tsx` (2 ocurrencias reemplazadas)

---

## 10. Archivos nuevos y modificados

### Archivos nuevos (codigo)

| Archivo | Descripcion |
|---------|-------------|
| `app/src/app/api/tasks/route.ts` | GET (lista enriched) + POST (crear tarea) |
| `app/src/app/api/tasks/[id]/route.ts` | GET (detalle) + PATCH (update) + DELETE |
| `app/src/app/api/tasks/[id]/steps/route.ts` | GET (lista pasos) + POST (crear paso, max 10) |
| `app/src/app/api/tasks/[id]/steps/[stepId]/route.ts` | PATCH (editar) + DELETE (eliminar + reorder) |
| `app/src/app/api/tasks/[id]/steps/reorder/route.ts` | POST (reorder atomico via transaction) |
| `app/src/app/api/tasks/templates/route.ts` | GET (lista templates) |
| `app/src/app/api/tasks/from-template/route.ts` | POST (crear tarea desde template) |
| `app/src/app/api/tasks/[id]/execute/route.ts` | POST (lanzar ejecucion) |
| `app/src/app/api/tasks/[id]/status/route.ts` | GET (status + pasos truncados) |
| `app/src/app/api/tasks/[id]/cancel/route.ts` | POST (cancelar) |
| `app/src/app/api/tasks/[id]/retry/route.ts` | POST (reintentar) |
| `app/src/app/api/tasks/[id]/steps/[stepId]/approve/route.ts` | POST (aprobar checkpoint) |
| `app/src/app/api/tasks/[id]/steps/[stepId]/reject/route.ts` | POST (rechazar con feedback) |
| `app/src/lib/services/task-executor.ts` | Motor de ejecucion de pipelines |
| `app/src/app/tasks/page.tsx` | Pagina de listado con cards, filtros, templates |
| `app/src/app/tasks/new/page.tsx` | Wizard de creacion con dnd-kit (~1028 lineas) |
| `app/src/app/tasks/[id]/page.tsx` | Vista de ejecucion en tiempo real (~780 lineas) |

### Archivos modificados (codigo)

| Archivo | Cambios |
|---------|---------|
| `app/src/lib/db.ts` | +3 tablas (tasks, task_steps, task_templates) + seed de 3 templates |
| `app/src/lib/types.ts` | +3 interfaces (Task, TaskStep, TaskTemplate) |
| `app/src/components/layout/sidebar.tsx` | +ClipboardList import, +Tareas nav item |

---

## 11. Commits de la sesion

| Commit | Descripcion |
|--------|-------------|
| `e8bd5a6` | docs: initialize milestone v2.0 (6 phases, 48 requirements) |
| `4002067` | docs(phase-3): plan data model + templates seed |
| `56d67d9` | feat(03-01): create tasks, task_steps, task_templates tables |
| `c3b1811` | feat(03-01): seed 3 default task templates |
| `816d5cf` | feat(03-01): add Task, TaskStep, TaskTemplate interfaces |
| `a8e1ead` | docs(03-01): complete data model plan |
| `a57723e` | docs(phase-4): plan API CRUD |
| `7de515e` | feat(04-01): add GET/POST /api/tasks |
| `e78c8bb` | feat(04-01): add GET/PATCH/DELETE /api/tasks/{id} |
| `e559f95` | feat(04-01): add GET/POST /api/tasks/{id}/steps |
| `89b834c` | feat(04-01): add PATCH/DELETE /api/tasks/{id}/steps/{stepId} |
| `39e0cc9` | feat(04-01): add POST /api/tasks/{id}/steps/reorder |
| `502e55c` | feat(04-01): add GET /api/tasks/templates |
| `ac1545b` | feat(04-01): add POST /api/tasks/from-template |
| `ef8a6f6` | docs(04-01): complete CRUD plan |
| `b566a3c` | docs(phase-5): plan pipeline execution engine |
| `12d6600` | feat(05-01): create task-executor.ts core engine |
| `dad7db6` | feat(05-01): add POST /execute and GET /status |
| `3e864e2` | feat(05-01): add POST /cancel and POST /retry |
| `f5874b1` | feat(05-01): add POST /approve and POST /reject |
| `ee58881` | fix(05-01): remove unused linkedProjects param |
| `a023e91` | docs(05-01): complete execution engine plan |
| `10fe068` | feat(06-01): add Tareas entry to sidebar |
| `e99759c` | feat(06-01): create /tasks page with cards, filters, templates |
| `666b910` | docs(06-01): complete tasks list plan |
| `e839804` | feat(07-01): create /tasks/new 4-step wizard with dnd-kit |
| `45897d7` | fix(07-01): fix Select onValueChange type compatibility |
| `f04bae6` | docs(07-01): complete wizard plan |
| `e93a18b` | feat(08-01): create /tasks/{id} execution view |
| `8094503` | docs(08-01): complete execution view plan |

---

## 12. Deploy y verificacion

### Build local

```bash
cd ~/docflow/app && npm run build
```

Resultado: Build exitoso sin errores.

### Deploy Docker

```bash
docker compose build --no-cache && docker compose up -d && \
docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && \
docker restart docflow-app
```

### Tests E2E para verificacion humana

#### Test 1: Navegacion
1. Verificar que "Tareas" aparece en el sidebar entre Skills y Configuracion
2. Click → navega a `/tasks`
3. Verificar que la pagina muestra las 3 plantillas seed

#### Test 2: Crear tarea desde plantilla
1. En `/tasks`, click "Usar" en la plantilla "Documentacion tecnica completa"
2. Verificar que el wizard abre con los pasos pre-cargados
3. Verificar toast "Plantilla cargada"
4. Rellenar nombre, click "Siguiente" por los 4 pasos
5. Click "Guardar borrador"
6. Verificar que redirige a `/tasks/{id}`

#### Test 3: Crear tarea manual con drag-and-drop
1. Click "Nueva tarea" → `/tasks/new`
2. Paso 1: rellenar nombre, click Siguiente
3. Paso 2: seleccionar un proyecto, click Siguiente
4. Paso 3: agregar 3 pasos (agente, checkpoint, agente)
5. Configurar cada paso agente con agente, instrucciones, contexto
6. Arrastrar pasos para reordenar
7. Click Siguiente → Revisar → "Lanzar tarea"

#### Test 4: Ejecucion y monitoreo
1. Lanzar una tarea con al menos 2 agentes y 1 checkpoint
2. Verificar que la pagina `/tasks/{id}` muestra el pipeline vertical
3. Verificar que los pasos se actualizan cada 2 segundos
4. Verificar barra de progreso (sticky bottom)
5. Cuando llega al checkpoint: verificar que muestra output anterior + botones aprobar/rechazar
6. Aprobar → verificar que el pipeline continua
7. Al completar: verificar resultado en markdown, botones descargar/copiar/re-ejecutar

#### Test 5: Cancelar/Reintentar
1. Lanzar una tarea
2. Click "Cancelar" → verificar que se marca como fallida
3. Click "Re-ejecutar" → verificar que reinicia
