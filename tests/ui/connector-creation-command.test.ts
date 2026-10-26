import { describe, expect, it, vi } from "vitest"
import { HubClientError, type HubClient } from "@/hub/client"
import { createMcpPreparationCommands } from "@/ui/mcp/mcp-preparation-commands"
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
  it("releases only a first confirmed atomic URL conflict so a corrected whole document gets a new key", async () => {
    const { createMcpJsonImportFlow } = await import("@/ui/mcp/mcp-json-import-flow")
    const first = '{"mcpServers":{"Duplicate":{"type":"streamableHttp","url":"https://mcp.example.test/existing"}}}'
    const corrected = first.replace("existing", "corrected")
    const create = vi.fn().mockRejectedValueOnce(new HubClientError("http", "duplicate", "mcp_personal_server_url_conflict", 409, false))
      .mockResolvedValue({ imports: [], replayed: false })
    const key = vi.fn().mockReturnValueOnce("json-first-key").mockReturnValueOnce("json-corrected-key")
    const confirmed = vi.fn()
    const flow = createMcpJsonImportFlow({ client: { importPrivateMcpJson: create }, boundary: admitted, onConfirmed: confirmed, key })
    expect(await flow.submit(first, admitted)).toBe(false)
    expect(flow.getSnapshot()).toEqual({ kind: "rejected", rejection: "url_conflict" })
    expect(confirmed).not.toHaveBeenCalled()
    expect(await flow.submit(corrected, admitted)).toBe(true)
    expect(create.mock.calls.map(call => call.slice(0, 2))).toEqual([[first, "json-first-key"], [corrected, "json-corrected-key"]])
    expect(confirmed).toHaveBeenCalledOnce()
  })

  it.each([
    new HubClientError("http", "wrong status", "mcp_personal_server_url_conflict", 400, false),
    new HubClientError("http", "retryable", "mcp_personal_server_url_conflict", 409, true),
    new HubClientError("http", "different code", "mcp_personal_idempotency_conflict", 409, false),
  ])("does not release the original JSON command for a mismatched rejection tuple: %s", async error => {
    const { createMcpJsonImportFlow } = await import("@/ui/mcp/mcp-json-import-flow")
    const create = vi.fn().mockRejectedValue(error)
    const flow = createMcpJsonImportFlow({ client: { importPrivateMcpJson: create }, boundary: admitted, onConfirmed: vi.fn() })
    await flow.submit("original document", admitted)
    expect(flow.getSnapshot().kind).toBe("unknown")
    await flow.submit("changed document", admitted)
    expect(create).toHaveBeenCalledOnce()
  })

  it("a duplicate after an uncertain JSON result still retains the original whole document and key", async () => {
    const { createMcpJsonImportFlow } = await import("@/ui/mcp/mcp-json-import-flow")
    const create = vi.fn().mockRejectedValueOnce(Error("lost original ACK"))
      .mockRejectedValue(new HubClientError("http", "duplicate", "mcp_personal_server_url_conflict", 409, false))
    const key = vi.fn(() => "json-uncertain-key")
    const flow = createMcpJsonImportFlow({ client: { importPrivateMcpJson: create }, boundary: admitted, onConfirmed: vi.fn(), key })
    await flow.submit("original document", admitted)
    await flow.retry(admitted)
    expect(flow.getSnapshot().kind).toBe("unknown")
    await flow.submit("changed document", admitted)
    expect(create.mock.calls.map(call => call.slice(0, 2))).toEqual([["original document", "json-uncertain-key"], ["original document", "json-uncertain-key"]])
    expect(key).toHaveBeenCalledOnce()
  })

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
  const server = (ready = false, version = ready ? "8" : "7") => ({ availability: "unavailable" as const, server_id: "private-server", display_name: "Private MCP", server_url: input.server_url, status: ready ? "registered" as const : "pending" as const, state_version: version, headers: [], transport: "streamable_http" as const, prepare_status: ready ? "ready" as const : "pending_prepare" as const, declarations: [], declarations_available: ready })
  const connector = (ready = false) => ({ availability: "unavailable" as const, connector_id: "private-connector", connector_type: "mcp" as const, provider_key: "private-command", server_id: "private-server", status: ready ? "active" as const : "pending" as const, approved_scopes: [], enabled: ready, state_version: ready ? "8" : "7" })
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
    const changed = vi.fn(), preparation = createMcpPreparationCommands({ canPrepare: () => true, client: hub, boundary, onConfirmed: changed })
    const source = createMcpServerCreationFlow({ client: hub, preparation, boundary, onChanged: changed })
    // The shell binds both lifetimes; the form owns neither actor admission.
    const flow = { ...source, bind: (value: typeof boundary) => { preparation.bind(value); source.bind(value) } }
    const window = {}, scope = { boundary, window }, detach = flow.attach(window)
    return { hub, flow, preparation, scope, changed, detach }
  }

  it("a first exact duplicate-URL rejection leaves the form editable and a corrected submission gets a new command", async () => {
    const { flow, hub, scope, changed } = await setup()
    hub.registerPrivateMcpServer.mockRejectedValueOnce(new HubClientError("http", "duplicate", "mcp_personal_server_url_conflict", 409, false))
    expect(await flow.submit(input, scope, "connect")).toBe(false)
    expect(flow.getSnapshot()).toMatchObject({ unknown: null, registered: false, error: true, registrationRejection: "url_conflict" })
    expect(hub.preparePrivateMcpServer).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalled()
    expect(await flow.submit({ ...input, server_url: "https://mcp.example.test/corrected" }, scope, "connect")).toBe(true)
    expect(hub.registerPrivateMcpServer).toHaveBeenCalledTimes(2)
    expect(hub.registerPrivateMcpServer.mock.calls[1]?.[1]).not.toBe(hub.registerPrivateMcpServer.mock.calls[0]?.[1])
    expect(hub.registerPrivateMcpServer.mock.calls[1]?.[0].server_url).toBe("https://mcp.example.test/corrected")
    expect(flow.getSnapshot().registrationRejection).toBeNull()
  })

  it("a duplicate URL after a lost ACK does not prove the original registration failed", async () => {
    const { flow, hub, scope } = await setup()
    hub.registerPrivateMcpServer.mockRejectedValueOnce(new Error("lost ACK"))
      .mockRejectedValueOnce(new HubClientError("http", "duplicate", "mcp_personal_server_url_conflict", 409, false))
    await flow.submit(input, scope, "connect")
    const original = hub.registerPrivateMcpServer.mock.calls[0]?.slice(0, 2)
    await flow.retry(scope)
    expect(flow.getSnapshot()).toMatchObject({ unknown: "register", registrationRejection: null })
    expect(hub.registerPrivateMcpServer.mock.calls[1]?.slice(0, 2)).toEqual(original)
    expect(await flow.submit({ ...input, server_url: "https://mcp.example.test/replacement" }, scope, "connect")).toBe(false)
    expect(hub.registerPrivateMcpServer).toHaveBeenCalledTimes(2)
  })

  it.each([[409, true], [503, false], [400, false]])("an inconsistent duplicate tuple remains uncertain (%s / %s)", async (status, retryable) => {
    const { flow, hub, scope } = await setup()
    hub.registerPrivateMcpServer.mockRejectedValueOnce(new HubClientError("http", "unverified", "mcp_personal_server_url_conflict", status, retryable))
    await flow.submit(input, scope, "connect")
    expect(flow.getSnapshot().unknown).toBe("register")
    expect(await flow.submit(input, scope, "connect")).toBe(false)
    expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
  })

  it("registers once, then prepares only with a fresh exact server/connector pair and CAS", async () => {
    const { flow, hub, scope, changed } = await setup()
    expect(await flow.submit(input, scope, "connect")).toBe(true)
    expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
    expect(hub.preparePrivateMcpServer).toHaveBeenCalledWith("private-server", "7", expect.any(String), expect.any(AbortSignal))
    expect(hub.getPrivateMcpServer).toHaveBeenCalledTimes(2)
    expect(hub.getMcpConnector).toHaveBeenCalledTimes(2)
    expect(flow.getSnapshot().facts?.server.state_version).toBe("8")
    expect(changed).toHaveBeenCalledTimes(2)
    expect(flow.finish(scope)).toBe(true)
  })

  it("expired registration stops at its original command across closing and recheck", async () => {
    const { flow, hub, scope, detach } = await setup()
    hub.registerPrivateMcpServer.mockRejectedValue(new HubClientError("http", "private", "mcp_personal_command_replay_expired", 412, false))
    await flow.submit(input, scope, "connect")
    await flow.retry(scope)
    detach(); flow.bind({ ...admitted, generation: 2 }); flow.attach(scope.window)
    await flow.retry({ ...scope, boundary: { ...admitted, generation: 2 } })
    expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
    expect(hub.preparePrivateMcpServer).not.toHaveBeenCalled()
  })

  it("an unknown registration retains the complete frozen input/key across a closed window and recheck", async () => {
    const { flow, hub, scope, detach } = await setup()
    hub.registerPrivateMcpServer.mockRejectedValueOnce(new Error("lost registration ACK"))
    const draft = structuredClone(input)
    expect(await flow.submit(draft, scope, "connect")).toBe(false)
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
    const running = flow.submit(input, scope, "connect")
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
    expect(await flow.submit(input, scope, "connect")).toBe(false)
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
    expect(await flow.submit(input, scope, "connect")).toBe(false)
    expect(hub.registerPrivateMcpServer).not.toHaveBeenCalled()
    expect(flow.getSnapshot().unknown).toBe("register")
    release()
  })

  it("a replacement window cancels its predecessor without borrowing its flight or private facts", async () => {
    const { flow, hub, scope } = await setup()
    let acknowledge!: (value: ReturnType<typeof registration>) => void
    hub.registerPrivateMcpServer.mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve }))
    const running = flow.submit(input, scope, "connect")
    expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
    flow.attach({})
    expect(hub.registerPrivateMcpServer.mock.calls[0]?.[2]?.aborted).toBe(true)
    acknowledge(registration()); await running
    expect(hub.preparePrivateMcpServer).not.toHaveBeenCalled()
    expect(flow.getSnapshot().facts).toBeNull()
  })

  it("creation and a reopened detail share the same unknown Prepare rather than adopting a new CAS", async () => {
    const { flow, preparation, hub, scope, changed } = await setup()
    hub.preparePrivateMcpServer.mockRejectedValueOnce(new Error("lost preparation ACK"))
    expect(await flow.submit(input, scope, "connect")).toBe(false)
    expect(await preparation.prepare({ serverId: "private-server", connectorId: "private-connector", version: "99" }, boundary)).toBe(true)
    expect(hub.preparePrivateMcpServer.mock.calls[1]?.slice(0, 3)).toEqual(hub.preparePrivateMcpServer.mock.calls[0]?.slice(0, 3))
    expect(hub.preparePrivateMcpServer.mock.calls[1]?.[1]).toBe("7")
    expect(changed).toHaveBeenCalledTimes(2)
    expect(await flow.refresh(scope)).not.toBeNull()
    expect(flow.finish(scope)).toBe(true)
    expect(preparation.getSnapshot()).toEqual([])
  })

  it("a confirmed disconnect retires the exact pending command and clears a closed creation intent", async () => {
    const { flow, preparation, hub, scope, detach } = await setup()
    const release = flow.retain(boundary)
    hub.preparePrivateMcpServer.mockRejectedValueOnce(new Error("lost preparation ACK"))
    expect(await flow.submit(input, scope, "connect")).toBe(false)
    detach()
    preparation.retireTarget("private-server", "unrelated-connector")
    expect(flow.getSnapshot().unknown).toBe("prepare")
    preparation.retireTarget("private-server", "private-connector")
    expect(flow.getSnapshot()).toMatchObject({ registered: false, unknown: null, facts: null })
    expect(preparation.getSnapshot()).toEqual([])
    release()
  })

  it.each(["configure", "publish"] as const)("%s intent confirms configuration without calling Prepare or claiming ready", async intent => {
    const { flow, hub, scope } = await setup()
    expect(await flow.submit(input, scope, intent)).toBe(true)
    expect(hub.preparePrivateMcpServer).not.toHaveBeenCalled()
    expect(hub.beginMcpConnectorAuthorization).not.toHaveBeenCalled()
    expect(flow.getSnapshot()).toMatchObject({ intent, publishRequested: intent === "publish", facts: { server: { prepare_status: "pending_prepare" }, connector: { status: "pending", enabled: false } } })
    expect(intent === "configure" ? flow.finishConfiguration(scope) : flow.finishRegistration(scope)).toBe(true)
  })

  it("configuration qualification does not require a Prepare client", async () => {
    const { hub, scope } = await setup()
    const client = { registerPrivateMcpServer: hub.registerPrivateMcpServer, getPrivateMcpServer: hub.getPrivateMcpServer, getMcpConnector: hub.getMcpConnector, beginMcpConnectorAuthorization: hub.beginMcpConnectorAuthorization }
    const { createMcpServerCreationFlow } = await import("@/ui/mcp/mcp-server-creation-flow")
    const flow = createMcpServerCreationFlow({ client, preparation: createMcpPreparationCommands({ canPrepare: () => false, client, boundary, onConfirmed: vi.fn() }), boundary, onChanged: vi.fn() })
    flow.attach(scope.window)
    expect(flow.available).toBe(true)
    expect(await flow.submit(input, scope, "configure")).toBe(true)
    expect(flow.finishConfiguration(scope)).toBe(true)
  })

  it("configuration read failure retains the acknowledged target and retries only exact reads", async () => {
    const { flow, hub, scope } = await setup()
    hub.getPrivateMcpServer.mockRejectedValueOnce(new Error("fresh read unavailable"))
    expect(await flow.submit(input, scope, "configure")).toBe(false)
    expect(flow.getSnapshot()).toMatchObject({ registered: true, unknown: null, intent: "configure", facts: null })
    expect(flow.finishConfiguration(scope)).toBe(false)
    expect(await flow.retry(scope)).toBe(true)
    expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
    expect(hub.preparePrivateMcpServer).not.toHaveBeenCalled()
    expect(flow.getSnapshot().facts?.server.prepare_status).toBe("pending_prepare")
    expect(flow.finishConfiguration(scope)).toBe(true)
  })

})

