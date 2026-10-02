// 引擎测试替身：内存 SessionClient / PersistedStore，行为可编程、调用可断言。

import type {
  RunControlBody,
  SessionSnapshot,
  MessageCreateParams,
  MessageCreateReceipt,
  RunControlReceipt,
} from "@/contract/http"
import { eventCursorSchema, type EventCursor } from "@/contract/agui-events"
import type { ChatProjectionEvent } from "@/core/chat-projection-event"
import type { OpenEventsArgs, SessionClient, SessionClientError } from "@/engine/client"
import type { PersistedStore } from "@/lib/persisted-store"

export type FakeStream = {
  sessionId: string
  resumeCursor: EventCursor | null
  closed: boolean
  emit: (events: ChatProjectionEvent[], cursors?: readonly EventCursor[]) => void
  reconnecting: () => void
  connected: () => void
  fail: (error: SessionClientError) => void
}

export type FakeClient = SessionClient & {
  createCalls: { sessionId: string; body: MessageCreateParams }[]
  controlCalls: { sessionId: string; runId: string; body: RunControlBody; commandId: string }[]
  snapshotCalls: string[]
  deleteCalls: string[]
  renameCalls: { sessionId: string; title: string }[]
  // 默认成功 receipt；测试可重写为 reject 以驱动失败回滚路径。
  nextRename: (sessionId: string, title: string) => Promise<{ ok: true }>
  streams: FakeStream[]
  nextCreate: (sessionId: string, body: MessageCreateParams) => Promise<MessageCreateReceipt>
  nextControl: () => Promise<RunControlReceipt>
  // 默认 null（服务端无此会话）；测试可按会话编程 snapshot。
  nextSnapshot: (sessionId: string) => Promise<SessionSnapshot | null>
  lastStream: () => FakeStream
}

export function makeReceipt(runId: string): MessageCreateReceipt {
  return {
    run_id: runId,
    user_message_id: `${runId}:user`,
    assistant_message_id: `${runId}:assistant`,
  }
}

function cursorForSequence(sequence: number): EventCursor {
  return eventCursorSchema.parse(`agui_${sequence.toString(16).padStart(32, "0")}`)
}

export function createFakeClient(): FakeClient {
  let runCounter = 0
  const client: FakeClient = {
    createCalls: [],
    controlCalls: [],
    snapshotCalls: [],
    streams: [],
    nextCreate: () => {
      runCounter += 1
      return Promise.resolve(makeReceipt(`run_${runCounter}`))
    },
    nextControl: () => Promise.resolve({
      run_id: "run_control",
      command_id: "command_control",
      request_digest: "sha256:preview-control",
      status: "succeeded",
      replayed: false,
    }),
    nextSnapshot: () => Promise.resolve(null),
    lastStream: () => {
      const stream = client.streams.at(-1)
      if (!stream) {
        throw new Error("no stream opened")
      }
      return stream
    },
    listSessions: () => Promise.resolve({ sessions: [], next_cursor: null }),
    listModels: () => Promise.resolve({ models: [] }),
    listAgents: () => Promise.resolve({ agents: [] }),
    createShare: () => Promise.resolve({ share_id: "shr_fake000000000000000000000000000" }),
    revokeShare: () => Promise.resolve({ ok: true as const }),
    createMessage: (sessionId, body) => {
      client.createCalls.push({ sessionId, body })
      return client.nextCreate(sessionId, body)
    },
    fetchSnapshot: (sessionId) => {
      client.snapshotCalls.push(sessionId)
      return client.nextSnapshot(sessionId)
    },
    deleteCalls: [] as string[],
    deleteSession: (sessionId: string) => {
      client.deleteCalls.push(sessionId)
      return Promise.resolve({ status: "deleted" })
    },
    renameCalls: [] as { sessionId: string; title: string }[],
    nextRename: () => Promise.resolve({ ok: true as const }),
    renameSession: (sessionId: string, title: string) => {
      client.renameCalls.push({ sessionId, title })
      return client.nextRename(sessionId, title)
    },
    sendControl: (sessionId, runId, body, commandId) => {
      client.controlCalls.push({ sessionId, runId, body, commandId })
      return client.nextControl()
    },
    openEvents: (args: OpenEventsArgs) => {
      const stream: FakeStream = {
        sessionId: args.sessionId,
        resumeCursor: args.resumeCursor,
        closed: false,
        emit: (events, cursors = []) => {
          for (const [index, event] of events.entries()) {
            let cursor = cursors[index]
            if (cursor === undefined) {
              if (!("seq" in event)) {
                throw new Error("dispatch failure events require an explicit cursor")
              }
              cursor = cursorForSequence(event.seq)
            }
            args.onCursor(cursor)
            args.onEvent(event)
          }
        },
        reconnecting: () => {
          args.onReconnecting?.(stream.resumeCursor)
        },
        connected: () => {
          args.onConnected?.()
        },
        fail: (error) => {
          args.onStreamError(error)
        },
      }
      client.streams.push(stream)
      return {
        close: () => {
          stream.closed = true
        },
      }
    },
  }
  return client
}

