import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import type { RunProcessActivity } from "@/contract/chat"
import { LocaleProvider } from "@/i18n/context"
import { stateFromSnapshot } from "@/core/hydration"
import { mergeMessageParts, preserveMessageParts } from "@/core/reducer"
import { messagePartsPageSchema, parseSessionSnapshot, type MessageTextPartSlice } from "@/contract/chat"
import { ConversationThread } from "@/ui/thread/conversation-thread"
import { AssistantTurn } from "@/ui/thread/assistant-turn"
import { SegmentProcess } from "@/ui/thread/segment-process"
import { makeInteractionState, makeSnapshot } from "../core/fixtures"
afterEach(cleanup)
it("a completed single action stays direct and owns the sole Run continuation through an empty answer tail", () => {
  const activity = { activity: "tool" as const, activity_id: `act_${"3".repeat(64)}`, segment_id: `seg_${"4".repeat(64)}`, status: "completed" as const, display_code: "tool.file.write" as const }
  const props = { sessionId: "single-progress", messagesById: {}, isLive: true, mode: "fast" as const, stagedDecisions: {}, hitlActive: false, controlError: null }
  const activityStep = { kind: "activity" as const, seq: "1", segmentId: activity.segment_id, activity }
  const { rerender } = render(<LocaleProvider><AssistantTurn {...props} steps={[activityStep]} /></LocaleProvider>)
  const action = screen.getByText("Write file")
  expect(document.querySelector('[data-slot="collapsible-trigger"]')).toBeNull()
  expect(screen.queryByText("Composing an answer")).not.toBeInTheDocument()
  expect(screen.getAllByRole("status")).toHaveLength(1)
  expect(screen.getByRole("status")).toHaveTextContent("Continuing…")
  expect(screen.getByText("Completed")).toHaveClass("sr-only")
  expect(action.closest('[data-status="completed"]')).not.toBeNull()

  rerender(<LocaleProvider><AssistantTurn {...props} steps={[activityStep, { kind: "text", seq: "2", segmentId: "pending-answer" }]} messagesById={{ "pending-answer": { id: "pending-answer", runId: "run", role: "assistant", content: "" } }} /></LocaleProvider>)
  expect(screen.queryByText("Composing an answer")).not.toBeInTheDocument()
  expect(screen.getByText("Write file")).toBe(action)
  expect(screen.getAllByRole("status")).toHaveLength(1)
  expect(screen.getByRole("status")).toHaveTextContent("Continuing…")
  rerender(<LocaleProvider><AssistantTurn {...props} steps={[activityStep, { kind: "text", seq: "2", segmentId: "pending-answer" }]} messagesById={{ "pending-answer": { id: "pending-answer", runId: "run", role: "assistant", content: "real answer" } }} /></LocaleProvider>)
  expect(screen.queryByText("Continuing…")).toBeNull()
  expect(screen.getByText("real answer")).toBeVisible()
})

it("before any process or token there is one accessible forming state, preserving queued, stopping and reconnect labels", () => {
  const props = { sessionId: "forming", steps: [], messagesById: {}, isLive: true, mode: "fast" as const, stagedDecisions: {}, hitlActive: false, controlError: null }
  const { rerender } = render(<LocaleProvider><AssistantTurn {...props} /></LocaleProvider>)
  expect(screen.getAllByRole("status")).toHaveLength(1)
  expect(screen.getByRole("status")).toHaveTextContent("Composing an answer")
  for (const [phase, label] of [["queued", "Queued, waiting to execute"], ["resuming", "Resuming execution; decisions submitted"], ["cancelling", "Stopping, waiting for execution to finish"]] as const) {
    rerender(<LocaleProvider><AssistantTurn {...props} executionPhase={phase} /></LocaleProvider>)
    expect(screen.getAllByRole("status")).toHaveLength(1)
    expect(screen.getByRole("status")).toHaveTextContent(label)
    rerender(<LocaleProvider><AssistantTurn {...props} steps={[{ kind: "text", seq: "1", segmentId: "before-token" }]} executionPhase={phase} /></LocaleProvider>)
    expect(screen.getAllByRole("status")).toHaveLength(1)
    expect(screen.getByRole("status")).toHaveTextContent(label)
  }
  rerender(<LocaleProvider><AssistantTurn {...props} reconnecting /></LocaleProvider>)
  expect(screen.getAllByRole("status")).toHaveLength(1)
  expect(screen.getByRole("status")).toHaveTextContent("Reconnecting…")
  rerender(<LocaleProvider><AssistantTurn {...props} steps={[{ kind: "text", seq: "1", segmentId: "before-token" }]} executionPhase="queued" reconnecting /></LocaleProvider>)
  expect(screen.getByText("Queued, waiting to execute")).toBeVisible()
  expect(screen.getByText("Reconnecting…")).toBeVisible()
})

