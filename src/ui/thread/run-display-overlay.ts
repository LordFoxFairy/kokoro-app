import type { RunProcessActivity } from "@/contract/chat"
import type { RunDisplay } from "@/contract/answer-actions"
/** Safe display overlays never alter event positions, activity identity or terminal status. */
export function overlayRunDisplay(activities: readonly RunProcessActivity[], facts: RunDisplay | null): RunProcessActivity[] {
  if (facts === null) return [...activities]
  return activities.map(activity => {
    if (activity.activity === "skill" && activity.phase === "ready") {
      const display = activity.display_skills ?? facts.display_skills.filter(skill => activity.source_refs.includes(skill.source_ref))
      return display.length ? { ...activity, display_skills: display } : activity
    }
    if (activity.activity !== "tool" || !["tool.file.read", "tool.file.write", "tool.file.deliver"].includes(activity.display_code)) return activity
    const path = facts.tool_paths.find(item => item.activity_id === activity.activity_id)?.virtual_path
    if (!path || activity.display_detail?.virtual_path || (activity.display_detail && activity.display_detail.kind !== "file")) return activity
    return { ...activity, display_detail: { kind: "file", name: activity.display_detail?.name ?? path.split("/").at(-1)!, virtual_path: path } }
  })
}
