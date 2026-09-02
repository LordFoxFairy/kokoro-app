// session HTTP/SSE 客户端：全部入站（含 POST 回执与 snapshot）过 contract Zod；失败以类型化错误上抛，零静默降级。

import { ZodError } from "zod"

import {
  artifactListSchema,
  artifactsPath,
  controlPath,
  eventsPath,
  LAST_EVENT_ID_HEADER,
  messagesPath,
  parseSessionSnapshot,
  runControlReceiptSchema,
  sessionListSchema,
  sessionsPath,
  sharePath,
  shareReceiptSchema,
  snapshotPath,
  messageCreateReceiptSchema,
  modelCandidatesPath,
  modelCandidateListSchema,
  agentCandidatesPath,
  agentCandidateListSchema,
  type AgentCandidateList,
  type ArtifactList,
  type ModelCandidateList,
  type RunControlBody,
  type RunControlReceipt,
  type SessionList,
  type SessionSnapshot,
  type ShareReceipt,
  type MessageCreateParams,
  type MessageCreateReceipt,
  deleteSessionReceiptSchema,
  type DeleteSessionReceipt,
  renameSessionPath,
  renameSessionReceiptSchema,
  type RenameSessionReceipt,
} from "@/contract/http"
import { parseSessionEvent, type SessionEvent } from "@/contract/session-events"
import type { SessionScope } from "./session-scope"

export type ClientFailureReason = "network" | "http" | "parse"

export class SessionClientError extends Error {
  readonly reason: ClientFailureReason

  constructor(reason: ClientFailureReason, message: string) {
    super(message)
    this.name = "SessionClientError"
    this.reason = reason
  }
}

export type EventStreamHandle = { close: () => void }

export type OpenEventsArgs = {
  sessionId: string
  // 续流水位（snapshot event_watermark 或已折叠的最大 seq）：作为 Last-Event-ID 请求头上送。
  lastEventId?: number
  onEvent: (event: SessionEvent) => void
  // 入站载荷未过契约或流已不可恢复：交状态机转错误态。
  onStreamError: (error: SessionClientError) => void
}

export type SessionClient = {
  // 会话清单（SESS-LIST）：owner 隔离、updated_at desc、软删不出；复合游标分页（cursor 缺省=首页）。
  listSessions: (cursor?: string, scope?: SessionScope) => Promise<SessionList>
  createMessage: (sessionId: string, body: MessageCreateParams) => Promise<MessageCreateReceipt>
  // 服务端不存在该会话（404）返回 null（本地新会话的合法答案）；其余失败照常上抛。
  fetchSnapshot: (sessionId: string) => Promise<SessionSnapshot | null>
  sendControl: (
    sessionId: string,
    runId: string,
    body: RunControlBody,
  ) => Promise<RunControlReceipt>
  // 软删除（technical/16）：服务端打状态位；幂等（不存在/已删除同为 202）。
  deleteSession: (sessionId: string) => Promise<DeleteSessionReceipt>
  // 会话重命名（CONV-UX）：显式改题（他人 403 / 软删·不存在 404 / 超 256 → 422）；成功 200 {ok:true}。
  renameSession: (sessionId: string, title: string) => Promise<RenameSessionReceipt>
  // 模型候选（MODEL-UX）：本 namespace 声明可选 ∩ platform resolve 可用性；输入框下拉据此枚举。
  listModels: () => Promise<ModelCandidateList>
  // agent 候选（AGENT-PRESET）：本 namespace 声明的具名预设 + general 缺省入口；输入框选择器据此枚举。
  listAgents: () => Promise<AgentCandidateList>
  // 作品库（ARTIFACT-LIB）：属主 namespace 全部成果跨会话聚合、复合游标分页（cursor 缺省=首页）。
  listArtifacts: (cursor?: string) => Promise<ArtifactList>
  // 分享（SHARE-1）：创建返 share_id（活跃分享幂等返同 id）；撤销置失效（公共读随即 404）。
  createShare: (sessionId: string) => Promise<ShareReceipt>
  revokeShare: (sessionId: string) => Promise<RunControlReceipt>
  openEvents: (args: OpenEventsArgs) => EventStreamHandle
}

// 断流重连间隔：对齐 EventSource 的默认重试节奏，按最后 seq 续连不重放。
const SSE_RETRY_MS = 2_000

function describeUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// 失败响应尽力取出契约错误码（如 session_run_active）作为错误消息，供上层识别。
async function httpError(method: string, url: string, response: Response): Promise<SessionClientError> {
  let detail = `${method} ${url} failed with status ${response.status}`
  try {
    const raw: unknown = await response.json()
    if (typeof raw === "object" && raw !== null && "error" in raw) {
      const error = raw.error
      if (typeof error === "string") {
        detail = error
      } else if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
        detail = error.message
      }
    }
  } catch {
    // 无 JSON 错误体：保留状态码描述。
  }
  return new SessionClientError("http", detail)
}

