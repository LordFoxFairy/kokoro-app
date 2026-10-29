import type { RunProcessActivity } from "@/contract/chat"

// Counts observed attempts, never successes or unique resources. The input is
// one passage already delimited by real public text; this does not regroup it.
export function summarizeProcessActivities(activities: readonly RunProcessActivity[]) {
  type SummaryKey = "thread.summaryCalls" | "thread.summaryReads" | "thread.summaryWrites" | "thread.summaryDeliveries" | "thread.summaryWeb" | "thread.summarySkills" | "thread.summarySubtasks" | "thread.summaryToolInfo"
  const counts = new Map<SummaryKey, number>()
  for (const activity of activities) {
    let key: SummaryKey
    if (activity.activity === "skill") key = "thread.summarySkills"
    else if (activity.activity === "subagent") key = "thread.summarySubtasks"
    else switch (activity.display_code) {
      case "tool.file.read": key = "thread.summaryReads"; break
      case "tool.file.write": key = "thread.summaryWrites"; break
      case "tool.file.deliver": key = "thread.summaryDeliveries"; break
      case "tool.web.search": case "tool.web.fetch": key = "thread.summaryWeb"; break
      case "tool.mcp.discover": case "tool.mcp.describe": key = "thread.summaryToolInfo"; break
      default: key = "thread.summaryCalls"
    }
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts].map(([key, count]) => ({ key, count }))
}
