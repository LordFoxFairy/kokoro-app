import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { chromium } from "@playwright/test"
import { createServer } from "vite"
import { mkdir } from "node:fs/promises"
import { basename, join } from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { LocaleProvider } from "@/i18n/context"
import { McpPreparationStatus } from "@/ui/mcp/mcp-preparation-status";
import statusStyles from "@/ui/mcp/mcp-preparation-status.module.css";
import { CustomMcpDetailDialog } from "@/ui/mcp/custom-mcp-detail-dialog"
import detailStyles from "@/ui/mcp/custom-mcp-detail-dialog.module.css"
import { CustomMcpForm } from "@/ui/mcp/mcp-custom-form"
import { createMcpServerCreationFlow } from "@/ui/mcp/mcp-server-creation-flow"
import { createMcpPreparationCommands } from "@/ui/mcp/mcp-preparation-commands"
import formStyles from "@/ui/mcp/mcp-custom-form.module.css"
import iconStyles from "@/ui/mcp/mcp-icon-picker.module.css"
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
  const modules: Record<string, Record<string, string>> = { "mcp-icon-picker.module.css": iconStyles, "mcp-custom-form.module.css": formStyles, "mcp-create-dialog.module.css": frameStyles, "settings-modal.module.css": settingsStyles }
  const vite = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, hmr: false, watch: null }, css: { modules: { generateScopedName: (name, filename) => modules[basename(filename.replace(/\?.*$/u, ""))]?.[name] ?? name } } })
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    browser = await chromium.launch({ headless: true })
    const css = await Promise.all(["/src/app/globals.css", "/src/ui/mcp/mcp-icon-picker.module.css", "/src/ui/mcp/mcp-custom-form.module.css", "/src/ui/mcp/mcp-create-dialog.module.css", "/src/ui/settings/settings-modal.module.css"].map(async path => {
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
    expect(await editor.getByRole("combobox", { name: "传输类型" }).textContent()).toContain("HTTP")
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
    server: { availability: "available", server_id: "owned-server", display_name: "QA MCP", server_url: "https://mcp.example.test/mcp", status: "registered", state_version: "3", headers: [], transport: "streamable_http" as const, prepare_status: "ready", declarations: [], declarations_available: true, connection_id: "exact-runtime-connection" },
    actionId: null, admitted: true, managementCommand: undefined, preparationCanResume: true, preparationState: scenario === "unknown" ? "unknown" : "idle",
    onResumeManagement: vi.fn(), actionError: false, deleteId: null, returnFocusRef: { current: null },
    onClose: vi.fn(), onSaveConfiguration: vi.fn(), onPrepare: vi.fn(), onAuthorize: vi.fn(), onDisconnect: vi.fn(),
    onDeleteIntent: vi.fn(), onCancelDelete: vi.fn(), onDelete: vi.fn(), onTrial: () => false,
  }
  render(<LocaleProvider><CustomMcpDetailDialog {...props} /></LocaleProvider>)
  fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  if (scenario === "trial") fireEvent.click(screen.getByRole("button", { name: "试用一下" }))
  const dialog = screen.getByRole("dialog", { name: "MCP 配置" })
  if (scenario === "unknown") {
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveClass("sr-only")
    expect(screen.getByRole("status").textContent).toBeTruthy()
    expect(screen.getByRole("button", { name: "查看连接结果" })).toBeEnabled()
    expect(screen.getByRole("button", { name: /^保存$/u })).toBeEnabled()
  } else {
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0)
  }
  const vite = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, hmr: false, watch: null }, css: { modules: { generateScopedName: (name, filename) => basename(filename.replace(/\?.*$/u, "")) === "custom-mcp-detail-dialog.module.css" ? detailStyles[name] ?? name : basename(filename.replace(/\?.*$/u, "")) === "mcp-icon-picker.module.css" ? iconStyles[name] ?? name : name } } })
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    const css = await Promise.all(["/src/app/globals.css", "/src/ui/mcp/mcp-icon-picker.module.css", "/src/ui/mcp/custom-mcp-detail-dialog.module.css"].map(async path => {
      const result = await vite.transformRequest(`${path}?inline`)
      const json = result?.code.match(/export default ([\s\S]*?);?\s*$/u)?.[1]
      if (!json) throw Error("CSS compilation missing inline output")
      return JSON.parse(json.replace(/;\s*$/u, "")) as string
    }))
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 390, height: 400 } })
    await page.route("**/*", route => route.abort())
    await page.setContent(`<!doctype html><html><head><style>${css.join("\n")}</style></head><body data-web-skin="kokoro">${dialog.outerHTML}</body></html>`)
    if (scenario === "unknown") {
      expect(await page.getByRole("alert").count()).toBe(0)
      const announcement = page.getByRole("status")
      expect(await announcement.count()).toBe(1)
      expect(await announcement.evaluate(element => {
        const style = getComputedStyle(element)
        return { position: style.position, width: parseFloat(style.width), height: parseFloat(style.height), overflow: style.overflow }
      })).toEqual({ position: "absolute", width: 1, height: 1, overflow: "hidden" })
      expect(await page.getByRole("button", { name: "查看连接结果" }).isEnabled()).toBe(true)
    } else {
      expect(await page.getByRole("alert").count()).toBeGreaterThan(0)
    }
    const save = page.getByRole("button", { name: "保存", exact: true })
    const bounds = await save.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(400)
    // Same measured reference at normal and short viewports: content-driven buttons,
    // including their 16px icon and 2px trailing label inset, not fixed widths.
    for (const [name, width] of [["复制 UUID", 99.7890625], ["添加自定义 header", 167.75]] as const) {
      const button = page.getByRole("button", { name, exact: true })
      expect((await button.locator("svg").boundingBox())?.width).toBe(16)
      expect(Math.abs((await button.boundingBox())!.width - width)).toBeLessThan(1)
      expect(await button.evaluate(element => {
        const style = getComputedStyle(element)
        return { left: style.borderLeftWidth, right: style.borderRightWidth, outline: style.outlineStyle,
          width: style.outlineWidth, offset: style.outlineOffset, color: style.outlineColor,
          background: style.backgroundColor, shadow: style.boxShadow }
      })).toEqual({ left: "0px", right: "0px", outline: "solid", width: "1px", offset: "0px",
        color: "rgba(0, 0, 0, 0.12)", background: "rgba(0, 0, 0, 0)", shadow: "none" })
      if (!await button.isDisabled()) {
        await button.focus()
        expect(await button.evaluate(element => {
          const style = getComputedStyle(element)
          return { visible: element.matches(":focus-visible"), outline: style.outlineStyle, width: style.outlineWidth, offset: style.outlineOffset }
        })).toEqual({ visible: true, outline: "solid", width: "2px", offset: "2px" })
      }
    }
    const form = screen.getByRole("textbox", { name: "服务器名称" }).closest("form")
    for (const feedback of screen.getAllByRole(scenario === "unknown" ? "status" : "alert")) expect(form).toContainElement(feedback)
    const evidence = process.env.KOKORO_VISUAL_EVIDENCE_DIR
    if (evidence) { await mkdir(evidence, { recursive: true }); await page.screenshot({ path: join(evidence, `configuration-${scenario}-short.png`) }) }
    expect(props.onSaveConfiguration).not.toHaveBeenCalled()
    expect(props.onPrepare).not.toHaveBeenCalled()
  } finally {
    try { await browser?.close() } finally { await vite.close() }
  }
}, 20_000)


