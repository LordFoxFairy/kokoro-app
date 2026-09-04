import { createServer, type RequestListener, type Server } from "node:http"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { AgUiChatTransport, type AgUiTransportFrame } from "@/engine/agui-chat-transport"

const CURSORS = [
  "agui_00000000000000000000000000000001",
  "agui_00000000000000000000000000000002",
  "agui_00000000000000000000000000000003",
  "agui_00000000000000000000000000000004",
  "agui_00000000000000000000000000000005",
  "agui_00000000000000000000000000000006",
  "agui_00000000000000000000000000000007",
] as const

type RunningServer = { server: Server; baseUrl: string }

async function listen(handler: RequestListener): Promise<RunningServer> {
  const server = createServer(handler)
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("AG-UI fixture server did not bind")
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` }
}

function metadata(eventId: string, sequence: number, runId: string) {
  return {
    kokoro: {
      event_id: eventId,
      seq: sequence,
      session_id: "session-1",
      run_id: runId,
      timestamp: "2026-09-02T12:00:00.000Z",
    },
  }
}

function frame(id: string, event: unknown): string {
  return `id: ${id}\ndata: ${JSON.stringify(event)}\n\n`
}

function runStarted(runId: string, sequence: number) {
  return {
    type: "RUN_STARTED",
    timestamp: sequence,
    threadId: "session-1",
    runId,
    metadata: metadata(`source-run-${sequence}`, sequence, runId),
  }
}

function runFinished(runId: string, sequence: number) {
  return {
    type: "RUN_FINISHED",
    timestamp: sequence,
    threadId: "session-1",
    runId,
    metadata: metadata(`source-terminal-${sequence}`, sequence, runId),
  }
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error))
  })
}

describe("AgUiChatTransport HTTP integration", () => {
  let fixture: RunningServer
  const resumeHeaders: Array<string | null> = []
  let requestCount = 0

  beforeAll(async () => {
    fixture = await listen((request, response) => {
      requestCount += 1
      resumeHeaders.push(request.headers["last-event-id"]?.toString() ?? null)
      response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" })

      if (requestCount === 1) {
        response.end(frame(CURSORS[0], runStarted("run-1", 1)))
        return
      }
      if (requestCount === 2) {
        response.end([
          // Deliberately replay the prior frame to exercise client dedupe.
          frame(CURSORS[0], runStarted("run-1", 1)),
          frame(CURSORS[1], {
            type: "TEXT_MESSAGE_START",
            timestamp: 2,
            messageId: "message-1",
            role: "assistant",
            metadata: metadata("source-text-2", 2, "run-1"),
          }),
          frame(CURSORS[2], {
            type: "TEXT_MESSAGE_CONTENT",
            timestamp: 3,
            messageId: "message-1",
            delta: "resumed",
            metadata: metadata("source-text-3", 3, "run-1"),
          }),
          frame(CURSORS[3], {
            type: "TEXT_MESSAGE_END",
            timestamp: 4,
            messageId: "message-1",
            metadata: metadata("source-text-4", 4, "run-1"),
          }),
          frame(CURSORS[4], runFinished("run-1", 5)),
        ].join(""))
        return
      }
      response.end([
        frame(CURSORS[5], runStarted("run-2", 6)),
        frame(CURSORS[6], runFinished("run-2", 7)),
      ].join(""))
    })
  })

  afterAll(async () => {
    await close(fixture.server)
  })

  it("resumes after disconnect and continues a new run from the prior terminal cursor", async () => {
    const transport = new AgUiChatTransport({
      eventsUrl: (chatId) => `${fixture.baseUrl}/v1/sessions/${chatId}/events`,
      retryMs: 1,
    })
    const reconnectCursors: Array<string | null> = []
    const firstRun: AgUiTransportFrame[] = []
    let firstHandle: { close: () => void } | null = null
    await new Promise<void>((resolve, reject) => {
      firstHandle = transport.openProjectionEvents({
        chatId: "session-1",
        resumeCursor: null,
        onReconnecting: (cursor) => reconnectCursors.push(cursor),
        onFrame: (mapped) => {
          firstRun.push(mapped)
          if (mapped.projectionEvent?.kind === "run.completed") {
            firstHandle?.close()
            resolve()
          }
        },
        onStreamError: reject,
      })
    })

    expect(firstRun.map((mapped) => mapped.cursor)).toEqual(CURSORS.slice(0, 5))
    expect(firstRun.filter((mapped) => mapped.projectionEvent?.kind === "run.created")).toHaveLength(1)
    expect(resumeHeaders.slice(0, 2)).toEqual([null, CURSORS[0]])
    expect(reconnectCursors).toContain(CURSORS[0])

    const secondRun: AgUiTransportFrame[] = []
    let secondHandle: { close: () => void } | null = null
    await new Promise<void>((resolve, reject) => {
      secondHandle = transport.openProjectionEvents({
        chatId: "session-1",
        resumeCursor: CURSORS[4],
        onFrame: (mapped) => {
          secondRun.push(mapped)
          if (mapped.projectionEvent?.kind === "run.completed") {
            secondHandle?.close()
            resolve()
          }
        },
        onStreamError: reject,
      })
    })

    expect(resumeHeaders[2]).toBe(CURSORS[4])
    expect(secondRun.map((mapped) => mapped.projectionEvent?.run_id)).toEqual(["run-2", "run-2"])
    expect(secondRun.at(-1)?.terminal).toBe(true)
  })
})
