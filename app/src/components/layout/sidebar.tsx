"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FolderKanban, Bot, FileOutput, Sparkles, ClipboardList, Workflow, Plug, Bell, FlaskConical, Settings, Activity, Menu, X } from 'lucide-react';
import { useSystemHealth } from '@/hooks/use-system-health';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { NotificationBell } from '@/components/notifications/notification-bell';
import logoImg from '@/../Images/logo.jpg';
import mascotImg from '@/../Images/dcf_01.png';

export function Sidebar() {
  const pathname = usePathname();
  const { health } = useSystemHealth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/projects', label: 'Proyectos', icon: FolderKanban },
    { href: '/agents', label: 'Agentes', icon: Bot },
    { href: '/workers', label: 'Docs Workers', icon: FileOutput },
    { href: '/skills', label: 'Skills', icon: Sparkles },
    { href: '/tasks', label: 'Tareas', icon: ClipboardList },
    { href: '/canvas', label: 'Canvas', icon: Workflow },
    { href: '/connectors', label: 'Conectores', icon: Plug },
    { href: '/notifications', label: 'Notificaciones', icon: Bell },
    { href: '/testing', label: 'Testing', icon: FlaskConical },
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

  const sidebarContent = (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src={logoImg}
              alt="DoCatFlow"
              width={32}
              height={32}
              className="rounded-full object-cover"
            />
            <div className="flex flex-col">
              <h1 className="text-lg font-bold text-zinc-50 leading-tight">
                Do<span style={{ color: '#8B6D8B' }}>Cat</span>Flow
              </h1>
              <span className="text-xs text-zinc-500">v1.0</span>
            </div>
          </div>
          <NotificationBell />
        </div>
      </div>

      <nav className="px-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? 'bg-gradient-to-r from-violet-600/20 to-purple-600/10 border-l-2 border-violet-500 text-violet-400'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-50'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex-1 flex items-end justify-center p-4 min-h-0 overflow-hidden">
        <Image
          src={mascotImg}
          alt="DoCatFlow mascot"
          className="w-full h-full object-contain"
          sizes="200px"
          priority={false}
        />
      </div>

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
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-50 transition-colors"
        aria-label="Abrir menú"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col h-screen transform transition-transform lg:hidden ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 p-1.5 text-zinc-500 hover:text-zinc-300"
          aria-label="Cerrar menú"
        >
          <X className="w-5 h-5" />
        </button>
        {sidebarContent}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-64 bg-zinc-950 border-r border-zinc-800 flex-col h-screen">
        {sidebarContent}
      </div>
    </>
  );
}
