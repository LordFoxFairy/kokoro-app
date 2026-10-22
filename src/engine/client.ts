// session HTTP/SSE 客户端：全部入站（含 POST 回执与 snapshot）过 contract Zod；失败以类型化错误上抛，零静默降级。

import type { InteractionState } from "@/contract/control"
import { ZodError } from "zod"

import {
  controlPath,
  eventsPath,
  messagesPath,
  parseSessionSnapshot,
  runControlReceiptSchema,
  sessionListSchema,
  sessionsPath,
  sharePath,
  shareReceiptSchema,
  snapshotPath,
  messageCreateReceiptSchema,
  messageCreateParamsSchema,
  modelCandidatesPath,
  modelCandidateListSchema,
  type ModelCandidateList,
  type RunControlBody,
  type RunControlReceipt,
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
  canonicalConversationIdSchema,
  canonicalProjectIdSchema,
  isMoveSessionErrorStatusCode,
  moveCommandIdSchema,
  moveRequestIdSchema,
  moveRetryAfterSchema,
  moveSessionErrorResponseSchema,
  moveSessionPath,
  moveSessionReceiptSchema,
  type MoveSessionReceipt,
} from "@/contract/http"
import type { EventCursor } from "@/contract/agui-events"
import type { ChatProjectionEvent } from "@/core/chat-projection-event"
import { AgUiChatTransport } from "./agui-chat-transport"
import { SessionClientError, type ClientFailureReason } from "./client-error"
import { ConversationMoveError } from "./conversation-move-error"
import type { SessionScope } from "./session-scope"
import { shareErrorSchema } from "@/lib/shared-tasks.schema"
import { parseSharedTasksJson } from "@/lib/shared-tasks-json"

export { SessionClientError }
export type { ClientFailureReason }

export type EventStreamHandle = { close: () => void }

export type MoveSessionInput = Readonly<{
  sessionId: string
  targetProjectId: string | null
  commandId: string
  signal?: AbortSignal
}>

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
  moveSession: (input: MoveSessionInput) => Promise<MoveSessionReceipt>
  // 模型候选（MODEL-UX）：本 namespace 声明可选 ∩ platform resolve 可用性；输入框下拉据此枚举。
  listModels: (options?: { signal?: AbortSignal }) => Promise<ModelCandidateList>
  // 作品库（ARTIFACT-LIB）：属主 namespace 全部成果跨会话聚合、复合游标分页（cursor 缺省=首页）。
  // 分享（SHARE-1）：创建返 share_id（活跃分享幂等返同 id）；撤销置失效（公共读随即 404）。
  createShare: (sessionId: string, signal?: AbortSignal) => Promise<ShareReceipt>
  revokeShare: (sessionId: string, signal?: AbortSignal) => Promise<ShareReceipt>
  openEvents: (args: OpenEventsArgs) => EventStreamHandle
}


