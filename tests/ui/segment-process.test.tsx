import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import { AssistantTurn } from "@/ui/thread/assistant-turn"
import { makeInteractionState } from "../core/fixtures"
afterEach(cleanup)
it("HITL 卡独立于可收起的过程，手动收起不会隐藏决策入口", () => {
  render(<LocaleProvider><AssistantTurn sessionId="session_1"
    steps={[{ kind: "tool", seq: 1, segmentId: "segment_1", tool: { id: "tool_1", name: "write_file", args: { file_path: "report.md" }, status: "running" } }]}
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
