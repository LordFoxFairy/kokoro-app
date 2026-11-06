import { act, cleanup, renderHook } from "@testing-library/react"
import { useSyncExternalStore } from "react"
import { afterEach, expect, it, vi } from "vitest"

import { useAppFrameNavigation } from "@/components/blocks/app-frame/use-app-frame-navigation"
import { createSessionEngine } from "@/engine/machine"
import { SessionClientError } from "@/engine/client-error"
import type { ConversationStore } from "@/core/conversations"
import { makeSnapshot } from "../core/fixtures"
import { createFakeClient, createMemoryStorage, makeReceipt, settle } from "../engine/fakes"
import { createBrowserSubmissionRecovery, SUBMISSION_RECOVERY_PREFIX } from "@/ui/shell/browser-submission-recovery"

afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/app")
})

const options = {
  engine: null,
  scope: { kind: "direct" } as const,
  chatHref: "/app",
  projectRef: undefined,
  projectWorkspace: false,
  mounted: true,
  activeId: "conv-retained-direct",
  threadMessageCount: 1,
  hydrating: false,
  machinePhase: "idle" as const,
}

it("catalog navigation never acquires the retained direct conversation URL", () => {
  window.history.replaceState(null, "", "/app/plugins")
  renderHook(() => useAppFrameNavigation({ ...options, standaloneSurface: true }))
  expect(window.location.pathname + window.location.search).toBe("/app/plugins")
})

it("a catalog is not replaced by conversation hydration or its failure", () => {
  window.history.replaceState(null, "", "/app/library?conversation=conv-old")
  const view = renderHook(({ hydrating, machinePhase }) => useAppFrameNavigation({
    ...options, standaloneSurface: true, hydrating, machinePhase,
  }), { initialProps: { hydrating: true, machinePhase: "idle" as "idle" | "error" } })
  expect(view.result.current.conversationHydrating).toBe(false)
  view.rerender({ hydrating: false, machinePhase: "error" })
  expect(view.result.current.conversationHydrationFailed).toBe(false)
})

it("a bare direct homepage is not owned or redirected by the remembered conversation", () => {
  window.history.replaceState(null, "", "/app")
  const view = renderHook(() => useAppFrameNavigation(options))
  expect(window.location.pathname + window.location.search).toBe("/app")
  expect(view.result.current.routeOwnsConversation).toBe(false)
})

it.each([false, true])("a missing explicit conversation stays an error on its own URL (project=%s)", async (project) => {
  const path = project ? "/app/project/project-missing" : "/app"
  window.history.replaceState(null, "", `${path}?conversation=${options.activeId}`)
  const view = renderHook(() => useAppFrameNavigation({ ...options,
    scope: project ? { kind: "project", projectRef: "project-missing" } : options.scope,
    projectWorkspace: project, projectRef: project ? "project-missing" : undefined,
    threadMessageCount: 0, ...{ missingSessionId: options.activeId },
  }))
  await act(async () => {})
  expect(view.result.current.conversationHydrationFailed).toBe(true)
  expect(view.result.current.conversationHydrating).toBe(false)
  expect(window.location.pathname + window.location.search).toBe(`${path}?conversation=${options.activeId}`)
})

it("a missing cached session does not turn the project overview or a local new draft into a deep-link error", () => {
  window.history.replaceState(null, "", "/app/project/project-missing")
  const view = renderHook(() => useAppFrameNavigation({ ...options,
    scope: { kind: "project", projectRef: "project-missing" }, projectWorkspace: true,
    projectRef: "project-missing", threadMessageCount: 0, ...{ missingSessionId: options.activeId },
  }))
  expect(view.result.current.conversationHydrationFailed).toBe(false)
  expect(view.result.current.conversationHydrating).toBe(false)
})

