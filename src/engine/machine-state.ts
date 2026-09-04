// 会话相位状态机：只描述合法迁移，不接触线程投影或浏览器 I/O。

import type { ChatProjectionEventKind } from "@/core/chat-projection-event"

export type MachinePhase =
  | "idle"
  | "submitting"
  | "streaming"
  | "reattaching"
  | "awaiting-hitl"
  | "error"

export type MachineState = {
  phase: MachinePhase
  // 本轮锚定 run：只有它的事件能推动相位（历史 run 的终态不收束本轮）。
  runId: string | null
  error: string | null
}

export const IDLE_MACHINE: MachineState = { phase: "idle", runId: null, error: null }

export type MachineEvent =
  | { type: "SUBMIT" }
  | { type: "RECEIPT"; runId: string }
  // awaiting=true：snapshot 带 pending 暂停点，直接落 awaiting-hitl（审批卡即刻可操作）。
  | { type: "REATTACH"; runId: string; awaiting?: boolean }
  | { type: "STREAM_EVENT"; runId: string; kind: ChatProjectionEventKind }
  | { type: "RESUME_SENT" }
  | { type: "CONTROL_FAILED"; error: string }
  | { type: "RESET" }
  | { type: "TIMEOUT" }
  | { type: "FAIL"; error: string }

const ACTIVE_PHASES: readonly MachinePhase[] = ["streaming", "reattaching", "awaiting-hitl"]

// 非法迁移一律返回入参 state（引用相等即「被守卫拒绝」），调用方据此实现同步双发守卫。
export function transition(state: MachineState, event: MachineEvent): MachineState {
  switch (event.type) {
    case "SUBMIT":
      return state.phase === "idle" || state.phase === "error"
        ? { phase: "submitting", runId: null, error: null }
        : state
    case "RECEIPT":
      return state.phase === "submitting"
        ? { phase: "streaming", runId: event.runId, error: null }
        : state
    case "REATTACH":
      return state.phase === "idle" || state.phase === "error"
        ? {
            phase: event.awaiting === true ? "awaiting-hitl" : "reattaching",
            runId: event.runId,
            error: null,
          }
        : state
    case "STREAM_EVENT": {
      if (event.runId !== state.runId || !ACTIVE_PHASES.includes(state.phase)) {
        return state
      }
      if (event.kind === "run.completed" || event.kind === "run.failed") {
        return { phase: "idle", runId: null, error: null }
      }
      if (event.kind === "tool.awaiting_approval") {
        return state.phase === "awaiting-hitl"
          ? state
          : { phase: "awaiting-hitl", runId: state.runId, error: null }
      }
      // 重连后首个本轮事件：退出「重连中」，转为普通流式。
      return state.phase === "reattaching"
        ? { phase: "streaming", runId: state.runId, error: null }
        : state
    }
    case "RESUME_SENT":
      return state.phase === "awaiting-hitl"
        ? { phase: "streaming", runId: state.runId, error: null }
        : state
    case "CONTROL_FAILED":
      // control POST 失败不换相位：暂存保留可重试，仅记录错误供 UI 呈现。
      return { ...state, error: event.error }
    case "RESET":
      return state.phase === "idle" && state.runId === null && state.error === null
        ? state
        : { ...IDLE_MACHINE }
    case "TIMEOUT":
      return ACTIVE_PHASES.includes(state.phase) ? { ...IDLE_MACHINE } : state
    case "FAIL":
      return { phase: "error", runId: null, error: event.error }
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}
