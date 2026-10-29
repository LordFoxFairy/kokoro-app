import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import type { RunProcessActivity } from "@/contract/chat"
import { LocaleProvider } from "@/i18n/context"
import { AssistantTurn } from "@/ui/thread/assistant-turn"
import { SegmentProcess } from "@/ui/thread/segment-process"
afterEach(cleanup)
const tool = (id: string, code: "tool.mcp.discover" | "tool.mcp.describe" | "tool.mcp.call" | "tool.file.read"): RunProcessActivity => ({ activity: "tool", activity_id: id, segment_id: "segment", display_code: code, status: "completed" })

it("uses one disclosure for a mixed activity passage and keeps every operation in original order", () => {
  const inspect = vi.fn()
  const activities = [tool("a", "tool.mcp.discover"), tool("b", "tool.mcp.describe"), tool("c", "tool.mcp.call"), tool("d", "tool.file.read"), tool("e", "tool.mcp.describe")]
  const { container } = render(<LocaleProvider><SegmentProcess segmentId="mixed-flat" activities={activities} live onOpenActivity={inspect} /></LocaleProvider>)
  const toggles = screen.getAllByRole("button").filter(button => button.hasAttribute("aria-expanded"))
  expect(toggles).toHaveLength(1)
  expect(toggles[0]).toHaveTextContent("Tool information: 3 · Tool calls: 1 · File reads: 1")
  expect(screen.queryByText("Tool preparation")).toBeNull()
  const rows = [...container.querySelectorAll<HTMLButtonElement>("button[data-canvas-opener]")]
  rows.forEach(button => fireEvent.click(button))
  expect(inspect.mock.calls.map(([id]) => id)).toEqual(["a", "b", "c", "d", "e"])
  act(() => toggles[0]!.focus())
  expect(toggles[0]).toHaveFocus()
  fireEvent.click(toggles[0]!)
  expect(toggles[0]).toHaveAttribute("aria-expanded", "false")
  expect(container.querySelector("[inert]")).not.toBeNull()
})
it("keeps mounted operation identity and one continuation as live work grows", () => {
  const one = tool("a", "tool.mcp.discover"), two = tool("b", "tool.mcp.describe")
  const { rerender } = render(<LocaleProvider><SegmentProcess segmentId="flat-update" activities={[one]} live continueProcessing /></LocaleProvider>)
  const row = screen.getByText("List available tools")
  expect(screen.getAllByText("Continuing…")).toHaveLength(1)
  rerender(<LocaleProvider><SegmentProcess segmentId="flat-update" activities={[one, two]} live continueProcessing /></LocaleProvider>)
  expect(screen.getByText("List available tools")).toBe(row)
  expect(screen.getAllByText("Continuing…")).toHaveLength(1)
  const disclosure = screen.getByRole("button", { name: /Tool information: 2/u })
  fireEvent.click(disclosure)
  rerender(<LocaleProvider><SegmentProcess segmentId="flat-update" activities={[one, two, tool("c", "tool.mcp.call")]} live continueProcessing /></LocaleProvider>)
  expect(disclosure).toHaveAttribute("aria-expanded", "false")
})
it("keeps actual public text between separate activity passages", () => {
  const first = tool("text-a", "tool.mcp.discover"), second = tool("text-b", "tool.mcp.describe")
  const steps = [{ kind: "activity" as const, seq: 1, segmentId: "prep-a", activity: first }, { kind: "text" as const, seq: 2, segmentId: "answer" }, { kind: "activity" as const, seq: 3, segmentId: "prep-b", activity: second }]
  render(<LocaleProvider><AssistantTurn sessionId="text-boundary" steps={steps} messagesById={{ answer: { id: "answer", role: "assistant", runId: "run", content: "real text between preparations" } }} isLive stagedDecisions={{}} hitlActive={false} controlError={null} /></LocaleProvider>)
  const firstRow = screen.getByText("List available tools"), text = screen.getByText("real text between preparations"), secondRow = screen.getByText("Read tool description")
  expect(firstRow.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(text.compareDocumentPosition(secondRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})
it("does not repeat failed attempts in the summary or equate them with whole-turn failure", () => {
  const activities = [{ ...tool("a", "tool.mcp.describe"), status: "failed" as const }, { ...tool("b", "tool.mcp.call"), status: "failed" as const }, tool("c", "tool.mcp.call")]
  render(<LocaleProvider><SegmentProcess segmentId="failed-attempts" activities={activities} live /></LocaleProvider>)
  const disclosure = screen.getByRole("button", { name: "Tool information: 1 · Tool calls: 2" })
  expect(disclosure).not.toHaveTextContent(/failed/iu)
  expect(screen.getAllByText("Failed")).toHaveLength(2)
  expect(screen.queryByText("Recovered")).toBeNull()
})
it("keeps a focused single action visible when terminal history gains a late second action", async () => {
  const first = tool("focused-a", "tool.mcp.call"), second = tool("focused-b", "tool.file.read")
  const inspect = vi.fn(), read = vi.fn()
  const { rerender } = render(<LocaleProvider><SegmentProcess segmentId="late-focused-terminal" onInspect={read} live={false} activities={[first]} onOpenActivity={inspect} /></LocaleProvider>)
  const action = screen.getByRole("button", { name: /Call tool/u })
  await act(async () => { action.focus(); await Promise.resolve() })
  rerender(<LocaleProvider><SegmentProcess segmentId="late-focused-terminal" onInspect={read} live={false} activities={[first, second]} onOpenActivity={inspect} /></LocaleProvider>)
  expect(action).toHaveFocus()
  expect(action.closest("[inert]")).toBeNull()
  expect(read).not.toHaveBeenCalled()
  const disclosure = screen.getByRole("button", { name: "Tool calls: 1 · File reads: 1" })
  expect(disclosure).toHaveAttribute("aria-expanded", "true")
  fireEvent.click(disclosure)
  expect(disclosure).toHaveAttribute("aria-expanded", "false")
})
