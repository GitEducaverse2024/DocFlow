'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Plus, Building2, ShoppingCart, FileBarChart, Bell, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { EmailTemplate } from '@/lib/types';

const categoryIcons: Record<string, typeof Mail> = {
  general: Mail,
  corporate: Building2,
  commercial: ShoppingCart,
  report: FileBarChart,
  notification: Bell,
};

const categoryColors: Record<string, string> = {
  general: 'bg-violet-500/20 text-violet-400',
  corporate: 'bg-blue-500/20 text-blue-400',
  commercial: 'bg-green-500/20 text-green-400',
  report: 'bg-amber-500/20 text-amber-400',
  notification: 'bg-rose-500/20 text-rose-400',
};

export default function TemplatesListPage() {
  const t = useTranslations('catpower');
  const router = useRouter();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/email-templates')
      .then((r) => r.json())
      .then((data) => setTemplates(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-zinc-50">{t('templates.title')}</h2>
        <Button
          onClick={() => router.push('/catpower/templates/new')}
          className="bg-violet-600 hover:bg-violet-700 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          {t('templates.new')}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        /* Empty state */
        <div className="max-w-md mx-auto mt-16 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Mail className="w-8 h-8 text-violet-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-50 mb-2">{t('templates.empty')}</h3>
          <p className="text-zinc-400 mb-6">{t('templates.emptyDesc')}</p>
          <Button
            onClick={() => router.push('/catpower/templates/new')}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('templates.new')}
          </Button>
        </div>
      ) : (
        /* Grid of template cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl) => {
            const Icon = categoryIcons[tpl.category] || Mail;
            const colorClass = categoryColors[tpl.category] || categoryColors.general;

            return (
              <button
                key={tpl.id}
                onClick={() => router.push(`/catpower/templates/${tpl.id}`)}
                className="text-left bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-violet-500/50 transition-colors group"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colorClass.split(' ')[0]}`}>
                    <Icon className={`w-5 h-5 ${colorClass.split(' ')[1]}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-zinc-50 group-hover:text-violet-400 transition-colors truncate">
                      {tpl.name}
                    </h3>
                    {tpl.description && (
                      <p className="text-sm text-zinc-500 truncate mt-0.5">{tpl.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-xs ${colorClass}`}>
                    {t(`templates.metadata.categories.${tpl.category}` as Parameters<typeof t>[0])}
                  </Badge>
                  <span className="text-xs text-zinc-600">
                    {tpl.times_used} {t('templates.uses')}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
