/**
 * DEPRECATED: This spec is replaced by catbrains.spec.ts
 * Kept as a redirect test to verify backward compat of /api/projects → /api/catbrains
 */
import { test, expect } from '@playwright/test';

test.describe('Projects (backward compat)', () => {
  test('GET /api/projects returns data (via redirect)', async ({ request }) => {
    const res = await request.get('/api/projects');
    expect(res.ok()).toBe(true);
  });
});