it.each([
  ["/app", "/app/project/project-next"],
  ["/app", "/app/project/project-next?conversation=conv-next"],
  ["/app/project/project-current", "/app?conversation=conv-next"],
  ["/app/project/project-current", "/app/project/project-next?conversation=conv-next"],
])("history from %s to %s never commands the departing scope", (source, destination) => {
  window.history.replaceState(null, "", `${source}?conversation=conv-current`)
  const engine = createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<ConversationStore>(null) })
  engine.newConversation()
  const open = vi.spyOn(engine, "openConversation").mockImplementation(() => {})
  const create = vi.spyOn(engine, "newConversation").mockImplementation(() => {})
  const project = source.includes("/project/")
  renderHook(() => useAppFrameNavigation({ ...options, engine, activeId: "conv-current",
    scope: project ? { kind: "project", projectRef: "project-current" } : options.scope,
    projectWorkspace: project, projectRef: project ? "project-current" : undefined,
  }))
  open.mockClear()
  act(() => {
    window.history.replaceState(null, "", destination)
    window.dispatchEvent(new PopStateEvent("popstate"))
  })
  expect(create).not.toHaveBeenCalled()
  expect(open).not.toHaveBeenCalled()
  expect(window.location.pathname + window.location.search).toBe(destination)
  engine.dispose()
})

it.each(["/app", "/app/project/project-new?conversation=conv-project-new"])(
  "leaving a catalog for %s never restores the catalog's stale conversation query",
  (destination) => {
    window.history.replaceState(null, "", "/app/library?conversation=conv-catalog-old")
    const engine = createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<ConversationStore>(null), now: () => 1000 })
    const open = vi.spyOn(engine, "openConversation").mockImplementation(() => {})
    const view = renderHook(({ standaloneSurface }) => useAppFrameNavigation({
      ...options, engine, standaloneSurface,
      scope: window.location.pathname.includes("/project/") ? { kind: "project", projectRef: "project-new" } : options.scope,
      projectWorkspace: window.location.pathname.includes("/project/"),
      projectRef: window.location.pathname.includes("/project/") ? "project-new" : undefined,
    }), { initialProps: { standaloneSurface: true } })
    window.history.replaceState(null, "", destination)
    view.rerender({ standaloneSurface: false })
    expect(open).not.toHaveBeenCalledWith("conv-catalog-old")
    if (destination.includes("/project/")) expect(open).toHaveBeenCalledWith("conv-project-new")
    engine.dispose()
  },
)

 it("an explicit same-ID URL still asks the owner even when a local draft was restored", async () => {
  const client = createFakeClient()
  const storage = createMemoryStorage<ConversationStore>({ activeId: "conv_local_draft", conversations: [{ id: "conv_local_draft", title: "", updatedAt: 1, mode: "fast", localDraft: true }] })
  const engine = createSessionEngine({ client, storage, draftLifecycle: { isUnsubmitted: () => true, retire: () => true } })
  expect(client.snapshotCalls).toEqual([])
  window.history.replaceState(null, "", "/app?conversation=conv_local_draft")
  renderHook(() => useAppFrameNavigation({ ...options, engine, activeId: "conv_local_draft", threadMessageCount: 0 }))
  await act(async () => {})
  expect(client.snapshotCalls).toEqual(["conv_local_draft"])
  expect(engine.getSnapshot().missingSessionId).toBe("conv_local_draft")
  expect(client.createCalls).toEqual([])
  engine.dispose()
 })

it("late hydration of a cached failed thread cannot claim the bare homepage or publish its id", () => {
  window.history.replaceState(null, "", "/app")
  const view = renderHook(({ count }) => useAppFrameNavigation({ ...options, threadMessageCount: count }), { initialProps: { count: 0 } })
  view.rerender({ count: 2 })
  expect(window.location.pathname + window.location.search).toBe("/app")
  expect(view.result.current.routeOwnsConversation).toBe(false)
})
it("an explicit direct query id still owns its existing thread", () => {
  const suffix = "?conversation=conv-retained-direct"
  window.history.replaceState(null, "", `/app${suffix}`)
  const view = renderHook(() => useAppFrameNavigation(options))
  expect(view.result.current.routeOwnsConversation).toBe(true)
})

