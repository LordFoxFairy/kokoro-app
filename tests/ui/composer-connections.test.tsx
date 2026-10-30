import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useState, useSyncExternalStore } from "react"
import type { ConversationStore } from "@/core/conversations"
import { createSessionEngine } from "@/engine/machine"
import type { HubClient } from "@/hub/client"
import type { McpConnection } from "@/hub/schemas"
import { LocaleProvider } from "@/i18n/context"
import { useComposerConnections } from "@/ui/shell/use-composer-connections"
import { ComposerConnections } from "@/ui/composer/composer-connections"
import { AppFrame } from "@/components/blocks/app-frame/app-frame"
import { ThemeProvider } from "@/ui/theme/theme-context"
import * as pageClients from "@/ui/shell/page-clients"
import { createPreviewHubClient } from "@/dev/preview-clients"
import { createFakeClient, createMemoryStorage, settle } from "../engine/fakes"

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))

const connection = (id: string): McpConnection => ({ connection_id: id, connector_id: `connector:${id}`, server_id: `server:${id}`, provider_key: "private", transport: "streamable_http", status: "active" })
function reader() {
  return {
    listMcpConnections: vi.fn<HubClient["listMcpConnections"]>().mockResolvedValue({ connections: [connection("connection:a")], next_cursor: "page2" }),
    getMcpConnector: vi.fn<NonNullable<HubClient["getMcpConnector"]>>().mockImplementation(async id => ({ connector_id: id, server_id: `server:${id.slice("connector:".length)}`, provider_key: "private", connector_type: "mcp", status: "active", enabled: true, availability: "available", state_version: "1", approved_scopes: [], display_name: `Docs ${id}` })),
  }
}
const boundary = { admitted: true, subject: "actor:a", generation: 1 }
function makeEngine() { return createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<ConversationStore>(null) }) }
let originalUrl: string
beforeEach(() => {
  originalUrl = window.location.href
  // The real shell reads history as well as Next's pathname.
  window.history.replaceState(null, "", "/app")
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); window.history.replaceState(null, "", originalUrl) })

it.each(["streamable_http", "sse_compat"] as const)("reads exact eligible %s connections, pages explicitly, and joins only matching connector metadata", async transport => {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "actor:a")
  const engine = makeEngine(), client = reader()
  client.listMcpConnections.mockResolvedValueOnce({ connections: [{ ...connection("connection:a"), transport }], next_cursor: "page2" })
  const { result } = renderHook(() => useComposerConnections({ engine, client, boundary, enforceSubjectMarker: true }))
  await act(async () => { await settle() })
  expect(result.current.items.map(item => item.id)).toEqual(["connection:a"])
  expect(result.current.items[0]?.name).toBe("Docs connector:connection:a")
  expect(engine.getSnapshot().selectedMcpConnectionIds).toEqual([])
  act(() => result.current.toggle("connection:a"))
  expect(engine.getSnapshot().selectedMcpConnectionIds).toEqual(["connection:a"])
  client.listMcpConnections.mockResolvedValueOnce({ connections: [connection("connection:b")], next_cursor: undefined })
  await act(async () => { result.current.loadMore(); await settle() })
  expect(client.listMcpConnections.mock.calls[1]?.[0]).toMatchObject({ cursor: "page2" })
  expect(result.current.items.map(item => item.id)).toEqual(["connection:a", "connection:b"])
  await act(async () => { result.current.refresh(); await settle() })
  expect(result.current.status).toBe("ready")
  act(() => result.current.toggle("not-in-projection"))
  expect(engine.getSnapshot().selectedMcpConnectionIds).toEqual(["connection:a"])
  engine.dispose()
})

it("retires old identity reads and selection, including a late read whose transport ignores abort", async () => {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "actor:a")
  const engine = makeEngine(), client = reader()
  let finish!: (value: { connections: McpConnection[] }) => void
  client.listMcpConnections.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const hook = renderHook(({ admitted }) => useComposerConnections({ engine, client, boundary: { ...boundary, admitted }, enforceSubjectMarker: true }), { initialProps: { admitted: true } })
  engine.setSelectedMcpConnectionIds(["connection:a"])
  hook.rerender({ admitted: false })
  await act(async () => { finish({ connections: [connection("late")] }); await settle() })
  expect(hook.result.current.items).toEqual([])
  expect(engine.getSnapshot().selectedMcpConnectionIds).toEqual([])
  expect(client.getMcpConnector).not.toHaveBeenCalled()
  engine.dispose()
})

