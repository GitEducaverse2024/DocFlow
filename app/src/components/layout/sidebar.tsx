"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileStack, Plus, LayoutDashboard, FolderOpen, Database, Settings, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

export function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        setIsConnected(data.openclaw === 'ok');
      } catch {
        setIsConnected(false);
      }
    };
    
    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/projects', icon: FolderOpen, label: 'Todos los Proyectos' },
    { href: '/rag', icon: Database, label: 'Colecciones RAG' },
    { href: '/settings', icon: Settings, label: 'Configuración' },
  ];

  return (
    <div className={cn(
      "flex flex-col h-screen bg-zinc-900 border-r border-zinc-800 transition-all duration-300",
      isCollapsed ? "w-16" : "w-64"
    )}>
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        {!isCollapsed && (
          <Link href="/" className="flex items-center gap-2 text-zinc-50 font-semibold">
            <FileStack className="w-6 h-6 text-violet-500" />
            <span>DocFlow</span>
          </Link>
        )}
        {isCollapsed && (
          <Link href="/" className="mx-auto">
            <FileStack className="w-6 h-6 text-violet-500" />
          </Link>
        )}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-zinc-400 hover:text-zinc-50"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4">
        <Link 
          href="/projects/new"
          className={cn(
            "flex items-center justify-center gap-2 bg-violet-500 hover:bg-violet-400 text-white rounded-md py-2 transition-colors",
            isCollapsed ? "px-0" : "px-4"
          )}
        >
          <Plus className="w-5 h-5" />
          {!isCollapsed && <span>Nuevo Proyecto</span>}
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                  isActive 
                    ? "bg-zinc-800 text-zinc-50" 
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-50",
                  isCollapsed && "justify-center px-0"
                )}
                title={isCollapsed ? item.label : undefined}
              >
                <item.icon className="w-5 h-5" />
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-zinc-800 text-sm">
        <div className={cn(
          "flex items-center gap-2",
          isCollapsed && "justify-center"
        )} title={isCollapsed ? (isConnected ? "OpenClaw conectado" : "OpenClaw offline") : undefined}>
          <div className={cn(
            "w-2 h-2 rounded-full",
            isConnected ? "bg-emerald-500" : "bg-red-500"
          )} />
          {!isCollapsed && (
            <span className="text-zinc-400 truncate">
              {isConnected ? "OpenClaw conectado" : "OpenClaw offline"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
