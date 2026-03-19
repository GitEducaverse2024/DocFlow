import { withRetry } from '../retry';
import { logger } from '@/lib/logger';
import { cacheGet, cacheSet } from '@/lib/cache';

const LITELLM_URL = process['env']['LITELLM_URL'] || 'http://localhost:4000';
const LITELLM_API_KEY = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';

const MODELS_CACHE_KEY = 'litellm:models';
const MODELS_CACHE_TTL = 60_000; // 60s

export const litellm = {
  async healthCheck() {
    try {
      const res = await withRetry(async () => {
        const r = await fetch(`${LITELLM_URL}/v1/models`, {
          headers: { 'Authorization': `Bearer ${LITELLM_API_KEY}` },
          signal: AbortSignal.timeout(5000)
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r;
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async getAvailableModels(): Promise<string[]> {
    const cached = cacheGet<string[]>(MODELS_CACHE_KEY);
    if (cached) return cached;

    try {
      const res = await fetch(`${LITELLM_URL}/v1/models`, {
        headers: { 'Authorization': `Bearer ${LITELLM_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const models = (data.data || []).map((m: { id: string }) => m.id);
      cacheSet(MODELS_CACHE_KEY, models, MODELS_CACHE_TTL);
      return models;
    } catch (error) {
      logger.warn('system', 'No se pudo obtener lista de modelos LiteLLM', { error: (error as Error).message });
      return [];
    }
  },

  async resolveModel(requestedModel: string, fallbackModel: string = 'gemini-main'): Promise<string> {
    const models = await this.getAvailableModels();
    if (models.length === 0) return requestedModel; // no list available, try as-is
    if (models.includes(requestedModel)) return requestedModel;

    logger.warn('system', `Modelo "${requestedModel}" no disponible en LiteLLM, usando fallback "${fallbackModel}"`, { requestedModel, fallbackModel, available: models.length });

    if (models.includes(fallbackModel)) return fallbackModel;
    return models[0] || requestedModel;
  },

  async getEmbeddings(texts: string[], model: string = 'text-embedding-3-small') {
    try {
      return await withRetry(async () => {
        const res = await fetch(`${LITELLM_URL}/v1/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LITELLM_API_KEY}`
          },
          body: JSON.stringify({
            model,
            input: texts
          })
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error?.message || 'Error generating embeddings');
        }

        const data = await res.json();
        return data.data.map((d: { embedding: number[] }) => d.embedding);
      });
    } catch (error) {
      logger.error('system', 'LiteLLM embeddings error', { error: (error as Error).message });
      throw new Error('No se puede conectar con el gateway de embeddings. Verifica LiteLLM.');
    }
  },

  getVectorSize(model: string) {
    if (model.includes('large')) return 3072;
    if (model.includes('ada')) return 1536;
    return 1536; // default for text-embedding-3-small
  }
};
