'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, Plug, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';

const tabs = [
  { href: '/catpower/skills', labelKey: 'skills' as const, icon: Sparkles },
  { href: '/catpower/connectors', labelKey: 'connectors' as const, icon: Plug },
  { href: '/catpower/templates', labelKey: 'templates' as const, icon: Mail },
];

export default function CatPowerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations('catpower');

  return (
    <div className="min-h-screen">
      {/* Tab bar */}
      <div className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 pt-4">
          <h1 className="text-lg font-semibold text-zinc-50 mb-3">CatPower</h1>
          <div className="flex gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                    isActive
                      ? 'bg-zinc-900 text-violet-400 border border-zinc-800 border-b-zinc-950'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t(`tabs.${tab.labelKey}`)}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      {children}
    </div>
  );
}
