import { describe, expect, it } from "vitest"

import { parseSessionSnapshot } from "@/contract/chat"
import { parseChatProjectionEvent } from "@/core/chat-projection-event"

const delivery = {
  conversation_id: "ses_1", artifact_id: "artifact_1", asset_id: "asset_1",
  artifact_kind: "document", title: "Report", mime: "text/markdown", size: 12,
  run_id: "run_1", created_at: "2026-09-28T00:00:00Z",
}

const snapshot = {
  session: { session_id: "ses_1", title: "T", owner_id: "member_1", created_at: "2026-09-28T00:00:00Z", updated_at: "2026-09-28T00:00:00Z" },
  files: [], deliveries: [delivery], deliveries_has_more: true, event_watermark: null, execution_process: null,
}

describe("BFF S9 Chat Delivery consumer", () => {
  it("accepts exactly the binary snapshot identity and required has_more", () => {
    expect(parseSessionSnapshot(snapshot).deliveries[0]).toMatchObject(delivery)
    expect(parseSessionSnapshot(snapshot).deliveries_has_more).toBe(true)
    expect(() => parseSessionSnapshot({ ...snapshot, deliveries_has_more: undefined })).toThrow()
    expect(() => parseSessionSnapshot({ ...snapshot, deliveries: [{ ...delivery, size: 2 ** 53 }] })).toThrow()
  })

  it("requires complete Agent live claim, independent of snapshot shape", () => {
    const event = { kind: "delivery.created", event_id: "e1", seq: 1, session_id: "ses_1", run_id: "run_1", timestamp: "2026-09-28T00:00:00Z", payload: {
      artifact_id: "artifact_1", asset_id: "asset_1", artifact_kind: "document", tool_call_id: "tool_1",
      path: "out/report.md", content_hash: "a".repeat(64), title: "Report", mime: "text/markdown", size: 12,
    } }
    expect(parseChatProjectionEvent(event).payload).toMatchObject(event.payload)
    expect(() => parseChatProjectionEvent({ ...event, payload: { ...event.payload, artifact_id: "" } })).toThrow()
  })
})
