"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  FolderOpen, Loader2, Bot, Plug, Zap, Coins, Activity,
  ArrowRight, Clock, CheckCircle2, XCircle, HardDrive, Plus,
  Sparkles, MessageSquare, FileText, ClipboardList, Brain
} from 'lucide-react';
import logoImg from '@/../Images/logo.jpg';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts';

interface Summary {
  projects: number;
  agents: number;
  tasks: number;
  connectors: number;
  tokens_today: number;
  cost_this_month: number;
  running_tasks: number;
}

interface UsageData {
  data: Array<Record<string, unknown>>;
  providers: string[];
}

interface ActivityEvent {
  id: string;
  event_type: string;
  project_id: string | null;
  task_id: string | null;
  agent_id: string | null;
  model: string | null;
  total_tokens: number;
  estimated_cost: number;
  duration_ms: number;
  status: string;
  created_at: string;
}

interface TopAgent {
  agent_id: string;
  name: string;
  emoji: string;
  call_count: number;
  total_tokens: number;
  total_cost: number;
}

interface TopModel {
  model: string;
  call_count: number;
  total_tokens: number;
  total_cost: number;
}

interface StorageInfo {
  projects: number;
  sources: number;
  sources_by_type: Array<{ type: string; count: number }>;
  disk_usage_mb: number;
  db_size_mb: number;
}

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#a78bfa',
  openai: '#34d399',
  google: '#fbbf24',
  ollama: '#60a5fa',
  unknown: '#71717a',
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

