import { expect, it } from "vitest"
import type { RunProcessActivity } from "@/contract/chat"
import { summarizeProcessActivities } from "@/ui/thread/process-summary"
const tool = (id: string, code: "tool.mcp.discover" | "tool.mcp.describe" | "tool.mcp.call" | "tool.file.read"): RunProcessActivity => ({ activity: "tool", activity_id: id, segment_id: "segment", display_code: code, status: "completed" })
it("counts attempts rather than claiming successes or unique resources, without mutating history", () => {
 const input = [tool("a", "tool.mcp.discover"), tool("b", "tool.mcp.describe"), { ...tool("c", "tool.mcp.call"), status: "failed" as const }, tool("d", "tool.file.read"), tool("e", "tool.mcp.call")]
 const before = structuredClone(input)
 expect(summarizeProcessActivities(input)).toEqual([{ key: "thread.summaryToolInfo", count: 2 }, { key: "thread.summaryCalls", count: 2 }, { key: "thread.summaryReads", count: 1 }])
 expect(input).toEqual(before)
})
it("retains a truthful summary when only tool preparation exists", () => {
 expect(summarizeProcessActivities([tool("a", "tool.mcp.describe"), tool("b", "tool.mcp.discover")])).toEqual([{ key: "thread.summaryToolInfo", count: 2 }])
 expect(summarizeProcessActivities([])).toEqual([])
})

it("counts every observed activity once when preparation is followed by execution", () => {
 const input = [tool("a", "tool.mcp.discover"), tool("b", "tool.mcp.describe"), tool("c", "tool.mcp.call"), tool("d", "tool.mcp.describe"), { ...tool("e", "tool.mcp.call"), status: "failed" as const }]
 for (let length = 1; length <= input.length; length++) {
  expect(summarizeProcessActivities(input.slice(0, length)).reduce((total, item) => total + item.count, 0)).toBe(length)
 }
})
