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


describe("private MCP creation registration and preparation", () => {
  const boundary = { admitted: true, subject: "private-create-actor", generation: 1 }
  const input = { display_name: "Private MCP", server_url: "https://mcp.example.test/private", headers: [{ name: "x-check", value: "fixture-only" }] }
  const server = (ready = false, version = ready ? "8" : "7") => ({ server_id: "private-server", display_name: "Private MCP", server_url: input.server_url, status: ready ? "registered" as const : "pending" as const, state_version: version, headers: [], prepare_status: ready ? "ready" as const : "pending_prepare" as const, declarations: [], declarations_available: ready })
  const connector = (ready = false) => ({ connector_id: "private-connector", connector_type: "mcp" as const, provider_key: "private-command", server_id: "private-server", status: ready ? "active" as const : "pending" as const, approved_scopes: [], enabled: ready, state_version: ready ? "8" : "7" })
  const registration = () => ({ server: server(false, "1"), connector: connector(), replayed: false })
  async function setup() {
    const { createMcpServerCreationFlow } = await import("@/ui/mcp/mcp-server-creation-flow")
    let ready = false
    const hub = {
      registerPrivateMcpServer: vi.fn<NonNullable<HubClient["registerPrivateMcpServer"]>>().mockResolvedValue(registration()),
      getPrivateMcpServer: vi.fn<NonNullable<HubClient["getPrivateMcpServer"]>>(async () => server(ready)), getMcpConnector: vi.fn<NonNullable<HubClient["getMcpConnector"]>>(async () => connector(ready)),
      preparePrivateMcpServer: vi.fn<NonNullable<HubClient["preparePrivateMcpServer"]>>(async () => { ready = true; return { server: server(true), connector: connector(true), declarations: [], replayed: false } }),
      beginMcpConnectorAuthorization: vi.fn(),
    }
    const changed = vi.fn(), flow = createMcpServerCreationFlow({ client: hub, boundary, onChanged: changed })
    const window = {}, scope = { boundary, window }, detach = flow.attach(window)
    return { hub, flow, scope, changed, detach }
  }

  it("registers once, then prepares only with a fresh exact server/connector pair and CAS", async () => {
    const { flow, hub, scope, changed } = await setup()
    expect(await flow.submit(input, scope)).toBe(true)
    expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
    expect(hub.preparePrivateMcpServer).toHaveBeenCalledWith("private-server", "7", expect.any(String), expect.any(AbortSignal))
    expect(hub.getPrivateMcpServer).toHaveBeenCalledTimes(2)
    expect(hub.getMcpConnector).toHaveBeenCalledTimes(2)
    expect(flow.getSnapshot().facts?.server.state_version).toBe("8")
    expect(changed).toHaveBeenCalledTimes(2)
    expect(flow.finish(scope)).toBe(true)
  })

  it("an unknown registration retains the complete frozen input/key across a closed window and recheck", async () => {
    const { flow, hub, scope, detach } = await setup()
    hub.registerPrivateMcpServer.mockRejectedValueOnce(new Error("lost registration ACK"))
    const draft = structuredClone(input)
    expect(await flow.submit(draft, scope)).toBe(false)
    draft.headers[0]!.value = "edited"
    expect(flow.getSnapshot().unknown).toBe("register")
    expect(JSON.stringify(flow.getSnapshot())).not.toContain("fixture-only")
    detach(); flow.bind({ ...boundary, admitted: false, generation: 2 })
    const next = { window: {}, boundary: { ...boundary, generation: 2 } }
    flow.attach(next.window); flow.bind(next.boundary)
    expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
    expect(await flow.retry(scope)).toBe(false)
    expect(await flow.retry(next)).toBe(true)
    expect(hub.registerPrivateMcpServer.mock.calls[1]?.slice(0, 2)).toEqual(hub.registerPrivateMcpServer.mock.calls[0]?.slice(0, 2))
    expect(hub.registerPrivateMcpServer.mock.calls[1]?.[0]).toEqual(input)
  })

  it("an unknown Prepare resumes the original command/version after recheck rather than using a fresh CAS", async () => {
    const { flow, hub, scope, detach } = await setup()
    let rejectPrepare!: (error: Error) => void
    const pending = new Promise<never>((_resolve, reject) => { rejectPrepare = reject })
    hub.preparePrivateMcpServer.mockImplementationOnce(() => pending)
    const running = flow.submit(input, scope)
    await vi.waitFor(() => expect(hub.preparePrivateMcpServer).toHaveBeenCalledOnce())
    flow.bind({ ...boundary, admitted: false, generation: 2 })
    expect(hub.preparePrivateMcpServer.mock.calls[0]?.[3]?.aborted).toBe(true)
    expect(flow.getSnapshot().unknown).toBe("prepare")
    rejectPrepare(new Error("late cancelled prepare")); await running
    detach()
    const next = { window: {}, boundary: { ...boundary, generation: 2 } }
    flow.attach(next.window); flow.bind(next.boundary)
    hub.getPrivateMcpServer.mockResolvedValueOnce(server(false, "19"))
    await flow.refresh(next)
    expect(hub.preparePrivateMcpServer).toHaveBeenCalledOnce()
    expect(await flow.retry(next)).toBe(true)
    expect(hub.preparePrivateMcpServer.mock.calls[1]?.slice(0, 3)).toEqual(hub.preparePrivateMcpServer.mock.calls[0]?.slice(0, 3))
    expect(hub.preparePrivateMcpServer.mock.calls[1]?.[1]).toBe("7")
    expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
  })

  it("a missing exact resource never falls back to registration ACK facts for remote preparation", async () => {
    const { flow, hub, scope } = await setup()
    hub.getPrivateMcpServer.mockRejectedValueOnce(new Error("missing private server"))
    hub.getMcpConnector.mockImplementationOnce(() => new Promise(() => {}))
    expect(await flow.submit(input, scope)).toBe(false)
    expect(hub.getMcpConnector.mock.calls[0]?.[1]?.aborted).toBe(true)
    expect(hub.preparePrivateMcpServer).not.toHaveBeenCalled()
    expect(flow.getSnapshot()).toMatchObject({ registered: true, facts: null, error: true })
    expect(await flow.retry(scope)).toBe(true)
    expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
  })

  it("a synchronous admission retirement exposes a recoverable command and sends no registration", async () => {
    const { flow, hub, scope } = await setup()
    let retired = false
    const release = flow.subscribe(() => {
      if (!retired && flow.getSnapshot().name) { retired = true; flow.bind({ ...boundary, admitted: false, generation: 2 }) }
    })
    expect(await flow.submit(input, scope)).toBe(false)
    expect(hub.registerPrivateMcpServer).not.toHaveBeenCalled()
    expect(flow.getSnapshot().unknown).toBe("register")
    release()
  })

  it("a replacement window cancels its predecessor without borrowing its flight or private facts", async () => {
    const { flow, hub, scope } = await setup()
    let acknowledge!: (value: ReturnType<typeof registration>) => void
    hub.registerPrivateMcpServer.mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve }))
    const running = flow.submit(input, scope)
    expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
    flow.attach({})
    expect(hub.registerPrivateMcpServer.mock.calls[0]?.[2]?.aborted).toBe(true)
    acknowledge(registration()); await running
    expect(hub.preparePrivateMcpServer).not.toHaveBeenCalled()
    expect(flow.getSnapshot().facts).toBeNull()
  })
})
