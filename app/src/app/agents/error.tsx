'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

const SECTION_NAME = 'Agents';

const CATBOT_KEY = 'docatflow_catbot_messages';
const MAX_STORED = 50;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errorBoundary');

  useEffect(() => {
    try {
      const existing = JSON.parse(localStorage.getItem(CATBOT_KEY) || '[]');
      existing.push({
        role: 'assistant',
        content: t('catbotMessage', { section: SECTION_NAME, message: error.message }),
        timestamp: Date.now(),
      });
      localStorage.setItem(CATBOT_KEY, JSON.stringify(existing.slice(-MAX_STORED)));
    } catch {
      // Ignore localStorage errors (private browsing, full storage, etc.)
    }
    console.error(`[${SECTION_NAME}] Error boundary caught:`, error);
  }, [error, t]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-fade-in">
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 max-w-md">
        <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-zinc-100 mb-2">
          {t('title')}
        </h2>
        <p className="text-zinc-400 mb-1 text-sm">
          {t('sectionError', { section: SECTION_NAME })}
        </p>
        <p className="text-zinc-500 mb-6 text-xs font-mono break-all">
          {error.message}
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset}>
            {t('retry')}
          </Button>
          <Button variant="outline" onClick={() => window.location.href = '/'}>
            {t('goHome')}
          </Button>
        </div>
        <p className="text-zinc-600 text-xs mt-4">
          {t('catbotNotified')}
        </p>
      </div>
    </div>
  );
}