export function createMemoryStorage<T>(initial: T | null = null): PersistedStore<T> & {
  writes: T[]
  clear: () => void
} {
  let value = initial
  const writes: T[] = []
  const listeners = new Set<() => void>()
  return {
    writes,
    clear: () => {
      value = null
      for (const listener of listeners) {
        listener()
      }
    },
    read: () => value,
    write: (next) => {
      value = next
      writes.push(next)
      for (const listener of listeners) {
        listener()
      }
    },
    subscribe: (onChange) => {
      listeners.add(onChange)
      return () => {
        listeners.delete(onChange)
      }
    },
  }
}

// 引擎的批量折叠走微任务：连排空两轮微任务 + 一轮宏任务，覆盖 promise 链与 flush。
export async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}


// R66 public4 HTTP builder exercises the real SessionClient parser and transport.
// Responses/streams are in memory; an unexpected route never reaches the network.
import { createSessionClient as r66CreateSessionClient } from "@/engine/client"

export function createPublic4HttpFixture(initialSnapshot: Record<string, unknown>) {
  let snapshot = initialSnapshot
  let expireNext = false
  const requests: Array<{ method: string; path: string; headers: Headers; body: unknown }> = []
  const controls: Array<{ runId: string; key: string; body: unknown }> = []
  const streams: Array<{
    closed: boolean
    headers: Headers
    controller: ReadableStreamDefaultController<Uint8Array>
  }> = []
  const reply = (data: unknown, status = 200) => new Response(
    JSON.stringify(data),
    { status, headers: { "content-type": "application/json" } },
  )
  const fixture = {
    client: r66CreateSessionClient({ baseUrl: "http://r66.invalid/api/session" }),
    requests, controls, streams,
    setSnapshot: (next: Record<string, unknown>) => { snapshot = next },
    expireNextStream: () => { expireNext = true },
    controlReply: (call: { runId: string; key: string; body: unknown }): Promise<Response> =>
      Promise.resolve(reply({
        run_id: call.runId, command_id: call.key, request_digest: "sha256:r66",
        status: "succeeded", replayed: false,
      }, 202)),
    emit: (cursor: string, event: unknown) => {
      const stream = streams.at(-1)
      if (!stream || stream.closed) throw new Error("R66 requires an open HTTP stream before emission")
      stream.controller.enqueue(new TextEncoder().encode(
        `id: ${cursor}\ndata: ${JSON.stringify(event)}\n\n`,
      ))
    },
    fetcher: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const address = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      const path = new URL(address, "http://r66.invalid").pathname
      const method = init?.method ?? "GET"
      const headers = new Headers(init?.headers)
      const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null
      requests.push({ method, path, headers, body })
      if (method === "GET" && path.endsWith("/events")) {
        if (expireNext) {
          expireNext = false
          return new Response(JSON.stringify({
            error: { code: "event_cursor_expired", message: "R66 expired" },
            meta: { request_id: "r66_request" },
          }), { status: 410, headers: { "content-type": "application/json" } })
        }
        return new Response(new ReadableStream<Uint8Array>({
          start: (controller) => {
            const stream = { closed: false, headers, controller }
            streams.push(stream)
            init?.signal?.addEventListener("abort", () => {
              if (!stream.closed) { stream.closed = true; controller.close() }
            }, { once: true })
          },
          cancel: () => {
            const stream = streams.at(-1)
            if (stream) stream.closed = true
          },
        }), { status: 200, headers: { "content-type": "text/event-stream" } })
      }
      if (method === "GET" && /\/sessions\/[^/]+$/u.test(path)) return reply(snapshot)
      if (method === "POST" && path.endsWith("/messages")) return reply({
        run_id: "run_1", user_message_id: "r66_user", assistant_message_id: "r66_assistant",
      }, 202)
      if (method === "POST" && path.endsWith("/control")) {
        const runId = path.split("/").at(-2)
        if (!runId) throw new Error("R66 malformed control fixture URL")
        const call = { runId, key: headers.get("idempotency-key") ?? "", body }
        controls.push(call)
        return fixture.controlReply(call)
      }
      return new Response(JSON.stringify({
        error: { code: "session_not_found", message: "R66 unexpected fixture route" },
        meta: { request_id: "r66_request" },
      }), { status: 404, headers: { "content-type": "application/json" } })
    },
  }
  return fixture
}
