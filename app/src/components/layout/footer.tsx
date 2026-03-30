"use client";

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSystemHealth } from '@/hooks/use-system-health';

interface TelegramStatus {
  configured: boolean;
  status?: 'active' | 'paused' | 'inactive';
}

export function Footer() {
  const { health } = useSystemHealth(60000, false);
  const t = useTranslations('layout');
  const [telegram, setTelegram] = useState<TelegramStatus>({ configured: false });

  // SYS-01: Fetch telegram config status on mount with 60s refresh
  useEffect(() => {
    const fetchTelegram = async () => {
      try {
        const res = await fetch('/api/telegram/config');
        if (res.ok) {
          const data = await res.json();
          setTelegram({ configured: data.configured, status: data.status });
        }
      } catch {
        // silent — telegram dot just won't show
      }
    };
    fetchTelegram();
    const interval = setInterval(fetchTelegram, 60_000);
    return () => clearInterval(interval);
  }, []);

  const services = [
    { name: 'OpenClaw', status: health.openclaw.status },
    { name: 'n8n', status: health.n8n.status },
    { name: 'Qdrant', status: health.qdrant.status },
    { name: 'LiteLLM', status: health.litellm.status },
    ...(health.linkedin_mcp?.configured ? [{ name: 'LinkedIn MCP', status: health.linkedin_mcp.status }] : []),
    ...(health.holded_mcp?.configured ? [{ name: 'Holded MCP', status: health.holded_mcp.status }] : []),
    ...(health.searxng?.configured ? [{ name: 'SearXNG', status: health.searxng.status }] : []),
  ];

  // SYS-01: Telegram dot color — green=active, yellow=paused, red=inactive/error
  const telegramDotColor = telegram.status === 'active' ? 'bg-emerald-500' :
    telegram.status === 'paused' ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 px-6 py-2 flex items-center justify-between text-xs text-zinc-600">
      <span>DoCatFlow {t('version')}</span>
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
        {telegram.configured && (
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${telegramDotColor}`} />
            <span>Telegram</span>
          </div>
        )}
      </div>
    </footer>
  );
}
