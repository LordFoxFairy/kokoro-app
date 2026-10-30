import {
  parseProjectDeletionJson, projectDeletionAcceptedMatches, projectDeletionBrowserHeadersValid,
  projectDeletionIdSchema, projectDeletionKeySchema, projectDeletionOwnerErrorAllowed,
  projectDeletionOwnerErrorSchema, projectDeletionStatusMatches,
  type ProjectDeletionFault, type ProjectDeletionIntent, type ProjectDeletionOwnerCode,
  type ProjectDeletionResource,
} from "@/contract/project-deletion"

export class ProjectDeleteError extends Error {
  constructor(
    readonly code: ProjectDeletionFault | ProjectDeletionOwnerCode,
    readonly status?: number,
    /** Set only after the operation-specific owner error envelope has been fully validated. */
    readonly verifiedOwner = false,
  ) {
    super(code)
    this.name = "ProjectDeleteError"
  }
}

async function requestProjectDeletion(
  target: string,
  init: RequestInit,
  projectId: string,
  signal: AbortSignal,
): Promise<unknown> {
  if (signal.aborted) throw new ProjectDeleteError("request_aborted")
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let detach = () => {}
  let response: Response | undefined
  const interrupted = new Promise<never>((_, reject) => {
    detach = () => { controller.abort(); reject(new ProjectDeleteError("request_aborted")) }
    signal.addEventListener("abort", detach, { once: true })
    if (signal.aborted) { detach(); return }
    timer = setTimeout(() => { controller.abort(); reject(new ProjectDeleteError("request_timeout")) }, 10_000)
  })
  try {
    return await Promise.race([interrupted, (async () => {
      try { response = await fetch(target, { ...init, cache: "no-store", signal: controller.signal }) }
      catch { throw new ProjectDeleteError("network_error") }
      if (!projectDeletionBrowserHeadersValid(response.headers)) throw new ProjectDeleteError("invalid_headers")
      let raw: unknown
      try { raw = parseProjectDeletionJson(await response.text()) } catch { throw new ProjectDeleteError("invalid_json") }
      if (signal.aborted) throw new ProjectDeleteError("request_aborted")
      return { response, raw, projectId }
    })()])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener("abort", detach)
    controller.abort()
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined)
  }
}

/** Sends exactly the caller-owned empty DELETE command; it never retries itself. */
export async function deleteProject(intent: ProjectDeletionIntent, signal: AbortSignal): Promise<ProjectDeletionResource> {
  if (!projectDeletionIdSchema.safeParse(intent.projectId).success || !projectDeletionKeySchema.safeParse(intent.idempotencyKey).success || intent.body !== null) {
    throw new ProjectDeleteError("invalid_project_deletion_request", 400)
  }
  const result = await requestProjectDeletion(`/api/hub/projects/${intent.projectId}`, {
    method: "DELETE", headers: { "Idempotency-Key": intent.idempotencyKey },
  }, intent.projectId, signal) as { response: Response; raw: unknown; projectId: string }
  if (result.response.status === 202) {
    if (!projectDeletionAcceptedMatches(result.raw, result.projectId)) throw new ProjectDeleteError("ack_shape_mismatch")
    return result.raw.data
  }
  const owner = projectDeletionOwnerErrorSchema.safeParse(result.raw)
  if (owner.success && projectDeletionOwnerErrorAllowed(result.response.status, owner.data.error.code, owner.data.error.retryable, false)) {
    throw new ProjectDeleteError(owner.data.error.code, result.response.status, true)
  }
  throw new ProjectDeleteError("unexpected_status", result.response.status)
}

/** Reads the durable owner receipt; never includes an idempotency key and never deletes. */
export async function readProjectDeletion(projectId: string, signal: AbortSignal): Promise<ProjectDeletionResource> {
  if (!projectDeletionIdSchema.safeParse(projectId).success) throw new ProjectDeleteError("invalid_project_deletion_request", 400)
  const result = await requestProjectDeletion(`/api/hub/projects/${projectId}/deletion`, { method: "GET" }, projectId, signal) as { response: Response; raw: unknown; projectId: string }
  if (result.response.status === 200) {
    if (!projectDeletionStatusMatches(result.raw, result.projectId)) throw new ProjectDeleteError("ack_shape_mismatch")
    return result.raw.data
  }
  const owner = projectDeletionOwnerErrorSchema.safeParse(result.raw)
  if (owner.success && projectDeletionOwnerErrorAllowed(result.response.status, owner.data.error.code, owner.data.error.retryable, true)) {
    throw new ProjectDeleteError(owner.data.error.code, result.response.status, true)
  }
  throw new ProjectDeleteError("unexpected_status", result.response.status)
}
