import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { createHubClient, HubClientError, type HubClient } from "@/hub/client"
import type { CustomApiProfile } from "@/hub/custom-api.schema"
import { LocaleProvider } from "@/i18n/context"
import { ConnectorCommandProvider } from "@/ui/mcp/connector-command-context"
import { McpProjectionRead } from "@/ui/mcp/mcp-projection-read"
import { McpCustomApiGallery, visibleCustomApiGalleryProfiles } from "@/ui/mcp/mcp-custom-api-gallery"
import { McpConnectionList } from "@/ui/mcp/mcp-connection-list"
import { McpCustomApiCard } from "@/ui/mcp/mcp-custom-api-card"
import { invalidateCustomApiProjection } from "@/ui/mcp/use-custom-api-projection"
import { invalidateMcpConnectorProjection } from "@/ui/mcp/use-mcp-projection"

const profile = {
  profile_id: "my-api-exact", name: "My actual API", instructions: "Saved API instructions",
  state_version: "2", environment: [], created_at: "2026-10-25T00:00:00Z", updated_at: "2026-10-25T00:00:00Z",
} satisfies CustomApiProfile

function recoveryFixture() {
  const client = { ...createHubClient(),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    createCustomApi: vi.fn(), createMcpConnector: vi.fn(), preparePrivateMcpServer: vi.fn(),
  }
  const subject = crypto.randomUUID()
  const content = (generation = 0, admitted = true, actor = subject) => <LocaleProvider>
    <ConnectorCommandProvider client={client} boundary={{ subject: actor, admitted, generation }}>
      <McpProjectionRead client={client} identity={actor} admitted={admitted} readGeneration={generation} embedded initialView="connections" settingsLayout />
    </ConnectorCommandProvider>
  </LocaleProvider>
  return { client, subject, content }
}

it.each([false, true])("keeps the actual filtered provider retry mounted through pending and failure (dialog=%s)", async dialog => {
  localStorage.setItem("kokoro.locale", "zh")
  const f = recoveryFixture()
  let fail!: (error: Error) => void
  const { container } = render(<LocaleProvider><ConnectorCommandProvider client={f.client} boundary={{ subject: f.subject, admitted: true, generation: 0 }}>
    <McpProjectionRead client={f.client} identity={f.subject} embedded initialView="catalog"
      {...(dialog ? { catalogDialog: { open: true, onOpenChange: vi.fn(), returnFocusRef: { current: null } } } : {})} />
  </ConnectorCommandProvider></LocaleProvider>)
  await waitFor(() => expect(f.client.listMcpConnectorProviders).toHaveBeenCalledOnce())
  const surface = within(dialog ? screen.getByRole("dialog") : container)
  f.client.listMcpConnectorProviders.mockRejectedValueOnce(Error("filtered"))
    .mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
  fireEvent.change(surface.getByRole("searchbox"), { target: { value: "workflow" } })
  const retry = await surface.findByRole("button", { name: "重新加载连接器目录" })
  retry.focus()
  fireEvent.click(retry)
  expect(retry.isConnected).toBe(true)
  expect(retry).toBeDisabled()
  retry.blur()
  await act(async () => fail(Error("again")))
  expect(surface.getByRole("button", { name: "重新加载连接器目录" })).toBe(retry)
  expect(retry).toHaveFocus()
  expect(retry).toBeEnabled()
  expect(f.client.listMcpConnectorProviders).toHaveBeenLastCalledWith({ limit: 100, query: "workflow" }, expect.any(AbortSignal))
  expect(f.client.createMcpConnector).not.toHaveBeenCalled()
})

