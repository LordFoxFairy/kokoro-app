import { expect, it } from "vitest"
import type { RunProcessActivity } from "@/contract/chat"
import { groupProcessActivities } from "@/ui/thread/process-activity-groups"
const tool = (id: string, code: "tool.mcp.discover" | "tool.mcp.describe" | "tool.mcp.call" | "tool.file.read"): RunProcessActivity => ({ activity: "tool", activity_id: id, segment_id: "segment", display_code: code, status: "completed" })
it("groups only adjacent preparation, preserving every execution and unrelated activity boundary", () => {
  const input = [tool("a", "tool.mcp.discover"), tool("b", "tool.mcp.describe"), tool("call", "tool.mcp.call"), tool("c", "tool.mcp.describe"), tool("file", "tool.file.read"), tool("d", "tool.mcp.describe")]
  const groups = groupProcessActivities(input)
  expect(groups.map((group) => group.kind === "preparation" ? group.activities.map((activity) => activity.activity_id) : group.activity.activity_id)).toEqual([["a", "b"], "call", ["c"], "file", ["d"]])
  expect(groups.flatMap((group) => group.kind === "preparation" ? group.activities : [group.activity])).toEqual(input)
})
