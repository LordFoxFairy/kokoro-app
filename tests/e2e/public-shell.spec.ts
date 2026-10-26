import { expect, test } from "@playwright/test"

test.describe("公开壳层", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("kokoro.locale", "en"))
  })

  test("落地页在当前视口可见且没有横向溢出", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" })

    expect(response?.status()).toBe(200)
    await expect(page.getByRole("heading", { name: "Tell it what you want, get back something you can use" })).toBeVisible()
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

    // The quiet conversation canvas must remain distinct from the white
    // editor, without carrying the catalog/settings surface into chat.
    const conversationSurface = page.locator('[data-app-frame-main="true"]')
    await expect(conversationSurface).toHaveCSS("background-color", "rgb(248, 248, 247)")
    await expect(conversationSurface.locator('[data-slot="workspace-header"]')).toHaveCSS("background-color", "rgb(248, 248, 247)")
    await expect(page.locator("form").filter({ has: page.getByRole("textbox") })).toHaveCSS("background-color", "rgb(255, 255, 255)")

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

    // Text entry keeps a visible caret and a quiet rounded boundary, rather
    // than turning the whole editor into a high-contrast dark rectangle.
    await page.getByRole("textbox").focus()
    const focusedEditor = await page.getByRole("textbox").evaluate((element) => {
      const form = element.closest("form")
      if (!form) throw new Error("Conversation editor is missing")
      const sample = document.createElement("canvas").getContext("2d")
      if (!sample) throw new Error("Color sampling is unavailable")
      sample.fillStyle = "white"
      sample.fillRect(0, 0, 1, 1)
      sample.fillStyle = getComputedStyle(form).borderTopColor
      sample.fillRect(0, 0, 1, 1)
      return { borderLightness: sample.getImageData(0, 0, 1, 1).data[0], caret: getComputedStyle(element).caretColor }
    })
    expect(focusedEditor.borderLightness).toBeGreaterThanOrEqual(190)
    expect(focusedEditor.borderLightness).toBeLessThanOrEqual(225)
    expect(focusedEditor.caret).not.toBe("transparent")

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
    // A workbench divider must not leak onto the first project row.
    await expect.poll(() => project.evaluate((element) => {
      const row = element.closest("[data-project-id]")
      if (!row) throw new Error("Project row is missing")
      return getComputedStyle(row).boxShadow
    })).toBe("none")
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

test("长草稿不会遮挡项目最近任务", async ({ page, isMobile }) => {
  await page.addInitScript(() => window.localStorage.setItem("kokoro.locale", "zh"))
  await page.goto("/app/project/preview-project", { waitUntil: "domcontentloaded" })
  const prompt = "项目滚动留白验收"
  await page.getByRole("textbox", { name: "对话输入" }).fill(prompt)
  await page.getByRole("button", { name: "发送消息", exact: true }).click()
  await expect(page).toHaveURL(/\?conversation=conv_/)
  await page.goto("/app/project/preview-project", { waitUntil: "domcontentloaded" })
  if (!isMobile) await page.setViewportSize({ width: 390, height: 650 })
  const draft = "项目草稿仅用于缩放验收，不发送。".repeat(15)
  const input = page.getByRole("textbox", { name: "对话输入" })
  await input.fill(draft)
  const history = page.getByRole("region", { name: "最近", exact: true })
  const row = history.getByRole("button", { name: prompt, exact: true })
  await expect(row).toBeVisible()
  await history.evaluate((element) => {
    let parent = element.parentElement
    while (parent && getComputedStyle(parent).overflowY !== "auto") parent = parent.parentElement
    if (!parent) throw new Error("Project scroll container is missing")
    parent.scrollTop = parent.scrollHeight
  })
  await expect.poll(async () => {
    const item = await row.boundingBox()
    const editor = await input.evaluate(element => element.closest("form")!.getBoundingClientRect().toJSON())
    return item !== null && item.y + item.height <= editor.top - 8
  }).toBe(true)
  await expect(input).toHaveValue(draft)
})

test("project scheduled scope keeps list, calendar and drafts isolated in the preview", async ({ page, isMobile }) => {
  const projectA = "project_11111111-1111-1111-1111-111111111111"
  const projectB = "project_22222222-2222-2222-2222-222222222222"
  const size = isMobile ? { width: 320, height: 568 } : { width: 1280, height: 800 }
  await page.setViewportSize(size)
  await page.addInitScript(({ projectA, projectB }) => {
    window.localStorage.setItem("kokoro.locale", "en")
    const base = { triggerKind: "calendar" as const,
      prompt: "Preview scope check",
      frequency: "daily",
      time: "08:00",
      timezone: "UTC",
      enabled: true,
      status: "active",
      nextRun: `${new Date().toISOString().slice(0, 7)}-15T08:00:00.000Z`,
    }
    window.localStorage.setItem("kokoro.preview.scheduled-tasks", JSON.stringify([
      { ...base, id: "scheduled_scope_a", projectId: projectA, title: "Project A task" },
      { ...base, id: "scheduled_scope_b", projectId: projectB, title: "Project B task" },
      { ...base, id: "scheduled_scope_personal", title: "Personal scheduled task" },
    ]))
  }, { projectA, projectB })
  const businessRequests: string[] = []
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.includes("/scheduled-tasks")) businessRequests.push(request.method())
  })
  await page.goto(`/app/scheduled?project_id=${projectA}&tab=list`, { waitUntil: "domcontentloaded" })
  expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(size)
  const surface = page.getByTestId("scheduled-surface")
  await expect(surface.getByRole("listitem")).toHaveCount(1)
  await expect(surface.getByText("Project A task", { exact: true })).toBeVisible()
  await expect(surface.getByText("Project B task", { exact: true })).toHaveCount(0)
  await expect(surface.getByText("Personal scheduled task", { exact: true })).toHaveCount(0)
  await expect(surface.getByRole("link", { name: "Back to project", exact: true })).toHaveAttribute("href", `/app/project/${projectA}`)
  await expect(surface.getByText("Only scheduled tasks linked to this project are shown.", { exact: true })).toBeVisible()
  const scopeGeometry = await surface.getByRole("link", { name: "Back to project", exact: true }).evaluate((link) => {
    const container = link.parentElement
    if (!container) throw new Error("Project scope notice is missing")
    const box = container.getBoundingClientRect()
    return {
      contained: [...container.children].every((child) => {
        const rect = child.getBoundingClientRect()
        return rect.left >= box.left && rect.right <= box.right && rect.top >= box.top && rect.bottom <= box.bottom
      }),
      overflow: document.documentElement.scrollWidth > innerWidth,
    }
  })
  expect(scopeGeometry).toEqual({ contained: true, overflow: false })
  await surface.getByRole("button", { name: "Actions for scheduled task Project A task", exact: true }).click()
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
  await page.getByRole("dialog").getByRole("textbox", { name: "Unread email summary", exact: true }).fill("Private A draft")
  await page.evaluate((projectB) => {
    history.pushState(null, "", `/app/scheduled?project_id=${projectB}&tab=list#scheduled-tasks/new`)
    dispatchEvent(new Event("kokoro:surface-navigation"))
  }, projectB)
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "Unread email summary", exact: true })).toHaveValue("")
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(surface.getByRole("listitem")).toHaveCount(1)
  await expect(surface.getByText("Project B task", { exact: true })).toBeVisible()
  await surface.getByRole("tab", { name: "Calendar", exact: true }).click()
  const calendar = surface.getByTestId("scheduled-calendar-view")
  await expect(calendar.getByRole("button", { name: /Project B task/ })).toBeVisible()
  await expect(calendar.getByRole("button", { name: /Project A task|Personal scheduled task/ })).toHaveCount(0)
  await page.evaluate(() => {
    history.pushState(null, "", "/app/scheduled?project_id=&tab=list")
    dispatchEvent(new Event("kokoro:surface-navigation"))
  })
  await expect(surface.getByRole("alert")).toHaveText("This project scope address is invalid. Reopen automation from the project, or return to the all-tasks page.")
  await expect(surface.getByRole("button", { name: "Create your scheduled task", exact: true })).toBeDisabled()
  await expect(surface.getByRole("listitem")).toHaveCount(0)
  await page.evaluate(() => {
    history.pushState(null, "", "/app/scheduled?tab=list")
    dispatchEvent(new Event("kokoro:surface-navigation"))
  })
  await expect(surface.getByRole("listitem")).toHaveCount(3)
  await expect(surface.getByText("Personal scheduled task", { exact: true })).toBeVisible()
  await expect(surface.getByRole("link", { name: "Back to project", exact: true })).toHaveCount(0)
  expect(businessRequests).toEqual([])
})

