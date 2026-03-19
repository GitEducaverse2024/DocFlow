import { NextResponse } from 'next/server';
import { litellm } from '@/lib/services/litellm';
import { ollama } from '@/lib/services/ollama';

export const dynamic = 'force-dynamic';

// Well-known models that can be pulled (shown as suggestions when not installed)
const SUGGESTED_MODELS = [
  { name: 'qwen3-embedding:0.6b', description: '#1 MTEB multilingual, 1024 dims, 32K ctx, MRL', size_mb: 639 },
  { name: 'qwen3-embedding:4b', description: 'Alta calidad multilingual, 2560 dims, MRL', size_mb: 2500 },
  { name: 'bge-m3', description: 'Hybrid search (dense+sparse), 1024 dims', size_mb: 1200 },
  { name: 'snowflake-arctic-embed2', description: 'Rapido multilingual, 1024 dims, MRL', size_mb: 1200 },
  { name: 'nomic-embed-text', description: 'Rapido EN, 768 dims', size_mb: 274 },
  { name: 'mxbai-embed-large', description: 'Preciso EN, 1024 dims', size_mb: 670 },
  { name: 'all-minilm', description: 'Ultra-ligero EN, 384 dims', size_mb: 46 },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  try {
    if (type === 'embedding') {
      // Dynamically detect embedding models from Ollama
      const embeddingModels = await ollama.listEmbeddingModels();

      const installed = embeddingModels.map(m => ({
        name: m.name,
        full_name: m.full_name,
        size_mb: m.size_mb,
        family: m.family,
        parameter_size: m.parameter_size,
        supports_mrl: m.supports_mrl,
        mrl_dims: m.mrl_dims,
        native_dims: m.native_dims,
      }));

      // Filter suggestions to exclude already installed models
      const installedNames = installed.map(m => m.name);
      const suggestions = SUGGESTED_MODELS
        .filter(s => !installedNames.includes(s.name.split(':')[0]))
        .map(s => ({ ...s, installed: false }));

      return NextResponse.json({ installed, suggestions });
    }

    // Default: LiteLLM chat models
    const models = await litellm.getAvailableModels();
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: [], installed: [], suggestions: [] });
  }
}
