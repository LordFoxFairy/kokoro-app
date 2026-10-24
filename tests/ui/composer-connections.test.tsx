import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { useSyncExternalStore } from "react"
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
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear() })

it("reads exact eligible connections, pages explicitly, and joins only matching connector metadata", async () => {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "actor:a")
  const engine = makeEngine(), client = reader()
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
    return <ComposerConnections controller={choices} onManage={onManage} />
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
    render(<ThemeProvider><LocaleProvider><AppFrame engine={engine} chatHref="/app" /></LocaleProvider></ThemeProvider>)
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
