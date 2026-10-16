import { describe, expect, it, vi } from "vitest"
import { HubClientError, type HubClient } from "@/hub/client"
import { createCustomApiCreateFlow } from "@/ui/mcp/custom-api-create-flow"

const admitted = { admitted: true, subject: "api-actor", generation: 1 }
const input = () => ({ name: "Original API", environment: [{ name: "DUMMY_KEY", value: "fixture-only" }] })
const profile = { profile_id: "flow-api", name: "Original API", state_version: "1", created_at: "2026-10-16T12:00:00Z", updated_at: "2026-10-16T12:00:00Z", environment: [{ name: "DUMMY_KEY", configured: true, state_version: "1", status: "active" as const }] }

describe("Custom API actor-owned creation command", () => {
  it("freezes the body and key across unknown outcomes, without automatic retries", async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error("lost ACK")).mockResolvedValue(profile)
    const confirmed = vi.fn(), key = vi.fn(() => "original-key")
    const flow = createCustomApiCreateFlow({ client: { createCustomApi: create }, boundary: admitted, key, onConfirmed: confirmed })
    const body = input()
    expect(await flow.submit(body, admitted)).toBe(false)
    expect(flow.getSnapshot().kind).toBe("unknown")
    expect(flow.finish(admitted)).toBe(false)
    body.name = "Edited after send"; body.environment[0]!.value = "changed"
    expect(await flow.submit(body, admitted)).toBe(false)
    expect(create).toHaveBeenCalledOnce()
    expect(await flow.retry(admitted)).toBe(true)
    expect(create.mock.calls[0]?.slice(0, 2)).toEqual(create.mock.calls[1]?.slice(0, 2))
    expect(create.mock.calls[1]?.[0]).toEqual(input())
    expect(key).toHaveBeenCalledOnce()
    expect(confirmed).toHaveBeenCalledOnce()
    expect(flow.getSnapshot()).toEqual({ kind: "completed", name: "Original API" })
    expect(JSON.stringify(flow.getSnapshot())).not.toContain("fixture-only")
    expect(flow.finish(admitted)).toBe(true)
  })

  it("does not dispatch if a subscriber synchronously retires admission before I/O", async () => {
    const create = vi.fn().mockResolvedValue(profile)
    const flow = createCustomApiCreateFlow({ client: { createCustomApi: create }, boundary: admitted, onConfirmed: vi.fn() })
    const unsubscribe = flow.subscribe(() => {
      if (flow.getSnapshot().kind === "running") flow.bind({ ...admitted, admitted: false, generation: 2 })
    })
    expect(await flow.submit(input(), admitted)).toBe(false)
    expect(create).not.toHaveBeenCalled()
    expect(flow.getSnapshot().kind).toBe("unknown")
    unsubscribe()
  })

  it("blocks duplicate dispatch synchronously and keeps commands out of unadmitted callbacks", async () => {
    let acknowledge!: (value: typeof profile) => void
    const create = vi.fn<NonNullable<HubClient["createCustomApi"]>>(() => new Promise<typeof profile>(resolve => { acknowledge = resolve }))
    const flow = createCustomApiCreateFlow({ client: { createCustomApi: create }, boundary: admitted, onConfirmed: vi.fn() })
    const running = flow.submit(input(), admitted)
    expect(await flow.submit(input(), admitted)).toBe(false)
    flow.bind({ ...admitted, admitted: false, generation: 2 })
    expect(create.mock.calls[0]?.[2]?.aborted).toBe(true)
    expect(await flow.retry(admitted)).toBe(false)
    flow.bind({ ...admitted, generation: 2 })
    expect(await flow.retry(admitted)).toBe(false)
    expect(create).toHaveBeenCalledOnce()
    acknowledge(profile); expect(await running).toBe(false)
    expect(flow.getSnapshot().kind).toBe("completed")
    expect(flow.finish({ ...admitted, generation: 2 })).toBe(true)
  })

  it("an old actor's late ACK invalidates only its captured projection and never revives its flow", async () => {
    let acknowledge!: (value: typeof profile) => void
    const create = vi.fn<NonNullable<HubClient["createCustomApi"]>>(() => new Promise<typeof profile>(resolve => { acknowledge = resolve }))
    const confirmed = vi.fn()
    const flow = createCustomApiCreateFlow({ client: { createCustomApi: create }, boundary: admitted, onConfirmed: confirmed })
    const running = flow.submit(input(), admitted)
    flow.bind({ ...admitted, subject: "actor-b", generation: 2 })
    flow.bind({ ...admitted, generation: 3 })
    acknowledge(profile); await running
    expect(confirmed).toHaveBeenCalledOnce()
    expect(flow.getSnapshot().kind).toBe("idle")
    expect(await flow.submit(input(), { ...admitted, generation: 3 })).toBe(false)
    expect(create).toHaveBeenCalledOnce()
  })

  it("only a first known validation rejection releases the frozen command", async () => {
    const invalid = new HubClientError("http", "Rejected", "invalid_custom_api_request", 400)
    const create = vi.fn().mockRejectedValueOnce(invalid).mockResolvedValue(profile)
    const key = vi.fn().mockReturnValueOnce("rejected-key").mockReturnValueOnce("corrected-key")
    const flow = createCustomApiCreateFlow({ client: { createCustomApi: create }, boundary: admitted, key, onConfirmed: vi.fn() })
    await flow.submit(input(), admitted)
    expect(flow.getSnapshot().kind).toBe("rejected")
    await flow.submit(input(), admitted)
    expect(create.mock.calls.map(call => call[1])).toEqual(["rejected-key", "corrected-key"])
    const uncertainCreate = vi.fn().mockRejectedValueOnce(new Error("lost ACK")).mockRejectedValueOnce(invalid)
    const uncertain = createCustomApiCreateFlow({ client: { createCustomApi: uncertainCreate }, boundary: admitted, key: () => "unknown-key", onConfirmed: vi.fn() })
    await uncertain.submit(input(), admitted); await uncertain.retry(admitted)
    expect(uncertain.getSnapshot().kind).toBe("unknown")
    expect(await uncertain.submit(input(), admitted)).toBe(false)
  })

  it.each([409, 412, 503])("HTTP %s is not proof that a previously sent creation did not commit", async status => {
    const create = vi.fn().mockRejectedValue(new HubClientError("http", "Not confirmed", "custom_api_conflict", status))
    const flow = createCustomApiCreateFlow({ client: { createCustomApi: create }, boundary: admitted, onConfirmed: vi.fn() })
    await flow.submit(input(), admitted)
    expect(flow.getSnapshot().kind).toBe("unknown")
    expect(flow.finish(admitted)).toBe(false)
  })

  it("a shell lease survives StrictMode replay but retires permanently after actual unmount", async () => {
    const create = vi.fn().mockRejectedValue(new Error("lost ACK"))
    const flow = createCustomApiCreateFlow({ client: { createCustomApi: create }, boundary: admitted, onConfirmed: vi.fn() })
    const release = flow.retain(admitted)
    release(); const releaseAgain = flow.retain(admitted)
    await Promise.resolve()
    await flow.submit(input(), admitted)
    expect(flow.getSnapshot().kind).toBe("unknown")
    releaseAgain(); await Promise.resolve()
    expect(flow.getSnapshot().kind).toBe("idle")
    expect(await flow.retry(admitted)).toBe(false)
  })
})


