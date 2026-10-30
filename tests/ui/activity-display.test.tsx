import { readFileSync } from "node:fs"
import detailStyles from "@/ui/thread/activity-detail.module.css"
import threadStyles from "@/ui/thread/thread.module.css"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import type { RunProcessActivity } from "@/contract/chat"
import { LocaleProvider } from "@/i18n/context"
import { ToolCallRow } from "@/ui/thread/tool-call-row"

afterEach(() => { cleanup(); vi.restoreAllMocks(); document.head.querySelectorAll("style[data-activity-test]").forEach((style) => style.remove()) })
const fullPath = "/.skills/cGlubmVk/references/完整目录/very-long-unbroken-result-name-abcdefghijklmnopqrstuvwxyz/SKILL.md"
const base = { activity: "tool" as const, activity_id: `act_${"a".repeat(64)}`, segment_id: `seg_${"b".repeat(64)}`, status: "completed" as const, display_code: "tool.file.read" as const }
it("does not announce legacy MCP execution completion as a verified successful result", () => {
  const activity = { ...base, display_code: "tool.mcp.call" as const }
  const { rerender } = render(<LocaleProvider><ToolCallRow activity={activity} onInspect={() => {}} /></LocaleProvider>)
  expect(screen.getByRole("button", { name: /Call ended$/ })).toBeVisible()
  expect(screen.queryByText("Completed")).toBeNull()
  rerender(<LocaleProvider><ToolCallRow activity={{ ...activity, status: "failed" }} onInspect={() => {}} /></LocaleProvider>)
  expect(screen.getByRole("button", { name: /Failed$/ })).toBeVisible()
  expect(screen.queryByText("Call ended")).toBeNull()
  rerender(<LocaleProvider><ToolCallRow activity={{ ...activity, status: "running" }} onInspect={() => {}} /></LocaleProvider>)
  expect(screen.getByRole("button", { name: /Running$/ })).toBeVisible()
})
it("keeps the file action row concise while preserving the exact path in its title", () => {
  const fetch = vi.spyOn(globalThis, "fetch")
  const activity = { ...base, display_detail: { kind: "file" as const, name: "SKILL.md", virtual_path: fullPath } }
  const { container, rerender } = render(<LocaleProvider><ToolCallRow activity={activity} continuation={<button>Continue fixture</button>} /></LocaleProvider>)
  const path = screen.getByText("SKILL.md")
  expect(path).toBeVisible()
  expect(path.parentElement).toHaveAttribute("title", expect.stringContaining(fullPath))
  expect(container.querySelector("a")).toBeNull()
  expect(screen.queryByText(fullPath)).toBeNull()
  const continuation = screen.getByRole("button", { name: "Continue fixture" })
  continuation.focus()
  expect(continuation).toHaveFocus()
  rerender(<LocaleProvider><ToolCallRow activity={{ ...activity, status: "failed" }} continuation={<button>Continue fixture</button>} /></LocaleProvider>)
  expect(screen.getByRole("button", { name: "Continue fixture" })).toBe(continuation)
  expect(continuation).toHaveFocus()
  expect(container.querySelector('[data-status="failed"]')).not.toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})
it("keeps real MCP name, original failure and legacy basename without inventing a path", () => {
  const activity: Extract<RunProcessActivity, { activity: "tool" }> = { ...base, status: "failed", display_code: "tool.mcp.call", display_detail: { kind: "mcp_tool", name: "actual_public_tool" } }
  const { rerender, container } = render(<LocaleProvider><ToolCallRow activity={activity} /></LocaleProvider>)
  expect(screen.getByText("actual_public_tool")).toBeVisible()
  expect(container.querySelector('[data-status="failed"]')).not.toBeNull()
  expect(container.querySelectorAll("button,a,[tabindex]")).toHaveLength(0)
  rerender(<LocaleProvider><ToolCallRow activity={{ ...base, display_detail: { kind: "file", name: "SKILL.md" } }} /></LocaleProvider>)
  expect(screen.getByText("SKILL.md")).toBeVisible()
  expect(screen.queryByText(fullPath)).toBeNull()
})

