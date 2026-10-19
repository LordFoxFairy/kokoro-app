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
    await page.addInitScript(() => window.localStorage.setItem("kokoro.locale", "zh"))
  })

  test("预览中从项目概览提交后进入项目会话，并且不写入直接会话列表", async ({ page, isMobile }) => {
    const prompt = "验证项目会话闭环"
    await page.goto("/app/project/preview-project", { waitUntil: "domcontentloaded" })
    await page.getByRole("textbox").fill(prompt)

    if (!isMobile) {
      const viewport = page.viewportSize()
      const layoutDraft = "验证编辑区缩放时保留草稿并自然换行。".repeat(8)
      await page.getByRole("textbox").fill(layoutDraft)
      // Reference stays two-column at 768px of workspace, including when
      // the context track is narrower than its 320px maximum.
      for (const [width, twoColumns] of [
        [1280, true], [1068, true], [1067, false], [769, false],
        [768, false], [767, false], [390, false], [767, false],
        [768, false], [769, false], [1067, false], [1068, true], [1280, true],
      ] as const) {
        await page.setViewportSize({ width, height: 800 })
        await expect.poll(async () => {
          const context = await page.getByRole("complementary", { name: /工作区状态|Workspace status/ }).boundingBox()
          const composer = await page.getByRole("textbox").evaluate((element) => {
            const form = element.closest("form")
            if (!form) throw new Error("Project composer form is missing")
            const style = getComputedStyle(element)
            return {
              ...form.getBoundingClientRect().toJSON(),
              // Keep text off the rounded edge, including while resizing.
              textInset: Number.parseFloat(style.paddingLeft) >= 16,
              autosized: Math.abs(element.clientHeight - Math.min(element.scrollHeight, Number.parseFloat(style.maxHeight))) <= 1,
            }
          })
          if (!context) throw new Error("Project context is missing")
          const history = await page.getByRole("heading", { name: /^(最近|Recent)$/ }).evaluate((element) => {
            if (!element.parentElement) throw new Error("Project history is missing")
            return element.parentElement.getBoundingClientRect().toJSON()
          })
          return {
            twoColumns: context.x >= composer.right,
            composerAligned: !twoColumns || Math.abs(composer.right - history.right) < 1,
            textInset: composer.textInset,
            autosized: composer.autosized,
          }
        }).toEqual({ twoColumns, composerAligned: true, textInset: true, autosized: true })
        await expect(page.getByRole("textbox")).toHaveValue(layoutDraft)
        await expect(page.getByRole("textbox")).toBeFocused()
      }
      if (viewport) await page.setViewportSize(viewport)
      await page.getByRole("textbox").fill(prompt)

      await page.getByRole("button", { name: "技能", exact: true }).click()
      const skills = page.getByRole("dialog")
      const search = skills.getByPlaceholder("搜索技能")
      await search.fill("动态适配")
      for (const size of [
        { width: 768, height: 800 }, { width: 375, height: 500 },
        { width: 390, height: 520 }, { width: 1280, height: 800 },
      ]) {
        await page.setViewportSize(size)
        // Check the first resized geometry, not a delayed settled position:
        // interpolating an old width can leave the dialog outside the viewport.
        const bounds = await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]')
          if (!dialog) throw new Error("Project skills dialog is missing")
          return dialog.getBoundingClientRect().toJSON()
        })
        expect(bounds.left).toBeGreaterThanOrEqual(0)
        expect(bounds.top).toBeGreaterThanOrEqual(0)
        expect(bounds.right).toBeLessThanOrEqual(size.width)
        expect(bounds.bottom).toBeLessThanOrEqual(size.height)
        await expect(search).toHaveValue("动态适配")
        await expect(search).toBeFocused()
      }
      await search.press("Escape")
      await expect(skills).not.toBeVisible()
      if (viewport) await page.setViewportSize(viewport)
      await expect(page.getByRole("textbox")).toHaveValue(prompt)
    }

    await page.getByRole("button", { name: /发送消息|Send message/ }).click()

    await expect(page).toHaveURL(/\/app\/project\/preview-project\?conversation=conv_[a-z0-9-]+$/)
    await expect(page.getByRole("log")).toContainText(prompt)

    // The skin's neutral foreground must apply to inherited message text too,
    // not only controls that explicitly consume the token.
    await expect(page.getByRole("log")).toHaveCSS("color", "rgb(26, 26, 26)")

    // The submitted editor has its own measured layout, including inside a
    // project. Parent gutters must not subtract a second 48px from its width.
    const editor = await page.getByRole("textbox").evaluate((element) => {
      const form = element.closest("form")
      const main = element.closest('[data-app-frame-main="true"]')
      if (!form || !main) throw new Error("Conversation editor is missing")
      return { form: form.getBoundingClientRect().toJSON(), mainWidth: main.getBoundingClientRect().width }
    })
    expect(Math.abs(editor.form.width - Math.min(768, editor.mainWidth - 32))).toBeLessThan(1)
    expect(editor.form.height).toBeGreaterThanOrEqual(120)

    if (!isMobile) {
      const viewport = page.viewportSize()
      const textbox = page.getByRole("textbox")
      const draft = "这是只用于观察输入区自动换行的本地草稿，不会发送。".repeat(4)
      await textbox.fill(draft)
      for (const width of [1280, 390, 1280]) {
        await page.setViewportSize({ width, height: 720 })
        await expect.poll(() => textbox.evaluate((element) => {
          const input = element as HTMLTextAreaElement
          return Math.abs(input.clientHeight - Math.min(input.scrollHeight, Number.parseFloat(getComputedStyle(input).maxHeight)))
        })).toBeLessThanOrEqual(1)
        await expect(textbox).toHaveValue(draft)
        await expect(textbox).toBeFocused()
      }
      await textbox.fill("")
      if (viewport) await page.setViewportSize(viewport)
    }

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
    await expect(page.getByRole("heading", { name: /^(最近|Recent)$/ })).toBeVisible()
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


