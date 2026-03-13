import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { qdrant } from '@/lib/services/qdrant';
import { ollama } from '@/lib/services/ollama';
import { logUsage } from '@/lib/services/usage-tracker';
import { logger } from '@/lib/logger';
import { streamLiteLLM, sseHeaders, createSSEStream } from '@/lib/services/stream-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface QdrantResult {
  score: number;
  payload: { text: string; [key: string]: unknown };
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    const { message, stream: useStream } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as {
      name: string;
      rag_enabled: number;
      rag_collection: string;
    };

    if (!project || !project.rag_enabled || !project.rag_collection) {
      return NextResponse.json({ error: 'RAG no esta habilitado para este proyecto' }, { status: 400 });
    }

    logger.info('chat', 'Consulta recibida', { projectId, messageLength: message.length, streaming: !!useStream });

    // Obtener info de la coleccion para determinar modelo de embedding
    const collectionInfo = await qdrant.getCollectionInfo(project.rag_collection);
    if (!collectionInfo) {
      return NextResponse.json({ error: 'Coleccion no encontrada en Qdrant' }, { status: 404 });
    }

    const vectorSize = collectionInfo.result?.config?.params?.vectors?.size || 768;
    const model = ollama.guessModelFromVectorSize(vectorSize);

    // Generar embedding usando servicio compartido
    const queryVector = await ollama.getEmbedding(message, model);

    // Buscar en Qdrant usando servicio compartido (limite 10, sin filtro de score)
    const searchResults = await qdrant.search(project.rag_collection, queryVector, 10);
    const results = searchResults.result || [];

    logger.info('chat', 'Chunks encontrados', { projectId, count: results.length });

    // Construir contexto con todos los resultados (sin filtrar por score)
    const contextChunks = results
      .map((r: QdrantResult, i: number) => `[Fuente ${i + 1}] ${r.payload.text}`)
      .join('\n\n');

    logger.info('chat', 'Contexto construido', { projectId, contextLength: contextChunks.length });

    // Shared system and user messages for both paths
    const systemMsg = {
      role: 'system',
      content: `Eres el bot experto del proyecto "${project.name}". Responde basandote UNICAMENTE en el siguiente contexto extraido de la documentacion del proyecto. Si la informacion no esta en el contexto, di que no tienes esa informacion.\n\nContexto:\n${contextChunks}`,
    };
    const userMsg = { role: 'user', content: message };

    // Read env vars (shared)
    const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
    const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
    const chatModel = process['env']['CHAT_MODEL'] || 'gemini-main';

    // ── Streaming path ──────────────────────────────────────────────
    if (useStream) {
      const chatStartTime = Date.now();

      const sseStream = createSSEStream((send, close) => {
        (async () => {
          try {
            send('start', { timestamp: Date.now() });

            await streamLiteLLM(
              { model: chatModel, messages: [systemMsg, userMsg] },
              {
                onToken: (token) => {
                  send('token', { content: token });
                },
                onDone: (usage) => {
                  logUsage({
                    event_type: 'chat',
                    project_id: projectId,
                    model: chatModel,
                    input_tokens: usage?.prompt_tokens || 0,
                    output_tokens: usage?.completion_tokens || 0,
                    total_tokens: usage?.total_tokens || 0,
                    duration_ms: Date.now() - chatStartTime,
                    status: 'success',
                  });
                  send('done', { usage, sources: results });
                  close();
                },
                onError: (error) => {
                  logger.error('chat', 'Error en streaming', { projectId, error: error.message });
                  send('error', { message: error.message });
                  close();
                },
              }
            );
          } catch (error) {
            send('error', { message: (error as Error).message });
            close();
          }
        })();
      });

      return new Response(sseStream, { headers: sseHeaders });
    }

    // ── Non-streaming path (backward compatible) ────────────────────
    const chatStartTime = Date.now();
    const chatRes = await fetch(`${litellmUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${litellmKey}`,
      },
      body: JSON.stringify({
        model: chatModel,
        messages: [systemMsg, userMsg],
      }),
    });

    if (!chatRes.ok) {
      const errText = await chatRes.text();
      throw new Error(`Error de LiteLLM (${chatRes.status}): ${errText}`);
    }

    const chatData = await chatRes.json();
    const reply = chatData.choices[0]?.message?.content || 'No se pudo generar una respuesta.';

    // Log usage (USAGE-02)
    const chatUsage = chatData.usage || {};
    logUsage({
      event_type: 'chat',
      project_id: projectId,
      model: chatModel,
      input_tokens: chatUsage.prompt_tokens || 0,
      output_tokens: chatUsage.completion_tokens || 0,
      total_tokens: chatUsage.total_tokens || 0,
      duration_ms: Date.now() - chatStartTime,
      status: 'success'
    });

    return NextResponse.json({ reply, sources: results });
  } catch (error) {
    logger.error('chat', 'Error en chat', { error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
