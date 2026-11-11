import { workspaceOutputContentPath } from "@/contract/paths"
import { sessionBaseUrl } from "@/engine/config"
import { downloadVerifiedBlob } from "@/engine/file-fetch"
import {
  isLibraryTextPreviewSupported,
  readVerifiedPrivateBytes,
  withLibraryPreviewDeadline,
  type LibraryTextPreviewResult,
} from "@/features/app/kokoro-library-preview-content"
import type { WorkspaceOutputFile } from "./canvas-store"

export function canPreviewWorkspaceOutput(mime: string, bytes: number): boolean {
  return isLibraryTextPreviewSupported(mime === "application/json" ? "text/plain" : mime, bytes)
}

function readWorkspaceOutput(sessionId: string, file: WorkspaceOutputFile, signal: AbortSignal) {
  return withLibraryPreviewDeadline(signal, async (boundedSignal) => {
    const { runId, versionId, bytes, mime, contentSha256 } = file
    const response = await fetch(`${sessionBaseUrl()}${workspaceOutputContentPath(sessionId, runId, versionId)}`, {
      cache: "no-store", credentials: "same-origin", redirect: "error", signal: boundedSignal,
    })
    // Fetch supplies decoded bytes. A content encoding may describe a different
    // wire length; the owner byte length and SHA-256 are authoritative.
    const encoding = response.headers.get("content-encoding")?.toLowerCase()
    const length = !encoding || encoding === "identity" ? response.headers.get("content-length") : null
    const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
    if (boundedSignal.aborted || response.status !== 200 || !response.body || type !== mime ||
        length !== null && length !== String(bytes) ||
        !/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(response.headers.get("cache-control") ?? "")) {
      void response.body?.cancel().catch(() => undefined)
      throw new Error("workspace_output_content_invalid")
    }
    return readVerifiedPrivateBytes(response.body, bytes, contentSha256, boundedSignal)
  })
}

export async function readWorkspaceOutputPreview(sessionId: string, file: WorkspaceOutputFile, signal: AbortSignal): Promise<LibraryTextPreviewResult> {
  if (!canPreviewWorkspaceOutput(file.mime, file.bytes)) return { kind: "unsupported" }
  const bytes = await readWorkspaceOutput(sessionId, file, signal)
  return {
    kind: "text", text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    mimeType: file.mime, sizeBytes: String(file.bytes),
  }
}

export async function downloadWorkspaceOutput(sessionId: string, file: WorkspaceOutputFile, signal: AbortSignal, isCurrent: () => boolean): Promise<boolean> {
  if (!isCurrent()) return false
  const bytes = await readWorkspaceOutput(sessionId, file, signal)
  if (!isCurrent()) return false
  return downloadVerifiedBlob(new Blob([bytes], { type: file.mime }), file.path.split("/").at(-1)!, signal)
}
