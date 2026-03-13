"use client";

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useNotifications } from '@/hooks/use-notifications';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { NotificationItem } from './notification-item';

export function NotificationBell() {
  const { unreadCount, recent, isLoading, fetchRecent, markAllRead, markOneRead } = useNotifications();

  const displayCount = unreadCount > 99 ? '99+' : unreadCount;

  const handleOpenChange = (open: boolean) => {
    if (open) {
      fetchRecent();
    }
  };

  const handleMarkAllRead = async () => {
    await markAllRead();
    await fetchRecent();
  };

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="relative p-1.5 rounded-md text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors"
          aria-label="Notificaciones"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
              {displayCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end" sideOffset={8}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-50">Notificaciones</h3>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              Marcar todas como leidas
            </button>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {isLoading && recent.length === 0 ? (
            <div className="py-8 text-center text-zinc-500 text-sm">Cargando...</div>
          ) : recent.length === 0 ? (
            <div className="py-8 text-center text-zinc-500 text-sm">Sin notificaciones</div>
          ) : (
            recent.map(n => (
              <NotificationItem
                key={n.id}
                notification={n}
                onMarkRead={n.read === 0 ? markOneRead : undefined}
              />
            ))
          )}
        </div>
        <div className="px-4 py-2.5 border-t border-zinc-800 text-center">
          <Link href="/notifications" className="text-sm text-violet-400 hover:text-violet-300 transition-colors">
            Ver todas
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
