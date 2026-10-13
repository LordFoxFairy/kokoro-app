// Local-only clients for the explicit preview transport. They keep the settings surface fully usable
// without pretending that a backend request succeeded; real routes continue
// to use the HTTP clients from page-clients.ts.

import type { BillingClient } from "@/billing/client"
import type { PlanCatalog, PricingClient } from "@/billing/pricing"
import type { BillingLedger } from "@/contract/http"
import type { HubClient } from "@/hub/client"
import type { McpConnector, McpConnectorProvider } from "@/hub/mcp-connector.schema"
import type {
  McpRegisterInput,
  CustomApiView,
  McpSecret,
  McpServerView,
  SkillCard,
  SkillCatalog,
  SkillCatalogCard,
  SkillQuota,
  SkillRevision,
} from "@/hub/schemas"
import type { TeamClient, TeamMember, TeamRole } from "@/team/client"

const previewUpdatedAt = Date.UTC(2026, 7, 28)
const previewSkills: SkillCard[] = [
  { name: "YouTube 影片研究", description: "利用第一手 YouTube 影片证据强化深度研究、行业分析、竞争情报与报告写作。", content_hash: "preview:youtube-research", scope: "official", installation_id: "preview-installation-youtube-research", source_ref: "skill:preview-youtube-research", enabled: false, categories: ["content"], updated_at: previewUpdatedAt },
  { name: "财务分析", description: "使用结构化财务数据研究公司财务、市场价格、申报文件、财报与宏观经济指标。", content_hash: "preview:finance", scope: "official", installation_id: "preview-installation-finance", source_ref: "skill:preview-finance", enabled: false, categories: ["data", "business"], updated_at: previewUpdatedAt },
  { name: "AI 影片生成器", description: "专业 AI 影片制作工作流程，适用于制作影片、短片、广告与任何生成式影片内容。", content_hash: "preview:video", scope: "official", installation_id: "preview-installation-video", source_ref: "skill:preview-video", enabled: false, categories: ["media"], updated_at: previewUpdatedAt },
  { name: "Typst PDF 制作工具", description: "使用 Typst 生成专业、高品质的 PDF 文件，适用于报告、论文与精确排版文档。", content_hash: "preview:typst", scope: "official", installation_id: "preview-installation-typst", source_ref: "skill:preview-typst", enabled: true, categories: ["content"], updated_at: previewUpdatedAt },
  { name: "游戏开发", description: "使用阶段式生产流程端到端构建可游玩的浏览器游戏，并完成架构、资产与视觉验证。", content_hash: "preview:games", scope: "official", installation_id: "preview-installation-games", source_ref: "skill:preview-games", enabled: true, categories: ["coding", "media"], updated_at: previewUpdatedAt },
  { name: "Excel 生成器", description: "制作专业的 Excel 电子表格，兼顾结构化数据、美感、清晰呈现与数据分析。", content_hash: "preview:excel", scope: "official", installation_id: "preview-installation-excel", source_ref: "skill:preview-excel", enabled: false, categories: ["data"], updated_at: previewUpdatedAt },
  { name: "research-brief", description: "整理资料并输出结构化研究简报。", content_hash: "preview:research-brief", scope: "personal", installation_id: "preview-installation-research-brief", source_ref: "skill:preview-research-brief", enabled: true, categories: ["content"], updated_at: previewUpdatedAt },
  { name: "copy-editor", description: "润色、改写并统一文章语气。", content_hash: "preview:copy-editor", scope: "third_party", installation_id: "preview-installation-copy-editor", source_ref: "skill:preview-copy-editor", enabled: true, categories: ["content"], updated_at: previewUpdatedAt },
]

const previewCatalogAdditions: SkillCatalogCard[] = [
  { name: "Skill Builder", description: "创建、整理并迭代可复用的工作技能。", content_hash: "catalog:skill-builder", scope: "official", installed: false, enabled: false, categories: ["coding", "automation"], updated_at: previewUpdatedAt },
  { name: "GitHub Searcher", description: "搜索 GitHub 上的公开资料并整理成可引用的结果。", content_hash: "catalog:github-searcher", scope: "official", installed: false, enabled: false, categories: ["coding", "content"], updated_at: previewUpdatedAt },
  { name: "Web Skill Searcher", description: "发现适合当前任务的公开技能与工作流程。", content_hash: "catalog:web-skill-searcher", scope: "official", installed: false, enabled: false, categories: ["automation", "content"], updated_at: previewUpdatedAt },
  { name: "Stock Analysis", description: "使用公开财务资料完成结构化股票与公司研究。", content_hash: "catalog:stock-analysis", scope: "official", installed: false, enabled: false, categories: ["data", "business"], updated_at: previewUpdatedAt },
  { name: "Notion Workspace", description: "在 Notion 工作区中整理页面、数据库和研究资料。", content_hash: "catalog:notion-workspace", scope: "third_party", installed: false, enabled: false, categories: ["automation", "content"], updated_at: previewUpdatedAt },
]

