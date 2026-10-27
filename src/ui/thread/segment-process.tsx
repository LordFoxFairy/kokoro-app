import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Bot, ChevronDown, Sparkles } from "lucide-react"
import { useSyncExternalStore } from "react"
import { z } from "zod"

import type { AgentMode } from "@/core/conversations"
import type { RunProcessActivity } from "@/contract/chat"
import { useT } from "@/i18n/context"
import { createPersistedStore } from "@/lib/persisted-store"

import { SubagentRow } from "./subagent-row"
import { ToolCallRow } from "./tool-call-row"
import { TOOL_ACTION_PRESENTATION } from "./tool-action-presentation"
import styles from "./thread.module.css"

// 过程块展开意图（UI-only）：按全局唯一 segmentId 存手动 override，跨刷新保留；
// 复用全站唯一的 persisted-store（Zod 洗净，脏盘面降空），带容量上限防无界增长。
const DISCLOSURE_CAP = 500
const disclosureStore = createPersistedStore<Record<string, boolean>>({
  key: "kokoro.web.process-disclosure",
  schema: z.record(z.string(), z.boolean()),
})

function setDisclosure(segmentId: string, open: boolean): void {
  const map = { ...(disclosureStore.read() ?? {}) }
  // 删后重插：移到末尾标记「最近」，按插入序淘汰最旧的，封顶 localStorage 体积。
  delete map[segmentId]
  map[segmentId] = open
  const keys = Object.keys(map)
  for (const stale of keys.slice(0, Math.max(0, keys.length - DISCLOSURE_CAP))) {
    delete map[stale]
  }
  disclosureStore.write(map)
}

const serverDisclosure = (): Record<string, boolean> | null => null

// true/false=手动展开/收起，null=无 override（跟随 live）。SSR 快照 null 保证水合首帧一致。
function useDisclosure(segmentId: string): boolean | null {
  const map = useSyncExternalStore(
    disclosureStore.subscribe,
    disclosureStore.read,
    serverDisclosure,
  )
  const value = map?.[segmentId]
  return typeof value === "boolean" ? value : null
}

type SegmentProcessProps = {
  segmentId: string
  activities: RunProcessActivity[]
  live: boolean
  mode?: AgentMode
  // Parent owns Run/answer/connection facts. This never changes an activity's status.
  continueProcessing?: boolean
}

export function SegmentProcess({
  segmentId,
  activities,
  live,
  mode,
  continueProcessing = false,
}: SegmentProcessProps) {
  const t = useT()
  const manualOpen = useDisclosure(segmentId)
  const single = activities.length === 1
  // Keep the same force-mounted content tree when a second activity arrives.
  const open = single || (manualOpen ?? live)
  if (activities.length === 0) return null

  const allTools = activities.every((activity) => activity.activity === "tool")
  const failed = activities.filter((activity) => activity.activity === "skill" ? activity.phase === "failed" : activity.status === "failed").length
  const allSettled = activities.every((activity) => activity.activity === "skill" ? activity.phase === "ready" || activity.phase === "failed" : activity.status !== "running")
  const continuing = continueProcessing && allSettled
  const labels = [...new Set(activities.map((activity) => t(activity.activity === "tool" ? TOOL_ACTION_PRESENTATION[activity.display_code].label : activity.activity === "subagent" ? "thread.subagent" : "thread.skill")))]
  const summary = `${labels.join(" · ")} · ${t(allTools ? "thread.actionCalls" : "thread.actionActivities", { count: activities.length })}`
  const first = activities[0]!
  const SummaryIcon = first.activity === "tool" ? TOOL_ACTION_PRESENTATION[first.display_code].Icon : first.activity === "subagent" ? Bot : Sparkles
  const continuation = continuing ? <span className={styles.actionContinuation} role="status">{t("thread.continueProcessing")}</span> : null

  return (
    <Collapsible
      className={styles.process}
      data-mode={mode}
      data-open={open}
      open={open}
      onOpenChange={(nextOpen) => setDisclosure(segmentId, nextOpen)}
    >
      {!single ? <CollapsibleTrigger asChild>
        <Button variant="ghost" type="button" className={styles.processSummary}>
          <SummaryIcon className={styles.actionIcon} aria-hidden="true" />
          <span className={styles.processTitle} title={summary}>{summary}</span>
          {!allSettled ? <span className={styles.actionStatus}>{t("thread.processRunning")}</span> : null}
          {failed > 0 ? <span className={styles.actionFailure}>{t("thread.actionFailures", { count: failed })}</span> : null}
          {continuation}
          <ChevronDown className={styles.processChevron} aria-hidden="true" />
        </Button>
      </CollapsibleTrigger> : null}
      <CollapsibleContent forceMount className={styles.processReveal}>
        <div className={styles.processClip}>
          <div className={styles.processBody} inert={!open}>
            <div className={styles.actgroup}>
              {activities.map((activity) => {
                const cue = single ? continuation : null
                if (activity.activity === "tool") return <ToolCallRow key={activity.activity_id} activity={activity} continuation={cue} />
                if (activity.activity === "subagent") return <SubagentRow key={activity.activity_id} activity={activity} continuation={cue} />
                return <div className={styles.action} data-status={activity.phase} key={activity.activity_id}>
                  <div className={styles.actionRow}>
                    <Sparkles className={styles.actionIcon} aria-hidden="true" />
                    <span className={styles.actionLabel}>{t("thread.skill")}</span>
                    <span className={styles.actionStatus}>{t(activity.phase === "resolving" ? "thread.skillResolving" : activity.phase === "loading" ? "thread.skillLoading" : activity.phase === "ready" ? "thread.skillReady" : "thread.skillFailed")}</span>
                    {cue}
                  </div>
                </div>
              })}
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