test("project scheduled preview creation remains visible in its project and all-tasks views", async ({ page, isMobile }) => {
  const projectId = "project_33333333-3333-3333-3333-333333333333"
  const otherProjectId = "project_44444444-4444-4444-4444-444444444444"
  const size = isMobile ? { width: 320, height: 568 } : { width: 1280, height: 800 }
  await page.setViewportSize(size)
  await page.addInitScript(() => {
    window.localStorage.setItem("kokoro.locale", "en")
    window.localStorage.removeItem("kokoro.preview.scheduled-tasks")
  })
  const businessRequests: string[] = []
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.includes("/scheduled-tasks")) businessRequests.push(request.method())
  })
  await page.goto(`/app/scheduled?project_id=${projectId}&tab=list#scheduled-tasks/new`, { waitUntil: "domcontentloaded" })
  expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(size)
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("textbox", { name: "Unread email summary", exact: true }).fill("Preview project creation")
  await dialog.getByRole("textbox", { name: "Summarize unread email and highlight important messages", exact: true }).fill("Keep this local preview task in its selected project.")
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const surface = page.getByTestId("scheduled-surface")
  await expect(surface.getByRole("listitem")).toHaveCount(1)
  await expect(surface.getByText("Preview project creation", { exact: true })).toBeVisible()
  const saved = await page.evaluate(() => {
    const stored: unknown = JSON.parse(localStorage.getItem("kokoro.preview.scheduled-tasks") ?? "null")
    if (!Array.isArray(stored) || stored.length !== 1) throw new Error("Expected one local preview task")
    const task: unknown = stored[0]
    if (typeof task !== "object" || task === null || !("projectId" in task) || typeof task.projectId !== "string" || !("nextRun" in task) || typeof task.nextRun !== "string") {
      throw new Error("Preview project association and next run are missing")
    }
    const next = new Date(task.nextRun)
    const now = new Date()
    return { projectId: task.projectId, nextMonth: next.getUTCMonth() !== now.getUTCMonth() || next.getUTCFullYear() !== now.getUTCFullYear() }
  })
  expect(saved.projectId).toBe(projectId)
  await surface.getByRole("tab", { name: "Calendar", exact: true }).click()
  const calendar = surface.getByTestId("scheduled-calendar-view")
  if (saved.nextMonth) await calendar.getByRole("button", { name: "Next month", exact: true }).click()
  await expect(calendar.getByRole("button", { name: /Preview project creation/ })).toBeVisible()
  await page.evaluate((otherProjectId) => {
    history.pushState(null, "", `/app/scheduled?project_id=${otherProjectId}&tab=list`)
    dispatchEvent(new Event("kokoro:surface-navigation"))
  }, otherProjectId)
  await expect(surface.getByTestId("scheduled-task-list").getByRole("listitem")).toHaveCount(0)
  await expect(surface.getByRole("list", { name: "Automation types", exact: true }).getByRole("listitem")).toHaveCount(3)
  await expect(surface.getByText("Preview project creation", { exact: true })).toHaveCount(0)
  await page.evaluate(() => {
    history.pushState(null, "", "/app/scheduled?tab=list")
    dispatchEvent(new Event("kokoro:surface-navigation"))
  })
  await expect(surface.getByRole("listitem")).toHaveCount(1)
  await expect(surface.getByText("Preview project creation", { exact: true })).toBeVisible()
  expect(businessRequests).toEqual([])
})

