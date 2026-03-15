/**
 * DEPRECATED: This spec is replaced by catpaws.spec.ts
 * Kept as a redirect test to verify backward compat of /api/agents → /api/cat-paws
 */
import { test, expect } from '@playwright/test';

test.describe('Agents (backward compat)', () => {
  test('GET /api/agents returns data (via redirect)', async ({ request }) => {
    const res = await request.get('/api/agents');
    // Should either redirect or return data
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('/agents page loads (shows CatPaw grid)', async ({ page }) => {
    await page.goto('/agents');
    await page.waitForLoadState('networkidle');
    // The page should show the new Agentes heading
    await expect(page.getByRole('heading', { name: /Agentes/i })).toBeVisible();
  });
});
