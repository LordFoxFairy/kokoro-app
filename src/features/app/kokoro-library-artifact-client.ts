import type { LibraryArtifactQuery } from "./kokoro-library-model"
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
export async function listLibraryArtifacts(cursor: string | null, signal: AbortSignal, filter: LibraryArtifactQuery): Promise<LibraryArtifactPage> {
  const query = new URLSearchParams({ kind: "artifact", limit: "50" })
  if (cursor !== null) query.set("cursor", cursor)
  if (filter.query !== "") query.set("q", filter.query)
  if (filter.type !== "all") query.set("type", filter.type)
  const response = await fetch(`/api/hub/library?${query}`, { cache: "no-store", signal })
  const parsed = libraryArtifactListResponseSchema.safeParse(await parsedResponse(response))
  if (!parsed.success) throw new Error("library_artifacts_invalid_response")
  return { items: parsed.data.data.items.map(mapArtifact), nextCursor: parsed.data.data.next_cursor }
}

async function readArtifactWire(selector: LibraryArtifactSelector, signal: AbortSignal): Promise<LibraryArtifactWire> {
  signal.throwIfAborted()
  const response = await fetch(artifactPath(selector), { cache: "no-store", signal })
  if (signal.aborted) void response.body?.cancel().catch(() => undefined)
  signal.throwIfAborted()
  const parsed = libraryArtifactDetailResponseSchema.safeParse(await parsedResponse(response))
  if (!parsed.success || parsed.data.data.conversation_id !== selector.conversationId || parsed.data.data.artifact_id !== selector.artifactId) {
    throw new Error("library_artifacts_invalid_response")
  }
  return parsed.data.data
}

export async function getLibraryArtifact(conversationId: string, artifactId: string, signal: AbortSignal): Promise<LibraryArtifact> {
  return mapArtifact(await readArtifactWire({ conversationId, artifactId }, signal))
}

export const ARTIFACT_TEXT_PREVIEW_MAX_BYTES = 65_536
export type ArtifactTextPreview = { kind: "text"; text: string; mimeType: string; sizeBytes: string } | { kind: "unsupported" }

async function readTextBytes(selector: LibraryArtifactSelector, signal: AbortSignal): Promise<ArtifactTextPreview> {
  const detail = await readArtifactWire(selector, signal)
  signal.throwIfAborted()
  if ((detail.mime_type !== "text/plain" && detail.mime_type !== "text/markdown") || Number(detail.size_bytes) > ARTIFACT_TEXT_PREVIEW_MAX_BYTES) return { kind: "unsupported" }
  const response = await fetch(`${artifactPath(selector)}/content`, { cache: "no-store", redirect: "error", signal })
  if (signal.aborted) void response.body?.cancel().catch(() => undefined)
  signal.throwIfAborted()
  if (response.status !== 200 || response.headers.get("content-length") !== detail.size_bytes || response.headers.get("content-type")?.toLowerCase() !== detail.mime_type || response.body === null) {
    void response.body?.cancel().catch(() => undefined)
    throw new Error("library_artifact_preview_invalid_response")
  }
  const reader = response.body.getReader()
  const cancel = () => { void reader.cancel().catch(() => undefined) }
  signal.addEventListener("abort", cancel, { once: true })
  const chunks: Uint8Array[] = []
  let total = 0
  let ended = false
  try {
    for (;;) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) { ended = true; break }
      total += value.byteLength
      if (total > ARTIFACT_TEXT_PREVIEW_MAX_BYTES || total > Number(detail.size_bytes)) throw new Error("library_artifact_preview_too_large")
      chunks.push(value)
    }
    if (total !== Number(detail.size_bytes)) throw new Error("library_artifact_preview_incomplete")
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const digest = await crypto.subtle.digest("SHA-256", bytes)
    signal.throwIfAborted()
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
    if (sha256 !== detail.content_sha256) throw new Error("library_artifact_preview_digest_mismatch")
    return { kind: "text", text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), mimeType: detail.mime_type, sizeBytes: detail.size_bytes }
  } finally {
    signal.removeEventListener("abort", cancel)
    if (!ended) cancel()
    reader.releaseLock()
  }
}

/** Small text only. One deadline includes detail, content EOF and verification;
 * the separate native attachment flow never enters this bounded reader. */
export async function readLibraryArtifactTextPreview(selector: LibraryArtifactSelector, signal: AbortSignal): Promise<ArtifactTextPreview> {
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
    return await Promise.race([readTextBytes(selector, controller.signal), aborted])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener("abort", relay)
    controller.signal.removeEventListener("abort", rejectAbort)
  }
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
