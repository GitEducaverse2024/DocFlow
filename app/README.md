# DocFlow — Document Intelligence Platform

**Plataforma local de gestión y procesamiento inteligente de documentación con IA.**

DocFlow permite crear proyectos de documentación, alimentarlos con fuentes heterogéneas (archivos, URLs, YouTube, notas), procesarlos con agentes IA para generar documentos estructurados, indexar los resultados en una base vectorial (RAG), y chatear con tu documentación como si hablaras con un experto.

---

## Qué hace DocFlow

```
📂 Subir fuentes  →  🤖 Procesar con IA  →  📄 Documento estructurado  →  🧠 RAG  →  💬 Chat experto
```

1. **Creas un proyecto** con nombre, descripción, finalidad y stack tecnológico
2. **Subes fuentes** de cualquier tipo: archivos (PDF, DOCX, TXT, MD, CSV, código, imágenes), URLs de páginas web, vídeos de YouTube, notas manuales en Markdown, carpetas completas
3. **Asignas un agente IA** especializado (Analista de Proyecto, PRD Generator, etc.)
4. **Procesas** las fuentes: el agente lee toda la documentación y genera un documento unificado y estructurado en Markdown
5. **Indexas en RAG**: el documento se divide en fragmentos, se generan embeddings, y se almacenan en Qdrant para búsqueda semántica
6. **Chateas** con tu documentación: haz preguntas y obtén respuestas basadas en el contenido real de tus fuentes
7. **Se crea un bot experto** automáticamente en OpenClaw, especializado en tu proyecto

Cada paso es visual, guiado y con feedback en tiempo real.

---

## Características

- **Gestión visual de proyectos** con dashboard, estados y actividad reciente
- **Wizard guiado** para crear proyectos paso a paso
- **4 tipos de fuentes**: archivos (drag-and-drop + carpetas), URLs (auto-detección de título), YouTube (thumbnail + título automático), notas Markdown
- **Procesamiento local directo** con LiteLLM (sin depender de n8n)
- **Selector de modelo LLM**: Gemini 3.1 Pro, Claude Opus 4.6, Claude Sonnet 4.6, GPT-5.4
- **Historial de versiones**: cada procesamiento crea una nueva versión sin borrar las anteriores
- **RAG completo**: chunking configurable, embeddings, Qdrant, consulta de prueba
- **Chat con tu documentación**: preguntas en lenguaje natural, respuestas basadas en el RAG
- **Creación automática de bot experto** en OpenClaw al indexar RAG
- **Panel de estado del sistema**: monitorización de 4 servicios con diagnóstico paso a paso
- **Textos de ayuda contextual** en cada pantalla y campo
- **Dark mode** por defecto
- **100% local**: tus datos nunca salen de tu servidor

---

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                    DocFlow (3500)                     │
│            Next.js 14 + React + Tailwind             │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────┐  ┌──────────┐ │
│  │ Proyectos│  │ Procesar │  │ RAG  │  │   Chat   │ │
│  │ Fuentes  │  │  con IA  │  │Qdrant│  │  Experto │ │
│  └────┬─────┘  └────┬─────┘  └──┬───┘  └────┬─────┘ │
└───────┼──────────────┼──────────┼────────────┼───────┘
        │              │          │            │
   ┌────▼────┐    ┌────▼────┐  ┌─▼──┐    ┌────▼────┐
   │ SQLite  │    │ LiteLLM │  │Qdr.│    │ LiteLLM │
   │  (DB)   │    │ (4000)  │  │6333│    │ + Qdrant│
   └─────────┘    └────┬────┘  └────┘    └─────────┘
                       │
              ┌────────▼────────┐
              │   LLM Models    │
              │ Gemini · Claude │
              │ GPT · Embeddings│
              └─────────────────┘