it("shows an API503 locally and retries only that GET once despite repeated clicks", async () => {
  localStorage.setItem("kokoro.locale", "zh")
  const f = recoveryFixture()
  let finish!: (value: { items: CustomApiProfile[]; page: { next_cursor: null } }) => void
  f.client.listCustomApis.mockRejectedValueOnce(new HubClientError("http", "private", null, 503))
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(f.content())
  expect(await screen.findByText("自定义 API 加载失败")).toBeVisible()
  const retry = screen.getByRole("button", { name: "重新加载 API" })
  act(() => { fireEvent.click(retry); fireEvent.click(retry) })
  await waitFor(() => expect(f.client.listCustomApis).toHaveBeenCalledTimes(2))
  expect(retry).toBeDisabled()
  expect(f.client.listMcpConnectors).toHaveBeenCalledOnce()
  expect(f.client.listMcpConnectorProviders).toHaveBeenCalledOnce()
  await act(async () => finish({ items: [profile], page: { next_cursor: null } }))
  expect(await screen.findByRole("button", { name: profile.name })).toBeVisible()
  expect(screen.queryByText("自定义 API 加载失败")).not.toBeInTheDocument()
  expect(f.client.createCustomApi).not.toHaveBeenCalled()
  expect(f.client.createMcpConnector).not.toHaveBeenCalled()
  expect(f.client.preparePrivateMcpServer).not.toHaveBeenCalled()
})

it.each(["api", "connectors"])("retires a previously confirmed full-empty claim when %s refresh fails", async source => {
  localStorage.setItem("kokoro.locale", "zh")
  const f = recoveryFixture()
  render(f.content())
  expect(await screen.findByText("将 Kokoro 与你的日常应用程序、API 和 MCP 连接起来")).toBeVisible()
  if (source === "api") {
    f.client.listCustomApis.mockRejectedValueOnce(new HubClientError("http", "private", null, 503))
    act(() => invalidateCustomApiProjection(f.client, f.subject))
  } else {
    f.client.listMcpConnectors.mockRejectedValueOnce(new HubClientError("http", "private", null, 503))
    act(() => invalidateMcpConnectorProjection(f.client, f.subject))
  }
  expect(await screen.findByText(source === "api" ? "自定义 API 加载失败" : "已添加的连接器加载失败")).toBeVisible()
  expect(screen.queryByText("将 Kokoro 与你的日常应用程序、API 和 MCP 连接起来")).not.toBeInTheDocument()
  expect(screen.queryByText("没有匹配的连接")).not.toBeInTheDocument()
})

it("retries only the failed connector page and releases the retry latch after another failure", async () => {
  localStorage.setItem("kokoro.locale", "zh")
  const f = recoveryFixture()
  let fail!: (error: Error) => void
  f.client.listMcpConnectors.mockRejectedValueOnce(Error("first"))
    .mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
  render(f.content())
  const retry = await screen.findByRole("button", { name: "重新加载已添加的连接器" })
  act(() => { fireEvent.click(retry); fireEvent.click(retry) })
  await waitFor(() => expect(f.client.listMcpConnectors).toHaveBeenCalledTimes(2))
  expect(retry).toBeDisabled()
  await act(async () => fail(Error("again")))
  await waitFor(() => expect(retry).toBeEnabled())
  fireEvent.click(retry)
  expect(await screen.findByText("将 Kokoro 与你的日常应用程序、API 和 MCP 连接起来")).toBeVisible()
  expect(f.client.listMcpConnectors).toHaveBeenCalledTimes(3)
  expect(f.client.listCustomApis).toHaveBeenCalledOnce()
  expect(f.client.listMcpConnectorProviders).toHaveBeenCalledOnce()
  expect(f.client.createMcpConnector).not.toHaveBeenCalled()
})

it.each(["subject", "generation"])("retires an API retry's late result after changing %s", async change => {
  localStorage.setItem("kokoro.locale", "zh")
  const f = recoveryFixture()
  let finish!: (value: { items: CustomApiProfile[]; page: { next_cursor: null } }) => void
  const current = { ...profile, profile_id: "current-api", name: "Current API" }
  f.client.listCustomApis.mockRejectedValueOnce(Error("first"))
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    .mockResolvedValueOnce({ items: [current], page: { next_cursor: null } })
  const { rerender } = render(f.content())
  fireEvent.click(await screen.findByRole("button", { name: "重新加载 API" }))
  await waitFor(() => expect(f.client.listCustomApis).toHaveBeenCalledTimes(2))
  rerender(f.content(1, true, change === "subject" ? "replacement-owner" : f.subject))
  expect(await screen.findByRole("button", { name: current.name })).toBeVisible()
  await act(async () => finish({ items: [profile], page: { next_cursor: null } }))
  expect(screen.queryByRole("button", { name: profile.name })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: current.name })).toBeVisible()
  expect(f.client.listCustomApis).toHaveBeenCalledTimes(3)
  expect(f.client.createCustomApi).not.toHaveBeenCalled()
})

