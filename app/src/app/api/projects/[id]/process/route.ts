import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { extractContent } from '@/lib/services/content-extractor';
import { logUsage } from '@/lib/services/usage-tracker';
import { streamLiteLLM, sseHeaders, createSSEStream } from '@/lib/services/stream-utils';
import { logger } from '@/lib/logger';
import { createNotification } from '@/lib/services/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Read processing settings from DB (with defaults) */
function getProcessingSettings(): { maxTokens: number; autoTruncate: boolean; includeMetadata: boolean } {
  const defaults = { maxTokens: 50000, autoTruncate: true, includeMetadata: true };
  try {
    const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'processing.%'").all() as { key: string; value: string }[];
    for (const row of rows) {
      if (row.key === 'processing.maxTokens') defaults.maxTokens = parseInt(row.value, 10) || 50000;
      if (row.key === 'processing.autoTruncate') defaults.autoTruncate = row.value === 'true';
      if (row.key === 'processing.includeMetadata') defaults.includeMetadata = row.value === 'true';
    }
  } catch { /* settings table may not exist yet */ }
  return defaults;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    const body = await request.json();
    const { sourceIds, processedSources, directSources, instructions, worker_id, mode, skill_ids, stream: useStream } = body;

    // Support both new format (processedSources/directSources) and legacy (sourceIds)
    const processIds: string[] = processedSources || sourceIds || [];
    const directIds: string[] = directSources || [];
    const allSourceIds = Array.from(new Set([...processIds, ...directIds]));

    if (allSourceIds.length === 0) {
      return NextResponse.json({ error: 'No sources selected' }, { status: 400 });
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as { current_version: number, agent_id: string, name: string, purpose: string, tech_stack: string };
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Look up worker if in worker mode
    type WorkerRow = { id: string; name: string; system_prompt: string | null; output_format: string; output_template: string | null; model: string };
    let worker: WorkerRow | null = null;
    if (mode === 'worker' && worker_id) {
      worker = db.prepare('SELECT * FROM docs_workers WHERE id = ?').get(worker_id) as WorkerRow | undefined ?? null;
      if (!worker) {
        return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
      }
    } else if (!project.agent_id) {
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

    // Load skills if selected
    type SkillRow = { id: string; name: string; instructions: string; output_template: string | null; constraints: string | null };
    let selectedSkills: SkillRow[] = [];
    const skillIdList: string[] = Array.isArray(skill_ids) ? skill_ids : [];
    if (skillIdList.length > 0) {
      const skillPlaceholders = skillIdList.map(() => '?').join(',');
      selectedSkills = db.prepare(`SELECT id, name, instructions, output_template, constraints FROM skills WHERE id IN (${skillPlaceholders})`).all(...skillIdList) as SkillRow[];
    }

    // Create run record
    db.prepare(`
      INSERT INTO processing_runs (id, project_id, version, agent_id, worker_id, skill_ids, status, input_sources, output_path, instructions, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      projectId,
      newVersion,
      worker ? null : project.agent_id,
      worker ? worker.id : null,
      skillIdList.length > 0 ? JSON.stringify(skillIdList) : null,
      'queued',
      JSON.stringify({ processed: processIds, direct: directIds }),
      outputPath,
      instructions || null,
      new Date().toISOString()
    );

    // Get sources details for webhook
    const placeholders = allSourceIds.map(() => '?').join(',');
    const sources = db.prepare(`SELECT * FROM sources WHERE id IN (${placeholders})`).all(...allSourceIds) as { id: string, type: string, name: string, file_path: string, url: string, youtube_id: string, content_text: string }[];

    const processSourceSet = new Set(processIds);
    const directSourceSet = new Set(directIds);

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
      callback_url: `http://${process['env']['SERVER_HOSTNAME'] || 'localhost'}:${process['env']['PORT'] || 3500}/api/projects/${projectId}/process/callback`,
      output_path: outputPath
    };

    // Start local processing asynchronously
    const startLocalProcessing = async () => {
      try {
        db.prepare(`UPDATE processing_runs SET status = 'running' WHERE id = ?`).run(runId);

        const settings = getProcessingSettings();
        const maxChars = settings.maxTokens * 4; // ~4 chars per token

        // Read source content helper — uses pre-extracted content_text when available
        const readSourceContent = async (source: { type: string; name: string; file_path: string; url: string; youtube_id: string; content_text: string }) => {
          if (source.type === 'file') {
            // Use pre-extracted content if available
            if (source.content_text) {
              return source.content_text;
            }
            // Fallback: extract on the fly
            try {
              const extraction = await extractContent(source.file_path);
              return extraction.text;
            } catch {
              return `[No se pudo leer el archivo: ${source.name}]`;
            }
          } else if (source.type === 'url') {
            return `URL: ${source.url}\n[El contenido de esta URL debe ser consultado externamente]`;
          } else if (source.type === 'youtube') {
            return `Vídeo YouTube: ${source.youtube_id}\n[Referencia de vídeo]`;
          } else if (source.type === 'note') {
            return source.content_text || '';
          }
          return '';
        };

        // Build content: first collect all source texts with their sizes
        interface SourceContent {
          id: string;
          name: string;
          type: string;
          mode: 'process' | 'direct';
          content: string;
          originalSize: number;
        }

        const allContents: SourceContent[] = [];
        for (const source of sources) {
          const content = await readSourceContent(source);
          const sourceMode = processSourceSet.has(source.id) ? 'process' as const : directSourceSet.has(source.id) ? 'direct' as const : null;
          if (!sourceMode) continue;
          allContents.push({
            id: source.id,
            name: source.name,
            type: source.type,
            mode: sourceMode,
            content,
            originalSize: content.length,
          });
        }

        // Calculate total size — only "process" sources count toward the LLM token limit
        const processSources = allContents.filter(s => s.mode === 'process');
        const totalProcessChars = processSources.reduce((sum, s) => sum + s.content.length, 0);
        const totalDirectChars = allContents.filter(s => s.mode === 'direct').reduce((sum, s) => sum + s.content.length, 0);
        logger.info('processing', 'Fuentes cargadas', { projectId, processChars: totalProcessChars, processTokensApprox: Math.round(totalProcessChars / 4), directChars: totalDirectChars });

        // Smart truncation — only applies to "process" sources sent to LLM
        // Direct sources are appended as annexes and never truncated
        let truncatedCount = 0;
        let truncationWarning = '';

        if (totalProcessChars > maxChars) {
          if (!settings.autoTruncate) {
            throw new Error(`El texto para IA (${Math.round(totalProcessChars / 1024)}KB, ~${Math.round(totalProcessChars / 4)} tokens) excede el límite configurado de ${settings.maxTokens} tokens. Activa el truncado automático o selecciona menos fuentes.`);
          }

          logger.warn('processing', 'Contenido excede limite, truncando', { projectId, totalChars: totalProcessChars, maxChars });

          // Proportional truncation only on process sources
          const ratio = maxChars / totalProcessChars;
          for (const sc of processSources) {
            const maxLen = Math.floor(sc.originalSize * ratio);
            if (sc.content.length > maxLen && maxLen > 200) {
              const originalKB = Math.round(sc.originalSize / 1024);
              const truncatedKB = Math.round(maxLen / 1024);
              sc.content = sc.content.substring(0, maxLen) + `\n\n[... contenido truncado, ${truncatedKB}KB de ${originalKB}KB total ...]`;
              truncatedCount++;
            }
          }

          if (truncatedCount > 0) {
            truncationWarning = `Se truncaron ${truncatedCount} fuentes por exceder el límite del modelo. Las fuentes de contexto directo no fueron afectadas. Considera procesar menos fuentes o usar un modelo con más contexto.`;
            logger.info('processing', 'Fuentes truncadas', { projectId, truncatedCount });
          }
        }

        // Build final content strings
        let sourcesContent = '';
        const directContentParts: { name: string; content: string }[] = [];

        for (const sc of allContents) {
          if (sc.mode === 'process') {
            if (settings.includeMetadata) {
              sourcesContent += `\n\n--- FUENTE: ${sc.name} (${sc.type}) ---\n\n`;
            } else {
              sourcesContent += '\n\n---\n\n';
            }
            sourcesContent += sc.content;
          } else {
            directContentParts.push({ name: sc.name, content: sc.content });
          }
        }

        let generatedContent = '';

        // Only call LLM if there are sources to process with AI
        if (sourcesContent.trim()) {
          const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
          const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
          const agentModel = body.model || (worker ? worker.model : 'gemini-3.1-pro-preview');

          // Build system prompt based on mode
          let systemPrompt: string;
          if (worker && worker.system_prompt) {
            systemPrompt = worker.system_prompt;
            if (worker.output_template) {
              systemPrompt += `\n\nGenera el output siguiendo exactamente esta estructura:\n${worker.output_template}`;
            }
            systemPrompt += `\n\nProyecto: ${project.name}\nFinalidad: ${project.purpose}\nStack: ${project.tech_stack || 'No especificado'}`;
            if (instructions) {
              systemPrompt += `\n\nInstrucciones adicionales del usuario: ${instructions}`;
            }
          } else {
            systemPrompt = `Eres un experto en análisis y estructuración de documentación técnica. Tu tarea es leer toda la documentación proporcionada y generar un documento unificado, estructurado y bien organizado en formato Markdown.\n\nProyecto: ${project.name}\nFinalidad: ${project.purpose}\nStack: ${project.tech_stack || 'No especificado'}\n\nInstrucciones adicionales: ${instructions || 'Ninguna'}`;
          }

          // Inject skill instructions
          if (selectedSkills.length > 0) {
            systemPrompt += '\n\n--- SKILLS ACTIVOS ---';
            for (const skill of selectedSkills) {
              systemPrompt += `\n\n### Skill: ${skill.name}\n${skill.instructions}`;
              if (skill.constraints) {
                systemPrompt += `\n\nRestricciones: ${skill.constraints}`;
              }
              if (skill.output_template) {
                systemPrompt += `\n\nPlantilla de referencia del skill:\n${skill.output_template}`;
              }
            }
          }

          if (truncationWarning) {
            systemPrompt += `\n\nNOTA: Algunas fuentes fueron truncadas por límite de contexto. Trabaja con el contenido disponible.`;
          }

          const llmStartTime = Date.now();
          const response = await fetch(`${litellmUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${litellmKey}`
            },
            body: JSON.stringify({
              model: agentModel,
              messages: [
                { role: 'system', content: systemPrompt },
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
            if (response.status === 400 && (errorText.includes('invalid model') || errorText.includes('does not exist') || errorText.includes('model_not_found'))) {
              throw new Error(`El modelo "${agentModel}" no está disponible. Verifica tus API keys en Configuración o selecciona otro modelo.`);
            }
            throw new Error(`LiteLLM error: ${response.status} ${errorText}`);
          }

          const data = await response.json();
          generatedContent = data.choices[0]?.message?.content || 'No se generó contenido.';

          // Log usage (USAGE-01)
          const llmUsage = data.usage || {};
          logUsage({
            event_type: 'process',
            project_id: projectId,
            model: agentModel,
            input_tokens: llmUsage.prompt_tokens || 0,
            output_tokens: llmUsage.completion_tokens || 0,
            total_tokens: llmUsage.total_tokens || 0,
            duration_ms: Date.now() - llmStartTime,
            status: 'success',
            metadata: { sources_count: sources.length, version: newVersion }
          });
        } else {
          // Only direct sources — no LLM needed
          generatedContent = `# ${project.name}\n\nDocumento generado con fuentes de contexto directo.\n`;
        }

        // Append direct sources as annexes
        if (directContentParts.length > 0) {
          generatedContent += '\n\n---\n\n## Anexos — Documentación de referencia\n';
          for (const part of directContentParts) {
            generatedContent += `\n---\n\n### ${part.name}\n\n${part.content}\n`;
          }
        }

        // Save to file
        fs.writeFileSync(path.join(outputPath, 'output.md'), generatedContent);

        // Update run status (include warning if truncated)
        const errorLog = truncationWarning || null;
        db.prepare(`UPDATE processing_runs SET status = 'completed', error_log = ?, completed_at = ? WHERE id = ?`).run(errorLog, new Date().toISOString(), runId);
        db.prepare(`UPDATE projects SET status = 'processed' WHERE id = ?`).run(projectId);

        createNotification({
          type: 'process',
          title: `Procesamiento completado`,
          message: `Proyecto procesado exitosamente (v${newVersion})`,
          severity: 'success',
          link: `/projects/${projectId}`,
        });

        // Increment worker usage count
        if (worker) {
          db.prepare('UPDATE docs_workers SET times_used = times_used + 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), worker.id);
        }

        // Increment skill usage counts
        if (selectedSkills.length > 0) {
          const updateSkill = db.prepare('UPDATE skills SET times_used = times_used + 1, updated_at = ? WHERE id = ?');
          const skillNow = new Date().toISOString();
          for (const skill of selectedSkills) {
            updateSkill.run(skillNow, skill.id);
          }
        }

      } catch (error: unknown) {
        logger.error('processing', 'Error en procesamiento local', { projectId, error: (error as Error).message });
        logUsage({
          event_type: 'process',
          project_id: projectId,
          model: body.model || 'unknown',
          status: 'failed',
          metadata: { error: (error as Error).message }
        });
        db.prepare(`UPDATE processing_runs SET status = 'failed', error_log = ?, completed_at = ? WHERE id = ?`)
          .run(`Error en procesamiento local: ${(error as Error).message}`, new Date().toISOString(), runId);
        db.prepare(`UPDATE projects SET status = 'sources_added' WHERE id = ?`).run(projectId);
        createNotification({
          type: 'process',
          title: `Error en procesamiento`,
          message: `Error procesando proyecto: ${(error as Error).message}`.slice(0, 200),
          severity: 'error',
          link: `/projects/${projectId}`,
        });
      }
    };

    if (body.useLocalProcessing && useStream) {
      // ─── STREAMING LOCAL PROCESSING ───
      const sseStream = createSSEStream((send, close) => {
        (async () => {
          try {
            send('stage', { stage: 'preparando', message: 'Leyendo fuentes...' });
            db.prepare(`UPDATE processing_runs SET status = 'running' WHERE id = ?`).run(runId);

            const settings = getProcessingSettings();
            const maxChars = settings.maxTokens * 4;

            // Read source content helper
            const readSourceContent = async (source: { type: string; name: string; file_path: string; url: string; youtube_id: string; content_text: string }) => {
              if (source.type === 'file') {
                if (source.content_text) return source.content_text;
                try {
                  const extraction = await extractContent(source.file_path);
                  return extraction.text;
                } catch {
                  return `[No se pudo leer el archivo: ${source.name}]`;
                }
              } else if (source.type === 'url') {
                return `URL: ${source.url}\n[El contenido de esta URL debe ser consultado externamente]`;
              } else if (source.type === 'youtube') {
                return `Video YouTube: ${source.youtube_id}\n[Referencia de video]`;
              } else if (source.type === 'note') {
                return source.content_text || '';
              }
              return '';
            };

            interface SourceContent {
              id: string;
              name: string;
              type: string;
              mode: 'process' | 'direct';
              content: string;
              originalSize: number;
            }

            const allContents: SourceContent[] = [];
            for (const source of sources) {
              const content = await readSourceContent(source);
              const sourceMode = processSourceSet.has(source.id) ? 'process' as const : directSourceSet.has(source.id) ? 'direct' as const : null;
              if (!sourceMode) continue;
              allContents.push({ id: source.id, name: source.name, type: source.type, mode: sourceMode, content, originalSize: content.length });
            }

            const processSources = allContents.filter(s => s.mode === 'process');
            const totalProcessChars = processSources.reduce((sum, s) => sum + s.content.length, 0);

            send('stage', { stage: 'preparando', message: `${allContents.length} fuentes cargadas (${Math.round(totalProcessChars / 1024)}KB)` });

            // Smart truncation
            let truncatedCount = 0;
            let truncationWarning = '';

            if (totalProcessChars > maxChars) {
              if (!settings.autoTruncate) {
                throw new Error(`El texto para IA (${Math.round(totalProcessChars / 1024)}KB, ~${Math.round(totalProcessChars / 4)} tokens) excede el limite configurado de ${settings.maxTokens} tokens.`);
              }

              const ratio = maxChars / totalProcessChars;
              for (const sc of processSources) {
                const maxLen = Math.floor(sc.originalSize * ratio);
                if (sc.content.length > maxLen && maxLen > 200) {
                  const originalKB = Math.round(sc.originalSize / 1024);
                  const truncatedKB = Math.round(maxLen / 1024);
                  sc.content = sc.content.substring(0, maxLen) + `\n\n[... contenido truncado, ${truncatedKB}KB de ${originalKB}KB total ...]`;
                  truncatedCount++;
                }
              }
              if (truncatedCount > 0) {
                truncationWarning = `Se truncaron ${truncatedCount} fuentes por exceder el limite del modelo.`;
              }
            }

            // Build content strings
            let sourcesContent = '';
            const directContentParts: { name: string; content: string }[] = [];
            for (const sc of allContents) {
              if (sc.mode === 'process') {
                sourcesContent += settings.includeMetadata
                  ? `\n\n--- FUENTE: ${sc.name} (${sc.type}) ---\n\n`
                  : '\n\n---\n\n';
                sourcesContent += sc.content;
              } else {
                directContentParts.push({ name: sc.name, content: sc.content });
              }
            }

            let generatedContent = '';

            if (sourcesContent.trim()) {
              const agentModel = body.model || (worker ? worker.model : 'gemini-3.1-pro-preview');

              // Build system prompt
              let systemPrompt: string;
              if (worker && worker.system_prompt) {
                systemPrompt = worker.system_prompt;
                if (worker.output_template) {
                  systemPrompt += `\n\nGenera el output siguiendo exactamente esta estructura:\n${worker.output_template}`;
                }
                systemPrompt += `\n\nProyecto: ${project.name}\nFinalidad: ${project.purpose}\nStack: ${project.tech_stack || 'No especificado'}`;
                if (instructions) {
                  systemPrompt += `\n\nInstrucciones adicionales del usuario: ${instructions}`;
                }
              } else {
                systemPrompt = `Eres un experto en analisis y estructuracion de documentacion tecnica. Tu tarea es leer toda la documentacion proporcionada y generar un documento unificado, estructurado y bien organizado en formato Markdown.\n\nProyecto: ${project.name}\nFinalidad: ${project.purpose}\nStack: ${project.tech_stack || 'No especificado'}\n\nInstrucciones adicionales: ${instructions || 'Ninguna'}`;
              }

              // Inject skill instructions
              if (selectedSkills.length > 0) {
                systemPrompt += '\n\n--- SKILLS ACTIVOS ---';
                for (const skill of selectedSkills) {
                  systemPrompt += `\n\n### Skill: ${skill.name}\n${skill.instructions}`;
                  if (skill.constraints) systemPrompt += `\n\nRestricciones: ${skill.constraints}`;
                  if (skill.output_template) systemPrompt += `\n\nPlantilla de referencia del skill:\n${skill.output_template}`;
                }
              }

              if (truncationWarning) {
                systemPrompt += `\n\nNOTA: Algunas fuentes fueron truncadas por limite de contexto. Trabaja con el contenido disponible.`;
              }

              send('stage', { stage: 'enviando', message: 'Enviando a LiteLLM...' });
              send('stage', { stage: 'generando', message: 'Generando documento...' });

              const llmStartTime = Date.now();
              await streamLiteLLM(
                {
                  model: agentModel,
                  messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Analiza y estructura la siguiente documentacion:\n\n${sourcesContent}` },
                  ],
                  max_tokens: 16000,
                },
                {
                  onToken: (token) => {
                    generatedContent += token;
                    send('token', { content: token });
                  },
                  onDone: (usage) => {
                    logUsage({
                      event_type: 'process',
                      project_id: projectId,
                      model: agentModel,
                      input_tokens: usage?.prompt_tokens || 0,
                      output_tokens: usage?.completion_tokens || 0,
                      total_tokens: usage?.total_tokens || 0,
                      duration_ms: Date.now() - llmStartTime,
                      status: 'success',
                      metadata: { sources_count: sources.length, version: newVersion },
                    });
                  },
                  onError: (error) => { throw error; },
                }
              );
            } else {
              generatedContent = `# ${project.name}\n\nDocumento generado con fuentes de contexto directo.\n`;
            }

            // Append direct sources as annexes
            if (directContentParts.length > 0) {
              generatedContent += '\n\n---\n\n## Anexos — Documentacion de referencia\n';
              for (const part of directContentParts) {
                generatedContent += `\n---\n\n### ${part.name}\n\n${part.content}\n`;
              }
            }

            // Save to file
            fs.writeFileSync(path.join(outputPath, 'output.md'), generatedContent);

            // Update run status
            const errorLog = truncationWarning || null;
            db.prepare(`UPDATE processing_runs SET status = 'completed', error_log = ?, completed_at = ? WHERE id = ?`).run(errorLog, new Date().toISOString(), runId);
            db.prepare(`UPDATE projects SET status = 'processed' WHERE id = ?`).run(projectId);

            // Increment worker usage count
            if (worker) {
              db.prepare('UPDATE docs_workers SET times_used = times_used + 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), worker.id);
            }

            // Increment skill usage counts
            if (selectedSkills.length > 0) {
              const updateSkill = db.prepare('UPDATE skills SET times_used = times_used + 1, updated_at = ? WHERE id = ?');
              const skillNow = new Date().toISOString();
              for (const skill of selectedSkills) {
                updateSkill.run(skillNow, skill.id);
              }
            }

            createNotification({
              type: 'process',
              title: `Procesamiento completado`,
              message: `Proyecto procesado exitosamente (v${newVersion})`,
              severity: 'success',
              link: `/projects/${projectId}`,
            });

            send('stage', { stage: 'guardando', message: 'Guardando resultado...' });
            send('done', { version: newVersion, runId, truncationWarning: truncationWarning || undefined });
            close();
          } catch (error: unknown) {
            logger.error('processing', 'Error en procesamiento local streaming', { projectId, error: (error as Error).message });
            logUsage({
              event_type: 'process',
              project_id: projectId,
              model: body.model || 'unknown',
              status: 'failed',
              metadata: { error: (error as Error).message },
            });
            db.prepare(`UPDATE processing_runs SET status = 'failed', error_log = ?, completed_at = ? WHERE id = ?`)
              .run(`Error en procesamiento local: ${(error as Error).message}`, new Date().toISOString(), runId);
            db.prepare(`UPDATE projects SET status = 'sources_added' WHERE id = ?`).run(projectId);
            createNotification({
              type: 'process',
              title: `Error en procesamiento`,
              message: `Error procesando proyecto: ${(error as Error).message}`.slice(0, 200),
              severity: 'error',
              link: `/projects/${projectId}`,
            });
            send('error', { message: (error as Error).message });
            close();
          }
        })();
      });

      return new Response(sseStream, { headers: sseHeaders });
    }

    if (body.useLocalProcessing) {
      // Non-streaming local processing (backward compatibility)
      startLocalProcessing();
      return NextResponse.json({ success: true, runId, version: newVersion, local: true });
    }

    const n8nUrl = process['env']['N8N_WEBHOOK_URL'] || 'http://localhost:5678';
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
      logger.warn('processing', 'Error enviando webhook a n8n, fallback a procesamiento local', { projectId, error: (error as Error).message });
      startLocalProcessing();
      return NextResponse.json({ success: true, runId, version: newVersion, fallback: true });
    }

    return NextResponse.json({ success: true, runId, version: newVersion });
  } catch (error) {
    logger.error('processing', 'Error iniciando procesamiento', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
