import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createHubClient, HubClientError } from "@/hub/client"
import type { ProjectMcpRecommendationsClient } from "@/hub/project-mcp-recommendations-client"
import { useProjectMcpRecommendations } from "@/features/app/use-project-mcp-recommendations"
import { readProjectMcpRecommendationOptions } from "@/features/app/project-mcp-recommendation-options"
import { projectMcpDefaultSelection } from "@/features/app/project-mcp-default-selection"

const boundary = { admitted: true, subject: "recommendation-reader", generation: 1 }
const saved = { project_id: "project-a", state_version: "1", recommendations: [{ kind: "provider" as const, provider_key: "github" }] }
function directory() {
  return { ...createHubClient(), listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
}
function client() { return { get: vi.fn<ProjectMcpRecommendationsClient["get"]>().mockResolvedValue(saved), replace: vi.fn<ProjectMcpRecommendationsClient["replace"]>() } }
beforeEach(() => { window.localStorage.setItem("kokoro.web.auth-index-subject", boundary.subject); window.history.replaceState({}, "", "/app/project/project-a") })
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); window.history.replaceState({}, "", "/app") })

it("prefetches one real configuration and treats a confirmed empty directory separately from absent saved refs", async () => {
  const api = client(), hub = directory()
  const hook = renderHook(() => useProjectMcpRecommendations({ projectId: "project-a", boundary, enabled: true, hub, client: api }))
  await waitFor(() => expect(hook.result.current.directoryReady && hook.result.current.configReady).toBe(true))
  expect(hook.result.current.facts).toEqual(saved)
  expect(hook.result.current.options).toEqual([])
  expect(api.get).toHaveBeenCalledOnce()
  expect(api.replace).not.toHaveBeenCalled()
})

it("unread configuration is not an empty success, while explicit safe refresh can establish a true empty configuration", async () => {
  const api = client(), hub = directory()
  api.get.mockRejectedValueOnce(Error("read unavailable"))
  const hook = renderHook(() => useProjectMcpRecommendations({ projectId: "project-a", boundary, enabled: true, hub, client: api }))
  await waitFor(() => expect(hook.result.current.directoryReady).toBe(true))
  expect(hook.result.current.configReady).toBe(false)
  expect(hook.result.current.facts).toBeNull()
  api.get.mockResolvedValueOnce({ ...saved, recommendations: [] })
  act(() => hook.result.current.refresh())
  await waitFor(() => expect(hook.result.current.configReady).toBe(true))
  expect(hook.result.current.facts?.recommendations).toEqual([])
  expect(api.replace).not.toHaveBeenCalled()
})

it("missing exact Project admission performs no private reads and an unannounced actor change hides old facts", async () => {
  const api = client(), hub = directory()
  const hook = renderHook(({ projectId }: { projectId: string | null }) => useProjectMcpRecommendations({ projectId, boundary, enabled: true, hub, client: api }), { initialProps: { projectId: null as string | null } })
  expect(api.get).not.toHaveBeenCalled()
  expect(hub.listMcpConnectors).not.toHaveBeenCalled()
  hook.rerender({ projectId: "project-a" })
  await waitFor(() => expect(hook.result.current.configReady).toBe(true))
  window.localStorage.setItem("kokoro.web.auth-index-subject", "other-reader")
  hook.rerender({ projectId: "project-a" })
  expect(hook.result.current.allowed).toBe(false)
  expect(hook.result.current.facts).toBeNull()
  expect(await hook.result.current.save([])).toBe("retired")
  expect(api.replace).not.toHaveBeenCalled()
})

it.each(["ack", "unknown", "conflict", "read-failure"] as const)("save %s performs at most one PUT followed by a fresh GET, never a retry", async outcome => {
  const api = client(), hub = directory(), target = [{ kind: "custom_api" as const, profile_id: "profile-a" }]
  const hook = renderHook(() => useProjectMcpRecommendations({ projectId: "project-a", boundary, enabled: true, hub, client: api }))
  await waitFor(() => expect(hook.result.current.configReady && hook.result.current.directoryReady).toBe(true))
  const after = { ...saved, state_version: "2", recommendations: target }
  if (outcome === "ack") api.replace.mockResolvedValue(after)
  else api.replace.mockRejectedValue(outcome === "conflict" ? new HubClientError("http", "stale", "project_mcp_recommendations_precondition_failed", 412) : Error("unknown"))
  if (outcome === "read-failure") api.get.mockRejectedValueOnce(Error("GET unavailable"))
  else api.get.mockResolvedValueOnce(outcome === "conflict" ? { ...saved, state_version: "2" } : after)
  let result: unknown
  await act(async () => { result = await hook.result.current.save(target) })
  expect(api.replace).toHaveBeenCalledOnce()
  expect(api.replace.mock.calls[0]?.slice(0, 2)).toEqual(["project-a", { expected_state_version: "1", recommendations: target }])
  expect(api.get).toHaveBeenCalledTimes(2)
  expect(result).toBe(outcome === "conflict" ? "conflict" : outcome === "read-failure" ? "unconfirmed" : "current")
  expect(hook.result.current.facts).toEqual(outcome === "read-failure" ? saved : outcome === "conflict" ? { ...saved, state_version: "2" } : after)
  if (outcome === "read-failure") expect(hook.result.current.configReady).toBe(false)
})

