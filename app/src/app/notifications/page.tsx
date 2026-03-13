"use client";

import { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { NotificationItem } from '@/components/notifications/notification-item';
import { NotificationFilters } from '@/components/notifications/notification-filters';
import type { Notification } from '@/hooks/use-notifications';

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState('');
  const [page, setPage] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(page * PAGE_SIZE));
      if (type) params.set('type', type);
      if (severity) params.set('severity', severity);

      const res = await fetch(`/api/notifications?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications);
      setTotal(data.total);
    } catch {
      // Silently ignore
    } finally {
      setIsLoading(false);
    }
  }, [page, type, severity]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [type, severity]);

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' });
      fetchNotifications();
    } catch {
      // Silently ignore
    }
  };

  const handleMarkOneRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: 1 } : n));
    } catch {
      // Silently ignore
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Notificaciones"
        description="Centro de notificaciones del sistema"
        icon={<Bell className="w-6 h-6" />}
      />

      <div className="rounded-lg border border-zinc-800 bg-zinc-950">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <NotificationFilters
            type={type}
            severity={severity}
            onTypeChange={setType}
            onSeverityChange={setSeverity}
          />
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-violet-400 hover:text-violet-300 hover:bg-zinc-800 transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            Marcar todas como leidas
          </button>
        </div>

        {/* Stats */}
        <div className="px-4 py-2 border-b border-zinc-800">
          <span className="text-sm text-zinc-500">
            Mostrando {notifications.length} de {total} notificaciones
          </span>
        </div>

        {/* List */}
        <div className="min-h-[200px]">
          {isLoading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-zinc-500 text-sm">
              Cargando...
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
              <Bell className="w-10 h-10 mb-3 opacity-50" />
              <span className="text-sm">No hay notificaciones</span>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {notifications.map(n => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={n.read === 0 ? handleMarkOneRead : undefined}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-zinc-400"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
            <span className="text-sm text-zinc-500">
              Pagina {page + 1} de {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-zinc-400"
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
