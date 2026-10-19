import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { createHubClient } from "@/hub/client"
import type { McpConnectorProvider } from "@/hub/mcp-connector.schema"
import { LocaleProvider } from "@/i18n/context"
import { McpProviderCatalogDialog } from "@/ui/mcp/mcp-provider-catalog-dialog"
import { McpProviderDirectory } from "@/ui/mcp/mcp-provider-directory"
import { useMcpProviderDirectory } from "@/ui/mcp/use-mcp-provider-directory"

const provider = (key: string): McpConnectorProvider => ({ provider_key: key, display_name: key, directory_type: "app", category_keys: [], example_prompts: [], enabled: true, state_version: "1" })
const seed = { items: [provider("first")], next_cursor: "page-two" }
afterEach(cleanup)

it("sends search/category to the owner, appends opaque cursor pages and does not refilter owner matches", async () => {
  const list = vi.fn().mockResolvedValueOnce({ items: [provider("semantic-match")], next_cursor: "search-two" })
    .mockResolvedValueOnce({ items: [provider("remote-match")], next_cursor: null })
  const client = { ...createHubClient(), listMcpConnectorProviders: list }
  const { result, rerender } = renderHook(({ query, category }) => useMcpProviderDirectory({ client, identity: "alice", admitted: true, readGeneration: 0, seed, query, category }), { initialProps: { query: "", category: "all" } })
  expect(result.current.items).toEqual(seed.items)
  expect(list).not.toHaveBeenCalled()
  rerender({ query: "workflow", category: "development" })
  expect(result.current.items).toEqual([])
  await waitFor(() => expect(result.current.items[0]?.provider_key).toBe("semantic-match"))
  expect(list).toHaveBeenLastCalledWith({ limit: 100, query: "workflow", category_key: "development" }, expect.any(AbortSignal))
  act(() => result.current.loadMore())
  await waitFor(() => expect(result.current.items).toHaveLength(2))
  expect(list).toHaveBeenLastCalledWith({ limit: 100, query: "workflow", category_key: "development", cursor: "search-two" }, expect.any(AbortSignal))
  render(<LocaleProvider><McpProviderDirectory providers={result.current.items} query="workflow" categoryFilter="development" onCategoryFilterChange={vi.fn()} onSelectProvider={vi.fn()} /></LocaleProvider>)
  expect(screen.getByRole("button", { name: "semantic-match" })).toBeInTheDocument()
})

it("retires old filter/actor responses and keeps loaded rows through a failed explicit continuation", async () => {
  let late!: (value: typeof seed) => void
  const list = vi.fn().mockImplementationOnce(() => new Promise(resolve => { late = resolve }))
    .mockResolvedValueOnce({ items: [provider("current")], next_cursor: "current-two" })
    .mockRejectedValueOnce(Error("offline"))
    .mockResolvedValueOnce({ items: [provider("continued")], next_cursor: null })
  const client = { ...createHubClient(), listMcpConnectorProviders: list }
  const { result, rerender } = renderHook(({ query, admitted, readGeneration }) => useMcpProviderDirectory({ client, identity: "alice", admitted, readGeneration, seed, query, category: "all" }), { initialProps: { query: "old", admitted: true, readGeneration: 0 } })
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
  const oldSignal = list.mock.calls[0]![1] as AbortSignal
  rerender({ query: "current", admitted: true, readGeneration: 0 })
  await waitFor(() => expect(result.current.items[0]?.provider_key).toBe("current"))
  expect(oldSignal.aborted).toBe(true)
  await act(async () => late(seed))
  expect(result.current.items[0]?.provider_key).toBe("current")
  act(() => result.current.loadMore())
  await waitFor(() => expect(result.current.error).toBe(true))
  expect(result.current.items[0]?.provider_key).toBe("current")
  act(() => result.current.loadMore())
  await waitFor(() => expect(result.current.items).toHaveLength(2))
  rerender({ query: "current", admitted: false, readGeneration: 1 })
  expect(result.current.items).toEqual([])
})

