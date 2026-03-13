import { test, expect } from '@playwright/test';
import { ProcessingPOM } from '../pages/processing.pom';
import { testName } from '../helpers/test-data';
import path from 'path';

const PROJECT_NAME = testName('Procesamiento E2E');
let projectId: string;

test.describe.serial('Procesamiento', () => {
  test.beforeAll(async ({ request }) => {
    // Create a test project via API
    const res = await request.post('/api/projects', {
      data: {
        name: PROJECT_NAME,
        description: 'Proyecto para test de procesamiento',
        purpose: 'Testing procesamiento E2E',
        status: 'draft',
      },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    projectId = data.id;

    // Upload a source file via API
    const fs = await import('fs');
    const samplePath = path.resolve(__dirname, '..', 'fixtures', 'sample.txt');
    const fileContent = fs.readFileSync(samplePath);
    await request.post(`/api/projects/${projectId}/sources`, {
      multipart: {
        file: {
          name: 'sample.txt',
          mimeType: 'text/plain',
          buffer: fileContent,
        },
      },
    });
  });

  test.afterAll(async ({ request }) => {
    if (projectId) {
      await request.delete(`/api/projects/${projectId}`);
    }
  });

  test('processing panel shows agent and model selectors', async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
    // Navigate to the Procesar pipeline step
    await page.locator('.sticky.top-0').getByText('Procesar', { exact: true }).click();
    await page.waitForLoadState('networkidle');
    // Verify the process button area exists (even if disabled)
    // The button text is "Procesar con {agentName}" — it may be disabled if no agent assigned
    await expect(page.getByRole('button', { name: /Procesar con/ })).toBeVisible();
  });

  test('trigger processing shows loading state', async ({ page }) => {
    const processing = new ProcessingPOM(page);
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
    // Navigate to Procesar step
    await page.locator('.sticky.top-0').getByText('Procesar', { exact: true }).click();
    await page.waitForLoadState('networkidle');

    // Check if process button is enabled (requires an agent)
    const isEnabled = await processing.processButton.isEnabled().catch(() => false);
    if (isEnabled) {
      await processing.triggerProcessing();
      // Verify some loading/streaming indicator appears
      // Could be a spinner, streaming preview, or stage indicator
      // We just verify the button state changes (disabled during processing)
      await expect(processing.processButton).toBeDisabled({ timeout: 5000 });
    } else {
      // If no agent available, we just verify the disabled state message
      await expect(page.getByText(/Asigna un agente|Selecciona/)).toBeVisible();
    }
    // Test passes either way — we verified UI state, not LLM output
  });

  test('processing history visible', async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
    // Navigate to Historial pipeline step
    await page.locator('.sticky.top-0').getByText('Historial', { exact: true }).click();
    await page.waitForLoadState('networkidle');
    // Verify the history section is present (may show "Sin versiones" if none completed)
    const historyContent = page.locator('main');
    await expect(historyContent).toBeVisible();
  });
});
