"use client";

import { useState, useEffect } from 'react';
import { Project } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Loader2, Database, Search, Trash2, RefreshCw, Copy, CheckCircle2, AlertCircle, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { HelpText } from '@/components/ui/help-text';

interface RagPanelProps {
  project: Project;
  onProjectUpdate: () => void;
}

export function RagPanel({ project, onProjectUpdate }: RagPanelProps) {
  const [loading, setLoading] = useState(true);
  const [ragInfo, setRagInfo] = useState<{ enabled: boolean, collectionName?: string, vectorCount?: number, model?: string, status?: string, error?: string } | null>(null);
  
  // Config state
  const [collectionName, setCollectionName] = useState(project?.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || '');
  const [model, setModel] = useState('text-embedding-3-small');
  const [chunkSize, setChunkSize] = useState([512]);
  const [chunkOverlap, setChunkOverlap] = useState([50]);
  
  // Indexing state
  const [isIndexing, setIsIndexing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  
  // Query state
  const [query, setQuery] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [results, setResults] = useState<{ score: number, payload: { chunk_index: number, text: string } }[]>([]);
  const [expandedResult, setExpandedResult] = useState<number | null>(null);
  
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchRagInfo();
  }, [project.id]);

  const fetchRagInfo = async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/rag/info`);
      if (res.ok) {
        const data = await res.json();
        setRagInfo(data);
      }
    } catch {
      console.error('Error fetching RAG info');
    } finally {
      setLoading(false);
    }
  };

  const handleIndex = async (isReindex = false) => {
    if (isReindex && !confirm('Esto borrará la colección actual y la recreará. ¿Continuar?')) {
      return;
    }

    setIsIndexing(true);
    setProgressMsg('Iniciando indexación...');
    
    try {
      // In a real app with streaming, we'd use EventSource or similar
      // For this demo, we'll just make the call and wait
      const res = await fetch(`/api/projects/${project.id}/rag/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionName,
          model,
          chunkSize: chunkSize[0],
          chunkOverlap: chunkOverlap[0]
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al indexar');
      }

      toast.success('Indexación completada');
      
      // Create bot automatically
      try {
        await fetch(`/api/projects/${project.id}/bot/create`, { method: 'POST' });
      } catch (e) {
        console.error('Error creating bot:', e);
      }
      
      onProjectUpdate();
      fetchRagInfo();
    } catch (error: unknown) {
      toast.error((error as Error).message);
    } finally {
      setIsIndexing(false);
      setProgressMsg('');
    }
  };

  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta colección? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      const res = await fetch(`/api/projects/${project.id}/rag`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Error al eliminar');

      toast.success('Colección eliminada');
      onProjectUpdate();
      setRagInfo({ enabled: false });
    } catch {
      toast.error('Error al eliminar la colección');
    }
  };

  const handleQuery = async () => {
    if (!query.trim()) return;

    setIsQuerying(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 5 })
      });

      if (!res.ok) throw new Error('Error en la consulta');

      const data = await res.json();
      setResults(data.results || []);
    } catch {
      toast.error('Error al realizar la consulta');
    } finally {
      setIsQuerying(false);
    }
  };

  const copyIntegrationCode = () => {
    const code = `# Para OpenClaw / OpenHands (shttp_servers):
URL: http://192.168.1.49:6333
Colección: ${ragInfo?.collectionName}

# Para consulta directa:
curl -X POST http://192.168.1.49:6333/collections/${ragInfo?.collectionName}/points/search \\
  -H "Content-Type: application/json" \\
  -d '{"vector": [...], "limit": 5}'`;

    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Código copiado al portapapeles');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (project.status !== 'processed' && project.status !== 'rag_indexed') {
    return (
      <div className="text-center py-16 border border-zinc-800 border-dashed rounded-lg bg-zinc-900/50 flex flex-col items-center justify-center">
        <Database className="w-16 h-16 text-zinc-700 mb-4" />
        <h3 className="text-xl font-medium text-zinc-50 mb-2">Para usar RAG, primero necesitas procesar tus fuentes con un agente IA.</h3>
        <p className="text-zinc-400 max-w-md mx-auto mb-6">
          El RAG indexa los documentos generados en una base vectorial para que puedas consultarlos de forma inteligente.
        </p>
        <Button 
          onClick={() => {
            // Find the process tab trigger and click it
            const processTab = document.querySelector('[value="process"]') as HTMLElement;
            if (processTab) processTab.click();
          }}
          className="bg-violet-500 hover:bg-violet-400 text-white"
        >
          Ir a Procesar
        </Button>
      </div>
    );
  }

  if (!ragInfo?.enabled) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-zinc-50 mb-2">Configuración RAG</h2>
          <p className="text-zinc-400">
            Indexa tus documentos procesados en una base vectorial para consulta inteligente vía MCP.
          </p>
        </div>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg text-zinc-50">Crear colección RAG</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-zinc-300">Nombre de la colección</Label>
              <Input 
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-50"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Label className="text-zinc-300">Modelo de Embeddings</Label>
                <HelpText text="Modelo de embeddings para generar vectores. text-embedding-3-small es más rápido y económico." />
              </div>
              <Select value={model} onValueChange={(v) => setModel(v || "text-embedding-3-small")}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-50">
                  <SelectItem value="text-embedding-3-small">text-embedding-3-small (1536 dims)</SelectItem>
                  <SelectItem value="text-embedding-3-large">text-embedding-3-large (3072 dims)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Label className="text-zinc-300">Tamaño del Chunk (caracteres)</Label>
                  <HelpText text="Tamaño de cada fragmento de texto. Valores más grandes dan más contexto pero menos precisión." />
                </div>
                <span className="text-sm text-zinc-400">{chunkSize[0]}</span>
              </div>
              <Slider 
                value={chunkSize} 
                onValueChange={(v) => setChunkSize(Array.isArray(v) ? v : [v])} 
                max={2048} 
                min={256} 
                step={64}
                className="py-4"
              />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Label className="text-zinc-300">Solapamiento (caracteres)</Label>
                  <HelpText text="Solapamiento entre fragmentos. Evita que información quede cortada entre chunks." />
                </div>
                <span className="text-sm text-zinc-400">{chunkOverlap[0]}</span>
              </div>
              <Slider 
                value={chunkOverlap} 
                onValueChange={(v) => setChunkOverlap(Array.isArray(v) ? v : [v])} 
                max={256} 
                min={0} 
                step={10}
                className="py-4"
              />
            </div>

            <Button 
              className="w-full bg-violet-500 hover:bg-violet-400 text-white"
              onClick={() => handleIndex(false)}
              disabled={isIndexing || !collectionName.trim()}
            >
              {isIndexing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {progressMsg || 'Indexando...'}
                </>
              ) : (
                <>
                  <Database className="w-4 h-4 mr-2" />
                  Indexar documentos
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ragInfo.error && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-amber-500 font-medium">Problema con la colección</h4>
            <p className="text-sm text-amber-400/80">{ragInfo.error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-violet-500/10 flex items-center justify-center">
                <Database className="w-6 h-6 text-violet-500" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">Vectores indexados</p>
                <p className="text-2xl font-bold text-zinc-50">{ragInfo.vectorCount || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Search className="w-6 h-6 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-zinc-400">Colección</p>
                <p className="text-lg font-semibold text-zinc-50 truncate" title={ragInfo.collectionName}>
                  {ragInfo.collectionName}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-6 flex flex-col justify-center h-full gap-2">
            <Button 
              variant="outline" 
              onClick={() => handleIndex(true)}
              disabled={isIndexing}
              className="w-full bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
            >
              {isIndexing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Re-indexar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              disabled={isIndexing}
              className="w-full bg-red-500/10 text-red-500 hover:bg-red-500/20 border-0"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Eliminar colección
            </Button>
          </CardContent>
        </Card>
      </div>

      {(project.bot_created ?? 0) === 1 && project.bot_agent_id && (
        <Card className="bg-zinc-900 border-violet-500/30 overflow-hidden">
          <div className="bg-violet-500/10 px-6 py-4 border-b border-violet-500/20 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-500">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-violet-400">Bot Experto Creado</h3>
              <p className="text-sm text-violet-400/70">Tu asistente especializado está listo para usar</p>
            </div>
          </div>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-zinc-400 mb-1">Nombre</p>
                <p className="font-medium text-zinc-50 mb-4">Experto {project.name}</p>
                
                <p className="text-sm text-zinc-400 mb-1">ID del Agente</p>
                <code className="bg-zinc-950 px-2 py-1 rounded text-violet-400 text-sm">{project.bot_agent_id}</code>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-zinc-400 mb-2">1. Actívalo en OpenClaw:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-zinc-950 px-3 py-2 rounded text-zinc-300 text-sm">openclaw agents add {project.bot_agent_id}</code>
                    <Button size="icon" variant="ghost" onClick={() => {
                      navigator.clipboard.writeText(`openclaw agents add ${project.bot_agent_id}`);
                      toast.success('Comando copiado');
                    }} className="h-9 w-9 text-zinc-400 hover:text-zinc-50">
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-zinc-400 mb-2">2. Chatea con él:</p>
                  <a 
                    href={`http://127.0.0.1:18789/chat?session=agent:${project.bot_agent_id}:${project.bot_agent_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-violet-600 text-white hover:bg-violet-700 h-9 px-4 py-2 w-full"
                  >
                    Abrir en OpenClaw
                  </a>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg text-zinc-50">Probar consulta</CardTitle>
            <CardDescription className="text-zinc-400">
              Busca en la base vectorial para ver qué fragmentos se recuperan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                placeholder="Escribe tu pregunta..."
                className="bg-zinc-950 border-zinc-800 text-zinc-50"
              />
              <Button 
                onClick={handleQuery}
                disabled={isQuerying || !query.trim()}
                className="bg-violet-500 hover:bg-violet-400 text-white"
              >
                {isQuerying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

            <div className="space-y-3 mt-4 max-h-[400px] overflow-y-auto pr-2">
              {results.map((result, idx) => (
                <div 
                  key={idx} 
                  className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg cursor-pointer hover:border-zinc-700 transition-colors"
                  onClick={() => setExpandedResult(expandedResult === idx ? null : idx)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-violet-500/10 text-violet-500 border-0 text-xs">
                        #{idx + 1}
                      </Badge>
                      <Badge variant="outline" className="bg-zinc-900 border-zinc-700 text-zinc-400 text-xs">
                        Chunk {result.payload?.chunk_index}
                      </Badge>
                    </div>
                    <span className="text-xs font-medium text-emerald-500">
                      Score: {(result.score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className={`text-sm text-zinc-300 ${expandedResult === idx ? '' : 'line-clamp-3'}`}>
                    {result.payload?.text}
                  </p>
                </div>
              ))}
              {results.length === 0 && !isQuerying && query && (
                <p className="text-center text-zinc-500 py-4">No se encontraron resultados</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg text-zinc-50">Integración MCP</CardTitle>
            <CardDescription className="text-zinc-400">
              Usa estos datos para conectar la colección con OpenClaw u otros agentes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-300 overflow-x-auto font-mono">
                <code>
{`# Para OpenClaw / OpenHands (shttp_servers):
URL: http://192.168.1.49:6333
Colección: ${ragInfo.collectionName}

# Para consulta directa:
curl -X POST http://192.168.1.49:6333/collections/${ragInfo.collectionName}/points/search \\
  -H "Content-Type: application/json" \\
  -d '{"vector": [...], "limit": 5}'`}
                </code>
              </pre>
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={copyIntegrationCode}
                className="absolute top-2 right-2 h-8 w-8 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
