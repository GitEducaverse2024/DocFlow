import { withRetry } from '@/lib/retry';
import { logger } from '@/lib/logger';

export interface WebSearchResult {
  engine: string;
  query: string;
  results: { title: string; url: string; snippet: string }[];
  total: number;
}

export interface WebSearchOutput {
  answer: string;          // markdown-formatted results
  tokens: number;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  engine: string;
}

export async function executeWebSearch(query: string, engine: string = 'auto'): Promise<WebSearchOutput> {
  const start = Date.now();
  const baseUrl = process['env']['NEXT_PUBLIC_BASE_URL'] || process['env']['BASE_URL'] || 'http://localhost:3500';

  const res = await withRetry(async () => {
    const r = await fetch(`${baseUrl}/api/websearch/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, engine, max_results: 8 }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`WebSearch ${r.status}: ${await r.text().catch(() => '')}`);
    return r.json();
  }, { maxAttempts: 2, baseDelayMs: 1000 });

  const duration_ms = Date.now() - start;

  // Format as markdown for pipeline consumption
  let markdown = `## Resultados de Busqueda Web\n\n`;
  markdown += `**Motor:** ${res.engine} | **Query:** "${query}" | **Resultados:** ${res.results?.length || 0}\n\n`;

  if (res.results && res.results.length > 0) {
    for (const [i, r] of res.results.entries()) {
      markdown += `### ${i + 1}. ${r.title}\n`;
      if (r.url) markdown += `[${r.url}](${r.url})\n\n`;
      if (r.snippet) markdown += `${r.snippet}\n\n`;
    }
  } else {
    markdown += `No se encontraron resultados para "${query}".\n`;
  }

  logger.info('websearch', `executeWebSearch: "${query.slice(0, 50)}" via ${res.engine} -> ${res.results?.length || 0} results in ${duration_ms}ms`);

  return {
    answer: markdown,
    tokens: 0,
    input_tokens: 0,
    output_tokens: 0,
    duration_ms,
    engine: res.engine,
  };
}
