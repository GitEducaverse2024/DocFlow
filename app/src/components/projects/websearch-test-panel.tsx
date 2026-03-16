'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Loader2, ExternalLink } from 'lucide-react';

interface SearchResult {
  title: string;
  url?: string;
  snippet: string;
}

interface Props {
  catbrainId: string;
  engine: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function WebSearchTestPanel({ catbrainId, engine }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [usedEngine, setUsedEngine] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setSearched(true);

    try {
      const res = await fetch('/api/websearch/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), engine, max_results: 5 }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Error en la busqueda' }));
        throw new Error(data.error || `Error ${res.status}`);
      }

      const data = await res.json();
      setResults(data.results || []);
      setUsedEngine(data.engine || engine);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800 mt-6">
      <CardHeader>
        <CardTitle className="text-zinc-50 text-base">Probar Busqueda</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Escribe una consulta..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="bg-zinc-800 border-zinc-700 text-zinc-50"
          />
          <Button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="bg-violet-600 hover:bg-violet-500 text-white gap-2 flex-shrink-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar
          </Button>
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {!searched && !loading && (
          <p className="text-sm text-zinc-500">Escribe una consulta y presiona Buscar</p>
        )}

        {searched && !loading && !error && results.length === 0 && (
          <p className="text-sm text-zinc-500">Sin resultados para esta consulta.</p>
        )}

        {results.length > 0 && (
          <div className="space-y-3">
            {usedEngine && (
              <p className="text-xs text-zinc-500">Motor utilizado: <span className="text-zinc-300">{usedEngine}</span></p>
            )}
            {results.map((r, i) => (
              <div key={i} className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    {r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-violet-400 hover:text-violet-300 flex items-center gap-1"
                      >
                        <span className="truncate">{r.title}</span>
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    ) : (
                      <span className="text-sm font-medium text-zinc-200">{r.title}</span>
                    )}
                    <p className="text-xs text-zinc-400 mt-1 line-clamp-3">{r.snippet}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
