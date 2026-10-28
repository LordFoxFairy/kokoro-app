import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import type { RunProcessActivity } from "@/contract/chat"
import { LocaleProvider } from "@/i18n/context"
import { AssistantTurn } from "@/ui/thread/assistant-turn"
import { SegmentProcess } from "@/ui/thread/segment-process"
afterEach(cleanup)
const tool = (id: string, code: "tool.mcp.discover" | "tool.mcp.describe" | "tool.mcp.call" | "tool.file.read"): RunProcessActivity => ({ activity: "tool", activity_id: id, segment_id: "segment", display_code: code, status: "completed" })

it("keeps preparation collapsed by default during live work, exposes original rows and counts real activities", () => {
  const activities = [tool("a", "tool.mcp.discover"), ...Array.from({ length: 9 }, (_, index) => tool(`description-${index}`, "tool.mcp.describe")), tool("call", "tool.mcp.call")]
  const { container } = render(<LocaleProvider><SegmentProcess segmentId="prep-live" activities={activities} live /></LocaleProvider>)
  const prep = screen.getByRole("button", { name: /Tool preparation \(10 items\)/u })
  expect(prep).toHaveAttribute("aria-expanded", "false")
  const content = container.querySelector('[data-preparation-group] [data-slot="collapsible-content"]')!
  expect(content).toHaveAttribute("aria-hidden", "true")
  expect(content.querySelector("[inert]")).not.toBeNull()
  expect(container.querySelector('[data-preparation-group]')).toHaveTextContent("Discover MCP tools")
  expect(screen.getByText("Call MCP tool")).toBeInTheDocument()
  const summary = screen.getAllByRole("button").find((button) => button !== prep)!
  expect(summary).toHaveTextContent("11 activities")
  expect(summary).not.toHaveTextContent("11 calls")
  act(() => prep.focus())
  expect(prep).toHaveFocus()
  expect(prep).toHaveAttribute("type", "button")
  fireEvent.click(prep)
  expect(prep).toHaveAttribute("aria-expanded", "true")
  expect(content).toHaveAttribute("aria-hidden", "false")
  expect(document.getElementById(prep.getAttribute("aria-controls")!)).toBe(content)
})
it("preserves the same preparation rows, disclosure and one continuation across live updates", () => {
  const one = tool("a", "tool.mcp.discover"), two = tool("b", "tool.mcp.describe")
  const { rerender } = render(<LocaleProvider><SegmentProcess segmentId="prep-update" activities={[one]} live continueProcessing /></LocaleProvider>)
  const button = screen.getByRole("button", { name: /Tool preparation/u })
  expect(screen.getAllByText("Continuing…")).toHaveLength(1)
  fireEvent.click(button)
  const row = screen.getByText("Discover MCP tools")
  rerender(<LocaleProvider><SegmentProcess segmentId="prep-update" activities={[one, two]} live continueProcessing /></LocaleProvider>)
  expect(screen.getByRole("button", { name: /Tool preparation \(2 items\)/u })).toBe(button)
  expect(button).toHaveAttribute("aria-expanded", "true")
  expect(screen.getByText("Discover MCP tools")).toBe(row)
  expect(screen.getAllByText("Continuing…")).toHaveLength(1)
  expect(within(document.getElementById(button.getAttribute("aria-controls")!)!).getAllByText(/^(Discover MCP tools|Describe MCP tool)$/u)).toHaveLength(2)
})

it("does not group preparation across a real public text segment", () => {
  const first = tool("text-a", "tool.mcp.discover"), second = tool("text-b", "tool.mcp.describe")
  const steps = [{ kind: "activity" as const, seq: 1, segmentId: "prep-a", activity: first }, { kind: "text" as const, seq: 2, segmentId: "answer" }, { kind: "activity" as const, seq: 3, segmentId: "prep-b", activity: second }]
  render(<LocaleProvider><AssistantTurn sessionId="text-boundary" steps={steps} messagesById={{ answer: { id: "answer", role: "assistant", runId: "run", content: "real text between preparations" } }} isLive stagedDecisions={{}} hitlActive={false} controlError={null} /></LocaleProvider>)
  expect(screen.getAllByRole("button", { name: /Tool preparation \(1 items\)/u })).toHaveLength(2)
  expect(screen.getByText("real text between preparations")).toBeInTheDocument()
})
it("counts the observed eight preparation and three execution activities without repeating generic MCP calls", () => {
  const preparation = [tool("discover", "tool.mcp.discover"), ...Array.from({ length: 7 }, (_, index) => ({ ...tool(`describe-${index}`, "tool.mcp.describe"), display_detail: { kind: "mcp_tool" as const, name: `public_selector_${index}` } }))]
  render(<LocaleProvider><SegmentProcess segmentId="real-eight-three" live activities={[...preparation, ...Array.from({ length: 3 }, (_, index) => ({ ...tool(`execution-${index}`, "tool.mcp.call"), display_detail: { kind: "mcp_tool" as const, name: `actual_call_${index}` } }))]} /></LocaleProvider>)
  const group = screen.getByRole("button", { name: /Tool preparation \(8 items\)/u })
  expect(group).toHaveAttribute("aria-expanded", "false")
  expect(screen.getAllByText("Call MCP tool")).toHaveLength(3)
  expect(screen.getAllByRole("button").some(button => button.textContent?.includes("11 activities"))).toBe(true)
  expect(screen.getByText("actual_call_0")).toBeVisible()
  fireEvent.click(group)
  for (let index = 0; index < 7; index++) expect(screen.getByText(`public_selector_${index}`)).toBeVisible()
})
