const MAX_BYTES = 65_536
const MIME_TYPES = new Set(["text/plain", "text/markdown", "text/csv"])

export type LibraryTextPreviewResult =
  | { kind: "text"; text: string; mimeType: string; sizeBytes: string }
  | { kind: "unsupported" }

type PreviewMetadata = Readonly<{ mimeType: string; sizeBytes: string; contentSha256: string }>

export function isLibraryTextPreviewSupported(mimeType: string, sizeBytes: string | number): boolean {
  if (typeof sizeBytes === "string" && !/^(?:0|[1-9][0-9]*)$/u.test(sizeBytes)) return false
  const count = Number(sizeBytes)
  return MIME_TYPES.has(mimeType) && Number.isSafeInteger(count) && count >= 0 && count <= MAX_BYTES
}

/** Called only with the existing same-origin owner content path. Read one complete, verified UTF-8 file. */
export async function readVerifiedLibraryText(path: string, metadata: PreviewMetadata, signal: AbortSignal): Promise<LibraryTextPreviewResult> {
  signal.throwIfAborted()
  const { mimeType, sizeBytes, contentSha256 } = metadata
  if (!isLibraryTextPreviewSupported(mimeType, sizeBytes)) return { kind: "unsupported" }
  if (!/^[0-9a-f]{64}$/u.test(contentSha256)) throw new Error("library_preview_invalid_digest")
  const response = await fetch(path, { cache: "no-store", redirect: "error", signal })
  if (signal.aborted) void response.body?.cancel().catch(() => undefined)
  signal.throwIfAborted()
  if (response.status !== 200 || response.headers.get("content-length") !== sizeBytes ||
    response.headers.get("content-type")?.toLowerCase() !== mimeType || response.body === null) {
    void response.body?.cancel().catch(() => undefined)
    throw new Error("library_preview_invalid_response")
  }

  const bytes = await readVerifiedPrivateBytes(response.body, Number(sizeBytes), contentSha256, signal)
  return { kind: "text", text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), mimeType, sizeBytes }
}

/** Complete bounded bytes must match the admitted owner metadata before use. */
export async function readVerifiedPrivateBytes(body: ReadableStream<Uint8Array>, size: number, contentSha256: string, signal: AbortSignal) {
  const bytes = new Uint8Array(size)
  const reader = body.getReader()
  const cancel = () => { void reader.cancel().catch(() => undefined) }
  signal.addEventListener("abort", cancel, { once: true })
  let offset = 0
  let ended = false
  try {
    for (;;) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) { ended = true; break }
      if (value.byteLength > bytes.length - offset) throw new Error("library_preview_too_large")
      bytes.set(value, offset)
      offset += value.byteLength
    }
    if (offset !== bytes.length) throw new Error("library_preview_incomplete")
    const digest = await crypto.subtle.digest("SHA-256", bytes)
    signal.throwIfAborted()
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
    if (sha256 !== contentSha256) throw new Error("library_preview_digest_mismatch")
    return bytes
  } finally {
    signal.removeEventListener("abort", cancel)
    if (!ended) cancel()
    reader.releaseLock()
  }
}

/** One total budget covers optional metadata, content EOF, and asynchronous verification. */
export async function withLibraryPreviewDeadline<T>(signal: AbortSignal, read: (boundedSignal: AbortSignal) => Promise<T>): Promise<T> {
  signal.throwIfAborted()
  const controller = new AbortController()
  const relay = () => controller.abort(signal.reason)
  signal.addEventListener("abort", relay, { once: true })
  let rejectAbort!: () => void
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason)
    controller.signal.addEventListener("abort", rejectAbort, { once: true })
  })
  const timer = setTimeout(() => controller.abort(new DOMException("Preview deadline exceeded", "TimeoutError")), 10_000)
  try {
    return await Promise.race([read(controller.signal), aborted])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener("abort", relay)
    controller.signal.removeEventListener("abort", rejectAbort)
  }
}
