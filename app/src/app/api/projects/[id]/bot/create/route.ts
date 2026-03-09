import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as { name: string, purpose: string, tech_stack: string, rag_enabled: number, rag_collection: string };
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.rag_enabled || !project.rag_collection) {
      return NextResponse.json({ error: 'RAG must be enabled first' }, { status: 400 });
    }

    const sourcesCount = (db.prepare('SELECT COUNT(*) as count FROM sources WHERE project_id = ?').get(projectId) as { count: number }).count;

    const shortId = projectId.substring(0, 8);
    const agentId = `docflow-${shortId}`;
    
    // Try OPENCLAW_WORKSPACE_PATH first, fallback to app data dir
    let openclawPath = process['env']['OPENCLAW_WORKSPACE_PATH'] || '';
    let workspacePath = openclawPath ? path.join(openclawPath, `workspace-${agentId}`) : '';

    // Test if we can write to the openclaw path
    if (openclawPath) {
      try {
        const testFile = path.join(openclawPath, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
      } catch {
        // Can't write to openclaw path, use app data dir instead
        openclawPath = path.join(process.cwd(), 'data', 'bots');
        workspacePath = path.join(openclawPath, `workspace-${agentId}`);
      }
    } else {
      openclawPath = path.join(process.cwd(), 'data', 'bots');
      workspacePath = path.join(openclawPath, `workspace-${agentId}`);
    }

    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }

    // Create SOUL.md
    const soulContent = `# Bot Experto: ${project.name}

Soy un asistente especializado en el proyecto "${project.name}".

## Mi conocimiento
He sido entrenado con la documentación completa del proyecto, que incluye ${sourcesCount} fuentes procesadas y estructuradas.

## Finalidad del proyecto
${project.purpose || 'No especificada'}

## Stack tecnológico
${project.tech_stack || "No especificado"}

## Mi personalidad
- Respondo siempre en español
- Soy preciso y baso mis respuestas en la documentación del proyecto
- Si algo no está en mi base de conocimiento, lo digo claramente
- Cito las fuentes cuando es relevante

## Lo que hago
1. Respondo preguntas sobre el proyecto basándome en la documentación indexada
2. Explico conceptos técnicos del proyecto
3. Ayudo a encontrar información específica en la documentación

## Lo que NO hago
- NO invento información que no esté en la documentación
- NO ejecuto código ni modifico archivos
- NO accedo a servicios externos
`;
    fs.writeFileSync(path.join(workspacePath, 'SOUL.md'), soulContent);

    // Create AGENTS.md
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

## Idioma
- Respondo siempre en español
`;
    fs.writeFileSync(path.join(workspacePath, 'AGENTS.md'), agentsContent);

    // Create IDENTITY.md
    const identityContent = `# IDENTITY.md

- **Name:** Experto ${project.name}
- **Creature:** Bot experto en documentación de proyecto
- **Vibe:** Preciso, basado en datos, servicial
- **Emoji:** 🎓

Bot especializado creado automáticamente por DocFlow.
`;
    fs.writeFileSync(path.join(workspacePath, 'IDENTITY.md'), identityContent);

    // Create USER.md
    const userContent = `# Usuario

- Nombre: Usuario
- Idioma preferido: Español
- Contexto: Consulta documentación del proyecto ${project.name}
`;
    fs.writeFileSync(path.join(workspacePath, 'USER.md'), userContent);

    // Update DB
    db.prepare('UPDATE projects SET bot_created = 1, bot_agent_id = ? WHERE id = ?').run(agentId, projectId);

    return NextResponse.json({ success: true, agentId });
  } catch (error) {
    console.error('Error creating bot:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
