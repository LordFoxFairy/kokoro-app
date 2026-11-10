// Canvas 工作区面板的事件总线 store（页面级单例，SSR 零触发）：
// 任何组件可直接 openCanvas/closeCanvas，免层层 prop 钻透（三栏第三栏的开合真源）。
// 会话级记忆：按会话键各存一槽（内容+开合+全屏），切会话即读回各自的槽；
// 「closed」只由用户手动关闭记账——切会话/程序性动作不改开合意图。

import type { RunProcessActivity } from "@/contract/chat"
import type { ReactNode } from "react"

import type {
  SessionDelivery,
  SessionStreamState,
} from "@/core/state"

// 内容引用（非快照）：渲染时按引用向线程状态解析最新数据（工具结果回流即活更新）。
// node 槽是通用 ReactNode 插槽——canvas 不绑死任何单一产物类型。
export type CanvasActivityRef = { kind: "activity"; runId: string; activityId: string; subject: string; generation: number }

export type WorkspaceOutputFile = Readonly<{
  runId: string
  versionId: string
  path: string
  mime: string
  bytes: number
  contentSha256: string
}>

export type CanvasContentRef =
  | CanvasActivityRef
  | { kind: "file"; runId: string; versionId: string; epoch: object }
  | { kind: "delivery"; conversationId: string; artifactId: string }
  | { kind: "node"; title: string; node: ReactNode }

export type CanvasSlot = {
  content: CanvasContentRef | null
  open: boolean
  fullscreen: boolean
}

type CanvasState = {
  byKey: Record<string, CanvasSlot>
}

const CLOSED_SLOT: CanvasSlot = { content: null, open: false, fullscreen: false }

let state: CanvasState = { byKey: {} }
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

function patchSlot(key: string, patch: Partial<CanvasSlot>): void {
  const current = state.byKey[key] ?? CLOSED_SLOT
  state = { byKey: { ...state.byKey, [key]: { ...current, ...patch } } }
  emit()
}

export function subscribeCanvas(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

// useSyncExternalStore 快照：不可变整体，变更即换引用。
export function readCanvasState(): CanvasState {
  return state
}

const EMPTY_STATE: CanvasState = { byKey: {} }

// SSR 快照：恒空且引用稳定（服务端不存在开合意图）。
export function serverCanvasState(): CanvasState {
  return EMPTY_STATE
}

export function canvasSlot(current: CanvasState, key: string | null): CanvasSlot {
  if (key === null) {
    return CLOSED_SLOT
  }
  return current.byKey[key] ?? CLOSED_SLOT
}

// 打开内容：换内容即展开（用户点击产物/工具本身就是打开意图，覆盖此前的手动关闭）。
export function openCanvas(key: string, content: CanvasContentRef): void {
  // Each explicit selection is a fresh intent, including the same artifact.
  // Passive metadata/fullscreen updates keep this reference unchanged.
  patchSlot(key, { content: { ...content }, open: true })
}

// 手动关闭（唯一记「closed」的路径）：内容留槽，重开入口据此可恢复。
export function closeCanvas(key: string): void {
  patchSlot(key, { open: false, fullscreen: false })
}

// 重开：仅当槽里还有内容时生效（无内容无可开）。
export function reopenCanvas(key: string): void {
  const slot = state.byKey[key]
  if (slot?.content) {
    openCanvas(key, slot.content)
  }
}

export function toggleCanvasFullscreen(key: string): void {
  const slot = state.byKey[key] ?? CLOSED_SLOT
  patchSlot(key, { fullscreen: !slot.fullscreen })
}

// 测试隔离入口：清空全部槽位与订阅间互不残留。
export function resetCanvasStore(): void {
  state = { byKey: {} }
  emit()
}

// —— 内容解析（纯派生）：引用 → 线程状态里的最新数据 ——

export type ResolvedCanvasContent =
  | (CanvasActivityRef & { activity: RunProcessActivity; terminal: boolean })
  | { kind: "file"; file: WorkspaceOutputFile }
  | { kind: "delivery"; delivery: SessionDelivery }
  | { kind: "node"; title: string; node: ReactNode }

export function resolveCanvasContent(
  ref: CanvasContentRef,
  thread: SessionStreamState,
  files: readonly WorkspaceOutputFile[] = [],
): ResolvedCanvasContent | null {
  switch (ref.kind) {
    case "activity": {
      const step = thread.stepsByRun[ref.runId]?.find(step => step.kind === "activity" && step.activity.activity_id === ref.activityId)
      const activity = step?.kind === "activity" ? step.activity : thread.executionProcess?.runId === ref.runId ? thread.executionProcess.activities.find(activity => activity.activity_id === ref.activityId) : undefined
      return activity ? { ...ref, activity, terminal: thread.runTerminalsById?.[ref.runId] !== undefined } : null
    }
    case "file": {
      const file = files.find((entry) => entry.runId === ref.runId && entry.versionId === ref.versionId)
      return file ? { kind: "file", file } : null
    }
    case "delivery": {
      const delivery = thread.deliveries.find((d) => d.conversationId === ref.conversationId && d.artifactId === ref.artifactId)
      return delivery ? { kind: "delivery", delivery } : null
    }
    case "node":
      return { kind: "node", title: ref.title, node: ref.node }
  }
}
