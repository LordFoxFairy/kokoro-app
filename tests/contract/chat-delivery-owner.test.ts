import { describe, expect, it } from "vitest"

import { parseSessionSnapshot, parseSharedSessionSnapshot } from "@/contract/chat"
import { parseChatProjectionEvent } from "@/core/chat-projection-event"
import { stateFromSnapshot } from "@/core/hydration"
import { applyChatProjectionEvent } from "@/core/reducer"
import { createSessionStreamState } from "@/core/state"
import { AgUiEventMapper } from "@/engine/agui-event-mapper"

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


const displayPath = "/reports/summary.md"
const livePayload = {
  artifact_id: delivery.artifact_id, asset_id: delivery.asset_id, artifact_kind: delivery.artifact_kind,
  tool_call_id: "tool_1", path: displayPath, content_hash: "a".repeat(64),
  title: delivery.title, mime: delivery.mime, size: delivery.size,
}
function mapDelivery(value: Record<string, unknown>) {
  const mapped = new AgUiEventMapper().map("agui_00000000000000000000000000000001", {
    type: "CUSTOM", name: "kokoro.delivery.created", timestamp: 1, value,
    metadata: { kokoro: { public_sequence: "1", event_id: "e1", seq: 1,
      session_id: delivery.conversation_id, run_id: delivery.run_id, timestamp: delivery.created_at } },
  })
  if (mapped.projectionEvent === null) throw Error("missing delivery projection")
  return applyChatProjectionEvent(createSessionStreamState(), mapped.projectionEvent).deliveries[0]
}

it("projects the same attested display path from private snapshot and real AG-UI mapping, without guessing legacy paths", () => {
  const expected = { artifactId: delivery.artifact_id, runId: delivery.run_id, displayPath }
  const read = (row: Record<string, unknown>) => stateFromSnapshot(parseSessionSnapshot({ ...snapshot, deliveries: [row] })).deliveries[0]
  expect(read({ ...delivery, display_path: displayPath })).toMatchObject(expected)
  expect(mapDelivery({ ...livePayload, display_path: displayPath })).toMatchObject(expected)
  expect(read(delivery)).not.toHaveProperty("displayPath")
  expect(mapDelivery(livePayload)).not.toHaveProperty("displayPath")
})

it("rejects private mounts, invalid or unbound proof and leaves anonymous Delivery strict", () => {
  const invalid = ["/.inputs/input.md", "/reports/.draft/summary.md", "reports/summary.md", null]
  for (const value of invalid) {
    expect(() => parseSessionSnapshot({ ...snapshot, deliveries: [{ ...delivery, display_path: value }] })).toThrow()
    expect(() => mapDelivery({ ...livePayload, path: value, display_path: value })).toThrow()
  }
  expect(() => mapDelivery({ ...livePayload, display_path: "/reports/different.md" })).toThrow()
  expect(parseSharedSessionSnapshot(snapshot).deliveries[0]).toEqual(delivery)
  expect(() => parseSharedSessionSnapshot({ ...snapshot, deliveries: [{ ...delivery, display_path: displayPath }] })).toThrow()
})