afterEach(() => { cleanup(); window.sessionStorage.clear() })

it("keeps a confirmed personal API discoverable and opens its exact detail when the provider catalog is empty", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const get = vi.fn().mockResolvedValue(profile)
  const client = { ...createHubClient(),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [profile], page: { next_cursor: null } }),
    getCustomApi: get, createCustomApi: vi.fn(), createMcpConnector: vi.fn(), preparePrivateMcpServer: vi.fn(),
  }
  const boundary = { subject: "gallery-actor", admitted: true, generation: 0 }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={boundary}>
    <McpProjectionRead client={client} identity={boundary.subject} embedded initialView="catalog" />
  </ConnectorCommandProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: profile.name }))
  expect(await screen.findByRole("dialog")).toBeInTheDocument()
  expect(screen.getByDisplayValue(profile.name)).toBeInTheDocument()
  expect(screen.queryByText("当前没有可添加的连接器提供方。")).not.toBeInTheDocument()
  expect(client.createCustomApi).not.toHaveBeenCalled()
  expect(client.createMcpConnector).not.toHaveBeenCalled()
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled()
})

it("uses exact API identities for duplicate display names in both shared card presentations", () => {
  const other = { ...profile, profile_id: "other-exact-api", instructions: "Other saved instructions" }
  const select = vi.fn()
  const { unmount } = render(<LocaleProvider><McpCustomApiGallery profiles={[profile, other]} admitted confirmed
    query="" category="all" onSelect={select} /></LocaleProvider>)
  const second = screen.getAllByRole("button", { name: profile.name })[1]!
  fireEvent.click(second)
  expect(select).toHaveBeenLastCalledWith(other, second)
  unmount()
  render(<LocaleProvider><McpConnectionList connectors={[]} customApis={[profile, other]} providers={[]} query="" brandName="Kokoro"
    onBrowse={vi.fn()} onEdit={vi.fn()} onSelectCustomApi={select} previousEnabled={false} nextEnabled={false}
    onPrevious={vi.fn()} onNext={vi.fn()} /></LocaleProvider>)
  const first = screen.getAllByRole("button", { name: profile.name })[0]!
  fireEvent.click(first)
  expect(select).toHaveBeenLastCalledWith(profile, first)
})

it.each([
  { admitted: false, confirmed: true },
  { admitted: true, confirmed: false },
])("retires private API facts when its admission/confirmed-read gate changes (%j)", gates => {
  const props = { profiles: [profile], admitted: true, confirmed: true, query: "", category: "all", onSelect: vi.fn() }
  const { rerender } = render(<LocaleProvider><McpCustomApiGallery {...props} /></LocaleProvider>)
  expect(screen.getByRole("button", { name: profile.name })).toBeInTheDocument()
  rerender(<LocaleProvider><McpCustomApiGallery {...props} {...gates} /></LocaleProvider>)
  expect(screen.queryByRole("button", { name: profile.name })).not.toBeInTheDocument()
  expect(screen.queryByText(profile.instructions)).not.toBeInTheDocument()
})

it("shares the visible-card predicate with the coordinator without inventing categories or empty claims", () => {
  const props = { profiles: [profile], admitted: true, confirmed: true, query: " SAVED API ", category: "all" }
  expect(visibleCustomApiGalleryProfiles(props)).toEqual([profile])
  expect(visibleCustomApiGalleryProfiles({ ...props, query: "MY ACTUAL" })).toEqual([profile])
  expect(visibleCustomApiGalleryProfiles({ ...props, category: "efficiency" })).toEqual([])
  expect(visibleCustomApiGalleryProfiles({ ...props, query: "absent" })).toEqual([])
  render(<LocaleProvider><McpCustomApiGallery {...props} profiles={[]} onSelect={vi.fn()} /></LocaleProvider>)
  expect(screen.queryByRole("region")).not.toBeInTheDocument()
  expect(screen.queryByText("当前没有可添加的连接器提供方。")).not.toBeInTheDocument()
})

