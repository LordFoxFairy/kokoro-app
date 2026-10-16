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

test.describe("项目会话", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("kokoro.locale", "zh-CN"))
  })

  test("预览中从项目概览提交后进入项目会话，并且不写入直接会话列表", async ({ page, isMobile }) => {
    const prompt = "验证项目会话闭环"
    await page.goto("/app/project/preview-project", { waitUntil: "domcontentloaded" })

    await page.getByRole("textbox").fill(prompt)
    await page.getByRole("button", { name: /发送消息|Send message/ }).click()

    await expect(page).toHaveURL(/\/app\/project\/preview-project\?conversation=conv_[a-z0-9-]+$/)
    await expect(page.getByRole("log")).toContainText(prompt)

    if (isMobile) {
      const navigationTrigger = page.getByRole("button", { name: /展开侧栏|Expand sidebar/ })
      await expect(navigationTrigger).toHaveAttribute("aria-expanded", "false")
      await navigationTrigger.click()
      await expect(page.getByRole("dialog")).toBeVisible()
    }
    await page.getByRole("link", { name: /当前项目|Current project/ }).click()
    await expect(page).toHaveURL(/\/app\/project\/preview-project$/)
    await expect(page.getByRole("heading", { name: /项目会话|Project conversations/ })).toBeVisible()
    await expect(page.getByRole("main")).toContainText(prompt)
    if (isMobile) {
      await expect(page.getByRole("dialog")).not.toBeVisible()
      await page.getByRole("button", { name: /展开侧栏|Expand sidebar/ }).click()
    }
    await expect(page.getByRole("navigation", { name: /直接会话|Direct chats/ })).not.toContainText(prompt)
  })
})
