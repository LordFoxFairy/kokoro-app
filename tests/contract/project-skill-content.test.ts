import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { projectSkillContentProvenance, projectPackageResponseSchema, projectPackageErrors, skillDownloadErrorSchemas } from "@/generated/bff-project-skill-content"
import { restorePublic287ProjectSkillContentContract as restore } from "./bff-project-skill-content-parent"
it("binds Project content to the complete formal owner and exact unmodified Public28.7 parent", () => {
  const source = readFileSync("src/generated/bff-public-openapi.yaml", "utf8")
  expect(projectSkillContentProvenance.owner_commit).toBe("b1233d90403bd69e32998ccc8f71236213c28964")
  expect(createHash("sha256").update(restore(source)).digest("hex")).toBe("818dfe54d5eb50a72725983be136211c63bb17fa7392f94c5c1d46234db3ebd1")
  for (const changed of [source + "\n", source.replace("getProjectSkillInstallationPackage", "differentProjectMethod"), source.replace("listTeamMembers", "differentUnrelatedMethod")]) expect(() => restore(changed)).toThrow(/drift/)
})
it("derives closed Project success/errors without widening private download statuses", () => {
  expect(projectPackageResponseSchema.safeParse({ data: { source_ref: "skill:exact", revision: "1", files: [], selected_file: null } }).success).toBe(true)
  expect(projectPackageResponseSchema.safeParse({ data: { source_ref: "skill:exact", revision: "1", files: [], selected_file: null, project_id: "invented" } }).success).toBe(false)
  const rejection = { error: { code: "skill_package_precondition_failed", message: "pin changed", retryable: false } }
  expect(projectPackageErrors.some(e => e.status === 412 && e.schema.safeParse(rejection).success)).toBe(true)
  expect(projectPackageErrors.some(e => e.status === 412 && e.schema.safeParse({ error: { ...rejection.error, retryable: true } }).success)).toBe(false)
  expect(skillDownloadErrorSchemas.some(e => e.status === 412)).toBe(false)
})
