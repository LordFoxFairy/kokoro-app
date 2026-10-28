import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import { ActivityInspector } from "@/ui/thread/activity-inspector"
import type { AnswerActionBoundary } from "@/ui/thread/answer-action-scope"
import type { RunActivityDetail } from "@/contract/answer-actions"

afterEach(cleanup)
const activity = { activity: "tool" as const, activity_id: "a", segment_id: "s", display_code: "tool.mcp.call" as const, status: "failed" as const }
const content = { kind: "activity" as const, runId: "run", activityId: "a", subject: "actor", generation: 1, activity, terminal: true }
function renderResult(detail: RunActivityDetail) {
  const readDisplay = vi.fn().mockResolvedValue({ run_id: "run", display_skills: [], tool_paths: [], tool_facts: [], activity_details: [detail] })
  const boundary = { actorId: "actor", sessionId: "s", isCurrent: () => true, client: { readDisplay } } as unknown as AnswerActionBoundary
  return { ...render(<LocaleProvider><ActivityInspector content={content} boundary={boundary} /></LocaleProvider>), readDisplay, boundary }
}
it("reads text once, keeps failed state and preview notes, with exact original representation in a disclosure", async () => {
  const text = "Available pages:\n- Overview\n- Architecture"
  const raw = JSON.stringify({ text: [text], structured_content: { result: text }, isError: false })
  const { readDisplay } = renderResult({ activity_id: "a", tool_name: "mcp_call", target: { kind: "mcp_tool", name: "read_wiki_structure" }, output_preview: { text: raw, truncated: true, redacted: true } })
  const result = await screen.findByRole("region", { name: "Result" })
  expect(within(result).getByText(text, { normalizer: value => value })).toBeVisible()
  expect(within(result).getAllByText(text, { normalizer: value => value })).toHaveLength(1)
  expect(within(result).getByText("Truncated record")).toBeVisible()
  expect(within(result).getByText("Sensitive content hidden")).toBeVisible()
  expect(screen.getByRole("status")).toHaveTextContent("Failed")
  expect(screen.getByText(raw)).not.toBeVisible()
  expect(screen.getByText("mcp_call")).not.toBeVisible()
  const disclosure = screen.getByText("Technical details")
  disclosure.focus(); expect(disclosure).toHaveFocus()
  fireEvent.click(disclosure)
  expect(screen.getByText(raw)).toBeVisible()
  expect(screen.getByText("mcp_call")).toBeVisible()
  expect(readDisplay).toHaveBeenCalledTimes(1)
})
it.each(['{"result":"unknown"}', '{"text":["cut', '{"text":[]}'])
("keeps an unrecognized preview reachable without inventing a result: %s", async raw => {
  renderResult({ activity_id: "a", tool_name: "mcp_call", output_preview: { text: raw, truncated: true, redacted: false } })
  const result = await screen.findByRole("region", { name: "Result" })
  expect(within(result).getByText("View the original output in technical details.")).toBeVisible()
  expect(within(result).getByText("Truncated record")).toBeVisible()
  fireEvent.click(screen.getByText("Technical details"))
  expect(screen.getByText(raw)).toBeVisible()
})
it("treats result markup and URLs as text, and does not carry the selected action into another selection", async () => {
  const text = '<img src="https://example.test/x"> [link](https://example.test)\n`rm -rf`'
  const { container, rerender, boundary, readDisplay } = renderResult({ activity_id: "a", tool_name: "mcp_call", output_preview: { text: JSON.stringify({ text: [text] }), truncated: false, redacted: false } })
  const result = await screen.findByRole("region", { name: "Result" })
  expect(within(result).getByText(/<img/)).toBeVisible()
  expect(container.querySelectorAll("img,a,code")).toHaveLength(0)
  fireEvent.click(screen.getByText("Technical details"))
  rerender(<LocaleProvider><ActivityInspector content={{ ...content, activityId: "b", activity: { ...activity, activity_id: "b" } }} boundary={boundary} /></LocaleProvider>)
  await waitFor(() => expect(screen.queryByRole("region", { name: "Result" })).toBeNull())
  expect(screen.queryByText(/<img/)).toBeNull()
  expect(readDisplay).toHaveBeenCalledTimes(1)
})
it("does not decode a non-MCP operation using the MCP display format", async () => {
  const raw = '{"text":["do not extract"]}'
  renderResult({ activity_id: "a", tool_name: "some_other_tool", output_preview: { text: raw, truncated: false, redacted: false } })
  expect(await screen.findByText(raw)).toBeVisible()
  expect(screen.getByText("some_other_tool")).toBeVisible()
  expect(screen.queryByRole("region", { name: "Result" })).toBeNull()
})
it("resets technical disclosure when switching between two actions whose details are both present", async () => {
  const readDisplay = vi.fn().mockResolvedValue({ run_id: "run", display_skills: [], tool_paths: [], tool_facts: [], activity_details: ["a", "b"].map(id => ({ activity_id: id, tool_name: "mcp_call", output_preview: { text: `result-${id}`, truncated: false, redacted: false } })) })
  const boundary = { actorId: "actor", sessionId: "s", isCurrent: () => true, client: { readDisplay } } as unknown as AnswerActionBoundary
  const { rerender } = render(<LocaleProvider><ActivityInspector content={content} boundary={boundary} /></LocaleProvider>)
  await screen.findByRole("region", { name: "Result" })
  fireEvent.click(screen.getByText("Technical details"))
  expect(screen.getByText("mcp_call")).toBeVisible()
  rerender(<LocaleProvider><ActivityInspector content={{ ...content, activityId: "b", activity: { ...activity, activity_id: "b" } }} boundary={boundary} /></LocaleProvider>)
  expect(screen.getByRole("region", { name: "Result" })).toHaveTextContent("result-b")
  expect(screen.queryByText("result-a")).toBeNull()
  expect(screen.getByText("mcp_call")).not.toBeVisible()
  expect(readDisplay).toHaveBeenCalledTimes(1)
})
