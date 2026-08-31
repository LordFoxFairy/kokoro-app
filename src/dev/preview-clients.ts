// Local-only clients for the explicit preview transport. They keep the settings surface fully usable
// without pretending that a backend request succeeded; real routes continue
// to use the HTTP clients from page-clients.ts.

import type { BillingClient } from "@/billing/client"
import type { PlanCatalog, PricingClient } from "@/billing/pricing"
import type { BillingByModel, BillingLedger } from "@/contract/http"
import { HubClientError, parseGithubRepository, type HubClient } from "@/hub/client"
import type {
  McpRegisterInput,
  CustomApiView,
  GithubImportResult,
  McpSecret,
  McpServerView,
  SkillCard,
  SkillCatalog,
  SkillCatalogCard,
  SkillQuota,
  SkillRevision,
  UploadConfirm,
  UploadPreview,
} from "@/hub/schemas"
import type { TeamClient, TeamDetail, TeamSummary } from "@/team/client"
import type { DataManagementClient } from "@/data-management/client"

const previewUpdatedAt = Date.UTC(2026, 7, 28)
const previewSkills: SkillCard[] = [
  { name: "YouTube 影片研究", description: "利用第一手 YouTube 影片证据强化深度研究、行业分析、竞争情报与报告写作。", content_hash: "preview:youtube-research", scope: "official", enabled: false, categories: ["content"], updated_at: previewUpdatedAt },
  { name: "财务分析", description: "使用结构化财务数据研究公司财务、市场价格、申报文件、财报与宏观经济指标。", content_hash: "preview:finance", scope: "official", enabled: false, categories: ["data", "business"], updated_at: previewUpdatedAt },
  { name: "AI 影片生成器", description: "专业 AI 影片制作工作流程，适用于制作影片、短片、广告与任何生成式影片内容。", content_hash: "preview:video", scope: "official", enabled: false, categories: ["media"], updated_at: previewUpdatedAt },
  { name: "Typst PDF 制作工具", description: "使用 Typst 生成专业、高品质的 PDF 文件，适用于报告、论文与精确排版文档。", content_hash: "preview:typst", scope: "official", enabled: true, categories: ["content"], updated_at: previewUpdatedAt },
  { name: "游戏开发", description: "使用阶段式生产流程端到端构建可游玩的浏览器游戏，并完成架构、资产与视觉验证。", content_hash: "preview:games", scope: "official", enabled: true, categories: ["coding", "media"], updated_at: previewUpdatedAt },
  { name: "Excel 生成器", description: "制作专业的 Excel 电子表格，兼顾结构化数据、美感、清晰呈现与数据分析。", content_hash: "preview:excel", scope: "official", enabled: false, categories: ["data"], updated_at: previewUpdatedAt },
  { name: "research-brief", description: "整理资料并输出结构化研究简报。", content_hash: "preview:research-brief", scope: "personal", enabled: true, categories: ["content"], updated_at: previewUpdatedAt },
  { name: "copy-editor", description: "润色、改写并统一文章语气。", content_hash: "preview:copy-editor", scope: "third_party", enabled: true, categories: ["content"], updated_at: previewUpdatedAt },
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

function githubPreviewFor(repository: string): GithubImportResult {
  const parsed = parseGithubRepository(repository)
  if (parsed === null) {
    throw new HubClientError("parse", "invalid GitHub repository", "github.invalid_repository", 400)
  }
  const canonical = parsed.canonical
  const name = parsed.name
  const repositoryName = canonical.replace(/^https:\/\/github\.com\//i, "")
  const isChinese = typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("zh")
  return {
    repository: canonical,
    default_branch: "main",
    skill: {
      name,
      description: isChinese
        ? `来自 ${repositoryName} 的技能预览。`
        : `Preview of the skill from ${repositoryName}.`,
    },
  }
}

function abortError(): HubClientError {
  return new HubClientError("aborted", "preview request aborted", null, null)
}

function abortable<T>(signal: AbortSignal | undefined, work: () => T | Promise<T>): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError())
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const onAbort = () => {
      if (settled) return
      settled = true
      signal?.removeEventListener("abort", onAbort)
      reject(abortError())
    }
    signal?.addEventListener("abort", onAbort, { once: true })
    Promise.resolve()
      .then(work)
      .then((value) => {
        if (settled) return
        settled = true
        signal?.removeEventListener("abort", onAbort)
        resolve(value)
      })
      .catch((error: unknown) => {
        if (settled) return
        settled = true
        signal?.removeEventListener("abort", onAbort)
        reject(error)
      })
  })
}

