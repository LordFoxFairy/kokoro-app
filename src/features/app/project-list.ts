import { projectListResponseSchema, projectResponseSchema, projectInstructionRevisionResponseSchema, type ProjectInstructionRevisionWire, type Project } from "@/contract/project"

export class ProjectReadError extends Error {
  constructor(readonly reason: "http" | "network" | "parse" | "timeout", readonly status?: number) {
    super(`project_read_${reason}`)
    this.name = "ProjectReadError"
  }
}

/** A bounded same-origin read, including body consumption; never a retry or fallback. */
async function readProject<T>(path: string, signal: AbortSignal, parse: (raw: unknown) => T, init: RequestInit = {}): Promise<T> {
  if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError")
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  let abort = () => {}
  const interruption = new Promise<never>((_, reject) => {
    abort = () => {
      controller.abort(signal.reason)
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"))
    }
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) { abort(); return }
    timeout = setTimeout(() => {
      reject(new ProjectReadError("timeout"))
      controller.abort()
    }, 10_000)
  })
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(path, { method: "GET", ...init, cache: "no-store", signal: controller.signal })
        if (!response.ok) throw new ProjectReadError("http", response.status)
        let raw: unknown
        try { raw = await response.json() } catch { throw new ProjectReadError("parse") }
        try { return parse(raw) } catch { throw new ProjectReadError("parse") }
      })(),
      interruption,
    ])
  } catch (error) {
    if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError")
    if (error instanceof ProjectReadError) throw error
    throw new ProjectReadError("network")
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener("abort", abort)
  }
}

export function listProjects(signal: AbortSignal): Promise<Project[]> {
  return readProject("/api/hub/projects", signal, (raw) => projectListResponseSchema.parse(raw).data.projects)
}

export function getProject(id: string, signal: AbortSignal): Promise<Project> {
  return readProject(`/api/hub/projects/${encodeURIComponent(id)}`, signal, (raw) => {
    const project = projectResponseSchema.parse(raw).data.project
    if (project.id !== id) throw new ProjectReadError("parse")
    return project
  })
}

export function listProjectInstructionRevisions(id: string, signal: AbortSignal): Promise<ProjectInstructionRevisionWire[]> {
  return readProject(`/api/hub/projects/${encodeURIComponent(id)}/instruction-revisions`, signal,
    (raw) => projectInstructionRevisionResponseSchema.parse(raw).data.items)
}

export function updateProjectInstructions(id: string, instruction: string, idempotencyKey: string, signal: AbortSignal): Promise<Project> {
  return readProject(`/api/hub/projects/${encodeURIComponent(id)}`, signal, (raw) => {
    const project = projectResponseSchema.parse(raw).data.project
    if (project.id !== id) throw new ProjectReadError("parse")
    return project
  }, {
    method: "PATCH",
    headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ instruction }),
  })
}
