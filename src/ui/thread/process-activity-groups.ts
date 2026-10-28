import type { RunProcessActivity } from "@/contract/chat"
export type McpPreparationActivity = Extract<RunProcessActivity, { activity: "tool" }> & { display_code: "tool.mcp.discover" | "tool.mcp.describe" }
export type ProcessActivityGroup =
  | { kind: "preparation"; key: string; activities: McpPreparationActivity[] }
  | { kind: "activity"; key: string; activity: RunProcessActivity }
export function isMcpPreparation(activity: RunProcessActivity): activity is McpPreparationActivity {
  return activity.activity === "tool" && (activity.display_code === "tool.mcp.discover" || activity.display_code === "tool.mcp.describe")
}
// Input already belongs to one contiguous process segment. Never regroup
// across text, execution, other activities, or a caller's segment boundary.
export function groupProcessActivities(activities: readonly RunProcessActivity[]): ProcessActivityGroup[] {
  const result: ProcessActivityGroup[] = []
  for (const activity of activities) {
    if (!isMcpPreparation(activity)) { result.push({ kind: "activity", key: activity.activity_id, activity }); continue }
    const tail = result.at(-1)
    if (tail?.kind === "preparation") tail.activities.push(activity)
    else result.push({ kind: "preparation", key: activity.activity_id, activities: [activity] })
  }
  return result
}
