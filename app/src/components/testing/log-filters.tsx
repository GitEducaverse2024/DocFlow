"use client";

import { Search, Download, RefreshCw } from 'lucide-react';

const LOG_SOURCES = [
  { value: 'all', label: 'Todas' },
  { value: 'processing', label: 'Processing' },
  { value: 'chat', label: 'Chat' },
  { value: 'rag', label: 'RAG' },
  { value: 'catbot', label: 'CatBot' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'canvas', label: 'Canvas' },
  { value: 'connectors', label: 'Connectors' },
  { value: 'system', label: 'System' },
  { value: 'agents', label: 'Agents' },
  { value: 'workers', label: 'Workers' },
  { value: 'skills', label: 'Skills' },
  { value: 'settings', label: 'Settings' },
  { value: 'notifications', label: 'Notifications' },
];

interface LogFiltersProps {
  level: string;
  source: string;
  search: string;
  autoRefresh: boolean;
  onLevelChange: (v: string) => void;
  onSourceChange: (v: string) => void;
  onSearchChange: (v: string) => void;
  onAutoRefreshChange: (v: boolean) => void;
  onDownload: () => void;
}

export function LogFilters({
  level,
  source,
  search,
  autoRefresh,
  onLevelChange,
  onSourceChange,
  onSearchChange,
  onAutoRefreshChange,
  onDownload,
}: LogFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Level select */}
      <select
        value={level}
        onChange={(e) => onLevelChange(e.target.value)}
        className="bg-zinc-900 text-zinc-300 text-sm rounded-lg border border-zinc-700 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-violet-500"
      >
        <option value="all">Todos</option>
        <option value="info">Info</option>
        <option value="warn">Warn</option>
        <option value="error">Error</option>
      </select>

      {/* Source select */}
      <select
        value={source}
        onChange={(e) => onSourceChange(e.target.value)}
        className="bg-zinc-900 text-zinc-300 text-sm rounded-lg border border-zinc-700 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-violet-500"
      >
        {LOG_SOURCES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      {/* Search input */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar en logs..."
          className="w-full bg-zinc-900 text-zinc-300 text-sm rounded-lg border border-zinc-700 pl-9 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder-zinc-500"
        />
      </div>

      {/* Auto-refresh toggle */}
      <button
        onClick={() => onAutoRefreshChange(!autoRefresh)}
        className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
          autoRefresh
            ? 'bg-violet-600/20 border-violet-500/50 text-violet-400'
            : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} style={autoRefresh ? { animationDuration: '3s' } : undefined} />
        Auto-refrescar
      </button>

      {/* Download button */}
      <button
        onClick={onDownload}
        className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-zinc-700 text-zinc-200 hover:bg-zinc-600 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Descargar logs
      </button>
    </div>
  );
}
