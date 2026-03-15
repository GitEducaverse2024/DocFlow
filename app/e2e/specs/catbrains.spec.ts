import { test, expect } from '@playwright/test';
import { CatBrainsPOM } from '../pages/catbrains.pom';
import { testName } from '../helpers/test-data';

const CATBRAIN_NAME = testName('CatBrain E2E');
const CATBRAIN_DESC = 'Descripcion de prueba';

test.describe.serial('CatBrains', () => {
  let catbrains: CatBrainsPOM;

  test('create catbrain', async ({ page }) => {
    catbrains = new CatBrainsPOM(page);
    await catbrains.createCatBrain(CATBRAIN_NAME, CATBRAIN_DESC);
    // After creating, should be redirected to the catbrain detail page
    await expect(page).toHaveURL(/\/catbrains\/[a-zA-Z0-9-]+/);
  });

  test('catbrain appears in list', async ({ page }) => {
    catbrains = new CatBrainsPOM(page);
    await catbrains.goto();
    await expect(page.getByText(CATBRAIN_NAME)).toBeVisible();
  });

  test('open catbrain shows pipeline', async ({ page }) => {
    catbrains = new CatBrainsPOM(page);
    await catbrains.goto();
    await catbrains.openCatBrain(CATBRAIN_NAME);
    // Verify pipeline nav shows the 5 steps
    for (const stepLabel of catbrains.pipelineStepLabels) {
      await expect(catbrains.pipelineNav.getByText(stepLabel, { exact: true })).toBeVisible();
    }
  });

  test('delete catbrain with confirmation', async ({ page }) => {
    catbrains = new CatBrainsPOM(page);
    await catbrains.goto();
    await catbrains.openCatBrain(CATBRAIN_NAME);
    await catbrains.deleteCatBrain(CATBRAIN_NAME);
    // Should redirect to catbrains list
    await expect(page).toHaveURL(/\/catbrains$/);
    // Verify catbrain no longer in list
    await expect(page.getByText(CATBRAIN_NAME)).not.toBeVisible();
  });
});