```

### Stack técnico

| Componente | Tecnología |
|------------|-----------|
| Frontend | Next.js 14 (App Router) + React 18 + Tailwind CSS + shadcn/ui |
| Backend | Next.js Route Handlers (API integrada) |
| Base de datos | SQLite (better-sqlite3) |
| Almacenamiento | Sistema de archivos local |
| Vector DB | Qdrant (Docker) |
| LLM Gateway | LiteLLM (proxy OpenAI-compatible) |
| Agentes IA | OpenClaw |
| Automatización | n8n (opcional) |
| Contenedorización | Docker + Docker Compose |

---

## Requisitos

- **Docker** y **Docker Compose** instalados
- **Servicios externos** (opcionales, la app funciona en modo degradado sin ellos):

| Servicio | Puerto | Función | Requerido para |
|----------|--------|---------|---------------|
| LiteLLM | 4000 | Proxy de modelos LLM | Procesar, RAG, Chat |
| Qdrant | 6333 | Base vectorial | RAG, Chat |
| OpenClaw | 18789 | Agentes conversacionales | Bot experto |
| n8n | 5678 | Automatización de workflows | Opcional |

---

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/GitEducaverse2024/DocFlow.git ~/docflow
cd ~/docflow
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

Contenido del `.env` (ajusta las IPs según tu servidor):

```env
# DocFlow
DATABASE_PATH=/app/data/docflow.db
PROJECTS_PATH=/app/data/projects

# Servicios externos (usar IP física del host, NO nombres Docker)
OPENCLAW_URL=http://192.168.1.49:18789
N8N_WEBHOOK_URL=http://192.168.1.49:5678
N8N_PROCESS_WEBHOOK_PATH=/webhook/docflow-process
QDRANT_URL=http://192.168.1.49:6333
LITELLM_URL=http://192.168.1.49:4000
LITELLM_API_KEY=sk-antigravity-gateway
EMBEDDING_MODEL=text-embedding-3-small

# Agentes de OpenClaw (fallback si la API no los devuelve)
OPENCLAW_AGENTS=[{"id":"analista-proyecto","name":"Analista de Proyecto","emoji":"🔍","model":"gemini-main","description":"Analiza documentación y genera Documento de Visión"},{"id":"prd-gen","name":"PRD Generator","emoji":"📋","model":"claude-sonnet","description":"Genera PRD con user stories"}]

# Ruta al workspace de OpenClaw (para crear bots automáticos)
OPENCLAW_WORKSPACE_PATH=/home/tu-usuario/.openclaw
```

### 3. Crear el directorio de datos

```bash
mkdir -p ~/docflow-data/projects
```

### 4. Levantar los servicios

```bash
docker compose up -d --build
```

La primera build tarda 2-3 minutos. Qdrant se descarga automáticamente.

### 5. Dar permisos al directorio de datos (primera vez)

```bash
docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/
docker restart docflow-app
```

### 6. Acceder

```
http://TU_IP:3500
```

---

## Configuración de servicios

### OpenClaw — Hacer accesible desde Docker

Si OpenClaw escucha en `127.0.0.1` (loopback), Docker no puede alcanzarlo. Cámbialo a LAN:

```bash
openclaw config set gateway.bind 'lan'
systemctl --user restart openclaw-gateway.service

# Verificar
ss -ltnp | grep 18789
# Debe mostrar 0.0.0.0:18789
```

### LiteLLM — Verificar modelos disponibles

```bash
curl -s http://TU_IP:4000/v1/models -H 'Authorization: Bearer sk-antigravity-gateway' | python3 -m json.tool
```

### Qdrant — Se levanta automáticamente

Qdrant viene incluido en el `docker-compose.yml` de DocFlow. Se levanta en el puerto 6333.

Para verificar:
```bash
curl -s http://TU_IP:6333/collections | python3 -m json.tool
```

---

## Variables de entorno

| Variable | Descripción | Valor por defecto |
|----------|------------|-------------------|
| `DATABASE_PATH` | Ruta de la base de datos SQLite | `/app/data/docflow.db` |
| `PROJECTS_PATH` | Directorio de proyectos | `/app/data/projects` |
| `OPENCLAW_URL` | URL del gateway de OpenClaw | `http://192.168.1.49:18789` |
| `N8N_WEBHOOK_URL` | URL base de n8n | `http://192.168.1.49:5678` |
| `N8N_PROCESS_WEBHOOK_PATH` | Path del webhook de procesamiento | `/webhook/docflow-process` |
| `QDRANT_URL` | URL de Qdrant | `http://192.168.1.49:6333` |
| `LITELLM_URL` | URL de LiteLLM | `http://192.168.1.49:4000` |
| `LITELLM_API_KEY` | API key de LiteLLM | `sk-antigravity-gateway` |
| `EMBEDDING_MODEL` | Modelo de embeddings para RAG | `text-embedding-3-small` |
| `OPENCLAW_AGENTS` | Lista de agentes en JSON (fallback) | `[]` |
| `OPENCLAW_WORKSPACE_PATH` | Ruta al workspace de OpenClaw | `/home/usuario/.openclaw` |

