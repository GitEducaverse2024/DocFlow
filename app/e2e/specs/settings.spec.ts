import { test, expect } from '@playwright/test';
import { SettingsPOM } from '../pages/settings.pom';

test.describe('Configuracion', () => {
  let settings: SettingsPOM;

  test.beforeEach(async ({ page }) => {
    settings = new SettingsPOM(page);
  });

  test('settings page loads', async () => {
    await settings.goto();
    await expect(settings.pageHeading).toBeVisible({ timeout: 10000 });
    await expect(settings.pageDescription).toBeVisible();
  });

  test('API keys section visible', async () => {
    await settings.goto();
    // Verify API keys section exists with heading
    await expect(settings.apiKeysSectionHeading).toBeVisible();
    // Verify provider cards are present (OpenAI, Anthropic, Google, LiteLLM, Ollama)
    const cardCount = await settings.providerCards.count();
    expect(cardCount).toBeGreaterThanOrEqual(1);
  });

  test('processing section visible', async () => {
    await settings.goto();
    // Verify processing configuration section exists
    await expect(settings.processingSectionHeading).toBeVisible();
  });

  test('CatBot section visible', async () => {
    await settings.goto();
    // Verify CatBot configuration section exists
    await expect(settings.catbotSectionHeading).toBeVisible();
  });

  test('CatBot security section visible', async () => {
    await settings.goto();
    // Verify CatBot security/sudo section exists
    await expect(settings.catbotSecurityHeading).toBeVisible();
  });

  test('connections section visible', async () => {
    await settings.goto();
    await expect(settings.connectionsSectionHeading).toBeVisible();
  });
});
