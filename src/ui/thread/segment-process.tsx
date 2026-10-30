import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, Sparkles } from "lucide-react"
import { useSyncExternalStore } from "react"
import { z } from "zod"

import type { AgentMode } from "@/core/conversations"
import type { SessionStep, SessionToolCall } from "@/core/state"
import type { RunProcessActivity } from "@/contract/chat"
import { useT } from "@/i18n/context"
import type { MessageKey } from "@/i18n/messages"
import { createPersistedStore } from "@/lib/persisted-store"

import { SubagentRow } from "./subagent-row"
import { ToolCallRow } from "./tool-call-row"
import { RunState } from "./run-state"
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
  // 该段全局唯一 id：作为持久化展开意图（manualOpen）的键，跨刷新保留。
  segmentId: string
  // Older runs use thinking/tool/subagent steps instead of activity.updated.
  legacySteps: Array<Extract<SessionStep, { kind: "thinking" | "tool" | "subagent" }>>
  // 这一段的过程：思考独白 + 该段用到的工具 + 子智能体。
  activities: RunProcessActivity[]
  // 这一段是否仍在生长（整轮的尾段）：决定默认展开（实时看）与「思考中」脉冲。
  live: boolean
  // 本会话模式：Fast 把「思考」改称「处理」，避免「直接作答」与「思考」自相矛盾。
  mode?: AgentMode

}

// 落定摘要：「思考过程 · N 工具(K 失败) · M 子智能体」，省略为零的维度。
// 失败数作为「工具」的从属括注（非并列维度），让子集关系一眼可辨、不被误读为相加。
type Translate = (key: MessageKey, vars?: Readonly<Record<string, string | number>>) => string

function settledSummary(
  t: Translate,
  verb: string,
  tools: number,
  subs: number,
  failed: number,
): string {
  const parts = [t("thread.processTitle", { verb })]
  if (tools > 0) {
    parts.push(
      failed > 0 ? t("thread.toolCountFailed", { tools, failed }) : t("thread.toolCount", { tools }),
    )
  }
  if (subs > 0) parts.push(t("thread.subCount", { subs }))
  return parts.join(" · ")
}

function legacyToolStatus(t: Translate, status: SessionToolCall["status"]): string {
  switch (status) {
    case "running":
      return t("thread.processRunning")
    case "error":
      return t("thread.processFailed")
    case "done":
      return t("thread.processCompleted")
    // These terminal states have no dedicated public copy. They must still
    // be rendered as settled states instead of falling through to a spinner.
    case "rejected":
    case "stale-running":
    case "cancelled":
      return t("thread.processCompleted")
  }
}