for (const theme of ["light", "dark"] as const) {
  test(`automation overview preserves keyboard creation and honest unavailable types in ${theme}`, async ({ page, isMobile }) => {
    const projectId = "project_55555555-5555-5555-5555-555555555555"
    const size = isMobile ? { width: 320, height: 568 } : { width: 1280, height: 800 }
    await page.setViewportSize(size)
    await page.addInitScript((theme) => {
      localStorage.setItem("kokoro.locale", "en")
      localStorage.setItem("kokoro.theme", theme)
      localStorage.removeItem("kokoro.preview.scheduled-tasks")
    }, theme)
    const businessRequests: string[] = []
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.includes("/scheduled-tasks")) businessRequests.push(request.method())
    })
    await page.goto(`/app/scheduled?project_id=${projectId}&tab=list`, { waitUntil: "domcontentloaded" })
    expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(size)
    await expect.poll(() => page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(theme === "dark")
    const surface = page.getByTestId("scheduled-surface")
    const types = surface.getByRole("list", { name: "Automation types", exact: true })
    await expect(types.getByRole("listitem")).toHaveCount(3)
    for (const heading of ["Scheduled tasks", "Triggers", "Advanced automation"]) {
      await expect(types.getByRole("heading", { level: 3, name: heading, exact: true })).toBeVisible()
    }
    await expect(types.getByText("Beta", { exact: true })).toBeVisible()
    const unavailableActions: readonly (readonly [name: string, reason: string])[] = [
      ["Describe automation", "Advanced automation is not connected yet. Creating or running it is unavailable."],
    ]
    for (const [name, reason] of unavailableActions) {
      const action = types.getByRole("button", { name, exact: true })
      await expect(action).toBeDisabled()
      await expect(action).toHaveAccessibleDescription(reason)
      await expect(types.getByText(reason, { exact: true })).toBeVisible()
    }
    const trigger = types.getByRole("button", { name: "Create trigger", exact: true })
    await expect(trigger).toBeEnabled()
    await expect(types.getByText("Run when a public RSS feed has new entries matching your conditions.", { exact: true })).toBeVisible()
    const geometry = await types.evaluate((list) => {
      const cards = [...list.children].map((card) => {
        const box = card.getBoundingClientRect()
        return {
          left: box.left, right: box.right, top: box.top, bottom: box.bottom,
          contained: [...card.children].every((child) => {
            const rect = child.getBoundingClientRect()
            return rect.left >= box.left && rect.right <= box.right && rect.top >= box.top && rect.bottom <= box.bottom
          }),
          noOverflow: card.scrollWidth <= card.clientWidth,
        }
      })
      return {
        cards,
        noPageOverflow: document.documentElement.scrollWidth <= innerWidth,
      }
    })
    expect(geometry.noPageOverflow).toBe(true)
    expect(geometry.cards).toHaveLength(3)
    for (const card of geometry.cards) {
      expect(card.contained).toBe(true)
      expect(card.noOverflow).toBe(true)
      expect(card.left).toBeGreaterThanOrEqual(0)
      expect(card.right).toBeLessThanOrEqual(size.width)
    }
    for (let index = 1; index < geometry.cards.length; index += 1) {
      const previous = geometry.cards[index - 1]
      const current = geometry.cards[index]
      if (!previous || !current) throw new Error("Automation type geometry is missing")
      if (isMobile) {
        expect(current.top).toBeGreaterThanOrEqual(previous.bottom)
        expect(Math.abs(current.left - previous.left)).toBeLessThanOrEqual(1)
      } else {
        expect(current.left).toBeGreaterThanOrEqual(previous.right)
        expect(Math.abs(current.top - previous.top)).toBeLessThanOrEqual(1)
      }
    }
    const timer = types.getByRole("button", { name: "Create your scheduled task", exact: true })
    const suggestion = surface.getByRole("button", { name: "Set up automated monitoring for any topic, competitor, or keyword.", exact: true })
    await trigger.focus()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL((url) => url.pathname === "/app" && url.searchParams.get("workflow") === "automation" && url.searchParams.get("project_id") === projectId)
    const rssChoice = page.getByRole("button", { name: "Triggers", exact: true })
    await expect(rssChoice).toBeEnabled()
    await rssChoice.focus()
    await page.keyboard.press("Enter")
    const rssForm = page.getByRole("form", { name: "Create scheduled automation", exact: true })
    await expect(rssForm.getByRole("textbox", { name: "RSS feed URL", exact: true })).toHaveValue("")
    await expect(rssForm.getByLabel("Select time", { exact: true })).toHaveCount(0)
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await rssForm.getByRole("textbox", { name: "RSS feed URL", exact: true }).fill("https://news.example.com/feed")
    await rssForm.getByRole("button", { name: "Back to start options", exact: true }).click()
    await expect(rssChoice).toBeFocused()
    await rssChoice.press("Enter")
    await expect(rssForm.getByRole("textbox", { name: "RSS feed URL", exact: true })).toHaveValue("")
    await rssForm.getByRole("button", { name: "Back to start options", exact: true }).click()
    await expect(rssChoice).toBeFocused()
    await page.getByRole("link", { name: "Back to automations", exact: true }).click()
    await expect(types).toBeVisible()
    expect(new URL(page.url()).searchParams.get("project_id")).toBe(projectId)
    await timer.focus()
    await expect(timer).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(trigger).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(suggestion).toBeFocused()
    await page.keyboard.press("Shift+Tab")
    await expect(trigger).toBeFocused()
    await page.keyboard.press("Shift+Tab")
    await expect(timer).toBeFocused()
    await page.keyboard.press("Enter")
    let dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("textbox", { name: "Unread email summary", exact: true })).toHaveValue("")
    await expect(dialog.getByRole("textbox", { name: "Summarize unread email and highlight important messages", exact: true })).toHaveValue("")
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(timer).toBeFocused()
    await suggestion.focus()
    await page.keyboard.press("Enter")
    dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("textbox", { name: "Summarize unread email and highlight important messages", exact: true })).toHaveValue("Set up automated monitoring for any topic, competitor, or keyword.")
    await dialog.getByRole("textbox", { name: "Unread email summary", exact: true }).fill("Overview keyboard preview task")
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(surface.getByRole("listitem")).toHaveCount(1)
    await expect(surface.getByText("Overview keyboard preview task", { exact: true })).toBeVisible()
    expect(new URL(page.url()).searchParams.get("project_id")).toBe(projectId)
    const stored: unknown = await page.evaluate(() => JSON.parse(localStorage.getItem("kokoro.preview.scheduled-tasks") ?? "null"))
    expect(stored).toEqual([expect.objectContaining({ title: "Overview keyboard preview task", projectId })])
    expect(businessRequests).toEqual([])
  })
}

