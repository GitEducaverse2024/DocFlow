import { test, expect } from '@playwright/test';
import { ProjectsPOM } from '../pages/projects.pom';
import { testName } from '../helpers/test-data';

const PROJECT_NAME = testName('Proyecto E2E');
const PROJECT_DESCRIPTION = 'Descripcion de prueba';

test.describe.serial('Proyectos', () => {
  let projects: ProjectsPOM;

  test('create project', async ({ page }) => {
    projects = new ProjectsPOM(page);
    await projects.createProject(PROJECT_NAME, PROJECT_DESCRIPTION);
    // After creating, we should be redirected to the project detail page
    await expect(page).toHaveURL(/\/projects\/[a-zA-Z0-9-]+/);
  });

  test('project appears in list', async ({ page }) => {
    projects = new ProjectsPOM(page);
    await projects.goto();
    // Verify the project name appears in the list
    await expect(page.getByText(PROJECT_NAME)).toBeVisible();
  });

  test('open project shows pipeline', async ({ page }) => {
    projects = new ProjectsPOM(page);
    await projects.goto();
    await projects.openProject(PROJECT_NAME);
    // Verify pipeline nav shows the 5 steps
    for (const stepLabel of projects.pipelineStepLabels) {
      await expect(projects.pipelineNav.getByText(stepLabel, { exact: true })).toBeVisible();
    }
  });

  test('delete project with confirmation', async ({ page }) => {
    projects = new ProjectsPOM(page);
    await projects.goto();
    await projects.openProject(PROJECT_NAME);
    // Delete via the 2-step dialog
    await projects.deleteProject(PROJECT_NAME);
    // Should redirect to projects list
    await expect(page).toHaveURL(/\/projects$/);
    // Verify project no longer in list
    await expect(page.getByText(PROJECT_NAME)).not.toBeVisible();
  });
});