describe("per-resource MCP preparation command owner", () => {
  const target = { serverId: "one-server", connectorId: "one-connector", version: "1" }
  const response = (serverId = target.serverId, connectorId = target.connectorId) => ({
    server: { availability: "unavailable" as const, server_id: serverId, server_url: "https://mcp.example.test/prepare", display_name: "Prepared", status: "registered" as const, state_version: "2", headers: [], transport: "streamable_http" as const, prepare_status: "ready" as const, declarations: [], declarations_available: true },
    connector: { availability: "unavailable" as const, connector_id: connectorId, connector_type: "mcp" as const, provider_key: "private", server_id: serverId, status: "active" as const, approved_scopes: [], enabled: true, state_version: "2" },
    declarations: [], replayed: false,
  })
  it("independent resources do not block each other and unknown retries keep their own key/version", async () => {
    const call = vi.fn<NonNullable<HubClient["preparePrivateMcpServer"]>>().mockRejectedValueOnce(new Error("lost ACK"))
      .mockResolvedValueOnce(response("two-server", "two-connector")).mockResolvedValue(response())
    const commands = createMcpPreparationCommands({ canPrepare: () => true, client: { preparePrivateMcpServer: call }, boundary: admitted, onConfirmed: vi.fn() })
    expect(await commands.prepare(target, admitted)).toBe(false)
    expect(await commands.prepare({ serverId: "two-server", connectorId: "two-connector", version: "8" }, admitted)).toBe(true)
    expect(await commands.prepare({ ...target, version: "99" }, admitted)).toBe(true)
    expect(call.mock.calls[2]?.slice(0, 3)).toEqual(call.mock.calls[0]?.slice(0, 3))
    expect(commands.getSnapshot().map(item => item.kind)).toEqual(["completed", "completed"])
    expect(commands.finish("one-server", admitted)).toBe(true)
    expect(commands.getSnapshot().map(item => item.serverId)).toEqual(["two-server"])
  })
  it("actor retirement cancels waits and late ACK only notifies the original projection", async () => {
    let acknowledge!: (value: ReturnType<typeof response>) => void
    const call = vi.fn<NonNullable<HubClient["preparePrivateMcpServer"]>>(() => new Promise(resolve => { acknowledge = resolve }))
    const changed = vi.fn()
    const commands = createMcpPreparationCommands({ canPrepare: () => true, client: { preparePrivateMcpServer: call }, boundary: admitted, onConfirmed: changed })
    const running = commands.prepare(target, admitted)
    commands.bind({ ...admitted, subject: "other-actor", generation: 2 })
    expect(call.mock.calls[0]?.[3]?.aborted).toBe(true)
    acknowledge(response()); expect(await running).toBe(false)
    expect(changed).toHaveBeenCalledOnce()
    expect(commands.getSnapshot()).toEqual([])
    expect(await commands.prepare(target, admitted)).toBe(false)
  })
  it("a mismatched connector ACK remains unknown and a StrictMode lease replay preserves the command", async () => {
    const call = vi.fn<NonNullable<HubClient["preparePrivateMcpServer"]>>().mockResolvedValueOnce(response("one-server", "wrong-connector")).mockResolvedValue(response())
    const changed = vi.fn()
    const commands = createMcpPreparationCommands({ canPrepare: () => true, client: { preparePrivateMcpServer: call }, boundary: admitted, onConfirmed: changed })
    const release = commands.retain(admitted)
    expect(await commands.prepare(target, admitted)).toBe(false)
    expect(changed).not.toHaveBeenCalled()
    release(); const retained = commands.retain(admitted); await Promise.resolve()
    expect(await commands.resume(target.serverId, "wrong-connector", admitted)).toBe(false)
    expect(await commands.resume(target.serverId, target.connectorId, admitted)).toBe(true)
    expect(call.mock.calls[1]?.slice(0, 3)).toEqual(call.mock.calls[0]?.slice(0, 3))
    retained(); await Promise.resolve()
    expect(commands.getSnapshot()).toEqual([])
  })
  it("an old ACK can settle the current explicit retry, but never grants completion to the retired generation", async () => {
    let acknowledge!: (value: ReturnType<typeof response>) => void
    const call = vi.fn<NonNullable<HubClient["preparePrivateMcpServer"]>>()
      .mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve }))
      .mockImplementationOnce((_id, _version, _key, signal) => new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("current wait cancelled by known ACK")), { once: true })
      }))
    const commands = createMcpPreparationCommands({ canPrepare: () => true, client: { preparePrivateMcpServer: call }, boundary: admitted, onConfirmed: vi.fn() })
    const old = commands.prepare(target, admitted)
    commands.bind({ ...admitted, admitted: false, generation: 2 })
    const current = { ...admitted, generation: 2 }; commands.bind(current)
    const retry = commands.prepare({ ...target, version: "9" }, current)
    acknowledge(response())
    expect(await old).toBe(false)
    expect(await retry).toBe(true)
    expect(call.mock.calls[1]?.slice(0, 3)).toEqual(call.mock.calls[0]?.slice(0, 3))
    expect(commands.getSnapshot()[0]?.kind).toBe("completed")
  })

})

