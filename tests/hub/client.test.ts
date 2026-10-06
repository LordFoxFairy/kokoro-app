import { afterEach, describe, expect, it, vi } from "vitest"

import { createHubClient, createSkillInstallationClient, HubClientError } from "@/hub/client"

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } })
}

function publicResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "request-1" } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("browser Hub cache directive boundary", () => {
  const consumers = [
    { name: "personal Skills", read: () => createHubClient().listPersonalSkills(), body: { data: { skills: [] } }, expected: { skills: [] } },
    { name: "MCP projection", read: () => createHubClient().listMcpConnections(), body: { data: { connections: [] } }, expected: { connections: [] } },
    { name: "installations", read: () => createSkillInstallationClient().list(), body: { data: [] }, expected: { data: [] } },
  ]
  it.each(consumers)("accepts final Proxy no-store directives for $name", async ({ read, body, expected }) => {
    for (const cacheControl of ["private, no-store, max-age=0", "NO-STORE, private", "private,\tno-store\t, max-age=0", 'extension="value, no-store, value", no-store']) {
      const response = publicResponse(body)
      response.headers.set("cache-control", cacheControl)
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
      await expect(read()).resolves.toEqual(expected)
    }
  })
  it.each(consumers)("rejects missing or lookalike no-store directives for $name", async ({ read, body }) => {
    for (const cacheControl of [null, "private, max-age=0", "no-cache", "x-no-store", "no-store-extra", "no-store=1", 'extension="value, no-store, value"', 'no-store, extension="unterminated']) {
      const response = publicResponse(body)
      if (cacheControl === null) response.headers.delete("cache-control")
      else response.headers.set("cache-control", cacheControl)
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
      await expect(read()).rejects.toMatchObject({ reason: "parse", status: 200 })
    }
  })
  it.each(consumers)("preserves strict media, request ID and schema validation for $name", async ({ read, body }) => {
    for (const [name, value] of [["content-type", "text/plain"], ["x-request-id", "invalid request id"], ["x-request-id", ""]]) {
      const response = publicResponse(body)
      response.headers.set("cache-control", "private, no-store, max-age=0")
      response.headers.set(name!, value!)
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
      await expect(read()).rejects.toMatchObject({ reason: "parse", status: 200 })
    }
    const response = publicResponse({ ...body, unexpected: true })
    response.headers.set("cache-control", "private, no-store, max-age=0")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
    await expect(read()).rejects.toMatchObject({ reason: "parse", status: 200 })
  })
  it.each(consumers)("preserves typed authorization rejection under final Proxy headers for $name", async ({ read }) => {
    const response = publicResponse({ error: { code: "session_invalid", message: "revoked", retryable: false } }, 401)
    response.headers.set("cache-control", "private, no-store, max-age=0")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
    await expect(read()).rejects.toMatchObject({ reason: "http", status: 401, code: "session_invalid" })
  })
})

