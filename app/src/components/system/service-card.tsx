"use client";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { ServiceStatus } from '@/hooks/use-system-health';

interface ServiceCardProps {
  id: 'openclaw' | 'n8n' | 'qdrant' | 'litellm';
  name: string;
  icon: React.ElementType;
  data: ServiceStatus & { agents?: string[], collections?: string[], collections_count?: number, models?: string[], embedding_models?: string[] };
  onDiagnose: (id: 'openclaw' | 'n8n' | 'qdrant' | 'litellm') => void;
  onVerify: () => void;
  isLoading: boolean;
}

export function ServiceCard({ id, name, icon: Icon, data, onDiagnose, onVerify, isLoading }: ServiceCardProps) {
  const isConnected = data.status === 'connected';
  const isError = data.status === 'disconnected' || data.status === 'error';
  const isChecking = data.status === 'checking' || isLoading;

  const getLatencyColor = (ms: number | null) => {
    if (ms === null) return 'text-zinc-500';
    if (ms < 200) return 'text-emerald-500';
    if (ms < 500) return 'text-amber-500';
    return 'text-red-500';
  };

  return (
    <Card className={`bg-zinc-900 border-zinc-800 ${isError ? 'border-red-900/50' : ''}`}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isConnected ? 'bg-emerald-500/10 text-emerald-500' : isError ? 'bg-red-500/10 text-red-500' : 'bg-zinc-800 text-zinc-400'}`}>
              <Icon className="w-5 h-5" />
            </div>
            <CardTitle className="text-lg text-zinc-50">{name}</CardTitle>
          </div>
          {isChecking ? (
            <Badge className="bg-zinc-800 text-zinc-400 border-0">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Verificando
            </Badge>
          ) : isConnected ? (
            <Badge className="bg-emerald-500/10 text-emerald-500 border-0">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Conectado
            </Badge>
          ) : (
            <Badge className="bg-red-500/10 text-red-500 border-0">
              <AlertCircle className="w-3 h-3 mr-1" />
              Desconectado
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-zinc-500 mb-1">URL Configurada</p>
            {data.url ? (
              <code className="text-xs bg-zinc-950 px-1.5 py-0.5 rounded text-zinc-300 truncate block" title={data.url as string}>
                {data.url as string}
              </code>
            ) : (
              <span className="text-red-400">No configurada</span>
            )}
          </div>
          <div>
            <p className="text-zinc-500 mb-1">Latencia</p>
            <span className={`font-mono ${getLatencyColor(data.latency_ms as number | null)}`}>
              {data.latency_ms ? `${data.latency_ms}ms` : '—'}
            </span>
          </div>
        </div>

        <div className="min-h-[80px] py-2 border-t border-zinc-800">
          {id === 'openclaw' && (
            <div>
              <p className="text-sm text-zinc-500 mb-2">Agentes disponibles</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.isArray(data.agents) && data.agents.length > 0 ? (
                  data.agents.map((agent: string) => (
                    <Badge key={agent} variant="outline" className="bg-zinc-950 border-zinc-800 text-zinc-300 text-xs font-normal">
                      {agent}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-zinc-500">No se detectaron agentes</span>
                )}
              </div>
            </div>
          )}

          {id === 'n8n' && (
            <div>
              <p className="text-sm text-zinc-500 mb-2">Webhook DoCatFlow</p>
              <code className="text-xs bg-zinc-950 px-1.5 py-0.5 rounded text-zinc-300 block break-all">
                {data.url as string}/webhook/docflow-process
              </code>
            </div>
          )}

          {id === 'qdrant' && (
            <div>
              <p className="text-sm text-zinc-500 mb-2">{data.collections_count as number || 0} colecciones activas</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.isArray(data.collections) && data.collections.length > 0 ? (
                  data.collections.map((col: string) => (
                    <Badge key={col} variant="outline" className="bg-zinc-950 border-zinc-800 text-zinc-300 text-xs font-normal">
                      {col}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-zinc-500">Sin colecciones</span>
                )}
              </div>
            </div>
          )}

          {id === 'litellm' && (
            <div className="space-y-3">
              <div>
                <p className="text-sm text-zinc-500 mb-1.5">Modelos Embeddings</p>
                <div className="flex flex-wrap gap-1.5">
                  {Array.isArray(data.embedding_models) && data.embedding_models.length > 0 ? (
                    data.embedding_models.map((m: string) => (
                      <Badge key={m} variant="outline" className="bg-violet-500/10 border-violet-500/20 text-violet-400 text-xs font-normal">
                        {m}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-amber-500">Sin modelos de embeddings — RAG no funcionará</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm text-zinc-500 mb-1.5">Modelos LLM</p>
                <div className="flex flex-wrap gap-1.5">
                  {Array.isArray(data.models) ? data.models.slice(0, 5).map((m: string) => (
                    <Badge key={m} variant="outline" className="bg-zinc-950 border-zinc-800 text-zinc-300 text-xs font-normal">
                      {m}
                    </Badge>
                  )) : null}
                  {Array.isArray(data.models) && data.models.length > 5 && (
                    <Badge variant="outline" className="bg-zinc-950 border-zinc-800 text-zinc-500 text-xs font-normal">
                      +{data.models.length - 5} más
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="pt-2">
          {isError ? (
            <Button
              onClick={() => onDiagnose(id)}
              className="w-full bg-red-500/10 text-red-500 hover:bg-red-500/20 border-0"
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              Diagnosticar
            </Button>
          ) : (
            <Button
              onClick={onVerify}
              disabled={isChecking}
              variant="outline"
              className="w-full bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
              Verificar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
