import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { withRetry } from '@/lib/retry';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface CatPawRow {
  id: string;
  name: string;
  description: string | null;
  avatar_emoji: string;
  system_prompt: string | null;
  tone: string;
  mode: string;
  model: string;
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

/** Map Docker path to host path for openclaw.json entries */
function toHostPath(dockerPath: string): string {
  const hostBase = process['env']['OPENCLAW_HOST_PATH'] || '/app/openclaw';
  if (dockerPath.startsWith('/app/openclaw')) {
    return dockerPath.replace('/app/openclaw', hostBase);
  }
  return dockerPath;
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const paw = db.prepare('SELECT * FROM cat_paws WHERE id = ?').get(id) as CatPawRow | undefined;
    if (!paw) {
      return NextResponse.json({ error: 'CatPaw not found' }, { status: 404 });
    }

    // Only chat and hybrid modes can sync
    if (paw.mode === 'processor') {
      return NextResponse.json(
        { error: 'Solo CatPaws modo chat o hybrid pueden sincronizar con OpenClaw' },
        { status: 400 }
      );
    }

    const openclawPath = resolveOpenclawPath();
    const workspacePath = path.join(openclawPath, `workspace-${id}`);

    // Generate workspace content
    const soulContent = `# ${paw.name}

${paw.system_prompt || 'Soy ' + paw.name + '. Un asistente especializado.'}

## Mi personalidad
- Tono: ${paw.tone}
- Respondo siempre en espanol
`;

    const identityContent = `# IDENTITY.md

- **Name:** ${paw.name}
- **Emoji:** ${paw.avatar_emoji}
- **Mode:** ${paw.mode}
- **Vibe:** ${paw.tone}
`;

    const agentsContent = `# Instrucciones Operativas — ${paw.name}

## Flujo de trabajo
1. Recibo la consulta o documentacion del usuario
2. Analizo el contenido disponible en mi base de conocimiento
3. Genero una respuesta estructurada y fundamentada

## Reglas
- Respondo siempre en espanol
- Cito las fuentes cuando es posible
- Si no tengo informacion suficiente, lo indico claramente
`;

    const userName = process['env']['DOCFLOW_USER'] || 'usuario';
    const userContent = `# Usuario

- Nombre: ${userName}
- Idioma: Espanol
- Contexto: Trabaja con DoCatFlow, OpenClaw, y un stack de IA local
`;

    const toolsContent = `# TOOLS.md - Entorno de trabajo

## Infraestructura (server-ia)
- OpenClaw: 127.0.0.1:18789 (gateway)
- DoCatFlow: localhost:3500 (documentacion)
- LiteLLM: localhost:4000 (proxy LLM)
- n8n: localhost:5678 (automatizacion)
- Qdrant: localhost:6333 (vectores)

## Idioma de trabajo
- Espanol

## Restricciones
- NO ejecutar codigo ni comandos de terminal
- NO acceder al sistema de archivos para modificar nada
- Trabajo exclusivamente con analisis y produccion de texto
`;

    // Create workspace directory and write files
    try {
      fs.mkdirSync(workspacePath, { recursive: true });
      fs.writeFileSync(path.join(workspacePath, 'SOUL.md'), soulContent, 'utf-8');
      fs.writeFileSync(path.join(workspacePath, 'AGENTS.md'), agentsContent, 'utf-8');
      fs.writeFileSync(path.join(workspacePath, 'IDENTITY.md'), identityContent, 'utf-8');
      fs.writeFileSync(path.join(workspacePath, 'USER.md'), userContent, 'utf-8');
      fs.writeFileSync(path.join(workspacePath, 'TOOLS.md'), toolsContent, 'utf-8');
    } catch (e) {
      logger.warn('cat-paws', 'Error writing workspace files', { error: (e as Error).message, pawId: id });
    }

    // Create agent dirs
    try {
      const agentDir = path.join(openclawPath, 'agents', id, 'agent');
      const sessionsDir = path.join(openclawPath, 'agents', id, 'sessions');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.mkdirSync(sessionsDir, { recursive: true });
    } catch (e) {
      logger.warn('cat-paws', 'Could not create agent dirs', { error: (e as Error).message, pawId: id });
    }

    // Register in openclaw.json
    try {
      const openclawJsonPath = path.join(openclawPath, 'openclaw.json');
      if (fs.existsSync(openclawJsonPath)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const config = JSON.parse(fs.readFileSync(openclawJsonPath, 'utf-8')) as any;

        if (!config.agents) config.agents = {};
        if (!Array.isArray(config.agents.list)) config.agents.list = [];

        const alreadyExists = config.agents.list.some((a: { id: string }) => a.id === id);
        if (!alreadyExists) {
          const hostWorkspace = toHostPath(workspacePath);
          const hostAgentDir = toHostPath(path.join(openclawPath, 'agents', id, 'agent'));

          config.agents.list.push({
            id,
            name: paw.name,
            workspace: hostWorkspace,
            agentDir: hostAgentDir,
            model: {
              primary: paw.model,
            },
            identity: {
              name: paw.name,
              emoji: paw.avatar_emoji,
            },
          });
          fs.writeFileSync(openclawJsonPath, JSON.stringify(config, null, 2), 'utf-8');
        }
      }
    } catch (e) {
      logger.warn('cat-paws', 'Could not register in openclaw.json', { error: (e as Error).message, pawId: id });
    }

    // Try gateway reload (non-blocking)
    let gatewayReloaded = false;
    try {
      gatewayReloaded = await tryReloadGateway();
    } catch {
      // Non-blocking
    }

    // Update cat_paws with sync info
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE cat_paws SET openclaw_id = ?, openclaw_synced_at = ?, updated_at = ? WHERE id = ?'
    ).run(id, now, now, id);

    logger.info('cat-paws', 'CatPaw sincronizado con OpenClaw', { pawId: id, gatewayReloaded });
    return NextResponse.json({
      success: true,
      openclaw_id: id,
      gateway_reloaded: gatewayReloaded,
    });
  } catch (error) {
    logger.error('cat-paws', 'Error sincronizando con OpenClaw', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