it("offers a real HTTP/SSE choice and freezes it in the creation command", async () => {
 localStorage.setItem("kokoro.locale", "zh");
 const boundary = { admitted: true, subject: "sse-choice-actor", generation: 1 };
 const register = vi.fn().mockRejectedValue(new Error("unknown original command"));
 const client = { registerPrivateMcpServer: register, preparePrivateMcpServer: vi.fn(), getPrivateMcpServer: vi.fn(), getMcpConnector: vi.fn(), beginMcpConnectorAuthorization: vi.fn() };
 const flow = createMcpServerCreationFlow({ client, boundary, onChanged: vi.fn(), preparation: createMcpPreparationCommands({ client, boundary, canPrepare: () => true, onConfirmed: vi.fn() }) });
 render(<LocaleProvider><Dialog open><DialogContent><CustomMcpForm flow={flow} boundary={boundary} onCancel={vi.fn()} onDone={async () => undefined} /></DialogContent></Dialog></LocaleProvider>);
 const choice = screen.getByRole("combobox", { name: "传输类型" }); expect(choice).toHaveTextContent("HTTP");
 fireEvent.keyDown(choice, { key: "ArrowDown" }); fireEvent.click(await screen.findByRole("option", { name: /^SSE$/u })); expect(choice).toHaveTextContent("SSE");
 fireEvent.change(screen.getByRole("textbox", { name: "服务器名称" }), { target: { value: "SSE tools" } });
 fireEvent.change(screen.getByRole("textbox", { name: "服务器 URL" }), { target: { value: "https://example.test/sse" } });
 fireEvent.click(screen.getByRole("button", { name: /^保存$/u }));
 await vi.waitFor(() => expect(register).toHaveBeenCalledOnce()); expect(register.mock.calls[0]?.[0]).toMatchObject({ display_name: "SSE tools", transport: "sse_compat" });
 expect(flow.getSnapshot().unknown).toBe("register"); expect(choice).toBeDisabled(); expect(choice).toHaveTextContent("SSE");
 fireEvent.keyDown(choice, { key: "ArrowDown" }); expect(screen.queryByRole("option", { name: /^HTTP$/u })).toBeNull(); expect(register).toHaveBeenCalledOnce();
});


