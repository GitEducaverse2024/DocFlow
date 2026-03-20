# DoCatFlow — Document Intelligence Platform

**Plataforma local de gestion y procesamiento inteligente de documentacion con IA.**

DoCatFlow permite crear **CatBrains** (bases de conocimiento), alimentarlos con fuentes heterogeneas (archivos, URLs, YouTube, notas), procesarlos con agentes IA para generar documentos estructurados, indexar los resultados en una base vectorial (RAG) con chunking inteligente, y chatear con tu documentacion como si hablaras con un experto.

---

## Que hace DoCatFlow

```
📂 Subir fuentes  →  🤖 Procesar con IA  →  📄 Documento estructurado  →  🧠 RAG  →  💬 Chat experto
```

1. **Creas un CatBrain** con nombre, descripcion, finalidad y stack tecnologico
2. **Subes fuentes** de cualquier tipo: archivos (PDF, DOCX, TXT, MD, CSV, codigo, imagenes), URLs de paginas web, videos de YouTube, notas manuales en Markdown, carpetas completas
3. **Asignas un agente IA** especializado (Workers personalizables con Skills)
4. **Procesas** las fuentes: el agente lee toda la documentacion y genera un documento unificado y estructurado en Markdown
5. **Indexas en RAG**: el documento se divide en fragmentos inteligentes (structure-aware chunking), se generan embeddings con el modelo que elijas, y se almacenan en Qdrant para busqueda semantica
6. **Chateas** con tu documentacion: haz preguntas y obten respuestas basadas en el contenido real de tus fuentes
7. **Conectas via MCP**: cada CatBrain expone un endpoint MCP para integracion con herramientas externas (Claude Code, etc.)

Cada paso es visual, guiado y con feedback en tiempo real.

---

## Caracteristicas principales

### CatBrains (Bases de conocimiento)
- **Gestion visual** con dashboard, estados y actividad reciente
- **Wizard guiado** para crear CatBrains paso a paso
- **5 tipos de fuentes**: archivos (drag-and-drop + carpetas), URLs (auto-deteccion de titulo), YouTube (thumbnail + titulo automatico), notas Markdown, extraccion IA de contenido
- **Pipeline visual**: Fuentes → Procesar → RAG → Chat, con navegacion por pestanas
- **System prompt configurable**: personaliza el comportamiento del CatBrain
- **Historial de versiones**: cada procesamiento crea una nueva version sin borrar las anteriores
- **Icono y color personalizables** por CatBrain

### Procesamiento con IA
- **Procesamiento local directo** con LiteLLM (sin depender de n8n)
- **Selector de modelo LLM**: Gemini, Claude, GPT y cualquier modelo disponible en LiteLLM
- **Validacion de modelos**: verifica que el modelo existe antes de cada llamada, con fallback automatico
- **Streaming en tiempo real**: respuestas progresivas durante procesamiento y chat
- **Instrucciones adicionales** por procesamiento

