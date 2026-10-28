import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { StrictMode } from "react"
import { LocaleProvider } from "@/i18n/context"
import { OwnerAnswerActions } from "@/ui/thread/owner-answer-actions"
import { canRegenerateAnswer, useAnswerActionScope, type AnswerActionBoundary } from "@/ui/thread/answer-action-scope"
import { SERVER_ENGINE_SNAPSHOT, type SessionEngine, type EngineSnapshot } from "@/engine/engine-types"
import { createSessionStreamState } from "@/core/state"
import { addConversation } from "@/core/conversations"
import { useRunDisplay } from "@/ui/thread/use-run-display"
import { overlayRunDisplay } from "@/ui/thread/run-display-overlay"
import type { RunProcessActivity } from "@/contract/chat"
afterEach(() => { cleanup(); localStorage.clear() })
function fixture() {
  let current = true
  const thread = { ...createSessionStreamState(), messages: [{ id: "segment", snapshotMessageId: "answer", role: "assistant" as const, runId: "run", content: "answer" }], runTerminalsById: { run: "completed" as const } }
  const snapshot: EngineSnapshot = { ...SERVER_ENGINE_SNAPSHOT, thread, ownerConfirmedSessionId: "session", store: addConversation(null, "session", 1) }
  const client = { readFeedback: vi.fn(async () => ({ session_id: "session", message_id: "answer", feedback: null })),
    setFeedback: vi.fn(async (_target: unknown, value: "up" | "down" | null) => ({ session_id: "session", message_id: "answer", feedback: value })),
    regenerate: vi.fn(), readDisplay: vi.fn(async (target: { sessionId: string; runId: string }, signal: AbortSignal) => { signal.throwIfAborted(); return { run_id: target.runId, display_skills: [], tool_facts: [], tool_paths: [] } }) }
  const regenerateAnswer = vi.fn(async (_input: { sourceMessageId: string; sourceRunId: string; key: string; signal: AbortSignal }) => ({ run_id: "new-run", assistant_message_id: "new-answer", user_message_id: "original-human", regenerated_from_message_id: _input.sourceMessageId }))
  const engine = { getSnapshot: () => snapshot, regenerateAnswer } as unknown as SessionEngine
  const boundary: AnswerActionBoundary = { actorId: "actor", sessionId: "session", scope: { kind: "direct" }, epoch: {}, client, engine, isCurrent: () => current, regenerations: new Set(), changed: () => {} }
  return { boundary, client, snapshot, regenerateAnswer, retire: () => { current = false } }
}
it("renders the four real owner-backed actions; reads/sets/clears actual feedback and admits a new attempt without a human echo", async () => {
  const f = fixture()
  render(<LocaleProvider><OwnerAnswerActions boundary={f.boundary} runId="run" messageId="answer" text="answer" /></LocaleProvider>)
  await waitFor(() => expect(screen.getByRole("button", { name: "Good response" })).toBeEnabled())
  expect(screen.getAllByRole("button").map(button => button.getAttribute("aria-label"))).toEqual(["Regenerate", "Copy response", "Good response", "Bad response"])
  fireEvent.click(screen.getByRole("button", { name: "Good response" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "true"))
  fireEvent.click(screen.getByRole("button", { name: "Good response" }))
  await waitFor(() => expect(f.client.setFeedback).toHaveBeenCalledTimes(2))
  expect(f.client.setFeedback.mock.calls.map(call => call[1])).toEqual(["up", null])
  fireEvent.click(screen.getByRole("button", { name: "Regenerate" }))
  await waitFor(() => expect(f.regenerateAnswer).toHaveBeenCalledTimes(1))
  expect(f.regenerateAnswer.mock.calls[0]?.[0]).toMatchObject({ sourceMessageId: "answer", sourceRunId: "run" })
  expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled()
  expect(f.snapshot.thread.messages).toHaveLength(1)
})
it("unknown feedback only offers an explicit read; unknown regeneration retries the same key even when a head now exists", async () => {
  const f = fixture()
  f.client.setFeedback.mockRejectedValueOnce(Error("ACK lost"))
  f.regenerateAnswer.mockRejectedValueOnce(Error("ACK lost"))
  render(<LocaleProvider><OwnerAnswerActions boundary={f.boundary} runId="run" messageId="answer" text="answer" /></LocaleProvider>)
  await waitFor(() => expect(screen.getByRole("button", { name: "Good response" })).toBeEnabled())
  fireEvent.click(screen.getByRole("button", { name: "Good response" }))
  const read = await screen.findByRole("button", { name: "Read feedback" })
  expect(screen.getByRole("button", { name: "Bad response" })).toBeDisabled()
  expect(f.client.setFeedback).toHaveBeenCalledTimes(1)
  fireEvent.click(read)
  await waitFor(() => expect(f.client.readFeedback).toHaveBeenCalledTimes(2))
  fireEvent.click(screen.getByRole("button", { name: "Regenerate" }))
  await screen.findByText(/Regeneration is unconfirmed/u)
  f.snapshot.thread.activeRunId = "new-head"
  fireEvent.click(screen.getByRole("button", { name: "Regenerate" }))
  await waitFor(() => expect(f.regenerateAnswer).toHaveBeenCalledTimes(2))
  const calls = f.regenerateAnswer.mock.calls as unknown as [{ key: string }][]
  expect(calls[1]?.[0].key).toBe(calls[0]?.[0].key)
})
it("retired actor blocks a late fact; no new intent is eligible from text completion, a user tail or pending submission", async () => {
  const f = fixture(), target = { actorId: "actor", sessionId: "session", scope: { kind: "direct" as const }, runId: "run", messageId: "answer" }
  expect(canRegenerateAnswer(f.boundary, target)).toBe(true)
  f.snapshot.thread.runTerminalsById = {}
  expect(canRegenerateAnswer(f.boundary, target)).toBe(false)
  f.snapshot.thread.runTerminalsById = { run: "completed" }
  f.snapshot.hasPendingSubmission = true
  expect(canRegenerateAnswer(f.boundary, target)).toBe(false)
  f.snapshot.hasPendingSubmission = false
  f.retire()
  expect(canRegenerateAnswer(f.boundary, target)).toBe(false)
})
it("retained old RAM in StrictMode is safe and does not fabricate a terminal from old completed text", () => {
  const f = fixture(); localStorage.setItem("kokoro.web.auth-index-subject", "actor")
  Reflect.deleteProperty(f.snapshot.thread, "runTerminalsById")
  Reflect.set(f.snapshot.thread, "cancelledRuns", {})
  const { result } = renderHook(() => useAnswerActionScope({ engine: f.boundary.engine, actorId: "actor", sessionId: "session", scope: f.boundary.scope, identity: "actor1", admitted: true, preview: false }), { wrapper: StrictMode })
  expect(result.current?.isCurrent()).toBe(true)
  expect(canRegenerateAnswer(result.current!, { actorId: "actor", sessionId: "session", scope: f.boundary.scope, runId: "run", messageId: "answer" })).toBe(false)
})
it("requests only one chosen original Run and retires late display facts without changing event order/status", async () => {
  const f = fixture(); let resolve!: (value: Awaited<ReturnType<typeof f.client.readDisplay>>) => void
  f.client.readDisplay.mockImplementation(() => new Promise(r => { resolve = r }))
  const { result, unmount } = renderHook(() => useRunDisplay(f.boundary, "run"), { wrapper: StrictMode })
  expect(f.client.readDisplay).toHaveBeenCalledTimes(0)
  act(() => { result.current.inspect(); result.current.inspect() })
  expect(f.client.readDisplay).toHaveBeenCalledTimes(1)
  unmount(); resolve({ run_id: "run", display_skills: [], tool_facts: [], tool_paths: [] }); await act(async () => {})
  expect(f.client.readDisplay.mock.calls[0]?.[1]?.aborted).toBe(true)
  const rows: RunProcessActivity[] = [{ activity: "tool", activity_id: "file", segment_id: "slot", status: "failed", display_code: "tool.file.read" },
    { activity: "tool", activity_id: "mcp", segment_id: "slot2", status: "completed", display_code: "tool.mcp.call" }]
  const overlaid = overlayRunDisplay(rows, { run_id: "run", display_skills: [], tool_facts: [], tool_paths: [{ activity_id: "file", virtual_path: "/workspace/a.txt" }, { activity_id: "mcp", virtual_path: "/workspace/not-mcp" }] })
  expect(overlaid.map(row => [row.activity_id, row.activity === "tool" ? row.status : ""])).toEqual([["file", "failed"], ["mcp", "completed"]])
  expect(overlaid[0]).toMatchObject({ display_detail: { virtual_path: "/workspace/a.txt", name: "a.txt" } })
  expect(overlaid[1]).toBe(rows[1])
  expect(rows[0]).not.toHaveProperty("display_detail")
})
it("an exact owner display response overlays only matching original ready Skills, leaving missing revisions unknown", () => {
  const activity: RunProcessActivity = { activity: "skill", activity_id: "skill", preflight_id: "preflight", source_refs: ["skill:original"], phase: "ready" }
  const facts = { run_id: "run", tool_facts: [], tool_paths: [], display_skills: [
    { source_ref: "skill:original", name: "actual native name", virtual_path: "/.skills/b3JpZ2luYWw/SKILL.md" },
    { source_ref: "skill:unrelated", name: "never borrowed", virtual_path: "/.skills/dW5yZWxhdGVk/SKILL.md", revision: "7" },
  ] }
  const ready = overlayRunDisplay([activity], facts)[0]
  expect(ready).toMatchObject({ display_skills: [{ name: "actual native name" }] })
  if (ready?.activity === "skill") expect(ready.display_skills?.[0]).not.toHaveProperty("revision")
  expect(overlayRunDisplay([{ ...activity, phase: "failed", error_code: "skill_load_failed" }], facts)[0]).not.toHaveProperty("display_skills")
  expect(activity).not.toHaveProperty("display_skills")
})
it("ordinary readonly/shared presentation without a private boundary has no pretend display or owner actions", async () => {
  const { AssistantTurn } = await import("@/ui/thread/assistant-turn")
  render(<LocaleProvider><AssistantTurn sessionId="session" steps={[{ kind: "text", seq: 1, segmentId: "segment" }]} messagesById={{ segment: { id: "segment", role: "assistant", runId: "run", content: "answer" } }}
    activities={[{ activity: "tool", activity_id: "file", segment_id: "segment", status: "completed", display_code: "tool.file.read" }]} isLive={false} stagedDecisions={{}} hitlActive={false} controlError={null} /></LocaleProvider>)
  expect(screen.queryByRole("button", { name: "Read activity details" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Copy response" })).toBeInTheDocument()
})
it("a new answer never borrows the old source unknown control; the old row alone keeps same-key recovery", async () => {
  const f = fixture()
  f.regenerateAnswer.mockRejectedValueOnce(Error("ACK lost"))
  const view = (second: boolean) => <LocaleProvider><div data-testid="old"><OwnerAnswerActions boundary={f.boundary} runId="run" messageId="answer" text="old" /></div>
    {second ? <div data-testid="new"><OwnerAnswerActions boundary={f.boundary} runId="new-run" messageId="new-answer" text="new" /></div> : null}</LocaleProvider>
  const { rerender } = render(view(false))
  fireEvent.click(screen.getByRole("button", { name: "Regenerate" }))
  await screen.findByText(/Regeneration is unconfirmed/u)
  f.snapshot.thread.messages.push({ id: "new", snapshotMessageId: "new-answer", role: "assistant", runId: "new-run", content: "new" })
  f.snapshot.thread.runTerminalsById["new-run"] = "completed"
  rerender(view(true))
  const oldButton = screen.getByTestId("old").querySelector<HTMLButtonElement>('button[aria-label="Regenerate"]')!
  const newButton = screen.getByTestId("new").querySelector<HTMLButtonElement>('button[aria-label="Regenerate"]')!
  expect(oldButton).toBeEnabled()
  expect(newButton).toBeDisabled()
  expect(screen.getByTestId("new")).not.toHaveTextContent("unconfirmed")
  fireEvent.click(oldButton)
  await waitFor(() => expect(f.regenerateAnswer).toHaveBeenCalledTimes(2))
  expect(f.regenerateAnswer.mock.calls[1]?.[0].key).toBe(f.regenerateAnswer.mock.calls[0]?.[0].key)
  expect(f.regenerateAnswer.mock.calls[1]?.[0].sourceMessageId).toBe("answer")
})
it("a same-actor admission pause and generation refresh never discard an unknown regeneration key", async () => {
  const f = fixture(); localStorage.setItem("kokoro.web.auth-index-subject", "actor")
  f.regenerateAnswer.mockRejectedValueOnce(Error("ACK lost"))
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ session_id: "session", message_id: "answer", feedback: null }), { headers: { "content-type": "application/json", "cache-control": "private, no-store", "x-request-id": "read" } })))
  function Host({ admitted, identity }: { admitted: boolean; identity: string }) {
    const boundary = useAnswerActionScope({ engine: f.boundary.engine, actorId: "actor", sessionId: "session", scope: f.boundary.scope, identity, admitted, preview: false })
    return boundary ? <OwnerAnswerActions boundary={boundary} runId="run" messageId="answer" text="answer" /> : null
  }
  try {
    const { rerender } = render(<LocaleProvider><Host admitted identity="actor-1" /></LocaleProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }))
    await screen.findByText(/Regeneration is unconfirmed/u)
    rerender(<LocaleProvider><Host admitted={false} identity="actor-2" /></LocaleProvider>)
    if (screen.queryByRole("button", { name: "Regenerate" })) expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled()
    rerender(<LocaleProvider><Host admitted identity="actor-3" /></LocaleProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }))
    await waitFor(() => expect(f.regenerateAnswer).toHaveBeenCalledTimes(2))
    expect(f.regenerateAnswer.mock.calls[1]?.[0].key).toBe(f.regenerateAnswer.mock.calls[0]?.[0].key)
  } finally { vi.unstubAllGlobals() }
})
it("a paused in-flight regeneration becomes unknown, not stuck pending, and resumes only its original intent", async () => {
  const f = fixture(); localStorage.setItem("kokoro.web.auth-index-subject", "actor")
  let accept!: (fact: Awaited<ReturnType<typeof f.regenerateAnswer>>) => void
  f.regenerateAnswer.mockImplementationOnce(() => new Promise(resolve => { accept = resolve }))
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ session_id: "session", message_id: "answer", feedback: null }), { headers: { "content-type": "application/json", "cache-control": "private, no-store", "x-request-id": "read" } })))
  function Host({ admitted }: { admitted: boolean }) {
    const boundary = useAnswerActionScope({ engine: f.boundary.engine, actorId: "actor", sessionId: "session", scope: f.boundary.scope, identity: "same-actor", admitted, preview: false })
    return boundary ? <OwnerAnswerActions boundary={boundary} runId="run" messageId="answer" text="answer" /> : null
  }
  try {
    const { rerender } = render(<LocaleProvider><Host admitted /></LocaleProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }))
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled()
    rerender(<LocaleProvider><Host admitted={false} /></LocaleProvider>)
    expect(f.regenerateAnswer.mock.calls[0]?.[0].signal.aborted).toBe(true)
    rerender(<LocaleProvider><Host admitted /></LocaleProvider>)
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }))
    await waitFor(() => expect(f.regenerateAnswer).toHaveBeenCalledTimes(2))
    expect(f.regenerateAnswer.mock.calls[1]?.[0].key).toBe(f.regenerateAnswer.mock.calls[0]?.[0].key)
    accept({ run_id: "late-old", user_message_id: "human", assistant_message_id: "late-old-answer", regenerated_from_message_id: "answer" })
    await act(async () => {})
    expect(screen.queryByText(/Regeneration is unconfirmed/u)).not.toBeInTheDocument()
  } finally { vi.unstubAllGlobals() }
})
