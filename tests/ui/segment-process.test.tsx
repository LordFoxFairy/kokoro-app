import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"

import type { SessionToolCall } from "@/core/state"
import { LocaleProvider } from "@/i18n/context"
import { SegmentProcess } from "@/ui/thread/segment-process"

afterEach(cleanup)

it("HITL 待批时过程摘要保持展开且不提供无效的收起按钮", () => {
  const tool: SessionToolCall = {
    id: "tool_awaiting",
    name: "write_file",
    args: { file_path: "report.md" },
    status: "awaiting",
    awaitingKind: "tool_approval",
    allowedDecisions: ["approve", "reject"],
    description: "需要批准写入文件",
  }

  render(
    <LocaleProvider>
      <SegmentProcess
        sessionId="session_1"
        segmentId="segment_1"
        thinking=""
        tools={[tool]}
        subagents={[]}
        live={false}
        mode="thinking"
        stagedDecisions={{}}
        hitlActive
        controlError={null}
        onToolDecision={() => {}}
      />
    </LocaleProvider>,
  )

  const summary = document.querySelector('[data-slot="collapsible-trigger"]')
  expect(summary).toBeInTheDocument()
  expect(summary).toBeDisabled()
  expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled()
})
