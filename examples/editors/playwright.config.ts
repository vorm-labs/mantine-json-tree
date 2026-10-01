import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  workers: 2,
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    {
      name: 'webkit',
      use: {
        browserName: 'webkit',
        launchOptions: process.env.JSON_TREE_WEBKIT_EXECUTABLE
          ? { executablePath: process.env.JSON_TREE_WEBKIT_EXECUTABLE }
          : {},
      },
    },
  ],
  webServer: {
    command: 'node ../../node_modules/vite/bin/vite.js . --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: process.env.JSON_TREE_REUSE_SERVER === '1',
  },
});