async function shareMutation(
  target: string,
  method: "POST" | "DELETE",
  signal?: AbortSignal,
): Promise<ShareReceipt> {
  const controller = new AbortController(),
    deadline = performance.now() + 10_000;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined,
    response: Response | undefined,
    retired = false,
    reject!: (reason: unknown) => void;
  const cancelled = new Promise<never>((_, no) => {
    reject = no;
  });
  const stop = () => {
    controller.abort();
    if (reader) {
      void reader.cancel().catch(() => undefined);
      try {
        reader.releaseLock();
      } catch {}
      reader = undefined;
    }
    if (response?.body && !response.body.locked)
      void response.body.cancel().catch(() => undefined);
  };
  const abort = () => {
    stop();
    reject(new SessionClientError("network", "Share request retired"));
  };
  const timer = setTimeout(abort, 10_000);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const check = () => {
    if (retired || controller.signal.aborted || performance.now() >= deadline)
      throw new SessionClientError("network", "Share request retired");
  };
  const operation = async () => {
    check();
    response = await fetch(target, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: {
        "idempotency-key": `session-mutation:${crypto.randomUUID()}`,
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
      },
      ...(method === "POST" ? { body: "{}" } : {}),
    });
    if (retired || controller.signal.aborted) {
      stop();
      check();
    }
    check();
    if (
      !/^application\/json(?:\s*;|$)/iu.test(
        response.headers.get("content-type") ?? "",
      ) ||
      !/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(
        response.headers.get("cache-control") ?? "",
      ) ||
      !response.headers.get("x-request-id") ||
      response.headers.get("x-request-id")!.length > 256 ||
      response.headers.has("location") ||
      response.headers.has("set-cookie")
    )
      throw Error("Invalid share headers");
    const retry = response.headers.get("retry-after");
    if (
      retry !== null &&
      (response.status !== 429 ||
        !/^[1-9]\d{0,4}$/u.test(retry) ||
        Number(retry) > 86400)
    )
      throw Error("Invalid share retry header");
    let bytes = 0;
    response.headers.forEach((v, k) => {
      bytes += new TextEncoder().encode(`${k}: ${v}\r\n`).length;
    });
    let text = "";
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    if (bytes > 1_048_576) throw Error("Share response oversized");
    if (response.body) {
      reader = response.body.getReader();
      for (;;) {
        const p = await reader.read();
        check();
        if (p.done) break;
        bytes += p.value.length;
        if (bytes > 1_048_576) throw Error("Share response oversized");
        text += decoder.decode(p.value, { stream: true });
      }
      text += decoder.decode();
    }
    check();
    const raw = parseSharedTasksJson(text);
    if (response.status !== 200) {
      if (
        ![400, 401, 403, 404, 409, 413, 422, 429, 502, 503].includes(
          response.status,
        )
      )
        throw Error("Invalid share status");
      const error = shareErrorSchema.parse(raw);
      if (error.meta.request_id !== response.headers.get("x-request-id"))
        throw Error("Invalid share binding");
      throw new SessionClientError("http", error.error.code, error.error.code);
    }
    return shareReceiptSchema.parse(raw);
  };
  try {
    return await Promise.race([cancelled, operation()]);
  } finally {
    retired = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    stop();
  }
}

const MOVE_DEADLINE_MS = 10_000