---

## Uso

### Crear un proyecto

1. Pulsa **"Nuevo Proyecto"** en el dashboard o la sidebar
2. **Paso 1 — Información**: nombre, descripción, finalidad, stack tecnológico
3. **Paso 2 — Fuentes**: sube archivos (drag-and-drop), pega URLs, añade vídeos de YouTube, escribe notas
4. **Paso 3 — Agente IA**: selecciona el agente que procesará la documentación
5. Pulsa **"Crear Proyecto"**

### Procesar documentación

1. Abre el proyecto → pestaña **Procesar**
2. Selecciona las fuentes a incluir (todas por defecto)
3. Elige el **modelo LLM** (gemini-main para velocidad, claude-opus para calidad)
4. Opcionalmente escribe **instrucciones adicionales**
5. Pulsa **"Procesar"**
6. Espera a que termine → verás el **preview del documento generado**

### Crear base de conocimiento (RAG)

1. Después de procesar, ve a la pestaña **RAG**
2. Configura: nombre de la colección, modelo de embeddings, tamaño de chunk
3. Pulsa **"Indexar documentos"**
4. Prueba una consulta para verificar que funciona

### Chatear con tu documentación

1. Ve a la pestaña **Chat**
2. Escribe tu pregunta
3. El bot responde basándose en la documentación indexada

### Panel de estado del sistema

Accede a **Estado del Sistema** en la sidebar para ver:
- Estado de conexión de los 4 servicios (OpenClaw, n8n, Qdrant, LiteLLM)
- Latencia de cada servicio
- Modelos disponibles
- Colecciones RAG activas
- Botón de **diagnóstico** para servicios caídos

---

## Actualizar DocFlow

```bash
cd ~/docflow
git pull origin main
docker compose build --no-cache
docker compose up -d
docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/
docker restart docflow-app
```

---

## Estructura del proyecto

```
~/docflow/
├── docker-compose.yml          # Servicios: DocFlow + Qdrant
├── .env                        # Variables de entorno
├── .env.example                # Plantilla de variables
├── README.md                   # Este archivo
├── app/                        # Aplicación Next.js
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── package.json
│   └── src/
│       ├── app/                # Pages (App Router)
│       │   ├── page.tsx        # Dashboard
│       │   ├── projects/       # Gestión de proyectos
│       │   ├── system/         # Panel de estado
│       │   └── api/            # Route Handlers (API)
│       ├── components/         # Componentes React
│       │   ├── ui/             # shadcn/ui + custom
│       │   ├── layout/         # Sidebar
│       │   ├── sources/        # Gestión de fuentes
│       │   ├── process/        # Procesamiento IA
│       │   ├── rag/            # RAG
│       │   ├── chat/           # Chat
│       │   └── system/         # Estado del sistema
│       ├── lib/                # Utilidades
│       │   ├── db.ts           # SQLite
│       │   ├── types.ts        # Interfaces TypeScript
│       │   └── services/       # Clientes de servicios externos
│       └── hooks/              # Custom hooks
├── qdrant-data/                # Datos persistentes de Qdrant
└── ~/docflow-data/             # Datos de la app (volumen)
    ├── docflow.db              # Base de datos SQLite
    └── projects/               # Archivos de proyectos
        └── {id}/
            ├── sources/        # Fuentes subidas
            └── processed/      # Documentos generados
                └── v1/
                    └── output.md
```

---

## Troubleshooting

