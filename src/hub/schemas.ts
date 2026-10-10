// hub self 面响应契约（web 侧镜像）：hub DTO 不在冻结契约内，这里就近以 Zod 收边界。
// 全部入站过 schema，失败 fail-loud（不静默降级）。响应包统一 { data, requestId? }；
// 错误包 { error: { code, message } }。

import { z } from "zod"

// —— 成功/错误信封 ——

export const hubErrorSchema = z
  .object({
    error: z.object({ code: z.string().min(1), message: z.string() }).passthrough(),
    requestId: z.string().optional(),
  })
  .passthrough()

export function hubDataSchema<T extends z.ZodTypeAny>(inner: T) {
  return z.object({ data: inner, requestId: z.string().optional() }).passthrough()
}

// —— 技能池 ——

// Classification is a server-owned projection, not something inferred from
// a display title in the browser. Keep the values intentionally small and
// stable so catalog filters can be shared by every User Web skin.
export const SKILL_CATEGORIES = ["coding", "data", "automation", "business", "design", "media", "content"] as const
export type SkillCategory = (typeof SKILL_CATEGORIES)[number]
const skillCategoriesSchema = z.array(z.enum(SKILL_CATEGORIES)).min(1).max(SKILL_CATEGORIES.length)

// 池卡片：official 位（scope=OFFICIAL_SCOPE）与本 namespace 自有包（scope=namespace）合并视图。
// 池只含「有效可用」项（official 上架∧用户未关 + 自有包）；required 官方技能恒在且拒关（disable→409）。
const skillCardSchema = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    content_hash: z.string().min(1),
    scope: z.string().min(1),
    enabled: z.boolean().optional(),
    categories: skillCategoriesSchema.optional(),
    updated_at: z.number().int().optional(),
  })
  .strict()
export type SkillCard = z.infer<typeof skillCardSchema>

export const skillPoolSchema = z.object({ skills: z.array(skillCardSchema) }).strict()

// 发现目录与已新增技能池是两个不同的投影：目录可以包含尚未安装的官方/第三方
// 技能，因此不能复用 SkillCard 的 enabled-only 语义。
const skillCatalogCardSchema = z
  .object({
    // Catalog identity is independent from a display name. The Manus-style
    // read projection supplies this key; older local fixtures may omit it.
    skill_id: z.string().min(1).optional(),
    name: z.string().min(1),
    description: z.string(),
    content_hash: z.string().min(1),
    scope: z.string().min(1),
    installed: z.boolean(),
    enabled: z.boolean(),
    categories: skillCategoriesSchema.optional(),
    updated_at: z.number().int().optional(),
    usage_count: z.string().regex(/^(0|[1-9][0-9]*)$/u).optional(),
    cover_image: z.string().min(1).optional(),
    example_questions: z.array(z.string().min(1)).optional(),
    publisher_type: z.string().min(1).optional(),
  })
  .strict()
export type SkillCatalogCard = z.infer<typeof skillCatalogCardSchema>

export const skillCatalogSchema = z
  .object({ skills: z.array(skillCatalogCardSchema), next_cursor: z.string().nullable().optional() })
  .strict()
export type SkillCatalog = z.infer<typeof skillCatalogSchema>

// BFF public read projections. These are consumer validators, not editable owner contracts.
const publishedSkillId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u)
export function skillCommandPath(id: string): string {
  if (!publishedSkillId.safeParse(id).success) throw new Error("invalid Skill ID")
  return `/self/skills/${encodeURIComponent(id)}`
}
export function managedPersonalSkillPath(id: string): string {
  if (!publishedSkillId.safeParse(id).success) throw new Error("invalid Skill ID")
  return `/self/skills/managed/${encodeURIComponent(id)}`
}

