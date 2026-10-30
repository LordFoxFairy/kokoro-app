import { useState } from "react"
import { AppFrame } from "@/components/blocks/app-frame/app-frame"
import { ThemeProvider } from "@/ui/theme/theme-context"
import * as pageClients from "@/ui/shell/page-clients"
import { createPreviewHubClient } from "@/dev/preview-clients"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { ConversationStore } from "@/core/conversations"
import { createSessionEngine } from "@/engine/machine"
import { LocaleProvider } from "@/i18n/context"
import { ComposerConnections } from "@/ui/composer/composer-connections"
import { useComposerConnections } from "@/ui/shell/use-composer-connections"
import { createFakeClient, createMemoryStorage, settle } from "../engine/fakes"
vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
const boundary = { admitted: true, subject: "actor:a", generation: 1 }
const profile = { profile_id: "same:id", state_version: "7", name: "Weather API", created_at: "2026-10-29T00:00:00Z", updated_at: "2026-10-29T00:00:00Z", environment: [{ name: "API_KEY", configured: true, state_version: "1", status: "active" as const }] }
const makeEngine = () => createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<ConversationStore>(null) })
const reader = () => ({ listMcpConnections: vi.fn().mockResolvedValue({ connections: [] }), getMcpConnector: vi.fn(), listCustomApis: vi.fn().mockResolvedValue({ items: [profile], page: { next_cursor: null } }) })
const originalUrl = window.location.href
beforeEach(() => window.history.replaceState(null, "", "/app"))
afterEach(() => { cleanup(); window.localStorage.clear(); vi.restoreAllMocks(); window.history.replaceState(null, "", originalUrl) })
it("reads real API profiles once and captures their exact version without mixing Connection IDs", async () => {
  const engine = makeEngine(), client = reader()
  const hook = renderHook(() => useComposerConnections({ engine, client, boundary, enforceSubjectMarker: false }))
  await waitFor(() => expect(hook.result.current.customApiItems?.map(item => item.name)).toEqual(["Weather API"]))
  expect(engine.getSnapshot().selectedCustomApiProfiles).toEqual([])
  act(() => hook.result.current.toggleCustomApi!(profile.profile_id))
  expect(engine.getSnapshot().selectedCustomApiProfiles).toEqual([{ profileId: "same:id", expectedStateVersion: "7" }])
  expect(engine.getSnapshot().selectedMcpConnectionIds).toEqual([])
  act(() => hook.result.current.toggleCustomApi!(profile.profile_id))
  expect(client.listCustomApis).toHaveBeenCalledTimes(1)
  expect(client.getMcpConnector).not.toHaveBeenCalled()
  engine.dispose()
})
it("does not publish API candidates or late selection callbacks after actor retirement", async () => {
  const engine = makeEngine(), client = reader()
  let finish!: (value: { items: typeof profile[]; page: { next_cursor: null } }) => void
  client.listCustomApis.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const hook = renderHook(({ subject }) => useComposerConnections({ engine, client, boundary: { ...boundary, subject }, enforceSubjectMarker: false }), { initialProps: { subject: "actor:a" } })
  const stale = hook.result.current.toggleCustomApi
  hook.rerender({ subject: "actor:b" })
  await act(async () => { await settle(); finish({ items: [{ ...profile, name: "Old actor API" }], page: { next_cursor: null } }); await settle() })
  expect(hook.result.current.customApiItems?.map(item => item.name)).toEqual(["Weather API"])
  act(() => stale?.(profile.profile_id))
  expect(engine.getSnapshot().selectedCustomApiProfiles).toEqual([])
  engine.dispose()
})
it("renders API and MCP controls independently even when their raw IDs collide", async () => {
  const toggle = vi.fn(), toggleCustomApi = vi.fn()
  render(<LocaleProvider><ComposerConnections controller={{ items: [{ id: "same:id", name: "Docs MCP", selectable: true, availability: "available" }], selectedIds: ["same:id"], status: "ready", refresh: vi.fn(), loadMore: vi.fn(), nextCursor: undefined, toggle, customApiItems: [{ id: "same:id", name: "Weather API", stateVersion: "7" }], selectedCustomApiProfiles: [], toggleCustomApi }} onAdd={vi.fn()} onManage={vi.fn()} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: /Connectors/ }))
  expect(screen.getByRole("switch", { name: "Docs MCP" })).toHaveAttribute("aria-checked", "true")
  const api = screen.getByRole("switch", { name: "Weather API" })
  expect(api).toHaveAttribute("aria-checked", "false")
  fireEvent.click(api)
  expect(toggleCustomApi).toHaveBeenCalledWith("same:id")
  expect(toggle).not.toHaveBeenCalled()
})
it("uses one paged API list, never enables by default or silently rebases a chosen profile version", async () => {
  const engine = makeEngine(), client = reader()
  client.listCustomApis.mockResolvedValueOnce({ items: [profile], page: { next_cursor: "api-page2" } }).mockResolvedValueOnce({ items: [{ ...profile, profile_id: "other", name: "Second API" }], page: { next_cursor: null } })
  const hook = renderHook(() => useComposerConnections({ engine, client, boundary, enforceSubjectMarker: false }))
  await waitFor(() => expect(hook.result.current.customApiItems?.length).toBe(1))
  expect(engine.getSnapshot().selectedCustomApiProfiles).toEqual([])
  act(() => hook.result.current.toggleCustomApi!(profile.profile_id))
  await act(async () => { hook.result.current.loadMore(); await settle() })
  expect(hook.result.current.customApiItems?.map(item => item.name)).toEqual(["Weather API", "Second API"])
  expect(client.listCustomApis).toHaveBeenCalledTimes(2)
  expect(client.listCustomApis.mock.calls[1]?.[0]).toMatchObject({ cursor: "api-page2" })
  client.listCustomApis.mockResolvedValue({ items: [{ ...profile, state_version: "8" }], page: { next_cursor: null } })
  await act(async () => { hook.result.current.refresh(); await settle() })
  expect(hook.result.current.customApiItems?.[0]?.stateVersion).toBe("8")
  expect(engine.getSnapshot().selectedCustomApiProfiles).toEqual([{ profileId: "same:id", expectedStateVersion: "7" }])
  engine.dispose()
})
it("revalidates restored safe references over the complete API list without replacing their original version", async () => {
  const base = makeEngine(), client = reader()
  const candidate = { sessionId: "existing", sourceMessageId: "original-user", profiles: [{ profileId: "same:id", expectedStateVersion: "7" }, { profileId: "later", expectedStateVersion: "5" }] }
  const snapshot = { ...base.getSnapshot(), customApiSelectionRestore: candidate }
  const restore = vi.fn()
  const engine = { ...base, getSnapshot: () => snapshot, restoreCustomApiSelection: restore }
  client.listCustomApis.mockResolvedValueOnce({ items: [{ ...profile, state_version: "8" }], page: { next_cursor: "later-page" } })
    .mockResolvedValueOnce({ items: [{ ...profile, profile_id: "later", state_version: "5" }], page: { next_cursor: null } })
  const hook = renderHook(() => useComposerConnections({ engine, client, boundary, enforceSubjectMarker: false }))
  await waitFor(() => expect(restore).toHaveBeenCalledWith(candidate, [{ profileId: "later", expectedStateVersion: "5" }]))
  expect(client.listCustomApis).toHaveBeenCalledTimes(2)
  expect(hook.result.current.customApiItems?.length).toBe(2)
  expect(base.getSnapshot().selectedMcpConnectionIds).toEqual([])
  hook.unmount(); base.dispose()
})