it("keeps the Forward URL when the router renders before App handles popstate", async () => {
  window.history.replaceState(null, "", "/app")
  const target = "conv-forward-owner"
  const draft = "conv-home-draft"
  const client = createFakeClient()
  client.nextSnapshot = () => Promise.resolve(makeSnapshot({ sessionId: target }))
  const storage = createMemoryStorage<ConversationStore>({
    activeId: draft,
    conversations: [
      { id: draft, title: "", mode: "fast", updatedAt: 2, localDraft: true },
      { id: target, title: "Original task", mode: "fast", updatedAt: 1 },
    ],
  })
  const engine = createSessionEngine({ client, storage, draftLifecycle: { isUnsubmitted: () => true, retire: () => true } })
  try {
    const view = renderHook(() => useAppFrameNavigation({ ...options, engine, activeId: draft }))
    // The browser moved to the original entry; an earlier router listener may
    // commit while our listener still has the old Home snapshot.
    window.history.replaceState(null, "", `/app?conversation=${target}`)
    await act(async () => { view.rerender() })
    expect(window.location.search).toBe(`?conversation=${target}`)
    await act(async () => { window.dispatchEvent(new PopStateEvent("popstate")); await settle() })
    expect(client.snapshotCalls).toEqual([target])
    expect(engine.getSnapshot().store?.activeId).toBe(target)
    expect(client.controlCalls).toEqual([])
  } finally { engine.dispose() }
})

it.each(["owner-forbidden", "external-index-removal"] as const)("leaves the routed task only after it was removed from this view (%s)", async reason => {
  const target = "conv-routed"
  window.history.replaceState(null, "", `/app?conversation=${target}`)
  const client = createFakeClient()
  client.nextSnapshot = id => reason === "owner-forbidden"
    ? Promise.reject(new SessionClientError("http", "session_forbidden"))
    : Promise.resolve(makeSnapshot({ sessionId: id }))
  const storage = createMemoryStorage<ConversationStore>(null)
  const engine = createSessionEngine({ client, storage })
  try {
    const view = renderHook(() => {
      const { store, hydrating, removedConversationId } = useSyncExternalStore(engine.subscribe, engine.getSnapshot)
      return useAppFrameNavigation({ ...options, engine, activeId: store?.activeId ?? null, hydrating,
        ...(removedConversationId === undefined ? {} : { removedConversationId }),
      })
    })
    await act(async () => { await settle() })
    if (reason === "external-index-removal") {
      expect(window.location.search).toBe(`?conversation=${target}`)
      await act(async () => {
        storage.write({ activeId: "conv-other", conversations: [{ id: "conv-other", title: "Other task", mode: "fast", updatedAt: 2 }] })
        await settle()
      })
      expect(client.snapshotCalls).toEqual([target, "conv-other"])
    } else expect(client.snapshotCalls).toEqual([target])
    expect(window.location.pathname + window.location.search).toBe("/app")
    expect(engine.getSnapshot().store?.conversations.map(({ id }) => id)).not.toContain(target)
    if (reason === "external-index-removal") {
      // The previous cleanup must not mask a later owner deletion.
      await act(async () => { view.result.current.syncConversationUrl("conv-other", "push") })
      expect(window.location.search).toBe("?conversation=conv-other")
      await act(async () => { expect(await engine.deleteConversation("conv-other")).toBe(true); await settle() })
      expect(window.location.search).toBe("")
      expect(client.deleteCalls).toEqual(["conv-other"])
    }
  } finally { engine.dispose() }
})

