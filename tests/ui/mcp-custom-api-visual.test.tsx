import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { chromium, type Browser, type Page } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import { basename, join } from "node:path"
import { createServer } from "vite"
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { LocaleProvider } from "@/i18n/context"
import { CustomApiForm } from "@/ui/mcp/custom-api-form"
import apiStyles from "@/ui/mcp/custom-api-form.module.css"
import { createCustomApiCreateFlow } from "@/ui/mcp/custom-api-create-flow"
import frameStyles from "@/ui/mcp/mcp-create-dialog.module.css"
import iconStyles from "@/ui/mcp/mcp-icon-picker.module.css"

let browser: Browser
let css: string[]
const pages: Page[] = []

beforeAll(async () => {
  const modules: Record<string, Record<string, string>> = {
    "custom-api-form.module.css": apiStyles,
    "mcp-create-dialog.module.css": frameStyles,
    "mcp-icon-picker.module.css": iconStyles,
  }
  const vite = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, hmr: false, watch: null }, css: { modules: { generateScopedName: (name, filename) => modules[basename(filename.replace(/\?.*$/u, ""))]?.[name] ?? name } } })
  try {
    css = await Promise.all(["/src/app/globals.css", ...Object.keys(modules).map(name => `/src/ui/mcp/${name}`)].map(async path => {
      const result = await vite.transformRequest(`${path}?inline`)
      const json = result?.code.match(/export default ([\s\S]*?);?\s*$/u)?.[1]
      if (!json) throw Error("CSS compilation missing inline output")
      return JSON.parse(json.replace(/;\s*$/u, "")) as string
    }))
  } finally { await vite.close() }
  browser = await chromium.launch({ headless: true })
}, 20_000)

afterEach(async () => {
  cleanup()
  window.localStorage.removeItem("kokoro.locale")
  await Promise.all(pages.splice(0).map(page => page.close()))
})
afterAll(async () => { await browser?.close() })

// Actual component markup and compiled production CSS, without live services or owner writes.
async function fixture(width: number, height: number, extraSecrets = 0, helpOpen = false) {
  window.localStorage.setItem("kokoro.locale", "zh")
  const boundary = { admitted: true, subject: "api-visual-fixture", generation: 1 }
  const createCustomApi = vi.fn()
  const flow = createCustomApiCreateFlow({ client: { createCustomApi }, boundary, onConfirmed: vi.fn() })
  render(<LocaleProvider><Dialog open><DialogContent className={frameStyles.customApiDialog}>
    <DialogTitle className="sr-only">API visual fixture</DialogTitle>
    <CustomApiForm flow={flow} boundary={boundary} onCancel={vi.fn()} onDone={async () => undefined} />
  </DialogContent></Dialog></LocaleProvider>)
  for (let index = 0; index < extraSecrets; index++) fireEvent.click(screen.getByRole("button", { name: "添加密钥" }))
  // Enable Save through the real form, so Tab navigation can exercise the footer.
  fireEvent.change(screen.getByRole("textbox", { name: /^名称$/u }), { target: { value: "API visual fixture" } })
  fireEvent.change(screen.getAllByRole("textbox", { name: "密钥名称" })[0]!, { target: { value: "QA_VISUAL_KEY" } })
  fireEvent.change(screen.getAllByRole("textbox", { name: /^值$/u })[0]!, { target: { value: "qa-public-visual-value" } })
  if (helpOpen) fireEvent.click(screen.getByRole("button", { name: "密钥名称帮助" }))
  const help = document.querySelector('[data-slot="popover-content"]')
  const dialog = document.querySelector('[data-slot="dialog-content"]')
  if (!dialog) throw Error("API fixture dialog missing")
  const page = await browser.newPage({ viewport: { width, height } })
  pages.push(page)
  await page.route("**/*", route => route.abort())
  await page.setContent(`<!doctype html><html><head><style>${css.join("\n")}</style></head><body data-web-skin="kokoro">${dialog.outerHTML}${help?.outerHTML ?? ""}</body></html>`)
  const editor = page.locator('[data-slot="dialog-content"]')
  const evidence = process.env.KOKORO_VISUAL_EVIDENCE_DIR
  if (evidence) {
    await mkdir(evidence, { recursive: true })
    await page.screenshot({ path: join(evidence, `custom-api-isolated-${width}x${height}-${extraSecrets}.png`) })
  }
  expect(createCustomApi).not.toHaveBeenCalled()
  return { page, editor }
}