describe("hub client", () => {
  it("rejects non-JSON success and error projection bodies but accepts UTF-8 JSON", async () => {
    const headers = { "cache-control": "no-store", "x-request-id": "req-json" }
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response('{"data":{"skills":[]}}', { status: 200, headers: { ...headers, "content-type": "text/plain" } }))
      .mockResolvedValueOnce(new Response('{"error":{"code":"session_invalid","message":"expired","retryable":false}}', { status: 401, headers: { ...headers, "content-type": "text/plain" } }))
      .mockResolvedValueOnce(new Response('{"data":{"skills":[]}}', { status: 200, headers: { ...headers, "content-type": "application/json; charset=utf-8" } }))
      .mockResolvedValueOnce(new Response('{"error":{"code":"session_invalid","message":"expired","retryable":false}}', { status: 401, headers: { ...headers, "content-type": "application/json; charset=utf-8" } })))
    const client = createHubClient()
    await expect(client.listPersonalSkills()).rejects.toMatchObject({ reason: "parse", status: 200 })
    await expect(client.listPersonalSkills()).rejects.toMatchObject({ reason: "parse", status: 401 })
    expect(await client.listPersonalSkills()).toEqual({ skills: [] })
    await expect(client.listPersonalSkills()).rejects.toMatchObject({ reason: "http", status: 401, code: "session_invalid" })
  })

  it("reads personal Skill pages by opaque cursor and resolves ACTIVE by ID without old catalog", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(publicResponse({ data: { skills: [{ source_ref: "skill:skill-1", name: "Mine", description: "Private", content_hash: "digest", scope: "personal", revision: "2", enabled: true, categories: [] }], next_cursor: "opaque-next" } }))
      .mockResolvedValueOnce(publicResponse({ data: { skill_id: "skill-1", source_ref: "skill:skill-1", revision: "2", status: "active", name: "Mine", summary: "Private", tags: [] } }))
    vi.stubGlobal("fetch", fetchMock)
    const client = createHubClient()

    const page = await client.listPersonalSkills("opaque-current")
    expect(page.skills[0]).toMatchObject({ source_ref: "skill:skill-1", revision: "2" })
    expect(page.next_cursor).toBe("opaque-next")
    const published = await client.getPublishedPersonalSkill("skill-1")
    expect(published).toEqual({ skill_id: "skill-1", source_ref: "skill:skill-1", revision: "2", status: "active", name: "Mine", summary: "Private", tags: [] })
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/hub/self/skills?scope_kind=personal&cursor=opaque-current",
      "/api/hub/self/skills/skill-1",
    ])
  })

  it("reads only owner-native MCP connection fields and rejects Server fields", async () => {
    const connection = { connection_id: "connection-1", connector_id: "connector-1", server_id: "server-1", provider_key: "provider", transport: "streamable_http", status: "active" }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(publicResponse({ data: { connections: [connection], next_cursor: "next" } }))
      .mockResolvedValueOnce(publicResponse({ data: { connections: [{ ...connection, declaration_digest: "a".repeat(64) }] } }))
    vi.stubGlobal("fetch", fetchMock)
    const client = createHubClient()
    expect(await client.listMcpConnections()).toEqual({ connections: [connection], next_cursor: "next" })
    await expect(client.listMcpConnections()).rejects.toMatchObject({ reason: "parse" })
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(["/api/hub/self/mcp/connections", "/api/hub/self/mcp/connections"])
  })

  it("bounds MCP connection response bytes, UTF-8, error status and caller cancellation", async () => {
    const validHeaders = { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "connection-read" }
    const connection = { connection_id: "connection-1", connector_id: "connector-1", server_id: "server-1", provider_key: "provider", transport: "streamable_http", status: "active" }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([123, 34, 255, 34, 58, 49, 125]), { status: 200, headers: validHeaders }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { connections: [connection] } }), { status: 200, headers: { ...validHeaders, "content-length": String(1024 * 1024 + 1) } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "session_invalid", message: "expired", retryable: false } }), { status: 503, headers: validHeaders }))
      .mockImplementationOnce((_input, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })
      }))
    vi.stubGlobal("fetch", fetchMock)
    const client = createHubClient()
    await expect(client.listMcpConnections()).rejects.toMatchObject({ reason: "parse", status: 200 })
    await expect(client.listMcpConnections()).rejects.toMatchObject({ reason: "parse", status: 200 })
    await expect(client.listMcpConnections()).rejects.toMatchObject({ reason: "parse", status: 503 })
    const controller = new AbortController()
    const pending = client.listMcpConnections({}, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ reason: "aborted" })
  })

  it("applies one ten-second MCP Connection deadline to the pending response", async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal("fetch", vi.fn((_input, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })
      })))
      const pending = createHubClient().listMcpConnections()
      const rejected = expect(pending).rejects.toMatchObject({ reason: "aborted" })
      await vi.advanceTimersByTimeAsync(10_001)
      await rejected
    } finally {
      vi.useRealTimers()
    }
  })

  it("cancels an unread MCP response body when strict headers reject it early", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined)
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new TextEncoder().encode("{}")) },
      cancel,
    })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { "content-type": "text/plain", "cache-control": "no-store", "x-request-id": "connection-early-reject" },
    })))

    await expect(createHubClient().listMcpConnections()).rejects.toMatchObject({ reason: "parse", status: 200 })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it("sends each MCP connection filter once and preserves opaque pagination", async () => {
    const fetchMock = vi.fn().mockResolvedValue(publicResponse({ data: { connections: [], next_cursor: "opaque-next" } }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(createHubClient().listMcpConnections({ connection_id: "connection-1", provider_key: "provider-one", limit: 25, cursor: "opaque-current" })).resolves.toEqual({ connections: [], next_cursor: "opaque-next" })
    const query = new URL(fetchMock.mock.calls[0]![0], "http://localhost").searchParams
    expect([...query]).toEqual([["connection_id", "connection-1"], ["provider_key", "provider-one"], ["limit", "25"], ["cursor", "opaque-current"]])
  })

  it("applies MCP provider and cursor bounds by Unicode code point", async () => {
    const row = { connection_id: "connection-1", connector_id: "connector-1", server_id: "server-1", provider_key: "😀".repeat(191), transport: "streamable_http", status: "active" }
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(publicResponse({ data: { connections: [row], next_cursor: "😀".repeat(2048) } }))
      .mockResolvedValueOnce(publicResponse({ data: { connections: [{ ...row, provider_key: row.provider_key + "😀" }] } }))
      .mockResolvedValueOnce(publicResponse({ data: { connections: [], next_cursor: "😀".repeat(2049) } })))
    const client = createHubClient()
    await expect(client.listMcpConnections()).resolves.toEqual({ connections: [row], next_cursor: "😀".repeat(2048) })
    await expect(client.listMcpConnections()).rejects.toMatchObject({ reason: "parse" })
    await expect(client.listMcpConnections()).rejects.toMatchObject({ reason: "parse" })
  })

  it("fails closed on unknown personal Skill state, unauthorized owner response and bad headers", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(publicResponse({ data: { skill_id: "skill-1", source_ref: "skill:skill-1", revision: "2", status: "draft", name: "Mine", summary: "Private", tags: [] } }))
      .mockResolvedValueOnce(publicResponse({ error: { code: "session_invalid", message: "revoked", retryable: false } }, 401))
      .mockResolvedValueOnce(jsonResponse({ data: { skills: [], next_cursor: null } }))
    vi.stubGlobal("fetch", fetchMock)
    const client = createHubClient()
    await expect(client.getPublishedPersonalSkill("skill-1")).rejects.toMatchObject({ reason: "parse" })
    await expect(client.getPublishedPersonalSkill("skill-1")).rejects.toMatchObject({ reason: "http", status: 401, code: "session_invalid" })
    await expect(client.listPersonalSkills()).rejects.toMatchObject({ reason: "parse" })
  })
  it("rejects a by-ID Skill response for another personal identity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(publicResponse({
      data: { skill_id: "skill-other", source_ref: "skill:skill-other", revision: "2", status: "active", name: "Other", summary: "Private", tags: [] },
    })))
    await expect(createHubClient().getPublishedPersonalSkill("skill-1")).rejects.toMatchObject({ reason: "parse" })
  })
  it.each([
    [401, "session_invalid"],
    [403, "session_forbidden"],
    [404, "skill_not_found"],
    [502, "skill_dependency_unavailable"],
  ])("preserves by-ID owner error %i without claiming ACTIVE", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(publicResponse({ error: { code, message: "owner rejected", retryable: status === 502 } }, status)))
    await expect(createHubClient().getPublishedPersonalSkill("skill-1")).rejects.toMatchObject({ reason: "http", status, code })
  })
  it("unwraps { data } and returns the skill pool", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          skills: [{ name: "brainstorming", description: "d", content_hash: "h1", scope: "official" }],
        },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const pool = await createHubClient().listSkillPool()
    expect(pool).toHaveLength(1)
    expect(pool[0]?.name).toBe("brainstorming")
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/hub/self/skills/pool")
  })

  it("requests the discoverable skill catalog separately from the installed pool", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          skills: [{
            name: "Skill Builder",
            description: "d",
            content_hash: "catalog:h1",
            scope: "official",
            installed: false,
            enabled: false,
          }],
          next_cursor: "CURSOR",
        },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const catalog = await createHubClient().listSkillCatalog({ scope: "official", query: "Builder" })

    expect(catalog.skills[0]?.installed).toBe(false)
    expect(catalog.next_cursor).toBe("CURSOR")
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/hub/self/skills/catalog?scope=official&query=Builder")
  })

  it("surfaces the hub error code on a 409 required-skill disable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: "hub.skill_required", message: "required" } }, 409),
      ),
    )
    const client = createHubClient()
    await expect(client.setSkillEnabled("brainstorming", false)).rejects.toMatchObject({
      code: "hub.skill_required",
      status: 409,
    } satisfies Partial<HubClientError>)
  })

  it("sends the skill source scope when toggling a same-name projection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)

    await createHubClient().setSkillEnabled("copy-editor", false, "personal")

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/hub/self/skills/copy-editor/disable?scope=personal")
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(new Headers(init.headers).get("idempotency-key")).toMatch(/^skill-toggle:/)
  })

  it("posts the zip as multipart with a JSON names field on confirm", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: { namespace: "team_1", results: [] } }))
    vi.stubGlobal("fetch", fetchMock)
    await createHubClient().confirmUpload(new Blob(["zip"]), ["a", "b"])
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe("POST")
    expect(new Headers(init.headers).get("idempotency-key")).toMatch(/^skill-upload:/)
    const form = init.body as FormData
    expect(form.get("names")).toBe('["a","b"]')
    expect(form.get("file")).toBeInstanceOf(Blob)
  })

  it("previews a GitHub repository through the optional BFF contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        repository: "https://github.com/acme/skill-repo",
        default_branch: "main",
        skill: { name: "skill-repo", description: "from BFF" },
      },
    }))
    vi.stubGlobal("fetch", fetchMock)

    const preview = await createHubClient().previewGithub?.("https://github.com/acme/skill-repo")

    expect(preview?.skill.name).toBe("skill-repo")
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe("/api/hub/self/skills/github/preview")
    expect(init).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } })
    expect(new Headers(init.headers).get("idempotency-key")).toBeNull()
    expect(JSON.parse(init.body as string)).toEqual({ repository: "https://github.com/acme/skill-repo" })
  })

  it("imports a GitHub repository through the optional BFF contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        repository: "https://github.com/acme/skill-repo",
        default_branch: "main",
        skill: { name: "skill-repo", description: "from BFF" },
      },
    }, 201))
    vi.stubGlobal("fetch", fetchMock)

    const result = await createHubClient().importGithub?.("https://github.com/acme/skill-repo")

    expect(result?.skill.name).toBe("skill-repo")
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe("/api/hub/self/skills/github/import")
    expect(init).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } })
    expect(new Headers(init.headers).get("idempotency-key")).toMatch(/^skill-github-import:/)
    expect(JSON.parse(init.body as string)).toEqual({ repository: "https://github.com/acme/skill-repo" })
  })

  it("canonicalizes GitHub imports before sending a stable replay key", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          repository: "https://github.com/acme/skill-repo",
          default_branch: "main",
          skill: { name: "skill-repo", description: "from BFF" },
        },
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          repository: "https://github.com/acme/skill-repo",
          default_branch: "main",
          skill: { name: "skill-repo", description: "from BFF" },
        },
      }, 201))
    vi.stubGlobal("fetch", fetchMock)

    const client = createHubClient()
    await client.importGithub?.("  acme/skill-repo.git  ")
    await client.importGithub?.("https://www.github.com/acme/skill-repo/")

    const first = fetchMock.mock.calls[0] as [string, RequestInit]
    const second = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(JSON.parse(first[1].body as string)).toEqual({ repository: "https://github.com/acme/skill-repo" })
    expect(JSON.parse(second[1].body as string)).toEqual({ repository: "https://github.com/acme/skill-repo" })
    expect((first[1].headers as Record<string, string>)["Idempotency-Key"])
      .toBe((second[1].headers as Record<string, string>)["Idempotency-Key"])
  })

  it("rejects a BFF result that is not a canonical GitHub repository", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        repository: "https://evil.example/acme/skill-repo",
        default_branch: "main",
        skill: { name: "skill-repo", description: "fixture" },
      },
    })))

    await expect(createHubClient().importGithub?.("acme/skill-repo")).rejects.toMatchObject({ reason: "parse" })
  })

  it("fails loud (parse) when the pool payload violates the schema", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: { skills: [{ name: "x" }] } })))
    await expect(createHubClient().listSkillPool()).rejects.toBeInstanceOf(HubClientError)
  })

  it("unwraps { servers } from the MCP server pool", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          servers: [
            {
              scope: "team_1",
              name: "my-tools",
              revision: 1,
              transport: "streamable_http",
              url: "https://own.example.com/mcp",
              allowed_tools: [],
              secret_ref: null,
              enabled: true,
            },
          ],
        },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const servers = await createHubClient().listMcpServers()
    expect(servers).toHaveLength(1)
    expect(servers[0]?.name).toBe("my-tools")
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/hub/self/mcp/servers")
  })

  it("posts the register body as JSON and returns the created server", async () => {
    const server = {
      scope: "team_1",
      name: "svc",
      revision: 1,
      transport: "http" as const,
      url: "https://svc.example.com/mcp",
      allowed_tools: ["search"],
      secret_ref: "handle:srt_00000000000000000000000000000001",
      enabled: true,
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { server } }, 201))
    vi.stubGlobal("fetch", fetchMock)
    const created = await createHubClient().registerMcpServer({
      name: "svc",
      transport: "http",
      url: "https://svc.example.com/mcp",
      allowed_tools: ["search"],
      secret_ref: "handle:srt_00000000000000000000000000000001",
    })
    expect(created.name).toBe("svc")
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe("/api/hub/self/mcp/servers")
    expect(init.method).toBe("POST")
    expect(new Headers(init.headers).get("idempotency-key")).toMatch(/^hub-mutation:/)
    expect(JSON.parse(init.body as string)).toMatchObject({
      name: "svc",
      transport: "http",
      secret_ref: "handle:srt_00000000000000000000000000000001",
    })
  })

  it("omits secret_ref from the register body when none is selected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          data: {
            server: {
              scope: "team_1",
              name: "svc",
              revision: 1,
              transport: "http",
              url: "https://svc.example.com/mcp",
              allowed_tools: [],
              secret_ref: null,
              enabled: true,
            },
          },
        },
        201,
      ),
    )
    vi.stubGlobal("fetch", fetchMock)
    await createHubClient().registerMcpServer({
      name: "svc",
      transport: "http",
      url: "https://svc.example.com/mcp",
      allowed_tools: [],
      secret_ref: null,
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(Object.keys(JSON.parse(init.body as string))).not.toContain("secret_ref")
  })

  it("posts a custom MCP connector without browser-supplied tenant identity", async () => {
    const server = {
      scope: "team_1",
      name: "custom-search",
      revision: 1,
      transport: "http" as const,
      url: "https://mcp.example.test/mcp",
      allowed_tools: [],
      secret_ref: null,
      enabled: true,
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { server } }, 201))
    vi.stubGlobal("fetch", fetchMock)

    await createHubClient().registerCustomMcp?.({
      name: "custom-search",
      transport: "http",
      endpoint_url: "https://mcp.example.test/mcp",
      icon_asset_id: "asset_icon_1",
      instructions: "Use for research",
      headers: [{ name: "Authorization", value: "Bearer TOKEN" }],
      enabled: true,
    })

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(path).toBe("/api/hub/self/connectors/mcp")
    expect(init).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } })
    expect(new Headers(init.headers).get("idempotency-key")).toMatch(/^hub-mutation:/)
    expect(body).toEqual({
      name: "custom-search",
      transport: "http",
      endpoint_url: "https://mcp.example.test/mcp",
      icon_asset_id: "asset_icon_1",
      instructions: "Use for research",
      headers: [{ name: "Authorization", value: "Bearer TOKEN" }],
      enabled: true,
    })
    expect(body).not.toHaveProperty("tenant_id")
  })

  it("posts a custom API with write-only secrets and no browser-supplied tenant identity", async () => {
    const customApi = {
      id: "custom_api_1",
      kind: "custom_api" as const,
      name: "CRM API",
      notes: "Use for customer lookup",
      icon_url: "/assets/crm.png",
      secret_entries: [{
        id: "secret_1",
        name: "CRM_TOKEN",
        created_at: "2026-08-29T12:00:00Z",
        updated_at: "2026-08-29T12:00:00Z",
        in_use_by: 0,
      }],
      enabled: true,
      revision: "rev_1",
      created_at: "2026-08-29T12:00:00Z",
      updated_at: "2026-08-29T12:00:00Z",
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: customApi }, 201))
    vi.stubGlobal("fetch", fetchMock)

    const created = await createHubClient().registerCustomApi?.({
      name: "CRM API",
      notes: "Use for customer lookup",
      icon_asset_id: "asset_crm",
      secrets: [{ name: "CRM_TOKEN", value: "WRITE_ONLY_TOKEN" }],
      enabled: true,
    })

    expect(created).toEqual(customApi)
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(path).toBe("/api/hub/self/connectors/custom-apis")
    expect(body).toEqual({
      name: "CRM API",
      notes: "Use for customer lookup",
      icon_asset_id: "asset_crm",
      secrets: [{ name: "CRM_TOKEN", value: "WRITE_ONLY_TOKEN" }],
      enabled: true,
    })
    expect(new Headers(init.headers).get("idempotency-key")).toMatch(/^hub-mutation:/)
    expect(body).not.toHaveProperty("tenant_id")
    expect(customApi.secret_entries[0]).not.toHaveProperty("value")
  })

  it("uploads a connector icon as multipart file and validates the asset response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { asset_id: "asset_icon_1", url: "/assets/connector/asset_icon_1.png" } }, 201),
    )
    vi.stubGlobal("fetch", fetchMock)
    const file = new File(["png"], "connector.png", { type: "image/png" })

    const uploaded = await createHubClient().uploadConnectorIcon?.(file)

    expect(uploaded).toEqual({ asset_id: "asset_icon_1", url: "/assets/connector/asset_icon_1.png" })
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe("/api/hub/self/connectors/assets")
    expect(init.method).toBe("POST")
    expect(new Headers(init.headers).get("idempotency-key")).toMatch(/^hub-mutation:/)
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get("file")).toBeInstanceOf(File)
    expect(((init.body as FormData).get("file") as File).name).toBe("connector.png")
  })

  it("surfaces the hub error code when the mutation gate is closed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: "capability_registration_disabled", message: "off" } }, 503),
      ),
    )
    await expect(
      createHubClient().registerMcpServer({
        name: "svc",
        transport: "http",
        url: "https://svc.example.com/mcp",
        allowed_tools: [],
        secret_ref: null,
      }),
    ).rejects.toMatchObject({ code: "capability_registration_disabled", status: 503 })
  })

  it("creates a secret and returns only the handle (value never echoed)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: { handle: "srt_00000000000000000000000000000001" } }, 201))
    vi.stubGlobal("fetch", fetchMock)
    const handle = await createHubClient().createMcpSecret("search-key", "super-secret")
    expect(handle).toBe("srt_00000000000000000000000000000001")
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe("/api/hub/self/mcp/secrets")
    expect(new Headers(init.headers).get("idempotency-key")).toMatch(/^hub-mutation:/)
    expect(JSON.parse(init.body as string)).toEqual({ name: "search-key", value: "super-secret" })
  })

  it("deletes an MCP server via DELETE without a body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { ok: true } }))
    vi.stubGlobal("fetch", fetchMock)
    await createHubClient().deleteMcpServer("my-tools")
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(path).toBe("/api/hub/self/mcp/servers/my-tools")
    expect(init.method).toBe("DELETE")
  })
})


