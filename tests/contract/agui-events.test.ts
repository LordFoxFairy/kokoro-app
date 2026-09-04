import { describe, expect, it } from "vitest"

import { eventCursorSchema, parseAgUiEvent } from "@/contract/agui-events"

const metadata = {
  kokoro: {
    event_id: "agent-event-1",
    seq: 7,
    session_id: "session-1",
    run_id: "run-1",
    timestamp: "2026-09-02T12:00:00.000Z",
  },
}

describe("AG-UI wire contract", () => {
  it("validates the canonical frame without projecting wire DTOs into UI state", () => {
    expect(parseAgUiEvent({
      type: "TEXT_MESSAGE_CONTENT",
      timestamp: Date.parse("2026-09-02T12:00:00.000Z"),
      messageId: "message-1",
      delta: "hello",
      metadata,
    })).toMatchObject({
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "message-1",
      delta: "hello",
      metadata,
    })
  })

  it("rejects an AG-UI event without Kokoro replay metadata", () => {
    expect(() => parseAgUiEvent({
      type: "RUN_STARTED",
      threadId: "session-1",
      runId: "run-1",
    })).toThrow()
  })

  it.each([
    "agui_0123456789abcdef0123456789abcdef",
    "agui_ffffffffffffffffffffffffffffffff",
  ])("accepts the BFF opaque event cursor %s", (cursor) => {
    expect(eventCursorSchema.parse(cursor)).toBe(cursor)
  })

  it.each(["7", "agui_1", "agui_0123456789ABCDEF0123456789ABCDEF"])(
    "rejects a non-canonical resume cursor %s",
    (cursor) => {
      expect(() => eventCursorSchema.parse(cursor)).toThrow()
    },
  )
})