it("a process-only Run retains explicit queued, stopping and reconnect status without adding an answer placeholder", () => {
  const props = { sessionId: "process-status", steps: [], messagesById: {}, activities: [{ activity: "tool" as const, activity_id: `act_${"5".repeat(64)}`, segment_id: `seg_${"6".repeat(64)}`, status: "completed" as const, display_code: "tool.file.deliver" as const }], isLive: true, mode: "fast" as const, stagedDecisions: {}, hitlActive: false, controlError: null }
  const { rerender } = render(<LocaleProvider><AssistantTurn {...props} /></LocaleProvider>)
  expect(screen.queryByText("Composing an answer")).not.toBeInTheDocument()
  for (const [phase, label] of [["queued", "Queued, waiting to execute"], ["resuming", "Resuming execution; decisions submitted"], ["cancelling", "Stopping, waiting for execution to finish"]] as const) {
    rerender(<LocaleProvider><AssistantTurn {...props} executionPhase={phase} /></LocaleProvider>)
    expect(screen.getAllByText(label)).toHaveLength(1)
    expect(screen.getByRole("status")).toHaveTextContent(label)
  }
  rerender(<LocaleProvider><AssistantTurn {...props} reconnecting /></LocaleProvider>)
  expect(screen.getByRole("status")).toHaveTextContent("Reconnecting…")
  expect(screen.queryByText("Composing an answer")).not.toBeInTheDocument()
})

it("HITL 卡独立于可收起的过程，手动收起不会隐藏决策入口", () => {
  render(<LocaleProvider><AssistantTurn sessionId="session_1"
    steps={[]}
    activities={[{ activity: "tool", activity_id: `act_${"a".repeat(64)}`, segment_id: `seg_${"b".repeat(64)}`, status: "running", display_code: "tool.execution" }, { activity: "tool", activity_id: `act_${"9".repeat(64)}`, segment_id: `seg_${"b".repeat(64)}`, status: "completed", display_code: "tool.file.read" }]}
    messagesById={{}} isLive mode="thinking" stagedDecisions={{}} hitlActive controlError={null} onToolDecision={() => {}}
    interaction={makeInteractionState("tool_1", ["tool_1"], { description: "需要批准写入文件" })} executionPhase="waiting" /></LocaleProvider>)
  const summary = document.querySelector<HTMLButtonElement>('[data-slot="collapsible-trigger"]')
  expect(summary).toBeInTheDocument()
  expect(summary).toBeEnabled()
  expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled()
  if (!summary) throw new Error("missing process disclosure")
  fireEvent.click(summary)
  expect(summary).toHaveAttribute("aria-expanded", "false")
  expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled()
})