describe("MCP JSON owner-atomic creation command", () => {
  it("freezes one complete document and key across recheck and unknown outcomes", async () => {
    const { createMcpJsonImportFlow } = await import("@/ui/mcp/mcp-json-import-flow")
    const document = ' {"mcpServers":{"One":{"type":"streamableHttp","url":"https://mcp.example.test/one","headers":{"x-check":"fixture-only"}},"Two":{"type":"streamableHttp","url":"https://mcp.example.test/two"}}} '
    const create = vi.fn().mockRejectedValueOnce(new Error("lost ACK")).mockResolvedValue({ imports: [], replayed: true })
    const confirmed = vi.fn(), key = vi.fn(() => "original-json-command")
    const flow = createMcpJsonImportFlow({ client: { importPrivateMcpJson: create }, boundary: admitted, onConfirmed: confirmed, key })
    await flow.submit(document, admitted)
    expect(flow.getSnapshot()).toEqual({ kind: "unknown" })
    expect(await flow.submit("changed", admitted)).toBe(false)
    flow.bind({ ...admitted, admitted: false, generation: 2 })
    expect(await flow.retry({ ...admitted, admitted: false, generation: 2 })).toBe(false)
    flow.bind({ ...admitted, generation: 2 })
    expect(create).toHaveBeenCalledOnce()
    expect(await flow.retry({ ...admitted, generation: 2 })).toBe(true)
    expect(create.mock.calls.map(call => call.slice(0, 2))).toEqual([[document, "original-json-command"], [document, "original-json-command"]])
    expect(key).toHaveBeenCalledOnce()
    expect(confirmed).toHaveBeenCalledOnce()
    expect(flow.getSnapshot()).toEqual({ kind: "completed" })
    expect(flow.finish({ ...admitted, generation: 2 })).toBe(true)
    expect(await flow.retry({ ...admitted, generation: 2 })).toBe(false)
  })

  it("releases a first owner validation rejection and rejects oversized documents before dispatch", async () => {
    const { createMcpJsonImportFlow } = await import("@/ui/mcp/mcp-json-import-flow")
    const create = vi.fn().mockRejectedValue(new HubClientError("http", "invalid", "invalid_mcp_personal_request", 400))
    const key = vi.fn().mockReturnValueOnce("first-json").mockReturnValueOnce("corrected-json")
    const flow = createMcpJsonImportFlow({ client: { importPrivateMcpJson: create }, boundary: admitted, onConfirmed: vi.fn(), key })
    await flow.submit("x".repeat(65_537), admitted)
    expect(create).not.toHaveBeenCalled()
    expect(key).not.toHaveBeenCalled()
    await flow.submit("invalid JSON", admitted)
    expect(flow.getSnapshot().kind).toBe("rejected")
    await flow.submit("corrected JSON", admitted)
    expect(create.mock.calls.map(call => call[1])).toEqual(["first-json", "corrected-json"])
  })
})