it("submits the real API menu choice from AppFrame without opening management or sending a credential", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const client = createFakeClient(), hub = { ...createPreviewHubClient(), ...reader() }
  vi.spyOn(pageClients, "browserListClient").mockReturnValue(client)
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(null) })
  try {
    render(<ThemeProvider><LocaleProvider><AppFrame engine={engine} chatHref="/app" navigation={[{ key: "chat", label: "新对话", featureFlag: "chat" }, { key: "mcp", label: "连接器" }]} featureFlags={[{ key: "chat", enabled: true }, { key: "workspace.resources", enabled: true }, { key: "workspace.skills", enabled: true }]} workspaceCapabilities={{ instructions: true, connectors: false, resources: true, skills: true, projectConversations: true }} /></LocaleProvider></ThemeProvider>)
    await act(async () => { await settle() })
    fireEvent.click(screen.getByRole("button", { name: "连接器 (0)" }))
    const row = await screen.findByRole("switch", { name: "Weather API" })
    fireEvent.click(row)
    expect(row).toHaveAttribute("aria-checked", "true")
    expect(screen.queryByRole("heading", { name: "设置" })).not.toBeInTheDocument()
    fireEvent.keyDown(row, { key: "Escape" })
    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "Use my selected API" } })
    expect(engine.getSnapshot().selectedCustomApiProfiles).toEqual([{ profileId: "same:id", expectedStateVersion: "7" }])
    fireEvent.submit(screen.getByRole("form", { name: "消息编辑区" }))
    await act(async () => { await settle() })
    expect(client.createCalls[0]?.body).toHaveProperty("selected_custom_api_profiles", [{ profile_id: "same:id", expected_state_version: 7 }])
    expect(client.createCalls[0]?.body).not.toHaveProperty("selected_mcp_connection_ids")
    expect(JSON.stringify(client.createCalls[0]?.body)).not.toContain("API_KEY")
  } finally { engine.dispose() }
})
it("keeps Project API choices local and rejects a previous draft callback without clearing its retained conversation", async () => {
  const engine = makeEngine(), client = reader(), first = {}, second = {}
  engine.setSelectedCustomApiProfiles!([{ profileId: "retained-api", expectedStateVersion: "3" }])
  let current: object = first
  const hook = renderHook(({ context }) => {
    const [choice, setChoice] = useState<{ context: object; values: readonly { profileId: string; expectedStateVersion: string }[] }>({ context, values: [] })
    return useComposerConnections({ engine, client, boundary, enforceSubjectMarker: false, localDraft: { context, selectedIds: [], update: () => undefined, isCurrent: () => current === context,
      selectedCustomApiProfiles: choice.context === context ? choice.values : [], updateCustomApis: change => setChoice(previous => current === context ? { context, values: change(previous.context === context ? previous.values : []) } : previous) } })
  }, { initialProps: { context: first } })
  await waitFor(() => expect(hook.result.current.customApiItems?.length).toBe(1))
  act(() => hook.result.current.toggleCustomApi!("same:id"))
  expect(hook.result.current.selectedCustomApiProfiles).toEqual([{ profileId: "same:id", expectedStateVersion: "7" }])
  expect(engine.getSnapshot().selectedCustomApiProfiles).toEqual([{ profileId: "retained-api", expectedStateVersion: "3" }])
  const stale = hook.result.current.toggleCustomApi
  current = second; hook.rerender({ context: second })
  await act(async () => { await settle(); stale?.("same:id") })
  expect(hook.result.current.selectedCustomApiProfiles).toEqual([])
  expect(engine.getSnapshot().selectedCustomApiProfiles).toEqual([{ profileId: "retained-api", expectedStateVersion: "3" }])
  hook.unmount(); engine.dispose()
})
it("does not restart an in-flight API list when the independently ready MCP menu is opened/refreshed", async () => {
  const engine = makeEngine(), client = reader()
  let finish!: (value: { items: typeof profile[]; page: { next_cursor: null } }) => void
  client.listCustomApis.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const hook = renderHook(() => useComposerConnections({ engine, client, boundary, enforceSubjectMarker: false }))
  await waitFor(() => expect(hook.result.current.status).toBe("ready"))
  act(() => hook.result.current.refresh())
  await act(async () => { await settle() })
  expect(client.listCustomApis).toHaveBeenCalledTimes(1)
  await act(async () => { finish({ items: [profile], page: { next_cursor: null } }); await settle() })
  expect(hook.result.current.customApiItems?.[0]?.name).toBe("Weather API")
  hook.unmount(); engine.dispose()
})
it.each(["error", "loading"] as const)("keeps ready API pagination reachable independently of MCP %s", status => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const loadMore = vi.fn()
  render(<LocaleProvider><ComposerConnections controller={{ items: [], selectedIds: [], status, refresh: vi.fn(), nextCursor: undefined, loadMore, toggle: vi.fn(), customApiStatus: "ready", customApiNextCursor: "api-more", customApiItems: [{ id: "api:first", name: "First API", stateVersion: "7" }], selectedCustomApiProfiles: [], toggleCustomApi: vi.fn() }} onAdd={vi.fn()} onManage={vi.fn()} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "连接器 (0)" }))
  expect(screen.getByRole("switch", { name: "First API" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }))
  expect(loadMore).toHaveBeenCalledTimes(1)
})
