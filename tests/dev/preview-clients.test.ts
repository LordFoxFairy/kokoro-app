import { describe, expect, it } from "vitest"

import {
  createPreviewBillingClient,
  createPreviewHubClient,
  createPreviewPricingClient,
  createPreviewTeamClient,
} from "@/dev/preview-clients"
import { HubClientError } from "@/hub/client"

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

  it("在 GitHub check/import 后把技能写回本地预览池", async () => {
    const client = createPreviewHubClient()

    const preview = await client.previewGithub?.("https://github.com/acme/github-skill")
    expect(preview?.skill.name).toBe("github-skill")

    await client.importGithub?.("https://github.com/acme/github-skill")

    expect((await client.listSkillPool()).some((skill) => skill.name === "github-skill")).toBe(true)
  })

  it("GitHub 导入只替换 personal 副本，不删除同名第三方技能", async () => {
    const client = createPreviewHubClient()

    await client.importGithub?.("acme/copy-editor")

    const sameName = (await client.listSkillPool()).filter((skill) => skill.name === "copy-editor")
    expect(sameName).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "copy-editor", scope: "third_party" }),
      expect.objectContaining({ name: "copy-editor", scope: "personal" }),
    ]))
    expect(sameName).toHaveLength(2)
  })

  it("GitHub preview uses the same canonical boundary as the HTTP client", async () => {
    const client = createPreviewHubClient()
    const result = await client.previewGithub?.("  https://www.github.com/acme/canonical-skill.git/  ")

    expect(result?.repository).toBe("https://github.com/acme/canonical-skill")
    await expect(client.previewGithub?.("https://example.com/acme/not-github")).rejects.toMatchObject({
      reason: "parse",
      code: "github.invalid_repository",
    } satisfies Partial<HubClientError>)
  })

  it("does not write a GitHub import after the preview signal is aborted", async () => {
    const client = createPreviewHubClient()
    const controller = new AbortController()
    controller.abort()

    await expect(client.importGithub?.("acme/aborted", controller.signal)).rejects.toMatchObject({ reason: "aborted" })
    expect((await client.listSkillPool()).some((skill) => skill.name === "aborted")).toBe(false)
  })

  it("replaying the same GitHub repository remains one personal skill", async () => {
    const client = createPreviewHubClient()
    await client.importGithub?.("acme/replayed-skill")
    await client.importGithub?.("https://www.github.com/acme/replayed-skill.git")

    const matches = (await client.listSkillPool()).filter((skill) => skill.name === "replayed-skill" && skill.scope === "personal")
    expect(matches).toHaveLength(1)
    expect(matches[0]?.content_hash).toBe("preview:github:https%3A%2F%2Fgithub.com%2Facme%2Freplayed-skill")
  })

  it("同名技能停用只作用于指定 scope", async () => {
    const client = createPreviewHubClient()
    await client.importGithub?.("acme/copy-editor")
    await client.setSkillEnabled("copy-editor", false, "personal")

    const sameName = (await client.listSkillPool()).filter((skill) => skill.name === "copy-editor")
    expect(sameName).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "copy-editor", scope: "third_party", enabled: true }),
      expect.objectContaining({ name: "copy-editor", scope: "personal", enabled: false }),
    ]))
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
    const team = await createPreviewTeamClient().listMyTeams()
    expect(billing.balance_micros).toBe("10000000")
    expect(pricing.plans).toHaveLength(2)
    expect(team[0]?.team.id).toBe("team_preview")
  })
})
