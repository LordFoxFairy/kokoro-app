import type { ReactNode } from "react"
import type { RunActivityDetail } from "@/contract/answer-actions"
import type { RunProcessActivity } from "@/contract/chat"
import { SkillActivityRow } from "./skill-activity-row"
import { ToolCallRow } from "./tool-call-row"
import { SubagentRow } from "./subagent-row"

/** The caller already owns a contiguous passage. Keep its order and one disclosure. */
export function ProcessActivityRows({ activities, continuation, onOpenActivity, activityDetails }: { activities: RunProcessActivity[]; continuation: ReactNode; onOpenActivity?: (activityId: string) => void; activityDetails?: readonly RunActivityDetail[] }) {
  return activities.map(activity => {
    if (activity.activity === "tool") {
      const detail = activityDetails?.find(item => item.activity_id === activity.activity_id)
      return <ToolCallRow {...(detail ? { detail } : {})} {...(onOpenActivity ? { onInspect: onOpenActivity } : {})} key={activity.activity_id} activity={activity} continuation={continuation} />
    }
    if (activity.activity === "subagent") return <SubagentRow key={activity.activity_id} activity={activity} continuation={continuation} />
    return <SkillActivityRow key={activity.activity_id} activity={activity} continuation={continuation} />
  })
}
