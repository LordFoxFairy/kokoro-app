import { afterEach, it, expect, vi } from "vitest"
import { createAnswerActionsClient } from "@/engine/answer-actions-client"
afterEach(() => vi.unstubAllGlobals())
it("uses independent exact owner commands and never appends or copies a prompt", async () => {
  const f = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ run_id: "new", user_message_id: "old-user", assistant_message_id: "new-answer", regenerated_from_message_id: "source" }), {
      status: 202,
      headers: { "content-type": "application/json" },
    }),
  )
  vi.stubGlobal("fetch", f)
  const client = createAnswerActionsClient({ baseUrl: "/api/session" }),
    signal = new AbortController().signal
  expect((await client.regenerate({ sessionId: "session", messageId: "source" }, "original-key", signal)).run_id).toBe("new")
  expect(f).toHaveBeenCalledTimes(1)
  expect(f.mock.calls[0]?.[0]).toBe("/api/session/sessions/session/messages/source/regenerate")
  expect(f.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: "{}", headers: expect.objectContaining({ "idempotency-key": "original-key" }) })
})
it("does not retry truncated writes or accept stale target facts", async () => {
  const f = vi
    .fn()
    .mockResolvedValue(new Response('{"session_id":"session"', { status: 200, headers: { "content-type": "application/json", "content-length": "100" } }))
  vi.stubGlobal("fetch", f)
  const c = createAnswerActionsClient({ baseUrl: "/api/session" }),
    signal = new AbortController().signal
  await expect(c.setFeedback({ sessionId: "session", messageId: "m" }, "up", signal)).rejects.toThrow()
  expect(f).toHaveBeenCalledTimes(1)
  f.mockResolvedValue(
    new Response(JSON.stringify({ session_id: "other", message_id: "m", feedback: null }), { headers: { "content-type": "application/json" } }),
  )
  await expect(c.readFeedback({ sessionId: "session", messageId: "m" }, signal)).rejects.toThrow()
})

it("preserves an exact known owner rejection without retry and cancels a held EOF read", async () => {
  const error = { error: { code: "message_regeneration_not_ready", message: "not ready" }, meta: { request_id: "request" } },
    f = vi.fn().mockResolvedValue(new Response(JSON.stringify(error), { status: 409, headers: { "content-type": "application/json" } }))
  vi.stubGlobal("fetch", f)
  const c = createAnswerActionsClient({ baseUrl: "/api/session" }),
    signal = new AbortController().signal
  await expect(c.regenerate({ sessionId: "s", messageId: "m" }, "same-key", signal)).rejects.toMatchObject({
    reason: "http",
    status: 409,
    code: "message_regeneration_not_ready",
  })
  expect(f).toHaveBeenCalledTimes(1)
  const cancelled = vi.fn(),
    controller = new AbortController()
  f.mockResolvedValue(
    new Response(
      new ReadableStream({
        start(out) {
          out.enqueue(new TextEncoder().encode('{"session_id":'))
        },
        cancel: cancelled,
      }),
      { headers: { "content-type": "application/json" } },
    ),
  )
  const read = c.readFeedback({ sessionId: "s", messageId: "m" }, controller.signal)
  await Promise.resolve()
  controller.abort()
  await expect(read).rejects.toThrow()
  expect(cancelled).toHaveBeenCalled()
  expect(f).toHaveBeenCalledTimes(2)
})