it("retired subject/project ignores a late save and never follows it with another owner's GET", async () => {
  const api = client(), hub = directory()
  let finish!: (value: typeof saved) => void
  api.replace.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const hook = renderHook(({ projectId, subject }) => useProjectMcpRecommendations({ projectId, boundary: { ...boundary, subject }, enabled: true, hub, client: api }),
    { initialProps: { projectId: "project-a", subject: boundary.subject } })
  await waitFor(() => expect(hook.result.current.configReady && hook.result.current.directoryReady).toBe(true))
  let pending!: Promise<unknown>
  act(() => { pending = hook.result.current.save([]) })
  window.localStorage.setItem("kokoro.web.auth-index-subject", "next-reader")
  window.history.replaceState({}, "", "/app/project/project-b")
  api.get.mockResolvedValue({ project_id: "project-b", recommendations: [], state_version: "1" })
  hook.rerender({ projectId: "project-b", subject: "next-reader" })
  await waitFor(() => expect(hook.result.current.facts?.project_id).toBe("project-b"))
  const calls = api.get.mock.calls.length
  await act(async () => { finish(saved); await pending })
  expect(api.get).toHaveBeenCalledTimes(calls)
  expect(hook.result.current.facts?.project_id).toBe("project-b")
})

it("directory scans every source page without conflating provider/profile/connector IDs", async () => {
  const hub = directory()
  hub.listMcpConnectorProviders.mockResolvedValueOnce({ items: [{ provider_key: "same", display_name: "Provider" }], next_cursor: "next" }).mockResolvedValueOnce({ items: [{ provider_key: "other", display_name: "Other" }], next_cursor: null })
  hub.listMcpConnectors.mockResolvedValue({ items: [{ connector_id: "same", server_id: "server", connector_type: "mcp", status: "active", display_name: "Personal MCP" }], next_cursor: null })
  hub.listCustomApis.mockResolvedValue({ items: [{ profile_id: "same", name: "Custom API" }], page: { next_cursor: null } })
  const rows = await readProjectMcpRecommendationOptions(hub, new AbortController().signal)
  expect(rows).toHaveLength(4)
  expect(new Set(rows.map(row => row.id)).size).toBe(4)
  expect(hub.listMcpConnectorProviders.mock.calls[1]?.[0]).toMatchObject({ cursor: "next" })
})

it("a visible typed MCP connector without an optional Server locator remains a recommendation candidate", async () => {
  const hub = directory()
  hub.listMcpConnectors.mockResolvedValue({ items: [{ connector_id: "connector-no-server", provider_key: "provider", connector_type: "mcp", status: "active", display_name: "Provider connector" }], next_cursor: null })
  const rows = await readProjectMcpRecommendationOptions(hub, new AbortController().signal)
  expect(rows.map(row => row.ref)).toEqual([{ kind: "mcp_connector", connector_id: "connector-no-server" }])
})

it("a directory cursor cycle is unknown, not a complete empty result", async () => {
  const hub = directory()
  hub.listMcpConnectorProviders.mockResolvedValue({ items: [], next_cursor: "loop" })
  await expect(readProjectMcpRecommendationOptions(hub, new AbortController().signal)).rejects.toBeInstanceOf(Error)
})

it("the complete directory has one finite wall-clock budget even for a reader that ignores abort", async () => {
  vi.useFakeTimers()
  try {
    const hub = directory(); hub.listMcpConnectorProviders.mockImplementation(() => new Promise(() => {}))
    const pending = readProjectMcpRecommendationOptions(hub, new AbortController().signal)
    const check = expect(pending).rejects.toBeInstanceOf(Error)
    await vi.advanceTimersByTimeAsync(10_000)
    await check
    expect(hub.listMcpConnectorProviders).toHaveBeenCalledOnce()
  } finally { vi.useRealTimers() }
})

it("default mapping requires exact available connections, rejects ambiguous providers and never executes Custom API profiles", () => {
  const eligible = (id: string, providerKey = "github", connectorId = "personal") => ({ id, providerKey, connectorId, name: id, availability: "available" as const, selectable: true })
  expect(projectMcpDefaultSelection([{ kind: "provider", provider_key: "github" }], [eligible("one")])).toEqual(["one"])
  expect(projectMcpDefaultSelection([{ kind: "provider", provider_key: "github" }], [eligible("one"), eligible("two")])).toEqual([])
  expect(projectMcpDefaultSelection([{ kind: "custom_api", profile_id: "one" }], [eligible("one")])).toEqual([])
  expect(projectMcpDefaultSelection([{ kind: "mcp_connector", connector_id: "personal" }], [{ ...eligible("one"), availability: "unavailable" }])).toEqual([])
  expect(projectMcpDefaultSelection([{ kind: "mcp_connector", connector_id: "personal" }, { kind: "provider", provider_key: "github" }], [eligible("one")])).toEqual(["one"])
})
