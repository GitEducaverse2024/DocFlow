import { withRetry } from '../retry';
import { logger } from '../logger';

const OLLAMA_URL = process['env']['OLLAMA_URL'] || 'http://docflow-ollama:11434';

// Known embedding model families — used to identify embedding models from Ollama
const EMBEDDING_FAMILIES = [
  'nomic-embed', 'mxbai-embed', 'all-minilm', 'snowflake-arctic-embed',
  'bge-m3', 'bge-large', 'bge-small', 'bge-base',
  'qwen3-embedding', 'qwen2-embedding',
  'granite-embedding', 'embeddinggemma',
  'e5-', 'gte-',
];

// Safe char limits per embedding model family (muy conservador — español denso ≈ 2-2.5 chars/token).
// Prevents `Ollama embedding error (400): input length exceeds context length` on large queries.
// Modelos no listados pasan sin truncar (comportamiento previo preservado).
// Heurística: limit ≈ (ctx_tokens × 2.3 chars/token) × 0.9 safety margin.
const EMBEDDING_CHAR_LIMITS: Record<string, number> = {
  'mxbai-embed-large': 1200,         // 512 ctx × 2.3 × 0.9 ≈ 1060, redondeado a 1200 si el modelo respeta 512 estricto; bajar a 1000 si re-aparece 400
  'all-minilm': 1200,                // 512 ctx
  'snowflake-arctic-embed': 1200,    // 512 ctx
  'snowflake-arctic-embed2': 1200,
  'nomic-embed-text': 18000,         // 8192 ctx (generoso, modelo con mucho más ctx)
  'nomic-embed-text-v2-moe': 18000,
  'bge-m3': 18000,                   // 8192 ctx
  'bge-large': 1200,                 // 512 ctx
  'bge-small': 1200,
  'bge-base': 1200,
  'qwen3-embedding': 18000,          // 8192 ctx
  'qwen2-embedding': 18000,
  'granite-embedding': 18000,
  'embeddinggemma': 4500,            // 2048 ctx
  'e5-large': 1200,
  'e5-small': 1200,
  'gte-large': 1200,
  'gte-small': 1200,
};

function truncateForEmbedding(text: string, model: string): { text: string; truncated: boolean; limit?: number } {
  const baseModel = model.split(':')[0]; // strip tag like ':latest'
  const limit = EMBEDDING_CHAR_LIMITS[baseModel];
  if (!limit || text.length <= limit) {
    return { text, truncated: false, limit };
  }
  return { text: text.slice(0, limit), truncated: true, limit };
}

// Models that support Matryoshka Representation Learning (reduced dimensions)
const MRL_MODELS: Record<string, { native_dims: number; supported_dims: number[] }> = {
  'qwen3-embedding': { native_dims: 1024, supported_dims: [512, 768, 1024] },
  'snowflake-arctic-embed2': { native_dims: 1024, supported_dims: [256, 512, 768, 1024] },
  'nomic-embed-text-v2-moe': { native_dims: 768, supported_dims: [256, 512, 768] },
};

export interface OllamaModelInfo {
  name: string;
  full_name: string;
  size_mb: number;
  family: string;
  parameter_size: string;
  is_embedding: boolean;
  supports_mrl: boolean;
  mrl_dims?: number[];
  native_dims?: number;
}

export const ollama = {
  async healthCheck() {
    try {
      const res = await withRetry(async () => {
        const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r;
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  /** List all Ollama models with metadata */
  async listModels(): Promise<OllamaModelInfo[]> {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    const models = (data.models || []) as Array<{
      name: string;
      size: number;
      details?: { family?: string; parameter_size?: string };
    }>;

    return models.map(m => {
      const baseName = m.name.split(':')[0];
      const isEmbedding = EMBEDDING_FAMILIES.some(f => baseName.toLowerCase().includes(f));
      const mrlInfo = Object.entries(MRL_MODELS).find(([key]) => baseName.toLowerCase().includes(key));

      return {
        name: baseName,
        full_name: m.name,
        size_mb: Math.round(m.size / 1024 / 1024),
        family: m.details?.family || 'unknown',
        parameter_size: m.details?.parameter_size || '',
        is_embedding: isEmbedding,
        supports_mrl: !!mrlInfo,
        mrl_dims: mrlInfo ? mrlInfo[1].supported_dims : undefined,
        native_dims: mrlInfo ? mrlInfo[1].native_dims : undefined,
      };
    });
  },

  /** List only embedding models */
  async listEmbeddingModels(): Promise<OllamaModelInfo[]> {
    const all = await this.listModels();
    return all.filter(m => m.is_embedding);
  },

  /** Check if a model name matches a known embedding family */
  isEmbeddingModel(name: string): boolean {
    const lower = name.toLowerCase();
    return EMBEDDING_FAMILIES.some(f => lower.includes(f));
  },

  /** Get MRL info for a model (or null if not supported) */
  getMrlInfo(modelName: string): { native_dims: number; supported_dims: number[] } | null {
    const lower = modelName.toLowerCase();
    const entry = Object.entries(MRL_MODELS).find(([key]) => lower.includes(key));
    return entry ? entry[1] : null;
  },

  async getEmbedding(text: string, model: string = 'nomic-embed-text'): Promise<number[]> {
    const { text: inputText, truncated, limit } = truncateForEmbedding(text, model);
    if (truncated) {
      logger.warn('chat', 'Embedding query truncated to model context limit', {
        model,
        originalLength: text.length,
        truncatedLength: inputText.length,
        limit,
      });
    }
    return withRetry(async () => {
      const res = await fetch(`${OLLAMA_URL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: inputText }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Ollama embedding error (${res.status}): ${err}`);
      }

      const data = await res.json();
      if (data.embeddings && data.embeddings.length > 0) {
        return data.embeddings[0];
      }
      if (data.embedding) {
        return data.embedding;
      }
      throw new Error('No embedding returned from Ollama');
    });
  },

  /** Detect vector dimensions for a model by embedding a test string */
  async detectVectorSize(model: string): Promise<number> {
    const embedding = await this.getEmbedding('dimension test', model);
    return embedding.length;
  },

  /** Legacy: guess model from vector size (used as fallback only) */
  guessModelFromVectorSize(vectorSize: number): string {
    const DIMS_TO_MODEL: Record<number, string> = {
      384: 'all-minilm',
      768: 'nomic-embed-text',
      1024: 'mxbai-embed-large',
    };
    return DIMS_TO_MODEL[vectorSize] || 'nomic-embed-text';
  },
};