it("matches measured API intrinsic frame, field offsets and local controls", async () => {
  const { page, editor } = await fixture(1280, 900)
  expect(await editor.boundingBox()).toMatchObject({ x: 340, y: 60, width: 600, height: 780 })
  const header = editor.locator("header")
  expect((await header.boundingBox())!.height).toBe(74)
  expect(await header.locator("p").evaluate(element => getComputedStyle(element).margin)).toBe("0px")
  expect(await editor.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(248, 248, 247)")
  const fields = editor.locator("input:not([type=file]), textarea")
  for (const [index, top] of [102, 286, 475, 555].entries()) {
    const field = fields.nth(index)
    expect((await field.boundingBox())!.y - 60).toBe(top)
    expect(await field.evaluate(element => {
      const style = getComputedStyle(element)
      return { radius: style.borderRadius, size: style.fontSize, line: style.lineHeight, padding: style.padding }
    })).toEqual({ radius: index % 2 ? "10px" : "8px", size: "14px", line: index % 2 ? "22px" : "20px", padding: index % 2 ? "8px 12px 8px 16px" : "8px 12px" })
  }
  expect(await editor.locator("textarea").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))).toEqual([100, 80])
  const footer = editor.locator("footer")
  expect((await footer.boundingBox())!.height).toBe(76)
  expect(await footer.evaluate(element => getComputedStyle(element).borderTopWidth)).toBe("0px")
  for (const button of await footer.locator("button").all()) expect(await button.boundingBox()).toMatchObject({ width: 72, height: 36 })
  expect(await footer.locator("button").first().evaluate(element => {
    const style = getComputedStyle(element)
    return { outline: style.outline, background: style.backgroundColor, shadow: style.boxShadow }
  })).toEqual({ outline: "rgba(0, 0, 0, 0.12) solid 1px", background: "rgba(0, 0, 0, 0)", shadow: "none" })
  const close = editor.locator('[data-slot="dialog-close"]')
  expect(await close.boundingBox()).toMatchObject({ x: 900, y: 80, width: 28, height: 28 })
  const name = fields.first()
  await name.focus()
  await expect.poll(() => name.evaluate(element => getComputedStyle(element).boxShadow)).toBe("rgba(0, 0, 0, 0.14) 0px 0px 0px 1px inset")
  // Radix autofocus also matches :focus-visible: preserve the measured thin inset,
  // rather than adding an unmatched outer ring on initial open.
  expect(await name.evaluate(element => getComputedStyle(element).outlineStyle)).toBe("none")
  await footer.locator("button").first().focus()
  expect(await footer.locator("button").first().evaluate(element => {
    const style = getComputedStyle(element)
    return { outline: style.outlineWidth, offset: style.outlineOffset }
  })).toEqual({ outline: "2px", offset: "2px" })
  await page.evaluate(() => document.body.style.setProperty("--settings-surface", "#242424"))
  expect(await editor.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(36, 36, 36)")
})

