import type { ReactNode } from "react"
import { Sparkles } from "lucide-react"
import type { RunProcessActivity } from "@/contract/chat"
import { useT } from "@/i18n/context"
import styles from "./thread.module.css"
import details from "./activity-detail.module.css"

type SkillActivity = Extract<RunProcessActivity, { activity: "skill" }>

/** Display only the package facts attached to this actual Run; never current catalog metadata. */
export function SkillActivityRow({ activity, continuation, terminal = false }: {
  activity: SkillActivity
  continuation?: ReactNode
  terminal?: boolean
}) {
  const t = useT()
  const ended = terminal && (activity.phase === "resolving" || activity.phase === "loading")
  const displays = activity.phase === "ready" ? activity.display_skills : undefined
  return <div className={styles.action} data-status={ended ? "ended" : activity.phase}>
    <div className={styles.actionRow}>
      <Sparkles className={styles.actionIcon} aria-hidden="true" />
      <span className={styles.actionLabel}>{t("thread.skill")}</span>
      <span className={styles.actionStatus}>{t(ended ? "thread.runEnded" : activity.phase === "resolving" ? "thread.skillResolving" : activity.phase === "loading" ? "thread.skillLoading" : activity.phase === "ready" ? "thread.skillReady" : "thread.skillFailed")}</span>
      {continuation}
    </div>
    {displays && displays.length > 0 ? <ul className={details.skills}>
      {displays.map((display) => <li key={display.source_ref} className={details.skill}>
        <div className={details.heading}>
          <span className={details.name} title={display.name}>{display.name}</span>
          {display.revision === undefined ? null : <span className={details.revision}>v{display.revision}</span>}
        </div>
        <span className={details.path} title={display.virtual_path}>{display.virtual_path}</span>
      </li>)}
    </ul> : null}
  </div>
}
