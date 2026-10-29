import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import { AssistantTurn } from "@/ui/thread/assistant-turn"
import type { SessionMessage, SessionStep } from "@/core/state"
import type { RunProcessActivity } from "@/contract/chat"
afterEach(cleanup)
const activity: RunProcessActivity = { activity: "tool", activity_id: "a", segment_id: "tool", display_code: "tool.file.read", status: "completed" }
const steps: SessionStep[] = [{ kind: "text", seq: "1", segmentId: "stage" }, { kind: "activity", seq: "2", segmentId: "tools", activity }, { kind: "text", seq: "3", segmentId: "answer" }]
const messages: Record<string, SessionMessage> = {
  stage: { id: "stage", role: "assistant", runId: "run", content: "Inspecting the requested file", textState: "completed" },
  answer: { id: "answer", role: "assistant", runId: "run", content: "Final answer remains visible", textState: "completed" },
}
const props = { sessionId: "s", runId: "run", terminal: true, succeeded: true, finalSegmentId: "answer", finalPartsComplete: true, steps, messagesById: messages, isLive: false, stagedDecisions: {}, hitlActive: false, controlError: null }
it("collapses the whole finished process, not final text, and expands real interleaving", () => {
  const { container } = render(<LocaleProvider><AssistantTurn {...props} /></LocaleProvider>)
  const disclosure = screen.getByRole("button", { name: "Process" })
  expect(disclosure).toHaveAttribute("aria-expanded", "false")
  expect(screen.getByText("Final answer remains visible")).toBeVisible()
  expect(screen.getByText("Inspecting the requested file")).not.toBeVisible()
  fireEvent.click(disclosure)
  const stage = screen.getByText("Inspecting the requested file"), action = screen.getByText("Read file"), answer = screen.getByText("Final answer remains visible")
  expect(stage).toBeVisible()
  expect(stage.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(action.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(container.querySelectorAll('[data-whole-turn-process="ready"]')).toHaveLength(1)
  expect(screen.getAllByText("Final answer remains visible")).toHaveLength(1)
  fireEvent.click(disclosure)
  expect(stage.closest("[inert]")).not.toBeNull()
  expect(answer.closest("[inert]")).toBeNull()
})
it.each([{ succeeded: false }, { finalPartsComplete: false }, { isLive: true }, { hitlActive: true }, { finalSegmentId: "unknown" }])("does not hide text without final-read eligibility: %j", patch => {
  render(<LocaleProvider><AssistantTurn {...props} {...patch} /></LocaleProvider>)
  expect(screen.queryByRole("button", { name: "Process" })).toBeNull()
  expect(screen.getByText("Inspecting the requested file")).toBeVisible()
  expect(screen.getByText("Final answer remains visible")).toBeVisible()
})
it("does not hide focused work when a final page arrives, then settles after focus leaves", () => {
  const open = vi.fn()
  const { rerender } = render(<LocaleProvider><AssistantTurn {...props} finalPartsComplete={false} onOpenActivity={open} /></LocaleProvider>)
  const action = screen.getByRole("button", { name: /Read file/u })
  act(() => action.focus())
  rerender(<LocaleProvider><AssistantTurn {...props} onOpenActivity={open} /></LocaleProvider>)
  expect(action).toHaveFocus()
  expect(action.closest("[inert]")).toBeNull()
  expect(screen.queryByRole("button", { name: "Process" })).toBeNull()
  act(() => action.blur())
  expect(screen.getByRole("button", { name: "Process" })).toHaveAttribute("aria-expanded", "false")
})
it("keeps an inspected opener visible when completion arrives while Canvas owns focus", () => {
  const canvas = document.createElement("button")
  canvas.textContent = "Canvas close"
  document.body.append(canvas)
  const open = vi.fn(() => canvas.focus())
  const { rerender } = render(<LocaleProvider><AssistantTurn {...props} finalPartsComplete={false} onOpenActivity={open} /></LocaleProvider>)
  const opener = screen.getByRole("button", { name: /Read file/u })
  fireEvent.click(opener)
  expect(canvas).toHaveFocus()
  rerender(<LocaleProvider><AssistantTurn {...props} onOpenActivity={open} /></LocaleProvider>)
  expect(screen.getByRole("button", { name: "Process" })).toHaveAttribute("aria-expanded", "true")
  expect(opener).toBeVisible()
  act(() => opener.focus())
  expect(opener).toHaveFocus()
  expect(opener.closest("[inert]")).toBeNull()
  canvas.remove()
})
it("reads visible legacy final proof once and folds only after its exact parts revision is present", async () => {
  const callbacks = new Set<IntersectionObserverCallback>()
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe() { callbacks.add(this.callback) }
    disconnect() { callbacks.delete(this.callback) }
  })
  try {
    const readDisplay = vi.fn().mockResolvedValue({ run_id: "run", display_skills: [], tool_paths: [], activity_details: [], tool_facts: [], final_answer: { segment_id: "answer", revision: "8" } })
    const boundary = { sessionId: "s", isCurrent: () => true, client: { readDisplay } } as unknown as import("@/ui/thread/answer-action-scope").AnswerActionBoundary
    const part = { messageId: "container", runId: "run", revision: "8", confirmedRevision: "7", partIds: ["text:stage", "activity:a", "text:answer"], status: "complete" as const }
    const { finalSegmentId, ...legacyProps } = props
    void finalSegmentId
    const { rerender } = render(<LocaleProvider><AssistantTurn {...legacyProps} finalPartsComplete={false} parts={[part]} answerActionBoundary={boundary} /></LocaleProvider>)
    expect(readDisplay).not.toHaveBeenCalled()
    await act(async () => { for (const cb of callbacks) cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver) })
    expect(readDisplay).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("button", { name: "Process" })).toBeNull()
    rerender(<LocaleProvider><AssistantTurn {...legacyProps} finalPartsComplete={false} parts={[{ ...part, confirmedRevision: "8" }]} answerActionBoundary={boundary} /></LocaleProvider>)
    expect(screen.getByRole("button", { name: "Process" })).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByText("Final answer remains visible")).toBeVisible()
    expect(screen.getByText("Inspecting the requested file")).not.toBeVisible()
    expect(readDisplay).toHaveBeenCalledTimes(1)
    // Durable identity takes precedence, including when its body has not arrived.
    rerender(<LocaleProvider><AssistantTurn {...props} finalSegmentId="different" finalPartsComplete={false} parts={[{ ...part, confirmedRevision: "8" }]} answerActionBoundary={boundary} /></LocaleProvider>)
    expect(screen.queryByRole("button", { name: "Process" })).toBeNull()
  } finally { vi.unstubAllGlobals() }
})
it("requires one exact complete parts owner and does not manufacture a final from unknown or conflicting data", async () => {
  const { displayFinalSegmentId } = await import("@/ui/thread/completed-turn-sections")
  const facts = { run_id: "run", display_skills: [], tool_paths: [], activity_details: [], tool_facts: [], final_answer: { segment_id: "answer", revision: "8" } }
  const part = { messageId: "container", runId: "run", revision: "8", confirmedRevision: "8", partIds: ["text:answer"], status: "complete" as const }
  expect(displayFinalSegmentId(facts, "run", [part])).toBe("answer")
  for (const parts of [[], [part, part], [{ ...part, status: "partial" as const }], [{ ...part, confirmedRevision: "7" }], [{ ...part, partIds: ["text:other"] }], [{ ...part, finalSegmentId: "other" }]]) {
    expect(displayFinalSegmentId(facts, "run", parts)).toBeUndefined()
  }
  expect(displayFinalSegmentId(facts, "other", [part])).toBeUndefined()
  expect(displayFinalSegmentId(null, "run", [part])).toBeUndefined()
})