// BFF public single-ZIP draft commands. These strict consumer parsers mirror
// the pinned owner contract; the owner remains the only editable source.
const skillCommandId = publishedSkillId
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u)
const uint64 = z.string().max(20).regex(/^[1-9][0-9]*$/u).refine((value) => BigInt(value) <= BigInt("18446744073709551615"))
const skillExamplePromptsSchema = z.array(z.string().refine((value) => { const count = [...value].length; return count > 0 && count <= 1000 && value.trim().length > 0 && !/[\u0000\uD800-\uDFFF]/u.test(value) })).max(10).refine((values) => values.reduce((size, value) => size + new TextEncoder().encode(value).byteLength, 0) <= 16384)
const skillCategoryKeysSchema = z.array(z.enum(["programming", "data", "automation", "business", "design", "media", "content", "apps"])).max(8).refine((values) => new Set(values).size === values.length)
export const createSkillDraftRequestSchema = z.object({
  example_prompts: skillExamplePromptsSchema.optional(), category_keys: skillCategoryKeysSchema.optional(),
  display_name: z.string().min(1).max(255).refine((value) => /\S/u.test(value)),
  summary: z.string().max(65535),
  tags: z.array(z.string().min(1).max(128).refine((value) => /\S/u.test(value))).max(100).refine((items) => new Set(items).size === items.length),
}).strict()
export type CreateSkillDraftRequest = z.infer<typeof createSkillDraftRequestSchema>
export const skillStateVersionSchema = z.string().max(19).regex(/^[1-9][0-9]*$/u).refine((value) => BigInt(value) <= BigInt("9223372036854775807"))
export const skillSourceVersionSchema = z.string().min(1).max(1024).regex(/^[\x21-\x7e]+$/u).refine((value) => value !== "null")
export const skillPublishRequestSchema = z.object({ expected_state_version: skillStateVersionSchema, audience: z.enum(["owner", "tenant", "catalog"]) }).strict()
export type SkillPublishRequest = z.infer<typeof skillPublishRequestSchema>
export const skillDraftSchema = z.object({ state_version: skillStateVersionSchema, skill_id: skillCommandId, series_id: skillCommandId, revision: z.literal(1), status: z.literal("draft"), replayed: z.boolean() }).strict()
export const skillUploadStateSchema = z.discriminatedUnion("phase", [
  z.object({ state_version: skillStateVersionSchema, source_version_id: skillSourceVersionSchema.optional(), skill_id: skillCommandId, attempt_epoch: z.literal("0"), phase: z.literal("none") }).strict(),
  z.object({ state_version: skillStateVersionSchema, source_version_id: skillSourceVersionSchema.optional(), skill_id: skillCommandId, attempt_epoch: uint64, phase: z.literal("intent"), attempt_id: skillCommandId }).strict(),
  z.object({ state_version: skillStateVersionSchema, source_version_id: skillSourceVersionSchema.optional(), skill_id: skillCommandId, attempt_epoch: uint64, phase: z.literal("upload_pending"), attempt_id: skillCommandId, upload_id: skillCommandId }).strict(),
  z.object({ state_version: skillStateVersionSchema, source_version_id: skillSourceVersionSchema.optional(), skill_id: skillCommandId, attempt_epoch: uint64, phase: z.literal("uploaded"), attempt_id: skillCommandId, upload_id: skillCommandId }).strict(),
  z.object({ state_version: skillStateVersionSchema, source_version_id: skillSourceVersionSchema.optional(), skill_id: skillCommandId, attempt_epoch: uint64, phase: z.literal("validated"), attempt_id: skillCommandId, upload_id: skillCommandId }).strict(),
  z.object({ state_version: skillStateVersionSchema, source_version_id: skillSourceVersionSchema.optional(), skill_id: skillCommandId, attempt_epoch: uint64, phase: z.literal("aborted"), attempt_id: skillCommandId, upload_id: skillCommandId.optional() }).strict(),
])
export const skillZipFilenameSchema = z.string().min(1).max(255).refine((value) => new TextEncoder().encode(value).length <= 255 && !/^\.{1,2}$/u.test(value) && value.trim() === value && !/[\\/\u0000-\u001f\u007f]/u.test(value))
export const beginSkillUploadRequestSchema = z.object({
  expected_state_version: skillStateVersionSchema,
  filename: skillZipFilenameSchema,
  mime_type: z.literal("application/zip"),
  size_bytes: z.number().int().min(1).max(33554432),
  content_sha256: sha256,
  replaces_attempt_id: skillCommandId.optional(),
}).strict()
export type BeginSkillUploadRequest = z.infer<typeof beginSkillUploadRequestSchema>
export const transferReferenceSchema = z.object({
  url: z.string().url(), method: z.literal("PUT"),
  required_headers: z.object({ "content-type": z.literal("application/zip") }).strict(),
  expires_at: z.string().datetime({ offset: true }),
}).strict()
export type TransferReference = z.infer<typeof transferReferenceSchema>
export const beginSkillUploadSchema = z.object({ state_version: skillStateVersionSchema, skill_id: skillCommandId, attempt_id: skillCommandId, attempt_epoch: uint64, upload_id: skillCommandId, transfer_reference: transferReferenceSchema, replayed: z.boolean() }).strict()
export const completeSkillUploadRequestSchema = z.object({ expected_state_version: skillStateVersionSchema, source_version_id: skillSourceVersionSchema, attempt_id: skillCommandId, upload_id: skillCommandId, content_sha256: sha256, size_bytes: z.number().int().min(1).max(33554432) }).strict()
export type CompleteSkillUploadRequest = z.infer<typeof completeSkillUploadRequestSchema>
export const completeSkillUploadSchema = z.object({ state_version: skillStateVersionSchema, skill_id: skillCommandId, attempt_id: skillCommandId, attempt_epoch: uint64, upload_id: skillCommandId, phase: z.literal("uploaded"), replayed: z.boolean(), content_sha256: sha256, scan_state: z.enum(["clean", "pending", "unknown"]) }).strict()
export const validateSkillDraftSchema = z.object({ state_version: skillStateVersionSchema, skill_id: skillCommandId, series_id: skillCommandId, valid: z.literal(true), content_digest: sha256, manifest_identity: z.string().regex(/^skill-md-v1:sha256:[a-f0-9]{64}$/u), replayed: z.boolean() }).strict()
export const publishSkillDraftSchema = z.object({ state_version: skillStateVersionSchema, source_ref: z.string().regex(/^skill:[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u), revision: uint64, status: z.literal("active"), event_id: z.string().uuid(), replayed: z.boolean() }).strict()


export const validateSkillDraftRequestSchema = z.object({ attempt_id: skillCommandId, expected_state_version: skillStateVersionSchema }).strict()
export type ValidateSkillDraftRequest = z.infer<typeof validateSkillDraftRequestSchema>
const skillIamRefSchema = z.object({ kind: z.enum(["user", "organization"]), id: z.string().min(1).max(255) }).strict()
const skillProvenanceFields = { asset_ref: z.string().min(1).max(255), content_sha256: sha256, size_bytes: skillStateVersionSchema, mime_type: z.literal("application/zip") }
const skillGithubProvenanceSchema = z.object({ kind: z.literal("github"), repository_id: z.string().min(1).max(255), repository_url: z.string().url().max(2048), owner_login: z.string().min(1).max(255), owner_url: z.string().url().max(2048), commit: z.string().regex(/^[a-f0-9]{40}([a-f0-9]{24})?$/u), path: z.string().max(2048), ...skillProvenanceFields, asset_ref: skillProvenanceFields.asset_ref.optional(),
  repo_stats: z.object({ stars: z.string().max(19).regex(/^(0|[1-9][0-9]*)$/u), forks: z.string().max(19).regex(/^(0|[1-9][0-9]*)$/u), observed_at: z.string().datetime({ offset: true }), metadata_source_url: z.string().url().max(2048) }).strict().optional(),
}).strict()
const skillAiProvenanceSchema = z.object({ kind: z.literal("ai"), conversation_id: z.string().min(1).max(255), run_ref: z.string().min(1).max(255), artifact_ref: z.string().min(1).max(255), source_event_id: z.string().min(1).max(255), source_event_seq: skillStateVersionSchema, source_event_digest: sha256, ...skillProvenanceFields }).strict()
const skillProductFactsSchema = z.object({
  publication_audience: z.enum(["owner", "tenant", "catalog"]), state_version: skillStateVersionSchema,
  creator_ref: skillIamRefSchema.optional(),
  publisher: z.discriminatedUnion("kind", [z.object({ kind: z.literal("iam"), iam: skillIamRefSchema }).strict(), z.object({ kind: z.literal("github_repository"), github_repository: skillGithubProvenanceSchema }).strict()]).optional(),
  source_kind: z.enum(["personal", "official", "third_party"]).optional(),
  creation_provenance: z.union([z.object({ kind: z.literal("local") }).strict(), skillAiProvenanceSchema, skillGithubProvenanceSchema]).optional(),
  cover: z.object({ asset_ref: z.string().min(1).max(255), mime_type: z.enum(["image/png", "image/jpeg"]), width: z.number().int().min(1).max(4096), height: z.number().int().min(1).max(4096) }).strict().optional(),
  presentation_kind: z.enum(["first_party", "github_repository"]).optional(),
}).strict()
const skillPublisherProfileSchema = z.union([
  z.object({ kind: z.enum(["user", "organization"]), id: z.string().min(1).max(255), status: z.literal("found"), display_name: z.string(), image_url: z.string().nullable() }).strict(),
  z.object({ kind: z.literal("user"), id: z.string().min(1).max(255), status: z.literal("missing") }).strict(),
])
export const managedPersonalSkillSchema = z.object({
  skill_id: skillCommandId, source_ref: z.string().regex(/^skill:[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u), series_id: skillCommandId,
  revision: z.string().regex(/^[1-9][0-9]*$/u), name: z.string().min(1).max(255).refine((value) => /\S/u.test(value)), summary: z.string().max(65535), tags: z.array(z.string().max(128)).max(100),
  status: z.enum(["draft", "active", "disabled", "withdrawn", "quarantined"]), skill_updated_at: z.string().datetime().regex(/Z$/u),
  example_prompts: skillExamplePromptsSchema,
  category_keys: skillCategoryKeysSchema,
  product: skillProductFactsSchema, publisher_profile: skillPublisherProfileSchema.optional(),
}).strict()
export type ManagedPersonalSkill = z.infer<typeof managedPersonalSkillSchema>
export const managedPersonalSkillPageSchema = z.object({ skills: z.array(managedPersonalSkillSchema), next_cursor: z.string().min(1).max(2048).nullable() }).strict()

// —— 配额 ——

export const skillQuotaSchema = z
  .object({
    namespace: z.string().min(1),
    package_count: z.number().int(),
    package_bytes: z.number().int(),
    max_packages: z.number().int(),
    max_bytes: z.number().int(),
  })
  .strict()
export type SkillQuota = z.infer<typeof skillQuotaSchema>

// —— 版本历史 ——

const skillRevisionSchema = z
  .object({
    scope: z.string().min(1),
    name: z.string().min(1),
    revision: z.number().int(),
    content_hash: z.string().min(1),
    package_size: z.number().int(),
    source: z.string().min(1),
    created_at: z.number().int(),
  })
  .strict()
export type SkillRevision = z.infer<typeof skillRevisionSchema>

export const skillRevisionsSchema = z.object({ revisions: z.array(skillRevisionSchema) }).strict()

// —— 上传预检 / 发布 ——

const uploadFileEntrySchema = z
  .object({ path: z.string().min(1), size: z.number().int() })
  .strict()

const uploadCandidateSchema = z
  .object({
    name: z.string().min(1),
    valid: z.boolean(),
    errors: z.array(z.string()),
    description: z.string().nullable(),
    content_hash: z.string().nullable(),
    package_size: z.number().int(),
    file_count: z.number().int(),
    files: z.array(uploadFileEntrySchema),
    conflicts: z.object({ official: z.boolean(), namespace: z.boolean() }).strict(),
  })
  .strict()
export type UploadCandidate = z.infer<typeof uploadCandidateSchema>

export const uploadPreviewSchema = z
  .object({ namespace: z.string().min(1), candidates: z.array(uploadCandidateSchema) })
  .strict()
export type UploadPreview = z.infer<typeof uploadPreviewSchema>

const confirmResultSchema = z
  .object({
    name: z.string().min(1),
    status: z.enum(["published", "unchanged", "failed"]),
    revision: z.number().int().nullable(),
    content_hash: z.string().nullable(),
    error: z.string().nullable(),
  })
  .strict()
export const uploadConfirmSchema = z
  .object({ namespace: z.string().min(1), results: z.array(confirmResultSchema) })
  .strict()
export type UploadConfirm = z.infer<typeof uploadConfirmSchema>

// —— GitHub 技能导入（可选 BFF 扩展）——

// GitHub 导入入口与 zip 上传入口分开建模。当前 Web fixture 先使用本地预览，
// 后端接入时可通过 HubClient.importGithub 注入同一形状的确认结果；不会把仓库
// URL 误当成 multipart 文件，也不会把 GitHub 菜单项落到 upload surface。
const githubCanonicalRepositoryPattern = /^https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

/**
 * The BFF only returns the canonical repository form produced by the client.
 * Keeping this constraint at the response boundary prevents a malformed or
 * untrusted upstream value from being rendered as a repository link later.
 */
export const githubCanonicalRepositorySchema = z
  .string()
  .regex(githubCanonicalRepositoryPattern, "expected a canonical GitHub repository URL")

export const githubImportRequestSchema = z
  .object({ repository: githubCanonicalRepositorySchema })
  .strict()

export const githubImportResultSchema = z
  .object({
    repository: githubCanonicalRepositorySchema,
    default_branch: z.string().min(1),
    skill: z
      .object({
        name: z.string().min(1),
        description: z.string().nullable(),
      })
      .strict(),
  })
  .strict()
export type GithubImportResult = z.infer<typeof githubImportResultSchema>

// —— MCP server 池（self 面）——

// 传输种类：与 hub contract/mcp-storage.MCP_TRANSPORTS 对齐（http / streamable_http）。
export const MCP_TRANSPORTS = ["http", "streamable_http"] as const
export type McpTransport = (typeof MCP_TRANSPORTS)[number]

// 池视图：official 位（scope=official）与本 namespace 自有 server 合并。secret_ref 是引用名
// （handle:srt_... / env:VAR）非凭据本体；revision 是内部机制，UI 不呈现（仅收边界不丢字段）。
const mcpServerViewSchema = z
  .object({
    scope: z.string().min(1),
    name: z.string().min(1),
    revision: z.number().int(),
    transport: z.enum(MCP_TRANSPORTS),
    url: z.string().min(1),
    allowed_tools: z.array(z.string()),
    secret_ref: z.string().nullable(),
    enabled: z.boolean(),
  })
  .strict()
export type McpServerView = z.infer<typeof mcpServerViewSchema>

const codePointBounded = (maximum: number) => z.string().min(1).refine((value) => [...value].length <= maximum)
const mcpConnectionIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u)
export const mcpConnectionSchema = z.object({
  connection_id: mcpConnectionIdSchema,
  connector_id: mcpConnectionIdSchema,
  server_id: mcpConnectionIdSchema,
  provider_key: codePointBounded(191),
  transport: z.literal("streamable_http"),
  status: z.literal("active"),
}).strict()
export type McpConnection = z.infer<typeof mcpConnectionSchema>
export const mcpConnectionPageSchema = z.object({
  connections: z.array(mcpConnectionSchema),
  next_cursor: codePointBounded(2048).optional(),
}).strict()
export type McpConnectionPage = z.infer<typeof mcpConnectionPageSchema>
export const mcpConnectionReadErrorSchema = z.object({ error: z.object({
  code: z.enum(["invalid_query_parameter", "service_auth_failed", "session_authentication_required", "session_invalid", "session_forbidden", "session_rate_limited", "product_tenant_not_configured", "product_tenant_forbidden", "iam_admission_unavailable", "mcp_connection_dependency_unavailable", "mcp_connection_response_invalid"]),
  message: z.string().min(1),
  retryable: z.boolean(),
}).strict() }).strict()
export function mcpConnectionErrorAllowed(status: number, code: string): boolean {
  return status === 400 ? code === "invalid_query_parameter"
    : status === 401 ? ["session_authentication_required", "session_invalid"].includes(code)
      : status === 403 ? ["service_auth_failed", "session_forbidden", "product_tenant_forbidden"].includes(code)
        : status === 429 ? code === "session_rate_limited"
          : status === 502 ? code === "mcp_connection_response_invalid"
            : status === 503 && ["product_tenant_not_configured", "iam_admission_unavailable", "mcp_connection_dependency_unavailable"].includes(code)
}

export const mcpServerPoolSchema = z.object({ servers: z.array(mcpServerViewSchema) }).strict()
export const mcpServerRegisteredSchema = z.object({ server: mcpServerViewSchema }).strict()

// self 注册体（门后）：scope 恒取信封头（不进 body）；secret_ref 仅 handle:srt_... 引用或省略。
export type McpRegisterInput = {
  name: string
  transport: McpTransport
  url: string
  allowed_tools: string[]
  secret_ref: string | null
}

export type CustomMcpHeaderInput = {
  name: string
  value: string
}

export type CustomMcpRegisterInput = {
  name: string
  transport: McpTransport
  endpoint_url: string
  icon_asset_id: string | null
  instructions: string | null
  headers: CustomMcpHeaderInput[]
  enabled: boolean
}

export type CustomApiCreateInput = {
  name: string
  notes: string | null
  icon_asset_id: string | null
  secrets: Array<{ name: string; value: string }>
  enabled: boolean
}

const customApiSecretEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  in_use_by: z.number().int().nonnegative(),
}).strict()

