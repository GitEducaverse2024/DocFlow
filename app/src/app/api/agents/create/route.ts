import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { withRetry } from '@/lib/retry';
import { cacheInvalidate } from '@/lib/cache';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function toKebabId(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30);
}

/** Resolve the OpenClaw base path (writable) */
function resolveOpenclawPath(): string {
  const candidates = [
    '/app/openclaw',
    process['env']['OPENCLAW_WORKSPACE_PATH'] || '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const testFile = path.join(candidate, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      return candidate;
    } catch { /* next */ }
  }
  return path.join(process.cwd(), 'data', 'bots');
}

/** Map Docker path → host path for openclaw.json entries */
function toHostPath(dockerPath: string): string {
  // /app/openclaw → host ~/.openclaw
  const hostBase = process['env']['OPENCLAW_HOST_PATH'] || '/app/openclaw';
  if (dockerPath.startsWith('/app/openclaw')) {
    return dockerPath.replace('/app/openclaw', hostBase);
  }
  return dockerPath;
}

/** Generate minimal SOUL.md content in Spanish */
function generateMinimalSoul(name: string, description: string): string {
  return `# ${name}

Soy ${name}. ${description || 'Un asistente especializado.'}.

## Mi personalidad
- Profesional y directo
- Respondo siempre en español
- Me especializo en ${description || 'asistencia general'}

## Lo que hago
${description ? description : 'Asisto al usuario con tareas especializadas dentro de mi dominio de conocimiento.'}

## Lo que NO hago
- No invento información que no esté en mi contexto
- No ejecuto acciones destructivas sin confirmación
`;
}

/** Generate minimal AGENTS.md content in Spanish */
function generateMinimalAgents(name: string): string {
  return `# Instrucciones Operativas — ${name}

## Flujo de trabajo
1. Recibo la consulta o documentación del usuario
2. Analizo el contenido disponible en mi base de conocimiento
3. Genero una respuesta estructurada y fundamentada

## Reglas
- Respondo siempre en español
- Cito las fuentes cuando es posible
- Si no tengo información suficiente, lo indico claramente
`;
}

/** Generate IDENTITY.md content */
function generateIdentity(name: string, emoji: string, description: string): string {
  return `# IDENTITY.md

- **Name:** ${name}
- **Creature:** Asistente especializado
- **Vibe:** Profesional, directo, en español
- **Emoji:** ${emoji}

${description || `Agente especializado creado con DoCatFlow.`}
`;
}

/** Generate USER.md content */
function generateUser(): string {
  const userName = process['env']['DOCFLOW_USER'] || 'usuario';
  return `# Usuario

- Nombre: ${userName}
- Idioma: Español
- Contexto: Trabaja con DoCatFlow, OpenClaw, y un stack de IA local
`;
}

/** Generate TOOLS.md content */
function generateTools(): string {
  return `# TOOLS.md - Entorno de trabajo

## Infraestructura (server-ia)
- OpenClaw: 127.0.0.1:18789 (gateway)
- DoCatFlow: localhost:3500 (documentación)
- LiteLLM: localhost:4000 (proxy LLM)
- n8n: localhost:5678 (automatización)
- Qdrant: localhost:6333 (vectores)

## Idioma de trabajo
- Español

## Restricciones
- NO ejecutar código ni comandos de terminal
- NO acceder al sistema de archivos para modificar nada
- Trabajo exclusivamente con análisis y producción de texto
`;
}

/**
 * Register agent in openclaw.json, create session dirs, write workspace files.
 * Returns { registered, warning? }
 */
function registerInOpenclaw(
  openclawPath: string,
  agentId: string,
  name: string,
  emoji: string,
  model: string,
  soul: string,
  agentsMd: string,
  identity: string,
): { registered: boolean; warning?: string } {
  const workspacePath = path.join(openclawPath, `workspace-${agentId}`);

  // 1. Register in openclaw.json
  let registeredInJson = false;
  try {
    const openclawJsonPath = path.join(openclawPath, 'openclaw.json');
    if (fs.existsSync(openclawJsonPath)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = JSON.parse(fs.readFileSync(openclawJsonPath, 'utf-8')) as any;

      if (!config.agents) config.agents = {};
      if (!Array.isArray(config.agents.list)) config.agents.list = [];

      const alreadyExists = config.agents.list.some((a: { id: string }) => a.id === agentId);
      if (!alreadyExists) {
        // Copy structure from existing agents (workspace + agentDir + model + identity)
        const hostWorkspace = toHostPath(workspacePath);
        const hostAgentDir = toHostPath(path.join(openclawPath, 'agents', agentId, 'agent'));

        config.agents.list.push({
          id: agentId,
          name,
          workspace: hostWorkspace,
          agentDir: hostAgentDir,
          model: {
            primary: model,
          },
          identity: {
            name,
            emoji,
          },
        });
        fs.writeFileSync(openclawJsonPath, JSON.stringify(config, null, 2), 'utf-8');
      }
      registeredInJson = true;
    }
  } catch (e) {
    logger.warn('agents', 'Could not register in openclaw.json', { error: (e as Error).message });
  }

  // 2. Create session dirs: agents/{id}/agent/ and agents/{id}/sessions/
  try {
    const agentDir = path.join(openclawPath, 'agents', agentId, 'agent');
    const sessionsDir = path.join(openclawPath, 'agents', agentId, 'sessions');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(sessionsDir, { recursive: true });
  } catch (e) {
    logger.warn('agents', 'Could not create agent dirs', { error: (e as Error).message });
  }

  // 3. Create workspace directory
  fs.mkdirSync(workspacePath, { recursive: true });

  // 4. Create .openclaw/ directory inside workspace
  const openclawDir = path.join(workspacePath, '.openclaw');
  fs.mkdirSync(openclawDir, { recursive: true });

  // 5. Write workspace files with DoCatFlow content (AFTER registration)
  fs.writeFileSync(path.join(workspacePath, 'SOUL.md'), soul, 'utf-8');
  fs.writeFileSync(path.join(workspacePath, 'AGENTS.md'), agentsMd, 'utf-8');
  fs.writeFileSync(path.join(workspacePath, 'IDENTITY.md'), identity, 'utf-8');
  fs.writeFileSync(path.join(workspacePath, 'USER.md'), generateUser(), 'utf-8');
  fs.writeFileSync(path.join(workspacePath, 'TOOLS.md'), generateTools(), 'utf-8');

  // 6. DELETE BOOTSTRAP.md if it exists (it overrides personality)
  const bootstrapPath = path.join(workspacePath, 'BOOTSTRAP.md');
  if (fs.existsSync(bootstrapPath)) {
    fs.unlinkSync(bootstrapPath);
  }

  if (!registeredInJson) {
    return { registered: false, warning: 'Agente creado en DoCatFlow pero no se pudo registrar en openclaw.json' };
  }

  return { registered: true };
}