// 一段的「过程块」：挂在该段答案气泡【下面】的可折叠次级披露——比气泡更轻（muted）。
// 流式中（尾段）默认展开方便实时看，落定后收成一行摘要，保持对话干净。全空时不渲染。
export function SegmentProcess({
  segmentId,
  legacySteps,
  activities,
  live,
  mode,
}: SegmentProcessProps) {
  const t = useT()
  // 默认展开态跟随 live 信号：尾段流式时摊开实时看，落定即收成一行摘要。
  // 一旦用户手动切换（manualOpen 落定），就以用户意图为准、不再随 live 变化对抗用户。
  // 用 shadcn Collapsible 统一键盘、aria-expanded、焦点和展开状态；状态机不靠 remount。
  const manualOpen = useDisclosure(segmentId)
  const open = manualOpen ?? live

  const tools = activities.filter((activity): activity is Extract<RunProcessActivity, { activity: "tool" }> => activity.activity === "tool")
  const subagents = activities.filter((activity): activity is Extract<RunProcessActivity, { activity: "subagent" }> => activity.activity === "subagent")
  const hasProcess = legacySteps.length > 0 || activities.length > 0
  if (!hasProcess) {
    return null
  }
  // Manus keeps a settled, text-only reasoning trace out of the primary
  // reading column; the task progress affordance is the disclosure surface.
  // Ordinary tool rows retain their disclosure; interactions live outside this block.

  const verb = mode === "fast" ? t("thread.verbFast") : t("thread.verbThink")
  const legacyTools = legacySteps.filter((step): step is Extract<SessionStep, { kind: "tool" }> => step.kind === "tool")
  const legacySubagents = legacySteps.filter((step): step is Extract<SessionStep, { kind: "subagent" }> => step.kind === "subagent")
  const failedTools = tools.filter((tool) => tool.status === "failed").length + legacyTools.filter((step) => step.tool.status === "error").length
  // This summary describes ordinary process activity, never the HITL collection.
  const summary = live
      ? t("thread.verbActive", { verb })
      : settledSummary(t, verb, tools.length + legacyTools.length, subagents.length + legacySubagents.length, failedTools)

  return (
    <Collapsible
      className={styles.process}
      data-mode={mode}
      data-open={open}
      open={open}
      onOpenChange={(nextOpen) => setDisclosure(segmentId, nextOpen)}
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          type="button"
          className={styles.processSummary}
        >
        <Sparkles className={styles.processSpark} />
        {/* key 随 live 翻转：落定时标题 remount，配合 CSS 让新摘要淡入（live↔settled 不硬跳）。 */}
        <span className={styles.processTitle} key={live ? "live" : "settled"}>
          {summary}
        </span>
        {live ? (
          <span className={styles.processLive} aria-label={t("thread.verbActiveShort", { verb })}>
            <i />
            <i />
            <i />
          </span>
        ) : null}
        <ChevronDown className={styles.processChevron} />
        </Button>
      </CollapsibleTrigger>

      {/* 三层：reveal 做 grid 0fr↔1fr 高度过渡；clip 是纯裁剪的 grid 项（收起时把 body 整体裁到 0，
          含其滚动视口）；body 保留自身滚动封顶。少一层 clip 收起就裁不净嵌套滚动容器。 */}
      <CollapsibleContent forceMount className={styles.processReveal}>
        <div className={styles.processClip}>
          {/* inert（收起时）把内容移出无障碍树 + 不可聚焦，补回 Collapsible 的隐藏语义；
              它不设 display:none，故 grid 高度过渡仍能动（视觉裁剪由 clip 的 overflow:hidden 负责）。 */}
          <div className={styles.processBody} inert={!open}>
            {legacySteps.map((step, index) => {
              if (step.kind === "thinking") {
                return <p className={styles.processThinking} key={`thinking-${step.seq}-${index}`}>{step.text}</p>
              }
              if (step.kind === "tool") {
                const status = legacyToolStatus(t, step.tool.status)
                const terminal = step.tool.status !== "running"
                return <div className={styles.tool} data-status={step.tool.status} key={`tool-${step.tool.id}-${step.seq}-${index}`}><div className={styles.toolSummary}><span className={styles.toolName}>{step.tool.name}</span><span>{status}</span><span className={styles.toolState} aria-hidden><RunState done={step.tool.status === "done"} failed={step.tool.status === "error"} rejected={terminal && step.tool.status !== "done" && step.tool.status !== "error"} /></span></div></div>
              }
              const status = step.subagent.status === "running" ? t("thread.processRunning") : step.subagent.status === "done" ? t("thread.processCompleted") : t("thread.processFailed")
              return <div className={styles.subagent} data-status={step.subagent.status} key={`subagent-${step.subagent.id}-${step.seq}-${index}`}><div className={styles.subagentSummary}><span className={styles.subagentName}>{step.subagent.name}</span><span>{status}</span><span className={styles.subagentState} aria-hidden><RunState done={step.subagent.status === "done"} failed={step.subagent.status === "failed"} /></span></div></div>
            })}
            {activities.length > 0 ? (
              <div className={styles.actgroup} aria-label={t("thread.processTitle", { verb })}>
                {activities.map((activity) => {
                  if (activity.activity === "tool") return <ToolCallRow key={activity.activity_id} activity={activity} />
                  if (activity.activity === "subagent") return <SubagentRow key={activity.activity_id} activity={activity} />
                  return <div className={styles.tool} data-status={activity.phase} key={activity.activity_id}>
                    <div className={styles.toolSummary}><span className={styles.toolName}>{t("thread.skill")}</span><span>{t(activity.phase === "resolving" ? "thread.skillResolving" : activity.phase === "loading" ? "thread.skillLoading" : activity.phase === "ready" ? "thread.skillReady" : "thread.skillFailed")}</span></div>
                    {activity.source_refs.length > 0 ? <div className={styles.processThinking} data-skill-refs="true">{activity.source_refs.map((ref) => ref.replace(/^skill:/u, "")).join(" · ")}</div> : null}
                  </div>
                })}
              </div>
            ) : null}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
