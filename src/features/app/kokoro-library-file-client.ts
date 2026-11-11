import { isLibraryFileDeleteOwnerError, libraryFileAssetIdSchema, libraryFileDeleteErrorSchema, libraryFileDeleteKeySchema, libraryFileDeleteResponseSchema, libraryFileListResponseSchema } from "@/contract/library-file"
import { downloadFetchedFile, fileFetch } from "@/engine/file-fetch"
import {
  readVerifiedLibraryText,
  withLibraryPreviewDeadline,
  type LibraryTextPreviewResult,
} from "./kokoro-library-preview-content"

const PAGE_LIMIT = 50

export type LibraryFile = {
  assetId: string
  filename: string
  mimeType: string
  sizeBytes: string
  contentSha256: string
  createdAt: string
}

export type LibraryFilePage = { items: readonly LibraryFile[]; nextCursor: string | null }
export type LibraryFileType = "all" | "documents" | "images" | "media" | "other"
export type LibraryFileSearch = { query: string; type: LibraryFileType }

/** The owner validates the raw text before trim/NFC; count Unicode code points, not UTF-16 units. */
export function isLibraryFileSearchQuery(query: string): boolean {
  let length = 0
  for (const character of query) {
    const first = character.charCodeAt(0)
    if (++length > 200 || first <= 0x1f || first === 0x7f) return false
  }
  return true
}

export class LibraryFileDeleteError extends Error {
  constructor(readonly kind: "unknown" | "rejected" | "auth_required") {
    super(`library_file_delete_${kind}`)
    this.name = "LibraryFileDeleteError"
  }
}

/** BFF personal Library read; file identity and shape never pass through ArtifactRecord. */
export async function listLibraryFiles(cursor: string | null, signal: AbortSignal, search?: LibraryFileSearch): Promise<LibraryFilePage> {
  const query = new URLSearchParams({ kind: "file", limit: String(PAGE_LIMIT) })
  if (cursor !== null) query.set("cursor", cursor)
  if (search !== undefined) {
    if (!isLibraryFileSearchQuery(search.query)) throw new Error("library_files_invalid_query")
    if (search.query !== "") query.set("q", search.query)
    if (search.type !== "all") query.set("type", search.type)
  }
  const response = await fetch(`/api/hub/library?${query}`, { cache: "no-store", signal })
  if (!response.ok) throw new Error(`library_files_http_${response.status}`)
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error("library_files_invalid_response")
  }
  const parsed = libraryFileListResponseSchema.safeParse(payload)
  if (!parsed.success) throw new Error("library_files_invalid_response")
  return {
    items: parsed.data.data.items.map((item) => ({
      assetId: item.asset_id,
      filename: item.filename,
      mimeType: item.mime_type,
      sizeBytes: item.size_bytes,
      contentSha256: item.content_sha256,
      createdAt: item.created_at,
    })),
    nextCursor: parsed.data.data.next_cursor,
  }
}

function personalLibraryFileContentPath(assetId: string): string {
  return `/api/hub/library/files/${encodeURIComponent(assetId)}/content`
}

/** Preview only the bytes described by this authenticated personal Library row. */
export async function readPersonalLibraryFilePreview(
  file: Pick<LibraryFile, "assetId" | "mimeType" | "sizeBytes" | "contentSha256">,
  signal: AbortSignal,
): Promise<LibraryTextPreviewResult> {
  if (!libraryFileAssetIdSchema.safeParse(file.assetId).success) throw new Error("library_file_invalid_asset")
  return withLibraryPreviewDeadline(signal, deadline => readVerifiedLibraryText(
    personalLibraryFileContentPath(file.assetId), file, deadline,
  ))
}

/** Same-origin personal byte delivery; the file card, not ArtifactRecord, owns this intent. */
export async function downloadPersonalLibraryFile(file: LibraryFile, signal: AbortSignal): Promise<void> {
  if (!libraryFileAssetIdSchema.safeParse(file.assetId).success) throw new Error("library_file_invalid_asset")
  const expectedSize = Number(file.sizeBytes)
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > 1_048_576) throw new Error("library_file_invalid_size")
  const response = await fileFetch(personalLibraryFileContentPath(file.assetId), signal)
  if (!response.ok) {
    if (response.status === 404) throw new Error("library_file_not_found")
    if (response.status === 401 || response.status === 403) throw new Error("library_file_auth_required")
    throw new Error("library_file_download_failed")
  }
  const blob = await response.blob()
  if (signal.aborted) return
  if (blob.size !== expectedSize) throw new Error("library_file_invalid_size")
  const name = file.filename.replace(/[\u0000-\u001f\u007f/\\]/gu, "_").replace(/^\.+/u, "_").slice(0, 255) || "download"
  if (!await downloadFetchedFile(new Response(blob), name, signal)) {
    if (signal.aborted) return
    throw new Error("library_file_download_failed")
  }
}

/** Caller owns the intent. Transport never retries or treats missing files as an ACK. */
export async function deletePersonalLibraryFile(assetId: string, key: string, signal: AbortSignal): Promise<void> {
  if (!libraryFileAssetIdSchema.safeParse(assetId).success || !libraryFileDeleteKeySchema.safeParse(key).success)
    throw new LibraryFileDeleteError("rejected")
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(12_000)])
  let response: Response
  let payload: unknown
  try {
    deadline.throwIfAborted()
    response = await fetch(`/api/hub/library/files/${encodeURIComponent(assetId)}`, {
      method: "DELETE", headers: { "idempotency-key": key }, cache: "no-store", redirect: "error", signal: deadline,
    })
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers.get("content-type") ?? "") ||
      !response.headers.get("x-request-id") || !/\bno-store\b/iu.test(response.headers.get("cache-control") ?? ""))
      throw new LibraryFileDeleteError("unknown")
    payload = await response.json()
    deadline.throwIfAborted()
  } catch {
    throw new LibraryFileDeleteError("unknown")
  }
  if (response.status === 200) {
    const ack = libraryFileDeleteResponseSchema.safeParse(payload)
    if (!ack.success || ack.data.data.asset_id !== assetId) throw new LibraryFileDeleteError("unknown")
    return
  }
  const failure = libraryFileDeleteErrorSchema.safeParse(payload)
  if (failure.success && isLibraryFileDeleteOwnerError(response.status, failure.data.error.code, failure.data.error.retryable) && !failure.data.error.retryable) {
    if (response.status === 401 || response.status === 403) throw new LibraryFileDeleteError("auth_required")
    if ([400, 404, 409].includes(response.status)) throw new LibraryFileDeleteError("rejected")
  }
  throw new LibraryFileDeleteError("unknown")
}