it("shows each real Skill name, optional exact revision and full path without catalog or fabricated versions", async () => {
  const { SkillActivityRow } = await import("@/ui/thread/skill-activity-row")
  const facts = [
    { source_ref: "skill:first", name: "native-package", virtual_path: "/.skills/Zmlyc3Q/SKILL.md", revision: "9007199254740993" },
    { source_ref: "skill:second", name: "native-package", virtual_path: "/.skills/c2Vjb25k/SKILL.md" },
  ]
  const activity = { activity: "skill" as const, activity_id: `act_${"c".repeat(64)}`, preflight_id: `spf_${"d".repeat(64)}`, source_refs: facts.map((fact) => fact.source_ref), phase: "ready" as const, display_skills: facts }
  const { container, rerender } = render(<LocaleProvider><SkillActivityRow activity={activity} /></LocaleProvider>)
  expect(screen.getAllByText("native-package")).toHaveLength(2)
  expect(screen.getByText("v9007199254740993")).toBeVisible()
  expect(screen.queryByText("v0")).toBeNull()
  expect(screen.getByText(facts[0]!.virtual_path)).toBeVisible()
  expect(screen.getByText(facts[1]!.virtual_path)).toBeVisible()
  expect(container.querySelectorAll("li")).toHaveLength(2)
  expect(container.querySelector("a")).toBeNull()
  rerender(<LocaleProvider><SkillActivityRow activity={{ ...activity, display_skills: undefined }} /></LocaleProvider>)
  expect(screen.queryByText("native-package")).toBeNull()
  expect(container.querySelector('[data-status="ready"]')).not.toBeNull()
  rerender(<LocaleProvider><SkillActivityRow activity={{ ...activity, phase: "failed", display_skills: undefined, error_code: "skill_load_failed" }} /></LocaleProvider>)
  expect(container.querySelector('[data-status="failed"]')).not.toBeNull()
  expect(container.querySelectorAll("li")).toHaveLength(0)
})

function attachModuleCss(path: string, classes: Record<string, string>) {
  let css = readFileSync(new URL(path, import.meta.url), "utf8")
  const names = new Set([...css.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/gu)].map((match) => match[1]!))
  for (const name of names) css = css.replace(new RegExp(`\\.${name}(?![A-Za-z0-9_-])`, "gu"), `.${classes[name] ?? name}`)
  const style = document.createElement("style")
  style.dataset.activityTest = "true"
  style.textContent = css
  document.head.appendChild(style)
}

it("keeps concise file rows stable in a narrow reading column", () => {
  attachModuleCss("../../src/ui/thread/thread.module.css", threadStyles)
  const activity = { ...base, display_detail: { kind: "file" as const, name: "SKILL.md", virtual_path: fullPath } }
  render(<LocaleProvider><div style={{ width: 180 }}><ToolCallRow activity={activity} /></div></LocaleProvider>)
  const target = screen.getByText("SKILL.md")
  attachModuleCss("../../src/ui/thread/activity-detail.module.css", detailStyles)
  const line = target.parentElement!
  expect(getComputedStyle(line).whiteSpace).toBe("nowrap")
  expect(getComputedStyle(line).overflow).toBe("hidden")
  expect(getComputedStyle(line).textOverflow).toBe("ellipsis")
  expect(line).toHaveAttribute("title", expect.stringContaining(fullPath))
})

it("keeps a long public action title compact without losing its full accessible name or exact inspection target", () => {
  attachModuleCss("../../src/ui/thread/thread.module.css", threadStyles)
  attachModuleCss("../../src/ui/thread/activity-detail.module.css", detailStyles)
  const action_title = "读取 DeepWiki 中 langchain-ai/langgraph 的文档目录并核实状态图相关页面的位置"
  const onInspect = vi.fn()
  render(<LocaleProvider><div style={{ width: 180 }}><ToolCallRow activity={{ ...base, action_title, display_detail: { kind: "file", name: "SKILL.md", virtual_path: fullPath } }} onInspect={onInspect} /></div></LocaleProvider>)
  const row = screen.getByRole("button", { name: `${action_title}Completed` })
  const line = screen.getByTitle(action_title)
  expect(getComputedStyle(line).whiteSpace).toBe("nowrap")
  expect(getComputedStyle(line).overflow).toBe("hidden")
  expect(getComputedStyle(line).textOverflow).toBe("ellipsis")
  expect(getComputedStyle(row).alignItems).toBe("center")
  expect(row).toHaveTextContent(action_title)
  row.focus()
  expect(row).toHaveFocus()
  row.click()
  expect(onInspect).toHaveBeenCalledExactlyOnceWith(base.activity_id)
})

