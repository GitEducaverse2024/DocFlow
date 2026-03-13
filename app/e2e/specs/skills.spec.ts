import { test, expect } from '@playwright/test';
import { SkillsPOM } from '../pages/skills.pom';
import { testName, TEST_PREFIX } from '../helpers/test-data';

const SKILL_NAME = testName('Skill E2E');
const SKILL_DESC_UPDATED = 'Descripcion actualizada por E2E';
const SKILL_INSTRUCTIONS = 'Instrucciones de prueba para el skill E2E. Seguir formato estandar.';

test.describe.serial('Skills', () => {
  test.afterAll(async ({ request }) => {
    // Cleanup: delete any leftover [TEST] skills via API
    const res = await request.get('/api/skills');
    if (res.ok()) {
      const skills = await res.json();
      for (const skill of skills) {
        if (skill.name?.startsWith(TEST_PREFIX)) {
          await request.delete(`/api/skills/${skill.id}`);
        }
      }
    }
  });

  test('skills page loads with list', async ({ page }) => {
    const skills = new SkillsPOM(page);
    await skills.goto();

    await expect(skills.pageTitle).toBeVisible();
    // Either the grid or empty state should be visible
    await expect(
      skills.skillsGrid.or(skills.emptyState)
    ).toBeVisible();
  });

  test('create skill', async ({ page }) => {
    const skills = new SkillsPOM(page);
    await skills.goto();

    await skills.createSkill(SKILL_NAME, {
      description: 'Test skill E2E',
      instructions: SKILL_INSTRUCTIONS,
    });

    // Wait for success feedback and list refresh
    await page.waitForTimeout(2000);

    // Reload and verify
    await skills.goto();
    await expect(skills.findSkill(SKILL_NAME)).toBeVisible({ timeout: 10000 });
  });

  test('edit skill', async ({ page }) => {
    const skills = new SkillsPOM(page);
    await skills.goto();

    await skills.editSkill(SKILL_NAME, { description: SKILL_DESC_UPDATED });

    // Wait for save
    await page.waitForTimeout(2000);

    // Reload and verify
    await skills.goto();
    await expect(skills.findSkill(SKILL_NAME)).toBeVisible();
  });

  test('delete skill', async ({ page }) => {
    const skills = new SkillsPOM(page);
    await skills.goto();

    await skills.deleteSkill(SKILL_NAME);

    // Wait for deletion
    await page.waitForTimeout(2000);

    // Reload and verify removal
    await skills.goto();
    await expect(skills.findSkill(SKILL_NAME)).not.toBeVisible({ timeout: 5000 });
  });
});
