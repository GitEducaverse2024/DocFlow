"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';

const ROUTE_LABELS: Record<string, string> = {
  '': 'Dashboard',
  'projects': 'CatBrains',
  'catbrains': 'CatBrains',
  'agents': 'Agentes',
  'workers': 'Docs Workers',
  'skills': 'Skills',
  'tasks': 'Tareas',
  'canvas': 'Canvas',
  'connectors': 'Conectores',
  'settings': 'Configuración',
  'system': 'Sistema',
};

export function Breadcrumb() {
  const pathname = usePathname();

  if (pathname === '/') return null;

  const segments = pathname.split('/').filter(Boolean);

  const crumbs = segments.map((seg, i) => {
    const href = '/' + segments.slice(0, i + 1).join('/');
    const label = ROUTE_LABELS[seg] || decodeURIComponent(seg);
    const isLast = i === segments.length - 1;
    return { href, label, isLast };
  });

  return (
    <nav className="flex items-center gap-1.5 text-sm text-zinc-500 mb-4">
      <Link href="/" className="hover:text-zinc-300 transition-colors">
        <Home className="w-3.5 h-3.5" />
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.href} className="flex items-center gap-1.5">
          <ChevronRight className="w-3 h-3 text-zinc-700" />
          {crumb.isLast ? (
            <span className="text-zinc-300">{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="hover:text-zinc-300 transition-colors">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
