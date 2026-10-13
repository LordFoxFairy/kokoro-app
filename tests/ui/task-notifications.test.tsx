import { StrictMode } from "react"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import { createSessionEngine } from "@/engine/machine"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import type { SessionEngine } from "@/engine/engine-types"
import { useTaskNotifications } from "@/ui/shell/use-task-notifications"
import { DEFAULT_COMMUNICATION_PREFERENCES, writeCommunicationPreferences } from "@/ui/notifications/communication-preferences"
import { createFakeClient, createMemoryStorage, makeReceipt, settle } from "../engine/fakes"
import { AGENT_FAILURE_PROFILES, makeSnapshot, makeAgentFailureEvent, makeDispatchFailureEvent, makeEvent, makeInteractionState, resetFixtureSeq } from "../core/fixtures"
import { addConversation } from "@/core/conversations"
import type { ConversationStore } from "@/core/conversations"
const audio = vi.hoisted(() => ({ play: vi.fn(), retire: vi.fn() }))
vi.mock("@/ui/notifications/task-completion-sound", () => ({ playTaskCompletionSound: audio.play, retireCompletionSound: audio.retire }))
let engine: SessionEngine
let client: ReturnType<typeof createFakeClient>
let close: ReturnType<typeof vi.fn>
let construct: ReturnType<typeof vi.fn>
const boundary = { admitted: true, subject: "notification-subject", generation: 1 }
function Harness({ readBoundary = boundary, preview = false }: { readBoundary?: ProjectReadBoundary; preview?: boolean }) { useTaskNotifications(engine, preview, readBoundary); return null }
function view(readBoundary: ProjectReadBoundary = boundary, preview = false) { return <LocaleProvider><Harness readBoundary={readBoundary} preview={preview} /></LocaleProvider> }
function event(kind: "completed" | "cancelled") { return makeEvent("run.completed", { status: kind }, { session_id: "conv_1" }) }
beforeEach(() => {
  resetFixtureSeq(); audio.play.mockClear(); audio.retire.mockClear(); localStorage.clear()
  client = createFakeClient(); let id = 0
  engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(null), createId: (prefix) => `${prefix}_${++id}` })
  close = vi.fn(); construct = vi.fn(function NotificationFixture() { return { close, onclose: null } })
  Object.defineProperties(construct, { permission: { value: "granted" }, requestPermission: { value: vi.fn() } })
  vi.stubGlobal("Notification", construct)
  vi.spyOn(document, "hasFocus").mockReturnValue(false)
  writeCommunicationPreferences({ ...DEFAULT_COMMUNICATION_PREFERENCES, browser_notifications: true, sound_notifications: true }, boundary.subject)
})
afterEach(() => { cleanup(); engine.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear() })
describe("admitted live task delivery", () => {
  it("subscribes to actual engine events and delivers waiting plus completion within one React batch", async () => {
    render(view()); engine.submit("observe live run"); await settle()
    await act(async () => { client.lastStream().emit([makeEvent("interaction.state", makeInteractionState("item", ["item"]), { session_id: "conv_1" }), event("completed")]); await settle() })
    expect(construct).toHaveBeenCalledTimes(2)
    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(engine.getSnapshot().machine.phase).toBe("idle")
  })
  it.each(["cancelled", "failed", "dispatch_failed"])("delivers no success notification or sound for %s", async (kind) => {
    render(view()); engine.submit("observe outcome"); await settle()
    const terminal = kind === "cancelled" ? event("cancelled") : kind === "failed" ? makeAgentFailureEvent(AGENT_FAILURE_PROFILES[0], { session_id: "conv_1" }) : makeDispatchFailureEvent("1", { session_id: "conv_1" })
    await act(async () => { client.lastStream().emit([terminal], ["agui_00000000000000000000000000000001"]); await settle() })
    expect(construct).not.toHaveBeenCalled(); expect(audio.play).not.toHaveBeenCalled()
  })
  it("does not deliver in focused visible page, or replay suppressed completion later", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true)
    render(view()); engine.submit("foreground"); await settle()
    const stream = client.lastStream()
    await act(async () => { stream.emit([event("completed")]); await settle() })
    vi.spyOn(document, "hasFocus").mockReturnValue(false)
    await act(async () => { stream.emit([event("completed")]); await settle() })
    expect(construct).not.toHaveBeenCalled(); expect(audio.play).not.toHaveBeenCalled()
  })
  it("preview and unadmitted boundaries never deliver, even with saved enabled preferences", async () => {
    const rendered = render(view(boundary, true)); engine.submit("preview"); await settle()
    await act(async () => { client.lastStream().emit([event("completed")]); await settle() })
    rendered.rerender(view({ ...boundary, admitted: false }))
    engine.submit("unadmitted"); await settle()
    await act(async () => { client.lastStream().emit([makeEvent("run.completed", { status: "completed" }, { session_id: "conv_1", run_id: "run_2" })]); await settle() })
    expect(construct).not.toHaveBeenCalled(); expect(audio.play).not.toHaveBeenCalled()
  })
  it("retires identity anchors, rejects old pending receipts, and closes owned notifications", async () => {
    const rendered = render(view()); engine.submit("first"); await settle()
    await act(async () => { client.lastStream().emit([event("completed")]); await settle() })
    expect(construct).toHaveBeenCalledTimes(1)
    let resolve!: (receipt: ReturnType<typeof makeReceipt>) => void
    client.nextCreate = () => new Promise((done) => { resolve = done })
    engine.submit("pending before new identity")
    const next = { ...boundary, subject: "other-subject", generation: 2 }
    writeCommunicationPreferences({ ...DEFAULT_COMMUNICATION_PREFERENCES, browser_notifications: true, sound_notifications: true }, next.subject)
    rendered.rerender(view(next)); expect(close).toHaveBeenCalledTimes(1)
    await act(async () => { resolve(makeReceipt("run_2")); await settle() })
    await act(async () => { client.lastStream().emit([makeEvent("run.completed", { status: "completed" }, { session_id: "conv_1", run_id: "run_2" })]); await settle() })
    expect(construct).toHaveBeenCalledTimes(1)
    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(audio.retire).toHaveBeenCalledWith(JSON.stringify([boundary.subject]))
  })
  it("handles browser delivery rejection without interrupting the actual engine", async () => {
    construct.mockImplementationOnce(() => { throw new Error("host rejected") })
    render(view()); engine.submit("completion"); await settle()
    await act(async () => { client.lastStream().emit([event("completed")]); await settle() })
    expect(engine.getSnapshot().machine.phase).toBe("idle")
    expect(audio.play).toHaveBeenCalledTimes(1)
  })
})

