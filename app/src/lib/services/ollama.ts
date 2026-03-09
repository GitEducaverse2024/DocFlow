const OLLAMA_URL = process['env']['OLLAMA_URL'] || 'http://docflow-ollama:11434';

// Map vector sizes to model names for reverse lookup
const DIMS_TO_MODEL: Record<number, string> = {
  768: 'nomic-embed-text',
  1024: 'mxbai-embed-large',
  384: 'all-minilm',
};

export const ollama = {
  async healthCheck() {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  },

  async getEmbedding(text: string, model: string = 'nomic-embed-text'): Promise<number[]> {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text }),
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
  },

  guessModelFromVectorSize(vectorSize: number): string {
    return DIMS_TO_MODEL[vectorSize] || 'nomic-embed-text';
  },
};