it("local Project draft choices never clear the retained engine on entry/exit or reread its catalog on each toggle", async () => {
  const engine = makeEngine(), client = reader()
  engine.setSelectedMcpConnectionIds(["retained:connection"])
  const first = {}, second = {}
  let current: object | null = null
  const hook = renderHook(({ context }: { context: object | null }) => {
    const [choice, setChoice] = useState<{ context: object | null; ids: readonly string[] }>({ context, ids: [] })
    return useComposerConnections({ engine, client, boundary, enforceSubjectMarker: false,
      ...(context ? { localDraft: {
        context, selectedIds: choice.context === context ? choice.ids : [], isCurrent: () => current === context,
        update: (change: (ids: readonly string[]) => readonly string[]) => setChoice(previous => current === context
          ? { context, ids: change(previous.context === context ? previous.ids : []) } : previous),
      } } : {}),
    })
  }, { initialProps: { context: null as object | null } })
  await act(async () => { await settle() })
  const ordinaryToggle = hook.result.current.toggle
  current = first
  hook.rerender({ context: first })
  await act(async () => { await settle() })
  act(() => ordinaryToggle("connection:a"))
  expect(engine.getSnapshot().selectedMcpConnectionIds).toEqual(["retained:connection"])
  expect(hook.result.current.selectedIds).toEqual([])
  const reads = client.listMcpConnections.mock.calls.length
  act(() => hook.result.current.toggle("connection:a"))
  expect(hook.result.current.selectedIds).toEqual(["connection:a"])
  act(() => { hook.result.current.toggle("connection:a"); hook.result.current.toggle("connection:a") })
  expect(hook.result.current.selectedIds).toEqual(["connection:a"])
  expect(client.listMcpConnections).toHaveBeenCalledTimes(reads)
  const staleToggle = hook.result.current.toggle
  current = second
  hook.rerender({ context: second })
  await act(async () => { await settle(); staleToggle("connection:a") })
  expect(hook.result.current.selectedIds).toEqual([])
  expect(engine.getSnapshot().selectedMcpConnectionIds).toEqual(["retained:connection"])
  current = null
  hook.rerender({ context: null })
  await act(async () => { await settle() })
  expect(hook.result.current.selectedIds).toEqual(["retained:connection"])
  hook.unmount()
  engine.dispose()
})

it("a retired Project draft catalog cannot publish a late page into the next draft", async () => {
  const engine = makeEngine(), client = reader(), first = {}, second = {}
  let finish!: (value: { connections: McpConnection[] }) => void
  client.listMcpConnections.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const hook = renderHook(({ context }) => useComposerConnections({ engine, client, boundary, enforceSubjectMarker: false,
    localDraft: { context, selectedIds: [], isCurrent: () => true, update: vi.fn() },
  }), { initialProps: { context: first } })
  hook.rerender({ context: second })
  await act(async () => { await settle(); finish({ connections: [connection("retired")] }); await settle() })
  expect(hook.result.current.items.map(item => item.id)).toEqual(["connection:a"])
  expect(client.getMcpConnector.mock.calls.map(call => call[0])).not.toContain("connector:retired")
  hook.unmount()
  engine.dispose()
})

it("Project default resolution reads beyond the first Connection page and confirms completeness without auto-selecting", async () => {
  const engine = makeEngine(), client = reader()
  client.listMcpConnections.mockResolvedValueOnce({ connections: [connection("connection:first")], next_cursor: "second" })
    .mockResolvedValueOnce({ connections: [connection("connection:later")], next_cursor: undefined })
  const hook = renderHook(() => useComposerConnections({ engine, client, boundary, enforceSubjectMarker: false, loadAllForDefaults: true }))
  await waitFor(() => expect(hook.result.current.complete).toBe(true))
  expect(hook.result.current.items.map(item => item.id)).toEqual(["connection:first", "connection:later"])
  expect(hook.result.current.items[1]).toMatchObject({ connectorId: "connector:connection:later", providerKey: "private" })
  expect(engine.getSnapshot().selectedMcpConnectionIds).toEqual([])
  hook.unmount(); engine.dispose()
})

