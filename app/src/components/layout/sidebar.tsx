"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FolderKanban, Bot, FileOutput, Sparkles, ClipboardList, Settings, Activity } from 'lucide-react';
import { useSystemHealth } from '@/hooks/use-system-health';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

export function Sidebar() {
  const pathname = usePathname();
  const { health } = useSystemHealth();

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/projects', label: 'Proyectos', icon: FolderKanban },
    { href: '/agents', label: 'Agentes', icon: Bot },
    { href: '/workers', label: 'Docs Workers', icon: FileOutput },
    { href: '/skills', label: 'Skills', icon: Sparkles },
    { href: '/tasks', label: 'Tareas', icon: ClipboardList },
    { href: '/settings', label: 'Configuración', icon: Settings },
    { href: '/system', label: 'Estado del Sistema', icon: Activity },
  ];

  const services = [
    { name: 'OpenClaw', status: health.openclaw.status },
    { name: 'n8n', status: health.n8n.status },
    { name: 'Qdrant', status: health.qdrant.status },
    { name: 'LiteLLM', status: health.litellm.status }
  ];

  const connectedCount = services.filter(s => s.status === 'connected').length;
  const hasError = services.some(s => s.status === 'disconnected' || s.status === 'error');

  return (
    <div className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col h-screen">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-zinc-50 flex items-center gap-2">
          <div className="w-8 h-8 bg-violet-500 rounded-lg flex items-center justify-center">
            <span className="text-white text-lg">D</span>
          </div>
          DocFlow
        </h1>
      </div>

      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive 
                  ? 'bg-violet-500/10 text-violet-400' 
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-50'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-zinc-800">
        <Link href="/system" className="block group">
          <div className="flex items-center justify-between px-2 py-2 rounded-md hover:bg-zinc-900/50 transition-colors">
            <div className="flex gap-1.5">
              <TooltipProvider>
                {services.map((s) => (
                  <Tooltip key={s.name}>
                    <TooltipTrigger>
                      <div className={`w-2 h-2 rounded-full ${
                        s.status === 'connected' ? 'bg-emerald-500' :
                        s.status === 'checking' ? 'bg-zinc-600' :
                        'bg-red-500 animate-pulse'
                      }`} />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{s.name}: {s.status}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </TooltipProvider>
            </div>
            <span className={`text-xs font-medium ${hasError ? 'text-amber-500' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
              {connectedCount}/4 servicios
            </span>
          </div>
        </Link>
      </div>
    </div>
  );
}
