import { useState, useEffect, useCallback, useRef } from 'react';

export interface Notification {
  id: string;
  type: 'process' | 'rag' | 'task' | 'canvas' | 'connector' | 'system';
  title: string;
  message: string;
  severity: 'success' | 'info' | 'warning' | 'error';
  link: string | null;
  read: number;
  created_at: string;
}

export function useNotifications(pollInterval = 15000) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [recent, setRecent] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/count', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (mountedRef.current) {
        setUnreadCount(data.count);
      }
    } catch {
      // Silently ignore — polling will retry
    }
  }, []);

  const fetchRecent = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/notifications?limit=20', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (mountedRef.current) {
        setRecent(data.notifications);
      }
    } catch {
      // Silently ignore
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'POST' });
      if (!res.ok) return;
      if (mountedRef.current) {
        setUnreadCount(0);
        setRecent(prev => prev.map(n => ({ ...n, read: 1 })));
      }
    } catch {
      // Silently ignore
    }
  }, []);

  const markOneRead = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      if (!res.ok) return;
      if (mountedRef.current) {
        setUnreadCount(prev => Math.max(0, prev - 1));
        setRecent(prev => prev.map(n => n.id === id ? { ...n, read: 1 } : n));
      }
    } catch {
      // Silently ignore
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchCount();
    const interval = setInterval(fetchCount, pollInterval);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchCount, pollInterval]);

  return { unreadCount, recent, isLoading, fetchCount, fetchRecent, markAllRead, markOneRead };
}
