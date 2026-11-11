import { readVerifiedLibraryText, withLibraryPreviewDeadline, type LibraryTextPreviewResult } from "./kokoro-library-preview-content"
import type { LibraryArtifactQuery } from "./kokoro-library-model"
import { libraryArtifactDetailResponseSchema, libraryArtifactListResponseSchema, type LibraryArtifactDetailWire, type LibraryArtifactWire } from "@/contract/library-artifact"
import {
  isLibraryArtifactDeleteOwnerError, libraryArtifactConversationIdSchema, libraryArtifactDeleteErrorSchema,
  libraryArtifactDeleteKeySchema, libraryArtifactDeleteResponseSchema, libraryArtifactFavoriteResponseSchema, libraryArtifactIdSchema,
} from "@/generated/bff-library-artifact-mutations"

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
  sourceRunId: string
  contentSha256: string
  favorited: boolean
}

export type LibraryArtifactDetailView = LibraryArtifact & { projectRef?: string | null }

export type LibraryArtifactClient = { getArtifact?: typeof getLibraryArtifact; listArtifacts: typeof listLibraryArtifacts }

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
    sourceRunId: item.source_run_id,
    contentSha256: item.content_sha256,
    favorited: item.favorited,
  }
}

export function matchesLibraryArtifact(selected: LibraryArtifact, detail: LibraryArtifactDetailView): boolean {
  return detail.conversationId === selected.conversationId &&
    detail.artifactId === selected.artifactId &&
    detail.assetId === selected.assetId &&
    detail.sourceRunId === selected.sourceRunId &&
    detail.contentSha256 === selected.contentSha256
}

function artifactPath(selector: LibraryArtifactSelector): string {
  if (!libraryArtifactConversationIdSchema.safeParse(selector.conversationId).success ||
    !libraryArtifactIdSchema.safeParse(selector.artifactId).success) throw Error("library_artifact_invalid_selector")
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
export async function listLibraryArtifacts(cursor: string | null, signal: AbortSignal, filter: LibraryArtifactQuery): Promise<LibraryArtifactPage> {
  const query = new URLSearchParams({ kind: "artifact", limit: "50" })
  if (cursor !== null) query.set("cursor", cursor)
  if (filter.query !== "") query.set("q", filter.query)
  if (filter.type !== "all") query.set("type", filter.type)
  if (filter.favoritesOnly === true) query.set("favorites_only", "true")
  const response = await fetch(`/api/hub/library?${query}`, { cache: "no-store", signal })
  const parsed = libraryArtifactListResponseSchema.safeParse(await parsedResponse(response))
  if (!parsed.success) throw new Error("library_artifacts_invalid_response")
  return { items: parsed.data.data.items.map(mapArtifact), nextCursor: parsed.data.data.next_cursor }
}

async function readArtifactWire(selector: LibraryArtifactSelector, signal: AbortSignal): Promise<LibraryArtifactDetailWire> {
  signal.throwIfAborted()
  const response = await fetch(artifactPath(selector), { cache: "no-store", redirect: "error", signal })
  if (signal.aborted) void response.body?.cancel().catch(() => undefined)
  signal.throwIfAborted()
  const parsed = libraryArtifactDetailResponseSchema.safeParse(await parsedResponse(response))
  if (!parsed.success || parsed.data.data.conversation_id !== selector.conversationId || parsed.data.data.artifact_id !== selector.artifactId) {
    throw new Error("library_artifacts_invalid_response")
  }
  signal.throwIfAborted()
  return parsed.data.data
}

export async function getLibraryArtifact(conversationId: string, artifactId: string, signal: AbortSignal): Promise<LibraryArtifactDetailView> {
  const detail = await readArtifactWire({ conversationId, artifactId }, signal)
  return { ...mapArtifact(detail), ...(detail.project_ref === undefined ? {} : { projectRef: detail.project_ref }) }
}

async function mutateArtifact(selector: LibraryArtifactSelector, suffix: string, init: RequestInit, signal: AbortSignal) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(23_000)])
  try {
    deadline.throwIfAborted()
    const response = await fetch(`${artifactPath(selector)}${suffix}`, { ...init, cache: "no-store", redirect: "error", signal: deadline })
    deadline.throwIfAborted()
    const requestId = response.headers.get("x-request-id")
    if (!requestId || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers.get("content-type") ?? "") ||
      !/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(response.headers.get("cache-control") ?? "")) {
      void response.body?.cancel().catch(() => undefined)
      return null
    }
    const payload: unknown = await response.json()
    deadline.throwIfAborted()
    return { status: response.status, requestId, payload }
  } catch {
    return null
  }
}