it("a duplicate ID or cursor during automatic Connection scan never becomes a ready complete default catalog", async () => {
  const engine = makeEngine(), client = reader()
  client.listMcpConnections.mockResolvedValue({ connections: [connection("connection:a")], next_cursor: "loop" })
  const hook = renderHook(() => useComposerConnections({ engine, client, boundary, enforceSubjectMarker: false, loadAllForDefaults: true }))
  await waitFor(() => expect(hook.result.current.status).toBe("error"))
  expect(hook.result.current.complete).not.toBe(true)
  expect(engine.getSnapshot().selectedMcpConnectionIds).toEqual([])
  hook.unmount(); engine.dispose()
})

it("touching a previously pristine default draft does not reread it, and its next explicit refresh returns to manual pagination", async () => {
  const engine = makeEngine(), client = reader()
  client.listMcpConnections.mockResolvedValueOnce({ connections: [connection("connection:first")], next_cursor: "second" })
    .mockResolvedValueOnce({ connections: [connection("connection:later")], next_cursor: undefined })
  const hook = renderHook(({ pristine }) => useComposerConnections({ engine, client, boundary, enforceSubjectMarker: false, loadAllForDefaults: pristine }), { initialProps: { pristine: true } })
  await waitFor(() => expect(hook.result.current.complete).toBe(true))
  hook.rerender({ pristine: false })
  await act(async () => { await settle() })
  expect(client.listMcpConnections).toHaveBeenCalledTimes(2)
  act(() => hook.result.current.refresh())
  await waitFor(() => expect(hook.result.current.status).toBe("ready"))
  expect(client.listMcpConnections).toHaveBeenCalledTimes(3)
  expect(hook.result.current.nextCursor).toBe("page2")
  expect(hook.result.current.complete).toBe(false)
  hook.unmount(); engine.dispose()
})

it("retains the current menu on read failure and retries without enabling or creating connectors", async () => {
  const engine = makeEngine(), client = reader()
  const { result } = renderHook(() => useComposerConnections({ engine, client, boundary, enforceSubjectMarker: false }))
  await act(async () => { await settle() })
  client.listMcpConnections.mockRejectedValueOnce(new Error("read failed"))
  await act(async () => { result.current.refresh(); await settle() })
  expect(result.current.status).toBe("error")
  expect(result.current.items).toHaveLength(1)
  await act(async () => { result.current.refresh(); await settle() })
  expect(result.current.status).toBe("ready")
  expect(engine.getSnapshot().selectedMcpConnectionIds).toEqual([])
  engine.dispose()
})

it("keeps a mismatched server or unavailable connector out of executable choices", async () => {
  const engine = makeEngine(), client = reader()
  client.getMcpConnector.mockResolvedValueOnce({ connector_id: "connector:connection:a", server_id: "server:other", provider_key: "private", connector_type: "mcp", status: "active", enabled: true, availability: "available", state_version: "1", approved_scopes: [], display_name: "Wrong server" })
  const { result } = renderHook(() => useComposerConnections({ engine, client, boundary, enforceSubjectMarker: false }))
  await act(async () => { await settle() })
  expect(result.current.status).toBe("error")
  expect(result.current.items).toEqual([])
  engine.dispose()
})

it("selects in the independent menu and delivers the exact ID through the real engine adapter", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const sessionClient = createFakeClient(), client = reader(), onManage = vi.fn()
  const engine = createSessionEngine({ client: sessionClient, storage: createMemoryStorage<ConversationStore>(null) })
  function Harness() {
    useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot)
    const choices = useComposerConnections({ engine, client, boundary, enforceSubjectMarker: false })
    return <ComposerConnections controller={choices} onAdd={vi.fn()} onManage={onManage} />
  }
  render(<LocaleProvider><Harness /></LocaleProvider>)
  await act(async () => { await settle() })
  fireEvent.click(screen.getByRole("button", { name: "连接器 (0)" }))
  fireEvent.click(await screen.findByRole("switch", { name: "Docs connector:connection:a" }))
  expect(screen.getByRole("switch", { name: "Docs connector:connection:a" })).toHaveAttribute("aria-checked", "true")
  expect(onManage).not.toHaveBeenCalled()
  act(() => { engine.submit("use docs") })
  await act(async () => { await settle() })
  expect(sessionClient.createCalls[0]?.body).toHaveProperty("selected_mcp_connection_ids", ["connection:a"])
  fireEvent.click(screen.getByRole("button", { name: "管理连接器" }))
  expect(onManage).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole("dialog", { name: "连接器" })).not.toBeInTheDocument()
  engine.dispose()
})