for (const scenario of [
  { width: 320, height: 568, theme: "light" },
  { width: 320, height: 400, theme: "dark" },
  { width: 1280, height: 800, theme: "light" },
] as const) {
  test(`H2 website picker viewport ${scenario.width}x${scenario.height} preserves reachable local selection`, async ({ page }) => {
    const size = { width: scenario.width, height: scenario.height }
    await page.setViewportSize(size)
    await page.addInitScript((theme) => {
      localStorage.setItem("kokoro.locale", "en")
      localStorage.setItem("kokoro.theme", theme)
    }, scenario.theme)
    const businessRequests: string[] = []
    const admissionReads: string[] = []
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname
      if (request.method() === "GET" && path === "/api/admin-access") {
        admissionReads.push(`${request.method()} ${path}`)
        return
      }
      if (path.startsWith("/api/") && !path.startsWith("/api/auth/")) businessRequests.push(`${request.method()} ${path}`)
    })
    await page.goto("/app/project/preview-project", { waitUntil: "domcontentloaded" })
    expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(size)
    await expect.poll(() => page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(scenario.theme === "dark")
    const add = page.locator('[data-context-kind="websites"]').getByRole("button", { name: "Add", exact: true })
    await add.focus()
    await expect(add).toBeFocused()
    await page.keyboard.press("Enter")
    const dialog = page.getByRole("dialog", { name: "Add website to current project", exact: true })
    const search = dialog.getByRole("textbox", { name: "Search websites", exact: true })
    await expect(search).toBeFocused()
    await expect(dialog.getByText("Local demo only: searching, selecting, and saving will not link real websites.", { exact: true })).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled()
    const geometry = await dialog.evaluate((root) => {
      const title = root.querySelector('[data-slot="dialog-title"]')
      const close = root.querySelector('[data-slot="dialog-close"][aria-label="Close dialog"]')
      const elements = [
        ["dialog", root], ["title", title], ["close", close],
        ["description", root.querySelector('[data-slot="dialog-description"]')],
        ["search", root.querySelector('input[aria-label="Search websites"]')],
        ["candidates", root.querySelector('[role="list"]')],
        ["footer", root.querySelector('[data-slot="dialog-footer"]')],
      ] as const
      const boxes = elements.map(([name, element]) => {
        if (!element) throw new Error(`Missing website picker ${name}`)
        const rect = element.getBoundingClientRect()
        return { name, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
      })
      if (!title || !close) throw new Error("Missing website picker title or close control")
      const text = document.createRange()
      text.selectNodeContents(title)
      const closeRect = close.getBoundingClientRect()
      return {
        boxes,
        titleClearOfClose: [...text.getClientRects()].every((line) => line.right <= closeRect.left || line.left >= closeRect.right || line.bottom <= closeRect.top || line.top >= closeRect.bottom),
        noPageOverflow: document.documentElement.scrollWidth <= innerWidth,
        noDialogOverflow: root.scrollWidth <= root.clientWidth,
      }
    })
    console.log(JSON.stringify({ scenario, geometry, admissionReads, businessRequests }))
    expect(geometry.noPageOverflow).toBe(true)
    expect(geometry.noDialogOverflow).toBe(true)
    for (const box of geometry.boxes) {
      expect(box.width, `${box.name} has usable width`).toBeGreaterThan(0)
      expect(box.height, `${box.name} has usable height`).toBeGreaterThan(0)
      expect(box.left, `${box.name} left`).toBeGreaterThanOrEqual(0)
      expect(box.top, `${box.name} top`).toBeGreaterThanOrEqual(0)
      expect(box.right, `${box.name} right`).toBeLessThanOrEqual(size.width)
      expect(box.bottom, `${box.name} bottom`).toBeLessThanOrEqual(size.height)
    }
    expect(geometry.titleClearOfClose).toBe(true)
    const listBox = geometry.boxes.find((box) => box.name === "candidates")
    const footerBox = geometry.boxes.find((box) => box.name === "footer")
    if (!listBox || !footerBox) throw new Error("Missing website candidate/footer geometry")
    expect(listBox.bottom).toBeLessThanOrEqual(footerBox.top)
    const list = dialog.getByRole("list", { name: "Search websites", exact: true })
    await expect(list.getByRole("button")).toHaveCount(2)
    for (const domain of [/kokoro\.miaokit\.cloud/, /launch\.example\.test/]) {
      const candidate = list.getByRole("button", { name: domain })
      await candidate.scrollIntoViewIfNeeded()
      const bounds = await candidate.evaluate((element) => {
        const region = element.closest('[role="list"]')
        if (!region) throw new Error("Website candidate list is missing")
        const row = element.getBoundingClientRect()
        const area = region.getBoundingClientRect()
        return { row: row.toJSON(), area: area.toJSON(), width: innerWidth, height: innerHeight }
      })
      expect(bounds.row.left).toBeGreaterThanOrEqual(Math.max(0, bounds.area.left) - 1)
      expect(bounds.row.right).toBeLessThanOrEqual(Math.min(bounds.width, bounds.area.right) + 1)
      expect(bounds.row.top).toBeGreaterThanOrEqual(Math.max(0, bounds.area.top) - 1)
      expect(bounds.row.bottom).toBeLessThanOrEqual(Math.min(bounds.height, bounds.area.bottom) + 1)
    }
    for (const name of ["Cancel", "Save"]) {
      const button = dialog.getByRole("button", { name, exact: true })
      const bounds = await button.boundingBox()
      if (!bounds) throw new Error(`Website picker ${name} is not rendered`)
      expect(bounds.y).toBeGreaterThanOrEqual(0)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(size.height)
    }
    await search.fill(" launch.example.test ")
    await expect(list.getByRole("button")).toHaveCount(1)
    const candidate = list.getByRole("button", { name: /launch\.example\.test/ })
    await candidate.click()
    await expect(candidate).toHaveAttribute("aria-pressed", "true")
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeEnabled()
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(add).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(search).toHaveValue("")
    await expect(list.getByRole("button", { name: /launch\.example\.test/ })).toHaveAttribute("aria-pressed", "true")
    await expect(search).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(add).toBeFocused()
    await page.keyboard.press("Enter")
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(add).toBeFocused()
    expect(businessRequests).toEqual([])
  })
}