it("expired and conflicting creation receipts retain intent but never dispatch another original or new command", async () => {
  for (const [code, status] of [["custom_api_command_replay_expired", 412], ["custom_api_conflict", 409], ["custom_api_response_invalid", 502]] as const) {
    const call = vi.fn().mockRejectedValue(new HubClientError("http", "private detail", code, status, false));
    const key = vi.fn(() => "frozen-key");
    const flow = createCustomApiCreateFlow({ client: { createCustomApi: call }, boundary: admitted, key, onConfirmed: vi.fn() });
    await flow.submit(input(), admitted);
    await flow.retry(admitted);
    flow.bind({ ...admitted, admitted: false, generation: 2 });
    flow.bind({ ...admitted, generation: 2 });
    await flow.retry({ ...admitted, generation: 2 });
    await flow.submit(input(), { ...admitted, generation: 2 });
    expect(call, code).toHaveBeenCalledOnce();
    expect(key).toHaveBeenCalledOnce();
    expect(flow.getSnapshot().kind).toBe("unknown");
    expect(JSON.stringify(flow.getSnapshot())).not.toMatch(/private detail|fixture-only|frozen-key/u);
  }
});

it("published recoverable states resume only the original key/body and clear the hint only on ACK", async () => {
  for (const [code, status, retryable, failure] of [
    ["custom_api_command_in_progress", 409, true, "in_progress"],
    ["custom_api_command_outcome_unknown", 503, false, "outcome_unknown"],
    ["custom_api_command_ownership_lost", 409, false, "ownership_lost"],
  ] as const) {
    const call = vi.fn().mockRejectedValueOnce(new HubClientError("http", "safe", code, status, retryable)).mockResolvedValue(profile);
    const flow = createCustomApiCreateFlow({ client: { createCustomApi: call }, boundary: admitted, key: () => "same-key", onConfirmed: vi.fn() });
    await flow.submit(input(), admitted);
    expect(flow.getSnapshot()).toMatchObject({ kind: "unknown", failure });
    expect(call).toHaveBeenCalledOnce();
    expect(await flow.retry(admitted)).toBe(true);
    expect(call.mock.calls.map(v => v.slice(0, 2))).toEqual([[input(), "same-key"], [input(), "same-key"]]);
    expect(flow.getSnapshot()).toEqual({ kind: "completed", name: "Original API" });
  }
});

