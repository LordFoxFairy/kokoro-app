import { HubClientError, hasHubNoStoreDirective } from "./client"
import { catalogPackagePathSchema, catalogPackageResponseSchema, catalogPackageErrorSchema, catalogPackageMatches, installationIdSchema, installationSourceSchema, installationPackageErrorAllowed, type PersonalInstallation, type CatalogPackageData } from "./schemas"
import { skillDownloadSchema, skillDownloadErrorAllowed, type SkillDownload } from "./skill-download.schema"

type Target = Pick<PersonalInstallation, "installation_id" | "source_ref" | "revision">

/** Exact installation reads. No series fallback, token persistence, or implicit pin update. */
async function read(operation: "package" | "download", target: Target, filePath?: string, expectedDirectory?: CatalogPackageData, signal?: AbortSignal): Promise<CatalogPackageData | SkillDownload> {
  const id = installationIdSchema.parse(target.installation_id)
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
    response = await within(fetch(`/api/hub/skill-installations/${encodeURIComponent(id)}/${operation}${filePath === undefined ? "" : `?file_path=${encodeURIComponent(filePath)}`}`, {
      method: operation === "package" ? "GET" : "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal: joined, headers: { accept: "application/json" },
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
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { throw invalid() }
    joined.throwIfAborted()
    const retryAfter = response.headers.get("retry-after")
    if (retryAfter !== null && (response.status !== 429 || !/^[1-9][0-9]{0,4}(?![\s\S])/u.test(retryAfter))) throw invalid()
    if (response.status !== 200) {
      const parsed = catalogPackageErrorSchema.safeParse(raw)
      if (!parsed.success || !(operation === "package" ? installationPackageErrorAllowed(response.status, parsed.data.error.code, parsed.data.error.retryable, retryAfter) : skillDownloadErrorAllowed(response.status, parsed.data.error.code))) throw invalid()
      throw new HubClientError("http", parsed.data.error.message, parsed.data.error.code, response.status, parsed.data.error.retryable, response.headers.get("x-request-id"), retryAfter)
    }
    if (operation === "download") {
      const parsed = skillDownloadSchema.safeParse((raw as { data?: unknown } | null)?.data)
      if (!raw || typeof raw !== "object" || Object.keys(raw).length !== 1 || !parsed.success || parsed.data.source_ref !== source || parsed.data.revision !== revision || Date.parse(parsed.data.download_info.expires_at) <= Date.now()) throw invalid()
      return parsed.data
    }
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
