import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import type { RunProcessActivity } from "@/contract/chat"
import { LocaleProvider } from "@/i18n/context"
import { AssistantTurn } from "@/ui/thread/assistant-turn"
import { SegmentProcess } from "@/ui/thread/segment-process"
import { makeInteractionState } from "../core/fixtures"
afterEach(cleanup)
it("HITL 卡独立于可收起的过程，手动收起不会隐藏决策入口", () => {
  render(<LocaleProvider><AssistantTurn sessionId="session_1"
    steps={[]}
    activities={[{ activity: "tool", activity_id: `act_${"a".repeat(64)}`, segment_id: `seg_${"b".repeat(64)}`, status: "running", display_code: "tool.execution" }]}
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
  expect(summary).toHaveTextContent("2 tool(s) (1 failed)")
  expect(summary).toHaveTextContent("1 subagent(s)")
  expect(screen.getByText("Ready")).toBeInTheDocument()
  expect(screen.getByText("Failed")).toBeInTheDocument()
  expect(screen.getAllByText("Completed")).toHaveLength(2)
})
