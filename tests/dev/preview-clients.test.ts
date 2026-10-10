import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createPreviewBillingClient,
  createPreviewHubClient,
  createPreviewPricingClient,
  createPreviewTeamClient,
} from "@/dev/preview-clients"

describe("preview settings clients", () => {
  it("提供本地技能与空连接器池，并支持注册后的本地变更", async () => {
    const client = createPreviewHubClient()
    expect((await client.listSkillPool()).length).toBeGreaterThan(0)
    expect(await client.listMcpServers()).toEqual([])
    await client.registerMcpServer({
      name: "docs-search",
      transport: "streamable_http",
      url: "https://preview.invalid/mcp",
      allowed_tools: ["search", "open"],
      secret_ref: null,
    })
    await client.setMcpEnabled("docs-search", false)
    expect((await client.listMcpServers())[0]?.enabled).toBe(false)
    const handle = await client.createMcpSecret("demo", "not-returned")
    expect((await client.listMcpSecrets())[0]?.handle).toBe(handle)
  })

  it("将官方目录与已新增池分开，并支持从目录添加技能", async () => {
    const client = createPreviewHubClient()

    const before = await client.listSkillCatalog?.({ scope: "official" })
    expect(before?.skills.some((skill) => skill.name === "Skill Builder" && !skill.installed)).toBe(true)

    await client.setSkillEnabled("Skill Builder", true)

    const after = await client.listSkillCatalog?.({ scope: "official", query: "Skill Builder" })
    expect(after?.skills[0]).toMatchObject({ name: "Skill Builder", installed: true, enabled: true })
    expect((await client.listSkillPool()).some((skill) => skill.name === "Skill Builder")).toBe(true)
  })

  it("第三方目录使用独立范围，并在添加后只保留一张卡片", async () => {
    const client = createPreviewHubClient()

    const before = await client.listSkillCatalog?.({ scope: "third_party" })
    expect(before?.skills.map((skill) => skill.name)).toEqual(["copy-editor", "Notion Workspace"])
    expect(before?.skills.every((skill) => skill.scope === "third_party")).toBe(true)

    await client.setSkillEnabled("Notion Workspace", true)

    const after = await client.listSkillCatalog?.({ scope: "third_party", query: "Notion" })
    expect(after?.skills).toHaveLength(1)
    expect(after?.skills[0]).toMatchObject({ name: "Notion Workspace", scope: "third_party", installed: true, enabled: true })
  })

  it("提供账单、套餐和团队的稳定预览数据", async () => {
    const billing = await createPreviewBillingClient().summary()
    const pricing = await createPreviewPricingClient().plans()
    const team = await createPreviewTeamClient().listMembers()
    expect(billing.available_micros).toBe("10000000")
    expect(pricing.plans).toHaveLength(2)
    expect(team.items[0]?.member_id).toBe("preview-member")
  })
})


describe("R255 explicit Credit preview boundary", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("uses local preview only explicitly and keeps the published account and ledger shape", async () => {
    const fetcher = vi.fn()
    vi.stubGlobal("fetch", fetcher)
    const preview = createPreviewBillingClient()
    const summary = await preview.summary()
    const ledger = await preview.ledger()
    expect(Object.keys(summary).sort()).toEqual(["available_micros", "credit_account_id", "held_micros", "status"])
    expect(Object.keys(ledger).sort()).toEqual(["items", "page"])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("never substitutes preview credits when a live owner read fails", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: { code: "billing_unavailable", message: "Billing unavailable" } }, { status: 503 }))
    vi.stubGlobal("fetch", fetcher)
    const { createBillingClient } = await import("@/billing/client")
    await expect(createBillingClient().summary()).rejects.toMatchObject({ status: 503 })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/session/billing/summary")
  })
})

it("does not simulate a GitHub write in the preview factory", () => { expect(createPreviewHubClient()).not.toHaveProperty("importGithub"); expect(createPreviewHubClient()).not.toHaveProperty("previewGithub") })
