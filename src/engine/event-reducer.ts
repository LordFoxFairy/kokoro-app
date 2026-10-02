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
  optimisticUserIds?: ReadonlySet<string>
}): ProjectionEventReduction {
  // A user SSE frame has no local admission correlation. Keep exact pending
  // echoes outside the core content heuristic until their own receipt arrives.
  const protectedMessages = input.thread.messages.flatMap((message, index) =>
    message.role === "user" && input.optimisticUserIds?.has(message.id) ? [{ message, index }] : [])
  const base = protectedMessages.length === 0 ? input.thread : {
    ...input.thread, messages: input.thread.messages.filter((message) => !input.optimisticUserIds?.has(message.id)),
  }
  let thread = applyChatProjectionEvents(base, input.events)
  if (protectedMessages.length > 0) {
    const messages = [...thread.messages]
    for (const { message, index } of protectedMessages) messages.splice(index, 0, message)
    thread = { ...thread, messages }
  }
  let machine = input.machine
  let settledRunId: string | null = null

  for (const event of input.events) {
    const before = machine
    machine = transition(machine, {
      type: "STREAM_EVENT",
      runId: event.run_id,
      kind: event.kind,
      ...(event.kind === "interaction.state" ? { interactionPhase: event.payload.phase } : {}),
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
  optimisticId: string,
): SessionStreamState {
  const index = state.messages.findIndex((message) => message.role === "user" && message.id === optimisticId)
  const existing = state.messages[index]
  if (existing === undefined) return state
  // SSE may already contain the canonical row. Preserve its owner content and
  // run identity, but retain this admission's position, not another local echo.
  const canonical = state.messages.find((message) => message.role === "user" && message.id === serverId)
  const messages = state.messages.flatMap((message, position) => {
    if (position === index) return [{ ...(canonical ?? existing), id: serverId }]
    return message.id === serverId && message.role === "user" ? [] : [message]
  })
  return { ...state, messages }
}
