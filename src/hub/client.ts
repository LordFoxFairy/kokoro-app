// hub self 面 HTTP 客户端：同源 `/api/hub/*` BFF 代理（注入 web-bff 凭据 + 信封 scope/user）。
// 入站过 Zod，失败以类型化错误上抛；错误体尽力取 hub 错误码（如 hub.skill_required）供 UI 本地化。

import { ZodError, type ZodTypeAny, type z } from "zod"

import {
  HUB_BASE,
  hubDataSchema,
  hubErrorSchema,
  mcpDisablePath,
  mcpEnablePath,
  mcpSecretCreatedSchema,
  mcpSecretListSchema,
  mcpSecretPath,
  mcpSecretsPath,
  mcpServerPath,
  mcpServerPoolSchema,
  mcpServerRegisteredSchema,
  connectorAssetUploadedSchema,
  connectorAssetsPath,
  customApiConnectorsPath,
  customApiViewSchema,
  customMcpConnectorsPath,
  githubImportRequestSchema,
  githubImportResultSchema,
  mcpServersPath,
  skillDisablePath,
  skillEnablePath,
  skillGithubImportPath,
  skillGithubPreviewPath,
  skillPoolPath,
  skillPoolSchema,
  skillCatalogPath,
  skillCatalogSchema,
  skillQuotaPath,
  skillQuotaSchema,
  skillRevisionsPath,
  skillRevisionsSchema,
  skillUploadConfirmPath,
  skillUploadPreviewPath,
  uploadConfirmSchema,
  uploadPreviewSchema,
  type McpRegisterInput,
  type CustomMcpRegisterInput,
  type CustomApiCreateInput,
  type CustomApiView,
  type ConnectorAssetUploaded,
  type McpSecret,
  type McpServerView,
  type SkillCard,
  type SkillCatalog,
  type SkillQuota,
  type SkillRevision,
  type UploadConfirm,
  type UploadPreview,
  type GithubImportResult,
} from "./schemas"

export type HubFailureReason = "network" | "http" | "parse" | "aborted"

export class HubClientError extends Error {
  readonly reason: HubFailureReason
  // hub 稳定错误码（http 失败时尽力解析）：如 hub.skill_required / capability_registration_disabled。
  readonly code: string | null
  readonly status: number | null

  constructor(reason: HubFailureReason, message: string, code: string | null, status: number | null) {
    super(message)
    this.name = "HubClientError"
    this.reason = reason
    this.code = code
    this.status = status
  }
}

export type GithubRepository = {
  canonical: string
  owner: string
  name: string
}

/**
 * Accept only the two repository forms the BFF contract can resolve:
 * `OWNER/REPOSITORY` or an HTTPS github.com repository URL. Keeping this
 * boundary in the hub client as well as the dialog prevents another caller
 * from accidentally sending a branch URL, credentials, or an arbitrary host
 * to the GitHub importer.
 */
export function parseGithubRepository(value: string): GithubRepository | null {
  const input = value.trim()
  if (input === "") return null

  const candidate = /^https?:\/\//i.test(input)
    ? input
    : `https://github.com/${input.replace(/^\/+/, "")}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }

  const hostname = url.hostname.toLowerCase()
  if (url.protocol !== "https:" || (hostname !== "github.com" && hostname !== "www.github.com")) return null
  const authority = candidate.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i)?.[1] ?? ""
  const host = authority.slice(authority.lastIndexOf("@") + 1)
  // URL normalizes the default :443 away, so reject an explicit port from the
  // raw authority as well as any non-standard origin.
  if (host.includes(":")) return null
  if (url.origin !== `https://${hostname}`) return null
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") return null

  // Do not silently accept `owner//repo` or multiple path components. Those
  // forms otherwise look valid after filtering empty URL segments.
  if (!/^\/[^/]+\/[^/]+\/?$/.test(url.pathname)) return null
  const segments = url.pathname.split("/").filter(Boolean)
  const [owner, rawName] = segments
  const name = rawName?.replace(/\.git$/i, "") ?? ""
  if (!owner || !name || owner === "." || owner === ".." || name === "." || name === "..") return null
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(name)) return null

  return {
    canonical: `https://github.com/${owner}/${name}`,
    owner,
    name,
  }
}

function canonicalGithubRepository(repository: string): string {
  const parsed = parseGithubRepository(repository)
  if (parsed === null) {
    throw new HubClientError("parse", "invalid GitHub repository", "github.invalid_repository", 400)
  }
  return parsed.canonical
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
}

function describeUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function readError(response: Response): Promise<HubClientError> {
  let code: string | null = null
  let message = `hub request failed with status ${response.status}`
  try {
    const raw = await response.json() as unknown
    const parsed = hubErrorSchema.safeParse(raw)
    if (parsed.success) {
      code = parsed.data.error.code
      message = parsed.data.error.message || message
    } else if (typeof raw === "object" && raw !== null) {
      // Keep the canonical envelope first, but tolerate the flat forms used
      // by older BFF adapters so typed GitHub errors still reach the UI.
      const body = raw as Record<string, unknown>
      const nested = typeof body.error === "object" && body.error !== null
        ? body.error as Record<string, unknown>
        : null
      const firstString = (...values: unknown[]) => values.find((value): value is string => typeof value === "string" && value.length > 0)
      code = firstString(nested?.code, body.code, body.error_code, body.errorCode) ?? null
      message = firstString(nested?.message, body.message, body.error_message, body.errorMessage, body.detail) ?? message
    }
  } catch {
    // 无 JSON 错误体：保留状态码描述。
  }
  return new HubClientError("http", message, code, response.status)
}

async function parseData<T extends ZodTypeAny>(response: Response, inner: T): Promise<z.infer<T>> {
  let raw: unknown
  try {
    raw = await response.json()
  } catch (error) {
    if (isAbortError(error)) {
      throw new HubClientError("aborted", "hub request aborted", null, response.status)
    }
    throw new HubClientError("parse", describeUnknown(error), null, response.status)
  }
  try {
    return hubDataSchema(inner).parse(raw).data
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HubClientError("parse", error.message, null, response.status)
    }
    throw error
  }
}

async function requestData<T extends ZodTypeAny>(
  path: string,
  inner: T,
  init?: RequestInit,
): Promise<z.infer<T>> {
  let response: Response
  try {
    response = await fetch(`${HUB_BASE}${path}`, { cache: "no-store", ...init })
  } catch (error) {
    if (isAbortError(error)) {
      throw new HubClientError("aborted", "hub request aborted", null, null)
    }
    throw new HubClientError("network", describeUnknown(error), null, null)
  }
  if (!response.ok) {
    throw await readError(response)
  }
  return parseData(response, inner)
}

