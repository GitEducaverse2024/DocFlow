"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Project } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { MessageCircle, Upload, AlertTriangle, FileText, Database, Loader2, ChevronRight } from 'lucide-react';
import { ResetCatBrainDialog } from './reset-catbrain-dialog';

interface CatBrainEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catbrain: Project | null;
}

interface Stats {
  sources_count: number;
  vectors_count: number | null;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'draft': return 'bg-zinc-500';
    case 'sources_added': return 'bg-blue-500';
    case 'processing': return 'bg-amber-500';
    case 'processed': return 'bg-emerald-500';
    case 'rag_indexed': return 'bg-violet-500';
    default: return 'bg-zinc-500';
  }
};

export function CatBrainEntryModal({ open, onOpenChange, catbrain }: CatBrainEntryModalProps) {
  const router = useRouter();
  const t = useTranslations('catbrains');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  useEffect(() => {
    if (!open || !catbrain) {
      setStats(null);
      return;
    }

    const fetchStats = async () => {
      setLoadingStats(true);
      try {
        const res = await fetch(`/api/catbrains/${catbrain.id}/stats`);
        if (res.ok) {
          const data = await res.json();
          setStats({
            sources_count: data.sources_count ?? 0,
            vectors_count: data.vectors_count,
          });
        }
      } catch {
        // Stats are non-critical, modal still works without them
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, [open, catbrain]);

  if (!catbrain) return null;

  const handleAction = (step: string) => {
    onOpenChange(false);
    // "sources" action uses the simplified pipeline flow
    if (step === 'sources-pipeline') {
      router.push(`/catbrains/${catbrain.id}?flow=sources-pipeline`);
    } else {
      router.push(`/catbrains/${catbrain.id}?step=${step}`);
    }
  };

  const actions = [
    {
      key: 'chat',
      icon: MessageCircle,
      iconColor: 'text-violet-500',
      iconBg: 'bg-violet-500/10',
      title: t('modal.chat'),
      description: t('modal.chatDescription'),
      step: 'chat',
      className: 'border-zinc-800 hover:border-zinc-600',
    },
    {
      key: 'sources',
      icon: Upload,
      iconColor: 'text-blue-500',
      iconBg: 'bg-blue-500/10',
      title: t('modal.newSources'),
      description: t('modal.newSourcesDescription'),
      step: 'sources-pipeline',
      className: 'border-zinc-800 hover:border-zinc-600',
    },
    {
      key: 'reset',
      icon: AlertTriangle,
      iconColor: 'text-red-500',
      iconBg: 'bg-red-500/10',
      title: t('modal.reset'),
      description: t('modal.resetDescription'),
      step: 'sources',
      className: 'border-red-500/30 hover:border-red-500/60',
    },
  ];

  const hasRag = stats?.vectors_count != null && stats.vectors_count > 0;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Image src="/Images/icon/ico_catbrain.png" alt="CatBrain" width={32} height={32} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-xl font-semibold text-zinc-50 truncate">
                  {catbrain.name}
                </DialogTitle>
                <Badge className={`${getStatusColor(catbrain.status)} text-white border-0 flex-shrink-0`}>
                  {t(`status.${catbrain.status}`)}
                </Badge>
              </div>
              {catbrain.description && (
                <p className="text-sm text-zinc-400 line-clamp-2 mt-1">{catbrain.description}</p>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Info row */}
        <div className="flex items-center gap-4 text-sm text-zinc-400 mt-1">
          {loadingStats ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('modal.loading')}</span>
            </div>
          ) : stats ? (
            <>
              <div className="flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                <span>{t('modal.sourcesCount', { count: stats.sources_count })}</span>
              </div>
              {hasRag ? (
                <Badge variant="outline" className="border-emerald-500/50 text-emerald-400 text-xs gap-1">
                  <Database className="w-3 h-3" />
                  {t('modal.ragActive')} · {t('modal.ragVectors', { count: stats.vectors_count! })}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-xs gap-1">
                  <Database className="w-3 h-3" />
                  {t('modal.noRag')}
                </Badge>
              )}
            </>
          ) : null}
        </div>

        {/* Action cards */}
        <div className="grid grid-cols-1 gap-3 mt-4">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                onClick={() => {
                  if (action.key === 'reset') { setShowResetDialog(true); return; }
                  handleAction(action.step);
                }}
                className={`bg-zinc-900 border ${action.className} rounded-lg p-4 cursor-pointer transition-colors flex items-center gap-4 text-left w-full`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${action.iconBg} flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${action.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-50">{action.title}</div>
                  <div className="text-xs text-zinc-500">{action.description}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
              </button>
            );
          })}
        </div>

        {/* Advanced view link */}
        <div className="mt-2 text-center">
          <button
            onClick={() => {
              onOpenChange(false);
              router.push(`/catbrains/${catbrain.id}`);
            }}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {t('modal.advancedView')} →
          </button>
        </div>
      </DialogContent>
    </Dialog>

    {catbrain && stats && (
      <ResetCatBrainDialog
        open={showResetDialog}
        onOpenChange={setShowResetDialog}
        catbrain={catbrain}
        stats={stats}
        onResetComplete={() => {
          setShowResetDialog(false);
          onOpenChange(false);
          toast.success(t('reset.success'));
          router.push(`/catbrains/${catbrain.id}?flow=sources-pipeline`);
        }}
      />
    )}
    </>
  );
}
