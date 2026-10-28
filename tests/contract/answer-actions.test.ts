import { it, expect } from "vitest"
import { answerFeedbackSchema, answerRegenerationReceiptSchema, runDisplaySchema, safeVirtualPathSchema } from "@/contract/answer-actions"
it("accepts exact owner answer facts while rejecting unknown, wrong source mount and noncanonical revision", () => {
  expect(answerFeedbackSchema.parse({ session_id: "s", message_id: "m", feedback: null }).feedback).toBeNull()
  expect(
    answerRegenerationReceiptSchema.safeParse({ run_id: "r", user_message_id: "u", assistant_message_id: "a", regenerated_from_message_id: "source" }).success,
  ).toBe(true)
  const skill = { source_ref: "skill:pinned", name: "Original", virtual_path: "/.skills/cGlubmVk/SKILL.md", revision: "9007199254740993" }
  const data = { run_id: "run", display_skills: [skill], tool_paths: [] }
  expect(runDisplaySchema.safeParse(data).success).toBe(true)
  for (const revision of [null, "0", "-1", "01", "1\n", "9223372036854775808"]) {
    expect(runDisplaySchema.safeParse({ ...data, display_skills: [{ ...skill, revision }] }).success).toBe(false)
  }
  expect(runDisplaySchema.safeParse({ ...data, raw_args: {} }).success).toBe(false)
  expect(runDisplaySchema.safeParse({ ...data, display_skills: [{ ...skill, source_ref: "other:pinned" }] }).success).toBe(false)
  for (const path of ["/home/user/a", "/workspace/.env", "../a", "https://evil/a"]) {
    expect(safeVirtualPathSchema.safeParse(path).success).toBe(false)
  }
})

it("restores the entire formal28.9 parent and rejects partial or unrelated28.10 mutations", async () => {
  const { readFile } = await import("node:fs/promises"),
    { createHash } = await import("node:crypto"),
    { restorePublic289MessageActionsContract } = await import("./bff-answer-actions-parent")
  const raw = await readFile("src/generated/bff-public-openapi.yaml", "utf8"),
    parent = restorePublic289MessageActionsContract(raw)
  expect(createHash("sha256").update(parent).digest("hex")).toBe("b438a749c919d24c4e0f1dadfdbcbbb11e0ac755f5785c543a661336c2cbb354")
  for (const bad of [
    raw + "\n",
    raw.replace("getMessageFeedback", "getWrongFeedback"),
    raw.replace("#/components/schemas/RunDisplaySkill", "#/components/schemas/UnknownSkill"),
    raw.replace("version: 28.10.0", "version: 28.11.0"),
  ]) {
    expect(bad).not.toBe(raw)
    expect(() => restorePublic289MessageActionsContract(bad)).toThrow(/drift/)
  }
})
