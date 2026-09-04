// Explicit Web AG-UI transport boundary. It owns SSE framing, opaque replay
// cursors, reconnect/deduplication, runtime validation, and AI SDK chunks.

import type { ChatRequestOptions, ChatTransport, UIMessageChunk } from "ai"

import { LAST_EVENT_ID_HEADER } from "@/contract/http"
import { eventCursorSchema, type EventCursor } from "@/contract/agui-events"
import { SessionClientError } from "./client-error"
import {
  AgUiEventMapper,
  type AgUiMappedFrame,
  type KokoroUiMessage,
} from "./agui-event-mapper"

export type SseFrame = {
  id: string | null
  data: string
}

export type AgUiTransportFrame = AgUiMappedFrame

export type ProjectionStreamHandle = {
  close: () => void
}

export type SubmitAgUiMessageArgs = {
  chatId: string
  content: string
  headers: Headers
  body?: object
  abortSignal?: AbortSignal
}

export type OpenProjectionEventsArgs = {
  chatId: string
  resumeCursor: EventCursor | null
  headers?: Headers | Record<string, string>
  abortSignal?: AbortSignal
  onFrame: (frame: AgUiTransportFrame) => void
  onReconnecting?: (cursor: EventCursor | null) => void
  onStreamError: (error: SessionClientError) => void
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type AgUiChatTransportOptions = {
  eventsUrl: (chatId: string) => string
  submitMessage?: (args: SubmitAgUiMessageArgs) => Promise<void>
  fetcher?: Fetcher
  retryMs?: number
}

const DEFAULT_RETRY_MS = 2_000

function describeUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseFrameData(frame: SseFrame, mapper: AgUiEventMapper): AgUiTransportFrame {
  if (frame.id === null || frame.id.length === 0) {
    throw new SessionClientError("parse", "AG-UI SSE frame is missing its opaque id")
  }
  let input: unknown
  try {
    input = JSON.parse(frame.data)
  } catch (error) {
    throw new SessionClientError("parse", `AG-UI SSE data is not JSON: ${describeUnknown(error)}`)
  }
  try {
    return mapper.map(frame.id, input)
  } catch (error) {
    throw new SessionClientError("parse", `AG-UI SSE frame rejected: ${describeUnknown(error)}`)
  }
}

function userText(messages: readonly KokoroUiMessage[]): string {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex]
    if (message === undefined || message.role !== "user") {
      continue
    }
    return message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim()
  }
  return ""
}

function retryDelay(milliseconds: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) {
    return Promise.resolve(false)
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", aborted)
      resolve(true)
    }, milliseconds)
    const aborted = (): void => {
      clearTimeout(timer)
      resolve(false)
    }
    signal.addEventListener("abort", aborted, { once: true })
  })
}

/** Incrementally parse SSE while preserving the id attached to each data frame. */
export function createSseFrameParser(onFrame: (frame: SseFrame) => void): (chunk: string) => void {
  let buffer = ""
  return (chunk) => {
    buffer += chunk
    let separatorMatch = /\r?\n\r?\n/u.exec(buffer)
    while (separatorMatch !== null) {
      const frameText = buffer.slice(0, separatorMatch.index)
      buffer = buffer.slice(separatorMatch.index + separatorMatch[0].length)
      let id: string | null = null
      const dataLines: string[] = []
      for (const line of frameText.split(/\r?\n/u)) {
        if (line.startsWith("id:")) {
          id = line.slice("id:".length).replace(/^ /u, "")
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice("data:".length).replace(/^ /u, ""))
        }
      }
      if (dataLines.length > 0) {
        onFrame({ id, data: dataLines.join("\n") })
      }
      separatorMatch = /\r?\n\r?\n/u.exec(buffer)
    }
  }
}

export class AgUiChatTransport implements ChatTransport<KokoroUiMessage> {
  readonly #eventsUrl: (chatId: string) => string
  readonly #submitMessage: ((args: SubmitAgUiMessageArgs) => Promise<void>) | undefined
  readonly #fetcher: Fetcher
  readonly #retryMs: number
  readonly #cursorByChat = new Map<string, EventCursor>()

  constructor(options: AgUiChatTransportOptions) {
    this.#eventsUrl = options.eventsUrl
    this.#submitMessage = options.submitMessage
    this.#fetcher = options.fetcher ?? ((input, init) => fetch(input, init))
    this.#retryMs = options.retryMs ?? DEFAULT_RETRY_MS
  }

