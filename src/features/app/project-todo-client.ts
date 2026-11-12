import type { CreateProjectTaskRequest, UpdateProjectTaskRequest } from "@/generated/bff-project-tasks/types.gen"
import { zErrorEnvelope, zProjectTaskWriteResponse, zTaskListResponse } from "@/generated/bff-project-tasks/zod.gen"
import type { ProjectTodoClient, ProjectTodoIntent, ProjectTodoWriteResult } from "./project-todo-section"

const collection = (projectId: string) => `/api/hub/projects/${encodeURIComponent(projectId)}/tasks`
const options = (signal: AbortSignal): RequestInit => ({
  credentials: "same-origin", cache: "no-store", redirect: "error",
  signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
})

function rejectWrite(status: number, code: string): ProjectTodoWriteResult {
  if (status === 412 || (status === 404 && code === "project_task_not_found")) return "stale"
  if (status === 409 && code === "project_task_limit_reached") return "capacity"
  if (status === 409 && code === "idempotency_conflict") return "key-conflict"
  if (status === 401 || status === 403 || status === 404) return "denied"
  if (status === 400 || status === 413 || status === 428) return "rejected"
  return "unknown"
}

function writeRequest(projectId: string, intent: ProjectTodoIntent): { url: string; init: RequestInit } {
  const headers = new Headers({ "idempotency-key": intent.key, accept: "application/json" })
  if (intent.kind === "create") {
    const body: CreateProjectTaskRequest = { title: intent.title }
    headers.set("content-type", "application/json")
    return { url: collection(projectId), init: { method: "POST", headers, body: JSON.stringify(body) } }
  }
  const url = `${collection(projectId)}/${encodeURIComponent(intent.taskId)}`
  headers.set("if-match", `"${intent.revision}"`)
  if (intent.kind === "delete") return { url, init: { method: "DELETE", headers } }
  const body: UpdateProjectTaskRequest = {
    ...(intent.title === undefined ? {} : { title: intent.title }),
    ...(intent.status === undefined ? {} : { status: intent.status }),
  }
  headers.set("content-type", "application/json")
  return { url, init: { method: "PATCH", headers, body: JSON.stringify(body) } }
}

export const liveProjectTodoClient: ProjectTodoClient = {
  async list(projectId, signal) {
    try {
      const response = await fetch(collection(projectId), options(signal))
      signal.throwIfAborted()
      if (response.status === 401 || response.status === 403 || response.status === 404) return { kind: "denied" }
      if (response.status !== 200) return { kind: "unavailable" }
      const parsed = zTaskListResponse.safeParse(await response.json())
      signal.throwIfAborted()
      if (!parsed.success || parsed.data.meta.request_id !== response.headers.get("x-request-id") ||
        parsed.data.data.tasks.some(task => task.project_id !== projectId)) return { kind: "unavailable" }
      return { kind: "ok", tasks: parsed.data.data.tasks.map(({ id, title, status, revision }) => ({ id, title, status, revision })) }
    } catch { return { kind: "unavailable" } }
  },
  async write(projectId, intent, signal) {
    try {
      const { url, init } = writeRequest(projectId, intent)
      const response = await fetch(url, { ...options(signal), ...init })
      signal.throwIfAborted()
      const requestId = response.headers.get("x-request-id")
      if (!requestId) return "unknown"
      // The same-origin adapter enforces empty 204 responses; Chromium can expose an empty stream.
      if (intent.kind === "delete" && response.status === 204 && response.headers.get("location") === null) return "ok"
      if (response.status >= 500 || response.status === 429) return "unknown"
      const raw: unknown = await response.json()
      signal.throwIfAborted()
      if (!response.ok) {
        const parsed = zErrorEnvelope.safeParse(raw)
        return parsed.success && parsed.data.meta.request_id === requestId ? rejectWrite(response.status, parsed.data.error.code) : "unknown"
      }
      const parsed = zProjectTaskWriteResponse.safeParse(raw)
      if (!parsed.success || parsed.data.meta.request_id !== requestId || parsed.data.data.project_id !== projectId) return "unknown"
      const location = response.headers.get("location")
      if (intent.kind === "create" && response.status === 201 && location === `${url}/${encodeURIComponent(parsed.data.data.id)}`) return "ok"
      if (intent.kind === "update" && response.status === 200 && location === null && parsed.data.data.id === intent.taskId) return "ok"
      return "unknown"
    } catch { return "unknown" }
  },
}
