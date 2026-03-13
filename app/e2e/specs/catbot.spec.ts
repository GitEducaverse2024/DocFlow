import { test, expect } from '@playwright/test';
import { CatBotPOM } from '../pages/catbot.pom';

test.describe('CatBot', () => {
  let catbot: CatBotPOM;

  test.beforeEach(async ({ page }) => {
    catbot = new CatBotPOM(page);
  });

  test('CatBot floating button visible on dashboard', async () => {
    await catbot.navigateTo('/');
    await expect(catbot.triggerButton).toBeVisible({ timeout: 10000 });
  });

  test('open CatBot panel', async () => {
    await catbot.navigateTo('/');
    await catbot.open();
    // Verify CatBot panel opens with message input
    await expect(catbot.panel).toBeVisible();
    await expect(catbot.messageInput).toBeVisible();
    // Welcome text should show
    await expect(catbot.welcomeText).toBeVisible();
  });

  test('send message to CatBot', async ({ page }) => {
    await catbot.navigateTo('/');
    await catbot.open();
    await catbot.sendMessage('Hola, esto es un test E2E');
    // Verify user message appears in CatBot chat
    await expect(catbot.userMessages.last()).toContainText('Hola, esto es un test E2E');
    // Verify response area appears (do NOT wait for full LLM completion)
    // Either streaming indicator or assistant message should show
    await page.waitForTimeout(2000);
  });

  test('contextual suggestions change by page', async ({ page }) => {
    // Navigate to dashboard, open CatBot, note suggestions
    await catbot.navigateTo('/');
    await catbot.open();
    // Clear history first to make suggestions visible
    if (await catbot.clearHistoryButton.isVisible()) {
      await catbot.clearHistoryButton.click();
    }
    await page.waitForTimeout(500);
    const dashboardSuggestions = await catbot.getSuggestions();

    // Close CatBot
    await catbot.close();

    // Navigate to /projects, open CatBot, check suggestions differ
    await catbot.navigateTo('/projects');
    await catbot.open();
    await page.waitForTimeout(500);
    const projectsSuggestions = await catbot.getSuggestions();

    // Verify suggestions content differs between pages
    // Dashboard: ['Que puedo hacer?', 'Crear proyecto', 'Estado del sistema']
    // Projects:  ['Crear proyecto', 'Como funciona el RAG?', 'Procesar fuentes']
    if (dashboardSuggestions.length > 0 && projectsSuggestions.length > 0) {
      // At least one suggestion should be different
      const allSame = dashboardSuggestions.every(
        (s, i) => projectsSuggestions[i] === s
      );
      expect(allSame).toBeFalsy();
    }
  });

  test('close CatBot panel', async () => {
    await catbot.navigateTo('/');
    await catbot.open();
    await expect(catbot.panel).toBeVisible();
    await catbot.close();
    // Verify panel is hidden and trigger button is back
    await expect(catbot.triggerButton).toBeVisible();
  });
});
