/**
 * HealthService — Orchestrates real-time health checks for providers and aliases.
 *
 * Checks every active alias resolution and every discovered provider status,
 * caches results for 30s, supports force-refresh.
 * Consumed by GET /api/models/health (Phase 113) and Centro de Modelos UI (Phase 114+).
 */

import { logger } from '@/lib/logger';
import { cacheGet, cacheSet } from '@/lib/cache';
import { getInventory } from '@/lib/services/discovery';
import { getAllAliases, resolveAlias } from '@/lib/services/alias-routing';

// ---- Types ----

export interface ProviderHealth {
  provider: string;
  status: 'connected' | 'error';
  latency_ms: number | null;
  model_count: number;
  error: string | null;
}

export interface AliasHealth {
  alias: string;
  configured_model: string;
  resolved_model: string | null;
  resolution_status: 'direct' | 'fallback' | 'error';
  error: string | null;
  latency_ms: number;
}

export interface HealthResult {
  providers: ProviderHealth[];
  aliases: AliasHealth[];
  checked_at: string;
  cached: boolean;
}

// ---- Constants ----

const CACHE_KEY = 'health:result';
const CACHE_TTL = 30_000; // 30 seconds

// ---- Main ----

export async function checkHealth(opts?: { force?: boolean }): Promise<HealthResult> {
  const force = opts?.force ?? false;

  // 1. Check cache (unless force refresh)
  if (!force) {
    const cached = cacheGet<HealthResult>(CACHE_KEY);
    if (cached) {
      return { ...cached, cached: true };
    }
  }

  // 2. Get provider statuses from discovery
  const inventory = await getInventory(force);

  const providers: ProviderHealth[] = inventory.providers.map((p) => ({
    provider: p.provider,
    status: p.status === 'connected' ? 'connected' : 'error',
    latency_ms: p.latency_ms,
    model_count: p.model_count,
    error: p.error,
  }));

  // 3. Check all active aliases in parallel
  const aliasRows = getAllAliases({ active_only: true });

  const aliasPromises = aliasRows.map(async (row): Promise<AliasHealth> => {
    const start = Date.now();
    try {
      const resolved = await resolveAlias(row.alias);
      const latency = Date.now() - start;
      const resolutionStatus = resolved === row.model_key ? 'direct' : 'fallback';

      return {
        alias: row.alias,
        configured_model: row.model_key,
        resolved_model: resolved,
        resolution_status: resolutionStatus,
        error: null,
        latency_ms: latency,
      };
    } catch (err) {
      const latency = Date.now() - start;
      const message = (err as Error).message;

      logger.warn('health', `Alias resolution failed: ${row.alias}`, {
        alias: row.alias,
        error: message,
      });

      return {
        alias: row.alias,
        configured_model: row.model_key,
        resolved_model: null,
        resolution_status: 'error',
        error: message,
        latency_ms: latency,
      };
    }
  });

  const aliasResults = await Promise.allSettled(aliasPromises);
  const aliases: AliasHealth[] = aliasResults.map((r) => {
    // Each promise already handles its own errors, so fulfilled is the only expected state
    if (r.status === 'fulfilled') return r.value;
    // Defensive: should never reach here
    return {
      alias: 'unknown',
      configured_model: 'unknown',
      resolved_model: null,
      resolution_status: 'error' as const,
      error: r.reason?.message || 'Unknown error',
      latency_ms: 0,
    };
  });

  // 4. Build result
  const result: HealthResult = {
    providers,
    aliases,
    checked_at: new Date().toISOString(),
    cached: false,
  };

  // 5. Cache the result
  cacheSet(CACHE_KEY, result, CACHE_TTL);

  logger.info('health', 'Health check completed', {
    providers: providers.length,
    aliases: aliases.length,
    errors: aliases.filter((a) => a.resolution_status === 'error').length,
  });

  return result;
}