export function createPreviewHubClient(): HubClient {
  let skills = [...previewSkills]
  // A fresh User Web starts with no user-managed connectors, matching the
  // product empty state. Registration remains available for interaction QA.
  let servers: McpServerView[] = []
  let secrets: McpSecret[] = []
  let customApiCount = 0
  let quota = { ...previewQuota }
  const previewGithub = (repository: string, signal?: AbortSignal): Promise<GithubImportResult> =>
    abortable(signal, () => githubPreviewFor(repository))
  return {
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
      return Promise.resolve({ skills: filtered, next_cursor: null })
    },
    skillQuota: () => Promise.resolve(quota),
    skillRevisions: (name: string, scope?: string): Promise<SkillRevision[]> => Promise.resolve([
      { scope: scope ?? "preview", name, revision: 1, content_hash: `preview:${name}`, package_size: 122880, source: "local preview", created_at: Date.now() },
    ]),
    setSkillEnabled: (name, enabled, scope) => {
      const existing = skills.find((skill) => skill.name === name && (scope === undefined || skill.scope === scope))
      if (existing) {
        skills = skills.map((skill) => skill.name === name && (scope === undefined || skill.scope === scope) ? { ...skill, enabled } : skill)
      } else if (enabled) {
        const catalogSkill = previewCatalogAdditions.find((skill) => skill.name === name)
        if (catalogSkill) {
          skills = [...skills, {
            name: catalogSkill.name,
            description: catalogSkill.description,
            content_hash: catalogSkill.content_hash,
            scope: catalogSkill.scope,
            enabled: true,
            updated_at: catalogSkill.updated_at,
          }]
        }
      }
      return Promise.resolve()
    },
    previewUpload: (): Promise<UploadPreview> => Promise.resolve({
      namespace: previewQuota.namespace,
      candidates: [{
        name: "new-skill",
        valid: true,
        errors: [],
        description: "预览上传的技能包",
        content_hash: "preview:new-skill",
        package_size: 4096,
        file_count: 1,
        files: [{ path: "SKILL.md", size: 4096 }],
        conflicts: { official: false, namespace: false },
      }],
    }),
    confirmUpload: async (_zip, names): Promise<UploadConfirm> => {
      const selected = names ?? ["new-skill"]
      const results = selected.map((name) => {
        const contentHash = `preview:${name}`
        const existing = skills.find((skill) => skill.name === name && skill.scope === "personal")
        if (existing?.content_hash === contentHash) {
          return { name, status: "unchanged" as const, revision: 1, content_hash: contentHash, error: null }
        }
        const imported: SkillCard = {
          name,
          description: "预览上传的技能包",
          content_hash: contentHash,
          scope: "personal",
          enabled: true,
          updated_at: previewUpdatedAt,
        }
        skills = [...skills.filter((skill) => !(skill.name === name && skill.scope === "personal")), imported]
        return { name, status: "published" as const, revision: 1, content_hash: contentHash, error: null }
      })
      const personalCount = new Set(skills.filter((skill) => skill.scope === "personal").map((skill) => skill.content_hash)).size
      quota = { ...quota, package_count: Math.max(previewQuota.package_count, personalCount) }
      return { namespace: quota.namespace, results }
    },
    previewGithub,
    importGithub: async (repository, signal) => {
      const preview = await previewGithub(repository, signal)
      if (signal?.aborted) throw abortError()
      const imported: SkillCard = {
        name: preview.skill.name,
        description: preview.skill.description ?? "",
        content_hash: `preview:github:${encodeURIComponent(preview.repository)}`,
        scope: "personal",
        enabled: true,
        updated_at: previewUpdatedAt,
      }
      skills = [...skills.filter((skill) => !(skill.scope === "personal" && skill.name === imported.name)), imported]
      return preview
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
    entries: [
      { entry_id: "preview-entry-1", delta_micros: "-125000", reason: "preview.run", title: "Preview task", conversation_id: "preview-conversation", created_at: Date.now(), balance_after_micros: "9875000", run_id: "run_preview_1" },
    ],
  }
  return {
    summary: () => Promise.resolve({ balance_micros: "10000000", held_micros: "0", quota_micros: null, quota_period: null, plan_label: "Free", free_credit_micros: "10000000", daily_refresh_micros: "3000000", daily_refresh_time: "00:00" }),
    ledger: () => Promise.resolve(ledger),
    byModel: (): Promise<BillingByModel> => Promise.resolve({ period_start: new Date().toISOString(), items: [{ model_binding_id: null, model_name: "Preview model", spent_micros: "125000", run_count: 1 }] }),
    usage: () => Promise.resolve({
      auto_top_up_enabled: false,
      reset_at: "2026-09-01T00:00:00.000Z",
      period_start: "2026-08-01T00:00:00.000Z",
      period_end: "2026-08-29T23:59:59.000Z",
      total_cost_minor: "0",
      categories: [
        { key: "cloud", label: "Cloud services", free_used_minor: "0", free_limit_minor: "1000", paid_minor: "0" },
        { key: "ai", label: "Artificial intelligence", free_used_minor: "0", free_limit_minor: "100", paid_minor: "0" },
        { key: "integration", label: "Integrations", free_used_minor: "0", free_limit_minor: "100", paid_minor: "0" },
      ],
      websites: [],
      computers: [],
    }),
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

const previewTeam: TeamSummary = { team: { id: "team_preview", name: "Preview Workspace", type: "team" }, membership: { role: "owner" } }
const previewDetail: TeamDetail = {
  team: previewTeam.team,
  viewerRole: "owner",
  members: [{ userId: "preview-user", email: "preview@example.test", displayName: "Preview User", role: "owner", status: "active", joinedAt: new Date().toISOString() }],
  invites: [],
}

export function createPreviewTeamClient(): TeamClient {
  return {
    currentNamespace: () => Promise.resolve("team_preview"),
    listMyTeams: () => Promise.resolve([previewTeam]),
    listInvites: () => Promise.resolve([]),
    teamDetail: () => Promise.resolve(previewDetail),
    createInvite: () => Promise.resolve(),
    acceptInvite: () => Promise.resolve(),
    declineInvite: () => Promise.resolve(),
    changeRole: () => Promise.resolve(),
    removeMember: () => Promise.resolve(),
    switchTeam: (teamId) => Promise.resolve(teamId),
  }
}

export function createPreviewDataManagementClient(): DataManagementClient {
  let persistSignIn = false
  return {
    summary: () => Promise.resolve({
      sharedTasks: [],
      sharedFiles: [],
      archivedTasks: [],
      authorizedApps: [],
      cloudBrowser: { persistSignIn, sites: [] },
    }),
    setCloudBrowserPersistence: (enabled) => {
      persistSignIn = enabled
      return Promise.resolve({ persistSignIn })
    },
    revokeAuthorizedApp: () => Promise.resolve(),
    removeCloudBrowserSite: () => Promise.resolve(),
  }
}
