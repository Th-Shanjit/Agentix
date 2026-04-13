import { defineConfig, devices } from "@playwright/test";

/** Auth.js requires a secret; CI / fresh clones may not have `.env.local`. */
const e2eAuthSecret =
  process.env.AUTH_SECRET ??
  "playwright-e2e-test-secret-do-not-use-in-production-min-32-chars";

/** Dedicated port so `npm run dev` on :3000 does not block the e2e webServer check. */
const e2ePort = process.env.E2E_PORT ?? "3333";
const e2eOrigin = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  /** Default Playwright test timeout is 30s; first `next dev` compile often exceeds that. */
  timeout: 90_000,
  // `next dev` compiles on demand; parallel browsers often hit ERR_ABORTED mid-compile.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? "github" : "list",
  expect: { timeout: 15_000 },
  use: {
    baseURL: e2eOrigin,
    trace: "on-first-retry",
    navigationTimeout: 90_000,
    actionTimeout: 15_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${e2ePort}`,
    url: e2eOrigin,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      AUTH_SECRET: e2eAuthSecret,
      AUTH_URL: process.env.AUTH_URL ?? e2eOrigin,
    },
  },
});
