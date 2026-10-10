import { NextResponse } from "next/server"
import { z } from "zod"
import { shareErrorAllowed } from "@/hub/skill-share.schema"

import { admittedProductSession, productBffConfig, productBffHeaders } from "@/lib/server/product-bff"
import { requestWithDomain } from "@/lib/server/upstream-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const handlePattern = /^[A-Za-z0-9_-]{43}$/u
const MAX_ZIP_BYTES = 1024 * 1024 * 1024

export async function GET(request: Request, context: { params: Promise<{ handle: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID()
  const fail = (status: number, code: string) => NextResponse.json({ error: { code, message: code, retryable: status >= 500 } }, { status, headers: { "cache-control": "private, no-store", "x-request-id": requestId } })
  const deadline = new AbortController(), signal = AbortSignal.any([deadline.signal, request.signal])
  const timer = setTimeout(() => deadline.abort(new Error("Skill download deadline exceeded")), 10_000)
  const cleanup = () => clearTimeout(timer)
  const within = <T,>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("Skill download cancelled"))
    if (signal.aborted) { abort(); return }
    signal.addEventListener("abort", abort, { once: true })
    work.then(value => { signal.removeEventListener("abort", abort); resolve(value) }, error => { signal.removeEventListener("abort", abort); reject(error) })
  })
  let upstream: Response | undefined, streaming = false
  try {
    const { handle } = await within(context.params), url = new URL(request.url)
    if (!handlePattern.test(handle)) return fail(404, "skill_download_not_found")
    if (url.pathname !== `/api/skill-downloads/${handle}` || url.search || url.hash || request.body !== null || ["content-length", "transfer-encoding", "idempotency-key"].some(name => request.headers.has(name))) return fail(400, "invalid_skill_request")
    const config = productBffConfig()
    if (config === null) return fail(503, "skill_dependency_unavailable")
    if (request.headers.has("origin") && request.headers.get("origin") !== config.session.webOrigin) return fail(403, "session_forbidden")
    const claims = await within(admittedProductSession(request, config)).catch(error => { if (signal.aborted) throw error; return undefined })
    if (claims === undefined) return fail(503, "iam_admission_unavailable")
    if (claims === null) return fail(401, "session_authentication_required")
    const pending = requestWithDomain(`${config.bffBaseUrl.replace(/\/+$/u, "")}/skill-downloads/${handle}`, config.domain, {
      method: "GET", headers: Object.fromEntries(productBffHeaders(config, claims, requestId)), signal,
      timeoutMs: 10_000, streamTotalTimeoutMs: 10_000, maxResponseBytes: MAX_ZIP_BYTES, maxErrorResponseBytes: 1_048_576, strictResponseLength: true,
    })
    void pending.then(value => { if (signal.aborted) void value.body?.cancel().catch(() => undefined) }, () => undefined)
    upstream = await within(pending)
    signal.throwIfAborted()
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(upstream.headers.get("x-request-id") ?? "") || !/\bno-store\b/iu.test(upstream.headers.get("cache-control") ?? "")) return fail(502, "skill_response_invalid")
    if (upstream.status !== 200) {
      // Error JSON is never presented as an attachment; redirects are never followed.
      if (![400, 401, 403, 404, 405, 410, 429, 502, 503, 504].includes(upstream.status) || !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(upstream.headers.get("content-type") ?? "") || upstream.body === null) return fail(502, "skill_response_invalid")
      const declared = upstream.headers.get("content-length")
      if (declared !== null && (!/^(0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > 1_048_576)) return fail(502, "skill_response_invalid")
      const reader = upstream.body.getReader(), chunks: Uint8Array[] = []
      let count = 0
      const abort = () => { void reader.cancel().catch(() => undefined) }
      signal.addEventListener("abort", abort, { once: true })
      try {
        for (;;) { const part = await within(reader.read()); signal.throwIfAborted(); if (part.done) break; count += part.value.byteLength; if (count > 1_048_576) return fail(502, "skill_response_invalid"); chunks.push(part.value) }
      } finally { signal.removeEventListener("abort", abort); void reader.cancel().catch(() => undefined); reader.releaseLock() }
      if (declared !== null && Number(declared) !== count) return fail(502, "skill_response_invalid")
      const bytes = new Uint8Array(count); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      let raw: unknown
      try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { return fail(502, "skill_response_invalid") }
      const parsed = z.object({ error: z.object({ code: z.string().min(1), message: z.string().min(1), retryable: z.boolean().optional() }).strict() }).strict().safeParse(raw)
      const bare: Readonly<Record<number, readonly string[]>> = { 401: ["Unauthenticated"], 403: ["PermissionDenied"], 404: ["NotFound"], 405: ["MethodNotAllowed"], 410: ["Gone"] }
      if (!parsed.success || !(shareErrorAllowed("download", upstream.status, parsed.data.error.code) || bare[upstream.status]?.includes(parsed.data.error.code))) return fail(502, "skill_response_invalid")
      return NextResponse.json(raw, { status: upstream.status, headers: { "cache-control": "private, no-store", "x-request-id": requestId } })
    }
    const length = upstream.headers.get("content-length"), attachment = upstream.headers.get("content-disposition")
    const match = /^attachment; filename="skill\.zip"; filename\*=UTF-8''(.+)$/u.exec(attachment ?? "")
    let filename = ""
    try { filename = match ? decodeURIComponent(match[1]!) : "" } catch { /* Invalid UTF-8 attachment metadata. */ }
    if (upstream.headers.get("content-type") !== "application/zip" || length === null || !/^[1-9][0-9]*$/u.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > MAX_ZIP_BYTES || !filename || filename.length > 255 || /[\\/\u0000-\u001f\u007f]/u.test(filename) || !/\bno-store\b/iu.test(upstream.headers.get("cache-control") ?? "") || upstream.body === null) return fail(502, "skill_response_invalid")
    const reader = upstream.body.getReader()
    let count = 0, done = false
    let output: ReadableStreamDefaultController<Uint8Array>
    const finish = () => { if (done) return; done = true; cleanup(); signal.removeEventListener("abort", abort); void reader.cancel().catch(() => undefined).finally(() => reader.releaseLock()) }
    const abort = () => { if (!done) { output.error(signal.reason ?? new Error("Skill download cancelled")); finish() } }
    const body = new ReadableStream<Uint8Array>({
      start(controller) { output = controller; signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort() },
      async pull(controller) {
        try {
          const part = await within(reader.read()); signal.throwIfAborted()
          if (done) return
          if (part.done) { if (count !== Number(length)) throw new Error("Incomplete Skill ZIP"); controller.close(); finish(); return }
          count += part.value.byteLength
          if (count > Number(length) || count > MAX_ZIP_BYTES) throw new Error("Skill ZIP exceeds its declared size")
          controller.enqueue(part.value)
        } catch (error) { if (!done) { controller.error(error); finish() } }
      },
      cancel() { finish() },
    })
    streaming = true
    return new Response(body, { headers: { "content-type": "application/zip", "content-length": length, "content-disposition": attachment!, "cache-control": "private, no-store", "x-request-id": requestId, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } })
  } catch { return fail(deadline.signal.aborted ? 504 : 503, deadline.signal.aborted ? "skill_deadline_exceeded" : "skill_dependency_unavailable") }
  finally { if (!streaming) { cleanup(); void upstream?.body?.cancel().catch(() => undefined) } }
}