export const customApiViewSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("custom_api"),
  name: z.string().min(1),
  notes: z.string().nullable(),
  icon_url: z.string().nullable(),
  secret_entries: z.array(customApiSecretEntrySchema),
  enabled: z.boolean(),
  revision: z.string().min(1),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
}).strict()
export type CustomApiView = z.infer<typeof customApiViewSchema>

export const connectorAssetUploadedSchema = z
  .object({ asset_id: z.string().min(1), url: z.string().min(1) })
  .strict()
export type ConnectorAssetUploaded = z.infer<typeof connectorAssetUploadedSchema>

// —— MCP secret handle（self 面）——

// 列表项：句柄 + 名称 + 创建毫秒时间戳（hub SecretListItem 的 camelCase 回传）。值只进不出，绝不回显。
const mcpSecretSchema = z
  .object({ handle: z.string().min(1), name: z.string().min(1), createdAt: z.number().int() })
  .strict()
export type McpSecret = z.infer<typeof mcpSecretSchema>

export const mcpSecretListSchema = z.object({ secrets: z.array(mcpSecretSchema) }).strict()
export const mcpSecretCreatedSchema = z.object({ handle: z.string().min(1) }).strict()

// self 面路径（浏览器同源前缀 /api/hub → BFF 前缀 /hub → hub self 面）。
export const HUB_BASE = "/api/hub"
export const mcpConnectionsPath = "/self/mcp/connections"
export const mcpServersPath = "/self/mcp/servers"
export function mcpEnablePath(name: string): string {
  return `/self/mcp/servers/${encodeURIComponent(name)}/enable`
}
export function mcpDisablePath(name: string): string {
  return `/self/mcp/servers/${encodeURIComponent(name)}/disable`
}
export function mcpServerPath(name: string): string {
  return `/self/mcp/servers/${encodeURIComponent(name)}`
}
export const mcpSecretsPath = "/self/mcp/secrets"
export const customMcpConnectorsPath = "/self/connectors/mcp"
export const customApiConnectorsPath = "/self/connectors/custom-apis"
export const connectorAssetsPath = "/self/connectors/assets"
export function mcpSecretPath(handle: string): string {
  return `/self/mcp/secrets/${encodeURIComponent(handle)}`
}
export const skillPoolPath = "/self/skills/pool"
export const skillCatalogPath = "/self/skills/catalog"
export const skillQuotaPath = "/self/skills/quota"
function skillScopeQuery(scope?: string): string {
  const normalized = scope?.trim()
  return normalized ? `?scope=${encodeURIComponent(normalized)}` : ""
}
export function skillEnablePath(name: string, scope?: string): string {
  return `/self/skills/${encodeURIComponent(name)}/enable${skillScopeQuery(scope)}`
}
export function skillDisablePath(name: string, scope?: string): string {
  return `/self/skills/${encodeURIComponent(name)}/disable${skillScopeQuery(scope)}`
}
export function skillRevisionsPath(name: string, scope?: string): string {
  return `/self/skills/${encodeURIComponent(name)}/revisions${skillScopeQuery(scope)}`
}
export const skillUploadPreviewPath = "/self/skills/upload/preview"
export const skillUploadConfirmPath = "/self/skills/upload/confirm"
export const skillGithubPreviewPath = "/self/skills/github/preview"
export const skillGithubImportPath = "/self/skills/github/import"

