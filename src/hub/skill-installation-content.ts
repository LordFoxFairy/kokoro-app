import { projectContentIdSchema, projectPackageResponseSchema, projectPackageErrors } from "@/generated/bff-project-skill-content"
import { parsePersonalSkillHistoryJson } from "./personal-skill-history.schema"
import { HubClientError, hasHubNoStoreDirective } from "./client"
import { catalogPackagePathSchema, catalogPackageResponseSchema, catalogPackageErrorSchema, catalogPackageMatches, installationIdSchema, installationSourceSchema, installationPackageErrorAllowed, type PersonalInstallation, type CatalogPackageData } from "./schemas"
import { skillDownloadSchema, skillDownloadErrorAllowed, type SkillDownload } from "./skill-download.schema"

export type ProjectInstallationTarget = Pick<PersonalInstallation, "installation_id" | "source_ref" | "revision"> & { project_id: string }
type Target = Pick<PersonalInstallation, "installation_id" | "source_ref" | "revision">
type ReadTarget = Pick<Target, "source_ref" | "revision"> & { installation_id?: string; project_id?: string }

/** Exact installation reads. No series fallback, token persistence, or implicit pin update. */
async function read(operation: "package" | "download" | "managedPackage" | "managedDownload" | "projectPackage" | "projectDownload", target: ReadTarget, filePath?: string, expectedDirectory?: CatalogPackageData, signal?: AbortSignal): Promise<CatalogPackageData | SkillDownload> {
  const project = operation === "projectPackage" || operation === "projectDownload"
  const projectId = project ? projectContentIdSchema.parse(target.project_id) : null
  const managed = operation === "managedPackage" || operation === "managedDownload"
  const download = operation === "download" || operation === "managedDownload" || operation === "projectDownload"
  const id = managed ? installationSourceSchema.parse(target.source_ref).slice(6) : installationIdSchema.parse(target.installation_id)
  const source = installationSourceSchema.parse(target.source_ref)
  const revision = skillDownloadSchema.shape.revision.parse(target.revision)
  if (filePath !== undefined) catalogPackagePathSchema.parse(filePath)
  const deadline = new AbortController(), joined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal
  const timer = setTimeout(() => deadline.abort(), 10_000)
  let response: Response | undefined
  const within = <T,>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(joined.reason)
    joined.addEventListener("abort", abort, { once: true })
    void work.then(resolve, reject).finally(() => joined.removeEventListener("abort", abort))
    if (joined.aborted) abort()
  })
  try {
    joined.throwIfAborted()
    response = await within(fetch(`/api/hub/${project ? `projects/${encodeURIComponent(projectId!)}/skill-installations` : managed ? "self/skills/managed" : "skill-installations"}/${encodeURIComponent(id)}/${download ? "download" : "package"}${filePath === undefined ? "" : `?file_path=${encodeURIComponent(filePath)}`}`, {
      method: download ? "POST" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: joined, headers: { accept: "application/json" },
    }).then(value => { if (joined.aborted) void value.body?.cancel().catch(() => undefined); return value }))
    joined.throwIfAborted()
    const invalid = () => new HubClientError("parse", "Invalid installed Skill content", null, response?.status ?? null)
    if (!response || response.body === null || !hasHubNoStoreDirective(response.headers) || !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(response.headers.get("content-type") ?? "") || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}(?![\s\S])/u.test(response.headers.get("x-request-id") ?? "")) throw invalid()
    const declared = response.headers.get("content-length")
    if (declared !== null && (!/^(0|[1-9][0-9]*)(?![\s\S])/u.test(declared) || Number(declared) > 1_048_576)) throw invalid()
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let count = 0
    const cancel = () => { void reader.cancel().catch(() => undefined) }
    joined.addEventListener("abort", cancel, { once: true })
    try {
      for (;;) { const part = await within(reader.read()); joined.throwIfAborted(); if (part.done) break; count += part.value.byteLength; if (count > 1_048_576) throw invalid(); chunks.push(part.value) }
    } finally { joined.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock() }
    if (declared !== null && Number(declared) !== count) throw invalid()
    const bytes = new Uint8Array(count); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    let raw: unknown
    try { raw = managed ? parsePersonalSkillHistoryJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) : JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { throw invalid() }
    joined.throwIfAborted()
    const retryAfter = response.headers.get("retry-after")
    if (retryAfter !== null && (response.status !== 429 || !/^[1-9][0-9]{0,4}(?![\s\S])/u.test(retryAfter))) throw invalid()
    if (response.status !== 200) {
      const parsed = catalogPackageErrorSchema.safeParse(raw)
      if (!parsed.success || !(!download ? installationPackageErrorAllowed(response.status, parsed.data.error.code, parsed.data.error.retryable, retryAfter) : skillDownloadErrorAllowed(response.status, parsed.data.error.code, project ? "project_installation" : managed ? "managed" : "installation"))) throw invalid()
      if (project && !download && !projectPackageErrors.some(item => item.status === response!.status && item.schema.safeParse(raw).success)) throw invalid()
      throw new HubClientError("http", parsed.data.error.message, parsed.data.error.code, response.status, parsed.data.error.retryable, response.headers.get("x-request-id"), retryAfter)
    }
    if (download) {
      const parsed = skillDownloadSchema.safeParse((raw as { data?: unknown } | null)?.data)
      if (!raw || typeof raw !== "object" || Object.keys(raw).length !== 1 || !parsed.success || parsed.data.source_ref !== source || parsed.data.revision !== revision || Date.parse(parsed.data.download_info.expires_at) <= Date.now()) throw invalid()
      return parsed.data
    }
    if (project && !projectPackageResponseSchema.safeParse(raw).success) throw invalid()
    const parsed = catalogPackageResponseSchema.safeParse(raw)
    if (!parsed.success || parsed.data.data.revision !== revision || !catalogPackageMatches(parsed.data.data, source.slice(6), filePath, expectedDirectory)) throw invalid()
    return parsed.data.data
  } catch (error) {
    if (error instanceof HubClientError) throw error
    throw new HubClientError(signal?.aborted ? "aborted" : "network", "Installed Skill content request did not complete", null, response?.status ?? null)
  } finally { clearTimeout(timer); void response?.body?.cancel().catch(() => undefined) }
}

