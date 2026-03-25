import { test, expect } from '@playwright/test';
import { testName, TEST_PREFIX } from '../helpers/test-data';

const CATPAW_NAME = testName('ChatPaw E2E');

test.describe.serial('CatPaw Chat Sheet', () => {
  let pawId: string;

  test.beforeAll(async ({ request }) => {
    // Create a test CatPaw via API
    const res = await request.post('/api/cat-paws', {
      data: {
        name: CATPAW_NAME,
        mode: 'chat',
        description: 'CatPaw para test de chat directo',
        system_prompt: 'Responde siempre con "Hola, soy un CatPaw de prueba."',
        model: 'gemini-main',
      },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    pawId = data.id;
  });

  test.afterAll(async ({ request }) => {
    // Cleanup test CatPaws
    const res = await request.get('/api/cat-paws');
    if (res.ok()) {
      const paws = await res.json();
      for (const paw of paws) {
        if (paw.name?.startsWith(TEST_PREFIX)) {
          await request.delete(`/api/cat-paws/${paw.id}`);
        }
      }
    }
  });

  test('detail page shows Chat button in header', async ({ page }) => {
    await page.goto(`/agents/${pawId}`);
    await page.waitForLoadState('networkidle');

    const chatButton = page.getByRole('button', { name: /Chat/i }).first();
    await expect(chatButton).toBeVisible({ timeout: 10000 });
  });

  test('clicking Chat button opens chat sheet', async ({ page }) => {
    await page.goto(`/agents/${pawId}`);
    await page.waitForLoadState('networkidle');

    const chatButton = page.getByRole('button', { name: /Chat/i }).first();
    await chatButton.click();

    // Sheet should be visible with the CatPaw name
    await expect(page.getByText(new RegExp(`Chat con.*${CATPAW_NAME}|Chat with.*${CATPAW_NAME}`, 'i'))).toBeVisible({ timeout: 5000 });

    // Input field should be visible
    const input = page.getByPlaceholder(/Escribe un mensaje|Type a message/i);
    await expect(input).toBeVisible();
  });

  test('can send a message in chat sheet', async ({ page }) => {
    await page.goto(`/agents/${pawId}`);
    await page.waitForLoadState('networkidle');

    // Open chat sheet
    const chatButton = page.getByRole('button', { name: /Chat/i }).first();
    await chatButton.click();

    // Wait for the sheet to appear
    const input = page.getByPlaceholder(/Escribe un mensaje|Type a message/i);
    await expect(input).toBeVisible({ timeout: 5000 });

    // Send a message
    await input.fill('Hola');
    await page.getByRole('button').filter({ has: page.locator('svg') }).last().click();

    // The user message should appear in the chat
    await expect(page.getByText('Hola').first()).toBeVisible({ timeout: 5000 });
  });

  test('agents list page shows chat icon on card', async ({ page }) => {
    await page.goto('/agents');
    await page.waitForLoadState('networkidle');

    // Find our test CatPaw card
    const card = page.locator('div').filter({ hasText: CATPAW_NAME }).first();
    await expect(card).toBeVisible({ timeout: 10000 });

    // Find the chat icon button within the card area
    const chatIcon = card.locator('button[title]').first();
    await expect(chatIcon).toBeVisible();
  });
});
