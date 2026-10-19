import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { createHubClient } from "@/hub/client"
import type { CustomApiPage } from "@/hub/custom-api.schema"
import { invalidateCustomApiProjection, useCustomApiProjection } from "@/ui/mcp/use-custom-api-projection"

const profile = (id: string) => ({ profile_id: id, name: id, state_version: "1", created_at: "2026-10-17T12:00:00Z", updated_at: "2026-10-17T12:00:00Z", environment: [] })
const page = (ids: string[], cursor: string | null): CustomApiPage => ({ items: ids.map(profile), page: { next_cursor: cursor } })
afterEach(cleanup)

it("appends opaque Custom API pages once, deduplicates IDs and retries without discarding confirmed rows", async () => {
  const list = vi.fn().mockResolvedValueOnce(page(["first"], "opaque-two"))
    .mockRejectedValueOnce(Error("offline"))
    .mockResolvedValueOnce(page(["first", "second"], null))
  const client = { ...createHubClient(), listCustomApis: list }
  const { result } = renderHook(() => useCustomApiProjection({ client, identity: "alice", refreshKey: 0 }))
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => result.current.loadMore())
  expect(result.current.loadMoreError).toBe(true)
  expect(result.current.data.items.map(item => item.profile_id)).toEqual(["first"])
  await act(async () => { void result.current.loadMore(); void result.current.loadMore() })
  expect(list).toHaveBeenCalledTimes(3)
  expect(list).toHaveBeenLastCalledWith({ limit: 100, cursor: "opaque-two" }, expect.any(AbortSignal))
  expect(result.current.data.items.map(item => item.profile_id)).toEqual(["first", "second"])
  expect(result.current.hasMore).toBe(false)
})

it("retires pending continuation on actor/admission change and confirmed mutation invalidation", async () => {
  let finish!: (value: CustomApiPage) => void
  const list = vi.fn().mockResolvedValueOnce(page(["old"], "two"))
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    .mockResolvedValue(page(["current"], null))
  const client = { ...createHubClient(), listCustomApis: list }
  const { result, rerender } = renderHook(({ identity, admitted, generation }) => useCustomApiProjection({ client, identity, refreshKey: 0, admitted, readGeneration: generation }), { initialProps: { identity: "alice", admitted: true, generation: 0 } })
  await waitFor(() => expect(result.current.loading).toBe(false))
  act(() => { void result.current.loadMore() })
  const signal = list.mock.calls[1]![1] as AbortSignal
  rerender({ identity: "alice", admitted: false, generation: 1 })
  expect(signal.aborted).toBe(true)
  expect(result.current.data.items).toEqual([])
  await act(async () => finish(page(["late"], null)))
  rerender({ identity: "alice", admitted: true, generation: 1 })
  await waitFor(() => expect(result.current.data.items[0]?.profile_id).toBe("current"))
  act(() => invalidateCustomApiProjection(client, "alice"))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(4))
  expect(result.current.data.items.map(item => item.profile_id)).toEqual(["current"])
  rerender({ identity: "bob", admitted: true, generation: 1 })
  expect(result.current.data.items).toEqual([])
  await waitFor(() => expect(list).toHaveBeenCalledTimes(5))
})

it("stops a repeated cursor without entering an automatic or manual pagination loop", async () => {
  const list = vi.fn().mockResolvedValueOnce(page(["first"], "same"))
    .mockResolvedValueOnce(page(["second"], "same"))
  const client = { ...createHubClient(), listCustomApis: list }
  const { result } = renderHook(() => useCustomApiProjection({ client, identity: "alice", refreshKey: 0 }))
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => result.current.loadMore())
  expect(result.current.loadMoreError).toBe(true)
  expect(result.current.hasMore).toBe(false)
  await act(async () => result.current.loadMore())
  expect(list).toHaveBeenCalledTimes(2)
  expect(result.current.data.items.map(item => item.profile_id)).toEqual(["first"])
})
