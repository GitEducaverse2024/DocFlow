import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    const body = await request.json();
    const { sourceIds, instructions } = body;

    if (!sourceIds || !Array.isArray(sourceIds) || sourceIds.length === 0) {
      return NextResponse.json({ error: 'No sources selected' }, { status: 400 });
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as { current_version: number, agent_id: string, name: string, purpose: string, tech_stack: string };
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.agent_id) {
      return NextResponse.json({ error: 'No agent assigned to project' }, { status: 400 });
    }

    // Check if there's already a running process
    const activeRun = db.prepare(`SELECT * FROM processing_runs WHERE project_id = ? AND status IN ('queued', 'running')`).get(projectId);
    if (activeRun) {
      return NextResponse.json({ error: 'A process is already running for this project' }, { status: 409 });
    }

    // Increment version
    const newVersion = (project.current_version || 0) + 1;
    
    // Update project status and version
    db.prepare(`UPDATE projects SET current_version = ?, status = 'processing', updated_at = ? WHERE id = ?`).run(newVersion, new Date().toISOString(), projectId);

    const runId = uuidv4();
    const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');
    const outputPath = path.join(projectsPath, projectId, 'processed', `v${newVersion}`);
    
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    // Create run record
    db.prepare(`
      INSERT INTO processing_runs (id, project_id, version, agent_id, status, input_sources, output_path, instructions, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      projectId,
      newVersion,
      project.agent_id,
      'queued',
      JSON.stringify(sourceIds),
      outputPath,
      instructions || null,
      new Date().toISOString()
    );

    // Get sources details for webhook
    const placeholders = sourceIds.map(() => '?').join(',');
    const sources = db.prepare(`SELECT * FROM sources WHERE id IN (${placeholders})`).all(...sourceIds) as { id: string, type: string, name: string, file_path: string, url: string, youtube_id: string, content_text: string }[];

    const webhookPayload = {
      run_id: runId,
      project_id: projectId,
      project_name: project.name,
      purpose: project.purpose,
      tech_stack: project.tech_stack,
      agent_id: project.agent_id,
      version: newVersion,
      sources: sources.map(s => ({
        id: s.id,
        type: s.type,
        name: s.name,
        path: s.file_path,
        url: s.url || s.youtube_id ? `https://youtube.com/watch?v=${s.youtube_id}` : null,
        content: s.content_text
      })),
      instructions: instructions || '',
      callback_url: `http://192.168.1.49:3500/api/projects/${projectId}/process/callback`,
      output_path: outputPath
    };

    // Send webhook to n8n
    
    // Start local processing asynchronously
    const startLocalProcessing = async () => {
      try {
        db.prepare(`UPDATE processing_runs SET status = 'running' WHERE id = ?`).run(runId);

        let sourcesContent = '';
        for (const source of sources) {
          sourcesContent += `\n\n--- FUENTE: ${source.name} (${source.type}) ---\n\n`;
          if (source.type === 'file') {
            // file_path is already the full absolute path stored at upload time
            const filePath = source.file_path;
            try {
              sourcesContent += fs.readFileSync(filePath, 'utf-8');
            } catch {
              sourcesContent += `[No se pudo leer el archivo: ${source.name}]`;
            }
          } else if (source.type === 'url') {
            sourcesContent += `URL: ${source.url}\n[El contenido de esta URL debe ser consultado externamente]`;
          } else if (source.type === 'youtube') {
            sourcesContent += `Vídeo YouTube: ${source.youtube_id}\n[Referencia de vídeo]`;
          } else if (source.type === 'note') {
            sourcesContent += source.content_text || '';
          }
        }

        const litellmUrl = process['env']['LITELLM_URL'] || 'http://192.168.1.49:4000';
        const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
        
        // Get model from request or use default
        const agentModel = body.model || 'gemini-3.1-pro-preview';

        const response = await fetch(`${litellmUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${litellmKey}`
          },
          body: JSON.stringify({
            model: agentModel,
            messages: [
              {
                role: 'system',
                content: `Eres un experto en análisis y estructuración de documentación técnica. Tu tarea es leer toda la documentación proporcionada y generar un documento unificado, estructurado y bien organizado en formato Markdown.\n\nProyecto: ${project.name}\nFinalidad: ${project.purpose}\nStack: ${project.tech_stack || 'No especificado'}\n\nInstrucciones adicionales: ${instructions || 'Ninguna'}`
              },
              {
                role: 'user',
                content: `Analiza y estructura la siguiente documentación:\n\n${sourcesContent}`
              }
            ],
            max_tokens: 16000
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`LiteLLM error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const generatedContent = data.choices[0]?.message?.content || 'No se generó contenido.';
        
        // Save to file
        fs.writeFileSync(path.join(outputPath, 'output.md'), generatedContent);
        
        // Update run status
        db.prepare(`UPDATE processing_runs SET status = 'completed', completed_at = ? WHERE id = ?`).run(new Date().toISOString(), runId);
        db.prepare(`UPDATE projects SET status = 'processed' WHERE id = ?`).run(projectId);
        
      } catch (error: unknown) {
        console.error('Local processing error:', error);
        db.prepare(`UPDATE processing_runs SET status = 'failed', error_log = ?, completed_at = ? WHERE id = ?`)
          .run(`Error en procesamiento local: ${(error as Error).message}`, new Date().toISOString(), runId);
        db.prepare(`UPDATE projects SET status = 'sources_added' WHERE id = ?`).run(projectId);
      }
    };

    if (body.useLocalProcessing) {
      // Run asynchronously
      startLocalProcessing();
      return NextResponse.json({ success: true, runId, version: newVersion, local: true });
    }

    const n8nUrl = process['env']['N8N_WEBHOOK_URL'] || 'http://192.168.1.49:5678';
    const n8nPath = process['env']['N8N_PROCESS_WEBHOOK_PATH'] || '/webhook/docflow-process';
    
    try {
      const n8nRes = await fetch(`${n8nUrl}${n8nPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
        signal: AbortSignal.timeout(10000)
      });

      if (!n8nRes.ok) {
        throw new Error(`n8n responded with status: ${n8nRes.status}`);
      }
      
      // Update run to running
      db.prepare(`UPDATE processing_runs SET status = 'running' WHERE id = ?`).run(runId);

    } catch (error: unknown) {
      console.error('Error sending webhook to n8n, falling back to local processing:', error);
      startLocalProcessing();
      return NextResponse.json({ success: true, runId, version: newVersion, fallback: true });
    }

    return NextResponse.json({ success: true, runId, version: newVersion });
  } catch (error) {
    console.error('Error starting process:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
