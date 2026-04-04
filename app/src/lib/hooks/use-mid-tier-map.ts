'use client';

import { useEffect, useState } from 'react';

type TierInfo = {
  tier: string | null;
  cost_notes: string | null;
  display_name: string;
};

let cache: Record<string, TierInfo> | null = null;
let inflight: Promise<Record<string, TierInfo>> | null = null;

async function loadMap(): Promise<Record<string, TierInfo>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch('/api/mid?status=active')
    .then((r) => r.json())
    .then((data) => {
      const map: Record<string, TierInfo> = {};
      for (const m of (data.models || [])) {
        map[m.model_key] = {
          tier: m.tier ?? null,
          cost_notes: m.cost_notes ?? null,
          display_name: m.display_name ?? m.model_key,
        };
      }
      cache = map;
      inflight = null;
      return map;
    })
    .catch(() => {
      inflight = null;
      return {};
    });
  return inflight;
}

/**
 * Returns a memoized model_key -> { tier, cost_notes, display_name } map.
 * Module-level cache ensures /api/mid is fetched only once across many components.
 */
export function useMidTierMap(): Record<string, TierInfo> {
  const [map, setMap] = useState<Record<string, TierInfo>>(cache || {});
  useEffect(() => {
    let mounted = true;
    loadMap().then((m) => {
      if (mounted) setMap(m);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return map;
}
