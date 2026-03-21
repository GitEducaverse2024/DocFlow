'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import logoImg from '@/../Images/logo.jpg';

const LANGUAGES = [
  { code: 'es', name: 'Español', flag: '🇪🇸', desc: 'Idioma principal' },
  { code: 'en', name: 'English', flag: '🇬🇧', desc: 'English interface' },
];

export default function WelcomePage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string>('es');
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    setLoading(true);
    await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: selected }),
    });
    // Also save in DB settings
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'user_locale', value: selected }),
    });
    router.push('/');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-8">
      {/* Logo */}
      <div className="flex flex-col items-center mb-10 animate-fade-in">
        <div className="relative w-24 h-24 mb-4">
          <Image
            src={logoImg}
            alt="DoCatFlow"
            fill
            className="rounded-2xl object-cover ring-2 ring-violet-500/40"
          />
        </div>
        <h1 className="text-3xl font-bold text-zinc-100 mb-1">DoCatFlow</h1>
        <p className="text-zinc-400 text-sm">Select your language / Selecciona tu idioma</p>
      </div>

      {/* Language cards */}
      <div className="flex gap-4 mb-10 animate-slide-up">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => setSelected(lang.code)}
            className={`
              flex flex-col items-center gap-2 p-6 rounded-xl border-2 transition-all w-40
              ${selected === lang.code
                ? 'border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/10 scale-105'
                : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
              }
            `}
          >
            <span className="text-4xl">{lang.flag}</span>
            <span className="text-zinc-100 font-semibold">{lang.name}</span>
            <span className="text-zinc-500 text-xs">{lang.desc}</span>
            {selected === lang.code && (
              <div className="w-2 h-2 rounded-full bg-violet-500 mt-1" />
            )}
          </button>
        ))}
      </div>

      {/* Continue button */}
      <button
        onClick={handleContinue}
        disabled={loading}
        className="
          px-8 py-3 rounded-xl font-semibold text-white
          bg-gradient-to-r from-violet-600 to-purple-700
          hover:from-violet-500 hover:to-purple-600
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all shadow-lg shadow-violet-500/20
          animate-slide-up
        "
      >
        {loading ? '...' : selected === 'es' ? 'Continuar \u2192' : 'Continue \u2192'}
      </button>

      <p className="mt-6 text-zinc-600 text-xs">
        {selected === 'es'
          ? 'Podrás cambiar el idioma en cualquier momento desde la barra lateral'
          : 'You can change the language anytime from the sidebar'}
      </p>
    </div>
  );
}
