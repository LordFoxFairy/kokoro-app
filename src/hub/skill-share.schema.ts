// BFF 4c8dc33 / Public14.0 exact Skill Share consumer. No current-series fallback.
import { z } from "zod"
import { skillDownloadSchema, skillDownloadErrorAllowed, type SkillDownload } from "./skill-download.schema"

export const shareIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])/u)
const source = z.string().regex(/^skill:[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])/u)
export const shareCreateSchema = z.object({ source_ref: source, expires_at: z.string().datetime({ offset: true }).nullable().optional() }).strict()
export const shareAckSchema = z.object({ share_id: shareIdSchema, source_ref: source, url: z.string().url(), created_at: z.string().datetime({ offset: true }), expires_at: z.string().datetime({ offset: true }).nullable(), revoked_at: z.string().datetime({ offset: true }).nullable() }).strict()
export const shareRevisionSchema = z.string().regex(/^[1-9][0-9]{0,19}(?![\s\S])/u).refine(v => BigInt(v) <= BigInt("18446744073709551615"))
export const sharedSkillSchema = z.object({
  skill_id: shareIdSchema, series_id: shareIdSchema,
  revision: shareRevisionSchema,
  display_name: z.string().min(1).max(255), description: z.string().max(65535), tags: z.array(z.string()), example_prompts: z.array(z.string()),
  category_keys: z.array(z.enum(["programming", "data", "automation", "business", "design", "media", "content", "apps"])),
  created_at: z.string().datetime(), updated_at: z.string().datetime(), owner_type: z.enum(["personal", "official", "team", "project", "app"]), source_kind: z.enum(["personal", "official", "third_party"]),
  original_name: z.string().min(1).optional(), author: z.object({ user_id: shareIdSchema, display_name: z.string().min(1) }).strict().optional(), cover_image: z.string().optional(),
}).strict().refine(v => v.cover_image === undefined || v.cover_image === `/api/v1/skills/${encodeURIComponent(v.skill_id)}/cover`)
export const shareSummarySchema = z.object({ share_id: shareIdSchema, source_ref: source, skill: sharedSkillSchema }).strict().refine(v => v.source_ref === `skill:${v.skill.skill_id}`)
export const shareSchemas = { create: shareAckSchema, resolve: shareAckSchema, summary: shareSummarySchema, download: skillDownloadSchema } as const
export type ShareOperation = keyof typeof shareSchemas
export type ShareAck = z.infer<typeof shareAckSchema>
export type SharedSkill = z.infer<typeof sharedSkillSchema>
export type ShareSummary = z.infer<typeof shareSummarySchema>
export const shareErrorSchema = z.object({ error: z.object({ code: z.string().min(1), message: z.string().min(1), retryable: z.boolean() }).strict() }).strict()
const errors: Readonly<Record<number, readonly string[]>> = {
  400: ["invalid_skill_request"], 401: ["session_authentication_required", "session_invalid"],
  403: ["service_auth_failed", "session_forbidden", "product_tenant_forbidden", "skill_forbidden"],
  404: ["skill_not_found"], 409: ["skill_idempotency_conflict", "skill_command_in_progress"], 412: ["skill_precondition_failed"], 413: ["request_body_too_large"],
  429: ["session_rate_limited", "skill_rate_limited"], 502: ["skill_response_invalid"], 503: ["product_tenant_not_configured", "iam_admission_unavailable", "skill_dependency_unavailable"],
}
export function shareErrorAllowed(operation: ShareOperation, status: number, code: string): boolean { return Object.hasOwn(shareSchemas, operation) && (operation === "download" ? skillDownloadErrorAllowed(status, code) : errors[status]?.includes(code) ?? false) }
export function shareMatches(operation: ShareOperation, data: ShareAck | ShareSummary | SkillDownload, identity: string, origin: string): boolean {
  if (operation === "download") return "download_info" in data && Date.parse(data.download_info.expires_at) > Date.now()
  if (operation === "summary") return "share_id" in data && data.share_id === identity && "skill" in data && data.source_ref === `skill:${data.skill.skill_id}`
  if (!("url" in data) || (operation === "create" ? data.source_ref !== identity : data.share_id !== identity) || data.revoked_at !== null || data.expires_at !== null && Date.parse(data.expires_at) <= Date.now()) return false
  try { const url = new URL(data.url); return url.origin === origin && url.href === `${origin}/skills/shared/${encodeURIComponent(data.share_id)}` } catch { return false }
}
