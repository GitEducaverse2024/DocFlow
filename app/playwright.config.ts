import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['specs/**/*.spec.ts', 'api/**/*.api.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: 'http://localhost:3500',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  reporter: [
    ['list'],
    ['json', { outputFile: 'e2e/results/test-results.json' }],
    ['html', { outputFolder: 'e2e/results/html-report', open: 'never' }],
    ['./e2e/reporters/sqlite-reporter.ts'],
  ],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          args: ['--disable-dev-shm-usage'],
        },
      },
    },
  ],
});