for (const theme of ["light", "dark"] as const) {
  test(`I1 inline automation journey ${theme}`, async ({ page, isMobile }) => {
      const size = isMobile ? { width: 320, height: 568 } : { width: 1280, height: 800 }
      const projectId = "project_55555555-5555-5555-5555-555555555555"
      await page.setViewportSize(size)
      await page.addInitScript(({ theme }) => {
        localStorage.setItem("kokoro.locale", "en")
        localStorage.setItem("kokoro.theme", theme)
        localStorage.removeItem("kokoro.preview.scheduled-tasks")
      }, { theme })
      const businessRequests: string[] = []
      const shellAdmissionReads: string[] = []
      page.on("request", (request) => {
        const url = new URL(request.url())
        if (!url.pathname.startsWith("/api/")) return
        if (request.method() === "GET" && url.pathname === "/api/admin-access" && !url.search) shellAdmissionReads.push(request.method())
        else businessRequests.push(`${request.method()} ${url.pathname}`)
      })
      await page.goto(`/app/scheduled?project_id=${projectId}&tab=list`, { waitUntil: "domcontentloaded" })
      expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(size)
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*\bdark\b)/)
      const start = page.getByRole("link", { name: "Get started", exact: true })
      await start.focus()
      await page.keyboard.press("Enter")
      await expect(page).toHaveURL((url) => url.pathname === "/app" && url.searchParams.get("workflow") === "automation" && url.searchParams.get("project_id") === projectId)
      await expect(page.getByRole("heading", { name: "Automation workflow", level: 1 })).toBeVisible()
      await expect(page.getByRole("heading", { name: "Choose how to start" })).toBeVisible()
      for (const [name, reason] of [
        ["Advanced automation", "Advanced automation is not connected yet. Creating or running it is unavailable."],
      ] as const) {
        const action = page.getByRole("button", { name, exact: true })
        await expect(action).toBeDisabled()
        await expect(action).toHaveAccessibleDescription(reason)
        await expect(page.getByText(reason, { exact: true })).toBeVisible()
      }
      const trigger = page.getByRole("button", { name: "Triggers", exact: true })
      await expect(trigger).toBeEnabled()
      await trigger.focus()
      await page.keyboard.press("Enter")
      const rssForm = page.getByRole("form", { name: "Create scheduled automation", exact: true })
      await expect(rssForm.getByRole("textbox", { name: "RSS feed URL", exact: true })).toHaveValue("")
      await expect(rssForm.getByLabel("Select time", { exact: true })).toHaveCount(0)
      await expect(page.getByRole("dialog")).toHaveCount(0)
      await rssForm.getByRole("textbox", { name: "RSS feed URL", exact: true }).fill("https://news.example.com/discarded")
      await rssForm.getByRole("button", { name: "Back to start options", exact: true }).click()
      await expect(trigger).toBeFocused()
      await trigger.press("Enter")
      await expect(rssForm.getByRole("textbox", { name: "RSS feed URL", exact: true })).toHaveValue("")
      await rssForm.getByRole("button", { name: "Back to start options", exact: true }).click()
      await expect(trigger).toBeFocused()
      expect(new URL(page.url()).searchParams.get("project_id")).toBe(projectId)
      expect(businessRequests).toEqual([])
      const scheduled = page.getByRole("button", { name: "Scheduled tasks", exact: true })
      await scheduled.focus()
      await page.keyboard.press("Enter")
      const form = page.getByRole("form", { name: "Create scheduled automation" })
      await expect(form).toBeVisible()
      await expect(page.getByRole("dialog")).toHaveCount(0)
      await expect(form.getByLabel("Select time", { exact: true })).toHaveValue("10:00")
      await expect(form.getByRole("button", { name: "Create automation", exact: true })).toBeDisabled()
      await form.getByRole("textbox", { name: "Unread email summary", exact: true }).fill(`Inline preview ${size.width} ${theme}`)
      const prompt = form.getByRole("textbox", { name: "Summarize unread email and highlight important messages", exact: true })
      await prompt.fill("Keep this in the selected project, without sending a chat message.")
      await prompt.press("Enter")
      const settings = form.getByRole("button", { name: "Automation settings", exact: true })
      await settings.click()
      for (const name of ["Agent", "Connectors", "Independent task", "Cloud computer", "Local folder"]) {
        const action = page.getByRole("button", { name, exact: true })
        await action.scrollIntoViewIfNeeded()
        await expect(action).toBeDisabled()
        await expect(action).toHaveAccessibleDescription(/not available|not connected/i)
      }
      const expiry = page.getByRole("checkbox", { name: "Set expiry date", exact: true })
      await expiry.scrollIntoViewIfNeeded()
      const last = await expiry.boundingBox()
      if (!last) throw new Error("The final supported automation setting is missing")
      expect(last.y).toBeGreaterThanOrEqual(0)
      expect(last.y + last.height).toBeLessThanOrEqual(size.height)
      await page.keyboard.press("Escape")
      await expect(settings).toBeFocused()
      const geometry = await form.evaluate((element) => {
        const area = element.getBoundingClientRect()
        const controls = [...element.querySelectorAll("input,textarea,button")]
          .filter((control) => control.getClientRects().length > 0 && getComputedStyle(control).visibility !== "hidden" && getComputedStyle(control).opacity !== "0")
          .map((control) => control.getBoundingClientRect().toJSON())
        return { area: area.toJSON(), controls, pageWidth: document.documentElement.clientWidth, pageScrollWidth: document.documentElement.scrollWidth }
      })
      expect(geometry.pageScrollWidth).toBeLessThanOrEqual(geometry.pageWidth)
      for (const rect of geometry.controls) {
        expect(rect.left).toBeGreaterThanOrEqual(geometry.area.left - 1)
        expect(rect.right).toBeLessThanOrEqual(geometry.area.right + 1)
      }
      const create = form.getByRole("button", { name: "Create automation", exact: true })
      await create.scrollIntoViewIfNeeded()
      await expect(create).toBeEnabled()
      await create.click()
      const surface = page.getByTestId("scheduled-surface")
      await expect(surface.getByText(`Inline preview ${size.width} ${theme}`, { exact: true })).toBeVisible()
      await expect(page).toHaveURL((url) => url.pathname === "/app/scheduled" && url.searchParams.get("project_id") === projectId)
      const localTask = await page.evaluate(() => {
        const tasks: unknown = JSON.parse(localStorage.getItem("kokoro.preview.scheduled-tasks") ?? "null")
        if (!Array.isArray(tasks) || tasks.length !== 1) throw new Error("Expected one local preview automation")
        const task: unknown = tasks[0]
        if (task === null || typeof task !== "object" || !("projectId" in task) || !("time" in task)) throw new Error("Preview task lost its scope or time")
        return { projectId: task.projectId, time: task.time }
      })
      expect(localTask).toEqual({ projectId, time: "10:00" })
      expect(businessRequests).toEqual([])
      expect(shellAdmissionReads.every((method) => method === "GET")).toBe(true)
  })
}

