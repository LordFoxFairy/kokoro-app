import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

async function mockProductLogout(page: Page) {
  await page.route("**/api/auth/csrf", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ csrfToken: "Token123" }) })
  })
  await page.route("**/api/auth/signout", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ issuer_end_session_url: "/iam/oauth2/end-session?client_id=web" }) })
  })
  await page.route("**/iam/oauth2/end-session?*", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Issuer confirmation</h1>" })
  })
}

test.describe("Web production boundary", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("kokoro.locale", "en"))
  })

  test("public root remains available while an unconfigured login fails without the removed handoff", async ({ page }) => {
    let manifestRequests = 0
    await page.route("**/api/system/runtime-manifest**", async (route) => {
      manifestRequests += 1
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" })
    })
    const home = await page.goto("/", { waitUntil: "domcontentloaded" })
    expect(home?.status()).toBe(200)
    await expect(page.getByRole("heading", { name: "把想法说给它，收回能用的成果" })).toBeVisible()
    const login = await page.goto("/login", { waitUntil: "domcontentloaded" })
    expect(login?.status()).toBe(503)
    await expect(page.getByRole("heading", { name: "Sign in" })).toHaveCount(0)
    await expect(page.locator("body")).toBeEmpty()
    await expect(page.getByRole("button", { name: /重试登录|Try again/iu })).toHaveCount(0)
    await expect(page.getByRole("navigation")).toHaveCount(0)
    await expect(page.locator('[data-slot="card"]')).toHaveCount(0)
    await expect(page.getByTestId("login-submit")).toHaveCount(0)
    await expect(page.getByText("配置不可用")).toHaveCount(0)
    expect(manifestRequests).toBe(0)
    expect((await page.request.get("/preview/marketing")).status()).toBe(404)
  })

  test("an RP failure URL does not start an automatic redirect loop", async ({ page }) => {
    const response = await page.goto("/login?auth=sign_in_failed", { waitUntil: "domcontentloaded" })
    expect(response?.status()).toBe(503)
    await expect(page.locator("body")).toBeEmpty()
    await expect(page).toHaveURL(/\/login\?auth=sign_in_failed$/u)
  })

  test("rail logout posts Product signout and navigates to issuer confirmation", async ({ page, isMobile }) => {
    test.skip(isMobile, "the workspace rail is rendered only on desktop")
    await mockProductLogout(page)
    const signout = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/auth/signout")
    await page.goto("/app", { waitUntil: "networkidle" })
    await page.getByTestId("rail-utility-account").click()
    await page.getByRole("menuitem", { name: /退出登录|Sign out/iu }).click()
    const request = await signout
    expect(request.method()).toBe("POST")
    expect(new URLSearchParams(request.postData() ?? "").get("csrfToken")).toBe("Token123")
    await expect(page.getByRole("heading", { name: "Issuer confirmation" })).toBeVisible()
  })

  test("never substitutes a Product sign-in page for an unavailable IAM entry", async ({ page }) => {
    const response = await page.goto("/login", {
      waitUntil: "domcontentloaded",
    })
    expect(response?.status()).toBe(503)
    await expect(page.locator("body")).toBeEmpty()
    await expect(page.locator("body")).not.toContainText(/tenant_id|workload_token|iam_access_token/iu)
  })

  test("has no critical accessibility violations on the empty unavailable response", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toBeEmpty()
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
    const critical = results.violations.filter((violation) => violation.impact === "critical")
    expect(critical, critical.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([])
  })

  test("does not introduce horizontal overflow at the active viewport", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" })
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
  })
})