it("an expired Prepare remains blocked across fresh CAS inputs and admission changes", async () => {
  const call = vi.fn().mockRejectedValue(new HubClientError("http", "safe", "mcp_personal_command_replay_expired", 412, false));
  const commands = createMcpPreparationCommands({ canPrepare: () => true, client: { preparePrivateMcpServer: call }, boundary: admitted, onConfirmed: vi.fn() });
  const target = { serverId: "server-blocked", connectorId: "connector-blocked", version: "2" };
  await commands.prepare(target, admitted);
  expect(commands.getSnapshot()[0]).toMatchObject({ kind: "unknown", failure: "replay_expired" });
  await commands.prepare({ ...target, version: "99" }, admitted);
  commands.bind({ ...admitted, admitted: false, generation: 2 }); commands.bind({ ...admitted, generation: 2 });
  await commands.resume(target.serverId, target.connectorId, { ...admitted, generation: 2 });
  expect(call).toHaveBeenCalledOnce();
  expect(commands.finish(target.serverId, { ...admitted, generation: 2 })).toBe(false);
  commands.bind({ ...admitted, subject: "other", generation: 3 });
  expect(commands.getSnapshot()).toEqual([]);
});

describe("Custom API per-profile management intents", () => {
  it("keeps the original edit body, CAS and key across close/recheck and cannot switch it to deletion", async () => {
    const { createCustomApiManagementCommands } = await import("@/ui/mcp/custom-api-management-commands")
    const update = vi.fn().mockRejectedValueOnce(new Error("lost ACK")).mockResolvedValue(profile)
    const remove = vi.fn().mockResolvedValue(undefined), confirmed = vi.fn()
    const flow = createCustomApiManagementCommands({ client: { updateCustomApi: update, removeCustomApi: remove }, boundary: admitted, onConfirmed: confirmed })
    const release = flow.retain(admitted)
    const body = { expected_state_version: "1", name: "Original edit", environment_upserts: [{ name: "SECRET", value: "fixture-management-secret" }] }
    expect(await flow.submit({ operation: "update", profileId: "flow-api", input: body }, admitted)).toBe(false)
    body.name = "New draft"; body.expected_state_version = "9"; body.environment_upserts[0]!.value = "changed"
    expect(await flow.submit({ operation: "remove", profileId: "flow-api", input: { expected_state_version: "9" } }, admitted)).toBe(false)
    expect(remove).not.toHaveBeenCalled()
    flow.bind({ ...admitted, admitted: false, generation: 2 })
    expect(await flow.resume("flow-api", admitted)).toBe(false)
    const current = { ...admitted, generation: 2 }; flow.bind(current)
    expect(await flow.resume("flow-api", current)).toBe(true)
    expect(update.mock.calls[0]?.slice(0, 3)).toEqual(update.mock.calls[1]?.slice(0, 3))
    expect(update.mock.calls[1]?.[1]).toEqual({ expected_state_version: "1", name: "Original edit", environment_upserts: [{ name: "SECRET", value: "fixture-management-secret" }] })
    expect(flow.getSnapshot()).toEqual([{ profileId: "flow-api", operation: "update", kind: "completed" }])
    expect(confirmed).toHaveBeenCalledOnce(); expect(flow.finish("flow-api", current)).toBe(true)
    expect(flow.getSnapshot()).toEqual([]); release(); await Promise.resolve()
  })

  it("isolates resources, blocks expired replay and retires all intents with the actor", async () => {
    const { createCustomApiManagementCommands } = await import("@/ui/mcp/custom-api-management-commands")
    const remove = vi.fn().mockRejectedValue(new HubClientError("http", "safe", "custom_api_command_replay_expired", 412, false))
    const update = vi.fn().mockResolvedValue(profile)
    const flow = createCustomApiManagementCommands({ client: { updateCustomApi: update, removeCustomApi: remove }, boundary: admitted, onConfirmed: vi.fn() })
    expect(await flow.submit({ operation: "remove", profileId: "deleted-api", input: { expected_state_version: "4" } }, admitted)).toBe(false)
    expect(await flow.submit({ operation: "update", profileId: "other-api", input: { expected_state_version: "1", name: "Other" } }, admitted)).toBe(true)
    expect(await flow.resume("deleted-api", admitted)).toBe(false)
    expect(remove).toHaveBeenCalledOnce()
    expect(flow.getSnapshot()).toEqual([{ profileId: "deleted-api", operation: "remove", kind: "unknown", failure: "replay_expired" }, { profileId: "other-api", operation: "update", kind: "completed" }])
    flow.bind({ ...admitted, subject: "other-actor" }); flow.bind(admitted)
    expect(flow.getSnapshot()).toEqual([])
    expect(await flow.resume("deleted-api", admitted)).toBe(false)
  })

  it("preserves a deletion after its window closes and consumes a late ACK without another request", async () => {
    const { createCustomApiManagementCommands } = await import("@/ui/mcp/custom-api-management-commands")
    let acknowledge!: () => void
    const pending = new Promise<void>(resolve => { acknowledge = resolve })
    const remove = vi.fn().mockReturnValue(pending), confirmed = vi.fn()
    const flow = createCustomApiManagementCommands({ client: { removeCustomApi: remove }, boundary: admitted, onConfirmed: confirmed })
    const controller = new AbortController()
    const wait = flow.submit({ operation: "remove", profileId: "gone-api", input: { expected_state_version: "1" } }, admitted, controller.signal)
    controller.abort()
    expect(remove.mock.calls[0]?.[3].aborted).toBe(true)
    expect(flow.getSnapshot()[0]?.kind).toBe("unknown")
    acknowledge(); expect(await wait).toBe(false)
    expect(flow.getSnapshot()[0]?.kind).toBe("completed")
    expect(await flow.resume("gone-api", admitted)).toBe(true)
    expect(flow.finish("gone-api", admitted)).toBe(true)
    expect(remove).toHaveBeenCalledOnce(); expect(confirmed).toHaveBeenCalledOnce()
  })

  it("a first unambiguous validation rejection releases the slot but an uncertain rejection does not", async () => {
    const { createCustomApiManagementCommands } = await import("@/ui/mcp/custom-api-management-commands")
    const invalid = new HubClientError("http", "safe", "invalid_custom_api_request", 400, false)
    const update = vi.fn().mockRejectedValueOnce(invalid).mockRejectedValueOnce(new Error("lost ACK")).mockRejectedValue(invalid)
    const flow = createCustomApiManagementCommands({ client: { updateCustomApi: update }, boundary: admitted, onConfirmed: vi.fn() })
    const intent = { operation: "update" as const, profileId: "flow-api", input: { expected_state_version: "1", name: "Edit" } }
    expect(await flow.submit(intent, admitted)).toBe(false); expect(flow.getSnapshot()[0]?.kind).toBe("rejected")
    expect(await flow.submit(intent, admitted)).toBe(false); expect(update.mock.calls[0]?.[2]).not.toBe(update.mock.calls[1]?.[2])
    expect(await flow.resume("flow-api", admitted)).toBe(false); expect(flow.getSnapshot()[0]?.kind).toBe("unknown")
    expect(await flow.submit(intent, admitted)).toBe(false); expect(update).toHaveBeenCalledTimes(3)
    expect(update.mock.calls[1]?.slice(0, 3)).toEqual(update.mock.calls[2]?.slice(0, 3))
    flow.bind({ ...admitted, subject: null, admitted: false })
  })
})

