import { FileChip } from "./artifact-card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import type { SessionToolCall, ToolStatus } from "@/core/state"
import { useT } from "@/i18n/context"
import type { MessageKey } from "@/i18n/messages"
import { ArrowUpRight, ChevronDown, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"

import { RunState } from "./run-state"
import styles from "./thread.module.css"

// 胶囊内的一行简要参数：优先取文件路径的 basename，否则取首个基元值，压到单行短摘要。
// 纯给「一眼看出这次调用在动什么」，不求完整——完整入参在展开区。
function formatArgHint(args: Record<string, unknown>): string | null {
  const path = args["file_path"]
  if (typeof path === "string" && path.length > 0) {
    const parts = path.split("/")
    return parts[parts.length - 1] || path
  }
  for (const value of Object.values(args)) {
    if (typeof value === "string" && value.length > 0) {
      return value.length > 48 ? `${value.slice(0, 47)}…` : value
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value)
    }
  }
  return null
}

// 工具参数压成紧凑 JSON 预览；空参数返回 null（不渲染参数块）。
function formatArgs(args: Record<string, unknown>): string | null {
  const keys = Object.keys(args)
  if (keys.length === 0) {
    return null
  }
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    // 出现循环引用等无法序列化的值时降级为键名列表，绝不因日志化参数而抛错。
    return keys.join(", ")
  }
}

// 结构化收口状态 → 文案 key：文案只活在渲染层，状态层零 UI 文案（i18n 在渲染处取译）。
const CLOSED_NOTE: Partial<Record<ToolStatus, MessageKey>> = {
  "stale-running": "thread.staleRunning",
  cancelled: "thread.cancelledNote",
}

// 单条普通工具调用：扳手 + 名称 + 运行态。有入参/结果/错误时可展开，
// 无任何细节时退化为不可点击的 <div>，避免无意义的死切换。
// 公开 HITL groups/items 由 AssistantTurn 独立渲染，不制造普通工具状态。
export function ToolCallRow({
  sessionId,
  tool,
  onOpenFile,
  onOpenDetail,
}: {
  sessionId: string | null
  tool: SessionToolCall
  onOpenFile?: (path: string) => void
  // pill 点击升级：在 canvas 打开参数/结果详情；未提供时保留内联展开（降级）。
  onOpenDetail?: () => void

}) {
  const t = useT()
  const argsText = formatArgs(tool.args)
  const argHint = formatArgHint(tool.args)
  const running = tool.status === "running"
  const failed = tool.status === "error"
  // rejected：用户驳回了该调用——工具未执行，显禁止圈而非绿勾。
  const rejected = tool.status === "rejected"
  const activeDisclosure = running || failed || rejected
  const closedNoteKey = CLOSED_NOTE[tool.status]
  // responded：done 态但结果由人工答复（非工具产出）——加 provenance 标记，让回看者一眼可辨。
  const responded = Boolean(tool.responded)
  // 有入参/结果/错误/待批/已拒绝/收口说明才展开；无任何细节的工具保持紧凑静态行。
  // 文件类工具的产出路径（工具行本地推断——路径即入口，无需任何产物事件）。
  const filePath =
    (tool.name === "write_file" || tool.name === "edit_file") &&
    typeof tool.args["file_path"] === "string" && tool.args["file_path"]
      ? (tool.args["file_path"] as string)
      : null
  const hasDetail =
    argsText !== null ||
    Boolean(tool.result) ||
    filePath !== null ||
    failed ||
    rejected ||
    closedNoteKey !== undefined

  const head = (
    <>
      <Wrench className={styles.toolIcon} />
      <span className={styles.toolName}>{tool.name}</span>
      {argHint !== null ? <span className={styles.toolArgHint}>{argHint}</span> : null}
      {responded ? <span className={styles.toolResponded}>{t("hitl.answered")}</span> : null}
      <span className={styles.toolState} aria-hidden>
        <RunState
          done={tool.status === "done"}
          failed={failed}
          rejected={rejected || closedNoteKey !== undefined}
        />
      </span>
    </>
  )

  if (!hasDetail) {
    return (
      <div className={styles.tool} data-status={tool.status}>
        <div className={cn(styles.toolSummary, styles.toolSummaryStatic)}>{head}</div>
      </div>
    )
  }

  // 普通工具日志可在 Canvas 打开；交互卡片独立留在会话流。
  // 未提供 onOpenDetail（无会话/装配缺位）时保留内联展开；有会话则升级到 canvas。
  const openInCanvas = onOpenDetail !== undefined

  // 进入 Canvas 的工具行不是一个 disclosure：如果继续套 Collapsible，
  // 点击后 aria-expanded 仍会停在 false、chevron 也会像「没有打开」一样，
  // 造成视觉和无障碍状态与真实动作不一致。这里直接渲染 action button，
  // 让按钮语义明确表达「打开工作区」。
  if (openInCanvas) {
    return (
      <div className={styles.tool} data-status={tool.status}>
        <Button
          type="button"
          variant="ghost"
          className={styles.toolSummary}
          data-canvas-opener="true"
          aria-label={t("canvas.openTool", { name: tool.name })}
          onClick={onOpenDetail}
        >
          {head}
          <ArrowUpRight className={styles.toolOpenIcon} aria-hidden="true" />
        </Button>
      </div>
    )
  }

  return (
    <Collapsible
      key={`${tool.id}:${activeDisclosure ? "active" : "settled"}`}
      className={styles.tool}
      data-status={tool.status}
      defaultOpen={activeDisclosure}
    >
      {/* chevron 作为统一的「可展开」提示——只有可展开行才有，静态行没有，让两者一眼可辨。 */}
      <CollapsibleTrigger
        asChild
      >
        <Button
          type="button"
          variant="ghost"
          className={styles.toolSummary}
        >
          {head}
          <ChevronDown className={styles.toolChevron} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className={styles.toolDetail}>
        {/* V1 args 只读展示（无定制编辑 UI 前不提供任何参数编辑入口）。 */}
        {argsText !== null ? <pre className={styles.toolArgs}>{argsText}</pre> : null}
        {failed ? (
          <p className={styles.toolError} role="status">
            {/* || 而非 ??：空串错误文本（无消息异常）也回落到兜底文案，绝不渲染空白红条。 */}
            {tool.errorText || t("thread.toolFailed")}
          </p>
        ) : rejected ? (
          <p className={styles.toolRejectedNote} role="status">
            {t("thread.rejected")}
          </p>
        ) : closedNoteKey !== undefined ? (
          <p className={styles.toolRejectedNote} role="status">
            {t(closedNoteKey)}
          </p>
        ) : tool.result ? (
          // awaiting 时不重复渲染结果：result_review 的待审结果由审核卡只读区独占展示。
          <pre className={styles.toolResult}>{tool.result}</pre>
        ) : running ? (
          <p className={styles.pending}>
            {t("thread.running")}
            <span className={styles.pulse} aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </p>
        ) : null}
        {filePath !== null && sessionId !== null && onOpenFile !== undefined && tool.status === "done" ? (
          <FileChip path={filePath} onOpen={() => onOpenFile?.(filePath)} />
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  )
}
