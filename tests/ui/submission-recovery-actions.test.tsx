import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { useAppFrameActions } from "@/components/blocks/app-frame/use-app-frame-actions"
import type { ReactNode } from "react"
import { LocaleProvider } from "@/i18n/context"
import { createSessionEngine } from "@/engine/machine"
import { createBrowserSubmissionRecovery } from "@/ui/shell/browser-submission-recovery"
import type { ConversationStore } from "@/core/conversations"
import { createFakeClient, createMemoryStorage } from "../engine/fakes"

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.sessionStorage.clear(); window.history.replaceState(null, "", "/app") })

it("failed pending retirement leaves the route and creation intent intact on global New", () => {
  const client = createFakeClient()
  client.nextCreate = () => new Promise(() => undefined)
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(), submissionRecovery: createBrowserSubmissionRecovery({ subject: "alice", scope: { kind: "direct" }, isCurrent: () => true, storage: () => window.sessionStorage }) })
  engine.newConversation(); engine.submit("original")
  const id = engine.getSnapshot().store?.activeId ?? null
  window.history.replaceState(null, "", `/app?conversation=${id}`)
  const sync = vi.fn(), setRoute = vi.fn(), setIntent = vi.fn()
  const hook = renderHook(() => useAppFrameActions({ engine, preview: true, projectWorkspace: false, standaloneSurface: false, chatHref: "/app", activeId: id,
    draft: "keep draft", clearDraft: vi.fn(), updateDraft: vi.fn(), setDeploymentIntent: setIntent,
    syncConversationUrl: sync, setConversationRouteId: setRoute, focusComposer: vi.fn(), closeSettings: vi.fn(), brandName: undefined, commandNewChatTimerRef: { current: null } }), { wrapper: ({ children }: { children: ReactNode }) => <LocaleProvider>{children}</LocaleProvider> })
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError") })
  act(() => hook.result.current.startNewChatWithUrl())
  expect(engine.getSnapshot().store?.activeId).toBe(id)
  expect(sync).not.toHaveBeenCalled()
  expect(setRoute).not.toHaveBeenCalled()
  expect(setIntent).not.toHaveBeenCalled()
  engine.dispose()
})
