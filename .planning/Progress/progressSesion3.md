# DocFlow - Sesion 3: Seleccion Granular de Fuentes, Historial de Versiones, Docs Workers y Skills

> Funcionalidades implementadas sobre la base documentada en `progressWebapp.md` y `progressSesion2.md`. Esta sesion agrega seleccion granular de fuentes (3 estados), gestion completa de historial de versiones, sistema de Docs Workers especializados, y un pipeline de Skills reutilizables con import/export y escaneo OpenClaw.

---

## Indice

1. [Resumen de cambios](#1-resumen-de-cambios)
2. [Seleccion granular de fuentes (TAREA 1)](#2-seleccion-granular-de-fuentes)
3. [Historial de versiones (TAREA 2)](#3-historial-de-versiones)
4. [Docs Workers (TAREA 3 y 4)](#4-docs-workers)
5. [Skills — Modelo, CRUD y biblioteca (TAREA 5)](#5-skills--modelo-crud-y-biblioteca)
6. [Integracion de Skills en procesamiento (TAREA 6)](#6-integracion-de-skills-en-procesamiento)
7. [Import OpenClaw + JSON export/import (TAREA 7)](#7-import-openclaw--json-exportimport)
8. [Cambios en base de datos](#8-cambios-en-base-de-datos)
9. [Correccion de rutas de modelos LiteLLM](#9-correccion-de-rutas-de-modelos-litellm)
10. [Bugs resueltos](#10-bugs-resueltos)
11. [Archivos nuevos y modificados](#11-archivos-nuevos-y-modificados)
12. [Sidebar actualizado](#12-sidebar-actualizado)
13. [Verificacion y build](#13-verificacion-y-build)

---

## 1. Resumen de cambios

### Funcionalidades nuevas
- **Seleccion granular de fuentes** con 3 estados: procesar con IA, contexto directo, excluir
- **Historial de versiones expandible** con stats, eliminacion individual, limpieza masiva
- **Docs Workers** — agentes especializados con system prompt fijo, formato de output y plantilla
- **3 workers de serie** (Vision de Producto, Generador PRD, Resumidor Ejecutivo)
- **Pagina /workers** con tabla, editor Sheet lateral, generacion con IA, duplicado
- **Skills** — paquetes de instrucciones reutilizables inyectados en el prompt
- **5 skills de serie** (Diataxis, Mermaid, DAFO, Redaccion Ejecutiva, Tests Unitarios)
- **Pagina /skills** con grid de tarjetas, filtros por categoria, busqueda, editor Sheet
- **Inyeccion de skills en pipeline** — se inyectan como bloque `--- SKILLS ACTIVOS ---` en el system prompt
- **Import desde OpenClaw** — escaneo de workspaces, extraccion de SOUL.md + AGENTS.md
- **Import/Export JSON** — exportar skill individual como .json, importar uno o multiples
- **Selector de skills en ProcessPanel** — chips toggle entre fuentes e instrucciones
- **Badges de skills en VersionHistory** — icono + conteo en fila colapsada, nombres en detalle

### Cambios en DB
- Nueva columna `process_mode` en `sources` (valores: 'process', 'direct', 'exclude')
- Nueva tabla `docs_workers` con 3 workers seed
- Nueva columna `worker_id` en `processing_runs`
- Nueva tabla `skills` con 5 skills seed
- Nuevas tablas `worker_skills` y `agent_skills` (muchos-a-muchos)
- Nueva columna `skill_ids` en `processing_runs` (JSON array)

---

## 2. Seleccion granular de fuentes

### 2.1 Concepto

Antes, todas las fuentes se procesaban con IA. Ahora cada fuente tiene 3 estados:

| Estado | Icono | Color | Comportamiento |
|--------|-------|-------|----------------|
| `process` | Cpu | Violeta | Se envia al LLM como contenido a analizar |
| `direct` | BookOpen | Esmeralda | Se anexa al output sin pasar por el LLM |
| `exclude` | EyeOff | Gris | Se ignora completamente |

### 2.2 Columna en DB

```sql
ALTER TABLE sources ADD COLUMN process_mode TEXT DEFAULT 'process'
```

Migrada de forma idempotente con try-catch en `db.ts`.

### 2.3 API de actualizacion

**PATCH `/api/projects/[id]/sources/[sid]`** — Acepta `process_mode` en el body:

```typescript
const { name, description, process_mode } = body;
if (process_mode !== undefined && ['process', 'direct', 'exclude'].includes(process_mode)) {
  updates.push('process_mode = ?');
  values.push(process_mode);
}
```

### 2.4 ProcessPanel UI

Archivo: `src/components/process/process-panel.tsx`

- **Estado local**: `sourceModes: Record<string, 'process' | 'direct' | 'exclude'>`
- **3 botones por fuente**: Cpu / BookOpen / EyeOff, cada uno togglea el modo
- **Batch actions**: "Todas IA", "Todas directo", "Excluir todas"
- **Contador visual**: "3 procesadas por IA · 2 como contexto directo · 1 excluidas"
- **Persistencia**: Cada cambio se envia al backend via PATCH (fire-and-forget)

### 2.5 Procesamiento diferenciado

En `process/route.ts`, el body ahora envia:

```typescript
{
  processedSources: string[],  // IDs con mode='process'
  directSources: string[],     // IDs con mode='direct'
  sourceIds: string[],         // Union (legacy compat)
}
```

El procesamiento local:
1. **Sources con mode `process`** → se concatenan y se envian al LLM
2. **Sources con mode `direct`** → se leen y se agregan al output final como "Anexos — Documentacion de referencia" sin pasar por el LLM
3. **Sources con mode `exclude`** → se ignoran

```typescript
// Solo si hay contenido para IA
if (sourcesContent.trim()) {
  // Llamada al LLM con sourcesContent
}

// Anexar directos al final
if (directContentParts.length > 0) {
  generatedContent += '\n\n---\n\n## Anexos — Documentacion de referencia\n';
  for (const part of directContentParts) {
    generatedContent += `\n---\n\n### ${part.name}\n\n${part.content}\n`;
  }
}
```

### 2.6 Formato de input_sources en processing_runs

Nuevo formato JSON almacenado en `input_sources`:

```json
{ "processed": ["id1", "id2"], "direct": ["id3"] }
```

El endpoint de history maneja ambos formatos (viejo `string[]` y nuevo `{ processed, direct }`).

---

## 3. Historial de versiones

### 3.1 Componente reescrito

Archivo: `src/components/process/version-history.tsx`

Reescritura completa del componente con estas secciones:

#### Header con stats
- Contador de versiones
- Uso total de disco (con icono HardDrive)
- Ruta del directorio processed
- Boton "Limpiar antiguas" si hay > 1 version

#### Filas compactas expandibles
Cada version muestra en la fila colapsada:
- Badge `v{N}` con estilo monospace
- Icono de estado (CheckCircle2 verde / XCircle rojo / Loader2 amarillo)
- Nombre del procesador (agente o worker con emoji)
- Badge "Worker" (azul) si fue procesado por un worker
- Badge de skills (icono Sparkles + conteo) si se usaron skills
- Tiempo relativo (hace 5m, hace 2h, etc.)
- Tamano del archivo
- Boton eliminar

Al expandir (solo versiones completadas):
- Detalle con ruta del archivo, fuentes usadas, instrucciones, skills usados, duracion, tokens
- Preview del documento (primeros 500 chars con fade gradient)
- Botones: "Ver documento" (dialog fullscreen) y "Descargar .md"

### 3.2 Endpoints

**GET `/api/projects/[id]/process/history`**

Retorna runs enriquecidos con:
- `file_size`: tamano del output.md en disco
- `file_path`: ruta completa al archivo
- `source_names`: nombres de las fuentes usadas
- `duration_seconds`: calculado de timestamps si no esta almacenado
- `total_disk_size`: uso total de la carpeta processed/
- `processed_path`: ruta del directorio

**DELETE `/api/projects/[id]/process/[vid]`**

Elimina una version individual:
1. Borra archivos de disco
2. Elimina registro en DB
3. Actualiza `current_version` si se elimino la mas reciente
4. Retorna `freed_bytes`

**DELETE `/api/projects/[id]/process/clean?keep=N`**

Limpieza masiva:
1. Mantiene las N versiones mas recientes
2. Elimina archivos y registros del resto
3. Retorna `deleted_count` y `freed_bytes`

### 3.3 Dialog de preview mejorado

Ancho maximo 95vw, altura 90vh, con prose classes de Tailwind para dark mode:

```
prose-invert prose-violet prose-headings:text-zinc-100 prose-headings:border-b
prose-headings:border-zinc-800 prose-p:text-zinc-300 prose-code:text-violet-300
prose-code:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800
```

---

## 4. Docs Workers

### 4.1 Concepto

Un Docs Worker es un agente especializado con:
- **System prompt fijo**: instrucciones detalladas sobre como procesar
- **Formato de output**: md, json, yaml o html
- **Plantilla de output**: esqueleto que el worker rellena
- **Modelo fijo**: cada worker puede usar un modelo diferente

### 4.2 Tabla docs_workers

```sql
CREATE TABLE IF NOT EXISTS docs_workers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  emoji TEXT DEFAULT '📄',
  model TEXT DEFAULT 'gemini-main',
  system_prompt TEXT,
  output_format TEXT DEFAULT 'md',
  output_template TEXT,
  example_input TEXT,
  example_output TEXT,
  times_used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 4.3 Workers seed (3 por defecto)

| ID | Nombre | Formato | Descripcion |
|----|--------|---------|-------------|
| `vision-product` | Generador de Vision de Producto | md | Documento con 10 secciones estandarizadas |
| `prd-generator` | Generador PRD | json | Product Requirements con user stories atomicas |
| `executive-summary` | Resumidor Ejecutivo | md | Resumen de max 2 paginas con bullets |

Cada uno incluye system_prompt detallado (200+ palabras), output_template y ejemplo.

### 4.4 Endpoints CRUD

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/api/workers` | Lista todos (order by times_used DESC) |
| POST | `/api/workers` | Crear worker |
| GET | `/api/workers/[id]` | Obtener uno |
| PATCH | `/api/workers/[id]` | Actualizar campos permitidos |
| DELETE | `/api/workers/[id]` | Eliminar |
| POST | `/api/workers/generate` | Generar config con IA |

**POST `/api/workers/generate`** — Envia nombre, descripcion y formato al LLM, que genera:
- `system_prompt`: instrucciones detalladas
- `output_template`: plantilla del formato
- `example_input` / `example_output`: ejemplos

### 4.5 Pagina /workers

Archivo: `src/app/workers/page.tsx`

- **Tabla** con columnas: Worker (emoji + nombre), Formato (badge coloreado), Modelo, Descripcion, Usos, Acciones
- **Sheet editor** (600px lateral) con 5 secciones:
  1. Identidad (emoji + nombre + descripcion)
  2. Configuracion (formato + modelo con SelectGroup)
  3. Instrucciones (system prompt con boton "Generar con IA")
  4. Plantilla de output (collapsible)
  5. Ejemplos (collapsible)
- **Duplicar**: crea copia con "(copia)" en el nombre
- **Eliminar**: dialogo de confirmacion

Colores por formato:
```typescript
const FORMAT_COLORS = {
  md: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  json: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  yaml: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  html: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};
```

### 4.6 Integracion en pipeline

En `process-panel.tsx`:
- **Selector de modo**: 2 cards clickeables (Agente IA / Docs Worker)
- **Lista de workers**: cuando mode='worker', muestra lista scrolleable con seleccion
- **Worker seleccionado**: su emoji, nombre, descripcion y badge de formato

En `process/route.ts`:
- Si `mode === 'worker'` y `worker_id`, carga el worker de DB
- Usa el `system_prompt` del worker como base
- Agrega `output_template` al prompt si existe
- Agrega contexto del proyecto (nombre, finalidad, stack)
- Agrega instrucciones adicionales del usuario
- Al completar, incrementa `times_used` del worker

```typescript
type WorkerRow = { id: string; name: string; system_prompt: string | null;
                   output_format: string; output_template: string | null; model: string };
let worker: WorkerRow | null = null;
if (mode === 'worker' && worker_id) {
  worker = db.prepare('SELECT * FROM docs_workers WHERE id = ?')
    .get(worker_id) as WorkerRow | undefined ?? null;
}
```

---

## 5. Skills — Modelo, CRUD y biblioteca

### 5.1 Concepto

Un Skill es un paquete de instrucciones reutilizable que se inyecta en el prompt del agente o worker para modificar su comportamiento. A diferencia de un worker (que reemplaza el prompt completo), un skill se suma al prompt existente.

### 5.2 Tabla skills

```sql
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'documentation',
  tags TEXT,                    -- JSON array de strings
  instructions TEXT NOT NULL,   -- Texto que se inyecta en el prompt
  output_template TEXT,
  example_input TEXT,
  example_output TEXT,
  constraints TEXT,             -- Restricciones obligatorias
  source TEXT DEFAULT 'built-in',  -- 'built-in' | 'user' | 'openclaw' | 'imported'
  source_path TEXT,
  version TEXT DEFAULT '1.0',
  author TEXT,
  times_used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 5.3 Tablas de relacion

```sql
CREATE TABLE IF NOT EXISTS worker_skills (
  worker_id TEXT NOT NULL REFERENCES docs_workers(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (worker_id, skill_id)
);

CREATE TABLE IF NOT EXISTS agent_skills (
  agent_id TEXT NOT NULL REFERENCES custom_agents(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, skill_id)
);
```

### 5.4 Columna skill_ids en processing_runs

```sql
ALTER TABLE processing_runs ADD COLUMN skill_ids TEXT
-- Almacena JSON array de IDs de skills usados: '["skill-id-1", "skill-id-2"]'
```

### 5.5 Interface TypeScript

```typescript
export interface Skill {
  id: string;
  name: string;
  description: string | null;
  category: 'documentation' | 'analysis' | 'communication' | 'code' | 'design' | 'format';
  tags: string | null;           // JSON array
  instructions: string;
  output_template: string | null;
  example_input: string | null;
  example_output: string | null;
  constraints: string | null;
  source: 'built-in' | 'user' | 'openclaw' | 'imported';
  source_path: string | null;
  version: string;
  author: string | null;
  times_used: number;
  created_at: string;
  updated_at: string;
}
```

### 5.6 Skills seed (5 por defecto)

| ID | Nombre | Categoria | Descripcion |
|----|--------|-----------|-------------|
| `formato-diataxis` | Formato Diataxis | format | Reestructura segun framework Diataxis (tutoriales, guias, explicacion, referencia) |
| `diagramas-mermaid` | Diagramas Mermaid | design | Genera diagramas flowchart, sequence, ER, state |
| `analisis-dafo` | Analisis DAFO | analysis | SWOT completo con estrategias cruzadas |
| `redaccion-ejecutiva` | Redaccion ejecutiva | communication | Transforma docs tecnicos en comunicacion para stakeholders |
| `tests-unitarios` | Tests unitarios | code | Genera tests a partir de specs/APIs |

Cada skill incluye:
- `instructions`: 150-300 palabras con reglas detalladas
- `output_template`: plantilla del formato esperado
- `example_input` / `example_output`: ejemplos concretos
- `constraints`: restricciones obligatorias
- `tags`: array JSON de etiquetas

### 5.7 Endpoints API

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/api/skills` | Lista con filtros `?category=X&search=Y` |
| POST | `/api/skills` | Crear skill |
| GET | `/api/skills/[id]` | Obtener uno |
| PATCH | `/api/skills/[id]` | Actualizar |
| DELETE | `/api/skills/[id]` | Eliminar (limpia relaciones worker_skills/agent_skills) |
| POST | `/api/skills/generate` | Generar instrucciones con IA |
| POST | `/api/skills/import` | Importar batch de skills (JSON) |
| GET | `/api/skills/openclaw` | Escanear workspaces OpenClaw |

**GET `/api/skills`** — Soporta filtrado:
```typescript
if (category) { conditions.push('category = ?'); }
if (search) { conditions.push('(name LIKE ? OR description LIKE ? OR tags LIKE ?)'); }
```

**POST `/api/skills/generate`** — Genera via LLM:
- Recibe: name, description, category, model
- Retorna: instructions, output_template, example_input, example_output, constraints, tags

**POST `/api/skills/import`** — Importacion masiva:
- Recibe: `{ skills: [...] }` (array de objetos skill)
- Genera UUID para cada uno, marca `source: 'imported'`
- Retorna: `{ success: true, imported: N, ids: [...] }`

### 5.8 Pagina /skills

Archivo: `src/app/skills/page.tsx`

#### Layout de grid con tarjetas
- 3 columnas en desktop, 2 en tablet, 1 en movil
- Cada tarjeta muestra: nombre, descripcion (2 lineas), badge de categoria (coloreado), tags (max 4), source + version + usos
- Acciones hover: editar, duplicar, exportar JSON, eliminar

#### Filtros
- **Busqueda**: Input con icono Search y boton X para limpiar
- **Categorias**: Botones toggle (Todos, Documentacion, Analisis, Comunicacion, Codigo, Diseno, Formato)

#### Colores por categoria
```typescript
const CATEGORY_CONFIG = {
  documentation: { label: 'Documentacion', color: 'bg-violet-500/10 text-violet-400 ...' },
  analysis:      { label: 'Analisis',      color: 'bg-blue-500/10 text-blue-400 ...' },
  communication: { label: 'Comunicacion',  color: 'bg-emerald-500/10 text-emerald-400 ...' },
  code:          { label: 'Codigo',        color: 'bg-amber-500/10 text-amber-400 ...' },
  design:        { label: 'Diseno',        color: 'bg-pink-500/10 text-pink-400 ...' },
  format:        { label: 'Formato',       color: 'bg-cyan-500/10 text-cyan-400 ...' },
};
```

#### Header con acciones
- **Boton OpenClaw**: Escanea workspaces y abre dialog de seleccion
- **Boton Importar JSON**: File input oculto, acepta .json
- **Boton Crear Skill**: Abre Sheet editor

#### Sheet editor (600px)
Secciones:
1. **Identidad**: Nombre, descripcion, categoria (select), version, tags (comma-separated)
2. **Instrucciones**: Textarea monospace + boton "Generar con IA"
3. **Plantilla de output** (collapsible)
4. **Restricciones** (collapsible)
5. **Ejemplos** (collapsible): input y output
6. **Autor**: Campo de texto

#### Export JSON
Al hacer click en el icono Download de una tarjeta:
```typescript
const exportData = {
  name, description, category, tags: JSON.parse(tags),
  instructions, output_template, example_input, example_output,
  constraints, version, author
};
// Se descarga como skill-{nombre-kebab}.json
```

---

## 6. Integracion de Skills en procesamiento

### 6.1 Selector en ProcessPanel

Archivo: `src/components/process/process-panel.tsx`

Seccion de skills entre fuentes e instrucciones, visible solo si hay skills en la DB:

- **Chips toggle**: Cada skill es un boton que se activa/desactiva
- **Estado activo**: Fondo violeta, borde violeta, icono Sparkles
- **Contador**: "Skills (N seleccionados)" en el header
- **Boton limpiar**: Deselecciona todos

```typescript
const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
// Se envia en el POST:
skill_ids: selectedSkillIds.length > 0 ? selectedSkillIds : undefined
```

### 6.2 Inyeccion en el prompt

Archivo: `src/app/api/projects/[id]/process/route.ts`

Flujo:
1. Se extraen `skill_ids` del body
2. Se cargan los skills de la DB: `SELECT id, name, instructions, output_template, constraints FROM skills WHERE id IN (...)`
3. Se almacenan en el run: `skill_ids TEXT` (JSON array)
4. Se inyectan despues del system prompt base:

```typescript
if (selectedSkills.length > 0) {
  systemPrompt += '\n\n--- SKILLS ACTIVOS ---';
  for (const skill of selectedSkills) {
    systemPrompt += `\n\n### Skill: ${skill.name}\n${skill.instructions}`;
    if (skill.constraints) {
      systemPrompt += `\n\nRestricciones: ${skill.constraints}`;
    }
    if (skill.output_template) {
      systemPrompt += `\n\nPlantilla de referencia del skill:\n${skill.output_template}`;
    }
  }
}
```

5. Al completar con exito, se incrementa `times_used` de cada skill:
```typescript
const updateSkill = db.prepare('UPDATE skills SET times_used = times_used + 1, updated_at = ? WHERE id = ?');
for (const skill of selectedSkills) {
  updateSkill.run(skillNow, skill.id);
}
```

### 6.3 Skills en VersionHistory

Archivo: `src/components/process/version-history.tsx`

- **Fila colapsada**: Si el run tiene `skill_ids`, muestra icono Sparkles + conteo
- **Detalle expandido**: Muestra "Skills: Nombre1, Nombre2" con nombres resueltos via `skillsMap`
- **SkillsMap**: Se construye al cargar desde `/api/skills` → `Record<id, name>`

```typescript
// En fila colapsada
{run.skill_ids && (() => {
  const ids: string[] = JSON.parse(run.skill_ids);
  return (
    <span className="flex items-center gap-1">
      <Sparkles className="w-3 h-3 text-violet-500" />
      <span className="text-[10px] text-violet-400">{ids.length}</span>
    </span>
  );
})()}
```

---

## 7. Import OpenClaw + JSON export/import

### 7.1 Escaneo de OpenClaw

Endpoint: **GET `/api/skills/openclaw`**

Archivo: `src/app/api/skills/openclaw/route.ts`

Flujo:
1. Resuelve ruta OpenClaw: `/app/openclaw` → `OPENCLAW_WORKSPACE_PATH` → `./data/bots`
2. Lista directorios que empiecen con `workspace-`
3. Para cada workspace, lee:
   - `AGENTS.md` — instrucciones operativas
   - `SOUL.md` — personalidad del agente
   - `IDENTITY.md` — metadata (nombre, emoji)
4. Extrae nombre del `IDENTITY.md` (regex `name:\s*(.+)` o heading `# ...`)
5. Retorna array de `{ workspace, name, soul, agents_md, identity }`

### 7.2 Dialog de seleccion OpenClaw

En `/skills` page:
- Boton "OpenClaw" en header → llama a `/api/skills/openclaw`
- Muestra dialog con checkboxes para cada workspace encontrado
- Preview: nombre, ruta del workspace, primeros 150 chars de SOUL.md
- Al importar: combina SOUL.md + AGENTS.md como `instructions`, marca `source: 'openclaw'`

### 7.3 Import JSON

- Boton "Importar JSON" en header → file input oculto acepta `.json`
- Soporta tanto un skill individual como un array de skills
- Llama a `POST /api/skills/import` con el array
- Cada skill se crea con `source: 'imported'` y UUID nuevo

### 7.4 Export JSON

- Icono Download en cada tarjeta de skill
- Genera blob JSON con datos del skill (sin id, times_used, timestamps)
- Descarga como `skill-{nombre-kebab}.json`

---

## 8. Cambios en base de datos

### Resumen de migraciones (todas idempotentes via try-catch)

```sql
-- Sesion 3: Nuevas columnas
ALTER TABLE sources ADD COLUMN process_mode TEXT DEFAULT 'process';
ALTER TABLE processing_runs ADD COLUMN worker_id TEXT;
ALTER TABLE processing_runs ADD COLUMN skill_ids TEXT;

-- Sesion 3: Nuevas tablas
CREATE TABLE IF NOT EXISTS docs_workers (...);
CREATE TABLE IF NOT EXISTS skills (...);
CREATE TABLE IF NOT EXISTS worker_skills (...);
CREATE TABLE IF NOT EXISTS agent_skills (...);
```

### Datos seed

- **3 workers**: vision-product, prd-generator, executive-summary
- **5 skills**: formato-diataxis, diagramas-mermaid, analisis-dafo, redaccion-ejecutiva, tests-unitarios

Ambos seeds solo se ejecutan si la tabla esta vacia (`SELECT COUNT(*) as c`).

---

## 9. Correccion de rutas de modelos LiteLLM

### Problema

LiteLLM requiere prefijo de proveedor para rutear correctamente los modelos. Sin prefijo, retorna error 400 "invalid model name".

### Solucion

Archivo: `src/app/api/settings/models/route.ts`

```typescript
// ANTES (no funcionaba)
const PROVIDER_MODELS = {
  openai: ['gpt-4o', 'gpt-4o-mini'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash'],
};

// DESPUES (correcto)
const PROVIDER_MODELS = {
  openai: ['openai/gpt-4o', 'openai/gpt-4o-mini'],
  anthropic: ['anthropic/claude-sonnet-4-6', 'anthropic/claude-opus-4-6'],
  google: ['gemini/gemini-2.5-pro', 'gemini/gemini-2.5-flash'],
};
```

**CRITICO:** El prefijo de Google en LiteLLM es `gemini/`, NO `google/`.

---

## 10. Bugs resueltos

### Bug 1: TypeScript Set iteration

**Sintoma:** Error de compilacion con `[...new Set()]`
**Causa:** tsconfig target no incluye `--downlevelIteration`
**Solucion:** Usar `Array.from(new Set([...processIds, ...directIds]))` en lugar de `[...new Set([...])]`

### Bug 2: Worker type narrowing to `never`

**Sintoma:** TypeScript infiere `never` para `worker` en ramas condicionales
**Causa:** `let worker = null` seguido de asignacion condicional
**Solucion:** Tipo explicito:
```typescript
type WorkerRow = { id: string; name: string; system_prompt: string | null; ... };
let worker: WorkerRow | null = null;
worker = db.prepare('...').get(worker_id) as WorkerRow | undefined ?? null;
```

### Bug 3: Missing worker_id in ProcessingRun

**Sintoma:** TypeScript error al crear el objeto `setActiveRun({...})`
**Causa:** Interface `ProcessingRun` ya tenia `worker_id` pero el inline object no lo incluia
**Solucion:** Agregar `worker_id: processMode === 'worker' ? selectedWorkerId : null`

### Bug 4: LiteLLM invalid model name

**Sintoma:** Error 400 "Invalid model name passed in model=gemini-2.5-flash"
**Causa:** LiteLLM necesita prefijo de proveedor para routing
**Solucion:** Agregar prefijos (`openai/`, `gemini/`, `anthropic/`) a PROVIDER_MODELS

### Bug 5: asChild prop not available on Button

**Sintoma:** Build error "Property 'asChild' does not exist on type ButtonProps"
**Causa:** El componente Button de shadcn/ui en este proyecto no soporta `asChild`
**Solucion:** Reemplazar `<Button asChild><span>...</span></Button>` por `<Button onClick={...}>...</Button>` con file input hidden separado

### Bug 6: EnrichedRun skill_ids type conflict

**Sintoma:** "Interface EnrichedRun incorrectly extends ProcessingRun. Types of property 'skill_ids' are incompatible"
**Causa:** `ProcessingRun` ya tiene `skill_ids: string | null`, y `EnrichedRun` redefinia como `string | null | undefined`
**Solucion:** Eliminar la propiedad duplicada de `EnrichedRun` (ya la hereda de `ProcessingRun`)

---

## 11. Archivos nuevos y modificados

### Archivos nuevos

| Archivo | Descripcion |
|---------|-------------|
| `src/app/skills/page.tsx` | Pagina de biblioteca de Skills |
| `src/app/api/skills/route.ts` | GET (lista con filtros) + POST (crear) |
| `src/app/api/skills/[id]/route.ts` | GET + PATCH + DELETE skill individual |
| `src/app/api/skills/generate/route.ts` | POST genera instrucciones con LLM |
| `src/app/api/skills/import/route.ts` | POST importacion masiva JSON |
| `src/app/api/skills/openclaw/route.ts` | GET escanea workspaces OpenClaw |
| `src/app/workers/page.tsx` | Pagina de Docs Workers |
| `src/app/api/workers/route.ts` | GET (lista) + POST (crear) worker |
| `src/app/api/workers/[id]/route.ts` | GET + PATCH + DELETE worker individual |
| `src/app/api/workers/generate/route.ts` | POST genera config de worker con LLM |
| `src/app/api/projects/[id]/process/[vid]/route.ts` | DELETE version individual |
| `src/app/api/projects/[id]/process/clean/route.ts` | DELETE limpieza masiva (reescrito) |

### Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `src/lib/db.ts` | Tabla docs_workers, skills, worker_skills, agent_skills + seeds + columnas |
| `src/lib/types.ts` | Interfaces Skill, DocsWorker + process_mode en Source + skill_ids/worker_id en ProcessingRun |
| `src/components/layout/sidebar.tsx` | Agregado "Skills" con icono Sparkles |
| `src/components/process/process-panel.tsx` | 3-state source selector, mode agent/worker, skills chips, skill_ids en request |
| `src/components/process/version-history.tsx` | Reescrito: expandible, delete, cleanup, skill badges |
| `src/app/api/projects/[id]/process/route.ts` | Worker mode, skill injection, direct sources as annexes |
| `src/app/api/projects/[id]/process/history/route.ts` | Runs enriquecidos con file_size, source_names, disk_size |
| `src/app/api/projects/[id]/sources/[sid]/route.ts` | Soporte process_mode en PATCH |
| `src/app/api/settings/models/route.ts` | Prefijos de proveedor en PROVIDER_MODELS |

---

## 12. Sidebar actualizado

```typescript
const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Proyectos', icon: FolderKanban },
  { href: '/agents', label: 'Agentes', icon: Bot },
  { href: '/workers', label: 'Docs Workers', icon: FileOutput },
  { href: '/skills', label: 'Skills', icon: Sparkles },       // NUEVO
  { href: '/settings', label: 'Configuracion', icon: Settings },
  { href: '/system', label: 'Estado del Sistema', icon: Activity },
];
```

---

## 13. Verificacion y build

### Comando de build

```bash
cd ~/docflow/app && npm run build
```

### Resultado

```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Collecting page data
✓ Generating static pages
✓ Collecting build traces
✓ Finalizing page optimization

Route (app)                                  Size
○ /skills                                    6.12 kB
○ /workers                                   3.96 kB
ƒ /api/skills                                0 B
ƒ /api/skills/[id]                           0 B
ƒ /api/skills/generate                       0 B
ƒ /api/skills/import                         0 B
ƒ /api/skills/openclaw                       0 B
```

### Warnings conocidos (no bloquean build)
- `react-hooks/exhaustive-deps` en `fetchPreview` (process-panel.tsx) y `fetchRagInfo` (rag-panel.tsx) — preexistentes

### Deploy Docker

```bash
docker compose build --no-cache && docker compose up -d && \
docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && \
docker restart docflow-app
```
