import { afterEach, describe, expect, it, vi } from "vitest"

import { createHubClient, HubClientError } from "@/hub/client"

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("hub client", () => {
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
