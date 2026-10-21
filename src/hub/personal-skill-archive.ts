import { HubClientError, hasHubNoStoreDirective } from "./client"
import { downloadManagedSkillPackage } from "./skill-installation-content"

/** Retrieve the original qualified ZIP, including non-text entries, only into this intent's memory. */
export async function downloadManagedSkillArchive(target: { skill_id: string; revision: string; archive_size: string }, signal?: AbortSignal): Promise<File> {
  if (!/^[1-9][0-9]{0,7}(?![\s\S])/u.test(target.archive_size) || Number(target.archive_size) > 33_554_432) throw new HubClientError("parse", "Invalid historical package size", null, null)
  const size = Number(target.archive_size), deadline = new AbortController()
  const joined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal
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
    const qualified = await within(downloadManagedSkillPackage(target, joined))
    joined.throwIfAborted()
    response = await within(fetch(`/api${qualified.download_info.download_url}`, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: joined, headers: { accept: "application/zip" } }).then(value => {
      if (joined.aborted) void value.body?.cancel().catch(() => undefined)
      return value
    }))
    joined.throwIfAborted()
    if (!response) throw new HubClientError("network", "Historical package read did not complete", null, null)
    if (!response.ok) throw new HubClientError("http", "Historical package could not be read", null, response.status, response.status >= 500)
    const invalid = () => new HubClientError("parse", "Invalid historical ZIP response", null, response?.status ?? null)
    if (response.status !== 200 || response.body === null || !hasHubNoStoreDirective(response.headers)
      || response.headers.get("content-type") !== "application/zip"
      || response.headers.get("content-length") !== String(size)
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}(?![\s\S])/u.test(response.headers.get("x-request-id") ?? "")
      || !/^attachment;/iu.test(response.headers.get("content-disposition") ?? "")
      || ![null, "identity"].includes(response.headers.get("content-encoding"))) throw invalid()
    const reader = response.body.getReader(), bytes = new Uint8Array(size)
    let offset = 0
    const cancel = () => { void reader.cancel().catch(() => undefined) }
    joined.addEventListener("abort", cancel, { once: true })
    try {
      for (;;) {
        const part = await within(reader.read()); joined.throwIfAborted()
        if (part.done) break
        if (offset + part.value.byteLength > size) throw invalid()
        bytes.set(part.value, offset); offset += part.value.byteLength
      }
    } finally { joined.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock() }
    if (offset !== size) throw invalid()
    return new File([bytes], "skill-history.zip", { type: "application/zip" })
  } catch (error) {
    if (signal?.aborted) throw new HubClientError("aborted", "Historical package read cancelled", null, null)
    if (deadline.signal.aborted) throw new HubClientError("network", "Historical package read did not complete", null, null)
    if (error instanceof HubClientError) throw error
    throw new HubClientError("network", "Historical package read did not complete", null, response?.status ?? null)
  } finally { clearTimeout(timer); void response?.body?.cancel().catch(() => undefined) }
}