async function moveSession(
  target: string,
  input: MoveSessionInput,
): Promise<MoveSessionReceipt> {
  if (
    !canonicalConversationIdSchema.safeParse(input.sessionId).success ||
    !canonicalProjectIdSchema.nullable().safeParse(input.targetProjectId).success ||
    !moveCommandIdSchema.safeParse(input.commandId).success
  ) {
    throw new ConversationMoveError({ kind: "parse" })
  }
  if (input.signal?.aborted === true) {
    throw new ConversationMoveError({ kind: "network" })
  }

  const startedAt = performance.now()
  const controller = new AbortController()
  let rejectDeadline: ((error: ConversationMoveError) => void) | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject
  })
  const failNetwork = (): void => {
    controller.abort()
    rejectDeadline?.(new ConversationMoveError({ kind: "network" }))
  }
  const timer = setTimeout(failNetwork, MOVE_DEADLINE_MS)
  const callerAbort = (): void => failNetwork()
  input.signal?.addEventListener("abort", callerAbort, { once: true })

  const withinDeadline = async <T>(operation: Promise<T>): Promise<T> =>
    Promise.race([operation, deadline])
  const ensureActive = (): void => {
    if (controller.signal.aborted || performance.now() - startedAt >= MOVE_DEADLINE_MS) {
      throw new ConversationMoveError({ kind: "network" })
    }
  }

  try {
    let response: Response
    try {
      response = await withinDeadline(fetch(target, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": input.commandId,
        },
        body: JSON.stringify({ target_project_id: input.targetProjectId }),
        credentials: "same-origin",
        redirect: "error",
        signal: controller.signal,
      }))
    } catch (error) {
      if (error instanceof ConversationMoveError) throw error
      throw new ConversationMoveError({ kind: "network" })
    }

    let raw: unknown
    try {
      raw = await withinDeadline(response.json())
    } catch (error) {
      if (error instanceof ConversationMoveError) throw error
      ensureActive()
      throw new ConversationMoveError({ kind: response.status === 200 ? "parse" : "adapter" })
    }

    if (response.status === 200) {
      const parsed = moveSessionReceiptSchema.safeParse(raw)
      ensureActive()
      if (
        !parsed.success ||
        parsed.data.session_id !== input.sessionId ||
        parsed.data.project_ref !== input.targetProjectId
      ) {
        throw new ConversationMoveError({ kind: "parse" })
      }
      return parsed.data
    }

    const parsedError = moveSessionErrorResponseSchema.safeParse(raw)
    const requestId = moveRequestIdSchema.safeParse(response.headers.get("x-request-id"))
    const retryAfterValue = response.headers.get("retry-after")
    const retryAfter = retryAfterValue === null ? null : moveRetryAfterSchema.safeParse(retryAfterValue)
    ensureActive()
    if (
      !parsedError.success ||
      !requestId.success ||
      !isMoveSessionErrorStatusCode(response.status, parsedError.data.error.code) ||
      (response.status === 429 ? retryAfter !== null && !retryAfter.success : retryAfterValue !== null)
    ) {
      throw new ConversationMoveError({ kind: "adapter" })
    }
    throw new ConversationMoveError({
      kind: "owner",
      status: response.status,
      code: parsedError.data.error.code,
      retryable: parsedError.data.error.retryable,
      requestId: requestId.data,
      retryAfter: retryAfterValue,
    })
  } finally {
    clearTimeout(timer)
    input.signal?.removeEventListener("abort", callerAbort)
  }
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

    listModels: async (options) => {
      const controller = new AbortController()
      let rejectRead!: (error: unknown) => void
      const cancelled = new Promise<never>((_, reject) => { rejectRead = reject })
      const abort = () => {
        controller.abort()
        rejectRead(new SessionClientError("network", "Model catalog read cancelled or timed out"))
      }
      const timer = setTimeout(abort, 10_000)
      options?.signal?.addEventListener("abort", abort, { once: true })
      const read = async (): Promise<ModelCandidateList> => {
        const models: ModelCandidateList["models"] = []
        const cursors = new Set<string>()
        const labels = new Set<string>()
        let cursor: string | null = null
        // A bounded complete read; never expose a partial catalog as success.
        for (let page = 0; page < 100; page++) {
          controller.signal.throwIfAborted()
          const query = new URLSearchParams({ feature_key: "chat" })
          if (cursor !== null) query.set("cursor", cursor)
          const target = url(`${modelCandidatesPath()}?${query}`)
          const response = await fetch(target, { cache: "no-store", signal: controller.signal })
          controller.signal.throwIfAborted()
          if (!response.ok) throw await httpError("GET", target, response)
          const list = await parseJsonResponse(response, (raw) => modelCandidateListSchema.parse(raw))
          controller.signal.throwIfAborted()
          for (const candidate of list.models) {
            if (candidate.feature_key !== "chat" || labels.has(candidate.name)) {
              throw new SessionClientError("parse", "Invalid chat model catalog")
            }
            labels.add(candidate.name)
            models.push(candidate)
          }
          if (list.next_cursor === null) return { models, next_cursor: null }
          if (!list.next_cursor || cursors.has(list.next_cursor)) {
            throw new SessionClientError("parse", "Invalid model catalog cursor")
          }
          cursor = list.next_cursor
          cursors.add(cursor)
        }
        throw new SessionClientError("parse", "Model catalog page limit exceeded")
      }
      try {
        if (options?.signal?.aborted) abort()
        return await Promise.race([cancelled, read()])
      } catch (error) {
        if (error instanceof SessionClientError) throw error
        throw new SessionClientError("network", "Model catalog read failed")
      } finally {
        clearTimeout(timer)
        options?.signal?.removeEventListener("abort", abort)
      }
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

    createShare: (sessionId, signal) => shareMutation(url(sharePath(sessionId)), "POST", signal),
    revokeShare: (sessionId, signal) => shareMutation(url(sharePath(sessionId)), "DELETE", signal),

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

    moveSession: (input) => {
      const snapshot: MoveSessionInput = {
        sessionId: input.sessionId,
        targetProjectId: input.targetProjectId,
        commandId: input.commandId,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      }
      return moveSession(url(moveSessionPath(snapshot.sessionId)), snapshot)
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
