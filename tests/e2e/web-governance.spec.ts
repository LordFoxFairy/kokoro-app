import { expect, test } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

test.describe("Web production boundary", () => {
  test("serves a private preview session and a navigable login page", async ({ page, request }) => {
    const session = await request.get("/api/auth/session-state")
    expect(session.ok()).toBe(true)
    expect(await session.json()).toEqual({ state: "preview" })
    expect(session.headers()["cache-control"]).toContain("no-store")

    const response = await page.goto("/login", { waitUntil: "domcontentloaded" })
    expect(response?.ok()).toBe(true)
    await expect(page.locator("body")).toBeVisible()
    await expect(page.locator("body")).not.toContainText(/tenant_id|workload_token|iam_access_token/iu)
  })

  test("has no critical accessibility violations on the public login surface", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" })
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
