import { SkillActivityRow } from "./skill-activity-row"
import { useState, type ReactNode } from "react"
import { ChevronDown, ListTree } from "lucide-react"
import type { RunProcessActivity } from "@/contract/chat"
import { useT } from "@/i18n/context"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { groupProcessActivities, type McpPreparationActivity } from "./process-activity-groups"
import { ToolCallRow } from "./tool-call-row"
import { SubagentRow } from "./subagent-row"
import styles from "./thread.module.css"
import groupStyles from "./process-activity-rows.module.css"

function McpPreparationGroup({ activities, continuation }: { activities: McpPreparationActivity[]; continuation: ReactNode }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const running = activities.some((activity) => activity.status === "running")
  const failed = activities.filter((activity) => activity.status === "failed").length
  return <Collapsible open={open} onOpenChange={setOpen} className={groupStyles.group} data-open={open} data-preparation-group="true">
    <CollapsibleTrigger asChild>
      <Button type="button" variant="ghost" className={`${styles.processSummary} ${groupStyles.summary}`}>
        <ListTree className={styles.actionIcon} aria-hidden="true" />
        <span>{t("thread.toolPreparationCount", { count: activities.length })}</span>
        {running ? <span className={styles.actionStatus}>{t("thread.processRunning")}</span> : null}
        {failed > 0 ? <span className={styles.actionFailure}>{t("thread.actionFailures", { count: failed })}</span> : null}
        {continuation}
        <ChevronDown className={groupStyles.chevron} aria-hidden="true" />
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent forceMount aria-hidden={!open} className={groupStyles.reveal}>
      <div className={groupStyles.clip}><div className={groupStyles.body} inert={!open}>
        {activities.map((activity) => <ToolCallRow key={activity.activity_id} activity={activity} />)}
      </div></div>
    </CollapsibleContent>
  </Collapsible>
}

export function ProcessActivityRows({ activities, continuation }: { activities: RunProcessActivity[]; continuation: ReactNode }) {
  return groupProcessActivities(activities).map((group) => {
    if (group.kind === "preparation") return <McpPreparationGroup key={group.key} activities={group.activities} continuation={continuation} />
    const activity = group.activity
    if (activity.activity === "tool") return <ToolCallRow key={group.key} activity={activity} continuation={continuation} />
    if (activity.activity === "subagent") return <SubagentRow key={group.key} activity={activity} continuation={continuation} />
    return <SkillActivityRow key={group.key} activity={activity} continuation={continuation} />
  })
}
