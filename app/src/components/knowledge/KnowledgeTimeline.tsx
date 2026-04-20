/**
 * KnowledgeTimeline — Phase 154 Plan 02 recharts LineChart wrapper.
 *
 * Client component (recharts needs the browser DOM). Consumes
 * `aggregateChangesByDay` from the Plan 01 pure lib. Dark theme adapted
 * from `app/src/app/page.tsx:239-270` BarChart — same palette,
 * LineChart shape.
 */
'use client';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { aggregateChangesByDay, type KbChange } from '@/lib/kb-timeline';

interface Props {
  changes: readonly KbChange[];
}

export function KnowledgeTimeline({ changes }: Props) {
  const data = aggregateChangesByDay(changes);
  if (data.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-zinc-500 text-sm">
        Sin cambios recientes
      </div>
    );
  }
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="text-xs text-zinc-400 mb-2">Cambios por día</div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="day"
            tick={{ fill: '#71717a', fontSize: 12 }}
            tickFormatter={(v) => String(v).slice(5)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#71717a', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <RechartsTooltip
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
            labelStyle={{ color: '#a1a1aa' }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#8B6D8B"
            strokeWidth={2}
            dot={{ fill: '#8B6D8B', r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