it("keeps mixed process rows in owner order through status updates and manual collapse", () => {
  const segmentId = `seg_${"c".repeat(64)}`
  const activities: RunProcessActivity[] = [
    { activity: "skill", activity_id: `act_${"d".repeat(64)}`, preflight_id: `spf_${"e".repeat(64)}`, source_refs: ["skill:alpha"], phase: "loading" },
    { activity: "tool", activity_id: `act_${"f".repeat(64)}`, segment_id: segmentId, status: "running", display_code: "tool.execution" },
    { activity: "subagent", activity_id: `act_${"1".repeat(64)}`, segment_id: segmentId, status: "running", display_code: "subagent.execution" },
    { activity: "tool", activity_id: `act_${"2".repeat(64)}`, segment_id: segmentId, status: "running", display_code: "tool.execution" },
  ]
  const { rerender } = render(<LocaleProvider><SegmentProcess segmentId={segmentId} activities={activities} live /></LocaleProvider>)
  const rowLabels = () => screen.getAllByText(/^(Skill|Tool call|Subagent)$/u)
  const originalRows = rowLabels()
  expect(originalRows.map((row) => row.textContent)).toEqual(["Skill", "Tool call", "Subagent", "Tool call"])
  const summary = screen.getByRole("button")
  expect(summary).toHaveAttribute("aria-expanded", "true")
  fireEvent.click(summary)
  expect(summary).toHaveAttribute("aria-expanded", "false")

  const completed = activities.map<RunProcessActivity>((activity) => {
    if (activity.activity === "skill") return { ...activity, phase: "ready" }
    return { ...activity, status: activity.activity_id === `act_${"f".repeat(64)}` ? "failed" : "completed" }
  })
  rerender(<LocaleProvider><SegmentProcess segmentId={segmentId} activities={completed} live={false} /></LocaleProvider>)

  expect(screen.getByRole("button")).toBe(summary)
  expect(summary).toHaveAttribute("aria-expanded", "false")
  const settledRows = rowLabels()
  expect(settledRows.map((row) => row.textContent)).toEqual(["Skill", "Tool call", "Subagent", "Tool call"])
  settledRows.forEach((row, index) => {
    expect(row).toBe(originalRows[index])
    expect(row.closest("[inert]")).not.toBeNull()
  })
  expect(summary).toHaveTextContent("Skill preparations: 1")
  expect(summary).not.toHaveTextContent("4 activities")
  expect(summary).not.toHaveTextContent("failed")
  expect(screen.getAllByText("Failed")).toHaveLength(1)
  expect(screen.getByText("Ready")).toBeInTheDocument()
  expect(screen.getByText("Failed")).toBeInTheDocument()
  expect(screen.getAllByText("Completed")).toHaveLength(2)
})


it("keeps partial public text visible and exposes a separate per-Message read action", () => {
  const reload = vi.fn()
  render(<LocaleProvider><AssistantTurn sessionId="session_1"
    steps={[{ kind: "text", seq: "1", segmentId: "segment" }]}
    messagesById={{ segment: { id: "segment", runId: "run", role: "assistant", content: "confirmed public text" } }}
    parts={[{ messageId: "owner-message", runId: "run", revision: "9", status: "changed" }]}
    onRetryMessageParts={reload} isLive={false} stagedDecisions={{}} hitlActive={false} controlError={null}
  /></LocaleProvider>)
  expect(screen.getByText("confirmed public text")).toBeVisible()
  fireEvent.click(screen.getByRole("button", { name: "Reload this message" }))
  expect(reload).toHaveBeenCalledExactlyOnceWith("owner-message")
  expect(screen.getByText("confirmed public text")).toBeVisible()
})

it("keeps ordinary history reads offscreen and retains the visible answer node through completion", () => {
  const props = { sessionId: "s", steps: [{ kind: "text" as const, seq: "1", segmentId: "segment" }], messagesById: { segment: { id: "segment", runId: "r", role: "assistant" as const, content: "stable visible answer" } }, isLive: false, stagedDecisions: {}, hitlActive: false, controlError: null }
  const { rerender } = render(<LocaleProvider><AssistantTurn {...props} parts={[{ messageId: "m", runId: "r", revision: "1", status: "unread" }]} /></LocaleProvider>)
  const answer = screen.getByText("stable visible answer")
  // This is the existing shared offscreen accessibility utility, not a new
  // visible loading row or a layout/screenshot oracle.
  expect(screen.getByRole("status")).toHaveClass("sr-only")
  rerender(<LocaleProvider><AssistantTurn {...props} parts={[{ messageId: "m", runId: "r", revision: "1", status: "loading" }]} /></LocaleProvider>)
  expect(screen.getByRole("status")).toHaveClass("sr-only")
  expect(screen.getByText("stable visible answer")).toBe(answer)
  rerender(<LocaleProvider><AssistantTurn {...props} parts={[{ messageId: "m", runId: "r", revision: "1", status: "complete" }]} /></LocaleProvider>)
  expect(screen.queryByRole("status")).toBeNull()
  expect(screen.getByText("stable visible answer")).toBe(answer)
})