it("ordinary AppFrame connects its independent menu to the first message, not an implicit settings navigation", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const client = createFakeClient(), hub = { ...createPreviewHubClient(), ...reader() }
  vi.spyOn(pageClients, "browserListClient").mockReturnValue(client)
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(null) })
  try {
    render(<ThemeProvider><LocaleProvider><AppFrame engine={engine} chatHref="/app"
      navigation={[{ key: "chat", label: "新对话", featureFlag: "chat" }, { key: "mcp", label: "连接器" }]}
      featureFlags={[{ key: "chat", enabled: true }, { key: "workspace.resources", enabled: true }, { key: "workspace.skills", enabled: true }]}
      workspaceCapabilities={{ instructions: true, connectors: false, resources: true, skills: true, projectConversations: true }}
    /></LocaleProvider></ThemeProvider>)
    await act(async () => { await settle() })
    fireEvent.click(screen.getByRole("button", { name: "连接器 (0)" }))
    fireEvent.click(await screen.findByRole("switch", { name: "Docs connector:connection:a" }))
    expect(screen.queryByRole("heading", { name: "设置" })).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole("switch", { name: "Docs connector:connection:a" }), { key: "Escape" })
    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "use the selected connector" } })
    fireEvent.submit(screen.getByRole("form", { name: "消息编辑区" }))
    await act(async () => { await settle() })
    expect(client.createCalls[0]?.body).toHaveProperty("selected_mcp_connection_ids", ["connection:a"])
  } finally { engine.dispose() }
})

it("fails closed rather than crashing the workspace when the subject marker becomes unreadable", async () => {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "actor:a")
  const engine = makeEngine(), client = reader()
  const hook = renderHook(() => useComposerConnections({ engine, client, boundary, enforceSubjectMarker: true }))
  await act(async () => { await settle() })
  act(() => hook.result.current.toggle("connection:a"))
  const get = Storage.prototype.getItem
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
    if (key === "kokoro.web.auth-index-subject") throw new DOMException("storage denied", "SecurityError")
    return get.call(this, key)
  })
  expect(() => hook.rerender()).not.toThrow()
  expect(hook.result.current.status).toBe("disabled")
  expect(hook.result.current.items).toEqual([])
  expect(engine.getSnapshot().selectedMcpConnectionIds).toEqual([])
  engine.dispose()
})

it("accepts a global provider Connection whose connector legitimately omits server_id", async () => {
  const engine = makeEngine(), client = reader()
  client.getMcpConnector.mockResolvedValueOnce({ connector_id: "connector:connection:a", provider_key: "private", connector_type: "byok", status: "active", enabled: true, availability: "available", state_version: "1", approved_scopes: [], display_name: "Global provider" })
  const { result } = renderHook(() => useComposerConnections({ engine, client, boundary, enforceSubjectMarker: false }))
  await act(async () => { await settle() })
  expect(result.current.status).toBe("ready")
  expect(result.current.items).toMatchObject([{ id: "connection:a", name: "Global provider", selectable: true }])
  act(() => result.current.toggle("connection:a"))
  expect(engine.getSnapshot().selectedMcpConnectionIds).toEqual(["connection:a"])
  engine.dispose()
})

it("opens Add and Manage as separate explicit destinations without changing draft selections", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const onAdd = vi.fn(), onManage = vi.fn(), toggle = vi.fn()
  const controller = { items: [{ id: "connection:a", name: "Docs", availability: "available" as const, selectable: true }], selectedIds: ["connection:a"], status: "ready" as const, nextCursor: undefined, refresh: vi.fn(), loadMore: vi.fn(), toggle }
  render(<LocaleProvider><ComposerConnections controller={controller} onAdd={onAdd} onManage={onManage} /></LocaleProvider>)
  const trigger = screen.getByRole("button", { name: "连接器 (1)" })
  fireEvent.click(trigger)
  fireEvent.click(await screen.findByRole("button", { name: "添加连接器" }))
  expect(onAdd).toHaveBeenCalledExactlyOnceWith(trigger)
  expect(onManage).not.toHaveBeenCalled()
  expect(toggle).not.toHaveBeenCalled()
  fireEvent.click(trigger)
  fireEvent.click(await screen.findByRole("button", { name: "管理连接器" }))
  expect(onManage).toHaveBeenCalledExactlyOnceWith(trigger)
  expect(onAdd).toHaveBeenCalledTimes(1)
  expect(controller.selectedIds).toEqual(["connection:a"])
  expect(toggle).not.toHaveBeenCalled()
})

