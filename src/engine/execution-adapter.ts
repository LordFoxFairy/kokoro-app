import { selectedCustomApiProfilesSchema, selectedResourceRefsSchema, type SelectedResourceRef } from "@/contract/chat"
import { freezeCustomApiSelection, type CustomApiSelection } from "./custom-api-selection"
// Engine 执行/传输适配边界：集中构造消息与 control wire，并隔离流代际和微任务批处理。

import type { InteractionState, ResumeDecision } from "@/contract/control"
import type {
  DeleteSessionReceipt,
  MessageCreateParams,
  MessageCreateReceipt,
  RunControlReceipt,
  SessionSnapshot,
} from "@/contract/http"
import type { EventCursor } from "@/contract/agui-events"
import type { AgUiTransportFrame } from "./agui-chat-transport"
import type { AgentMode } from "@/core/conversations"

import type { EventStreamHandle, SessionClient } from "./client"
import { SessionClientError } from "./client-error"
import type { SessionScope } from "./session-scope"
import type { SteerReceipt, SteerSubmission } from "./submission-recovery"
import { fetchCompleteSnapshot } from "./hydrate-process"

export type MessageExecutionOptions = {
  mode: AgentMode
  model: string | null
  selectedSkillSourceRefs: readonly string[] | undefined
  selectedResourceRefs?: readonly SelectedResourceRef[]
  selectedCustomApiProfiles?: readonly CustomApiSelection[]
  selectedMcpConnectionIds?: readonly string[]
  interruptRunId?: string
}

export type CreateMessageArgs = {
  sessionId: string
  content: string
  idempotencyKey: string
  options: MessageExecutionOptions
}

export type ResumeRunArgs = {
  expectedPauseRevision: number
  pauseRef: string
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
  interactionBaselines?: Readonly<Record<string, InteractionState>>
  onEvents: (events: readonly AgUiTransportFrame[]) => void | Promise<void>
  onReconnecting?: (cursor: EventCursor | null) => void
  onConnected?: () => void
  onStreamError: (error: SessionClientError) => void
}

export type SessionExecutionAdapter = {
  createMessage: (args: CreateMessageArgs) => Promise<MessageCreateReceipt>
  steerRun: (args: SteerSubmission) => Promise<SteerReceipt>
  resumeRun: (args: ResumeRunArgs) => Promise<RunControlReceipt>
  cancelRun: (args: CancelRunArgs) => Promise<RunControlReceipt>
  fetchSnapshot: (sessionId: string) => Promise<SessionSnapshot | null>
  readSteerStatus: (sessionId: string, signal: AbortSignal) => Promise<SessionSnapshot | null>
  deleteSession: (sessionId: string) => Promise<DeleteSessionReceipt>
  abortDelete: () => void
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
  const customApis = freezeCustomApiSelection(options.selectedCustomApiProfiles ?? [])
  return {
    idempotency_key: args.idempotencyKey,
    content: args.content,
    thinking: options.mode === "thinking",
    ...(options.interruptRunId === undefined ? {} : { interrupt_run_id: options.interruptRunId }),
    ...(options.model !== null ? { model: options.model } : {}),
    ...(options.selectedSkillSourceRefs === undefined ? {} : { selected_skill_source_refs: [...options.selectedSkillSourceRefs] }),
    ...(options.selectedResourceRefs?.length ? {
      selected_resource_refs: selectedResourceRefsSchema.parse([...options.selectedResourceRefs]),
    } : {}),
    ...(options.selectedMcpConnectionIds?.length ? { selected_mcp_connection_ids: [...options.selectedMcpConnectionIds] } : {}),
    ...(customApis.length ? { selected_custom_api_profiles: selectedCustomApiProfilesSchema.parse(customApis.map(value => ({ profile_id: value.profileId, expected_state_version: Number(value.expectedStateVersion) }))) } : {}),
    ...(args.scope.kind === "project" ? { project_ref: args.scope.projectRef } : {}),
  }
}

type ExecutionAdapterDeps = {
  client: SessionClient
  scope: SessionScope
}

type StreamContext = {
  generation: number
  buffer: Array<{ frame: AgUiTransportFrame; resolve: () => void; reject: (error: unknown) => void }>
  tail: Promise<void>
  scheduled: boolean
  pending: number
  callbacks: ExecutionStreamCallbacks
  handle: EventStreamHandle | null
}

