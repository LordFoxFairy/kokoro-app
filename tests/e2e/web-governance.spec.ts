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

  test("keeps the preview thread and Composer on one reading axis across responsive widths", async ({ page, isMobile }, testInfo) => {
    test.skip(isMobile, "the matrix controls the desktop Chromium viewport and rail state explicitly")
    test.skip(Boolean(process.env.KOKORO_E2E_BASE_URL?.trim()), "the geometry fixture is available only on the local preview server")

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/app", { waitUntil: "networkidle" })
    await page.getByRole("textbox", { name: "Chat input" }).fill("Check the responsive reading axis")
    await page.getByRole("button", { name: "Send message" }).click()
    await expect(page.locator('[data-slot="message-scroller-content"]')).toBeVisible()

    const shell = page.locator('[data-slot="sidebar-wrapper"]')
    const composer = page.locator('form[aria-label="Message editor"]')
    const chatInput = page.getByRole("textbox", { name: "Chat input" })
    const detailedEvidenceWidths = new Set([390, 768, 960, 961, 1280])
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

      if (await chatInput.evaluate((element) => element === document.activeElement)) {
        await page.keyboard.press("Shift+Tab")
      }
      await expect(chatInput).not.toBeFocused()
      await page.screenshot({
        path: testInfo.outputPath(`thread-${item.width}.png`),
        fullPage: true,
      })
      await composer.screenshot({ path: testInfo.outputPath(`composer-${item.width}-blur.png`) })

      const computedStyleEvidence = await page.evaluate(() => {
        const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Chat input"]')
        const form = document.querySelector<HTMLFormElement>('form[aria-label="Message editor"]')
        const safeStyle = (element: Element | null) => {
          if (!element) return null
          const style = window.getComputedStyle(element)
          return {
            border: style.border,
            boxShadow: style.boxShadow,
            outline: style.outline,
            outlineOffset: style.outlineOffset,
            width: style.width,
            maxWidth: style.maxWidth,
            padding: style.padding,
            borderRadius: style.borderRadius,
          }
        }
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          textarea: safeStyle(textarea),
          form: safeStyle(form),
        }
      })
      await testInfo.attach(`composer-${item.width}-computed.json`, {
        body: JSON.stringify(computedStyleEvidence, null, 2),
        contentType: "application/json",
      })

      const controls = page.getByTestId("composer-controls")
      const terminalAction = controls.locator(
        '[data-composer-action="send"], [data-composer-action="stop"]',
      )
      await expect(terminalAction).toHaveCount(1)
      const controlsBox = await controls.boundingBox()
      const actionBox = await terminalAction.boundingBox()
      expect(controlsBox, `${item.width}px Composer controls must be measurable`).not.toBeNull()
      expect(actionBox, `${item.width}px Composer terminal action must be measurable`).not.toBeNull()
      if (controlsBox && actionBox) {
        const trailingEdgeDrift = Math.abs(
          controlsBox.x + controlsBox.width - actionBox.x - actionBox.width,
        )
        expect(trailingEdgeDrift, `${item.width}px Composer action trailing-edge drift`).toBeLessThanOrEqual(1)
      }

      if (detailedEvidenceWidths.has(item.width)) {
        let keyboardFocused = false
        for (let tabIndex = 0; tabIndex < 40; tabIndex += 1) {
          await page.keyboard.press("Tab")
          if (await chatInput.evaluate((element) => element === document.activeElement)) {
            keyboardFocused = true
            break
          }
        }
        expect(keyboardFocused, `${item.width}px keyboard focus did not reach Chat input`).toBe(true)
        await expect(chatInput).toBeFocused()
        await composer.screenshot({ path: testInfo.outputPath(`composer-${item.width}-focus.png`) })

        await chatInput.fill("First line\nSecond line\nThird line")
        await composer.screenshot({ path: testInfo.outputPath(`composer-${item.width}-multiline.png`) })
        await chatInput.fill("")
        await page.keyboard.press("Shift+Tab")
        await expect(chatInput).not.toBeFocused()
      }
    }
  })

  test("keeps the Composer terminal action on the trailing edge at touch widths", async ({ page, isMobile }, testInfo) => {
    test.skip(!isMobile, "the touch-width matrix runs only in the mobile browser project")
    test.skip(Boolean(process.env.KOKORO_E2E_BASE_URL?.trim()), "the geometry fixture is available only on the local preview server")

    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto("/app", { waitUntil: "networkidle" })
    await page.getByRole("textbox", { name: "Chat input" }).fill("Check the touch Composer action")
    await page.getByRole("button", { name: "Send message" }).click()
    await expect(page.locator('[data-slot="message-scroller-content"]')).toBeVisible()

    const composer = page.locator('form[aria-label="Message editor"]')
    const controls = page.getByTestId("composer-controls")
    const terminalAction = controls.locator(
      '[data-composer-action="send"], [data-composer-action="stop"]',
    )

    for (const width of [390, 640]) {
      await page.setViewportSize({ width, height: 900 })
      await page.screenshot({
        path: testInfo.outputPath(`mobile-thread-${width}.png`),
        fullPage: true,
      })
      await composer.screenshot({ path: testInfo.outputPath(`mobile-composer-${width}.png`) })

      await expect(terminalAction).toHaveCount(1)
      const controlsBox = await controls.boundingBox()
      const actionBox = await terminalAction.boundingBox()
      expect(controlsBox, `${width}px touch Composer controls must be measurable`).not.toBeNull()
      expect(actionBox, `${width}px touch Composer terminal action must be measurable`).not.toBeNull()
      if (controlsBox && actionBox) {
        const trailingEdgeDrift = Math.abs(
          controlsBox.x + controlsBox.width - actionBox.x - actionBox.width,
        )
        expect(trailingEdgeDrift, `${width}px touch Composer action trailing-edge drift`).toBeLessThanOrEqual(1)
      }
    }
  })

  test("keeps a long Markdown thread readable through the tail and a second turn", async ({ page, isMobile }, testInfo) => {
    test.skip(isMobile, "the long-thread matrix controls the desktop Chromium viewport explicitly")
    test.skip(Boolean(process.env.KOKORO_E2E_BASE_URL?.trim()), "the long-thread fixture is available only on the local preview server")

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/app", { waitUntil: "networkidle" })
    const chatInput = page.getByRole("textbox", { name: "Chat input" })
    await chatInput.fill("!long")
    await page.getByRole("button", { name: "Send message" }).click()

    const markdown = page.locator('[data-slot="markdown-message"]').filter({ hasText: "网站需求梳理" })
    await expect(markdown.getByRole("heading", { level: 2, name: "网站需求梳理" })).toBeVisible()
    await expect(markdown.getByRole("heading", { level: 3, name: "建议的第一步" })).toBeVisible()
    await expect(markdown.getByRole("heading", { level: 3, name: "交付清单" })).toBeVisible()
    const listItems = markdown.locator("ul > li")
    await expect(listItems).toHaveCount(4)
    const listSemantics = await markdown.locator("ul").evaluate((list) => ({
      listStyleType: window.getComputedStyle(list).listStyleType,
      itemDisplays: [...list.querySelectorAll(":scope > li")].map((item) => window.getComputedStyle(item).display),
    }))
    expect(listSemantics.listStyleType).toBe("disc")
    expect(listSemantics.itemDisplays).toEqual(["list-item", "list-item", "list-item", "list-item"])

    const tailMarker = markdown.getByText("上线前体验检查项", { exact: true })
    const composer = page.locator('form[aria-label="Message editor"]')
    const viewport = page.locator('[data-slot="message-scroller-viewport"]')
    const content = page.locator('[data-slot="message-scroller-content"]')
    const backToLatest = page.getByRole("button", { name: /Back to latest|回到最新/u })
    await expect(composer).toHaveAttribute("data-state", "idle")
    for (const { width, height, requiresOverflow } of [
      { width: 1280, height: 900, requiresOverflow: false },
      { width: 390, height: 620, requiresOverflow: true },
    ] as const) {
      await page.setViewportSize({ width, height })
      if (requiresOverflow) {
        const scrollGeometry = await viewport.evaluate((element) => ({
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
        }))
        expect(scrollGeometry.scrollHeight, `${width}px long thread must overflow its viewport`).toBeGreaterThan(
          scrollGeometry.clientHeight,
        )
        await viewport.hover()
        await page.mouse.wheel(0, -scrollGeometry.scrollHeight)
        await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(0)
        await expect(backToLatest).toHaveAttribute("data-active", "true")
        await expect(backToLatest).not.toHaveAttribute("inert", "")

        const tailBeforeScroll = await tailMarker.boundingBox()
        const viewportBeforeScroll = await viewport.boundingBox()
        expect(tailBeforeScroll, `${width}px long-thread tail must be measurable before scrolling`).not.toBeNull()
        expect(viewportBeforeScroll, `${width}px message viewport must be measurable before scrolling`).not.toBeNull()
        if (tailBeforeScroll && viewportBeforeScroll) {
          expect(
            tailBeforeScroll.y + tailBeforeScroll.height,
            `${width}px long-thread tail must begin outside the scroller view`,
          ).toBeGreaterThan(viewportBeforeScroll.y + viewportBeforeScroll.height + 1)
        }
        await backToLatest.click()
        await expect(backToLatest).toHaveAttribute("data-active", "false")
        await expect(backToLatest).toHaveAttribute("inert", "")
        await expect
          .poll(
            async () => {
              const [tailBox, viewportBox, composerBox] = await Promise.all([
                tailMarker.boundingBox(),
                viewport.boundingBox(),
                composer.boundingBox(),
              ])
              if (!tailBox || !viewportBox || !composerBox) return false
              const tailBottom = tailBox.y + tailBox.height
              return (
                tailBox.y >= viewportBox.y - 1
                && tailBottom <= viewportBox.y + viewportBox.height + 1
                && tailBottom <= composerBox.y + 1
              )
            },
            { message: `${width}px Back to latest must settle with the tail unobscured` },
          )
          .toBe(true)
      } else {
        await tailMarker.scrollIntoViewIfNeeded()
      }
      await expect(tailMarker).toBeVisible()
      await expect.poll(() => readingAxisDrift(page), { message: `${width}px long-thread reading-axis drift` }).toBeLessThanOrEqual(1)

      const geometry = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }))
      expect(geometry.scrollWidth, `${width}px long-thread horizontal overflow`).toBeLessThanOrEqual(geometry.clientWidth)

      const tailBox = await tailMarker.boundingBox()
      const markdownBox = await markdown.boundingBox()
      const contentBox = await content.boundingBox()
      const viewportBox = await viewport.boundingBox()
      const composerBox = await composer.boundingBox()
      expect(tailBox, `${width}px long-thread tail must be measurable`).not.toBeNull()
      expect(markdownBox, `${width}px long Markdown must be measurable`).not.toBeNull()
      expect(contentBox, `${width}px message content must be measurable`).not.toBeNull()
      expect(viewportBox, `${width}px message viewport must be measurable`).not.toBeNull()
      expect(composerBox, `${width}px Composer must be measurable`).not.toBeNull()
      if (tailBox && markdownBox && contentBox && viewportBox && composerBox) {
        expect(markdownBox.x, `${width}px long Markdown must stay inside the content left edge`).toBeGreaterThanOrEqual(contentBox.x - 1)
        expect(markdownBox.x + markdownBox.width, `${width}px long Markdown must stay inside the content right edge`).toBeLessThanOrEqual(contentBox.x + contentBox.width + 1)
        expect(tailBox.y, `${width}px long-thread tail must stay below the scroller top`).toBeGreaterThanOrEqual(viewportBox.y - 1)
        expect(tailBox.y + tailBox.height, `${width}px long-thread tail must be visible inside the scroller`).toBeLessThanOrEqual(viewportBox.y + viewportBox.height + 1)
        expect(tailBox.y + tailBox.height, `${width}px Composer must not cover the long-thread tail`).toBeLessThanOrEqual(composerBox.y + 1)
      }

      await page.screenshot({ path: testInfo.outputPath(`thread-long-${width}.png`), fullPage: true })
    }

    await page.setViewportSize({ width: 1280, height: 900 })
    await chatInput.fill("Second turn after the long answer")
    await page.getByRole("button", { name: "Send message" }).click()
    await expect(page.getByText("预览模式：已收到「Second turn after the long answer」。", { exact: true })).toBeVisible()
    await expect(composer).toHaveAttribute("data-state", "idle")

    const items = page.locator('[data-slot="message-scroller-item"]')
    await expect.poll(() => items.count()).toBeGreaterThanOrEqual(4)
    const itemCount = await items.count()
    const finalTurnBoxes = await Promise.all(
      Array.from({ length: 4 }, (_value, index) => items.nth(itemCount - 4 + index).boundingBox()),
    )
    for (const [index, box] of finalTurnBoxes.entries()) {
      expect(box, `final conversation item ${index + 1} must be measurable`).not.toBeNull()
    }
    const measurableBoxes = finalTurnBoxes.filter((box): box is NonNullable<typeof box> => box !== null)
    if (measurableBoxes.length === 4) {
      for (let index = 1; index < measurableBoxes.length; index += 1) {
        const previousBox = measurableBoxes[index - 1]!
        const currentBox = measurableBoxes[index]!
        const gap = currentBox.y - previousBox.y - previousBox.height
        expect(gap, `final conversation gap ${index} must keep the 28px rhythm`).toBeCloseTo(28, 0)
      }
    }
    await page.screenshot({ path: testInfo.outputPath("thread-two-turn-1280.png"), fullPage: true })
  })

  test("R137 keeps the in-flight answer streaming when a safe process is the newest segment", async ({ page }, testInfo) => {
    test.skip(Boolean(process.env.KOKORO_E2E_BASE_URL?.trim()), "the deterministic preview stream is available only on the local preview server")

    await page.goto("/app", { waitUntil: "networkidle" })
    await page.evaluate(() => {
      type Evidence = { answer: string; formingCount: number; streamingCount: number }
      const target = window as typeof window & {
        __r137EmptyFormingGap?: boolean
        __r137SawForming?: boolean
        __r137StreamingEvidence?: Evidence
      }
      const inspect = () => {
        const article = document.querySelector<HTMLElement>('article')
        const formingCount = article?.querySelectorAll('[data-state="forming"]').length ?? 0
        if (formingCount > 0) target.__r137SawForming = true
        if (target.__r137SawForming && article && formingCount === 0 &&
          document.querySelector('[data-slot="message-scroller"][data-state="streaming"]') &&
          !article.textContent?.includes("预览模式：已收到")) {
          target.__r137EmptyFormingGap = true
        }
        if (target.__r137StreamingEvidence !== undefined) return true
        const streaming = [...document.querySelectorAll<HTMLElement>('article [data-state="streaming"]')]
        const answer = streaming.find((element) => element.textContent?.includes("预览模式：已收到"))
        if (!answer) return false
        target.__r137StreamingEvidence = {
          answer: answer.textContent ?? "",
          formingCount: document.querySelectorAll('article [data-state="forming"]').length,
          streamingCount: streaming.length,
        }
        return true
      }
      const observer = new MutationObserver(() => {
        if (inspect()) observer.disconnect()
      })
      observer.observe(document.body, { attributes: true, childList: true, characterData: true, subtree: true })
      inspect()
    })

    const prompt = "R137 safe process streaming answer"
    await page.getByRole("textbox", { name: "Chat input" }).fill(prompt)
    await page.getByRole("button", { name: "Send message" }).click()

    await expect.poll(() => page.evaluate(() => {
      const target = window as typeof window & {
        __r137StreamingEvidence?: { answer: string; formingCount: number; streamingCount: number }
      }
      return target.__r137StreamingEvidence ?? null
    }), { message: "the real answer must own the single in-flight streaming state" }).toEqual({
      answer: expect.stringContaining("预览模式：已收到"),
      formingCount: 0,
      streamingCount: 1,
    })
    await expect(page.getByText(`预览模式：已收到「${prompt}」。`, { exact: true })).toBeVisible()
    await expect(page.locator('article [data-state="forming"]')).toHaveCount(0)
    expect(await page.evaluate(() => {
      const target = window as typeof window & { __r137EmptyFormingGap?: boolean }
      return target.__r137EmptyFormingGap ?? false
    }), "TEXT_MESSAGE_START must retain the forming answer until real text arrives").toBe(false)
    await page.screenshot({ path: testInfo.outputPath(`r137-completed-answer-${testInfo.project.name}.png`), fullPage: true })
  })

  for (const decision of [
    { button: "Approve", terminalStatus: "completed" },
    { button: "Reject", terminalStatus: "failed" },
  ] as const) {
    test(`R137 ${decision.button.toLowerCase()} settles the same safe tool activity`, async ({ page }, testInfo) => {
      test.skip(Boolean(process.env.KOKORO_E2E_BASE_URL?.trim()), "the deterministic preview HITL stream is available only on the local preview server")

      await page.goto("/app", { waitUntil: "networkidle" })
      await page.getByRole("textbox", { name: "Chat input" }).fill(`!hitl R137 ${decision.button.toLowerCase()}`)
      await page.getByRole("button", { name: "Send message" }).click()

      const toolActivity = page.locator('[aria-label="Tool call"] [data-status]')
      await expect(toolActivity).toHaveCount(1)
      await expect(toolActivity).toHaveAttribute("data-status", "running")
      await page.getByRole("button", { name: decision.button, exact: true }).click()

      await expect(toolActivity).toHaveCount(1)
      await expect(toolActivity).toHaveAttribute("data-status", decision.terminalStatus)
      await expect(page.locator('[aria-label="Tool call"] [data-status="running"]')).toHaveCount(0)
      const processDisclosure = page.locator("article").filter({ has: toolActivity }).locator('button[aria-expanded="false"]')
      await expect(processDisclosure).toHaveCount(1)
      await processDisclosure.click()
      await expect(toolActivity).toBeVisible()
      await expect(toolActivity).toContainText(decision.terminalStatus === "completed" ? "Completed" : "Failed")
      await expect(toolActivity).not.toContainText("Running")
      await page.screenshot({
        path: testInfo.outputPath(`r137-${decision.button.toLowerCase()}-${testInfo.project.name}.png`),
        fullPage: true,
      })
    })
  }
})
