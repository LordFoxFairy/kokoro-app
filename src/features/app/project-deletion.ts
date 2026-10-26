import { projectDeletionAcceptedMatches, projectDeletionAcceptedSchema, projectDeletionHeadersValid,
  projectDeletionIdSchema, projectDeletionKeySchema, projectDeletionLocalErrorAllowed, projectDeletionLocalErrorSchema,
  projectDeletionMaxResponseBytes, projectDeletionOwnerErrorAllowed, projectDeletionOwnerErrorSchema,
  projectDeletionStatusMatches, projectDeletionStatusSchema,
  type ProjectDeletionFault, type ProjectDeletionIntent,
  type ProjectDeletionOwnerCode, type ProjectDeletionSnapshot } from "@/contract/project-deletion"
import { parseProjectRenameJson } from "@/contract/project-rename"

export class ProjectDeletionError extends Error {
  constructor(readonly code: ProjectDeletionOwnerCode | ProjectDeletionFault, readonly status?: number) {
    super(code)
    this.name = "ProjectDeletionError"
  }
}

/** One caller-owned command. No automatic replay, generated key, or UI state lives here. */
export function deleteProject(intent: ProjectDeletionIntent, signal: AbortSignal): Promise<ProjectDeletionSnapshot> {
  if (!projectDeletionIdSchema.safeParse(intent.projectId).success || !projectDeletionKeySchema.safeParse(intent.idempotencyKey).success) {
    return Promise.reject(new ProjectDeletionError("invalid_project_deletion_request", 400))
  }
  return requestProjectDeletion({ method: "DELETE", projectId: intent.projectId, key: intent.idempotencyKey, signal })
}

/** Always read the exact current Project's same-origin status, never an owner-supplied navigation target. */
export function getProjectDeletion(projectId: string, signal: AbortSignal): Promise<ProjectDeletionSnapshot> {
  if (!projectDeletionIdSchema.safeParse(projectId).success) return Promise.reject(new ProjectDeletionError("invalid_project_deletion_request", 400))
  return requestProjectDeletion({ method: "GET", projectId, signal })
}

async function requestProjectDeletion(input: Readonly<{ projectId: string; signal: AbortSignal }> & (
  Readonly<{ method: "DELETE"; key: string }> | Readonly<{ method: "GET" }>
)): Promise<ProjectDeletionSnapshot> {
  if (input.signal.aborted) throw new ProjectDeletionError("request_aborted")
  const deadline = performance.now() + 10_000, controller = new AbortController()
  let response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let retired = false, fault: ProjectDeletionFault = "network_error"
  let rejectInterrupt: (reason: ProjectDeletionError) => void = () => {}
  const interrupted = new Promise<never>((_, reject) => { rejectInterrupt = reject })
  const stop = () => {
    controller.abort()
    if (reader) {
      void reader.cancel().catch(() => undefined)
      try { reader.releaseLock() } catch {}
      reader = undefined
    }
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined)
  }
  const abort = () => { fault = "request_aborted"; stop(); rejectInterrupt(new ProjectDeletionError(fault)) }
  const timer = setTimeout(() => { fault = "request_timeout"; stop(); rejectInterrupt(new ProjectDeletionError(fault)) }, Math.max(0, deadline - performance.now()))
  input.signal.addEventListener("abort", abort, { once: true })
  if (input.signal.aborted) abort()
  const check = () => {
    if (input.signal.aborted) fault = "request_aborted"
    else if (performance.now() >= deadline) fault = "request_timeout"
    if (retired || controller.signal.aborted || input.signal.aborted || performance.now() >= deadline) {
      stop()
      throw new ProjectDeletionError(fault)
    }
  }
  const operation = async (): Promise<ProjectDeletionSnapshot> => {
    check()
    try {
      response = await fetch(`/api/hub/projects/${input.projectId}${input.method === "GET" ? "/deletion" : ""}`, {
        method: input.method, cache: "no-store", redirect: "error", signal: controller.signal,
        ...(input.method === "DELETE" ? { headers: { "Idempotency-Key": input.key } } : {}),
      })
    } catch { check(); throw new ProjectDeletionError("network_error") }
    check()
    if (!projectDeletionHeadersValid({ headers: response.headers, status: response.status, projectId: input.projectId, boundary: "browser" })) throw new ProjectDeletionError("invalid_headers")
    let bytes = 0, text = ""
    response.headers.forEach((value, name) => { bytes += new TextEncoder().encode(`${name}: ${value}\r\n`).byteLength })
    if (bytes > projectDeletionMaxResponseBytes) throw new ProjectDeletionError("invalid_headers")
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
    try {
      if (response.body) {
        reader = response.body.getReader()
        for (;;) {
          check()
          const part = await reader.read()
          check()
          if (part.done) break
          bytes += part.value.byteLength
          if (bytes > projectDeletionMaxResponseBytes) throw new ProjectDeletionError("invalid_json")
          text += decoder.decode(part.value, { stream: true })
        }
        text += decoder.decode()
        reader.releaseLock(); reader = undefined
      }
    } catch (error) {
      check()
      if (error instanceof ProjectDeletionError) throw error
      throw new ProjectDeletionError("invalid_json")
    }
    let raw: unknown
    try { raw = parseProjectRenameJson(text) } catch { throw new ProjectDeletionError("invalid_json") }
    check()
    if (response.status === (input.method === "DELETE" ? 202 : 200)) {
      const candidate = { raw, projectId: input.projectId }
      if (!(input.method === "DELETE" ? projectDeletionAcceptedMatches(candidate) : projectDeletionStatusMatches(candidate))) throw new ProjectDeletionError("ack_shape_mismatch")
      return (input.method === "DELETE" ? projectDeletionAcceptedSchema.parse(raw) : projectDeletionStatusSchema.parse(raw)).data
    }
    const owner = projectDeletionOwnerErrorSchema.safeParse(raw)
    if (owner.success && projectDeletionOwnerErrorAllowed({ method: input.method, status: response.status, ...owner.data.error })) {
      throw new ProjectDeletionError(owner.data.error.code, response.status)
    }
    const local = projectDeletionLocalErrorSchema.safeParse(raw)
    if (local.success && projectDeletionLocalErrorAllowed({ status: response.status, ...local.data.error })) {
      throw new ProjectDeletionError(local.data.error.code, response.status)
    }
    throw new ProjectDeletionError("unexpected_status")
  }
  try { return await Promise.race([interrupted, operation()]) }
  finally { retired = true; clearTimeout(timer); input.signal.removeEventListener("abort", abort); stop() }
}