export function createExecutionAdapter(deps: ExecutionAdapterDeps): SessionExecutionAdapter {
  const snapshotDeadlineMs = 10_000
  let streamGeneration = 0
  let activeStream: StreamContext | null = null
  const snapshotControllers = new Set<AbortController>()
  const deleteControllers = new Set<AbortController>()

  function fetchSnapshot(sessionId: string): Promise<SessionSnapshot | null> {
    for (const controller of snapshotControllers) controller.abort()
    snapshotControllers.clear()
    const controller = new AbortController()
    snapshotControllers.add(controller)
    const deadlineAt = performance.now() + snapshotDeadlineMs
    let timedOut = false
    const timeoutError = (): Error => new Error("snapshot read timeout")
    const abortError = (): unknown => timedOut
      ? timeoutError()
      : controller.signal.reason instanceof Error
        ? controller.signal.reason
        : new Error("snapshot read aborted")
    let onAbort: () => void = () => undefined
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(abortError())
      controller.signal.addEventListener("abort", onAbort, { once: true })
    })
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort(timeoutError())
    }, snapshotDeadlineMs)
    const complete = fetchCompleteSnapshot(deps.client, sessionId, deps.scope, controller.signal, deadlineAt)
    return Promise.race([complete, aborted]).then((snapshot) => {
      if (controller.signal.aborted) throw abortError()
      if (performance.now() >= deadlineAt) throw timeoutError()
      return snapshot
    }).finally(() => {
      clearTimeout(timer)
      controller.signal.removeEventListener("abort", onAbort)
      snapshotControllers.delete(controller)
    })
  }

  function closeStream(): void {
    streamGeneration += 1
    const stream = activeStream
    activeStream = null
    if (stream !== null) {
      for (const entry of stream.buffer) entry.resolve()
      stream.buffer = []
      stream.handle?.close()
      stream.handle = null
    }
  }

  function deleteSession(sessionId: string): Promise<DeleteSessionReceipt> {
    const controller = new AbortController()
    deleteControllers.add(controller)
    const timeout = setTimeout(() => controller.abort(), 10_000)
    return deps.client.deleteSession(sessionId, deps.scope, controller.signal).finally(() => {
      clearTimeout(timeout)
      deleteControllers.delete(controller)
    })
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
      tail: Promise.resolve(),
      scheduled: false,
      pending: 0,
      callbacks,
      handle: null,
    }
    activeStream = stream

    const handle = deps.client.openEvents({
      sessionId,
      resumeCursor,
      ...(callbacks.interactionBaselines === undefined ? {} : { interactionBaselines: callbacks.interactionBaselines }),
      // Cursor adoption belongs to the same frame batch in the engine, not receipt time.
      onCursor: () => {},
      onFrame: (frame) => {
        if (activeStream !== stream || stream.generation !== streamGeneration) return
        stream.pending++
        const adopted = new Promise<void>((resolve, reject) => stream.buffer.push({ frame, resolve, reject }))
        if (!stream.scheduled) {
          stream.scheduled = true
          queueMicrotask(() => {
            stream.scheduled = false
            const entries = stream.buffer
            stream.buffer = []
            stream.tail = stream.tail.then(async () => {
              if (activeStream !== stream || stream.generation !== streamGeneration) {
                for (const entry of entries) entry.resolve()
                return
              }
              try {
                await callbacks.onEvents(entries.map(entry => entry.frame))
                for (const entry of entries) entry.resolve()
              } catch (error) {
                for (const entry of entries) entry.reject(error)
              } finally { stream.pending -= entries.length }
            })
          })
        }
        return adopted
      },
      onReconnecting: (cursor) => {
        if (activeStream !== stream || stream.generation !== streamGeneration) {
          return
        }
        callbacks.onReconnecting?.(cursor)
      },
      onConnected: () => {
        if (activeStream !== stream || stream.generation !== streamGeneration) {
          return
        }
        callbacks.onConnected?.()
      },
      onStreamError: (error) => {
        if (activeStream !== stream || stream.generation !== streamGeneration) {
          return
        }
        const finish = () => {
          if (activeStream !== stream || stream.generation !== streamGeneration) return
          closeStream()
          callbacks.onStreamError(error)
        }
        if (stream.pending === 0) finish()
        else queueMicrotask(() => { void stream.tail.then(async () => {
          await Promise.resolve()
          finish()
        }) })
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
    steerRun: async ({ sessionId, runId, idempotencyKey, clientMessageId, content }) => {
      const receipt = await deps.client.sendControl(
        sessionId, runId, { kind: "run.steer", message_id: clientMessageId, content },
        idempotencyKey, deps.scope,
      )
      if (receipt.run_id !== runId || receipt.command_id !== idempotencyKey || !receipt.message_id) {
        throw new SessionClientError("parse", "Steer receipt does not match the submitted Run and command")
      }
      return { ...receipt, message_id: receipt.message_id }
    },
    resumeRun: (args) =>
      deps.client.sendControl(
        args.sessionId,
        args.runId,
        {
          kind: "run.resume",
          expected_pause_revision: args.expectedPauseRevision,
          pause_ref: args.pauseRef,
          decisions: [...args.decisions],
        },
        args.commandId,
      ),
    cancelRun: (args) =>
      deps.client.sendControl(
        args.sessionId,
        args.runId,
        { kind: "run.cancel" },
        args.commandId,
      ),
    fetchSnapshot,
    readSteerStatus: (sessionId, signal) => deps.client.fetchSnapshot(sessionId, { signal, scope: deps.scope }),
    deleteSession,
    abortDelete: () => {
      for (const controller of deleteControllers) controller.abort()
      deleteControllers.clear()
    },
    openStream,
    closeStream: () => {
      for (const controller of snapshotControllers) controller.abort()
      snapshotControllers.clear()
      closeStream()
    },
  }
}
