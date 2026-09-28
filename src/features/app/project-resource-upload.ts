import { projectResourceUploadResponseSchema, type ProjectResourceUploadResult } from "@/contract/project-resource"

export class ProjectResourceUploadError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(code)
    this.name = "ProjectResourceUploadError"
  }
}

/** One BFF mutation per selected file; the caller owns and retains the retry key. */
export async function uploadProjectResource(
  projectRef: string,
  file: File,
  idempotencyKey: string,
): Promise<ProjectResourceUploadResult> {
  if (!projectRef || !idempotencyKey) throw new ProjectResourceUploadError("invalid_upload_identity", false)
  const body = new FormData()
  body.append("files", file)
  let response: Response
  try {
    response = await fetch(`/api/hub/projects/${encodeURIComponent(projectRef)}/resources`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body,
    })
  } catch {
    throw new ProjectResourceUploadError("upload_network_error", true)
  }
  if (!response.ok) {
    let code = `upload_http_${response.status}`
    try {
      const payload = await response.json() as { error?: { code?: unknown } }
      if (typeof payload.error?.code === "string") code = payload.error.code
    } catch { /* Preserve status when the upstream error body is unavailable. */ }
    const retryable = response.status >= 500 || response.status === 429
      || (response.status === 409 && code === "idempotency_in_progress")
    throw new ProjectResourceUploadError(code, retryable, response.status)
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ProjectResourceUploadError("upload_invalid_response", true)
  }
  const parsed = projectResourceUploadResponseSchema.safeParse(payload)
  if (!parsed.success) throw new ProjectResourceUploadError("upload_invalid_response", true)
  const resource = parsed.data.data.resources[0]!
  if (resource.filename !== file.name || resource.size_bytes !== String(file.size)) {
    throw new ProjectResourceUploadError("upload_receipt_mismatch", true)
  }
  return {
    assetId: resource.asset_id,
    filename: resource.filename,
    mimeType: resource.mime_type,
    sizeBytes: resource.size_bytes,
  }
}