it("an earlier management ACK settles an active explicit retry without letting the first window consume it", async () => {
  const { createCustomApiManagementCommands } = await import("@/ui/mcp/custom-api-management-commands")
  let firstAck!: () => void, retryAck!: () => void
  const first = new Promise<void>(resolve => { firstAck = resolve }), retry = new Promise<void>(resolve => { retryAck = resolve })
  const remove = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(retry)
  const confirmed = vi.fn()
  const flow = createCustomApiManagementCommands({ client: { removeCustomApi: remove }, boundary: admitted, onConfirmed: confirmed })
  const controller = new AbortController()
  const oldWindow = flow.submit({ operation: "remove", profileId: "late-api", input: { expected_state_version: "1" } }, admitted, controller.signal)
  controller.abort()
  const currentWindow = flow.resume("late-api", admitted)
  firstAck(); expect(await oldWindow).toBe(false)
  expect(remove.mock.calls[1]?.[3].aborted).toBe(true)
  retryAck(); expect(await currentWindow).toBe(true)
  expect(flow.finish("late-api", admitted)).toBe(true)
  expect(confirmed).toHaveBeenCalledTimes(2)
  expect(remove.mock.calls[0]?.slice(0, 3)).toEqual(remove.mock.calls[1]?.slice(0, 3))
})

