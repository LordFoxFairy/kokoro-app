import { z } from "zod"

export const projectRenameIdSchema = z.string().regex(/^project_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/u)
export const projectRenameKeySchema = z.string().regex(/^[\x21-\x2b\x2d-\x7e]{1,128}(?![\s\S])/u)
export const projectRenameNameSchema = z.string().min(1).max(160).refine((value) => {
  if (value !== value.trim() || value.includes("\0")) return false
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false
  }
  return true
})
export const projectRenameRequestSchema = z.object({ name: z.string().transform((value) => value.trim()).pipe(projectRenameNameSchema) }).strict()
export const projectRenameAckSchema = z.object({ data: z.object({
  project_id: projectRenameIdSchema, name: projectRenameNameSchema,
}).strict() }).strict()
export const projectRenameOwnerErrorSchema = z.object({ error: z.object({
  code: z.enum(["invalid_project_rename", "idempotency_key_required", "session_authentication_required", "session_invalid",
    "session_forbidden", "product_tenant_forbidden", "service_auth_failed", "project_not_found", "idempotency_conflict",
    "session_rate_limited", "business_store_unavailable", "iam_admission_unavailable", "product_tenant_not_configured"]),
  message: z.string().min(1), retryable: z.boolean(),
}).strict() }).strict()
export const projectRenameFaultSchema = z.enum(["request_timeout", "request_aborted", "network_error", "invalid_headers",
  "invalid_json", "unexpected_status", "ack_shape_mismatch", "read_after_ack_failed"])
export const projectRenameLocalErrorSchema = z.object({ error: z.object({
  code: projectRenameFaultSchema, message: z.string().min(1), retryable: z.boolean(),
}).strict() }).strict()
export type ProjectRenameFault = z.infer<typeof projectRenameFaultSchema>
export type ProjectRenameOwnerCode = z.infer<typeof projectRenameOwnerErrorSchema>["error"]["code"]
export type ProjectRenameIntent = Readonly<{ projectId: string; name: string; idempotencyKey: string; body: string }>

export function projectRenameOwnerErrorAllowed(status: number, code: ProjectRenameOwnerCode, retryable: boolean): boolean {
  const codes: Readonly<Record<number, readonly ProjectRenameOwnerCode[]>> = {
    400: ["invalid_project_rename", "idempotency_key_required"],
    401: ["session_authentication_required", "session_invalid"],
    403: ["session_forbidden", "product_tenant_forbidden", "service_auth_failed"],
    404: ["project_not_found"], 409: ["idempotency_conflict"], 429: ["session_rate_limited"],
    503: ["business_store_unavailable", "iam_admission_unavailable", "product_tenant_not_configured"],
  }
  return codes[status]?.includes(code) === true && retryable === (status === 429 || status === 503)
}
export function projectRenameLocalErrorAllowed(status: number, code: ProjectRenameFault): boolean {
  return ({ request_timeout: 504, request_aborted: 499, network_error: 503, invalid_headers: 502,
    invalid_json: 502, unexpected_status: 502, ack_shape_mismatch: 502, read_after_ack_failed: 502 })[code] === status
}
export const projectRenameOwnerCacheControl = "no-store"
export const projectRenameBrowserCacheControl = "private, no-store, max-age=0"

function projectRenameJsonHeadersValid(headers: Headers, cacheControl: string): boolean {
  return /^application\/json(?:;\s*charset=utf-8)?(?![\s\S])/iu.test(headers.get("content-type") ?? "")
    && headers.get("cache-control") === cacheControl
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(headers.get("x-request-id") ?? "")
}

export function projectRenameOwnerHeadersValid(headers: Headers): boolean {
  return projectRenameJsonHeadersValid(headers, projectRenameOwnerCacheControl)
}

export function projectRenameBrowserHeadersValid(headers: Headers): boolean {
  return projectRenameJsonHeadersValid(headers, projectRenameBrowserCacheControl)
}
export function projectRenameAckMatches(raw: unknown, intent: Pick<ProjectRenameIntent, "projectId" | "name">): boolean {
  const result = projectRenameAckSchema.safeParse(raw)
  return result.success && result.data.data.project_id === intent.projectId && result.data.data.name === intent.name
}

/** Reject duplicate keys before Zod closure; JSON.parse alone loses that evidence. */
export function parseProjectRenameJson(text: string): unknown {
  const value: unknown = JSON.parse(text)
  const tokens = text.match(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\]:,]|[^\s{}\[\]:,]+/gu) ?? []
  let cursor = 0
  const visit = (): void => {
    const token = tokens[cursor++]
    if (token === "{") {
      const keys = new Set<string>()
      if (tokens[cursor] === "}") { cursor++; return }
      do {
        const key = JSON.parse(tokens[cursor++]!) as string
        if (keys.has(key)) throw new SyntaxError("Duplicate JSON key")
        keys.add(key)
        cursor++ // colon (syntax already validated by JSON.parse)
        visit()
      } while (tokens[cursor++] === ",")
    } else if (token === "[") {
      if (tokens[cursor] === "]") { cursor++; return }
      do { visit() } while (tokens[cursor++] === ",")
    }
  }
  visit()
  return value
}

export function projectRenameRetryAfterValid(value: string): boolean {
  return /^(?:[1-9][0-9]{0,3}|[1-7][0-9]{4}|8[0-5][0-9]{3}|86[0-3][0-9]{2}|86400)(?![\s\S])/u.test(value)
}
