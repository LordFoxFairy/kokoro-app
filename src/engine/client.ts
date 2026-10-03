// session HTTP/SSE 客户端：全部入站（含 POST 回执与 snapshot）过 contract Zod；失败以类型化错误上抛，零静默降级。

import type { InteractionState } from "@/contract/control"
import { ZodError } from "zod"

import {
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
  type ModelCandidateList,
  type RunControlBody,
  type RunControlReceipt,
  type MutationReceipt,
  type SessionList,
  type SessionSnapshot,
  runProcessPageSchema,
  type RunProcessPage,
  type ShareReceipt,
  type MessageCreateParams,
  type MessageCreateReceipt,
  deleteSessionReceiptSchema,
  type DeleteSessionReceipt,
  renameSessionPath,
  runProcessPath,
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
  interactionBaselines?: Readonly<Record<string, InteractionState>>
  sessionId: string
  // BFF durable AG-UI ledger 的 opaque cursor；null 表示从当前 snapshot 之前没有可续点。
  resumeCursor: EventCursor | null
  onCursor: (cursor: EventCursor) => void
  onEvent: (event: ChatProjectionEvent) => void
  onReconnecting?: (cursor: EventCursor | null) => void
  onConnected?: () => void
  // 入站载荷未过契约或流已不可恢复：交状态机转错误态。
  onStreamError: (error: SessionClientError) => void
}

export type SessionClient = {
  // 会话清单（SESS-LIST）：owner 隔离、updated_at desc、软删不出；复合游标分页（cursor 缺省=首页）。
  listSessions: (cursor?: string, scope?: SessionScope) => Promise<SessionList>
  createMessage: (sessionId: string, body: MessageCreateParams) => Promise<MessageCreateReceipt>
  // 服务端不存在该会话（404）返回 null（本地新会话的合法答案）；其余失败照常上抛。
  fetchSnapshot: (sessionId: string, options?: { signal?: AbortSignal }) => Promise<SessionSnapshot | null>
  fetchRunProcessPage: (args: { sessionId: string; runId: string; watermark: EventCursor; cursor?: EventCursor; limit?: number; scope?: SessionScope; signal?: AbortSignal }) => Promise<RunProcessPage>
  sendControl: (
    sessionId: string,
    runId: string,
    body: RunControlBody,
    commandId: string,
  ) => Promise<RunControlReceipt>
  // Conversation owner only confirms deletion with a strict 200 `deleted` receipt.
  deleteSession: (sessionId: string, scope: SessionScope, signal?: AbortSignal) => Promise<DeleteSessionReceipt>
  // 会话重命名（CONV-UX）：显式改题（他人 403 / 软删·不存在 404 / 超 256 → 422）；成功 200 {ok:true}。
  renameSession: (sessionId: string, title: string) => Promise<RenameSessionReceipt>
  // 模型候选（MODEL-UX）：本 namespace 声明可选 ∩ platform resolve 可用性；输入框下拉据此枚举。
  listModels: () => Promise<ModelCandidateList>
  // agent 候选（AGENT-PRESET）：本 namespace 声明的具名预设 + general 缺省入口；输入框选择器据此枚举。
  listAgents: () => Promise<AgentCandidateList>
  // 作品库（ARTIFACT-LIB）：属主 namespace 全部成果跨会话聚合、复合游标分页（cursor 缺省=首页）。
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
  let code: string | null = null
  try {
    const raw: unknown = await response.json()
    if (typeof raw === "object" && raw !== null && "error" in raw) {
      const error = raw.error
      if (typeof error === "string") {
        detail = error
      } else if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
        detail = error.message
        if ("code" in error && typeof error.code === "string") code = error.code
      }
    }
  } catch {
    // 无 JSON 错误体：保留状态码描述。
  }
  return new SessionClientError("http", detail, code)
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
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      try {
        const response = await fetch(target, { cache: "no-store", signal: controller.signal })
        if (!response.ok) {
          throw await httpError("GET", target, response)
        }
        return await parseJsonResponse(response, (raw) => sessionListSchema.parse(raw))
      } catch (error) {
        if (controller.signal.aborted) {
          throw new SessionClientError("network", describeUnknown(error))
        }
        if (error instanceof SessionClientError) throw error
        throw new SessionClientError("network", describeUnknown(error))
      } finally {
        clearTimeout(timer)
      }
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

    fetchSnapshot: async (sessionId, options) => {
      const target = url(snapshotPath(sessionId))
      let response: Response
      try {
        response = await fetch(target, { cache: "no-store", ...(options?.signal ? { signal: options.signal } : {}) })
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

    fetchRunProcessPage: async ({ sessionId, runId, watermark, cursor, limit = 100, scope = { kind: "direct" }, signal }) => {
      const query = new URLSearchParams({ watermark, limit: String(limit) })
      if (cursor !== undefined) query.set("cursor", cursor)
      if (scope.kind === "project") query.set("project_ref", scope.projectRef)
      else query.set("scope", "direct")
      const target = url(`${runProcessPath(sessionId, runId)}?${query.toString()}`)
      let response: Response
      try { response = await fetch(target, { cache: "no-store", ...(signal ? { signal } : {}) }) }
      catch (error) { throw new SessionClientError("network", describeUnknown(error)) }
      if (!response.ok) throw await httpError("GET", target, response)
      return parseJsonResponse(response, (raw) => runProcessPageSchema.parse(raw))
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

    deleteSession: async (sessionId, scope, signal) => {
      const query = new URLSearchParams()
      if (scope.kind === "project") query.set("project_ref", scope.projectRef)
      else query.set("scope", "direct")
      const target = url(`${snapshotPath(sessionId)}?${query.toString()}`)  // DELETE 与 snapshot 同路径（契约）
      let response: Response
      try {
        response = await fetch(target, {
          method: "DELETE",
          headers: { "idempotency-key": `session-mutation:${crypto.randomUUID()}` },
          ...(signal === undefined ? {} : { signal }),
        })
      } catch (error) {
        throw new SessionClientError("network", describeUnknown(error))
      }
      if (response.status !== 200) {
        throw await httpError("DELETE", target, response)
      }
      return parseJsonResponse(response, (raw) => {
        const receipt = deleteSessionReceiptSchema.parse(raw)
        if (receipt.status !== "deleted") throw new SessionClientError("parse", "Delete receipt status is invalid")
        return { status: "deleted" }
      })
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
    openEvents: ({ sessionId, resumeCursor, interactionBaselines, onCursor, onEvent, onReconnecting, onConnected, onStreamError }) =>
      agUiTransport.openProjectionEvents({
        chatId: sessionId,
        resumeCursor,
        ...(interactionBaselines === undefined ? {} : { interactionBaselines }),
        onFrame: (frame) => {
          onCursor(frame.cursor)
          if (frame.projectionEvent !== null) {
            onEvent(frame.projectionEvent)
          }
        },
        ...(onReconnecting === undefined ? {} : { onReconnecting }),
        ...(onConnected === undefined ? {} : { onConnected }),
        onStreamError,
      }),
  }
}