const previewQuota: SkillQuota = {
  namespace: "preview-workspace",
  package_count: 2,
  package_bytes: 245760,
  max_packages: 20,
  max_bytes: 52428800,
}

// A skill's display name is not its identity: official, third-party and
// personal projections may legitimately use the same name. Keep this key
// local to the fixture store so a GitHub import can replace only the user's
// personal copy instead of silently removing an official card.
function skillKey(skill: Pick<SkillCard, "scope" | "name">): string {
  return `${skill.scope}/${skill.name}`
}

export function createPreviewHubClient(): HubClient {
  let skills = [...previewSkills]
  // A fresh User Web starts with no user-managed connectors, matching the
  // product empty state. Registration remains available for interaction QA.
  let servers: McpServerView[] = []
  let secrets: McpSecret[] = []
  let personalConnectors: McpConnector[] = []
  const personalProviders: McpConnectorProvider[] = [
    {
      provider_key: "preview-notes",
      display_name: "Preview Notes",
      description: "Preview-only personal connector provider.",
      directory_type: "app",
      category_keys: ["efficiency"],
      example_prompts: ["Save this note to my workspace."],
      enabled: true,
      state_version: "1",
    },
  ]
  let customApiCount = 0
  const quota = { ...previewQuota }
  return {
    listPersonalSkills: () => Promise.resolve({ skills: skills.filter((skill) => skill.scope === "personal").map((skill, index) => ({
      skill_id: `preview-${index + 1}`, source_ref: `skill:preview-${index + 1}`, series_id: `preview-series-${index + 1}`, name: skill.name, summary: skill.description, revision: "1", status: "active" as const, tags: [], example_prompts: [], category_keys: [], skill_updated_at: "2026-10-10T00:00:00Z", product: { state_version: "1", publication_audience: "owner" as const },
    })), next_cursor: null }),
    getPublishedPersonalSkill: (id) => {
      const skill = skills.filter((item) => item.scope === "personal")[Number(id.replace(/^preview-/u, "")) - 1]
      return skill ? Promise.resolve({ skill_id: id, source_ref: `skill:${id}`, revision: "1", status: "active" as const, name: skill.name, summary: skill.description, tags: [], series_id: `preview-series-${id}`, example_prompts: [], category_keys: [], skill_updated_at: "2026-10-10T00:00:00Z", product: { state_version: "1", publication_audience: "owner" as const } }) : Promise.reject(new Error("preview Skill not found"))
    },
    listMcpConnections: () => Promise.resolve({ connections: servers.filter((server) => server.enabled).map((server, index) => ({
      connection_id: `preview-connection-${index + 1}`, connector_id: `preview-connector-${index + 1}`,
      server_id: `preview-server-${index + 1}`, provider_key: server.name,
      transport: "streamable_http" as const, status: "active" as const,
    })) }),
    listMcpConnectors: () => Promise.resolve({ items: personalConnectors, next_cursor: null }),
    listMcpConnectorProviders: () => Promise.resolve({ items: personalProviders, next_cursor: null }),
    createMcpConnector: (input) => {
      const connector: McpConnector = {
        connector_id: `preview-connector-${personalConnectors.length + 1}`,
        connector_type: input.connector_type,
        provider_key: input.provider_key,
        status: "pending",
        approved_scopes: [],
        enabled: false,
        state_version: "1",
        display_name: input.display_name,
        description: input.description,
      }
      personalConnectors = [...personalConnectors, connector]
      return Promise.resolve(connector)
    },
    updateMcpConnector: (connectorId, input) => {
      const existing = personalConnectors.find((connector) => connector.connector_id === connectorId)
      if (existing === undefined) return Promise.reject(new Error("preview connector not found"))
      const updated = { ...existing, display_name: input.display_name, description: input.description, state_version: String(Number(existing.state_version) + 1) }
      personalConnectors = personalConnectors.map((connector) => connector.connector_id === connectorId ? updated : connector)
      return Promise.resolve(updated)
    },
    setMcpConnectorEnabled: (connectorId, input) => {
      const existing = personalConnectors.find((connector) => connector.connector_id === connectorId)
      if (existing === undefined) return Promise.reject(new Error("preview connector not found"))
      const updated = { ...existing, enabled: input.enabled, state_version: String(Number(existing.state_version) + 1) }
      personalConnectors = personalConnectors.map((connector) => connector.connector_id === connectorId ? updated : connector)
      return Promise.resolve(updated)
    },
    removeMcpConnector: (connectorId) => {
      const existing = personalConnectors.find((connector) => connector.connector_id === connectorId)
      if (existing === undefined) return Promise.reject(new Error("preview connector not found"))
      const updated = { ...existing, enabled: false, status: "revoked" as const, state_version: String(Number(existing.state_version) + 1) }
      personalConnectors = personalConnectors.map((connector) => connector.connector_id === connectorId ? updated : connector)
      return Promise.resolve(updated)
    },
    // Preview intentionally cannot fabricate an OAuth callback or Connection receipt.
    beginMcpConnectorAuthorization: () => Promise.reject(new Error("OAuth lifecycle is unavailable in preview")),
    reconnectMcpConnectorAuthorization: () => Promise.reject(new Error("OAuth lifecycle is unavailable in preview")),
    completeMcpConnectorAuthorization: () => Promise.reject(new Error("OAuth lifecycle is unavailable in preview")),
    createMcpConnectorConnection: () => Promise.reject(new Error("OAuth lifecycle is unavailable in preview")),
    listSkillPool: () => Promise.resolve(skills),
    listSkillCatalog: ({ scope, query } = {}): Promise<SkillCatalog> => {
      const installedByKey = new Map(skills.map((skill) => [skillKey(skill), skill]))
      const catalogByKey = new Map<string, SkillCatalogCard>()
      for (const skill of skills) {
        if (skill.scope !== "official" && skill.scope !== "third_party") continue
        catalogByKey.set(skillKey(skill), {
          ...skill,
          // The pool projection only contains enabled items. A disabled
          // official/third-party skill remains discoverable, but its catalog
          // action must be Add again rather than a permanently disabled
          // Added button.
          installed: skill.enabled !== false,
          enabled: skill.enabled !== false,
        })
      }
      for (const skill of previewCatalogAdditions) {
        const installed = installedByKey.get(skillKey(skill))
        // A newly added catalog item is already present in `skills`; merge it
        // into one card instead of showing the same skill twice after the
        // catalog revalidation.
        catalogByKey.set(skillKey(skill), installed
          ? { ...skill, installed: installed.enabled !== false, enabled: installed.enabled !== false }
          : skill)
      }
      const catalogSkills = [...catalogByKey.values()]
      const normalized = query?.trim().toLocaleLowerCase() ?? ""
      const filtered = catalogSkills.filter((skill) =>
        (!scope || skill.scope === scope)
        && (normalized === "" || skill.name.toLocaleLowerCase().includes(normalized) || skill.description.toLocaleLowerCase().includes(normalized)),
      )
      return Promise.resolve({
        skills: filtered.map((skill) => ({
          ...skill,
          skill_id: skill.skill_id ?? `preview-catalog:${skill.scope}:${skill.name}`,
          revision_skill_id: skill.revision_skill_id ?? `preview-revision:${skill.scope}:${skill.content_hash}`,
        })),
        next_cursor: null,
      })
    },
    skillQuota: () => Promise.resolve(quota),
    skillRevisions: (name: string, scope?: string): Promise<SkillRevision[]> => Promise.resolve([
      { scope: scope ?? "preview", name, revision: 1, content_hash: `preview:${name}`, package_size: 122880, source: "local preview", created_at: Date.now() },
    ]),
    setSkillEnabled: (installationId, enabled) => {
      skills = skills.map((skill) => skill.installation_id === installationId ? { ...skill, enabled } : skill)
      return Promise.resolve()
    },
    installSkill: (sourceRef) => {
      const catalogSkill = previewCatalogAdditions.find((skill) => `skill:preview-catalog:${skill.scope}:${skill.name}` === sourceRef)
      if (catalogSkill) {
        skills = [...skills, {
          name: catalogSkill.name,
          description: catalogSkill.description,
          content_hash: catalogSkill.content_hash,
          scope: catalogSkill.scope,
          installation_id: `preview-installation-${catalogSkill.scope}-${catalogSkill.name}`,
          source_ref: sourceRef,
          enabled: true,
          updated_at: catalogSkill.updated_at,
        }]
      }
      return Promise.resolve()
    },
    listMcpServers: () => Promise.resolve(servers),
    registerMcpServer: (input: McpRegisterInput) => {
      const server: McpServerView = { scope: "namespace", name: input.name, revision: 1, transport: input.transport, url: input.url, allowed_tools: input.allowed_tools, secret_ref: input.secret_ref, enabled: true }
      servers = [...servers, server]
      return Promise.resolve(server)
    },
    registerCustomMcp: (input) => {
      const server: McpServerView = {
        scope: "namespace",
        name: input.name,
        revision: 1,
        transport: input.transport,
        url: input.endpoint_url,
        allowed_tools: [],
        secret_ref: input.headers.length > 0 ? "handle:preview-write-only" : null,
        enabled: input.enabled,
      }
      servers = [...servers, server]
      return Promise.resolve(server)
    },
    registerCustomApi: (input) => {
      customApiCount += 1
      const timestamp = new Date(previewUpdatedAt + customApiCount).toISOString()
      const customApi: CustomApiView = {
        id: `custom_api_preview_${customApiCount}`,
        kind: "custom_api",
        name: input.name,
        notes: input.notes,
        icon_url: input.icon_asset_id ? `/api/dev/preview-files/${input.icon_asset_id}` : null,
        secret_entries: input.secrets.map((secret, index) => ({
          id: `secret_preview_${customApiCount}_${index + 1}`,
          name: secret.name,
          created_at: timestamp,
          updated_at: timestamp,
          in_use_by: 0,
        })),
        enabled: input.enabled,
        revision: `preview:${customApiCount}`,
        created_at: timestamp,
        updated_at: timestamp,
      }
      return Promise.resolve(customApi)
    },
    uploadConnectorIcon: (file) => Promise.resolve({
      asset_id: `preview-connector-${encodeURIComponent(file.name)}`,
      url: `/api/dev/preview-files/preview-connector-${encodeURIComponent(file.name)}`,
    }),
    setMcpEnabled: (name, enabled) => {
      servers = servers.map((server) => server.name === name ? { ...server, enabled } : server)
      return Promise.resolve()
    },
    deleteMcpServer: (name) => {
      servers = servers.filter((server) => server.name !== name)
      return Promise.resolve()
    },
    listMcpSecrets: () => Promise.resolve(secrets),
    createMcpSecret: (name) => {
      const handle = `srt_preview_${secrets.length + 1}`
      secrets = [...secrets, { handle, name, createdAt: Date.now() }]
      return Promise.resolve(handle)
    },
    deleteMcpSecret: (handle) => {
      secrets = secrets.filter((secret) => secret.handle !== handle)
      return Promise.resolve()
    },
  }
}

