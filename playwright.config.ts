import { defineConfig, devices } from "@playwright/test"

const port = process.env.KOKORO_E2E_PORT?.trim() || "3310"
const baseURL = process.env.KOKORO_E2E_BASE_URL?.trim() || `http://127.0.0.1:${port}`
const externalServer = Boolean(process.env.KOKORO_E2E_BASE_URL?.trim())
const localWebServer = {
  command: `NEXT_PUBLIC_SESSION_PREVIEW=1 KOKORO_DOMAIN=test.kokoro.localhost pnpm dev --hostname 127.0.0.1 --port ${port}`,
  url: `${baseURL}/`,
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
} as const

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  ...(externalServer
    ? {}
    : {
        webServer: localWebServer,
      }),
})
