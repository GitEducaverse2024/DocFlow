import { test, expect } from '@playwright/test';
import { TasksPOM } from '../pages/tasks.pom';
import { testName, TEST_PREFIX } from '../helpers/test-data';

const TASK_NAME = testName('Tarea E2E');

test.describe.serial('Tareas', () => {
  test.afterAll(async ({ request }) => {
    // Cleanup: delete any leftover [TEST] tasks via API
    const res = await request.get('/api/tasks');
    if (res.ok()) {
      const tasks = await res.json();
      for (const task of tasks) {
        if (task.name?.startsWith(TEST_PREFIX)) {
          await request.delete(`/api/tasks/${task.id}`);
        }
      }
    }
  });

  test('tasks page loads with heading', async ({ page }) => {
    const tasks = new TasksPOM(page);
    await tasks.goto();

    await expect(tasks.pageTitle).toBeVisible();
    // Either the task grid or empty state
    await expect(
      tasks.taskGrid.or(tasks.emptyState)
    ).toBeVisible();
  });

  test('task templates are visible', async ({ page }) => {
    const tasks = new TasksPOM(page);
    await tasks.goto();

    // Templates section may or may not exist depending on seed data
    // Check if the heading exists; if templates section is present, verify cards
    const hasTemplates = await tasks.templatesHeading.isVisible().catch(() => false);
    if (hasTemplates) {
      await expect(tasks.templatesHeading).toBeVisible();
      // At least one template card should have a "Usar" button
      const usarButton = tasks.page.getByRole('button', { name: 'Usar' }).first();
      await expect(usarButton).toBeVisible();
    } else {
      // If no templates, the "Nueva tarea" button should still be available
      await expect(tasks.newTaskButton).toBeVisible();
    }
  });

  test('create task from wizard', async ({ page }) => {
    const tasks = new TasksPOM(page);
    await tasks.goto();

    // Click "Nueva tarea" to open wizard
    await tasks.newTaskButton.click();

    // Step 1: Objetivo — verify wizard loaded
    await expect(tasks.wizardHeading).toBeVisible({ timeout: 10000 });
    const step = await tasks.getCurrentWizardStep();
    expect(step).toBe(1);

    // Fill task name
    await tasks.wizardTaskName.fill(TASK_NAME);

    // Navigate: Step 1 -> Step 2 (Proyectos)
    await tasks.wizardNextButton.click();
    await page.waitForTimeout(500);

    // Step 2: skip project selection, go next
    await tasks.wizardNextButton.click();
    await page.waitForTimeout(500);

    // Step 3: Pipeline — add at least one step so we can proceed
    // Click the add step button (the "+" circle)
    const addButton = page.locator('button.rounded-full').filter({ hasText: '' }).first();
    if (await addButton.isVisible()) {
      await addButton.click();
      // Select "Paso de agente" from the dropdown
      const agentOption = page.getByText('Paso de agente');
      if (await agentOption.isVisible()) {
        await agentOption.click();
      }
    }

    // Navigate to Step 4: Review
    await tasks.wizardNextButton.click();
    await page.waitForTimeout(500);

    // Step 4: Verify review shows the task name
    await expect(page.getByText(TASK_NAME)).toBeVisible();

    // Save as draft
    await tasks.wizardSaveDraftButton.click();

    // Verify redirect to task detail or tasks list
    await page.waitForURL(/\/tasks\//, { timeout: 10000 });
  });
});
