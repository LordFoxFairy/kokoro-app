import { expect, it } from "vitest"
import { runDisplaySchema } from "@/contract/answer-actions"
const id = `act_${"a".repeat(64)}`
const detail = { activity_id: id, tool_name: "mcp_call", target: { kind: "mcp_tool", name: "actual_tool" }, input_preview: { text: '{"query":"original input"}', truncated: false, redacted: true }, output_preview: { text: "Original output", truncated: false, redacted: false } }
const facts = { run_id: "run", display_skills: [], tool_paths: [], tool_facts: [], activity_details: [detail] }
it("requires the owner's bounded activity details and preserves original preview flags", () => {
  expect(runDisplaySchema.parse(facts).activity_details[0]).toEqual(detail)
  const missing = { run_id: facts.run_id, display_skills: [], tool_paths: [], tool_facts: [] }
  expect(runDisplaySchema.safeParse(missing).success).toBe(false)
  expect(runDisplaySchema.safeParse({ ...facts, activity_details: [detail, detail] }).success).toBe(false)
})
it("rejects invalid detail branches, unknown fields and over-budget UTF-8 without truncating input", () => {
  for (const changed of [
    { ...detail, extra: true }, { ...detail, tool_name: "" },
    { ...detail, target: { kind: "mcp_tool", name: "actual_tool", virtual_path: "/valid/path" } },
    { ...detail, target: { kind: "file", name: "nested/path" } },
    { ...detail, target: { kind: "file", name: "report.txt", virtual_path: "/home/user/report.txt" } },
    { ...detail, input_preview: { ...detail.input_preview, text: "界".repeat(683) } },
    { ...detail, output_preview: { ...detail.output_preview, text: "界".repeat(1366) } },
    { ...detail, input_preview: { text: "x", truncated: false } },
  ]) expect(runDisplaySchema.safeParse({ ...facts, activity_details: [changed] }).success).toBe(false)
})
