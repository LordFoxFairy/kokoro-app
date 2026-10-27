import { z } from "zod"

import { parseProjectRenameJson, projectRenameIdSchema, projectRenameKeySchema } from "./project-rename"

// Mirrors the fixed public BFF ProjectDeletionAccepted/StatusResource shapes.
export const projectDeletionIdSchema = projectRenameIdSchema
export const projectDeletionKeySchema = projectRenameKeySchema

const projectDeletionResourceBaseSchema = z.object({
  project_id: projectDeletionIdSchema,
  logical_release_state: z.enum(["pending", "blocked", "released"]),
  physical_cleanup_state: z.literal("pending"),
}).strict()

export const projectDeletionAcceptedSchema = z.object({
  data: projectDeletionResourceBaseSchema.extend({ logical_release_state: z.literal("pending") }),
}).strict()
export const projectDeletionStatusSchema = z.object({ data: projectDeletionResourceBaseSchema }).strict()
export const projectDeletionOwnerErrorSchema = z.object({ error: z.object({
  code: z.enum([
    "invalid_project_deletion_request", "idempotency_key_required", "invalid_idempotency_key",
    "session_authentication_required", "session_invalid", "service_auth_failed", "session_forbidden",
    "product_tenant_forbidden", "project_not_found", "idempotency_conflict", "idempotency_in_progress",
    "session_rate_limited", "product_tenant_not_configured", "iam_admission_unavailable", "business_store_unavailable",
  ]),
  message: z.string().min(1),
  retryable: z.boolean(),
}).strict() }).strict()

export const projectDeletionFaultSchema = z.enum([
  "request_timeout", "request_aborted", "network_error", "invalid_headers", "invalid_json",
  "unexpected_status", "ack_shape_mismatch",
])
export type ProjectDeletionFault = z.infer<typeof projectDeletionFaultSchema>
export type ProjectDeletionOwnerCode = z.infer<typeof projectDeletionOwnerErrorSchema>["error"]["code"]
export type ProjectDeletionIntent = Readonly<{ projectId: string; idempotencyKey: string; body: null }>
export type ProjectDeletionResource = z.infer<typeof projectDeletionResourceBaseSchema>

export function parseProjectDeletionJson(text: string): unknown {
  return parseProjectRenameJson(text)
}

export function projectDeletionBrowserHeadersValid(headers: Headers): boolean {
  return /^application\/json(?:;\s*charset=utf-8)?(?![\s\S])/iu.test(headers.get("content-type") ?? "")
    && headers.get("cache-control") === "private, no-store"
}

export function projectDeletionOwnerErrorAllowed(status: number, code: ProjectDeletionOwnerCode, retryable: boolean, readOnly: boolean): boolean {
  const common: Readonly<Record<number, readonly ProjectDeletionOwnerCode[]>> = {
    400: ["invalid_project_deletion_request"],
    401: ["session_authentication_required", "session_invalid"],
    403: ["service_auth_failed", "session_forbidden", "product_tenant_forbidden"],
    404: ["project_not_found"],
    429: ["session_rate_limited"],
    503: ["product_tenant_not_configured", "iam_admission_unavailable", "business_store_unavailable"],
  }
  const writeOnly: Readonly<Record<number, readonly ProjectDeletionOwnerCode[]>> = {
    400: ["idempotency_key_required", "invalid_idempotency_key"],
    409: ["idempotency_conflict", "idempotency_in_progress"],
  }
  const allowed = [...(common[status] ?? []), ...(!readOnly ? writeOnly[status] ?? [] : [])]
  return allowed.includes(code) && retryable === (status === 429 || status === 503 || code === "idempotency_in_progress")
}

export function projectDeletionAcceptedMatches(raw: unknown, projectId: string): raw is z.infer<typeof projectDeletionAcceptedSchema> {
  const parsed = projectDeletionAcceptedSchema.safeParse(raw)
  return parsed.success && parsed.data.data.project_id === projectId
}

export function projectDeletionStatusMatches(raw: unknown, projectId: string): raw is z.infer<typeof projectDeletionStatusSchema> {
  const parsed = projectDeletionStatusSchema.safeParse(raw)
  return parsed.success && parsed.data.data.project_id === projectId
}