| Problema | Causa | Solución |
|----------|-------|----------|
| `SQLITE_CANTOPEN` | Permisos del directorio de datos | `docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/` |
| OpenClaw desconectado | Escucha en loopback | `openclaw config set gateway.bind 'lan'` + restart |
| Agentes vacíos | Variable no llega al contenedor | `docker compose down && docker compose up -d` (no restart) |
| Build falla con `ld-linux` | node_modules locales copiados al contenedor | Verificar que `.dockerignore` excluye `node_modules` |
| Build falla con node:18 | Dockerfile desactualizado | Verificar que usa `node:20-alpine` |
| Build falla por ESLint | Import no usado | Revisar el archivo indicado en el error |
| `.env` no se aplica | `docker restart` no recarga env | Usar `docker compose down && docker compose up -d` |
| Servicios no alcanzables | Usando nombres Docker | Usar IP física del host (ej: 192.168.1.49) |
| RAG no funciona | Sin documento procesado | Primero procesar las fuentes en la pestaña Procesar |
| Chat no disponible | RAG no indexado | Primero indexar en la pestaña RAG |

---

## Red Docker — Regla importante

Todos los contenedores que necesiten comunicarse entre sí **deben usar la IP física del host** (ej: `192.168.1.49`), NO nombres de servicio Docker. Esto es porque los contenedores que crea OpenHands/DocFlow corren en la red bridge por defecto y no resuelven nombres de otras redes compose.

---

## Modelo de datos

### Tabla: projects
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | TEXT PK | UUID |
| name | TEXT | Nombre del proyecto |
| description | TEXT | Descripción |
| purpose | TEXT | Finalidad |
| tech_stack | TEXT | Stack (JSON array) |
| status | TEXT | draft, sources_added, processing, processed, rag_indexed |
| agent_id | TEXT | ID del agente asignado |
| current_version | INTEGER | Versión actual |
| rag_enabled | INTEGER | Si tiene RAG activo |
| rag_collection | TEXT | Nombre de la colección en Qdrant |
| bot_created | INTEGER | Si se creó bot experto |
| bot_agent_id | TEXT | ID del bot en OpenClaw |

### Tabla: sources
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | TEXT PK | UUID |
| project_id | TEXT FK | Referencia al proyecto |
| type | TEXT | file, url, youtube, note |
| name | TEXT | Nombre visible |
| file_path | TEXT | Ruta al archivo |
| url | TEXT | URL (si aplica) |
| youtube_id | TEXT | ID de YouTube |
| content_text | TEXT | Contenido de notas |
| status | TEXT | pending, ready, error |
| order_index | INTEGER | Orden de procesamiento |

### Tabla: processing_runs
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | TEXT PK | UUID |
| project_id | TEXT FK | Referencia al proyecto |
| version | INTEGER | Número de versión |
| agent_id | TEXT | Agente que procesó |
| status | TEXT | queued, running, completed, failed |
| output_path | TEXT | Ruta al documento generado |
| instructions | TEXT | Instrucciones del usuario |

---

## API Routes

| Método | Ruta | Función |
|--------|------|---------|
| GET | `/api/health` | Estado de todos los servicios |
| GET | `/api/agents` | Lista de agentes disponibles |
| GET/POST | `/api/projects` | Listar / Crear proyectos |
| GET/PATCH/DELETE | `/api/projects/[id]` | Detalle / Actualizar / Eliminar |
| GET/POST | `/api/projects/[id]/sources` | Listar / Subir fuentes |
| POST | `/api/projects/[id]/sources/reorder` | Reordenar fuentes |
| POST | `/api/projects/[id]/process` | Lanzar procesamiento |
| GET | `/api/projects/[id]/process/status` | Estado del procesamiento |
| GET | `/api/projects/[id]/process/history` | Historial de versiones |
| POST | `/api/projects/[id]/rag/create` | Crear colección RAG |
| POST | `/api/projects/[id]/rag/query` | Consulta vectorial |
| DELETE | `/api/projects/[id]/rag` | Eliminar colección |
| POST | `/api/projects/[id]/chat` | Chat con RAG |
| POST | `/api/projects/[id]/bot/create` | Crear bot experto |

---

## Créditos

- **DocFlow** — Desarrollado con asistencia de IA (Claude, OpenHands)
- **Stack**: Next.js, Tailwind CSS, shadcn/ui, SQLite, Qdrant, LiteLLM, OpenClaw
- **Servidor**: server-ia (Ubuntu 24, RTX 5080)

---

## Licencia

Proyecto privado. © 2026 deskmath / GitEducaverse2024.
