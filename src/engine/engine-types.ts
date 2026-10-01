// 引擎对外类型契约：只描述快照、依赖和用户动作，不承载运行时编排。

import type { SessionClient } from "@/engine/client"
import type { AgentMode, ConversationStore } from "@/core/conversations"
import type { SessionStreamState } from "@/core/state"
import { createSessionStreamState } from "@/core/state"
import type { MessageKey } from "@/i18n/messages"
import type { PersistedStore } from "@/lib/persisted-store"

import { IDLE_MACHINE, type MachineState } from "./machine-state"
import type { SessionScope } from "./session-scope"
import type { ToolDecision } from "./hitl-staging"

export type NoticeSpec = {
  key: MessageKey
  vars?: Readonly<Record<string, string | number>>
}

export type EngineSnapshot = {
  machine: MachineState
  // 瞬态通知（如插话投递失败）：下一次提交时清空；与相位错误（machine.error）分离。
  notice: NoticeSpec | null
  store: ConversationStore | null
  // 活跃会话线程：snapshot 水合 + 事件折叠的内存态（不落盘，服务端是真源）。
  thread: SessionStreamState
  // 空首屏（尚无会话）时选好的模式：首条消息创建首个会话时承接它。
  pendingMode: AgentMode
  // HITL 决策暂存视图：runId → toolId → decision（供工具行渲染 decided 态）。
  staging: Record<string, Record<string, ToolDecision>>
  // 服务端 snapshot 尚未回到当前 active session，UI 用它保留 loading surface。
  hydrating: boolean
  // 当前失败是否仍有未获 create receipt 的同会话冻结意图可按原 key/body 恢复。
  canRetryPendingSubmission: boolean
}

const EMPTY_THREAD: SessionStreamState = createSessionStreamState()

export const SERVER_ENGINE_SNAPSHOT: EngineSnapshot = {
  machine: IDLE_MACHINE,
  notice: null,
  store: null,
  thread: EMPTY_THREAD,
  pendingMode: "fast",
  staging: {},
  hydrating: false,
  canRetryPendingSubmission: false,
}

export type SessionEngine = {
  getSnapshot: () => EngineSnapshot
  subscribe: (listener: () => void) => () => void
  submit: (content: string) => void
  // 仅恢复未获 create receipt 的冻结提交；owner terminal 不经本入口重发。
  retry: () => void
  cancelRun: () => void
  stageToolDecision: (runId: string, toolId: string, decision: ToolDecision) => void
  selectConversation: (id: string) => void
  // 打开服务端清单里的会话（本地索引未见则先纳入缓存再水合）。
  openConversation: (id: string) => void
  newConversation: () => void
  deleteConversation: (id: string) => void
  setMode: (mode: AgentMode) => void
  // 当前会话的 exact Skill source refs；只在内存中保存，提交时冻结进 typed wire。
  setSelectedSkillSourceRefs: (sourceRefs: readonly string[]) => void
  // 选中模型（MODEL-UX）：首条消息上 wire 为 messageCreate.model。
  setModel: (model: string | null) => void
  // 选中 agent（AGENT-PRESET）：首条消息上 wire 为 messageCreate.agent。
  setAgent: (agent: string | null) => void
  dispose: () => void
}

export type EngineDeps = {
  client: SessionClient
  storage: PersistedStore<ConversationStore>
  /** Direct inbox and project workbenches never share a persisted session index. */
  scope?: SessionScope
  now?: () => number
  createId?: (prefix: string) => string
  reattachTimeoutMs?: number
}
