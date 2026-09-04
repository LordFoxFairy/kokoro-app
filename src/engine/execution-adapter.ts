// Engine 执行/传输适配边界：集中构造消息与 control wire，并隔离流代际和微任务批处理。

import type { ResumeDecision } from "@/contract/control"
import type {
  DeleteSessionReceipt,
  MessageCreateParams,
  MessageCreateReceipt,
  RunControlReceipt,
  SessionSnapshot,
} from "@/contract/http"
import type { EventCursor } from "@/contract/agui-events"
import type { ChatProjectionEvent } from "@/core/chat-projection-event"
import type { AgentMode } from "@/core/conversations"

import type { EventStreamHandle, SessionClient } from "./client"
import { SessionClientError } from "./client-error"
import type { SessionScope } from "./session-scope"

export type MessageExecutionOptions = {
  mode: AgentMode
  model: string | null
  agent: string | null
  pinnedSkills: readonly string[]
}

export type CreateMessageArgs = {
  sessionId: string
  content: string
  idempotencyKey: string
  options: MessageExecutionOptions
}

export type ResumeRunArgs = {
  sessionId: string
  runId: string
  decisions: readonly ResumeDecision[]
  commandId: string
}

export type CancelRunArgs = {
  sessionId: string
  runId: string
  commandId: string
}

export type ExecutionStreamCallbacks = {
  onCursor: (cursor: EventCursor) => void
  onEvents: (events: readonly ChatProjectionEvent[]) => void
  onStreamError: (error: SessionClientError) => void
}

export type SessionExecutionAdapter = {
  createMessage: (args: CreateMessageArgs) => Promise<MessageCreateReceipt>
  resumeRun: (args: ResumeRunArgs) => Promise<RunControlReceipt>
  cancelRun: (args: CancelRunArgs) => Promise<RunControlReceipt>
  fetchSnapshot: (sessionId: string) => Promise<SessionSnapshot | null>
  deleteSession: (sessionId: string) => Promise<DeleteSessionReceipt>
  openStream: (
    sessionId: string,
    resumeCursor: EventCursor | null,
    callbacks: ExecutionStreamCallbacks,
  ) => void
  closeStream: () => void
}

export function buildMessageCreateParams(args: {
  content: string
  idempotencyKey: string
  options: MessageExecutionOptions
  scope: SessionScope
}): MessageCreateParams {
  const { options } = args
  return {
    idempotency_key: args.idempotencyKey,
    content: args.content,
    thinking: options.mode === "thinking",
    ...(options.model !== null ? { model: options.model } : {}),
    ...(options.agent !== null ? { agent: options.agent } : {}),
    ...(options.pinnedSkills.length > 0 ? { pinned_skills: [...options.pinnedSkills] } : {}),
    ...(args.scope.kind === "project" ? { project_ref: args.scope.projectRef } : {}),
  }
}

type ExecutionAdapterDeps = {
  client: SessionClient
  scope: SessionScope
}

type StreamContext = {
  generation: number
  buffer: ChatProjectionEvent[]
  flushScheduled: boolean
  callbacks: ExecutionStreamCallbacks
  handle: EventStreamHandle | null
}

export function createExecutionAdapter(deps: ExecutionAdapterDeps): SessionExecutionAdapter {
  let streamGeneration = 0
  let activeStream: StreamContext | null = null

  function closeStream(): void {
    streamGeneration += 1
    const stream = activeStream
    activeStream = null
    if (stream !== null) {
      stream.buffer = []
      stream.handle?.close()
      stream.handle = null
    }
  }

  function flushStream(stream: StreamContext): void {
    stream.flushScheduled = false
    if (activeStream !== stream || stream.generation !== streamGeneration) {
      stream.buffer = []
      return
    }
    if (stream.buffer.length === 0) {
      return
    }
    const events = stream.buffer
    stream.buffer = []
    stream.callbacks.onEvents(events)
  }

  function scheduleFlush(stream: StreamContext): void {
    if (stream.flushScheduled) {
      return
    }
    stream.flushScheduled = true
    queueMicrotask(() => flushStream(stream))
  }

  function openStream(
    sessionId: string,
    resumeCursor: EventCursor | null,
    callbacks: ExecutionStreamCallbacks,
  ): void {
    closeStream()
    const stream: StreamContext = {
      generation: streamGeneration,
      buffer: [],
      flushScheduled: false,
      callbacks,
      handle: null,
    }
    activeStream = stream

    const handle = deps.client.openEvents({
      sessionId,
      resumeCursor,
      onCursor: (cursor) => {
        if (activeStream !== stream || stream.generation !== streamGeneration) {
          return
        }
        callbacks.onCursor(cursor)
      },
      onEvent: (event) => {
        if (activeStream !== stream || stream.generation !== streamGeneration) {
          return
        }
        stream.buffer.push(event)
        scheduleFlush(stream)
      },
      onStreamError: (error) => {
        if (activeStream !== stream || stream.generation !== streamGeneration) {
          return
        }
        closeStream()
        callbacks.onStreamError(error)
      },
    })
    stream.handle = handle
    // 某些同步测试/实现可能在 openEvents 内触发回调并关闭流；不遗留已失效句柄。
    if (activeStream !== stream || stream.generation !== streamGeneration) {
      handle.close()
    }
  }

  return {
    createMessage: (args) =>
      deps.client.createMessage(
        args.sessionId,
        buildMessageCreateParams({
          content: args.content,
          idempotencyKey: args.idempotencyKey,
          options: args.options,
          scope: deps.scope,
        }),
      ),
    resumeRun: (args) =>
      deps.client.sendControl(
        args.sessionId,
        args.runId,
        {
          kind: "run.resume",
          session_id: args.sessionId,
          decisions: [...args.decisions],
        },
        args.commandId,
      ),
    cancelRun: (args) =>
      deps.client.sendControl(
        args.sessionId,
        args.runId,
        { kind: "run.cancel", session_id: args.sessionId },
        args.commandId,
      ),
    fetchSnapshot: (sessionId) => deps.client.fetchSnapshot(sessionId),
    deleteSession: (sessionId) => deps.client.deleteSession(sessionId),
    openStream,
    closeStream,
  }
}
