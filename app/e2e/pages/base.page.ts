import { type Page, type Locator } from '@playwright/test';

export class BasePage {
  readonly page: Page;
  readonly sidebar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.locator('nav');
  }

  async navigateTo(path: string) {
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle');
  }

  async waitForApi(urlPattern: string | RegExp) {
    return this.page.waitForResponse(
      (res) => typeof urlPattern === 'string'
        ? res.url().includes(urlPattern)
        : urlPattern.test(res.url())
    );
  }

  async getSidebarLink(label: string): Promise<Locator> {
    return this.sidebar.getByRole('link', { name: label });
  }
}
