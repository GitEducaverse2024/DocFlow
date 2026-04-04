export const TIER_STYLES: Record<string, string> = {
  Elite: 'bg-gradient-to-r from-violet-600/20 to-purple-700/20 border-violet-500/40 text-violet-300',
  Pro: 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300',
  Libre: 'bg-zinc-700/30 border-zinc-600/40 text-zinc-300',
};

const FALLBACK = 'bg-zinc-800 border-zinc-700 text-zinc-400';

export function getTierStyle(tier: string | null | undefined): string {
  if (!tier) return FALLBACK;
  return TIER_STYLES[tier] ?? FALLBACK;
}