it("does not auto-highlight the first connector for a pointer open, but keeps keyboard entry and return focus", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const controller = { items: [{ id: "connection:a", name: "Docs", availability: "available" as const, selectable: true }], selectedIds: [], status: "ready" as const, nextCursor: undefined, refresh: vi.fn(), loadMore: vi.fn(), toggle: vi.fn() }
  render(<LocaleProvider><ComposerConnections controller={controller} onAdd={vi.fn()} onManage={vi.fn()} /></LocaleProvider>)
  const trigger = screen.getByRole("button", { name: "连接器 (0)" })
  trigger.focus()
  fireEvent.pointerDown(trigger)
  fireEvent.click(trigger)
  const choice = await screen.findByRole("switch", { name: "Docs" })
  await act(async () => { await settle() })
  expect(trigger).toHaveFocus()
  expect(choice).not.toHaveFocus()
  expect(screen.queryByRole("button", { name: "重新加载" })).not.toBeInTheDocument()
  fireEvent.keyDown(trigger, { key: "Escape" })
  await act(async () => { await settle() })
  fireEvent.keyDown(trigger, { key: "Enter" })
  fireEvent.click(trigger)
  await waitFor(() => expect(screen.getByRole("switch", { name: "Docs" })).toHaveFocus())
  fireEvent.keyDown(screen.getByRole("switch", { name: "Docs" }), { key: "Escape" })
  await waitFor(() => expect(trigger).toHaveFocus())
})

it("retains known connector choices after a read failure without an extra refresh or generic retry panel", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const controller = { items: [{ id: "connection:a", name: "Docs", availability: "available" as const, selectable: true }], selectedIds: ["connection:a"], status: "ready" as const, nextCursor: undefined, refresh: vi.fn(), loadMore: vi.fn(), toggle: vi.fn() }
  const onAdd = vi.fn(), onManage = vi.fn()
  const view = render(<LocaleProvider><ComposerConnections controller={controller} onAdd={onAdd} onManage={onManage} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "连接器 (1)" }))
  expect(await screen.findByRole("switch", { name: "Docs" })).toHaveAttribute("aria-checked", "true")
  view.rerender(<LocaleProvider><ComposerConnections controller={{ ...controller, status: "error" }} onAdd={onAdd} onManage={onManage} /></LocaleProvider>)
  expect(screen.getByRole("switch", { name: "Docs" })).toHaveAttribute("aria-checked", "true")
  expect(screen.getByRole("status")).not.toBeEmptyDOMElement()
  expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "重新加载" })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "添加连接器" })).toBeEnabled()
  expect(screen.getByRole("button", { name: "管理连接器" })).toBeEnabled()
  expect(controller.toggle).not.toHaveBeenCalled()
})


it.each([
  { navigation: [{ key: "chat", label: "Chat" }], featureFlags: [{ key: "chat", enabled: true }] },
  { navigation: [{ key: "mcp", label: "Connectors", featureFlag: "module.mcp" }], featureFlags: [{ key: "module.mcp", enabled: false }] },
])("does not read or expose composer MCP when its actual module is absent or disabled: %j", async manifest => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const client = createFakeClient(), reading = reader(), hub = { ...createPreviewHubClient(), ...reading }
  vi.spyOn(pageClients, "browserListClient").mockReturnValue(client)
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(null) })
  try {
    render(<ThemeProvider><LocaleProvider><AppFrame engine={engine} chatHref="/app" {...manifest} /></LocaleProvider></ThemeProvider>)
    await act(async () => { await settle() })
    expect(screen.queryByRole("button", { name: "连接器 (0)" })).not.toBeInTheDocument()
    expect(reading.listMcpConnections).not.toHaveBeenCalled()
  } finally { engine.dispose() }
})
