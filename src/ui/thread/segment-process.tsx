import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown } from "lucide-react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { z } from "zod"

import type { AgentMode } from "@/core/conversations"
import type { RunActivityDetail } from "@/contract/answer-actions"
import type { RunProcessActivity } from "@/contract/chat"
import { useT } from "@/i18n/context"
import { createPersistedStore } from "@/lib/persisted-store"

import { summarizeProcessActivities } from "./process-summary"
import { ProcessActivityRows } from "./process-activity-rows"
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
  activityDetails?: readonly RunActivityDetail[]
  onOpenActivity?: (activityId: string) => void
  onInspect?: () => void
  onVisible?: () => void
  segmentId: string
  // The parent whole-turn disclosure owns the only tools-only passage.
  direct?: boolean
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
  onInspect,
  onVisible,
  onOpenActivity,
  activityDetails,
  continueProcessing = false,
  direct = false,
}: SegmentProcessProps) {
  const t = useT()
  const manualOpen = useDisclosure(segmentId)
  const single = activities.length === 1
  const [focusedDirectRow, setFocusedDirectRow] = useState(false)
  // Keep the same force-mounted content tree when a second activity arrives.
  const open = direct || single || focusedDirectRow || (manualOpen ?? live)
  const hasActivities = activities.length > 0
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || !hasActivities || !onVisible || !bodyRef.current || typeof IntersectionObserver === "undefined") return
    // Only an actually visible, expanded passage needs adjunct facts. The shared
    // Run reader atomically deduplicates this with explicit inspection/Canvas.
    let current = true
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      queueMicrotask(() => { if (current) onVisible() })
    })
    observer.observe(bodyRef.current)
    return () => { current = false; observer.disconnect() }
  }, [open, hasActivities, onVisible])
  if (!hasActivities) return null

  const allSettled = activities.every((activity) => activity.activity === "skill" ? activity.phase === "ready" || activity.phase === "failed" : activity.status !== "running")
  const continuing = continueProcessing && allSettled
  const summary = summarizeProcessActivities(activities).map(({ key, count }) => t(key, { count })).join(" · ")
  const continuation = continuing ? <span className={styles.actionContinuation} role="status">{t("thread.continueProcessing")}</span> : null

  return (
    <Collapsible
      className={styles.process}
      data-mode={mode}
      data-open={open}
      open={open}
      onOpenChange={(nextOpen) => { setFocusedDirectRow(false); setDisclosure(segmentId, nextOpen); if (nextOpen) onInspect?.() }}
    >
      {!single && !direct ? <CollapsibleTrigger asChild>
        <Button variant="ghost" type="button" className={styles.processSummary}>
          <span className={styles.processTitle} title={summary}>{summary}</span>
          {!allSettled ? <span className={styles.actionStatus}>{t("thread.processRunning")}</span> : null}
          {continuation}
          <ChevronDown className={styles.processChevron} aria-hidden="true" />
        </Button>
      </CollapsibleTrigger> : null}
      {single && onInspect && !onOpenActivity ? <Button type="button" variant="ghost" onClick={onInspect}>{t("thread.readActivityDetails")}</Button> : null}
      <CollapsibleContent forceMount className={styles.processReveal}>
        <div className={styles.processClip}>
          <div ref={bodyRef} className={styles.processBody} inert={!open} onFocusCapture={() => {
            // A keyboard user inspecting a direct row must not lose it to inert
            // when a late second activity turns this into a collapsed passage.
            if (single) setFocusedDirectRow(true)
          }}>
            <div className={styles.actgroup}>
              <ProcessActivityRows {...(activityDetails ? { activityDetails } : {})} {...(onOpenActivity ? { onOpenActivity } : {})} activities={activities} continuation={single ? continuation : null} />
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