describe("personal installation consumer", () => {
  const installation = { installation_id: "install-1", source_ref: "skill:mine-1", series_id: "series-1", revision: "18446744073709551615", installed: true, enabled: true, installed_at: "2026-09-30T10:00:00.000Z", updated_at: "2026-09-30T10:00:00.000Z" }
  it("preserves list envelope, false presence, exact cursor and current GET identity", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(publicResponse({ data: [installation], meta: { next_cursor: "opaque +/=" } })).mockResolvedValueOnce(publicResponse({ data: installation }))
    vi.stubGlobal("fetch", fetchMock)
    const client = createSkillInstallationClient()
    expect(await client.list({ installed: false, enabled: false, limit: 50, cursor: "opaque +/=" })).toEqual({ data: [installation], meta: { next_cursor: "opaque +/=" } })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("installed=false&enabled=false&limit=50&cursor=opaque+%2B%2F%3D")
    expect(await client.get("install-1")).toEqual(installation)
  })
  it("keeps caller mutation key and parses real receipt instead of void", async () => {
    const receipt = { installation, change: "installed", event_id: "event-1", replayed: true }
    const fetchMock = vi.fn().mockResolvedValue(publicResponse({ data: receipt }))
    vi.stubGlobal("fetch", fetchMock)
    expect(await createSkillInstallationClient().install("skill:mine-1", "frozen-key")).toEqual(receipt)
    expect(fetchMock).toHaveBeenCalledWith("/api/hub/self/skill-installations", expect.objectContaining({ method: "POST", headers: { "content-type": "application/json", "idempotency-key": "frozen-key" }, body: '{"source_ref":"skill:mine-1"}', redirect: "error" }))
  })
})

