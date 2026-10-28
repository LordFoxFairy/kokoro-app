import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { AppFrame } from "@/components/blocks/app-frame/app-frame"
import { createSessionEngine } from "@/engine/machine"
import { addConversation, type ConversationStore } from "@/core/conversations"
import { createPreviewHubClient } from "@/dev/preview-clients"
import { LocaleProvider } from "@/i18n/context"
import { ThemeProvider } from "@/ui/theme/theme-context"
import * as pageClients from "@/ui/shell/page-clients"
import { createFakeClient, createMemoryStorage, settle } from "../engine/fakes"
import { makeSnapshot } from "../core/fixtures"

vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
beforeEach(() => { window.localStorage.clear(); window.localStorage.setItem("kokoro.locale", "zh"); window.localStorage.setItem("kokoro.web.auth-index-subject", "catalog-actor") })
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); window.history.replaceState(null, "", "/app") })

async function mountCatalog() {
  const projectRef = "project_catalog", id = "conv_catalog", url = `/app/project/${projectRef}?conversation=${id}`
  window.history.replaceState(null, "", url)
  const local = createFakeClient(); local.nextSnapshot = async sessionId => makeSnapshot({ sessionId })
  const engine = createSessionEngine({ client: local, scope: { kind: "project", projectRef }, storage: createMemoryStorage<ConversationStore>(addConversation(null, id, 1)) })
  const client = createPreviewHubClient()
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(client)
  vi.spyOn(pageClients, "browserListClient").mockReturnValue(local)
  const create = vi.spyOn(client, "createMcpConnector"), authorize = vi.spyOn(client, "beginMcpConnectorAuthorization")
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: { code: "unavailable" } }, { status: 503 }))
  let boundary = { admitted: true, subject: "catalog-actor", generation: 1 }
  const frame = () => <ThemeProvider><LocaleProvider><AppFrame engine={engine} chatHref="/app" projectWorkspace projectRef={projectRef} projectReadBoundary={boundary} /></LocaleProvider></ThemeProvider>
  const view = render(frame())
  await screen.findByRole("textbox", { name: "对话输入" })
  await act(async () => { await settle() })
  act(() => engine.setSelectedMcpConnectionIds(["retained-choice"]))
  const draft = screen.getByRole("textbox", { name: "对话输入" })
  fireEvent.change(draft, { target: { value: "keep exact draft" } })
  const trigger = screen.getByRole("button", { name: "连接器 (1)" })
  return { engine, local, client, create, authorize, draft, trigger, url, view, rebind: (next: typeof boundary) => { boundary = next; view.rerender(frame()) } }
}

it("composer Add opens only the existing catalog over the exact Project conversation and returns focus on Escape", async () => {
  const h = await mountCatalog()
  try {
    fireEvent.click(h.trigger)
    fireEvent.click(await screen.findByRole("button", { name: "添加连接器" }))
    expect(screen.queryByTestId("settings-modal")).not.toBeInTheDocument()
    const catalog = await screen.findByRole("dialog", { name: "连接器" })
    const card = await within(catalog).findByRole("button", { name: "Preview Notes" })
    expect(window.location.pathname + window.location.search).toBe(h.url)
    expect(h.draft).toHaveValue("keep exact draft")
    expect(h.engine.getSnapshot().selectedMcpConnectionIds).toEqual(["retained-choice"])
    expect(screen.getAllByRole("searchbox")).toHaveLength(1)
    fireEvent.click(card)
    await screen.findByRole("dialog", { name: "Preview Notes" })
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Preview Notes" })).not.toBeInTheDocument())
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "连接器" })).not.toBeInTheDocument())
    await waitFor(() => expect(h.trigger).toHaveFocus())
    expect(window.location.pathname + window.location.search).toBe(h.url)
    expect(h.draft).toHaveValue("keep exact draft")
    expect(h.engine.getSnapshot().selectedMcpConnectionIds).toEqual(["retained-choice"])
    expect(h.create).not.toHaveBeenCalled(); expect(h.authorize).not.toHaveBeenCalled()
    expect(h.local.createCalls).toEqual([]); expect(h.local.controlCalls).toEqual([])
  } finally { h.view.unmount(); h.engine.dispose() }
})

it("composer Manage remains the installed Settings surface", async () => {
  const h = await mountCatalog()
  try {
    fireEvent.click(h.trigger)
    fireEvent.click(await screen.findByRole("button", { name: "管理连接器" }))
    await screen.findByTestId("settings-modal")
    expect(window.location.hash).toContain("settings/mcp")
    h.view.unmount()
  } finally { h.engine.dispose() }
})