// BFF personal installation projection; never an execution authorization cache.
export const installationIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])/u)
export const installationSourceSchema = z.string().regex(/^skill:(?!skill:)[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])/u)
export const installationKeySchema = z.string().regex(/^[\x21-\x2b\x2d-\x7e]{1,128}(?![\s\S])/u)
const installationInstant = z.string().datetime().refine((value) => value.endsWith("Z") && Number.isFinite(Date.parse(value)))
export const personalInstallationSchema = z.object({
  installation_id: installationIdSchema, source_ref: installationSourceSchema, series_id: installationIdSchema,
  revision: z.string().max(20).refine((value) => /^[1-9][0-9]{0,19}(?![\s\S])/u.test(value) && BigInt(value) <= BigInt("18446744073709551615")), installed: z.boolean(), enabled: z.boolean(), installed_at: installationInstant,
  updated_at: installationInstant, removed_at: installationInstant.optional(),
  display_name: managedPersonalSkillSchema.shape.name, summary: managedPersonalSkillSchema.shape.summary,
  source_status: z.enum(["active", "disabled", "withdrawn", "quarantined"]), skill_updated_at: installationInstant,
  example_prompts: managedPersonalSkillSchema.shape.example_prompts, category_keys: managedPersonalSkillSchema.shape.category_keys,
  product: skillProductFactsSchema, publisher_profile: skillPublisherProfileSchema.optional(),
  available_update: z.object({ source_ref: installationSourceSchema, revision: z.string().max(20).regex(/^[1-9][0-9]*(?![\s\S])/u) }).strict().optional(),
  tags: z.array(z.string().min(1).max(128).refine((value) => /\S/u.test(value))).max(100).refine((values) => new Set(values).size === values.length),
}).strict().refine((value) => value.installed ? value.removed_at === undefined : !value.enabled && value.removed_at !== undefined)
  .refine((value) => Date.parse(value.updated_at) >= Date.parse(value.installed_at)
    && (value.removed_at === undefined || Date.parse(value.removed_at) >= Date.parse(value.installed_at)))