export async function inspectInstallationPackage(target: Target, filePath?: string, signal?: AbortSignal, expectedDirectory?: CatalogPackageData): Promise<CatalogPackageData> {
  return await read("package", target, filePath, expectedDirectory, signal) as CatalogPackageData
}
export async function downloadInstallationPackage(target: Target, signal?: AbortSignal): Promise<SkillDownload> {
  return await read("download", target, undefined, undefined, signal) as SkillDownload
}

export async function inspectManagedSkillPackage(target:{skill_id:string;revision:string}, filePath?:string, signal?:AbortSignal, expectedDirectory?:CatalogPackageData):Promise<CatalogPackageData>{
 return await read("managedPackage",{source_ref:`skill:${target.skill_id}`,revision:target.revision},filePath,expectedDirectory,signal) as CatalogPackageData
}

export async function downloadManagedSkillPackage(target: {skill_id: string; revision: string}, signal?: AbortSignal): Promise<SkillDownload> {
  return await read("managedDownload", {source_ref: `skill:${target.skill_id}`, revision: target.revision}, undefined, undefined, signal) as SkillDownload
}

export async function inspectProjectInstallationPackage(target: ProjectInstallationTarget, filePath?: string, signal?: AbortSignal, expectedDirectory?: CatalogPackageData): Promise<CatalogPackageData> {
  return await read("projectPackage", target, filePath, expectedDirectory, signal) as CatalogPackageData
}
export async function downloadProjectInstallationPackage(target: ProjectInstallationTarget, signal?: AbortSignal): Promise<SkillDownload> {
  return await read("projectDownload", target, undefined, undefined, signal) as SkillDownload
}
