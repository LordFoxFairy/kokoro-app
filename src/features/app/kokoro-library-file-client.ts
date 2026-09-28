import { libraryFileListResponseSchema } from "@/contract/library-file"
import { downloadFetchedFile, fileFetch } from "@/engine/file-fetch"

const PAGE_LIMIT = 50

export type LibraryFile = {
  assetId: string
  filename: string
  mimeType: string
  sizeBytes: string
  createdAt: string
}

export type LibraryFilePage = { items: readonly LibraryFile[]; nextCursor: string | null }

/** BFF personal Library read; file identity and shape never pass through ArtifactRecord. */
export async function listLibraryFiles(cursor: string | null, signal: AbortSignal): Promise<LibraryFilePage> {
  const query = new URLSearchParams({ kind: "file", limit: String(PAGE_LIMIT) })
  if (cursor !== null) query.set("cursor", cursor)
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
      createdAt: item.created_at,
    })),
    nextCursor: parsed.data.data.next_cursor,
  }
}

/** Same-origin personal byte delivery; the file card, not ArtifactRecord, owns this intent. */
export async function downloadPersonalLibraryFile(file: LibraryFile, signal: AbortSignal): Promise<void> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(file.assetId)) throw new Error("library_file_invalid_asset")
  const expectedSize = Number(file.sizeBytes)
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > 1_048_576) throw new Error("library_file_invalid_size")
  const response = await fileFetch(`/api/hub/library/files/${encodeURIComponent(file.assetId)}/content`, signal)
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