  openProjectionEvents(args: OpenProjectionEventsArgs): ProjectionStreamHandle {
    const controller = new AbortController()
    const mapper = new AgUiEventMapper()
    const seenCursors = new Set<EventCursor>()
    let closed = false

    if (args.resumeCursor === null) {
      this.#cursorByChat.delete(args.chatId)
    } else {
      const cursor = eventCursorSchema.parse(args.resumeCursor)
      this.#cursorByChat.set(args.chatId, cursor)
    }

    const close = (): void => {
      if (closed) {
        return
      }
      closed = true
      controller.abort()
      args.abortSignal?.removeEventListener("abort", close)
    }
    args.abortSignal?.addEventListener("abort", close, { once: true })
    if (args.abortSignal?.aborted === true) {
      close()
    }

    const fail = (error: SessionClientError): void => {
      if (closed) {
        return
      }
      close()
      args.onStreamError(error)
    }

    const accept = (frame: SseFrame): void => {
      if (closed) {
        return
      }
      let cursor: EventCursor
      try {
        cursor = eventCursorSchema.parse(frame.id)
      } catch (error) {
        throw new SessionClientError("parse", `AG-UI SSE id rejected: ${describeUnknown(error)}`)
      }
      if (seenCursors.has(cursor)) {
        return
      }
      const mapped = parseFrameData(frame, mapper)
      if (mapped.projectionEvent?.session_id !== args.chatId) {
        throw new SessionClientError("parse", "AG-UI frame session does not match the requested Chat")
      }
      seenCursors.add(cursor)
      this.#cursorByChat.set(args.chatId, cursor)
      args.onFrame(mapped)
    }

    const connect = async (): Promise<void> => {
      while (!closed) {
        const headers = new Headers(args.headers)
        headers.set("accept", "text/event-stream")
        const cursor = this.#cursorByChat.get(args.chatId)
        if (cursor !== undefined) {
          headers.set(LAST_EVENT_ID_HEADER, cursor)
        } else {
          headers.delete(LAST_EVENT_ID_HEADER)
        }

        let response: Response
        try {
          response = await this.#fetcher(this.#eventsUrl(args.chatId), {
            headers,
            cache: "no-store",
            signal: controller.signal,
          })
        } catch {
          if (closed || controller.signal.aborted) {
            return
          }
          args.onReconnecting?.(cursor ?? null)
          if (!(await retryDelay(this.#retryMs, controller.signal))) {
            return
          }
          continue
        }

        if (!response.ok || response.body === null) {
          fail(new SessionClientError("http", `GET ${this.#eventsUrl(args.chatId)} failed with status ${response.status}`))
          return
        }
        const contentType = response.headers.get("content-type") ?? ""
        if (!contentType.toLowerCase().startsWith("text/event-stream")) {
          fail(new SessionClientError("parse", "AG-UI response is not text/event-stream"))
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        const parser = createSseFrameParser(accept)
        let disconnected = false
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) {
              disconnected = true
              break
            }
            parser(decoder.decode(value, { stream: true }))
            if (closed) {
              return
            }
          }
        } catch (error) {
          if (error instanceof SessionClientError) {
            fail(error)
            return
          }
          if (closed || controller.signal.aborted) {
            return
          }
          disconnected = true
        }

        if (!disconnected || closed) {
          return
        }
        args.onReconnecting?.(this.#cursorByChat.get(args.chatId) ?? null)
        if (!(await retryDelay(this.#retryMs, controller.signal))) {
          return
        }
      }
    }

    void connect()
    return { close }
  }

  async sendMessages(
    options: {
      trigger: "submit-message" | "regenerate-message"
      chatId: string
      messageId: string | undefined
      messages: KokoroUiMessage[]
      abortSignal: AbortSignal | undefined
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk>> {
    if (options.trigger !== "submit-message") {
      throw new SessionClientError("http", "Kokoro Chat does not expose regeneration as a message submission")
    }
    if (this.#submitMessage === undefined) {
      throw new SessionClientError("http", "AG-UI message submission is not configured")
    }
    const content = userText(options.messages)
    if (content.length === 0) {
      throw new SessionClientError("parse", "The latest user UIMessage has no text content")
    }
    const submitArgs: SubmitAgUiMessageArgs = {
      chatId: options.chatId,
      content,
      headers: new Headers(options.headers),
      ...(options.body === undefined ? {} : { body: options.body }),
      ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
    }
    await this.#submitMessage(submitArgs)
    return this.#uiMessageStream(options.chatId, options.abortSignal, options.headers)
  }

  reconnectToStream(
    options: {
      chatId: string
      abortSignal?: AbortSignal
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    if (!this.#cursorByChat.has(options.chatId)) {
      return Promise.resolve(null)
    }
    return Promise.resolve(this.#uiMessageStream(options.chatId, options.abortSignal, options.headers))
  }

  #uiMessageStream(
    chatId: string,
    abortSignal: AbortSignal | undefined,
    headers: Headers | Record<string, string> | undefined,
  ): ReadableStream<UIMessageChunk> {
    let handle: ProjectionStreamHandle | null = null
    let settled = false
    return new ReadableStream<UIMessageChunk>({
      start: (streamController) => {
        handle = this.openProjectionEvents({
          chatId,
          resumeCursor: this.#cursorByChat.get(chatId) ?? null,
          ...(headers === undefined ? {} : { headers }),
          ...(abortSignal === undefined ? {} : { abortSignal }),
          onFrame: (frame) => {
            for (const chunk of frame.uiMessageChunks) {
              streamController.enqueue(chunk)
            }
            if (frame.terminal && !settled) {
              settled = true
              handle?.close()
              streamController.close()
            }
          },
          onStreamError: (error) => {
            if (!settled) {
              settled = true
              streamController.error(error)
            }
          },
        })
      },
      cancel: () => {
        settled = true
        handle?.close()
      },
    })
  }
}
