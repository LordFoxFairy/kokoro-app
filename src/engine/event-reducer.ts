// Engine 事件归约边界：把已校验的投影事件批量交给 core reducer，并同步推进本轮相位。

import type { ChatProjectionEvent } from "@/core/chat-projection-event"
import { applyChatProjectionEvents } from "@/core/reducer"
import type { SessionStreamState } from "@/core/state"

import { transition, type MachineState } from "./machine-state"

export type ProjectionEventReduction = {
  thread: SessionStreamState
  machine: MachineState
  // 只有本轮从 active phase 进入 idle 才返回 runId；历史终态返回 null。
  settledRunId: string | null
}

// 一个微任务批次只做一次线程顶层复制；相位仍按事件到达顺序逐个推进，保持历史 replay 的锚定语义。
export function reduceProjectionEvents(input: {
  thread: SessionStreamState
  machine: MachineState
  events: readonly ChatProjectionEvent[]
}): ProjectionEventReduction {
  const thread = applyChatProjectionEvents(input.thread, input.events)
  let machine = input.machine
  let settledRunId: string | null = null

  for (const event of input.events) {
    const before = machine
    machine = transition(machine, {
      type: "STREAM_EVENT",
      runId: event.run_id,
      kind: event.kind,
    })
    if (before.phase !== "idle" && machine.phase === "idle") {
      settledRunId = event.run_id
    }
  }

  return { thread, machine, settledRunId }
}

// receipt 的服务端消息 id 与本地乐观 echo 对账；无待对账 echo 时保留原引用。
export function reconcileUserMessageId(
  state: SessionStreamState,
  serverId: string,
): SessionStreamState {
  const index = state.messages.findLastIndex(
    (message) => message.role === "user" && message.id.startsWith("usr_"),
  )
  const existing = index >= 0 ? state.messages[index] : undefined
  if (existing === undefined) {
    return state
  }

  const messages = [...state.messages]
  if (messages.some((message) => message.id === serverId)) {
    messages.splice(index, 1)
  } else {
    messages[index] = { ...existing, id: serverId }
  }
  return { ...state, messages }
}
