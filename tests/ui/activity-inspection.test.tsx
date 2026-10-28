import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import { SegmentProcess } from "@/ui/thread/segment-process"
import { ToolCallRow } from "@/ui/thread/tool-call-row"
import { resolveCanvasContent, resetCanvasStore } from "@/ui/canvas/canvas-store"
import { createSessionStreamState } from "@/core/state"
const activity = { activity: "tool" as const, activity_id: "a", segment_id: "segment", display_code: "tool.mcp.call" as const, status: "completed" as const, display_detail: { kind: "mcp_tool" as const, name: "ask_wiki_question" } }
afterEach(() => { cleanup(); resetCanvasStore() })
it("uses one quiet process disclosure rather than a category and count wall", () => {
  render(<LocaleProvider><SegmentProcess segmentId="new-summary" activities={[activity, { ...activity, activity_id: "b" }]} live={false} /></LocaleProvider>)
  expect(screen.getByRole("button", { name: "Tool calls: 2" })).toHaveAttribute("aria-expanded", "false")
  expect(screen.queryByText(/2 calls/)).toBeNull()
})
it("opens the exact action from a keyboard-focusable target without treating its name as a URL", () => {
  const onInspect = vi.fn()
  render(<LocaleProvider><ToolCallRow activity={activity} onInspect={onInspect} /></LocaleProvider>)
  const button = screen.getByRole("button", { name: /ask_wiki_question/ })
  button.focus(); expect(button).toHaveFocus()
  fireEvent.click(button); expect(onInspect).toHaveBeenCalledExactlyOnceWith("a")
  expect(document.querySelector("a")).toBeNull()
})
it("resolves an exact Run activity from current thread state and never substitutes another Run", () => {
  const thread = createSessionStreamState()
  thread.stepsByRun.run = [{ kind: "activity", seq: "1", segmentId: "segment", activity }]
  const ref = { kind: "activity" as const, runId: "run", activityId: "a", subject: "actor", generation: 1 }
  expect(resolveCanvasContent(ref, thread)).toMatchObject({ kind: "activity", runId: "run", activity })
  thread.stepsByRun.run![0] = { kind: "activity", seq: "1", segmentId: "segment", activity: { ...activity, status: "failed" } }
  expect(resolveCanvasContent(ref, thread)).toMatchObject({ activity: { status: "failed" } })
  expect(resolveCanvasContent({ ...ref, runId: "other" }, thread)).toBeNull()
})
it.each([{ subject: "other", generation: 1 }, { subject: "actor", generation: 2 }])("retires activity selection for a different actor or admission generation: %j", async next => {
  const { renderHook } = await import("@testing-library/react")
  const { useCanvasWorkspace } = await import("@/ui/shell/use-canvas-workspace")
  const thread = createSessionStreamState()
  thread.stepsByRun.run = [{ kind: "activity", seq: "1", segmentId: "segment", activity }]
  const { result, rerender } = renderHook(({ subject, generation }) => useCanvasWorkspace("session", thread, true, { subject, admitted: true, generation }), { initialProps: { subject: "actor", generation: 1 } })
  const { act } = await import("@testing-library/react")
  act(() => result.current.openActivity("run", "a", "actor"))
  expect(result.current.resolvedCanvas).toMatchObject({ kind: "activity" })
  rerender(next)
  expect(result.current.resolvedCanvas).toBeNull()
  expect(result.current.canReopenCanvas).toBe(false)
})
it("renders a selected activity in the existing Canvas without file actions or inferred input", async () => {
  const { CanvasPanel } = await import("@/ui/canvas/canvas-panel")
  render(<LocaleProvider><CanvasPanel sessionId="s" content={{ kind: "activity", runId: "run", activityId: "a", subject: "actor", generation: 1, activity, terminal: true }} files={[]} deliveries={[]} fullscreen={false} onSelectFile={vi.fn()} onSelectDelivery={vi.fn()} onToggleFullscreen={vi.fn()} onClose={vi.fn()} /></LocaleProvider>)
  expect(screen.getByRole("heading", { name: "Action details" })).toBeVisible()
  expect(screen.queryByRole("button", { name: /Download/ })).toBeNull()
  expect(screen.queryByRole("radio", { name: "Files" })).toBeNull()
  expect(screen.getByText("ask_wiki_question")).toBeVisible()
  expect(screen.queryByText("Details were not provided in this record.")).toBeNull()
})
it("renders owner target and literal input context rather than the wrapper tool name", () => {
  const detail = { activity_id: "a", tool_name: "mcp_call", target: { kind: "mcp_tool" as const, name: "actual_lookup" }, input_preview: { text: '{"repo":"example/project","question":"original question"}', truncated: false, redacted: false } }
  render(<LocaleProvider><ToolCallRow activity={activity} detail={detail} onInspect={vi.fn()} /></LocaleProvider>)
  expect(screen.getByText("actual_lookup")).toBeVisible()
  expect(screen.getByText("example/project · original question")).toBeVisible()
  expect(screen.queryByText(detail.input_preview.text)).toBeNull()
  expect(screen.queryByText("mcp_call")).toBeNull()
})
it("displays bounded owner previews as literal text with truncation/redaction, not HTML, Markdown or links", async () => {
  const { ActivityInspector } = await import("@/ui/thread/activity-inspector")
  const { waitFor } = await import("@testing-library/react")
  const detail = { activity_id: "a", tool_name: "mcp_call", target: { kind: "mcp_tool" as const, name: "original_tool" }, input_preview: { text: '<img src=x onerror=alert(1)> [title](https://example.test)', truncated: true, redacted: true }, output_preview: { text: '## Original output\nhttps://example.test', truncated: false, redacted: false } }
  const boundary = { actorId: "actor", sessionId: "s", isCurrent: () => true, client: { readDisplay: vi.fn().mockResolvedValue({ run_id: "run", display_skills: [], tool_paths: [], tool_facts: [], activity_details: [detail] }) } } as unknown as import("@/ui/thread/answer-action-scope").AnswerActionBoundary
  const { container } = render(<LocaleProvider><ActivityInspector content={{ kind: "activity", runId: "run", activityId: "a", subject: "actor", generation: 1, activity, terminal: true }} boundary={boundary} /></LocaleProvider>)
  await waitFor(() => expect(screen.getByRole("region", { name: "Result" })).toBeVisible())
  expect(within(screen.getByRole("region", { name: "Result" })).getByText(detail.output_preview.text, { normalizer: value => value })).toBeVisible()
  expect(screen.getByText(detail.input_preview.text)).not.toBeVisible()
  fireEvent.click(screen.getByText("Technical details"))
  expect(screen.getByText(detail.input_preview.text)).toBeVisible()
  expect(container.querySelectorAll("img,a")).toHaveLength(0)
  expect(screen.queryByRole("heading", { name: "Original output" })).toBeNull()
  expect(screen.getByText("Truncated record")).toBeVisible()
  expect(screen.getByText("Sensitive content hidden")).toBeVisible()
  expect(screen.queryByText("Details were not provided in this record.")).toBeNull()
})
it.each(["tool.mcp.discover", "tool.mcp.describe"] as const)("keeps %s preparation compact without repeating parameter JSON", code => {
  const detail = { activity_id: "a", tool_name: "mcp_describe_tool", input_preview: { text: '{"tool":"actual_tool"}', truncated: false, redacted: false } }
  render(<LocaleProvider><ToolCallRow activity={{ ...activity, display_code: code }} detail={detail} /></LocaleProvider>)
  expect(screen.queryByText(detail.input_preview.text)).toBeNull()
})
it("does not present empty JSON as useful call context", () => {
  const detail = { activity_id: "a", tool_name: "mcp_call", input_preview: { text: "{\n  }", truncated: false, redacted: false } }
  render(<LocaleProvider><ToolCallRow activity={activity} detail={detail} /></LocaleProvider>)
  expect(screen.queryByText("{ }", { exact: false })).toBeNull()
})
it("a single Canvas action has exactly one operation entry while callers without Canvas retain explicit reading", () => {
  const onInspect = vi.fn(), onOpenActivity = vi.fn()
  const { rerender } = render(<LocaleProvider><SegmentProcess segmentId="single-inspect-entry" activities={[activity]} live={false} onInspect={onInspect} onOpenActivity={onOpenActivity} /></LocaleProvider>)
  expect(screen.getAllByRole("button")).toHaveLength(1)
  fireEvent.click(screen.getByRole("button", { name: /ask_wiki_question/ }))
  expect(onOpenActivity).toHaveBeenCalledExactlyOnceWith("a")
  expect(onInspect).not.toHaveBeenCalled()
  rerender(<LocaleProvider><SegmentProcess segmentId="single-inspect-entry" activities={[activity]} live={false} onInspect={onInspect} /></LocaleProvider>)
  expect(screen.getAllByRole("button")).toHaveLength(1)
  fireEvent.click(screen.getByRole("button"))
  expect(onInspect).toHaveBeenCalledTimes(1)
})