it("keeps generic file verbs out of the main row while retaining the exact path in the title", () => {
  const path = "/qa-public-stages-20261028.md"
  render(<LocaleProvider><ToolCallRow activity={{ ...base, display_code: "tool.file.write", action_title: `Write file ${path}`, display_detail: { kind: "file", name: "qa-public-stages-20261028.md", virtual_path: path } }} /></LocaleProvider>)
  expect(screen.getByText("qa-public-stages-20261028.md")).toBeVisible()
  expect(screen.getByText("qa-public-stages-20261028.md").parentElement).toHaveAttribute("title", path)
  expect(screen.queryByText(new RegExp(`Write file.*${path}`))).toBeNull()
})

it.each([
  ["tool.file.read", "查看文件 /qa/read.md"],
  ["tool.file.write", "编辑文件 /qa/edit.md"],
  ["tool.file.deliver", "提交成果 /qa/deliver.md"],
  ["tool.file.read", "read file /qa/read-en.md"],
] as const)("does not surface generic file wording: %s", (display_code, action_title) => {
  const name = action_title.includes("read-en") ? "read-en.md" : action_title.split("/").at(-1)!
  render(<LocaleProvider><ToolCallRow activity={{ ...base, display_code, action_title, display_detail: { kind: "file", name, virtual_path: `/qa/${name}` } }} /></LocaleProvider>)
  expect(screen.getByText(name)).toBeVisible()
  expect(screen.queryByText(action_title)).toBeNull()
})

it("reads the original call intent as the main line without repeating selectors or parameters", () => {
  const onInspect = vi.fn()
  const action_title = "检查 LangGraph 的节点与状态如何连接"
  const { container, rerender } = render(<LocaleProvider><ToolCallRow activity={{ ...base, display_code: "tool.mcp.call", action_title, display_detail: { kind: "mcp_tool", name: "read_wiki_structure" } }} detail={{ activity_id: base.activity_id, tool_name: "mcp_call", input_preview: { text: '{"repo":"langchain-ai/langgraph"}', truncated: false, redacted: false } }} onInspect={onInspect} /></LocaleProvider>)
  const row = screen.getByRole("button", { name: new RegExp(action_title) })
  expect(row).toHaveTextContent(action_title)
  expect(screen.queryByText("read_wiki_structure")).toBeNull()
  expect(screen.queryByText("langchain-ai/langgraph")).toBeNull()
  expect(screen.queryByText("Call tool")).toBeNull()
  expect(container.querySelector("a")).toBeNull()
  row.click(); expect(onInspect).toHaveBeenCalledExactlyOnceWith(base.activity_id)
  rerender(<LocaleProvider><ToolCallRow activity={{ ...base, action_title, status: "failed" }} onInspect={onInspect} /></LocaleProvider>)
  expect(screen.getByRole("button", { name: new RegExp(action_title) })).toBe(row)
  expect(container.querySelector('[data-status="failed"]')).not.toBeNull()
})

it("shows a legacy MCP operation and exact object without inventing intent or exposing argument prose", () => {
  render(<LocaleProvider><ToolCallRow activity={{ ...base, display_code: "tool.mcp.call", display_detail: { kind: "mcp_tool", name: "ask_wiki_question" } }} detail={{ activity_id: base.activity_id, tool_name: "mcp_call", input_preview: { text: '{"repo":"langchain-ai/langgraph","question":"What is LangGraph used for?"}', truncated: false, redacted: false } }} onInspect={vi.fn()} /></LocaleProvider>)
  expect(screen.getByRole("button", { name: /^Call tool ask_wiki_question\s*Call ended$/ })).toBeVisible()
  expect(screen.getByText("Call tool")).toBeVisible()
  expect(screen.queryByText(/What is LangGraph/)).toBeNull()
})