for (const theme of ["light", "dark"] as const) {
  test(`I6 RSS preview creates, edits conditions, pauses and resumes in ${theme}`, async ({ page, isMobile }) => {
    const projectId = "project_55555555-5555-5555-5555-555555555555"
    const title = `RSS preview ${isMobile ? "mobile" : "desktop"} ${theme}`
    const feedUrl = "https://news.example.com/feed"
    const size = isMobile ? { width: 320, height: 568 } : { width: 1280, height: 800 }
    await page.setViewportSize(size)
    await page.addInitScript((theme) => {
      localStorage.setItem("kokoro.locale", "en")
      localStorage.setItem("kokoro.theme", theme)
      localStorage.removeItem("kokoro.preview.scheduled-tasks")
    }, theme)
    const businessRequests: string[] = []
    const shellAdmissionReads: string[] = []
    const feedRequests: string[] = []
    page.on("request", (request) => {
      const url = new URL(request.url())
      if (url.href === feedUrl) feedRequests.push(request.method())
      if (!url.pathname.startsWith("/api/")) return
      if (request.method() === "GET" && url.pathname === "/api/admin-access" && !url.search) shellAdmissionReads.push(request.method())
      else businessRequests.push(`${request.method()} ${url.pathname}`)
    })
    await page.goto(`/app?workflow=automation&project_id=${projectId}`, { waitUntil: "domcontentloaded" })
    expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(size)
    await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*\bdark\b)/)
    const trigger = page.getByRole("button", { name: "Triggers", exact: true })
    await expect(trigger).toBeEnabled()
    await trigger.focus()
    await page.keyboard.press("Enter")
    const form = page.getByRole("form", { name: "Create scheduled automation", exact: true })
    await expect(form).toBeVisible()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(form.getByLabel("Select time", { exact: true })).toHaveCount(0)
    await form.getByRole("textbox", { name: "Unread email summary", exact: true }).fill(title)
    await form.getByRole("textbox", { name: "RSS feed URL", exact: true }).fill(feedUrl)
    await form.getByRole("textbox", { name: "Summarize unread email and highlight important messages", exact: true }).fill("Summarize matching entries in this project.")
    await form.getByRole("button", { name: "Add OR group", exact: true }).click()
    const first = form.getByRole("group", { name: "Condition group 1", exact: true })
    await first.getByRole("textbox", { name: "Match value", exact: true }).fill("release")
    await first.getByRole("button", { name: "Add condition", exact: true }).click()
    await first.getByRole("textbox", { name: "Match value", exact: true }).nth(1).fill("Go")
    await first.getByRole("combobox", { name: "Field", exact: true }).nth(1).click()
    await page.getByRole("option", { name: "Summary", exact: true }).click()
    await expect(first.getByText("AND", { exact: true })).toBeVisible()
    await form.getByRole("button", { name: "Add OR group", exact: true }).click()
    const second = form.getByRole("group", { name: "Condition group 2", exact: true })
    await second.getByRole("combobox", { name: "Field", exact: true }).click()
    await page.getByRole("option", { name: "Domain", exact: true }).click()
    await second.getByRole("combobox", { name: "Operator", exact: true }).click()
    await page.getByRole("option", { name: "Equals", exact: true }).click()
    await second.getByRole("textbox", { name: "Match value", exact: true }).fill("go.dev")
    await expect(form.getByText("OR", { exact: true })).toBeVisible()
    expect(await form.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { contained: [...element.querySelectorAll("input,textarea,button")].filter(control => control.getClientRects().length > 0).every(control => {
        const box = control.getBoundingClientRect()
        return box.left >= rect.left - 1 && box.right <= rect.right + 1
      }), noPageOverflow: document.documentElement.scrollWidth <= innerWidth }
    })).toEqual({ contained: true, noPageOverflow: true })
    const create = form.getByRole("button", { name: "Create automation", exact: true })
    await create.scrollIntoViewIfNeeded()
    await expect(create).toBeEnabled()
    await create.click()
    await expect(page).toHaveURL((url) => url.pathname === "/app/scheduled" && url.searchParams.get("project_id") === projectId)
    const surface = page.getByTestId("scheduled-surface")
    const row = surface.getByRole("listitem").filter({ hasText: title })
    await expect(row).toBeVisible()
    await expect(row.getByText(feedUrl, { exact: true })).toBeVisible()
    await expect(row.getByText("Local preview does not check feeds. Current feed status is unavailable.", { exact: true })).toBeVisible()
    const localTasks = () => page.evaluate((): unknown => JSON.parse(localStorage.getItem("kokoro.preview.scheduled-tasks") ?? "null"))
    const originalConditions = [
      [{ field: "title", operator: "contains", value: "release" }, { field: "summary", operator: "contains", value: "Go" }],
      [{ field: "domain", operator: "equals", value: "go.dev" }],
    ]
    const created = await localTasks()
    expect(created).toEqual([expect.objectContaining({ title, projectId, triggerKind: "rss", feedUrl, conditions: originalConditions, nextRun: null, enabled: true })])
    if (!Array.isArray(created) || created.length !== 1) throw new Error("Expected one locally stored RSS definition")
    for (const key of ["feedState", "lastCheckedAt", "nextCheckAt", "errorCode", "frequency", "time", "timezone"]) expect(created[0]).not.toHaveProperty(key)
    const actions = row.getByRole("button", { name: `Actions for scheduled task ${title}`, exact: true })
    await actions.click()
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("textbox", { name: "RSS feed URL", exact: true })).toHaveValue(feedUrl)
    await expect(dialog.getByLabel("Select time", { exact: true })).toHaveCount(0)
    const editedFirst = dialog.getByRole("group", { name: "Condition group 1", exact: true })
    await expect(editedFirst.getByRole("textbox", { name: "Match value", exact: true }).nth(0)).toHaveValue("release")
    await expect(editedFirst.getByRole("textbox", { name: "Match value", exact: true }).nth(1)).toHaveValue("Go")
    await editedFirst.getByRole("textbox", { name: "Match value", exact: true }).nth(0).fill("security")
    await editedFirst.getByRole("button", { name: "Remove condition 2", exact: true }).click()
    const editedSecond = dialog.getByRole("group", { name: "Condition group 2", exact: true })
    await editedSecond.getByRole("combobox", { name: "Operator", exact: true }).click()
    await page.getByRole("option", { name: "Is not empty", exact: true }).click()
    await expect(editedSecond.getByRole("textbox", { name: "Match value", exact: true })).toHaveCount(0)
    await expect.poll(() => dialog.evaluate(element => {
      const footer = element.querySelector('[data-slot="dialog-footer"]')
      if (!(footer instanceof HTMLElement)) throw new Error("Scheduled task editor footer missing")
      const dialogRect = element.getBoundingClientRect()
      const footerRect = footer.getBoundingClientRect()
      const buttons = [...footer.querySelectorAll("button")]
      const contained = (inner: DOMRect, outer: DOMRect) => inner.width > 0 && inner.height > 0
        && inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5
        && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5
      return {
        actions: buttons.map(button => button.textContent?.trim()),
        insideFooter: buttons.every(button => contained(button.getBoundingClientRect(), footerRect)),
        insideDialog: buttons.every(button => contained(button.getBoundingClientRect(), dialogRect)),
      }
    })).toEqual({ actions: ["Cancel", "Save"], insideFooter: true, insideDialog: true })
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(localTasks).toEqual([expect.objectContaining({ projectId, triggerKind: "rss", feedUrl, conditions: [[{ field: "title", operator: "contains", value: "security" }], [{ field: "domain", operator: "is_not_empty" }]], nextRun: null })])
    await actions.click()
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    await expect(editedFirst.getByRole("textbox", { name: "Match value", exact: true }).nth(0)).toHaveValue("security")
    await expect(editedSecond.getByRole("textbox", { name: "Match value", exact: true })).toHaveCount(0)
    await editedFirst.getByRole("textbox", { name: "Match value", exact: true }).nth(0).fill("discarded change")
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(localTasks).toEqual([expect.objectContaining({ projectId, triggerKind: "rss", feedUrl, conditions: [[{ field: "title", operator: "contains", value: "security" }], [{ field: "domain", operator: "is_not_empty" }]], nextRun: null })])
    await actions.click()
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    await expect(dialog.getByRole("textbox", { name: "RSS feed URL", exact: true })).toHaveValue(feedUrl)
    await expect(editedFirst.getByRole("textbox", { name: "Match value", exact: true }).nth(0)).toHaveValue("security")
    await expect(editedSecond.getByRole("combobox", { name: "Operator", exact: true })).toHaveText("Is not empty")
    await expect(editedSecond.getByRole("textbox", { name: "Match value", exact: true })).toHaveCount(0)
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await actions.click()
    await page.getByRole("menuitem", { name: "Pause", exact: true }).click()
    await expect(row).toHaveAttribute("data-status", "paused")
    await expect.poll(localTasks).toEqual([expect.objectContaining({ enabled: false, status: "paused", projectId })])
    await actions.click()
    await page.getByRole("menuitem", { name: "Resume", exact: true }).click()
    await expect(row).toHaveAttribute("data-status", "active")
    await expect.poll(localTasks).toEqual([expect.objectContaining({ enabled: true, status: "active", projectId })])
    expect(businessRequests).toEqual([])
    expect(feedRequests).toEqual([])
    expect(shellAdmissionReads.every(method => method === "GET")).toBe(true)
  })
}
