const fs = require('fs');
const path = 'src/app/api/projects/[id]/process/route.ts';
let content = fs.readFileSync(path, 'utf8');

// Add local processing logic
const localProcessingLogic = `
    // Start local processing asynchronously
    const startLocalProcessing = async () => {
      try {
        db.prepare('UPDATE processing_runs SET status = "running" WHERE id = ?').run(runId);
        
        let sourcesContent = '';
        for (const source of sources) {
          sourcesContent += \`\\n\\n--- FUENTE: \${source.name} (\${source.type}) ---\\n\\n\`;
          if (source.type === 'file') {
            const filePath = path.join(projectsPath, projectId, 'sources', source.file_path);
            try {
              sourcesContent += fs.readFileSync(filePath, 'utf-8');
            } catch {
              sourcesContent += \`[No se pudo leer el archivo: \${source.name}]\`;
            }
          } else if (source.type === 'url') {
            sourcesContent += \`URL: \${source.url}\\n[El contenido de esta URL debe ser consultado externamente]\`;
          } else if (source.type === 'youtube') {
            sourcesContent += \`Vídeo YouTube: \${source.youtube_id}\\n[Referencia de vídeo]\`;
          } else if (source.type === 'note') {
            sourcesContent += source.content_text || '';
          }
        }

        const litellmUrl = process.env.LITELLM_URL || 'http://192.168.1.49:4000';
        const litellmKey = process.env.LITELLM_API_KEY || 'sk-antigravity-gateway';
        
        // Get model from request or use default
        const agentModel = body.model || 'gemini-3.1-pro-preview';

        const response = await fetch(\`\${litellmUrl}/v1/chat/completions\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${litellmKey}\`
          },
          body: JSON.stringify({
            model: agentModel,
            messages: [
              {
                role: 'system',
                content: \`Eres un experto en análisis y estructuración de documentación técnica. Tu tarea es leer toda la documentación proporcionada y generar un documento unificado, estructurado y bien organizado en formato Markdown.\\n\\nProyecto: \${project.name}\\nFinalidad: \${project.purpose}\\nStack: \${project.tech_stack || 'No especificado'}\\n\\nInstrucciones adicionales: \${instructions || 'Ninguna'}\`
              },
              {
                role: 'user',
                content: \`Analiza y estructura la siguiente documentación:\\n\\n\${sourcesContent}\`
              }
            ],
            max_tokens: 16000
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(\`LiteLLM error: \${response.status} \${errorText}\`);
        }

        const data = await response.json();
        const generatedContent = data.choices[0]?.message?.content || 'No se generó contenido.';
        
        // Save to file
        fs.writeFileSync(path.join(outputPath, 'output.md'), generatedContent);
        
        // Update run status
        db.prepare('UPDATE processing_runs SET status = "completed", completed_at = datetime("now") WHERE id = ?').run(runId);
        db.prepare('UPDATE projects SET status = "processed" WHERE id = ?').run(projectId);
        
      } catch (error) {
        console.error('Local processing error:', error);
        db.prepare('UPDATE processing_runs SET status = "failed", error_log = ?, completed_at = datetime("now") WHERE id = ?')
          .run(\`Error en procesamiento local: \${error.message}\`, runId);
        db.prepare('UPDATE projects SET status = "sources_added" WHERE id = ?').run(projectId);
      }
    };

    if (body.useLocalProcessing) {
      // Run asynchronously
      startLocalProcessing();
      return NextResponse.json({ success: true, runId, version: newVersion, local: true });
    }
`;

content = content.replace(
  /const n8nUrl = process\.env\.N8N_WEBHOOK_URL \|\| 'http:\/\/192\.168\.1\.49:5678';/,
  localProcessingLogic + "\n    const n8nUrl = process.env.N8N_WEBHOOK_URL || 'http://192.168.1.49:5678';"
);

// Update the catch block to fallback to local processing
content = content.replace(
  /console\.error\('Error sending webhook to n8n:', error\);\s*\/\/ Mark as failed\s*db\.prepare\('UPDATE processing_runs SET status = "failed", error_log = \?, completed_at = datetime\("now"\) WHERE id = \?'\)\s*\.run\(`No se pudo conectar con n8n\. Verifica que el servicio esté activo en \$\{n8nUrl\}\. Error: \$\{\(error as Error\)\.message\}`\, runId\);\s*\/\/ Revert project status\s*db\.prepare\('UPDATE projects SET status = "sources_added" WHERE id = \?'\)\.run\(projectId\);\s*return NextResponse\.json\(\{\s*error: 'No se pudo conectar con n8n\. Verifica que el servicio esté activo\.',\s*details: \(error as Error\)\.message\s*\}, \{ status: 502 \}\);/,
  `console.error('Error sending webhook to n8n, falling back to local processing:', error);
      startLocalProcessing();
      return NextResponse.json({ success: true, runId, version: newVersion, fallback: true });`
);

fs.writeFileSync(path, content);
