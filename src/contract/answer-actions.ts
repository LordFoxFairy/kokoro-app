import { z } from "zod"
import {
  answerFeedbackWireSchema,
  answerRegenerationReceiptWireSchema,
  runDisplaySkillWireSchema,
  runDisplayWireSchema,
  runToolFactWireSchema,
  runActivityDetailWireSchema,
  safeVirtualPathWireSchema,
  answerActionErrorWireSchema,
  BFF_ANSWER_ACTION_STATUSES,
} from "@/generated/bff-tool-display"
const sensitive =
  /(?:^|[._ /-])(?:credentials?|secrets?|tokens?|passwords?|private[_-]?key)(?:$|[._ /-])|(?:^|\/)\.(?:ssh|aws|gnupg|kube)(?:\/|$)|(?:^|\/)\.env(?:[./_-]|$)|(?:^|\/)(?:\.netrc|\.npmrc|\.git-credentials|service[_-]account\.json)(?:$|\/)|(?:id_rsa|id_ed25519|\.pem$|\.p12$|\.pfx$|bearer\s|(?<![A-Za-z0-9])sk[-_]|gh[pousr]_|github_pat_|AKIA[A-Z0-9]{16}|-----BEGIN)|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/iu
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
// A tool adjunct is not an event or Run terminal. Its proof applies only to
// one exact original MCP activity; the UI enforces the known activity category.
export const runToolFactSchema = runToolFactWireSchema.superRefine((value, context) => {
  if ((value.display_detail === undefined && value.status === undefined) ||
    (value.display_detail !== undefined && (!value.display_detail.name.trim() || sensitive.test(value.display_detail.name)))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "invalid original MCP tool fact" })
  }
})
export const runActivityDetailSchema = runActivityDetailWireSchema.superRefine((value, context) => {
  const target = value.target
  if (!value.tool_name.trim() || sensitive.test(value.tool_name) ||
    (target && (!target.name.trim() || sensitive.test(target.name) ||
      (target.virtual_path !== undefined && (!safeVirtualPathSchema.safeParse(target.virtual_path).success || target.virtual_path.split("/").at(-1) !== target.name))))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "invalid original activity detail" })
  }
})
export type RunActivityDetail = z.infer<typeof runActivityDetailSchema>
export const runDisplaySchema = runDisplayWireSchema
  .extend({
    display_skills: z.array(runDisplaySkillSchema).max(16),
    activity_details: z.array(runActivityDetailSchema).max(128),
    tool_facts: z.array(runToolFactSchema).max(128),
    tool_paths: runDisplayWireSchema.shape.tool_paths.element.extend({ virtual_path: safeVirtualPathSchema }).array().max(128),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.display_skills.map((v) => v.source_ref)).size !== value.display_skills.length ||
      new Set(value.tool_paths.map((v) => v.activity_id)).size !== value.tool_paths.length ||
      new Set(value.tool_facts.map((v) => v.activity_id)).size !== value.tool_facts.length ||
      new Set(value.activity_details.map((v) => v.activity_id)).size !== value.activity_details.length
    )
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate display identity" })
  })
export const answerActionErrorSchema = answerActionErrorWireSchema
export const answerActionStatuses = BFF_ANSWER_ACTION_STATUSES
export type AnswerFeedback = z.infer<typeof answerFeedbackSchema>
export type AnswerRegenerationReceipt = z.infer<typeof answerRegenerationReceiptSchema>
export type RunDisplay = z.infer<typeof runDisplaySchema>
export type RunDisplaySkill = z.infer<typeof runDisplaySkillSchema>
