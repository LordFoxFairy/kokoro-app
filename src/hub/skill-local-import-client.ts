import { z } from "zod"
import { HubClientError, hasHubNoStoreDirective } from "./client"
import { putSkillPackage } from "./skill-package-transfer"
import { localImportBeginRequestSchema, localImportCompleteRequestSchema, localImportIdSchema, localImportKeySchema, localImportSchemas, localImportErrorSchema, localImportErrorAllowed, localImportMatches, type LocalImportOperation, type PackageTransfer } from "./skill-local-import.schema"

async function command<O extends LocalImportOperation>(operation: O, id?: string, body?: z.infer<typeof localImportBeginRequestSchema> | z.infer<typeof localImportCompleteRequestSchema>, key?: string, signal?: AbortSignal): Promise<z.infer<(typeof localImportSchemas)[O]>> {
  if (id !== undefined) localImportIdSchema.parse(id)
  if (operation !== "get") localImportKeySchema.parse(key)
  const controller = new AbortController()
  const joined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
  const timer = setTimeout(() => controller.abort(), operation === "finalize" ? 20_000 : 10_000)
  let response: Response | undefined
  const within = <T,>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(joined.reason)
    joined.addEventListener("abort", abort, { once: true })
    void work.then(resolve, reject).finally(() => joined.removeEventListener("abort", abort))
    if (joined.aborted) abort()
  })
  try {
    joined.throwIfAborted()
    const suffix = operation === "begin" ? "" : `/${encodeURIComponent(id!)}${operation === "get" ? "" : `/${operation}`}`
    response = await within(fetch(`/api/hub/skills/local-imports${suffix}`, {
      method: operation === "get" ? "GET" : "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal: joined,
      headers: { accept: "application/json", ...(key === undefined ? {} : { "idempotency-key": key }), ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }).then((value) => { if (joined.aborted) void value.body?.cancel().catch(() => undefined); return value }))
    joined.throwIfAborted()
    if (response === undefined) throw new HubClientError("network", "local import response missing", null, null)
    const invalid = () => new HubClientError("parse", "invalid local import response", null, response!.status)
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
    if (response.status !== (operation === "begin" ? 201 : 200)) {
      const error = localImportErrorSchema.safeParse(raw)
      if (!error.success || !localImportErrorAllowed(operation, response.status, error.data.error.code)) throw invalid()
      throw new HubClientError("http", error.data.error.message, error.data.error.code, response.status)
    }
    const envelope = z.object({ data: localImportSchemas[operation] }).strict().safeParse(raw)
    if (!envelope.success || !localImportMatches(operation, envelope.data.data, id, operation === "complete" ? localImportCompleteRequestSchema.parse(body) : undefined)) throw invalid()
    return envelope.data.data as z.infer<(typeof localImportSchemas)[O]>
  } catch (error) {
    if (error instanceof HubClientError) throw error
    throw new HubClientError(signal?.aborted ? "aborted" : "network", "local import request did not complete", null, null)
  } finally { clearTimeout(timer); void response?.body?.cancel().catch(() => undefined) }
}

export function createSkillLocalImportClient(pageUrl = globalThis.location?.href ?? "https://localhost/") {
  return {
    begin: (body: z.infer<typeof localImportBeginRequestSchema>, key: string, signal?: AbortSignal) => command("begin", undefined, localImportBeginRequestSchema.parse(body), key, signal),
    complete: (id: string, body: z.infer<typeof localImportCompleteRequestSchema>, key: string, signal?: AbortSignal) => command("complete", id, localImportCompleteRequestSchema.parse(body), key, signal),
    finalize: (id: string, key: string, signal?: AbortSignal) => command("finalize", id, undefined, key, signal),
    get: (id: string, signal?: AbortSignal) => command("get", id, undefined, undefined, signal),
    putPackage: (reference: PackageTransfer, file: File, signal?: AbortSignal) => putSkillPackage(reference, file, pageUrl, 20_000, signal),
  }
}
