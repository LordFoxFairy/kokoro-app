import {
  projectResourceItemResponseSchema,
  projectResourceDeletionResponseSchema,
  projectResourceErrorEnvelopeSchema,
  projectResourceAssetIdSchema,
} from "@/contract/project-resource"
import type { z } from "zod"
import { parseProjectRenameJson, projectRenameBrowserCacheControl } from "@/contract/project-rename"
export type ProjectResourceItem = z.infer<typeof projectResourceItemResponseSchema>["data"]["resource"]
export type ProjectResourceDeleteIntent = Readonly<{ projectRef: string; assetId: string; key: string; body: null }>
const selector = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u
export class ProjectResourceAccessError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
    readonly verifiedOwner = false,
  ) {
    super(code)
    this.name = "ProjectResourceAccessError"
  }
}
export function projectResourcePath(projectRef: string, assetId: string): string {
  if (!selector.test(projectRef) || !projectResourceAssetIdSchema.safeParse(assetId).success) throw new ProjectResourceAccessError("invalid_project_resource")
  return `/api/hub/projects/${encodeURIComponent(projectRef)}/resources/${encodeURIComponent(assetId)}`
}
const terminal: Readonly<Record<number, readonly string[]>> = {
  400: ["invalid_project_resource", "idempotency_key_required", "invalid_idempotency_key"],
  401: ["session_authentication_required", "session_invalid"],
  403: ["service_auth_failed", "session_forbidden", "product_tenant_forbidden"],
  404: ["project_not_found", "project_resource_not_found"],
}
async function readJson(target: string, init: RequestInit, signal: AbortSignal): Promise<{ raw: unknown; status: number }> {
  signal.throwIfAborted()
  const controller = new AbortController()
  const relay = () => controller.abort(signal.reason)
  signal.addEventListener("abort", relay, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException("Resource deadline", "TimeoutError")), 10_000)
  let response: Response | undefined
  try {
    response = await fetch(target, { ...init, signal: controller.signal, cache: "no-store", redirect: "error" })
    signal.throwIfAborted()
    controller.signal.throwIfAborted()
    if (
      !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(response.headers.get("content-type") ?? "") ||
      response.headers.get("cache-control") !== projectRenameBrowserCacheControl
    )
      throw new ProjectResourceAccessError("invalid_response")
    if (response.body === null) throw new ProjectResourceAccessError("invalid_response")
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = []
    const cancel = () => {
      void reader.cancel().catch(() => undefined)
    }
    controller.signal.addEventListener("abort", cancel, { once: true })
    let size = 0,
      ended = false
    try {
      for (;;) {
        signal.throwIfAborted()
        controller.signal.throwIfAborted()
        const part = await reader.read()
        signal.throwIfAborted()
        controller.signal.throwIfAborted()
        if (part.done) {
          ended = true
          break
        }
        size += part.value.byteLength
        if (size > 65_536) throw new ProjectResourceAccessError("invalid_response")
        chunks.push(part.value)
      }
    } finally {
      controller.signal.removeEventListener("abort", cancel)
      if (!ended) cancel()
      reader.releaseLock()
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    let raw: unknown
    try {
      raw = parseProjectRenameJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
    } catch {
      throw new ProjectResourceAccessError("invalid_response")
    }
    return { raw, status: response.status }
  } finally {
    clearTimeout(timer)
    signal.removeEventListener("abort", relay)
    controller.abort()
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined)
  }
}
function ownerFailure(raw: unknown, status: number): ProjectResourceAccessError {
  const owner = projectResourceErrorEnvelopeSchema.safeParse(raw)
  return owner.success && terminal[status]?.includes(owner.data.error.code)
    ? new ProjectResourceAccessError(owner.data.error.code, status, true)
    : new ProjectResourceAccessError("project_resource_unknown", status)
}
export async function getProjectResource(projectRef: string, assetId: string, signal: AbortSignal): Promise<ProjectResourceItem> {
  const result = await readJson(projectResourcePath(projectRef, assetId), { method: "GET" }, signal)
  if (result.status !== 200) throw ownerFailure(result.raw, result.status)
  const value = projectResourceItemResponseSchema.safeParse(result.raw)
  if (!value.success || value.data.data.resource.asset_id !== assetId) throw new ProjectResourceAccessError("invalid_response")
  return value.data.data.resource
}
export async function deleteProjectResource(intent: ProjectResourceDeleteIntent, signal: AbortSignal): Promise<void> {
  if (intent.body !== null || !/^[\x21-\x7e]{1,191}$/u.test(intent.key)) throw new ProjectResourceAccessError("invalid_project_resource")
  const result = await readJson(
    projectResourcePath(intent.projectRef, intent.assetId),
    { method: "DELETE", headers: { "idempotency-key": intent.key } },
    signal,
  )
  if (result.status !== 200) throw ownerFailure(result.raw, result.status)
  const value = projectResourceDeletionResponseSchema.safeParse(result.raw)
  if (!value.success || value.data.data.asset_id !== intent.assetId) throw new ProjectResourceAccessError("invalid_response")
}
/** Launch only: the browser owns native transfer/cancellation and no completion is inferred. */
export async function beginProjectResourceDownload(projectRef: string, assetId: string, signal: AbortSignal): Promise<void> {
  const item = await getProjectResource(projectRef, assetId, signal)
  signal.throwIfAborted()
  const anchor = document.createElement("a")
  anchor.href = `${projectResourcePath(projectRef, assetId)}/download`
  anchor.download =
    item.filename
      .replace(/[\u0000-\u001f\u007f/\\]/gu, "_")
      .replace(/^\.+/u, "_")
      .slice(0, 255) || "download"
  anchor.rel = "noopener noreferrer"
  anchor.hidden = true
  document.body.append(anchor)
  try {
    signal.throwIfAborted()
    anchor.click()
  } finally {
    anchor.remove()
  }
}
