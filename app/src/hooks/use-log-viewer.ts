"use client";

import { useState, useEffect, useRef, useCallback } from 'react';

export interface LogEntry {
  ts: string;
  level: string;
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export function useLogViewer() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState<string>('all');
  const [source, setSource] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const debouncedSearchRef = useRef<string>('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async (searchOverride?: string) => {
    try {
      const params = new URLSearchParams();
      if (level !== 'all') params.set('level', level);
      if (source !== 'all') params.set('source', source);
      const searchVal = searchOverride !== undefined ? searchOverride : debouncedSearchRef.current;
      if (searchVal) params.set('search', searchVal);
      params.set('limit', '200');

      const qs = params.toString();
      const res = await fetch(`/api/system/logs${qs ? `?${qs}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
      }
    } catch {
      // Silently fail — polling will retry
    } finally {
      setLoading(false);
    }
  }, [level, source]);

  // Debounce search input
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debouncedSearchRef.current = search;
      fetchLogs(search);
    }, 500);
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [search, fetchLogs]);

  // Fetch on mount and when level/source change
  useEffect(() => {
    setLoading(true);
    fetchLogs();
  }, [level, source, fetchLogs]);

  // Polling every 3s when autoRefresh is on
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchLogs();
      }, 3000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, fetchLogs]);

  const downloadLogs = useCallback(() => {
    window.open('/api/system/logs/download', '_blank');
  }, []);

  return {
    entries,
    level,
    source,
    search,
    loading,
    autoRefresh,
    setLevel,
    setSource,
    setSearch,
    setAutoRefresh,
    fetchLogs,
    downloadLogs,
  };
}
