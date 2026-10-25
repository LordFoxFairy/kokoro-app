import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { useAppFrameActions } from "@/components/blocks/app-frame/use-app-frame-actions"
import type { ConversationStore } from "@/core/conversations"
import { createSessionEngine } from "@/engine/machine"
import { makeSnapshot } from "../core/fixtures"
import { LocaleProvider } from "@/i18n/context"
import { createFakeClient, createMemoryStorage, makeReceipt, settle } from "../engine/fakes"

beforeEach(() => {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "navigation-reader")
  window.history.replaceState(null, "", "/app")
})
afterEach(() => { cleanup(); window.localStorage.clear(); window.history.replaceState(null, "", "/app") })

function setup(explicitRoute = false, createDraft = true) {
  const client = createFakeClient()
  client.nextCreate = () => new Promise(() => {})
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(null) })
  if (createDraft) engine.newConversation()
  const original = engine.getSnapshot().store?.activeId ?? null
  if (explicitRoute) window.history.replaceState(null, "", `/app?conversation=${original}`)
  const clearDraft = vi.fn()
  const view = renderHook(() => useAppFrameActions({
    engine, activeId: original, projectWorkspace: false, standaloneSurface: false, chatHref: "/app",
    draft: "original direct draft", clearDraft, updateDraft: vi.fn(), setDeploymentIntent: vi.fn(),
    syncConversationUrl: vi.fn(), setConversationRouteId: vi.fn(), focusComposer: vi.fn(),
    closeSettings: vi.fn(), brandName: "Kokoro", commandNewChatTimerRef: { current: null },
  }), { wrapper: LocaleProvider })
  return { client, engine, original, clearDraft, view }
}

it.each(["/app/project/project-next", "/app/project/project-next?conversation=conv-next", "/app/library", "/app?conversation=conv-next"])(
  "a retained direct Send rejects navigation to %s without creating a default-scope task or clearing the old draft",
  (destination) => {
    const { client, engine, original, clearDraft, view } = setup()
    const send = view.result.current.submitDraft
    try {
      window.history.pushState(null, "", destination)
      act(() => send())
      expect(client.createCalls).toEqual([])
      expect(engine.getSnapshot().store?.activeId).toBe(original)
      expect(clearDraft).not.toHaveBeenCalled()
      expect(window.location.pathname + window.location.search).toBe(destination)
    } finally { engine.dispose() }
  },
)

it("a retained direct Send rejects a different active draft before the new route commits", () => {
  const { client, engine, clearDraft, view } = setup()
  const send = view.result.current.submitDraft
  try {
    act(() => engine.newConversation())
    const next = engine.getSnapshot().store?.activeId
    act(() => send())
    expect(client.createCalls).toEqual([])
    expect(engine.getSnapshot().store?.activeId).toBe(next)
    expect(clearDraft).not.toHaveBeenCalled()
  } finally { engine.dispose() }
})

it("the original Send still accepts automatic canonical URL publication for its own current draft", () => {
  const { client, engine, original, clearDraft, view } = setup()
  const send = view.result.current.submitDraft
  try {
    window.history.replaceState(null, "", `/app?conversation=${original}`)
    act(() => send())
    expect(client.createCalls).toHaveLength(1)
    expect(client.createCalls[0]?.sessionId).toBe(original)
    expect(client.createCalls[0]?.body.content).toBe("original direct draft")
    expect(clearDraft).toHaveBeenCalledTimes(1)
  } finally { engine.dispose() }
})

it("a retained direct task handler cannot submit after history returns to the welcome route", () => {
  const { client, engine, clearDraft, view } = setup(true)
  const send = view.result.current.submitDraft
  try {
    window.history.replaceState(null, "", "/app")
    act(() => send())
    expect(client.createCalls).toEqual([])
    expect(clearDraft).not.toHaveBeenCalled()
  } finally { engine.dispose() }
})

it("navigation rejection preserves an unknown original command for an explicit same-key retry", async () => {
  const { client, engine, original, clearDraft, view } = setup()
  client.nextCreate = () => Promise.reject(new Error("unknown original command"))
  const send = view.result.current.submitDraft
  try {
    await act(async () => { send(); await settle() })
    const command = structuredClone(client.createCalls[0])
    expect(engine.getSnapshot().canRetryPendingSubmission).toBe(true)
    expect(clearDraft).toHaveBeenCalledTimes(1)
    window.history.replaceState(null, "", "/app/project/project-next")
    act(() => send())
    expect(client.createCalls).toEqual([command])
    expect(clearDraft).toHaveBeenCalledTimes(1)
    expect(engine.getSnapshot().store?.activeId).toBe(original)
    client.nextCreate = () => Promise.resolve(makeReceipt("run-original-recovered"))
    window.history.replaceState(null, "", `/app?conversation=${original}`)
    await act(async () => { engine.retry(); await settle() })
    expect(client.createCalls).toEqual([command, command])
  } finally { engine.dispose() }
})

it("a genuinely empty direct engine can still submit its first local draft", () => {
  const { client, engine, clearDraft, view } = setup(false, false)
  try {
    act(() => view.result.current.submitDraft())
    expect(client.createCalls).toHaveLength(1)
    expect(client.createCalls[0]?.sessionId).toBe(engine.getSnapshot().store?.activeId)
    expect(client.createCalls[0]?.body.content).toBe("original direct draft")
    expect(clearDraft).toHaveBeenCalledTimes(1)
  } finally { engine.dispose() }
})

it("an owner-restored direct conversation retains its exact ID on the next Send", async () => {
  const id = "conv_owner_restored"
  const client = createFakeClient()
  client.nextSnapshot = () => Promise.resolve(makeSnapshot({ sessionId: id }))
  client.nextCreate = () => new Promise(() => {})
  window.history.replaceState(null, "", `/app?conversation=${id}`)
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>({
    activeId: id, conversations: [{ id, title: "owner restored", mode: "fast", updatedAt: 1 }],
  }) })
  const clearDraft = vi.fn()
  try {
    await act(async () => { await settle() })
    expect(engine.getSnapshot().hydrating).toBe(false)
    const view = renderHook(() => useAppFrameActions({
      engine, activeId: id, projectWorkspace: false, standaloneSurface: false, chatHref: "/app",
      draft: "continue restored task", clearDraft, updateDraft: vi.fn(), setDeploymentIntent: vi.fn(),
      syncConversationUrl: vi.fn(), setConversationRouteId: vi.fn(), focusComposer: vi.fn(),
      closeSettings: vi.fn(), brandName: "Kokoro", commandNewChatTimerRef: { current: null },
    }), { wrapper: LocaleProvider })
    act(() => view.result.current.submitDraft())
    expect(client.createCalls).toHaveLength(1)
    expect(client.createCalls[0]?.sessionId).toBe(id)
    expect(window.location.pathname + window.location.search).toBe(`/app?conversation=${id}`)
    expect(clearDraft).toHaveBeenCalledTimes(1)
  } finally { engine.dispose() }
})
