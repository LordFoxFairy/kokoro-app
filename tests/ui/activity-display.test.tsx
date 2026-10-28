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
it("shows the actual file virtual path by default, not just its basename or hover title", () => {
  const fetch = vi.spyOn(globalThis, "fetch")
  const activity = { ...base, display_detail: { kind: "file" as const, name: "SKILL.md", virtual_path: fullPath } }
  const { container, rerender } = render(<LocaleProvider><ToolCallRow activity={activity} continuation={<button>Continue fixture</button>} /></LocaleProvider>)
  const path = screen.getByText(fullPath)
  expect(path).toBeVisible()
  expect(path).toHaveAttribute("title", fullPath)
  expect(container.querySelector("a")).toBeNull()
  expect(screen.queryByText("SKILL.md")).toBeNull()
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

it("actual local CSS overrides legacy ellipsis so full paths remain wrapping text in a narrow reading column", () => {
  attachModuleCss("../../src/ui/thread/thread.module.css", threadStyles)
  const activity = { ...base, display_detail: { kind: "file" as const, name: "SKILL.md", virtual_path: fullPath } }
  render(<LocaleProvider><div style={{ width: 180 }}><ToolCallRow activity={activity} /></div></LocaleProvider>)
  const target = screen.getByText(fullPath)
  expect(getComputedStyle(target).whiteSpace).toBe("nowrap")
  attachModuleCss("../../src/ui/thread/activity-detail.module.css", detailStyles)
  expect(getComputedStyle(target).whiteSpace).toBe("normal")
  expect(getComputedStyle(target).overflow).toBe("visible")
  expect(getComputedStyle(target).textOverflow).toBe("clip")
  expect(getComputedStyle(target).overflowWrap).toBe("anywhere")
  expect(getComputedStyle(target.parentElement!).flexWrap).toBe("wrap")
  expect(target).toHaveTextContent(fullPath)
})
