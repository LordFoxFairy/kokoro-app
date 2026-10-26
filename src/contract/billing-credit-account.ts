import { z } from "zod"

import { billingSummarySchema } from "./billing"
import { projectRenameRetryAfterValid } from "./project-rename"

export const creditAccountBrowserCache = "private, no-store, max-age=0"
export const creditAccountMaxBytes = 1_048_576
export const creditAccountPath = "/api/session/billing/credit-account"
const requestId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u)
const meta = z.object({ request_id: requestId }).strict()
export const creditAccountOwnerAck = z.object({ data: billingSummarySchema.extend({ status: z.literal("active") }), meta }).strict()
export const creditAccountBrowserAck = billingSummarySchema.extend({ status: z.literal("active") })
export const creditAccountError = z.object({ error: z.object({
  code: z.string(), message: z.string().min(1), retryable: z.boolean(),
}).strict() }).strict()
export const creditAccountOwnerError = creditAccountError.extend({ meta }).strict()

/** Status/code/retryable are one published tuple, not independently trustworthy fields. */
export function creditAccountErrorAllowed(status: number, code: string, retryable: boolean, local = false): boolean {
  const codes: Readonly<Record<number, readonly string[]>> = {
    400: ["billing_credit_account_input_invalid"],
    401: ["session_authentication_required", "session_invalid"],
    403: ["service_auth_failed", "session_forbidden", "product_tenant_forbidden", "billing_account_disabled"],
    429: ["session_rate_limited"],
    502: ["upstream_response_invalid"],
    503: ["product_tenant_not_configured", "iam_admission_unavailable", "billing_unavailable"],
  }
  if (codes[status]?.includes(code)) return retryable === (status === 429 || status === 503)
  const localCodes: Readonly<Record<number, readonly string[]>> = {
    405: ["credit_account_method_not_allowed"], 499: ["request_aborted"], 504: ["request_timeout"],
    502: ["invalid_response"], 503: ["network_error"],
  }
  return local && localCodes[status]?.includes(code) === true && retryable === (status !== 405)
}

export function creditAccountHeadersValid(headers: Headers, status: number, boundary: "owner" | "browser", expectedId?: string): boolean {
  const id = headers.get("x-request-id"), retry = headers.get("retry-after"), length = headers.get("content-length")
  let size = 0
  headers.forEach((value, name) => { size += new TextEncoder().encode(`${name}: ${value}\r\n`).byteLength })
  return size <= creditAccountMaxBytes && requestId.safeParse(id).success && (expectedId === undefined || id === expectedId)
    && /^application\/json(?:;\s*charset=utf-8)?$/iu.test(headers.get("content-type") ?? "")
    && headers.get("cache-control") === (boundary === "owner" ? "no-store" : creditAccountBrowserCache)
    && !["set-cookie", "location", "content-encoding", "transfer-encoding"].some(name => headers.has(name))
    && (length === null || /^(0|[1-9][0-9]*)$/u.test(length) && Number(length) <= creditAccountMaxBytes)
    && (retry === null ? status !== 429 || boundary === "browser" : status === 429 && projectRenameRetryAfterValid(retry))
}

export function creditAccountHeaderBytes(headers: Headers): number {
  let bytes = 0
  headers.forEach((value, name) => { bytes += new TextEncoder().encode(`${name}: ${value}\r\n`).byteLength })
  return bytes
}
