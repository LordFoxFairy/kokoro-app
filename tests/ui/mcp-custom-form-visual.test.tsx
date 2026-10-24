import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { chromium } from "@playwright/test"
import { createServer } from "vite"
import { mkdir } from "node:fs/promises"
import { basename, join } from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { LocaleProvider } from "@/i18n/context"
import { CustomMcpDetailDialog } from "@/ui/mcp/custom-mcp-detail-dialog"
import detailStyles from "@/ui/mcp/custom-mcp-detail-dialog.module.css"
import { CustomMcpForm } from "@/ui/mcp/mcp-custom-form"
import { createMcpServerCreationFlow } from "@/ui/mcp/mcp-server-creation-flow"
import { createMcpPreparationCommands } from "@/ui/mcp/mcp-preparation-commands"
import formStyles from "@/ui/mcp/mcp-custom-form.module.css"
import frameStyles from "@/ui/mcp/mcp-create-dialog.module.css"
import settingsStyles from "@/ui/settings/settings-modal.module.css"

afterEach(() => { cleanup(); window.localStorage.removeItem("kokoro.locale") })

// Real component DOM and compiled production CSS; this is not a live-owner journey.
it("matches measured custom MCP surface, plain URL input, label hierarchy and notes radius without changing its frame", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const boundary = { admitted: true, subject: "visual-fixture", generation: 1 }
  const client = { registerPrivateMcpServer: vi.fn(), preparePrivateMcpServer: vi.fn(), getPrivateMcpServer: vi.fn(), getMcpConnector: vi.fn(), beginMcpConnectorAuthorization: vi.fn() }
  const flow = createMcpServerCreationFlow({ client, boundary, onChanged: vi.fn(), preparation: createMcpPreparationCommands({ client, boundary, canPrepare: () => true, onConfirmed: vi.fn() }) })
  render(<LocaleProvider><Dialog open><DialogContent className={frameStyles.registerDialog}><CustomMcpForm flow={flow} boundary={boundary} onCancel={vi.fn()} onDone={async () => undefined} /></DialogContent></Dialog></LocaleProvider>)
  const dialog = document.querySelector('[data-slot="dialog-content"]')
  if (!dialog) throw Error("fixture dialog missing")
  const modules: Record<string, Record<string, string>> = { "mcp-custom-form.module.css": formStyles, "mcp-create-dialog.module.css": frameStyles, "settings-modal.module.css": settingsStyles }
  const vite = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, hmr: false, watch: null }, css: { modules: { generateScopedName: (name, filename) => modules[basename(filename.replace(/\?.*$/u, ""))]?.[name] ?? name } } })
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    browser = await chromium.launch({ headless: true })
    const css = await Promise.all(["/src/app/globals.css", "/src/ui/mcp/mcp-custom-form.module.css", "/src/ui/mcp/mcp-create-dialog.module.css", "/src/ui/settings/settings-modal.module.css"].map(async path => {
      const result = await vite.transformRequest(`${path}?inline`)
      const json = result?.code.match(/export default ([\s\S]*?);?\s*$/u)?.[1]
      if (!json) throw Error("CSS compilation missing inline output")
      return JSON.parse(json.replace(/;\s*$/u, "")) as string
    }))
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.route("**/*", route => route.abort())
    await page.setContent(`<!doctype html><html><head><style>${css.join("\n")}</style></head><body data-web-skin="kokoro"><div data-slot="dialog-content" class="${settingsStyles.dialogContent} fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>${dialog.outerHTML}</body></html>`)
    const editor = page.locator('[data-slot="dialog-content"]').filter({ has: page.locator("form") })
    const expectedShadow = await page.locator(`.${settingsStyles.dialogContent}`).evaluate(element => getComputedStyle(element).boxShadow)
    expect(await editor.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(248, 248, 247)")
    expect(await editor.evaluate(element => getComputedStyle(element).boxShadow)).toBe(expectedShadow)
    expect(await editor.boundingBox()).toMatchObject({ x: 340, y: 93, width: 600, height: 714 })
    const url = editor.getByRole("textbox", { name: "服务器 URL" })
    expect(await url.evaluate(element => element.parentElement?.querySelectorAll("svg").length)).toBe(0)
    expect(await url.evaluate(element => getComputedStyle(element).paddingLeft)).toBe("12px")
    expect(await url.boundingBox()).toMatchObject({ x: 360, y: 505, width: 560, height: 36 })
    const legend = editor.locator("legend")
    expect(await legend.evaluate(element => { const style = getComputedStyle(element); return { size: style.fontSize, weight: style.fontWeight, line: style.lineHeight } })).toEqual({ size: "14px", weight: "500", line: "20px" })
    expect(await legend.locator("span").evaluate(element => getComputedStyle(element).fontWeight)).toBe("400")
    expect(await editor.locator("textarea").evaluate(element => getComputedStyle(element).borderRadius)).toBe("10px")
    expect(await editor.getByRole("button", { name: "上传", exact: true }).isDisabled()).toBe(true)
    expect(await editor.getByRole("textbox", { name: "传输类型" }).inputValue()).toBe("HTTP")
    const evidence = process.env.KOKORO_VISUAL_EVIDENCE_DIR
    if (evidence) { await mkdir(evidence, { recursive: true }); await editor.screenshot({ path: join(evidence, "custom-mcp-form-isolated-desktop.png") }) }
    await page.evaluate(() => document.body.style.setProperty("--settings-surface", "#242424"))
    expect(await editor.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(36, 36, 36)")
    expect(client.registerPrivateMcpServer).not.toHaveBeenCalled()
  } finally {
    try { await browser?.close() } finally { await vite.close() }
  }
}, 20_000)

