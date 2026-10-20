import { act, cleanup, renderHook } from "@testing-library/react"
import { useEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAppFrameEngine } from "@/components/blocks/app-frame/use-app-frame-engine"
import type { SessionEngine } from "@/engine/machine"
import { admitBrowserAuthSessionIndexes, releaseBrowserEngine } from "@/ui/shell/page-clients"
import { makeSnapshot } from "../core/fixtures"

type CreateRequest = { path: string; key: string | null; body: string }
const ownedEngines = new Set<SessionEngine>()

function controlledOwner(create: () => Promise<Response>, snapshot?: () => Response) {
  const creates: CreateRequest[] = []
  const reads: string[] = []
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(String(input), window.location.origin).pathname
    if (init?.method === "POST" && /^\/api\/session\/sessions\/[^/]+\/messages$/u.test(path)) {
      creates.push({ path, key: new Headers(init.headers).get("Idempotency-Key"), body: String(init.body) })
      return create()
    }
    if ((init?.method ?? "GET") === "GET" && /^\/api\/session\/sessions\/[^/]+$/u.test(path)) {
      reads.push(path)
      // Before the held create is admitted, the owner truthfully has no session.
      return snapshot?.() ?? new Response(null, { status: 404 })
    }
    if ((init?.method ?? "GET") === "GET" && path.endsWith("/events")) {
      return new Response(new ReadableStream(), { headers: { "content-type": "text/event-stream" } })
    }
    throw new Error(`Unexpected controlled request: ${init?.method ?? "GET"} ${path}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  return { creates, reads, fetchMock }
}

function mountScope() {
  return renderHook(({ projectRef }: { projectRef: string | undefined }) => {
    const scope = useAppFrameEngine({ injectedEngine: undefined, preview: false, projectRef })
    useEffect(() => {
      if (scope.engine !== null) ownedEngines.add(scope.engine)
    }, [scope.engine])
    return scope
  }, { initialProps: { projectRef: undefined as string | undefined } })
}

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
}

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  window.localStorage.setItem("kokoro.web.auth-index-subject", "scope-submission-actor")
})

afterEach(async () => {
  cleanup()
  // Unknown outcomes may intentionally survive ordinary last-owner release.
  // Explicitly release only this test's now-unowned browser engines.
  for (const engine of ownedEngines) releaseBrowserEngine(engine)
  ownedEngines.clear()
  await settle()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  window.localStorage.clear()
})

describe("live browser scope leases and unacknowledged submissions", () => {
  it("does not retain an invalidated subject when its last mounted owner releases later", async () => {
    const owner = controlledOwner(() => Promise.reject(new Error("unknown create outcome")))
    const view = mountScope()
    const previous = view.result.current.engine!
    act(() => { previous.submit("prior actor intent") })
    await settle()
    act(() => { expect(admitBrowserAuthSessionIndexes("new-actor", "scope-submission-actor")).toBe(true) })
    view.rerender({ projectRef: "project-new-actor" })
    await settle()
    view.rerender({ projectRef: undefined })
    await settle()
    expect(view.result.current.engine).not.toBe(previous)
    expect(view.result.current.thread.messages).toEqual([])
    expect(view.result.current.engine!.getSnapshot().canRetryPendingSubmission).toBe(false)
    expect(owner.creates).toHaveLength(1)
  })

  it("retains exact unknown submission retry semantics while the direct scope stays mounted", async () => {
    const owner = controlledOwner(() => Promise.reject(new Error("unknown create outcome")))
    const view = mountScope()
    const engine = view.result.current.engine!

    act(() => { expect(engine.submit("original direct intent")).toBe(true) })
    await settle()
    expect(engine.getSnapshot().canRetryPendingSubmission).toBe(true)
    const original = owner.creates[0]
    expect(original?.key).toBeTruthy()

    view.rerender({ projectRef: undefined })
    expect(owner.creates).toHaveLength(1)
    act(() => view.result.current.engine!.retry())
    await settle()
    expect(owner.creates).toEqual([original, original])
    expect(engine.getSnapshot().thread.messages).toEqual([
      expect.objectContaining({ role: "user", content: "original direct intent" }),
    ])
  })

  it("keeps the original unknown intent recoverable after Direct → Project → Direct without an automatic POST", async () => {
    const owner = controlledOwner(() => Promise.reject(new Error("unknown create outcome")))
    const view = mountScope()
    const source = view.result.current.engine!
    act(() => { expect(source.submit("original unknown direct intent")).toBe(true) })
    await settle()
    expect(source.getSnapshot().canRetryPendingSubmission).toBe(true)
    const original = owner.creates[0]
    const sessionId = source.getSnapshot().store!.activeId

    view.rerender({ projectRef: "project-other-scope" })
    await settle() // Allow the real page-clients last-lease release to run.
    expect(view.result.current.thread.messages).toEqual([])
    view.rerender({ projectRef: undefined })
    await settle()
    const returned = view.result.current.engine!
    expect(returned.getSnapshot().store?.activeId).toBe(sessionId)
    expect(owner.creates).toHaveLength(1)

    // A null owner snapshot cannot prove that the original create was rejected.
    expect(returned.getSnapshot().canRetryPendingSubmission).toBe(true)
    act(() => returned.retry())
    await settle()
    expect(owner.creates).toEqual([original, original])
  })

  it("projects the same accepted receipt when the original scope remains mounted", async () => {
    let accept!: (response: Response) => void
    const owner = controlledOwner(() => new Promise(resolve => { accept = resolve }))
    const view = mountScope()
    act(() => { expect(view.result.current.engine!.submit("pending direct intent")).toBe(true) })
    await act(async () => {
      accept(Response.json({ run_id: "run_late_scope", user_message_id: "user_late_scope", assistant_message_id: "assistant_late_scope" }))
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(owner.creates).toHaveLength(1)
    expect(view.result.current.thread.messages).toContainEqual(
      expect.objectContaining({ id: "user_late_scope", role: "user", content: "pending direct intent" }),
    )
    expect(view.result.current.machine.phase).toBe("queued")
  })

  it("recovers a late accepted receipt after the original scope lease retired, without a replacement create", async () => {
    let accept!: (response: Response) => void
    let acceptedSnapshot: ReturnType<typeof makeSnapshot> | null = null
    const owner = controlledOwner(() => new Promise(resolve => { accept = resolve }), () => acceptedSnapshot === null
      ? new Response(null, { status: 404 })
      : Response.json(acceptedSnapshot))
    const view = mountScope()
    const source = view.result.current.engine!
    act(() => { expect(source.submit("pending direct intent")).toBe(true) })
    const sessionId = source.getSnapshot().store!.activeId
    expect(source.getSnapshot().machine.phase).toBe("submitting")

    view.rerender({ projectRef: "project-other-scope" })
    await settle()
    view.rerender({ projectRef: undefined })
    await settle()
    expect(owner.creates).toHaveLength(1)

    await act(async () => {
      // If recovery chooses to re-read, the now-admitted owner is available.
      acceptedSnapshot = makeSnapshot({ sessionId, activeRun: { run_id: "run_late_scope", status: "queued" }, messages: [{
        message_id: "user_late_scope", role: "user", content: "pending direct intent", status: "completed", created_at: "2026-10-19T00:00:00Z",
      }] })
      accept(Response.json({ run_id: "run_late_scope", user_message_id: "user_late_scope", assistant_message_id: "assistant_late_scope" }))
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(owner.creates).toHaveLength(1)
    expect(view.result.current.store?.activeId).toBe(sessionId)
    expect(view.result.current.thread.messages).toContainEqual(
      expect.objectContaining({ role: "user", content: "pending direct intent" }),
    )
    expect(view.result.current.machine.phase).toBe("queued")
  })

  it("releases the hidden scope after its create is acknowledged and restores from owner truth on return", async () => {
    let accept!: (response: Response) => void
    let acceptedSnapshot: ReturnType<typeof makeSnapshot> | null = null
    const owner = controlledOwner(() => new Promise(resolve => { accept = resolve }), () => acceptedSnapshot === null
      ? new Response(null, { status: 404 })
      : Response.json(acceptedSnapshot))
    const view = mountScope()
    const source = view.result.current.engine!
    act(() => { expect(source.submit("acknowledged hidden intent")).toBe(true) })
    const sessionId = source.getSnapshot().store!.activeId
    view.rerender({ projectRef: "project-other-scope" })
    await settle()

    await act(async () => {
      acceptedSnapshot = makeSnapshot({ sessionId, activeRun: { run_id: "run_hidden_ack", status: "queued" }, messages: [{
        message_id: "user_hidden_ack", role: "user", content: "acknowledged hidden intent", status: "completed", created_at: "2026-10-19T00:00:00Z",
      }] })
      accept(Response.json({ run_id: "run_hidden_ack", user_message_id: "user_hidden_ack", assistant_message_id: "assistant_hidden_ack" }))
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(source.getSnapshot().canSubmitMessage).toBe(false)
    expect(owner.creates).toHaveLength(1)

    view.rerender({ projectRef: undefined })
    await settle()
    expect(view.result.current.thread.messages).toContainEqual(
      expect.objectContaining({ id: "user_hidden_ack", role: "user", content: "acknowledged hidden intent" }),
    )
    expect(view.result.current.machine.phase).toBe("queued")
    expect(owner.creates).toHaveLength(1)
  })

  it("retires an unowned unknown intent on verified actor replacement rather than returning it to the next actor", async () => {
    const owner = controlledOwner(() => Promise.reject(new Error("unknown create outcome")))
    const view = mountScope()
    const source = view.result.current.engine!
    act(() => { expect(source.submit("private original actor intent")).toBe(true) })
    await settle()
    expect(source.getSnapshot().canRetryPendingSubmission).toBe(true)
    view.rerender({ projectRef: "project-other-scope" })
    await settle()

    act(() => { expect(admitBrowserAuthSessionIndexes("next-verified-actor", "scope-submission-actor")).toBe(true) })
    await settle()
    expect(source.getSnapshot().canSubmitMessage).toBe(false)
    view.rerender({ projectRef: undefined })
    await settle()
    expect(view.result.current.thread.messages).toEqual([])
    expect(view.result.current.engine!.getSnapshot().canRetryPendingSubmission).toBe(false)
    act(() => view.result.current.engine!.retry())
    await settle()
    expect(owner.creates).toHaveLength(1)
  })
})