it.each([[652, 767, 0], [390, 400, 0], [390, 400, 2], [1280, 1200, 2], [1280, 1600, 1]])("API %ix%i with %i extra secrets keeps one body scroll and keyboard-reachable actions", async (width, height, extraSecrets) => {
  const { page, editor } = await fixture(width, height, extraSecrets)
  const bounds = (await editor.boundingBox())!
  expect(bounds.width).toBeLessThanOrEqual(width * 0.95)
  expect(bounds.height).toBeCloseTo(Math.min(extraSecrets ? 780 + extraSecrets * 238 : 780, height * 0.95), 1)
  expect(bounds.y).toBeGreaterThanOrEqual(0)
  const body = editor.locator(`.${apiStyles.body}`)
  expect(await editor.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1)
  expect(await editor.locator("form").evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  await body.evaluate(element => { element.scrollTop = element.scrollHeight })
  // Every editable field is reachable by focus/scroll, including the middle notes.
  for (const field of await editor.locator("input:not([type=file]), textarea").all()) {
    await field.scrollIntoViewIfNeeded()
    await field.focus()
    const fieldBounds = (await field.boundingBox())!
    const visibleBody = (await body.boundingBox())!
    expect(fieldBounds.y).toBeGreaterThanOrEqual(visibleBody.y)
    expect(fieldBounds.y + fieldBounds.height).toBeLessThanOrEqual(visibleBody.y + visibleBody.height + 1)
  }
  const last = editor.locator("textarea").last()
  await last.focus()
  const lastBounds = (await last.boundingBox())!
  const bodyBounds = (await body.boundingBox())!
  expect(lastBounds.y).toBeGreaterThanOrEqual(bodyBounds.y)
  expect(lastBounds.y + lastBounds.height).toBeLessThanOrEqual(bodyBounds.y + bodyBounds.height + 1)
  // Native Tab order through the real DOM, without a test-only scroll or footer positioning shim.
  const save = editor.getByRole("button", { name: "保存", exact: true })
  for (let index = 0; index < 12 && !await save.evaluate(element => element === document.activeElement); index++) await page.keyboard.press("Tab")
  expect(await save.evaluate(element => element === document.activeElement)).toBe(true)
  const saveBounds = (await save.boundingBox())!
  expect(saveBounds.y + saveBounds.height).toBeLessThanOrEqual(height)
  expect(saveBounds.y).toBeGreaterThanOrEqual(0)
})


it("matches shared picker, optional label and independently framed secret rows with hover/keyboard/touch removal", async () => {
  const { page, editor } = await fixture(1280, 1600, 1)
  const preview = editor.locator(`.${iconStyles.preview}`)
  expect(await preview.boundingBox()).toMatchObject({ width: 60, height: 60 })
  expect(await preview.locator("svg").boundingBox()).toMatchObject({ width: 24, height: 24 })
  expect(await preview.locator("svg").getAttribute("class")).toContain("lucide-image")
  expect(await preview.locator("svg").getAttribute("class")).not.toContain("image-plus")
  expect(await preview.evaluate(element => {
    const style = getComputedStyle(element)
    return { border: style.border, radius: style.borderRadius, fill: style.backgroundColor, color: style.color }
  })).toEqual({ border: "1px dashed rgba(0, 0, 0, 0.14)", radius: "10px", fill: "rgba(55, 53, 47, 0.04)", color: "rgb(166, 166, 166)" })
  const upload = editor.getByRole("button", { name: "上传", exact: true })
  expect(await upload.boundingBox()).toMatchObject({ width: 66, height: 32 })
  expect((await upload.locator("svg").boundingBox())!.width).toBe(16)
  expect(await editor.locator(`.${iconStyles.copy}`).evaluate(element => getComputedStyle(element).gap)).toBe("8px")
  expect(await upload.evaluate(element => {
    const style = getComputedStyle(element)
    return { border: style.borderWidth, outline: style.outline, background: style.backgroundColor, shadow: style.boxShadow }
  })).toEqual({ border: "0px", outline: "rgba(0, 0, 0, 0.12) solid 1px", background: "rgba(0, 0, 0, 0)", shadow: "none" })
  const optional = editor.locator('label[for="custom-api-instructions"] span')
  const notesLabel = optional.locator("..")
  const mainLabelWidth = await notesLabel.evaluate(element => {
    const text = element.firstChild
    if (!text) throw Error("notes label text missing")
    const range = document.createRange()
    range.selectNodeContents(text)
    return range.getBoundingClientRect().width
  })
  // Match zero inter-label gap without assuming a particular CJK font's glyph width.
  expect((await optional.boundingBox())!.x - (await notesLabel.boundingBox())!.x).toBeCloseTo(mainLabelWidth, 3)
  expect(await notesLabel.evaluate(element => getComputedStyle(element).fontWeight)).toBe("500")
  expect(await optional.evaluate(element => getComputedStyle(element).fontWeight)).toBe("400")
  expect(await optional.evaluate(element => getComputedStyle(element).color)).toBe("rgb(115, 115, 115)")
  const rows = editor.locator(`.${apiStyles.environmentRow}`)
  expect(await rows.count()).toBe(2)
  for (const row of await rows.all()) {
    expect(await row.evaluate(element => {
      const style = getComputedStyle(element)
      return { radius: style.borderRadius, padding: style.padding, border: style.borderWidth }
    })).toEqual({ radius: "12px", padding: "16px", border: "1px" })
    const remove = row.getByRole("button", { name: /^移除密钥/u })
    expect(await remove.boundingBox()).toMatchObject({ width: 36, height: 36 })
    expect(await remove.evaluate(element => getComputedStyle(element).opacity)).toBe("0")
    await row.hover()
    expect(await remove.evaluate(element => getComputedStyle(element).opacity)).toBe("1")
    expect((await remove.locator("svg").boundingBox())!.width).toBe(20)
    await page.mouse.move(0, 0)
    await remove.focus()
    expect(await remove.evaluate(element => getComputedStyle(element).opacity)).toBe("1")
    await remove.evaluate(element => (element as HTMLElement).blur())
  }
  const close = editor.locator('[data-slot="dialog-close"] svg')
  expect((await close.boundingBox())!.width).toBe(20)
  const touch = await browser.newContext({ viewport: { width: 390, height: 400 }, isMobile: true, hasTouch: true })
  try {
    const touchPage = await touch.newPage()
    await touchPage.setContent(await page.content())
    expect(await touchPage.locator(`.${apiStyles.environmentRow} button`).first().evaluate(element => getComputedStyle(element).opacity)).toBe("1")
  } finally { await touch.close() }
})


it("keeps the inline help glyph and measured readable help surface", async () => {
  const { page, editor } = await fixture(652, 767, 0, true)
  const help = editor.getByRole("button", { name: "密钥名称帮助" })
  expect(await help.locator("svg").boundingBox()).toMatchObject({ width: 12, height: 12 })
  const content = page.locator('[data-slot="popover-content"]')
  expect(await content.evaluate(element => {
    const style = getComputedStyle(element)
    return { maxWidth: style.maxWidth, padding: style.padding, radius: style.borderRadius, border: style.border, background: style.backgroundColor, color: style.color, size: style.fontSize, line: style.lineHeight, shadow: style.boxShadow }
  })).toEqual({ maxWidth: "280px", padding: "4px 8px", radius: "8px", border: "1px solid rgba(255, 255, 255, 0.22)", background: "rgba(0, 0, 0, 0.9)", color: "rgb(255, 255, 255)", size: "12px", line: "16px", shadow: "none" })
  await page.evaluate(() => document.documentElement.classList.add("dark"))
  expect(await content.evaluate(element => getComputedStyle(element).color)).toBe("rgb(255, 255, 255)")
})
