import { chromium } from "@playwright/test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createServer } from "vite"
import { expect, it } from "vitest"

// Isolated hydrated component, not the normal App or a real owner journey.
it("restores native Chromium retry focus after disabled blur, without reclaiming focus the user moved", async () => {
  const fixtureId = "\0mcp-read-focus-fixture.js"
  // Other Vite fixtures have different optimizer hashes. Never share their
  // cache: initialization may remove modules this hydrated page is loading.
  const cacheDir = await mkdtemp(join(tmpdir(), "kokoro-mcp-read-retry-"))
  let vite: Awaited<ReturnType<typeof createServer>> | undefined
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  const diagnostics: string[] = []
  try {
    vite = await createServer({ configFile: false, root: process.cwd(), cacheDir,
    resolve: { alias: { "@": join(process.cwd(), "src") } }, esbuild: { jsx: "automatic" },
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
    plugins: [{ name: "mcp-read-focus-fixture", resolveId: id => id === "virtual:mcp-read-focus-fixture" ? fixtureId : undefined,
      load: id => id === fixtureId ? `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { McpReadFeedback } from '/src/ui/mcp/mcp-read-feedback.tsx';
        import '/src/app/globals.css';
        function Fixture() {
          const [busy, setBusy] = React.useState(false);
          const [count, setCount] = React.useState(0);
          window.failRetry = () => setBusy(false);
          return React.createElement('main', null,
            React.createElement('input', { 'aria-label': 'Other control' }),
            React.createElement('output', { 'data-testid': 'reads' }, count),
            React.createElement(McpReadFeedback, { message: 'Directory failed', retryLabel: 'Retry directory', busy,
              onRetry: () => { setBusy(true); setCount(value => value + 1); } }));
        }
        createRoot(document.getElementById('root')).render(React.createElement(Fixture));
      ` : undefined,
      configureServer: server => { server.middlewares.use((request, response, next) => {
        if (request.url !== "/__mcp-read-focus") { next(); return }
        response.setHeader("Content-Type", "text/html")
        response.end('<!doctype html><html><body data-web-skin="kokoro"><div id="root"></div><script type="module" src="/@id/virtual:mcp-read-focus-fixture"></script></body></html>')
      }) } }],
  })
    await vite.listen()
    const address = vite.httpServer!.address()
    if (!address || typeof address === "string") throw Error("Missing fixture port")
    const origin = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    page.on("pageerror", error => { diagnostics.push(`pageerror: ${error.message}`) })
    page.on("console", message => { if (message.type() === "error") diagnostics.push(`console: ${message.text()}`) })
    page.on("response", response => { if (response.status() >= 400) diagnostics.push(`HTTP ${response.status()}: ${response.url()}`) })
    page.on("requestfailed", request => { diagnostics.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? "unknown"}`) })
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
    await page.goto(`${origin}/__mcp-read-focus`)
    const retry = page.getByRole("button", { name: "Retry directory" })
    await retry.waitFor()
    const observations: { move: string; pendingFocus: string; retryFocusedAfterFailure: boolean }[] = []
    for (const move of ["none", "input", "pointer", "tab"] as const) {
      await retry.focus()
      await retry.press("Enter")
      await expect.poll(() => retry.isDisabled()).toBe(true)
      expect(await retry.evaluate(element => element.isConnected)).toBe(true)
      const pendingFocus = await page.evaluate(() => document.activeElement?.tagName ?? "none")
      if (move === "input") {
        await page.getByRole("textbox").focus()
        await page.getByRole("textbox").evaluate(element => (element as HTMLInputElement).blur())
      } else if (move === "pointer") await page.mouse.click(900, 700)
      else if (move === "tab") await page.keyboard.press("Tab")
      await page.evaluate(() => (window as Window & { failRetry?: () => void }).failRetry?.())
      await expect.poll(() => retry.isEnabled()).toBe(true)
      const retryFocusedAfterFailure = await retry.evaluate(element => element === document.activeElement)
      expect(retryFocusedAfterFailure).toBe(move === "none")
      observations.push({ move, pendingFocus, retryFocusedAfterFailure })
    }
    expect(await page.getByTestId("reads").textContent()).toBe("4")
    const evidence = process.env.KOKORO_VISUAL_EVIDENCE_DIR
    if (evidence) {
      await mkdir(evidence, { recursive: true })
      await writeFile(join(evidence, "mcp-read-retry-hydrated-chromium.json"), JSON.stringify({
        scope: "isolated hydrated McpReadFeedback, no normal App or real owner", observations,
      }, null, 2))
    }
  } catch (error) {
    throw new Error(`Hydrated retry fixture failed. Browser diagnostics:\n${diagnostics.join("\n") || "No browser errors captured"}`, { cause: error })
  } finally {
    try { await browser?.close() }
    finally {
      try { await vite?.close() }
      finally { await rm(cacheDir, { recursive: true, force: true }) }
    }
  }
}, 40_000)
