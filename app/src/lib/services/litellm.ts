import { withRetry } from '../retry';
import { logger } from '@/lib/logger';

const LITELLM_URL = process['env']['LITELLM_URL'] || 'http://localhost:4000';
const LITELLM_API_KEY = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';

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
