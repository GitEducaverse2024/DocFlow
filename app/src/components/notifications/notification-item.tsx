"use client";

import Link from 'next/link';
import { CheckCircle, Info, AlertTriangle, AlertCircle } from 'lucide-react';
import type { Notification } from '@/hooks/use-notifications';

const severityConfig = {
  success: { icon: CheckCircle, color: 'text-emerald-500' },
  info: { icon: Info, color: 'text-blue-500' },
  warning: { icon: AlertTriangle, color: 'text-amber-500' },
  error: { icon: AlertCircle, color: 'text-red-500' },
} as const;

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'hace unos segundos';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `hace ${diffDays}d`;
  return new Date(dateStr).toLocaleDateString('es-ES');
}

interface NotificationItemProps {
  notification: Notification;
  onMarkRead?: (id: string) => void;
}

export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const config = severityConfig[notification.severity] || severityConfig.info;
  const Icon = config.icon;
  const isUnread = notification.read === 0;

  const truncatedMessage = notification.message && notification.message.length > 80
    ? notification.message.slice(0, 80) + '...'
    : notification.message;

  const handleClick = () => {
    if (isUnread && onMarkRead) {
      onMarkRead(notification.id);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-zinc-800/50 ${
        isUnread ? 'bg-zinc-900/50 border-l-2 border-violet-500' : 'border-l-2 border-transparent'
      }`}
    >
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${isUnread ? 'font-medium text-zinc-50' : 'text-zinc-300'}`}>
            {notification.title}
          </span>
          <span className="text-[11px] text-zinc-500 shrink-0">
            {timeAgo(notification.created_at)}
          </span>
        </div>
        {truncatedMessage && (
          <p className="text-sm text-zinc-400 mt-0.5 line-clamp-2">{truncatedMessage}</p>
        )}
        {notification.link && (
          <Link
            href={notification.link}
            className="text-xs text-violet-400 hover:text-violet-300 mt-1 inline-block"
            onClick={(e) => e.stopPropagation()}
          >
            Ver
          </Link>
        )}
      </div>
    </div>
  );
}
