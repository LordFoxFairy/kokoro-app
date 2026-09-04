// snapshot 水合规格：当前读模型 + opaque AG-UI watermark 组成一致续流起点。
import { describe, expect, it } from "vitest"

import { stateFromSnapshot } from "@/core/hydration"

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
            content_hash: "hash_9",
            title: "终稿",
            created_at: "2026-07-09T10:00:00Z",
          }),
        ],
      }),
    )
    expect(state.deliveries).toEqual([
      {
        contentHash: "hash_9",
        path: "out/report.md",
        title: "终稿",
        mime: "text/markdown",
        size: 2048,
        createdAt: "2026-07-09T10:00:00Z",
      },
    ])
  })
})
