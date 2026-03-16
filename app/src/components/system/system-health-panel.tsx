"use client";

import { useState } from 'react';
import { useSystemHealth } from '@/hooks/use-system-health';
import { ServiceCard } from './service-card';
import { DiagnosticSheet } from './diagnostic-sheet';
import { Bot, Workflow, Database, Cpu, RefreshCw, Server, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpText } from '@/components/ui/help-text';

export function SystemHealthPanel() {
  const { health, isLoading, refresh } = useSystemHealth();
  const [diagnosticService, setDiagnosticService] = useState<'openclaw' | 'n8n' | 'qdrant' | 'litellm' | null>(null);

  const handleDiagnose = (id: 'openclaw' | 'n8n' | 'qdrant' | 'litellm') => {
    setDiagnosticService(id);
  };

  const handleRetry = () => {
    refresh();
    // We don't close the sheet automatically, let the user see if it turns green
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-50 mb-2">Estado del Sistema</h1>
          <div className="flex items-center gap-2">
            <p className="text-zinc-400">Monitorización de servicios e infraestructura</p>
            <HelpText text="Estado en tiempo real de los servicios de infraestructura. Pulsa Diagnosticar en un servicio caído para ver los pasos de resolución." />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-500" suppressHydrationWarning>
            Última verificación: {new Date(health.timestamp).toLocaleTimeString()}
          </span>
          <Button 
            onClick={refresh} 
            disabled={isLoading}
            className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Verificar todo ahora
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ServiceCard 
          id="openclaw"
          name="OpenClaw"
          icon={Bot}
          data={health.openclaw}
          onDiagnose={handleDiagnose}
          onVerify={refresh}
          isLoading={isLoading}
        />
        <ServiceCard 
          id="n8n"
          name="n8n"
          icon={Workflow}
          data={health.n8n}
          onDiagnose={handleDiagnose}
          onVerify={refresh}
          isLoading={isLoading}
        />
        <ServiceCard 
          id="qdrant"
          name="Qdrant"
          icon={Database}
          data={health.qdrant}
          onDiagnose={handleDiagnose}
          onVerify={refresh}
          isLoading={isLoading}
        />
        <ServiceCard 
          id="litellm"
          name="LiteLLM"
          icon={Cpu}
          data={health.litellm}
          onDiagnose={handleDiagnose}
          onVerify={refresh}
          isLoading={isLoading}
        />
      </div>

      {health.linkedin_mcp?.configured && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-zinc-50 flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${health.linkedin_mcp?.status === 'connected' ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
              LinkedIn MCP
              <span className={`text-xs px-2 py-0.5 rounded-full ml-auto ${health.linkedin_mcp?.status === 'connected' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                {health.linkedin_mcp?.status === 'connected' ? 'online' : 'offline'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-zinc-500 mb-1">Latencia</p>
                <span className="text-zinc-300 font-medium">{health.linkedin_mcp?.latency_ms || 0}ms</span>
              </div>
              <div>
                <p className="text-sm text-zinc-500 mb-1">Puerto</p>
                <span className="text-zinc-300 font-medium">8765</span>
              </div>
            </div>
            {health.linkedin_mcp?.status !== 'connected' && (
              <p className="text-xs text-zinc-600 mt-3">
                Ver: systemctl --user status docatflow-linkedin-mcp
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {health.searxng?.configured && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-zinc-50 flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-500/10">
                <Search className="w-4 h-4 text-violet-400" />
              </div>
              SearXNG
              <span className={`text-xs px-2 py-0.5 rounded-full ml-auto ${health.searxng?.status === 'connected' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                {health.searxng?.status === 'connected' ? 'online' : 'offline'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-zinc-500 mb-1">Latencia</p>
                <span className="text-zinc-300 font-medium">{health.searxng?.latency_ms || 0}ms</span>
              </div>
              <div>
                <p className="text-sm text-zinc-500 mb-1">Puerto</p>
                <span className="text-zinc-300 font-medium">8080</span>
              </div>
            </div>
            {health.searxng?.status !== 'connected' && (
              <p className="text-xs text-zinc-600 mt-3">
                Ver: docker ps | grep docflow-searxng
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg text-zinc-50 flex items-center gap-2">
            <Server className="w-5 h-5 text-violet-500" />
            DoCatFlow Core
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-zinc-500 mb-1">Base de datos (SQLite)</p>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${health.docflow.db === 'ok' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <span className="text-zinc-300 font-medium">{health.docflow.db === 'ok' ? 'Operativa' : 'Error'}</span>
              </div>
            </div>
            <div>
              <p className="text-sm text-zinc-500 mb-1">CatPaws activos</p>
              <span className="text-2xl font-bold text-zinc-50">{health.docflow.catpaws_count || 0}</span>
            </div>
            <div>
              <p className="text-sm text-zinc-500 mb-1">Fuentes totales</p>
              <span className="text-2xl font-bold text-zinc-50">{health.docflow.sources_count}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <DiagnosticSheet 
        isOpen={diagnosticService !== null}
        onClose={() => setDiagnosticService(null)}
        serviceId={diagnosticService}
        error={diagnosticService ? health[diagnosticService].error : null}
        url={diagnosticService ? health[diagnosticService].url : ''}
        onRetry={handleRetry}
      />
    </div>
  );
}
