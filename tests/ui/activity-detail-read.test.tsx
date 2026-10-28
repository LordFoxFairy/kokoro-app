import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { useRunDisplay } from "@/ui/thread/use-run-display"
import type { AnswerActionBoundary } from "@/ui/thread/answer-action-scope"
const facts = { run_id: "run", display_skills: [], tool_paths: [], activity_details: [], tool_facts: [] }
afterEach(cleanup)
it("only refreshes an inspected live Run once when its real terminal arrives", async () => {
  const readDisplay = vi.fn().mockResolvedValue(facts)
  const boundary = { sessionId: "s", client: { readDisplay }, isCurrent: () => true } as unknown as AnswerActionBoundary
  const { result, rerender } = renderHook(({ terminal }) => useRunDisplay(boundary, "run", terminal), { initialProps: { terminal: false } })
  expect(readDisplay).not.toHaveBeenCalled()
  act(() => result.current.inspect())
  await waitFor(() => expect(result.current.facts).toEqual(facts))
  rerender({ terminal: true })
  await waitFor(() => expect(readDisplay).toHaveBeenCalledTimes(2))
  rerender({ terminal: true }); act(() => result.current.inspect())
  expect(readDisplay).toHaveBeenCalledTimes(2)
})
it("retired admission rejects an old response even before another read completes", async () => {
  let finish!: (value: typeof facts) => void
  const readDisplay = vi.fn(() => new Promise<typeof facts>(resolve => { finish = resolve }))
  const boundary = { sessionId: "s", readEpoch: {}, client: { readDisplay }, isCurrent: () => true } as unknown as AnswerActionBoundary
  const { result, rerender } = renderHook(() => useRunDisplay(boundary, "run"))
  act(() => result.current.inspect())
  boundary.readEpoch = {}; rerender()
  await act(async () => finish(facts))
  expect(result.current.facts).toBeNull()
})
it("shares one scope/Run read and one terminal refresh between timeline and selected Canvas", async () => {
  const readDisplay = vi.fn().mockResolvedValue(facts)
  const boundary = { sessionId: "shared", readEpoch: {}, client: { readDisplay }, isCurrent: () => true } as unknown as AnswerActionBoundary
  const { result, rerender } = renderHook(({ terminal }) => ({ timeline: useRunDisplay(boundary, "run", terminal), canvas: useRunDisplay(boundary, "run", terminal) }), { initialProps: { terminal: false } })
  act(() => { result.current.timeline.inspect(); result.current.canvas.inspect() })
  await waitFor(() => expect(result.current.canvas.facts).toEqual(facts))
  expect(readDisplay).toHaveBeenCalledTimes(1)
  rerender({ terminal: true })
  await waitFor(() => expect(readDisplay).toHaveBeenCalledTimes(2))
})
it("a completed Run that has not been inspected never triggers a background detail read", async () => {
  const readDisplay = vi.fn().mockResolvedValue(facts)
  const boundary = { sessionId: "idle", client: { readDisplay }, isCurrent: () => true } as unknown as AnswerActionBoundary
  const { rerender } = renderHook(({ terminal }) => useRunDisplay(boundary, "run", terminal), { initialProps: { terminal: false } })
  rerender({ terminal: true })
  await act(async () => {})
  expect(readDisplay).not.toHaveBeenCalled()
})
it("keeps known action content during loading, distinguishing missing owner facts from read failure", async () => {
  const { render, screen } = await import("@testing-library/react")
  const { ActivityInspector } = await import("@/ui/thread/activity-inspector")
  const { LocaleProvider } = await import("@/i18n/context")
  let finish!: (value: typeof facts) => void
  const readDisplay = vi.fn(() => new Promise<typeof facts>(resolve => { finish = resolve }))
  const boundary = { actorId: "actor", sessionId: "s", client: { readDisplay }, isCurrent: () => true } as unknown as AnswerActionBoundary
  const content = { kind: "activity" as const, runId: "run", activityId: "a", subject: "actor", generation: 1, terminal: true, activity: { activity: "tool" as const, activity_id: "a", segment_id: "s", display_code: "tool.mcp.call" as const, status: "running" as const, display_detail: { kind: "mcp_tool" as const, name: "actual_tool" } } }
  render(<LocaleProvider><ActivityInspector content={content} boundary={boundary} /></LocaleProvider>)
  await waitFor(() => expect(readDisplay).toHaveBeenCalledTimes(1))
  expect(screen.getByText("actual_tool")).toBeVisible()
  expect(screen.queryByText("Details were not provided in this record.")).toBeNull()
  await act(async () => finish(facts))
  expect(screen.getByText("Details were not provided in this record.")).toBeVisible()
})
it("a terminal notification never retries a previously failed detail read", async () => {
  const readDisplay = vi.fn().mockRejectedValue(new Error("429 retry-after"))
  const boundary = { sessionId: "rate-limited", client: { readDisplay }, isCurrent: () => true } as unknown as AnswerActionBoundary
  const { result, rerender } = renderHook(({ terminal }) => useRunDisplay(boundary, "run", terminal), { initialProps: { terminal: false } })
  act(() => result.current.inspect())
  await waitFor(() => expect(result.current.phase).toBe("error"))
  rerender({ terminal: true })
  await act(async () => {})
  expect(readDisplay).toHaveBeenCalledTimes(1)
})

it("visible demand and Canvas inspection share one request, and remount resumes only a cancelled read", async () => {
  const readDisplay = vi.fn().mockImplementationOnce((_input, signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled"))))).mockResolvedValue(facts)
  const boundary = { sessionId: "cancel-visible", client: { readDisplay }, isCurrent: () => true } as unknown as AnswerActionBoundary
  const first = renderHook(() => useRunDisplay(boundary, "run"))
  act(() => { first.result.current.ensureRead(); first.result.current.inspect() })
  expect(readDisplay).toHaveBeenCalledTimes(1)
  first.unmount()
  const second = renderHook(() => useRunDisplay(boundary, "run"))
  act(() => second.result.current.ensureRead())
  await waitFor(() => expect(second.result.current.facts).toEqual(facts))
  expect(readDisplay).toHaveBeenCalledTimes(2)
  act(() => second.result.current.ensureRead())
  expect(readDisplay).toHaveBeenCalledTimes(2)
})
