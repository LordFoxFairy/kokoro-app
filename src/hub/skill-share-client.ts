import { z } from "zod"
import { HubClientError, hasHubNoStoreDirective } from "./client"
import { shareSchemas, shareCreateSchema, shareIdSchema, shareAckSchema, shareRevisionSchema, shareErrorSchema, shareErrorAllowed, shareMatches, type ShareOperation } from "./skill-share.schema"

async function command<O extends ShareOperation>(operation: O, identity: string, origin: string, body?: z.infer<typeof shareCreateSchema>, signal?: AbortSignal): Promise<z.infer<(typeof shareSchemas)[O]>> {
  const encoded = body === undefined ? undefined : JSON.stringify(body)
  const controller = new AbortController()
  const joined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
  const timer = setTimeout(() => controller.abort(), 10_000)
  let response: Response | undefined
  const within = <T,>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(joined.reason)
    joined.addEventListener("abort", abort, { once: true })
    void work.then(resolve, reject).finally(() => joined.removeEventListener("abort", abort))
    if (joined.aborted) abort()
  })
  try {
    joined.throwIfAborted()
    response = await within(fetch(operation === "create" ? "/api/hub/skill-shares" : `/api/hub/skill-shares/${encodeURIComponent(identity)}${operation === "summary" ? "/skill" : operation === "download" ? "/download" : ""}`, {
      method: operation === "create" || operation === "download" ? "POST" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: joined,
      headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: encoded! }),
    }).then((value) => { if (joined.aborted) void value.body?.cancel().catch(() => undefined); return value }))
    joined.throwIfAborted()
    if (response === undefined) throw new HubClientError("network", "Skill Share response missing", null, null)
    const invalid = () => new HubClientError("parse", "invalid Skill Share response", null, response!.status)
    if (!hasHubNoStoreDirective(response.headers) || !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(response.headers.get("content-type") ?? "") || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(response.headers.get("x-request-id") ?? "") || response.body === null) throw invalid()
    const declared = response.headers.get("content-length")
    if (declared !== null && (!/^(0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > 1_048_576)) throw invalid()
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let count = 0
    const cancel = () => { void reader.cancel().catch(() => undefined) }
    joined.addEventListener("abort", cancel, { once: true })
    try {
      for (;;) {
        const part = await within(reader.read())
        joined.throwIfAborted()
        if (part.done) break
        count += part.value.byteLength
        if (count > 1_048_576) throw invalid()
        chunks.push(part.value)
      }
    } finally { joined.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock() }
    if (declared !== null && Number(declared) !== count) throw invalid()
    const bytes = new Uint8Array(count)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    let raw: unknown
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { throw invalid() }
    const retryAfter = response.headers.get("retry-after")
    if (retryAfter !== null && (response.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(retryAfter))) throw invalid()
    if (response.status !== (operation === "create" ? 201 : 200)) {
      const error = shareErrorSchema.safeParse(raw)
      if (!error.success || !shareErrorAllowed(operation, response.status, error.data.error.code)) throw invalid()
      throw new HubClientError("http", error.data.error.message, error.data.error.code, response.status, error.data.error.retryable, response.headers.get("x-request-id"), retryAfter)
    }
    const envelope = z.object({ data: shareSchemas[operation] }).strict().safeParse(raw)
    if (!envelope.success || envelope.data.data === undefined || !shareMatches(operation, envelope.data.data, identity, origin)) throw invalid()
    if (operation === "create" && body?.expires_at !== undefined && "expires_at" in envelope.data.data && (body.expires_at === null ? envelope.data.data.expires_at !== null : envelope.data.data.expires_at === null || Date.parse(body.expires_at) !== Date.parse(envelope.data.data.expires_at))) throw invalid()
    return envelope.data.data as z.infer<(typeof shareSchemas)[O]>
  } catch (error) {
    if (error instanceof HubClientError) throw error
    throw new HubClientError(signal?.aborted ? "aborted" : "network", "Skill Share request did not complete", null, null)
  } finally { clearTimeout(timer); void response?.body?.cancel().catch(() => undefined) }
}

export function createSkillShareClient(origin: string = window.location.origin) {
  return {
    create: (body: z.infer<typeof shareCreateSchema>, signal?: AbortSignal) => { const input = shareCreateSchema.parse(body); return command("create", input.source_ref, origin, input, signal) },
    resolve: (id: string, signal?: AbortSignal) => command("resolve", shareIdSchema.parse(id), origin, undefined, signal),
    download: async (id: string, sourceRef: string, revision: string, signal?: AbortSignal) => {
      const source = shareAckSchema.shape.source_ref.parse(sourceRef), version = shareRevisionSchema.parse(revision)
      const value = await command("download", shareIdSchema.parse(id), origin, undefined, signal)
      if (value.source_ref !== source || value.revision !== version) throw new HubClientError("parse", "Shared download revision mismatch", null, 200)
      return value
    },
    summary: (id: string, signal?: AbortSignal) => command("summary", shareIdSchema.parse(id), origin, undefined, signal),
  }
}
