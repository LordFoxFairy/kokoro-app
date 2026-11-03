import type { ReactNode } from "react"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi, type Mock } from "vitest"

import { createHubClient, HubClientError, type HubClient } from "@/hub/client"
import { ProductReadRecheckProvider } from "@/ui/auth/product-read-recheck-context"
import { useMcpProviderDirectory } from "@/ui/mcp/use-mcp-provider-directory"
import { useMcpProviderDetail } from "@/ui/mcp/use-mcp-provider-detail"
import { useMcpProviderRelations } from "@/ui/mcp/use-mcp-provider-relations"
import { useCustomApiDetail } from "@/ui/mcp/use-custom-api-detail"

type ReadInput = { client: HubClient; identity: string; admitted: boolean; readGeneration: number }
const provider = { provider_key: "provider", display_name: "Provider", directory_type: "app" as const,
  category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
const initial = { identity: "alice", admitted: true, readGeneration: 7 }

function useDirectory(input: ReadInput) {
  return useMcpProviderDirectory({ ...input, seed: undefined, query: "search", category: "all" })
}
function useDetail(input: ReadInput) {
  return useMcpProviderDetail({ ...input, providerKey: "provider", known: undefined, retry: 0 })
}
function useRelations(input: ReadInput) {
  return useMcpProviderRelations({ ...input, enabled: true, refreshKey: 0 })
}
function useApiDetail(input: ReadInput) {
  return useCustomApiDetail({ ...input, profileId: "profile", known: undefined, retry: 0 })
}
const readers = [{ name: "filtered directory", useRead: useDirectory },
  { name: "exact provider detail", useRead: useDetail },
  { name: "relations continuation", useRead: useRelations },
  { name: "exact API detail", useRead: useApiDetail }]

function setup(useRead: (input: ReadInput) => { error: boolean | undefined }, request: Mock) {
  const report = vi.fn()
  const client = { ...createHubClient(), listMcpConnectorProviders: request,
    getMcpConnectorProvider: request, getCustomApi: request,
    listMcpConnectors: vi.fn().mockResolvedValueOnce({ items: [], next_cursor: "tail" }).mockImplementation(request) }
  const wrapper = ({ children }: { children: ReactNode }) => <ProductReadRecheckProvider value={report}>{children}</ProductReadRecheckProvider>
  return { report, client, ...renderHook(props => useRead({ ...props, client }), { initialProps: initial, wrapper }) }
}

afterEach(cleanup)

it.each(readers)("reports only the captured active HTTP401 from $name and recovers after readmission", async ({ useRead, name }) => {
  const request = vi.fn().mockRejectedValueOnce(new HubClientError("http", "expired", null, 401))
    .mockResolvedValue(name === "exact provider detail" ? provider : name === "exact API detail" ? { profile_id: "profile" } : { items: [], next_cursor: null })
  const { report, result, rerender } = setup(useRead, request)
  await waitFor(() => expect(result.current.error).toBe(true))
  const signal = request.mock.calls[0]![1] as AbortSignal
  expect(report).toHaveBeenCalledExactlyOnceWith({ subject: "alice", generation: 7, signal })
  expect(signal.aborted).toBe(false)
  expect(request).toHaveBeenCalledOnce()
  rerender({ ...initial, admitted: false, readGeneration: 8 })
  rerender({ ...initial, readGeneration: 8 })
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(result.current.error).toBe(false))
  expect(request).toHaveBeenCalledTimes(2)
  expect(report).toHaveBeenCalledOnce()
})

for (const { name, useRead } of readers) {
  it.each([
    new HubClientError("http", "forbidden", null, 403),
    new HubClientError("http", "unavailable", null, 503),
    new HubClientError("parse", "invalid payload", null, 401),
    new HubClientError("network", "disconnected", null, 401),
  ])(`${name} keeps a non-authentication failure without requesting readmission (%s)`, async error => {
    const { report, result } = setup(useRead, vi.fn().mockRejectedValue(error))
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(report).not.toHaveBeenCalled()
  })

  it.each(["actor", "generation", "admission", "unmount"])(`${name} ignores a late 401 after %s retirement`, async retirement => {
    let reject!: (error: unknown) => void
    const request = vi.fn().mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
      .mockImplementation(() => new Promise(() => {}))
    const { report, rerender, unmount } = setup(useRead, request)
    await waitFor(() => expect(request).toHaveBeenCalledOnce())
    const signal = request.mock.calls[0]![1] as AbortSignal
    if (retirement === "unmount") unmount()
    else rerender({ identity: retirement === "actor" ? "bob" : "alice",
      admitted: retirement !== "admission", readGeneration: retirement === "generation" ? 8 : 7 })
    await act(async () => { reject(new HubClientError("http", "expired", null, 401)) })
    expect(signal.aborted).toBe(true)
    expect(report).not.toHaveBeenCalled()
  })
}

it("reports an expired directory continuation with its original read signal and keeps confirmed rows", async () => {
  const report = vi.fn()
  const list = vi.fn().mockRejectedValue(new HubClientError("http", "expired", null, 401))
  const client = { ...createHubClient(), listMcpConnectorProviders: list }
  const seed = { items: [provider], next_cursor: "tail" }
  const wrapper = ({ children }: { children: ReactNode }) => <ProductReadRecheckProvider value={report}>{children}</ProductReadRecheckProvider>
  const { result } = renderHook(() => useMcpProviderDirectory({ client, ...initial,
    seed, query: "", category: "all" }), { wrapper })
  act(() => result.current.loadMore())
  await waitFor(() => expect(result.current.error).toBe(true))
  expect(result.current.items).toEqual([provider])
  expect(report).toHaveBeenCalledExactlyOnceWith({ subject: "alice", generation: 7, signal: list.mock.calls[0]![1] })
})