function renderProjection(list: NonNullable<HubClient["listCustomApis"]>, subject: string, view: "catalog" | "connections" = "catalog") {
  window.localStorage.setItem("kokoro.locale", "zh")
  const client = { ...createHubClient(), listCustomApis: list,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    createCustomApi: vi.fn(), createMcpConnector: vi.fn(), preparePrivateMcpServer: vi.fn(),
  }
  const boundary = { subject, admitted: true, generation: 0 }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={boundary}>
    <McpProjectionRead client={client} identity={subject} embedded initialView={view} settingsLayout={view === "connections"} />
  </ConnectorCommandProvider></LocaleProvider>)
  return client
}

it("shows an initial API read failure locally and recovers on its GET retry without creating or preparing anything", async () => {
  const list = vi.fn().mockRejectedValueOnce(new Error("API read unavailable"))
    .mockResolvedValue({ items: [profile], page: { next_cursor: null } })
  const client = renderProjection(list, "gallery-head-retry")
  expect(await screen.findByText("自定义 API 加载失败")).toBeVisible()
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: profile.name })).not.toBeInTheDocument()
  expect(screen.queryByText("当前没有可添加的连接器提供方。")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "重新加载 API" }))
  fireEvent.click(await screen.findByRole("button", { name: profile.name }))
  const detail = await screen.findByRole("dialog", { name: "编辑自定义 API" })
  expect(within(detail).getByDisplayValue(profile.instructions)).toBeInTheDocument()
  expect(list).toHaveBeenCalledTimes(2)
  expect(list.mock.calls.map(call => call[0])).toEqual([{ limit: 100 }, { limit: 100 }])
  expect(client.createCustomApi).not.toHaveBeenCalled()
  expect(client.createMcpConnector).not.toHaveBeenCalled()
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled()
})

it("keeps a confirmed API card readable through a failed refresh without granting stale detail admission", async () => {
  const list = vi.fn().mockResolvedValueOnce({ items: [profile], page: { next_cursor: null } })
    .mockRejectedValue(Error("refresh unavailable"))
  const client = renderProjection(list, "gallery-quiet-refresh")
  const card = await screen.findByRole("button", { name: profile.name })
  act(() => invalidateCustomApiProjection(client, "gallery-quiet-refresh"))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  expect(await screen.findByText("自定义 API 加载失败")).toBeVisible()
  expect(screen.getByRole("button", { name: profile.name })).toBe(card)
  fireEvent.click(card)
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(client.createCustomApi).not.toHaveBeenCalled()
  expect(client.createMcpConnector).not.toHaveBeenCalled()
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled()
})

it("does not carry the confirmed API display across admission retirement or another subject", async () => {
  const list = vi.fn().mockResolvedValueOnce({ items: [profile], page: { next_cursor: null } })
    .mockImplementation(() => new Promise(() => {}))
  const client = { ...createHubClient(), listCustomApis: list,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
  }
  const content = (subject: string, admitted: boolean, generation: number) => <LocaleProvider>
    <ConnectorCommandProvider client={client} boundary={{ subject, admitted, generation }}>
      <McpProjectionRead client={client} identity={subject} admitted={admitted} readGeneration={generation} embedded />
    </ConnectorCommandProvider>
  </LocaleProvider>
  const { rerender } = render(content("original-display-owner", true, 0))
  expect(await screen.findByRole("button", { name: profile.name })).toBeVisible()
  rerender(content("original-display-owner", false, 1))
  expect(screen.queryByRole("button", { name: profile.name })).not.toBeInTheDocument()
  rerender(content("new-display-owner", true, 2))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole("button", { name: profile.name })).not.toBeInTheDocument()
  expect(screen.queryByText("当前没有可添加的连接器提供方。")).not.toBeInTheDocument()
})

