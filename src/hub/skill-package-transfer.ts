import { HubClientError } from "./client"
import { packageSourceVersionSchema, packageTransferSchema, type PackageTransfer } from "./skill-local-import.schema"

/** Transfer only owner-signed headers and retain the real object version ACK. */
export async function putSkillPackage(reference: PackageTransfer, file: File, pageUrl: string, timeoutMs: 20_000 | 60_000, signal?: AbortSignal): Promise<{ source_version_id: string }> {
  const parsed = packageTransferSchema.safeParse(reference)
  if (!parsed.success) throw new HubClientError("parse", "invalid transfer reference", null, null)
  let url: URL
  let page: URL
  try { url = new URL(reference.url); page = new URL(pageUrl) } catch { throw new HubClientError("parse", "invalid transfer reference", null, null) }
  const loopback = (host: string) => ["localhost", "127.0.0.1", "[::1]"].includes(host)
  const local = page.protocol === "http:" && loopback(page.hostname) && url.protocol === "http:" && loopback(url.hostname)
  if ((url.protocol !== "https:" && !local) || url.username || url.password || url.hash || Date.parse(reference.expires_at) <= Date.now()) throw new HubClientError("parse", "unsafe or expired transfer reference", null, null)
  const deadline = new AbortController()
  const joined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal
  const timer = setTimeout(() => deadline.abort(), timeoutMs)
  let response: Response | undefined
  let abort: (() => void) | undefined
  try {
    joined.throwIfAborted()
    response = await new Promise<Response>((resolve, reject) => {
      abort = () => reject(joined.reason)
      joined.addEventListener("abort", abort, { once: true })
      void fetch(url.href, { method: "PUT", body: file, headers: reference.required_headers, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", mode: "cors", signal: joined }).then((value) => {
        if (joined.aborted) { void value.body?.cancel().catch(() => undefined); return }
        resolve(value)
      }, reject)
      if (joined.aborted) abort()
    })
    joined.throwIfAborted()
    if (!response.ok) throw new HubClientError("http", "package transfer rejected", null, response.status)
    const proof = packageSourceVersionSchema.safeParse(response.headers.get("x-amz-version-id"))
    if (!proof.success) throw new HubClientError("parse", "package transfer version ACK missing or invalid", null, response.status)
    return { source_version_id: proof.data }
  } catch (error) {
    if (error instanceof HubClientError) throw error
    throw new HubClientError(signal?.aborted ? "aborted" : "network", "package transfer did not complete", null, null)
  } finally {
    clearTimeout(timer)
    if (abort) joined.removeEventListener("abort", abort)
    void response?.body?.cancel().catch(() => undefined)
  }
}
