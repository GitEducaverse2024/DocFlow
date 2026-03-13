"use client";

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

interface NotificationFiltersProps {
  type: string;
  severity: string;
  onTypeChange: (v: string) => void;
  onSeverityChange: (v: string) => void;
}

const typeOptions = [
  { value: 'all', label: 'Todos los tipos' },
  { value: 'process', label: 'Procesamiento' },
  { value: 'rag', label: 'RAG' },
  { value: 'task', label: 'Tareas' },
  { value: 'canvas', label: 'Canvas' },
  { value: 'connector', label: 'Conectores' },
  { value: 'system', label: 'Sistema' },
];

const severityOptions = [
  { value: 'all', label: 'Todas las severidades' },
  { value: 'success', label: 'Exito' },
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Advertencia' },
  { value: 'error', label: 'Error' },
];

export function NotificationFilters({ type, severity, onTypeChange, onSeverityChange }: NotificationFiltersProps) {
  return (
    <div className="flex items-center gap-3">
      <Select value={type || 'all'} onValueChange={(v) => onTypeChange(!v || v === 'all' ? '' : v)}>
        <SelectTrigger className="w-48 border-zinc-700 bg-zinc-900 text-zinc-300">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {typeOptions.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={severity || 'all'} onValueChange={(v) => onSeverityChange(!v || v === 'all' ? '' : v)}>
        <SelectTrigger className="w-48 border-zinc-700 bg-zinc-900 text-zinc-300">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {severityOptions.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
