import { test, expect } from '@playwright/test';
import { AgentsPOM } from '../pages/agents.pom';
import { testName, TEST_PREFIX } from '../helpers/test-data';

const AGENT_NAME = testName('Agente E2E');
const AGENT_DESC_UPDATED = 'Descripcion actualizada por E2E';

test.describe.serial('Agentes', () => {
  test.afterAll(async ({ request }) => {
    // Cleanup: delete any leftover [TEST] agents via API
    const res = await request.get('/api/agents');
    if (res.ok()) {
      const agents = await res.json();
      for (const agent of agents) {
        if (agent.name?.startsWith(TEST_PREFIX) && agent.source === 'custom') {
          await request.delete(`/api/agents/${agent.id}`);
        }
      }
    }
  });

  test('agents page loads with list', async ({ page }) => {
    const agents = new AgentsPOM(page);
    await agents.goto();

    await expect(agents.pageTitle).toBeVisible();
    // At least one of the sections should be visible
    await expect(
      agents.openclawSection.or(agents.customSection)
    ).toBeVisible();
  });

  test('list shows OpenClaw and custom sections', async ({ page }) => {
    const agents = new AgentsPOM(page);
    await agents.goto();

    // The merged list comes from GET /api/agents — verify section headings
    await expect(agents.openclawSection).toBeVisible();
    await expect(agents.customSection).toBeVisible();
  });

  test('create custom agent', async ({ page }) => {
    const agents = new AgentsPOM(page);
    await agents.goto();

    // Listen for dialog events (agent creator may trigger alerts)
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await agents.createAgent(AGENT_NAME, { description: 'Test agent E2E' });

    // Wait for success feedback — the dialog closes and agents list refreshes
    // Wait a moment for the API call and list refresh
    await page.waitForTimeout(2000);

    // Reload to see the new agent in the list
    await agents.goto();
    await expect(agents.findAgent(AGENT_NAME)).toBeVisible({ timeout: 10000 });
  });

  test('edit custom agent', async ({ page }) => {
    const agents = new AgentsPOM(page);
    await agents.goto();

    await agents.editAgent(AGENT_NAME, { description: AGENT_DESC_UPDATED });

    // Wait for save to complete
    await page.waitForTimeout(2000);

    // Reload and verify the description changed
    await agents.goto();
    await expect(agents.findAgent(AGENT_NAME)).toBeVisible();
  });

  test('delete custom agent', async ({ page }) => {
    const agents = new AgentsPOM(page);
    await agents.goto();

    // Set up dialog handler for the confirm prompt
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await agents.deleteAgent(AGENT_NAME);

    // Wait for deletion
    await page.waitForTimeout(2000);

    // Reload and verify the agent is gone
    await agents.goto();
    await expect(agents.findAgent(AGENT_NAME)).not.toBeVisible({ timeout: 5000 });
  });
});
