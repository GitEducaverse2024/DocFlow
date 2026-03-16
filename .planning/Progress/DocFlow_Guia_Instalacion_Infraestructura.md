# DocFlow — Guía de Instalación Completa de Infraestructura

> Guía para montar el stack completo de DocFlow desde cero en un servidor Ubuntu.
> Incluye todos los servicios, configuración, dependencias y verificación.
> Versión: 1.0 | Última actualización: Marzo 2026

---

## Índice

1. [Requisitos del sistema](#1-requisitos-del-sistema)
2. [Arquitectura general](#2-arquitectura-general)
3. [Paso 1: Preparar el servidor](#3-paso-1-preparar-el-servidor)
4. [Paso 2: Instalar Docker y Docker Compose](#4-paso-2-instalar-docker-y-docker-compose)
5. [Paso 3: Instalar Node.js 22 LTS](#5-paso-3-instalar-nodejs-22-lts)
6. [Paso 4: Instalar y configurar OpenClaw](#6-paso-4-instalar-y-configurar-openclaw)
7. [Paso 5: Instalar Mission Control (GUI de OpenClaw)](#7-paso-5-instalar-mission-control)
8. [Paso 6: Instalar y configurar LiteLLM Gateway](#8-paso-6-instalar-y-configurar-litellm-gateway)
9. [Paso 7: Instalar y configurar n8n](#9-paso-7-instalar-y-configurar-n8n)
10. [Paso 8: Desplegar DocFlow](#10-paso-8-desplegar-docflow)
11. [Paso 9: Configurar API Keys de LLMs](#11-paso-9-configurar-api-keys)
12. [Paso 10: Configurar el Gateway Watcher](#12-paso-10-configurar-gateway-watcher)
13. [Paso 11: Verificación completa](#13-paso-11-verificacion-completa)
14. [Puertos y servicios](#14-puertos-y-servicios)
15. [Variables de entorno](#15-variables-de-entorno)
16. [Estructura de directorios](#16-estructura-de-directorios)
17. [Operaciones habituales](#17-operaciones-habituales)
18. [Troubleshooting](#18-troubleshooting)
19. [Seguridad](#19-seguridad)
20. [Backup y restauración](#20-backup-y-restauracion)

---

## 1. Requisitos del sistema

### Hardware mínimo

| Componente | Mínimo | Recomendado |
|-----------|--------|-------------|
| CPU | 4 cores | 8+ cores |
| RAM | 16 GB | 32+ GB |
| Disco | 100 GB SSD | 500+ GB SSD |
| GPU NVIDIA | Opcional | RTX 3060+ (para Ollama local) |
| Red | LAN | LAN con IP fija |

### Software base

| Software | Versión | Notas |
|----------|---------|-------|
| Ubuntu | 22.04 o 24.04 LTS | Server o Desktop |
| Docker | 24+ | Con Docker Compose v2 |
| Node.js | 22 LTS | Para OpenClaw |
| Git | 2.30+ | Para clonar repos |
| nvidia-container-toolkit | Último | Solo si hay GPU NVIDIA |

### Cuentas y API Keys necesarias

| Servicio | Obligatorio | Para qué |
|----------|------------|----------|
| Google Cloud (Vertex AI) | Sí | Gemini 3.1 Pro (modelo principal) |
| Anthropic | Opcional | Claude Sonnet/Opus |
| OpenAI | Opcional | GPT-4o, GPT-5.4 |
| Telegram Bot | Opcional | Bot conversacional en Telegram |

---

## 2. Arquitectura general

```
┌─────────────────────────────────────────────────────────────┐
│                     SERVIDOR (Ubuntu)                        │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    Docker Compose                        │ │
│  │                                                           │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │ │
│  │  │ DocFlow  │  │  Qdrant  │  │  Ollama  │  │ LiteLLM │ │ │
│  │  │  :3500   │  │  :6333   │  │  :11434  │  │  :4000  │ │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │ │
│  │                                                           │ │
│  │  ┌──────────┐                                            │ │
│  │  │   n8n    │                                            │ │
│  │  │  :5678   │                                            │ │
│  │  └──────────┘                                            │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                   Systemd (usuario)                       │ │
│  │                                                           │ │
│  │  ┌──────────────┐  ┌───────────────────┐                │ │
│  │  │   OpenClaw   │  │ Mission Control   │                │ │
│  │  │   :18789     │  │     :3333         │                │ │
│  │  └──────────────┘  └───────────────────┘                │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Comunicación entre servicios

Todos los servicios se comunican usando la IP física del servidor (no nombres de Docker ni localhost). Esto es porque algunos contenedores corren en redes Docker diferentes y no resuelven nombres entre sí.

**Regla fundamental: usar siempre `IP_DEL_SERVIDOR:PUERTO` en todas las URLs de configuración.**

---

## 3. Paso 1: Preparar el servidor

### Actualizar el sistema

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential
```

### Crear usuario (si no existe)

```bash
# Si usas un usuario existente, salta este paso
sudo adduser docflow
sudo usermod -aG sudo docflow
sudo usermod -aG docker docflow
su - docflow
```

### Configurar IP fija (recomendado)

Edita la configuración de red para asignar una IP fija. En el resto de la guía usaremos `IP_SERVER` como placeholder — reemplázala por la IP real de tu servidor.

```bash
# Averiguar tu IP actual
ip addr show | grep "inet " | grep -v 127.0.0.1
```

### Habilitar lingering para servicios de usuario

```bash
sudo loginctl enable-linger $USER
```

Esto permite que los servicios systemd del usuario se ejecuten sin necesidad de tener sesión abierta.

---

## 4. Paso 2: Instalar Docker y Docker Compose

### Instalar Docker

```bash
# Añadir repositorio oficial
curl -fsSL https://get.docker.com | sh

# Añadir usuario al grupo docker
sudo usermod -aG docker $USER

# Aplicar cambios de grupo (o cerrar sesión y volver a abrir)
newgrp docker

# Verificar
docker --version
docker compose version
```

### Instalar plugin buildx (si no viene incluido)

```bash
sudo apt-get install -y docker-buildx-plugin
```

### Instalar nvidia-container-toolkit (solo si hay GPU)

```bash
# Añadir repositorio NVIDIA
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Configurar Docker para usar GPU
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Verificar
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

---

## 5. Paso 3: Instalar Node.js 22 LTS

OpenClaw requiere Node.js 22+.

```bash
# Instalar NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

# Instalar Node.js 22 LTS
nvm install 22
nvm use 22
nvm alias default 22

# Verificar
node -v   # Debe mostrar v22.x
npm -v
```

---

## 6. Paso 4: Instalar y configurar OpenClaw

OpenClaw es el motor de agentes conversacionales. Corre como servicio systemd del usuario (no en Docker).

### Instalar OpenClaw

```bash
# Instalar via npm
npm install -g openclaw

# Verificar instalación
openclaw --version
openclaw doctor
```

### Configurar modelo por defecto

OpenClaw necesita al menos un modelo LLM configurado. La forma más simple es usar una API key de Google AI Studio (Gemini):

```bash
# Opción A: Google AI Studio (API key gratuita)
mkdir -p ~/.openclaw
cat > ~/.openclaw/.env << 'EOF'
GEMINI_API_KEY=TU_API_KEY_DE_GOOGLE_AI_STUDIO
EOF

# Opción B: Usar LiteLLM como proxy (se configura después)
# Se configurará cuando LiteLLM esté corriendo
```

### Configurar el gateway para acceso LAN

Por defecto OpenClaw solo escucha en localhost. Para que DocFlow (Docker) pueda acceder:

```bash
openclaw config set gateway.bind 'lan'
```

### Crear servicio systemd

```bash
# Generar token y configurar servicio
openclaw doctor --generate-gateway-token
openclaw doctor --fix

# Habilitar y arrancar
systemctl --user enable openclaw-gateway.service
systemctl --user start openclaw-gateway.service

# Verificar
sleep 3
openclaw gateway status
ss -ltnp | grep 18789
```

Debe mostrar `0.0.0.0:18789` y "RPC probe: ok".

### Crear agentes base (opcional)

```bash
# Agente analista de proyecto
openclaw agents add analista-proyecto
# Workspace: Enter (default)
# Copy auth from main: Yes
# Todo lo demás: No

# Agente PRD Generator
openclaw agents add prd-gen
# Mismas respuestas
```

---

## 7. Paso 5: Instalar Mission Control

Mission Control es una GUI web para gestionar OpenClaw visualmente.

### Clonar e instalar

```bash
cd ~/.openclaw
git clone https://github.com/robsannaa/openclaw-mission-control.git
cd openclaw-mission-control
./setup.sh
```

### Crear servicio systemd

```bash
mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/openclaw-dashboard.service << 'EOF'
[Unit]
Description=OpenClaw Mission Control Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/TUUSUARIO/.openclaw/openclaw-mission-control
ExecStart=/usr/bin/env bash -lc 'cd "/home/TUUSUARIO/.openclaw/openclaw-mission-control" && PORT="3333" HOST="0.0.0.0" npm run start -- -H "0.0.0.0" -p "3333"'
Restart=always
RestartSec=2
Environment=PORT=3333
Environment=HOST=0.0.0.0

[Install]
WantedBy=default.target
EOF

# IMPORTANTE: Reemplaza TUUSUARIO por tu nombre de usuario real
sed -i "s/TUUSUARIO/$USER/g" ~/.config/systemd/user/openclaw-dashboard.service

systemctl --user daemon-reload
systemctl --user enable openclaw-dashboard.service
systemctl --user start openclaw-dashboard.service

# Verificar
sleep 5
curl -s http://localhost:3333 | head -5
```

Accede a `http://IP_SERVER:3333` para verificar.

---

## 8. Paso 6: Instalar y configurar LiteLLM Gateway

LiteLLM actúa como proxy universal de modelos LLM. Permite usar Gemini, Claude, GPT y otros con una API compatible con OpenAI.

### Crear directorio del proyecto

```bash
mkdir -p ~/open-antigravity-workspace/config
cd ~/open-antigravity-workspace
```

### Configurar credenciales de Google Cloud (Vertex AI)

```bash
# Opción A: Service Account Key
# Descarga el JSON de tu proyecto en Google Cloud Console
# Cópialo a config/vertex-key.json
cp /ruta/a/tu/service-account-key.json config/vertex-key.json

# Opción B: Application Default Credentials
gcloud auth application-default login
```

### Crear routing.yaml

```bash
cat > config/routing.yaml << 'EOF'
model_list:
  # Gemini (via Vertex AI) — Modelo principal
  - model_name: gemini-main
    litellm_params:
      model: vertex_ai/gemini-3.1-pro-preview
      vertex_project: "os.environ/VERTEX_PROJECT_ID"
      vertex_location: "os.environ/VERTEX_LOCATION"

  # Alias con prefijo para compatibilidad con OpenHands
  - model_name: openai/gemini-main
    litellm_params:
      model: vertex_ai/gemini-3.1-pro-preview
      vertex_project: "os.environ/VERTEX_PROJECT_ID"
      vertex_location: "os.environ/VERTEX_LOCATION"

  # Claude (API directa de Anthropic)
  - model_name: claude-opus
    litellm_params:
      model: anthropic/claude-opus-4-6
      api_key: "os.environ/ANTHROPIC_API_KEY"

  - model_name: openai/claude-opus
    litellm_params:
      model: anthropic/claude-opus-4-6
      api_key: "os.environ/ANTHROPIC_API_KEY"

  - model_name: claude-sonnet
    litellm_params:
      model: anthropic/claude-sonnet-4-6
      api_key: "os.environ/ANTHROPIC_API_KEY"

  - model_name: openai/claude-sonnet
    litellm_params:
      model: anthropic/claude-sonnet-4-6
      api_key: "os.environ/ANTHROPIC_API_KEY"

  # GPT (API directa de OpenAI) — Opcional
  # - model_name: gpt-5.4
  #   litellm_params:
  #     model: openai/gpt-5.4
  #     api_key: "os.environ/OPENAI_API_KEY"
EOF
```

### Crear .env

```bash
cat > .env << 'EOF'
VERTEX_PROJECT_ID=tu-proyecto-gcp
VERTEX_LOCATION=global
GOOGLE_APPLICATION_CREDENTIALS=/app/config/vertex-key.json

# Descomentar y rellenar si tienes las keys
# ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
EOF
```

**IMPORTANTE:** `VERTEX_LOCATION` debe ser `global` para Gemini 3.1 Pro Preview. No usar regiones específicas.

### Crear docker-compose.yml para LiteLLM

```bash
cat > docker-compose.yml << 'EOF'
services:
  llm-gateway:
    image: ghcr.io/berriai/litellm:main-latest
    container_name: antigravity-gateway
    ports:
      - "4000:4000"
    volumes:
      - ./config:/app/config
    env_file: [.env]
    command: ["--config", "/app/config/routing.yaml", "--port", "4000"]
    restart: always
EOF
```

### Arrancar y verificar

```bash
docker compose up -d

# Verificar
sleep 5
curl -s http://localhost:4000/v1/models -H 'Authorization: Bearer sk-antigravity-gateway' | python3 -m json.tool
```

Debe mostrar los modelos configurados.

---

## 9. Paso 7: Instalar y configurar n8n

n8n es el motor de automatización de workflows. Es opcional pero recomendado para conectores externos.

### Crear directorio

```bash
mkdir -p ~/n8n-automation
cd ~/n8n-automation
```

### Crear docker-compose.yml

```bash
cat > docker-compose.yml << 'EOF'
services:
  n8n:
    image: n8nio/n8n:latest
    container_name: automation-n8n
    ports:
      - "5678:5678"
    volumes:
      - n8n-data:/home/node/.n8n
    environment:
      - N8N_SECURE_COOKIE=false
      - N8N_HOST=0.0.0.0
      - WEBHOOK_URL=http://IP_SERVER:5678/
    restart: unless-stopped

volumes:
  n8n-data:
EOF

# Reemplazar IP_SERVER
sed -i "s/IP_SERVER/$(hostname -I | awk '{print $1}')/g" docker-compose.yml
```

### Arrancar y verificar

```bash
docker compose up -d
sleep 5
curl -s http://localhost:5678/healthz
```

Accede a `http://IP_SERVER:5678` para el setup inicial de n8n.

---

## 10. Paso 8: Desplegar DocFlow

### Clonar el repositorio

```bash
cd ~
git clone https://github.com/GitEducaverse2024/DocFlow.git docflow
cd docflow
```

### Crear directorio de datos

```bash
mkdir -p ~/docflow-data/projects
```

### Configurar variables de entorno

```bash
# Detectar IP del servidor
SERVER_IP=$(hostname -I | awk '{print $1}')

cat > .env << EOF
# DocFlow Core
DATABASE_PATH=/app/data/docflow.db
PROJECTS_PATH=/app/data/projects

# Servicios externos (usar IP física, NUNCA nombres Docker)
OPENCLAW_URL=http://${SERVER_IP}:18789
N8N_WEBHOOK_URL=http://${SERVER_IP}:5678
N8N_PROCESS_WEBHOOK_PATH=/webhook/docflow-process
QDRANT_URL=http://${SERVER_IP}:6333
LITELLM_URL=http://${SERVER_IP}:4000
LITELLM_API_KEY=sk-antigravity-gateway

# Ollama (embeddings locales)
OLLAMA_URL=http://docflow-ollama:11434
EMBEDDING_MODEL=nomic-embed-text

# Modelo de chat por defecto
CHAT_MODEL=gemini-main

# Agentes de OpenClaw (fallback si la API no los devuelve)
OPENCLAW_AGENTS=[{"id":"main","name":"Main","emoji":"🦞","model":"gemini-main","description":"Agente general"}]

# Ruta al workspace de OpenClaw en el HOST
OPENCLAW_WORKSPACE_PATH=/home/${USER}/.openclaw
OPENCLAW_HOST_PATH=/home/${USER}/.openclaw
EOF
```

### Verificar docker-compose.yml

El `docker-compose.yml` de DocFlow incluye 4 servicios:

| Servicio | Función |
|----------|---------|
| `docflow-init` | Arregla permisos de volúmenes al arrancar |
| `docflow` | App principal (Next.js) |
| `qdrant` | Base de datos vectorial para RAG |
| `ollama` | Embeddings locales con GPU |

El `docker-compose.yml` usa `${HOME}` para las rutas de volúmenes, así que funcionará automáticamente con cualquier usuario. No necesitas editar las rutas manualmente.

### Construir y arrancar

```bash
docker compose build --no-cache
docker compose up -d

# Verificar que todos los contenedores están corriendo
docker compose ps
```

Debe mostrar 4 servicios: `docflow-init` (Exited OK), `docflow-app` (Running), `docflow-qdrant` (Running), `docflow-ollama` (Running).

### Dar permisos iniciales

```bash
# Permisos para el workspace de OpenClaw
sudo chmod -R a+rw ~/.openclaw/

# Verificar acceso desde el contenedor
docker exec docflow-app ls /app/openclaw/ 2>/dev/null && echo "OpenClaw OK" || echo "OpenClaw NO montado"
docker exec docflow-app ls /app/data/ && echo "Data OK"
```

### Verificar la app

```bash
# Health check
sleep 10
curl -s http://localhost:3500/api/health | python3 -m json.tool
```

Debe mostrar los 4 servicios conectados. Accede a `http://IP_SERVER:3500`.

---

## 11. Paso 9: Configurar API Keys de LLMs

Accede a `http://IP_SERVER:3500/settings` en el navegador.

### Configurar LiteLLM (ya pre-configurado)

Pulsa "Verificar" en la card de LiteLLM. Debe mostrar los modelos disponibles en verde.

### Configurar Ollama (ya pre-configurado)

Pulsa "Verificar" en la card de Ollama. Si no hay modelos, el primer RAG que hagas descargará `nomic-embed-text` automáticamente.

### Configurar OpenAI (opcional)

1. Ve a https://platform.openai.com/api-keys
2. Crea una nueva API key
3. Pégala en la card de OpenAI en DocFlow Settings
4. Pulsa "Guardar" y luego "Verificar"

### Configurar Anthropic (opcional)

1. Ve a https://console.anthropic.com/settings/keys
2. Crea una nueva API key
3. Pégala en la card de Anthropic
4. Pulsa "Guardar" y luego "Verificar"

### Configurar Google Gemini directo (opcional)

1. Ve a https://aistudio.google.com/app/apikey
2. Crea una API key
3. Pégala en la card de Google
4. "Guardar" y "Verificar"

---

## 12. Paso 10: Configurar el Gateway Watcher

El gateway watcher es un cron job que reinicia automáticamente el gateway de OpenClaw cuando DocFlow crea un agente nuevo.

```bash
cd ~/docflow

# Dar permisos de ejecución
chmod +x scripts/gateway-watcher.sh scripts/setup-gateway-watcher.sh

# Instalar (una sola vez)
bash scripts/setup-gateway-watcher.sh

# Verificar
crontab -l | grep gateway
```

---

## 12b. Paso 10b: Instalar el Host Agent de CatBot

El Host Agent es un microservicio ligero que corre en el host y actúa como puente entre CatBot (dentro de Docker) y el sistema host. Permite ejecutar comandos, gestionar servicios y acceder a archivos del host de forma segura.

### Instalar y arrancar

```bash
cd ~/docflow

# Dar permisos de ejecución
chmod +x scripts/host-agent.mjs scripts/setup-host-agent.sh

# Ejecutar el instalador
bash scripts/setup-host-agent.sh
```

El script automáticamente:
1. Genera un token de autenticación aleatorio (64 caracteres hex)
2. Añade `HOST_AGENT_TOKEN` y `HOST_AGENT_URL` al `.env`
3. Crea un servicio systemd del usuario (`docatflow-host-agent.service`)
4. Arranca y habilita el servicio
5. Verifica con un health check

### Rebuild del contenedor

Después de instalar el Host Agent, rebuild DocFlow para que lea las nuevas variables:

```bash
docker compose build --no-cache && docker compose up -d
```

### Verificar conectividad

```bash
# Desde el host
curl -s http://localhost:3501/health | python3 -m json.tool

# Desde el contenedor (verifica que host.docker.internal funciona)
docker exec docflow-app node -e "fetch('http://host.docker.internal:3501/health').then(r=>r.json()).then(d=>console.log(JSON.stringify(d)))"
```

### Configurar seguridad sudo en CatBot

1. Accede a `http://IP_SERVER:3500/settings`
2. Sección **CatBot → Seguridad**
3. Establece una clave sudo (mínimo 4 caracteres)
4. Configura la duración de la sesión (por defecto 5 minutos)
5. Selecciona qué herramientas requieren autenticación sudo

### Cómo funciona

```
┌─────────────────────┐     ┌──────────────────────────┐
│  DocFlow (Docker)   │     │      Host (systemd)      │
│                     │     │                          │
│  CatBot ──► sudo    │     │                          │
│  tools.ts ─────────────►  │  Host Agent (:3501)      │
│            HTTP     │     │  ├── /execute (bash)     │
│            Bearer   │     │  ├── /service (systemctl)│
│            token    │     │  ├── /files (read/write) │
│                     │     │  └── /health             │
└─────────────────────┘     └──────────────────────────┘
```

**Seguridad:**
- Todas las peticiones requieren Bearer token (generado por el setup)
- Comandos peligrosos bloqueados (`rm -rf /`, `shutdown`, `reboot`, etc.)
- Acceso a archivos limitado a directorios permitidos (`~/docflow/`, `~/.openclaw/`, `~/docflow-data/`, `/tmp/`)
- Clave sudo protegida con hash scrypt + salt aleatorio
- Sesiones con TTL configurable, bloqueo tras 5 intentos fallidos

---

## 13. Paso 11: Verificación completa

### Checklist de servicios

```bash
echo "=== DocFlow ==="
curl -s http://localhost:3500/api/health | python3 -m json.tool

echo "=== LiteLLM ==="
curl -s http://localhost:4000/v1/models -H 'Authorization: Bearer sk-antigravity-gateway' | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'{len(d.get(\"data\",[]))} modelos')"

echo "=== Qdrant ==="
curl -s http://localhost:6333/collections | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'{len(d.get(\"result\",{}).get(\"collections\",[]))} colecciones')"

echo "=== Ollama ==="
curl -s http://localhost:11434/api/tags | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'{len(d.get(\"models\",[]))} modelos')" 2>/dev/null || echo "Sin modelos (se descargan con el primer RAG)"

echo "=== OpenClaw ==="
openclaw gateway status

echo "=== Mission Control ==="
curl -s http://localhost:3333 > /dev/null && echo "OK" || echo "No disponible"

echo "=== n8n ==="
curl -s http://localhost:5678/healthz > /dev/null && echo "OK" || echo "No disponible"
```

### Checklist funcional

- [ ] `http://IP_SERVER:3500` — DocFlow carga
- [ ] `http://IP_SERVER:3500/system` — 4 servicios conectados
- [ ] `http://IP_SERVER:3500/settings` — API Keys configurables
- [ ] `http://IP_SERVER:3500/agents` — Agentes de OpenClaw visibles
- [ ] `http://IP_SERVER:3500/workers` — 3 workers predefinidos
- [ ] `http://IP_SERVER:3500/skills` — 5 skills predefinidas
- [ ] Crear proyecto + subir fuente .txt → funciona
- [ ] Procesar con gemini-main → genera documento
- [ ] Indexar RAG → descarga modelo Ollama + indexa vectores
- [ ] Chat → responde basándose en el documento
- [ ] Crear agente custom → aparece en OpenClaw tras ~1 minuto
- [ ] CatBot básico → responde preguntas, navega, crea recursos
- [ ] CatBot sudo → configurar clave, activar, ejecutar `hostname` → muestra nombre del servidor
- [ ] Host Agent → `curl http://localhost:3501/health` → `{"status":"ok"}`
- [ ] `http://IP_SERVER:18789` — OpenClaw Dashboard
- [ ] `http://IP_SERVER:3333` — Mission Control
- [ ] `http://IP_SERVER:5678` — n8n

---

## 14. Puertos y servicios

| Puerto | Servicio | Tipo | Acceso |
|--------|----------|------|--------|
| 3500 | DocFlow | Docker | App principal |
| 4000 | LiteLLM | Docker | Proxy de modelos LLM |
| 5678 | n8n | Docker | Automatización |
| 6333 | Qdrant | Docker | Base vectorial |
| 6334 | Qdrant gRPC | Docker | API gRPC de Qdrant |
| 11434 | Ollama | Docker | Embeddings locales (GPU) |
| 18789 | OpenClaw | Systemd | Gateway de agentes |
| 3333 | Mission Control | Systemd | GUI de OpenClaw |
| 3501 | Host Agent | Systemd | Puente CatBot → host |
| 9000 | Portainer | Docker | Gestión de contenedores (opcional) |

---

## 15. Variables de entorno

### DocFlow (.env en ~/docflow/)

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `DATABASE_PATH` | `/app/data/docflow.db` | Ruta de SQLite dentro del contenedor |
| `PROJECTS_PATH` | `/app/data/projects` | Directorio de proyectos |
| `OPENCLAW_URL` | `http://IP:18789` | Gateway de OpenClaw |
| `N8N_WEBHOOK_URL` | `http://IP:5678` | Base URL de n8n |
| `QDRANT_URL` | `http://IP:6333` | Base vectorial |
| `LITELLM_URL` | `http://IP:4000` | Proxy LLM |
| `LITELLM_API_KEY` | `sk-antigravity-gateway` | Key del proxy |
| `OLLAMA_URL` | `http://docflow-ollama:11434` | Ollama (mismo compose) |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Modelo de embeddings |
| `CHAT_MODEL` | `gemini-main` | Modelo de chat por defecto |
| `OPENCLAW_AGENTS` | `[{...}]` | Agentes fallback (JSON) |
| `OPENCLAW_WORKSPACE_PATH` | `/home/USER/.openclaw` | Path HOST del workspace |
| `OPENCLAW_HOST_PATH` | `/home/USER/.openclaw` | Path HOST para openclaw.json |
| `HOST_AGENT_TOKEN` | (generado) | Token de autenticación del Host Agent |
| `HOST_AGENT_URL` | `http://host.docker.internal:3501` | URL del Host Agent |
| `SERVER_HOSTNAME` | `localhost` | Nombre/IP del servidor (para CatBot) |
| `DOCFLOW_USER` | `usuario` | Nombre del usuario (para agentes) |

### LiteLLM (.env en ~/open-antigravity-workspace/)

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `VERTEX_PROJECT_ID` | `tu-proyecto-gcp` | Proyecto en Google Cloud |
| `VERTEX_LOCATION` | `global` | DEBE ser global para Gemini 3.1 |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/app/config/vertex-key.json` | Service Account |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Key de Anthropic (opcional) |
| `OPENAI_API_KEY` | `sk-...` | Key de OpenAI (opcional) |

### OpenClaw (.env en ~/.openclaw/)

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `GEMINI_API_KEY` | `AI...` | Key de Google AI Studio |

---

## 16. Estructura de directorios

```
~/
├── docflow/                          # Repositorio de DocFlow
│   ├── app/                          # Aplicación Next.js
│   │   ├── src/                      # Código fuente
│   │   ├── scripts/                  # RAG worker, etc.
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── docker-compose.yml            # DocFlow + Qdrant + Ollama + Init
│   ├── .env                          # Variables de entorno
│   ├── scripts/
│   │   ├── host-agent.mjs            # Host Agent (CatBot → host)
│   │   ├── setup-host-agent.sh       # Instalador del Host Agent
│   │   ├── gateway-watcher.sh        # Cron de reinicio del gateway
│   │   └── setup-gateway-watcher.sh  # Instalador del cron
│   └── qdrant-data/                  # Datos persistentes de Qdrant
│
├── docflow-data/                     # Datos de DocFlow (volumen Docker)
│   ├── docflow.db                    # Base de datos SQLite
│   ├── projects/                     # Archivos de proyectos
│   │   └── {uuid}/
│   │       ├── sources/              # Fuentes subidas
│   │       └── processed/            # Documentos generados
│   │           └── v{N}/
│   │               └── output.md
│   └── .restart-gateway              # Señal para el watcher
│
├── open-antigravity-workspace/       # LiteLLM Gateway
│   ├── docker-compose.yml
│   ├── .env
│   └── config/
│       ├── routing.yaml              # Configuración de modelos
│       └── vertex-key.json           # Service Account de GCP
│
├── n8n-automation/                   # n8n
│   └── docker-compose.yml
│
├── .openclaw/                        # OpenClaw (systemd)
│   ├── openclaw.json                 # Configuración global
│   ├── .env                          # API key de Gemini
│   ├── workspace/                    # Workspace del agente main
│   ├── workspace-{agent-id}/         # Workspaces de agentes
│   │   ├── SOUL.md
│   │   ├── AGENTS.md
│   │   ├── IDENTITY.md
│   │   ├── USER.md
│   │   └── TOOLS.md
│   ├── agents/                       # Datos internos de agentes
│   │   └── {agent-id}/
│   │       ├── agent/
│   │       └── sessions/
│   └── openclaw-mission-control/     # Mission Control (Git clone)
└── .config/
    └── systemd/user/
        ├── openclaw-gateway.service
        ├── openclaw-dashboard.service
        └── docatflow-host-agent.service
```

---

## 17. Operaciones habituales

### Actualizar DocFlow

```bash
cd ~/docflow
git pull origin main
docker compose build --no-cache
docker compose up -d
```

### Alias recomendado

Añadir a `~/.bashrc`:

```bash
alias dfdeploy='cd ~/docflow && docker compose build --no-cache && docker compose up -d && echo LISTO'
```

### Ver logs

```bash
# DocFlow
docker logs -f docflow-app

# LiteLLM
docker logs -f antigravity-gateway

# Qdrant
docker logs -f docflow-qdrant

# Ollama
docker logs -f docflow-ollama

# OpenClaw
journalctl --user -u openclaw-gateway.service -f

# Mission Control
journalctl --user -u openclaw-dashboard.service -f

# Host Agent
journalctl --user -u docatflow-host-agent.service -f

# n8n
docker logs -f automation-n8n
```

### Reiniciar servicios

```bash
# DocFlow completo
cd ~/docflow && docker compose down && docker compose up -d

# Solo DocFlow app
docker restart docflow-app

# LiteLLM (recarga .env)
cd ~/open-antigravity-workspace && docker compose down && docker compose up -d

# OpenClaw
systemctl --user restart openclaw-gateway.service

# Mission Control
systemctl --user restart openclaw-dashboard.service

# Host Agent (CatBot superpoderes)
systemctl --user restart docatflow-host-agent.service
```

### Limpiar contenedores huérfanos

```bash
# Eliminar agent-servers de OpenHands (si se usó)
docker ps -a | grep oh-agent | awk '{print $1}' | xargs -r docker rm -f

# Limpiar imágenes no usadas
docker image prune -f
```

---

## 18. Troubleshooting

| Problema | Causa | Solución |
|----------|-------|----------|
| `SQLITE_CANTOPEN` | Permisos del directorio de datos | El init container debería arreglarlo. Si persiste: `docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/` |
| OpenClaw desconectado en DocFlow | OpenClaw escucha en loopback | `openclaw config set gateway.bind 'lan'` + restart |
| Agentes vacíos en DocFlow | Variable .env no cargada | `docker compose down && docker compose up -d` (no `restart`) |
| `ld-linux-x86-64.so.2 not found` | node_modules locales copiados al contenedor | Verificar `.dockerignore` excluye `node_modules` |
| Variables .env no se aplican | `docker restart` no recarga env | Usar `docker compose down && docker compose up -d` |
| RAG OOM (out of memory) | Worker sin memoria suficiente | El worker corre en proceso separado con 1GB. Verificar `--max-old-space-size` en Dockerfile |
| PDF muestra caracteres binarios | Sin extractor de PDF | Verificar que `poppler-utils` está instalado en el Dockerfile |
| Error 400 "invalid model" | Modelo sin prefijo de provider | Los modelos en LiteLLM necesitan prefijo: `openai/gpt-4o`, `gemini/gemini-2.5-flash` |
| Gateway no se reinicia automáticamente | Watcher no instalado | Ejecutar `bash ~/docflow/scripts/setup-gateway-watcher.sh` |
| Permisos de /app/openclaw | Volumen con UID diferente | El init container arregla esto. Si persiste: `sudo chmod -R a+rw ~/.openclaw/` |
| Mission Control no accesible | Escucha en 127.0.0.1 | Editar service: cambiar `-H "127.0.0.1"` a `-H "0.0.0.0"` |

---

## 19. Seguridad

### Credenciales — Nunca compartir

- `~/.openclaw/.env` — Contiene API keys
- `~/open-antigravity-workspace/.env` — Contiene API keys
- `~/open-antigravity-workspace/config/vertex-key.json` — Service Account de GCP
- `~/docflow/.env` — Contiene keys del gateway
- `~/.openclaw/openclaw.json` — Puede contener API keys en la sección `env`

### Rotación de keys

Si una key se filtra accidentalmente:
1. Revocar inmediatamente en la consola del provider
2. Generar nueva key
3. Actualizar en los .env correspondientes
4. Reiniciar los servicios afectados

### Red

- Todos los servicios escuchan en `0.0.0.0` (accesibles desde la LAN)
- Si el servidor está expuesto a internet, configurar un firewall (`ufw`) para limitar acceso a la LAN
- Considerar reverse proxy (nginx/Caddy) con HTTPS para acceso externo
- Los tokens JWT de n8n y OpenClaw deben rotarse periódicamente

### Modo confirmación

Activar en OpenClaw para que pida aprobación antes de acciones destructivas:

```bash
# En settings.json de OpenHands (si se usa)
# confirmation_mode: true
```

---

## 20. Backup y restauración

### Qué respaldar

| Datos | Ruta | Prioridad |
|-------|------|-----------|
| Base de datos DocFlow | `~/docflow-data/docflow.db` | Alta |
| Proyectos (fuentes + procesados) | `~/docflow-data/projects/` | Alta |
| Configuración OpenClaw | `~/.openclaw/openclaw.json` | Alta |
| Workspaces de agentes | `~/.openclaw/workspace-*/` | Alta |
| Variables de entorno | `~/docflow/.env`, `~/open-antigravity-workspace/.env` | Alta |
| Credenciales GCP | `~/open-antigravity-workspace/config/vertex-key.json` | Alta |
| Datos de Qdrant | `~/docflow/qdrant-data/` | Media |
| Datos de n8n | Volumen Docker `n8n-data` | Media |
| Datos de Ollama | Volumen Docker `ollama-data` | Baja (se re-descarga) |

### Script de backup

```bash
#!/bin/bash
# backup-docflow.sh
BACKUP_DIR=~/backups/docflow-$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

# Base de datos
cp ~/docflow-data/docflow.db "$BACKUP_DIR/"

# Proyectos
tar czf "$BACKUP_DIR/projects.tar.gz" -C ~/docflow-data projects/

# OpenClaw config + workspaces
tar czf "$BACKUP_DIR/openclaw.tar.gz" -C ~/ .openclaw/openclaw.json .openclaw/workspace*/

# Variables de entorno
cp ~/docflow/.env "$BACKUP_DIR/docflow.env"
cp ~/open-antigravity-workspace/.env "$BACKUP_DIR/litellm.env"
cp ~/open-antigravity-workspace/config/vertex-key.json "$BACKUP_DIR/" 2>/dev/null

# Qdrant (opcional, se puede re-indexar)
# tar czf "$BACKUP_DIR/qdrant.tar.gz" -C ~/docflow qdrant-data/

echo "Backup creado en: $BACKUP_DIR"
du -sh "$BACKUP_DIR"
```

### Restaurar en un servidor nuevo

1. Instalar todo siguiendo esta guía (pasos 1-8)
2. Copiar los archivos de backup a las rutas correspondientes
3. `docker compose up -d` para arrancar DocFlow
4. Si no se respaldó Qdrant: re-indexar los proyectos desde la UI

---

## Notas finales

### Exportar la infraestructura (sin datos)

Para exportar la configuración sin datos personales:

```bash
mkdir -p ~/docflow-export

# Código
cp -r ~/docflow/app ~/docflow-export/app
cp ~/docflow/docker-compose.yml ~/docflow-export/
cp ~/docflow/scripts/*.sh ~/docflow-export/scripts/

# Templates de configuración (sin keys reales)
cat ~/docflow/.env | sed 's/=.*/=CAMBIAR/' > ~/docflow-export/.env.template
cat ~/open-antigravity-workspace/.env | sed 's/=.*/=CAMBIAR/' > ~/docflow-export/litellm.env.template
cp ~/open-antigravity-workspace/config/routing.yaml ~/docflow-export/routing.yaml.template

# Documentación
cp ~/docflow/README.md ~/docflow-export/
# Copiar esta guía
```

### Versiones probadas

| Componente | Versión verificada |
|-----------|-------------------|
| DocFlow | Git main (Mar 2026) |
| Next.js | 14.2.35 |
| OpenClaw | 2026.3.2 |
| Mission Control | 0.4.0 |
| LiteLLM | main-latest |
| Qdrant | latest |
| Ollama | latest |
| n8n | latest |
| Node.js | 22 LTS |
| Docker | 24+ |
| Ubuntu | 24.04 LTS |

---

## 21. Mantenimiento de SearXNG

### Actualizacion del contenedor

SearXNG se actualiza mediante el script incluido:

```bash
./scripts/update-searxng.sh
```

El script realiza:
1. Pull de la ultima imagen `searxng/searxng:latest`
2. Reinicio del contenedor `docflow-searxng`
3. Verificacion de salud (espera hasta 60s)

### Cron semanal

Para mantener SearXNG actualizado automaticamente, configurar un cron:

```bash
# Editar crontab
crontab -e

# Agregar (domingos a las 3:00 AM)
0 3 * * 0 /ruta/completa/a/docflow/scripts/update-searxng.sh >> /var/log/searxng-update.log 2>&1
```

### Troubleshooting

| Problema | Solucion |
|----------|----------|
| SearXNG no responde | `docker compose restart searxng` |
| JSON API deshabilitada | Verificar `searxng/settings.yml` tiene `formats: [html, json]` |
| Puerto 8080 ocupado | `docker compose down searxng && docker compose up -d searxng` |
| Resultados vacios | Verificar engines en settings.yml, algunos pueden estar bloqueados |