it.each(["current", "missing"] as const)("%s detail history shares the fixed hero frame and scrolls within its padded body on normal/short screens", async variant => {
  localStorage.setItem("kokoro.locale", "zh")
  const props: Parameters<typeof CustomMcpDetailDialog>[0] = {
    connector: { availability: "unavailable", connector_id: "history-connector", server_id: "history-server", provider_key: "qa", connector_type: "mcp", display_name: "QA SSE Transport 20261025 2210", status: "pending", enabled: false, approved_scopes: [], state_version: "4" },
    server: { availability: "unavailable", server_id: "history-server", display_name: "QA SSE Transport 20261025 2210", server_url: "https://qa.example.test/sse", status: "registered", state_version: "4", headers: [], transport: "sse_compat", prepare_status: "prepare_failed", declarations: [], declarations_available: false },
    preparationState: "unknown", preparationCanResume: true, actionId: null, admitted: true, managementCommand: undefined,
    onResumeManagement: vi.fn(), actionError: false, deleteId: null, returnFocusRef: { current: null }, onClose: vi.fn(), onSaveConfiguration: vi.fn(), onPrepare: vi.fn(), onAuthorize: vi.fn(), onDisconnect: vi.fn(), onDeleteIntent: vi.fn(), onCancelDelete: vi.fn(), onDelete: vi.fn(),
    ...(variant === "missing" ? { connector: null, server: null, pendingError: true } : {}),
  }
  const history = { items: (["unknown_fenced", "definite_rejected"] as const).map((disposition, i) => ({ schema_version: 2 as const, subject: "qa", target: { serverId: "history-server", connectorId: "history-connector", version: String(i + 1) }, key: `qa-key-${i}`, disposition, policy_ref: { artifact_sha256: "a".repeat(64), profile: "qa", version: "1" }, retired_at: "2026-10-27T00:00:00.000Z" })), cursor: null, error: false, loading: false, results: {}, inspect: vi.fn(async () => {}), reload: vi.fn(async () => {}), more: vi.fn(async () => {}) }
  render(<LocaleProvider><CustomMcpDetailDialog {...props} preparationStatus={<McpPreparationStatus history={history} />} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "已结束的连接尝试" }))
  const dialog = screen.getByRole("dialog")
  const modules: Record<string, Record<string, string>> = { "custom-mcp-detail-dialog.module.css": detailStyles, "mcp-preparation-status.module.css": statusStyles }
  const vite = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, hmr: false, watch: null }, css: { modules: { generateScopedName: (name, filename) => modules[basename(filename.replace(/\?.*$/u, ""))]?.[name] ?? name } } })
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    const css = await Promise.all(["/src/app/globals.css", "/src/ui/mcp/custom-mcp-detail-dialog.module.css", "/src/ui/mcp/mcp-preparation-status.module.css"].map(async path => {
      const result = await vite.transformRequest(`${path}?inline`), json = result?.code.match(/export default ([\s\S]*?);?\s*$/u)?.[1]
      if (!json) throw Error("CSS compilation missing inline output")
      return JSON.parse(json.replace(/;\s*$/u, "")) as string
    }))
    browser = await chromium.launch({ headless: true })
    for (const viewport of [{ width: 839, height: 900 }, { width: 652, height: 767 }, { width: 390, height: 400 }]) {
      const page = await browser.newPage({ viewport }); await page.route("**/*", route => route.abort())
      await page.setContent(`<!doctype html><html><head><style>${css.join("\n")}</style></head><body data-web-skin="kokoro">${dialog.outerHTML}</body></html>`)
      const frame = page.getByRole("dialog"), heading = frame.getByRole("heading", { level: 2 }), title = await heading.boundingBox()
      const disclosure = frame.getByRole("button", { name: "已结束的连接尝试" }), bounds = await frame.boundingBox()
      expect(bounds).not.toBeNull(); expect(bounds!.height).toBeLessThanOrEqual(Math.min(558, viewport.height - 32) + 2)
      expect(bounds!.y).toBeGreaterThanOrEqual(15); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height - 15)
      expect(title).not.toBeNull(); expect(title!.y).toBeGreaterThanOrEqual(bounds!.y)
      const structure = await disclosure.evaluate(element => {
        const frame = element.closest('[role="dialog"]')!, section = element.closest("section")!, hero = section.querySelector("header")!
        let scroll = element.parentElement
        while (scroll && scroll !== frame && getComputedStyle(scroll).overflowY !== "auto") scroll = scroll.parentElement
        const padding = scroll ? getComputedStyle(scroll) : null
        return { sameSection: section.contains(hero), insideScroll: scroll !== null && scroll !== frame, left: padding?.paddingLeft, right: padding?.paddingRight, height: scroll?.clientHeight, heroBottom: hero.getBoundingClientRect().bottom, historyTop: element.getBoundingClientRect().top }
      })
      const padding = viewport.width <= 704 ? "16px" : "24px" // existing detail responsive rule, not a new layout value
      expect(structure).toMatchObject({ sameSection: true, insideScroll: true, left: padding, right: padding })
      expect(structure.height).toBeGreaterThan(0); expect(structure.historyTop).toBeGreaterThanOrEqual(structure.heroBottom - 1)
      const rowAction = frame.getByRole("button", { name: "查看连接结果" }).last(); await rowAction.focus()
      expect(await rowAction.evaluate(element => document.activeElement === element)).toBe(true)
      const rowBounds = await rowAction.boundingBox(); expect(rowBounds).not.toBeNull(); expect(rowBounds!.y + rowBounds!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height)
      if (variant === "current") { await frame.getByText("UUID", { exact: true }).scrollIntoViewIfNeeded(); expect(await frame.getByText("UUID", { exact: true }).isVisible()).toBe(true) }
      expect((await heading.boundingBox())!.y).toBe(title!.y)
      const evidence = process.env.KOKORO_VISUAL_EVIDENCE_DIR
      if (evidence) { await mkdir(evidence, { recursive: true }); await frame.screenshot({ path: join(evidence, `mcp-detail-history-${variant}-${viewport.width}x${viewport.height}.png`) }) }
      await page.close()
    }
    expect(props.onPrepare).not.toHaveBeenCalled(); expect(history.inspect).not.toHaveBeenCalled(); expect(props.onSaveConfiguration).not.toHaveBeenCalled()
  } finally { try { await browser?.close() } finally { await vite.close() } }
}, 20_000)
