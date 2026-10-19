import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { createHubClient } from "@/hub/client"
import type { McpConnectorProvider } from "@/hub/mcp-connector.schema"
import { LocaleProvider } from "@/i18n/context"
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

it("offers a keyboard-reachable continuation without replacing the search controls", () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const loadMore = vi.fn()
  render(<LocaleProvider><McpProviderDirectory providers={seed.items} query="" showSearch categoryFilter="all" onCategoryFilterChange={vi.fn()} onSelectProvider={vi.fn()} onLoadMore={loadMore} hasMore /></LocaleProvider>)
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
