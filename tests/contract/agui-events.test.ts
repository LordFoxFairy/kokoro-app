import { describe, expect, it } from "vitest"

import { parseAgUiEvent } from "@/contract/agui-events"

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
  it("projects canonical text events into the existing reducer contract", () => {
    expect(parseAgUiEvent({
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "message-1",
      delta: "hello",
      metadata,
    })).toMatchObject({
      event_id: "agent-event-1:TEXT_MESSAGE_CONTENT",
      seq: 7,
      kind: "message.delta",
      payload: { segment_id: "message-1", delta: "hello" },
    })
  })

  it("rejects an AG-UI event without Kokoro replay metadata", () => {
    expect(() => parseAgUiEvent({
      type: "RUN_STARTED",
      threadId: "session-1",
      runId: "run-1",
    })).toThrow()
  })
})