function createIdempotencyKey(prefix: string, stableValue?: string): string {
  if (stableValue !== undefined) {
    // GitHub import is a resource operation: repeating the same canonical
    // repository should be safe to replay after a timeout. Keep the key opaque
    // and deterministic without putting the repository URL in a request
    // header. Other mutations remain per-attempt keys.
    let hash = 2166136261
    for (let index = 0; index < stableValue.length; index += 1) {
      hash ^= stableValue.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
    return `${prefix}:${(hash >>> 0).toString(16).padStart(8, "0")}`
  }
  const uuid = globalThis.crypto?.randomUUID?.()
  return `${prefix}:${uuid ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`
}

export type HubClient = {
  listSkillPool: () => Promise<SkillCard[]>
  listSkillCatalog: (params?: { scope?: "official" | "third_party"; query?: string; cursor?: string }) => Promise<SkillCatalog>
  skillQuota: () => Promise<SkillQuota>
  skillRevisions: (name: string, scope?: string) => Promise<SkillRevision[]>
  /** `scope` disambiguates same-name official/third-party/personal projections. */
  setSkillEnabled: (name: string, enabled: boolean, scope?: string) => Promise<void>
  previewUpload: (zip: Blob, signal?: AbortSignal) => Promise<UploadPreview>
  confirmUpload: (zip: Blob, names: string[] | null, signal?: AbortSignal) => Promise<UploadConfirm>
  /** Optional GitHub preview/import endpoints; preview clients may omit them. */
  previewGithub?: (repository: string, signal?: AbortSignal) => Promise<GithubImportResult>
  importGithub?: (repository: string, signal?: AbortSignal) => Promise<GithubImportResult>
  // MCP server 池（self 面）：列表 / 注册 / 启停 / 软删。
  listMcpServers: () => Promise<McpServerView[]>
  registerMcpServer: (input: McpRegisterInput) => Promise<McpServerView>
  /** Settings connector composer v2. Header values are write-only. */
  registerCustomMcp?: (input: CustomMcpRegisterInput) => Promise<McpServerView>
  registerCustomApi?: (input: CustomApiCreateInput) => Promise<CustomApiView>
  uploadConnectorIcon?: (file: File) => Promise<ConnectorAssetUploaded>
  setMcpEnabled: (name: string, enabled: boolean) => Promise<void>
  deleteMcpServer: (name: string) => Promise<void>
  // MCP secret handle（self 面）：列表 / 创建（值只进不出）/ 软删。
  listMcpSecrets: () => Promise<McpSecret[]>
  createMcpSecret: (name: string, value: string) => Promise<string>
  deleteMcpSecret: (handle: string) => Promise<void>
}

// 无回执体的变更请求（启停/软删）：只校验状态码，错误尽力取 hub 错误码。与 setSkillEnabled 同形。
async function mutate(path: string, method: "POST" | "DELETE"): Promise<void> {
  let response: Response
  try {
    response = await fetch(`${HUB_BASE}${path}`, {
      method,
      cache: "no-store",
      headers: { "Idempotency-Key": createIdempotencyKey("hub-mutation") },
    })
  } catch (error) {
    throw new HubClientError("network", describeUnknown(error), null, null)
  }
  if (!response.ok) {
    throw await readError(response)
  }
}

const JSON_HEADERS = { "content-type": "application/json" } as const

function uploadForm(zip: Blob, names: string[] | null): FormData {
  const form = new FormData()
  // hub upload-routes 读 multipart「file」字段为 zip；names 是 JSON 数组字符串字段（选择发布，缺省=全部）。
  form.set("file", zip, "skills.zip")
  if (names !== null) {
    form.set("names", JSON.stringify(names))
  }
  return form
}

export function createHubClient(): HubClient {
  return {
    listSkillPool: async () => (await requestData(skillPoolPath, skillPoolSchema)).skills,
    listSkillCatalog: (params = {}) => {
      const search = new URLSearchParams()
      if (params.scope) search.set("scope", params.scope)
      if (params.query?.trim()) search.set("query", params.query.trim())
      if (params.cursor) search.set("cursor", params.cursor)
      const suffix = search.toString()
      return requestData(`${skillCatalogPath}${suffix ? `?${suffix}` : ""}`, skillCatalogSchema)
    },
    skillQuota: () => requestData(skillQuotaPath, skillQuotaSchema),
    skillRevisions: async (name, scope) =>
      (await requestData(skillRevisionsPath(name, scope), skillRevisionsSchema)).revisions,
    setSkillEnabled: async (name, enabled, scope) => {
      const path = enabled ? skillEnablePath(name, scope) : skillDisablePath(name, scope)
      let response: Response
      try {
        response = await fetch(`${HUB_BASE}${path}`, {
          method: "POST",
          cache: "no-store",
          headers: { "Idempotency-Key": createIdempotencyKey("skill-toggle") },
        })
      } catch (error) {
        throw new HubClientError("network", describeUnknown(error), null, null)
      }
      if (!response.ok) {
        throw await readError(response)
      }
    },
    previewUpload: (zip, signal) =>
      requestData(skillUploadPreviewPath, uploadPreviewSchema, {
        method: "POST",
        signal,
        body: uploadForm(zip, null),
      }),
    confirmUpload: (zip, names, signal) =>
      requestData(skillUploadConfirmPath, uploadConfirmSchema, {
        method: "POST",
        headers: { "Idempotency-Key": createIdempotencyKey("skill-upload") },
        signal,
        body: uploadForm(zip, names),
      }),
    previewGithub: async (repository, signal) => {
      const canonical = canonicalGithubRepository(repository)
      const body = githubImportRequestSchema.parse({ repository: canonical })
      return requestData(skillGithubPreviewPath, githubImportResultSchema, {
        method: "POST",
        headers: JSON_HEADERS,
        signal,
        body: JSON.stringify(body),
      })
    },
    importGithub: async (repository, signal) => {
      const canonical = canonicalGithubRepository(repository)
      const body = githubImportRequestSchema.parse({ repository: canonical })
      return requestData(skillGithubImportPath, githubImportResultSchema, {
        method: "POST",
        headers: { ...JSON_HEADERS, "Idempotency-Key": createIdempotencyKey("skill-github-import", canonical) },
        signal,
        body: JSON.stringify(body),
      })
    },
    listMcpServers: async () => (await requestData(mcpServersPath, mcpServerPoolSchema)).servers,
    registerMcpServer: async (input) =>
      (
        await requestData(mcpServersPath, mcpServerRegisteredSchema, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify(
            input.secret_ref === null
              ? { name: input.name, transport: input.transport, url: input.url, allowed_tools: input.allowed_tools }
              : {
                  name: input.name,
                  transport: input.transport,
                  url: input.url,
                  allowed_tools: input.allowed_tools,
                  secret_ref: input.secret_ref,
                },
          ),
        })
      ).server,
    registerCustomMcp: async (input) =>
      (
        await requestData(customMcpConnectorsPath, mcpServerRegisteredSchema, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify(input),
        })
      ).server,
    registerCustomApi: (input) => requestData(customApiConnectorsPath, customApiViewSchema, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    }),
    uploadConnectorIcon: (file) => {
      const form = new FormData()
      form.set("file", file, file.name)
      return requestData(connectorAssetsPath, connectorAssetUploadedSchema, {
        method: "POST",
        body: form,
      })
    },
    setMcpEnabled: (name, enabled) => mutate(enabled ? mcpEnablePath(name) : mcpDisablePath(name), "POST"),
    deleteMcpServer: (name) => mutate(mcpServerPath(name), "DELETE"),
    listMcpSecrets: async () => (await requestData(mcpSecretsPath, mcpSecretListSchema)).secrets,
    createMcpSecret: async (name, value) =>
      (
        await requestData(mcpSecretsPath, mcpSecretCreatedSchema, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ name, value }),
        })
      ).handle,
    deleteMcpSecret: (handle) => mutate(mcpSecretPath(handle), "DELETE"),
  }
}