it("closes owned delivery and audio when leaving a session and rejects its old stream", async () => {
  render(view()); engine.submit("first"); await settle()
  const old = client.lastStream()
  await act(async () => { old.emit([makeEvent("interaction.state", makeInteractionState("item", ["item"]), { session_id: "conv_1" })]); await settle() })
  expect(construct).toHaveBeenCalledTimes(1)
  act(() => { engine.newConversation() })
  expect(close).toHaveBeenCalledTimes(1)
  expect(audio.retire).toHaveBeenCalledWith(JSON.stringify([boundary.subject]))
  await act(async () => { old.emit([event("completed")]); await settle() })
  expect(construct).toHaveBeenCalledTimes(1)
  expect(audio.play).not.toHaveBeenCalled()
})

it("keeps a qualified run and unlocked audio across same-subject read revalidation", async () => {
  const rendered = render(view()); engine.submit("long running task"); await settle()
  const stream = client.lastStream()
  rendered.rerender(view({ ...boundary, admitted: false, generation: 2 }))
  rendered.rerender(view({ ...boundary, admitted: true, generation: 2 }))
  await act(async () => { stream.emit([event("completed")]); await settle() })
  expect(construct).toHaveBeenCalledTimes(1)
  expect(audio.play).toHaveBeenCalledTimes(1)
  expect(audio.retire).not.toHaveBeenCalled()
})

