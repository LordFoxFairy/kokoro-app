import { z } from "zod"

import { projectRenameIdSchema, projectRenameKeySchema, projectRenameRetryAfterValid } from "./project-rename"

// These exact ID/key grammars are shared owner facts, not a second Project identity model.
export const projectDeletionIdSchema = projectRenameIdSchema
export const projectDeletionKeySchema = projectRenameKeySchema
export type ProjectDeletionMethod = "GET" | "DELETE"
export type ProjectDeletionIntent = Readonly<{ projectId: string; idempotencyKey: string }>

const acceptedResource = z.object({
  project_id: projectDeletionIdSchema,
  logical_release_state: z.literal("pending"),
  physical_cleanup_state: z.literal("pending"),
}).strict()
export const projectDeletionAcceptedSchema = z.object({ data: acceptedResource }).strict()
export const projectDeletionStatusSchema = z.object({ data: acceptedResource.extend({
  logical_release_state: z.enum(["pending", "blocked", "released"]),
}) }).strict()
export type ProjectDeletionSnapshot = Readonly<z.infer<typeof projectDeletionStatusSchema>["data"]>

export function projectDeletionAcceptedMatches(input: Readonly<{ raw: unknown; projectId: string }>): boolean {
  const parsed = projectDeletionAcceptedSchema.safeParse(input.raw)
  return parsed.success && parsed.data.data.project_id === input.projectId
}
export function projectDeletionStatusMatches(input: Readonly<{ raw: unknown; projectId: string }>): boolean {
  const parsed = projectDeletionStatusSchema.safeParse(input.raw)
  return parsed.success && parsed.data.data.project_id === input.projectId
}

export const projectDeletionOwnerErrorSchema = z.object({ error: z.object({
  code: z.enum(["invalid_project_deletion_request", "idempotency_key_required", "invalid_idempotency_key",
    "session_authentication_required", "session_invalid", "service_auth_failed", "session_forbidden", "product_tenant_forbidden",
    "project_not_found", "idempotency_conflict", "idempotency_in_progress", "session_rate_limited",
    "product_tenant_not_configured", "iam_admission_unavailable", "business_store_unavailable"]),
  message: z.string().min(1), retryable: z.boolean(),
}).strict() }).strict()
export type ProjectDeletionOwnerCode = z.infer<typeof projectDeletionOwnerErrorSchema>["error"]["code"]

export function projectDeletionOwnerErrorAllowed(input: Readonly<{
  method: ProjectDeletionMethod; status: number; code: string; retryable: boolean
}>): boolean {
  const codes: Readonly<Record<number, readonly string[]>> = {
    400: ["invalid_project_deletion_request", ...(input.method === "DELETE" ? ["idempotency_key_required", "invalid_idempotency_key"] : [])],
    401: ["session_authentication_required", "session_invalid"],
    403: ["service_auth_failed", "session_forbidden", "product_tenant_forbidden"],
    404: ["project_not_found"],
    409: input.method === "DELETE" ? ["idempotency_conflict", "idempotency_in_progress"] : [],
    429: ["session_rate_limited"],
    503: ["product_tenant_not_configured", "iam_admission_unavailable", "business_store_unavailable"],
  }
  return codes[input.status]?.includes(input.code) === true
    && input.retryable === (input.status === 429 || input.status === 503 || input.status === 409 && input.code === "idempotency_in_progress")
}

export const projectDeletionFaultSchema = z.enum(["request_timeout", "request_aborted", "network_error", "invalid_headers",
  "invalid_json", "unexpected_status", "ack_shape_mismatch", "project_deletion_method_not_allowed"])
export type ProjectDeletionFault = z.infer<typeof projectDeletionFaultSchema>
export const projectDeletionLocalErrorSchema = z.object({ error: z.object({
  code: projectDeletionFaultSchema, message: z.string().min(1), retryable: z.boolean(),
}).strict() }).strict()
export function projectDeletionLocalErrorAllowed(input: Readonly<{
  status: number; code: ProjectDeletionFault; retryable: boolean
}>): boolean {
  const statuses: Readonly<Record<ProjectDeletionFault, number>> = {
    request_timeout: 504, request_aborted: 499, network_error: 503, invalid_headers: 502,
    invalid_json: 502, unexpected_status: 502, ack_shape_mismatch: 502, project_deletion_method_not_allowed: 405,
  }
  return statuses[input.code] === input.status && input.retryable === (input.status !== 405)
}

export const projectDeletionBrowserCacheControl = "private, no-store, max-age=0"
export const projectDeletionMaxResponseBytes = 1_048_576

export function projectDeletionHeadersValid(input: Readonly<{
  headers: Headers; status: number; projectId: string; boundary: "owner" | "browser"; requestId?: string
}>): boolean {
  const { headers, status, projectId } = input
  const requestId = headers.get("x-request-id")
  const retry = headers.get("retry-after")
  return /^application\/json(?:;\s*charset=utf-8)?(?![\s\S])/iu.test(headers.get("content-type") ?? "")
    && headers.get("cache-control") === (input.boundary === "owner" ? "no-store" : projectDeletionBrowserCacheControl)
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}(?![\s\S])/u.test(requestId ?? "")
    && (input.requestId === undefined || requestId === input.requestId)
    && !headers.has("set-cookie")
    && (status === 202 ? headers.get("location") === `/v1/projects/${projectId}/deletion` : !headers.has("location"))
    && (retry === null || status === 429 && projectRenameRetryAfterValid(retry))
}