### RAG Avanzado (v10.0)
- **Deteccion dinamica de modelos**: consulta automatica a Ollama, sin lista hardcoded
- **Chunking inteligente por estructura**:
  - Detecta headers Markdown (#-######) y mantiene jerarquia de secciones
  - Nunca corta dentro de bloques de codigo (```) ni tablas (|...|)
  - Preserva bloques atomicos (code blocks, tablas) como unidades indivisibles
- **Chunk size adaptativo**: ajuste automatico segun tipo de contenido
  - Codigo/tablas (denso): 60% del tamano base → chunks mas pequenos y precisos
  - Narrativa: 140% del tamano base → chunks mas grandes para contexto
  - Listas: tamano base estandar
- **Metadata rica por chunk**: source_name, source_type, source_id, content_type, section_path, section_title, section_level, chunk_hash, model
- **Soporte MRL** (Matryoshka Representation Learning): modelos compatibles (Qwen3-Embedding, Snowflake Arctic Embed 2) permiten dimensiones reducidas (512, 768) con minima perdida de calidad y ~4x ahorro de memoria
- **Batch embedding**: 16 chunks por llamada a Ollama (10x mas rapido)
- **Score threshold**: filtra resultados con score < 0.4 (configurable), no devuelve basura al LLM
- **Context window guard**: calcula tokens del contexto RAG y trunca si supera 60% del limite del modelo
- **Sanitizacion Unicode**: limpieza de surrogates y caracteres problematicos en todo el pipeline
- **Indices Qdrant**: payload indexes en source_name, content_type, section_path para busqueda filtrada
- **Consulta de prueba** integrada con badges de content_type y section_path en resultados
- **Endpoint MCP** por CatBrain: `/api/mcp/{id}` para integracion con Claude Code y otras herramientas

### Workers (Agentes de procesamiento)
- **Workers personalizables**: nombre, emoji, modelo LLM, system prompt, formato de salida
- **Templates de entrada/salida**: define ejemplos para guiar al worker
- **Skills asignables**: cada worker puede tener skills que modifican su comportamiento
- **3 workers por defecto**: Vision de Producto, PRD Generator, Resumen Ejecutivo
- **Generacion con IA**: describe lo que necesitas y la IA crea el worker

### Skills (Capacidades reutilizables)
- **6 categorias**: documentacion, analisis, comunicacion, codigo, diseno, formato
- **6 skills por defecto**: Diataxis, Mermaid, SWOT, Escritura Ejecutiva, Unit Tests, etc.
- **Asignables a Workers y Agentes**: composicion flexible de capacidades
- **Import/Export JSON**: comparte skills entre instancias
- **Integracion OpenClaw**: importa skills desde workspace de OpenClaw

### Tasks (Ejecucion de tareas)
- **Dashboard de tareas** con estados y progreso
- **Vista detallada** por tarea con pasos de ejecucion
- **Templates de tareas** predefinidos y personalizables
- **Motor de ejecucion** con pasos secuenciales y feedback en tiempo real

### Canvas (Editor visual de workflows)
- **Editor visual** de nodos y conexiones
- **8 tipos de nodo**: input, output, process, decision, connector, note, template, custom
- **Templates de canvas** predefinidos
- **Ejecucion visual** con historial de runs

### Conectores
- **Gestion de conectores** externos (APIs, servicios)
- **Test de conexion** integrado
- **Logs de actividad** por conector
- **Acceso controlado** por agente (tabla agent_connector_access)
- **Conectores por CatBrain**: cada CatBrain puede tener sus propios conectores
- **Gmail Connector** (v13.0): envio de emails via App Password (Personal/Workspace) u OAuth2
  - Wizard guiado de 4 pasos con modal de ayuda integrado
  - Test de conexion + envio de prueba antes de guardar
  - Soporte SMTP directo (smtp.gmail.com) y relay (smtp-relay.gmail.com)
  - Cifrado AES-256-GCM para credenciales almacenadas
  - Uso desde Canvas, Tareas y CatBot (tool `send_email`)
  - Fix EHLO para Docker: `name: dominio` evita rechazo 421 de Google

### CatBot — Asistente IA con superpoderes
- **13 herramientas basicas** (crear CatBrains, listar agentes, navegar, explicar funcionalidades, buscar documentacion, leer historial de errores)
- **5 herramientas sudo** protegidas por clave:
  - `bash_execute`: ejecutar comandos en el servidor host
  - `service_manage`: gestionar servicios Docker y systemd
  - `file_operation`: leer, escribir, listar y buscar archivos en el host
  - `credential_manage`: gestionar API keys (listar, actualizar, testar)
  - `mcp_bridge`: interactuar con servidores MCP configurados
- **Interceptor global de errores**: captura automaticamente errores de fetch y JavaScript, abre CatBot con el error pre-cargado y badge rojo animado
- **Base de conocimiento**: busca en archivos .md del proyecto para dar respuestas contextualizadas
- **Diagnostico inteligente**: tabla de troubleshooting con 9+ errores comunes y sus soluciones
- **Sistema de seguridad sudo**: clave scrypt, sesiones con TTL, bloqueo tras 5 intentos fallidos
- **Host Agent**: microservicio Node.js en el host como puente entre Docker y el sistema host

### Sistema y observabilidad
- **Panel de estado**: monitorizacion de 5 servicios (Qdrant, LiteLLM, Ollama, OpenClaw, n8n) con diagnostico paso a paso
- **Sistema de notificaciones**: notificaciones en tiempo real con severidad y enlaces
- **Registro de uso**: tracking de eventos (procesamiento, RAG, chat) con modelo, duracion, estado
- **Logger estructurado**: logs por modulo con niveles (info, warn, error)
- **Testing dashboard**: panel de pruebas integrado
- **Dark mode** por defecto
- **100% local**: tus datos nunca salen de tu servidor

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────┐
│                      DoCatFlow (3500)                            │
│               Next.js 14 + React 18 + Tailwind + shadcn/ui      │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────┐ ┌──────┐ ┌───────────────┐ │
│  │CatBrains │ │ Workers  │ │ RAG  │ │ Chat │ │    CatBot     │ │
│  │ Sources  │ │ Skills   │ │Qdrant│ │Expert│ │  🐱 Sudo      │ │
│  │ Canvas   │ │ Tasks    │ │ MCP  │ │Stream│ │  Diagnostico  │ │
│  └────┬─────┘ └────┬─────┘ └──┬───┘ └──┬───┘ └─────┬─────────┘ │
└───────┼─────────────┼─────────┼────────┼───────────┼────────────┘
        │             │         │        │           │
   ┌────▼────┐   ┌────▼────┐ ┌─▼──┐ ┌───▼───┐  ┌───▼──────────┐
   │ SQLite  │   │ LiteLLM │ │Qdr.│ │Ollama │  │ Host Agent   │
   │  (DB)   │   │ (4000)  │ │6333│ │ 11434 │  │ (3501)       │
   └─────────┘   └────┬────┘ └────┘ └───────┘  │ bash·files   │
                      │                          │ services·mcp │
             ┌────────▼────────┐                └──────────────┘
             │   LLM Models    │
             │ Gemini · Claude │
             │ GPT · Embeddings│
             └─────────────────┘
```

### Stack tecnico

| Componente | Tecnologia |
|------------|-----------|
| Frontend | Next.js 14 (App Router) + React 18 + Tailwind CSS + shadcn/ui |
| Backend | Next.js Route Handlers (API integrada) |
| Base de datos | SQLite (better-sqlite3) con WAL mode |
| Almacenamiento | Sistema de archivos local |
| Vector DB | Qdrant (Docker) |
| Embeddings | Ollama (Docker) — modelos open-source locales |
| LLM Gateway | LiteLLM (proxy OpenAI-compatible) |
| Agentes IA | OpenClaw (opcional) |
| Host Agent | Node.js HTTP server (systemd) — puente CatBot ↔ host |
| Contenedorizacion | Docker + Docker Compose |

---

## Requisitos

- **Docker** y **Docker Compose** instalados
- **Servicios** (la app funciona en modo degradado sin los opcionales):

| Servicio | Puerto | Funcion | Requerido para |
|----------|--------|---------|---------------|
| DoCatFlow | 3500 | Aplicacion principal | Todo |
| Qdrant | 6333 | Base vectorial | RAG, Chat |
| Ollama | 11434 | Embeddings locales | RAG (embedding models) |
| LiteLLM | 4000 | Proxy de modelos LLM | Procesar, Chat |
| Host Agent | 3501 | Puente CatBot → host | CatBot superpoderes |
| OpenClaw | 18789 | Agentes conversacionales | Opcional |
| n8n | 5678 | Automatizacion de workflows | Opcional |

---

## Instalacion

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

Contenido del `.env` (ajusta `TU_IP` segun tu servidor):

```env
# DoCatFlow
DATABASE_PATH=/app/data/docflow.db
PROJECTS_PATH=/app/data/projects

# Servicios externos (usar IP fisica del host o localhost)
OPENCLAW_URL=http://TU_IP:18789
N8N_WEBHOOK_URL=http://TU_IP:5678
N8N_PROCESS_WEBHOOK_PATH=/webhook/docflow-process
QDRANT_URL=http://TU_IP:6333
OLLAMA_URL=http://docflow-ollama:11434
LITELLM_URL=http://TU_IP:4000
LITELLM_API_KEY=sk-antigravity-gateway

# Agentes de OpenClaw (fallback si la API no los devuelve)
OPENCLAW_AGENTS=[{"id":"analista-proyecto","name":"Analista de Proyecto","emoji":"🔍","model":"gemini-main","description":"Analiza documentacion y genera Documento de Vision"}]

# Ruta al workspace de OpenClaw (para crear bots automaticos)
OPENCLAW_WORKSPACE_PATH=/home/$USER/.openclaw
OPENCLAW_HOST_PATH=/home/$USER/.openclaw

# Host Agent (se genera automaticamente con scripts/setup-host-agent.sh)
# HOST_AGENT_TOKEN=<generado>
# HOST_AGENT_URL=http://host.docker.internal:3501

# Nombre del servidor para el system prompt de CatBot (opcional)
# SERVER_HOSTNAME=mi-servidor
# Nombre de usuario para agentes (opcional)
# DOCFLOW_USER=tu-nombre
```

### 3. Crear el directorio de datos

```bash
mkdir -p ~/docflow-data/projects
```

### 4. Levantar los servicios

```bash
docker compose up -d --build
```

La primera build tarda 2-3 minutos. Qdrant y Ollama se descargan automaticamente.

### 5. Dar permisos al directorio de datos (primera vez)

```bash
docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/
docker restart docflow-app
```

### 6. Instalar modelos de embedding (primera vez)

```bash
# Modelo recomendado: Qwen3 Embedding 0.6B (multilingual, 1024 dims, MRL)
docker exec docflow-ollama ollama pull qwen3-embedding:0.6b

# Alternativas:
# docker exec docflow-ollama ollama pull nomic-embed-text      # Rapido, EN, 768 dims
# docker exec docflow-ollama ollama pull bge-m3                 # Hybrid search, 1024 dims
# docker exec docflow-ollama ollama pull snowflake-arctic-embed2 # MRL, 1024 dims
```

### 7. Acceder

```
http://TU_IP:3500
```

---

## Modelos de Embedding soportados

DoCatFlow detecta automaticamente los modelos de embedding instalados en Ollama. Modelos recomendados:

| Tier | Modelo | Dims | MRL | Idiomas | Uso recomendado |
|------|--------|------|-----|---------|-----------------|
| **S** | `qwen3-embedding:0.6b` | 1024 | Si (512, 768, 1024) | 100+ | **Recomendado** — mejor calidad/coste |
| **A** | `qwen3-embedding:4b` | 2560 | Si | 100+ | Maxima calidad |
| **A** | `bge-m3` | 1024 | No | 100+ | Hybrid search (dense+sparse) |
| **B** | `snowflake-arctic-embed2` | 1024 | Si (256-1024) | Multi | Rapido con MRL |
| **B** | `nomic-embed-text` | 768 | No | EN | Legacy, rapido |
| **C** | `all-minilm` | 384 | No | EN | Ultra-ligero (46 MB) |
| **C** | `mxbai-embed-large` | 1024 | No | EN | Legacy |

> **MRL** = Matryoshka Representation Learning: usa dimensiones menores (512, 768) con minima perdida de calidad, ahorrando ~4x memoria.

---

## Uso

### Crear un CatBrain

1. Pulsa **"Nuevo CatBrain"** en el dashboard o la sidebar
2. **Paso 1 — Informacion**: nombre, descripcion, finalidad, stack tecnologico
3. **Paso 2 — Fuentes**: sube archivos (drag-and-drop), pega URLs, anade videos de YouTube, escribe notas
4. **Paso 3 — Agente IA**: selecciona el worker que procesara la documentacion
5. Pulsa **"Crear CatBrain"**

### Procesar documentacion

1. Abre el CatBrain → pestana **Procesar**
2. Selecciona las fuentes a incluir (todas por defecto)
3. Elige el **modelo LLM** (gemini para velocidad, claude-opus para calidad)
4. Opcionalmente escribe **instrucciones adicionales**
5. Pulsa **"Procesar"**
6. Espera a que termine → veras el **preview del documento generado**

### Crear base de conocimiento (RAG)

1. Despues de procesar, ve a la pestana **RAG**
2. Configura:
   - **Modelo de embedding**: se listan automaticamente los modelos instalados en Ollama con info de dims, tamano, soporte MRL
   - **Dimensiones MRL** (si el modelo lo soporta): elige entre dimensiones nativas o reducidas para ahorrar memoria
   - **Tamano de chunk**: el sistema adapta automaticamente segun tipo de contenido (codigo, narrativa, listas)
   - **Nombre de coleccion**: identificador unico para la coleccion en Qdrant
3. Pulsa **"Indexar documentos"**
4. El worker procesa los documentos:
   - Parsea la estructura Markdown (headers, code blocks, tablas)
   - Genera chunks respetando la estructura del documento
   - Asigna metadata rica (source, content_type, section_path)
   - Genera embeddings en batch (16 chunks por llamada)
   - Almacena en Qdrant con indices de payload
5. Prueba una consulta para verificar — los resultados muestran content_type y section_path

### Chatear con tu documentacion

1. Ve a la pestana **Chat**
2. Escribe tu pregunta
3. El bot responde basandose en la documentacion indexada con streaming en tiempo real
4. Las respuestas incluyen contexto de las fuentes originales

### Endpoint MCP

Cada CatBrain con RAG activo expone un endpoint MCP:

```
GET/POST http://TU_IP:3500/api/mcp/{catbrain-id}
```

Configurable en Claude Code u otras herramientas MCP-compatibles para buscar en la base de conocimiento del CatBrain.

### CatBot — Asistente IA

CatBot se accede desde el boton flotante 🐱 en la esquina inferior derecha.

**Capacidades basicas** (sin autenticacion):
- Crear CatBrains, listar agentes, navegar entre paginas
- Explicar funcionalidades de la plataforma
- Buscar en la documentacion del proyecto

**Superpoderes** (requieren clave sudo):
1. **bash_execute** — Ejecutar comandos en el servidor host
2. **service_manage** — Ver estado, arrancar, parar, reiniciar servicios
3. **file_operation** — Leer, escribir, listar y buscar archivos
4. **credential_manage** — Gestionar API keys
5. **mcp_bridge** — Interactuar con servidores MCP

**Seguridad sudo:**
- Clave protegida con hash scrypt + salt aleatorio
- Sesiones con duracion configurable (1-60 minutos)
- Bloqueo automatico tras 5 intentos fallidos (5 minutos)
- Indicador visual en el chat con temporizador de sesion

**Host Agent:**

```bash
# Instalar el Host Agent (una sola vez)
bash scripts/setup-host-agent.sh

# Despues, rebuild Docker para que lea las nuevas variables:
docker compose build --no-cache && docker compose up -d
```

### Panel de estado del sistema

Accede a **Estado del Sistema** en la sidebar para ver:
- Estado de conexion de 5 servicios (Qdrant, LiteLLM, Ollama, OpenClaw, n8n)
- Latencia de cada servicio
- Modelos disponibles (LLM y embedding)
- Colecciones RAG activas
- Diagnostico paso a paso para servicios caidos

---

## Configuracion de servicios

### OpenClaw — Hacer accesible desde Docker

```bash
openclaw config set gateway.bind 'lan'
systemctl --user restart openclaw-gateway.service
ss -ltnp | grep 18789  # Debe mostrar 0.0.0.0:18789
```

### LiteLLM — Verificar modelos disponibles

```bash
curl -s http://TU_IP:4000/v1/models -H 'Authorization: Bearer sk-antigravity-gateway' | python3 -m json.tool
```

### Ollama — Modelos de embedding

```bash
# Ver modelos instalados
docker exec docflow-ollama ollama list

# Instalar nuevo modelo
docker exec docflow-ollama ollama pull qwen3-embedding:0.6b

# Verificar via API
curl -s http://TU_IP:3500/api/models?type=embedding | python3 -m json.tool
```

### Qdrant — Se levanta automaticamente

```bash
curl -s http://TU_IP:6333/collections | python3 -m json.tool
```

---

## Variables de entorno

| Variable | Descripcion | Valor por defecto |
|----------|------------|-------------------|
| `DATABASE_PATH` | Ruta de la base de datos SQLite | `/app/data/docflow.db` |
| `PROJECTS_PATH` | Directorio de CatBrains/proyectos | `/app/data/projects` |
| `QDRANT_URL` | URL de Qdrant | `http://localhost:6333` |
| `OLLAMA_URL` | URL de Ollama (embeddings) | `http://docflow-ollama:11434` |
| `LITELLM_URL` | URL de LiteLLM | `http://localhost:4000` |
| `LITELLM_API_KEY` | API key de LiteLLM | `sk-antigravity-gateway` |
| `OPENCLAW_URL` | URL del gateway de OpenClaw | `http://localhost:18789` |
| `N8N_WEBHOOK_URL` | URL base de n8n | `http://localhost:5678` |
| `HOST_AGENT_TOKEN` | Token de autenticacion del Host Agent | generado por setup script |
| `HOST_AGENT_URL` | URL del Host Agent | `http://host.docker.internal:3501` |
| `SERVER_HOSTNAME` | Nombre/IP del servidor (para CatBot) | `localhost` |
| `DOCFLOW_USER` | Nombre del usuario (para agentes) | `usuario` |
| `CONNECTOR_SECRET` | Clave para cifrado AES-256-GCM de credenciales | fallback dev |
| `LINKEDIN_MCP_URL` | URL del servidor LinkedIn MCP | no configurado |

---

## Actualizar DoCatFlow

```bash
cd ~/docflow
git pull origin main
docker compose build --no-cache
docker compose up -d
docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/
docker restart docflow-app
```

---

## Modelo de datos

### Tabla: catbrains
| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | TEXT PK | UUID |
| name | TEXT | Nombre del CatBrain |
| description | TEXT | Descripcion |
| purpose | TEXT | Finalidad |
| tech_stack | TEXT | Stack (JSON array) |
| status | TEXT | draft, sources_added, processing, processed, rag_indexed |
| agent_id | TEXT | ID del agente/worker asignado |
| current_version | INTEGER | Version actual del documento procesado |
| rag_enabled | INTEGER | Si tiene RAG activo |
| rag_collection | TEXT | Nombre de la coleccion en Qdrant |
| rag_indexed_version | INTEGER | Version indexada en RAG |
| rag_indexed_at | TEXT | Fecha de ultima indexacion |
| rag_model | TEXT | Modelo de embedding usado |
| bot_created | INTEGER | Si se creo bot experto |
| bot_agent_id | TEXT | ID del bot en OpenClaw |
| default_model | TEXT | Modelo LLM por defecto |
| system_prompt | TEXT | System prompt personalizado |
| mcp_enabled | INTEGER | Si el endpoint MCP esta activo |
| icon_color | TEXT | Color del icono (violet, blue, etc.) |

### Tabla: sources
| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | TEXT PK | UUID |
| project_id | TEXT FK | Referencia al CatBrain |
| type | TEXT | file, url, youtube, note |
| name | TEXT | Nombre visible |
| description | TEXT | Descripcion de la fuente |
| file_path | TEXT | Ruta absoluta al archivo |
| file_type | TEXT | Tipo MIME del archivo |
| file_size | INTEGER | Tamano en bytes |
| url | TEXT | URL (si aplica) |
| youtube_id | TEXT | ID de YouTube |
| content_text | TEXT | Contenido de notas |
| status | TEXT | pending, ready, error |
| extraction_log | TEXT | Log de extraccion IA |
| order_index | INTEGER | Orden de procesamiento |
| is_pending_append | INTEGER | Pendiente de anadir al RAG (0/1) |

### Tabla: processing_runs
| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | TEXT PK | UUID |
| project_id | TEXT FK | Referencia al CatBrain |
| version | INTEGER | Numero de version |
| agent_id | TEXT | Agente/worker que proceso |
| status | TEXT | queued, running, completed, failed |
| output_path | TEXT | Ruta al documento generado |
| output_format | TEXT | Formato de salida (md) |
| tokens_used | INTEGER | Tokens consumidos |
| duration_seconds | INTEGER | Duracion del procesamiento |
| instructions | TEXT | Instrucciones del usuario |

### Tabla: docs_workers
| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | TEXT PK | UUID |
| name | TEXT | Nombre del worker |
| description | TEXT | Descripcion |
| emoji | TEXT | Emoji identificador |
| model | TEXT | Modelo LLM |
| system_prompt | TEXT | System prompt |
| output_format | TEXT | Formato de salida |
| output_template | TEXT | Template de salida |
| times_used | INTEGER | Veces utilizado |

### Tabla: skills
| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | TEXT PK | UUID |
| name | TEXT | Nombre del skill |
| description | TEXT | Descripcion |
| category | TEXT | documentacion, analisis, comunicacion, codigo, diseno, formato |
| instructions | TEXT | Instrucciones del skill |
| template | TEXT | Template de salida |
| source | TEXT | built-in, user, openclaw, imported |
| times_used | INTEGER | Veces utilizado |

### Tabla: tasks
| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | TEXT PK | UUID |
| name | TEXT | Nombre de la tarea |
| status | TEXT | Estado de ejecucion |
| template_id | TEXT FK | Template asociado |

### Tabla: connectors
| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | TEXT PK | UUID |
| name | TEXT | Nombre del conector |
| type | TEXT | Tipo de conector |
| config | TEXT | Configuracion JSON |
| status | TEXT | Estado de conexion |

### Otras tablas
- **custom_agents**: Agentes personalizados creados por el usuario
- **canvases**: Workflows visuales con nodos y conexiones
- **canvas_runs**: Historial de ejecuciones de canvas
- **canvas_templates**: Templates predefinidos de canvas
- **notifications**: Sistema de notificaciones con severidad y enlaces
- **usage_logs**: Registro de uso (evento, modelo, duracion, estado)
- **settings**: Configuraciones key-value de la aplicacion
- **api_keys**: API keys configuradas
- **test_runs**: Ejecuciones de pruebas
- **catbrain_connectors**: Conectores asociados a CatBrains especificos
- **worker_skills**: Relacion workers ↔ skills
- **agent_skills**: Relacion agentes ↔ skills
- **agent_connector_access**: Control de acceso de agentes a conectores
- **connector_logs**: Logs de actividad de conectores

---

## API Routes

### CatBrains
| Metodo | Ruta | Funcion |
|--------|------|---------|
| GET/POST | `/api/catbrains` | Listar / Crear CatBrains |
| GET/PATCH/DELETE | `/api/catbrains/[id]` | Detalle / Actualizar / Eliminar |
| GET | `/api/catbrains/[id]/stats` | Estadisticas del CatBrain |

### Fuentes
| Metodo | Ruta | Funcion |
|--------|------|---------|
| GET/POST | `/api/catbrains/[id]/sources` | Listar / Subir fuentes |
| GET/DELETE | `/api/catbrains/[id]/sources/[sid]` | Detalle / Eliminar fuente |
| POST | `/api/catbrains/[id]/sources/reorder` | Reordenar fuentes |
| POST | `/api/catbrains/[id]/sources/[sid]/ai-extract` | Extraccion IA de contenido |

### Procesamiento
| Metodo | Ruta | Funcion |
|--------|------|---------|
| POST | `/api/catbrains/[id]/process` | Lanzar procesamiento |
| GET | `/api/catbrains/[id]/process/status` | Estado del procesamiento |
| GET | `/api/catbrains/[id]/process/history` | Historial de versiones |
| GET | `/api/catbrains/[id]/process/[vid]` | Detalle de version |
| GET | `/api/catbrains/[id]/process/[vid]/output` | Documento generado |
| POST | `/api/catbrains/[id]/process/clean` | Limpiar cache |

### RAG
| Metodo | Ruta | Funcion |
|--------|------|---------|
| POST | `/api/catbrains/[id]/rag/create` | Crear/indexar coleccion RAG |
| GET | `/api/catbrains/[id]/rag/info` | Info de la coleccion |
| GET | `/api/catbrains/[id]/rag/status` | Estado de indexacion |
| POST | `/api/catbrains/[id]/rag/query` | Consulta vectorial |
| POST | `/api/catbrains/[id]/rag/append` | Anadir fuentes al RAG existente (incremental) |
| DELETE | `/api/catbrains/[id]/rag` | Eliminar coleccion |

### Chat y bot
| Metodo | Ruta | Funcion |
|--------|------|---------|
| POST | `/api/catbrains/[id]/chat` | Chat con RAG (streaming) |
| POST | `/api/catbrains/[id]/bot/create` | Crear bot experto en OpenClaw |

### Conectores (por CatBrain)
| Metodo | Ruta | Funcion |
|--------|------|---------|
| GET/POST | `/api/catbrains/[id]/connectors` | Listar / Crear conectores |
| GET/PATCH/DELETE | `/api/catbrains/[id]/connectors/[connId]` | CRUD conector |
| POST | `/api/catbrains/[id]/connectors/[connId]/test` | Test de conexion |

### Conectores Gmail
| Metodo | Ruta | Funcion |
|--------|------|---------|
| POST | `/api/connectors/gmail/test-credentials` | Testear credenciales sin guardar |
| POST | `/api/connectors/gmail/send-test-email` | Enviar email de prueba |
| GET | `/api/connectors/gmail/oauth2/auth-url` | Generar URL de autorizacion Google |
| POST | `/api/connectors/gmail/oauth2/exchange-code` | Intercambiar codigo por refresh_token |

### MCP
| Metodo | Ruta | Funcion |
|--------|------|---------|
| GET/POST | `/api/mcp/[catbrainId]` | Endpoint MCP (busqueda semantica) |

### Sistema
| Metodo | Ruta | Funcion |
|--------|------|---------|
| GET | `/api/health` | Estado de todos los servicios |
| GET | `/api/models` | Modelos LLM disponibles (LiteLLM) |
| GET | `/api/models?type=embedding` | Modelos de embedding (Ollama) |
| GET | `/api/agents` | Lista de agentes disponibles |
| POST | `/api/agents/create` | Crear agente personalizado |
| POST | `/api/agents/generate` | Generar agente con IA |
| GET/POST | `/api/workers` | Listar / Crear workers |
| GET/PATCH/DELETE | `/api/workers/[id]` | CRUD worker |

### CatBot
| Metodo | Ruta | Funcion |
|--------|------|---------|
| POST | `/api/catbot/chat` | Chat con CatBot (tool-calling loop) |
| POST | `/api/catbot/sudo` | Gestion sudo: set/verify/check/logout/config |
| GET | `/api/catbot/search-docs` | Busqueda en documentacion .md |
| GET/POST | `/api/catbot/error-history` | Historial de errores capturados |

---

## Estructura del proyecto

```
~/docflow/
├── docker-compose.yml          # Servicios: DoCatFlow + Qdrant + Ollama
├── .env                        # Variables de entorno
├── .env.example                # Plantilla de variables
├── README.md                   # Este archivo
├── app/                        # Aplicacion Next.js
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── package.json
│   ├── scripts/
│   │   └── rag-worker.mjs      # Worker RAG (smart chunking + batch embed)
│   └── src/
│       ├── app/                 # Pages (App Router)
│       │   ├── page.tsx         # Dashboard
│       │   ├── catbrains/       # CatBrains (list, detail, new)
│       │   ├── workers/         # Workers
│       │   ├── skills/          # Skills
│       │   ├── tasks/           # Tasks
│       │   ├── canvas/          # Visual workflows
│       │   ├── agents/          # Agentes personalizados
│       │   ├── connectors/      # Conectores
│       │   ├── settings/        # Configuracion
│       │   ├── system/          # Panel de estado
│       │   ├── notifications/   # Notificaciones
│       │   ├── testing/         # Testing dashboard
│       │   └── api/             # Route Handlers (API)
│       │       ├── catbrains/   # CRUD + sources + process + RAG + chat
│       │       ├── workers/     # CRUD workers
│       │       ├── agents/      # CRUD + generate agentes
│       │       ├── models/      # Modelos LLM + embedding
│       │       ├── mcp/         # Endpoints MCP
│       │       ├── connectors/  # CRUD conectores + Gmail (test, send, oauth2)
│       │       ├── catbot/      # CatBot chat + sudo + docs + errors
│       │       ├── health/      # Health check
│       │       └── ...
│       ├── components/          # Componentes React
│       │   ├── ui/              # shadcn/ui + custom
│       │   ├── layout/          # Sidebar, footer, page-header
│       │   ├── catbrains/       # Componentes CatBrain
│       │   ├── sources/         # Gestion de fuentes
│       │   ├── process/         # Procesamiento IA
│       │   ├── rag/             # Panel RAG (modelo, chunking, query)
│       │   ├── chat/            # Chat
│       │   ├── agents/          # Agentes
│       │   ├── connectors/      # Gmail wizard (4 pasos + modal ayuda)
│       │   ├── system/          # Estado del sistema + diagnostico
│       │   └── projects/        # Legacy (pipeline-nav, delete dialog)
│       ├── lib/                 # Utilidades
│       │   ├── db.ts            # SQLite (schema, migrations, WAL)
│       │   ├── logger.ts        # Logger estructurado
│       │   ├── sudo.ts          # Sesiones sudo (scrypt, TTL, lockout)
│       │   ├── types.ts         # Interfaces TypeScript
│       │   └── services/        # Clientes de servicios
│       │       ├── ollama.ts             # Ollama (embed, models, MRL)
│       │       ├── qdrant.ts             # Qdrant (collections, search)
│       │       ├── litellm.ts            # LiteLLM (health, models, resolve)
│       │       ├── llm.ts               # LLM utils
│       │       ├── stream-utils.ts       # Streaming SSE
│       │       ├── execute-catbrain.ts   # Motor de ejecucion CatBrain
│       │       ├── rag-jobs.ts           # Estado de jobs RAG
│       │       ├── usage-tracker.ts      # Tracking de uso
│       │       ├── notifications.ts      # Sistema de notificaciones
│       │       ├── email-service.ts      # Gmail transporter + test + send
│       │       ├── catbot-tools.ts       # 13 herramientas basicas CatBot
│       │       └── catbot-sudo-tools.ts  # 5 herramientas sudo
│       └── hooks/               # Custom hooks
│           ├── use-error-interceptor.ts  # Interceptor global errores
│           └── use-system-health.ts      # Health check servicios
├── scripts/
│   ├── host-agent.mjs           # Host Agent (corre en el host)
│   ├── setup-host-agent.sh      # Instalador del Host Agent
│   └── gateway-watcher.sh       # Cron de reinicio del gateway
├── qdrant-data/                 # Datos persistentes de Qdrant
└── ~/docflow-data/              # Datos de la app (volumen)
    ├── docflow.db               # Base de datos SQLite
    └── projects/                # Archivos de CatBrains
        └── {id}/
            ├── sources/         # Fuentes subidas
            └── processed/       # Documentos generados
                └── v{n}/
                    └── output.md
```

---

## Troubleshooting

| Problema | Causa | Solucion |
|----------|-------|----------|
| `SQLITE_CANTOPEN` | Permisos del directorio de datos | `docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/` |
| OpenClaw desconectado | Escucha en loopback | `openclaw config set gateway.bind 'lan'` + restart |
| Build falla con `ld-linux` | node_modules locales copiados | Verificar `.dockerignore` excluye `node_modules` |
| Build falla con node:18 | Dockerfile desactualizado | Verificar que usa `node:20-slim` (no Alpine) |
| `.env` no se aplica | `docker restart` no recarga env | `docker compose down && docker compose up -d` |
| RAG no funciona | Sin documento procesado | Primero procesar las fuentes en la pestana Procesar |
| Chat no disponible | RAG no indexado | Primero indexar en la pestana RAG |
| `invalid model ID` (400) | Modelo no existe en LiteLLM | Editar agente → seleccionar modelo valido (fallback automatico) |
| `Qdrant connection refused` | Contenedor Qdrant caido | `docker compose up -d docflow-qdrant` |
| `Ollama connection refused` | Contenedor Ollama caido | `docker compose up -d docflow-ollama` |
| No hay modelos embedding | Ollama sin modelos | `docker exec docflow-ollama ollama pull qwen3-embedding:0.6b` |
| Embeddings lentos | Sin batch embedding | Verificar version actualizada de rag-worker.mjs |
| Chunks sin estructura | Chunking legacy | Re-indexar con la version actual (smart chunking) |
| `ECONNREFUSED :3501` | Host Agent no corriendo | `systemctl --user restart docatflow-host-agent.service` |
| `OpenClaw RPC probe: failed` | Gateway caido | `systemctl --user restart openclaw-gateway.service` |
| Gmail `421 4.7.0 Try again later` | EHLO con container ID en Docker | Aplicado fix: `name: dominio` en transporter Workspace |
| Gmail `Mail relay denied [IP]` | IP no autorizada en relay SMTP | Anadir IP publica en admin.google.com → Gmail → Relay SMTP |
| Gmail `Invalid credentials` | App Password incorrecta | Regenerar en myaccount.google.com/apppasswords |
| CORS error en /api/agents | Browser cache de redirect 301 | Ctrl+Shift+R para limpiar cache de redirect |

---

## Red Docker — Regla importante

Los contenedores que necesiten comunicarse con servicios fuera de su red compose **deben usar la IP del host o `host.docker.internal`**. Para servicios en la misma red compose (Qdrant, Ollama), se usan nombres de servicio Docker. DoCatFlow usa `extra_hosts: host.docker.internal:host-gateway` en su `docker-compose.yml`.

---

## Creditos

- **DoCatFlow** — Desarrollado con asistencia de IA (Claude, OpenHands)
- **Stack**: Next.js, Tailwind CSS, shadcn/ui, SQLite, Qdrant, Ollama, LiteLLM, OpenClaw
- **Servidor**: server-ia (Ubuntu 24, RTX 5080)

---

## Licencia

Proyecto privado. (c) 2026 deskmath / GitEducaverse2024.
