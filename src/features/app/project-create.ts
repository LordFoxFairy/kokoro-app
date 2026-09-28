import { projectCreateResponseSchema } from "@/contract/project-create"

export class ProjectCreateError extends Error {
  constructor(readonly code: string, readonly status?: number) {
    super(code)
    this.name = "ProjectCreateError"
  }
}

/** One BFF mutation for a caller-owned creation intent; no generated fixture ref. */
export async function createProject(name: string, idempotencyKey: string): Promise<{ id: string; slug: string }> {
  if (!name.trim() || !idempotencyKey) throw new ProjectCreateError("project_create_invalid_input")
  let response: Response
  try {
    response = await fetch("/api/hub/projects", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ name }),
    })
  } catch {
    throw new ProjectCreateError("project_create_network_error")
  }
  if (!response.ok) {
    let code = `project_create_http_${response.status}`
    try {
      const payload = await response.json() as { error?: { code?: unknown } }
      if (typeof payload.error?.code === "string") code = payload.error.code
    } catch { /* The status still identifies the failed attempt. */ }
    throw new ProjectCreateError(code, response.status)
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ProjectCreateError("project_create_invalid_response", response.status)
  }
  const parsed = projectCreateResponseSchema.safeParse(payload)
  if (!parsed.success) throw new ProjectCreateError("project_create_invalid_response", response.status)
  return { id: parsed.data.data.project.id, slug: parsed.data.data.project.slug }
}