export function createPreviewBillingClient(): BillingClient {
  const ledger: BillingLedger = {
    items: [{ journal_id: "b8281e18-6afd-4c08-a772-8b55e2d7cbdd", sequence: "1", delta_micros: "-125000", source_kind: "preview.run", source_ref: "preview-run-1", created_at: new Date().toISOString(), balance_after_micros: "9875000" }],
    page: { next_cursor: null },
  }
  return {
    summary: () => Promise.resolve({ credit_account_id: "74ea5371-b5cf-4df7-b49a-582e45d959ce", status: "active", available_micros: "10000000", held_micros: "0" }),
    ledger: () => Promise.resolve(ledger),
  }
}

export function createPreviewPricingClient(): PricingClient {
  const plans: PlanCatalog = {
    plans: [
      { id: "preview-starter", key: "starter", name: "Starter", currency: "USD", amount_minor: "900", credit_micros: "10000000", billing_interval: "month" },
      { id: "preview-pro", key: "pro", name: "Pro", currency: "USD", amount_minor: "2900", credit_micros: "40000000", billing_interval: "month" },
    ],
  }
  return { plans: () => Promise.resolve(plans), checkout: () => Promise.resolve({ status: "unavailable" as const }) }
}

const previewMember: TeamMember = {
  member_id: "preview-member", user_id: "preview-user", display_name: "Preview User",
  image_url: null, roles: ["owner"], joined_at: new Date(previewUpdatedAt).toISOString(),
}
const previewRoles: TeamRole[] = [
  { role_id: null, name: "owner", kind: "builtin", permissions: { member: ["create", "read", "update", "delete"], invitation: ["create", "read", "cancel"] } },
  { role_id: null, name: "member", kind: "builtin", permissions: { member: ["read"] } },
]

export function createPreviewTeamClient(): TeamClient {
  return {
    currentUserId: () => Promise.resolve("preview-user"),
    listMembers: () => Promise.resolve({ items: [previewMember], nextCursor: null, requestId: "preview-members" }),
    listInvitations: () => Promise.resolve({ items: [], nextCursor: null, requestId: "preview-invitations" }),
    listRoles: () => Promise.resolve({ items: previewRoles, nextCursor: null, requestId: "preview-roles" }),
    createInvitation: () => Promise.resolve(),
    resendInvitation: () => Promise.resolve(),
    cancelInvitation: () => Promise.resolve(),
    replaceMemberRoles: () => Promise.resolve(),
    removeMember: () => Promise.resolve(),
    leave: () => Promise.resolve(),
  }
}