async function parseJsonResponse<T>(response: Response, parse: (raw: unknown) => T): Promise<T> {
  let raw: unknown
  try {
    raw = await response.json()
  } catch (error) {
    throw new SessionClientError("parse", describeUnknown(error))
  }
  try {
    return parse(raw)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new SessionClientError("parse", error.message)
    }
    throw error
  }
}

async function postJson<T>(url: string, body: unknown, parse: (raw: unknown) => T): Promise<T> {
  let response: Response
  const bodyRecord = typeof body === "object" && body !== null && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null
  const idempotencyKey = typeof bodyRecord?.idempotency_key === "string" && bodyRecord.idempotency_key.trim() !== ""
    ? bodyRecord.idempotency_key.trim()
    : `session-mutation:${crypto.randomUUID()}`
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new SessionClientError("network", describeUnknown(error))
  }
  if (!response.ok) {
    throw await httpError("POST", url, response)
  }
  return parseJsonResponse(response, parse)
}

// SSE 帧增量解析（纯函数）：跨 chunk 累积，按空行切帧，帧内 data 行拼接后回调。
export function createSseFrameParser(onData: (data: string) => void): (chunk: string) => void {
  let buffer = ""
  return (chunk) => {
    buffer += chunk
    let separatorMatch = /\r?\n\r?\n/.exec(buffer)
    while (separatorMatch !== null) {
      const separator = separatorMatch.index
      const frame = buffer.slice(0, separator)
      buffer = buffer.slice(separator + separatorMatch[0].length)
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).replace(/^ /, ""))
        .join("\n")
      if (data.length > 0) {
        onData(data)
      }
      separatorMatch = /\r?\n\r?\n/.exec(buffer)
    }
  }
}

