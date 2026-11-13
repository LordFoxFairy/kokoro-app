import {
  projectAccessResponseSchema,
  projectGrantsResponseSchema,
  projectGrantResponseSchema,
  projectGrantRequestSchema,
  type ProjectAccess,
  type ProjectGrant,
  type ProjectGrantRequest,
} from "@/generated/bff-project-access"
export type { ProjectAccess, ProjectGrant, ProjectGrantRequest }
export class ProjectAccessError extends Error {
  constructor(
    readonly status: number | null,
    readonly code: string | null = null,
  ) {
    super("project_access_unavailable")
  }
}
export type ProjectGrantInput = { subjectId: string; key: string; version: string; body: ProjectGrantRequest }
const id = (value: string) => encodeURIComponent(value)
export async function projectAccessCall(
  projectId: string,
  operation: "access" | "list" | "set" | "revoke",
  signal: AbortSignal,
  input?: ProjectGrantInput,
  cursor?: string,
) {
  signal.throwIfAborted()
  if ((operation === "set" || operation === "revoke") !== Boolean(input)) throw new ProjectAccessError(null)
  const target = `/api/hub/projects/${id(projectId)}/${operation === "access" ? "access" : "grants"}${input ? `/${id(input.subjectId)}` : ""}${cursor ? `?cursor=${id(cursor)}` : ""}`
  const headers: Record<string, string> = {}
  if (input) {
    headers["idempotency-key"] = input.key
    headers["if-match"] = `"${input.version}"`
    if (operation === "set") headers["content-type"] = "application/json"
  }
  const response = await fetch(target, {
    method: operation === "set" ? "PUT" : operation === "revoke" ? "DELETE" : "GET",
    headers,
    signal,
    cache: "no-store",
    redirect: "error",
    ...(operation === "set" && input ? { body: JSON.stringify(projectGrantRequestSchema.parse(input.body)) } : {}),
  })
  signal.throwIfAborted()
  if (!response.ok) {
    let code: string | null = null
    try {
      const value: unknown = await response.json()
      if (
        typeof value === "object" &&
        value !== null &&
        "error" in value &&
        typeof value.error === "object" &&
        value.error !== null &&
        "code" in value.error &&
        typeof value.error.code === "string"
      )
        code = value.error.code
    } catch {
      /* A malformed failure is never a confirmed command outcome. */
    }
    signal.throwIfAborted()
    throw new ProjectAccessError(response.status, code)
  }
  const raw: unknown = await response.json()
  signal.throwIfAborted()
  const parsed =
    operation === "access"
      ? projectAccessResponseSchema.parse(raw)
      : operation === "list"
        ? projectGrantsResponseSchema.parse(raw)
        : projectGrantResponseSchema.parse(raw)
  if (Array.isArray(parsed.data)) {
    if (parsed.data.some((grant) => grant.project_id !== projectId)) throw new ProjectAccessError(null)
  } else {
    if (parsed.data.project_id !== projectId) throw new ProjectAccessError(null)
    if (input) {
      const grant = parsed.data
      if (
        !("subject_id" in grant) ||
        grant.subject_id !== input.subjectId ||
        grant.access_version !== String(BigInt(input.version) + BigInt(1))
      )
        throw new ProjectAccessError(null)
      if (
        operation === "set" &&
        (grant.role !== input.body.role ||
          grant.revoked_at !== null ||
          (grant.expires_at === null
            ? input.body.expires_at !== null
            : input.body.expires_at === null || Date.parse(grant.expires_at) !== Date.parse(input.body.expires_at)))
      )
        throw new ProjectAccessError(null)
      if (operation === "revoke" && grant.revoked_at === null) throw new ProjectAccessError(null)
    }
  }
  return parsed
}
export async function readProjectAccess(projectId: string, signal: AbortSignal): Promise<ProjectAccess> {
  return projectAccessResponseSchema.parse(await projectAccessCall(projectId, "access", signal)).data
}
