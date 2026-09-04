import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AgUiChatTransport,
  createSseFrameParser,
  type AgUiTransportFrame,
} from "@/engine/agui-chat-transport"

const CURSOR = "agui_00000000000000000000000000000001"
const TERMINAL_CURSOR = "agui_00000000000000000000000000000002"

function metadata(eventId: string, seq: number) {
  return {
    kokoro: {
      event_id: eventId,
      seq,
      session_id: "session-1",
      run_id: "run-1",
      timestamp: "2026-09-02T12:00:00.000Z",
    },
  }
}

function sse(id: string, event: unknown): string {
  return `id: ${id}\ndata: ${JSON.stringify(event)}\n\n`
}

function response(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8" },
  })
}

describe("createSseFrameParser", () => {
  it("keeps opaque SSE ids attached to data across arbitrary chunks", () => {
    const frames: Array<{ id: string | null; data: string }> = []
    const feed = createSseFrameParser((frame) => frames.push(frame))

    feed(`id: ${CURSOR}\nda`)
    feed('ta: {"type":"RUN_')
    feed('STARTED"}\n\n')

    expect(frames).toEqual([{ id: CURSOR, data: '{"type":"RUN_STARTED"}' }])
  })
})

describe("AgUiChatTransport", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("resumes from the last accepted opaque cursor and suppresses a repeated frame", async () => {
    const runStarted = {
      type: "RUN_STARTED",
      timestamp: 1,
      threadId: "session-1",
      runId: "run-1",
      metadata: metadata("agent-run", 1),
    }
    const runFinished = {
      type: "RUN_FINISHED",
      timestamp: 2,
      threadId: "session-1",
      runId: "run-1",
      metadata: metadata("agent-terminal", 2),
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(sse(CURSOR, runStarted)))
      .mockResolvedValueOnce(response(`${sse(CURSOR, runStarted)}${sse(TERMINAL_CURSOR, runFinished)}`))
    vi.stubGlobal("fetch", fetchMock)

    const accepted: AgUiTransportFrame[] = []
    let handle: { close: () => void } | null = null
    await new Promise<void>((resolve, reject) => {
      handle = new AgUiChatTransport({
        eventsUrl: (chatId) => `/api/session/sessions/${chatId}/events`,
        retryMs: 0,
      }).openProjectionEvents({
        chatId: "session-1",
        resumeCursor: null,
        onFrame: (frame) => {
          accepted.push(frame)
          if (frame.terminal) {
            handle?.close()
            resolve()
          }
        },
        onStreamError: reject,
      })
    })

    expect(accepted.map((frame) => frame.cursor)).toEqual([CURSOR, TERMINAL_CURSOR])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("last-event-id")).toBe(CURSOR)
  })

  it("implements AI SDK ChatTransport submission and emits UIMessage chunks through terminal", async () => {
    const submitted: string[] = []
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([
      sse(CURSOR, {
        type: "TEXT_MESSAGE_START",
        timestamp: 1,
        messageId: "assistant-1",
        role: "assistant",
        metadata: metadata("agent-text", 1),
      }),
      sse(TERMINAL_CURSOR, {
        type: "RUN_FINISHED",
        timestamp: 2,
        threadId: "session-1",
        runId: "run-1",
        metadata: metadata("agent-terminal", 2),
      }),
    ].join(""))))
    const transport = new AgUiChatTransport({
      eventsUrl: (chatId) => `/api/session/sessions/${chatId}/events`,
      submitMessage: ({ content }) => {
        submitted.push(content)
        return Promise.resolve()
      },
    })

    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "session-1",
      messageId: undefined,
      messages: [{ id: "user-1", role: "user", parts: [{ type: "text", text: "hello" }] }],
      abortSignal: undefined,
    })
    const chunks: unknown[] = []
    const reader = stream.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    expect(submitted).toEqual(["hello"])
    expect(chunks).toContainEqual({ type: "text-start", id: "assistant-1" })
    expect(chunks.at(-1)).toMatchObject({ type: "finish", finishReason: "stop" })
  })
})
