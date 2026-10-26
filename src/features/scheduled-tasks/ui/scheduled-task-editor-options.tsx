"use client"

import { useId } from "react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useT } from "@/i18n/context"

import type { ScheduledTaskEditorState } from "./scheduled-task-editor-state"
import type { ScheduledTaskCreationContext } from "./scheduled-task-location"
import styles from "./scheduled-task-editor.module.css"

type ScheduledTaskEditorOptionsProps = { state: ScheduledTaskEditorState }

export function ScheduledTaskEditorOptions({ state }: ScheduledTaskEditorOptionsProps) {
  const t = useT()
  const reasonId = useId()
  return <section className={styles.optionCard} aria-label={t("firstSite.autoApprove")}>
    <div><strong>{t("firstSite.autoApprove")}</strong><p id={reasonId}>{t("firstSite.autoApproveHint")}</p></div>
    <Switch aria-label={t("firstSite.autoApprove")} aria-describedby={reasonId} checked={state.autoApprove} disabled />
  </section>
}

/** Display execution-policy availability without changing saved approval data. */
export function ScheduledTaskAutomationOptions({ context }: { context: ScheduledTaskCreationContext }) {
  const t = useT()
  const reasonId = useId()
  return <div className={styles.automationOptions}>
    <div className={styles.approvalLabel}>
      <span>{t("scheduled.workflowApproval")}</span>
      <Button type="button" variant="outline" disabled aria-describedby={`${reasonId}-approval`}>{t("scheduled.workflowApprovalRuntime")}</Button>
      <p id={`${reasonId}-approval`}>{t("firstSite.autoApproveHint")}</p>
    </div>
    <p className={styles.automationScope}><strong>{t(context.kind === "project" ? "firstSite.currentProject" : "firstSite.personalWorkspace")}</strong>{context.kind === "project" ? <span>{context.projectId}</span> : null}</p>
    {([
      ["scheduled.workflowAgent", "scheduled.workflowAgentUnavailable"],
      ["firstSite.connectors", "scheduled.workflowConnectorsUnavailable"],
      ["scheduled.workflowIndependent", "scheduled.workflowIndependentUnavailable"],
      ["scheduled.workflowCloud", "scheduled.workflowCloudUnavailable"],
      ["scheduled.workflowLocalFolder", "scheduled.workflowLocalFolderUnavailable"],
    ] as const).map(([label, reason], index) => <div className={styles.unavailableOption} key={label}>
      <Button type="button" variant="ghost" disabled aria-describedby={`${reasonId}-${index}`}>{t(label)}</Button>
      <p id={`${reasonId}-${index}`}>{t(reason)}</p>
    </div>)}
  </div>
}
