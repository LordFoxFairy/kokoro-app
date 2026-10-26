import { projectDownloadBrowserCache, projectDownloadHeadersValid, projectDownloadIntentSchema,
  projectDownloadMaxBytes, projectDownloadMetadata, type ProjectResourceDownloadIntent } from "@/contract/project-resource-download"

export class ProjectResourceDownloadError extends Error {
  constructor(readonly code: string) { super(code); this.name = "ProjectResourceDownloadError" }
}

/** A single bounded read. Creating object URLs or reporting UI success belongs to its current intent owner. */
export async function downloadProjectResource(intent: ProjectResourceDownloadIntent, signal: AbortSignal): Promise<Blob> {
  if (!projectDownloadIntentSchema.safeParse(intent).success) throw new ProjectResourceDownloadError("invalid_metadata")
  const deadline = performance.now() + 40_000, controller = new AbortController()
  let retired = false, response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let fault = "network_error", rejectInterrupt: (reason: Error) => void = () => {}
  const interrupted = new Promise<never>((_, reject) => { rejectInterrupt = reject })
  const stop = () => {
    controller.abort()
    if (reader) { void reader.cancel().catch(() => undefined); try { reader.releaseLock() } catch {} reader = undefined }
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined)
  }
  const abort = () => { fault = "request_aborted"; stop(); rejectInterrupt(new ProjectResourceDownloadError(fault)) }
  const timer = setTimeout(() => { fault = "request_timeout"; stop(); rejectInterrupt(new ProjectResourceDownloadError(fault)) }, 40_000)
  signal.addEventListener("abort", abort, { once: true })
  if (signal.aborted) abort()
  const check = () => {
    if (signal.aborted) fault = "request_aborted"
    else if (performance.now() >= deadline) fault = "request_timeout"
    if (retired || controller.signal.aborted || signal.aborted || performance.now() >= deadline) { stop(); throw new ProjectResourceDownloadError(fault) }
  }
  const operation = async () => {
    check()
    response = await fetch(`/api/hub/projects/${encodeURIComponent(intent.projectRef)}/resources/${encodeURIComponent(intent.assetId)}/content`, {
      method: "GET", cache: "no-store", redirect: "error", signal: controller.signal,
    })
    check()
    if (response.status !== 200 || !projectDownloadHeadersValid(response.headers, "browser")
      || response.headers.get("cache-control") !== projectDownloadBrowserCache) throw new ProjectResourceDownloadError("invalid_response")
    const metadata = projectDownloadMetadata(response.headers)
    if (!metadata || metadata.filename !== intent.filename || metadata.mimeType !== intent.mimeType
      || String(metadata.length) !== intent.sizeBytes) throw new ProjectResourceDownloadError("invalid_metadata")
    const bytes = new Uint8Array(metadata.length)
    let count = 0
    if (response.body) {
      reader = response.body.getReader()
      for (;;) {
        check()
        const part = await reader.read()
        check()
        if (part.done) break
        count += part.value.byteLength
        if (count > metadata.length || count > projectDownloadMaxBytes) throw new ProjectResourceDownloadError("invalid_length")
        bytes.set(part.value, count - part.value.byteLength)
      }
      reader.releaseLock(); reader = undefined
    }
    if (count !== metadata.length) throw new ProjectResourceDownloadError("invalid_length")
    const digest = await crypto.subtle.digest("SHA-256", bytes)
    check()
    if (Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("") !== intent.contentSha256) throw new ProjectResourceDownloadError("invalid_sha256")
    return new Blob([bytes], { type: metadata.mimeType })
  }
  try { return await Promise.race([interrupted, operation()]) }
  finally { retired = true; clearTimeout(timer); signal.removeEventListener("abort", abort); stop() }
}