export type PersonalInstallation = z.infer<typeof personalInstallationSchema>
export const installationReceiptSchema = z.object({
  installation: personalInstallationSchema,
  change: z.enum(["installed", "upgraded", "reinstalled", "enabled", "disabled", "removed", "unchanged"]),
  event_id: installationIdSchema.optional(), replayed: z.boolean(),
}).strict().refine((value) => value.change === "unchanged" ? value.event_id === undefined : value.event_id !== undefined)
export type InstallationReceipt = z.infer<typeof installationReceiptSchema>
const installationCursor = z.string().min(1).refine((value) => new TextEncoder().encode(value).byteLength <= 4096)
export const installationPageSchema = z.object({
  data: z.array(personalInstallationSchema).max(100),
  meta: z.object({ next_cursor: installationCursor }).strict().optional(),
}).strict().refine((value) => new Set(value.data.map((item) => item.installation_id)).size === value.data.length)
export type InstallationPage = z.infer<typeof installationPageSchema>
export const installationListQuerySchema = z.object({
  installed: z.boolean().optional(), enabled: z.boolean().optional(), limit: z.number().int().min(1).max(100).optional(), cursor: installationCursor.optional(),
}).strict()
export type InstallationListQuery = z.infer<typeof installationListQuerySchema>
export const installationInstallRequestSchema = z.object({ source_ref: installationSourceSchema }).strict()
export const installationEnabledRequestSchema = z.object({ enabled: z.boolean() }).strict()
export const installationErrorSchema = z.object({ error: z.object({
  code: z.string().min(1).max(128), message: z.string().min(1).max(1024), retryable: z.boolean(),
}).strict() }).strict()
export type InstallationOperation = "install" | "list" | "get" | "setEnabled" | "remove"
export const installationErrorCodes: Readonly<Record<number, readonly string[]>> = {
  400: ["invalid_skill_installation_request", "skill_installation_idempotency_key_required"],
  401: ["session_authentication_required", "session_invalid"],
  403: ["service_auth_failed", "session_forbidden", "product_tenant_forbidden", "skill_installation_forbidden", "skill_forbidden"],
  404: ["skill_installation_not_found"],
  409: ["skill_installation_idempotency_conflict", "skill_installation_command_in_progress"],
  412: ["skill_installation_precondition_failed"], 413: ["request_body_too_large"],
  429: ["session_rate_limited", "skill_installation_rate_limited"],
  502: ["skill_installation_response_invalid"],
  503: ["product_tenant_not_configured", "iam_admission_unavailable", "skill_installation_dependency_unavailable"],
  504: ["skill_installation_dependency_timeout"],
}
export function installationErrorAllowed(operation: InstallationOperation, status: number, code: string): boolean {
  return !(["list", "get"].includes(operation) && code === "skill_forbidden")
    && !(operation === "list" && [404, 409, 412].includes(status))
    && !(operation === "get" && [409, 412].includes(status))
    && (installationErrorCodes[status]?.includes(code) ?? false)
}
export function installationResponseSchema(operation: InstallationOperation) {
  return operation === "list" ? installationPageSchema
    : operation === "get" ? z.object({ data: personalInstallationSchema }).strict()
      : z.object({ data: installationReceiptSchema }).strict()
}


export function installationReceiptMatches(operation: "install" | "setEnabled" | "remove", value: InstallationReceipt, identity: string, enabled?: boolean): boolean {
  const changes = operation === "install" ? ["installed", "upgraded", "reinstalled", "unchanged"] : operation === "remove" ? ["removed", "unchanged"] : [enabled ? "enabled" : "disabled", "unchanged"]
  return (operation === "install" ? value.installation.installed && value.installation.source_ref === identity : value.installation.installation_id === identity)
    && changes.includes(value.change)
    && (operation !== "remove" || !value.installation.installed)
    && (operation !== "setEnabled" || value.installation.installed && value.installation.enabled === enabled)
}
