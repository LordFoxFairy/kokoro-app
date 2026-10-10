import { z } from "zod"
import { managedPersonalSkillSchema, personalInstallationSchema } from "./schemas"

export const localImportIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])/u)
export const localImportKeySchema = z.string().regex(/^[\x21-\x2B\x2D-\x7E]{1,128}(?![\s\S])/u)
const sha = z.string().regex(/^[a-f0-9]{64}(?![\s\S])/u)
const size = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const timestamp = z.string().datetime().regex(/Z$/u)
export const packageSourceVersionSchema = z.string().min(1).max(1024).regex(/^[\x20-\x7e]+(?![\s\S])/u)
export const packageTransferSchema = z.object({
  url: z.string().url(), method: z.literal("PUT"),
  required_headers: z.record(z.string().regex(/^[a-z0-9-]+(?![\s\S])/u), z.string().min(1).refine((v) => !/[\r\n]/u.test(v))),
  expires_at: timestamp,
}).strict().refine((v) => !Object.keys(v.required_headers).some((k) => ["authorization", "cookie", "host", "origin", "content-length", "transfer-encoding"].includes(k)))
export type PackageTransfer = z.infer<typeof packageTransferSchema>
export const localImportBeginRequestSchema = z.object({ filename: z.string().min(1).max(255).regex(/^[^\u0000-\u001f\u007f/\\]+\.(?:zip|skill)$/u), size_bytes: size, content_sha256: sha }).strict()
export const localImportCompleteRequestSchema = z.object({ upload_id: localImportIdSchema, source_version_id: packageSourceVersionSchema, size_bytes: size, content_sha256: sha }).strict()
export const localImportProofSchema = z.object({ upload_id: localImportIdSchema, asset_id: localImportIdSchema, source_version_id: packageSourceVersionSchema, size_bytes: z.string().max(20).refine((v) => /^[1-9][0-9]{0,19}(?![\s\S])/u.test(v) && BigInt(v) <= BigInt("18446744073709551615")), content_sha256: sha }).strict()
export const localImportSkillSchema = managedPersonalSkillSchema.omit({ publisher_profile: true }).extend({ package_phase: z.enum(["none", "upload_pending", "uploaded", "valid", "aborted"]) }).strict().refine((v) => v.source_ref === `skill:${v.skill_id}` && /^[1-9][0-9]{0,19}(?![\s\S])/u.test(v.revision) && BigInt(v.revision) <= BigInt("18446744073709551615"))
const installationMatches = (skill: z.infer<typeof localImportSkillSchema>, installation: z.infer<typeof personalInstallationSchema>) => skill.source_ref === installation.source_ref && skill.series_id === installation.series_id && skill.revision === installation.revision
export const localImportBeginSchema = z.object({ intent_id: localImportIdSchema, skill_id: localImportIdSchema, phase: z.literal("upload_pending"), upload_id: localImportIdSchema, transfer_reference: packageTransferSchema, expires_at: timestamp, replayed: z.boolean() }).strict()
export const localImportCompleteSchema = z.object({ intent_id: localImportIdSchema, skill_id: localImportIdSchema, phase: z.literal("uploaded"), upload_proof: localImportProofSchema, scan_state: z.enum(["pending", "clean", "infected", "unknown"]), expires_at: timestamp, replayed: z.boolean() }).strict()
export const localImportFinalizeSchema = z.object({ intent_id: localImportIdSchema, phase: z.literal("completed"), skill: localImportSkillSchema, installation: personalInstallationSchema, replayed: z.boolean() }).strict().refine((v) => installationMatches(v.skill, v.installation) && v.skill.status === "active" && v.skill.product.publication_audience === "owner" && v.skill.product.source_kind === "personal" && v.installation.installed && v.installation.enabled && v.installation.source_status === "active" && v.installation.product.publication_audience === "owner" && v.installation.product.source_kind === "personal")
export const localImportGetSchema = z.object({ intent_id: localImportIdSchema, skill_id: localImportIdSchema, phase: z.enum(["upload_pending", "uploaded", "completed", "rejected", "expired"]), expires_at: timestamp, upload_proof: localImportProofSchema.optional(), rejection_code: localImportIdSchema.optional(), skill: localImportSkillSchema.optional(), installation: personalInstallationSchema.optional() }).strict().refine((v) => {
  if ((v.phase === "rejected") !== (v.rejection_code !== undefined)) return false
  if (v.phase === "upload_pending" && v.upload_proof !== undefined) return false
  if (["uploaded", "completed", "rejected"].includes(v.phase) && v.upload_proof === undefined) return false
  if (v.phase !== "completed") return v.skill === undefined && v.installation === undefined
  return v.skill !== undefined && v.skill.series_id === v.skill_id && (v.installation === undefined || installationMatches(v.skill, v.installation))
})
export type LocalImportOperation = "begin" | "complete" | "finalize" | "get"
export const localImportSchemas = { begin: localImportBeginSchema, complete: localImportCompleteSchema, finalize: localImportFinalizeSchema, get: localImportGetSchema } as const
export const localImportErrorSchema = z.object({ error: z.object({ code: z.string().min(1), message: z.string().min(1), retryable: z.boolean() }).strict() }).strict()
export function localImportErrorAllowed(operation: LocalImportOperation, status: number, code: string): boolean {
  const common: Record<number, readonly string[]> = { 400: ["invalid_local_skill_import_request"], 401: ["session_authentication_required", "session_invalid"], 403: ["service_auth_failed", "session_forbidden", "product_tenant_forbidden"], 404: ["local_skill_import_not_found"], 412: ["local_skill_import_precondition_failed"], 429: ["session_rate_limited", "local_skill_import_rate_limited"], 502: ["local_skill_import_response_invalid"], 503: ["product_tenant_not_configured", "iam_admission_unavailable", "local_skill_import_dependency_unavailable"] }
  const writes: Record<number, readonly string[]> = { 400: ["local_skill_import_idempotency_key_required"], 403: ["skill_forbidden"], 409: ["local_skill_import_idempotency_conflict"], 413: ["request_body_too_large"], 429: ["skill_rate_limited"] }
  return (common[status]?.includes(code) ?? false) || (operation !== "get" && (writes[status]?.includes(code) ?? false))
}
export function localImportMatches(operation: LocalImportOperation, data: unknown, id?: string, body?: z.infer<typeof localImportCompleteRequestSchema>): boolean {
  const parsed = localImportSchemas[operation].safeParse(data)
  if (!parsed.success) return false
  if (id !== undefined && parsed.data.intent_id !== id) return false
  if (operation === "complete" && body !== undefined) {
    const result = localImportCompleteSchema.parse(data).upload_proof
    return result.upload_id === body.upload_id && result.source_version_id === body.source_version_id && result.content_sha256 === body.content_sha256 && result.size_bytes === String(body.size_bytes)
  }
  return true
}