// Compiled production CSS and real component markup, with explicit UI-only state.
// The geometry regression protects error feedback without invoking an owner command.
it.each(["unknown", "trial"] as const)("configuration %s feedback keeps short-screen actions inside the viewport", async scenario => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const props: Parameters<typeof CustomMcpDetailDialog>[0] = {
    connector: { availability: "available", connector_id: "owned-connector", server_id: "owned-server", provider_key: "owned-provider", connector_type: "mcp", display_name: "QA MCP", status: "active", enabled: true, approved_scopes: [], state_version: "2" },
    server: { availability: "available", server_id: "owned-server", display_name: "QA MCP", server_url: "https://mcp.example.test/mcp", status: "registered", state_version: "3", headers: [], prepare_status: "ready", declarations: [], declarations_available: true, connection_id: "exact-runtime-connection" },
    actionId: null, admitted: true, managementCommand: undefined, preparationState: scenario === "unknown" ? "unknown" : "idle",
    onResumeManagement: vi.fn(), actionError: false, deleteId: null, returnFocusRef: { current: null },
    onClose: vi.fn(), onSaveConfiguration: vi.fn(), onPrepare: vi.fn(), onAuthorize: vi.fn(), onDisconnect: vi.fn(),
    onDeleteIntent: vi.fn(), onCancelDelete: vi.fn(), onDelete: vi.fn(), onTrial: () => false,
  }
  render(<LocaleProvider><CustomMcpDetailDialog {...props} /></LocaleProvider>)
  fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  if (scenario === "trial") fireEvent.click(screen.getByRole("button", { name: "试用一下" }))
  const dialog = screen.getByRole("dialog", { name: "MCP 配置" })
  expect(screen.getAllByRole("alert").length).toBeGreaterThan(0)
  const vite = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, hmr: false, watch: null }, css: { modules: { generateScopedName: (name, filename) => basename(filename.replace(/\?.*$/u, "")) === "custom-mcp-detail-dialog.module.css" ? detailStyles[name] ?? name : name } } })
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    const css = await Promise.all(["/src/app/globals.css", "/src/ui/mcp/custom-mcp-detail-dialog.module.css"].map(async path => {
      const result = await vite.transformRequest(`${path}?inline`)
      const json = result?.code.match(/export default ([\s\S]*?);?\s*$/u)?.[1]
      if (!json) throw Error("CSS compilation missing inline output")
      return JSON.parse(json.replace(/;\s*$/u, "")) as string
    }))
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 390, height: 400 } })
    await page.route("**/*", route => route.abort())
    await page.setContent(`<!doctype html><html><head><style>${css.join("\n")}</style></head><body data-web-skin="kokoro">${dialog.outerHTML}</body></html>`)
    const save = page.getByRole("button", { name: "保存", exact: true })
    const bounds = await save.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(400)
    const form = screen.getByRole("textbox", { name: "服务器名称" }).closest("form")
    for (const alert of screen.getAllByRole("alert")) expect(form).toContainElement(alert)
    const evidence = process.env.KOKORO_VISUAL_EVIDENCE_DIR
    if (evidence) { await mkdir(evidence, { recursive: true }); await page.screenshot({ path: join(evidence, `configuration-${scenario}-short.png`) }) }
    expect(props.onSaveConfiguration).not.toHaveBeenCalled()
    expect(props.onPrepare).not.toHaveBeenCalled()
  } finally {
    try { await browser?.close() } finally { await vite.close() }
  }
}, 20_000)
