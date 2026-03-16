"use client";

import { useSystemHealth } from '@/hooks/use-system-health';

export function Footer() {
  const { health } = useSystemHealth(60000, false);

  const services = [
    { name: 'OpenClaw', status: health.openclaw.status },
    { name: 'n8n', status: health.n8n.status },
    { name: 'Qdrant', status: health.qdrant.status },
    { name: 'LiteLLM', status: health.litellm.status },
    ...(health.linkedin_mcp?.configured ? [{ name: 'LinkedIn MCP', status: health.linkedin_mcp.status }] : []),
    ...(health.searxng?.configured ? [{ name: 'SearXNG', status: health.searxng.status }] : []),
  ];

  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 px-6 py-2 flex items-center justify-between text-xs text-zinc-600">
      <span>DoCatFlow v1.0</span>
      <div className="flex items-center gap-3">
        {services.map((s) => (
          <div key={s.name} className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${
              s.status === 'connected' ? 'bg-emerald-500' :
              s.status === 'disconnected' || s.status === 'error' ? 'bg-red-500' :
              'bg-zinc-600'
            }`} />
            <span>{s.name}</span>
          </div>
        ))}
      </div>
    </footer>
  );
}
