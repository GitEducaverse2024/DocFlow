import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { qdrant } from '@/lib/services/qdrant';
import { ollama } from '@/lib/services/ollama';
import { logUsage } from '@/lib/services/usage-tracker';
import { litellm } from '@/lib/services/litellm';
import { resolveAlias } from '@/lib/services/alias-routing';
import { executeCatBrainConnectors, formatConnectorResults } from './catbrain-connector-executor';
import type { CatBrainInput, CatBrainOutput } from '@/lib/types/catbrain';

const MIN_SCORE = 0.35;
const MAX_CONTEXT_CHARS = 24000; // ~6000 tokens

interface CatBrainRow {
  id: string;
  name: string;
  system_prompt: string | null;
  default_model: string | null;
  rag_enabled: number;
  rag_collection: string | null;
  rag_model: string | null;
}

interface QdrantResult {
  score: number;
  payload: { text: string; source_name?: string; [key: string]: unknown };
}

/**
 * Orchestrates RAG + connectors + LLM with system prompt injection.
 * Single entry point for non-streaming CatBrain interactions.
 */
export async function executeCatBrain(
  catbrainId: string,
  input: CatBrainInput
): Promise<CatBrainOutput> {
  const startTime = Date.now();
  const mode = input.mode || 'both';

  // 1. Load catbrain record
  const catbrain = db.prepare(
    'SELECT id, name, system_prompt, default_model, rag_enabled, rag_collection, rag_model FROM catbrains WHERE id = ?'
  ).get(catbrainId) as CatBrainRow | undefined;

  if (!catbrain) {
    throw new Error('CatBrain no encontrado');
  }

  logger.info('chat', 'Executing CatBrain', {
    catbrainId,
    name: catbrain.name,
    mode,
    queryLength: input.query.length,
  });

  // 2. Gather RAG context with score filtering + context guard
  let ragContext = '';
  const ragSources: string[] = [];
  if ((mode === 'rag' || mode === 'both') && catbrain.rag_enabled && catbrain.rag_collection) {
    try {
      // Use stored model (exact) — fallback to guessing only if not stored
      let embModel = catbrain.rag_model;
      if (!embModel) {
        const collectionInfo = await qdrant.getCollectionInfo(catbrain.rag_collection);
        const vectorSize = collectionInfo?.result?.config?.params?.vectors?.size || 768;
        embModel = ollama.guessModelFromVectorSize(vectorSize);
      }

      const queryVector = await ollama.getEmbedding(input.query, embModel);
      const searchResults = await qdrant.search(catbrain.rag_collection, queryVector, 20);
      const allResults = (searchResults.result || []) as QdrantResult[];

      // Filter by score threshold
      const results = allResults.filter(r => r.score >= MIN_SCORE);

      // Build context with size guard
      let contextSize = 0;
      const contextParts: string[] = [];
      for (const r of results) {
        const sourceName = r.payload.source_name || 'documento';
        const entry = `[${sourceName}] ${r.payload.text}`;
        if (contextSize + entry.length > MAX_CONTEXT_CHARS) break;
        contextParts.push(entry);
        contextSize += entry.length;
        ragSources.push(r.payload.text);
      }
      ragContext = contextParts.join('\n\n');
    } catch (err) {
      logger.error('chat', 'Error fetching RAG context', {
        catbrainId,
        error: (err as Error).message,
      });
    }
  }

  // 3. Execute connectors
  let connectorResults: { connector_name: string; success: boolean; data: unknown }[] = [];
  let connectorText = '';
  if (mode === 'connector' || mode === 'both') {
    try {
      const connectorMode: 'connector' | 'both' = mode === 'connector' ? 'connector' : 'both';
      const results = await executeCatBrainConnectors(catbrainId, input.query, connectorMode);
      connectorResults = results.map(r => ({
        connector_name: r.connector_name,
        success: r.success,
        data: r.data,
      }));
      connectorText = formatConnectorResults(results);
    } catch (err) {
      logger.error('chat', 'Error executing connectors', {
        catbrainId,
        error: (err as Error).message,
      });
    }
  }

  // 4. Build system prompt
  const systemParts: string[] = [];

  if (catbrain.system_prompt) {
    systemParts.push(catbrain.system_prompt);
  } else {
    systemParts.push(`Eres el asistente experto del CatBrain "${catbrain.name}".`);
  }

  if (ragContext) {
    systemParts.push(`\nContexto de la base de conocimiento:\n${ragContext}`);
  }

  if (connectorText) {
    systemParts.push(`\nDatos de conectores:\n${connectorText}`);
  }

  const systemMessage = systemParts.join('\n');

  // 5. Build user message
  let userContent = input.query;
  if (input.context) {
    userContent = `Contexto previo:\n${input.context}\n\n---\n\n${input.query}`;
  }

  // 6. Call LLM
  const rawModel = catbrain.default_model || await resolveAlias('chat-rag');
  const model = await litellm.resolveModel(rawModel);

  const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
  const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';

  const chatRes = await fetch(`${litellmUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${litellmKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userContent },
      ],
      temperature: 0.7,
      max_tokens: 8000,
    }),
  });

  if (!chatRes.ok) {
    const errText = await chatRes.text();
    throw new Error(`Error de LiteLLM (${chatRes.status}): ${errText}`);
  }

  const chatData = await chatRes.json();
  const answer = chatData.choices?.[0]?.message?.content || 'No se pudo generar una respuesta.';
  const usage = chatData.usage || {};
  const durationMs = Date.now() - startTime;

  // 7. Log usage
  logUsage({
    event_type: 'chat',
    project_id: catbrainId,
    model,
    input_tokens: usage.prompt_tokens || 0,
    output_tokens: usage.completion_tokens || 0,
    total_tokens: usage.total_tokens || 0,
    duration_ms: durationMs,
    status: 'success',
  });

  // 8. Return output
  return {
    answer,
    sources: ragSources.length > 0 ? ragSources : undefined,
    connector_data: connectorResults.length > 0 ? connectorResults : undefined,
    catbrain_id: catbrainId,
    catbrain_name: catbrain.name,
    tokens: usage.total_tokens || 0,
    input_tokens: usage.prompt_tokens || 0,
    output_tokens: usage.completion_tokens || 0,
    duration_ms: durationMs,
  };
}
