// session HTTP/SSE 客户端：全部入站（含 POST 回执与 snapshot）过 contract Zod；失败以类型化错误上抛，零静默降级。

import { ZodError } from "zod"

import {
  artifactListSchema,
  artifactsPath,
  controlPath,
  eventsPath,
  messagesPath,
  parseSessionSnapshot,
  runControlReceiptSchema,
  mutationReceiptSchema,
  sessionListSchema,
  sessionsPath,
  sharePath,
  shareReceiptSchema,
  snapshotPath,
  messageCreateReceiptSchema,
  messageCreateParamsSchema,
  modelCandidatesPath,
  modelCandidateListSchema,
  agentCandidatesPath,
  agentCandidateListSchema,
  type AgentCandidateList,
  type ArtifactList,
  type ModelCandidateList,
  type RunControlBody,
  type RunControlReceipt,
  type MutationReceipt,
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
import type { EventCursor } from "@/contract/agui-events"
import type { ChatProjectionEvent } from "@/core/chat-projection-event"
import { AgUiChatTransport } from "./agui-chat-transport"
import { SessionClientError, type ClientFailureReason } from "./client-error"
import type { SessionScope } from "./session-scope"

export { SessionClientError }
export type { ClientFailureReason }

export type EventStreamHandle = { close: () => void }

export type OpenEventsArgs = {
  sessionId: string
  // BFF durable AG-UI ledger 的 opaque cursor；null 表示从当前 snapshot 之前没有可续点。
  resumeCursor: EventCursor | null
  onCursor: (cursor: EventCursor) => void
  onEvent: (event: ChatProjectionEvent) => void
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
    commandId: string,
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
  revokeShare: (sessionId: string) => Promise<MutationReceipt>
  openEvents: (args: OpenEventsArgs) => EventStreamHandle
}

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

async function postJson<T>(
  url: string,
  body: unknown,
  parse: (raw: unknown) => T,
  commandId?: string,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response
  const idempotencyKey = commandId?.trim() || `session-mutation:${crypto.randomUUID()}`
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify(body),
      ...(signal === undefined ? {} : { signal }),
    })
  } catch (error) {
    throw new SessionClientError("network", describeUnknown(error))
  }
  if (!response.ok) {
    throw await httpError("POST", url, response)
  }
  return parseJsonResponse(response, parse)
}

export function createSessionClient(options: { baseUrl: string }): SessionClient {
  // 契约路径以 `/` 打头，故 base+path 直接拼接（非 new URL——那会丢掉 `/api/session` 前缀）。
  // baseUrl 可为绝对源（`http://host`）或同源相对前缀（`/api/session`）。
  const base = options.baseUrl.replace(/\/+$/, "")
  const url = (path: string): string => `${base}${path}`
  const agUiTransport = new AgUiChatTransport({
    eventsUrl: (sessionId) => url(eventsPath(sessionId)),
    submitMessage: async ({ chatId, content, idempotencyKey, abortSignal }) => {
      await postJson(
        url(messagesPath(chatId)),
        { content },
        (raw) => messageCreateReceiptSchema.parse(raw),
        idempotencyKey,
        abortSignal,
      )
    },
  })
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

    createMessage: async (sessionId, input) => {
      const parsed = messageCreateParamsSchema.safeParse(input)
      if (!parsed.success || parsed.data.idempotency_key.trim() === "") {
        throw new SessionClientError("parse", "Invalid message create parameters")
      }
      const { idempotency_key, ...body } = parsed.data
      return postJson(url(messagesPath(sessionId)), body, (raw) => messageCreateReceiptSchema.parse(raw), idempotency_key)
    },

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
      return parseJsonResponse(response, (raw) => mutationReceiptSchema.parse(raw))
    },

    sendControl: (sessionId, runId, body, commandId) =>
      postJson(url(controlPath(sessionId, runId)), body, (raw) => runControlReceiptSchema.parse(raw), commandId),

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

    // Canonical AG-UI only: SSE framing, validation, dedupe and reconnect are
    // centralized in AgUiChatTransport; no reducer-shaped wire fallback exists.
    openEvents: ({ sessionId, resumeCursor, onCursor, onEvent, onStreamError }) =>
      agUiTransport.openProjectionEvents({
        chatId: sessionId,
        resumeCursor,
        onFrame: (frame) => {
          onCursor(frame.cursor)
          if (frame.projectionEvent !== null) {
            onEvent(frame.projectionEvent)
          }
        },
        onStreamError,
      }),
  }
}
