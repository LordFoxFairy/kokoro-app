import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { useAppFrameNavigation } from "@/components/blocks/app-frame/use-app-frame-navigation"
import { createSessionEngine } from "@/engine/machine"
import type { ConversationStore } from "@/core/conversations"
import { createFakeClient, createMemoryStorage } from "../engine/fakes"

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

it("direct chat still restores its shareable conversation URL", () => {
  window.history.replaceState(null, "", "/app")
  renderHook(() => useAppFrameNavigation(options))
  expect(window.location.search).toBe("?conversation=conv-retained-direct")
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
