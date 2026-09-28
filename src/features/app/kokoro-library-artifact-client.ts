import { libraryArtifactDetailResponseSchema, libraryArtifactListResponseSchema, type LibraryArtifactWire } from "@/contract/library-artifact"

export type LibraryArtifact = {
  conversationId: string
  artifactId: string
  assetId: string
  artifactKind: LibraryArtifactWire["artifact_kind"]
  title: string
  filename: string
  mimeType: string
  sizeBytes: string
  deliveredAt: string
}

export type LibraryArtifactPage = { items: readonly LibraryArtifact[]; nextCursor: string | null }
export type LibraryArtifactSelector = Pick<LibraryArtifact, "conversationId" | "artifactId">

function mapArtifact(item: LibraryArtifactWire): LibraryArtifact {
  return {
    conversationId: item.conversation_id,
    artifactId: item.artifact_id,
    assetId: item.asset_id,
    artifactKind: item.artifact_kind,
    title: item.title,
    filename: item.filename,
    mimeType: item.mime_type,
    sizeBytes: item.size_bytes,
    deliveredAt: item.delivered_at,
  }
}

function artifactPath(selector: LibraryArtifactSelector): string {
  for (const id of [selector.conversationId, selector.artifactId]) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(id)) throw new Error("library_artifact_invalid_selector")
  }
  return `/api/hub/library/artifacts/${encodeURIComponent(selector.conversationId)}/${encodeURIComponent(selector.artifactId)}`
}

async function parsedResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    if (response.status === 404) throw new Error("library_artifact_not_found")
    if (response.status === 401 || response.status === 403) throw new Error("library_artifact_auth_required")
    throw new Error(`library_artifact_http_${response.status}`)
  }
  try {
    return await response.json()
  } catch {
    throw new Error("library_artifacts_invalid_response")
  }
}

/** A BFF page, not an alias for the old session/hash ArtifactRecord. */
export async function listLibraryArtifacts(cursor: string | null, signal: AbortSignal): Promise<LibraryArtifactPage> {
  const query = new URLSearchParams({ kind: "artifact", limit: "50" })
  if (cursor !== null) query.set("cursor", cursor)
  const response = await fetch(`/api/hub/library?${query}`, { cache: "no-store", signal })
  const parsed = libraryArtifactListResponseSchema.safeParse(await parsedResponse(response))
  if (!parsed.success) throw new Error("library_artifacts_invalid_response")
  return { items: parsed.data.data.items.map(mapArtifact), nextCursor: parsed.data.data.next_cursor }
}

export async function getLibraryArtifact(conversationId: string, artifactId: string, signal: AbortSignal): Promise<LibraryArtifact> {
  const response = await fetch(artifactPath({ conversationId, artifactId }), { cache: "no-store", signal })
  const parsed = libraryArtifactDetailResponseSchema.safeParse(await parsedResponse(response))
  if (!parsed.success || parsed.data.data.conversation_id !== conversationId || parsed.data.data.artifact_id !== artifactId) {
    throw new Error("library_artifacts_invalid_response")
  }
  return mapArtifact(parsed.data.data)
}

/** Native same-origin attachment: launch only; browser download completion is not observable here. */
export async function beginLibraryArtifactDownload(selector: LibraryArtifactSelector, signal: AbortSignal): Promise<void> {
  const detail = await getLibraryArtifact(selector.conversationId, selector.artifactId, signal)
  if (signal.aborted) throw new DOMException("Download cancelled", "AbortError")
  const anchor = document.createElement("a")
  anchor.href = `${artifactPath(selector)}/content`
  anchor.download = detail.filename.replace(/[\u0000-\u001f\u007f/\\]/gu, "_").replace(/^\.+/u, "_").slice(0, 255) || "download"
  anchor.hidden = true
  document.body.append(anchor)
  try {
    if (signal.aborted) throw new DOMException("Download cancelled", "AbortError")
    anchor.click()
  } finally {
    anchor.remove()
  }
}
