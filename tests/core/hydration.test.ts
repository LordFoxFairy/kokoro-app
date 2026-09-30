// snapshot 水合规格：当前读模型 + opaque AG-UI watermark 组成一致续流起点。
import { describe, expect, it } from "vitest"

import { stateFromSnapshot } from "@/core/hydration"
import { applyChatProjectionEvents } from "@/core/reducer"
import { buildThreadItems, groupSegments } from "@/core/projections"
import { AgUiEventMapper } from "@/engine/agui-event-mapper"

import { makePendingPause, makeSnapshot, makeSnapshotDelivery } from "./fixtures"

describe("stateFromSnapshot", () => {
  it("hydrates messages, pending approval, and the opaque resume cursor", () => {
    const cursor = "agui_0000000000000000000000000000002a"
    const state = stateFromSnapshot(
      makeSnapshot({
        messages: [
          { message_id: "m1", role: "user", content: "hi", status: "completed", created_at: "2026-07-02T00:00:00Z" },
          { message_id: "m2", role: "assistant", content: "yo", status: "completed", created_at: "2026-07-02T00:00:01Z" },
        ],
        pendingPauses: [makePendingPause()],
        eventWatermark: cursor,
      }),
    )
    expect(state.messages.map((message) => [message.role, message.content])).toEqual([
      ["user", "hi"],
      ["assistant", "yo"],
    ])
    expect(state.stepsByRun.run_1?.[0]).toMatchObject({
      kind: "tool",
      tool: { id: "tool_1", status: "awaiting" },
    })
    expect(state.lastSeq).toBe(0)
    expect(state.resumeCursor).toBe(cursor)
  })

  it("meta 与 files 透传", () => {
    const state = stateFromSnapshot(makeSnapshot({ title: "标题" }))
    expect(state.meta).toEqual({ title: "标题", ownerId: "local-user" })
    expect(state.files).toEqual([])
    expect(state.deliveries).toEqual([])
  })

  it("deliveries 水合：snake→camel 投影（createdAt 取 created_at）", () => {
    const state = stateFromSnapshot(
      makeSnapshot({
        deliveries: [
          makeSnapshotDelivery({
            artifact_id: "artifact_9",
            title: "终稿",
            created_at: "2026-07-09T10:00:00Z",
          }),
        ],
      }),
    )
    expect(state.deliveries).toEqual([
      {
        conversationId: "conv_1",
        artifactId: "artifact_9",
        assetId: "asset_1",
        artifactKind: "document",
        title: "终稿",
        mime: "text/markdown",
        size: 2048,
        runId: "run_1",
        createdAt: "2026-07-09T10:00:00Z",
      },
    ])
  })
})


describe("snapshot text continuation", () => {
  it("keeps a partial durable message before and joined to same-run CONTENT/END after its watermark", () => {
    const watermark = "agui_0000000000000000000000000000000a"
    const hydrated = stateFromSnapshot(makeSnapshot({
      activeRun: { run_id: "run_1", status: "running" }, eventWatermark: watermark,
      messages: [{ message_id: "msg_bff", role: "assistant", run_id: "run_1", content: "Hello! How can ",
        status: "streaming", created_at: "2026-07-02T00:00:00Z" }],
    }))
    const mapper = new AgUiEventMapper()
    const frames = [
      { type: "TEXT_MESSAGE_CONTENT", delta: "I assist you today?" },
      { type: "TEXT_MESSAGE_END" },
    ].map((frame, index) => mapper.map(`agui_${(11 + index).toString(16).padStart(32, "0")}`, {
      ...frame, timestamp: 1, messageId: "msg_agent", metadata: { kokoro: {
        event_id: `event_${index}`, seq: 11 + index, session_id: "conv_1", run_id: "run_1",
        timestamp: "2026-07-02T00:00:01Z",
      } },
    }))
    const events = frames.flatMap((frame) => frame.projectionEvent ? [frame.projectionEvent] : [])
    const resumed = applyChatProjectionEvents(hydrated, events)
    const rendered = buildThreadItems(resumed).flatMap((item) => item.kind === "assistant-turn"
      ? groupSegments(item.steps).map((segment) => item.messagesById[segment.segmentId]?.content) : [])
    expect(rendered).toEqual(["Hello! How can I assist you today?"])
    expect(resumed.messages).toHaveLength(1)
    expect(resumed.messages[0]).toMatchObject({ snapshotMessageId: "msg_bff", id: "msg_agent" })
    expect(resumed.resumeCursor).toBe(watermark)
    expect(applyChatProjectionEvents(resumed, events)).toBe(resumed)
    expect(hydrated.messages[0]?.content).toBe("Hello! How can ")
  })
})


it("does not mark a completed snapshot message claimable even if its run is still active", () => {
  const state = stateFromSnapshot(makeSnapshot({
    activeRun: { run_id: "run_1", status: "running" },
    messages: [{ message_id: "durable", role: "assistant", run_id: "run_1", content: "complete",
      status: "completed", created_at: "2026-07-02T00:00:00Z" }],
  }))
  expect(state.messages[0]?.awaitingTextSegment).toBeUndefined()
  expect(state.stepsByRun.run_1?.[0]).toMatchObject({ kind: "text", segmentId: "durable" })
})


it.each([1, 3])("continues the unique streaming prefix after %i completed same-run messages", (completedCount) => {
  const history = Array.from({ length: completedCount }, (_, index) => ({
    message_id: `completed_${index}`, role: "assistant" as const, run_id: "run_1",
    content: `history ${index}`, status: "completed" as const, created_at: "2026-07-02T00:00:00Z",
  }))
  const hydrated = stateFromSnapshot(makeSnapshot({
    activeRun: { run_id: "run_1", status: "running" },
    messages: [...history, { message_id: "durable_prefix", role: "assistant", run_id: "run_1",
      content: "Hello ", status: "streaming", created_at: "2026-07-02T00:00:01Z" }],
  }))
  const mapper = new AgUiEventMapper()
  const events = [
    { type: "TEXT_MESSAGE_CONTENT", delta: "world" },
    { type: "TEXT_MESSAGE_END" },
  ].flatMap((frame, index) => {
    const mapped = mapper.map(`agui_${(11 + index).toString(16).padStart(32, "0")}`, {
      ...frame, timestamp: 1, messageId: "live_segment", metadata: { kokoro: {
        event_id: `continuation_${index}`, seq: 11 + index, session_id: "conv_1", run_id: "run_1",
        timestamp: "2026-07-02T00:00:02Z",
      } },
    })
    return mapped.projectionEvent ? [mapped.projectionEvent] : []
  })
  const resumed = applyChatProjectionEvents(hydrated, events)
  const rendered = buildThreadItems(resumed).flatMap((item) => item.kind === "assistant-turn"
    ? groupSegments(item.steps).map((segment) => item.messagesById[segment.segmentId]?.content) : [])
  expect(rendered).toEqual([...history.map((message) => message.content), "Hello world"])
  expect(resumed.messages).toHaveLength(completedCount + 1)
  expect(resumed.messages.slice(0, completedCount)).toEqual(hydrated.messages.slice(0, completedCount))
  expect(resumed.messages.at(-1)).toMatchObject({ id: "live_segment", snapshotMessageId: "durable_prefix", content: "Hello world" })
  expect(hydrated.messages.filter((message) => message.awaitingTextSegment)).toHaveLength(1)
  expect(applyChatProjectionEvents(resumed, events)).toBe(resumed)
})
