import { test, expect } from '@playwright/test';
import { SourcesPOM } from '../pages/sources.pom';
import { ProjectsPOM } from '../pages/projects.pom';
import { testName, TEST_PREFIX } from '../helpers/test-data';
import path from 'path';

const PROJECT_NAME = testName('Fuentes E2E');
let projectId: string;

test.describe.serial('Fuentes', () => {
  test.beforeAll(async ({ request }) => {
    // Create a test project via API
    const res = await request.post('/api/projects', {
      data: {
        name: PROJECT_NAME,
        description: 'Proyecto para test de fuentes',
        purpose: 'Testing fuentes E2E',
        status: 'draft',
      },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    projectId = data.id;
  });

  test.afterAll(async ({ request }) => {
    // Clean up: delete the test project
    if (projectId) {
      await request.delete(`/api/projects/${projectId}`);
    }
  });

  test('upload file appears in list', async ({ page }) => {
    const sources = new SourcesPOM(page);
    await sources.navigateTo(`/projects/${projectId}`);
    // Ensure we're on the Fuentes tab (default active step)
    await page.waitForLoadState('networkidle');
    // Upload sample.txt
    const samplePath = path.resolve(__dirname, '..', 'fixtures', 'sample.txt');
    await sources.uploadFile(samplePath);
    // Wait for the source to appear in the list
    await expect(page.getByText('sample.txt')).toBeVisible({ timeout: 10000 });
  });

  test('source shows status', async ({ page }) => {
    const sources = new SourcesPOM(page);
    await sources.navigateTo(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
    // Verify at least one source item is visible
    await expect(page.getByText('sample.txt')).toBeVisible();
    // Source list should show count text
    await expect(page.getByText(/\d+ fuentes añadidas/)).toBeVisible();
  });

  test('change source mode (cambiar modo)', async ({ page }) => {
    const sources = new SourcesPOM(page);
    await sources.navigateTo(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
    // Default mode is "files" (Archivos tab active)
    await expect(sources.filesTab).toBeVisible();

    // Switch to URLs mode
    await sources.changeMode('urls');
    // Verify the URL input area appears (UrlInput component has a URL input)
    await expect(sources.activeTabContent).toBeVisible();

    // Switch to Notes mode
    await sources.changeMode('notes');
    await expect(sources.activeTabContent).toBeVisible();

    // Switch back to files mode
    await sources.changeMode('files');
    await expect(sources.activeTabContent).toBeVisible();
  });

  test('search filters sources', async ({ page }) => {
    const sources = new SourcesPOM(page);
    await sources.navigateTo(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
    // Type in search to filter
    await sources.searchSources('sample');
    // The source should still be visible
    await expect(page.getByText('sample.txt')).toBeVisible();
    // Type something that shouldn't match
    await sources.searchSources('nonexistent_xyz_file');
    // sample.txt should not be visible
    await expect(page.getByText('sample.txt')).not.toBeVisible();
    // Clear search
    await sources.searchSources('');
  });

  test('delete source', async ({ page }) => {
    const sources = new SourcesPOM(page);
    await sources.navigateTo(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
    // Select the source using the checkbox and delete via bulk action
    await page.getByText('Seleccionar todo').click();
    // Click the "Eliminar" button for selected items
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /Eliminar/ }).first().click();
    // Wait for deletion
    await page.waitForLoadState('networkidle');
    // Verify the empty state or that sample.txt is gone
    await expect(page.getByText('sample.txt')).not.toBeVisible({ timeout: 5000 });
  });
});
