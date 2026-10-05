import { projectRenameIdSchema, projectRenameKeySchema, projectRenameNameSchema, projectRenameAckMatches,
  projectRenameBrowserHeadersValid, projectRenameOwnerErrorSchema, projectRenameOwnerErrorAllowed,
  projectRenameLocalErrorSchema, projectRenameLocalErrorAllowed, parseProjectRenameJson, projectRenameRetryAfterValid,
  type ProjectRenameFault, type ProjectRenameOwnerCode, type ProjectRenameIntent } from "@/contract/project-rename"

export class ProjectRenameError extends Error {
  constructor(readonly code: ProjectRenameFault | ProjectRenameOwnerCode, readonly status?: number) {
    super(code)
    this.name = "ProjectRenameError"
  }
}

/** One immutable caller-owned command, never an automatic retry or resource projection. */
export async function renameProject(intent: ProjectRenameIntent, signal: AbortSignal): Promise<void> {
  if (!projectRenameIdSchema.safeParse(intent.projectId).success || !projectRenameKeySchema.safeParse(intent.idempotencyKey).success
    || !projectRenameNameSchema.safeParse(intent.name).success || intent.body !== JSON.stringify({ name: intent.name })) {
    throw new ProjectRenameError("invalid_project_rename", 400)
  }
  if (signal.aborted) throw new ProjectRenameError("request_aborted")
  const controller = new AbortController()
  const deadlineAt = performance.now() + 10_000
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort = () => {}
  let response: Response | undefined
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => { reject(new ProjectRenameError("request_aborted")); controller.abort() }
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) { abort(); return }
    timer = setTimeout(() => { reject(new ProjectRenameError("request_timeout")); controller.abort() }, 10_000)
  })
  try {
    await Promise.race([interrupted, (async () => {
      try {
        response = await fetch(`/api/hub/projects/${intent.projectId}/name`, {
          method: "PATCH", cache: "no-store", signal: controller.signal,
          headers: { "content-type": "application/json", "Idempotency-Key": intent.idempotencyKey }, body: intent.body,
        })
      } catch { throw new ProjectRenameError("network_error") }
      if (!projectRenameBrowserHeadersValid(response.headers)) throw new ProjectRenameError("invalid_headers")
      const retryAfter = response.headers.get("retry-after")
      if (response.status === 429 && retryAfter !== null && !projectRenameRetryAfterValid(retryAfter)) throw new ProjectRenameError("invalid_headers")
      let raw: unknown
      try { raw = parseProjectRenameJson(await response.text()) } catch { throw new ProjectRenameError("invalid_json") }
      if (performance.now() >= deadlineAt) throw new ProjectRenameError("request_timeout")
      if (signal.aborted) throw new ProjectRenameError("request_aborted")
      if (response.status === 200) {
        if (!projectRenameAckMatches(raw, intent)) throw new ProjectRenameError("ack_shape_mismatch")
        return
      }
      const owner = projectRenameOwnerErrorSchema.safeParse(raw)
      if (owner.success && projectRenameOwnerErrorAllowed(response.status, owner.data.error.code, owner.data.error.retryable)) {
        throw new ProjectRenameError(owner.data.error.code, response.status)
      }
      const local = projectRenameLocalErrorSchema.safeParse(raw)
      if (local.success && projectRenameLocalErrorAllowed(response.status, local.data.error.code)) {
        throw new ProjectRenameError(local.data.error.code, response.status)
      }
      throw new ProjectRenameError("unexpected_status")
    })()])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener("abort", abort)
    controller.abort()
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined)
  }
}