it("keeps one disclosure across proven empty tool-round text and restores the boundary for late public content", () => {
  const activity = (letter: string): RunProcessActivity => ({ activity: "tool", activity_id: `act_${letter.repeat(64)}`, segment_id: `seg_${letter.repeat(64)}`, status: "completed", display_code: "tool.execution" })
  const steps = [
    { kind: "activity" as const, seq: "1", segmentId: "activity-a", activity: activity("a") },
    { kind: "text" as const, seq: "2", segmentId: "empty" },
    { kind: "activity" as const, seq: "3", segmentId: "activity-b", activity: activity("b") },
    { kind: "text" as const, seq: "4", segmentId: "answer" },
    { kind: "activity" as const, seq: "5", segmentId: "activity-c", activity: activity("c") },
  ]
  const messages = {
    empty: { id: "empty", runId: "run", role: "assistant" as const, content: "", textState: "completed" as const },
    answer: { id: "answer", runId: "run", role: "assistant" as const, content: "public answer", textState: "completed" as const },
  }
  const props = { sessionId: "s", steps, isLive: false, stagedDecisions: {}, hitlActive: false, controlError: null }
  const { container, rerender } = render(<LocaleProvider><AssistantTurn {...props} messagesById={messages} /></LocaleProvider>)
  const disclosures = () => container.querySelectorAll('[data-slot="collapsible-trigger"]')
  expect(disclosures()).toHaveLength(1)
  expect(disclosures()[0]).toHaveTextContent("Tool calls: 2")
  const answer = screen.getByText("public answer")
  expect(disclosures()[0]!.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(answer.compareDocumentPosition(screen.getAllByText("Tool call").at(-1)!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  rerender(<LocaleProvider><AssistantTurn {...props} messagesById={{ ...messages, empty: { ...messages.empty, content: "owner corrected body" } }} /></LocaleProvider>)
  expect(disclosures()).toHaveLength(0)
  expect(screen.getByText("owner corrected body")).toBeVisible()
  expect(screen.getByText("public answer")).toBeVisible()
})


it("renders one real same-run user across partial pages, EOF and late snapshots without duplicate keys", () => {
  const snapshot = () => parseSessionSnapshot({ ...makeSnapshot(), messages: [
    { message_id: "same-run-user", run_id: "run", role: "user", content: "same-run user prompt", status: "completed", created_at: "now" },
    { message_id: "owner", run_id: "run", role: "assistant", content: null, status: "completed", created_at: "now", rendering: { mode: "ordered", format_version: 1, revision: "1", event_watermark: null, parts_cursor: "opaque" } },
  ] })
  let thread = stateFromSnapshot(snapshot())
  const props = { sessionId: "session", isStreaming: false, isReconnecting: false, hasFailed: false, canRetryPendingSubmission: false, creditRejected: false, onOpenBilling: () => undefined, onOpenPricing: () => undefined, onRetry: () => undefined, mode: "fast" as const, stagingByRun: {}, hitlRunId: null, controlError: null }
  const errors = vi.spyOn(console, "error").mockImplementation(() => undefined)
  try {
    const { container, rerender } = render(<LocaleProvider><ConversationThread {...props} thread={thread} /></LocaleProvider>)
    const assertOneUser = () => {
      // Task-title staging may repeat the prompt outside its user bubble.
      // The owner user message/scroll item itself must still exist exactly once.
      expect(container.querySelector('[data-message-id="same-run-user"]')).toHaveTextContent("same-run user prompt")
      expect(container.querySelectorAll('[data-message-id="same-run-user"]')).toHaveLength(1)
      const ids = [...container.querySelectorAll('[data-slot="message-scroller-item"]')].map((element) => element.getAttribute("data-message-id"))
      expect(new Set(ids).size).toBe(ids.length)
      expect(errors.mock.calls.some((args) => args.some((arg) => typeof arg === "string" && /same key|unique.*key/iu.test(arg)))).toBe(false)
    }
    assertOneUser()
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      const part: MessageTextPartSlice = { kind: "text", part_id: "opaque-text", segment_id: "segment", text: "assistant answer", offset: "0", end: "16", total_scalars: "16", first_sequence: "1", latest_sequence: String(cycle), completed: true }
      const read = { message_id: "owner", run_id: "run", revision: String(cycle), items: [part] }
      thread = mergeMessageParts(thread, read, [], false)
      rerender(<LocaleProvider><ConversationThread {...props} thread={thread} /></LocaleProvider>); assertOneUser()
      thread = mergeMessageParts(thread, read, [], true)
      rerender(<LocaleProvider><ConversationThread {...props} thread={thread} /></LocaleProvider>); assertOneUser()
      thread = preserveMessageParts(thread, stateFromSnapshot(snapshot()))
      rerender(<LocaleProvider><ConversationThread {...props} thread={thread} /></LocaleProvider>); assertOneUser()
      expect(screen.getByText("assistant answer")).toBeVisible()
    }
  } finally { errors.mockRestore() }
})


import { ToolCallRow } from "@/ui/thread/tool-call-row"
const public28Labels = [
  ["tool.execution", "Tool call"], ["tool.file.read", "Read file"],
  ["tool.mcp.discover", "Discover MCP tools"], ["tool.mcp.describe", "Describe MCP tool"],
  ["tool.mcp.call", "Call MCP tool"], ["tool.web.search", "Search the web"], ["tool.web.fetch", "Read webpage"],
  ["tool.file.write", "Write file"], ["tool.file.deliver", "Deliver file"],
] as const
it.each([
  ["tool.file.write", "Write file"], ["tool.file.deliver", "Deliver file"],
] as const)("%s survives snapshot and reopened ordered history as a category, not assistant text", (display_code, label) => {
  const activity = { activity: "tool", activity_id: `act_${"c".repeat(64)}`, segment_id: `seg_${"d".repeat(64)}`, status: "completed", display_code, display_detail: { kind: "file", name: "published-output.md" } }
  const owner = { message_id: "file-owner", run_id: "file-run", role: "assistant", content: "public answer", status: "completed", created_at: "now" }
  const snapshot = parseSessionSnapshot({ ...makeSnapshot(), messages: [owner], execution_process: { run_id: "file-run", todos: null, activities: [activity], next_cursor: null } })
  const props = { sessionId: "session", isStreaming: false, isReconnecting: false, hasFailed: false, canRetryPendingSubmission: false, creditRejected: false, onOpenBilling: vi.fn(), onOpenPricing: vi.fn(), onRetry: vi.fn(), mode: "fast" as const, stagingByRun: {}, hitlRunId: null, controlError: null }
  const show = (thread: ReturnType<typeof stateFromSnapshot>) => render(<LocaleProvider><ConversationThread {...props} thread={thread} /></LocaleProvider>)
  const revealCategory = () => {
    expect(document.querySelector('[data-slot="collapsible-trigger"]')).toBeNull()
    expect(screen.getByText(label)).toBeVisible()
    expect(screen.getByText("published-output.md")).toHaveAttribute("title", "published-output.md")
  }
  const view = show(stateFromSnapshot(snapshot))
  revealCategory()
  expect(screen.getByText("public answer")).toBeVisible()
  view.unmount()

  const reopened = parseSessionSnapshot({ ...makeSnapshot(), messages: [{ ...owner, content: null, rendering: { mode: "ordered", format_version: 1, revision: "3", event_watermark: null, parts_cursor: "opaque" } }] })
  const text = (id: string, value: string, seq: string) => ({ kind: "text", part_id: id, segment_id: id, first_sequence: seq, latest_sequence: seq, text: value, offset: "0", end: String(value.length), total_scalars: String(value.length), completed: true })
  const page = messagePartsPageSchema.parse({ session_id: "session", message_id: owner.message_id, run_id: owner.run_id, format_version: 1, revision: "3", event_watermark: null, items: [
    text("before", "before file action", "1"), { kind: "activity", part_id: "file-part", first_sequence: "2", latest_sequence: "2", activity }, text("after", "after file action", "3"),
  ], next_cursor: null })
  const thread = mergeMessageParts(stateFromSnapshot(reopened), { message_id: page.message_id, run_id: page.run_id, revision: page.revision, items: page.items }, [], true)
  show(thread)
  revealCategory()
  expect(screen.getByText("before file action")).toBeVisible()
  expect(screen.getByText("after file action")).toBeVisible()
  expect(thread.messages.filter(message => !message.orderedContainer).some(message => message.content?.includes(label))).toBe(false)
  expect(props.onRetry).not.toHaveBeenCalled()
})
for (const [display_code, label] of public28Labels) {
  it(`Public28 renders ${display_code} without changing the lifecycle row identity`, () => {
    const activity = { activity: "tool" as const, activity_id: `act_${"a".repeat(64)}`, segment_id: `seg_${"b".repeat(64)}`, status: "running" as const, display_code }
    const { rerender } = render(<LocaleProvider><ToolCallRow activity={activity} /></LocaleProvider>)
    const original = screen.getByText(label)
    expect(screen.getByText("Running")).toBeInTheDocument()
    for (const [status, text] of [["completed", "Completed"], ["failed", "Failed"]] as const) {
      rerender(<LocaleProvider><ToolCallRow activity={{ ...activity, status }} /></LocaleProvider>)
      expect(screen.getByText(label)).toBe(original)
      expect(screen.getByText(text)).toBeInTheDocument()
    }
  })
}


it("grows a direct action into one disclosure without remounting rows and preserves manual intent after remount", () => {
  const first = { activity: "tool" as const, activity_id: `act_${"7".repeat(64)}`, segment_id: "stable-action-growth", status: "running" as const, display_code: "tool.file.read" as const }
  const second = { ...first, activity_id: `act_${"8".repeat(64)}`, display_code: "tool.web.search" as const }
  const props = { segmentId: "stable-action-growth", live: true }
  const { rerender, unmount } = render(<LocaleProvider><SegmentProcess {...props} activities={[first]} /></LocaleProvider>)
  const row = screen.getByText("Read file")
  expect(screen.queryByRole("button")).toBeNull()
  rerender(<LocaleProvider><SegmentProcess {...props} activities={[first, second]} /></LocaleProvider>)
  expect(screen.getByText("Read file")).toBe(row)
  const trigger = screen.getByRole("button", { name: /File reads: 1/u })
  fireEvent.click(trigger)
  expect(trigger).toHaveAttribute("aria-expanded", "false")
  rerender(<LocaleProvider><SegmentProcess {...props} live={false} activities={[{ ...first, status: "completed" }, { ...second, status: "failed" }]} /></LocaleProvider>)
  expect(screen.getByRole("button")).toBe(trigger)
  expect(screen.getByText("Read file")).toBe(row)
  expect(row.closest("[inert]")).not.toBeNull()
  unmount()
  render(<LocaleProvider><SegmentProcess {...props} activities={[first, second]} /></LocaleProvider>)
  expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false")
})

it("counts every failed mixed activity without inventing distinct file or result quantities", () => {
  const activities: RunProcessActivity[] = [
    { activity: "tool", activity_id: "one", segment_id: "mixed-failures", display_code: "tool.file.read", status: "failed" },
    { activity: "tool", activity_id: "two", segment_id: "mixed-failures", display_code: "tool.file.read", status: "completed" },
    { activity: "subagent", activity_id: "three", segment_id: "mixed-failures", display_code: "subagent.execution", status: "failed" },
    { activity: "skill", activity_id: "four", preflight_id: "preflight", source_refs: [], phase: "failed" },
  ]
  render(<LocaleProvider><SegmentProcess segmentId="mixed-failures" activities={activities} live={false} /></LocaleProvider>)
  const summary = screen.getByRole("button")
  expect(summary).toHaveTextContent("File reads: 2 · Subtasks: 1 · Skill preparations: 1")
  expect(summary).not.toHaveTextContent("4 activities")
  expect(summary).not.toHaveTextContent("failed")
  fireEvent.click(summary)
  expect(screen.getAllByText("Failed")).toHaveLength(2)
  expect(screen.getByText("Failed to load")).toBeInTheDocument()
  expect(summary).not.toHaveTextContent(/2 files|results/u)
})

it("uses nine category-specific decorative icons without reading unknown activity fields", () => {
  const icons = new Set<string | null>()
  for (const [display_code, label] of public28Labels) {
    const activity = { activity: "tool" as const, activity_id: "category", segment_id: "category", status: "completed" as const, display_code, raw_target: "untrusted unknown field" }
    const view = render(<LocaleProvider><ToolCallRow activity={activity} /></LocaleProvider>)
    const row = screen.getByText(label).parentElement!.parentElement!
    icons.add(row.querySelector("svg")?.getAttribute("class") ?? null)
    expect(row.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
    expect(row.querySelector("a, button")).toBeNull()
    expect(screen.queryByText("untrusted unknown field")).toBeNull()
    expect(screen.getByText("Completed")).toHaveClass("sr-only")
    view.unmount()
  }
  expect(icons.size).toBe(9)
})

it("renders only the formal safe target as literal text with its full title through terminal updates", () => {
  const display_detail = { kind: "mcp_tool" as const, name: "<b>provider/tool</b>" }
  const activity = { activity: "tool" as const, activity_id: "target-row", segment_id: "target-row", status: "running" as const, display_code: "tool.mcp.call" as const, display_detail }
  const { rerender } = render(<LocaleProvider><ToolCallRow activity={activity} /></LocaleProvider>)
  const target = screen.getByText(display_detail.name)
  expect(target).toHaveAttribute("title", display_detail.name)
  expect(target.parentElement!.querySelector("b, a, button")).toBeNull()
  rerender(<LocaleProvider><ToolCallRow activity={{ ...activity, status: "completed" }} /></LocaleProvider>)
  expect(screen.getByText(display_detail.name)).toBe(target)
  rerender(<LocaleProvider><ToolCallRow activity={{ ...activity, status: "failed" }} /></LocaleProvider>)
  expect(screen.getByText(display_detail.name)).toBe(target)
})


it("does not duplicate queued, resume, cancel, HITL or reconnect cues with Run continuation", () => {
  const activity = { activity: "tool" as const, activity_id: "settled-status", segment_id: "settled-status", status: "completed" as const, display_code: "tool.file.read" as const }
  const props = { sessionId: "status-exclusive", steps: [{ kind: "activity" as const, seq: "1", segmentId: activity.segment_id, activity }], messagesById: {}, isLive: true, stagedDecisions: {}, hitlActive: false, controlError: null }
  const { rerender } = render(<LocaleProvider><AssistantTurn {...props} /></LocaleProvider>)
  expect(screen.getByText("Continuing…")).toBeVisible()
  for (const phase of ["queued", "resuming", "cancelling"] as const) {
    rerender(<LocaleProvider><AssistantTurn {...props} executionPhase={phase} /></LocaleProvider>)
    expect(screen.queryByText("Continuing…")).toBeNull()
  }
  rerender(<LocaleProvider><AssistantTurn {...props} reconnecting /></LocaleProvider>)
  expect(screen.queryByText("Continuing…")).toBeNull()
  rerender(<LocaleProvider><AssistantTurn {...props} hitlActive /></LocaleProvider>)
  expect(screen.queryByText("Continuing…")).toBeNull()
  rerender(<LocaleProvider><AssistantTurn {...props} steps={[{ ...props.steps[0]!, activity: { ...activity, status: "running" } }]} /></LocaleProvider>)
  expect(screen.queryByText("Continuing…")).toBeNull()
  expect(screen.getByText("Running")).toBeVisible()
})


it("keeps an explicitly opened group open when it settles and when a single row grows again", () => {
  const one = { activity: "tool" as const, activity_id: "open-one", segment_id: "open-intent", status: "completed" as const, display_code: "tool.file.read" as const }
  const two = { ...one, activity_id: "open-two", display_code: "tool.file.write" as const }
  const props = { segmentId: "open-intent", live: false }
  const { rerender } = render(<LocaleProvider><SegmentProcess {...props} activities={[one, two]} /></LocaleProvider>)
  const trigger = screen.getByRole("button")
  expect(trigger).toHaveAttribute("aria-expanded", "false")
  fireEvent.click(trigger)
  expect(trigger).toHaveAttribute("aria-expanded", "true")
  const row = screen.getByText("Read file")
  rerender(<LocaleProvider><SegmentProcess {...props} activities={[one]} /></LocaleProvider>)
  expect(screen.queryByRole("button")).toBeNull()
  expect(screen.getByText("Read file")).toBe(row)
  expect(row.closest("[inert]")).toBeNull()
  rerender(<LocaleProvider><SegmentProcess {...props} activities={[one, two]} /></LocaleProvider>)
  expect(screen.getByText("Read file")).toBe(row)
  expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true")
})

it("keeps active mixed work distinguishable in its collapsed action summary", () => {
  const one = { activity: "tool" as const, activity_id: "active-summary-one", segment_id: "active-summary", status: "completed" as const, display_code: "tool.file.read" as const }
  const two = { ...one, activity_id: "active-summary-two", status: "running" as const, display_code: "tool.web.search" as const }
  const { rerender } = render(<LocaleProvider><SegmentProcess segmentId="active-summary" activities={[one, two]} live /></LocaleProvider>)
  const summary = screen.getByRole("button")
  fireEvent.click(summary)
  expect(summary).toHaveAttribute("aria-expanded", "false")
  expect(summary).toHaveTextContent("Running")
  rerender(<LocaleProvider><SegmentProcess segmentId="active-summary" activities={[one, { ...two, status: "completed" }]} live={false} /></LocaleProvider>)
  expect(summary).not.toHaveTextContent("Running")
  expect(summary).toHaveAttribute("aria-expanded", "false")
})

it("keeps only an exact message's supplementary read error quiet until keyboard focus, without hiding unread content failures", async () => {
  const { readFile } = await import("node:fs/promises")
  const { default: threadStyles } = await import("@/ui/thread/thread.module.css")
  const style = document.createElement("style")
  style.textContent = (await readFile("src/ui/thread/thread.module.css", "utf8")).replaceAll(".partsSupplement", `.${threadStyles.partsSupplement ?? "partsSupplement"}`)
  document.head.append(style)
  const retry = vi.fn()
  const props = { sessionId: "quiet-parts", steps: [{ kind: "text" as const, seq: "1", segmentId: "answer" }], isLive: false, stagedDecisions: {}, hitlActive: false, controlError: null, onRetryMessageParts: retry }
  const message = { id: "answer", snapshotMessageId: "owner-message", runId: "run", role: "assistant" as const, content: "confirmed final body" }
  const view = (content: string, owner = "owner-message", status: "changed" | "partial" | "failed" = "failed") => <LocaleProvider><AssistantTurn {...props}
    messagesById={{ answer: { ...message, content } }} parts={[{ messageId: owner, runId: "run", revision: "1", status }]} /></LocaleProvider>
  try {
    const mounted = render(view(message.content))
    const body = screen.getByText(message.content)
    for (const status of ["failed", "changed", "partial"] as const) {
      mounted.rerender(view(message.content, "owner-message", status))
      const feedback = screen.getByRole("status")
      expect(feedback).toHaveTextContent("Some message history is not yet available. Shown content is preserved.")
      expect(getComputedStyle(feedback).width).toBe("1px")
      const reload = screen.getByRole("button", { name: "Reload this message" })
      reload.focus()
      expect(document.activeElement).toBe(reload)
      // JSDOM caches computed styles across focus changes; reattach the same
      // real feature stylesheet, without changing its selectors or declarations.
      style.remove(); document.head.append(style)
      expect(getComputedStyle(feedback).position).toBe("static")
      fireEvent.click(reload)
      expect(retry).toHaveBeenLastCalledWith("owner-message")
      reload.blur()
      style.remove(); document.head.append(style)
      expect(getComputedStyle(feedback).width).toBe("1px")
      expect(screen.getByText(message.content)).toBe(body)
    }
    expect(retry).toHaveBeenCalledTimes(3)
    for (const [content, owner] of [["", "owner-message"], ["   ", "owner-message"], [message.content, "different-message"]]) {
      mounted.rerender(view(content!, owner!))
      expect(getComputedStyle(screen.getByRole("status")).width).not.toBe("1px")
      expect(screen.getByRole("button", { name: "Reload this message" })).toBeEnabled()
    }
    expect(retry).toHaveBeenCalledTimes(3)
  } finally { style.remove() }
})
