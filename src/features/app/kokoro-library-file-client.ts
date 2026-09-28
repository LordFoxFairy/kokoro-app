import { libraryFileListResponseSchema } from "@/contract/library-file"

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