const eventTypeLabels: Record<string, string> = {
  process: 'Procesamiento',
  chat: 'Chat',
  rag_index: 'RAG Index',
  agent_generate: 'Generar Agente',
  task_step: 'Paso de Tarea',
  connector_call: 'Conector',
};

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [topAgents, setTopAgents] = useState<TopAgent[]>([]);
  const [topModels, setTopModels] = useState<TopModel[]>([]);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/summary').then(r => r.json()).catch(() => null),
      fetch('/api/dashboard/usage?days=7').then(r => r.json()).catch(() => null),
      fetch('/api/dashboard/activity?limit=8').then(r => r.json()).catch(() => []),
      fetch('/api/dashboard/top-agents?limit=5').then(r => r.json()).catch(() => []),
      fetch('/api/dashboard/top-models?limit=5').then(r => r.json()).catch(() => []),
      fetch('/api/dashboard/storage').then(r => r.json()).catch(() => null),
    ]).then(([sum, usg, act, agents, models, stor]) => {
      setSummary(sum);
      setUsage(usg);
      setActivity(Array.isArray(act) ? act : []);
      setTopAgents(Array.isArray(agents) ? agents : []);
      setTopModels(Array.isArray(models) ? models : []);
      setStorage(stor);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  // Welcome screen when no projects exist
  if (summary && summary.projects === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center max-w-lg space-y-6">
          <Image
            src={logoImg}
            alt="DoCatFlow"
            width={120}
            height={120}
            className="rounded-full object-cover mx-auto shadow-lg shadow-violet-500/20"
          />
          <div>
            <h1 className="text-3xl font-bold text-zinc-50">
              Do<span style={{ color: '#8B6D8B' }}>Cat</span>Flow
            </h1>
            <p className="text-zinc-400 mt-1">Intelligent Workflow &amp; Cat-Driven Solutions</p>
          </div>
          <p className="text-zinc-300 leading-relaxed">
            Crea asistentes expertos a partir de tu documentacion.
            Conecta agentes que trabajan juntos para resolver tareas complejas.
          </p>
          <Link href="/catbrains/new">
            <Button className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white px-8 py-3 text-base gap-2">
              <Sparkles className="w-5 h-5" />
              Empezar
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <div className="grid grid-cols-1 gap-3 text-left pt-4">
            {[
              { icon: FileText, text: 'Subir docs y crear asistentes RAG' },
              { icon: Bot, text: 'Configurar agentes especializados' },
              { icon: ClipboardList, text: 'Crear tareas multi-agente' },
              { icon: Plug, text: 'Conectar con servicios externos' },
              { icon: MessageSquare, text: 'Preguntarle a CatBot (tu asistente IA)' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-zinc-400">
                <item.icon className="w-4 h-4 text-violet-400 flex-shrink-0" />
                <span className="text-sm">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-50">Dashboard</h1>
          <p className="text-sm text-zinc-400 mt-1">Panel de operaciones de DoCatFlow</p>
        </div>
        <Link href="/catbrains/new">
          <Button className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white gap-2">
            <Plus className="w-4 h-4" />
            Nuevo CatBrain
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <SummaryCard icon={Brain} label="CatBrains" value={summary.projects} href="/catbrains" />
          <SummaryCard icon={Bot} label="Agentes" value={summary.agents} href="/agents" />
          <SummaryCard icon={Zap} label="Tareas" value={summary.tasks} href="/tasks" />
          <SummaryCard icon={Plug} label="Conectores" value={summary.connectors} href="/connectors" />
          <SummaryCard icon={Activity} label="Tokens hoy" value={formatTokens(summary.tokens_today)} />
          <SummaryCard icon={Coins} label="Coste mes" value={formatCost(summary.cost_this_month)} accent />
          <SummaryCard icon={Loader2} label="En ejecucion" value={summary.running_tasks} accent={summary.running_tasks > 0} />
        </div>
      )}

      {/* Token Usage Chart + Top Models */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-zinc-900 border-zinc-800 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-zinc-200">Uso de tokens (ultimos 7 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            {usage && usage.data.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={usage.data} barCategoryGap="20%">
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
                    tickFormatter={(v) => formatTokens(Number(v) || 0)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
                    labelStyle={{ color: '#a1a1aa' }}
                    formatter={(value) => [formatTokens(Number(value) || 0), 'tokens']}
                  />
                  {usage.providers.map(prov => (
                    <Bar
                      key={prov}
                      dataKey={prov}
                      stackId="a"
                      fill={PROVIDER_COLORS[prov] || PROVIDER_COLORS.unknown}
                      radius={[2, 2, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-zinc-500 text-sm">
                Sin datos de uso esta semana
              </div>
            )}
            {usage && usage.providers.length > 0 && (
              <div className="flex gap-4 mt-3 justify-center">
                {usage.providers.map(p => (
                  <div key={p} className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PROVIDER_COLORS[p] || PROVIDER_COLORS.unknown }} />
                    {p}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-zinc-200">Top modelos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topModels.length > 0 ? topModels.map((m, i) => (
              <div key={m.model} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-zinc-500 w-4">{i + 1}</span>
                  <span className="text-sm text-zinc-200 truncate font-mono">{m.model}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm text-zinc-300">{m.call_count} calls</span>
                  <span className="text-xs text-zinc-500 ml-2">{formatTokens(m.total_tokens || 0)}</span>
                </div>
              </div>
            )) : (
              <p className="text-sm text-zinc-500">Sin datos</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed + Top Agents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-zinc-900 border-zinc-800 lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base text-zinc-200">Actividad reciente</CardTitle>
            <Clock className="w-4 h-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            {activity.length > 0 ? (
              <div className="space-y-2">
                {activity.map(ev => (
                  <div key={ev.id} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      {ev.status === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <span className="text-sm text-zinc-200">
                          {eventTypeLabels[ev.event_type] || ev.event_type}
                        </span>
                        {ev.model && (
                          <span className="text-xs text-zinc-500 ml-2 font-mono">{ev.model}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {ev.total_tokens > 0 && (
                        <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 text-xs">
                          {formatTokens(ev.total_tokens)}
                        </Badge>
                      )}
                      <span className="text-xs text-zinc-500" suppressHydrationWarning>
                        {timeAgo(ev.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 py-4 text-center">Sin actividad registrada</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base text-zinc-200">Top agentes</CardTitle>
            <Link href="/agents" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {topAgents.length > 0 ? topAgents.map((a) => (
              <div key={a.agent_id} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg">{a.emoji}</span>
                  <span className="text-sm text-zinc-200 truncate">{a.name}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm text-zinc-300">{a.call_count} calls</span>
                  {a.total_cost > 0 && (
                    <span className="text-xs text-zinc-500 ml-2">{formatCost(a.total_cost)}</span>
                  )}
                </div>
              </div>
            )) : (
              <p className="text-sm text-zinc-500">Sin datos</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Storage */}
      {storage && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base text-zinc-200">Almacenamiento</CardTitle>
            <HardDrive className="w-4 h-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-2xl font-bold text-zinc-100">{storage.disk_usage_mb} MB</p>
                <p className="text-xs text-zinc-500">Archivos de proyectos</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">{storage.db_size_mb} MB</p>
                <p className="text-xs text-zinc-500">Base de datos</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">{storage.sources}</p>
                <p className="text-xs text-zinc-500">Fuentes totales</p>
              </div>
              <div className="flex gap-2 flex-wrap items-start">
                {storage.sources_by_type.map(s => (
                  <Badge key={s.type} variant="secondary" className="bg-zinc-800 text-zinc-400 text-xs">
                    {s.type}: {s.count}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, href, accent }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  href?: string;
  accent?: boolean;
}) {
  const content = (
    <Card className={`bg-zinc-900 border-zinc-800 ${href ? 'hover:border-zinc-700 transition-colors cursor-pointer' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-4 h-4 ${accent ? 'text-violet-400' : 'text-zinc-500'}`} />
          <span className="text-xs text-zinc-500">{label}</span>
        </div>
        <p className={`text-xl font-bold ${accent ? 'text-violet-400' : 'text-zinc-100'}`}>{value}</p>
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}
