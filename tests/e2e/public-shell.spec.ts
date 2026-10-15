import { expect, test } from "@playwright/test"

test.describe("公开壳层", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("kokoro.locale", "en"))
  })

  test("落地页在当前视口可见且没有横向溢出", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" })

    expect(response?.status()).toBe(200)
    await expect(page.getByRole("heading", { name: "把想法说给它，收回能用的成果" })).toBeVisible()
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
  })
})
