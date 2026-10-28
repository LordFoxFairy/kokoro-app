import { SessionClientError } from "@/engine/client-error"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, expect, it, vi } from "vitest"
import { createAnswerRegenerationController } from "@/ui/thread/answer-regeneration-controller"
afterEach(cleanup)
const target = { actorId: "actor", sessionId: "session", runId: "source-run", messageId: "source-answer", scope: { kind: "direct" as const } }
const ack = { runId: "new-run", assistantMessageId: "new-answer", originalUserMessageId: "original-user", sourceMessageId: "source-answer" }
it("new intent gets a new key while unknown recovery keeps exactly the old target/key even when new head makes eligibility false", async () => {
  const context = { target, epoch: {}, eligible: true }, request = vi.fn().mockRejectedValueOnce(new Error("lost ACK")).mockResolvedValue(ack), newKey = vi.fn().mockReturnValue("key-1")
  const controller = createAnswerRegenerationController({ current: () => context, request, newKey })
  await controller.run(); expect(controller.getState().kind).toBe("unknown")
  context.eligible = false
  await controller.run(); expect(controller.getState()).toMatchObject({ kind: "accepted", receipt: ack })
  expect(request).toHaveBeenCalledTimes(2); expect(newKey).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]![0].key).toBe(request.mock.calls[1]![0].key)
  expect(request.mock.calls[0]![0].target).toEqual(request.mock.calls[1]![0].target)
  expect(Object.hasOwn(request.mock.calls[0]![0], "content")).toBe(false)
  expect(await controller.run()).toBeNull(); expect(request).toHaveBeenCalledTimes(2)
})
it("does not admit a new ineligible intent, double click or malformed source ACK", async () => {
  const context = { target, epoch: {}, eligible: false }, request = vi.fn().mockResolvedValue({ ...ack, sourceMessageId: "foreign" })
  const controller = createAnswerRegenerationController({ current: () => context, request, newKey: () => "key" })
  expect(await controller.run()).toBeNull(); expect(request).not.toHaveBeenCalled()
  context.eligible = true; await controller.run(); expect(controller.getState().kind).toBe("unknown")
})
it("old actor retirement aborts the request and late accepted receipt cannot mutate the new actor", async () => {
  let context = { target, epoch: {}, eligible: true }, finish!: (value: typeof ack) => void, signal!: AbortSignal
  const controller = createAnswerRegenerationController({ current: () => context, request: (args) => { signal = args.signal; return new Promise((resolve) => { finish = resolve }) }, newKey: () => "key" })
  const pending = controller.run(); expect(await controller.run()).toBeNull()
  context = { target: { ...target, actorId: "new" }, epoch: {}, eligible: true }; controller.retire(); expect(signal.aborted).toBe(true)
  finish(ack); expect(await pending).toBeNull(); expect(controller.getState().kind).toBe("idle")
})

it("does not replace an unresolved same-owner source intent with a new source/key", async () => {
  let context = { target, epoch: {}, eligible: true }; const request = vi.fn().mockRejectedValue(new Error("lost")), newKey = vi.fn().mockReturnValue("original-key")
  const controller = createAnswerRegenerationController({ current: () => context, request, newKey })
  await controller.run()
  context = { ...context, target: { ...target, runId: "other-source-run", messageId: "other-source-answer" } }
  expect(controller.getState().kind).toBe("idle")
  expect(await controller.run()).toBeNull()
  expect(newKey).toHaveBeenCalledTimes(1); expect(request).toHaveBeenCalledTimes(1)
})

it("shows unknown recovery only on its original Message and its click keeps the old key when the head changes", async () => {
  let context = { target, epoch: {}, eligible: true }
  const request = vi.fn().mockRejectedValueOnce(new Error("lost")).mockResolvedValue(ack), newKey = vi.fn().mockReturnValue("original-key")
  const controller = createAnswerRegenerationController({ current: () => context, request, newKey })
  await controller.run()
  const view = () => createElement("div", {}, controller.getState().kind === "unknown" ? createElement("button", { onClick: () => void controller.run() }, "Recover original answer") : null)
  const { rerender } = render(view())
  expect(screen.getByRole("button", { name: "Recover original answer" })).toBeInTheDocument()
  context = { ...context, target: { ...target, runId: "other-run", messageId: "other-answer" }, eligible: false }
  rerender(view())
  expect(screen.queryByRole("button", { name: "Recover original answer" })).not.toBeInTheDocument()
  expect(await controller.run()).toBeNull(); expect(request).toHaveBeenCalledTimes(1)
  context = { ...context, target, eligible: false }; rerender(view())
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Recover original answer" })) })
  expect(request).toHaveBeenCalledTimes(2)
  expect(request.mock.calls[1]![0].key).toBe("original-key")
  expect(request.mock.calls[1]![0].target.messageId).toBe("source-answer")
  expect(newKey).toHaveBeenCalledTimes(1)
})

it("only exact first precommit rejection is definitive; a fresh source read is needed for a user new attempt", async () => {
  const context = { target, epoch: {}, evidence: {}, eligible: true }
  const request = vi.fn().mockRejectedValueOnce(new SessionClientError("http", "not ready", "message_regeneration_not_ready", 409)).mockResolvedValue(ack)
  const newKey = vi.fn().mockReturnValueOnce("K1").mockReturnValue("K2")
  const controller = createAnswerRegenerationController({ current: () => context, request, newKey })
  await controller.run(); expect(controller.getState().kind).toBe("rejected")
  await controller.run(); expect(request).toHaveBeenCalledTimes(1)
  context.evidence = {}; await controller.run()
  expect(controller.getState().kind).toBe("accepted")
  expect(request.mock.calls[1]![0].key).toBe("K2")
})
it.each([401, 403, 409])("a held unknown stays unknown after a later %s and retains its original key", async status => {
  const request = vi.fn().mockRejectedValueOnce(Error("lost ACK")).mockRejectedValueOnce(new SessionClientError("http", "rejected now", status === 409 ? "message_regeneration_not_ready" : "session_forbidden", status)).mockResolvedValue(ack)
  const controller = createAnswerRegenerationController({ current: () => ({ target, epoch, eligible: true }), request, newKey: () => "original" })
  const epoch = {}
  await controller.run(); await controller.run(); expect(controller.getState().kind).toBe("unknown")
  await controller.run(); expect(controller.getState().kind).toBe("accepted")
  expect(request.mock.calls.every(call => call[0].key === "original")).toBe(true)
})
it.each([401, 403])("even a first %s can be a postcommit admission rejection, not no-write evidence", async status => {
  const epoch = {}, request = vi.fn().mockRejectedValue(new SessionClientError("http", "denied", "session_forbidden", status))
  const controller = createAnswerRegenerationController({ current: () => ({ target, epoch, eligible: true }), request, newKey: () => "K" })
  await controller.run(); expect(controller.getState().kind).toBe("unknown")
})