it("exposes opaque continuation retry and distinct same-name API details, then stops a repeated cursor in the plaza", async () => {
  const other = { ...profile, profile_id: "page-two-exact-api", instructions: "Second page exact API instructions" }
  const list = vi.fn()
    .mockResolvedValueOnce({ items: [profile], page: { next_cursor: "opaque_head_A9" } })
    .mockRejectedValueOnce(new Error("continuation read unavailable"))
    .mockResolvedValueOnce({ items: [other], page: { next_cursor: "opaque_tail_Z7" } })
    .mockResolvedValueOnce({ items: [{ ...profile, profile_id: "repeated-page-not-confirmed", name: "Must not append" }], page: { next_cursor: "opaque_tail_Z7" } })
  const client = renderProjection(list, "gallery-continuation-retry")
  fireEvent.click(await screen.findByRole("button", { name: "加载更多 · API" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "重试加载更多 · API" })).toBeEnabled())
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(screen.getAllByRole("button", { name: profile.name })).toHaveLength(1)
  expect(list).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole("button", { name: "重试加载更多 · API" }))
  await waitFor(() => expect(screen.getAllByRole("button", { name: profile.name })).toHaveLength(2))
  expect(list.mock.calls[1]?.[0]).toEqual({ limit: 100, cursor: "opaque_head_A9" })
  expect(list.mock.calls[2]?.[0]).toEqual(list.mock.calls[1]?.[0])
  for (const [index, expected] of [profile, other].entries()) {
    fireEvent.click(screen.getAllByRole("button", { name: profile.name })[index]!)
    const detail = await screen.findByRole("dialog", { name: "编辑自定义 API" })
    expect(within(detail).getByDisplayValue(expected.instructions)).toBeInTheDocument()
    fireEvent.click(within(detail).getByRole("button", { name: "取消" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  }
  fireEvent.click(screen.getByRole("button", { name: "加载更多 · API" }))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(4))
  expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "加载更多 · API" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Must not append" })).not.toBeInTheDocument()
  expect(screen.getAllByRole("button", { name: profile.name })).toHaveLength(2)
  expect(list).toHaveBeenCalledTimes(4)
  expect(list.mock.calls[3]?.[0]).toEqual({ limit: 100, cursor: "opaque_tail_Z7" })
  expect(client.createCustomApi).not.toHaveBeenCalled()
  expect(client.createMcpConnector).not.toHaveBeenCalled()
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled()
})

it.each(["failed", "pending"] as const)("keeps a confirmed empty provider category visible when the unrelated API head is %s", async state => {
  const list = state === "failed" ? vi.fn().mockRejectedValue(new Error("API head unavailable"))
    : vi.fn().mockImplementation(() => new Promise(() => {}))
  const client = renderProjection(list, `gallery-category-${state}`)
  if (state === "failed") expect(await screen.findByText("自定义 API 加载失败")).toBeVisible()
  else await waitFor(() => expect(list).toHaveBeenCalledOnce())
  fireEvent.keyDown(await screen.findByRole("button", { name: "全部", expanded: false }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "效率" }))
  await waitFor(() => expect(client.listMcpConnectorProviders).toHaveBeenCalledWith(
    { limit: 100, category_key: "efficiency" }, expect.any(AbortSignal)))
  expect(await screen.findByText("没有匹配的连接")).toBeInTheDocument()
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: profile.name })).not.toBeInTheDocument()
  expect(list).toHaveBeenCalledOnce()
})

it("keeps an unknown API head from claiming empty management and recovers through the existing read invalidation", async () => {
  const list = vi.fn().mockRejectedValueOnce(new Error("API management head unavailable"))
    .mockResolvedValue({ items: [profile], page: { next_cursor: null } })
  const client = renderProjection(list, "management-api-head-retry", "connections")
  expect(await screen.findByText("自定义 API 加载失败")).toBeVisible()
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  expect(client.listMcpConnectors).toHaveBeenCalledOnce()
  expect(screen.queryByRole("button", { name: profile.name })).not.toBeInTheDocument()
  expect(screen.queryByText("将 Kokoro 与你的日常应用程序、API 和 MCP 连接起来")).not.toBeInTheDocument()
  act(() => invalidateCustomApiProjection(client, "management-api-head-retry"))
  fireEvent.click(await screen.findByRole("button", { name: profile.name }))
  const detail = await screen.findByRole("dialog", { name: "编辑自定义 API" })
  expect(within(detail).getByDisplayValue(profile.instructions)).toBeInTheDocument()
  expect(list).toHaveBeenCalledTimes(2)
  expect(client.listMcpConnectors).toHaveBeenCalledOnce()
  expect(client.createCustomApi).not.toHaveBeenCalled()
  expect(client.createMcpConnector).not.toHaveBeenCalled()
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled()
})