export function createSessionClient(options: { baseUrl: string }): SessionClient {
  // 契约路径以 `/` 打头，故 base+path 直接拼接（非 new URL——那会丢掉 `/api/session` 前缀）。
  // baseUrl 可为绝对源（`http://host`）或同源相对前缀（`/api/session`）。
  const base = options.baseUrl.replace(/\/+$/, "")
  const url = (path: string): string => `${base}${path}`
  // 鉴权（AUTH-P0）：同源 BFF 代理注入 Bearer；浏览器不持 token，靠 httpOnly 信封 cookie
  // 同源自动携带，客户端不加任何 Authorization 头。

  return {
    listSessions: async (cursor, scope = { kind: "direct" }) => {
      const queryParams = new URLSearchParams()
      if (cursor !== undefined) queryParams.set("cursor", cursor)
      if (scope.kind === "project") {
        queryParams.set("project_ref", scope.projectRef)
      } else {
        queryParams.set("scope", "direct")
      }
      const query = queryParams.size > 0 ? `?${queryParams.toString()}` : ""
      const target = url(`${sessionsPath()}${query}`)
      let response: Response
      try {
        response = await fetch(target, { cache: "no-store" })
      } catch (error) {
        throw new SessionClientError("network", describeUnknown(error))
      }
      if (!response.ok) {
        throw await httpError("GET", target, response)
      }
      return parseJsonResponse(response, (raw) => sessionListSchema.parse(raw))
    },

    createMessage: (sessionId, body) =>
      postJson(url(messagesPath(sessionId)), body, (raw) => messageCreateReceiptSchema.parse(raw)),

    listModels: async () => {
      const target = url(modelCandidatesPath())
      let response: Response
      try {
        response = await fetch(target, { cache: "no-store" })
      } catch (error) {
        throw new SessionClientError("network", describeUnknown(error))
      }
      if (!response.ok) {
        throw await httpError("GET", target, response)
      }
      return parseJsonResponse(response, (raw) => modelCandidateListSchema.parse(raw))
    },

    listAgents: async () => {
      const target = url(agentCandidatesPath())
      let response: Response
      try {
        response = await fetch(target, { cache: "no-store" })
      } catch (error) {
        throw new SessionClientError("network", describeUnknown(error))
      }
      if (!response.ok) {
        throw await httpError("GET", target, response)
      }
      return parseJsonResponse(response, (raw) => agentCandidateListSchema.parse(raw))
    },

    fetchSnapshot: async (sessionId) => {
      const target = url(snapshotPath(sessionId))
      let response: Response
      try {
        response = await fetch(target, { cache: "no-store" })
      } catch (error) {
        throw new SessionClientError("network", describeUnknown(error))
      }
      // 404=从无此会话；410 Gone=会话已软删。两者服务端都无内容可水合，
      // 一律返 null（空线程即真态），不 fail-loud——与 machine 把 session_deleted
      // 当 STALE 对账信号而非硬错的语义一致。
      if (response.status === 404 || response.status === 410) {
        return null
      }
      if (!response.ok) {
        throw await httpError("GET", target, response)
      }
      return parseJsonResponse(response, parseSessionSnapshot)
    },

    listArtifacts: async (cursor) => {
      const query = cursor !== undefined ? `?cursor=${encodeURIComponent(cursor)}` : ""
      const target = url(`${artifactsPath()}${query}`)
      let response: Response
      try {
        response = await fetch(target, { cache: "no-store" })
      } catch (error) {
        throw new SessionClientError("network", describeUnknown(error))
      }
      if (!response.ok) {
        throw await httpError("GET", target, response)
      }
      return parseJsonResponse(response, (raw) => artifactListSchema.parse(raw))
    },

    createShare: (sessionId) =>
      postJson(url(sharePath(sessionId)), {}, (raw) => shareReceiptSchema.parse(raw)),

    revokeShare: async (sessionId) => {
      const target = url(sharePath(sessionId))
      let response: Response
      try {
        response = await fetch(target, { method: "DELETE", headers: { "idempotency-key": `session-mutation:${crypto.randomUUID()}` } })
      } catch (error) {
        throw new SessionClientError("network", describeUnknown(error))
      }
      if (!response.ok) {
        throw await httpError("DELETE", target, response)
      }
      return parseJsonResponse(response, (raw) => runControlReceiptSchema.parse(raw))
    },

    sendControl: (sessionId, runId, body) =>
      postJson(url(controlPath(sessionId, runId)), body, (raw) => runControlReceiptSchema.parse(raw)),

    deleteSession: async (sessionId) => {
      const target = url(snapshotPath(sessionId))  // DELETE 与 snapshot 同路径（契约）
      let response: Response
      try {
        response = await fetch(target, { method: "DELETE", headers: { "idempotency-key": `session-mutation:${crypto.randomUUID()}` } })
      } catch (error) {
        throw new SessionClientError("network", describeUnknown(error))
      }
      if (!response.ok) {
        throw await httpError("DELETE", target, response)
      }
      return parseJsonResponse(response, (raw) => deleteSessionReceiptSchema.parse(raw))
    },

    renameSession: async (sessionId, title) => {
      const target = url(renameSessionPath(sessionId))
      let response: Response
      try {
        response = await fetch(target, {
          method: "PATCH",
          headers: { "content-type": "application/json", "idempotency-key": `session-mutation:${crypto.randomUUID()}` },
          body: JSON.stringify({ title }),
        })
      } catch (error) {
        throw new SessionClientError("network", describeUnknown(error))
      }
      if (!response.ok) {
        throw await httpError("PATCH", target, response)
      }
      return parseJsonResponse(response, (raw) => renameSessionReceiptSchema.parse(raw))
    },

    // fetch 流式 SSE（非 EventSource）：首连即可携带 Last-Event-ID 头（契约续流轴 = seq），
    // 断流按最后已见 seq 自动重连；契约拒绝或 HTTP 错误 fail-loud 收口，不静默降级。
    openEvents: ({ sessionId, lastEventId, onEvent, onStreamError }) => {
      const target = url(eventsPath(sessionId))
      const controller = new AbortController()
      let retryTimer: ReturnType<typeof setTimeout> | null = null
      let closed = false
      let cursor = lastEventId

      const fail = (error: SessionClientError): void => {
        if (closed) {
          return
        }
        closed = true
        controller.abort()
        onStreamError(error)
      }

      const scheduleRetry = (): void => {
        if (closed) {
          return
        }
        retryTimer = setTimeout(() => {
          retryTimer = null
          void connect()
        }, SSE_RETRY_MS)
      }

      const consumeData = (data: string): void => {
        let raw: unknown
        try {
          raw = JSON.parse(data)
        } catch (error) {
          fail(new SessionClientError("parse", describeUnknown(error)))
          return
        }
        let event: SessionEvent
        try {
          event = parseSessionEvent(raw)
        } catch {
          fail(new SessionClientError("parse", "SSE payload rejected by contract"))
          return
        }
        cursor = event.seq
        onEvent(event)
      }
      let parser = createSseFrameParser(consumeData)

      const connect = async (): Promise<void> => {
        // Drop a partial frame from the disconnected response. The next
        // connection replays from cursor and must start at a fresh frame.
        parser = createSseFrameParser(consumeData)
        const headers: Record<string, string> = { accept: "text/event-stream" }
        if (cursor !== undefined) {
          headers[LAST_EVENT_ID_HEADER] = String(cursor)
        }
        let response: Response
        try {
          response = await fetch(target, {
            headers,
            cache: "no-store",
            signal: controller.signal,
          })
        } catch {
          // 网络失败（含 abort）：close 时静默退出，否则按 cursor 定时重连。
          scheduleRetry()
          return
        }
        if (closed) {
          return
        }
        if (!response.ok || response.body === null) {
          fail(new SessionClientError("http", `GET ${target} failed with status ${response.status}`))
          return
        }
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) {
              break
            }
            parser(decoder.decode(value, { stream: true }))
            if (closed) {
              return
            }
          }
        } catch {
          // 读取中断（网络/abort）：与连接失败同路径处理。
        }
        scheduleRetry()
      }

      void connect()

      return {
        close: () => {
          closed = true
          if (retryTimer !== null) {
            clearTimeout(retryTimer)
            retryTimer = null
          }
          controller.abort()
        },
      }
    },
  }
}
