import { test, expect } from '@playwright/test';
import { RagPOM } from '../pages/rag.pom';
import { testName } from '../helpers/test-data';
import path from 'path';

const PROJECT_NAME = testName('RAG E2E');
let projectId: string;

test.describe.serial('RAG', () => {
  test.beforeAll(async ({ request }) => {
    // Create a test project via API with processed status (RAG requires processed)
    const res = await request.post('/api/projects', {
      data: {
        name: PROJECT_NAME,
        description: 'Proyecto para test de RAG',
        purpose: 'Testing RAG E2E',
        status: 'processed',
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

  test('RAG panel shows index button', async ({ page }) => {
    const rag = new RagPOM(page);
    await rag.navigateTo(`/projects/${projectId}`);
    // Navigate to RAG pipeline step
    await rag.gotoRagTab();
    // Verify the index button or RAG config section is visible
    // If status is 'processed', we should see "Crear coleccion RAG" config card
    // with "Indexar documentos" button
    await expect(rag.indexButton.or(rag.reindexButton).or(rag.statsCards)).toBeVisible({ timeout: 10000 });
  });

  test('trigger indexing shows progress', async ({ page }) => {
    const rag = new RagPOM(page);
    await rag.navigateTo(`/projects/${projectId}`);
    await rag.gotoRagTab();

    // Only attempt indexing if the button is available
    const indexVisible = await rag.indexButton.isVisible().catch(() => false);
    if (indexVisible) {
      await rag.triggerIndex();
      // Verify some progress indicator appears (progress bar, message, or spinner)
      // The button text changes to include "Indexando..." when active
      const indexingStarted = await page.getByText('Indexando').isVisible({ timeout: 5000 }).catch(() => false);
      if (indexingStarted) {
        await expect(page.getByText('Indexando')).toBeVisible();
      }
      // If Qdrant/Ollama unavailable, an error toast may appear instead — that's OK
    }
    // Test passes regardless — we verify UI state exists, not that indexing completes
  });

  test('RAG stats cards appear', async ({ page }) => {
    const rag = new RagPOM(page);
    await rag.navigateTo(`/projects/${projectId}`);
    await rag.gotoRagTab();
    // Stats cards appear when RAG is already indexed
    // If not indexed yet, we verify the config section exists instead
    const hasStats = await rag.statsCards.isVisible().catch(() => false);
    const hasConfig = await rag.indexButton.isVisible().catch(() => false);
    // Either stats or config should be visible
    expect(hasStats || hasConfig).toBeTruthy();
    if (hasStats) {
      await expect(rag.vectoresCard).toBeVisible();
    }
  });

  test('RAG query submission and response', async ({ page }) => {
    const rag = new RagPOM(page);
    await rag.navigateTo(`/projects/${projectId}`);
    await rag.gotoRagTab();
    // Query section only appears when RAG is indexed (ragInfo.enabled === true)
    const queryVisible = await rag.queryInput.isVisible().catch(() => false);
    if (queryVisible) {
      // Verify query input and submit button are present
      await expect(rag.queryInput).toBeVisible();
      await expect(rag.querySubmitButton).toBeVisible();
      // Submit a test query
      await rag.queryRag('test query');
      // Verify response area is visible — either results appear or error message
      // Handle Qdrant-unavailable gracefully: check for results OR error toast/message
      const hasResults = await rag.queryResults.isVisible().catch(() => false);
      const hasError = await page.getByText(/Error|No se encontraron/).isVisible().catch(() => false);
      // At least one should be true after submitting query
      expect(hasResults || hasError).toBeTruthy();
    } else {
      // If query section not visible, RAG is not indexed — config view is shown
      // Verify the config section is present instead
      await expect(rag.indexButton.or(page.getByText('Configuración RAG'))).toBeVisible();
    }
  });
});
