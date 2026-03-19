# DocFlow - Sesion 4: Rediseno del Flujo de Agentes OpenClaw, Permisos Docker y Gateway Automatico

> Funcionalidades implementadas sobre la base documentada en `progressWebapp.md`, `progressSesion2.md` y `progressSesion3.md`. Esta sesion redisena completamente el flujo de creacion de agentes en OpenClaw: registro directo via manipulacion de archivos (sin CLI), 3 modos de creacion con UI unificada, correccion del contenido de archivos generados, fix global del portapapeles en HTTP, automatizacion de permisos Docker y reinicio del gateway via cron watcher.

---

## Indice

1. [Resumen de cambios](#1-resumen-de-cambios)
2. [Contexto critico: como funciona OpenClaw](#2-contexto-critico-como-funciona-openclaw)
3. [Registro directo en OpenClaw (sin CLI)](#3-registro-directo-en-openclaw-sin-cli)
4. [Contenido de archivos generados](#4-contenido-de-archivos-generados)
5. [Endpoint /api/agents/generate con 3 modos](#5-endpoint-apiagentsgenerate-con-3-modos)
6. [AgentCreator con 3 modos de creacion](#6-agentcreator-con-3-modos-de-creacion)
7. [Fix global del portapapeles (HTTP fallback)](#7-fix-global-del-portapapeles-http-fallback)
8. [Permisos Docker automaticos (init container)](#8-permisos-docker-automaticos-init-container)
9. [Reinicio automatico del gateway (cron watcher)](#9-reinicio-automatico-del-gateway-cron-watcher)
10. [Bugs resueltos](#10-bugs-resueltos)
11. [Archivos nuevos y modificados](#11-archivos-nuevos-y-modificados)
12. [Flujo completo verificado](#12-flujo-completo-verificado)
13. [Verificacion y build](#13-verificacion-y-build)

---

## 1. Resumen de cambios

### Problemas resueltos
- **Creacion de agentes fallaba**: OpenClaw sobreescribia los archivos del workspace con plantillas por defecto al registrar con CLI. DocFlow no podia ejecutar el CLI desde Docker.
- **SOUL.md con contenido por defecto**: Los agentes se creaban con plantillas en ingles de OpenClaw ("You're not a chatbot") en vez del contenido personalizado.
- **Boton copiar no funcionaba**: `navigator.clipboard.writeText` requiere HTTPS; DocFlow se sirve por HTTP.
- **Permisos perdidos al rebuild**: Cada `docker compose build` perdia escritura en `/app/openclaw` para el usuario `nextjs`.
- **Reinicio manual del gateway**: Habia que ejecutar `openclaw gateway restart` en el host manualmente tras crear un agente.

### Funcionalidades nuevas
- **Registro directo en openclaw.json** — DocFlow manipula el archivo JSON, crea directorios de sesiones y workspace sin depender del CLI
- **3 modos de creacion de agente** — Manual (con mejora silenciosa IA), Desde Skill, Generar con IA
- **Plantillas minimas en espanol** — SOUL.md, AGENTS.md, IDENTITY.md, USER.md, TOOLS.md con contenido funcional
- **Refinamiento silencioso con IA** — En modo manual, una llamada background al LLM mejora los archivos tras la creacion
- **Generacion desde Skill** — Nuevo modo que usa las instrucciones de un Skill existente como base para el agente
- **copyToClipboard()** — Utility con fallback `execCommand('copy')` para contextos HTTP
- **Init container** — Servicio Docker que arregla permisos automaticamente al arrancar
- **Gateway watcher** — Cron script que reinicia el gateway cuando DocFlow escribe una senal
- **Banner con countdown** — UI que muestra cuenta atras de 60s mientras el gateway se reinicia

### Archivos de infraestructura nuevos
- `scripts/gateway-watcher.sh` — Cron script para reinicio automatico
- `scripts/setup-gateway-watcher.sh` — Instalador one-time del cron

---

## 2. Contexto critico: como funciona OpenClaw

### El problema fundamental

Cuando OpenClaw registra un agente con `openclaw agents add`, **SOBREESCRIBE** todos los archivos del workspace (SOUL.md, AGENTS.md, IDENTITY.md) con plantillas por defecto en ingles. Esto significa que si DocFlow escribe los archivos ANTES del registro, se pierden.

Pero DocFlow corre dentro de Docker y **NO puede ejecutar** `openclaw agents add` (es un CLI del host).

### La solucion

Lo que `openclaw agents add` realmente hace internamente es:

1. Crear la entrada en `openclaw.json` (seccion `agents.list`)
2. Crear la carpeta de sesiones en `agents/{id}/`
3. Escribir las plantillas en el workspace

DocFlow puede hacer **todo esto directamente** manipulando los archivos, ya que el volumen `~/.openclaw` esta montado en `/app/openclaw`.

### Estructura real de openclaw.json

Archivo: `/home/deskmath/.openclaw/openclaw.json`

Cada agente en `agents.list` tiene esta estructura:

```json
{
  "id": "analista-proyecto",
  "name": "analista-proyecto",
  "workspace": "/home/deskmath/.openclaw/workspace-analista-proyecto",
  "agentDir": "/home/deskmath/.openclaw/agents/analista-proyecto/agent",
  "model": {
    "primary": "google/gemini-3.1-pro-preview",
    "fallbacks": ["anthropic/claude-sonnet-4-6"]
  },
  "identity": {
    "name": "Analista de Proyecto",
    "emoji": "🔍"
  }
}
```

**CRITICO:** Los paths en `workspace` y `agentDir` deben ser rutas del **HOST** (no de Docker), porque OpenClaw corre en el host, no en el contenedor.

### Mapeo de paths Docker → Host

```
Docker:  /app/openclaw/workspace-{id}
Host:    /home/deskmath/.openclaw/workspace-{id}
```

La funcion `toHostPath()` realiza esta conversion:

```typescript
function toHostPath(dockerPath: string): string {
  const hostBase = process['env']['OPENCLAW_HOST_PATH'] || '/home/deskmath/.openclaw';
  if (dockerPath.startsWith('/app/openclaw')) {
    return dockerPath.replace('/app/openclaw', hostBase);
  }
  return dockerPath;
}
```

### Estructura de directorios de un agente OpenClaw

```
~/.openclaw/
├── openclaw.json                       # Configuracion global
├── agents/
│   └── {agent-id}/
│       ├── agent/                      # Directorio de agente
│       └── sessions/                   # Sesiones de chat
└── workspace-{agent-id}/
    ├── .openclaw/
    │   └── workspace-state.json        # Estado interno
    ├── SOUL.md                         # Personalidad
    ├── AGENTS.md                       # Instrucciones operativas
    ├── IDENTITY.md                     # Metadata
    ├── USER.md                         # Info del usuario
    ├── TOOLS.md                        # Entorno y herramientas
    ├── HEARTBEAT.md                    # Generado por OpenClaw
    └── BOOTSTRAP.md                    # ⚠️ ELIMINAR — anula personalidad
```

**CRITICO:** `BOOTSTRAP.md` se DEBE eliminar. Si existe, OpenClaw lo usa como prompt inicial y anula la personalidad definida en SOUL.md.

---

## 3. Registro directo en OpenClaw (sin CLI)

### Flujo de registro en POST /api/agents/create

Archivo: `src/app/api/agents/create/route.ts`

Funcion `registerInOpenclaw()` que ejecuta los 6 pasos en orden:

```typescript
function registerInOpenclaw(
  openclawPath: string,
  agentId: string,
  name: string,
  emoji: string,
  model: string,
  soul: string,
  agentsMd: string,
  identity: string,
): { registered: boolean; warning?: string }
```

#### Paso 1: Registrar en openclaw.json

```typescript
const config = JSON.parse(fs.readFileSync(openclawJsonPath, 'utf-8'));
config.agents.list.push({
  id: agentId,
  name,
  workspace: toHostPath(workspacePath),       // Ruta HOST
  agentDir: toHostPath(path.join(openclawPath, 'agents', agentId, 'agent')),  // Ruta HOST
  model: { primary: model },
  identity: { name, emoji },
});
fs.writeFileSync(openclawJsonPath, JSON.stringify(config, null, 2), 'utf-8');
```

#### Paso 2: Crear directorios de sesiones

```typescript
fs.mkdirSync(path.join(openclawPath, 'agents', agentId, 'agent'), { recursive: true });
fs.mkdirSync(path.join(openclawPath, 'agents', agentId, 'sessions'), { recursive: true });
```

#### Paso 3: Crear directorio del workspace

```typescript
fs.mkdirSync(workspacePath, { recursive: true });
```

#### Paso 4: Crear directorio .openclaw/ interno

```typescript
fs.mkdirSync(path.join(workspacePath, '.openclaw'), { recursive: true });
```

#### Paso 5: Escribir archivos con contenido DocFlow

```typescript
fs.writeFileSync(path.join(workspacePath, 'SOUL.md'), soul, 'utf-8');
fs.writeFileSync(path.join(workspacePath, 'AGENTS.md'), agentsMd, 'utf-8');
fs.writeFileSync(path.join(workspacePath, 'IDENTITY.md'), identity, 'utf-8');
fs.writeFileSync(path.join(workspacePath, 'USER.md'), generateUser(), 'utf-8');
fs.writeFileSync(path.join(workspacePath, 'TOOLS.md'), generateTools(), 'utf-8');
```

#### Paso 6: Eliminar BOOTSTRAP.md

```typescript
const bootstrapPath = path.join(workspacePath, 'BOOTSTRAP.md');
if (fs.existsSync(bootstrapPath)) {
  fs.unlinkSync(bootstrapPath);
}
```

### Intento de recarga del gateway

Despues del registro, se intenta recargar via HTTP:

```typescript
async function tryReloadGateway(): Promise<boolean> {
  const endpoints = [
    `${openclawUrl}/rpc/config.reload`,
    `${openclawUrl}/rpc/gateway.reload`,
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method: 'POST', ... });
      if (res.ok) return true;
    } catch { /* try next */ }
  }
  return false;
}
```

### 3 estados de respuesta

| Estado | Significado | UI |
|--------|------------|-----|
| `active` | Gateway recargado OK | Badge verde "Agente creado y activado" |
| `created_pending_restart` | Registrado, gateway no recargado, senal escrita | Spinner violeta con countdown 60s |
| `created_no_openclaw` | No se pudo escribir openclaw.json | Badge amber con warning |

### Mismo flujo en POST /api/projects/[id]/bot/create

Archivo: `src/app/api/projects/[id]/bot/create/route.ts`

Replica el mismo flujo de 6 pasos pero con contenido especifico del proyecto:

- SOUL.md incluye nombre del proyecto, finalidad, stack, numero de fuentes
- AGENTS.md incluye referencia a la coleccion RAG de Qdrant
- TOOLS.md incluye la coleccion RAG especifica del proyecto
- Modelo fijo: `gemini/gemini-2.5-flash`
- Emoji fijo: `🎓`

---

## 4. Contenido de archivos generados

### Plantillas minimas (modo Manual, sin IA)

Cuando se crea un agente sin generacion por IA, los archivos se rellenan con plantillas funcionales en espanol.

#### SOUL.md minimo

```markdown
# {nombre del agente}

Soy {nombre}. {descripcion del agente}.

## Mi personalidad
- Profesional y directo
- Respondo siempre en espanol
- Me especializo en {descripcion}

## Lo que hago
{descripcion expandida}

## Lo que NO hago
- No invento informacion que no este en mi contexto
- No ejecuto acciones destructivas sin confirmacion
```

#### AGENTS.md minimo

```markdown
# Instrucciones Operativas — {nombre}

## Flujo de trabajo
1. Recibo la consulta o documentacion del usuario
2. Analizo el contenido disponible en mi base de conocimiento
3. Genero una respuesta estructurada y fundamentada

## Reglas
- Respondo siempre en espanol
- Cito las fuentes cuando es posible
- Si no tengo informacion suficiente, lo indico claramente
```

#### IDENTITY.md minimo

```markdown
# IDENTITY.md

- **Name:** {nombre}
- **Creature:** Asistente especializado
- **Vibe:** Profesional, directo, en espanol
- **Emoji:** {emoji}

{descripcion}
```

#### USER.md (fijo)

```markdown
# Usuario

- Nombre: deskmath
- Idioma: Espanol
- Contexto: Trabaja con DocFlow, OpenClaw, y un stack de IA local
```

#### TOOLS.md (fijo)

```markdown
# TOOLS.md - Entorno de trabajo

## Infraestructura (server-ia)
- OpenClaw: 127.0.0.1:18789 (gateway)
- DocFlow: localhost:3500 (documentacion)
- LiteLLM: localhost:4000 (proxy LLM)
- n8n: localhost:5678 (automatizacion)
- Qdrant: localhost:6333 (vectores)

## Idioma de trabajo
- Espanol

## Restricciones
- NO ejecutar codigo ni comandos de terminal
- NO acceder al sistema de archivos para modificar nada
- Trabajo exclusivamente con analisis y produccion de texto
```

---

## 5. Endpoint /api/agents/generate con 3 modos

Archivo: `src/app/api/agents/generate/route.ts`

El endpoint ahora acepta un campo `mode` en el body que determina el tipo de generacion:

### Modo 1: Default (generacion completa)

```typescript
// POST /api/agents/generate
{ mode: undefined, projectName, agentName, agentDescription, model, provider }
```

Genera `name`, `emoji`, `description`, `soul`, `agents`, `identity` desde cero.

El prompt refuerza: **"TODO el contenido DEBE estar en ESPANOL"**

### Modo 2: Refine (mejora silenciosa)

```typescript
// POST /api/agents/generate
{ mode: 'refine', agentName, agentDescription, soul: existingSoul, agents: existingAgents, model, provider }
```

Recibe los archivos minimos y los mejora manteniendo la estructura de secciones.

Retorna solo `{ soul, agents }` (sin name/emoji/identity).

Usado internamente por el modo Manual: despues de crear el agente, una llamada fire-and-forget al LLM mejora SOUL.md y AGENTS.md, y despues los actualiza via PATCH.

```typescript
// En AgentCreator, tras crear en modo manual:
fetch('/api/agents/generate', { body: JSON.stringify({ mode: 'refine', ... }) })
  .then(r => r.json())
  .then(refined => {
    fetch(`/api/agents/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ soul: refined.soul, agents: refined.agents }),
    });
  });
```

### Modo 3: From Skill (generacion desde skill)

```typescript
// POST /api/agents/generate
{ mode: 'from-skill', agentName, skillName, skillDescription, skillInstructions, model, provider }
```

Genera la configuracion completa del agente basandose en las instrucciones de un Skill existente.

El SOUL.md refleja la especialidad del skill. El AGENTS.md incorpora las instrucciones del skill como flujo de trabajo.

---

## 6. AgentCreator con 3 modos de creacion

Archivo: `src/components/agents/agent-creator.tsx`

### Componente reescrito completamente

Se elimino el patron anterior de "expandir/colapsar" con un solo flujo. Ahora hay 3 cards selectoras horizontales:

```
[✍️ Manual]        [⚡ Desde Skill]      [✨ Generar con IA]
Rellena los         Usa una skill         El LLM genera
datos basicos       como base             toda la config
```

Al seleccionar uno, se expande el formulario correspondiente debajo. Clickear el mismo modo lo colapsa.

### Modo Manual

1. **Campos**: Emoji, Nombre, Descripcion, Modelo (SelectGroup por proveedor)
2. **Nota**: "Se crearan archivos basicos en espanol. Una IA los mejorara automaticamente despues de crear."
3. **Al crear**: Envia nombre/emoji/modelo/descripcion sin archivos generados. El backend genera plantillas minimas.
4. **Post-creacion**: Llamada silenciosa a `/api/agents/generate?mode=refine` que mejora SOUL.md y AGENTS.md via PATCH.

### Modo Desde Skill

1. **Lista de skills**: Grid scrolleable con cada skill como boton seleccionable. Muestra nombre, descripcion, badge de categoria.
2. **Al seleccionar skill**: Se auto-rellena nombre y descripcion del agente con los del skill.
3. **Campos**: Emoji, Nombre, Descripcion, Modelo
4. **Boton**: "Generar configuracion desde skill" → llama a `/api/agents/generate?mode=from-skill`
5. **Preview**: Muestra preview con emoji, nombre, SOUL.md (3 lineas), opciones de Regenerar / Editar / Crear
6. **Skills se cargan lazy**: Solo al seleccionar el modo, via `GET /api/skills`

### Modo Generar con IA

1. **Campos**: Emoji, Nombre, Descripcion, Modelo
2. **Boton primario**: "Generar con IA" → llama a `/api/agents/generate` (modo default)
3. **Preview**: Igual que el modo Skill con Regenerar / Editar / Crear
4. **Boton secundario**: "Crear sin generar (datos minimos)" para crear sin esperar al LLM

### Shared: Preview generado

Componente `renderGeneratedPreview()` reutilizado en modos Skill y AI:

- Header con emoji + nombre + badge de modelo
- Bloque de preview de SOUL.md (3 lineas con line-clamp)
- Editor expandible (SOUL.md, AGENTS.md, IDENTITY.md en textareas monospace)
- Botones: Regenerar, Editar/Ocultar editor, Crear agente

### CreationResultBanner

Componente separado con 3 variantes visuales:

| Estado | Visual | Contenido |
|--------|--------|-----------|
| `active` | Borde verde, icono Check | "Agente creado y activado" |
| `created_pending_restart` | Borde violeta, spinner con countdown | "El gateway se reiniciara en ~{N}s..." |
| `created_no_openclaw` | Borde amber | Warning del error |

El countdown de 60 segundos:
- Spinner animado mientras `countdown > 0`
- Al llegar a 0, muestra Check + "El gateway deberia haberse reiniciado"
- Siempre muestra fallback con comando copiable "Si no se activa: `openclaw gateway restart`"

---

## 7. Fix global del portapapeles (HTTP fallback)

### Problema

`navigator.clipboard.writeText()` requiere un contexto seguro (HTTPS). DocFlow se sirve por HTTP en la red local (`http://192.168.1.49:3500`), lo que hace que todos los botones de copiar fallen silenciosamente.

### Solucion

Archivo: `src/lib/utils.ts`

```typescript
export function copyToClipboard(text: string): boolean {
  // Intenta API moderna (requiere secure context)
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(text).catch(() => {});
    return true;
  }

  // Fallback: textarea oculto + execCommand
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
```

### Archivos actualizados (5 reemplazos)

| Archivo | Uso |
|---------|-----|
| `src/app/agents/page.tsx` | Copiar contenido de archivos del workspace |
| `src/components/agents/agent-creator.tsx` | Copiar comando de reinicio |
| `src/components/system/diagnostic-sheet.tsx` | Copiar comandos de diagnostico |
| `src/components/rag/rag-panel.tsx` | Copiar codigo de integracion RAG |
| `src/components/rag/rag-panel.tsx` | Copiar comando `openclaw agents add` |

Patron de uso consistente:

```typescript
if (copyToClipboard(text)) {
  toast.success('Copiado');
} else {
  toast.error('No se pudo copiar');
}
```

---

## 8. Permisos Docker automaticos (init container)

### Problema

El volumen `/home/deskmath/.openclaw` se monta como `/app/openclaw` en Docker. El propietario en el host es `deskmath` (UID 1000), pero el contenedor ejecuta como `nextjs` (UID 1001). Resultado: DocFlow no puede escribir en `/app/openclaw`.

Solucion anterior: `docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/` manualmente.

### Solucion: Servicio init en docker-compose.yml

```yaml
services:
  docflow-init:
    image: busybox
    container_name: docflow-init
    volumes:
      - /home/deskmath/.openclaw:/app/openclaw
      - /home/deskmath/docflow-data:/app/data
    command: sh -c "chown -R 1001:1001 /app/openclaw /app/data && chmod -R u+rw /app/openclaw /app/data"
    restart: "no"

  docflow:
    depends_on:
      docflow-init:
        condition: service_completed_successfully
    # ... resto
```

Funcionamiento:
1. `docker compose up` → primero ejecuta `docflow-init`
2. `busybox` corre como root → ejecuta `chown -R 1001:1001`
3. `docflow-init` termina (`restart: "no"`) → `service_completed_successfully`
4. Recien entonces arranca `docflow`
5. `nextjs` (UID 1001) tiene escritura en ambos volumenes

**Ya no hace falta** ejecutar `chown` manualmente despues de cada rebuild.

---

## 9. Reinicio automatico del gateway (cron watcher)

### Mecanismo de senal

DocFlow no puede ejecutar `systemctl` ni `openclaw` desde dentro del contenedor. La solucion es un archivo senal en un directorio compartido.

### Flujo

```
DocFlow (Docker)                          Host
────────────────                          ────
1. Crea agente
2. Registra en openclaw.json
3. tryReloadGateway() falla
4. Escribe /app/data/.restart-gateway
                                          5. Cron cada 1 min ejecuta gateway-watcher.sh
                                          6. Detecta ~/docflow-data/.restart-gateway
                                          7. systemctl --user restart openclaw-gateway
                                          8. Borra la senal
                                          9. Log en .gateway-restart.log
```

### Escritura de la senal (en los endpoints)

```typescript
// En agents/create y bot/create:
if (result.registered && !gatewayReloaded) {
  try {
    const dataPath = process['env']['DATABASE_PATH']
      ? path.dirname(process['env']['DATABASE_PATH'])
      : '/app/data';
    fs.writeFileSync(path.join(dataPath, '.restart-gateway'), new Date().toISOString());
  } catch { /* non-critical */ }
}
```

### gateway-watcher.sh

Archivo: `scripts/gateway-watcher.sh`

```bash
#!/bin/bash
SIGNAL_FILE="/home/deskmath/docflow-data/.restart-gateway"
LOG_FILE="/home/deskmath/docflow-data/.gateway-restart.log"

if [ -f "$SIGNAL_FILE" ]; then
  TIMESTAMP=$(cat "$SIGNAL_FILE" 2>/dev/null || echo "unknown")

  if systemctl --user restart openclaw-gateway.service 2>/dev/null; then
    echo "[$(date)] Gateway restarted by DocFlow signal (created at: $TIMESTAMP)" >> "$LOG_FILE"
  else
    if command -v openclaw &>/dev/null; then
      openclaw gateway restart 2>/dev/null
      echo "[$(date)] Gateway restarted via CLI" >> "$LOG_FILE"
    else
      echo "[$(date)] FAILED to restart gateway" >> "$LOG_FILE"
    fi
  fi

  rm -f "$SIGNAL_FILE"
fi
```

### setup-gateway-watcher.sh

Archivo: `scripts/setup-gateway-watcher.sh`

Script one-time que instala el cron job:

```bash
chmod +x ~/docflow/scripts/gateway-watcher.sh
(crontab -l 2>/dev/null | grep -v gateway-watcher; \
 echo "* * * * * /home/deskmath/docflow/scripts/gateway-watcher.sh") | crontab -
```

Para verificar: `crontab -l | grep gateway`
Para desinstalar: `crontab -l | grep -v gateway-watcher | crontab -`

---

## 10. Bugs resueltos

### Bug 1: Function declaration inside block in strict mode

**Sintoma:** Build error en `bot/create/route.ts`: "Function declarations are not allowed inside blocks in strict mode when targeting 'ES5'"

**Causa:** `function toHostPath()` declarada dentro del bloque `try` de la funcion `POST`

**Solucion:** Convertir a arrow function:
```typescript
// ANTES (error)
function toHostPath(p: string): string { ... }

// DESPUES (OK)
const toHostPath = (p: string): string => { ... };
```

### Bug 2: navigator.clipboard falla en HTTP

**Sintoma:** Boton de copiar no funciona en la app. No lanza error visible.

**Causa:** `navigator.clipboard.writeText()` solo funciona en contexto seguro (HTTPS o localhost). DocFlow se sirve por HTTP en IP local.

**Solucion:** Utility `copyToClipboard()` con fallback `document.execCommand('copy')`. Reemplazados 5 usos en toda la app.

### Bug 3: SOUL.md con plantillas de OpenClaw

**Sintoma:** Al chatear con un agente creado por DocFlow en OpenClaw, responde en ingles con personalidad generica ("You're not a chatbot. You're becoming someone.")

**Causa:** `openclaw agents add` sobreescribia los archivos con plantillas por defecto DESPUES de que DocFlow los escribiera.

**Solucion:** Eliminar dependencia del CLI. DocFlow ahora escribe directamente en openclaw.json y crea los archivos el mismo. BOOTSTRAP.md se elimina explicitamente si existe.

### Bug 4: Permisos de volumen perdidos tras rebuild

**Sintoma:** Despues de `docker compose build && docker compose up`, DocFlow no puede escribir en `/app/openclaw`

**Causa:** El volumen montado tiene UID 1000 (deskmath), pero el contenedor corre como UID 1001 (nextjs)

**Solucion:** Init container `busybox` que ejecuta `chown -R 1001:1001` antes de arrancar DocFlow. Se ejecuta automaticamente en cada `docker compose up`.

---

## 11. Archivos nuevos y modificados

### Archivos nuevos

| Archivo | Descripcion |
|---------|-------------|
| `scripts/gateway-watcher.sh` | Cron script que detecta senal y reinicia gateway |
| `scripts/setup-gateway-watcher.sh` | Instalador one-time del cron job |

### Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `docker-compose.yml` | Agregado servicio `docflow-init` + `depends_on` con `service_completed_successfully` |
| `src/lib/utils.ts` | Agregada funcion `copyToClipboard()` con fallback HTTP |
| `src/app/api/agents/create/route.ts` | Reescrito: registro directo en openclaw.json, creacion de dirs, archivos, BOOTSTRAP.md, reload gateway, senal |
| `src/app/api/agents/generate/route.ts` | Reescrito: 3 modos (default, refine, from-skill), prompts en espanol |
| `src/app/api/projects/[id]/bot/create/route.ts` | Reescrito: mismo flujo de registro directo + senal de reinicio |
| `src/components/agents/agent-creator.tsx` | Reescrito completamente: 3 modos, selector de skills, CreationResultBanner con countdown |
| `src/app/agents/page.tsx` | Import y uso de `copyToClipboard` |
| `src/components/system/diagnostic-sheet.tsx` | Import y uso de `copyToClipboard` |
| `src/components/rag/rag-panel.tsx` | Import y uso de `copyToClipboard` (2 sitios) |

---

## 12. Flujo completo verificado

### Test end-to-end realizado

1. **Usuario crea agente "Agente Test DocFlow"** desde la pagina /agents en modo Manual
2. **DocFlow registra** en `openclaw.json` → agente aparece en la lista con workspace y agentDir correctos
3. **Archivos creados** en `~/.openclaw/workspace-agente-test-docflow/`:
   - SOUL.md con personalidad en espanol
   - AGENTS.md con instrucciones operativas
   - IDENTITY.md con metadata
   - USER.md con datos del usuario
   - TOOLS.md con infraestructura
4. **BOOTSTRAP.md eliminado** (no existe en el workspace)
5. **Senal escrita** en `~/docflow-data/.restart-gateway`
6. **Gateway watcher** detecta la senal y reinicia el gateway
7. **Agente aparece** en OpenClaw Mission Control (hierarchy con 5 agentes)
8. **Badge "Activo"** en la tabla de agentes de DocFlow

### Resultado en openclaw.json

```json
{
  "id": "agente-test-docflow",
  "name": "Agente Test DocFlow",
  "workspace": "/home/deskmath/.openclaw/workspace-agente-test-docflow",
  "agentDir": "/home/deskmath/.openclaw/agents/agente-test-docflow/agent",
  "model": {
    "primary": "openai/gpt-4o"
  },
  "identity": {
    "name": "Agente Test DocFlow",
    "emoji": "🤖"
  }
}
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
✓ Generating static pages (16/16)
✓ Finalizing page optimization

Route (app)                                  Size
○ /agents                                    3.44 kB
○ /skills                                    6.12 kB
○ /workers                                   3.96 kB
ƒ /api/agents/create                         0 B
ƒ /api/agents/generate                       0 B
ƒ /api/projects/[id]/bot/create              0 B
```

### Warnings conocidos (pre-existentes, no bloquean)
- `react-hooks/exhaustive-deps` en `fetchPreview` (process-panel.tsx) y `fetchRagInfo` (rag-panel.tsx)

### Deploy Docker

```bash
docker compose build --no-cache && docker compose up -d
```

**Ya no necesita** ejecutar `chown` manualmente — el init container lo hace automaticamente.

### Setup del gateway watcher (una sola vez)

```bash
cd ~/docflow && ./scripts/setup-gateway-watcher.sh
```
