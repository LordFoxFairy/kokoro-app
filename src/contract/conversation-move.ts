import { z } from "zod"

export const canonicalConversationIdSchema = z.string().regex(
  /^conv_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
)

export const canonicalProjectIdSchema = z.string().regex(
  /^project_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
)

export const moveCommandIdSchema = z.string().regex(/^[\x21-\x2B\x2D-\x7E]{1,128}$/u)

export const moveSessionRequestSchema = z.object({
  target_project_id: canonicalProjectIdSchema.nullable(),
}).strict()

export const moveSessionResponseSchema = z.object({
  data: z.object({
    session_id: canonicalConversationIdSchema,
    project_ref: canonicalProjectIdSchema.nullable(),
  }).strict(),
}).strict()

export const moveSessionReceiptSchema = z.object({
  session_id: canonicalConversationIdSchema,
  project_ref: canonicalProjectIdSchema.nullable(),
}).strict()

export const moveSessionErrorCodeSchema = z.enum([
  "invalid_move_request",
  "idempotency_key_required",
  "session_authentication_required",
  "session_invalid",
  "service_auth_failed",
  "session_forbidden",
  "product_tenant_forbidden",
  "session_not_found",
  "idempotency_conflict",
  "idempotency_in_progress",
  "session_rate_limited",
  "business_store_unavailable",
  "iam_admission_unavailable",
])

export const moveSessionErrorResponseSchema = z.object({
  error: z.object({
    code: moveSessionErrorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
  }).strict(),
}).strict()

export const moveRequestIdSchema = z.string().min(1).max(128)
export const moveRetryAfterSchema = z.string().regex(/^[1-9][0-9]{0,4}$/u)

type MoveSessionErrorCode = z.infer<typeof moveSessionErrorCodeSchema>

const MOVE_ERROR_CODES_BY_STATUS = {
  400: new Set(["invalid_move_request", "idempotency_key_required"]),
  401: new Set(["session_authentication_required", "session_invalid"]),
  403: new Set(["service_auth_failed", "session_forbidden", "product_tenant_forbidden"]),
  404: new Set(["session_not_found"]),
  409: new Set(["idempotency_conflict", "idempotency_in_progress"]),
  429: new Set(["session_rate_limited"]),
  503: new Set(["business_store_unavailable", "iam_admission_unavailable"]),
} satisfies Readonly<Record<number, ReadonlySet<z.infer<typeof moveSessionErrorCodeSchema>>>>

export function isMoveSessionErrorStatusCode(
  status: number,
  code: MoveSessionErrorCode,
): boolean {
  const codes: ReadonlySet<MoveSessionErrorCode> | undefined =
    MOVE_ERROR_CODES_BY_STATUS[status as keyof typeof MOVE_ERROR_CODES_BY_STATUS]
  return codes?.has(code) ?? false
}

export type MoveSessionRequest = z.infer<typeof moveSessionRequestSchema>
export type MoveSessionResponse = z.infer<typeof moveSessionResponseSchema>
export type MoveSessionReceipt = z.infer<typeof moveSessionReceiptSchema>
export type MoveSessionErrorResponse = z.infer<typeof moveSessionErrorResponseSchema>
