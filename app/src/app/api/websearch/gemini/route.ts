import { NextResponse } from 'next/server';
import { withRetry } from '@/lib/retry';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface GeminiSearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

interface GroundingMetadata {
  grounding_chunks?: GroundingChunk[];
  web_search_queries?: string[];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = (body.query || '').trim();

    if (!query) {
      return NextResponse.json({ error: 'Query es requerida' }, { status: 400 });
    }
    if (query.length > 500) {
      return NextResponse.json({ error: 'Query demasiado larga (max 500 caracteres)' }, { status: 400 });
    }

    const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
    const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';

    const result = await withRetry(async () => {
      const res = await fetch(`${litellmUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${litellmKey}`,
        },
        body: JSON.stringify({
          model: 'gemini-search',
          messages: [
            { role: 'user', content: `Search the web for: ${query}` }
          ],
          tools: [{ googleSearch: {} }],
          max_tokens: 1024,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`LiteLLM ${res.status}: ${errText.slice(0, 200)}`);
      }

      return res.json();
    }, { maxAttempts: 3, baseDelayMs: 1000 });

    // Extract grounding metadata from response
    const choice = result.choices?.[0];
    const groundingMetadata: GroundingMetadata | undefined =
      choice?.message?.grounding_metadata ||
      choice?.grounding_metadata ||
      result.grounding_metadata;

    const textContent = choice?.message?.content || '';
    const results: GeminiSearchResult[] = [];

    if (groundingMetadata?.grounding_chunks?.length) {
      // Extract structured results from grounding chunks
      for (const chunk of groundingMetadata.grounding_chunks) {
        if (chunk.web?.uri) {
          results.push({
            title: chunk.web.title || chunk.web.uri,
            url: chunk.web.uri,
            snippet: '', // Grounding chunks don't always include snippets
          });
        }
      }
    }

    // If no grounding results but we have text, return as synthetic result
    if (results.length === 0 && textContent) {
      results.push({
        title: `Gemini: ${query}`,
        url: '',
        snippet: textContent.slice(0, 500),
      });
    }

    logger.info('websearch', `Gemini search: "${query.slice(0, 50)}" -> ${results.length} results`);

    return NextResponse.json({
      engine: 'gemini',
      query,
      results,
      web_search_queries: groundingMetadata?.web_search_queries || [],
      raw_text: textContent,
    });

  } catch (error: unknown) {
    const msg = (error as Error).message || 'Error desconocido';
    logger.error('websearch', `Gemini search error: ${msg}`);
    return NextResponse.json(
      { error: `Error en busqueda Gemini: ${msg}` },
      { status: 502 }
    );
  }
}
