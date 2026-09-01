import { afterEach, describe, expect, it, vi } from "vitest"

import { createPreviewClient } from "@/dev/preview-transport"

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("preview event timeout")
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe("preview transport control loop", () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it("defers persisted history parsing until the first transport operation", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem")
    const client = createPreviewClient({ stepMs: 0 })

    expect(getItem).not.toHaveBeenCalledWith("kokoro.preview.sessions.v1")

    await client.listSessions()

    expect(getItem).toHaveBeenCalledWith("kokoro.preview.sessions.v1")
  })

  it("coalesces one submitted turn into a single preview storage write", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    const client = createPreviewClient({ stepMs: 0 })

    await client.createMessage("preview-write-session", {
      idempotency_key: "preview-write-1",
      content: "一次提交",
    })

    expect(setItem).toHaveBeenCalledTimes(1)
  })

  it("HITL approve emits returned tool, assistant completion, and run completion", async () => {
    const client = createPreviewClient({ stepMs: 0 })
    const events: string[] = []
    const eventIds: string[] = []
    const receipt = await client.createMessage("preview-session", {
      idempotency_key: "preview-message-1",
      content: "!hitl",
    })
    client.openEvents({
      sessionId: "preview-session",
      onEvent: (event) => {
        events.push(event.kind)
        eventIds.push(event.event_id)
      },
      onStreamError: (error) => { throw error },
    })
    await waitFor(() => events.includes("tool.awaiting_approval"))

    await client.sendControl("preview-session", receipt.run_id, {
      kind: "run.resume",
      decision_id: "decision-preview-1",
      decisions: [{ type: "approve", tool_id: `${receipt.run_id}:tool_1` }],
    })
    await waitFor(() => events.includes("run.completed"))

    expect(events).toContain("tool.returned")
    expect(events).toContain("message.completed")
    expect(new Set(eventIds).size).toBe(eventIds.length)
  })

  it("HITL reject emits an error-shaped tool result and closes the run", async () => {
    const client = createPreviewClient({ stepMs: 0 })
    const returned: Array<{ is_error: boolean; result: string }> = []
    const completed: string[] = []
    let awaiting = false
    const receipt = await client.createMessage("preview-reject-session", {
      idempotency_key: "preview-reject-message-1",
      content: "!hitl",
    })
    client.openEvents({
      sessionId: "preview-reject-session",
      onEvent: (event) => {
        if (event.kind === "tool.awaiting_approval") awaiting = true
        if (event.kind === "tool.returned") {
          returned.push({ is_error: event.payload.is_error, result: event.payload.result })
        }
        if (event.kind === "run.completed") completed.push(event.payload.status)
      },
      onStreamError: (error) => { throw error },
    })

    await waitFor(() => awaiting)
    await client.sendControl("preview-reject-session", receipt.run_id, {
      kind: "run.resume",
      decision_id: "decision-preview-reject-1",
      decisions: [{ type: "reject", tool_id: `${receipt.run_id}:tool_1` }],
    })
    await waitFor(() => completed.length === 1)

    expect(returned).toEqual([{ is_error: true, result: "预览工具已拒绝。" }])
    expect(completed).toEqual(["completed"])
  })

  it("normalizes an unknown preview failure code instead of breaking the event drain", async () => {
    const client = createPreviewClient({ stepMs: 0 })
    const failures: Array<{ code: string; message: string }> = []
    const receipt = await client.createMessage("preview-invalid-failure-session", {
      idempotency_key: "preview-invalid-failure-message-1",
      content: "!fail:network",
    })
    client.openEvents({
      sessionId: "preview-invalid-failure-session",
      onEvent: (event) => {
        if (event.kind === "run.failed") failures.push(event.payload)
      },
      onStreamError: (error) => { throw error },
    })

    await waitFor(() => failures.length === 1)
    expect(failures[0]).toEqual({
      code: "internal_error",
      error_kind: "PreviewSyntheticError",
      message: "Synthetic failure for preview: network (using internal_error)\n  at previewTransport.enqueueRun (dev harness)",
    })
    expect(receipt.run_id).toContain("run_")
  })

  it("rehydrates a completed project preview after the client is recreated", async () => {
    const sessionId = `preview-persist-session-${Date.now()}-${Math.random()}`
    const firstClient = createPreviewClient({ stepMs: 0 })
    const firstEvents: string[] = []

    await firstClient.createMessage(sessionId, {
      idempotency_key: `${sessionId}:message-1`,
      content: "项目页刷新后仍然显示这条消息",
      project_ref: "kokoro",
    })
    firstClient.openEvents({
      sessionId,
      onEvent: (event) => firstEvents.push(event.kind),
      onStreamError: (error) => { throw error },
    })
    await waitFor(() => firstEvents.includes("run.completed"))

    const secondClient = createPreviewClient({ stepMs: 0 })
    const snapshot = await secondClient.fetchSnapshot(sessionId)
    expect(snapshot?.session.title).toBe("项目页刷新后仍然显示这条消息")

    const replayedEvents: string[] = []
    secondClient.openEvents({
      sessionId,
      onEvent: (event) => replayedEvents.push(event.kind),
      onStreamError: (error) => { throw error },
    })
    await waitFor(() => replayedEvents.includes("run.completed"))

    expect(replayedEvents).toContain("message.user")
    expect(replayedEvents).toContain("message.completed")
  })

  it("同一客户端在 A→B→A 切换后按本次游标重放旧会话", async () => {
    const client = createPreviewClient({ stepMs: 0 })
    const sessionA = `preview-switch-a-${Date.now()}-${Math.random()}`
    const sessionB = `${sessionA}-b`

    const firstA = await client.createMessage(sessionA, {
      idempotency_key: `${sessionA}:message-1`,
      content: "会话 A",
    })
    const firstAEvents: string[] = []
    const firstAStream = client.openEvents({
      sessionId: sessionA,
      lastEventId: 0,
      onEvent: (event) => firstAEvents.push(event.kind),
      onStreamError: (error) => { throw error },
    })
    await waitFor(() => firstAEvents.includes("run.completed"))
    firstAStream.close()

    const firstB = await client.createMessage(sessionB, {
      idempotency_key: `${sessionB}:message-1`,
      content: "会话 B",
    })
    const firstBEvents: string[] = []
    const firstBStream = client.openEvents({
      sessionId: sessionB,
      lastEventId: 0,
      onEvent: (event) => firstBEvents.push(event.kind),
      onStreamError: (error) => { throw error },
    })
    await waitFor(() => firstBEvents.includes("run.completed"))
    firstBStream.close()

    const replayedA: string[] = []
    client.openEvents({
      sessionId: sessionA,
      lastEventId: 0,
      onEvent: (event) => replayedA.push(event.kind),
      onStreamError: (error) => { throw error },
    })
    await waitFor(() => replayedA.includes("run.completed"))

    expect(firstA.run_id).not.toBe(firstB.run_id)
    expect(replayedA).toContain("session.created")
    expect(replayedA).toContain("message.user")
    expect(replayedA).toContain("message.completed")
  })
})
