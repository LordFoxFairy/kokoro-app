import { z } from "zod"
import { projectGrantRequestSchema } from "@/generated/bff-project-access"

export type ProjectGrantScope = { tenant: string; subject: string; projectId: string }
type TabStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">
const schema = z
  .object({
    operation: z.enum(["set", "revoke"]),
    subjectId: z.string().min(1).max(255),
    key: z
      .string()
      .regex(/^[\x21-\x7e]{1,128}$/u)
      .refine((value) => !value.includes(",")),
    version: z.string().regex(/^[1-9][0-9]{0,18}$/u),
    body: projectGrantRequestSchema,
    phase: z.enum(["prepared", "attempted", "rejected"]),
  })
  .strict()
export type ProjectGrantIntent = z.infer<typeof schema>
function slot(scope: ProjectGrantScope) {
  if ([scope.tenant, scope.subject, scope.projectId].some((value) => typeof value !== "string" || value.length === 0 || value.length > 255))
    throw Error("project_grant_scope_invalid")
  return `kokoro.project-grant-command.v1:${JSON.stringify([scope.tenant, scope.subject, scope.projectId])}`
}
const identity = (value: ProjectGrantIntent) =>
  JSON.stringify([value.operation, value.subjectId, value.key, value.version, value.body.role, value.body.expires_at])
/** Same-tab pending command only: no cached permission, owner receipt, credentials or automatic replay. */
export function loadProjectGrantCommand(storage: TabStorage, scope: ProjectGrantScope): ProjectGrantIntent | null {
  const raw = storage.getItem(slot(scope))
  if (raw === null) return null
  if (new TextEncoder().encode(raw).byteLength > 4096) throw Error("project_grant_command_invalid")
  return schema.parse(JSON.parse(raw))
}
export function saveProjectGrantCommand(storage: TabStorage, scope: ProjectGrantScope, input: ProjectGrantIntent): void {
  const command = schema.parse(input),
    previous = loadProjectGrantCommand(storage, scope)
  if (previous && identity(previous) !== identity(command)) throw Error("project_grant_command_pending")
  const raw = JSON.stringify(command)
  storage.setItem(slot(scope), raw)
  if (storage.getItem(slot(scope)) !== raw) throw Error("project_grant_command_not_retained")
}
export function clearProjectGrantCommand(storage: TabStorage, scope: ProjectGrantScope, input: ProjectGrantIntent): void {
  const previous = loadProjectGrantCommand(storage, scope)
  if (!previous || identity(previous) !== identity(schema.parse(input))) throw Error("project_grant_command_changed")
  storage.removeItem(slot(scope))
  if (storage.getItem(slot(scope)) !== null) throw Error("project_grant_command_not_cleared")
}
