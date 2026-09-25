import { z } from "zod"

import { IAM_RELAY_POLICY } from "./iam-relay-policy"

const PAGE_PATH = "/iam/interactions/invitation"
const CANONICAL_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/u
const CONTEXT = z.object({ data: z.object({
  invitation_id: z.string().regex(CANONICAL_ID), tenant_id: z.string().min(1).max(128),
  tenant_name: z.string().min(1).max(200), roles: z.array(z.string().min(1).max(128)).min(1).max(32),
  status: z.literal("pending"), expires_at: z.string().datetime({ offset: true }),
}).strict() }).strict()

export const VERIFY_MESSAGES: Readonly<Record<string, string>> = {
  TOKEN_EXPIRED: "验证链接已过期，请联系邀请人重新发送邮件。",
  INVALID_TOKEN: "验证链接无效，请检查最新的邀请邮件。",
  USER_NOT_FOUND: "验证链接对应的账号不存在。",
  INVALID_USER: "此链接未能完成邮箱验证。",
}

export function parseInvitationTarget(raw: string): { id: string; error: string | null; query: string } | null {
  const authorityStart = raw.indexOf("://") + 3
  if (authorityStart < 3) return null
  const slash = raw.indexOf("/", authorityStart)
  const target = slash < 0 ? "/" : raw.slice(slash)
  const prefix = `${PAGE_PATH}?id=`
  if (!target.startsWith(prefix) || target.includes("#") || Buffer.byteLength(target) > IAM_RELAY_POLICY.maxQueryBytes) return null
  const remainder = target.slice(prefix.length)
  const [id, errorField, extra] = remainder.split("&")
  if (!id || !CANONICAL_ID.test(id) || extra !== undefined) return null
  if (errorField !== undefined && (!errorField.startsWith("error=") ||
    !IAM_RELAY_POLICY.invitationLocation.allowedErrorCodes.includes(errorField.slice(6)))) return null
  return { id, error: errorField === undefined ? null : errorField.slice(6), query: `?id=${id}` }
}

export function parseInvitationContext(body: Uint8Array, invitationId: string, tenantId: string): z.infer<typeof CONTEXT>["data"] | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body))
    const parsed = CONTEXT.safeParse(value)
    return parsed.success && parsed.data.data.invitation_id === invitationId && parsed.data.data.tenant_id === tenantId
      ? parsed.data.data : null
  } catch { return null }
}

export function isExpiredInvitationError(body: Uint8Array): boolean {
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body))
    return typeof value === "object" && value !== null && "error" in value &&
      typeof value.error === "object" && value.error !== null && "code" in value.error &&
      value.error.code === "INVITATION_EXPIRED"
  } catch { return false }
}

export async function readInvitationForm(request: Request): Promise<URLSearchParams | null> {
  if (request.headers.get("content-type") !== "application/x-www-form-urlencoded" || request.body === null ||
    request.headers.has("transfer-encoding")) return null
  const declared = request.headers.get("content-length")
  if (declared !== null && (!/^(0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > IAM_RELAY_POLICY.maxRequestBodyBytes)) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  const abort = (): void => { void reader.cancel().catch(() => undefined) }
  const deadline = setTimeout(abort, IAM_RELAY_POLICY.maxDurationMs)
  request.signal.addEventListener("abort", abort, { once: true })
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      total += part.value.byteLength
      if (total > IAM_RELAY_POLICY.maxRequestBodyBytes) { await reader.cancel().catch(() => undefined); return null }
      chunks.push(part.value)
    }
  } catch { return null }
  finally { clearTimeout(deadline); request.signal.removeEventListener("abort", abort); reader.releaseLock() }
  if (request.signal.aborted) return null
  let form: URLSearchParams
  try { form = new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks.map((part) => Buffer.from(part)), total))) }
  catch { return null }
  const action = form.get("decision")
  if (action !== "sign-in" && action !== "sign-up") return null
  const fields = action === "sign-in" ? ["csrf_token", "decision", "email", "password"] :
    ["csrf_token", "decision", "email", "name", "password"]
  if ([...form.keys()].length !== fields.length || fields.some((field) => form.getAll(field).length !== 1) ||
    [...form.keys()].some((field) => !fields.includes(field))) return null
  const email = form.get("email") ?? ""
  const password = form.get("password") ?? ""
  const name = form.get("name") ?? ""
  if (!/^[^\s@]{1,64}@[^\s@]{1,189}$/u.test(email) || password.length < 8 || Buffer.byteLength(password) > 1024 ||
    (action === "sign-up" && (name.trim() === "" || Buffer.byteLength(name) > 160 || /[\u0000-\u001f\u007f]/u.test(name)))) return null
  return form
}