describe("personal installation strict boundaries", () => {
  const item = { installation_id: "i1", source_ref: "skill:s1", series_id: "s", revision: "1", installed: true, enabled: false, installed_at: "2026-09-30T10:00:00Z", updated_at: "2026-09-30T10:00:00Z" }
  it.each([
    { ...item, tenant: "secret" }, { ...item, revision: "18446744073709551616" }, { ...item, revision: 1 },
    { ...item, revision: "01" }, { ...item, revision: "invalid" }, { ...item, revision: "1.5" }, { ...item, revision: "1\n" }, { ...item, source_ref: "skill:skill:s1" }, { ...item, source_ref: "skill:s1\n" },
    { ...item, installation_id: "i1\n" }, { ...item, installed: false }, { ...item, removed_at: null },
    { ...item, installed: false, enabled: true, removed_at: "2026-09-30T11:00:00Z" },
    { ...item, removed_at: "2026-09-30T11:00:00Z" }, { ...item, installed_at: "2026-02-30T10:00:00Z" },
    { ...item, updated_at: "2026-09-29T10:00:00Z" }, { ...item, installed_at: "2026-09-30T10:00:00+00:00" },
  ])("rejects malformed/private installation %#", async (data) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(publicResponse({ data })))
    await expect(createSkillInstallationClient().get("i1")).rejects.toMatchObject({ reason: "parse" })
  })
  it.each([
    { data: [], meta: {} }, { data: [], meta: { next_cursor: null } }, { data: [], meta: { next_cursor: "" } },
    { data: [], meta: { next_cursor: "é".repeat(2049) } }, { data: [item, item] }, { data: { installations: [] } },
    { data: [], meta: { next_cursor: "next", has_more: true } },
  ])("rejects invalid page presence or duplicate IDs %#", async (data) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(publicResponse(data)))
    await expect(createSkillInstallationClient().list()).rejects.toMatchObject({ reason: "parse" })
  })
  it.each([
    { installation: item, change: "unchanged", event_id: "e", replayed: true },
    { installation: item, change: "installed", replayed: false },
    { installation: item, change: "unexpected", event_id: "e", replayed: false },
    { installation: item, change: "disabled", event_id: "e", replayed: false },
    { installation: { ...item, source_ref: "skill:other" }, change: "installed", event_id: "e", replayed: false },
  ])("rejects malformed or wrong-operation install ACK %#", async (data) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(publicResponse({ data })))
    await expect(createSkillInstallationClient().install("skill:s1", "key")).rejects.toMatchObject({ reason: "parse" })
  })
  it("sends false and empty DELETE correctly, preserves receipt and removed current read", async () => {
    const removed = { ...item, installed: false, removed_at: "2026-09-30T10:00:00Z" }
    const fetchMock = vi.fn().mockResolvedValueOnce(publicResponse({ data: { installation: item, change: "disabled", event_id: "e", replayed: false } }))
      .mockResolvedValueOnce(publicResponse({ data: { installation: removed, change: "removed", event_id: "e2", replayed: false } }))
      .mockResolvedValueOnce(publicResponse({ data: removed }))
    vi.stubGlobal("fetch", fetchMock)
    const client = createSkillInstallationClient()
    await client.setEnabled("i1", false, "disable-key")
    await client.remove("i1", "remove-key")
    expect(await client.get("i1")).toEqual(removed)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PUT", body: '{"enabled":false}' })
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "DELETE", headers: { "idempotency-key": "remove-key" } })
    expect(fetchMock.mock.calls[1]?.[1]).not.toHaveProperty("body")
  })
  it("uses only legal operation/status error codes and keeps safe correlation/retry fields", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(publicResponse({ error: { code: "skill_installation_not_found", message: "hidden", retryable: false } }, 404))
      .mockResolvedValueOnce(publicResponse({ error: { code: "skill_installation_dependency_timeout", message: "SENTINEL", retryable: true } }, 504))
    vi.stubGlobal("fetch", fetchMock)
    await expect(createSkillInstallationClient().list()).rejects.toMatchObject({ reason: "parse", status: 404 })
    await expect(createSkillInstallationClient().install("skill:s1", "key")).rejects.toMatchObject({ reason: "http", status: 504, code: "skill_installation_dependency_timeout", retryable: true, requestId: "request-1", message: "Installation request rejected" })
  })
  it("rejects invalid selectors before network and propagates cancellation", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_path: string, init: RequestInit) => {
      expect(init.signal).toBe(controller.signal)
      controller.abort()
      return publicResponse({ data: [] })
    })
    const controller = new AbortController()
    vi.stubGlobal("fetch", fetchMock)
    await expect(createSkillInstallationClient().list({ limit: 0 })).rejects.toThrow()
    await expect(createSkillInstallationClient().get("i1\n")).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
    await expect(createSkillInstallationClient().list({}, controller.signal)).rejects.toMatchObject({ reason: "aborted" })
  })
})
