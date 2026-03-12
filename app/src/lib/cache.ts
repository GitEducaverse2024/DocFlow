const store = new Map<string, { data: unknown; expiresAt: number }>();

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() < entry.expiresAt) {
    return entry.data as T;
  }
  store.delete(key);
  return null;
}

/**
 * Store data in the cache with a TTL.
 * CRITICAL: Only call cacheSet with successful responses.
 * The cache module does not enforce this — callers must ensure they
 * only cache data from successful (non-error) operations.
 */
export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function cacheInvalidate(key: string): void {
  store.delete(key);
}

export function cacheInvalidatePrefix(prefix: string): void {
  const keys = Array.from(store.keys());
  for (const key of keys) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}
