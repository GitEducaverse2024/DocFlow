import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { qdrant } from '@/lib/services/qdrant';
import { ollama } from '@/lib/services/ollama';
import { logUsage } from '@/lib/services/usage-tracker';
import { logger } from '@/lib/logger';
import { streamLiteLLM, sseHeaders, createSSEStream } from '@/lib/services/stream-utils';
import { executeCatBrain } from '@/lib/services/execute-catbrain';
import { resolveAlias } from '@/lib/services/alias-routing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MIN_SCORE = 0.35; // Minimum relevance score to include a chunk
const MAX_CONTEXT_CHARS = 24000; // ~6000 tokens — safe for most models (leaves room for response)

interface QdrantResult {
  score: number;
  payload: { text: string; source_name?: string; chunk_index?: number; [key: string]: unknown };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: catbrainId } = await params;
    const { message, stream: useStream } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const catbrain = db.prepare('SELECT name, rag_enabled, rag_collection, rag_model, system_prompt, default_model FROM catbrains WHERE id = ?').get(catbrainId) as {
      name: string;
      rag_enabled: number;
      rag_collection: string;
      rag_model: string | null;
      system_prompt: string | null;
      default_model: string | null;
    };

    if (!catbrain || !catbrain.rag_enabled || !catbrain.rag_collection) {
      return NextResponse.json({ error: 'RAG no esta habilitado para este catbrain' }, { status: 400 });
    }

    logger.info('chat', 'Consulta recibida', { catbrainId, messageLength: message.length, streaming: !!useStream });

    // Use stored model (exact) — fallback to guessing only if not stored
    let embModel = catbrain.rag_model;
    if (!embModel) {
      const collectionInfo = await qdrant.getCollectionInfo(catbrain.rag_collection);
      const vectorSize = collectionInfo?.result?.config?.params?.vectors?.size || 768;
      embModel = ollama.guessModelFromVectorSize(vectorSize);
    }

    // Generate query embedding
    const queryVector = await ollama.getEmbedding(message, embModel);

    // Search with generous limit, then filter by score
    const searchResults = await qdrant.search(catbrain.rag_collection, queryVector, 20);
    const allResults = (searchResults.result || []) as QdrantResult[];

    // Filter by minimum score threshold
    const results = allResults.filter(r => r.score >= MIN_SCORE);

    logger.info('chat', 'Chunks encontrados', {
      catbrainId,
      total: allResults.length,
      aboveThreshold: results.length,
      topScore: allResults[0]?.score || 0,
    });

    // Build context with size guard
    let contextChunks = '';
    let contextSize = 0;
    const usedSources: string[] = [];
    for (const r of results) {
      const sourceName = r.payload.source_name || `Chunk ${r.payload.chunk_index ?? '?'}`;
      const entry = `[${sourceName} | Score: ${(r.score * 100).toFixed(0)}%] ${r.payload.text}`;
      if (contextSize + entry.length > MAX_CONTEXT_CHARS) break;
      contextChunks += (contextChunks ? '\n\n' : '') + entry;
      contextSize += entry.length;
      if (!usedSources.includes(sourceName)) usedSources.push(sourceName);
    }

    logger.info('chat', 'Contexto construido', { catbrainId, contextLength: contextSize, sources: usedSources.length });

    // Build system message
    const basePrompt = catbrain.system_prompt
      ? `${catbrain.system_prompt}\n\nContexto de la base de conocimiento:\n${contextChunks}`
      : `Eres el bot experto del CatBrain "${catbrain.name}". Responde basandote UNICAMENTE en el siguiente contexto extraido de la documentacion. Si la informacion no esta en el contexto, di que no tienes esa informacion.\n\nContexto:\n${contextChunks}`;

    const systemMsg = { role: 'system', content: basePrompt };
    const userMsg = { role: 'user', content: message };
    const chatModel = catbrain.default_model || await resolveAlias('chat-rag');

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
                  send('token', { token });
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

    // -- Non-streaming path --
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
