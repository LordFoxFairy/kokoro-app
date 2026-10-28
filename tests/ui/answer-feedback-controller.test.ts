import { expect, it, vi } from "vitest"
import { createAnswerFeedbackController } from "@/ui/thread/answer-feedback-controller"
const target = { actorId: "actor", sessionId: "session", runId: "old-run", messageId: "answer", scope: { kind: "project" as const, projectRef: "project" } }
const fact = (value: "up" | "down" | null = null) => ({ sessionId: "session", messageId: "answer", value })
it("shows only owner feedback and resolves uncertain PUT by explicit read, never automatic resend", async () => {
  const current = { target, epoch: {} }, read = vi.fn().mockResolvedValue(fact()), write = vi.fn().mockRejectedValue(new Error("lost ACK"))
  const controller = createAnswerFeedbackController({ current: () => current, read, write })
  expect(controller.getState().kind).toBe("unread")
  expect(await controller.write("up")).toBe(false)
  await controller.read(); expect(controller.getState()).toMatchObject({ kind: "ready", value: null })
  await controller.write("up"); expect(controller.getState().kind).toBe("unknown")
  expect(await controller.write("down")).toBe(false); expect(write).toHaveBeenCalledTimes(1)
  read.mockResolvedValue(fact("up")); await controller.read()
  expect(controller.getState()).toMatchObject({ kind: "ready", value: "up" })
  expect(write).toHaveBeenCalledTimes(1)
})
it("ignores an old actor/scope/epoch read and rejects wrong Message facts rather than making a null vote", async () => {
  let current = { target, epoch: {} }; let finish!: (value: ReturnType<typeof fact>) => void
  const controller = createAnswerFeedbackController({ current: () => current, read: () => new Promise((resolve) => { finish = resolve }), write: vi.fn() })
  const pending = controller.read(); current = { target: { ...target, actorId: "new" }, epoch: {} }; finish(fact("up")); await pending
  expect(controller.getState().kind).toBe("unread")
  const wrong = createAnswerFeedbackController({ current: () => current, read: async () => ({ ...fact(), messageId: "foreign" }), write: vi.fn() })
  await wrong.read(); expect(wrong.getState().kind).toBe("failed")
})
it("retirement aborts the read and its late success cannot restore retired facts", async () => {
  let signal!: AbortSignal, finish!: (value: ReturnType<typeof fact>) => void
  const controller = createAnswerFeedbackController({ current: () => ({ target, epoch }), read: (args) => { signal = args.signal; return new Promise((resolve) => { finish = resolve }) }, write: vi.fn() })
  const pending = controller.read(); controller.retire(); expect(signal.aborted).toBe(true); finish(fact("down")); await pending
  expect(controller.getState().kind).toBe("unread")
})
const epoch = {}

it.each(["actor", "scope", "epoch"])("late feedback cannot survive an isolated %s retirement", async (change) => {
  let context = { target, epoch: {} }; let finish!: (value: ReturnType<typeof fact>) => void
  const controller = createAnswerFeedbackController({ current: () => context, read: () => new Promise((resolve) => { finish = resolve }), write: vi.fn() })
  const pending = controller.read()
  context = change === "epoch" ? { ...context, epoch: {} } : { ...context, target: change === "actor" ? { ...target, actorId: "other" } : { ...target, scope: { kind: "project", projectRef: "other" } } }
  finish(fact("up")); await pending
  expect(controller.getState().kind).toBe("unread")
})