it("offers keyboard category selection and continuation without replacing the search controls", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const loadMore = vi.fn(), selectCategory = vi.fn()
  render(<LocaleProvider><McpProviderDirectory providers={seed.items} query="" showSearch categoryFilter="all" onCategoryFilterChange={selectCategory} onSelectProvider={vi.fn()} onLoadMore={loadMore} hasMore /></LocaleProvider>)
  const search = screen.getByRole("searchbox")
  fireEvent.keyDown(screen.getByRole("button", { name: "全部", expanded: false }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "开发" }))
  expect(selectCategory).toHaveBeenCalledExactlyOnceWith("development")
  expect(screen.getByRole("searchbox")).toBe(search)
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }))
  expect(loadMore).toHaveBeenCalledOnce()
  expect(screen.getByRole("searchbox")).toBeInTheDocument()
})

it("stops a repeated provider cursor and explicitly restarts from the first page without discarding rows", async () => {
  const list = vi.fn().mockResolvedValueOnce({ items: [provider("discard-loop")], next_cursor: "page-two" })
    .mockResolvedValueOnce({ items: [provider("restarted")], next_cursor: "page-two" })
    .mockResolvedValueOnce({ items: [provider("last")], next_cursor: null })
  const client = { ...createHubClient(), listMcpConnectorProviders: list }
  const { result } = renderHook(() => useMcpProviderDirectory({ client, identity: "loop", admitted: true, readGeneration: 0, seed, query: "", category: "all" }))
  act(() => result.current.loadMore())
  await waitFor(() => expect(result.current.error).toBe(true))
  expect(result.current.items).toEqual(seed.items)
  expect(result.current.hasMore).toBe(false)
  act(() => result.current.loadMore())
  expect(list).toHaveBeenCalledTimes(1)
  act(() => result.current.retry())
  await waitFor(() => expect(result.current.items[0]?.provider_key).toBe("restarted"))
  expect(list).toHaveBeenLastCalledWith({ limit: 100 }, expect.any(AbortSignal))
  expect(result.current.error).toBe(false)
  act(() => result.current.loadMore())
  await waitFor(() => expect(result.current.items.map(item => item.provider_key)).toEqual(["restarted", "last"]))
  expect(list).toHaveBeenCalledTimes(3)
})


it("hands category focus between the rail and menu when the actual localized labels stop fitting", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  let available = 640
  const resize = new Set<ResizeObserverCallback>()
  const original = window.ResizeObserver
  const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => available)
  const measured = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(412)
  window.ResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) { resize.add(callback) }
    observe() {}
    unobserve() {}
    disconnect() { resize.delete(this.callback) }
  } as typeof ResizeObserver
  try {
    render(<LocaleProvider><McpProviderCatalogDialog open providers={seed.items} loading={false} hasMore={false}
      onLoadMore={vi.fn()} error={false} query="" categoryFilter="all" returnFocusRef={{ current: null }}
      onOpenChange={vi.fn()} onQueryChange={vi.fn()} onCategoryFilterChange={vi.fn()} onRetry={vi.fn()}
      onSelectProvider={vi.fn()} /></LocaleProvider>)
    const rail = screen.getByRole("button", { name: "开发", pressed: false })
    act(() => rail.focus())
    await act(async () => { available = 300; for (const callback of resize) callback([], {} as ResizeObserver) })
    await waitFor(() => expect(screen.getByRole("button", { name: "全部", expanded: false })).toHaveFocus())
    await act(async () => { available = 640; for (const callback of resize) callback([], {} as ResizeObserver) })
    expect(screen.getByRole("button", { name: "全部", pressed: true })).toHaveFocus()
  } finally {
    cleanup()
    width.mockRestore(); measured.mockRestore(); window.ResizeObserver = original
  }
})
