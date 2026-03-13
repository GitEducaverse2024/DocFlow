import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as {
      name: string; purpose: string; tech_stack: string;
      rag_enabled: number; rag_collection: string;
    };
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.rag_enabled || !project.rag_collection) {
      return NextResponse.json({ error: 'RAG must be enabled first' }, { status: 400 });
    }

    const sourcesCount = (db.prepare('SELECT COUNT(*) as count FROM sources WHERE project_id = ?').get(projectId) as { count: number }).count;

    const shortId = projectId.substring(0, 8);
    const agentId = `docflow-${shortId}`;

    // Resolve writable OpenClaw path
    const candidates = [
      '/app/openclaw',
      process['env']['OPENCLAW_WORKSPACE_PATH'] || '',
    ].filter(Boolean);

    let openclawPath = '';
    for (const candidate of candidates) {
      try {
        const testFile = path.join(candidate, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        openclawPath = candidate;
        break;
      } catch { /* next */ }
    }
    if (!openclawPath) {
      openclawPath = path.join(process.cwd(), 'data', 'bots');
    }

    const workspacePath = path.join(openclawPath, `workspace-${agentId}`);
    const hostBase = process['env']['OPENCLAW_HOST_PATH'] || '/app/openclaw';

    const toHostPath = (p: string): string => {
      if (p.startsWith('/app/openclaw')) return p.replace('/app/openclaw', hostBase);
      return p;
    };

    // 1. Register in openclaw.json FIRST
    let registeredInOpenclaw = false;
    try {
      const openclawJsonPath = path.join(openclawPath, 'openclaw.json');
      if (fs.existsSync(openclawJsonPath)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const config = JSON.parse(fs.readFileSync(openclawJsonPath, 'utf-8')) as any;

        if (!config.agents) config.agents = {};
        if (!Array.isArray(config.agents.list)) config.agents.list = [];

        const alreadyExists = config.agents.list.some((a: { id: string }) => a.id === agentId);
        if (!alreadyExists) {
          config.agents.list.push({
            id: agentId,
            name: `Experto ${project.name}`,
            workspace: toHostPath(workspacePath),
            agentDir: toHostPath(path.join(openclawPath, 'agents', agentId, 'agent')),
            model: {
              primary: 'gemini/gemini-2.5-flash',
            },
            identity: {
              name: `Experto ${project.name}`,
              emoji: '🎓',
            },
          });
          fs.writeFileSync(openclawJsonPath, JSON.stringify(config, null, 2), 'utf-8');
        }
        registeredInOpenclaw = true;
      }
    } catch (e) {
      logger.warn('rag', 'No se pudo registrar bot en openclaw.json', { projectId, error: (e as Error).message });
    }

    // 2. Create agent session dirs
    try {
      fs.mkdirSync(path.join(openclawPath, 'agents', agentId, 'agent'), { recursive: true });
      fs.mkdirSync(path.join(openclawPath, 'agents', agentId, 'sessions'), { recursive: true });
    } catch { /* skip */ }

    // 3. Create workspace directory + .openclaw/
    fs.mkdirSync(workspacePath, { recursive: true });
    fs.mkdirSync(path.join(workspacePath, '.openclaw'), { recursive: true });

    // 4. Write workspace files with project-specific content in Spanish
    const soulContent = `# Bot Experto: ${project.name}

Soy un asistente especializado en el proyecto "${project.name}".

## Mi personalidad
- Respondo siempre en español
- Soy preciso y baso mis respuestas en la documentación del proyecto
- Si algo no está en mi base de conocimiento, lo digo claramente
- Cito las fuentes cuando es relevante

## Mi conocimiento
He sido entrenado con la documentación completa del proyecto, que incluye ${sourcesCount} fuentes procesadas y estructuradas.

## Finalidad del proyecto
${project.purpose || 'No especificada'}

## Stack tecnológico
${project.tech_stack || 'No especificado'}

## Lo que hago
1. Respondo preguntas sobre el proyecto basándome en la documentación indexada
2. Explico conceptos técnicos del proyecto
3. Ayudo a encontrar información específica en la documentación

## Lo que NO hago
- No invento información que no esté en la documentación
- No ejecuto código ni modifico archivos
- No accedo a servicios externos
`;
    fs.writeFileSync(path.join(workspacePath, 'SOUL.md'), soulContent, 'utf-8');

    const agentsContent = `# Instrucciones Operativas — Bot Experto: ${project.name}

## Flujo de trabajo
1. El usuario hace una pregunta sobre el proyecto
2. Consulto mi base de conocimiento (RAG en Qdrant, colección: ${project.rag_collection})
3. Respondo con información precisa basada en los documentos indexados
4. Si la pregunta no se puede responder con la documentación disponible, lo indico

## Formato de respuesta
- Respuestas claras y estructuradas
- Uso Markdown cuando mejora la legibilidad
- Cito las fuentes relevantes
- Indico el nivel de confianza si la información es parcial

## Reglas
- Respondo siempre en español
- Cito las fuentes cuando es posible
- Si no tengo información suficiente, lo indico claramente
`;
    fs.writeFileSync(path.join(workspacePath, 'AGENTS.md'), agentsContent, 'utf-8');

    const identityContent = `# IDENTITY.md

- **Name:** Experto ${project.name}
- **Creature:** Bot experto en documentación de proyecto
- **Vibe:** Preciso, basado en datos, servicial, en español
- **Emoji:** 🎓

Bot especializado creado por DoCatFlow para el proyecto "${project.name}".
`;
    fs.writeFileSync(path.join(workspacePath, 'IDENTITY.md'), identityContent, 'utf-8');

    const userName = process['env']['DOCFLOW_USER'] || 'usuario';
    const userContent = `# Usuario

- Nombre: ${userName}
- Idioma: Español
- Contexto: Trabaja con DoCatFlow, OpenClaw, y un stack de IA local
`;
    fs.writeFileSync(path.join(workspacePath, 'USER.md'), userContent, 'utf-8');

    const toolsContent = `# TOOLS.md - Entorno de trabajo

## Infraestructura (server-ia)
- OpenClaw: 127.0.0.1:18789 (gateway)
- DoCatFlow: localhost:3500 (documentación)
- LiteLLM: localhost:4000 (proxy LLM)
- Qdrant: localhost:6333 (vectores, colección: ${project.rag_collection})

## Idioma de trabajo
- Español

## Restricciones
- NO ejecutar código ni comandos de terminal
- NO acceder al sistema de archivos para modificar nada
- Trabajo exclusivamente con análisis y producción de texto
`;
    fs.writeFileSync(path.join(workspacePath, 'TOOLS.md'), toolsContent, 'utf-8');

    // 5. DELETE BOOTSTRAP.md if it exists
    const bootstrapPath = path.join(workspacePath, 'BOOTSTRAP.md');
    if (fs.existsSync(bootstrapPath)) {
      fs.unlinkSync(bootstrapPath);
    }

    // 6. Try to reload gateway
    let gatewayReloaded = false;
    if (registeredInOpenclaw) {
      const openclawUrl = process['env']['OPENCLAW_URL'] || 'http://localhost:18789';
      const authToken = process['env']['OPENCLAW_AUTH_TOKEN'] || '';
      for (const endpoint of [`${openclawUrl}/rpc/config.reload`, `${openclawUrl}/rpc/gateway.reload`]) {
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
          const res = await fetch(endpoint, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(5000) });
          if (res.ok) { gatewayReloaded = true; break; }
        } catch { /* try next */ }
      }
    }

    // Write signal file for host gateway-watcher
    if (registeredInOpenclaw && !gatewayReloaded) {
      try {
        const dataPath = process['env']['DATABASE_PATH']
          ? path.dirname(process['env']['DATABASE_PATH'])
          : '/app/data';
        fs.writeFileSync(path.join(dataPath, '.restart-gateway'), new Date().toISOString());
      } catch { /* non-critical */ }
    }

    // Update DB
    db.prepare('UPDATE projects SET bot_created = 1, bot_agent_id = ? WHERE id = ?').run(agentId, projectId);

    // Build response
    const response: Record<string, unknown> = { success: true, agentId };

    if (!registeredInOpenclaw) {
      response.warning = 'Bot creado pero no se pudo registrar en openclaw.json';
      response.status = 'created_no_openclaw';
    } else if (gatewayReloaded) {
      response.status = 'active';
      response.message = 'Bot creado y activado en OpenClaw';
    } else {
      response.status = 'created_pending_restart';
      response.message = 'Bot creado. El gateway se reiniciará automáticamente en menos de 1 minuto.';
      response.restartCommand = 'openclaw gateway restart';
    }

    return NextResponse.json(response);
  } catch (error) {
    logger.error('rag', 'Error creando bot', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