it.each(["management", "plaza"] as const)("uses the real name initial for an API without an icon in %s", presentation => {
  const api = { ...profile, name: "11231" }
  const select = vi.fn()
  render(<LocaleProvider><ul><McpCustomApiCard profile={api} presentation={presentation} onSelect={select} /></ul></LocaleProvider>)
  expect(screen.getByText("1")).toBeInTheDocument()
  const trigger = screen.getByRole("button", { name: api.name })
  fireEvent.click(trigger)
  expect(select).toHaveBeenCalledWith(api, trigger)
})

it("keeps the owner-bound icon path and falls back to the API initial when its preview fails or expires", () => {
  const api: CustomApiProfile = { ...profile, name: "11231", icon: {
    intent_id: "11111111-1111-4111-8111-111111111111", content_sha256: "a".repeat(64), mime_type: "image/png",
    size_bytes: "128", width: 24, height: 24,
    preview_reference: { url: "https://storage.example.test/exact-api-preview", method: "GET", required_headers: {}, expires_at: "2099-01-01T00:00:00Z" },
  } }
  const { container, rerender } = render(<LocaleProvider><ul><McpCustomApiCard profile={api} presentation="plaza" onSelect={vi.fn()} /></ul></LocaleProvider>)
  const image = container.querySelector("img")!
  expect(image).toHaveAttribute("src", api.icon!.preview_reference!.url)
  expect(image).toHaveAttribute("referrerpolicy", "no-referrer")
  expect(screen.queryByText("1")).not.toBeInTheDocument()
  fireEvent.error(image)
  expect(screen.getByText("1")).toBeInTheDocument()
  const expired = { ...api, icon: { ...api.icon!, preview_reference: { ...api.icon!.preview_reference!, expires_at: "2000-01-01T00:00:00Z" } } }
  rerender(<LocaleProvider><ul><McpCustomApiCard profile={expired} presentation="plaza" onSelect={vi.fn()} /></ul></LocaleProvider>)
  expect(container.querySelector("img")).not.toBeInTheDocument()
  expect(screen.getByText("1")).toBeInTheDocument()
})

it.each(["failed_head", "stale_head", "stale_tail"] as const)("a confirmed API removal cannot revive in either retained surface after %s", async scenario => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const other = { ...profile, profile_id: "unrelated-exact-api", name: "Another saved API" }
  let removed = false
  const list = vi.fn<NonNullable<HubClient["listCustomApis"]>>().mockImplementation(async query => {
    if (!removed) return { items: [profile, other], page: { next_cursor: null } }
    if (scenario === "failed_head") throw Error("confirmed delete but current head unavailable")
    if (scenario === "stale_tail") return query?.cursor
      ? { items: [profile], page: { next_cursor: null } }
      : { items: [other], page: { next_cursor: "opaque-after-delete" } }
    return { items: [profile, other], page: { next_cursor: null } }
  })
  const client = { ...createHubClient(),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: list, getCustomApi: vi.fn().mockResolvedValue(profile),
    removeCustomApi: vi.fn(async () => { removed = true }),
  }
  const boundary = { subject: `api-deletion-${scenario}`, admitted: true, generation: 0 }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={boundary}>
    <div data-testid="api-retained-plaza"><McpProjectionRead client={client} identity={boundary.subject} embedded initialView="catalog" /></div>
    <div data-testid="api-retained-management"><McpProjectionRead client={client} identity={boundary.subject} embedded settingsLayout initialView="connections" /></div>
  </ConnectorCommandProvider></LocaleProvider>)
  const plaza = within(screen.getByTestId("api-retained-plaza"))
  const management = within(screen.getByTestId("api-retained-management"))
  await plaza.findByRole("button", { name: profile.name })
  fireEvent.click(await management.findByRole("button", { name: profile.name }))
  const detail = await screen.findByRole("dialog", { name: "编辑自定义 API" })
  fireEvent.click(within(detail).getByRole("button", { name: "删除" }))
  fireEvent.click(within(detail).getByRole("button", { name: "确认移除" }))
  await waitFor(() => expect(client.removeCustomApi).toHaveBeenCalledOnce())
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  if (scenario === "stale_tail") {
    fireEvent.click(await plaza.findByRole("button", { name: "加载更多 · API" }))
    await waitFor(() => expect(list.mock.calls.some(([query]) => query?.cursor === "opaque-after-delete")).toBe(true))
  }
  await waitFor(() => {
    expect(plaza.queryByRole("button", { name: profile.name })).not.toBeInTheDocument()
    expect(management.queryByRole("button", { name: profile.name })).not.toBeInTheDocument()
  })
  expect(plaza.getByRole("button", { name: other.name })).toBeVisible()
  expect(management.getByRole("button", { name: other.name })).toBeVisible()
  expect(client.removeCustomApi).toHaveBeenCalledExactlyOnceWith(profile.profile_id, { expected_state_version: profile.state_version }, expect.any(String), expect.any(AbortSignal))
})


