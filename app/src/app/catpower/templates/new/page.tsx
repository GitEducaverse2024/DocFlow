'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function NewTemplatePage() {
  const router = useRouter();
  const t = useTranslations('catpower');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/email-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: t('templates.new'), category: 'general' }),
    })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to create template');
        return r.json();
      })
      .then((data) => {
        router.replace(`/catpower/templates/${data.id}`);
      })
      .catch((err) => setError(err.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto mt-16 text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => router.push('/catpower/templates')}
            className="mt-4 text-violet-400 underline"
          >
            {t('templates.back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
    </div>
  );
}
