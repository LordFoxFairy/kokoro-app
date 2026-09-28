import { libraryFileUploadResponseSchema } from "@/contract/library-file"

const MAX_MULTIPART_BYTES = 1024 * 1024

export class LibraryFileUploadError extends Error {
  constructor(readonly code: string, readonly retryable: boolean, readonly status?: number) {
    super(code)
    this.name = "LibraryFileUploadError"
  }
}

/** Measure a clone of the native multipart request, then transmit the untouched original. */
export async function uploadLibraryFile(file: File, key: string, signal: AbortSignal): Promise<string> {
  if (file.size > MAX_MULTIPART_BYTES) throw new LibraryFileUploadError("request_body_too_large", false, 413)
  const form = new FormData()
  form.append("files", file)
  const request = new Request(new URL("/api/hub/library/files", window.location.origin), {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: form,
    cache: "no-store",
    signal,
  })
  const bytes = await request.clone().arrayBuffer()
  if (bytes.byteLength > MAX_MULTIPART_BYTES) throw new LibraryFileUploadError("request_body_too_large", false, 413)

  let response: Response
  try {
    response = await fetch(request)
  } catch {
    throw new LibraryFileUploadError("upload_network_error", true)
  }
  if (!response.ok) {
    let code = `upload_http_${response.status}`
    try {
      const payload: unknown = await response.json()
      if (payload !== null && typeof payload === "object" && "error" in payload) {
        const error = payload.error
        if (typeof error === "string") code = error
        else if (error !== null && typeof error === "object" && "code" in error && typeof error.code === "string") code = error.code
      }
    } catch { /* Retain the HTTP status if the error body is unavailable. */ }
    const retryable = response.status >= 500 || response.status === 408 || response.status === 429
      || (response.status === 409 && code === "idempotency_in_progress")
    throw new LibraryFileUploadError(code, retryable, response.status)
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new LibraryFileUploadError("upload_invalid_response", true)
  }
  const parsed = libraryFileUploadResponseSchema.safeParse(payload)
  if (!parsed.success) throw new LibraryFileUploadError("upload_invalid_response", true)
  const uploaded = parsed.data.data.file
  if (uploaded.filename !== file.name || uploaded.size_bytes !== String(file.size))
    throw new LibraryFileUploadError("upload_receipt_mismatch", true)
  return uploaded.asset_id
}
