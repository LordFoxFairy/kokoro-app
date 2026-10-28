// Consumer boundary: BFF d040eb04c5875eec2ade19be947435071dca2a5e / Public28.7; canonical SHA256
// 818dfe54d5eb50a72725983be136211c63bb17fa7392f94c5c1d46234db3ebd1.
import { z } from "zod"
import { createSkillDraftRequestSchema } from "./schemas"

export type GithubImportOperation = "preview" | "import"
const owner = z.string().max(39).regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?![\s\S])/u)
const repository = z.string().max(100).regex(/^[A-Za-z0-9_.-]+(?![\s\S])/u).refine(v => v !== "." && v !== "..")
const commit = z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?(?![\s\S])/u)
const sha = z.string().regex(/^[a-f0-9]{64}(?![\s\S])/u)
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])/u)
const positiveDecimal = z.string().max(19).regex(/^[1-9][0-9]*(?![\s\S])/u).refine(v => BigInt(v) <= BigInt("9223372036854775807"))
const counter = z.string().max(19).regex(/^(?:0|[1-9][0-9]*)(?![\s\S])/u)
export const githubPathSchema = z.string().max(256).refine(v => v === "" || !v.includes("\\") && !v.startsWith("/") && v.split("/").every(part => part !== "" && part !== "." && part !== ".."))
export const githubKeySchema = z.string().regex(/^[\x21-\x2B\x2D-\x7E]{1,128}(?![\s\S])/u)
export const githubRepositoryUrlSchema = z.string().max(2048).refine(value => {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/u.exec(value)
  return match !== null && owner.safeParse(match[1]).success && repository.safeParse(match[2]).success
})
export const githubSelectorSchema = z.object({ owner, repository, commit, path: githubPathSchema }).strict()
export const githubPreviewRequestSchema = z.object({ repository_url: githubRepositoryUrlSchema, path: githubPathSchema.optional() }).strict()
const repositoryFacts = z.object({
  repository_id: z.string().min(1).max(255), repository_url: z.string().url().max(2048),
  owner_login: z.string().min(1).max(255), owner_url: z.string().url().max(2048), commit, path: githubPathSchema,
  repo_stats: z.object({ stars: counter, forks: counter, observed_at: z.string().datetime({ offset: true }), metadata_source_url: z.string().url().max(2048) }).strict(),
}).strict()
const selectedPreview = z.object({ selection_required: z.literal(false), selector: githubSelectorSchema, metadata: createSkillDraftRequestSchema, repository: repositoryFacts, content_sha256: sha, size_bytes: positiveDecimal }).strict().refine(v => {
  const s = v.selector, r = v.repository
  return r.repository_url === `https://github.com/${s.owner}/${s.repository}` && r.owner_login === s.owner && r.owner_url === `https://github.com/${s.owner}` && r.commit === s.commit && r.path === s.path && r.repo_stats.metadata_source_url === `https://api.github.com/repos/${s.owner}/${s.repository}`
})
const selectionPreview = z.object({ selection_required: z.literal(true), repository_url: githubRepositoryUrlSchema, commit, paths: z.array(githubPathSchema).max(512) }).strict().refine(v => v.paths.length > 1 && new Set(v.paths).size === v.paths.length)
export const githubPreviewSchema = z.union([selectedPreview, selectionPreview])
export const githubDraftSchema = z.object({ skill_id: id, source_ref: z.string().regex(/^skill:[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])/u), status: z.literal("draft"), state_version: positiveDecimal, valid: z.literal(true), content_digest: sha, manifest_identity: z.string().regex(/^(?:skill-md-v1|zip-v2):sha256:[a-f0-9]{64}(?![\s\S])/u) }).strict().refine(v => v.source_ref === `skill:${v.skill_id}`)
export const githubSchemas = { preview: githubPreviewSchema, import: githubDraftSchema } as const
export const githubErrorSchema = z.object({ error: z.object({ code: z.string().min(1), message: z.string().min(1), retryable: z.boolean() }).strict() }).strict()
const errors: Readonly<Record<number, readonly string[]>> = {
  400: ["invalid_skill_request"], 401: ["session_authentication_required", "session_invalid"],
  403: ["service_auth_failed", "session_forbidden", "product_tenant_forbidden", "skill_forbidden"],
  404: ["skill_not_found"], 409: ["skill_idempotency_conflict", "skill_command_in_progress"], 412: ["skill_precondition_failed"],
  413: ["request_body_too_large"], 429: ["session_rate_limited", "skill_rate_limited"], 502: ["skill_response_invalid"],
  503: ["product_tenant_not_configured", "iam_admission_unavailable", "skill_dependency_unavailable"],
}
export function githubErrorAllowed(operation: GithubImportOperation, status: number, code: string): boolean {
  return (operation === "preview" || operation === "import") && (errors[status]?.includes(code) ?? false)
}
export function githubPreviewMatches(data: z.infer<typeof githubPreviewSchema>, input: z.infer<typeof githubPreviewRequestSchema>): boolean {
  return data.selection_required ? input.path === undefined && data.repository_url === input.repository_url
    : `https://github.com/${data.selector.owner}/${data.selector.repository}` === input.repository_url && (input.path === undefined || data.selector.path === input.path)
}
export type GithubSelector = z.infer<typeof githubSelectorSchema>
export type GithubPreviewRequest = z.infer<typeof githubPreviewRequestSchema>
