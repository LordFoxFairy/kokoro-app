import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { LocaleProvider } from "@/i18n/context"
import { createSessionEngine } from "@/engine/machine"
import type { SessionEngine } from "@/engine/machine"
import type { ConversationStore } from "@/core/conversations"
import { type AppFrameActionsOptions, useAppFrameActions } from "@/components/blocks/app-frame/use-app-frame-actions"
import { useDraft } from "@/ui/shell/use-draft"
import { createFakeClient, createMemoryStorage, settle } from "../engine/fakes"
const target = { connectionId: "exact-runtime-connection", name: "QA MCP" }
function show(engine: SessionEngine, options: Partial<AppFrameActionsOptions> = {}) {
  return renderHook((extra: Partial<AppFrameActionsOptions>) => useAppFrameActions({ engine, preview: false, readBoundary: { admitted: true, subject: "alice", generation: 1 },
    projectWorkspace: false, standaloneSurface: false, chatHref: "/app", activeId: engine.getSnapshot().store?.activeId ?? null,
    draft: "", clearDraft: vi.fn(), updateDraft: vi.fn(), setDeploymentIntent: vi.fn(), syncConversationUrl: vi.fn(),
    setConversationRouteId: vi.fn(), focusComposer: vi.fn(), closeSettings: vi.fn(), brandName: "Kokoro", commandNewChatTimerRef: { current: null }, ...extra }),
  { initialProps: options, wrapper: ({children}: {children: ReactNode}) => <LocaleProvider>{children}</LocaleProvider> })
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("kokoro.locale", "zh"); localStorage.setItem("kokoro.web.auth-index-subject", "alice"); history.replaceState(null, "", "/app#settings/connectors") })
afterEach(() => { cleanup(); vi.restoreAllMocks(); history.replaceState(null, "", "/app") })
it("seeds a fresh draft with the exact Connection selection without a message or Prepare request", () => {
  const client = createFakeClient(), engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>() })
  const hook = show(engine)
  let accepted: boolean | undefined
  act(() => { accepted = hook.result.current.startMcpTrial?.(target) })
  expect(accepted).toBe(true)
  expect(engine.getSnapshot().selectedMcpConnectionIds).toEqual([target.connectionId])
  expect(client.createCalls).toEqual([])
  const draft = renderHook(() => useDraft(engine.getSnapshot().store?.activeId ?? null, true))
  expect(draft.result.current.draft).toContain("QA MCP")
  expect(draft.result.current.draft).toContain("连接器")
  engine.dispose()
})
it("does not replace an unresolved original submission with a trial", () => {
  const client = createFakeClient(); client.nextCreate = () => new Promise(() => {})
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>() })
  engine.submit("original unknown")
  const original = JSON.stringify(client.createCalls[0]), id = engine.getSnapshot().store?.activeId
  const hook = show(engine)
  let accepted: boolean | undefined
  act(() => { accepted = hook.result.current.startMcpTrial?.(target) })
  expect(accepted).toBe(false)
  expect(engine.getSnapshot().store?.activeId).toBe(id)
  expect(JSON.stringify(client.createCalls[0])).toBe(original)
  expect(client.createCalls).toHaveLength(1)
  engine.dispose()
})

it("only explicit Send includes the trial's exact Connection in the original submission", () => {
  const client = createFakeClient(); client.nextCreate = () => new Promise(() => {})
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>() })
  const hook = show(engine)
  act(() => { expect(hook.result.current.startMcpTrial(target)).toBe(true) })
  expect(client.createCalls).toHaveLength(0)
  act(() => { expect(engine.submit("explicit user send")).toBe(true) })
  expect(client.createCalls[0]?.body).toMatchObject({ content: "explicit user send", selected_mcp_connection_ids: [target.connectionId] })
  engine.dispose()
})
it.each(["invalid-connection", "empty-name", "foreign-actor", "route-away-and-back", "actor-away-and-back"])("rejects a retired or invalid draft handoff: %s", reason => {
  const client = createFakeClient(), engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>() })
  const hook = show(engine), before = engine.getSnapshot().store?.activeId
  if (reason === "foreign-actor") localStorage.setItem("kokoro.web.auth-index-subject", "bob")
  if (reason === "route-away-and-back") {
    history.replaceState(null, "", "/app/skills")
    window.dispatchEvent(new Event("kokoro:surface-navigation"))
    history.replaceState(null, "", "/app#settings/connectors")
    window.dispatchEvent(new Event("popstate"))
  }
  if (reason === "actor-away-and-back") {
    localStorage.setItem("kokoro.web.auth-index-subject", "bob")
    window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-index-subject", oldValue: "alice", newValue: "bob", storageArea: localStorage }))
    localStorage.setItem("kokoro.web.auth-index-subject", "alice")
    window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-index-subject", oldValue: "bob", newValue: "alice", storageArea: localStorage }))
  }
  act(() => { expect(hook.result.current.startMcpTrial(reason === "invalid-connection" ? { ...target, connectionId: "bad id" } : reason === "empty-name" ? { ...target, name: "  " } : target)).toBe(false) })
  expect(engine.getSnapshot().store?.activeId).toBe(before)
  expect(engine.getSnapshot().selectedMcpConnectionIds).toEqual([])
  expect(client.createCalls).toHaveLength(0)
  engine.dispose()
})

it("does not reset an acknowledged active run for a trial", async () => {
  const client = createFakeClient(), engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>() })
  engine.submit("running original")
  await settle()
  const id = engine.getSnapshot().store?.activeId
  const original = JSON.stringify(client.createCalls)
  const hook = show(engine)
  act(() => { expect(hook.result.current.startMcpTrial(target)).toBe(false) })
  expect(engine.getSnapshot().store?.activeId).toBe(id)
  expect(JSON.stringify(client.createCalls)).toBe(original)
  expect(engine.getSnapshot().selectedMcpConnectionIds).toEqual([])
  engine.dispose()
})

it("project Settings trials keep the project scope and only send on explicit submission", () => {
  history.replaceState(null, "", "/app/project/project_trial#settings/connectors")
  const client = createFakeClient(); client.nextCreate = () => new Promise(() => {})
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(), scope: { kind: "project", projectRef: "project_trial" } })
  const hook = show(engine, { projectWorkspace: true, projectRef: "project_trial", routedConversationId: null })
  act(() => { expect(hook.result.current.startMcpTrial(target)).toBe(true) })
  expect(client.createCalls).toHaveLength(0)
  act(() => { expect(engine.submit("explicit project send")).toBe(true) })
  expect(client.createCalls[0]?.body).toMatchObject({ project_ref: "project_trial", selected_mcp_connection_ids: [target.connectionId] })
  engine.dispose()
})
it("rejects a retained dialog callback after a new admission generation", () => {
  const client = createFakeClient(), engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>() })
  const hook = show(engine), stale = hook.result.current.startMcpTrial
  hook.rerender({ readBoundary: { admitted: true, subject: "alice", generation: 2 } })
  act(() => { expect(stale(target)).toBe(false) })
  expect(client.createCalls).toHaveLength(0)
  expect(engine.getSnapshot().selectedMcpConnectionIds).toEqual([])
  engine.dispose()
})
it("refuses a trial if the browser actor marker cannot be read", () => {
  const client = createFakeClient(), engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>() })
  const hook = show(engine)
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError") })
  act(() => { expect(hook.result.current.startMcpTrial(target)).toBe(false) })
  expect(client.createCalls).toHaveLength(0)
  engine.dispose()
})
