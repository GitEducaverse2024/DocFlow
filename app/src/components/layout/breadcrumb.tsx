"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { useTranslations } from 'next-intl';

const ROUTE_KEYS = [
  'catbrains', 'projects', 'agents', 'workers', 'skills',
  'tasks', 'catflow', 'canvas', 'connectors', 'notifications', 'testing',
  'settings', 'system', 'knowledge',
] as const;

export function Breadcrumb() {
  const pathname = usePathname();
  const t = useTranslations('layout.breadcrumb');

  if (pathname === '/') return null;

  const routeLabels: Record<string, string> = {};
  for (const key of ROUTE_KEYS) {
    routeLabels[key] = t(key);
  }

  const segments = pathname.split('/').filter(Boolean);

  const crumbs = segments.map((seg, i) => {
    const href = '/' + segments.slice(0, i + 1).join('/');
    const label = routeLabels[seg] || decodeURIComponent(seg);
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