it("same actor readmission preserves catalog query and window but retires old reads and blocks new commands", async () => {
  const h = await mountCatalog()
  try {
    fireEvent.click(h.trigger)
    fireEvent.click(await screen.findByRole("button", { name: "添加连接器" }))
    expect(screen.queryByTestId("settings-modal")).not.toBeInTheDocument()
    const catalog = await screen.findByRole("dialog", { name: "连接器" })
    let finish!: (value: Awaited<ReturnType<typeof h.client.listMcpConnectorProviders>>) => void
    let signal: AbortSignal | undefined
    const original = h.client.listMcpConnectorProviders
    vi.spyOn(h.client, "listMcpConnectorProviders").mockImplementation((query, nextSignal) => {
      if (query?.query === "held") { signal = nextSignal; return new Promise(resolve => { finish = resolve }) }
      return original(query, nextSignal)
    })
    fireEvent.change(within(catalog).getByRole("searchbox"), { target: { value: "held" } })
    await waitFor(() => expect(finish).toBeTypeOf("function"))
    h.rebind({ admitted: false, subject: "catalog-actor", generation: 2 })
    expect(screen.getByRole("dialog", { name: "连接器" })).toBe(catalog)
    expect(within(catalog).getByRole("searchbox")).toHaveValue("held")
    expect(within(catalog).getByRole("button", { name: "创建" })).toBeDisabled()
    expect(within(catalog).queryByRole("button", { name: "Preview Notes" })).not.toBeInTheDocument()
    expect(within(catalog).queryByText("没有匹配的连接")).not.toBeInTheDocument()
    expect(within(catalog).queryByText("当前没有可添加的连接器提供方。")).not.toBeInTheDocument()
    expect(signal?.aborted).toBe(true)
    await act(async () => { finish({ items: [{ provider_key: "late", display_name: "Private late provider", description: "retired", directory_type: "app", category_keys: [], example_prompts: [], enabled: true, state_version: "1" }], next_cursor: null }); await settle() })
    expect(screen.queryByText("Private late provider")).not.toBeInTheDocument()
    h.rebind({ admitted: true, subject: "catalog-actor", generation: 3 })
    await act(async () => { await settle() })
    expect(screen.getByRole("dialog", { name: "连接器" })).toBe(catalog)
    expect(within(catalog).getByRole("searchbox")).toHaveValue("held")
    expect(within(catalog).getByRole("button", { name: "创建" })).toBeEnabled()
    expect(screen.queryByText("Private late provider")).not.toBeInTheDocument()
    expect(h.create).not.toHaveBeenCalled(); expect(h.authorize).not.toHaveBeenCalled()
    expect(window.location.pathname + window.location.search).toBe(h.url)
  } finally { h.view.unmount(); h.engine.dispose() }
})

it.each(["actor", "route"] as const)("catalog Create preserves same-actor input, cancels to its stack and retires on %s without a command", async change => {
  const h = await mountCatalog()
  try {
    fireEvent.click(h.trigger)
    fireEvent.click(await screen.findByRole("button", { name: "添加连接器" }))
    const catalog = await screen.findByRole("dialog", { name: "连接器" })
    const create = within(catalog).getByRole("button", { name: "创建" })
    fireEvent.pointerDown(create, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "自定义 MCP" }))
    const name = await screen.findByRole("textbox", { name: /名称/ })
    fireEvent.change(name, { target: { value: "retained creation draft" } })
    h.rebind({ admitted: false, subject: "catalog-actor", generation: 2 })
    expect(screen.getByRole("textbox", { name: /名称/ })).toBe(name)
    expect(name).toHaveValue("retained creation draft")
    expect(name).toHaveAttribute("readonly")
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
    h.rebind({ admitted: true, subject: "catalog-actor", generation: 3 })
    expect(screen.getByRole("textbox", { name: /名称/ })).toBe(name)
    expect(name).toHaveValue("retained creation draft")
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("textbox", { name: /名称/ })).not.toBeInTheDocument())
    expect(await screen.findByRole("dialog", { name: "连接器" })).toBe(catalog)
    await waitFor(() => expect(create).toHaveFocus())
    expect(window.location.pathname + window.location.search).toBe(h.url)
    expect(h.draft).toHaveValue("keep exact draft")
    expect(h.create).not.toHaveBeenCalled(); expect(h.authorize).not.toHaveBeenCalled()
    if (change === "actor") h.rebind({ admitted: true, subject: "next-catalog-actor", generation: 4 })
    else act(() => { window.history.pushState(null, "", "/app"); window.dispatchEvent(new Event("kokoro:surface-navigation")) })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "连接器" })).not.toBeInTheDocument())
  } finally { h.view.unmount(); h.engine.dispose() }
})

it.each(["actor", "route"] as const)("catalog %s retirement cancels a queued normal-close focus return to a still connected old trigger", async change => {
  const h = await mountCatalog()
  const frames = new Map<number, FrameRequestCallback>(); let next = 1000
  let nextPage: HTMLButtonElement | undefined
  try {
    fireEvent.click(h.trigger)
    fireEvent.click(await screen.findByRole("button", { name: "添加连接器" }))
    await screen.findByRole("dialog", { name: "连接器" })
    await act(async () => { await settle() })
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { const id = ++next; frames.set(id, callback); return id })
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id) })
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "连接器" })).not.toBeInTheDocument())
    await waitFor(() => expect(frames.size).toBeGreaterThan(0))
    if (change === "actor") h.rebind({ admitted: true, subject: "next-catalog-actor", generation: 2 })
    else act(() => { window.history.pushState(null, "", "/app"); window.dispatchEvent(new Event("kokoro:surface-navigation")) })
    expect(h.trigger.isConnected).toBe(true)
    const oldFocus = vi.spyOn(h.trigger, "focus")
    nextPage = document.createElement("button"); nextPage.textContent = "next page focus"; document.body.append(nextPage); nextPage.focus()
    await act(async () => { for (let round = 0; round < 5 && frames.size; round++) { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(performance.now())) } })
    expect(oldFocus).not.toHaveBeenCalled()
    expect(nextPage).toHaveFocus()
    expect(h.create).not.toHaveBeenCalled(); expect(h.authorize).not.toHaveBeenCalled()
  } finally { nextPage?.remove(); h.view.unmount(); h.engine.dispose() }
})
