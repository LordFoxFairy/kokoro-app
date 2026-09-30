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

async function readingAxisDrift(page: Page) {
  const content = await page.locator('[data-slot="message-scroller-content"]').boundingBox()
  const composer = await page.locator('form[aria-label="Message editor"]').boundingBox()
  if (!content || !composer) return Number.POSITIVE_INFINITY
  return Math.max(
    Math.abs(content.x - composer.x),
    Math.abs(content.x + content.width - composer.x - composer.width),
  )
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

  test("an unexpected login query cannot select a fallback page", async ({ page }) => {
    const response = await page.goto("/login?unexpected=1", { waitUntil: "domcontentloaded" })
    expect(response?.status()).toBe(503)
    await expect(page.locator("body")).toBeEmpty()
    await expect(page).toHaveURL(/\/login\?unexpected=1$/u)
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
    // The unavailable /login response intentionally has no document body or
    // viewport meta; check the actual user-visible layout instead.
    await page.goto("/", { waitUntil: "domcontentloaded" })
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
  })

  test("keeps the preview thread and Composer on one reading axis across responsive widths", async ({ page, isMobile }) => {
    test.skip(isMobile, "the matrix controls the desktop Chromium viewport and rail state explicitly")
    test.skip(Boolean(process.env.KOKORO_E2E_BASE_URL?.trim()), "the geometry fixture is available only on the local preview server")

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/app", { waitUntil: "networkidle" })
    await page.getByRole("textbox", { name: "Chat input" }).fill("Check the responsive reading axis")
    await page.getByRole("button", { name: "Send message" }).click()
    await expect(page.locator('[data-slot="message-scroller-content"]')).toBeVisible()

    const shell = page.locator('[data-slot="sidebar-wrapper"]')
    const cases = [
      { width: 390, rail: "automatic" },
      { width: 640, rail: "automatic" },
      { width: 641, rail: "automatic" },
      { width: 700, rail: "automatic" },
      { width: 767, rail: "automatic" },
      { width: 768, rail: "automatic" },
      { width: 800, rail: "collapsed" },
      { width: 960, rail: "collapsed" },
      { width: 961, rail: "expanded" },
      { width: 1280, rail: "expanded" },
    ] as const

    for (const item of cases) {
      await page.setViewportSize({ width: item.width, height: 900 })
      if (item.rail === "collapsed" && (await shell.getAttribute("data-rail-collapsed")) !== "true") {
        await page.getByRole("button", { name: "Collapse sidebar" }).click()
      }
      if (item.rail === "expanded" && (await shell.getAttribute("data-rail-collapsed")) !== "false") {
        await page.getByRole("button", { name: "Expand sidebar" }).click()
      }
      if (item.rail !== "automatic") {
        await expect(shell).toHaveAttribute("data-rail-collapsed", item.rail === "collapsed" ? "true" : "false")
      }

      await expect.poll(() => readingAxisDrift(page), { message: `${item.width}px reading-axis drift` }).toBeLessThanOrEqual(1)
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }))
      expect(dimensions.scrollWidth, `${item.width}px horizontal overflow`).toBeLessThanOrEqual(dimensions.clientWidth)
    }
  })
})
