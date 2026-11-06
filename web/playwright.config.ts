import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for the browser. One command: `npm run test:e2e -w web`.
 *
 * The run is self-contained and never touches the development servers or data:
 *  - API on :4100, web on :3100 (dev uses :4000 / :3000);
 *  - its own database `small-web-e2e` on the dev mongod (npm run dev:db -w api),
 *    re-seeded before every run by e2e/global-setup.ts;
 *  - the web app is built into .next-e2e, not .next.
 *
 * Overrides: E2E_MONGO_URI, E2E_BROWSER_CHANNEL (e.g. msedge or chrome, to use an
 * installed browser instead of Playwright's bundled chromium).
 */

export const API_PORT = 4100;
export const WEB_PORT = 3100;
export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const E2E_MONGO_URI = process.env.E2E_MONGO_URI ?? 'mongodb://127.0.0.1:27018/small-web-e2e';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // Specs share one seeded database and record visits for the same people.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  outputDir: 'test-results',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    ...(process.env.E2E_BROWSER_CHANNEL ? { channel: process.env.E2E_BROWSER_CHANNEL } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 640 } },
    },
  ],
  webServer: [
    {
      command: 'npx ts-node --transpile-only src/main.ts',
      cwd: '../api',
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(API_PORT),
        MONGO_URI: E2E_MONGO_URI,
        CORS_ORIGIN: WEB_URL,
      },
    },
    {
      command: `npx next build && npx next start -p ${WEB_PORT}`,
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        NEXT_DIST_DIR: '.next-e2e',
        NEXT_PUBLIC_API_URL: API_URL,
      },
    },
  ],
});
