import { z } from "zod"
import * as wire from "@/generated/bff-account-sessions/zod.gen"

const session = wire.zAccountSession.strict()
export const accountSessionsSchema = wire.zAccountSessionsResponse.extend({
  data: wire.zAccountSessionsResponse.shape.data.extend({ current_session: session, sessions: z.array(session).max(100) }).strict(),
  meta: wire.zAccountSessionsResponse.shape.meta.strict(),
}).strict()
export const accountSessionRevokeSchema = wire.zAccountSessionRevokeResponse.extend({
  data: wire.zAccountSessionRevokeResponse.shape.data.strict(), meta: wire.zRequestMeta.strict(),
}).strict()
const errors = { 400: wire.zAccountSessionError400, 401: wire.zAccountSessionError401, 403: wire.zAccountSessionError403,
  404: wire.zAccountSessionError404, 409: wire.zAccountSessionError409, 413: wire.zAccountSessionError413,
  429: wire.zAccountSessionError429, 502: wire.zAccountSessionError502, 503: wire.zAccountSessionError503 }
export const accountSessionErrorSchemas = Object.fromEntries(Object.entries(errors).map(([status, schema]) => [status,
  schema.extend({ error: schema.shape.error.strict(), meta: wire.zRequestMeta.strict() }).strict()]))
export type AccountSession = z.infer<typeof session>
export type AccountSessions = z.infer<typeof accountSessionsSchema>
export type AccountSessionRevoke = z.infer<typeof accountSessionRevokeSchema>
export function validateAccountSessionPage(raw: unknown, requestId: string, limit: number, cursor?: string): AccountSessions {
  const page = accountSessionsSchema.parse(raw)
  const ids = page.data.sessions.map((item) => item.session_id)
  if (page.meta.request_id !== requestId || ids.length > limit || new Set(ids).size !== ids.length || ids.includes(page.data.current_session.session_id) ||
    (page.meta.next_cursor !== null && (page.data.sessions.length === 0 || page.meta.next_cursor === cursor))) throw new Error("Invalid account session page")
  return page
}

export const accountSessionLocalErrorSchemas = Object.fromEntries(Object.entries({
  400: ["account_session_invalid_request"], 401: ["account_session_session_required"],
  403: ["account_session_forbidden_origin"], 405: ["account_session_method_not_allowed"],
  502: ["account_session_response_invalid"], 503: ["account_session_dependency_unavailable"],
}).map(([status, codes]) => [status, z.object({ error: z.object({ code: z.string().refine((code) => codes.includes(code)), message: z.string().min(1) }).strict(), meta: wire.zRequestMeta.strict() }).strict()]))