it.each([false, true])("refreshes a successful empty Provider directory through its existing GET without commands (dialog=%s)", async dialog => {
  localStorage.setItem("kokoro.locale", "zh")
  const f = recoveryFixture()
  const provider = { provider_key: "new-owner-provider", display_name: "New owner provider", directory_type: "app" as const,
    category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  let finish!: (value: { items: typeof provider[]; next_cursor: string | null }) => void
  const show = () => <LocaleProvider><ConnectorCommandProvider client={f.client} boundary={{ subject: f.subject, admitted: true, generation: 0 }}>
    <McpProjectionRead client={f.client} identity={f.subject} embedded initialView="catalog"
      {...(dialog ? { catalogDialog: { open: true, onOpenChange: vi.fn(), returnFocusRef: { current: null } } } : {})} />
  </ConnectorCommandProvider></LocaleProvider>
  const view = render(show())
  await waitFor(() => expect(f.client.listMcpConnectorProviders).toHaveBeenCalledOnce())
  // Returning to the same shell must keep its cached geometry, but explicit refresh must bypass it.
  view.unmount()
  const second = render(show())
  const surface = within(dialog ? screen.getByRole("dialog") : second.container)
  expect(f.client.listMcpConnectorProviders).toHaveBeenCalledOnce()
  const refresh = surface.getByRole("button", { name: "重新读取" })
  f.client.listMcpConnectorProviders.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  act(() => { fireEvent.click(refresh); fireEvent.click(refresh) })
  await waitFor(() => expect(f.client.listMcpConnectorProviders).toHaveBeenCalledTimes(2))
  expect(refresh).toBeDisabled()
  expect(surface.queryByText("连接器目录加载失败")).not.toBeInTheDocument()
  await act(async () => finish({ items: [provider], next_cursor: "new-tail" }))
  expect(await surface.findByRole("button", { name: provider.display_name })).toBeVisible()
  expect(refresh).toBeEnabled()
  const loadMore = surface.getByRole("button", { name: "加载更多" })
  f.client.listMcpConnectorProviders.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  fireEvent.click(refresh)
  await waitFor(() => expect(refresh).toBeDisabled())
  expect(surface.getByRole("button", { name: provider.display_name })).toBeVisible()
  expect(loadMore).toBeDisabled()
  await act(async () => finish({ items: [provider], next_cursor: null }))
  expect(surface.queryByRole("button", { name: "加载更多" })).not.toBeInTheDocument()
  // A filtered refresh must keep the owner query instead of silently reloading the unfiltered cache.
  fireEvent.change(surface.getByRole("searchbox"), { target: { value: "workflow" } })
  await waitFor(() => expect(f.client.listMcpConnectorProviders).toHaveBeenLastCalledWith({ limit: 100, query: "workflow" }, expect.any(AbortSignal)))
  await waitFor(() => expect(refresh).toBeEnabled())
  fireEvent.click(refresh)
  await waitFor(() => expect(f.client.listMcpConnectorProviders).toHaveBeenCalledTimes(5))
  expect(f.client.listMcpConnectorProviders).toHaveBeenLastCalledWith({ limit: 100, query: "workflow" }, expect.any(AbortSignal))
  expect(f.client.createCustomApi).not.toHaveBeenCalled()
  expect(f.client.createMcpConnector).not.toHaveBeenCalled()
  expect(f.client.preparePrivateMcpServer).not.toHaveBeenCalled()
})
