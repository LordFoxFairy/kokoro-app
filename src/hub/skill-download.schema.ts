import { z } from "zod"

// Shared BFF exact-package qualification for installation and share downloads.
export const skillDownloadSchema = z.object({ source_ref: z.string().regex(/^skill:[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])/u), revision: z.string().regex(/^[1-9][0-9]{0,19}(?![\s\S])/u).refine(v => BigInt(v) <= BigInt("18446744073709551615")), download_info: z.object({ download_url: z.string().regex(/^\/skill-downloads\/[A-Za-z0-9_-]{43}(?![\s\S])/u), filename: z.string().min(1).max(255).refine(value => !/[\\/\u0000-\u001f\u007f]/u.test(value)), expires_at: z.string().datetime({ offset: true }) }).strict() }).strict()
export type SkillDownload = z.infer<typeof skillDownloadSchema>
const errors: Readonly<Record<number, readonly string[]>> = {
  400: ["invalid_skill_request"], 401: ["session_authentication_required", "session_invalid"],
  403: ["service_auth_failed", "product_tenant_forbidden", "session_forbidden", "skill_download_forbidden"], 404: ["skill_not_found"], 405: ["MethodNotAllowed"],
  429: ["session_rate_limited", "skill_rate_limited"], 502: ["skill_response_invalid"],
  503: ["product_tenant_not_configured", "iam_admission_unavailable", "skill_dependency_unavailable"], 504: ["skill_deadline_exceeded"],
}
export function skillDownloadErrorAllowed(status: number, code: string): boolean { return errors[status]?.includes(code) ?? false }