function matchesSelector(data: { conversation_id: string; artifact_id: string }, selector: LibraryArtifactSelector): boolean {
  return data.conversation_id === selector.conversationId && data.artifact_id === selector.artifactId
}

/** An absolute target value; the browser does not toggle or retry on the owner's behalf. */
export async function setLibraryArtifactFavorite(selector: LibraryArtifactSelector, favorited: boolean, signal: AbortSignal): Promise<boolean> {
  const result = await mutateArtifact(selector, "/favorite", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ favorited }),
  }, signal)
  if (result?.status !== 200) return false
  const ack = libraryArtifactFavoriteResponseSchema.safeParse(result.payload)
  return ack.success && ack.data.meta.request_id === result.requestId && matchesSelector(ack.data.data, selector) && ack.data.data.favorited === favorited
}

export type ArtifactDeletionOutcome = "confirmed" | "unknown" | "rejected" | "auth_required"

/** The caller keeps the original intent/key; a missing row is not a delete ACK. */
export async function deleteLibraryArtifact(selector: LibraryArtifactSelector, key: string, signal: AbortSignal): Promise<ArtifactDeletionOutcome> {
  if (!libraryArtifactDeleteKeySchema.safeParse(key).success) return "rejected"
  const result = await mutateArtifact(selector, "", { method: "DELETE", headers: { "idempotency-key": key } }, signal)
  if (result === null) return "unknown"
  if (result.status === 200) {
    const ack = libraryArtifactDeleteResponseSchema.safeParse(result.payload)
    return ack.success && matchesSelector(ack.data.data, selector) ? "confirmed" : "unknown"
  }
  const failure = libraryArtifactDeleteErrorSchema.safeParse(result.payload)
  if (failure.success && isLibraryArtifactDeleteOwnerError(result.status, failure.data.error.code, failure.data.error.retryable) && !failure.data.error.retryable) {
    if (result.status === 401 || result.status === 403) return "auth_required"
    if ([400, 404, 409].includes(result.status)) return "rejected"
  }
  return "unknown"
}

type CanvasArtifactIdentity = Pick<LibraryArtifact, "assetId" | "sourceRunId" | "mimeType" | "sizeBytes">

/** Chat's Delivery metadata is not a permission to read a different source/version. */
export function readLibraryArtifactTextPreview(
  selector: LibraryArtifactSelector,
  signal: AbortSignal,
  expected: CanvasArtifactIdentity,
): Promise<LibraryTextPreviewResult> {
  return withLibraryPreviewDeadline(signal, async (bounded) => {
    const detail = await readArtifactWire(selector, bounded)
    if (detail.asset_id !== expected.assetId || detail.source_run_id !== expected.sourceRunId ||
      detail.mime_type !== expected.mimeType || detail.size_bytes !== expected.sizeBytes)
      throw new Error("library_artifact_preview_metadata_changed")
    return readVerifiedLibraryText(`${artifactPath(selector)}/content`, {
      mimeType: detail.mime_type, sizeBytes: detail.size_bytes, contentSha256: detail.content_sha256,
    }, bounded)
  })
}

/** The dialog already verified this exact detail. Content still requires fresh owner admission. */
export function readLibraryArtifactDetailTextPreview(detail: LibraryArtifactDetailView, signal: AbortSignal): Promise<LibraryTextPreviewResult> {
  return withLibraryPreviewDeadline(signal, (bounded) => readVerifiedLibraryText(`${artifactPath(detail)}/content`, detail, bounded))
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