describe("MCP typed management and Prepare interlock", () => {
  const connector = { availability: "unavailable" as const, connector_id: "managed-connector", server_id: "managed-server", connector_type: "mcp" as const, provider_key: "fixture", status: "active" as const, enabled: true, state_version: "2", approved_scopes: [] }
  const server = { availability: "unavailable" as const, server_id: "managed-server", display_name: "Edited", server_url: "https://mcp.example.test/", status: "pending" as const, state_version: "2", headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare" as const, declarations: [], declarations_available: false }
  const client = () => ({ updatePrivateMcpServer: vi.fn().mockResolvedValue({ server, connector, replayed: false }), deletePrivateMcpServer: vi.fn().mockResolvedValue({ server_id: server.server_id, deleted: true, replayed: false }), updateMcpConnector: vi.fn().mockResolvedValue(connector), setMcpConnectorEnabled: vi.fn().mockResolvedValue(connector), removeMcpConnector: vi.fn().mockResolvedValue({ ...connector, status: "revoked", enabled: false }), preparePrivateMcpServer: vi.fn().mockRejectedValue(new Error("unknown prepare")) })

  it("shares only confirmed irreversible deletion locators across finish and readmission, then retires them", async () => {
    const { createMcpLifecycleCommands } = await import("@/ui/mcp/mcp-management-commands")
    const hub = client(), flow = createMcpLifecycleCommands({ client: hub, boundary: admitted, onConfirmed: vi.fn() })
    const original = flow.management.getConfirmedDeletedSnapshot()
    hub.deletePrivateMcpServer.mockRejectedValueOnce(new Error("lost ACK"))
    const intent = { operation: "delete_server" as const, connectorId: connector.connector_id, serverId: server.server_id, input: { expected_state_version: "2" } }
    expect(await flow.management.submit(intent, admitted)).toBe(false)
    expect(flow.management.getConfirmedDeletedSnapshot()).toBe(original)
    expect(await flow.management.resume(connector.connector_id, admitted)).toBe(true)
    const confirmed = flow.management.getConfirmedDeletedSnapshot()
    expect(confirmed).toEqual([connector.connector_id]); expect(Object.isFrozen(confirmed)).toBe(true)
    expect(flow.management.finish(connector.connector_id, admitted)).toBe(true)
    flow.management.bind({ ...admitted, admitted: false, generation: 2 })
    flow.management.bind({ ...admitted, generation: 3 })
    expect(flow.management.getConfirmedDeletedSnapshot()).toBe(confirmed)
    flow.management.bind({ ...admitted, subject: "other-actor" })
    expect(flow.management.getConfirmedDeletedSnapshot()).toEqual([])
  })

  it.each([false, true])("a late deletion ACK records a safe locator only while its actor owner lives (retired=%s)", async retired => {
    const { createMcpLifecycleCommands } = await import("@/ui/mcp/mcp-management-commands")
    const hub = client(), flow = createMcpLifecycleCommands({ client: hub, boundary: admitted, onConfirmed: vi.fn() })
    let acknowledge!: (value: { server_id: string; deleted: boolean; replayed: boolean }) => void
    hub.deletePrivateMcpServer.mockReturnValue(new Promise(resolve => { acknowledge = resolve }))
    const close = new AbortController()
    const pending = flow.management.submit({ operation: "delete_server", connectorId: connector.connector_id, serverId: server.server_id, input: { expected_state_version: "2" } }, admitted, close.signal)
    close.abort()
    if (retired) flow.management.bind({ ...admitted, subject: "other-actor" })
    acknowledge({ server_id: server.server_id, deleted: true, replayed: false }); await pending
    expect(flow.management.getConfirmedDeletedSnapshot()).toEqual(retired ? [] : [connector.connector_id])
  })

  it("does not turn reversible disconnect or rejected deletion into permanent display suppression", async () => {
    const { createMcpLifecycleCommands } = await import("@/ui/mcp/mcp-management-commands")
    const hub = client(), flow = createMcpLifecycleCommands({ client: hub, boundary: admitted, onConfirmed: vi.fn() })
    expect(await flow.management.submit({ operation: "disconnect", connectorId: connector.connector_id, serverId: server.server_id, input: { expected_state_version: "2" } }, admitted)).toBe(true)
    expect(flow.management.getConfirmedDeletedSnapshot()).toEqual([])
    expect(flow.management.finish(connector.connector_id, admitted)).toBe(true)
    hub.deletePrivateMcpServer.mockRejectedValue(new HubClientError("http", "safe", "invalid_mcp_personal_request", 400, false))
    expect(await flow.management.submit({ operation: "delete_server", connectorId: connector.connector_id, serverId: server.server_id, input: { expected_state_version: "2" } }, admitted)).toBe(false)
    expect(flow.management.getConfirmedDeletedSnapshot()).toEqual([])
  })

  it("shares only exact revoked connector CAS evidence, retaining it over finish but not actor retirement", async () => {
    const { createMcpLifecycleCommands } = await import("@/ui/mcp/mcp-management-commands")
    const hub = client(), flow = createMcpLifecycleCommands({ client: hub, boundary: admitted, onConfirmed: vi.fn() })
    const empty = flow.management.getConfirmedRevokedSnapshot()
    hub.removeMcpConnector.mockRejectedValueOnce(new Error("lost ACK"))
    const intent = { operation: "disconnect" as const, connectorId: connector.connector_id, serverId: server.server_id, input: { expected_state_version: "2" } }
    expect(await flow.management.submit(intent, admitted)).toBe(false)
    expect(flow.management.getConfirmedRevokedSnapshot()).toBe(empty)
    expect(await flow.management.resume(connector.connector_id, admitted)).toBe(true)
    const confirmed = flow.management.getConfirmedRevokedSnapshot()
    expect(confirmed).toEqual([{ connectorId: connector.connector_id, stateVersion: connector.state_version }])
    expect(Object.isFrozen(confirmed[0])).toBe(true)
    expect(flow.management.finish(connector.connector_id, admitted)).toBe(true)
    flow.management.bind({ ...admitted, generation: 2 })
    expect(flow.management.getConfirmedRevokedSnapshot()).toBe(confirmed)
    flow.management.bind({ ...admitted, subject: "other-actor" })
    expect(flow.management.getConfirmedRevokedSnapshot()).toEqual([])
  })

  it.each(["wrong-target", "not-revoked"] as const)("does not record %s removal responses as revoked evidence", async outcome => {
    const { createMcpLifecycleCommands } = await import("@/ui/mcp/mcp-management-commands")
    const hub = client(), flow = createMcpLifecycleCommands({ client: hub, boundary: admitted, onConfirmed: vi.fn() })
    hub.removeMcpConnector.mockResolvedValue({ ...connector, ...(outcome === "wrong-target" ? { connector_id: "other-target", status: "revoked" } : {}) })
    await flow.management.submit({ operation: "disconnect", connectorId: connector.connector_id, serverId: server.server_id, input: { expected_state_version: "2" } }, admitted)
    expect(flow.management.getConfirmedRevokedSnapshot()).toEqual([])
  })

  it("freezes each of the five original operations and cannot replace it with another edit or new CAS", async () => {
    const { createMcpLifecycleCommands } = await import("@/ui/mcp/mcp-management-commands")
    const intents: import("@/ui/mcp/mcp-management-commands").McpManagementIntent[] = [
      { operation: "update_server", connectorId: connector.connector_id, serverId: server.server_id, input: { expected_state_version: "1", display_name: "Edited", header_upserts: [{ name: "x-test", value: "frozen-header-value" }] } },
      { operation: "delete_server", connectorId: connector.connector_id, serverId: server.server_id, input: { expected_state_version: "1" } },
      { operation: "update_connector", connectorId: connector.connector_id, input: { expected_state_version: "1", display_name: "Edited", description: "Note" } },
      { operation: "set_enabled", connectorId: connector.connector_id, input: { expected_state_version: "1", enabled: true } },
      { operation: "disconnect", connectorId: connector.connector_id, input: { expected_state_version: "1" } },
    ]
    for (const intent of intents) {
      const hub = client(), changed = vi.fn(), flow = createMcpLifecycleCommands({ client: hub, boundary: admitted, onConfirmed: changed })
      const methods = { update_server: hub.updatePrivateMcpServer, delete_server: hub.deletePrivateMcpServer, update_connector: hub.updateMcpConnector, set_enabled: hub.setMcpConnectorEnabled, disconnect: hub.removeMcpConnector }
      const method = methods[intent.operation]; method.mockRejectedValueOnce(new Error("lost ACK"))
      expect(await flow.management.submit(intent, admitted)).toBe(false)
      intent.input.expected_state_version = "9"
      if (intent.operation === "update_server") intent.input.header_upserts![0]!.value = "changed header"
      expect(await flow.management.submit({ operation: "disconnect", connectorId: connector.connector_id, input: { expected_state_version: "9" } }, admitted)).toBe(false)
      const current = { ...admitted, generation: 2 }
      flow.management.bind({ ...current, admitted: false }); flow.preparation.bind({ ...current, admitted: false })
      flow.management.bind(current); flow.preparation.bind(current)
      expect(await flow.management.resume(connector.connector_id, current)).toBe(true)
      expect(method.mock.calls[0]?.slice(0, 3)).toEqual(method.mock.calls[1]?.slice(0, 3))
      expect(JSON.stringify(flow.management.getSnapshot())).not.toMatch(/frozen-header-value|changed header|expected_state_version/)
      expect(changed).toHaveBeenCalledOnce(); expect(flow.management.finish(connector.connector_id, current)).toBe(true)
    }
  })

  it.each(["replace", "clear"] as const)("only the frozen exact icon %s target is invalidated after its ACK, never while unknown", async operation => {
    const { createMcpLifecycleCommands } = await import("@/ui/mcp/mcp-management-commands")
    const hub = client(), changed = vi.fn(), flow = createMcpLifecycleCommands({ client: hub, boundary: admitted, onConfirmed: changed })
    hub.updatePrivateMcpServer.mockRejectedValueOnce(new Error("lost ACK"))
    const intent: import("@/ui/mcp/mcp-management-commands").McpManagementIntent = { operation: "update_server", connectorId: connector.connector_id, serverId: server.server_id, input: { expected_state_version: "1", ...(operation === "clear" ? { clear_icon: true as const } : { icon: { intent_id: "11111111-1111-4111-8111-111111111111", expected_state_version: "1" } }) } }
    expect(await flow.management.submit(intent, admitted)).toBe(false)
    expect(changed).not.toHaveBeenCalled()
    intent.serverId = "not-the-frozen-target"
    if (operation === "clear") delete intent.input.clear_icon
    else intent.input.icon!.intent_id = "22222222-2222-4222-8222-222222222222"
    expect(await flow.management.resume(connector.connector_id, admitted)).toBe(true)
    expect(changed).toHaveBeenCalledExactlyOnceWith(server.server_id)
    expect(hub.updatePrivateMcpServer.mock.calls[0]?.slice(0, 3)).toEqual(hub.updatePrivateMcpServer.mock.calls[1]?.slice(0, 3))
  })

  it("a late icon ACK invalidates only its original actor/server, never the replacement actor or another client", async () => {
    const { createMcpLifecycleCommands } = await import("@/ui/mcp/mcp-management-commands")
    const { invalidateMcpConnectorProjection, getMcpServerMediaRevisions, getMcpConnectorRevisionSnapshot } = await import("@/ui/mcp/use-mcp-projection")
    const hub = client(), otherClient = client(), subject = admitted.subject
    let acknowledge!: (value: { server: typeof server; connector: typeof connector; replayed: boolean }) => void
    hub.updatePrivateMcpServer.mockReturnValue(new Promise(resolve => { acknowledge = resolve }))
    const flow = createMcpLifecycleCommands({ client: hub, boundary: admitted, onConfirmed: serverId => invalidateMcpConnectorProjection(hub as unknown as HubClient, subject, serverId) })
    const wait = flow.management.submit({ operation: "update_server", connectorId: connector.connector_id, serverId: server.server_id, input: { expected_state_version: "1", clear_icon: true } }, admitted)
    flow.management.bind({ ...admitted, subject: "replacement-actor" })
    expect(getMcpServerMediaRevisions(hub, subject).size).toBe(0)
    acknowledge({ server, connector, replayed: false }); expect(await wait).toBe(false)
    expect(getMcpServerMediaRevisions(hub, subject).get(server.server_id)).toBe(1)
    expect(getMcpConnectorRevisionSnapshot(hub, subject)).toBe(1)
    expect(getMcpServerMediaRevisions(hub, "replacement-actor").size).toBe(0)
    expect(getMcpConnectorRevisionSnapshot(hub, "replacement-actor")).toBe(0)
    expect(getMcpServerMediaRevisions(otherClient, subject).size).toBe(0)
  })

  it("blocks configuration changes during unknown Prepare but still permits explicit cleanup and only retires Prepare at its ACK", async () => {
    const { createMcpLifecycleCommands } = await import("@/ui/mcp/mcp-management-commands")
    const hub = client(), flow = createMcpLifecycleCommands({ client: hub, boundary: admitted, onConfirmed: vi.fn() })
    const target = { serverId: server.server_id, connectorId: connector.connector_id, version: "1" }
    expect(await flow.preparation.prepare(target, admitted)).toBe(false)
    expect(await flow.management.submit({ operation: "update_server", connectorId: connector.connector_id, serverId: server.server_id, input: { expected_state_version: "2", display_name: "Other" } }, admitted)).toBe(false)
    expect(hub.updatePrivateMcpServer).not.toHaveBeenCalled()
    hub.removeMcpConnector.mockRejectedValueOnce(new Error("cleanup unknown"))
    expect(await flow.management.submit({ operation: "disconnect", connectorId: connector.connector_id, serverId: server.server_id, input: { expected_state_version: "2" } }, admitted)).toBe(false)
    expect(flow.preparation.getSnapshot()[0]?.kind).toBe("unknown")
    expect(await flow.preparation.resume(server.server_id, connector.connector_id, admitted)).toBe(false)
    expect(hub.preparePrivateMcpServer).toHaveBeenCalledOnce()
    expect(await flow.management.resume(connector.connector_id, admitted)).toBe(true)
    expect(flow.preparation.getSnapshot()).toEqual([])
    expect(await flow.preparation.resume(server.server_id, connector.connector_id, admitted)).toBe(false)
    expect(flow.management.finish(connector.connector_id, admitted)).toBe(true)
  })

  it("management locks only its exact resource, preserves terminal failures over recheck, and retires on actor change", async () => {
    const { createMcpLifecycleCommands } = await import("@/ui/mcp/mcp-management-commands")
    const hub = client(), flow = createMcpLifecycleCommands({ client: hub, boundary: admitted, onConfirmed: vi.fn() })
    hub.updateMcpConnector.mockRejectedValue(new HubClientError("http", "safe", "mcp_personal_command_replay_expired", 412, false))
    expect(await flow.management.submit({ operation: "update_connector", connectorId: connector.connector_id, input: { expected_state_version: "1", display_name: "Edited", description: "Note" } }, admitted)).toBe(false)
    expect(await flow.preparation.prepare({ serverId: server.server_id, connectorId: connector.connector_id, version: "2" }, admitted)).toBe(false)
    expect(await flow.preparation.prepare({ serverId: "other-server", connectorId: "other-connector", version: "1" }, admitted)).toBe(false)
    expect(hub.preparePrivateMcpServer).toHaveBeenCalledOnce()
    flow.management.bind({ ...admitted, generation: 2 }); flow.preparation.bind({ ...admitted, generation: 2 })
    expect(await flow.management.resume(connector.connector_id, { ...admitted, generation: 2 })).toBe(false)
    expect(hub.updateMcpConnector).toHaveBeenCalledOnce()
    expect(flow.management.getSnapshot()[0]?.failure).toBe("replay_expired")
    flow.management.bind({ ...admitted, subject: "other-actor" }); flow.preparation.bind({ ...admitted, subject: "other-actor" })
    expect(flow.management.getSnapshot()).toEqual([]); expect(flow.preparation.getSnapshot()).toEqual([])
  })

  it("a closed management wait retains its exact target and accepts a late ACK without dispatching again", async () => {
    const { createMcpLifecycleCommands } = await import("@/ui/mcp/mcp-management-commands")
    const hub = client(), changed = vi.fn(), flow = createMcpLifecycleCommands({ client: hub, boundary: admitted, onConfirmed: changed })
    let finish!: (value: typeof connector) => void
    const pending = new Promise<typeof connector>(resolve => { finish = resolve })
    hub.setMcpConnectorEnabled.mockReturnValue(pending)
    const close = new AbortController()
    const wait = flow.management.submit({ operation: "set_enabled", connectorId: connector.connector_id, serverId: server.server_id, input: { expected_state_version: "1", enabled: true } }, admitted, close.signal)
    close.abort(); expect(hub.setMcpConnectorEnabled.mock.calls[0]?.[3].aborted).toBe(true)
    expect(flow.management.getSnapshot()[0]?.kind).toBe("unknown")
    finish(connector); expect(await wait).toBe(false)
    expect(await flow.management.resume(connector.connector_id, admitted)).toBe(true)
    expect(flow.management.finish(connector.connector_id, admitted)).toBe(true)
    expect(hub.setMcpConnectorEnabled).toHaveBeenCalledOnce(); expect(changed).toHaveBeenCalledOnce()
  })
})


it("a pre-aborted creation window does not freeze a new command or dispatch it", async () => {
  const call = vi.fn().mockResolvedValue(profile), key = vi.fn(() => "not-dispatched");
  const flow = createCustomApiCreateFlow({ client: { createCustomApi: call }, boundary: admitted, key, onConfirmed: vi.fn() });
  const controller = new AbortController(); controller.abort();
  expect(await flow.submit(input(), admitted, controller.signal)).toBe(false);
  expect(call).not.toHaveBeenCalled();
  expect(key).not.toHaveBeenCalled();
  expect(flow.getSnapshot().kind).toBe("idle");
});

describe("Provider actor-owned original Create", () => {
  const input = { provider_key: "directory-app", connector_type: "mcp" as const, display_name: "Original provider", description: "Original" }
  const connector = { availability: "unavailable" as const, connector_id: "created", provider_key: input.provider_key, connector_type: "mcp" as const, status: "pending" as const, enabled: false, approved_scopes: [], state_version: "1" }
  it("keeps a confirmed locator across rechecks without replaying Create or old facts", async () => {
    const { createProviderCreationCommands } = await import("@/ui/mcp/provider-creation-commands")
    const create = vi.fn().mockResolvedValue(connector)
    const commands = createProviderCreationCommands({ client: { createMcpConnector: create }, boundary: admitted, onConfirmed: vi.fn() })
    const release = commands.retain(admitted)
    expect(await commands.run(input, admitted, new AbortController().signal)).toBe("created")
    const next = { ...admitted, generation: 2 }
    const nextRelease = commands.retain(next); release()
    expect(await commands.run({ ...input, display_name: "Changed directory" }, next, new AbortController().signal)).toBe("created")
    expect(create).toHaveBeenCalledOnce()
    expect(commands.getSnapshot()).toEqual([{ kind: "completed", name: input.display_name, providerKey: input.provider_key, connectorId: "created" }])
    expect(commands.finish(input.provider_key, admitted)).toBe(false)
    expect(commands.finish(input.provider_key, next)).toBe(true)
    nextRelease()
  })
  it("pauses an unknown Create, preserves original body/key, and requires explicit recovery", async () => {
    const { createProviderCreationCommands } = await import("@/ui/mcp/provider-creation-commands")
    let finish!: (value: typeof connector) => void
    const create = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(connector)
    const commands = createProviderCreationCommands({ client: { createMcpConnector: create }, boundary: admitted, onConfirmed: vi.fn() })
    const release = commands.retain(admitted), window = new AbortController()
    const old = commands.run(input, admitted, window.signal)
    window.abort()
    expect(commands.getSnapshot()[0]?.kind).toBe("unknown")
    const next = { ...admitted, generation: 2 }
    const nextRelease = commands.retain(next); release()
    expect(create).toHaveBeenCalledOnce()
    expect(await commands.run({ ...input, description: "Edited" }, next, new AbortController().signal)).toBe("created")
    expect(create.mock.calls[1]?.slice(0, 2)).toEqual(create.mock.calls[0]?.slice(0, 2))
    finish(connector); expect(await old).toBe(null)
    expect(create).toHaveBeenCalledTimes(2)
    nextRelease()
  })
  it("isolates provider keys and retires actor locators rather than reviving A after B", async () => {
    const { createProviderCreationCommands } = await import("@/ui/mcp/provider-creation-commands")
    let finish!: (value: typeof connector) => void
    const create = vi.fn(() => new Promise<typeof connector>(resolve => { finish = resolve }))
    const confirmed = vi.fn()
    const commands = createProviderCreationCommands({ client: { createMcpConnector: create }, boundary: admitted, onConfirmed: confirmed })
    commands.retain(admitted)
    const old = commands.run(input, admitted, new AbortController().signal)
    commands.retain({ ...admitted, subject: "other" })
    commands.retain(admitted)
    finish(connector)
    expect(await old).toBe(null)
    expect(commands.getSnapshot()).toEqual([])
    expect(await commands.run(input, admitted, new AbortController().signal)).toBe(null)
    expect(confirmed).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledOnce()
  })
})