it("drops completed signals while admission is closed without replaying them after same-subject recovery", async () => {
  const rendered = render(view()); engine.submit("during recheck"); await settle()
  const stream = client.lastStream()
  rendered.rerender(view({ ...boundary, admitted: false, generation: 2 }))
  await act(async () => { stream.emit([event("completed")]); await settle() })
  rendered.rerender(view({ ...boundary, admitted: true, generation: 2 }))
  await act(async () => { stream.emit([event("completed")]); await settle() })
  expect(construct).not.toHaveBeenCalled(); expect(audio.play).not.toHaveBeenCalled()
  expect(audio.retire).not.toHaveBeenCalled()
})

it("retires true logout and preview transitions despite keeping the same engine", async () => {
  const rendered = render(view()); engine.submit("before logout"); await settle()
  await act(async () => { client.lastStream().emit([makeEvent("interaction.state", makeInteractionState("item", ["item"]), { session_id: "conv_1" })]); await settle() })
  rendered.rerender(view({ admitted: false, subject: null, generation: 2 }))
  expect(close).toHaveBeenCalledTimes(1)
  expect(audio.retire).toHaveBeenCalledWith(JSON.stringify([boundary.subject]))
  rendered.rerender(view(boundary, true))
  await act(async () => { client.lastStream().emit([event("completed")]); await settle() })
  expect(construct).toHaveBeenCalledTimes(1); expect(audio.play).not.toHaveBeenCalled()
})

it("retires a page engine/scope replacement and cannot deliver old callbacks", async () => {
  const rendered = render(view()); engine.submit("old scope"); await settle()
  const previous = engine, stream = client.lastStream()
  await act(async () => { stream.emit([makeEvent("interaction.state", makeInteractionState("item", ["item"]), { session_id: "conv_1" })]); await settle() })
  engine = createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<ConversationStore>(null), scope: { kind: "project", projectRef: "different-scope" } })
  rendered.rerender(view())
  expect(close).toHaveBeenCalledTimes(1)
  expect(audio.retire).toHaveBeenCalledWith(JSON.stringify([boundary.subject]))
  await act(async () => { stream.emit([event("completed")]); await settle() })
  expect(construct).toHaveBeenCalledTimes(1); expect(audio.play).not.toHaveBeenCalled()
  previous.dispose()
})

it("preserves a new owner's already anchored head when subject and page engine swap together", async () => {
  const rendered = render(view()); const previous = engine
  const nextClient = createFakeClient()
  nextClient.nextSnapshot = async () => makeSnapshot({ sessionId: "next-session", activeRun: { run_id: "next-run", status: "running" }, eventWatermark: null })
  engine = createSessionEngine({ client: nextClient, storage: createMemoryStorage<ConversationStore>(addConversation(null, "next-session", 1)) })
  await settle()
  const nextBoundary = { admitted: true, subject: "next-owner", generation: 2 }
  writeCommunicationPreferences({ ...DEFAULT_COMMUNICATION_PREFERENCES, browser_notifications: true, sound_notifications: true }, nextBoundary.subject)
  rendered.rerender(view(nextBoundary))
  await act(async () => { nextClient.lastStream().emit([makeEvent("run.completed", { status: "completed" }, { session_id: "next-session", run_id: "next-run" })]); await settle() })
  expect(construct).toHaveBeenCalledTimes(1); expect(audio.play).toHaveBeenCalledTimes(1)
  previous.dispose()
})

it("StrictMode's temporary cleanup preserves an already qualified engine run", async () => {
  engine.submit("already qualified"); await settle()
  render(<StrictMode>{view()}</StrictMode>)
  await act(async () => { client.lastStream().emit([event("completed")]); await settle() })
  expect(construct).toHaveBeenCalledTimes(1); expect(audio.play).toHaveBeenCalledTimes(1)
})

it("true view unmount closes delivery and the engine owner's dispose retires event facts", async () => {
  const rendered = render(view()); engine.submit("owned engine"); await settle()
  const stream = client.lastStream(), observer = vi.fn()
  engine.subscribeTaskNotifications?.(observer)
  rendered.unmount(); engine.dispose()
  stream.emit([event("completed")]); await settle()
  expect(observer).not.toHaveBeenCalled()
  expect(construct).not.toHaveBeenCalled(); expect(audio.play).not.toHaveBeenCalled()
  expect(audio.retire).toHaveBeenCalledWith(JSON.stringify([boundary.subject]))
})
