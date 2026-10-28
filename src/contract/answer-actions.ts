import { z } from "zod"
import {
  answerFeedbackWireSchema,
  answerRegenerationReceiptWireSchema,
  runDisplaySkillWireSchema,
  runDisplayWireSchema,
  safeVirtualPathWireSchema,
  answerActionErrorWireSchema,
  BFF_ANSWER_ACTION_STATUSES,
} from "@/generated/bff-tool-display"
const sensitive =
  /(?:^|[._ /-])(?:credentials?|secrets?|tokens?|passwords?|private[_-]?key)(?:$|[._ /-])|(?:^|\/)\.(?:ssh|aws|gnupg|kube)(?:\/|$)|(?:^|\/)\.env(?:[./_-]|$)|(?:^|\/)(?:\.netrc|\.npmrc|\.git-credentials|service[_-]account\.json)(?:$|\/)|(?:id_rsa|id_ed25519|\.pem$|\.p12$|\.pfx$|bearer\s|sk[-_]|gh[pousr]_|github_pat_|AKIA[A-Z0-9]{16}|-----BEGIN)|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/iu
export const answerActionIdSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((v) => !/[\p{Cc}\p{Cs}]/u.test(v))
export const safeVirtualPathSchema = safeVirtualPathWireSchema.refine((value) => {
  if (!value.startsWith("/") || value.startsWith("//") || /[\\:?#%]/u.test(value) || sensitive.test(value)) return false
  const parts = value.slice(1).split("/")
  return (
    !parts.some((part) => !part || part === "." || part === ".." || part.startsWith("~")) &&
    !new Set(["users", "home", "private", "etc", "proc", "sys", "var"]).has(parts[0]!.toLowerCase())
  )
})
export const answerFeedbackSchema = answerFeedbackWireSchema
export const answerRegenerationReceiptSchema = answerRegenerationReceiptWireSchema
export const runDisplaySkillSchema = runDisplaySkillWireSchema.superRefine((value, ctx) => {
  if (!runDisplaySkillWireSchema.shape.source_ref.safeParse(value.source_ref).success) return
  const mount = btoa(value.source_ref.slice(6)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "")
  if (
    !safeVirtualPathSchema.safeParse(value.virtual_path).success ||
    value.virtual_path !== `/.skills/${mount}/SKILL.md` ||
    !value.name.trim() ||
    sensitive.test(value.name)
  )
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid original Skill display binding" })
})
export const runDisplaySchema = runDisplayWireSchema
  .extend({
    display_skills: z.array(runDisplaySkillSchema).max(16),
    tool_paths: runDisplayWireSchema.shape.tool_paths.element.extend({ virtual_path: safeVirtualPathSchema }).array().max(128),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.display_skills.map((v) => v.source_ref)).size !== value.display_skills.length ||
      new Set(value.tool_paths.map((v) => v.activity_id)).size !== value.tool_paths.length
    )
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate display identity" })
  })
export const answerActionErrorSchema = answerActionErrorWireSchema
export const answerActionStatuses = BFF_ANSWER_ACTION_STATUSES
export type AnswerFeedback = z.infer<typeof answerFeedbackSchema>
export type AnswerRegenerationReceipt = z.infer<typeof answerRegenerationReceiptSchema>
export type RunDisplay = z.infer<typeof runDisplaySchema>
export type RunDisplaySkill = z.infer<typeof runDisplaySkillSchema>