test("插件分类按可用列宽切换，保留搜索和键盘选择", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("kokoro.locale", "zh"))
  await page.setViewportSize({ width: 1280, height: 844 })
  await page.goto("/app/plugins", { waitUntil: "domcontentloaded" })
  const search = page.getByRole("searchbox", { name: "搜索连接器" })
  const rail = page.getByRole("navigation", { name: "连接器分类" })
  await search.fill("保留搜索")
  await rail.getByRole("button", { name: "开发", exact: true }).click()
  for (const [width, compact] of [[390, true], [459, true], [460, false], [600, false], [768, false], [320, true], [1280, false]] as const) {
    await page.setViewportSize({ width, height: 844 })
    await expect(search).toHaveValue("保留搜索")
    if (compact) {
      const filter = page.getByRole("button", { name: "开发", exact: true, expanded: false })
      await expect(filter).toBeVisible()
      await expect(rail).toBeHidden()
      await expect.poll(async () => {
        const a = await search.boundingBox(), b = await filter.boundingBox()
        return Boolean(a && b && Math.abs(a.y - b.y) < 1 && Math.abs(b.height - 36) < 1 && Math.abs(b.width - 94) < 1 && b.x >= a.x + a.width)
      }).toBe(true)
      await filter.press("ArrowDown")
      await expect(page.getByRole("menuitem", { name: "健康", exact: true })).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(filter).toBeFocused()
    } else {
      await expect(rail).toBeVisible()
      await expect(rail.getByRole("button", { name: "开发", exact: true })).toHaveAttribute("aria-pressed", "true")
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  // An open menu must retire when its replacement becomes visible; focus
  // follows the selected category instead of being lost to the page body.
  await page.setViewportSize({ width: 390, height: 844 })
  const filter = page.getByRole("button", { name: "开发", exact: true, expanded: false })
  await filter.press("ArrowDown")
  await expect(page.getByRole("menuitem", { name: "健康", exact: true })).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 844 })
  await expect(page.getByRole("menu")).toHaveCount(0)
  await expect(rail.getByRole("button", { name: "开发", exact: true })).toBeFocused()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(filter).toBeFocused()
  await filter.press("ArrowDown")
  await expect(page.getByRole("menuitem", { name: "全部", exact: true })).toBeFocused()
  await page.keyboard.press("End")
  await expect(page.getByRole("menuitem", { name: "健康", exact: true })).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("button", { name: "健康", exact: true, expanded: false })).toBeFocused()
  await expect(search).toHaveValue("保留搜索")

})