/** Try to reload OpenClaw gateway config via HTTP */
async function tryReloadGateway(): Promise<boolean> {
  const openclawUrl = process['env']['OPENCLAW_URL'] || 'http://localhost:18789';
  const authToken = process['env']['OPENCLAW_AUTH_TOKEN'] || '';

  const endpoints = [
    `${openclawUrl}/rpc/config.reload`,
    `${openclawUrl}/rpc/gateway.reload`,
  ];

  for (const url of endpoints) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await withRetry(async () => {
        const r = await fetch(url, {
          method: 'POST',
          headers,
          body: '{}',
          signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r;
      });
      if (res.ok) return true;
    } catch { /* try next */ }
  }
  return false;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      emoji,
      model,
      description,
      soul: customSoul,
      agents: customAgents,
      identity: customIdentity,
    } = body;

    if (!name || !model) {
      return NextResponse.json({ error: 'name and model are required' }, { status: 400 });
    }

    const id = toKebabId(name) || `custom-${Date.now()}`;
    const agentEmoji = emoji || '🤖';

    // Check if id already exists, append timestamp if so
    const existing = db.prepare('SELECT id FROM custom_agents WHERE id = ?').get(id);
    const finalId = existing ? `${id}-${Date.now()}` : id;

    // Save to SQLite
    db.prepare(
      `INSERT INTO custom_agents (id, name, emoji, model, description, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(finalId, name, agentEmoji, model, description || '', new Date().toISOString());

    // Resolve content: use provided or generate minimal
    const soulContent = customSoul || generateMinimalSoul(name, description || '');
    const agentsContent = customAgents || generateMinimalAgents(name);
    const identityContent = customIdentity || generateIdentity(name, agentEmoji, description || '');

    // Register in OpenClaw and write files
    const openclawPath = resolveOpenclawPath();
    let result: { registered: boolean; warning?: string };
    try {
      result = registerInOpenclaw(
        openclawPath,
        finalId,
        name,
        agentEmoji,
        model,
        soulContent,
        agentsContent,
        identityContent,
      );
    } catch (e) {
      logger.error('agents', 'Error in OpenClaw registration', { error: (e as Error).message });
      result = { registered: false, warning: `Error al crear workspace: ${(e as Error).message}` };
    }

    // Try to reload gateway (non-blocking)
    let gatewayReloaded = false;
    if (result.registered) {
      gatewayReloaded = await tryReloadGateway();
    }

    // Write signal file for host gateway-watcher to restart the gateway
    if (result.registered && !gatewayReloaded) {
      try {
        const dataPath = process['env']['DATABASE_PATH']
          ? path.dirname(process['env']['DATABASE_PATH'])
          : '/app/data';
        fs.writeFileSync(path.join(dataPath, '.restart-gateway'), new Date().toISOString());
      } catch { /* non-critical */ }
    }

    // Build response
    const response: Record<string, unknown> = {
      id: finalId,
      name,
      emoji: agentEmoji,
      model,
      description,
    };

    if (!result.registered) {
      response.warning = result.warning;
      response.status = 'created_no_openclaw';
    } else if (gatewayReloaded) {
      response.status = 'active';
      response.message = 'Agente creado y activado en OpenClaw';
    } else {
      response.status = 'created_pending_restart';
      response.message = 'Agente creado. El gateway se reiniciará automáticamente en menos de 1 minuto.';
      response.restartCommand = 'openclaw gateway restart';
    }

    cacheInvalidate('agents');
    logger.info('agents', 'Agente creado', { agentId: finalId, name });
    return NextResponse.json(response);
  } catch (error) {
    logger.error('agents', 'Error creating custom agent', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
