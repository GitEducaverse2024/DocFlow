# DocFlow — Document Intelligence Platform

Plataforma local de gestión y procesamiento inteligente de documentación. Crea proyectos, sube fuentes heterogéneas, conecta agentes IA para estructurar la documentación, e indexa los resultados en una base vectorial para consulta RAG.

## Características

- Gestión de proyectos de documentación con wizard guiado
- Soporte de múltiples tipos de fuentes: archivos (PDF, DOCX, TXT, MD, CSV, código, imágenes), URLs, vídeos de YouTube, notas manuales
- Subida de carpetas completas con filtrado automático
- Procesamiento con agentes IA de OpenClaw (Analista de Proyecto, PRD Generator, etc.)
- Historial de versiones de documentos procesados
- RAG: indexación vectorial con Qdrant para consulta inteligente
- Panel de estado del sistema con diagnóstico de conexiones
- Dark mode por defecto

## Requisitos

- Docker y Docker Compose
- Servicios externos (opcionales, la app funciona en modo degradado sin ellos):
  - OpenClaw (agentes IA) — puerto 18789
  - n8n (orquestación de workflows) — puerto 5678
  - LiteLLM (proxy de modelos LLM) — puerto 4000

## Instalación rápida

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/GitEducaverse2024/DocFlow.git ~/docflow
   cd ~/docflow
   ```

2. Configurar variables de entorno:
   ```bash
   cp .env.example .env
   nano .env
   # Edita las URLs según tu infraestructura
   ```

3. Crear el directorio de datos:
   ```bash
   mkdir -p ~/docflow-data/projects
   ```

4. Levantar los servicios:
   ```bash
   docker compose up -d --build
   ```

5. Dar permisos al directorio de datos (primera vez):
   ```bash
   docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/
   docker restart docflow-app
   ```

6. Acceder: http://TU_IP:3500

## Variables de entorno

| Variable | Descripción | Valor por defecto |
|----------|------------|-------------------|
| DATABASE_PATH | Ruta de la base de datos SQLite | /app/data/docflow.db |
| PROJECTS_PATH | Directorio de proyectos | /app/data/projects |
| OPENCLAW_URL | URL del gateway de OpenClaw | http://192.168.1.49:18789 |
| N8N_WEBHOOK_URL | URL base de n8n | http://192.168.1.49:5678 |
| N8N_PROCESS_WEBHOOK_PATH | Path del webhook de procesamiento | /webhook/docflow-process |
| QDRANT_URL | URL de Qdrant | http://192.168.1.49:6333 |
| LITELLM_URL | URL de LiteLLM | http://192.168.1.49:4000 |
| LITELLM_API_KEY | API key de LiteLLM | sk-antigravity-gateway |
| EMBEDDING_MODEL | Modelo de embeddings | text-embedding-3-small |
| OPENCLAW_AGENTS | Lista de agentes (JSON, fallback) | (ver abajo) |

## Configuración de agentes

DocFlow intenta obtener la lista de agentes de OpenClaw automáticamente. Si no es posible, puedes definirlos manualmente en el .env:

```env
OPENCLAW_AGENTS=[{"id":"analista-proyecto","name":"Analista de Proyecto","emoji":"🔍","model":"gemini-3.1-pro-preview","description":"Analiza documentación y genera Documento de Visión"},{"id":"prd-gen","name":"PRD Generator","emoji":"📋","model":"claude-sonnet","description":"Genera PRD con user stories"}]
```

## Configuración del workflow de n8n

DocFlow envía un webhook POST a n8n para procesar documentos. Necesitas crear un workflow en n8n:

1. Abre n8n (http://TU_IP:5678)
2. Crea un nuevo workflow con un nodo Webhook (método POST, path: `docflow-process`)
3. El webhook recibe un JSON con: project_id, sources (array), agent_id, instructions, callback_url
4. Procesa las fuentes con el agente de OpenClaw
5. Envía el resultado al callback_url

## Configuración de OpenClaw

Si OpenClaw escucha en loopback (127.0.0.1), Docker no puede alcanzarlo. Cámbialo a LAN:

```bash
openclaw config set gateway.bind 'lan'
systemctl --user restart openclaw-gateway.service
```

## Actualizar DocFlow

```bash
cd ~/docflow
git pull origin main
docker compose build --no-cache
docker compose up -d
docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/
docker restart docflow-app
```

## Troubleshooting

| Problema | Solución |
|----------|----------|
| Error SQLITE_CANTOPEN | `docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/` |
| OpenClaw desconectado | `openclaw config set gateway.bind 'lan'` + restart gateway |
| Build falla con node:18 | Verificar que el Dockerfile usa `node:20-alpine` |
| Build falla por ESLint | Revisar imports no usados en los archivos modificados |
| Servicios no alcanzables | Verificar que usas la IP del host (192.168.1.49), no nombres Docker |

## Stack técnico

- Frontend: Next.js 14 (App Router) + React 18 + Tailwind CSS + shadcn/ui
- Base de datos: SQLite (better-sqlite3)
- Vector DB: Qdrant
- Contenedorización: Docker + Docker Compose
- Agentes IA: OpenClaw
- Orquestación: n8n
- LLM Gateway: LiteLLM
