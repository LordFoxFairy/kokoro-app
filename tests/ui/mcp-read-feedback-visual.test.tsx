import { cleanup, render } from "@testing-library/react"
import { chromium, type Browser } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import { basename, join } from "node:path"
import { createServer } from "vite"
import { afterAll, afterEach, beforeAll, expect, it } from "vitest"

import { McpReadFeedback } from "@/ui/mcp/mcp-read-feedback"
import styles from "@/ui/mcp/mcp-projection-read.module.css"

let browser: Browser
let css: string[]
beforeAll(async () => {
  const modules: Record<string, Record<string, string>> = { "mcp-projection-read.module.css": styles }
  const vite = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, hmr: false, watch: null },
    css: { modules: { generateScopedName: (name, filename) => modules[basename(filename.replace(/\?.*$/u, ""))]?.[name] ?? name } } })
  try {
    css = await Promise.all(["/src/app/globals.css", "/src/ui/mcp/mcp-projection-read.module.css"].map(async path => {
      const result = await vite.transformRequest(`${path}?inline`)
      const json = result?.code.match(/export default ([\s\S]*?);?\s*$/u)?.[1]
      if (!json) throw Error("CSS compilation missing inline output")
      return JSON.parse(json.replace(/;\s*$/u, "")) as string
    }))
  } finally { await vite.close() }
  browser = await chromium.launch({ headless: true })
}, 20_000)
afterEach(cleanup)
afterAll(async () => { await browser?.close() })

// Static markup from the actual component with production CSS. React events,
// live data and retry focus settlement are covered separately, not by this page.
it.each([390, 1280])("keeps local read errors visible and keyboard reachable at %spx", async width => {
  const { container } = render(<main className={styles.body}>
    <McpReadFeedback message="连接器目录加载失败" retryLabel="重新加载连接器目录" onRetry={() => undefined} />
    <McpReadFeedback message="连接关系加载失败，已加载的连接器继续保留。" retryLabel="重新加载连接关系" onRetry={() => undefined} busy />
    <McpReadFeedback message="自定义 API 加载失败" retryLabel="重新加载自定义 API" onRetry={() => undefined} />
  </main>)
  const page = await browser.newPage({ viewport: { width, height: 844 } })
  try {
    await page.route("**/*", route => route.abort())
    await page.setContent(`<!doctype html><html><head><style>${css.join("\n")}</style></head><body data-web-skin="kokoro">${container.innerHTML}</body></html>`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const row of await page.getByRole("status").all()) {
      const bounds = (await row.boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
      const button = (await row.getByRole("button").boundingBox())!
      expect(button.x + button.width).toBeLessThanOrEqual(width)
    }
    await page.keyboard.press("Tab")
    expect(await page.getByRole("button", { name: "重新加载连接器目录" }).evaluate(node => node === document.activeElement)).toBe(true)
    await page.keyboard.press("Tab")
    expect(await page.getByRole("button", { name: "重新加载自定义 API" }).evaluate(node => node === document.activeElement)).toBe(true)
    expect(await page.getByRole("button", { name: "重新加载连接关系" }).isDisabled()).toBe(true)
    const evidence = process.env.KOKORO_VISUAL_EVIDENCE_DIR
    if (evidence) {
      await mkdir(evidence, { recursive: true })
      await page.screenshot({ path: join(evidence, `mcp-read-feedback-static-${width}x844.png`) })
    }
  } finally { await page.close() }
}, 20_000)