it.each(["unknown", "late-ack", "late-rejection", "accepted"] as const)(
  "direct browser Back preserves owner/recovery state, and Forward reopens the original session (%s)",
  async outcome => {
    const client = createFakeClient()
    const recovery = createBrowserSubmissionRecovery({
      subject: "a01-history-subject", scope: options.scope, isCurrent: () => true, storage: () => window.sessionStorage,
    })
    const engine = createSessionEngine({
      client, storage: createMemoryStorage<ConversationStore>(null), submissionRecovery: recovery,
      draftLifecycle: { isUnsubmitted: () => true, retire: () => true },
    })
    const accepted = makeReceipt("run_a01_history")
    let journal: string | undefined
    let resolveLate: ((receipt: ReturnType<typeof makeReceipt>) => void) | undefined
    let rejectLate: ((error: SessionClientError) => void) | undefined
    client.nextCreate = outcome === "unknown" ? () => Promise.reject(Error("connection closed after dispatch"))
      : outcome === "late-ack" || outcome === "late-rejection"
        ? () => new Promise((resolve, reject) => { resolveLate = resolve; rejectLate = reject })
      : () => Promise.resolve(accepted)
    const move = async (delta: number) => {
      await act(async () => {
        const popped = new Promise<void>(resolve => window.addEventListener("popstate", () => resolve(), { once: true }))
        window.history.go(delta)
        await popped
      })
    }
    try {
      window.history.replaceState(null, "", "/app")
      expect(engine.submit("first owner command")).toBe(true)
      const sid = engine.getSnapshot().store!.activeId
      journal = `${SUBMISSION_RECOVERY_PREFIX}a01-history-subject:direct:${encodeURIComponent(sid)}`
      const first = client.createCalls[0]
      if (!first) throw new Error("missing initial Message command")
      const original = structuredClone(first)
      expect(original.sessionId).toBe(sid)
      window.history.pushState(null, "", `/app?conversation=${sid}`)
      renderHook(() => useAppFrameNavigation({ ...options, engine, activeId: sid }))
      await act(async () => { await settle() })
      const before = window.sessionStorage.getItem(journal)
      expect(JSON.parse(before!).state).toBe(outcome === "accepted" ? "acknowledged" : "pending")
      await move(-1)
      expect(window.location.pathname + window.location.search).toBe("/app")
      const home = engine.getSnapshot()
      expect(home.store?.activeId).not.toBe(sid)
      expect(home.locallyCreatedSessionId).toBe(home.store?.activeId)
      expect(client.snapshotCalls).toEqual([])
      if (outcome === "late-ack") {
        await act(async () => { resolveLate!(accepted); await settle() })
        expect(client.controlCalls).toEqual([])
        expect(JSON.parse(window.sessionStorage.getItem(journal)!).state).toBe("acknowledged")
      } else if (outcome === "late-rejection") {
        await act(async () => { rejectLate!(new SessionClientError("http", "Not enough credits", "insufficient_credits", 402)); await settle() })
        expect(engine.getSnapshot().machine.error).toBeNull()
      } else if (outcome === "accepted") {
        expect(client.controlCalls).toEqual([])
        expect(window.sessionStorage.getItem(journal)).toBe(before)
      } else {
        expect(window.sessionStorage.getItem(journal)).toBe(before)
      }
      expect(client.createCalls).toEqual([original])
      expect(engine.getSnapshot().thread.messages).toEqual([])
      if (outcome === "late-ack" || outcome === "accepted") {
        client.nextSnapshot = () => Promise.resolve(makeSnapshot({
          sessionId: sid, activeRun: { run_id: accepted.run_id, status: "running" },
          messages: [{ message_id: accepted.user_message_id, role: "user", content: "first owner command",
            status: "completed", created_at: "2026-07-02T00:00:00Z" }],
        }))
      }
      await move(1)
      await act(async () => { await settle() })
      expect(window.location.search).toBe(`?conversation=${sid}`)
      expect(engine.getSnapshot().store?.activeId).toBe(sid)
      expect(client.createCalls).toEqual([original])
      expect(client.snapshotCalls).toEqual([sid])
      if (outcome === "unknown") {
        expect(engine.getSnapshot().canRetryPendingSubmission).toBe(true)
        client.nextCreate = () => Promise.resolve(accepted)
        await act(async () => { engine.retry(); await settle() })
        expect(client.createCalls).toEqual([original, original])
      } else if (outcome === "late-rejection") {
        expect(engine.getSnapshot().machine.error).toBe("insufficient_credits")
      } else {
        expect(engine.getSnapshot().machine.runId).toBe(accepted.run_id)
        expect(engine.getSnapshot().thread.messages.map(message => message.id)).toContain(accepted.user_message_id)
      }
      expect(client.controlCalls).toEqual([])
    } finally {
      engine.dispose()
      if (journal) window.sessionStorage.removeItem(journal)
    }
  },
)
