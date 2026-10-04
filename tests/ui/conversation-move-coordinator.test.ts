import { describe, expect, it, vi } from "vitest"

import { ConversationMoveError } from "@/engine/conversation-move-error"
import { createConversationMoveCoordinator } from "@/ui/shell/conversation-move-coordinator"

const conversationA = "conv_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const conversationB = "conv_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const projectA = "project_22222222-2222-4222-8222-222222222222"

describe("page Conversation Move coordinator", () => {
  it("settles matching ACKs outside the view and immediately reconciles each source index", async () => {
    const moveSession = vi.fn()
      .mockResolvedValueOnce({ session_id: conversationA, project_ref: projectA })
      .mockResolvedValueOnce({ session_id: conversationB, project_ref: projectA })
    const evictSourceIndex = vi.fn()
    let command = 0
    const coordinator = createConversationMoveCoordinator({
      client: { moveSession },
      evictSourceIndex,
      createCommandId: () => `move_${++command}`,
    })
    coordinator.admitVerifiedSubject("subject-a")

    await expect(coordinator.start({ sourceScopeKey: "direct", sessionId: conversationA, targetProjectId: projectA }))
      .resolves.toMatchObject({ status: "confirmed", commandId: "move_1" })
    await expect(coordinator.start({ sourceScopeKey: "direct", sessionId: conversationB, targetProjectId: projectA }))
      .resolves.toMatchObject({ status: "confirmed", commandId: "move_2" })

    expect(evictSourceIndex.mock.calls).toEqual([
      ["direct", conversationA],
      ["direct", conversationB],
    ])
    expect(coordinator.getSnapshot().scopeVersions.get("direct")).toBeGreaterThan(0)
    expect(coordinator.getSnapshot().scopeVersions.get(`project:${projectA}`)).toBeGreaterThan(0)
    expect(coordinator.getSnapshot().intent).toBeNull()
  })

  it("bounds revisions to the latest confirmed source and target and clears them on subject change", async () => {
    const projectB = "project_33333333-3333-4333-8333-333333333333"
    const moveSession = vi.fn()
      .mockResolvedValueOnce({ session_id: conversationA, project_ref: projectA })
      .mockResolvedValueOnce({ session_id: conversationB, project_ref: null })
    const coordinator = createConversationMoveCoordinator({
      client: { moveSession }, evictSourceIndex: vi.fn(), createCommandId: () => crypto.randomUUID(),
    })
    coordinator.admitVerifiedSubject("subject-a")
    await coordinator.start({ sourceScopeKey: "direct", sessionId: conversationA, targetProjectId: projectA })
    await coordinator.start({ sourceScopeKey: `project:${projectB}`, sessionId: conversationB, targetProjectId: null })

    expect([...coordinator.getSnapshot().scopeVersions.keys()].sort()).toEqual(["direct", `project:${projectB}`].sort())
    coordinator.admitVerifiedSubject("subject-b")
    expect(coordinator.getSnapshot().scopeVersions.size).toBe(0)
  })

  it("keeps an unknown command byte-identical and retries only after an explicit call", async () => {
    const moveSession = vi.fn()
      .mockRejectedValueOnce(new ConversationMoveError({ kind: "network" }))
      .mockResolvedValueOnce({ session_id: conversationA, project_ref: projectA })
    const coordinator = createConversationMoveCoordinator({
      client: { moveSession },
      evictSourceIndex: vi.fn(),
      createCommandId: () => "move_fixed",
    })
    coordinator.admitVerifiedSubject("subject-a")
    await expect(coordinator.start({ sourceScopeKey: "direct", sessionId: conversationA, targetProjectId: projectA }))
      .resolves.toMatchObject({ status: "unknown", commandId: "move_fixed" })
    expect(moveSession).toHaveBeenCalledTimes(1)

    coordinator.suspendVerifiedSubject("subject-a")
    await expect(coordinator.retry()).resolves.toBeNull()
    expect(moveSession).toHaveBeenCalledTimes(1)
    coordinator.admitVerifiedSubject("subject-a")
    await expect(coordinator.retry()).resolves.toMatchObject({ status: "confirmed", commandId: "move_fixed" })
    expect(moveSession).toHaveBeenCalledTimes(2)
    expect(moveSession.mock.calls[1]?.[0]).toMatchObject(moveSession.mock.calls[0]?.[0])
  })

  it("keeps a matching owner ACK confirmed when browser index eviction throws", async () => {
    const coordinator = createConversationMoveCoordinator({
      client: { moveSession: vi.fn().mockResolvedValue({ session_id: conversationA, project_ref: projectA }) },
      evictSourceIndex: vi.fn(() => { throw new Error("blocked storage") }),
      createCommandId: () => "move_confirmed",
    })
    coordinator.admitVerifiedSubject("subject-a")

    await expect(coordinator.start({ sourceScopeKey: "direct", sessionId: conversationA, targetProjectId: projectA }))
      .resolves.toMatchObject({ status: "confirmed", commandId: "move_confirmed" })
    expect(coordinator.getSnapshot().scopeVersions.get("direct")).toBeGreaterThan(0)
    expect(coordinator.getSnapshot().intent).toBeNull()
  })

  it("fences a late completion after subject revoke", async () => {
    let resolveMove: ((value: { session_id: string; project_ref: string | null }) => void) | undefined
    const moveSession = vi.fn(() => new Promise<{ session_id: string; project_ref: string | null }>((resolve) => {
      resolveMove = resolve
    }))
    const evictSourceIndex = vi.fn()
    const coordinator = createConversationMoveCoordinator({
      client: { moveSession },
      evictSourceIndex,
      createCommandId: () => "move_late",
    })
    coordinator.admitVerifiedSubject("subject-a")
    const operation = coordinator.start({ sourceScopeKey: "direct", sessionId: conversationA, targetProjectId: projectA })
    coordinator.revokeSubject()
    resolveMove?.({ session_id: conversationA, project_ref: projectA })

    await expect(operation).resolves.toMatchObject({ status: "superseded" })
    expect(evictSourceIndex).not.toHaveBeenCalled()
    expect(coordinator.getSnapshot().scopeVersions.size).toBe(0)
    expect(coordinator.getSnapshot().intent).toBeNull()
  })
})