it("keeps the action verb visible beside a target instead of using a bare function name", () => {
  render(<LocaleProvider><ToolCallRow activity={activity} /></LocaleProvider>)
  expect(screen.getByText("Call MCP tool")).not.toHaveClass("sr-only")
  expect(screen.getByText("ask_wiki_question")).toBeVisible()
})

it("keeps same-call intent as the inspector heading and capability prose separate from the action", async () => {
  const { ActivityInspector } = await import("@/ui/thread/activity-inspector")
  const { waitFor } = await import("@testing-library/react")
  const action_title = "检查项目状态如何在节点间传递"
  const detail = { activity_id: "a", tool_name: "mcp_call", target: { kind: "mcp_tool" as const, name: "ask_wiki_question" }, tool_description: { text: "Answers questions about a repository.", truncated: false, redacted: false } }
  const boundary = { actorId: "actor", sessionId: "intent", isCurrent: () => true, client: { readDisplay: vi.fn().mockResolvedValue({ run_id: "run", display_skills: [], tool_paths: [], tool_facts: [], activity_details: [detail] }) } } as unknown as import("@/ui/thread/answer-action-scope").AnswerActionBoundary
  render(<LocaleProvider><ActivityInspector content={{ kind: "activity", runId: "run", activityId: "a", subject: "actor", generation: 1, activity: { ...activity, action_title }, terminal: true }} boundary={boundary} /></LocaleProvider>)
  expect(screen.getByRole("heading", { name: action_title })).toBeVisible()
  await waitFor(() => expect(screen.getByText("Technical details")).toBeVisible())
  expect(screen.getByText(detail.tool_description.text)).not.toBeVisible()
  fireEvent.click(screen.getByText("Technical details"))
  expect(screen.getByText(detail.tool_description.text)).toBeVisible()
  expect(screen.getByRole("heading", { name: "Tool description" })).toBeVisible()
  expect(screen.getByRole("heading", { name: action_title })).toBeVisible()
})
