import type { RunProcessActivity } from "@/contract/chat"
import type { RunDisplay } from "@/contract/answer-actions"
/** Safe display overlays never alter source events, positions, activity identity or Run terminal status. */
export function overlayRunDisplay(activities: readonly RunProcessActivity[], facts: RunDisplay | null): RunProcessActivity[] {
  if (facts === null) return [...activities]
  return activities.map(activity => {
    if (activity.activity === "tool" && ["tool.mcp.discover", "tool.mcp.describe", "tool.mcp.call"].includes(activity.display_code)) {
      // A retained pre-update RAM object can lack this new adjunct. Formal
      // network reads still require it; absence grants no name/failure proof.
      const fact = (facts.tool_facts ?? []).find(item => item.activity_id === activity.activity_id)
      const detail = fact?.display_detail && ["tool.mcp.describe", "tool.mcp.call"].includes(activity.display_code) ? fact.display_detail : undefined
      return fact ? { ...activity, ...(detail === undefined ? {} : { display_detail: detail }), ...(fact.status === "failed" ? { status: "failed" as const } : {}) } : activity
    }
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