it.each([
  ["edit_file", "file_path"],
  ["ls", "path"],
  ["glob", "path"],
  ["grep", "path"],
])("renders the same-call native %s identity and exact path instead of a generic tool row", (toolName, pathKey) => {
  render(<LocaleProvider><ToolCallRow activity={{ ...base, display_code: "tool.execution" }} detail={{ activity_id: base.activity_id, tool_name: toolName, input_preview: { text: JSON.stringify({ [pathKey!]: fullPath }), truncated: false, redacted: false } }} onInspect={vi.fn()} /></LocaleProvider>)
  const row = screen.getByRole("button")
  expect(row).toHaveTextContent("SKILL.md")
  expect(row.querySelector("[title]")).toHaveAttribute("title", expect.stringContaining(fullPath))
  expect(row).toHaveAccessibleName(/Completed$/)
  expect(screen.queryByText("Tool call")).toBeNull()
})

it.each([
  { truncated: true, redacted: false },
  { truncated: false, redacted: true },
])("does not reconstruct a path from a partial or redacted preview %o", flags => {
  render(<LocaleProvider><ToolCallRow activity={{ ...base, display_code: "tool.execution" }} detail={{ activity_id: base.activity_id, tool_name: "edit_file", input_preview: { text: JSON.stringify({ file_path: fullPath }), ...flags } }} /></LocaleProvider>)
  expect(screen.queryByText(fullPath)).toBeNull()
})

it("does not project another call's detail or misclassify an MCP named edit_file as a native edit", () => {
  const { rerender } = render(<LocaleProvider><ToolCallRow activity={{ ...base, display_code: "tool.execution" }} detail={{ activity_id: `act_${"c".repeat(64)}`, tool_name: "edit_file", target: { kind: "file", name: "SKILL.md", virtual_path: fullPath } }} /></LocaleProvider>)
  expect(screen.queryByText(fullPath)).toBeNull()
  rerender(<LocaleProvider><ToolCallRow activity={{ ...base, display_code: "tool.mcp.call", display_detail: { kind: "mcp_tool", name: "edit_file" } }} detail={{ activity_id: base.activity_id, tool_name: "mcp_call", input_preview: { text: JSON.stringify({ file_path: fullPath }), truncated: false, redacted: false } }} /></LocaleProvider>)
  expect(screen.getByText("edit_file")).toBeVisible()
  expect(screen.queryByText("Edit file")).toBeNull()
  expect(screen.queryByText(fullPath)).toBeNull()
})

it.each(['{}', '[]', 'null', '{', '{"path":"relative"}', '{"pattern":"/not-a-path"}', '{"path":"/bad\\u202Epath"}'])("does not guess the directory for an absent or invalid native input: %s", text => {
  render(<LocaleProvider><ToolCallRow activity={{ ...base, display_code: "tool.execution" }} detail={{ activity_id: base.activity_id, tool_name: "ls", input_preview: { text, truncated: false, redacted: false } }} /></LocaleProvider>)
  expect(screen.getByText("List directory")).toBeVisible()
  expect(document.querySelector('[title="/"]')).toBeNull()
  expect(document.querySelector(`.${detailStyles.inlineTarget}`)).toBeNull()
})


it("keeps repeated legacy calls independently inspectable without hiding the failed attempt", () => {
  const inspect = vi.fn()
  const activity = { ...base, display_code: "tool.mcp.call" as const, display_detail: { kind: "mcp_tool" as const, name: "ask_wiki_question" } }
  render(<LocaleProvider><ToolCallRow activity={{ ...activity, status: "failed" }} onInspect={inspect} /><ToolCallRow activity={{ ...activity, activity_id: "second-call" }} onInspect={inspect} /></LocaleProvider>)
  const failed = screen.getByRole("button", { name: /^Call tool ask_wiki_question\s*Failed$/ })
  const completed = screen.getByRole("button", { name: /^Call tool ask_wiki_question\s*Call ended$/ })
  failed.click(); completed.click()
  expect(inspect.mock.calls).toEqual([[base.activity_id], ["second-call"]])
  expect(failed).toBeVisible()
  expect(completed).toBeVisible()
})
