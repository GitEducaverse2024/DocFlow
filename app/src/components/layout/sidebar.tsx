"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FolderKanban, Settings, Database, Bot, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';

export function Sidebar() {
  const pathname = usePathname();
  const [health, setHealth] = useState({
    openclaw: false,
    n8n: false,
    qdrant: false
  });

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          setHealth(data.services);
        }
      } catch (error) {
        console.error('Health check failed:', error);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/projects', label: 'Proyectos', icon: FolderKanban },
    { href: '/settings', label: 'Configuración', icon: Settings },
  ];

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
        <div className="text-xs font-medium text-zinc-500 mb-3 px-2 uppercase tracking-wider">
          Estado del Sistema
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-zinc-900/50">
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <Bot className="w-4 h-4" />
              OpenClaw
            </div>
            <div className={`w-2 h-2 rounded-full ${health.openclaw ? 'bg-emerald-500' : 'bg-red-500'}`} />
          </div>
          <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-zinc-900/50">
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <Workflow className="w-4 h-4" />
              n8n
            </div>
            <div className={`w-2 h-2 rounded-full ${health.n8n ? 'bg-emerald-500' : 'bg-red-500'}`} />
          </div>
          <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-zinc-900/50">
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <Database className="w-4 h-4" />
              Qdrant
            </div>
            <div className={`w-2 h-2 rounded-full ${health.qdrant ? 'bg-emerald-500' : 'bg-red-500'}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
