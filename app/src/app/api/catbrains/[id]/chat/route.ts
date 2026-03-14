import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { qdrant } from '@/lib/services/qdrant';
import { ollama } from '@/lib/services/ollama';
import { logUsage } from '@/lib/services/usage-tracker';
import { logger } from '@/lib/logger';
import { streamLiteLLM, sseHeaders, createSSEStream } from '@/lib/services/stream-utils';
import { executeCatBrain } from '@/lib/services/execute-catbrain';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface QdrantResult {
  score: number;
  payload: { text: string; [key: string]: unknown };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: catbrainId } = await params;
    const { message, stream: useStream } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const catbrain = db.prepare('SELECT name, rag_enabled, rag_collection, system_prompt, default_model FROM catbrains WHERE id = ?').get(catbrainId) as {
      name: string;
      rag_enabled: number;
      rag_collection: string;
      system_prompt: string | null;
      default_model: string | null;
    };

    if (!catbrain || !catbrain.rag_enabled || !catbrain.rag_collection) {
      return NextResponse.json({ error: 'RAG no esta habilitado para este catbrain' }, { status: 400 });
    }

    logger.info('chat', 'Consulta recibida', { catbrainId, messageLength: message.length, streaming: !!useStream });

    // Obtener info de la coleccion para determinar modelo de embedding
    const collectionInfo = await qdrant.getCollectionInfo(catbrain.rag_collection);
    if (!collectionInfo) {
      return NextResponse.json({ error: 'Coleccion no encontrada en Qdrant' }, { status: 404 });
    }

    const vectorSize = collectionInfo.result?.config?.params?.vectors?.size || 768;
    const model = ollama.guessModelFromVectorSize(vectorSize);

    // Generar embedding usando servicio compartido
    const queryVector = await ollama.getEmbedding(message, model);

    // Buscar en Qdrant usando servicio compartido (limite 10, sin filtro de score)
    const searchResults = await qdrant.search(catbrain.rag_collection, queryVector, 10);
    const results = searchResults.result || [];

    logger.info('chat', 'Chunks encontrados', { catbrainId, count: results.length });

    // Construir contexto con todos los resultados (sin filtrar por score)
    const contextChunks = results
      .map((r: QdrantResult, i: number) => `[Fuente ${i + 1}] ${r.payload.text}`)
      .join('\n\n');

    logger.info('chat', 'Contexto construido', { catbrainId, contextLength: contextChunks.length });

    // Build system message with catbrain's system_prompt if configured
    const basePrompt = catbrain.system_prompt
      ? `${catbrain.system_prompt}\n\nContexto:\n${contextChunks}`
      : `Eres el bot experto del CatBrain "${catbrain.name}". Responde basandote UNICAMENTE en el siguiente contexto extraido de la documentacion. Si la informacion no esta en el contexto, di que no tienes esa informacion.\n\nContexto:\n${contextChunks}`;

    const systemMsg = {
      role: 'system',
      content: basePrompt,
    };
    const userMsg = { role: 'user', content: message };

    // Model selection for streaming path
    const chatModel = catbrain.default_model || process['env']['CHAT_MODEL'] || 'gemini-main';

    // -- Streaming path --
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
                    project_id: catbrainId,
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
                  logger.error('chat', 'Error en streaming', { catbrainId, error: error.message });
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

    // -- Non-streaming path: use executeCatBrain orchestration --
    const output = await executeCatBrain(catbrainId, { query: message, mode: 'both' });
    return NextResponse.json({
      reply: output.answer,
      sources: results,
      tokens: output.tokens,
      duration_ms: output.duration_ms,
    });
  } catch (error) {
    logger.error('chat', 'Error en chat', { error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
