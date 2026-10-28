import { expect, it } from "vitest"
import type { RunProcessActivity } from "@/contract/chat"
import { overlayRunDisplay } from "@/ui/thread/run-display-overlay"

// Formal BFF d629 / Public28.11 facts. This pure projection never edits
// the original activity, ledger, parts position or Run terminal.
const call: RunProcessActivity = {
  activity: "tool", activity_id: `act_${"a".repeat(64)}`, segment_id: `seg_${"a".repeat(64)}`,
  status: "completed", display_code: "tool.mcp.call",
}
const describe: RunProcessActivity = {
  activity: "tool", activity_id: `act_${"b".repeat(64)}`, segment_id: `seg_${"b".repeat(64)}`,
  status: "completed", display_code: "tool.mcp.describe",
}
const file: RunProcessActivity = {
  activity: "tool", activity_id: `act_${"c".repeat(64)}`, segment_id: `seg_${"c".repeat(64)}`,
  status: "completed", display_code: "tool.file.read",
}
it("overlays the original call's proven MCP name and failure without rewriting its retained activity", () => {
  const activities = [describe, call, file], retained = JSON.stringify(activities)
  const facts = { run_id: "original-run", display_skills: [], tool_paths: [], tool_facts: [
    { activity_id: call.activity_id, display_detail: { kind: "mcp_tool" as const, name: "original_public_selector" }, status: "failed" as const },
  ] }
  const overlay = overlayRunDisplay(activities, facts)
  expect(overlay[1]).toMatchObject({ activity_id: call.activity_id, display_code: "tool.mcp.call", status: "failed", display_detail: { kind: "mcp_tool", name: "original_public_selector" } })
  expect(overlay.map(activity => activity.activity_id)).toEqual(activities.map(activity => activity.activity_id))
  expect(overlay[0]).toBe(describe)
  expect(overlay[2]).toBe(file)
  expect(JSON.stringify(activities)).toBe(retained)
})
it("supports independent describe-name and tool-failure facts without borrowing a current catalog", () => {
  const facts = { run_id: "original-run", display_skills: [], tool_paths: [], tool_facts: [
    { activity_id: describe.activity_id, display_detail: { kind: "mcp_tool" as const, name: "frozen_original_tool" } },
    { activity_id: call.activity_id, status: "failed" as const },
  ] }
  const overlay = overlayRunDisplay([describe, call], facts)
  expect(overlay[0]).toMatchObject({ status: "completed", display_detail: { kind: "mcp_tool", name: "frozen_original_tool" } })
  expect(overlay[1]).toMatchObject({ status: "failed" })
  expect(overlay[1]).not.toHaveProperty("display_detail")
})
it("missing or unrelated evidence neither invents a name nor inserts activities into the original order", () => {
  const facts = { run_id: "original-run", display_skills: [], tool_paths: [], tool_facts: [
    { activity_id: `act_${"d".repeat(64)}`, display_detail: { kind: "mcp_tool" as const, name: "unrelated" }, status: "failed" as const },
  ] }
  const activities = [describe, call, file]
  expect(overlayRunDisplay(activities, facts)).toEqual(activities)
  const absent = { ...facts, tool_facts: [] }
  expect(overlayRunDisplay(activities, absent)).toEqual(activities)
})
it("replaces an old MCP description with its proven selector but never grants a file/subagent an MCP failure", () => {
  const old = { ...call, display_detail: { kind: "mcp_tool" as const, name: "A long historical category description" } }
  const subagent: RunProcessActivity = { activity: "subagent", activity_id: `act_${"e".repeat(64)}`, segment_id: `seg_${"e".repeat(64)}`, status: "completed", display_code: "subagent.execution" }
  const facts = { run_id: "original-run", display_skills: [], tool_paths: [], tool_facts: [
    { activity_id: call.activity_id, display_detail: { kind: "mcp_tool" as const, name: "ask_wiki_question" }, status: "failed" as const },
    { activity_id: file.activity_id, display_detail: { kind: "mcp_tool" as const, name: "not-a-file-tool" }, status: "failed" as const },
    { activity_id: subagent.activity_id, status: "failed" as const },
  ] }
  const overlaid = overlayRunDisplay([old, file, subagent], facts)
  expect(overlaid[0]).toMatchObject({ display_detail: { name: "ask_wiki_question" }, status: "failed" })
  expect(overlaid[1]).toBe(file)
  expect(overlaid[2]).toBe(subagent)
  expect(old.display_detail.name).toBe("A long historical category description")
})
it("pre-update RAM without tool_facts stays readable without granting extra facts or a wire fallback", () => {
  const cached = { run_id: "original-run", display_skills: [], tool_paths: [], tool_facts: [] }
  Reflect.deleteProperty(cached, "tool_facts")
  expect(overlayRunDisplay([describe, call, file], cached)).toEqual([describe, call, file])
})
