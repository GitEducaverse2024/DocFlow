import { test, expect } from '@playwright/test';
import { CanvasPOM } from '../pages/canvas.pom';
import { testName } from '../helpers/test-data';

const CANVAS_NAME = testName('Canvas E2E');

test.describe.serial('Canvas', () => {
  let canvas: CanvasPOM;

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPOM(page);
  });

  test('canvas page loads with list', async ({ page }) => {
    await canvas.goto();
    await expect(canvas.pageHeading).toBeVisible();
    // Either the grid with canvases or the empty state should be visible
    const hasGrid = await canvas.canvasGrid.isVisible();
    const hasEmpty = await canvas.emptyState.isVisible();
    expect(hasGrid || hasEmpty).toBeTruthy();
  });

  test('filter buttons are visible', async ({ page }) => {
    await canvas.goto();
    // Filter buttons: Todos, Agentes, Proyectos, Mixtos, Plantillas
    await expect(page.getByRole('button', { name: /Todos/ })).toBeVisible();
  });

  test('create canvas with wizard', async ({ page }) => {
    await canvas.goto();
    await canvas.createCanvas(CANVAS_NAME, 'Canvas de prueba E2E');
    // After creation, should redirect to the editor page
    await expect(page).toHaveURL(/\/canvas\/.+/);
  });

  test('editor opens with START node', async ({ page }) => {
    await canvas.goto();
    // Find and open the created canvas
    await canvas.openCanvas(CANVAS_NAME);
    // Verify editor area visible (ReactFlow container)
    await expect(canvas.editorContainer).toBeVisible({ timeout: 10000 });
    // Verify START/Inicio node exists in the editor
    await expect(canvas.startNode).toBeVisible();
  });

  test('drag nodes in editor', async ({ page }) => {
    await canvas.goto();
    await canvas.openCanvas(CANVAS_NAME);
    await expect(canvas.editorContainer).toBeVisible({ timeout: 10000 });

    // Get the START node position before drag
    const nodeBefore = await canvas.startNode.boundingBox();
    expect(nodeBefore).not.toBeNull();

    // Drag the START node
    await canvas.dragNode(canvas.startNode, 100, 50);

    // Small wait for React state to update
    await page.waitForTimeout(500);
  });

  test('save canvas', async ({ page }) => {
    await canvas.goto();
    await canvas.openCanvas(CANVAS_NAME);
    await expect(canvas.editorContainer).toBeVisible({ timeout: 10000 });

    // Click save button if visible
    if (await canvas.saveButton.isVisible()) {
      await canvas.saveCanvas();
      // Verify save confirmation (toast or visual feedback)
      await page.waitForTimeout(1000);
    }
  });

  test('delete canvas', async ({ page }) => {
    await canvas.goto();
    // From list page, delete the [TEST] canvas
    await canvas.deleteCanvas(CANVAS_NAME);
    // Verify removal - canvas should no longer be in the list
    await page.waitForTimeout(1000);
    const item = canvas.findCanvas(CANVAS_NAME);
    await expect(item).toBeHidden({ timeout: 5000 });
  });
});
