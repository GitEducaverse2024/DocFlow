"use client";

import { useEffect, useState, useCallback } from 'react';
import { Brain, Zap, Plug, Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SystemAlert {
  id: string;
  category: string;
  alert_key: string;
  title: string;
  message: string | null;
  severity: string;
  details: string | null;
  created_at: string;
}

interface CategoryConfig {
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
}

const CATEGORY_MAP: Record<string, CategoryConfig> = {
  knowledge: { icon: Brain, labelKey: 'category_knowledge' },
  execution: { icon: Zap, labelKey: 'category_execution' },
  integration: { icon: Plug, labelKey: 'category_integration' },
  notification: { icon: Bell, labelKey: 'category_notification' },
};

const SEVERITY_COLORS: Record<string, string> = {
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AlertDialogWrapper() {
  const t = useTranslations('alerts');
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);

  useEffect(() => {
    fetch('/api/alerts?pending=true')
      .then(r => r.json())
      .then(data => {
        const pending = data.alerts ?? [];
        if (pending.length > 0) {
          setAlerts(pending);
          setOpen(true);
        }
      })
      .catch(() => {
        // Silently fail — alerts are non-blocking
      });
  }, []);

  const handleAcknowledge = useCallback(async () => {
    try {
      await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledge_all' }),
      });
    } catch {
      // Best-effort acknowledge
    }
    setOpen(false);
  }, []);

  // Group alerts by category
  const grouped = alerts.reduce<Record<string, SystemAlert[]>>((acc, alert) => {
    const cat = alert.category || 'notification';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(alert);
    return acc;
  }, {});

  if (alerts.length === 0) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent
        className="bg-zinc-900/95 border border-zinc-800 max-w-lg"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-zinc-100 text-lg">
            {t('title')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400 text-sm">
            {alerts.length} alerta{alerts.length !== 1 ? 's' : ''} pendiente{alerts.length !== 1 ? 's' : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-[60vh] overflow-y-auto space-y-4 py-2">
          {Object.entries(grouped).map(([category, categoryAlerts]) => {
            const config = CATEGORY_MAP[category] || CATEGORY_MAP.notification;
            const Icon = config.icon;
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-medium text-zinc-200">
                    {t(config.labelKey)}
                  </span>
                  <Badge variant="outline" className="text-xs bg-zinc-800 text-zinc-400 border-zinc-700">
                    {categoryAlerts.length}
                  </Badge>
                </div>
                <div className="space-y-2 ml-6">
                  {categoryAlerts.map(alert => (
                    <div
                      key={alert.id}
                      className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant="outline"
                          className={`text-xs ${SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.info}`}
                        >
                          {alert.severity}
                        </Badge>
                        <span className="text-sm font-medium text-zinc-200">
                          {alert.title}
                        </span>
                      </div>
                      {alert.message && (
                        <p className="text-xs text-zinc-400 mt-1">
                          {alert.message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <AlertDialogFooter>
          <AlertDialogAction
            onClick={handleAcknowledge}
            className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
          >
            {t('understood')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
