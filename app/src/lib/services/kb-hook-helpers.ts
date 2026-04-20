// Phase 153-03 — Shared helpers for API-route KB sync hooks.
//
// Plan 153-02 introduced `hookCtx` and `hookSlug` inline in catbot-tools.ts
// for the 6 tool-case hooks. Plan 153-03 hooks 15 API-route handlers across
// 10 files; inlining would duplicate ~20 LOC × 10 files. This module
// centralizes both helpers so every route file imports them and the hook
// wrapper remains ~10 LOC per handler.
//
// Invariants preserved from Plan 02:
//   - hookSlug is BYTE-IDENTICAL to knowledge-sync.ts:117-123 `slugify`
//     (service does not export it).
//   - hookCtx bridges process.env.KB_ROOT into SyncContext.kbRoot so tests
//     + kb-index-cache + kb-audit all see the same KB root. In production,
//     KB_ROOT is unset → hookCtx returns {author [, reason]} → service
//     falls back to its DEFAULT_KB_ROOT. No behavior change in prod.
//
// Consumers: cat-paws/route.ts + [id]/route.ts, catbrains/route.ts +
// [id]/route.ts, connectors/route.ts + [id]/route.ts, skills/route.ts +
// [id]/route.ts, email-templates/route.ts + [id]/route.ts.

/**
 * Local slugify mirror of knowledge-sync.ts:117-123. Used to build markStale
 * paths on the hook failure path (knowledge-sync's slugify is not exported).
 * Must match the service's output byte-for-byte so the stale marker points
 * at the file syncResource would have created.
 */
export function hookSlug(name: string): string {
  return (
    (name || 'unnamed')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'unnamed'
  );
}

/**
 * Build the SyncContext for a Phase 153 hook. Honors process.env.KB_ROOT
 * when set (tests + env-based deployments) so the hook writes to the same
 * KB root the cache invalidation / audit-log modules see.
 *
 * knowledge-sync.ts does NOT read env itself; it expects ctx.kbRoot. This
 * helper keeps the Phase 149 service contract frozen while letting the
 * caller stay aligned with kb-index-cache + kb-audit siblings.
 */
export function hookCtx(
  author: string,
  extras?: { reason?: string },
): { author: string; kbRoot?: string; reason?: string } {
  const envRoot = process['env']['KB_ROOT'];
  return {
    author,
    ...(envRoot ? { kbRoot: envRoot } : {}),
    ...(extras?.reason ? { reason: extras.reason } : {}),
  };
}
