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
    const project = page.getByRole("button", { name: /^(当前项目|Current project)$/ })
    const conversationUrl = page.url()
    const expanded = await project.getAttribute("aria-expanded")
    await project.click()
    await expect(project).toHaveAttribute("aria-expanded", expanded === "true" ? "false" : "true")
    await expect(page).toHaveURL(conversationUrl)
    await project.click()
    await expect(project).toHaveAttribute("aria-expanded", expanded!)
    if (isMobile) {
      await expect(page.getByRole("dialog")).toBeVisible()
    } else {
      await project.focus()
      await project.press("Space")
      await expect(project).toHaveAttribute("aria-grabbed", "true")
      await expect(project).toHaveAttribute("aria-expanded", expanded!)
      await project.press("Escape")
      await expect(project).toHaveAttribute("aria-grabbed", "false")
      await project.press("Enter")
      await expect(project).toHaveAttribute("aria-expanded", expanded === "true" ? "false" : "true")
      await project.press("Enter")
      await expect(project).toHaveAttribute("aria-expanded", expanded!)
      await expect(page).toHaveURL(conversationUrl)
      await project.hover()
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

test("技能探索的封面、文字和操作在当前视口互不重叠", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("kokoro.locale", "zh"))
  await page.goto("/app#/account/settings/skills", { waitUntil: "domcontentloaded" })
  await page.getByRole("button", { name: "探索技能", exact: true }).click()

  const catalog = page.getByRole("region", { name: "探索技能", exact: true })
  const details = catalog.getByRole("button", { name: /^查看详情 / })
  await expect(details.first()).toBeVisible()
  // Check rendered geometry, not CSS implementation or a fixed pixel baseline.
  const rows = await details.evaluateAll((buttons) => buttons.map((button) => {
    const cover = button.previousElementSibling?.getBoundingClientRect()
    const text = button.getBoundingClientRect()
    const action = button.nextElementSibling?.getBoundingClientRect()
    return {
      coverBeforeText: cover !== undefined && cover.right <= text.left,
      textBeforeAction: action !== undefined && text.right <= action.left,
      textHasWidth: text.width > 0,
    }
  }))
  for (const row of rows) {
    expect(row).toEqual({ coverBeforeText: true, textBeforeAction: true, textHasWidth: true })
  }
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
})
